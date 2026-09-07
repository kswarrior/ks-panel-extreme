import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { startInstance, stopInstance, restartInstance, killInstance } from '@/shared/api/admin';
import { invokeInstanceAction, stopInstanceAction } from '@/features/instances/api/instanceAdvanced';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { resolveInstanceControls } from '../utils/instanceControls';
import { isPageAllowed } from '@/shared/utils/instancePages';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useAuthStore } from '@/shared/stores/authStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';

// actionAllowedStates normalises an action's allowed_states (saved as a
// string[] by the template form, possibly a CSV string in older specs)
// into lowercase tokens. Empty = allowed in every instance state.
function actionAllowedStates(a: any): string[] {
  const raw = a?.allowed_states;
  const list: string[] = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' && raw.trim() !== '' ? raw.split(',') : []);
  return list.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean);
}

// actionStateOk reports whether an action may run while the instance is in
// `status`. An empty allow-list means every state.
function actionStateOk(a: any, status: string): boolean {
  const toks = actionAllowedStates(a);
  if (toks.length === 0) return true;
  return toks.includes(String(status ?? '').trim().toLowerCase());
}

type ActionPhase = 'running' | 'ok' | 'err' | 'idle';

// actionTone maps an action's lifecycle phase to its row colors: running
// (or busy/stopping) → yellow, failed → red, finished OK → green, idle →
// normal text. Shared by the selector row and every dropdown row.
function actionTone(phase: ActionPhase): string {
  switch (phase) {
    case 'running':
      return 'text-yellow-300 hover:bg-yellow-900/30';
    case 'err':
      return 'text-red-300 hover:bg-red-900/30';
    case 'ok':
      return 'text-emerald-300 hover:bg-emerald-900/30';
    default:
      return 'text-gray-200 hover:bg-white/10';
  }
}

function actionPhase(isActive: boolean, outcome: 'ok' | 'err' | undefined): ActionPhase {
  if (isActive) return 'running';
  return outcome ?? 'idle';
}

