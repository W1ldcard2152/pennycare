// Global type augmentation for the `window.pennycare` bridge exposed by
// electron/preload.ts. Mirrors the API surface the preload exports so
// renderer code gets autocomplete and type-checking when accessing it.

interface PennycareTabSummary {
  id: string;
  title: string;
  url: string;
  pathname: string;
  loading: boolean;
}

interface PennycareTabsState {
  tabs: PennycareTabSummary[];
  activeTabId: string | null;
}

interface PennycareTabsApi {
  list: () => Promise<PennycareTabsState | null>;
  create: (args?: { url?: string; foreground?: boolean }) => Promise<string | null>;
  close: (id: string) => Promise<void>;
  focus: (id: string) => Promise<void>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  reload: () => Promise<void>;
  onStateChange: (callback: (state: PennycareTabsState) => void) => () => void;
}

interface PennycareApi {
  pickFolder: () => Promise<string | null>;
  isElectron: boolean;
  tabs?: PennycareTabsApi;
}

declare global {
  interface Window {
    pennycare?: PennycareApi;
  }
}

export {};
