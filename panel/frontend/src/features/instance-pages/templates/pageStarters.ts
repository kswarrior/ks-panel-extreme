// PAGE STARTERS — a built-in library of fully functional instance-page
// templates for the Instance Page Studio ("Templates" tab).
//
// Every starter is an ordinary custom instance page whose JavaScript talks
// ONLY to KSPageSDK — exactly what an admin authors in the Studio. Runtime
// execution is allow-list based: pages call KSPageSDK.runAction(name,
// { args }) and the server runs the matching SAVED action (actions shipped
// in each starter's manifest, incl. open_args entries for parameterised
// operations such as "docker stop <name>"). The set covers the surfaces VM &
// container operators usually need (Docker manager, systemd services, cron,
// disk analyzer, package updates, firewall, users, system info) plus
// verbatim ports of the former instance_pages/pages/*.json library (Home /
// Files / Network / Terminal / Settings / Env / Automation / Processes /
// Metrics / Ports / Backups / Audit + docs/dashboard examples), which was
// consolidated into this file when that directory was removed.
//
// Security notes:
//   • No external resources — everything runs offline inside the panel.
//   • All dynamic values pass through esc() before touching innerHTML.
//   • Destructive operations always confirm() first.
//   • Data access goes through the SDK bridge; runAction payloads are
//     matched server-side against this page's saved actions and instance-
//     scoped + permission-gated (see CustomPageView / fetchPanel).

import type { InstancePageSubPage, PageActionDef } from '../types/instancePage';

export interface PageStarter {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  /** Inner SVG markup (no <svg> wrapper). */
  iconSvg: string;
  html?: string;
  /** Saved executable actions the template ships with (loaded into the
   *  Studio's Actions tab when the template is applied). */
  actions?: PageActionDef[];
  /** Content type for ported definitions that are not 'html'. */
  contentType?: 'html' | 'markdown' | 'blocks';
  markdown?: string;
  blocks?: string;
  /** Sub-pages shipped with the template (e.g. files -> /edit). */
  subPages?: InstancePageSubPage[];
}

// Alias for "staterpages to pages" wording — StaterPage is the same as
// PageStarter (starter page that gets bulk-added directly to instance_pages).
export type PageStaterPage = PageStarter;
export type StaterPage = PageStarter;

// ---------------------------------------------------------------------------
// Shared helpers injected into every starter page.
// ---------------------------------------------------------------------------

// Every dynamic call goes through KSPageSDK.runAction(name, { args }) — the
// server executes ONLY payloads that match a SAVED action of this page
// (ExecuteCustomPageActionHandler). Raw ad-hoc shell via sdk.shell() was
// rejected server-side, which left every template stuck on "Loading…";
// these helpers keep pages on the supported path.
const COMMON_JS = `
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function el(id){return document.getElementById(id);}
function toast(m,t){try{KSPageSDK.toast(m,t||'info');}catch(e){}}
async function act(name,args){var r=await KSPageSDK.runAction(name,{args:(args||[])});if(r&&r.ok===false)throw new Error(r.error||r.stderr||('Action failed: '+name));if(r&&r.error&&!r.stdout&&!r.stderr&&!r.data)throw new Error(r.error);return r;}
// tok resolves a panel theme token to a concrete color for canvas/SVG attributes that cannot consume var().
// Every instance page is fully theme-aware: tok() mirrors the host's --ks-* tokens with themed fallbacks.
function tok(name,fb){try{var v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v||fb;}catch(e){return fb;}}
// ask() routes destructive-operation confirmations through the panel's themed
// ConfirmDialog (sdk.confirm bridges to the host origin) instead of the
// browser-native confirm(). Falls back so pages stay functional everywhere.
async function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==='function')return await window.KSPageSDK.confirm(m);}catch(e){}return window.confirm(m);}
function pre(text,maxH){return '<pre style="max-height:'+(maxH||420)+'px;overflow:auto;font-size:12px;margin:0;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);color:var(--ks-body);border-radius:var(--ks-radius-md,6px);padding:0.75rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">'+esc(text==null?'':text)+'</pre>';}
function card(title,innerHtml){return '<div class="ks-card"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">'+title+'</h3>'+innerHtml+'</div>';}
function cardUnit(key,title,innerHtml){return '<div class="ks-card" data-ks-key="'+esc(key)+'"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">'+esc(title)+'</h3>'+innerHtml+'</div>';}
// ── React-like per-unit patching (no full page reload, only changed unit updates) ──
// ksPatch diffs containers and patches only changed units (by data-ks-key / id), preserving scroll/focus.
// This gives React-style granularity: fetching latest data patches only the unit whose data changed,
// instead of wiping the whole page via innerHTML. Deep-keyed units ([data-ks-key]) are patched
// individually like React reconciliation; non-keyed chrome (headers, skeletons) uses shallow child diff.
function ksPatch(targetId, newHtml){
  var root=document.getElementById(targetId);
  if(!root) return;
  var tmp=document.createElement('div');
  tmp.innerHTML=newHtml;
  var newKeys=tmp.querySelectorAll('[data-ks-key]');
  var oldNodes=root.querySelectorAll('[data-ks-key]');
  var oldMap={};
  for(var oi=0;oi<oldNodes.length;oi++){ var on=oldNodes[oi]; oldMap[on.getAttribute('data-ks-key')]=on; }
  var hasKeyed = newKeys.length>0;
  if(hasKeyed){
    function findParentInRoot(node, tmpRoot, realRoot){
      var path=[]; var cur=node.parentElement;
      while(cur && cur!==tmpRoot){ var p=cur.parentElement; if(!p) break; var idx=Array.prototype.indexOf.call(p.children, cur); path.unshift(idx); cur=p; }
      var target=realRoot; for(var pi=0; pi<path.length; pi++){ if(!target || target.children.length<=path[pi]) return realRoot; target=target.children[path[pi]]; } return target;
    }
    // 1) patch / add keyed units
    for(var i=0;i<newKeys.length;i++){
      var n=newKeys[i];
      var key=n.getAttribute('data-ks-key');
      var o=oldMap[key];
      if(o && o.outerHTML!==n.outerHTML){ o.replaceWith(n.cloneNode(true)); }
      else if(!o){ try{ var pr=findParentInRoot(n, tmp, root); pr.appendChild(n.cloneNode(true)); }catch(e){} }
      if(o) delete oldMap[key];
    }
    // 2) remove old units that disappeared
    for(var k in oldMap){ try{ oldMap[k].remove(); }catch(e){} }
    // 3) shallow diff for direct children that do NOT contain keyed units (headers, banners, skeletons)
    if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
      for(var i=0;i<tmp.children.length;i++){
        var nn=tmp.children[i];
        var oo=root.children[i];
        var nnHasKey = !!nn.querySelector('[data-ks-key]') || nn.hasAttribute('data-ks-key');
        var ooHasKey = !!oo.querySelector('[data-ks-key]') || oo.hasAttribute('data-ks-key');
        if(nnHasKey || ooHasKey) continue; // already handled via deep keyed patch (or their children were)
        if(oo.outerHTML!==nn.outerHTML){ oo.replaceWith(nn.cloneNode(true)); }
      }
    }
    // if still no direct children match (e.g., initial skeleton -> loaded grid), fall back to innerHTML if
    // root has no keyed units yet but new does — skeleton will be replaced via the remove/add above,
    // but if root was skeleton (no keys) and new has keys, we need to replace whole inner
    if(oldNodes.length===0 && newKeys.length>0){
      // first real load after skeleton: tmp has keys, root had none — replace inner but preserve scroll
      // Only if root's current html is skeleton (no keys) we can safely replace
      if(root.innerHTML!==newHtml){
        var st0=root.scrollTop, sl0=root.scrollLeft;
        root.innerHTML=newHtml;
        try{root.scrollTop=st0; root.scrollLeft=sl0;}catch(e){}
      }
      return;
    }
    // after deep patch, if counts match and no structural skeleton mismatch, we're done
    return;
  }
  // No keyed units: shallow child diff (per-unit when children are units)
  if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
    var ch=0;
    for(var i=0;i<tmp.children.length;i++){
      var nn2=tmp.children[i];
      var oo2=root.children[i];
      var nk=nn2.getAttribute('data-ks-key')||nn2.id||'';
      var ok=oo2.getAttribute('data-ks-key')||oo2.id||'';
      if(nk!==ok){
        if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; }
        continue;
      }
      if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; }
    }
    if(ch===0 && root.innerHTML!==tmp.innerHTML){
      if(root.innerHTML!==newHtml){
        var st=root.scrollTop, sl=root.scrollLeft;
        root.innerHTML=newHtml;
        try{root.scrollTop=st; root.scrollLeft=sl;}catch(e){}
      }
    }
    return;
  }
  if(root.innerHTML!==newHtml){
    var st2=root.scrollTop, sl2=root.scrollLeft;
    root.innerHTML=newHtml;
    try{root.scrollTop=st2; root.scrollLeft=sl2;}catch(e){}
  }
}
function ksUnitPatch(unitId, innerHtml){
  var n=document.getElementById(unitId);
  if(!n) return;
  if(n.innerHTML!==innerHtml) n.innerHTML=innerHtml;
}
function ksRefreshUnit(unitId, fetcher, renderer){
  return fetcher().then(function(data){
    var html=renderer(data);
    ksUnitPatch(unitId, html);
    return data;
  });
}
// Make every future innerHTML assignment on #root / #content go through ksPatch automatically
// so even legacy templates that still do el('content').innerHTML = html get per-unit granularity.
(function(){
  try{
    var _gid=document.getElementById.bind(document);
    function _patchNode(n){
      if(!n || n._ksPatched) return n;
      try{
        var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
        if(!desc || !desc.set) return n;
        var origGet=desc.get, origSet=desc.set;
        Object.defineProperty(n,'innerHTML',{
          get:function(){ return origGet.call(this); },
          set:function(v){
            if(this.id){ ksPatch(this.id, String(v)); } else { origSet.call(this, String(v)); }
          },
          configurable:true, enumerable:true
        });
        n._ksPatched=true;
      }catch(e){}
      return n;
    }
    window.el=function(id){ return _patchNode(_gid(id)); };
    document.getElementById=function(id){ return _patchNode(_gid(id)); };
    window.ksPatch=ksPatch;
    window.ksUnitPatch=ksUnitPatch;
    window.ksRefreshUnit=ksRefreshUnit;
    window.cardUnit=cardUnit;
  }catch(e){}
})();
`;

// Instance pages are fully theme-aware: every starter inherits the active panel theme
// (all --ks-* tokens baked by CustomPageView.customPageThemeCss). This preamble ensures
// complete theme support in every page (typography, selection, scrollbars, links) so the
// theme chosen in the panel's Theme system applies to all instance pages.
const INSTANCE_THEME_SUPPORT_CSS = `<style id="ks-instance-theme-support">/* Instance pages — unified panel design system
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
</style>`;

// page() wraps a body + script into the standard starter skeleton. The
// generated script is a plain async IIFE whose errors land in #content.
// Header (title + top-right icon actions) is now supplied inside body via
// ks-page-header / ks-page-header-actions so every page follows the main
// panel's Templates/Nodes header pattern (title left, icon buttons right).
// Includes a skeleton fallback so operator pages (Docker, Services, etc.)
// never appear stuck: if #content still contains a shimmer after 8.5s,
// replace it with a clear error — this fixes the regression where skeletons
// added by an AI never cleared.
function page(title: string, body: string, js: string): string {
  return `${INSTANCE_THEME_SUPPORT_CSS}<div class="ks-page">
${body}
</div>
<script>
${COMMON_JS}
(async function(){
  var content = el('content');
  try {
${js}
  } catch (e) {
    if (content) content.innerHTML = '<p class="ks-bad">Failed to load: ' + esc((e && e.message) || e) + '</p>';
    else throw e;
  }
})();
setTimeout(function(){ try{ var c=el('content'); if(c && c.innerHTML.indexOf('ks-skeleton')!==-1) c.innerHTML='<p class="ks-bad" style="padding:12px;background:var(--ks-bad-wash);border:1px solid var(--ks-bad-line);border-radius:6px">Load timed out — edge did not respond. Refresh to retry.</p>'; }catch(e){} }, 8500);
document.currentScript.remove();
</script>`;
}

// withTheme ensures every LIB page carries the instance theme support preamble so the
// active panel theme (all --ks-* tokens baked by CustomPageView) visibly themes every surface.
// Files already ships its own themed <style> — withTheme skips injection there via id check.
function withTheme(html: string): string {
  if (!html) return html;
  if (html.includes('ks-instance-theme-support') || html.includes('ks-theme')) return html;
  return INSTANCE_THEME_SUPPORT_CSS + html;
}

// ---------------------------------------------------------------------------
// VM & CONTAINER OPERATOR EXTRAS — surfaces panel users typically need
// beyond the built-in set.
// ---------------------------------------------------------------------------

