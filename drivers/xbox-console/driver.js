'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');

class XBoxDriver extends Homey.Driver {
	
	onInit() {
		this.log('XboxDriver has been inited');
		this._flowTriggerAppChange = new Homey.FlowCardTriggerDevice('app-playing-changed').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register();
		this._flowTriggerConsoleOn = new Homey.FlowCardTriggerDevice('xbox-powered-on').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register();
		this._flowTriggerConsoleOff = new Homey.FlowCardTriggerDevice('xbox-powered-off').registerRunListener(( args, state ) => {
			return Promise.resolve( true );
		  }).register();
	}

	onPair( socket ) {
		let discoveredDevices;
		let waitdelay=2000;

		socket.on('discover_byip', (data, callback) => {
			// console.log('get the add device list view ready');
			// socket.showView('list_devices');
			var address = data['address'];
			console.log('Start discovery for console with ip: '+address)
			DiscoverConsoles(address)
			.then(function (consoles) {
				const devices = consoles.map((xbox) => {
					return xbox;
				});
				discoveredDevices=devices;
			})
		});

        socket.on('discover_auto', ( data, callback ) => {
			console.log('Start auto discovery for consoles');
			DiscoverConsoles(null)
			.then(function (consoles) {
				const devices = consoles.map((xbox) => {
					return xbox;
				});
				discoveredDevices=devices;
			})
      	})


        socket.on('list_devices', ( data, callback ) => {
			console.log('Device list view loaded');
			sleep(waitdelay).then(function () {
				console.log('Time to see what devices were found');
				callback(null, discoveredDevices);
			})
      	})
	}

	triggerConsoleOn(device) {
        this._flowTriggerConsoleOn
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }
	triggerConsoleOff(device) {
        this._flowTriggerConsoleOff
            .trigger(device, {}, {})
            .then(this.log)
            .catch(this.error)
    }
	triggerAppChange(device, tokens) {
        this._flowTriggerAppChange
            .trigger(device, tokens, {})
            .then(this.log)
            .catch(this.error)
    }
}

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function DiscoverConsoles(consoleip)
{
    var devices = new Array();
    await Smartglass().discovery(consoleip).then(function(consoles){
        consoles.map((_console) => {
            console.log('- Device found: ' + _console.message.name);
			console.log('  Address: '+ _console.remote.address + ':' + _console.remote.port);

            let device = {
                id: _console.message.uuid,
                name: _console.message.name,
                data: {
                    name: _console.message.name,
					uuid: _console.message.uuid,
                    address: _console.remote.address,
                    devicetype: _console.message.type,
                    deviceflags: _console.message.flags,
                },
                smartglass: _console,
                store: { cache: _console }
            }
            devices.push(device);
            //console.log(JSON.stringify(device));

        });
        if(consoles.length == 0){
            console.log('No consoles found on the network')
        }
    }, function(error){
        console.log(error)
    });
    console.log('found ['+devices.length+'] consoles on your network');
    return devices;
}


module.exports = XBoxDriver;