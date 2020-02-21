'use strict'
//const EC = require('elliptic').ec
const x509 = require('js-x509-utils');
const crypto = require('crypto');


module.exports.getCertInfo = function(certificate)
{
    try
    {
        let certficateInfo={};
        //Parse the certificate using asn1 der to x509
        var x509cert = x509.info(certificate,'der');
        //Get signature info
        let signature = {
            algorithm: x509cert.tbsCertificate.signature.algorithm.toString('ascii'),
            parameters: x509cert.tbsCertificate.signature.parameters.toString('hex'),
            signature: x509cert.signature.data.toString('hex')
        }
        certficateInfo.signature=signature;
        //Get issuer
        x509cert.tbsCertificate.issuer.value.map((rdnSequences) => {
            rdnSequences.map((rdnSequence) => {
                certficateInfo.issuer=rdnSequence.value.toString('utf8',2);
                console.log('cert issuer: '+certficateInfo.issuer);
            });
        });
        //Get validity dates
        let validity = {
            notBefore: x509cert.tbsCertificate.validity.notBefore,
            notAfter: x509cert.tbsCertificate.validity.notAfter
        }
        certficateInfo.validity=validity;
        //Get subject
        x509cert.tbsCertificate.subject.value.map((rdnSequences) => {
            rdnSequences.map((rdnSequence) => {
                var subject=rdnSequence.value.toString('utf8',2);
                certficateInfo.subject=subject;
                console.log('cert subject: '+certficateInfo.subject);
            });
        });
        //Get public Key
        let publicKey = {
            algorithm: {
                algorithm: x509cert.tbsCertificate.subjectPublicKeyInfo.algorithm.algorithm.toString('ascii'), //But always 1.2.840.10045.2.1 ecPublicKey (elliptic curve)
                parameters: x509cert.tbsCertificate.subjectPublicKeyInfo.algorithm.parameters.toString('hex') //But always 1.2.840.10045.3.1.7 prime265v1 (curve name)
            },
            subjectPublicKey: x509cert.tbsCertificate.subjectPublicKeyInfo.subjectPublicKey.data.toString('hex')
        };
        certficateInfo.publicKey=publicKey;
        return certficateInfo;
    }
    catch(err)
    {
        console.log('could not process certificate: '+err);
    }
}


module.exports.encryptData = function (data, cryptoKey, iv)
{
    var cipher = crypto.createCipheriv('aes-128-cbc',cryptoKey,iv).setAutoPadding(false);
    // console.log('Pre padding: '+data.toString('hex'));
    data = Buffer.from(require('pkcs7-padding').pad(Uint8Array.from(data)));
    // console.log('Pre cipher: '+data.toString('hex'));
    //the result is hex encoded
    var crypteddata = cipher.update(data,null,'hex');
    crypteddata+=cipher.final('hex');
    //console.log('Post cipher: '+crypteddata);
    return crypteddata;
}
module.exports.decryptData = function (crypteddata, cryptoKey, iv)
{
    var decipher = crypto.createDecipheriv('aes-128-cbc',cryptoKey,iv).setAutoPadding(false);
    var data = decipher.update(crypteddata,null,'hex');
    data+=decipher.final('hex');
    //Data is now a decoded hex string
    console.log('Post decipher: '+data);
    var padded =Uint8Array.from(Buffer.from(data,'hex'));
    console.log('padded data:'+padded.toString('hex'));
    var unpadded = Buffer.from(require('pkcs7-padding').unpad(padded));
    console.log('Post unpadding: '+unpadded.toString('hex'));
    return unpadded;
}

module.exports.generateRandomIV = function ()
{
    return crypto.randomBytes(16);
}

module.exports.calculateMessageSignature = function (message, secret)
{
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(message);
    return hmac.digest();
}

module.exports.generate_uuid = function()
{
    var rnds = crypto.randomBytes(16);
    // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    
    var buf=Buffer.alloc(16);
    // Copy bytes to buffer, if provided
    if (buf) {
        for (var ii = 0; ii < 16; ++ii) {
        buf[ii] = rnds[ii];
        }
    }
    
    return buf;
}





