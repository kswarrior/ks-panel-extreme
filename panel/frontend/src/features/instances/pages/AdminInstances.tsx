import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listInstances, startInstance, stopInstance, restartInstance, destroyInstance, suspendInstance, unsuspendInstance } from '@/shared/api/admin';
import type { Instance } from '@/shared/types/instance';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import InstanceCard, { CardAction } from '@/features/instances/components/InstanceCard';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import GlassCard from '@/shared/components/ui/Card';

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

type KindKey = 'docker' | 'lxd' | 'kvm' | 'multipass' | 'unknown';
type StatusKey = 'all' | 'running' | 'stopped' | 'creating' | 'installing' | 'errored' | 'install_failed' | 'destroyed';

const Instances: React.FC = () => {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [suspendingId, setSuspendingId] = useState<number | null>(null);

  // Search + filter state
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindKey | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const fmtErr = (reason: any): string => reason?.response?.data || reason?.message || 'unknown';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listInstances();
      setInstances(list);
    } catch (e: any) {
      setError(fmtErr(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const act = async (id: number, action: 'start' | 'stop' | 'restart' | 'destroy') => {
    setBusyId(id);
    try {
      if (action === 'destroy') await destroyInstance(id);
      else if (action === 'start') await startInstance(id);
      else if (action === 'stop') await stopInstance(id);
      else if (action === 'restart') await restartInstance(id);
      await load();
    } catch (e: any) {
      alert(fmtErr(e) || `Failed to ${action} instance`);
    } finally {
      setBusyId(null);
    }
  };

  const suspend = async (instance: Instance, durationHours?: number) => {
    const reason = prompt(`Suspend "${instance.name}"?\n\nReason (required):`);
    if (!reason?.trim()) return;
    setSuspendingId(instance.id);
    try {
      await suspendInstance(instance.id, { reason: reason.trim(), duration_hours: durationHours });
      await load();
    } catch (e: any) {
      alert(fmtErr(e) || 'Failed to suspend instance');
    } finally {
      setSuspendingId(null);
    }
  };

  const unsuspend = async (instance: Instance) => {
    if (!confirm(`Unsuspend "${instance.name}"?`)) return;
    setSuspendingId(instance.id);
    try {
      await unsuspendInstance(instance.id);
      await load();
    } catch (e: any) {
      alert(fmtErr(e) || 'Failed to unsuspend instance');
    } finally {
      setSuspendingId(null);
    }
  };

  const handleEdit = (instance: Instance) => {
    // Open the full Advance-Options-style editor (admin only).
    navigate(`/instances/${instance.id}/edit`);
  };

  const handleDelete = async (instance: Instance) => {
    if (!confirm(`Destroy "${instance.name}"? This runs driver destroy on the edge and removes the row.`)) return;
    setBusyId(instance.id);
    try {
      await destroyInstance(instance.id);
      await load();
    } catch (e: any) {
      alert(fmtErr(e) || 'Failed to destroy instance');
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (i: Instance): CardAction[] => [
    {
      label: 'Edit',
      tone: 'edit',
      onClick: () => { handleEdit(i); },
      disabled: busyId === i.id,
    },
    {
      label: 'Start',
      tone: 'start',
      onClick: () => { act(i.id, 'start'); },
      disabled: busyId === i.id || i.status === 'running',
    },
    {
      label: 'Stop',
      tone: 'stop',
      onClick: () => { act(i.id, 'stop'); },
      disabled: busyId === i.id || i.status === 'stopped',
    },
    {
      label: 'Restart',
      tone: 'restart',
      onClick: () => { act(i.id, 'restart'); },
      disabled: busyId === i.id || i.status !== 'running',
    },
    {
      label: 'Destroy',
      tone: 'destroy',
      onClick: () => { if (confirm(`Destroy "${i.name}"? This runs driver destroy on the edge and removes the row.`)) act(i.id, 'destroy'); },
      busy: busyId === i.id,
      disabled: busyId === i.id,
    },
  ];

  const kindKey = (k: string): KindKey => {
    return (['docker', 'lxd', 'kvm', 'multipass'].includes(k) ? k : 'unknown') as KindKey;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = instances;
    if (q) {
      out = out.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.template_name || '').toLowerCase().includes(q) ||
        (i.node_name || '').toLowerCase().includes(q) ||
        (i.owner_name || '').toLowerCase().includes(q) ||
        (i.external_id || '').toLowerCase().includes(q)
      );
    }
    if (kindFilter !== 'all') out = out.filter((i) => kindKey(i.kind) === kindFilter);
    if (statusFilter !== 'all') out = out.filter((i) => i.status === statusFilter);
    return out;
  }, [instances, search, kindFilter, statusFilter]);

  const resetFilters = () => { setSearch(''); setKindFilter('all'); setStatusFilter('all'); };

  const stats = useMemo(() => {
    let running = 0;
    let stopped = 0;
    let creating = 0;
    let installing = 0;
    let errored = 0;
    let installFailed = 0;
    let destroyed = 0;
    let suspended = 0;
    for (const i of instances) {
      switch (i.status) {
        case 'running': running += 1; break;
        case 'stopped': stopped += 1; break;
        case 'creating': creating += 1; break;
        case 'installing': installing += 1; break;
        case 'errored': errored += 1; break;
        case 'install_failed': installFailed += 1; break;
        case 'destroyed': destroyed += 1; break;
      }
      if (i.suspended === 1) suspended += 1;
    }
    return { running, stopped, creating, installing, errored, installFailed, destroyed, suspended, total: instances.length };
  }, [instances]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Instances</h2>
        <div className="flex items-center gap-2">
          <Link
            to="/instances/stats"
            aria-label="Instance Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View instance statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
{/* Search */}
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, template, node, owner…"
            ariaLabel="Search instances"
          />

          {/* Filter Dropdown - matches SearchDropdown pattern */}
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
              {(kindFilter !== 'all' || statusFilter !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[220px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Driver</label>
                      <select
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All drivers</option>
                        <option value="docker">Docker</option>
                        <option value="lxd">LXD</option>
                        <option value="kvm">KVM</option>
                        <option value="multipass">Multipass</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All statuses</option>
                        <option value="running">Running</option>
                        <option value="stopped">Stopped</option>
                        <option value="creating">Creating</option>
                        <option value="installing">Installing</option>
                        <option value="errored">Errored</option>
                        <option value="install_failed">Install failed</option>
                        <option value="destroyed">Destroyed</option>
                      </select>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setFilterOpen(false); }}
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

          <button
            onClick={() => navigate('/instances/new')}
            aria-label="Deploy new instance"
            className="ks-btn-header ks-icon-btn"
            title="Deploy new instance"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 mb-3 text-sm">{typeof error === 'string' ? error : JSON.stringify(error)}</p>}
      {loading && <SkeletonGrid count={6} />}

{!loading && filtered.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" id="ks-instances-grid">
          {filtered.map((i) => (
            <InstanceCard
              key={i.id}
              id={`ks-instance-${i.id}`}
              instance={i}
              showOwner
              actions={actionsFor(i)}
              onEdit={() => handleEdit(i)}
              onDelete={() => handleDelete(i)}
              onSuspend={suspend}
              onUnsuspend={unsuspend}
              suspendingId={suspendingId}
              deleteDisabled={busyId === i.id}
            />
          ))}
        </div>
       )}

{!loading && filtered.length === 0 && instances.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No instances match your filters.
          <div className="mt-2 flex justify-center">
            <button onClick={resetFilters} aria-label="Clear filters" className="ks-btn-icon ks-icon-btn" title="Clear filters">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
               </svg>
            </button>
          </div>
       </div>
      )}

      {!loading && instances.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <EmptyStateIllustration />
        </div>
      )}
    </div>
  );
};

export default Instances;
