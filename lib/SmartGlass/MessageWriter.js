'use strict';

class glassmessagewriter {
    constructor()
    {
        this.stream=Buffer.alloc(0);  //The actuall buffer array
    }

    Result()
    {
        return this.stream;
    }

    WriteUInt8(byte)
    {
        var byteBuffer = Buffer.alloc(1);
        byteBuffer.writeUInt8(byte,0);
        this.stream=Buffer.concat([this.stream,byteBuffer]);
    }

    WriteUInt16BE(int)
    {
        var intBuffer = Buffer.alloc(2);
        intBuffer.writeUInt16BE(int,0);
        this.stream=Buffer.concat([this.stream,intBuffer]);
    }

    WriteUInt32BE(long)
    {
        var longBuffer = Buffer.alloc(4);
        longBuffer.writeUInt32BE(long,0);
        this.stream=Buffer.concat([this.stream,longBuffer]);
    }

    WriteBuffer(buf)
    {
        this.stream=Buffer.concat([this.stream,buf]);
    }

    WriteUInt16BEPrefixedString(str)
    {
        var strbuf = Buffer.from(str, 'ascii');
        this.WriteUInt16BE(strbuf.length);
        this.WriteBuffer(strbuf);
        this.WriteUInt8(Buffer.alloc(1));
    }
    
}

module.exports = glassmessagewriter;