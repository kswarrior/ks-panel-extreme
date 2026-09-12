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
// Collapse/animation mirrors PageActionsPill/PageTabsPill/PageFormActionsPill
// exactly (ks-pill-content inline geometry, ks-pill-collapsed slim toggle,
// slide/fade/scale/none hiddenTransform, aria-expanded/hidden). Auto-hide on
// scroll/outside/focus stays a page-level concern: wire `collapsed` from
// your own state (see the ActionPill/FormActions/TabsDropdown docs) — the
// clones never attach document listeners themselves.
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

// Compact pill-tab sizing shared by every toggle (mirrors PILL_TAB_STYLE;
// collapsed toggle slims to 4px like PILL_TOGGLE_COLLAPSED_PX).
const TOGGLE_STYLE_OPEN =
  `{ padding: '5px 10px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ` +
  `'--ks-tab-px': 'var(--ks-pill-tab-px,10px)', '--ks-tab-py': 'var(--ks-pill-tab-py,5px)', '--ks-tab-font': 'var(--ks-pill-tab-font,13px)' }`;
const TOGGLE_STYLE_SHUT =
  `{ padding: '5px 4px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ` +
  `'--ks-tab-px': '4px', '--ks-tab-py': 'var(--ks-pill-tab-py,5px)', '--ks-tab-font': 'var(--ks-pill-tab-font,13px)' }`;

const CHEV_LEFT_EL =
  `React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, ` +
  `React.createElement('polyline', { points: '15 18 9 12 15 6' }))`;
const CHEV_RIGHT_EL =
  `React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, ` +
  `React.createElement('polyline', { points: '9 18 15 12 9 6' }))`;
const CHEV_UP_EL =
  `React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, ` +
  `React.createElement('polyline', { points: '18 15 12 9 6 15' }))`;
const CHEV_DOWN_EL =
  `React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, ` +
  `React.createElement('polyline', { points: '6 9 12 15 18 15' }))`;

const ACTION_PILL_SOURCE = `function ActionPill(props) {
  props = props || {};
  var collapsed = !!props.collapsed;
  var animation = props.animation || 'slide';
  var hiddenTransform = animation === 'fade' ? 'none' : animation === 'scale' ? 'scale(0.92)' : animation === 'none' ? 'none' : 'translateX(8px)';
  var refreshLabel = props.refreshLabel != null ? String(props.refreshLabel) : 'Refresh';
  var primaryLabel = props.primaryLabel != null ? String(props.primaryLabel) : 'Run';
  var extra = Array.isArray(props.actions) ? props.actions : [];
  function handleRefresh(e) { if (typeof props.onRefresh === 'function') props.onRefresh(e); }
  function handlePrimary(e) { if (typeof props.onPrimary === 'function') props.onPrimary(e); }
  function handleToggle(e) { if (typeof props.onToggleCollapse === 'function') props.onToggleCollapse(!collapsed, e); }
  var content = [];
  content.push(React.createElement('button', { key: 'refresh', type: 'button', className: 'ks-tab', style: { padding: '5px 10px', fontSize: '13px' }, title: 'Refresh', 'aria-label': 'Refresh', onClick: handleRefresh }, refreshLabel));
  content.push(React.createElement('button', { key: 'primary', type: 'button', className: 'ks-tab ks-tab-active', style: { padding: '5px 10px', fontSize: '13px' }, title: primaryLabel, 'aria-label': primaryLabel, onClick: handlePrimary }, primaryLabel));
  extra.forEach(function (a, i) {
    if (!a) return;
    var label = a.label != null ? String(a.label) : ('Action ' + (i + 1));
    content.push(React.createElement('button', { key: 'x' + i, type: 'button', className: a.primary ? 'ks-tab ks-tab-active' : 'ks-tab', style: { padding: '5px 10px', fontSize: '13px' }, title: a.title || label, 'aria-label': label, onClick: a.onClick }, label));
  });
  var contentStyle = collapsed
    ? { display: 'flex', alignItems: 'center', gap: '4px', maxWidth: 0, opacity: 0, transform: hiddenTransform, transformOrigin: animation === 'scale' ? 'right center' : undefined, transition: animation === 'none' ? 'none' : undefined, pointerEvents: 'none', visibility: 'hidden', overflow: 'hidden', padding: 0, margin: 0 }
    : { display: 'flex', alignItems: 'center', gap: '4px', maxWidth: 800, opacity: 1, transform: 'none', padding: 0, margin: 0, overflow: 'visible' };
  return React.createElement('div', { style: { position: 'fixed', top: '12px', right: '12px', zIndex: 40 } },
    React.createElement('div', { className: 'ks-card ks-pill-anim ks-actions-pill' + (collapsed ? ' ks-pill-collapsed' : '') + (animation === 'none' ? ' ks-pill-instant' : ''), role: 'toolbar', 'aria-label': props.ariaLabel || 'Page actions', style: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.40)', '--ks-card-padding': '6px' } },
      React.createElement('div', { key: 'c', className: 'ks-pill-content', style: contentStyle, 'aria-hidden': collapsed }, content),
      React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: collapsed ? ${TOGGLE_STYLE_SHUT} : ${TOGGLE_STYLE_OPEN}, title: collapsed ? 'Show actions' : 'Hide actions', 'aria-label': collapsed ? 'Show actions' : 'Hide actions', 'aria-expanded': !collapsed, onClick: handleToggle }, collapsed ? ${CHEV_LEFT_EL} : ${CHEV_RIGHT_EL})));
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
  return React.createElement('div', { className: 'ks-tabs', role: 'tablist', 'aria-label': props.ariaLabel || 'Page tabs', style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } }, tabs.map(function (t) {
    var isActive = t.id === active;
    return React.createElement('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': isActive ? 'true' : 'false', className: isActive ? 'ks-tab ks-tab-active' : 'ks-tab', onClick: function (e) { select(t.id, e); } }, t.label);
  }));
}`;

