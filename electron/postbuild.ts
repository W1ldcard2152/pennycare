// Post-build: copy assets the Next.js standalone output doesn't include automatically
// (public/ and .next/static/) into .next/standalone so the Electron app has everything
// in one place. Run after `next build` and `tsc -p electron/tsconfig.json`,
// before `electron-builder`.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');

function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying static assets to standalone output...');

const staticSrc = path.join(ROOT, '.next', 'static');
const staticDest = path.join(STANDALONE, '.next', 'static');
copyDirSync(staticSrc, staticDest);

const publicSrc = path.join(ROOT, 'public');
const publicDest = path.join(STANDALONE, 'public');
copyDirSync(publicSrc, publicDest);

// Next.js copies .env files into the standalone output regardless of
// outputFileTracingExcludes. Remove them before packaging — shipping the dev
// .env leaks secrets AND can override the env vars the Electron main process
// sets when spawning the server (especially DATABASE_URL).
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const p = path.join(STANDALONE, name);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`Removed bundled ${name} from standalone.`);
  }
}

console.log('Post-build copy complete.');
