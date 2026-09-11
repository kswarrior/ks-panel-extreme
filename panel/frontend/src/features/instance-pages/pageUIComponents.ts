// Page UI clones for instance React pages (KSUI scope).
//
// Locked decision (item 8): do NOT import real panel components into pages.
// This registry ships simpler clones for instance pages only — visually
// same-to-same with the panel originals in sharedPanelComponents.ts (same
// ks-* classes, same inline styles, same var(--ks-*) tokens), but each clone
// is a dependency-free React-source string (plain React.createElement, no
// JSX): no axios/stores/router/admin imports, no fetch/localStorage/XHR, no
// document/window access. Behaviour leaves the clone ONLY through
// caller-supplied callbacks (props.on*), which page authors wire to sdk.*.
//
// Wiring:
//   • React pages get the clones as a third scope `KSUI` beside `sdk`/`React`
//     (CustomPageView ReactModuleView injects buildKsuiPreamble() once per
//     bundle; `KSUI.X` references are plain identifiers the transpiler and
//     the Go validator pass through untouched).
//   • The Section E import picker lists these entries with a "live React"
//     badge; importing one stores a normal type:'shared' row
//     ({name, shared: '<page_* key>'}) — no new component type, no backend
//     change. The React renderer maps that row to KSUI (see
//     ksuiKeyForSharedKey); HTML/markdown pages keep resolving
//     {{component:name}} from the HTML registries only, so page_* tokens stay
//     React-only there (a shared row pointing at a page_* key renders '' in
//     HTML — the pre-existing unknown-shared-key behaviour).

export interface PageUIComponent {
  /** Registry key — also the {{component:name}} token / shared ref. */
  name: string;
  /** Member name on the KSUI scope (KSUI.<ksuiKey>). */
  ksuiKey: string;
  /** Short label shown in the Import picker. */
  label: string;
  /** Description incl. intentional prop-API differences vs the original. */
  description: string;
  /** Prop API documentation for page authors. */
  props: string;
  /** Dependency-free React-source string: `function <ksuiKey>(props) {...}`
   *  using only React.createElement + ks-* classes + var(--ks-*) tokens. */
  source: string;
}

const ACTION_PILL_SOURCE = `function ActionPill(props) {
  props = props || {};
  var collapsed = !!props.collapsed;
  var refreshLabel = props.refreshLabel != null ? String(props.refreshLabel) : 'Refresh';
  var primaryLabel = props.primaryLabel != null ? String(props.primaryLabel) : 'Run';
  var extra = Array.isArray(props.actions) ? props.actions : [];
  function handleRefresh(e) { if (typeof props.onRefresh === 'function') props.onRefresh(e); }
  function handlePrimary(e) { if (typeof props.onPrimary === 'function') props.onPrimary(e); }
  function handleToggle(e) { if (typeof props.onToggleCollapse === 'function') props.onToggleCollapse(!collapsed, e); }
  var buttons = [];
  buttons.push(React.createElement('button', { key: 'refresh', type: 'button', className: 'ks-tab', style: { padding: '5px 10px', fontSize: '13px' }, title: 'Refresh', onClick: handleRefresh }, refreshLabel));
  buttons.push(React.createElement('button', { key: 'primary', type: 'button', className: 'ks-tab ks-tab-active', style: { padding: '5px 10px', fontSize: '13px' }, title: primaryLabel, onClick: handlePrimary }, primaryLabel));
  extra.forEach(function (a, i) {
    if (!a) return;
    var label = a.label != null ? String(a.label) : ('Action ' + (i + 1));
    buttons.push(React.createElement('button', { key: 'x' + i, type: 'button', className: a.primary ? 'ks-tab ks-tab-active' : 'ks-tab', style: { padding: '5px 10px', fontSize: '13px' }, title: a.title || label, onClick: a.onClick }, label));
  });
  buttons.push(React.createElement('button', { key: 'toggle', type: 'button', className: 'ks-tab ks-pill-toggle', style: { padding: '5px 10px', fontSize: '13px' }, title: collapsed ? 'Show actions' : 'Hide actions', onClick: handleToggle }, collapsed ? '<' : '>'));
  return React.createElement('div', { className: 'ks-card ks-pill-anim ks-actions-pill', style: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px', borderRadius: '8px', width: 'fit-content', marginLeft: 'auto', opacity: collapsed ? '0.6' : '1' } }, buttons);
}`;

const TABS_PILL_SOURCE = `function TabsPill(props) {
  props = props || {};
  var raw = Array.isArray(props.tabs) && props.tabs.length ? props.tabs : ['Overview', 'Details', 'Settings'];
  var tabs = raw.map(function (t, i) {
    if (t && typeof t === 'object') return { id: String(t.id != null ? t.id : (t.label != null ? t.label : i)), label: String(t.label != null ? t.label : t.id) };
    return { id: String(t), label: String(t) };
  });
  var active = props.active != null ? String(props.active) : tabs[0].id;
  function select(id, e) { if (typeof props.onSelect === 'function') props.onSelect(id, e); }
  return React.createElement('div', { className: 'ks-tabs', role: 'tablist', style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } }, tabs.map(function (t) {
    var isActive = t.id === active;
    return React.createElement('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': isActive ? 'true' : 'false', className: isActive ? 'ks-tab ks-tab-active' : 'ks-tab', onClick: function (e) { select(t.id, e); } }, t.label);
  }));
}`;

