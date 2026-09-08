import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useThemeStore } from '@/shared/stores/themeStore';
import { DEFAULT_THEME } from '@/theme/defaults';
import type { Theme } from '@/features/themes/types/theme';
import { isHexColor, parseColor, rgbaAt } from '@/theme/colorUtils';

// Wire-protocol message shapes exchange with the panel's
// /api/instances/:id/terminal bridge. See kspanel/internal/api/handlers/
// terminal_handler.go and ksedge/internal/exec/handler.go.
//
//   { type: 'stdin',  data: <base64> }
//   { type: 'stdout', data: <base64> }
//   { type: 'stderr', data: <base64> }
//   { type: 'resize', cols, rows }
//   { type: 'ready',  cols, rows }
//   { type: 'exit',   code }
//   { type: 'error',  message }
//
// We base64 in both directions so terminal bytes (binary, ANSI) survive the
// JSON text-frame trip through arbitrary reverse proxies.

type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

function wsUrlFor(instanceId: number, terminalId?: string, timeoutS?: string, endpoint?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Startup consoles attach to the main-process bridge (/console);
  // workflow consoles stream the running action/install transcript
  // (/workflow); everything else uses the shell bridge (/terminal).
  const route = endpoint === 'console' ? 'console' : endpoint === 'workflow' ? 'workflow' : 'terminal';
  const base = `${proto}://${window.location.host}/api/instances/${instanceId}/${route}`;
  const q: string[] = [];
  const tid = (terminalId || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  if (tid) q.push(`terminal=${encodeURIComponent(tid)}`);
  const t = String(timeoutS ?? '').trim().replace(/[^0-9]/g, '');
  if (t && t !== '0') q.push(`timeout=${encodeURIComponent(t)}`);
  return q.length > 0 ? `${base}?${q.join('&')}` : base;
}

// terminalThemeFor derives the xterm palette from the ACTIVE theme so the
// terminal follows the Theme Studio like every other surface. The canvas
// background is always the card background (translucent fills render fine
// on canvas — the page behind shows through, exactly like the cards);
// unparseable values fall back to the stock VS-Code-ish palette.
const STOCK_TERM = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  selectionBackground: '#264f78',
  red: '#f48771',
  green: '#89e789',
  yellow: '#ffea7c',
  blue: '#75beff',
  magenta: '#c586c0',
  cyan: '#79d7da',
};

function terminalThemeFor(theme: Theme): {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
} {
  const D = DEFAULT_THEME;
  const cardBg = String(theme.card?.background || '');
  // Card background wins whenever it parses (hex or rgb/rgba) — including
  // the stock default, so the terminal always sits on the card fill.
  const cardBgUsable = cardBg !== '' && parseColor(cardBg) !== null ? cardBg : null;
  const customized = (v: unknown, d: unknown): string | null =>
    isHexColor(v) && v !== d ? v : null;

  return {
    // Translucent card fills render fine on canvas — the page background
    // behind the terminal container shows through.
    background: cardBgUsable || STOCK_TERM.background,
    foreground: isHexColor(theme.card?.text_color) ? theme.card.text_color : STOCK_TERM.foreground,
    cursor: customized(theme.accent?.primary, D.accent.primary) || STOCK_TERM.cursor,
    cursorAccent: cardBgUsable || STOCK_TERM.background,
    selectionBackground:
      isHexColor(theme.accent?.primary)
        ? rgbaAt(theme.accent.primary, 0.35, STOCK_TERM.selectionBackground)
        : STOCK_TERM.selectionBackground,
    black: '#000000',
    red: customized(theme.accent?.danger, D.accent.danger) || STOCK_TERM.red,
    green: customized(theme.accent?.success, D.accent.success) || STOCK_TERM.green,
    yellow: customized(theme.accent?.warning, D.accent.warning) || STOCK_TERM.yellow,
    blue: customized(theme.accent?.info, D.accent.info) || STOCK_TERM.blue,
    magenta: STOCK_TERM.magenta,
    cyan: customized(theme.accent?.info, D.accent.info) || STOCK_TERM.cyan,
    white: isHexColor(theme.card?.text_color) ? theme.card.text_color : STOCK_TERM.foreground,
    brightBlack: '#6e6b6b',
    brightRed: customized(theme.accent?.danger, D.accent.danger) || STOCK_TERM.red,
    brightGreen: customized(theme.accent?.success, D.accent.success) || STOCK_TERM.green,
    brightYellow: customized(theme.accent?.warning, D.accent.warning) || STOCK_TERM.yellow,
    brightBlue: customized(theme.accent?.info, D.accent.info) || STOCK_TERM.blue,
    brightMagenta: STOCK_TERM.magenta,
    brightCyan: customized(theme.accent?.info, D.accent.info) || STOCK_TERM.cyan,
    brightWhite: '#ffffff',
  };
}

