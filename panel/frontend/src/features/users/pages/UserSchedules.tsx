import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRoles, listUsers } from '@/shared/api/admin';
import GlassCard from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

const WEEK_MS = 7 * 86_400_000;

// Users authenticate and act — they have no per-user cron schedules.
// This page shows account-shape stats over the same user/role data the
// list page uses, with an honest empty state for the schedule itself.
const UserSchedules: React.FC = () => {
  const [total, setTotal] = useState<number | null>(null);
  const [suspended, setSuspended] = useState(0);
  const [recent, setRecent] = useState(0);
  const [roles, setRoles] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [users, roleRows] = await Promise.all([listUsers(), listRoles()]);
        if (!live) return;
        setTotal(users.length);
        setSuspended(users.filter((u) => (u.suspended ?? 0) > 0).length);
        setRecent(users.filter((u) => Date.now() - new Date(u.created_at).getTime() < WEEK_MS).length);
        setRoles(roleRows.length);
      } catch (e: any) {
        if (live) setErr(e?.response?.data || e?.message || 'Failed to load users');
      }
    })();
    return () => { live = false; };
  }, []);

  const loading = useMemo(() => total === null, [total]);

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/users" className="ks-tab inline-flex items-center justify-center px-2" style={PILL_TAB_STYLE} title="Back to users">
          ← Users
        </Link>
        <Link to="/users/stats" aria-label="User Statistics" className="ks-tab inline-flex items-center justify-center" style={PILL_TAB_STYLE} title="View user statistics dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
      </PageActionsPill>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Total users" value={loading ? '…' : total!} dotColor="bg-sky-400" />
        <StatCard label="Suspended" value={loading ? '…' : suspended} dotColor="bg-red-400" />
        <StatCard label="Joined last 7d" value={loading ? '…' : recent} dotColor="bg-emerald-400" />
      </div>

      <GlassCard className="p-6 text-center space-y-3">
        <p className="text-2xl">🕰️</p>
        <h3 className="text-lg font-semibold text-white">No per-user cron schedules</h3>
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          Users don&apos;t run on a schedule — sessions, suspensions and role
          grants all apply immediately
          {roles !== null && <> across <span className="text-gray-200 font-medium">{roles}</span> roles</>}.
        </p>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex items-center justify-center gap-2 pt-1">
          <Link to="/users" className="ks-primary-btn px-3 py-1.5 rounded text-sm">
            Manage users
          </Link>
          <Link to="/users/stats" className="ks-ghost-btn px-3 py-1.5 rounded text-sm">
            User statistics
          </Link>
        </div>
      </GlassCard>
    </div>
  );
};

export default UserSchedules;
