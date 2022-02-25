import { Patcher } from "./patcher";
import * as fs from "fs";
import Rom from "./rom";

if (process.argv.length < 4) {
    throw new Error("usage: zelda64.js ROM_FILE PATCH_FILE");
}

const romFilename = process.argv[2];
const patchFilename = process.argv[3];

// Open the patch file.
fs.readFile(patchFilename, null, ((err, patchData) => {

    fs.readFile(romFilename, null, ((err, romData) => {
        const patcher = new Patcher(patchData.buffer);
        const patchedRomData = patcher.patch(romData.buffer);
        const patchedRom = new Rom(patchedRomData);
        patchedRom.verifyDmaData();

        fs.writeFile("TriforceBlitz.uncompressed.z64", Buffer.from(patchedRomData), "binary", (err) => {
            if (err !== null) {
                console.error(err);
            } else {
                console.log("Successfully patched ROM! Enjoy.");
            }
        })
    }));
}));
