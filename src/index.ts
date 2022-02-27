import * as fs from "fs";
import Patcher from "./patcher";
import Rom from "./rom";
import Decompressor from "./decompressor";

if (process.argv.length < 4) {
    throw new Error("usage: zelda64.js ROM_FILE PATCH_FILE");
}

const romFilename = process.argv[2];
const patchFilename = process.argv[3];

fs.readFile(patchFilename, null, ((err, patchData) => {
    fs.readFile(romFilename, null, ((err, romData) => {
        console.log(`Inflating ROM '${romFilename}'`);
        const decompressor = new Decompressor(romData.buffer);
        const decompData = decompressor.inflate();

        fs.writeFile("ZOOTDEC.z64", Buffer.from(decompData), "binary", (err) =>{
            if (err !== null ) {
                console.error(err);
            } else {
                console.log("Saving decompressed ROM to ZOOTDEC.z64");
            }
        });

        console.log(`Applying patch '${patchFilename}' to decompressed ROM`);
        const patcher = new Patcher(patchData.buffer);
        const patchedRomData = patcher.patch(decompData);
        console.log("Successfully patched ROM");

        fs.writeFile("TriforceBlitz.uncompressed.z64", Buffer.from(patchedRomData), "binary", (err) => {
            if (err !== null) {
                console.error(err);
            } else {
                console.log(`Saving patched ROM to 'TriforceBlitz.uncompressed.z64'`);
            }
        });
    }));
}));
