import React from 'react';
import RichMenu, { type RichMenuPlacement } from '../RichMenu';
import type {
  RichMenuItem,
  RichActionItem,
  RichCheckboxItem,
  RichToggleItem,
  RichSubmenuItem,
  RichSeparatorItem,
} from '../RichMenu';

// ------------------------------------------------------------------
//  CardMenu — the small "⋯" overflow menu that sits on a card's
//  footer row in Users / Roles / ApiKeys / Mods / Templates.
//
//  RichMenu already owns portal placement, scrim, submenu handling,
//  glass styling etc. CardMenu is now a thin wrapper that pins the
//  menu's placement to the card edge (`bottom-right`, the natural
//  overflow behaviour for a "⋯" pinned to a card corner) and exposes
//  the legacy `items`/`onSelect` API so existing call sites keep
//  working unchanged.
//
//  The item shape is the SAME RichMenuItem union — so a card can
//  mix plain actions, checkboxes, toggles, submenus and separators
//  without changing CardMenu itself. Action tuples that omit a
//  `kind` are treated as `'action'` (RichMenu guarantees), so the
//  handful of pages already passing `{ key, label, icon, tone }`
//  keep building without edits.
// ------------------------------------------------------------------

// Kept for source-compat — older pages may import this type directly
// when shaping their items array. New code should reach for
// `RichMenuItem`.
export type CardMenuTone = 'default' | 'danger';

export interface CardMenuItem {
  kind?: 'action';
  key: string;
  label: string;
  icon?: React.ReactNode;
  tone?: CardMenuTone;
  disabled?: boolean;
}

interface CardMenuProps {
  items: RichMenuItem[];
  onSelect?: (key: string) => void;
  // Fired for `checkbox` / `toggle` items when toggled. Optional
  // because most card menus are action-only; supply for richer cards.
  onToggle?: (key: string, checked: boolean) => void;
  closeOnToggle?: boolean;
  ariaLabel?: string;
  // Force a side. Default `bottom-right` (the natural Chrome for a
  // card-corner "⋯"). Pass `top-right` for cards pinned to the
  // bottom of a grid row.
  placement?: RichMenuPlacement;
  width?: number | string;
}

const CardMenu: React.FC<CardMenuProps> = ({
  items,
  onSelect,
  onToggle,
  closeOnToggle,
  ariaLabel = 'Open menu',
  placement = 'bottom-right',
  width,
}) => (
  <div className="relative shrink-0">
    <RichMenu
      items={items}
      onSelect={onSelect}
      onToggle={onToggle}
      closeOnToggle={closeOnToggle}
      ariaLabel={ariaLabel}
      placement={placement}
      width={width ?? 176}
    />
  </div>
);

export default CardMenu;

// Re-export the rich item type union so pages can build typed
// checkbox / toggle / submenu / separator items in one import.
export type {
  RichMenuItem,
  RichActionItem,
  RichCheckboxItem,
  RichToggleItem,
  RichSubmenuItem,
  RichSeparatorItem,
};
