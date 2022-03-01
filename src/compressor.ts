import {MessageType, OutMessageData, ProgressFn} from "./workers/compression";

/**
 * The Compressor class implements functionality for compressing Nintendo 64 Zelda ROMs.
 */
export default class Compressor {
    private readonly _worker: Worker;

    private _result?: ArrayBuffer;
    private _onProgress?: ProgressFn;

    public constructor() {
        this._worker = new Worker(new URL("./workers/compression.ts", import.meta.url));
    }

    public deflate(buffer: ArrayBuffer, exclusions: number[] = []) {
        return new Promise(((resolve, reject) => {
            this._worker.onmessage = (ev: MessageEvent<OutMessageData>) => {
                const message = ev.data;

                switch (message.type) {
                    case MessageType.Progress: {
                        if (this._onProgress) {
                            const {file, totalFiles, operation, originalSize, compressedSize} = message;
                            this._onProgress(file, totalFiles, operation, originalSize, compressedSize);
                        }
                        return;
                    }

                    case MessageType.Finished:
                        this._result = message.result;
                        resolve({
                            startTime: message.startTime,
                            finishTime: message.finishTime,
                        });
                        return;
                }
            };

            this._worker.onerror = ev => {
                reject(ev.error);
            }

            // Finally, we are ready to start the worker.
            this._worker.postMessage({
                type: MessageType.StartCompression,
                buffer: buffer,
                exclusions: exclusions,
            });
        }));
    }

    public get result() {
        return this._result;
    }

    public set progressFn(progressFn: ProgressFn) {
        this._onProgress = progressFn;
    }
}
