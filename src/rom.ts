import {Reader, swap16} from "./util";

export const CRC_OFFSET = 0x10;
export const DMA_RECORD_SIZE = 16;
export const COMPRESSED_ROM_SIZE = 0x02000000;
export const DECOMPRESSED_ROM_SIZE = 0x04000000;
export const DMA_INFO_RECORD_INDEX = 2;

export interface DmaRecord {
    virtualStart: number;
    virtualEnd: number;
    physicalStart: number;
    physicalEnd: number;
}

export enum RomType {
    COMPRESSED,
    BIG_ENDIAN_COMPRESSED,
    DECOMPRESSED,
}

const crc = {
    compressed: [0xEC, 0x70, 0x11, 0xB7, 0x76, 0x16, 0xD7, 0x2B],
    bigEndianCompressed: [0x70, 0xEC, 0xB7, 0x11, 0x16, 0x76, 0x2B, 0xD7],
    decompressed: [0x93, 0x52, 0x2E, 0x7B, 0xE5, 0x06, 0xD4, 0x27],
}

/**
 * The Rom class provides a read only wrapper around an input ROM, providing a few convenience features to read data
 * from the file with ease.
 */
export default class Rom extends Reader {
    /**
     * The type of ROM.
     * @private
     */
    private readonly _type: RomType;

    /**
     * Offset in bytes of the DMA table.
     * @private
     */
    private readonly _dmaOffset: number;

    /**
     * The size of the DMA table in bytes.
     * @private
     */
    private readonly _dmaSize: number;

    /**
     * The amount of entries in the DMA table.
     * @private
     */
    private readonly _dmaCount: number;

    /**
     * Constructs a Rom instance.
     * @param buffer Instance of ArrayBuffer containing the input ROM.
     * @param fixEndianness If set to true, will byte swap a Big Endian ROM to little endianness.
     *                      This is a write operation to the input buffer.
     */
    public constructor(buffer: ArrayBuffer, fixEndianness?: boolean) {
        super(buffer);
        this._type = this.validateRom();
        if (this._type === RomType.BIG_ENDIAN_COMPRESSED && fixEndianness === true) {
            this._fixEndianness();
            this._type = RomType.COMPRESSED;
        }

        // Find the location of the DMA table and load information about its size.
        this._dmaOffset = this._findDmaTableOffset();
        const info = this.readDmaRecord(DMA_INFO_RECORD_INDEX);
        this._dmaSize = info.virtualEnd - info.virtualStart;
        this._dmaCount = this._dmaSize / DMA_RECORD_SIZE;
    }

    /**
     * Converts endianness of the ROM data.
     * @private
     */
    private _fixEndianness() {
        const array = new Uint16Array(this._buffer);
        for (let i = 0; i < (COMPRESSED_ROM_SIZE / 2); i++) {
            array[i] = swap16(array[i]);
        }
    }

    /**
     * Finds the start of the DMA table on the ROM.
     * @returns The byte offset of the DMA table.
     * @private
     */
    private _findDmaTableOffset() {
        const array = new Uint32Array(this._buffer);
        for (let i = 1048; i + 4 < 0x01000000; i += 4) {
            if (array[i] === 0 && array[i + 1] === 0x60100000) {
                return i * 4;
            }
        }

        throw new Error("no DMA table found");
    }

    /**
     * Validates the CRC checksum of the ROM and returns the type of the ROM.
     * @returns RomType specifying the type of data in the ROM.
     */
    public validateRom(): RomType {
        const checksum = new Uint8Array(this._buffer, CRC_OFFSET, 8);

        const equals = (v: number, i: number) => checksum[i] === v;

        if (crc.compressed.every(equals)) {
            return RomType.COMPRESSED;
        } else if (crc.bigEndianCompressed.every(equals)) {
            return RomType.BIG_ENDIAN_COMPRESSED;
        } else if (crc.decompressed.every(equals)) {
            return RomType.DECOMPRESSED;
        }

        throw new Error("Not a valid ROM.");
    }

    /**
     * Reads the DMA record at the specific
     * @param index
     */
    public readDmaRecord(index: number) {
        if (index >= this._dmaCount) {
            throw new Error("DMA record index is out of bounds");
        }

        this.seek(this._dmaOffset, "begin");
        this.seek(index * 16);

        return {
            virtualStart: this.readUint32(),
            virtualEnd: this.readUint32(),
            physicalStart: this.readUint32(),
            physicalEnd: this.readUint32(),
        };
    }

    /**
     * Finds the DMA record for a given file key.
     * @param key The file key to search for.
     */
    public readDmaRecordByKey(key: number): DmaRecord | undefined {
        for (let i = 0; i < this._dmaCount; i++) {
            let record = this.readDmaRecord(i);
            if (record.virtualStart === 0 && record.virtualEnd === 0) {
                return undefined;
            } else if (record.virtualStart === key) {
                return record;
            }
        }
    }

    /**
     * Verifies the integrity of the DMA records by checking what records overlap the memory region of another record.
     */
    public verifyDmaData() {
        let dmaData: DmaRecord[] = [];

        for (let i = 0; i < this._dmaCount; i++) {
            const record = this.readDmaRecord(i);
            if (record.virtualStart === 0 && record.virtualEnd === 0) {
                break;
            }
            dmaData.push(record);
        }

        dmaData.sort((a, b) => {
            if (a.virtualStart < b.virtualStart) return -1;
            if (a.virtualStart > b.virtualStart) return 1;
            else return 0;
        });

        for (let i = 0; i < dmaData.length - 1; i++) {
            const current = dmaData[i];
            const next = dmaData[i + 1];
            if (current.virtualEnd > next.virtualStart) {
                throw new Error("Overlapping DMA data records!");
            }
        }
    }

    public get dmaOffset() {
        return this._dmaOffset;
    }

    public get dmaCount() {
        return this._dmaCount;
    }
}