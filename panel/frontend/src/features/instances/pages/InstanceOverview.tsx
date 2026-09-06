// InstanceOverview.tsx — full instance page behind the floating menu's
// "More" link (route slug `overview`, a native built-in like Ports / SFTP /
// Snapshots — not a custom spec.pages entry).
//
// It gathers everything the floating menu holds plus full-page extras:
//   • header with name + status / kind badges (no top-right action pill),
//   • section tabs: Details (one tile per fact — no Controls / Status
//     cards, those live in the floating menu; the External ID tile is
//     click-to-copy), Monitoring (live CPU / RAM / disk graphs,
//     System-page style), Manage (rename + reinstall + destroy),
//     Activity (audit trail).
//   • section deck (OverviewTabs: one card, per-tab hue wash + glowing
//     icon tile + growing underline + live markers, 2×2 on phones).

import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { useLiveMetrics } from '../hooks/useLiveMetrics';
import {
  destroyInstance,
  reinstallInstance,
  updateInstanceIdentity,
} from '@/shared/api/admin';
import { listInstanceAudit } from '../api/instanceAdvanced';
import type { InstanceAuditRow } from '@/features/instances/types/instanceAdvanced';
import { KindIcon } from '../components/InstanceFormComponents';
import { KIND_META, kindKey } from '../types/instanceForm';
import { AreaChart, DonutChart, type MetricSample } from '@/shared/components/ui/MetricsChart';
import { Sparkline, fmtBytes, fmtPct } from '@/features/system/components/SystemCharts';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import OverviewTabs from '../components/OverviewTabs';
import { resolveInstanceControls } from '../utils/instanceControls';
import { resolveRedirectTarget } from '@/shared/utils/instancePages';

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

type TabId = 'details' | 'monitoring' | 'manage' | 'activity';

const TAB_META: Record<TabId, { label: string; icon: React.ReactNode }> = {
  details: {
    label: 'Details',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
    ),
  },
  monitoring: {
    label: 'Monitoring',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M12 20a8 8 0 1 1 8-8" /><path d="M12 12l4-4" /></svg>
    ),
  },
  manage: {
    label: 'Manage',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
    ),
  },
  activity: {
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    ),
  },
};

const TAB_ORDER: TabId[] = ['details', 'monitoring', 'manage', 'activity'];

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// InfoTile — one datum per card: icon tile + big value + uppercase label +
// faint hint, Home-tile aesthetic. Clickable tiles navigate (node /
// template) or copy (external ID) with a hover lift.
const InfoTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
  title?: string;
  onClick?: () => void;
}> = ({ icon, label, value, hint, accent = 'var(--ks-info)', title, onClick }) => {
  const body = (
    <>
      <div
        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.03]"
        style={{ color: accent }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold text-white leading-tight truncate">{value}</div>
        <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">{label}</div>
        {hint && <div className="text-[11px] text-gray-500 truncate mt-0.5" title={hint}>{hint}</div>}
      </div>
      {onClick && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 text-gray-600" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
      )}
    </>
  );
  const cls = `ks-card flex items-center gap-3 animate-slide-up ${onClick ? 'cursor-pointer hover:border-white/25 hover:-translate-y-0.5 transition-all duration-150' : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${cls} text-left w-full`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  );
};

const tileIcon = (inner: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
    {inner}
  </svg>
);

