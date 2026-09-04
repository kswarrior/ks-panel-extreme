import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAdminApiKeys } from '@/shared/api/admin';
import type { ApiKey } from '@/shared/types/apiKey';
import GlassCard from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

const DAY_MS = 86_400_000;

function daysLeft(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);
}

// API keys don't run on cron — but every key has an expiry, which IS a
// schedule of sorts. This page is a rotation view: which keys are dead,
// which need rotating soon, and which never expire.
const ApiKeySchedules: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const rows = await listAdminApiKeys();
        if (live) setKeys(rows);
      } catch (e: any) {
        if (live) setErr(e?.response?.data || e?.message || 'Failed to load API keys');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const buckets = useMemo(() => {
    const expired: ApiKey[] = [];
    const week: ApiKey[] = [];
    const month: ApiKey[] = [];
    let never = 0;
    for (const k of keys) {
      if (!k.expires_at) { never += 1; continue; }
      const d = daysLeft(k.expires_at);
      if (d < 0) expired.push(k);
      else if (d <= 7) week.push(k);
      else if (d <= 30) month.push(k);
    }
    return { expired, week, month, never };
  }, [keys]);

  const expiring = useMemo(
    () => [...buckets.expired, ...buckets.week, ...buckets.month]
      .sort((a, b) => daysLeft(a.expires_at!) - daysLeft(b.expires_at!)),
    [buckets],
  );

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/api-keys" className="ks-tab inline-flex items-center justify-center px-2" style={PILL_TAB_STYLE} title="Back to API keys">
          ← API keys
        </Link>
        <Link to="/api-keys/stats" aria-label="API Key Statistics" className="ks-tab inline-flex items-center justify-center" style={PILL_TAB_STYLE} title="View API key statistics dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
      </PageActionsPill>

      <p className="text-xs text-gray-500">Keys don&apos;t run on cron — this is a rotation schedule view driven by key expiry.</p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Expired" value={loading ? '…' : buckets.expired.length} dotColor="bg-red-400" />
        <StatCard label="Expiring ≤ 7d" value={loading ? '…' : buckets.week.length} dotColor="bg-amber-400" />
        <StatCard label="Expiring ≤ 30d" value={loading ? '…' : buckets.month.length} dotColor="bg-sky-400" />
        <StatCard label="Never expires" value={loading ? '…' : buckets.never} dotColor="bg-gray-500" />
      </div>

      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Keys needing rotation</h3>
        {loading && <div className="rounded-xl animate-pulse h-16 bg-white/5" />}
        {!loading && err && <p className="text-red-400 text-sm">{err}</p>}
        {!loading && !err && expiring.length === 0 && (
          <p className="text-sm text-gray-500">Nothing expiring in the next 30 days — rotation schedule is clear.</p>
        )}
        {!loading && !err && expiring.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3">Key</th>
                  <th className="py-1.5 pr-3">Expires</th>
                  <th className="py-1.5">Days left</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((k) => {
                  const d = daysLeft(k.expires_at!);
                  return (
                    <tr key={k.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3">
                        <Link to={`/api-key/${k.id}`} className="text-sky-300 hover:text-sky-200">
                          {k.display_name || k.name}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-gray-300">{new Date(k.expires_at!).toLocaleDateString()}</td>
                      <td className={`py-1.5 font-mono text-xs ${d < 0 ? 'text-red-400' : d <= 7 ? 'text-amber-300' : 'text-gray-300'}`}>
                        {d < 0 ? `expired ${-d}d ago` : `${d}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default ApiKeySchedules;
