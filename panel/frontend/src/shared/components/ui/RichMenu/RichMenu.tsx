import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RichMenuItem, RichMenuStyle } from './types';
import { Checkmark, ChevronRight, renderLabelHint } from './icons';

// ------------------------------------------------------------------
//  RichMenu
// ------------------------------------------------------------------
//  A general-purpose glassmorphic dropdown supporting FIVE item kinds
//  in a single invocation:
//
//    1. action    — plain clickable row, fires `onSelect(key)+close`
//    2. checkbox  — toggles a boolean, fires `onToggle(key,checked)`
//    3. toggle    — same contract as checkbox, renders a switch
//    4. submenu   — nested dropdown opens to the right (or left) of
//                   its parent row
//    5. separator — hairline divider
//
//  It's the engine behind three call sites in the app:
//    - the Header profile dropdown (logout / preferences / theme pick)
//    - the Themes "Apply to…" scope menu
//    - the card 3-dot overflow menus in Users / Roles / ApiKeys
//
//  Visual contract: `.glass-dropdown` frosted-glass coat (low alpha +
//  strong backdrop blur — see index.css for the rationale). The menu
//  renders through a React portal pinned to `document.body` with
//  `position:fixed`, so it escapes any `transform` / `overflow`
//  stacking context created by the card / header / sidebar it lives
//  in — the dropdown always reads above the page, no clipping.
//
//  Positioning contract:
//    - Anchored to the trigger button's box (getBoundingClientRect).
//    - Default opens BELOW + ALIGNED-RIGHT to the trigger, with smart
//      flips when there's not enough room (flip up, flip left, clamp
//      to viewport edges). Re-measured after mount once height is
//      known, so the flip-up branch has accurate numbers.
//    - `placement` prop lets callers force a side (used by the
//      Apply-to menu which floats UP from a small "Apply to…" pill).
//    - A full-screen invisible scrim captures outside clicks so the
//      click that closes the menu never hits the page underneath, and
//      Escape closes from anywhere on the document.
//
//  Back-compat: legacy items missing a `kind` field are treated as
//  'action', so existing CardMenu-style `{key,label,icon,tone}`
//  payloads work without edits.

export type RichMenuPlacement = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';

// The 'center' placement floats the menu directly over the trigger's box —
// the menu's centre lands on the trigger's centre. Used by the Themes page's
// "Apply to…" dropdown so the menu reads as a popover ON the theme card the
// admin clicked, rather than dropping below (and off the bottom of the
// viewport when the card is low on screen). After mount, the re-measure
// effect clamps the menu inside the viewport so a long list of areas/pages
// never disappears past the top or bottom edge.

export interface RichMenuProps extends RichMenuStyle {
  items: RichMenuItem[];
  // Pop the menu open from an external trigger button. When omitted,
  // a built-in "⋯" trigger button is rendered.
  trigger?: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  ariaLabel?: string;
  onSelect?: (key: string) => void;
  onToggle?: (key: string, checked: boolean) => void;
  placement?: RichMenuPlacement;
  offsetSkidding?: number;
  offsetDistance?: number;
  // Close the menu on any item activation (including toggles).
  // Default `false` — toggles stay open so the user can flip several
  // at once. Action items always close.
  closeOnToggle?: boolean;
  header?: React.ReactNode;
  // Cap the height of the item list body and let it scroll vertically,
  // pinning the optional `header` at the top. Handed off to the items
  // container only (the menu's outer box stays overflow-visible so
  // submenus still escape it). Pass like {360} or {'min(70vh,360px)'}.
  // When unset, the body grows to fit (the historical behaviour).
  maxHeight?: number | string;
}

type Pos = { left: number; top: number };

