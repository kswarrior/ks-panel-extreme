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
import Modal from '@/shared/components/ui/Modal';
import Terminal, { type TerminalHandle } from '@/shared/components/ui/Terminal';
import type { Terminal as XTerm } from '@xterm/xterm';
import InstancePortsEditor from '@/features/instances/pages/InstancePortsEditor';
import InstanceOverview from '@/features/instances/pages/InstanceOverview';
import InstanceFiles from '@/features/instances/pages/InstanceFiles';
import InstanceFileEditor from '@/features/instances/pages/InstanceFileEditor';
import { resolveInstanceControls, shortcutLabel, shortcutSlug } from '@/features/instances/utils/instanceControls';
import { sendActionStdin, sendInstallStdin } from '@/features/instances/api/instanceAdvanced';
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

// actionLogText folds an instance's install_steps_json transcript into one
// tail string (every step's stdout + stderr + output fallback, oldest first,
// last ~8k chars) so a bound pane can mirror the action's live console
// directly inside its xterm (no separate log box). Headers carry step
// index/action/status/exit so the log reads properly (not a raw blob).
function actionLogText(stepsJson: unknown): string {
  try {
    const raw = typeof stepsJson === 'string' ? stepsJson : JSON.stringify(stepsJson ?? '');
    if (!raw || !raw.trim()) return '';
    let steps: unknown = JSON.parse(raw);
    // Some callers nest under { steps: [...] } — unwrap once.
    if (steps && typeof steps === 'object' && !Array.isArray(steps) && Array.isArray((steps as any).steps)) {
      steps = (steps as any).steps;
    }
    if (!Array.isArray(steps)) return '';
    const parts: string[] = [];
    for (const s of steps) {
      if (s && typeof s === 'object') {
        const rec = s as Record<string, unknown>;
        const stdout = typeof rec.stdout === 'string' ? rec.stdout : '';
        const stderr = typeof rec.stderr === 'string' ? rec.stderr : '';
        const output = typeof rec.output === 'string' ? rec.output : '';
        const out = [stdout, stderr, output].filter((x) => x !== '').join('\n');
        if (!out) continue;
        const idx = (rec.index ?? '?') as unknown;
        const act = (rec.action ?? 'shell') as unknown;
        const status = typeof rec.status === 'string' && rec.status !== '' ? ` · ${rec.status}` : '';
        const code = typeof rec.exit_code === 'number' ? ` · exit ${rec.exit_code}` : '';
        parts.push(`— step ${String(idx)} (${String(act)}${status}${code}) —\n${out}`);
      } else if (typeof s === 'string' && s !== '') {
        parts.push(s);
      }
    }
    if (parts.length === 0) return '';
    const full = parts.join('\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const withNl = !full.endsWith('\n') ? full + '\n' : full;
    return withNl.length > 8000 ? '…(earlier output truncated)…\n' + withNl.slice(-8000) : withNl;
  } catch {
    return '';
  }
}

interface TerminalPaneState {
  key: number;
  // Display name shown in the pane header (from the Add-terminal dialog).
  name: string;
  // Committed action terminal ID (drives WS ?terminal= + action matching).
  // Set once via the Add-terminal dialog — no inline editing.
  terminalId: string;
}

// TerminalPane — one live console. The xterm below is the instance shell;
// a pane whose ID matches a template terminal ID becomes that console:
//  - action terminal_id → mirrors the action's live transcript into the
//    xterm and relays typed lines to the RUNNING action's stdin
//    (POST …/actions/:id/stdin) — e.g. Minecraft tps / op / stop;
//  - install_terminal_id → mirrors the Installation transcript and
//    relays typed lines to the running install (POST …/install/stdin);
//  - startup_terminal_id → dials the /console bridge instead, attaching
//    directly to the container main-process stdio (fully interactive,
//    no mirror/relay needed).
// No separate log box, no per-pane options.
type PaneConnState = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
const TerminalPane: React.FC<{
  instanceId: number;
  pane: TerminalPaneState;
  actions: any[];
  runningActionId: string;
  installState: string;
  installKind: string;
  installTerminalId: string;
  startupTerminalId: string;
  stepsJson: string;
  canRemove: boolean;
  onRemove: (key: number) => void;
  onConnState?: (key: number, s: PaneConnState, msg?: string) => void;
}> = ({ instanceId, pane, actions, runningActionId, installState, installKind, installTerminalId, startupTerminalId, stepsJson, canRemove, onRemove, onConnState }) => {
  const termRef = useRef<XTerm | null>(null);
  const handleRef = useRef<TerminalHandle>(null);
  const [connState, setConnState] = useState<PaneConnState>('connecting');
  const [connMsg, setConnMsg] = useState('');
  const [cwd, setCwd] = useState('~');
  const [stdinError, setStdinError] = useState('');

  const tid = normTid(pane.terminalId);
  const matchedAction = tid !== '' ? actions.find((a: any) => normTid(a?.terminal_id) === tid) : undefined;
  const isRunning = !!matchedAction && installState === 'running' && runningActionId === matchedAction.id;
  // Installation console: bound when the pane ID equals the template's
  // install_terminal_id; live while a NON-action workflow runs (a running
  // action owns the same edge key and has its own stdin endpoint).
  const isInstallBound = tid !== '' && normTid(installTerminalId) !== '' && tid === normTid(installTerminalId);
  const isInstalling = isInstallBound && installState === 'running' && installKind !== 'action';
  // Startup console: bound when the pane ID equals the template's
  // advanced.startup_terminal_id. I/O rides the /console WS natively.
  const isStartupBound = tid !== '' && normTid(startupTerminalId) !== '' && tid === normTid(startupTerminalId);
  const isBound = !!matchedAction || isInstallBound || isStartupBound;
  // Live mirror is only valid while THIS pane's workflow is actually in
  // flight. Mirroring the shared install_steps_json while idle is what used
  // to paint stale/wrong-action logs into every bound pane.
  const shouldMirror = ( !!matchedAction && isRunning ) || isInstalling;
  const streamLabel = matchedAction ? (matchedAction.name || matchedAction.id) : 'installation';
  const logText = shouldMirror ? actionLogText(stepsJson) : '';
  // Mirror the bound action's transcript INTO the xterm so the running
  // console (java banner, player joins, node output, …) appears directly
  // in this terminal — there is no separate log box. Deltas are computed against
  // the last mirrored text: exact-prefix appends are written directly,
  // while a slid 8 KiB tail window re-anchors on the previous tail so
  // only truly new bytes are mirrored and polls never spam duplicates.
  // A new workflow run (runKey change) starts with a separator so the old
  // scrollback stays readable; when the run ends an ended marker is written
  // once and mirroring stops (no stale cross-action logs).
  const lastMirroredRef = useRef('');
  const lastRunRef = useRef('');
  const wasMirroringRef = useRef(false);
  const runKey = shouldMirror ? `${installKind}:${runningActionId}:${tid}` : '';
  useEffect(() => { lastMirroredRef.current = ''; lastRunRef.current = ''; wasMirroringRef.current = false; }, [tid]);
  useEffect(() => {
    if (onConnState) onConnState(pane.key, connState, connMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connState, connMsg]);
  useEffect(() => {
    const term = termRef.current;
    // Run ended: stamp the marker once, keep scrollback, stop mirroring.
    if (!shouldMirror) {
      if (wasMirroringRef.current && term && isBound && !isStartupBound) {
        term.write(`\r\n\x1b[90m— ${streamLabel} console ended —\x1b[0m\r\n`);
      }
      wasMirroringRef.current = false;
      return;
    }
    if (!term || logText === '') {
      wasMirroringRef.current = true;
      return;
    }
    // New run started (different workflow key): separator + full tail.
    if (lastRunRef.current !== '' && lastRunRef.current !== runKey) {
      lastMirroredRef.current = '';
      term.write(`\r\n\x1b[90m— streaming ${streamLabel} console —\x1b[0m\r\n`);
      const tail = logText.length > 16384 ? logText.slice(-16384) : logText;
      term.write(tail);
      lastMirroredRef.current = logText;
      lastRunRef.current = runKey;
      wasMirroringRef.current = true;
      return;
    }
    const prev = lastMirroredRef.current;
    if (logText === prev && lastRunRef.current === runKey) return;
    let delta: string | null = null;
    if (prev === '') {
      delta = logText;
    } else if (logText.startsWith(prev)) {
      delta = logText.slice(prev.length);
    } else {
      const anchor = prev.slice(-2000);
      const idx = anchor !== '' ? logText.lastIndexOf(anchor) : -1;
      if (idx >= 0) delta = logText.slice(idx + anchor.length);
      else delta = logText.length > 8000 ? logText.slice(-8000) : logText;
    }
    lastMirroredRef.current = logText;
    lastRunRef.current = runKey;
    wasMirroringRef.current = true;
    if (delta === null || delta === '') return;
    if (prev === '') term.write(`\r\n\x1b[90m— streaming ${streamLabel} console —\x1b[0m\r\n`);
    // Cap a single mirror burst so a step transition can't flood scrollback.
    term.write(delta.length > 16384 ? delta.slice(-16384) : delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logText, shouldMirror, runKey, streamLabel, tid, isBound, isStartupBound]);

  const handleLine = (line: string) => {
    // Fully functional console: every typed line goes straight to the
    // RUNNING workflow's stdin — the bound action
    // (POST …/actions/:id/stdin: tps / op / stop / say … for Minecraft,
    // stdin for `node index.js`, …) or the running install
    // (POST …/install/stdin). No pane-side allow/block gating — the
    // server still enforces the action's own policy. Startup consoles
    // need no relay: input rides the /console WS natively.
    if (line.trim() === '') return;
    if (matchedAction && isRunning) {
      void sendActionStdin(instanceId, matchedAction.id, line).then(
        () => { if (stdinError) setStdinError(''); },
        (e: any) => {
          const msgText = typeof e?.response?.data === 'string' ? e.response.data : (e?.response?.data?.error || e?.message || 'failed to send');
          setStdinError(String(msgText).slice(0, 300));
        },
      );
      return;
    }
    if (isInstalling) {
      void sendInstallStdin(instanceId, line).then(
        () => { if (stdinError) setStdinError(''); },
        (e: any) => {
          const msgText = typeof e?.response?.data === 'string' ? e.response.data : (e?.response?.data?.error || e?.message || 'failed to send');
          setStdinError(String(msgText).slice(0, 300));
        },
      );
    }
  };

  const title = pane.name.trim() !== '' ? pane.name.trim() : (tid !== '' ? tid : 'shell');
  const statusSuffix = shouldMirror
    ? ' · running'
    : isStartupBound && connState === 'connected'
      ? ' · attached'
      : isBound && !isStartupBound
        ? ' · idle'
        : '';

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white" title={tid ? `${title} · ${tid}` : title}>{title}</span>
          {tid !== '' && (
            <span className="block truncate font-mono text-[11px] text-gray-500" title={`Terminal ID: ${tid}`}>{tid}{statusSuffix}</span>
          )}
          {tid === '' && (
            <span className="block truncate font-mono text-[11px] text-gray-500">shell · {connState}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {connState !== 'connected' && (
            <button type="button" onClick={() => handleRef.current?.reconnect()} className="ks-btn" title="Reconnect the live shell now">⟳</button>
          )}
          {canRemove && (
            <button type="button" onClick={() => onRemove(pane.key)} className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-white/5" title="Remove this terminal" aria-label="Remove terminal">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          )}
        </div>
      </div>

      {stdinError && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/90 px-2.5 py-1.5 text-[11px] text-red-200">
          <span className="flex-1 break-words">{stdinError}</span>
          <button type="button" onClick={() => setStdinError('')} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-white">✕</button>
        </div>
      )}

      <div className="px-3 pb-3">
        <div
          style={{
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--ks-card-border)',
            background: 'var(--ks-term-bg,#1e1e1e)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
            endpoint={isStartupBound ? 'console' : undefined}
            onLine={isStartupBound ? undefined : handleLine}
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
// (default `terminal`, customizable in Instance Controls). Terminals are
// added via the header + button, which opens a small dialog asking only for
// Name + terminal ID. A pane whose ID matches a template action's
// terminal_id mirrors that action's live console into its xterm and relays
// typed lines to the running action (Minecraft tps/op/stop, node stdin, …);
// the install_terminal_id does the same for the Installation workflow;
// the startup_terminal_id attaches directly to the container main-process
// stdio via the /console bridge — all with no pane-side gating, real
// functional consoles, not log views.
const TerminalRealPage: React.FC<{ instance: any; title?: string; showHeader?: boolean }> = ({ instance, title, showHeader = true }) => {
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const termCfg = controls.shortcuts.terminal;
  const keySeq = useRef(1);
  const makePane = (key: number, name = '', terminalId = ''): TerminalPaneState => ({
    key,
    name,
    terminalId,
  });
  const [panes, setPanes] = useState<TerminalPaneState[]>(() => [makePane(0)]);

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

  // Live workflow status for the console mirror. The routed snapshot goes
  // stale the moment an action starts, so poll silently while any pane is
  // bound to an ID (same 3s cadence as the actions menu).
  const { instance: live, reload } = useInstance(Number(instance?.id));
  const hasBound = panes.some((p) => normTid(p.terminalId) !== '');
  useEffect(() => {
    if (!hasBound) return;
    const t = window.setInterval(() => { void reload(true); }, 3000);
    return () => window.clearInterval(t);
  }, [hasBound, reload]);
  const src: any = live ?? instance;
  const installState: string = src?.install_state ?? '';
  const installKind: string = src?.install_kind ?? '';
  const runningActionId: string = installState === 'running' && installKind === 'action' ? (src?.install_action_id || '') : '';
  const stepsJson: string = src?.install_steps_json ?? '';

  // Installation + startup console IDs ride on the instance config
  // (deploy-time snapshot of the template spec).
  const { installTerminalId, startupTerminalId } = useMemo(() => {
    const empty = { installTerminalId: '', startupTerminalId: '' };
    try {
      const cfg = instance?.config ? parseConfig(instance.config) : null;
      if (!cfg) return empty;
      const adv = (cfg as any)?.advanced;
      return {
        installTerminalId: normTid((cfg as any)?.install_terminal_id),
        startupTerminalId: adv && typeof adv === 'object' ? normTid(adv.startup_terminal_id) : '',
      };
    } catch {
      return empty;
    }
  }, [instance?.config]);

  const maxN = parseInt(String(termCfg.terminal_max || '').trim(), 10);
  const atMax = Number.isFinite(maxN) && maxN > 0 && panes.length >= maxN;
  const canAdd = (termCfg.terminal_allow_multi || panes.length === 0) && !atMax;
  const [showAdd, setShowAdd] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftId, setDraftId] = useState('');
  const openAdd = () => { setDraftName(''); setDraftId(''); setShowAdd(true); };
  const confirmAdd = () => {
    const v = normTid(draftId);
    if (v === '') return;
    const k = keySeq.current++;
    setPanes((ps) => [...ps, makePane(k, draftName.trim(), v)]);
    setShowAdd(false);
  };

  return (
    <div className="animate-fade-in space-y-3">
      {showHeader && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ks-heading)', margin: 0 }}>{title || 'Terminal'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canAdd ? (
            <button type="button" onClick={openAdd} title={Number.isFinite(maxN) && maxN > 0 ? `Add terminal (${panes.length}/${maxN})` : 'Add terminal'} aria-label="Add terminal" className="ks-btn-header ks-icon-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
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
          <button type="button" onClick={openAdd} title="Add terminal" aria-label="Add terminal" className="ks-btn-header ks-icon-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      )}
      {(() => {
        const consoles: string[] = [
          ...actions.filter((a: any) => normTid(a?.terminal_id) !== '').map((a: any) => `${a.name || a.id} (${normTid(a.terminal_id)})`),
        ];
        if (installTerminalId !== '') consoles.push(`Installation (${installTerminalId})`);
        if (startupTerminalId !== '') consoles.push(`Startup (${startupTerminalId})`);
        return consoles.length > 0 ? (
          <p className="text-[11px] text-gray-500">
            Consoles: {consoles.join(' · ')} — press + and enter the ID for a live console (tps / op / stop … work while it runs).
          </p>
        ) : (
          <p className="text-[11px] text-gray-500">No console bound yet — set a Terminal ID on an action, the Installation workflow, or the Startup command (e.g. <code className="font-mono">mc-console</code>) to attach consoles here.</p>
        );
      })()}

      {panes.map((p) => (
        <TerminalPane
          key={p.key}
          instanceId={instance.id}
          pane={p}
          actions={actions}
          runningActionId={runningActionId}
          installState={installState}
          installKind={installKind}
          installTerminalId={installTerminalId}
          startupTerminalId={startupTerminalId}
          stepsJson={stepsJson}
          canRemove={panes.length > 1}
          onRemove={removePane}
        />
      ))}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add terminal"
        footer={
          <>
            <button type="button" onClick={() => setShowAdd(false)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAdd}
              disabled={normTid(draftId) === ''}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              Add
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="terminal-add-name">
              Name
            </label>
            <input
              id="terminal-add-name"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); }}
              placeholder="e.g. MC console"
              className="ks-input w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="terminal-add-id">
              ID
            </label>
            <input
              id="terminal-add-id"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); }}
              placeholder="action terminal id (e.g. mc-console)"
              className="ks-input w-full ks-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Must match the action's Terminal ID to get its live console.
            </p>
          </div>
        </div>
      </Modal>
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
