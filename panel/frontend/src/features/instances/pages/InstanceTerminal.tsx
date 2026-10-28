import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { buildPageWsUrl } from '@/shared/lib/customPageSdk';

type PaneStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
type ShortcutAction =
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'find'
  | 'font-in'
  | 'font-out'
  | 'font-reset'
  | 'maximize';

export interface FindResult {
  index: number;
  total: number;
}

export type SpecialKey =
  | 'esc'
  | 'tab'
  | 'interrupt'
  | 'eof'
  | 'suspend'
  | 'clear'
  | 'reverse'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'home'
  | 'end'
  | 'pgup'
  | 'pgdn';

export interface TerminalPaneHandle {
  clear: () => void;
  copySelection: () => void;
  copyAll: () => void;
  paste: () => void;
  download: () => void;
  reconnect: () => void;
  fit: () => void;
  focus: () => void;
  send: (data: string) => void;
  sendSpecial: (key: SpecialKey) => void;
  selectAll: () => void;
  clearSelection: () => void;
  find: (query: string, direction: 'next' | 'prev') => FindResult;
}

interface PaneProps {
  instanceId: number;
  sessionKey: string;
  active: boolean;
  fontSize: number;
  onStatus: (status: PaneStatus) => void;
  onShortcut: (action: ShortcutAction) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message, type } }));
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

function copyText(text: string, quiet = false) {
  if (!text) {
    if (!quiet) toast('Nothing selected', 'info');
    return;
  }
  const done = () => toast('Copied to clipboard', 'success');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => toast('Copy failed', 'error'));
    return;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch {
    toast('Copy failed', 'error');
  }
}

async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    toast('Clipboard access is blocked — allow clipboard permission for this site', 'error');
    return '';
  }
}

function bufferText(term: Terminal): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    lines.push(line?.translateToString(true) ?? '');
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

