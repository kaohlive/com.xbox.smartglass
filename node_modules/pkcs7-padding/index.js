var DEF_PAD_LENGTH = 16;

/**
 * Append PKCS#7 padding to a buffer or a string.
 *
 * @see {@link http://tools.ietf.org/html/rfc5652|RFC 5652 section 6.3}
 *
 * @param {!(string|Uint8Array|Uint8ClampedArray)} data - the data to be padded
 * @param {number=} size - the block size to pad for
 * @return {!(string|Uint8Array|Uint8ClampedArray)} the padded data, if the function succeed
 */
function pad(data, size) {
  var out = data;
  if (typeof size !== 'number') {
    size = DEF_PAD_LENGTH;
  } else if (size > 255) {
    throw new RangeError('pad(): PKCS#7 padding cannot be longer than 255 bytes');
  } else if (size < 0) {
    throw new RangeError('pad(): PKCS#7 padding size must be positive');
  }
  if (typeof data === 'string') {
    var padLen = size - data.length % size;
    if (isNaN(padLen)) padLen = 0;
    var padChar = String.fromCharCode(padLen);
    for (var i = 0; i < padLen; i++) {
      out += padChar;
    }
  } else if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    var baseLen = data.byteLength;
    padLen = size - baseLen % size;
    if (isNaN(padLen)) padLen = 0;
    var newLen = baseLen + padLen;
    out = new data.constructor(newLen);
    out.set(data);
    for (i = baseLen; i < newLen; i++) {
      out[i] = padLen;
    }
  } else {
    throw new TypeError('pad(): data could not be padded');
  }
  return out;
}

/**
 * Remove the PKCS#7 padding from a buffer or a string.
 *
 * @see {@link http://tools.ietf.org/html/rfc5652|RFC 5652 section 6.3}
 *
 * @param {!(string|Uint8Array|Uint8ClampedArray)} data - the data to be unpadded
 * @return {!(string|Uint8Array|Uint8ClampedArray)} the unpadded data, if the function succeed
 */
function unpad(data) {
  var out = data;
  if (typeof data === 'string' && data.length > 0) {
    var padLen = data.charCodeAt(data.length - 1);
    if (padLen > data.length) {
      throw new Error('unpad(): cannot remove ' + padLen + ' bytes from a ' +
        data.length + '-byte(s) string');
    }
    for (var i = data.length - 2, end = data.length - padLen; i >= end; i--) {
      if (data.charCodeAt(i) !== padLen) {
        throw new Error('unpad(): found a padding byte of ' + data.charCodeAt(i) +
          ' instead of ' + padLen + ' at position ' + i);
      }
    }
    out = data.substring(0, end);
  } else if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    var baseLen = data.byteLength;
    padLen = data[baseLen - 1];
    var newLen = baseLen - padLen;
    if (newLen < 0) {
      throw new Error('unpad(): cannot remove ' + padLen + ' bytes from a ' +
        baseLen + '-byte(s) string');
    }
    for (i = baseLen - 2; i >= newLen; i--) {
      if (data[i] !== padLen) {
        throw new Error('unpad(): found a padding byte of ' + data[i] +
          ' instead of ' + padLen + ' at position ' + i);
      }
    }
    out = data.slice(0, newLen);
  }
  return out;
}

module.exports = { pad: pad, unpad: unpad };
