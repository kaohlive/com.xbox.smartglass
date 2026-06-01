'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const XboxAuth = require('./lib/xboxauth');
const XblPoller = require('./lib/xblpoller');
const xboxapi = require('./lib/xboxapi');

const TRACK_PROFILE_SETTING = 'track_xbl_profile';
const FALLBACK_ART_PATH = '/assets/images/App.png';

class XBoxSmartglass extends Homey.App {

	async onInit() {
		this.log('XBox Smartglass app is running...');
		this.auth = new XboxAuth(this.homey, this.log.bind(this));
		this.poller = new XblPoller(this.homey, this.auth, this.log.bind(this));

		// Achievement and friend-online are app-level (account-scoped)
		// triggers, not per-device. With multiple Xboxes you don't want
		// one achievement to fire N flows; the underlying event is
		// account-wide and we honour that here.
		this._flowTriggerAchievement = this.homey.flow.getTriggerCard('achievement-unlocked');
		this._flowTriggerFriendOnline = this.homey.flow.getTriggerCard('friend-online');
		this._flowTriggerFriendOffline = this.homey.flow.getTriggerCard('friend-offline');

		// Filtered variants of friend-online / friend-offline. Same tokens,
		// extra autocomplete arg that picks one friend by xuid. The poller
		// fires both the generic and the specific card; the run listener
		// drops the specific one unless the picked friend matches.
		this._flowTriggerSpecificFriendOnline = this.homey.flow.getTriggerCard('specific-friend-online');
		this._flowTriggerSpecificFriendOffline = this.homey.flow.getTriggerCard('specific-friend-offline');
		this._flowTriggerSpecificFriendOnline.registerRunListener(async (args, state) => {
			return !!(args && args.friend && state && args.friend.id === state.xuid);
		});
		this._flowTriggerSpecificFriendOffline.registerRunListener(async (args, state) => {
			return !!(args && args.friend && state && args.friend.id === state.xuid);
		});
		this._flowTriggerSpecificFriendOnline.registerArgumentAutocompleteListener('friend', (query) => this._friendAutocomplete(query));
		this._flowTriggerSpecificFriendOffline.registerArgumentAutocompleteListener('friend', (query) => this._friendAutocomplete(query));

		this.poller.on('achievement', async (data) => {
			try {
				const image = await this._makeRemoteImage(data.achievement_art_url);
				await this._flowTriggerAchievement.trigger({
					title_name: data.title_name || '',
					achievement_name: data.achievement_name || '',
					gamerscore_awarded: data.gamerscore_awarded || 0,
					achievement_art_url: data.achievement_art_url || '',
					achievement_art_image: image,
				});
			} catch (err) {
				this.log('achievement trigger fire failed: ' + err.message);
			}
		});
		this.poller.on('friend-online', async (data) => {
			try {
				const image = await this._makeRemoteImage(data.friend_gamerpic_url);
				const tokens = {
					friend_gamertag: data.friend_gamertag || '',
					friend_display_name: data.friend_display_name || '',
					friend_title_name: data.friend_title_name || '',
					friend_presence_text: data.friend_presence_text || '',
					friend_gamerpic_url: data.friend_gamerpic_url || '',
					friend_gamerpic_image: image,
				};
				await Promise.all([
					this._flowTriggerFriendOnline.trigger(tokens),
					this._flowTriggerSpecificFriendOnline.trigger(tokens, { xuid: data.friend_xuid }),
				]);
			} catch (err) {
				this.log('friend-online trigger fire failed: ' + err.message);
			}
		});
		this.poller.on('friend-offline', async (data) => {
			try {
				const image = await this._makeRemoteImage(data.friend_gamerpic_url);
				const tokens = {
					friend_gamertag: data.friend_gamertag || '',
					friend_display_name: data.friend_display_name || '',
					friend_last_title_name: data.friend_last_title_name || '',
					friend_gamerpic_url: data.friend_gamerpic_url || '',
					friend_gamerpic_image: image,
				};
				await Promise.all([
					this._flowTriggerFriendOffline.trigger(tokens),
					this._flowTriggerSpecificFriendOffline.trigger(tokens, { xuid: data.friend_xuid }),
				]);
			} catch (err) {
				this.log('friend-offline trigger fire failed: ' + err.message);
			}
		});

		// Gamerscore is mirrored to each device tile and lives in the
		// driver layer because it's a capability value, not a trigger.
		this.poller.on('gamerscore', (d) => this.emit('xbl:gamerscore', d));

		// Warm the auth chain in the background so the first cloud call
		// doesn't pay the full OAuth round-trip. Failures are non-fatal.
		if (this.auth.hasRefreshToken()) {
			this.auth.getAuthHeader().catch((err) => {
				this.log('Initial auth warmup failed (re-auth may be needed): ' + err.message);
			});
		}

		// Start the poller if the user opted in. If they toggle it later
		// the settings handler below picks that up.
		if (this.isTrackingProfile() && this.auth.hasRefreshToken()) {
			this.poller.start();
		}

		this.homey.settings.on('set', (key) => {
			if (key !== TRACK_PROFILE_SETTING) return;
			if (this.isTrackingProfile() && this.auth.hasRefreshToken()) {
				this.poller.start();
			} else {
				this.poller.stop();
			}
			this._notifyDevicesTrackingChanged();
		});
	}

