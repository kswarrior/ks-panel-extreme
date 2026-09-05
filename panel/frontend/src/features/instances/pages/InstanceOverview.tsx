// InstanceOverview.tsx — full instance page behind the floating menu's
// "More" link (route slug `overview`, a native built-in like Ports / SFTP /
// Snapshots — not a custom spec.pages entry).
//
// It gathers everything the floating menu holds plus full-page extras:
//   • header with name + status / kind badges,
//   • tabs: Resources (live CPU / RAM / disk graphs, System-page style),
//     Details (the menu's own status row + power controls + actions, plus
//     an info grid), Manage (rename, advanced links, reinstall, delete).

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import { useLiveMetrics, type LivePoint } from '../hooks/useLiveMetrics';
import {
  destroyInstance,
  reinstallInstance,
  updateInstanceIdentity,
} from '@/shared/api/admin';
import InstancePowerMenu from '../components/InstancePowerMenu';
import InstanceInfoRow from '../components/InstanceInfoRow';
import { KindIcon } from '../components/InstanceFormComponents';
import { KIND_META, kindKey } from '../types/instanceForm';
import { AreaChart, DonutChart, type MetricSample } from '@/shared/components/ui/MetricsChart';
import { Sparkline, fmtBytes, fmtPct } from '@/features/system/components/SystemCharts';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-400',
  stopped: 'bg-gray-500',
  creating: 'bg-yellow-400',
  installing: 'bg-sky-400',
  errored: 'bg-red-400',
  install_failed: 'bg-red-400',
  destroyed: 'bg-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  stopped: 'Stopped',
  creating: 'Creating',
  installing: 'Installing',
  errored: 'Errored',
  install_failed: 'Install failed',
  destroyed: 'Destroyed',
};

type TabId = 'resources' | 'details' | 'manage';

const TABS: { id: TabId; label: string }[] = [
  { id: 'resources', label: 'Resources' },
  { id: 'details', label: 'Details' },
  { id: 'manage', label: 'Manage' },
];

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

