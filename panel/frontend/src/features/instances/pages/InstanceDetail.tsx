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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { useInstanceNavSync } from '@/shared/components/layout/InstanceNavContext';
import { getPageContent, getPageLabel, isPageAllowed, resolveRedirectTarget, type PageContent } from '@/shared/utils/instancePages';
import { pageNavigateTarget } from '@/shared/lib/customPageSdk';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import ErrorState from '@/shared/components/ui/ErrorState';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';
import Modal from '@/shared/components/ui/Modal';
import PageActionsPill, { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import Terminal, { type TerminalHandle } from '@/shared/components/ui/Terminal';
import RichMenu from '@/shared/components/ui/RichMenu';
import InstancePortsEditor from '@/features/instances/pages/InstancePortsEditor';
import InstanceOverview from '@/features/instances/pages/InstanceOverview';
import InstanceFiles from '@/features/instances/pages/InstanceFiles';
import InstanceFileEditor from '@/features/instances/pages/InstanceFileEditor';
import { resolveInstanceControls, shortcutLabel, shortcutSlug, MAX_DEFAULT_TERMINALS } from '@/features/instances/utils/instanceControls';
import type { TerminalDefaultDef, TerminalInputMode, TerminalShortcutDef } from '@/features/instances/utils/instanceControls';
import { extractShortcutVars, resolveShortcutCommand } from '@/features/instances/utils/instanceControls';
import { sendActionStdin, sendInstallStdin } from '@/features/instances/api/instanceAdvanced';
import InstanceSftpCard from '@/features/instances/components/InstanceSftpCard';
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

interface TerminalPaneState {
  key: number;
  // Display name shown in the pane header (from the Add-terminal dialog).
  name: string;
  // Committed action terminal ID (drives WS ?terminal= + action matching).
  // Set once via the Add-terminal dialog — no inline editing.
  terminalId: string;
}

// ShortcutMenuButton — SVG-only trigger (same chrome as the terminal +
// button) opening the template's command shortcuts. Plain picks act at
// once; parameterized picks open the ask dialog (handled by onPick).
const ShortcutMenuButton: React.FC<{
  shortcuts: TerminalShortcutDef[];
  onPick: (i: number) => void;
}> = ({ shortcuts, onPick }) => (
  <RichMenu
    items={shortcuts.map((sc, i) => ({
      key: String(i),
      label: sc.label.trim() !== '' ? sc.label : sc.command,
    }))}
    onSelect={(key) => {
      const i = Number(key);
      if (Number.isInteger(i) && shortcuts[i]) onPick(i);
    }}
    ariaLabel="Shortcuts"
    placement="bottom-right"
    width={220}
    trigger={({ open, toggle }) => (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Shortcuts"
        title="Shortcuts"
        className="ks-btn-header ks-icon-btn shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
      </button>
    )}
  />
);

// SendGlyphButton — Send control in the same icon-button chrome, showing
// the ⌯⌲ glyphs instead of SVG art or the word "Send".
const SendGlyphButton: React.FC<{
  onSend: () => void;
  disabled?: boolean;
}> = ({ onSend, disabled }) => (
  <button
    type="button"
    onClick={onSend}
    disabled={disabled}
    aria-label="Send"
    title="Send"
    className="ks-btn-header ks-icon-btn shrink-0 disabled:opacity-40"
  >
    <span aria-hidden="true" className="text-sm leading-none">⌯⌲</span>
  </button>
);

// ShortcutAskFields — one compact input per {{VAR}} / ${VAR} / $(VAR)
// placeholder (env-'ask' behaviour for shortcuts). Rendered inside the
// ask dialog, which fits any number of variables.
const ShortcutAskFields: React.FC<{
  vars: string[];
  askVals: Record<string, string>;
  onAsk: (name: string, value: string) => void;
  wide?: boolean;
}> = ({ vars, askVals, onAsk, wide }) => (
  <>
    {vars.map((v) => (
      <input
        key={v}
        value={askVals[v] ?? ''}
        onChange={(e) => onAsk(v, e.target.value.slice(0, 200))}
        placeholder={v}
        aria-label={`Value for ${v}`}
        title={`Value for ${v}`}
        className={wide ? 'ks-input w-full min-w-0' : 'ks-input w-28 min-w-0 shrink-0'}
      />
    ))}
  </>
);

// TerminalPane — one live terminal. The xterm dials one of three bridges:
//  - action terminal_id / install_terminal_id while its workflow RUNS →
//    dials the /workflow bridge (live stream of the running transcript
//    with history replay) and relays typed lines to the running
//    workflow's stdin (POST …/actions/:id/stdin) — e.g. Minecraft tps /
//    op / stop; input policy stays server-enforced, the stream is
//    output-only. While idle the pane stays a plain side shell (the edge
//    keeps no record to stream until the workflow starts);
//  - startup_terminal_id → dials the /startup bridge instead, attaching
//    directly to the container main-process stdio (fully interactive,
//    no mirror/relay needed).
//  - empty/unknown ID → plain side shell (/terminal → /bin/sh).
// The /workflow WS is the pane's ONLY log source (history replay on
// connect, exact live deltas after): there is deliberately no DB-poll
// mirror — a second writer into the same xterm is what used to duplicate
// lines and scramble their order. Typed input gets a local echo (the
// piped terminal has no PTY echo) and rides the POST relay to the server.
// No separate log box, no per-pane options.
const TerminalPane: React.FC<{
  instanceId: number;
  pane: TerminalPaneState;
  actions: any[];
  runningActionId: string;
  installState: string;
  installKind: string;
  installTerminalId: string;
  startupTerminalId: string;
  inputMode: TerminalInputMode;
  boxText: string;
  onBoxText: (v: string) => void;
  onRegisterSend: (key: number, fn: ((line: string) => void) | null) => void;
  onRegisterHandle: (key: number, h: TerminalHandle | null) => void;
}> = ({ instanceId, pane, actions, runningActionId, installState, installKind, installTerminalId, startupTerminalId, inputMode, boxText, onBoxText, onRegisterSend, onRegisterHandle }) => {
  const handleRef = useRef<TerminalHandle | null>(null);
  // Callback ref: keeps the local handle for the box-mode Send path and
  // registers it with the page so the actions-pill Copy / Download buttons
  // can snapshot the ACTIVE pane's buffer. React calls it with null on
  // unmount, which unregisters the pane.
  const setHandle = useCallback((h: TerminalHandle | null) => {
    handleRef.current = h;
    onRegisterHandle(pane.key, h);
  }, [pane.key, onRegisterHandle]);
  const [stdinError, setStdinError] = useState('');
  // Expose this pane's sendLine to the page (direct-mode header dropdown
  // sends to the active tab through it).
  useEffect(() => {
    onRegisterSend(pane.key, (ln: string) => { try { handleRef.current?.sendLine(ln); } catch { /* noop */ } });
    return () => onRegisterSend(pane.key, null);
  }, [pane.key, onRegisterSend]);

  const tid = normTid(pane.terminalId);
  const matchedAction = tid !== '' ? actions.find((a: any) => normTid(a?.terminal_id) === tid) : undefined;
  const isRunning = !!matchedAction && installState === 'running' && runningActionId === matchedAction.id;
  // Installation terminal: bound when the pane ID equals the template's
  // install_terminal_id; live while a NON-action workflow runs (a running
  // action owns the same edge key and has its own stdin endpoint).
  const isInstallBound = tid !== '' && normTid(installTerminalId) !== '' && tid === normTid(installTerminalId);
  const isInstalling = isInstallBound && installState === 'running' && installKind !== 'action';
  // Startup terminal: bound when the pane ID equals the template's
  // advanced.startup_terminal_id. I/O rides the /startup WS natively.
  const isStartupBound = tid !== '' && normTid(startupTerminalId) !== '' && tid === normTid(startupTerminalId);
  // Workflow panes (bound action/install IDs) dial /workflow for the live
  // terminal — never the side shell — so typed lines reach only the MC
  // server (via POST relay) and output is the server terminal itself.
  // Dial it only while THIS pane's workflow actually runs: dialling while
  // idle 404s on the edge (no record yet, or lost on edge restart) and
  // the WS then loops reconnect errors instead of showing idle.
  const isWorkflowPane = !!matchedAction || isInstallBound;
  const isWorkflowActive = (!!matchedAction && isRunning) || isInstalling;

  const handleLine = (line: string) => {
    // Fully functional terminal: every typed line goes straight to the
    // RUNNING workflow's stdin — the bound action
    // (POST …/actions/:id/stdin: tps / op / stop / say … for Minecraft,
    // stdin for `node index.js`, …) or the running install
    // (POST …/install/stdin). No pane-side allow/block gating — the
    // server still enforces the action's own policy. Startup terminals
    // need no relay: input rides the /startup WS natively.
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

  // Box input method: the xterm below is output-only (readOnly) — the
  // operator types here and Send submits the line through the exact same
  // pipeline as pressing Enter in the terminal (TerminalHandle.sendLine).
  const boxMode = inputMode === 'box';
  const sendBox = () => {
    if (boxText.trim() === '') return;
    try { handleRef.current?.sendLine(boxText); } catch { /* noop */ }
    onBoxText('');
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      {stdinError && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-red-900/40 bg-red-950/90 px-2.5 py-1.5 text-[11px] text-red-200">
          <span className="flex-1 break-words">{stdinError}</span>
          <button type="button" onClick={() => setStdinError('')} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-white">✕</button>
        </div>
      )}

      <div className="p-3">
        <Terminal
          ref={setHandle}
          instanceId={instanceId}
          terminalId={tid}
          endpoint={isStartupBound ? 'startup' : isWorkflowPane && isWorkflowActive ? 'workflow' : undefined}
          onLine={isStartupBound ? undefined : handleLine}
          readOnly={boxMode}
        />
        {boxMode && (
          <div className="flex items-center gap-2 mt-2 min-w-0">
            <input
              value={boxText}
              onChange={(e) => onBoxText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendBox(); }}
              placeholder="Type a command…"
              aria-label={`Command input for ${title}`}
              className="ks-input w-full min-w-0 flex-1"
            />
            <SendGlyphButton onSend={sendBox} />
          </div>
        )}
      </div>
    </div>
  );
};

