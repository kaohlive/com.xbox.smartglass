'use strict'
const crypto = require('crypto');

const cryptoBlobPrepend = Buffer.from('D637F1AAE2F0418C','hex');
const cryptoBlobAppend = Buffer.from('A8F81A574E228AB7','hex');

class CryptoBlob {
    constructor(sharedSecret)
    {
        var blob = Buffer.concat([cryptoBlobPrepend,sharedSecret,cryptoBlobAppend])
        var hash=crypto.createHash('sha512')
        hash.update(blob);
        this.cryptoBlob=Buffer.from(hash.digest('hex'),'hex');
    }

    getCryptoKey()
    {
        return this.cryptoBlob.slice(0,16);
    }
    getDerivationKey()
    {
        return this.cryptoBlob.slice(16,32);
    }
    getHmacSecret()
    {
        return this.cryptoBlob.slice(32,64);
    }
}

module.exports = CryptoBlob;