import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomPageView, { type PageContent } from '@/shared/components/ui/CustomPageView';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import {
  listStacks,
  listStackPages,
  getStackPage,
  stackUiUrl,
  extractStackApiError,
  STACK_SDK_URL,
} from '@/features/stacks/api/stacks';
import type { Stack, StackPageEntry } from '@/shared/types/stack';

// Panel theme tokens forwarded to panel-themed stacks. Same --ks-* surface
// CustomPageView paints with, so a stack using var(--ks-*) repaints with the
// route theme without shipping its own CSS.
const THEME_VARS = [
  '--ks-text-heading', '--ks-heading', '--ks-text-body', '--ks-body', '--ks-muted',
  '--ks-link', '--ks-card-bg', '--ks-card-border', '--ks-card-hover-border', '--ks-card-shadow',
  '--ks-input-bg', '--ks-input-border', '--ks-font-family', '--ks-base-size',
  '--ks-accent-success', '--ks-accent-warning', '--ks-accent-danger',
  '--ks-ok', '--ks-warn', '--ks-info', '--ks-bad', '--ks-bad-line', '--ks-bad-wash',
  '--ks-term-border',
];

function snapshotTheme(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const v of THEME_VARS) {
      const val = cs.getPropertyValue(v).trim();
      if (val) out[v] = val;
    }
  } catch {
    /* non-browser or CSP edge: empty snapshot */
  }
  return out;
}

// StackView — renders one ACTIVE stack at /stacks/:slug/*.
// spa mode: sandboxed iframe + KSStackSDK bridge (theme handshake answered
// locally; fetch/kv/nav proxy methods land with the Phase-2 sidecar proxy
// and answer a structured unavailable error until then).
// simple mode: panel-rendered pages via CustomPageView (native panel theme;
// custom mode wraps in the stack theme.css).
const StackView: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const [stack, setStack] = useState<Stack | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pages, setPages] = useState<StackPageEntry[]>([]);
  const [activePage, setActivePage] = useState<string>('');
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [toast, setToast] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const list = await listStacks();
        if (cancelled) return;
        const found = list.find((s) => s.slug === slug && s.active) || null;
        setStack(found);
        setMissing(!found);
        if (found && found.page_style === 'simple') {
          try {
            const entries = await listStackPages(slug);
            if (cancelled) return;
            setPages(entries);
            if (entries.length > 0) setActivePage(entries[0].slug);
          } catch {
            if (!cancelled) setPages([]);
          }
        }
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!stack || stack.page_style !== 'simple' || !activePage) {
      setPageContent(null);
      return;
    }
    let cancelled = false;
    setPageLoading(true);
    (async () => {
      try {
        const p = await getStackPage(slug, activePage);
        if (cancelled) return;
        const content: PageContent =
          p.type === 'html'
            ? { type: 'html', html: p.content }
            : p.type === 'blocks'
              ? { type: 'blocks', blocks: p.content }
              : { type: 'markdown', markdown: p.content };
        setPageContent(content);
      } catch {
        if (!cancelled) setPageContent(null);
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stack, activePage, slug]);

  // SDK bridge: answer ksStack messages from the iframe. Only the exact
  // iframe source is answered (opaque-origin safe: we check event.source).
  const onMessage = useCallback(
    (ev: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || !frame.contentWindow || ev.source !== frame.contentWindow) return;
      const d = ev.data || {};
      if (!d.ksStack || !d.id) return;
      const reply = (payload: Record<string, any>) =>
        frame.contentWindow?.postMessage({ ksStack: true, id: d.id, payload }, '*');
      switch (d.type) {
        case 'theme':
          reply(stack?.theme_mode === 'panel' ? { mode: 'panel', tokens: snapshotTheme() } : { mode: stack?.theme_mode || 'none', tokens: {} });
          break;
        case 'toast':
          setToast(String(d.payload?.message || ''));
          window.setTimeout(() => setToast(''), 3000);
          reply({ ok: true });
          break;
        default:
          // fetch/kv/nav ride the Phase-2 sidecar proxy — structured error
          // (never a hang) until then.
          reply({ ok: false, error: 'stack backend proxy lands in Phase-2' });
          break;
      }
    },
    [stack],
  );

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  const themeCssUrl = useMemo(() => {
    if (!stack || stack.theme_mode !== 'custom') return '';
    const themePath = (stack.manifest as any)?.frontend?.theme?.css || 'frontend/theme.css';
    return `/api/stacks/v1/ui/${encodeURIComponent(slug)}/${String(themePath).replace(/^(frontend\/dist\/|frontend\/|dist\/|\/+)/, '')}`;
  }, [stack, slug]);

  if (!loaded) return <SkeletonCard lines={4} />;
  if (missing || !stack) {
    return (
      <div className="glass-card ks-form-card rounded-xl px-4 py-10 text-center">
        <p className="text-sm text-gray-300 font-medium">Stack not found or inactive</p>
        <p className="text-xs text-gray-500 mt-1">Activate it on the <Link to="/stacks" className="text-sky-300">Stacks</Link> page first.</p>
      </div>
    );
  }

  const isSimple = stack.page_style === 'simple';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/stacks" className="text-xs text-sky-300 hover:text-sky-200">← Stacks</Link>
        <h1 className="text-base font-semibold text-gray-100">{stack.icon || '📦'} {stack.name}</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-400">
          {stack.page_style}/{stack.theme_mode}
        </span>
        {isSimple && pages.length > 1 && (
          <div className="flex gap-1 ml-2 flex-wrap">
            {pages.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setActivePage(p.slug)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${activePage === p.slug ? 'bg-sky-900/50 text-sky-200 border-sky-700/60' : 'bg-gray-800/50 text-gray-400 border-gray-700/50'}`}
              >
                {p.title || p.slug}
              </button>
            ))}
          </div>
        )}
      </div>

      {toast && <p className="text-xs text-emerald-200 bg-emerald-900/40 border border-emerald-700/50 rounded-lg px-3 py-1.5">{toast}</p>}

      {isSimple ? (
        <div>
          {stack.theme_mode === 'custom' && themeCssUrl && (
            <link rel="stylesheet" href={themeCssUrl} />
          )}
          {pageLoading ? (
            <SkeletonCard lines={4} />
          ) : pageContent ? (
            <CustomPageView content={pageContent} title={stack.name} pageSlug={`stack:${slug}/${activePage}`} />
          ) : (
            <div className="glass-card ks-form-card rounded-xl px-4 py-10 text-center">
              <p className="text-sm text-gray-400">{pages.length === 0 ? 'This stack ships no pages yet — add markdown/html under frontend/pages/.' : 'Pick a page.'}</p>
            </div>
          )}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title={stack.name}
          src={stackUiUrl(slug)}
          sandbox="allow-scripts"
          className="w-full rounded-xl border border-gray-700/60 bg-gray-900/40"
          style={{ minHeight: '70vh', height: '70vh' }}
          onLoad={() => {
            // Inject the SDK bootstrap then push panel theme tokens when the
            // stack opted into panel theming. Injection failures (CSP) only
            // degrade the SDK bridge — the bundle itself still renders.
            try {
              const doc = iframeRef.current?.contentDocument;
              if (doc) {
                const s = doc.createElement('script');
                s.src = STACK_SDK_URL;
                doc.head.appendChild(s);
              }
            } catch {
              /* cross-origin/CSP: bridge stays on postMessage only */
            }
          }}
        />
      )}
    </div>
  );
};

export default StackView;
