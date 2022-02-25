import {Reader} from "./util";

const DMA_DATA_START = 0x7430;

export interface DmaRecord {
    readonly start: number;
    readonly end: number;
    readonly size: number;
}

export default class Rom extends Reader {
    public constructor(buffer: ArrayBuffer) {
        super(buffer);
    }

    public getDmaRecordByKey(key: number): DmaRecord | undefined {
        this.seek(DMA_DATA_START, "begin");
        let record = this._getDmaRecord();
        while (true) {
            if (record.start === 0 && record.end === 0) {
                return undefined;
            } else if (record.start === key) {
                return record;
            }

            // Advance to the next record and read it in.
            this.seek(0x10);
            record = this._getDmaRecord();
        }
    }

    private _getDmaRecord(): DmaRecord {
        const start = this.readUint32(this._cursor);
        const end = this.readUint32(this._cursor + 0x04);
        const size = end - start;
        return {start, end, size};
    }

    public verifyDmaData() {
        this.seek(DMA_DATA_START, "begin");

        let dmaData: DmaRecord[] = [];

        while (true) {
            const record = this._getDmaRecord();
            if (record.start === 0 && record.end === 0) {
                break;
            }

            dmaData.push(record);
            this.seek(0x10);
        }

        dmaData.sort((a, b) => {
            if (a.start < b.start) return -1;
            if (a.start > b.start) return 1;
            else return 0;
        });

        for (let i = 0; i < dmaData.length - 1; i++) {
            const current = dmaData[i];
            const next = dmaData[i +1];
            if (current.end > next.start) {
                throw new Error("Overlapping DMA data records!");
            }
        }
    }
}