import Rom, {COMPRESSED_ROM_SIZE, DMA_INFO_RECORD_INDEX} from "../rom";
import {Writer} from "../util";
import {N64Crc} from "../crc";
import {Yaz0Compressor} from "../yaz0";

export enum Operation {
    COPY,
    COMPRESS,
    NULL,
}

export type ProgressFn = (index: number, totalFiles: number, operation: Operation, oldSize?: number, size?: number) => void;

class CompressionWorker {
    private readonly _buffer: ArrayBuffer;
    private readonly _rom: Rom;
    private readonly _ops: Uint16Array;

    private _onProgress?: ProgressFn;

    public constructor(buffer: ArrayBuffer, exclusions: number[]) {
        this._buffer = buffer;
        this._rom = new Rom(this._buffer);
        this._ops = new Uint16Array(this._rom.dmaCount).fill(Operation.COMPRESS, 3);
        this._checkExclusions(exclusions);
    }

    private _checkExclusions(exclusions: number[]) {
        const size = this._rom.dmaCount - 1;

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

    public run() {
        const outBuffer = new ArrayBuffer(COMPRESSED_ROM_SIZE);
        const out = new Writer(outBuffer);
        const totalFiles = this._rom.dmaCount - DMA_INFO_RECORD_INDEX - 1;

        // Copy the ROM header and DMA table as this is data we want to preserve.
        const data = new Uint8Array(this._buffer, 0, this._rom.dmaOffset + this._rom.dmaSize);
        new Uint8Array(outBuffer).set(data);
        let prev = this._rom.dmaOffset + this._rom.dmaSize;

        for (let i = DMA_INFO_RECORD_INDEX + 1; i < this._rom.dmaCount; i++) {
            const record = this._rom.readDmaRecord(i);
            const length = record.virtualEnd - record.virtualStart;
            const src = new Uint8Array(this._buffer, record.virtualStart, length);

            const res = {
                op: (Operation.NULL as Operation),
                data: (new Uint8Array() as Uint8Array | undefined),
                size: 0 as number,
            }

            switch (this._ops[i]) {
                case Operation.COPY:
                    res.op = Operation.COPY;
                    res.data = src;
                    res.size = src.byteLength;
                    this._onProgress(i + 1, totalFiles, Operation.COPY, src.byteLength);
                    break;

                case Operation.COMPRESS:
                    const data = new Yaz0Compressor(src).result;
                    res.op = Operation.COMPRESS;
                    res.data = data;
                    res.size = data.byteLength;
                    this._onProgress(i + 1, totalFiles, Operation.COMPRESS, src.byteLength, data.byteLength);
                    break;

                case Operation.NULL:
                    console.log(`[${i}/${this._rom.dmaCount - 3}] Ignoring file.`);
                    res.op = Operation.NULL;
                    res.data = undefined;
                    res.size = 0;
                    this._onProgress(i + 1, totalFiles, Operation.NULL);
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
                    record.physicalEnd = 0xFFFFFFFF;
                }

                try {
                    if (record.physicalStart !== 0xFFFFFFFF) {
                        out.writeBytes(res.data, record.physicalStart);
                    }
                    this._rom.writeDmaRecord(out, i, record);
                } catch (e) {
                    break;
                }
            }

            prev += res.size;
        }

        new N64Crc(outBuffer).recalculate();
        return outBuffer;
    }

    public set onProgress(progressFn: ProgressFn) {
        this._onProgress = progressFn;
    }
}

export enum MessageType {
    StartCompression,
    Finished,
    Progress,
}

interface StartCompressionMessageData {
    type: MessageType.StartCompression;
    buffer: ArrayBuffer;
    exclusions: number[];
}

export type InMessageData = StartCompressionMessageData;

interface ProgressMessageData {
    type: MessageType.Progress;
    file: number;
    totalFiles: number;
    operation: Operation;
    originalSize?: number;
    compressedSize?: number;
}

interface FinishedMessageData {
    type: MessageType.Finished;
    result: ArrayBuffer;
    startTime: number;
    finishTime: number;
}

export type OutMessageData = FinishedMessageData | ProgressMessageData;

self.onmessage = (e: MessageEvent<InMessageData>) => {
    const message = e.data;
    if (message.type === MessageType.StartCompression) {
        const worker = new CompressionWorker(message.buffer, message.exclusions);

        worker.onProgress = ((index, totalFiles, operation, oldSize, size) => {
            self.postMessage({
                type: MessageType.Progress,
                file: index,
                totalFiles: totalFiles,
                operation: operation,
                originalSize: oldSize,
                compressedSize: size,
            });
        });

        const startTime = performance.now();
        const result = worker.run();
        const finishTime = performance.now();

        self.postMessage({
            type: MessageType.Finished,
            result: result,
            startTime: startTime,
            finishTime: finishTime,
        });
    }
}
