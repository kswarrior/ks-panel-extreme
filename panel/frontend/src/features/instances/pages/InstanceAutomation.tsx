import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listAutomation,
  deleteAutomation,
  listAutomationRuns,
  runAutomationNow,
  downloadAutomation,
  importAutomationFile,
  importAutomationURL,
} from '@/features/instances/api/instanceAdvanced';
import type { Automation, AutomationRun } from '@/features/instances/types/instanceAdvanced';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';
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

// InstanceAutomation — native automation jobs + runs page for the automation
// shortcut slug (default `automation`, customizable in Instance Controls).
// Self-sufficient builtin like Files / Terminal / Ports: always renders, no
// library import needed. Reads are open to any instance viewer; create /
// edit / delete / Run now hide behind the shortcut's "Allow Add / Edit /
// Delete" page option plus INSTANCES_EDIT|MANAGE_INSTANCES (same split as
// the Ports editor's readOnly + canEdit). New job / Edit are complete
// sub-pages (`<slug>/new`, `<slug>/<id>/edit`, file-editor pattern) hosted
// by InstanceAutomationEditor — this page only lists, runs and transfers.
const InstanceAutomation: React.FC<{ readOnly?: boolean; automationSlug?: string }> = ({ readOnly = false, automationSlug = 'automation' }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const instanceId = Number(id);
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = !readOnly && hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();
  const editorBase = `/instances/${instanceId}/${automationSlug}`;

  const [jobs, setJobs] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runBusyId, setRunBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<'tasks' | 'runs'>('tasks');
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [showImportUrl, setShowImportUrl] = useState(false);

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

  // New job / Edit are complete sub-pages (`<slug>/new`, `<slug>/<id>/edit`,
  // file-editor pattern) hosted by InstanceAutomationEditor.
  const openCreate = () => {
    navigate(`${editorBase}/new`);
  };

  const openEdit = (job: Automation) => {
    navigate(`${editorBase}/${job.id}/edit`);
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

  const handleDownload = async (job: Automation) => {
    try {
      const blob = await downloadAutomation(instanceId, job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.name.replace(/[^a-zA-Z0-9-_ .]/g, '_').slice(0, 64) || 'automation'}.yaml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast(e?.response?.data || e?.message || 'Download failed', 'error');
    }
  };

  const handleLocalFile = async (f: File | undefined) => {
    if (!f || importBusy) return;
    setImportBusy(true);
    try {
      const res = await importAutomationFile(instanceId, f);
      toast(`Imported (job #${res.id})`, 'success');
      await load();
    } catch (e: any) {
      toast(e?.response?.data || e?.message || 'Import failed', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImportUrl = async () => {
    const u = importUrl.trim();
    if (!u || importBusy) return;
    setImportBusy(true);
    try {
      const res = await importAutomationURL(instanceId, u);
      toast(`Imported (job #${res.id})`, 'success');
      setImportUrl('');
      setShowImportUrl(false);
      await load();
    } catch (e: any) {
      toast(e?.response?.data || e?.message || 'Import failed', 'error');
    } finally {
      setImportBusy(false);
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

      {/* Transfer row: upload local YAML + import by URL (editors); every
          viewer can download a job's YAML from its card menu. */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="ks-btn-header ks-tab shrink-0 px-3 py-1.5 rounded text-sm cursor-pointer">
            <input
              type="file"
              accept=".yaml,.yml,.json"
              className="hidden"
              disabled={importBusy}
              onChange={(e) => { void handleLocalFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            {importBusy ? 'Importing…' : 'Upload YAML'}
          </label>
          <button
            type="button"
            onClick={() => setShowImportUrl((v) => !v)}
            className="ks-btn-header ks-tab shrink-0 px-3 py-1.5 rounded text-sm"
          >
            Import from URL
          </button>
          {showImportUrl && (
            <span className="flex items-center gap-2 flex-1 min-w-[12rem]">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/backup.yaml"
                aria-label="Automation YAML URL"
                className="glass-field font-mono flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => void handleImportUrl()}
                disabled={importBusy || importUrl.trim() === ''}
                className="px-3 py-1.5 rounded-md text-sm bg-white text-black disabled:opacity-50"
              >
                {importBusy ? 'Importing…' : 'Import'}
              </button>
            </span>
          )}
        </div>
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
                  <CardMenu
                    items={[
                      ...(canEdit ? [
                        { key: 'run', label: 'Run now' },
                        { key: 'edit', label: 'Edit' },
                      ] as const : []),
                      { key: 'download', label: 'Download YAML' },
                      ...(canEdit ? [{ key: 'delete', label: 'Delete', tone: 'danger' }] as const : []),
                    ]}
                    onSelect={(k) => {
                      if (k === 'run') void handleRunNow(job);
                      else if (k === 'edit') openEdit(job);
                      else if (k === 'download') void handleDownload(job);
                      else if (k === 'delete') void handleDelete(job);
                    }}
                    ariaLabel={`Actions for ${job.name}`}
                  />
                </div>
                <p className="font-mono text-xs text-gray-300 break-all" title={job.command}>
                  {(job.steps?.length ?? 0) > 0 ? `${job.steps!.length} step${job.steps!.length === 1 ? '' : 's'} · ${job.kind}` : (job.command || `${job.kind}:${job.payload}`)}
                </p>
                {(job.steps?.length ?? 0) > 0 && (
                  <ul className="text-[11px] text-gray-400 space-y-0.5">
                    {job.steps!.slice(0, 4).map((s, i) => (
                      <li key={i} className="truncate font-mono" title={`${s.name} [${s.kind ?? 'shell'}, if: ${s.if ?? 'success'}]`}>
                        {i + 1}. {s.name} <span className="text-gray-600">[{s.kind ?? 'shell'} · if:{s.if ?? 'success'}]</span>
                      </li>
                    ))}
                    {job.steps!.length > 4 && <li className="text-gray-600">+{job.steps!.length - 4} more…</li>}
                  </ul>
                )}
                {!(job.steps?.length) && job.command && (
                  <p className="font-mono text-xs text-gray-500 break-all" title={job.command}>{job.command}</p>
                )}
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

    </div>
  );
};

export default InstanceAutomation;
