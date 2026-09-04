import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMods, getEngineStatus, extractApiErrorMessage } from '@/features/mods/api/mods';
import type { Mod } from '@/shared/types/mod';
import type { ModEngineDiagnostics } from '@/shared/types/mod';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

// ModSchedules — mods have no cron. They run event-driven; the only
// schedule-adjacent state is the engine kill-switch, shown here with
// mod counts so ops can confirm the engine gate at a glance.
const ModSchedules: React.FC = () => {
  const [mods, setMods] = useState<Mod[]>([]);
  const [engine, setEngine] = useState<ModEngineDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, e] = await Promise.all([listMods(), getEngineStatus()]);
      setMods(m);
      setEngine(e);
    } catch (e: any) {
      setError(extractApiErrorMessage(e, 'Failed to load mod engine state'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => ({
    total: mods.length,
    active: mods.filter((m) => m.active).length,
    pending: mods.reduce((n, m) => n + (m.pending || 0), 0),
  }), [mods]);

  if (loading) {
    return <div className="glass-card rounded-xl animate-pulse h-24" />;
  }

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/mods" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Mods">
          Mods
        </Link>
        <Link to="/mods/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Mod statistics">
          Stats
        </Link>
      </PageActionsPill>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <GlassCard className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${engine?.enabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <div className="text-sm">
          <span className="text-gray-400">Engine kill-switch: </span>
          <span className={`font-semibold ${engine?.enabled ? 'text-emerald-300' : 'text-red-300'}`}>
            {engine ? (engine.enabled ? `Enabled (${engine.mode})` : `Disabled (${engine.mode})`) : 'Unknown'}
          </span>
        </div>
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Total Mods" value={counts.total} color="text-white" dotColor="bg-white" />
        <StatCard label="Active" value={counts.active} color="text-emerald-300" dotColor="bg-emerald-400" />
        <StatCard label="Pending Grants" value={counts.pending} color="text-amber-300" dotColor="bg-amber-400" />
      </div>

      <GlassCard>
        <p className="text-sm text-gray-400">
          Mods run event-driven — no cron; engine kill-switch state shown above.
          Toggle the engine from the Mods page.
        </p>
      </GlassCard>
    </div>
  );
};

export default ModSchedules;
