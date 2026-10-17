import { useEffect, useRef } from 'react';

// useVisibleInterval runs `callback` on an interval that PAUSES while the
// browser tab is hidden and resumes (with one immediate tick, so data is
// fresh after returning) when the tab becomes visible again. Every
// long-lived poller in the panel should use this instead of a raw
// setInterval so a backgrounded tab stops burning CPU / network / battery.
//
//   useVisibleInterval(() => { void reload(true); }, 5000);
//   useVisibleInterval(cb, active ? 2500 : null); // null suspends the poll
//
// The latest callback is always used (stored in a ref), so callers do NOT
// need useCallback and never see a stale closure. The timer restarts only
// when `delay` changes.
export function useVisibleInterval(callback: () => void, delay: number | null): void {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    if (delay === null || typeof document === 'undefined') return;
    let id: number | null = null;
    const tick = () => cbRef.current();
    const start = () => {
      if (id === null) id = window.setInterval(tick, delay);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        stop();
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [delay]);
}
