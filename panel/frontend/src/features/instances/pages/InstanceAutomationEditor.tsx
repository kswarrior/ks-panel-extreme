import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listAutomation,
  createAutomation,
  updateAutomation,
} from '@/features/instances/api/instanceAdvanced';
import type { Automation, AutomationKind, AutomationStep } from '@/features/instances/types/instanceAdvanced';
import NumberInput from '@/shared/components/ui/NumberInput';
import TextInput from '@/shared/components/ui/TextInput';
import ErrorState from '@/shared/components/ui/ErrorState';
import { useConfirm } from '@/shared/stores/confirmStore';
import { useInstance } from '@/shared/hooks/useInstance';
import { resolveInstanceControls, automationTimeoutCeiling, automationRunLimits } from '@/features/instances/utils/instanceControls';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

interface JobDraft {
  editing: Automation | null;
  name: string;
  kind: AutomationKind;
  payload: string;
  schedule: string;
  command: string;
  actionId: string;
  powerOp: string;
  secretRefs: string;
  timeoutSec: number;
  enabled: boolean;
  steps: AutomationStep[];
}

const POWER_OPS = ['start', 'stop', 'restart', 'kill'] as const;

const STEP_IFS = ['success', 'failure', 'always'] as const;

const emptyStep = (): AutomationStep => ({ name: '', kind: 'shell', command: '', payload: '', if: 'success' });

const emptyDraft = (editing: Automation | null = null): JobDraft => {
  const k = (editing?.kind ?? 'shell') as AutomationKind;
  const payload = editing?.payload ?? '';
  return {
    editing,
    name: editing?.name ?? '',
    kind: k,
    payload,
    schedule: editing?.schedule ?? '',
    command: editing?.command ?? '',
    actionId: k === 'action' ? payload : '',
    powerOp: k === 'power' && (POWER_OPS as readonly string[]).includes(payload) ? payload : 'restart',
    secretRefs: (editing?.secret_refs ?? []).join(', '),
    timeoutSec: editing?.timeout_sec && editing.timeout_sec > 0 ? editing.timeout_sec : 300,
    enabled: editing?.enabled ?? true,
    steps: Array.isArray(editing?.steps) ? editing.steps.map((s) => ({ ...s })) : [],
  };
};

