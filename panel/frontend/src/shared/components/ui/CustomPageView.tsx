import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createCustomPageSDK, type InstanceContext } from '@/shared/lib/customPageSdk';

// BlockRow mirrors the BlockRow type used in TemplateForm's CustomPageStudio.
interface BlockRow {
  type: 'heading' | 'text' | 'image' | 'button' | 'spacer' | 'code' | 'divider';
  value: string;
  href?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
}

export interface PageContent {
  type: 'html' | 'markdown' | 'blocks';
  html?: string;
  markdown?: string;
  blocks?: string;
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
          case 'image':
            return b.value
              ? <img key={i} src={b.value} alt="" className={`max-w-full rounded-lg border border-white/10 ${al}`} />
              : <div key={i} className="text-xs text-gray-500">[no image url]</div>;
          case 'button':
            return (
              <div key={i} className={`${al}`}>
                <a href={b.href ?? '#'} target="_blank" rel="noreferrer"
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
          default:
            return null;
        }
      })}
    </div>
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
      else if (m[5] !== undefined && m[6] !== undefined) parts.push(<a key={idx++} href={m[6]} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{m[5]}</a>);
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
}

// SDK injection script for HTML pages - runs inside iframe
const SDK_INJECTION_SCRIPT = `
(function() {
  // Wait for the SDK to be available on parent window
  function waitForSDK() {
    return new Promise((resolve, reject) => {
      if (window.parent && window.parent.KSPageSDK) {
        resolve(window.parent.KSPageSDK);
        return;
      }
      
      var timeout = setTimeout(function() {
        reject(new Error('KSPageSDK not found on parent within 5 seconds'));
      }, 5000);
      
      var checkInterval = setInterval(function() {
        if (window.parent && window.parent.KSPageSDK) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(window.parent.KSPageSDK);
        }
      }, 50);
    });
  }

  // PostMessage handler for iframe -> parent communication
  function handleMessage(event) {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'ks-sdk-call') {
      var call = event.data.payload;
      window.KSPageSDK[call.method].apply(window.KSPageSDK, call.args)
        .then(function(result) {
          window.parent.postMessage({ type: 'ks-sdk-response', id: call.id, result: result }, '*');
        })
        .catch(function(err) {
          window.parent.postMessage({ type: 'ks-sdk-response', id: call.id, error: err.message }, '*');
        });
    }
  }
  
  window.addEventListener('message', handleMessage);

  // Expose SDK to this window
  waitForSDK().then(function(sdk) {
    window.KSPageSDK = sdk;
    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('ks-page-sdk-ready', { detail: sdk }));
    // Notify parent that SDK is ready
    window.parent.postMessage({ type: 'ks-sdk-ready' }, '*');
  }).catch(function(err) {
    console.error('Failed to load KSPageSDK:', err);
    window.dispatchEvent(new CustomEvent('ks-page-sdk-error', { detail: err.message }));
  });
})();
`

