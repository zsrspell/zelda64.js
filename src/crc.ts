/**
 * Copyright notice for this file:
 *  Copyright (C) 2005 Parasyte
 *
 * Based on uCON64's N64 checksum algorithm by Andreas Sterbenz
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */
import {Reader} from "./util";

const N64_HEADER_SIZE = 0x40;
const N64_BOOT_CODE_SIZE = (0x1000 - N64_HEADER_SIZE);
const N64_CRC1_OFFSET = 0x10;
const N64_CRC2_OFFSET = 0x14;

const CHECKSUM_OFFSET = 0x00001000;
const CHECKSUM_LENGTH = 0x00100000;

const CHECKSUM_CIC6102 = 0xF8CA4DDC;
const CHECKSUM_CIC6103 = 0xA3886759;
const CHECKSUM_CIC6105 = 0xDF26F436;
const CHECKSUM_CIC6106 = 0x1FEA617A;

const UINT32_MASK = 0xFFFFFFFF;

/**
 * This function exists to pwn JavaScript's untyped 64-bit signed integers to 32-bit unsigned GIGACHAD integers.
 * @param value Weak virgin 64-bit signed integer.
 * @returns Strong GIGACHAD 32-bit unsigned integer.
 */
function u32(value: number) {
    // fuck untyped languages
    return (value & UINT32_MASK) >>> 0;
}

function rol(a: number, b: number) {
    return ((a) << (b)) | ((a) >>> (32 - (b)));
}

export class N64Crc {
    private readonly _buffer: ArrayBuffer;
    private readonly _reader: Reader;
    private readonly _data: Uint8Array;

    public constructor(buffer: ArrayBuffer) {
        this._buffer = buffer;
        this._reader = new Reader(this._buffer);
        this._data = new Uint8Array(this._buffer);
    }

    public recalculate() {
        N64Crc._generateTable();
        const crc = this._calculate();
        const crc1 = new Uint8Array(4);
        const crc2 = new Uint8Array(4);

        for (let i = 0; i < 4; i++) {
            crc1[i] = (crc[0] >>> (24 - 8 * i) & 0xFF);
            crc2[i] = (crc[1] >>> (24 - 8 * i) & 0xFF);
        }

        this._data.set(crc1, N64_CRC1_OFFSET);
        this._data.set(crc2, N64_CRC2_OFFSET);
    }

    private _calculate() {
        const bootCode = this._cic();
        const seed = N64Crc._seed(bootCode);
        let t1 = seed, t2 = seed, t3 = seed, t4 = seed, t5 = seed, t6 = seed;

        for (let i = CHECKSUM_OFFSET; i < (CHECKSUM_OFFSET + CHECKSUM_LENGTH); i += 4) {
            const d = this._reader.readUint32(i);

            // untyped languages still suck; bit masking to keep to 32 bit values with overflow
            if (u32(t6 + d) < t6) {
                t4++;
            }

            t6 = u32(t6 + d);
            t3 = u32(t3 ^ d);

            const r = u32(rol(d, (d & 0x1F)));
            t5 = u32(t5 + r);

            if (t2 > d) {
                t2 = u32(t2 ^ r);
            } else {
                t2 = u32(t2 ^ t6 ^ d);
            }

            if (bootCode === 6105) {
                const offset = N64_HEADER_SIZE + 0x0710 + (i & 0xFF);
                const e = this._reader.readUint32(offset);
                t1 = u32(t1 + (e ^ d));
            } else {
                t1 = u32(t1 + (t5 ^ d));
            }
        }

        if (bootCode === 6103) {
            return [(t6 ^ t4) + t3, (t5 ^ t2) + t1];
        } else if (bootCode === 6106) {
            return [(t6 * t4) + t3, (t5 * t2) + t1];
        } else {
            return [t6 ^ t4 ^ t3, t5 ^ t2 ^ t1];
        }
    }

    private static _seed(bootCode: 6101 | 6102 | 6103 | 6105 | 6106) {
        switch (bootCode) {
            case 6101:
            case 6102:
                return CHECKSUM_CIC6102;
            case 6103:
                return CHECKSUM_CIC6103;
            case 6105:
                return CHECKSUM_CIC6105;
            case 6106:
                return CHECKSUM_CIC6106;
        }
    }

    private _cic() {
        switch (N64Crc._crc32(new Uint8Array(this._buffer, N64_HEADER_SIZE, N64_BOOT_CODE_SIZE))) {
            case 0x6170A4A1:
                return 6101;
            case 0x90BB6CB5:
                return 6102;
            case 0x0B050EE0:
                return 6103;
            case 0x98BC2C86:
                return 6105;
            case 0xACC8580A:
                return 6106;
        }

        throw new Error("could not calculate CIC");
    }

    private static _table?: Uint32Array;

    private static _generateTable() {
        if (this._table === undefined) {
            this._table = new Uint32Array(256);

            for (let i = 0; i < this._table.length; i++) {
                let crc = i;
                for (let j = 8; j > 0; j--) {
                    if (crc & 1) {
                        crc = (crc >>> 1) ^ 0xEDB88320;
                    } else {
                        crc >>>= 1;
                    }
                    this._table[i] = crc;
                }
            }
        }
    }

    private static _crc32(data: Uint8Array) {
        if (this._table === undefined) {
            throw new Error("CRC table is undefined");
        }

        let crc = ~0;
        for (let i = 0; i < data.length; i++) {
            const tableIndex = (crc ^ data[i]) & 0xFF;
            crc = ((crc >>> 8) ^ this._table[tableIndex]);
        }
        return (~crc) >>> 0; // untyped languages are a fucking meme
    }
}

