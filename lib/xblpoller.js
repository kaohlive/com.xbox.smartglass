'use strict';

const EventEmitter = require('events');
const xboxapi = require('./xboxapi');

const POLL_INTERVAL_MS = 60_000;
const LAST_ACHIEVEMENTS_KEY = 'xbl_last_achievements';
const LAST_FRIENDS_ONLINE_KEY = 'xbl_last_friends_online';
const LAST_GAMERSCORE_KEY = 'xbl_last_gamerscore';
// Bumped when the achievement query semantics change so the stored
// seen-set (built with old filters) gets wiped and re-seeded on the
// first tick after upgrade. v131 = orderBy=UnlockTime + in-code
// progressState filter instead of the unreliable server-side flag.
const ACHIEVEMENT_SEED_VERSION_KEY = 'xbl_achievements_seed_version';
const ACHIEVEMENT_SEED_VERSION = 'v131';
const ACHIEVEMENT_TITLE_CAP = 10;
const ACHIEVEMENT_PER_TITLE_CAP = 25;

// Polls the Xbox Live REST endpoints on a fixed cadence and emits events
// for state transitions: 'gamerscore', 'achievement', 'friend-online'.
// Designed as the single background worker for app-level events that are
// inherently account-scoped (not device-scoped) — we don't poll per
// console because the answers would all be identical.
class XblPoller extends EventEmitter {

	constructor(homey, auth, log = console.log, eventLog = null) {
		super();
		this.homey = homey;
		this.auth = auth;
		this.log = log;
		this.events = eventLog;
		this._timer = null;
		this._running = false;
		this._initial = true;
		// Last-tick achievement counts in memory so we only emit a
		// summary event when something changes. Stops the event log from
		// growing one entry per minute when nothing's happening.
		this._lastAchTickResult = null;
	}

