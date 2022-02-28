import Rom, {COMPRESSED_ROM_SIZE, DMA_INFO_RECORD_INDEX, DMA_RECORD_SIZE, DmaRecord} from "./rom";
import {Writer} from "./util";
import {Yaz0Compressor} from "./yaz0";
import {N64Crc} from "./crc";

enum Operation {
    COPY,
    COMPRESS,
    NULL,
}

/**
 * The Compressor class implements functionality for compressing Nintendo 64 Zelda ROMs.
 */
export default class Compressor {
    private readonly _buffer: ArrayBuffer;
    private readonly _in: Rom;
    private readonly _ops: Uint16Array;

    public constructor(buffer: ArrayBuffer, exclusions: number[] = []) {
        this._buffer = buffer;
        this._in = new Rom(this._buffer);
        this._ops = new Uint16Array(this._in.dmaCount).fill(Operation.COMPRESS, 3);

        this._checkExclusions(exclusions);
    }

    private _checkExclusions(exclusions: number[]) {
        const size = this._in.dmaCount - 1;

        for (let i = 0; i < exclusions.length; i++) {
            const file = exclusions[i];

            if (file > size || file < -size) {
                console.log(`Exclusion index ${file} is out of bounds`);
                continue;
            }

            if (file < 0) {
                this._ops[(~file + 1)] = Operation.NULL;
            } else {
                this._ops[file] = Operation.COPY;
            }
        }
    }

    public deflate() {
        const outBuffer = new ArrayBuffer(COMPRESSED_ROM_SIZE);
        const out = new Writer(outBuffer);

        const data = new Uint8Array(this._buffer, 0, this._in.dmaOffset + this._in.dmaSize);
        new Uint8Array(outBuffer).set(data);

        let copied = 0, compressed = 0, ignored = 0;
        const t1 = performance.now();
        let prev = this._in.dmaOffset + this._in.dmaSize;

        for (let i = DMA_INFO_RECORD_INDEX + 1; i < this._in.dmaCount; i++) {
            const record = this._in.readDmaRecord(i);
            const length = record.virtualEnd - record.virtualStart;
            const src = new Uint8Array(this._buffer, record.virtualStart, length);

            const res = {
                op: (Operation.NULL as Operation),
                data: (new Uint8Array() as Uint8Array | undefined),
                size: 0 as number,
            }

            switch (this._ops[i]) {
                case Operation.COPY:
                    console.log(`[${i-2}/${this._in.dmaCount-3}] Copying file.`);

                    res.op = Operation.COPY;
                    res.data = src;
                    res.size = src.byteLength;
                    copied++;
                    break;

                case Operation.COMPRESS:
                    console.log(`[${i}/${this._in.dmaCount-3}] Compressing file.`);
                    const data = Compressor._compress(src);
                    res.op = Operation.COMPRESS;
                    res.data = data;
                    res.size = data.byteLength;
                    compressed++;
                    break;

                case Operation.NULL:
                    console.log(`[${i}/${this._in.dmaCount-3}] Ignoring file.`);
                    res.op = Operation.NULL;
                    res.data = undefined;
                    res.size = 0;
                    ignored++;
                    break;

                default:
                    throw new Error("invalid operation");
            }

            // Write to the output buffer finally.
            if (record.virtualStart != record.virtualEnd) {
                record.physicalStart = prev;

                if (res.op === Operation.COMPRESS) {
                    record.physicalEnd = record.physicalStart + res.size;
                } else if (res.op === Operation.NULL) {
                    record.physicalStart = 0xFFFFFFFF;
                    record.physicalEnd =   0xFFFFFFFF;
                }

                try {
                    if (record.physicalStart !== 0xFFFFFFFF) {
                        out.writeBytes(res.data, record.physicalStart);
                    }
                    this._writeDmaRecord(out, i, record);
                } catch (e) {
                    break;
                }
            }

            prev += res.size;
        }

        new N64Crc(outBuffer).recalculate();
        const t2 = performance.now();

        console.log(`Finished compressing in ${(t2 - t1) * 1000} seconds! ${compressed} compressed, ${copied} copied, ${ignored} ignored.`);
        console.log(`Processed ${compressed + copied + ignored} files total!`);
        return outBuffer;
    }

    private static _compress(src: Uint8Array) {
        return new Yaz0Compressor(src).result;
    }

    /**
     * Writes a DMA record to the output buffer.
     * @param out A Writer instance to write the resulting DMA record to.
     * @param index The target index in the output DMA table.
     * @param record The DMA record to write.
     * @private
     */
    private _writeDmaRecord(out: Writer, index: number, record: DmaRecord) {
        out.seek(this._in.dmaOffset, "begin");
        out.seek(index * DMA_RECORD_SIZE);
        out.writeUint32(record.virtualStart);
        out.writeUint32(record.virtualEnd);
        out.writeUint32(record.physicalStart);
        out.writeUint32(record.physicalEnd);
    }
}
