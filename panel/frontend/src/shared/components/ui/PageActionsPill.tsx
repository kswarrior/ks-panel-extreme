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
// panel page: a compact ks-card pill with auto-hide right-to-left slide
// (ks-pill-anim beats the theme's `transition: border-color !important`,
// without which the motion would snap instead of animating).
export const PageActionsPill: React.FC<PageActionsPillProps> = ({ children, className = '' }) => {
  const { visible, ref } = useAutoHidePill();
  return (
    <div className="fixed top-[max(4.5rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40">
      <div
        ref={ref}
        className={`ks-card ks-pill-anim rounded-md flex items-center gap-1 shadow-lg shadow-black/40 ${visible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-8 opacity-0'} ${className}`}
        style={{ '--ks-card-padding': '6px' } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
};

export default PageActionsPill;
