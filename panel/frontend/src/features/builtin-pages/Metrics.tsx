// Metrics (instance live telemetry) — built-in instance sub-page (self-contained).
//
// Moved verbatim out of pages/panel/InstanceAdvancedPages.tsx; the cross-page
// UI vocabulary (Section/Btn/Field, useInstanceFromParams, LoadingOrError,
// TableSkeleton/CardGridSkeleton/TilesSkeleton, asArray/errText, timeAgo, …)
// is imported from ./_shared so the same helpers aren't duplicated. Default
// export is the BuiltinPageManifestEntry consumed by lib/builtin/index.ts;
// pages/panel/InstanceAdvancedPages.tsx re-exports this component + its
// boundary-wrapped *Page variant as a facade.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listTemplates } from '@/shared/api/admin';
import { parseConfig } from '@/shared/hooks/useInstance';
import { isPageAllowed } from '@/shared/utils/instancePages';
import {
  listSecrets, setSecret, revealSecret, deleteSecret,
  listAutomation, createAutomation, updateAutomation, deleteAutomation,
  listAutomationRuns, runAutomationNow,
  listProcesses, killProcess,
  getMetrics,
  listPorts,
  listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot,
  listInstanceAudit,
} from '@/features/instances/api/instanceAdvanced';
import type {
  Secret, SecretUpsert,
  Automation, AutomationUpsert, AutomationRun, AutomationRunResult,
  InstanceSnapshot,
  InstanceAuditRow,
  ProcessRow, PortRow, MetricsSnapshot,
} from '@/shared/types/instanceAdvanced';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import type { CardMenuItem } from '@/shared/components/ui/CardMenu/CardMenu';
import GlassModal from '@/shared/components/ui/Modal';
import {
  AreaChart, DonutChart, GaugeChart, Sparkline, TrendDelta, HealthBadge,
  healthOf, fmtClock,
  type MetricSample, type Health,
} from '@/shared/components/ui/MetricsChart';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

// ===========================================================================
//  METRICS
// ===========================================================================

