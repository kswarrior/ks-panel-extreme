// Shared panel components for instance pages (import-by-reference).
//
// The panel's own UI kit (Card, PageActionsPill, PageTabsPill, badges,
// bars, tables, modals, skeletons…) already ships its theme-aware CSS
// (`ks-*` tokens baked by CustomPageView into every instance-page iframe).
// This registry exposes those patterns as HTML fragments that instance
// pages can reuse via `{{component:<name>}}`.
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

export const SHARED_PANEL_COMPONENTS: SharedPanelComponent[] = [
  {
    name: 'panel_action_pill',
    label: 'Action pill',
    description: 'Top-right actions cluster (same look as panel pages: refresh + action + collapse toggle).',
    content: `<div class="ks-card ks-pill-anim ks-actions-pill" style="display:flex;align-items:center;gap:4px;padding:6px;border-radius:8px;width:fit-content;margin-left:auto"><button class="ks-tab" style="padding:5px 10px;font-size:13px" onclick="location.reload()" title="Refresh">Refresh</button><button class="ks-tab ks-tab-active" style="padding:5px 10px;font-size:13px" onclick="KSPageSDK.toast('Action pill ready','success')" title="Primary action">Run</button><button class="ks-tab ks-pill-toggle" style="padding:5px 10px;font-size:13px" title="Hide actions" onclick="this.parentElement.style.opacity='0.6'">&gt;</button></div>`,
  },
  {
    name: 'panel_tabs_pill',
    label: 'Tabs pill',
    description: 'Panel tab bar (desktop strip + phone pill pattern). Toggle .ks-tab-active to switch.',
    content: `<div class="ks-tabs" role="tablist"><button class="ks-tab ks-tab-active" role="tab" aria-selected="true" onclick="this.parentElement.querySelectorAll('.ks-tab').forEach(b=>b.classList.remove('ks-tab-active'));this.classList.add('ks-tab-active')">Overview</button><button class="ks-tab" role="tab" aria-selected="false" onclick="this.parentElement.querySelectorAll('.ks-tab').forEach(b=>b.classList.remove('ks-tab-active'));this.classList.add('ks-tab-active')">Details</button><button class="ks-tab" role="tab" aria-selected="false" onclick="this.parentElement.querySelectorAll('.ks-tab').forEach(b=>b.classList.remove('ks-tab-active'));this.classList.add('ks-tab-active')">Settings</button></div>`,
  },
  {
    name: 'panel_page_header',
    label: 'Page header',
    description: 'Panel page header: title left, icon buttons right (Templates/Nodes pattern).',
    content: `<div class="ks-page-header"><h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Title</h2><div class="ks-page-header-actions"><button class="ks-btn-header ks-icon-btn" title="Refresh" aria-label="Refresh" onclick="location.reload()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button></div></div>`,
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
    content: `<div class="ks-card ks-stat-card"><p class="ks-muted" style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Containers</p><p style="margin:0;font-size:1.5rem;font-weight:600;color:var(--ks-heading)">42<span class="ks-muted" style="font-size:.85rem;margin-left:4px">up</span></p></div>`,
  },
  {
    name: 'panel_badge',
    label: 'Badge',
    description: 'Small status pill (.ks-badge) with ok/warn/bad helpers.',
    content: `<span class="ks-badge">default</span> <span class="ks-badge ks-ok">running</span> <span class="ks-badge ks-warn">paused</span> <span class="ks-badge ks-bad">stopped</span>`,
  },
  {
    name: 'panel_alert',
    label: 'Alert',
    description: 'Inline notice using panel ok/warn/bad wash tokens.',
    content: `<div class="ks-card" style="border-color:var(--ks-info-line,rgba(7,89,133,.45));background:var(--ks-info-wash,rgba(2,132,199,.3))">Heads up — this uses the active theme colors.</div>`,
  },
  {
    name: 'panel_progress',
    label: 'Progress bar',
    description: 'Panel progress bar (.ks-bar). Set width % on the inner span.',
    content: `<div class="ks-bar"><span style="width:62%"></span></div>`,
  },
  {
    name: 'panel_table',
    label: 'Table',
    description: 'Panel table shell (thead + body) with theme borders.',
    content: `<div class="ks-card" style="padding:0;overflow:hidden"><table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>web</td><td class="ks-ok">Running</td></tr><tr><td>db</td><td class="ks-muted">Stopped</td></tr></tbody></table></div>`,
  },
  {
    name: 'panel_buttons',
    label: 'Buttons',
    description: 'Panel button family (.ks-btn / .ks-btn-blue / .ks-btn-red / .ks-btn-green).',
    content: `<div class="ks-row"><button class="ks-btn">Default</button><button class="ks-btn ks-btn-blue">Primary</button><button class="ks-btn ks-btn-green">Success</button><button class="ks-btn ks-btn-red">Danger</button></div>`,
  },
  {
    name: 'panel_skeleton',
    label: 'Skeleton',
    description: 'Loading shimmer used while KSPageSDK data loads.',
    content: `<div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:40%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:10px;width:70%"></div></div>`,
  },
  {
    name: 'panel_modal',
    label: 'Modal',
    description: 'Panel modal shell (.ks-ip-modal-*). Toggle display to open.',
    content: `<div class="ks-ip-modal-overlay" style="position:static;padding:0;background:transparent"><div class="ks-ip-modal-panel" style="max-width:420px;margin:0 auto"><div class="ks-ip-modal-header"><h3 class="ks-ip-modal-title">Dialog</h3></div><div class="ks-ip-modal-body"><p class="ks-muted" style="margin:0;font-size:13px">Modal body text.</p></div><div class="ks-ip-modal-footer"><button class="ks-btn">Cancel</button><button class="ks-btn ks-btn-blue">Confirm</button></div></div></div>`,
  },
];

const SHARED_MAP = new Map(SHARED_PANEL_COMPONENTS.map((c) => [c.name, c]));

/** True when name is a panel-shared component key. */
export function isSharedPanelComponent(name: string): boolean {
  return SHARED_MAP.has(name);
}

/** Resolve a shared key to its HTML (empty string when unknown). */
export function getSharedPanelComponentContent(name: string): string {
  return SHARED_MAP.get(name)?.content ?? '';
}

/** Resolve a shared key to its full def (for preview/tooltips). */
export function getSharedPanelComponent(name: string): SharedPanelComponent | undefined {
  return SHARED_MAP.get(name);
}
