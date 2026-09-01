import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listMyInstances } from '@/features/auth/api/me';
import { destroyInstance } from '@/shared/api/admin';
import type { Instance } from '@/shared/types/instance';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import InstanceCard from '@/features/instances/components/InstanceCard';
import GlassCard from '@/shared/components/ui/Card';
import { useAuthStore } from '@/shared/stores/authStore';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PermissionKey } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';

type StatusBucket = 'running' | 'attention' | 'stopped';

const ATTENTION_STATES = new Set(['errored', 'install_failed', 'creating', 'installing']);

const bucketize = (status: string): StatusBucket => {
  if (status === 'running') return 'running';
  if (ATTENTION_STATES.has(status)) return 'attention';
  return 'stopped';
};

const EmptyStateIllustration: React.FC = () => (
  <div className="flex flex-col items-center gap-4">
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="w-20 h-20 text-gray-400"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="11" height="9" rx="1.2" />
      <path d="M3 10h11" opacity="0.5" />
      <circle cx="5.5" cy="8" r="0.7" fill="currentColor" />
      <circle cx="7.5" cy="8" r="0.7" fill="currentColor" opacity="0.5" />
      <rect x="8" y="11" width="11" height="9" rx="1.2" />
      <path d="M8 15h11" opacity="0.5" />
      <circle cx="10.5" cy="13" r="0.7" fill="currentColor" />
      <circle cx="12.5" cy="13" r="0.7" fill="currentColor" opacity="0.5" />
    </svg>
    <p className="text-lg font-medium text-gray-300">No instances yet</p>
  </div>
);

const Instances: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | StatusBucket>('all');
  const [now, setNow] = useState<Date>(() => new Date());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const canManageInstances = permissions.includes(PermissionKey.MANAGE_INSTANCES);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
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
      const list = await listMyInstances();
      setInstances(list);
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The greeting only depends on the local hour, but we tick once a minute
  // so a tab left open doesn't get stuck on yesterday's welcome.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    let running = 0;
    let attention = 0;
    let stopped = 0;
    for (const i of instances) {
      const b = bucketize(i.status);
      if (b === 'running') running += 1;
      else if (b === 'attention') attention += 1;
      else stopped += 1;
    }
    return { running, attention, stopped, total: instances.length };
  }, [instances]);

  const deleteInstanceHandle = async (id: number) => {
    if (!(await confirm({ title: 'Delete instance', message: 'Delete this instance? This action cannot be undone.', tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(id);
    try {
      await destroyInstance(id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete instance');
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateInstance = () => navigate('/instances/new');

  const filtered = useMemo(() => {
    if (filter === 'all') return instances;
    return instances.filter((i) => bucketize(i.status) === filter);
  }, [instances, filter]);

  const greetingName = user?.username || user?.display_name || user?.email || 'there';
  const isEmpty = !loading && instances.length === 0;
  const hasResults = !loading && instances.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Header Bar (like Templates page) ───────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Instances</h2>
        <div className="flex items-center gap-2">
          <SearchDropdown
            value=""
            onChange={() => {}}
            placeholder="Search instances…"
            ariaLabel="Search instances"
          />
          <Link
            to="/instances/stats"
            aria-label="Instance Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View instance statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          {canManageInstances && (
            <button
              onClick={openCreateInstance}
              aria-label="New Instance"
              className="ks-btn-header ks-icon-btn"
              title="New Instance"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          {/* Filter dropdown toggle */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {(filter !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56">
                <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as 'all' | 'running' | 'attention' | 'stopped')}
                        className="w-full glass-field"
                      >
                        <option value="all">All</option>
                        <option value="running">Running</option>
                        <option value="attention">Attention</option>
                        <option value="stopped">Stopped</option>
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
        </div>
      </div>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40 animate-fade-in">
          {error}
        </GlassCard>
      )}

      {loading && <SkeletonGrid count={4} />}

      {!loading && hasResults && filtered.length > 0 && (
        <div id="instance-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((i) => (
            <InstanceCard key={i.id} instance={i} />
          ))}
        </div>
      )}

      {!loading && hasResults && filtered.length === 0 && (
        <GlassCard className="text-center animate-fade-in">
          <div className="mx-auto w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-gray-300 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <p className="text-sm text-white">No instances match this filter.</p>
          <p className="text-xs text-gray-400 mt-1">Try a different status or refresh the page.</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-white/15 bg-white/[0.04] text-white hover:bg-white/10 transition-colors"
          >
            Show everything
          </button>
        </GlassCard>
      )}

      {!loading && isEmpty && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <EmptyStateIllustration />
        </div>
      )}
    </div>
  );
};

export default Instances;
