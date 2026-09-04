import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listActivity } from '@/shared/api/admin';
import type { ActivityLog, ActivityCategory } from '@/features/activity/types/activity';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
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
  { key: 'theme', label: 'Theme' },
];

const ActivityPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ActivityCategory | ''>('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as HTMLElement)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

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
      {/* Title lives in the app header ("Activity"); category filter lives in the top-right pill. */}
      <PageActionsPill>
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
            style={PILL_TAB_STYLE}
            aria-label="Filter activity"
            aria-expanded={filterOpen}
            aria-haspopup="true"
            title="Filter by category"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {filter && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56">
              <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as ActivityCategory | '')}
                      className="w-full glass-field"
                    >
                      <option value="">All</option>
                      {CATEGORY_META.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageActionsPill>

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
