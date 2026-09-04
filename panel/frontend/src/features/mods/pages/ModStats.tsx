import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listMods } from '@/features/mods/api/mods';
import type { Mod } from '@/shared/types/mod';
import {
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

const ModStats: React.FC = () => {
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
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
      setMods(await listMods());
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const filtered = (() => {
      const q = search.trim().toLowerCase();
      let out = mods;
      if (q) {
        out = out.filter((m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.slug || '').toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q)
        );
      }
      if (statusFilter === 'active') out = out.filter((m) => m.active);
      if (statusFilter === 'inactive') out = out.filter((m) => !m.active);
      if (statusFilter === 'pending') out = out.filter((m) => m.pending > 0);
      return out;
    })();
    const active = filtered.filter((m) => m.active).length;
    const pending = filtered.filter((m) => m.pending > 0).length;
    const totalPerms = filtered.reduce((sum, m) => sum + m.permissions.length, 0);
    return { total: filtered.length, active, pending, totalPerms };
  }, [mods, search, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/5 rounded" />)}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fixed top-right pill — "Statistics" title lives in the app header. */}
      <PageActionsPill>
        <SearchDropdown
          value={search}
          onChange={setSearch}
          placeholder="Search mods..."
          ariaLabel="Search mods"
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
            {(statusFilter !== 'all' || search.trim() !== '') && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56">
              <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="w-full glass-field"
                    >
                      <option value="all">All · {mods.length}</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending grants</option>
                    </select>
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

      {/* Stat Cards only - removed all other sections per requirements */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Mods"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M9 2h6l2 4-3 2 3 2-2 4H9l-2-4 3-2-3-2z" /><path d="M12 14v8" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Active Mods"
          value={stats.active}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Pending Grants"
          value={stats.pending}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-amber-300"
          dotColor="bg-amber-400"
        />
        <StatCard
          label="Total Permissions"
          value={stats.totalPerms}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3 7 7 8 3 8 10c0 5-3.4 8.6-8 10z" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
        />
      </div>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default ModStats;
