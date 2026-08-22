import create from 'zustand';
import type { Theme, ThemeKey, ThemeCustomCSS } from '@/features/themes/types/theme';
import { DEFAULT_THEME } from '@/theme/defaults';
import { AREAS, CATALOGUE, areaFor, type AreaId } from '@/features/instance-pages/types/pageregistry';
import {
  fetchThemesStore,
  assignGlobalTheme,
  createGlobalTheme as createGlobalThemeApi,
  updateGlobalTheme as updateGlobalThemeApi,
  deleteGlobalTheme as deleteGlobalThemeApi,
  type StoredTheme,
} from '@/features/themes/api/themes';

// ------------------------------------------------------------------
// Persistence
// ------------------------------------------------------------------
// Themes live in localStorage so the panel remembers customisation across
// sessions without a backend round-trip. The backend wiring is left as a
// future extension point: swapping localStorage for an authenticated
// `/api/themes` CRUD is a drop-in replacement for the load/save
// helpers below.
const STORAGE_KEY = 'kspanel.themes';
const ACTIVE_KEY = 'kspanel.themes.active';

// An assignment scope is either an area id (e.g. 'admin') or a page id
// (e.g. 'admin.users'). The key encodes which so the resolver only needs a
// single map to answer "which theme is in effect for this route?". Keys
// of the form `area:<id>` apply to every page in that area; `page:<id>`
// are page-level overrides that win over the area default.
export type AreaScope = `area:${AreaId}`;
export type PageScope = `page:${string}`;
export type Scope = AreaScope | PageScope;

interface PersistShape {
  themes: Theme[];
  // Migration: older builds persisted a single global `activeId`. We keep
  // it around only to seed assignments for an area default on first load so
  // existing installs don't suddenly look un-themed after upgrade.
  activeId?: string;
  // The persisted assignments map. Always present after loadPersisted()
  // normalizes an on-disk shape (empty {} when none was saved), so every
  // downstream consumer can treat it as a non-nullable map and the
  // resolver never has to handle `undefined` at the call site.
  assignments: Partial<Record<Scope, string>>;
}

// A/PAGE_SCOPE prefix helpers keep the callers terse while staying typed.
export const scopeForArea = (id: AreaId): AreaScope => `area:${id}`;
export const scopeForPage = (id: string): PageScope => `page:${id}`;

function loadPersisted(): PersistShape {
  if (typeof window === 'undefined') return emptyPersist();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersist();
    const parsed = JSON.parse(raw) as PersistShape;
    // Make sure the builtin 'default' theme is always present and always
    // current — even if a previous build of the app persisted an older
    // shape of DEFAULT_THEME, the seeded copy wins so the panel never
    // loses its built-in baseline.
    const others = (parsed.themes || [])
      .filter((t) => t.id !== 'default')
      // Forward-migrate custom themes persisted before any newer theme
      // section was added: backfill every section from DEFAULT so the
      // studio + applier never read undefined for older themes.
      .map((t) => ({
        ...t,
        card: (() => {
          const c = { ...DEFAULT_THEME.card, ...(t.card || {}) };
          if (t.card?.gap != null && t.card.gap_h == null && t.card.gap_v == null) {
            c.gap_h = t.card.gap;
            c.gap_v = t.card.gap;
          }
          return c;
        })(),
        button: { ...DEFAULT_THEME.button, ...(t.button || {}) },
        tabs: { ...DEFAULT_THEME.tabs, ...(t.tabs || {}) },
        loading: { ...DEFAULT_THEME.loading, ...(t.loading || {}) },
        dropdowns: { ...DEFAULT_THEME.dropdowns, ...(t.dropdowns || {}) },
        // customCSS was added later — backfill so an old persisted theme
        // (saved before the Custom CSS tab existed) still has a well-shaped
        // { global: '', scopes: {} } and the applier never reads undefined.
        customCSS: migrateCustomCSS((t as any).customCSS),
      }));
    const themes = [DEFAULT_THEME, ...others];

    // 1. Copy forward any properly-shaped assignment map.
    // 2. Prune assignments whose theme id no longer exists (e.g. a deleted
    //    custom theme) so the resolver never shadow-walks into the default.
    // 3. Migration: if there is no assignment map but a legacy global
    //    `activeId` exists, treat it as an area default for every area so a
    //    previously-"activated" custom theme keeps showing on all pages.
    let assignments: Partial<Record<Scope, string>> = {};
    const ids = new Set(themes.map((t) => t.id));
    if (parsed.assignments) {
      for (const [scope, themeId] of Object.entries(parsed.assignments)) {
        if (themeId && ids.has(themeId)) assignments[scope as Scope] = themeId;
      }
    } else if (parsed.activeId && ids.has(parsed.activeId) && parsed.activeId !== 'default') {
      for (const a of AREAS) assignments[scopeForArea(a.id)] = parsed.activeId as string;
    }
    return { themes, assignments };
  } catch {
    return emptyPersist();
  }
}

function emptyPersist(): PersistShape {
  return { themes: [DEFAULT_THEME], assignments: {} };
}

// migrateCustomCSS backfills the Custom CSS section onto a theme that was
// persisted/bootstrapped before the field existed. Accepts undefined, a
// partial object, or a full ThemeCustomCSS and ALWAYS returns a well-shaped
// { global: string, scopes: Record<string,string> } so the applier and the
// studio never read undefined. `scopes` entries whose value isn't a string
// are dropped so a corrupt persisted map can't break the CSS emitter.
function migrateCustomCSS(raw: unknown): ThemeCustomCSS {
  const base: ThemeCustomCSS = { ...DEFAULT_THEME.customCSS };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ThemeCustomCSS>;
  if (typeof r.global === 'string') base.global = r.global;
  if (r.scopes && typeof r.scopes === 'object') {
    const cleaned: Record<string, string> = {};
    for (const [scope, css] of Object.entries(r.scopes)) {
      if (typeof css === 'string' && scope) cleaned[scope] = css;
    }
    base.scopes = cleaned;
  }
  return base;
}

function persist(state: PersistShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // The ACTIVE_KEY shape is kept for external observers / debugging; it
    // reflects the area default that has the broadest reach (admin by
    // convention, else 'default').
    window.localStorage.setItem(ACTIVE_KEY, state.assignments?.['area:admin'] || 'default');
  } catch {
    // Quota-exceeded / disabled storage — theme memory just becomes
    // session-only. Failing silently keeps the panel UI responsive.
  }
}

// resolveThemeIdByRoute walks the assignment precedence for a given route:
//   1. an explicit page-level assignment for the page owning the route, then
//   2. an area-level default for the route's area, then
//   3. the built-in 'default' theme.
// The caller passes the assignments map + theme list so this stays a pure
// function (testable outside the store).
export function resolveThemeIdByRoute(
  pathname: string,
  assignments: Partial<Record<Scope, string>>,
): string {
  // Page-level override: find the catalog page whose matcher accepts the
  // pathname. The registry has no dependency on the store, so we import the
  // CATALOGUE statically at the top of this module — bundlers produce a
  // single module graph with no cycle and no runtime `require` (which would
  // throw in an ESM browser bundle).
  for (const p of CATALOGUE) {
    if (p.match(pathname, '')) {
      const tid = assignments[scopeForPage(p.id)];
      if (tid) return tid;
      break; // first matching page wins; fall through to area default
    }
  }
  const area = areaFor(pathname);
  if (area) {
    const tid = assignments[scopeForArea(area)];
    if (tid) return tid;
  }
  return 'default';
}

// ------------------------------------------------------------------
// Runtime application
// ------------------------------------------------------------------
// The theme is materialised onto the DOM by:
//   1. injecting a <style id="kspanel-theme-vars"> holding the resolved
//      CSS custom properties on :root and the surface-only overrides of
//      the .glass* utilities, and
//   2. stamping the background media/gradient node into the
//      #ks-theme-layer mount that Layout.tsx renders as the first child
//      of the app shell root.
//
// Keeping both artefacts restamped on every applyTheme() call (rather
// than mutating individual node attributes) keeps the code simple and
// idempotent — no diff logic required.

const STYLE_ID = 'kspanel-theme-vars';
const BG_ID = 'kspanel-theme-bg';
// Layout.tsx renders <div id="ks-theme-layer"> as the first child of the
// app shell root; the theme store injects the media/gradient/color node
// into it. Keeping it inside the layout (rather than appended to <body>)
// guarantees it sits within the root's stacking context so it actually
// paints behind Aurora + content — a body-level fixed layer would be
// occluded by the opaque layout root.
const LAYER_MOUNT_ID = 'ks-theme-layer';

// Cache for buildVars output: key = `${theme.id}|${pathname || ''}`
// Avoids regenerating the full ~200-line CSS string on every route change
// when the active theme hasn't actually changed.
const buildVarsCache = new Map<string, string>();

