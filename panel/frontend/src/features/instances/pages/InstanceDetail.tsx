// InstanceDetail.tsx — instance panel shell + dynamic page resolver.
//
// Every instance sub-page is now a CUSTOM page (html / markdown / blocks)
// imported from the Instance Pages library into the instance's spec.pages.
// The legacy built-in React sub-pages were removed; this module keeps only:
//
//   • InstancePanel       — the shell that syncs the instance's own config
//                           snapshot into the global sidebar nav context;
//   • InstanceDynamicPage — resolves the URL slug against the INSTANCE's
//                           deploy-time spec and renders CustomPageView.
//
// A slug is allowed when the instance's own config lists it in `pages`
// (empty-by-default: no rows → no pages). Home uses slug "." and renders at
// the index route when its page row was imported.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { useInstanceNavSync } from '@/shared/components/layout/InstanceNavContext';
import { getPageContent, getPageLabel, isPageAllowed } from '@/shared/utils/instancePages';
import { pageNavigateTarget } from '@/shared/lib/customPageSdk';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import Terminal, { type TerminalHandle } from '@/shared/components/ui/Terminal';
import type { Terminal as XTerm } from '@xterm/xterm';

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

      <Outlet />
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
      Import pages (Home, Files, Terminal, Metrics, …) from the Instance Pages library in the template or deploy editor.
    </p>
    <code className="text-[11px] text-gray-600 block pb-3">resolved route: /{slug}</code>
  </div>
);

// TerminalRealPage — native xterm terminal for the `terminal` slug.
// Replaces the custom-page HTML terminal (LIB_TERMINAL_HTML) with the
// panel's real Terminal.tsx xterm bridge (full PTY, fit addon, theme,
// mobile keyboard, reconnection). This makes the instance terminal behave
// exactly like a local shell, not a div-based log viewer.
const TerminalRealPage: React.FC<{ instance: any }> = ({ instance }) => {
  const termRef = useRef<XTerm | null>(null);
  const handleRef = useRef<TerminalHandle>(null);
  const [state, setState] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [msg, setMsg] = useState('');

  const host = instance.node_name || ('node-' + (instance.node_id ?? '?'));
  const user = instance.kind === 'docker' ? 'root' : 'ubuntu';
  const ext = String(instance.name || 'session').slice(0, 16);
  let image = 'image';
  try {
    const cfg = typeof instance.config === 'string' ? JSON.parse(instance.config) : instance.config;
    if (cfg && typeof cfg === 'object' && cfg.image) image = String(cfg.image);
    else if (cfg && typeof cfg === 'object' && cfg.config && cfg.config.image) image = String(cfg.config.image);
  } catch { /* ignore */ }

  const onStateChange = (s: typeof state, m?: string) => {
    setState(s);
    setMsg(m ?? '');
  };

  const statusEl = (() => {
    switch (state) {
      case 'connected':
        return <span style={{ color: 'var(--ks-ok)' }}>● attached</span>;
      case 'connecting':
        return <span style={{ color: 'var(--ks-info)' }}>● connecting…</span>;
      case 'reconnecting':
        return <span style={{ color: 'var(--ks-warn)' }}>● reconnecting{msg ? ` in ${msg}` : ''}</span>;
      case 'error':
        return <span style={{ color: 'var(--ks-bad)' }}>● error{msg ? `: ${msg}` : ''}</span>;
      default:
        return <span className="ks-muted">● {String(instance.status || '')}</span>;
    }
  })();

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ks-heading)', margin: 0 }}>Terminal</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {state !== 'connected' && (
            <button
              type="button"
              onClick={() => handleRef.current?.reconnect()}
              className="ks-btn"
              title="Reconnect the live shell now"
              style={{ borderColor: 'var(--ks-info-line)', color: 'var(--ks-info)' } as React.CSSProperties}
            >
              ⟳ Reconnect
            </button>
          )}
          <button type="button" onClick={() => termRef.current?.clear()} className="ks-btn" title="Clear the terminal scrollback">
            Clear
          </button>
        </div>
      </div>

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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--ks-card-bg)',
            borderBottom: '1px solid var(--ks-card-border)',
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
          <span
            className="ks-mono"
            style={{
              marginLeft: 8,
              fontSize: 12,
              color: 'var(--ks-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user}@{host}: ~ — terminal
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--ks-input-bg)',
            borderBottom: '1px solid var(--ks-card-border)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 12,
              color: 'var(--ks-heading,#fff)',
              background: 'var(--ks-term-bg,#1e1e1e)',
              borderRight: '1px solid var(--ks-card-border)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 12, height: 12, stroke: 'var(--ks-info)' }}
            >
              <path d="m4 17 6-6-6-6" />
              <path d="M12 19h8" />
            </svg>
            sh — {ext || 'session'}
          </span>
        </div>

        <Terminal ref={handleRef} instanceId={instance.id} onStateChange={onStateChange} onTermRef={(t) => (termRef.current = t)} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 12px',
            background: 'var(--ks-info)',
            color: 'var(--ks-heading,#fff)',
            fontSize: 11,
          }}
        >
          <span className="ks-mono">{statusEl}</span>
          <span className="ks-mono" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: 12 }}>
            {ext || '—'} · {image}
          </span>
        </div>
      </div>
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

  // Real terminal: render native xterm for `terminal` slug regardless of
  // whether the template's page list contains it. This makes the terminal
  // behave like a built-in PTY (full emulation, mobile keyboard, fit,
  // theme, reconnection) instead of the div-based log viewer.
  if (effectiveSlug === 'terminal') {
    return <TerminalRealPage instance={instance} />;
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
  return <CustomPageView content={content} title={label} instanceContext={instanceContext} pageSlug={effectiveSlug} />;
};

export default InstancePanel;
