import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { markRead, markAllRead, deleteNotification, clearNotifications, getNotificationStats, getNotificationPrefs, setNotificationPrefs } from '../api/notifications';
import type { Notification, NotificationStats, NotificationMode } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import NotificationCard from '../components/NotificationCard';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import { useNotificationStore } from '@/shared/stores/notificationStore';
import { PERMISSION_AREAS, hasAreaAccess } from '@/shared/types/permissions';

type CategoryFilter = string;
type PriorityFilter = string;
type ReadFilter = 'all' | 'unread' | 'read';

const NotificationsPage: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);
  // Broadcast gate mirrors the backend POST /api/notifications rule
  // (umbrella MANAGE_NOTIFICATIONS OR granular NOTIFICATIONS_CREATE).
  const notificationsArea = React.useMemo(
    () => PERMISSION_AREAS.find((a) => a.label === 'Notifications')!,
    [],
  );
  const canBroadcast = React.useMemo(
    () => hasAreaAccess(permissions, notificationsArea, 'CREATE'),
    [permissions, notificationsArea],
  );

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

  const [prefMode, setPrefMode] = useState<NotificationMode>('realtime');
  const [prefOptOut, setPrefOptOut] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefMsg, setPrefMsg] = useState('');

  useEffect(() => {
    getNotificationPrefs().then((p) => {
      setPrefMode(p.mode);
      setPrefOptOut(p.email_opt_out);
    }).catch(() => {});
  }, []);

  const savePrefs = async () => {
    setPrefSaving(true);
    setPrefMsg('');
    try {
      const p = await setNotificationPrefs(prefMode, prefOptOut);
      setPrefMode(p.mode);
      setPrefOptOut(p.email_opt_out);
      setPrefMsg('Saved.');
    } catch (e: any) {
      setPrefMsg(e?.response?.data || 'Failed to save');
    } finally {
      setPrefSaving(false);
    }
  };

  const setUnread = useNotificationStore((s) => s.setUnread);

  // Debounced search (mirrors Tickets.tsx): typing must not spam the API
  // on every keystroke, and out-of-order responses must not overwrite
  // newer results — the sequence guard drops stale completions.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const my = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const params: any = { limit, offset: page * limit };
      if (cat !== 'all') params.category = cat;
      if (pri !== 'all') params.priority = pri;
      if (read === 'unread') params.is_read = false;
      if (read === 'read') params.is_read = true;
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      const sp = new URLSearchParams();
      if (params.category) sp.set('category', params.category);
      if (params.priority) sp.set('priority', params.priority);
      if (params.is_read !== undefined) sp.set('is_read', params.is_read ? 'true' : 'false');
      if (params.q) sp.set('q', params.q);
      sp.set('limit', String(limit));
      sp.set('offset', String(page * limit));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      const res = await client.get<Notification[]>(`/api/notifications${qs}`);
      if (my !== loadSeq.current) return;
      setRows(res.data);
      const hdr = res.headers['x-total-count'] || res.headers['X-Total-Count'];
      setTotal(hdr ? Number(hdr) : res.data.length);
      try {
        const s = await getNotificationStats();
        if (my !== loadSeq.current) return;
        setStats(s);
        setUnread(s.unread);
      } catch {}
    } catch (e: any) {
      if (my !== loadSeq.current) return;
      setError(e?.response?.data || 'Failed to load notifications');
    } finally {
      if (my === loadSeq.current) setLoading(false);
    }
  }, [cat, pri, read, debouncedSearch, page, limit, setUnread]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [cat, pri, read, debouncedSearch]);

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
      {/* Fixed top-right pill — "Notifications" title lives in the app header. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search title, message…"
            ariaLabel="Search notifications"
            buttonClassName="ks-tab inline-flex items-center justify-center"
            buttonStyle={PILL_TAB_STYLE}
          />
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
              style={PILL_TAB_STYLE}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
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

          <button
            onClick={onMarkAll}
            disabled={unreadCount === 0}
            className="ks-tab inline-flex items-center justify-center disabled:opacity-40"
            style={PILL_TAB_STYLE}
            title="Mark all read"
            aria-label="Mark all read"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5-2-2" /></svg>
          </button>
          <button
            onClick={onClearRead}
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Clear read"
            aria-label="Clear read"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>

          {/* Stat icon button — navigates to dedicated stats page */}
          <Link
            to="/notifications/stats"
            aria-label="Notification Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View notification statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <Link
            to="/notifications/schedules"
            aria-label="Notification schedules"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Notification digest & delivery schedules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>

          {/* Broadcast as plus button — navigates to full broadcast page */}
          {canBroadcast && (
            <Link
              to="/notifications/broadcast"
              aria-label="Broadcast notification"
              className="ks-tab ks-tab-active inline-flex items-center justify-center"
              style={PILL_TAB_STYLE}
              title="Broadcast notification"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </Link>
          )}
      </PageActionsPill>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{total} notification{total === 1 ? '' : 's'} · page {page + 1} of {totalPages}{hasFilters ? ' · filtered' : ''}</p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="ks-btn-ghost px-2.5 py-1 rounded-md text-xs border border-white/10">Refresh</button>
          <button onClick={onClearAll} className="text-xs font-medium text-red-300 hover:text-red-200 px-2 py-1 rounded-md border border-red-500/20 hover:bg-red-500/10">Clear all</button>
        </div>
      </div>

      {/* Delivery prefs: realtime = WS push + immediate email, digest = WS push + daily email, off = inbox only */}
      <div className="mb-4 glass-card ks-form-card rounded-xl p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Delivery</span>
        <select value={prefMode} onChange={(e) => setPrefMode(e.target.value as NotificationMode)} className="glass-field text-xs" aria-label="Delivery mode">
          <option value="realtime">Realtime (push + email)</option>
          <option value="digest">Digest (push + daily email)</option>
          <option value="off">Off (inbox only)</option>
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input type="checkbox" checked={prefOptOut} onChange={(e) => setPrefOptOut(e.target.checked)} className="rounded border-white/20 bg-black/30 w-3.5 h-3.5" />
          Opt out of ticket/notification email
        </label>
        <button onClick={savePrefs} disabled={prefSaving} className="ks-btn-ghost px-3 py-1.5 rounded-md text-xs border border-white/10 disabled:opacity-50">
          {prefSaving ? 'Saving…' : 'Save prefs'}
        </button>
        {prefMsg && <span className="text-xs text-gray-400">{prefMsg}</span>}
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

      {!loading && hasFilters && rows.length === 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No notifications match your filters.
          <div className="mt-2 flex justify-center">
            <button onClick={resetFilters} aria-label="Clear filters" className="ks-btn-icon ks-icon-btn" title="Clear filters">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {!loading && !hasFilters && rows.length === 0 && !error && (
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