const STAT_CARD_SOURCE = `function StatCard(props) {
  props = props || {};
  var tones = { good: 'var(--ks-accent-success, #4ade80)', warn: 'var(--ks-accent-warning, #fbbf24)', bad: 'var(--ks-accent-danger, #ef4444)' };
  var valueColor = tones[props.tone] || 'var(--ks-heading)';
  return React.createElement('div', { className: 'ks-card ks-stat-card' },
    props.label != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ks-muted, #9ca3af)' } }, String(props.label)) : null,
    React.createElement('p', { style: { margin: 0, fontSize: '1.5rem', fontWeight: 600, color: valueColor } },
      props.value != null ? String(props.value) : '',
      props.unit != null ? React.createElement('span', { className: 'ks-muted', style: { fontSize: '.85rem', marginLeft: '4px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.unit)) : null));
}`;

const BADGE_SOURCE = `function Badge(props) {
  props = props || {};
  var tone = props.tone === 'ok' || props.tone === 'warn' || props.tone === 'bad' ? ' ks-' + props.tone : '';
  var toneColors = { ok: 'var(--ks-ok, #34d399)', warn: 'var(--ks-warn, #fcd34d)', bad: 'var(--ks-bad, #fca5a5)' };
  var textColor = toneColors[props.tone] || 'var(--ks-body, #e5e7eb)';
  var kids = props.text != null ? String(props.text) : (props.children !== undefined ? props.children : '');
  return React.createElement('span', { className: 'ks-badge' + tone, title: props.title, style: { display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', border: '1px solid var(--ks-card-border, rgba(255,255,255,0.15))', background: 'var(--ks-input-bg, rgba(0,0,0,0.3))', color: textColor } }, kids);
}`;

const PAGE_HEADER_SOURCE = `function PageHeader(props) {
  props = props || {};
  var title = props.title != null ? String(props.title) : 'Title';
  var actions = Array.isArray(props.actions) ? props.actions : [];
  var btns = [];
  if (typeof props.onRefresh === 'function') {
    btns.push(React.createElement('button', { key: '__refresh', type: 'button', className: 'ks-btn-header ks-icon-btn', title: 'Refresh', 'aria-label': 'Refresh', onClick: props.onRefresh },
      React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('polyline', { points: '1 4 1 10 7 10' }),
        React.createElement('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10' }))));
  }
  actions.forEach(function (a, i) {
    if (!a) return;
    var label = a.label != null ? String(a.label) : ('Action ' + (i + 1));
    btns.push(React.createElement('button', { key: 'a' + i, type: 'button', className: 'ks-btn-header ks-icon-btn', title: a.title || label, 'aria-label': label, onClick: a.onClick }, label));
  });
  return React.createElement('div', { className: 'ks-page-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '0.75rem' } },
    React.createElement('h2', { style: { margin: 0, fontSize: '1.3rem', color: 'var(--ks-heading)' } }, title),
    React.createElement('div', { className: 'ks-page-header-actions', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, btns));
}`;

const EMPTY_STATE_SOURCE = `function EmptyState(props) {
  props = props || {};
  function handleAction(e) { if (typeof props.onAction === 'function') props.onAction(e); }
  return React.createElement('div', { className: 'ks-card', style: { textAlign: 'center', padding: '2rem 1rem' } },
    React.createElement('h3', { style: { margin: '0 0 .5rem', fontSize: '.95rem', color: 'var(--ks-heading)' } }, props.title != null ? String(props.title) : 'Nothing here yet'),
    props.hint != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 1rem', fontSize: '13px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.hint)) : null,
    props.actionLabel != null ? React.createElement('button', { type: 'button', className: 'ks-btn ks-btn-blue', style: { background: 'var(--ks-info, #38bdf8)', color: '#fff' }, onClick: handleAction }, String(props.actionLabel)) : null);
}`;

