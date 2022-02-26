import {Reader, swap16, Writer} from "./util";

const COMPRESSED_SIZE = 0x02000000;
const DECOMPRESSED_SIZE = 0x04000000;

interface DmaRecord {
    virtualStart: number;
    virtualEnd: number;
    physicalStart: number;
    physicalEnd: number;
}

export default class Decompressor {
    private readonly _buffer: ArrayBuffer;
    private readonly _in: Reader;
    private readonly _dmaOffset: number;
    private readonly _tableSize: number;
    private readonly _tableCount: number;
    private readonly _isLE: boolean;

    public constructor(buffer: ArrayBuffer) {
        this._buffer = buffer;
        this._in = new Reader(this._buffer);
        this._dmaOffset = this._findDmaTableOffset();

        const dmaTable = this._readDmaRecord(2);
        this._tableSize = dmaTable.virtualEnd - dmaTable.virtualStart;
        this._tableCount = this._tableSize / 16;

        this._isLE = this._in.readUint8(0) === 0x37;
        if (this._isLE) {
            this._fixEndianness();
        }
    }

    private _fixEndianness() {
        const array = new Uint16Array(this._buffer);
        for (let i = 0; i < (COMPRESSED_SIZE / 2); i++) {
            array[i] = swap16(array[i]);
        }
    }

    private _findDmaTableOffset(): number {
        const array = new Uint32Array(this._buffer);
        for (let i = 1048; i + 4 < 0x01000000; i += 4) {
            if (array[i] === 0x00000000 && array[i + 1] === 0x60100000) {
                return i * 4;
            }
        }

        throw new Error("no DMA table found");
    }

    private _readDmaRecord(index: number): DmaRecord {
        this._in.seek(this._dmaOffset, "begin");
        this._in.seek(index * 16);

        return {
            virtualStart: this._in.readUint32(undefined, this._isLE),
            virtualEnd: this._in.readUint32(undefined, this._isLE),
            physicalStart: this._in.readUint32(undefined, this._isLE),
            physicalEnd: this._in.readUint32(undefined, this._isLE),
        };
    }

    private _writeDmaRecord(out: Writer, index: number, record: DmaRecord) {
        out.seek(this._dmaOffset, "begin");
        out.seek(index * 16);
        out.writeUint32(record.virtualStart, undefined, this._isLE);
        out.writeUint32(record.virtualEnd, undefined, this._isLE);
        out.writeUint32(record.physicalStart, undefined, this._isLE);
        out.writeUint32(record.physicalEnd, undefined, this._isLE);
    }

    public inflate() {
        const info = this._readDmaRecord(2);

        // Allocate a new buffer and copy the original ROM into it. Null everything past the DMA table.
        const outBuffer = new ArrayBuffer(DECOMPRESSED_SIZE);
        const out = new Writer(outBuffer);
        out.writeBytes(this._buffer);
        out.fill(0, DECOMPRESSED_SIZE - info.virtualEnd, info.virtualEnd);

        for (let i = 3; i < this._tableCount; i++) {
            const record = this._readDmaRecord(i);
            const size = record.virtualEnd - record.virtualStart;

            // 0xFFFFFFFF are empty files, and should be skipped.
            if (record.physicalStart >= DECOMPRESSED_SIZE || record.physicalEnd === 0xFFFFFFFF) {
                continue;
            }

            // Check if the record is already decompressed, if not, decompress it.
            if (record.physicalEnd === 0x00000000) {
                out.writeBytes(this._in.readBytes(size, record.physicalStart), record.virtualStart, size);
            } else {
                const source = new Uint8Array(this._buffer, record.physicalStart + 0x10);
                const destination = new Uint8Array(outBuffer, record.virtualStart);
                Decompressor._decompress(source, destination, size);
            }

            record.physicalStart = record.virtualStart;
            record.physicalEnd = 0x00000000;
            this._writeDmaRecord(out, i, record);
        }

        return outBuffer;
    }

    private static _decompress(src: Uint8Array, dst: Uint8Array, size: number) {
        let srcPos = 0;
        let dstPos = 0;
        let cb = 0;
        let bitCount = 0;

        while (dstPos < size) {
            if (bitCount === 0) {
                cb = src[srcPos++];
                bitCount = 8;
            }

            // Copy byte if the 7th bit is set
            if (cb & 0x80) {
                dst[dstPos++] = src[srcPos++];
            } else {
                let b1 = src[srcPos++];
                let b2 = src[srcPos++];

                const distance = ((b1 & 0xF) << 8) | b2;
                let copyPos = dstPos - (distance + 1);
                let length = b1 >>> 4;

                if (length === 0) {
                    length = src[srcPos++] + 0x12;
                } else {
                    length += 2;
                }

                for (let i = 0; i < length; i++) {
                    dst[dstPos++] = dst[copyPos++];
                }
            }

            cb = cb << 1;
            bitCount--;
        }
    }
}
