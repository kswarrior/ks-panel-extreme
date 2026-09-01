import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { markRead, markAllRead, deleteNotification, clearNotifications, getNotificationStats } from '../api/notifications';
import type { Notification, NotificationStats } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import NotificationCard from '../components/NotificationCard';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import Card from '@/shared/components/ui/Card';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import { useNotificationStore } from '@/shared/stores/notificationStore';

type CategoryFilter = string;
type PriorityFilter = string;
type ReadFilter = 'all' | 'unread' | 'read';

const NotificationsPage: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);
  const canBroadcast = permissions.includes('MANAGE_NOTIFICATIONS') || permissions.includes('ACCESS_ADMIN_PANEL');

  const [rows, setRows] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [pri, setPri] = useState<PriorityFilter>('all');
  const [read, setRead] = useState<ReadFilter>('all');
  const [page, setPage] = useState(0);
  const limit = 12;
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [busyId, setBusyId] = useState<number | null>(null);

  const setUnread = useNotificationStore((s) => s.setUnread);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { limit, offset: page * limit };
      if (cat !== 'all') params.category = cat;
      if (pri !== 'all') params.priority = pri;
      if (read === 'unread') params.is_read = false;
      if (read === 'read') params.is_read = true;
      if (search.trim()) params.q = search.trim();
      const sp = new URLSearchParams();
      if (params.category) sp.set('category', params.category);
      if (params.priority) sp.set('priority', params.priority);
      if (params.is_read !== undefined) sp.set('is_read', params.is_read ? 'true' : 'false');
      if (params.q) sp.set('q', params.q);
      sp.set('limit', String(limit));
      sp.set('offset', String(page * limit));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      const res = await client.get<Notification[]>(`/api/notifications${qs}`);
      setRows(res.data);
      const hdr = res.headers['x-total-count'] || res.headers['X-Total-Count'];
      setTotal(hdr ? Number(hdr) : res.data.length);
      try {
        const s = await getNotificationStats();
        setStats(s);
        setUnread(s.unread);
      } catch {}
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [cat, pri, read, search, page, limit, setUnread]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [cat, pri, read, search]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    if (filterOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  const onMarkRead = async (id: number) => {
    setBusyId(id);
    try { await markRead(id); setRows((prev) => prev.map((r) => r.id === id ? { ...r, is_read: true, read_at: new Date().toISOString() } : r)); if (stats) setStats({ ...stats, unread: Math.max(0, stats.unread - 1) }); setUnread(Math.max(0, (stats?.unread ?? 1) - 1)); } catch {}
    finally { setBusyId(null); }
  };

  const onMarkAll = async () => {
    try { await markAllRead(); setRows((prev) => prev.map((x) => ({ ...x, is_read: true }))); if (stats) setStats({ ...stats, unread: 0 }); setUnread(0); } catch (e: any) { setError(e?.response?.data || 'Failed to mark all read'); }
  };

  const onDelete = async (id: number) => {
    try { await deleteNotification(id); setRows((prev) => prev.filter((r) => r.id !== id)); setTotal((t) => Math.max(0, t - 1)); } catch (e: any) { setError(e?.response?.data || 'Failed to delete'); }
  };

  const onClearRead = async () => {
    if (!confirm('Clear all read notifications?')) return;
    try { const r = await clearNotifications(true); setRows((prev) => prev.filter((x) => !x.is_read)); setTotal((t) => Math.max(0, t - r.deleted)); load(); } catch {}
  };

  const onClearAll = async () => {
    if (!confirm('Delete ALL notifications? This cannot be undone.')) return;
    try { await clearNotifications(false); setRows([]); setTotal(0); if (stats) setStats({ ...stats, total: 0, unread: 0, by_category: {}, by_priority: {} }); setUnread(0); } catch (e: any) { setError(e?.response?.data || 'Failed to clear'); }
  };

  const hasFilters = cat !== 'all' || pri !== 'all' || read !== 'all' || !!search.trim();
  const resetFilters = () => { setCat('all'); setPri('all'); setRead('all'); setSearch(''); };

  const unreadCount = stats?.unread ?? rows.filter((r) => !r.is_read).length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      {/* Header — mirrors Templates page: Search + Filter + Stat icon + Plus (Broadcast) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/20 grid place-items-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-sky-300"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </span>
            Notifications
          </h2>
          {stats && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs">
              <span className="px-2 py-1 rounded-full bg-white text-black font-bold">{stats.total} total</span>
              <span className={`px-2 py-1 rounded-full font-bold border ${unreadCount > 0 ? 'bg-red-500 border-red-400 text-white animate-pulse' : 'bg-white/10 border-white/20 text-gray-300'}`}>{unreadCount} unread</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SearchDropdown value={search} onChange={setSearch} placeholder="Search title, message…" ariaLabel="Search notifications" />
          <div className="relative" ref={filterRef}>
            <button type="button" onClick={() => setFilterOpen(!filterOpen)} className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`} aria-label="Open filters" aria-expanded={filterOpen}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              {(cat !== 'all' || pri !== 'all' || read !== 'all') && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-72">
                <div className="glass-dropdown rounded-xl p-3 space-y-3 min-w-[280px] animate-in fade-in slide-in-from-to duration-150">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                    <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full glass-field ks-select">
                      <option value="all">All categories</option>
                      {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Priority</label>
                    <select value={pri} onChange={(e) => setPri(e.target.value)} className="w-full glass-field ks-select">
                      <option value="all">All priorities</option>
                      {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Read state</label>
                    <select value={read} onChange={(e) => setRead(e.target.value as any)} className="w-full glass-field ks-select">
                      <option value="all">All</option>
                      <option value="unread">Unread only</option>
                      <option value="read">Read only</option>
                    </select>
                  </div>
                  {hasFilters && <button onClick={resetFilters} className="w-full text-xs font-medium text-sky-300 hover:text-sky-200 py-1.5 border border-sky-400/20 rounded-md hover:bg-sky-500/10">Clear filters</button>}
                  <div className="pt-2 border-t border-white/5 flex justify-end">
                    <button onClick={() => setFilterOpen(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 ml-1">
            <button onClick={onMarkAll} disabled={unreadCount === 0} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs font-medium border border-white/10 hover:bg-white/10 disabled:opacity-40">Mark all read</button>
            <button onClick={onClearRead} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs font-medium border border-white/10 hover:bg-white/10">Clear read</button>
          </div>

          {/* Stat icon button — like Templates page (top-right, navigates to dedicated stats page) */}
          <Link
            to="/notifications/stats"
            aria-label="Notification Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View notification statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>

          {/* Broadcast as plus button — like Templates page (top-right plus navigates to full broadcast page) */}
          {canBroadcast && (
            <Link
              to="/notifications/broadcast"
              aria-label="Broadcast notification"
              className="ks-btn-header ks-icon-btn"
              title="Broadcast notification"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{total} notification{total === 1 ? '' : 's'} · page {page + 1} of {totalPages}{hasFilters ? ' · filtered' : ''}</p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="ks-btn-ghost px-2.5 py-1 rounded-md text-xs border border-white/10">Refresh</button>
          <button onClick={onClearAll} className="text-xs font-medium text-red-300 hover:text-red-200 px-2 py-1 rounded-md border border-red-500/20 hover:bg-red-500/10">Clear all</button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">{error}</div>}

      {loading && <SkeletonGrid count={6} />}

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((n) => (
            <NotificationCard key={n.id} n={n} onRead={onMarkRead} onDelete={onDelete} busy={busyId === n.id} />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-20 h-20 text-gray-400"
              aria-hidden="true"
            >
              <circle cx="12" cy="3.35" r="1.1" fill="currentColor" stroke="none" />
              <path d="M12 5.45a6 6 0 0 0-6 6V14c0 .5-.2 1-.55 1.35L4.2 16.6a.6.6 0 0 0 .42 1.05h14.76a.6.6 0 0 0 .42-1.05l-1.24-1.25A1.9 1.9 0 0 1 18 14v-2.55a6 6 0 0 0-6-6Z" />
              <path d="M8.2 17.65h7.6" strokeWidth="1.55" />
              <path d="M12 17.65v1.45" strokeWidth="1.35" />
              <circle cx="12" cy="20.15" r="1.55" fill="currentColor" stroke="none" />
              <circle cx="11.45" cy="19.65" r="0.42" fill="white" opacity="0.62" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No notifications</p>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs border border-white/10 disabled:opacity-40">Prev</button>
          <span className="text-xs text-gray-500 font-mono">page {page + 1} / {totalPages} · {total} total</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs border border-white/10 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
