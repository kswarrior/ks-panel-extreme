import React from 'react';
import type { RichMenuItem } from './types';

// Small inline icon set used by RichMenu rows — kept local so the
// component has zero external icon deps, and duplicated sparingly
// from CardMenu's inline SVGs so the look stays in sync.

export const Checkmark: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'w-3 h-3'}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
   </svg>
);

export const ChevronRight: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className || 'rich-chevron'}
    aria-hidden="true"
  >
    <polyline points="9 6 15 12 9 18" />
   </svg>
);

// Render an individual item's row content (label + optional hint)
// shared by checkbox / toggle rows.
export function renderLabelHint(label: string, hint?: string): React.ReactNode {
  return (
    <span className="flex-1 min-w-0">
      <span className="block text-gray-100 truncate">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 truncate">{hint}</span>}
    </span>
  );
}

// isActionItem is true for the legacy untyped shape (no `kind`) and
// for `kind:'action'`. Used to keep CardMenu-style callers working
// without touching them.
export function isActionItem(it: RichMenuItem): boolean {
  const k = (it as any).kind;
  return !k || k === 'action';
}
