import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  listAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  listAutomationRuns,
  runAutomationNow,
} from '@/features/instances/api/instanceAdvanced';
import type { Automation, AutomationRun } from '@/features/instances/types/instanceAdvanced';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';
import Modal from '@/shared/components/ui/Modal';
import NumberInput from '@/shared/components/ui/NumberInput';
import TextInput from '@/shared/components/ui/TextInput';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import ErrorState from '@/shared/components/ui/ErrorState';
import PageActionsPill, { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  return new Date(iso).toLocaleString();
}

interface JobDraft {
  editing: Automation | null;
  name: string;
  schedule: string;
  command: string;
  secretRefs: string;
  timeoutSec: number;
  enabled: boolean;
}

const emptyDraft = (editing: Automation | null = null): JobDraft => ({
  editing,
  name: editing?.name ?? '',
  schedule: editing?.schedule ?? '',
  command: editing?.command ?? '',
  secretRefs: (editing?.secret_refs ?? []).join(', '),
  timeoutSec: editing?.timeout_sec && editing.timeout_sec > 0 ? editing.timeout_sec : 300,
  enabled: editing?.enabled ?? true,
});

// InstanceAutomation — native automation jobs + runs page for the automation
// shortcut slug (default `automation`, customizable in Instance Controls).
// Self-sufficient builtin like Files / Terminal / Ports: always renders, no
// library import needed. Reads are open to any instance viewer; create /
// edit / delete / Run now hide behind the shortcut's "Allow Add / Edit /
// Delete" page option plus INSTANCES_EDIT|MANAGE_INSTANCES (same split as
// the Ports editor's readOnly + canEdit).
const InstanceAutomation: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const { id } = useParams();
  const instanceId = Number(id);
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = !readOnly && hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();

  const [jobs, setJobs] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [runBusyId, setRunBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<'tasks' | 'runs'>('tasks');
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      const [j, r] = await Promise.all([
        listAutomation(instanceId),
        listAutomationRuns(instanceId, 50),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setRuns(Array.isArray(r) ? r : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data || e?.message || 'Failed to load automation');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setFormError('');
    setDraft(emptyDraft());
  };

  const openEdit = (job: Automation) => {
    setFormError('');
    setDraft(emptyDraft(job));
  };

  const submitDraft = async () => {
    if (!draft || busy) return;
    const name = draft.name.trim();
    const command = draft.command;
    if (name === '' || command.trim() === '') {
      setFormError('Name and command are required.');
      return;
    }
    const secretRefs = draft.secretRefs.split(',').map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setFormError('');
    try {
      const payload = {
        name,
        command,
        schedule: draft.schedule.trim(),
        enabled: draft.enabled,
        secret_refs: secretRefs,
        timeout_sec: draft.timeoutSec > 0 ? draft.timeoutSec : 300,
      };
      if (draft.editing) {
        await updateAutomation(instanceId, draft.editing.id, payload);
        toast('Job updated', 'success');
      } else {
        await createAutomation(instanceId, payload);
        toast('Job created', 'success');
      }
      setDraft(null);
      await load();
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to save job';
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (job: Automation) => {
    const ok = await confirm({
      title: 'Delete automation?',
      message: `Delete "${job.name}"? Run history will be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteAutomation(instanceId, job.id);
      toast('Job deleted', 'success');
      await load();
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to delete job';
      toast(typeof msg === 'string' ? msg : JSON.stringify(msg), 'error');
    }
  };

  const handleRunNow = async (job: Automation) => {
    if (runBusyId !== null) return;
    setRunBusyId(job.id);
    try {
      const res = await runAutomationNow(instanceId, job.id);
      toast(`Run finished (exit ${res.exit_code})`, res.exit_code === 0 ? 'success' : 'error');
      setTab('runs');
      await load();
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Run failed';
      toast(typeof msg === 'string' ? msg : JSON.stringify(msg), 'error');
    } finally {
      setRunBusyId(null);
    }
  };

  if (loading) {
    return <div className="glass-card rounded-xl p-6 animate-pulse"><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  }

  if (!loading && error && jobs.length === 0 && runs.length === 0) {
    return (
      <ErrorState
        variant="error"
        title="Failed to load automation"
        description={typeof error === 'string' ? error : JSON.stringify(error)}
        retryLabel="Retry"
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-3">
      {/* Top-right actions pill (ports pattern): refresh + create. No title
          heading — the header breadcrumb already shows the page name. */}
      <PageActionsPill outerClassName="fixed top-[max(7rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
          className="ks-btn-header ks-icon-btn shrink-0 disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            disabled={busy}
            title="Create task"
            aria-label="Create task"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-40"
            style={PILL_TAB_STYLE}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New job
            </span>
          </button>
        )}
      </PageActionsPill>

      {/* Desktop tab row (files pattern); phones use the bottom pill below. */}
      <div className="hidden lg:flex items-center gap-1" role="tablist" aria-label="Automation views">
        {(['tasks', 'runs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            title={t === 'tasks' ? 'Scheduled and manual jobs' : 'Recent run history'}
            className={`ks-tab inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition${tab === t ? ' ks-tab-active' : ''}`}
          >
            <span>{t === 'tasks' ? `Tasks (${jobs.length})` : `Recent runs (${runs.length})`}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>{error}</div>
      )}

      {tab === 'tasks' ? (
        jobs.length === 0 ? (
          <div className="glass-card rounded-xl text-center py-10 px-6">
            <p className="text-sm text-gray-300">No automation jobs yet.</p>
            <p className="text-xs text-gray-500 mt-1">{canEdit ? 'Click New job to schedule a command inside this instance.' : 'An editor can add scheduled jobs here.'}</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <div key={job.id} className="glass-card rounded-xl p-4 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${job.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`} title={job.enabled ? 'Enabled' : 'Disabled'} aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-white truncate" title={job.name}>{job.name}</h3>
                  </div>
                  {canEdit && (
                    <CardMenu
                      items={[
                        { key: 'run', label: 'Run now' },
                        { key: 'edit', label: 'Edit' },
                        { key: 'delete', label: 'Delete', tone: 'danger' },
                      ]}
                      onSelect={(k) => {
                        if (k === 'run') void handleRunNow(job);
                        else if (k === 'edit') openEdit(job);
                        else if (k === 'delete') void handleDelete(job);
                      }}
                      ariaLabel={`Actions for ${job.name}`}
                    />
                  )}
                </div>
                <p className="font-mono text-xs text-gray-300 break-all" title={job.command}>{job.command}</p>
                <dl className="text-[11px] text-gray-500 space-y-0.5">
                  <div className="flex gap-1.5"><dt className="shrink-0 uppercase tracking-wide">Schedule</dt><dd className="font-mono text-gray-400 truncate">{job.schedule.trim() !== '' ? job.schedule : 'manual only'}</dd></div>
                  <div className="flex gap-1.5"><dt className="shrink-0 uppercase tracking-wide">Next</dt><dd className="truncate">{fmtTime(job.next_run_at)}</dd></div>
                  <div className="flex gap-1.5"><dt className="shrink-0 uppercase tracking-wide">Last</dt><dd className="truncate">{fmtTime(job.last_run_at)}</dd></div>
                  {job.secret_refs.length > 0 && (
                    <div className="flex gap-1.5"><dt className="shrink-0 uppercase tracking-wide">Secrets</dt><dd className="font-mono truncate">{job.secret_refs.join(', ')}</dd></div>
                  )}
                  <div className="flex gap-1.5"><dt className="shrink-0 uppercase tracking-wide">Timeout</dt><dd>{job.timeout_sec > 0 ? `${job.timeout_sec}s` : 'default'}</dd></div>
                </dl>
                {canEdit && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => void handleRunNow(job)}
                      disabled={runBusyId === job.id}
                      className="ks-btn-primary ks-btn w-full disabled:opacity-40"
                    >
                      {runBusyId === job.id ? 'Running…' : 'Run now'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : runs.length === 0 ? (
        <div className="glass-card rounded-xl text-center py-10 px-6">
          <p className="text-sm text-gray-300">No runs yet.</p>
          <p className="text-xs text-gray-500 mt-1">Manual and scheduled executions appear here.</p>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-white/10">
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-4 py-2 font-medium">Trigger</th>
                  <th className="px-4 py-2 font-medium">Exit</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const jobName = jobs.find((j) => j.id === run.job_id)?.name ?? `#${run.job_id}`;
                  return (
                    <tr key={run.id} className="border-b border-white/5 hover:bg-white/[0.03] align-top">
                      <td className="px-4 py-2 text-white max-w-[12rem] truncate" title={jobName}>{jobName}</td>
                      <td className="px-4 py-2 text-gray-300">{run.trigger}</td>
                      <td className="px-4 py-2 font-mono">
                        <span className={run.exit_code === 0 ? 'text-emerald-300' : 'text-red-300'}>{run.exit_code}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-300">{run.duration_ms}ms</td>
                      <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{fmtTime(run.started_at)}</td>
                      <td className="px-4 py-2 min-w-[16rem] max-w-[28rem]">
                        {run.error && <p className="text-xs text-red-300 break-words mb-1">{run.error}</p>}
                        {run.stdout && <pre className="ks-mono text-[11px] text-gray-300 whitespace-pre-wrap break-all max-h-24 overflow-auto">{run.stdout.slice(0, 2000)}</pre>}
                        {run.stderr && <pre className="ks-mono text-[11px] text-amber-200/90 whitespace-pre-wrap break-all max-h-24 overflow-auto mt-1">{run.stderr.slice(0, 2000)}</pre>}
                        {!run.stdout && !run.stderr && !run.error && <span className="text-xs text-gray-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phone tabs — Tasks / Runs switcher pinned bottom (phones only). */}
      <PageTabsPill ariaLabel="Automation views" activeLabel={tab === 'tasks' ? `Tasks (${jobs.length})` : `Recent runs (${runs.length})`} spacer={false}>
        {(['tasks', 'runs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`ks-tab shrink-0 flex-none whitespace-nowrap px-3 py-1.5 rounded text-sm text-center transition${tab === t ? ' ks-tab-active' : ''}`}
          >
            <span className="whitespace-nowrap leading-none">{t === 'tasks' ? `Tasks (${jobs.length})` : `Runs (${runs.length})`}</span>
          </button>
        ))}
      </PageTabsPill>

      <Modal
        open={draft !== null}
        onClose={() => { if (!busy) setDraft(null); }}
        title={draft?.editing ? `Edit "${draft.editing.name}"` : 'New job'}
        maxWidth="max-w-xl"
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white disabled:opacity-40">Cancel</button>
            <button type="button" onClick={() => void submitDraft()} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-white text-black disabled:opacity-50">{busy ? 'Saving…' : draft?.editing ? 'Save' : 'Create'}</button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            {formError && <p className="text-xs text-red-300">{formError}</p>}
            <TextInput id="auto-name" label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v.slice(0, 100) })} placeholder="Nightly backup" />
            <TextInput id="auto-schedule" label="Schedule (cron, empty = manual only)" value={draft.schedule} onChange={(v) => setDraft({ ...draft, schedule: v.slice(0, 100) })} placeholder="0 4 * * *" />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auto-command">Command</label>
              <textarea
                id="auto-command"
                value={draft.command}
                onChange={(e) => setDraft({ ...draft, command: e.target.value.slice(0, 8000) })}
                placeholder="tar czf /backups/world.tgz /mc/world"
                rows={3}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">Runs inside the instance via /bin/sh -c.</p>
            </div>
            <TextInput id="auto-refs" label="Secret refs (comma-separated)" value={draft.secretRefs} onChange={(v) => setDraft({ ...draft, secretRefs: v.slice(0, 500) })} placeholder="S3_KEY, S3_SECRET" />
            <NumberInput id="auto-timeout" label="Timeout (sec)" value={draft.timeoutSec} onChange={(v) => setDraft({ ...draft, timeoutSec: Math.max(1, Math.min(1800, v || 300)) })} min={1} max={1800} />
            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
              Enabled
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default InstanceAutomation;
