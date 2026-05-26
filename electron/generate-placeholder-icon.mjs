// One-shot: generate a 256x256 teal placeholder .ico.
// Greg is tracing the real logo separately — this file will be replaced.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'icon.ico');

const SIZE = 256;
const PIXEL_BYTES = SIZE * SIZE * 4;
const MASK_BYTES = (SIZE * SIZE) / 8;

// Teal-ish brand color (B, G, R, A) — matches Tailwind teal-500
const B = 0x94, G = 0xB7, R = 0x14, A = 0xFF;

const pixels = Buffer.alloc(PIXEL_BYTES);
for (let i = 0; i < SIZE * SIZE; i++) {
  pixels[i * 4 + 0] = B;
  pixels[i * 4 + 1] = G;
  pixels[i * 4 + 2] = R;
  pixels[i * 4 + 3] = A;
}

const andMask = Buffer.alloc(MASK_BYTES);

// BITMAPINFOHEADER
const bih = Buffer.alloc(40);
bih.writeUInt32LE(40, 0);              // header size
bih.writeInt32LE(SIZE, 4);             // width
bih.writeInt32LE(SIZE * 2, 8);         // height (doubled for ICO: XOR + AND)
bih.writeUInt16LE(1, 12);              // planes
bih.writeUInt16LE(32, 14);             // bpp
bih.writeUInt32LE(0, 16);              // compression (BI_RGB)
bih.writeUInt32LE(PIXEL_BYTES + MASK_BYTES, 20); // image size

const imageData = Buffer.concat([bih, pixels, andMask]);

// ICONDIRENTRY
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);                       // width (0 = 256)
entry.writeUInt8(0, 1);                       // height (0 = 256)
entry.writeUInt8(0, 2);                       // color count
entry.writeUInt8(0, 3);                       // reserved
entry.writeUInt16LE(1, 4);                    // planes
entry.writeUInt16LE(32, 6);                   // bpp
entry.writeUInt32LE(imageData.length, 8);     // data size
entry.writeUInt32LE(22, 12);                  // offset from start of file (6 + 16)

// ICONDIR
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);                   // reserved
header.writeUInt16LE(1, 2);                   // type (1 = icon)
header.writeUInt16LE(1, 4);                   // image count

fs.writeFileSync(OUT, Buffer.concat([header, entry, imageData]));
console.log(`Wrote placeholder icon: ${OUT} (${fs.statSync(OUT).size} bytes)`);