// CustomPageView renders a custom page's content. HTML mode renders in an iframe
// with the KSPageSDK injected for dynamic capabilities. Markdown and blocks render
// as React components with SDK available on window.KSPageSDK.
const CustomPageView: React.FC<CustomPageViewProps> = ({ content, title, instanceContext }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const messageHandlersRef = useRef<Map<string, (data: any) => void>>(new Map());
  const pendingCallsRef = useRef<Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>>(new Map());
  const callIdCounter = useRef(0);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) return;
      
      const data = event.data;
      if (!data?.type) return;

      switch (data.type) {
        case 'ks-sdk-ready':
          setSdkReady(true);
          break;
          
        case 'ks-sdk-response': {
          const pending = pendingCallsRef.current.get(data.id);
          if (pending) {
            pendingCallsRef.current.delete(data.id);
            if (data.error) {
              pending.reject(new Error(data.error));
            } else {
              pending.resolve(data.result);
            }
          }
          break;
        }
        
        case 'ks-iframe-resize': {
          if (typeof data.height === 'number' && iframeRef.current) {
            iframeRef.current.style.height = data.height + 'px';
          }
          break;
        }
        
        case 'ks-toast': {
          // Forward toast to parent
          window.dispatchEvent(new CustomEvent('ks-toast', { detail: data.detail }));
          break;
        }
        
        case 'ks-modal': {
          // Forward modal to parent
          window.dispatchEvent(new CustomEvent('ks-modal', { detail: data.detail }));
          break;
        }
        
        case 'ks-page-event': {
          // Forward custom events
          window.dispatchEvent(new CustomEvent('ks-page-event', { detail: data.detail }));
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Inject SDK into iframe for HTML content
  useEffect(() => {
    if (!instanceContext || content.type !== 'html' || !iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    // Write the HTML content with SDK injection
    const htmlContent = content.html ?? '';
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 1rem; color: #e5e7eb; background: #0f172a; line-height: 1.6; }
    h1,h2,h3 { color: #fff; margin: 1rem 0 0.5rem; }
    code { background: #1e293b; padding: 0.1rem 0.3rem; border-radius: 3px; }
    pre { background: #1e293b; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    a { color: #7dd3fc; }
    a:hover { color: #38bdf8; }
    button, .btn { cursor: pointer; }
    .ks-primary-btn { background: #fff; color: #000; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; }
    .ks-primary-btn:hover { background: #e5e7eb; }
    .ks-ghost-btn { background: transparent; color: #e5e7eb; border: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; }
    .ks-ghost-btn:hover { background: rgba(255,255,255,0.1); }
    .glass-card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.75rem; padding: 1.5rem; }
    input, textarea, select { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); color: #e5e7eb; padding: 0.5rem; border-radius: 0.375rem; width: 100%; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #38bdf8; }
    label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-gray-300 { color: #d1d5db; }
    .text-gray-400 { color: #9ca3af; }
    .text-gray-500 { color: #6b7280; }
    .text-white { color: #fff; }
    .font-semibold { font-weight: 600; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
    .rounded { border-radius: 0.375rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .overflow-auto { overflow: auto; }
    .bg-black\\/40 { background: rgba(0,0,0,0.4); }
    .border { border-width: 1px; }
    .border-white\\/10 { border-color: rgba(255,255,255,0.1); }
    .max-w-full { max-width: 100%; }
    .inline-flex { display: inline-flex; }
    .items-center { align-items: center; }
    .gap-2 { gap: 0.5rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .transition { transition: all 0.15s ease; }
    .hover\\:bg-gray-200:hover { background: #e5e7eb; }
    .hover\\:text-white:hover { color: #fff; }
    .text-sky-300 { color: #7dd3fc; }
    .hover\\:underline:hover { text-decoration: underline; }
  </style>
</head>
<body>
${htmlContent}
<script>
${SDK_INJECTION_SCRIPT}
</script>
</body>
</html>`;

    doc.open();
    doc.write(fullHTML);
    doc.close();
    setIframeLoaded(true);
  }, [instanceContext, content.type, content.html]);

  // Also expose SDK on window for markdown/blocks content
  useEffect(() => {
    if (instanceContext) {
      createCustomPageSDK(instanceContext);
    }
  }, [instanceContext]);

  // Handle iframe height auto-resize
  useEffect(() => {
    if (!iframeLoaded || !iframeRef.current) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ks-iframe-resize' && event.source === iframeRef.current?.contentWindow) {
        iframeRef.current.style.height = event.data.height + 'px';
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeLoaded]);

  // For HTML content, render in iframe with SDK
  if (content.type === 'html') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="text-sm text-gray-400 -mt-0.5">Custom page defined by this instance's template.</p>
        </div>
        <div className="glass-card rounded-xl overflow-hidden">
          <iframe
            ref={iframeRef}
            className="w-full border-0 bg-transparent"
            style={{ minHeight: '500px' }}
            title={title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
          />
        </div>
      </div>
    );
  }

  // For markdown and blocks, render as React components (SDK available on window.KSPageSDK)
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-400 -mt-0.5">Custom page defined by this instance's template.</p>
      </div>
      <div className="glass-card rounded-xl">
        {content.type === 'markdown' && renderMarkdown(content.markdown ?? '')}
        {content.type === 'blocks' && renderBlocks(content.blocks ?? '')}
      </div>
    </div>
  );
};

export default CustomPageView;