const TABS_DROPDOWN_SOURCE = `function TabsDropdown(props) {
  props = props || {};
  var raw = Array.isArray(props.tabs) && props.tabs.length ? props.tabs : ['Overview', 'Details', 'Settings'];
  var tabs = raw.map(function (t, i) {
    if (t && typeof t === 'object') return { id: String(t.id != null ? t.id : (t.label != null ? t.label : i)), label: String(t.label != null ? t.label : t.id) };
    return { id: String(t), label: String(t) };
  });
  var animation = props.animation || 'slide';
  var hiddenTransform = animation === 'fade' ? 'none' : animation === 'scale' ? 'scale(0.95)' : animation === 'none' ? 'none' : 'translateY(8px)';
  var useState = React.useState;
  var openState = useState(props.defaultOpen === true);
  var open = props.open !== undefined ? !!props.open : openState[0];
  var setOpen = openState[1];
  var active = props.active != null ? String(props.active) : tabs[0].id;
  var activeLabel = (tabs.filter(function (t) { return t.id === active; })[0] || {}).label || active;
  function toggle() {
    var next = !open;
    if (props.open === undefined) setOpen(next);
    if (typeof props.onToggle === 'function') props.onToggle(next);
  }
  function select(id, e) {
    if (props.open === undefined) setOpen(false);
    if (typeof props.onToggle === 'function') props.onToggle(false);
    if (typeof props.onSelect === 'function') props.onSelect(id, e);
  }
  function onKeyDown(e) { if (e && e.key === 'Escape' && open) toggle(); }
  var isOff = !open;
  var menuStyle = isOff
    ? { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', minWidth: 0, maxHeight: 0, opacity: 0, transform: hiddenTransform, transformOrigin: animation === 'scale' ? 'center bottom' : undefined, transition: animation === 'none' ? 'none' : undefined, pointerEvents: 'none', visibility: 'hidden', overflow: 'hidden', paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0 }
    : { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', minWidth: 0, maxHeight: '50vh', overflowY: 'auto', opacity: 1, transform: 'none', transition: animation === 'none' ? 'none' : undefined, paddingBottom: '4px', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.10)' };
  return React.createElement('nav', { 'aria-label': props.ariaLabel || 'Page tabs', onKeyDown: onKeyDown, style: { position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: 30, display: 'flex', justifyContent: 'flex-start', pointerEvents: 'none' } },
    React.createElement('div', { style: { pointerEvents: 'auto', maxWidth: '100%' } },
      React.createElement('div', { className: 'ks-card ks-pill-anim ks-tabs-pill' + (isOff ? ' ks-pill-collapsed' : '') + (animation === 'none' ? ' ks-pill-instant' : ''), style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: '4px', padding: '6px', borderRadius: '8px', maxWidth: 'calc(100vw - 24px)', '--ks-card-padding': '6px' } },
        React.createElement('div', { key: 'm', className: 'ks-pill-content', role: 'tablist', 'aria-label': props.ariaLabel || 'Page tabs', style: menuStyle, 'aria-hidden': isOff, 'data-open': open },
          tabs.map(function (t) {
            var isActive = t.id === active;
            return React.createElement('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': isActive ? 'true' : 'false', className: isActive ? 'ks-tab ks-tab-active' : 'ks-tab', style: { justifyContent: 'flex-start' }, onClick: function (e) { select(t.id, e); } }, t.label);
          })),
        React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: isOff ? ${TOGGLE_STYLE_SHUT} : Object.assign(${TOGGLE_STYLE_OPEN}, { width: '100%' }), title: isOff ? ('Show tabs' + (activeLabel ? ' (currently: ' + activeLabel + ')' : '')) : 'Hide tabs', 'aria-label': isOff ? ('Show tabs' + (activeLabel ? ' — ' + activeLabel : '')) : 'Hide tabs', 'aria-expanded': open, onClick: toggle }, isOff ? ${CHEV_UP_EL} : ${CHEV_DOWN_EL}))));
}`;

