// electron-builder afterPack hook — runs after the unpacked app directory
// is assembled (with the renamed CV Books.exe in place) but BEFORE the
// installer wraps it. We use this hook to embed the app icon into the
// .exe ourselves via rcedit, sidestepping electron-builder's built-in
// icon embedding which is currently disabled (`signAndEditExecutable:
// false` in package.json — see CLAUDE.md "Packaging gotchas" for the
// reasoning around the winCodeSign tarball extraction error that
// originally forced that setting).
//
// By the time NSIS wraps the .exe into Setup.exe, the icon is already
// embedded — so both the installer AND the installed .exe show the
// correct icon (previously only the installer did; the installed .exe
// kept Electron's default React logo).

const path = require('path');
const fs = require('fs');
// rcedit v5+ changed from a default export to a named export — must
// destructure or you get "rcedit is not a function" at runtime.
const { rcedit } = require('rcedit');

module.exports = async function afterPack(context) {
  const productName = context.packager.appInfo.productFilename || context.packager.appInfo.productName;
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const iconPath = path.join(context.packager.info.projectDir, 'electron', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] ${exePath} not found — skipping icon embed`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[after-pack] ${iconPath} not found — skipping icon embed`);
    return;
  }

  const options = {
    icon: iconPath,
    'version-string': {
      ProductName: context.packager.appInfo.productName,
      FileDescription: context.packager.appInfo.productName,
      CompanyName: 'Certaverus Systems LLC',
      LegalCopyright: `Copyright © ${new Date().getFullYear()} Certaverus Systems LLC`,
    },
    'file-version': context.packager.appInfo.buildVersion,
    'product-version': context.packager.appInfo.version,
  };

  // The freshly written ~225 MB .exe is often held open for a moment by
  // Windows Defender's scan (or another indexer), and rcedit's final write
  // then fails with "Unable to commit changes". That failure happens at
  // EndUpdateResource, before anything is written, so retrying is safe.
  const attempts = 6;
  for (let attempt = 1; ; attempt++) {
    try {
      await rcedit(exePath, options);
      break;
    } catch (err) {
      if (attempt >= attempts) throw err;
      const waitMs = attempt * 2000;
      console.warn(`[after-pack] rcedit attempt ${attempt} failed (${String(err.message || err).split('\n').pop().trim()}) — the .exe is probably being scanned; retrying in ${waitMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  console.log(`[after-pack] embedded icon + version metadata into ${exePath}`);
};
