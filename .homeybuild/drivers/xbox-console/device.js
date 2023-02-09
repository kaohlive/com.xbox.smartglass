'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');
const fetch = require('node-fetch');
var SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');
var SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const defaultAlbumArtImage = '/assets/images/{0}.png';

class XBoxDevice extends Homey.Device {
	
	async onInit() {
		//Remember often used values in mem
		this.device = {};
		//This is the consoles name, we do not really care how the user calls it in Homey
		this.device.name = this.getData().name;
		this.device.liveId = this.getSettings().liveid;
		this.device.currentApp = { 'appStoreId': null };
		this.device.powered = false;
		this.device.appImage = await this.homey.images.createImage();
		this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}','App'));
		//.update?
		await this.setAlbumArtImage(this.device.appImage);
		//this.device.appImage.register().catch(console.error).then(function(){this.setAlbumArtImage(this.device.appImage);}.bind(this));
		//Setup the support objects
		this._driver = this.driver;
		this.client = Smartglass();
		//Ensure we have all the info we need
		if(this.getSettings().console_address=='')
			await this.setSettings({ console_address:this.getData().address+'' });
		this.device.address = this.getSettings().console_address;
		this.log('['+this.device.name+'] XBoxDevice ('+this.device.liveId+':'+this.device.address+') has been loaded');
		//Setup the device
		this._setup();
	}

	async _setup()
	{
		await this._registerCapability();
		await this.connectConsole();
		await this.bindEvents();
		this.setAvailable();
	}

	async _registerCapability()
	{
		if(!this.hasCapability("onoff"))
			await this.addCapability('onoff');
		if(!this.hasCapability("speaker_playing"))
			await this.addCapability('speaker_playing');
		if(!this.hasCapability("speaker_next"))
			await this.addCapability("speaker_next");
		if(!this.hasCapability("speaker_prev"))
			await this.addCapability("speaker_prev");
		if(!this.hasCapability("speaker_artist"))
			await this.addCapability("speaker_artist");
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this.registerCapabilityListener('speaker_playing', this.onCapabilitySpeakerPlaying.bind(this));
		this.registerCapabilityListener('speaker_next', this.onCapabilitySpeakerNext.bind(this));
		this.registerCapabilityListener('speaker_prev', this.onCapabilitySpeakerPrev.bind(this));
		//Remove some unsupporty capabilities
		//await this.removeCapability("controller_nexus");
		if(!this.hasCapability("controller_nexus"))
			await this.addCapability("controller_nexus");
		if(!this.hasCapability("controller_Y"))
			await this.addCapability("controller_Y");
		if(!this.hasCapability("controller_X"))
			await this.addCapability("controller_X");
		if(!this.hasCapability("controller_B"))
			await this.addCapability("controller_B");
		if(!this.hasCapability("controller_A"))
			await this.addCapability("controller_A");
		if(!this.hasCapability("controller_Menu"))
			await this.addCapability("controller_Menu");
		if(!this.hasCapability("controller_View"))
			await this.addCapability("controller_View");
		if(!this.hasCapability("controller_Up"))
			await this.addCapability("controller_Up");
		if(!this.hasCapability("controller_Left"))
			await this.addCapability("controller_Left");
		if(!this.hasCapability("controller_Right"))
			await this.addCapability("controller_Right");
		if(!this.hasCapability("controller_Down"))
			await this.addCapability("controller_Down");
		this.registerCapabilityListener('controller_nexus', this.onCapabilityControllerNexus.bind(this));
		this.registerCapabilityListener('controller_Y', this.onCapabilityControllerY.bind(this));
		this.registerCapabilityListener('controller_X', this.onCapabilityControllerX.bind(this));
		this.registerCapabilityListener('controller_B', this.onCapabilityControllerB.bind(this));
		this.registerCapabilityListener('controller_A', this.onCapabilityControllerA.bind(this));
		this.registerCapabilityListener('controller_Menu', this.onCapabilityControllerMenu.bind(this));
		this.registerCapabilityListener('controller_View', this.onCapabilityControllerView.bind(this));
		this.registerCapabilityListener('controller_Up', this.onCapabilityControllerUp.bind(this));
		this.registerCapabilityListener('controller_Left', this.onCapabilityControllerLeft.bind(this));
		this.registerCapabilityListener('controller_Right', this.onCapabilityControllerRight.bind(this));
		this.registerCapabilityListener('controller_Down', this.onCapabilityControllerDown.bind(this));
	}

	async connectConsole() {
		//Attempt to connect to get current device status
		await this.client.connect(this.device.address).then(function(){
				this.client.addManager('system_media', SystemMediaChannel());
				this.client.addManager('system_input', SystemInputChannel());
			}.bind(this)).catch(err => {
				//console.log('could not connect to console ['+err+']');
			});
		if(this.client._connection_status)
		{
			console.log('Xbox ['+this.device.name+'] succesfully connected!');
			this.device.liveId=this.client._console.getLiveid();
			await this.setSettings({liveid:this.client._console.getLiveid()});
			//console.log('LiveId stored ['+this.device.liveId+']');
			if(!this.device.powered)
				this._driver.triggerConsoleOn(this);
			 this.device.powered=true;
		} else {
			console.log('Failed to connect to xbox ['+this.device.name+']');
			if(this.device.powered)
				this._driver.triggerConsoleOff(this);  
			this.device.powered=false; 
		}
		this.setIfHasCapability('onoff', this.device.powered);
	}

	async processMediaState(media_state)
	{
		//console.log('received a media state ['+JSON.stringify(media_state)+']');
	}

	async bindEvents() {
		this._interval = setInterval(function(){
			//If we are no longer connected, try to reconnect
			if(!this.client._connection_status)
				this.connectConsole();
			else
				this.processMediaState(this.client.getManager('system_media').getState());
		}.bind(this), 10000);

		this.client.on('_on_media_state', function(message, xbox, remote, smartglass){
			console.log('Media state update: '+JSON.stringify(message.packet_decoded));
		}.bind(this));

		this.client.on('_on_timeout', function(message, xbox, remote, smartglass){
			console.log('Connection timed out.');
			this.setIfHasCapability('speaker_artist', '');
			this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}','App'));
			this.device.appImage.update();
			this._driver.triggerConsoleOff(this);
			this.device.powered=false;
		}.bind(this, this._interval));

		this.client.on('receive', function(message, xbox, remote, smartglass){
			//When we receive messages, something might have changed
			//console.log('received something');
		}.bind(this));

		this.client.on('_on_console_status', function(message, xbox, remote, smartglass){
			//When we receive messages, something might have changed
			console.log('received an console status message');
			this.checkActiveApp();
		}.bind(this));
	}

	onDeleted() {
        if (this._interval) {
            clearInterval(this._interval);
        }
    }

	async checkActiveApp()
	{
		var newAppId = await this.client.getActiveApp();
		
		if(this.device.currentApp.appStoreId != newAppId)
		{
			var appInfo = await require('../../lib/titlehub.js').GetappTitleBatch(newAppId.split('!')[0], this.homey);
			var appName = newAppId.split('!')[0];
			var uppImageUrl = defaultAlbumArtImage.replace('{0}','App');
			if(appInfo.result)
			{
				console.log('albumart image:'+appInfo.displayImage);
				uppImageUrl=appInfo.displayImage;
				this.device.appImage.setStream(async (stream) => {
				  const res = await fetch(appInfo.displayImage);
				  if(!res.ok)
					throw new Error('Invalid Response');
				  return res.body.pipe(stream);
				});
				appName=appInfo.name;
			}
			else{
				if(appName.indexOf('_8wekyb3d8bbwe')>0)//These are native apps without store entry
				{
					appName=appName.substring(0,appName.indexOf('_8wekyb3d8bbwe'));
					appName=appName.substring(appName.indexOf('.Xbox')+6);
					if(['Dashboard','LiveTV','Settings','LiveTV'].includes(appName))
						this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}',appName));
					else
					this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}','App'));
				} else {
					appName=appName.substring(0,appName.indexOf('_'));
					this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}','Game'));
				}
			}
			this.device.appImage.update();
			this.setIfHasCapability('speaker_artist', appName);
			console.log('app chagned to ['+this.device.name+'] is :'+newAppId);
			this._driver.triggerAppChange(this, { 'new_app_name': appName, 'new_app_family_id':newAppId, 'new_app_art_url': uppImageUrl, 'new_app_art_image': this.device.appImage});
		}
		this.device.currentApp.appStoreId = newAppId;
	}

	sendLaunchAppMessage(appname)
	{
		// const Packer = require('xbox-smartglass-core-node/src/packet/packer');
		// var titleLaunch = Packer('message.TitleLaunch');
		// titleLaunch.set('location', 0); //0=Full, 1=Fill, 2=Snapped, 3=StartView, 4=SystemUI, 5=Default
		// titleLaunch.set('uri', appname);
		// var titleLaunch_message = titleLaunch.pack(this.client._console);
		// console.log('launch app ['+JSON.stringify(titleLaunch_message)+']')
		// this.client._send(titleLaunch_message);
		return true;
	}

	sendControllerButton(button){
		this.client.getManager('system_input').sendCommand(button);
		return true;
	}

	sendMediaButton(button){
		this.client.getManager('system_media').sendCommand(button);
		return true;
	}

	async onCapabilitySpeakerPlaying( value, opts)
	{
		console.log('media playpause requested ['+value+']');
		this.setIfHasCapability('speaker_playing', value);
		if(value)
		{
			this.client.getManager('system_media').sendCommand('play');
		}
		else 
		{
			this.client.getManager('system_media').sendCommand('pause');
		}
		return true;
	}

	async onCapabilitySpeakerNext( value, opts)
	{
		console.log('media next requested ['+value+']');
		this.setIfHasCapability('speaker_next', value);
		this.client.getManager('system_media').sendCommand('next_track');
	}

	async onCapabilitySpeakerPrev( value, opts)
	{
		console.log('media prev requested ['+value+']');
		this.setIfHasCapability('speaker_prev', value);
		this.client.getManager('system_media').sendCommand('prev_track');
	}

	async onCapabilityControllerNexus(value, opts)
	{
		console.log('controller nexus requested ['+value+']');
		this.setIfHasCapability('controller_nexus', value);
		this.client.getManager('system_input').sendCommand('nexus');
	}
	async onCapabilityControllerY(value, opts)
	{
		console.log('controller Y requested ['+value+']');
		this.setIfHasCapability('controller_Y', value);
		this.client.getManager('system_input').sendCommand('y');
	}
	async onCapabilityControllerX(value, opts)
	{
		console.log('controller X requested ['+value+']');
		this.setIfHasCapability('controller_X', value);
		this.client.getManager('system_input').sendCommand('x');
	}
	async onCapabilityControllerB(value, opts)
	{
		console.log('controller B requested ['+value+']');
		this.setIfHasCapability('controller_B', value);
		this.client.getManager('system_input').sendCommand('b');
	}
	async onCapabilityControllerA(value, opts)
	{
		console.log('controller A requested ['+value+']');
		this.setIfHasCapability('controller_A', value);
		this.client.getManager('system_input').sendCommand('a');
	}
	async onCapabilityControllerMenu(value, opts)
	{
		console.log('controller Menu requested ['+value+']');
		this.setIfHasCapability('controller_Menu', value);
		this.client.getManager('system_input').sendCommand('menu');
	}
	async onCapabilityControllerView(value, opts)
	{
		console.log('controller View requested ['+value+']');
		this.setIfHasCapability('controller_View', value);
		this.client.getManager('system_input').sendCommand('view');
	}
	async onCapabilityControllerUp(value, opts)
	{
		console.log('controller Up requested ['+value+']');
		this.setIfHasCapability('controller_Up', value);
		this.client.getManager('system_input').sendCommand('up');
	}
	async onCapabilityControllerDown(value, opts)
	{
		console.log('controller Down requested ['+value+']');
		this.setIfHasCapability('controller_Down', value);
		this.client.getManager('system_input').sendCommand('down');
	}
	async onCapabilityControllerLeft(value, opts)
	{
		console.log('controller Left requested ['+value+']');
		this.setIfHasCapability('controller_Left', value);
		this.client.getManager('system_input').sendCommand('left');
	}
	async onCapabilityControllerRight(value, opts)
	{
		console.log('controller Right requested ['+value+']');
		this.setIfHasCapability('controller_Right', value);
		this.client.getManager('system_input').sendCommand('right');
	}

	// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
		console.log('device state change requested ['+value+']');
		this.setIfHasCapability('onoff', value);
		if(value)
		{
			if(!this.client._connection_status)
				this.client.powerOn({
					live_id: this.device.liveId,
					tries: 5,
					ip: this.device.address
				}).then(function(response){
					console.log('Console booted:', response);
					this._driver.triggerConsoleOn(this);
					this.device.powered=true;
				}.bind(this), function(error){
					console.log('Booting console failed:', error);
				});
			else 
				console.log('already booted');
		} else{
			if(this.client._connection_status)
				this.client.powerOff().then(function(status){
					console.log('Shutdown succes!');
					this._driver.triggerConsoleOff(this);
					this.device.powered=false;
					this.setIfHasCapability('speaker_artist', '');
					this.device.appImage.setPath(defaultAlbumArtImage.replace('{0}','App'));
					this.device.appImage.update();
				}.bind(this), function(error){
					console.log('Shutdown error:', error);
				});
			else 
				console.log('no need to shutdown');
		}
	}


		
	setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error);
		} else
        {
            console.log('Attempt to set cap ['+cap+'] not available');
        }
    }
}

module.exports = XBoxDevice;