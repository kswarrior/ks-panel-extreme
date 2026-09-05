import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { startInstance, stopInstance, restartInstance } from '@/shared/api/admin';
import { invokeInstanceAction, stopInstanceAction } from '@/features/instances/api/instanceAdvanced';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

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

// InstancePowerBar — self-contained power controls for an instance,
// rendered as a nodes-style fixed top-right pill (PageActionsPill).
//
// Same surface / slide animation / auto-hide (scroll/outside-click hides,
// idle shows) as the Nodes page pill: Start / Stop / Restart as ks-tab
// icon+label buttons plus a template-Actions menu. The Actions dropdown
// portals to document.body so it escapes the pill's overflow-hidden
// collapse container (same reason NodeDetail's CardMenu portals).
//
// `variant` is kept for source-compat — the old left-aligned `dock` was
// removed, both values render this pill.
const InstancePowerBar: React.FC<{ variant?: 'dock' | 'pill' }> = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading, reload } = useInstance(instanceId);

  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [error, setError] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState<string | null>(null);
  const permissions = useAuthStore((s) => s.permissions);

  // Template actions ride on the instance config (same source the home-page
  // Actions card reads: inst.config.actions), filtered the same way —
  // non-empty id + user_invokable !== false.
  const templateActions = useMemo((): any[] => {
    try {
      const cfg = instance?.config ? parseConfig(instance.config) : null;
      const list = Array.isArray((cfg as any)?.actions) ? (cfg as any).actions : [];
      return list.filter(
        (a: any) => a && typeof a.id === 'string' && a.id.trim() !== '' && a.user_invokable !== false,
      );
    } catch {
      return [];
    }
  }, [instance?.config]);

  // Running-action tracking — mirrors the Actions card: install_state
  // 'running' + install_kind 'action' morphs the matching row to Stop.
  const workflowInFlight = !!instance && instance.install_state === 'running';
  const runningActionId =
    workflowInFlight && instance.install_kind === 'action' ? instance.install_action_id || '' : '';

  // Keep running state fresh while the dropdown is open (silent reloads so
  // a finished action morphs back to Run without a skeleton flash).
  // Scroll also closes the portal dropdown so it never floats orphaned
  // while the pill auto-hides.
  useEffect(() => {
    if (!actionsOpen) return;
    const t = window.setInterval(() => { void reload(true); }, 3000);
    const onScroll = () => setActionsOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen, reload]);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );

  if (!canControl || !Number.isFinite(instanceId)) return null;

  const status = instance?.status ?? '';
  const isRunning = status === 'running';
  // Transitional states (deploy/install in flight) — no power action is valid,
  // so render no buttons rather than clickable-then-failing ones.
  const isTransitional = status === 'creating' || status === 'installing';
  // State-aware buttons: stopped/errored/etc → Start only;
  // running → Stop + Restart (Start hidden); transitional → none.
  const showStart = !isRunning && !isTransitional;
  const busyAny = busy !== null || loading;

  const run = async (action: 'start' | 'stop' | 'restart') => {
    if (!instance || busy) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'start') await startInstance(instance.id);
      else if (action === 'stop') await stopInstance(instance.id);
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
      } finally {
        setStopPending(null);
      }
    } else {
      setBusyAction(actionId);
      try {
        await invokeInstanceAction(instanceId, actionId);
        await reload(true);
      } catch (e: any) {
        setError(e?.response?.data || e?.message || `Failed to run ${actionId}`);
      } finally {
        setBusyAction(null);
      }
    }
  };

  const pillBtn = (tone: string) =>
    `ks-tab inline-flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed ${tone}`;
  const spin = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
  );

  return (
    <>
      <PageActionsPill>
        {showStart && (
          <button
            type="button"
            onClick={() => run('start')}
            disabled={busyAny}
            title={error || 'Start instance'}
            style={PILL_TAB_STYLE}
            className={pillBtn('text-emerald-300')}
            aria-label="Start instance"
          >
            {busy === 'start' ? spin : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
            <span className="text-[13px] font-medium">Start</span>
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            onClick={() => run('stop')}
            disabled={busyAny}
            title={error || 'Stop instance'}
            style={PILL_TAB_STYLE}
            className={pillBtn('text-yellow-300')}
            aria-label="Stop instance"
          >
            {busy === 'stop' ? spin : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            )}
            <span className="text-[13px] font-medium">Stop</span>
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            onClick={() => run('restart')}
            disabled={busyAny}
            title={error || 'Restart instance'}
            style={PILL_TAB_STYLE}
            className={pillBtn('text-sky-300')}
            aria-label="Restart instance"
          >
            {busy === 'restart' ? spin : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            )}
            <span className="text-[13px] font-medium">Restart</span>
          </button>
        )}
        {templateActions.length > 0 && (
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            title={actionsOpen ? 'Hide template actions' : `Show template actions (${templateActions.length})`}
            aria-label="Template actions"
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            style={PILL_TAB_STYLE}
            className={`${pillBtn('text-violet-300')} ${actionsOpen ? 'is-open' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
            <span className="text-[13px] font-medium">Actions</span>
            {actionsOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            )}
          </button>
        )}
      </PageActionsPill>

      {/* Portal layer below the pill: error bubble + template-actions menu.
          Portalled so neither is clipped by the pill's overflow-hidden
          collapse container. */}
      {(actionsOpen || error) && typeof document !== 'undefined' && createPortal(
        <>
          {actionsOpen && (
            <div
              onClick={() => setActionsOpen(false)}
              onContextMenu={(e) => { e.preventDefault(); setActionsOpen(false); }}
              style={{ position: 'fixed', inset: 0, zIndex: 2147483639 }}
              aria-hidden="true"
            />
          )}
          <div
            className="fixed right-4 sm:right-6 top-[calc(max(4.5rem,env(safe-area-inset-top))+44px)] z-[2147483640] w-60 max-w-[80vw] flex flex-col gap-2"
          >
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/90 px-2.5 py-2 text-[11px] leading-snug text-red-200 shadow-lg shadow-black/50 backdrop-blur-md">
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
            {actionsOpen && templateActions.length > 0 && (
              <div
                role="menu"
                aria-label="Template actions"
                className="ks-dropdown max-h-64 overflow-auto p-1"
              >
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
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      onClick={() => runTemplateAction(a.id)}
                      disabled={disabled}
                      title={isThisRunning
                        ? (a.stop_command ? `Stop: runs "${a.stop_command}" inside the container` : 'Stop the running action')
                        : (stateHint || a.description || a.name || a.id)}
                      className={`w-full flex flex-col items-start gap-0.5 rounded px-2.5 py-2 text-left transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isThisRunning ? 'text-red-300 hover:bg-red-900/30' : 'text-emerald-300 hover:bg-emerald-900/30'
                      }`}
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
                {workflowInFlight && !runningActionId && (
                  <p className="px-2.5 py-1.5 text-[11px] text-yellow-200/80">
                    A workflow is in progress — actions unlock when it resolves.
                  </p>
                )}
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
};

export default InstancePowerBar;
