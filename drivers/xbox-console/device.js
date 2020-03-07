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
		if(this.getSettings().console_address=='')
			await this.setSettings({ console_address:this.getData().address+'' });
		this.device.address = this.getSettings().console_address;
		this.log('['+this.device.name+'] XBoxDevice ('+this.device.liveId+':'+this.device.address+') has been loaded');
		//Register our capabilities
		//Lets keep it at on off for now
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this._driver = this.getDriver();
		this.client = Smartglass();

		await this.updateConsole();
		await this.bindEvents();
	}

	async updateConsole() {
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
			this.setIfHasCapability('onoff', true); this.device.powered=true;
		} else {
			console.log('Failed to connect to xbox ['+this.device.name+']');
			if(this.device.powered)
				this._driver.triggerConsoleOff(this);  this.device.powered=false;
			this.setIfHasCapability('onoff', false);
		}
	}

	async bindEvents() {
		this._interval = setInterval(function(){
			//If we are no longer connected, try to reconnect
			if(!this.client._connection_status)
				this.updateConsole();
			else{
				//Else start doing our events
				this.checkActiveApp();
			}
		}.bind(this), 10000);

		this.client.on('_on_timeout', function(message, xbox, remote, smartglass){
			console.log('Connection timed out.')
		}.bind(this, this._interval));
	}

	checkActiveApp()
	{
		var newAppId = this.client.getActiveApp();
		console.log('current app on ['+this.device.name+'] is :'+newAppId);
		if(this.device.currentApp.appStoreId != newAppId)
			this._driver.triggerAppChange(this, { 'new_app_name': newAppId })
		this.device.currentApp.appStoreId = newAppId;
	}

		// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
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
				}, function(error){
					console.log('Booting console failed:', error)
				});
		} else{
			if(this.client._connection_status)
				this.client.powerOff().then(function(status){
					console.log('Shutdown succes!')
				}, function(error){
					console.log('Shutdown error:', error)
				});
		}
	}
		
	setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
        }
    }
}

module.exports = XBoxDevice;