// Preload script — runs in an isolated context with access to a small set
// of Electron APIs. Exposes `window.pennycare` to the renderer for the
// handful of native-only operations the web layer can't do on its own.
//
// The same preload is loaded into both the chrome shell window contents
// (the tab strip at /electron-chrome) and into each tab's WebContentsView
// (the actual app pages). Renderer code feature-detects what it needs.

import { contextBridge, ipcRenderer } from 'electron';

interface TabSummary {
  id: string;
  title: string;
  url: string;
  pathname: string;
  loading: boolean;
}

interface TabsState {
  tabs: TabSummary[];
  activeTabId: string | null;
}

interface TabsApi {
  list: () => Promise<TabsState | null>;
  create: (args?: { url?: string; foreground?: boolean }) => Promise<string | null>;
  close: (id: string) => Promise<void>;
  focus: (id: string) => Promise<void>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  reload: () => Promise<void>;
  // Subscribe to per-window tab state changes from the main process.
  // Returns an unsubscribe function. The same channel is used for all
  // updates (additions, removals, title/URL changes) — the renderer is
  // expected to replace its state from the full snapshot it receives.
  onStateChange: (callback: (state: TabsState) => void) => () => void;
}

interface PennycareApi {
  pickFolder: () => Promise<string | null>;
  isElectron: boolean;
  tabs: TabsApi;
}

const tabs: TabsApi = {
  list: () => ipcRenderer.invoke('tabs:list'),
  create: (args) => ipcRenderer.invoke('tabs:create', args),
  close: (id) => ipcRenderer.invoke('tabs:close', { id }),
  focus: (id) => ipcRenderer.invoke('tabs:focus', { id }),
  back: () => ipcRenderer.invoke('tabs:back'),
  forward: () => ipcRenderer.invoke('tabs:forward'),
  reload: () => ipcRenderer.invoke('tabs:reload'),
  onStateChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: TabsState) => {
      callback(state);
    };
    ipcRenderer.on('tabs:state', handler);
    return () => {
      ipcRenderer.removeListener('tabs:state', handler);
    };
  },
};

const api: PennycareApi = {
  pickFolder: () => ipcRenderer.invoke('pennycare:pick-folder'),
  isElectron: true,
  tabs,
};

contextBridge.exposeInMainWorld('pennycare', api);

export type { PennycareApi };