interface TerminalProps {
  instanceId: number;
  onStateChange?: (s: ConnState, message?: string) => void;
  // The parent uses this to grab the underlying xterm instance so its
  // "Clear" button can call term.clear() and "Reconnect" can send a
  // fresh resize frame.
  onTermRef?: (term: XTerm | null) => void;
  onTitleChange?: (title: string) => void;
  // Bound-pane identity: forwarded as ?terminal= so the panel/edge can
  // scope the session (and the parent can match it against a template
  // action/install terminal_id). Empty = plain shell (legacy behaviour).
  // Startup-console panes dial endpoint='console' instead; workflow panes
  // (bound action/install consoles) dial endpoint='workflow' instead; the
  // id is then only a display/match key.
  terminalId?: string;
  // Which panel bridge to dial: 'terminal' (side shell, default),
  // 'console' (instance main-process stdio for startup-console panes) or
  // 'workflow' (running action/install transcript for bound panes).
  // Same JSON wire protocol on all three, so the xterm side is unchanged.
  endpoint?: 'terminal' | 'console' | 'workflow';
  // Attach budget in seconds, forwarded as ?timeout= (empty = no limit).
  timeoutS?: string;
  // When true the pane is read-only: keystrokes are swallowed locally and
  // never reach the bridge (used for `disabled` input mode and for
  // stop-on-exit panes after the bound action ends).
  readOnly?: boolean;
  // Line gate for bound terminals (allowlist mode): receives the completed
  // line (without the trailing newline) when the user presses Enter.
  // Return an error message to block the line (rendered in red), null to
  // allow it through. Character echo still works; only the submit is gated.
  validateInput?: (line: string) => string | null;
  // Fired when the bridge reports process exit (used for stop-on-exit panes
  // to flip into the locked "terminal stopped" state).
  onExit?: (code: number) => void;
  // Fired with each validated input line (without the trailing newline)
  // when the user presses Enter. Bound terminal panes use it to relay the
  // line to the running action's console (POST …/actions/:id/stdin) in
  // addition to the PTY stdin below. Lines blocked by validateInput never
  // reach here.
  onLine?: (line: string) => void;
}

// TerminalHandle exposes imperative actions the host page can wire to
// toolbar buttons. The "Reconnect" entry point is what breaks the user
// out of the exponential-backoff wait — when the WS has dropped and
// auto-reconnect has scheduled a retry in N seconds, an explicit
// Reconnect click cancels the pending timer, resets the backoff curve,
// and dials immediately.
export interface TerminalHandle {
  reconnect: () => void;
  // sendLine submits one input line exactly as if the operator typed it
  // into the xterm and pressed Enter: local echo (workflow bridges),
  // raw stdin bytes on the WS, validateInput gating, then onLine. Used
  // by the "input box" input method, whose xterm is readOnly.
  sendLine: (line: string) => void;
}

