import * as pako from "pako";
import {TextDecoder} from "util";
import {Reader, Writer} from "./util";
import Rom, {DMA_RECORD_SIZE, DmaRecord} from "./rom";
import {N64Crc} from "./crc";

interface PatchConfiguration {
    dmaOffset: number;
    xorRange: number[];
    xorAddress: number;
}

const HEADER_OFFSET = 0;
const PATCH_CONFIGURATION_OFFSET = 5;
const DMA_UPDATE_TABLE_OFFSET = 21;

/**
 * ZPF Patcher Class
 */
export default class Patcher {
    /**
     * The ArrayBuffer holding the uncompressed ZPF file's data.
     * @private
     */
    private readonly _patchData: ArrayBuffer;

    /**
     * DataView over the ZPF patch data.
     * @private
     */
    private readonly _patchView: DataView;

    /**
     * The Patch configuration information con
     * @private
     */
    private readonly _conf: PatchConfiguration;

    /**
     * Constructs a patcher instance.
     * @param patchData An ArrayBuffer instance containing the patch file data.
     */
    public constructor(patchData: ArrayBuffer) {
        // Decompress the patch data.
        this._patchData = pako.inflate(new Uint8Array(patchData)).buffer;
        this._patchView = new DataView(this._patchData);

        if (!this._validateHeader()) {
            throw new Error("not a valid ZPF file");
        }

        this._conf = this._readPatchConfiguration();
    }

    /**
     * Patches the input ROM.
     * @param romData Input data to patch on. Readonly.
     * @returns ArrayBuffer containing the patched ROM data.
     */
    public patch(romData: ArrayBuffer): ArrayBuffer {
        const rom = new Rom(romData);
        const destBuffer = new ArrayBuffer(romData.byteLength);
        new Uint8Array(destBuffer).set(new Uint8Array(romData));
        const patchReader = new Reader(this._patchData);
        const destWriter = new Writer(destBuffer);

        this._updateDmaTable(patchReader, destWriter, rom);
        this._patchDataBlocks(patchReader, destWriter, rom);
        new N64Crc(destBuffer).recalculate();

        return destBuffer;
    }

    /**
     * Validates the ZPF file header.
     * @returns true if a valid ZPF file, false if not.
     * @private
     */
    private _validateHeader() {
        const header = new TextDecoder().decode(this._patchData.slice(HEADER_OFFSET, 5));
        return header === "ZPFv1";
    }

    /**
     * Reads the patch configuration from the patch data.
     * @returns The patch configuration data.
     * @private
     */
    private _readPatchConfiguration(): PatchConfiguration {
        const cur = PATCH_CONFIGURATION_OFFSET;
        return {
            dmaOffset: this._patchView.getUint32(cur),
            xorRange: [this._patchView.getUint32(cur + 4), this._patchView.getUint32(cur + 8)],
            xorAddress: this._patchView.getUint32(cur + 12),
        };
    }

    /**
     * Updates the DMA table from the input ROM with the patch data.
     * @param patch Reader instance containing the Patch file data.
     * @param dst Writer instance containing the destination buffer.
     * @param rom Rom instance containing the input ROM data.
     * @private
     */
    private _updateDmaTable(patch: Reader, dst: Writer, rom: Rom) {
        patch.seek(DMA_UPDATE_TABLE_OFFSET, "begin");

        while (true) {
            const dmaIndex = patch.readUint16();
            if (dmaIndex === 0xFFFF) {
                break;
            }

            const fromFile = patch.readUint32();
            const start = patch.readUint32();
            const size = patch.readUint24();

            this._writeDmaRecord(dst, dmaIndex,{
                virtualStart: start,
                virtualEnd: start + size,
                physicalStart: start,
                physicalEnd: 0,
            });

            if (fromFile !== 0xFFFFFFFF) {
                // Copy source file from source ROM
                const record = rom.readDmaRecordByKey(fromFile);
                const copySize = (size < record.physicalStart) ? size : record.physicalStart;
                dst.writeBytes(rom.readBytes(copySize, fromFile), start);
                dst.fill(0, size - copySize, start + copySize);
            } else {
                // Fill with zeroes for new files
                dst.fill(0, size, start);
            }
        }
    }

    /**
     * Writes a DMA record to the output buffer.
     * @param dst Writer instance containing the output buffer.
     * @param index The index of the DMA record in the DMA table.
     * @param record The DMA data to write to the table.
     * @private
     */
    private _writeDmaRecord(dst: Writer, index: number, record: DmaRecord) {
        dst.seek(this._conf.dmaOffset, "begin");
        dst.seek(index * DMA_RECORD_SIZE);
        dst.writeUint32(record.virtualStart);
        dst.writeUint32(record.virtualEnd);
        dst.writeUint32(record.physicalStart);
        dst.writeUint32(record.physicalEnd);
    }

    /**
     * Writes data blocks from the patch file to the target ROM.
     * @param patch Reader instance containing the patch file data.
     * @param dst Writer instance containing the output ROM buffer.
     * @param rom Rom instance of the input ROM.
     * @private
     */
    private _patchDataBlocks(patch: Reader, dst: Writer, rom: Rom) {
        let blockStart = 0;
        let xorAddress = this._conf.xorAddress;

        while (!patch.eof()) {
            const newBlock = patch.readUint8() !== 0xFF;
            let blockSize = 0;

            if (newBlock) {
                patch.seek(-1);
                blockStart = patch.readUint32();
                blockSize = patch.readUint16();
            } else {
                const keySkip = patch.readUint8();
                blockSize = patch.readUint16();

                // Skip specified XOR keys
                for (let i = 0; i < keySkip; i++) {
                    const xor = this._getNextXorKey(rom, xorAddress, this._conf.xorRange);
                    xorAddress = xor.address;
                }
            }

            const src = new Uint8Array(patch.readBytes(blockSize));
            const data = new Uint8Array(new ArrayBuffer(blockSize));

            for (let i = 0; i < blockSize; i++) {
                if (src[i] === 0) {
                    data[i] = 0;
                } else {
                    const xor = this._getNextXorKey(rom, xorAddress, this._conf.xorRange);
                    xorAddress = xor.address;
                    data[i] = src[i] ^ xor.key;
                }
            }

            dst.writeBytes(data.buffer, blockStart);
            blockStart += blockSize;
        }
    }

    /**
     * Seeks the next XOR key.
     * @param rom Rom instance containing the input ROM.
     * @param address XOR address to start searching from.
     * @param addressRange XOR address range to seek in.
     * @returns Object containing the next key and address of the key.
     * @private
     */
    private _getNextXorKey(rom: Rom, address: number, addressRange: number[]) {
        let key = 0;

        while (key === 0) {
            address += 1;
            if (address > addressRange[1]) {
                address = addressRange[0];
            }
            key = rom.readUint8(address);
        }

        return {key, address};
    }
}
