import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createCustomPageSDK, pageNavigateTarget, type InstanceContext } from '@/shared/lib/customPageSdk';
import { useThemeStore } from '@/shared/stores/themeStore';
import type { Theme } from '@/features/themes/types/theme';
import { rgbaAt } from '@/theme/colorUtils';

// BlockRow mirrors the BlockRow type used in the Instance Page Studio's
// visual block editor.
interface BlockRow {
  type: 'heading' | 'text' | 'image' | 'button' | 'spacer' | 'code' | 'divider'
    | 'stat' | 'table' | 'list' | 'html' | 'action';
  value: string;
  href?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
  // stat block
  label?: string;
  unit?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  // action block
  action?: string;      // saved PageActionDef.name to run
  confirmText?: string; // optional confirm prompt before running
}

export interface PageContent {
  type: 'html' | 'markdown' | 'blocks';
  html?: string;
  markdown?: string;
  blocks?: string;
  actions?: any[];
}

const TONE_CLASS: Record<string, string> = {
  default: 'text-white',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-red-300',
};

// safeUrl guards author-controlled hrefs rendered in the HOST origin
// (markdown links, button blocks). Only http(s), mailto and relative targets
// are allowed; every other explicit scheme (javascript:, vbscript:, data:,
// file:, …) falls back to '#'.
function safeUrl(raw?: string): string {
  const u = (raw ?? '').trim();
  if (!u) return '#';
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
  return u;
}

