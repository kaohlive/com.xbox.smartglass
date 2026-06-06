'use strict';

const crypto = require('crypto');
const fetch = require('node-fetch');
const { xnet } = require('@xboxreplay/xboxlive-auth');

const CLIENT_ID = '61140b49-05dd-43d2-bb43-1667ee071d45';
const REDIRECT_URI = 'https://callback.athom.com/oauth2/callback/';
const SPA_ORIGIN = 'https://callback.athom.com';
// `XboxLive.signin` requests Xbox Live access; `offline_access` (the
// Microsoft v2.0 standard scope, not the XboxLive-prefixed variant)
// is what actually causes MS to return a refresh_token. Without it
// the user appears signed in until the access_token expires and then
// can never recover without re-authorizing.
const SCOPE = 'XboxLive.signin offline_access';
const AUTHORIZE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const XSTS_RELYING_PARTY = 'http://xboxlive.com';

const REFRESH_TOKEN_KEY = 'xbl_refreshToken';
const REFRESH_TOKEN_PREV_KEY = 'xbl_refreshToken_prev';
const REFRESH_TOKEN_LAST_ROTATED_KEY = 'xbl_refreshToken_lastRotated';
const GAMERTAG_KEY = 'xbl_gamertag';
// Number of consecutive invalid_grant responses (after the prev-token
// fallback also fails) before we wipe the refresh token and force a
// re-auth. Set above 1 so a single transient hiccup at app start can't
// silently sign the user out.
const MAX_CONSECUTIVE_INVALID_GRANT = 3;

// Custom-Azure-app flow uses 'd' preamble (vs 't' for the legacy Xbox app)
const RPS_PREAMBLE = 'd';

class XboxAuth {

	constructor(homey, log = console.log, eventLog = null) {
		this.homey = homey;
		this.log = log;
		this.events = eventLog;
		this._pendingOAuth = null; // { codeVerifier, callback }
		// In-memory; resets to 0 on app restart so a reboot gives a token
		// another chance instead of inheriting accumulated strikes.
		this._consecutiveInvalidGrant = 0;
		this._memo = {
			msaAccessToken: null,
			msaAccessExpires: 0,
			userToken: null,
			userTokenExpires: 0,
			xsts: null,
			xstsExpires: 0,
			uhs: null,
			gamertag: this.homey.settings.get(GAMERTAG_KEY) || null,
		};
	}

	_event(message) {
		if (this.events) this.events.push(message);
	}

	setEventLog(eventLog) {
		this.events = eventLog;
	}

	hasRefreshToken() {
		return !!this.homey.settings.get(REFRESH_TOKEN_KEY);
	}

	getGamertag() {
		return this._memo.gamertag || this.homey.settings.get(GAMERTAG_KEY) || null;
	}

