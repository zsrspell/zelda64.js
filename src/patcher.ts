import * as pako from "pako";
import {TextDecoder} from "util";
import {Reader, Writer} from "./util";
import Rom from "./rom";

interface PatchConfiguration {
    dmaStart: number;
    xorRange: number[];
    xorAddress: number;
}

const HEADER_START = 0;
const PATCH_CONF_START = 5;
const DMA_UPDATE_TABLE_START = 21;

/**
 * ZPF Patcher Class
 */
export default class Patcher {
    /**
     * The ArrayBuffer holding the uncompressed ZPF file's data.
     */
    private _patchData: ArrayBuffer;
    private _patchView: DataView;
    private _conf: PatchConfiguration;

    public constructor(patchData: ArrayBuffer) {
        // Decompress the patch data.
        this._patchData = pako.inflate(new Uint8Array(patchData)).buffer;
        this._patchView = new DataView(this._patchData);

        if (!this._validateHeader()) {
            throw new Error("not a valid ZPF file");
        }

        this._conf = this._getPatchConfiguration();
    }

    public patch(romData: ArrayBuffer): ArrayBuffer {
        const rom = new Rom(romData);
        const destBuffer = new ArrayBuffer(romData.byteLength);
        new Uint8Array(destBuffer).set(new Uint8Array(romData));
        const patchReader = new Reader(this._patchData);
        const destWriter = new Writer(destBuffer);

        this._updateDmaTable(patchReader, destWriter, rom);
        this._writeDataBlocks(patchReader, destWriter, rom);
        return destBuffer;
    }

    private _validateHeader() {
        const header = new TextDecoder().decode(this._patchData.slice(HEADER_START, 5));
        return header === "ZPFv1";
    }

    private _getPatchConfiguration(): PatchConfiguration {
        const cur = PATCH_CONF_START;
        return {
            dmaStart: this._patchView.getUint32(cur),
            xorRange: [this._patchView.getUint32(cur + 4), this._patchView.getUint32(cur + 8)],
            xorAddress: this._patchView.getUint32(cur + 12),
        };
    }

    private _updateDmaTable(patch: Reader, dest: Writer, rom: Rom) {
        patch.seek(DMA_UPDATE_TABLE_START, "begin");

        while (true) {
            const dmaIndex = patch.readUint16();
            if (dmaIndex === 0xFFFF) {
                break;
            }

            const fromFile = patch.readUint32();
            const start = patch.readUint32();
            const size = patch.readUint24();
            this._writeDmaTableEntry(dest, dmaIndex, start, size);

            if (fromFile !== 0xFFFFFFFF) {
                // Copy source file from source ROM
                const record = rom.readDmaRecordByKey(fromFile);
                const copySize = (size < record.physicalStart) ? size : record.physicalStart;
                dest.writeBytes(rom.readBytes(copySize, fromFile), start);
                dest.fill(0, size - copySize, start + copySize);
            } else {
                // Fill with zeroes for new files
                dest.fill(0, size, start);
            }
        }
    }

    private _writeDmaTableEntry(dest: Writer, dmaIndex: number, start: number, size: number) {
        const dmaEntry = this._conf.dmaStart + dmaIndex * 0x10;
        dest.seek(dmaEntry, "begin");
        dest.writeUint32(start);
        dest.writeUint32(start + size);
        dest.writeUint32(start);
        dest.writeUint32(0);
    }

    private _writeDataBlocks(patch: Reader, dest: Writer, rom: Rom) {
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

            dest.writeBytes(data.buffer, blockStart);
            blockStart += blockSize;
        }
    }

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
