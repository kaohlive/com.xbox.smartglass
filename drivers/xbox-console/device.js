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
		//await this.connectConsole();
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

	async checkConsoleOnline() {
		await this.client.discovery(this.device.address).then(function(consoles){
			if(consoles.length > 0){
				console.log('Xbox ['+this.device.name+'] Console is online. Lets connect...');
				//Attempt to connect to get current device status
				//We should determine first if its really on, not just connected
				this.client.connect(this.device.address).then(function(){
					//console.log('We can connect, lets not load the Managers, see if if this a state that allows us to monitor messages wihtout booting');
					this.client.addManager('system_media', SystemMediaChannel());
				}.bind(this)).catch(err => {
					console.log('could not connect to console ['+err+']');
				}).then(function (){
					if(this.client._connection_status)
					{
						console.log('Xbox ['+this.device.name+'] succesfully connected!');
						this.device.liveId=this.client._console.getLiveid();
						this.setSettings({liveid:this.client._console.getLiveid()}).then(function () {
							console.log('LiveId stored ['+this.device.liveId+']');
						}.bind(this));
						this.device.powered=true;
						this.setIfHasCapability('onoff', true);
						this._driver.triggerConsoleOn(this);
					} else {
						console.log('Failed to connect to xbox ['+this.device.name+']');
						this.device.powered=false; 
						this.setIfHasCapability('onoff', false);
						this._driver.triggerConsoleOff(this);
					}					
				}.bind(this));
			}
			else {
				console.log('Xbox ['+this.device.name+'] Console is offline...');
				this.setIfHasCapability('onoff', false);
			}
		}.bind(this));
	}

	async processMediaState(media_state)
	{
		//console.log('received a media state ['+JSON.stringify(media_state)+']');
	}

	async bindEvents() {
		this._interval = setInterval(function(){
			//If we are no longer connected, try to reconnect
			if(!this.client._connection_status)
				this.checkConsoleOnline();
			else
			{
				//Check if the Manager media has been activated
				if(this.client.getManager('system_media'))
					this.processMediaState(this.client.getManager('system_media').getState());
			}
		}.bind(this), 20000);

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
			console.log('received an console status message ['+JSON.stringify(message)+']');
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
					this._driver.triggerGameStarted(this);
				}
			}
			this.device.appImage.update();
			this.setIfHasCapability('speaker_artist', appName);
			console.log('app changed to ['+this.device.name+'] is :'+newAppId);
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
		//Check if we did not load the input manager yet
		if(!this.client.getManager('system_input'))
		{
			//See if the console is actually online and connected
			if(this.client._connection_status) {
				console.log('Input Manager not loaded yet, load it first');
				this.client.addManager('system_input', SystemInputChannel());
				setTimeout(function(){
					//We need the input manager fully load, but it has no event or async pattern
					//Lets les wait a sec
					console.log('Input Manager loaded, lets send the command button');
					this.client.getManager('system_input').sendCommand(button);
				}.bind(this), 25000);
				return true;
			} else {
				console.log('Button command, but we are not connected, so cant send a command');
				return false;
			}
		} else {
			//If we loaded it we should be able to use it
			this.client.getManager('system_input').sendCommand(button);
			return true;
		}
	}

	sendMediaButton(button){
		if(this.client.getManager('system_input'))
		{
			this.client.getManager('system_media').sendCommand(button);
			return true;
		} else {
			return false;
		}
	}

	async onCapabilitySpeakerPlaying( value, opts)
	{
		console.log('media playpause requested ['+value+']');
		this.setIfHasCapability('speaker_playing', value);
		if(value)
		{
			this.sendMediaButton('play');
		}
		else 
		{
			this.sendMediaButton('pause');
		}
		return true;
	}

	async onCapabilitySpeakerNext( value, opts)
	{
		console.log('media next requested ['+value+']');
		if(this.sendMediaButton('next_track'))
			this.setIfHasCapability('speaker_next', value);
	}

	async onCapabilitySpeakerPrev( value, opts)
	{
		console.log('media prev requested ['+value+']');
		if(this.sendMediaButton('prev_track'))
			this.setIfHasCapability('speaker_prev', value);
	}

	async onCapabilityControllerNexus(value, opts)
	{
		console.log('controller nexus requested ['+value+']');
		if(this.sendControllerButton('nexus'))
			this.setIfHasCapability('controller_nexus', value);
	}
	async onCapabilityControllerY(value, opts)
	{
		console.log('controller Y requested ['+value+']');
		if(this.sendControllerButton('y'))
			this.setIfHasCapability('controller_Y', value);
	}
	async onCapabilityControllerX(value, opts)
	{
		console.log('controller X requested ['+value+']');
		if(this.sendControllerButton('x'))
			this.setIfHasCapability('controller_X', value);
	}
	async onCapabilityControllerB(value, opts)
	{
		console.log('controller B requested ['+value+']');
		if(this.sendControllerButton('b'))
			this.setIfHasCapability('controller_B', value);
	}
	async onCapabilityControllerA(value, opts)
	{
		console.log('controller A requested ['+value+']');
		if(this.sendControllerButton('a'))
			this.setIfHasCapability('controller_A', value);
	}
	async onCapabilityControllerMenu(value, opts)
	{
		console.log('controller Menu requested ['+value+']');
		if(this.sendControllerButton('menu'))
			this.setIfHasCapability('controller_Menu', value);
	}
	async onCapabilityControllerView(value, opts)
	{
		console.log('controller View requested ['+value+']');
		if(this.sendControllerButton('view'))
			this.setIfHasCapability('controller_View', value);
	}
	async onCapabilityControllerUp(value, opts)
	{
		console.log('controller Up requested ['+value+']');
		if(this.sendControllerButton('up'))
			this.setIfHasCapability('controller_Up', value);
	}
	async onCapabilityControllerDown(value, opts)
	{
		console.log('controller Down requested ['+value+']');
		if(this.sendControllerButton('down'))
			this.setIfHasCapability('controller_Down', value);
	}
	async onCapabilityControllerLeft(value, opts)
	{
		console.log('controller Left requested ['+value+']');
		if(this.sendControllerButton('left'))
			this.setIfHasCapability('controller_Left', value);
	}
	async onCapabilityControllerRight(value, opts)
	{
		console.log('controller Right requested ['+value+']');
		if(this.sendControllerButton('right'))
			this.setIfHasCapability('controller_Right', value);
	}

	// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
		console.log('device state change requested ['+value+']');
		this.setIfHasCapability('onoff', value);
		if(value)
		{
			if(!this.client._connection_status)
			{
				console.log('Will attempt to boot the console: ['+this.device.liveId+','+this.device.address+']');
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
			} else {
				console.log('already connected, lets load the input manager to ensure we are active');
				this.client.addManager('system_input', SystemInputChannel());
			}
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