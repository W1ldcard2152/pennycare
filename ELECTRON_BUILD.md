# PennyCare Electron Wrapper — Implementation Guide

## Goal

Wrap the existing PennyCare Next.js app in Electron so it can be installed and run as a standalone Windows desktop application. The database format and file structure must remain identical so a database from the current `npm run dev` / `npm run start` setup can be copied into the Electron app's data directory and work immediately (and vice versa).

---

## Constraints

1. **Zero changes to existing app behavior** — `npm run dev` and `npm run build && npm start` must continue to work exactly as they do now. Electron is an additive layer.
2. **Database portability** — The SQLite file (`pennycare.db`) is the same format in both modes. To migrate from the dev setup to Electron, the user copies the `.db` file and the `uploads/` folder into the Electron app data directory.
3. **Offline-only** — No internet required at runtime. No auto-update servers. Updates are manual (run a new installer over the old one).
4. **Single-user, single-machine** — No multi-machine sync, no network access needed.
5. **Windows target** — Build for Windows x64 only (for now).

---

## Architecture

```
Electron Main Process (electron/main.ts)
  │
  ├── On startup:
  │   ├── Ensure app data directory exists (%APPDATA%/PennyCare/)
  │   ├── Copy default .env if first run
  │   ├── Set DATABASE_URL environment variable pointing to app data
  │   ├── Run Prisma migrations if needed (db push equivalent)
  │   ├── Find a free port
  │   ├── Start Next.js production server (standalone output)
  │   └── Open BrowserWindow pointed at localhost:PORT
  │
  ├── On close:
  │   └── Kill the Next.js server, exit cleanly
  │
  └── App data directory (%APPDATA%/PennyCare/):
      ├── pennycare.db          ← SQLite database
      ├── uploads/              ← Employee documents, imported files
      └── .env                  ← JWT_SECRET, ENCRYPTION_KEY
```

### Why Standalone Output

Next.js has a `standalone` output mode (`output: 'standalone'` in next.config.ts) that produces a self-contained server with only the dependencies it needs. This is critical for Electron — instead of shipping the entire `node_modules` (hundreds of MB), you ship a lean server folder. The standalone output includes its own `server.js` entry point that Electron spawns as a child process.

---

## Implementation Steps

### Step 1: Update next.config.ts

Add standalone output mode. This doesn't affect `npm run dev` — it only changes the production build output.

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### Step 2: Create lib/paths.ts

A shared utility that resolves data paths based on environment. This is the key to database portability.

```typescript
import path from 'path';

/**
 * Resolves the app data directory.
 * 
 * - In Electron production: %APPDATA%/PennyCare/
 * - In dev / non-Electron: project root (current behavior)
 * 
 * The PENNYCARE_DATA_DIR env var is set by the Electron main process.
 * If not set, we fall back to the project root for backward compatibility.
 */
export function getDataDir(): string {
  return process.env.PENNYCARE_DATA_DIR || process.cwd();
}

/**
 * Returns the full path to the SQLite database file.
 * Used to construct DATABASE_URL at startup.
 */
export function getDatabasePath(): string {
  const dataDir = getDataDir();
  // Match current structure: prisma/pennycare.db relative to data dir
  // In Electron mode, we flatten this to just pennycare.db in the data dir
  if (process.env.PENNYCARE_DATA_DIR) {
    return path.join(dataDir, 'pennycare.db');
  }
  // Dev mode: use existing path structure
  return path.join(dataDir, 'prisma', 'pennycare.db');
}

/**
 * Returns the uploads directory path.
 */
export function getUploadsDir(): string {
  return path.join(getDataDir(), 'uploads');
}
```

**Important**: Any existing code that references `uploads/` for file storage should be updated to use `getUploadsDir()`. Search the codebase for hardcoded `uploads/` paths and update them.

### Step 3: Update Prisma Configuration