const RichMenu: React.FC<RichMenuProps> = ({
  items,
  trigger,
  ariaLabel = 'Open menu',
  onSelect,
  onToggle,
  placement = 'bottom-right',
  offsetSkidding = 0,
  offsetDistance = 6,
  closeOnToggle = false,
  header,
  maxHeight,
  width,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0 });
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<Pos>({ left: 0, top: 0 });
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const openSubmenuRef = useRef<string | null>(null);
  openSubmenuRef.current = openSubmenu;

  // Tracks the timestamp of the most recent mouseenter-driven submenu open.
  // On touch devices a tap synthesises mouseover→mouseenter before click,
  // so without this guard the SAME tap that opens via mouseenter would then
  // be treated by onClick as "toggle closed", forcing a second tap. We let a
  // click that lands within a short window after a mouseenter-supplied open
  // pass through unchanged — the open survives and the menu is usable in one
  // tap on phones. Desktop hover behaviour is unaffected (a real mouse click
  // arrives well after the mouseenter window).
  const lastHoverOpenAt = useRef<number>(0);

  // --- positioning -------------------------------------------------
  const place = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = typeof width === 'number' ? width : 192;
    const rightSide = placement.endsWith('right');
    const center = placement === 'center';
    let left: number;
    let top: number;
    if (center) {
      // Centre the menu over the trigger's box. We don't know the menu
      // height on the very first pre-paint place(), so fall back to a
      // rough estimate then; the re-measure useLayoutEffect below re-
      // aligns on the real height once it mounts. From then on place()
      // is only re-invoked on scroll/resize, and at that point
      // menuRef.current is live so we use its measured height directly
      // (keeps the menu from snapping back to the estimate after the
      // initial centring).
      const estMenuH = menuRef.current ? menuRef.current.offsetHeight : 320;
      left = r.left + r.width / 2 - w / 2;
      top = r.top + r.height / 2 - estMenuH / 2;
    } else if (placement === 'bottom-right' || placement === 'bottom-left') {
      left = rightSide ? r.right - w : r.left;
      top = r.bottom + offsetDistance;
    } else {
      // top-*-{right,left}
      left = rightSide ? r.right - w : r.left;
      top = r.top - offsetDistance;
    }
    left += offsetSkidding;
    if (left < 8) left = 8;
    if (left + w > vw - 8) {
      if (rightSide) left = Math.max(8, r.right - w);
      else if (center) left = vw - w - 8;
      else left = vw - w - 8;
    }
    // Heuristic vertical flip for "bottom" when too low; we refine
    // after mount once height is known.
    if (placement.startsWith('bottom') && top > vh - 60) {
      top = Math.max(8, r.top - offsetDistance - 180);
    }
    setPos({ left, top });
  }, [placement, offsetDistance, offsetSkidding, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    const onScroll = () => place();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open, place]);

  // Re-measure the menu after its first paint, applying a vertical
  // flip when it overflows the bottom of the viewport (the initial
  // place() had no height info). Compensates for top-side menus
  // that would clip past the top edge too.
  useLayoutEffect(() => {
    if (!open) return;
    const m = menuRef.current;
    const t = triggerRef.current;
    if (!m || !t) return;
    const mb = m.getBoundingClientRect();
    const tb = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const wantTop = placement.startsWith('top');
    let nextTop = pos.top;
    if (placement === 'center') {
      // Re-centre on the trigger's midline using the now-known menu height,
      // then clamp into the viewport so a long area/page list never
      // disappears past the top or bottom edge.
      const midY = tb.top + tb.height / 2;
      nextTop = midY - mb.height / 2;
      if (nextTop < 8) nextTop = 8;
      if (nextTop + mb.height > vh - 8) nextTop = Math.max(8, vh - 8 - mb.height);
      if (nextTop !== pos.top) {
        setPos((p) => ({ ...p, top: nextTop }));
      }
      return;
    }
    if (!wantTop && mb.bottom > vh - 8) {
      nextTop = Math.max(8, tb.top - offsetDistance - mb.height);
    } else if (wantTop && mb.top < 8) {
      nextTop = tb.bottom + offsetDistance;
    }
    if (nextTop !== pos.top) {
      setPos((p) => ({ ...p, top: nextTop }));
    }
  }, [open, pos.top, placement, offsetDistance]);

  // --- open/close + keyboard --------------------------------------
  useEffect(() => {
    if (!open) {
      setOpenSubmenu(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openSubmenuRef.current) setOpenSubmenu(null);
      else setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Re-position the submenu when one is open. We measure the live
  // row whose `data-rowkey` matches openSubmenu, plus the submenu's
  // own dimensions, then flip left/right based on remaining width
  // and clamp vertically to stay inside the viewport.
  useEffect(() => {
    if (!openSubmenu) return;
    const row = menuRef.current?.querySelector(
      `[data-rowkey="${cssEscape(openSubmenu)}"]`
    ) as HTMLElement | null;
    const sub = submenuRef.current;
    if (!row || !sub) return;
    const r = row.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sw = sub.offsetWidth || 192;
    const sh = sub.offsetHeight || 200;
    const side: 'right' | 'left' = r.right + sw + 8 > vw ? 'left' : 'right';
    const left = side === 'right' ? r.right : Math.max(8, r.left - sw);
    let top = r.top;
    if (top + sh > vh - 8) top = Math.max(8, vh - sh - 8);
    setSubmenuSide(side);
    setSubmenuPos({ left, top });
  }, [openSubmenu]);

  // --- handlers ----------------------------------------------------
  const handleAction = (it: any) => {
    setOpen(false);
    if (!it.disabled) onSelect?.(it.key);
  };
  const handleToggle = (it: any) => {
    if (it.disabled) return;
    onToggle?.(it.key, !it.checked);
    if (closeOnToggle) setOpen(false);
  };

  // --- render ------------------------------------------------------
  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos.left,
    top: pos.top,
    width: typeof width === 'number' ? `${width}px` : typeof width === 'string' ? width : 192,
    zIndex: 2147483640,
  };

  const submenuStyle: React.CSSProperties = {
    position: 'fixed',
    left: submenuPos.left,
    top: submenuPos.top,
    zIndex: 2147483645,
  };

  let triggerNode: React.ReactNode = null;
  if (!trigger) {
    triggerNode = (
      <button
        ref={triggerRef as any}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
         </svg>
      </button>
    );
  } else {
    const provided = trigger({ open, toggle: () => setOpen((v) => !v) });
    if (React.isValidElement(provided)) {
      triggerNode = React.cloneElement(provided as React.ReactElement<any>, {
        ref: (el: HTMLButtonElement | null) => {
          triggerRef.current = el;
          const callerRef = (provided as any).ref;
          if (typeof callerRef === 'function') callerRef(el);
          else if (callerRef && 'current' in callerRef)
            (callerRef as any).current = el;
        },
      });
    } else {
      triggerNode = provided;
    }
  }

  const handlers: Handlers = {
    handleAction,
    handleToggle,
    openSubmenu,
    setOpenSubmenu,
    markSubmenuHoverOpened: () => {
      lastHoverOpenAt.current = Date.now();
    },
    isSubmenuHoverOpenedRecently: () =>
      Date.now() - lastHoverOpenAt.current < 350,
  };

  return (
    <>
      {triggerNode}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Invisible full-screen scrim — closes on click. */}
            <div
              onClick={() => setOpen(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 2147483639 }}
              aria-hidden="true"
            />
            <div
              ref={menuRef}
              role="menu"
              style={style}
              className={`glass-dropdown rounded-lg overflow-visible text-sm ${className || ''}`}
            >
              {header && (
                <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
                  {header}
                </div>
              )}
              <div
                className={`py-1 ${maxHeight ? 'overflow-y-auto' : ''}`}
                style={
                  maxHeight
                    ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
                    : undefined
                }
              >
                {items.map((it) => renderItem(it, handlers, closeOnToggle))}
              </div>
            </div>

            {/* Submenu panel — rendered at body level so it can
             * escape the parent menu's overflow. */}
            {openSubmenu &&
              createPortal(
                <div
                  ref={submenuRef}
                  role="menu"
                  style={submenuStyle}
                  className="glass-dropdown rounded-lg overflow-visible text-sm rich-submenu"
                >
                  <div className="py-1">
                    {renderSubmenuChildren(openSubmenuKey(items, openSubmenu), handlers)}
                  </div>
                </div>,
                document.body
              )}
          </>,
          document.body
        )}
    </>
  );
};