	// Start the OAuth2 flow. Returns the URL the user must visit.
	// The settings page opens this URL via Homey.openURL.
	async startAuthorization() {
		const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
		const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
		const state = base64UrlEncode(crypto.randomBytes(16));

		const params = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: 'code',
			redirect_uri: REDIRECT_URI,
			scope: SCOPE,
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			prompt: 'select_account',
		});
		const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;

		// homey.cloud.createOAuth2Callback wires the redirect_uri on
		// callback.athom.com to forward the code back to this Homey.
		// The returned object emits 'url' (the page the user should open)
		// and 'code' (when MS redirects with an auth code).
		const oauth2Callback = await this.homey.cloud.createOAuth2Callback(authorizeUrl);

		oauth2Callback.on('code', async (code) => {
			try {
				await this._exchangeCode(code, codeVerifier);
				this.homey.api.realtime('authorized', { gamertag: this.getGamertag() });
			} catch (err) {
				this.log('OAuth2 code exchange failed: ' + err.message);
				this.homey.api.realtime('auth_error', { message: err.message });
			}
		});

		return new Promise((resolve, reject) => {
			let settled = false;
			oauth2Callback.on('url', (url) => {
				if (settled) return;
				settled = true;
				resolve({ url });
			});
			// Safety: if no 'url' event arrives within 10s, fail the caller
			// rather than spinning the settings page indefinitely.
			this.homey.setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(new Error('Timed out waiting for OAuth2 callback URL'));
			}, 10000);
		});
	}

	async _exchangeCode(code, codeVerifier) {
		const body = new URLSearchParams({
			client_id: CLIENT_ID,
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT_URI,
			scope: SCOPE,
			code_verifier: codeVerifier,
		});
		const res = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				// SPA-registered Azure apps require an Origin header on the
				// token endpoint matching the redirect URI's origin.
				'Origin': SPA_ORIGIN,
			},
			body: body.toString(),
		});
		const data = await res.json();
		if (!res.ok) {
			throw new Error(`Token exchange failed: ${data.error || res.status} — ${data.error_description || ''}`);
		}
		this._memo.msaAccessToken = data.access_token;
		this._memo.msaAccessExpires = Date.now() + (data.expires_in - 60) * 1000;
		if (data.refresh_token) {
			this.homey.settings.set(REFRESH_TOKEN_KEY, data.refresh_token);
			this.homey.settings.set(REFRESH_TOKEN_LAST_ROTATED_KEY, Date.now());
			this.homey.settings.unset(REFRESH_TOKEN_PREV_KEY);
			this._consecutiveInvalidGrant = 0;
			this.log('OAuth code exchange OK, refresh_token stored');
			this._event('Auth: sign-in successful, refresh token stored');
		} else {
			this.log('OAuth code exchange OK but NO refresh_token in response — scopes returned: ' + (data.scope || 'unknown'));
			this._event('Auth: sign-in OK but NO refresh token returned (scopes: ' + (data.scope || 'unknown') + ')');
		}
		// Walk through the XSTS chain so we know the gamertag and have a usable token immediately.
		await this._refreshXstsChain();
	}

	// Refresh the MSA access token. Tries the current refresh token first;
	// on a real invalid_grant from Microsoft, falls back to the previous
	// stored refresh token (kept across one rotation) to survive
	// rotation-race / transient corruption. Only wipes the stored tokens
	// after MAX_CONSECUTIVE_INVALID_GRANT consecutive real invalid_grant
	// failures — network/5xx errors do NOT count toward that, so a flaky
	// connection at app start cannot silently sign the user out.
	async _refreshMsaAccessToken() {
		const current = this.homey.settings.get(REFRESH_TOKEN_KEY);
		if (!current) throw new Error('Not signed in');

		let data;
		try {
			data = await this._doRefreshMsa(current);
		} catch (err) {
			if (err.code !== 'invalid_grant') {
				// Network, 5xx, parse errors etc. Bubble up but do NOT
				// touch the stored token — these are not authoritative
				// "your token is dead" signals.
				this._event('Auth: refresh transient error — ' + err.message);
				throw err;
			}
			const prev = this.homey.settings.get(REFRESH_TOKEN_PREV_KEY);
			if (prev && prev !== current) {
				try {
					data = await this._doRefreshMsa(prev);
					this._event('Auth: current refresh token rejected, fell back to previous successfully');
				} catch (err2) {
					this._handleInvalidGrantStrike(err2);
					throw err2;
				}
			} else {
				this._handleInvalidGrantStrike(err);
				throw err;
			}
		}

		// Success — record tokens and reset the strike counter.
		this._consecutiveInvalidGrant = 0;
		this._memo.msaAccessToken = data.access_token;
		this._memo.msaAccessExpires = Date.now() + (data.expires_in - 60) * 1000;
		if (data.refresh_token && data.refresh_token !== current) {
			this.homey.settings.set(REFRESH_TOKEN_PREV_KEY, current);
			this.homey.settings.set(REFRESH_TOKEN_KEY, data.refresh_token);
			this.homey.settings.set(REFRESH_TOKEN_LAST_ROTATED_KEY, Date.now());
			this.log('Refresh-token rotated and stored');
			this._event('Auth: refresh token rotated');
		} else if (!data.refresh_token) {
			this.log('Token refresh OK but NO new refresh_token returned (keeping previous)');
			this._event('Auth: refresh used (no new token returned, keeping current)');
		}
	}

	async _doRefreshMsa(refreshToken) {
		const body = new URLSearchParams({
			client_id: CLIENT_ID,
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			scope: SCOPE,
		});
		const res = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Origin': SPA_ORIGIN,
			},
			body: body.toString(),
		});
		let data;
		try { data = await res.json(); } catch (_) { data = {}; }
		if (!res.ok) {
			const err = new Error('Refresh failed: ' + (data.error || res.status) + (data.error_description ? ' — ' + data.error_description : ''));
			err.code = data.error || ('http_' + res.status);
			throw err;
		}
		return data;
	}

	_handleInvalidGrantStrike(err) {
		this._consecutiveInvalidGrant++;
		if (this._consecutiveInvalidGrant >= MAX_CONSECUTIVE_INVALID_GRANT) {
			this.homey.settings.unset(REFRESH_TOKEN_KEY);
			this.homey.settings.unset(REFRESH_TOKEN_PREV_KEY);
			this.homey.settings.unset(REFRESH_TOKEN_LAST_ROTATED_KEY);
			this._consecutiveInvalidGrant = 0;
			this.log('Refresh token wiped after ' + MAX_CONSECUTIVE_INVALID_GRANT + ' consecutive invalid_grant failures');
			this._event('Auth: refresh token wiped after ' + MAX_CONSECUTIVE_INVALID_GRANT + ' consecutive invalid_grant errors — re-authorization required');
		} else {
			this._event('Auth: refresh FAILED (invalid_grant, strike ' + this._consecutiveInvalidGrant + '/' + MAX_CONSECUTIVE_INVALID_GRANT + ') — ' + (err && err.message ? err.message : ''));
		}
	}

	getTokenLastRotated() {
		const v = this.homey.settings.get(REFRESH_TOKEN_LAST_ROTATED_KEY);
		return typeof v === 'number' ? v : null;
	}

	async _refreshXstsChain() {
		// Serialize concurrent callers. With multiple Xbox devices each
		// firing _ensureSession() in parallel we previously rotated the
		// refresh_token N times during a single cold start, which both
		// thrashed the Microsoft endpoint and risked invalidating prior
		// rotations mid-flight.
		if (this._chainRefreshing) return this._chainRefreshing;
		this._chainRefreshing = this._doRefreshXstsChain()
			.finally(() => { this._chainRefreshing = null; });
		return this._chainRefreshing;
	}

	async _doRefreshXstsChain() {
		if (!this._memo.msaAccessToken || Date.now() >= this._memo.msaAccessExpires) {
			await this._refreshMsaAccessToken();
		}
		const userTokenResp = await xnet.exchangeRpsTicketForUserToken(this._memo.msaAccessToken, RPS_PREAMBLE);
		this._memo.userToken = userTokenResp.Token;
		this._memo.userTokenExpires = parseDate(userTokenResp.NotAfter);

		const xstsResp = await xnet.exchangeTokensForXSTSToken(
			{ userTokens: [this._memo.userToken] },
			{ XSTSRelyingParty: XSTS_RELYING_PARTY },
		);
		this._memo.xsts = xstsResp.Token;
		this._memo.xstsExpires = parseDate(xstsResp.NotAfter);
		const xui = xstsResp.DisplayClaims && xstsResp.DisplayClaims.xui && xstsResp.DisplayClaims.xui[0];
		this._memo.uhs = xui ? xui.uhs : null;
		this._memo.xuid = xui ? xui.xid : null;
		const gamertag = xui ? xui.gtg : null;
		if (gamertag) {
			this._memo.gamertag = gamertag;
			this.homey.settings.set(GAMERTAG_KEY, gamertag);
		}
	}

	// Returns the signed-in user's XUID (Xbox User ID), refreshing the
	// XSTS chain if needed. Resolves null when not signed in.
	async getXuid() {
		if (!this.hasRefreshToken()) return null;
		try {
			if (!this._memo.xuid || !this._memo.xsts || Date.now() >= this._memo.xstsExpires - 60_000) {
				await this._refreshXstsChain();
			}
			return this._memo.xuid;
		} catch (err) {
			this.log('getXuid: chain refresh failed: ' + err.message);
			return null;
		}
	}

	// Return an Authorization header value usable against titlehub etc.
	// Refreshes the chain as needed. Throws if there is no usable refresh token.
	async getAuthHeader() {
		if (!this._memo.xsts || Date.now() >= this._memo.xstsExpires - 60_000 || !this._memo.uhs) {
			await this._refreshXstsChain();
		}
		return `XBL3.0 x=${this._memo.uhs};${this._memo.xsts}`;
	}

	// Return the raw user hash + XSTS JWT so the SmartGlass connect can
	// upgrade the session from anonymous to authenticated. Resolves null
	// (rather than throwing) when there is no refresh token or the chain
	// can't be refreshed — the caller falls back to an anonymous connect.
	async getCredentials() {
		if (!this.hasRefreshToken()) return null;
		try {
			if (!this._memo.xsts || Date.now() >= this._memo.xstsExpires - 60_000 || !this._memo.uhs) {
				await this._refreshXstsChain();
			}
			if (!this._memo.uhs || !this._memo.xsts) return null;
			return { uhs: this._memo.uhs, jwt: this._memo.xsts };
		} catch (err) {
			this.log('getCredentials: chain refresh failed, falling back to anonymous: ' + err.message);
			return null;
		}
	}

	async getStatus() {
		const hasRefresh = this.hasRefreshToken();
		if (!hasRefresh) return { authenticated: false };
		const tokenLastRotated = this.getTokenLastRotated();
		// Try to obtain a fresh auth header — if that succeeds we know
		// the stored refresh token is still good.
		try {
			await this.getAuthHeader();
			return { authenticated: true, gamertag: this.getGamertag(), tokenLastRotated };
		} catch (err) {
			return { authenticated: false, error: err.message, tokenLastRotated };
		}
	}

	signOut() {
		this.homey.settings.unset(REFRESH_TOKEN_KEY);
		this.homey.settings.unset(REFRESH_TOKEN_PREV_KEY);
		this.homey.settings.unset(REFRESH_TOKEN_LAST_ROTATED_KEY);
		this.homey.settings.unset(GAMERTAG_KEY);
		this._consecutiveInvalidGrant = 0;
		this._memo = {
			msaAccessToken: null,
			msaAccessExpires: 0,
			userToken: null,
			userTokenExpires: 0,
			xsts: null,
			xstsExpires: 0,
			uhs: null,
			gamertag: null,
		};
		this._event('Auth: signed out');
	}

	// Manually accept a refresh token. Used by the "advanced" paste fallback
	// in settings/index.html for environments where callback.athom.com is
	// unreachable, and for one-shot migration from the legacy paste flow.
	async setRefreshTokenManually(refreshToken) {
		if (!refreshToken || typeof refreshToken !== 'string') {
			throw new Error('Refresh token must be a non-empty string');
		}
		this.homey.settings.set(REFRESH_TOKEN_KEY, refreshToken.trim());
		this.homey.settings.unset(REFRESH_TOKEN_PREV_KEY);
		this.homey.settings.unset(REFRESH_TOKEN_LAST_ROTATED_KEY);
		this._consecutiveInvalidGrant = 0;
		this._memo.msaAccessToken = null;
		this._memo.msaAccessExpires = 0;
		this._memo.xsts = null;
		this._memo.xstsExpires = 0;
		// Validate immediately so the user finds out the token is bad here,
		// not three days later when an album cover doesn't load.
		await this.getAuthHeader();
		return { gamertag: this.getGamertag() };
	}
}

function base64UrlEncode(buf) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseDate(value) {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = XboxAuth;
