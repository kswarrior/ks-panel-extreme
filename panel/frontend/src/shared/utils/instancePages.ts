// Built-in instance sub-pages. The list is now sourced from the manifest
// at ../features/builtin-pages — each built-in page (Home, Files, Network, Terminal,
// Settings, Env, Automation, Processes, Metrics, Ports, Backups, Audit)
// owns its own TSX file in ./builtin-pages/ and exports a BuiltinPageManifest
// record. This file imports them and exposes the legacy BUILTIN_PAGES /
// BUILTIN_ICON_NAMES / BUILTIN_SLUG_TO_COMPONENT aliases so existing
// callers (TemplateForm, InstanceForm, …) don't have to change just to
// consume the metadata. NEW CONSUMERS should reach for the manifest
// directly via `import { BUILTIN_PAGE_MANIFEST } from '@/features/builtin-pages'`.
import {
  BUILTIN_PAGE_MANIFEST,
  type BuiltinPageManifestEntry,
} from '@/features/builtin-pages';

// Backwards-compat alias. Kept for the handful of callers that already
// import DEFAULT_INSTANCE_PAGES; the resolved shape matches the prior
// BuiltinPageDef exactly so existing destructure patterns work.
export interface BuiltinPageDef {
  slug: string;
  defaultLabel: string;
  /** true = this page always uses its built-in component (Home/Files/…).
      false = the template can swap the slug path (terminal→console) without
      losing the built-in component (it just routes a different path). */
  fixed?: boolean;
}

export const BUILTIN_PAGES: BuiltinPageDef[] = BUILTIN_PAGE_MANIFEST.entries.map((e) => ({
  slug: e.slug,
  defaultLabel: e.name,
  fixed: e.fixed,
}));

// Backwards-compat alias — TemplateForm / older code import this name.
export const DEFAULT_INSTANCE_PAGES: BuiltinPageDef[] = BUILTIN_PAGES;

// BUILTIN_SLUG_TO_COMPONENT maps a builtin slug → the component slug used
// by the router. When a template renames "terminal"→"console", the router
// needs to mount the Terminal component *at* /console (the path the
// sidebar links to). The slug itself is the component identifier here;
// `slugToComponent()` and the dynamic-page resolver both look up the
// actual React component through the manifest.
export const BUILTIN_SLUG_TO_COMPONENT: Record<string, string> = Object.fromEntries(
  BUILTIN_PAGE_MANIFEST.entries.map((e) => [e.slug, e.slug]),
);

// ResolvedNavEntry is one row of the per-instance sidebar: where it
// links, what label to render, and either an icon-name (looked up by the
// Sidebar's Icons registry) or a raw SVG string. `iconKind === 'svg'`
// means `iconSvg` holds inline <path>/<g>/etc. markup the sidebar should
// drop inside a <svg> shell. Built-in pages now go through the same
// `iconSvg` path so the manifest's inner markup is what the sidebar
// renders — same render path for built-ins and template-custom icons.
export interface ResolvedNavEntry {
  to: string;
  label: string;
  end: boolean;
  iconKind: 'builtin' | 'svg';
  iconName?: string;
  iconSvg?: string;
}

