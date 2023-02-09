'use strict';

const Homey = require('homey');
const EventEmitter = require('events');
const REFRESH_TOKEN_SETTING_KEY = 'xbl_refreshToken';

class XBoxSmartglass extends Homey.App {

	isAuthenticated()
	{
		var validToken = true;
		var now=new Date();
		var expiresOn = now;
		if(this.Tokens.XSTS.NotAfter!='') 
			expiresOn = new Date(this.Tokens.XSTS.NotAfter);
		if(this.Tokens.XSTS.JWT=='' || now > expiresOn) 
			validToken = false;
		return validToken;
	}
	
	onInit() {
		this.log('XBox Smartglass app is running...');
		this.Tokens = {
			Access: {
				JWT: '',
				Expires: null
			},
			User: {
				JWT: '',
				IssueInstant: '',
				NotAfter: ''
			},
			XSTS: {
				JWT: '',
				IssueInstant: '',
				NotAfter: '',
				xui:{}
			}
		};
	}

	getRefreshToken()
	{
		var token = this.homey.settings.get(REFRESH_TOKEN_SETTING_KEY);
		console.log('get refreshtoken from storage');
		return token;
	}

	updateRefreshToken(token)
	{
		console.log('store new refresh token');
		this.homey.settings.set(REFRESH_TOKEN_SETTING_KEY,token);
	}

	async login() {
		this.log('login()');
		const socket = new EventEmitter();
		const urlListener = (url) => this.homey.api.realtime('url', url);
		const errorListener = (err) => this.homey.api.realtime('error', err);
		const authorizedListener = () => {
			this.homey.api.realtime('authorized');
			socket.removeListener('url', urlListener);
			socket.removeListener('error', errorListener);
			socket.removeListener('authorized', authorizedListener);
		};
		socket.on('url', urlListener);
		socket.on('error', errorListener);
		socket.on('authorized', authorizedListener);
		this.log('trigger oauth2 process()');
		this.startOAuth2Process(socket);
	}

	startOAuth2Process(socket) {
		this.log('startOAuth2Process()');
		if (!socket) throw new Error('Expected socket for OAuth2 pairing process');

		// No OAuth2 process needed
		if (this.isAuthenticated()) {
			setTimeout(() => socket.emit('authorized'), 250); // Delay is needed for race condition fix
			return;
		}

		// Start OAuth2 process
		socket.emit('url', 'https://login.live.com/oauth20_authorize.srf?client_id=0000000048093EE3&redirect_uri=https://login.live.com/oauth20_desktop.srf&response_type=token&display=touch&scope=service::user.auth.xboxlive.com::MBI_SSL&locale=en');
	}
}

module.exports = XBoxSmartglass;