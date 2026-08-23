// Automation (instance automation jobs) — built-in instance sub-page (self-contained).
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

export const InstanceAutomation: React.FC = () => {
  const { instance, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [jobs, setJobs] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState<{ jobId: number; r: AutomationRunResult } | null>(null);
  // Tab switch between the Tasks grid and the Recent runs feed.
  const [tab, setTab] = useState<'tasks' | 'runs'>('tasks');
  // Modal: the Create form and the Edit form share one overlay. `editing`
  // is the job being edited (or null when we're creating a fresh one).
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const emptyDraft: AutomationUpsert = { name: '', command: '', schedule: '', enabled: true, secret_refs: [], timeout_sec: 300 };
  const [draft, setDraft] = useState<AutomationUpsert>(emptyDraft);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [j, r] = await Promise.all([listAutomation(instanceId), listAutomationRuns(instanceId, 50)]);
      setJobs(asArray<Automation>(j)); setRuns(asArray<AutomationRun>(r));
    } catch (e: any) {
      setError(errText(e, 'Failed to load automation'));
    } finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="automation" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="automation" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('automation', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (j: Automation) => {
    setEditing(j);
    setDraft({ name: j.name, command: j.command, schedule: j.schedule, enabled: j.enabled, secret_refs: j.secret_refs || [], timeout_sec: j.timeout_sec || 300 });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    if (!draft.name || !draft.command) { setFormError('Name and command are required.'); return; }
    setBusy(true); setFormError('');
    try {
      if (editing) {
        await updateAutomation(instanceId, editing.id, draft);
      } else {
        await createAutomation(instanceId, draft);
      }
      setDraft(emptyDraft);
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(errText(e, 'Failed to save job'));
    } finally { setBusy(false); }
  };

  const remove = async (j: Automation) => {
    if (!confirm(`Delete automation "${j.name}"? Run history will be removed.`)) return;
    try {
      await deleteAutomation(instanceId, j.id);
      await load();
    } catch (e: any) {
      setError(errText(e, 'Failed to delete job'));
    }
  };

  const runNow = async (j: Automation) => {
    setBusy(true); setError(''); setRunResult(null);
    try {
      const r = await runAutomationNow(instanceId, j.id);
      setRunResult({ jobId: j.id, r });
      // The freshly-completed run is rendered in the "Recent runs" tab
      // (under the "Last run — job #N" card). Without this switch the
      // operator kicked a run from a task card on the Tasks tab and saw
      // no immediate feedback — the result landed on the hidden runs
      // tab. Jumping to it mirrors the user's intent ("I just ran it,
      // show me").
      setTab('runs');
      await load();
    } catch (e: any) {
      setError(errText(e, 'Run failed'));
    } finally { setBusy(false); }
  };

  // The 3-dot menu on each task card. Run / Edit are default-tone, Delete is
  // danger-tone so the RichMenu paints it red.
  const menuFor = (j: Automation): CardMenuItem[] => [
    { key: 'run', label: 'Run now', tone: 'default' },
    { key: 'edit', label: 'Edit', tone: 'default' },
    { key: 'delete', label: 'Delete', tone: 'danger' },
  ];
  const onMenu = (key: string, j: Automation) => {
    if (key === 'run') runNow(j);
    else if (key === 'edit') openEdit(j);
    else if (key === 'delete') remove(j);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header: title top-left, Create + Refresh top-right */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Automation</h2>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={openCreate}>+ Create</Btn>
          <Btn onClick={load} disabled={loading}>Refresh</Btn>
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {([['tasks', 'Tasks'], ['runs', 'Recent runs']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${tab === key ? 'text-white border-white' : 'text-gray-400 border-transparent hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tasks tab — card grid with a 3-dot menu per card */}
      {tab === 'tasks' && (
        loading ? (
          <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl animate-pulse">
                <div className="h-4 w-1/2 bg-neutral-800 rounded mb-3" />
                <div className="h-3 w-2/3 bg-neutral-800 rounded mb-2" />
                <div className="h-3 w-1/3 bg-neutral-800 rounded" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Section><EmptyRow text="No tasks yet. Click “Create” to add one." /></Section>
        ) : (
          <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((j) => (
              <div key={j.id} className="glass-card rounded-xl flex flex-col gap-3">
                {/* Card head: name + enabled badge + 3-dot menu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{j.name}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${j.enabled ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' : 'bg-neutral-800 text-gray-400 border-neutral-700'}`}>
                      {j.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <CardMenu
                    items={menuFor(j)}
                    onSelect={(k) => onMenu(k, j)}
                    ariaLabel={`Actions for ${j.name}`}
                  />
                </div>
                {/* Meta row: schedule + last/next */}
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-gray-200">
                    {j.schedule || 'manual'}
                  </span>
                  <span title="Last run">last {timeAgo(j.last_run_at)}</span>
                  <span className="text-gray-600">·</span>
                  <span title="Next run">next {timeAgo(j.next_run_at)}</span>
                  <span className="text-gray-600">·</span>
                  <span>{j.timeout_sec}s</span>
                </div>
                {/* Command preview */}
                <pre className="text-xs font-mono text-gray-300 bg-black/30 border border-white/[0.06] rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto flex-1">{j.command}</pre>
                {(j.secret_refs || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(j.secret_refs || []).map((s) => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-200 border border-amber-700/40">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Recent runs tab — card feed */}
      {tab === 'runs' && (
        <>
          {/* Last manual run inline */}
          {runResult && (
            <Section title={`Last run — job #${runResult.jobId}`} description={`exit=${runResult.r.exit_code} · ${runResult.r.duration_ms}ms`}>
              <div className="space-y-2">
                {runResult.r.error
                  ? <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{runResult.r.error}</pre>
                  : <pre className="text-xs text-emerald-200 font-mono whitespace-pre-wrap break-all">{runResult.r.stdout || '(no stdout)'}</pre>}
                {runResult.r.stderr && <pre className="text-xs text-amber-200 font-mono whitespace-pre-wrap break-all">{runResult.r.stderr}</pre>}
              </div>
            </Section>
          )}
          {runs.length === 0 ? (
            <Section><EmptyRow text="No runs recorded." /></Section>
          ) : (
            <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {runs.map((r) => {
                const failed = r.error || r.exit_code !== 0;
                return (
                  <div key={r.id} className="glass-card rounded-xl flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.trigger === 'schedule' ? 'bg-sky-900/40 text-sky-200 border-sky-700/50' : 'bg-violet-900/40 text-violet-200 border-violet-700/50'}`}>
                        {r.trigger}
                      </span>
                      <span className={`font-mono text-xs ${failed ? 'text-red-300' : 'text-emerald-300'}`}>
                        {r.error ? 'err' : `exit ${r.exit_code}`}
                      </span>
                    </div>
                    <pre className="text-xs font-mono text-gray-300 bg-black/30 border border-white/[0.06] rounded p-2 whitespace-pre-wrap break-all max-h-20 overflow-auto">{r.command}</pre>
                    {r.stdout && <pre className="text-xs text-emerald-200 font-mono whitespace-pre-wrap break-all max-h-20 overflow-auto">{r.stdout}</pre>}
                    {r.stderr && <pre className="text-xs text-amber-200 font-mono whitespace-pre-wrap break-all max-h-16 overflow-auto">{r.stderr}</pre>}
                    {r.error && <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{r.error}</pre>}
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>{timeAgo(r.started_at)}</span>
                      <span className="tabular-nums">{r.duration_ms}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit “${editing.name}”` : 'Create task'}
        maxWidth="max-w-xl"
        footer={
          <>
            <Btn onClick={() => setModalOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : (editing ? 'Save' : 'Create task')}</Btn>
          </>
        }
      >
        {formError && <p className="text-xs text-red-300">{formError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Backup the world" />
          </Field>
          <Field label="Schedule (cron)" hint="5 fields, e.g. '*/10 * * * *'. Empty = manual only.">
            <input className={inputCls} value={draft.schedule} onChange={(e) => setDraft((d) => ({ ...d, schedule: e.target.value }))} placeholder="0 4 * * *" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Command" hint="Run inside the instance via /bin/sh -c.">
              <textarea className={inputCls} rows={3} value={draft.command} onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))} placeholder="tar czf /backup/world.tgz /world" />
            </Field>
          </div>
          <Field label="Secret refs (comma-separated)" hint="Names of vaulted secrets to inject as env.">
            <input className={inputCls} value={(draft.secret_refs || []).join(', ')} onChange={(e) => setDraft((d) => ({ ...d, secret_refs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="BACKUP_S3_KEY, BACKUP_S3_SECRET" />
          </Field>
          <Field label="Timeout (sec)">
            <input type="number" className={inputCls} value={draft.timeout_sec} onChange={(e) => setDraft((d) => ({ ...d, timeout_sec: Number(e.target.value) || 300 }))} />
          </Field>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} /> Enabled
            </label>
          </div>
        </div>
      </GlassModal>
    </div>
  );
};

const Automation: BuiltinPageManifestEntry = { slug: 'automation', name: 'Automation', iconName: 'Automation', iconSvg: '<circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />', component: InstanceAutomation, };

export default Automation;