const InstanceOverview: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const { instance, loading, error, reload } = useInstance(instanceId);
  const permissions = useAuthStore((s) => s.permissions);
  const [tab, setTab] = useState<TabId>('details');
  const [rename, setRename] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameMsg, setRenameMsg] = useState('');
  const [reinstallBusy, setReinstallBusy] = useState(false);
  const [pageMsg, setPageMsg] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );
  // Page-action visibility reuses existing keys only — no new permission
  // keys. Template / node links need their area keys; everything mutating
  // rides on the instance control umbrella above.
  const canOpenTemplate = permissions.includes(PermissionKey.MANAGE_TEMPLATES);
  const canOpenNode = permissions.includes(PermissionKey.MANAGE_NODES);
  const [copied, setCopied] = useState(false);

  // Template allow-list for the built-in controls + overview (instance.Config
  // snapshot, allow-all default for old templates).
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const spec = useMemo(() => parseConfig(instance?.config), [instance?.config]);
  const visibleTabs = useMemo<TabId[]>(() => {
    const all: TabId[] = TAB_ORDER.filter((id) => {
      if (id === 'details') return controls.show_details_tab;
      if (id === 'monitoring') return controls.show_monitoring_tab;
      if (id === 'manage') return controls.show_manage_tab;
      return controls.show_activity_tab;
    });
    // Fail-safe: the author hid every tab — fall back to details so the
    // page never renders an empty deck.
    return all.length > 0 ? all : (['details'] as TabId[]);
  }, [controls]);
  // Keep the active tab inside the visible set, preferring the template's
  // default tab on first load.
  useEffect(() => {
    if (!instance) return;
    if (!visibleTabs.includes(tab)) {
      const preferred = (controls.default_tab as TabId) || 'details';
      setTab(visibleTabs.includes(preferred) ? preferred : visibleTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, visibleTabs]);

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

  // Audit trail for this instance — lazy: fetched when the Activity tab
  // opens via the per-instance endpoint (VIEW-gated + Own-scope aware, so
  // non-admin owners see their own trail). The global /api/activity feed is
  // admin-only and truncated to the newest 100 fleet rows, which hid this
  // instance's events behind other instances' activity.
  const [audit, setAudit] = useState<InstanceAuditRow[] | null>(null);
  const [auditErr, setAuditErr] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'activity' || !Number.isFinite(instanceId)) return;
    let dead = false;
    setAuditLoading(true);
    setAuditErr('');
    listInstanceAudit(instanceId, 100)
      .then((rows) => {
        if (dead) return;
        setAudit(Array.isArray(rows) ? rows : []);
      })
      .catch((e: any) => {
        if (dead) return;
        // The endpoint answers plain-text and JSON errors ({error}); never
        // store the raw payload — an object child crashes the render.
        const d: unknown = e?.response?.data;
        const serverMsg =
          typeof d === 'string'
            ? d
            : d && typeof (d as any).error === 'string'
              ? (d as any).error
              : '';
        setAuditErr(serverMsg || e?.message || 'Failed to load activity');
      })
      .finally(() => {
        if (!dead) setAuditLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [tab, instanceId]);

  // Live metrics stream (shared hook — same feed the Home tiles and the
  // floating menu's status row read): history ring for graphs plus the
  // latest point for tiles. Self-sufficient — the backend serves it for
  // the built-in Overview without any custom instance page.
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

  // Floating menu "More" link target: when the overview was opened via More,
  // forward to the template's configured page (default overview). Direct URL
  // visits land here normally — unknown slugs fall back to overview.
  if ((location.state as any)?.fromMore) {
    const target = resolveRedirectTarget(controls.more_page, spec);
    if (target && target !== 'overview') {
      return <Navigate to={`/instances/${instanceId}/${target}`} replace />;
    }
  }

  const k = kindKey(instance.kind);
  const typeLabel = KIND_META[k]?.label || instance.kind || '—';
  const typeBadge = KIND_META[k]?.badge || '';
  const displayName = instance.display_name || instance.name;
  const dot = STATUS_DOT[status] || 'bg-gray-500';
  const statusLabel = STATUS_LABEL[status] || status || '—';
  const diskPct = last?.diskPct ?? 0;

  const onRename = async () => {
    if (!canControl || !controls.allow_rename || renameBusy) return;
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
    if (!canControl || !controls.allow_reinstall || reinstallBusy) return;
    const ok = await confirm({
      title: 'Reinstall instance',
      message: `Wipe "${displayName}" and redeploy it from the stored spec? ALL data inside the workload will be lost.`,
      tone: 'danger',
      confirmLabel: 'Reinstall',
    });
    if (!ok) return;
    setReinstallBusy(true);
    setPageMsg('');
    try {
      await reinstallInstance(instanceId);
      await reload(true);
      setPageMsg('Reinstall started — the instance is redeploying.');
    } catch (e: any) {
      setPageMsg(e?.response?.data || e?.message || 'Failed to reinstall');
    } finally {
      setReinstallBusy(false);
    }
  };

  const onDelete = async () => {
    if (!canControl || !controls.allow_destroy || deleteBusy) return;
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
      setPageMsg(e?.response?.data || e?.message || 'Failed to destroy instance');
    }
  };

  const onCopyId = async () => {
    const text = instance.external_id || '';
    if (!text || !controls.allow_external_id_copy) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — label stays */
    }
  };

  // Page actions used to live in the top-right pill (NodeDetail pattern).
  // The pill is intentionally gone on this page — power actions live in
  // the floating menu, Edit / Template / Node / Copy have in-page homes
  // (Manage tab + Details tiles), and Reinstall / Destroy live in the
  // Manage tab's danger zone below.

  return (
    <div className="space-y-4 animate-fade-in">
      {pageMsg && (
        <div className="glass-card rounded-xl text-[13px] text-gray-300">
          <span className="break-words">{pageMsg}</span>
        </div>
      )}
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

      {/* Section deck — one card per visible tab (template allow-list),
          per-tab hue wash + glowing icon tile + growing underline + live
          markers. 2×2 on phones, one row on desktop. */}
      <OverviewTabs
        ariaLabel="Overview sections"
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={visibleTabs.map((id) => {
          const meta = TAB_META[id];
          if (id === 'details') {
            return {
              id,
              label: meta.label,
              hint: 'Status, controls & info',
              icon: meta.icon,
              accent: '#38bdf8',
              marker: { kind: 'dot', className: dot, title: `Status: ${statusLabel}` } as const,
            };
          }
          if (id === 'monitoring') {
            return {
              id,
              label: meta.label,
              hint: isRunning ? 'Streaming live' : 'CPU · RAM · disk',
              icon: meta.icon,
              accent: '#34d399',
              marker: isRunning
                ? ({
                    kind: 'pulse',
                    title:
                      last?.cpu !== null && last?.cpu !== undefined
                        ? `CPU ${fmtPct(last.cpu)} (live)`
                        : 'Live',
                  } as const)
                : undefined,
            };
          }
          if (id === 'activity') {
            return {
              id,
              label: meta.label,
              hint: 'Audit trail',
              icon: meta.icon,
              accent: '#a78bfa',
              marker:
                audit !== null
                  ? ({
                      kind: 'badge',
                      text: audit.length,
                      title: `${audit.length} recorded event${audit.length === 1 ? '' : 's'}`,
                    } as const)
                  : undefined,
            };
          }
          return {
            id,
            label: meta.label,
            hint: 'Rename · reinstall · destroy',
            icon: meta.icon,
            accent: '#fbbf24',
            marker: undefined,
          };
        })}
      />

      {tab === 'monitoring' && controls.show_monitoring_tab && (
        <ErrorBoundary label="instance-overview-monitoring">
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

      {tab === 'details' && controls.show_details_tab && (
        /* One datum per card — the old Controls / Status cards duplicated
           the floating menu, and the old Info card stacked every fact in
           one list. Each tile below owns exactly one fact. */
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <InfoTile
            label="Container"
            value={<span className="ks-mono">{instance.name}</span>}
            hint="edge workload name"
            accent="#a78bfa"
            title={instance.name}
            icon={tileIcon(<><path d="M20 12l-8 8-9-9V4h7z" /><circle cx="7.5" cy="7.5" r="1" /></>)}
          />
          <InfoTile
            label="Node"
            value={instance.node_name || `#${instance.node_id ?? '?'}`}
            hint="hosting edge"
            accent="var(--ks-ok)"
            title={canOpenNode && controls.allow_node_link ? `Open node ${instance.node_name || instance.node_id}` : `Node: ${instance.node_name || instance.node_id}`}
            onClick={canOpenNode && controls.allow_node_link && Number.isFinite(instance.node_id) ? () => navigate(`/node/${instance.node_id}`) : undefined}
            icon={tileIcon(<><rect x="2" y="3" width="20" height="6" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="17" x2="6.01" y2="17" /></>)}
          />
          <InfoTile
            label="Template"
            value={instance.template_name || 'deleted'}
            hint="deployed from"
            accent="#c4b5fd"
            title={canOpenTemplate && controls.allow_template_link && instance.template_id ? `Open template ${instance.template_name}` : `Template: ${instance.template_name || 'deleted'}`}
            onClick={canOpenTemplate && controls.allow_template_link && instance.template_id ? () => navigate(`/template/${instance.template_id}`) : undefined}
            icon={tileIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></>)}
          />
          <InfoTile
            label="External ID"
            value={<span className="ks-mono">{copied ? 'Copied!' : (instance.external_id || '—')}</span>}
            hint={instance.external_id ? (copied ? 'copied to clipboard' : controls.allow_external_id_copy ? 'driver-side ID — click to copy' : 'driver-side ID') : 'driver-side ID'}
            accent="var(--ks-faint)"
            title={instance.external_id ? (copied ? 'Copied!' : controls.allow_external_id_copy ? `Click to copy: ${instance.external_id}` : instance.external_id) : 'No external ID yet'}
            onClick={instance.external_id && controls.allow_external_id_copy ? () => void onCopyId() : undefined}
            icon={tileIcon(<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>)}
          />
          {/* Lifecycle — Created + Updated share one card, side by side. */}
          <div className="ks-card flex items-center gap-3 col-span-2 animate-slide-up" title="Lifecycle timestamps">
            <div
              className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.03]"
              style={{ color: 'var(--ks-info)' }}
              aria-hidden="true"
            >
              {tileIcon(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>)}
            </div>
            <div className="min-w-0 flex-1 flex items-stretch gap-3">
              <div className="min-w-0 flex-1">
                <div className="ks-mono text-[15px] font-semibold text-white leading-tight truncate" title={fmtDate(instance.created_at)}>
                  {fmtDate(instance.created_at)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">Created</div>
              </div>
              <div className="w-px shrink-0 bg-white/10" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="ks-mono text-[15px] font-semibold text-white leading-tight truncate" title={fmtDate(instance.updated_at)}>
                  {fmtDate(instance.updated_at)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">Updated</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'manage' && controls.show_manage_tab && (
        <div className="space-y-4">
          {/* Rename */}
          {controls.allow_rename && (
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
          )}

          {/* Advanced config — replaces the old pill's "Edit advanced config" entry. */}
          {canControl && controls.allow_edit_advanced && (
            <div className="ks-card">
              <h3 className="text-sm font-semibold text-white">Advanced config</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Edit ports, env, volumes and other driver options for this instance.
              </p>
              <button
                type="button"
                onClick={() => navigate(`/instance/${instanceId}/edit`)}
                className="ks-btn-form"
              >
                Edit advanced config
              </button>
            </div>
          )}

          {/* Danger zone — replaces the old pill's Reinstall / Destroy entries. */}
          {(controls.allow_reinstall || controls.allow_destroy) && (
          <div className="ks-card border-red-500/20">
            <h3 className="text-sm font-semibold text-red-300">Danger zone</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Destructive actions. Reinstall wipes the workload and redeploys it from the
              stored spec; destroy removes it from the edge and the panel.
            </p>
            {canControl ? (
              <div className="flex flex-col sm:flex-row gap-2">
                {controls.allow_reinstall && (
                <button
                  type="button"
                  onClick={() => void onReinstall()}
                  disabled={reinstallBusy || deleteBusy}
                  className="ks-btn-form border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {reinstallBusy ? 'Reinstalling…' : 'Reinstall'}
                </button>
                )}
                {controls.allow_destroy && (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  disabled={reinstallBusy || deleteBusy}
                  className="ks-btn-form border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteBusy ? 'Destroying…' : 'Destroy'}
                </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">You need instance edit permission to reinstall or destroy.</p>
            )}
          </div>
          )}
          {(!controls.allow_rename && !controls.allow_edit_advanced && !controls.allow_reinstall && !controls.allow_destroy) && (
            <div className="ks-card">
              <p className="text-xs text-gray-500">All manage actions are disabled for this template.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && controls.show_activity_tab && (
        <div className="ks-card">
          <h3 className="text-sm font-semibold text-white">Activity</h3>
          <p className="text-xs text-gray-500 mt-1 mb-3">Audit trail for this instance only.</p>
          {auditLoading && !audit ? (
            <div className="space-y-2 animate-pulse" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-neutral-800" />
              ))}
            </div>
          ) : auditErr ? (
            <p className="text-[13px] text-gray-400">{auditErr}</p>
          ) : audit && audit.length > 0 ? (
            <ul className="max-h-96 overflow-y-auto divide-y divide-white/5">
              {audit.map((e) => (
                <li key={e.id} className="py-2 flex items-start gap-3">
                  <span className="shrink-0 text-[11px] text-gray-500 tabular-nums pt-0.5">
                    {fmtDate(e.created_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-gray-200">
                      <span className="font-medium capitalize">{e.action}</span>
                      <span className="text-gray-500"> · {e.username || 'system'}</span>
                    </p>
                    <p className="text-xs text-gray-400 break-words mt-0.5">{e.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-gray-500">No recorded events for this instance yet.</p>
          )}
        </div>
      )}

    </div>
  );
};

export default InstanceOverview;
