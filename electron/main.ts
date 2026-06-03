import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell } from 'electron';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort: number | null = null;
let logStream: fs.WriteStream | null = null;
let quitInProgress = false;
let periodicBackupTimer: NodeJS.Timeout | null = null;

// Frequency of the in-session auto-backup timer. Aligns with the 4h cooldown
// on the auto endpoint so a fresh manual backup naturally suppresses the
// next periodic tick.
const PERIODIC_BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000;

const DATA_DIR = app.getPath('userData');
const DB_PATH = path.join(DATA_DIR, 'pennycare.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const TEMPLATES_DIR = path.join(DATA_DIR, 'document-templates', 'company');
const ENV_PATH = path.join(DATA_DIR, '.env');
const LOG_PATH = path.join(DATA_DIR, 'electron.log');

// Prisma's SQLite URL parser is unhappy with backslashes on Windows.
// Convert path separators to forward slashes for the file: URL.
function toDatabaseUrl(absPath: string): string {
  return `file:${absPath.replace(/\\/g, '/')}`;
}

function openLog(): void {
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
    }
    logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
    log(`\n========== CV Books launch ${new Date().toISOString()} ==========`);
    log(`DATA_DIR=${DATA_DIR}`);
    log(`DB_PATH=${DB_PATH}`);
    log(`appPath=${app.getAppPath()}`);
  } catch {
    // Logging is best-effort
  }
}

function log(line: string): void {
  console.log(line);
  logStream?.write(`${line}\n`);
}

function logErr(line: string): void {
  console.error(line);
  logStream?.write(`${line}\n`);
}

function ensureDataDir(): void {
  for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, TEMPLATES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  if (!fs.existsSync(ENV_PATH)) {
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const internalBackupSecret = crypto.randomBytes(32).toString('hex');
    const envContent = [
      `JWT_SECRET=${jwtSecret}`,
      `ENCRYPTION_KEY=${encryptionKey}`,
      `INTERNAL_BACKUP_SECRET=${internalBackupSecret}`,
      `DATABASE_URL=${toDatabaseUrl(DB_PATH)}`,
      '',
    ].join('\n');
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
  } else {
    // Existing installs predate INTERNAL_BACKUP_SECRET — add it if missing
    // so auto-backup works without forcing the user to delete .env.
    const existing = fs.readFileSync(ENV_PATH, 'utf-8');
    if (!existing.includes('INTERNAL_BACKUP_SECRET=')) {
      const newSecret = crypto.randomBytes(32).toString('hex');
      fs.appendFileSync(ENV_PATH, `INTERNAL_BACKUP_SECRET=${newSecret}\n`, 'utf-8');
    }
  }
}