const FORM_ACTIONS_SOURCE = `function FormActions(props) {
  props = props || {};
  var collapsed = !!props.collapsed;
  var animation = props.animation || 'slide';
  var hiddenTransform = animation === 'fade' ? 'none' : animation === 'scale' ? 'scale(0.92)' : animation === 'none' ? 'none' : 'translateX(8px)';
  function handleToggle(e) { if (typeof props.onToggleCollapse === 'function') props.onToggleCollapse(!collapsed, e); }
  var contentStyle = collapsed
    ? { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', maxWidth: 0, opacity: 0, transform: hiddenTransform, transformOrigin: animation === 'scale' ? 'right center' : undefined, transition: animation === 'none' ? 'none' : undefined, pointerEvents: 'none', visibility: 'hidden', overflow: 'hidden', padding: 0, margin: 0 }
    : { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', maxWidth: 800, opacity: 1, transform: 'none', padding: 0, margin: 0, overflow: 'visible' };
  return React.createElement('div', { style: { position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: 40, display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' } },
    React.createElement('div', { style: { pointerEvents: 'auto' } },
      React.createElement('div', { className: 'ks-card ks-pill-anim ks-form-actions-pill' + (collapsed ? ' ks-pill-collapsed' : '') + (animation === 'none' ? ' ks-pill-instant' : ''), role: 'toolbar', 'aria-label': props.ariaLabel || 'Form actions', style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '4px', padding: '6px', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.40)', '--ks-card-padding': '6px' } },
        React.createElement('div', { key: 'c', className: 'ks-pill-content', style: contentStyle, 'aria-hidden': collapsed }, props.children || null),
        React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: collapsed ? ${TOGGLE_STYLE_SHUT} : ${TOGGLE_STYLE_OPEN}, title: collapsed ? 'Show form actions' : 'Hide form actions', 'aria-label': collapsed ? 'Show form actions' : 'Hide form actions', 'aria-expanded': !collapsed, onClick: handleToggle }, collapsed ? ${CHEV_LEFT_EL} : ${CHEV_RIGHT_EL}))));
}`;

const STAT_CARD_SOURCE = `function StatCard(props) {
  props = props || {};
  var tones = { good: 'var(--ks-accent-success, #4ade80)', warn: 'var(--ks-accent-warning, #fbbf24)', bad: 'var(--ks-accent-danger, #ef4444)' };
  var valueColor = tones[props.tone] || 'var(--ks-heading)';
  return React.createElement('div', { className: 'ks-card ks-stat-card', role: 'group', 'aria-label': props.label != null ? String(props.label) : 'Statistic' },
    props.label != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ks-muted, #9ca3af)' } }, String(props.label)) : null,
    React.createElement('p', { style: { margin: 0, fontSize: '1.5rem', fontWeight: 600, color: valueColor } },
      props.value != null ? String(props.value) : '',
      props.unit != null ? React.createElement('span', { className: 'ks-muted', style: { fontSize: '.85rem', marginLeft: '4px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.unit)) : null));
}`;

const BADGE_SOURCE = `function Badge(props) {
  props = props || {};
  var tone = props.tone === 'ok' || props.tone === 'warn' || props.tone === 'bad' ? ' ks-' + props.tone : '';
  var kids = props.text != null ? String(props.text) : (props.children !== undefined ? props.children : '');
  return React.createElement('span', { className: 'ks-badge' + tone, title: props.title }, kids);
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
  return React.createElement('div', { className: 'ks-card', role: 'status', style: { textAlign: 'center', padding: '2rem 1rem' } },
    React.createElement('h3', { style: { margin: '0 0 .5rem', fontSize: '.95rem', color: 'var(--ks-heading)' } }, props.title != null ? String(props.title) : 'Nothing here yet'),
    props.hint != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 1rem', fontSize: '13px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.hint)) : null,
    props.actionLabel != null ? React.createElement('button', { type: 'button', className: 'ks-btn ks-btn-blue', onClick: handleAction }, String(props.actionLabel)) : null);
}`;

