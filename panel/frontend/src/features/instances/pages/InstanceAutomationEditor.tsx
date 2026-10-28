import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  listAutomation,
  createAutomation,
  updateAutomation,
} from '@/features/instances/api/instanceAdvanced';
import type {
  Automation,
  AutomationKind,
  AutomationStepIf,
  AutomationUpsert,
} from '@/features/instances/types/instanceAdvanced';
import { resolveAutomationControls } from '@/features/instances/utils/automationControls';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

const POWER_OPS = ['start', 'stop', 'restart', 'kill'] as const;
const STEP_IFS: AutomationStepIf[] = ['success', 'failure', 'always'];

const btnPrimary = 'px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors';
const btnGhost = 'px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition-colors';

interface StepDraft {
  name: string;
  kind: AutomationKind;
  command: string;
  payload: string;
  if: AutomationStepIf;
  timeout_sec?: number;
}

interface JobDraft {
  name: string;
  kind: AutomationKind;
  schedule: string;
  command: string;
  powerOp: string;
  actionId: string;
  secretRefs: string;
  timeoutSec: number;
  enabled: boolean;
  steps: StepDraft[];
}

function errText(e: any, fallback: string): string {
  const raw = e?.response?.data?.error ?? e?.response?.data ?? e?.message;
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return fallback;
}

function defaultsFor(editing: Automation | null, allowedKinds: AutomationKind[]): JobDraft {
  const kind: AutomationKind = editing?.kind ?? allowedKinds[0] ?? 'shell';
  return {
    name: editing?.name ?? '',
    kind,
    schedule: editing?.schedule ?? '',
    command: editing?.command ?? '',
    powerOp: editing?.kind === 'power' && POWER_OPS.includes(editing.payload as any) ? editing.payload : 'restart',
    actionId: editing?.kind === 'action' ? (editing.payload ?? '') : '',
    secretRefs: (editing?.secret_refs ?? []).join(', '),
    timeoutSec: editing && editing.timeout_sec > 0 ? editing.timeout_sec : 300,
    enabled: editing ? !!editing.enabled : true,
    steps: (editing?.steps ?? []).map((s) => ({
      name: s.name || '',
      kind: s.kind || 'shell',
      command: s.command || '',
      payload: s.payload || '',
      if: s.if || 'success',
      timeout_sec: s.timeout_sec,
    })),
  };
}

