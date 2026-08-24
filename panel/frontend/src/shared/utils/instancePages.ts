// Instance page resolution — pure custom-page semantics.
//
// The legacy built-in React pages (Home / Files / Network / Terminal / …)
// were removed from the frontend bundle: every instance sub-page is now a
// CUSTOM page row in the template/instance spec (`spec.pages`), authored by
// importing definitions from the Instance Pages library
// (/test/ks-panel/instance_pages/pages/*.json → GET /api/instance-pages/).
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
}

// Fallback icon used when a spec row carries no icon_svg — matches the
// generic placeholder the template editor shows.
const FALLBACK_ICON = '<circle cx="12" cy="12" r="9" />';

function labelFor(slug: string, row?: Record<string, any>): string {
  const custom = row && typeof row.label === 'string' ? row.label.trim() : '';
  if (custom !== '') return custom;
  if (slug === '.') return 'Home';
  // Sub-page rows (files/edit) fall back to their own segment so the tab
  // shows "edit", not the full path.
  const last = slug.split('/').pop() ?? slug;
  return last || slug;
}

// resolveInstanceNav applies the spec's `pages` rows and returns the rendered
// list. Every enabled row becomes an entry; order follows the array so the
// template author controls the tab serial. Rows may rename their URL path via
// original_slug (legacy) — the nav always links to the CURRENT slug.
export function resolveInstanceNav(spec: Record<string, any> | null | undefined): ResolvedNavEntry[] {
  const pages = Array.isArray(spec?.pages) ? (spec!.pages as any[]) : [];
  const entries: ResolvedNavEntry[] = [];
  const usedSlugs = new Set<string>();

  for (const p of pages) {
    if (!p || typeof p !== 'object' || !p.slug) continue;
    const slug = String(p.slug).trim();
    if (!slug || usedSlugs.has(slug)) continue;
    if (p.enabled === false) continue;

    const customIcon = typeof p.icon_svg === 'string' ? p.icon_svg.trim() : '';
    entries.push({
      to: slug,
      label: labelFor(slug, p),
      end: slug === '.',
      iconKind: 'svg',
      iconSvg: customIcon !== '' ? customIcon : FALLBACK_ICON,
    });
    usedSlugs.add(slug);
  }

  return entries;
}

// isPageAllowed checks whether `slug` is explicitly allowed (enabled) in the
// spec. This is the gatekeeper for both sidebar display AND direct URL access.
// Legacy renamed rows keep granting access through original_slug so old
// templates don't break after the conversion.
export function isPageAllowed(slug: string, spec: Record<string, any> | null | undefined): boolean {
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  return pages.some((p: any) => {
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

// getPageContent returns the custom content payload for a resolved slug, or
// null when the slug has no page row.
export function getPageContent(slug: string, spec: Record<string, any> | null | undefined): PageContent | null {
  const p = findPageRow(slug, spec);
  if (!p) return null;
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
  };
}

// getEnabledPages returns the list of enabled page slugs from the spec.
// EMPTY-BY-DEFAULT: when the template has no `pages` spec, the enabled list
// is empty. Template authors opt in by importing pages.
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