const InstanceOverview: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { instance, loading, error, reload } = useInstance(instanceId);
  const permissions = useAuthStore((s) => s.permissions);
  const [tab, setTab] = useState<TabId>('resources');
  const [rename, setRename] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameMsg, setRenameMsg] = useState('');
  const [reinstallBusy, setReinstallBusy] = useState(false);
  const [reinstallMsg, setReinstallMsg] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );

  const status = instance?.status ?? '';
  const isRunning = status === 'running';

  // Keep the header live: the Controls card reloads its own row copy, so
  // silently refresh ours every 5s while mounted.
  useEffect(() => {
    const t = window.setInterval(() => {
      void reload(true);
    }, 5000);
    return () => window.clearInterval(t);
  }, [reload]);

  // Seed the rename box from the row once it loads.
  useEffect(() => {
    if (instance) setRename(instance.display_name || '');
  }, [instance?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live metrics stream (shared hook — same feed the Home tiles and the
  // floating menu's status row read): history ring for graphs plus the
  // latest point for tiles, with 403 backoff when the instance exposes no
  // metrics page.
  const { latest: last, history: hist } = useLiveMetrics(instanceId, isRunning);

  const cpuSamples = useMemo<MetricSample[]>(
    () => hist.filter((h) => h.cpu !== null).map((h) => ({ t: h.t, v: h.cpu as number })),
    [hist],
  );
  const ramSamples = useMemo<MetricSample[]>(
    () => hist.filter((h) => h.ramPct !== null).map((h) => ({ t: h.t, v: h.ramPct as number })),
    [hist],
  );
  const recentCPU = useMemo(() => hist.map((h) => h.cpu ?? 0), [hist]);
  const recentRAM = useMemo(() => hist.map((h) => h.ramPct ?? 0), [hist]);

  // Latest absolute byte counts ride along on the newest history point.
  const liveBytes = {
    memUsed: last?.memUsed ?? null,
    memTotal: last?.memTotal ?? null,
    diskUsed: last?.diskUsed ?? null,
    diskTotal: last?.diskTotal ?? null,
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
        <div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" />
        <div className="h-5 w-1/3 bg-neutral-800 rounded" />
      </div>
    );
  }
  if (!instance || error) {
    return <div className="glass-card rounded-xl text-red-400 text-sm">{error || 'Instance not found'}</div>;
  }

  const k = kindKey(instance.kind);
  const typeLabel = KIND_META[k]?.label || instance.kind || '—';
  const typeBadge = KIND_META[k]?.badge || '';
  const displayName = instance.display_name || instance.name;
  const dot = STATUS_DOT[status] || 'bg-gray-500';
  const statusLabel = STATUS_LABEL[status] || status || '—';
  const diskPct = last?.diskPct ?? 0;

  const onRename = async () => {
    if (!canControl || renameBusy) return;
    setRenameBusy(true);
    setRenameMsg('');
    try {
      await updateInstanceIdentity(instanceId, {
        display_name: rename.trim(),
        icon: instance.icon || '',
        color: instance.color || '',
      });
      await reload(true);
      setRenameMsg('Display name saved.');
    } catch (e: any) {
      setRenameMsg(e?.response?.data || e?.message || 'Failed to rename');
    } finally {
      setRenameBusy(false);
    }
  };

  const onReinstall = async () => {
    if (!canControl || reinstallBusy) return;
    const ok = await confirm({
      title: 'Reinstall instance',
      message: `Wipe "${displayName}" and redeploy it from the stored spec? ALL data inside the workload will be lost.`,
      tone: 'danger',
      confirmLabel: 'Reinstall',
    });
    if (!ok) return;
    setReinstallBusy(true);
    setReinstallMsg('');
    try {
      await reinstallInstance(instanceId);
      await reload(true);
      setReinstallMsg('Reinstall started — the instance is redeploying.');
    } catch (e: any) {
      setReinstallMsg(e?.response?.data || e?.message || 'Failed to reinstall');
    } finally {
      setReinstallBusy(false);
    }
  };

  const onDelete = async () => {
    if (!canControl || deleteBusy) return;
    const ok = await confirm({
      title: 'Destroy instance',
      message: `Destroy "${displayName}"? This runs driver destroy on the edge and removes the row.`,
      tone: 'danger',
      confirmLabel: 'Destroy',
    });
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await destroyInstance(instanceId);
      navigate('/instances');
    } catch (e: any) {
      setDeleteBusy(false);
      setReinstallMsg(e?.response?.data || e?.message || 'Failed to destroy instance');
      setTab('manage');
    }
  };

  const infoRows: { label: string; value: React.ReactNode; link?: string }[] = [
    { label: 'Container name', value: <span className="ks-mono text-[13px]">{instance.name}</span> },
    { label: 'Kind', value: <span className="capitalize">{instance.kind || '—'}</span> },
    { label: 'Status', value: <span className="capitalize">{statusLabel}</span> },
    {
      label: 'Node',
      value: instance.node_name || `#${instance.node_id ?? '?'}`,
      link: Number.isFinite(instance.node_id) ? `/node/${instance.node_id}` : undefined,
    },
    {
      label: 'Template',
      value: instance.template_name || 'deleted',
      link: instance.template_id ? `/template/${instance.template_id}` : undefined,
    },
    { label: 'Owner', value: instance.owner_name || (instance.owner_id ? `#${instance.owner_id}` : 'unattributed') },
    {
      label: 'External ID',
      value: (
        <span className="ks-mono text-[12px] text-gray-400 max-w-[16ch] truncate inline-block align-bottom" title={instance.external_id || '—'}>
          {instance.external_id || '—'}
        </span>
      ),
    },
    { label: 'Created', value: fmtDate(instance.created_at) },
    { label: 'Updated', value: fmtDate(instance.updated_at) },
    {
      label: 'Install',
      value:
        instance.install_state === 'failed'
          ? <span className="text-red-300">failed{instance.install_error ? ` — ${instance.install_error}` : ''}</span>
          : (instance.install_state || '—'),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="ks-card flex items-center gap-4">
        <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 bg-white/[0.03] text-sky-300">
          <KindIcon kind={k} className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white truncate" title={displayName}>
              {displayName}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-200">
              <span className="relative flex w-2 h-2">
                {isRunning && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                <span className={`relative inline-flex rounded-full w-2 h-2 ${dot}`} />
              </span>
              {statusLabel}
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${typeBadge}`}>
              {typeLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {(instance.node_name || 'unknown node') + ' · ' + (instance.template_name || 'deleted template')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 w-fit" role="tablist" aria-label="Overview sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 active:scale-95 ${
              tab === t.id ? 'bg-white/10 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resources' && (
        <ErrorBoundary label="instance-overview-resources">
          {!isRunning ? (
            <div className="glass-card rounded-xl text-center text-gray-400">
              <p className="text-sm">Start the instance to stream live CPU / RAM / disk graphs.</p>
            </div>
          ) : (
            <>
              {/* Stat tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">CPU</div>
                  <div className="text-2xl font-semibold leading-none tabular-nums text-sky-300">
                    {last?.cpu !== null && last?.cpu !== undefined ? fmtPct(last.cpu) : '—'}
                  </div>
                  {recentCPU.length > 1 && (
                    <div className="-mb-1 -mx-1">
                      <Sparkline values={recentCPU} color="#7dd3fc" />
                    </div>
                  )}
                </div>
                <div className="ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Memory</div>
                  <div className="text-2xl font-semibold leading-none tabular-nums text-emerald-300">
                    {liveBytes.memUsed !== null ? fmtBytes(liveBytes.memUsed) : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {liveBytes.memUsed !== null && liveBytes.memTotal !== null
                      ? `${fmtBytes(liveBytes.memUsed)} / ${fmtBytes(liveBytes.memTotal)}`
                      : 'unavailable'}
                  </div>
                  {recentRAM.length > 1 && (
                    <div className="-mb-1 -mx-1">
                      <Sparkline values={recentRAM} color="#6ee7b7" />
                    </div>
                  )}
                </div>
                <div className="ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Disk</div>
                  <div className="text-2xl font-semibold leading-none tabular-nums text-amber-300">
                    {liveBytes.diskUsed !== null ? fmtBytes(liveBytes.diskUsed) : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {liveBytes.diskUsed !== null && liveBytes.diskTotal !== null
                      ? `${fmtBytes(liveBytes.diskUsed)} / ${fmtBytes(liveBytes.diskTotal)}`
                      : 'unavailable'}
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="glass-card rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">CPU</h3>
                      <p className="text-[11px] text-gray-500">Live usage · warning at 80%</p>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {last?.cpu !== null && last?.cpu !== undefined ? fmtPct(last.cpu) : '—'}
                    </span>
                  </div>
                  <AreaChart samples={cpuSamples} max={100} color="#7dd3fc" unit="%" label="CPU %" threshold={80} heightClass="h-48" />
                </div>
                <div className="glass-card rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Memory</h3>
                      <p className="text-[11px] text-gray-500">Live usage · warning at 85%</p>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {liveBytes.memUsed !== null ? fmtBytes(liveBytes.memUsed) : '—'}
                    </span>
                  </div>
                  <AreaChart samples={ramSamples} max={100} color="#6ee7b7" unit="%" label="MEM %" threshold={85} heightClass="h-48" />
                </div>
                <div className="glass-card rounded-xl flex flex-col items-center justify-center p-4">
                  <h3 className="text-sm font-semibold text-white self-start mb-2">Disk</h3>
                  <DonutChart
                    pct={Math.min(100, Math.max(0, diskPct))}
                    color="#fcd34d"
                    label={`${diskPct.toFixed(1)}%`}
                    sub={
                      liveBytes.diskUsed !== null && liveBytes.diskTotal !== null
                        ? `${fmtBytes(liveBytes.diskUsed)} / ${fmtBytes(liveBytes.diskTotal)}`
                        : 'unavailable'
                    }
                    warnAt={80}
                    dangerAt={92}
                    size={150}
                  />
                </div>
              </div>
            </>
          )}
        </ErrorBoundary>
      )}

      {tab === 'details' && (
        <>
          {/* Status row — same component as the floating menu. */}
          <div className="ks-card">
            <h3 className="text-sm font-semibold text-white px-3 pt-3">Status</h3>
            <div className="pb-1">
              <ErrorBoundary label="instance-overview-info">
                <InstanceInfoRow />
              </ErrorBoundary>
            </div>
          </div>
          {/* Power + actions — same component as the floating menu. */}
          <div className="ks-card">
            <h3 className="text-sm font-semibold text-white px-3 pt-3">Controls</h3>
            <div className="pb-2">
              <ErrorBoundary label="instance-overview-power">
                <InstancePowerMenu />
              </ErrorBoundary>
            </div>
          </div>
          {/* Info grid */}
          <div className="ks-card">
            <h3 className="text-sm font-semibold text-white mb-1">Info</h3>
            <dl>
              {infoRows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
                >
                  <dt className="text-[13px] text-gray-500 shrink-0">{r.label}</dt>
                  <dd className="text-[13px] text-gray-200 text-right min-w-0 break-words">
                    {r.link ? (
                      <button
                        type="button"
                        onClick={() => navigate(r.link as string)}
                        className="text-sky-300 hover:text-sky-200 hover:underline"
                      >
                        {r.value}
                      </button>
                    ) : (
                      r.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      {tab === 'manage' && (
        <>
          {/* Rename */}
          <div className="ks-card">
            <h3 className="text-sm font-semibold text-white">Rename</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Changes the display name shown on cards and titles. The container name (
              <span className="ks-mono">{instance.name}</span>) on the edge never changes.
            </p>
            {canControl ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                  maxLength={128}
                  placeholder={instance.name}
                  aria-label="Display name"
                  className="ks-input flex-1"
                />
                <button
                  type="button"
                  onClick={onRename}
                  disabled={renameBusy}
                  className="ks-btn-form disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {renameBusy ? 'Saving…' : 'Save name'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500">You need instance edit permission to rename.</p>
            )}
            {renameMsg && <p className="text-xs text-gray-400 mt-2">{renameMsg}</p>}
          </div>

          {/* Advanced */}
          <div className="ks-card">
            <h3 className="text-sm font-semibold text-white">Advanced</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Full editors for this instance.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(`/instance/${instanceId}/edit`)}
                className="ks-btn-secondary px-3 py-1.5 rounded-md text-[13px]"
              >
                Edit advanced config
              </button>
              {instance.template_id ? (
                <button
                  type="button"
                  onClick={() => navigate(`/template/${instance.template_id}`)}
                  className="ks-btn-ghost px-3 py-1.5 rounded-md text-[13px]"
                >
                  Open template
                </button>
              ) : null}
              {Number.isFinite(instance.node_id) ? (
                <button
                  type="button"
                  onClick={() => navigate(`/node/${instance.node_id}`)}
                  className="ks-btn-ghost px-3 py-1.5 rounded-md text-[13px]"
                >
                  Open node
                </button>
              ) : null}
            </div>
          </div>

          {/* Danger zone */}
          <div className="ks-card border-red-900/40">
            <h3 className="text-sm font-semibold text-red-300">Danger zone</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Reinstall wipes the workload and redeploys from the stored spec. Destroy removes it entirely.
            </p>
            {canControl ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onReinstall}
                  disabled={reinstallBusy || deleteBusy}
                  className="ks-btn-danger-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {reinstallBusy ? 'Reinstalling…' : 'Reinstall'}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={reinstallBusy || deleteBusy}
                  className="ks-btn-danger-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteBusy ? 'Destroying…' : 'Destroy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500">You need instance edit permission for these actions.</p>
            )}
            {reinstallMsg && <p className="text-xs text-gray-400 mt-2">{reinstallMsg}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default InstanceOverview;
