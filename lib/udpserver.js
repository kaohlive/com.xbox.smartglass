'use strict'

const dgram = require('dgram');
const ip = require('ip');

class UDPServer {

    constructor()
    {
        this.isRunning = false;
        this.socket = dgram.createSocket('udp4');
        this.socket.on('listening', function() {

            console.log('UDP Server listening');
        });
        
        this.socket.on('message', function(message, remote) {
            console.log('UDP server message received: '+remote.address + ':' + remote.port);
        });

        this.socket.on('close', function() {
            this.isRunning
            console.log('UDP server stopped listening');
        });
    
        this.socket.on('error', function(err) {
            console.log('UDP server error: '+err);
        });
    }
    
    async start()
    {
        try
        {
            //Start the listening server, on a local address and any port
            this.isRunning=true;
            await this.socket.bind(0, ip.address(), false);
        }
        catch (err)
        {
            this.isRunning=false;
            console.log('Error binding UDP server');
            throw Error(err);
        }
    }

    async close()
    {
        if(this.isRunning)
        {
            try
            {
                this.isRunning=false;
                await this.socket.close();
            }
            catch(err)
            {
                this.isRunning=true;
                console.log('Error closing UDP server');
            }
        }
        else
            console.log('UDP server not running, not need to close');
    }

    async send(message, offset, length, port, addres, callback)
    {
        await this.socket.send(message, offset, length, port, addres, function(err, bytes) {
            if (err) console.log('UDP server error: '+err)
            else console.log('UDP message sent to ' + addres +':'+ port);
            callback();
        });        
    }

    async SendMessageToAddress(message, address)
    { 
        console.log('Broadcasting message: '+message.toString('hex'));
        //Send the Multicast request
        var port=5050;
        this.socket.send(message, 0, message.length, port, address, function(err, bytes) {
            if (err) console.log('UDP server error: '+err)
            else console.log('UDP multicast message sent to ' + address +':'+ port);
        });
    }    

    //Send a network wide discovery request (might be blocked by routers though :())
    async BroadcastMessage(message)
    { 

        //Send the Multicast request
        this.SendMessageToAddress(message,'239.255.255.250');
        
        var broadcast_addr_set = ['255.0.0.0','255.255.0.0'];
        broadcast_addr_set.forEach(addr => {
            var broadcast_addr = ip.subnet(ip.address(),addr).broadcastAddress;
            this.SendMessageToAddress(message,broadcast_addr);
        });
    }    
}


module.exports = UDPServer;