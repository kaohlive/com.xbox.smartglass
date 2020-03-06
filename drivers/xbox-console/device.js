'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');

class XBoxDevice extends Homey.Device {
	
	async onInit() {
		this.log('['+this.getData().name+'] XBoxDevice has been loaded');
		//Lets keep it at on off for now
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this._driver = this.getDriver();
		this.client = Smartglass();

		console.log('attempt to connect to console ['+this.getData().name+']');
		await this.updateConsole();
		await this.bindEvents();
	}

	async updateConsole() {
		//Attempt to connect to get current device status
		var deviceData = this.getData();
		await this.client.connect(deviceData.address).catch(err => {
			console.log('could not connect to console ['+err+']');
			
		});
		if(this.client._connection_status)
		{
			console.log('Xbox ['+deviceData.name+'] succesfully connected!');
			deviceData.liveId=this.client._console.getLiveid();
			console.log('LiveId stored ['+deviceData.liveId+']');
			this.setIfHasCapability('onoff', true);
		} else {
			console.log('Failed to connect to xbox ['+deviceData.name+']');
			this.setIfHasCapability('onoff', false);
		}
	}

	bindEvents() {

		this._interval = setInterval(function(){
			console.log('connection_status:', this.client._connection_status);
			//If we are no longer connected, try to reconnect
			if(!this.client._connection_status)
				this.updateConsole();
		}.bind(this), 10000);

		this.client.on('_on_timeout', function(message, xbox, remote, smartglass){
			console.log('Connection timed out.')
			//clearInterval(this._interval);
			//Lets try to reconnect and see if it is still on or not
			//this.updateConsole();
		}.bind(this, this._interval));
	}

		// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
		this.setIfHasCapability('onoff', value)
		var deviceData = this.getData();
		if(value)
		{
			if(!this.client._connection_status)
				this.client.powerOn({
					live_id: deviceData.liveid,
					tries: 5,
					ip: deviceData.address
				}).then(function(response){
					console.log('Console booted:', response)
				}, function(error){
					console.log('Booting console failed:', error)
				});
		} else{
			console.log('Console not :', response)
		}
	}
		
	setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
        }
    }
}

module.exports = XBoxDevice;