const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ instanceId, onStateChange, onTermRef, onTitleChange, terminalId, endpoint, timeoutS, readOnly, validateInput, onExit, onLine }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Holds the live `forceReconnect` closure for the current `instanceId`.
  // Updated inside the WS-lifecycle effect and surfaced to the parent via
  // `useImperativeHandle` so the toolbar's Reconnect button can dial now
  // instead of waiting on the exponential backoff timer.
  const reconnectRef = useRef<(() => void) | null>(null);
  // Holds the live `sendLine` pipeline (set inside the mount effect where
  // sendStdin/echo/validate live). Same pattern as reconnectRef.
  const sendLineRef = useRef<((line: string) => void) | null>(null);
  const [state, setStateRaw] = useState<ConnState>('connecting');
  const [errMsg, setErrMsg] = useState('');
  const onTitleChangeRef = useRef(onTitleChange);
  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  const validateRef = useRef(validateInput);
  useEffect(() => {
    validateRef.current = validateInput;
  }, [validateInput]);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);
  // Which bridge the xterm is speaking to. The mount effect below only
  // re-runs per instanceId, so onData reads the live value through this
  // ref (same pattern as readOnlyRef) to decide the local echo.
  const endpointRef = useRef(endpoint);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);

  // Bridge the imperative `reconnect()` to the parent's ref. We resolve it
  // lazily (no static dependency array) so the parent always picks up the
  // newest closure written by the WS effect — including after the effect
  // re-runs for a new `instanceId`.
  useImperativeHandle(ref, () => ({
    reconnect: () => reconnectRef.current?.(),
    sendLine: (line: string) => sendLineRef.current?.(line),
  }));

  const setState = (s: ConnState, msg?: string) => {
    setStateRaw(s);
    setErrMsg(msg || '');
    onStateChange?.(s, msg);
  };

  const base64ToBytes = (b64: string): Uint8Array => {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      return new Uint8Array(0);
    }
  };

  const bytesToBase64 = (bytes: Uint8Array): string => {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };

  // Bootleg-friendly: many dev environments need a moment after the
  // layout settles before xterm can measure the container. Re-fit on a
  // short timeout in addition to the ResizeObserver.
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 4,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: true,
      allowProposedApi: true,
      theme: terminalThemeFor(useThemeStore.getState().active()),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    onTermRef?.(term);

    term.writeln('\x1b[90m● connecting to instance…\x1b[0m');

    const sendStdin = (data: string) => {
      const bytes = new TextEncoder().encode(data);
      wsRef.current?.send(JSON.stringify({ type: 'stdin', data: bytesToBase64(bytes) }));
    };

    const sendResize = (cols: number, rows: number) => {
      wsRef.current?.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    // Gated input: read-only panes swallow everything. Otherwise the PTY
    // always receives the chunk verbatim while every COMPLETED line is
    // offered to onLine (the action-console relay, which no-ops unless the
    // pane is bound + running). Keystroke gating is a guardrail — the
    // server-side stdin policy is the enforced boundary (an unbound pane
    // is the same shell anyway) — but the relay must see every line,
    // including lines inside a paste chunk ("cmd1\rcmd2\r"), so the
    // server can allow/deny each one.
    //
    // Workflow consoles (/workflow) are piped, not PTYs: the far end never
    // echoes, so the pane echoes locally — printable chars verbatim,
    // Enter as a newline, backspace as an erase — exactly where the user
    // typed them, ahead of the server's response. Side shells and startup
    // consoles keep their existing behaviour (PTY echo / blind attach).
    const lineBuf = { current: '' };
    const echoWorkflow = (d: string) => {
      const term = termRef.current;
      if (!term || endpointRef.current !== 'workflow') return;
      for (let i = 0; i < d.length; i++) {
        const ch = d[i];
        if (ch === '\r' || ch === '\n') term.write('\r\n');
        else if (ch === '\u007f' || ch === '\b') term.write('\b \b');
        else if (ch >= ' ' || ch === '\t') term.write(ch);
      }
    };
    const dataSub = term.onData((d) => {
      if (readOnlyRef.current) return;
      // Control sequences (arrows, etc.) ride through untouched and never
      // touch the line buffer, the relay — or the local echo.
      if (d.charCodeAt(0) === 27) {
        sendStdin(d);
        return;
      }
      const validate = validateRef.current;
      const lines: string[] = [];
      let cur = lineBuf.current;
      for (let i = 0; i < d.length; i++) {
        const ch = d[i];
        if (ch === '\r' || ch === '\n') {
          lines.push(cur);
          cur = '';
        } else if (ch === '\u007f' || ch === '\b') {
          cur = cur.slice(0, -1);
        } else if (ch >= ' ' || ch === '\t') {
          cur += ch;
        }
      }
      lineBuf.current = cur;
      echoWorkflow(d);
      sendStdin(d);
      for (const ln of lines) {
        if (ln.trim() === '') continue;
        if (validate) {
          const reason = validate(ln);
          if (reason) {
            term.write(`\r\n\x1b[31m● blocked: ${reason}\x1b[0m\r\n`);
            continue;
          }
        }
        try { onLineRef.current?.(ln); } catch { /* noop */ }
      }
    });
    const resizeSub = term.onResize(({ cols, rows }) => sendResize(cols, rows));
    // Programmatic twin of typing a line + Enter (powers the "input box"
    // input method): same echo, same raw stdin bytes, same validation,
    // same onLine relay — including the rule that blocked lines still
    // reach the PTY but never the relay.
    sendLineRef.current = (line: string) => {
      const t = termRef.current;
      if (!t) return;
      if (line.trim() === '') return;
      const d = `${line}\r`;
      echoWorkflow(d);
      sendStdin(d);
      const validate = validateRef.current;
      if (validate) {
        const reason = validate(line);
        if (reason) {
          t.write(`\r\n\x1b[31m● blocked: ${reason}\x1b[0m\r\n`);
          return;
        }
      }
      try { onLineRef.current?.(line); } catch { /* noop */ }
    };
    const titleSub = term.onTitleChange((t) => onTitleChangeRef.current?.(t));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore — fit sometimes throws if the container is briefly hidden
      }
    });
    ro.observe(containerRef.current);

    // Mobile: tapping the xterm must synchronously focus the hidden
    // textarea so the OS virtual keyboard appears (xterm's own click
    // handler is async in some versions and breaks the user-gesture
    // requirement on iOS/Android). Only real TAPS steal focus: touchstart
    // just records the position (passive, never blocks page scroll);
    // touchend focuses only when the finger barely moved, so swipes that
    // start inside the terminal still scroll the page instead of popping
    // the keyboard.
    const el = containerRef.current;
    const focusTerm = () => {
      try { term.focus(); } catch { /* noop */ }
    };
    const touchPos = { x: 0, y: 0 };
    let touchActive = false;
    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) {
        touchPos.x = t.clientX;
        touchPos.y = t.clientY;
        touchActive = true;
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchActive) return;
      touchActive = false;
      const t = e.changedTouches[0];
      if (t && Math.hypot(t.clientX - touchPos.x, t.clientY - touchPos.y) > 10) return;
      // Prevent the synthetic mouse event that would blur the textarea again
      if (e.cancelable) e.preventDefault();
      focusTerm();
    };
    const handleTouchCancel = () => { touchActive = false; };
    el.addEventListener('click', focusTerm);
    el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    el.addEventListener('touchend', handleTouchEnd as EventListener, { passive: false });
    el.addEventListener('touchcancel', handleTouchCancel);

    // Initial size to the bridge so the edge spawns at the right geometry.
    // Tracked so unmount within the window doesn't touch a disposed term.
    const resizeTimer = window.setTimeout(() => {
      try {
        if (termRef.current) sendResize(term.cols, term.rows);
      } catch { /* noop */ }
    }, 100);

    return () => {
      window.clearTimeout(resizeTimer);
      el.removeEventListener('click', focusTerm);
      el.removeEventListener('touchstart', handleTouchStart as EventListener);
      el.removeEventListener('touchend', handleTouchEnd as EventListener);
      el.removeEventListener('touchcancel', handleTouchCancel);
      dataSub.dispose();
      resizeSub.dispose();
      titleSub?.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      sendLineRef.current = null;
      onTermRef?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // WebSocket lifecycle: connect once the term is mounted; auto-reconnect
  // with exponential backoff when the bridge drops unexpectedly.
  //
  // The reconnect machinery is intentionally resilient to two failure shapes
  // that previously left operators staring at a frozen "reconnecting in Ns"
  // banner forever:
  //
  //   1. The WS handshake succeeds (so `lastOpenAt` is recorded) but the
  //      edge never sends `ready` — e.g. the container is gone, the node
  //      is unreachable upstream, or the dial to ksedge fails AFTER the
  //      panel upgraded the browser side. On that path the bridge emits an
  //      `error` frame then closes; without an explicit escape the page
  //      loops `connecting → error → reconnecting (backoff 1s..8s)`
  //      indefinitely with no user-facing lever.
  //   2. The pending `setTimeout(open, backoff)` was never tracked, so a
  //      long backoff couldn't be cancelled — the operator's only option
  //      was to reload the whole page.
  //
  // Fixes: track the pending timer so it can be cancelled on unmount AND on
  // an explicit Reconnect click; reset `attempt` to 0 the moment we get a
  // real `ready` (not just on a "long-lived close"); flip the status to
  // `connecting` in `onopen` so the banner reflects an in-flight attempt
  // rather than the stale `reconnecting in Ns`; expose an imperative
  // `reconnect()` so the toolbar's Reconnect button can force an immediate
  // dial.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Track when the WS last completed its handshake so we know, on the
    // matching close, whether it stayed up for a meaningful time or was
    // immediately refused (e.g. dev vite proxy missing ws:true, or a
    // network 4xx upgrade rejection). Without this gate every refresh of
    // the terminal page loops forever at `reconnecting in 1s`: onopen
    // bumps `lastOpenAt`, but close fires milliseconds later, attempt
    // resets to 0, then bumps back to 1, backoff = 500·2^1 = 1000ms.
    let lastOpenAt = 0;

    const cancelTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const teardownWs = () => {
      const ws = wsRef.current;
      if (ws) {
        // Detach handlers so the synthetic close we trigger below doesn't
        // re-enter `onclose` and schedule ANOTHER backoff on top of the
        // one we're already setting up.
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try { ws.close(); } catch { /* noop */ }
        }
      }
      wsRef.current = null;
      lastOpenAt = 0;
    };

    const open = () => {
      if (cancelled) return;
      cancelTimer();
      teardownWs();
      setState('connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrlFor(instanceId, terminalId, timeoutS, endpoint));
      } catch (e: any) {
        setState('error', e?.message || 'Failed to open WebSocket');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        lastOpenAt = Date.now();
        // The handshake completed; we're now waiting on the edge to spawn
        // the shell and send `ready`. Surface that as `connecting` so the
        // banner stops reading the stale "reconnecting in Ns" from the
        // previous close.
        setState('connecting');
      };      ws.onmessage = (ev) => {
        const term = termRef.current;
        if (!term || typeof ev.data !== 'string') return;
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'ready': {
            // A real, usable session just attached — reset the backoff
            // curve so the NEXT drop starts at the short interval instead
            // of resuming wherever the previous failure had climbed to.
            attempt = 0;
            setState('connected');
            // Reset scrollback so the freshly-attached shell starts blank.
            // Action-bound panes keep their scrollback: the parent streams
            // the running action's log lines into the same buffer, and a
            // reset here would wipe the matched-action history on every
            // reconnect. Workflow panes DO reset: the /workflow bridge
            // replays the transcript history itself on every (re)connect,
            // so keeping scrollback would duplicate it.
            if ((!terminalId || String(terminalId).trim() === '') || endpoint === 'workflow') {
              term.reset();
            }
            const cols = Number(msg.cols) || term.cols;
            const rows = Number(msg.rows) || term.rows;
            if (cols && rows && (cols !== term.cols || rows !== term.rows)) {
              try { term.resize(cols, rows); } catch { /* noop */ }
            }
            break;
          }
          case 'stdout':
          case 'stderr': {
            if (typeof msg.data === 'string') {
              const bytes = base64ToBytes(msg.data);
              if (bytes.length) term.write(bytes);
            }
            break;
          }
          case 'exit': {
            const code = Number(msg.code);
            setState('closed');
            if (Number.isFinite(code)) {
              term.write(`\r\n\x1b[90m● process exited with code ${code}\x1b[0m\r\n`);
            } else {
              term.write(`\r\n\x1b[90m● session closed\x1b[0m`);
            }
            try { onExitRef.current?.(Number.isFinite(code) ? code : -1); } catch { /* noop */ }
            break;
          }
          case 'error': {
            setState('error', msg.message || 'Unknown error');
            term.write(`\r\n\x1b[31m● ${msg.message || 'error'}\x1b[0m\r\n`);
            break;
          }
          default:
            break;
        }
      };

      ws.onerror = () => {
        setState('error', 'WebSocket connection failed');
      };

      ws.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        // If the connection lived longer than a few seconds before
        // dropping, treat the drop as a normal failure and reset the
        // backoff — a healthy bridge that *happened* to close should
        // reconnect quickly on the next try. An instant close (lastOpenAt
        // is 0, or within the last 3s) means the WS was refused before
        // it ever became useful; keep the escalating backoff so the
        // user sees "reconnecting in 2s, 4s, 8s" instead of being stuck
        // at 1s.
        if (lastOpenAt && Date.now() - lastOpenAt > 3000) {
          attempt = 0;
        }
        attempt += 1;
        const backoff = Math.min(8000, 500 * Math.pow(2, attempt));
        setState('reconnecting', `reconnecting in ${Math.round(backoff / 1000)}s`);
        termRef.current?.write(`\r\n\x1b[33m● connection dropped — reconnecting in ${Math.round(backoff / 1000)}s\x1b[0m\r\n`);
        cancelTimer();
        timer = setTimeout(open, backoff);
        lastOpenAt = 0;
      };
    };

    // Force an immediate reconnect: cancel any pending backoff timer,
    // reset the curve, and dial now. Wired to the toolbar Reconnect
    // button on the parent so an operator isn't trapped waiting for the
    // exponential timer when the edge legitimately went away and came
    // back (or when they just want to nudge the bridge).
    const forceReconnect = () => {
      attempt = 0;
      open();
    };

    // Surface `reconnect` to the parent via the forwarded ref. Stored in
    // a ref so it always points at the freshest closure (the effect re-
    // runs if `instanceId`/`terminalId`/`timeoutS` change, replacing
    // `open`/`forceReconnect`).
    reconnectRef.current = forceReconnect;

    open();
    return () => {
      cancelled = true;
      cancelTimer();
      teardownWs();
      reconnectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, terminalId, timeoutS, endpoint]);

  // Re-fit when the container resizes externally (e.g. layout shift).
  useEffect(() => {
    const id = window.setInterval(() => {
      try { fitRef.current?.fit(); } catch { /**/ }
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-[24rem] sm:h-[26rem] md:h-[28rem] rounded-lg overflow-hidden"
    />
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;