const fmtBytes = (bytes: unknown): string => {
  const n = typeof bytes === 'number' ? bytes : (typeof bytes === 'string' ? parseFloat(bytes) : NaN);
  if (!isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // Show 1 decimal for GB/TB, integer for MB and below
  return i >= 3 ? `${v.toFixed(1)} ${units[i]}` : `${Math.round(v)} ${units[i]}`;
};

// Rate formatter (bytes/s -> human). Drives the network chart tooltip / tile.
const fmtRate = (bps: number): string => {
  if (!isFinite(bps) || bps < 0) return '—';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0;
  let v = bps;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i >= 2 ? `${v.toFixed(1)} ${units[i]}` : `${Math.round(v)} ${units[i]}`;
};

const fmtUptime = (sec: number | undefined): string => {
  if (sec == null || !isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// Time range selector — the user's chosen window dictates how many sample
// slots we keep in the rolling history. Three presets, each expressed as
// sample count assuming the 5s poll cadence (~12/min).
type Range = '1m' | '5m' | '15m';
const RANGE_SAMPLES: Record<Range, number> = { '1m': 12, '5m': 60, '15m': 180 };

// Single rolling-bucket history entry. Samples are kept in memory only;
// they're a derivative of the live-state cache (see the backend's
// instance_live_state row), not persisted by the panel.
interface SamplePoint { t: number; v: number }
const trimHistory = (rows: SamplePoint[], range: Range): SamplePoint[] => {
  const max = RANGE_SAMPLES[range];
  if (rows.length <= max) return rows;
  return rows.slice(rows.length - max);
};

export const InstanceMetrics: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [m, setM] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialLoad, setInitialLoad] = useState(true);
  // Last successful sample time — drives the "Updated Xs ago" pill so the
  // operator can tell whether the poll loop is actually firing.
  const [lastSampleAt, setLastSampleAt] = useState<number | null>(null);
  // Sticky error: only show failures from the most-recent attempt. Without
  // this, a successful poll clears the previous error text and the user
  // can't tell that one of the last few polls failed.
  const [lastError, setLastError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('5m');
  // Rolling histories keyed by metric. Stored as raw `SamplePoint[]` so the
  // chart components can render them directly; we trim on every update.
  const [cpuHist, setCpuHist] = useState<SamplePoint[]>([]);
  const [memHist, setMemHist] = useState<SamplePoint[]>([]);
  const [diskHist, setDiskHist] = useState<SamplePoint[]>([]);
  const [netRxHist, setNetRxHist] = useState<SamplePoint[]>([]);
  const [netTxHist, setNetTxHist] = useState<SamplePoint[]>([]);
  const [loadHist, setLoadHist] = useState<SamplePoint[]>([]);

  // Refs of the *previous* raw counter values, used to derive a rate for
  // network RX/TX (the inspect endpoint reports cumulative bytes, not bps).
  const prevNetRef = React.useRef<{ t: number; rx: number; tx: number } | null>(null);

  const load = useCallback(async () => {
    if (initialLoad) setLoading(true);
    setError('');
    try {
      const data = await getMetrics(instanceId);
      setM(data);
      const now = Date.now();
      setLastSampleAt(now);
      setLastError(null);

      // CPU % — backend emits `cpu_pct` (preferred) or `cpu` (legacy alias).
      const cpuVal = data.cpu_pct ?? data.cpu;
      if (typeof cpuVal === 'number' && isFinite(cpuVal)) {
        setCpuHist((prev) => trimHistory([...prev, { t: now, v: cpuVal }], range));
      }

      // Memory % — derive from used/total when not pre-computed by the edge.
      let memPct: number | undefined = data.mem_pct;
      if (memPct == null && data.mem_used != null && data.mem_total && data.mem_total > 0) {
        memPct = (data.mem_used / data.mem_total) * 100;
      }
      if (typeof memPct === 'number' && isFinite(memPct)) {
        setMemHist((prev) => trimHistory([...prev, { t: now, v: memPct }], range));
      }

      // Disk % — same pattern as memory.
      let diskPct: number | undefined = data.disk_pct;
      if (diskPct == null && data.disk_used != null && data.disk_total && data.disk_total > 0) {
        diskPct = (data.disk_used / data.disk_total) * 100;
      }
      if (typeof diskPct === 'number' && isFinite(diskPct)) {
        setDiskHist((prev) => trimHistory([...prev, { t: now, v: diskPct }], range));
      }

      // Network rate — derive from cumulative counters by dividing the
      // delta-bytes by the delta-seconds since the previous sample. Without
      // this the panel would show a flatline at the container's lifetime
      // byte count instead of the current throughput.
      const rxRaw = data.net_rx ?? data.net_in;
      const txRaw = data.net_tx ?? data.net_out;
      if (typeof rxRaw === 'number' && typeof txRaw === 'number') {
        const prev = prevNetRef.current;
        if (prev && now > prev.t) {
          const dt = (now - prev.t) / 1000;
          const rxRate = Math.max(0, (rxRaw - prev.rx) / dt);
          const txRate = Math.max(0, (txRaw - prev.tx) / dt);
          setNetRxHist((p) => trimHistory([...p, { t: now, v: rxRate }], range));
          setNetTxHist((p) => trimHistory([...p, { t: now, v: txRate }], range));
        }
        prevNetRef.current = { t: now, rx: rxRaw, tx: txRaw };
      }

      // Load average.
      const load1 = data.load1;
      if (typeof load1 === 'number' && isFinite(load1)) {
        setLoadHist((prev) => trimHistory([...prev, { t: now, v: load1 }], range));
      }

      if (initialLoad) setInitialLoad(false);
    } catch (e: unknown) {
      const msg = errText(e, 'Failed to load metrics');
      setLastError(msg);
      setError(msg);
    } finally {
      if (initialLoad) setLoading(false);
    }
  }, [instanceId, initialLoad, range]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // When the user switches instance, clear the histories + net-rate ref so
  // the new window's first sample isn't a discontinuity from the previous
  // instance's counter values.
  useEffect(() => {
    setCpuHist([]); setMemHist([]); setDiskHist([]);
    setNetRxHist([]); setNetTxHist([]); setLoadHist([]);
    prevNetRef.current = null;
  }, [instanceId]);

  // Tick a "seconds since last sample" counter so the header pulses + the
  // timestamp pill refreshes every second without hitting the API.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- early returns (after ALL hooks) -------------------------------------
  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="metrics" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="metrics" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('metrics', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  // ---- derived tile data -------------------------------------------------
  const cpuPct = m ? (m.cpu_pct ?? m.cpu ?? 0) : null;
  const memPct =
    m && m.mem_used != null && m.mem_total && m.mem_total > 0
      ? (m.mem_used / m.mem_total) * 100
      : m?.mem_pct ?? null;
  const diskPct =
    m && m.disk_used != null && m.disk_total && m.disk_total > 0
      ? (m.disk_used / m.disk_total) * 100
      : m?.disk_pct ?? null;

  const latestRxRate = netRxHist[netRxHist.length - 1]?.v ?? 0;
  const latestTxRate = netTxHist[netTxHist.length - 1]?.v ?? 0;
  const previousRxRate = netRxHist[netRxHist.length - 2]?.v;
  const previousTxRate = netTxHist[netTxHist.length - 2]?.v;

  // Overall health: aggregate the worst of CPU/mem/disk so the banner
  // doesn't say "Healthy" while disk is red.
  const overallHealth: Health = [cpuPct, memPct, diskPct]
    .map((p) => healthOf(p ?? undefined))
    .reduce<Health>(
      (worst, h) => {
        const order: Record<Health, number> = { unknown: 0, healthy: 1, warn: 2, danger: 3 };
        return order[h] > order[worst] ? h : worst;
      },
      'healthy',
    );

  // Tile row — sparklines + trend deltas per metric. The sparkline data is
  // the same rolling history the big charts use, so a glance at the tile
  // tells you whether the metric is trending up/down before you scroll.
  const tiles = [
    {
      key: 'cpu', label: 'CPU', value: cpuPct != null ? `${cpuPct.toFixed(1)}%` : '—',
      health: healthOf(cpuPct ?? undefined),
      history: cpuHist, color: '#7dd3fc', accent: 'text-sky-300',
    },
    {
      key: 'mem', label: 'Memory',
      value: memPct != null ? `${memPct.toFixed(1)}%` : '—',
      sub: m?.mem_used != null ? `${fmtBytes(m.mem_used)} / ${fmtBytes(m.mem_total)}` : undefined,
      health: healthOf(memPct ?? undefined),
      history: memHist, color: '#6ee7b7', accent: 'text-emerald-300',
    },
    {
      key: 'disk', label: 'Disk',
      value: diskPct != null ? `${diskPct.toFixed(1)}%` : '—',
      sub: m?.disk_used != null ? `${fmtBytes(m.disk_used)} / ${fmtBytes(m.disk_total)}` : undefined,
      health: healthOf(diskPct ?? undefined),
      history: diskHist, color: '#fcd34d', accent: 'text-amber-300',
    },
    {
      key: 'load', label: 'Load (1m)',
      value: m?.load1 != null ? m.load1.toFixed(2) : '—',
      health: healthOf(m?.load1 != null ? Math.min(100, m.load1 * 25) : undefined),
      history: loadHist, color: '#c4b5fd', accent: 'text-violet-300',
    },
    {
      key: 'uptime', label: 'Uptime',
      value: fmtUptime(m?.uptime),
      history: [] as SamplePoint[], color: '#e5e7eb', accent: 'text-gray-200',
    },
    {
      key: 'net', label: 'Net RX / TX',
      value: `${fmtRate(latestRxRate)} / ${fmtRate(latestTxRate)}`,
      health: 'unknown' as Health,
      history: netRxHist, color: '#f0abfc', accent: 'text-fuchsia-300',
    },
  ];

  const lastSampleLabel =
    lastSampleAt == null
      ? '—'
      : `${Math.max(0, Math.round((Date.now() - lastSampleAt) / 1000))}s ago`;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ---- Header ---------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Metrics</h2>
       </div>
        <div className="flex items-center gap-2">
          {/* Time range selector — rebuilds the rolling history length. */}
          <div className="flex items-center bg-black/30 border border-white/10 rounded-md p-0.5 text-[11px]">
            {(['1m', '5m', '15m'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  range === r ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title={`Show last ${r === '1m' ? '1 minute' : r === '5m' ? '5 minutes' : '15 minutes'}`}
              >
                {r}
             </button>
            ))}
         </div>
          {/* Live status pill */}
          <div className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 bg-black/30 border border-white/10 rounded-md px-2 py-1.5 font-mono">
            <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${
              error ? 'bg-red-400' : 'bg-emerald-400'
            }`}>
              {!error && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              )}
           </span>
            <span>{error ? 'stale' : 'live'}</span>
            <span className="text-gray-500">·</span>
            <span>{lastSampleLabel}</span>
         </div>
          <Btn onClick={load} disabled={loading && initialLoad}>Refresh</Btn>
       </div>
     </div>

      {/* Error banner — sticky; not reset by every successful poll. */}
      {lastError && (
        <div className="glass-card rounded-xl border border-red-700/40 flex items-start gap-2 text-xs text-red-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-300 shrink-0 mt-0.5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <div className="font-semibold mb-0.5">Last poll failed</div>
            <div className="text-red-300/80 break-all">{lastError}</div>
            <div className="text-red-300/60 mt-1">Showing the last-known values until the next successful refresh</div>
         </div>
       </div>
      )}

      {/* ---- Health banner -------------------------------------------- */}
      <div className={`glass-card rounded-xl flex items-center justify-between gap-3 ${
        overallHealth === 'danger' ? 'border-red-700/40' :
        overallHealth === 'warn' ? 'border-amber-700/40' : ''
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <HealthBadge health={overallHealth} label={`Overall · ${
            overallHealth === 'danger' ? 'critical' :
            overallHealth === 'warn' ? 'watch' :
            overallHealth === 'unknown' ? 'no data' : 'healthy'
          }`} />
          <div className="text-xs text-gray-400 min-w-0 truncate">
            {overallHealth === 'healthy' && 'All resources within healthy thresholds.'}
            {overallHealth === 'warn' && 'One or more resources crossed the warning threshold.'}
            {overallHealth === 'danger' && 'A resource is in the danger band — investigate soon.'}
            {overallHealth === 'unknown' && 'Waiting for the first sample from the edge.'}
         </div>
       </div>
        <div className="hidden md:flex items-center gap-4 text-[11px] font-mono text-gray-400">
          <span>CPU <span className="text-gray-200">{cpuPct != null ? `${cpuPct.toFixed(1)}%` : '—'}</span></span>
          <span>MEM <span className="text-gray-200">{memPct != null ? `${memPct.toFixed(1)}%` : '—'}</span></span>
          <span>DSK <span className="text-gray-200">{diskPct != null ? `${diskPct.toFixed(1)}%` : '—'}</span></span>
       </div>
     </div>

      {/* ---- Tile grid ------------------------------------------------- */}
      {initialLoad && loading ? (
        <TilesSkeleton />
      ) : (
<div className="ks-card-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((t) => {
            const last = t.history[t.history.length - 1]?.v;
            const prev = t.history[t.history.length - 2]?.v;
            const ring =
              t.health === 'danger' ? 'ring-1 ring-red-500/30' :
              t.health === 'warn' ? 'ring-1 ring-amber-500/30' :
              t.health === 'unknown' ? '' : 'ring-1 ring-emerald-500/15';
            return (
              <div key={t.key} className={`glass-card rounded-xl flex flex-col gap-2 animate-slide-up ${ring}`}>
                <div className="flex items-baseline justify-between gap-1 min-w-0">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide truncate">{t.label}</div>
                  {t.history.length > 1 && (
                    <TrendDelta
                      current={last ?? 0}
                      previous={prev}
                      unit={t.key === 'cpu' || t.key === 'mem' || t.key === 'disk' ? '%' : ''}
                      digits={t.key === 'load' ? 2 : 1}
                    />
                  )}
               </div>
                <div className={`text-2xl font-semibold leading-none tabular-nums truncate ${t.accent}`}>{t.value}</div>
                {t.sub && <div className="text-[10px] text-gray-500 truncate font-mono">{t.sub}</div>}
                {t.history.length > 1 && (
                  <div className="-mb-1 -mx-1">
                    <Sparkline samples={t.history} color={t.color} width={140} height={28} />
                 </div>
                )}
             </div>
            );
          })}
       </div>
      )}

      {/* ---- Empty state ---------------------------------------------- */}
      {!loading && !initialLoad && !lastError && (!m || Object.keys(m).length === 0) && (
        <Section>
          <EmptyRow text="No metrics returned yet. The instance may be stopped, the edge inspect endpoint may be unavailable, or the container main process is unhealthy." />
       </Section>
      )}

      {/* ---- Charts row: area charts --------------------------------- */}
      <div className="ks-card-grid grid grid-cols-1 xl:grid-cols-3">
        {/* CPU area chart with threshold line at 80%. */}
        <div className="glass-card rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">CPU</h3>
              <p className="text-[11px] text-gray-500">Optimistic projection dashed · warning at 80%</p>
           </div>
            <span className="text-[10px] text-gray-500 font-mono">{cpuHist.length} pts</span>
         </div>
          <AreaChart
            samples={cpuHist}
            max={100}
            color="#7dd3fc"
            unit="%"
            label="CPU %"
            threshold={80}
            heightClass="h-48"
          />
       </div>
        {/* Memory area chart with threshold at 85%. */}
        <div className="glass-card rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Memory</h3>
              <p className="text-[11px] text-gray-500">Warning at 85% · danger at 95%</p>
           </div>
            <span className="text-[10px] text-gray-500 font-mono">{memHist.length} pts</span>
         </div>
          <AreaChart
            samples={memHist}
            max={100}
            color="#6ee7b7"
            unit="%"
            label="MEM %"
            threshold={85}
            heightClass="h-48"
          />
       </div>
        {/* Disk area chart with warn/danger bands via threshold at 90%. */}
        <div className="glass-card rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Disk</h3>
              <p className="text-[11px] text-gray-500">Warning at 80% · danger at 92%</p>
           </div>
            <span className="text-[10px] text-gray-500 font-mono">{diskHist.length} pts</span>
         </div>
          <AreaChart
            samples={diskHist}
            max={100}
            color="#fcd34d"
            unit="%"
            label="DSK %"
            threshold={80}
            heightClass="h-48"
          />
       </div>
     </div>

      {/* ---- Gauges row ----------------------------------------------- */}
      <div className="ks-card-grid grid grid-cols-1 md:grid-cols-3">
        <div className="glass-card rounded-xl flex flex-col items-center">
          <h3 className="text-sm font-semibold text-white self-start">CPU gauge</h3>
          <GaugeChart
            pct={cpuPct ?? 0}
            color="#7dd3fc"
            label="CPU"
            display={cpuPct != null ? `${cpuPct.toFixed(1)}%` : '—'}
            size={180}
          />
          <div className="text-[11px] text-gray-500 mt-1">
            {m?.cpu != null ? `${m.cpu.toFixed(1)}% raw` : ''}
         </div>
       </div>
        <div className="glass-card rounded-xl flex flex-col items-center">
          <h3 className="text-sm font-semibold text-white self-start">Memory donut</h3>
          <DonutChart
            pct={memPct ?? 0}
            color="#6ee7b7"
            label={memPct != null ? `${memPct.toFixed(1)}%` : '—'}
            sub={m?.mem_used != null ? `${fmtBytes(m.mem_used)} / ${fmtBytes(m.mem_total)}` : undefined}
            warnAt={75}
            dangerAt={90}
            size={150}
          />
       </div>
        <div className="glass-card rounded-xl flex flex-col items-center">
          <h3 className="text-sm font-semibold text-white self-start">Disk donut</h3>
          <DonutChart
            pct={diskPct ?? 0}
            color="#fcd34d"
            label={diskPct != null ? `${diskPct.toFixed(1)}%` : '—'}
            sub={m?.disk_used != null ? `${fmtBytes(m.disk_used)} / ${fmtBytes(m.disk_total)}` : undefined}
            warnAt={80}
            dangerAt={92}
            size={150}
          />
       </div>
     </div>

      {/* ---- Network throughput --------------------------------------- */}
      <div className="glass-card rounded-xl">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Network throughput</h3>
            <p className="text-[11px] text-gray-500">
              Bytes/s derived from the cumulative net_in/net_out counters — delta between successive samples.
           </p>
         </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-0.5 bg-fuchsia-400" />
              <span className="text-gray-400">RX</span>
              <span className="text-fuchsia-300">{fmtRate(latestRxRate)}</span>
              <TrendDelta current={latestRxRate} previous={previousRxRate} unit="" digits={0} />
           </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-0.5 bg-cyan-400" />
              <span className="text-gray-400">TX</span>
              <span className="text-cyan-300">{fmtRate(latestTxRate)}</span>
              <TrendDelta current={latestTxRate} previous={previousTxRate} unit="" digits={0} />
           </span>
         </div>
       </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AreaChart
            samples={netRxHist}
            max={Math.max(1, Math.max(0, ...netRxHist.map((s) => s.v)) * 1.2)}
            color="#f0abfc"
            unit=""
            label="RX (in)"
            heightClass="h-40"
          />
          <AreaChart
            samples={netTxHist}
            max={Math.max(1, Math.max(0, ...netTxHist.map((s) => s.v)) * 1.2)}
            color="#22d3ee"
            unit=""
            label="TX (out)"
            heightClass="h-40"
          />
       </div>
     </div>

      {/* ---- Footer note ---------------------------------------------- */}
      <p className="text-[10px] text-gray-500 text-center pt-2">
        Window: last {range === '1m' ? '1 minute' : range === '5m' ? '5 minutes' : '15 minutes'} ·{' '}
        {RANGE_SAMPLES[range]} samples max · refreshed every 5s ·{' '}
        projected points use a 6-sample linear regression.
     </p>
   </div>
  );
};

const Metrics: BuiltinPageManifestEntry = { slug: 'metrics', name: 'Metrics', iconName: 'Metrics', iconSvg: '<path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="13" y="7" width="3" height="11" />', component: InstanceMetrics, };

export default Metrics;
