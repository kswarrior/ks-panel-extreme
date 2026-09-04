import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listActivity } from '@/shared/api/admin';
import type { ActivityLog, ActivityCategory } from '@/features/activity/types/activity';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import ActivityCards from '../components/ActivityCards';

// CategoryStyle entry for the filter row — keeps the icon + label + count
// presentable; the full per-card styling lives in ActivityCards to avoid
// duplicate code between this page and the Dashboard's recent strip.
const CATEGORY_META: Array<{ key: ActivityCategory; label: string }> = [
  { key: 'user', label: 'User' },
  { key: 'role', label: 'Role' },
  { key: 'node', label: 'Node' },
  { key: 'template', label: 'Template' },
  { key: 'instance', label: 'Instance' },
  { key: 'api_key', label: 'API Key' },
  { key: 'settings', label: 'Settings' },
  { key: 'auth', label: 'Auth' },
  { key: 'system', label: 'System' },
  { key: 'ai', label: 'AI' },
];

const ActivityPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ActivityCategory | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listActivity(filter || undefined, 200);
      setRows(r);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter chips — only categories that actually appear in the loaded set
  // are shown, so a fresh install shows just "All" instead of a wall of
  // empty buckets.
  const filterChips = useMemo(() => {
    const present = new Set<ActivityCategory>();
    rows.forEach((r) => present.add(r.category));
    return [
      { key: '' as const, label: 'All' },
      ...CATEGORY_META.filter((c) => present.has(c.key)),
    ];
  }, [rows]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-white">Activity</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActivityCategory | '')}
            className="ks-select text-xs bg-black/30 border border-white/10 rounded-md px-2 py-1 text-gray-200"
          >
            <option value="">All</option>
            {CATEGORY_META.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Count + last refresh line */}
      {rows.length > 0 && (
        <div className="mb-3 text-xs text-gray-500">
          showing {rows.length} event{rows.length === 1 ? '' : 's'}
          {filter && ` · filtered to "${filter}"`}
        </div>
      )}

      {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}

      {/* Loading */}
      {loading && <SkeletonGrid count={6} />}

      {/* Cards */}
      {!loading && rows.length > 0 && <ActivityCards rows={rows} />}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          <div className="flex flex-col items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-10 h-10 text-gray-600">
              <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
             </svg>
            <div>
              <p className="text-gray-300">No activity recorded yet.</p>
              <p className="text-xs text-gray-500 mt-1">
                Audit rows are written automatically when admins perform create /
                update / delete actions, log in, or run an edge probe.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