// resolveInstanceNav applies the template's `pages` overrides and
// returns the rendered list.
//
// EMPTY-BY-DEFAULT SEMANTICS (with the Home carve-out): when a template
// has no `pages` spec at all (or `spec.pages` is an empty array), only
// Home ('.') is shown — the instance overview always renders, otherwise
// the operator lands on a blank instance with no identity / status /
// install / actions. Every other built-in (Files, Network, Terminal, …)
// must be explicitly opted into by listing it in spec.pages. The legacy
// auto-whitelist that filled the sidebar with every built-in is gone.
//
// When spec.pages is defined (non-empty), it acts as the whitelist/override:
//   - be builtin: { slug: "files", enabled: true, label: "Files", original_slug: "files" }
//   - disable builtin: { slug: "terminal", enabled: false }
//   - rename:  { slug: "console", original_slug: "terminal", label: "Console" }
//   - customise icon: { icon_svg: "<path.../>" }
//   - be custom: { slug: "my-page", kind: "custom", label: "My Page", content: {...} }
//
// Home '.' is auto-included at the front of every nav unless explicitly
// disabled (`{ slug: '.', enabled: false }`). A template that lists Home
// explicitly just uses that row verbatim — no duplication.
export function resolveInstanceNav(spec: Record<string, any> | null | undefined): ResolvedNavEntry[] {
  const pages = Array.isArray(spec?.pages) ? (spec!.pages as any[]).slice() : [];
  const entries: ResolvedNavEntry[] = [];
  const usedSlugs = new Set<string>();

  // If the template author explicitly disabled Home, honour that and skip
  // the auto-include.
  const homeRow = pages.find((p) => p && typeof p === 'object' && p.slug === '.');
  const homeExplicitlyDisabled = !!homeRow && homeRow.enabled === false;

  // Auto-prepend the synthetic Home row when the template has no
  // explicit row for '.'. When spec.pages exists but doesn't list Home,
  // we still inject a default Home row so the operator always has a
  // landing page.
  if (!homeRow && !homeExplicitlyDisabled) {
    const homeEntry = BUILTIN_PAGE_MANIFEST.bySlug['.'];
    if (homeEntry) {
      entries.push({
        to: '.',
        label: homeEntry.name,
        end: true,
        iconKind: 'svg',
        iconName: homeEntry.iconName,
        iconSvg: homeEntry.iconSvg,
      });
      usedSlugs.add('.');
    }
  }

  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;

    const slug = String(p.slug).trim();
    if (!slug || usedSlugs.has(slug)) continue;

    const isBuiltin = p.kind !== 'custom';
    const isEnabled = p.enabled !== false;
    if (!isEnabled) continue;

    let defaultLabel = slug;
    let manifestIconName = 'Files';
    let manifestIconSvg = '';
    let originalSlug = p.original_slug || slug;

    if (isBuiltin) {
      const manifestEntry = BUILTIN_PAGE_MANIFEST.bySlug[originalSlug];
      if (manifestEntry) {
        defaultLabel = manifestEntry.name;
        manifestIconName = manifestEntry.iconName;
        manifestIconSvg = manifestEntry.iconSvg;
      }
    }

    const customIcon = typeof p.icon_svg === 'string' ? p.icon_svg.trim() : '';
    const customLabel = typeof p.label === 'string' ? p.label.trim() : '';

    entries.push({
      to: slug,
      label: customLabel !== '' ? customLabel : defaultLabel,
      end: slug === '.',
      // Always render through the svg shell now: built-in icons go
      // through the manifest's iconSvg (same shell as custom icons),
      // so the sidebar has a single rendering path for both flavours.
      iconKind: 'svg',
      iconName: manifestIconName,
      iconSvg: customIcon !== '' ? customIcon : manifestIconSvg,
    });
    usedSlugs.add(slug);
  }

  return entries;
}

// slugToComponent maps a resolved sidebar slug → the manifest's component
// name (a string used by InstanceDynamicPage to look up the React
// component). Kept as the legacy string-returning interface so callers
// that already destructure on 'home' | 'files' | … keep working. The
// actual resolution logic now lives in the manifest's getBuiltinComponent
// helper, which handles renamed slugs via the spec's `original_slug`.
//
// Home ('.') is always resolvable to its built-in component unless the
// template explicitly disabled it. The other built-ins still require an
// explicit spec row to resolve (empty-by-default).
export function slugToComponent(slug: string, spec: Record<string, any> | null | undefined): string | null {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];

  // Renamed built-in: spec row whose slug matches AND has original_slug.
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.slug === 'string' && p.slug === slug && typeof p.original_slug === 'string') {
      if (p.enabled === false) return null;
      return BUILTIN_SLUG_TO_COMPONENT[p.original_slug] ?? null;
    }
  }

  // Direct built-in match: spec row whose slug matches AND isn't custom.
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (p.kind !== 'custom' && typeof p.slug === 'string' && p.slug === slug) {
      if (p.enabled === false) return null;
      return BUILTIN_SLUG_TO_COMPONENT[slug] ?? null;
    }
  }

  // Home is special: always resolvable unless explicitly disabled.
  if (slug === '.') return BUILTIN_SLUG_TO_COMPONENT['.'] ?? null;

  if (BUILTIN_SLUG_TO_COMPONENT[slug]) return BUILTIN_SLUG_TO_COMPONENT[slug];
  return null;
}

// isCustomPage checks if a resolved slug refers to a custom page (with
// its own content) rather than a built-in component.
export function isCustomPage(slug: string, spec: Record<string, any> | null | undefined): boolean {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  return pages.some((p: any) => p && typeof p === 'object' && p.kind === 'custom' && p.slug === slug);
}

