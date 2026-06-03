// Generate electron/icon.ico from a high-resolution source PNG.
//
// Windows uses the .ico embedded in the .exe to render the app icon at
// various display sizes — taskbar (32), alt-tab (32-48), Start Menu tile
// (32-256), File Explorer (16-256). If the .ico is missing a size, Windows
// falls back to its framework default (which for Electron apps is the
// React logo). To prevent that, we downsample the high-res source to every
// size Windows might want and pack them all into a single multi-resolution
// .ico.
//
// Run with: `node electron/generate-icon.mjs`
// (Or it runs automatically as part of `npm run electron:build` —
// electron:compile invokes this script first.)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The high-resolution source. Must be at least 256x256; 512x512 or
// 1024x1024 produces the cleanest downsamples. Square aspect ratio.
const SOURCE_PATH = path.join(__dirname, '..', 'public', '512x512_Full_Logo.png');
const OUT_PATH = path.join(__dirname, 'icon.ico');

// Sizes Windows asks for at various display points. 256 is the modern
// Start Menu tile, 48 is the medium-icon view, 32 is the standard
// taskbar/desktop size, 16 is small icons in lists and tooltips. 64 and
// 128 fill in for High-DPI scaling on intermediate sizes.
const SIZES = [16, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`[generate-icon] Source PNG not found at: ${SOURCE_PATH}`);
    console.error(`[generate-icon] Provide a 512x512+ PNG with a transparent background at that path and rerun.`);
    process.exit(1);
  }

  const meta = await sharp(SOURCE_PATH).metadata();
  if ((meta.width || 0) < 256 || (meta.height || 0) < 256) {
    console.error(`[generate-icon] Source PNG is ${meta.width}x${meta.height} — too small. Need at least 256x256, ideally 512x512+.`);
    process.exit(1);
  }
  if (meta.width !== meta.height) {
    console.warn(`[generate-icon] Source PNG is not square (${meta.width}x${meta.height}). Output will be square; image will be stretched/letterboxed by sharp.`);
  }

  console.log(`[generate-icon] Source: ${SOURCE_PATH} (${meta.width}x${meta.height})`);

  // Resample to each target size. Lanczos3 is sharp's default — sharp
  // resampling for downscaling, which produces crisp edges at small sizes.
  const buffers = await Promise.all(
    SIZES.map(async (size) => {
      const buf = await sharp(SOURCE_PATH)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      console.log(`[generate-icon]   resampled to ${size}x${size} (${buf.length} bytes)`);
      return buf;
    }),
  );

  // Pack all sizes into a single .ico file. png-to-ico preserves PNG
  // compression for the larger sizes — modern Windows expects 256x256
  // entries to be PNG-encoded, not raw BMP.
  const icoBuffer = await pngToIco(buffers);
  fs.writeFileSync(OUT_PATH, icoBuffer);

  console.log(`[generate-icon] Wrote ${OUT_PATH} (${icoBuffer.length} bytes, ${SIZES.length} sizes)`);
}

main().catch((err) => {
  console.error('[generate-icon] Failed:', err);
  process.exit(1);
});
