import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listAutomation,
  listAutomationRuns,
  deleteAutomation,
  runAutomationNow,
  downloadAutomation,
  importAutomationFile,
  importAutomationURL,
} from '@/features/instances/api/instanceAdvanced';
import type { Automation, AutomationRun } from '@/features/instances/types/instanceAdvanced';
import { resolveAutomationControls } from '@/features/instances/utils/automationControls';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

const btnPrimary = 'px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors';
const btnGhost = 'px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition-colors';
const btnDanger = 'px-3 py-1.5 rounded-md text-sm bg-red-800 text-white hover:bg-red-700 disabled:opacity-50 transition-colors';
const btnSm = 'px-2.5 py-1 rounded-md text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition-colors';
const btnSmDanger = 'px-2.5 py-1 rounded-md text-xs bg-red-900/70 text-red-100 hover:bg-red-800 disabled:opacity-50 transition-colors';

function errText(e: any, fallback: string): string {
  const raw = e?.response?.data?.error ?? e?.response?.data ?? e?.message;
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return fallback;
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(iso).toLocaleString();
}

function jobSummary(job: Automation): string {
  const steps = job.steps ?? [];
  if (steps.length > 0) return `${steps.length} step${steps.length === 1 ? '' : 's'} · ${job.kind}`;
  if (job.kind === 'power') return `power · ${job.payload || '—'}`;
  if (job.kind === 'action') return `action · ${job.payload || '—'}`;
  return job.command || job.kind;
}

