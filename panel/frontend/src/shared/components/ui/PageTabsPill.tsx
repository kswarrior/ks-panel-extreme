import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';
import { resolveHeaderCrumb } from '@/shared/components/layout/Header';
import { PILL_TAB_STYLE } from './PageActionsPill';

interface PageTabsPillProps {
  children: React.ReactNode;
  ariaLabel: string;
  // Label of the currently active tab (e.g. "Background"). Shown inside the
  // CLOSED pill next to the tabs glyph so the pill is self-describing —
  // the operator can see at a glance which section it holds. While OPEN the
  // toggle shows the page name from the header instead (so the selected tab
  // never appears twice).
  activeLabel?: string;
  // Explicit page name for the OPEN toggle. Defaults to the header crumb
  // for the current route (e.g. "Database", "Nodes / New Node").
  pageLabel?: string;
  className?: string;
  // Override the fixed outer container (positioning). Defaults reproduce
  // the historic node-style phone tab slot pinned to the viewport bottom.
  outerClassName?: string;
  outerStyle?: React.CSSProperties;
  // Reserves scroll room so the fixed bottom bar never covers trailing
  // content. Disable when the caller already renders its own spacer.
  spacer?: boolean;
}

// PageTabsPill renders the phone tab bar used by every panel form (nodes /
// templates / themes / roles / api-keys / instance-pages …) as a manual
// upward dropdown:
//   - closed: pill shows `[tabs glyph] ActiveLabel <` (self-describing)
//   - open: toggle shows `[tabs glyph] PageName ^` (the header's page name,
//     normal glass look — never the white selected look, so the selected tab
//     is never shown twice) + the tabs open UPWARD above the toggle, one tab
//     per line, with the selected row keeping its white active highlight
//   - width: shrink-to-content by default, or a fixed pixel width — both
//     from the Theme Studio's Pill tab (Menu width)
//   - manual-only: starts CLOSED on page open, scroll / outside-click /
//     Escape closes, and it NEVER auto-opens — only a toggle click opens.
//   - selecting a tab closes the menu again.
// Surface / sizing / motion all come from the Theme Studio's Pill tab
// (shared with the Actions Pill — paint via --ks-pill-* vars, collapse
// motion resolved for the current route). Desktop keeps the plain left
// rail; this pill is phones only (lg:hidden).
export const PageTabsPill: React.FC<PageTabsPillProps> = ({
  children,
  ariaLabel,
  activeLabel,
  pageLabel,
  className = '',
  outerClassName,
  outerStyle,
  spacer = true,
}) => {
  const location = useLocation();
  const resolveThemeForRoute = useThemeStore((s) => s.resolveThemeForRoute);
  // Collapse motion from the Pill tab (slide / fade / scale / none). Only
  // the motion is read here — auto_hide_enabled / auto_show_delay are
  // intentionally IGNORED: this pill is manual-only (starts closed, never
  // auto-opens, only the toggle opens).
  const pillTheme = useMemo(
    () => resolveThemeForRoute(location.pathname)?.pill as any,
    [resolveThemeForRoute, location.pathname],
  );
  const animation = pillTheme?.animation ?? 'slide';
  // Upward-menu width from the Pill tab: shrink-to-content (default) hugs
  // the longest tab label; fixed uses the themed pixel width (clamped to
  // the viewport so narrow phones never overflow).
  const menuWidthMode = pillTheme?.tabs_menu_width ?? 'shrink';
  const menuFixedWidth = Number(pillTheme?.tabs_menu_fixed_width) || 240;
  // Page name for the OPEN toggle — explicit prop wins, else the header
  // crumb for this route ("Database", "Nodes / New Node", …).
  const crumb = resolveHeaderCrumb(location.pathname);
  const resolvedPageLabel =
    pageLabel ?? (crumb ? (crumb.current ? `${crumb.parent} / ${crumb.current}` : crumb.parent) : 'Tabs');
  // Manual-only open state — starts CLOSED so opening a page never shows
  // the menu until the operator taps the toggle.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isOff = !open;
  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  // New page / new route → back to closed.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Scroll / outside-tap / Escape closes the menu. There is deliberately NO
  // timer that re-opens it — once off it stays off until the toggle is
  // clicked. Scroll is captured on document because Layout's <main> is the
  // scroller, not window. composedPath is used for the outside check
  // because some pages shadow the DOM `Node` name with a data-model type.
  useEffect(() => {
    const onScroll = () => setOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (ref.current && !path.includes(ref.current)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Upward menu motion honors the Pill tab's animation setting.
  const menuTransition = animation === 'none' ? 'none' : undefined;
  const isFixedWidth = menuWidthMode === 'fixed';
  // Shell width: closed always shrink-wraps; open shrink hugs the longest
  // tab row (viewport-clamped, NO minimum — a min-width is what stretched
  // the menu wider than the longest tab); open fixed spans the themed width.
  const shellStyle: React.CSSProperties = {
    ...(open && isFixedWidth
      ? { maxWidth: `${menuFixedWidth}px`, width: '100%' }
      : open
        ? { maxWidth: 'calc(100vw - 2rem)' }
        : {}),
  };
  (shellStyle as Record<string, unknown>)['--ks-card-padding'] = '6px';
  return (
    <>
      <nav
        aria-label={ariaLabel}
        className={`${outerClassName ?? 'lg:hidden fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30'} flex justify-start`}
        style={outerStyle}
      >
        <div
          ref={ref}
          // NOTE: closed always uses w-fit (NOT w-auto) — a block div with
          // w-auto fills the full row, which left the collapsed bar
          // stretched wide. w-fit shrink-wraps the shell to just the
          // toggle, and the flex nav with justify-start hugs it
          // bottom-left. Open shrink hugs the longest tab label; open
          // fixed spans the themed pixel width (clamped to viewport).
          className={`ks-card ks-pill-anim ks-tabs-pill rounded-md flex flex-col items-stretch shadow-lg shadow-black/40 opacity-100 ${isOff || !isFixedWidth ? 'w-fit' : 'w-full'} ${className}`}
          style={shellStyle}
        >
          {open && (
            <div
              role="tablist"
              aria-label={ariaLabel}
              onClick={(e) => {
                // Picking a tab collapses back to `ActiveLabel <`.
                if ((e.target as HTMLElement).closest('button')) close();
              }}
              // Plain rows: the callers' ks-tab-active (white) highlight stays
              // on the selected row; the toggle below is a plain ks-tab so
              // it never takes the white selected look.
              className="ks-pill-content flex flex-col gap-1 w-full min-w-0 max-h-[50vh] overflow-y-auto pb-1 mb-1 border-b border-white/10 transition-all duration-300 ease-in-out [&>button]:w-full [&>button]:flex-none [&>button]:justify-start [&>button]:text-left"
              style={{ transition: menuTransition }}
              data-open="true"
            >
              {children}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={isOff ? `Show tabs${activeLabel ? ` — ${activeLabel}` : ''}` : `Hide tabs — ${resolvedPageLabel}`}
            aria-expanded={open}
            title={isOff ? `Show tabs${activeLabel ? ` (currently: ${activeLabel})` : ''}` : `Hide tabs — ${resolvedPageLabel}`}
            style={PILL_TAB_STYLE}
            className="ks-tab ks-pill-toggle inline-flex items-center gap-1.5 shrink-0 w-full justify-between"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {/* Open state caps the page-name width (definite max-width, so
                  a long "Parent / Current" name truncates with ellipsis
                  instead of stretching the shrink-wrap shell wider than the
                  longest tab row). Closed shows the full active label. */}
              <span className={`whitespace-nowrap leading-none text-sm truncate ${isOff ? '' : 'max-w-48'}`}>{isOff ? (activeLabel ?? 'Tabs') : resolvedPageLabel}</span>
            </span>
            {isOff ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
            )}
          </button>
        </div>
      </nav>
      {/* Spacer — reserves scroll room so the fixed bottom pill never covers
          trailing content (node pattern). */}
      {spacer && <div aria-hidden="true" className="h-24 lg:hidden" />}
    </>
  );
};

export default PageTabsPill;
