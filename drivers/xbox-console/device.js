'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');

class XBoxDevice extends Homey.Device {
	
	async onInit() {
		//Remember often used values in mem
		this.device = {};
		//This is the consoles name, we do not really care how the user calls it in Homey
		this.device.name = this.getData().name;
		this.device.liveId = this.getSettings().liveid;
		this.device.currentApp = { 'appStoreId': null };
		this.device.powered = false;
		//Setup the support objects
		this._driver = this.getDriver();
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
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this.addCapability('onoff');
		this.addCapability("speaker_album");
        this.addCapability("speaker_artist");
		this.removeCapability("speaker_playing");
		//Remove some unsupporty capabilities
		//this.removeCapability("volume_down");
		//this.removeCapability("volume_mute");
		//this.removeCapability("volume_up");
		// this.removeCapability("speaker_album");
        // this.removeCapability("speaker_artist");
        // this.removeCapability("button");
        // this.removeCapability("channel_down");
        // this.removeCapability("channel_up");
        // this.removeCapability("speaker_next");
        // this.removeCapability("speaker_prev");
        // this.removeCapability("volume_set");
        // this.removeCapability("speaker_shuffle");
        // this.removeCapability("speaker_track");
	}

	async connectConsole() {
		//Attempt to connect to get current device status
		await this.client.connect(this.device.address).catch(err => {
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

	async bindEvents() {
		this._interval = setInterval(function(){
			//If we are no longer connected, try to reconnect
			if(!this.client._connection_status)
				this.connectConsole();
		}.bind(this), 10000);

		this.client.on('_on_timeout', function(message, xbox, remote, smartglass){
			console.log('Connection timed out.');
			this._driver.triggerConsoleOff(this);
			this.device.powered=false;
		}.bind(this, this._interval));

		this.client.on('receive', function(message, xbox, remote, smartglass){
			//When we receive messages, something might have changed
			this.checkActiveApp();
		}.bind(this));
	}

	onDeleted() {
        if (this._interval) {
            clearInterval(this._interval)
        }
    }

	checkActiveApp()
	{
		var newAppId = this.client.getActiveApp();
		if(this.device.currentApp.appStoreId != newAppId)
		{
			console.log('app chagned to ['+this.device.name+'] is :'+newAppId);
			this._driver.triggerAppChange(this, { 'new_app_name': newAppId })
		}
		this.device.currentApp.appStoreId = newAppId;
	}

	// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
		console.log('device state change requested ['+value+']')
		this.setIfHasCapability('onoff', value)
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
					console.log('Booting console failed:', error)
				});
			else 
				console.log('already booted');
		} else{
			if(this.client._connection_status)
				this.client.powerOff().then(function(status){
					console.log('Shutdown succes!');
					this._driver.triggerConsoleOff(this);
					this.device.powered=false;
				}.bind(this), function(error){
					console.log('Shutdown error:', error)
				});
			else 
				console.log('no need to shutdown');
		}
	}
		
	setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
		} else
        {
            console.log('Attempt to set cap ['+cap+'] not available');
        }
    }
}

module.exports = XBoxDevice;