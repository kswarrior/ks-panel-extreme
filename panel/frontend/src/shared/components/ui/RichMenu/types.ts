import React from 'react';

// ------------------------------------------------------------------
//  RichMenuItem — the discriminated union describing every kind of
//  row a RichMenu can render. `kind` is the discriminator; the
//  legacy CardMenuItem shape (no `kind`) is treated as 'action'
//  by RichMenu so existing callers keep working unchanged.
// ------------------------------------------------------------------

export type RichMenuItem =
  | RichActionItem
  | RichCheckboxItem
  | RichToggleItem
  | RichSubmenuItem
  | RichSeparatorItem;

export interface RichBaseItem {
  // Stable key used by React + the onSelect/onToggle callbacks.
  key: string;
}

/** A plain clickable action — fires `onSelect(key)` and closes. */
export interface RichActionItem extends RichBaseItem {
  kind?: 'action';
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/** A checkbox row — click toggles a boolean, calls `onToggle(key, next)`. */
export interface RichCheckboxItem extends RichBaseItem {
  kind: 'checkbox';
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
}

/** A toggle switch row — same callback contract as checkbox but
 *  renders a switch UI rather than a checkbox square. */
export interface RichToggleItem extends RichBaseItem {
  kind: 'toggle';
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
}

/** A parent row whose `children` open as a nested submenu. */
export interface RichSubmenuItem extends RichBaseItem {
  kind: 'submenu';
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  children: RichMenuItem[];
}

/** A non-interactive hairline divider. */
export interface RichSeparatorItem extends RichBaseItem {
  kind: 'separator';
}

// Common style props shared by every RichMenu placement.
export interface RichMenuStyle {
  width?: number | string;
  className?: string;
}

// Detect React-like elements so icons don't pass through the
// "looks like a label string" branch. Kept inline to avoid pulling
// react-is into the bundle.
function isReactNode(v: unknown): v is React.ReactNode {
  return v == null || typeof v === 'string' || typeof v === 'number' || React.isValidElement(v as any);
}
void isReactNode; // referenced defensively elsewhere

export const RichMenuItemKinds = ['action', 'checkbox', 'toggle', 'submenu', 'separator'] as const;