// InstancePowerMenu — power controls for an instance as menu sections
// (no pill chrome). Rendered at the TOP of the floating instance menu:
// a Start / Stop / Restart / Kill button row first (with a divider line
// below it, mirroring the line below Actions), then the template Actions
// selector below it: a bordered `name | chevron` row where clicking the
// name runs/stops the shown action and clicking the SVG chevron (resting
// `<`-style, rotating down) drops down every action. Action rows are
// phase-colored — running yellow, failed red, finished-OK green, idle
// normal text. Rendered in the middle of the floating instance menu
// (status row above, actions are the last section). Same run/stop
// semantics + state gating as the old pill; the menu owns dismissal
// (scrim / Escape), so this only polls while mounted (the menu portal
// mounts it only while open).
const InstancePowerMenu: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { instance, loading, reload } = useInstance(instanceId);

  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | 'kill' | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState<string | null>(null);
  const confirm = useConfirm();
  // Selector state: which action the bordered row shows, and whether the
  // full action list is dropped down beneath it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const permissions = useAuthStore((s) => s.permissions);

  // Template allow-list for the built-in controls (instance.Config
  // snapshot, allow-all default). Gated together with canControl below.
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);

  // Template actions ride on the instance config (same source the home-page
  // Actions card reads: inst.config.actions), filtered the same way —
  // non-empty id + user_invokable !== false. Hidden entirely when the
  // template disallows them.
  const templateActions = useMemo((): any[] => {
    if (!controls.allow_template_actions) return [];
    try {
      const cfg = instance?.config ? parseConfig(instance.config) : null;
      const list = Array.isArray((cfg as any)?.actions) ? (cfg as any).actions : [];
      return list.filter(
        (a: any) => a && typeof a.id === 'string' && a.id.trim() !== '' && a.user_invokable !== false,
      );
    } catch {
      return [];
    }
  }, [instance?.config, controls.allow_template_actions]);

  // Running-action tracking — mirrors the Actions card: install_state
  // 'running' + install_kind 'action' morphs the matching row to Stop.
  const workflowInFlight = !!instance && instance.install_state === 'running';
  const runningActionId =
    workflowInFlight && instance.install_kind === 'action' ? instance.install_action_id || '' : '';

  // Outcome memory per action id: the backend clears install_action_id
  // when a workflow resolves, so the finished row would forget which
  // action ran. Watch the running → resolved transition and pin the
  // outcome (done → ok/green, anything else → err/red) to the action
  // that was in flight, captured in a ref since the row no longer names
  // it. Reset when the menu remounts; cleared per action on re-run.
  const [actionOutcome, setActionOutcome] = useState<Record<string, 'ok' | 'err'>>({});
  const prevRunningRef = useRef('');
  useEffect(() => {
    const prev = prevRunningRef.current;
    prevRunningRef.current = runningActionId;
    if (prev && prev !== runningActionId && instance && instance.install_state !== 'running') {
      const done = instance.install_state === 'done';
      setActionOutcome((m) => ({ ...m, [prev]: done ? 'ok' : 'err' }));
    }
  }, [runningActionId, instance?.install_state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep action running-state fresh while the instance menu is open (silent
  // reloads so a finished action morphs back to Run without a flash).
  useEffect(() => {
    const t = window.setInterval(() => { void reload(true); }, 3000);
    return () => window.clearInterval(t);
  }, [reload]);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );

  // Quick shortcuts (Files / Terminal / Ports) — same routes as the
  // InstanceToolsDock cards, surfaced inside the floating menu directly
  // above the template Actions so operators can jump without closing it.
  // Availability mirrors the dock: Files / Terminal need their spec page,
  // Ports needs instance edit permission (its editor is permission-gated).
  const toolSpec = useMemo(() => {
    try {
      return instance?.config ? parseConfig(instance.config) : null;
    } catch {
      return null;
    }
  }, [instance?.config]);
  const filesOk = isPageAllowed('files', toolSpec as any);
  const terminalOk = isPageAllowed('terminal', toolSpec as any);
  const canEditPorts = hasPermissionAny(
    permissions,
    PermissionKey.INSTANCES_EDIT,
    PermissionKey.MANAGE_INSTANCES,
  );

  if (!canControl || !Number.isFinite(instanceId)) return null;

  const status = instance?.status ?? '';
  const isRunning = status === 'running';
  // Transitional states (deploy/install in flight) — no power action is valid,
  // so render no buttons rather than clickable-then-failing ones.
  const isTransitional = status === 'creating' || status === 'installing';
  // State-aware buttons gated by the template allow-list: stopped/errored/etc
  // → Start only; running → Stop + Restart + Kill (Start hidden);
  // transitional → none.
  const showStart = !isRunning && !isTransitional && controls.allow_start;
  const showStop = isRunning && controls.allow_stop;
  const showRestart = isRunning && controls.allow_restart;
  const showKill = isRunning && controls.allow_kill;
  const showPowerRow = showStart || showStop || showRestart || showKill;
  const busyAny = busy !== null || loading;

  const run = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
    if (!instance || busy) return;
    // Template allow-list gate (defense in depth — buttons are hidden too).
    if (action === 'start' && !controls.allow_start) return;
    if (action === 'stop' && !controls.allow_stop) return;
    if (action === 'restart' && !controls.allow_restart) return;
    if (action === 'kill' && !controls.allow_kill) return;
    // Kill is forceful (SIGKILL, no graceful shutdown) — confirm first so
    // a stray click can't nuke unsaved in-memory state.
    if (action === 'kill') {
      const ok = await confirm({
        title: 'Kill instance',
        message: `Force-stop "${instance.name}" now? Kill skips graceful shutdown — unsaved data inside the instance will be lost.`,
        tone: 'danger',
        confirmLabel: 'Kill',
      });
      if (!ok) return;
    }
    setBusy(action);
    setError('');
    try {
      if (action === 'start') await startInstance(instance.id);
      else if (action === 'stop') await stopInstance(instance.id);
      else if (action === 'kill') await killInstance(instance.id);
      else await restartInstance(instance.id);
      await reload(true);
    } catch (e: any) {
      setError(e?.response?.data || e?.message || `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  // Template-action run/stop toggle — same semantics as the home-page
  // Actions card: click an idle action to invoke it, click it again while
  // it's the running action to stop it (POST …/actions/:id/stop, which runs
  // the action's stop_command when defined). Double clicks debounce via
  // busyAction/stopPending, exactly like the card's __ksBusyAction guard.
  const runTemplateAction = async (actionId: string) => {
    if (!instance || busyAction || stopPending) return;
    if (!controls.allow_template_actions) return;
    const def = templateActions.find((t: any) => t.id === actionId);
    // State gate (defense in depth — the row is disabled too): a stopped
    // action may only start in an allowed state, but the RUNNING action
    // must always stay stoppable.
    if (actionId !== runningActionId && !actionStateOk(def, status)) return;
    setError('');
    if (actionId === runningActionId) {
      setStopPending(actionId);
      try {
        await stopInstanceAction(instanceId, actionId);
        await reload(true);
      } catch (e: any) {
        setError(e?.response?.data || e?.message || `Failed to stop ${actionId}`);
        setActionOutcome((m) => ({ ...m, [actionId]: 'err' }));
      } finally {
        setStopPending(null);
      }
    } else {
      setBusyAction(actionId);
      // Fresh run clears any pinned outcome — the row goes yellow while
      // active and re-resolves when the workflow finishes.
      setActionOutcome((m) => {
        if (!(actionId in m)) return m;
        const n = { ...m };
        delete n[actionId];
        return n;
      });
      try {
        await invokeInstanceAction(instanceId, actionId);
        await reload(true);
      } catch (e: any) {
        setError(e?.response?.data || e?.message || `Failed to run ${actionId}`);
        setActionOutcome((m) => ({ ...m, [actionId]: 'err' }));
      } finally {
        setBusyAction(null);
      }
    }
  };

  // Displayed selector action: the running action wins, then the last
  // picked one, then the first row (stale ids fall through to [0]).
  const displayedAction: any | null =
    templateActions.find((t: any) => t.id === (runningActionId || selectedId)) ?? templateActions[0] ?? null;
  const dIsRunning = !!displayedAction && workflowInFlight && runningActionId === displayedAction.id;
  const dIsBusy = !!displayedAction && busyAction === displayedAction.id;
  const dStopping = dIsRunning && stopPending === displayedAction.id;
  const dStateOk = displayedAction ? actionStateOk(displayedAction, status) : true;
  const dDisabled =
    !displayedAction ||
    (workflowInFlight && !dIsRunning) ||
    dIsBusy ||
    dStopping ||
    (!dIsRunning && !dStateOk);
  const dStateHint =
    displayedAction && !dStateOk && !dIsRunning
      ? `Available in: ${actionAllowedStates(displayedAction).join(', ')}`
      : '';
  const dCustom = displayedAction?.icon_svg ? sanitizeSvgIcon(displayedAction.icon_svg) : '';
  const dCustomFull = dCustom.trim().toLowerCase().startsWith('<svg');
  const dIconColor =
    displayedAction && typeof displayedAction.icon_color === 'string' ? displayedAction.icon_color.trim() : '';
  // Selector row phase: active (running/busy/stopping) → yellow, pinned
  // outcome → red/green, otherwise normal text.
  const dActive = dIsRunning || dIsBusy || dStopping;
  const dTone = actionTone(actionPhase(dActive, displayedAction ? actionOutcome[displayedAction.id] : undefined));

  // (No early return: the Files / Terminal / Ports shortcut row below
  // always renders, so the menu stays useful even with no power row,
  // no template actions and no error.)

  const menuBtn = (tone: string) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.94] hover:bg-white/10 hover:shadow-[0_2px_12px_rgba(0,0,0,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100 ${tone}`;
  // Aligned shortcut buttons (Files / Terminal / Ports): equal-width cells
  // in one horizontally scrollable row — active route glows, unavailable
  // pages render dimmed + disabled with an explanatory tooltip.
  const shortcutBtn = (active: boolean, enabled: boolean) =>
    `flex-1 min-w-[92px] inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[13px] font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.94] ${
      !enabled
        ? 'border-white/[0.06] text-gray-600 opacity-45 cursor-not-allowed'
        : active
          ? 'border-sky-400/60 bg-sky-500/10 text-white shadow-[0_0_12px_rgba(56,189,248,0.15)] hover:bg-sky-500/15'
          : 'border-white/10 bg-white/[0.03] text-gray-200 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
    }`;
  const shortcuts = [
    {
      slug: 'files',
      label: 'Files',
      enabled: filesOk,
      hint: filesOk ? 'Browse & manage files' : 'Import a Files page (Pages tab) to enable',
      tone: 'text-amber-300',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
      ),
    },
    {
      slug: 'terminal',
      label: 'Terminal',
      enabled: terminalOk,
      hint: terminalOk ? 'Live shell session' : 'Enable the Terminal page (Pages tab) to open a shell',
      tone: 'text-emerald-300',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
      ),
    },
    {
      slug: 'ports',
      label: 'Ports',
      enabled: canEditPorts,
      hint: canEditPorts ? 'Port mappings' : 'Requires instance edit permission',
      tone: 'text-sky-300',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="2" y="7" width="20" height="8" rx="2" /><path d="M6 7v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><path d="M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /></svg>
      ),
    },
  ];
  const spin = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
  );

  return (
    <div className="shrink-0">
      {showPowerRow && (
        <div className="flex items-center gap-1 px-3 pt-3" role="group" aria-label="Power controls">
          {showStart && (
            <button
              type="button"
              onClick={() => run('start')}
              disabled={busyAny}
              title="Start instance"
              className={menuBtn('text-emerald-300')}
              aria-label="Start instance"
            >
              {busy === 'start' ? spin : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              <span>Start</span>
            </button>
          )}
          {showStop && (
            <button
              type="button"
              onClick={() => run('stop')}
              disabled={busyAny}
              title="Stop instance"
              className={menuBtn('text-yellow-300')}
              aria-label="Stop instance"
            >
              {busy === 'stop' ? spin : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              )}
              <span>Stop</span>
            </button>
          )}
          {showRestart && (
            <button
              type="button"
              onClick={() => run('restart')}
              disabled={busyAny}
              title="Restart instance"
              className={menuBtn('text-sky-300')}
              aria-label="Restart instance"
            >
              {busy === 'restart' ? spin : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              )}
              <span>Restart</span>
            </button>
          )}
          {showKill && (
            <button
              type="button"
              onClick={() => run('kill')}
              disabled={busyAny}
              title="Kill instance now (force-stop, skips graceful shutdown)"
              className={menuBtn('text-red-400')}
              aria-label="Kill instance"
            >
              {busy === 'kill' ? spin : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              )}
              <span>Kill</span>
            </button>
          )}
        </div>
      )}
      {/* Divider below Start / Stop / Restart / Kill — same hairline as below Actions. */}
      {showPowerRow && (
        <div className="mx-3 mt-3 border-t border-white/10" aria-hidden="true" />
      )}
      {/* Quick shortcuts — Files / Terminal / Ports, aligned in one
          horizontally scrollable row directly above Actions. */}
      <div className="px-3 pt-2">
        <div
          className="flex items-stretch gap-1 overflow-x-auto pb-1"
          role="group"
          aria-label="Instance shortcuts"
        >
          {shortcuts.map((s) => {
            const to = `/instances/${instanceId}/${s.slug}`;
            const active = location.pathname === to || location.pathname === `${to}/`;
            return (
              <button
                key={s.slug}
                type="button"
                disabled={!s.enabled}
                onClick={() => {
                  if (s.enabled) navigate(to);
                }}
                title={`${s.label} — ${s.hint}`}
                aria-label={s.label}
                aria-current={active ? 'page' : undefined}
                className={shortcutBtn(active, s.enabled)}
              >
                <span className={`inline-flex shrink-0 ${s.enabled ? s.tone : ''}`} aria-hidden="true">
                  {s.icon}
                </span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Divider below shortcuts — only when Actions / error follow. */}
      {(error || templateActions.length > 0) && (
        <div className="mx-3 mt-2 border-t border-white/10" aria-hidden="true" />
      )}
      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/90 px-2.5 py-2 text-[11px] leading-snug text-red-200">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-red-300/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {templateActions.length > 0 && displayedAction && (
        <div className="px-3 pt-2">
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Actions{templateActions.length > 1 ? ` (${templateActions.length})` : ''}
          </p>
          {/* Bordered selector: `name | chevron` split by a straight divider
              line. Clicking the name runs/stops the shown action; clicking
              the SVG chevron (resting `<`-style, pointing down when open)
              drops down every action. */}
          <div className="overflow-hidden rounded-md border border-white/10">
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => runTemplateAction(displayedAction.id)}
                disabled={dDisabled}
                title={dIsRunning
                  ? (displayedAction.stop_command ? `Stop: runs "${displayedAction.stop_command}" inside the container` : 'Stop the running action')
                  : (dStateHint || displayedAction.description || displayedAction.name || displayedAction.id)}
                aria-label={dIsRunning ? `Stop action ${displayedAction.name || displayedAction.id}` : `Run action ${displayedAction.name || displayedAction.id}`}
                className={`min-w-0 flex-1 flex flex-col items-start justify-center gap-0.5 px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${dTone}`}
              >
                <span className="w-full text-[13px] font-medium leading-tight inline-flex items-center gap-1.5">
                  {(dIsBusy || dIsRunning || dStopping) ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin shrink-0" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : dCustom ? (
                    dCustomFull ? (
                      <span className="shrink-0 flex items-center [&>svg]:w-3 [&>svg]:h-3 [&>svg]:block" style={dIconColor ? { color: dIconColor } : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: dCustom }} />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" style={dIconColor ? { color: dIconColor } : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: dCustom }} />
                    )
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  )}
                  <span className="min-w-0 flex-1 truncate">{displayedAction.name || displayedAction.id}</span>
                </span>
                {dStateHint && (
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 leading-tight">{dStateHint}</span>
                )}
              </button>
              <div className="w-px shrink-0 bg-white/10" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                aria-expanded={actionsOpen}
                aria-haspopup="listbox"
                aria-label={actionsOpen ? 'Collapse actions' : 'Expand actions'}
                title={actionsOpen ? 'Collapse actions' : 'Show all actions'}
                className="flex w-10 shrink-0 items-center justify-center text-gray-400 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 transition-transform duration-200"
                  style={{ transform: actionsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {actionsOpen && (
              <div className="ks-actions-drop-enter border-t border-white/10 bg-black/20">
                <div role="listbox" aria-label="Template actions" className="max-h-48 overflow-y-auto py-1">
                  {templateActions.map((a: any) => {
                    const isThisRunning = workflowInFlight && runningActionId === a.id;
                    const isBusy = busyAction === a.id;
                    const stopping = isThisRunning && stopPending === a.id;
                    // State gate: a stopped action only starts in an allowed
                    // state — but the RUNNING action must always stay stoppable.
                    const stateOk = actionStateOk(a, status);
                    const disabled = (workflowInFlight && !isThisRunning) || isBusy || stopping || (!isThisRunning && !stateOk);
                    const stateHint = !stateOk && !isThisRunning ? `Available in: ${actionAllowedStates(a).join(', ')}` : '';
                    const custom = a.icon_svg ? sanitizeSvgIcon(a.icon_svg) : '';
                    const customFull = custom.trim().toLowerCase().startsWith('<svg');
                    const iconColor = typeof a.icon_color === 'string' ? a.icon_color.trim() : '';
                    const selected = a.id === displayedAction.id;
                    const active = isThisRunning || isBusy || stopping;
                    const tone = actionTone(actionPhase(active, actionOutcome[a.id]));
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSelectedId(a.id);
                          setActionsOpen(false);
                          void runTemplateAction(a.id);
                        }}
                        disabled={disabled}
                        title={isThisRunning
                          ? (a.stop_command ? `Stop: runs "${a.stop_command}" inside the container` : 'Stop the running action')
                          : (stateHint || a.description || a.name || a.id)}
                        className={`w-full flex flex-col items-start gap-0.5 px-2.5 py-2 text-left transition-all duration-150 hover:translate-x-0.5 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:active:scale-100 ${tone}${selected ? ' bg-white/5' : ''}`}
                      >
                        <span className="text-[13px] font-medium leading-tight inline-flex items-center gap-1.5">
                          {(isBusy || isThisRunning || stopping) ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin shrink-0" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                          ) : custom ? (
                            customFull ? (
                              <span className="shrink-0 flex items-center [&>svg]:w-3 [&>svg]:h-3 [&>svg]:block" style={iconColor ? { color: iconColor } : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: custom }} />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" style={iconColor ? { color: iconColor } : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: custom }} />
                            )
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          )}
                          {a.name || a.id}
                        </span>
                        {!stateOk && !isThisRunning && (
                          <span className="text-[10px] uppercase tracking-wide text-gray-500 leading-tight">{stateHint}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {workflowInFlight && !runningActionId && (
                  <p className="px-2.5 py-1.5 text-[11px] text-yellow-200/80">
                    A workflow is in progress — actions unlock when it resolves.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InstancePowerMenu;