export const PAGE_UI_COMPONENTS: PageUIComponent[] = [
  {
    name: 'page_action_pill',
    ksuiKey: 'ActionPill',
    label: 'Action pill (React)',
    description:
      'Live React clone of the panel action pill (same ks-card/ks-tab classes). ' +
      'Differs from panel_action_pill on purpose: buttons call YOUR callbacks instead of inline ' +
      'location.reload()/toast handlers, and the collapse toggle is a controlled `collapsed` prop.',
    props: 'refreshLabel?: string (default "Refresh"); primaryLabel?: string (default "Run"); ' +
      'onRefresh?(e): void; onPrimary?(e): void; actions?: Array<{label, primary?, title?, onClick?}> ' +
      '(extra buttons after the primary, each wired to its own callback); collapsed?: boolean; ' +
      'onToggleCollapse?(next: boolean, e): void. Toggle shows ">" expanded / "<" collapsed.',
    source: ACTION_PILL_SOURCE,
  },
  {
    name: 'page_tabs_pill',
    ksuiKey: 'TabsPill',
    label: 'Tabs pill (React)',
    description:
      'Live React clone of the panel tab bar (same ks-tabs/ks-tab classes, roles + aria-selected). ' +
      'Differs from panel_tabs_pill on purpose: CONTROLLED — pass `active` + `onSelect` (the HTML ' +
      'original toggles DOM classes inline). Default tabs mirror the original: Overview/Details/Settings.',
    props: 'tabs?: Array<string | {id, label, title?}> (default ["Overview","Details","Settings"]); ' +
      'active?: string (tab id, defaults to first); onSelect?(id: string, e): void.',
    source: TABS_PILL_SOURCE,
  },
  {
    name: 'page_stat_card',
    ksuiKey: 'StatCard',
    label: 'Stat card (React)',
    description:
      'Live React clone of the panel stat card (same ks-card ks-stat-card classes + label/value/unit styles). ' +
      'Adds an optional `tone` (good/warn/bad tinting the value via --ks-accent-* tokens with the same ' +
      'fallbacks CustomPageView uses); omit it for the pixel-identical default.',
    props: 'label?: string; value?: string | number; unit?: string; tone?: "default" | "good" | "warn" | "bad".',
    source: STAT_CARD_SOURCE,
  },
  {
    name: 'page_badge',
    ksuiKey: 'Badge',
    label: 'Badge (React)',
    description:
      'Live React clone of the panel badge (same ks-badge + ks-ok/ks-warn/ks-bad classes). ' +
      'Differs from panel_badge on purpose: renders ONE badge (text + tone props) instead of the ' +
      'four-sample showcase row the HTML fragment ships.',
    props: 'text?: string; children?: React.ReactNode (used when text omitted); ' +
      'tone?: "default" | "ok" | "warn" | "bad"; title?: string.',
    source: BADGE_SOURCE,
  },
  {
    name: 'page_page_header',
    ksuiKey: 'PageHeader',
    label: 'Page header (React)',
    description:
      'Live React clone of the panel page header (same ks-page-header / ks-page-header-actions / ' +
      'ks-btn-header ks-icon-btn classes + identical refresh SVG). Differs from panel_page_header on ' +
      'purpose: the refresh icon renders ONLY when `onRefresh` is wired (no dead buttons), and extra ' +
      'text `actions` may follow it. SVG attrs are the React camelCase equivalents of the original.',
    props: 'title?: string (default "Title"); onRefresh?(e): void; ' +
      'actions?: Array<{label, title?, onClick?}>.',
    source: PAGE_HEADER_SOURCE,
  },
  {
    name: 'page_empty_state',
    ksuiKey: 'EmptyState',
    label: 'Empty state (React)',
    description:
      'Centered empty-state card composed from panel primitives (ks-card / ks-muted / ks-btn ks-btn-blue). ' +
      'No single panel_* original — it mirrors the host empty patterns (e.g. "no content yet" blocks). ' +
      'The action button renders only when `actionLabel` is set and calls `onAction`.',
    props: 'title?: string (default "Nothing here yet"); hint?: string; actionLabel?: string; onAction?(e): void.',
    source: EMPTY_STATE_SOURCE,
  },
];

const PAGE_UI_MAP = new Map(PAGE_UI_COMPONENTS.map((c) => [c.name, c]));
const KSUI_KEY_MAP = new Map(PAGE_UI_COMPONENTS.map((c) => [c.name, c.ksuiKey]));

/** Resolve a page_* registry key to its clone entry (undefined when unknown). */
export function getPageUIComponent(name: string): PageUIComponent | undefined {
  return PAGE_UI_MAP.get(name);
}

/** True when name is a page_* clone key (React-only, rendered via KSUI). */
export function isPageUIComponentKey(name: string): boolean {
  return PAGE_UI_MAP.has(name);
}

/** Map a stored shared row ref to its KSUI member (null for non-clone keys).
 *  This is the React renderer's shared→KSUI mapping: a type:'shared' row
 *  whose ref is a page_* key resolves to KSUI.<ksuiKey>. */
export function ksuiKeyForSharedKey(shared: string): string | null {
  return KSUI_KEY_MAP.get((shared || '').trim()) ?? null;
}

/** Build the KSUI scope expression injected once per React bundle.
 *  `reactExpr` names the React runtime in the injection scope (the renderer
 *  passes `slot.react`; tests pass `React`). The result is a compile-time
 *  constant expression — never author input — evaluating to
 *  { ActionPill, TabsPill, StatCard, Badge, PageHeader, EmptyState }. */
export function buildKsuiPreamble(reactExpr: string): string {
  const defs = PAGE_UI_COMPONENTS.map((c) => c.source).join('\n');
  const assigns = PAGE_UI_COMPONENTS.map((c) => `O[${JSON.stringify(c.ksuiKey)}]=${c.ksuiKey};`).join('');
  return `(function(React){var O={};\n${defs}\n${assigns}return O;})(${reactExpr})`;
}
