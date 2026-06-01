'use strict';

const fetch = require('node-fetch');

const TITLEHUB_URL = 'https://titlehub.xboxlive.com/titles/batch/decoration/detail';

async function GetappTitleBatch(appPfn, homey) {
	const log = homey && homey.app && typeof homey.app.log === 'function'
		? homey.app.log.bind(homey.app)
		: console.log;

	const auth = homey && homey.app && homey.app.getAuth && homey.app.getAuth();
	if (!auth) {
		log('titlehub: auth not initialised');
		return { result: false, name: 'Xbox auth not initialised' };
	}

	let authHeader;
	try {
		authHeader = await auth.getAuthHeader();
	} catch (err) {
		log('titlehub: getAuthHeader failed → ' + err.message);
		return { result: false, name: 'Xbox live is not authenticated, please use the app settings: ' + err.message };
	}

	let res;
	try {
		res = await fetch(TITLEHUB_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Accept-Language': 'en-US',
				'x-xbl-contract-version': '2',
				'x-xbl-client-name': 'XboxApp',
				'x-xbl-client-type': 'UWA',
				'x-xbl-client-version': '39.39.22001.0',
				'Authorization': authHeader,
			},
			body: JSON.stringify({
				pfns: [appPfn],
				windowsPhoneProductIds: [],
			}),
		});
	} catch (err) {
		log('titlehub: fetch threw → ' + err.message);
		return { result: false, name: 'titlehub network error: ' + err.message };
	}

	if (!res.ok) {
		let bodyText = '';
		try { bodyText = (await res.text()).slice(0, 200); } catch (_) {}
		log('titlehub: HTTP ' + res.status + ' for pfn ' + appPfn + (bodyText ? ' body=' + bodyText : ''));
		return { result: false, name: 'titlehub returned ' + res.status };
	}

	let data;
	try {
		data = await res.json();
	} catch (err) {
		log('titlehub: JSON parse failed → ' + err.message);
		return { result: false, name: 'titlehub returned malformed JSON' };
	}

	if (data && Array.isArray(data.titles) && data.titles.length > 0) {
		const title = data.titles[0];
		return {
			result: true,
			name: title.name,
			displayImage: title.displayImage,
		};
	}

	log('titlehub: pfn ' + appPfn + ' returned 200 but no titles in response');
	return { result: false, name: 'no title info for ' + appPfn };
}

module.exports.GetappTitleBatch = GetappTitleBatch;
