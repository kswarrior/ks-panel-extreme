// Instance page resolution — pure custom-page semantics.

import { parsePageComponents, type PageComponentDef } from '@/features/instance-pages/types/instancePage';
//
// The legacy built-in React pages (Home / Files / Network / Terminal / …)
// were removed from the frontend bundle: every instance sub-page is now a
// CUSTOM page row in the template/instance spec (`spec.pages`), authored in
// the Instance Page Studio or imported into it.
//
// This module is the single source of truth for:
//   • resolveInstanceNav — the per-instance sidebar entries from spec.pages
//   • isPageAllowed      — the slug gatekeeper (sidebar + direct URL)
//   • getPageContent     — the html/markdown/blocks payload CustomPageView renders
//   • getEnabledPages    — the enabled-slug list (used for validation)
//
// EMPTY-BY-DEFAULT: a template with no `pages` array exposes no sidebar and
// no routes. Operators opt in by importing pages (Home uses slug "." to
// render at the instance index route).

export interface ResolvedNavEntry {
  to: string;
  label: string;
  end: boolean;
  iconKind: 'svg';
  iconName?: string;
  iconSvg?: string;
  iconColor?: string;
}

// Fallback icon used when a spec row carries no icon_svg — matches the
// generic placeholder the template editor shows.
const FALLBACK_ICON = '<circle cx="12" cy="12" r="9" />';

// BUILTIN_PAGE_SLUGS are native instance routes that render without a
// spec.pages row (ports / sftp / snapshots / overview in InstanceDetail).
// `terminal` is intentionally absent — it stays whitelist-gated like every
// other custom page, so it resolves through isPageAllowed below.
export const BUILTIN_PAGE_SLUGS = ['overview', 'ports', 'sftp', 'snapshots'];

// normalizePageSlug trims a user-entered page slug/URL into canonical form:
// leading/trailing slashes and whitespace go away ("  /overview/ " →
// "overview"). Empty (or non-string) input normalises to ''.
export function normalizePageSlug(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/^\/+|\/+$/g, '').trim();
}

// resolveRedirectTarget validates a configured landing slug (template
// `home_page`, controls `more_page`) against the instance spec. Returns the
// canonical slug when it renders something, or null to keep default
// behaviour. Builtins always resolve; custom slugs must be allow-listed.
// Unknown/disabled slugs fall back instead of landing on a dead page.
export function resolveRedirectTarget(
  raw: unknown,
  spec: Record<string, any> | null | undefined,
): string | null {
  const slug = normalizePageSlug(raw);
  if (!slug || slug === '.') return null;
  if (BUILTIN_PAGE_SLUGS.includes(slug)) return slug;
  if (isPageAllowed(slug, spec)) return slug;
  return null;
}

// subPagesOf normalises a spec row's `sub_pages` field into a list of
// sub-page entries. Multi-page library pages keep their extra pages INSIDE
// the parent row (effective URL `<slug>/<path>`, e.g. files/edit) instead of
// as sibling spec rows, so the tab bar shows only the parent page. The field
// may be an inline array (spec rows written by the import flow / form
// round-trip) or a JSON-encoded string (legacy/library shape); corrupt
// payloads degrade to an empty list.
function subPagesOf(row: any): any[] {
  if (!row || typeof row !== 'object') return [];
  let list: unknown = row.sub_pages;
  if (typeof list === 'string') {
    const trimmed = list.trim();
    if (!trimmed) return [];
    try {
      list = JSON.parse(trimmed);
      // Handle double-encoded JSON strings
      if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { return []; }
      }
    } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list.filter(
    (s: any) => !!s && typeof s === 'object' && typeof s.path === 'string' && String(s.path).trim() !== '',
  );
}

// splitSubSlug splits an effective sub-page slug ("<parent>/<path>") into its
// parent slug and sub path at the FIRST slash. Returns null for top-level
// slugs (no slash).
function splitSubSlug(slug: string): { parent: string; path: string } | null {
  const idx = slug.indexOf('/');
  if (idx <= 0 || idx === slug.length - 1) return null;
  return { parent: slug.slice(0, idx), path: slug.slice(idx + 1) };
}

