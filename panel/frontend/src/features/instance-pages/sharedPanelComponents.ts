// Shared panel components for instance pages (import-by-reference).
//
// Same-to-same with the panel's own UI kit: every entry mirrors its real
// counterpart in `shared/components/ui/` (PageActionsPill, PageTabsPill,
// PageFormActionsPill, Card, modal/skeleton/badge/bar/table/button paint)
// using the identical `ks-*` classes, inline styles and `var(--ks-*)`
// tokens. The host bakes the matching animation/collapse CSS
// (`ks-pill-anim`, `ks-pill-collapsed`, `ks-pill-content` gap, toggle slim
// rules) into every instance-page iframe (CustomPageView), so behavior
// classes work without per-page CSS.
//
// Pills are FUNCTIONAL here, not screenshots: the `ks-pill-toggle`
// buttons run dependency-free inline handlers (no imports, no globals
// beyond the element itself) that collapse/restore the `ks-pill-content`
// exactly like the React originals (maxWidth/opacity/transform +
// pointerEvents/visibility + aria-expanded/hidden + slim 4px toggle +
// chevron swap). Scroll/outside/Escape auto-close needs page-level JS
// (see automation.yaml `wire()`); the toggle + animation work standalone.
//
// Import model: the Studio's Components tab stores ONLY the reference
//   { name: "<registry-key>", type: "shared", shared: "<registry-key>" }
// (no source copy). At visit time CustomPageView resolves the token from
// this registry, so panel updates propagate to every page automatically.
// Unknown tokens stay literal, so renaming here never breaks old pages.

export interface SharedPanelComponent {
  /** Registry key — also the default `{{component:name}}` token. */
  name: string;
  /** Short label shown in the Import picker. */
  label: string;
  description: string;
  /** Rendered HTML fragment (theme-aware via var(--ks-*)). */
  content: string;
}

