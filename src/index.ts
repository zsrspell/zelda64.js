import * as fs from "fs";
import Patcher from "./patcher";
import Rom from "./rom";
import Decompressor from "./decompressor";
import {Compressor} from "./compressor";

if (process.argv.length < 4) {
    throw new Error("usage: zelda64.js ROM_FILE PATCH_FILE");
}

const romFilename = process.argv[2];
const patchFilename = process.argv[3];

const ootExclusions = [
    1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509
]

fs.readFile(patchFilename, null, ((err, patchData) => {
    fs.readFile(romFilename, null, ((err, romData) => {
        console.log(`Inflating ROM '${romFilename}'`);
        const decompressor = new Decompressor(romData.buffer);
        const result = decompressor.inflate();

        fs.writeFile("ZOOTDEC.z64", Buffer.from(result.data), "binary", (err) =>{
            if (err !== null ) {
                console.error(err);
            } else {
                console.log("Saved decompressed ROM to ZOOTDEC.z64");
            }
        });

        console.log(`Applying patch '${patchFilename}' to decompressed ROM`);
        const patcher = new Patcher(patchData.buffer);
        const patchedRomData = patcher.patch(result.data);
        console.log("Successfully patched ROM");

        fs.writeFile("TriforceBlitz.uncompressed.z64", Buffer.from(patchedRomData), "binary", (err) => {
            if (err !== null) {
                console.error(err);
            } else {
                console.log(`Saved patched ROM to 'TriforceBlitz.uncompressed.z64'`);
            }
        });

        console.log("Deflating patched ROM");
        const compressor = new Compressor(patchedRomData, [...result.exclusions, ...ootExclusions]);
        const compressedRomData = compressor.deflate();

        fs.writeFile("TriforceBlitz.z64", Buffer.from(compressedRomData), "binary", (err) => {
            if (err !== null) {
                console.error(err);
            } else {
                console.log(`Saved compressed ROM to 'TriforceBlitz.z64'`);
            }
        });
    }));
}));
