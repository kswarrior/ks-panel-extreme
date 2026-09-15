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


// ks_theme_head — global shared theme header (A19). Canonical source:
// instance_pages/shared/ks_theme_head.html. Pages include it via
// {{component:ks_theme_head}} (5-pass resolve, module-excluded).
// Keeps all html pages on the panel design system without duplicating 27KiB.
const KS_THEME_HEAD = `<style id="ks-instance-theme-support">/* Instance pages — unified panel design system
   Mirrors panel main pages (panel/frontend/src/index.css + shared/stores/themeStore buildVars
   + shared/components/ui/CustomPageView customPageThemeCss) using --ks-* tokens so the
   active Theme Studio theme applies 1:1. Every card, button, tab, form, badge, table,
   dropdown, modal, and skeleton follows the host theme exactly. */
.ks-page{color:var(--ks-body, #e5e7eb);font-family:var(--ks-font-family, -apple-system, BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif);line-height:1.6}
::selection{background:var(--ks-accent-primary, #38bdf8);color:#fff}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:var(--ks-card-border, rgba(255,255,255,0.15));border-radius:9999px}
::-webkit-scrollbar-track{background:transparent}
a{color:var(--ks-link, #7dd3fc);text-decoration:none}
a:hover{color:var(--ks-info, #38bdf8);text-decoration:underline}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
table{border-collapse:collapse;width:100%}
table th{background:var(--ks-input-bg, rgba(0,0,0,0.30));color:var(--ks-muted, #9ca3af);text-transform:uppercase;font-size:11px;letter-spacing:.05em;padding:8px 12px;text-align:left;border-bottom:1px solid var(--ks-card-border, rgba(255,255,255,0.10))}
table td{padding:8px 12px;text-align:left;font-size:13px;border-bottom:1px solid var(--ks-card-border, rgba(255,255,255,0.08));color:var(--ks-body, #d1d5db)}
hr{border:none;border-top:1px solid var(--ks-card-border, rgba(255,255,255,0.10));margin:1rem 0}

/* ── Glass / Cards (panel's glass-card → ks-card) ── */
.glass,.glass-strong,.glass-chrome{border:1px solid rgba(255,255,255,0.10)}
.glass{background:rgba(255,255,255,0.04);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.glass-strong{background:rgba(255,255,255,0.07);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-color:rgba(255,255,255,0.15);box-shadow:0 8px 32px rgba(0,0,0,0.6)}
.glass-chrome{background:rgba(0,0,0,0.40);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.glass-card,.ks-card,.ks-list-card,.ks-stat-card,.ks-form-card,.ks-modal-card{position:relative;border-radius:var(--ks-card-radius,12px) !important;transition:border-color .2s ease, box-shadow .2s ease}
.glass-card,.ks-card{background-color:var(--ks-card-bg, rgba(255,255,255,0.04)) !important;background-image:var(--ks-card-bg-layer, none) !important;background-size:var(--ks-card-bg-size, cover);background-position:var(--ks-card-bg-position, center);background-repeat:var(--ks-card-bg-repeat, no-repeat);border:var(--ks-card-border-width,1px) solid var(--ks-card-border, rgba(255,255,255,0.10)) !important;box-shadow:var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.45)) !important;backdrop-filter:blur(var(--ks-card-blur, 8px));-webkit-backdrop-filter:blur(var(--ks-card-blur, 8px));padding:var(--ks-card-padding,16px) !important}
.glass-card:hover,.ks-card:hover{border-color:var(--ks-card-hover-border, rgba(255,255,255,0.20)) !important}
.ks-list-card{background:var(--ks-listcard-bg, var(--ks-card-bg, rgba(255,255,255,0.04))) !important;border-color:var(--ks-listcard-border, var(--ks-card-border, rgba(255,255,255,0.10))) !important;box-shadow:var(--ks-listcard-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.45))) !important}
.ks-list-card:hover{border-color:var(--ks-listcard-hover, var(--ks-card-hover-border, rgba(255,255,255,0.20))) !important}
.ks-stat-card{background:var(--ks-statcard-bg, var(--ks-card-bg, rgba(255,255,255,0.04))) !important;border-color:var(--ks-statcard-border, var(--ks-card-border, rgba(255,255,255,0.10))) !important}
.ks-form-card{background:var(--ks-formcard-bg, var(--ks-card-bg, rgba(255,255,255,0.04))) !important;border-color:var(--ks-formcard-border, var(--ks-card-border, rgba(255,255,255,0.10))) !important}
.ks-modal-card{background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.04))) !important;border-color:var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10))) !important;box-shadow:var(--ks-modal-shadow, 0 8px 32px rgba(0,0,0,0.6)) !important;backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%)}
.ks-card h1,.ks-card h2,.ks-card h3{color:var(--ks-heading, #fff);margin:0 0 .5rem;font-weight:600}

/* ── Page header (title left, icon buttons right) — matches panel main pages ── */
.ks-page-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:0.75rem}
.ks-page-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

/* ── Buttons — panel's ks-btn family, themed via --ks-btn-* (Theme Studio → Button) ── */
.ks-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:500;transition:background .15s ease, border-color .15s ease, opacity .15s ease, filter .15s ease;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;user-select:none}
.ks-btn:disabled,.ks-btn-primary:disabled,.ks-btn-secondary:disabled,.ks-btn-ghost:disabled,.ks-btn-danger:disabled,.ks-btn-icon:disabled,.ks-btn-header:disabled{opacity:.5;cursor:not-allowed !important}
.ks-btn-primary,.ks-btn{background:var(--ks-btn-bg, #fff) !important;color:var(--ks-btn-text, #000) !important;border:var(--ks-btn-border, none) !important;border-radius:var(--ks-btn-radius, 6px) !important;padding:var(--ks-btn-py, 8px) var(--ks-btn-px, 19px) !important;font-size:var(--ks-btn-font, 14px) !important}
.ks-btn-primary:hover,.ks-btn:hover{background:var(--ks-btn-hover, #e5e7eb) !important;filter:none}
.ks-btn-secondary,.ks-btn-ghost,.ks-btn-cancel{background:var(--ks-btn-ghost-bg, transparent) !important;color:var(--ks-btn-ghost-text, #e5e7eb) !important;border:var(--ks-btn-ghost-border, 1px solid rgba(255,255,255,0.10)) !important;border-radius:var(--ks-btn-ghost-radius, 6px) !important;padding:var(--ks-btn-ghost-py, 8px) var(--ks-btn-ghost-px, 12px) !important;font-size:var(--ks-btn-ghost-font, 14px) !important}
.ks-btn-secondary:hover,.ks-btn-ghost:hover,.ks-btn-cancel:hover{background:var(--ks-btn-ghost-hover, rgba(255,255,255,0.10)) !important;color:#fff !important}
.ks-btn-danger,.ks-btn-danger-sm{background:var(--ks-accent-danger, #b91c1c) !important;color:#fff !important;border:1px solid var(--ks-bad-line, rgba(185,28,28,0.5)) !important;border-radius:6px !important;padding:8px 14px !important;font-size:13px !important}
.ks-btn-danger:hover,.ks-btn-danger-sm:hover{background:var(--ks-accent-danger, #dc2626) !important;filter:brightness(1.1)}
.ks-btn-icon,.ks-btn-header,.ks-icon-btn,.ks-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--ks-btn-icon-bg, rgba(255,255,255,0.10)) !important;color:var(--ks-btn-icon-text, #fff) !important;border:var(--ks-btn-icon-border, none) !important;border-radius:var(--ks-btn-icon-radius, 8px) !important;padding:7px 10px !important;font-size:12px !important;font-weight:500 !important;cursor:pointer;transition:background .15s ease !important;line-height:1;min-height:32px;min-width:32px}
.ks-btn-icon:hover,.ks-btn-header:hover,.ks-icon-btn:hover,.ks-iconbtn:hover{background:var(--ks-btn-icon-hover, rgba(255,255,255,0.20)) !important}
.ks-btn-icon svg,.ks-btn-header svg,.ks-icon-btn svg,.ks-iconbtn svg{width:var(--ks-btn-icon-size, 14px);height:var(--ks-btn-icon-size, 14px)}
.ks-btn-header.is-open,.ks-btn-icon.is-open{background:var(--ks-btn-icon-hover, rgba(255,255,255,0.20)) !important}
.ks-btn-sm{padding:4px 10px !important;font-size:12px !important;border-radius:4px !important}
.ks-btn-lg{padding:12px 24px !important;font-size:16px !important;border-radius:8px !important}
.ks-btn-outline{background:transparent !important;color:var(--ks-btn-ghost-text, #e5e7eb) !important;border:1px solid rgba(255,255,255,0.30) !important}
.ks-btn-outline:hover{background:rgba(255,255,255,0.10) !important}
.ks-btn-form{padding:10px 18px !important;font-size:14px !important;border-radius:6px !important}
/* Compat: legacy ks-btn-blue/green/red used in dashboard examples */
.ks-btn-blue{background:var(--ks-info, #0284c7) !important;color:#fff !important;border:none !important}
.ks-btn-blue:hover{background:var(--ks-info, #0ea5e9) !important;filter:brightness(1.1)}
.ks-btn-green{background:var(--ks-accent-success, #059669) !important;color:#0b0d10 !important;border:none !important}
.ks-btn-green:hover{background:var(--ks-accent-success, #10b981) !important;filter:brightness(1.08)}
.ks-btn-red{background:var(--ks-accent-danger, #b91c1c) !important;color:#fff !important;border:none !important}
.ks-btn-red:hover{background:var(--ks-accent-danger, #dc2626) !important;filter:brightness(1.08)}
/* Instance-page aliases keep old templates working */
.ks-ip-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:500;font-size:13px;padding:8px 16px;border-radius:6px;cursor:pointer;transition:all .15s ease;border:none;font-family:inherit;line-height:1}
.ks-ip-btn-ghost{background:var(--ks-btn-ghost-bg, transparent) !important;color:var(--ks-btn-ghost-text, #e5e7eb) !important;border:var(--ks-btn-ghost-border, 1px solid rgba(255,255,255,0.10)) !important}
.ks-ip-btn-ghost:hover{background:var(--ks-btn-ghost-hover, rgba(255,255,255,0.10)) !important;color:#fff !important}
.ks-ip-btn-primary{background:var(--ks-btn-bg, #fff) !important;color:var(--ks-btn-text, #000) !important;border:var(--ks-btn-border, none) !important}
.ks-ip-btn-primary:hover{background:var(--ks-btn-hover, #e5e7eb) !important}
.ks-ip-btn:disabled{opacity:0.5;cursor:not-allowed}

/* ── Tabs — panel's pill bar (Templates/Nodes/Security pages) ── */
.ks-tabs{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.ks-tab{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var(--ks-tab-py, 8px) var(--ks-tab-px, 12px);border-radius:var(--ks-tab-radius, 6px);font-size:var(--ks-tab-font, 14px);font-weight:500;border:var(--ks-tab-border, none);cursor:pointer;transition:all .15s ease;background:var(--ks-tab-inactive-bg, transparent);color:var(--ks-tab-inactive-text, #d1d5db);font-family:inherit;line-height:1;white-space:nowrap}
.ks-tab:hover{background:var(--ks-tab-hover-bg, rgba(255,255,255,0.08)) !important;color:var(--ks-tab-hover-text, #fff) !important}
.ks-tab-active,.ks-tab[aria-selected="true"],.ks-tab.is-active{background:var(--ks-tab-active-bg, #fff) !important;color:var(--ks-tab-active-text, #000) !important;box-shadow:0 1px 3px rgba(0,0,0,0.2)}
/* Instance compat */
.ks-ip-tabs{display:flex;gap:4px;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:4px}
.ks-ip-tab{flex:1;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease;background:transparent;color:var(--ks-muted, #9ca3af);font-family:inherit;line-height:1}
.ks-ip-tab-active{background:var(--ks-tab-active-bg, #fff) !important;color:var(--ks-tab-active-text, #000) !important;box-shadow:0 1px 3px rgba(0,0,0,0.2) !important}
.ks-ip-tab:hover:not(.ks-ip-tab-active){background:var(--ks-tab-hover-bg, rgba(255,255,255,0.08)) !important;color:var(--ks-tab-hover-text, #fff) !important}

/* ── Forms — panel's ks-input / ks-select / ks-textarea / ks-label / ks-toggle etc ── */
/* Generic element reset so bare <input> inside any template matches panel */
.ks-page input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not(.ks-btn):not(.ks-tab):not(.ks-btn-header):not(.ks-btn-icon),
.ks-page textarea,
.ks-page select,
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not(.ks-btn):not(.ks-tab):not(.ks-btn-header):not(.ks-btn-icon),
textarea,
select{box-sizing:border-box;background:var(--ks-input-bg, rgba(0,0,0,0.30)) !important;border:1px solid var(--ks-input-border, rgba(255,255,255,0.10)) !important;border-radius:var(--ks-input-radius, 6px) !important;color:var(--ks-input-text, #fff) !important;padding:var(--ks-input-py, 8px) var(--ks-input-px, 12px) !important;font-size:var(--ks-input-font, 14px) !important;transition:border-color .15s ease, box-shadow .15s ease !important;font-family:inherit;outline:none}
.ks-page input::placeholder,.ks-page textarea::placeholder,input::placeholder,textarea::placeholder{color:var(--ks-input-placeholder, #6b7280) !important;opacity:1}
.ks-page input:focus,.ks-page textarea:focus,.ks-page select:focus,input:focus,textarea:focus,select:focus{border-color:var(--ks-input-focus-border, rgba(255,255,255,0.40)) !important;box-shadow:0 0 0 var(--ks-focus-ring-width, 2px) var(--ks-input-focus-ring, rgba(255,255,255,0.15)) !important}
.ks-input,.ks-ip-input{width:100%;box-sizing:border-box;background:var(--ks-input-bg, rgba(0,0,0,0.30)) !important;border:1px solid var(--ks-input-border, rgba(255,255,255,0.10)) !important;border-radius:var(--ks-input-radius, 6px) !important;color:var(--ks-input-text, #fff) !important;padding:var(--ks-input-py, 8px) var(--ks-input-px, 12px) !important;font-size:var(--ks-input-font, 14px) !important;transition:border-color .15s ease, box-shadow .15s ease !important;font-family:inherit}
.ks-input::placeholder,.ks-ip-input::placeholder{color:var(--ks-input-placeholder, #6b7280) !important;opacity:1}
.ks-input:focus,.ks-ip-input:focus{border-color:var(--ks-input-focus-border, rgba(255,255,255,0.40)) !important;box-shadow:0 0 0 2px var(--ks-input-focus-ring, rgba(255,255,255,0.15)) !important;outline:none !important}
.ks-input-sm{padding:6px 10px !important;font-size:12px !important}
.ks-input-lg{padding:12px 16px !important;font-size:16px !important}
.ks-input-error{border-color:var(--ks-bad, #ef4444) !important;box-shadow:0 0 0 2px rgba(239,68,68,0.2) !important}
.ks-input-success{border-color:var(--ks-ok, #22c55e) !important}
.ks-input-disabled{opacity:.5;cursor:not-allowed;background:rgba(0,0,0,0.20) !important}
.ks-input-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace !important;font-size:12px !important}
.ks-select{width:100%;box-sizing:border-box;appearance:none;background-color:var(--ks-select-bg, var(--ks-input-bg, rgba(0,0,0,0.30))) !important;border:1px solid var(--ks-select-border, var(--ks-input-border, rgba(255,255,255,0.10))) !important;border-radius:var(--ks-select-radius, 6px) !important;color:var(--ks-select-text, var(--ks-input-text, #fff)) !important;padding:var(--ks-select-py, 8px) var(--ks-select-px, 12px) !important;padding-right:32px !important;font-size:var(--ks-select-font, 14px) !important;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:16px;cursor:pointer}
.ks-select-sm{padding:6px 10px !important;padding-right:28px !important;font-size:12px !important}
.ks-select-lg{padding:12px 16px !important;padding-right:36px !important;font-size:16px !important}
.ks-textarea{width:100%;box-sizing:border-box;background:var(--ks-textarea-bg, var(--ks-input-bg, rgba(0,0,0,0.30))) !important;border:1px solid var(--ks-textarea-border, var(--ks-input-border, rgba(255,255,255,0.10))) !important;border-radius:var(--ks-textarea-radius, 6px) !important;color:var(--ks-textarea-text, var(--ks-input-text, #fff)) !important;padding:var(--ks-textarea-py, 8px) var(--ks-textarea-px, 12px) !important;font-size:var(--ks-textarea-font, 14px) !important;resize:vertical;min-height:6rem;line-height:1.5}
.ks-textarea-sm{min-height:4rem !important}
.ks-textarea-lg{min-height:10rem !important}
.ks-checkbox{width:var(--ks-checkbox-size, 16px);height:var(--ks-checkbox-size, 16px);accent-color:var(--ks-checkbox-bg-checked, #10b981);border-radius:var(--ks-checkbox-radius, 4px);cursor:pointer}
.ks-checkbox-sm{width:14px;height:14px}
.ks-checkbox-lg{width:20px;height:20px}
.ks-radio{width:var(--ks-radio-size, 16px);height:var(--ks-radio-size, 16px);accent-color:var(--ks-radio-bg-checked, #10b981);cursor:pointer}
.ks-radio-sm{width:14px;height:14px}
.ks-radio-lg{width:20px;height:20px}
.ks-toggle{position:relative;display:inline-flex;align-items:center;height:var(--ks-toggle-height, 24px);width:44px;border-radius:var(--ks-toggle-radius, 9999px);background:var(--ks-toggle-off, rgba(255,255,255,0.10));border:1px solid rgba(255,255,255,0.10);cursor:pointer;transition:background .15s ease}
.ks-toggle.is-on,.ks-toggle:has(input:checked){background:var(--ks-toggle-on, #10b981) !important;border-color:var(--ks-toggle-on, #10b981) !important}
.ks-toggle input{position:absolute;opacity:0;width:0;height:0}
.ks-toggle__thumb,.ks-toggle-thumb{position:absolute;left:2px;top:2px;width:var(--ks-toggle-thumb, 20px);height:var(--ks-toggle-thumb, 20px);border-radius:9999px;background:var(--ks-toggle-thumb-color, #fff);box-shadow:0 1px 3px rgba(0,0,0,0.45);transition:transform .15s cubic-bezier(0.22,1,0.36,1)}
.ks-toggle.is-on .ks-toggle__thumb,.ks-toggle.is-on .ks-toggle-thumb,.ks-toggle:has(input:checked) .ks-toggle__thumb{transform:translateX(20px)}
.ks-label,.ks-page label:not(.ks-toggle):not(.ks-checkbox):not(.ks-radio){display:block;font-size:14px;font-weight:500;color:var(--ks-label-text, #e5e7eb);margin-bottom:4px}
.ks-label-sm{font-size:12px !important}
.ks-label-lg{font-size:16px !important}
.ks-label-required::after{content:' *';color:var(--ks-bad, #f87171)}
.ks-hint{font-size:12px;color:var(--ks-hint-text, #6b7280);margin-top:4px;line-height:1.4}
.ks-hint-error{color:var(--ks-hint-error, #f87171) !important}
.ks-hint-success{color:var(--ks-hint-success, #34d399) !important}
.ks-field{display:flex;flex-direction:column;gap:6px}
.ks-field-inline{display:flex;flex-direction:row;align-items:center;gap:12px}
.ks-field-inline .ks-label{margin-bottom:0 !important}
.ks-form-group{display:flex;flex-direction:column;gap:16px}
.ks-form-row{display:flex;flex-wrap:wrap;gap:16px}
.ks-form-row > .ks-field{flex:1;min-width:200px}
.ks-file-input{width:100%;font-size:14px;color:var(--ks-body, #d1d5db)}
.ks-file-input::file-selector-button{margin-right:12px;padding:6px 14px;border-radius:6px;border:0;background:var(--ks-btn-icon-bg, rgba(255,255,255,0.10));color:var(--ks-btn-icon-text, #fff);font-size:13px;cursor:pointer}
.ks-color-input{width:40px;height:40px;border-radius:6px;border:1px solid var(--ks-card-border, rgba(255,255,255,0.10));padding:0;background:transparent;cursor:pointer}
.ks-range{width:100%;height:6px;background:rgba(255,255,255,0.10);border-radius:9999px;appearance:none;cursor:pointer;accent-color:var(--ks-accent-success, #10b981)}
.ks-range::-webkit-slider-thumb{appearance:none;width:16px;height:16px;background:var(--ks-accent-success, #10b981);border-radius:9999px;border:2px solid #fff}
.ks-search-input{padding-left:36px !important;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.7' opacity='0.7'%3E%3Ccircle cx='11' cy='11' r='7'%3E%3C/circle%3E%3Cpath d='M20 20L16 16'%3E%3C/path%3E%3C/svg%3E") !important;background-repeat:no-repeat !important;background-position:10px center !important;background-size:16px !important}

/* ── Badges / Bars / Utilities — panel's .ks-badge / .ks-bar / .ks-row etc ── */
.ks-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-size:11px;border:1px solid var(--ks-card-border, rgba(255,255,255,0.15));background:var(--ks-input-bg, rgba(0,0,0,0.30));color:var(--ks-body, #d1d5db)}
.ks-bar{position:relative;background:var(--ks-input-bg, rgba(0,0,0,0.30));border-radius:9999px;height:8px;overflow:hidden;min-width:80px}
.ks-bar > span{position:absolute;inset:0 auto 0 0;background:var(--ks-info, #38bdf8);border-radius:9999px;transition:width .3s ease}
.ks-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ks-muted{color:var(--ks-muted, #9ca3af) !important}
.ks-faint{color:var(--ks-faint, #6b7280) !important}
.ks-ok{color:var(--ks-ok, #34d399) !important}
.ks-bad{color:var(--ks-bad, #fca5a5) !important}
.ks-warn{color:var(--ks-warn, #fcd34d) !important}
.ks-info{color:var(--ks-info, #38bdf8) !important}
.ks-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ks-heading{color:var(--ks-heading, #fff)}
.ks-body{color:var(--ks-body, #e5e7eb)}

/* ── Dropdowns / Menus — matches panel's .glass-dropdown / .ks-dropdown ── */
.ks-dropdown,.ks-menu,.glass-dropdown{position:relative;background:var(--ks-dropdown-bg, rgba(12,14,18,0.22)) !important;backdrop-filter:blur(var(--ks-dropdown-blur, 28px)) saturate(180%) !important;-webkit-backdrop-filter:blur(var(--ks-dropdown-blur, 28px)) saturate(180%) !important;border:var(--ks-dropdown-border-width,1px) solid var(--ks-dropdown-border, rgba(255,255,255,0.10)) !important;border-radius:var(--ks-dropdown-radius, 10px) !important;box-shadow:var(--ks-dropdown-shadow, 0 12px 40px rgba(0,0,0,0.55)) !important;color:var(--ks-dropdown-item-text, #e5e7eb) !important}
.ks-dropdown::before,.glass-dropdown::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;background-image:var(--ks-dropdown-bg-image-layer, none);background-size:cover;background-position:center;filter:blur(var(--ks-dropdown-bg-blur, 0px))}
.ks-menu button,.ks-dropdown button{color:var(--ks-dropdown-item-text, #e5e7eb);background:transparent;border:none;cursor:pointer}
.ks-menu button:hover,.ks-dropdown button:hover{background:var(--ks-dropdown-item-hover, rgba(255,255,255,0.08)) !important}
.ks-menu{position:absolute;min-width:var(--ks-dropdown-min-width, 180px);padding:var(--ks-dropdown-padding, 4px);z-index:var(--ks-z-dropdown, 50)}
.ks-menu button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:var(--ks-dropdown-item-py, 8px) var(--ks-dropdown-item-px, 12px);border-radius:6px;font-size:var(--ks-dropdown-font, 13px)}
.rich-check{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;border:1px solid rgba(255,255,255,0.28);background:rgba(0,0,0,0.25);flex-shrink:0}
.rich-check.is-on{background:#fff;border-color:#fff;color:#0b0d10}
.rich-toggle{position:relative;display:inline-block;width:34px;height:18px;border-radius:9999px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.18);flex-shrink:0}
.rich-toggle.is-on{background:#38bdf8;border-color:rgba(56,189,248,0.55)}
.rich-toggle__knob{position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:9999px;background:#f8fafc;box-shadow:0 1px 3px rgba(0,0,0,0.45);transition:transform .14s ease}
.rich-toggle.is-on .rich-toggle__knob{transform:translateX(16px)}
.rich-separator{height:1px;margin:4px 6px;background:var(--ks-dropdown-header-sep, rgba(255,255,255,0.10))}
.glass-dropdown{}

/* ── Modal — panel's dialog surface ── */
@keyframes ks-overlay-in{from{opacity:0}to{opacity:1}}
@keyframes ks-modal-in{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.ks-ip-modal-overlay{position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease}
.ks-ip-modal-panel{background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%);width:100%;max-width:512px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column}
.ks-ip-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10;border-radius:var(--ks-modal-radius,12px) var(--ks-modal-radius,12px) 0 0}
.ks-ip-modal-title{font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0;line-height:1.2}
.ks-ip-modal-close{border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:color .15s ease, background .15s ease}
.ks-ip-modal-close:hover{color:var(--ks-heading, #fff);background:rgba(255,255,255,0.08)}
.ks-ip-modal-body{padding:20px 24px;display:flex;flex-direction:column;gap:16px;flex:1}
.ks-ip-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02);border-radius:0 0 var(--ks-modal-radius,12px) var(--ks-modal-radius,12px)}
@media(max-width:640px){.ks-ip-modal-panel{width:96vw;margin:8px;max-height:92vh}}
@media(prefers-reduced-motion:reduce){.ks-ip-modal-overlay,.ks-ip-modal-panel{animation:none !important}}
.ks-ip-modal-overlay{overscroll-behavior:contain}
html[data-ks-reduced-motion='1'] .ks-ip-modal-overlay,html[data-ks-reduced-motion='1'] .ks-ip-modal-panel{animation:none !important}

/* ── Skeletons — matches panel's Loading skeleton tokens ── */
@keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}
.ks-skeleton{background:var(--ks-skeleton-base, rgba(255,255,255,0.06)) !important;border-radius:var(--ks-skeleton-radius,6px) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite}
.ks-skeleton-bar{background:var(--ks-skeleton-shimmer, rgba(255,255,255,0.13)) !important;border-radius:var(--ks-skeleton-radius,6px) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite}
.ks-skeleton-avatar{width:32px;height:32px;border-radius:9999px;background:var(--ks-skeleton-shimmer, rgba(255,255,255,0.13)) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite;flex-shrink:0}
.ks-skeleton-table th .ks-skeleton-bar,.ks-skeleton-table td .ks-skeleton-bar{height:10px}
@media(prefers-reduced-motion:reduce){.ks-skeleton,.ks-skeleton-bar,.ks-skeleton-avatar,.ks-skeleton-card{animation:none !important}}
html[data-ks-reduced-motion='1'] .ks-skeleton,html[data-ks-reduced-motion='1'] .ks-skeleton-bar,html[data-ks-reduced-motion='1'] .ks-skeleton-avatar,html[data-ks-reduced-motion='1'] .ks-skeleton-card{animation:none !important}

/* ── Scroll / Layout helpers ── */
.ks-ip-scroll-area{max-height:calc(100vh - 240px);max-height:calc(100dvh - 240px);overflow:auto}
.ks-page [style*="grid-template-columns:repeat(auto-fill"]{max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px}
.ks-hidden-sm{display:contents}
@media(max-width:640px){.ks-hidden-sm{display:none !important}}
@media(min-width:641px){.ks-only-sm{display:none !important}}
/* Terminal */
.ks-term-bg{background:var(--ks-term-bg, #1e1e1e) !important;color:var(--ks-term-text, #d4d4d4) !important;border-color:var(--ks-term-border, rgba(255,255,255,0.10)) !important}
</style>
`;

export const SHARED_PANEL_COMPONENTS: SharedPanelComponent[] = [
  {
    name: 'ks_theme_head',
    label: 'Theme head',
    description:
      'Global theme header: panel design-system CSS using var(--ks-*) tokens. Include once at the top of every html page via {{component:ks_theme_head}}.',
    content: KS_THEME_HEAD,
  },
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