// InstanceAutomationEditor — full-page New job / Edit job form for the
// automation builtin (sub-routes `<slug>/new` and `<slug>/<id>/edit`,
// same pattern as the Files `<slug>/edit` editor page). The list page
// (InstanceAutomation) navigates here instead of opening a modal, so the
// kind picker, steps plan and timeouts get a complete page like the file
// editor. Reads the job via listAutomation (no single-get endpoint);
// create / edit stay behind the caller-provided readOnly gate.
const InstanceAutomationEditor: React.FC<{
  instanceId: number;
  automationSlug: string;
  jobId: number | null;
  readOnly?: boolean;
}> = ({ instanceId, automationSlug, jobId, readOnly = false }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const backTo = `/instances/${instanceId}/${automationSlug}`;

  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [activeOthers, setActiveOthers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // Template ceiling + kind toggles for this instance (snapshotted config).
  // Missing/garbled = allow-all with the 1800s default ceiling.
  const { instance } = useInstance(instanceId);
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const ceiling = automationTimeoutCeiling(controls);
  const autoCfg = controls.shortcuts.automation;
  const limits = automationRunLimits(controls);
  const allowedKinds = (['shell', 'power', 'action'] as AutomationKind[]).filter((k) =>
    k === 'shell' ? autoCfg.allow_shell : k === 'power' ? autoCfg.allow_power : autoCfg.allow_actions,
  );

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      // The list serves edit-find AND the active-jobs count (enabled jobs
      // besides the one being edited) for the template's max_active_jobs
      // gate — same count the backend enforces at write time.
      const jobs = await listAutomation(instanceId);
      const list = Array.isArray(jobs) ? jobs : [];
      if (jobId === null) {
        const d = emptyDraft();
        if (!(allowedKinds.includes(d.kind))) {
          d.kind = allowedKinds[0] ?? 'shell';
        }
        if (d.kind === 'power' && !(POWER_OPS as readonly string[]).includes(d.powerOp)) d.powerOp = 'restart';
        setDraft(d);
        setSavedSnapshot(JSON.stringify(d));
        setActiveOthers(list.filter((j) => j.enabled).length);
        return;
      }
      const found = list.find((j) => j.id === jobId);
      if (!found) {
        setError(`Job #${jobId} not found on this instance.`);
        return;
      }
      const d = emptyDraft(found);
      setDraft(d);
      setSavedSnapshot(JSON.stringify(d));
      setActiveOthers(list.filter((j) => j.enabled && j.id !== jobId).length);
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
    // allowedKinds is derived from the instance config; excluding it keeps
    // the effect on [instanceId, jobId] so a config reload mid-edit never
    // wipes the form (same reason Files keeps its editor load narrow).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draft !== null && JSON.stringify(draft) !== savedSnapshot;

  const goBack = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes',
        message: 'Discard unsaved changes to this job?',
        tone: 'danger',
        confirmLabel: 'Discard',
      });
      if (!ok) return;
    }
    navigate(backTo);
  }, [dirty, confirm, navigate, backTo]);

  const submit = async () => {
    if (!draft || busy) return;
    const name = draft.name.trim();
    if (name === '') {
      setFormError('Name is required.');
      return;
    }
    if (!allowedKinds.includes(draft.kind)) {
      setFormError('This job kind is disabled by the template.');
      return;
    }
    // Per-kind shape (mirrors the backend): shell needs a command unless
    // steps carry the plan; power needs an op; action needs an action ID.
    // With steps the plan carries the targets (top fields are display
    // fallback), so presence checks relax the same way.
    const hasSteps = draft.steps.length > 0;
    let kindPayload = '';
    if (draft.kind === 'power') {
      if (draft.powerOp !== '' && !(POWER_OPS as readonly string[]).includes(draft.powerOp)) {
        setFormError('Pick a power op (start / stop / restart / kill).');
        return;
      }
      if (draft.powerOp === '' && !hasSteps) {
        setFormError('Pick a power op (start / stop / restart / kill).');
        return;
      }
      kindPayload = draft.powerOp;
    } else if (draft.kind === 'action') {
      kindPayload = draft.actionId.trim();
      if (kindPayload === '' && !hasSteps) {
        setFormError('Action ID is required for action jobs (or add steps carrying the plan).');
        return;
      }
    }
    const command = draft.kind === 'shell' ? draft.command : draft.kind === 'action' ? '' : '';
    if (draft.kind === 'shell' && command.trim() === '' && !hasSteps) {
      setFormError('Command is required (or add steps carrying the plan).');
      return;
    }
    // Timeout: operator's own value, capped by the template ceiling
    // (config >= user passes, config < user is rejected here and 400s server-side).
    const timeout = draft.timeoutSec > 0 ? Math.floor(draft.timeoutSec) : 300;
    if (timeout > ceiling) {
      setFormError(`Timeout ${timeout}s exceeds the template maximum of ${ceiling}s.`);
      return;
    }
    // Steps: same per-kind rules per step + step timeouts capped too.
    for (let i = 0; i < draft.steps.length; i++) {
      const st = draft.steps[i];
      if (st.name.trim() === '') {
        setFormError(`Step ${i + 1}: name is required.`);
        return;
      }
      const sk = (st.kind ?? 'shell') as AutomationKind;
      if (!allowedKinds.includes(sk)) {
        setFormError(`Step ${i + 1}: kind "${sk}" is disabled by the template.`);
        return;
      }
      if (sk === 'power' && !(POWER_OPS as readonly string[]).includes(st.payload ?? '')) {
        setFormError(`Step ${i + 1}: pick a power op.`);
        return;
      }
      if (sk === 'action' && (st.payload ?? '').trim() === '') {
        setFormError(`Step ${i + 1}: action ID is required.`);
        return;
      }
      if (sk === 'shell' && (st.command ?? '').trim() === '') {
        setFormError(`Step ${i + 1}: command is required.`);
        return;
      }
      if (st.timeout_sec != null && st.timeout_sec > ceiling) {
        setFormError(`Step ${i + 1}: timeout exceeds the template maximum of ${ceiling}s.`);
        return;
      }
    }
    if (draft.steps.length > 32) {
      setFormError('Too many steps (max 32).');
      return;
    }
    // Active-jobs gate (mirrors the backend 400): enabling past the
    // template's max_active_jobs cap is rejected — an enabled job owns its
    // schedule timer. Re-saving an enabled job never trips it (the count
    // excludes the job being edited).
    if (draft.enabled && limits.active > 0 && activeOthers >= limits.active) {
      setFormError(`Too many active jobs (template maximum ${limits.active}). Disable another job first.`);
      return;
    }
    const secretRefs = draft.secretRefs.split(',').map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setFormError('');
    try {
      const payload = {
        name,
        command,
        kind: draft.kind,
        payload: kindPayload,
        schedule: draft.schedule.trim(),
        enabled: draft.enabled,
        secret_refs: secretRefs,
        timeout_sec: Math.max(1, Math.min(ceiling, timeout)),
        steps: draft.steps.map((s) => ({
          name: s.name.trim().slice(0, 100),
          kind: (s.kind ?? 'shell') as AutomationKind,
          command: s.kind === 'shell' ? (s.command ?? '') : '',
          payload: s.kind === 'shell' ? '' : (s.payload ?? '').trim(),
          if: (s.if ?? 'success') as AutomationStep['if'],
          ...(s.timeout_sec != null && s.timeout_sec > 0 ? { timeout_sec: Math.max(1, Math.min(ceiling, Math.floor(s.timeout_sec))) } : {}),
        })),
      };
      if (draft.editing) {
        await updateAutomation(instanceId, draft.editing.id, payload);
        toast('Job updated', 'success');
      } else {
        await createAutomation(instanceId, payload);
        toast('Job created', 'success');
      }
      navigate(backTo);
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to save job';
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) {
    return (
      <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
        <p className="text-sm">Automation editing is disabled for this instance (read-only).</p>
        <button type="button" onClick={() => navigate(backTo)} className="mt-3 px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Back to automation</button>
      </div>
    );
  }

  if (loading) {
    return <div className="glass-card rounded-xl p-6 animate-pulse"><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  }

  if (!loading && (error || draft === null)) {
    return (
      <ErrorState
        variant="error"
        title={jobId === null ? 'Failed to start a new job' : 'Job not found'}
        description={error || undefined}
        backLabel="Back to automation"
        onBack={() => navigate(backTo)}
        retryLabel={error ? 'Retry' : undefined}
        onRetry={error ? () => void load() : undefined}
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-3 pb-20">
      {/* Header: back + title + save (file-editor pattern). */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void goBack()}
          title="Back to automation"
          aria-label="Back to automation"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h2 className="text-base font-semibold text-white flex-1 min-w-0 truncate">
          {draft?.editing ? `Edit "${draft.editing.name}"` : 'New job'}
          {dirty && <span className="ml-2 text-[11px] font-normal text-amber-300">unsaved</span>}
        </h2>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="px-4 py-1.5 rounded-md text-sm bg-white text-black disabled:opacity-50 shrink-0"
        >
          {busy ? 'Saving…' : draft?.editing ? 'Save' : 'Create'}
        </button>
      </div>

      {draft && (
        <div className="glass-card rounded-xl p-4 sm:p-5 space-y-4 max-w-3xl">
          {formError && <p className="text-xs text-red-300">{formError}</p>}
          <TextInput id="auto-name" label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v.slice(0, 100) })} placeholder="Nightly backup" />
          <TextInput id="auto-schedule" label="Schedule (cron, empty = manual only)" value={draft.schedule} onChange={(v) => setDraft({ ...draft, schedule: v.slice(0, 100) })} placeholder="0 4 * * *" />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auto-kind">Type</label>
            <select
              id="auto-kind"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as AutomationKind })}
              className="glass-field w-full"
            >
              {allowedKinds.includes('shell') && <option value="shell">Shell command — run my own command</option>}
              {allowedKinds.includes('power') && <option value="power">Power — start / stop / restart / kill</option>}
              {allowedKinds.includes('action') && <option value="action">Template action — run any action</option>}
            </select>
            {allowedKinds.length < 3 && (
              <p className="text-[11px] text-gray-500 mt-1">Some types are disabled by the template.</p>
            )}
          </div>
          {draft.kind === 'shell' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auto-command">Command</label>
              <textarea
                id="auto-command"
                value={draft.command}
                onChange={(e) => setDraft({ ...draft, command: e.target.value.slice(0, 8000) })}
                placeholder="tar czf /backups/world.tgz /mc/world"
                rows={4}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">Runs inside the instance via /bin/sh -c. Optional when steps below carry the plan.</p>
            </div>
          )}
          {draft.kind === 'power' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auto-power">Power op</label>
              <select
                id="auto-power"
                value={draft.powerOp}
                onChange={(e) => setDraft({ ...draft, powerOp: e.target.value })}
                className="glass-field w-full"
              >
                {POWER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          )}
          {draft.kind === 'action' && (
            <TextInput id="auto-action" label="Action ID" value={draft.actionId} onChange={(v) => setDraft({ ...draft, actionId: v.slice(0, 128) })} placeholder="backup-world" />
          )}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-sm font-medium text-gray-300">Steps (optional, run in order)</label>
              {draft.steps.length < 32 && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}
                  className="text-xs text-sky-300 hover:text-sky-200 underline"
                >
                  + Add step
                </button>
              )}
            </div>
            {draft.steps.length === 0 && (
              <p className="text-[11px] text-gray-500">No steps — the job fires once (type above). Add steps for a GitHub-style plan with per-step if conditions.</p>
            )}
            <div className="space-y-2">
              {draft.steps.map((st, i) => (
                <div key={i} className="rounded-md border border-white/10 bg-black/30 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-mono shrink-0">{i + 1}.</span>
                    <input
                      value={st.name}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 100) } : x)) })}
                      placeholder="Step name"
                      aria-label={`Step ${i + 1} name`}
                      className="glass-field flex-1 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
                      className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-red-300 hover:bg-white/5"
                      title="Remove step"
                      aria-label={`Remove step ${i + 1}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={st.kind ?? 'shell'}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, kind: e.target.value as AutomationKind } : x)) })}
                      aria-label={`Step ${i + 1} type`}
                      className="glass-field w-full"
                    >
                      {allowedKinds.includes('shell') && <option value="shell">shell</option>}
                      {allowedKinds.includes('power') && <option value="power">power</option>}
                      {allowedKinds.includes('action') && <option value="action">action</option>}
                    </select>
                    <select
                      value={st.if ?? 'success'}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, if: e.target.value as AutomationStep['if'] } : x)) })}
                      aria-label={`Step ${i + 1} condition`}
                      title="success = run when previous steps passed · failure = run when one failed · always = run regardless"
                      className="glass-field w-full font-mono"
                    >
                      {STEP_IFS.map((c) => <option key={c} value={c}>if: {c}</option>)}
                    </select>
                  </div>
                  {(st.kind ?? 'shell') === 'shell' && (
                    <input
                      value={st.command ?? ''}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, command: e.target.value.slice(0, 8000) } : x)) })}
                      placeholder="echo hello"
                      aria-label={`Step ${i + 1} command`}
                      className="glass-field font-mono w-full"
                    />
                  )}
                  {(st.kind ?? 'shell') === 'power' && (
                    <select
                      value={(st.payload ?? '') as string}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, payload: e.target.value } : x)) })}
                      aria-label={`Step ${i + 1} power op`}
                      className="glass-field w-full"
                    >
                      <option value="">pick op…</option>
                      {POWER_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                  )}
                  {(st.kind ?? 'shell') === 'action' && (
                    <input
                      value={st.payload ?? ''}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, payload: e.target.value.slice(0, 128) } : x)) })}
                      placeholder="action-id"
                      aria-label={`Step ${i + 1} action ID`}
                      className="glass-field font-mono w-full"
                    />
                  )}
                </div>
              ))}
            </div>
            {draft.steps.length >= 32 && <p className="text-[11px] text-gray-500">Max 32 steps.</p>}
          </div>
          <TextInput id="auto-refs" label="Secret refs (comma-separated)" value={draft.secretRefs} onChange={(v) => setDraft({ ...draft, secretRefs: v.slice(0, 500) })} placeholder="S3_KEY, S3_SECRET" />
          <NumberInput id="auto-timeout" label={`Timeout (sec, max ${ceiling})`} value={draft.timeoutSec} onChange={(v) => setDraft({ ...draft, timeoutSec: Math.max(1, Math.min(ceiling, v || 300)) })} min={1} max={ceiling} />
          <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="h-4 w-4 accent-emerald-500"
            />
            Enabled
          </label>
          {limits.active > 0 && (
            <p className="text-[11px] text-gray-500 -mt-2">
              {activeOthers + (draft.enabled ? 1 : 0)} of {limits.active} active jobs{activeOthers + (draft.enabled ? 1 : 0) >= limits.active ? ' — at the template maximum' : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default InstanceAutomationEditor;
