import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInstancePages } from '@/shared/api/admin';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

// InstancePageSchedules — instance pages have no cron. Pages render on
// demand; this page shows the page count and points back at the page
// list and stats views.
const InstancePageSchedules: React.FC = () => {
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTotal((await listInstancePages()).length);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load instance pages'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return <div className="glass-card rounded-xl animate-pulse h-24" />;
  }

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/instance-pages" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Instance pages">
          Pages
        </Link>
        <Link to="/instance-pages/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Page statistics">
          Stats
        </Link>
      </PageActionsPill>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <StatCard label="Total Pages" value={total} color="text-white" dotColor="bg-white" />
        <StatCard label="Scheduled Jobs" value={0} color="text-gray-400" dotColor="bg-gray-600" subLabel="Pages render on demand" />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-1">No schedules</h3>
        <p className="text-sm text-gray-400">
          Instance pages have no cron — they render on demand when opened.
          There is nothing to schedule here.
        </p>
        <div className="mt-3 flex gap-3 text-sm">
          <Link to="/instance-pages" className="text-sky-300 hover:text-sky-200 underline">Manage pages</Link>
          <Link to="/instance-pages/stats" className="text-sky-300 hover:text-sky-200 underline">Page stats</Link>
        </div>
      </GlassCard>
    </div>
  );
};

export default InstancePageSchedules;