const InstanceAutomationEditor: React.FC<{ instanceId: number; config?: string }> = ({ instanceId, config }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const confirm = useConfirm();
  const permissions = useAuthStore((s) => s.permissions);
  const canEditPermission = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const autoConfig = useMemo(() => resolveAutomationControls(config), [config]);
  const canEdit = canEditPermission && autoConfig.allowEdit;

  const rawId = params.get('id');
  const jobId = rawId !== null && Number.isFinite(Number(rawId)) ? Number(rawId) : null;

  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [activeOthers, setActiveOthers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const backTo = `/instances/${instanceId}/automation`;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const jobs = await listAutomation(instanceId);
        if (cancelled) return;
        const list = Array.isArray(jobs) ? jobs : [];
        if (jobId === null) {
          const next = defaultsFor(null, autoConfig.allowedKinds);
          setDraft(next);
          setSavedSnapshot(JSON.stringify(next));
          setEditingName('');
          setActiveOthers(list.filter((j) => j.enabled).length);
        } else {
          const found = list.find((j) => j.id === jobId) ?? null;
          if (!found) {
            setDraft(null);
            setError(`Job #${jobId} was not found on this instance.`);
          } else {
            const next = defaultsFor(found, autoConfig.allowedKinds);
            setDraft(next);
            setSavedSnapshot(JSON.stringify(next));
            setEditingName(found.name);
            setActiveOthers(list.filter((j) => j.enabled && j.id !== jobId).length);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(errText(e, 'Failed to load job'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [instanceId, jobId, autoConfig]);

  const dirty = draft !== null && JSON.stringify(draft) !== savedSnapshot;

  const update = (patch: Partial<JobDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setFormError('');
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setDraft((d) => {
      if (!d) return d;
      const steps = d.steps.slice();
      steps[index] = { ...steps[index], ...patch };
      return { ...d, steps };
    });
    setFormError('');
  };

  const goBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: 'This job has changes that have not been saved.',
        confirmLabel: 'Discard',
        tone: 'warning',
      });
      if (!ok) return;
    }
    navigate(backTo);
  };

  const submit = async () => {
    if (!draft || saving) return;
    const fail = (msg: string) => setFormError(msg);
    const name = draft.name.trim();
    if (!name) return fail('Name is required.');
    if (!autoConfig.allowedKinds.includes(draft.kind)) return fail('This job type is disabled by the template.');
    const steps = draft.steps;
    const hasSteps = steps.length > 0;
    if (!hasSteps) {
      if (draft.kind === 'shell' && draft.command.trim() === '') return fail('Command is required (or add steps carrying the plan).');
      if (draft.kind === 'action' && draft.actionId.trim() === '') return fail('Action ID is required (or add steps carrying the plan).');
    }
    const timeout = Math.floor(draft.timeoutSec) > 0 ? Math.floor(draft.timeoutSec) : 300;
    if (timeout > autoConfig.maxTimeoutSec) return fail(`Timeout exceeds the template maximum of ${autoConfig.maxTimeoutSec}s.`);
    if (steps.length > 32) return fail('Too many steps (max 32).');
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const n = i + 1;
      if (!step.name.trim()) return fail(`Step ${n}: name is required.`);
      if (!autoConfig.allowedKinds.includes(step.kind)) return fail(`Step ${n}: this type is disabled by the template.`);
      if (step.kind === 'shell' && !step.command.trim()) return fail(`Step ${n}: command is required.`);
      if (step.kind === 'power' && !POWER_OPS.includes(step.payload as any)) return fail(`Step ${n}: pick a power op.`);
      if (step.kind === 'action' && !step.payload.trim()) return fail(`Step ${n}: action ID is required.`);
      if (step.timeout_sec != null && step.timeout_sec > autoConfig.maxTimeoutSec) return fail(`Step ${n}: timeout exceeds the template maximum.`);
    }
    if (draft.enabled && autoConfig.maxActiveJobs > 0 && activeOthers >= autoConfig.maxActiveJobs) {
      return fail(`Too many active jobs (template maximum ${autoConfig.maxActiveJobs}). Disable another job first.`);
    }

    const payload: AutomationUpsert = {
      name,
      command: draft.kind === 'shell' ? draft.command : '',
      kind: draft.kind,
      payload: draft.kind === 'power' ? draft.powerOp : draft.kind === 'action' ? draft.actionId.trim() : '',
      schedule: draft.schedule.trim(),
      enabled: draft.enabled,
      secret_refs: draft.secretRefs.split(',').map((s) => s.trim()).filter(Boolean),
      timeout_sec: Math.max(1, Math.min(autoConfig.maxTimeoutSec, timeout)),
      steps: steps.map((s) => {
        const out: NonNullable<AutomationUpsert['steps']>[number] = {
          name: s.name.trim().slice(0, 100),
          kind: s.kind,
          command: s.kind === 'shell' ? s.command : '',
          payload: s.kind === 'shell' ? '' : s.payload.trim(),
          if: s.if,
        };
        if (s.timeout_sec != null && s.timeout_sec > 0) {
          out.timeout_sec = Math.max(1, Math.min(autoConfig.maxTimeoutSec, Math.floor(s.timeout_sec)));
        }
        return out;
      }),
    };

    setSaving(true);
    setFormError('');
    try {
      if (jobId !== null) {
        await updateAutomation(instanceId, jobId, payload);
        toast('Job updated', 'success');
      } else {
        await createAutomation(instanceId, payload);
        toast('Job created', 'success');
      }
      navigate(backTo);
    } catch (e: any) {
      setFormError(errText(e, 'Failed to save job'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 space-y-3 animate-pulse" aria-busy="true">
        <div className="h-5 w-1/3 rounded bg-neutral-800" />
        <div className="h-10 w-full rounded bg-neutral-800" />
        <div className="h-10 w-2/3 rounded bg-neutral-800" />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="glass-card rounded-xl p-6 text-center space-y-3">
        <p className="text-sm text-gray-300">
          {autoConfig.allowEdit
            ? 'You need INSTANCES_EDIT permission to edit automation jobs.'
            : 'Automation editing is disabled by this template.'}
        </p>
        <button type="button" className={btnGhost} onClick={() => navigate(backTo)}>Back to automation</button>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="glass-card rounded-xl p-6 text-center space-y-3">
        <p className="text-sm text-gray-300">{jobId === null ? 'Failed to start a new job.' : 'Job not found'}</p>
        {error && <p className="text-xs text-gray-500">{error}</p>}
        <button type="button" className={btnGhost} onClick={() => navigate(backTo)}>Back to automation</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => void goBack()} className={btnGhost} aria-label="Back to automation">Back</button>
          <h2 className="text-xl font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--ks-heading)' }}>
            {jobId !== null ? `Edit "${editingName}"` : 'New automation job'}
            {dirty && <span className="ml-2 text-xs font-normal text-amber-300">unsaved</span>}
          </h2>
          <button type="button" onClick={() => void submit()} disabled={saving || autoConfig.allowedKinds.length === 0} className={btnPrimary}>
            {saving ? 'Saving…' : jobId !== null ? 'Save' : 'Create'}
          </button>
        </div>

        {formError && (
          <div className="ks-card" role="alert" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>
            {formError}
          </div>
        )}
        {autoConfig.allowedKinds.length === 0 && (
          <div className="ks-card" role="alert" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>
            All automation job types are disabled by this template.
          </div>
        )}

        <div className="grid gap-4 max-w-3xl">
          <label className="block text-sm text-gray-300">
            Name
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 100) })}
              placeholder="Nightly backup"
              className="glass-field w-full mt-1"
            />
          </label>

          <label className="block text-sm text-gray-300">
            Schedule (cron, empty = manual only)
            <input
              value={draft.schedule}
              onChange={(e) => update({ schedule: e.target.value.slice(0, 100) })}
              placeholder="0 4 * * *"
              className="glass-field w-full mt-1 font-mono"
            />
          </label>

          <label className="block text-sm text-gray-300">
            Type
            <select
              value={draft.kind}
              onChange={(e) => update({ kind: e.target.value as AutomationKind })}
              className="glass-field w-full mt-1"
            >
              {!autoConfig.allowedKinds.includes(draft.kind) && (
                <option value={draft.kind}>{draft.kind} (disabled by template)</option>
              )}
              {autoConfig.allowedKinds.includes('shell') && <option value="shell">Shell command — run my own command</option>}
              {autoConfig.allowedKinds.includes('power') && <option value="power">Power — start / stop / restart / kill</option>}
              {autoConfig.allowedKinds.includes('action') && <option value="action">Template action — run any action</option>}
            </select>
          </label>

          {draft.kind === 'shell' && (
            <label className="block text-sm text-gray-300">
              Command
              <textarea
                value={draft.command}
                onChange={(e) => update({ command: e.target.value.slice(0, 8000) })}
                rows={4}
                placeholder="tar czf /backups/world.tgz /mc/world"
                className="glass-field w-full mt-1 font-mono"
              />
              <span className="text-[11px] text-gray-500">Runs inside the instance via /bin/sh -c. Optional when steps carry the plan.</span>
            </label>
          )}

          {draft.kind === 'power' && (
            <label className="block text-sm text-gray-300">
              Power op
              <select
                value={draft.powerOp}
                onChange={(e) => update({ powerOp: e.target.value })}
                className="glass-field w-full mt-1"
              >
                {POWER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            </label>
          )}

          {draft.kind === 'action' && (
            <label className="block text-sm text-gray-300">
              Action ID
              <input
                value={draft.actionId}
                onChange={(e) => update({ actionId: e.target.value.slice(0, 128) })}
                placeholder="backup-world"
                className="glass-field w-full mt-1 font-mono"
              />
            </label>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-300">Steps (optional, run in order)</span>
              {draft.steps.length < 32 && (
                <button
                  type="button"
                  onClick={() => update({ steps: [...draft.steps, { name: '', kind: autoConfig.allowedKinds[0] ?? 'shell', command: '', payload: '', if: 'success' }] })}
                  className={btnGhost}
                >
                  Add step
                </button>
              )}
            </div>
            {draft.steps.length === 0 && (
              <p className="text-[11px] text-gray-500">No steps — the job fires once. Add steps for a plan with per-step conditions.</p>
            )}
            {draft.steps.map((step, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-gray-500">{i + 1}.</span>
                  <input
                    value={step.name}
                    onChange={(e) => updateStep(i, { name: e.target.value.slice(0, 100) })}
                    placeholder="Step name"
                    aria-label={`Step ${i + 1} name`}
                    className="glass-field flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => update({ steps: draft.steps.filter((_, idx) => idx !== i) })}
                    className="text-gray-400 hover:text-red-300 px-2 py-1"
                    aria-label={`Remove step ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={step.kind}
                    onChange={(e) => updateStep(i, { kind: e.target.value as AutomationKind })}
                    aria-label={`Step ${i + 1} type`}
                    className="glass-field w-full"
                  >
                    {!autoConfig.allowedKinds.includes(step.kind) && (
                      <option value={step.kind}>{step.kind} (disabled by template)</option>
                    )}
                    {autoConfig.allowedKinds.includes('shell') && <option value="shell">shell</option>}
                    {autoConfig.allowedKinds.includes('power') && <option value="power">power</option>}
                    {autoConfig.allowedKinds.includes('action') && <option value="action">action</option>}
                  </select>
                  <select
                    value={step.if}
                    onChange={(e) => updateStep(i, { if: e.target.value as AutomationStepIf })}
                    aria-label={`Step ${i + 1} condition`}
                    className="glass-field w-full font-mono"
                  >
                    {STEP_IFS.map((c) => <option key={c} value={c}>if: {c}</option>)}
                  </select>
                </div>
                {step.kind === 'shell' && (
                  <input
                    value={step.command}
                    onChange={(e) => updateStep(i, { command: e.target.value.slice(0, 8000) })}
                    placeholder="echo hello"
                    aria-label={`Step ${i + 1} command`}
                    className="glass-field w-full font-mono"
                  />
                )}
                {step.kind === 'power' && (
                  <select
                    value={step.payload}
                    onChange={(e) => updateStep(i, { payload: e.target.value })}
                    aria-label={`Step ${i + 1} power op`}
                    className="glass-field w-full"
                  >
                    <option value="">pick op…</option>
                    {POWER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                )}
                {step.kind === 'action' && (
                  <input
                    value={step.payload}
                    onChange={(e) => updateStep(i, { payload: e.target.value.slice(0, 128) })}
                    placeholder="action-id"
                    aria-label={`Step ${i + 1} action ID`}
                    className="glass-field w-full font-mono"
                  />
                )}
              </div>
            ))}
            {draft.steps.length >= 32 && <p className="text-[11px] text-gray-500">Max 32 steps.</p>}
          </div>

          <label className="block text-sm text-gray-300">
            Secret refs (comma-separated)
            <input
              value={draft.secretRefs}
              onChange={(e) => update({ secretRefs: e.target.value.slice(0, 500) })}
              placeholder="S3_KEY, S3_SECRET"
              className="glass-field w-full mt-1 font-mono"
            />
          </label>

          <label className="block text-sm text-gray-300">
            Timeout (sec, max {autoConfig.maxTimeoutSec})
            <input
              type="number"
              min={1}
              max={autoConfig.maxTimeoutSec}
              value={draft.timeoutSec}
              onChange={(e) => update({ timeoutSec: Number(e.target.value) || 0 })}
              className="glass-field w-full mt-1 font-mono"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="w-4 h-4"
            />
            Enabled
          </label>
          {autoConfig.maxActiveJobs > 0 && (
            <p className="text-[11px] text-gray-500">
              {activeOthers + (draft.enabled ? 1 : 0)} of {autoConfig.maxActiveJobs} active jobs
              {activeOthers >= autoConfig.maxActiveJobs ? ' — at the template maximum' : ''}.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button type="button" onClick={() => void goBack()} className={btnGhost}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving || autoConfig.allowedKinds.length === 0} className={btnPrimary}>
            {saving ? 'Saving…' : jobId !== null ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstanceAutomationEditor;
