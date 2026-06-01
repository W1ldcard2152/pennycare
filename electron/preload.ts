// Preload script — runs in an isolated context with access to a small set
// of Electron APIs. Exposes `window.pennycare` to the renderer for the
// handful of native-only operations the web layer can't do on its own.

import { contextBridge, ipcRenderer } from 'electron';

interface PennycareApi {
  // Open the native Windows folder picker and return the chosen path
  // (or null if the user canceled). Used by the Backup Targets UI.
  pickFolder: () => Promise<string | null>;
  // True when running inside Electron — lets the UI know whether to show
  // the native picker button vs. a manual path input fallback.
  isElectron: boolean;
}

const api: PennycareApi = {
  pickFolder: () => ipcRenderer.invoke('pennycare:pick-folder'),
  isElectron: true,
};

contextBridge.exposeInMainWorld('pennycare', api);

// Type declaration available to renderer-side TS via a triple-slash
// reference or a global .d.ts. We export the type so the renderer can
// import it for autocomplete.
export type { PennycareApi };
