'use strict';
const http = require('http.min');
const Homey = require('homey');

let Tokens = {
    Access: {
        JWT: '',
        Expires: null
    },
    User: {
        JWT: '',
        IssueInstant: '',
        NotAfter: ''
    },
    XSTS: {
        JWT: '',
        IssueInstant: '',
        NotAfter: '',
        xui:{}
    }
};

function isAuthenticated()
{
    var validToken = true;
    var now=new Date();
    var expiresOn = now;
    if(Tokens.XSTS.NotAfter!='') 
        expiresOn = new Date(Tokens.XSTS.NotAfter);
    if(Tokens.XSTS.JWT=='' || now > expiresOn) 
        validToken = false;
    return validToken;
}

module.exports.GetappTitleBatch = GetappTitleBatch;

async function GetappTitleBatch(app_pfns, homey)
{
    console.log('Xbox live authenticated? '+isAuthenticated());
    console.log('Attempt to get app info for app ['+app_pfns+']');
    // var now=new Date();
    // var expiresOn = now;
    // if(Tokens.XSTS.NotAfter!='') 
    //     expiresOn = new Date(Tokens.XSTS.NotAfter);
    // console.log('XSTS Token Expires on: '+expiresOn+' now('+now+')');
    // if(Tokens.XSTS.JWT=='' || now > expiresOn) 
    if(!isAuthenticated())
        if(!await GetXTSTToken(homey))
            return { "result":false, "name":"Xbox live is not authenticated, please use the app settings" };
    var body = {
        "pfns": [app_pfns],
        "windowsPhoneProductIds": []
    };
    var options = {
        protocol: 'https:',
        host: 'titlehub.xboxlive.com',
        path: '/titles/batch/decoration/detail',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'Accept-Language':'en-US',
          'x-xbl-contract-version': '2',
          'x-xbl-client-name': 'XboxApp',
          'x-xbl-client-type': 'UWA',
          'x-xbl-client-version': '39.39.22001.0',
          'Authorization': 'XBL3.0 x='+Tokens.XSTS.xui.uhs+';'+Tokens.XSTS.JWT,
        }
    };
    console.info('get app info');
    let result = (await http.post(options, body));
    if(result.response.statusCode == 200)
    {
        let data = JSON.parse(result.data);
        if(data.titles.length>0)
        {
            let titleInfo={
                "result":true,
                "name":data.titles[0].name,
                "displayImage":data.titles[0].displayImage
            };
            console.log('App found with name:'+titleInfo.name);
            return titleInfo;
        } else {
            console.log('Sorry no app found');
        }
        return { "result":false };
    }
    return { "result":false };
}

async function GetAccessToken(homey)
{
    console.log('Attempt to get new Access token from the refresh token');
    var url = 'https://login.live.com/oauth20_token.srf?grant_type=refresh_token&client_id=0000000048093EE3&grant_type=refresh_token&scope=service::user.auth.xboxlive.com::MBI_SSL&refresh_token='+homey.app.getRefreshToken();
    console.info('get access token');
    let result = (await http.get(url));
    if(result.response.statusCode == 200)
    {
        let data = JSON.parse(result.data);
        Tokens.Access.JWT = data.access_token;
        var now = Date.now();
        var expires = now+(data.expires_in+1000);
        Tokens.Access.Expires=expires;
        homey.app.updateRefreshToken(data.refresh_token);
        console.log('New refresh retrieved ['+data.refresh_token+']');
        return true;
    }else{
        console.log('Failed to get access code: '+result.response.statusCode);
    }
    console.log('could not retrieve the Access token');
    return false;
}

async function GetuserToken(homey)
{
    console.log('Attempt to convert access token to user token');
    var now=new Date();
    var expiresOn = now;
    if(Tokens.Access.Expires!=null) 
        expiresOn = Tokens.Access.Expires;
    console.log('Access Token Expires on: '+expiresOn+' now('+now+')');
    if(Tokens.Access.JWT=='' || now > expiresOn) 
        if(!await GetAccessToken(homey))
            return false;

    var body = {
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": Tokens.Access.JWT,
        }
    };
    var options = {
        protocol: 'https:',
        host: 'user.auth.xboxlive.com',
        path: '/user/authenticate',
        headers: {
          'content-type': 'application/json',
          'x-xbl-contract-version': '1',
          'accept': 'application/json',
          'Accept-Language':'en-US'
        }
    };
    console.log('get user token');
    let result = (await http.post(options, body));
    if(result.response.statusCode == 200)
    {
        let data = JSON.parse(result.data);
        Tokens.User.JWT = data.Token;
        Tokens.User.NotAfter = data.NotAfter;
        Tokens.User.IssueInstant = data.IssueInstant;
        console.log('User token retrieved');
        return true;
    }
    console.log('could not retrieve the User token');
    return false;
}

async function GetXTSTToken(homey)
{
    console.log('Attempt to convert user token to XSTS token');
    var now=new Date();
    var expiresOn = now;
    if(Tokens.User.NotAfter!='') 
        expiresOn = new Date(Tokens.User.NotAfter);
    console.log('User Token Expires on: '+expiresOn+' now('+now+')');
    if(Tokens.User.JWT=='' || now > expiresOn) 
        if(!await GetuserToken(homey))
            return false;
    var body = {
        "RelyingParty": "http://xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "UserTokens": [Tokens.User.JWT],
            "SandboxId": "RETAIL",
        }
    };
    var options = {
        protocol: 'https:',
        host: 'xsts.auth.xboxlive.com',
        path: '/xsts/authorize',
        headers: {
          'content-type': 'application/json',
          'x-xbl-contract-version': '1',
          'accept': 'application/json',
          'Accept-Language':'en-US'
        }
    };
    console.log('get XSTS token');
    let result = (await http.post(options, body));
    if(result.response.statusCode == 200)
    {
        let data = JSON.parse(result.data);
        Tokens.XSTS.JWT = data.Token;
        Tokens.XSTS.NotAfter = data.NotAfter;
        Tokens.XSTS.IssueInstant = data.IssueInstant;
        Tokens.XSTS.xui=data.DisplayClaims.xui[0];
        console.log('XSTS token retrieved, valid till '+Tokens.XSTS.NotAfter);
        return true;
    }
    console.log('could not retrieve the XSTS token');
    return false;
}


//Todo: implement launch app through graph api
//https://docs.microsoft.com/en-us/graph/api/send-device-command?view=graph-rest-beta&viewFallbackFrom=graph-rest-1.0