// TerminalRealPage — native xterm terminal(s) for the terminal shortcut slug
// (default `terminal`, customizable in Instance Controls). Terminals are
// added via the actions-pill + button, which opens a small dialog asking only
// for Name + terminal ID (empty ID = plain shell). No title heading is
// rendered (the header breadcrumb already shows the page name). Panes render as TABS: the tab
// bar sits below the actions pill, clicking a
// tab activates that pane (inactive panes stay mounted hidden so their WS
// stays alive). A pane whose ID matches a template action's
// terminal_id streams that action's live terminal via the /workflow bridge
// (history replay + exact live deltas, local echo on input) and relays
// typed lines to the running action (Minecraft tps/op/stop, node stdin, …);
// the install_terminal_id does the same for the Installation workflow;
// the startup_terminal_id attaches directly to the container main-process
// stdio via the /startup bridge — all with no pane-side gating, real
// functional terminals, not log views.
const TerminalRealPage: React.FC<{ instance: any; title?: string; showHeader?: boolean }> = ({ instance, title, showHeader = true }) => {
  const controls = useMemo(() => resolveInstanceControls(instance?.config), [instance?.config]);
  const termCfg = controls.shortcuts.terminal;
  const makePane = (key: number, name = '', terminalId = ''): TerminalPaneState => ({
    key,
    name,
    terminalId,
  });
  // seedList — the template's configured default terminals, normalised and
  // capped (honours the template's own multi/max caps). Empty = legacy
  // single blank shell.
  const seedList: TerminalDefaultDef[] = useMemo(() => {
    const rows = (Array.isArray(termCfg.default_terminals) ? termCfg.default_terminals : []).slice(0, MAX_DEFAULT_TERMINALS);
    const single = !termCfg.terminal_allow_multi ? rows.slice(0, 1) : rows;
    const maxN = parseInt(String(termCfg.terminal_max || '').trim(), 10);
    const limited = Number.isFinite(maxN) && maxN > 0 ? single.slice(0, maxN) : single;
    return limited.map((t) => ({ name: String(t?.name ?? '').trim().slice(0, 64), id: normTid(t?.id) }));
  }, [termCfg]);
  const seedSig = JSON.stringify(seedList);
  const toSeedPanes = (list: TerminalDefaultDef[]): TerminalPaneState[] =>
    list.length > 0 ? list.map((t, i) => makePane(i, t.name, t.id)) : [makePane(0)];
  const keySeq = useRef(Math.max(seedList.length, 1));
  const [panes, setPanes] = useState<TerminalPaneState[]>(() => toSeedPanes(seedList));
  const [activeKey, setActiveKey] = useState<number>(0);
  // Command shortcuts (template Controls → Terminal shortcut). Off/empty =
  // no shortcut UI anywhere. Both modes share one icon-menu trigger (page
  // header top-right in direct mode, bottom input row in box mode): plain
  // picks act at once, parameterized picks open the ask dialog.
  const boxMode = (termCfg.terminal_input_mode || 'direct') === 'box';
  const shortcuts = useMemo(() => {
    if (!termCfg.terminal_shortcuts_enabled || !Array.isArray(termCfg.terminal_shortcuts)) return [];
    return termCfg.terminal_shortcuts.filter((s) => s && (String(s.label ?? '').trim() !== '' || String(s.command ?? '').trim() !== ''));
  }, [termCfg]);
  const shortcutsOn = shortcuts.length > 0;
  const [askVals, setAskVals] = useState<Record<string, string>>({});
  const [boxTexts, setBoxTexts] = useState<Record<number, string>>({});
  // askFor — parameterized shortcut awaiting its variables in the ask
  // dialog (sub-page popup listing every placeholder). `target` decides
  // the confirm action: box fills the bottom input, direct transmits to
  // the active tab at once.
  const [askFor, setAskFor] = useState<{ i: number; target: 'box' | 'direct' } | null>(null);
  const askCmd = askFor !== null ? (shortcuts[askFor.i]?.command ?? '') : '';
  const askVars = useMemo(() => extractShortcutVars(askCmd), [askCmd]);
  const askBlocked = askVars.some((v) => !(askVals[v] ?? '').trim());
  const onAsk = useCallback((name: string, value: string) => {
    setAskVals((m) => ({ ...m, [name]: value.slice(0, 200) }));
  }, []);
  const closeAsk = () => setAskFor(null);
  const confirmAsk = () => {
    if (askFor === null || askBlocked) return;
    const text = resolveShortcutCommand(askCmd, askVals);
    if (askFor.target === 'box') {
      setBoxTexts((m) => ({ ...m, [activeKey]: text }));
    } else {
      sendToActive(text);
    }
    setAskFor(null);
  };
  // Active pane's sendLine, registered by each TerminalPane (direct-mode
  // header/ask sends route through it).
  const sendRegistry = useRef<Map<number, (ln: string) => void>>();
  if (!sendRegistry.current) sendRegistry.current = new Map();
  const onRegisterSend = useCallback((key: number, fn: ((ln: string) => void) | null) => {
    const m = sendRegistry.current;
    if (!m) return;
    if (fn) m.set(key, fn); else m.delete(key);
  }, []);
  // Live TerminalHandles per pane — the actions-pill Copy / Download
  // buttons snapshot the ACTIVE pane's scrollback through this map
  // (registered by each TerminalPane's callback ref, unregistered on
  // unmount with null).
  const termHandles = useRef<Map<number, TerminalHandle>>();
  if (!termHandles.current) termHandles.current = new Map();
  const onRegisterHandle = useCallback((key: number, h: TerminalHandle | null) => {
    const m = termHandles.current;
    if (!m) return;
    if (h) m.set(key, h); else m.delete(key);
  }, []);
  // Transient pill feedback ("Copied", "Saved", …) with a self-clearing
  // timer so the pill never gets stuck showing a stale message.
  const [pillFeedback, setPillFeedback] = useState('');
  const pillFeedbackTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (pillFeedbackTimer.current !== null) window.clearTimeout(pillFeedbackTimer.current);
  }, []);
  const flashPill = (msg: string) => {
    setPillFeedback(msg);
    if (pillFeedbackTimer.current !== null) window.clearTimeout(pillFeedbackTimer.current);
    pillFeedbackTimer.current = window.setTimeout(() => setPillFeedback(''), 1600);
  };
  const activePaneLabel = (): string => {
    const idx = Math.max(0, panes.findIndex((p) => p.key === activeKey));
    const ap = panes[idx];
    if (!ap) return 'shell';
    const tid = normTid(ap.terminalId);
    return ap.name.trim() !== '' ? ap.name.trim() : (tid !== '' ? tid : `shell ${idx + 1}`);
  };
  const copyActiveTerminal = async () => {
    const text = termHandles.current?.get(activeKey)?.getContent() ?? '';
    if (text.trim() === '') { flashPill('Empty'); return; }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      flashPill('Copied');
    } catch {
      flashPill('Copy failed');
    }
  };
  const downloadActiveTerminal = () => {
    const text = termHandles.current?.get(activeKey)?.getContent() ?? '';
    if (text.trim() === '') { flashPill('Empty'); return; }
    try {
      const safeLabel = activePaneLabel().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 32) || 'shell';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${instance?.id ?? 'instance'}-${safeLabel}-${stamp}.log`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      flashPill('Saved');
    } catch {
      flashPill('Save failed');
    }
  };
  const sendToActive = (text: string) => {
    if (text.trim() === '') return;
    try { sendRegistry.current?.get(activeKey)?.(text); } catch { /* noop */ }
  };
  // Shortcut pick from either trigger: plain commands act at once
  // (box fills the bottom input, direct transmits to the active tab);
  // parameterized ones open the ask dialog for their variables.
  const runShortcut = (i: number, target: 'box' | 'direct') => {
    const sc = shortcuts[i];
    if (!sc) return;
    if (extractShortcutVars(sc.command).length === 0) {
      if (target === 'box') {
        setBoxTexts((m) => ({ ...m, [activeKey]: sc.command }));
      } else {
        sendToActive(sc.command);
      }
    } else {
      setAskFor({ i, target });
    }
  };
  // Reseed guard: "<instance-id>|<defaults signature>" already reflected in
  // `panes`. Covers mount-with-late-config (snapshot arrives after first
  // render) and navigating the Terminal page across instances (never show
  // another instance's panes). `touched` flips on any operator add/remove
  // so a live config refresh never wipes hand-built panes.
  const seededKey = useRef<string>(`${instance?.id ?? ''}|${seedSig}`);
  const touched = useRef(false);
  useEffect(() => {
    const key = `${instance?.id ?? ''}|${seedSig}`;
    if (seededKey.current === key) return;
    const sameInstance = seededKey.current.split('|')[0] === String(instance?.id ?? '');
    const pristine = panes.length <= 1 && panes.every((p) => p.name.trim() === '' && normTid(p.terminalId) === '');
    seededKey.current = key;
    if (!sameInstance) {
      // Never leak another instance's shortcut/box drafts into this one.
      setAskFor(null);
      setAskVals({});
      setBoxTexts({});
    }
    if (!sameInstance || (!touched.current && pristine && seedList.length > 0)) {
      const next = toSeedPanes(seedList);
      keySeq.current = Math.max(next.length, 1);
      setPanes(next);
      setActiveKey(next[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, seedSig]);

  const removePane = (key: number) => {
    touched.current = true;
    setPanes((ps) => {
      if (ps.length <= 1) return ps;
      const idx = ps.findIndex((p) => p.key === key);
      const next = ps.filter((p) => p.key !== key);
      if (key === activeKey) {
        const fallback = next[Math.min(idx, next.length - 1)] ?? next[0];
        if (fallback) setActiveKey(fallback.key);
      }
      return next;
    });
    setBoxTexts((m) => {
      if (!(key in m)) return m;
      const n = { ...m };
      delete n[key];
      return n;
    });
  };
  // Keep the active tab valid if panes change from elsewhere.
  useEffect(() => {
    if (!panes.some((p) => p.key === activeKey) && panes.length > 0) {
      setActiveKey(panes[0].key);
    }
  }, [panes, activeKey]);

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

  // Live workflow status for pane routing (which bridge each bound pane
  // dials) and tab dots. The routed snapshot goes stale the moment an
  // action starts, so poll silently while any pane is bound to an ID
  // (same 3s cadence as the actions menu). Otherwise still poll at a
  // slower cadence so start/stop flips between the terminal and the
  // "Instance Stopped" state without a manual reload — and so a plain
  // shell (no bound ID) also notices the stop instead of looping
  // reconnecting errors against a gone container.
  const { instance: live, reload } = useInstance(Number(instance?.id));
  const hasBound = panes.some((p) => normTid(p.terminalId) !== '');
  useEffect(() => {
    const t = window.setInterval(() => { void reload(true); }, hasBound ? 3000 : 5000);
    return () => window.clearInterval(t);
  }, [hasBound, reload]);
  const src: any = live ?? instance;
  // Stopped instances have no container to attach to — the edge exec /
  // workflow bridges would just fail and the xterm would loop
  // "reconnecting …" + error banners forever. Show a clean stopped
  // state instead and don't mount any Terminal (no WS dial at all).
  const isStopped = String(src?.status ?? '') === 'stopped';
  const installState: string = src?.install_state ?? '';
  const installKind: string = src?.install_kind ?? '';
  const runningActionId: string = installState === 'running' && installKind === 'action' ? (src?.install_action_id || '') : '';

  // Installation + startup terminal IDs ride on the instance config
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
  // Empty ID = plain shell (valid). A non-empty draft that normalises to
  // empty (e.g. "!!!") is invalid — block Add and show the rule inline
  // instead of silently mangling the ID.
  const draftNorm = normTid(draftId);
  const draftInvalid = draftId.trim() !== '' && draftNorm === '';
  const confirmAdd = () => {
    if (draftInvalid) return;
    touched.current = true;
    const v = draftNorm;
    const k = keySeq.current++;
    setPanes((ps) => [...ps, makePane(k, draftName.trim(), v)]);
    setActiveKey(k);
    setShowAdd(false);
  };
  const tabStatusFor = (p: TerminalPaneState): { dot: string; label: string } => {
    const tid = normTid(p.terminalId);
    if (tid === '') return { dot: 'bg-gray-500', label: 'shell' };
    const matched = actions.find((a: any) => normTid(a?.terminal_id) === tid);
    const running = !!matched && installState === 'running' && runningActionId === matched.id;
    const installing = tid === normTid(installTerminalId) && installTerminalId !== '' && installState === 'running' && installKind !== 'action';
    if (running || installing) return { dot: 'bg-green-400', label: 'running' };
    const startup = tid === normTid(startupTerminalId) && startupTerminalId !== '';
    if (startup) {
      return { dot: 'bg-sky-400', label: 'startup' };
    }
    if (matched || (tid === normTid(installTerminalId) && installTerminalId !== '')) {
      return { dot: 'bg-amber-400', label: 'idle' };
    }
    return { dot: 'bg-gray-500', label: tid };
  };

  if (isStopped) {
    return (
      <div className="animate-fade-in space-y-3">
        <div className="ks-card rounded-xl text-center py-12 px-6">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 bg-white/[0.03] text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </div>
          <h3 className="text-base font-semibold text-white">Instance Stopped</h3>
          <p className="text-[13px] text-gray-500 mt-1">Start the instance to use the terminal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-3">
      {/* Top-right actions pill (template-form pattern): shortcut menu +
          add-terminal button. Page-level chrome — always mounted so the
          actions stay reachable. Pushed below the two-row instance header
          (breadcrumb + tab strip) so it never covers the tabs. */}
      <PageActionsPill outerClassName="fixed top-[max(7rem,env(safe-area-inset-top))] right-4 sm:right-6 z-40">
        {shortcutsOn && (
          <ShortcutMenuButton shortcuts={shortcuts} onPick={(i) => runShortcut(i, boxMode ? 'box' : 'direct')} />
        )}
        {canAdd ? (
          <button type="button" onClick={openAdd} title={Number.isFinite(maxN) && maxN > 0 ? `Add terminal (${panes.length}/${maxN})` : 'Add terminal'} aria-label="Add terminal" className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition" style={PILL_TAB_STYLE}>
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add
            </span>
          </button>
        ) : (
          <button type="button" disabled title={atMax ? `Template caps terminals at ${maxN}` : 'Template allows a single terminal pane'} aria-label={atMax ? `Max ${maxN} terminals` : 'Multi-terminal disabled by template'} className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-40" style={PILL_TAB_STYLE}>
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyActiveTerminal()}
          title="Copy the active terminal's output to the clipboard"
          aria-label="Copy terminal output"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
        <button
          type="button"
          onClick={downloadActiveTerminal}
          title="Download the active terminal's output as a .log file"
          aria-label="Download terminal output"
          className="ks-btn-header ks-icon-btn shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </button>
        {pillFeedback !== '' && (
          <span className="text-xs text-emerald-300 px-1 whitespace-nowrap" role="status" aria-live="polite">{pillFeedback}</span>
        )}
      </PageActionsPill>
      {/* Tabs bar — desktop (lg+) strip above the active terminal.
          active terminal. Horizontally scrollable; inactive panes stay
          mounted hidden so their WS sessions survive tab switches. Phones
          use the bottom tabs pill below instead (template-form pattern). */}
      <div role="tablist" aria-label="Terminals" className="hidden lg:flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
        {panes.map((p, idx) => {
          const tid = normTid(p.terminalId);
          const label = p.name.trim() !== '' ? p.name.trim() : (tid !== '' ? tid : `shell ${idx + 1}`);
          const st = tabStatusFor(p);
          const active = p.key === activeKey;
          return (
            <div
              key={p.key}
              role="tab"
              aria-selected={active}
              aria-label={`${label}${tid ? ` (${tid})` : ''}`}
              onClick={() => setActiveKey(p.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveKey(p.key); } }}
              tabIndex={0}
              title={tid ? `${label} · ${tid} · ${st.label}` : `${label} · ${st.label}`}
              className={`group inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap transition shrink-0 ${active ? 'bg-white/10 border-white/20 text-white' : 'bg-black/20 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} aria-hidden="true" />
              <span className="max-w-[10rem] truncate">{label}</span>
              {tid !== '' && (
                <span className="max-w-[8rem] truncate font-mono text-[11px] opacity-60">{tid}</span>
              )}
              {panes.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePane(p.key); }}
                  title={`Close ${label}`}
                  aria-label={`Close ${label}`}
                  className="p-1 rounded-md text-gray-500 hover:text-red-300 hover:bg-white/10 shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {panes.map((p) => (
        <div key={p.key} className={p.key === activeKey ? '' : 'hidden'}>
          <TerminalPane
            instanceId={instance.id}
            pane={p}
            actions={actions}
            runningActionId={runningActionId}
            installState={installState}
            installKind={installKind}
            installTerminalId={installTerminalId}
            startupTerminalId={startupTerminalId}
            inputMode={termCfg.terminal_input_mode || 'direct'}
            boxText={boxTexts[p.key] ?? ''}
            onBoxText={(v) => setBoxTexts((m) => ({ ...m, [p.key]: v }))}
            onRegisterSend={onRegisterSend}
            onRegisterHandle={onRegisterHandle}
          />
        </div>
      ))}

      {/* Phone tabs — terminal switcher pinned bottom-left (phones only).
          Uses the PageTabsPill default slot: a fixed bottom row that hugs
          the left (justify-start + shrink-wrap shell) with the menu opening
          UPWARD above the toggle, plus the spacer so the fixed pill never
          covers trailing content. Desktop keeps the strip above. */}
      <PageTabsPill
        ariaLabel="Terminals"
        activeLabel={(() => {
          const ap = panes.find((p) => p.key === activeKey) ?? panes[0];
          if (!ap) return 'Terminal';
          const tid = normTid(ap.terminalId);
          return ap.name.trim() !== '' ? ap.name.trim() : (tid !== '' ? tid : 'shell');
        })()}
      >
        {panes.map((p, idx) => {
          const tid = normTid(p.terminalId);
          const label = p.name.trim() !== '' ? p.name.trim() : (tid !== '' ? tid : `shell ${idx + 1}`);
          const st = tabStatusFor(p);
          const active = p.key === activeKey;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${label}${tid ? ` (${tid})` : ''}`}
              onClick={() => setActiveKey(p.key)}
              className={`ks-tab shrink-0 flex-none whitespace-nowrap px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${active ? 'ks-tab-active' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} aria-hidden="true" />
              <span className="whitespace-nowrap leading-none">{label}</span>
            </button>
          );
        })}
      </PageTabsPill>

      {/* Shortcut ask dialog — parameterized pick lists every variable
          (any count, scrollable) and stays strict: Send enables only when
          all values are filled. Confirm fills the bottom input (box mode)
          or transmits to the active tab at once (direct mode). */}
      {askFor !== null && shortcuts[askFor.i] && (
        <Modal
          open
          onClose={closeAsk}
          title={shortcuts[askFor.i].label.trim() !== '' ? shortcuts[askFor.i].label : 'Shortcut'}
          maxWidth="max-w-md"
          footer={
            <>
              <button type="button" onClick={closeAsk} className="ks-btn">
                Cancel
              </button>
              <SendGlyphButton onSend={confirmAsk} disabled={askBlocked} />
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 font-mono break-all">{askCmd}</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              <ShortcutAskFields vars={askVars} askVals={askVals} onAsk={onAsk} wide />
            </div>
          </div>
        </Modal>
      )}

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
              disabled={draftInvalid}
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
              ID <span className="text-gray-500">(empty = plain shell)</span>
            </label>
            <input
              id="terminal-add-id"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); }}
              placeholder="action terminal id (e.g. mc-console)"
              className="ks-input w-full ks-mono"
            />
            {draftInvalid ? (
              <p className="text-[11px] text-red-300 mt-1.5">
                Invalid ID — use only letters, numbers, _ and - (max 64 chars).
              </p>
            ) : draftNorm !== '' ? (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Terminal ID: <code className="font-mono text-gray-300">{draftNorm}</code> — must match the action's Terminal ID to get its live console.
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Leave empty for a plain shell, or enter the action's Terminal ID for its live console.
              </p>
            )}
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
  const navigate = useNavigate();
  const { instance, loading, error } = useInstance(instanceId);
  const permissions = useAuthStore((s) => s.permissions);
  // Files bottom pill: Explorer <-> SFTP views. Declared before the early
  // returns so hook order stays stable across loading states.
  const [filesTab, setFilesTab] = useState<'explorer' | 'sftp'>('explorer');

  if (loading) return <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse"><div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" /><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  if (!instance || error) return (
    <ErrorState
      variant="not-found"
      title="Instance not found"
      description={error && error !== 'Instance not found' && error !== 'Instance not found.' ? error : undefined}
      backLabel="Back to instances"
      onBack={() => navigate('/instances')}
    />
  );

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

  // Overview is a native built-in like Ports/SFTP (not a custom
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
  // any linger from older imports, are ignored by design). Explorer and SFTP
  // switch via a desktop tab row plus the panel's PageTabsPill on phones
  // (template-form pattern); both views stay mounted so switching never
  // loses explorer state. The tabs hide when the Files shortcut's
  // "Show SFTP card" page option is off.
  if (effectiveSlug === filesSlug || effectiveSlug === 'files') {
    const showSftp = controls.shortcuts.files.show_sftp;
    const showExplorer = !showSftp || filesTab === 'explorer';
    return (
      <ErrorBoundary resetKey={`files-${instanceId}`} label="instance-page">
        <div className="space-y-4 pb-20">
          {showSftp && (
            <div className="hidden lg:flex items-center gap-1" role="tablist" aria-label="Files views">
              <button
                type="button"
                role="tab"
                aria-selected={filesTab === 'explorer'}
                onClick={() => setFilesTab('explorer')}
                title="File explorer"
                className={`ks-tab inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition${filesTab === 'explorer' ? ' ks-tab-active' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2-2Z" /></svg>
                <span>Explorer</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filesTab === 'sftp'}
                onClick={() => setFilesTab('sftp')}
                title="SFTP access"
                className={`ks-tab inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition${filesTab === 'sftp' ? ' ks-tab-active' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>SFTP</span>
              </button>
            </div>
          )}
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
          <PageTabsPill ariaLabel="Files views" activeLabel={filesTab === 'explorer' ? 'Explorer' : 'SFTP'} spacer={false}>
            <button
              type="button"
              role="tab"
              aria-selected={filesTab === 'explorer'}
              onClick={() => setFilesTab('explorer')}
              title="File explorer"
              className={`ks-tab shrink-0 flex-none whitespace-nowrap px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5${filesTab === 'explorer' ? ' ks-tab-active' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2-2Z" /></svg>
              <span className="whitespace-nowrap leading-none">Explorer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filesTab === 'sftp'}
              onClick={() => setFilesTab('sftp')}
              title="SFTP access"
              className={`ks-tab shrink-0 flex-none whitespace-nowrap px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5${filesTab === 'sftp' ? ' ks-tab-active' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span className="whitespace-nowrap leading-none">SFTP</span>
            </button>
          </PageTabsPill>
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