	_event(message) {
		if (this.events) this.events.push(message);
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
				this._tickGamerscore(authHeader, xuid).catch((err) => {
					this.log('gamerscore tick: ' + err.message);
					this._event('Gamerscore tick FAILED: ' + err.message);
				}),
				this._tickAchievements(authHeader, xuid).catch((err) => {
					this.log('achievements tick: ' + err.message);
					this._event('Achievements tick FAILED: ' + err.message);
				}),
				this._tickFriends(authHeader).catch((err) => {
					this.log('friends tick: ' + err.message);
					this._event('Friends tick FAILED: ' + err.message);
				}),
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
		// Migration: if the stored seen-set was built with the old (buggy)
		// query semantics, wipe it and force a re-seed in this tick.
		const storedSeedVersion = this.homey.settings.get(ACHIEVEMENT_SEED_VERSION_KEY);
		const needsReseed = storedSeedVersion !== ACHIEVEMENT_SEED_VERSION;
		if (needsReseed) {
			this._saveLastAchievementIds([]);
			this._event('Achievements: re-seeding (endpoint params changed in this version, clearing stale seen-set)');
		}

		// Step 1: fetch recent activity per title to know which titles to look at.
		const titles = await xboxapi.getRecentAchievementsByTitle(authHeader, xuid, ACHIEVEMENT_PER_TITLE_CAP);
		if (titles.length === 0) {
			this._emitAchTickSummary(0, 0, 0);
			if (this._initial || needsReseed) {
				this._event('Achievements seeding: 0 recent titles returned from history endpoint');
				this.homey.settings.set(ACHIEVEMENT_SEED_VERSION_KEY, ACHIEVEMENT_SEED_VERSION);
			}
			return;
		}

		const recentTitles = titles.slice(0, ACHIEVEMENT_TITLE_CAP);

		const seenIds = new Set(this._loadLastAchievementIds());
		const wasSeeding = this._initial || needsReseed;
		let checked = 0;
		let newCount = 0;
		// Track the absolute-most-recent unlock across all titles so the
		// user can spot-check that the pipeline reaches the right data.
		let mostRecent = null;

		// Step 2: for each recent title, fetch most-recent unlocks. Filter
		// in code on progressState — the server-side filter has had
		// inconsistent param names. Compare against the seen set; any new
		// id is a freshly-unlocked achievement.
		for (const t of recentTitles) {
			let unlocks;
			try {
				unlocks = await xboxapi.getAchievementsForTitle(authHeader, xuid, t.titleId, ACHIEVEMENT_PER_TITLE_CAP);
			} catch (err) {
				this.log('achievements for title ' + t.titleId + ' failed: ' + err.message);
				this._event('Achievements fetch failed for "' + (t.name || t.titleId) + '": ' + err.message);
				continue;
			}
			for (const ach of unlocks) {
				if (!ach || !ach.id) continue;
				if (!this._isAchUnlocked(ach)) continue;
				checked++;
				const unlockTime = ach.progression && ach.progression.timeUnlocked;
				if (unlockTime) {
					const ts = Date.parse(unlockTime);
					if (Number.isFinite(ts) && (!mostRecent || ts > mostRecent.ts)) {
						mostRecent = {
							ts,
							titleName: t.name || ach.titleName || t.titleId,
							achName: ach.name || ach.id,
							unlockTime,
						};
					}
				}
				const key = t.titleId + ':' + ach.id;
				if (seenIds.has(key)) continue;
				seenIds.add(key);
				// On first run / re-seed we just seed the set — don't fire
				// triggers for everything the user already had.
				if (wasSeeding) continue;
				newCount++;
				const score = this._extractGamerscore(ach);
				this._event('Achievement unlocked: ' + (t.name || ach.titleName || t.titleId) + ' — ' + (ach.name || ach.id) + ' (+' + score + ')');
				this.emit('achievement', {
					title_id: t.titleId,
					title_name: t.name || ach.titleName || '',
					achievement_id: ach.id,
					achievement_name: ach.name || '',
					gamerscore_awarded: score,
					achievement_art_url: this._extractArtUrl(ach),
					unlock_time: unlockTime,
				});
			}
		}
		if (wasSeeding) {
			const mostRecentSuffix = mostRecent
				? ' — most recent: ' + mostRecent.titleName + ' / ' + mostRecent.achName + ' at ' + mostRecent.unlockTime
				: '';
			this._event('Achievements seeded: ' + seenIds.size + ' unlocked ids across ' + recentTitles.length + ' titles (checked ' + checked + ')' + mostRecentSuffix);
			this.homey.settings.set(ACHIEVEMENT_SEED_VERSION_KEY, ACHIEVEMENT_SEED_VERSION);
		}
		this._emitAchTickSummary(recentTitles.length, checked, newCount);
		// Cap the seen-set size so it doesn't grow unbounded over months
		// of play. We keep the most recent ~200 ids.
		this._saveLastAchievementIds(Array.from(seenIds).slice(-200));
	}

	_isAchUnlocked(ach) {
		// MS uses both progressState and achievementState across endpoints.
		// 'Achieved' is canonical for unlocked. Some older payloads only
		// fill progression.timeUnlocked when actually unlocked.
		const state = (ach.progressState || ach.achievementState || '').toString();
		if (state && state.toLowerCase() === 'achieved') return true;
		const unlockTime = ach.progression && ach.progression.timeUnlocked;
		return !!unlockTime && Date.parse(unlockTime) > 0;
	}

