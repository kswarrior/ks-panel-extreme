// InstanceDetail.tsx — instance panel shell + dynamic page resolver.
//
// Most instance sub-pages are CUSTOM pages (html / markdown / blocks)
// imported from the Instance Pages library into the instance's spec.pages.
// This module keeps:
//
//   • InstancePanel       — the shell that syncs the instance's own config
//                           snapshot into the global sidebar nav context;
//   • InstanceDynamicPage — resolves the URL slug against the INSTANCE's
//                           deploy-time spec and renders CustomPageView.
//
// Files / Terminal / Ports are self-sufficient BUILTINS: they render natively
// with zero library imports (Files falls back to the bundled library starter
// when the instance has no files row; Terminal is the native xterm bridge;
// Ports is the native editor). Their backend bridges skip the page whitelist
// (auth + permission gates still apply). Tool navigation lives in the
// floating instance menu's shortcut row — there is no Tools card on the page.
// A slug is allowed when the instance's own config lists it in `pages`
// (empty-by-default: no rows → no pages). Home uses slug "." and renders at
// the index route when its page row was imported.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { useInstanceNavSync } from '@/shared/components/layout/InstanceNavContext';
import { getPageContent, getPageLabel, isPageAllowed, resolveRedirectTarget, type PageContent } from '@/shared/utils/instancePages';
import { pageNavigateTarget } from '@/shared/lib/customPageSdk';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import Terminal, { type TerminalHandle } from '@/shared/components/ui/Terminal';
import type { Terminal as XTerm } from '@xterm/xterm';
import InstancePortsEditor from '@/features/instances/pages/InstancePortsEditor';
import InstanceOverview from '@/features/instances/pages/InstanceOverview';
import InstanceFiles from '@/features/instances/pages/InstanceFiles';
import InstanceFileEditor from '@/features/instances/pages/InstanceFileEditor';
import { resolveInstanceControls, shortcutLabel, shortcutSlug } from '@/features/instances/utils/instanceControls';
import { sendActionStdin } from '@/features/instances/api/instanceAdvanced';
import InstanceSftpCard from '@/features/instances/components/InstanceSftpCard';
import InstanceSnapshotsTab from '@/features/instances/components/InstanceSnapshotsTab';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';

export const InstancePanel: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);
  const navigate = useNavigate();
  // Host-origin pages (markdown/blocks render inside the SPA, not an iframe)
  // request navigation through the sdk.navigate() → 'ks-navigate' window
  // event. The target is re-validated here so a page can only move within
  // its own instance's route tree (same fail-closed rule as the iframe
  // bridge in CustomPageView).
  useEffect(() => {
    if (!instanceId) return;
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { to?: unknown } | undefined;
      const target = pageNavigateTarget(instanceId, detail?.to);
      if (target) navigate(target);
    };
    window.addEventListener('ks-navigate', onNavigate);
    return () => window.removeEventListener('ks-navigate', onNavigate);
  }, [instanceId, navigate]);
  // The parsed spec must be referentially stable across re-renders of this
  // shell. parseConfig() hands back a brand-new object on every call, and
  // useInstanceNavSync keyed its effect on that object — once the instance
  // loaded, the effect re-fired on every render (new spec ref) and the
  // context update looped forever, unmounting the app into a blank page.
  // Memoizing on the raw config string keeps the same ref until the config
  // actually changes.
  const spec = useMemo(
    () => (instance?.config ? parseConfig(instance.config) : null),
    [instance?.config]
  );
  // Push the current instance's OWN config spec into the InstanceNavContext
  // so the global Sidebar / InstanceTabs render the instance's per-instance
  // pages (the deploy-time snapshot of template spec + any page overrides
  // made in the deploy form) instead of the live template's pages. Passing
  // null when the instance hasn't loaded yet keeps the sidebar empty until
  // we know what to show — better than flashing the wrong tabs.
  useInstanceNavSync(instanceId, spec, loading);

  return (
    <div className="space-y-3">
      {loading && (
        <div className="ks-card ks-form-card rounded-xl flex items-center gap-4 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" />
          <div className="h-5 w-1/3 bg-neutral-800 rounded" />
        </div>
      )}

      <ErrorBoundary resetKey={instanceId} label="instance-panel">
        <Outlet />
      </ErrorBoundary>
    </div>
  );
};

// EmptyState renders when the instance's spec exposes no pages at all —
// templates start with an empty page list by design; operators import pages
// from the Instance Pages library via the template/deploy editor.
const NoPagesState: React.FC<{ slug: string }> = ({ slug }) => (
  <div className="glass-card rounded-xl text-center text-gray-400 space-y-2">
    <p className="text-sm pt-2">This instance has no pages yet.</p>
    <p className="text-xs text-gray-500 pb-3">
      Import pages (Home, Metrics, …) from the Instance Pages library in the template or deploy editor. Files, Terminal and Ports always work — they live in the floating instance menu.
    </p>
    <code className="text-[11px] text-gray-600 block pb-3">resolved route: /{slug}</code>
  </div>
);

