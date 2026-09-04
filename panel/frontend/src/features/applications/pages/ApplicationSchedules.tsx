import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listApplications, listApplicationRuns } from '@/features/applications/api/applications';
import type { ApplicationRun } from '@/features/applications/api/applications';
import GlassCard from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

interface RunRow extends ApplicationRun {
  appName: string;
}

// Applications run on-demand, but every execution is recorded. This page
// aggregates recent run history across apps (capped to bound requests):
// totals, failures (non-zero exit or error text), and system-triggered
// runs (no user in `triggered_by`) as the closest thing to a schedule.
const MAX_APPS = 20;
const RUNS_PER_APP = 10;

function isFailed(r: ApplicationRun): boolean {
  return r.exit_code !== 0 || r.status === 'failed' || r.status === 'error' || r.error.trim() !== '';
}

const ApplicationSchedules: React.FC = () => {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const apps = await listApplications();
        const names = new Map(apps.map((a) => [a.id, a.name]));
        const slice = apps.slice(0, MAX_APPS);
        const settled = await Promise.allSettled(
          slice.map((a) => listApplicationRuns(a.id, RUNS_PER_APP)),
        );
        if (!live) return;
        const all: RunRow[] = [];
        settled.forEach((r, idx) => {
          if (r.status !== 'fulfilled') return;
          const app = slice[idx];
          for (const run of r.value) {
            all.push({ ...run, appName: names.get(app.id) || `#${app.id}` });
          }
        });
        all.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        setRows(all);
      } catch (e: any) {
        if (live) setErr(e?.response?.data || e?.message || 'Failed to load application runs');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    failed: rows.filter(isFailed).length,
    system: rows.filter((r) => r.triggered_by == null).length,
  }), [rows]);

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/applications" className="ks-tab inline-flex items-center justify-center px-2" style={PILL_TAB_STYLE} title="Back to applications">
          ← Applications
        </Link>
        <Link to="/applications/stats" aria-label="Application Statistics" className="ks-tab inline-flex items-center justify-center" style={PILL_TAB_STYLE} title="View application statistics dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
      </PageActionsPill>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Recent runs" value={loading ? '…' : stats.total} dotColor="bg-sky-400" />
        <StatCard label="Failed runs" value={loading ? '…' : stats.failed} dotColor="bg-red-400" />
        <StatCard label="System-triggered" value={loading ? '…' : stats.system} subLabel="no user trigger" dotColor="bg-violet-400" />
      </div>

      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Recent runs</h3>
        {loading && <div className="rounded-xl animate-pulse h-16 bg-white/5" />}
        {!loading && err && <p className="text-red-400 text-sm">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-sm text-gray-500">No application runs recorded yet — run an app to populate its history.</p>
        )}
        {!loading && !err && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Application</th>
                  <th className="py-1.5 pr-3">Trigger</th>
                  <th className="py-1.5 pr-3">Exit</th>
                  <th className="py-1.5">Started</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.application_id}-${r.id}`} className="border-t border-white/5">
                    <td className="py-1.5 pr-3">
                      <Link to={`/applications/${r.application_id}/configure`} className="text-sky-300 hover:text-sky-200">
                        {r.appName}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-gray-300 text-xs">
                      {r.target}/{r.exec_mode}{r.triggered_by == null ? ' · system' : ''}
                    </td>
                    <td className={`py-1.5 pr-3 font-mono text-xs ${isFailed(r) ? 'text-red-400' : 'text-emerald-300'}`}>
                      {r.exit_code}
                    </td>
                    <td className="py-1.5 text-gray-400 text-xs">{new Date(r.created_at).toLocaleString()}</td>
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

export default ApplicationSchedules;
