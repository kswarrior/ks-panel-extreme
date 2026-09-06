import create from 'zustand';
import type { Theme, ThemeKey, ThemeCustomCSS } from '@/features/themes/types/theme';
import { DEFAULT_THEME } from '@/theme/defaults';
import { rgbaAt } from '@/theme/colorUtils';
import { AREAS, areaFor, bestPageFor, type AreaId } from '@/features/instance-pages/types/pageregistry';
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
      // section was added: backfill EVERY section from DEFAULT so the
      // studio + applier never read undefined for older themes.
      .map((t) => migrateThemeSections(t));
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
  // Page-level override: most-specific catalog page wins (bestPageFor =
  // longest-path match). Previously this was first-match-wins with a
  // catch-all auth matcher first in the catalogue, so page:auth.login fired
  // on EVERY route and every other page:* assignment was dead.
  const best = bestPageFor(pathname);
  if (best) {
    const tid = assignments[scopeForPage(best.id)];
    if (tid) return tid;
  }
  // Instance sub-page fallback: /instances/:id/<tab>/... should inherit the theme
  // assigned to that tab's page (e.g. files/edit follows page:instance.panel.files).
  // The exact match above fails for sub-paths because tab matchers are exact; this
  // prefix check ensures complete theme support for every instance page including sub-pages
  // like files/edit which live inside the Files page family.
  const instSub = pathname.match(/^\/instances\/\d+\/([^/]+)(\/.*)?$/);
  if (instSub) {
    const tab = instSub[1];
    const tabPageMap: Record<string, string> = {
      files: 'instance.panel.files',
      network: 'instance.panel.network',
      terminal: 'instance.panel.terminal',
      settings: 'instance.panel.settings',
      metrics: 'instance.panel.custom',
      audit: 'instance.panel.custom',
      automation: 'instance.panel.custom',
      backups: 'instance.panel.custom',
      env: 'instance.panel.custom',
      ports: 'instance.panel.custom',
      processes: 'instance.panel.custom',
    };
    const mapped = tabPageMap[tab] || 'instance.panel.custom';
    // Prefer exact tab's page assignment if admin set it; otherwise the generic custom catch-all
    const tidExact = assignments[scopeForPage(mapped)];
    if (tidExact) return tidExact;
    if (mapped !== 'instance.panel.custom') {
      const tidCustom = assignments[scopeForPage('instance.panel.custom')];
      if (tidCustom) return tidCustom;
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
  const op = clampNum(bg.opacity, 0, 0, 1);

  if (bg.type === 'image' && bg.image_url) {
    // cssUrl validates the scheme (http(s)/data:image|video/blob/root-relative),
    // strips quote/backslash break-out characters and rejects absurd
    // lengths — a rejected URL renders no layer instead of injecting CSS.
    const url = cssUrl(bg.image_url);
    if (!url) return '';
    const rep = bg.repeat === 'repeat' ? 'repeat' : 'no-repeat';
    return `<div id="${BG_ID}" style="${base}opacity:${op};${blurFilter}background-image:url('${url}');background-position:${safeCssValue(bg.position, 'center')};background-size:${safeCssValue(bg.size, 'cover')};background-repeat:${rep};background-attachment:${bg.attachment === 'scroll' ? 'scroll' : 'fixed'};"></div>`;
  }
  if (bg.type === 'video' && bg.video_url) {
    // Build the <video><source> tree via the DOM API instead of inlining
    // the URL into an innerHTML template — attribute injection is
    // structurally impossible this way. The URL itself still goes through
    // cssUrl so disallowed schemes never reach a src attribute.
    const src = cssUrl(bg.video_url);
    if (!src) return '';
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
    source.src = src;
    video.appendChild(source);
    wrap.appendChild(video);
    return wrap.outerHTML;
  }
  if (bg.type === 'gradient' && bg.gradient) {
    return `<div id="${BG_ID}" style="${base}background-image:${safeCssValue(bg.gradient)};"></div>`;
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
    const url = cssUrl(c.bg_image);
    if (!url) return 'none';
    const img = `url('${url}')`;
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

// ------------------------------------------------------------------
// Value sanitisation (security)
// ------------------------------------------------------------------
// Structured theme fields (colours, gradients, font stacks, shadows,
// media URLs) are interpolated into ONE shared <style> element. A value
// containing braces / semicolons / backslashes could close its declaration
// or the whole :root block early and inject arbitrary CSS rules into
// EVERY user's panel (anyone who can persist a local theme, and every
// consumer of an installed global theme, is a potential source). These
// helpers make that impossible while keeping legitimate values intact.
//
// The Custom CSS tab stays raw ON PURPOSE — it is the documented admin
// escape hatch and is emitted verbatim; these guards cover the structured
// tokens only.

// safeCssValue strips characters that would break out of a declaration or
// block ({, }, ;, backslash, angle brackets) plus control characters, and
// caps length so a pasted payload can't bloat every route's stylesheet.
function safeCssValue(v: unknown, fallback = ''): string {
  const s = String(v ?? '')
    .replace(/[{}<>\\;]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!s) return fallback;
  return s.slice(0, 512);
}

// cssUrl validates a media URL before it reaches a CSS url('…') context.
// Only http(s), https-style absolute URLs, inline image/video data: URLs,
// blob: URLs (the studio uploader) and root-relative paths are allowed — this
// rejects javascript:, vbscript:, data:text/html and other schemes that
// have no business in a background layer. Returns '' when rejected; the
// caller emits 'none' / skips the layer. Quotes are escaped so the value
// cannot terminate the url('…') wrapper early.
//
// Length caps are scheme-aware: remote/relative/blob URLs stay short (4096),
// while self-contained data: URLs (the studio inlines uploads via
// FileReader.readAsDataURL) legitimately run to hundreds of KB — capping
// those at 4096 silently dropped every uploaded wallpaper, rendering as a
// missing background on every page using the theme.
const CSS_URL_RE = /^(https?:\/\/|data:(image|video)\/[a-z0-9.+-]+(;base64)?,|blob:|\/)/i;
const MAX_REMOTE_URL_LEN = 4096;
const MAX_DATA_URL_LEN = 10 * 1024 * 1024;

function cssUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || !CSS_URL_RE.test(s)) return '';
  const cap = s.toLowerCase().startsWith('data:') ? MAX_DATA_URL_LEN : MAX_REMOTE_URL_LEN;
  if (s.length > cap) return '';
  return s.replace(/['\\]/g, '');
}

// num coerces a persisted slider value to a finite number, falling back to
// the default so a corrupt value can't emit "NaNpx" into the stylesheet.
function num(v: unknown, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// clampNum coerces + clamps in one step (used for opacity-style ranges).
function clampNum(v: unknown, def: number, min: number, max: number): number {
  const n = num(v, def);
  return Math.max(min, Math.min(max, n));
}

// softRgba derives a translucent glow colour from a hex accent: '#6ee7b7'
// at 0.14 → 'rgba(110,231,183,0.14)'. Non-hex input (rgba(), named colour,
// garbage) passes through untouched so the declaration stays valid.
function softRgba(v: unknown, alpha: number): string {
  const s = String(v ?? '').trim();
  const m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) return s || 'rgba(110,231,183,0.14)';
  const n = parseInt(m[1], 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// sectionBackfill merges a possibly-missing/partial persisted section onto
// DEFAULT so every downstream reader sees a well-shaped object. This is the
// single forward-migration path for theme sections added after a theme was
// saved (used by localStorage load, server bootstrap and API refresh).
function sectionBackfill<T extends object>(raw: unknown, base: T): T {
  if (!raw || typeof raw !== 'object') return { ...base };
  return { ...base, ...(raw as Partial<T>) };
}

// migrateThemeSections normalises an entire persisted/fetched Theme onto the
// CURRENT shape: every section is backfilled from DEFAULT_THEME and the
// custom-CSS map is cleaned. Older stored themes therefore never leave a
// hole the studio/applier would read as undefined.
function migrateThemeSections(t: any): Theme {
  const card = sectionBackfill(t?.card, DEFAULT_THEME.card);
  // Legacy single `gap` field folds into the h/v pair — checked against the
  // RAW persisted values (not the backfilled merge, which always carries
  // DEFAULT's gap_h/gap_v).
  if (t?.card?.gap != null && t.card.gap_h == null && t.card.gap_v == null) {
    card.gap_h = t.card.gap;
    card.gap_v = t.card.gap;
  }
  return {
    ...(DEFAULT_THEME),
    ...(t || {}),
    id: t?.id ?? 'default',
    name: t?.name ?? DEFAULT_THEME.name,
    description: t?.description ?? '',
    builtin: !!t?.builtin,
    card,
    button: sectionBackfill(t?.button, DEFAULT_THEME.button),
    header: sectionBackfill(t?.header, DEFAULT_THEME.header),
    typography: sectionBackfill(t?.typography, DEFAULT_THEME.typography),
    accent: sectionBackfill(t?.accent, DEFAULT_THEME.accent),
    shape: sectionBackfill(t?.shape, DEFAULT_THEME.shape),
    sidebar: sectionBackfill(t?.sidebar, DEFAULT_THEME.sidebar),
    background: sectionBackfill(t?.background, DEFAULT_THEME.background),
    loading: sectionBackfill(t?.loading, DEFAULT_THEME.loading),
    tabs: sectionBackfill(t?.tabs, DEFAULT_THEME.tabs),
    dropdowns: sectionBackfill(t?.dropdowns, DEFAULT_THEME.dropdowns),
    pill: sectionBackfill(t?.pill, DEFAULT_THEME.pill),
    menu: sectionBackfill(t?.menu, DEFAULT_THEME.menu),
    forms: sectionBackfill(t?.forms, DEFAULT_THEME.forms),
    components: sectionBackfill(t?.components, DEFAULT_THEME.components),
    utilities: sectionBackfill(t?.utilities, DEFAULT_THEME.utilities),
    cards: sectionBackfill(t?.cards, DEFAULT_THEME.cards),
    customCSS: migrateCustomCSS(t?.customCSS),
  };
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
  const opacity = clampNum(d?.bg_opacity, 1, 0, 1);
  const scrim = 'rgba(0,0,0,' + (1 - opacity) + ')';
  if (d?.bg_type === 'image' && d?.bg_image) {
    const url = cssUrl(d.bg_image);
    if (!url) return 'none';
    const img = `url('${url}')`;
    return scrim + ' linear-gradient(' + img + ',' + img + ')';
  }
  if (d?.bg_type === 'gradient' && d?.bg_gradient) {
    const g = safeCssValue(d.bg_gradient);
    return g ? scrim + ' ' + g : 'none';
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
  const seen = new Set<string>();
  const push = (scope: string, suffix = '') => {
    if (seen.has(scope)) return;
    const css = scopes[scope];
    if (css) {
      out.push(`/* Custom CSS — ${scope}${suffix} */\n${css}`);
      seen.add(scope);
    }
  };
  // Page-level override: most-specific catalog page wins (mirrors
  // resolveThemeIdByRoute's bestPageFor semantics exactly).
  const best = bestPageFor(pathname);
  if (best) {
    push(scopeForPage(best.id));
  }
  // Instance sub-page fallback: mirror resolveThemeIdByRoute exactly so a
  // Custom CSS block assigned to page:instance.panel.files also emits on
  // /instances/123/files/edit (the exact tab matcher is exact-only, while
  // the catch-all instance.panel.custom matches the sub-path first). This
  // runs for EVERY instance sub-page — not only when the exact loop
  // missed — because the exact loop matches the catch-all custom page for
  // sub-paths and would otherwise shadow the tab-specific block.
  // Map mirrors resolveThemeIdByRoute's tabPageMap one-to-one.
  const instSub = pathname.match(/^\/instances\/\d+\/([^/]+)(\/.*)?$/);
  if (instSub) {
    const tab = instSub[1];
    const tabPageMap: Record<string, string> = {
      files: 'instance.panel.files',
      network: 'instance.panel.network',
      terminal: 'instance.panel.terminal',
      settings: 'instance.panel.settings',
      metrics: 'instance.panel.custom',
      audit: 'instance.panel.custom',
      automation: 'instance.panel.custom',
      backups: 'instance.panel.custom',
      env: 'instance.panel.custom',
      ports: 'instance.panel.custom',
      processes: 'instance.panel.custom',
    };
    const mapped = tabPageMap[tab] || 'instance.panel.custom';
    push(scopeForPage(mapped), ' (sub-page)');
    if (mapped !== 'instance.panel.custom') {
      push(scopeForPage('instance.panel.custom'), ' (sub-page)');
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

// sanitizeThemeTokens deep-walks the STRUCTURED theme sections and hardens
// every value before it reaches the stylesheet: strings lose block/decl
// break-out characters ({ } ; \ < > + control chars) and length cap at 512,
// numbers are coerced finite. customCSS is deliberately EXCLUDED — it is
// the documented raw escape hatch. Media URLs are validated at their point
// of use (cssUrl) rather than here because they need scheme checks, not
// just character stripping. Running this ONCE at buildVars entry means
// every downstream `${…}` interpolation — including the legacy `?? fallback`
// reads for tabs/dropdowns — emits hardened values without touching each
// template line.
function sanitizeThemeTokens(theme: Theme): Theme {
  // Media URL fields are validated at their point of use by cssUrl()
  // (scheme allowlist + quote stripping), so they must NOT go through
  // safeCssValue: it strips ';' — corrupting data:image/png;base64,… into
  // the undecodable data:image/pngbase64,… — and truncates to 512 chars,
  // slicing base64 payloads in half. Both failure modes render as a missing
  // background image on every page using the theme. Gradient fields DO go
  // through safeCssValue (they need the {};\<> stripping and are short).
  const URL_KEYS = new Set(['image_url', 'video_url', 'bg_image', 'bg_video']);
  const cleanSection = (sec: unknown): Record<string, unknown> => {
    if (!sec || typeof sec !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sec as Record<string, unknown>)) {
      if (typeof v === 'string') {
        if (URL_KEYS.has(k)) {
          const t = v.trim();
          out[k] = t.length > MAX_DATA_URL_LEN ? '' : t;
        } else {
          out[k] = safeCssValue(v);
        }
      }
      else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
      else if (typeof v === 'boolean') out[k] = v;
      else out[k] = v;
    }
    return out;
  };
  const t = theme;
  return {
    ...t,
    background: cleanSection(t.background) as unknown as Theme['background'],
    card: cleanSection(t.card) as unknown as Theme['card'],
    sidebar: cleanSection(t.sidebar) as unknown as Theme['sidebar'],
    header: cleanSection(t.header) as unknown as Theme['header'],
    typography: cleanSection(t.typography) as unknown as Theme['typography'],
    accent: cleanSection(t.accent) as unknown as Theme['accent'],
    shape: cleanSection(t.shape) as unknown as Theme['shape'],
    loading: cleanSection(t.loading) as unknown as Theme['loading'],
    button: cleanSection(t.button) as unknown as Theme['button'],
    tabs: cleanSection(t.tabs) as unknown as Theme['tabs'],
    dropdowns: cleanSection(t.dropdowns) as unknown as Theme['dropdowns'],
    pill: cleanSection(t.pill) as unknown as Theme['pill'],
    menu: cleanSection(t.menu) as unknown as Theme['menu'],
    forms: cleanSection(t.forms) as unknown as Theme['forms'],
    components: cleanSection(t.components) as unknown as Theme['components'],
    utilities: cleanSection(t.utilities) as unknown as Theme['utilities'],
    cards: cleanSection(t.cards) as unknown as Theme['cards'],
  };
}

function buildVars(theme: Theme, opts?: ApplyOpts): string {
  // Cache key includes updated_at so an edited/saved theme with the same id
  // can never serve a stale stylesheet, and preview builds (the studio's
  // live draft) bypass the cache entirely — every slider tick must repaint.
  const preview = !!opts?.preview;
  const cacheKey = `${theme.id}|${theme.updated_at || ''}|${opts?.pathname || ''}`;
  if (!preview) {
    const cached = buildVarsCache.get(cacheKey);
    if (cached) return cached;
  }

  // Harden every structured token FIRST so nothing below can emit a value
  // capable of breaking out of its CSS declaration/block.
  theme = sanitizeThemeTokens(theme);

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
  const css = `
:root {
  --ks-bg-color: ${bg.color};
  --ks-bg-gradient: ${bg.type === 'gradient' ? bg.gradient : 'none'};
  --ks-font-family: ${t.font_family};
  --ks-text-body: ${t.body_color};
  --ks-text-heading: ${t.heading_color};
  --ks-text-card: ${c.text_color};
  --ks-link: ${t.link_color};
  /* Instance-page token aliases — host ↔ iframe parity so markdown/blocks
     and HTML-iframe pages consume the same semantic tokens (the iframe
     stylesheet uses --ks-heading/--ks-body/--ks-muted/--ks-ok/--ks-warn
     etc; the host now exposes the same names). */
  --ks-heading: ${t.heading_color};
  --ks-body: ${t.body_color};
  --ks-secondary: ${rgbaAt(t.body_color, 0.88, '#d1d5db')};
  --ks-muted: ${t.body_color};
  --ks-faint: ${safeCssValue(theme.forms.label_hint_color, '#6b7280')};
  --ks-ok: ${rgbaAt(a.success, 1, '#34d399')};
  --ks-warn: ${rgbaAt(a.warning, 1, '#fbbf24')};
  --ks-bad: ${rgbaAt(a.danger, 1, '#ef4444')};
  --ks-info: ${rgbaAt(a.info, 1, '#38bdf8')};
  --ks-purple: #c4b5fd;
  --ks-pink: #f0abfc;
  --ks-cyan: #22d3ee;
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
  --ks-card-bg-video: ${c.bg_type === 'video' ? cssUrl(c.bg_video) : ''};
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
  --ks-dropdown-bg-image: ${(theme as any).dropdowns?.bg_image ? (cssUrl((theme as any).dropdowns.bg_image) || '') : ''};
  --ks-dropdown-bg-video: ${(theme as any).dropdowns?.bg_video ? (cssUrl((theme as any).dropdowns.bg_video) || '') : ''};
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
  --ks-sidebar-width: ${clampNum(s.width, DEFAULT_THEME.sidebar.width, 160, 320)}px;

  --ks-header-bg: ${h.background};
  --ks-header-blur: ${h.backdrop_blur}px;
  --ks-header-border: ${h.border_color};
  --ks-header-text: ${h.text_color};
  --ks-header-height: ${h.height}px;
  /* Header page-switch loading bar (Header.tsx). The bar fill + track +
     thickness are theme-driven so the studio's Header tab restyles the
     sweep without touching Header.tsx; position/enabled are read by
     Header.tsx from the resolved theme (they change layout, not paint). */
  --ks-header-loading-bar-color: ${safeCssValue((h as any).loading_bar_color ?? '#ffffff', '#ffffff')};
  --ks-header-loading-bar-background: ${safeCssValue((h as any).loading_bar_background ?? 'transparent', 'transparent')};
  --ks-header-loading-bar-height: ${clampNum((h as any).loading_bar_height, DEFAULT_THEME.header.loading_bar_height, 1, 8)}px;

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
  /* Scope cards (System page top sweep line + icon tile). */
  --ks-scope-line: ${(theme as any).tabs?.scope_line_color ?? 'currentColor'};
  --ks-scope-line-height: ${(theme as any).tabs?.scope_line_height ?? 2}px;
  --ks-scope-line-speed: ${(theme as any).tabs?.scope_line_speed ?? 380}ms;
  --ks-scope-icon: ${(theme as any).tabs?.scope_icon_size ?? 40}px;
  /* Section rail (Security + Database shared style). */
  --ks-rail-indicator: ${(theme as any).tabs?.rail_indicator_color ?? 'currentColor'};
  --ks-rail-indicator-height: ${(theme as any).tabs?.rail_indicator_height ?? 2}px;
  --ks-rail-icon: ${(theme as any).tabs?.rail_icon_size ?? 16}px;

  --ks-loading-color: ${l.color};
  --ks-loading-bg: ${l.background};
  --ks-loading-text: ${l.text_color};
  --ks-loading-size: ${l.size};
  --ks-loading-animation: ${l.animation_speed};
  /* Skeleton token hooks consumed by Loading/SkeletonCard defaults so the
     Loading-tab skeleton sliders restyle every list-page skeleton too. */
  --ks-skeleton-base: ${l.skeleton_base_color};
  --ks-skeleton-shimmer: ${l.skeleton_shimmer_color};
  --ks-skeleton-radius: ${num(l.skeleton_radius, 6)}px;
  /* Animation duration derived from the speed preset so the actual Loading
     indicator's animate-* classes can pick it up via a scoped rule below. */
   --ks-loading-animation-duration: ${l.animation_speed === 'slow' ? '2s' : l.animation_speed === 'fast' ? '0.5s' : '1s'};
${buildSectionVars(theme).vars}
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
.glass-card,
.ks-card {
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
.glass-card:hover,
.ks-card:hover { border-color: var(--ks-card-hover-border) !important; }

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
}
/* Themed width — sidebar width from the Theme Studio is now fully
   supported on every breakpoint. The collapsed state keeps w-16 (64px)
   via .ks-sidebar-collapsed; the :not() guard guarantees the collapsed
   width is never clobbered. On mobile the drawer is clamped to 85vw so
   an admin-set 320px doesn't swallow a 360px phone, while still
   respecting the themed width up to that limit. flex-basis + max-width
   are set alongside width/min-width so the flex parent (Layout) honors
   the themed size without shrinking. */
.ks-sidebar-bg:not(.ks-sidebar-collapsed) {
  width: var(--ks-sidebar-width, 225px) !important;
  min-width: var(--ks-sidebar-width, 225px) !important;
  max-width: var(--ks-sidebar-width, 225px) !important;
  flex-basis: var(--ks-sidebar-width, 225px) !important;
}
@media (max-width: 767px) {
  .ks-sidebar-bg:not(.ks-sidebar-collapsed) {
    width: min(var(--ks-sidebar-width, 225px), 85vw) !important;
    min-width: min(var(--ks-sidebar-width, 225px), 85vw) !important;
    max-width: min(var(--ks-sidebar-width, 225px), 85vw) !important;
    flex-basis: min(var(--ks-sidebar-width, 225px), 85vw) !important;
  }
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

/* Header surface — fill / blur / border + min-height from theme. Height is
   auto (not fixed) so normal single-row pages stay at --ks-header-height
   (vertically centered by <header>'s flex) while the instance panel's
   stacked rows (tabs + power dock) can grow instead of squeezing up. */
.ks-header-bg {
  background: var(--ks-header-bg) !important;
  backdrop-filter: blur(var(--ks-header-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-header-blur)) !important;
  border-color: var(--ks-header-border) !important;
  color: var(--ks-header-text);
  height: auto !important;
  min-height: var(--ks-header-height, 56px) !important;
}

/* Header page-switch loading bar — Google-style hairline pinned to the
   header edge while a page opens. The track paints the theme's
   loading_bar_background; the fill paints loading_bar_color. Thickness
   comes from loading_bar_height so the studio slider restyles it live.
   A dedicated element (not border-b) is used so the themed
   --ks-header-border (!important) can never recolor it. */
.ks-header-loading-track {
  background-color: var(--ks-header-loading-bar-background, transparent) !important;
  height: var(--ks-header-loading-bar-height, 2px) !important;
}
.ks-header-loading-fill {
  background-color: var(--ks-header-loading-bar-color, #ffffff) !important;
  height: 100% !important;
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
${buildSectionRules(theme)}
${buildUtilityMappings(theme)}
  `.trim() + (customBlock ? '\n\n' + customBlock : '');

  // Store only production builds; unbounded growth is capped by clearing
  // the map once it exceeds a small working set (one entry per route).
  if (!preview) {
    if (buildVarsCache.size > 64) buildVarsCache.clear();
    buildVarsCache.set(cacheKey, css);
  }
  return css;
}

// ------------------------------------------------------------------
// Forms / Components / Utilities / Cards — section emission
// ------------------------------------------------------------------
// buildSectionVars + buildSectionRules materialise the four studio
// sections added to the Theme model. They are kept separate from the
// legacy template above so each surface owns exactly one source of truth:
//
//   forms      → every form control (.ks-input/.ks-select/… plus the
//                stock Tailwind input pattern used across pages)
//   components → modal dialogs + overlay + strong glass + app chrome
//   utilities  → design tokens (--ks-ui-*, spacing, radii, elevations,
//                transition speeds, z-index scale)
//   cards      → list / stat / form card variants
//
// Variant tokens whose value still equals DEFAULT are emitted as the
// corresponding BASE var (e.g. --ks-card-bg) instead of a literal, so the
// Card tab keeps cascading to list/stat/form/glass-strong surfaces until
// an admin explicitly overrides that variant. This preserves the pre-
// existing behaviour where one Card-tab slider reshaped every surface.
function buildSectionVars(theme: Theme): { vars: string } {
  const D = DEFAULT_THEME;
  const f = theme.forms;
  const comp = theme.components;
  const u = theme.utilities;
  const cd = theme.cards;

  // eqTok resolves a variant token: equal-to-default ⇒ inherit the live
  // base var; otherwise emit the (already sanitised) literal.
  const eqTok = (v: unknown, d: unknown, baseVar: string): string =>
    v === d ? baseVar : String(v || baseVar);

  // ---- toggle geometry (computed once, consumed as vars) ----
  const tH = clampNum(f.toggle_track_height, D.forms.toggle_track_height, 12, 48);
  const tT = clampNum(f.toggle_thumb_size, D.forms.toggle_thumb_size, 8, tH - 2);
  const tW = Math.round(tH * (44 / 24)); // stock ratio w-11/h-6
  const tOff = Math.round((tH - tT) / 2);
  const travel = Math.max(2, tW - tT - tOff * 2);

  // ---- focus ring shadow (composed; offset layer only when > 0) ----
  const ringW = clampNum(f.focus_ring_width, D.forms.focus_ring_width, 0, 8);
  const ringO = clampNum(f.focus_ring_offset, D.forms.focus_ring_offset, 0, 8);
  const focusShadowParts = [`0 0 0 ${ringW}px ${safeCssValue(f.input_focus_ring_color, 'transparent')}`];
  if (ringO > 0) focusShadowParts.push(`0 0 0 ${ringW + ringO}px ${safeCssValue(f.focus_ring_offset_color, '#0b0d10')}`);

  // ---- elevation composition ----
  const elev = (n: number) => `0 ${Math.round(n * 0.5)}px ${n}px rgba(0,0,0,0.45)`;

  return {
    vars: `
  /* ---------------- Theme Studio: Forms ---------------- */
  --ks-form-input-bg: ${safeCssValue(f.input_background)};
  --ks-form-input-text: ${safeCssValue(f.input_text_color, '#ffffff')};
  --ks-form-placeholder: ${safeCssValue(f.input_placeholder_color)};
  --ks-form-input-border: ${safeCssValue(f.input_border_color)};
  --ks-form-focus-border: ${safeCssValue(f.input_focus_border_color)};
  --ks-form-ring-color: ${safeCssValue(f.input_focus_ring_color)};
  --ks-form-focus-shadow: ${focusShadowParts.join(', ')};
  --ks-form-input-radius: ${clampNum(f.input_border_radius, D.forms.input_border_radius, 0, 32)}px;
  --ks-form-input-px: ${clampNum(f.input_padding_x, D.forms.input_padding_x, 0, 32)}px;
  --ks-form-input-py: ${clampNum(f.input_padding_y, D.forms.input_padding_y, 0, 32)}px;
  --ks-form-input-font: ${clampNum(f.input_font_size, D.forms.input_font_size, 8, 24)}px;

  --ks-form-select-bg: ${safeCssValue(f.select_background)};
  --ks-form-select-text: ${safeCssValue(f.select_text_color, '#ffffff')};
  --ks-form-select-border: ${safeCssValue(f.select_border_color)};
  --ks-form-select-radius: ${clampNum(f.select_border_radius, D.forms.select_border_radius, 0, 32)}px;
  --ks-form-select-px: ${clampNum(f.select_padding_x, D.forms.select_padding_x, 0, 32)}px;
  --ks-form-select-py: ${clampNum(f.select_padding_y, D.forms.select_padding_y, 0, 32)}px;
  --ks-form-select-font: ${clampNum(f.select_font_size, D.forms.select_font_size, 8, 24)}px;

  --ks-form-textarea-bg: ${safeCssValue(f.textarea_background)};
  --ks-form-textarea-text: ${safeCssValue(f.textarea_text_color, '#ffffff')};
  --ks-form-textarea-border: ${safeCssValue(f.textarea_border_color)};
  --ks-form-textarea-radius: ${clampNum(f.textarea_border_radius, D.forms.textarea_border_radius, 0, 32)}px;
  --ks-form-textarea-px: ${clampNum(f.textarea_padding_x, D.forms.textarea_padding_x, 0, 32)}px;
  --ks-form-textarea-py: ${clampNum(f.textarea_padding_y, D.forms.textarea_padding_y, 0, 32)}px;
  --ks-form-textarea-font: ${clampNum(f.textarea_font_size, D.forms.textarea_font_size, 8, 24)}px;

  --ks-check-off-bg: ${safeCssValue(f.checkbox_bg_unchecked)};
  --ks-check-on: ${safeCssValue(f.checkbox_bg_checked, '#10b981')};
  --ks-check-border: ${safeCssValue(f.checkbox_border_unchecked)};
  --ks-check-border-on: ${safeCssValue(f.checkbox_border_checked, '#10b981')};
  --ks-check-mark: ${safeCssValue(f.checkbox_checkmark_color, '#0b0d10')};
  --ks-check-size: ${clampNum(f.checkbox_size, D.forms.checkbox_size, 10, 32)}px;
  --ks-check-radius: ${clampNum(f.checkbox_border_radius, D.forms.checkbox_border_radius, 0, 16)}px;
  --ks-radio-off-bg: ${safeCssValue(f.radio_bg_unchecked)};
  --ks-radio-on: ${safeCssValue(f.radio_bg_checked, '#10b981')};
  --ks-radio-border: ${safeCssValue(f.radio_border_unchecked)};
  --ks-radio-border-on: ${safeCssValue(f.radio_border_checked, '#10b981')};
  --ks-radio-dot: ${safeCssValue(f.radio_dot_color, '#0b0d10')};
  --ks-radio-size: ${clampNum(f.radio_size, D.forms.radio_size, 10, 32)}px;

  --ks-toggle-off: ${safeCssValue(f.toggle_track_off)};
  --ks-toggle-on: ${safeCssValue(f.toggle_track_on, '#10b981')};
  --ks-toggle-thumb: ${safeCssValue(f.toggle_thumb_color, '#ffffff')};
  --ks-toggle-thumb-shadow: ${safeCssValue(f.toggle_thumb_shadow)};
  --ks-toggle-w: ${tW}px;
  --ks-toggle-h: ${tH}px;
  --ks-toggle-thumb-size: ${tT}px;
  --ks-toggle-offset: ${tOff}px;
  --ks-toggle-travel: ${travel}px;
  --ks-toggle-radius: ${clampNum(f.toggle_border_radius, D.forms.toggle_border_radius, 0, 9999)}px;

  --ks-label-text: ${safeCssValue(f.label_text_color, '#e5e7eb')};
  --ks-label-size: ${clampNum(f.label_font_size, D.forms.label_font_size, 8, 24)}px;
  --ks-label-weight: ${clampNum(f.label_font_weight, D.forms.label_font_weight, 100, 900)};
  --ks-hint-text: ${safeCssValue(f.hint_text_color)};
  --ks-hint-error: ${safeCssValue(f.hint_error_color, '#f87171')};
  --ks-hint-success: ${safeCssValue(f.hint_success_color, '#34d399')};
  --ks-hint-size: ${clampNum(f.hint_font_size, D.forms.hint_font_size, 8, 20)}px;
  --ks-field-bg: ${safeCssValue(f.field_bg, 'transparent')};
  --ks-field-gap: ${clampNum(f.field_gap, D.forms.field_gap, 0, 32)}px;
  --ks-field-mb: ${clampNum(f.field_margin_bottom, D.forms.field_margin_bottom, 0, 48)}px;

  /* ---------------- Theme Studio: Components ---------------- */
  --ks-comp-strong-bg: ${eqTok(comp.glass_strong_background, D.components.glass_strong_background, 'var(--ks-card-bg)')};
  --ks-comp-strong-border: ${eqTok(comp.glass_strong_border_color, D.components.glass_strong_border_color, 'var(--ks-card-border)')};
  --ks-comp-strong-shadow: ${eqTok(comp.glass_strong_shadow, D.components.glass_strong_shadow, 'var(--ks-card-shadow)')};
  --ks-comp-strong-radius: ${eqTok(comp.glass_strong_border_radius, D.components.glass_strong_border_radius, 'var(--ks-card-radius)')};
  --ks-comp-strong-blur: ${comp.glass_strong_backdrop_blur === D.components.glass_strong_backdrop_blur ? 'var(--ks-card-blur)' : `${num(comp.glass_strong_backdrop_blur, 1)}px`};

  --ks-modal-bg: ${eqTok(comp.modal_background, D.components.modal_background, 'var(--ks-comp-strong-bg)')};
  --ks-modal-border: ${eqTok(comp.modal_border_color, D.components.modal_border_color, 'var(--ks-comp-strong-border)')};
  --ks-modal-shadow: ${eqTok(comp.modal_shadow, D.components.modal_shadow, 'var(--ks-comp-strong-shadow)')};
  --ks-modal-overlay-c: ${safeCssValue(comp.modal_overlay_color, 'rgba(0,0,0,0.60)')};
  --ks-modal-radius: ${comp.modal_border_radius === D.components.modal_border_radius ? 'var(--ks-comp-strong-radius)' : `${num(comp.modal_border_radius, 5)}px`};
  --ks-modal-blur: ${comp.modal_backdrop_blur === D.components.modal_backdrop_blur ? 'var(--ks-comp-strong-blur)' : `${num(comp.modal_backdrop_blur, 1)}px`};

  --ks-chrome-bg: ${safeCssValue(comp.glass_chrome_background)};
  --ks-chrome-blur: ${num(comp.glass_chrome_backdrop_blur, 24)}px;
  --ks-chrome-border: ${safeCssValue(comp.glass_chrome_border_color)};

  /* ---------------- Theme Studio: Utilities ---------------- */
  --ks-ui-primary: ${safeCssValue(u.color_primary)};
  --ks-ui-secondary: ${safeCssValue(u.color_secondary)};
  --ks-ui-success: ${safeCssValue(u.color_success)};
  --ks-ui-warning: ${safeCssValue(u.color_warning)};
  --ks-ui-danger: ${safeCssValue(u.color_danger)};
  --ks-ui-muted: ${safeCssValue(u.color_muted)};
  --ks-space-base: ${num(u.spacing_base, 4)}px;
  --ks-radius-none: ${num(u.radius_none, 0)}px;
  --ks-radius-sm-u: ${num(u.radius_sm, 4)}px;
  --ks-radius-md-u: ${num(u.radius_md, 8)}px;
  --ks-radius-lg-u: ${num(u.radius_lg, 12)}px;
  --ks-radius-full-u: ${num(u.radius_full, 9999)}px;
  --ks-elev-1: ${elev(clampNum(u.shadow_1, 4, 0, 64))};
  --ks-elev-2: ${elev(clampNum(u.shadow_2, 8, 0, 64))};
  --ks-elev-3: ${elev(clampNum(u.shadow_3, 16, 0, 64))};
  --ks-elev-4: ${elev(clampNum(u.shadow_4, 24, 0, 64))};
  --ks-t-fast: ${clampNum(u.transition_fast, 150, 0, 2000)}ms;
  --ks-t-normal: ${clampNum(u.transition_normal, 200, 0, 2000)}ms;
  --ks-t-slow: ${clampNum(u.transition_slow, 300, 0, 4000)}ms;
  --ks-t-vslow: ${clampNum(u.transition_very_slow, 500, 0, 6000)}ms;
  --ks-z-dropdown: ${clampNum(u.z_dropdown, 50, 0, 9999)};
  --ks-z-modal: ${clampNum(u.z_modal, 60, 0, 9999)};
  --ks-z-tooltip: ${clampNum(u.z_tooltip, 70, 0, 9999)};
  --ks-z-toast: ${clampNum(u.z_toast, 80, 0, 9999)};
  --ks-z-overlay: ${clampNum(u.z_overlay, 40, 0, 9999)};

  /* ---------------- Theme Studio: Cards ---------------- */
  --ks-listcard-bg: ${eqTok(cd.list_background, D.cards.list_background, 'var(--ks-card-bg)')};
  --ks-listcard-border: ${eqTok(cd.list_border_color, D.cards.list_border_color, 'var(--ks-card-border)')};
  --ks-listcard-hover: ${eqTok(cd.list_hover_border_color, D.cards.list_hover_border_color, 'var(--ks-card-hover-border)')};
  --ks-listcard-shadow: ${eqTok(cd.list_shadow, D.cards.list_shadow, 'var(--ks-card-shadow)')};
  --ks-listcard-radius: ${cd.list_border_radius === D.cards.list_border_radius ? 'var(--ks-card-radius)' : `${num(cd.list_border_radius, 5)}px`};
  --ks-listcard-blur: ${cd.list_backdrop_blur === D.cards.list_backdrop_blur ? 'var(--ks-card-blur)' : `${num(cd.list_backdrop_blur, 1)}px`};
  --ks-listcard-padding: ${cd.list_padding === D.cards.list_padding ? 'var(--ks-card-padding)' : `${num(cd.list_padding, 15)}px`};

  --ks-statcard-bg: ${eqTok(cd.stat_background, D.cards.stat_background, 'var(--ks-card-bg)')};
  --ks-statcard-border: ${eqTok(cd.stat_border_color, D.cards.stat_border_color, 'var(--ks-card-border)')};
  --ks-statcard-icon: ${safeCssValue(cd.stat_icon_color, '#ffffff')};
  --ks-statcard-radius: ${cd.stat_border_radius === D.cards.stat_border_radius ? 'var(--ks-card-radius)' : `${num(cd.stat_border_radius, 5)}px`};
  --ks-statcard-px: ${cd.stat_padding_x === D.cards.stat_padding_x ? 'var(--ks-card-padding)' : `${num(cd.stat_padding_x, 15)}px`};
  --ks-statcard-py: ${cd.stat_padding_y === D.cards.stat_padding_y ? 'var(--ks-card-padding)' : `${num(cd.stat_padding_y, 15)}px`};

  --ks-formcard-bg: ${eqTok(cd.form_background, D.cards.form_background, 'var(--ks-card-bg)')};
  --ks-formcard-border: ${eqTok(cd.form_border_color, D.cards.form_border_color, 'var(--ks-card-border)')};
  --ks-formcard-shadow: ${eqTok(cd.form_shadow, D.cards.form_shadow, 'var(--ks-card-shadow)')};
  --ks-formcard-radius: ${cd.form_border_radius === D.cards.form_border_radius ? 'var(--ks-card-radius)' : `${num(cd.form_border_radius, 5)}px`};
  --ks-formcard-padding: ${cd.form_padding === D.cards.form_padding ? 'var(--ks-card-padding)' : `${num(cd.form_padding, 15)}px`};

  /* ---------------- Theme Studio: Pill (top-right actions) ---------------- */
  --ks-pill-bg: ${eqTok((theme as any).pill?.background, D.pill.background, 'var(--ks-card-bg)')};
  --ks-pill-border: ${eqTok((theme as any).pill?.border_color, D.pill.border_color, 'var(--ks-card-border)')};
  --ks-pill-border-width: ${num((theme as any).pill?.border_width, D.pill.border_width)}px;
  --ks-pill-radius: ${(theme as any).pill?.border_radius === D.pill.border_radius ? 'var(--ks-card-radius)' : `${num((theme as any).pill?.border_radius, 5)}px`};
  --ks-pill-padding: ${num((theme as any).pill?.padding, D.pill.padding)}px;
  --ks-pill-blur: ${(theme as any).pill?.backdrop_blur === D.pill.backdrop_blur ? 'var(--ks-card-blur)' : `${num((theme as any).pill?.backdrop_blur, 1)}px`};
  --ks-pill-shadow: ${eqTok((theme as any).pill?.shadow, D.pill.shadow, 'var(--ks-card-shadow)')};
  --ks-pill-text: ${safeCssValue((theme as any).pill?.text_color, '#e5e7eb')};
  --ks-pill-gap: ${num((theme as any).pill?.gap, D.pill.gap)}px;
  --ks-pill-tab-px: ${num((theme as any).pill?.tab_padding_x, D.pill.tab_padding_x)}px;
  --ks-pill-tab-py: ${num((theme as any).pill?.tab_padding_y, D.pill.tab_padding_y)}px;
  --ks-pill-tab-font: ${num((theme as any).pill?.font_size, D.pill.font_size)}px;
  --ks-pill-icon-size: ${num((theme as any).pill?.icon_size, D.pill.icon_size)}px;
  --ks-pill-anim-duration: ${clampNum((theme as any).pill?.animation_duration, D.pill.animation_duration, 0, 2000)}ms;
  /* ---------------- Theme Studio: Menu (floating instance menu) ---------------- */
  --ks-menu-toggle-bg: ${eqTok((theme as any).menu?.toggle_background, D.menu.toggle_background, 'var(--ks-card-bg)')};
  --ks-menu-toggle-border: ${eqTok((theme as any).menu?.toggle_border_color, D.menu.toggle_border_color, 'var(--ks-card-border)')};
  --ks-menu-toggle-icon: ${safeCssValue((theme as any).menu?.toggle_icon_color, '#e5e7eb')};
  --ks-menu-toggle-radius: ${(theme as any).menu?.toggle_radius === D.menu.toggle_radius ? 'var(--ks-card-radius)' : `${num((theme as any).menu?.toggle_radius, 15)}px`};
  --ks-menu-toggle-shadow: ${eqTok((theme as any).menu?.toggle_shadow, D.menu.toggle_shadow, 'var(--ks-card-shadow)')};
  --ks-menu-accent: ${safeCssValue((theme as any).menu?.accent_color, '#6ee7b7')};
  --ks-menu-accent-soft: ${softRgba(safeCssValue((theme as any).menu?.accent_color, '#6ee7b7'), 0.14)};
  --ks-menu-popover-width: ${clampNum((theme as any).menu?.popover_width, D.menu.popover_width, 200, 560)}px;
  --ks-menu-popover-bg: ${eqTok((theme as any).menu?.popover_background, D.menu.popover_background, 'rgba(12,14,18,0.22)')};
  --ks-menu-popover-border: ${eqTok((theme as any).menu?.popover_border_color, D.menu.popover_border_color, 'rgba(255,255,255,0.18)')};
  --ks-menu-popover-radius: ${num((theme as any).menu?.popover_radius, D.menu.popover_radius)}px;
  --ks-menu-popover-blur: ${num((theme as any).menu?.popover_blur, D.menu.popover_blur)}px;`,
  };
}

// buildSectionRules emits the rule blocks for the four new sections. They
// are appended AFTER every legacy component rule so they win same-specificity
// ties, and BEFORE the admin's Custom CSS block (which therefore always has
// the final word).
// ------------------------------------------------------------------
// Panel-wide utility mappings (the "every page, everything" layer)
// ------------------------------------------------------------------
// Pages style their text/status/borders with stock Tailwind utilities
// (text-gray-400, text-emerald-300, border-red-700/40, …) — thousands of
// them. Rewriting every className in every page is unmaintainable, so the
// applier REMAPS those utility classes onto theme tokens instead.
//
// Every mapping is GATED: it is emitted only when the corresponding token
// differs from DEFAULT_THEME's value. Under the Default theme nothing is
// emitted at all, guaranteeing pixel parity; the moment an admin changes
// e.g. accent.danger, every red utility across ALL pages follows it.
function buildUtilityMappings(theme: Theme): string {
  const D = DEFAULT_THEME;
  const a = theme.accent;
  const t = theme.typography;
  const u = theme.utilities;
  const b = theme.button;
  const f = theme.forms;
  const sh = theme.shape;
  const blocks: string[] = [];

  // Selector builders ------------------------------------------------
  // Escaped class lists for one family+shade range, e.g.
  // `.text-red-300,.text-red-400\/50,…`. Arbitrary-alpha variants are
  // covered for the common steps so tinted/hover classes map too — but
  // ONLY via exact class selectors, never substring matching, which would
  // also hit `hover:` variants permanently.
  // Strip any pre-escape backslashes, then escape CSS-special characters
  // exactly once ('/' needs escaping in selectors like .text-red-400\/50).
  const esc = (s: string) => s.replace(/\\/g, '').replace(/([.:[\]/()])/g, '\\$1');
  const shadeSel = (prefix: string, shades: number[], alphas: string[]): string =>
    shades.flatMap((sh) => alphas.map((al) => `.${esc(`${prefix}-${sh}${al}`)}`)).join(',');

  const TEXT_ALPHAS = ['', '\\/20', '\\/30', '\\/40', '\\/50', '\\/70', '\\/80', '\\/90'];
  const SHADES_ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900];

  // Status families → their accent token.
  const statusFamily = (
    prefix: 'text' | 'bg' | 'border',
    hues: string[],
    token: string,
    opts?: { tintBgShades?: number[]; solidBgShades?: number[]; borderAlpha?: number },
  ): string | null => {
    // Unparseable tokens can't drive a mapping — skip rather than emit junk.
    if (!rgbaAt(token, 1, '')) return null;
    if (prefix === 'text') {
      const sel = hues.map((hue) => shadeSel(`text-${hue}`, SHADES_ALL, TEXT_ALPHAS));
      return `${sel.join(',')} { color: ${token} !important; }`;
    }
    const sel: string[] = [];
    if (prefix === 'border') {
      for (const hue of hues) sel.push(shadeSel(`border-${hue}`, [200, 300, 400, 500, 600, 700], ['', '\\/30', '\\/40', '\\/60']));
      return `${sel.join(',')} { border-color: ${rgbaAt(token, opts?.borderAlpha ?? 0.45, token)} !important; }`;
    }
    // bg: split solids vs tinted darks so /30 washes stay translucent.
    const parts: string[] = [];
    const solidShades = opts?.solidBgShades ?? [300, 400, 500, 600];
    const tintShades = opts?.tintBgShades ?? [700, 800, 900];
    for (const hue of hues) {
      parts.push(shadeSel(`bg-${hue}`, solidShades, ['', '\\/70', '\\/80', '\\/90']));
    }
    const solid = parts.join(',');
    const tintParts: string[] = [];
    for (const hue of hues) tintParts.push(shadeSel(`bg-${hue}`, tintShades, ['', '\\/20', '\\/30', '\\/40', '\\/50']));
    return `${solid} { background-color: ${token} !important; }\n${tintParts.join(',')} { background-color: ${rgbaAt(token, 0.18, token)} !important; }`;
  };

  // --- Muted body copy → typography.body_color ---
  if (t.body_color !== D.typography.body_color) {
    blocks.push(`
/* Utility mapping: muted text → typography.body_color */
.text-gray-300, .text-gray-400, .text-gray-500, .text-gray-600 {
  color: var(--ks-text-body) !important;
}`);
  }

  // --- Bright headings/titles → typography.heading_color ---
  let reassert = '';
  if (t.heading_color !== D.typography.heading_color) {
    blocks.push(`
/* Utility mapping: headings & bright text → typography.heading_color */
h1, h2, h3, h4, h5, h6, .text-gray-100, .text-gray-200, .text-white {
  color: var(--ks-text-heading) !important;
}`);
    // Components that OWN their text colour must win back over the broad
    // .text-white mapping above (white-on-accent buttons, active nav,
    // active tabs, checked chips…).
    reassert = `
/* Component colour reassertions (after the heading mapping) */
.ks-primary-btn { color: var(--ks-btn-text) !important; }
.ks-ghost-btn { color: var(--ks-btn-ghost-text) !important; }
.ks-icon-btn { color: var(--ks-btn-icon-text) !important; }
.ks-nav-active { color: var(--ks-sidebar-active-text) !important; }
.ks-tab-active { color: var(--ks-tab-active-text) !important; }
.rich-check.is-on { color: var(--ks-check-mark) !important; }
.glass-dropdown, .ks-dropdown { color: var(--ks-dropdown-item-text) !important; }`;
  }

  // --- Status colours → accents ---
  if (a.danger !== D.accent.danger) {
    const r = statusFamily('text', ['red'], a.danger);
    if (r) blocks.push(`\n/* Utility mapping: red → accent.danger */\n${r}`);
    const b = statusFamily('border', ['red'], a.danger);
    if (b) blocks.push(b);
    const g = statusFamily('bg', ['red'], a.danger);
    if (g) blocks.push(g);
  }
  if (a.success !== D.accent.success) {
    for (const hue of ['emerald', 'green']) {
      const r = statusFamily('text', [hue], a.success);
      if (r) blocks.push(r);
      const b = statusFamily('border', [hue], a.success);
      if (b) blocks.push(b);
      const g = statusFamily('bg', [hue], a.success);
      if (g) blocks.push(g);
    }
  }
  if (a.warning !== D.accent.warning) {
    for (const hue of ['amber', 'yellow', 'orange']) {
      const r = statusFamily('text', [hue], a.warning);
      if (r) blocks.push(r);
      const b = statusFamily('border', [hue], a.warning);
      if (b) blocks.push(b);
      const g = statusFamily('bg', [hue], a.warning);
      if (g) blocks.push(g);
    }
  }
  if ((a.info || D.accent.info) !== D.accent.info) {
    for (const hue of ['sky', 'blue', 'cyan', 'indigo', 'violet', 'purple']) {
      const r = statusFamily('text', [hue], a.info);
      if (r) blocks.push(r);
      const b = statusFamily('border', [hue], a.info);
      if (b) blocks.push(b);
      const g = statusFamily('bg', [hue], a.info);
      if (g) blocks.push(g);
    }
  }

  // --- Links → typography.link_color ---
  if (t.link_color !== D.typography.link_color) {
    blocks.push(`
/* Utility mapping: links → typography.link_color */
a:not([class]) { color: var(--ks-link); }
a.text-blue-300, a.text-blue-400, a.text-sky-300, a.text-sky-400, a.text-blue-500, a.text-sky-500 {
  color: var(--ks-link) !important;
}`);
  }

  // --- Hairline white borders → card border token ---
  if (theme.card.border_color !== D.card.border_color) {
    blocks.push(`
/* Utility mapping: hairline borders → card.border_color */
.border-white\\/10, .border-white\\/15, .border-white\\/20, .border-white\\/\\[0\\.06\\], .border-white\\/\\[0\\.08\\] {
  border-color: var(--ks-card-border) !important;
}`);
  }

  // --- Composite button utilities → Button tab tokens ---
  // index.css ships the .ks-btn-* component classes (plus a stock
  // bg-white+text-black primary pattern and file-input buttons) that many
  // pages use directly. They hard-code the stock look, so remap them onto
  // the Button-tab tokens ONLY when an admin moves those sliders away from
  // Default — under the Default theme nothing is emitted and every page
  // stays pixel-identical.
  const btnChanged =
    b.background !== D.button.background ||
    b.text_color !== D.button.text_color ||
    b.hover_background !== D.button.hover_background;
  if (btnChanged) {
    blocks.push(`
/* Utility mapping: composite/stock primary buttons → button tokens */
.ks-btn-primary, .ks-btn-form, .bg-white.text-black {
  background-color: ${b.background} !important;
  color: ${b.text_color} !important;
}
.ks-btn-primary:hover, .ks-btn-form:hover, .bg-white.text-black:hover {
  background-color: ${b.hover_background} !important;
}
.file\\:bg-white::file-selector-button {
  background-color: ${b.background} !important;
  color: ${b.text_color} !important;
}
.hover\\:file\\:bg-gray-200:hover::file-selector-button {
  background-color: ${b.hover_background} !important;
}`);
  }
  const ghostChanged =
    b.ghost_text_color !== D.button.ghost_text_color ||
    b.ghost_hover_background !== D.button.ghost_hover_background ||
    b.ghost_border !== D.button.ghost_border;
  if (ghostChanged) {
    // The stock ghost look is a hairline white/10 box; only re-issue the
    // whole border shorthand when the admin actually changed it.
    const ghostBorder =
      b.ghost_border !== D.button.ghost_border
        ? `\n.ks-btn-ghost, .ks-btn-cancel { border: ${safeCssValue(b.ghost_border)} !important; }`
        : '';
    blocks.push(`
/* Utility mapping: ghost buttons → ghost button tokens */
.ks-btn-ghost, .ks-btn-cancel { color: ${b.ghost_text_color} !important; }
.ks-btn-ghost:hover, .ks-btn-cancel:hover { background-color: ${b.ghost_hover_background} !important; }${ghostBorder}`);
  }
  const iconChanged =
    b.icon_background !== D.button.icon_background ||
    b.icon_text_color !== D.button.icon_text_color ||
    b.icon_hover_background !== D.button.icon_hover_background;
  if (iconChanged) {
    blocks.push(`
/* Utility mapping: secondary/icon buttons → icon button tokens */
.ks-btn-icon, .ks-btn-header, .ks-btn-secondary {
  background-color: ${b.icon_background} !important;
  color: ${b.icon_text_color} !important;
}
.ks-btn-icon:hover, .ks-btn-header:hover, .ks-btn-secondary:hover {
  background-color: ${b.icon_hover_background} !important;
}`);
  }

  // --- accent-* checkboxes / radios / sliders → checkbox token ---
  if (f.checkbox_bg_checked !== D.forms.checkbox_bg_checked) {
    blocks.push(`
/* Utility mapping: accent-* controls → forms.checkbox_bg_checked */
.accent-emerald-500, .accent-emerald-600, .accent-sky-500, .accent-indigo-400, .accent-white {
  accent-color: ${f.checkbox_bg_checked} !important;
}`);
  }

  // --- Shape + Utilities radius scales → stock rounded-* utilities ---
  // Emitted only when the admin moves the matching slider so the stock
  // Tailwind scale stays pixel-identical under the Default theme.
  if (sh.border_radius_sm !== D.shape.border_radius_sm) {
    blocks.push(`\n.rounded { border-radius: var(--ks-radius-sm) !important; }`);
  }
  if (sh.border_radius_md !== D.shape.border_radius_md) {
    blocks.push(`\n.rounded-md { border-radius: var(--ks-radius-md) !important; }`);
  }
  if (sh.border_radius_lg !== D.shape.border_radius_lg) {
    blocks.push(`\n.rounded-lg { border-radius: var(--ks-radius-lg) !important; }`);
  }
  if (u.radius_none !== D.utilities.radius_none) {
    blocks.push(`\n.rounded-none { border-radius: var(--ks-radius-none) !important; }`);
  }
  if (u.radius_sm !== D.utilities.radius_sm) {
    blocks.push(`\n.rounded-sm { border-radius: var(--ks-radius-sm-u) !important; }`);
  }
  if (u.radius_md !== D.utilities.radius_md) {
    blocks.push(`\n.rounded-md { border-radius: var(--ks-radius-md-u) !important; }`);
  }
  if (u.radius_lg !== D.utilities.radius_lg) {
    blocks.push(`\n.rounded-lg { border-radius: var(--ks-radius-lg-u) !important; }`);
  }
  if (u.radius_full !== D.utilities.radius_full && num(u.radius_full, 9999) > 100) {
    blocks.push(`\n.rounded-full { border-radius: 9999px !important; }`);
  }

  // --- Elevation scale → stock shadow-* utilities (gated) ---
  const shadowMap: Array<[number, number, string, string]> = [
    [D.utilities.shadow_1, u.shadow_1, 'shadow-sm', '--ks-elev-1'],
    [D.utilities.shadow_2, u.shadow_2, 'shadow', '--ks-elev-2'],
    [D.utilities.shadow_3, u.shadow_3, 'shadow-md', '--ks-elev-3'],
    [D.utilities.shadow_4, u.shadow_4, 'shadow-lg', '--ks-elev-4'],
    [D.utilities.shadow_4, u.shadow_4, 'shadow-xl', '--ks-elev-4'],
  ];
  const shadowRules = shadowMap
    .filter(([d, v]) => v !== d)
    .map(([, , cls, v]) => `.${cls.replace(/\\/g, '')} { box-shadow: var(${v}) !important; }`);
  if (shadowRules.length) {
    blocks.push(`\n/* Utility mapping: shadow scale → utilities elevation */\n${shadowRules.join('\n')}`);
  }

  // --- Transition speed presets → duration-* utilities (gated) ---
  if (u.transition_slow !== D.utilities.transition_slow) {
    blocks.push(`\n.duration-300 { transition-duration: var(--ks-t-slow, 300ms) !important; }`);
  }
  if (u.transition_very_slow !== D.utilities.transition_very_slow) {
    blocks.push(`\n.duration-500, .duration-700, .duration-1000 { transition-duration: var(--ks-t-vslow, 500ms) !important; }`);
  }

  // --- Typography base size → root rem scale (gated) ---
  // Tailwind text-* utilities are rem-based, so moving the Typography tab's
  // "Base size" slider rescales every label/heading panel-wide. Nothing is
  // emitted while it sits at the Default value to keep pixel parity.
  if (t.base_size !== D.typography.base_size && num(t.base_size, 14) >= 10 && num(t.base_size, 14) <= 22) {
    blocks.push(`\n/* Utility mapping: typography.base_size → root font scale */\nhtml { font-size: ${num(t.base_size, 14)}px; }`);
  }

  // --- Decorative scrollbar + selection follow accents (gated) ---
  if (u.color_primary !== D.utilities.color_primary && isHexish(u.color_primary)) {
    blocks.push(`
/* Utility mapping: nav scrollbar thumb → utilities.color_primary */
nav.overflow-x-auto::-webkit-scrollbar-thumb { background: ${u.color_primary}; background-clip: content-box; }
@supports (scrollbar-color: auto) { nav.overflow-x-auto { scrollbar-color: ${u.color_primary} transparent; } }`);
  }
  if (a.primary !== D.accent.primary && isHexish(a.primary)) {
    blocks.push(`
/* Utility mapping: text selection → accent.primary */
::selection { background: ${rgbaAt(a.primary, 0.35, 'rgba(255,255,255,0.35)')}; color: #ffffff; }`);
  }

  // --- Chart hooks (consumed by MetricsChart via var() fallbacks) ---
  const chartVars: string[] = [];
  if (theme.card.border_color !== D.card.border_color) {
    chartVars.push(`--ks-chart-grid: ${rgbaAt(theme.card.border_color, 0.6, 'rgba(255,255,255,0.06)')}`);
  }
  if (a.primary !== D.accent.primary && isHexish(a.primary)) {
    chartVars.push(`--ks-chart-dot: ${a.primary}`);
  }
  if (u.color_muted !== D.utilities.color_muted && isHexish(u.color_muted)) {
    // Gauge/donut track rings (Nodes, System charts).
    chartVars.push(`--ks-chart-track: ${u.color_muted}`);
  }
  if (chartVars.length) {
    blocks.push(`\n:root { ${chartVars.join('; ')}; }`);
  }

  if (!blocks.length) return '';
  return `\n/* ------------------------------------------------------------------
   Theme Studio → panel-wide utility mappings (gated: emitted only for
   tokens customised away from the Default theme)
   ------------------------------------------------------------------ */${blocks.join('\n')}${reassert}`;
}

function isHexish(v: unknown): boolean {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

function buildSectionRules(theme: Theme): string {
  const comp = theme.components;
  const f = theme.forms;
  const D = DEFAULT_THEME;

  // Custom checkbox / radio skin gates. Native controls normally render via
  // accent-color alone; when the admin tunes ANY relevant colour we switch
  // them to a fully skinned appearance:none rendering driven by the Forms
  // tab. Gated so the Default theme keeps the stock browser rendering
  // pixel-identical.
  const cbChanged =
    f.checkbox_bg_unchecked !== D.forms.checkbox_bg_unchecked ||
    f.checkbox_bg_checked !== D.forms.checkbox_bg_checked ||
    f.checkbox_border_unchecked !== D.forms.checkbox_border_unchecked ||
    f.checkbox_border_checked !== D.forms.checkbox_border_checked ||
    f.checkbox_checkmark_color !== D.forms.checkbox_checkmark_color;
  const radioChanged =
    f.radio_bg_unchecked !== D.forms.radio_bg_unchecked ||
    f.radio_bg_checked !== D.forms.radio_bg_checked ||
    f.radio_border_unchecked !== D.forms.radio_border_unchecked ||
    f.radio_border_checked !== D.forms.radio_border_checked ||
    f.radio_dot_color !== D.forms.radio_dot_color;

  // Checked-state checkmark glyph for the skinned checkbox — the mark colour
  // is baked into an encoded SVG data URI (same pattern as the select
  // chevron below). Only clean colour characters may reach the attribute.
  const markOk = /^[#%(),.\s0-9a-fA-F]+$/.test(String(f.checkbox_checkmark_color || ''));
  const checkGlyphRule =
    cbChanged && markOk
      ? `\ninput.ks-checkbox:checked,\ninput[class*="ks-checkbox"]:checked {\n  background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${f.checkbox_checkmark_color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>`,
        )}") !important;\n  background-size: 64% !important;\n  background-position: center !important;\n  background-repeat: no-repeat !important;\n}`
      : '';

  const modalMaxWidth =
    num(comp.modal_max_width, 512) !== D.components.modal_max_width
      ? `\n.ks-modal-panel { max-width: min(${num(comp.modal_max_width, 512)}px, 92vw) !important; }`
      : '';

  // Select chevron recolour — only emitted for a clean #rrggbb value (the
  // arrow is an inline SVG data URI; arbitrary colours can't be injected).
  const arrowHex = /^#[0-9a-fA-F]{6}$/.test(String(f.select_arrow_color));
  const arrowRule = arrowHex
    ? `\nselect.ks-select {\n  background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${f.select_arrow_color}" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
      )}") !important;\n  background-position: right 0.625rem center !important;\n  background-repeat: no-repeat !important;\n}`
    : '';

  return `
/* ------------------------------------------------------------------
   Theme Studio → Forms. Drives every .ks-* control AND the stock
   Tailwind input pattern (bg-black/30 + border-white/10) used across
   the panel's pages, so ALL inputs/selects/textareas follow the Forms
   tab end-to-end without per-page edits.
   ------------------------------------------------------------------ */
input.ks-input,
#root input[class*="bg-black/30"][class*="border-white/10"] {
  background-color: var(--ks-form-input-bg) !important;
  color: var(--ks-form-input-text) !important;
  border-color: var(--ks-form-input-border) !important;
  border-radius: var(--ks-form-input-radius) !important;
  padding-left: var(--ks-form-input-px) !important;
  padding-right: var(--ks-form-input-px) !important;
  padding-top: var(--ks-form-input-py) !important;
  padding-bottom: var(--ks-form-input-py) !important;
  font-size: var(--ks-form-input-font) !important;
}
select.ks-select,
#root select[class*="bg-black/30"][class*="border-white/10"] {
  background-color: var(--ks-form-select-bg) !important;
  color: var(--ks-form-select-text) !important;
  border-color: var(--ks-form-select-border) !important;
  border-radius: var(--ks-form-select-radius) !important;
  padding-left: var(--ks-form-select-px) !important;
  padding-right: var(--ks-form-select-px) !important;
  padding-top: var(--ks-form-select-py) !important;
  padding-bottom: var(--ks-form-select-py) !important;
  font-size: var(--ks-form-select-font) !important;
}
textarea.ks-textarea,
#root textarea[class*="bg-black/30"][class*="border-white/10"] {
  background-color: var(--ks-form-textarea-bg) !important;
  color: var(--ks-form-textarea-text) !important;
  border-color: var(--ks-form-textarea-border) !important;
  border-radius: var(--ks-form-textarea-radius) !important;
  padding-left: var(--ks-form-textarea-px) !important;
  padding-right: var(--ks-form-textarea-px) !important;
  padding-top: var(--ks-form-textarea-py) !important;
  padding-bottom: var(--ks-form-textarea-py) !important;
  font-size: var(--ks-form-textarea-font) !important;
}
input.ks-input:focus,
select.ks-select:focus,
textarea.ks-textarea:focus,
#root input[class*="bg-black/30"][class*="border-white/10"]:focus,
#root select[class*="bg-black/30"][class*="border-white/10"]:focus,
#root textarea[class*="bg-black/30"][class*="border-white/10"]:focus {
  outline: none !important;
  border-color: var(--ks-form-focus-border) !important;
  box-shadow: var(--ks-form-focus-shadow) !important;
}
input.ks-input::placeholder,
textarea.ks-textarea::placeholder,
#root input[class*="bg-black/30"]::placeholder,
#root textarea[class*="bg-black/30"]::placeholder {
  color: var(--ks-form-placeholder) !important;
  opacity: 1 !important;
}
/* Composite variant classes (ks-input-sm/-lg/-error/-success/-disabled/-mono,
   ks-select-sm/-lg, ks-textarea-sm/-lg, ks-search-input, and selects styled
   with the shared glassFieldClass). Colour + focus follow the Forms tab
   while geometry stays owned by the variant utility, so -sm / -lg sizing
   is never clobbered. Exact-class elements are excluded (:not) because the
   full-property rules above already cover them with per-family tokens. */
input[class*="ks-input"]:not(.ks-input),
input.ks-search-input,
select[class*="ks-input"]:not(.ks-input) {
  background-color: var(--ks-form-input-bg) !important;
  color: var(--ks-form-input-text) !important;
}
select[class*="ks-select"]:not(.ks-select) {
  background-color: var(--ks-form-select-bg) !important;
  color: var(--ks-form-select-text) !important;
}
textarea[class*="ks-textarea"]:not(.ks-textarea) {
  background-color: var(--ks-form-textarea-bg) !important;
  color: var(--ks-form-textarea-text) !important;
}
input[class*="ks-input"]:not(.ks-input):focus,
input.ks-search-input:focus,
select[class*="ks-select"]:not(.ks-select):focus,
select[class*="ks-input"]:not(.ks-input):focus,
textarea[class*="ks-textarea"]:not(.ks-textarea):focus {
  outline: none !important;
  border-color: var(--ks-form-focus-border) !important;
  box-shadow: var(--ks-form-focus-shadow) !important;
}
input[class*="ks-input"]:not(.ks-input)::placeholder,
textarea[class*="ks-textarea"]:not(.ks-textarea)::placeholder {
  color: var(--ks-form-placeholder) !important;
  opacity: 1 !important;
}
input.ks-input:focus,
select.ks-select:focus,
textarea.ks-textarea:focus,
#root input[class*="bg-black/30"][class*="border-white/10"]:focus,
#root select[class*="bg-black/30"][class*="border-white/10"]:focus,
#root textarea[class*="bg-black/30"][class*="border-white/10"]:focus {
  outline: none !important;
  border-color: var(--ks-form-focus-border) !important;
  box-shadow: var(--ks-form-focus-shadow) !important;
}
.ks-label {
  color: var(--ks-label-text) !important;
  font-size: var(--ks-label-size) !important;
  font-weight: var(--ks-label-weight) !important;
}
.ks-hint {
  color: var(--ks-hint-text) !important;
  font-size: var(--ks-hint-size) !important;
}
.ks-hint-error { color: var(--ks-hint-error) !important; }
.ks-hint-success { color: var(--ks-hint-success) !important; }
.ks-field { margin-bottom: var(--ks-field-mb); background-color: var(--ks-field-bg); }
.ks-field > * + * { margin-top: var(--ks-field-gap) !important; }
input.ks-checkbox {
  accent-color: var(--ks-check-on) !important;
  width: var(--ks-check-size) !important;
  height: var(--ks-check-size) !important;
  border-radius: var(--ks-check-radius) !important;
}
input.ks-radio {
  accent-color: var(--ks-radio-on) !important;
  width: var(--ks-radio-size) !important;
  height: var(--ks-radio-size) !important;
}
/* Variant sizes (ks-checkbox-sm/-lg, ks-radio-sm/-lg) keep their own box
   geometry; only the checked colour follows the Forms tab. */
input[class*="ks-checkbox"] { accent-color: var(--ks-check-on) !important; }
input[class*="ks-radio"] { accent-color: var(--ks-radio-on) !important; }
${cbChanged ? `/* Custom checkbox skin — see the gate in buildSectionRules(). */
input.ks-checkbox,
input[class*="ks-checkbox"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  background-color: var(--ks-check-off-bg) !important;
  border-color: var(--ks-check-border) !important;
}
input.ks-checkbox:checked,
input[class*="ks-checkbox"]:checked {
  background-color: var(--ks-check-on) !important;
  border-color: var(--ks-check-border-on) !important;
}${checkGlyphRule}` : ''}
${radioChanged ? `/* Custom radio skin — dot painted with a radial-gradient so no pseudo
   elements are needed on the <input> itself. */
input.ks-radio,
input[class*="ks-radio"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  background-color: var(--ks-radio-off-bg) !important;
  border-color: var(--ks-radio-border) !important;
  border-radius: 9999px !important;
}
input.ks-radio:checked,
input[class*="ks-radio"]:checked {
  background-color: var(--ks-radio-on) !important;
  border-color: var(--ks-radio-border-on) !important;
  background-image: radial-gradient(circle, var(--ks-radio-dot) 0%, var(--ks-radio-dot) 42%, transparent 48%) !important;
}` : ''}
.rich-check {
  background: var(--ks-check-off-bg);
  border-color: var(--ks-check-border);
}
.rich-check.is-on {
  background: var(--ks-check-on) !important;
  border-color: var(--ks-check-border-on) !important;
  color: var(--ks-check-mark) !important;
}
.ks-toggle:not(.ks-toggle-sm):not(.ks-toggle-lg) {
  width: var(--ks-toggle-w) !important;
  height: var(--ks-toggle-h) !important;
  border-radius: var(--ks-toggle-radius) !important;
  background-color: var(--ks-toggle-off) !important;
}
.ks-toggle:not(.ks-toggle-sm):not(.ks-toggle-lg):has(input:checked) {
  background-color: var(--ks-toggle-on) !important;
  border-color: var(--ks-toggle-on) !important;
}
/* Button-based switches (role="switch") mark the on state via .is-on. */
.ks-toggle.is-on {
  background-color: var(--ks-toggle-on) !important;
  border-color: var(--ks-toggle-on) !important;
}
.ks-toggle:not(.ks-toggle-sm):not(.ks-toggle-lg) .ks-toggle__thumb {
  width: var(--ks-toggle-thumb-size) !important;
  height: var(--ks-toggle-thumb-size) !important;
  top: var(--ks-toggle-offset) !important;
  left: var(--ks-toggle-offset) !important;
  background: var(--ks-toggle-thumb) !important;
}
.ks-toggle:not(.ks-toggle-sm):not(.ks-toggle-lg):has(input:checked) .ks-toggle__thumb {
  transform: translateX(var(--ks-toggle-travel)) !important;
}
.ks-toggle.is-on .ks-toggle__thumb {
  transform: translateX(var(--ks-toggle-travel)) !important;
}
/* Toggle knob shadow — an empty token keeps the stock Tailwind shadow-md
   from index.css; any colour swaps it for a tight single-colour shadow. */
${String(f.toggle_thumb_shadow || '').trim() ? `\n.ks-toggle .ks-toggle__thumb { box-shadow: 0 1px 3px var(--ks-toggle-thumb-shadow) !important; }` : ''}

/* ------------------------------------------------------------------
   Theme Studio → Components. Modal dialog + overlay scrim + strong
   glass + chrome surfaces. The sidebar/header keep their dedicated
   themed sections (excluded via :not()).
   ------------------------------------------------------------------ */
.glass-strong {
  background-color: var(--ks-comp-strong-bg) !important;
  border-color: var(--ks-comp-strong-border) !important;
  box-shadow: var(--ks-comp-strong-shadow) !important;
  border-radius: var(--ks-comp-strong-radius) !important;
  backdrop-filter: blur(var(--ks-comp-strong-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-comp-strong-blur)) !important;
}
.ks-modal-panel {
  background-color: var(--ks-modal-bg) !important;
  border-color: var(--ks-modal-border) !important;
  box-shadow: var(--ks-modal-shadow) !important;
  border-radius: var(--ks-modal-radius) !important;
  backdrop-filter: blur(var(--ks-modal-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-modal-blur)) !important;
}
.ks-modal-overlay {
  background-color: var(--ks-modal-overlay-c) !important;
}
.glass-chrome:not(.ks-sidebar-bg):not(.ks-header-bg) {
  background: var(--ks-chrome-bg) !important;
  backdrop-filter: blur(var(--ks-chrome-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-chrome-blur)) !important;
  border-color: var(--ks-chrome-border) !important;
}${modalMaxWidth}${arrowRule}

/* ------------------------------------------------------------------
   Theme Studio → Utilities. Token-only surface: semantic colours,
   spacing base, radius/shadow scales, transition speeds and the z-index
   ladder. Transition speed vars are consumed by the themed component
   rules above; the remaining tokens are stable hooks for Custom CSS.
   ------------------------------------------------------------------ */
.glass-card { transition-duration: var(--ks-t-normal, 200ms) !important; }
.ks-ghost-btn { transition-duration: var(--ks-t-fast, 150ms) !important; }
.ks-icon-btn { transition-duration: var(--ks-t-fast, 150ms) !important; }
.ks-tab { transition-duration: var(--ks-t-fast, 150ms) !important; }

/* ------------------------------------------------------------------
   Theme Studio → Cards. Semantic variants layered on the base card;
   tokens equal-to-default resolve to the live base vars inside
   buildSectionVars, so these rules only override what the admin set.
   ------------------------------------------------------------------ */
.ks-list-card {
  /* Variants OWN the whole composite background: colour from the variant
     token + the media/gradient layer from the live Card tab. Without the
     explicit background-image here, the earlier .glass-card rule's media
     layer would paint ABOVE the variant colour and mix with it (the
     "set List background to red but black/image still shows" bug). */
  background-color: var(--ks-listcard-bg) !important;
  background-image: var(--ks-card-bg-layer) !important;
  background-size: var(--ks-card-bg-size);
  background-position: var(--ks-card-bg-position);
  background-repeat: var(--ks-card-bg-repeat);
  border-color: var(--ks-listcard-border) !important;
  box-shadow: var(--ks-listcard-shadow) !important;
  border-radius: var(--ks-listcard-radius) !important;
  backdrop-filter: blur(var(--ks-listcard-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-listcard-blur)) !important;
  padding: var(--ks-listcard-padding) !important;
}
.ks-list-card:hover { border-color: var(--ks-listcard-hover) !important; }
.ks-stat-card {
  background-color: var(--ks-statcard-bg) !important;
  background-image: var(--ks-card-bg-layer) !important;
  background-size: var(--ks-card-bg-size);
  background-position: var(--ks-card-bg-position);
  background-repeat: var(--ks-card-bg-repeat);
  border-color: var(--ks-statcard-border) !important;
  border-radius: var(--ks-statcard-radius) !important;
  padding-left: var(--ks-statcard-px) !important;
  padding-right: var(--ks-statcard-px) !important;
  padding-top: var(--ks-statcard-py) !important;
  padding-bottom: var(--ks-statcard-py) !important;
}
.ks-stat-card svg { color: var(--ks-statcard-icon) !important; }
.ks-form-card {
  background-color: var(--ks-formcard-bg) !important;
  background-image: var(--ks-card-bg-layer) !important;
  background-size: var(--ks-card-bg-size);
  background-position: var(--ks-card-bg-position);
  background-repeat: var(--ks-card-bg-repeat);
  border-color: var(--ks-formcard-border) !important;
  box-shadow: var(--ks-formcard-shadow) !important;
  border-radius: var(--ks-formcard-radius) !important;
  padding: var(--ks-formcard-padding) !important;
}

/* ------------------------------------------------------------------
   Theme Studio → Pill. The fixed top-right action cluster AND the phone
   bottom tabs pill (PageTabsPill shares the same pill section, so one
   Pill tab paints both pills). The triple-class selector (0,3,0) beats the
   base .glass-card/.ks-card surface rule (0,1,0) so the Pill tab owns the
   surface; tokens that still equal the Card default resolve to the live
   card vars inside buildSectionVars, so the Card tab keeps cascading until
   overridden.
   ------------------------------------------------------------------ */
.ks-card.ks-pill-anim.ks-actions-pill,
.ks-card.ks-pill-anim.ks-tabs-pill {
  background-color: var(--ks-pill-bg) !important;
  border-color: var(--ks-pill-border) !important;
  border-width: var(--ks-pill-border-width) !important;
  border-radius: var(--ks-pill-radius) !important;
  box-shadow: var(--ks-pill-shadow) !important;
  padding: var(--ks-pill-padding) !important;
  backdrop-filter: blur(var(--ks-pill-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ks-pill-blur)) !important;
}
/* Action buttons inside either pill take their size from the Pill tab
   (scoped var override — the Tabs tab still drives .ks-tab elsewhere). */
.ks-actions-pill .ks-tab,
.ks-tabs-pill .ks-tab {
  --ks-tab-px: var(--ks-pill-tab-px);
  --ks-tab-py: var(--ks-pill-tab-py);
  --ks-tab-font: var(--ks-pill-tab-font);
}
/* Chevron collapse toggle ("<" / ">") — shared by both pills. */
.ks-actions-pill .ks-pill-toggle,
.ks-tabs-pill .ks-pill-toggle { color: var(--ks-pill-text) !important; }
.ks-actions-pill .ks-pill-toggle svg,
.ks-tabs-pill .ks-pill-toggle svg {
  width: var(--ks-pill-icon-size) !important;
  height: var(--ks-pill-icon-size) !important;
}
/* Collapsing content: gap + duration follow the Pill tab. The motion
   itself (slide/fade/scale) is applied inline by PageActionsPill /
   PageTabsPill. */
.ks-actions-pill .ks-pill-content,
.ks-tabs-pill .ks-pill-content {
  gap: var(--ks-pill-gap) !important;
  transition-duration: var(--ks-pill-anim-duration) !important;
}

/* ------------------------------------------------------------------
   Theme Studio → Menu. The floating instance-menu square toggle, its
   four chevron nudge tabs and the popover panel. The triple-class
   selector (0,3,0) beats the base .glass-card/.ks-card surface rule
   (0,1,0) so the Menu tab owns the surface; tokens that still equal the
   Card default resolve to the live card vars inside buildVars, so the
   Card tab keeps cascading until overridden. These rules are injected
   AFTER index.css, so they win same-specificity ties there too.
   ------------------------------------------------------------------ */
.ks-card.ks-fab-anim.ks-fab-toggle {
  background-color: var(--ks-menu-toggle-bg) !important;
  border-color: var(--ks-menu-toggle-border) !important;
  color: var(--ks-menu-toggle-icon) !important;
  border-radius: var(--ks-menu-toggle-radius) !important;
  box-shadow: var(--ks-menu-toggle-shadow) !important;
}
.ks-card.ks-fab-anim.ks-fab-nudge {
  background-color: var(--ks-menu-toggle-bg) !important;
  border-color: var(--ks-menu-toggle-border) !important;
  color: var(--ks-menu-toggle-icon) !important;
}
/* Open-state glow follows the Menu accent; stronger than the rest glow
   so the active state reads at a glance. */
.ks-card.ks-fab-anim.ks-fab-toggle.is-open {
  border-color: var(--ks-menu-accent) !important;
  box-shadow: var(--ks-menu-toggle-shadow), 0 0 0 4px var(--ks-menu-accent-soft), 0 0 22px var(--ks-menu-accent-soft) !important;
}
.ks-fab-toggle.is-open .ks-fab-wheel {
  color: var(--ks-menu-accent) !important;
}
/* Popover panel surface follows the Menu tab (NOT the generic dropdown —
   the menu is wider and themeable on its own). */
.glass-dropdown.ks-fab-menu {
  background-color: var(--ks-menu-popover-bg) !important;
  border-color: var(--ks-menu-popover-border) !important;
  border-radius: var(--ks-menu-popover-radius) !important;
  backdrop-filter: blur(var(--ks-menu-popover-blur)) saturate(180%) !important;
  -webkit-backdrop-filter: blur(var(--ks-menu-popover-blur)) saturate(180%) !important;
}`;
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
  patchDraftMeta: (patch: Partial<Pick<Theme, 'name' | 'description' | 'icon' | 'color'>>) => void;
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
  const themes: Theme[] = (boot.theme.themes || []).map((s) =>
    // Backfill EVERY section from DEFAULT so old global themes saved before
    // newer sections existed still resolve safely — same defence we run in
    // loadGlobal() for the fetched copy. Without this a partial
    // spec.dropdowns (with only background set, for example) would
    // wholesale REPLACE DEFAULT_THEME.dropdowns and the admin would
    // suddenly see no dropdown backdrop / no border / etc.
    migrateThemeSections({
      ...s.spec,
      id: s.id,
      name: s.name,
      description: s.description,
      builtin: !!s.builtin,
    }),
  );
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
      const globalThemes: Theme[] = (store.themes || []).map((s: StoredTheme) =>
        // Backfill EVERY section from DEFAULT_THEME first so old global
        // themes saved before a section was added still resolve safely.
        // This MUST mirror loadBootstrapTheme()'s merge — previously
        // loadGlobal only re-backfilled card, so a refresh that re-fetched
        // /api/themes would overwrite the bootstrapped (fully-backfilled)
        // theme with a copy missing newer sections and applyForRoute()
        // would read e.g. theme.loading as undefined.
        migrateThemeSections({
          ...s.spec,
          id: s.id,
          name: s.name,
          description: s.description,
          builtin: !!s.builtin,
          created_at: s.created_at,
          updated_at: s.updated_at,
        }),
      );
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
    const raw = seed ? structuredCloneSafe(seed) : structuredCloneSafe(get().active());
    // beginDraft creates a NEW theme: blank id so save(false) allocates a
    // fresh one in saveDraft. The seed's *values* are kept as the starting
    // point so "New theme" picks up from the look the admin sees today.
    // Full-shape backfill via migrateThemeSections so a seed that pre-dates
    // ANY section (header loading-bar, forms, dropdowns, …) still yields a
    // fully-shaped draft — the studio never reads undefined.
    const base = migrateThemeSections(raw);
    set({
      draft: {
        ...base,
        id: '',
        name: base.name === 'Default' ? 'My Theme' : base.name,
        builtin: false,
      },
    });
  },

  editDraft: (seed) => {
    // editDraft preserves the seed's id so save(false) updates the existing
    // theme in place. Without preservation every Edit flow would clone.
    // Full-shape backfill so an older seed (missing any newer section)
    // still shows well-shaped controls in the studio.
    const clone = migrateThemeSections(structuredCloneSafe(seed));
    set({
      draft: clone,
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
    // paint immediately. Navigation away re-resolves against the route
    // (via RouteThemeSync) so the next page picks whichever assignment is
    // in effect. No second applyForRoute here — it would immediately undo
    // this paint when the saved theme isn't assigned to this route.
    applyTheme(saved, { pathname: typeof window !== 'undefined' ? window.location.pathname : '/' });
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
