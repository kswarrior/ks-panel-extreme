import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useThemeStore } from '@/shared/stores/themeStore';
import { DEFAULT_THEME } from '@/theme/defaults';
import type { Theme } from '@/features/themes/types/theme';
import { isHexColor, rgbaAt } from '@/theme/colorUtils';

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

function wsUrlFor(instanceId: number): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/instances/${instanceId}/terminal`;
}

// terminalThemeFor derives the xterm palette from the ACTIVE theme so the
// terminal follows the Theme Studio like every other surface. Tokens that
// are still at their default (or unparseable) fall back to the stock
// VS-Code-ish palette, so the Default theme keeps today's look exactly.
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
  const customized = (v: unknown, d: unknown): string | null =>
    isHexColor(v) && v !== d ? v : null;

  return {
    // Translucent card fills render fine on canvas — the page background
    // behind the terminal container shows through.
    background: cardBg && cardBg !== D.card.background ? cardBg : STOCK_TERM.background,
    foreground: isHexColor(theme.card?.text_color) ? theme.card.text_color : STOCK_TERM.foreground,
    cursor: customized(theme.accent?.primary, D.accent.primary) || STOCK_TERM.cursor,
    cursorAccent: cardBg && cardBg !== D.card.background ? cardBg : STOCK_TERM.background,
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
}

// TerminalHandle exposes imperative actions the host page can wire to
// toolbar buttons. The "Reconnect" entry point is what breaks the user
// out of the exponential-backoff wait — when the WS has dropped and
// auto-reconnect has scheduled a retry in N seconds, an explicit
// Reconnect click cancels the pending timer, resets the backoff curve,
// and dials immediately.
export interface TerminalHandle {
  reconnect: () => void;
}

const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ instanceId, onStateChange, onTermRef }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Holds the live `forceReconnect` closure for the current `instanceId`.
  // Updated inside the WS-lifecycle effect and surfaced to the parent via
  // `useImperativeHandle` so the toolbar's Reconnect button can dial now
  // instead of waiting on the exponential backoff timer.
  const reconnectRef = useRef<(() => void) | null>(null);
  const [state, setStateRaw] = useState<ConnState>('connecting');
  const [errMsg, setErrMsg] = useState('');

  // Bridge the imperative `reconnect()` to the parent's ref. We resolve it
  // lazily (no static dependency array) so the parent always picks up the
  // newest closure written by the WS effect — including after the effect
  // re-runs for a new `instanceId`.
  useImperativeHandle(ref, () => ({
    reconnect: () => reconnectRef.current?.(),
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

    const dataSub = term.onData((d) => sendStdin(d));
    const resizeSub = term.onResize(({ cols, rows }) => sendResize(cols, rows));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore — fit sometimes throws if the container is briefly hidden
      }
    });
    ro.observe(containerRef.current);

    // Initial size to the bridge so the edge spawns at the right geometry.
    setTimeout(() => sendResize(term.cols, term.rows), 100);

    return () => {
      dataSub.dispose();
      resizeSub.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
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
        ws = new WebSocket(wsUrlFor(instanceId));
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
      };

      ws.onmessage = (ev) => {
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
            term.reset();
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
    // runs if `instanceId` changes, replacing `open`/`forceReconnect`).
    reconnectRef.current = forceReconnect;

    open();
    return () => {
      cancelled = true;
      cancelTimer();
      teardownWs();
      reconnectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

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