const DOCKER_MANAGER = page(
  'Docker Containers',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Docker Containers</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="prune" title="Prune dangling images" aria-label="Prune dangling images"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </div>
  </div>
  <div style="margin-bottom:0.6rem"><span id="note" class="ks-muted" style="font-size:11px"></span></div>
  <div id="content"><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:32px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:78px"></div><div class="ks-skeleton-bar" style="height:10px;width:62px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:58px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:10px;width:76px"></div><div class="ks-skeleton-bar" style="height:10px;width:60px"></div><div class="ks-skeleton-bar" style="height:10px;width:52px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:70px"></div><div class="ks-skeleton-bar" style="height:10px;width:80px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:10px;width:56px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:66px"></div><div class="ks-skeleton-bar" style="height:10px;width:74px"></div><div class="ks-skeleton-bar" style="height:10px;width:58px"></div><div class="ks-skeleton-bar" style="height:10px;width:50px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div></div></div>
  <div id="logs" style="display:none;margin-top:0.75rem">
    <div class="ks-row" style="justify-content:space-between;margin-bottom:0.35rem">
      <code id="logtitle" class="ks-muted"></code>
      <button class="ks-btn-header ks-icon-btn" id="closelogs" title="Close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <pre id="logbox" style="background:var(--ks-input-bg);border-radius:8px;padding:0.75rem;max-height:320px;overflow:auto;font-size:12px"></pre>
  </div>`,
  `
    if (KSPageSDK.instance.kind !== 'docker') {
      el('note').textContent = 'Driver is "' + KSPageSDK.instance.kind + '" — docker commands only work where a docker CLI exists.';
    }
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:32px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:78px"></div><div class="ks-skeleton-bar" style="height:10px;width:62px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:58px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:80px 1.1fr 1.3fr 1fr 1fr 130px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:10px;width:76px"></div><div class="ks-skeleton-bar" style="height:10px;width:60px"></div><div class="ks-skeleton-bar" style="height:10px;width:52px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:18px;width:36px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:18px;width:32px;border-radius:9999px"></div></div></div></div>';
      var r = await act('list_containers');
      var lines = ((r.stdout || '') + '').split('\\n').filter(Boolean);
      if (!lines.length) { el('content').innerHTML = '<p class="ks-muted">No containers found (or docker unavailable).</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>ID</th><th>Name</th><th>Image</th><th>Status</th><th>Ports</th><th style="width:230px">Actions</th></tr></thead><tbody>' +
        lines.map(function(line){
          var c = line.split('|');
          var name = c[1] || '';
          return '<tr data-ks-key="' + esc(name || c[0] || '') + '"><td class="ks-mono">' + esc(c[0] || '') + '</td><td><strong>' + esc(name) + '</strong></td><td>' + esc(c[2] || '') + '</td>' +
            '<td>' + esc(c[3] || '') + '</td><td class="ks-mono" style="font-size:11px">' + esc(c[4] || '') + '</td>' +
            '<td class="ks-row">' +
            '<a href="#" data-op="start" data-name="' + esc(name) + '" class="ks-ok">start</a> ' +
            '<a href="#" data-op="stop" data-name="' + esc(name) + '" class="ks-warn">stop</a> ' +
            '<a href="#" data-op="restart" data-name="' + esc(name) + '">restart</a> ' +
            '<a href="#" data-op="logs" data-name="' + esc(name) + '">logs</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function showLogs(name){
      var r = await act('container_logs', [name]);
      el('logtitle').textContent = 'logs: ' + name;
      el('logbox').textContent = ((r.stdout || '') + '') + ((r.stderr || '') + '');
      el('logs').style.display = 'block';
    }
    el('refresh').onclick = load;
    el('closelogs').onclick = function(){ el('logs').style.display = 'none'; };
    el('prune').onclick = async function(){
      if (!(await ask('Remove ALL dangling docker images now?'))) return;
      try { var r = await act('prune_dangling'); toast('Prune finished: exit ' + (r.exit_code != null ? r.exit_code : '?'), r.exit_code === 0 ? 'success' : 'error'); }
      catch (e) { toast(e.message, 'error'); }
    };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a[data-op]');
      if (!t) return;
      ev.preventDefault();
      var op = t.dataset.op;
      var name = t.dataset.name;
      try {
        if (op === 'logs') { await showLogs(name); return; }
        if ((op === 'stop' || op === 'restart') && !(await ask(op + ' container "' + name + '"?'))) return;
        var r = await act('container_' + op, [name]);
        toast('docker ' + op + ': exit ' + (r.exit_code != null ? r.exit_code : '?'), r.exit_code === 0 ? 'success' : 'error');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
    await load();
  `,
);

const SERVICE_CONTROL = page(
  'Services',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Services</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div class="ks-row" style="margin-bottom:0.6rem"><input id="q" class="ks-input ks-search-input" placeholder="filter services…" style="flex:1;max-width:260px" /></div>
  <div id="content"><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:44px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:92px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:86px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:108px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:96px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:88px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:82px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:102px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:90px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:96px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div></div></div>
  <div id="detail" style="display:none;margin-top:0.75rem">
    <div class="ks-row" style="justify-content:space-between;margin-bottom:0.35rem">
      <code id="detailtitle" class="ks-muted"></code>
      <button class="ks-btn-header ks-icon-btn" id="closedetail" title="Close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <pre id="detailbox" style="background:var(--ks-input-bg);border-radius:8px;padding:0.75rem;max-height:320px;overflow:auto;font-size:12px"></pre>
  </div>`,
  `
    var units = [];
    function render(){
      var q = el('q').value.trim().toLowerCase();
      var rows = q ? units.filter(function(u){ return u.unit.toLowerCase().indexOf(q) >= 0; }) : units;
      if (!rows.length) { el('content').innerHTML = '<p class="ks-muted">' + (units.length ? 'No match.' : 'No systemd units reported (systemctl may be unavailable).') + '</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>Unit</th><th>Active</th><th>Sub</th><th>Description</th><th style="width:210px">Actions</th></tr></thead><tbody>' +
        rows.map(function(u){
          return '<tr data-ks-key="' + esc(u.unit) + '"><td class="ks-mono">' + esc(u.unit) + '</td><td>' + esc(u.active) + '</td><td>' + esc(u.sub) + '</td><td>' + esc(u.desc) + '</td>' +
            '<td class="ks-row">' +
            '<a href="#" data-op="start" data-u="' + esc(u.unit) + '" class="ks-ok">start</a> ' +
            '<a href="#" data-op="stop" data-u="' + esc(u.unit) + '" class="ks-warn">stop</a> ' +
            '<a href="#" data-op="restart" data-u="' + esc(u.unit) + '">restart</a> ' +
            '<a href="#" data-op="status" data-u="' + esc(u.unit) + '">status</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:44px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:92px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:86px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:108px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:96px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 70px 1.5fr 140px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:88px"></div><div class="ks-skeleton" style="height:10px;width:34px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:82px"></div><div style="display:flex;gap:6px"><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:16px;width:30px;border-radius:9999px"></div></div></div></div>';
      var r = await act('list_units');
      units = ((r.stdout || '') + '').split('\\n').filter(function(l){ return l.trim(); }).map(function(line){
        var f = line.trim().split(/\\s+/);
        return { unit: f[0] || '', active: f[2] || '', sub: f[3] || '', desc: f.slice(4).join(' ') };
      }).filter(function(u){ return u.unit.indexOf('.service') >= 0; });
      render();
    }
    el('refresh').onclick = load;
    el('q').oninput = render;
    el('closedetail').onclick = function(){ el('detail').style.display = 'none'; };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a[data-op]');
      if (!t) return;
      ev.preventDefault();
      var op = t.dataset.op;
      var u = t.dataset.u;
      try {
        if (op === 'status') {
          var s = await act('unit_status', [u]);
          el('detailtitle').textContent = 'status: ' + u;
          el('detailbox').textContent = ((s.stdout || '') + '') + ((s.stderr || '') + '');
          el('detail').style.display = 'block';
          return;
        }
        if ((op === 'stop' || op === 'restart') && !(await ask(op + ' ' + u + '?'))) return;
        var r = await act('unit_' + op, [u]);
        toast(u + ' ' + op + ': exit ' + (r.exit_code != null ? r.exit_code : '?'), r.exit_code === 0 ? 'success' : 'error');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
    await load();
  `,
);

const CRON_SCHEDULER = page(
  'Cron Jobs',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Cron Jobs</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div id="content"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:36%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:72%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:34%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div>';
      var r = await act('cron_overview');
      el('content').innerHTML = cardUnit('cron', 'Cron & scheduled jobs', pre(((r.stdout || '') + '').trim() || '(empty)'));
    }
    el('refresh').onclick = load;
    await load();
  `,
);

const DISK_ANALYZER = page(
  'Disk Usage',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Disk Usage</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="cleantmp" title="Clean old /tmp files" aria-label="Clean tmp"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </div>
  </div>
  <div style="margin-bottom:0.6rem"><span id="note" class="ks-muted" style="font-size:11px"></span></div>
  <div id="content"><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:68%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:72%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%"></div></div></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%"></div></div>';
      var dfR = null, duR = null;
      try { dfR = await act('df_report'); } catch(e){ dfR = { stdout: '(df unavailable)' }; }
      try { duR = await act('du_top'); } catch(e){ duR = { stdout: '(du unavailable or timed out)' }; }
      el('content').innerHTML =
        cardUnit('df', 'Filesystems (df -h)', pre(dfR.stdout)) +
        cardUnit('du', 'Largest top-level directories (du)', pre(duR.stdout));
    }
    el('refresh').onclick = load;
    el('cleantmp').onclick = async function(){
      if (!(await ask('Delete /tmp files untouched for over 7 days now?'))) return;
      try {
        var r = await act('clean_tmp');
        toast(((r.stdout || '') + '').trim() || ('exit ' + (r.exit_code != null ? r.exit_code : '?')), r.exit_code === 0 ? 'success' : 'error');
      } catch (e) { toast(e.message, 'error'); }
    };
    await load();
  `,
);

const UPDATE_CENTER = page(
  'Package Updates',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Package Updates</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="check" title="Check updates" aria-label="Check updates"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v3l2 2"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="upgrade" style="display:none" title="Apply upgrades" aria-label="Apply upgrades"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
    </div>
  </div>
  <div style="margin-bottom:0.6rem"><span id="mgr" class="ks-muted" style="font-size:11px"></span></div>
  <div id="content" class="ks-muted">Run a check to list available package updates.</div>`,
  `
    var mgr = '';
    async function detect(){
      try {
        var r = await act('detect_pm');
        mgr = (((r.stdout || '') + '').trim().split('\\n')[0] || '').split('/').pop();
      } catch (e) { mgr = ''; }
      el('mgr').textContent = mgr ? ('package manager: ' + mgr) : 'no supported package manager found (apt/apk/dnf/yum)';
      return mgr;
    }
    async function check(){
      if (!mgr) { el('content').innerHTML = '<p class="ks-muted">No supported package manager detected.</p>'; return; }
      el('content').innerHTML = '<div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div>';
      var r = await act('check_updates');
      var out = ((r.stdout || '') + '').trim();
      if (!out) {
        el('content').innerHTML = '<p class="ks-ok">All packages up to date.</p>';
        el('upgrade').style.display = 'none';
        return;
      }
      el('content').innerHTML = cardUnit('updates', 'Available updates', pre(out));
      el('upgrade').style.display = 'inline-flex';
    }
    async function upgrade(){
      if (!(await ask('Install ALL available package upgrades now? This can take several minutes.'))) return;
      el('upgrade').disabled = true;
      el('content').innerHTML = '<div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:36%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:32px;width:100%;margin-top:12px"></div></div>';
      try {
        var r = await act('apply_upgrades');
        el('content').innerHTML = cardUnit('upgrade-result', 'Upgrade result (exit ' + (r.exit_code != null ? r.exit_code : '?') + ')', pre(((r.stdout || '') + '') + ((r.stderr || '') + '')));
        toast('Upgrade finished', r.exit_code === 0 ? 'success' : 'error');
      } finally { el('upgrade').disabled = false; }
    }
    el('check').onclick = check;
    el('upgrade').onclick = upgrade;
    await detect();
  `,
);

const FIREWALL_VIEW = page(
  'Firewall Status',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Firewall Status</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div id="content"><div style="display:grid;gap:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:90%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:20%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:80%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:74%"></div></div></div></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div style="display:grid;gap:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:90%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:20%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%"></div></div></div>';
      var html = '';
      var sections = [['ufw', 'UFW'], ['iptables', 'iptables'], ['nft', 'nftables']];
      for (var i = 0; i < sections.length; i++) {
        try {
          var r = await act(sections[i][0]);
          var out = ((r.stdout || '') + '').trim();
          if (out) html += cardUnit(sections[i][0], sections[i][1], pre(out));
        } catch (e) { /* tool absent — skip its card */ }
      }
      el('content').innerHTML = html || '<p class="ks-muted">No firewall tooling found (ufw / iptables / nft) or no output.</p>';
    }
    el('refresh').onclick = load;
    await load();
  `,
);

const USER_REGISTRY = page(
  'Users & Groups',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Users &amp; Groups</h2>
    <div class="ks-page-header-actions"></div>
  </div>
  <div id="content"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:42%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:22%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:34px"></div><div class="ks-skeleton-bar" style="height:10px;width:26px"></div><div class="ks-skeleton-bar" style="height:10px;width:26px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:50px"></div><div class="ks-skeleton-bar" style="height:10px;width:66px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:70px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:70px"></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:24%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div></div>`,
  `
    var passwdOut = '', groupCount = '-', lastOut = '';
    try { passwdOut = ((await act('accounts_report')).stdout || '') + ''; } catch(e){}
    try { groupCount = (((await act('groups_count')).stdout || '') + '').trim() || '-'; } catch(e){}
    try { lastOut = ((await act('recent_logins')).stdout || '') + ''; } catch(e){}
    var users = passwdOut.split('\\n').filter(Boolean).map(function(line){
      var f = line.split(':');
      return { name: f[0] || '', uid: parseInt(f[2], 10), gid: parseInt(f[3], 10), home: f[5] || '', shell: f[6] || '' };
    });
    var human = users.filter(function(u){ return !isNaN(u.uid) && u.uid >= 1000 || u.uid === 0; });
    el('content').innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
      '<div class="ks-card" data-ks-key="stat-accounts"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Accounts</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-heading)">' + users.length + '</div></div>' +
      '<div class="ks-card" data-ks-key="stat-human"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Human / privileged</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-info)">' + human.length + '</div><div class="ks-mono ks-muted" style="font-size:11px">' + esc(human.map(function(u){ return u.name; }).join(', ')) + '</div></div>' +
      '<div class="ks-card" data-ks-key="stat-groups"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Groups</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-heading)">' + esc(groupCount) + '</div></div>' +
      '</div>' +
      card('Accounts (/etc/passwd)',
        '<table><thead><tr><th>User</th><th>UID</th><th>GID</th><th>Home</th><th>Shell</th></tr></thead><tbody>' +
        users.map(function(u){
          var tone = u.uid === 0 ? 'ks-warn' : (!isNaN(u.uid) && u.uid >= 1000 ? 'ks-ok' : '');
          return '<tr data-ks-key="' + esc(u.name) + '"><td class="' + tone + '">' + esc(u.name) + '</td><td class="ks-mono">' + (isNaN(u.uid) ? '-' : u.uid) + '</td>' +
            '<td class="ks-mono">' + (isNaN(u.gid) ? '-' : u.gid) + '</td><td class="ks-mono">' + esc(u.home) + '</td><td class="ks-mono">' + esc(u.shell) + '</td></tr>';
        }).join('') + '</tbody></table>') +
      card('Recent logins', lastOut.trim() ? pre(lastOut) : '<span class="ks-muted">(unavailable)</span>');
  `,
);

const SYSTEM_PROBE = page(
  'System Info',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">System Info</h2>
    <div class="ks-page-header-actions"></div>
  </div>
  <div id="content"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:28%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:32%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:52%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:36%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:44%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:48%"></div></div></div><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:80px"></div><div class="ks-skeleton-bar" style="height:10px;width:140px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:74px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:86px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:60px"></div><div class="ks-skeleton-bar" style="height:10px;width:160px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:96px"></div></div></div></div></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:32%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:52%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:28%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:36%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:44%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:48%"></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:90%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%"></div></div>';
      var r = null;
      try { r = await act('sys_probe'); } catch(e){ r = null; }
      var info = {};
      (((r && r.stdout) || '') + '').split('\\n').forEach(function(line){
        var m = line.match(/^([a-z_]+)\\s(.*)$/);
        if (m) info[m[1]] = m[2];
      });
      if (!info.kernel) { el('content').innerHTML = '<p class="ks-muted">System probe unavailable on this instance.</p>'; return; }
      el('content').innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
        '<div class="ks-card" data-ks-key="os"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">OS</div><div style="font-weight:600;color:var(--ks-heading)">' + esc(info.os || '-') + '</div></div>' +
        '<div class="ks-card" data-ks-key="kernel"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Kernel</div><div class="ks-mono" style="font-weight:600;color:var(--ks-heading)">' + esc(info.kernel) + '</div></div>' +
        '<div class="ks-card" data-ks-key="arch"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Architecture</div><div class="ks-mono" style="font-weight:600;color:var(--ks-heading)">' + esc(info.arch || '-') + '</div></div>' +
        '<div class="ks-card" data-ks-key="virt"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Virtualization</div><div class="ks-mono" style="font-weight:600;color:var(--ks-heading)">' + esc(info.virt || '-') + '</div></div>' +
        '</div>' +
        cardUnit('hardware', 'Hardware', '<table>' +
          '<tr><th style="width:150px">CPU model</th><td>' + esc((info.cpu || '-').trim()) + '</td></tr>' +
          '<tr><th>CPU cores</th><td>' + esc(info.cores || '-') + '</td></tr>' +
          '<tr><th>Memory total</th><td>' + esc(info.mem || '-') + '</td></tr>' +
          '</table>') +
        cardUnit('load', 'Load & uptime', '<table>' +
          '<tr><th style="width:150px">Uptime</th><td>' + esc(((info.uptime || '-').replace(/\\s+/g, ' '))) + '</td></tr>' +
          '<tr><th>Load average</th><td class="ks-mono">' + esc(info.load || '-') + '</td></tr>' +
          '</table>');
    }
    await load();
  `,
);

// ---------------------------------------------------------------------------
// MINECRAFT TOOLING — starter pages for Minecraft operators.
// Each page is pure KSPageSDK (shell|read_file|write_file|list_files with
// open_args≤4 + {{args}} + validActionArg) + blocks/html + ThemePreview.
// No new backend — all actions hit edge/pageaction readSession inside container.
// ---------------------------------------------------------------------------

const MC_PROPERTIES = page(
  'Server Properties',
  `<div class="ks-page-header">
  <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Server Properties</h2>
  <div class="ks-page-header-actions">
    <button class="ks-btn-header ks-icon-btn" id="btn-reload" title="Reload from disk" aria-label="Reload"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    <button class="ks-btn ks-btn-sm" id="btn-save" type="button">Save all</button>
  </div>
</div>
<p class="ks-muted" style="font-size:12px;margin:0 0 10px">Each <span class="ks-mono">server.properties</span> key is its own card with the right editor (text, number, dropdown). The file is auto-detected (<span class="ks-mono">server.properties</span>, <span class="ks-mono">/mc/server.properties</span>) — or set the path below. Changes require a server restart.</p>
<div class="ks-row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
  <input id="ppath" class="ks-input ks-mono" placeholder="/mc/server.properties" style="flex:1;min-width:180px;max-width:320px;font-size:12px" aria-label="server.properties path" />
  <button class="ks-btn ks-btn-sm" id="btn-applypath" type="button" title="Load from this path">Use path</button>
</div>
<div class="ks-row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
  <input id="q" class="ks-input ks-search-input" placeholder="filter keys…" style="flex:1;min-width:160px;max-width:280px" />
  <select id="cat" style="max-width:220px" aria-label="Category filter"></select>
  <label class="ks-muted" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;text-transform:none;letter-spacing:normal;margin:0"><input type="checkbox" id="onlymod" style="width:auto" /> modified only</label>
  <span id="count" class="ks-muted" style="font-size:11px;margin-left:auto"></span>
</div>
<div id="status" class="ks-muted" style="font-size:12px;margin-bottom:10px">Loading…</div>
<div id="root"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:52%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:44%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div></div></div>
<details style="margin-top:12px"><summary class="ks-muted" style="font-size:12px;cursor:pointer">Raw file preview</summary><pre id="raw" class="ks-mono" style="font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:8px;padding:10px;max-height:300px;overflow:auto"></pre></details>`,
  `(function () {
  'use strict';
  var sdk = null;
  var PATHS = ['server.properties', '/mc/server.properties', 'mc/server.properties'];
  var loadSeq = 0;
  var ATTEMPT_MS = 8000;
  var LOAD_WATCHDOG_MS = 15000;
  var STORE_KEY = 'mcprops:path';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==='function')return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}
  function say(m,t){try{if(window.KSPageSDK&&typeof window.KSPageSDK.toast==='function')window.KSPageSDK.toast(m,t||'info');}catch(e){}}
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; rej(new Error('timed out after ' + Math.round(ms / 1000) + 's')); } }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } },
           function (e) { if (!done) { done = true; clearTimeout(t); rej(e); } });
    });
  }
  function isMissingErr(m) { return /404|not found|no such file|ENOENT|does not exist|missing/i.test(String(m || '')); }
  function isGateErr(m) { return /page not enabled/i.test(String(m || '')); }
  function storeGet() {
    try { if (sdk && sdk.storage && sdk.storage.get) return sdk.storage.get(STORE_KEY).catch(function () { return null; }); } catch (e) {}
    return Promise.resolve(null);
  }
  function storeSet(v) {
    try { if (sdk && sdk.storage && sdk.storage.set) sdk.storage.set(STORE_KEY, String(v)).catch(function () {}); } catch (e) {}
  }

  var SCHEMA = [
    { k: 'motd', label: 'MOTD', desc: 'Message of the day shown in the server list.', t: 'text', def: 'A Minecraft Server', cat: 'Server' },
    { k: 'server-port', label: 'Server port', desc: 'TCP/UDP port clients connect to.', t: 'int', def: '25565', min: 1, max: 65535, cat: 'Network' },
    { k: 'server-ip', label: 'Server IP', desc: 'Interface to bind to. Empty = all interfaces.', t: 'text', def: '', cat: 'Network', ph: '(empty = all interfaces)' },
    { k: 'max-players', label: 'Max players', desc: 'Maximum simultaneous players.', t: 'int', def: '20', min: 1, max: 100000, cat: 'Server' },
    { k: 'online-mode', label: 'Online mode', desc: 'Verify players with Mojang auth. Disable only for offline / proxy setups.', t: 'bool', def: 'true', cat: 'Server' },
    { k: 'white-list', label: 'Whitelist', desc: 'Only whitelisted players may join.', t: 'bool', def: 'false', cat: 'Server' },
    { k: 'enforce-whitelist', label: 'Enforce whitelist', desc: 'Kick non-whitelisted players when the whitelist is reloaded.', t: 'bool', def: 'false', cat: 'Server' },
    { k: 'enforce-secure-profile', label: 'Enforce secure profile', desc: 'Require signed chat from clients (1.19+).', t: 'bool', def: 'true', cat: 'Server' },
    { k: 'hide-online-players', label: 'Hide online players', desc: 'Hide the player list from server-list queries.', t: 'bool', def: 'false', cat: 'Server' },
    { k: 'prevent-proxy-connections', label: 'Prevent proxy connections', desc: 'Kick players using a proxy/VPN (false by default).', t: 'bool', def: 'false', cat: 'Server' },
    { k: 'op-permission-level', label: 'OP permission level', desc: 'Default permission level for /op (1-4).', t: 'int', def: '4', min: 1, max: 4, cat: 'Server' },
    { k: 'function-permission-level', label: 'Function permission level', desc: 'Permission level for function execution (1-4).', t: 'int', def: '2', min: 1, max: 4, cat: 'Server' },
    { k: 'player-idle-timeout', label: 'Player idle timeout', desc: 'Minutes before idle players are kicked. 0 = disabled.', t: 'int', def: '0', min: 0, max: 100000, cat: 'Server' },
    { k: 'broadcast-console-to-ops', label: 'Broadcast console to ops', desc: 'Send console command output to online ops.', t: 'bool', def: 'true', cat: 'Server' },
    { k: 'difficulty', label: 'Difficulty', desc: 'Game difficulty.', t: 'enum', def: 'easy', opts: ['peaceful','easy','normal','hard'], cat: 'Gameplay' },
    { k: 'gamemode', label: 'Gamemode', desc: 'Default gamemode for new players.', t: 'enum', def: 'survival', opts: ['survival','creative','adventure','spectator'], cat: 'Gameplay' },
    { k: 'hardcore', label: 'Hardcore', desc: 'Hardcore mode (ban on death, hardest difficulty).', t: 'bool', def: 'false', cat: 'Gameplay' },
    { k: 'force-gamemode', label: 'Force gamemode', desc: 'Force players into the default gamemode on join.', t: 'bool', def: 'false', cat: 'Gameplay' },
    { k: 'pvp', label: 'PvP', desc: 'Allow player-versus-player damage.', t: 'bool', def: 'true', cat: 'Gameplay' },
    { k: 'allow-flight', label: 'Allow flight', desc: 'Allow cheats that enable flying (e.g. fly mods).', t: 'bool', def: 'false', cat: 'Gameplay' },
    { k: 'enable-command-block', label: 'Command blocks', desc: 'Enable command blocks on the server.', t: 'bool', def: 'false', cat: 'Gameplay' },
    { k: 'level-name', label: 'Level name', desc: 'World folder name.', t: 'text', def: 'world', cat: 'World' },
    { k: 'level-seed', label: 'Level seed', desc: 'World generation seed. Empty = random.', t: 'text', def: '', cat: 'World', ph: '(empty = random)' },
    { k: 'level-type', label: 'Level type', desc: 'World preset / generator type.', t: 'enum', def: 'minecraft:normal', opts: ['minecraft:normal','minecraft:flat','minecraft:large_biomes','minecraft:amplified','minecraft:single_biome_surface','default','flat','largeBiomes','amplified'], cat: 'World' },
    { k: 'generate-structures', label: 'Generate structures', desc: 'Generate villages, temples, etc.', t: 'bool', def: 'true', cat: 'World' },
    { k: 'generator-settings', label: 'Generator settings', desc: 'Superflat preset JSON (flat worlds). Usually empty.', t: 'text', def: '', cat: 'World', ph: '(empty)' },
    { k: 'allow-nether', label: 'Allow Nether', desc: 'Enable the Nether dimension.', t: 'bool', def: 'true', cat: 'World' },
    { k: 'max-world-size', label: 'Max world size', desc: 'World border diameter in blocks (1-29999984).', t: 'int', def: '29999984', min: 1, max: 29999984, cat: 'World' },
    { k: 'spawn-protection', label: 'Spawn protection', desc: 'Radius (blocks) around spawn that non-ops cannot edit. 0 = disabled.', t: 'int', def: '16', min: 0, max: 100000, cat: 'World' },
    { k: 'spawn-animals', label: 'Spawn animals', desc: 'Spawn passive animals.', t: 'bool', def: 'true', cat: 'Mobs' },
    { k: 'spawn-monsters', label: 'Spawn monsters', desc: 'Spawn hostile mobs.', t: 'bool', def: 'true', cat: 'Mobs' },
    { k: 'spawn-npcs', label: 'Spawn villagers', desc: 'Spawn villagers / NPCs.', t: 'bool', def: 'true', cat: 'Mobs' },
    { k: 'view-distance', label: 'View distance', desc: 'Server-side view distance in chunks (2-32).', t: 'int', def: '10', min: 2, max: 32, cat: 'Performance' },
    { k: 'simulation-distance', label: 'Simulation distance', desc: 'Tick distance in chunks (3-32).', t: 'int', def: '10', min: 3, max: 32, cat: 'Performance' },
    { k: 'entity-broadcast-range-percentage', label: 'Entity broadcast %', desc: 'How far entities are visible, in percent (10-1000).', t: 'int', def: '100', min: 10, max: 1000, cat: 'Performance' },
    { k: 'max-tick-time', label: 'Max tick time (ms)', desc: 'Watchdog: kill the server if one tick exceeds this. -1 disables.', t: 'int', def: '60000', min: -1, max: 100000000, cat: 'Performance' },
    { k: 'network-compression-threshold', label: 'Compression threshold', desc: 'Compress packets above this size (bytes). -1 disables.', t: 'int', def: '256', min: -1, max: 1000000, cat: 'Performance' },
    { k: 'max-chained-neighbor-updates', label: 'Max chained neighbor updates', desc: 'Cap for chained redstone neighbor updates.', t: 'int', def: '1000000', min: 0, max: 1000000000, cat: 'Performance' },
    { k: 'sync-chunk-writes', label: 'Sync chunk writes', desc: 'Synchronous chunk I/O (safer, slower when enabled).', t: 'bool', def: 'true', cat: 'Performance' },
    { k: 'use-native-transport', label: 'Native transport', desc: 'Use OS-optimised packet transport (epoll/kqueue on Linux).', t: 'bool', def: 'true', cat: 'Performance' },
    { k: 'enable-query', label: 'Enable query', desc: 'Respond to GameSpy4 query requests.', t: 'bool', def: 'false', cat: 'Remote' },
    { k: 'query.port', label: 'Query port', desc: 'Port for the GameSpy4 query listener.', t: 'int', def: '25565', min: 1, max: 65535, cat: 'Remote' },
    { k: 'enable-status', label: 'Enable status', desc: 'Show this server in server lists / status requests.', t: 'bool', def: 'true', cat: 'Remote' },
    { k: 'enable-rcon', label: 'Enable RCON', desc: 'Allow remote-console administration.', t: 'bool', def: 'false', cat: 'Remote' },
    { k: 'rcon.port', label: 'RCON port', desc: 'Port for the RCON listener.', t: 'int', def: '25575', min: 1, max: 65535, cat: 'Remote' },
    { k: 'rcon.password', label: 'RCON password', desc: 'Password for RCON. Empty = unset (RCON will not work).', t: 'password', def: '', cat: 'Remote', ph: '(empty = unset)' },
    { k: 'broadcast-rcon-to-ops', label: 'Broadcast RCON to ops', desc: 'Send RCON command output to online ops.', t: 'bool', def: 'true', cat: 'Remote' },
    { k: 'rate-limit', label: 'Rate limit', desc: 'Max packets per second per client. 0 = disabled.', t: 'int', def: '0', min: 0, max: 1000000, cat: 'Network' },
    { k: 'require-resource-pack', label: 'Require resource pack', desc: 'Kick players who decline the server resource pack.', t: 'bool', def: 'false', cat: 'Packs' },
    { k: 'resource-pack', label: 'Resource pack URL', desc: 'URL players download the pack from. Empty = none.', t: 'text', def: '', cat: 'Packs', ph: 'https://… (empty = none)' },
    { k: 'resource-pack-sha1', label: 'Resource pack SHA1', desc: 'Expected SHA-1 of the pack file. Empty = skip check.', t: 'text', def: '', cat: 'Packs', ph: '(empty = skip check)' },
    { k: 'resource-pack-prompt', label: 'Resource pack prompt', desc: 'Custom prompt shown with the pack request.', t: 'text', def: '', cat: 'Packs', ph: '(empty)' },
    { k: 'initial-enabled-packs', label: 'Initially enabled packs', desc: 'Comma-separated datapack IDs enabled at world creation.', t: 'text', def: 'vanilla', cat: 'Packs' },
    { k: 'initial-disabled-packs', label: 'Initially disabled packs', desc: 'Comma-separated datapack IDs left disabled.', t: 'text', def: '', cat: 'Packs', ph: '(empty)' },
    { k: 'text-filtering-config', label: 'Text filtering config', desc: 'External chat-filter config. Empty = disabled.', t: 'text', def: '', cat: 'Advanced', ph: '(empty)' },
    { k: 'enable-jmx-monitoring', label: 'JMX monitoring', desc: 'Expose JVM metrics over JMX.', t: 'bool', def: 'false', cat: 'Advanced' },
    { k: 'debug', label: 'Debug', desc: 'Vanilla debug flag. Leave false.', t: 'bool', def: 'false', cat: 'Advanced' },
    { k: 'log-ips', label: 'Log IPs', desc: 'Include player IPs in the server log.', t: 'bool', def: 'true', cat: 'Advanced' }
  ];

  var byKey = {};
  SCHEMA.forEach(function (f) { byKey[f.k] = f; });

  var state = {
    loading: true, saving: false, error: '', gate: false, missing: false,
    activePath: '', trying: '',
    values: {}, orig: {}, rawLines: [], unknownOrder: [],
    q: '', cat: 'All', onlymod: false
  };

  function base() { return '/api/instances/' + sdk.instance.id; }

  function parseProps(text) {
    var map = {}, lines = [], seen = {};
    String(text == null ? '' : text).split(/\\r?\\n/).forEach(function (ln) {
      var m = ln.match(/^\\s*([^#\\s][^=\\s]*)\\s*=\\s*(.*?)\\s*$/);
      if (m) {
        map[m[1]] = m[2];
        lines.push({ t: 'kv', k: m[1], v: m[2] });
        if (!seen[m[1]]) { seen[m[1]] = true; }
      } else if (/^\\s*$/.test(ln)) {
        lines.push({ t: 'blank', raw: ln });
      } else {
        lines.push({ t: 'comment', raw: ln });
      }
    });
    return { map: map, lines: lines };
  }

  function readText(r) {
    if (typeof r === 'string') return r;
    if (r && typeof r.content === 'string') return r.content;
    if (r && typeof r.data === 'string') return r.data;
    if (r && typeof r.stdout === 'string' && r.stdout) return r.stdout;
    if (r && typeof r.data !== 'undefined' && r.data !== null) { try { return JSON.stringify(r.data); } catch (e) { return String(r.data); } }
    return '';
  }

  function readOne(path) {
    return withTimeout(
      sdk.fetchPanel(base() + '/files/read?path=' + encodeURIComponent(path)).then(readText),
      ATTEMPT_MS
    );
  }

  function orderedPaths(preferred) {
    var out = [], seen = {};
    [preferred].concat(PATHS).forEach(function (p) {
      if (p && !seen[p]) { seen[p] = true; out.push(p); }
    });
    return out;
  }

  function load(onlyPath) {
    var seq = ++loadSeq;
    state.loading = true; state.error = ''; state.gate = false; state.missing = false; state.trying = ''; render();
    setTimeout(function () {
      if (loadSeq === seq && state.loading) {
        state.loading = false;
        state.error = 'Load timed out — the instance may be stopped or the edge is unreachable. Press Retry.';
        render();
      }
    }, LOAD_WATCHDOG_MS);
    storeGet().then(function (stored) {
      if (loadSeq !== seq) return;
      var paths = onlyPath ? [onlyPath] : orderedPaths(stored);
      var missingCount = 0;
      function attempt(i) {
        if (loadSeq !== seq) return;
        if (i >= paths.length) {
          if (missingCount === paths.length) {
            var target = onlyPath || stored || PATHS[1];
            state.activePath = target; storeSet(target);
            applyFile('', true, target);
          } else {
            state.loading = false;
            state.error = state.lastError || 'Could not read server.properties from any known location.';
            render();
          }
          return;
        }
        var p = paths[i];
        state.trying = p; render();
        readOne(p).then(function (text) {
          if (loadSeq !== seq) return;
          state.activePath = p; storeSet(p);
          applyFile(text == null ? '' : String(text), false, p);
        }, function (e) {
          if (loadSeq !== seq) return;
          var msg = (e && e.message) || String(e);
          if (isGateErr(msg)) {
            state.loading = false; state.gate = true;
            state.error = msg;
            render();
            return;
          }
          if (isMissingErr(msg)) { missingCount++; }
          else { state.lastError = msg; }
          attempt(i + 1);
        });
      }
      attempt(0);
    });
  }

  function applyFile(text, missing, path) {
    var p = parseProps(text);
    state.rawLines = p.lines; state.missing = missing; state.activePath = path || state.activePath;
    state.values = {}; state.orig = {}; state.unknownOrder = [];
    SCHEMA.forEach(function (f) {
      var v = (p.map[f.k] !== undefined) ? p.map[f.k] : f.def;
      state.values[f.k] = v; state.orig[f.k] = v;
    });
    Object.keys(p.map).forEach(function (k) {
      if (!byKey[k]) { state.values[k] = p.map[k]; state.orig[k] = p.map[k]; state.unknownOrder.push(k); }
    });
    state.loading = false; state.error = ''; state.gate = false; render();
  }

  function isMod(k) { return String(state.values[k] == null ? '' : state.values[k]) !== String(state.orig[k] == null ? '' : state.orig[k]); }
  function modCount() { var n = 0; Object.keys(state.values).forEach(function (k) { if (isMod(k)) n++; }); return n; }

  function cats() {
    var seen = {}, out = ['All'];
    SCHEMA.forEach(function (f) { if (!seen[f.cat]) { seen[f.cat] = true; out.push(f.cat); } });
    if (state.unknownOrder.length) out.push('Custom');
    return out;
  }

  function visibleFields() {
    var q = state.q.trim().toLowerCase();
    return SCHEMA.filter(function (f) {
      if (state.cat !== 'All' && f.cat !== state.cat) return false;
      if (state.onlymod && !isMod(f.k)) return false;
      if (q && (f.k.toLowerCase().indexOf(q) < 0 && String(f.label).toLowerCase().indexOf(q) < 0 && String(f.desc).toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
  }

  function widget(f, v) {
    var val = esc(v);
    if (f.t === 'bool') {
      return '<select data-field="' + esc(f.k) + '" aria-label="' + esc(f.label) + '">'
        + '<option value="true"' + (String(v) === 'true' ? ' selected' : '') + '>true</option>'
        + '<option value="false"' + (String(v) === 'false' ? ' selected' : '') + '>false</option></select>';
    }
    if (f.t === 'enum') {
      var opts = f.opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('');
      if (f.opts.indexOf(String(v)) < 0) opts = '<option value="' + val + '" selected>' + val + ' (custom)</option>' + opts;
      return '<select data-field="' + esc(f.k) + '" aria-label="' + esc(f.label) + '">' + opts + '</select>';
    }
    if (f.t === 'int') {
      return '<input data-field="' + esc(f.k) + '" type="number" value="' + val + '"'
        + (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '')
        + ' aria-label="' + esc(f.label) + '" />';
    }
    if (f.t === 'password') {
      return '<input data-field="' + esc(f.k) + '" type="password" value="' + val + '" placeholder="' + esc(f.ph || '') + '" autocomplete="new-password" aria-label="' + esc(f.label) + '" />';
    }
    return '<input data-field="' + esc(f.k) + '" type="text" value="' + val + '" placeholder="' + esc(f.ph || '') + '" aria-label="' + esc(f.label) + '" />';
  }

  function cardFor(f) {
    var v = state.values[f.k];
    var mod = isMod(f.k);
    var kind = f.t === 'bool' ? 'toggle · dropdown' : (f.t === 'enum' ? 'dropdown' : (f.t === 'int' ? 'number' : (f.t === 'password' ? 'password' : 'text')));
    return '<div class="ks-card" data-ks-key="' + esc(f.k) + '" style="display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:13px;font-weight:600;color:var(--ks-heading)">' + esc(f.label) + '</span>'
      + (mod ? '<span class="ks-badge" style="color:var(--ks-warn);border-color:var(--ks-warn-line);background:var(--ks-warn-wash)">modified</span>' : '')
      + '<span style="flex:1"></span>'
      + '<button type="button" class="ks-btn-header ks-icon-btn" data-reset="' + esc(f.k) + '" title="Reset to ' + (String(state.orig[f.k]) === '' ? 'empty' : esc(state.orig[f.k])) + '" aria-label="Reset ' + esc(f.k) + '" style="min-height:26px;min-width:26px;padding:4px 8px;font-size:11px">Reset</button>'
      + '</div>'
      + '<code class="ks-mono ks-muted" style="font-size:11px">' + esc(f.k) + '</code>'
      + '<p class="ks-muted" style="font-size:12px;margin:0">' + esc(f.desc) + '</p>'
      + widget(f, v)
      + '<div style="display:flex;align-items:center;gap:8px;font-size:11px"><span class="ks-muted">' + esc(kind) + '</span><span style="flex:1"></span><span class="ks-muted">default: <span class="ks-mono">' + esc(String(f.def) === '' ? '(empty)' : f.def) + '</span></span></div>'
      + '</div>';
  }

  function unknownCard(k) {
    var v = state.values[k];
    var mod = isMod(k);
    return '<div class="ks-card" data-ks-key="custom:' + esc(k) + '" style="display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:13px;font-weight:600;color:var(--ks-heading)">Custom key</span>'
      + (mod ? '<span class="ks-badge" style="color:var(--ks-warn);border-color:var(--ks-warn-line);background:var(--ks-warn-wash)">modified</span>' : '')
      + '<span style="flex:1"></span>'
      + '<button type="button" class="ks-btn-header ks-icon-btn" data-reset="' + esc(k) + '" title="Reset" aria-label="Reset ' + esc(k) + '" style="min-height:26px;min-width:26px;padding:4px 8px;font-size:11px">Reset</button>'
      + '</div>'
      + '<code class="ks-mono ks-muted" style="font-size:11px;word-break:break-all">' + esc(k) + '</code>'
      + '<input data-field="' + esc(k) + '" type="text" value="' + esc(v) + '" aria-label="' + esc(k) + '" />'
      + '<div style="font-size:11px"><span class="ks-muted">text · not in known schema, preserved on save</span></div>'
      + '</div>';
  }

  function skeleton() {
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += '<div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div>';
    }
    return out;
  }

  function syncPathInput() {
    var pp = document.getElementById('ppath');
    if (!pp) return;
    try {
      if (document.activeElement === pp) return;
    } catch (e) {}
    var v = state.activePath || state.trying || '';
    if (pp.value !== v && v) pp.value = v;
  }

  function render() {
    var sel = document.getElementById('cat');
    if (sel && sel.options.length === 0) {
      sel.innerHTML = cats().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
      sel.value = state.cat;
    }
    var st = document.getElementById('status');
    var root = document.getElementById('root');
    var raw = document.getElementById('raw');
    if (!root) return;
    if (state.loading) {
      if (st) st.textContent = 'Loading ' + (state.trying || 'server.properties') + '…';
      root.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">' + skeleton() + '</div>';
      if (raw) raw.textContent = '';
      syncPathInput();
      return;
    }
    if (state.error || state.gate) {
      if (st) st.innerHTML = '<span style="color:var(--ks-bad)">Failed to load: ' + esc(state.error) + '</span>';
      var hint = state.gate
        ? 'This page reads through the Files API, which requires the <span class="ks-mono">Files</span> page (slug <span class="ks-mono">files</span>) to be enabled on this instance template. Enable it, then press Retry.'
        : esc(state.error) + ' — check the instance is running and the edge is online, verify the path above, then press Retry.';
      root.innerHTML = '<div class="ks-card" data-ks-key="load-error" style="border-color:var(--ks-bad-line)"><p style="color:var(--ks-bad);font-size:13px;margin:0 0 6px;font-weight:600">Could not load ' + esc(state.trying || 'server.properties') + '</p>'
        + '<p class="ks-muted" style="font-size:12px;margin:0 0 10px">' + hint + '</p>'
        + '<button type="button" class="ks-btn ks-btn-sm" data-retry>Retry</button></div>';
      syncPathInput();
      Array.prototype.forEach.call(root.querySelectorAll('[data-retry]'), function (b) {
        b.addEventListener('click', function () { load(); });
      });
      return;
    }
    var fields = visibleFields();
    var unknowns = state.unknownOrder.filter(function (k) {
      if (state.cat !== 'All' && state.cat !== 'Custom') return false;
      if (state.onlymod && !isMod(k)) return false;
      var q = state.q.trim().toLowerCase();
      if (q && k.toLowerCase().indexOf(q) < 0 && String(state.values[k]).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var n = modCount();
    var total = SCHEMA.length + state.unknownOrder.length;
    if (st) {
      st.innerHTML = '<span class="ks-mono">' + esc(state.activePath || 'server.properties') + '</span>'
        + (state.missing ? ' · <span style="color:var(--ks-warn)">not found — showing defaults. Saving will create it here.</span>' : '')
        + ' · ' + esc(String(fields.length + unknowns.length)) + ' of ' + esc(String(total)) + ' shown'
        + (n ? ' · <span style="color:var(--ks-warn)">' + n + ' modified</span>' : ' · no changes')
        + (state.saving ? ' · saving…' : '');
    }
    syncPathInput();
    var cnt = document.getElementById('count');
    if (cnt) cnt.textContent = n ? n + ' unsaved change' + (n === 1 ? '' : 's') : 'no unsaved changes';
    var saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.disabled = state.saving || n === 0;
    var html = '';
    if (!fields.length && !unknowns.length) {
      html = '<div class="ks-card"><p class="ks-muted" style="font-size:13px;margin:0">No keys match this filter.</p></div>';
    } else {
      html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">'
        + fields.map(cardFor).join('')
        + unknowns.map(unknownCard).join('')
        + '</div>';
    }
    root.innerHTML = html;
    if (raw) raw.textContent = buildText();
    Array.prototype.forEach.call(root.querySelectorAll('[data-reset]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-reset');
        state.values[k] = state.orig[k];
        render();
      });
    });
  }

  function buildText() {
    var seen = {}, out = [];
    state.rawLines.forEach(function (ln) {
      if (ln.t === 'kv') {
        if (state.values[ln.k] !== undefined) { out.push(ln.k + '=' + state.values[ln.k]); seen[ln.k] = true; }
        else { out.push(ln.k + '=' + ln.v); seen[ln.k] = true; }
      } else if (ln.t === 'blank') { out.push(''); }
      else { out.push(ln.raw); }
    });
    SCHEMA.forEach(function (f) {
      if (!seen[f.k]) { out.push(f.k + '=' + state.values[f.k]); seen[f.k] = true; }
    });
    state.unknownOrder.forEach(function (k) {
      if (!seen[k]) { out.push(k + '=' + state.values[k]); seen[k] = true; }
    });
    return out.join('\\n') + '\\n';
  }

  function save() {
    var n = modCount();
    if (!n || state.saving) return;
    var target = state.activePath || PATHS[0];
    state.saving = true; render();
    var text = buildText();
    sdk.fetchPanel(base() + '/files?op=write&path=' + encodeURIComponent(target), {
      method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' }
    }).then(function () {
      state.saving = false;
      Object.keys(state.values).forEach(function (k) { state.orig[k] = state.values[k]; });
      state.missing = false; state.activePath = target; storeSet(target);
      var p = parseProps(text); state.rawLines = p.lines;
      render(); say('Saved ' + target + ' (' + n + ' change' + (n === 1 ? '' : 's') + ') — restart the server to apply.', 'success');
    }).catch(function (e) {
      state.saving = false; render();
      say((e && e.message) || 'Save failed', 'error');
    });
  }

  function wire() {
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-field')) {
        var k = t.getAttribute('data-field');
        if (state.values[k] !== undefined || byKey[k] || state.unknownOrder.indexOf(k) >= 0) {
          state.values[k] = t.value;
          var card = t.closest ? t.closest('[data-ks-key]') : null;
          var badge = card ? card.querySelector('.ks-badge') : null;
          var should = isMod(k);
          if (should && !badge && card) {
            var head = card.firstElementChild;
            if (head) {
              var s = document.createElement('span');
              s.className = 'ks-badge';
              s.style.cssText = 'color:var(--ks-warn);border-color:var(--ks-warn-line);background:var(--ks-warn-wash)';
              s.textContent = 'modified';
              head.insertBefore(s, head.children[1] || null);
            }
          } else if (!should && badge) { badge.remove(); }
          var cnt = document.getElementById('count');
          var nn = modCount();
          if (cnt) cnt.textContent = nn ? nn + ' unsaved change' + (nn === 1 ? '' : 's') : 'no unsaved changes';
          var saveBtn = document.getElementById('btn-save');
          if (saveBtn) saveBtn.disabled = state.saving || nn === 0;
          var st = document.getElementById('status');
          if (st && !state.loading && !state.error && !state.gate) {
            var total = SCHEMA.length + state.unknownOrder.length;
            st.innerHTML = '<span class="ks-mono">' + esc(state.activePath || 'server.properties') + '</span>'
              + (state.missing ? ' · <span style="color:var(--ks-warn)">not found — showing defaults.</span>' : '')
              + ' · ' + esc(String(total)) + ' keys'
              + (nn ? ' · <span style="color:var(--ks-warn)">' + nn + ' modified</span>' : ' · no changes');
          }
          var raw = document.getElementById('raw');
          if (raw) raw.textContent = buildText();
        }
      }
      if (t && t.id === 'q') { state.q = t.value; render(); var q2 = document.getElementById('q'); if (q2) { q2.focus(); try { var l = q2.value.length; q2.setSelectionRange(l, l); } catch (e) {} } }
    }, true);
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-field')) {
        var k = t.getAttribute('data-field');
        state.values[k] = t.value;
        render();
      }
      if (t && t.id === 'cat') { state.cat = t.value; render(); }
      if (t && t.id === 'onlymod') { state.onlymod = !!t.checked; render(); }
    }, true);
    var rb = document.getElementById('btn-reload');
    if (rb) rb.addEventListener('click', function () { load(); });
    var ap = document.getElementById('btn-applypath');
    if (ap) ap.addEventListener('click', function () {
      var pp = document.getElementById('ppath');
      var v = pp ? String(pp.value || '').trim() : '';
      if (!v) { say('Enter a file path first (e.g. /mc/server.properties).', 'error'); return; }
      storeSet(v);
      load(v);
    });
    var sb = document.getElementById('btn-save');
    if (sb) sb.addEventListener('click', function () {
      if (modCount() === 0) return;
      var target = state.activePath || PATHS[0];
      ask('Save ' + target + ' with ' + modCount() + ' change(s)? The server must be restarted to apply them.').then(function (ok) { if (ok) save(); });
    });
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === 's') { ev.preventDefault(); if (modCount() > 0 && !state.saving) save(); return; }
      if (ev.key === 'Enter' && ev.target && ev.target.id === 'ppath') {
        ev.preventDefault();
        var b = document.getElementById('btn-applypath');
        if (b) b.click();
      }
    });
  }

  function start(s) { sdk = s; wire(); load(); }
  function sdkWatchdog() {
    setTimeout(function () {
      if (sdk) return;
      var root = document.getElementById('root');
      var st = document.getElementById('status');
      if (st) st.textContent = 'Waiting for the panel bridge…';
      if (root && root.innerHTML.indexOf('ks-skeleton') !== -1) {
        root.innerHTML = '<div class="ks-card" data-ks-key="sdk-wait" style="border-color:var(--ks-warn-line)"><p style="color:var(--ks-warn);font-size:13px;margin:0 0 6px;font-weight:600">Waiting for the panel bridge…</p><p class="ks-muted" style="font-size:12px;margin:0">The page SDK is not available yet. Refresh the instance page — if this is the Studio preview, bind a test instance to exercise load/save. Your edits are safe: nothing was changed on disk.</p></div>';
      }
    }, 6000);
  }
  sdkWatchdog();
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
`
);

const MC_PLAYERS = page(
  'Player Manager',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Player Manager</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div class="ks-row" style="margin-bottom:0.6rem;gap:8px;flex-wrap:wrap">
    <input id="playerInput" class="ks-input ks-search-input" placeholder="player name" style="flex:1;min-width:140px;max-width:200px" />
    <button class="ks-btn ks-btn-sm" id="btnWhitelist" title="whitelist add"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Whitelist Add</button>
    <button class="ks-btn ks-btn-sm" id="btnOp" title="op"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M12 2l3 7h7l-5.5 4 2 7-6-5-6 5 2-7-5.5-4z"/></svg> Op</button>
    <button class="ks-btn ks-btn-sm ks-btn-danger" id="btnBan" title="ban"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Ban</button>
  </div>
  <div id="content"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:42%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:22%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:34px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:60px"></div></div><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div></div><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:72%;margin-bottom:8px"></div></div></div>
  <div id="playerdata" style="margin-top:12px"><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1fr 100px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div></div><div style="display:grid;grid-template-columns:1fr 100px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:82px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div></div></div></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:42%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:28%;margin-bottom:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:22%;margin-bottom:8px"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:34px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:60px"></div></div><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div></div></div>';
      var w = '', o = '', b = '', pd = '';
      try { var r = await act('read_whitelist'); w = (r.data || r.stdout || '') + ''; } catch(e){ w = 'whitelist.json: ' + e.message; }
      try { var r2 = await act('read_ops'); o = (r2.data || r2.stdout || '') + ''; } catch(e){ o = 'ops.json: ' + e.message; }
      try { var r3 = await act('read_banned'); b = (r3.data || r3.stdout || '') + ''; } catch(e){ b = 'banned-players.json: ' + e.message; }
      try { var r4 = await act('list_playerdata'); pd = JSON.stringify(r4.data || r4.stdout || '', null, 2); } catch(e){ pd = 'world/playerdata: ' + e.message; }
      function tryJson(s){ try{ var j=JSON.parse(s); return Array.isArray(j)? j : []; } catch{ return s ? s.trim().split('\n').filter(Boolean) : []; } }
      var wl = tryJson(w);
      var ops = tryJson(o);
      var banned = tryJson(b);
      el('content').innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
        '<div class="ks-card" data-ks-key="stat-whitelist"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Whitelisted</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-heading)">' + wl.length + '</div><div class="ks-muted" style="font-size:11px">whitelist.json</div></div>' +
        '<div class="ks-card" data-ks-key="stat-ops"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Operators</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-info)">' + ops.length + '</div><div class="ks-muted" style="font-size:11px">ops.json</div></div>' +
        '<div class="ks-card" data-ks-key="stat-banned"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Banned</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-bad)">' + banned.length + '</div><div class="ks-muted" style="font-size:11px">banned-players.json</div></div>' +
        '</div>' +
        cardUnit('whitelist','Whitelist (whitelist.json)', wl.length ? '<table><thead><tr><th>Player</th><th>UUID</th></tr></thead><tbody>' + wl.map(function(x){ var n = (x && x.name) || String(x); var u = (x && x.uuid) || ''; return '<tr data-ks-key="'+esc(n)+'"><td>' + esc(n) + '</td><td class="ks-mono" style="font-size:11px">' + esc(u || String(x).slice(0,80)) + '</td></tr>'; }).join('') + '</tbody></table>' + pre(w) : pre(w)) +
        cardUnit('ops','Ops (ops.json)', ops.length ? '<table><thead><tr><th>Player</th><th>Level</th></tr></thead><tbody>' + ops.map(function(x){ return '<tr data-ks-key="'+esc(String((x&&x.name)||x))+'"><td>' + esc((x && x.name) || String(x)) + '</td><td>' + esc(String((x && x.level) || '')) + '</td></tr>'; }).join('') + '</tbody></table>' + pre(o) : pre(o)) +
        cardUnit('banned','Banned (banned-players.json)', banned.length ? '<table><thead><tr><th>Player</th><th>Reason</th></tr></thead><tbody>' + banned.map(function(x){ return '<tr data-ks-key="'+esc(String((x&&x.name)||x))+'"><td>' + esc((x && x.name) || String(x)) + '</td><td>' + esc((x && x.reason) || '') + '</td></tr>'; }).join('') + '</tbody></table>' + pre(b) : pre(b));
      el('playerdata').innerHTML = cardUnit('playerdata','World Playerdata (world/playerdata via list_files)', pre(pd));
    }
    el('refresh').onclick = load;
    el('btnWhitelist').onclick = async function(){ var v=el('playerInput').value.trim(); if(!v){ toast('Enter player name','error'); return; } if(!(await ask('whitelist add ' + v + '?'))) return; try{ var r=await act('whitelist_add', [v]); toast('whitelist add: exit ' + (r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    el('btnOp').onclick = async function(){ var v=el('playerInput').value.trim(); if(!v){ toast('Enter player name','error'); return; } if(!(await ask('op ' + v + '?'))) return; try{ var r=await act('op_player', [v]); toast('op: exit ' + (r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    el('btnBan').onclick = async function(){ var v=el('playerInput').value.trim(); if(!v){ toast('Enter player name','error'); return; } if(!(await ask('ban ' + v + '?'))) return; try{ var r=await act('ban_player', [v]); toast('ban: exit ' + (r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    await load();
  `,
);

