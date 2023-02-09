'use strict';

const Homey = require('homey');
const Smartglass = require('xbox-smartglass-core-node');

class XBoxDriver extends Homey.Driver {

	onInit() {
		this.log('XboxDriver has been inited');
		this._flowTriggerAppChange = this.homey.flow.getDeviceTriggerCard('app-playing-changed').registerRunListener((args, state) => {
			return Promise.resolve(true);
		});
		this._flowTriggerConsoleOn = this.homey.flow.getDeviceTriggerCard('xbox-powered-on').registerRunListener((args, state) => {
			return Promise.resolve(true);
		});
		this._flowTriggerConsoleOff = this.homey.flow.getDeviceTriggerCard('xbox-powered-off').registerRunListener((args, state) => {
			return Promise.resolve(true);
		});

		this.homey.flow.getActionCard('send-controller-button')
			.registerRunListener(async (args, state) => args.device.sendControllerButton(args.controller_button));

		this.homey.flow.getActionCard('send-media-button')
			.registerRunListener(async (args, state) => args.device.sendMediaButton(args.media_button));

		this.homey.flow.getActionCard('send-launch-app')
			.registerRunListener(async (args, state) => args.device.sendLaunchAppMessage(args.app_name));
	}

	async onPair(session) {
		//let discoveredDevices;
		//let waitdelay = 4000;
		let defer;

		session.setHandler('discover_byip', async (data) => {
			// console.log('get the add device list view ready');
			// socket.showView('list_devices');
			var address = data.address;
			console.log('Start discovery for console with ip: ' + address);
			defer = new Defer();
			DiscoverConsoles(address)
				.then(function (consoles) {
					const devices = consoles.map((xbox) => {
						return xbox;
					});
					defer.resolve(devices);
				});
			return;
		});

		session.setHandler('discover_auto', async (data) => {
			console.log('Start auto discovery for consoles');
			defer = new Defer();
			DiscoverConsoles(null)
				.then(function (consoles) {
					const devices = consoles.map((xbox) => {
						return xbox;
					});
					defer.resolve(devices);
				});
			return;
		});


		session.setHandler('list_devices', async (data) => {
			console.log('Device list view loaded');
			return defer.promise;
			// console.log('Device list view loaded');
			// await this.sleep(waitdelay);
			// console.log('Time to see what devices were found');
			// return discoveredDevices;
		});
	}

	triggerConsoleOn(device) {
		this._flowTriggerConsoleOn
			.trigger(device, {}, {})
			.then(this.log)
			.catch(this.error);
	}
	triggerConsoleOff(device) {
		this._flowTriggerConsoleOff
			.trigger(device, {}, {})
			.then(this.log)
			.catch(this.error);
	}
	triggerAppChange(device, tokens) {
		this._flowTriggerAppChange
			.trigger(device, tokens, {})
			.then(this.log)
			.catch(this.error);
	}


	sleep(ms) {
		return new Promise((resolve) => {
			this.homey.setTimeout(resolve, ms);
		});
	}
}
async function DiscoverConsoles(consoleip) {
	var devices = [];
	await Smartglass().discovery(consoleip).then(function (consoles) {
		consoles.map((_console) => {
			console.log('- Device found: ' + _console.message.name);
			console.log('  Address: ' + _console.remote.address + ':' + _console.remote.port);

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
			};
			devices.push(device);
			//console.log(JSON.stringify(device));

		});
		if (consoles.length == 0) {
			console.log('No consoles found on the network');
		}
	}, function (error) {
		console.log(error);
	});
	console.log('found [' + devices.length + '] consoles on your network');
	return devices;
}

class Defer {
    get isDefered() { return !!this._isDefered; }
    set isDefered(v) { this._isDefered = v; }

    get promise() { return this._promise; }
    set promise(v) { this._promise = v; }
    /** 
     * @param {Number} timeout 
     */
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    then(fun) { this._promise.then(fun); }
    catch(fun) { this._promise.catch(fun); }
    finally(fun) { this._promise.finally(fun); }
    resolve(val1, val2, val3, val4) { if (this.timeout) clearTimeout(this.timeout); this.isDefered = true; this._resolve(val1, val2, val3, val4); return this.promise; }
    reject(val1, val2, val3, val4) { if (this.timeout) clearTimeout(this.timeout); this.isDefered = true; this._reject(val1, val2, val3, val4); return this.promise; }
}


module.exports = XBoxDriver;