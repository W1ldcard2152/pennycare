import {
  app,
  BrowserWindow,
  WebContentsView,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import { randomUUID } from 'crypto';

let serverProcess: ChildProcess | null = null;
let serverPort: number | null = null;
let localServerOrigin: string | null = null;
let logStream: fs.WriteStream | null = null;
let quitInProgress = false;
let periodicBackupTimer: NodeJS.Timeout | null = null;
// Fires on-open backup once when the very first tab in the app finishes
// loading its first page — not on every subsequent tab spawn or reload.
let firstTabBackupTriggered = false;

// Height of the chrome shell (tab strip) in CSS pixels. The active tab's
// WebContentsView is positioned at y=CHROME_HEIGHT and stretched to fill
// the remaining content area.
const CHROME_HEIGHT = 36;

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

// ============================================================================
// Tab manager
// ============================================================================
//
// Each BrowserWindow hosts a chrome shell (the tab strip, loaded from
// /electron-chrome) as its root web contents, plus N WebContentsView
// children — one per tab. Only the active tab's view is positioned in
// the visible area; inactive tabs sit at zero-size off-screen but stay
// fully live, so background tabs really load instead of deferring.

interface TabState {
  id: string;
  view: WebContentsView;
  title: string;
  url: string;
  pathname: string; // dedup key — pathname only, query string excluded
  loading: boolean;
}

interface WindowState {
  window: BrowserWindow;
  tabs: TabState[];
  activeTabId: string | null;
}

const windows = new Map<number, WindowState>();

function dedupKey(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function findWindowStateBySender(sender: Electron.WebContents): WindowState | undefined {
  for (const state of windows.values()) {
    if (state.window.isDestroyed()) continue;
    if (state.window.webContents.id === sender.id) return state;
  }
  return undefined;
}

function findTab(state: WindowState, tabId: string): TabState | undefined {
  return state.tabs.find((t) => t.id === tabId);
}

function tabSummary(t: TabState) {
  return {
    id: t.id,
    title: t.title,
    url: t.url,
    pathname: t.pathname,
    loading: t.loading,
  };
}

function broadcastTabs(state: WindowState): void {
  if (state.window.isDestroyed()) return;
  const payload = {
    tabs: state.tabs.map(tabSummary),
    activeTabId: state.activeTabId,
  };
  state.window.webContents.send('tabs:state', payload);
}

function repositionActiveView(state: WindowState): void {
  if (!state.activeTabId) return;
  const tab = findTab(state, state.activeTabId);
  if (!tab) return;
  const bounds = state.window.getContentBounds();
  tab.view.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - CHROME_HEIGHT),
  });
}

