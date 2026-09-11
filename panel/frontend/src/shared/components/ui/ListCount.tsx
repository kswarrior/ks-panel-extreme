import React, { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@/shared/stores/themeStore';
import LimitSelect from '@/shared/components/ui/LimitSelect';

interface ListCountProps {
  /** Number of items currently visible (after search/filter). */
  shown: number;
  /** Total items before filtering. */
  total: number;
  /** Item noun, e.g. "template". Pluralised automatically. Defaults to generic. */
  label?: string;
  /** Optional extra trailing stats, e.g. "3 active · 1 pending". */
  extra?: React.ReactNode;
  /** Show the leading layers icon. Defaults to true (theme can hide globally). */
  icon?: boolean;
  className?: string;
  /** Current page size. When paired with onPageSizeChange the leading icon
   * becomes a toggle opening the "cards per page" dropdown. */
  pageSize?: number;
  /** Page-size setter. Presence enables the icon toggle + dropdown. */
  onPageSizeChange?: (n: number) => void;
  /** Dropdown label. Defaults to "Cards per page". */
  settingsLabel?: string;
}

const ICON_SVG = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2 2 7l10 5 10-5-10-5z" />
    <path d="M2 12l10 5 10-5" />
    <path d="M2 17l10 5 10-5" />
  </svg>
);

/**
 * ListCount — modern glass pill replacing the old `1 of 1 shown` gray text
 * on list pages (Templates / Stacks / Tickets / Users / Roles …).
 *
 * Fully theme-driven via the Theme Studio → Count tab:
 *   --ks-count-bg / border / text / number / muted / accent / radius /
 *   padding / font / gap / blur / shadow / icon-size
 *
 * The numbers use tabular-nums so filtering doesn't jitter the width.
 * When `shown !== total` a "filtered" chip appears automatically.
 *
 * When `onPageSizeChange` is provided the leading icon doubles as a
 * settings toggle opening a "cards per page" dropdown (same LimitSelect
 * control the Roles/Users action-pill sliders-button used to own).
 */
export const ListCount: React.FC<ListCountProps> = ({
  shown,
  total,
  label,
  extra,
  icon = true,
  className = '',
  pageSize,
  onPageSizeChange,
  settingsLabel = 'Cards per page',
}) => {
  const filtered = shown !== total;
  const noun = label
    ? `${label}${total === 1 ? '' : 's'}`
    : '';
  // Theme Studio → Count tab can hide the icon globally. The per-page
  // `icon` prop is an additional opt-out (defaults to true).
  // Same theme hook pattern as the template/role lists so the Count tab
  // restyles the badge live.
  const themeShowIcon = useThemeStore((s) => {
    try {
      const v = (s.active() as any)?.count?.show_icon;
      return typeof v === 'boolean' ? v : true;
    } catch {
      return true;
    }
  });

  // Settings mode: the icon is the toggle, so it must stay visible even
  // when the theme hides the decorative icon — otherwise the control
  // would be unreachable.
  const settingsMode = typeof onPageSizeChange === 'function' && typeof pageSize === 'number';
  const showIcon = settingsMode || (icon && themeShowIcon);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function handleOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  // Without a page-size handler the badge is a pure status pill.
  if (!settingsMode) {
    return (
      <div
        className={`ks-count-badge ${className}`.trim()}
        role="status"
        aria-live="polite"
        aria-label={`${shown} of ${total}${noun ? ` ${noun}` : ''} shown${filtered ? ', filtered' : ''}`}
      >
        {showIcon && (
          <span className="ks-count-icon" aria-hidden="true">
            {ICON_SVG}
          </span>
        )}
        <span className="ks-count-numbers">
          <strong className="ks-count-strong tabular-nums">{shown}</strong>
          <span className="ks-count-of">of</span>
          <strong className="ks-count-strong tabular-nums">{total}</strong>
        </span>
        <span className="ks-count-dot" aria-hidden="true" />
        <span className="ks-count-label">
          {noun ? `${noun} ` : ''}shown
        </span>
        {filtered && (
          <span className="ks-count-filter">
            <span className="ks-count-filter-dot" aria-hidden="true" />
            filtered
          </span>
        )}
        {extra && (
          <>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-extra">{extra}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="ks-count-wrap">
      <div
        className={`ks-count-badge ${className}`.trim()}
        role="status"
        aria-live="polite"
        aria-label={`${shown} of ${total}${noun ? ` ${noun}` : ''} shown${filtered ? ', filtered' : ''}`}
      >
        {showIcon && (
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={`ks-count-icon-btn ${settingsOpen ? 'is-open' : ''}`}
            aria-label="Display settings"
            aria-expanded={settingsOpen}
            aria-haspopup="true"
            title="Cards per page"
          >
            <span className="ks-count-icon" aria-hidden="true">
              {ICON_SVG}
            </span>
          </button>
        )}
        <span className="ks-count-numbers">
          <strong className="ks-count-strong tabular-nums">{shown}</strong>
          <span className="ks-count-of">of</span>
          <strong className="ks-count-strong tabular-nums">{total}</strong>
        </span>
        <span className="ks-count-dot" aria-hidden="true" />
        <span className="ks-count-label">
          {noun ? `${noun} ` : ''}shown
        </span>
        {filtered && (
          <span className="ks-count-filter">
            <span className="ks-count-filter-dot" aria-hidden="true" />
            filtered
          </span>
        )}
        {extra && (
          <>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-extra">{extra}</span>
          </>
        )}
      </div>

      {settingsOpen && (
        <div className="ks-count-menu">
          <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">{settingsLabel}</label>
                <LimitSelect
                  value={pageSize as number}
                  onChange={(n) => {
                    (onPageSizeChange as (n: number) => void)(n);
                  }}
                  ariaLabel={`${settingsLabel} for ${noun || 'list'}`}
                />
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListCount;
