'use strict';

class glassmessagereader {
    constructor(stringbuffer)
    {
        this.offset=0;  //The reading cursor
        this.buf=stringbuffer;  //The actuall buffer array
    }

    //When done reading, move the cursor to the new position
    movePos(addValue)
    {
        this.offset+=addValue;
    }

    readUInt16BE()
    {
        var result = this.buf.readUInt16BE(this.offset);
        this.movePos(2);
        return result;
    }

    readUInt32BE()
    {
        var result = this.buf.readUInt32BE(this.offset);
        this.movePos(4);
        return result;
    }

    //Reads a byte array from the buffer without modifications
    readBytes(length)
    {
        var result = this.buf.subarray(this.offset,length+this.offset);
        this.movePos(length);
        return result;
    }

    readUInt16BEprefixedBlob()
    {
        //Get string length from first position
        var length=this.readUInt16BE()+1;
        //Now read the actual array
        var result = this.readBytes(length);
        return result;
    }    

    readUInt16BEprefixedString()
    {
        //Get string length from first position
        var stringLength=this.readUInt16BE();
        //Now read the actual string
        var result = this.readBytes(stringLength,true).toString('ascii');
        //Now we need to skip the terminator at the end of the string
        this.movePos(1);
        return result;
    }
}

module.exports = glassmessagereader;