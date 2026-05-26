import { app, BrowserWindow, dialog, globalShortcut, Menu } from 'electron';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let logStream: fs.WriteStream | null = null;

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
    log(`\n========== PennyCare launch ${new Date().toISOString()} ==========`);
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
    const envContent = [
      `JWT_SECRET=${jwtSecret}`,
      `ENCRYPTION_KEY=${encryptionKey}`,
      `DATABASE_URL=${toDatabaseUrl(DB_PATH)}`,
      '',
    ].join('\n');
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
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
      'PennyCare Error',
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
    dialog.showErrorBox('PennyCare Error', `Failed to start server: ${err.message}`);
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
      devTools: true,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show();
  });

  // Hide the menu bar but keep the default app menu so F12 / Ctrl+Shift+I
  // accelerators still work for DevTools.
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    openLog();
    ensureDataDir();
    syncDatabase();
    const port = await findFreePort();
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
      'PennyCare Error',
      `Failed to start: ${err instanceof Error ? err.message : String(err)}\n\nSee log at:\n${LOG_PATH}`
    );
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
  logStream?.end();
});
