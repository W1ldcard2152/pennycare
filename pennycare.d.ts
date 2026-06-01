// Global type declarations for the renderer.
//
// The Electron preload (electron/preload.ts) exposes window.pennycare for
// native-only operations like the folder picker. This declaration lets TS
// resolve those calls in the Next.js renderer code without a runtime
// dependency on Electron — at runtime, `window.pennycare` is undefined
// when not running inside Electron and the UI falls back to a manual path
// input.

interface PennycareWindowApi {
  pickFolder: () => Promise<string | null>;
  isElectron: boolean;
}

declare global {
  interface Window {
    pennycare?: PennycareWindowApi;
  }
}

export {};