// Chevron glyphs shared by every pill toggle (real panel geometry:
// stroke 2.2, w-4 h-4). Pages building pills in JS should import these as
// `{{component:icon_chev_*}}` instead of inlining SVGs.
const CHEV_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEV_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
const CHEV_UP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;
const CHEV_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="6 9 12 15 18 15"/></svg>`;

// Horizontal collapse handler (actions + form pills): mirrors
// PageActionsPill toggle — slide+fade the content, slim the toggle to 4px,
// swap chevrons, keep everything discoverable (never invisible).
const TOGGLE_HORIZONTAL =
  `var p=this.closest('.ks-actions-pill,.ks-form-actions-pill');` +
  `var c=p.querySelector('.ks-pill-content');` +
  `var off=p.classList.toggle('ks-pill-collapsed');` +
  `if(c){c.style.maxWidth=off?'0':'800px';c.style.opacity=off?'0':'1';` +
  `c.style.transform=off?'translateX(8px)':'none';` +
  `c.style.pointerEvents=off?'none':'auto';` +
  `c.style.visibility=off?'hidden':'visible';c.style.overflow='hidden';` +
  `if(!off){c.style.overflow='visible';}` +
  `c.setAttribute('aria-hidden',off?'true':'false');}` +
  `var a=this.querySelector('[data-chev=open]'),b=this.querySelector('[data-chev=shut]');` +
  `if(a)a.style.display=off?'none':'';if(b)b.style.display=off?'':'none';` +
  `this.setAttribute('aria-label',off?'Show actions':'Hide actions');` +
  `this.setAttribute('aria-expanded',off?'false':'true');` +
  `this.setAttribute('title',off?'Show actions':'Hide actions');` +
  `if(off){this.style.setProperty('--ks-tab-px','4px');}` +
  `else{this.style.setProperty('--ks-tab-px','var(--ks-pill-tab-px,10px)');}`;

// Vertical collapse handler (tabs pill): mirrors PageTabsPill toggle —
// rise+fade the menu, `^` closed / `v` open. Starts open in this demo so
// the tab rows are visible on import; one click collapses to `^`.
const TOGGLE_VERTICAL =
  `var p=this.closest('.ks-tabs-pill');` +
  `var c=p.querySelector('.ks-pill-content');` +
  `var off=p.classList.toggle('ks-pill-collapsed');` +
  `if(c){c.style.maxHeight=off?'0':'50vh';c.style.opacity=off?'0':'1';` +
  `c.style.transform=off?'translateY(8px)':'none';` +
  `c.style.pointerEvents=off?'none':'auto';` +
  `c.style.visibility=off?'hidden':'visible';c.style.overflow='hidden';` +
  `if(!off){c.style.overflowY='auto';}` +
  `c.setAttribute('aria-hidden',off?'true':'false');` +
  `p.setAttribute('data-open',off?'false':'true');}` +
  `var a=this.querySelector('[data-chev=open]'),b=this.querySelector('[data-chev=shut]');` +
  `if(a)a.style.display=off?'none':'';if(b)b.style.display=off?'':'none';` +
  `this.setAttribute('aria-expanded',off?'false':'true');` +
  `if(off){this.style.setProperty('--ks-tab-px','4px');}` +
  `else{this.style.setProperty('--ks-tab-px','var(--ks-pill-tab-px,10px)');}`;

// Tab-row select handler: mirrors the callers' ks-tab-active highlight +
// keeps aria-selected truthful (the old fragment never updated it).
const SELECT_TAB =
  `var g=this.parentElement;` +
  `g.querySelectorAll('.ks-tab').forEach(function(b){b.classList.remove('ks-tab-active');b.setAttribute('aria-selected','false');});` +
  `this.classList.add('ks-tab-active');this.setAttribute('aria-selected','true');`;

const PILL_TOGGLE_STYLE =
  `--ks-tab-px:var(--ks-pill-tab-px,10px);--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0`;

export const SHARED_PANEL_COMPONENTS: SharedPanelComponent[] = [
  {
    name: 'panel_action_pill',
    label: 'Action pill',
    description:
      'Functional top-right actions cluster mirroring PageActionsPill (role=toolbar, ks-pill-content, slide+fade collapse, slim 4px chevron toggle, aria-expanded/hidden). Demo Refresh/Run buttons — replace the content row with your own actions; the toggle works as-is.',
    content:
      `<div style="position:fixed;top:12px;right:12px;z-index:40">` +
      `<div class="ks-card ks-pill-anim ks-actions-pill" role="toolbar" aria-label="Page actions" style="display:flex;align-items:center;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px">` +
      `<div class="ks-pill-content" style="display:flex;align-items:center;gap:4px" aria-hidden="false">` +
      `<button type="button" class="ks-tab" style="padding:5px 10px;font-size:13px" onclick="location.reload()" title="Refresh">Refresh</button>` +
      `<button type="button" class="ks-tab ks-tab-active" style="padding:5px 10px;font-size:13px" onclick="KSPageSDK.toast('Action pill ready','success')" title="Primary action">Run</button>` +
      `</div>` +
      `<button type="button" class="ks-tab ks-pill-toggle" style="${PILL_TOGGLE_STYLE}" aria-label="Hide actions" aria-expanded="true" title="Hide actions" onclick="${TOGGLE_HORIZONTAL}">` +
      `<span data-chev="open">${CHEV_RIGHT}</span><span data-chev="shut" style="display:none">${CHEV_LEFT}</span>` +
      `</button></div></div>`,
  },
  {
    name: 'panel_tabs_pill',
    label: 'Tabs pill',
    description:
      'Functional phone tab bar mirroring PageTabsPill (ks-tabs-pill shell, tablist semantics, rise+fade menu, ^/v toggle, aria-selected updates on select). Tab clicks also collapse back to ^ like the panel.',
    content:
      `<nav class="ks-tabs-pill-wrap" aria-label="Page tabs" style="position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;justify-content:flex-start;pointer-events:none">` +
      `<div style="pointer-events:auto;max-width:100%">` +
      `<div class="ks-card ks-pill-anim ks-tabs-pill" style="display:inline-flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;border-radius:8px;max-width:calc(100vw - 24px);--ks-card-padding:6px" data-open="true">` +
      `<div class="ks-pill-content" role="tablist" aria-label="Page tabs" onclick="if(event.target&&event.target.closest&&event.target.closest('button')){var p=this.closest('.ks-tabs-pill');var c=this;var t=p.querySelector('.ks-pill-toggle');c.style.maxHeight='0';c.style.opacity='0';c.style.transform='translateY(8px)';c.style.pointerEvents='none';c.style.visibility='hidden';c.style.overflow='hidden';c.setAttribute('aria-hidden','true');p.classList.add('ks-pill-collapsed');p.setAttribute('data-open','false');if(t){var a=t.querySelector('[data-chev=open]'),b=t.querySelector('[data-chev=shut]');if(a)a.style.display='none';if(b)b.style.display='';t.setAttribute('aria-expanded','false');t.style.setProperty('--ks-tab-px','4px');}}" style="display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow-y:auto" aria-hidden="false" data-open="true">` +
      `<button type="button" class="ks-tab ks-tab-active" role="tab" aria-selected="true" style="justify-content:flex-start" onclick="${SELECT_TAB}">Overview</button>` +
      `<button type="button" class="ks-tab" role="tab" aria-selected="false" style="justify-content:flex-start" onclick="${SELECT_TAB}">Details</button>` +
      `<button type="button" class="ks-tab" role="tab" aria-selected="false" style="justify-content:flex-start" onclick="${SELECT_TAB}">Settings</button>` +
      `</div>` +
      `<button type="button" class="ks-tab ks-pill-toggle" style="${PILL_TOGGLE_STYLE};width:100%" aria-label="Hide tabs" aria-expanded="true" title="Hide tabs" onclick="${TOGGLE_VERTICAL}">` +
      `<span data-chev="open">${CHEV_DOWN}</span><span data-chev="shut" style="display:none">${CHEV_UP}</span>` +
      `</button></div></div></nav>`,
  },
  {
    name: 'panel_form_actions_pill',
    label: 'Form actions pill',
    description:
      'Bottom-right Save/Cancel bar mirroring PageFormActionsPill (ks-form-actions-pill, wrap-friendly, same slide+fade toggle as the actions pill). Always visible by default; auto-hide is opt-in per page.',
    content:
      `<div style="position:fixed;left:12px;right:12px;bottom:12px;z-index:40;display:flex;justify-content:flex-end;pointer-events:none">` +
      `<div style="pointer-events:auto">` +
      `<div class="ks-card ks-pill-anim ks-form-actions-pill" role="toolbar" aria-label="Form actions" style="display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px">` +
      `<div class="ks-pill-content" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap" aria-hidden="false">` +
      `<button type="button" class="ks-btn" title="Cancel">Cancel</button>` +
      `<button type="button" class="ks-btn ks-btn-blue" title="Save">Save</button>` +
      `</div>` +
      `<button type="button" class="ks-tab ks-pill-toggle" style="${PILL_TOGGLE_STYLE}" aria-label="Hide form actions" aria-expanded="true" title="Hide form actions" onclick="${TOGGLE_HORIZONTAL}">` +
      `<span data-chev="open">${CHEV_RIGHT}</span><span data-chev="shut" style="display:none">${CHEV_LEFT}</span>` +
      `</button></div></div></div>`,
  },
  {
    name: 'panel_page_header',
    label: 'Page header',
    description: 'Panel page header: title left, icon buttons right (Templates/Nodes pattern).',
    content: `<div class="ks-page-header"><h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Title</h2><div class="ks-page-header-actions"><button type="button" class="ks-btn-header ks-icon-btn" title="Refresh" aria-label="Refresh" onclick="location.reload()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button></div></div>`,
  },
  {
    name: 'panel_glass_card',
    label: 'Glass card',
    description: 'Baseline panel surface (.ks-card / .glass-card) with heading + body.',
    content: `<div class="ks-card"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">Card title</h3><p class="ks-muted" style="margin:0;font-size:13px">Body text follows the active theme automatically.</p></div>`,
  },
  {
    name: 'panel_stat_card',
    label: 'Stat card',
    description: 'Panel stat card with label, big value and unit.',
    content: `<div class="ks-card ks-stat-card" role="group" aria-label="Statistic"><p class="ks-muted" style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Containers</p><p style="margin:0;font-size:1.5rem;font-weight:600;color:var(--ks-heading)">42<span class="ks-muted" style="font-size:.85rem;margin-left:4px">up</span></p></div>`,
  },
  {
    name: 'panel_badge',
    label: 'Badge',
    description: 'Status pills (.ks-badge) with ok/warn/bad tones — one per state.',
    content: `<span role="group" aria-label="Badge examples"><span class="ks-badge">default</span> <span class="ks-badge ks-ok">running</span> <span class="ks-badge ks-warn">paused</span> <span class="ks-badge ks-bad">stopped</span></span>`,
  },
  {
    name: 'panel_alert',
    label: 'Alert',
    description: 'Inline notice using panel wash tokens. Announced to screen readers.',
    content: `<div class="ks-card" role="alert" style="border-color:var(--ks-info-line,rgba(7,89,133,.45));background:var(--ks-info-wash,rgba(2,132,199,.3));color:var(--ks-body)">Heads up — this uses the active theme colors.</div>`,
  },
  {
    name: 'panel_progress',
    label: 'Progress bar',
    description: 'Panel progress bar (.ks-bar). Set width % on the inner span and keep aria-valuenow in sync.',
    content: `<div class="ks-bar" role="progressbar" aria-label="Progress" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100"><span style="width:62%"></span></div>`,
  },
  {
    name: 'panel_table',
    label: 'Table',
    description: 'Panel table shell (thead + body) with theme borders.',
    content: `<div class="ks-card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead><tr><th scope="col">Name</th><th scope="col">Status</th></tr></thead><tbody><tr><td>web</td><td class="ks-ok">Running</td></tr><tr><td>db</td><td class="ks-muted">Stopped</td></tr></tbody></table></div></div>`,
  },
  {
    name: 'panel_buttons',
    label: 'Buttons',
    description: 'Panel button family (.ks-btn / .ks-btn-blue / .ks-btn-green / .ks-btn-red).',
    content: `<div class="ks-row"><button type="button" class="ks-btn">Default</button><button type="button" class="ks-btn ks-btn-blue">Primary</button><button type="button" class="ks-btn ks-btn-green">Success</button><button type="button" class="ks-btn ks-btn-red">Danger</button></div>`,
  },
  {
    name: 'panel_skeleton',
    label: 'Skeleton',
    description: 'Loading shimmer used while KSPageSDK data loads. Hidden from screen readers.',
    content: `<div class="ks-card" aria-hidden="true"><div class="ks-skeleton-bar" style="height:10px;width:40%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:10px;width:70%"></div></div>`,
  },
  {
    name: 'panel_modal',
    label: 'Modal',
    description: 'Panel modal shell (.ks-ip-modal-*). Static preview — wire your own open/close; the ✕ hides this demo copy.',
    content: `<div class="ks-ip-modal-overlay" style="position:static;padding:0;background:transparent"><div class="ks-ip-modal-panel" role="dialog" aria-modal="true" aria-label="Dialog" style="max-width:420px;margin:0 auto"><div class="ks-ip-modal-header"><h3 class="ks-ip-modal-title">Dialog</h3><button type="button" class="ks-ip-modal-close" aria-label="Close dialog" onclick="this.closest('.ks-ip-modal-panel').style.display='none'">✕</button></div><div class="ks-ip-modal-body"><p class="ks-muted" style="margin:0;font-size:13px">Modal body text.</p></div><div class="ks-ip-modal-footer"><button type="button" class="ks-btn">Cancel</button><button type="button" class="ks-btn ks-btn-blue">Confirm</button></div></div></div>`,
  },
  {
    name: 'panel_empty_state',
    label: 'Empty state',
    description: 'Centered empty-state card from panel primitives (mirrors host "no content yet" blocks).',
    content: `<div class="ks-card" role="status" style="text-align:center;padding:2rem 1rem"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">Nothing here yet</h3><p class="ks-muted" style="margin:0;font-size:13px">Items you create will appear here.</p></div>`,
  },
  {
    name: 'icon_chev_left',
    label: 'Chevron left',
    description: 'Pill toggle glyph: show actions (collapsed pill).',
    content: CHEV_LEFT,
  },
  {
    name: 'icon_chev_right',
    label: 'Chevron right',
    description: 'Pill toggle glyph: hide actions (expanded pill).',
    content: CHEV_RIGHT,
  },
  {
    name: 'icon_chev_up',
    label: 'Chevron up',
    description: 'Tabs-pill toggle glyph: collapsed menu (show tabs).',
    content: CHEV_UP,
  },
  {
    name: 'icon_chev_down',
    label: 'Chevron down',
    description: 'Tabs-pill toggle glyph: open menu (hide tabs).',
    content: CHEV_DOWN,
  },
];

const SHARED_MAP = new Map(SHARED_PANEL_COMPONENTS.map((c) => [c.name, c]));

/** Resolve a shared key to its HTML (empty string when unknown). */
export function getSharedPanelComponentContent(name: string): string {
  return SHARED_MAP.get(name)?.content ?? '';
}
