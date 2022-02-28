import {parse32, Reader, swap32, u32, Writer} from "./util";

const BUFFER_EXTRA_BYTES = 0x250;

export class Yaz0Compressor {
    private readonly _src: Uint8Array;
    private readonly _buffer: ArrayBuffer;
    private readonly _reader: Reader;
    private readonly _srcSize: number;
    private readonly _result: Uint8Array;

    public constructor(src: Uint8Array) {
        this._src = src;
        this._buffer = this._src.buffer;
        this._reader = new Reader(this._buffer);
        this._srcSize = this._src.byteLength;
        this._result = this._encode();
    }

    private _matchPosition: number = 0;
    private _match: number = 0;
    private _srcPos: number = 0;
    private _size: number = 0;
    private _flag: number = 0;

    private _encode() {
        const dstBuffer = new ArrayBuffer(this._srcSize + BUFFER_EXTRA_BYTES);
        const dstWriter = new Writer(dstBuffer);
        const dst = new Uint8Array(dstBuffer, 16);

        // Write header and seek to the start of the encoding stream.
        dstWriter.writeBytes(new TextEncoder().encode("Yaz0"));
        dstWriter.writeUint32(this._srcSize);

        let cbPos = 0;
        let dstPos = 1;
        let bitmask = 0x80;
        let cb = 0;

        while (this._srcPos < this._srcSize) {
            let length = this._findBest(this._srcPos);

            if (length < 3) {
                // Copy a single byte
                dst[dstPos++] = this._src[this._srcPos++];
                cb |= bitmask;
            } else if (length > 0x11) {
                // Encode 3 bytes
                const dist = this._srcPos - this._matchPosition - 1;
                dst[dstPos++] = dist >>> 8;
                dst[dstPos++] = dist & 0xFF;

                if (length > 0x111) {
                    length = 0x111;
                }

                dst[dstPos++] = u32((length - 0x12) & 0xFF);
                this._srcPos += length;
            } else {
                // Encode 2 bytes
                const dist = this._srcPos - this._matchPosition - 1;
                dst[dstPos++] = ((length - 2) << 4) | (dist >>> 8);
                dst[dstPos++] = dist & 0xFF;
                this._srcPos += length;
            }

            bitmask = bitmask >>> 1;

            if (bitmask === 0) {
                dst[cbPos] = cb;
                cbPos = dstPos;

                if (this._srcPos < this._srcSize) {
                    dstPos++;
                }

                cb = 0;
                bitmask = 0x80;
            }
        }

        if (bitmask !== 0) {
            dst[cbPos] = cb;
        }

        const outSize = (dstPos + 31) & -16;
        return new Uint8Array(dstBuffer, 0, outSize);
    }

    private _findBest(srcPos: number) {
        if (this._flag === 1) {
            this._flag = 0;
            return this._size;
        }

        this._flag = 0;
        let value = this._rabinKarp(srcPos);

        if (value >= 3) {
            this._size = this._rabinKarp(srcPos + 1, true);
            if (this._size >= value + 2) {
                value = 1;
                this._flag = 1;
                this._matchPosition = this._match;
            }
        }

        return value;
    }

    private _rabinKarp(srcPos: number, useMatch?: boolean) {
        let smp = this._srcSize - srcPos;
        let startPosition = srcPos - 0x1000;

        if (smp < 3) {
            return 0;
        }

        if (smp > 0x111) {
            smp = 0x111;
        }

        if (startPosition < 0) {
            startPosition = 0;
        }

        let hash = parse32(this._src, srcPos);
        hash = hash >>> 8
        let currentHash = parse32(this._src, startPosition);
        currentHash = currentHash >>> 8;

        let bestSize = 0, bestPosition = 0;

        for (let i = startPosition; i < srcPos; i++) {
            if (currentHash === hash) {
                let currentSize = 0;
                for (currentSize = 3; currentSize < smp; currentSize++) {
                    if (this._src[i + currentSize] !== this._src[srcPos + currentSize]) {
                        break;
                    }
                }

                if (currentSize > bestSize) {
                    bestSize = currentSize;
                    bestPosition = i;
                    if (bestSize === 0x111) {
                        break;
                    }
                }
            }

            currentHash = (currentHash << 8 | this._src[i + 3]) & 0x00FFFFFF;
        }

        if (useMatch === true) {
            this._match = bestPosition;
        } else {
            this._matchPosition = bestPosition;
        }

        return bestSize;
    }

    public get result() {
        return this._result;
    }
}