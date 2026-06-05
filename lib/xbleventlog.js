'use strict';

const SETTINGS_KEY = 'xbl_event_log';
const MAX_ENTRIES = 200;
const MAX_MESSAGE_LEN = 500;

// Bounded, persistent log of interesting Xbox Live events for the
// diagnostics panel in the app settings. Not a general application log:
// only events the user actively wants to see hours after the fact
// (achievements unlocked, friend transitions, fetch failures, title
// extraction misses). Routine per-tick activity does NOT belong here.
class XblEventLog {

	constructor(homey) {
		this.homey = homey;
		this.buf = this._load();
	}

	push(message) {
		const text = (message == null ? '' : String(message)).slice(0, MAX_MESSAGE_LEN);
		const entry = { ts: new Date().toISOString(), message: text };
		this.buf.push(entry);
		if (this.buf.length > MAX_ENTRIES) {
			this.buf = this.buf.slice(-MAX_ENTRIES);
		}
		this._save();
	}

	list() {
		// Newest-first is the natural reading order in a UI panel.
		return this.buf.slice().reverse();
	}

	clear() {
		this.buf = [];
		this._save();
	}

	_load() {
		const v = this.homey.settings.get(SETTINGS_KEY);
		return Array.isArray(v) ? v.slice(-MAX_ENTRIES) : [];
	}

	_save() {
		this.homey.settings.set(SETTINGS_KEY, this.buf);
	}
}

module.exports = XblEventLog;
