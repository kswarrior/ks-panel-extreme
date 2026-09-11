import React from 'react';
import { useThemeStore } from '@/shared/stores/themeStore';

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
}

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
 */
export const ListCount: React.FC<ListCountProps> = ({
  shown,
  total,
  label,
  extra,
  icon = true,
  className = '',
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
  const showIcon = icon && themeShowIcon;

  return (
    <div
      className={`ks-count-badge ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={`${shown} of ${total}${noun ? ` ${noun}` : ''} shown${filtered ? ', filtered' : ''}`}
    >
      {showIcon && (
        <span className="ks-count-icon" aria-hidden="true">
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
};

export default ListCount;