function buildBgLayer(theme: Theme): string {
  const bg = theme.background;
  // The layer always renders a full-bleed node. For color/gradient it's
  // a plain div carrying the fill; for image/video it's the media element
  // possibly wrapped for opacity/blur. The node is positioned to fill its
  // parent (#ks-theme-layer, which is absolute inset-0).
  const base = 'position:absolute;inset:0;width:100%;height:100%;';
  const blurFilter = bg.blur > 0 ? `filter:blur(${bg.blur}px);` : '';
  // Cap opacity to a sane number — the layer directly applies the
  // opacity (the backdrop is its own div, so it can't fade content),
  // but a stray NaN / string from an old theme would still pass through
  // and break the resulting `style=` attribute.
  const op = Math.max(0, Math.min(1, Number(bg.opacity) || 0));

  if (bg.type === 'image' && bg.image_url) {
    const rep = bg.repeat === 'repeat' ? 'repeat' : 'no-repeat';
    // Single quotes escaped so a value containing ' cannot break out of
    // the url('…') wrapper; this stays inside CSS (no innerHTML), so
    // no HTML-escape is required.
    const url = String(bg.image_url).replace(/'/g, "\\'");
    return `<div id="${BG_ID}" style="${base}opacity:${op};${blurFilter}background-image:url('${url}');background-position:${bg.position || 'center'};background-size:${bg.size || 'cover'};background-repeat:${rep};background-attachment:${bg.attachment};"></div>`;
  }
  if (bg.type === 'video' && bg.video_url) {
    // Build the <video><source> tree via the DOM API instead of inlining
    // the URL into an innerHTML template. The previous implementation did
    // `bg.video_url.replace(/"/g, '"')` — replacing `"` with `"` — which
    // was a literal no-op and left a URL containing `"` able to break
    // out of the src="…" attribute and inject markup.
    const wrap = document.createElement('div');
    wrap.id = BG_ID;
    wrap.style.cssText = `${base}opacity:${op};${blurFilter}overflow:hidden;`;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    const source = document.createElement('source');
    source.src = bg.video_url;
    video.appendChild(source);
    wrap.appendChild(video);
    return wrap.outerHTML;
  }
  if (bg.type === 'gradient' && bg.gradient) {
    return `<div id="${BG_ID}" style="${base}background-image:${bg.gradient};"></div>`;
  }
  // Solid colour — falls back to using the root's .kspanel-bg-overlay
  // background-color, so we render an empty (transparent) node only when a
  // media/gradient was actually set; otherwise clear the mount.
  return '';
}

// cardBgLayer produces the media/gradient layer expression for a card's
// background. Returns 'none' when the card uses a plain color (so the
// --ks-card-bg fill wins alone), or a url()/gradient expression for the
// image/gradient types. Opacity is encoded by stacking an rgba scrim
// *above* the media so the whole layer dims together — setting alpha on a
// CSS background-image directly isn't possible, so the scrim is the
// simplest portable approach.
function cardBgLayer(c: Theme['card']): string {
  if (c.bg_type === 'image' && c.bg_image) {
    const img = `url('${c.bg_image.replace(/'/g, "\\'")}')`;
    const opacity = Math.max(0, Math.min(1, c.bg_opacity));
    const scrim = 'rgba(0,0,0,' + (1 - opacity) + ')';
    // Combine the scrim + the tiled image as a single layered background.
    return scrim + ' linear-gradient(' + img + ', ' + img + ')';
  }
  if (c.bg_type === 'gradient' && c.bg_gradient) {
    return c.bg_gradient;
  }
  return 'none';
}

// dropdownBg resolves the fill for floating dropdown panels (the Themes
// "Apply to…" scope menu + the header profile menu). The goal is TRUE
// FROSTED GLASS — a LOW-alpha tint over a STRONG backdrop blur, so the
// card/page behind is visible but blurred and the menu text still reads
// crisp. Opacity is kept LOW on purpose: the backdrop-filter does the
// visual separating, NOT a solid fill. (A heavy/opaque fill here would
// look like a flat white sheet instead of glass.)
//
// Strategy:
//  - Baseline: a thin dark scrim `rgba(12,14,18,0.22)` — just enough to
//    deepen the glass over the page colour without hiding the blur.
//  - If the admin set a custom card colour we TINT toward it, re-emitting
//    its RGB at a low fixed alpha (0.20) so a custom card tone shows on the
//    dropdowns while they stay see-through frosted glass.
//  - Unparseable values fall back to the baseline.
function dropdownBg(cardBg: string): string {
  const BASELINE = 'rgba(12,14,18,0.22)';
  const v = (cardBg || '').trim();
  if (!v || v === 'none') return BASELINE;

  // rgba(255, 255, 255, 0.04) …
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/i);
  if (rgba) {
    const r = clamp255(rgba[1]);
    const g = clamp255(rgba[2]);
    const b = clamp255(rgba[3]);
    return `rgba(${r}, ${g}, ${b}, 0.20)`;
  }
  // #rgb / #rrggbb (#rrggbbaa folded to rgb only — alpha is forced below)
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.20)`;
    }
  }
  return BASELINE;
}

function clamp255(s: string): number {
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
}

// makeDropdownBg composes the `background-color` for .glass-dropdown /
// .ks-dropdown with the admin's bg_opacity multiplier baked into the alpha
// channel, so a faded backdrop doesn't ALSO fade the menu's text via an
// element-level `opacity:` rule (which was the prior behaviour — toggling
// the studio's "Backdrop opacity" slider greyed-out every dropdown row
// regardless of colour). For the 'color' backdrop type the opacity scales
// the existing rgba/hex alpha; for image/video/gradient backdrops the base
// fill stays a stable fallback behind the media layer (which carries the
// opacity separately), so we return it verbatim.
function makeDropdownBg(d: any | undefined): string {
  const opacity = Math.max(0, Math.min(1, d?.bg_opacity ?? 1));
  const v = String(d?.background ?? 'rgba(12,14,18,0.22)').trim();
  if (!v || v === 'none') return 'rgba(12,14,18,0.22)';
  // Only fold alpha for the colour backdrop — media backdrops layer their
  // own opacity via a scrim gradient in makeDropdownMedia().
  if ((d?.bg_type ?? 'color') === 'color') {
    const m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/i);
    if (m) {
      const aIn = m[4] != null ? parseFloat(m[4]) : 1;
      const aOut = Math.max(0, Math.min(1, aIn * opacity));
      return `rgba(${clamp255(m[1])},${clamp255(m[2])},${clamp255(m[3])},${aOut})`;
    }
    const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      let aIn = 1;
      if (h.length === 8) aIn = parseInt(h.slice(6, 8), 16) / 255;
      const aOut = Math.max(0, Math.min(1, aIn * opacity));
      return `rgba(${r},${g},${b},${aOut})`;
    }
  }
  return v;
}

// makeDropdownMedia composes the layered `background-image` for the
// dropdown media backdrop so bg_opacity fades the media via a scrim
// gradient overlay (rather than fading the entire element via
// `opacity:`). Returns 'none' for the 'color' backdrop so the
// `background-color` carries the fill alone. Video backdrops can't be
// painted by a CSS background-image — we surface them on a CSS var for a
// future React-side painter but emit 'none' here so the surface is still
// readable until that painter is added.
function makeDropdownMedia(d: any | undefined): string {
  const opacity = Math.max(0, Math.min(1, d?.bg_opacity ?? 1));
  const scrim = 'rgba(0,0,0,' + (1 - opacity) + ')';
  if (d?.bg_type === 'image' && d?.bg_image) {
    const img = `url('${String(d.bg_image).replace(/'/g, "\\'")}')`;
    return scrim + ' linear-gradient(' + img + ',' + img + ')';
  }
  if (d?.bg_type === 'gradient' && d?.bg_gradient) {
    return scrim + ' ' + String(d.bg_gradient);
  }
  // bg_type === 'video' or 'color' — surface the raw URL on the var so a
  // future in-DOM <video> painter can consume it; for now we render none
  // so the (still themed) background-color fills the panel.
  return 'none';
}

// ApplyOpts drives which custom CSS scopes the applier emits.
//
//   - `preview` = true → emit EVERY scope block (used by the Theme Studio's
//     live preview) so the admin sees their per-route CSS regardless of
//     the panel's current URL.
//   - `pathname` set → emit only the scopes whose area/page matches that
//     route (the production path: RouteThemeSync re-applies on every
//     navigation, so each route only paints its matching scopes).
//   - neither → no scopes are emitted (e.g. the module-load bootstrap,
//     which has no React context yet). `global` is always emitted.
//
// Passing BOTH is a caller bug; `preview` wins so the studio's "edit"
// path always shows the full picture.
export interface ApplyOpts {
  preview?: boolean;
  pathname?: string;
}

