'use strict';

const crypto = require('crypto');
const fetch = require('node-fetch');

const BASE = 'https://xccs.xboxlive.com';
const COMMON_HEADERS = {
	'x-xbl-contract-version': '4',
	'skillplatform': 'RemoteManagement',
	'Accept': 'application/json',
	'Accept-Language': 'en-US',
};

function authHeaders(authHeader) {
	return { ...COMMON_HEADERS, 'Authorization': authHeader };
}

async function jsonOrThrow(res, label) {
	if (!res.ok) {
		let body = '';
		try { body = (await res.text()).slice(0, 200); } catch (_) {}
		throw new Error(`${label}: HTTP ${res.status}${body ? ' — ' + body : ''}`);
	}
	try {
		return await res.json();
	} catch (err) {
		throw new Error(`${label}: malformed JSON — ${err.message}`);
	}
}

// GET /lists/devices — returns consoles registered to the signed-in account.
// Response shape: { result: [{ id, name, consoleType, powerState, ... }] }
async function listConsoles(authHeader) {
	const res = await fetch(`${BASE}/lists/devices?queryCurrentDevice=false&includeStorageDevices=false`, {
		method: 'GET',
		headers: authHeaders(authHeader),
	});
	const data = await jsonOrThrow(res, 'listConsoles');
	return Array.isArray(data.result) ? data.result : [];
}

// GET /lists/installedApps?deviceId=... — installed apps + games on the console.
// Response shape: { result: [{ oneStoreProductId, titleId, contentType, name, image, ... }] }
async function listInstalledApps(authHeader, consoleId) {
	const url = `${BASE}/lists/installedApps?deviceId=${encodeURIComponent(consoleId)}`;
	const res = await fetch(url, { method: 'GET', headers: authHeaders(authHeader) });
	const data = await jsonOrThrow(res, 'listInstalledApps');
	return Array.isArray(data.result) ? data.result : [];
}

// POST /commands — the underlying "do something on the console" endpoint.
async function sendCommand(authHeader, consoleId, type, command, parameters) {
	const body = {
		destination: 'Xbox',
		type,
		command,
		sessionId: crypto.randomUUID(),
		sourceId: 'com.microsoft.smartglass',
		parameters: parameters && parameters.length ? parameters : [{}],
		linkedXboxId: consoleId,
	};
	const res = await fetch(`${BASE}/commands`, {
		method: 'POST',
		headers: { ...authHeaders(authHeader), 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	return jsonOrThrow(res, `command ${type}.${command}`);
}

function powerOffCloud(authHeader, consoleId) {
	return sendCommand(authHeader, consoleId, 'Power', 'TurnOff');
}

function powerOnCloud(authHeader, consoleId) {
	return sendCommand(authHeader, consoleId, 'Power', 'WakeUp');
}

function launchAppCloud(authHeader, consoleId, oneStoreProductId) {
	return sendCommand(authHeader, consoleId, 'Shell', 'ActivateApplicationWithOneStoreProductId',
		[{ oneStoreProductId }]);
}

// GET profile.xboxlive.com — returns Gamerscore/Gamertag/Gamerpic.
// Response shape: { profileUsers: [{ id, settings: [{ id, value }] }] }
async function getProfile(authHeader, xuid) {
	const settings = 'Gamerscore,Gamertag,GameDisplayPicRaw';
	const url = `https://profile.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/profile/settings?settings=${settings}`;
	const res = await fetch(url, {
		method: 'GET',
		headers: { ...authHeaders(authHeader), 'x-xbl-contract-version': '3' },
	});
	const data = await jsonOrThrow(res, 'getProfile');
	const user = data.profileUsers && data.profileUsers[0];
	if (!user || !Array.isArray(user.settings)) return {};
	const out = {};
	for (const s of user.settings) {
		if (s.id === 'Gamerscore') out.gamerscore = parseInt(s.value, 10);
		else if (s.id === 'Gamertag') out.gamertag = s.value;
		else if (s.id === 'GameDisplayPicRaw') out.gamerpic = s.value;
	}
	return out;
}

// GET achievements.xboxlive.com/users/xuid/history/titles — recent
// activity per title with the latest achievement progress per title.
// We use this as the "recent unlocks" source.
async function getRecentAchievementsByTitle(authHeader, xuid) {
	const url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/history/titles`;
	const res = await fetch(url, {
		method: 'GET',
		headers: { ...authHeaders(authHeader), 'x-xbl-contract-version': '2' },
	});
	const data = await jsonOrThrow(res, 'getRecentAchievementsByTitle');
	return Array.isArray(data.titles) ? data.titles : [];
}

// GET achievements.xboxlive.com/users/xuid/achievements?titleId=X — list
// of achievements for a specific title, including most recent ones.
async function getAchievementsForTitle(authHeader, xuid, titleId, maxItems) {
	const url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/achievements?titleId=${encodeURIComponent(titleId)}&maxItems=${maxItems || 25}&orderBy=Unlock&unlocked=true`;
	const res = await fetch(url, {
		method: 'GET',
		headers: { ...authHeaders(authHeader), 'x-xbl-contract-version': '2' },
	});
	const data = await jsonOrThrow(res, 'getAchievementsForTitle');
	return Array.isArray(data.achievements) ? data.achievements : [];
}

// GET peoplehub.xboxlive.com — friends list with presence decoration.
// Returns array of { xuid, gamertag, presenceState, presenceText, ... }.
async function getFriendsPresence(authHeader) {
	const url = 'https://peoplehub.xboxlive.com/users/me/people/social/decoration/presenceDetail';
	const res = await fetch(url, {
		method: 'GET',
		headers: { ...authHeaders(authHeader), 'x-xbl-contract-version': '5' },
	});
	const data = await jsonOrThrow(res, 'getFriendsPresence');
	return Array.isArray(data.people) ? data.people : [];
}

module.exports = {
	listConsoles,
	listInstalledApps,
	sendCommand,
	powerOffCloud,
	powerOnCloud,
	launchAppCloud,
	getProfile,
	getRecentAchievementsByTitle,
	getAchievementsForTitle,
	getFriendsPresence,
};
