import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';
import type { Theme } from '@/features/themes/types/theme';
import {
  DonutStat,
  PieChart,
  AreaChartWidget,
  TimeSeriesChart,
  DashboardSection,
  DashboardGrid,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

type OriginKey = 'builtin' | 'global' | 'local';

const OriginMeta: Record<OriginKey, { label: string; color: string }> = {
  builtin: { label: 'Built-in', color: '#38bdf8' },
  global: { label: 'Global', color: '#a78bfa' },
  local: { label: 'Personal', color: '#34d399' },
};

const ThemeStats: React.FC = () => {
  const navigate = useNavigate();
  const themes = useThemeStore((s) => s.themes);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const assignments = useThemeStore((s) => s.assignments);
  const globalAssignments = useThemeStore((s) => s.globalAssignments);
  const loadGlobal = useThemeStore((s) => s.loadGlobal);
  const loadStore = useThemeStore((s) => s.load);
  const editDraft = useThemeStore((s) => s.editDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [filterOpen, setFilterOpen] = useState(false);
  const [originFilter, setOriginFilter] = useState<'all' | OriginKey>('all');
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
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

  useEffect(() => {
    const loadData = async () => {
      try {
        await loadStore();
        await loadGlobal();
      } catch (e: any) {
        setError(e?.response?.data || e?.message || 'Failed to load theme data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [loadStore, loadGlobal]);

  const scopesFor = useCallback((themeId: string): string[] => {
    const out: string[] = [];
    for (const [scope, tid] of Object.entries(assignments)) if (tid === themeId) out.push(scope);
    for (const [scope, tid] of Object.entries(globalAssignments)) if (tid === themeId) out.push(scope);
    return Array.from(new Set(out));
  }, [assignments, globalAssignments]);

  const allThemes = useMemo(() => {
    const map = new Map<string, { theme: Theme; origin: OriginKey }>();
    for (const t of globalThemes) map.set(t.id, { theme: t, origin: 'global' });
    for (const t of themes) map.set(t.id, { theme: t, origin: t.builtin ? 'builtin' : 'local' });
    if (!map.has('default')) {
      const def = themes.find((t) => t.id === 'default');
      if (def) map.set('default', { theme: def, origin: 'builtin' });
    }
    const q = search.trim().toLowerCase();
    let rows = Array.from(map.values());
    if (q) {
      rows = rows.filter(({ theme: t }) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [themes, globalThemes, search]);

  const stats = useMemo(() => {
    const total = allThemes.length;
    const builtin = allThemes.filter((x) => x.origin === 'builtin').length;
    const global = allThemes.filter((x) => x.origin === 'global').length;
    const local = allThemes.filter((x) => x.origin === 'local').length;
    const assigned = allThemes.filter((x) => scopesFor(x.theme.id).length > 0).length;
    const unassigned = total - assigned;
    const defaultTheme = allThemes.find((x) => x.theme.id === 'default') ? 1 : 0;
    return { total, builtin, global, local, assigned, unassigned, defaultTheme };
  }, [allThemes, scopesFor]);

  const originSlices = useMemo(() => [
    { label: 'Built-in', value: stats.builtin, color: '#38bdf8' },
    { label: 'Global', value: stats.global, color: '#a78bfa' },
    { label: 'Personal', value: stats.local, color: '#34d399' },
  ].filter((s) => s.value > 0), [stats]);

  const assignmentSlices = useMemo(() => [
    { label: 'Assigned', value: stats.assigned, color: '#34d399' },
    { label: 'Unassigned', value: stats.unassigned, color: '#9ca3af' },
  ].filter((s) => s.value > 0), [stats]);

  const topThemesByScopes = useMemo(() => {
    let rows = [...allThemes]
      .map(({ theme: t, origin }) => ({ theme: t, origin, scopeCount: scopesFor(t.id).length }));
    if (originFilter !== 'all') rows = rows.filter((r) => r.origin === originFilter);
    if (assignedFilter !== 'all') {
      rows = rows.filter((r) => assignedFilter === 'assigned' ? r.scopeCount > 0 : r.scopeCount === 0);
    }
    return rows.sort((a, b) => b.scopeCount - a.scopeCount).slice(0, 10);
  }, [allThemes, scopesFor, originFilter, assignedFilter]);

  // Real creation history from theme creation times
  const creationHistory = useMemo(() => {
    const now = Date.now();
    const buckets = 24;
    const bucketSize = 3600000; // 1 hour
    const counts = new Array(buckets).fill(0);

    allThemes.forEach(({ theme: t }) => {
      if (t.created_at) {
        const created = new Date(t.created_at).getTime();
        const hoursAgo = Math.floor((now - created) / bucketSize);
        if (hoursAgo >= 0 && hoursAgo < buckets) {
          counts[buckets - 1 - hoursAgo]++;
        }
      }
    });

    return counts.map((v, i) => ({
      t: now - (buckets - i) * bucketSize,
      v,
    }));
  }, [allThemes]);

  // Real update history from theme updated times
  const updateHistory = useMemo(() => {
    const now = Date.now();
    const buckets = 24;
    const bucketSize = 3600000; // 1 hour
    const counts = new Array(buckets).fill(0);

    allThemes.forEach(({ theme: t }) => {
      if (t.updated_at) {
        const updated = new Date(t.updated_at).getTime();
        const hoursAgo = Math.floor((now - updated) / bucketSize);
        if (hoursAgo >= 0 && hoursAgo < buckets) {
          counts[buckets - 1 - hoursAgo]++;
        }
      }
    });

    return counts.map((v, i) => ({
      t: now - (buckets - i) * bucketSize,
      v,
    }));
  }, [allThemes]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/10 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/10 rounded" />)}
          </div>
          <div className="h-64 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderWithAction
        title="Theme Statistics"
        backHref="/themes"
        backLabel="Themes"
        action={
          <div className="flex items-center gap-2">
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
                aria-label="Open filters"
                aria-expanded={filterOpen}
                aria-haspopup="true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {(originFilter !== 'all' || assignedFilter !== 'all') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                )}
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-56">
                  <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Origin</label>
                        <select
                          value={originFilter}
                          onChange={(e) => setOriginFilter(e.target.value as any)}
                          className="w-full glass-field"
                        >
                          <option value="all">All · {stats.total}</option>
                          <option value="builtin">Built-in · {stats.builtin}</option>
                          <option value="global">Global · {stats.global}</option>
                          <option value="local">Personal · {stats.local}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Assignment</label>
                        <select
                          value={assignedFilter}
                          onChange={(e) => setAssignedFilter(e.target.value as any)}
                          className="w-full glass-field"
                        >
                          <option value="all">All</option>
                          <option value="assigned">Assigned · {stats.assigned}</option>
                          <option value="unassigned">Unassigned · {stats.unassigned}</option>
                        </select>
                      </div>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setOriginFilter('all'); setAssignedFilter('all'); }}
                          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                        >
                          Reset
                        </button>
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
          </div>
        }
      />

      {/* Key Metrics Strip */}
      <DashboardGrid columns={4} className="mb-6">
        <StatCard
          label="Total Themes"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Assigned"
          value={stats.assigned}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Global"
          value={stats.global}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-indigo-300"
          dotColor="bg-indigo-400"
        />
        <StatCard
          label="Personal"
          value={stats.local}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
      </DashboardGrid>

      {/* Overview Charts */}
      <DashboardSection title="Overview" className="space-y-4">
        <DashboardGrid columns={3}>
          <DonutStat
            label="Assigned Themes"
            value={stats.total > 0 ? (stats.assigned / stats.total) * 100 : 0}
            color="#34d399"
            subLabel={`${stats.assigned} of ${stats.total}`}
            size={140}
          />
          <DonutStat
            label="Global Themes"
            value={stats.total > 0 ? (stats.global / stats.total) * 100 : 0}
            color="#a78bfa"
            subLabel={`${stats.global} of ${stats.total}`}
            size={140}
          />
          <DonutStat
            label="Personal Themes"
            value={stats.total > 0 ? (stats.local / stats.total) * 100 : 0}
            color="#38bdf8"
            subLabel={`${stats.local} of ${stats.total}`}
            size={140}
          />
        </DashboardGrid>

        {allThemes.length > 0 && (
          <DashboardGrid columns={3}>
            <PieChart slices={originSlices} title="Theme Origins" centerLabel={`${stats.total} themes`} size={180} />
            <PieChart slices={assignmentSlices} title="Assignments" centerLabel={`${stats.total} themes`} size={180} />
          </DashboardGrid>
        )}
      </DashboardSection>

      {/* Key Metrics */}
      <DashboardSection title="Theme Configuration Metrics" className="space-y-4">
        <DashboardGrid columns={4}>
          <GlassCard className="ks-stat-card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-300">{stats.assigned}</p>
            <p className="text-xs text-gray-400">Assigned</p>
            <p className="text-xs text-sky-300 mt-1">{stats.unassigned} unassigned</p>
          </GlassCard>
          <GlassCard className="ks-stat-card p-4 text-center">
            <p className="text-2xl font-bold text-indigo-300">{stats.global}</p>
            <p className="text-xs text-gray-400">Global</p>
            <p className="text-xs text-sky-300 mt-1">Server-wide</p>
          </GlassCard>
          <GlassCard className="ks-stat-card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-300">{stats.local}</p>
            <p className="text-xs text-gray-400">Personal</p>
            <p className="text-xs text-sky-300 mt-1">Local only</p>
          </GlassCard>
          <GlassCard className="ks-stat-card p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-gray-400">Total Themes</p>
            <p className="text-xs text-sky-300 mt-1">{stats.builtin} built-in</p>
          </GlassCard>
        </DashboardGrid>
      </DashboardSection>

      {/* Activity Trends */}
      <DashboardSection title="Activity Trends (24h)" className="space-y-4">
        <DashboardGrid columns={2}>
          <AreaChartWidget samples={creationHistory} label="Themes Created" color="#34d399" unit="" max={Math.max(10, stats.total)} />
          <AreaChartWidget samples={updateHistory} label="Themes Updated" color="#38bdf8" unit="" max={Math.max(10, stats.total)} />
        </DashboardGrid>
      </DashboardSection>

      {/* Combined activity chart */}
      <DashboardSection title="Combined Activity View" className="space-y-4">
        <TimeSeriesChart
          data={[
            { name: 'Created', data: creationHistory, color: '#34d399' },
            { name: 'Updated', data: updateHistory, color: '#38bdf8' },
          ]}
          label="Theme Activity"
          unit=""
          max={Math.max(10, stats.total)}
        />
      </DashboardSection>

      {/* Top Themes by Assignments */}
      <DashboardSection title="Top Themes by Page Assignments" className="space-y-4">
        {topThemesByScopes.length > 0 ? (
          <DashboardGrid columns={1}>
            <GlassCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="p-3">Theme</th>
                      <th className="p-3">Origin</th>
                      <th className="p-3">ID</th>
                      <th className="p-3">Built-in</th>
                      <th className="p-3">Assignments</th>
                      <th className="p-3">Scopes</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topThemesByScopes.map(({ theme: t, origin, scopeCount }) => {
                      const scopes = scopesFor(t.id);
                      return (
                        <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="p-3">
                            <span className="font-medium text-white truncate block max-w-xs">{t.name}</span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${origin === 'builtin' ? 'bg-sky-900/60 text-sky-200 border-sky-700/60' : origin === 'global' ? 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60' : 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60'}`}>
                              {OriginMeta[origin].label}
                            </span>
                          </td>
                          <td className="p-3 text-gray-400 font-mono text-xs">{t.id}</td>
                          <td className="p-3 text-center">
                            {t.builtin ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-900/30 text-sky-300">Yes</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700/30 text-gray-400">No</span>
                            )}
                          </td>
                          <td className="p-3 text-center text-emerald-300 font-semibold">{scopeCount}</td>
                          <td className="p-3 text-center text-gray-300 text-xs">
                            {scopes.slice(0, 3).join(' · ')}
                            {scopes.length > 3 && <span className="text-gray-500"> · +{scopes.length - 3} more</span>}
                          </td>
                          <td className="p-3 text-right">
                            {t.builtin ? (
                              <span className="text-xs text-gray-500" title="Built-in theme is read-only">Read-only</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { editDraft(t); navigate('/themes/studio'); }}
                                className="text-sky-400 hover:text-sky-200 text-sm"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </DashboardGrid>
        ) : (
          <GlassCard className="text-center py-8 text-gray-500">
            <p className="text-sm">No themes yet.</p>
          </GlassCard>
        )}
      </DashboardSection>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default ThemeStats;