// findSubPageEntry resolves `<parent>/<path>` against parent rows carrying
// nested sub_pages. Only enabled parents expose their sub-pages. Returns null
// when the slug is not a sub-page of any enabled row.
function findSubPageEntry(slug: string, spec: Record<string, any> | null | undefined): { parent: any; sub: any } | null {
  const parts = splitSubSlug(slug);
  if (!parts) return null;
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;
    if (String(p.slug).trim() !== parts.parent) continue;
    if (p.enabled === false) continue;
    const sub = subPagesOf(p).find(
      (s) => s && typeof s.path === 'string' && String(s.path).trim() === parts.path,
    );
    if (sub) return { parent: p, sub };
  }
  return null;
}

function labelFor(slug: string, row?: Record<string, any>): string {
  const custom = row && typeof row.label === 'string' ? row.label.trim() : '';
  if (custom !== '') return custom;
  if (slug === '.') return 'Home';
  // Legacy slash-slug rows (files/edit) fall back to their own segment.
  const last = slug.split('/').pop() ?? slug;
  return last || slug;
}

// resolveInstanceNav applies the spec's `pages` rows and returns the rendered
// list. Every enabled TOP-LEVEL row becomes an entry; order follows the array
// so the template author controls the tab serial. Rows may rename their URL
// path via original_slug (legacy) — the nav always links to the CURRENT slug.
// Sub-pages (rows with a slash slug, or nested sub_pages) are NOT tabs: they
// live INSIDE their parent page and stay reachable by URL only, so e.g.
// /files/edit keeps the "Files" tab highlighted (NavLink prefix match).
export function resolveInstanceNav(spec: Record<string, any> | null | undefined): ResolvedNavEntry[] {
  const pages = Array.isArray(spec?.pages) ? (spec!.pages as any[]) : [];
  const entries: ResolvedNavEntry[] = [];
  const usedSlugs = new Set<string>();

  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;
    const slug = String(p.slug).trim();
    if (!slug || usedSlugs.has(slug)) continue;
    if (p.enabled === false) continue;
    // Sub-page rows (legacy flattened "files/edit" rows) belong to their
    // parent page — never render them as separate top-level tabs.
    if (slug.includes('/')) continue;

    const customIcon = typeof p.icon_svg === 'string' ? p.icon_svg.trim() : '';
    const customColor = typeof (p as any).icon_color === 'string' ? (p as any).icon_color.trim() : '';
    entries.push({
      to: slug,
      label: labelFor(slug, p),
      end: slug === '.',
      iconKind: 'svg',
      iconSvg: customIcon !== '' ? customIcon : FALLBACK_ICON,
      iconColor: customColor !== '' ? customColor : undefined,
    });
    usedSlugs.add(slug);
  }

  return entries;
}

