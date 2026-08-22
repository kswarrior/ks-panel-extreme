import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listMyInstances } from '@/features/auth/api/me';
import type { Instance } from '@/shared/types/instance';
import type { Template } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import {
  DonutStat,
  PieChart,
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { useAuthStore } from '@/shared/stores/authStore';

type StatsFilterKey = 'all' | 'running' | 'stopped' | 'creating' | 'installing' | 'errored' | 'install_failed' | 'destroyed' | 'suspended';

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const InstanceStats: React.FC = () => {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState<Date>(() => new Date());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);

  // Close filter dropdown when clicking outside
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
      const [list, templates] = await Promise.all([listMyInstances(), listTemplates()]);
      setInstances(list);
      setAllTemplates(templates);
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    let running = 0;
    let stopped = 0;
    let creating = 0;
    let installing = 0;
    let errored = 0;
    let installFailed = 0;
    let destroyed = 0;
    let suspended = 0;
    let byNode: Record<string, number> = {};
    let byKind: Record<string, number> = {};

    for (const i of instances) {
      switch (i.status) {
        case 'running': running += 1; break;
        case 'stopped': stopped += 1; break;
        case 'creating': creating += 1; break;
        case 'installing': installing += 1; break;
        case 'errored': errored += 1; break;
        case 'install_failed': installFailed += 1; break;
        case 'destroyed': destroyed += 1; break;
      }
      if (i.suspended === 1) suspended += 1;

      const nodeName = i.node_name || 'Unknown';
      byNode[nodeName] = (byNode[nodeName] || 0) + 1;

      const kind = i.kind || 'unknown';
      byKind[kind] = (byKind[kind] || 0) + 1;
    }
    return { running, stopped, creating, installing, errored, installFailed, destroyed, suspended, total: instances.length, byNode, byKind };
  }, [instances]);

  const greetingName = user?.username || user?.display_name || user?.email || 'there';
  const isEmpty = !loading && instances.length === 0;

  const [statsFilter, setStatsFilter] = useState<StatsFilterKey>('all');

  const filteredInstances = useMemo(() => {
    if (statsFilter === 'all') return instances;
    return instances.filter((i) => i.status === statsFilter);
  }, [instances, statsFilter]);

  const statusSlices = useMemo(() => [
    { label: 'Running', value: stats.running, color: '#34d399' },
    { label: 'Stopped', value: stats.stopped, color: '#9ca3af' },
    { label: 'Creating', value: stats.creating, color: '#fbbf24' },
    { label: 'Installing', value: stats.installing, color: '#38bdf8' },
    { label: 'Errored', value: stats.errored, color: '#f87171' },
    { label: 'Install Failed', value: stats.installFailed, color: '#f87171' },
    { label: 'Destroyed', value: stats.destroyed, color: '#6b7280' },
    { label: 'Suspended', value: stats.suspended, color: '#f87171' },
  ].filter(s => s.value > 0), [stats]);

  const nodeSlices = useMemo(() => 
    Object.entries(stats.byNode)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label,
        value,
        color: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      })),
  [stats.byNode]);

  const kindSlices = useMemo(() =>
    Object.entries(stats.byKind)
      .map(([label, value], i) => ({
        label,
        value,
        color: label === 'docker' ? '#38bdf8' : label === 'lxd' ? '#a78bfa' : label === 'kvm' ? '#f97316' : label === 'multipass' ? '#ec4899' : '#9ca3af',
      })),
  [stats.byKind]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white/5 rounded" />)}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderWithAction
        title="Instance Statistics"
        backHref="/instances"
        backLabel="Instances"
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
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                        <select
                          value={statsFilter}
                          onChange={(e) => setStatsFilter(e.target.value as StatsFilterKey)}
                          className="w-full glass-field"
                        >
                          <option value="all">All · {stats.total}</option>
                          <option value="running">Running · {stats.running}</option>
                          <option value="creating">Creating · {stats.creating}</option>
                          <option value="installing">Installing · {stats.installing}</option>
                          <option value="stopped">Stopped · {stats.stopped}</option>
                          <option value="errored">Errored · {stats.errored}</option>
                          <option value="install_failed">Install Failed · {stats.installFailed}</option>
                          <option value="destroyed">Destroyed · {stats.destroyed}</option>
                          <option value="suspended">Suspended · {stats.suspended}</option>
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

      {/* Key Metrics Strip */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 mb-6">
        <StatCard
          label="Total Instances"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Running"
          value={stats.running}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Creating"
          value={stats.creating}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>}
          color="text-yellow-300"
          dotColor="bg-yellow-400"
        />
        <StatCard
          label="Installing"
          value={stats.installing}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
        />
        <StatCard
          label="Stopped"
          value={stats.stopped}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 15h6" /></svg>}
          color="text-gray-300"
          dotColor="bg-gray-400"
        />
        <StatCard
          label="Errored"
          value={stats.errored}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="text-red-300"
          dotColor="bg-red-400"
        />
        <StatCard
          label="Install Failed"
          value={stats.installFailed}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="text-red-300"
          dotColor="bg-red-400"
        />
        <StatCard
          label="Destroyed"
          value={stats.destroyed}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>}
          color="text-gray-400"
          dotColor="bg-gray-500"
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
          color="text-red-300"
          dotColor="bg-red-400"
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

export default InstanceStats;