// getEnabledPages returns the list of enabled page slugs from the spec.
// Used by the backend to validate page actions.
//
// EMPTY-BY-DEFAULT: when the template has no `pages` spec, the enabled
// list is empty (not "all built-ins"). The template author opts in by
// listing every page they want exposed.
export function getEnabledPages(spec: Record<string, any> | null | undefined): string[] {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];

  if (!spec?.pages || !Array.isArray(spec.pages) || spec.pages.length === 0) {
    return [];
  }

  return pages
    .filter((p: any) => p && typeof p === 'object' && p.slug && p.enabled !== false)
    .map((p: any) => String(p.slug).trim())
    .filter(Boolean);
}

// isPageAllowed checks if a slug is explicitly allowed (enabled) in the
// template's spec. This is the gatekeeper for both sidebar display AND
// direct URL access.
//
// EMPTY-BY-DEFAULT (non-Home): no spec.pages → only Home ('.') is
// allowed. The Home page is the instance overview — it must always render
// even on legacy / empty templates so operators can see the instance's
// identity, status, lifecycle and template actions. Every other built-in
// slug (/files, /terminal, …) returns "not part of this instance's
// template" until the template author opts in by adding the page to
// spec.pages. A template author can still disable Home explicitly by
// listing `{ slug: '.', enabled: false }` — that overrides the implicit
// allow.
export function isPageAllowed(slug: string, spec: Record<string, any> | null | undefined): boolean {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];

  // No spec.pages at all → only Home ('.') is implicitly allowed.
  if (!spec?.pages || !Array.isArray(spec.pages) || spec.pages.length === 0) {
    return slug === '.';
  }

  // spec.pages exists: any explicit row for this slug wins. Built-in
  // Home '.' is the only built-in allowed without an explicit row.
  const hit = pages.find((p: any) =>
    p && typeof p === 'object' && p.slug === slug,
  );
  if (!hit) {
    return slug === '.';
  }
  if (hit.kind === 'custom') return hit.enabled !== false;
  return hit.enabled !== false;
}

// PageContent describes custom content rendered by CustomPageView.
type PageContentType = 'html' | 'markdown' | 'blocks';
export interface PageContent {
  type: PageContentType;
  /** for type=html: raw HTML string. */
  html?: string;
  /** for type=markdown: raw markdown. */
  markdown?: string;
  /** for type=blocks: JSON-encoded array of BlockRow (visual studio). */
  blocks?: string;
  /** Persisted executable actions authored with this page (parsed from the
   *  spec row's `actions`). Empty when the page defines none. */
  actions?: import('@/features/instance-pages/types/instancePage').PageActionDef[];
}

// parseSpecActions normalises a spec page row's `actions` field — it may be
// a JSON-encoded string (legacy) or an inline array (LinkInstancePageHandler
// writes an inline array) — into PageActionDef[] or undefined.
function parseSpecActions(raw: unknown): PageContent['actions'] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return undefined;
    try { list = JSON.parse(raw); } catch { return undefined; }
  }
  if (!Array.isArray(list)) return undefined;
  const defs = list.filter((a): a is NonNullable<PageContent['actions']>[number] =>
    !!a && typeof a === 'object' && typeof (a as any).name === 'string' && typeof (a as any).type === 'string',
  );
  return defs.length > 0 ? defs : undefined;
}

// getPageContent returns the custom content payload for a resolved slug.
export function getPageContent(slug: string, spec: Record<string, any> | null | undefined): PageContent | null {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  const p = pages.find((p: any) => p && typeof p === 'object' && p.slug === slug && p.kind === 'custom');
  if (!p) return null;
  return {
    type: (['html', 'markdown', 'blocks'].includes(p.content_type) ? p.content_type : 'markdown') as PageContentType,
    html: typeof p.content_html === 'string' ? p.content_html : undefined,
    markdown: typeof p.content_markdown === 'string' ? p.content_markdown : undefined,
    blocks: typeof p.content_blocks === 'string' ? p.content_blocks : undefined,
    actions: parseSpecActions(p.actions),
  };
}

// Re-export the manifest for callers that want the new rich shape
// (iconSvg + component reference + name) directly. Kept as a type-only
// re-export + the constant so existing destructure patterns on the legacy
// BUILTIN_PAGES / BUILTIN_ICON_NAMES constants keep working.
export { BUILTIN_PAGE_MANIFEST } from '@/features/builtin-pages';
export type { BuiltinPageManifestEntry };
