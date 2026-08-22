// Processes (instance process list) — built-in instance sub-page (self-contained).
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

export const InstanceProcesses: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCommands, setExpandedCommands] = useState<Set<number>>(new Set());
  const [killing, setKilling] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(asArray<ProcessRow>(await listProcesses(instanceId))); }
    catch (e: any) { setError(errText(e, 'Failed to load processes')); }
    finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="panel" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="panel" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('processes', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const kill = async (pid: number) => {
    if (!confirm(`Send SIGTERM to pid ${pid}?`)) return;
    setKilling(prev => {
      const newSet = new Set(prev);
      newSet.add(pid);
      return newSet;
    });
    try {
      const result = await killProcess(instanceId, pid);
      if (!result.ok) {
        throw new Error(`Failed to kill process ${pid}`);
      }
      await load();
    } catch (e: any) {
      setError(errText(e, 'Kill failed'));
    } finally {
      setKilling(prev => {
        const newSet = new Set(prev);
        newSet.delete(pid);
        return newSet;
      });
    }
  };

  const toggleCommandExpand = (pid: number) => {
    setExpandedCommands(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pid)) {
        newSet.delete(pid);
      } else {
        newSet.add(pid);
      }
      return newSet;
    });
  };

  const processSkeleton = () => (
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Processes</h2>
        </div>
        <Btn onClick={load} disabled={loading}>Refresh</Btn>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {loading ? (
        processSkeleton()
      ) : rows.length === 0 ? (
        <Section><EmptyRow text="No processes reported. The instance may be stopped or the edge's inspect endpoint is unavailable." /></Section>
      ) : (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p, i) => {
            const isExpanded = expandedCommands.has(p.pid);
            const cmd = p.cmd || p.name || '';
            const displayCmd = isExpanded ? cmd : (cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd);
            
            return (
              <div key={`${p.pid}-${i}`} className="glass-card rounded-xl flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">PID {p.pid}</div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-gray-200 font-mono">{p.user || '—'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-gray-400">Command:</span>
                  <span className="font-mono text-gray-100 break-all whitespace-pre-wrap">{displayCmd}</span>
                </div>
                {cmd.length > 50 && (
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCommandExpand(p.pid)}
                      className="text-xs text-sky-300 hover:underline"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1 border-t border-white/[0.06]">
                  <span className="flex items-center gap-1">
                    <span className="text-sky-300">CPU</span>
                    <span className="font-mono tabular-nums">{p.cpu != null ? p.cpu.toFixed(1) : '0.0'}</span>
                    <span className="text-gray-500">%</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-300">Mem</span>
                    <span className="font-mono tabular-nums">{p.mem != null ? p.mem.toFixed(1) : '0.0'}</span>
                    <span className="text-gray-500">%</span>
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={killing.has(p.pid)}
                    onClick={() => kill(p.pid)}
                    className="text-xs text-red-300 hover:underline px-2 py-1 rounded border border-red-700/40 hover:bg-red-900/20"
                    title="SIGTERM"
                  >
                    {killing.has(p.pid) ? 'Killing...' : 'Kill'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Processes: BuiltinPageManifestEntry = { slug: 'processes', name: 'Processes', iconName: 'Processes', iconSvg: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17.5h7M17.5 14v7" />', component: InstanceProcesses, };

export default Processes;