const InstanceAutomation: React.FC<{ instanceId: number; config?: string }> = ({ instanceId, config }) => {
  const navigate = useNavigate();
  const permissions = useAuthStore((s) => s.permissions);
  const canEditPermission = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const autoConfig = useMemo(() => resolveAutomationControls(config), [config]);
  const canEdit = canEditPermission && autoConfig.allowEdit;
  const confirm = useConfirm();

  const [jobs, setJobs] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [tab, setTab] = useState<'tasks' | 'runs'>('tasks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runBusyId, setRunBusyId] = useState<number | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [showImportUrl, setShowImportUrl] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      const [jobRows, runRows] = await Promise.all([
        listAutomation(instanceId),
        listAutomationRuns(instanceId, 50),
      ]);
      setJobs(Array.isArray(jobRows) ? jobRows : []);
      setRuns(Array.isArray(runRows) ? runRows : []);
    } catch (e: any) {
      setError(errText(e, 'Failed to load automation'));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (job?: Automation) => {
    navigate(`/instances/${instanceId}/automation/edit${job ? `?id=${job.id}` : ''}`);
  };

  const handleDelete = async (job: Automation) => {
    const ok = await confirm({
      title: 'Delete automation job?',
      message: `"${job.name}" and its run history will be removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteAutomation(instanceId, job.id);
      toast('Job deleted', 'success');
      await load();
    } catch (e: any) {
      toast(errText(e, 'Delete failed'), 'error');
    }
  };

  const handleRun = async (job: Automation) => {
    if (runBusyId !== null) return;
    setRunBusyId(job.id);
    try {
      const res = await runAutomationNow(instanceId, job.id);
      toast(`Run finished (exit ${res.exit_code})`, res.exit_code === 0 ? 'success' : 'error');
      setTab('runs');
      await load();
    } catch (e: any) {
      toast(errText(e, 'Run failed'), 'error');
    } finally {
      setRunBusyId(null);
    }
  };

  const handleDownload = async (job: Automation) => {
    try {
      const blob = await downloadAutomation(instanceId, job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(job.name).replace(/[^a-zA-Z0-9-_ .]/g, '_').slice(0, 64) || 'automation'}.yaml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      toast(errText(e, 'Download failed'), 'error');
    }
  };

  const handleFile = async (file?: File) => {
    if (!file || importBusy) return;
    setImportBusy(true);
    try {
      const res = await importAutomationFile(instanceId, file);
      toast(`Imported job #${res.id}`, 'success');
      await load();
    } catch (e: any) {
      toast(errText(e, 'Import failed'), 'error');
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImportUrl = async () => {
    const url = importUrl.trim();
    if (!url || importBusy) return;
    setImportBusy(true);
    try {
      const res = await importAutomationURL(instanceId, url);
      toast(`Imported job #${res.id}`, 'success');
      setImportUrl('');
      setShowImportUrl(false);
      await load();
    } catch (e: any) {
      toast(errText(e, 'Import failed'), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--ks-heading)' }}>Automation</h2>
            <p className="text-sm text-gray-400 mt-1">Scheduled and manual jobs for this instance, with run history and YAML transfer.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => void load()} disabled={loading || importBusy} className={btnGhost}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {canEdit && (
              <>
                <button type="button" onClick={() => openEditor()} className={btnPrimary}>New job</button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={importBusy} className={btnGhost}>
                  {importBusy ? 'Importing…' : 'Upload YAML'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".yaml,.yml,.json"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <button type="button" onClick={() => setShowImportUrl((v) => !v)} className={btnGhost}>
                  Import from URL
                </button>
              </>
            )}
          </div>
        </div>

        {showImportUrl && canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleImportUrl(); }}
              placeholder="https://example.com/backup.yaml"
              aria-label="Automation YAML URL"
              className="glass-field flex-1 min-w-[16rem] font-mono"
            />
            <button type="button" onClick={() => void handleImportUrl()} disabled={importBusy || !importUrl.trim()} className={btnPrimary}>
              {importBusy ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}

        {error && (
          <div className="ks-card" role="alert" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>
            {error}
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-gray-500">
            {autoConfig.allowEdit
              ? 'You need INSTANCES_EDIT permission to change automation jobs.'
              : 'Automation editing is disabled by this template.'}
          </p>
        )}

        <div className="flex items-center gap-2 border-b border-white/10">
          {(['tasks', 'runs'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              role="tab"
              aria-selected={tab === key}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-white text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {key === 'tasks' ? `Tasks (${jobs.length})` : `Recent runs (${runs.length})`}
            </button>
          ))}
        </div>

        {loading && jobs.length === 0 && runs.length === 0 ? (
          <div className="space-y-2 animate-pulse" aria-busy="true">
            <div className="h-4 w-40 rounded bg-neutral-800" />
            <div className="h-4 w-64 rounded bg-neutral-800" />
            <div className="h-4 w-52 rounded bg-neutral-800" />
          </div>
        ) : tab === 'tasks' ? (
          jobs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-300">No automation jobs yet.</p>
              <p className="text-xs text-gray-500 mt-1">Create a job to schedule a command, power op or template action.</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
              {jobs.map((job) => {
                const steps = job.steps ?? [];
                return (
                  <div key={job.id} className="ks-card rounded-lg border border-white/10 p-4 space-y-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${job.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`}
                          title={job.enabled ? 'Enabled' : 'Disabled'}
                        />
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--ks-heading)' }} title={job.name}>{job.name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => void handleRun(job)} disabled={runBusyId !== null} className={btnSm}>
                              {runBusyId === job.id ? 'Running…' : 'Run'}
                            </button>
                            <button type="button" onClick={() => openEditor(job)} className={btnSm}>Edit</button>
                          </>
                        )}
                        <button type="button" onClick={() => void handleDownload(job)} className={btnSm}>YAML</button>
                        {canEdit && (
                          <button type="button" onClick={() => void handleDelete(job)} className={btnSmDanger}>Delete</button>
                        )}
                      </div>
                    </div>
                    <p className="font-mono text-xs text-gray-300 break-all" title={job.command || ''}>{jobSummary(job)}</p>
                    {steps.length > 0 && (
                      <ul className="text-[11px] text-gray-500 space-y-1">
                        {steps.slice(0, 4).map((step, i) => (
                          <li key={`${job.id}-${i}`} className="font-mono truncate" title={`${step.name} [${step.kind || 'shell'}, if: ${step.if || 'success'}]`}>
                            {i + 1}. {step.name} <span className="opacity-70">[{step.kind || 'shell'} · if:{step.if || 'success'}]</span>
                          </li>
                        ))}
                        {steps.length > 4 && <li className="opacity-70">+{steps.length - 4} more…</li>}
                      </ul>
                    )}
                    <dl className="text-[11px] text-gray-500 space-y-1">
                      <div className="flex gap-1"><dt>Schedule</dt><dd className="font-mono text-gray-300">{job.schedule.trim() !== '' ? job.schedule : 'manual only'}</dd></div>
                      <div className="flex gap-1"><dt>Next</dt><dd className="text-gray-300">{fmtTime(job.next_run_at)}</dd><dt>· Last</dt><dd className="text-gray-300">{fmtTime(job.last_run_at)}</dd></div>
                      {(job.secret_refs ?? []).length > 0 && (
                        <div className="flex gap-1"><dt>Secrets</dt><dd className="font-mono text-gray-300 break-all">{(job.secret_refs ?? []).join(', ')}</dd></div>
                      )}
                      <div className="flex gap-1"><dt>Timeout</dt><dd className="text-gray-300">{job.timeout_sec > 0 ? `${job.timeout_sec}s` : 'default'}</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )
        ) : runs.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-300">No runs yet.</p>
            <p className="text-xs text-gray-500 mt-1">Manual and scheduled executions appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-gray-400">
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 font-medium">Exit</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const jobName = jobs.find((j) => j.id === run.job_id)?.name ?? `#${run.job_id}`;
                  return (
                    <tr key={run.id} className="border-t border-white/5 align-top">
                      <td className="px-3 py-2 text-gray-200 max-w-[12rem] truncate" title={jobName}>{jobName}</td>
                      <td className="px-3 py-2 text-gray-300">{run.trigger}</td>
                      <td className={`px-3 py-2 font-mono ${run.exit_code === 0 ? 'text-emerald-400' : 'text-red-400'}`}>{run.exit_code}</td>
                      <td className="px-3 py-2 font-mono text-gray-300">{run.duration_ms}ms</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtTime(run.started_at)}</td>
                      <td className="px-3 py-2 min-w-[16rem] max-w-[28rem]">
                        {run.error && <p className="text-xs mb-1 break-words" style={{ color: 'var(--ks-bad)' }}>{run.error}</p>}
                        {run.stdout && (
                          <pre className="font-mono text-[11px] text-gray-300 whitespace-pre-wrap break-all max-h-24 overflow-auto m-0">{String(run.stdout).slice(0, 2000)}</pre>
                        )}
                        {run.stderr && (
                          <pre className="font-mono text-[11px] text-amber-300 whitespace-pre-wrap break-all max-h-24 overflow-auto mt-1 mb-0">{String(run.stderr).slice(0, 2000)}</pre>
                        )}
                        {!run.stdout && !run.stderr && !run.error && <span className="text-xs text-gray-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstanceAutomation;
