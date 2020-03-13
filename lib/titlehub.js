'use strict'
const http = require('http.min')

//Needs to be stored in device for safe keeping
var RefreshToken = ''

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
}

module.exports.GetappTitleBatch = GetappTitleBatch

async function GetappTitleBatch(app_pfns)
{
    console.log('Attempt to get app info for app ['+app_pfns+']');
    var now=new Date();
    var expiresOn = now;
    if(Tokens.XSTS.NotAfter!='') 
        expiresOn = new Date(Tokens.XSTS.NotAfter);
    if(Tokens.XSTS.JWT=='' || now < expiresOn) 
        if(!await GetXTSTToken())
            return { "result":false };
    var body = {
        "pfns": [app_pfns],
        "windowsPhoneProductIds": []
    }
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
    }
    console.info('get app info')
    let response = (await http.post(options, body))
    if(response.statusCode == 200)
    {
        let data = JSON.parse(response.data);
        if(data.titles.length>0)
        {
            let titleInfo={
                "result":true,
                "name":data.titles[0].name,
                "displayImage":data.titles[0].displayImage
            }
            return titleInfo;
        }
        return { "result":false };
    }
    return { "result":false };
}

async function GetAccessToken()
{
    console.log('Attempt to get new Access token from the refresh token');
    var url = 'https://login.live.com/oauth20_token.srf?grant_type=refresh_token&client_id=0000000048093EE3&grant_type=refresh_token&scope=service::user.auth.xboxlive.com::MBI_SSL&refresh_token='+RefreshToken;
    console.info('get access token')
    let response = (await http.get(url))
    console.log(response);
    console.log(JSON.stringify(response));
    if(response.statusCode == 200)
    {
        console.log(response.data);
        let data = JSON.parse(response.data);
        Tokens.Access.JWT = data.access_token;
        var now = Date.now();
        var expires = now+data.expires_in;
        Tokens.Access.Expires=expires;
        RefreshToken=data.refresh_token;
        console.log('Access token retrieved ['+Tokens.Access.JWT+']');
        return true;
    }else{
        console.log('Failed to get access code: '+response.statusCode);
    }
    console.log('could not retrieve the Access token');
    return false
}

async function GetuserToken()
{
    console.log('Attempt to convert access token to user token');
    var now=new Date();
    var expiresOn = now;
    if(Tokens.Access.Expires!=null) 
        expiresOn = Tokens.Access.Expires;
    if(Tokens.Access.JWT=='' || now < expiresOn) 
        if(!await GetAccessToken())
            return false;

    var body = {
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": Tokens.Access.JWT,
        }
    }
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
    }
    console.log('get user token')
    let response = (await http.post(options, body))
    if(response.statusCode == 200)
    {
        let data = JSON.parse(response.data);
        Tokens.User.JWT = data.Token;
        Tokens.User.NotAfter = data.NotAfter;
        Tokens.User.IssueInstant = data.IssueInstant;
        console.log('User token retrieved ['+Tokens.User.JWT+']');
        return true;
    }
    console.log('could not retrieve the User token');
    return false
}

async function GetXTSTToken()
{
    console.log('Attempt to convert user token to XSTS token');
    var now=new Date();
    var expiresOn = now;
    if(Tokens.User.NotAfter!='') 
        expiresOn = new Date(Tokens.User.NotAfter);
    if(Tokens.User.JWT=='' || now < expiresOn) 
        if(!await GetuserToken())
            return false;
    var body = {
        "RelyingParty": "http://xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "UserTokens": [Tokens.User.JWT],
            "SandboxId": "RETAIL",
        }
    }
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
    }
    console.log('get XSTS token')
    let response = (await http.post(options, body))
    if(response.statusCode == 200)
    {
        let data = JSON.parse(response.data);
        Tokens.XSTS.JWT = data.Token;
        Tokens.XSTS.NotAfter = data.NotAfter;
        Tokens.XSTS.IssueInstant = data.IssueInstant;
        Tokens.XSTS.xui=data.DisplayClaims.xui[0];
        console.log('XSTS token retrieved ['+Tokens.XSTS.JWT+']');
        return true;
    }
    console.log('could not retrieve the XSTS token');
    return false
}


//Todo: implement launch app through graph api
//https://docs.microsoft.com/en-us/graph/api/send-device-command?view=graph-rest-beta&viewFallbackFrom=graph-rest-1.0