// matchingScopeCss walks the SAME page→area precedence as the theme-id
// resolver (resolveThemeIdByRoute) but collects CSS strings instead of a
// theme id. The admin's per-route CSS therefore lands only on the route
// whose scope matches — area:<id> for the route's area default, page:<id>
// for an explicit page override. Returns the matching blocks joined by
// blank lines (or '' when none match) so the caller can splice it into
// the theme stylesheet verbatim.
function matchingScopeCss(scopes: Record<string, string> | undefined, pathname: string): string {
  if (!scopes) return '';
  const out: string[] = [];
  // Page-level override: the first catalog page whose matcher accepts
  // the pathname wins (mirrors resolveThemeIdByRoute's first-match
  // semantics exactly).
  for (const p of CATALOGUE) {
    if (p.match(pathname, '')) {
      const css = scopes[scopeForPage(p.id)];
      if (css) out.push(`/* Custom CSS — page:${p.id} */\n${css}`);
      break;
    }
  }
  // Area-level default.
  const area = areaFor(pathname);
  if (area) {
    const css = scopes[scopeForArea(area)];
    if (css) out.push(`/* Custom CSS — area:${area} */\n${css}`);
  }
  return out.join('\n\n');
}

// buildCustomCSSBlock returns the raw CSS the admin authored in the Theme
// Studio's "Custom CSS" tab, ready to append to the theme stylesheet. The
// global block is emitted verbatim (the admin owns selector correctness).
// Scope blocks are filtered by `opts`:
//   - preview → every scope (so editing shows the admin everything)
//   - pathname → only scopes matching that route
//   - neither  → none
// Returns '' when the theme has no custom CSS so nothing is appended.
function buildCustomCSSBlock(customCSS: ThemeCustomCSS | undefined, opts?: ApplyOpts): string {
  if (!customCSS) return '';
  const parts: string[] = [];
  const global = typeof customCSS.global === 'string' ? customCSS.global : '';
  if (global.trim()) {
    parts.push(`/* Custom CSS — global (Theme Studio) */\n${global}`);
  }
  const scopes = customCSS.scopes || {};
  const scopeEntries = Object.entries(scopes).filter(([, css]) => typeof css === 'string' && css.trim());
  if (scopeEntries.length) {
    let emitted: string[] = [];
    if (opts?.preview) {
      // Studio live preview: emit every scope so the admin sees their
      // per-route CSS while editing regardless of the current URL.
      emitted = scopeEntries.map(([scope, css]) => `/* Custom CSS — ${scope} (preview) */\n${css}`);
    } else if (opts?.pathname) {
      // Production: only the scopes that match the resolved route.
      const matched = matchingScopeCss(scopes, opts.pathname);
      if (matched) emitted.push(matched);
    }
    if (emitted.length) parts.push(emitted.join('\n\n'));
  }
  return parts.join('\n\n');
}

