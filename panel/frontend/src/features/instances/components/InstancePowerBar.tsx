import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { startInstance, stopInstance, restartInstance } from '@/shared/api/admin';
import { invokeInstanceAction, stopInstanceAction } from '@/features/instances/api/instanceAdvanced';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { PILL_TAB_STYLE, useAutoHidePill } from '@/shared/components/ui/PageActionsPill';

const COLLAPSED_KEY = 'ks-instance-power-collapsed';

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

// InstancePowerBar — self-contained power controls for an instance.
//
// Two render modes (same start/stop/restart logic):
//   • dock (default) — the old collapsible left-aligned dock, kept for any
//     inline use.
//   • pill — bare ks-tab icon+label buttons with NO outer card/collapse,
//     meant to sit inside a PageActionsPill on the details page so it gets
//     the nodes-style fixed top-right position + slide animation + auto-hide
//     (scroll/outside-click hides, idle shows) for free.
const InstancePowerBar: React.FC<{ variant?: 'dock' | 'pill' }> = ({ variant = 'dock' }) => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading, reload } = useInstance(instanceId);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [error, setError] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const permissions = useAuthStore((s) => s.permissions);
  // Auto-off — never invisible. Scroll / outside-click collapses the dock
  // from < to > (same toggle as manual collapse); idle / hover expands it
  // back. Manual collapse persists in localStorage, auto-off does not.
  const autoHide = useAutoHidePill(1500);
  const [autoOff, setAutoOff] = useState(false);

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
  useEffect(() => {
    if (!actionsOpen) return;
    const t = window.setInterval(() => { void reload(true); }, 3000);
    return () => window.clearInterval(t);
  }, [actionsOpen, reload]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!actionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    const onClick = (e: PointerEvent) => {
      const el = dockRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setActionsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClick);
    };
  }, [actionsOpen]);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );

  if (!canControl || !Number.isFinite(instanceId)) return null;

  const toggle = () => {
    setActionsOpen(false);
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

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

  // NOTE: buttons deliberately do NOT use the `ks-tab` class. The theme
  // system forces ks-tab padding/font/border via `!important`
  // (padding-left/right/top/bottom, font-size), so any Tailwind px/py on a
  // ks-tab never shrinks. Plain buttons + inline-style padding below are
  // immune to the theme and stay truly compact.
  const btnBase =
    'shrink-0 inline-flex items-center whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed';
  // Inline style beats every non-`!important` stylesheet rule, and no theme
  // rule targets these plain buttons — padding really is 1px/5px now.
  const btnStyle: React.CSSProperties = {
    padding: '0 4px',
    margin: 0,
    gap: 2,
    fontSize: 10,
    lineHeight: '12px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
  };
  // Collapsed toggle style — ultra-narrow so the shut `>` dock is only a
  // few px wide (tighter padding + smaller chevron than the open state).
  const toggleCollapsedStyle: React.CSSProperties = {
    ...btnStyle,
    padding: '0 1px',
    gap: 0,
  };

  // Pill mode — bare ks-tab buttons for inside a PageActionsPill (nodes-style
  // fixed top-right bar). No outer card/collapse: the pill itself provides
  // the glass surface + slide animation + auto-hide on scroll/outside-click.
  if (variant === 'pill') {
    const pillBtn = (tone: string) =>
      `ks-tab inline-flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed ${tone}`;
    const spin = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
    );
    return (
      <>
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
      </>
    );
  }

  return (
    // Plain left-aligned dock — placement/stickiness comes from the parent
    // (Layout renders it in a row below the header bar, left). Zero
    // padding/margin — flush. Relative so the Actions dropdown anchors here.
    <div ref={dockRef} className="relative flex justify-start p-0 m-0" aria-label="Instance power controls">
      <div className="pointer-events-auto flex flex-col items-start p-0 m-0">
        {/* Rectangular box — ks-card kept for the themed glass surface only;
            zero box metrics enforced inline so theme radius/padding can't win. */}
        <div
          className="ks-card flex items-center w-fit max-w-full"
          style={{
            padding: 0,
            margin: 0,
            gap: 0,
            borderRadius: 0,
            // Shut state: hard-cap the whole box at ~25px wide, centered.
            ...(collapsed
              ? { maxWidth: 25, overflow: 'hidden', justifyContent: 'center' as const }
              : {}),
          }}
        >
          {/* Collapsible buttons — slide left + fade when collapsed */}
          <div
            className="flex items-center overflow-hidden transition-all duration-300 ease-in-out"
            style={
              collapsed
                ? { maxWidth: 0, opacity: 0, transform: 'translateX(-8px)', pointerEvents: 'none', padding: 0, margin: 0, gap: 0 }
                : { maxWidth: 320, opacity: 1, transform: 'translateX(0)', padding: 0, margin: 0, gap: 0 }
            }
            aria-hidden={collapsed}
          >
            {showStart && (
            <button
              type="button"
              onClick={() => run('start')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Start instance"
              style={btnStyle}
              className={`${btnBase} text-emerald-300 hover:bg-emerald-900/30`}
            >
              {busy === 'start' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              <span>Start</span>
            </button>
            )}
            {isRunning && (
            <button
              type="button"
              onClick={() => run('stop')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Stop instance"
              style={btnStyle}
              className={`${btnBase} text-yellow-300 hover:bg-yellow-900/30`}
            >
              {busy === 'stop' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              )}
              <span>Stop</span>
            </button>
            )}
            {isRunning && (
            <button
              type="button"
              onClick={() => run('restart')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Restart instance"
              style={btnStyle}
              className={`${btnBase} text-sky-300 hover:bg-sky-900/30`}
            >
              {busy === 'restart' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              )}
              <span>Restart</span>
            </button>
            )}
            {templateActions.length > 0 && (
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              disabled={collapsed}
              tabIndex={collapsed ? -1 : undefined}
              title={actionsOpen ? 'Hide template actions' : `Show template actions (${templateActions.length})`}
              aria-label="Template actions"
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
              style={btnStyle}
              className={`${btnBase} text-violet-300 hover:bg-violet-900/30`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
              <span>Actions</span>
              {actionsOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              )}
            </button>
            )}
          </div>

          {/* Collapse toggle — [<] when open, [>] when collapsed */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand power controls' : 'Collapse power controls'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show power buttons' : 'Hide power buttons'}
            style={collapsed ? toggleCollapsedStyle : btnStyle}
            className={`${btnBase} text-gray-200 hover:bg-white/10`}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            )}
          </button>
        </div>
        {/* Template actions dropdown — same run/stop-toggle semantics as the
            home-page Actions card: click an idle action to invoke it, click
            it again while it's the running action to stop it. */}
        {actionsOpen && !collapsed && templateActions.length > 0 && (
          <div
            role="menu"
            aria-label="Template actions"
            className="absolute left-0 top-full mt-1 z-50 ks-card rounded-md shadow-lg shadow-black/50 w-60 max-w-[80vw] max-h-64 overflow-auto p-1"
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
        {error && (
          <p className="m-0 p-0 text-[11px] leading-tight text-red-300 bg-red-900/20 border border-red-900/30 rounded-none max-w-[220px] truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default InstancePowerBar;
