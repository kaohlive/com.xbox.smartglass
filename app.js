'use strict';

const Homey = require('homey');
const XboxAuth = require('./lib/xboxauth');

class XBoxSmartglass extends Homey.App {

	async onInit() {
		this.log('XBox Smartglass app is running...');
		this.auth = new XboxAuth(this.homey, this.log.bind(this));

		// Warm the chain in the background so the first titlehub call
		// doesn't pay the full OAuth round-trip. Failures are non-fatal —
		// the user just hasn't signed in yet, or the refresh token died.
		if (this.auth.hasRefreshToken()) {
			this.auth.getAuthHeader().catch((err) => {
				this.log('Initial auth warmup failed (re-auth may be needed): ' + err.message);
			});
		}
	}

	getAuth() {
		return this.auth;
	}
}

module.exports = XBoxSmartglass;
