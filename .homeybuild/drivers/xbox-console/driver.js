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
		let discoveredDevices;
		let waitdelay = 4000;

		session.setHandler('discover_byip', async (data) => {
			// console.log('get the add device list view ready');
			// socket.showView('list_devices');
			var address = data.address;
			console.log('Start discovery for console with ip: ' + address);
			DiscoverConsoles(address)
				.then(function (consoles) {
					const devices = consoles.map((xbox) => {
						return xbox;
					});
					discoveredDevices = devices;
				});
			return;
		});

		session.setHandler('discover_auto', async (data) => {
			console.log('Start auto discovery for consoles');
			DiscoverConsoles(null)
				.then(function (consoles) {
					const devices = consoles.map((xbox) => {
						return xbox;
					});
					discoveredDevices = devices;
				});
			return;
		});


		session.setHandler('list_devices', async (data) => {
			console.log('Device list view loaded');
			await this.sleep(waitdelay);
			console.log('Time to see what devices were found');
			return discoveredDevices;
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


module.exports = XBoxDriver;