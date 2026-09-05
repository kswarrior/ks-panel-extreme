import React, { useCallback, useEffect, useRef, useState } from 'react';

// Compact ks-tab sizing shared by every top-right pill. The theme paints
// .ks-tab padding with !important, so Tailwind px/py alone can never win;
// overriding the theme's own vars scoped to the pill does.
export const PILL_TAB_STYLE = {
  '--ks-tab-px': '10px',
  '--ks-tab-py': '5px',
  '--ks-tab-font': '13px',
} as React.CSSProperties;

// Idle delay before the pill slides back in after hiding.
export const PILL_SHOW_DELAY = 2500;

// useAutoHidePill hides a fixed action cluster while the page scrolls or
// is clicked elsewhere, then reveals it again after `delay` ms idle.
// Clicks inside the cluster (search/filter/popovers) keep it visible.
// Scroll is captured on document because Layout's <main> is the scroller,
// not window. composedPath is used for the outside check because some
// pages shadow the DOM `Node` name with a data-model type.
export function useAutoHidePill(delay: number = PILL_SHOW_DELAY) {
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
  }, [delay]);

  return { visible, ref, show };
}

interface PageActionsPillProps {
  children: React.ReactNode;
  className?: string;
}

// PageActionsPill renders the fixed top-right action cluster used by every
// panel page: a compact ks-card pill that is NEVER invisible. Auto-off
// (scroll / outside-click, 2.5s idle restore) and the manual toggle both
// just collapse the actions — off shows a `<` toggle, on shows the actions
// plus a `>` toggle. Hover restores an auto-off pill; a manually-collapsed
// pill needs a click. (ks-pill-anim beats the theme's
// `transition: border-color !important`, without which the motion would snap
// instead of animating).
export const PageActionsPill: React.FC<PageActionsPillProps> = ({ children, className = '' }) => {
  const { visible, ref, show } = useAutoHidePill();
  const [manualOff, setManualOff] = useState(false);
  // Off = manual collapse OR auto-hide. Never invisible — the `<` toggle
  // always stays showing so "off" is discoverable.
  const isOff = manualOff || !visible;
  const toggle = () => {
    show();
    setManualOff(isOff ? false : true);
  };
  return (
    <div
      className="fixed top-[max(4.5rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40"
      onMouseEnter={show}
    >
      <div
        ref={ref}
        className={`ks-card ks-pill-anim rounded-md flex items-center shadow-lg shadow-black/40 opacity-100 ${className}`}
        style={{ '--ks-card-padding': '6px' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out"
          style={
            isOff
              ? { maxWidth: 0, opacity: 0, transform: 'translateX(8px)', pointerEvents: 'none' as const, visibility: 'hidden' as const, padding: 0, margin: 0 }
              : { maxWidth: 800, opacity: 1, transform: 'translateX(0)', visibility: 'visible' as const, padding: 0, margin: 0 }
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
          className="ks-tab inline-flex items-center justify-center shrink-0"
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