// isPageAllowed checks whether `slug` is explicitly allowed (enabled) in the
// spec. This is the gatekeeper for both sidebar display AND direct URL access.
// Legacy renamed rows keep granting access through original_slug so old
// templates don't break after the conversion. Sub-pages of enabled parents
// ("<parent>/<path>", e.g. files/edit) are allowed through their parent row
// only when the sub-page is explicitly listed in the parent's sub_pages array
// — matching the backend's findSpecPageRow whitelist. The previous fallback
// that allowed any "<parent>/<anything>" under an enabled parent was removed
// to keep frontend and backend in lock-step (fail closed).
export function isPageAllowed(slug: string, spec: Record<string, any> | null | undefined): boolean {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  const allowed = pages.some((p: any) => {
    if (!p || typeof p !== 'object' || !p.slug) return false;
    if (p.enabled === false) return false;
    if (typeof p.slug === 'string' && String(p.slug).trim() === slug) return true;
    // Legacy renamed builtin: { slug: "console", original_slug: "terminal" }
    if (
      typeof p.original_slug === 'string' &&
      String(p.original_slug).trim() === slug
    ) {
      // Allowed only when the row actually carries content — the built-in
      // component it used to resolve to no longer exists, so an empty row
      // would render a blank page.
      return typeof p.content_type === 'string' && p.content_type !== '';
    }
    return false;
  });
  if (allowed) return true;
  // Nested sub-page: allowed when its parent page is enabled and lists it.
  if (findSubPageEntry(slug, spec) !== null) return true;
  return false;
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
  /** Reusable UI components for {{component:name}} substitution. */
  components?: import('@/features/instance-pages/types/instancePage').PageComponentDef[];
  /** Page-level configure vars for {{config:NAME}} substitution. */
  configure?: import('@/features/instance-pages/types/instancePage').PageConfigureVar[];
  /** Per-template values for those vars, keyed by var name. */
  config?: Record<string, string>;
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

// parseSpecComponents normalises a spec page row's `components` field — it
// may be a JSON-encoded string (InstancePage DB row) or an inline array
// (template spec written by LinkInstancePageHandler / TemplateForm serialize)
// into PageComponentDef[] or undefined. Handles double-encoded strings too.
function parseSpecComponents(raw: unknown): PageContent['components'] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      list = JSON.parse(trimmed);
      if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { return undefined; }
      }
    } catch { return undefined; }
  }
  if (!Array.isArray(list)) return undefined;
  const defs = list.filter((c): c is NonNullable<PageContent['components']>[number] =>
    !!c && typeof c === 'object' && typeof (c as any).name === 'string' && typeof (c as any).type === 'string',
  );
  return defs.length > 0 ? defs : undefined;
}

function parseSpecConfigure(raw: unknown): PageContent['configure'] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      list = JSON.parse(trimmed);
      if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { return undefined; }
      }
    } catch { return undefined; }
  }
  if (!Array.isArray(list)) return undefined;
  const defs = list.filter((c): c is NonNullable<PageContent['configure']>[number] =>
    !!c && typeof c === 'object' && typeof (c as any).name === 'string',
  );
  return defs.length > 0 ? defs : undefined;
}

function parseSpecConfigValues(raw: unknown): PageContent['config'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
    if (k) out[k] = String(v ?? '');
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

// hasAnyContent reports whether a spec row carries renderable content.
function hasAnyContent(p: any): boolean {
  return (
    (typeof p.content_type === 'string' && p.content_type !== '') ||
    (typeof p.content_html === 'string' && p.content_html.trim() !== '') ||
    (typeof p.content_markdown === 'string' && p.content_markdown.trim() !== '') ||
    (typeof p.content_blocks === 'string' && p.content_blocks.trim() !== '')
  );
}

// findPageRow returns the first enabled spec row whose slug (or
// original_slug) matches, preferring rows that actually carry content.
function findPageRow(slug: string, spec: Record<string, any> | null | undefined): any | null {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  let fallback: any = null;
  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;
    if (p.enabled === false) continue;
    const slugHit =
      (typeof p.slug === 'string' && String(p.slug).trim() === slug) ||
      (typeof p.original_slug === 'string' && String(p.original_slug).trim() === slug);
    if (!slugHit) continue;
    if (hasAnyContent(p)) return p;
    if (!fallback) fallback = p;
  }
  return fallback;
}

// pagePayloadFromRow builds the PageContent payload from a top-level spec row.
// Supports components as either JSON string or inline array (React-like reusable
// blocks that load on main page and propagate to sub-pages).
function pagePayloadFromRow(p: any): PageContent {
  const type: PageContentType = ['html', 'markdown', 'blocks'].includes(p.content_type)
    ? p.content_type
    // No explicit content_type: infer from whichever field carries data.
    : p.content_html ? 'html'
    : p.content_blocks ? 'blocks'
    : 'markdown';
  return {
    type,
    html: typeof p.content_html === 'string' ? p.content_html : undefined,
    markdown: typeof p.content_markdown === 'string' ? p.content_markdown : undefined,
    blocks: typeof p.content_blocks === 'string' ? p.content_blocks : undefined,
    actions: parseSpecActions(p.actions),
    components: parseSpecComponents(p.components),
    configure: parseSpecConfigure(p.configure),
    config: parseSpecConfigValues(p.config ?? (p as any).configure_values),
  };
}

