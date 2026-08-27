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

import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { listInstancePages } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import { useInstanceNavSync } from '@/shared/components/layout/InstanceNavContext';
import { getPageContent, getPageLabel, isPageAllowed } from '@/shared/utils/instancePages';
import { pageNavigateTarget } from '@/shared/lib/customPageSdk';
import CustomPageView from '@/shared/components/ui/CustomPageView';

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

// InstanceDynamicPage resolves the current URL slug (the `*` catch-all param)
// against the INSTANCE's own config spec. When the slug maps to a page row
// with content it renders CustomPageView; otherwise a not-part-of-template /
// empty state card. The component resolution is direct: there are no built-in
// components anymore, only custom content payloads.
export const InstanceDynamicPage: React.FC = () => {
  const { id, '*': wildcard } = useParams();
  const instanceId = Number(id);
  const { instance, loading, error } = useInstance(instanceId);
  const [libraryPages, setLibraryPages] = useState<InstancePage[]>([]);

  useEffect(() => {
    let mounted = true;
    listInstancePages()
      .then((pages) => {
        if (mounted) setLibraryPages(pages);
      })
      .catch(() => {
        if (mounted) setLibraryPages([]);
      });
    return () => { mounted = false; };
  }, []);

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
  const baseSpec = useMemo(() => instance.config ? parseConfig(instance.config) : null, [instance?.config]);

  // Merge library pages' sub_pages into the spec so sub-page routes resolve
  // even if the deployed spec snapshot didn't include the latest sub_pages.
  const spec = useMemo(() => {
    if (!baseSpec) return baseSpec;
    const pages = Array.isArray(baseSpec.pages) ? [...baseSpec.pages] : [];
    const libBySlug = new Map<string, InstancePage>();
    for (const p of libraryPages) {
      if (p.slug && typeof p.slug === 'string') libBySlug.set(p.slug.trim(), p);
    }

    const merged = pages.map((row: any) => {
      if (!row || typeof row !== 'object' || !row.slug) return row;
      const lib = libBySlug.get(String(row.slug).trim());
      if (!lib) return row;
      const mergedRow: any = { ...row };

      // Fill missing sub_pages from library
      const hasSubPages = Array.isArray(row.sub_pages) && row.sub_pages.length > 0
        || (typeof row.sub_pages === 'string' && row.sub_pages.trim().length > 0);
      if (!hasSubPages && lib.sub_pages) {
        mergedRow.sub_pages = lib.sub_pages;
      }

      // Fill missing content from library when the spec row is empty
      const rowHasContent = !!(row.content_type && String(row.content_type).trim())
        || !!(row.content_html && String(row.content_html).trim())
        || !!(row.content_markdown && String(row.content_markdown).trim())
        || !!(row.content_blocks && String(row.content_blocks).trim());
      if (!rowHasContent && lib.content_type) {
        if (!mergedRow.content_type) mergedRow.content_type = lib.content_type;
        if (!mergedRow.content_html && lib.content_html) mergedRow.content_html = lib.content_html;
        if (!mergedRow.content_markdown && lib.content_markdown) mergedRow.content_markdown = lib.content_markdown;
        if (!mergedRow.content_blocks && lib.content_blocks) mergedRow.content_blocks = lib.content_blocks;
      }

      // Fill missing actions
      if ((!row.actions || (Array.isArray(row.actions) && row.actions.length === 0)) && lib.actions) {
        mergedRow.actions = lib.actions;
      }

      return mergedRow;
    });

    // Also add library pages not present in spec (for older instances)
    const existingSlugs = new Set(merged.filter((r: any) => r && r.slug).map((r: any) => String(r.slug).trim()));
    for (const p of libraryPages) {
      if (p.slug && typeof p.slug === 'string' && !existingSlugs.has(p.slug.trim())) {
        merged.push({
          slug: p.slug,
          original_slug: '',
          enabled: true,
          label: p.name,
          icon_svg: p.icon_svg,
          kind: 'custom',
          content_type: p.content_type,
          content_html: p.content_html,
          content_markdown: p.content_markdown,
          content_blocks: p.content_blocks,
          sub_pages: p.sub_pages,
          actions: p.actions,
        });
      }
    }
    return { ...baseSpec, pages: merged };
  }, [baseSpec, libraryPages]);

  const slug = (wildcard ?? '').replace(/\/+$/, '');
  const effectiveSlug = slug === '' ? '.' : slug;

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