export default RichMenu;

// ------------------------------------------------------------------
//  Row rendering helpers
// ------------------------------------------------------------------

interface Handlers {
  handleAction: (it: any) => void;
  handleToggle: (it: any) => void;
  openSubmenu: string | null;
  setOpenSubmenu: (key: string | null) => void;
  // Records that the submenu was opened by a hover/focus event (not a click)
  // and reports whether the most recent such open is still within the
  // guard window. Lets the same-tap click on touch devices avoid closing
  // what mouseenter just opened.
  markSubmenuHoverOpened: () => void;
  isSubmenuHoverOpenedRecently: () => boolean;
}

function renderItem(
  it: RichMenuItem,
  h: Handlers,
  closeOnToggle: boolean
): React.ReactNode {
  switch ((it as any).kind) {
    case 'separator':
      return <div key={it.key} className="rich-separator" />;

    case 'checkbox': {
      const c = it as Extract<RichMenuItem, { kind: 'checkbox' }>;
      return (
        <button
          key={it.key}
          type="button"
          role="menuitemcheckbox"
          aria-checked={c.checked}
          disabled={c.disabled}
          onClick={() => h.handleToggle(it)}
          data-rowkey={it.key}
          className="ks-dropdown-item rich-menu__item w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-50 transition-colors"
        >
          <span className={`rich-check ${c.checked ? 'is-on' : ''}`} aria-hidden="true">
            {c.checked && <Checkmark className="w-3 h-3" />}
          </span>
          {renderLabelHint(c.label, c.hint)}
        </button>
      );
    }

    case 'toggle': {
      const t = it as Extract<RichMenuItem, { kind: 'toggle' }>;
      return (
        <button
          key={it.key}
          type="button"
          role="menuitemcheckbox"
          aria-checked={t.checked}
          disabled={t.disabled}
          onClick={() => h.handleToggle(it)}
          data-rowkey={it.key}
          className="ks-dropdown-item rich-menu__item w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-50 transition-colors"
        >
          {renderLabelHint(t.label, t.hint)}
          <span className={`rich-toggle ${t.checked ? 'is-on' : ''}`} aria-hidden="true">
            <span className="rich-toggle__knob" />
          </span>
        </button>
      );
    }

    case 'submenu': {
      const sub = it as Extract<RichMenuItem, { kind: 'submenu' }>;
      const isOpen = h.openSubmenu === it.key;
      return (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          disabled={sub.disabled}
          data-rowkey={it.key}
          onMouseEnter={() => {
            if (!sub.disabled) {
              h.markSubmenuHoverOpened();
              h.setOpenSubmenu(it.key);
            }
          }}
          onFocus={() => {
            if (!sub.disabled) h.setOpenSubmenu(it.key);
          }}
          onClick={() => {
            if (sub.disabled) return;
            // If the menu was just opened by the mouseenter that precedes a
            // touch tap, ignore the tail of that tap so it stays open (one-tap
            // open on phones). Otherwise toggle as before for mouse users.
            if (isOpen && h.isSubmenuHoverOpenedRecently()) return;
            h.setOpenSubmenu(isOpen ? null : it.key);
          }}
          className={`ks-dropdown-item rich-menu__item ${isOpen ? 'is-open' : ''} w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 disabled:opacity-50 transition-colors`}
        >
          {sub.icon && (
            <span className="shrink-0 w-3.5 h-3.5 inline-flex items-center justify-center">
              {sub.icon}
            </span>
          )}
          <span className="flex-1 min-w-0 text-gray-100 truncate">{sub.label}</span>
          <ChevronRight />
        </button>
      );
    }

    case 'action':
    default: {
      // Legacy items without a `kind` come through here too.
      const a = it as Extract<RichMenuItem, { kind?: 'action' }>;
      const tone = (a as any).tone || 'default';
      const danger = tone === 'danger';
      return (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          disabled={(a as any).disabled}
          data-rowkey={it.key}
          onClick={() => h.handleAction(a)}
          className={`ks-dropdown-item rich-menu__item w-full text-left flex items-center gap-2.5 px-3 py-2 disabled:opacity-50 focus:outline-none transition-colors ${danger ? 'is-danger' : ''}`}
        >
          {a.icon && (
            <span className="shrink-0 w-3.5 h-3.5 inline-flex items-center justify-center">
              {a.icon}
            </span>
          )}
          <span className="flex-1 min-w-0 truncate">{a.label}</span>
        </button>
      );
    }
  }
}

// Submenu children render with a copy of handlers that always closes
// the submenu on action (so a sub-item click collapses the parent
// chain too).
function renderSubmenuChildren(
  children: RichMenuItem[] | null,
  h: Handlers
): React.ReactNode {
  if (!children) return null;
  const subHandlers: Handlers = {
    ...h,
    setOpenSubmenu: () => {
      h.setOpenSubmenu(null);
    },
    handleAction: (it) => {
      h.setOpenSubmenu(null);
      h.handleAction(it);
    },
    handleToggle: (it) => {
      h.handleToggle(it);
    },
  };
  void subHandlers;
  return children.map((it) => renderItem(it, subHandlers, false));
}

function openSubmenuKey(
  items: RichMenuItem[],
  key: string
): RichMenuItem[] | null {
  for (const it of items) {
    if ((it as any).kind === 'submenu' && it.key === key) {
      return (it as any).children as RichMenuItem[];
    }
  }
  return null;
}

// cssEscape: minimal ident escaper for the data-rowkey attribute
// (querySelector treats keys with dots etc. as IDs otherwise).
function cssEscape(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}

// Eslint-pleasing referenced-only-in-HMR imports etc.
 void renderSubmenuChildren;
