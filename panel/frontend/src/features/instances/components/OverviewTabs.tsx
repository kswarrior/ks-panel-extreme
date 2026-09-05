import React, { useCallback, useRef } from 'react';

// OverviewTabs — the instance overview page's section switcher, in ONE
// card. A bespoke style for this page (not a pill, not the shared
// section rail): a 2×2 deck on phones, one row of four on desktop, so
// every section is always visible — no dropdown, no scrolling.
//
// Each tab owns a hue (Details sky, Monitoring emerald, Manage amber,
// Activity violet): the active tab washes in its hue, lights its icon
// tile and grows a glowing underline, so the selected section reads at
// a glance. A live marker rides top-right (status dot / LIVE pulse /
// count badge). Keyboard: arrows move + focus, Home/End jump (roving
// tabindex, same contract as the shared rail).

export type OverviewMarker =
  | { kind: 'dot'; className?: string; title?: string }
  | { kind: 'pulse'; title?: string }
  | { kind: 'badge'; text: string | number; title?: string };

export interface OverviewTabDef {
  id: string;
  label: string;
  /** One-line hint of the tab's contents. */
  hint: string;
  icon: React.ReactNode;
  /** #rrggbb hue driving the tab's active wash / glow / underline. */
  accent: string;
  marker?: OverviewMarker;
}

interface OverviewTabsProps {
  tabs: OverviewTabDef[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

const OverviewTabs: React.FC<OverviewTabsProps> = ({
  tabs,
  active,
  onChange,
  ariaLabel = 'Overview sections',
}) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = useCallback((id: string) => {
    refs.current[id]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = Math.max(0, tabs.findIndex((t) => t.id === active));
      let next: string | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(idx + 1) % tabs.length].id;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(idx + tabs.length - 1) % tabs.length].id;
      else if (e.key === 'Home') next = tabs[0].id;
      else if (e.key === 'End') next = tabs[tabs.length - 1].id;
      if (next) {
        e.preventDefault();
        onChange(next);
        focusTab(next);
      }
    },
    [tabs, active, onChange, focusTab],
  );

  return (
    <div className="ks-card p-2">
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 xl:grid-cols-4 gap-2"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          const a = t.accent;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`overview-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`overview-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              title={`${t.label} — ${t.hint}`}
              className="relative overflow-hidden rounded-xl border px-3 py-2.5 text-left outline-none transition-all duration-200 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={
                selected
                  ? {
                      background: `${a}1f`,
                      borderColor: `${a}66`,
                      boxShadow: `0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
                    }
                  : {
                      background: 'transparent',
                      borderColor: 'rgba(255,255,255,0.08)',
                    }
              }
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200"
                  style={
                    selected
                      ? {
                          background: `${a}2e`,
                          borderColor: `${a}88`,
                          color: a,
                          boxShadow: `0 0 14px ${a}55`,
                        }
                      : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)', color: '#9ca3af' }
                  }
                >
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={`block text-[13px] font-semibold truncate ${selected ? 'text-white' : 'text-gray-300'}`}>
                    {t.label}
                  </span>
                  <span className="block text-[10px] text-gray-500 truncate">{t.hint}</span>
                </span>
                {t.marker?.kind === 'dot' && (
                  <span
                    aria-hidden="true"
                    title={t.marker.title}
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${t.marker.className ?? 'bg-gray-500'}`}
                  />
                )}
                {t.marker?.kind === 'pulse' && (
                  <span aria-hidden="true" title={t.marker.title ?? 'Live'} className="shrink-0 relative flex w-2.5 h-2.5">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-400" />
                  </span>
                )}
                {t.marker?.kind === 'badge' && (
                  <span
                    title={t.marker.title}
                    className="shrink-0 min-w-[20px] text-center text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-black/20 text-gray-200"
                  >
                    {t.marker.text}
                  </span>
                )}
              </span>
              {/* Active underline — grows left → right in the tab hue. */}
              <span
                aria-hidden="true"
                className="absolute left-3 right-3 bottom-1.5 h-[3px] rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${a}, ${a}00)`,
                  boxShadow: selected ? `0 0 10px ${a}88` : undefined,
                  opacity: selected ? 0.95 : 0,
                  transform: selected ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left center',
                  transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default OverviewTabs;
