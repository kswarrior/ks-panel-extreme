import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotificationPrefs, getNotificationStats } from '../api/notifications';
import type { NotificationPrefs, NotificationStats } from '../types/notification';
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

const MODE_META: Record<string, { label: string; color: string; dot: string }> = {
  realtime: { label: 'Realtime', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  digest: { label: 'Digest', color: 'text-amber-300', dot: 'bg-amber-400' },
  off: { label: 'Off', color: 'text-gray-400', dot: 'bg-gray-600' },
};

// NotificationSchedules — the digest preference IS the schedule: prefs
// mode realtime/digest/off decides whether notifications arrive instantly
// or batched. Stats show the queue the schedule drains.
const NotificationSchedules: React.FC = () => {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s] = await Promise.all([getNotificationPrefs(), getNotificationStats()]);
      setPrefs(p);
      setStats(s);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load notification schedule state'));
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

  const meta = MODE_META[prefs?.mode || ''] || MODE_META.off;

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/notifications" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Notifications">
          Inbox
        </Link>
        <Link to="/notifications/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Notification statistics">
          Stats
        </Link>
        <Link to="/notifications/broadcast" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Broadcast">
          Broadcast
        </Link>
      </PageActionsPill>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <GlassCard className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
        <div className="text-sm">
          <span className="text-gray-400">Delivery mode: </span>
          <span className={`font-semibold ${meta.color}`}>{prefs ? meta.label : 'Unknown'}</span>
          {prefs?.last_digest_at && (
            <span className="ml-2 text-xs text-gray-500">
              last digest {new Date(prefs.last_digest_at).toLocaleString()}
            </span>
          )}
        </div>
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Total" value={stats?.total ?? 0} color="text-white" dotColor="bg-white" />
        <StatCard label="Unread" value={stats?.unread ?? 0} color="text-sky-300" dotColor="bg-sky-400" />
        <StatCard label="Broadcast" value={stats?.broadcast ?? 0} color="text-violet-300" dotColor="bg-violet-400" />
      </div>

      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-1">Digest schedule</h3>
        <p className="text-sm text-gray-400">
          Digest mode batches notifications into a periodic summary instead of
          delivering them in realtime; off mutes delivery entirely. Change the
          mode from the Notifications inbox preferences.
        </p>
      </GlassCard>
    </div>
  );
};

export default NotificationSchedules;