In `prisma/schema.prisma`, add the Windows binary target to the generator block:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "windows"]
}
```

This ensures the Windows Prisma query engine gets generated alongside the native one (for dev on whatever OS you're developing on). The `native` target keeps your dev environment working; `windows` is what the packaged app uses.

### Step 4: Create the Electron Main Process

Create `electron/main.ts`:

```typescript
import { app, BrowserWindow, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

// App data directory: %APPDATA%/PennyCare/ on Windows
const DATA_DIR = path.join(app.getPath('userData'));
const DB_PATH = path.join(DATA_DIR, 'pennycare.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ENV_PATH = path.join(DATA_DIR, '.env');

/**
 * Ensure the app data directory and subdirectories exist.
 * On first run, generate secrets and create .env.
 */
function ensureDataDir(): void {
  // Create data directory
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Create uploads directory
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Create .env with generated secrets on first run
  if (!fs.existsSync(ENV_PATH)) {
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const envContent = [
      `JWT_SECRET=${jwtSecret}`,
      `ENCRYPTION_KEY=${encryptionKey}`,
      `DATABASE_URL=file:${DB_PATH}`,
      '',
    ].join('\n');
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
  }
}

/**
 * Read .env file and return as key-value object.
 */
function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
        }
      }
    }
  }
  return env;
}

/**
 * Find a free port to run the Next.js server on.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not find free port'));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Start the Next.js standalone server as a child process.
 */
async function startServer(port: number): Promise<void> {
  const envVars = loadEnvFile();

  // The standalone server.js is in the build output
  const serverPath = path.join(app.getAppPath(), '.next', 'standalone', 'server.js');

  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox(
      'PennyCare Error',
      `Server file not found at: ${serverPath}\n\nThe application may not have been built correctly.`
    );
    app.quit();
    return;
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ...envVars,
      PORT: String(port),
      HOSTNAME: 'localhost',
      NODE_ENV: 'production',
      DATABASE_URL: `file:${DB_PATH}`,
      PENNYCARE_DATA_DIR: DATA_DIR,
    },
    cwd: path.join(app.getAppPath(), '.next', 'standalone'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    dialog.showErrorBox('PennyCare Error', `Failed to start server: ${err.message}`);
    app.quit();
  });

  // Wait for the server to be ready
  await waitForServer(port);
}

/**
 * Poll until the server responds, with timeout.
 */
