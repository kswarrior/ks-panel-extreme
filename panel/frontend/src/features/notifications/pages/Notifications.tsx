import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listNotifications, markRead, markAllRead, deleteNotification, clearNotifications, getNotificationStats, createNotification } from '../api/notifications';
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

  // Broadcast modal state
  const [bcastOpen, setBcastOpen] = useState(false);
  const [bcastTitle, setBcastTitle] = useState('');
  const [bcastMsg, setBcastMsg] = useState('');
  const [bcastCategory, setBcastCategory] = useState('general');
  const [bcastPriority, setBcastPriority] = useState('normal');
  const [bcastLink, setBcastLink] = useState('');
  const [bcastLabel, setBcastLabel] = useState('');
  const [bcastBusy, setBcastBusy] = useState(false);
  const [bcastError, setBcastError] = useState('');

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
      // We need total count from header; axios in notifications api doesn't expose header.
      // So we fetch via client directly to read header, else fallback to stats.
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
      // stats for chips
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
    try { const r = await markAllRead(); setRows((prev) => prev.map((x) => ({ ...x, is_read: true }))); if (stats) setStats({ ...stats, unread: 0 }); setUnread(0); } catch (e: any) { setError(e?.response?.data || 'Failed to mark all read'); }
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

  const onBroadcast = async () => {
    if (!bcastTitle.trim()) { setBcastError('Title is required'); return; }
    setBcastBusy(true); setBcastError('');
    try {
      await createNotification({ title: bcastTitle.trim(), message: bcastMsg, category: bcastCategory as any, priority: bcastPriority as any, link: bcastLink.trim() || undefined, action_label: bcastLabel.trim() || undefined, broadcast: true });
      setBcastOpen(false); setBcastTitle(''); setBcastMsg(''); setBcastLink(''); setBcastLabel(''); load();
    } catch (e: any) { setBcastError(e?.response?.data || 'Failed to broadcast'); }
    finally { setBcastBusy(false); }
  };

  const hasFilters = cat !== 'all' || pri !== 'all' || read !== 'all' || !!search.trim();
  const resetFilters = () => { setCat('all'); setPri('all'); setRead('all'); setSearch(''); };

  const unreadCount = stats?.unread ?? rows.filter((r) => !r.is_read).length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      {/* Header */}
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
                <div className="ks-dropdown min-w-[280px] animate-in fade-in slide-in-from-to duration-150 p-3 space-y-3 glass-strong rounded-xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
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

          {canBroadcast && (
            <button onClick={() => setBcastOpen(true)} className="inline-flex items-center gap-1.5 bg-white text-black text-xs font-bold px-3 py-1.5 rounded-md hover:bg-gray-100 shadow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M12 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M4 8a8 8 0 0 0 2.5 5.8" /></svg>
              Broadcast
            </button>
          )}
        </div>
      </div>

      {/* Stats strip — glass chips */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="ks-card ks-stat-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-400/20 grid place-items-center text-sky-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /></svg>
            </div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Total</p><p className="text-lg font-bold text-white leading-none">{stats.total}</p></div>
          </div>
          <div className={`ks-card ks-stat-card p-3 flex items-center gap-3 ${unreadCount > 0 ? 'border-red-400/30 bg-red-500/10' : ''}`}>
            <div className={`w-9 h-9 rounded-lg border grid place-items-center ${unreadCount > 0 ? 'bg-red-500/15 border-red-400/30 text-red-300' : 'bg-white/[0.05] border-white/10 text-gray-400'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
            </div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Unread</p><p className={`text-lg font-bold leading-none ${unreadCount > 0 ? 'text-red-300' : 'text-white'}`}>{unreadCount}</p></div>
          </div>
          <div className="ks-card ks-stat-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/20 grid place-items-center text-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Read</p><p className="text-lg font-bold text-white leading-none">{Math.max(0, stats.total - stats.unread)}</p></div>
          </div>
          <div className="ks-card ks-stat-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-fuchsia-500/15 border border-fuchsia-400/20 grid place-items-center text-fuchsia-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M18 8A6 6 0 0 0 6 8c0 7 6 6 6 10" /></svg>
            </div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Broadcasts</p><p className="text-lg font-bold text-white leading-none">{rows.filter((r) => r.is_broadcast).length}</p></div>
          </div>
        </div>
      )}

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
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/[0.06] border border-white/10 grid place-items-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7 text-gray-500"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </div>
            <p className="text-gray-300 font-semibold">No notifications</p>
            <p className="text-xs text-gray-500 max-w-sm">You're all caught up. New system alerts, node updates, and admin broadcasts will appear here. Try adjusting filters or check back later.</p>
            {hasFilters && <button onClick={resetFilters} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/15 px-3 py-1.5 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>Clear filters</button>}
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs border border-white/10 disabled:opacity-40">Prev</button>
          <span className="text-xs text-gray-500 font-mono">page {page + 1} / {totalPages} · {total} total</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs border border-white/10 disabled:opacity-40">Next</button>
        </div>
      )}

      {/* Broadcast modal */}
      {bcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Broadcast notification">
          <div className="glass-strong rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-white/[0.05] backdrop-blur-xl z-10">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-fuchsia-500/20 border border-fuchsia-400/30 grid place-items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-fuchsia-300"><path d="M12 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /></svg>
                </span>
                Broadcast notification
              </h3>
              <button onClick={() => setBcastOpen(false)} className="text-gray-400 hover:text-white p-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-gray-400">This sends a notification to <span className="text-white font-semibold">every user</span> on the panel. Use it for maintenance windows, security alerts, or announcements.</p>
              <div>
                <label className="ks-label">Title *</label>
                <input value={bcastTitle} onChange={(e) => setBcastTitle(e.target.value)} placeholder="Maintenance in 10 minutes" className="ks-input w-full" maxLength={500} />
              </div>
              <div>
                <label className="ks-label">Message</label>
                <textarea value={bcastMsg} onChange={(e) => setBcastMsg(e.target.value)} placeholder="Detailed message…" rows={3} className="ks-textarea w-full" maxLength={5000} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ks-label">Category</label>
                  <select value={bcastCategory} onChange={(e) => setBcastCategory(e.target.value)} className="ks-select w-full">
                    {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ks-label">Priority</label>
                  <select value={bcastPriority} onChange={(e) => setBcastPriority(e.target.value)} className="ks-select w-full">
                    {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="ks-label">Link (optional)</label>
                <input value={bcastLink} onChange={(e) => setBcastLink(e.target.value)} placeholder="/system or https://…" className="ks-input w-full font-mono text-xs" maxLength={1000} />
              </div>
              <div>
                <label className="ks-label">Action label</label>
                <input value={bcastLabel} onChange={(e) => setBcastLabel(e.target.value)} placeholder="Open dashboard" className="ks-input w-full" maxLength={255} />
              </div>
              {bcastError && <p className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded-md px-3 py-2">{bcastError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/10">
              <button onClick={() => setBcastOpen(false)} className="ks-btn-ghost px-4 py-1.5 rounded-md text-sm border border-white/10">Cancel</button>
              <button onClick={onBroadcast} disabled={bcastBusy || !bcastTitle.trim()} className="inline-flex items-center gap-1.5 bg-white text-black font-bold px-4 py-1.5 rounded-md text-sm hover:bg-gray-100 disabled:opacity-40">
                {bcastBusy ? 'Sending…' : 'Broadcast to all'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
