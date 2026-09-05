import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import InstanceMenu from './InstanceMenu';

// InstanceMenuFab — the main thing of an instance as a floating square
// toggle (border-radius 15px) with the wheel-hub glyph. Drag it anywhere
// over the instance details page; a click (no drag) opens the menu with
// power controls, template actions and the status row.
//
// Drag state: pointer capture on the button, 6px move threshold separates a
// click from a drag, position clamps to the viewport and persists to
// localStorage. The menu flips above the button when there is no room
// below and clamps horizontally on narrow screens.

const FAB_SIZE = 46;
const FAB_RADIUS = 15;
const MENU_WIDTH = 320;
const EDGE = 8;
const CLICK_SLOP = 6;
const LS_KEY = 'ks-instance-menu-pos';

function clampPos(x: number, y: number): { x: number; y: number } {
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight;
  return {
    x: Math.min(Math.max(EDGE, x), Math.max(EDGE, vw - FAB_SIZE - EDGE)),
    y: Math.min(Math.max(EDGE, y), Math.max(EDGE, vh - FAB_SIZE - EDGE)),
  };
}

function defaultPos(): { x: number; y: number } {
  return clampPos(
    (typeof window === 'undefined' ? 1024 : window.innerWidth) - FAB_SIZE - 20,
    (typeof window === 'undefined' ? 768 : window.innerHeight) - FAB_SIZE - 20,
  );
}

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return clampPos(p.x, p.y);
  } catch {
    return null;
  }
}

const InstanceMenuFab: React.FC = () => {
  const location = useLocation();
  const [pos, setPos] = useState<{ x: number; y: number }>(() =>
    typeof window === 'undefined' ? { x: 0, y: 0 } : (loadPos() ?? defaultPos()),
  );
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  // Dismiss when the route changes underneath the open menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Dismiss on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  // Keep the button on-screen when the viewport resizes.
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: posRef.current.x, origY: posRef.current.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) setPos(clampPos(d.origX + dx, d.origY + dy));
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d?.moved) {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(posRef.current));
      } catch {}
    } else {
      setOpen((v) => !v);
    }
  };

  if (typeof document === 'undefined') return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuH = Math.min(560, vh * 0.7);
  const menuLeft = Math.min(Math.max(EDGE, pos.x + FAB_SIZE - MENU_WIDTH), Math.max(EDGE, vw - MENU_WIDTH - EDGE));
  const opensUp = pos.y + FAB_SIZE + EDGE + menuH > vh;
  const menuTop = opensUp ? Math.max(EDGE, pos.y - EDGE - menuH) : pos.y + FAB_SIZE + EDGE;

  return createPortal(
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Instance menu"
        title="Instance menu — drag to move, click to open"
        className="ks-card flex items-center justify-center text-gray-200 hover:text-white transition-colors select-none"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_RADIUS,
          zIndex: 2147483641,
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
          padding: 0,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6 pointer-events-none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 4v5.5" />
          <path d="M12 14.5V20" />
          <path d="M4 12h5.5" />
          <path d="M14.5 12H20" />
        </svg>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 2147483639 }}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Instance menu"
            className="glass-dropdown text-sm flex flex-col overflow-hidden"
            style={{
              position: 'fixed',
              left: menuLeft,
              top: menuTop,
              zIndex: 2147483640,
              width: MENU_WIDTH,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: '70vh',
              borderRadius: FAB_RADIUS,
            }}
          >
            <InstanceMenu />
          </div>
        </>
      )}
    </>,
    document.body,
  );
};

export default InstanceMenuFab;