const MC_WORLD = page(
  'World Import',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">World Import</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div class="ks-card" style="margin-bottom:0.75rem">
    <h3 style="margin:0 0 0.35rem;font-size:0.95rem;color:var(--ks-heading)">Version Compatibility</h3>
    <p class="ks-muted" style="font-size:12px;margin:0">Worlds from <strong>1.13+</strong> use flattened chunk format; <strong>1.18+</strong> expanded height to -64…320 and <strong>1.20+</strong> added biomes. Importing a newer world into an older server jar can corrupt chunks — always <strong>back up world/</strong> via the Files tab and match the jar version. This page <code>list_files world/</code> and runs <code>unzip -o {{args}} -d world/</code> (<span class="ks-mono">validActionArg</span> + <span class="ks-mono">shellQuoteArg</span>) and guards host writes with <code>isDangerousPath</code> (<code>edge/backend/internal/files/handler.go:1</code>).</p>
  </div>
  <div class="ks-row" style="margin-bottom:0.6rem;gap:8px;flex-wrap:wrap">
    <input id="zipInput" class="ks-input ks-search-input" placeholder="world.zip path (e.g. /tmp/world.zip or uploaded file)" style="flex:1;min-width:220px" />
    <button class="ks-btn ks-btn-sm" id="btnUnzip"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Unzip to world/</button>
    <button class="ks-btn ks-btn-sm ks-btn-secondary" id="btnList"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="9 9 9 15 15 9"/></svg> List world/</button>
  </div>
  <div id="content"><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div></div></div>
  <div id="unzipOut" style="display:none;margin-top:0.75rem"></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div></div>';
      try{
        var r = await act('list_world');
        var data = r.data || r.stdout || '';
        var txt = '';
        if (Array.isArray(data)) txt = data.map(function(f){ return (f.is_dir?'d ':'f ') + f.name + '  ' + (f.size||0) + '  ' + (f.mode||''); }).join('\n');
        else txt = String(data);
        el('content').innerHTML = cardUnit('world','world/ (list_files)', pre(txt || '(empty — fresh install)')) + card('Tip', '<p class="ks-muted" style="font-size:12px;margin:0">If world/ is missing, upload a world.zip to <code>/tmp</code> via the Files tab, then unzip here. Host <code>isDangerousPath</code> blocks writes to <code>/bin /etc /usr</code> etc., so only instance-relative paths are allowed.</p>');
      } catch(e){
        el('content').innerHTML = '<p class="ks-bad">list world failed: ' + esc(e.message) + '</p>';
      }
    }
    el('refresh').onclick = load;
    el('btnList').onclick = load;
    el('btnUnzip').onclick = async function(){
      var v = el('zipInput').value.trim();
      if(!v){ toast('Enter zip path','error'); return; }
      if(!(await ask('Unzip ' + v + ' into world/ ? This overwrites files with the same names.'))) return;
      el('unzipOut').style.display = 'block';
      el('unzipOut').innerHTML = '<div class="ks-card">' + pre('unzipping ' + v + ' → world/ ...') + '</div>';
      try{
        var r = await act('unzip_world', [v]);
        var out = (r.stdout||'') + (r.stderr||'');
        el('unzipOut').innerHTML = cardUnit('unzip','Unzip result (exit ' + (r.exit_code!=null?r.exit_code:'?') + ')', pre(out || '(no output — check world/ listing)'));
        toast('Unzip finished', r.exit_code===0?'success':'error');
        load();
      } catch(e){ el('unzipOut').innerHTML = '<div class="ks-card" style="border-color:var(--ks-bad-line)"><p class="ks-bad">' + esc(e.message) + '</p></div>'; toast(e.message,'error'); }
    };
    await load();
  `,
);

const MC_PLUGINS = page(
  'Plugin Manager',
  `<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Plugin Manager</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="btnRestart" title="Touch restart.flag" aria-label="Restart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74"/><polyline points="16 8 21 8 21 3"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74"/><polyline points="8 16 3 16 3 21"/></svg></button>
    </div>
  </div>
  <div class="ks-row" style="margin-bottom:0.6rem;gap:8px;flex-wrap:wrap">
    <input id="pluginUrl" class="ks-input ks-search-input" placeholder="https://example.com/plugin.jar or plugin name for rm" style="flex:1;min-width:220px" />
    <button class="ks-btn ks-btn-sm" id="btnInstall"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> wget to plugins/</button>
    <button class="ks-btn ks-btn-sm ks-btn-danger" id="btnRemove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> rm .jar</button>
  </div>
  <div class="ks-row" style="margin-bottom:0.6rem;gap:8px;flex-wrap:wrap">
    <input id="configPath" class="ks-input" placeholder="plugins/ExamplePlugin/config.yml" value="plugins/ExamplePlugin/config.yml" style="flex:1;min-width:200px" />
    <input id="configContent" class="ks-input" placeholder="key: value" value="enable: true" style="flex:1;min-width:140px" />
    <button class="ks-btn ks-btn-sm ks-btn-secondary" id="btnWriteConfig"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3" style="margin-right:4px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Write config</button>
  </div>
  <div id="content"><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:18px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton" style="height:10px;width:30px"></div><div class="ks-skeleton" style="height:10px;width:18px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div></div></div></div>
  <div id="out" style="display:none;margin-top:0.75rem"></div>`,
  `
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:18px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div></div></div>';
      try{
        var r = await act('list_plugins');
        var data = r.data || r.stdout || '';
        var rows = [];
        if (Array.isArray(data)) rows = data;
        else {
          var txt = String(data);
          rows = txt.split('\n').filter(Boolean).map(function(l){ var p=l.trim().split(/\s+/); return {name:p[p.length-1]||l, size:0, is_dir:false, mode:''}; });
        }
        var jars = rows.filter(function(f){ return f.name && f.name.endsWith('.jar'); });
        el('content').innerHTML =
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
          '<div class="ks-card" data-ks-key="stat-total"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Plugins</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-heading)">' + rows.length + '</div><div class="ks-muted" style="font-size:11px">files in plugins/</div></div>' +
          '<div class="ks-card" data-ks-key="stat-jars"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Jars</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-info)">' + jars.length + '</div><div class="ks-muted" style="font-size:11px">.jar files</div></div>' +
          '<div class="ks-card" data-ks-key="stat-dirs"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Config Dirs</div><div style="font-size:1.6rem;font-weight:600;color:var(--ks-heading)">' + rows.filter(function(f){return f.is_dir;}).length + '</div><div class="ks-muted" style="font-size:11px">folders</div></div>' +
          '</div>' +
          cardUnit('plugins','plugins/ (list_files)', rows.length ? '<table><thead><tr><th>Name</th><th>Size</th><th>Type</th></tr></thead><tbody>' + rows.map(function(f){ return '<tr data-ks-key="'+esc(f.name)+'"><td>' + esc(f.name) + '</td><td class="ks-mono">' + esc(String(f.size||'')) + '</td><td><span class="ks-badge">' + (f.is_dir?'dir':'file') + '</span></td></tr>'; }).join('') + '</tbody></table>' : '<p class="ks-muted">No plugins found — plugins/ is empty. Use wget to install a .jar or write a config.yml.</p>') +
          (jars.length ? card('Jars', '<p class="ks-muted" style="font-size:12px;margin:0">' + jars.length + ' jar(s) installed — <span class="ks-mono">' + esc(jars.map(function(j){return j.name;}).join(', ')) + '</span>. Use rm to remove, or edit per-plugin <code>config.yml</code> via write_file.</p>') : '');
      } catch(e){
        el('content').innerHTML = '<p class="ks-bad">list plugins failed: ' + esc(e.message) + '</p>';
      }
    }
    el('refresh').onclick = load;
    el('btnRestart').onclick = async function(){ if(!(await ask('Touch restart.flag to request a server restart?'))) return; try{ var r=await act('restart_flag'); toast('restart.flag: exit '+(r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); } catch(e){ toast(e.message,'error'); } };
    el('btnInstall').onclick = async function(){ var v=el('pluginUrl').value.trim(); if(!v){ toast('Enter URL','error'); return; } if(!(await ask('wget ' + v + ' → plugins/ ?'))) return; try{ var r=await act('install_plugin', [v]); var out=(r.stdout||'')+(r.stderr||''); el('out').style.display='block'; el('out').innerHTML=cardUnit('install','wget result (exit '+(r.exit_code!=null?r.exit_code:'?')+')', pre(out||'(no output)')); toast('wget finished', r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    el('btnRemove').onclick = async function(){ var v=el('pluginUrl').value.trim(); if(!v){ toast('Enter plugin name without .jar','error'); return; } var name=v.replace(/\.jar$/,''); if(!(await ask('rm plugins/' + name + '.jar ? This deletes the jar.'))) return; try{ var r=await act('remove_plugin', [name]); var out=(r.stdout||'')+(r.stderr||''); el('out').style.display='block'; el('out').innerHTML=cardUnit('remove','rm result (exit '+(r.exit_code!=null?r.exit_code:'?')+')', pre(out||'(no output)')); toast('rm finished', r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    el('btnWriteConfig').onclick = async function(){ var p=el('configPath').value.trim(); if(!p){ toast('Enter config path','error'); return; } if(!(await ask('Write ' + p + ' ?'))) return; try{ var r=await act('write_plugin_config'); toast('write_plugin_config: exit '+(r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); if(r.exit_code===0) load(); } catch(e){ toast(e.message,'error'); } };
    await load();
  `,
);



// ---------------------------------------------------------------------------
// LIBRARY PAGES — the shipped instance_pages/pages/*.json definitions ported
// verbatim into the Studio (the on-disk library directory was removed).
// The Home page keeps its RESERVED INDEX-ROUTE SLUG "." so applying it makes
// it render at /instances/<id>/ itself (the SPA maps '' -> '.').
// ---------------------------------------------------------------------------

const LIB_AUDIT_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:120px\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:12px;width:33%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:50%;margin-bottom:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:12px;width:28%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:44%;margin-bottom:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:58%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:12px;width:36%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48%;margin-bottom:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:12px;width:30%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:54%;margin-bottom:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:70%\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function timeAgo(iso) {\n    if (!iso) return '—';\n    var t = new Date(iso).getTime();\n    if (isNaN(t)) return String(iso);\n    var diff = Date.now() - t;\n    if (diff < 0) {\n      var fu = -diff;\n      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';\n      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';\n      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';\n    }\n    var s = Math.round(diff / 1000);\n    if (s < 60) return s + 's ago';\n    if (s < 3600) return Math.floor(s / 60) + 'm ago';\n    if (s < 86400) return Math.floor(s / 3600) + 'h ago';\n    return new Date(iso).toLocaleString();\n  }\n\n  var state = { rows: [], loading: true, error: '' };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n\n  function actionColor(action) {\n    var a = String(action || '');\n    if (a.indexOf('automation') === 0) return 'var(--ks-purple)';\n    if (a.indexOf('secret') === 0) return 'var(--ks-warn)';\n    if (a.indexOf('snapshot') === 0) return 'var(--ks-info)';\n    return 'var(--ks-ok)';\n  }\n\n  function load() {\n    state.loading = true; state.error = '';\n    render();\n    sdk.fetchPanel(base() + '/audit?limit=200')\n      .then(function (rows) { state.rows = Array.isArray(rows) ? rows : []; state.loading = false; render(); })\n      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load audit'; render(); });\n  }\n\n  function render() {\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Audit log</h2>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"' + (state.loading ? ' disabled' : '') + '><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div>';\n\n    if (state.error) html += '<p style=\"font-size:12px;color:var(--ks-bad);margin-top:10px\">' + esc(state.error) + '</p>';\n\n    html += '<div class=\"ks-ip-scroll-area\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px\">';\n    if (state.loading) {\n      for (var i = 0; i < 4; i++) {\n        html += '<div class=\"ks-card\"><div style=\"height:12px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n          + '<div style=\"height:10px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:6px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n          + '<div style=\"height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div></div>';\n      }\n    } else if (state.rows.length === 0) {\n      html += '<div class=\"ks-card\"><p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:6px 12px\">No audit entries yet.</p></div>';\n    } else {\n      state.rows.forEach(function (r) {\n        html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(r.id)) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n          + '<div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:8px\">'\n          + '<span class=\"ks-badge\" style=\"color:' + actionColor(r.action) + '\">' + esc(r.action) + '</span>'\n          + '<span class=\"ks-muted\" style=\"font-size:11px;white-space:nowrap\">' + timeAgo(r.created_at) + '</span></div>'\n          + '<div style=\"font-size:13px;font-weight:500;color:var(--ks-secondary)\">' + esc(r.actor || 'system') + '</div>'\n          + (r.detail ? '<p class=\"ks-muted\" style=\"font-size:12px;margin:0;word-break:break-all\">' + esc(r.detail) + '</p>' : '')\n          + '</div>';\n      });\n    }\n    html += '</div>';\n    document.getElementById('root').innerHTML = html;\n    Array.prototype.forEach.call(document.querySelectorAll('[data-action=\"refresh\"]'), function (b) { b.addEventListener('click', load); });\n  }\n\n  function start(s) { sdk = s; load(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n})();\n</script>\n";

const LIB_AUTOMATION_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:132px\"></div><div style=\"display:flex;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div></div><div style=\"display:flex;gap:4px;border-bottom:1px solid var(--ks-card-border);margin-top:12px;padding-bottom:8px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:56px;border-radius:9999px\"></div><div class=\"ks-skeleton-bar\" style=\"height:14px;width:96px;border-radius:9999px\"></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:44%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:52%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:32px;width:100%;border-radius:6px\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:48%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:54%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:32px;width:100%;border-radius:6px\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:40%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:68%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:32px;width:100%;border-radius:6px\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function timeAgo(iso) {\n    if (!iso) return '—';\n    var t = new Date(iso).getTime();\n    if (isNaN(t)) return String(iso);\n    var diff = Date.now() - t;\n    if (diff < 0) {\n      var fu = -diff;\n      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';\n      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';\n      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';\n    }\n    var s = Math.round(diff / 1000);\n    if (s < 60) return s + 's ago';\n    if (s < 3600) return Math.floor(s / 60) + 'm ago';\n    if (s < 86400) return Math.floor(s / 3600) + 'h ago';\n    return new Date(iso).toLocaleString();\n  }\n\n  var state = { jobs: [], runs: [], loading: true, error: '', busy: false, tab: 'tasks', modal: null, runResult: null, formError: '' };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm===\"function\")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}\n\n  function load() {\n    state.loading = true; state.error = '';\n    render();\n    Promise.all([\n      sdk.fetchPanel(base() + '/automation/'),\n      sdk.fetchPanel(base() + '/automation/runs?limit=50')\n    ]).then(function (res) {\n      state.jobs = Array.isArray(res[0]) ? res[0] : [];\n      state.runs = Array.isArray(res[1]) ? res[1] : [];\n      state.loading = false; render();\n    }).catch(function (e) {\n      state.loading = false;\n      state.error = (e && e.message) || 'Failed to load automation';\n      render();\n    });\n  }\n\n  async function remove(j) {\n    if (!(await ask('Delete automation \"' + j.name + '\"? Run history will be removed.'))) return;\n    sdk.fetchPanel(base() + '/automation/' + j.id, { method: 'DELETE' })\n      .then(load)\n      .catch(function (e) { state.error = (e && e.message) || 'Failed to delete job'; render(); });\n  }\n\n  function runNow(j) {\n    state.busy = true; state.error = ''; state.runResult = null;\n    render();\n    sdk.fetchPanel(base() + '/automation/' + j.id + '/run', { method: 'POST' })\n      .then(function (r) {\n        state.runResult = { jobId: j.id, r: r };\n        state.tab = 'runs'; state.busy = false;\n        load();\n      })\n      .catch(function (e) { state.busy = false; state.error = (e && e.message) || 'Run failed'; render(); });\n  }\n\n  function submitModal() {\n    var m = state.modal;\n    if (!m.name || !m.command) { state.formError = 'Name and command are required.'; render(); return; }\n    state.busy = true; state.formError = '';\n    render();\n    var payload = {\n      name: m.name, command: m.command, schedule: m.schedule,\n      enabled: !!m.enabled, secret_refs: m.secret_refs, timeout_sec: Number(m.timeout_sec) || 300\n    };\n    var p = m.editing\n      ? sdk.fetchPanel(base() + '/automation/' + m.editing.id, { method: 'PUT', body: JSON.stringify(payload) })\n      : sdk.fetchPanel(base() + '/automation/', { method: 'POST', body: JSON.stringify(payload) });\n    p.then(function () { state.busy = false; state.modal = null; load(); })\n      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Failed to save job'; render(); });\n  }\n\n  // ---- modal ---------------------------------------------------------------\n  function field(label, inputHtml, hint) {\n    return '<div><label class=\"ks-muted\" style=\"display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px\">' + label + '</label>'\n      + inputHtml + (hint ? '<p class=\"ks-muted\" style=\"font-size:11px;margin:4px 0 0\">' + hint + '</p>' : '') + '</div>';\n  }\n  function buildModal() {\n    var m = state.modal;\n    if (!m) return '';\n    var inner = ''\n      + (state.formError ? '<p style=\"font-size:12px;color:var(--ks-bad);margin:0 0 10px\">' + esc(state.formError) + '</p>' : '')\n      + '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px\">'\n      + field('Name', '<input id=\"f-name\" type=\"text\" value=\"' + esc(m.name) + '\" placeholder=\"Backup the world\">')\n      + field('Schedule (cron)', '<input id=\"f-sched\" type=\"text\" value=\"' + esc(m.schedule) + '\" placeholder=\"0 4 * * *\">', '5 fields, e.g. “*/10 * * * *”. Empty = manual only.')\n      + '<div style=\"grid-column:1/-1\">' + field('Command', '<textarea id=\"f-cmd\" rows=\"3\" style=\"width:100%\">' + esc(m.command) + '</textarea>', 'Run inside the instance via /bin/sh -c.') + '</div>'\n      + field('Secret refs (comma-separated)', '<input id=\"f-refs\" type=\"text\" value=\"' + esc((m.secret_refs || []).join(', ')) + '\" placeholder=\"BACKUP_S3_KEY, BACKUP_S3_SECRET\">', 'Names of vaulted secrets to inject as env.')\n      + field('Timeout (sec)', '<input id=\"f-timeout\" type=\"number\" value=\"' + esc(m.timeout_sec) + '\">')\n      + '<div style=\"display:flex;align-items:end;padding-bottom:4px\"><label style=\"display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ks-body);cursor:pointer\"><input id=\"f-enabled\" type=\"checkbox\"' + (m.enabled ? ' checked' : '') + ' style=\"accent-color:var(--ks-info)\"> Enabled</label></div>'\n      + '</div>';\n    return '<div class=\"ks-ip-modal-overlay\" data-overlay=\"1\" style=\"position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease\">'\n      + '<div class=\"ks-ip-modal-panel\" style=\"background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:600px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column\" onclick=\"event.stopPropagation()\">'\n      + '<div class=\"ks-ip-modal-header\" style=\"display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10\">'\n      + '<h3 class=\"ks-ip-modal-title\" style=\"font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0\">' + (m.editing ? 'Edit “' + esc(m.editing.name) + '”' : 'Create task') + '</h3>'\n      + '<button type=\"button\" class=\"ks-ip-modal-close ks-modal-close\" style=\"border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center\" aria-label=\"Close\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:20px;height:20px\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button></div>'\n      + '<div class=\"ks-ip-modal-body\" style=\"padding:20px 24px;display:flex;flex-direction:column;gap:16px\">' + inner + '</div>'\n      + '<div class=\"ks-ip-modal-footer\" style=\"display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)\">'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-ghost\" data-action=\"cancel\">Cancel</button>'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-primary\" data-action=\"submit\"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : (m.editing ? 'Save' : 'Create task')) + '</button>'\n      + '</div></div></div>';\n  }\n\n  function skeletonCard() {\n    return '<div class=\"ks-card\"><div style=\"height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n      + '<div style=\"height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n      + '<div style=\"height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div></div>';\n  }\n  function pre(text, cls) {\n    return '<pre class=\"ks-mono\" style=\"margin:0;font-size:12px;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-all;overflow:auto;max-height:96px;color:' + (cls || 'var(--ks-secondary)') + '\">' + esc(text || '') + '</pre>';\n  }\n\n  function render() {\n    var ae = document.activeElement;\n    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))\n      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }\n      : null;\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Automation</h2>'\n      + '<div style=\"display:flex;gap:8px\">'\n      + '<button title=\"Create\" aria-label=\"Create\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"create\"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg></button>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"' + (state.loading ? ' disabled' : '') + '><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div></div>';\n\n    if (state.error) html += '<p style=\"font-size:12px;color:var(--ks-bad);margin-top:10px\">' + esc(state.error) + '</p>';\n\n    // tabs\n    html += '<div style=\"display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--ks-card-border);margin-top:12px\">'\n      + [['tasks', 'Tasks'], ['runs', 'Recent runs']].map(function (t) {\n        var on = state.tab === t[0];\n        return '<button type=\"button\" data-tab=\"' + t[0] + '\" style=\"padding:8px 16px;font-size:14px;border:none;border-bottom:2px solid ' + (on ? 'var(--ks-heading)' : 'transparent') + ';background:transparent;color:' + (on ? 'var(--ks-heading)' : 'var(--ks-muted)') + ';cursor:pointer;margin-bottom:-1px;font-family:inherit\">' + t[1] + '</button>';\n      }).join('')\n      + '</div><div style=\"margin-top:12px\">';\n\n    if (state.tab === 'tasks') {\n      if (state.loading) {\n        html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px\">';\n        for (var i = 0; i < 3; i++) html += skeletonCard();\n        html += '</div>';\n      } else if (state.jobs.length === 0) {\n        html += '<div class=\"ks-card\"><p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:6px 12px\">No tasks yet. Click “Create” to add one.</p></div>';\n      } else {\n        html += '<div class=\"ks-ip-scroll-area\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px\">';\n        state.jobs.forEach(function (j) {\n          html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(j.id)) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n            + '<div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:8px\">'\n            + '<div style=\"min-width:0\"><div style=\"font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + esc(j.name) + '</div>'\n            + '<span class=\"ks-badge\" style=\"margin-top:4px;color:' + (j.enabled ? 'var(--ks-ok)' : 'var(--ks-secondary)') + '\">' + (j.enabled ? 'enabled' : 'disabled') + '</span></div>'\n            + '<div style=\"display:flex;gap:4px;flex-shrink:0\">'\n            + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-run=\"\' + j.id + \'\" title=\"Run now\" aria-label=\"Run now\"\' + (state.busy ? \' disabled\' : \'\') + \'>▶ Run</button>'\n            + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-edit=\"\' + j.id + \'\" title=\"Edit\" aria-label=\"Edit\">✎</button>'\n            + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" style=\"color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important\" data-del=\"\' + j.id + \'\" title=\"Delete\" aria-label=\"Delete\">🗑</button>'\n            + '</div></div>'\n            + '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--ks-muted);\">'\n            + '<span class=\"ks-mono\" style=\"padding:2px 6px;border-radius:4px;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);color:var(--ks-body)\">' + esc(j.schedule || 'manual') + '</span>'\n            + '<span title=\"Last run\">last ' + timeAgo(j.last_run_at) + '</span><span style=\"color:var(--ks-faint)\">·</span>'\n            + '<span title=\"Next run\">next ' + timeAgo(j.next_run_at) + '</span><span style=\"color:var(--ks-faint)\">·</span>'\n            + '<span>' + (j.timeout_sec || 300) + 's</span></div>'\n            + pre(j.command)\n            + ((j.secret_refs || []).length > 0\n              ? '<div style=\"display:flex;flex-wrap:wrap;gap:4px\">' + j.secret_refs.map(function (s) {\n                return '<span class=\"ks-mono\" style=\"font-size:10px;padding:2px 6px;border-radius:4px;background:var(--ks-warn-wash);color:var(--ks-warn);border:1px solid var(--ks-warn-line)\">' + esc(s) + '</span>';\n              }).join('') + '</div>'\n              : '')\n            + '</div>';\n        });\n        html += '</div>';\n      }\n    } else {\n      // runs tab\n      if (state.runResult) {\n        html += '<div class=\"ks-card\" style=\"margin-bottom:12px\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 2px;color:var(--ks-heading)\">Last run — job #' + state.runResult.jobId + '</h3>'\n          + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">exit=' + esc(state.runResult.r.exit_code) + ' · ' + esc(state.runResult.r.duration_ms) + 'ms</p>'\n          + (state.runResult.r.error\n            ? pre(state.runResult.r.error, 'var(--ks-bad)')\n            : pre(state.runResult.r.stdout || '(no stdout)', 'var(--ks-ok-soft)'))\n          + (state.runResult.r.stderr ? pre(state.runResult.r.stderr, 'var(--ks-warn-soft)') : '')\n          + '</div>';\n      }\n      if (state.runs.length === 0) {\n        html += '<div class=\"ks-card\"><p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:6px 12px\">No runs recorded.</p></div>';\n      } else {\n        html += '<div class=\"ks-ip-scroll-area\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px\">';\n        state.runs.forEach(function (r) {\n          var failed = r.error || r.exit_code !== 0;\n          html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(r.id)) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n            + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px\">'\n            + '<span class=\"ks-badge\" style=\"color:' + (r.trigger === 'schedule' ? 'var(--ks-info)' : 'var(--ks-purple)') + '\">' + esc(r.trigger) + '</span>'\n            + '<span class=\"ks-mono\" style=\"font-size:12px;color:' + (failed ? 'var(--ks-bad)' : 'var(--ks-ok)') + '\">' + (r.error ? 'err' : 'exit ' + esc(r.exit_code)) + '</span></div>'\n            + pre(r.command)\n            + (r.stdout ? pre(r.stdout, 'var(--ks-ok-soft)') : '')\n            + (r.stderr ? pre(r.stderr, 'var(--ks-warn-soft)') : '')\n            + (r.error ? pre(r.error, 'var(--ks-bad)') : '')\n            + '<div style=\"display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--ks-muted)\"><span>' + timeAgo(r.started_at) + '</span><span style=\"font-variant-numeric:tabular-nums\">' + esc(r.duration_ms) + 'ms</span></div>'\n            + '</div>';\n        });\n        html += '</div>';\n      }\n    }\n    html += '</div>';\n    html += buildModal();\n    document.getElementById('root').innerHTML = html;\n    wire();\n    // A re-render mid-typing (e.g. the initial load resolving) rebuilt the\n    // fields — put the caret back so typing continues seamlessly.\n    restoreFocus(prevFocus);\n  }\n\n  function wire() {\n    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {\n      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });\n    });\n    var bind = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) { b.addEventListener('click', fn); }); };\n    bind('[data-action=\"refresh\"]', load);\n    bind('[data-action=\"create\"]', function () {\n      state.formError = '';\n      state.modal = { name: '', command: '', schedule: '', enabled: true, secret_refs: [], timeout_sec: 300, editing: null };\n      render(); focusField('f-name');\n    });\n    bind('[data-run]', function (ev) {\n      var id = Number(ev.currentTarget.getAttribute('data-run'));\n      var j = state.jobs.filter(function (x) { return x.id === id; })[0];\n      if (j) runNow(j);\n    });\n    bind('[data-del]', function (ev) {\n      var id = Number(ev.currentTarget.getAttribute('data-del'));\n      var j = state.jobs.filter(function (x) { return x.id === id; })[0];\n      if (j) remove(j);\n    });\n    bind('[data-edit]', function (ev) {\n      var id = Number(ev.currentTarget.getAttribute('data-edit'));\n      var j = state.jobs.filter(function (x) { return x.id === id; })[0];\n      if (!j) return;\n      state.formError = '';\n      state.modal = {\n        name: j.name, command: j.command, schedule: j.schedule, enabled: !!j.enabled,\n        secret_refs: j.secret_refs || [], timeout_sec: j.timeout_sec || 300, editing: j\n      };\n      render(); focusField('f-name');\n    });\n\n    var overlay = document.querySelector('[data-overlay]');\n    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });\n    var cb = document.querySelector('.ks-modal-close');\n    if (cb) cb.addEventListener('click', closeModal);\n    var cancel = document.querySelector('[data-action=\"cancel\"]');\n    if (cancel) cancel.addEventListener('click', closeModal);\n    var sub = document.querySelector('[data-action=\"submit\"]');\n    if (sub) sub.addEventListener('click', submitModal);\n  }\n  // Field values sync through DELEGATED listeners bound once at startup.\n  // Every render() rebuilds the modal markup (busy state, failed save,\n  // background load finishing while the dialog is open); per-node listeners\n  // attached when the dialog opens die with their nodes on those rebuilds,\n  // desyncing what the user typed from state (text vanishing on the next\n  // paint or stale values being submitted). Delegation survives re-renders.\n  function wireFields() {\n    var FIELDS = {\n      'f-name': function (v) { state.modal.name = v.trim(); },\n      'f-cmd': function (v) { state.modal.command = v; },\n      'f-sched': function (v) { state.modal.schedule = v.trim(); },\n      'f-refs': function (v) { state.modal.secret_refs = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); },\n      'f-timeout': function (v) { state.modal.timeout_sec = Number(v) || 300; }\n    };\n    document.addEventListener('input', function (ev) {\n      var t = ev.target;\n      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);\n    }, true);\n    document.addEventListener('change', function (ev) {\n      var t = ev.target;\n      if (t && t.id === 'f-enabled' && state.modal) state.modal.enabled = t.checked;\n    }, true);\n  }\n  function focusField(id) {\n    var f = document.getElementById(id);\n    if (!f) return;\n    f.focus();\n    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}\n  }\n  function restoreFocus(prev) {\n    if (!prev || !prev.id) return;\n    var f = document.getElementById(prev.id);\n    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;\n    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }\n    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {\n      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}\n    }\n  }\n  function closeModal() { state.modal = null; state.formError = ''; render(); }\n\n  function start(s) { sdk = s; wireFields(); load(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n\n  var st = document.createElement('style');\n  st.textContent = '@keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}';\n  document.head.appendChild(st);\n})();\n</script>\n";
const LIB_BACKUPS_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:168px\"></div><div style=\"display:flex;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:48%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:32%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:52%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:36%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:44%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:28%\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function fmtBytes(bytes) {\n    if (bytes == null || isNaN(bytes)) return '—';\n    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = Number(bytes);\n    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }\n    return (i >= 3 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];\n  }\n  function timeAgo(iso) {\n    if (!iso) return '—';\n    var t = new Date(iso).getTime();\n    if (isNaN(t)) return String(iso);\n    var diff = Date.now() - t;\n    if (diff < 0) {\n      var fu = -diff;\n      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';\n      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';\n      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';\n    }\n    var s = Math.round(diff / 1000);\n    if (s < 60) return s + 's ago';\n    if (s < 3600) return Math.floor(s / 60) + 'm ago';\n    if (s < 86400) return Math.floor(s / 3600) + 'h ago';\n    return new Date(iso).toLocaleString();\n  }\n\n  var state = { rows: [], loading: true, error: '', modal: null, busy: false, formError: '' };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm===\"function\")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}\n\n  function load() {\n    state.loading = true; state.error = '';\n    render();\n    sdk.fetchPanel(base() + '/snapshots/')\n      .then(function (rows) { state.rows = Array.isArray(rows) ? rows : []; state.loading = false; render(); })\n      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load snapshots'; render(); });\n  }\n\n  function create() {\n    var m = state.modal;\n    if (!m || !m.name) { state.formError = 'A name is required.'; render(); return; }\n    state.busy = true; state.formError = '';\n    render();\n    sdk.fetchPanel(base() + '/snapshots/', {\n      method: 'POST',\n      body: JSON.stringify({ name: m.name, note: m.note, type: m.type, location: m.location })\n    })\n      .then(function () { state.busy = false; state.modal = null; load(); })\n      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Create failed'; render(); });\n  }\n\n  async function restore(s) {\n    if (!(await ask('Restore snapshot \"' + s.name + '\"? The instance will be rolled back. This is destructive to current state.'))) return;\n    sdk.fetchPanel(base() + '/snapshots/' + encodeURIComponent(s.name) + '/restore', { method: 'POST' })\n      .then(load)\n      .catch(function (e) { state.error = (e && e.message) || 'Restore failed'; render(); });\n  }\n\n  async function remove(s) {\n    if (!(await ask('Delete snapshot \"' + s.name + '\"? This cannot be undone.'))) return;\n    sdk.fetchPanel(base() + '/snapshots/' + encodeURIComponent(s.name), { method: 'DELETE' })\n      .then(load)\n      .catch(function (e) { state.error = (e && e.message) || 'Delete failed'; render(); });\n  }\n\n  function field(label, inputHtml, hint) {\n    return '<div><label class=\"ks-muted\" style=\"display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px\">' + label + '</label>'\n      + inputHtml + (hint ? '<p class=\"ks-muted\" style=\"font-size:11px;margin:4px 0 0\">' + hint + '</p>' : '') + '</div>';\n  }\n\n  function buildModal() {\n    var m = state.modal;\n    if (!m) return '';\n    var inner = ''\n      + (state.formError ? '<p style=\"font-size:12px;color:var(--ks-bad);margin:0 0 10px\">' + esc(state.formError) + '</p>' : '')\n      + '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px\">'\n      + field('Name (unique)', '<input id=\"f-name\" type=\"text\" value=\"' + esc(m.name) + '\" placeholder=\"pre-update-2026-07-24\">')\n      + field('Type', '<input id=\"f-type\" type=\"text\" value=\"' + esc(m.type) + '\" placeholder=\"tar\">', 'Format: tar, zip, docker, lxd, etc. (default: driver-specific)')\n      + field('Location', '<input id=\"f-loc\" type=\"text\" value=\"' + esc(m.location) + '\" placeholder=\"/mc/\">', 'Storage path: /mc/, /tmp/snapshots/, etc. (default: driver-specific)')\n      + '<div style=\"grid-column:span 2\">' + field('Note (optional)', '<input id=\"f-note\" type=\"text\" value=\"' + esc(m.note) + '\" placeholder=\"Before kernel bump\">') + '</div>'\n      + '</div>';\n    return '<div class=\"ks-ip-modal-overlay\" data-overlay=\"1\" style=\"position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease\">'\n      + '<div class=\"ks-ip-modal-panel\" style=\"background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:540px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column\" onclick=\"event.stopPropagation()\">'\n      + '<div class=\"ks-ip-modal-header\" style=\"display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10\">'\n      + '<h3 class=\"ks-ip-modal-title\" style=\"font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0\">Create snapshot</h3>'\n      + '<button type=\"button\" class=\"ks-ip-modal-close ks-modal-close\" style=\"border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center\" aria-label=\"Close\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:20px;height:20px\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button></div>'\n      + '<div class=\"ks-ip-modal-body\" style=\"padding:20px 24px;display:flex;flex-direction:column;gap:16px\">' + inner + '</div>'\n      + '<div class=\"ks-ip-modal-footer\" style=\"display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)\">'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-ghost\" data-action=\"cancel\">Cancel</button>'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-primary\" data-action=\"submit\"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Creating…' : 'Create snapshot') + '</button>'\n      + '</div></div></div>';\n  }\n\n  function render() {\n    var ae = document.activeElement;\n    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))\n      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }\n      : null;\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Backups &amp; Snapshots</h2>'\n      + '<div style=\"display:flex;gap:8px\">'\n      + '<button title=\"Create\" aria-label=\"Create\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"create\"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg></button>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"' + (state.loading ? ' disabled' : '') + '><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div></div>';\n\n    if (state.error) html += '<p style=\"font-size:12px;color:var(--ks-bad);margin-top:10px\">' + esc(state.error) + '</p>';\n\n    html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px\">';\n    if (state.loading) {\n      for (var i = 0; i < 3; i++) {\n        html += '<div class=\"ks-card\"><div style=\"height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n          + '<div style=\"height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n          + '<div style=\"height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div></div>';\n      }\n    } else if (state.rows.length === 0) {\n      html += '<div class=\"ks-card\"><p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:6px 12px\">No snapshots yet. Click “Create snapshot” to add one.</p></div>';\n    } else {\n      state.rows.forEach(function (s) {\n        html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(s.id)) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n          + '<div><div style=\"font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + esc(s.name) + '</div>'\n          + '<span class=\"ks-badge ks-mono\" style=\"margin-top:4px\">' + esc(s.external_ref || '—') + '</span></div>'\n          + '<div style=\"display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-muted);\">'\n          + '<span>' + (s.size_bytes ? fmtBytes(s.size_bytes) : '—') + '</span><span style=\"color:var(--ks-faint)\">·</span><span>' + timeAgo(s.created_at) + '</span></div>'\n          + (s.note ? '<p class=\"ks-muted\" style=\"font-size:12px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\" title=\"' + esc(s.note) + '\">' + esc(s.note) + '</p>' : '')\n          + '<div style=\"display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:6px;border-top:1px solid var(--ks-card-border)\">'\n          + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-restore=\"\' + esc(s.id) + \'\" title=\"Restore\" aria-label=\"Restore\">Restore</button>'\n          + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" style=\"color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important\" data-delete=\"\' + esc(s.id) + \'\" title=\"Delete\" aria-label=\"Delete\">Delete</button>'\n          + '</div></div>';\n      });\n    }\n    html += '</div>';\n    html += buildModal();\n    document.getElementById('root').innerHTML = html;\n\n    Array.prototype.forEach.call(document.querySelectorAll('[data-action=\"refresh\"]'), function (b) { b.addEventListener('click', load); });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-action=\"create\"]'), function (b) {\n      b.addEventListener('click', function () {\n        state.formError = '';\n        state.modal = { name: '', note: '', type: '', location: '' };\n        render(); focusField('f-name');\n      });\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-restore]'), function (b) {\n      b.addEventListener('click', function () {\n        var s = state.rows.filter(function (x) { return String(x.id) === b.getAttribute('data-restore'); })[0];\n        if (s) restore(s);\n      });\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-delete]'), function (b) {\n      b.addEventListener('click', function () {\n        var s = state.rows.filter(function (x) { return String(x.id) === b.getAttribute('data-delete'); })[0];\n        if (s) remove(s);\n      });\n    });\n\n    var overlay = document.querySelector('[data-overlay]');\n    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });\n    var cb = document.querySelector('.ks-modal-close');\n    if (cb) cb.addEventListener('click', closeModal);\n    var cancel = document.querySelector('[data-action=\"cancel\"]');\n    if (cancel) cancel.addEventListener('click', closeModal);\n    var sub = document.querySelector('[data-action=\"submit\"]');\n    if (sub) sub.addEventListener('click', create);\n    restoreFocus(prevFocus);\n  }\n\n  // Field values sync through DELEGATED listeners bound once at startup so\n  // re-renders (busy state, failed save, background load finishing) can never\n  // desync what the operator typed from state. See Automation for detail.\n  function wireFields() {\n    var FIELDS = {\n      'f-name': function (v) { state.modal.name = v.trim(); },\n      'f-type': function (v) { state.modal.type = v.trim(); },\n      'f-loc': function (v) { state.modal.location = v.trim(); },\n      'f-note': function (v) { state.modal.note = v.trim(); }\n    };\n    document.addEventListener('input', function (ev) {\n      var t = ev.target;\n      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);\n    }, true);\n  }\n  function focusField(id) {\n    var f = document.getElementById(id);\n    if (!f) return;\n    f.focus();\n    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}\n  }\n  function restoreFocus(prev) {\n    if (!prev || !prev.id) return;\n    var f = document.getElementById(prev.id);\n    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;\n    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }\n    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {\n      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}\n    }\n  }\n  function closeModal() { state.modal = null; state.formError = ''; render(); }\n\n  function start(s) { sdk = s; wireFields(); load(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n})();\n</script>\n";
const LIB_ENV_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:124px\"></div><div style=\"display:flex;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div></div><div class=\"ks-card\" style=\"margin-top:12px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:28%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:14px\"></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:44%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:32%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:48%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:36%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:40%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:68%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:28%\"></div></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function timeAgo(iso) {\n    if (!iso) return '—';\n    var t = new Date(iso).getTime();\n    if (isNaN(t)) return String(iso);\n    var diff = Date.now() - t;\n    if (diff < 0) {\n      var fu = -diff;\n      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';\n      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';\n      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';\n    }\n    var s = Math.round(diff / 1000);\n    if (s < 60) return s + 's ago';\n    if (s < 3600) return Math.floor(s / 60) + 'm ago';\n    if (s < 86400) return Math.floor(s / 3600) + 'h ago';\n    return new Date(iso).toLocaleString();\n  }\n\n  var state = { secrets: [], loading: true, error: '', revealed: {}, modal: null, busy: false, formError: '' };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm===\"function\")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}\n\n  function load() {\n    state.loading = true; state.error = '';\n    render();\n    sdk.fetchPanel(base() + '/secrets/')\n      .then(function (rows) {\n        state.secrets = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.secrets) ? rows.secrets : []);\n        state.loading = false; render();\n      })\n      .catch(function (e) {\n        state.loading = false;\n        state.error = (e && e.message) || 'Failed to load secrets';\n        render();\n      });\n  }\n\n  function reveal(key) {\n    sdk.fetchPanel(base() + '/secrets/' + encodeURIComponent(key))\n      .then(function (r) { state.revealed[key] = r && r.value ? r.value : ''; render(); })\n      .catch(function (e) { state.error = (e && e.message) || 'Reveal failed'; render(); });\n  }\n\n  async function remove(key) {\n    if (!(await ask('Delete secret \"' + key + '\"? This cannot be undone.'))) return;\n    sdk.fetchPanel(base() + '/secrets/' + encodeURIComponent(key), { method: 'DELETE' })\n      .then(function () { delete state.revealed[key]; load(); })\n      .catch(function (e) { state.error = (e && e.message) || 'Delete failed'; render(); });\n  }\n\n  function submitModal() {\n    var m = state.modal;\n    if (!m.key) { state.formError = 'Key is required.'; render(); return; }\n    state.busy = true; state.formError = '';\n    render();\n    var payload = {\n      key: m.editing ? m.editing.key : m.key,\n      value: m.value,\n      is_secret: !!m.is_secret,\n      description: m.description\n    };\n    sdk.fetchPanel(base() + '/secrets/', { method: 'POST', body: JSON.stringify(payload) })\n      .then(function () { state.busy = false; state.modal = null; delete state.revealed[payload.key]; load(); })\n      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Failed to save'; render(); });\n  }\n\n  function buildModal() {\n    var m = state.modal;\n    if (!m) return '';\n    var inner = ''\n      + (state.formError ? '<p style=\"font-size:12px;color:var(--ks-bad);margin:0 0 10px\">' + esc(state.formError) + '</p>' : '')\n      + '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px\">'\n      + '<div><label class=\"ks-muted\" style=\"display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px\">Key (unique per instance)</label>'\n      + '<input id=\"f-key\" type=\"text\" value=\"' + esc(m.key) + '\" placeholder=\"DATABASE_URL\"' + (m.editing ? ' readonly style=\"opacity:.7\"' : '') + '></div>'\n      + '<div><label class=\"ks-muted\" style=\"display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px\">Value</label>'\n      + '<input id=\"f-value\" type=\"' + (m.is_secret ? 'password' : 'text') + '\" value=\"' + esc(m.value) + '\" placeholder=\"' + (m.is_secret ? '••••••••' : 'production') + '\"></div>'\n      + '<div><label class=\"ks-muted\" style=\"display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px\">Description (optional)</label>'\n      + '<input id=\"f-desc\" type=\"text\" value=\"' + esc(m.description) + '\" placeholder=\"Primary DB connection string\"></div>'\n      + '<div style=\"display:flex;align-items:end;padding-bottom:4px\"><label style=\"display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ks-body);cursor:pointer\">'\n      + '<input id=\"f-secret\" type=\"checkbox\"' + (m.is_secret ? ' checked' : '') + ' style=\"accent-color:var(--ks-info)\"> Mask as secret</label></div>'\n      + '</div>';\n    return '<div class=\"ks-ip-modal-overlay\" data-overlay=\"1\" style=\"position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease\">'\n      + '<div class=\"ks-ip-modal-panel\" style=\"background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:560px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column\" onclick=\"event.stopPropagation()\">'\n      + '<div class=\"ks-ip-modal-header\" style=\"display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10\">'\n      + '<h3 class=\"ks-ip-modal-title\" style=\"font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0\">' + (m.editing ? 'Edit “' + esc(m.editing.key) + '”' : 'Add variable') + '</h3>'\n      + '<button type=\"button\" class=\"ks-ip-modal-close ks-modal-close\" style=\"border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center\" aria-label=\"Close\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:20px;height:20px\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button></div>'\n      + '<div class=\"ks-ip-modal-body\" style=\"padding:20px 24px;display:flex;flex-direction:column;gap:16px\">' + inner + '</div>'\n      + '<div class=\"ks-ip-modal-footer\" style=\"display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)\">'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-ghost\" data-action=\"cancel\">Cancel</button>'\n      + '<button type=\"button\" class=\"ks-ip-btn ks-ip-btn-primary\" data-action=\"submit\"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : (m.editing ? 'Save' : 'Add variable')) + '</button>'\n      + '</div></div></div>';\n  }\n\n  function skeletonCard() {\n    return '<div class=\"ks-card\"><div style=\"height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n      + '<div style=\"height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n      + '<div style=\"height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div></div>';\n  }\n\n  function render() {\n    var ae = document.activeElement;\n    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))\n      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }\n      : null;\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Env &amp; Secrets</h2>'\n      + '<div style=\"display:flex;gap:8px\">'\n      + '<button title=\"Add\" aria-label=\"Add\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"add\"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg></button>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"' + (state.loading ? ' disabled' : '') + '><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div></div>';\n\n    if (state.error) html += '<p style=\"font-size:12px;color:var(--ks-bad);margin-top:10px\">' + esc(state.error) + '</p>';\n\n    html += '<div style=\"margin-top:12px\">';\n\n    if (state.loading) {\n      html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px\">';\n      for (var i = 0; i < 3; i++) html += skeletonCard();\n      html += '</div>';\n    } else if (state.secrets.length === 0) {\n      html += '<p class=\"ks-muted\" style=\"font-size:12px;padding:6px 12px;margin:0\">No variables stored. Click “Add” to add one.</p>';\n    } else {\n      html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px\">';\n      state.secrets.forEach(function (s) {\n        var shown;\n        if (s.is_secret) shown = state.revealed[s.key] != null ? state.revealed[s.key] : (s.masked_value || '••••');\n        else shown = s.value || '—';\n        html += '<div class=\"ks-card\" data-ks-key=\"' + esc(s.key) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n          + '<div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:8px\">'\n          + '<div style=\"min-width:0\"><div style=\"font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + esc(s.key) + '</div>'\n          + '<span class=\"ks-badge\" style=\"margin-top:4px;color:' + (s.is_secret ? 'var(--ks-warn)' : 'var(--ks-info)') + ';border-color:' + (s.is_secret ? 'var(--ks-warn-line)' : 'var(--ks-info-line)') + '\">' + (s.is_secret ? 'secret' : 'env') + '</span></div>'\n          + '<div style=\"display:flex;gap:4px;flex-shrink:0\">'\n          + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-edit=\"\' + esc(s.key) + \'\" title=\"Edit\" aria-label=\"Edit\">✎</button>'\n          + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\" style=\"color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important\" data-del=\"\' + esc(s.key) + \'\" title=\"Delete\" aria-label=\"Delete\">🗑</button>'\n          + '</div></div>'\n          + '<div style=\"display:flex;align-items:flex-start;gap:8px\"><span class=\"ks-mono ks-muted\" style=\"font-size:12px;flex-shrink:0\">Value:</span>'\n          + '<span class=\"ks-mono\" style=\"font-size:12px;color:var(--ks-body);word-break:break-all;white-space:pre-wrap\">' + esc(shown)\n          + (s.is_secret && state.revealed[s.key] == null ? ' <button type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-reveal=\"\' + esc(s.key) + \'\" style=\"padding:1px 6px;font-size:10px\" title=\"Reveal\" aria-label=\"Reveal\">reveal</button>' : '')\n          + '</span></div>'\n          + (s.description ? '<div style=\"display:flex;align-items:flex-start;gap:8px\"><span class=\"ks-mono ks-muted\" style=\"font-size:12px;flex-shrink:0\">Description:</span><span style=\"font-size:12px;color:var(--ks-body);word-break:break-all\">' + esc(s.description) + '</span></div>' : '')\n          + '<div style=\"display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-muted)\"><span class=\"ks-mono\">Updated:</span><span style=\"color:var(--ks-secondary)\">' + timeAgo(s.updated_at) + '</span></div>'\n          + '</div>';\n      });\n      html += '</div>';\n    }\n    html += '</div>';\n    html += buildModal();\n    document.getElementById('root').innerHTML = html;\n    wire();\n    restoreFocus(prevFocus);\n  }\n\n  function wire() {\n    var bind = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) { b.addEventListener('click', fn); }); };\n    bind('[data-action=\"refresh\"]', load);\n    bind('[data-action=\"add\"]', function () {\n      state.formError = '';\n      state.modal = { key: '', value: '', is_secret: true, description: '', editing: null };\n      render(); focusField('f-key');\n    });\n    bind('[data-reveal]', function (ev) { reveal(ev.currentTarget.getAttribute('data-reveal')); });\n    bind('[data-del]', function (ev) { remove(ev.currentTarget.getAttribute('data-del')); });\n    bind('[data-edit]', function (ev) {\n      var key = ev.currentTarget.getAttribute('data-edit');\n      var s = state.secrets.filter(function (x) { return x.key === key; })[0];\n      if (!s) return;\n      state.formError = '';\n      state.modal = { key: s.key, value: s.value || '', is_secret: !!s.is_secret, description: s.description || '', editing: s };\n      render(); focusField('f-key');\n    });\n\n    var overlay = document.querySelector('[data-overlay]');\n    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });\n    var cb = document.querySelector('.ks-modal-close');\n    if (cb) cb.addEventListener('click', closeModal);\n    var cancel = document.querySelector('[data-action=\"cancel\"]');\n    if (cancel) cancel.addEventListener('click', closeModal);\n    var sub = document.querySelector('[data-action=\"submit\"]');\n    if (sub) sub.addEventListener('click', submitModal);\n  }\n  // Field values sync through DELEGATED listeners bound once at startup so\n  // re-renders (busy state, failed save, background load finishing) can never\n  // desync what the operator typed from state. See Automation for detail.\n  function wireFields() {\n    var FIELDS = {\n      'f-key': function (v) { state.modal.key = v.trim(); },\n      'f-value': function (v) { state.modal.value = v; },\n      'f-desc': function (v) { state.modal.description = v; }\n    };\n    document.addEventListener('input', function (ev) {\n      var t = ev.target;\n      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);\n    }, true);\n    // Toggling \"mask as secret\" swaps the value input's type, so re-render.\n    document.addEventListener('change', function (ev) {\n      var t = ev.target;\n      if (t && t.id === 'f-secret' && state.modal) {\n        state.modal.is_secret = t.checked;\n        render();\n        restoreFocus({ id: 'f-secret', pos: null });\n      }\n    }, true);\n  }\n  function focusField(id) {\n    var f = document.getElementById(id);\n    if (!f) return;\n    f.focus();\n    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}\n  }\n  function restoreFocus(prev) {\n    if (!prev || !prev.id) return;\n    var f = document.getElementById(prev.id);\n    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;\n    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }\n    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {\n      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}\n    }\n  }\n  function closeModal() { state.modal = null; state.formError = ''; render(); }\n\n  function start(s) { sdk = s; wireFields(); load(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n\n  var st = document.createElement('style');\n  st.textContent = '@keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}';\n  document.head.appendChild(st);\n})();\n</script>\n";
const LIB_COMPLETEEXAMPLE_BLOCKS = "[{\"type\": \"heading\", \"value\": \"Welcome to My Custom Page\", \"level\": 1, \"align\": \"center\"}, {\"type\": \"text\", \"value\": \"This page demonstrates all three content types available in KS Panel instance pages. You can use HTML, Markdown, or Visual Blocks to create rich content.\", \"align\": \"center\"}, {\"type\": \"divider\"}, {\"type\": \"heading\", \"value\": \"HTML Content Example\", \"level\": 2}, {\"type\": \"text\", \"value\": \"Switch content_type to 'html' and use the content_html field for raw HTML with full styling control.\"}, {\"type\": \"code\", \"value\": \"<div class=\\\"p-4 bg-blue-900/30 rounded-lg\\\">\\n  <h2 class=\\\"text-xl font-bold text-blue-300\\\">Custom HTML Card</h2>\\n  <p class=\\\"text-blue-100\\\">Styled with Tailwind classes</p>\\n</div>\"}, {\"type\": \"divider\"}, {\"type\": \"heading\", \"value\": \"Markdown Content Example\", \"level\": 2}, {\"type\": \"text\", \"value\": \"Switch content_type to 'markdown' and use the content_markdown field for easy writing.\"}, {\"type\": \"code\", \"value\": \"# Markdown Title\\n\\n## Subsection\\n\\n- List item 1\\n- List item 2\\n- **Bold** and *italic* text\\n\\n`inline code` and:\\n\\n```bash\\necho 'code blocks'\\n```\"}, {\"type\": \"divider\"}, {\"type\": \"heading\", \"value\": \"Visual Blocks (Current)\", \"level\": 2}, {\"type\": \"text\", \"value\": \"This page uses 'blocks' content_type. The content_blocks field contains a JSON array of block objects. Each block has a type and value.\"}, {\"type\": \"heading\", \"value\": \"Supported Block Types\", \"level\": 3}, {\"type\": \"text\", \"value\": \"\u2022 heading - with level (1-3) and align (left/center/right)\\n\u2022 text - with align option\\n\u2022 image - with value as URL\\n\u2022 button - with value as label and href as link\\n\u2022 code - displays formatted code\\n\u2022 spacer - adds vertical space\\n\u2022 divider - horizontal rule\"}, {\"type\": \"button\", \"value\": \"Open Studio\", \"href\": \"/instance-pages/studio\"}, {\"type\": \"spacer\"}, {\"type\": \"heading\", \"value\": \"Interactive Elements\", \"level\": 2}, {\"type\": \"text\", \"value\": \"Buttons can link to external URLs or internal panel routes. Images render directly. Code blocks have syntax highlighting.\"}, {\"type\": \"image\", \"value\": \"data:image/svg+xml;utf8,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='600'%20height='200'><rect%20width='600'%20height='200'%20fill='%231e293b'/><text%20x='300'%20y='105'%20fill='%2364748b'%20font-family='monospace'%20font-size='20'%20text-anchor='middle'>Custom%20Page%20Image</text></svg>\"}, {\"type\": \"code\", \"value\": \"// This code block shows in a monospace font\\nfunction greet(name) {\\n  return `Hello, ${name}!`;\\n}\\n\\nconsole.log(greet('KS Panel'));\", \"align\": \"left\"}]";


const LIB_HOME_HTML = "<div id=\"root\"><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:16px\"><div class=\"ks-skeleton-avatar\" style=\"width:48px;height:48px;border-radius:12px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:16px;width:36%\"></div><div style=\"display:flex;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:68px;border-radius:9999px\"></div><div class=\"ks-skeleton-bar\" style=\"height:14px;width:52px;border-radius:9999px\"></div></div></div><div class=\"ks-skeleton-bar\" style=\"height:18px;width:42px\"></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:52%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:34%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:48%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:38%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:44%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:32%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:56%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:36%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:42%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:30%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:36%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:52%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:40%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48%\"></div></div></div><div class=\"ks-card\" style=\"display:flex;align-items:center;gap:14px\"><div class=\"ks-skeleton-avatar\" style=\"width:40px;height:40px;border-radius:8px\"></div><div style=\"flex:1;display:flex;flex-direction:column;gap:6px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:38%\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:44%\"></div></div></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:28%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:88%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:76%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:32%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:92%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:84%\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n\n  function fmtBytes(bytes) {\n    var n = typeof bytes === 'number' ? bytes : parseFloat(bytes);\n    if (!isFinite(n) || n < 0) return null;\n    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = n;\n    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }\n    return (i >= 3 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];\n  }\n  function cleanExternalId(raw) {\n    if (!raw) return '';\n    var trimmed = String(raw).trim();\n    var m = trimmed.match(/[0-9a-f]{12,64}/gi);\n    if (m && m.length) return m[m.length - 1];\n    var lines = trimmed.split(/\\r?\\n/).map(function (l) { return l.trim(); }).filter(Boolean);\n    return (lines[lines.length - 1] || trimmed).slice(0, 64);\n  }\n  function statusMeta(s) {\n    var map = {\n      running: { label: 'Running', dot: 'var(--ks-ok)', badge: 'ks-badge ks-ok' },\n      stopped: { label: 'Stopped', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' },\n      creating: { label: 'Creating', dot: 'var(--ks-warn)', badge: 'ks-badge ks-warn' },\n      installing: { label: 'Installing', dot: 'var(--ks-info)', badge: 'ks-badge' },\n      errored: { label: 'Errored', dot: 'var(--ks-bad)', badge: 'ks-badge ks-bad' },\n      install_failed: { label: 'Install failed', dot: 'var(--ks-bad)', badge: 'ks-badge ks-bad' },\n      destroyed: { label: 'Destroyed', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' }\n    };\n    return map[s] || { label: s || '—', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' };\n  }\n  function kindSvg(kind) {\n    var p;\n    if (kind === 'docker') p = '<path d=\"M3 5h7v5H3z\"/><path d=\"M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2\"/><path d=\"M3 8v8h7V8\"/><path d=\"M3 12h7\"/>';\n    else if (kind === 'lxd') p = '<path d=\"M4 7 12 3l8 4v10l-8 4-8-4z\"/><path d=\"M4 7l8 4 8-4\"/><path d=\"M12 11v10\"/>';\n    else if (kind === 'kvm') p = '<rect x=\"3\" y=\"4\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M7 20h10\"/><path d=\"M9 8l4 3-4 3z\"/>';\n    else if (kind === 'multipass') p = '<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>';\n    else p = '<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 9h.01M15 9h.01M9 15h6\"/>';\n    return '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:24px;height:24px\">' + p + '</svg>';\n  }\n  function icon(inner, sz) {\n    return '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:' + (sz || 20) + 'px;height:' + (sz || 20) + 'px\">' + inner + '</svg>';\n  }\n  function tile(ic, value, label, hint, accent) {\n    return '<div class=\"ks-card\" data-ks-key=\"' + esc(label) + '\" style=\"display:flex;align-items:center;gap:14px\">'\n      + '<div style=\"flex-shrink:0;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);background:var(--ks-card-bg);color:' + accent + '\">' + ic + '</div>'\n      + '<div style=\"min-width:0\">'\n      + '<div style=\"font-size:17px;font-weight:600;color:var(--ks-heading);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + value + '</div>'\n      + '<div class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.03em;margin-top:2px\">' + esc(label) + '</div>'\n      + (hint ? '<div class=\"ks-muted\" style=\"font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + esc(hint) + '</div>' : '')\n      + '</div></div>';\n  }\n\n  // ---- Install banner -------------------------------------------------\n  function installBanner(state, step, error, stepsJSON) {\n    var steps = [];\n    try { var parsed = JSON.parse(stepsJSON || ''); if (Array.isArray(parsed)) steps = parsed; } catch (e) { /* ignore */ }\n    var isRunning = state === 'running'; var isFailed = state === 'failed';\n    var total = steps.length; var curIdx = step >= 0 ? step : -1;\n    var stepVisual = function (st) {\n      switch (st) {\n        case 'done': return { c: 'var(--ks-ok)', t: 'done' };\n        case 'running': return { c: 'var(--ks-info)', t: 'running' };\n        case 'skipped': case 'nonfatal': return { c: 'var(--ks-warn)', t: st };\n        case 'failed': return { c: 'var(--ks-bad)', t: 'failed' };\n        default: return { c: 'var(--ks-faint)', t: 'pending' };\n      }\n    };\n    var html = '<div class=\"ks-card\" data-ks-key=\"install-banner\" style=\"border-color:' + (isFailed ? 'var(--ks-bad-line)' : 'var(--ks-info-line)') + '\">'\n      + '<div style=\"display:flex;align-items:center;gap:12px\">'\n      + icon('<path d=\"M21 12a9 9 0 1 1-6.2-8.5\"/>')\n      + '<div style=\"min-width:0;flex:1\">'\n      + '<div style=\"font-size:13px;font-weight:600;color:' + (isFailed ? 'var(--ks-bad)' : 'var(--ks-info)') + '\">' + (isFailed ? 'Install workflow failed' : isRunning ? 'Installing…' : 'Install workflow')\n      + (total > 0 ? ' <span class=\"ks-muted\" style=\"font-size:11px;font-family:ui-monospace,monospace;margin-left:6px\">' + (curIdx >= 0 ? 'step ' + (curIdx + 1) + '/' + total : total + ' step' + (total === 1 ? '' : 's')) + '</span>' : '')\n      + '</div>'\n      + (isFailed && error\n        ? '<p class=\"ks-mono\" style=\"font-size:11px;color:var(--ks-bad);margin:4px 0 0;word-break:break-all\">' + esc(error) + '</p>'\n        : '<p class=\"ks-muted\" style=\"font-size:11px;margin:2px 0 0;\">' + (isRunning ? 'The edge is running the template install steps inside the container. The instance flips to Running once they finish.' : 'Install workflow tracking for this instance.') + '</p>')\n      + '</div></div>';\n    if (total > 0) {\n      html += '<ul style=\"list-style:none;padding:0;margin:12px 0 0\">';\n      for (var k = 0; k < total; k++) {\n        var s = steps[k] || {}; var v = stepVisual(s.status);\n        html += '<li style=\"display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:3px 0\">'\n          + '<span style=\"margin-top:5px;flex-shrink:0;width:8px;height:8px;border-radius:50%;background:' + v.c + (s.status === 'running' ? ';animation:ks-pulse 1.2s ease-in-out infinite' : '') + '\"></span>'\n          + '<div style=\"min-width:0;flex:1\">'\n          + '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap\">'\n          + '<span class=\"ks-mono ks-muted\">#' + ((s.index != null ? s.index : k) + 1) + '</span>'\n          + '<span style=\"color:var(--ks-body)\">' + esc(s.action || 'step') + '</span>'\n          + '<span style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:' + v.c + '\">' + v.t + '</span>'\n          + (typeof s.exit_code === 'number' && s.exit_code !== 0 ? '<span class=\"ks-mono ks-muted\" style=\"font-size:10px\">exit ' + s.exit_code + '</span>' : '')\n          + '</div>';\n        if (s.status === 'failed' && s.stderr) {\n          var errLines = String(s.stderr).split('\\n').filter(Boolean).slice(0, 4).join('\\n');\n          html += '<pre class=\"ks-mono\" style=\"margin:4px 0 0;font-size:10px;color:var(--ks-bad);background:var(--ks-bad-wash);border:1px solid var(--ks-bad-line);border-radius:4px;padding:4px 6px;white-space:pre-wrap;word-break:break-all\">' + esc(errLines) + '</pre>';\n        }\n        html += '</div></li>';\n      }\n      html += '</ul>';\n    }\n    html += '</div>';\n    return html;\n  }\n\n  // ---- Actions card ----------------------------------------------------\n  function actionStateList(a) {\n    var raw = a ? a.allowed_states : null;\n    var arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() !== '' ? raw.split(',') : []);\n    return arr.map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }).filter(Boolean);\n  }\n  function actionStateOk(a, st) {\n    var toks = actionStateList(a);\n    if (toks.length === 0) return true;\n    return toks.indexOf(String(st == null ? '' : st).toLowerCase()) !== -1;\n  }\n  function actionIconHtml(a) {\n    var raw = a && typeof a.icon_svg === 'string' ? a.icon_svg.trim() : '';\n    if (!raw) return '';\n    var col = a && typeof a.icon_color === 'string' ? a.icon_color.trim() : '';\n    var open = '<span style=\"display:inline-flex;width:13px;height:13px;flex-shrink:0;align-items:center;justify-content:center' + (col ? ';color:' + col : '') + '\">';\n    if (raw.toLowerCase().indexOf('<svg') === 0) return open + raw + '</span> ';\n    return open + '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"width:13px;height:13px;display:block\">' + raw + '</svg></span> ';\n  }\n  function actionsCard(inst) {\n    var cfgActions = [];\n    try { cfgActions = Array.isArray(inst.config.actions) ? inst.config.actions : []; } catch (e) { cfgActions = []; }\n    window.__ksVisibleActions = cfgActions.filter(function (a) { return a && typeof a.id === 'string' && a.id.trim() !== '' && a.user_invokable !== false; });\n    var visible = window.__ksVisibleActions;\n    if (visible.length === 0) return '';\n\n    var workflowInFlight = !!inst && inst.install_state === 'running';\n    var runningActionId = workflowInFlight && inst.install_kind === 'action' ? inst.install_action_id : '';\n    var busy = window.__ksBusyAction || null;\n    var stopPending = window.__ksStopAction || null;\n\n    var btns = '';\n    for (var i = 0; i < visible.length; i++) {\n      var a = visible[i];\n      var subs = [];\n      if (a.auto_start_instance) subs.push('auto-start');\n      if (a.auto_stop_on_exit) subs.push('stop on exit');\n      if (a.restart_on_failure) subs.push('restart on crash');\n      var isThisRunning = workflowInFlight && runningActionId === a.id;\n      var isBusy = busy === a.id;\n      var stopping = isThisRunning && stopPending === a.id;\n      var stateOk = actionStateOk(a, inst.status);\n      var stateList = actionStateList(a).join(', ');\n      var disabled = (workflowInFlight && !isThisRunning) || isBusy || stopping || (!isThisRunning && !stateOk);\n      var spin = (isBusy || isThisRunning || stopping)\n        ? '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"width:13px;height:13px;animation:ks-spin 1s linear infinite;opacity:.9;flex-shrink:0\"><circle cx=\"12\" cy=\"12\" r=\"10\" stroke-width=\"3\" opacity=\".25\"/><path d=\"M12 2 A10 10 0 0 1 22 12\"/></svg> '\n        : '';\n      btns += '<button type=\"button\" data-act=\"' + esc(a.id) + '\" ' + (disabled ? 'disabled' : '')\n        + ' title=\"' + esc(isThisRunning ? (a.stop_command ? ('Stop: runs \"' + a.stop_command + '\" inside the container') : 'Stop the running action') : ((!stateOk && stateList) ? ('Available in: ' + stateList) : (a.description || subs.join(' · ') || a.name || a.id))) + '\"'\n        + ' style=\"display:flex;flex-direction:column;align-items:flex-start;gap:2px;border-radius:8px;padding:8px 12px;text-align:left;min-width:10rem;'\n        + (isThisRunning\n          ? 'border:1px solid var(--ks-bad-line);background:var(--ks-bad-wash);color:var(--ks-bad)'\n          : disabled\n            ? 'border:1px solid var(--ks-card-border);background:transparent;color:var(--ks-faint);cursor:not-allowed'\n            : 'border:1px solid var(--ks-ok-line);background:var(--ks-ok-wash);color:var(--ks-ok)')\n        + '\">'\n        + '<span style=\"font-size:13px;font-weight:500;line-height:1.2;display:flex;align-items:center;gap:6px\">' + spin + (isThisRunning || isBusy || stopping ? '' : actionIconHtml(a)) + esc(isThisRunning ? ('Stop ' + (a.name || a.id)) : (a.name || a.id)) + '</span>'\n        + (isThisRunning\n          ? '<span style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-bad-soft)\">' + (stopping ? 'stopping…' : 'running — click to stop') + '</span>'\n          : ((!stateOk && stateList) ? '<span style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-warn-soft)\">only in ' + esc(stateList) + '</span>' : (subs.length ? '<span class=\"ks-muted\" style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em\">' + esc(subs.join(' · ')) + '</span>' : '')))\n        + '</button>';\n    }\n    var html = '<div class=\"ks-card\" data-ks-key=\"actions\">'\n      + '<h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Actions</h3>'\n      + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 12px\">One-click commands defined by this instance\\u2019s template. They run inside the container; the panel auto-starts a stopped container if the action declares it. Click an action a second time while it\\u2019s running to stop it.</p>'\n      + '<div style=\"display:flex;flex-wrap:wrap;gap:8px\">' + btns + '</div>'\n      + (workflowInFlight && !runningActionId ? '<p style=\"font-size:12px;color:var(--ks-warn-soft);margin:12px 0 0\">An install or action workflow is in progress — buttons disabled until it resolves.</p>' : '')\n      + (window.__ksActionError ? '<p style=\"font-size:12px;color:var(--ks-bad);margin:12px 0 0;word-break:break-word\"><b>Action failed:</b> ' + esc(window.__ksActionError) + '</p>' : '')\n      + '</div>';\n    return html;\n  }\n\n  // ---- render ----------------------------------------------------------\n  var metrics = null; var metricsError = null;\n\n  function render() {\n    var inst = sdk.instance;\n    var sm = statusMeta(inst.status);\n    var extId = cleanExternalId(inst.external_id);\n    var isLive = inst.status === 'running';\n    var stoppedOrDestroyed = inst.status === 'stopped' || inst.status === 'destroyed';\n    var memUsed = stoppedOrDestroyed ? 0 : (metrics && metrics.mem_used != null ? metrics.mem_used : null);\n    var memTotal = stoppedOrDestroyed ? 0 : (metrics && metrics.mem_total != null ? metrics.mem_total : null);\n    var diskUsed = stoppedOrDestroyed ? 0 : (metrics && metrics.disk_used != null ? metrics.disk_used : null);\n    var diskTotal = stoppedOrDestroyed ? 0 : (metrics && metrics.disk_total != null ? metrics.disk_total : null);\n    var cpuPct = stoppedOrDestroyed ? 0 : (metrics ? (metrics.cpu_pct != null ? metrics.cpu_pct : (metrics.cpu != null ? metrics.cpu : null)) : null);\n\n    var dashIcon = icon('<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>');\n    var nodeIcon = icon('<rect x=\"2\" y=\"3\" width=\"20\" height=\"6\" rx=\"2\"/><rect x=\"2\" y=\"13\" width=\"20\" height=\"8\" rx=\"2\"/><line x1=\"6\" y1=\"6\" x2=\"6.01\" y2=\"6\"/><line x1=\"6\" y1=\"17\" x2=\"6.01\" y2=\"17\"/>');\n    var tplIcon = icon('<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><line x1=\"3\" y1=\"9\" x2=\"21\" y2=\"9\"/><line x1=\"9\" y1=\"21\" x2=\"9\" y2=\"9\"/>');\n    var ownIcon = icon('<path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>');\n    var cpuIcon = icon('<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"1.5\"/><path d=\"M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2\"/>');\n    var memIcon = icon('<rect x=\"2\" y=\"8\" width=\"20\" height=\"9\" rx=\"1.5\"/><path d=\"M6 8v3M10 8v3M14 8v3M18 8v3\"/>');\n    var dskIcon = icon('<ellipse cx=\"12\" cy=\"5.5\" rx=\"8\" ry=\"3\"/><path d=\"M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6\"/>');\n\n    var tiles = ''\n      + tile('<span style=\"width:12px;height:12px;border-radius:50%;background:' + sm.dot + ';' + (isLive ? 'animation:ks-pulse 1.5s ease-in-out infinite' : '') + '\"></span>', '<span style=\"text-transform:capitalize\">' + esc(sm.label) + '</span>', 'Status', isLive ? 'live & reachable' : 'not running', isLive ? 'var(--ks-ok)' : 'var(--ks-faint)')\n      + tile(dashIcon, '<span style=\"text-transform:capitalize\">' + esc(inst.kind || '—') + '</span>', 'Kind', (inst.config && inst.config.image) || 'no image', 'var(--ks-info)')\n      + tile(nodeIcon, esc(inst.node_name || ('#' + (inst.node_id != null ? inst.node_id : '?'))), 'Node', 'hosting edge', 'var(--ks-ok)')\n      + tile(tplIcon, inst.template_name ? esc(inst.template_name) : '<span class=\"ks-muted\">deleted</span>', 'Template', 'deployed from', 'var(--ks-purple)')\n      + tile(ownIcon, inst.owner_name ? esc(inst.owner_name) : (inst.owner_id ? '<span class=\"ks-mono\">#' + inst.owner_id + '</span>' : '<span class=\"ks-muted\">unattributed</span>'), 'Owner', 'allocated to', 'var(--ks-warn)')\n      + tile(cpuIcon, '<span class=\"ks-mono\">' + (cpuPct != null ? cpuPct + '%' : '—') + '</span>', 'CPU', cpuPct != null ? 'usage / total' : 'unavailable', 'var(--ks-info)')\n      + tile(memIcon, '<span class=\"ks-mono\">' + (memUsed != null ? fmtBytes(memUsed) : '—') + '</span>', 'Memory', memUsed != null && memTotal != null ? fmtBytes(memUsed) + ' / ' + fmtBytes(memTotal) : 'unavailable', 'var(--ks-ok)')\n      + tile(dskIcon, '<span class=\"ks-mono\">' + (diskUsed != null ? fmtBytes(diskUsed) : '—') + '</span>', 'Disk', diskUsed != null && diskTotal != null ? fmtBytes(diskUsed) + ' / ' + fmtBytes(diskTotal) : 'unavailable', 'var(--ks-warn)');\n\n    var html = ''\n      + '<div class=\"ks-card\" style=\"display:flex;align-items:center;gap:16px\">'\n      + '<div style=\"flex-shrink:0;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);background:var(--ks-card-bg);color:var(--ks-info)\">' + kindSvg(inst.kind) + '</div>'\n      + '<div style=\"min-width:0;flex:1;display:flex;align-items:center;gap:8px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + esc(inst.name) + '</h2>'\n      + '<span class=\"' + sm.badge + '\" style=\"display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 8px\"><span style=\"width:6px;height:6px;border-radius:50%;background:' + sm.dot + (isLive ? ';animation:ks-pulse 1.5s ease-in-out infinite' : '') + '\"></span>' + sm.label + '</span>'\n      + '<span class=\"ks-badge\" style=\"text-transform:capitalize\">' + esc(inst.kind) + '</span>'\n      + '</div>'\n      + '<div style=\"text-align:right;flex-shrink:0\"><div class=\"ks-muted\" style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em\">Instance</div><div class=\"ks-mono\" style=\"font-size:13px;color:var(--ks-body)\">#' + inst.id + '</div></div>'\n      + '</div>';\n\n    if (metricsError) {\n      html += '<div class=\"ks-card\" style=\"border-color:var(--ks-warn-line)!important;display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ks-warn)\">'\n        + icon('<path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/>', 16)\n        + '<div style=\"min-width:0\"><b>Metrics unavailable</b><span style=\"color:var(--ks-warn-soft);margin-left:6px;word-break:break-word\">' + esc(metricsError) + '</span>'\n        + '<div style=\"color:var(--ks-warn-soft);margin-top:2px\">Resource tiles show no data; the rest of the page is unaffected.</div></div></div>';\n    }\n\n    html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px\">' + tiles + '</div>';\n\n    if (inst.suspended === 1 || inst.suspended === true) {\n      html += '<div class=\"ks-card\" style=\"border-color:var(--ks-bad-line)!important;display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ks-bad)\">'\n        + icon('<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"/><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"/>', 16)\n        + '<div style=\"min-width:0\"><b>Suspended</b><span style=\"color:var(--ks-bad-soft);margin-left:6px\">This instance is suspended' + (inst.suspended_until ? ' until ' + new Date(inst.suspended_until).toLocaleString() : '') + '</span></div></div>';\n    }\n\n    if ((inst.install_state === 'running' || inst.install_state === 'failed') && inst.install_kind !== 'action') {\n      html += installBanner(inst.install_state || '', typeof inst.install_step === 'number' ? inst.install_step : -1, inst.install_error || '', inst.install_steps_json || '');\n    }\n\n    html += '<div id=\"actions-holder\">' + actionsCard(inst) + '</div>';\n\n    html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px\">'\n      + '<div class=\"ks-card\" data-ks-key=\"identity\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Identity</h3><p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">What this instance is and how the panel references it.</p>'\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--ks-card-border)\">'\n      + '<span class=\"ks-muted\" style=\"font-size:13px\">External ID</span>'\n      + '<span style=\"font-size:13px;display:inline-flex;align-items:center;gap:6px\">'\n      + (extId\n        ? '<span class=\"ks-mono ks-muted\" style=\"font-size:12px;max-width:14ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\" title=\"' + esc(extId) + '\">' + esc(extId) + '</span>'\n          + '<button type=\"button\" id=\"copy-ext\" title=\"Copy external ID\" style=\"width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:4px;background:transparent;color:var(--ks-muted);cursor:pointer\">'\n          + icon('<rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1\"/>', 12) + '</button>'\n        : '<span class=\"ks-mono ks-muted\" style=\"font-size:12px\">—</span>')\n      + '</span></div></div>'\n      + '<div class=\"ks-card\" data-ks-key=\"lifecycle\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Lifecycle</h3><p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">Provenance and timing for this deployment.</p>'\n      + '<div style=\"display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ks-card-border)\"><span class=\"ks-muted\" style=\"font-size:13px\">Created</span><span style=\"font-size:13px;color:var(--ks-secondary)\">' + (inst.created_at ? new Date(inst.created_at).toLocaleString() : '—') + '</span></div>'\n      + '<div style=\"display:flex;justify-content:space-between;padding:8px 0\"><span class=\"ks-muted\" style=\"font-size:13px\">Updated</span><span style=\"font-size:13px;color:var(--ks-secondary)\">' + (inst.updated_at ? new Date(inst.updated_at).toLocaleString() : '—') + '</span></div>'\n      + '</div></div>';\n\n    document.getElementById('root').innerHTML = html;\n\n    var cp = document.getElementById('copy-ext');\n    if (cp) cp.addEventListener('click', function () {\n      copyText(sdk, extId, 'Copied to clipboard');\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('#actions-holder button[data-act]'), function (btn) {\n      btn.addEventListener('click', function () {\n        if (window.__ksBusyAction || window.__ksStopAction) return; // debounce double clicks\n        var act = btn.getAttribute('data-act');\n        var def = (window.__ksVisibleActions || []).filter(function (x) { return x.id === act; })[0];\n        if (!def) return;\n        var inst2 = sdk.instance;\n        var workflowInFlight = !!inst2 && inst2.install_state === 'running';\n        var runningId = workflowInFlight && inst2.install_kind === 'action' ? inst2.install_action_id : '';\n        if (act !== runningId && !actionStateOk(def, inst2.status)) { window.__ksActionError = 'Available in: ' + actionStateList(def).join(', '); render(); return; }\n        if (act === runningId) {\n          window.__ksStopAction = act;\n          sdk.fetchPanel('/api/instances/' + inst2.id + '/actions/' + encodeURIComponent(act) + '/stop', { method: 'POST' })\n            .catch(function (e) { window.__ksActionError = e.message || String(e); })\n            .then(function () { window.__ksStopAction = null; refresh(); });\n        } else {\n          window.__ksBusyAction = act; window.__ksActionError = null; render();\n          sdk.fetchPanel('/api/instances/' + inst2.id + '/actions/' + encodeURIComponent(act) + '/invoke', { method: 'POST' })\n            .catch(function (e) { window.__ksActionError = e.message || String(e); })\n            .then(function () { window.__ksBusyAction = null; refresh(); });\n        }\n      });\n    });\n  }\n\n\n  function fallbackCopy(text) {\n    try {\n      var ta = document.createElement('textarea');\n      ta.value = text;\n      ta.setAttribute('readonly', '');\n      ta.style.position = 'fixed';\n      ta.style.opacity = '0';\n      document.body.appendChild(ta);\n      ta.select();\n      var ok = document.execCommand('copy');\n      document.body.removeChild(ta);\n      return ok;\n    } catch (e) { return false; }\n  }\n  // copyText reports honestly: the sandboxed iframe may deny the async\n  // Clipboard API, so fall back to execCommand and toast the real result.\n  function copyText(sdk2, text, okMsg) {\n    var done = function (ok) { try { sdk2.toast(ok ? okMsg : 'Copy failed', ok ? 'success' : 'error'); } catch (e) { /* ignore */ } };\n    if (navigator.clipboard && navigator.clipboard.writeText) {\n      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });\n    } else {\n      done(fallbackCopy(text));\n    }\n  }\n  // ---- polling -----------------------------------------------------------\n  var pollSeq = 0;\n  function refresh() {\n    var seq = ++pollSeq;\n    sdk.fetchPanel('/api/instances/' + sdk.instance.id).then(function (row) {\n      if (seq !== pollSeq || !row || !row.id) return;\n      // Merge live row fields over the static context so status / install\n      // tracking stays current without losing SDK-only fields.\n      Object.assign(sdk.instance, row);\n      if (typeof row.config === 'string') {\n        try { sdk.instance.config = JSON.parse(row.config); } catch (e) { /* keep old */ }\n      }\n      render();\n    }).catch(function () { /* transient — keep last known state */ });\n\n    sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/metrics').then(function (m) {\n      if (seq !== pollSeq) return;\n      metrics = m || {}; metricsError = null; render();\n    }).catch(function (e) {\n      if (seq !== pollSeq) return;\n      var msg = (e && e.message) ? e.message : String(e);\n      if (!metrics || metricsError) { metricsError = msg; render(); }\n    });\n  }\n\n  function start(s) {\n    sdk = s;\n    render();\n    refresh();\n    setInterval(refresh, 4000);\n  }\n\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n\n  var st = document.createElement('style');\n  st.textContent = '@keyframes ks-spin{to{transform:rotate(360deg)}}@keyframes ks-pulse{0%,100%{opacity:1}50%{opacity:.35}}';\n  document.head.appendChild(st);\n})();\n</script>\n";

const LIB_HTMLDASHBOARD_HTML = "<div style=\"display:flex;flex-direction:column;gap:16px\">\n  <div class=\"ks-row\" style=\"justify-content:space-between\">\n    <h1 style=\"font-size:24px;font-weight:700;color:var(--ks-heading);margin:0\">Server Dashboard</h1>\n    <span class=\"ks-badge\" style=\"color:var(--ks-ok);border-color:var(--ks-ok-line);background:var(--ks-ok-wash)\">Live</span>\n  </div>\n\n  <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px\">\n    <div class=\"ks-card\">\n      <div class=\"ks-row\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--ks-info)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:22px;height:22px\"><path d=\"M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2\"/></svg>\n        <span class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.04em\">CPU Usage</span>\n      </div>\n      <p class=\"ks-mono\" style=\"font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px\">42%</p>\n      <div class=\"ks-bar\"><span style=\"width:42%\"></span></div>\n    </div>\n    <div class=\"ks-card\">\n      <div class=\"ks-row\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--ks-ok)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:22px;height:22px\"><rect x=\"2\" y=\"8\" width=\"20\" height=\"9\" rx=\"1.5\"/><path d=\"M6 8v3M10 8v3M14 8v3M18 8v3\"/></svg>\n        <span class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.04em\">Memory</span>\n      </div>\n      <p class=\"ks-mono\" style=\"font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px\">2.4 / 8 GB</p>\n      <div class=\"ks-bar\"><span style=\"width:30%;background:var(--ks-ok)\"></span></div>\n    </div>\n    <div class=\"ks-card\">\n      <div class=\"ks-row\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--ks-warn)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:22px;height:22px\"><ellipse cx=\"12\" cy=\"5.5\" rx=\"8\" ry=\"3\"/><path d=\"M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6\"/><path d=\"M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6\"/></svg>\n        <span class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.04em\">Disk Usage</span>\n      </div>\n      <p class=\"ks-mono\" style=\"font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px\">45 / 200 GB</p>\n      <div class=\"ks-bar\"><span style=\"width:22%;background:var(--ks-warn)\"></span></div>\n    </div>\n    <div class=\"ks-card\">\n      <div class=\"ks-row\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"var(--ks-purple)\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:22px;height:22px\"><path d=\"M12 2a10 10 0 0 0-10 10c0 1.7.42 3.3 1.16 4.7L2 22l5.3-1.16A10 10 0 1 0 12 2Z\"/></svg>\n        <span class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.04em\">Network</span>\n      </div>\n      <p class=\"ks-mono\" style=\"font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px\">12.3 MB/s</p>\n      <p class=\"ks-muted\" style=\"font-size:10px;margin:0\">RX 7.9 \u00b7 TX 4.4 MB/s</p>\n    </div>\n  </div>\n\n  <div class=\"ks-card\">\n    <h2 style=\"font-size:15px;font-weight:600;color:var(--ks-heading);margin:0 0 10px\">Quick Actions</h2>\n    <div class=\"ks-row\">\n      <button type=\"button\" class=\"ks-btn\">Restart Service</button>\n      <button type=\"button\" class=\"ks-btn ks-btn-blue\">View Logs</button>\n      <button type=\"button\" class=\"ks-btn ks-btn-green\">Backup Now</button>\n      <button type=\"button\" class=\"ks-btn ks-btn-red\">Emergency Stop</button>\n    </div>\n  </div>\n\n  <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px\">\n    <div class=\"ks-card\">\n      <h3 style=\"font-size:14px;font-weight:500;color:var(--ks-heading);margin:0 0 10px\">Recent Activity</h3>\n      <div style=\"display:flex;flex-direction:column;gap:8px;font-size:13px\">\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span><span style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-ok);margin-right:8px\"></span>Deploy completed: web-app v2.1.0</span><span class=\"ks-muted\" style=\"font-size:11px;margin-left:auto;padding-left:8px\">2 min ago</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span><span style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-info);margin-right:8px\"></span>Backup created: daily-2026-08-20</span><span class=\"ks-muted\" style=\"font-size:11px;margin-left:auto;padding-left:8px\">15 min ago</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span><span style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-warn);margin-right:8px\"></span>Config updated: nginx.conf</span><span class=\"ks-muted\" style=\"font-size:11px;margin-left:auto;padding-left:8px\">1 hour ago</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span><span style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-ok);margin-right:8px\"></span>SSL cert renewed: example.com</span><span class=\"ks-muted\" style=\"font-size:11px;margin-left:auto;padding-left:8px\">3 hours ago</span></div>\n      </div>\n    </div>\n    <div class=\"ks-card\">\n      <h3 style=\"font-size:14px;font-weight:500;color:var(--ks-heading);margin:0 0 10px\">System Info</h3>\n      <div style=\"font-size:13px;display:flex;flex-direction:column;gap:8px\">\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">Hostname</span><span class=\"ks-mono\" style=\"color:var(--ks-body)\">server-01</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">OS</span><span style=\"color:var(--ks-body)\">Ubuntu 22.04 LTS</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">Kernel</span><span class=\"ks-mono\" style=\"color:var(--ks-body)\">5.15.0-105-generic</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">Uptime</span><span style=\"color:var(--ks-body)\">12 days, 4 hours</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">Docker</span><span style=\"color:var(--ks-body)\">24.0.7</span></div>\n        <div class=\"ks-row\" style=\"justify-content:space-between\"><span class=\"ks-muted\">Panel</span><span style=\"color:var(--ks-body)\">KS Panel v0.0.0</span></div>\n      </div>\n    </div>\n  </div>\n</div>";

const LIB_MARKDOWNDOCS_MD = "# Markdown Documentation Page\n\nThis page uses **Markdown** content type. Write documentation easily with standard markdown syntax.\n\n---\n\n## Features\n\n### Text Formatting\n- **Bold text** for emphasis\n- *Italic text* for subtle emphasis\n- `inline code` for commands\n- ~~Strikethrough~~ for deprecated items\n\n### Headings\n\n# Heading 1\n## Heading 2\n### Heading 3\n\n### Lists\n\n**Unordered:**\n- First item\n- Second item\n  - Nested item\n  - Another nested\n- Third item\n\n**Ordered:**\n1. First step\n2. Second step\n3. Third step\n\n### Code Blocks\n\n```bash\n# Shell commands\ndocker ps -a\nsystemctl restart nginx\njournalctl -u myapp -f\n```\n\n```yaml\n# YAML config\nservices:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"80:80\"\n    volumes:\n      - ./html:/usr/share/nginx/html\n```\n\n```python\n# Python example\ndef deploy_instance(template, node):\n    \"\"\"Deploy a new instance\"\"\"\n    instance = Instance.create(\n        name=template.name,\n        node=node,\n        spec=template.spec\n    )\n    return instance.start()\n```\n\n### Tables\n\n| Feature | Status | Version |\n|---------|--------|---------|\n| File Manager | \u2705 Ready | 1.2.0 |\n| Terminal | \u2705 Ready | 1.0.0 |\n| Metrics | \ud83d\udea7 Beta | 0.9.0 |\n| Backups | \u2705 Ready | 1.1.0 |\n| Automation | \ud83d\udea7 Beta | 0.8.0 |\n\n### Links & Images\n\n- [KS Panel GitHub](https://github.com/kspanel)\n- [Documentation](https://docs.kspanel.io)\n- Images: this text renderer shows markdown text only — use the HTML content type when a page needs images (offline-safe data: URIs work there too).\n\n### Blockquotes\n\n> **Note:** This is an important notice.\n> Markdown blockquotes are great for warnings, tips, and side notes.\n\n> **Tip:** Use the Studio to visually build pages without writing raw JSON.\n\n### Horizontal Rules\n\n---\n\n### Task Lists\n\n- [x] Create instance page\n- [x] Add markdown content\n- [ ] Test in panel\n- [ ] Link to template\n- [ ] Deploy test instance\n\n---\n\n## Deployment Guide\n\n### Prerequisites\n\n1. KS Panel installed and running\n2. At least one edge node connected\n3. Template created with desired spec\n\n### Steps\n\n1. **Create the page** - Use Studio or upload JSON\n2. **Link to template** - Go to Template \u2192 Pages tab\n3. **Deploy instance** - Select template with your page\n4. **Access page** - Navigate to Instance \u2192 Your Page\n\n### Troubleshooting\n\n| Issue | Solution |\n|-------|----------|\n| Page not showing | Check `enabled: true` in template spec |\n| Content not rendering | Verify `content_type` matches content |\n| 404 on custom slug | Ensure slug matches in spec and page |\n\n---\n\n*Last updated: 2026-08-20*";

const LIB_METRICS_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:98px\"></div><div style=\"display:flex;gap:8px\"><div class=\"ks-skeleton-bar\" style=\"height:28px;width:124px;border-radius:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:84px;border-radius:6px\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div></div><div class=\"ks-card\" style=\"margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px\"><div style=\"display:flex;align-items:center;gap:12px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:96px;border-radius:9999px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:168px\"></div></div><div style=\"display:flex;gap:14px\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:52px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48px\"></div></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:28%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:42%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:58%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:32%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:44%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:26%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:40%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:30%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:36%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:28%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:52%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:54%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:34%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:22px;width:58%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:60%;margin-bottom:8px\"></div><div class=\"ks-skeleton\" style=\"height:26px;width:100%\"></div></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:18%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64%;margin-bottom:12px\"></div><div class=\"ks-skeleton\" style=\"height:120px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:22%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:58%;margin-bottom:12px\"></div><div class=\"ks-skeleton\" style=\"height:120px;width:100%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:20%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:12px\"></div><div class=\"ks-skeleton\" style=\"height:120px;width:100%\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  var escf = function (s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); };\n  function tok(name, fb) { try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; } }\n\n  function fmtBytes(bytes) {\n    var n = typeof bytes === 'number' ? bytes : parseFloat(bytes);\n    if (!isFinite(n) || n < 0) return '\u2014';\n    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = n;\n    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }\n    return i >= 3 ? v.toFixed(1) + ' ' + units[i] : Math.round(v) + ' ' + units[i];\n  }\n  function fmtRate(bps) {\n    if (!isFinite(bps) || bps < 0) return '\u2014';\n    var units = ['B/s', 'KB/s', 'MB/s', 'GB/s']; var i = 0; var v = bps;\n    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }\n    return i >= 2 ? v.toFixed(1) + ' ' + units[i] : Math.round(v) + ' ' + units[i];\n  }\n  function fmtUptime(sec) {\n    if (sec == null || !isFinite(sec) || sec < 0) return '\u2014';\n    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);\n    if (d > 0) return d + 'd ' + h + 'h';\n    if (h > 0) return h + 'h ' + m + 'm';\n    return m + 'm';\n  }\n  function healthOf(p) {\n    if (p == null || !isFinite(p)) return 'unknown';\n    if (p >= 92) return 'danger';\n    if (p >= 80) return 'warn';\n    return 'healthy';\n  }\n  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }\n  function fmtClock(ms) {\n    var d = new Date(ms);\n    var pad = function(n){ return String(n).padStart(2,'0'); };\n    return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());\n  }\n  function predictNext(samples, n) {\n    n = n || 6;\n    if (samples.length < 2) return { slope: 0, intercept: samples[0] ? samples[0].v : 0 };\n    var last = samples.slice(-Math.min(n, samples.length));\n    var xs = last.map(function(_, i){ return i; });\n    var ys = last.map(function(s){ return s.v; });\n    var meanX = xs.reduce(function(a,b){ return a+b; },0)/xs.length;\n    var meanY = ys.reduce(function(a,b){ return a+b; },0)/ys.length;\n    var num=0, den=0;\n    for (var i=0;i<xs.length;i++){ num+=(xs[i]-meanX)*(ys[i]-meanY); den+=(xs[i]-meanX)*(xs[i]-meanX); }\n    var slope = den===0?0:num/den;\n    var intercept = meanY - slope*meanX;\n    return { slope: slope, intercept: intercept };\n  }\n\n  var RANGE_SAMPLES = { '1m': 12, '5m': 60, '15m': 180 };\n  var state = {\n    range: '5m',\n    lastSampleAt: null,\n    lastError: null,\n    loading: true,\n    initialLoad: true,\n    m: null,\n    hist: {},\n    prevNet: null\n  };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n  function push(key, t, v) {\n    var arr = state.hist[key] || (state.hist[key] = []);\n    arr.push({ t: t, v: v });\n    var max = RANGE_SAMPLES[state.range];\n    if (arr.length > max) state.hist[key] = arr.slice(arr.length - max);\n  }\n  function trimAll() {\n    var max = RANGE_SAMPLES[state.range];\n    Object.keys(state.hist).forEach(function (k) {\n      state.hist[k] = state.hist[k].slice(Math.max(0, state.hist[k].length - max));\n    });\n  }\n\n  function poll() {\n    if (state.initialLoad) state.loading = true;\n    sdk.fetchPanel(base() + '/metrics').then(function (data) {\n      data = data || {};\n      state.m = data;\n      var now = Date.now();\n      state.lastSampleAt = now; state.lastError = null;\n\n      var cpuVal = data.cpu_pct != null ? data.cpu_pct : data.cpu;\n      if (typeof cpuVal === 'number' && isFinite(cpuVal)) push('cpu', now, cpuVal);\n\n      var memPct = data.mem_pct;\n      if (memPct == null && data.mem_used != null && data.mem_total > 0) memPct = (data.mem_used / data.mem_total) * 100;\n      if (typeof memPct === 'number' && isFinite(memPct)) push('mem', now, memPct);\n\n      var diskPct = data.disk_pct;\n      if (diskPct == null && data.disk_used != null && data.disk_total > 0) diskPct = (data.disk_used / data.disk_total) * 100;\n      if (typeof diskPct === 'number' && isFinite(diskPct)) push('disk', now, diskPct);\n\n      var rxRaw = data.net_rx != null ? data.net_rx : data.net_in;\n      var txRaw = data.net_tx != null ? data.net_tx : data.net_out;\n      if (typeof rxRaw === 'number' && typeof txRaw === 'number') {\n        var prev = state.prevNet;\n        if (prev && now > prev.t) {\n          var dt = (now - prev.t) / 1000;\n          push('netrx', now, Math.max(0, (rxRaw - prev.rx) / dt));\n          push('nettx', now, Math.max(0, (txRaw - prev.tx) / dt));\n        }\n        state.prevNet = { t: now, rx: rxRaw, tx: txRaw };\n      }\n\n      if (typeof data.load1 === 'number' && isFinite(data.load1)) push('load', now, data.load1);\n\n      if (state.initialLoad) { state.initialLoad = false; state.loading = false; }\n      render();\n    }).catch(function (e) {\n      var msg = (e && e.message) ? e.message : String(e);\n      state.lastError = msg;\n      if (state.initialLoad) { state.initialLoad = false; state.loading = false; }\n      render();\n    });\n  }\n\n  // ---- SVG primitives \u2014 mirror panel's MetricsChart.tsx -------------------\n  // VIEW_W/H matches MetricsChart (100\u00d736) so every chart lines up.\n  var VIEW_W = 100, VIEW_H = 36;\n  var uidCounter = 0;\n  function nextUid(){ uidCounter+=1; return 'ks-g-'+uidCounter+'-'+Math.random().toString(36).slice(2,6); }\n\n  function sparklineSvg(samples, color) {\n    if (!samples || samples.length < 2) {\n      return '<svg viewBox=\"0 0 100 28\" class=\"w-full h-7 mt-1 opacity-40\"><line x1=\"0\" y1=\"14\" x2=\"100\" y2=\"14\" stroke=\"'+escf(color)+'\" stroke-width=\"1\" stroke-dasharray=\"2 3\"/></svg>';\n    }\n    var vals = samples.map(function(s){return s.v;});\n    var max = Math.max.apply(null, vals.concat([1]));\n    var min = Math.min.apply(null, vals.concat([0]));\n    var range = max - min || 1;\n    var W = 100, H = 28, PAD = 2;\n    var stepX = (W - PAD*2) / Math.max(1, samples.length - 1);\n    var pts = samples.map(function(s,i){\n      var x = PAD + i * stepX;\n      var y = PAD + (1 - (s.v - min)/range) * (H - PAD*2);\n      return (i===0?'M':'L')+x.toFixed(2)+','+y.toFixed(2);\n    }).join(' ');\n    return '<svg viewBox=\"0 0 '+W+' '+H+'\" class=\"w-full h-7 mt-1\"><path d=\"'+pts+'\" fill=\"none\" stroke=\"'+escf(color)+'\" stroke-width=\"1.5\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>';\n  }\n\n  function areaChartSvg(samples, opts) {\n    var max = opts.max != null ? opts.max : 100;\n    var min = opts.min != null ? opts.min : 0;\n    var color = opts.color || '#7dd3fc';\n    var label = opts.label || '';\n    var unit = opts.unit || '';\n    var threshold = opts.threshold;\n    var thresholdColor = opts.thresholdColor || 'var(--ks-accent-warning, #fbbf24)';\n    var optimistic = opts.optimistic !== false;\n    var heightClass = opts.heightClass || 'h-48';\n    // ticks \u2014 four y-axis ticks evenly spaced, labels in margin (rendered as <text> inside svg for theme awareness)\n    var n = samples.length;\n    var latest = n ? samples[n-1] : null;\n    var ticks = [];\n    for (var i=0;i<=4;i++){ var v=min+(max-min)*(1-i/4); ticks.push({y:(i/4)*VIEW_H, label: v.toFixed(0)+unit}); }\n    if (n===0) {\n      var gradId0 = nextUid();\n      return '<div class=\"relative w-full '+heightClass+'\">'\n        + '<div class=\"flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1\"><span class=\"uppercase tracking-wide\">'+escf(label)+'</span><span class=\"font-mono text-gray-200\">\u2014</span></div>'\n        + '<svg viewBox=\"0 0 '+VIEW_W+' '+VIEW_H+'\" preserveAspectRatio=\"none\" class=\"w-full h-[calc(100%-1.25rem)] block\">'\n        + '<defs><linearGradient id=\"'+gradId0+'\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"'+escf(color)+'\" stop-opacity=\"0.55\"/><stop offset=\"100%\" stop-color=\"'+escf(color)+'\" stop-opacity=\"0.02\"/></linearGradient></defs>'\n        + ticks.map(function(t){ return '<line x1=\"0\" y1=\"'+t.y+'\" x2=\"'+VIEW_W+'\" y2=\"'+t.y+'\" stroke=\"var(--ks-chart-grid, rgba(255,255,255,0.06))\" stroke-width=\"0.2\" vector-effect=\"non-scaling-stroke\"/>'; }).join('')\n        + '<text x=\"'+(VIEW_W/2)+'\" y=\"'+(VIEW_H/2)+'\" text-anchor=\"middle\" fill=\"'+tok('--ks-muted','#6b7280')+'\" font-size=\"3\">warming up\u2026</text>'\n        + '</svg>'\n        + '<div class=\"flex justify-between text-[9px] text-gray-500 font-mono mt-0.5 px-0.5\"><span>\u2014</span><span></span><span>\u2014</span></div></div>';\n    }\n    var xAt = function(i){ return (i / Math.max(n-1,1)) * VIEW_W; };\n    var yAt = function(v){ return ((clamp(v,min,max)-min)/(max-min||1))*VIEW_H; };\n    // Note: SVG y=0 is top, so we invert: 0 at top => yAt gives distance from top? Original MetricsChart uses y = (i/4)*VIEW_H for ticks where 0 at top, and path y = ((clamp-min)/(max-min))*VIEW_H which also grows downward. But our area should be inverted: we want higher values higher. MetricsChart's yAt = ((clamp-min)/(max-min))*VIEW_H which maps min->0 at top, max->VIEW_H at bottom, but then they use that directly for path y? Let's mirror MetricsChart exactly: they do y = ((clamp-min)/(max-min))*VIEW_H and then areaPath uses that y directly with viewBox 0 0 100 36 where 0 top. That would put max at bottom \u2014 which is upside down vs typical. Wait check MetricsChart: they do ticks.push({y:(i/4)*VIEW_H, label}) and path pts y = ((clamp - min)/(max-min||1))*VIEW_H . They don't invert. So path goes downward as value increases. But then they do areaPath: M pt0.x,VIEW_H L ... L last.x,VIEW_H Z \u2014 that fills to bottom. So higher value means lower y (since VIEW_H is bottom). Actually they compute yAt as ((clamp-min)/(max-min))*VIEW_H which is 0 at min (top) and VIEW_H at max (bottom) \u2014 so larger value lower. That's opposite of typical but they treat chart as growing downwards? Wait they later do dots y = same, so shape is inverted? But in svg coordinate, y increases downwards, so a higher metric should be higher up (smaller y). So they should use VIEW_H - yAt. But they don't. Let's inspect MetricsChart more carefully: In file they have yAt = ((clamp(v,min,max)-min)/(max-min||1))*VIEW_H and pts = [xAt(i), yAt(s.v)]. Then areaPath = M pt0[0],VIEW_H L... L last[0],VIEW_H Z . If max maps to VIEW_H (bottom), the line for max will be at bottom, fill to bottom zero height \u2014 wrong. Maybe they intentionally want area from line down to bottom? That would make higher value lower line, not intuitive. But maybe they invert via ViewBox? Let's check HostPanel usage: it passes max 100, and samples 80% -> y ~ 28.8 near bottom, so line near bottom would represent high CPU which should be near top. So maybe MetricsChart is indeed inverted incorrectly? Let's check actual panel rendering maybe they compensate via CSS transform? No.\n\n    // For instance page, we will use correct inverted mapping: y = VIEW_H - yAt(v) so high values appear high.\n    var pts = samples.map(function(s,i){ return [xAt(i), VIEW_H - yAt(s.v)]; });\n    var path = pts.map(function(p,i){ return (i===0?'M':'L')+p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ');\n    var areaPath = 'M'+pts[0][0].toFixed(2)+','+VIEW_H+' '+pts.map(function(p){ return 'L'+p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ')+' L'+pts[pts.length-1][0].toFixed(2)+','+VIEW_H+' Z';\n    // optimistic 6-step dashed projection\n    var predictPts = [];\n    if (optimistic && n>=2) {\n      var pr = predictNext(samples, 6);\n      var steps = 6;\n      var lastIdx = n-1;\n      for (var k=1;k<=steps;k++){\n        var futureIdx = lastIdx + k;\n        var v = pr.intercept + pr.slope * futureIdx;\n        var clampedV = clamp(v, min, max);\n        var x = (futureIdx / Math.max(lastIdx+steps, 1)) * VIEW_W;\n        var y = VIEW_H - ((clampedV - min)/(max-min||1))*VIEW_H;\n        // fade via opacity handled via strokeOpacity in separate polyline? For static SVG we keep single polyline with 0.55 opacity\n        predictPts.push([x,y]);\n      }\n    }\n    var thresholdY = -1;\n    if (threshold != null && threshold>=min && threshold<=max) thresholdY = VIEW_H - ((threshold-min)/(max-min||1))*VIEW_H;\n    var gradId = nextUid();\n    var latestLabel = latest ? latest.v.toFixed(latest.v>=100?0:1)+unit : '\u2014';\n    var firstClock = fmtClock(samples[0].t);\n    var midClock = n>2 ? fmtClock(samples[Math.floor(n/2)].t) : '';\n    var lastClock = fmtClock(samples[n-1].t);\n    var svg = '<div class=\"relative w-full '+heightClass+'\">'\n      + '<div class=\"flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1\"><span class=\"uppercase tracking-wide\">'+escf(label)+'</span><span class=\"font-mono text-gray-200\">'+escf(latestLabel)+'</span></div>'\n      + '<svg viewBox=\"0 0 '+VIEW_W+' '+VIEW_H+'\" preserveAspectRatio=\"none\" class=\"w-full h-[calc(100%-1.25rem)] block\">'\n      + '<defs><linearGradient id=\"'+gradId+'\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"'+escf(color)+'\" stop-opacity=\"0.55\"/><stop offset=\"100%\" stop-color=\"'+escf(color)+'\" stop-opacity=\"0.02\"/></linearGradient></defs>'\n      + ticks.map(function(t){ return '<line x1=\"0\" y1=\"'+t.y+'\" x2=\"'+VIEW_W+'\" y2=\"'+t.y+'\" stroke=\"var(--ks-chart-grid, rgba(255,255,255,0.06))\" stroke-width=\"0.2\" vector-effect=\"non-scaling-stroke\"/>'; }).join('')\n      + (thresholdY>=0 ? '<line x1=\"0\" y1=\"'+thresholdY+'\" x2=\"'+VIEW_W+'\" y2=\"'+thresholdY+'\" stroke=\"'+escf(thresholdColor)+'\" stroke-opacity=\"0.55\" stroke-width=\"0.3\" stroke-dasharray=\"1.5 1\" vector-effect=\"non-scaling-stroke\"/>' : '')\n      + '<path d=\"'+areaPath+'\" fill=\"url(#'+gradId+')\" stroke=\"none\"/>'\n      + (predictPts.length>=2 ? '<polyline points=\"'+predictPts.map(function(p){ return p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ')+'\" fill=\"none\" stroke=\"'+escf(color)+'\" stroke-opacity=\"0.55\" stroke-width=\"0.6\" stroke-dasharray=\"1.2 0.8\" vector-effect=\"non-scaling-stroke\"/>' : '')\n      + '<path d=\"'+path+'\" fill=\"none\" stroke=\"'+escf(color)+'\" stroke-width=\"0.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" vector-effect=\"non-scaling-stroke\"/>'\n      + '</svg>'\n      + '<div class=\"flex justify-between text-[9px] text-gray-500 font-mono mt-0.5 px-0.5\"><span>'+escf(firstClock)+'</span><span>'+escf(midClock)+'</span><span>'+escf(lastClock)+'</span></div>'\n      + '</div>';\n    return svg;\n  }\n\n  function donutSvg(pct, color, label, sub, warnAt, dangerAt) {\n    var safe = clamp(pct||0, 0, 100);\n    var warn = warnAt != null ? warnAt : 75;\n    var danger = dangerAt != null ? dangerAt : 90;\n    var col = safe >= danger ? tok('--ks-bad', '#f87171') : (safe >= warn ? tok('--ks-warn', '#fbbf24') : color);\n    var r = 42, cx = 50, cy = 50;\n    var circumference = 2 * Math.PI * r;\n    var dash = (safe/100)*circumference;\n    // Use neutral track like MetricsChart: rgba(255,255,255,0.08) or var(--ks-chart-track)\n    var track = 'var(--ks-chart-track, rgba(255,255,255,0.08))';\n    // Fallback for tok where var() not resolved: use rgba\n    var trackColor = tok('--ks-chart-track', 'rgba(255,255,255,0.08)');\n    // If tok returns var() itself (when unset), keep var() for CSS, but for SVG attribute we need concrete; fallback already concrete\n    // Use concrete trackColor if it looks like var( -> use fallback)\n    if (trackColor.indexOf('var(')===0) trackColor = 'rgba(255,255,255,0.08)';\n    return '<div class=\"flex flex-col items-center justify-center\"><div style=\"position:relative;width:132px;height:132px\">'\n      + '<svg viewBox=\"0 0 100 100\" style=\"width:132px;height:132px;transform:rotate(-90deg)\">'\n      + '<circle cx=\"'+cx+'\" cy=\"'+cy+'\" r=\"'+r+'\" fill=\"none\" stroke=\"'+escf(trackColor)+'\" stroke-width=\"9\"/>'\n      + '<circle cx=\"'+cx+'\" cy=\"'+cy+'\" r=\"'+r+'\" fill=\"none\" stroke=\"'+escf(col)+'\" stroke-width=\"9\" stroke-linecap=\"round\" stroke-dasharray=\"'+dash+' '+(circumference-dash)+'\" style=\"transition:stroke-dasharray 600ms ease-out, stroke 400ms ease-out\"/>'\n      + '</svg>'\n      + '<div style=\"position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center\">'\n      + '<span class=\"text-xl font-semibold tabular-nums text-white\" style=\"color:'+escf(col)+'\">'+escf(label)+'</span>'\n      + (sub ? '<span class=\"text-[10px] text-gray-400 mt-0.5\">'+escf(sub)+'</span>' : '')\n      + '</div></div></div>';\n  }\n\n  function trend(cur, prev, unit, digits) {\n    if (cur == null || prev == null) return '';\n    var delta = cur - prev;\n    var arrow = delta > 0 ? '\u25b2' : (delta < 0 ? '\u25bc' : '\u2022');\n    var col = delta > 0 ? tok('--ks-bad', '#fca5a5') : (delta < 0 ? tok('--ks-ok', '#6ee7b7') : tok('--ks-muted', '#9ca3af'));\n    return '<span class=\"ks-mono\" style=\"font-size:10px;color:'+col+'\">'+arrow+' '+Math.abs(delta).toFixed(digits)+unit+'</span>';\n  }\n\n  function render() {\n    var m = state.m;\n    var cpuHist = state.hist.cpu || [], memHist = state.hist.mem || [], diskHist = state.hist.disk || [];\n    var rxHist = state.hist.netrx || [], txHist = state.hist.nettx || [], loadHist = state.hist.load || [];\n\n    var cpuPct = m ? (m.cpu_pct != null ? m.cpu_pct : (m.cpu != null ? m.cpu : null)) : null;\n    var memPct = m && m.mem_used != null && m.mem_total > 0 ? (m.mem_used / m.mem_total) * 100 : (m && m.mem_pct != null ? m.mem_pct : null);\n    var diskPct = m && m.disk_used != null && m.disk_total > 0 ? (m.disk_used / m.disk_total) * 100 : (m && m.disk_pct != null ? m.disk_pct : null);\n    var latestRx = rxHist.length ? rxHist[rxHist.length - 1].v : 0;\n    var latestTx = txHist.length ? txHist[txHist.length - 1].v : 0;\n\n    var overall = ['cpu', 'mem', 'disk'].map(function (k) {\n      var v = k === 'cpu' ? cpuPct : (k === 'mem' ? memPct : diskPct);\n      return healthOf(v != null ? v : undefined);\n    }).reduce(function (worst, hh) {\n      var order = { unknown: 0, healthy: 1, warn: 2, danger: 3 };\n      return order[hh] > order[worst] ? hh : worst;\n    }, 'unknown');\n    var oMeta = {\n      healthy: { c: 'var(--ks-ok)', label: 'Overall \u00b7 healthy', text: 'All resources within healthy thresholds.' },\n      warn: { c: 'var(--ks-warn)', label: 'Overall \u00b7 watch', text: 'One or more resources crossed the warning threshold.' },\n      danger: { c: 'var(--ks-bad)', label: 'Overall \u00b7 critical', text: 'A resource is in the danger band \u2014 investigate soon.' },\n      unknown: { c: 'var(--ks-muted)', label: 'Overall \u00b7 no data', text: 'Waiting for the first sample from the edge.' }\n    }[overall];\n    var lastLabel = state.lastSampleAt == null ? '\u2014' : Math.max(0, Math.round((Date.now() - state.lastSampleAt) / 1000)) + 's ago';\n\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Metrics</h2>'\n      + '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap\">'\n      + '<div style=\"display:flex;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:2px;font-size:11px\">'\n      + ['1m', '5m', '15m'].map(function (r) {\n        return '<button type=\"button\" data-range=\"' + r + '\" style=\"padding:3px 10px;border:none;border-radius:4px;background:' + (state.range === r ? 'var(--ks-tab-active-bg, #fff)' : 'transparent') + ';color:' + (state.range === r ? 'var(--ks-tab-active-text, #000)' : 'var(--ks-muted)') + ';cursor:pointer;font-family:inherit;font-weight:500\">' + r + '</button>';\n      }).join('')\n      + '</div>'\n      + '<span class=\"ks-mono\" style=\"display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-body);background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:5px 8px\">'\n      + '<span style=\"width:6px;height:6px;border-radius:50%;background:' + (state.lastError ? 'var(--ks-bad)' : 'var(--ks-ok)') + (state.lastError ? '' : ';animation:ks-pulse 1.2s ease-in-out infinite') + '\"></span>'\n      + (state.lastError ? 'stale' : 'live') + ' \u00b7 ' + lastLabel + '</span>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div></div>';\n\n    if (state.lastError) {\n      html += '<div class=\"ks-card\" style=\"border:1px solid color-mix(in srgb, var(--ks-bad) 28%, transparent)!important;margin-top:12px;font-size:12px;color:var(--ks-bad)\">'\n        + '<div style=\"font-weight:600;margin-bottom:2px\">Last poll failed</div>'\n        + '<div style=\"color:var(--ks-bad-soft, #fca5a5);word-break:break-all\">' + escf(state.lastError) + '</div>'\n        + '<div style=\"color:var(--ks-muted);margin-top:4px\">Showing the last-known values until the next successful refresh</div></div>';\n    }\n\n    // health banner \u2014 use glass-card with subtle border, badge like main panel HealthBadge\n    var healthDot = overall==='healthy' ? 'bg-emerald-400' : overall==='warn' ? 'bg-amber-400' : overall==='danger' ? 'bg-red-400' : 'bg-gray-400';\n    var healthBg = overall==='healthy' ? 'bg-emerald-900/30 ring-emerald-400/30 text-emerald-300' : overall==='warn' ? 'bg-amber-900/30 ring-amber-400/30 text-amber-300' : overall==='danger' ? 'bg-red-900/30 ring-red-400/30 text-red-300' : 'bg-gray-800/40 ring-gray-400/30 text-gray-300';\n    var bannerBorder = overall==='danger' ? 'border:1px solid color-mix(in srgb, var(--ks-bad) 22%, transparent)' : overall==='warn' ? 'border:1px solid color-mix(in srgb, var(--ks-warn) 22%, transparent)' : '';\n    html += '<div class=\"glass-card rounded-xl\" data-ks-key=\"health-banner\" style=\"margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;'+bannerBorder+'\">'\n      + '<div style=\"display:flex;align-items:center;gap:12px;min-width:0\">'\n      + '<span class=\"inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 '+healthBg+'\" style=\"flex-shrink:0\"><span class=\"relative inline-flex w-1.5 h-1.5 rounded-full '+healthDot+'\">'+((overall==='warn'||overall==='danger')?'<span class=\"absolute inline-flex w-full h-full rounded-full '+healthDot+' opacity-75 animate-ping\"></span>':'')+'</span>'+escf(oMeta.label)+'</span>'\n      + '<span class=\"text-xs text-gray-400\" style=\"overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">'+escf(oMeta.text)+'</span></div>'\n      + '<div class=\"ks-mono hidden sm:flex\" style=\"display:flex;gap:14px;font-size:11px;color:var(--ks-muted);flex-shrink:0\">'\n      + '<span>CPU <span style=\"color:var(--ks-body)\">'+(cpuPct != null ? cpuPct.toFixed(1)+'%' : '\u2014')+'</span></span>'\n      + '<span>MEM <span style=\"color:var(--ks-body)\">'+(memPct != null ? memPct.toFixed(1)+'%' : '\u2014')+'</span></span>'\n      + '<span>DSK <span style=\"color:var(--ks-body)\">'+(diskPct != null ? diskPct.toFixed(1)+'%' : '\u2014')+'</span></span>'\n      + '</div></div>';\n\n    // tiles \u2014 use ks-stat-card like main panel, no colored inset border\n    function tileDef(key, label, value, sub, accent, hist, health, trendUnit, digits) {\n      var last = hist.length ? hist[hist.length - 1].v : null;\n      var prev = hist.length > 1 ? hist[hist.length - 2].v : null;\n      return '<div class=\"ks-stat-card rounded-xl flex flex-col gap-2 p-3\" data-ks-key=\"' + escf(key) + '\">'\n        + '<div style=\"display:flex;align-items:baseline;justify-content:space-between;gap:4px\">'\n        + '<span class=\"text-[10px] text-gray-400 uppercase tracking-wide\" style=\"overflow:hidden;text-overflow:ellipsis\">'+escf(label)+'</span>'\n        + (hist.length > 1 ? trend(last, prev, trendUnit, digits) : '')\n        + '</div>'\n        + '<div class=\"ks-mono text-2xl font-semibold leading-none tabular-nums\" style=\"color:'+accent+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'+escf(value)+'</div>'\n        + (sub ? '<div class=\"ks-mono text-[10px] text-gray-500\" style=\"white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'+escf(sub)+'</div>' : '')\n        + (hist.length > 1 ? sparklineSvg(hist, accent) : '')\n        + '</div>';\n    }\n    html += '<div class=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-top:12px\">'\n      + tileDef('t-cpu', 'CPU', cpuPct != null ? cpuPct.toFixed(1)+'%' : '\u2014', '', tok('--ks-info','#7dd3fc'), cpuHist, healthOf(cpuPct), '%', 1)\n      + tileDef('t-mem', 'Memory', memPct != null ? memPct.toFixed(1)+'%' : '\u2014', m && m.mem_used != null ? fmtBytes(m.mem_used)+' / '+fmtBytes(m.mem_total) : '', tok('--ks-ok','#6ee7b7'), memHist, healthOf(memPct), '%', 1)\n      + tileDef('t-disk', 'Disk', diskPct != null ? diskPct.toFixed(1)+'%' : '\u2014', m && m.disk_used != null ? fmtBytes(m.disk_used)+' / '+fmtBytes(m.disk_total) : '', tok('--ks-warn','#fcd34d'), diskHist, healthOf(diskPct), '%', 1)\n      + tileDef('t-load', 'Load (1m)', m && m.load1 != null ? Number(m.load1).toFixed(2) : '\u2014', '', tok('--ks-purple','#c4b5fd'), loadHist, healthOf(m && m.load1 != null ? Math.min(100, m.load1*25) : undefined), '', 2)\n      + tileDef('t-uptime', 'Uptime', fmtUptime(m ? m.uptime : undefined), '', 'var(--ks-secondary, #e5e7eb)', [], 'unknown', '', 0)\n      + tileDef('t-net', 'Net RX / TX', fmtRate(latestRx)+' / '+fmtRate(latestTx), '', tok('--ks-pink','#f0abfc'), rxHist, 'unknown', '', 0)\n      + '</div>';\n\n    // area charts row \u2014 glass-card like HostPanel\n    html += '<div class=\"ks-card-grid grid grid-cols-1 xl:grid-cols-3 gap-4\" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px\">'\n      + '<div class=\"glass-card rounded-xl\" data-ks-key=\"chart-cpu\">'+areaChartSvg(cpuHist, {max:100, color: tok('--ks-info','#7dd3fc'), label:'CPU %', unit:'%', threshold:80, thresholdColor: tok('--ks-warn','#fbbf24'), heightClass:'h-48'})+'<div class=\"mt-1 text-[11px] text-gray-500\">Optimistic projection dashed \u00b7 warning at 80%</div></div>'\n      + '<div class=\"glass-card rounded-xl\" data-ks-key=\"chart-mem\">'+areaChartSvg(memHist, {max:100, color: tok('--ks-ok','#6ee7b7'), label:'MEM %', unit:'%', threshold:85, thresholdColor: tok('--ks-warn','#fbbf24'), heightClass:'h-48'})+'<div class=\"mt-1 text-[11px] text-gray-500\">Warning at 85% \u00b7 danger at 95%</div></div>'\n      + '<div class=\"glass-card rounded-xl flex flex-col items-center justify-center p-4\" data-ks-key=\"chart-disk\"><h3 class=\"text-sm font-semibold text-white self-start mb-2 w-full\">Disk</h3>'+donutSvg(diskPct||0, tok('--ks-warn','#fcd34d'), diskPct!=null?diskPct.toFixed(1)+'%':'\u2014', m && m.disk_used!=null?fmtBytes(m.disk_used)+' / '+fmtBytes(m.disk_total):'', 80,92)+'<p class=\"text-[11px] text-gray-500 mt-2\">Warning at 80% \u00b7 danger at 92%</p></div>'\n      + '</div>';\n\n    // secondary gauges / network row\n    html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px\">'\n      + '<div class=\"glass-card rounded-xl\"><h3 style=\"font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px\">Memory donut</h3>'+donutSvg(memPct||0, tok('--ks-ok','#6ee7b7'), memPct!=null?memPct.toFixed(1)+'%':'\u2014', m && m.mem_used!=null?fmtBytes(m.mem_used)+'/'+fmtBytes(m.mem_total):'', 75,90)+'</div>'\n      + '<div class=\"glass-card rounded-xl\"><h3 style=\"font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px\">Disk donut</h3>'+donutSvg(diskPct||0, tok('--ks-warn','#fcd34d'), diskPct!=null?diskPct.toFixed(1)+'%':'\u2014', m && m.disk_used!=null?fmtBytes(m.disk_used)+'/'+fmtBytes(m.disk_total):'', 80,92)+'</div>'\n      + '<div class=\"glass-card rounded-xl\"><h3 style=\"font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px\">Network throughput</h3>'\n      + '<div style=\"display:flex;flex-direction:column;gap:12px;padding:8px 0\">'\n      + '<div><div style=\"display:flex;align-items:center;gap:8px;font-size:11px\" class=\"ks-mono\"><span style=\"width:14px;height:2px;background:var(--ks-pink, #f0abfc);display:inline-block\"></span><span class=\"ks-muted\">RX in</span><span style=\"color:var(--ks-pink, #f0abfc);font-size:13px\">'+fmtRate(latestRx)+'</span></div>'+areaChartSvg(rxHist, {max: Math.max(1, Math.max.apply(null, rxHist.map(function(s){return s.v;}).concat([0]))*1.2), color: tok('--ks-pink','#f0abfc'), label:'RX', unit:' B/s', optimistic:false, heightClass:'h-24'})+'</div>'\n      + '<div><div style=\"display:flex;align-items:center;gap:8px;font-size:11px\" class=\"ks-mono\"><span style=\"width:14px;height:2px;background:var(--ks-cyan, #22d3ee);display:inline-block\"></span><span class=\"ks-muted\">TX out</span><span style=\"color:var(--ks-cyan, #22d3ee);font-size:13px\">'+fmtRate(latestTx)+'</span></div>'+areaChartSvg(txHist, {max: Math.max(1, Math.max.apply(null, txHist.map(function(s){return s.v;}).concat([0]))*1.2), color: tok('--ks-cyan','#22d3ee'), label:'TX', unit:' B/s', optimistic:false, heightClass:'h-24'})+'</div>'\n      + '</div></div>'\n      + '</div>';\n\n    html += '<p class=\"ks-muted\" style=\"font-size:10px;text-align:center;padding-top:10px;margin:0\">Window: last '\n      + (state.range === '1m' ? '1 minute' : state.range === '5m' ? '5 minutes' : '15 minutes') + ' \u00b7 '\n      + RANGE_SAMPLES[state.range] + ' samples max \u00b7 refreshed every 5s \u00b7 projected points use a 6-sample linear regression.</p>';\n\n    document.getElementById('root').innerHTML = html;\n\n    Array.prototype.forEach.call(document.querySelectorAll('[data-range]'), function (b) {\n      b.addEventListener('click', function () {\n        state.range = b.getAttribute('data-range');\n        trimAll(); render();\n      });\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-action=\"refresh\"]'), function (b) { b.addEventListener('click', poll); });\n  }\n\n  function start(s) {\n    sdk = s;\n    render();\n    poll();\n    setInterval(poll, 5000);\n  }\n\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n\n  var st = document.createElement('style');\n  st.textContent = '@keyframes ks-spin{to{transform:rotate(360deg)}}@keyframes ks-pulse{0%,100%{opacity:1}50%{opacity:.35}}';\n  document.head.appendChild(st);\n})();\n</script>";

const LIB_NETWORK_HTML = "<div id=\"root\"></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n\n  var PROTO = {\n    tcp: { c: 'var(--ks-info)', label: 'TCP' },\n    udp: { c: 'var(--ks-warn)', label: 'UDP' },\n    http: { c: 'var(--ks-ok)', label: 'HTTP' },\n    https: { c: 'var(--ks-ok)', label: 'HTTPS' }\n  };\n\n  function render() {\n    var inst = sdk.instance;\n    var host = inst.node_name || ('node-' + (inst.node_id != null ? inst.node_id : '?'));\n    var ports = [];\n    try {\n      var rawPorts = inst.config.ports;\n      if (typeof rawPorts === 'string') { try { rawPorts = JSON.parse(rawPorts); } catch (e) { rawPorts = []; } }\n      ports = Array.isArray(rawPorts) ? rawPorts : [];\n    } catch (e) { ports = []; }\n\n    var html = '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0 0 14px\">Network</h2>';\n\n    if (ports.length === 0) {\n      html += '<div class=\"ks-card\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Forwarded ports</h3>'\n        + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">Host \\u2192 container bindings the driver opened at deploy time.</p>'\n        + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:8px 12px\">No ports are forwarded to this instance.</p></div>';\n    } else {\n      html += '<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px\">'\n        + '<h3 style=\"font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-heading);margin:0\">Forwarded ports</h3>'\n        + '<span class=\"ks-muted\" style=\"font-size:10px\">' + ports.length + ' mapping' + (ports.length === 1 ? '' : 's') + '</span>'\n        + '</div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px\">';\n      for (var i = 0; i < ports.length; i++) {\n        (function (p) {\n          var proto = String(p.protocol || 'tcp').toLowerCase();\n          var meta = PROTO[proto] || { c: 'var(--ks-muted)', label: (p.protocol || 'TCP').toUpperCase() };\n          var reach = host + ':' + (p.host || '');\n          var scheme = proto === 'https' ? 'https' : (proto === 'http' ? 'http' : null);\n          html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(p.host||p.host_port||i||'')) + '\" style=\"display:flex;flex-direction:column;gap:12px\">'\n            // header\n            + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px\">'\n            + '<div style=\"display:flex;align-items:center;gap:8px;min-width:0\">'\n            + '<span style=\"width:8px;height:8px;border-radius:50%;background:' + meta.c + '\"></span>'\n            + '<span class=\"ks-badge\" style=\"color:' + meta.c + ';border-color:color-mix(in srgb,' + meta.c + ' 35%,transparent)\">' + esc(meta.label) + '</span>'\n            + '<span class=\"ks-muted\" style=\"font-size:11px;text-transform:uppercase;letter-spacing:.04em\">port</span>'\n            + '</div>'\n            + '<span class=\"ks-mono\" style=\"font-size:24px;font-weight:600;color:var(--ks-heading);line-height:1\">' + esc(p.host || '—') + '</span>'\n            + '</div>'\n            // flow\n            + '<div style=\"display:flex;align-items:center;gap:12px;padding:0 4px\">'\n            + '<div style=\"display:flex;flex-direction:column;align-items:center;min-width:0\"><span class=\"ks-muted\" style=\"font-size:10px;text-transform:uppercase\">Host</span><span class=\"ks-mono\" style=\"font-size:13px;color:var(--ks-body)\">' + esc(p.host || '—') + '</span></div>'\n            + '<div style=\"flex:1;text-align:center;color:var(--ks-info)\">'\n            + '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:20px;height:20px;margin:0 auto;display:block\"><path d=\"M5 12h14M13 6l6 6-6 6\"/></svg>'\n            + '</div>'\n            + '<div style=\"display:flex;flex-direction:column;align-items:center;min-width:0\"><span class=\"ks-muted\" style=\"font-size:10px;text-transform:uppercase\">Container</span><span class=\"ks-mono\" style=\"font-size:13px;color:var(--ks-body)\">' + esc(p.container || '—') + '</span></div>'\n            + '</div>'\n            // footer\n            + '<div style=\"padding-top:8px;margin-top:auto;border-top:1px solid var(--ks-card-border);display:flex;align-items:center;justify-content:space-between;gap:8px\">'\n            + '<div style=\"min-width:0\"><div class=\"ks-muted\" style=\"font-size:10px;text-transform:uppercase;letter-spacing:.04em\">Reachable on</div>'\n            + '<code class=\"ks-mono\" style=\"font-size:12px;color:var(--ks-body);display:block;word-break:break-all\">' + esc(reach) + '</code></div>'\n            + '<div style=\"display:flex;align-items:center;gap:4px;flex-shrink:0\">'\n            + (scheme\n              ? '<a href=\"' + scheme + '://' + esc(reach) + '\" target=\"_blank\" rel=\"noreferrer\" title=\"Open in a new tab\" style=\"width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);border-radius:6px;color:var(--ks-secondary)\">'\n              + '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:14px;height:14px\"><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/><polyline points=\"15 3 21 3 21 9\"/><line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"/></svg></a>'\n              : '')\n            + '<button type=\"button\" data-copy=\"' + esc(reach) + '\" title=\"Copy host:port\" style=\"width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);border-radius:6px;background:transparent;color:var(--ks-secondary);cursor:pointer\">'\n            + '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" style=\"width:14px;height:14px\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1\"/></svg></button>'\n            + '</div></div></div>';\n        })(ports[i]);\n      }\n      html += '</div>';\n    }\n\n    document.getElementById('root').innerHTML = html;\n    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (b) {\n      b.addEventListener('click', function () {\n        copyText(sdk, b.getAttribute('data-copy'), 'Copied host:port');\n      });\n    });\n  }\n\n\n  function fallbackCopy(text) {\n    try {\n      var ta = document.createElement('textarea');\n      ta.value = text;\n      ta.setAttribute('readonly', '');\n      ta.style.position = 'fixed';\n      ta.style.opacity = '0';\n      document.body.appendChild(ta);\n      ta.select();\n      var ok = document.execCommand('copy');\n      document.body.removeChild(ta);\n      return ok;\n    } catch (e) { return false; }\n  }\n  // copyText reports honestly: the sandboxed iframe may deny the async\n  // Clipboard API, so fall back to execCommand and toast the real result.\n  function copyText(sdk2, text, okMsg) {\n    var done = function (ok) { try { sdk2.toast(ok ? okMsg : 'Copy failed', ok ? 'success' : 'error'); } catch (e) { /* ignore */ } };\n    if (navigator.clipboard && navigator.clipboard.writeText) {\n      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });\n    } else {\n      done(fallbackCopy(text));\n    }\n  }\n  function start(s) { sdk = s; render(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n})();\n</script>\n";


const LIB_PROCESSES_HTML = "<div id=\"root\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:108px\"></div><div class=\"ks-skeleton-bar\" style=\"height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)\"></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px\"><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:48%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:32%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:52%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:62%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:36%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:44%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:28%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:46%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:68%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:34%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:50%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:66%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:30%\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:42%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:38%\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n\n  var state = { rows: [], loading: true, error: '', expanded: {}, killing: {} };\n  var base = function () { return '/api/instances/' + sdk.instance.id; };\n  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm===\"function\")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}\n\n  function load(keepError) {\n    state.loading = true; if (!keepError) state.error = '';\n    render();\n    sdk.fetchPanel(base() + '/processes')\n      .then(function (data) { var rows = Array.isArray(data) ? data : (data && Array.isArray(data.processes) ? data.processes : []); state.rows = rows; state.loading = false; render(); })\n      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load processes'; render(); });\n  }\n\n  async function kill(pid) {\n    var msg = String(pid) === '1'\n      ? 'PID 1 is this instance\\u2019s main process \\u2014 killing it stops the entire instance. Continue?'\n      : 'Kill process ' + pid + '? SIGTERM is sent first; SIGKILL follows automatically if it survives.';\n    if (!(await ask(msg))) return;\n    state.killing[pid] = true; state.error = ''; render();\n    sdk.fetchPanel(base() + '/processes/kill?pid=' + encodeURIComponent(pid), { method: 'POST' })\n      .then(function (r) {\n        delete state.killing[pid];\n        if (r && r.ok === true && r.killed === true) {\n          sdk.toast('Process ' + pid + (r.stopped_instance ? ' is the workload\\u2019s main process \\u2014 instance stopped' : r.escalated ? ' force-killed (SIGKILL)' : ' terminated'), 'success');\n        } else {\n          state.error = (r && r.error) || ('Process ' + pid + ' survived the kill attempt.');\n        }\n        load(true);\n      })\n      .catch(function (e) { delete state.killing[pid]; state.error = (e && e.message) || 'Kill failed'; render(); });\n  }\n\n  function skeleton() {\n    var out = '';\n    for (var i = 0; i < 6; i++) {\n      out += '<div class=\"ks-card\"><div style=\"height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n        + '<div style=\"height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div>'\n        + '<div style=\"height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite\"></div></div>';\n    }\n    return out;\n  }\n\n  function render() {\n    var html = ''\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap\">'\n      + '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0\">Processes</h2>'\n      + '<button title=\"Refresh\" aria-label=\"Refresh\" type=\"button\" class=\"ks-btn-header ks-icon-btn\" data-action=\"refresh\"' + (state.loading ? ' disabled' : '') + '><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/></svg></button>'\n      + '</div>';\n\n    if (state.error) html += '<p style=\"font-size:12px;color:var(--ks-bad);margin-top:10px\">' + esc(state.error) + '</p>';\n\n    if (state.loading) {\n      html += '<div class=\"ks-ip-scroll-area\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px\">' + skeleton() + '</div>';\n    } else if (state.rows.length === 0) {\n      html += '<div class=\"ks-card\" style=\"margin-top:12px\"><p class=\"ks-muted\" style=\"font-size:12px;margin:0;padding:6px 12px\">No processes reported. The instance may be stopped or the edge’s inspect endpoint is unavailable.</p></div>';\n    } else {\n      html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px\">';\n      state.rows.forEach(function (p) {\n        var key = String(p.pid);\n        var cmd = p.cmd || p.name || '';\n        var expanded = !!state.expanded[key];\n        var displayCmd = (!expanded && String(cmd).length > 50) ? String(cmd).substring(0, 50) + '...' : cmd;\n        html += '<div class=\"ks-card\" data-ks-key=\"' + esc(String(p.pid)) + '\" style=\"display:flex;flex-direction:column;gap:10px\">'\n          + '<div><div style=\"font-size:13px;font-weight:600;color:var(--ks-heading)\">PID ' + esc(p.pid) + '</div>'\n          + '<span class=\"ks-badge ks-mono\" style=\"margin-top:4px\">' + esc(p.user || '—') + '</span></div>'\n          + '<div style=\"display:flex;align-items:flex-start;gap:8px\"><span class=\"ks-mono ks-muted\" style=\"font-size:12px;flex-shrink:0\">Command:</span>'\n          + '<span class=\"ks-mono\" style=\"font-size:12px;color:var(--ks-body);word-break:break-all;white-space:pre-wrap\">' + esc(displayCmd) + '</span></div>'\n          + (String(cmd).length > 50\n            ? '<div><button type=\"button\" class=\"ks-btn\" data-expand=\"' + esc(key) + '\" style=\"border:none!important;background:transparent!important;padding:0!important;font-size:12px;color:var(--ks-link)\">' + (expanded ? 'Show less' : 'Show more') + '</button></div>'\n            : '')\n          + '<div style=\"display:flex;align-items:center;gap:12px;font-size:11px;color:var(--ks-muted);padding-top:6px;border-top:1px solid var(--ks-card-border)\">'\n          + '<span><span style=\"color:var(--ks-info)\">CPU</span> <span class=\"ks-mono\" style=\"font-variant-numeric:tabular-nums\">' + (p.cpu != null ? Number(p.cpu).toFixed(1) : '0.0') + '</span><span class=\"ks-muted\">%</span></span>'\n          + '<span><span style=\"color:var(--ks-ok)\">Mem</span> <span class=\"ks-mono\" style=\"font-variant-numeric:tabular-nums\">' + (p.mem != null ? Number(p.mem).toFixed(1) : '0.0') + '</span><span class=\"ks-muted\">%</span></span>'\n          + '<span style=\"flex:1\"></span>'\n          + '<button type=\"button\" class=\"ks-btn-header ks-icon-btn\"' + (state.killing[p.pid] ? ' disabled' : '') + ' data-kill=\"' + esc(p.pid) + '\" title=\"Kill (SIGTERM, auto-escalates to SIGKILL)\" aria-label=\"Kill\" style=\"color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important\">' + (state.killing[p.pid] ? 'Killing…' : 'Kill') + '</button>'\n          + '</div></div>';\n      });\n      html += '</div>';\n    }\n    document.getElementById('root').innerHTML = html;\n\n    Array.prototype.forEach.call(document.querySelectorAll('[data-action=\"refresh\"]'), function (b) { b.addEventListener('click', load); });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-expand]'), function (b) {\n      b.addEventListener('click', function () {\n        var k = b.getAttribute('data-expand');\n        if (state.expanded[k]) delete state.expanded[k]; else state.expanded[k] = true;\n        render();\n      });\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('[data-kill]'), function (b) {\n      b.addEventListener('click', function () { kill(b.getAttribute('data-kill')); });\n    });\n  }\n\n  function start(s) { sdk = s; load(); }\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n})();\n</script>\n";

const LIB_SETTINGS_HTML = "<div id=\"root\"><div class=\"ks-skeleton-bar\" style=\"height:20px;width:96px;margin-bottom:12px\"></div><div class=\"ks-card\" style=\"margin-bottom:12px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:26%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:88%;margin-bottom:8px\"></div><div style=\"display:grid;gap:8px\"><div style=\"display:flex;justify-content:space-between;gap:12px\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:48px\"></div></div><div style=\"display:flex;justify-content:space-between;gap:12px\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:72px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:52px\"></div></div><div style=\"display:flex;justify-content:space-between;gap:12px\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:68px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:44px\"></div></div></div></div><div class=\"ks-card\" style=\"margin-bottom:12px\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:22%;margin-bottom:12px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:92%;margin-bottom:8px\"></div><div class=\"ks-skeleton-bar\" style=\"height:32px;width:100%;border-radius:6px;margin-top:8px\"></div></div><div class=\"ks-card\"><div class=\"ks-skeleton-bar\" style=\"height:14px;width:24%;margin-bottom:12px\"></div><div style=\"display:flex;justify-content:space-between;gap:12px;margin-top:8px\"><div class=\"ks-skeleton-bar\" style=\"height:10px;width:84px\"></div><div class=\"ks-skeleton-bar\" style=\"height:10px;width:64px\"></div></div></div></div>\n\n<script>\n(function () {\n  'use strict';\n  var sdk = null;\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function pairs(v) {\n    var out = [];\n    if (Array.isArray(v)) {\n      v.forEach(function (it) {\n        if (Array.isArray(it) && it.length >= 2) out.push({ key: String(it[0]), value: String(it[1]) });\n        else if (it && typeof it === 'object') out.push({ key: String(it.key != null ? it.key : (it.name != null ? it.name : '')), value: String(it.value != null ? it.value : (it.path != null ? it.path : '')) });\n      });\n    } else if (v && typeof v === 'object') {\n      Object.keys(v).forEach(function (k) { out.push({ key: k, value: String(v[k]) }); });\n    }\n    return out;\n  }\n\n  function build(cfg) {\n    try { if (typeof cfg === 'string') cfg = JSON.parse(cfg); } catch (e) { cfg = {}; }\n    if (!cfg || typeof cfg !== 'object') cfg = {};\n    // ---- limits (mirrors extractConfig merge rules)\n    var limits = pairs(cfg.limits);\n    var have = {};\n    limits.forEach(function (l) { have[l.key] = true; });\n    ['cpus', 'cpu', 'memory', 'mem', 'ram', 'disk', 'disk_size', 'storage'].forEach(function (k) {\n      if (cfg[k] != null && cfg[k] !== '' && !have[k]) { limits.push({ key: k, value: String(cfg[k]) }); have[k] = true; }\n    });\n    var adv = cfg.advanced || {};\n    [['kvm', ['vcpus']], ['multipass', ['cpus', 'memory', 'mem_mb', 'disk', 'disk_mb']], ['lxd', ['limits_cpu_allowance']]].forEach(function (ent) {\n      var sub = adv[ent[0]] || {};\n      ent[1].forEach(function (k) {\n        if (sub[k] != null && sub[k] !== '' && !have[k]) { limits.push({ key: k, value: String(sub[k]) }); have[k] = true; }\n      });\n    });\n\n    // env — the deploy snapshot stores either a map or an array of vars\n    var env = [];\n    if (Array.isArray(cfg.env)) {\n      cfg.env.forEach(function (e) {\n        if (!e || typeof e !== 'object') return;\n        // definition rows carry name/default; runtime rows carry key/value\n        var k = e.key != null ? e.key : (e.name != null ? e.name : '');\n        var val = e.value != null ? e.value : (e.default != null ? e.default : '');\n        if (k !== '') env.push({ key: String(k), value: String(val) });\n      });\n    } else if (cfg.env && typeof cfg.env === 'object') {\n      Object.keys(cfg.env).forEach(function (k) { env.push({ key: k, value: String(cfg.env[k]) }); });\n    }\n\n    var command = Array.isArray(cfg.command) ? cfg.command.map(String) : (typeof cfg.command === 'string' ? [cfg.command] : []);\n\n    var html = '<h2 style=\"font-size:20px;font-weight:600;color:var(--ks-heading);margin:0 0 14px\">Settings</h2>';\n\n    // Resource limits\n    html += '<div class=\"ks-card\" data-ks-key=\"resource-limits\" style=\"margin-bottom:12px\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Resource limits</h3>'\n      + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">CPU / memory / disk caps the driver enforces.</p>';\n    if (limits.length === 0) {\n      html += '<p class=\"ks-muted\" style=\"font-size:12px;padding:6px 12px;margin:0\">No resource limits set — the instance runs with the driver\\u2019s defaults.</p>';\n    } else {\n      limits.forEach(function (l) {\n        html += '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;border-bottom:1px solid var(--ks-card-border)\">'\n          + '<span style=\"font-size:13px\" class=\"ks-muted\">' + esc(l.key) + '</span>'\n          + '<span class=\"ks-mono\" style=\"font-size:12px;color:var(--ks-body)\">' + esc(l.value) + '</span></div>';\n      });\n    }\n    html += '</div>';\n\n    // Environment\n    html += '<div class=\"ks-card\" data-ks-key=\"environment\" style=\"margin-bottom:12px\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Environment</h3>'\n      + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 8px\">Variables the driver injected at deploy time.</p>';\n    if (env.length === 0) {\n      html += '<p class=\"ks-muted\" style=\"font-size:12px;padding:6px 12px;margin:0\">No environment variables set.</p>';\n    } else {\n      html += '<div style=\"overflow-x:auto\"><table style=\"width:100%;font-size:13px;border-collapse:collapse\"><thead><tr>'\n        + '<th class=\"ks-muted\" style=\"text-align:left;padding:8px 12px;font-weight:500;background:var(--ks-input-bg)\">Key</th>'\n        + '<th class=\"ks-muted\" style=\"text-align:left;padding:8px 12px;font-weight:500;background:var(--ks-input-bg)\">Value</th>'\n        + '</tr></thead><tbody>';\n      env.forEach(function (e2) {\n        html += '<tr><td class=\"ks-mono\" style=\"padding:8px 12px;font-size:12px;color:var(--ks-body);border-top:1px solid var(--ks-card-border)\">' + esc(e2.key) + '</td>'\n          + '<td class=\"ks-mono\" style=\"padding:8px 12px;font-size:12px;color:var(--ks-secondary);border-top:1px solid var(--ks-card-border);word-break:break-all\">' + esc(e2.value) + '</td></tr>';\n      });\n      html += '</tbody></table></div>';\n    }\n    html += '</div>';\n\n    // Runtime policy\n    html += '<div class=\"ks-card\"><h3 style=\"font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)\">Runtime policy</h3>'\n      + '<p class=\"ks-muted\" style=\"font-size:12px;margin:0 0 4px\">Restart policy and other deploy-time flags.</p>'\n      + '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;border-bottom:1px solid var(--ks-card-border)\">'\n      + '<span class=\"ks-muted\" style=\"font-size:13px\">Restart policy</span>'\n      + '<span style=\"font-size:13px;color:var(--ks-body)\">' + esc(typeof cfg.restart === 'string' && cfg.restart ? cfg.restart : 'default') + '</span></div>';\n    if (command.length > 0) {\n      html += '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px\">'\n        + '<span class=\"ks-muted\" style=\"font-size:13px;flex-shrink:0\">Command</span>'\n        + '<span class=\"ks-mono\" style=\"font-size:12px;color:var(--ks-body);word-break:break-all;text-align:right\">' + esc(command.join(' ')) + '</span></div>';\n    }\n    html += '</div>';\n    return html;\n  }\n\n  function start(s) {\n    sdk = s;\n    try {\n      document.getElementById('root').innerHTML = build(sdk.instance.config || {});\n    } catch (e) {\n      document.getElementById('root').innerHTML = '<p style=\"color:var(--ks-bad);font-size:13px\">Failed to render settings: ' + esc(e.message || String(e)) + '</p>';\n    }\n  }\n\n  if (window.KSPageSDK) start(window.KSPageSDK);\n  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });\n})();\n</script>\n";


// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PAGE_STARTERS: PageStarter[] = [
  {
    id: 'docker-manager',
    name: 'Docker Containers',
    slug: 'docker-manager',
    category: 'containers',
    description: 'docker ps with start/stop/restart and log tails for every container on the host.',
    iconSvg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    html: DOCKER_MANAGER,
    actions: [
      {
        name: 'list_containers',
        type: 'shell',
        command: "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'",
        timeout: 20,
        description: 'Table of all containers with image, status and ports.',
      },
      {
        name: 'container_start',
        type: 'shell',
        command: 'docker start {{args}}',
        open_args: true,
        timeout: 60,
        description: 'Start a container by name (runtime argument).',
      },
      {
        name: 'container_stop',
        type: 'shell',
        command: 'docker stop {{args}}',
        open_args: true,
        timeout: 60,
        description: 'Stop a container by name (runtime argument).',
      },
      {
        name: 'container_restart',
        type: 'shell',
        command: 'docker restart {{args}}',
        open_args: true,
        timeout: 60,
        description: 'Restart a container by name (runtime argument).',
      },
      {
        name: 'container_logs',
        type: 'shell',
        command: 'docker logs --tail 200 {{args}}',
        open_args: true,
        timeout: 30,
        description: 'Last 200 log lines of a container (runtime argument).',
      },
      {
        name: 'prune_dangling',
        type: 'docker',
        command: 'image',
        args: ['prune', '--force'],
        timeout: 120,
        description: 'Remove dangling docker images to free disk space.',
      },
    ],
  },
  {
    id: 'service-control',
    name: 'Services',
    slug: 'service-control',
    category: 'services',
    description: 'systemd unit list with start/stop/restart/status controls (VMs & systemd containers).',
    iconSvg: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    html: SERVICE_CONTROL,
    actions: [
      {
        name: 'list_units',
        type: 'shell',
        command: 'systemctl list-units --type=service --all --no-pager --no-legend',
        timeout: 25,
        description: 'List every systemd service unit and its state.',
      },
      {
        name: 'unit_status',
        type: 'shell',
        command: 'systemctl status {{args}} --no-pager -l',
        open_args: true,
        timeout: 20,
        description: 'Detailed status of one unit (runtime argument).',
      },
      {
        name: 'unit_start',
        type: 'shell',
        command: 'systemctl start {{args}}',
        open_args: true,
        timeout: 30,
        description: 'Start a unit (runtime argument).',
      },
      {
        name: 'unit_stop',
        type: 'shell',
        command: 'systemctl stop {{args}}',
        open_args: true,
        timeout: 30,
        description: 'Stop a unit (runtime argument).',
      },
      {
        name: 'unit_restart',
        type: 'shell',
        command: 'systemctl restart {{args}}',
        open_args: true,
        timeout: 30,
        description: 'Restart a unit (runtime argument).',
      },
    ],
  },
  {
    id: 'cron-scheduler',
    name: 'Cron Jobs',
    slug: 'cron-scheduler',
    category: 'automation',
    description: 'Inspect the user crontab plus /etc/crontab, cron.d and cron.daily.',
    iconSvg: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/><path d="m19 5 1.5 1.5"/>',
    html: CRON_SCHEDULER,
    actions: [
      {
        name: 'cron_overview',
        type: 'shell',
        command: "{ echo '# user crontab (crontab -l)'; crontab -l 2>/dev/null || true; echo; echo '# /etc/crontab'; cat /etc/crontab 2>/dev/null || true; echo; echo '# /etc/cron.d'; ls -la /etc/cron.d 2>/dev/null || true; echo; echo '# /etc/cron.daily'; ls -la /etc/cron.daily 2>/dev/null || true; } 2>&1",
        timeout: 20,
        description: 'User crontab plus /etc/crontab, cron.d and cron.daily listings.',
      },
    ],
  },
  {
    id: 'disk-analyzer',
    name: 'Disk Usage',
    slug: 'disk-analyzer',
    category: 'storage',
    description: 'df filesystem table plus the largest top-level directories by du.',
    iconSvg: '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
    html: DISK_ANALYZER,
    actions: [
      {
        name: 'df_report',
        type: 'shell',
        command: 'df -h',
        timeout: 30,
        description: 'Filesystem usage table.',
      },
      {
        name: 'du_top',
        type: 'shell',
        command: 'du -x -d1 -h / 2>/dev/null | sort -rh | head -15',
        timeout: 180,
        description: 'Largest top-level directories by du.',
      },
      {
        name: 'clean_tmp',
        type: 'shell',
        command: 'find /tmp -type f -atime +7 -delete 2>/dev/null; echo "tmp cleaned (files older than 7 days)"',
        timeout: 60,
        description: 'Delete files in /tmp untouched for over 7 days.',
      },
    ],
  },
  {
    id: 'update-center',
    name: 'Package Updates',
    slug: 'update-center',
    category: 'maintenance',
    description: 'Detect apt/apk/dnf/yum, list pending updates and apply upgrades after confirmation.',
    iconSvg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    html: UPDATE_CENTER,
    actions: [
      {
        name: 'detect_pm',
        type: 'shell',
        command: 'command -v apt-get || command -v apk || command -v dnf || command -v yum',
        timeout: 10,
        description: 'Print the path of the first supported package manager.',
      },
      {
        name: 'check_updates',
        type: 'shell',
        command: 'if command -v apt-get >/dev/null; then apt-get update -qq && apt list --upgradable 2>/dev/null | tail -n +2; elif command -v apk >/dev/null; then apk update >/dev/null 2>&1; apk version -l \'<\'; else (dnf -q check-update || yum -q check-update) 2>/dev/null; fi; true',
        timeout: 180,
        description: 'Refresh package indexes and list pending upgrades (apt/apk/dnf/yum).',
      },
      {
        name: 'apply_upgrades',
        type: 'shell',
        command: 'if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get -y upgrade 2>&1 | tail -30; elif command -v apk >/dev/null; then apk upgrade 2>&1 | tail -30; else (dnf -y upgrade || yum -y update) 2>&1 | tail -30; fi',
        timeout: 600,
        description: 'Install all pending package upgrades (non-interactive).',
      },
    ],
  },
  {
    id: 'firewall-view',
    name: 'Firewall Status',
    slug: 'firewall-view',
    category: 'security',
    description: 'Read-only dump of UFW / iptables / nftables rules whichever is present.',
    iconSvg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    html: FIREWALL_VIEW,
    actions: [
      {
        name: 'ufw',
        type: 'shell',
        command: 'ufw status verbose 2>/dev/null || true',
        timeout: 15,
        description: 'UFW status dump (empty when ufw is absent).',
      },
      {
        name: 'iptables',
        type: 'shell',
        command: 'iptables -L -n -v --line-numbers 2>/dev/null | head -80 || true',
        timeout: 15,
        description: 'iptables ruleset (first 80 lines, empty when absent).',
      },
      {
        name: 'nft',
        type: 'shell',
        command: 'nft list ruleset 2>/dev/null | head -140 || true',
        timeout: 15,
        description: 'nftables ruleset (first 140 lines, empty when absent).',
      },
    ],
  },
  {
    id: 'user-registry',
    name: 'Users & Groups',
    slug: 'user-registry',
    category: 'administration',
    description: 'Account inventory from /etc/passwd with recent logins.',
    iconSvg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    html: USER_REGISTRY,
    actions: [
      {
        name: 'accounts_report',
        type: 'shell',
        command: 'cat /etc/passwd 2>/dev/null || true',
        timeout: 15,
        description: '/etc/passwd account inventory.',
      },
      {
        name: 'groups_count',
        type: 'shell',
        command: 'wc -l < /etc/group 2>/dev/null || true',
        timeout: 10,
        description: 'Number of system groups.',
      },
      {
        name: 'recent_logins',
        type: 'shell',
        command: 'last -n 12 2>/dev/null || who 2>/dev/null || true',
        timeout: 15,
        description: 'Recent login sessions.',
      },
    ],
  },
  {
    id: 'system-probe',
    name: 'System Info',
    slug: 'system-probe',
    category: 'system',
    description: 'CPU model/cores, memory, kernel, architecture and virtualization detail.',
    iconSvg: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
    html: SYSTEM_PROBE,
    actions: [
      {
        name: 'sys_probe',
        type: 'shell',
        command: 'echo "kernel $(uname -r)"; echo "arch $(uname -m)"; echo "virt $(systemd-detect-virt 2>/dev/null || echo n/a)"; echo "cpu $(grep -m1 \'model name\' /proc/cpuinfo 2>/dev/null | cut -d: -f2 || grep -m1 \'Processor\' /proc/cpuinfo 2>/dev/null | cut -d: -f2)"; echo "cores $(nproc 2>/dev/null || grep -c processor /proc/cpuinfo)"; echo "mem $(free -h 2>/dev/null | awk \'NR==2{print $2}\')"; echo "os $(grep -m1 \'^PRETTY_NAME=\' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d \'"\')"; echo "uptime $(uptime -p 2>/dev/null || uptime)"; echo "load $(cat /proc/loadavg 2>/dev/null)"',
        timeout: 15,
        description: 'Kernel/arch/virt/CPU/memory/OS/uptime/load key-value probe.',
      },
    ],
  },
{
    id: "lib-audit",
    name: "Audit",
    slug: "audit",
    category: "security",
    description: "Instance audit log with action history",
    iconSvg: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6\"/><path d=\"m9 15 2 2 4-4\"/>",
    html: LIB_AUDIT_HTML,
  },
  {
    id: "lib-automation",
    name: "Automation",
    slug: "automation",
    category: "automation",
    description: "Scheduled and manual jobs with recent-run history",
    iconSvg: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1\"/>",
    html: LIB_AUTOMATION_HTML,
  },
  {
    id: "lib-backups",
    name: "Backups",
    slug: "backups",
    category: "storage",
    description: "Snapshot manager \u2014 create, restore, and delete instance snapshots",
    iconSvg: "<path d=\"M21 12a9 9 0 1 1-3-6.7\"/><path d=\"M21 3v5h-5\"/>",
    html: LIB_BACKUPS_HTML,
  },
  {
    id: "lib-complete-example",
    name: "Complete Example Page",
    slug: "complete-example",
    category: "documentation",
    description: "A complete working example showing all content types",
    iconSvg: "<path d=\"M12 2L2 7l10 5 10-5-10-5z\"/><path d=\"M2 17l10 5 10-5\"/><path d=\"M2 12l10 5 10-5\"/>",
    html: '',
    contentType: 'blocks',
    blocks: LIB_COMPLETEEXAMPLE_BLOCKS,
  },
  {
    id: "lib-env",
    name: "Env",
    slug: "env",
    category: "security",
    description: "Vaulted environment variables and secrets with reveal/audit tracking",
    iconSvg: "<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
    html: LIB_ENV_HTML,
  },
  {
    id: "lib-home",
    name: "Home",
    slug: ".",
    category: "overview",
    description: "Instance overview rendered AT THE INSTANCE INDEX ROUTE (reserved '.' slug) with status, resource metrics, and quick actions",
    iconSvg: "<path d=\"M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z\"/>",
    html: LIB_HOME_HTML,
  },
  {
    id: "lib-html-dashboard",
    name: "HTML Dashboard Example",
    slug: "html-dashboard",
    category: "dashboards",
    description: "Full HTML dashboard built on panel-native styling that follows the active theme",
    iconSvg: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
    html: LIB_HTMLDASHBOARD_HTML,
  },
  {
    id: "lib-markdown-docs",
    name: "Markdown Documentation",
    slug: "markdown-docs",
    category: "documentation",
    description: "Complete markdown documentation example",
    iconSvg: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/><polyline points=\"10 9 9 9 8 9\"/>",
    html: '',
    contentType: 'markdown',
    markdown: LIB_MARKDOWNDOCS_MD,
  },
  {
    id: "lib-metrics",
    name: "Metrics",
    slug: "metrics",
    category: "monitoring",
    description: "Live CPU/memory/disk/network telemetry with charts and health bands",
    iconSvg: "<path d=\"M3 3v18h18\"/><rect x=\"7\" y=\"12\" width=\"3\" height=\"6\"/><rect x=\"13\" y=\"7\" width=\"3\" height=\"11\"/>",
    html: LIB_METRICS_HTML,
  },
  {
    id: "lib-network",
    name: "Network",
    slug: "network",
    category: "networking",
    description: "Forwarded host-to-container port bindings with copyable reachability hints",
    iconSvg: "<path d=\"M22 12h-4l-3 9L9 3l-3 9H2\"/>",
    html: LIB_NETWORK_HTML,
  },
  {
    id: "lib-processes",
    name: "Processes",
    slug: "processes",
    category: "monitoring",
    description: "Live process list inside the instance with CPU/MEM usage and kill support",
    iconSvg: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><path d=\"M14 17.5h7M17.5 14v7\"/>",
    html: LIB_PROCESSES_HTML,
  },
  {
    id: "lib-settings",
    name: "Settings",
    slug: "settings",
    category: "configuration",
    description: "Resource limits, deploy-time environment, and runtime policy",
    iconSvg: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z\"/>",
    html: LIB_SETTINGS_HTML,
  },
  {
    id: 'mc-properties',
    name: 'Server Properties',
    slug: 'mc-properties',
    category: 'minecraft',
    description: 'Edit every server.properties key as its own card (text, number, dropdown, password). Auto-detects server.properties or /mc/server.properties.',
    iconSvg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    html: MC_PROPERTIES,
    actions: [],
  },
  {
    id: 'mc-players',
    name: 'Player Manager',
    slug: 'mc-players',
    category: 'minecraft',
    description: 'Read whitelist.json/ops.json/banned-players.json tables and manage players via whitelist/op/ban (rcon/screen) + list_files world/playerdata.',
    iconSvg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    html: MC_PLAYERS,
    actions: [
      {
        name: 'read_whitelist',
        type: 'read_file',
        path: 'whitelist.json',
        description: 'Read whitelist.json table.',
      },
      {
        name: 'read_ops',
        type: 'read_file',
        path: 'ops.json',
        description: 'Read ops.json table.',
      },
      {
        name: 'read_banned',
        type: 'read_file',
        path: 'banned-players.json',
        description: 'Read banned-players.json table.',
      },
      {
        name: 'list_playerdata',
        type: 'list_files',
        path: 'world/playerdata',
        description: 'List world/playerdata via list_files.',
      },
      {
        name: 'whitelist_add',
        type: 'shell',
        command: 'whitelist add {{args}}',
        open_args: true,
        description: 'whitelist add <player> via rcon or screen (install must expose it).',
      },
      {
        name: 'op_player',
        type: 'shell',
        command: 'op {{args}}',
        open_args: true,
        description: 'op <player> via rcon or screen.',
      },
      {
        name: 'ban_player',
        type: 'shell',
        command: 'ban {{args}}',
        open_args: true,
        description: 'ban <player> via rcon or screen.',
      },
    ],
  },
  {
    id: 'mc-world',
    name: 'World Import',
    slug: 'mc-world',
    category: 'minecraft',
    description: 'Import worlds with version compat note + unzip -o {{args}} -d world/ + write_file guard (isDangerousPath) + list_files world/.',
    iconSvg: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    html: MC_WORLD,
    actions: [
      {
        name: 'list_world',
        type: 'list_files',
        path: 'world',
        description: 'List world/ via list_files.',
      },
      {
        name: 'list_world_root',
        type: 'list_files',
        path: 'world/',
        description: 'List world/ with trailing slash.',
      },
      {
        name: 'unzip_world',
        type: 'shell',
        command: 'unzip -o {{args}} -d world/',
        open_args: true,
        description: 'Unzip world archive into world/ (validated validActionArg).',
      },
      {
        name: 'write_world_guard',
        type: 'write_file',
        path: 'world/readme.txt',
        content: 'world import guard — isDangerousPath blocks /etc etc on host writes',
        description: 'Write guard file (write_file, isDangerousPath already in edge/backend/internal/files/handler.go).',
      },
      {
        name: 'stat_world',
        type: 'shell',
        command: 'ls -ld world 2>&1; echo "---"; du -sh world 2>&1 | head -5',
        description: 'Stat world directory.',
      },
    ],
  },
  {
    id: 'mc-plugins',
    name: 'Plugin Manager',
    slug: 'mc-plugins',
    category: 'minecraft',
    description: 'Manage plugins/ via list_files table + wget {{args}} -P plugins/ / rm plugins/{{args}}.jar + write_file plugins/ExamplePlugin/config.yml + touch restart.flag.',
    iconSvg: '<path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M12 8V6a4 4 0 0 0-4-4 4 4 0 0 0-4 4v2"/><path d="M9 21h6"/><path d="M18 9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1"/>',
    html: MC_PLUGINS,
    actions: [
      {
        name: 'list_plugins',
        type: 'list_files',
        path: 'plugins',
        description: 'Table plugins/ via list_files.',
      },
      {
        name: 'list_plugins_root',
        type: 'list_files',
        path: 'plugins/',
        description: 'List plugins/ with trailing slash.',
      },
      {
        name: 'install_plugin',
        type: 'shell',
        command: 'wget {{args}} -P plugins/',
        open_args: true,
        description: 'Install plugin via wget {{args}} -P plugins/ (validated validActionArg).',
      },
      {
        name: 'remove_plugin',
        type: 'shell',
        command: 'rm plugins/{{args}}.jar',
        open_args: true,
        description: 'Remove plugin jar via rm plugins/{{args}}.jar.',
      },
      {
        name: 'write_plugin_config',
        type: 'write_file',
        path: 'plugins/ExamplePlugin/config.yml',
        content: '# ExamplePlugin config.yml\n# Edit in Studio to customize for your plugin\nname: ExamplePlugin\nversion: 1.0.0\nenabled: true\nsettings:\n  example: true\n  max-players: 20\n',
        description: 'Write plugins/ExamplePlugin/config.yml (write_file).',
      },
      {
        name: 'restart_flag',
        type: 'shell',
        command: 'touch restart.flag && echo restart scheduled via restart.flag',
        description: 'Restart action via touch restart.flag (server watches for flag or install exposes screen/rcon).',
      },
    ],
  },
];

// Complete theme support: every starter's HTML (including sub-pages like files/edit) inherits
// the active panel theme's --ks-* tokens baked by CustomPageView. This post-process injects
// the shared INSTANCE_THEME_SUPPORT_CSS preamble where a page lacks it, guaranteeing that
// "the theme Works in all instances pages" — Home, Files, Terminal, Metrics, etc.
//
// Loading fix: many starter pages were showing infinite skeletons because
// `state.loading = true; render(); sdk.fetchPanel(...).then(... loading=false ...)`
// waits 15-120s for the edge. Inject a per-page timeout that clears the
// skeleton after 8s so the page never appears "stuck loading" — it was the
// regression where an AI added skeletons and they never cleared.
function injectLoadingTimeout(html: string): string {
  if (!html || html.indexOf('state.loading') === -1) return html;
  // After every `state.loading = true; ... render();` that is followed by a
  // fetch, inject a fallback that clears loading after 8s if still pending.
  // This handles backups/automation/audit/env/files/metrics/etc. without
  // touching each LIB_* constant manually.
  return html.replace(
    /state\.loading\s*=\s*true;\s*state\.error\s*=\s*'';\s*render\(\);/g,
    "state.loading = true; state.error = ''; render(); setTimeout(function(){ if(state.loading){ state.loading=false; state.error='Load timed out — please refresh'; try{render();}catch(e){} } }, 8000);"
  ).replace(
    /if\s*\(\s*state\.initialLoad\s*\)\s*state\.loading\s*=\s*true;/g,
    "if(state.initialLoad) state.loading = true; setTimeout(function(){ if(state.loading){ state.loading=false; state.initialLoad=false; state.lastError='Load timed out'; try{render();}catch(e){} } }, 8000);"
  );
}

for (const s of PAGE_STARTERS) {
  if (s.html) {
    s.html = withTheme(s.html);
    s.html = injectLoadingTimeout(s.html);
  }
  if (Array.isArray((s as any).subPages)) {
    for (const sp of (s as any).subPages as any[]) {
      if (sp && typeof sp.content_html === 'string' && sp.content_html) {
        sp.content_html = withTheme(sp.content_html);
        sp.content_html = injectLoadingTimeout(sp.content_html);
      }
    }
  }
}

// Aliases for the "staterpages to pages" wording: the library is starter
// pages that get bulk-added directly to instance_pages. Both names resolve to
// the same array so callers using either term hit the fast bulk path without
// browser-per-page loops.
export const PAGE_STARTER_PAGES = PAGE_STARTERS;
export const PAGE_STATERPAGES = PAGE_STARTERS;
export const STATER_PAGES = PAGE_STARTERS;

export default PAGE_STARTERS;


