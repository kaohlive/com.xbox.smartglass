'use strict';

const fetch = require('node-fetch');

const TITLEHUB_URL = 'https://titlehub.xboxlive.com/titles/batch/decoration/detail';

async function GetappTitleBatch(appPfn, homey) {
	const auth = homey.app && homey.app.getAuth && homey.app.getAuth();
	if (!auth) {
		return { result: false, name: 'Xbox auth not initialised' };
	}

	let authHeader;
	try {
		authHeader = await auth.getAuthHeader();
	} catch (err) {
		return { result: false, name: 'Xbox live is not authenticated, please use the app settings: ' + err.message };
	}

	try {
		const res = await fetch(TITLEHUB_URL, {
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
		if (!res.ok) {
			return { result: false, name: 'titlehub returned ' + res.status };
		}
		const data = await res.json();
		if (data && Array.isArray(data.titles) && data.titles.length > 0) {
			return {
				result: true,
				name: data.titles[0].name,
				displayImage: data.titles[0].displayImage,
			};
		}
		return { result: false };
	} catch (err) {
		return { result: false, name: 'titlehub error: ' + err.message };
	}
}

module.exports.GetappTitleBatch = GetappTitleBatch;
