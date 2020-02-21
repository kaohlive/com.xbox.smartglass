'use strict'

 class devicetype {
    constructor()
    {
        this.XboxOne= Buffer.from('0001', 'hex');
        this.Xbox360= Buffer.from('0002', 'hex');
        this.WindowsDesktop= Buffer.from('0003', 'hex');
        this.WindowsStore= Buffer.from('0004', 'hex');
        this.WindowsPhone= Buffer.from('0005', 'hex');
        this.iPhone= Buffer.from('0006', 'hex');
        this.iPad= Buffer.from('0007', 'hex');
        this.Android= Buffer.from('0008', 'hex');
    }
}

let dt = new devicetype();

class messagetype {
    constructor()
    {
        this.ConnectRequest=Buffer.from('CC00', 'hex');
        this.ConnectResponse=Buffer.from('CC01', 'hex');
        this.DiscoveryRequest=Buffer.from('DD00', 'hex');
        this.DiscoveryResponse=Buffer.from('DD01', 'hex');
        this.PowerOnRequest=Buffer.from('DD02', 'hex');
        this.Other=Buffer.from('D00D', 'hex');
    }
}

let mt = new messagetype();

class connectionresult{ 
    constructor()
    {
        //These are success responses
        this.Success=Buffer.from('0000', 'hex');
        this.Pending=Buffer.from('0001', 'hex');
        //These are all errors
        this.FailureUnknown=Buffer.from('0002', 'hex');
        this.FailureAnonymousConnectionsDisabled=Buffer.from('0003', 'hex');
        this.FailureDeviceLimitExceeded=Buffer.from('0004', 'hex');
        this.FailureSmartGlassDisabled=Buffer.from('0005', 'hex');
        this.FailureUserAuthFailed=Buffer.from('0006', 'hex');
        this.FailureUserSignInFailed=Buffer.from('0007', 'hex');
        this.FailureUserSignInTimeOut=Buffer.from('0008', 'hex');
        this.FailureUserSignInRequired=Buffer.from('0009', 'hex');
    }
}

let cr = new connectionresult();

module.exports.devicetype = dt;
module.exports.messagetype = mt;
module.exports.connectionresult = cr;