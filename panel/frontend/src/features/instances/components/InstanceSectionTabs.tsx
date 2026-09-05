import React, { useEffect, useRef, useState } from 'react';

// InstanceSectionTabs — the overview ("More") page's desktop section rail.
//
// Deliberately NOT another pill: pills in this panel are floating,
// auto-hiding action clusters (top-right) or phone dropdowns (bottom).
// This rail is always visible, always one click, and self-explanatory:
// every tab carries an icon, a label, a one-line hint of what lives
// inside, and a live right-hand marker (status dot / LIVE pulse /
// count). The active tab owns a sliding gradient indicator + highlight
// wash, so the eye never has to guess where it is.

export interface SectionTabDef {
  id: string;
  label: string;
  /** One-line hint of the tab's contents. */
  hint: string;
  icon: React.ReactNode;
  /** Live marker painted at the tab's right edge. */
  marker?: 'status' | 'live' | 'count' | 'none';
  /** Dot colour class when marker === 'status'. */
  dotClass?: string;
  /** Count text when marker === 'count'. */
  count?: string | number | null;
  /** Extra title detail for the marker (tooltip). */
  markerTitle?: string;
}

interface InstanceSectionTabsProps {
  tabs: SectionTabDef[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

const InstanceSectionTabs: React.FC<InstanceSectionTabsProps> = ({
  tabs,
  active,
  onChange,
  ariaLabel = 'Instance sections',
}) => {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = useState({ left: 0, width: 0 });

  // Slide the indicator under the active tab. Re-measure on tab change
  // and viewport resize so it never drifts after zoom / sidebar toggle.
  useEffect(() => {
    const measure = () => {
      const el = btnRefs.current[active];
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, tabs.length]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="ks-card hidden lg:flex relative items-stretch gap-1 p-1.5 overflow-hidden"
    >
      {/* Sliding active indicator — same blue→violet language as the
          instance-tabs scrollbar, so it reads as "selected" instantly. */}
      <span
        aria-hidden="true"
        className="absolute top-0 h-[3px] rounded-b-full transition-all duration-200 ease-out pointer-events-none"
        style={{
          left: bar.left + 6,
          width: Math.max(0, bar.width - 12),
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          boxShadow: '0 0 12px rgba(99,102,241,0.55)',
          opacity: bar.width > 0 ? 1 : 0,
        }}
      />
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            title={`${t.label} — ${t.hint}`}
            className={`flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150 active:scale-[0.99] ${
              selected
                ? 'bg-white/10 text-white shadow-[0_2px_14px_rgba(0,0,0,0.35)]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span
              className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                selected ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-400'
              }`}
              aria-hidden="true"
            >
              {t.icon}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-semibold truncate">{t.label}</span>
              <span className="block text-[10px] text-gray-500 truncate">{t.hint}</span>
            </span>
            {t.marker === 'status' && (
              <span
                className={`shrink-0 w-2.5 h-2.5 rounded-full ${t.dotClass || 'bg-gray-500'}`}
                title={t.markerTitle || t.label}
                aria-hidden="true"
              />
            )}
            {t.marker === 'live' && (
              <span className="shrink-0 relative flex w-2.5 h-2.5" title={t.markerTitle || 'Live'} aria-hidden="true">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-400" />
              </span>
            )}
            {t.marker === 'count' && t.count !== null && t.count !== undefined && (
              <span
                className="shrink-0 min-w-[20px] text-center text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-white/10 text-gray-200"
                title={t.markerTitle || t.label}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default InstanceSectionTabs;
