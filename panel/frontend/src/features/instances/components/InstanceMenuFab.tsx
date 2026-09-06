import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import InstanceMenu from './InstanceMenu';

// InstanceMenuFab — the main thing of an instance as a floating square
// toggle (border-radius 15px) with the wheel-hub glyph. Drag it anywhere
// over the instance details page; a click (no drag) opens the menu with
// the status row first, then power controls, then template actions.
//
// The square carries four small SVG chevron nudge buttons (left / right /
// up / down) pinned to its four sides — `< SVG >`-style stepping without
// ever rendering a "<" / ">" text symbol. Click (or Shift+click for a big
// step) nudges the whole cluster; the centre square itself stays draggable.
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
// Nudge-arrow geometry: small square tabs pinned to each side of the FAB.
const ARROW_SIZE = 18;
const ARROW_GAP = 2;
const EXTENT = ARROW_SIZE + ARROW_GAP;
const NUDGE = 12;
const NUDGE_BIG = 60;

function clampPos(x: number, y: number): { x: number; y: number } {
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight;
  // Reserve EXTENT around the square so the four SVG nudge arrows pinned to
  // its sides never clip off-screen.
  const minX = EDGE + EXTENT;
  const minY = EDGE + EXTENT;
  const maxX = Math.max(minX, vw - FAB_SIZE - EDGE - EXTENT);
  const maxY = Math.max(minY, vh - FAB_SIZE - EDGE - EXTENT);
  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  };
}

function defaultPos(): { x: number; y: number } {
  return clampPos(
    (typeof window === 'undefined' ? 1024 : window.innerWidth) - FAB_SIZE - 20,
    (typeof window === 'undefined' ? 768 : window.innerHeight) - FAB_SIZE - 20,
  );
}

// themedMenuWidth reads the Menu tab's popover width (px) so the panel's
// right-edge alignment math tracks the theme instead of the 320 default.
function themedMenuWidth(): number {
  try {
    const v = parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue('--ks-menu-popover-width'),
    );
    if (Number.isFinite(v) && v >= 200 && v <= 560) return v;
  } catch {}
  return MENU_WIDTH;
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

type ChevronDir = 'left' | 'right' | 'up' | 'down';

const CHEVRON_PATH: Record<ChevronDir, string> = {
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
};

// ChevronIcon — pure SVG chevron, never a "<" / ">" / "^" text symbol.
const ChevronIcon: React.FC<{ dir: ChevronDir }> = ({ dir }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={12}
    height={12}
    aria-hidden="true"
    className="pointer-events-none"
  >
    <path d={CHEVRON_PATH[dir]} />
  </svg>
);

