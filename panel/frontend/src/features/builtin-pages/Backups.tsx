// Backups (instance snapshot manager) — built-in instance sub-page (self-contained).
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

export const InstanceSnapshots: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [snaps, setSnaps] = useState<InstanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSnaps(asArray<InstanceSnapshot>(await listSnapshots(instanceId))); }
    catch (e: any) { setError(errText(e, 'Failed to load snapshots')); }
    finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="backups" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="backups" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('backups', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

const create = async () => {
  if (!name) { setFormError('A name is required.'); return; }
  setBusy(true); setFormError('');
  try { await createSnapshot(instanceId, { name, note, type, location }); setName(''); setNote(''); setType(''); setLocation(''); setModalOpen(false); await load(); }
  catch (e: any) { setFormError(errText(e, 'Create failed')); }
  finally { setBusy(false); }
};

  const restore = async (s: InstanceSnapshot) => {
    if (!confirm(`Restore snapshot "${s.name}"? The instance will be rolled back. This is destructive to current state.`)) return;
    try { await restoreSnapshot(instanceId, s.name); await load(); }
    catch (e: any) { setError(errText(e, 'Restore failed')); }
  };

  const remove = async (s: InstanceSnapshot) => {
    if (!confirm(`Delete snapshot "${s.name}"?`)) return;
    try { await deleteSnapshot(instanceId, s.name); await load(); }
    catch (e: any) { setError(errText(e, 'Delete failed')); }
  };

return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Backups & Snapshots</h2>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={() => { setName(''); setNote(''); setModalOpen(true); }}>+ Create snapshot</Btn>
          <Btn onClick={load} disabled={loading}>Refresh</Btn>
        </div>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {loading ? (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl animate-pulse">
              <div className="h-4 w-1/2 bg-neutral-800 rounded mb-3" />
              <div className="h-3 w-2/3 bg-neutral-800 rounded mb-2" />
              <div className="h-3 w-1/3 bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      ) : snaps.length === 0 ? (
        <Section><EmptyRow text="No snapshots yet. Click “Create snapshot” to add one." /></Section>
      ) : (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {snaps.map((s) => (
            <div key={s.id} className="glass-card rounded-xl flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{s.name}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-gray-200 font-mono">
                    {s.external_ref || '—'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                <span>{s.size_bytes ? `${s.size_bytes} B` : '—'}</span>
                <span className="text-gray-600">·</span>
                <span>{timeAgo(s.created_at)}</span>
              </div>
              {s.note && <p className="text-xs text-gray-300 truncate" title={s.note}>{s.note}</p>}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.06]">
                <Btn variant="ghost" onClick={() => restore(s)}>Restore</Btn>
                <Btn variant="danger" onClick={() => remove(s)}>Delete</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
<GlassModal
         open={modalOpen}
         onClose={() => setModalOpen(false)}
         title="Create snapshot"
         maxWidth="max-w-md"
         footer={
           <>
             <Btn onClick={() => setModalOpen(false)}>Cancel</Btn>
             <Btn variant="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create snapshot'}</Btn>
           </>
         }
       >
         {formError && <p className="text-xs text-red-300">{formError}</p>}
<div className="grid grid-cols-1 md:grid-cols-3">
           <Field label="Name (unique)"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="pre-update-2026-07-24" /></Field>
           <Field label="Type" hint="Format: tar, zip, docker, lxd, etc. (default: driver-specific)">
             <input className={inputCls} value={type} onChange={(e) => setType(e.target.value)} placeholder="tar" />
           </Field>
           <Field label="Location" hint="Storage path: /mc/, /tmp/snapshots/, etc. (default: driver-specific)">
             <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="/mc/" />
           </Field>
           <div className="md:col-span-2">
             <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Before kernel bump" /></Field>
           </div>
         </div>
       </GlassModal>
    </div>
  );
};

const Backups: BuiltinPageManifestEntry = { slug: 'backups', name: 'Backups', iconName: 'Backups', iconSvg: '<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" />', component: InstanceSnapshots, };

export default Backups;