export const PAGE_UI_COMPONENTS: PageUIComponent[] = [
  {
    name: 'page_action_pill',
    ksuiKey: 'ActionPill',
    label: 'Action pill (React)',
    description:
      'Live React clone of PageActionsPill (ks-pill-content, slide/fade/scale/none collapse, slim 4px chevron toggle, aria-expanded/hidden). ' +
      'CONTROLLED — pass `collapsed` + `onToggleCollapse`; buttons call YOUR callbacks. ' +
      'Auto-hide recipe: const [off, setOff] = React.useState(false); React.useEffect(() => { const on = () => { setOff(true); const t = setTimeout(() => setOff(false), 2500); return () => clearTimeout(t); }; ' +
      'document.addEventListener("scroll", on, true); return () => document.removeEventListener("scroll", on, true); }, []); then <KSUI.ActionPill collapsed={off} onToggleCollapse={setOff} .../>.',
    props: 'refreshLabel?: string (default "Refresh"); primaryLabel?: string (default "Run"); ' +
      'onRefresh?(e): void; onPrimary?(e): void; actions?: Array<{label, primary?, title?, onClick?}>; ' +
      'collapsed?: boolean; onToggleCollapse?(next: boolean, e): void; ' +
      'animation?: "slide" | "fade" | "scale" | "none" (default "slide"); ariaLabel?: string.',
    source: ACTION_PILL_SOURCE,
  },
  {
    name: 'page_tabs_pill',
    ksuiKey: 'TabsPill',
    label: 'Tabs pill (React)',
    description:
      'Inline tab strip (desktop ks-tabs pattern with tablist semantics and truthful aria-selected). ' +
      'CONTROLLED — pass `active` + `onSelect`. For the phone dropdown pill use page_tabs_dropdown instead.',
    props: 'tabs?: Array<string | {id, label}> (default ["Overview","Details","Settings"]); ' +
      'active?: string (tab id, defaults to first); onSelect?(id: string, e): void; ariaLabel?: string.',
    source: TABS_PILL_SOURCE,
  },
  {
    name: 'page_tabs_dropdown',
    ksuiKey: 'TabsDropdown',
    label: 'Tabs dropdown (React)',
    description:
      'Live React clone of PageTabsPill (fixed bottom dropdown, starts closed, ^/v toggle, select/Escape closes, rise+fade menu, 50vh scroll). ' +
      'Uncontrolled by default (internal open state); pass `open` + `onToggle` to control it. Never auto-opens — exactly like the panel.',
    props: 'tabs?: Array<string | {id, label}>; active?: string; onSelect?(id: string, e): void; ' +
      'open?: boolean; defaultOpen?: boolean (default false); onToggle?(open: boolean): void; ' +
      'animation?: "slide" | "fade" | "scale" | "none"; ariaLabel?: string.',
    source: TABS_DROPDOWN_SOURCE,
  },
  {
    name: 'page_form_actions',
    ksuiKey: 'FormActions',
    label: 'Form actions (React)',
    description:
      'Live React clone of PageFormActionsPill (bottom-right Save/Cancel bar, wrap-friendly, same slide+fade toggle). ' +
      'CONTROLLED — pass `collapsed` + `onToggleCollapse`; render your buttons as children.',
    props: 'children?: React.ReactNode (your Cancel/Save buttons); collapsed?: boolean; ' +
      'onToggleCollapse?(next: boolean, e): void; animation?: "slide" | "fade" | "scale" | "none"; ariaLabel?: string.',
    source: FORM_ACTIONS_SOURCE,
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
      'Renders ONE badge (text + tone props); paint comes from the host theme, no inline duplicates.',
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
      'Centered empty-state card composed from panel primitives (ks-card / ks-muted / ks-btn ks-btn-blue, role=status). ' +
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
 *  { ActionPill, TabsPill, TabsDropdown, FormActions, StatCard, Badge, PageHeader, EmptyState }. */
export function buildKsuiPreamble(reactExpr: string): string {
  const defs = PAGE_UI_COMPONENTS.map((c) => c.source).join('\n');
  const assigns = PAGE_UI_COMPONENTS.map((c) => `O[${JSON.stringify(c.ksuiKey)}]=${c.ksuiKey};`).join('');
  return `(function(React){var O={};\n${defs}\n${assigns}return O;})(${reactExpr})`;
}
