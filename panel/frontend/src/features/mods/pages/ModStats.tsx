import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMods } from '@/features/mods/api/mods';
import type { Mod } from '@/shared/types/mod';
import {
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { modSourceMeta, modCapabilityMeta } from '@/shared/types/mod';

const ModStats: React.FC = () => {
  const navigate = useNavigate();
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    const active = mods.filter((m) => m.active).length;
    const inactive = mods.filter((m) => !m.active).length;
    const pending = mods.filter((m) => m.pending > 0).length;
    const totalPerms = mods.reduce((sum, m) => sum + m.permissions.length, 0);
    const totalGranted = mods.reduce((sum, m) => sum + m.permissions.filter((p) => p.granted).length, 0);
    const bySource = mods.reduce((acc, m) => {
      const src = m.source || 'file';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total: mods.length, active, inactive, pending, totalPerms, totalGranted, bySource };
  }, [mods]);

  const statusSlices = useMemo(() => [
    { label: 'Active', value: stats.active, color: '#34d399' },
    { label: 'Inactive', value: stats.inactive, color: '#9ca3af' },
    { label: 'Pending Grants', value: stats.pending, color: '#fbbf24' },
  ].filter((s) => s.value > 0), [stats]);

  const sourceSlices = useMemo(() =>
    Object.entries(stats.bySource)
      .map(([label, value], i) => ({
        label: modSourceMeta(label)?.label || label,
        value,
        color: (modSourceMeta(label)?.dot || ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8]).replace('bg-', ''),
      })),
  [stats.bySource]);

  const permissionSlices = useMemo(() => {
    const capCounts: Record<string, number> = {};
    mods.forEach((m) => {
      m.permissions.forEach((p) => {
        capCounts[p.capability] = (capCounts[p.capability] || 0) + 1;
      });
    });
    return Object.entries(capCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label: modCapabilityMeta(label)?.label || label,
        value,
        color: (modCapabilityMeta(label)?.dot || ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8]).replace('bg-', ''),
      }));
  }, [mods]);

  const topModsByPerms = useMemo(() =>
    [...mods]
      .sort((a, b) => b.permissions.length - a.permissions.length)
      .slice(0, 10),
  [mods]);

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
        title="Mod Statistics"
        backHref="/mods"
        backLabel="Mods"
      />

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