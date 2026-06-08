'use strict';

module.exports = {

	async getAuthStatus({ homey }) {
		return homey.app.getAuth().getStatus();
	},

	async startAuth({ homey }) {
		try {
			return await homey.app.getAuth().startAuthorization();
		} catch (err) {
			throw new Error('Could not start authentication: ' + err.message);
		}
	},

	async signOut({ homey }) {
		homey.app.getAuth().signOut();
		return { ok: true };
	},

	async getDiagnosticsEvents({ homey }) {
		return { events: homey.app.getEventLog().list() };
	},

	async clearDiagnosticsEvents({ homey }) {
		homey.app.getEventLog().clear();
		return { ok: true };
	},
};
