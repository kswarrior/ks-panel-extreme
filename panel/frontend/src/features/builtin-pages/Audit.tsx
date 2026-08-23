// Audit (instance audit log) — built-in instance sub-page (self-contained).
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

export const InstanceAudit: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [rows, setRows] = useState<InstanceAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(asArray<InstanceAuditRow>(await listInstanceAudit(instanceId, 200))); }
    catch (e: any) { setError(errText(e, 'Failed to load audit')); }
    finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="audit" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="audit" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('audit', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Audit log</h2>
        </div>
        <Btn onClick={load} disabled={loading}>Refresh</Btn>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {loading ? (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl animate-pulse">
              <div className="h-4 w-1/3 bg-neutral-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-neutral-800 rounded mb-1" />
              <div className="h-3 w-2/3 bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Section><EmptyRow text="No audit entries yet." /></Section>
      ) : (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="glass-card rounded-xl flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.action.startsWith('automation') ? 'bg-violet-900/40 text-violet-200 border-violet-700/50' : r.action.startsWith('secret') ? 'bg-amber-900/40 text-amber-200 border-amber-700/50' : r.action.startsWith('snapshot') ? 'bg-sky-900/40 text-sky-200 border-sky-700/50' : 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50'}`}>
                  {r.action}
                </span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(r.created_at)}</span>
              </div>
              <div className="text-sm text-gray-300 font-medium">{r.actor || 'system'}</div>
              {r.detail && <p className="text-xs text-gray-400 break-all">{r.detail}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Audit: BuiltinPageManifestEntry = { slug: 'audit', name: 'Audit', iconName: 'Audit', iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" />', component: InstanceAudit, };

export default Audit;
