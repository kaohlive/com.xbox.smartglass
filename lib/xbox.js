'use strict'
var udpserver = require('./udpserver');
const glassmessage = require('./SmartGlass/SmartGlassMessages').glassmessage;

module.exports.sendTurnOnMessage = function (name, liveid, address) {
    console.log('Xbox with name '+name+' request to turn on ('+liveid+'), ip: '+address);
    var server = new udpserver();
    server.socket.on('listening', function() {
        var powerOnrequest = glassmessage.PowerOnMessage(liveid);
        try{
            server.SendMessageToAddress(powerOnrequest,address);
            console.log('Sending PowerOn request ['+name+':'+address+'], waiting for responses...');
        } catch (err) 
        {
            console.log("Error sending poweron message:"+err);
        }        
    });
    server.socket.on('message', function(message, remote) {
        console.log("ack received: "+remote.address + ':' + remote.port);
        console.log(message.toString('hex'));
    });    
    server.start();
    sleep(500).then(function (){
        console.log("waited till timeout, close the listener");
        server.close();
    })
}

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

module.exports.sendTurnOffMessage = function (name, liveid, clientuuid, address, keys) {
    console.log('Xbox with name '+name+' request to turn off ('+liveid+')');
    var server = new udpserver();
    server.socket.on('listening', function() {
        glassmessage.ConnectAnonymousRequestMessage(clientuuid,keys).then(connectRequest => {
            try{
                server.SendMessageToAddress(connectRequest,address)
                console.log('Sending Connect request ['+name+':'+address+'], waiting for responses...');
            } catch (err) 
            {
                console.log("Error sending connect message:"+err);
                
            }   
        },
        err => {
            console.log('no message created due to error: '+err);
        });   
    });
    server.socket.on('message', function(message, remote) {
        console.log("response received: "+remote.address + ':' + remote.port);
        console.log(message.toString('hex'));
    });    
    server.start();
    sleep(60000).then(function (){
        console.log("waited till timeout, close the listener");
        server.close();
    })    
}