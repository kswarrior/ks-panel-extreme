import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/shared/stores/notificationStore';
import { markRead, markAllRead, deleteNotification } from '@/features/notifications/api/notifications';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import type { Notification } from '../types/notification';

const timeAgo = (iso: string): string => {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const CategoryIcon: React.FC<{ cat: string; size?: number }> = ({ cat, size = 16 }) => {
  const c = (cat || 'general') as keyof typeof CATEGORY_META;
  const meta = CATEGORY_META[c] || CATEGORY_META.general;
  // minimal symbolic icons per category, SVG-only to match panel's hand-crafted icon set
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { color: meta.color } as React.CSSProperties };
  switch (c) {
    case 'node':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><circle cx="4" cy="5" r="1.6" /><circle cx="20" cy="5" r="1.6" /><circle cx="4" cy="19" r="1.6" /><circle cx="20" cy="19" r="1.6" /></svg>;
    case 'instance':
      return <svg {...common}><rect x="3" y="6" width="11" height="9" rx="1.2" /><rect x="8" y="11" width="11" height="9" rx="1.2" /></svg>;
    case 'template':
      return <svg {...common}><rect x="7" y="4" width="13" height="15" rx="2" /><path d="M11 9h6M11 13h6" /></svg>;
    case 'security':
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'system':
      return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /></svg>;
    case 'user':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>;
    case 'update':
      return <svg {...common}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>;
  }
};

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const unread = useNotificationStore((s) => s.unread);
  const recent = useNotificationStore((s) => s.recent);
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);
  const fetchRecent = useNotificationStore((s) => s.fetchRecent);
  const markLocalRead = useNotificationStore((s) => s.markLocalRead);
  const markAllLocalRead = useNotificationStore((s) => s.markAllLocalRead);
  const removeLocal = useNotificationStore((s) => s.removeLocal);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = 380;
    let left = r.right - w;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - w - 8;
    setPos({ left, top });
  }, []);

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

  useLayoutEffect(() => {
    if (!open) return;
    const m = menuRef.current;
    const t = triggerRef.current;
    if (!m || !t) return;
    const mb = m.getBoundingClientRect();
    const tb = t.getBoundingClientRect();
    const vh = window.innerHeight;
    if (mb.bottom > vh - 8) {
      const flipped = Math.max(8, tb.top - 6 - mb.height);
      if (flipped !== pos.top) setPos((p) => ({ ...p, top: flipped }));
    }
  }, [open, pos.top]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Poll unread count every 20s + fetch recent on open
  useEffect(() => {
    fetchUnread();
    fetchRecent();
    const iv = setInterval(fetchUnread, 20000);
    return () => clearInterval(iv);
  }, [fetchUnread, fetchRecent]);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open, fetchRecent]);

  const onMarkRead = async (n: Notification) => {
    if (n.is_read) return;
    setBusy(n.id);
    try {
      await markRead(n.id);
      markLocalRead(n.id);
    } catch {
      // noop
    } finally {
      setBusy(null);
    }
  };

  const onMarkAll = async () => {
    try {
      await markAllRead();
      markAllLocalRead();
    } catch {}
  };

  const onDelete = async (id: number) => {
    try {
      await deleteNotification(id);
      removeLocal(id);
    } catch {}
  };

  // Portal dropdown — mirrors RichMenu's theme-aware glass-dropdown + scrim
  // so the panel's Theme Studio Dropdowns tab (bg, blur, border, shadow,
  // radius) tints this surface identically to the profile menu. The bell
  // trigger keeps the existing ks-icon-btn chrome; the panel itself is
  // portal-pinned to the trigger's box with smart flip, escapes clipping
  // from header overflow/transform and stays above all stacking contexts.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full glass-chrome border border-white/10 text-gray-200 hover:text-white hover:bg-white/10 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 group"
      >
        {/* Stylish bell — dome + flared rim + clapper + top highlight, matches node/instance icon stroke */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110 group-hover:rotate-[-8deg]" aria-hidden="true">
          <path d="M12 4a5 5 0 0 0-5 5v4.5l-1.4 1.4a1 1 0 0 0 .7 1.7h11.4a1 1 0 0 0 .7-1.7L17 13.4V9a5 5 0 0 0-5-5z" />
          <path d="M9.5 18.2a3 3 0 0 0 5 0" />
          <circle cx="12" cy="7" r="0.7" fill="currentColor" stroke="none" opacity="0.85" />
          <path d="M12 4v1.2" opacity="0.28" strokeWidth="1.2" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-black/50 shadow-[0_2px_8px_rgba(239,68,68,0.6)] animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-red-500/40 animate-ping pointer-events-none" aria-hidden="true" />
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Invisible scrim — closes on outside click, identical to RichMenu */}
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
              aria-label="Notifications"
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                width: 380,
                maxWidth: '92vw',
                zIndex: 2147483640,
              }}
              className="glass-dropdown rounded-xl overflow-hidden animate-slide-up"
            >
            {/* Header — 100% theme: uses dropdown vars, never hard-coded white on white */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ks-dropdown-header-sep, rgba(255,255,255,0.10))', background: 'color-mix(in srgb, var(--ks-dropdown-bg) 92%, transparent)' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" aria-hidden="true" />
                <h3 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--ks-dropdown-item-text, #e5e7eb)' }}>Notifications</h3>
                {unread > 0 && (
                  <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white">{unread} new</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unread > 0 && (
                  <button
                    onClick={onMarkAll}
                    className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors"
                    style={{ color: 'var(--ks-info, #38bdf8)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ks-dropdown-item-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); navigate('/notifications'); }}
                  className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors"
                  style={{ color: 'var(--ks-muted, #9ca3af)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ks-dropdown-item-hover)'; e.currentTarget.style.color = 'var(--ks-dropdown-item-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ks-muted)'; }}
                >
                  View all
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-7 h-7 grid place-items-center rounded-md transition-colors"
                  style={{ color: 'var(--ks-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ks-dropdown-item-hover)'; e.currentTarget.style.color = 'var(--ks-dropdown-item-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ks-muted)'; }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>

            {/* List — theme-aware: text uses dropdown vars, hover uses theme hover */}
            <div className="max-h-[380px] overflow-y-auto overscroll-contain" style={{ borderColor: 'var(--ks-dropdown-header-sep)' }}>
              {recent.length === 0 ? (
                <div className="py-10 px-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full grid place-items-center mb-3 border" style={{ background: 'color-mix(in srgb, var(--ks-dropdown-bg) 60%, transparent)', borderColor: 'var(--ks-dropdown-header-sep)', color: 'var(--ks-muted)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--ks-dropdown-item-text)' }}>All caught up</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ks-muted)' }}>New alerts will appear here instantly.</p>
                  <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline" style={{ color: 'var(--ks-info, #38bdf8)' }}>
                    Open notification center
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--ks-dropdown-header-sep) 60%, transparent)' }}>
                {recent.map((n) => {
                  const pri = PRIORITY_META[n.priority] || PRIORITY_META.normal;
                  const cat = CATEGORY_META[n.category] || CATEGORY_META.general;
                  const cover = (n as any).cover_image as string | undefined;
                  const notes = (n as any).notes as string | undefined;
                  return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setOpen(false); navigate(`/notifications/${n.id}`); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setOpen(false); navigate(`/notifications/${n.id}`); }}}
                      className={`group relative flex gap-3 px-4 py-3 text-left w-full cursor-pointer transition-colors ${!n.is_read ? '' : ''}`}
                      style={{ background: !n.is_read ? 'color-mix(in srgb, var(--ks-info, #38bdf8) 7%, transparent)' : 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ks-dropdown-item-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = !n.is_read ? 'color-mix(in srgb, var(--ks-info, #38bdf8) 7%, transparent)' : 'transparent')}
                    >
                      {/* unread accent bar */}
                      {!n.is_read && <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: 'var(--ks-info, #38bdf8)' }} aria-hidden="true" />}
                      <div className="shrink-0 w-9 h-9 rounded-lg grid place-items-center mt-0.5 relative overflow-hidden border" style={{ background: 'color-mix(in srgb, var(--ks-dropdown-bg) 70%, transparent)', borderColor: 'var(--ks-dropdown-header-sep)', color: cat.color }}>
                        {cover ? (
                          <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <CategoryIcon cat={n.category} />
                        )}
                        {!n.is_read && <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${pri.dot}`} style={{ borderColor: 'var(--ks-dropdown-bg)' }} aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] leading-tight truncate pr-2 ${!n.is_read ? 'font-semibold' : 'font-medium'}`} style={{ color: 'var(--ks-dropdown-item-text)' }} title={n.title}>{n.title}</p>
                          <span className="shrink-0 text-[10px] font-mono mt-0.5" style={{ color: 'var(--ks-muted)' }}>{timeAgo(n.created_at)}</span>
                        </div>
                        {n.actor_name && <p className="text-[11px] truncate" style={{ color: 'var(--ks-muted)' }}>by {n.actor_name}{n.is_broadcast ? ' • broadcast' : ''}</p>}
                        {notes ? (
                          <p className="text-xs line-clamp-2 mt-1 leading-relaxed" style={{ color: 'var(--ks-muted)' }}>{notes}</p>
                        ) : n.message ? (
                          <p className="text-xs line-clamp-2 mt-1 leading-relaxed" style={{ color: 'var(--ks-muted)' }}>{n.message}</p>
                        ) : null}
                        {cover ? null : null}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border" style={{ background: 'color-mix(in srgb, var(--ks-dropdown-bg) 50%, transparent)', borderColor: 'var(--ks-dropdown-header-sep)', color: 'var(--ks-dropdown-item-text)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color }} aria-hidden="true" />
                            {cat.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${pri.bg} ${pri.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} aria-hidden="true" />
                            {pri.label}
                          </span>
                          {n.is_broadcast && <span className="text-[10px] px-1.5 py-0.5 rounded-md border" style={{ background: 'color-mix(in srgb, #e879f9 14%, transparent)', borderColor: 'color-mix(in srgb, #e879f9 30%, transparent)', color: '#f0abfc' }}>Broadcast</span>}
                        </div>
                        {(n as any).media_json && (n as any).media_json !== '[]' && (() => { try { const m = JSON.parse((n as any).media_json); if (!Array.isArray(m) || m.length===0) return null; const first = m[0]; const url = first?.url || first; const type = (first?.type || '').toLowerCase(); const isVideo = type==='video' || /\.mp4|\.webm|\.mov/i.test(url); const isGif = type==='gif' || /\.gif/i.test(url); return <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ks-dropdown-header-sep)' }}>{isVideo ? <video src={url} className="w-full h-20 object-cover" muted playsInline /> : <img src={url} alt="" className="w-full h-20 object-cover" loading="lazy" />}{isGif && <span className="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded bg-black/60 text-white">GIF</span>}</div>; } catch { return null; } })()}
                        {(n.link || n.action_label) && (
                          <div className="mt-2 flex items-center gap-2">
                            {n.link && (
                              <span
                                onClick={(e) => { e.stopPropagation(); setOpen(false); window.location.href = n.link!; }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline cursor-pointer"
                                style={{ color: 'var(--ks-info, #38bdf8)' }}
                              >
                                {n.action_label || 'Open'}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-center gap-1 ml-1">
                        {!n.is_read ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onMarkRead(n); }}
                            disabled={busy === n.id}
                            title="Mark as read"
                            className="w-7 h-7 grid place-items-center rounded-md border transition-colors disabled:opacity-50"
                            style={{ background: 'color-mix(in srgb, var(--ks-info, #38bdf8) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-info, #38bdf8) 30%, transparent)', color: 'var(--ks-info, #38bdf8)' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                          </button>
                        ) : (
                          <span className="w-7 h-7 grid place-items-center rounded-md border" style={{ background: 'color-mix(in srgb, var(--ks-dropdown-bg) 50%, transparent)', borderColor: 'var(--ks-dropdown-header-sep)', color: 'var(--ks-muted)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                          title="Delete"
                          className="w-7 h-7 grid place-items-center rounded-md border border-transparent transition-colors opacity-0 group-hover:opacity-100"
                          style={{ color: 'var(--ks-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ks-bad, #ef4444)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--ks-bad, #ef4444) 12%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ks-bad, #ef4444) 22%, transparent)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ks-muted)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}
            </div>

            {/* Footer — theme-aware */}
            {recent.length > 0 && (
              <div className="px-3 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--ks-dropdown-header-sep)', background: 'color-mix(in srgb, var(--ks-dropdown-bg) 88%, transparent)' }}>
                <span className="text-[11px]" style={{ color: 'var(--ks-muted)' }}>{recent.length} recent · {unread} unread</span>
                <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors" style={{ background: 'var(--ks-btn-bg, #fff)', color: 'var(--ks-btn-text, #000)' }}>
                  Manage notifications
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
            )}
            </div>
          </>
          , document.body
        )}
    </>
  );
};

export default NotificationBell;
