import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';

// Compact ks-tab sizing shared by every top-right pill. Values resolve
// against the Pill tab's theme vars (var refs with fallbacks reproduce the
// historic 10/5/13 geometry when no theme is applied yet).
export const PILL_TAB_STYLE = {
  '--ks-tab-px': 'var(--ks-pill-tab-px, 10px)',
  '--ks-tab-py': 'var(--ks-pill-tab-py, 5px)',
  '--ks-tab-font': 'var(--ks-pill-tab-font, 13px)',
} as React.CSSProperties;

// Idle delay before the pill slides back in after hiding. The Pill tab's
// auto_show_delay overrides this per theme (see PageActionsPill below).
export const PILL_SHOW_DELAY = 2500;

// useAutoHidePill hides a fixed action cluster while the page scrolls or
// is clicked elsewhere, then reveals it again after `delay` ms idle.
// Clicks inside the cluster (search/filter/popovers) keep it visible.
// Scroll is captured on document because Layout's <main> is the scroller,
// not window. composedPath is used for the outside check because some
// pages shadow the DOM `Node` name with a data-model type.
// `enabled` = false disables auto-hide entirely (manual toggle still
// works) — driven by the Pill tab's auto_hide_enabled.
export function useAutoHidePill(delay: number = PILL_SHOW_DELAY, enabled: boolean = true) {
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  // show restores full visibility immediately (used for hover-restore on
  // dim-instead-of-hide bars that stay interactive while "off").
  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timer.current) window.clearTimeout(timer.current);
      setVisible(true);
      return;
    }
    const scheduleShow = (d: number) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(true), d);
    };
    const onScroll = () => {
      setVisible(false);
      scheduleShow(delay);
    };
    const onPointerDown = (e: PointerEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (ref.current && !path.includes(ref.current)) {
        setVisible(false);
        scheduleShow(delay);
      }
    };
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [delay, enabled]);

  return { visible, ref, show };
}

interface PageActionsPillProps {
  children: React.ReactNode;
  className?: string;
}

// PageActionsPill renders the fixed top-right action cluster used by every
// panel page: a compact pill that is NEVER invisible. Auto-off
// (scroll / outside-click, idle restore) and the manual toggle both just
// collapse the actions — off shows a `<` toggle, on shows the actions plus
// a `>` toggle. Hover restores an auto-off pill; a manually-collapsed pill
// needs a click. Surface / sizing / motion / timing all come from the Theme
// Studio's Pill tab (paint via --ks-pill-* vars, behavior resolved for the
// current route like Header's loading bar). (ks-pill-anim beats the theme's
// `transition: border-color !important`, without which the motion would snap
// instead of animating).
export const PageActionsPill: React.FC<PageActionsPillProps> = ({ children, className = '' }) => {
  const location = useLocation();
  const resolveThemeForRoute = useThemeStore((s) => s.resolveThemeForRoute);
  // Pill behavior for the CURRENT route (auto-off switch + auto-on delay +
  // collapse motion). Falls back to the historic look when an older theme
  // has no pill section (backfilled by the store anyway).
  const pillTheme = useMemo(
    () => resolveThemeForRoute(location.pathname)?.pill as any,
    [resolveThemeForRoute, location.pathname],
  );
  const autoEnabled = pillTheme?.auto_hide_enabled ?? true;
  const autoDelay = pillTheme?.auto_show_delay ?? PILL_SHOW_DELAY;
  const animation = pillTheme?.animation ?? 'slide';
  const { visible, ref, show } = useAutoHidePill(autoDelay, autoEnabled);
  const [manualOff, setManualOff] = useState(false);
  // Off = manual collapse OR auto-hide. Never invisible — the `<` toggle
  // always stays showing so "off" is discoverable.
  const isOff = manualOff || (autoEnabled && !visible);
  const toggle = () => {
    show();
    setManualOff(isOff ? false : true);
  };
  // Collapse motion from the Pill tab: slide (translate + fade), fade only,
  // scale + fade, or instant.
  const hiddenTransform =
    animation === 'fade' ? 'none'
    : animation === 'scale' ? 'scale(0.92)'
    : animation === 'none' ? 'none'
    : 'translateX(8px)';
  return (
    <div
      className="fixed top-[max(4.5rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40"
      onMouseEnter={show}
    >
      <div
        ref={ref}
        className={`ks-card ks-pill-anim ks-actions-pill rounded-md flex items-center shadow-lg shadow-black/40 opacity-100 ${className}`}
        style={{ '--ks-card-padding': '6px' } as React.CSSProperties}
      >
        <div
          className="ks-pill-content flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out"
          style={
            isOff
              ? {
                  maxWidth: 0,
                  opacity: 0,
                  transform: hiddenTransform,
                  transformOrigin: animation === 'scale' ? 'right center' : undefined,
                  transition: animation === 'none' ? 'none' : undefined,
                  pointerEvents: 'none' as const,
                  visibility: 'hidden' as const,
                  padding: 0,
                  margin: 0,
                }
              : { maxWidth: 800, opacity: 1, transform: 'none', padding: 0, margin: 0 }
          }
          aria-hidden={isOff}
        >
          {children}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={isOff ? 'Show actions' : 'Hide actions'}
          aria-expanded={!isOff}
          title={isOff ? 'Show actions' : 'Hide actions'}
          style={PILL_TAB_STYLE}
          className="ks-tab ks-pill-toggle inline-flex items-center justify-center shrink-0"
        >
          {isOff ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default PageActionsPill;