	isTrackingProfile() {
		return this.homey.settings.get(TRACK_PROFILE_SETTING) === true;
	}

	getAuth() {
		return this.auth;
	}

	getPoller() {
		return this.poller;
	}

	// Friend autocomplete for the specific-friend triggers. Pulls the
	// peoplehub list (same call the poller already uses) and maps to the
	// shape Homey expects: { name, description, image, id }. id == xuid
	// so the run listener can match against the poller's state.xuid.
	async _friendAutocomplete(query) {
		if (!this.auth.hasRefreshToken()) return [];
		try {
			const authHeader = await this.auth.getAuthHeader();
			const friends = await xboxapi.getFriendsPresence(authHeader);
			const q = (query || '').toString().trim().toLowerCase();
			const items = friends
				.filter((f) => f && f.xuid)
				.map((f) => ({
					name: f.gamertag || f.displayName || f.xuid,
					description: f.displayName && f.displayName !== f.gamertag ? f.displayName : '',
					image: f.displayPicRaw || undefined,
					id: f.xuid,
				}))
				.filter((item) => !q
					|| item.name.toLowerCase().includes(q)
					|| (item.description && item.description.toLowerCase().includes(q)));
			items.sort((a, b) => a.name.localeCompare(b.name));
			return items;
		} catch (err) {
			this.log('Friend autocomplete failed: ' + err.message);
			return [];
		}
	}

	// Build a Homey Image whose source is a remote URL. If the URL is
	// missing or the fetch fails the image falls back to a packaged
	// placeholder so the token is always a valid Image and downstream
	// flow steps don't crash.
	async _makeRemoteImage(url) {
		const image = await this.homey.images.createImage();
		if (url) {
			image.setStream(async (stream) => {
				const res = await fetch(url);
				if (!res.ok) throw new Error('image fetch ' + res.status);
				return res.body.pipe(stream);
			});
		} else {
			image.setPath(FALLBACK_ART_PATH);
		}
		return image;
	}

	_notifyDevicesTrackingChanged() {
		try {
			const driver = this.homey.drivers.getDriver('xbox-console');
			if (!driver) return;
			for (const device of driver.getDevices()) {
				if (typeof device.onTrackingChanged === 'function') {
					device.onTrackingChanged(this.isTrackingProfile()).catch((err) => {
						this.log('onTrackingChanged failed for device: ' + err.message);
					});
				}
			}
		} catch (err) {
			this.log('Could not notify devices of tracking change: ' + err.message);
		}
	}
}

module.exports = XBoxSmartglass;