const STATUS_META: Record<PaneStatus, { label: string; color: string; dot: string }> = {
  connecting: { label: 'Connecting', color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  connected: { label: 'Connected', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  reconnecting: { label: 'Reconnecting', color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  closed: { label: 'Closed', color: 'text-gray-400', dot: 'bg-gray-500' },
  error: { label: 'Offline', color: 'text-red-300', dot: 'bg-red-400' },
};

const TerminalPane = forwardRef<TerminalPaneHandle, PaneProps>(
  ({ instanceId, sessionKey, active, fontSize, onStatus, onShortcut, onContextMenu }, ref) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef<number | null>(null);
    const attemptRef = useRef(0);
    const disposedRef = useRef(false);
    const endedRef = useRef(false);
    const statusCbRef = useRef(onStatus);
    const shortcutRef = useRef(onShortcut);
    const searchRef = useRef<{ query: string; hits: Array<{ line: number; col: number }>; idx: number }>({
      query: '',
      hits: [],
      idx: -1,
    });
    statusCbRef.current = onStatus;
    shortcutRef.current = onShortcut;

    const setStatus = useCallback((status: PaneStatus) => {
      statusCbRef.current(status);
    }, []);

    const sendRaw = useCallback((data: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !data) return;
      try {
        ws.send(JSON.stringify({ type: 'stdin', data: bytesToB64(new TextEncoder().encode(data)) }));
      } catch {
        /* ignore */
      }
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

    const paste = useCallback(async () => {
      const term = termRef.current;
      if (!term) return;
      const text = await readClipboard();
      if (text) {
        term.paste(text);
        term.focus();
      }
    }, []);

    const copySelection = useCallback(() => {
      copyText(termRef.current?.getSelection() || '');
    }, []);

    const copyAll = useCallback(() => {
      const term = termRef.current;
      if (term) copyText(bufferText(term));
    }, []);

    const download = useCallback(() => {
      const term = termRef.current;
      if (!term) return;
      const blob = new Blob([bufferText(term)], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `terminal-${sessionKey}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, [sessionKey]);

    const find = useCallback((query: string, direction: 'next' | 'prev'): FindResult => {
      const term = termRef.current;
      const needle = query.trim();
      if (!term || !needle) {
        term?.clearSelection();
        searchRef.current = { query: '', hits: [], idx: -1 };
        return { index: 0, total: 0 };
      }
      const state = searchRef.current;
      if (state.query !== needle) {
        state.query = needle;
        state.hits = [];
        state.idx = -1;
        const buf = term.buffer.active;
        const lowerNeedle = needle.toLowerCase();
        for (let lineNo = 0; lineNo < buf.length; lineNo++) {
          const line = buf.getLine(lineNo);
          if (!line) continue;
          const text = line.translateToString(true);
          const lower = text.toLowerCase();
          let from = 0;
          for (;;) {
            const col = lower.indexOf(lowerNeedle, from);
            if (col < 0) break;
            state.hits.push({ line: lineNo, col });
            from = col + Math.max(1, lowerNeedle.length);
          }
        }
      }
      const total = state.hits.length;
      if (total === 0) {
        term.clearSelection();
        return { index: 0, total: 0 };
      }
      state.idx =
        direction === 'prev'
          ? state.idx <= 0
            ? total - 1
            : state.idx - 1
          : (state.idx + 1) % total;
      const hit = state.hits[state.idx];
      term.scrollToLine(Math.max(0, hit.line - Math.floor(term.rows / 3)));
      term.select(hit.col, hit.line, needle.length);
      return { index: state.idx + 1, total };
    }, []);

    const scheduleReconnect = useCallback(() => {
      if (disposedRef.current || endedRef.current) return;
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
        fontWeight: '400',
        fontWeightBold: '700',
        lineHeight: 1.25,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: 'block',
        cursorInactiveStyle: 'outline',
        scrollback: 20000,
        scrollOnUserInput: true,
        drawBoldTextInBrightColors: true,
        allowProposedApi: true,
        convertEol: false,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
        minimumContrastRatio: 1,
        rescaleOverlappingGlyphs: true,
        theme: {
          background: '#090b0f',
          foreground: '#d7dde7',
          cursor: '#7dd3fc',
          cursorAccent: '#090b0f',
          selectionBackground: 'rgba(56, 189, 248, 0.32)',
          selectionForeground: '#ffffff',
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

      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true;
        const ctrl = ev.ctrlKey || ev.metaKey;
        const key = ev.key.toLowerCase();
        if (ctrl && ev.shiftKey) {
          if (key === 'c') {
            const sel = term.getSelection();
            if (sel) copyText(sel, true);
            ev.preventDefault();
            return false;
          }
          if (key === 'v') {
            ev.preventDefault();
            void paste();
            return false;
          }
          if (key === 'a') {
            term.selectAll();
            ev.preventDefault();
            return false;
          }
          if (key === 'f') {
            ev.preventDefault();
            shortcutRef.current('find');
            return false;
          }
          if (key === 't') {
            ev.preventDefault();
            shortcutRef.current('new-tab');
            return false;
          }
          if (key === 'w') {
            ev.preventDefault();
            shortcutRef.current('close-tab');
            return false;
          }
          if (key === 'k') {
            term.clear();
            ev.preventDefault();
            return false;
          }
          if (key === 'm' || ev.key === 'Enter') {
            ev.preventDefault();
            shortcutRef.current('maximize');
            return false;
          }
          if (key === '=' || key === '+') {
            ev.preventDefault();
            shortcutRef.current('font-in');
            return false;
          }
          if (key === '-' || key === '_') {
            ev.preventDefault();
            shortcutRef.current('font-out');
            return false;
          }
          if (key === '0') {
            ev.preventDefault();
            shortcutRef.current('font-reset');
            return false;
          }
        }
        if (ev.ctrlKey && ev.key === 'Tab') {
          ev.preventDefault();
          shortcutRef.current(ev.shiftKey ? 'prev-tab' : 'next-tab');
          return false;
        }
        if (ev.shiftKey && ev.key === 'Insert') {
          ev.preventDefault();
          void paste();
          return false;
        }
        if (ev.ctrlKey && ev.key === 'Insert') {
          const sel = term.getSelection();
          if (sel) copyText(sel, true);
          ev.preventDefault();
          return false;
        }
        if (ev.metaKey && !ev.ctrlKey && key === 'c' && term.hasSelection()) {
          copyText(term.getSelection(), true);
          ev.preventDefault();
          return false;
        }
        return true;
      });

      const dataSub = term.onData((data) => sendRaw(data));
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
      // fontSize is applied by the effect below; the socket callbacks stay
      // stable through refs so this terminal is created exactly once.
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

    useImperativeHandle(
      ref,
      () => ({
        clear: () => termRef.current?.clear(),
        copySelection,
        copyAll,
        paste: () => void paste(),
        download,
        reconnect: () => {
          if (retryRef.current) window.clearTimeout(retryRef.current);
          retryRef.current = null;
          attemptRef.current = 0;
          termRef.current?.clear();
          termRef.current?.writeln('\x1b[90m• reconnecting…\x1b[0m');
          connectRef.current();
        },
        fit,
        focus: () => termRef.current?.focus(),
        send: (data: string) => sendRaw(data),
        sendSpecial: (key: SpecialKey) => {
          const term = termRef.current;
          if (!term) return;
          const app = term.modes.applicationCursorKeysMode;
          const seq: Record<SpecialKey, string> = {
            esc: '\x1b',
            tab: '\t',
            interrupt: '\x03',
            eof: '\x04',
            suspend: '\x1a',
            clear: '\x0c',
            reverse: '\x12',
            left: app ? '\x1bOD' : '\x1b[D',
            right: app ? '\x1bOC' : '\x1b[C',
            up: app ? '\x1bOA' : '\x1b[A',
            down: app ? '\x1bOB' : '\x1b[B',
            home: app ? '\x1bOH' : '\x1b[H',
            end: app ? '\x1bOF' : '\x1b[F',
            pgup: '\x1b[5~',
            pgdn: '\x1b[6~',
          };
          sendRaw(seq[key]);
        },
        selectAll: () => termRef.current?.selectAll(),
        clearSelection: () => termRef.current?.clearSelection(),
        find,
      }),
      [copySelection, copyAll, paste, download, fit, sendRaw, find],
    );

    return (
      <div
        ref={hostRef}
        onContextMenu={onContextMenu}
        className={`ks-terminal-wrap absolute inset-0 p-1.5 ${active ? 'block' : 'hidden'}`}
        style={{ background: '#090b0f' }}
      />
    );
  },
);
TerminalPane.displayName = 'TerminalPane';

interface Tab {
  id: number;
  key: string;
}

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
    {path}
  </svg>
);

const QUICK_KEYS: Array<{ label: string; key: SpecialKey; title: string }> = [
  { label: 'Esc', key: 'esc', title: 'Escape' },
  { label: 'Tab', key: 'tab', title: 'Tab' },
  { label: 'Ctrl+C', key: 'interrupt', title: 'Interrupt' },
  { label: 'Ctrl+D', key: 'eof', title: 'End of file' },
  { label: 'Ctrl+Z', key: 'suspend', title: 'Suspend' },
  { label: 'Ctrl+L', key: 'clear', title: 'Clear screen' },
  { label: 'Ctrl+R', key: 'reverse', title: 'Reverse search' },
  { label: '←', key: 'left', title: 'Arrow left' },
  { label: '↑', key: 'up', title: 'Arrow up' },
  { label: '↓', key: 'down', title: 'Arrow down' },
  { label: '→', key: 'right', title: 'Arrow right' },
  { label: 'Home', key: 'home', title: 'Home' },
  { label: 'End', key: 'end', title: 'End' },
  { label: 'PgUp', key: 'pgup', title: 'Page up' },
  { label: 'PgDn', key: 'pgdn', title: 'Page down' },
];

const MenuItem: React.FC<{ label: string; hint?: string; onClick: () => void }> = ({ label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-xs text-gray-200 transition hover:bg-white/10 hover:text-white"
  >
    <span>{label}</span>
    {hint && <span className="shrink-0 text-[10px] text-gray-500">{hint}</span>}
  </button>
);

const MenuSep: React.FC = () => <div className="my-1 h-px bg-white/10" />;

const InstanceTerminal: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, key: 'shell-1' }]);
  const [activeId, setActiveId] = useState(1);
  const [fontSize, setFontSize] = useState(13);
  const [statuses, setStatuses] = useState<Record<number, PaneStatus>>({ 1: 'connecting' });
  const [maximized, setMaximized] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findInfo, setFindInfo] = useState<FindResult>({ index: 0, total: 0 });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const nextId = useRef(2);
  const handles = useRef<Record<number, TerminalPaneHandle | null>>({});
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const handle = () => handles.current[active?.id ?? 0];
  const status = statuses[active?.id ?? 0] ?? 'connecting';
  const meta = STATUS_META[status];

  const addTab = useCallback(() => {
    const id = nextId.current++;
    const tab = { id, key: `shell-${id}` };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setStatuses((prev) => ({ ...prev, [id]: 'connecting' }));
    setFindOpen(false);
    setFindQuery('');
    setFindInfo({ index: 0, total: 0 });
  }, []);

  const closeTab = useCallback((id: number) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    delete handles.current[id];
    setTabs(remaining);
    setStatuses((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id);
    setFindInfo({ index: 0, total: 0 });
  }, [tabs, activeId]);

  const selectTab = (id: number) => {
    setActiveId(id);
    setFindInfo({ index: 0, total: 0 });
  };

  const runFind = (direction: 'next' | 'prev') => {
    const result = handle()?.find(findQuery, direction);
    if (result) setFindInfo(result);
  };

  const changeFind = (value: string) => {
    setFindQuery(value);
    const result = handle()?.find(value, 'next');
    setFindInfo(result ?? { index: 0, total: 0 });
  };

  const closeFind = () => {
    setFindOpen(false);
    setFindQuery('');
    setFindInfo({ index: 0, total: 0 });
    handle()?.clearSelection();
  };

  const onShortcut = (action: ShortcutAction) => {
    if (action === 'new-tab') addTab();
    else if (action === 'close-tab') closeTab(active?.id ?? 0);
    else if (action === 'next-tab' || action === 'prev-tab') {
      if (tabs.length < 2) return;
      const i = tabs.findIndex((t) => t.id === active?.id);
      const next = action === 'next-tab' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      selectTab(tabs[next].id);
    } else if (action === 'find') setFindOpen(true);
    else if (action === 'font-in') setFontSize((n) => Math.min(28, n + 1));
    else if (action === 'font-out') setFontSize((n) => Math.max(9, n - 1));
    else if (action === 'font-reset') setFontSize(13);
    else if (action === 'maximize') setMaximized((v) => !v);
  };

  useEffect(() => {
    if (!maximized) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [maximized]);

  const showMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const width = 232;
    const height = 390;
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  };

  const sendKey = (key: SpecialKey) => {
    const h = handle();
    h?.sendSpecial(key);
    h?.focus();
  };

  const button =
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40';

  return (
    <div
      className={
        maximized
          ? 'fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0b0d10]'
          : 'ks-card ks-form-card flex flex-col overflow-hidden rounded-xl'
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab, i) => {
            const st = statuses[tab.id] ?? 'connecting';
            const sm = STATUS_META[st];
            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition ${
                  tab.id === active?.id
                    ? 'border-sky-400/40 bg-sky-400/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.07]'
                }`}
              >
                <button type="button" onClick={() => selectTab(tab.id)} className="flex items-center gap-1.5">
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
          <button type="button" onClick={addTab} className={button} aria-label="Open a new shell" title="New shell (Ctrl+Shift+T)">
            {icon(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>)}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className={`mr-1 inline-flex items-center gap-1.5 text-[10px] ${meta.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <button type="button" className={button} onClick={() => handle()?.copySelection()} title="Copy selection (Ctrl+Shift+C)" aria-label="Copy selection">
            {icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)}
          </button>
          <button type="button" className={button} onClick={() => handle()?.paste()} title="Paste (Ctrl+Shift+V)" aria-label="Paste">
            {icon(<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>)}
          </button>
          <button type="button" className={`${button} ${findOpen ? 'border-sky-400/40 bg-sky-400/10 text-sky-100' : ''}`} onClick={() => setFindOpen((v) => !v)} title="Find (Ctrl+Shift+F)" aria-label="Find">
            {icon(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)}
          </button>
          <button type="button" className={button} onClick={() => handle()?.clear()} title="Clear scrollback" aria-label="Clear scrollback">
            {icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>)}
          </button>
          <button type="button" className={button} onClick={() => handle()?.reconnect()} title="Reconnect" aria-label="Reconnect">
            {icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)}
          </button>
          <button type="button" className={button} onClick={() => handle()?.download()} title="Download output" aria-label="Download output">
            {icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
          </button>
          <div className="hidden items-center rounded-lg border border-white/10 bg-white/[0.04] sm:flex">
            <button type="button" className="px-2 py-1.5 text-[11px] text-gray-400 hover:text-white" onClick={() => setFontSize((n) => Math.max(9, n - 1))} aria-label="Smaller font">A−</button>
            <span className="w-7 text-center text-[10px] tabular-nums text-gray-500">{fontSize}</span>
            <button type="button" className="px-2 py-1.5 text-[11px] text-gray-400 hover:text-white" onClick={() => setFontSize((n) => Math.min(28, n + 1))} aria-label="Larger font">A+</button>
          </div>
          <button type="button" className={button} onClick={() => setMaximized((v) => !v)} title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore terminal size' : 'Maximize terminal'}>
            {maximized
              ? icon(<><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>)
              : icon(<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>)}
          </button>
        </div>
      </div>

      <div className={`relative w-full ${maximized ? 'min-h-0 flex-1' : 'h-[58vh] min-h-[380px]'}`}>
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            ref={(h) => { handles.current[tab.id] = h; }}
            instanceId={instanceId}
            sessionKey={tab.key}
            active={tab.id === active?.id}
            fontSize={fontSize}
            onShortcut={onShortcut}
            onContextMenu={showMenu}
            onStatus={(st) => setStatuses((prev) => (prev[tab.id] === st ? prev : { ...prev, [tab.id]: st }))}
          />
        ))}

        {findOpen && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg border border-white/15 bg-neutral-900/95 p-1 shadow-2xl backdrop-blur">
            <input
              autoFocus
              value={findQuery}
              onChange={(e) => changeFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runFind(e.shiftKey ? 'prev' : 'next');
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeFind();
                }
              }}
              placeholder="Find in terminal…"
              className="w-44 bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-gray-500"
            />
            <span className="min-w-[48px] text-center text-[10px] tabular-nums text-gray-500">
              {findInfo.total > 0 ? `${findInfo.index}/${findInfo.total}` : '0/0'}
            </span>
            <button type="button" className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white" onClick={() => runFind('prev')} aria-label="Previous match">
              {icon(<path d="m18 15-6-6-6 6" />)}
            </button>
            <button type="button" className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white" onClick={() => runFind('next')} aria-label="Next match">
              {icon(<path d="m6 9 6 6 6-6" />)}
            </button>
            <button type="button" className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white" onClick={closeFind} aria-label="Close find">
              {icon(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>)}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-t border-white/10 px-2 py-1.5">
        {QUICK_KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => sendKey(k.key)}
            title={k.title}
            className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[10px] text-gray-500">
        <span className="truncate">Ctrl+Shift+C copy · Ctrl+Shift+V paste · Ctrl+Shift+F find · Ctrl+Shift+T new shell · Ctrl+Tab switch</span>
        <span className="shrink-0 tabular-nums">{tabs.length} shell{tabs.length === 1 ? '' : 's'} · {fontSize}px · {status === 'connected' ? 'PTY live' : meta.label.toLowerCase()}</span>
      </div>

      {menu && (
        <>
          <div
            className="fixed inset-0 z-[78]"
            onMouseDown={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
          />
          <div
            className="fixed z-[79] w-56 rounded-lg border border-white/15 bg-neutral-900 p-1 shadow-2xl backdrop-blur"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            <MenuItem label="Copy selection" hint="Ctrl+Shift+C" onClick={() => { handle()?.copySelection(); setMenu(null); }} />
            <MenuItem label="Copy all output" onClick={() => { handle()?.copyAll(); setMenu(null); }} />
            <MenuItem label="Paste" hint="Ctrl+Shift+V" onClick={() => { handle()?.paste(); setMenu(null); }} />
            <MenuItem label="Select all" hint="Ctrl+Shift+A" onClick={() => { handle()?.selectAll(); setMenu(null); }} />
            <MenuSep />
            <MenuItem label="Find in terminal" hint="Ctrl+Shift+F" onClick={() => { setFindOpen(true); setMenu(null); }} />
            <MenuItem label="Clear scrollback" hint="Ctrl+Shift+K" onClick={() => { handle()?.clear(); setMenu(null); }} />
            <MenuItem label="Download output" onClick={() => { handle()?.download(); setMenu(null); }} />
            <MenuSep />
            <MenuItem label="New shell" hint="Ctrl+Shift+T" onClick={() => { addTab(); setMenu(null); }} />
            {tabs.length > 1 && <MenuItem label="Close shell" hint="Ctrl+Shift+W" onClick={() => { closeTab(active?.id ?? 0); setMenu(null); }} />}
            <MenuItem label="Reconnect" onClick={() => { handle()?.reconnect(); setMenu(null); }} />
            <MenuItem label={maximized ? 'Restore size' : 'Maximize'} hint="Ctrl+Shift+Enter" onClick={() => { setMaximized((v) => !v); setMenu(null); }} />
          </div>
        </>
      )}
    </div>
  );
};

export default InstanceTerminal;