const InstanceMenuFab: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const overviewId = Number(routeId);
  const [pos, setPos] = useState<{ x: number; y: number }>(() =>
    typeof window === 'undefined' ? { x: 0, y: 0 } : (loadPos() ?? defaultPos()),
  );
  const [open, setOpen] = useState(false);
  // `shown` keeps the popover mounted through its exit animation; `leaving`
  // picks the exit keyframes. `open` is the intent, `shown` is what's painted.
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setShown(true);
      setLeaving(false);
    } else if (shown) {
      setLeaving(true);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => {
        setShown(false);
        setLeaving(false);
        closeTimer.current = null;
      }, 160);
    }
  }, [open, shown]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // Move focus into the popover when it finishes entering.
  useEffect(() => {
    if (shown && !leaving) {
      const t = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 240);
      return () => window.clearTimeout(t);
    }
  }, [shown, leaving]);

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
    // Primary button only: right/middle clicks must never start a drag (and
    //, via the null-press guard below, must never toggle the menu either).
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
    // No press started (pointer-cancel without pointerdown, or a
    // non-primary button) → do nothing. A cancel must never toggle.
    if (!d) return;
    if (d.moved) {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(posRef.current));
      } catch {}
    } else {
      setOpen((v) => !v);
    }
  };

  // Nudge the whole cluster by (dx, dy) — used by the four SVG chevrons and
  // by the arrow keys on the centre square. Shift = big step.
  const nudge = (dx: number, dy: number) => {
    setPos((p) => {
      const next = clampPos(p.x + dx, p.y + dy);
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const onNudgeClick = (dir: ChevronDir) => (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const shift = (e as React.MouseEvent).shiftKey;
    const step = shift ? NUDGE_BIG : NUDGE;
    if (dir === 'left') nudge(-step, 0);
    else if (dir === 'right') nudge(step, 0);
    else if (dir === 'up') nudge(0, -step);
    else nudge(0, step);
  };

  // Arrow keys on the centre square move it the same way the chevrons do.
  const onFabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudge(-step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudge(step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(0, -step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(0, step);
    }
  };

  if (typeof document === 'undefined') return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = themedMenuWidth();
  const menuH = Math.min(560, vh * 0.7);
  const menuLeft = Math.min(Math.max(EDGE, pos.x + FAB_SIZE - menuW), Math.max(EDGE, vw - menuW - EDGE));
  const opensUp = pos.y + FAB_SIZE + EDGE + menuH > vh;
  const menuTop = opensUp ? Math.max(EDGE, pos.y - EDGE - menuH) : pos.y + FAB_SIZE + EDGE;

  return createPortal(
    <>
      {/* Floating cluster: centre square + 4 SVG chevron nudge tabs.
          Layout looks like `< [wheel] >` horizontally with up/down tabs on
          top/bottom — all four directions, all icons pure SVG. */}
      <div
        className="ks-fab-cluster ks-fab-cluster-enter"
        style={{
          position: 'fixed',
          left: pos.x - EXTENT,
          top: pos.y - EXTENT,
          width: FAB_SIZE + EXTENT * 2,
          height: FAB_SIZE + EXTENT * 2,
          zIndex: 2147483641,
          pointerEvents: 'none',
        }}
      >
        {(
          [
            { dir: 'left' as ChevronDir, label: 'Nudge menu left', left: 0, top: EXTENT + (FAB_SIZE - ARROW_SIZE) / 2 },
            { dir: 'right' as ChevronDir, label: 'Nudge menu right', left: EXTENT * 2 + FAB_SIZE - ARROW_SIZE, top: EXTENT + (FAB_SIZE - ARROW_SIZE) / 2 },
            { dir: 'up' as ChevronDir, label: 'Nudge menu up', left: EXTENT + (FAB_SIZE - ARROW_SIZE) / 2, top: 0 },
            { dir: 'down' as ChevronDir, label: 'Nudge menu down', left: EXTENT + (FAB_SIZE - ARROW_SIZE) / 2, top: EXTENT * 2 + FAB_SIZE - ARROW_SIZE },
          ]
        ).map((a) => (
          <button
            key={a.dir}
            type="button"
            aria-label={a.label}
            title={`${a.label} — Shift for big step`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNudgeClick(a.dir)}
            className="ks-card ks-fab-anim ks-fab-nudge flex items-center justify-center text-gray-400 hover:text-white select-none"
            style={{
              position: 'absolute',
              left: a.left,
              top: a.top,
              width: ARROW_SIZE,
              height: ARROW_SIZE,
              borderRadius: 6,
              pointerEvents: 'auto',
              padding: 0,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <ChevronIcon dir={a.dir} />
          </button>
        ))}
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onFabKeyDown}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Instance menu"
          title="Instance menu — drag to move, click to open, arrow keys to nudge"
          className={`ks-card ks-fab-anim ks-fab-toggle flex items-center justify-center text-gray-200 hover:text-white select-none${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${!open && !dragging ? ' is-idle' : ''}`}
          style={{
            position: 'absolute',
            left: EXTENT,
            top: EXTENT,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: `var(--ks-menu-toggle-radius, ${FAB_RADIUS}px)`,
            pointerEvents: 'auto',
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
            className="ks-fab-wheel w-6 h-6 pointer-events-none"
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
      </div>
      {shown && (
        <>
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className={leaving ? 'ks-fab-backdrop-exit' : 'ks-fab-backdrop-enter'}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483639,
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          />
          <div
            role="menu"
            aria-label="Instance menu"
            className={`glass-dropdown ks-fab-menu text-sm flex flex-col overflow-hidden${leaving
              ? (opensUp ? ' ks-fab-menu-exit-up' : ' ks-fab-menu-exit-down')
              : (opensUp ? ' ks-fab-menu-enter-up' : ' ks-fab-menu-enter-down')}`}
            style={{
              position: 'fixed',
              left: menuLeft,
              top: menuTop,
              zIndex: 2147483640,
              width: `var(--ks-menu-popover-width, ${MENU_WIDTH}px)`,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: '70vh',
              borderRadius: `var(--ks-menu-popover-radius, ${FAB_RADIUS}px)`,
              transformOrigin: opensUp ? 'bottom right' : 'top right',
            }}
          >
            {/* Popover header: status pulse + title + animated close. */}
            <div className="shrink-0 flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-white/10">
              <span className="relative flex w-2 h-2 shrink-0" aria-hidden="true">
                <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 ${open && !leaving ? 'animate-ping bg-emerald-400' : 'bg-gray-500'}`} />
                <span className={`relative inline-flex rounded-full w-2 h-2 ${open && !leaving ? 'bg-emerald-400' : 'bg-gray-500'}`} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 flex-1 truncate">
                Instance controls
              </span>
              {Number.isFinite(overviewId) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/instances/${overviewId}/overview`, { state: { fromMore: true } });
                  }}
                  title="Open the full instance overview page"
                  aria-label="More — open full instance overview page"
                  className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150"
                >
                  <span>More</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width={12}
                    height={12}
                    aria-hidden="true"
                    className="pointer-events-none"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close instance menu"
                title="Close (Esc)"
                className="shrink-0 rounded-md p-1 text-gray-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14} aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <InstanceMenu />
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
};

export default InstanceMenuFab;
