// InstanceDetail.tsx — instance-panel facade.
//
// This file used to be the ~3,200-line monolith that held every built-in
// instance sub-page (Home / Files / Network / Terminal / Settings) plus the
// panel shell (InstancePanel) and the catch-all dynamic-page resolver
// (InstanceDynamicPage). Each sub-page's implementation now lives in its
// own self-contained file under src/lib/builtin/*.tsx, sharing UI helpers
// via src/lib/builtin/_shared.tsx. This module is now a THIN FACADE that:
//
//   • re-exports the five built-in page components so their boundary-wrapped
//     *Page variants (mounted by router.tsx) keep resolving;
//   • keeps InstancePanel + InstanceDynamicPage (the shell + resolver are not
//     in the builtin manifest, so they stay here);
//   • re-exports the cross-page helpers that used to be defined here
//     (LoadingOrError, useInstanceFromParams, cleanExternalId, joinPath,
//     INSTANCE_NAV) so external consumers don't break.
//
// Bug fixes for a specific built-in sub-page should now land in its
// lib/builtin/<Page>.tsx file instead of here.

import React, { useMemo } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { useInstanceNavSync } from '@/shared/components/layout/InstanceNavContext';
import { isCustomPage, getPageContent, isPageAllowed } from '@/shared/utils/instancePages';
import { getBuiltinComponent } from '@/features/builtin-pages';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import {
  withBoundary, PageErrorBoundary, LoadingOrError,
  useInstanceFromParams, cleanExternalId, joinPath, INSTANCE_NAV,
} from '@/features/builtin-pages/_shared';

// Built-in page implementations (moved to features/builtin-pages/*.tsx). Imported so we
// can wrap them in withBoundary for the router's *Page exports below.
import { InstanceHome } from '@/features/builtin-pages/Home';
import { InstanceFiles, InstanceFileEditor } from '@/features/builtin-pages/Files';
import { InstanceNetwork } from '@/features/builtin-pages/Network';
import { InstanceTerminal } from '@/features/builtin-pages/Terminal';
import { InstanceSettings } from '@/features/builtin-pages/Settings';

// Back-compat re-exports: the legacy monolith defined + exported these
// helpers here, so any external consumer that still
// `import { LoadingOrError, useInstanceFromParams, … } from './InstanceDetail'`
// keeps resolving. The implementations live in lib/builtin/_shared.tsx now.
export { LoadingOrError, useInstanceFromParams, cleanExternalId, joinPath, INSTANCE_NAV };

// ----- panel shell -----------------------------------------------------------
//
// The page-level sub-panel sidebar was removed — the second-level nav
// (Home / Files / Network / Terminal / Settings) is already rendered in the
// global Sidebar's Instances dropdown, so showing it again inline was just
// visual clutter. InstancePanel now only lays out the active subpage under
// a compact header that links back to the instances list.

export const InstancePanel: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);
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
  useInstanceNavSync(instanceId, spec);

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

// InstanceDynamicPage resolves the current URL slug (the `*` catch-all param)
// against the INSTANCE's own config spec. When the slug maps to a renamed
// builtin (e.g. /console → terminal component), it renders that built-in
// component. When it maps to a custom page, it renders CustomPageView with
// the page content. When nothing matches, it renders a 404-style empty state.
// The component resolution is now direct via the builtin manifest — no
// string-component-name indirection or lazy-dynamic-import indirection.
export const InstanceDynamicPage: React.FC = () => {
  const { id, '*': wildcard } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);

  if (loading) return <LoadingOrError loading={true} error="" kind="panel" />;
  if (!instance) return <LoadingOrError loading={false} error="Instance not found" kind="panel" />;

  // Resolve the spec from the instance's OWN stored config (the deploy-time
  // snapshot that already includes the instance-form's page overrides) — NOT
  // from the live template. This is what makes each instance's page set
  // independent: a page added/removed/renamed at deploy time shows up here,
  // and later template edits don't leak into deployed instances.
  const spec = instance.config ? parseConfig(instance.config) : null;
  const slug = (wildcard ?? '').split('/')[0];
  const effectiveSlug = slug === '' ? '.' : slug;

  // Check if this page is explicitly allowed in the template's spec.
  // Empty-by-default: no pages spec → nothing allowed.
  if (!isPageAllowed(effectiveSlug, spec)) {
    return (
<div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
        <p className="text-sm">This page (<code className="text-gray-300">/{slug || 'home'}</code>) is not part of this instance's template.</p>
      </div>
    );
  }

  // Try to resolve the slug to a built-in component via the manifest.
  // getBuiltinComponent handles renamed slugs (spec.original_slug) and
  // disabled pages (enabled: false). The advanced built-in pages
  // (Env/Automation/…) are React.lazy references in the manifest so the
  // heavy InstanceAdvancedPages module stays in a separate chunk; the
  // Suspense boundary here makes that lazy thenable resolve instead of
  // surfacing as React error #294 ("A component suspended while
  // rendering"). The basic pages (Home/Files/…) are statically imported
  // and resolve synchronously, so the Suspense is a no-op for them.
  const BuiltinComp = getBuiltinComponent(effectiveSlug, spec);
  if (BuiltinComp) {
    return (
      <PageErrorBoundary name={effectiveSlug}>
        <React.Suspense fallback={<LoadingOrError loading={true} error="" kind="panel" />}>
          <BuiltinComp />
        </React.Suspense>
      </PageErrorBoundary>
    );
  }

  // Not a builtin → check if it's a custom page.
  if (isCustomPage(effectiveSlug, spec)) {
    const content = getPageContent(effectiveSlug, spec);
    const label = spec?.pages?.find((p: any) => p.slug === effectiveSlug)?.label ?? effectiveSlug;
    // Build instance context for the custom page SDK
    const instanceContext = instance ? {
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
    } : undefined;
    return content ? <CustomPageView content={content} title={label} instanceContext={instanceContext} /> : <div className="text-sm text-gray-500">Page content not found.</div>;
  }

  return (
    <div className="glass-card rounded-xl text-center text-gray-400">
      <p className="text-sm">This page (<code className="text-gray-300">/{slug}</code>) is not part of this instance's template.</p>
    </div>
  );
};

// Export subpages for route configuration. Each is wrapped in withBoundary
// (PageErrorBoundary) so a render-time throw in any sub-page renders a
// visible red crash card with the JS error message instead of blanking the
// whole SPA. router.tsx mounts these directly under their <Route>. The
// component implementations live in lib/builtin/*.tsx; this facade just
// wraps them.

export const InstanceHomePage = withBoundary('Home', InstanceHome);
export const InstanceFilesPage = withBoundary('Files', InstanceFiles);
export const InstanceFileEditorPage = withBoundary('FileEditor', InstanceFileEditor);
export const InstanceNetworkPage = withBoundary('Network', InstanceNetwork);
export const InstanceConsolePage = withBoundary('Terminal', InstanceTerminal);
export const InstanceSettingsPage = withBoundary('Settings', InstanceSettings);

export default InstancePanel;
