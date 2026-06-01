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

module.exports = {
	listConsoles,
	listInstalledApps,
	sendCommand,
	powerOffCloud,
	powerOnCloud,
	launchAppCloud,
};