function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(ENV_PATH)) return env;

  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding single or double quotes if present.
    if (value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
  return env;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
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

function unpackedPath(p: string): string {
  return p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

function syncDatabase(): void {
  try {
    const appRoot = app.getAppPath();
    const prismaCliJs = unpackedPath(path.join(appRoot, 'node_modules', 'prisma', 'build', 'index.js'));
    const schemaPath = unpackedPath(path.join(appRoot, 'prisma', 'schema.prisma'));

    if (!fs.existsSync(prismaCliJs)) {
      log(`[db-sync] Prisma CLI not found at ${prismaCliJs} — skipping schema sync.`);
      return;
    }
    if (!fs.existsSync(schemaPath)) {
      log(`[db-sync] Prisma schema not found at ${schemaPath} — skipping schema sync.`);
      return;
    }

    const result = spawnSync(process.execPath, [prismaCliJs, 'db', 'push', `--schema=${schemaPath}`, '--skip-generate', '--accept-data-loss'], {
      env: {
        ...process.env,
        DATABASE_URL: toDatabaseUrl(DB_PATH),
        ELECTRON_RUN_AS_NODE: '1',
      },
      cwd: unpackedPath(appRoot),
      encoding: 'utf-8',
    });

    if (result.status === 0) {
      log('[db-sync] Database schema synced.');
    } else {
      log(`[db-sync] Schema sync exited with ${result.status}:\n${result.stderr || result.stdout}`);
    }
  } catch (err) {
    log(`[db-sync] Schema sync failed (non-fatal): ${err}`);
  }
}

async function startServer(port: number): Promise<void> {
  const envVars = loadEnvFile();

  const appRoot = app.getAppPath();
  const standaloneDir = unpackedPath(path.join(appRoot, '.next', 'standalone'));
  const serverPath = path.join(standaloneDir, 'server.js');

  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox(
      'CV Books Error',
      `Server file not found at:\n${serverPath}\n\nThe application may not have been built correctly.`
    );
    app.quit();
    return;
  }

  const enginePathCandidates = [
    path.join(appRoot, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
    path.join(standaloneDir, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
  ];
  const prismaEnginePath = enginePathCandidates.find(fs.existsSync) || enginePathCandidates[0];
  log(`[startup] Prisma engine: ${prismaEnginePath}`);

  const dbUrl = toDatabaseUrl(DB_PATH);
  log(`[startup] DATABASE_URL=${dbUrl}`);

  // Build env: defaults from %APPDATA%/.env, then our overrides win.
  // We explicitly do NOT include process.env here so a stray DATABASE_URL or
  // NODE_ENV inherited from the user's shell can't leak in.
  const serverEnv: NodeJS.ProcessEnv = {
    // Pass through harmless system vars Node needs
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    USERPROFILE: process.env.USERPROFILE,
    HOMEDRIVE: process.env.HOMEDRIVE,
    HOMEPATH: process.env.HOMEPATH,
    ...envVars,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    DATABASE_URL: dbUrl,
    PENNYCARE_DATA_DIR: DATA_DIR,
    ELECTRON_RUN_AS_NODE: '1',
    PRISMA_QUERY_ENGINE_LIBRARY: prismaEnginePath,
  };

  serverProcess = spawn(process.execPath, [serverPath], {
    env: serverEnv,
    cwd: standaloneDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trimEnd();
    log(`[server] ${text}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trimEnd();
    logErr(`[server-err] ${text}`);
  });

  serverProcess.on('error', (err) => {
    logErr(`[server] spawn error: ${err.message}`);
    dialog.showErrorBox('CV Books Error', `Failed to start server: ${err.message}`);
    app.quit();
  });

  serverProcess.on('exit', (code, signal) => {
    logErr(`[server] process exited code=${code} signal=${signal}`);
  });

  await waitForServer(port);
}

function waitForServer(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = net.createConnection({ port, host: '127.0.0.1' }, () => {
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

function createWindow(port: number): void {
  // electron-dist/preload.js is compiled from electron/preload.ts by the
  // electron:build pipeline. The path resolution mirrors the production
  // bundle layout — main.js and preload.js sit in the same directory.
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'CV Books - Bookkeeping & Payroll',
    icon: path.join(app.getAppPath(), 'electron', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      preload: preloadPath,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Offline-first contract enforcement: the app window only ever loads
  // content from our own localhost server. External links (IRS, NY Tax,
  // SSA, etc.) are handed off to the user's default browser via
  // shell.openExternal so they open OUTSIDE the app — never inside it.
  // This way "the app makes no network calls" stays true in the strong
  // sense, and the user always sees a clear handoff when leaving CV Books.
  const localServerOrigin = `http://127.0.0.1:${port}`;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localServerOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // target="_blank" links and window.open() calls — refuse to open a
    // new Electron window for any external URL; pass it to the OS browser.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show();
    // Fire-and-forget startup backup. The endpoint will short-circuit if
    // a backup happened in the last 4h, so reopening the app multiple
    // times a day doesn't generate noise.
    runAutoBackup('auto_on_open').catch((err) => {
      log(`[auto-backup] on-open promise rejected: ${err}`);
    });
    // Start the 4-hourly in-session timer so long open sessions still
    // get periodic backups even without an open/close cycle.
    startPeriodicBackupTimer();
  });

  // Hide the menu bar but keep the default app menu so F12 / Ctrl+Shift+I
  // accelerators still work for DevTools.
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handler: open a native folder picker. Renderer calls
// `window.pennycare.pickFolder()` (defined in preload.ts), which invokes
// this. Returns the chosen folder path, or null if the user canceled.
ipcMain.handle('pennycare:pick-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use This Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Start the in-session periodic backup timer. Fires every 4 hours; the
// auto endpoint's cooldown ensures we don't pile on right after a manual
// backup. Stopped during quit so the timer doesn't fire mid-shutdown.
function startPeriodicBackupTimer(): void {
  if (periodicBackupTimer) return; // Idempotent
  periodicBackupTimer = setInterval(() => {
    runAutoBackup('auto_scheduled').catch((err) => {
      log(`[auto-backup] scheduled promise rejected: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, PERIODIC_BACKUP_INTERVAL_MS);
  log(`[auto-backup] periodic timer started (every ${PERIODIC_BACKUP_INTERVAL_MS / 1000 / 60 / 60}h)`);
}

function stopPeriodicBackupTimer(): void {
  if (periodicBackupTimer) {
    clearInterval(periodicBackupTimer);
    periodicBackupTimer = null;
  }
}

// Trigger an auto-backup by calling the localhost-only auto endpoint.
// The Next.js server validates the X-Internal-Secret header against the
// same value we wrote into the .env file, so the call only works from
// this main process. Returns true on success, false on error.
async function runAutoBackup(source: 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled'): Promise<boolean> {
  if (serverPort === null) {
    log('[auto-backup] server port unknown, skipping');
    return false;
  }
  const envVars = loadEnvFile();
  const secret = envVars.INTERNAL_BACKUP_SECRET;
  if (!secret) {
    log('[auto-backup] INTERNAL_BACKUP_SECRET missing from env, skipping');
    return false;
  }
  try {
    const url = `http://127.0.0.1:${serverPort}/api/admin/backup/auto`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ source }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      skipped?: boolean;
      reason?: string;
      filename?: string;
      error?: string;
    };
    if (!res.ok) {
      log(`[auto-backup] ${source} failed (${res.status}): ${JSON.stringify(data)}`);
      return false;
    }
    if (data.skipped) {
      log(`[auto-backup] ${source} skipped: ${data.reason}`);
    } else {
      log(`[auto-backup] ${source} succeeded: ${data.filename}`);
    }
    return true;
  } catch (err) {
    log(`[auto-backup] ${source} threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

app.on('ready', async () => {
  try {
    openLog();
    ensureDataDir();
    syncDatabase();
    const port = await findFreePort();
    serverPort = port;
    await startServer(port);
    createWindow(port);

    // Global shortcut to pop DevTools — works regardless of menu state.
    globalShortcut.register('F12', () => {
      mainWindow?.webContents.toggleDevTools();
    });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow?.webContents.toggleDevTools();
    });
  } catch (err) {
    logErr(`[fatal] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    dialog.showErrorBox(
      'CV Books Error',
      `Failed to start: ${err instanceof Error ? err.message : String(err)}\n\nSee log at:\n${LOG_PATH}`
    );
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Don't kill the server here — let before-quit handle it after the
  // auto-backup runs. Just trigger the quit cycle.
  app.quit();
});

// Quit cycle:
//   1st pass — preventDefault, run on-quit auto-backup against the still-live
//              server, then kill the server and exit cleanly.
//   2nd pass (after app.exit) — the process has already terminated.
//
// We avoid `app.quit()` for the actual exit because that retriggers
// before-quit. `app.exit(0)` skips the cycle.
app.on('before-quit', async (event) => {
  if (quitInProgress) return;
  quitInProgress = true;
  event.preventDefault();

  // Stop the periodic timer so it can't fire mid-shutdown.
  stopPeriodicBackupTimer();

  // Best-effort backup before tearing down. Bounded so a hung backup
  // (USB drive disconnected mid-write, slow network share) can't trap the
  // user in a window that won't close. 60s covers typical backups even on
  // slow USB 2.0; if it fires mid-copy the atomic-write pattern in
  // performBackup() ensures we never leave a corrupt .db on disk —
  // worst case we leave a .tmp file that gets cleaned up next backup.
  const QUIT_BACKUP_TIMEOUT_MS = 60000;
  try {
    await Promise.race([
      runAutoBackup('auto_on_quit'),
      new Promise<boolean>((resolve) => setTimeout(() => {
        log(`[auto-backup] on-quit timed out at ${QUIT_BACKUP_TIMEOUT_MS / 1000}s, proceeding with exit`);
        resolve(false);
      }, QUIT_BACKUP_TIMEOUT_MS)),
    ]);
  } catch (err) {
    log(`[auto-backup] on-quit failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  logStream?.end();
  app.exit(0);
});