function buildVars(theme: Theme, opts?: ApplyOpts): string {
  const cacheKey = `${theme.id}|${opts?.pathname || ''}`;
  const cached = buildVarsCache.get(cacheKey);
  if (cached) return cached;

  const c = theme.card;
  const s = theme.sidebar;
  const b = theme.button;
  const h = theme.header;
  const t = theme.typography;
  const a = theme.accent;
  const sh = theme.shape;
  const bg = theme.background;
  const l = theme.loading || { color: '#3b82f6', background: 'rgba(15,23,42,0.65)', text_color: '#ffffff', size: 'lg', animation_speed: 'normal', show_text: true, show_header: true, show_sidebar: true, full_screen: true, type: 'cycle', text: 'Loading...' };
  // Custom CSS block — emitted at the END of the theme stylesheet (after
  // every token-driven override) so admin-written rules naturally win over
  // the panel defaults via source order. defensive read: older persisted
  // themes (pre-customCSS) would have undefined here; we never crash on
  // that, we just emit no custom CSS for them.
  const customCSS = (theme as any).customCSS as ThemeCustomCSS | undefined;
  const customBlock = buildCustomCSSBlock(customCSS, opts);

  // The card surface is composite — its fill, blur, border and shadow each
  // come from many places (GlassCard, GlassField, modal). Rather than try
  // to thread individual tokens through every component, we expose a few
  // coherent variables components can opt into and ALSO override the .glass*
  // component classes themselves so the existing markup simply *inherits* the
  // theme without a per-component refactor.
  return `
:root {
  --ks-bg-color: ${bg.color};
  --ks-bg-gradient: ${bg.type === 'gradient' ? bg.gradient : 'none'};
  --ks-font-family: ${t.font_family};
  --ks-text-body: ${t.body_color};
  --ks-text-heading: ${t.heading_color};
  --ks-text-card: ${c.text_color};
  --ks-link: ${t.link_color};
  --ks-radius-sm: ${sh.border_radius_sm}px;
  --ks-radius-md: ${sh.border_radius_md}px;
  --ks-radius-lg: ${sh.border_radius_lg}px;
  --ks-accent-primary: ${a.primary};
  --ks-accent-danger: ${a.danger};
  --ks-accent-success: ${a.success};
  --ks-accent-warning: ${a.warning};

  --ks-card-bg: ${c.background};
  --ks-card-blur: ${c.backdrop_blur}px;
  --ks-card-border: ${c.border_color};
  --ks-card-border-width: ${c.border_width}px;
  --ks-card-radius: ${c.border_radius}px;
  --ks-card-padding: ${c.padding}px;
  --ks-card-margin: ${c.margin}px;
  --ks-card-gap-h: ${c.gap_h ?? c.gap ?? 16}px;
  --ks-card-gap-v: ${c.gap_v ?? c.gap ?? 16}px;
  --ks-card-shadow: ${c.shadow};
  --ks-card-hover-border: ${c.hover_border};
  // Card background media layers. When bg_type is color these are 'none'
  // so the plain --ks-card-bg fills the card. For image/gradient we layer
  // the media on top of the color (color stays as the fallback under the
  // opacity dimming). Video cards aren't supported via CSS background —
  // the field is stored but only color/image/gradient render on cards.
  --ks-card-bg-layer: ${cardBgLayer(c)};
  --ks-card-bg-video: ${c.bg_type === 'video' && c.bg_video ? c.bg_video.replace(/"/g, '\\"') : ''};
  --ks-card-bg-opacity: ${c.bg_opacity};
  --ks-card-bg-size: ${c.bg_size || 'cover'};
  --ks-card-bg-position: ${c.bg_position || 'center'};
  --ks-card-bg-repeat: ${c.bg_repeat || 'no-repeat'};

  /* Dropdown surface — the frosted panel used by the card 3-dot menu, the
     header account/profile menu, the Themes "Apply to…" picker, and every
     inline filter dropdown in admin pages. One coherent set of vars drives
     all of them so the admin gets a single dropdown look everywhere. */
  --ks-dropdown-bg: ${makeDropdownBg((theme as any).dropdowns)};
  --ks-dropdown-bg-type: ${(theme as any).dropdowns?.bg_type ?? 'color'};
  --ks-dropdown-bg-image: ${(theme as any).dropdowns?.bg_image ?? ''};
  --ks-dropdown-bg-video: ${(theme as any).dropdowns?.bg_video ?? ''};
  --ks-dropdown-bg-gradient: ${(theme as any).dropdowns?.bg_gradient ?? ''};
  --ks-dropdown-bg-opacity: ${(theme as any).dropdowns?.bg_opacity ?? 1};
  --ks-dropdown-bg-blur: ${(theme as any).dropdowns?.bg_blur ?? 0}px;
  --ks-dropdown-bg-image-layer: ${makeDropdownMedia((theme as any).dropdowns)};
  --ks-dropdown-border-color: ${(theme as any).dropdowns?.border_color ?? 'rgba(255,255,255,0.10)'};
  --ks-dropdown-border-width: ${(theme as any).dropdowns?.border_width ?? 1}px;
  --ks-dropdown-radius: ${(theme as any).dropdowns?.border_radius ?? 10}px;
  --ks-dropdown-shadow: ${(theme as any).dropdowns?.shadow ?? '0 12px 40px rgba(0,0,0,0.55)'};
  --ks-dropdown-backdrop-blur: ${(theme as any).dropdowns?.backdrop_blur ?? 28}px;
  --ks-dropdown-padding: ${(theme as any).dropdowns?.padding ?? 4}px;
  --ks-dropdown-min-width: ${(theme as any).dropdowns?.min_width ?? 192}px;
  --ks-dropdown-item-text: ${(theme as any).dropdowns?.item_text_color ?? '#e5e7eb'};
  --ks-dropdown-item-hover: ${(theme as any).dropdowns?.item_hover_background ?? 'rgba(255,255,255,0.08)'};
  --ks-dropdown-item-px: ${(theme as any).dropdowns?.item_padding_x ?? 12}px;
  --ks-dropdown-item-py: ${(theme as any).dropdowns?.item_padding_y ?? 8}px;
  --ks-dropdown-item-gap: ${(theme as any).dropdowns?.item_gap ?? 10}px;
  --ks-dropdown-font: ${(theme as any).dropdowns?.font_size ?? 13}px;
  --ks-dropdown-danger-text: ${(theme as any).dropdowns?.danger_text_color ?? '#fca5a5'};
  --ks-dropdown-danger-hover: ${(theme as any).dropdowns?.danger_hover_background ?? 'rgba(239,68,68,0.18)'};
  --ks-dropdown-header-sep: ${(theme as any).dropdowns?.header_separator ?? 'rgba(255,255,255,0.10)'};

  --ks-sidebar-bg: ${s.background};
  --ks-sidebar-blur: ${s.backdrop_blur}px;
  --ks-sidebar-border: ${s.border_color};
  --ks-sidebar-text: ${s.text_color};
  --ks-sidebar-active-bg: ${s.active_background};
  --ks-sidebar-active-text: ${s.active_text_color};
  --ks-sidebar-hover-bg: ${s.hover_background};
  --ks-sidebar-width: ${s.width}px;

  --ks-header-bg: ${h.background};
  --ks-header-blur: ${h.backdrop_blur}px;
  --ks-header-border: ${h.border_color};
  --ks-header-text: ${h.text_color};
  --ks-header-height: ${h.height}px;

  --ks-btn-bg: ${b.background};
  --ks-btn-text: ${b.text_color};
  --ks-btn-radius: ${b.border_radius}px;
  --ks-btn-px: ${b.padding_x}px;
  --ks-btn-py: ${b.padding_y}px;
  --ks-btn-hover: ${b.hover_background};
  --ks-btn-border: ${b.border};
  --ks-btn-font: ${b.font_size}px;

  /* Ghost / transparent button (Cancel, secondary actions). */
  --ks-btn-ghost-bg: ${b.ghost_background};
  --ks-btn-ghost-text: ${b.ghost_text_color};
  --ks-btn-ghost-hover: ${b.ghost_hover_background};
  --ks-btn-ghost-border: ${b.ghost_border};
  --ks-btn-ghost-radius: ${b.ghost_border_radius}px;
  --ks-btn-ghost-px: ${b.ghost_padding_x}px;
  --ks-btn-ghost-py: ${b.ghost_padding_y}px;
  --ks-btn-ghost-font: ${b.ghost_font_size}px;

  /* Icon button (Filter / New / Upload — the square translucent pills). */
  --ks-btn-icon-bg: ${b.icon_background};
  --ks-btn-icon-text: ${b.icon_text_color};
  --ks-btn-icon-hover: ${b.icon_hover_background};
  --ks-btn-icon-border: ${b.icon_border};
  --ks-btn-icon-radius: ${b.icon_border_radius}px;
  --ks-btn-icon-padding: ${b.icon_padding}px;
  --ks-btn-icon-size: ${b.icon_size}px;

  /* Tab navigation (Security / System / Database / form tabs). */
  --ks-tab-active-bg: ${(theme as any).tabs?.active_background ?? '#ffffff'};
  --ks-tab-active-text: ${(theme as any).tabs?.active_text_color ?? '#000000'};
  --ks-tab-inactive-bg: ${(theme as any).tabs?.inactive_background ?? 'transparent'};
  --ks-tab-inactive-text: ${(theme as any).tabs?.inactive_text_color ?? '#d1d5db'};
  --ks-tab-hover-bg: ${(theme as any).tabs?.hover_background ?? 'rgba(255,255,255,0.05)'};
  --ks-tab-hover-text: ${(theme as any).tabs?.hover_text_color ?? '#ffffff'};
  --ks-tab-border: ${(theme as any).tabs?.border ?? 'none'};
  --ks-tab-radius: ${(theme as any).tabs?.border_radius ?? 6}px;
  --ks-tab-px: ${(theme as any).tabs?.padding_x ?? 12}px;
  --ks-tab-py: ${(theme as any).tabs?.padding_y ?? 6}px;
  --ks-tab-font: ${(theme as any).tabs?.font_size ?? 14}px;
  --ks-tab-indicator-color: ${(theme as any).tabs?.indicator_color ?? '#ffffff'};
  --ks-tab-indicator-height: ${(theme as any).tabs?.indicator_height ?? 0}px;

  --ks-loading-color: ${l.color};
  --ks-loading-bg: ${l.background};
  --ks-loading-text: ${l.text_color};
  --ks-loading-size: ${l.size};
  --ks-loading-animation: ${l.animation_speed};
  /* Animation duration derived from the speed preset so the actual Loading
     indicator's animate-* classes can pick it up via a scoped rule below. */
  --ks-loading-animation-duration: ${l.animation_speed === 'slow' ? '2s' : l.animation_speed === 'fast' ? '0.5s' : '1s'};
}

/* ------------------------------------------------------------------
   The theme fully controls the glass-card *box*: fill, blur, border,
   shadow AND padding / border-radius / margin. Using !important lets the
   theme win over the per-card Tailwind utilities (p-4, rounded-lg, …) so
   dragging a slider in the studio genuinely reshapes every card in the
   panel — which is what "theme the panel" means.
   The default theme ships with padding=16, radius=12, margin=0 to match
   the most common call-site (glass-card p-4 rounded-xl), so applying the
   Default theme reproduces the pre-theme look for the majority of cards.
   ------------------------------------------------------------------ */
html { font-family: var(--ks-font-family); }
body { background-color: var(--ks-bg-color); }
body { color: var(--ks-text-body); }

.kspanel-bg-overlay {
  background-image: var(--ks-bg-gradient);
  background-color: var(--ks-bg-color);
}

/* Full surface + box override for glass cards. The layout props (padding /
   border-radius / margin) are theme-driven so the studio sliders actually
   change them app-wide. The background layer stacks the optional media/
   gradient (var-layers) on top of the solid fill so a card can carry a
   png / multi-colour CSS gradient / gif backdrop. */
.glass-card {
  background-color: var(--ks-card-bg) !important;
  background-image: var(--ks-card-bg-layer) !important;
  background-size: var(--ks-card-bg-size);
  background-position: var(--ks-card-bg-position);
  background-repeat: var(--ks-card-bg-repeat);
  backdrop-filter: blur(var(--ks-card-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-card-blur)) !important;
  border-color: var(--ks-card-border) !important;
  border-width: var(--ks-card-border-width) !important;
  border-radius: var(--ks-card-radius) !important;
  box-shadow: var(--ks-card-shadow) !important;
  padding: var(--ks-card-padding) !important;
  margin: var(--ks-card-margin) !important;
  transition: border-color 0.2s ease !important;
}
.glass-card:hover { border-color: var(--ks-card-hover-border) !important; }

/* Glass-style modifiers opt in by the admin via the Theme Studio's "Glass
   style" select on the Card tab. The default 'frosted' is what a plain
   .glass-card already is, so the modifier class is a NO-OP there — the
   other two styles override the surface to give every card a different
   feel without per-page work.

   - 'strong' → heavier blur + saturated color matrix for cards that need
     to read crisp above busy media.
   - 'solid'  → opaque fill (drops blur entirely), for flat / non-glass
     designs that still want the themed card colors and shape.

   Both rules win over .glass-card's defaults via !important + the higher
   specificity of the class+class selector. The store applies the modifier
   class to every glass-card / glass-strong surface based on theme.card.glass_style.
   We target BOTH .glass-card AND .glass-strong so the modifier survives a
   variant='strong' mount — previously only .glass-card was selected which
   meant modal/dropdown surfaces that use .glass-strong never picked up the
   admin's strong/solid glass choice and stayed frozen frosted. */
.glass-card.ks-card-glass-strong,
.glass-strong.ks-card-glass-strong {
  backdrop-filter: blur(max(24px, calc(var(--ks-card-blur) * 1.5))) saturate(180%) !important;
  -webkit-backdrop-filter: blur(max(24px, calc(var(--ks-card-blur) * 1.5))) saturate(180%) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04) inset !important;
}
.glass-card.ks-card-glass-solid,
.glass-strong.ks-card-glass-solid {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.glass-strong {
  background-color: var(--ks-card-bg) !important;
  background-image: var(--ks-card-bg-layer) !important;
  background-size: var(--ks-card-bg-size);
  background-position: var(--ks-card-bg-position);
  background-repeat: var(--ks-card-bg-repeat);
  backdrop-filter: blur(var(--ks-card-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-card-blur)) !important;
  border-color: var(--ks-card-border) !important;
  border-width: var(--ks-card-border-width) !important;
  border-radius: var(--ks-card-radius) !important;
  box-shadow: var(--ks-card-shadow) !important;
  padding: var(--ks-card-padding) !important;
  margin: var(--ks-card-margin) !important;
  transition: border-color 0.2s ease !important;
}
.glass-strong:hover { border-color: var(--ks-card-hover-border) !important; }

/* Floating dropdown panels — the Themes "Apply to…" scope menu + the
   header profile menu + the card 3-dot menus. Every dropdown reads from
   the same set of vars in :root so a single theme change cascades to all
   of them.

   The base fill comes from --ks-dropdown-bg (a rgba() with the admin's
   bg_opacity already baked into the alpha — we deliberately do NOT apply
   an element-level opacity (the previous implementation greyed-out the
   menu text along with the backdrop any time the studio's "Backdrop
   opacity" slider wasn't at 1.0). The optional media layer
   (image/gradient/video) is painted by a ::before pseudo so the admin's
   bg_blur applies ONLY to the backdrop (filter: blur on the pseudo)
   instead of blurring the menu text. The pseudo sits beneath the
   dropdown content via z-index: -1; the parent gets position: relative
   so the pseudo tracks its size + corner radius. Strong backdrop blur
   keeps the menu legible above whatever card / page it opened over. */
.glass-dropdown {
  position: relative;
  background-color: var(--ks-dropdown-bg) !important;
  background-image: none !important;
  backdrop-filter: blur(var(--ks-dropdown-backdrop-blur)) saturate(180%) !important;
  -webkit-backdrop-filter: blur(var(--ks-dropdown-backdrop-blur)) saturate(180%) !important;
  border-color: var(--ks-dropdown-border-color) !important;
  border-width: var(--ks-dropdown-border-width) !important;
  border-radius: var(--ks-dropdown-radius) !important;
  box-shadow: var(--ks-dropdown-shadow) !important;
  color: var(--ks-dropdown-item-text) !important;
  font-size: var(--ks-dropdown-font) !important;
  min-width: var(--ks-dropdown-min-width) !important;
  padding: var(--ks-dropdown-padding) !important;
}
.glass-dropdown::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  background-image: var(--ks-dropdown-bg-image-layer);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(var(--ks-dropdown-bg-blur, 0px));
}

/* Inline dropdown panels (the Filters button on Templates / Mods / Nodes
   / etc.) opt into this class so they share the same themed surface.
   Component code can apply ks-dropdown to any absolutely-positioned
   panel to inherit the dropdown look. Mirrors the .glass-dropdown
   above: pseudo carries the media layer so bg_blur / bg_opacity are
   scoped to the backdrop instead of fading the content. */
.ks-dropdown {
  position: relative;
  background-color: var(--ks-dropdown-bg) !important;
  background-image: none !important;
  backdrop-filter: blur(var(--ks-dropdown-backdrop-blur)) saturate(180%) !important;
  -webkit-backdrop-filter: blur(var(--ks-dropdown-backdrop-blur)) saturate(180%) !important;
  border-color: var(--ks-dropdown-border-color) !important;
  border-width: var(--ks-dropdown-border-width) !important;
  border-radius: var(--ks-dropdown-radius) !important;
  box-shadow: var(--ks-dropdown-shadow) !important;
  color: var(--ks-dropdown-item-text) !important;
  font-size: var(--ks-dropdown-font) !important;
  padding: var(--ks-dropdown-padding) !important;
}
.ks-dropdown::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  background-image: var(--ks-dropdown-bg-image-layer);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(var(--ks-dropdown-bg-blur, 0px));
}

/* Dropdown item rows — applied by RichMenu's renderItem to every row
   (action / checkbox / toggle / submenu) so they all share padding,
   colour, and hover state from the dropdown section. The danger tone
   paints destructive rows (Delete / Remove) in red. */
.ks-dropdown-item {
  padding-left: var(--ks-dropdown-item-px) !important;
  padding-right: var(--ks-dropdown-item-px) !important;
  padding-top: var(--ks-dropdown-item-py) !important;
  padding-bottom: var(--ks-dropdown-item-py) !important;
  gap: var(--ks-dropdown-item-gap) !important;
  color: var(--ks-dropdown-item-text) !important;
  transition: background 0.12s ease, color 0.12s ease !important;
}
.ks-dropdown-item:hover,
.ks-dropdown-item:focus-visible {
  background-color: var(--ks-dropdown-item-hover) !important;
  color: #ffffff !important;
}
.ks-dropdown-item.is-danger {
  color: var(--ks-dropdown-danger-text) !important;
}
.ks-dropdown-item.is-danger:hover,
.ks-dropdown-item.is-danger:focus-visible {
  background-color: var(--ks-dropdown-danger-hover) !important;
  color: #ffffff !important;
}

/* Header / identity block divider inside a dropdown (used by the profile
   menu's title row). */
.ks-dropdown-header {
  border-bottom: 1px solid var(--ks-dropdown-header-sep) !important;
}

/* Dropdown trigger — used by the inline Filters button + the
   header account avatar. Base styles + hover/open states. */
.ks-dropdown-trigger {
  background-color: var(--ks-btn-ghost-bg) !important;
  color: var(--ks-btn-ghost-text) !important;
  border: var(--ks-btn-ghost-border) !important;
  border-radius: var(--ks-btn-ghost-radius) !important;
  padding: var(--ks-btn-ghost-py) var(--ks-btn-ghost-px) !important;
  font-size: var(--ks-btn-ghost-font) !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.ks-dropdown-trigger:hover,
.ks-dropdown-trigger.is-open {
  background-color: var(--ks-dropdown-item-hover) !important;
  color: #ffffff !important;
}
.ks-dropdown-trigger.has-active {
  background-color: var(--ks-btn-ghost-hover) !important;
  border-color: var(--ks-dropdown-border-color) !important;
}

/* Glass field — opt-in class for form inputs (select, input) inside
   dropdowns so they follow the dropdown theme. */
.glass-field {
  background: var(--ks-dropdown-bg) !important;
  border-color: var(--ks-dropdown-border-color) !important;
  border-width: var(--ks-dropdown-border-width) !important;
  border-radius: var(--ks-dropdown-radius) !important;
  color: var(--ks-dropdown-item-text) !important;
  font-size: var(--ks-dropdown-font) !important;
  padding: var(--ks-dropdown-item-py) var(--ks-dropdown-item-px) !important;
}
.glass-field:focus {
  outline: none !important;
  border-color: var(--ks-dropdown-border-color) !important;
  box-shadow: 0 0 0 2px var(--ks-dropdown-border-color) !important;
}

/* Opt-in class for any element that should follow the card box model even

/* Opt-in class for any grid / flex container that holds sibling cards.
   Applies the themed "gap between cards" so dragging the Card tab's
   "Gap between cards (H)" and "Gap between cards (V)" sliders in the
   studio closes (or widens) the spacing between cards everywhere on the
   panel — without per-page Tailwind gap-N overrides fighting against the
   theme. */
.ks-card-grid {
  column-gap: var(--ks-card-gap-h) !important;
  row-gap: var(--ks-card-gap-v) !important;
}

/* The panel-wide primary button (Create / Save / Activate). We theme the
   fill, border, AND the box (radius / padding / font-size) so the Button
   tab's sliders visibly change every primary action app-wide. */
.ks-primary-btn {
  background: var(--ks-btn-bg) !important;
  color: var(--ks-btn-text) !important;
  border: var(--ks-btn-border) !important;
  border-radius: var(--ks-btn-radius) !important;
  padding-top: var(--ks-btn-py) !important;
  padding-bottom: var(--ks-btn-py) !important;
  padding-left: var(--ks-btn-px) !important;
  padding-right: var(--ks-btn-px) !important;
  font-size: var(--ks-btn-font) !important;
}
.ks-primary-btn:hover { background: var(--ks-btn-hover) !important; }

/* Ghost / transparent button — Cancel, secondary actions, etc. Sits on the
   glass-card surface with a faint border and a subtle hover wash. */
.ks-ghost-btn {
  background: var(--ks-btn-ghost-bg) !important;
  color: var(--ks-btn-ghost-text) !important;
  border: var(--ks-btn-ghost-border) !important;
  border-radius: var(--ks-btn-ghost-radius) !important;
  padding-top: var(--ks-btn-ghost-py) !important;
  padding-bottom: var(--ks-btn-ghost-py) !important;
  padding-left: var(--ks-btn-ghost-px) !important;
  padding-right: var(--ks-btn-ghost-px) !important;
  font-size: var(--ks-btn-ghost-font) !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
}
.ks-ghost-btn:hover { background: var(--ks-btn-ghost-hover) !important; }

/* Icon button — the square translucent pills in page headers (Filter, New,
   Upload, theme picker, …). Padding / size scale together so the icon
   stays centred inside the square. */
.ks-icon-btn {
  background: var(--ks-btn-icon-bg) !important;
  color: var(--ks-btn-icon-text) !important;
  border: var(--ks-btn-icon-border) !important;
  border-radius: var(--ks-btn-icon-radius) !important;
  padding: var(--ks-btn-icon-padding) !important;
  transition: background 0.15s ease !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.ks-icon-btn:hover { background: var(--ks-btn-icon-hover) !important; }
.ks-icon-btn.is-open { background: var(--ks-btn-icon-hover) !important; }
.ks-icon-btn svg { width: var(--ks-btn-icon-size) !important; height: var(--ks-btn-icon-size) !important; }

/* Tab navigation — the pill bar seen on /admin/security, /admin/system,
   /admin/database, and every form's section tabs. */
.ks-tab {
  background: var(--ks-tab-inactive-bg) !important;
  color: var(--ks-tab-inactive-text) !important;
  border: var(--ks-tab-border) !important;
  border-radius: var(--ks-tab-radius) !important;
  padding-left: var(--ks-tab-px) !important;
  padding-right: var(--ks-tab-px) !important;
  padding-top: var(--ks-tab-py) !important;
  padding-bottom: var(--ks-tab-py) !important;
  font-size: var(--ks-tab-font) !important;
  transition: background 0.15s ease, color 0.15s ease !important;
}
.ks-tab:hover {
  background: var(--ks-tab-hover-bg) !important;
  color: var(--ks-tab-hover-text) !important;
}
.ks-tab-active {
  background: var(--ks-tab-active-bg) !important;
  color: var(--ks-tab-active-text) !important;
}

/* Sidebar chrome surface — fill / blur / border only. The avatar keeps
   its own text colour utilities; forcing --ks-sidebar-text onto the aside
   would dim the brand name (the span has no colour utility, so it would
   inherit). We deliberately do NOT set the 'color' property here so aside
   text stays text-gray-100 and individual items carry their own
   text-gray-400. */
.ks-sidebar-bg {
  background: var(--ks-sidebar-bg) !important;
  backdrop-filter: blur(var(--ks-sidebar-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-sidebar-blur)) !important;
  border-color: var(--ks-sidebar-border) !important;
  width: var(--ks-sidebar-width, 224px) !important;
  min-width: var(--ks-sidebar-width, 224px) !important;
}

/* Sidebar nav-item active / hover states. These are the parts that used
   to be hardcoded to 'bg-white text-black' / 'hover:bg-gray-800' and so
   never repainted under a theme. We keep the layout + inactive text colour
   as Tailwind utilities the components own, and only redirect the ACTIVE
   fill + text and the HOVER fill through vars so the admin's chosen active
   + hover colours actually render without reshaping text hierarchy. */
.ks-nav-active {
  background: var(--ks-sidebar-active-bg) !important;
  color: var(--ks-sidebar-active-text) !important;
}
.ks-nav-item:hover {
  background: var(--ks-sidebar-hover-bg) !important;
}
/* When an item is active it shouldn't also paint the hover fill — the
   active fill wins. */
.ks-nav-item.ks-nav-active:hover {
  background: var(--ks-sidebar-active-bg) !important;
  color: var(--ks-sidebar-active-text) !important;
}

/* Header surface — fill / blur / border only; height stays as the Tailwind
   h-14 utility owned by <header> so the sticky bar keeps its layout. */
.ks-header-bg {
  background: var(--ks-header-bg) !important;
  backdrop-filter: blur(var(--ks-header-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-header-blur)) !important;
  border-color: var(--ks-header-border) !important;
  color: var(--ks-header-text);
  height: var(--ks-header-height, 56px) !important;
  min-height: var(--ks-header-height, 56px) !important;
}

/* Loading animation speed. The Loading component renders the spin/bounce/
   pulse via Tailwind's .animate-* utilities (which hard-code 1s). We
   scope the override to descendants of .ks-loading-host (mounted on the
   Loading wrapper) so the speed slider in the Theme Studio ONLY affects
   loading indicators and never leaks into unrelated animations like
   skeletons / pulse-glows elsewhere on the panel. */
.ks-loading-host .animate-spin,
.ks-loading-host .animate-bounce,
.ks-loading-host .animate-pulse {
  animation-duration: var(--ks-loading-animation-duration, 1s) !important;
}
  `.trim() + (customBlock ? '\n\n' + customBlock : '');
}

