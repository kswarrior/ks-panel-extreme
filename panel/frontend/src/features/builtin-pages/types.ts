import type React from 'react';

// BuiltinPageManifestEntry is the canonical record for a single built-in
// instance sub-page. One TSX file per built-in page owns an instance of
// this record (see builtin/*.tsx) and the aggregate manifest in
// builtin/index.ts is the single source of truth consumed by:
//   • instancePages.ts  — slug ↔ component name resolution, the sidebar
//     icon registry, and the empty-by-default page whitelist.
//   • TemplateForm.tsx  — the "Add Page" picker lists every built-in
//     page from the manifest with its live icon and name, so adding a
//     built-in page and adding a custom page use the same workflow.
//   • InstanceDetail.tsx — InstanceDynamicPage maps a resolved slug back
//     to its component through BUILTIN_PAGE_MANIFEST.getComponent(slug).
//
// Keeping the iconography + name + slug + component together in one place
// means a built-in page and a custom page are indistinguishable from the
// template author's point of view: both are just rows in the manifest.
export interface BuiltinPageManifestEntry {
  /** Route slug. '.' is synthetic (index). Otherwise matches the URL
   *  segment under /instances/:id/<slug>. */
  slug: string;
  /** Default display label rendered in the sidebar + template picker. */
  name: string;
  /** true = the slug/path is fixed and the built-in component is always
   *  used (Home). false = a template may rename the slug (terminal→console)
   *  without losing the built-in component. */
  fixed?: boolean;
  /** Key recognised by the Sidebar's Icons registry (used when the
   *  template didn't override iconSvg). */
  iconName: string;
  /** Inner SVG markup (no <svg> wrapper) — matches the storage convention
   *  of the spec's `icon_svg` field and the Sidebar's svg shell. */
  iconSvg: string;
  /** The React component this slug renders. Lazily resolved through the
   *  manifest so the router and InstanceDynamicPage share one map. */
  component: React.ComponentType;
}

// BuiltinPageManifest bundles the entries plus accessor helpers so
// consumers don't have to rebuild the lookup maps themselves.
export interface BuiltinPageManifest {
  entries: BuiltinPageManifestEntry[];
  /** Slug → entry. */
  bySlug: Record<string, BuiltinPageManifestEntry>;
}
