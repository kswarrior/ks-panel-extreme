import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getNotificationStats } from '../api/notifications';
import type { NotificationStats as Stats } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import {
  PieChart,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import client from '@/shared/api/client';
import type { Notification } from '../types/notification';

const NotificationStats: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getNotificationStats();
      setStats(s);
      // Fetch a sample for broadcast accuracy fallback if backend hasn't yet deployed broadcast field
      // and for recent distribution preview.
      try {
        const res = await client.get<Notification[]>('/api/notifications?limit=50');
        setNotifications(res.data);
      } catch {
        // non-fatal
      }
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load notification stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const derived = useMemo(() => {
    if (!stats) return null;
    const total = stats.total;
    const unread = stats.unread;
    const read = Math.max(0, total - unread);
    const broadcast = stats.broadcast ?? notifications.filter((n) => n.is_broadcast).length;
    // Use stats.broadcast when present, otherwise fallback to sampled count (may be under-count)
    const broadcastCount = stats.broadcast ?? broadcast;
    return { total, unread, read, broadcast: broadcastCount };
  }, [stats, notifications]);

  const categorySlices = useMemo(() => {
    if (!stats) return [];
    const q = search.trim().toLowerCase();
    const entries = Object.entries(stats.by_category || {});
    if (entries.length === 0) return [];
    const palette = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc', '#f472b6', '#94a3b8'];
    return entries
      .filter(([label]) => {
        if (!q) return true;
        const pretty = CATEGORY_META[label as keyof typeof CATEGORY_META]?.label || label;
        return pretty.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      })
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label: CATEGORY_META[label as keyof typeof CATEGORY_META]?.label || label,
        value,
        color: CATEGORY_META[label as keyof typeof CATEGORY_META]?.color || palette[i % palette.length],
      }));
  }, [stats, search]);

  const prioritySlices = useMemo(() => {
    if (!stats) return [];
    const q = search.trim().toLowerCase();
    const entries = Object.entries(stats.by_priority || {});
    if (entries.length === 0) return [];
    return entries
      .filter(([label]) => {
        if (!q) return true;
        const pretty = PRIORITY_META[label as keyof typeof PRIORITY_META]?.label || label;
        return pretty.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      })
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label: PRIORITY_META[label as keyof typeof PRIORITY_META]?.label || label,
        value,
        color: PRIORITY_META[label as keyof typeof PRIORITY_META]?.color === 'text-gray-400' ? '#9ca3af'
          : PRIORITY_META[label as keyof typeof PRIORITY_META]?.color === 'text-sky-300' ? '#38bdf8'
          : PRIORITY_META[label as keyof typeof PRIORITY_META]?.color === 'text-amber-300' ? '#fbbf24'
          : PRIORITY_META[label as keyof typeof PRIORITY_META]?.color === 'text-orange-300' ? '#fb923c'
          : PRIORITY_META[label as keyof typeof PRIORITY_META]?.color === 'text-red-300' ? '#f87171'
          : '#9ca3af',
      }));
  }, [stats, search]);

  const readSlices = useMemo(() => {
    if (!derived) return [];
    const s: { label: string; value: number; color: string }[] = [];
    if (derived.unread > 0) s.push({ label: 'Unread', value: derived.unread, color: '#f87171' });
    if (derived.read > 0) s.push({ label: 'Read', value: derived.read, color: '#34d399' });
    if (s.length === 0 && derived.total > 0) s.push({ label: 'Empty', value: 0, color: '#9ca3af' });
    return s;
  }, [derived]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white/5 rounded" />
            ))}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fixed top-right pill — "Statistics" title lives in the app header
          ("Notifications / Statistics", parent crumb covers back-nav). */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search categories..."
            ariaLabel="Search notification stats"
            buttonClassName="ks-tab inline-flex items-center justify-center"
            buttonStyle={PILL_TAB_STYLE}
          />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="ks-tab"
            style={PILL_TAB_STYLE}
            aria-label="Time range"
          >
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {search.trim() !== '' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Quick info</label>
                      <p className="text-xs text-gray-500">
                        Stats are per-user. Broadcasts are fan-out rows — every recipient counts separately. Categories and priorities are aggregated from your inbox.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setFilterOpen(false)}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
      </PageActionsPill>

      {/* Stat Cards — mirrors the strip that used to live on Notifications.tsx (now moved here) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total"
          value={derived?.total ?? 0}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
              <path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          }
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Unread"
          value={derived?.unread ?? 0}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" />
            </svg>
          }
          color="text-red-300"
          dotColor="bg-red-400"
        />
        <StatCard
          label="Read"
          value={derived?.read ?? 0}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          }
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Broadcasts"
          value={derived?.broadcast ?? 0}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7 6 6 6 10" />
              <path d="M12 8a6 6 0 0 1 6 6" />
              <path d="M4 12a8 8 0 0 0 2.5 5.8" />
            </svg>
          }
          color="text-fuchsia-300"
          dotColor="bg-fuchsia-400"
        />
      </div>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}

      {!error && stats && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {categorySlices.length > 0 && (
            <PieChart slices={categorySlices} title="By Category" centerLabel={`${stats.total}`} />
          )}
          {prioritySlices.length > 0 && (
            <PieChart slices={prioritySlices} title="By Priority" centerLabel={`${stats.total}`} />
          )}
          {readSlices.length > 0 && (
            <PieChart slices={readSlices} title="Read vs Unread" centerLabel={`${derived?.total ?? 0}`} />
          )}
          {categorySlices.length === 0 && prioritySlices.length === 0 && (
            <GlassCard className="p-6 text-center text-gray-400 lg:col-span-3">
              No notifications yet — categories and priorities will appear here once you receive your first notification.
            </GlassCard>
          )}
        </div>
      )}

      {/* Category / Priority breakdown list for accessibility */}
      {stats && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <GlassCard className="p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded bg-sky-400" /> By Category
            </h3>
            {Object.keys(stats.by_category || {}).length === 0 ? (
              <p className="text-xs text-gray-500">No data.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.by_category)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => {
                    const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
                    const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta?.color || '#9ca3af' }} />
                        <span className="text-xs text-gray-300 flex-1 truncate">{meta?.label || cat}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta?.color || '#9ca3af' }} />
                        </div>
                        <span className="text-xs font-mono text-gray-400 w-12 text-right">{count} · {pct}%</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded bg-amber-400" /> By Priority
            </h3>
            {Object.keys(stats.by_priority || {}).length === 0 ? (
              <p className="text-xs text-gray-500">No data.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.by_priority)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pri, count]) => {
                    const meta = PRIORITY_META[pri as keyof typeof PRIORITY_META];
                    const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';
                    const dot = meta?.dot || 'bg-gray-500';
                    const colorMap: Record<string, string> = {
                      'bg-gray-500': '#9ca3af',
                      'bg-sky-400': '#38bdf8',
                      'bg-amber-400': '#fbbf24',
                      'bg-orange-400': '#fb923c',
                      'bg-red-500': '#ef4444',
                    };
                    const col = colorMap[dot] || '#9ca3af';
                    return (
                      <div key={pri} className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                        <span className="text-xs text-gray-300 flex-1 truncate">{meta?.label || pri}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col }} />
                        </div>
                        <span className="text-xs font-mono text-gray-400 w-12 text-right">{count} · {pct}%</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default NotificationStats;
