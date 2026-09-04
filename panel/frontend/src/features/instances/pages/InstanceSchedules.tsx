import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInstances } from '@/shared/api/admin';
import { listSnapshotSchedules } from '@/features/instances/api/instanceAdvanced';
import type { SnapshotSchedule } from '@/features/instances/api/instanceAdvanced';
import GlassCard from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

interface ScheduleRow extends SnapshotSchedule {
  instanceName: string;
}

// Snapshot cron schedules live per instance. This page fans out over the
// fleet (capped to avoid a request storm) and aggregates every schedule
// into one table. Manage a schedule from its instance's snapshots tab.
const MAX_INSTANCES = 25;

const InstanceSchedules: React.FC = () => {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const instances = await listInstances();
        const names = new Map(instances.map((i) => [i.id, i.display_name || i.name]));
        const slice = instances.slice(0, MAX_INSTANCES);
        const settled = await Promise.allSettled(
          slice.map((i) => listSnapshotSchedules(i.id)),
        );
        if (!live) return;
        const all: ScheduleRow[] = [];
        settled.forEach((r, idx) => {
          if (r.status !== 'fulfilled') return;
          const inst = slice[idx];
          for (const s of r.value) {
            all.push({ ...s, instance_id: s.instance_id ?? inst.id, instanceName: names.get(inst.id) || `#${inst.id}` });
          }
        });
        setRows(all);
      } catch (e: any) {
        if (live) setErr(e?.response?.data || e?.message || 'Failed to load snapshot schedules');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    enabled: rows.filter((r) => r.enabled).length,
    covered: new Set(rows.map((r) => r.instance_id)).size,
  }), [rows]);

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/instances" className="ks-tab inline-flex items-center justify-center px-2" style={PILL_TAB_STYLE} title="Back to instances">
          ← Instances
        </Link>
        <Link to="/instances/stats" aria-label="Instance Statistics" className="ks-tab inline-flex items-center justify-center" style={PILL_TAB_STYLE} title="View instance statistics dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
      </PageActionsPill>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Snapshot schedules" value={loading ? '…' : stats.total} dotColor="bg-sky-400" />
        <StatCard label="Enabled" value={loading ? '…' : stats.enabled} dotColor="bg-emerald-400" />
        <StatCard label="Instances covered" value={loading ? '…' : stats.covered} dotColor="bg-violet-400" />
      </div>

      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">All snapshot schedules</h3>
        {loading && <div className="rounded-xl animate-pulse h-16 bg-white/5" />}
        {!loading && err && <p className="text-red-400 text-sm">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-sm text-gray-500">No snapshot schedules yet — create one from an instance&apos;s snapshots tab.</p>
        )}
        {!loading && !err && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Schedule</th>
                  <th className="py-1.5 pr-3">Cron</th>
                  <th className="py-1.5 pr-3">Enabled</th>
                  <th className="py-1.5">Instance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.instance_id}-${r.id}`} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-white">{r.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-gray-300">{r.cron}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                    </td>
                    <td className="py-1.5">
                      <Link to={`/instances/${r.instance_id}`} className="text-sky-300 hover:text-sky-200">
                        {r.instanceName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default InstanceSchedules;
