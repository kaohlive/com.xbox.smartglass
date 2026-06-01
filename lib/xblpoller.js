'use strict';

const EventEmitter = require('events');
const xboxapi = require('./xboxapi');

const POLL_INTERVAL_MS = 60_000;
const LAST_ACHIEVEMENTS_KEY = 'xbl_last_achievements';
const LAST_FRIENDS_ONLINE_KEY = 'xbl_last_friends_online';
const LAST_GAMERSCORE_KEY = 'xbl_last_gamerscore';

// Polls the Xbox Live REST endpoints on a fixed cadence and emits events
// for state transitions: 'gamerscore', 'achievement', 'friend-online'.
// Designed as the single background worker for app-level events that are
// inherently account-scoped (not device-scoped) — we don't poll per
// console because the answers would all be identical.
class XblPoller extends EventEmitter {

	constructor(homey, auth, log = console.log) {
		super();
		this.homey = homey;
		this.auth = auth;
		this.log = log;
		this._timer = null;
		this._running = false;
		this._initial = true;
	}

	start() {
		if (this._timer) return;
		this.log('XblPoller starting');
		// Kick off the first tick on next event-loop turn so callers can
		// finish wiring listeners before events start firing.
		this.homey.setTimeout(() => this._tick().catch((err) => this.log('initial tick failed: ' + err.message)), 1000);
		this._timer = this.homey.setInterval(() => {
			this._tick().catch((err) => this.log('tick failed: ' + err.message));
		}, POLL_INTERVAL_MS);
	}

	stop() {
		if (this._timer) {
			this.homey.clearInterval(this._timer);
			this._timer = null;
		}
		this._initial = true;
		this.log('XblPoller stopped');
	}

	async _tick() {
		if (this._running) return;
		this._running = true;
		try {
			const xuid = await this.auth.getXuid();
			if (!xuid) {
				this.log('XblPoller: no XUID available (not signed in?), skipping tick');
				return;
			}
			const authHeader = await this.auth.getAuthHeader();
			// Run the three fetches in parallel — they're independent and
			// each handles its own failures so one going down doesn't take
			// the others with it.
			await Promise.all([
				this._tickGamerscore(authHeader, xuid).catch((err) => this.log('gamerscore tick: ' + err.message)),
				this._tickAchievements(authHeader, xuid).catch((err) => this.log('achievements tick: ' + err.message)),
				this._tickFriends(authHeader).catch((err) => this.log('friends tick: ' + err.message)),
			]);
			this._initial = false;
		} finally {
			this._running = false;
		}
	}

	async _tickGamerscore(authHeader, xuid) {
		const profile = await xboxapi.getProfile(authHeader, xuid);
		const score = profile.gamerscore;
		if (typeof score !== 'number' || !Number.isFinite(score)) return;

		const prev = this.homey.settings.get(LAST_GAMERSCORE_KEY);
		const prevNum = typeof prev === 'number' ? prev : (typeof prev === 'string' ? parseInt(prev, 10) : null);
		this.emit('gamerscore', { gamerscore: score });
		if (prevNum !== null && score > prevNum) {
			this.emit('gamerscore-increased', { previous: prevNum, gamerscore: score, delta: score - prevNum });
		}
		this.homey.settings.set(LAST_GAMERSCORE_KEY, score);
	}

	async _tickAchievements(authHeader, xuid) {
		// Step 1: fetch recent activity per title to know which titles to look at.
		const titles = await xboxapi.getRecentAchievementsByTitle(authHeader, xuid);
		if (titles.length === 0) return;

		// Pick the few most-recently-played titles to avoid hammering the
		// achievements endpoint for hundreds of stale games.
		const recentTitles = titles.slice(0, 5);

		const seenIds = new Set(this._loadLastAchievementIds());

		// Step 2: for each recent title, fetch most-recent unlocks. Compare
		// against the seen set; any new id is a freshly-unlocked achievement.
		for (const t of recentTitles) {
			let unlocks;
			try {
				unlocks = await xboxapi.getAchievementsForTitle(authHeader, xuid, t.titleId, 10);
			} catch (err) {
				this.log('achievements for title ' + t.titleId + ' failed: ' + err.message);
				continue;
			}
			for (const ach of unlocks) {
				if (!ach || !ach.id) continue;
				const key = t.titleId + ':' + ach.id;
				if (seenIds.has(key)) continue;
				seenIds.add(key);
				// On first run we just seed the set — don't fire triggers
				// for everything the user already had.
				if (this._initial) continue;
				this.emit('achievement', {
					title_id: t.titleId,
					title_name: t.name || ach.titleName || '',
					achievement_id: ach.id,
					achievement_name: ach.name || '',
					gamerscore_awarded: this._extractGamerscore(ach),
					achievement_art_url: this._extractArtUrl(ach),
					unlock_time: ach.progression && ach.progression.timeUnlocked,
				});
			}
		}
		// Cap the seen-set size so it doesn't grow unbounded over months
		// of play. We keep the most recent ~200 ids.
		this._saveLastAchievementIds(Array.from(seenIds).slice(-200));
	}

