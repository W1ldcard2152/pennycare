'use client';

// The Electron tab strip — loaded as the root contents of every CV Books
// BrowserWindow. The actual app content runs in WebContentsView children
// positioned beneath this strip. We talk to the main process exclusively
// via the `window.pennycare.tabs` bridge defined in electron/preload.ts.
//
// Styling intent: look like a native part of the app. The active tab
// uses the sidebar navy (#304059) so the chrome and the sidebar read as
// one continuous brand surface. The strip band is a cool slate that's
// darker than the content area (bg-gray-50) — clearly chrome, never
// confused with content.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getIconForPath } from '@/lib/route-icons';

const SIDEBAR_NAVY = '#304059';
const SIDEBAR_NAVY_DARK = '#1e2838';

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

export default function ElectronChromePage() {
  const [state, setState] = useState<TabsState>({ tabs: [], activeTabId: null });
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  // Initial fetch + subscribe to state changes from the main process.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.pennycare?.tabs : undefined;
    if (!api) return;

    let cancelled = false;
    api.list().then((initial) => {
      if (cancelled || !initial) return;
      setState(initial);
    });

    const unsubscribe = api.onStateChange((next) => {
      setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleNewTab = () => {
    window.pennycare?.tabs?.create({ foreground: true });
  };

  const handleClose = (id: string) => {
    window.pennycare?.tabs?.close(id);
  };

  const handleFocus = (id: string) => {
    window.pennycare?.tabs?.focus(id);
  };

  // Middle-click on a tab closes it (browser convention).
  const handleAuxClick = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      handleClose(id);
    }
  };

  // Sized so the visible label slot stays readable even with many tabs.
  // Below the min we activate horizontal scroll on the strip.
  const MIN_TAB_WIDTH = 120;
  const MAX_TAB_WIDTH = 220;
  const tabFlexBasis = useMemo(() => {
    const n = Math.max(1, state.tabs.length);
    return Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, Math.floor(1100 / n)));
  }, [state.tabs.length]);

  return (
    <div
      className="flex h-9 w-full select-none items-end overflow-hidden"
      style={{ backgroundColor: '#cbd5e1' }}
    >
      {/* Scrollable tab strip. Horizontal scroll kicks in when tabs
          exceed min-width × count. Never wraps. */}
      <div className="flex h-full flex-1 items-end overflow-x-auto overflow-y-hidden">
        {state.tabs.map((tab) => {
          const isActive = tab.id === state.activeTabId;
          const Icon = getIconForPath(tab.pathname);
          const showClose = isActive || hoveredTabId === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => !isActive && handleFocus(tab.id)}
              onAuxClick={(e) => handleAuxClick(e, tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId((cur) => (cur === tab.id ? null : cur))}
              title={tab.title || 'Loading…'}
              className={`
                group relative flex h-8 flex-shrink-0 cursor-default items-center gap-2 rounded-t-md px-3 text-xs font-medium
                ${isActive ? 'text-white' : 'text-slate-700 hover:bg-slate-100'}
              `}
              style={{
                flexBasis: tabFlexBasis,
                minWidth: MIN_TAB_WIDTH,
                maxWidth: MAX_TAB_WIDTH,
                backgroundColor: isActive ? SIDEBAR_NAVY : '#e2e8f0',
                borderTop: isActive ? `1px solid ${SIDEBAR_NAVY_DARK}` : '1px solid transparent',
                borderLeft: isActive ? `1px solid ${SIDEBAR_NAVY_DARK}` : '1px solid transparent',
                borderRight: isActive ? `1px solid ${SIDEBAR_NAVY_DARK}` : '1px solid transparent',
                // Active tab visually fuses to the content area below by
                // not drawing a bottom border or shadow under it.
                marginBottom: isActive ? -1 : 0,
                paddingBottom: isActive ? 1 : 0,
              }}
            >
              <Icon
                className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}
              />
              <span className="flex-1 truncate">
                {tab.title || 'Loading…'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(tab.id);
                }}
                aria-label="Close tab"
                className={`
                  flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm transition-opacity
                  ${showClose ? 'opacity-70 hover:opacity-100' : 'opacity-0'}
                  ${isActive ? 'hover:bg-white/20' : 'hover:bg-slate-300'}
                `}
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* New tab button — sits immediately to the right of the rightmost tab. */}
        <button
          type="button"
          onClick={handleNewTab}
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          className="ml-1 mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 hover:text-slate-900"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