// safeImgSrc additionally permits data:image/* (inline images cannot execute
// script when loaded through <img>).
function safeImgSrc(raw?: string): string {
  const u = (raw ?? '').trim();
  if (/^data:image\//i.test(u)) return u;
  return safeUrl(u);
}

// renderBlocks converts the JSON block list into React elements. Mirrors the
// studio's block types one-for-one so what the author composes is what the
// user sees.
function renderBlocks(json: string): React.ReactNode {
  let rows: BlockRow[] = [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) rows = arr;
  } catch { /* ignore */ }
  if (rows.length === 0) return <p className="text-sm text-gray-500">This page has no content yet.</p>;

  const alignClass = (a?: string) => a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : '';
  const runSavedAction = async (name?: string, confirmText?: string) => {
    if (!name) return;
    const sdk = (window as any).KSPageSDK;
    if (!sdk?.runAction) { alert('Actions are unavailable on this page view.'); return; }
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const res = await sdk.runAction(name);
      if (res && res.ok === false && (res.error || res.stderr)) {
        alert(String(res.error || res.stderr));
      }
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-4">
      {rows.map((b, i) => {
        const al = alignClass(b.align);
        switch (b.type) {
          case 'heading': {
            const lvl = (b.level ?? 2) as 1 | 2 | 3;
            const cls = `text-white font-semibold ${al} ${lvl === 1 ? 'text-2xl' : lvl === 2 ? 'text-xl' : 'text-lg'}`;
            return lvl === 1
              ? <h1 key={i} className={cls}>{b.value}</h1>
              : lvl === 2
              ? <h2 key={i} className={cls}>{b.value}</h2>
              : <h3 key={i} className={cls}>{b.value}</h3>;
          }
          case 'text':
            return <p key={i} className={`text-sm text-gray-300 leading-relaxed whitespace-pre-wrap ${al}`}>{b.value}</p>;
          case 'image': {
            const imgSrc = safeImgSrc(b.value);
            return imgSrc !== '#'
              ? <img key={i} src={imgSrc} alt="" className={`max-w-full rounded-lg border border-white/10 ${al}`} />
              : <div key={i} className="text-xs text-gray-500">[no image url]</div>;
          }
          case 'button':
            return (
              <div key={i} className={`${al}`}>
                <a href={safeUrl(b.href)} target="_blank" rel="noreferrer"
                  className="ks-primary-btn inline-flex items-center bg-white text-black px-4 py-2 rounded text-sm hover:bg-gray-200 transition">
                  {b.value}
                </a>
              </div>
            );
          case 'code':
            return <pre key={i} className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto text-xs font-mono text-gray-200">{b.value}</pre>;
          case 'spacer':
            return <div key={i} className="h-6" />;
          case 'divider':
            return <hr key={i} className="border-white/10" />;
          case 'stat': {
            const tone = TONE_CLASS[b.tone ?? 'default'] ?? TONE_CLASS.default;
            return (
              <div key={i} className={`glass-card rounded-xl p-4 ${al}`}>
                {b.label && <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">{b.label}</p>}
                <p className={`text-2xl font-semibold tabular-nums ${tone}`}>
                  {b.value}<span className="text-sm text-gray-400 ml-1">{b.unit}</span>
                </p>
              </div>
            );
          }
          case 'table': {
            let rows2: string[][] = [];
            try {
              const arr = JSON.parse(b.value);
              if (Array.isArray(arr)) rows2 = arr.map((r: any) => Array.isArray(r) ? r.map((c) => String(c ?? '')) : []);
            } catch { /* ignore */ }
            const [head, ...body] = rows2;
            if (!head) return <div key={i} className="text-xs text-gray-500">[table needs a JSON array of row arrays]</div>;
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-black/40">
                      {head.map((c, j) => <th key={j} className="text-left px-3 py-2 text-gray-300 font-semibold">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((r, ri) => (
                      <tr key={ri} className="border-t border-white/[0.06]">
                        {head.map((_, ci) => <td key={ci} className="px-3 py-1.5 text-gray-200 font-mono break-all">{r[ci] ?? ''}</td>)}
                      </tr>
                    ))}
                    {body.length === 0 && (
                      <tr><td colSpan={head.length} className="px-3 py-2 text-center text-gray-500">No rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'list': {
            let items: string[] = [];
            try {
              const arr = JSON.parse(b.value);
              if (Array.isArray(arr)) items = arr.map((x) => String(x ?? ''));
            } catch { items = b.value.split('\n').filter(Boolean); }
            return (
              <ul key={i} className={`list-disc pl-5 space-y-1 text-sm text-gray-300 ${al}`}>
                {items.length === 0 ? <li className="text-gray-500">[empty list]</li> : items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            );
          }
          case 'html':
            return b.value ? (
              <div key={i} className={al}>
                <HtmlBlockFrame html={b.value} />
              </div>
            ) : null;
          case 'action':
            return (
              <div key={i} className={`${al}`}>
                <button
                  type="button"
                  onClick={() => runSavedAction(b.action || b.value, b.confirmText)}
                  disabled={!b.action && !b.value}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-sm font-medium transition"
                >
                  {b.label || b.value || b.action || 'Run'}
                </button>
                {b.action && b.label && <span className="ml-2 text-[11px] text-gray-500 font-mono">{b.action}</span>}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// HtmlBlockFrame renders a 'html' block inside its own sandboxed
// opaque-origin iframe. Author markup must never run in the host origin (it
// could reach panel DOM, cookies and fetch panel APIs directly); this mirrors
// the content_type=html sandbox minus the SDK bridge — blocks are purely
// presentational. The frame self-reports its height so it sizes to content.
function HtmlBlockFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { type?: string; height?: number } | null;
      if (d && d.type === 'ks-block-resize' && typeof d.height === 'number') {
        setHeight(Math.min(Math.max(Math.ceil(d.height), 40), 20000));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  // NOTE: html is interpolated into srcDoc served on an opaque origin; the
  // sandbox attribute (NO allow-same-origin) is what contains it.
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:.25rem;color:#e5e7eb;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;overflow-x:hidden}
img{max-width:100%}table{border-collapse:collapse;width:100%}
a{color:#7dd3fc}
</style></head><body>${html}<script>
(function(){var last=0;function r(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h!==last){last=h;try{window.parent.postMessage({type:'ks-block-resize',height:h},'*')}catch(e){}}}setInterval(r,400);window.addEventListener('load',r)})();
</script></body></html>`;
  return (
    <iframe
      ref={frameRef}
      srcDoc={doc}
      style={{ width: '100%', height, border: 0, background: 'transparent' }}
      title="HTML block"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
    />
  );
}

// A minimal markdown renderer — converts headings, bold, italic, code, lists,
// and paragraphs into React nodes. We avoid pulling a heavy dependency by
// supporting just the common subset (headings, **bold**, *italic*, `code`,
// links, lists, paragraphs).
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (list.length === 0) return;
    if (listType === 'ul') out.push(<ul key={out.length} className="list-disc pl-5 space-y-1 text-sm text-gray-300">{list}</ul>);
    else if (listType === 'ol') out.push(<ol key={out.length} className="list-decimal pl-5 space-y-1 text-sm text-gray-300">{list}</ol>);
    list = [];
    listType = null;
  };

  const inline = (text: string): React.ReactNode => {
    // **bold**, *italic*, `code`, [text](url)
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[2] !== undefined) parts.push(<strong key={idx++} className="text-white font-semibold">{m[2]}</strong>);
      else if (m[3] !== undefined) parts.push(<em key={idx++}>{m[3]}</em>);
      else if (m[4] !== undefined) parts.push(<code key={idx++} className="font-mono text-xs bg-black/30 px-1 rounded">{m[4]}</code>);
      else if (m[5] !== undefined && m[6] !== undefined) parts.push(<a key={idx++} href={safeUrl(m[6])} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{m[5]}</a>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s/.test(trimmed)) {
      flushList();
      const lvl = trimmed.match(/^#+/)![0].length;
      const text = trimmed.replace(/^#+\s/, '');
      const cls = `text-white font-semibold ${lvl === 1 ? 'text-2xl' : 'text-xl'}`;
      out.push(lvl === 1
        ? <h1 key={out.length} className={cls}>{inline(text)}</h1>
        : <h2 key={out.length} className={cls}>{inline(text)}</h2>);
    } else if (/^[-*]\s/.test(trimmed)) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      list.push(<li key={list.length}>{inline(trimmed.replace(/^[-*]\s/, ''))}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      list.push(<li key={list.length}>{inline(trimmed.replace(/^\d+\.\s/, ''))}</li>);
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      out.push(<p key={out.length} className="text-sm text-gray-300 leading-relaxed">{inline(trimmed)}</p>);
    }
  }
  flushList();
  return <div className="space-y-3">{out}</div>;
}

interface CustomPageViewProps {
  content: PageContent;
  title: string;
  instanceContext?: InstanceContext;
  /**
   * Slug (or "<slug>/<sub-path>") of the page this view renders. Sent with
   * every SDK executeAction call so the server can verify the calling page
   * family is enabled on the bound instance (page-bound execution). Omit in
   * contexts without a real page (Studio static preview of unsaved pages).
   */
  pageSlug?: string;
}

// ============================================================================
// IFRAME BOOTSTRAP — runs inside the sandboxed (opaque-origin) iframe.
//
// The page author's HTML gets window.KSPageSDK as a stub that proxies every
// call to the panel over postMessage ('ks-sdk-call'). The parent executes the
// real SDK (same-origin, credentialed) and answers with 'ks-sdk-response'.
//
// Security model:
//   • The iframe is sandboxed WITHOUT allow-same-origin → it cannot touch the
//     parent DOM, cookies, localStorage or fetch panel APIs directly. The
//     ONLY way out is this message channel, which the parent gates.
//   • The parent only answers messages whose source is exactly this iframe,
//     and only for whitelisted SDK methods.
// ============================================================================

// Methods callable through the bridge. Everything here resolves data or fires
// UI side-effects; none of them expose raw DOM/network handles.
const BRIDGE_METHODS = [
  'executeAction', 'runAction', 'fetchPanel',
  'shell', 'readFile', 'writeFile', 'listFiles', 'deleteFile', 'createDirectory',
  'docker', 'kvm', 'lxd',
  'toast',
  // SPA navigation within the SAME instance (parent re-validates the target).
  'navigate',
  'storage.get', 'storage.set', 'storage.delete', 'storage.clear', 'storage.keys',
] as const;

// safeInlineJson serialises a value for direct embedding inside a
// <script> block: `<` is escaped so author-controlled strings (instance
// names, action fields…) can never close the tag or open another one.
function safeInlineJson(v: unknown): string {
  return JSON.stringify(v ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildIframeDocument(htmlContent: string, instanceContextJson: string, savedActionsJson: string, pageQuery: string, themeCss?: string): string {
  const bootstrapSrc = `
(function() {
  'use strict';
  var seq = 0;
  var pending = Object.create(null);

  function rpc(method, args) {
    return new Promise(function(resolve, reject) {
      var id = 'c' + (++seq) + '-' + Date.now();
      pending[id] = { resolve: resolve, reject: reject };
      var timer = setTimeout(function() {
        if (pending[id]) { delete pending[id]; reject(new Error('KSPageSDK timeout: ' + method)); }
      }, 120000);
      pending[id].timer = timer;
      try {
        window.parent.postMessage({ type: 'ks-sdk-call', id: id, method: method, args: args }, '*');
      } catch (e) {
        clearTimeout(timer); delete pending[id]; reject(e);
      }
    });
  }

  function settle(id, fn) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    clearTimeout(p.timer);
    fn(p);
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'ks-sdk-response') {
      settle(event.data.id, function(p) {
        if (event.data.error) p.reject(new Error(event.data.error));
        else p.resolve(event.data.result);
      });
    }
  });

  var sdk = { instance: ${instanceContextJson}, actions: ${savedActionsJson} };
  ${JSON.stringify(BRIDGE_METHODS)}.forEach(function(m) {
    var parts = m.split('.');
    var target = sdk;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = function() {
      return rpc(m, Array.prototype.slice.call(arguments));
    };
  });

  // Polling subscription built on the bridged executeAction.
  sdk.subscribe = function(action, callback, intervalMs) {
    var iv = Math.max(1000, intervalMs || 5000);
    var stopped = false;
    (async function loop() {
      while (!stopped) {
        var result;
        try { result = await sdk.executeAction(action); }
        catch (e) { result = { ok: false, error: e && e.message ? e.message : String(e) }; }
        try { callback(result); } catch (e) { /* page bug, keep polling */ }
        await new Promise(function(r) { setTimeout(r, iv); });
      }
    })();
    return function() { stopped = true; };
  };

  // Events (page-local pub/sub).
  var listeners = Object.create(null);
  sdk.on = function(ev, cb) {
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function() {
      var arr = listeners[ev] || [];
      var i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  };
  sdk.once = function(ev, cb) {
    var off = sdk.on(ev, function(d) { off(); cb(d); });
    return off;
  };
  sdk.emit = function(ev, data) {
    (listeners[ev] || []).slice().forEach(function(cb) {
      try { cb(data); } catch (e) { /* listener bug */ }
    });
    try { window.parent.postMessage({ type: 'ks-page-event', detail: { event: ev, data: data } }, '*'); } catch (e) {}
  };

  // WebSocket proxy: session cookies never leave the host origin, so the
  // sandboxed page asks the parent to open /api/instances/<id>/terminal and
  // relays frames. Exposes a minimal WebSocket-compatible surface.
  var wsSeq = 0;
  var sockets = Object.create(null);
  sdk.connectWS = function(protocols) {
    var wsId = 'ws' + (++wsSeq);
    var reqId = 'r' + wsId;
    var handlers = { onopen: null, onmessage: null, onclose: null, onerror: null };
    var sock = {
      readyState: 0,
      send: function(data) {
        try { window.parent.postMessage({ type: 'ks-ws-send', wsId: wsId, data: String(data) }, '*'); } catch (e) {}
      },
      close: function() {
        try { window.parent.postMessage({ type: 'ks-ws-close', wsId: wsId }, '*'); } catch (e) {}
        sock.readyState = 3;
      },
    };
    Object.defineProperty(sock, 'onopen', { get: function() { return handlers.onopen; }, set: function(v) { handlers.onopen = v; } });
    Object.defineProperty(sock, 'onmessage', { get: function() { return handlers.onmessage; }, set: function(v) { handlers.onmessage = v; } });
    Object.defineProperty(sock, 'onclose', { get: function() { return handlers.onclose; }, set: function(v) { handlers.onclose = v; } });
    Object.defineProperty(sock, 'onerror', { get: function() { return handlers.onerror; }, set: function(v) { handlers.onerror = v; } });
    sockets[wsId] = sock;

    function onEvent(event) {
      return function(e) {
        try {
          if (event === 'message') handlers.onmessage && handlers.onmessage({ data: e.data });
          else handlers[event] && handlers[event](e);
        } catch (err) { /* handler bug */ }
      };
    }
    messageHandlers[wsId] = { open: onEvent('open'), message: onEvent('message'), close: onEvent('close'), error: onEvent('error') };

    window.parent.postMessage({ type: 'ks-ws-open', reqId: reqId, protocols: protocols || null }, '*');
    return sock;
  };

  // Route parent -> iframe WS events to the matching socket shim.
  var messageHandlers = Object.create(null);
  window.addEventListener('message', function(event) {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'ks-ws-opened') {
      var sockOpen = sockets[String(event.data.wsId)];
      if (!sockOpen) return;
      if (event.data.error) {
        sockOpen.readyState = 3;
        messageHandlers[String(event.data.wsId)].error({});
      }
      return;
    }
    if (event.data.type === 'ks-ws-event') {
      var sockEv = sockets[String(event.data.wsId)];
      var h = messageHandlers[String(event.data.wsId)];
      if (!sockEv || !h) return;
      if (event.data.event === 'open') { sockEv.readyState = 1; h.open({}); }
      else if (event.data.event === 'message') h.message({ data: String(event.data.data == null ? '' : event.data.data) });
      else if (event.data.event === 'error') h.error({});
      else if (event.data.event === 'close') { sockEv.readyState = 3; h.close({}); delete sockets[String(event.data.wsId)]; delete messageHandlers[String(event.data.wsId)]; }
    }
  });

  // Auto-resize: report document height so the parent frame grows with content.
  var lastH = 0;
  function reportHeight() {
    var h = Math.max(320, Math.ceil(document.documentElement.getBoundingClientRect().height));
    if (h !== lastH) {
      lastH = h;
      try { window.parent.postMessage({ type: 'ks-iframe-resize', height: h }, '*'); } catch (e) {}
    }
  }
  setInterval(reportHeight, 400);
  window.addEventListener('load', reportHeight);

  window.KSPageSDK = sdk;
  // KS_PAGE_QUERY carries the PARENT route's query string (the iframe itself
  // is srcdoc on an opaque origin and cannot see it). Sub-pages read it to
  // pick up parameters — e.g. /files/edit?path=/etc/app.conf preloads the
  // editor with that path.
  window.KS_PAGE_QUERY = ${safeInlineJson(pageQuery)};
  window.dispatchEvent(new CustomEvent('ks-page-sdk-ready', { detail: sdk }));
  try { window.parent.postMessage({ type: 'ks-sdk-ready' }, '*'); } catch (e) {}
})();`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { box-sizing: border-box; }
/* Theme tokens — stock defaults mirroring the pre-theme look. The themed
   override block appended below re-emits every token from the ACTIVE panel
   theme (customPageThemeCss), so pages referencing var(--ks-*) follow the
   admin's theme exactly like the host UI does. */
:root {
  --ks-font-family: -apple-system, BlinkMacSystemFont,'Segoe UI', Roboto, sans-serif;
  --ks-heading: #ffffff;
  --ks-body: #e5e7eb;
  --ks-secondary: #d1d5db;
  --ks-muted: #9ca3af;
  --ks-faint: #6b7280;
  --ks-link: #7dd3fc;
  --ks-ok: #34d399;
  --ks-ok-soft: rgba(52,211,153,0.75);
  --ks-ok-wash: rgba(6,78,59,0.2);
  --ks-ok-line: rgba(6,78,59,0.4);
  --ks-warn: #fcd34d;
  --ks-warn-soft: rgba(252,211,77,0.75);
  --ks-warn-wash: rgba(120,53,15,0.3);
  --ks-warn-line: rgba(180,83,9,0.4);
  --ks-bad: #fca5a5;
  --ks-bad-soft: rgba(252,165,165,0.75);
  --ks-bad-wash: rgba(127,29,29,0.3);
  --ks-bad-line: rgba(185,28,28,0.5);
  --ks-info: #38bdf8;
  --ks-info-wash: rgba(2,132,199,0.3);
  --ks-info-line: rgba(7,89,133,0.45);
  /* Decorative hues without a panel token — stable across themes. */
  --ks-purple: #c4b5fd;
  --ks-pink: #f0abfc;
  --ks-cyan: #22d3ee;
  --ks-card-bg: rgba(255,255,255,0.04);
  --ks-card-border: rgba(255,255,255,0.10);
  --ks-input-bg: rgba(0,0,0,0.4);
  --ks-input-border: rgba(255,255,255,0.15);
}
body { font-family: var(--ks-font-family); margin: 0; padding: 1rem; color: var(--ks-body); background: transparent; line-height: 1.6; overflow-x: hidden; }
h1,h2,h3 { color: var(--ks-heading); margin: 1rem 0 0.5rem; }
code { background: rgba(0,0,0,0.35); padding: 0.1rem 0.3rem; border-radius: 3px; }
pre { background: rgba(0,0,0,0.35); padding: 1rem; border-radius: 6px; overflow-x: auto; }
a { color: var(--ks-link); }
a:hover { color: var(--ks-info); }
button, .btn { cursor: pointer; }
input, textarea, select { background: var(--ks-input-bg); border: 1px solid var(--ks-input-border); color: var(--ks-body); padding: 0.5rem; border-radius: 0.375rem; font-family: inherit; max-width: 100%; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ks-info); }
label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; color: var(--ks-muted); text-transform: uppercase; letter-spacing: 0.05em; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--ks-card-border); font-size: 0.8125rem; }
th { color: var(--ks-muted); text-transform: uppercase; font-size: 0.6875rem; letter-spacing: 0.05em; }
img { max-width: 100%; }
.ks-btn { display: inline-block; background: #fff; color: #000; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; font-size: 0.875rem; }
.ks-btn:hover { background: #e5e7eb; }
.ks-btn-blue { background: #0284c7; color: #fff; }
.ks-btn-blue:hover { background: #0ea5e9; }
.ks-btn-red { background: #b91c1c; color: #fff; }
.ks-btn-red:hover { background: #dc2626; }
.ks-btn-green { background: #059669; color: #fff; }
.ks-btn-green:hover { background: #10b981; }
.ks-card { background: var(--ks-card-bg); border: 1px solid var(--ks-card-border); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; }
.ks-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.ks-muted { color: var(--ks-muted); }
.ks-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ks-ok { color: var(--ks-ok); }
.ks-bad { color: var(--ks-bad); }
.ks-warn { color: var(--ks-warn); }
.ks-badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.6875rem; border: 1px solid var(--ks-input-border); background: var(--ks-input-bg); }
.ks-bar { position: relative; background: var(--ks-input-bg); border-radius: 9999px; height: 8px; overflow: hidden; min-width: 80px; }
.ks-bar > span { position: absolute; inset: 0 auto 0 0; background: var(--ks-info); border-radius: 9999px; }
${themeCss || ''}
</style>
<script>
${bootstrapSrc}
document.currentScript.remove();
</script>
</head>
<body>
${htmlContent}
</body>
</html>`;
}

// cssConst hardens a theme value before it is interpolated into the iframe
// stylesheet (mirrors themeStore's safeCssValue): block/declaration break-out
// characters and control chars are stripped, length capped. A rejected value
// falls back so the token always emits a usable declaration.
function cssConst(v: unknown, fallback: string): string {
  const s = String(v ?? '')
    .replace(/[{}<>\\;]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return s ? s.slice(0, 256) : fallback;
}

// customPageThemeCss bakes the ACTIVE panel theme into the sandboxed
// iframe's stylesheet. iframes don't inherit the parent's CSS custom
// properties, so concrete values are generated per mount. Values mirror
// the stock styles when the Default theme is active, so nothing changes
// visually until an admin customises.
function customPageThemeCss(theme: Theme): string {
  const f = theme.forms;
  const b = theme.button;
  const c = theme.card;
  const a = theme.accent;
  const bodyCol = cssConst(c.text_color, '#e5e7eb');
  const okCol = rgbaAt(a.success, 1, '#34d399');
  const warnCol = rgbaAt(a.warning, 1, '#fcd34d');
  const badCol = rgbaAt(a.danger, 1, '#fca5a5');
  const infoCol = rgbaAt(a.info, 1, '#38bdf8');
  return `
    /* Theme tokens — re-emitted from the ACTIVE panel theme. These override
       the stock :root defaults above so pages consuming var(--ks-*) follow
       the admin's theme exactly like the host UI does. */
    :root {
      --ks-font-family: ${cssConst(theme.typography.font_family, "-apple-system, BlinkMacSystemFont,'Segoe UI', Roboto, sans-serif")};
      --ks-heading: ${cssConst(theme.typography.heading_color, '#ffffff')};
      --ks-body: ${bodyCol};
      --ks-secondary: ${rgbaAt(bodyCol, 0.88, '#d1d5db')};
      --ks-muted: ${cssConst(theme.typography.body_color, '#9ca3af')};
      --ks-faint: ${cssConst(f.label_hint_color, '#6b7280')};
      --ks-link: ${cssConst(theme.typography.link_color, '#60a5fa')};
      --ks-ok: ${okCol};
      --ks-ok-soft: ${rgbaAt(okCol, 0.75, 'rgba(52,211,153,0.75)')};
      --ks-ok-wash: ${rgbaAt(okCol, 0.2, 'rgba(6,78,59,0.2)')};
      --ks-ok-line: ${rgbaAt(okCol, 0.4, 'rgba(6,78,59,0.4)')};
      --ks-warn: ${warnCol};
      --ks-warn-soft: ${rgbaAt(warnCol, 0.75, 'rgba(252,211,77,0.75)')};
      --ks-warn-wash: ${rgbaAt(warnCol, 0.25, 'rgba(120,53,15,0.3)')};
      --ks-warn-line: ${rgbaAt(warnCol, 0.4, 'rgba(180,83,9,0.4)')};
      --ks-bad: ${badCol};
      --ks-bad-soft: ${rgbaAt(badCol, 0.75, 'rgba(252,165,165,0.75)')};
      --ks-bad-wash: ${rgbaAt(badCol, 0.28, 'rgba(127,29,29,0.3)')};
      --ks-bad-line: ${rgbaAt(badCol, 0.5, 'rgba(185,28,28,0.5)')};
      --ks-info: ${infoCol};
      --ks-info-wash: ${rgbaAt(infoCol, 0.3, 'rgba(2,132,199,0.3)')};
      --ks-info-line: ${rgbaAt(infoCol, 0.45, 'rgba(7,89,133,0.45)')};
      --ks-card-bg: ${cssConst(c.background, 'rgba(255,255,255,0.04)')};
      --ks-card-border: ${cssConst(c.border_color, 'rgba(255,255,255,0.10)')};
      --ks-input-bg: ${cssConst(f.input_background, 'rgba(0,0,0,0.4)')};
      --ks-input-border: ${cssConst(f.input_border_color, 'rgba(255,255,255,0.15)')};
    }
    body { color: ${bodyCol}; font-family: ${cssConst(theme.typography.font_family, 'inherit')}; }
    h1,h2,h3 { color: ${cssConst(theme.typography.heading_color, '#fff')}; }
    a { color: ${cssConst(theme.typography.link_color, '#7dd3fc')}; }
    a:hover { color: ${infoCol}; }
    input, textarea, select { background: ${cssConst(f.input_background, 'rgba(0,0,0,0.4)')}; border-color: ${cssConst(f.input_border_color, 'rgba(255,255,255,0.15)')}; color: ${cssConst(f.input_text_color, '#e5e7eb')}; border-radius: ${f.input_border_radius ?? 6}px; padding: ${f.input_padding_y ?? 8}px ${f.input_padding_x ?? 12}px; font-size: ${f.input_font_size ?? 14}px; }
    input:focus, textarea:focus, select:focus { border-color: ${cssConst(f.input_focus_border_color, '#38bdf8')}; box-shadow: 0 0 0 ${f.focus_ring_width ?? 2}px ${cssConst(f.input_focus_ring_color, 'rgba(255,255,255,0.6)')}; }
    label { color: ${cssConst(f.label_hint_color, '#9ca3af')}; }
    th { color: ${cssConst(f.label_hint_color, '#9ca3af')}; }
    th, td { border-bottom-color: ${cssConst(c.border_color, 'rgba(255,255,255,0.08)')}; }
    .ks-btn { background: ${cssConst(b.background, '#fff')}; color: ${cssConst(b.text_color, '#000')}; border-radius: ${b.border_radius ?? 6}px; font-size: ${b.font_size ?? 14}px; }
    .ks-btn:hover { background: ${cssConst(b.hover_background, '#e5e7eb')}; }
    .ks-btn-blue { background: ${infoCol}; color: ${cssConst(b.text_color, '#fff')}; }
    .ks-btn-blue:hover { background: ${infoCol}; filter: brightness(1.15); }
    .ks-btn-red { background: ${rgbaAt(a.danger, 1, '#b91c1c')}; color: #fff; }
    .ks-btn-red:hover { background: ${rgbaAt(a.danger, 1, '#dc2626')}; filter: brightness(1.15); }
    .ks-btn-green { background: ${rgbaAt(a.success, 1, '#059669')}; color: #0b0d10; }
    .ks-btn-green:hover { background: ${rgbaAt(a.success, 1, '#10b981')}; }
    .ks-card { background: ${cssConst(c.background, 'rgba(255,255,255,0.04)')}; border-color: ${cssConst(c.border_color, 'rgba(255,255,255,0.1)')}; border-radius: ${c.border_radius ?? 12}px; padding: ${c.padding ?? 16}px; }
    .ks-muted { color: ${cssConst(theme.typography.body_color, '#9ca3af')}; }
    .ks-ok { color: ${okCol}; }
    .ks-bad { color: ${badCol}; }
    .ks-warn { color: ${warnCol}; }
    .ks-badge { border-color: ${cssConst(c.border_color, 'rgba(255,255,255,0.15)')}; background: ${cssConst(f.input_background, 'rgba(0,0,0,0.3)')}; }
    .ks-bar > span { background: ${infoCol}; }`;
}

// CustomPageView renders a custom page's content. HTML mode renders inside a
// sandboxed opaque-origin iframe whose only channel to the panel is the
// postMessage SDK bridge. Markdown and blocks render as React components in
// the host app, where window.KSPageSDK carries the same API surface.
const CustomPageView: React.FC<CustomPageViewProps> = ({ content, title, instanceContext, pageSlug }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wsRef = useRef<Map<string, WebSocket>>(new Map());
  const wsSeq = useRef(0);
  // SPA navigation for bridged pages (sandboxed iframes cannot navigate or
  // even read the parent URL themselves). The target is re-validated against
  // pageNavigateTarget before react-router performs it.
  const navigate = useNavigate();
  const location = useLocation();
  // Subscribe to the ACTIVE panel theme so themed pages follow theme edits
  // and route-scope switches live: the sandboxed iframe cannot inherit the
  // host's CSS custom properties, so its stylesheet is regenerated (with
  // concrete token values) whenever the resolved theme object changes.
  const activeTheme = useThemeStore((s) => s.active());

  // The real SDK lives in the host origin; bridged calls execute against it.
  const sdkRef = useRef<ReturnType<typeof createCustomPageSDK> | null>(null);
  useEffect(() => {
    sdkRef.current = instanceContext
      ? createCustomPageSDK(instanceContext, Array.isArray(content.actions) ? content.actions : [])
      : null;
    if (instanceContext) {
      // Also publish on window for markdown/blocks pages rendered in-host.
      (window as any).KSPageSDK = sdkRef.current;
    }
  }, [instanceContext, content.actions, pageSlug]);

  const srcDoc = useMemo(() => {
    if (content.type !== 'html') return undefined;
    // When no instance is bound (e.g. Studio static preview), embed a
    // placeholder identity so pages render honestly ("no instance bound")
    // instead of crashing on null; SDK calls still fail closed in the bridge.
    const ctx = instanceContext ?? ({
      id: 0,
      name: '(no instance bound — bind one for live data)',
      kind: '-',
      status: '-',
      template_id: 0,
      template_name: null,
      node_id: 0,
      node_name: null,
      owner_id: null,
      owner_name: null,
      config: {},
      external_id: '',
      created_at: '',
      updated_at: '',
    } as InstanceContext);
    return buildIframeDocument(
      content.html ?? '',
      safeInlineJson(ctx),
      safeInlineJson(Array.isArray(content.actions) ? content.actions : []),
      location.search,
      customPageThemeCss(activeTheme),
    );
  }, [content.type, content.html, content.actions, instanceContext, location.search, activeTheme]);

  // Bridge: parent-side handler for everything the iframe sends up.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from OUR iframe.
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type) return;

      switch (data.type) {
        case 'ks-sdk-call': {
          const { id, method, args } = data as { id: string; method: string; args: unknown[] };
          const respond = (payload: Record<string, unknown>) => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'ks-sdk-response', id, ...payload }, '*');
          };
          const sdk = sdkRef.current;
          if (!sdk) { respond({ error: 'SDK not bound to an instance' }); break; }
          if (typeof method !== 'string' || !(BRIDGE_METHODS as readonly string[]).includes(method)) {
            respond({ error: `Method not allowed: ${String(method)}` });
            break;
          }
          Promise.resolve().then(async () => {
            const list = args as any[];
            switch (method) {
              case 'executeAction': return sdk.executeAction(list[0]);
              case 'runAction': return sdk.runAction(list[0], list[1]);
              case 'fetchPanel': return sdk.fetchPanel(list[0], list[1]);
              case 'shell': return sdk.shell(list[0], list[1], list[2], list[3]);
              case 'readFile': return sdk.readFile(list[0]);
              case 'writeFile': return sdk.writeFile(list[0], list[1]);
              case 'listFiles': return sdk.listFiles(list[0]);
              case 'deleteFile': return sdk.deleteFile(list[0]);
              case 'createDirectory': return sdk.createDirectory(list[0]);
              case 'docker': return sdk.docker(list[0], list[1]);
              case 'kvm': return sdk.kvm(list[0], list[1]);
              case 'lxd': return sdk.lxd(list[0], list[1]);
              case 'toast': sdk.toast(list[0], list[1]); return { ok: true };
              case 'navigate': {
                // Fail closed: only routes inside THIS instance are allowed.
                const target = pageNavigateTarget(instanceContext?.id ?? 0, list[0]);
                if (!target) throw new Error('navigate: path outside this instance');
                navigate(target);
                return { ok: true };
              }
              default: {
                // storage.* — routed onto the storage namespace.
                const [, op] = method.split('.');
                return (sdk.storage as any)[op](...list.slice(0, 2));
              }
            }
          })
            .then((result) => {
              // Structured-clone the result defensively so functions /
              // uncloneables never break the reply.
              try { structuredClone(result); respond({ result }); }
              catch { respond({ result: String(result) }); }
            })
            .catch((err) => respond({ error: err instanceof Error ? err.message : String(err) }));
          break;
        }

        case 'ks-iframe-resize': {
          if (typeof data.height === 'number' && iframeRef.current) {
            iframeRef.current.style.height = `${Math.min(Math.max(data.height, 320), 20000)}px`;
          }
          break;
        }

        case 'ks-toast':
          window.dispatchEvent(new CustomEvent('ks-toast', { detail: data.detail }));
          break;

        case 'ks-modal':
          window.dispatchEvent(new CustomEvent('ks-modal', { detail: data.detail }));
          break;

        case 'ks-page-event':
          window.dispatchEvent(new CustomEvent('ks-page-event', { detail: data.detail }));
          break;

        // --- WebSocket proxy (terminal-style pages). Cookies never leave
        // the host origin, so the iframe asks us to open the socket. ---
        case 'ks-ws-open': {
          const wsId = `ws${++wsSeq.current}`;
          const url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/instances/${instanceContext?.id ?? 0}/terminal`;
          try {
            const ws = new WebSocket(url, typeof data.protocols === 'string' ? [data.protocols] : undefined);
            wsRef.current.set(wsId, ws);
            ws.onopen = () => iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-event', wsId, event: 'open' }, '*');
            ws.onmessage = (ev) => {
              ev.data.text().then((t: string) =>
                iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-event', wsId, event: 'message', data: t }, '*'),
              ).catch(() => {});
            };
            ws.onerror = () => iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-event', wsId, event: 'error' }, '*');
            ws.onclose = () => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-event', wsId, event: 'close' }, '*');
              wsRef.current.delete(wsId);
            };
            iframeRef.current.contentWindow?.postMessage({ type: 'ks-ws-opened', reqId: data.reqId, wsId }, '*');
          } catch (e) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-opened', reqId: data.reqId, error: String(e) }, '*');
          }
          break;
        }
        case 'ks-ws-send': {
          const ws = wsRef.current.get(data.wsId);
          if (ws && ws.readyState === WebSocket.OPEN && typeof data.data === 'string') ws.send(data.data);
          break;
        }
        case 'ks-ws-close': {
          const ws = wsRef.current.get(data.wsId);
          if (ws) { try { ws.close(); } catch { /* already closing */ } wsRef.current.delete(data.wsId); }
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      wsRef.current.forEach((ws) => { try { ws.close(); } catch { /* noop */ } });
      wsRef.current.clear();
    };
  }, [instanceContext, navigate]);

  // For markdown and blocks content rendered in-host, make sure the direct
  // SDK exists even before effects above run consumers rely on.
  useEffect(() => {
    if (instanceContext && content.type !== 'html') {
      createCustomPageSDK(instanceContext, Array.isArray(content.actions) ? content.actions : []);
    }
  }, [instanceContext, content.type, content.actions, pageSlug]);

  // For HTML content, render in a hardened sandboxed iframe. Pure content:
  // no injected header or card chrome — only the pages-JSON payload shows.
  if (content.type === 'html') {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        className="w-full border-0 bg-transparent animate-fade-in"
        style={{ minHeight: '500px', height: '500px' }}
        title={title}
        // NO allow-same-origin: the page runs on an opaque origin and can
        // only reach the panel through the gated postMessage bridge.
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
      />
    );
  }

  // For markdown and blocks, render as React components (SDK available on window.KSPageSDK)
  return (
    <div className="animate-fade-in">
      {content.type === 'markdown' && renderMarkdown(content.markdown ?? '')}
      {content.type === 'blocks' && renderBlocks(content.blocks ?? '')}
    </div>
  );
};

export default CustomPageView;
