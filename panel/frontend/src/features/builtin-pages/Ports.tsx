// Ports (instance published ports) — built-in instance sub-page (self-contained).
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

export const InstancePorts: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [rows, setRows] = useState<PortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(asArray<PortRow>(await listPorts(instanceId))); }
    catch (e: any) { setError(errText(e, 'Failed to load ports')); }
    finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { const t = setInterval(load, 5000); load(); return () => clearInterval(t); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="panel" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="panel" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('ports', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const portSkeleton = () => (
    <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-card rounded-xl animate-pulse">
          <div className="h-4 w-1/2 bg-neutral-800 rounded mb-3" />
          <div className="h-3 w-2/3 bg-neutral-800 rounded mb-2" />
          <div className="h-3 w-1/3 bg-neutral-800 rounded" />
        </div>
      ))}
    </div>
  );

  const stateColor = (state: string) => {
    const s = state.toUpperCase();
    if (s === 'LISTEN') return 'text-emerald-300';
    if (s === 'ESTABLISHED') return 'text-sky-300';
    if (s === 'TIME_WAIT' || s === 'CLOSE_WAIT') return 'text-amber-300';
    if (s.startsWith('SYN') || s.startsWith('FIN') || s === 'CLOSING' || s === 'LAST_ACK') return 'text-violet-300';
    return 'text-gray-400';
  };

  const protoColor = (proto: string) => proto.toLowerCase() === 'tcp' ? 'text-sky-300' : 'text-fuchsia-300';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Ports</h2>
        </div>
        <Btn onClick={load} disabled={loading}>Refresh</Btn>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {loading && rows.length === 0 ? (
        portSkeleton()
      ) : rows.length === 0 ? (
        <Section><EmptyRow text="No listening sockets reported." /></Section>
      ) : (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p, i) => (
            <div key={i} className="glass-card rounded-xl flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border mr-2 ${protoColor(p.proto || 'tcp')} border-current uppercase`}>
                      {p.proto || 'tcp'}
                    </span>
                    {p.laddr || '—'}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stateColor(p.state || '—')} border-current uppercase`}>
                  {p.state || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 font-mono">
                  <span className="text-gray-500">Local</span>
                  <span className="text-gray-100">{p.laddr || '—'}</span>
                </span>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 font-mono">
                  <span className="text-gray-500">Remote</span>
                  <span className="text-gray-400">{p.raddr || '—'}</span>
                </span>
                {p.pid != null && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 font-mono">
                    <span className="text-gray-500">PID</span>
                    <span className="text-gray-100 tabular-nums">{p.pid}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Ports: BuiltinPageManifestEntry = { slug: 'ports', name: 'Ports', iconName: 'Ports', iconSvg: '<rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M15 4v16M4 9h16M4 15h16" />', component: InstancePorts, };

export default Ports;