// pagePayloadFromSub builds the PageContent payload from one nested sub-page
// entry (no actions of its own — actions live on the parent row). Components
// also live on the parent row and are passed in as the second argument.
function pagePayloadFromSub(s: any, parentComponents?: PageComponentDef[], parentConfigure?: PageContent['configure'], parentConfig?: PageContent['config']): PageContent {
  const type: PageContentType = ['html', 'markdown', 'blocks'].includes(s.content_type)
    ? s.content_type
    : s.content_html ? 'html'
    : s.content_blocks ? 'blocks'
    : 'markdown';
  return {
    type,
    html: typeof s.content_html === 'string' ? s.content_html : undefined,
    markdown: typeof s.content_markdown === 'string' ? s.content_markdown : undefined,
    blocks: typeof s.content_blocks === 'string' ? s.content_blocks : undefined,
    components: parentComponents,
    configure: parentConfigure,
    config: parentConfig,
  };
}

// getPageContent returns the custom content payload for a resolved slug, or
// null when the slug has no page row. Slugs with a slash resolve through the
// parent row's nested sub_pages ("<parent>/<path>"); legacy flattened rows
// (slug "files/edit") still match directly first. Parent components propagate
// to sub-pages so a single {{component:name}} definition works React-like on
// both main and sub-page routes.
export function getPageContent(slug: string, spec: Record<string, any> | null | undefined): PageContent | null {
  const p = findPageRow(slug, spec);
  if (p) return pagePayloadFromRow(p);
  const hit = findSubPageEntry(slug, spec);
  if (!hit) return null;
  // Pass parent's components/configure to sub-page payload (handles string or array).
  const parentComps = parseSpecComponents(hit.parent?.components);
  const parentConfigure = parseSpecConfigure(hit.parent?.configure);
  const parentConfig = parseSpecConfigValues(hit.parent?.config ?? (hit.parent as any)?.configure_values);
  return pagePayloadFromSub(hit.sub, parentComps, parentConfigure, parentConfig);
}

// getPageLabel returns the display label for a resolved slug: the row's
// label, a sub-page's name ("Editor" for files/edit), "Home" for ".", or
// null when nothing matches (caller falls back to the slug).
export function getPageLabel(slug: string, spec: Record<string, any> | null | undefined): string | null {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;
    if (p.enabled === false) continue;
    if (String(p.slug).trim() !== slug) continue;
    const custom = typeof p.label === 'string' ? p.label.trim() : '';
    if (custom !== '') return custom;
    break;
  }
  const hit = findSubPageEntry(slug, spec);
  if (hit) {
    const name = hit.sub && typeof hit.sub.name === 'string' ? hit.sub.name.trim() : '';
    if (name !== '') return name;
  }
  if (slug === '.') return 'Home';
  return null;
}

// getEnabledPages returns the list of enabled page slugs from the spec,
// including nested sub-pages ("<parent>/<path>"). Sub-page rows of enabled
// parents count as their parent's page.
// EMPTY-BY-DEFAULT: when the template has no `pages` spec, the enabled list
// is empty. Template authors opt in by importing pages.
export function getEnabledPages(spec: Record<string, any> | null | undefined): string[] {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];

  if (!spec?.pages || !Array.isArray(spec.pages) || spec.pages.length === 0) {
    return [];
  }

  return pages
    .filter((p: any) => p && typeof p === 'object' && p.slug && p.enabled !== false)
    .flatMap((p: any) => {
      const slug = String(p.slug).trim();
      if (!slug) return [];
      if (slug.includes('/')) return []; // legacy flattened row — covered by its parent
      const subs = subPagesOf(p)
        .map((s) => (s && typeof s.path === 'string' && String(s.path).trim() !== '' ? `${slug}/${String(s.path).trim()}` : ''))
        .filter(Boolean);
      return [slug, ...subs];
    })
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);
}
