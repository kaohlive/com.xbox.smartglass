'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');
const fetch = require('node-fetch');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');

const defaultAlbumArtImage = '/assets/images/{0}.png';
const DISCOVERY_POLL_MS = 20000;
const CHANNEL_OPEN_TIMEOUT_MS = 10000;
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
	_guardedSmartglass() {
		const client = Smartglass();
		const events = client && client._events;
		if (events && typeof events.listeners === 'function') {
			const existing = events.listeners('receive');
			events.removeAllListeners('receive');
			const log = this.log.bind(this);
			events.on('receive', function (message, xbox, remote, smartglass) {
				for (const listener of existing) {
					try {
						listener.call(this, message, xbox, remote, smartglass);
					} catch (err) {
						log('Dropped malformed Xbox packet: ' + (err && err.message ? err.message : err));
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
	async _ensureSession() {
		if (this.client && this.client._connection_status) return;
		if (this._sessionConnecting) return this._sessionConnecting;
		if (!this.device.address) throw new Error('No console address configured');

		// If a prior client was torn down we need a fresh one (the lib closes
		// its socket on disconnect/timeout).
		if (!this.client || this.client._socket === false) {
			this._buildClient();
		}

		this._sessionConnecting = this.client.connect(this.device.address)
			.then(() => {
				this.log('SmartGlass session established with ' + this.device.address);
				if (this.client._console && typeof this.client._console.getLiveid === 'function') {
					const liveid = this.client._console.getLiveid();
					this.device.liveId = liveid;
					this.setSettings({ liveid }).catch(() => {});
				}
				this.client.addManager('system_media', SystemMediaChannel());
				this._applyPowerState(true);
				this._armIdleDisconnect();
			})
			.catch((err) => {
				const msg = (err && (err.message || err.error)) ? (err.message || err.error) : JSON.stringify(err);
				this.log('Connect failed: ' + msg);
				throw err;
			})
			.finally(() => {
				this._sessionConnecting = null;
			});
		return this._sessionConnecting;
	}

	// Open the SystemInputChannel and await its ready state. The library's
	// addManager() throws away the channel-open promise and the original
	// implementation worked around that with a hardcoded 25s sleep. We
	// bypass addManager and wait on the actual ready event with a 10s cap.
	async _ensureInputChannel() {
		await this._ensureSession();
		const existing = this.client.getManager('system_input');
		if (existing && existing._channel_manager && existing._channel_manager.getStatus()) {
			return existing;
		}

		if (this._inputChannelOpening) return this._inputChannelOpening;

		const channel = existing || SystemInputChannel();
		// Wire it in manually so getManager() finds it without triggering
		// the lib's addManager (which drops the ready-promise on the floor).
		if (!existing) {
			this.client._managers['system_input'] = channel;
			this.client._managers_num++;
		}

		const openPromise = channel._channel_manager.open(this.client, this.client._managers_num - 1);
		const timeout = new Promise((_, reject) => {
			this.homey.setTimeout(() => reject(new Error('SystemInput channel open timed out')), CHANNEL_OPEN_TIMEOUT_MS);
		});

		this._inputChannelOpening = Promise.race([openPromise, timeout])
			.then(() => channel)
			.catch((err) => {
				// On failure clear the half-installed manager so a retry can start fresh.
				delete this.client._managers['system_input'];
				throw err;
			})
			.finally(() => {
				this._inputChannelOpening = null;
			});

		return this._inputChannelOpening;
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

		const appInfo = await require('../../lib/titlehub.js').GetappTitleBatch(newAppId.split('!')[0], this.homey);
		let appName = newAppId.split('!')[0];
		let appImageUrl = defaultAlbumArtImage.replace('{0}', 'App');
		if (appInfo && appInfo.result) {
			appImageUrl = appInfo.displayImage;
			this.device.appImage.setStream(async (stream) => {
				const res = await fetch(appInfo.displayImage);
				if (!res.ok) throw new Error('Invalid Response');
				return res.body.pipe(stream);
			});
			appName = appInfo.name;
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
		}
		this.device.appImage.update().catch(() => {});
		this.setIfHasCapability('speaker_artist', appName);
		this._driver.triggerAppChange(this, {
			new_app_name: appName,
			new_app_family_id: newAppId,
			new_app_art_url: appImageUrl,
			new_app_art_image: this.device.appImage,
		});
		this.device.currentApp.appStoreId = newAppId;
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
				// Need a session to send power-off. Open one briefly.
				try {
					await this._ensureSession();
				} catch (err) {
					this.log('Cannot power off, no session: ' + err.message);
					return;
				}
			}
			try {
				await this.client.powerOff();
				this.log('Console shut down');
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