function setActiveTab(state: WindowState, tabId: string): void {
  if (state.activeTabId === tabId) {
    // Already active — still re-broadcast in case caller expected an update
    broadcastTabs(state);
    return;
  }
  // Hide the previously-active view by collapsing its bounds. We do NOT
  // destroy it — background tabs stay alive so navigating back is instant
  // and forms keep their unsaved state.
  if (state.activeTabId) {
    const prev = findTab(state, state.activeTabId);
    if (prev) {
      prev.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }
  state.activeTabId = tabId;
  repositionActiveView(state);
  const tab = findTab(state, tabId);
  if (tab) {
    tab.view.webContents.focus();
    if (!state.window.isDestroyed()) {
      state.window.setTitle(tab.title || 'CV Books');
    }
  }
  broadcastTabs(state);
}

function createTab(
  state: WindowState,
  url: string,
  opts: { foreground: boolean; afterTabId?: string },
): TabState {
  const preloadPath = path.join(__dirname, 'preload.js');
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      devTools: true,
    },
  });
  state.window.contentView.addChildView(view);

  const tabId = randomUUID();
  const tab: TabState = {
    id: tabId,
    view,
    title: 'Loading…',
    url,
    pathname: dedupKey(url),
    loading: true,
  };

  // Insert adjacent to the source tab — immediately to its right — or
  // append if no anchor was given (e.g. the very first tab).
  if (opts.afterTabId) {
    const idx = state.tabs.findIndex((t) => t.id === opts.afterTabId);
    if (idx >= 0) {
      state.tabs.splice(idx + 1, 0, tab);
    } else {
      state.tabs.push(tab);
    }
  } else {
    state.tabs.push(tab);
  }

  attachTabHandlers(state, tab);
  view.webContents.loadURL(url).catch((err) => {
    log(`[tabs] loadURL failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (opts.foreground || !state.activeTabId) {
    setActiveTab(state, tabId);
  } else {
    // Background tab: keep off-screen but live.
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    broadcastTabs(state);
  }

  return tab;
}

// Window-scoped dedup. If a tab with the same pathname exists in THIS
// window, focus it instead of creating a duplicate. Strictly does not
// reach into other windows — opening on the right monitor must never
// yank focus to a tab on the left monitor. Returns the existing tab id
// if dedup applied, otherwise null.
function dedupWithinWindow(state: WindowState, url: string): string | null {
  const key = dedupKey(url);
  const existing = state.tabs.find((t) => t.pathname === key);
  return existing ? existing.id : null;
}

function attachTabHandlers(state: WindowState, tab: TabState): void {
  const wc = tab.view.webContents;

  // Offline-first contract: app windows only ever load content from the
  // local server. External URLs are punted to the user's OS browser.
  wc.on('will-navigate', (event, navUrl) => {
    if (localServerOrigin && !navUrl.startsWith(localServerOrigin)) {
      event.preventDefault();
      shell.openExternal(navUrl);
    }
  });

  // Modifier-click / target=_blank / window.open routing. Electron's
  // disposition field already encodes the browser's standard mapping:
  //   - 'background-tab' = Ctrl+click OR middle-click  → new background tab
  //   - 'foreground-tab' = Ctrl+Shift+click            → new foreground tab
  //   - 'new-window'     = Shift+click OR window.open with features → new window
  // We reuse that mapping verbatim so the gestures behave like a browser.
  wc.setWindowOpenHandler(({ url: targetUrl, disposition }) => {
    if (localServerOrigin && targetUrl.startsWith(localServerOrigin)) {
      if (disposition === 'new-window') {
        spawnWindow(targetUrl);
        return { action: 'deny' };
      }
      const foreground = disposition === 'foreground-tab';
      const existingTabId = dedupWithinWindow(state, targetUrl);
      if (existingTabId) {
        // Dedup: focus the existing tab if foreground was requested, or
        // just leave it where it is for background gestures. Either way
        // we do not spawn a duplicate.
        if (foreground) setActiveTab(state, existingTabId);
        return { action: 'deny' };
      }
      createTab(state, targetUrl, { foreground, afterTabId: tab.id });
      return { action: 'deny' };
    }
    // External URL → OS browser, never inside an app window.
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });

  wc.on('page-title-updated', (_event, title) => {
    tab.title = title;
    if (state.activeTabId === tab.id && !state.window.isDestroyed()) {
      state.window.setTitle(title || 'CV Books');
    }
    broadcastTabs(state);
  });

  // Same-document navigations (e.g. App Router push) and full nav both
  // update the dedup key so subsequent dedup checks reflect what each
  // tab is actually showing right now.
  const onNav = (_event: Electron.Event, navUrl: string) => {
    tab.url = navUrl;
    tab.pathname = dedupKey(navUrl);
    broadcastTabs(state);
  };
  wc.on('did-navigate', onNav);
  wc.on('did-navigate-in-page', onNav);

  wc.on('did-start-loading', () => {
    tab.loading = true;
    broadcastTabs(state);
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    broadcastTabs(state);
    // First-tab-loaded hook: this is when the user is actually staring
    // at app content for the first time. Triggers the on-open backup
    // and starts the 4h periodic timer. Flag-gated so it only runs once
    // per session no matter how many tabs/windows the user spawns.
    if (!firstTabBackupTriggered) {
      firstTabBackupTriggered = true;
      runAutoBackup('auto_on_open').catch((err) => {
        log(`[auto-backup] on-open promise rejected: ${err}`);
      });
      startPeriodicBackupTimer();
    }
  });

  // Right-click context menu for links — gives an explicit alternative
  // to the modifier-click gestures. Only shows when the cursor is on a
  // link to an internal URL; otherwise we let Chromium's default menu
  // (or nothing) run.
  wc.on('context-menu', (_event, params) => {
    if (!params.linkURL || !localServerOrigin) return;
    if (!params.linkURL.startsWith(localServerOrigin)) return;
    const linkUrl = params.linkURL;
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open in new tab',
        click: () => {
          const existingTabId = dedupWithinWindow(state, linkUrl);
          if (existingTabId) {
            setActiveTab(state, existingTabId);
          } else {
            createTab(state, linkUrl, { foreground: false, afterTabId: tab.id });
          }
        },
      },
      {
        label: 'Open in new window',
        click: () => spawnWindow(linkUrl),
      },
    ]);
    menu.popup({ window: state.window });
  });

  // Keyboard shortcuts hijacked at the tab's web contents level. We do
  // this here rather than via globalShortcut because globalShortcut
  // fires regardless of whether CV Books has focus — and because the
  // shortcuts need to act on whichever window/tab the event came from.
  wc.on('before-input-event', (event, input) => {
    if (handleShortcut(state, input)) {
      event.preventDefault();
    }
  });
}

function handleShortcut(state: WindowState, input: Electron.Input): boolean {
  if (input.type !== 'keyDown') return false;
  const ctrl = input.control || input.meta;
  if (!ctrl) return false;

  const key = input.key;

  // Ctrl+T → new foreground tab (browser dashboard)
  if ((key === 't' || key === 'T') && !input.shift && !input.alt) {
    createTab(state, localServerOrigin || '', {
      foreground: true,
      afterTabId: state.activeTabId ?? undefined,
    });
    return true;
  }

  // Ctrl+W → close active tab
  if ((key === 'w' || key === 'W') && !input.shift && !input.alt) {
    if (state.activeTabId) {
      closeTab(state, state.activeTabId);
    }
    return true;
  }

  // Ctrl+Tab / Ctrl+Shift+Tab → cycle tabs
  if (key === 'Tab') {
    cycleTab(state, input.shift ? -1 : 1);
    return true;
  }

  // Ctrl+1..Ctrl+9 → jump to tab N
  if (/^[1-9]$/.test(key) && !input.shift && !input.alt) {
    const n = parseInt(key, 10) - 1;
    if (n < state.tabs.length) {
      setActiveTab(state, state.tabs[n].id);
    }
    return true;
  }

  return false;
}

function cycleTab(state: WindowState, dir: 1 | -1): void {
  if (state.tabs.length === 0) return;
  const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
  if (idx < 0) return;
  const next = (idx + dir + state.tabs.length) % state.tabs.length;
  setActiveTab(state, state.tabs[next].id);
}

function closeTab(state: WindowState, tabId: string): void {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  const tab = state.tabs[idx];
  const wasActive = state.activeTabId === tabId;

  state.tabs.splice(idx, 1);
  try {
    state.window.contentView.removeChildView(tab.view);
  } catch (err) {
    log(`[tabs] removeChildView failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Tear down the underlying web contents so it stops loading and
  // releases its renderer process.
  try {
    tab.view.webContents.close();
  } catch (err) {
    log(`[tabs] webContents.close failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (state.tabs.length === 0) {
    // Last tab closed → close the window. The window's 'closed' handler
    // removes its entry from `windows`, and window-all-closed will quit
    // the app once every window is gone.
    if (!state.window.isDestroyed()) {
      state.window.close();
    }
    return;
  }

  if (wasActive) {
    // Focus the right neighbor if there is one, otherwise the left.
    const newIdx = idx >= state.tabs.length ? state.tabs.length - 1 : idx;
    setActiveTab(state, state.tabs[newIdx].id);
  } else {
    broadcastTabs(state);
  }
}

function spawnWindow(initialUrl: string): BrowserWindow {
  return createChromeWindow(initialUrl);
}

function createChromeWindow(initialUrl: string): BrowserWindow {
  if (!localServerOrigin) {
    throw new Error('localServerOrigin not set — cannot create window before server starts');
  }
  const preloadPath = path.join(__dirname, 'preload.js');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'CV Books - Bookkeeping & Payroll',
    icon: path.join(app.getAppPath(), 'electron', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      devTools: true,
    },
    show: false,
  });

  win.setMenuBarVisibility(false);

  // Register window state up-front so the chrome shell can call tabs.list()
  // immediately on mount and see itself (empty initially).
  const state: WindowState = { window: win, tabs: [], activeTabId: null };
  windows.set(win.id, state);

  // The chrome shell — tab strip + new-tab button. Lives at a private
  // route that AppLayout deliberately renders bare (no sidebar/TopBar).
  win.loadURL(`${localServerOrigin}/electron-chrome`);

  win.webContents.on('did-finish-load', () => {
    if (state.tabs.length === 0) {
      createTab(state, initialUrl, { foreground: true });
    }
    win.show();
  });

  // Keyboard shortcuts also need to fire when focus happens to be on the
  // chrome strip itself (the strip is small, so this is rare, but Ctrl+T
  // immediately after window open is a real case).
  win.webContents.on('before-input-event', (event, input) => {
    if (handleShortcut(state, input)) {
      event.preventDefault();
    }
  });

  win.on('resize', () => {
    repositionActiveView(state);
  });
  win.on('enter-full-screen', () => repositionActiveView(state));
  win.on('leave-full-screen', () => repositionActiveView(state));
  win.on('maximize', () => repositionActiveView(state));
  win.on('unmaximize', () => repositionActiveView(state));

  win.on('closed', () => {
    windows.delete(win.id);
  });

  return win;
}

// ============================================================================
// IPC handlers — the contract between the chrome shell and main process.
// Every handler resolves the calling window by event.sender so callers
// can't address tabs in other windows by accident.
// ============================================================================

ipcMain.handle('tabs:list', (event) => {
  const state = findWindowStateBySender(event.sender);
  if (!state) return null;
  return {
    tabs: state.tabs.map(tabSummary),
    activeTabId: state.activeTabId,
  };
});

ipcMain.handle('tabs:create', (event, args?: { url?: string; foreground?: boolean }) => {
  const state = findWindowStateBySender(event.sender);
  if (!state) return null;
  const targetUrl = args?.url || localServerOrigin || '';
  // Explicit user-initiated creation defaults to foreground (matches the
  // Ctrl+T browser behavior, distinct from link-spawned background tabs).
  const foreground = args?.foreground ?? true;
  // Dedup applies even to explicit create — if you Ctrl+T to the
  // dashboard but the dashboard is already open, focus it.
  const existingTabId = dedupWithinWindow(state, targetUrl);
  if (existingTabId) {
    if (foreground) setActiveTab(state, existingTabId);
    return existingTabId;
  }
  const tab = createTab(state, targetUrl, {
    foreground,
    afterTabId: state.activeTabId ?? undefined,
  });
  return tab.id;
});

ipcMain.handle('tabs:close', (event, args: { id: string }) => {
  const state = findWindowStateBySender(event.sender);
  if (!state) return;
  closeTab(state, args.id);
});

ipcMain.handle('tabs:focus', (event, args: { id: string }) => {
  const state = findWindowStateBySender(event.sender);
  if (!state) return;
  setActiveTab(state, args.id);
});

ipcMain.handle('tabs:back', (event) => {
  const state = findWindowStateBySender(event.sender);
  if (!state || !state.activeTabId) return;
  const tab = findTab(state, state.activeTabId);
  if (tab && tab.view.webContents.canGoBack()) {
    tab.view.webContents.goBack();
  }
});

ipcMain.handle('tabs:forward', (event) => {
  const state = findWindowStateBySender(event.sender);
  if (!state || !state.activeTabId) return;
  const tab = findTab(state, state.activeTabId);
  if (tab && tab.view.webContents.canGoForward()) {
    tab.view.webContents.goForward();
  }
});

ipcMain.handle('tabs:reload', (event) => {
  const state = findWindowStateBySender(event.sender);
  if (!state || !state.activeTabId) return;
  const tab = findTab(state, state.activeTabId);
  tab?.view.webContents.reload();
});

// IPC handler: open a native folder picker. Renderer calls
// `window.pennycare.pickFolder()` (defined in preload.ts), which invokes
// this. Returns the chosen folder path, or null if the user canceled.
ipcMain.handle('pennycare:pick-folder', async (event) => {
  // Anchor the dialog to whichever app window the request came from.
  // Falls back to the focused window if we can't resolve the sender
  // (e.g. dialog already open and event arrived from another path).
  let parent: BrowserWindow | null = null;
  const sender = event.sender;
  // The sender could be a chrome shell OR a tab's WebContentsView.
  // Search windows for a match either way.
  for (const state of windows.values()) {
    if (state.window.isDestroyed()) continue;
    if (state.window.webContents.id === sender.id) {
      parent = state.window;
      break;
    }
    if (state.tabs.some((t) => t.view.webContents.id === sender.id)) {
      parent = state.window;
      break;
    }
  }
  parent = parent ?? BrowserWindow.getFocusedWindow();
  if (!parent) return null;
  const result = await dialog.showOpenDialog(parent, {
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
    localServerOrigin = `http://127.0.0.1:${port}`;
    await startServer(port);

    createChromeWindow(localServerOrigin);

    Menu.setApplicationMenu(null);

    // Fallback global shortcuts for DevTools. The in-window keyboard
    // hijack in handleShortcut() covers tab management; these handle the
    // dev affordances that aren't tied to tab focus.
    globalShortcut.register('F12', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      const state = windows.get(win.id);
      if (state?.activeTabId) {
        const tab = findTab(state, state.activeTabId);
        tab?.view.webContents.toggleDevTools();
      } else {
        win.webContents.toggleDevTools();
      }
    });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      const state = windows.get(win.id);
      if (state?.activeTabId) {
        const tab = findTab(state, state.activeTabId);
        tab?.view.webContents.toggleDevTools();
      } else {
        win.webContents.toggleDevTools();
      }
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

  stopPeriodicBackupTimer();

  // Best-effort backup before tearing down. Bounded so a hung backup
  // (USB drive disconnected mid-write, slow network share) can't trap the
  // user in a window that won't close. 60s covers typical backups even on
  // slow USB 2.0; if it fires mid-copy the atomic-write pattern in
  // performBackup() ensures we never leave a corrupt .db on disk.
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
