class SeekableBuffer {
    protected _buffer: ArrayBuffer;
    protected _view: DataView;
    protected _cursor: number;

    public constructor(buffer: ArrayBuffer) {
        this._buffer = buffer;
        this._view = new DataView(this._buffer);
        this._cursor = 0;
    }

    public seek(pos: number, whence: "begin" | "current" | "end" = "current") {
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
    }

    public eof() {
        return this._cursor >= this._buffer.byteLength;
    }
}

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

    public readUint32(offset?: number) {
        if (offset !== undefined) {
            return this._view.getUint32(offset);
        } else {
            const val = this._view.getUint32(this._cursor);
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

export class Writer extends SeekableBuffer {
    public constructor(buffer: ArrayBuffer) {
        super(buffer);
    }

    public writeUint32(value: number, offset?: number) {
        if (offset !== undefined) {
            this._view.setUint32(offset, value);
        } else {
            this._view.setUint32(this._cursor, value);
            this._cursor += 4;
        }
    }

    public writeBytes(data: ArrayBuffer, offset?: number) {
        const array = new Uint8Array(data);
        const start = (offset !== undefined) ? offset : this._cursor;

        let written = 0;
        for (let i = 0; i < data.byteLength; i++) {
            this._view.setUint8(start + i, array[i]);
            written++;
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
