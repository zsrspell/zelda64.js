import {Writer} from "./util";
import Rom, {DECOMPRESSED_ROM_SIZE, DMA_INFO_RECORD_INDEX} from "./rom";
import {N64Crc} from "./crc";

/**
 * The Decompressor class implements the algorithm for inflating a Nintendo 64 Zelda ROM.
 */
export default class Decompressor {
    private readonly _buffer: ArrayBuffer;
    private readonly _rom: Rom;

    /**
     * Constructs a Decompressor instance
     * @param buffer Instance of ArrayBuffer containing the input ROM.
     */
    public constructor(buffer: ArrayBuffer) {
        this._buffer = buffer;
        this._rom = new Rom(this._buffer);
    }

    /**
     * Inflates the input ROM and returns the decompressed ROM buffer.
     * @returns ArrayBuffer containing the decompressed ROM.
     */
    public inflate() {
        const info = this._rom.readDmaRecord(DMA_INFO_RECORD_INDEX);

        // Keep track of which files are already decompressed, so that we skip these in the compression step.
        const exclusions: number[] = [];

        // Allocate a new buffer and copy the original ROM into it. Null everything past the DMA table.
        const outBuffer = new ArrayBuffer(DECOMPRESSED_ROM_SIZE);
        const out = new Writer(outBuffer);
        out.writeBytes(this._buffer);
        out.fill(0, DECOMPRESSED_ROM_SIZE - info.virtualEnd, info.virtualEnd);

        for (let i = DMA_INFO_RECORD_INDEX + 1; i < this._rom.dmaCount; i++) {
            const record = this._rom.readDmaRecord(i);
            const size = record.virtualEnd - record.virtualStart;

            // 0xFFFFFFFF are empty files, and should be skipped.
            if (record.physicalStart >= DECOMPRESSED_ROM_SIZE || record.physicalEnd === 0xFFFFFFFF) {
                continue;
            }

            // Check if the record is already decompressed, if not, decompress it.
            if (record.physicalEnd === 0) {
                exclusions.push(i);
                out.writeBytes(this._rom.readBytes(size, record.physicalStart), record.virtualStart, size);
            } else {
                const source = new Uint8Array(this._buffer, record.physicalStart + 0x10);
                const destination = new Uint8Array(outBuffer, record.virtualStart);
                Decompressor._decompress(source, destination, size);
            }

            record.physicalStart = record.virtualStart;
            record.physicalEnd = 0;
            this._rom.writeDmaRecord(out, i, record);
        }

        new N64Crc(outBuffer).recalculate();

        return {
            data: outBuffer,
            exclusions: exclusions,
        };
    }

    /**
     * Performs decompression on the source data and writes the decompressed data to the destination buffer.
     * @param src Array starting at the source data.
     * @param dst Array starting at the destination where decompressed data should be written.
     * @param size The size of the decompressed data.
     * @private
     */
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
