import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createCustomPageSDK, pageNavigateTarget, type InstanceContext } from '@/shared/lib/customPageSdk';
import { confirmDialog } from '@/shared/stores/confirmStore';
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

export interface PageComponentDef {
  name: string;
  type: 'html' | 'markdown' | 'block';
  description?: string;
  content: string;
}

export interface PageContent {
  type: 'html' | 'markdown' | 'blocks';
  html?: string;
  markdown?: string;
  blocks?: string;
  actions?: any[];
  components?: PageComponentDef[];
}

// Theme-aware inline styles for stat tones — every stat card follows the
// active theme (accent.* tokens) via CSS variables so instance pages are
// theme-complete even before the gated utility mappings emit. Fallbacks keep
// the Default look.
const TONE_STYLE: Record<string, React.CSSProperties> = {
  default: { color: 'var(--ks-text-heading, var(--ks-heading, #fff))' },
  good: { color: 'var(--ks-accent-success, #4ade80)' },
  warn: { color: 'var(--ks-accent-warning, #fbbf24)' },
  bad: { color: 'var(--ks-accent-danger, #ef4444)' },
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

// Component token pattern: {{component:name}} where name is alphanumeric/underscore/dash
const COMPONENT_TOKEN_RE = /\{\{\s*component:([A-Za-z0-9_][A-Za-z0-9_-]*)\s*\}\}/g;

// resolveComponentTokens replaces {{component:name}} tokens in text with the
// corresponding component's rendered content. Supports React-like nested
// composition: a component's own content may contain further tokens, which
// are resolved iteratively (up to 5 passes, bounded to avoid infinite loops
// from cyclic references). Runs on both main page and sub-pages via the
// parent's shared component list.
function resolveComponentTokens(text: string, components: PageComponentDef[]): string {
  if (!components || components.length === 0) return text;
  const compMap = new Map(components.map(c => [c.name, c]));
  let cur = text;
  for (let iter = 0; iter < 5; iter++) {
    let changed = false;
    const next = cur.replace(COMPONENT_TOKEN_RE, (_match, name: string) => {
      const comp = compMap.get(name);
      if (!comp) return _match; // leave unknown token as-is
      changed = true;
      return componentToHtml(comp);
    });
    cur = next;
    if (!changed) break;
    // Reset regex lastIndex for global pattern reuse across iterations.
    COMPONENT_TOKEN_RE.lastIndex = 0;
  }
  COMPONENT_TOKEN_RE.lastIndex = 0;
  return cur;
}

// componentToHtml converts a component definition to its HTML representation.
// This is used when substituting {{component:name}} in HTML content.
function componentToHtml(comp: PageComponentDef): string {
  switch (comp.type) {
    case 'html':
      return comp.content;
    case 'markdown':
      return markdownToHtml(comp.content);
    case 'block':
      return blocksToHtml(comp.content);
    default:
      return comp.content;
  }
}

// Minimal markdown-to-HTML converter for component content.
// Mirrors the subset handled by renderMarkdown but outputs HTML string.
function markdownToHtml(md: string): string {
  if (!md.trim()) return '';
  return md
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (/^###\s/.test(trimmed)) return `<h3>${trimmed.replace(/^###\s/, '')}</h3>`;
      if (/^##\s/.test(trimmed)) return `<h2>${trimmed.replace(/^##\s/, '')}</h2>`;
      if (/^#\s/.test(trimmed)) return `<h1>${trimmed.replace(/^#\s/, '')}</h1>`;
      if (/^[-*]\s/.test(trimmed)) return `<li>${trimmed.replace(/^[-*]\s/, '')}</li>`;
      if (/^\d+\.\s/.test(trimmed)) return `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`;
      if (trimmed === '') return '';
      // Inline: **bold**, *italic*, `code`, [text](url)
      return `<p>${trimmed
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
    .replace(/(<ul>.*<\/ul>)/g, '$1');
}

// blocksToHtml converts a JSON block array to HTML string.
function blocksToHtml(json: string): string {
  let rows: BlockRow[] = [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) rows = arr;
  } catch { return ''; }
  if (rows.length === 0) return '';
  return rows.map(b => {
    switch (b.type) {
      case 'heading': {
        const lvl = (b.level ?? 2) as 1 | 2 | 3;
        return `<h${lvl}>${b.value}</h${lvl}>`;
      }
      case 'text':
        return `<p>${b.value}</p>`;
      case 'image': {
        const src = safeImgSrc(b.value);
        return src !== '#' ? `<img src="${src}" alt="" />` : '';
      }
      case 'button':
        return b.href ? `<a href="${safeUrl(b.href)}" target="_blank" rel="noreferrer">${b.value}</a>` : `<span>${b.value}</span>`;
      case 'code':
        return `<pre><code>${b.value}</code></pre>`;
      case 'spacer':
        return '<div style="height: 1.5rem"></div>';
      case 'divider':
        return '<hr />';
      case 'stat': {
        const val = b.value;
        const label = b.label ? `<div class="stat-label">${b.label}</div>` : '';
        return `<div class="stat">${label}<div class="stat-value">${val}${b.unit || ''}</div></div>`;
      }
      case 'table': {
        let rows2: string[][] = [];
        try { const arr = JSON.parse(b.value); if (Array.isArray(arr)) rows2 = arr.map((r: any) => Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : []); } catch {}
        if (rows2.length === 0) return '<p>[empty table]</p>';
        const [head, ...body] = rows2;
        return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${head.map((_, i) => `<td>${r[i] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      case 'list': {
        let items: string[] = [];
        try { const arr = JSON.parse(b.value); if (Array.isArray(arr)) items = arr.map((x: any) => String(x ?? '')); } catch { items = b.value.split('\n').filter(Boolean); }
        return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
      }
      case 'html':
        return b.value;
      case 'action':
        return `<button class="action-btn" disabled>${b.label || b.value || 'Run'}</button>`;
      default:
        return '';
    }
  }).join('\n');
}

// renderBlocks converts the JSON block list into React elements. Mirrors the
// studio's block types one-for-one so what the author composes is what the
// user sees. Every surface is fully theme-aware via CSS variables so block
// pages follow the active theme (heading/body/link/accent/card tokens)
// exactly like HTML iframe pages do.
function renderBlocks(json: string, components?: PageComponentDef[]): React.ReactNode {
  let rows: BlockRow[] = [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) rows = arr;
  } catch { /* ignore */ }
  if (rows.length === 0) return <p className="text-sm" style={{ color: 'var(--ks-text-body, var(--ks-muted, #9ca3af))' }}>This page has no content yet.</p>;

  // Helper to resolve component tokens in a string.
  const resolveInString = (s: string) => resolveComponentTokens(s, components ?? []);

  const alignClass = (a?: string) => a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : '';
  const runSavedAction = async (name?: string, confirmText?: string) => {
    if (!name) return;
    const sdk = (window as any).KSPageSDK;
    // Panel-owned toast instead of a blocking browser alert().
    const say = (m: string, t: 'error' | 'info' = 'error') => {
      try { sdk?.toast?.(m, t); } catch { /* toast unavailable */ }
    };
    if (!sdk?.runAction) { say('Actions are unavailable on this page view.'); return; }
    if (confirmText && !(await confirmDialog({ title: 'Please confirm', message: confirmText }))) return;
    try {
      const res = await sdk.runAction(name);
      if (res && res.ok === false && (res.error || res.stderr)) {
        say(String(res.error || res.stderr));
      } else {
        say(`${name} finished`, 'info');
      }
    } catch (e: any) {
      say(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-4">
      {rows.map((b, i) => {
        const al = alignClass(b.align);
        switch (b.type) {
          case 'heading': {
            const lvl = (b.level ?? 2) as 1 | 2 | 3;
            const cls = `font-semibold ${al} ${lvl === 1 ? 'text-2xl' : lvl === 2 ? 'text-xl' : 'text-lg'}`;
            const headingStyle: React.CSSProperties = { color: 'var(--ks-text-heading, var(--ks-heading, #fff))' };
            return lvl === 1
              ? <h1 key={i} className={cls} style={headingStyle}>{resolveInString(b.value)}</h1>
              : lvl === 2
              ? <h2 key={i} className={cls} style={headingStyle}>{resolveInString(b.value)}</h2>
              : <h3 key={i} className={cls} style={headingStyle}>{resolveInString(b.value)}</h3>;
          }
          case 'text':
            return <p key={i} className={`text-sm leading-relaxed whitespace-pre-wrap ${al}`} style={{ color: 'var(--ks-text-body, var(--ks-body, #d1d5db))' }}>{resolveInString(b.value)}</p>;
          case 'image': {
            const imgSrc = safeImgSrc(resolveInString(b.value));
            return imgSrc !== '#'
              ? <img key={i} src={imgSrc} alt="" className={`max-w-full rounded-lg ${al}`} style={{ border: '1px solid var(--ks-card-border, rgba(255,255,255,0.10))' }} />
              : <div key={i} className="text-xs" style={{ color: 'var(--ks-text-body, #9ca3af)' }}>[no image url]</div>;
          }
          case 'button':
            return (
              <div key={i} className={`${al}`}>
                <a href={safeUrl(resolveInString(b.href ?? ''))} target="_blank" rel="noreferrer"
                  className="ks-primary-btn inline-flex items-center px-4 py-2 rounded text-sm font-medium transition">
                  {resolveInString(b.value)}
                </a>
              </div>
            );
          case 'code':
            return <pre key={i} className="rounded-lg p-3 overflow-auto text-xs font-mono" style={{ background: 'var(--ks-card-bg, rgba(255,255,255,0.04))', border: '1px solid var(--ks-card-border, rgba(255,255,255,0.10))', color: 'var(--ks-text-body, #e5e7eb)' }}>{resolveInString(b.value)}</pre>;
          case 'spacer':
            return <div key={i} className="h-6" />;
          case 'divider':
            return <hr key={i} style={{ borderColor: 'var(--ks-card-border, rgba(255,255,255,0.10))' }} />;
          case 'stat': {
            const toneStyle = TONE_STYLE[b.tone ?? 'default'] ?? TONE_STYLE.default;
            return (
              <div key={i} className={`glass-card ks-stat-card rounded-xl p-4 ${al}`}>
                {b.label && <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ks-text-body, #9ca3af)' }}>{resolveInString(b.label)}</p>}
                <p className="text-2xl font-semibold tabular-nums" style={toneStyle}>
                  {resolveInString(b.value)}<span className="text-sm ml-1" style={{ color: 'var(--ks-text-body, #9ca3af)' }}>{resolveInString(b.unit ?? '')}</span>
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
            // Resolve component tokens inside each cell (React-like composition inside tables)
            rows2 = rows2.map(row => row.map(cell => resolveInString(cell)));
            const [head, ...body] = rows2;
            if (!head) return <div key={i} className="text-xs" style={{ color: 'var(--ks-text-body, #9ca3af)' }}>[table needs a JSON array of row arrays]</div>;
            return (
              <div key={i} className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--ks-card-border, rgba(255,255,255,0.10))' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--ks-card-bg, rgba(0,0,0,0.35))' }}>
                      {head.map((c, j) => <th key={j} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--ks-text-body, #d1d5db)', borderBottom: '1px solid var(--ks-card-border, rgba(255,255,255,0.10))' }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((r, ri) => (
                      <tr key={ri} style={{ borderTop: '1px solid var(--ks-card-border, rgba(255,255,255,0.06))' }}>
                        {head.map((_, ci) => <td key={ci} className="px-3 py-1.5 font-mono break-all" style={{ color: 'var(--ks-text-body, #e5e7eb)' }}>{r[ci] ?? ''}</td>)}
                      </tr>
                    ))}
                    {body.length === 0 && (
                      <tr><td colSpan={head.length} className="px-3 py-2 text-center" style={{ color: 'var(--ks-text-body, #9ca3af)' }}>No rows</td></tr>
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
            // Resolve component tokens in each list item.
            items = items.map(it => resolveInString(it));
            return (
              <ul key={i} className={`list-disc pl-5 space-y-1 text-sm ${al}`} style={{ color: 'var(--ks-text-body, #d1d5db)' }}>
                {items.length === 0 ? <li style={{ color: 'var(--ks-text-body, #6b7280)' }}>[empty list]</li> : items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            );
          }
          case 'html':
            return b.value ? (
              <div key={i} className={al}>
                <HtmlBlockFrame html={resolveInString(b.value)} />
              </div>
            ) : null;
          case 'action':
            return (
              <div key={i} className={`${al}`}>
                <button
                  type="button"
                  onClick={() => runSavedAction(b.action || b.value, b.confirmText)}
                  disabled={!b.action && !b.value}
                  className="ks-primary-btn px-4 py-2 disabled:opacity-50 rounded text-sm font-medium transition"
                  style={{ background: 'var(--ks-btn-bg, var(--ks-accent-primary, #0ea5e9))', color: 'var(--ks-btn-text, #fff)', border: 'none' }}
                >
                  {resolveInString(b.label || b.value || b.action || 'Run')}
                </button>
                {b.action && b.label && <span className="ml-2 text-[11px] font-mono" style={{ color: 'var(--ks-text-body, #6b7280)' }}>{b.action}</span>}
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
  // sandbox attribute (NO allow-same-origin) is what contains it. The ACTIVE
  // panel theme's tokens are baked in (same stylesheet the HTML page iframe
  // gets) so html blocks follow the theme like every other surface.
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:.25rem;color:var(--ks-body,#e5e7eb);background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;overflow-x:hidden}
img{max-width:100%}table{border-collapse:collapse;width:100%}
a{color:var(--ks-link,#7dd3fc)}
${activePageThemeCss()}
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
// A minimal markdown renderer — fully theme-aware via CSS variables so markdown
// pages follow the active theme (heading/body/link tokens) like every other
// instance-page surface. We avoid pulling a heavy dependency by supporting
// just the common subset (headings, **bold**, *italic*, `code`, links, lists,
// paragraphs).
function renderMarkdown(md: string, components?: PageComponentDef[]): React.ReactNode {
  // Resolve {{component:name}} tokens before rendering markdown.
  const resolvedMd = resolveComponentTokens(md, components ?? []);
  const lines = resolvedMd.split('\n');
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (list.length === 0) return;
    if (listType === 'ul') out.push(<ul key={out.length} className="list-disc pl-5 space-y-1 text-sm" style={{ color: 'var(--ks-text-body, var(--ks-body, #d1d5db))' }}>{list}</ul>);
    else if (listType === 'ol') out.push(<ol key={out.length} className="list-decimal pl-5 space-y-1 text-sm" style={{ color: 'var(--ks-text-body, var(--ks-body, #d1d5db))' }}>{list}</ol>);
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
      if (m[2] !== undefined) parts.push(<strong key={idx++} className="font-semibold" style={{ color: 'var(--ks-text-heading, var(--ks-heading, #fff))' }}>{m[2]}</strong>);
      else if (m[3] !== undefined) parts.push(<em key={idx++}>{m[3]}</em>);
      else if (m[4] !== undefined) parts.push(<code key={idx++} className="font-mono text-xs px-1 rounded" style={{ background: 'var(--ks-card-bg, rgba(0,0,0,0.35))', border: '1px solid var(--ks-card-border, rgba(255,255,255,0.10))', color: 'var(--ks-text-body, #e5e7eb)' }}>{m[4]}</code>);
      else if (m[5] !== undefined && m[6] !== undefined) parts.push(<a key={idx++} href={safeUrl(m[6])} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--ks-link, var(--ks-text-link, #7dd3fc))' }}>{m[5]}</a>);
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
      const t = trimmed.replace(/^#+\s/, '');
      const cls = `font-semibold ${lvl === 1 ? 'text-2xl' : 'text-xl'}`;
      out.push(lvl === 1
        ? <h1 key={out.length} className={cls} style={{ color: 'var(--ks-text-heading, var(--ks-heading, #fff))' }}>{inline(t)}</h1>
        : <h2 key={out.length} className={cls} style={{ color: 'var(--ks-text-heading, var(--ks-heading, #fff))' }}>{inline(t)}</h2>);
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
      out.push(<p key={out.length} className="text-sm leading-relaxed" style={{ color: 'var(--ks-text-body, var(--ks-body, #d1d5db))' }}>{inline(trimmed)}</p>);
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
  // Panel-owned confirm dialog: the iframe asks, the HOST renders the themed
  // ConfirmDialog (no browser-native confirm()/alert() anywhere).
  'confirm',
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
        // A real WebSocket always fires close after a failed handshake; do
        // the same here or pages that reconnect on close would stall.
        sockOpen.readyState = 3;
        var hsOpen = messageHandlers[String(event.data.wsId)];
        if (hsOpen) { hsOpen.error({}); hsOpen.close({}); }
        delete sockets[String(event.data.wsId)];
        delete messageHandlers[String(event.data.wsId)];
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

  // Global React-like patch for ALL html instance pages (Files checkbox fix etc).
  // Injected before ANY page html runs so document.getElementById('root').innerHTML
  // is patched to ksPatch - only changed data-ks-key units update, checkbox/focus/scroll preserved.
  const patchSrc = `
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function cardUnit(key,title,innerHtml){return '<div class="ks-card" data-ks-key="'+esc(key)+'"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">'+esc(title)+'</h3>'+innerHtml+'</div>';}
  function ksPatch(targetId, newHtml){
    var root=document.getElementById(targetId);
    if(!root) return;
    var tmp=document.createElement('div'); tmp.innerHTML=newHtml;
    var newKeys=tmp.querySelectorAll('[data-ks-key]');
    var oldNodes=root.querySelectorAll('[data-ks-key]');
    var oldMap={}; for(var oi=0;oi<oldNodes.length;oi++){ var on=oldNodes[oi]; oldMap[on.getAttribute('data-ks-key')]=on; }
    var hasKeyed=newKeys.length>0;
    if(hasKeyed){
      for(var i=0;i<newKeys.length;i++){ var n=newKeys[i]; var key=n.getAttribute('data-ks-key'); var o=oldMap[key]; if(o && o.outerHTML!==n.outerHTML){ o.replaceWith(n.cloneNode(true)); } else if(!o){ /* new unit handled below */ } if(o) delete oldMap[key]; }
      for(var k in oldMap){ try{ oldMap[k].remove(); }catch(e){} }
      if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
        for(var i=0;i<tmp.children.length;i++){ var nn=tmp.children[i]; var oo=root.children[i]; var nnHasKey=!!nn.querySelector('[data-ks-key]')||nn.hasAttribute('data-ks-key'); var ooHasKey=!!oo.querySelector('[data-ks-key]')||oo.hasAttribute('data-ks-key'); if(nnHasKey||ooHasKey) continue; if(oo.outerHTML!==nn.outerHTML){ oo.replaceWith(nn.cloneNode(true)); } }
      }
      if(oldNodes.length===0 && newKeys.length>0){
        if(root.innerHTML!==newHtml){ var st0=root.scrollTop, sl0=root.scrollLeft; root.innerHTML=newHtml; try{root.scrollTop=st0; root.scrollLeft=sl0;}catch(e){} }
        return;
      }
      return;
    }
    if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
      var ch=0; for(var i=0;i<tmp.children.length;i++){ var nn2=tmp.children[i]; var oo2=root.children[i]; var nk=nn2.getAttribute('data-ks-key')||nn2.id||''; var ok=oo2.getAttribute('data-ks-key')||oo2.id||''; if(nk!==ok){ if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; } continue; } if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; } }
      if(ch===0 && root.innerHTML!==tmp.innerHTML){ if(root.innerHTML!==newHtml){ var st=root.scrollTop, sl=root.scrollLeft; root.innerHTML=newHtml; try{root.scrollTop=st; root.scrollLeft=sl;}catch(e){} } }
      return;
    }
    if(root.innerHTML!==newHtml){ var st2=root.scrollTop, sl2=root.scrollLeft; root.innerHTML=newHtml; try{root.scrollTop=st2; root.scrollLeft=sl2;}catch(e){} }
  }
  function ksUnitPatch(unitId, innerHtml){ var n=document.getElementById(unitId); if(!n) return; if(n.innerHTML!==innerHtml) n.innerHTML=innerHtml; }
  function ksRefreshUnit(unitId, fetcher, renderer){ return fetcher().then(function(data){ var html=renderer(data); ksUnitPatch(unitId, html); return data; }); }
  try{
    var _gid=document.getElementById.bind(document);
    function _patchNode(n){
      if(!n || n._ksPatched) return n;
      try{
        var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
        if(!desc || !desc.set) return n;
        var origGet=desc.get, origSet=desc.set;
        Object.defineProperty(n,'innerHTML',{ get:function(){ return origGet.call(this); }, set:function(v){ if(this.id){ ksPatch(this.id, String(v)); } else { origSet.call(this, String(v)); } }, configurable:true, enumerable:true });
        n._ksPatched=true;
      }catch(e){}
      return n;
    }
    var origGetEl=document.getElementById.bind(document);
    document.getElementById=function(id){ return _patchNode(origGetEl(id)); };
    window.ksPatch=ksPatch; window.ksUnitPatch=ksUnitPatch; window.ksRefreshUnit=ksRefreshUnit; window.cardUnit=cardUnit;
    window.el=function(id){ return _patchNode(_gid(id)); };
  }catch(e){}
})();
`;

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
${patchSrc}
document.currentScript.remove();
</script>
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
// visually until an admin customises. This version is COMPLETE — it emits
// every token family the panel theme exposes (card, button, forms,
// typography, accent, dropdown, tabs, modal, utilities) so instance pages
// follow the theme exactly like host UI, fulfilling "complete theme support
// in every page". It also bakes the Theme Studio's Custom CSS (global +
// instance area/page scopes) so admin-authored raw CSS themes instance pages too.
function customPageThemeCss(theme: Theme, pageSlugOrPath?: string): string {
  const f = theme.forms;
  const b = theme.button;
  const c = theme.card;
  const a = theme.accent;
  const t = theme.typography;
  const bg = (theme as any).background;
  const sh = (theme as any).shape;
  const tabs = (theme as any).tabs;
  const dd = (theme as any).dropdowns;
  const comp = (theme as any).components;
  const cards = (theme as any).cards;
  const utilities = (theme as any).utilities;
  const bodyCol = cssConst(c.text_color, '#e5e7eb');
  const okCol = rgbaAt(a.success, 1, '#34d399');
  const warnCol = rgbaAt(a.warning, 1, '#fcd34d');
  const badCol = rgbaAt(a.danger, 1, '#fca5a5');
  const infoCol = rgbaAt(a.info, 1, '#38bdf8');
  const primaryCol = cssConst(a.primary, '#38bdf8');
  const num = (v: unknown, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const clampNum = (v: unknown, d: number, min: number, max: number): number => Math.max(min, Math.min(max, num(v, d)));
  const cssUrl = (v: unknown): string => {
    const s = String(v ?? '').trim();
    if (!s || s.length > 4096 || !/^(https?:\/\/|data:image\/[a-z0-9.+-]+(;base64)?,|blob:|\/)/i.test(s)) return '';
    return s.replace(/['\\]/g, '');
  };
  let cardLayer = 'none';
  if ((c as any).bg_type === 'image' && (c as any).bg_image) {
    const url = cssUrl((c as any).bg_image);
    if (url) {
      const op = clampNum((c as any).bg_opacity, 1, 0, 1);
      const scrim = 'rgba(0,0,0,' + (1 - op) + ')';
      const img = "url('" + url + "')";
      cardLayer = scrim + ' linear-gradient(' + img + ', ' + img + ')';
    }
  } else if ((c as any).bg_type === 'gradient' && (c as any).bg_gradient) {
    const g = cssConst((c as any).bg_gradient, '');
    if (g) cardLayer = g;
  }
  const ddBg = cssConst(dd?.background, 'rgba(12,14,18,0.22)');
  const ddBorder = cssConst(dd?.border_color, 'rgba(255,255,255,0.10)');
  const modalOverlay = cssConst(comp?.modal_overlay_color, 'rgba(0,0,0,0.60)');
  const modalBg = cssConst(comp?.modal_background, 'rgba(255,255,255,0.04)');
  const modalBorder = cssConst(comp?.modal_border_color, 'rgba(255,255,255,0.10)');
  const modalShadow = cssConst(comp?.modal_shadow, '0 8px 32px rgba(0,0,0,0.45)');
  const modalRadius = num(comp?.modal_border_radius, 5);
  const modalBlur = num(comp?.modal_backdrop_blur, 1);
  const listBg = cssConst(cards?.list_background ?? c.background, 'rgba(255,255,255,0.04)');
  const listBorder = cssConst(cards?.list_border_color ?? c.border_color, 'rgba(255,255,255,0.10)');
  const listHover = cssConst(cards?.list_hover_border_color ?? c.hover_border, 'rgba(255,255,255,0.20)');
  const listShadow = cssConst(cards?.list_shadow ?? c.shadow, '0 8px 32px rgba(0,0,0,0.45)');
  const statBg = cssConst(cards?.stat_background ?? c.background, 'rgba(255,255,255,0.04)');
  const statBorder = cssConst(cards?.stat_border_color ?? c.border_color, 'rgba(255,255,255,0.10)');
  const formBg = cssConst(cards?.form_background ?? c.background, 'rgba(255,255,255,0.04)');
  const formBorder = cssConst(cards?.form_border_color ?? c.border_color, 'rgba(255,255,255,0.10)');
  let baseCss = `
    /* Theme tokens — re-emitted from the ACTIVE panel theme. These override
       the stock :root defaults above so pages consuming var(--ks-*) follow
       the admin's theme exactly like the host UI does. Complete set covers
       every theme section (card, button, forms, dropdown, tabs, modal,
       typography, accent, utilities) — fulfilling full theme parity. */
    :root {
      --ks-font-family: ${cssConst(t.font_family, "-apple-system, BlinkMacSystemFont,'Segoe UI', Roboto, sans-serif")};
      --ks-heading: ${cssConst(t.heading_color, '#ffffff')};
      --ks-body: ${bodyCol};
      --ks-secondary: ${rgbaAt(bodyCol, 0.88, '#d1d5db')};
      --ks-muted: ${cssConst(t.body_color, '#9ca3af')};
      --ks-faint: ${cssConst(f.label_hint_color, '#6b7280')};
      --ks-link: ${cssConst(t.link_color, '#60a5fa')};
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
      --ks-purple: #c4b5fd;
      --ks-pink: #f0abfc;
      --ks-cyan: #22d3ee;
      --ks-bg-color: ${cssConst(bg?.color, '#000000')};
      --ks-bg-gradient: ${bg?.type === 'gradient' ? cssConst(bg.gradient, 'none') : 'none'};
      --ks-card-bg: ${cssConst(c.background, 'rgba(255,255,255,0.04)')};
      --ks-card-bg-layer: ${cardLayer};
      --ks-card-bg-size: ${cssConst((c as any).bg_size, 'cover')};
      --ks-card-bg-position: ${cssConst((c as any).bg_position, 'center')};
      --ks-card-bg-repeat: ${cssConst((c as any).bg_repeat, 'no-repeat')};
      --ks-card-border: ${cssConst(c.border_color, 'rgba(255,255,255,0.10)')};
      --ks-card-border-width: ${num(c.border_width, 1)}px;
      --ks-card-radius: ${num(c.border_radius, 5)}px;
      --ks-card-padding: ${num(c.padding, 15)}px;
      --ks-card-margin: ${num(c.margin, 0)}px;
      --ks-card-blur: ${num(c.backdrop_blur, 1)}px;
      --ks-card-shadow: ${cssConst(c.shadow, '0 8px 32px rgba(0,0,0,0.45)')};
      --ks-card-hover-border: ${cssConst(c.hover_border, 'rgba(255,255,255,0.20)')};
      --ks-card-gap-h: ${num((c as any).gap_h ?? (c as any).gap ?? 16, 16)}px;
      --ks-card-gap-v: ${num((c as any).gap_v ?? (c as any).gap ?? 16, 16)}px;
      --ks-input-bg: ${cssConst(f.input_background, 'rgba(0,0,0,0.4)')};
      --ks-input-border: ${cssConst(f.input_border_color, 'rgba(255,255,255,0.15)')};
      --ks-input-text: ${cssConst(f.input_text_color, '#ffffff')};
      --ks-input-placeholder: ${cssConst(f.input_placeholder_color, '#6b7280')};
      --ks-input-focus-border: ${cssConst(f.input_focus_border_color, 'rgba(255,255,255,0.40)')};
      --ks-input-focus-ring: ${cssConst(f.input_focus_ring_color, 'rgba(255,255,255,0.60)')};
      --ks-input-radius: ${num(f.input_border_radius, 6)}px;
      --ks-input-px: ${num(f.input_padding_x, 12)}px;
      --ks-input-py: ${num(f.input_padding_y, 8)}px;
      --ks-input-font: ${num(f.input_font_size, 14)}px;
      --ks-select-bg: ${cssConst(f.select_background, 'rgba(0,0,0,0.30)')};
      --ks-select-text: ${cssConst(f.select_text_color, '#ffffff')};
      --ks-select-border: ${cssConst(f.select_border_color, 'rgba(255,255,255,0.10)')};
      --ks-select-radius: ${num(f.select_border_radius, 6)}px;
      --ks-textarea-bg: ${cssConst(f.textarea_background, 'rgba(0,0,0,0.30)')};
      --ks-textarea-text: ${cssConst(f.textarea_text_color, '#ffffff')};
      --ks-textarea-border: ${cssConst(f.textarea_border_color, 'rgba(255,255,255,0.10)')};
      --ks-label-text: ${cssConst(f.label_text_color, '#e5e7eb')};
      --ks-label-hint: ${cssConst(f.label_hint_color, '#6b7280')};
      --ks-hint-text: ${cssConst(f.hint_text_color, '#6b7280')};
      --ks-hint-error: ${cssConst((f as any).hint_error_color, '#f87171')};
      --ks-hint-success: ${cssConst((f as any).hint_success_color, '#34d399')};
      --ks-btn-bg: ${cssConst(b.background, '#ffffff')};
      --ks-btn-text: ${cssConst(b.text_color, '#000000')};
      --ks-btn-hover: ${cssConst(b.hover_background, '#e5e7eb')};
      --ks-btn-border: ${cssConst(b.border, 'none')};
      --ks-btn-radius: ${num(b.border_radius, 5)}px;
      --ks-btn-px: ${num(b.padding_x, 19)}px;
      --ks-btn-py: ${num(b.padding_y, 8)}px;
      --ks-btn-font: ${num(b.font_size, 14)}px;
      --ks-btn-ghost-bg: ${cssConst(b.ghost_background, 'transparent')};
      --ks-btn-ghost-text: ${cssConst(b.ghost_text_color, '#e5e7eb')};
      --ks-btn-ghost-hover: ${cssConst(b.ghost_hover_background, 'rgba(255,255,255,0.10)')};
      --ks-btn-ghost-border: ${cssConst(b.ghost_border, '1px solid rgba(255,255,255,0.10)')};
      --ks-btn-ghost-radius: ${num(b.ghost_border_radius, 5)}px;
      --ks-btn-icon-bg: ${cssConst(b.icon_background, 'rgba(255,255,255,0.10)')};
      --ks-btn-icon-text: ${cssConst(b.icon_text_color, '#ffffff')};
      --ks-btn-icon-hover: ${cssConst(b.icon_hover_background, 'rgba(255,255,255,0.20)')};
      --ks-btn-icon-border: ${cssConst(b.icon_border, 'none')};
      --ks-btn-icon-radius: ${num(b.icon_border_radius, 5)}px;
      --ks-btn-icon-size: ${num(b.icon_size, 14)}px;
      --ks-tab-active-bg: ${cssConst(tabs?.active_background, '#ffffff')};
      --ks-tab-active-text: ${cssConst(tabs?.active_text_color, '#000000')};
      --ks-tab-inactive-bg: ${cssConst(tabs?.inactive_background, 'transparent')};
      --ks-tab-inactive-text: ${cssConst(tabs?.inactive_text_color, '#d1d5db')};
      --ks-tab-hover-bg: ${cssConst(tabs?.hover_background, 'rgba(255,255,255,0.05)')};
      --ks-tab-hover-text: ${cssConst(tabs?.hover_text_color, '#ffffff')};
      --ks-tab-border: ${cssConst(tabs?.border, 'none')};
      --ks-tab-radius: ${num(tabs?.border_radius, 5)}px;
      --ks-dropdown-bg: ${ddBg};
      --ks-dropdown-border: ${ddBorder};
      --ks-dropdown-border-width: ${num(dd?.border_width, 1)}px;
      --ks-dropdown-radius: ${num(dd?.border_radius, 5)}px;
      --ks-dropdown-shadow: ${cssConst(dd?.shadow, '0 12px 40px rgba(0,0,0,0.55)')};
      --ks-dropdown-blur: ${num(dd?.backdrop_blur, 25)}px;
      --ks-dropdown-item-text: ${cssConst(dd?.item_text_color, '#e5e7eb')};
      --ks-dropdown-item-hover: ${cssConst(dd?.item_hover_background, 'rgba(255,255,255,0.08)')};
      --ks-modal-bg: ${modalBg};
      --ks-modal-border: ${modalBorder};
      --ks-modal-shadow: ${modalShadow};
      --ks-modal-radius: ${modalRadius}px;
      --ks-modal-blur: ${modalBlur}px;
      --ks-modal-overlay: ${modalOverlay};
      --ks-listcard-bg: ${listBg};
      --ks-listcard-border: ${listBorder};
      --ks-listcard-hover: ${listHover};
      --ks-listcard-shadow: ${listShadow};
      --ks-statcard-bg: ${statBg};
      --ks-statcard-border: ${statBorder};
      --ks-statcard-icon: ${cssConst(cards?.stat_icon_color, '#ffffff')};
      --ks-formcard-bg: ${formBg};
      --ks-formcard-border: ${formBorder};
      --ks-term-bg: ${cssConst(f.input_background, 'rgba(0,0,0,0.50)')};
      --ks-term-text: ${cssConst(f.input_text_color, '#d4d4d4')};
      --ks-term-border: ${cssConst(c.border_color, 'rgba(255,255,255,0.10)')};
      --ks-radius-sm: ${num(sh?.border_radius_sm, 4)}px;
      --ks-radius-md: ${num(sh?.border_radius_md, 6)}px;
      --ks-radius-lg: ${num(sh?.border_radius_lg, 12)}px;
      --ks-z-dropdown: ${num(utilities?.z_dropdown, 50)};
      --ks-z-modal: ${num(utilities?.z_modal, 60)};
      --ks-z-tooltip: ${num(utilities?.z_tooltip, 70)};
      --ks-z-toast: ${num(utilities?.z_toast, 80)};
      /* Host ↔ iframe token parity — block/markdown React renderers use --ks-text-* names */
      --ks-text-heading: ${cssConst(t.heading_color, '#ffffff')};
      --ks-text-body: ${cssConst(t.body_color, '#9ca3af')};
      --ks-text-card: ${cssConst(c.text_color, '#ffffff')};
      --ks-accent-primary: ${primaryCol};
      --ks-accent-success: ${okCol};
      --ks-accent-warning: ${warnCol};
      --ks-accent-danger: ${badCol};
      --ks-accent-info: ${infoCol};
      --ks-base-size: ${num(t.base_size, 14)}px;
    }
    html { font-size: var(--ks-base-size); }
    body { color: ${bodyCol}; font-family: ${cssConst(t.font_family, 'inherit')}; background-color: transparent; line-height: 1.6; }
    h1,h2,h3 { color: ${cssConst(t.heading_color, '#fff')}; }
    h4,h5,h6 { color: ${cssConst(t.heading_color, '#fff')}; }
    a { color: ${cssConst(t.link_color, '#7dd3fc')}; }
    a:hover { color: ${infoCol}; }
    code { background: var(--ks-input-bg, rgba(0,0,0,0.35)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); padding: 0.1rem 0.3rem; border-radius: var(--ks-radius-sm, 4px); }
    pre { background: var(--ks-input-bg, rgba(0,0,0,0.35)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); padding: 1rem; border-radius: var(--ks-radius-md, 6px); overflow-x: auto; }
    input, textarea, select { background: var(--ks-input-bg, rgba(0,0,0,0.4)); border: 1px solid var(--ks-input-border, rgba(255,255,255,0.15)); color: var(--ks-input-text, #e5e7eb); border-radius: var(--ks-input-radius, 6px); padding: var(--ks-input-py, 8px) var(--ks-input-px, 12px); font-size: var(--ks-input-font, 14px); }
    input::placeholder, textarea::placeholder { color: var(--ks-input-placeholder, #6b7280); opacity: 1; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ks-input-focus-border, #38bdf8); box-shadow: 0 0 0 2px var(--ks-input-focus-ring, rgba(255,255,255,0.6)); }
    label { color: var(--ks-label-hint, #9ca3af); font-size: 12px; }
    th { color: var(--ks-label-hint, #9ca3af); background: var(--ks-card-bg, rgba(0,0,0,0.35)); }
    th, td { border-bottom: 1px solid var(--ks-card-border, rgba(255,255,255,0.08)); }
    table { border-collapse: collapse; width: 100%; }
    hr { border: none; border-top: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); margin: 1rem 0; }
    .ks-btn { background: var(--ks-btn-bg, #fff); color: var(--ks-btn-text, #000); border: var(--ks-btn-border, none); border-radius: var(--ks-btn-radius, 6px); font-size: var(--ks-btn-font, 14px); padding: var(--ks-btn-py, 8px) var(--ks-btn-px, 19px); font-weight: 500; cursor: pointer; display: inline-block; transition: background .15s ease, filter .15s ease; }
    .ks-btn:hover { background: var(--ks-btn-hover, #e5e7eb); }
    .ks-btn:disabled { opacity: 0.55; cursor: default; }
    .ks-btn-blue { background: var(--ks-info, ${infoCol}); color: #fff; }
    .ks-btn-blue:hover { background: var(--ks-info, ${infoCol}); filter: brightness(1.15); }
    .ks-btn-red { background: var(--ks-accent-danger, ${rgbaAt(a.danger, 1, '#b91c1c')}); color: #fff; }
    .ks-btn-red:hover { background: var(--ks-accent-danger, ${rgbaAt(a.danger, 1, '#dc2626')}); filter: brightness(1.15); }
    .ks-btn-green { background: var(--ks-accent-success, ${rgbaAt(a.success, 1, '#059669')}); color: #0b0d10; }
    .ks-btn-green:hover { background: var(--ks-accent-success, ${rgbaAt(a.success, 1, '#10b981')}); filter: brightness(1.08); }
    .ks-btn-ghost { background: var(--ks-btn-ghost-bg, transparent); color: var(--ks-btn-ghost-text, #e5e7eb); border: var(--ks-btn-ghost-border, 1px solid rgba(255,255,255,0.10)); border-radius: var(--ks-btn-ghost-radius, 5px); }
    .ks-btn-ghost:hover { background: var(--ks-btn-ghost-hover, rgba(255,255,255,0.10)); }
    .ks-btn-icon, .ks-iconbtn, .ks-btn-header { background: var(--ks-btn-icon-bg, rgba(255,255,255,0.10)); color: var(--ks-btn-icon-text, #fff); border: var(--ks-btn-icon-border, none); border-radius: var(--ks-btn-icon-radius, 5px); }
    .ks-btn-icon:hover, .ks-iconbtn:hover, .ks-btn-header:hover { background: var(--ks-btn-icon-hover, rgba(255,255,255,0.20)); }
    .ks-btn-header { display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;font-size:12px;font-weight:500;cursor:pointer;transition: background .15s ease; line-height:1; min-height:32px; min-width:32px; }
    .ks-btn-header svg { width:14px;height:14px; }
    .ks-btn-header.is-open { background: var(--ks-btn-icon-hover, rgba(255,255,255,0.20)) !important; }
    .ks-page-header { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:0.75rem; }
    .ks-page-header-actions { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
    .ks-card { background-color: var(--ks-card-bg, rgba(255,255,255,0.04)) !important; background-image: var(--ks-card-bg-layer, none) !important; background-size: var(--ks-card-bg-size, cover); background-position: var(--ks-card-bg-position, center); background-repeat: var(--ks-card-bg-repeat, no-repeat); border: var(--ks-card-border-width, 1px) solid var(--ks-card-border, rgba(255,255,255,0.10)) !important; border-radius: var(--ks-card-radius, 12px) !important; padding: var(--ks-card-padding, 16px) !important; box-shadow: var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.45)) !important; backdrop-filter: blur(var(--ks-card-blur, 1px)); -webkit-backdrop-filter: blur(var(--ks-card-blur, 1px)); }
    .ks-card:hover { border-color: var(--ks-card-hover-border, rgba(255,255,255,0.20)) !important; }
    .ks-list-card { background: var(--ks-listcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-listcard-border, var(--ks-card-border)) !important; box-shadow: var(--ks-listcard-shadow, var(--ks-card-shadow)) !important; }
    .ks-list-card:hover { border-color: var(--ks-listcard-hover, var(--ks-card-hover-border)) !important; }
    .ks-stat-card { background: var(--ks-statcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-statcard-border, var(--ks-card-border)) !important; }
    .ks-form-card { background: var(--ks-formcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-formcard-border, var(--ks-card-border)) !important; }
    .ks-muted { color: var(--ks-muted, #9ca3af) !important; }
    .ks-faint { color: var(--ks-faint, #6b7280) !important; }
    .ks-ok { color: var(--ks-ok, #34d399) !important; }
    .ks-bad { color: var(--ks-bad, #fca5a5) !important; }
    .ks-warn { color: var(--ks-warn, #fcd34d) !important; }
    .ks-info { color: var(--ks-info, #38bdf8) !important; }
    .ks-badge { border: 1px solid var(--ks-card-border, rgba(255,255,255,0.15)) !important; background: var(--ks-input-bg, rgba(0,0,0,0.3)) !important; color: var(--ks-body) !important; border-radius: 9999px; padding: 0.125rem 0.5rem; font-size: 0.6875rem; display: inline-block; }
    .ks-bar { position: relative; background: var(--ks-input-bg, rgba(0,0,0,0.4)); border-radius: 9999px; height: 8px; overflow: hidden; min-width: 80px; }
    .ks-bar > span { background: var(--ks-info, #38bdf8) !important; position: absolute; inset: 0 auto 0 0; border-radius: 9999px; }
    .ks-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .ks-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .ks-menu, .ks-dropdown { background: var(--ks-dropdown-bg, rgba(12,14,18,0.22)) !important; border: var(--ks-dropdown-border-width, 1px) solid var(--ks-dropdown-border, rgba(255,255,255,0.10)) !important; border-radius: var(--ks-dropdown-radius, 10px) !important; box-shadow: var(--ks-dropdown-shadow, 0 12px 40px rgba(0,0,0,0.55)) !important; backdrop-filter: blur(var(--ks-dropdown-blur, 25px)); -webkit-backdrop-filter: blur(var(--ks-dropdown-blur, 25px)); color: var(--ks-dropdown-item-text, #e5e7eb) !important; }
    .ks-menu button, .ks-dropdown button { color: var(--ks-dropdown-item-text, #e5e7eb); }
    .ks-menu button:hover, .ks-dropdown button:hover { background: var(--ks-dropdown-item-hover, rgba(255,255,255,0.08)) !important; }
    .ks-tab { background: var(--ks-tab-inactive-bg, transparent) !important; color: var(--ks-tab-inactive-text, #d1d5db) !important; border: var(--ks-tab-border, none) !important; border-radius: var(--ks-tab-radius, 5px) !important; }
    .ks-tab:hover { background: var(--ks-tab-hover-bg, rgba(255,255,255,0.05)) !important; color: var(--ks-tab-hover-text, #fff) !important; }
    .ks-tab-active { background: var(--ks-tab-active-bg, #fff) !important; color: var(--ks-tab-active-text, #000) !important; }
    .ks-modal-overlay, [data-overlay=\"1\"], [data-close=\"1\"] { background: var(--ks-modal-overlay, rgba(0,0,0,0.60)) !important; }
    .ks-modal-card, .ks-modal-panel { background: var(--ks-modal-bg, var(--ks-card-bg)) !important; border: 1px solid var(--ks-modal-border, var(--ks-card-border)) !important; box-shadow: var(--ks-modal-shadow, var(--ks-card-shadow)) !important; border-radius: var(--ks-modal-radius, 5px) !important; backdrop-filter: blur(var(--ks-modal-blur, 1px)); -webkit-backdrop-filter: blur(var(--ks-modal-blur, 1px)); }
    .ks-term-bg { background: var(--ks-term-bg, #1e1e1e) !important; color: var(--ks-term-text, #d4d4d4) !important; border-color: var(--ks-term-border) !important; }
    /* Scrollbar theming inside instance pages */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: var(--ks-card-border, rgba(255,255,255,0.15)); border-radius: 9999px; }
    ::-webkit-scrollbar-track { background: transparent; }
    /* Utility: make any inline hardcoded dark overlay respect theme via attribute override */
    div[style*=\"rgba(0,0,0,0.55)\"] { background: var(--ks-modal-overlay, rgba(0,0,0,0.60)) !important; }
    @media (max-width:640px){ .ks-hidden-sm{display:none!important} }`;
  // Bake Theme Studio Custom CSS for instance pages (global + instance scopes) so "theme Works in all instances pages"
  let customBlock = '';
  const customCSS = (theme as any).customCSS as { global?: string; scopes?: Record<string, string> } | undefined;
  if (customCSS) {
    if (customCSS.global && String(customCSS.global).trim()) customBlock += `\n/* Custom CSS — global (instance page) */\n${String(customCSS.global)}\n`;
    if (customCSS.scopes && typeof customCSS.scopes === 'object') {
      for (const [scope, css] of Object.entries(customCSS.scopes)) {
        if (!css || !String(css).trim()) continue;
        if (scope === 'area:instance' || scope.startsWith('page:instance')) {
          if (pageSlugOrPath) {
            const isArea = scope === 'area:instance';
            const isCustomCatchAll = scope === 'page:instance.panel.custom';
            if (isArea || isCustomCatchAll || scope.includes(pageSlugOrPath) || pageSlugOrPath.includes(scope.replace('page:', ''))) {
              customBlock += `\n/* Custom CSS — ${scope} */\n${String(css)}\n`;
            }
          } else {
            customBlock += `\n/* Custom CSS — ${scope} */\n${String(css)}\n`;
          }
        }
      }
    }
  }
  if (customBlock) baseCss += customBlock;
  return baseCss;
}

// activePageThemeCss returns the ACTIVE panel theme baked into an iframe
// stylesheet (the same CSS CustomPageView injects into HTML pages). Exported
// for sibling surfaces that render page content on opaque origins — the
// Studio's static preview and html blocks — so every sandboxed frame follows
// the admin's theme without inheriting host CSS variables. Accepts an
// optional pageSlug/path so instance-page Custom CSS scopes are filtered
// precisely (global + area:instance + matching page:instance.*).
export function activePageThemeCss(pageSlugOrPath?: string): string {
  return customPageThemeCss(useThemeStore.getState().active(), pageSlugOrPath);
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
    // pageSlug MUST ride along: the backend (ExecuteCustomPageActionHandler)
    // rejects execute-action calls without it, so every bridged shell/file
    // action fails closed without it.
    sdkRef.current = instanceContext
      ? createCustomPageSDK(instanceContext, Array.isArray(content.actions) ? content.actions : [], pageSlug ?? '')
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
    // Resolve {{component:name}} tokens in HTML content.
    const resolvedHtml = resolveComponentTokens(content.html ?? '', content.components ?? []);
    // Bake the active theme + any admin Custom CSS scoped to instance pages so every
    // instance page (Home, Files, Terminal, custom slug, sub-pages) follows the theme
    // system like host UI — completing "theme Works in all instances pages".
    const themeCss = customPageThemeCss(activeTheme, pageSlug ?? location.pathname);
    return buildIframeDocument(
      resolvedHtml,
      safeInlineJson(ctx),
      safeInlineJson(Array.isArray(content.actions) ? content.actions : []),
      location.search,
      themeCss,
    );
  }, [content.type, content.html, content.components, content.actions, instanceContext, location.search, activeTheme, pageSlug]);

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
              case 'confirm': {
                // Render the panel's themed ConfirmDialog in the HOST origin
                // and resolve the iframe's promise with the answer.
                const msg = typeof list[0] === 'string' ? list[0] : String(list[0] ?? '');
                return confirmDialog({ title: 'Please confirm', message: msg });
              }
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
              // Text frames arrive as strings, binary frames as Blobs. The
              // terminal bridge speaks text frames only — calling .text() on
              // a string throws and silently killed EVERY message to the
              // sandboxed page (terminal showed "connecting…" forever).
              const deliver = (t: string) =>
                iframeRef.current?.contentWindow?.postMessage({ type: 'ks-ws-event', wsId, event: 'message', data: t }, '*');
              if (typeof ev.data === 'string') { deliver(ev.data); return; }
              if (ev.data instanceof Blob) ev.data.text().then(deliver).catch(() => {});
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
      {content.type === 'markdown' && renderMarkdown(content.markdown ?? '', content.components)}
      {content.type === 'blocks' && renderBlocks(content.blocks ?? '', content.components)}
    </div>
  );
};

export default CustomPageView;
