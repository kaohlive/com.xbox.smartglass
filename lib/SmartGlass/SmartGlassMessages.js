'use strict'

const messagetype = require('./enums').messagetype;
const devicetype = require('./enums').devicetype;

const glassmessagereader = require('./MessageReader');
const glassmessagewriter = require('./MessageWriter');
//Add some crypto support since we need to use certificates
const crypto = require('./glasscrypto');
const cryptokeyhash = require('./glasscryptokeyhash')

class GlassMessage
{
    constructor()
    {
        this.messagetype = messagetype;
    }

    DiscoverMessageToXbox(message, address)
    {
        //The glassmessagereader keeps track of the offset, so it can only read forward from the current position
        //Read the header values
        var reader = new glassmessagereader(message);
        var packettype = reader.readUInt16BE();
        if(messagetype.DiscoveryResponse.readUInt16BE(0)==packettype)
        {
            var payloadlength=reader.readUInt16BE();
            var version=reader.readUInt16BE();
            //console.log('packet type:'+packettype+'-normalpayloadlength:'+payloadlength);
            //Now read the payload values
            var deviceflags=reader.readUInt32BE();
            var devicetype=reader.readUInt16BE();
            var consolename = reader.readUInt16BEprefixedString();
            var consoluuid = reader.readUInt16BEprefixedString();
            var lasterror=reader.readUInt32BE();
            var certificate = reader.readUInt16BEprefixedBlob();
            //Convert the paylod into the xbox device object
            console.log('consolename:'+consolename+'-id:'+consoluuid+'-devicetype:'+devicetype);
            let xbox = {
                name: consolename,
                data: {
                    name: consolename,
                    uuid: consoluuid,
                    clientuuid: crypto.generate_uuid().toString('hex'),
                    address: address,
                    devicetype: devicetype,
                    deviceflags: deviceflags,
                    certificateInfo: crypto.getCertInfo(certificate)
                },
                store: { cache: message }
            }
            xbox.data.id=xbox.data.certificateInfo.subject;

            //console.log(JSON.stringify(xbox));
            return xbox;
        } 
        else
        {
            console.log('message received was not a response');
            return null;
        }
    }

    DiscoverMessage()
    {
        //Payload, Flags-DeviceType-MinVersion-MaxVersion
        var messagePayload = new glassmessagewriter();
        messagePayload.WriteUInt32BE(0); //Flags
        messagePayload.WriteUInt16BE(devicetype.WindowsStore.readUInt16BE(0)); //Device Type
        messagePayload.WriteUInt16BE(0); //MinVersion
        messagePayload.WriteUInt16BE(2); //MaxVersion
        //Header,  PacketType-PayLoadLength(always 10 for discover request)-Version
        var messageHeader = new glassmessagewriter();
        messageHeader.WriteUInt16BE(messagetype.DiscoveryRequest.readUInt16BE(0)); //Message Type
        messageHeader.WriteUInt16BE(messagePayload.Result().length); //Payload length
        messageHeader.WriteUInt16BE(0); //Version
        var message = Buffer.concat([messageHeader.Result(), messagePayload.Result()]);
        return message;     
    }

    PowerOnMessage(consoleLiveID)
    {
        //Payload, liveid string
        var messagePayload = new glassmessagewriter();
        messagePayload.WriteUInt16BEPrefixedString(consoleLiveID);
        //Header,  PacketType-PayLoadLength-Version
        var messageHeader = new glassmessagewriter();
        messageHeader.WriteUInt16BE(messagetype.PowerOnRequest.readUInt16BE(0));
        messageHeader.WriteUInt16BE(messagePayload.Result().length);
        messageHeader.WriteUInt16BE(0);
        var message = Buffer.concat([messageHeader.Result(), messagePayload.Result()]);
        return message;     
    }

    //TODO: to much happening here
    ConnectAnonymousRequestMessage(uuid,keys)
    {
        var promise = new Promise(async function(resolve, reject){
            try{
                //Lets collect some info we need in our message
                var uuid_buf = Buffer.from(uuid,'hex');
                //So we need to generate a shared secret from the server public key from the certificate
                var clientPublicKey = Buffer.from(await keys.getClientPublicKey());
                var sharedSecret = Buffer.from(await keys.generateSharedSecret());
                //We need the secret salted with KDF salts and SHA-512 hashed as cryptokey
                var cryptoblob = new cryptokeyhash(sharedSecret);
                //The InitVector is used in header and used to encrypt the payload with later on
                var IV = crypto.generateRandomIV();
                
                //Generate the unprotected payload
                var messagePayload = new glassmessagewriter();
                messagePayload.WriteBuffer(uuid_buf);
                messagePayload.WriteUInt16BE(Buffer.from('0000')); //Key Type EC DH P256 (same as the p265 used to generate the keys)
                messagePayload.WriteBuffer(clientPublicKey);  //Write the public key as byte array
                messagePayload.WriteBuffer(IV)  //Write the random Init Vector
                console.log('uuid:'+uuid_buf.toString('hex'));
                console.log('secret:'+sharedSecret.toString('hex'));
                console.log('key:'+clientPublicKey.toString('hex'));
                console.log('iVector:'+IV.toString('hex'));
                //Generate the protected payload
                var messageProtectedPayload = new glassmessagewriter();
                messageProtectedPayload.WriteUInt16BEPrefixedString(''); //Empty UserHash
                messageProtectedPayload.WriteUInt16BEPrefixedString(''); //Empty Auth token
                messageProtectedPayload.WriteUInt32BE(0); //Request number
                messageProtectedPayload.WriteUInt32BE(0); //Request Group start
                messageProtectedPayload.WriteUInt32BE(1); //Request Group end
                //Generate the message header
                var messageHeader = new glassmessagewriter();
                messageHeader.WriteUInt16BE(messagetype.ConnectRequest.readUInt16BE(0)); //Message Type
                messageHeader.WriteUInt16BE(messagePayload.Result().length); //Payload length
                messageHeader.WriteUInt16BE(messageProtectedPayload.Result().length); //Protected Payload length, needs to be done before padding and encrypting
                messageHeader.WriteUInt16BE(2); //Version
                //Now encrypt the protected payloads
                var encryptedpayload = Buffer.from(crypto.encryptData(messageProtectedPayload.Result(),cryptoblob.getCryptoKey(),IV),'hex');
                var signature = crypto.calculateMessageSignature(encryptedpayload,cryptoblob.getHmacSecret());
                //Determine if we need to segment the payload
                var payloadlength = messagePayload.Result().length;
                payloadlength+=encryptedpayload.length;
                //Now log the message end result
                console.log('Final messageheader: '+messageHeader.Result().toString('hex'));
                console.log('Final message payload: '+messagePayload.Result().toString('hex'));
                console.log('Final protected payload: '+encryptedpayload.toString('hex'));
                console.log('Total payload length: '+payloadlength);
                console.log('Signature Hash: '+signature.toString('hex'));
                //Try to decode again, just to ensure we end up with the same payload
                // var decryptedpayload = crypto.decryptData(encryptedpayload,cryptoblob.getCryptoKey(),IV);
                // console.log('after decryption: '+decryptedpayload.toString('hex'));
                //Now create the total message
                var message = Buffer.concat([messageHeader.Result(), messagePayload.Result(), encryptedpayload, signature]);
            }catch(err) {
                reject(err);
            }
            resolve(message);
        })
        return promise;
    }
}


let gm = new GlassMessage();

module.exports.glassmessage = gm;