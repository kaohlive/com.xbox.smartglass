'use strict';

const Homey = require('homey');
const xbox = require('../../lib/xbox')
const keys = require('../../lib/SmartGlass/glasscryptokeys').Keys;

class XBoxDevice extends Homey.Device {
	
	onInit() {
		this.log('['+this.getData().name+'] XBoxDevice has been loaded');
		//Lets keep it at on off for now
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this._driver = this.getDriver();
		this.cryptoKeys = new keys(this.getData().certificateInfo.publicKey);
	}

	// this method is called when the Device has requested a state change (turned on or off)
	async onCapabilityOnoff( value, opts ) {
		this.setIfHasCapability('onoff', value)
		var deviceData = this.getData();
		if(value)
		{
			await xbox.sendTurnOnMessage(deviceData.name,deviceData.id,deviceData.address);
		}
		else
		{
			
			await xbox.sendTurnOffMessage(deviceData.name,deviceData.id,deviceData.clientuuid,deviceData.address,this.cryptoKeys);
		}
		this.updateDevice()
	}

	async updateDevice() {
		//First get some info we need to poll the current console status
        const settings = this.getSettings()
        const liveid = this.getData().id
		const address = this.getData().address
		//Now get an update off the console status
//Todo: determine what and how to poll data
//		const data = CP.enhance(await MNM(id))

		//Get old status from the cache
//        const prev = this.getStoreValue('cache')
//		await this.setStoreValue('cache', data)
		//And compare difference so we can launch workflow tiggers and update the device status to reflect


        console.info('device updated')
    }
	
	setIfHasCapability(cap, value) {
        if (this.hasCapability(cap)) {
            return this.setCapabilityValue(cap, value).catch(this.error)
        }
    }
}

module.exports = XBoxDevice;