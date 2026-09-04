import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRoles } from '@/shared/api/admin';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

// Roles are permission grants evaluated at request time — there is no
// cron scheduler behind them, so this page is an honest empty state.
const RoleSchedules: React.FC = () => {
  const [total, setTotal] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows = await listRoles();
        if (live) setTotal(rows.length);
      } catch (e: any) {
        if (live) setErr(e?.response?.data || e?.message || 'Failed to load roles');
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/roles" className="ks-tab inline-flex items-center justify-center px-2" style={PILL_TAB_STYLE} title="Back to roles">
          ← Roles
        </Link>
        <Link to="/roles/stats" aria-label="Role Statistics" className="ks-tab inline-flex items-center justify-center" style={PILL_TAB_STYLE} title="View role statistics dashboard">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
      </PageActionsPill>

      <GlassCard className="p-6 text-center space-y-3">
        <p className="text-2xl">🕰️</p>
        <h3 className="text-lg font-semibold text-white">Roles have no cron schedules</h3>
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          A role is a static set of permission grants checked on every
          request — nothing runs on a timer, and membership changes take
          effect on the next request without any scheduled job
          {total !== null && <> — <span className="text-gray-200 font-medium">{total}</span> role{total === 1 ? '' : 's'} defined</>}.
        </p>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex items-center justify-center gap-2 pt-1">
          <Link to="/roles" className="ks-primary-btn px-3 py-1.5 rounded text-sm">
            Manage roles
          </Link>
          <Link to="/roles/stats" className="ks-ghost-btn px-3 py-1.5 rounded text-sm">
            Role statistics
          </Link>
        </div>
      </GlassCard>
    </div>
  );
};

export default RoleSchedules;