// resolveThemeFromStore is the merged resolver the store uses on every
// navigation: LOCAL assignments (this user's localStorage) win, then the
// admin's GLOBAL assignment (server), then the built-in default. The theme
// object is looked up across local themes first, then global themes, so the
// id resolved from either assignment map finds its body.
function resolveThemeFromStore(s: ThemeState, pathname: string): Theme {
  const localTid = resolveThemeIdByRoute(pathname, s.assignments);
  if (localTid && localTid !== 'default') {
    const t = s.themes.find((x) => x.id === localTid);
    if (t) return t;
  }
  const globalTid = resolveThemeIdByRoute(pathname, s.globalAssignments);
  if (globalTid && globalTid !== 'default') {
    const t = s.globalThemes.find((x) => x.id === globalTid);
    if (t) return t;
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme, opts?: ApplyOpts): void {

  if (typeof document === 'undefined') return;

  // 1. CSS custom property block.
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildVars(theme, opts);

  // 2. Media layer for image / video / gradient backgrounds, injected
  // into the in-layout #ks-theme-layer mount (created by Layout.tsx) so
  // it paints behind Aurora + content within the root stacking context.
  // If the mount isn't there yet (first paint before Layout mounts) we
  // still set the CSS vars; the layer is re-stamped on any later
  // applyTheme when the mount exists.
  const mount = document.getElementById(LAYER_MOUNT_ID);
  if (mount) {
    mount.innerHTML = buildBgLayer(theme);
  } else {
    // Defer slightly and try again so a theme applied before Layout mounts
    // (e.g. at module load) still gets rendered once the mount appears.
    setTimeout(() => {
      const m = document.getElementById(LAYER_MOUNT_ID);
      if (m) m.innerHTML = buildBgLayer(theme);
    }, 0);
  }
}

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------
interface ThemeState {
  themes: Theme[];
  // Assignment map keyed by scope. area:<id> are area-level defaults;
  // page:<id> are page-level overrides that win over the area default.
  // These are the LOCAL (localStorage) assignments owned by THIS user in
  // THIS browser — a personal override that always wins over the admin's
  // global assignment for that user only.
  assignments: Partial<Record<Scope, string>>;
  // Global (server-side, admin-managed) theme store: themes every user sees
  // + the area/page bindings the admin set. The resolver merges local > global
  // > default, so a personal theme still wins for the user that owns it but
  // everyone else gets the admin's global theme. Empty until loadGlobal
  // succeeds (offline / pre-login fallbacks to local + default).
  globalThemes: Theme[];
  globalAssignments: Partial<Record<Scope, string>>;
  globalLoaded: boolean;

  draft: Theme | null;

  load: () => void;
  // loadGlobal fetches the admin-managed global theme store from the API
  // and merges it into the resolver. Safe to call on app bootstrap; a
  // failure degrades silently to "no global themes" so the panel still
  // fully works off the user's local themes + the built-in default.
  loadGlobal: () => Promise<void>;

  active: () => Theme;
  resolveThemeForRoute: (pathname: string) => Theme;
  applyForRoute: (pathname: string) => void;

  assignTheme: (themeId: string, scope: Scope) => void;
  unassignTheme: (scope: Scope) => void;
  assignmentsFor: (themeId: string) => Scope[];

  createTheme: (theme: Theme) => void;
  updateTheme: (id: string, patch: Partial<Theme>) => void;
  deleteTheme: (id: string) => void;
  // Global theme management — persist to the server so every user sees them.
  createGlobalTheme: (theme: Theme) => Promise<Theme>;
  updateGlobalTheme: (id: string, patch: Partial<Theme>) => Promise<Theme>;
  deleteGlobalTheme: (id: string) => Promise<void>;

  beginDraft: (seed?: Theme) => void;
  editDraft: (seed: Theme) => void;
  patchDraft: (section: ThemeKey, patch: Record<string, any>) => void;
  patchDraftMeta: (patch: Partial<Pick<Theme, 'name' | 'description'>>) => void;
  saveDraft: (asNew: boolean) => Theme;
  discardDraft: () => void;
  reapply: () => void;
}

// ------------------------------------------------------------------
// Server bootstrapped GLOBAL theme store
// ------------------------------------------------------------------
// The Go server inlines the admin-managed GLOBAL theme store into index.html
// as window.__KSPANEL_BOOTSTRAP__.theme so the SPA's FIRST paint is already
// themed — no /api/me + /api/themes round-trip needed. This mirrors the
// existing pattern used for the panel brand (panel_name/logo) and fixes
// three symptoms at once:
//   - logged-out visitors see the assigned theme (the boot blob needs no auth)
//   - post-login the right theme is already in place before React settles
//   - refreshing a page paints the theme before the JS-driven theme resolver
//     runs, removing the ~1s flash of the Default theme
// The data is identical to what GET /api/themes returns, so seeding from it
// and re-fetching later (loadGlobal) produce the same state.
interface BootstrapTheme {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  spec: Theme;
}
interface BootstrapAssignment {
  scope: string;
  theme_id: string;
}
interface BootstrapThemeStore {
  themes: BootstrapTheme[];
  assignments: BootstrapAssignment[];
}
interface KsPanelBootstrap {
  panel_name?: string;
  logo_url?: string;
  logo_mime?: string;
  theme?: BootstrapThemeStore;
}

const BOOTSTRAP_GLOBAL: { themes: Theme[]; assignments: Partial<Record<Scope, string>> } = {
  themes: [],
  assignments: {},
};
let bootstrapThemeLoaded = false;

function loadBootstrapTheme(): void {
  if (bootstrapThemeLoaded) return;
  bootstrapThemeLoaded = true;
  if (typeof window === 'undefined') return;
  const boot = (window as unknown as { __KSPANEL_BOOTSTRAP__?: KsPanelBootstrap }).__KSPANEL_BOOTSTRAP__;
  if (!boot || !boot.theme) return;
  const themes: Theme[] = (boot.theme.themes || []).map((s) => {
    // Backfill new fields from DEFAULT so old global themes saved before
    // e.g. card.glass_style / dropdowns.bg_type existed still resolve
    // safely — same defence we run in loadGlobal() for the fetched copy.
    // Without these explicit re-merges a partial spec.dropdowns (with
    // only background set, for example) would wholesale REPLACE
    // DEFAULT_THEME.dropdowns via the ...s.spec spread above and the
    // admin would suddenly see no dropdown backdrop / no border / etc.
    return {
      ...DEFAULT_THEME,
      ...s.spec,
      id: s.id,
      name: s.name,
      description: s.description,
      builtin: !!s.builtin,
      card: { ...DEFAULT_THEME.card, ...(s.spec.card || {}), glass_style: (s.spec.card && s.spec.card.glass_style) || DEFAULT_THEME.card.glass_style },
      dropdowns: { ...DEFAULT_THEME.dropdowns, ...(s.spec.dropdowns || {}) },
      customCSS: migrateCustomCSS((s.spec as any).customCSS),
    };
  });
  const assignments: Partial<Record<Scope, string>> = {};
  for (const a of boot.theme.assignments || []) {
    assignments[a.scope as Scope] = a.theme_id;
  }
  BOOTSTRAP_GLOBAL.themes = themes;
  BOOTSTRAP_GLOBAL.assignments = assignments;
}

const initial = loadPersisted();
// Apply the route-resolved theme immediately on module load so the very
// first paint is themed before React mounts. Runs only in the browser;
// the guard inside applyTheme no-ops on the server / test environments.
//
// Server-bootstrap of the GLOBAL theme store happens FIRST so the resolver
// can use the server's assignments (LOCAL still wins per the merged resolver),
// which is what paints the right theme for a logged-out visitor / a fresh
// refresh before /api/themes resolves. window.__KSPANEL_BOOTSTRAP__ is set
// inline in index.html by the Go server, so it is present at module-import.
{
  loadBootstrapTheme();
  const p = typeof window !== 'undefined' ? window.location.pathname : '/';
  applyTheme(resolveThemeForInitial(p, {
    themes: initial.themes,
    assignments: initial.assignments,
    globalThemes: BOOTSTRAP_GLOBAL.themes,
    globalAssignments: BOOTSTRAP_GLOBAL.assignments,
  }), { pathname: p });
}

// resolveThemeForInitial is the pre-store mirror of resolveThemeFromStore:
// LOCAL wins, then the bootstrapped GLOBAL, then the built-in Default. It
// duplicates a few lines because the store instance doesn't exist yet at
// module-init (we're literally computing the seed state), so we hand it the
// data instead of pulling it from get().
function resolveThemeForInitial(pathname: string, s: {
  themes: Theme[];
  assignments: Partial<Record<Scope, string>>;
  globalThemes: Theme[];
  globalAssignments: Partial<Record<Scope, string>>;
}): Theme {
  const localTid = resolveThemeIdByRoute(pathname, s.assignments);
  if (localTid && localTid !== 'default') {
    const t = s.themes.find((x) => x.id === localTid);
    if (t) return t;
  }
  const globalTid = resolveThemeIdByRoute(pathname, s.globalAssignments);
  if (globalTid && globalTid !== 'default') {
    const t = s.globalThemes.find((x) => x.id === globalTid);
    if (t) return t;
  }
  return DEFAULT_THEME;
}

function persistFrom(get: () => ThemeState): void {
  const s = get();
  persist({ themes: s.themes, assignments: s.assignments });
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themes: initial.themes,
  assignments: initial.assignments,
  // Seed the GLOBAL theme store from the server-inlined bootstrap so the
  // merged resolver already has the admin's assignments on the very first
  // React render (and the module-init applyTheme above already used it to
  // paint). loadGlobal() refreshes these from /api/themes after mount so the
  // SPA picks up themes the admin added since this index.html was served.
  globalThemes: BOOTSTRAP_GLOBAL.themes,
  globalAssignments: BOOTSTRAP_GLOBAL.assignments,
  globalLoaded: BOOTSTRAP_GLOBAL.themes.length > 0,
  draft: null,

  load: () => {
    const p = loadPersisted();
    set({ themes: p.themes, assignments: p.assignments });
    const pth = typeof window !== 'undefined' ? window.location.pathname : '/';
    const tid = resolveThemeIdByRoute(pth, p.assignments);
    applyTheme(p.themes.find((t) => t.id === tid) || DEFAULT_THEME, { pathname: pth });
  },

  // Fetch the admin-managed GLOBAL theme store and fold it into the resolver.
  // On success the merged resolver (local > global > default) can paint any
  // page the admin has themed; a failure degrades silently so the panel keeps
  // working off local + default.
  loadGlobal: async () => {
    try {
      const store = await fetchThemesStore();
      const globalThemes: Theme[] = (store.themes || []).map((s: StoredTheme) => {
        const spec = s.spec || ({} as Theme);
        // Backfill EVERY section from DEFAULT_THEME first so old global
        // themes saved before a section was added (background / card /
        // sidebar / button / header / typography / accent / shape / loading)
        // still resolve safely. This MUST mirror loadBootstrapTheme()'s
        // ...DEFAULT_THEME, ...s.spec spread — previously loadGlobal only
        // re-backfilled card, so a refresh that re-fetched /api/themes
        // would overwrite the bootstrapped (fully-backfilled) theme with a
        // copy missing newer sections, and applyForRoute() would then read
        // e.g. theme.loading as undefined and (worse) re-apply a half-empty
        // theme — the "theme loading not working after edit" symptom.
        return {
          ...DEFAULT_THEME,
          ...spec,
          id: s.id,
          name: s.name,
          description: s.description,
          builtin: !!s.builtin,
          created_at: s.created_at,
          updated_at: s.updated_at,
          card: { ...DEFAULT_THEME.card, ...(spec.card || {}), glass_style: (spec.card && spec.card.glass_style) || DEFAULT_THEME.card.glass_style },
          dropdowns: { ...DEFAULT_THEME.dropdowns, ...(spec.dropdowns || {}) },
          customCSS: migrateCustomCSS((spec as any).customCSS),
        };
      });
      const globalAssignments: Partial<Record<Scope, string>> = {};
      for (const a of store.assignments || []) {
        globalAssignments[a.scope as Scope] = a.theme_id;
      }
      set({ globalThemes, globalAssignments, globalLoaded: true });
      if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
    } catch {
      // Offline / not-yet-logged-in / 403: keep local-only resolution. The
      // next successful loadGlobal (e.g. after login) will populate it.
    }
  },

  active: () => {
    const pth = typeof window !== 'undefined' ? window.location.pathname : '/';
    return get().resolveThemeForRoute(pth);
  },

  resolveThemeForRoute: (pathname) => {
    return resolveThemeFromStore(get(), pathname);
  },

  applyForRoute: (pathname) => {
    applyTheme(resolveThemeFromStore(get(), pathname), { pathname });
  },

  assignTheme: (themeId, scope) => {
    const { themes, globalThemes } = get();
    // A theme picked from the admin's GLOBAL library (only present on the
    // server, not in this user's local list) becomes a GLOBAL assignment so
    // EVERYONE sees it on that area/page. A theme from the user's personal
    // library stays a LOCAL (localStorage) assignment so it wins for this
    // user only — the admin's shared theme still applies for everyone else.
    const onlyGlobal = globalThemes.some((t) => t.id === themeId) && !themes.some((t) => t.id === themeId);
    if (onlyGlobal) {
      // OPTIMISTIC update: flip the binding into the in-memory global
      // assignments IMMEDIATELY so the checkbox reflects the click at
      // once (matching the instant LOCAL path). The server PUT runs in
      // the background and only reverts on failure — previously the row
      // stayed "unchecked" for the whole network round-trip (~2-3s on a
      // remote panel), which read as "global assignment is broken".
      const prev = get().globalAssignments[scope];
      const globalAssignments = { ...get().globalAssignments, [scope]: themeId };
      set({ globalAssignments });
      if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
      assignGlobalTheme(scope, themeId)
        .catch(() => {
          // Revert the optimistic flip so the row reads unchecked again,
          // and re-apply the route theme without the now-failed binding.
          const reverted = { ...get().globalAssignments };
          if (prev) reverted[scope] = prev; else delete reverted[scope];
          set({ globalAssignments: reverted });
          if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
          /* the assignment dropdown surfaces its own errors */
        });
      return;
    }
    if (!themes.some((t) => t.id === themeId)) return;
    const assignments = { ...get().assignments, [scope]: themeId };
    set({ assignments });
    persistFrom(get);
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },

  unassignTheme: (scope) => {
    // Un-assign from wherever it's bound: clear the LOCAL binding, and if a
    // global binding exists for the same scope, clear it on the server too.
    if (get().assignments[scope]) {
      const assignments = { ...get().assignments };
      delete assignments[scope];
      set({ assignments });
      persistFrom(get);
    }
    if (get().globalAssignments[scope]) {
      // OPTIMISTIC: clear the global binding immediately so the row
      // unchecks at once (matches LOCAL), then reconcile on the server.
      const prev = get().globalAssignments[scope];
      const optimistic = { ...get().globalAssignments };
      delete optimistic[scope];
      set({ globalAssignments: optimistic });
      assignGlobalTheme(scope, '')
        .catch(() => {
          // Revert: the server refused — restore the prior binding.
          const reverted = { ...get().globalAssignments, [scope]: prev };
          set({ globalAssignments: reverted });
        });
    }
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },

  assignmentsFor: (themeId) => {
    return Object.entries(get().assignments)
      .filter(([, tid]) => tid === themeId)
      .map(([scope]) => scope as Scope);
  },

  createTheme: (theme) => {
    const themes = [...get().themes.filter((t) => t.id !== theme.id), theme];
    set({ themes });
    persistFrom(get);
  },

  updateTheme: (id, patch) => {
    const themes = get().themes.map((t) =>
      t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t,
    );
    set({ themes });
    persistFrom(get);
    if (typeof window !== 'undefined') {
      const tid = resolveThemeIdByRoute(window.location.pathname, get().assignments);
      if (tid === id) get().applyForRoute(window.location.pathname);
    }
  },

  deleteTheme: (id) => {
    if (id === 'default') return;
    const themes = get().themes.filter((t) => t.id !== id);
    const assignments: Partial<Record<Scope, string>> = {};
    for (const [scope, tid] of Object.entries(get().assignments)) {
      if (tid !== id) assignments[scope as Scope] = tid;
    }
    set({ themes, assignments });
    persistFrom(get);
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },

  // ---- Global (server-published) theme management ----
  // These mirror local CRUD but persist to /api/themes so the theme is
  // shared by EVERY user. They refresh globalThemes after the mutation so the
  // resolver + Themes page paint the canonical server state.

  createGlobalTheme: async (theme) => {
    const saved = await createGlobalThemeApi({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      builtin: theme.builtin,
      spec: theme,
    });
    const t: Theme = { ...theme, id: saved.id, name: saved.name, description: saved.description, builtin: saved.builtin };
    set({ globalThemes: [...get().globalThemes.filter((x) => x.id !== t.id), t] });
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
    return t;
  },

  updateGlobalTheme: async (id, patch) => {
    const existing = get().globalThemes.find((x) => x.id === id);
    if (!existing) throw new Error('theme not found');
    const merged: Theme = { ...existing, ...patch, id, updated_at: new Date().toISOString() };
    const saved = await updateGlobalThemeApi(id, {
      id,
      name: merged.name,
      description: merged.description,
      builtin: merged.builtin,
      spec: merged,
    });
    const t: Theme = { ...merged, id: saved.id, name: saved.name, description: saved.description, builtin: saved.builtin, updated_at: saved.updated_at };
    set({ globalThemes: get().globalThemes.map((x) => (x.id === id ? t : x)) });
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
    return t;
  },

  deleteGlobalTheme: async (id) => {
    await deleteGlobalThemeApi(id);
    set({ globalThemes: get().globalThemes.filter((x) => x.id !== id) });
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },

  beginDraft: (seed) => {
    const base = seed ? structuredCloneSafe(seed) : structuredCloneSafe(get().active());
    // beginDraft creates a NEW theme: blank id so save(false) allocates a
    // fresh one in saveDraft. The seed's *values* are kept as the starting
    // point so "New theme" picks up from the look the admin sees today.
    // Backfill any missing new fields from DEFAULT so older saved themes
    // (that pre-date card.glass_style) still populate them on draft.
    set({
      draft: {
        ...base,
        id: '',
        name: base.name === 'Default' ? 'My Theme' : base.name,
        builtin: false,
        card: { ...DEFAULT_THEME.card, ...base.card, glass_style: base.card.glass_style || DEFAULT_THEME.card.glass_style },
        // Backfill customCSS from the seed (or empty when the seed pre-dates
        // the field) so the studio never reads undefined. The seed's
        // values are intentionally KEPT — beginDraft's contract is "new
        // theme starts from the look the admin sees today", and custom
        // CSS is part of that look. The admin can clear it in the studio
        // if they want a clean slate.
        customCSS: migrateCustomCSS((base as any).customCSS),
      },
    });
  },

  editDraft: (seed) => {
    // editDraft preserves the seed's id so save(false) updates the existing
    // theme in place. Without preservation every Edit flow would clone.
    // customCSS is backfilled defensively so an older seed (no customCSS
    // field yet) still shows a well-shaped section in the studio.
    const clone = structuredCloneSafe(seed);
    set({
      draft: {
        ...clone,
        customCSS: migrateCustomCSS((clone as any).customCSS),
      },
    });
  },

  patchDraft: (section, patch) => {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, [section]: { ...(d as any)[section], ...patch } } });
    // Preview the in-progress draft live so the admin sees the panel
    // repaint as they drag a slider — without committing yet. Passing
    // { preview: true } makes the custom-CSS applier emit EVERY
    // per-route scope block so the admin sees all their scoped CSS
    // while editing regardless of the studio's current URL.
    applyTheme({ ...d, [section]: { ...(d as any)[section], ...patch } }, { preview: true });
  },

  patchDraftMeta: (patch) => {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, ...patch } });
  },

  saveDraft: (asNew) => {
    const d = get().draft;
    if (!d) return get().active();
    const now = new Date().toISOString();
    let saved: Theme;
    if (asNew || !d.id) {
      const id = d.id || 'theme-' + Date.now().toString(36);
      saved = { ...d, id, created_at: now, updated_at: now, builtin: false };
      get().createTheme(saved);
    } else {
      saved = { ...d, updated_at: now };
      get().updateTheme(d.id, saved);
    }
    set({ draft: null });
    // Saving a theme no longer auto-activates it globally — assignment is
    // an explicit act via the Themes list "Apply to..." dropdown. BUT: the
    // user expects "I just saved a card with a gradient, show it on the
    // panel right now". We re-apply the just-saved theme's spec DIRECTLY
    // (not via the resolver) so the new card bg / image / video / gradient
    // paint immediately. Navigation away re-resolves against the route so
    // the next page picks whichever assignment is in effect.
    applyTheme(saved, { pathname: typeof window !== 'undefined' ? window.location.pathname : '/' });
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
    return saved;
  },

  discardDraft: () => {
    set({ draft: null });
    // Restore the route-resolved theme so the panel snaps back to its
    // committed state rather than holding a half-edited look.
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },

  reapply: () => {
    if (typeof window !== 'undefined') get().applyForRoute(window.location.pathname);
  },
}));

// structuredClone is only available in newer evergreen browsers; fall
// back to JSON round-trip for the subset of browsers kspanel targets.
function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(v);
  }
  return JSON.parse(JSON.stringify(v));
}
