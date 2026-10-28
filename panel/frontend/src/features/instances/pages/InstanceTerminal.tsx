import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { buildPageWsUrl } from '@/shared/lib/customPageSdk';

type PaneStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface TerminalPaneHandle {
  clear: () => void;
  copy: () => void;
  download: () => void;
  reconnect: () => void;
  fit: () => void;
}

interface PaneProps {
  instanceId: number;
  sessionKey: string;
  active: boolean;
  fontSize: number;
  onStatus: (status: PaneStatus) => void;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function copyText(text: string) {
  if (!text) {
    window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: 'Nothing selected', type: 'info' } }));
    return;
  }
  const done = () => window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: 'Copied to clipboard', type: 'success' } }));
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => {
      window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: 'Copy failed', type: 'error' } }));
    });
    return;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch {
    window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: 'Copy failed', type: 'error' } }));
  }
}

const STATUS_META: Record<PaneStatus, { label: string; color: string; dot: string }> = {
  connecting: { label: 'Connecting', color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  connected: { label: 'Connected', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  reconnecting: { label: 'Reconnecting', color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  closed: { label: 'Closed', color: 'text-gray-400', dot: 'bg-gray-500' },
  error: { label: 'Offline', color: 'text-red-300', dot: 'bg-red-400' },
};

const TerminalPane = forwardRef<TerminalPaneHandle, PaneProps>(({ instanceId, sessionKey, active, fontSize, onStatus }, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const disposedRef = useRef(false);
  const endedRef = useRef(false);
  const manualRef = useRef(false);
  const statusRef = useRef<PaneStatus>('connecting');
  const statusCbRef = useRef(onStatus);
  statusCbRef.current = onStatus;

  const setStatus = useCallback((status: PaneStatus) => {
    statusRef.current = status;
    statusCbRef.current(status);
  }, []);

  const sendResize = useCallback(() => {
    const ws = wsRef.current;
    const term = termRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !term) return;
    try {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    } catch {
      /* ignore */
    }
  }, []);

  const fit = useCallback(() => {
    const host = hostRef.current;
    const fitAddon = fitRef.current;
    if (!host || !fitAddon || host.clientWidth <= 0 || host.clientHeight <= 0) return;
    try {
      fitAddon.fit();
      sendResize();
    } catch {
      /* xterm can throw while the pane is hidden */
    }
  }, [sendResize]);

  const scheduleReconnect = useCallback(() => {
    if (disposedRef.current || endedRef.current || manualRef.current) return;
    attemptRef.current += 1;
    const delay = Math.min(8000, 500 * 2 ** attemptRef.current);
    setStatus('reconnecting');
    termRef.current?.writeln(`\r\n\x1b[33m• connection lost — retrying in ${Math.round(delay / 1000)}s\x1b[0m`);
    if (retryRef.current) window.clearTimeout(retryRef.current);
    retryRef.current = window.setTimeout(() => {
      if (!disposedRef.current) connectRef.current();
    }, delay);
  }, [setStatus]);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term || disposedRef.current) return;
    endedRef.current = false;
    manualRef.current = false;
    if (retryRef.current) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    setStatus('connecting');
    let ws: WebSocket;
    try {
      const url = buildPageWsUrl(window.location.host, window.location.protocol, instanceId, 'terminal', {
        terminal: sessionKey,
      });
      ws = new WebSocket(url);
    } catch {
      setStatus('error');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      attemptRef.current = 0;
      setStatus('connecting');
      term.writeln('\x1b[90m• attached to instance console\x1b[0m');
      fit();
    };
    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        attemptRef.current = 0;
        setStatus('connected');
        fit();
      } else if (msg.type === 'stdout' || msg.type === 'stderr') {
        if (typeof msg.data === 'string' && msg.data) {
          try {
            term.write(b64ToBytes(msg.data));
          } catch {
            /* ignore malformed frame */
          }
        }
      } else if (msg.type === 'exit') {
        endedRef.current = true;
        setStatus('closed');
        const code = Number(msg.code);
        term.writeln(`\r\n\x1b[90m• process exited with code ${Number.isFinite(code) ? code : '?'}\x1b[0m`);
        wsRef.current = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      } else if (msg.type === 'error') {
        setStatus('error');
        term.writeln(`\r\n\x1b[31m• ${String(msg.message || 'terminal error')}\x1b[0m`);
        wsRef.current = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        scheduleReconnect();
      }
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (!endedRef.current) scheduleReconnect();
    };
  }, [instanceId, sessionKey, setStatus, fit, scheduleReconnect]);
  connectRef.current = connect;

  useEffect(() => {
    disposedRef.current = false;
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: false,
      theme: {
        background: '#090b0f',
        foreground: '#d7dde7',
        cursor: '#7dd3fc',
        selectionBackground: 'rgba(56, 189, 248, 0.32)',
        black: '#1e2530',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e7eb',
        brightBlack: '#64748b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    termRef.current = term;
    fitRef.current = fitAddon;
    term.writeln('\x1b[38;5;39m● Instance terminal\x1b[0m \x1b[90m— starting console…\x1b[0m');
    const dataSub = term.onData((data) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: 'stdin', data: btoa(String.fromCharCode(...new TextEncoder().encode(data))) }));
      } catch {
        /* ignore */
      }
    });
    const resizeObs = new ResizeObserver(() => fit());
    resizeObs.observe(host);
    const id = window.setTimeout(() => {
      fit();
      connectRef.current();
    }, 40);
    return () => {
      disposedRef.current = true;
      window.clearTimeout(id);
      if (retryRef.current) window.clearTimeout(retryRef.current);
      retryRef.current = null;
      resizeObs.disconnect();
      dataSub.dispose();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fit();
  }, [fontSize, fit]);

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      fit();
      termRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [active, fit]);

  useImperativeHandle(ref, () => ({
    clear: () => termRef.current?.clear(),
    copy: () => copyText(termRef.current?.getSelection() || ''),
    download: () => {
      const term = termRef.current;
      if (!term) return;
      const buf = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `terminal-${sessionKey}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    reconnect: () => {
      if (retryRef.current) window.clearTimeout(retryRef.current);
      retryRef.current = null;
      attemptRef.current = 0;
      termRef.current?.clear();
      termRef.current?.writeln('\x1b[90m• reconnecting…\x1b[0m');
      connectRef.current();
    },
    fit,
  }), [sessionKey, fit]);

  return (
    <div
      ref={hostRef}
      className={`absolute inset-0 p-2 ${active ? 'block' : 'hidden'}`}
      style={{ background: '#090b0f' }}
    />
  );
});
TerminalPane.displayName = 'TerminalPane';

interface Tab {
  id: number;
  key: string;
}

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">{path}</svg>
);

const InstanceTerminal: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, key: 'shell-1' }]);
  const [activeId, setActiveId] = useState(1);
  const [fontSize, setFontSize] = useState(13);
  const [statuses, setStatuses] = useState<Record<number, PaneStatus>>({ 1: 'connecting' });
  const nextId = useRef(2);
  const handles = useRef<Record<number, TerminalPaneHandle | null>>({});
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeHandle = handles.current[active?.id ?? 0];

  const addTab = () => {
    const id = nextId.current++;
    const tab = { id, key: `shell-${id}` };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setStatuses((prev) => ({ ...prev, [id]: 'connecting' }));
  };

  const closeTab = (id: number) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    delete handles.current[id];
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id);
  };

  const status = statuses[active?.id ?? 0] ?? 'connecting';
  const meta = STATUS_META[status];

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40';

  return (
    <div className="ks-card ks-form-card rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab, i) => {
            const st = statuses[tab.id] ?? 'connecting';
            const sm = STATUS_META[st];
            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  tab.id === active?.id
                    ? 'border-sky-400/40 bg-sky-400/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.07]'
                }`}
              >
                <button type="button" onClick={() => setActiveId(tab.id)} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
                  <span>Shell {i + 1}</span>
                </button>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => closeTab(tab.id)}
                    className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-white"
                    aria-label={`Close shell ${i + 1}`}
                  >
                    {icon(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>)}
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={addTab} className={btn} aria-label="Open another shell">
            {icon(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>)}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`mr-1 inline-flex items-center gap-1.5 text-[11px] ${meta.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <button type="button" className={btn} onClick={() => activeHandle?.copy()} title="Copy selection">
            {icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)}
            <span className="hidden sm:inline">Copy</span>
          </button>
          <button type="button" className={btn} onClick={() => activeHandle?.download()} title="Download output">
            {icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
            <span className="hidden sm:inline">Download</span>
          </button>
          <button type="button" className={btn} onClick={() => activeHandle?.clear()} title="Clear terminal">
            {icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>)}
          </button>
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.04]">
            <button type="button" className="px-2 py-1.5 text-xs text-gray-400 hover:text-white" onClick={() => setFontSize((n) => Math.max(9, n - 1))} aria-label="Smaller font">A−</button>
            <span className="w-7 text-center text-[11px] tabular-nums text-gray-400">{fontSize}</span>
            <button type="button" className="px-2 py-1.5 text-xs text-gray-400 hover:text-white" onClick={() => setFontSize((n) => Math.min(24, n + 1))} aria-label="Larger font">A+</button>
          </div>
          <button type="button" className={btn} onClick={() => activeHandle?.reconnect()} title="Reconnect">
            {icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)}
            <span className="hidden md:inline">Reconnect</span>
          </button>
        </div>
      </div>
      <div className="relative h-[58vh] min-h-[380px] w-full">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            ref={(h) => { handles.current[tab.id] = h; }}
            instanceId={instanceId}
            sessionKey={tab.key}
            active={tab.id === active?.id}
            fontSize={fontSize}
            onStatus={(st) => setStatuses((prev) => (prev[tab.id] === st ? prev : { ...prev, [tab.id]: st }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[11px] text-gray-500">
        <span>Side shell inside the instance · input is sent straight to the process.</span>
        <span className="tabular-nums">cols × rows auto-fit</span>
      </div>
    </div>
  );
};

export default InstanceTerminal;