	_emitAchTickSummary(titles, checked, newCount) {
		// Only log a per-tick summary when the result changes vs the
		// previous tick — otherwise the event buffer would grow one entry
		// per minute even when nothing happened. The 'new>0' case is
		// already covered by the per-achievement event above.
		const prev = this._lastAchTickResult;
		const same = prev && prev.titles === titles && prev.checked === checked;
		this._lastAchTickResult = { titles, checked, newCount };
		if (same) return;
		this._event('Achievements: titles=' + titles + ', checked=' + checked + ', new=' + newCount);
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
				this._event('Friend ' + (f.gamertag || f.xuid) + ' came online — game: ' + (titleName || 'none'));
				if (!titleName) this._logExtractionMiss(f);
				this.emit('friend-online', {
					friend_xuid: f.xuid,
					friend_gamertag: f.gamertag || '',
					friend_display_name: f.displayName || f.gamertag || '',
					friend_presence_text: f.presenceText || '',
					friend_title_name: titleName,
					friend_gamerpic_url: f.displayPicRaw || '',
				});
			} else if (!present && wasPresent) {
				this._event('Friend ' + (f.gamertag || f.xuid) + ' went offline — last game: ' + (prevTitle || 'none'));
				this.emit('friend-offline', {
					friend_xuid: f.xuid,
					friend_gamertag: f.gamertag || '',
					friend_display_name: f.displayName || f.gamertag || '',
					friend_last_title_name: prevTitle,
					friend_gamerpic_url: f.displayPicRaw || '',
				});
			} else if (present && wasPresent && titleName && titleName !== prevTitle) {
				// Friend stayed online but is now showing a different title.
				// Log every change for diagnostics, but only fire the
				// switched-game trigger when *both* sides are real games —
				// going from no-game to a game (or back) is conceptually
				// "started playing" / "stopped playing", which the came-
				// online trigger already covers.
				this._event('Friend ' + (f.gamertag || f.xuid) + ' switched game: ' + (prevTitle || 'none') + ' -> ' + titleName);
				if (prevTitle) {
					this.emit('friend-switched-game', {
						friend_xuid: f.xuid,
						friend_gamertag: f.gamertag || '',
						friend_display_name: f.displayName || f.gamertag || '',
						friend_previous_title_name: prevTitle,
						friend_title_name: titleName,
						friend_gamerpic_url: f.displayPicRaw || '',
					});
				}
			}
		}
		this._saveFriendsOnlineMap(next);
	}

	_logExtractionMiss(friend) {
		try {
			const sample = Array.isArray(friend.presenceDetails) ? friend.presenceDetails.slice(0, 2) : null;
			const raw = JSON.stringify({
				presenceText: friend.presenceText || friend.PresenceText || null,
				presenceState: friend.presenceState || friend.PresenceState || null,
				presenceDetails: sample,
			});
			this._event('Friend title extraction empty for ' + (friend.gamertag || friend.xuid) + ', raw=' + raw);
		} catch (_) {
			this._event('Friend title extraction empty for ' + (friend.gamertag || friend.xuid) + ' (raw unstringifiable)');
		}
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

	// peoplehub.presenceDetails uses mixed casings and the field that
	// actually carries the title can be any of TitleName / PresenceText
	// (per-entry, not the top-level one) / RichPresence — depending on
	// the title and how the user is engaging with it. We try them in a
	// preference order that biases toward the "what game" answer:
	// title-flagged entry first, then primary, then any entry with text.
	// If nothing matches we fall back to the top-level presenceText IF
	// it isn't the literal "Online"/"Offline" status word.
	_extractFriendTitle(friend) {
		const details = Array.isArray(friend.presenceDetails) ? friend.presenceDetails : [];
		const getName = (d) => {
			if (!d) return '';
			return (
				d.TitleName || d.titleName
				|| d.RichPresence || d.richPresence
				|| d.PresenceText || d.presenceText
				|| d.Name || d.name
				|| ''
			);
		};
		const isGame = (d) => d && (d.IsGame === true || d.isGame === true);
		const isPrimary = (d) => d && (d.IsPrimary === true || d.isPrimary === true);

		const game = details.find((d) => isGame(d) && getName(d));
		if (game) return getName(game);
		const primary = details.find((d) => isPrimary(d) && getName(d));
		if (primary) return getName(primary);
		const named = details.find((d) => getName(d));
		if (named) return getName(named);

		// Top-level fallback. presenceText for an Xbox app user is often
		// just "Online" / "Offline" which is not a game name — skip those.
		const top = (friend.presenceText || friend.PresenceText || '').toString().trim();
		if (top && !/^(online|offline|away|idle)$/i.test(top)) return top;
		return '';
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