// normTid normalises a terminal/action ID the same way on every layer
// (template form, panel bridge, edge exec): lowercase, spaces → _,
// only [a-z0-9_-] survive. Matching is exact on the normalised form.
function normTid(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

// blockedByTokens reports the first blocked token contained in line
// (case-insensitive), or null when the line is clean.
function blockedByTokens(line: string, blockedCsv: string): string | null {
  const toks = String(blockedCsv || '').split(',').map((x) => x.trim()).filter(Boolean);
  const low = line.toLowerCase();
  for (const t of toks) {
    if (t !== '' && low.includes(t.toLowerCase())) return t;
  }
  return null;
}

// allowedByList reports null when line matches one of the regexes (one per
// line), or a reason when it matches none. Invalid regexes are skipped —
// the line must still match a VALID pattern to pass.
function allowedByList(line: string, allowedMultiline: string): string | null {
  const pats = String(allowedMultiline || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (pats.length === 0) return 'no allowed commands configured';
  for (const p of pats) {
    try {
      if (new RegExp(p).test(line)) return null;
    } catch { /* skip invalid pattern */ }
  }
  return 'not in the allowed-commands list';
}

// actionLogText folds an instance's install_steps_json transcript into one
// tail string (every step's stdout + stderr, oldest first, last ~8k chars)
// so a bound pane can show the action's FULL log above the live shell.
function actionLogText(stepsJson: unknown): string {
  try {
    const raw = typeof stepsJson === 'string' ? stepsJson : JSON.stringify(stepsJson ?? '');
    if (!raw || !raw.trim()) return '';
    const steps = JSON.parse(raw);
    if (!Array.isArray(steps)) return '';
    const parts: string[] = [];
    for (const s of steps) {
      if (s && typeof s === 'object') {
        const out = [s.stdout, s.stderr].filter((x) => typeof x === 'string' && x !== '').join('\n');
        if (out) parts.push(`— step ${s.index ?? '?'} (${s.action ?? 'shell'} · ${s.status ?? ''}) —\n${out}`);
      }
    }
    const full = parts.join('\n').replace(/\r\n/g, '\n');
    return full.length > 8000 ? '…(earlier output truncated)…\n' + full.slice(-8000) : full;
  } catch {
    return '';
  }
}

type PaneAllowInput = 'all' | 'allowlist' | 'disabled';

interface TerminalPaneState {
  key: number;
  // Committed ID (drives the WS ?terminal= + action matching). The text box
  // edits a draft and commits on Enter/blur so typing never storms reconnects.
  terminalId: string;
  stopOnExit: boolean;
  allowInput: PaneAllowInput;
  // Pane-level overrides; empty = inherit the matched action's lists.
  allowedCommands: string;
  blockedCommands: string;
  timeoutS: string;
  showOptions: boolean;
  stopped: boolean;
  timedOut: boolean;
  stdinError: string;
}

// TerminalPane — one attachable console. The xterm below is the live
// container shell; when the pane's ID matches a template action's
// terminal_id the pane additionally streams that action's full log (log
// box above, mirrored live into the shell below) and relays validated
// input lines to the RUNNING action's console
// (POST …/actions/:id/stdin) — e.g. a Minecraft server's /tps /op /ban.
const TerminalPane: React.FC<{
  instanceId: number;
  pane: TerminalPaneState;
  actions: any[];
  runningActionId: string;
  installState: string;
  stepsJson: string;
  canRemove: boolean;
  onPatch: (key: number, patch: Partial<TerminalPaneState>) => void;
  onRemove: (key: number) => void;
}> = ({ instanceId, pane, actions, runningActionId, installState, stepsJson, canRemove, onPatch, onRemove }) => {
  const termRef = useRef<XTerm | null>(null);
  const handleRef = useRef<TerminalHandle>(null);
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [connMsg, setConnMsg] = useState('');
  const [cwd, setCwd] = useState('~');
  const [idDraft, setIdDraft] = useState(pane.terminalId);
  useEffect(() => { setIdDraft(pane.terminalId); }, [pane.terminalId]);

  const tid = normTid(pane.terminalId);
  const matchedAction = tid !== '' ? actions.find((a: any) => normTid(a?.terminal_id) === tid) : undefined;
  const isRunning = !!matchedAction && installState === 'running' && runningActionId === matchedAction.id;
  const actionStopOnExit = matchedAction ? (matchedAction.terminal_stop_on_exit ?? true) : false;
  const effectiveStop = pane.stopOnExit || actionStopOnExit;
  // Normalise action lists: the stored spec may hold arrays (form
  // serialize) or strings (hand-written / legacy rows). Arrays join with
  // the same separator the validators split on so String([...]) never
  // corrupts patterns with commas.
  const actionAllowedRaw = Array.isArray(matchedAction?.terminal_allowed_commands)
    ? (matchedAction.terminal_allowed_commands as unknown[]).map((x) => String(x ?? '')).filter((s) => s.trim() !== '').join('\n')
    : String(matchedAction?.terminal_allowed_commands ?? '');
  const actionBlockedRaw = Array.isArray(matchedAction?.terminal_blocked_commands)
    ? (matchedAction.terminal_blocked_commands as unknown[]).map((x) => String(x ?? '')).filter((s) => s.trim() !== '').join(',')
    : String(matchedAction?.terminal_blocked_commands ?? '');
  const actionModeRaw = String(matchedAction?.terminal_allow_input ?? 'all').trim().toLowerCase();
  const actionMode: PaneAllowInput = actionModeRaw === 'disabled' || actionModeRaw === 'allowlist' ? actionModeRaw : 'all';
  // Timeout inherits the matched action's budget when the pane leaves it
  // empty: a template timeout of 300s locks every bound pane even if the
  // operator never typed a per-pane value (fully customizable = pane
  // overrides, action provides the default).
  const effectiveTimeoutS = pane.timeoutS.trim() !== '' ? pane.timeoutS : String(matchedAction?.terminal_timeout_s ?? '').trim();
  // Input mode is the strictest of pane + action (fail closed): either side
  // saying disabled locks input; either side saying allowlist gates lines.
  // The server enforces the action's policy authoritatively (403); this
  // keeps the UX honest so a pane can't show "allow all" while the server
  // rejects every line.
  const effectiveMode: PaneAllowInput = pane.allowInput === 'disabled' || actionMode === 'disabled'
    ? 'disabled'
    : pane.allowInput === 'allowlist' || (matchedAction && actionMode === 'allowlist')
      ? 'allowlist'
      : 'all';
  const paneAllowedTrimmed = pane.allowedCommands.trim();
  const effectiveAllowed = paneAllowedTrimmed !== '' ? pane.allowedCommands : actionAllowedRaw;
  // Blocked tokens UNION both lists (defence-in-depth): a token blocked by
  // either side rejects the line. The old fallback (pane else action) let a
  // pane list hide the template's denylist in the UI (server still blocked,
  // but the pane showed a confusing 403 after submit).
  const effectiveBlocked = [pane.blockedCommands, actionBlockedRaw].map((s) => String(s || '').trim()).filter(Boolean).join(',');
  const readOnly = effectiveMode === 'disabled' || pane.stopped || pane.timedOut;
  const logText = matchedAction ? actionLogText(stepsJson) : '';

  // Track attach lifetime: once the bound action ran in this pane, its end
  // locks the pane when stop-on-exit applies (Minecraft `stop` → console
  // closes, no dead keystrokes). A fresh run unlocks the pane again.
  const prevRunningRef = useRef(false);
  const everAttachedRef = useRef(false);
  useEffect(() => {
    const was = prevRunningRef.current;
    prevRunningRef.current = isRunning;
    if (isRunning) {
      everAttachedRef.current = true;
      if (pane.stopped) onPatch(pane.key, { stopped: false, stdinError: '' });
    } else if (was && everAttachedRef.current && effectiveStop && !pane.stopped) {
      onPatch(pane.key, { stopped: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  // Pane attach budget: auto-lock when the configured timeout elapses.
  // Uses the EFFECTIVE timeout (pane override else the matched action's
  // terminal_timeout_s) so a template timeout locks every bound pane.
  useEffect(() => {
    const n = parseInt(String(effectiveTimeoutS || '').trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const t = window.setTimeout(() => onPatch(pane.key, { timedOut: true }), n * 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.key, effectiveTimeoutS, pane.terminalId]);

  const validator = useMemo(() => {
    if (effectiveMode === 'disabled') return undefined;
    if (effectiveMode !== 'allowlist' && effectiveBlocked.trim() === '') return undefined;
    return (line: string): string | null => {
      const hit = blockedByTokens(line, effectiveBlocked);
      if (hit) return `contains blocked token "${hit}"`;
      if (effectiveMode === 'allowlist') {
        // Strictest: when BOTH pane and action define allowlists the line
        // must match each side (pane narrows, template enforces). When only
        // one side defines it, matching that side suffices. Mirrors the
        // server (which enforces the action list) while letting panes narrow
        // further without ever widening past the template.
        const paneHas = paneAllowedTrimmed !== '';
        const actionHas = actionAllowedRaw.trim() !== '' && actionMode === 'allowlist';
        if (paneHas && actionHas) {
          const rPane = allowedByList(line, pane.allowedCommands);
          if (rPane) return rPane;
          const rAction = allowedByList(line, actionAllowedRaw);
          if (rAction) return rAction;
        } else {
          const reason = allowedByList(line, effectiveAllowed);
          if (reason) return reason;
        }
      }
      return null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, effectiveAllowed, effectiveBlocked, paneAllowedTrimmed, actionAllowedRaw, actionMode]);

  // Mirror the bound action's transcript INTO the xterm so the running
  // console (java's banner, player joins, …) appears in the terminal
  // itself, not only in the log box above. Deltas are computed against
  // the last mirrored text: exact-prefix appends are written directly,
  // while a slid 8 KiB tail window re-anchors on the previous tail so
  // only truly new bytes are mirrored and polls never spam duplicates.
  // The log box above stays the complete source of truth.
  const lastMirroredRef = useRef('');
  useEffect(() => { lastMirroredRef.current = ''; }, [tid]);
  useEffect(() => {
    const term = termRef.current;
    if (!term || !matchedAction || logText === '') return;
    const prev = lastMirroredRef.current;
    if (logText === prev) return;
    let delta: string | null = null;
    if (prev === '') {
      delta = logText;
    } else if (logText.startsWith(prev)) {
      delta = logText.slice(prev.length);
    } else {
      const anchor = prev.slice(-2000);
      const idx = anchor !== '' ? logText.lastIndexOf(anchor) : -1;
      if (idx >= 0) delta = logText.slice(idx + anchor.length);
    }
    lastMirroredRef.current = logText;
    if (delta === null || delta === '') return;
    if (prev === '') term.write(`\r\n\x1b[90m— streaming ${matchedAction.name || matchedAction.id} console —\x1b[0m\r\n`);
    // Cap a single mirror burst so a step transition can't flood scrollback.
    term.write(delta.length > 16384 ? delta.slice(-16384) : delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logText, matchedAction, tid, connState]);

  const handleLine = (line: string) => {
    if (!matchedAction || !isRunning || pane.stopped || pane.timedOut) return;
    if (line.trim() === '') return;
    void sendActionStdin(instanceId, matchedAction.id, line).then(
      () => { if (pane.stdinError) onPatch(pane.key, { stdinError: '' }); },
      (e: any) => {
        const status = e?.response?.status;
        const msgText = typeof e?.response?.data === 'string' ? e.response.data : (e?.response?.data?.error || e?.message || 'failed to send');
        if (status === 409) {
          onPatch(pane.key, { stopped: true, stdinError: '' });
        } else {
          onPatch(pane.key, { stdinError: String(msgText).slice(0, 300) });
        }
      },
    );
  };

  const handleExit = () => {
    if (effectiveStop && !pane.stopped) onPatch(pane.key, { stopped: true });
  };

  const commitId = () => {
    const v = normTid(idDraft);
    if (v !== normTid(pane.terminalId)) {
      onPatch(pane.key, { terminalId: v, stopped: false, timedOut: false, stdinError: '' });
      everAttachedRef.current = false;
    }
  };

  const statusChip = !tid ? null : !matchedAction ? (
    <span className="text-[11px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200" title="No template action uses this terminal ID — plain shell. Set it under Templates → Actions → Terminal ID.">unbound · shell only</span>
  ) : isRunning ? (
    <span className="text-[11px] px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200" title={`Action "${matchedAction.name || matchedAction.id}" is running — log streaming + input relay live.`}>● {matchedAction.name || matchedAction.id} · running</span>
  ) : (
    <span className="text-[11px] px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-gray-300" title={`Bound to action "${matchedAction.name || matchedAction.id}" (idle) — full log below; input relays when it runs.`}>⇄ {matchedAction.name || matchedAction.id} · idle</span>
  );

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-gray-500 text-xs font-mono shrink-0">id:</span>
          <input
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="terminal id — match an action (e.g. mc-console)"
            aria-label="Terminal ID — enter the action's terminal ID to attach"
            title="Enter the template action's Terminal ID and press Enter — on match this pane streams that action's full log and relays input while it runs"
            className="glass-field font-mono flex-1 min-w-[10rem]"
          />
        </div>
        {statusChip}
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onPatch(pane.key, { showOptions: !pane.showOptions })} aria-expanded={pane.showOptions} title="Pane options — stop-on-exit, input mode, timeout (fully customizable per pane)" className={`p-1.5 rounded-md border transition ${pane.showOptions ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-white/10 text-gray-400 hover:text-white'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
          {connState !== 'connected' && (
            <button type="button" onClick={() => handleRef.current?.reconnect()} className="ks-btn" title="Reconnect the live shell now">⟳</button>
          )}
          <button type="button" onClick={() => termRef.current?.clear()} className="ks-btn" title="Clear the terminal scrollback">Clear</button>
          {canRemove && (
            <button type="button" onClick={() => onRemove(pane.key)} className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-white/5" title="Remove this terminal pane" aria-label="Remove terminal pane">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          )}
        </div>
      </div>

      {pane.showOptions && (
        <div className="mx-3 mb-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Input mode</label>
              <select value={pane.allowInput} onChange={(e) => onPatch(pane.key, { allowInput: e.target.value as PaneAllowInput })} className="glass-field w-full">
                <option value="all">Allow all input</option>
                <option value="allowlist">Selected commands only</option>
                <option value="disabled">Read-only log</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Timeout (s, empty = {matchedAction && String(matchedAction?.terminal_timeout_s ?? '').trim() !== '' ? `action default ${String(matchedAction.terminal_timeout_s).trim()}s` : 'no limit'})</label>
              <input type="number" min="0" value={pane.timeoutS} onChange={(e) => onPatch(pane.key, { timeoutS: e.target.value.replace(/[^0-9]/g, '') })} placeholder={matchedAction && String(matchedAction?.terminal_timeout_s ?? '').trim() !== '' ? String(matchedAction.terminal_timeout_s).trim() : 'no limit'} className="glass-field font-mono w-full" />
              {pane.timeoutS.trim() === '' && matchedAction && String(matchedAction?.terminal_timeout_s ?? '').trim() !== '' && (
                <p className="text-[11px] text-gray-500 mt-1">Using action timeout {String(matchedAction.terminal_timeout_s).trim()}s — type a value to override per pane.</p>
              )}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <button type="button" onClick={() => onPatch(pane.key, { stopOnExit: !pane.stopOnExit })} className={`relative w-9 h-5 rounded-full transition ${pane.stopOnExit ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={pane.stopOnExit} aria-label="Stop terminal when action ends">
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${pane.stopOnExit ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-sm text-gray-300">Stop terminal when action ends{(matchedAction?.terminal_stop_on_exit ?? true) && !pane.stopOnExit ? ' (template still enforces it)' : ''}</span>
          </label>
          {effectiveMode === 'allowlist' && actionMode === 'allowlist' && pane.allowInput !== 'allowlist' && (
            <p className="text-[11px] text-amber-200/90">Template restricts this console to selected commands — input is gated even though this pane says “allow all”. Pick “Selected commands only” to preview the gate per pane.</p>
          )}
          {effectiveMode === 'disabled' && pane.allowInput !== 'disabled' && (
            <p className="text-[11px] text-amber-200/90">Template sets this console to read-only — panes cannot re-enable input.</p>
          )}
          {(pane.allowInput === 'allowlist' || effectiveMode === 'allowlist') && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Allowed commands (regex, one per line — empty = action's list)</label>
              <textarea rows={2} value={pane.allowedCommands} onChange={(e) => onPatch(pane.key, { allowedCommands: e.target.value })} placeholder={actionAllowedRaw || '^tps$\n^op\\s+\\w+'} className="glass-field font-mono w-full text-emerald-200" />
              {paneAllowedTrimmed !== '' && actionAllowedRaw.trim() !== '' && actionMode === 'allowlist' && (
                <p className="text-[11px] text-gray-500 mt-1">Both pane + action lists apply (line must match each) — narrow per pane without ever widening past the template.</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Blocked commands (comma-separated — empty = action's list)</label>
            <input value={pane.blockedCommands} onChange={(e) => onPatch(pane.key, { blockedCommands: e.target.value })} placeholder={actionBlockedRaw || 'apt sudo reboot shutdown rm mkfs'} className="glass-field font-mono w-full text-red-300" />
          </div>
        </div>
      )}

      {(pane.stopped || pane.timedOut) && (
        <div className="mx-3 mb-2 rounded-md border border-red-900/40 bg-red-950/60 px-2.5 py-1.5 text-[11px] text-red-200">
          {pane.timedOut ? 'Terminal timeout reached — pane locked. Clear the timeout or add a new terminal to continue.' : 'Terminal stopped — the action ended and input is locked. Clear the ID or add a new terminal to continue.'}
        </div>
      )}
      {readOnly && !pane.stopped && !pane.timedOut && (
        <div className="mx-3 mb-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-gray-400">Read-only — this pane shows the log but accepts no input.</div>
      )}
      {pane.stdinError && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/90 px-2.5 py-1.5 text-[11px] text-red-200">
          <span className="flex-1 break-words">{pane.stdinError}</span>
          <button type="button" onClick={() => onPatch(pane.key, { stdinError: '' })} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-white">✕</button>
        </div>
      )}
      {matchedAction && (
        <details className="mx-3 mb-2 rounded-md border border-white/10 bg-black/40" open={isRunning}>
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-200">Action log · {matchedAction.name || matchedAction.id} ({installState || 'idle'}) — click to {isRunning ? 'collapse' : 'expand'}</summary>
          {logText ? (
            <pre className="ks-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-2.5 pb-2 text-[11px] leading-relaxed text-gray-300">{logText}</pre>
          ) : (
            <p className="px-2.5 pb-2 text-[11px] text-gray-500">
              {isRunning
                ? 'Live console — lines appear here (and in the terminal below) as the process writes them. Type below to send input to the running action.'
                : 'No captured output yet — invoke the action to stream its console here.'}
            </p>
          )}
        </details>
      )}

      <div className="px-3 pb-3">
        <div
          style={{
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--ks-card-border)',
            background: 'var(--ks-term-bg,#1e1e1e)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            opacity: pane.stopped || pane.timedOut ? 0.75 : 1,
          }}
        >
          <div
            className="ks-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--ks-term-bg,#1e1e1e)',
              borderBottom: '1px solid var(--ks-card-border)',
              fontSize: 11,
              color: 'var(--ks-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tid ? `console:${tid}` : 'shell'}:{cwd}$</span>
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{connState}{connMsg ? ` — ${connMsg}` : ''}</span>
          </div>
          <Terminal
            ref={handleRef}
            instanceId={instanceId}
            terminalId={tid}
            timeoutS={effectiveTimeoutS}
            readOnly={readOnly}
            validateInput={validator}
            onLine={handleLine}
            onExit={handleExit}
            onStateChange={(s, m) => { setConnState(s); setConnMsg(m ?? ''); }}
            onTermRef={(t) => (termRef.current = t)}
            onTitleChange={(t) => {
              if (!t) return;
              try {
                const mm = String(t).match(/file:\/\/[^/]*(\/.*)/);
                if (mm) { setCwd(mm[1]); return; }
                const pm = String(t).match(/([~/][^\s]*)\s*$/);
                if (pm) {
                  const pp = pm[1].split(' — ')[0].split(' - ')[0];
                  if (pp) setCwd(pp);
                  return;
                }
                if (t.indexOf('/') >= 0) setCwd(t);
              } catch { /* noop */ }
            }}
          />
        </div>
      </div>
    </div>
  );
};

// TerminalRealPage — native xterm terminal(s) for the terminal shortcut slug
// (default `terminal`, customizable in Instance Controls). One or more panes
// ("add more terminal together"): each pane has an ID box; when the ID
// matches a template action's terminal_id the pane streams that action's
// full log (details above) and relays gated input to the running action's
// console while it runs. Per-pane options (stop-on-exit, input mode,
// allow/block lists, timeout) make every pane fully customizable without
// touching the template.
const TerminalRealPage: React.FC<{ instance: any; title?: string; showHeader?: boolean }> = ({ instance, title, showHeader = true }) => {
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const termCfg = controls.shortcuts.terminal;
  const keySeq = useRef(1);
  const makePane = (key: number): TerminalPaneState => ({
    key,
    terminalId: '',
    stopOnExit: termCfg.terminal_default_stop_on_exit,
    allowInput: (['all', 'allowlist', 'disabled'].includes(termCfg.terminal_default_allow_input) ? termCfg.terminal_default_allow_input : 'all') as PaneAllowInput,
    allowedCommands: '',
    blockedCommands: '',
    timeoutS: termCfg.terminal_default_timeout_s || '',
    // Options (input mode, timeout, stop-on-exit, allow/block lists) start
    // expanded so every pane is fully customizable right on the page —
    // the gear toggles them closed. Template defaults from Instance
    // Controls still seed each new pane.
    showOptions: true,
    stopped: false,
    timedOut: false,
    stdinError: '',
  });
  const [panes, setPanes] = useState<TerminalPaneState[]>(() => [makePane(0)]);

  const patchPane = (key: number, patch: Partial<TerminalPaneState>) =>
    setPanes((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePane = (key: number) => setPanes((ps) => (ps.length <= 1 ? ps : ps.filter((p) => p.key !== key)));

  // Template actions ride on the instance config (deploy-time snapshot).
  const actions: any[] = useMemo(() => {
    try {
      const cfg = instance?.config ? parseConfig(instance.config) : null;
      const list = Array.isArray((cfg as any)?.actions) ? (cfg as any).actions : [];
      return list.filter((a: any) => a && typeof a.id === 'string' && a.id.trim() !== '');
    } catch {
      return [];
    }
  }, [instance?.config]);

  // Live workflow status for the running-action chips + log tail. The routed
  // snapshot goes stale the moment an action starts, so poll silently while
  // any pane is bound to an ID (same 3s cadence as the actions menu).
  const { instance: live, reload } = useInstance(Number(instance?.id));
  const hasBound = panes.some((p) => normTid(p.terminalId) !== '');
  useEffect(() => {
    if (!hasBound) return;
    const t = window.setInterval(() => { void reload(true); }, 3000);
    return () => window.clearInterval(t);
  }, [hasBound, reload]);
  const src: any = live ?? instance;
  const installState: string = src?.install_state ?? '';
  const runningActionId: string = installState === 'running' && src?.install_kind === 'action' ? (src?.install_action_id || '') : '';
  const stepsJson: string = src?.install_steps_json ?? '';

  const maxN = parseInt(String(termCfg.terminal_max || '').trim(), 10);
  const atMax = Number.isFinite(maxN) && maxN > 0 && panes.length >= maxN;
  const canAdd = (termCfg.terminal_allow_multi || panes.length === 0) && !atMax;
  const addPane = () => { const k = keySeq.current++; setPanes((ps) => [...ps, makePane(k)]); };

  return (
    <div className="animate-fade-in space-y-3">
      {showHeader && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ks-heading)', margin: 0 }}>{title || 'Terminal'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canAdd ? (
            <button type="button" onClick={addPane} className="ks-btn" title={Number.isFinite(maxN) && maxN > 0 ? `Add another terminal pane (${panes.length}/${maxN})` : 'Add another terminal pane'}>
              ＋ Add terminal
            </button>
          ) : (
            <span className="text-[11px] text-gray-500" title={atMax ? `Template caps terminals at ${maxN}` : 'Template allows a single terminal pane'}>
              {atMax ? `Max ${maxN} terminals` : 'Multi-terminal disabled by template'}
            </span>
          )}
        </div>
      </div>
      )}
      {!showHeader && canAdd && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={addPane} className="ks-btn" title="Add another terminal pane">＋ Add terminal</button>
        </div>
      )}
      {actions.filter((a: any) => normTid(a?.terminal_id) !== '').length > 0 ? (
        <p className="text-[11px] text-gray-500">
          Attachable actions: {actions.filter((a: any) => normTid(a?.terminal_id) !== '').map((a: any) => `${a.name || a.id} (${normTid(a.terminal_id)})`).join(' · ')} — enter an ID above to stream its full log + console input.
        </p>
      ) : (
        <p className="text-[11px] text-gray-500">No action defines a Terminal ID yet — set one under Templates → Actions → Terminal ID (e.g. <code className="font-mono">mc-console</code>) to attach consoles here.</p>
      )}

      {panes.map((p) => (
        <TerminalPane
          key={p.key}
          instanceId={instance.id}
          pane={p}
          actions={actions}
          runningActionId={runningActionId}
          installState={installState}
          stepsJson={stepsJson}
          canRemove={panes.length > 1}
          onPatch={patchPane}
          onRemove={removePane}
        />
      ))}
    </div>
  );
};

// InstanceDynamicPage resolves the current URL slug (the `*` catch-all param)
// against the INSTANCE's own config spec. When the slug maps to a page row
// with content it renders CustomPageView; otherwise a not-part-of-template /
// empty state card. The component resolution is direct: there are no built-in
// components anymore, only custom content payloads.
export const InstanceDynamicPage: React.FC = () => {
  const { id, '*': wildcard } = useParams();
  const instanceId = Number(id);
  const { instance, loading, error } = useInstance(instanceId);
  const permissions = useAuthStore((s) => s.permissions);
  // Files bottom pill: Explorer <-> SFTP views. Declared before the early
  // returns so hook order stays stable across loading states.
  const [filesTab, setFilesTab] = useState<'explorer' | 'sftp'>('explorer');

  if (loading) return <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse"><div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" /><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  if (!instance || error) return <div className="glass-card rounded-xl text-red-400 text-sm">{error || 'Instance not found'}</div>;

  // Resolve the spec from the instance's OWN stored config (the deploy-time
  // snapshot that already includes the instance-form's page overrides) — NOT
  // from the live template. This is what makes each instance's page set
  // independent: a page added/removed/renamed at deploy time shows up here,
  // and later template edits don't leak into deployed instances.
  // Multi-page support: the wildcard is the FULL page path so sub-pages like
  // files/edit resolve to their own spec row (slug "files/edit"), not just
  // the family's main page.
  const spec = instance.config ? parseConfig(instance.config) : null;
  const slug = (wildcard ?? '').replace(/\/+$/, '');
  const effectiveSlug = slug === '' ? '.' : slug;

  // Shortcut slugs + page options from the instance's own controls snapshot
  // (Instance Controls section, per-template default overridable per
  // instance). Files / Terminal navigate to their custom slug; Ports keeps
  // its canonical route working and additionally answers its custom slug.
  const controls = resolveInstanceControls(instance.config);
  const filesSlug = shortcutSlug(controls, 'files');
  const terminalSlug = shortcutSlug(controls, 'terminal');
  const portsSlug = shortcutSlug(controls, 'ports');

  // Ports editor is a built-in page permission-gated on INSTANCES_EDIT|MANAGE_INSTANCES,
  // not a custom spec.pages entry. Render it before the whitelist check so
  // the ports route works even when the spec has no "ports" row. The
  // canonical /ports URL keeps working when the slug is customized.
  if (effectiveSlug === 'ports' || effectiveSlug === portsSlug) {
    const can = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
    if (!can) {
      return (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          <p className="text-sm">You need INSTANCES_EDIT permission to manage ports.</p>
        </div>
      );
    }
    return <InstancePortsEditor readOnly={!controls.shortcuts.ports.allow_edit} />;
  }

  // SFTP card is a built-in page like Ports (not a custom spec.pages entry).
  // The masked dial params are safe for any instance viewer; the card itself
  // gates Enable/Rotate/Disable behind INSTANCES_EDIT|MANAGE_INSTANCES.
  // Rendered before the whitelist check so /instances/:id/sftp works even
  // when the spec has no "sftp" row (mirrors the Ports pattern; the
  // sftp.json library page calls the same GET via fetchPanel('/sftp')).
  if (effectiveSlug === 'sftp') {
    return <InstanceSftpCard instanceId={instanceId} />;
  }

  // Snapshots tab is a native built-in like Ports/SFTP (not a custom
  // spec.pages entry). The legacy backups.json library page keeps working
  // via the custom-page path below; this native tab is the first-class UI
  // with schedules + file-level tar backups.
  if (effectiveSlug === 'snapshots') {
    return <InstanceSnapshotsTab instanceId={instanceId} />;
  }

  // Overview is a native built-in like Ports/SFTP/Snapshots (not a custom
  // spec.pages entry): the full-page target of the floating instance
  // menu's "More" link — the menu's own status row + power controls +
  // actions, plus live CPU / RAM / disk graphs and manage options
  // (rename, reinstall, destroy).
  if (effectiveSlug === 'overview') {
    return <InstanceOverview instanceId={instanceId} />;
  }

  // Template home page: the index route (instance card click) lands on the
  // configured slug (e.g. /overview) instead of default Home. Unknown or
  // disabled slugs fall back to '.' — never a dead page or a loop.
  if (effectiveSlug === '.') {
    const home = resolveRedirectTarget((spec as any)?.home_page, spec);
    if (home) {
      return <Navigate to={`/instances/${instanceId}/${home}`} replace />;
    }
  }

  // Build instance context for the custom page SDK. install_* fields ride
  // along so overview-style pages can surface install-workflow progress.
  const instanceContext = {
    id: instance.id,
    name: instance.name,
    kind: instance.kind,
    status: instance.status,
    template_id: instance.template_id,
    template_name: instance.template_name ?? null,
    node_id: instance.node_id,
    node_name: instance.node_name ?? null,
    owner_id: instance.owner_id ?? null,
    owner_name: instance.owner_name ?? null,
    config: instance.config ? parseConfig(instance.config) : {},
    external_id: instance.external_id ?? '',
    created_at: instance.created_at ?? '',
    updated_at: instance.updated_at ?? '',
    install_state: instance.install_state ?? '',
    install_kind: instance.install_kind ?? '',
    install_step: typeof instance.install_step === 'number' ? instance.install_step : -1,
    install_error: instance.install_error ?? '',
    install_steps_json: instance.install_steps_json ?? '',
    install_action_id: instance.install_action_id ?? '',
    display_name: instance.display_name ?? '',
    icon: instance.icon ?? '',
    color: instance.color ?? '',
  };

  // Terminal is a pure builtin, not an instance-pages system page: the
  // native xterm bridge always renders (its backend bridge skips the page
  // whitelist; route auth + VIEW permission still apply). The canonical
  // /terminal URL keeps working when the slug is customized.
  if (effectiveSlug === terminalSlug || effectiveSlug === 'terminal') {
    return (
      <ErrorBoundary resetKey={`terminal-${instanceId}`} label="instance-terminal">
        <TerminalRealPage
          instance={instance}
          title={shortcutLabel(controls, 'terminal')}
          showHeader={controls.shortcuts.terminal.show_header}
        />
      </ErrorBoundary>
    );
  }

  // Files is a pure builtin, not an instance-pages system page: the native
  // file manager below always renders (spec.pages rows for these slugs, if
  // any linger from older imports, are ignored by design). The bottom pill
  // switches the Explorer and SFTP views; both stay mounted so switching
  // never loses explorer state. The pill hides when the Files shortcut's
  // "Show SFTP card" page option is off.
  if (effectiveSlug === filesSlug || effectiveSlug === 'files') {
    const showSftp = controls.shortcuts.files.show_sftp;
    const showExplorer = !showSftp || filesTab === 'explorer';
    return (
      <ErrorBoundary resetKey={`files-${instanceId}`} label="instance-page">
        <div className="space-y-4 pb-20">
          <div className={showExplorer ? '' : 'hidden'}>
            <InstanceFiles instanceId={instanceId} filesSlug={filesSlug} />
          </div>
          {showSftp && (
            <div className={filesTab === 'sftp' ? '' : 'hidden'}>
              <InstanceSftpCard instanceId={instanceId} />
            </div>
          )}
        </div>
        {showSftp && (
          <nav
            aria-label="Files views"
            className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40"
          >
            <div
              role="tablist"
              aria-label="Files views"
              className="ks-card rounded-full p-1 flex items-center gap-1 shadow-lg shadow-black/40"
            >
              <button
                type="button"
                role="tab"
                aria-selected={filesTab === 'explorer'}
                onClick={() => setFilesTab('explorer')}
                title="File explorer"
                className={`ks-tab rounded-full inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition${filesTab === 'explorer' ? ' ks-tab-active' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1 2 2H5a2 2 0 0 1-2-2Z" /></svg>
                <span>Explorer</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filesTab === 'sftp'}
                onClick={() => setFilesTab('sftp')}
                title="SFTP access"
                className={`ks-tab rounded-full inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition${filesTab === 'sftp' ? ' ks-tab-active' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>SFTP</span>
              </button>
            </div>
          </nav>
        )}
      </ErrorBoundary>
    );
  }

  // Files editor sub-page: the native React editor (pure builtin, like the
  // manager above).
  if (effectiveSlug === `${filesSlug}/edit`) {
    return (
      <ErrorBoundary resetKey={`files-edit-${instanceId}`} label="instance-page">
        <InstanceFileEditor instanceId={instanceId} filesSlug={filesSlug} />
      </ErrorBoundary>
    );
  }

  if (!isPageAllowed(effectiveSlug, spec)) {
    // The index route on a page-less instance gets the guidance empty state;
    // every other unknown slug gets the classic not-in-template card.
    if (effectiveSlug === '.' && !(spec?.pages?.length > 0)) {
      return <NoPagesState slug="" />;
    }
    return (
      <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
        <p className="text-sm">This page (<code className="text-gray-300">/{slug || 'home'}</code>) is not part of this instance's template.</p>
      </div>
    );
  }

  // Label: the row's label, a nested sub-page's name ("Editor" for
  // files/edit), "Home" for ".", or the raw slug as last resort.
  const label = getPageLabel(effectiveSlug, spec) ?? (effectiveSlug === '.' ? 'Home' : effectiveSlug);

  const content = getPageContent(effectiveSlug, spec);
  if (!content || (!content.html && !content.markdown && !content.blocks)) {
    return (
      <div className="glass-card rounded-xl text-center text-gray-400">
        <p className="text-sm">This page (<code className="text-gray-300">/{slug}</code>) has no content.</p>
        <p className="text-xs text-gray-500 mt-1">Re-import it from the Instance Pages library to restore its definition.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary resetKey={`${effectiveSlug}-${instanceId}`} label="instance-page">
      <CustomPageView content={content} title={label} instanceContext={instanceContext} pageSlug={effectiveSlug} />
    </ErrorBoundary>
  );
};

export default InstancePanel;
