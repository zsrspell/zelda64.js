import {DMA_RECORD_SIZE, DmaRecord} from "./rom";

/**
 * Byte swaps the endianness of a 32-bit integer.
 * @param value The 32-bit integer to swap.
 */
export function swap32(value: number) {
    return ((value & 0x000000FF) << 24
        | (value & 0x0000FF00) << 8
        | (value & 0x00FF0000) >>> 8
        | (value & 0xFF000000) >>> 24)
}

/**
 * Byte swaps the endianness of a 16-bit integer.
 * @param value The 16-bit integer to swap.
 */
export function swap16(value: number) {
    return ((value & 0x00FF) << 8 | (value & 0xFF00) >>> 8);
}

export function parse32(src: Uint8Array, offset: number) {
    return ((src[offset] << 24)
        | (src[offset + 1] << 16)
        | (src[offset + 2] << 8)
        | src[offset +3]);
}

/**
 * This function exists to pwn JavaScript's untyped 64-bit signed integers to 32-bit unsigned GIGACHAD integers.
 * @param value Weak virgin 64-bit signed integer.
 * @returns Strong GIGACHAD 32-bit unsigned integer.
 */
export function u32(value: number) {
    // fuck untyped languages
    return (value & 0xFFFFFFFF) >>> 0;
}

/**
 * SeekableBuffer implements a wrapper over ArrayBuffer that implements seeking capabilities for sequential read/writes.
 */
class SeekableBuffer {
    protected _buffer: ArrayBuffer;
    protected _view: DataView;
    protected _cursor: number;

    /**
     * Constructs instance of SeekableBuffer.
     * @param buffer The ArrayBuffer to operate on.
     */
    public constructor(buffer: ArrayBuffer) {
        this._buffer = buffer;
        this._view = new DataView(this._buffer);
        this._cursor = 0;
    }

    /**
     * Moves the cursor to a position on the buffer.
     * @param pos The amount of places to move the cursor relative to the whence argument.
     * @param whence Specifies the relation of where the cursor moves. "begin" moves it from the beginning of the
     *               buffer, "current" moves it relative to the cursor's current position, and "end" moves it relative
     *               to the end of the buffer. Defaults to "current".
     * @returns The old position of the cursor.
     */
    public seek(pos: number, whence: "begin" | "current" | "end" = "current"): number {
        const oldPos = this._cursor;
        switch (whence) {
            case "begin":
                this._cursor = pos;
                break;

            case "current":
                this._cursor += pos;
                break;

            case "end":
                this._cursor = this._buffer.byteLength + pos;
                break;
        }
        return oldPos;
    }

    /**
     * Checks whether the cursor has passed the end of the buffer.
     * @returns true if the end of buffer is reached, false if not.
     */
    public eof() {
        return this._cursor >= this._buffer.byteLength;
    }
}

/**
 * Reader implements sequential read operations on an ArrayBuffer.
 */
export class Reader extends SeekableBuffer {
    public constructor(buffer: ArrayBuffer) {
        super(buffer);
    }

    public readUint8(offset?: number) {
        if (offset !== undefined) {
            return this._view.getUint8(offset);
        } else {
            const val = this._view.getUint8(this._cursor);
            this._cursor += 1;
            return val;
        }
    }

    public readUint16(offset?: number) {
        if (offset !== undefined) {
            return this._view.getUint16(offset);
        } else {
            const val = this._view.getUint16(this._cursor);
            this._cursor += 2;
            return val;
        }
    }

    public readUint24(offset?: number) {
        const pos = (offset !== undefined) ? offset : this._cursor;
        const a = this._view.getUint16(pos);
        const b = this._view.getUint8(pos + 2);
        if (offset === undefined) this._cursor += 3;
        return (a << 8) + b;
    }

    public readInt32(offset?: number, littleEndian?: boolean) {
        if (offset !== undefined) {
            return this._view.getInt32(offset, littleEndian);
        } else {
            const val = this._view.getInt32(this._cursor, littleEndian);
            this._cursor += 4;
            return val;
        }
    }

    public readUint32(offset?: number, littleEndian?: boolean) {
        if (offset !== undefined) {
            return this._view.getUint32(offset, littleEndian);
        } else {
            const val = this._view.getUint32(this._cursor, littleEndian);
            this._cursor += 4;
            return val;
        }
    }

    public readBytes(length: number, offset?: number) {
        if (offset !== undefined) {
            return this._buffer.slice(offset, offset + length);
        } else {
            const bytes = this._buffer.slice(this._cursor, this._cursor + length);
            this._cursor += length;
            return bytes;
        }
    }
}

/**
 * Writer implements sequential write operations on an ArrayBuffer.
 */
export class Writer extends SeekableBuffer {
    public constructor(buffer: ArrayBuffer) {
        super(buffer);
    }

    public writeUint32(value: number, offset?: number, littleEndian?: boolean) {
        if (offset !== undefined) {
            this._view.setUint32(offset, value, littleEndian);
        } else {
            this._view.setUint32(this._cursor, value, littleEndian);
            this._cursor += 4;
        }
    }

    public writeBytes(data: ArrayBuffer, offset?: number, size?: number) {
        const array = new Uint8Array(data);
        const start = (offset !== undefined) ? offset : this._cursor;
        const length = (size !== undefined) ? size : data.byteLength;

        let written = 0;
        for (let i = 0; i < length; i++) {
            this._view.setUint8(start + i, array[i]);
            written++;
        }

        if (written !== length) {
            throw new Error("did not copy all bytes");
        }

        if (offset === undefined) this._cursor += written;
    }

    public fill(value: number, size: number, offset?: number) {
        const buffer = new ArrayBuffer(size);
        const array = new Uint8Array(value);

        for (let i = 0; i < size; i++) {
            array[i] = value;
        }

        this.writeBytes(buffer, offset);
    }
}
