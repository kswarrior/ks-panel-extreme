import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listStacks, getStackEngine, extractStackApiError } from '@/features/stacks/api/stacks';
import type { Stack, StackEngineStatus } from '@/shared/types/stack';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import ErrorState from '@/shared/components/ui/ErrorState';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

// StackSchedules — stacks have no cron. They render on demand (spa bundle or
// simple pages); the only schedule-adjacent state is the engine kill-switch,
// shown here with stack counts so ops can confirm the gate at a glance.
const StackSchedules: React.FC = () => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [engine, setEngine] = useState<StackEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, e] = await Promise.all([listStacks(), getStackEngine().catch(() => null)]);
      setStacks(s);
      setEngine(e);
    } catch (e: any) {
      setError(extractStackApiError(e, 'Failed to load stacks engine state'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => ({
    total: stacks.length,
    active: stacks.filter((s) => s.active).length,
    pending: stacks.reduce((n, s) => n + (s.pending || 0), 0),
  }), [stacks]);

  if (loading) {
    return <div className="glass-card rounded-xl animate-pulse h-24" />;
  }

  if (error) {
    return (
      <ErrorState
        variant="error"
        title="Failed to load stacks engine state"
        description={error}
        retryLabel="Retry"
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/stacks" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Stacks">
          Stacks
        </Link>
        <Link to="/stacks/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Stack statistics">
          Stats
        </Link>
      </PageActionsPill>

      <GlassCard className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${engine?.enabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <div className="text-sm">
          <span className="text-gray-400">Engine kill-switch: </span>
          <span className={`font-semibold ${engine?.enabled ? 'text-emerald-300' : 'text-red-300'}`}>
            {engine ? (engine.enabled ? 'Enabled' : 'Disabled') : 'Unknown'}
          </span>
        </div>
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Total Stacks" value={counts.total} color="text-white" dotColor="bg-white" />
        <StatCard label="Active" value={counts.active} color="text-emerald-300" dotColor="bg-emerald-400" />
        <StatCard label="Pending Grants" value={counts.pending} color="text-amber-300" dotColor="bg-amber-400" />
      </div>

      <GlassCard>
        <p className="text-sm text-gray-400">
          Stacks render on demand — no cron; engine kill-switch state shown above.
          Toggle the engine from the Stacks page.
        </p>
      </GlassCard>
    </div>
  );
};

export default StackSchedules;
