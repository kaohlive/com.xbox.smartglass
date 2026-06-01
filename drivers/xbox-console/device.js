'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');
const fetch = require('node-fetch');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');

const defaultAlbumArtImage = '/assets/images/{0}.png';
const DISCOVERY_POLL_MS = 20000;
const CHANNEL_OPEN_TIMEOUT_MS = 15000;
const SESSION_IDLE_DISCONNECT_MS = 60000;

class XBoxDevice extends Homey.Device {

	async onInit() {
		this.device = {};
		this.device.name = this.getData().name;
		this.device.liveId = this.getSettings().liveid;
		this.device.currentApp = { 'appStoreId': null };
		this.device.powered = false;
		this.device.appImage = await this.homey.images.createImage();
		this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'App'));
		await this.setAlbumArtImage(this.device.appImage);

		this._driver = this.driver;
		this._buildClient();

		if (this.getSettings().console_address == '')
			await this.setSettings({ console_address: this.getData().address + '' });
		this.device.address = this.getSettings().console_address;

		// v0.7.2: track_active_app default flipped to true once we learned
		// that a session by itself does not wake the console — only adding
		// SystemInputChannel does. Devices added on v0.6.0–v0.7.1 have the
		// old default (false) stored; migrate them once so the 'app playing
		// changed' trigger and album art work without manual settings tweaks.
		if (!this.getStoreValue('migrated_track_active_app')) {
			if (this.getSettings().track_active_app !== true) {
				await this.setSettings({ track_active_app: true });
				this.log('Migrated track_active_app to true');
			}
			await this.setStoreValue('migrated_track_active_app', true);
		}

		this.log('[' + this.device.name + '] XBoxDevice (' + this.device.liveId + ':' + this.device.address + ') has been loaded');

		await this._setup();
	}

	_buildClient() {
		this.client = this._guardedSmartglass();
		this._wireClientEvents();
	}

	// Build a Smartglass client whose 'receive' listener is wrapped in
	// try/catch. The abandoned upstream library can't parse some packets
	// emitted by newer Xbox firmware and the resulting throw originates
	// inside a dgram 'message' callback — without this guard it becomes
	// an uncaughtException that crashes the whole Homey app process.
	//
	// On Series X firmware the same malformed packet arrives every ~500ms,
	// so we throttle the warning to once per 60s with a tail count, to
	// keep the Homey app log usable while still flagging the situation.
	_guardedSmartglass() {
		const client = Smartglass();
		const events = client && client._events;
		if (events && typeof events.listeners === 'function') {
			const existing = events.listeners('receive');
			events.removeAllListeners('receive');
			const log = this.log.bind(this);
			let lastWarnAt = 0;
			let suppressedSinceWarn = 0;
			events.on('receive', function (message, xbox, remote, smartglass) {
				for (const listener of existing) {
					try {
						listener.call(this, message, xbox, remote, smartglass);
					} catch (err) {
						const now = Date.now();
						if (now - lastWarnAt > 60_000) {
							const detail = err && err.message ? err.message : String(err);
							const suffix = suppressedSinceWarn > 0
								? ' (' + suppressedSinceWarn + ' similar suppressed since last warning)'
								: '';
							log('Dropped malformed Xbox packet: ' + detail + suffix);
							lastWarnAt = now;
							suppressedSinceWarn = 0;
						} else {
							suppressedSinceWarn++;
						}
					}
				}
			});
		}
		return client;
	}

	_wireClientEvents() {
		this.client.on('_on_timeout', () => {
			this.log('SmartGlass session timed out');
			this._handleSessionLost();
		});

		this.client.on('_on_console_status', () => {
			this.checkActiveApp().catch((err) => this.log('checkActiveApp failed: ' + err.message));
		});
	}

	async _setup() {
		await this._registerCapability();
		this._startDiscoveryLoop();
		this.setAvailable();

		if (this._shouldTrackActiveApp()) {
			this._ensureSession().catch((err) => this.log('Initial session failed: ' + err.message));
		}
	}

	_shouldTrackActiveApp() {
		return this.getSettings().track_active_app === true;
	}

	async onSettings({ newSettings, changedKeys }) {
		if (changedKeys.includes('track_active_app')) {
			if (newSettings.track_active_app) {
				this._ensureSession().catch((err) => this.log('Session start after settings change failed: ' + err.message));
			} else {
				this._teardownSession('track_active_app disabled');
			}
		}
		if (changedKeys.includes('console_address')) {
			this.device.address = newSettings.console_address;
		}
	}

	async _registerCapability() {
		const capsToEnsure = [
			'onoff', 'speaker_playing', 'speaker_next', 'speaker_prev', 'speaker_artist',
			'controller_nexus', 'controller_Y', 'controller_X', 'controller_B', 'controller_A',
			'controller_Menu', 'controller_View', 'controller_Up', 'controller_Down',
			'controller_Left', 'controller_Right'
		];
		for (const cap of capsToEnsure) {
			if (!this.hasCapability(cap)) await this.addCapability(cap);
		}

		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this.registerCapabilityListener('speaker_playing', this.onCapabilitySpeakerPlaying.bind(this));
		this.registerCapabilityListener('speaker_next', this.onCapabilitySpeakerNext.bind(this));
		this.registerCapabilityListener('speaker_prev', this.onCapabilitySpeakerPrev.bind(this));
		this.registerCapabilityListener('controller_nexus', (v) => this._handleButtonCap('controller_nexus', 'nexus', v));
		this.registerCapabilityListener('controller_Y', (v) => this._handleButtonCap('controller_Y', 'y', v));
		this.registerCapabilityListener('controller_X', (v) => this._handleButtonCap('controller_X', 'x', v));
		this.registerCapabilityListener('controller_B', (v) => this._handleButtonCap('controller_B', 'b', v));
		this.registerCapabilityListener('controller_A', (v) => this._handleButtonCap('controller_A', 'a', v));
		this.registerCapabilityListener('controller_Menu', (v) => this._handleButtonCap('controller_Menu', 'menu', v));
		this.registerCapabilityListener('controller_View', (v) => this._handleButtonCap('controller_View', 'view', v));
		this.registerCapabilityListener('controller_Up', (v) => this._handleButtonCap('controller_Up', 'up', v));
		this.registerCapabilityListener('controller_Down', (v) => this._handleButtonCap('controller_Down', 'down', v));
		this.registerCapabilityListener('controller_Left', (v) => this._handleButtonCap('controller_Left', 'left', v));
		this.registerCapabilityListener('controller_Right', (v) => this._handleButtonCap('controller_Right', 'right', v));
	}

	_startDiscoveryLoop() {
		if (this._discoveryInterval) return;
		this._discoveryInterval = this.homey.setInterval(() => {
			this._pollOnline().catch((err) => this.log('Discovery poll failed: ' + err.message));
		}, DISCOVERY_POLL_MS);
		// fire one immediately so initial state isn't stale for 20s
		this._pollOnline().catch((err) => this.log('Initial discovery failed: ' + err.message));
	}

	// Discovery-only: a passive UDP probe. Does not open a session, does not
	// send input messages, does not signal user-interaction to the console.
	// Safe to run while the console is doing silent installs at night.
	async _pollOnline() {
		if (!this.device.address) return;
		// Each discovery needs a fresh smartglass client because the lib
		// closes the socket after every call. If we have a live session
		// we skip the probe entirely — the session itself tells us we're up.
		if (this.client && this.client._connection_status) return;

		const probe = this._guardedSmartglass();
		let consoles = [];
		try {
			consoles = await probe.discovery(this.device.address);
		} catch (err) {
			this.log('Discovery error: ' + err.message);
		}
		const online = Array.isArray(consoles) && consoles.length > 0;
		this._applyPowerState(online);

		if (online && this._shouldTrackActiveApp() && !this.client._connection_status) {
			this._ensureSession().catch((err) => this.log('Auto-session failed: ' + err.message));
		}
	}

	_applyPowerState(online) {
		if (online === this.device.powered) return;
		this.device.powered = online;
		this.setIfHasCapability('onoff', online);
		if (online) {
			this._driver.triggerConsoleOn(this);
		} else {
			this._driver.triggerConsoleOff(this);
			this.setIfHasCapability('speaker_artist', '');
			this.device.currentApp = { 'appStoreId': null };
			this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'App'));
			this.device.appImage.update().catch(() => {});
		}
	}

	// Open a SmartGlass session if we don't have one. Resolves once the
	// connection is established. Rejects if the console is not reachable.
	//
	// If the user is signed in via Microsoft (xboxauth) we pass the Xbox
	// Live user hash + XSTS JWT to the connect, which the console accepts
	// as an authenticated session. Authenticated sessions can do owner
	// actions like power off; anonymous sessions are silently ignored for
	// shutdown but work fine for buttons and media. Falls back to anonymous
	// if credentials are unavailable.
	_ensureSession() {
		if (this.client && this.client._connection_status) return Promise.resolve();
		if (this._sessionConnecting) return this._sessionConnecting;
		if (!this.device.address) return Promise.reject(new Error('No console address configured'));

		// Assign synchronously before any await, so concurrent callers
		// see the in-flight promise and don't kick off a duplicate connect.
		this._sessionConnecting = this._doConnect()
			.finally(() => { this._sessionConnecting = null; });
		return this._sessionConnecting;
	}

	async _doConnect() {
		// If a prior client was torn down we need a fresh one (the lib closes
		// its socket on disconnect/timeout).
		if (!this.client || this.client._socket === false) {
			this._buildClient();
		}

		let creds = null;
		try {
			const auth = this.homey.app.getAuth && this.homey.app.getAuth();
			if (auth) creds = await auth.getCredentials();
		} catch (err) {
			this.log('Could not fetch Xbox Live credentials, will connect anonymously: ' + err.message);
		}

		try {
			await (creds
				? this.client.connect(this.device.address, creds.uhs, creds.jwt)
				: this.client.connect(this.device.address));
		} catch (err) {
			const msg = (err && (err.message || err.error)) ? (err.message || err.error) : JSON.stringify(err);
			this.log('Connect failed: ' + msg);
			throw err;
		}

		const mode = creds ? 'authenticated' : 'anonymous';
		this.log('SmartGlass session established with ' + this.device.address + ' (' + mode + ')');
		if (this.client._console && typeof this.client._console.getLiveid === 'function') {
			const liveid = this.client._console.getLiveid();
			this.device.liveId = liveid;
			this.setSettings({ liveid }).catch(() => {});
		}
		this.client.addManager('system_media', SystemMediaChannel());
		this._applyPowerState(true);
		this._armIdleDisconnect();
	}

	// Open the SystemInputChannel and await its ready state. The library's
	// channel_manager.open() waits for an _on_console_status event before
	// sending start_channel_request, but console_status arrives only every
	// 5-30s in steady state — that's why the original 25s sleep existed and
	// why our previous 10s race timed out frequently. We bypass that wait
	// and send start_channel_request immediately, since the session is
	// already established by the time we get here.
	async _ensureInputChannel() {
		await this._ensureSession();
		const existing = this.client.getManager('system_input');
		if (existing && existing._channel_manager && existing._channel_manager.getStatus()) {
			return existing;
		}

		if (this._inputChannelOpening) return this._inputChannelOpening;

		const channel = existing || SystemInputChannel();
		const channelClientId = this.client._managers_num;
		if (!existing) {
			this.client._managers['system_input'] = channel;
			this.client._managers_num++;
		}

		this._inputChannelOpening = this._openChannelDirect(channel, channelClientId)
			.then(() => channel)
			.catch((err) => {
				// Clear the half-installed manager so a retry can start fresh.
				delete this.client._managers['system_input'];
				throw err;
			})
			.finally(() => {
				this._inputChannelOpening = null;
			});

		return this._inputChannelOpening;
	}

	// Send a no-op gamepad packet so the Xbox finishes binding its input
	// handler before the user's actual button command arrives. Resolves
	// regardless of send errors — this is a best-effort warm-up, not a
	// hard requirement for channel readiness.
	_primeInputChannel(cm) {
		return new Promise((resolve) => {
			try {
				const Packer = require('xbox-smartglass-core-node/src/packet/packer');
				const primer = Packer('message.gamepad');
				primer.set('timestamp', Buffer.from('000' + Date.now().toString(), 'hex'));
				primer.set('buttons', 0);
				primer.setChannel(cm._channel_server_id);
				this.client._console.get_requestnum();
				const message = primer.pack(this.client._console);
				this.client._send(message);
				this.log('Sent input channel primer');
			} catch (err) {
				this.log('Primer send failed (non-fatal): ' + err.message);
			}
			this.homey.setTimeout(resolve, 250);
		});
	}

	// Direct channel opener: sends start_channel_request right away and
	// listens for start_channel_response, with proper listener cleanup so
	// repeated attempts don't pile up handlers on this.client._events.
	_openChannelDirect(channel, channelClientId) {
		return new Promise((resolve, reject) => {
			const cm = channel._channel_manager;
			cm._channel_client_id = channelClientId;
			cm._smartglass = this.client;
			cm._xbox = this.client._console;

			let settled = false;
			let timer = null;

			const cleanup = () => {
				if (timer) this.homey.clearTimeout(timer);
				this.client._events.removeListener('_on_start_channel_response', onResponse);
			};

			const onResponse = (message) => {
				const payload = message && message.packet_decoded && message.packet_decoded.protected_payload;
				if (!payload || payload.channel_request_id != channelClientId) return;
				if (settled) return;
				settled = true;
				cleanup();
				if (payload.result == 0) {
					cm._channel_status = true;
					cm._channel_server_id = payload.target_channel_id;
					this.log('Input channel ready (request_id=' + channelClientId + ')');
					// Prime the channel: the Xbox needs ~250ms after start_channel_response
					// to bind its input handler. Without this the first real button press
					// is dropped and the user has to press again. We send an all-buttons-
					// released gamepad packet so the binding completes on a no-op state.
					this._primeInputChannel(cm).then(resolve, resolve);
				} else {
					reject(new Error('Console rejected channel open, result=' + payload.result));
				}
			};

			timer = this.homey.setTimeout(() => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(new Error('SystemInput channel open timed out after ' + CHANNEL_OPEN_TIMEOUT_MS + 'ms'));
			}, CHANNEL_OPEN_TIMEOUT_MS);

			this.client._events.on('_on_start_channel_response', onResponse);

			try {
				const Packer = require('xbox-smartglass-core-node/src/packet/packer');
				const channelRequest = Packer('message.start_channel_request');
				channelRequest.set('channel_request_id', channelClientId);
				channelRequest.set('title_id', 0);
				channelRequest.set('service', Buffer.from(cm._udid, 'hex'));
				channelRequest.set('activity_id', 0);
				this.client._console.get_requestnum();
				const channelMessage = channelRequest.pack(this.client._console);
				this.client._send(channelMessage);
				this.log('Sent start_channel_request for SystemInput (request_id=' + channelClientId + ')');
			} catch (err) {
				if (settled) return;
				settled = true;
				cleanup();
				reject(new Error('Could not send start_channel_request: ' + err.message));
			}
		});
	}

	_armIdleDisconnect() {
		if (this._shouldTrackActiveApp()) return;
		if (this._idleTimer) this.homey.clearTimeout(this._idleTimer);
		this._idleTimer = this.homey.setTimeout(() => {
			this._teardownSession('idle');
		}, SESSION_IDLE_DISCONNECT_MS);
	}

	_teardownSession(reason) {
		if (this._idleTimer) {
			this.homey.clearTimeout(this._idleTimer);
			this._idleTimer = null;
		}
		if (this.client && this.client._connection_status) {
			try {
				this.client.disconnect();
				this.log('SmartGlass session closed (' + reason + ')');
			} catch (err) {
				this.log('Disconnect error: ' + (err && err.message ? err.message : err));
			}
		}
	}

	_handleSessionLost() {
		this.setIfHasCapability('speaker_artist', '');
		this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'App'));
		this.device.appImage.update().catch(() => {});
		// Don't flip onoff here — discovery loop will tell us if the box is
		// actually off vs just disconnected. A timeout can mean the console
		// went idle, not powered off.
	}

	async checkActiveApp() {
		const newAppId = this.client.getActiveApp();
		if (!newAppId) return;
		if (this.device.currentApp.appStoreId === newAppId) return;

		this.log('Active app changed: ' + newAppId);
		const pfn = newAppId.split('!')[0];
		const appInfo = await require('../../lib/titlehub.js').GetappTitleBatch(pfn, this.homey);
		this.log('titlehub for ' + pfn + ' → ' + (appInfo && appInfo.result ? 'name="' + appInfo.name + '" image=' + appInfo.displayImage : 'no result' + (appInfo && appInfo.name ? ' (' + appInfo.name + ')' : '')));

		let appName = pfn;
		let appImageUrl = defaultAlbumArtImage.replace('{0}', 'App');

		if (appInfo && appInfo.result && appInfo.displayImage) {
			appImageUrl = appInfo.displayImage;
			appName = appInfo.name;
			this._setAppImageFromUrl(appInfo.displayImage);
		} else {
			if (appName.indexOf('_8wekyb3d8bbwe') > 0) {
				appName = appName.substring(0, appName.indexOf('_8wekyb3d8bbwe'));
				appName = appName.substring(appName.indexOf('.Xbox') + 6);
				if (['Dashboard', 'LiveTV', 'Settings'].includes(appName)) {
					this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', appName));
				} else {
					this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'App'));
				}
			} else {
				appName = appName.substring(0, appName.indexOf('_'));
				this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'Game'));
				this._driver.triggerGameStarted(this);
			}
			try {
				await this.device.appImage.update();
			} catch (err) {
				this.log('appImage.update() (path) failed: ' + (err && err.message ? err.message : err));
			}
		}

		this.setIfHasCapability('speaker_artist', appName);
		this._driver.triggerAppChange(this, {
			new_app_name: appName,
			new_app_family_id: newAppId,
			new_app_art_url: appImageUrl,
			new_app_art_image: this.device.appImage,
		});
		this.device.currentApp.appStoreId = newAppId;
	}

	// Wire up a streaming source for the album art image and force Homey to
	// re-pull it. Surfaces fetch/pipe errors in the log instead of silently
	// swallowing them, so titlehub or CDN failures are diagnosable.
	_setAppImageFromUrl(url) {
		this.device.appImage.setStream(async (stream) => {
			this.log('appImage stream: fetching ' + url);
			let res;
			try {
				res = await fetch(url);
			} catch (err) {
				this.log('appImage stream: fetch threw: ' + (err && err.message ? err.message : err));
				throw err;
			}
			if (!res.ok) {
				this.log('appImage stream: fetch returned status ' + res.status);
				throw new Error('Image fetch returned status ' + res.status);
			}
			return res.body.pipe(stream);
		});
		this.device.appImage.update()
			.then(() => this.log('appImage.update() OK'))
			.catch((err) => this.log('appImage.update() (stream) failed: ' + (err && err.message ? err.message : err)));
	}

	sendLaunchAppMessage(/* appname */) {
		// TitleLaunch packet construction is not implemented in the upstream
		// library. Returning false so flow cards surface the failure rather
		// than reporting bogus success.
		return false;
	}

	async sendControllerButton(button) {
		try {
			const channel = await this._ensureInputChannel();
			await channel.sendCommand(button);
			this._armIdleDisconnect();
			return true;
		} catch (err) {
			const msg = err && err.message ? err.message : (err && err.error ? err.error : String(err));
			this.log('sendControllerButton(' + button + ') failed: ' + msg);
			return false;
		}
	}

	async sendMediaButton(button) {
		try {
			await this._ensureSession();
			const mgr = this.client.getManager('system_media');
			if (!mgr) {
				this.log('system_media manager not available');
				return false;
			}
			mgr.sendCommand(button);
			this._armIdleDisconnect();
			return true;
		} catch (err) {
			const msg = err && err.message ? err.message : String(err);
			this.log('sendMediaButton(' + button + ') failed: ' + msg);
			return false;
		}
	}

	_handleButtonCap(capName, button, value) {
		this.setIfHasCapability(capName, value);
		return this.sendControllerButton(button).then((ok) => {
			if (!ok) throw new Error('Button press failed: ' + button);
		});
	}

	async onCapabilitySpeakerPlaying(value) {
		this.setIfHasCapability('speaker_playing', value);
		const ok = await this.sendMediaButton(value ? 'play' : 'pause');
		if (!ok) throw new Error('Media command failed');
	}

	async onCapabilitySpeakerNext(value) {
		const ok = await this.sendMediaButton('next_track');
		if (ok) this.setIfHasCapability('speaker_next', value);
	}

	async onCapabilitySpeakerPrev(value) {
		const ok = await this.sendMediaButton('prev_track');
		if (ok) this.setIfHasCapability('speaker_prev', value);
	}

	async onCapabilityOnoff(value) {
		this.setIfHasCapability('onoff', value);
		if (value) {
			if (this.client && this.client._connection_status) {
				this.log('Already on');
				return;
			}
			this.log('Powering on: ' + this.device.liveId + '@' + this.device.address);
			// Fresh client for power-on; this sends UDP magic packets and
			// then runs a discovery to verify. Doesn't open a session.
			const booter = this._guardedSmartglass();
			try {
				await booter.powerOn({ live_id: this.device.liveId, tries: 5, ip: this.device.address });
				this.log('Console booted');
				this._driver.triggerConsoleOn(this);
				this.device.powered = true;
				if (this._shouldTrackActiveApp()) {
					this._ensureSession().catch((err) => this.log('Post-boot session failed: ' + err.message));
				}
			} catch (err) {
				const msg = err && (err.error || err.message) ? (err.error || err.message) : JSON.stringify(err);
				throw new Error('Boot failed: ' + msg);
			}
		} else {
			if (!this.client || !this.client._connection_status) {
				try {
					await this._ensureSession();
				} catch (err) {
					this.log('Cannot power off, no session: ' + err.message);
					throw new Error('Power off failed: no session — ' + err.message);
				}
			}
			try {
				await this._powerOffRobust();
				this.log('Power off command sent to ' + this.device.liveId);
				this._driver.triggerConsoleOff(this);
				this.device.powered = false;
				this.setIfHasCapability('speaker_artist', '');
				this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}', 'App'));
				this.device.appImage.update().catch(() => {});
			} catch (err) {
				throw new Error('Shutdown failed: ' + (err && err.error ? err.error : err.message || err));
			}
		}
	}

	// Send the power_off packet directly, 3x with 200ms gaps so a single
	// dropped UDP datagram doesn't silently no-op the shutdown. The
	// upstream powerOff() helper only sends once and immediately
	// disconnects, which we replicate at the end.
	async _powerOffRobust() {
		if (!this.client || !this.client._connection_status || !this.client._console) {
			throw new Error('not connected');
		}
		const liveId = this.client._console._liveid || this.device.liveId;
		if (!liveId) throw new Error('no liveid');
		this.log('Sending power_off packet (liveid=' + liveId + ')');

		const Packer = require('xbox-smartglass-core-node/src/packet/packer');
		const sendOnce = (attempt) => {
			try {
				this.client._console.get_requestnum();
				const pkt = Packer('message.power_off');
				pkt.set('liveid', liveId);
				const message = pkt.pack(this.client._console);
				this.client._send(message);
				this.log('power_off packet sent (attempt ' + attempt + ')');
			} catch (err) {
				this.log('power_off pack/send error on attempt ' + attempt + ': ' + err.message);
			}
		};

		sendOnce(1);
		await new Promise((r) => this.homey.setTimeout(r, 200));
		sendOnce(2);
		await new Promise((r) => this.homey.setTimeout(r, 200));
		sendOnce(3);

		// Give the Xbox a moment to receive the shutdown before we tear down the socket.
		await new Promise((r) => this.homey.setTimeout(r, 800));
		try {
			this.client.disconnect();
		} catch (err) {
			this.log('disconnect after power_off failed: ' + err.message);
		}
	}

	setIfHasCapability(cap, value) {
		if (this.hasCapability(cap)) {
			return this.setCapabilityValue(cap, value).catch(this.error);
		}
	}

	async onUninit() {
		this._teardownAll();
	}

	onDeleted() {
		this._teardownAll();
	}

	_teardownAll() {
		if (this._discoveryInterval) {
			this.homey.clearInterval(this._discoveryInterval);
			this._discoveryInterval = null;
		}
		if (this._idleTimer) {
			this.homey.clearTimeout(this._idleTimer);
			this._idleTimer = null;
		}
		this._teardownSession('teardown');
	}
}

module.exports = XBoxDevice;
