'use strict';

const Homey = require('homey');
const SG = require('../../lib/SmartGlass/SmartGlassDevices')

class XBoxDriver extends Homey.Driver {
	
	onInit() {
		this.log('XboxDriver has been inited');
	}

	onPair( socket ) {
		let discoveredDevices;
		let waitdelay=2000;

		socket.on('discover_byip', (data, callback) => {
			var address = data['address'];
			console.log('Start discovery for console with ip: '+address)
			socket.showView('list_devices');
			SG.discover(waitdelay,address)
			.then(function (consoles) {
				const devices = consoles.map((xbox) => {
					return xbox;
				});
				discoveredDevices=devices;
			})
		});

        socket.on('discover_auto', ( data, callback ) => {
			console.log('Start auto discovery for consoles')
			socket.showView('list_devices');
			SG.discover(waitdelay,null)
			.then(function (consoles) {
				const devices = consoles.map((xbox) => {
					return xbox;
				});
				discoveredDevices=devices;
			})
      	})


        socket.on('list_devices', ( data, callback ) => {
			sleep(waitdelay).then(function () {
				callback(null, discoveredDevices);
			})
      	})
	}
}

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

module.exports = XBoxDriver;