import React, { useCallback, useRef, useState } from 'react';

export type SystemTabId = 'host' | 'panel';

interface SystemTabsProps {
  tab: SystemTabId;
  onChange: (next: SystemTabId) => void;
  /** One-line live footnote under "Host" — e.g. hostname + CPU%. */
  hostMeta?: string;
  /** One-line live footnote under "Panel" — e.g. version + pid. */
  panelMeta?: string;
  /** When true the Panel card shows an "Update" badge. */
  hasUpdate?: boolean;
  /** Last snapshot time shown in the toolbar. */
  lastUpdated?: Date | null;
  /** Manual refresh action (toolbar button, nods to the Actions pill). */
  onRefresh?: () => void;
  refreshing?: boolean;
}

// SystemTabs — the System page's OWN tab style.
//
// Why it doesn't reuse the generic pills:
//   - PageTabsPill is a phone-only bottom dropdown (tap toggle → pick from an
//     upward list, 2 taps to switch) and the desktop row is two tiny
//     text-only `ks-tab` buttons with no hint what lives inside. Both are
//     built for 3-8 anonymous form sections (nodes / security / …).
//   - System has exactly TWO scopes with very different meanings — the
//     MACHINE (host hardware) vs the APP (panel binary + updates). That
//     deserves a scope-switcher, not a tab strip: two large cards with an
//     icon, a one-line explainer, and a live footnote, so the choice is
//     obvious at a glance on desktop AND on phones (one tap, no dropdown).
//
// Theming contract (same as the pills, so Theme Studio keeps working):
//   - Active / inactive text + background come from the Tabs tab via the
//     --ks-tab-* vars with stock fallbacks — never hardcoded white/black.
//   - Surface is the shared glass `.ks-card` so Card-tab tweaks cascade.
//   - Motion uses `.ks-system-tabs-anim` (see index.css) which beats the
//     theme's `transition: border-color !important` the same way
//     `.ks-pill-anim` does — otherwise the active glow would snap.
export const SystemTabs: React.FC<SystemTabsProps> = ({
  tab,
  onChange,
  hostMeta,
  panelMeta,
  hasUpdate = false,
  lastUpdated = null,
  onRefresh,
  refreshing = false,
}) => {
  const order: SystemTabId[] = ['host', 'panel'];
  const refs = useRef<Record<SystemTabId, HTMLButtonElement | null>>({ host: null, panel: null });
  // Bumped on every selection so the top line's sweep animation remounts and
  // replays left → right — even when re-clicking the already-active tab.
  const [sweep, setSweep] = useState(0);

  const select = useCallback(
    (id: SystemTabId) => {
      onChange(id);
      setSweep((s) => s + 1);
    },
    [onChange],
  );

  const focusTab = useCallback((id: SystemTabId) => {
    refs.current[id]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = order.indexOf(tab);
      let next: SystemTabId | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(idx + 1) % order.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[(idx + order.length - 1) % order.length];
      else if (e.key === 'Home') next = order[0];
      else if (e.key === 'End') next = order[order.length - 1];
      if (next) {
        e.preventDefault();
        select(next);
        focusTab(next);
      }
    },
    [tab, select, focusTab],
  );

  const cards: Array<{
    id: SystemTabId;
    title: string;
    explainer: string;
    meta: string;
    icon: React.ReactNode;
    dotClass: string;
  }> = [
    {
      id: 'host',
      title: 'Host',
      explainer: 'Machine · CPU · Memory · Disk · Load',
      meta: hostMeta || 'Hardware this panel runs on',
      dotClass: 'bg-emerald-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <rect x="2" y="3" width="20" height="7" rx="2" />
          <rect x="2" y="14" width="20" height="7" rx="2" />
          <line x1="6" y1="6.5" x2="6.01" y2="6.5" />
          <line x1="6" y1="17.5" x2="6.01" y2="17.5" />
        </svg>
      ),
    },
    {
      id: 'panel',
      title: 'Panel',
      explainer: 'App · Version · Updates · Schedules',
      meta: panelMeta || 'Binary + update channel',
      dotClass: 'bg-sky-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
  ];

  return (
    <section aria-label="System scope" className="ks-system-tabs ks-card rounded-xl p-2 sm:p-2.5">
      {/* Slim toolbar — scope label + live stamp + refresh action. Puts the
          one action this page needs inline (no floating pill covering charts). */}
      <div className="flex items-center gap-2 px-1.5 pb-2">
        <span className="relative flex w-2 h-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400 font-semibold">Scope</span>
        <span className="text-[11px] text-gray-600" aria-hidden="true">·</span>
        <span className="text-[11px] text-gray-500 truncate">
          {tab === 'host' ? 'Showing machine health' : 'Showing app + updates'}
        </span>
        <span className="flex-1" />
        {lastUpdated && (
          <span className="hidden sm:inline text-[11px] text-gray-500 font-mono" title={lastUpdated.toLocaleString()}>
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh snapshot now"
            aria-label="Refresh snapshot now"
            className="ks-icon-btn inline-flex items-center justify-center w-7 h-7 rounded-md border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
      </div>

      {/* Scope cards — one tap on every breakpoint (no bottom-pill dropdown). */}
      <div
        role="tablist"
        aria-label="System sections"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {cards.map((c) => {
          const active = tab === c.id;
          return (
            <button
              key={c.id}
              ref={(el) => {
                refs.current[c.id] = el;
              }}
              type="button"
              role="tab"
              id={`system-tab-${c.id}`}
              aria-selected={active}
              aria-controls={`system-panel-${c.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(c.id)}
              className={`ks-system-tab ks-system-tabs-anim group relative flex items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                active ? 'is-active' : ''
              }`}
              data-active={active}
            >
              {/* Top line — sweeps in from the left on every selection (the
                  key remounts the span so the CSS animation replays, even on
                  re-click — see ks-system-bar-sweep in index.css). */}
              <span
                key={active ? `${c.id}-on-${sweep}` : `${c.id}-off`}
                aria-hidden="true"
                className="ks-system-tab-bar"
                data-active={active}
              />

              {/* Icon tile — filled when active (theme active colors), glass when idle. */}
              <span aria-hidden="true" className={`ks-system-tab-icon shrink-0 ${active ? 'is-active' : ''}`}>
                {c.icon}
              </span>

              {/* Text stack — title + explainer + live footnote. */}
              <span className="flex flex-col min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold leading-tight">{c.title}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dotClass}`} aria-hidden="true" />
                  {c.id === 'panel' && hasUpdate && (
                    <span className="ks-system-update-badge">Update</span>
                  )}
                </span>
                <span className="ks-system-tab-explainer">{c.explainer}</span>
                <span className="ks-system-tab-meta truncate" title={c.meta}>
                  {c.meta}
                </span>
              </span>

              {/* Right state — unmistakable active check vs idle chevron. */}
              <span aria-hidden="true" className="shrink-0">
                {active ? (
                  <span className="ks-system-tab-check">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 opacity-40 group-hover:opacity-80 group-hover:translate-x-0.5 transition-all" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SystemTabs;
