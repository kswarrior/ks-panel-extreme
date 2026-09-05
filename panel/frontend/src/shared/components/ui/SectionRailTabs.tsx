import React, { useCallback, useRef } from 'react';

export type RailMarker =
  | { kind: 'dot'; className?: string; title?: string }
  | { kind: 'pulse'; title?: string }
  | { kind: 'badge'; text: string | number; title?: string };

export interface RailTabDef {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  /** Optional live marker at the row's right edge: status dot (dynamic
      colour), LIVE pulse (semantic emerald), or count badge (neutral
      wash inheriting the tab text so it reads on any active fill). */
  marker?: RailMarker;
}

interface SectionRailTabsProps {
  tabs: RailTabDef[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

// SectionRailTabs — the ONE shared tab style for Security + Database.
//
// Why a second style next to the System scope cards:
//   - System switches between exactly 2 scopes (machine vs app) with live
//     footnotes — big cards fit. Security (5 sections) and Database
//     (4 sections) switch between same-kind sections with short hints —
//     a compact horizontal rail fits, on desktop AND phones (horizontally
//     scrollable, one tap — no bottom-pill dropdown, no separate desktop
//     row / vertical side rail per page).
//   - Active item keeps the themed solid pill fill plus a bottom indicator
//     line that grows left → right; inactive items stay transparent with a
//     hover wash. Item colors reuse the Tabs-tab vars (--ks-tab-*); the
//     indicator + icon size have their own rail_* knobs in the same tab.
//     An optional live marker (status dot / LIVE pulse / count badge)
//     rides at the row's right edge — used by the instance overview for
//     status, streaming state and audit count.
export const SectionRailTabs: React.FC<SectionRailTabsProps> = ({
  tabs,
  active,
  onChange,
  ariaLabel,
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
    <section aria-label={`${ariaLabel} navigation`} className="ks-card rounded-xl p-1.5 sm:p-2">
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="ks-hscroll flex items-stretch gap-1 overflow-x-auto pb-0.5"
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`rail-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`rail-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              data-active={isActive}
              className={`ks-rail-tab ks-rail-anim group flex items-center gap-2.5 px-3 py-2 text-left shrink-0 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                isActive ? 'is-active' : ''
              }`}
            >
              {t.icon && (
                <span aria-hidden="true" className="ks-rail-ico">
                  {t.icon}
                </span>
              )}
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium leading-tight whitespace-nowrap">{t.label}</span>
                {t.hint && (
                  <span className="ks-rail-hint hidden sm:block" title={t.hint}>
                    {t.hint}
                  </span>
                )}
              </span>
              {t.marker?.kind === 'dot' && (
                <span
                  aria-hidden="true"
                  title={t.marker.title}
                  className={`ml-0.5 shrink-0 w-2 h-2 rounded-full ${t.marker.className ?? 'bg-gray-500'}`}
                />
              )}
              {t.marker?.kind === 'pulse' && (
                <span
                  aria-hidden="true"
                  title={t.marker.title ?? 'Live'}
                  className="ml-0.5 shrink-0 relative flex w-2 h-2"
                >
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                </span>
              )}
              {t.marker?.kind === 'badge' && (
                <span
                  title={t.marker.title}
                  className="ml-0.5 shrink-0 min-w-[20px] text-center text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-black/10"
                >
                  {t.marker.text}
                </span>
              )}
              {/* Bottom indicator — grows left → right on select. */}
              <span aria-hidden="true" className="ks-rail-bar" data-active={isActive} />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SectionRailTabs;
