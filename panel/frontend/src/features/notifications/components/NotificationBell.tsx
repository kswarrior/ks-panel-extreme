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
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count every 20s + fetch recent on open
  useEffect(() => {
    fetchUnread();
    fetchRecent();
    const iv = setInterval(fetchUnread, 20000);
    // also poll recent silently when dropdown closed to keep badge fresh for toasts? we just poll unread
    return () => clearInterval(iv);
  }, [fetchUnread, fetchRecent]);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open, fetchRecent]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full glass-chrome border border-white/10 text-gray-200 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          <path d="M4 8a8 8 0 0 0 2.5 5.8" opacity="0.35" />
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

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] z-50 animate-slide-up">
          <div className="glass-strong rounded-xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-white tracking-tight">Notifications</h3>
                {unread > 0 && (
                  <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white">{unread} new</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unread > 0 && (
                  <button
                    onClick={onMarkAll}
                    className="text-[11px] font-medium text-sky-300 hover:text-sky-200 px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); navigate('/notifications'); }}
                  className="text-[11px] font-medium text-gray-400 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                >
                  View all
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-7 h-7 grid place-items-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-white/[0.06] overscroll-contain">
              {recent.length === 0 ? (
                <div className="py-10 px-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/[0.06] border border-white/10 grid place-items-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6 text-gray-500"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  </div>
                  <p className="text-sm text-gray-300 font-medium">All caught up</p>
                  <p className="text-xs text-gray-500 mt-1">New alerts will appear here instantly.</p>
                  <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-300 hover:text-sky-200 hover:underline">
                    Open notification center
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              ) : (
                recent.map((n) => {
                  const pri = PRIORITY_META[n.priority] || PRIORITY_META.normal;
                  const cat = CATEGORY_META[n.category] || CATEGORY_META.general;
                  return (
                    <div
                      key={n.id}
                      className={`group relative flex gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors ${!n.is_read ? 'bg-sky-500/[0.04]' : ''}`}
                    >
                      {/* unread accent bar */}
                      {!n.is_read && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-sky-400" aria-hidden="true" />}
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 grid place-items-center mt-0.5 relative overflow-hidden">
                        <CategoryIcon cat={n.category} />
                        {!n.is_read && <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-black ${pri.dot}`} aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] leading-tight truncate pr-2 ${!n.is_read ? 'font-semibold text-white' : 'font-medium text-gray-200'}`} title={n.title}>{n.title}</p>
                          <span className="shrink-0 text-[10px] text-gray-500 font-mono mt-0.5">{timeAgo(n.created_at)}</span>
                        </div>
                        {n.message && <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">{n.message}</p>}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border bg-white/[0.04] border-white/10 text-gray-300">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color }} aria-hidden="true" />
                            {cat.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${pri.bg} ${pri.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} aria-hidden="true" />
                            {pri.label}
                          </span>
                          {n.is_broadcast && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200">Broadcast</span>}
                        </div>
                        {(n.link || n.action_label) && (
                          <div className="mt-2 flex items-center gap-2">
                            {n.link && (
                              <a
                                href={n.link}
                                onClick={(e) => { e.preventDefault(); setOpen(false); window.location.href = n.link!; }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200 hover:underline"
                              >
                                {n.action_label || 'Open'}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-center gap-1 ml-1">
                        {!n.is_read ? (
                          <button
                            onClick={() => onMarkRead(n)}
                            disabled={busy === n.id}
                            title="Mark as read"
                            className="w-7 h-7 grid place-items-center rounded-md bg-sky-500/15 border border-sky-400/20 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200 transition-colors disabled:opacity-50"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                          </button>
                        ) : (
                          <span className="w-7 h-7 grid place-items-center rounded-md bg-white/[0.04] border border-white/10 text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                          </span>
                        )}
                        <button
                          onClick={() => onDelete(n.id)}
                          title="Delete"
                          className="w-7 h-7 grid place-items-center rounded-md text-gray-500 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {recent.length > 0 && (
              <div className="px-3 py-2 border-t border-white/10 bg-black/20 flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{recent.length} recent · {unread} unread</span>
                <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-white hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors">
                  Manage notifications
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
