'use strict'

const keyutil=require('js-crypto-key-utils');
const ec=require('js-crypto-ec');

class Keys {

    //Holds our keys in JWT format
    constructor(subjectPublicKey)
    {
        var octetBinary=Buffer.from(subjectPublicKey.subjectPublicKey,'hex'); //So convert our public key from Octet
        var keyobj=new keyutil.Key('oct',octetBinary, {namedCurve: 'P-256'}); //Tell the key util to import the octet as a EC P265
        keyobj.export('jwt', {outputPublic: true}).then((Key)=>{                //Now store the Key as Jwt
            this.serverKey=Key;
            //console.log('console key:'+JSON.stringify(this.serverKey))
        })
        ec.generateKey('P-256').then( (Key) => {                            //Generate a device Key and store it as Jwt
            this.clientKey=Key;
            //console.log('client key:'+JSON.stringify(this.clientKey))
        })
    }

    async getClientPublicKey()
    {
        var key=new keyutil.Key('jwk',this.clientKey.publicKey);
        //console.log('export key:'+JSON.stringify(key))
        var octetkey = await key.export('oct', {outputPublic: true});       //Export it as Oct binary array again
        //console.log('export publickey:'+JSON.stringify(octetkey))
        return octetkey;
    }

    async generateSharedSecret()
    {
        var sharedSecret = await ec.deriveSecret(this.serverKey,this.clientKey.privateKey);
        //console.log('secret:'+JSON.stringify(sharedSecret))
        return sharedSecret;
    }
}

module.exports.Keys = Keys;