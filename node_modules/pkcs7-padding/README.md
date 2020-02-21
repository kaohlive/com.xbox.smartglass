# pkcs7-padding

A tiny package that handles PKCS #7 padding for both strings and byte arrays.

See [RFC 5652, section 6.3](https://tools.ietf.org/html/rfc5652#section-6.3) for more details.

 * ES5
 * No dependencies
 * Tested

## Basic usage

```javascript
var pkcs7 = require('pkcs7-padding');

// padding
var data = new Uint8Array(14);
var padded = pkcs7.pad(data);

// unpadding
var raw = pkcs7.unpad(padded);
```

Note that `unpad()` throws an error when the padded data is incorrect :

```javascript
try {
  var raw = pkcs7.unpad(data);
  // use raw data
} catch (e) {
  console.error('this is not a valid PKCS #7 padded buffer');
}
```

It works with **strings** as well :

```javascript
var pkcs7 = require('pkcs7-padding');

var padded = pkcs7.pad('this is a text');
var raw = pkcs7.unpad(padded);
```

## Custom block size

You have the ability to change the block size of the padded data.<br>
The default block size is set to **16 bytes**.<br>
The maximum block size is 255 bytes.

```javascript
var pkcs7 = require('pkcs7-padding');

var data = new Uint8Array(14);
var padded = pkcs7.pad('this is a text', 32); // pad data on 32 bytes block size.

console.log(padded.byteLength); // 32

var raw = pkcs7.unpad(padded); // you can unpad any block size

console.log(raw.byteLength); // 14
```
