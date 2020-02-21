'use strict'

const glassmessage = require('./SmartGlassMessages').glassmessage;

var udpserver = require('../udpserver');

async function DiscoverConsoles(timeout, consoleip)
{
    var server = new udpserver();
    //Be ready for announcing consoles
    var consoles = new Array();

    server.socket.on('message', function(message, remote) {
        console.log("presence received: "+remote.address + ':' + remote.port);
        var xbox = glassmessage.DiscoverMessageToXbox(message, remote.address);
        consoles.push(xbox);
    });

    server.socket.on('error', function(err){
        console.log('udp server experienced an error:'+err);
    });

    server.socket.on('listening', function() {
        //Ask for consoles to announce themselves
        try{
            //Lets send out the presense request message
            if(consoleip==null)
            {
                server.BroadcastMessage(glassmessage.DiscoverMessage());
                console.log("Sending broadcast, waiting for responses...");
            }
            else
            {
                server.SendMessageToAddress(glassmessage.DiscoverMessage(),consoleip);
                console.log('Sending broadcast to '+consoleip+', waiting for responses...');
            }
        } catch (err) 
        {
            console.log("Error sending message:"+err);
        }        
    });

    try
    {
        await server.start();
        //Now wait for the timeout and close the server
        await sleep(timeout);
        console.log("waited till timeout, close the listener");
        server.close();
        return consoles;
    }
    catch(err)
    {
        console.log('server could not start:'+err);
        return consoles;
    }
}

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

module.exports.discover = DiscoverConsoles