function waitForServer(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = net.createConnection({ port, host: 'localhost' }, () => {
        req.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start within 30 seconds'));
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
}

/**
 * Create the main application window.
 */
function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'PennyCare',
    icon: path.join(app.getAppPath(), 'electron', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Show after load to prevent white flash
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Show window once content is loaded
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show();
  });

  // Hide menu bar (optional — remove if you want a menu)
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────

app.on('ready', async () => {
  try {
    ensureDataDir();
    const port = await findFreePort();
    await startServer(port);
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox(
      'PennyCare Error',
      `Failed to start: ${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
```

### Step 5: Create electron/preload.ts (minimal)

```typescript
// Minimal preload — no Node APIs exposed to renderer.
// PennyCare's UI communicates via HTTP to the Next.js server,
// so no electron-specific bridges are needed.
```

### Step 6: Create electron/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "../electron-dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["./**/*.ts"]
}
```

### Step 7: Install Dependencies

```bash
npm install --save-dev electron electron-builder
npm install --save-dev @types/electron
```

Note: `electron` and `electron-builder` are **devDependencies** — they don't ship in the Next.js bundle. They're only used for building the desktop wrapper.

### Step 8: Update package.json

Add/update these fields:

```jsonc
{
  "name": "pennycare",
  "version": "1.0.0",
  "description": "Payroll and bookkeeping management for small businesses",
  "author": "Certaverus Systems LLC",
  "license": "ISC",
  "main": "electron-dist/main.js",  // Electron entry point (compiled)

  "scripts": {
    // ... keep all existing scripts unchanged ...

    // New Electron scripts:
    "electron:dev": "npm run build && tsc -p electron/tsconfig.json && electron .",
    "electron:build": "npm run build && tsc -p electron/tsconfig.json && electron-builder --win",
    "electron:compile": "tsc -p electron/tsconfig.json"
  },

  "build": {
    "appId": "com.pennycare.app",
    "productName": "PennyCare",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron-dist/**/*",
      ".next/standalone/**/*",
      ".next/static/**/*",
      "public/**/*",
      "prisma/schema.prisma",
      "node_modules/.prisma/**/*",
      "node_modules/@prisma/client/**/*",
      "node_modules/@prisma/engines/**/*"
    ],
    "extraResources": [
      {
        "from": "node_modules/.prisma/client/query_engine-windows.dll.node",
        "to": "prisma-engines/query_engine-windows.dll.node"
      }
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "electron/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "electron/icon.ico",
      "uninstallerIcon": "electron/icon.ico",
      "installerHeaderIcon": "electron/icon.ico",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "PennyCare"
    }
  }
}
```

### Step 9: Create the App Icon

Place a Windows `.ico` file at `electron/icon.ico`. 

**Requirements:**
- Must be `.ico` format (not PNG, not SVG)
- Should contain multiple sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
- Can be created from a high-res PNG using an online converter or Illustrator's export

**For initial development**, create a simple placeholder. Greg will replace this with the traced logo as the first update test.

### Step 10: Handle the Static Files Copy

Next.js standalone output doesn't include the `public/` folder or `.next/static/` automatically — they need to be copied alongside the standalone server. Add a post-build copy step.

Create `electron/postbuild.ts`:

```typescript
/**
 * Post-build script: copies static assets into the standalone output
 * so the Electron app has everything it needs in one place.
 * 
 * Run after `next build` but before `electron-builder`.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');

// Copy .next/static → .next/standalone/.next/static
const staticSrc = path.join(ROOT, '.next', 'static');
const staticDest = path.join(STANDALONE, '.next', 'static');

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
copyDirSync(staticSrc, staticDest);

// Copy public/ → .next/standalone/public/
const publicSrc = path.join(ROOT, 'public');
const publicDest = path.join(STANDALONE, 'public');
copyDirSync(publicSrc, publicDest);

console.log('Post-build copy complete.');
```

Update the electron:build script to include this step:

```json
"electron:build": "npm run build && tsc -p electron/tsconfig.json && tsx electron/postbuild.ts && electron-builder --win"
```

---

## Database Migration on App Startup

When the app starts and finds an existing database (either from a previous version or copied from the dev setup), Prisma needs to sync the schema. In the Electron main process, before starting the server, run a schema sync:

Add this to `electron/main.ts` inside the `app.on('ready')` handler, after `ensureDataDir()` and before `startServer()`:

```typescript
import { execSync } from 'child_process';

// Run prisma db push to sync schema (safe for existing databases)
function syncDatabase(): void {
  try {
    const prismaPath = path.join(app.getAppPath(), 'node_modules', '.bin', 'prisma');
    const schemaPath = path.join(app.getAppPath(), 'prisma', 'schema.prisma');
    
    execSync(`"${prismaPath}" db push --schema="${schemaPath}" --skip-generate`, {
      env: {
        ...process.env,
        DATABASE_URL: `file:${DB_PATH}`,
      },
      cwd: app.getAppPath(),
      stdio: 'pipe',
    });
    console.log('Database schema synced.');
  } catch (err) {
    console.error('Database sync warning:', err);
    // Non-fatal — the database may already be in sync
  }
}
```

This means: copy your `pennycare.db` from `prisma/pennycare.db` (current dev location) into `%APPDATA%/PennyCare/`, launch the Electron app, and it just works. If you've added new columns since the last time that database was used, Prisma adds them automatically.

---

## Moving Your Existing Database to Electron

**From dev setup → Electron:**
1. Stop the dev server
2. Copy `prisma/pennycare.db` to `%APPDATA%/PennyCare/pennycare.db`
3. Copy `uploads/` folder to `%APPDATA%/PennyCare/uploads/`
4. Copy your `.env` values (JWT_SECRET, ENCRYPTION_KEY) into `%APPDATA%/PennyCare/.env`
5. Launch PennyCare — done

**CRITICAL**: The JWT_SECRET and ENCRYPTION_KEY **must** match what was used when the data was created. If you let the Electron app generate new secrets on first run and then copy in a database encrypted with different keys, encrypted fields (SSN, bank accounts) will be unreadable. Copy the secrets first, then the database.

**From Electron → dev setup:**
1. Close PennyCare
2. Copy `%APPDATA%/PennyCare/pennycare.db` to `prisma/pennycare.db`
3. Copy uploads back
4. Make sure `.env` / `.env.local` has the same secrets
5. Run `npm run dev` — done

---

## Uploads Directory Note

Search the codebase for any hardcoded references to the `uploads/` directory path. These need to respect the `PENNYCARE_DATA_DIR` environment variable when set. Common locations to check:

- Employee document upload API (`app/api/employees/[id]/documents/route.ts`)
- Any file storage utilities
- Any static file serving configuration

The pattern: use `process.env.PENNYCARE_DATA_DIR ? path.join(process.env.PENNYCARE_DATA_DIR, 'uploads') : path.join(process.cwd(), 'uploads')` or import from `lib/paths.ts`.

---

## .gitignore Additions

```gitignore
# Electron build output
electron-dist/
dist-electron/

# Electron app data (never commit real user data)
electron/icon.ico  # Optional — you may WANT to commit this
```

---

## Build Checklist

Before the first build:

- [ ] `next.config.ts` has `output: 'standalone'`
- [ ] `prisma/schema.prisma` has `binaryTargets = ["native", "windows"]`
- [ ] `electron/main.ts` created
- [ ] `electron/tsconfig.json` created
- [ ] `electron/postbuild.ts` created
- [ ] `electron/icon.ico` exists (placeholder OK)
- [ ] `lib/paths.ts` created
- [ ] Upload paths updated to use `getUploadsDir()` or respect `PENNYCARE_DATA_DIR`
- [ ] `package.json` updated with `main`, new scripts, and `build` config
- [ ] `electron` and `electron-builder` installed as devDependencies
- [ ] Run `npx prisma generate` (to generate Windows binary target)
- [ ] Run `npm run electron:build`
- [ ] Test: install on Windows, create account, verify database at `%APPDATA%/PennyCare/`
- [ ] Test: copy existing dev database in, verify data loads correctly

## Update Flow (for future releases)

1. Make changes to PennyCare codebase
2. Bump version in `package.json`
3. Run `npm run electron:build`
4. Output: `dist-electron/PennyCare-Setup-X.X.X.exe`
5. Copy installer to target machine
6. Run installer — it overwrites app files, database in AppData is untouched
7. Launch PennyCare — schema syncs automatically if needed

## CLAUDE.md Additions

Add this section to CLAUDE.md:

```markdown
### Electron Desktop Wrapper

PennyCare can be packaged as a standalone Windows desktop app using Electron.

**Development is unchanged** — use `npm run dev` as always. Electron is only for packaging.

**Key files:**
- `electron/main.ts` — Electron main process (starts Next.js server, opens window)
- `electron/postbuild.ts` — Copies static assets into standalone output
- `electron/tsconfig.json` — TypeScript config for Electron files
- `electron/icon.ico` — App icon (Windows .ico format)
- `lib/paths.ts` — Resolves data paths (database, uploads) based on environment

**Environment detection:**
- `PENNYCARE_DATA_DIR` env var is set by Electron main process → production/desktop mode
- Absent → dev mode (uses project root, current behavior)

**Data directory (Electron mode):** `%APPDATA%/PennyCare/`
- `pennycare.db` — SQLite database
- `uploads/` — Employee documents
- `.env` — Secrets (JWT_SECRET, ENCRYPTION_KEY)

**Build commands:**
```bash
npm run electron:dev    # Build + launch Electron locally for testing
npm run electron:build  # Build + package into Windows installer
```

**Output:** `dist-electron/PennyCare-Setup-X.X.X.exe`

**Database portability:** The database file is identical between dev and Electron modes. To migrate, copy the `.db` file and `.env` secrets between `prisma/` (dev) and `%APPDATA%/PennyCare/` (Electron). The app runs `prisma db push` on startup to sync schema.
```
