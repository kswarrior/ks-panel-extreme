import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listApplications } from '@/features/applications/api/applications';
import type { Application } from '@/features/applications/types/application';
import {
  DonutStat,
  PieChart,
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { appCategoryMeta, appRuntimeMeta, appCapabilityMeta } from '@/features/applications/types/application';

const ApplicationStats: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      setApps(await listApplications());
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const active = apps.filter((a) => a.active).length;
    const pending = apps.filter((a) => a.pending > 0).length;
    const totalPerms = apps.reduce((sum, a) => sum + a.permission_rows.length, 0);
    const totalGranted = apps.reduce((sum, a) => sum + a.permission_rows.filter((p) => p.granted).length, 0);
    const byCategory = apps.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const byRuntime = apps.reduce((acc, a) => {
      acc[a.runtime] = (acc[a.runtime] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total: apps.length, active, inactive: apps.length - active, pending, totalPerms, totalGranted, byCategory, byRuntime };
  }, [apps]);

  const statusSlices = useMemo(() => [
    { label: 'Active', value: stats.active, color: '#34d399' },
    { label: 'Inactive', value: stats.inactive, color: '#9ca3af' },
    { label: 'Pending Grants', value: stats.pending, color: '#fbbf24' },
  ].filter((s) => s.value > 0), [stats]);

  const categorySlices = useMemo(() =>
    Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label: appCategoryMeta(label)?.label || label,
        value,
        color: appCategoryMeta(label)?.color || ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      })),
  [stats.byCategory]);

  const runtimeSlices = useMemo(() =>
    Object.entries(stats.byRuntime)
      .map(([label, value], i) => ({
        label: appRuntimeMeta(label)?.label || label,
        value,
        color: appRuntimeMeta(label)?.color || ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      })),
  [stats.byRuntime]);

  const permissionSlices = useMemo(() => {
    const capCounts: Record<string, number> = {};
    apps.forEach((a) => {
      a.permission_rows.forEach((p) => {
        capCounts[p.capability] = (capCounts[p.capability] || 0) + 1;
      });
    });
    return Object.entries(capCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label: appCapabilityMeta(label)?.label || label,
        value,
        color: appCapabilityMeta(label)?.color || ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      }));
  }, [apps]);

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
      <HeaderWithAction
        title="Application Statistics"
        backHref="/applications"
        backLabel="Applications"
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
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-56">
                  <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">State</label>
                        <select className="w-full glass-field">
                          <option value="all">All · {stats.total}</option>
                          <option value="active">Active · {stats.active}</option>
                          <option value="inactive">Inactive · {stats.inactive}</option>
                          <option value="pending">Pending · {stats.pending}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                        <select className="w-full glass-field">
                          <option value="all">All categories</option>
                          {Object.keys(stats.byCategory).map((c) => (
                            <option key={c} value={c}>{appCategoryMeta(c)?.label || c} · {stats.byCategory[c]}</option>
                          ))}
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
          </div>
        }
      />

      {/* Stat Cards only - removed all other sections per requirements */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Applications"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Active Applications"
          value={stats.active}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
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

export default ApplicationStats;