	_extractGamerscore(ach) {
		// Achievements API returns rewards array with score reward inside.
		const rewards = Array.isArray(ach.rewards) ? ach.rewards : [];
		for (const r of rewards) {
			if (r && r.type === 'Gamerscore') return parseInt(r.value, 10) || 0;
		}
		return 0;
	}

	_extractArtUrl(ach) {
		if (!Array.isArray(ach.mediaAssets)) return '';
		const icon = ach.mediaAssets.find((m) => m && (m.type === 'Icon' || m.type === 'icon'));
		return icon && icon.url ? icon.url : '';
	}

	_loadLastAchievementIds() {
		const v = this.homey.settings.get(LAST_ACHIEVEMENTS_KEY);
		if (!Array.isArray(v)) return [];
		return v;
	}

	_saveLastAchievementIds(arr) {
		this.homey.settings.set(LAST_ACHIEVEMENTS_KEY, arr);
	}

	async _tickFriends(authHeader) {
		const friends = await xboxapi.getFriendsPresence(authHeader);
		const prev = this._loadFriendsOnlineMap();
		const next = {};

		for (const f of friends) {
			if (!f || !f.xuid) continue;
			// Microsoft's peoplehub returns a handful of "active" presence
			// states (Online, Away, Idle, Active, ...) that all mean "the
			// user is reachable on some device". Treating only 'Online' as
			// present caused us to fire repeated transitions every time
			// the user bounced between Online and Idle. We collapse to a
			// binary present/offline based on whether the state is Offline
			// or unknown.
			const present = this._isPresent(f);
			const titleName = this._extractFriendTitle(f);

			// prev entry may be a boolean (v1.2.2 storage shape) or an
			// object { present, title } (v1.2.3+). Normalise on read.
			const prevEntry = prev[f.xuid];
			let wasPresent = false;
			let prevTitle = '';
			if (typeof prevEntry === 'boolean') {
				wasPresent = prevEntry;
			} else if (prevEntry && typeof prevEntry === 'object') {
				wasPresent = !!prevEntry.present;
				prevTitle = prevEntry.title || '';
			}

			next[f.xuid] = { present, title: titleName };

			if (this._initial) continue;
			if (present && !wasPresent) {
				this.emit('friend-online', {
					friend_xuid: f.xuid,
					friend_gamertag: f.gamertag || '',
					friend_display_name: f.displayName || f.gamertag || '',
					friend_presence_text: f.presenceText || '',
					friend_title_name: titleName,
					friend_gamerpic_url: f.displayPicRaw || '',
				});
			} else if (!present && wasPresent) {
				this.emit('friend-offline', {
					friend_xuid: f.xuid,
					friend_gamertag: f.gamertag || '',
					friend_display_name: f.displayName || f.gamertag || '',
					friend_last_title_name: prevTitle,
					friend_gamerpic_url: f.displayPicRaw || '',
				});
			}
		}
		this._saveFriendsOnlineMap(next);
	}

	_isPresent(friend) {
		// Top-level state is case-inconsistent across peoplehub responses
		// (sometimes presenceState, sometimes PresenceState). Coerce both
		// to lowercase before comparing.
		const raw = (friend.presenceState || friend.PresenceState || '').toString().toLowerCase();
		if (!raw) return false;
		// Any state that's explicitly offline/disconnected means not present.
		if (raw === 'offline' || raw === 'disconnected') return false;
		// Online, Active, Away, Idle, PlatformActive, ... all count as present.
		return true;
	}

	// peoplehub.presenceDetails uses PascalCase field names (TitleName,
	// IsGame, IsPrimary) — not the camelCase the rest of the response
	// uses. We prefer the entry that's flagged as a game; fall back to
	// the primary entry; finally just take the first one with a name.
	_extractFriendTitle(friend) {
		if (!Array.isArray(friend.presenceDetails)) return '';
		const details = friend.presenceDetails;
		const getName = (d) => d && (d.TitleName || d.titleName || '');
		const isGame = (d) => d && (d.IsGame === true || d.isGame === true);
		const isPrimary = (d) => d && (d.IsPrimary === true || d.isPrimary === true);

		const game = details.find((d) => isGame(d) && getName(d));
		if (game) return getName(game);
		const primary = details.find((d) => isPrimary(d) && getName(d));
		if (primary) return getName(primary);
		const named = details.find((d) => getName(d));
		return named ? getName(named) : '';
	}

	_loadFriendsOnlineMap() {
		const v = this.homey.settings.get(LAST_FRIENDS_ONLINE_KEY);
		return v && typeof v === 'object' ? v : {};
	}

	_saveFriendsOnlineMap(obj) {
		this.homey.settings.set(LAST_FRIENDS_ONLINE_KEY, obj);
	}
}

module.exports = XblPoller;
