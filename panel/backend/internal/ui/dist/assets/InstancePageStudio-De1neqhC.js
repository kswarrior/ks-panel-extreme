const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/MonacoReactEditor-CEZByojY.js","assets/react-CQbZUORi.js","assets/monaco-C-Qj0obh.js","assets/preload-helper-D7HrI6pR.js","assets/monaco-BaEgnEXM.css"])))=>i.map(i=>d[i]);
var Mt=Object.defineProperty;var Pt=(i,m,t)=>m in i?Mt(i,m,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[m]=t;var Oe=(i,m,t)=>Pt(i,typeof m!="symbol"?m+"":m,t);import{j as e,r as _,R as Ee}from"./react-CQbZUORi.js";import{u as At,e as Lt,cf as Tt,p as zt,ch as Fe,ci as It,cj as Rt,ck as Bt}from"./index-BoFecguT.js";import{c as Xe,a as we,p as je}from"./instancePage-B2mXW9JR.js";import{F as $e}from"./FormPage-BCTzrRf5.js";import{a as Ht}from"./PageActionsPill-NXfUcoIU.js";import{P as Dt}from"./PageFormActionsPill-WNGUsNt2.js";import{u as Ot,P as Ft}from"./useFormHistory-CCLpzsDo.js";import{F as $t}from"./FormSkeleton--44raq-x.js";import{g as Q,a as Kt,C as Ze,d as qt,S as Wt,P as Vt}from"./CustomPageView-DWrTvgVz.js";import{C as Me}from"./Card-DL7dJAlt.js";import{P as Ut}from"./PageTabsPill-MMvtwDPk.js";import{f as y}from"./Field-BDtlFPFz.js";import{T as Gt}from"./ThemePreview-B3LnS-jR.js";import{_ as Jt}from"./preload-helper-D7HrI6pR.js";import{I as Yt}from"./IconColorPicker-BAP4oMAt.js";import{d as Ke}from"./TemplateFormComponents-B_MnH6-v.js";import{M as Xt}from"./Modal-qe3NhoWh.js";import{a as Zt,b as Qt}from"./router-we2I1drz.js";import"./vendor-RGRPoOcy.js";import"./CardMediaLayer-BaqtXc5g.js";const es=[{id:"templates",label:"Templates"},{id:"editor",label:"Main page"},{id:"subpages",label:"Sub-pages"},{id:"actions",label:"Actions"},{id:"components",label:"Components"},{id:"configure",label:"Configure"},{id:"preview",label:"Preview"},{id:"settings",label:"Settings"}],ts=["monitoring","docs","tools","dashboard","system","minecraft","other"],ss=["dashboard","status","docs","admin-panel","widget","generic"],ve=[{type:"heading",label:"Heading"},{type:"text",label:"Text"},{type:"image",label:"Image"},{type:"button",label:"Link button"},{type:"stat",label:"Stat card"},{type:"table",label:"Table (JSON rows)"},{type:"list",label:"List (JSON or lines)"},{type:"code",label:"Code block"},{type:"html",label:"Raw HTML"},{type:"action",label:"Action button"},{type:"spacer",label:"Spacer"},{type:"divider",label:"Divider"}],K="ks-card ks-form-card rounded-lg space-y-4",as=`
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
// Final writes use the ORIGINAL Element.prototype setter (ksRawSet) with a
// re-entrancy guard — writing via the patched setter would re-enter ksPatch
// and overflow the stack, blanking every HTML instance page (terminal/files/…).
var ksOrigDesc=typeof Element!=='undefined'?Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML'):null;
var ksOrigGet=ksOrigDesc&&ksOrigDesc.get?ksOrigDesc.get:function(){return this.__ksHtml||'';};
var ksOrigSet=ksOrigDesc&&ksOrigDesc.set?ksOrigDesc.set:function(v){this.__ksHtml=String(v);};
var ksPatchGuard={};
function ksRawGet(n){try{return ksOrigGet.call(n);}catch(e){try{return n.innerHTML;}catch(e2){return '';}}}
function ksRawSet(n,v){try{ksOrigSet.call(n,String(v));}catch(e){try{n.innerHTML=String(v);}catch(e2){}}}
function ksPatch(targetId, newHtml){
  if(typeof ksPatchGuard!=='undefined'&&ksPatchGuard[targetId])return;
  try{ksPatchGuard[targetId]=true;}catch(e){}
  try{
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
      if(ksRawGet(root)!==newHtml){
        var st0=root.scrollTop, sl0=root.scrollLeft;
        ksRawSet(root,newHtml);
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
    if(ch===0 && ksRawGet(root)!==ksRawGet(tmp)){
      if(ksRawGet(root)!==newHtml){
        var st=root.scrollTop, sl=root.scrollLeft;
        ksRawSet(root,newHtml);
        try{root.scrollTop=st; root.scrollLeft=sl;}catch(e){}
      }
    }
    return;
  }
  if(ksRawGet(root)!==newHtml){
    var st2=root.scrollTop, sl2=root.scrollLeft;
    ksRawSet(root,newHtml);
    try{root.scrollTop=st2; root.scrollLeft=sl2;}catch(e){}
  }
  }finally{try{ksPatchGuard[targetId]=false;}catch(e){}}
}
function ksUnitPatch(unitId, innerHtml){
  var n=document.getElementById(unitId);
  if(!n) return;
  if(ksRawGet(n)!==innerHtml) ksRawSet(n,innerHtml);
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
`,Qe=`<style id="ks-instance-theme-support">/* Instance pages — unified panel design system
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
</style>`;function q(i,m,t){return`${Qe}<div class="ks-page">
${m}
</div>
<script>
${as}
(async function(){
  var content = el('content');
  try {
${t}
  } catch (e) {
    if (content) content.innerHTML = '<p class="ks-bad">Failed to load: ' + esc((e && e.message) || e) + '</p>';
    else throw e;
  }
})();
setTimeout(function(){ try{ var c=el('content'); if(c && c.innerHTML.indexOf('ks-skeleton')!==-1) c.innerHTML='<p class="ks-bad" style="padding:12px;background:var(--ks-bad-wash);border:1px solid var(--ks-bad-line);border-radius:6px">Load timed out — edge did not respond. Refresh to retry.</p>'; }catch(e){} }, 8500);
document.currentScript.remove();
<\/script>`}function qe(i){return!i||i.includes("ks-instance-theme-support")||i.includes("ks-theme")?i:Qe+i}const is=q("Docker Containers",`<div class="ks-page-header">
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
  </div>`,`
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
  `),rs=q("Services",`<div class="ks-page-header">
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
  </div>`,`
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
  `),ns=q("Cron Jobs",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Cron Jobs</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div id="content"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:36%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:72%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div>`,`
    async function load(){
      el('content').innerHTML = '<div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:34%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div>';
      var r = await act('cron_overview');
      el('content').innerHTML = cardUnit('cron', 'Cron & scheduled jobs', pre(((r.stdout || '') + '').trim() || '(empty)'));
    }
    el('refresh').onclick = load;
    await load();
  `),os=q("Disk Usage",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Disk Usage</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="cleantmp" title="Clean old /tmp files" aria-label="Clean tmp"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </div>
  </div>
  <div style="margin-bottom:0.6rem"><span id="note" class="ks-muted" style="font-size:11px"></span></div>
  <div id="content"><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:68%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:14px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:72%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%"></div></div></div>`,`
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
  `),ls=q("Package Updates",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Package Updates</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="check" title="Check updates" aria-label="Check updates"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v3l2 2"/></svg></button>
      <button class="ks-btn-header ks-icon-btn" id="upgrade" style="display:none" title="Apply upgrades" aria-label="Apply upgrades"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
    </div>
  </div>
  <div style="margin-bottom:0.6rem"><span id="mgr" class="ks-muted" style="font-size:11px"></span></div>
  <div id="content" class="ks-muted">Run a check to list available package updates.</div>`,`
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
  `),ds=q("Firewall Status",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Firewall Status</h2>
    <div class="ks-page-header-actions">
      <button class="ks-btn-header ks-icon-btn" id="refresh" title="Refresh" aria-label="Refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
    </div>
  </div>
  <div id="content"><div style="display:grid;gap:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:90%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:20%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:86%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:80%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:74%"></div></div></div></div>`,`
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
  `),cs=q("Users & Groups",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Users &amp; Groups</h2>
    <div class="ks-page-header-actions"></div>
  </div>
  <div id="content"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:42%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:22%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:34px"></div><div class="ks-skeleton-bar" style="height:10px;width:26px"></div><div class="ks-skeleton-bar" style="height:10px;width:26px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:50px"></div><div class="ks-skeleton-bar" style="height:10px;width:66px"></div></div><div style="display:grid;grid-template-columns:1.2fr 70px 70px 1.2fr 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:70px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:70px"></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:24%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:82%"></div></div></div>`,`
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
  `),ps=q("System Info",`<div class="ks-page-header">
    <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">System Info</h2>
    <div class="ks-page-header-actions"></div>
  </div>
  <div id="content"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:28%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:64%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:32%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:52%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:36%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:44%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:16px;width:48%"></div></div></div><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:80px"></div><div class="ks-skeleton-bar" style="height:10px;width:140px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:74px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:86px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div></div></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:60px"></div><div class="ks-skeleton-bar" style="height:10px;width:160px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:96px"></div></div></div></div></div>`,`
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
  `),ms=q("Server Properties",`<div class="ks-page-header">
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
<details style="margin-top:12px"><summary class="ks-muted" style="font-size:12px;cursor:pointer">Raw file preview</summary><pre id="raw" class="ks-mono" style="font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:8px;padding:10px;max-height:300px;overflow:auto"></pre></details>`,`(function () {
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
`),hs=q("Player Manager",`<div class="ks-page-header">
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
  <div id="playerdata" style="margin-top:12px"><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1fr 100px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div></div><div style="display:grid;grid-template-columns:1fr 100px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:82px"></div><div class="ks-skeleton" style="height:10px;width:28px"></div></div></div></div>`,`
    async function load(){
      el('content').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:42%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:28%;margin-bottom:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:38%;margin-bottom:10px"></div><div class="ks-skeleton-bar" style="height:22px;width:22%;margin-bottom:8px"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:34px"></div><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:60px"></div></div><div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:54px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div></div></div>';
      var w = '', o = '', b = '', pd = '';
      try { var r = await act('read_whitelist'); w = (r.data || r.stdout || '') + ''; } catch(e){ w = 'whitelist.json: ' + e.message; }
      try { var r2 = await act('read_ops'); o = (r2.data || r2.stdout || '') + ''; } catch(e){ o = 'ops.json: ' + e.message; }
      try { var r3 = await act('read_banned'); b = (r3.data || r3.stdout || '') + ''; } catch(e){ b = 'banned-players.json: ' + e.message; }
      try { var r4 = await act('list_playerdata'); pd = JSON.stringify(r4.data || r4.stdout || '', null, 2); } catch(e){ pd = 'world/playerdata: ' + e.message; }
      function tryJson(s){ try{ var j=JSON.parse(s); return Array.isArray(j)? j : []; } catch{ return s ? s.trim().split('
').filter(Boolean) : []; } }
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
  `),us=q("World Import",`<div class="ks-page-header">
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
  <div id="unzipOut" style="display:none;margin-top:0.75rem"></div>`,`
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:30%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:78%;margin-bottom:8px"></div></div>';
      try{
        var r = await act('list_world');
        var data = r.data || r.stdout || '';
        var txt = '';
        if (Array.isArray(data)) txt = data.map(function(f){ return (f.is_dir?'d ':'f ') + f.name + '  ' + (f.size||0) + '  ' + (f.mode||''); }).join('
');
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
  `),gs=q("Plugin Manager",`<div class="ks-page-header">
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
  <div id="out" style="display:none;margin-top:0.75rem"></div>`,`
    async function load(){
      el('content').innerHTML = '<div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton-bar" style="height:10px;width:40px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:28px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:grid;grid-template-columns:1.2fr 80px 60px 90px;gap:12px;padding:12px 14px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton" style="height:10px;width:24px"></div><div class="ks-skeleton" style="height:10px;width:18px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div></div></div>';
      try{
        var r = await act('list_plugins');
        var data = r.data || r.stdout || '';
        var rows = [];
        if (Array.isArray(data)) rows = data;
        else {
          var txt = String(data);
          rows = txt.split('
').filter(Boolean).map(function(l){ var p=l.trim().split(/s+/); return {name:p[p.length-1]||l, size:0, is_dir:false, mode:''}; });
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
    el('btnRemove').onclick = async function(){ var v=el('pluginUrl').value.trim(); if(!v){ toast('Enter plugin name without .jar','error'); return; } var name=v.replace(/.jar$/,''); if(!(await ask('rm plugins/' + name + '.jar ? This deletes the jar.'))) return; try{ var r=await act('remove_plugin', [name]); var out=(r.stdout||'')+(r.stderr||''); el('out').style.display='block'; el('out').innerHTML=cardUnit('remove','rm result (exit '+(r.exit_code!=null?r.exit_code:'?')+')', pre(out||'(no output)')); toast('rm finished', r.exit_code===0?'success':'error'); load(); } catch(e){ toast(e.message,'error'); } };
    el('btnWriteConfig').onclick = async function(){ var p=el('configPath').value.trim(); if(!p){ toast('Enter config path','error'); return; } if(!(await ask('Write ' + p + ' ?'))) return; try{ var r=await act('write_plugin_config'); toast('write_plugin_config: exit '+(r.exit_code!=null?r.exit_code:'?'), r.exit_code===0?'success':'error'); if(r.exit_code===0) load(); } catch(e){ toast(e.message,'error'); } };
    await load();
  `),vs=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:120px"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:12px;width:33%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:50%;margin-bottom:6px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:12px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:44%;margin-bottom:6px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:12px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:6px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:12px;width:30%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:54%;margin-bottom:6px"></div><div class="ks-skeleton-bar" style="height:10px;width:70%"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function timeAgo(iso) {
    if (!iso) return '—';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var diff = Date.now() - t;
    if (diff < 0) {
      var fu = -diff;
      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';
      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';
      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';
    }
    var s = Math.round(diff / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(iso).toLocaleString();
  }

  var state = { rows: [], loading: true, error: '' };
  var base = function () { return '/api/instances/' + sdk.instance.id; };

  function actionColor(action) {
    var a = String(action || '');
    if (a.indexOf('automation') === 0) return 'var(--ks-purple)';
    if (a.indexOf('secret') === 0) return 'var(--ks-warn)';
    if (a.indexOf('snapshot') === 0) return 'var(--ks-info)';
    return 'var(--ks-ok)';
  }

  function load() {
    state.loading = true; state.error = '';
    render();
    sdk.fetchPanel(base() + '/audit?limit=200')
      .then(function (rows) { state.rows = Array.isArray(rows) ? rows : []; state.loading = false; render(); })
      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load audit'; render(); });
  }

  function render() {
    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Audit log</h2>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"' + (state.loading ? ' disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div>';

    if (state.error) html += '<p style="font-size:12px;color:var(--ks-bad);margin-top:10px">' + esc(state.error) + '</p>';

    html += '<div class="ks-ip-scroll-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px">';
    if (state.loading) {
      for (var i = 0; i < 4; i++) {
        html += '<div class="ks-card"><div style="height:12px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
          + '<div style="height:10px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:6px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
          + '<div style="height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite"></div></div>';
      }
    } else if (state.rows.length === 0) {
      html += '<div class="ks-card"><p class="ks-muted" style="font-size:12px;margin:0;padding:6px 12px">No audit entries yet.</p></div>';
    } else {
      state.rows.forEach(function (r) {
        html += '<div class="ks-card" data-ks-key="' + esc(String(r.id)) + '" style="display:flex;flex-direction:column;gap:10px">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
          + '<span class="ks-badge" style="color:' + actionColor(r.action) + '">' + esc(r.action) + '</span>'
          + '<span class="ks-muted" style="font-size:11px;white-space:nowrap">' + timeAgo(r.created_at) + '</span></div>'
          + '<div style="font-size:13px;font-weight:500;color:var(--ks-secondary)">' + esc(r.actor || 'system') + '</div>'
          + (r.detail ? '<p class="ks-muted" style="font-size:12px;margin:0;word-break:break-all">' + esc(r.detail) + '</p>' : '')
          + '</div>';
      });
    }
    html += '</div>';
    document.getElementById('root').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="refresh"]'), function (b) { b.addEventListener('click', load); });
  }

  function start(s) { sdk = s; load(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
<\/script>
`,xs=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:132px"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div></div><div style="display:flex;gap:4px;border-bottom:1px solid var(--ks-card-border);margin-top:12px;padding-bottom:8px"><div class="ks-skeleton-bar" style="height:14px;width:56px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:14px;width:96px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:44%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:52%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:54%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:40%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:68%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function timeAgo(iso) {
    if (!iso) return '—';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var diff = Date.now() - t;
    if (diff < 0) {
      var fu = -diff;
      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';
      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';
      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';
    }
    var s = Math.round(diff / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(iso).toLocaleString();
  }

  var state = { jobs: [], runs: [], loading: true, error: '', busy: false, tab: 'tasks', modal: null, runResult: null, formError: '' };
  var base = function () { return '/api/instances/' + sdk.instance.id; };
  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==="function")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}

  function load() {
    state.loading = true; state.error = '';
    render();
    Promise.all([
      sdk.fetchPanel(base() + '/automation/'),
      sdk.fetchPanel(base() + '/automation/runs?limit=50')
    ]).then(function (res) {
      state.jobs = Array.isArray(res[0]) ? res[0] : [];
      state.runs = Array.isArray(res[1]) ? res[1] : [];
      state.loading = false; render();
    }).catch(function (e) {
      state.loading = false;
      state.error = (e && e.message) || 'Failed to load automation';
      render();
    });
  }

  async function remove(j) {
    if (!(await ask('Delete automation "' + j.name + '"? Run history will be removed.'))) return;
    sdk.fetchPanel(base() + '/automation/' + j.id, { method: 'DELETE' })
      .then(load)
      .catch(function (e) { state.error = (e && e.message) || 'Failed to delete job'; render(); });
  }

  function runNow(j) {
    state.busy = true; state.error = ''; state.runResult = null;
    render();
    sdk.fetchPanel(base() + '/automation/' + j.id + '/run', { method: 'POST' })
      .then(function (r) {
        state.runResult = { jobId: j.id, r: r };
        state.tab = 'runs'; state.busy = false;
        load();
      })
      .catch(function (e) { state.busy = false; state.error = (e && e.message) || 'Run failed'; render(); });
  }

  function submitModal() {
    var m = state.modal;
    if (!m.name || !m.command) { state.formError = 'Name and command are required.'; render(); return; }
    state.busy = true; state.formError = '';
    render();
    var payload = {
      name: m.name, command: m.command, schedule: m.schedule,
      enabled: !!m.enabled, secret_refs: m.secret_refs, timeout_sec: Number(m.timeout_sec) || 300
    };
    var p = m.editing
      ? sdk.fetchPanel(base() + '/automation/' + m.editing.id, { method: 'PUT', body: JSON.stringify(payload) })
      : sdk.fetchPanel(base() + '/automation/', { method: 'POST', body: JSON.stringify(payload) });
    p.then(function () { state.busy = false; state.modal = null; load(); })
      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Failed to save job'; render(); });
  }

  // ---- modal ---------------------------------------------------------------
  function field(label, inputHtml, hint) {
    return '<div><label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">' + label + '</label>'
      + inputHtml + (hint ? '<p class="ks-muted" style="font-size:11px;margin:4px 0 0">' + hint + '</p>' : '') + '</div>';
  }
  function buildModal() {
    var m = state.modal;
    if (!m) return '';
    var inner = ''
      + (state.formError ? '<p style="font-size:12px;color:var(--ks-bad);margin:0 0 10px">' + esc(state.formError) + '</p>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
      + field('Name', '<input id="f-name" type="text" value="' + esc(m.name) + '" placeholder="Backup the world">')
      + field('Schedule (cron)', '<input id="f-sched" type="text" value="' + esc(m.schedule) + '" placeholder="0 4 * * *">', '5 fields, e.g. “*/10 * * * *”. Empty = manual only.')
      + '<div style="grid-column:1/-1">' + field('Command', '<textarea id="f-cmd" rows="3" style="width:100%">' + esc(m.command) + '</textarea>', 'Run inside the instance via /bin/sh -c.') + '</div>'
      + field('Secret refs (comma-separated)', '<input id="f-refs" type="text" value="' + esc((m.secret_refs || []).join(', ')) + '" placeholder="BACKUP_S3_KEY, BACKUP_S3_SECRET">', 'Names of vaulted secrets to inject as env.')
      + field('Timeout (sec)', '<input id="f-timeout" type="number" value="' + esc(m.timeout_sec) + '">')
      + '<div style="display:flex;align-items:end;padding-bottom:4px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ks-body);cursor:pointer"><input id="f-enabled" type="checkbox"' + (m.enabled ? ' checked' : '') + ' style="accent-color:var(--ks-info)"> Enabled</label></div>'
      + '</div>';
    return '<div class="ks-ip-modal-overlay" data-overlay="1" style="position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease">'
      + '<div class="ks-ip-modal-panel" style="background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:600px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column" onclick="event.stopPropagation()">'
      + '<div class="ks-ip-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10">'
      + '<h3 class="ks-ip-modal-title" style="font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0">' + (m.editing ? 'Edit “' + esc(m.editing.name) + '”' : 'Create task') + '</h3>'
      + '<button type="button" class="ks-ip-modal-close ks-modal-close" style="border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
      + '<div class="ks-ip-modal-body" style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">' + inner + '</div>'
      + '<div class="ks-ip-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)">'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-ghost" data-action="cancel">Cancel</button>'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-primary" data-action="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : (m.editing ? 'Save' : 'Create task')) + '</button>'
      + '</div></div></div>';
  }

  function skeletonCard() {
    return '<div class="ks-card"><div style="height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
      + '<div style="height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
      + '<div style="height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite"></div></div>';
  }
  function pre(text, cls) {
    return '<pre class="ks-mono" style="margin:0;font-size:12px;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-all;overflow:auto;max-height:96px;color:' + (cls || 'var(--ks-secondary)') + '">' + esc(text || '') + '</pre>';
  }

  function render() {
    var ae = document.activeElement;
    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }
      : null;
    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Automation</h2>'
      + '<div style="display:flex;gap:8px">'
      + '<button title="Create" aria-label="Create" type="button" class="ks-btn-header ks-icon-btn" data-action="create"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"' + (state.loading ? ' disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div></div>';

    if (state.error) html += '<p style="font-size:12px;color:var(--ks-bad);margin-top:10px">' + esc(state.error) + '</p>';

    // tabs
    html += '<div style="display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--ks-card-border);margin-top:12px">'
      + [['tasks', 'Tasks'], ['runs', 'Recent runs']].map(function (t) {
        var on = state.tab === t[0];
        return '<button type="button" data-tab="' + t[0] + '" style="padding:8px 16px;font-size:14px;border:none;border-bottom:2px solid ' + (on ? 'var(--ks-heading)' : 'transparent') + ';background:transparent;color:' + (on ? 'var(--ks-heading)' : 'var(--ks-muted)') + ';cursor:pointer;margin-bottom:-1px;font-family:inherit">' + t[1] + '</button>';
      }).join('')
      + '</div><div style="margin-top:12px">';

    if (state.tab === 'tasks') {
      if (state.loading) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
        for (var i = 0; i < 3; i++) html += skeletonCard();
        html += '</div>';
      } else if (state.jobs.length === 0) {
        html += '<div class="ks-card"><p class="ks-muted" style="font-size:12px;margin:0;padding:6px 12px">No tasks yet. Click “Create” to add one.</p></div>';
      } else {
        html += '<div class="ks-ip-scroll-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px">';
        state.jobs.forEach(function (j) {
          html += '<div class="ks-card" data-ks-key="' + esc(String(j.id)) + '" style="display:flex;flex-direction:column;gap:10px">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
            + '<div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(j.name) + '</div>'
            + '<span class="ks-badge" style="margin-top:4px;color:' + (j.enabled ? 'var(--ks-ok)' : 'var(--ks-secondary)') + '">' + (j.enabled ? 'enabled' : 'disabled') + '</span></div>'
            + '<div style="display:flex;gap:4px;flex-shrink:0">'
            + '<button type="button" class="ks-btn-header ks-icon-btn" data-run="' + j.id + '" title="Run now" aria-label="Run now"' + (state.busy ? ' disabled' : '') + '>▶ Run</button>'
            + '<button type="button" class="ks-btn-header ks-icon-btn" data-edit="' + j.id + '" title="Edit" aria-label="Edit">✎</button>'
            + '<button type="button" class="ks-btn-header ks-icon-btn" style="color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important" data-del="' + j.id + '" title="Delete" aria-label="Delete">🗑</button>'
            + '</div></div>'
            + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--ks-muted);">'
            + '<span class="ks-mono" style="padding:2px 6px;border-radius:4px;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);color:var(--ks-body)">' + esc(j.schedule || 'manual') + '</span>'
            + '<span title="Last run">last ' + timeAgo(j.last_run_at) + '</span><span style="color:var(--ks-faint)">·</span>'
            + '<span title="Next run">next ' + timeAgo(j.next_run_at) + '</span><span style="color:var(--ks-faint)">·</span>'
            + '<span>' + (j.timeout_sec || 300) + 's</span></div>'
            + pre(j.command)
            + ((j.secret_refs || []).length > 0
              ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + j.secret_refs.map(function (s) {
                return '<span class="ks-mono" style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--ks-warn-wash);color:var(--ks-warn);border:1px solid var(--ks-warn-line)">' + esc(s) + '</span>';
              }).join('') + '</div>'
              : '')
            + '</div>';
        });
        html += '</div>';
      }
    } else {
      // runs tab
      if (state.runResult) {
        html += '<div class="ks-card" style="margin-bottom:12px"><h3 style="font-size:13px;font-weight:600;margin:0 0 2px;color:var(--ks-heading)">Last run — job #' + state.runResult.jobId + '</h3>'
          + '<p class="ks-muted" style="font-size:12px;margin:0 0 8px">exit=' + esc(state.runResult.r.exit_code) + ' · ' + esc(state.runResult.r.duration_ms) + 'ms</p>'
          + (state.runResult.r.error
            ? pre(state.runResult.r.error, 'var(--ks-bad)')
            : pre(state.runResult.r.stdout || '(no stdout)', 'var(--ks-ok-soft)'))
          + (state.runResult.r.stderr ? pre(state.runResult.r.stderr, 'var(--ks-warn-soft)') : '')
          + '</div>';
      }
      if (state.runs.length === 0) {
        html += '<div class="ks-card"><p class="ks-muted" style="font-size:12px;margin:0;padding:6px 12px">No runs recorded.</p></div>';
      } else {
        html += '<div class="ks-ip-scroll-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px">';
        state.runs.forEach(function (r) {
          var failed = r.error || r.exit_code !== 0;
          html += '<div class="ks-card" data-ks-key="' + esc(String(r.id)) + '" style="display:flex;flex-direction:column;gap:10px">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<span class="ks-badge" style="color:' + (r.trigger === 'schedule' ? 'var(--ks-info)' : 'var(--ks-purple)') + '">' + esc(r.trigger) + '</span>'
            + '<span class="ks-mono" style="font-size:12px;color:' + (failed ? 'var(--ks-bad)' : 'var(--ks-ok)') + '">' + (r.error ? 'err' : 'exit ' + esc(r.exit_code)) + '</span></div>'
            + pre(r.command)
            + (r.stdout ? pre(r.stdout, 'var(--ks-ok-soft)') : '')
            + (r.stderr ? pre(r.stderr, 'var(--ks-warn-soft)') : '')
            + (r.error ? pre(r.error, 'var(--ks-bad)') : '')
            + '<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--ks-muted)"><span>' + timeAgo(r.started_at) + '</span><span style="font-variant-numeric:tabular-nums">' + esc(r.duration_ms) + 'ms</span></div>'
            + '</div>';
        });
        html += '</div>';
      }
    }
    html += '</div>';
    html += buildModal();
    document.getElementById('root').innerHTML = html;
    wire();
    // A re-render mid-typing (e.g. the initial load resolving) rebuilt the
    // fields — put the caret back so typing continues seamlessly.
    restoreFocus(prevFocus);
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    var bind = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) { b.addEventListener('click', fn); }); };
    bind('[data-action="refresh"]', load);
    bind('[data-action="create"]', function () {
      state.formError = '';
      state.modal = { name: '', command: '', schedule: '', enabled: true, secret_refs: [], timeout_sec: 300, editing: null };
      render(); focusField('f-name');
    });
    bind('[data-run]', function (ev) {
      var id = Number(ev.currentTarget.getAttribute('data-run'));
      var j = state.jobs.filter(function (x) { return x.id === id; })[0];
      if (j) runNow(j);
    });
    bind('[data-del]', function (ev) {
      var id = Number(ev.currentTarget.getAttribute('data-del'));
      var j = state.jobs.filter(function (x) { return x.id === id; })[0];
      if (j) remove(j);
    });
    bind('[data-edit]', function (ev) {
      var id = Number(ev.currentTarget.getAttribute('data-edit'));
      var j = state.jobs.filter(function (x) { return x.id === id; })[0];
      if (!j) return;
      state.formError = '';
      state.modal = {
        name: j.name, command: j.command, schedule: j.schedule, enabled: !!j.enabled,
        secret_refs: j.secret_refs || [], timeout_sec: j.timeout_sec || 300, editing: j
      };
      render(); focusField('f-name');
    });

    var overlay = document.querySelector('[data-overlay]');
    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });
    var cb = document.querySelector('.ks-modal-close');
    if (cb) cb.addEventListener('click', closeModal);
    var cancel = document.querySelector('[data-action="cancel"]');
    if (cancel) cancel.addEventListener('click', closeModal);
    var sub = document.querySelector('[data-action="submit"]');
    if (sub) sub.addEventListener('click', submitModal);
  }
  // Field values sync through DELEGATED listeners bound once at startup.
  // Every render() rebuilds the modal markup (busy state, failed save,
  // background load finishing while the dialog is open); per-node listeners
  // attached when the dialog opens die with their nodes on those rebuilds,
  // desyncing what the user typed from state (text vanishing on the next
  // paint or stale values being submitted). Delegation survives re-renders.
  function wireFields() {
    var FIELDS = {
      'f-name': function (v) { state.modal.name = v.trim(); },
      'f-cmd': function (v) { state.modal.command = v; },
      'f-sched': function (v) { state.modal.schedule = v.trim(); },
      'f-refs': function (v) { state.modal.secret_refs = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); },
      'f-timeout': function (v) { state.modal.timeout_sec = Number(v) || 300; }
    };
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);
    }, true);
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.id === 'f-enabled' && state.modal) state.modal.enabled = t.checked;
    }, true);
  }
  function focusField(id) {
    var f = document.getElementById(id);
    if (!f) return;
    f.focus();
    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}
  }
  function restoreFocus(prev) {
    if (!prev || !prev.id) return;
    var f = document.getElementById(prev.id);
    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;
    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {
      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}
    }
  }
  function closeModal() { state.modal = null; state.formError = ''; render(); }

  function start(s) { sdk = s; wireFields(); load(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });

  var st = document.createElement('style');
  st.textContent = '@keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}';
  document.head.appendChild(st);
})();
<\/script>
`,ks=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:168px"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:32%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:52%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:36%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:44%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:28%"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = Number(bytes);
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i >= 3 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
  }
  function timeAgo(iso) {
    if (!iso) return '—';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var diff = Date.now() - t;
    if (diff < 0) {
      var fu = -diff;
      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';
      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';
      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';
    }
    var s = Math.round(diff / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(iso).toLocaleString();
  }

  var state = { rows: [], loading: true, error: '', modal: null, busy: false, formError: '' };
  var base = function () { return '/api/instances/' + sdk.instance.id; };
  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==="function")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}

  function load() {
    state.loading = true; state.error = '';
    render();
    sdk.fetchPanel(base() + '/snapshots/')
      .then(function (rows) { state.rows = Array.isArray(rows) ? rows : []; state.loading = false; render(); })
      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load snapshots'; render(); });
  }

  function create() {
    var m = state.modal;
    if (!m || !m.name) { state.formError = 'A name is required.'; render(); return; }
    state.busy = true; state.formError = '';
    render();
    sdk.fetchPanel(base() + '/snapshots/', {
      method: 'POST',
      body: JSON.stringify({ name: m.name, note: m.note, type: m.type, location: m.location })
    })
      .then(function () { state.busy = false; state.modal = null; load(); })
      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Create failed'; render(); });
  }

  async function restore(s) {
    if (!(await ask('Restore snapshot "' + s.name + '"? The instance will be rolled back. This is destructive to current state.'))) return;
    sdk.fetchPanel(base() + '/snapshots/' + encodeURIComponent(s.name) + '/restore', { method: 'POST' })
      .then(load)
      .catch(function (e) { state.error = (e && e.message) || 'Restore failed'; render(); });
  }

  async function remove(s) {
    if (!(await ask('Delete snapshot "' + s.name + '"? This cannot be undone.'))) return;
    sdk.fetchPanel(base() + '/snapshots/' + encodeURIComponent(s.name), { method: 'DELETE' })
      .then(load)
      .catch(function (e) { state.error = (e && e.message) || 'Delete failed'; render(); });
  }

  function field(label, inputHtml, hint) {
    return '<div><label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">' + label + '</label>'
      + inputHtml + (hint ? '<p class="ks-muted" style="font-size:11px;margin:4px 0 0">' + hint + '</p>' : '') + '</div>';
  }

  function buildModal() {
    var m = state.modal;
    if (!m) return '';
    var inner = ''
      + (state.formError ? '<p style="font-size:12px;color:var(--ks-bad);margin:0 0 10px">' + esc(state.formError) + '</p>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'
      + field('Name (unique)', '<input id="f-name" type="text" value="' + esc(m.name) + '" placeholder="pre-update-2026-07-24">')
      + field('Type', '<input id="f-type" type="text" value="' + esc(m.type) + '" placeholder="tar">', 'Format: tar, zip, docker, lxd, etc. (default: driver-specific)')
      + field('Location', '<input id="f-loc" type="text" value="' + esc(m.location) + '" placeholder="/mc/">', 'Storage path: /mc/, /tmp/snapshots/, etc. (default: driver-specific)')
      + '<div style="grid-column:span 2">' + field('Note (optional)', '<input id="f-note" type="text" value="' + esc(m.note) + '" placeholder="Before kernel bump">') + '</div>'
      + '</div>';
    return '<div class="ks-ip-modal-overlay" data-overlay="1" style="position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease">'
      + '<div class="ks-ip-modal-panel" style="background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:540px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column" onclick="event.stopPropagation()">'
      + '<div class="ks-ip-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10">'
      + '<h3 class="ks-ip-modal-title" style="font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0">Create snapshot</h3>'
      + '<button type="button" class="ks-ip-modal-close ks-modal-close" style="border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
      + '<div class="ks-ip-modal-body" style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">' + inner + '</div>'
      + '<div class="ks-ip-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)">'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-ghost" data-action="cancel">Cancel</button>'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-primary" data-action="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Creating…' : 'Create snapshot') + '</button>'
      + '</div></div></div>';
  }

  function render() {
    var ae = document.activeElement;
    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }
      : null;
    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Backups &amp; Snapshots</h2>'
      + '<div style="display:flex;gap:8px">'
      + '<button title="Create" aria-label="Create" type="button" class="ks-btn-header ks-icon-btn" data-action="create"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"' + (state.loading ? ' disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div></div>';

    if (state.error) html += '<p style="font-size:12px;color:var(--ks-bad);margin-top:10px">' + esc(state.error) + '</p>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px">';
    if (state.loading) {
      for (var i = 0; i < 3; i++) {
        html += '<div class="ks-card"><div style="height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
          + '<div style="height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
          + '<div style="height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite"></div></div>';
      }
    } else if (state.rows.length === 0) {
      html += '<div class="ks-card"><p class="ks-muted" style="font-size:12px;margin:0;padding:6px 12px">No snapshots yet. Click “Create snapshot” to add one.</p></div>';
    } else {
      state.rows.forEach(function (s) {
        html += '<div class="ks-card" data-ks-key="' + esc(String(s.id)) + '" style="display:flex;flex-direction:column;gap:10px">'
          + '<div><div style="font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(s.name) + '</div>'
          + '<span class="ks-badge ks-mono" style="margin-top:4px">' + esc(s.external_ref || '—') + '</span></div>'
          + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-muted);">'
          + '<span>' + (s.size_bytes ? fmtBytes(s.size_bytes) : '—') + '</span><span style="color:var(--ks-faint)">·</span><span>' + timeAgo(s.created_at) + '</span></div>'
          + (s.note ? '<p class="ks-muted" style="font-size:12px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(s.note) + '">' + esc(s.note) + '</p>' : '')
          + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:6px;border-top:1px solid var(--ks-card-border)">'
          + '<button type="button" class="ks-btn-header ks-icon-btn" data-restore="' + esc(s.id) + '" title="Restore" aria-label="Restore">Restore</button>'
          + '<button type="button" class="ks-btn-header ks-icon-btn" style="color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important" data-delete="' + esc(s.id) + '" title="Delete" aria-label="Delete">Delete</button>'
          + '</div></div>';
      });
    }
    html += '</div>';
    html += buildModal();
    document.getElementById('root').innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('[data-action="refresh"]'), function (b) { b.addEventListener('click', load); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="create"]'), function (b) {
      b.addEventListener('click', function () {
        state.formError = '';
        state.modal = { name: '', note: '', type: '', location: '' };
        render(); focusField('f-name');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-restore]'), function (b) {
      b.addEventListener('click', function () {
        var s = state.rows.filter(function (x) { return String(x.id) === b.getAttribute('data-restore'); })[0];
        if (s) restore(s);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-delete]'), function (b) {
      b.addEventListener('click', function () {
        var s = state.rows.filter(function (x) { return String(x.id) === b.getAttribute('data-delete'); })[0];
        if (s) remove(s);
      });
    });

    var overlay = document.querySelector('[data-overlay]');
    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });
    var cb = document.querySelector('.ks-modal-close');
    if (cb) cb.addEventListener('click', closeModal);
    var cancel = document.querySelector('[data-action="cancel"]');
    if (cancel) cancel.addEventListener('click', closeModal);
    var sub = document.querySelector('[data-action="submit"]');
    if (sub) sub.addEventListener('click', create);
    restoreFocus(prevFocus);
  }

  // Field values sync through DELEGATED listeners bound once at startup so
  // re-renders (busy state, failed save, background load finishing) can never
  // desync what the operator typed from state. See Automation for detail.
  function wireFields() {
    var FIELDS = {
      'f-name': function (v) { state.modal.name = v.trim(); },
      'f-type': function (v) { state.modal.type = v.trim(); },
      'f-loc': function (v) { state.modal.location = v.trim(); },
      'f-note': function (v) { state.modal.note = v.trim(); }
    };
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);
    }, true);
  }
  function focusField(id) {
    var f = document.getElementById(id);
    if (!f) return;
    f.focus();
    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}
  }
  function restoreFocus(prev) {
    if (!prev || !prev.id) return;
    var f = document.getElementById(prev.id);
    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;
    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {
      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}
    }
  }
  function closeModal() { state.modal = null; state.formError = ''; render(); }

  function start(s) { sdk = s; wireFields(); load(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
<\/script>
`,fs=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:124px"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div></div><div class="ks-card" style="margin-top:12px"><div class="ks-skeleton-bar" style="height:14px;width:28%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:14px"></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:44%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:32%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:36%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:40%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:68%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:28%"></div></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function timeAgo(iso) {
    if (!iso) return '—';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var diff = Date.now() - t;
    if (diff < 0) {
      var fu = -diff;
      if (fu < 60000) return 'in ' + Math.round(fu / 1000) + 's';
      if (fu < 3600000) return 'in ' + Math.floor(fu / 60000) + 'm';
      if (fu < 86400000) return 'in ' + Math.floor(fu / 3600000) + 'h';
    }
    var s = Math.round(diff / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(iso).toLocaleString();
  }

  var state = { secrets: [], loading: true, error: '', revealed: {}, modal: null, busy: false, formError: '' };
  var base = function () { return '/api/instances/' + sdk.instance.id; };
  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==="function")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}

  function load() {
    state.loading = true; state.error = '';
    render();
    sdk.fetchPanel(base() + '/secrets/')
      .then(function (rows) {
        state.secrets = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.secrets) ? rows.secrets : []);
        state.loading = false; render();
      })
      .catch(function (e) {
        state.loading = false;
        state.error = (e && e.message) || 'Failed to load secrets';
        render();
      });
  }

  function reveal(key) {
    sdk.fetchPanel(base() + '/secrets/' + encodeURIComponent(key))
      .then(function (r) { state.revealed[key] = r && r.value ? r.value : ''; render(); })
      .catch(function (e) { state.error = (e && e.message) || 'Reveal failed'; render(); });
  }

  async function remove(key) {
    if (!(await ask('Delete secret "' + key + '"? This cannot be undone.'))) return;
    sdk.fetchPanel(base() + '/secrets/' + encodeURIComponent(key), { method: 'DELETE' })
      .then(function () { delete state.revealed[key]; load(); })
      .catch(function (e) { state.error = (e && e.message) || 'Delete failed'; render(); });
  }

  function submitModal() {
    var m = state.modal;
    if (!m.key) { state.formError = 'Key is required.'; render(); return; }
    state.busy = true; state.formError = '';
    render();
    var payload = {
      key: m.editing ? m.editing.key : m.key,
      value: m.value,
      is_secret: !!m.is_secret,
      description: m.description
    };
    sdk.fetchPanel(base() + '/secrets/', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () { state.busy = false; state.modal = null; delete state.revealed[payload.key]; load(); })
      .catch(function (e) { state.busy = false; state.formError = (e && e.message) || 'Failed to save'; render(); });
  }

  function buildModal() {
    var m = state.modal;
    if (!m) return '';
    var inner = ''
      + (state.formError ? '<p style="font-size:12px;color:var(--ks-bad);margin:0 0 10px">' + esc(state.formError) + '</p>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
      + '<div><label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Key (unique per instance)</label>'
      + '<input id="f-key" type="text" value="' + esc(m.key) + '" placeholder="DATABASE_URL"' + (m.editing ? ' readonly style="opacity:.7"' : '') + '></div>'
      + '<div><label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Value</label>'
      + '<input id="f-value" type="' + (m.is_secret ? 'password' : 'text') + '" value="' + esc(m.value) + '" placeholder="' + (m.is_secret ? '••••••••' : 'production') + '"></div>'
      + '<div><label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Description (optional)</label>'
      + '<input id="f-desc" type="text" value="' + esc(m.description) + '" placeholder="Primary DB connection string"></div>'
      + '<div style="display:flex;align-items:end;padding-bottom:4px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ks-body);cursor:pointer">'
      + '<input id="f-secret" type="checkbox"' + (m.is_secret ? ' checked' : '') + ' style="accent-color:var(--ks-info)"> Mask as secret</label></div>'
      + '</div>';
    return '<div class="ks-ip-modal-overlay" data-overlay="1" style="position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease">'
      + '<div class="ks-ip-modal-panel" style="background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:560px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column" onclick="event.stopPropagation()">'
      + '<div class="ks-ip-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10">'
      + '<h3 class="ks-ip-modal-title" style="font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0">' + (m.editing ? 'Edit “' + esc(m.editing.key) + '”' : 'Add variable') + '</h3>'
      + '<button type="button" class="ks-ip-modal-close ks-modal-close" style="border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
      + '<div class="ks-ip-modal-body" style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">' + inner + '</div>'
      + '<div class="ks-ip-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)">'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-ghost" data-action="cancel">Cancel</button>'
      + '<button type="button" class="ks-ip-btn ks-ip-btn-primary" data-action="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : (m.editing ? 'Save' : 'Add variable')) + '</button>'
      + '</div></div></div>';
  }

  function skeletonCard() {
    return '<div class="ks-card"><div style="height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
      + '<div style="height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
      + '<div style="height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite"></div></div>';
  }

  function render() {
    var ae = document.activeElement;
    var prevFocus = (ae && ae.id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
      ? { id: ae.id, pos: (typeof ae.selectionStart === 'number' ? ae.selectionStart : null) }
      : null;
    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Env &amp; Secrets</h2>'
      + '<div style="display:flex;gap:8px">'
      + '<button title="Add" aria-label="Add" type="button" class="ks-btn-header ks-icon-btn" data-action="add"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"' + (state.loading ? ' disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div></div>';

    if (state.error) html += '<p style="font-size:12px;color:var(--ks-bad);margin-top:10px">' + esc(state.error) + '</p>';

    html += '<div style="margin-top:12px">';

    if (state.loading) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">';
      for (var i = 0; i < 3; i++) html += skeletonCard();
      html += '</div>';
    } else if (state.secrets.length === 0) {
      html += '<p class="ks-muted" style="font-size:12px;padding:6px 12px;margin:0">No variables stored. Click “Add” to add one.</p>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
      state.secrets.forEach(function (s) {
        var shown;
        if (s.is_secret) shown = state.revealed[s.key] != null ? state.revealed[s.key] : (s.masked_value || '••••');
        else shown = s.value || '—';
        html += '<div class="ks-card" data-ks-key="' + esc(s.key) + '" style="display:flex;flex-direction:column;gap:10px">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
          + '<div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--ks-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(s.key) + '</div>'
          + '<span class="ks-badge" style="margin-top:4px;color:' + (s.is_secret ? 'var(--ks-warn)' : 'var(--ks-info)') + ';border-color:' + (s.is_secret ? 'var(--ks-warn-line)' : 'var(--ks-info-line)') + '">' + (s.is_secret ? 'secret' : 'env') + '</span></div>'
          + '<div style="display:flex;gap:4px;flex-shrink:0">'
          + '<button type="button" class="ks-btn-header ks-icon-btn" data-edit="' + esc(s.key) + '" title="Edit" aria-label="Edit">✎</button>'
          + '<button type="button" class="ks-btn-header ks-icon-btn" style="color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important" data-del="' + esc(s.key) + '" title="Delete" aria-label="Delete">🗑</button>'
          + '</div></div>'
          + '<div style="display:flex;align-items:flex-start;gap:8px"><span class="ks-mono ks-muted" style="font-size:12px;flex-shrink:0">Value:</span>'
          + '<span class="ks-mono" style="font-size:12px;color:var(--ks-body);word-break:break-all;white-space:pre-wrap">' + esc(shown)
          + (s.is_secret && state.revealed[s.key] == null ? ' <button type="button" class="ks-btn-header ks-icon-btn" data-reveal="' + esc(s.key) + '" style="padding:1px 6px;font-size:10px" title="Reveal" aria-label="Reveal">reveal</button>' : '')
          + '</span></div>'
          + (s.description ? '<div style="display:flex;align-items:flex-start;gap:8px"><span class="ks-mono ks-muted" style="font-size:12px;flex-shrink:0">Description:</span><span style="font-size:12px;color:var(--ks-body);word-break:break-all">' + esc(s.description) + '</span></div>' : '')
          + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-muted)"><span class="ks-mono">Updated:</span><span style="color:var(--ks-secondary)">' + timeAgo(s.updated_at) + '</span></div>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    html += buildModal();
    document.getElementById('root').innerHTML = html;
    wire();
    restoreFocus(prevFocus);
  }

  function wire() {
    var bind = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) { b.addEventListener('click', fn); }); };
    bind('[data-action="refresh"]', load);
    bind('[data-action="add"]', function () {
      state.formError = '';
      state.modal = { key: '', value: '', is_secret: true, description: '', editing: null };
      render(); focusField('f-key');
    });
    bind('[data-reveal]', function (ev) { reveal(ev.currentTarget.getAttribute('data-reveal')); });
    bind('[data-del]', function (ev) { remove(ev.currentTarget.getAttribute('data-del')); });
    bind('[data-edit]', function (ev) {
      var key = ev.currentTarget.getAttribute('data-edit');
      var s = state.secrets.filter(function (x) { return x.key === key; })[0];
      if (!s) return;
      state.formError = '';
      state.modal = { key: s.key, value: s.value || '', is_secret: !!s.is_secret, description: s.description || '', editing: s };
      render(); focusField('f-key');
    });

    var overlay = document.querySelector('[data-overlay]');
    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeModal(); });
    var cb = document.querySelector('.ks-modal-close');
    if (cb) cb.addEventListener('click', closeModal);
    var cancel = document.querySelector('[data-action="cancel"]');
    if (cancel) cancel.addEventListener('click', closeModal);
    var sub = document.querySelector('[data-action="submit"]');
    if (sub) sub.addEventListener('click', submitModal);
  }
  // Field values sync through DELEGATED listeners bound once at startup so
  // re-renders (busy state, failed save, background load finishing) can never
  // desync what the operator typed from state. See Automation for detail.
  function wireFields() {
    var FIELDS = {
      'f-key': function (v) { state.modal.key = v.trim(); },
      'f-value': function (v) { state.modal.value = v; },
      'f-desc': function (v) { state.modal.description = v; }
    };
    document.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t && state.modal && FIELDS[t.id]) FIELDS[t.id](t.value);
    }, true);
    // Toggling "mask as secret" swaps the value input's type, so re-render.
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.id === 'f-secret' && state.modal) {
        state.modal.is_secret = t.checked;
        render();
        restoreFocus({ id: 'f-secret', pos: null });
      }
    }, true);
  }
  function focusField(id) {
    var f = document.getElementById(id);
    if (!f) return;
    f.focus();
    try { var n = f.value.length; if (f.setSelectionRange) f.setSelectionRange(n, n); } catch (e) {}
  }
  function restoreFocus(prev) {
    if (!prev || !prev.id) return;
    var f = document.getElementById(prev.id);
    if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;
    try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    if (prev.pos != null && f.setSelectionRange && f.value.length >= prev.pos) {
      try { f.setSelectionRange(prev.pos, prev.pos); } catch (e) {}
    }
  }
  function closeModal() { state.modal = null; state.formError = ''; render(); }

  function start(s) { sdk = s; wireFields(); load(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });

  var st = document.createElement('style');
  st.textContent = '@keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}';
  document.head.appendChild(st);
})();
<\/script>
`,bs=`[{"type": "heading", "value": "Welcome to My Custom Page", "level": 1, "align": "center"}, {"type": "text", "value": "This page demonstrates all three content types available in KS Panel instance pages. You can use HTML, Markdown, or Visual Blocks to create rich content.", "align": "center"}, {"type": "divider"}, {"type": "heading", "value": "HTML Content Example", "level": 2}, {"type": "text", "value": "Switch content_type to 'html' and use the content_html field for raw HTML with full styling control."}, {"type": "code", "value": "<div class=\\"p-4 bg-blue-900/30 rounded-lg\\">\\n  <h2 class=\\"text-xl font-bold text-blue-300\\">Custom HTML Card</h2>\\n  <p class=\\"text-blue-100\\">Styled with Tailwind classes</p>\\n</div>"}, {"type": "divider"}, {"type": "heading", "value": "Markdown Content Example", "level": 2}, {"type": "text", "value": "Switch content_type to 'markdown' and use the content_markdown field for easy writing."}, {"type": "code", "value": "# Markdown Title\\n\\n## Subsection\\n\\n- List item 1\\n- List item 2\\n- **Bold** and *italic* text\\n\\n\`inline code\` and:\\n\\n\`\`\`bash\\necho 'code blocks'\\n\`\`\`"}, {"type": "divider"}, {"type": "heading", "value": "Visual Blocks (Current)", "level": 2}, {"type": "text", "value": "This page uses 'blocks' content_type. The content_blocks field contains a JSON array of block objects. Each block has a type and value."}, {"type": "heading", "value": "Supported Block Types", "level": 3}, {"type": "text", "value": "• heading - with level (1-3) and align (left/center/right)\\n• text - with align option\\n• image - with value as URL\\n• button - with value as label and href as link\\n• code - displays formatted code\\n• spacer - adds vertical space\\n• divider - horizontal rule"}, {"type": "button", "value": "Open Studio", "href": "/instance-pages/studio"}, {"type": "spacer"}, {"type": "heading", "value": "Interactive Elements", "level": 2}, {"type": "text", "value": "Buttons can link to external URLs or internal panel routes. Images render directly. Code blocks have syntax highlighting."}, {"type": "image", "value": "data:image/svg+xml;utf8,<svg%20xmlns='http://www.w3.org/2000/svg'%20width='600'%20height='200'><rect%20width='600'%20height='200'%20fill='%231e293b'/><text%20x='300'%20y='105'%20fill='%2364748b'%20font-family='monospace'%20font-size='20'%20text-anchor='middle'>Custom%20Page%20Image</text></svg>"}, {"type": "code", "value": "// This code block shows in a monospace font\\nfunction greet(name) {\\n  return \`Hello, \${name}!\`;\\n}\\n\\nconsole.log(greet('KS Panel'));", "align": "left"}]`,ys=`<div id="root"><div class="ks-card" style="display:flex;align-items:center;gap:16px"><div class="ks-skeleton-avatar" style="width:48px;height:48px;border-radius:12px"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="ks-skeleton-bar" style="height:16px;width:36%"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:14px;width:68px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:14px;width:52px;border-radius:9999px"></div></div></div><div class="ks-skeleton-bar" style="height:18px;width:42px"></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px"><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:52%"></div><div class="ks-skeleton-bar" style="height:10px;width:34%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:48%"></div><div class="ks-skeleton-bar" style="height:10px;width:38%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:44%"></div><div class="ks-skeleton-bar" style="height:10px;width:32%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:56%"></div><div class="ks-skeleton-bar" style="height:10px;width:36%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:42%"></div><div class="ks-skeleton-bar" style="height:10px;width:30%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:36%"></div><div class="ks-skeleton-bar" style="height:10px;width:52%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:40%"></div><div class="ks-skeleton-bar" style="height:10px;width:48%"></div></div></div><div class="ks-card" style="display:flex;align-items:center;gap:14px"><div class="ks-skeleton-avatar" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ks-skeleton-bar" style="height:14px;width:38%"></div><div class="ks-skeleton-bar" style="height:10px;width:44%"></div></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:28%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:76%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:32%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:84%"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function fmtBytes(bytes) {
    var n = typeof bytes === 'number' ? bytes : parseFloat(bytes);
    if (!isFinite(n) || n < 0) return null;
    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i >= 3 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
  }
  function cleanExternalId(raw) {
    if (!raw) return '';
    var trimmed = String(raw).trim();
    var m = trimmed.match(/[0-9a-f]{12,64}/gi);
    if (m && m.length) return m[m.length - 1];
    var lines = trimmed.split(/\\r?\\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    return (lines[lines.length - 1] || trimmed).slice(0, 64);
  }
  function statusMeta(s) {
    var map = {
      running: { label: 'Running', dot: 'var(--ks-ok)', badge: 'ks-badge ks-ok' },
      stopped: { label: 'Stopped', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' },
      creating: { label: 'Creating', dot: 'var(--ks-warn)', badge: 'ks-badge ks-warn' },
      installing: { label: 'Installing', dot: 'var(--ks-info)', badge: 'ks-badge' },
      errored: { label: 'Errored', dot: 'var(--ks-bad)', badge: 'ks-badge ks-bad' },
      install_failed: { label: 'Install failed', dot: 'var(--ks-bad)', badge: 'ks-badge ks-bad' },
      destroyed: { label: 'Destroyed', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' }
    };
    return map[s] || { label: s || '—', dot: 'var(--ks-faint)', badge: 'ks-badge ks-muted' };
  }
  function kindSvg(kind) {
    var p;
    if (kind === 'docker') p = '<path d="M3 5h7v5H3z"/><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2"/><path d="M3 8v8h7V8"/><path d="M3 12h7"/>';
    else if (kind === 'lxd') p = '<path d="M4 7 12 3l8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/>';
    else if (kind === 'kvm') p = '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 20h10"/><path d="M9 8l4 3-4 3z"/>';
    else if (kind === 'multipass') p = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
    else if (kind === 'host') p = '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7h.01M7 16h.01"/>';
    else p = '<circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M9 15h6"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px">' + p + '</svg>';
  }
  function icon(inner, sz) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:' + (sz || 20) + 'px;height:' + (sz || 20) + 'px">' + inner + '</svg>';
  }
  function tile(ic, value, label, hint, accent) {
    return '<div class="ks-card" data-ks-key="' + esc(label) + '" style="display:flex;align-items:center;gap:14px">'
      + '<div style="flex-shrink:0;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);background:var(--ks-card-bg);color:' + accent + '">' + ic + '</div>'
      + '<div style="min-width:0">'
      + '<div style="font-size:17px;font-weight:600;color:var(--ks-heading);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + value + '</div>'
      + '<div class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em;margin-top:2px">' + esc(label) + '</div>'
      + (hint ? '<div class="ks-muted" style="font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(hint) + '</div>' : '')
      + '</div></div>';
  }

  // ---- Install banner -------------------------------------------------
  function installBanner(state, step, error, stepsJSON) {
    var steps = [];
    try { var parsed = JSON.parse(stepsJSON || ''); if (Array.isArray(parsed)) steps = parsed; } catch (e) { /* ignore */ }
    var isRunning = state === 'running'; var isFailed = state === 'failed';
    var total = steps.length; var curIdx = step >= 0 ? step : -1;
    var stepVisual = function (st) {
      switch (st) {
        case 'done': return { c: 'var(--ks-ok)', t: 'done' };
        case 'running': return { c: 'var(--ks-info)', t: 'running' };
        case 'skipped': case 'nonfatal': return { c: 'var(--ks-warn)', t: st };
        case 'failed': return { c: 'var(--ks-bad)', t: 'failed' };
        default: return { c: 'var(--ks-faint)', t: 'pending' };
      }
    };
    var html = '<div class="ks-card" data-ks-key="install-banner" style="border-color:' + (isFailed ? 'var(--ks-bad-line)' : 'var(--ks-info-line)') + '">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + icon('<path d="M21 12a9 9 0 1 1-6.2-8.5"/>')
      + '<div style="min-width:0;flex:1">'
      + '<div style="font-size:13px;font-weight:600;color:' + (isFailed ? 'var(--ks-bad)' : 'var(--ks-info)') + '">' + (isFailed ? 'Install workflow failed' : isRunning ? 'Installing…' : 'Install workflow')
      + (total > 0 ? ' <span class="ks-muted" style="font-size:11px;font-family:ui-monospace,monospace;margin-left:6px">' + (curIdx >= 0 ? 'step ' + (curIdx + 1) + '/' + total : total + ' step' + (total === 1 ? '' : 's')) + '</span>' : '')
      + '</div>'
      + (isFailed && error
        ? '<p class="ks-mono" style="font-size:11px;color:var(--ks-bad);margin:4px 0 0;word-break:break-all">' + esc(error) + '</p>'
        : '<p class="ks-muted" style="font-size:11px;margin:2px 0 0;">' + (isRunning ? 'The edge is running the template install steps inside the container. The instance flips to Running once they finish.' : 'Install workflow tracking for this instance.') + '</p>')
      + '</div></div>';
    if (total > 0) {
      html += '<ul style="list-style:none;padding:0;margin:12px 0 0">';
      for (var k = 0; k < total; k++) {
        var s = steps[k] || {}; var v = stepVisual(s.status);
        html += '<li style="display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:3px 0">'
          + '<span style="margin-top:5px;flex-shrink:0;width:8px;height:8px;border-radius:50%;background:' + v.c + (s.status === 'running' ? ';animation:ks-pulse 1.2s ease-in-out infinite' : '') + '"></span>'
          + '<div style="min-width:0;flex:1">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          + '<span class="ks-mono ks-muted">#' + ((s.index != null ? s.index : k) + 1) + '</span>'
          + '<span style="color:var(--ks-body)">' + esc(s.action || 'step') + '</span>'
          + '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:' + v.c + '">' + v.t + '</span>'
          + (typeof s.exit_code === 'number' && s.exit_code !== 0 ? '<span class="ks-mono ks-muted" style="font-size:10px">exit ' + s.exit_code + '</span>' : '')
          + '</div>';
        if (s.status === 'failed' && s.stderr) {
          var errLines = String(s.stderr).split('\\n').filter(Boolean).slice(0, 4).join('\\n');
          html += '<pre class="ks-mono" style="margin:4px 0 0;font-size:10px;color:var(--ks-bad);background:var(--ks-bad-wash);border:1px solid var(--ks-bad-line);border-radius:4px;padding:4px 6px;white-space:pre-wrap;word-break:break-all">' + esc(errLines) + '</pre>';
        }
        html += '</div></li>';
      }
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  // ---- Actions card ----------------------------------------------------
  function actionStateList(a) {
    var raw = a ? a.allowed_states : null;
    var arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() !== '' ? raw.split(',') : []);
    return arr.map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }).filter(Boolean);
  }
  function actionStateOk(a, st) {
    var toks = actionStateList(a);
    if (toks.length === 0) return true;
    return toks.indexOf(String(st == null ? '' : st).toLowerCase()) !== -1;
  }
  function actionIconHtml(a) {
    var raw = a && typeof a.icon_svg === 'string' ? a.icon_svg.trim() : '';
    if (!raw) return '';
    var col = a && typeof a.icon_color === 'string' ? a.icon_color.trim() : '';
    var open = '<span style="display:inline-flex;width:13px;height:13px;flex-shrink:0;align-items:center;justify-content:center' + (col ? ';color:' + col : '') + '">';
    if (raw.toLowerCase().indexOf('<svg') === 0) return open + raw + '</span> ';
    return open + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:block">' + raw + '</svg></span> ';
  }
  function actionsCard(inst) {
    var cfgActions = [];
    try { cfgActions = Array.isArray(inst.config.actions) ? inst.config.actions : []; } catch (e) { cfgActions = []; }
    window.__ksVisibleActions = cfgActions.filter(function (a) { return a && typeof a.id === 'string' && a.id.trim() !== '' && a.user_invokable !== false; });
    var visible = window.__ksVisibleActions;
    if (visible.length === 0) return '';

    var workflowInFlight = !!inst && inst.install_state === 'running';
    var runningActionId = workflowInFlight && inst.install_kind === 'action' ? inst.install_action_id : '';
    var busy = window.__ksBusyAction || null;
    var stopPending = window.__ksStopAction || null;

    var btns = '';
    for (var i = 0; i < visible.length; i++) {
      var a = visible[i];
      var subs = [];
      if (a.auto_start_instance) subs.push('auto-start');
      if (a.auto_stop_on_exit) subs.push('stop on exit');
      if (a.restart_on_failure) subs.push('restart on crash');
      var isThisRunning = workflowInFlight && runningActionId === a.id;
      var isBusy = busy === a.id;
      var stopping = isThisRunning && stopPending === a.id;
      var stateOk = actionStateOk(a, inst.status);
      var stateList = actionStateList(a).join(', ');
      var disabled = (workflowInFlight && !isThisRunning) || isBusy || stopping || (!isThisRunning && !stateOk);
      var spin = (isBusy || isThisRunning || stopping)
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;animation:ks-spin 1s linear infinite;opacity:.9;flex-shrink:0"><circle cx="12" cy="12" r="10" stroke-width="3" opacity=".25"/><path d="M12 2 A10 10 0 0 1 22 12"/></svg> '
        : '';
      btns += '<button type="button" data-act="' + esc(a.id) + '" ' + (disabled ? 'disabled' : '')
        + ' title="' + esc(isThisRunning ? (a.stop_command ? ('Stop: runs "' + a.stop_command + '" inside the container') : 'Stop the running action') : ((!stateOk && stateList) ? ('Available in: ' + stateList) : (a.description || subs.join(' · ') || a.name || a.id))) + '"'
        + ' style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;border-radius:8px;padding:8px 12px;text-align:left;min-width:10rem;'
        + (isThisRunning
          ? 'border:1px solid var(--ks-bad-line);background:var(--ks-bad-wash);color:var(--ks-bad)'
          : disabled
            ? 'border:1px solid var(--ks-card-border);background:transparent;color:var(--ks-faint);cursor:not-allowed'
            : 'border:1px solid var(--ks-ok-line);background:var(--ks-ok-wash);color:var(--ks-ok)')
        + '">'
        + '<span style="font-size:13px;font-weight:500;line-height:1.2;display:flex;align-items:center;gap:6px">' + spin + (isThisRunning || isBusy || stopping ? '' : actionIconHtml(a)) + esc(isThisRunning ? ('Stop ' + (a.name || a.id)) : (a.name || a.id)) + '</span>'
        + (isThisRunning
          ? '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-bad-soft)">' + (stopping ? 'stopping…' : 'running — click to stop') + '</span>'
          : ((!stateOk && stateList) ? '<span style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-warn-soft)">only in ' + esc(stateList) + '</span>' : (subs.length ? '<span class="ks-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.04em">' + esc(subs.join(' · ')) + '</span>' : '')))
        + '</button>';
    }
    var html = '<div class="ks-card" data-ks-key="actions">'
      + '<h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Actions</h3>'
      + '<p class="ks-muted" style="font-size:12px;margin:0 0 12px">One-click commands defined by this instance\\u2019s template. They run inside the container; the panel auto-starts a stopped container if the action declares it. Click an action a second time while it\\u2019s running to stop it.</p>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px">' + btns + '</div>'
      + (workflowInFlight && !runningActionId ? '<p style="font-size:12px;color:var(--ks-warn-soft);margin:12px 0 0">An install or action workflow is in progress — buttons disabled until it resolves.</p>' : '')
      + (window.__ksActionError ? '<p style="font-size:12px;color:var(--ks-bad);margin:12px 0 0;word-break:break-word"><b>Action failed:</b> ' + esc(window.__ksActionError) + '</p>' : '')
      + '</div>';
    return html;
  }

  // ---- render ----------------------------------------------------------
  var metrics = null; var metricsError = null;

  function render() {
    var inst = sdk.instance;
    var sm = statusMeta(inst.status);
    var extId = cleanExternalId(inst.external_id);
    var isLive = inst.status === 'running';
    var stoppedOrDestroyed = inst.status === 'stopped' || inst.status === 'destroyed';
    var memUsed = stoppedOrDestroyed ? 0 : (metrics && metrics.mem_used != null ? metrics.mem_used : null);
    var memTotal = stoppedOrDestroyed ? 0 : (metrics && metrics.mem_total != null ? metrics.mem_total : null);
    var diskUsed = stoppedOrDestroyed ? 0 : (metrics && metrics.disk_used != null ? metrics.disk_used : null);
    var diskTotal = stoppedOrDestroyed ? 0 : (metrics && metrics.disk_total != null ? metrics.disk_total : null);
    var cpuPct = stoppedOrDestroyed ? 0 : (metrics ? (metrics.cpu_pct != null ? metrics.cpu_pct : (metrics.cpu != null ? metrics.cpu : null)) : null);

    var dashIcon = icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>');
    var nodeIcon = icon('<rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="17" x2="6.01" y2="17"/>');
    var tplIcon = icon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>');
    var ownIcon = icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>');
    var cpuIcon = icon('<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>');
    var memIcon = icon('<rect x="2" y="8" width="20" height="9" rx="1.5"/><path d="M6 8v3M10 8v3M14 8v3M18 8v3"/>');
    var dskIcon = icon('<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>');

    var tiles = ''
      + tile('<span style="width:12px;height:12px;border-radius:50%;background:' + sm.dot + ';' + (isLive ? 'animation:ks-pulse 1.5s ease-in-out infinite' : '') + '"></span>', '<span style="text-transform:capitalize">' + esc(sm.label) + '</span>', 'Status', isLive ? 'live & reachable' : 'not running', isLive ? 'var(--ks-ok)' : 'var(--ks-faint)')
      + tile(dashIcon, '<span style="text-transform:capitalize">' + esc(inst.kind || '—') + '</span>', 'Kind', (inst.config && inst.config.image) || 'no image', 'var(--ks-info)')
      + tile(nodeIcon, esc(inst.node_name || ('#' + (inst.node_id != null ? inst.node_id : '?'))), 'Node', 'hosting edge', 'var(--ks-ok)')
      + tile(tplIcon, inst.template_name ? esc(inst.template_name) : '<span class="ks-muted">deleted</span>', 'Template', 'deployed from', 'var(--ks-purple)')
      + tile(ownIcon, inst.owner_name ? esc(inst.owner_name) : (inst.owner_id ? '<span class="ks-mono">#' + inst.owner_id + '</span>' : '<span class="ks-muted">unattributed</span>'), 'Owner', 'allocated to', 'var(--ks-warn)')
      + tile(cpuIcon, '<span class="ks-mono">' + (cpuPct != null ? cpuPct + '%' : '—') + '</span>', 'CPU', cpuPct != null ? 'usage / total' : 'unavailable', 'var(--ks-info)')
      + tile(memIcon, '<span class="ks-mono">' + (memUsed != null ? fmtBytes(memUsed) : '—') + '</span>', 'Memory', memUsed != null && memTotal != null ? fmtBytes(memUsed) + ' / ' + fmtBytes(memTotal) : 'unavailable', 'var(--ks-ok)')
      + tile(dskIcon, '<span class="ks-mono">' + (diskUsed != null ? fmtBytes(diskUsed) : '—') + '</span>', 'Disk', diskUsed != null && diskTotal != null ? fmtBytes(diskUsed) + ' / ' + fmtBytes(diskTotal) : 'unavailable', 'var(--ks-warn)');

    var html = ''
      + '<div class="ks-card" style="display:flex;align-items:center;gap:16px">'
      + '<div style="flex-shrink:0;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);background:var(--ks-card-bg);color:var(--ks-info)">' + kindSvg(inst.kind) + '</div>'
      + '<div style="min-width:0;flex:1;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(inst.name) + '</h2>'
      + '<span class="' + sm.badge + '" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 8px"><span style="width:6px;height:6px;border-radius:50%;background:' + sm.dot + (isLive ? ';animation:ks-pulse 1.5s ease-in-out infinite' : '') + '"></span>' + sm.label + '</span>'
      + '<span class="ks-badge" style="text-transform:capitalize">' + esc(inst.kind) + '</span>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0"><div class="ks-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.04em">Instance</div><div class="ks-mono" style="font-size:13px;color:var(--ks-body)">#' + inst.id + '</div></div>'
      + '</div>';

    if (metricsError) {
      html += '<div class="ks-card" style="border-color:var(--ks-warn-line)!important;display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ks-warn)">'
        + icon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 16)
        + '<div style="min-width:0"><b>Metrics unavailable</b><span style="color:var(--ks-warn-soft);margin-left:6px;word-break:break-word">' + esc(metricsError) + '</span>'
        + '<div style="color:var(--ks-warn-soft);margin-top:2px">Resource tiles show no data; the rest of the page is unaffected.</div></div></div>';
    }

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">' + tiles + '</div>';

    if (inst.suspended === 1 || inst.suspended === true) {
      html += '<div class="ks-card" style="border-color:var(--ks-bad-line)!important;display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ks-bad)">'
        + icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 16)
        + '<div style="min-width:0"><b>Suspended</b><span style="color:var(--ks-bad-soft);margin-left:6px">This instance is suspended' + (inst.suspended_until ? ' until ' + new Date(inst.suspended_until).toLocaleString() : '') + '</span></div></div>';
    }

    if ((inst.install_state === 'running' || inst.install_state === 'failed') && inst.install_kind !== 'action') {
      html += installBanner(inst.install_state || '', typeof inst.install_step === 'number' ? inst.install_step : -1, inst.install_error || '', inst.install_steps_json || '');
    }

    html += '<div id="actions-holder">' + actionsCard(inst) + '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">'
      + '<div class="ks-card" data-ks-key="identity"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Identity</h3><p class="ks-muted" style="font-size:12px;margin:0 0 8px">What this instance is and how the panel references it.</p>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--ks-card-border)">'
      + '<span class="ks-muted" style="font-size:13px">External ID</span>'
      + '<span style="font-size:13px;display:inline-flex;align-items:center;gap:6px">'
      + (extId
        ? '<span class="ks-mono ks-muted" style="font-size:12px;max-width:14ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(extId) + '">' + esc(extId) + '</span>'
          + '<button type="button" id="copy-ext" title="Copy external ID" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:4px;background:transparent;color:var(--ks-muted);cursor:pointer">'
          + icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/>', 12) + '</button>'
        : '<span class="ks-mono ks-muted" style="font-size:12px">—</span>')
      + '</span></div></div>'
      + '<div class="ks-card" data-ks-key="lifecycle"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Lifecycle</h3><p class="ks-muted" style="font-size:12px;margin:0 0 8px">Provenance and timing for this deployment.</p>'
      + '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ks-card-border)"><span class="ks-muted" style="font-size:13px">Created</span><span style="font-size:13px;color:var(--ks-secondary)">' + (inst.created_at ? new Date(inst.created_at).toLocaleString() : '—') + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:8px 0"><span class="ks-muted" style="font-size:13px">Updated</span><span style="font-size:13px;color:var(--ks-secondary)">' + (inst.updated_at ? new Date(inst.updated_at).toLocaleString() : '—') + '</span></div>'
      + '</div></div>';

    document.getElementById('root').innerHTML = html;

    var cp = document.getElementById('copy-ext');
    if (cp) cp.addEventListener('click', function () {
      copyText(sdk, extId, 'Copied to clipboard');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#actions-holder button[data-act]'), function (btn) {
      btn.addEventListener('click', function () {
        if (window.__ksBusyAction || window.__ksStopAction) return; // debounce double clicks
        var act = btn.getAttribute('data-act');
        var def = (window.__ksVisibleActions || []).filter(function (x) { return x.id === act; })[0];
        if (!def) return;
        var inst2 = sdk.instance;
        var workflowInFlight = !!inst2 && inst2.install_state === 'running';
        var runningId = workflowInFlight && inst2.install_kind === 'action' ? inst2.install_action_id : '';
        if (act !== runningId && !actionStateOk(def, inst2.status)) { window.__ksActionError = 'Available in: ' + actionStateList(def).join(', '); render(); return; }
        if (act === runningId) {
          window.__ksStopAction = act;
          sdk.fetchPanel('/api/instances/' + inst2.id + '/actions/' + encodeURIComponent(act) + '/stop', { method: 'POST' })
            .catch(function (e) { window.__ksActionError = e.message || String(e); })
            .then(function () { window.__ksStopAction = null; refresh(); });
        } else {
          window.__ksBusyAction = act; window.__ksActionError = null; render();
          sdk.fetchPanel('/api/instances/' + inst2.id + '/actions/' + encodeURIComponent(act) + '/invoke', { method: 'POST' })
            .catch(function (e) { window.__ksActionError = e.message || String(e); })
            .then(function () { window.__ksBusyAction = null; refresh(); });
        }
      });
    });
  }


  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  // copyText reports honestly: the sandboxed iframe may deny the async
  // Clipboard API, so fall back to execCommand and toast the real result.
  function copyText(sdk2, text, okMsg) {
    var done = function (ok) { try { sdk2.toast(ok ? okMsg : 'Copy failed', ok ? 'success' : 'error'); } catch (e) { /* ignore */ } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  // ---- polling -----------------------------------------------------------
  var pollSeq = 0;
  function refresh() {
    var seq = ++pollSeq;
    sdk.fetchPanel('/api/instances/' + sdk.instance.id).then(function (row) {
      if (seq !== pollSeq || !row || !row.id) return;
      // Merge live row fields over the static context so status / install
      // tracking stays current without losing SDK-only fields.
      Object.assign(sdk.instance, row);
      if (typeof row.config === 'string') {
        try { sdk.instance.config = JSON.parse(row.config); } catch (e) { /* keep old */ }
      }
      render();
    }).catch(function () { /* transient — keep last known state */ });

    sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/metrics').then(function (m) {
      if (seq !== pollSeq) return;
      metrics = m || {}; metricsError = null; render();
    }).catch(function (e) {
      if (seq !== pollSeq) return;
      var msg = (e && e.message) ? e.message : String(e);
      if (!metrics || metricsError) { metricsError = msg; render(); }
    });
  }

  function start(s) {
    sdk = s;
    render();
    refresh();
    var timer = setInterval(refresh, 4000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearInterval(timer); timer = null; }
      else if (timer === null) { refresh(); timer = setInterval(refresh, 4000); }
    });
  }

  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });

  var st = document.createElement('style');
  st.textContent = '@keyframes ks-spin{to{transform:rotate(360deg)}}@keyframes ks-pulse{0%,100%{opacity:1}50%{opacity:.35}}';
  document.head.appendChild(st);
})();
<\/script>
`,ws=`<div style="display:flex;flex-direction:column;gap:16px">
  <div class="ks-row" style="justify-content:space-between">
    <h1 style="font-size:24px;font-weight:700;color:var(--ks-heading);margin:0">Server Dashboard</h1>
    <span class="ks-badge" style="color:var(--ks-ok);border-color:var(--ks-ok-line);background:var(--ks-ok-wash)">Live</span>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
    <div class="ks-card">
      <div class="ks-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ks-info)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2"/></svg>
        <span class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">CPU Usage</span>
      </div>
      <p class="ks-mono" style="font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px">42%</p>
      <div class="ks-bar"><span style="width:42%"></span></div>
    </div>
    <div class="ks-card">
      <div class="ks-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ks-ok)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><rect x="2" y="8" width="20" height="9" rx="1.5"/><path d="M6 8v3M10 8v3M14 8v3M18 8v3"/></svg>
        <span class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Memory</span>
      </div>
      <p class="ks-mono" style="font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px">2.4 / 8 GB</p>
      <div class="ks-bar"><span style="width:30%;background:var(--ks-ok)"></span></div>
    </div>
    <div class="ks-card">
      <div class="ks-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ks-warn)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/><path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>
        <span class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Disk Usage</span>
      </div>
      <p class="ks-mono" style="font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px">45 / 200 GB</p>
      <div class="ks-bar"><span style="width:22%;background:var(--ks-warn)"></span></div>
    </div>
    <div class="ks-card">
      <div class="ks-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ks-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M12 2a10 10 0 0 0-10 10c0 1.7.42 3.3 1.16 4.7L2 22l5.3-1.16A10 10 0 1 0 12 2Z"/></svg>
        <span class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Network</span>
      </div>
      <p class="ks-mono" style="font-size:26px;font-weight:700;color:var(--ks-heading);margin:6px 0 8px">12.3 MB/s</p>
      <p class="ks-muted" style="font-size:10px;margin:0">RX 7.9 · TX 4.4 MB/s</p>
    </div>
  </div>

  <div class="ks-card">
    <h2 style="font-size:15px;font-weight:600;color:var(--ks-heading);margin:0 0 10px">Quick Actions</h2>
    <div class="ks-row">
      <button type="button" class="ks-btn">Restart Service</button>
      <button type="button" class="ks-btn ks-btn-blue">View Logs</button>
      <button type="button" class="ks-btn ks-btn-green">Backup Now</button>
      <button type="button" class="ks-btn ks-btn-red">Emergency Stop</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
    <div class="ks-card">
      <h3 style="font-size:14px;font-weight:500;color:var(--ks-heading);margin:0 0 10px">Recent Activity</h3>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div class="ks-row" style="justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-ok);margin-right:8px"></span>Deploy completed: web-app v2.1.0</span><span class="ks-muted" style="font-size:11px;margin-left:auto;padding-left:8px">2 min ago</span></div>
        <div class="ks-row" style="justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-info);margin-right:8px"></span>Backup created: daily-2026-08-20</span><span class="ks-muted" style="font-size:11px;margin-left:auto;padding-left:8px">15 min ago</span></div>
        <div class="ks-row" style="justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-warn);margin-right:8px"></span>Config updated: nginx.conf</span><span class="ks-muted" style="font-size:11px;margin-left:auto;padding-left:8px">1 hour ago</span></div>
        <div class="ks-row" style="justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ks-ok);margin-right:8px"></span>SSL cert renewed: example.com</span><span class="ks-muted" style="font-size:11px;margin-left:auto;padding-left:8px">3 hours ago</span></div>
      </div>
    </div>
    <div class="ks-card">
      <h3 style="font-size:14px;font-weight:500;color:var(--ks-heading);margin:0 0 10px">System Info</h3>
      <div style="font-size:13px;display:flex;flex-direction:column;gap:8px">
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">Hostname</span><span class="ks-mono" style="color:var(--ks-body)">server-01</span></div>
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">OS</span><span style="color:var(--ks-body)">Ubuntu 22.04 LTS</span></div>
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">Kernel</span><span class="ks-mono" style="color:var(--ks-body)">5.15.0-105-generic</span></div>
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">Uptime</span><span style="color:var(--ks-body)">12 days, 4 hours</span></div>
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">Docker</span><span style="color:var(--ks-body)">24.0.7</span></div>
        <div class="ks-row" style="justify-content:space-between"><span class="ks-muted">Panel</span><span style="color:var(--ks-body)">KS Panel v0.0.0</span></div>
      </div>
    </div>
  </div>
</div>`,js=`# Markdown Documentation Page

This page uses **Markdown** content type. Write documentation easily with standard markdown syntax.

---

## Features

### Text Formatting
- **Bold text** for emphasis
- *Italic text* for subtle emphasis
- \`inline code\` for commands
- ~~Strikethrough~~ for deprecated items

### Headings

# Heading 1
## Heading 2
### Heading 3

### Lists

**Unordered:**
- First item
- Second item
  - Nested item
  - Another nested
- Third item

**Ordered:**
1. First step
2. Second step
3. Third step

### Code Blocks

\`\`\`bash
# Shell commands
docker ps -a
systemctl restart nginx
journalctl -u myapp -f
\`\`\`

\`\`\`yaml
# YAML config
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
\`\`\`

\`\`\`python
# Python example
def deploy_instance(template, node):
    """Deploy a new instance"""
    instance = Instance.create(
        name=template.name,
        node=node,
        spec=template.spec
    )
    return instance.start()
\`\`\`

### Tables

| Feature | Status | Version |
|---------|--------|---------|
| File Manager | ✅ Ready | 1.2.0 |
| Terminal | ✅ Ready | 1.0.0 |
| Metrics | 🚧 Beta | 0.9.0 |
| Backups | ✅ Ready | 1.1.0 |
| Automation | 🚧 Beta | 0.8.0 |

### Links & Images

- [KS Panel GitHub](https://github.com/kspanel)
- [Documentation](https://docs.kspanel.io)
- Images: this text renderer shows markdown text only — use the HTML content type when a page needs images (offline-safe data: URIs work there too).

### Blockquotes

> **Note:** This is an important notice.
> Markdown blockquotes are great for warnings, tips, and side notes.

> **Tip:** Use the Studio to visually build pages without writing raw JSON.

### Horizontal Rules

---

### Task Lists

- [x] Create instance page
- [x] Add markdown content
- [ ] Test in panel
- [ ] Link to template
- [ ] Deploy test instance

---

## Deployment Guide

### Prerequisites

1. KS Panel installed and running
2. At least one edge node connected
3. Template created with desired spec

### Steps

1. **Create the page** - Use Studio or upload JSON
2. **Link to template** - Go to Template → Pages tab
3. **Deploy instance** - Select template with your page
4. **Access page** - Navigate to Instance → Your Page

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Page not showing | Check \`enabled: true\` in template spec |
| Content not rendering | Verify \`content_type\` matches content |
| 404 on custom slug | Ensure slug matches in spec and page |

---

*Last updated: 2026-08-20*`,_s=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:98px"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:28px;width:124px;border-radius:6px"></div><div class="ks-skeleton-bar" style="height:28px;width:84px;border-radius:6px"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div></div><div class="ks-card" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px"><div style="display:flex;align-items:center;gap:12px"><div class="ks-skeleton-bar" style="height:14px;width:96px;border-radius:9999px"></div><div class="ks-skeleton-bar" style="height:10px;width:168px"></div></div><div style="display:flex;gap:14px"><div class="ks-skeleton-bar" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:52px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:42%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:32%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:44%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:26%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:40%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:30%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:36%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:48%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:28%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:52%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:54%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:10px;width:34%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:22px;width:58%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:60%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:26px;width:100%"></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:18%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:12px"></div><div class="ks-skeleton" style="height:120px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:58%;margin-bottom:12px"></div><div class="ks-skeleton" style="height:120px;width:100%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:20%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:12px"></div><div class="ks-skeleton" style="height:120px;width:100%"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  var escf = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function tok(name, fb) { try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; } }

  function fmtBytes(bytes) {
    var n = typeof bytes === 'number' ? bytes : parseFloat(bytes);
    if (!isFinite(n) || n < 0) return '—';
    var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return i >= 3 ? v.toFixed(1) + ' ' + units[i] : Math.round(v) + ' ' + units[i];
  }
  function fmtRate(bps) {
    if (!isFinite(bps) || bps < 0) return '—';
    var units = ['B/s', 'KB/s', 'MB/s', 'GB/s']; var i = 0; var v = bps;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return i >= 2 ? v.toFixed(1) + ' ' + units[i] : Math.round(v) + ' ' + units[i];
  }
  function fmtUptime(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '—';
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function healthOf(p) {
    if (p == null || !isFinite(p)) return 'unknown';
    if (p >= 92) return 'danger';
    if (p >= 80) return 'warn';
    return 'healthy';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fmtClock(ms) {
    var d = new Date(ms);
    var pad = function(n){ return String(n).padStart(2,'0'); };
    return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }
  function predictNext(samples, n) {
    n = n || 6;
    if (samples.length < 2) return { slope: 0, intercept: samples[0] ? samples[0].v : 0 };
    var last = samples.slice(-Math.min(n, samples.length));
    var xs = last.map(function(_, i){ return i; });
    var ys = last.map(function(s){ return s.v; });
    var meanX = xs.reduce(function(a,b){ return a+b; },0)/xs.length;
    var meanY = ys.reduce(function(a,b){ return a+b; },0)/ys.length;
    var num=0, den=0;
    for (var i=0;i<xs.length;i++){ num+=(xs[i]-meanX)*(ys[i]-meanY); den+=(xs[i]-meanX)*(xs[i]-meanX); }
    var slope = den===0?0:num/den;
    var intercept = meanY - slope*meanX;
    return { slope: slope, intercept: intercept };
  }

  var RANGE_SAMPLES = { '1m': 12, '5m': 60, '15m': 180 };
  var state = {
    range: '5m',
    lastSampleAt: null,
    lastError: null,
    loading: true,
    initialLoad: true,
    m: null,
    hist: {},
    prevNet: null
  };
  var base = function () { return '/api/instances/' + sdk.instance.id; };
  function push(key, t, v) {
    var arr = state.hist[key] || (state.hist[key] = []);
    arr.push({ t: t, v: v });
    var max = RANGE_SAMPLES[state.range];
    if (arr.length > max) state.hist[key] = arr.slice(arr.length - max);
  }
  function trimAll() {
    var max = RANGE_SAMPLES[state.range];
    Object.keys(state.hist).forEach(function (k) {
      state.hist[k] = state.hist[k].slice(Math.max(0, state.hist[k].length - max));
    });
  }

  function poll() {
    if (state.initialLoad) state.loading = true;
    sdk.fetchPanel(base() + '/metrics').then(function (data) {
      data = data || {};
      state.m = data;
      var now = Date.now();
      state.lastSampleAt = now; state.lastError = null;

      var cpuVal = data.cpu_pct != null ? data.cpu_pct : data.cpu;
      if (typeof cpuVal === 'number' && isFinite(cpuVal)) push('cpu', now, cpuVal);

      var memPct = data.mem_pct;
      if (memPct == null && data.mem_used != null && data.mem_total > 0) memPct = (data.mem_used / data.mem_total) * 100;
      if (typeof memPct === 'number' && isFinite(memPct)) push('mem', now, memPct);

      var diskPct = data.disk_pct;
      if (diskPct == null && data.disk_used != null && data.disk_total > 0) diskPct = (data.disk_used / data.disk_total) * 100;
      if (typeof diskPct === 'number' && isFinite(diskPct)) push('disk', now, diskPct);

      var rxRaw = data.net_rx != null ? data.net_rx : data.net_in;
      var txRaw = data.net_tx != null ? data.net_tx : data.net_out;
      if (typeof rxRaw === 'number' && typeof txRaw === 'number') {
        var prev = state.prevNet;
        if (prev && now > prev.t) {
          var dt = (now - prev.t) / 1000;
          push('netrx', now, Math.max(0, (rxRaw - prev.rx) / dt));
          push('nettx', now, Math.max(0, (txRaw - prev.tx) / dt));
        }
        state.prevNet = { t: now, rx: rxRaw, tx: txRaw };
      }

      if (typeof data.load1 === 'number' && isFinite(data.load1)) push('load', now, data.load1);

      if (state.initialLoad) { state.initialLoad = false; state.loading = false; }
      render();
    }).catch(function (e) {
      var msg = (e && e.message) ? e.message : String(e);
      state.lastError = msg;
      if (state.initialLoad) { state.initialLoad = false; state.loading = false; }
      render();
    });
  }

  // ---- SVG primitives — mirror panel's MetricsChart.tsx -------------------
  // VIEW_W/H matches MetricsChart (100×36) so every chart lines up.
  var VIEW_W = 100, VIEW_H = 36;
  var uidCounter = 0;
  function nextUid(){ uidCounter+=1; return 'ks-g-'+uidCounter+'-'+Math.random().toString(36).slice(2,6); }

  function sparklineSvg(samples, color) {
    if (!samples || samples.length < 2) {
      return '<svg viewBox="0 0 100 28" class="w-full h-7 mt-1 opacity-40"><line x1="0" y1="14" x2="100" y2="14" stroke="'+escf(color)+'" stroke-width="1" stroke-dasharray="2 3"/></svg>';
    }
    var vals = samples.map(function(s){return s.v;});
    var max = Math.max.apply(null, vals.concat([1]));
    var min = Math.min.apply(null, vals.concat([0]));
    var range = max - min || 1;
    var W = 100, H = 28, PAD = 2;
    var stepX = (W - PAD*2) / Math.max(1, samples.length - 1);
    var pts = samples.map(function(s,i){
      var x = PAD + i * stepX;
      var y = PAD + (1 - (s.v - min)/range) * (H - PAD*2);
      return (i===0?'M':'L')+x.toFixed(2)+','+y.toFixed(2);
    }).join(' ');
    return '<svg viewBox="0 0 '+W+' '+H+'" class="w-full h-7 mt-1"><path d="'+pts+'" fill="none" stroke="'+escf(color)+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function areaChartSvg(samples, opts) {
    var max = opts.max != null ? opts.max : 100;
    var min = opts.min != null ? opts.min : 0;
    var color = opts.color || '#7dd3fc';
    var label = opts.label || '';
    var unit = opts.unit || '';
    var threshold = opts.threshold;
    var thresholdColor = opts.thresholdColor || 'var(--ks-accent-warning, #fbbf24)';
    var optimistic = opts.optimistic !== false;
    var heightClass = opts.heightClass || 'h-48';
    // ticks — four y-axis ticks evenly spaced, labels in margin (rendered as <text> inside svg for theme awareness)
    var n = samples.length;
    var latest = n ? samples[n-1] : null;
    var ticks = [];
    for (var i=0;i<=4;i++){ var v=min+(max-min)*(1-i/4); ticks.push({y:(i/4)*VIEW_H, label: v.toFixed(0)+unit}); }
    if (n===0) {
      var gradId0 = nextUid();
      return '<div class="relative w-full '+heightClass+'">'
        + '<div class="flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1"><span class="uppercase tracking-wide">'+escf(label)+'</span><span class="font-mono text-gray-200">—</span></div>'
        + '<svg viewBox="0 0 '+VIEW_W+' '+VIEW_H+'" preserveAspectRatio="none" class="w-full h-[calc(100%-1.25rem)] block">'
        + '<defs><linearGradient id="'+gradId0+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+escf(color)+'" stop-opacity="0.55"/><stop offset="100%" stop-color="'+escf(color)+'" stop-opacity="0.02"/></linearGradient></defs>'
        + ticks.map(function(t){ return '<line x1="0" y1="'+t.y+'" x2="'+VIEW_W+'" y2="'+t.y+'" stroke="var(--ks-chart-grid, rgba(255,255,255,0.06))" stroke-width="0.2" vector-effect="non-scaling-stroke"/>'; }).join('')
        + '<text x="'+(VIEW_W/2)+'" y="'+(VIEW_H/2)+'" text-anchor="middle" fill="'+tok('--ks-muted','#6b7280')+'" font-size="3">warming up…</text>'
        + '</svg>'
        + '<div class="flex justify-between text-[9px] text-gray-500 font-mono mt-0.5 px-0.5"><span>—</span><span></span><span>—</span></div></div>';
    }
    var xAt = function(i){ return (i / Math.max(n-1,1)) * VIEW_W; };
    var yAt = function(v){ return ((clamp(v,min,max)-min)/(max-min||1))*VIEW_H; };
    // Note: SVG y=0 is top, so we invert: 0 at top => yAt gives distance from top? Original MetricsChart uses y = (i/4)*VIEW_H for ticks where 0 at top, and path y = ((clamp-min)/(max-min))*VIEW_H which also grows downward. But our area should be inverted: we want higher values higher. MetricsChart's yAt = ((clamp-min)/(max-min))*VIEW_H which maps min->0 at top, max->VIEW_H at bottom, but then they use that directly for path y? Let's mirror MetricsChart exactly: they do y = ((clamp-min)/(max-min))*VIEW_H and then areaPath uses that y directly with viewBox 0 0 100 36 where 0 top. That would put max at bottom — which is upside down vs typical. Wait check MetricsChart: they do ticks.push({y:(i/4)*VIEW_H, label}) and path pts y = ((clamp - min)/(max-min||1))*VIEW_H . They don't invert. So path goes downward as value increases. But then they do areaPath: M pt0.x,VIEW_H L ... L last.x,VIEW_H Z — that fills to bottom. So higher value means lower y (since VIEW_H is bottom). Actually they compute yAt as ((clamp-min)/(max-min))*VIEW_H which is 0 at min (top) and VIEW_H at max (bottom) — so larger value lower. That's opposite of typical but they treat chart as growing downwards? Wait they later do dots y = same, so shape is inverted? But in svg coordinate, y increases downwards, so a higher metric should be higher up (smaller y). So they should use VIEW_H - yAt. But they don't. Let's inspect MetricsChart more carefully: In file they have yAt = ((clamp(v,min,max)-min)/(max-min||1))*VIEW_H and pts = [xAt(i), yAt(s.v)]. Then areaPath = M pt0[0],VIEW_H L... L last[0],VIEW_H Z . If max maps to VIEW_H (bottom), the line for max will be at bottom, fill to bottom zero height — wrong. Maybe they intentionally want area from line down to bottom? That would make higher value lower line, not intuitive. But maybe they invert via ViewBox? Let's check HostPanel usage: it passes max 100, and samples 80% -> y ~ 28.8 near bottom, so line near bottom would represent high CPU which should be near top. So maybe MetricsChart is indeed inverted incorrectly? Let's check actual panel rendering maybe they compensate via CSS transform? No.

    // For instance page, we will use correct inverted mapping: y = VIEW_H - yAt(v) so high values appear high.
    var pts = samples.map(function(s,i){ return [xAt(i), VIEW_H - yAt(s.v)]; });
    var path = pts.map(function(p,i){ return (i===0?'M':'L')+p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ');
    var areaPath = 'M'+pts[0][0].toFixed(2)+','+VIEW_H+' '+pts.map(function(p){ return 'L'+p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ')+' L'+pts[pts.length-1][0].toFixed(2)+','+VIEW_H+' Z';
    // optimistic 6-step dashed projection
    var predictPts = [];
    if (optimistic && n>=2) {
      var pr = predictNext(samples, 6);
      var steps = 6;
      var lastIdx = n-1;
      for (var k=1;k<=steps;k++){
        var futureIdx = lastIdx + k;
        var v = pr.intercept + pr.slope * futureIdx;
        var clampedV = clamp(v, min, max);
        var x = (futureIdx / Math.max(lastIdx+steps, 1)) * VIEW_W;
        var y = VIEW_H - ((clampedV - min)/(max-min||1))*VIEW_H;
        // fade via opacity handled via strokeOpacity in separate polyline? For static SVG we keep single polyline with 0.55 opacity
        predictPts.push([x,y]);
      }
    }
    var thresholdY = -1;
    if (threshold != null && threshold>=min && threshold<=max) thresholdY = VIEW_H - ((threshold-min)/(max-min||1))*VIEW_H;
    var gradId = nextUid();
    var latestLabel = latest ? latest.v.toFixed(latest.v>=100?0:1)+unit : '—';
    var firstClock = fmtClock(samples[0].t);
    var midClock = n>2 ? fmtClock(samples[Math.floor(n/2)].t) : '';
    var lastClock = fmtClock(samples[n-1].t);
    var svg = '<div class="relative w-full '+heightClass+'">'
      + '<div class="flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1"><span class="uppercase tracking-wide">'+escf(label)+'</span><span class="font-mono text-gray-200">'+escf(latestLabel)+'</span></div>'
      + '<svg viewBox="0 0 '+VIEW_W+' '+VIEW_H+'" preserveAspectRatio="none" class="w-full h-[calc(100%-1.25rem)] block">'
      + '<defs><linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+escf(color)+'" stop-opacity="0.55"/><stop offset="100%" stop-color="'+escf(color)+'" stop-opacity="0.02"/></linearGradient></defs>'
      + ticks.map(function(t){ return '<line x1="0" y1="'+t.y+'" x2="'+VIEW_W+'" y2="'+t.y+'" stroke="var(--ks-chart-grid, rgba(255,255,255,0.06))" stroke-width="0.2" vector-effect="non-scaling-stroke"/>'; }).join('')
      + (thresholdY>=0 ? '<line x1="0" y1="'+thresholdY+'" x2="'+VIEW_W+'" y2="'+thresholdY+'" stroke="'+escf(thresholdColor)+'" stroke-opacity="0.55" stroke-width="0.3" stroke-dasharray="1.5 1" vector-effect="non-scaling-stroke"/>' : '')
      + '<path d="'+areaPath+'" fill="url(#'+gradId+')" stroke="none"/>'
      + (predictPts.length>=2 ? '<polyline points="'+predictPts.map(function(p){ return p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ')+'" fill="none" stroke="'+escf(color)+'" stroke-opacity="0.55" stroke-width="0.6" stroke-dasharray="1.2 0.8" vector-effect="non-scaling-stroke"/>' : '')
      + '<path d="'+path+'" fill="none" stroke="'+escf(color)+'" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
      + '</svg>'
      + '<div class="flex justify-between text-[9px] text-gray-500 font-mono mt-0.5 px-0.5"><span>'+escf(firstClock)+'</span><span>'+escf(midClock)+'</span><span>'+escf(lastClock)+'</span></div>'
      + '</div>';
    return svg;
  }

  function donutSvg(pct, color, label, sub, warnAt, dangerAt) {
    var safe = clamp(pct||0, 0, 100);
    var warn = warnAt != null ? warnAt : 75;
    var danger = dangerAt != null ? dangerAt : 90;
    var col = safe >= danger ? tok('--ks-bad', '#f87171') : (safe >= warn ? tok('--ks-warn', '#fbbf24') : color);
    var r = 42, cx = 50, cy = 50;
    var circumference = 2 * Math.PI * r;
    var dash = (safe/100)*circumference;
    // Use neutral track like MetricsChart: rgba(255,255,255,0.08) or var(--ks-chart-track)
    var track = 'var(--ks-chart-track, rgba(255,255,255,0.08))';
    // Fallback for tok where var() not resolved: use rgba
    var trackColor = tok('--ks-chart-track', 'rgba(255,255,255,0.08)');
    // If tok returns var() itself (when unset), keep var() for CSS, but for SVG attribute we need concrete; fallback already concrete
    // Use concrete trackColor if it looks like var( -> use fallback)
    if (trackColor.indexOf('var(')===0) trackColor = 'rgba(255,255,255,0.08)';
    return '<div class="flex flex-col items-center justify-center"><div style="position:relative;width:132px;height:132px">'
      + '<svg viewBox="0 0 100 100" style="width:132px;height:132px;transform:rotate(-90deg)">'
      + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+escf(trackColor)+'" stroke-width="9"/>'
      + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+escf(col)+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+dash+' '+(circumference-dash)+'" style="transition:stroke-dasharray 600ms ease-out, stroke 400ms ease-out"/>'
      + '</svg>'
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">'
      + '<span class="text-xl font-semibold tabular-nums text-white" style="color:'+escf(col)+'">'+escf(label)+'</span>'
      + (sub ? '<span class="text-[10px] text-gray-400 mt-0.5">'+escf(sub)+'</span>' : '')
      + '</div></div></div>';
  }

  function trend(cur, prev, unit, digits) {
    if (cur == null || prev == null) return '';
    var delta = cur - prev;
    var arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '•');
    var col = delta > 0 ? tok('--ks-bad', '#fca5a5') : (delta < 0 ? tok('--ks-ok', '#6ee7b7') : tok('--ks-muted', '#9ca3af'));
    return '<span class="ks-mono" style="font-size:10px;color:'+col+'">'+arrow+' '+Math.abs(delta).toFixed(digits)+unit+'</span>';
  }

  function render() {
    var m = state.m;
    var cpuHist = state.hist.cpu || [], memHist = state.hist.mem || [], diskHist = state.hist.disk || [];
    var rxHist = state.hist.netrx || [], txHist = state.hist.nettx || [], loadHist = state.hist.load || [];

    var cpuPct = m ? (m.cpu_pct != null ? m.cpu_pct : (m.cpu != null ? m.cpu : null)) : null;
    var memPct = m && m.mem_used != null && m.mem_total > 0 ? (m.mem_used / m.mem_total) * 100 : (m && m.mem_pct != null ? m.mem_pct : null);
    var diskPct = m && m.disk_used != null && m.disk_total > 0 ? (m.disk_used / m.disk_total) * 100 : (m && m.disk_pct != null ? m.disk_pct : null);
    var latestRx = rxHist.length ? rxHist[rxHist.length - 1].v : 0;
    var latestTx = txHist.length ? txHist[txHist.length - 1].v : 0;

    var overall = ['cpu', 'mem', 'disk'].map(function (k) {
      var v = k === 'cpu' ? cpuPct : (k === 'mem' ? memPct : diskPct);
      return healthOf(v != null ? v : undefined);
    }).reduce(function (worst, hh) {
      var order = { unknown: 0, healthy: 1, warn: 2, danger: 3 };
      return order[hh] > order[worst] ? hh : worst;
    }, 'unknown');
    var oMeta = {
      healthy: { c: 'var(--ks-ok)', label: 'Overall · healthy', text: 'All resources within healthy thresholds.' },
      warn: { c: 'var(--ks-warn)', label: 'Overall · watch', text: 'One or more resources crossed the warning threshold.' },
      danger: { c: 'var(--ks-bad)', label: 'Overall · critical', text: 'A resource is in the danger band — investigate soon.' },
      unknown: { c: 'var(--ks-muted)', label: 'Overall · no data', text: 'Waiting for the first sample from the edge.' }
    }[overall];
    var lastLabel = state.lastSampleAt == null ? '—' : Math.max(0, Math.round((Date.now() - state.lastSampleAt) / 1000)) + 's ago';

    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Metrics</h2>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<div style="display:flex;background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:2px;font-size:11px">'
      + ['1m', '5m', '15m'].map(function (r) {
        return '<button type="button" data-range="' + r + '" style="padding:3px 10px;border:none;border-radius:4px;background:' + (state.range === r ? 'var(--ks-tab-active-bg, #fff)' : 'transparent') + ';color:' + (state.range === r ? 'var(--ks-tab-active-text, #000)' : 'var(--ks-muted)') + ';cursor:pointer;font-family:inherit;font-weight:500">' + r + '</button>';
      }).join('')
      + '</div>'
      + '<span class="ks-mono" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--ks-body);background:var(--ks-input-bg);border:1px solid var(--ks-card-border);border-radius:6px;padding:5px 8px">'
      + '<span style="width:6px;height:6px;border-radius:50%;background:' + (state.lastError ? 'var(--ks-bad)' : 'var(--ks-ok)') + (state.lastError ? '' : ';animation:ks-pulse 1.2s ease-in-out infinite') + '"></span>'
      + (state.lastError ? 'stale' : 'live') + ' · ' + lastLabel + '</span>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div></div>';

    if (state.lastError) {
      html += '<div class="ks-card" style="border:1px solid color-mix(in srgb, var(--ks-bad) 28%, transparent)!important;margin-top:12px;font-size:12px;color:var(--ks-bad)">'
        + '<div style="font-weight:600;margin-bottom:2px">Last poll failed</div>'
        + '<div style="color:var(--ks-bad-soft, #fca5a5);word-break:break-all">' + escf(state.lastError) + '</div>'
        + '<div style="color:var(--ks-muted);margin-top:4px">Showing the last-known values until the next successful refresh</div></div>';
    }

    // health banner — use glass-card with subtle border, badge like main panel HealthBadge
    var healthDot = overall==='healthy' ? 'bg-emerald-400' : overall==='warn' ? 'bg-amber-400' : overall==='danger' ? 'bg-red-400' : 'bg-gray-400';
    var healthBg = overall==='healthy' ? 'bg-emerald-900/30 ring-emerald-400/30 text-emerald-300' : overall==='warn' ? 'bg-amber-900/30 ring-amber-400/30 text-amber-300' : overall==='danger' ? 'bg-red-900/30 ring-red-400/30 text-red-300' : 'bg-gray-800/40 ring-gray-400/30 text-gray-300';
    var bannerBorder = overall==='danger' ? 'border:1px solid color-mix(in srgb, var(--ks-bad) 22%, transparent)' : overall==='warn' ? 'border:1px solid color-mix(in srgb, var(--ks-warn) 22%, transparent)' : '';
    html += '<div class="glass-card rounded-xl" data-ks-key="health-banner" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;'+bannerBorder+'">'
      + '<div style="display:flex;align-items:center;gap:12px;min-width:0">'
      + '<span class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 '+healthBg+'" style="flex-shrink:0"><span class="relative inline-flex w-1.5 h-1.5 rounded-full '+healthDot+'">'+((overall==='warn'||overall==='danger')?'<span class="absolute inline-flex w-full h-full rounded-full '+healthDot+' opacity-75 animate-ping"></span>':'')+'</span>'+escf(oMeta.label)+'</span>'
      + '<span class="text-xs text-gray-400" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escf(oMeta.text)+'</span></div>'
      + '<div class="ks-mono hidden sm:flex" style="display:flex;gap:14px;font-size:11px;color:var(--ks-muted);flex-shrink:0">'
      + '<span>CPU <span style="color:var(--ks-body)">'+(cpuPct != null ? cpuPct.toFixed(1)+'%' : '—')+'</span></span>'
      + '<span>MEM <span style="color:var(--ks-body)">'+(memPct != null ? memPct.toFixed(1)+'%' : '—')+'</span></span>'
      + '<span>DSK <span style="color:var(--ks-body)">'+(diskPct != null ? diskPct.toFixed(1)+'%' : '—')+'</span></span>'
      + '</div></div>';

    // tiles — use ks-stat-card like main panel, no colored inset border
    function tileDef(key, label, value, sub, accent, hist, health, trendUnit, digits) {
      var last = hist.length ? hist[hist.length - 1].v : null;
      var prev = hist.length > 1 ? hist[hist.length - 2].v : null;
      return '<div class="ks-stat-card rounded-xl flex flex-col gap-2 p-3" data-ks-key="' + escf(key) + '">'
        + '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:4px">'
        + '<span class="text-[10px] text-gray-400 uppercase tracking-wide" style="overflow:hidden;text-overflow:ellipsis">'+escf(label)+'</span>'
        + (hist.length > 1 ? trend(last, prev, trendUnit, digits) : '')
        + '</div>'
        + '<div class="ks-mono text-2xl font-semibold leading-none tabular-nums" style="color:'+accent+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escf(value)+'</div>'
        + (sub ? '<div class="ks-mono text-[10px] text-gray-500" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escf(sub)+'</div>' : '')
        + (hist.length > 1 ? sparklineSvg(hist, accent) : '')
        + '</div>';
    }
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-top:12px">'
      + tileDef('t-cpu', 'CPU', cpuPct != null ? cpuPct.toFixed(1)+'%' : '—', '', tok('--ks-info','#7dd3fc'), cpuHist, healthOf(cpuPct), '%', 1)
      + tileDef('t-mem', 'Memory', memPct != null ? memPct.toFixed(1)+'%' : '—', m && m.mem_used != null ? fmtBytes(m.mem_used)+' / '+fmtBytes(m.mem_total) : '', tok('--ks-ok','#6ee7b7'), memHist, healthOf(memPct), '%', 1)
      + tileDef('t-disk', 'Disk', diskPct != null ? diskPct.toFixed(1)+'%' : '—', m && m.disk_used != null ? fmtBytes(m.disk_used)+' / '+fmtBytes(m.disk_total) : '', tok('--ks-warn','#fcd34d'), diskHist, healthOf(diskPct), '%', 1)
      + tileDef('t-load', 'Load (1m)', m && m.load1 != null ? Number(m.load1).toFixed(2) : '—', '', tok('--ks-purple','#c4b5fd'), loadHist, healthOf(m && m.load1 != null ? Math.min(100, m.load1*25) : undefined), '', 2)
      + tileDef('t-uptime', 'Uptime', fmtUptime(m ? m.uptime : undefined), '', 'var(--ks-secondary, #e5e7eb)', [], 'unknown', '', 0)
      + tileDef('t-net', 'Net RX / TX', fmtRate(latestRx)+' / '+fmtRate(latestTx), '', tok('--ks-pink','#f0abfc'), rxHist, 'unknown', '', 0)
      + '</div>';

    // area charts row — glass-card like HostPanel
    html += '<div class="ks-card-grid grid grid-cols-1 xl:grid-cols-3 gap-4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">'
      + '<div class="glass-card rounded-xl" data-ks-key="chart-cpu">'+areaChartSvg(cpuHist, {max:100, color: tok('--ks-info','#7dd3fc'), label:'CPU %', unit:'%', threshold:80, thresholdColor: tok('--ks-warn','#fbbf24'), heightClass:'h-48'})+'<div class="mt-1 text-[11px] text-gray-500">Optimistic projection dashed · warning at 80%</div></div>'
      + '<div class="glass-card rounded-xl" data-ks-key="chart-mem">'+areaChartSvg(memHist, {max:100, color: tok('--ks-ok','#6ee7b7'), label:'MEM %', unit:'%', threshold:85, thresholdColor: tok('--ks-warn','#fbbf24'), heightClass:'h-48'})+'<div class="mt-1 text-[11px] text-gray-500">Warning at 85% · danger at 95%</div></div>'
      + '<div class="glass-card rounded-xl flex flex-col items-center justify-center p-4" data-ks-key="chart-disk"><h3 class="text-sm font-semibold text-white self-start mb-2 w-full">Disk</h3>'+donutSvg(diskPct||0, tok('--ks-warn','#fcd34d'), diskPct!=null?diskPct.toFixed(1)+'%':'—', m && m.disk_used!=null?fmtBytes(m.disk_used)+' / '+fmtBytes(m.disk_total):'', 80,92)+'<p class="text-[11px] text-gray-500 mt-2">Warning at 80% · danger at 92%</p></div>'
      + '</div>';

    // secondary gauges / network row
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px">'
      + '<div class="glass-card rounded-xl"><h3 style="font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px">Memory donut</h3>'+donutSvg(memPct||0, tok('--ks-ok','#6ee7b7'), memPct!=null?memPct.toFixed(1)+'%':'—', m && m.mem_used!=null?fmtBytes(m.mem_used)+'/'+fmtBytes(m.mem_total):'', 75,90)+'</div>'
      + '<div class="glass-card rounded-xl"><h3 style="font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px">Disk donut</h3>'+donutSvg(diskPct||0, tok('--ks-warn','#fcd34d'), diskPct!=null?diskPct.toFixed(1)+'%':'—', m && m.disk_used!=null?fmtBytes(m.disk_used)+'/'+fmtBytes(m.disk_total):'', 80,92)+'</div>'
      + '<div class="glass-card rounded-xl"><h3 style="font-size:13px;font-weight:600;color:var(--ks-heading);margin:0 0 8px">Network throughput</h3>'
      + '<div style="display:flex;flex-direction:column;gap:12px;padding:8px 0">'
      + '<div><div style="display:flex;align-items:center;gap:8px;font-size:11px" class="ks-mono"><span style="width:14px;height:2px;background:var(--ks-pink, #f0abfc);display:inline-block"></span><span class="ks-muted">RX in</span><span style="color:var(--ks-pink, #f0abfc);font-size:13px">'+fmtRate(latestRx)+'</span></div>'+areaChartSvg(rxHist, {max: Math.max(1, Math.max.apply(null, rxHist.map(function(s){return s.v;}).concat([0]))*1.2), color: tok('--ks-pink','#f0abfc'), label:'RX', unit:' B/s', optimistic:false, heightClass:'h-24'})+'</div>'
      + '<div><div style="display:flex;align-items:center;gap:8px;font-size:11px" class="ks-mono"><span style="width:14px;height:2px;background:var(--ks-cyan, #22d3ee);display:inline-block"></span><span class="ks-muted">TX out</span><span style="color:var(--ks-cyan, #22d3ee);font-size:13px">'+fmtRate(latestTx)+'</span></div>'+areaChartSvg(txHist, {max: Math.max(1, Math.max.apply(null, txHist.map(function(s){return s.v;}).concat([0]))*1.2), color: tok('--ks-cyan','#22d3ee'), label:'TX', unit:' B/s', optimistic:false, heightClass:'h-24'})+'</div>'
      + '</div></div>'
      + '</div>';

    html += '<p class="ks-muted" style="font-size:10px;text-align:center;padding-top:10px;margin:0">Window: last '
      + (state.range === '1m' ? '1 minute' : state.range === '5m' ? '5 minutes' : '15 minutes') + ' · '
      + RANGE_SAMPLES[state.range] + ' samples max · refreshed every 5s · projected points use a 6-sample linear regression.</p>';

    document.getElementById('root').innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('[data-range]'), function (b) {
      b.addEventListener('click', function () {
        state.range = b.getAttribute('data-range');
        trimAll(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="refresh"]'), function (b) { b.addEventListener('click', poll); });
  }

  function start(s) {
    sdk = s;
    render();
    poll();
    var timer = setInterval(poll, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearInterval(timer); timer = null; }
      else if (timer === null) { poll(); timer = setInterval(poll, 5000); }
    });
  }

  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });

  var st = document.createElement('style');
  st.textContent = '@keyframes ks-spin{to{transform:rotate(360deg)}}@keyframes ks-pulse{0%,100%{opacity:1}50%{opacity:.35}}';
  document.head.appendChild(st);
})();
<\/script>`,Ss=`<div id="root"></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var PROTO = {
    tcp: { c: 'var(--ks-info)', label: 'TCP' },
    udp: { c: 'var(--ks-warn)', label: 'UDP' },
    http: { c: 'var(--ks-ok)', label: 'HTTP' },
    https: { c: 'var(--ks-ok)', label: 'HTTPS' }
  };

  function render() {
    var inst = sdk.instance;
    var host = inst.node_name || ('node-' + (inst.node_id != null ? inst.node_id : '?'));
    var ports = [];
    try {
      var rawPorts = inst.config.ports;
      if (typeof rawPorts === 'string') { try { rawPorts = JSON.parse(rawPorts); } catch (e) { rawPorts = []; } }
      ports = Array.isArray(rawPorts) ? rawPorts : [];
    } catch (e) { ports = []; }

    var html = '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0 0 14px">Network</h2>';

    if (ports.length === 0) {
      html += '<div class="ks-card"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Forwarded ports</h3>'
        + '<p class="ks-muted" style="font-size:12px;margin:0 0 8px">Host \\u2192 container bindings the driver opened at deploy time.</p>'
        + '<p class="ks-muted" style="font-size:12px;margin:0;padding:8px 12px">No ports are forwarded to this instance.</p></div>';
    } else {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        + '<h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ks-heading);margin:0">Forwarded ports</h3>'
        + '<span class="ks-muted" style="font-size:10px">' + ports.length + ' mapping' + (ports.length === 1 ? '' : 's') + '</span>'
        + '</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
      for (var i = 0; i < ports.length; i++) {
        (function (p) {
          var proto = String(p.protocol || 'tcp').toLowerCase();
          var meta = PROTO[proto] || { c: 'var(--ks-muted)', label: (p.protocol || 'TCP').toUpperCase() };
          var reach = host + ':' + (p.host || '');
          var scheme = proto === 'https' ? 'https' : (proto === 'http' ? 'http' : null);
          html += '<div class="ks-card" data-ks-key="' + esc(String(p.host||p.host_port||i||'')) + '" style="display:flex;flex-direction:column;gap:12px">'
            // header
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<div style="display:flex;align-items:center;gap:8px;min-width:0">'
            + '<span style="width:8px;height:8px;border-radius:50%;background:' + meta.c + '"></span>'
            + '<span class="ks-badge" style="color:' + meta.c + ';border-color:color-mix(in srgb,' + meta.c + ' 35%,transparent)">' + esc(meta.label) + '</span>'
            + '<span class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">port</span>'
            + '</div>'
            + '<span class="ks-mono" style="font-size:24px;font-weight:600;color:var(--ks-heading);line-height:1">' + esc(p.host || '—') + '</span>'
            + '</div>'
            // flow
            + '<div style="display:flex;align-items:center;gap:12px;padding:0 4px">'
            + '<div style="display:flex;flex-direction:column;align-items:center;min-width:0"><span class="ks-muted" style="font-size:10px;text-transform:uppercase">Host</span><span class="ks-mono" style="font-size:13px;color:var(--ks-body)">' + esc(p.host || '—') + '</span></div>'
            + '<div style="flex:1;text-align:center;color:var(--ks-info)">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;margin:0 auto;display:block"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;align-items:center;min-width:0"><span class="ks-muted" style="font-size:10px;text-transform:uppercase">Container</span><span class="ks-mono" style="font-size:13px;color:var(--ks-body)">' + esc(p.container || '—') + '</span></div>'
            + '</div>'
            // footer
            + '<div style="padding-top:8px;margin-top:auto;border-top:1px solid var(--ks-card-border);display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<div style="min-width:0"><div class="ks-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.04em">Reachable on</div>'
            + '<code class="ks-mono" style="font-size:12px;color:var(--ks-body);display:block;word-break:break-all">' + esc(reach) + '</code></div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0">'
            + (scheme
              ? '<a href="' + scheme + '://' + esc(reach) + '" target="_blank" rel="noreferrer" title="Open in a new tab" style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);border-radius:6px;color:var(--ks-secondary)">'
              + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>'
              : '')
            + '<button type="button" data-copy="' + esc(reach) + '" title="Copy host:port" style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ks-card-border);border-radius:6px;background:transparent;color:var(--ks-secondary);cursor:pointer">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:14px;height:14px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg></button>'
            + '</div></div></div>';
        })(ports[i]);
      }
      html += '</div>';
    }

    document.getElementById('root').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () {
        copyText(sdk, b.getAttribute('data-copy'), 'Copied host:port');
      });
    });
  }


  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  // copyText reports honestly: the sandboxed iframe may deny the async
  // Clipboard API, so fall back to execCommand and toast the real result.
  function copyText(sdk2, text, okMsg) {
    var done = function (ok) { try { sdk2.toast(ok ? okMsg : 'Copy failed', ok ? 'success' : 'error'); } catch (e) { /* ignore */ } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  function start(s) { sdk = s; render(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
<\/script>
`,Ns=`<div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="ks-skeleton-bar" style="height:20px;width:108px"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px"><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:48%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:32%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:52%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:62%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:36%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:44%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:28%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:46%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:68%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:34%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:50%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:66%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:30%"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:42%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:64%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:10px;width:38%"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var state = { rows: [], loading: true, error: '', expanded: {}, killing: {} };
  var base = function () { return '/api/instances/' + sdk.instance.id; };
  function ask(m){try{if(window.KSPageSDK&&typeof window.KSPageSDK.confirm==="function")return window.KSPageSDK.confirm(m);}catch(e){}return Promise.resolve(window.confirm(m));}

  function load(keepError) {
    state.loading = true; if (!keepError) state.error = '';
    render();
    sdk.fetchPanel(base() + '/processes')
      .then(function (data) { var rows = Array.isArray(data) ? data : (data && Array.isArray(data.processes) ? data.processes : []); state.rows = rows; state.loading = false; render(); })
      .catch(function (e) { state.loading = false; state.error = (e && e.message) || 'Failed to load processes'; render(); });
  }

  async function kill(pid) {
    var msg = String(pid) === '1'
      ? 'PID 1 is this instance\\u2019s main process \\u2014 killing it stops the entire instance. Continue?'
      : 'Kill process ' + pid + '? SIGTERM is sent first; SIGKILL follows automatically if it survives.';
    if (!(await ask(msg))) return;
    state.killing[pid] = true; state.error = ''; render();
    sdk.fetchPanel(base() + '/processes/kill?pid=' + encodeURIComponent(pid), { method: 'POST' })
      .then(function (r) {
        delete state.killing[pid];
        if (r && r.ok === true && r.killed === true) {
          sdk.toast('Process ' + pid + (r.stopped_instance ? ' is the workload\\u2019s main process \\u2014 instance stopped' : r.escalated ? ' force-killed (SIGKILL)' : ' terminated'), 'success');
        } else {
          state.error = (r && r.error) || ('Process ' + pid + ' survived the kill attempt.');
        }
        load(true);
      })
      .catch(function (e) { delete state.killing[pid]; state.error = (e && e.message) || 'Kill failed'; render(); });
  }

  function skeleton() {
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += '<div class="ks-card"><div style="height:14px;width:50%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:12px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
        + '<div style="height:10px;width:66%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);margin-bottom:8px;animation:ks-skeleton-p 1.45s ease-in-out infinite"></div>'
        + '<div style="height:10px;width:33%;background:var(--ks-skeleton-shimmer, var(--ks-input-bg));border-radius:var(--ks-skeleton-radius,4px);animation:ks-skeleton-p 1.45s ease-in-out infinite"></div></div>';
    }
    return out;
  }

  function render() {
    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0">Processes</h2>'
      + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"' + (state.loading ? ' disabled' : '') + '><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
      + '</div>';

    if (state.error) html += '<p style="font-size:12px;color:var(--ks-bad);margin-top:10px">' + esc(state.error) + '</p>';

    if (state.loading) {
      html += '<div class="ks-ip-scroll-area" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px;max-height:calc(100vh - 260px);max-height:calc(100dvh - 260px);overflow:auto;padding-right:4px">' + skeleton() + '</div>';
    } else if (state.rows.length === 0) {
      html += '<div class="ks-card" style="margin-top:12px"><p class="ks-muted" style="font-size:12px;margin:0;padding:6px 12px">No processes reported. The instance may be stopped or the edge’s inspect endpoint is unavailable.</p></div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px">';
      state.rows.forEach(function (p) {
        var key = String(p.pid);
        var cmd = p.cmd || p.name || '';
        var expanded = !!state.expanded[key];
        var displayCmd = (!expanded && String(cmd).length > 50) ? String(cmd).substring(0, 50) + '...' : cmd;
        html += '<div class="ks-card" data-ks-key="' + esc(String(p.pid)) + '" style="display:flex;flex-direction:column;gap:10px">'
          + '<div><div style="font-size:13px;font-weight:600;color:var(--ks-heading)">PID ' + esc(p.pid) + '</div>'
          + '<span class="ks-badge ks-mono" style="margin-top:4px">' + esc(p.user || '—') + '</span></div>'
          + '<div style="display:flex;align-items:flex-start;gap:8px"><span class="ks-mono ks-muted" style="font-size:12px;flex-shrink:0">Command:</span>'
          + '<span class="ks-mono" style="font-size:12px;color:var(--ks-body);word-break:break-all;white-space:pre-wrap">' + esc(displayCmd) + '</span></div>'
          + (String(cmd).length > 50
            ? '<div><button type="button" class="ks-btn" data-expand="' + esc(key) + '" style="border:none!important;background:transparent!important;padding:0!important;font-size:12px;color:var(--ks-link)">' + (expanded ? 'Show less' : 'Show more') + '</button></div>'
            : '')
          + '<div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--ks-muted);padding-top:6px;border-top:1px solid var(--ks-card-border)">'
          + '<span><span style="color:var(--ks-info)">CPU</span> <span class="ks-mono" style="font-variant-numeric:tabular-nums">' + (p.cpu != null ? Number(p.cpu).toFixed(1) : '0.0') + '</span><span class="ks-muted">%</span></span>'
          + '<span><span style="color:var(--ks-ok)">Mem</span> <span class="ks-mono" style="font-variant-numeric:tabular-nums">' + (p.mem != null ? Number(p.mem).toFixed(1) : '0.0') + '</span><span class="ks-muted">%</span></span>'
          + '<span style="flex:1"></span>'
          + '<button type="button" class="ks-btn-header ks-icon-btn"' + (state.killing[p.pid] ? ' disabled' : '') + ' data-kill="' + esc(p.pid) + '" title="Kill (SIGTERM, auto-escalates to SIGKILL)" aria-label="Kill" style="color:var(--ks-bad)!important;border-color:var(--ks-bad-line)!important">' + (state.killing[p.pid] ? 'Killing…' : 'Kill') + '</button>'
          + '</div></div>';
      });
      html += '</div>';
    }
    document.getElementById('root').innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('[data-action="refresh"]'), function (b) { b.addEventListener('click', load); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-expand]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-expand');
        if (state.expanded[k]) delete state.expanded[k]; else state.expanded[k] = true;
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-kill]'), function (b) {
      b.addEventListener('click', function () { kill(b.getAttribute('data-kill')); });
    });
  }

  function start(s) { sdk = s; load(); }
  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
<\/script>
`,Cs=`<div id="root"><div class="ks-skeleton-bar" style="height:20px;width:96px;margin-bottom:12px"></div><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:26%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:88%;margin-bottom:8px"></div><div style="display:grid;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:10px;width:52px"></div></div><div style="display:flex;justify-content:space-between;gap:12px"><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:44px"></div></div></div></div><div class="ks-card" style="margin-bottom:12px"><div class="ks-skeleton-bar" style="height:14px;width:22%;margin-bottom:12px"></div><div class="ks-skeleton-bar" style="height:10px;width:92%;margin-bottom:8px"></div><div class="ks-skeleton-bar" style="height:32px;width:100%;border-radius:6px;margin-top:8px"></div></div><div class="ks-card"><div class="ks-skeleton-bar" style="height:14px;width:24%;margin-bottom:12px"></div><div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px"><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div></div></div></div>

<script>
(function () {
  'use strict';
  var sdk = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pairs(v) {
    var out = [];
    if (Array.isArray(v)) {
      v.forEach(function (it) {
        if (Array.isArray(it) && it.length >= 2) out.push({ key: String(it[0]), value: String(it[1]) });
        else if (it && typeof it === 'object') out.push({ key: String(it.key != null ? it.key : (it.name != null ? it.name : '')), value: String(it.value != null ? it.value : (it.path != null ? it.path : '')) });
      });
    } else if (v && typeof v === 'object') {
      Object.keys(v).forEach(function (k) { out.push({ key: k, value: String(v[k]) }); });
    }
    return out;
  }

  function build(cfg) {
    try { if (typeof cfg === 'string') cfg = JSON.parse(cfg); } catch (e) { cfg = {}; }
    if (!cfg || typeof cfg !== 'object') cfg = {};
    // ---- limits (mirrors extractConfig merge rules)
    var limits = pairs(cfg.limits);
    var have = {};
    limits.forEach(function (l) { have[l.key] = true; });
    ['cpus', 'cpu', 'memory', 'mem', 'ram', 'disk', 'disk_size', 'storage'].forEach(function (k) {
      if (cfg[k] != null && cfg[k] !== '' && !have[k]) { limits.push({ key: k, value: String(cfg[k]) }); have[k] = true; }
    });
    var adv = cfg.advanced || {};
    [['kvm', ['vcpus']], ['multipass', ['cpus', 'memory', 'mem_mb', 'disk', 'disk_mb']], ['lxd', ['limits_cpu_allowance']]].forEach(function (ent) {
      var sub = adv[ent[0]] || {};
      ent[1].forEach(function (k) {
        if (sub[k] != null && sub[k] !== '' && !have[k]) { limits.push({ key: k, value: String(sub[k]) }); have[k] = true; }
      });
    });

    // env — the deploy snapshot stores either a map or an array of vars
    var env = [];
    if (Array.isArray(cfg.env)) {
      cfg.env.forEach(function (e) {
        if (!e || typeof e !== 'object') return;
        // definition rows carry name/default; runtime rows carry key/value
        var k = e.key != null ? e.key : (e.name != null ? e.name : '');
        var val = e.value != null ? e.value : (e.default != null ? e.default : '');
        if (k !== '') env.push({ key: String(k), value: String(val) });
      });
    } else if (cfg.env && typeof cfg.env === 'object') {
      Object.keys(cfg.env).forEach(function (k) { env.push({ key: k, value: String(cfg.env[k]) }); });
    }

    var command = Array.isArray(cfg.command) ? cfg.command.map(String) : (typeof cfg.command === 'string' ? [cfg.command] : []);

    var html = '<h2 style="font-size:20px;font-weight:600;color:var(--ks-heading);margin:0 0 14px">Settings</h2>';

    // Resource limits
    html += '<div class="ks-card" data-ks-key="resource-limits" style="margin-bottom:12px"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Resource limits</h3>'
      + '<p class="ks-muted" style="font-size:12px;margin:0 0 8px">CPU / memory / disk caps the driver enforces.</p>';
    if (limits.length === 0) {
      html += '<p class="ks-muted" style="font-size:12px;padding:6px 12px;margin:0">No resource limits set — the instance runs with the driver\\u2019s defaults.</p>';
    } else {
      limits.forEach(function (l) {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;border-bottom:1px solid var(--ks-card-border)">'
          + '<span style="font-size:13px" class="ks-muted">' + esc(l.key) + '</span>'
          + '<span class="ks-mono" style="font-size:12px;color:var(--ks-body)">' + esc(l.value) + '</span></div>';
      });
    }
    html += '</div>';

    // Environment
    html += '<div class="ks-card" data-ks-key="environment" style="margin-bottom:12px"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Environment</h3>'
      + '<p class="ks-muted" style="font-size:12px;margin:0 0 8px">Variables the driver injected at deploy time.</p>';
    if (env.length === 0) {
      html += '<p class="ks-muted" style="font-size:12px;padding:6px 12px;margin:0">No environment variables set.</p>';
    } else {
      html += '<div style="overflow-x:auto"><table style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr>'
        + '<th class="ks-muted" style="text-align:left;padding:8px 12px;font-weight:500;background:var(--ks-input-bg)">Key</th>'
        + '<th class="ks-muted" style="text-align:left;padding:8px 12px;font-weight:500;background:var(--ks-input-bg)">Value</th>'
        + '</tr></thead><tbody>';
      env.forEach(function (e2) {
        html += '<tr><td class="ks-mono" style="padding:8px 12px;font-size:12px;color:var(--ks-body);border-top:1px solid var(--ks-card-border)">' + esc(e2.key) + '</td>'
          + '<td class="ks-mono" style="padding:8px 12px;font-size:12px;color:var(--ks-secondary);border-top:1px solid var(--ks-card-border);word-break:break-all">' + esc(e2.value) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // Runtime policy
    html += '<div class="ks-card"><h3 style="font-size:13px;font-weight:600;margin:0 0 4px;color:var(--ks-heading)">Runtime policy</h3>'
      + '<p class="ks-muted" style="font-size:12px;margin:0 0 4px">Restart policy and other deploy-time flags.</p>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;border-bottom:1px solid var(--ks-card-border)">'
      + '<span class="ks-muted" style="font-size:13px">Restart policy</span>'
      + '<span style="font-size:13px;color:var(--ks-body)">' + esc(typeof cfg.restart === 'string' && cfg.restart ? cfg.restart : 'default') + '</span></div>';
    if (command.length > 0) {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px">'
        + '<span class="ks-muted" style="font-size:13px;flex-shrink:0">Command</span>'
        + '<span class="ks-mono" style="font-size:12px;color:var(--ks-body);word-break:break-all;text-align:right">' + esc(command.join(' ')) + '</span></div>';
    }
    html += '</div>';
    return html;
  }

  function start(s) {
    sdk = s;
    try {
      document.getElementById('root').innerHTML = build(sdk.instance.config || {});
    } catch (e) {
      document.getElementById('root').innerHTML = '<p style="color:var(--ks-bad);font-size:13px">Failed to render settings: ' + esc(e.message || String(e)) + '</p>';
    }
  }

  if (window.KSPageSDK) start(window.KSPageSDK);
  else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
})();
<\/script>
`,ee=[{id:"docker-manager",name:"Docker Containers",slug:"docker-manager",category:"containers",description:"docker ps with start/stop/restart and log tails for every container on the host.",iconSvg:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',html:is,actions:[{name:"list_containers",type:"shell",command:"docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'",timeout:20,description:"Table of all containers with image, status and ports."},{name:"container_start",type:"shell",command:"docker start {{args}}",open_args:!0,timeout:60,description:"Start a container by name (runtime argument)."},{name:"container_stop",type:"shell",command:"docker stop {{args}}",open_args:!0,timeout:60,description:"Stop a container by name (runtime argument)."},{name:"container_restart",type:"shell",command:"docker restart {{args}}",open_args:!0,timeout:60,description:"Restart a container by name (runtime argument)."},{name:"container_logs",type:"shell",command:"docker logs --tail 200 {{args}}",open_args:!0,timeout:30,description:"Last 200 log lines of a container (runtime argument)."},{name:"prune_dangling",type:"docker",command:"image",args:["prune","--force"],timeout:120,description:"Remove dangling docker images to free disk space."}]},{id:"service-control",name:"Services",slug:"service-control",category:"services",description:"systemd unit list with start/stop/restart/status controls (VMs & systemd containers).",iconSvg:'<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',html:rs,actions:[{name:"list_units",type:"shell",command:"systemctl list-units --type=service --all --no-pager --no-legend",timeout:25,description:"List every systemd service unit and its state."},{name:"unit_status",type:"shell",command:"systemctl status {{args}} --no-pager -l",open_args:!0,timeout:20,description:"Detailed status of one unit (runtime argument)."},{name:"unit_start",type:"shell",command:"systemctl start {{args}}",open_args:!0,timeout:30,description:"Start a unit (runtime argument)."},{name:"unit_stop",type:"shell",command:"systemctl stop {{args}}",open_args:!0,timeout:30,description:"Stop a unit (runtime argument)."},{name:"unit_restart",type:"shell",command:"systemctl restart {{args}}",open_args:!0,timeout:30,description:"Restart a unit (runtime argument)."}]},{id:"cron-scheduler",name:"Cron Jobs",slug:"cron-scheduler",category:"automation",description:"Inspect the user crontab plus /etc/crontab, cron.d and cron.daily.",iconSvg:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/><path d="m19 5 1.5 1.5"/>',html:ns,actions:[{name:"cron_overview",type:"shell",command:"{ echo '# user crontab (crontab -l)'; crontab -l 2>/dev/null || true; echo; echo '# /etc/crontab'; cat /etc/crontab 2>/dev/null || true; echo; echo '# /etc/cron.d'; ls -la /etc/cron.d 2>/dev/null || true; echo; echo '# /etc/cron.daily'; ls -la /etc/cron.daily 2>/dev/null || true; } 2>&1",timeout:20,description:"User crontab plus /etc/crontab, cron.d and cron.daily listings."}]},{id:"disk-analyzer",name:"Disk Usage",slug:"disk-analyzer",category:"storage",description:"df filesystem table plus the largest top-level directories by du.",iconSvg:'<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',html:os,actions:[{name:"df_report",type:"shell",command:"df -h",timeout:30,description:"Filesystem usage table."},{name:"du_top",type:"shell",command:"du -x -d1 -h / 2>/dev/null | sort -rh | head -15",timeout:180,description:"Largest top-level directories by du."},{name:"clean_tmp",type:"shell",command:'find /tmp -type f -atime +7 -delete 2>/dev/null; echo "tmp cleaned (files older than 7 days)"',timeout:60,description:"Delete files in /tmp untouched for over 7 days."}]},{id:"update-center",name:"Package Updates",slug:"update-center",category:"maintenance",description:"Detect apt/apk/dnf/yum, list pending updates and apply upgrades after confirmation.",iconSvg:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',html:ls,actions:[{name:"detect_pm",type:"shell",command:"command -v apt-get || command -v apk || command -v dnf || command -v yum",timeout:10,description:"Print the path of the first supported package manager."},{name:"check_updates",type:"shell",command:"if command -v apt-get >/dev/null; then apt-get update -qq && apt list --upgradable 2>/dev/null | tail -n +2; elif command -v apk >/dev/null; then apk update >/dev/null 2>&1; apk version -l '<'; else (dnf -q check-update || yum -q check-update) 2>/dev/null; fi; true",timeout:180,description:"Refresh package indexes and list pending upgrades (apt/apk/dnf/yum)."},{name:"apply_upgrades",type:"shell",command:"if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get -y upgrade 2>&1 | tail -30; elif command -v apk >/dev/null; then apk upgrade 2>&1 | tail -30; else (dnf -y upgrade || yum -y update) 2>&1 | tail -30; fi",timeout:600,description:"Install all pending package upgrades (non-interactive)."}]},{id:"firewall-view",name:"Firewall Status",slug:"firewall-view",category:"security",description:"Read-only dump of UFW / iptables / nftables rules whichever is present.",iconSvg:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',html:ds,actions:[{name:"ufw",type:"shell",command:"ufw status verbose 2>/dev/null || true",timeout:15,description:"UFW status dump (empty when ufw is absent)."},{name:"iptables",type:"shell",command:"iptables -L -n -v --line-numbers 2>/dev/null | head -80 || true",timeout:15,description:"iptables ruleset (first 80 lines, empty when absent)."},{name:"nft",type:"shell",command:"nft list ruleset 2>/dev/null | head -140 || true",timeout:15,description:"nftables ruleset (first 140 lines, empty when absent)."}]},{id:"user-registry",name:"Users & Groups",slug:"user-registry",category:"administration",description:"Account inventory from /etc/passwd with recent logins.",iconSvg:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',html:cs,actions:[{name:"accounts_report",type:"shell",command:"cat /etc/passwd 2>/dev/null || true",timeout:15,description:"/etc/passwd account inventory."},{name:"groups_count",type:"shell",command:"wc -l < /etc/group 2>/dev/null || true",timeout:10,description:"Number of system groups."},{name:"recent_logins",type:"shell",command:"last -n 12 2>/dev/null || who 2>/dev/null || true",timeout:15,description:"Recent login sessions."}]},{id:"system-probe",name:"System Info",slug:"system-probe",category:"system",description:"CPU model/cores, memory, kernel, architecture and virtualization detail.",iconSvg:'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',html:ps,actions:[{name:"sys_probe",type:"shell",command:`echo "kernel $(uname -r)"; echo "arch $(uname -m)"; echo "virt $(systemd-detect-virt 2>/dev/null || echo n/a)"; echo "cpu $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 || grep -m1 'Processor' /proc/cpuinfo 2>/dev/null | cut -d: -f2)"; echo "cores $(nproc 2>/dev/null || grep -c processor /proc/cpuinfo)"; echo "mem $(free -h 2>/dev/null | awk 'NR==2{print $2}')"; echo "os $(grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"')"; echo "uptime $(uptime -p 2>/dev/null || uptime)"; echo "load $(cat /proc/loadavg 2>/dev/null)"`,timeout:15,description:"Kernel/arch/virt/CPU/memory/OS/uptime/load key-value probe."}]},{id:"lib-audit",name:"Audit",slug:"audit",category:"security",description:"Instance audit log with action history",iconSvg:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',html:vs},{id:"lib-automation",name:"Automation",slug:"automation",category:"automation",description:"Scheduled and manual jobs with recent-run history",iconSvg:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',html:xs},{id:"lib-backups",name:"Backups",slug:"backups",category:"storage",description:"Snapshot manager — create, restore, and delete instance snapshots",iconSvg:'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>',html:ks},{id:"lib-complete-example",name:"Complete Example Page",slug:"complete-example",category:"documentation",description:"A complete working example showing all content types",iconSvg:'<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',html:"",contentType:"blocks",blocks:bs},{id:"lib-env",name:"Env",slug:"env",category:"security",description:"Vaulted environment variables and secrets with reveal/audit tracking",iconSvg:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',html:fs},{id:"lib-home",name:"Home",slug:".",category:"overview",description:"Instance overview rendered AT THE INSTANCE INDEX ROUTE (reserved '.' slug) with status, resource metrics, and quick actions",iconSvg:'<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',html:ys},{id:"lib-html-dashboard",name:"HTML Dashboard Example",slug:"html-dashboard",category:"dashboards",description:"Full HTML dashboard built on panel-native styling that follows the active theme",iconSvg:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',html:ws},{id:"lib-markdown-docs",name:"Markdown Documentation",slug:"markdown-docs",category:"documentation",description:"Complete markdown documentation example",iconSvg:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',html:"",contentType:"markdown",markdown:js},{id:"lib-metrics",name:"Metrics",slug:"metrics",category:"monitoring",description:"Live CPU/memory/disk/network telemetry with charts and health bands",iconSvg:'<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="13" y="7" width="3" height="11"/>',html:_s},{id:"lib-network",name:"Network",slug:"network",category:"networking",description:"Forwarded host-to-container port bindings with copyable reachability hints",iconSvg:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',html:Ss},{id:"lib-processes",name:"Processes",slug:"processes",category:"monitoring",description:"Live process list inside the instance with CPU/MEM usage and kill support",iconSvg:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',html:Ns},{id:"lib-settings",name:"Settings",slug:"settings",category:"configuration",description:"Resource limits, deploy-time environment, and runtime policy",iconSvg:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',html:Cs},{id:"mc-properties",name:"Server Properties",slug:"mc-properties",category:"minecraft",description:"Edit every server.properties key as its own card (text, number, dropdown, password). Auto-detects server.properties or /mc/server.properties.",iconSvg:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',html:ms,actions:[]},{id:"mc-players",name:"Player Manager",slug:"mc-players",category:"minecraft",description:"Read whitelist.json/ops.json/banned-players.json tables and manage players via whitelist/op/ban (rcon/screen) + list_files world/playerdata.",iconSvg:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',html:hs,actions:[{name:"read_whitelist",type:"read_file",path:"whitelist.json",description:"Read whitelist.json table."},{name:"read_ops",type:"read_file",path:"ops.json",description:"Read ops.json table."},{name:"read_banned",type:"read_file",path:"banned-players.json",description:"Read banned-players.json table."},{name:"list_playerdata",type:"list_files",path:"world/playerdata",description:"List world/playerdata via list_files."},{name:"whitelist_add",type:"shell",command:"whitelist add {{args}}",open_args:!0,description:"whitelist add <player> via rcon or screen (install must expose it)."},{name:"op_player",type:"shell",command:"op {{args}}",open_args:!0,description:"op <player> via rcon or screen."},{name:"ban_player",type:"shell",command:"ban {{args}}",open_args:!0,description:"ban <player> via rcon or screen."}]},{id:"mc-world",name:"World Import",slug:"mc-world",category:"minecraft",description:"Import worlds with version compat note + unzip -o {{args}} -d world/ + write_file guard (isDangerousPath) + list_files world/.",iconSvg:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',html:us,actions:[{name:"list_world",type:"list_files",path:"world",description:"List world/ via list_files."},{name:"list_world_root",type:"list_files",path:"world/",description:"List world/ with trailing slash."},{name:"unzip_world",type:"shell",command:"unzip -o {{args}} -d world/",open_args:!0,description:"Unzip world archive into world/ (validated validActionArg)."},{name:"write_world_guard",type:"write_file",path:"world/readme.txt",content:"world import guard — isDangerousPath blocks /etc etc on host writes",description:"Write guard file (write_file, isDangerousPath already in edge/backend/internal/files/handler.go)."},{name:"stat_world",type:"shell",command:'ls -ld world 2>&1; echo "---"; du -sh world 2>&1 | head -5',description:"Stat world directory."}]},{id:"mc-plugins",name:"Plugin Manager",slug:"mc-plugins",category:"minecraft",description:"Manage plugins/ via list_files table + wget {{args}} -P plugins/ / rm plugins/{{args}}.jar + write_file plugins/ExamplePlugin/config.yml + touch restart.flag.",iconSvg:'<path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M12 8V6a4 4 0 0 0-4-4 4 4 0 0 0-4 4v2"/><path d="M9 21h6"/><path d="M18 9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1"/>',html:gs,actions:[{name:"list_plugins",type:"list_files",path:"plugins",description:"Table plugins/ via list_files."},{name:"list_plugins_root",type:"list_files",path:"plugins/",description:"List plugins/ with trailing slash."},{name:"install_plugin",type:"shell",command:"wget {{args}} -P plugins/",open_args:!0,description:"Install plugin via wget {{args}} -P plugins/ (validated validActionArg)."},{name:"remove_plugin",type:"shell",command:"rm plugins/{{args}}.jar",open_args:!0,description:"Remove plugin jar via rm plugins/{{args}}.jar."},{name:"write_plugin_config",type:"write_file",path:"plugins/ExamplePlugin/config.yml",content:`# ExamplePlugin config.yml
# Edit in Studio to customize for your plugin
name: ExamplePlugin
version: 1.0.0
enabled: true
settings:
  example: true
  max-players: 20
`,description:"Write plugins/ExamplePlugin/config.yml (write_file)."},{name:"restart_flag",type:"shell",command:"touch restart.flag && echo restart scheduled via restart.flag",description:"Restart action via touch restart.flag (server watches for flag or install exposes screen/rcon)."}]}];function We(i){return!i||i.indexOf("state.loading")===-1?i:i.replace(/state\.loading\s*=\s*true;\s*state\.error\s*=\s*'';\s*render\(\);/g,"state.loading = true; state.error = ''; render(); setTimeout(function(){ if(state.loading){ state.loading=false; state.error='Load timed out — please refresh'; try{render();}catch(e){} } }, 8000);").replace(/if\s*\(\s*state\.initialLoad\s*\)\s*state\.loading\s*=\s*true;/g,"if(state.initialLoad) state.loading = true; setTimeout(function(){ if(state.loading){ state.loading=false; state.initialLoad=false; state.lastError='Load timed out'; try{render();}catch(e){} } }, 8000);")}for(const i of ee)if(i.html&&(i.html=qe(i.html),i.html=We(i.html)),Array.isArray(i.subPages))for(const m of i.subPages)m&&typeof m.content_html=="string"&&m.content_html&&(m.content_html=qe(m.content_html),m.content_html=We(m.content_html));function ce(i,m){var a;const t=(a=i==null?void 0:i.response)==null?void 0:a.data;if(typeof t=="string"&&t.trim())return t;if(t&&typeof t=="object"){if(typeof t.error=="string")return t.error;if(typeof t.message=="string")return t.message;try{return JSON.stringify(t)}catch{return m}}return typeof(i==null?void 0:i.message)=="string"&&i.message.trim()?i.message:m}let _e=0;function Es(){return _e+=1,{id:`a${Date.now()}-${_e}`,name:"",type:"shell",command:"",path:"",content:"",args:"",open_args:!1,env:"{}",timeout:"30",description:"",mode:"",names:"",dest:""}}function Ms(i){const m=[];for(const t of i){const a=t.name.trim();if(!a)continue;let n;if(t.env.trim()&&t.env.trim()!=="{}")try{const v=JSON.parse(t.env);v&&typeof v=="object"&&!Array.isArray(v)&&(n=Object.fromEntries(Object.entries(v).map(([c,f])=>[c,String(f)])))}catch{}m.push({name:a,type:t.type,command:t.command||void 0,path:t.path||void 0,content:t.content||void 0,args:t.args.trim()?t.args.split(/\s+/).filter(Boolean):void 0,...t.open_args?{open_args:!0}:{},env:n,timeout:parseInt(t.timeout,10)||void 0,description:t.description||void 0,mode:t.mode.trim()||void 0,names:t.names.trim()?t.names.split(/\s+/).filter(Boolean):void 0,dest:t.dest.trim()||void 0})}return m}function xe(i){let m=[];if(i&&i.trim())try{const t=JSON.parse(i);Array.isArray(t)&&(m=t.filter(a=>a&&typeof a=="object"))}catch{}return m.length===0?[]:m.map(t=>({id:`d${_e++}-${Math.random().toString(36).slice(2,8)}`,name:typeof t.name=="string"?t.name:"",type:["shell","read_file","write_file","list_files","docker","kvm","lxd","stat","chmod","archive","extract"].includes(t.type)?t.type:"shell",command:typeof t.command=="string"?t.command:"",path:typeof t.path=="string"?t.path:"",content:typeof t.content=="string"?t.content:"",args:Array.isArray(t.args)?t.args.join(" "):"",open_args:t.open_args===!0,env:t.env&&typeof t.env=="object"?JSON.stringify(t.env,null,2):"{}",timeout:t.timeout!=null?String(t.timeout):"30",description:typeof t.description=="string"?t.description:"",mode:typeof t.mode=="string"?t.mode:"",names:Array.isArray(t.names)?t.names.join(" "):"",dest:typeof t.dest=="string"?t.dest:""}))}function Ve(i){const m=new Set;for(let t=0;t<i.length;t++){const a=i[t],n=a.name.trim();if(n!==""||a.command.trim()!==""||a.path.trim()!==""||a.content.trim()!==""||a.args.trim()!==""||a.description.trim()!==""||a.mode.trim()!==""||a.names.trim()!==""||a.dest.trim()!==""){if(n==="")return`Action #${t+1} needs a name before saving (unnamed actions are dropped).`;if(m.has(n))return`Duplicate action name "${n}".`;if(m.add(n),!["shell","read_file","write_file","list_files","docker","kvm","lxd","stat","chmod","archive","extract"].includes(a.type))return`Action "${n}" has an unknown type "${a.type}".`;if((a.type==="stat"||a.type==="chmod"||a.type==="archive")&&a.path.trim()==="")return`Action "${n}" (${a.type}) requires a path.`;if(a.type==="chmod"){const c=a.mode.trim();if(!/^[0-7]{3,4}$/.test(c)||parseInt(c,8)>511)return`Action "${n}" (chmod) requires mode 000-777.`}if(a.type==="archive"){const c=a.dest.trim().toLowerCase();if(!(c.endsWith(".zip")||c.endsWith(".tar.gz")||c.endsWith(".tgz")))return`Action "${n}" (archive) requires dest ending with .zip or .tar.gz.`}if(a.type==="extract"){const c=a.path.trim().toLowerCase();if(!(c.endsWith(".zip")||c.endsWith(".tar.gz")||c.endsWith(".tgz")))return`Action "${n}" (extract) requires path ending with .zip or .tar.gz.`}}}return""}let Se=0;function Ps(){return Se+=1,{id:`s${Date.now()}-${Se}`,path:"",name:"",content_type:"html",content_html:"",content_markdown:"",content_blocks:"",source_tsx:"",bundle_js:"",bundle_css:""}}function pe(i){const m=Xe(i);return m.length===0?[]:m.map(t=>({id:`p${Se++}-${Math.random().toString(36).slice(2,8)}`,path:t.path,name:t.name,content_type:["html","markdown","blocks","react"].includes(t.content_type)?t.content_type:"html",content_html:typeof t.content_html=="string"?t.content_html:"",content_markdown:typeof t.content_markdown=="string"?t.content_markdown:"",content_blocks:typeof t.content_blocks=="string"?t.content_blocks:"",source_tsx:typeof t.source_tsx=="string"?t.source_tsx:"",bundle_js:typeof t.bundle_js=="string"?t.bundle_js:"",bundle_css:typeof t.bundle_css=="string"?t.bundle_css:""}))}function Ue(i){const m=i.filter(t=>t.path.trim()!==""||t.name.trim()!=="").map(t=>({path:t.path.trim(),name:t.name.trim(),content_type:t.content_type,content_html:t.content_html,content_markdown:t.content_markdown,content_blocks:t.content_blocks,...t.source_tsx?{source_tsx:t.source_tsx}:{},...t.bundle_js?{bundle_js:t.bundle_js}:{},...t.bundle_css?{bundle_css:t.bundle_css}:{}}));return m.length===0?"":JSON.stringify(m)}function Ge(i){const m=i.filter(a=>a.path.trim()!==""||a.name.trim()!=="");if(m.length>20)return`Too many sub-pages (${m.length}, max 20).`;const t=new Set;for(const a of i){const n=a.path.trim(),v=a.name.trim();if(!(n===""&&v==="")){if(!/^[a-z0-9_-]+$/.test(n))return`Sub-page path "${n||"(empty)"}" must be lowercase letters, numbers, dashes or underscores.`;if(v==="")return`Sub-page "/${n}" needs a display name.`;if(t.has(n))return`Duplicate sub-page path "/${n}".`;if(t.add(n),a.content_type==="react"&&!a.source_tsx.trim())return`Sub-page "/${n}" needs React source before saving.`}}return""}let Ne=0;function As(){return Ne+=1,{id:`c${Date.now()}-${Ne}`,name:"",type:"html",description:"",content:"",editable:!0}}function ke(i){const m=we(i);return m.length===0?[]:m.map(t=>{const a=t.editable,n=typeof a=="boolean"?a:t.type!=="shared";return{id:`c${Ne++}-${Math.random().toString(36).slice(2,8)}`,name:t.name,type:["html","markdown","block","shared","module"].includes(t.type)?t.type:"html",description:t.description||"",content:t.content||"",editable:n,...t.type==="shared"?{shared:typeof t.shared=="string"&&t.shared?t.shared:t.name}:{}}})}function fe(i){const m=i.filter(t=>t.name.trim()!=="").map(t=>{if(!(t.editable!==!1)){const n=(t.shared||t.name).trim()||t.name.trim();return{name:t.name.trim(),type:"shared",description:t.description||"",content:"",shared:n,editable:!1}}if(t.type==="shared"&&t.content&&t.content.trim()!==""){const n=(t.shared||t.name).trim()||t.name.trim();return{name:t.name.trim(),type:"shared",description:t.description,content:t.content,shared:n,editable:!0}}return{name:t.name.trim(),type:t.type,description:t.description,content:t.type==="shared"?"":t.content,...t.type==="shared"?{shared:(t.shared||t.name).trim()||t.name.trim()}:{},editable:!0}});return m.length===0?"":JSON.stringify(m)}function Ls(i){const m=i.filter(n=>n.name.trim()!=="");if(m.length>50)return`Too many components (${m.length}, max 50).`;const t=new Set;let a=0;for(const n of i){const v=n.name.trim();if(v!==""){if(!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(v))return`Component name "${v}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`;if(t.has(v))return`Duplicate component name "${v}".`;if(t.add(v),n.type&&!["html","markdown","block","shared","module"].includes(n.type))return`Component "${v}" type must be one of: html, markdown, block, shared, module.`;if(n.type==="module"&&(a+=1),n.type==="shared"){const c=(n.shared||n.name).trim();if(!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(c))return`Shared component "${v}" references an invalid panel component "${c}".`}}}return a>20?`Too many modules (${a}, max 20) — merge small helpers into fewer files.`:""}let Ce=0;function Ts(){return Ce+=1,{id:`k${Date.now()}-${Ce}`,name:"",label:"",description:"",default:"",user_viewable:!0,user_editable:!0,required:!1,rule:"",display:"text",options:"",append:!1,prepend:"",append_value:""}}function be(i){const m=je(i);return m.length===0?[]:m.map(t=>({id:`k${Ce++}-${Math.random().toString(36).slice(2,8)}`,name:t.name,label:t.label||"",description:t.description||"",default:t.default||"",user_viewable:t.user_viewable!==!1,user_editable:t.user_editable!==!1,required:!!t.required,rule:t.rule||"",display:["text","number","select","checkbox","toggle"].includes(t.display)?t.display:"text",options:t.options||"",append:!!t.append,prepend:t.prepend||"",append_value:t.append_value||""}))}function ye(i){const m=i.filter(t=>t.name.trim()!=="").map(t=>({name:t.name.trim(),label:t.label.trim(),description:t.description.trim(),default:t.default,user_viewable:!!t.user_viewable,user_editable:!!t.user_editable,required:!!t.required,rule:t.rule.trim(),display:t.display,options:t.options.trim(),append:!!t.append,prepend:t.prepend.trim(),append_value:t.append_value.trim()}));return m.length===0?"":JSON.stringify(m)}function zs(i){const m=i.filter(a=>a.name.trim()!=="");if(m.length>50)return`Too many configure variables (${m.length}, max 50).`;const t=new Set;for(const a of i){const n=a.name.trim();if(n!==""){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))return`Configure variable name "${n}" must start with a letter or underscore and contain only letters, numbers or underscores.`;if(t.has(n))return`Duplicate configure variable name "${n}".`;if(t.add(n),a.display&&!["text","number","select","checkbox","toggle"].includes(a.display))return`Configure variable "${n}" display must be one of: text, number, select, checkbox, toggle.`;if(a.label&&a.label.length>200)return`Configure variable "${n}" label too long (max 200).`;if(a.description&&a.description.length>500)return`Configure variable "${n}" description too long (max 500).`;if(a.default&&a.default.length>2e3)return`Configure variable "${n}" default too long (max 2000).`}}return""}const Is=`<script>
window.KSPageSDK = {
  instance: { id: 0, name: '(static preview)', kind: '-', status: '-', config: {} },
  actions: [],
  toast: function() {},
  executeAction: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  runAction: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  fetchPanel: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  shell: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  readFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  writeFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  listFiles: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  deleteFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  createDirectory: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  docker: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  kvm: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  lxd: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); }
};
<\/script>`,Rs=`
* { box-sizing: border-box; }
body { font-family: var(--ks-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); padding: 1rem; color: var(--ks-body, var(--ks-text-body, #e5e7eb)); background: transparent; line-height: 1.6; }
h1,h2,h3 { color: var(--ks-heading, var(--ks-text-heading, #fff)); margin: 1rem 0 0.5rem; }
h1,h2,h3 strong { color: inherit; }
a { color: var(--ks-link, #7dd3fc); }
a:hover { color: var(--ks-info, #38bdf8); }
code { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 0.1rem 0.3rem; border-radius: 3px; color: var(--ks-body, #e5e7eb); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); }
pre { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 1rem; border-radius: 6px; overflow-x: auto; border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); font-size: 0.8125rem; }
th { color: var(--ks-muted, #9ca3af); text-transform: uppercase; font-size: 0.6875rem; letter-spacing: 0.05em; }
img { max-width: 100%; border-radius: 6px; }
.ks-card { background: var(--ks-card-bg, rgba(255,255,255,0.04)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; }
.ks-btn { display: inline-block; background: var(--ks-btn-bg, #fff); color: var(--ks-btn-text, #000); border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; font-size: 0.875rem; }
.ks-muted { color: var(--ks-muted, #9ca3af); }
.ks-ok { color: var(--ks-ok, #34d399); }
.ks-bad { color: var(--ks-bad, #fca5a5); }
.ks-warn { color: var(--ks-warn, #fcd34d); }
`;function Bs(i,m,t,a,n){let v=m||"";if(v.indexOf("{{component:")!==-1){const b=/\{\{\s*component:([A-Za-z0-9_][A-Za-z0-9_-]*)\s*\}\}/g,l=new Map((t||[]).filter(x=>x&&x.type!=="module").map(x=>[x.name,x])),p=x=>{if(x.editable===!1){const r=(x.shared||x.name||"").trim();return Q(r)||""}if(x.type==="shared"&&typeof x.content=="string"&&x.content.trim()!==""&&x.editable!==!1)return x.content;switch(x.type){case"shared":return Q(x.shared||x.name);case"html":return x.content;case"markdown":return x.content.trim()?x.content.split(`
`).map(r=>{const M=r.trim();return/^###\s/.test(M)?`<h3>${M.replace(/^###\s/,"")}</h3>`:/^##\s/.test(M)?`<h2>${M.replace(/^##\s/,"")}</h2>`:/^#\s/.test(M)?`<h1>${M.replace(/^#\s/,"")}</h1>`:/^[-*]\s/.test(M)?`<li>${M.replace(/^[-*]\s/,"")}</li>`:M===""?"":`<p>${M.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/` + "`([^`]+)`" + `/g,"<code>$1</code>")}</p>`}).join(`
`):"";case"block":{try{const r=JSON.parse(x.content);if(Array.isArray(r))return r.map(M=>M.type==="heading"?`<h${M.level??2}>${M.value??""}</h${M.level??2}>`:M.type==="text"?`<p>${M.value??""}</p>`:M.type==="html"?M.value??"":`<div>${M.value??""}</div>`).join(`
`)}catch{return""}return""}default:return x.content}};let u="",E=v;for(let x=0;x<5&&E!==u;x++)u=E,E=E.replace(b,(r,M)=>{const j=l.get(M);if(j)return p(j);const N=Q(M);return N||r});v=E}if(a&&a.length>0||n&&Object.keys(n).length>0){const b={};if(a)for(const p of a)p.name&&(b[p.name]=p.default??"");if(n)for(const[p,u]of Object.entries(n))b[p]=String(u??"");const l=/\{\{\s*config:([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;v=v.replace(l,(p,u)=>Object.prototype.hasOwnProperty.call(b,u)?String(b[u]??""):p)}const c=(b="")=>`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${Is}
<style>${Rs}${b}${Kt()}</style></head><body>`;if(i==="html")return`${c()}${v}</body></html>`;if(i==="markdown"){let b=v.replace(/^### (.*$)/gim,"<h3>$1</h3>").replace(/^## (.*$)/gim,"<h2>$1</h2>").replace(/^# (.*$)/gim,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`(.+?)`/g,"<code>$1</code>").replace(/\n/g,"<br>");return`${c("body { line-height: 1.6; }")}${b}</body></html>`}if(i==="react")return`${c()}<div class="ks-card"><p style="font-size:13px">React preview needs a bound instance.</p><p class="ks-muted" style="font-size:12px">Pick a test instance above for the live preview, or click Build to validate the source.</p></div></body></html>`;let f="[]";try{f=JSON.stringify(JSON.parse(v||"[]"),null,2)}catch{f=v||"(invalid JSON)"}return`${c("body { font-family: monospace; }")}<pre>${f}</pre></body></html>`}function Hs(i){if(!i.trim())return{rows:[],ok:!0};try{const m=JSON.parse(i);if(Array.isArray(m))return{rows:m.filter(t=>t&&typeof t=="object"),ok:!0}}catch{}return{rows:[],ok:!1}}function Ds(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("path",{d:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7"}),e.jsx("path",{d:"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"})," "]})}function Os(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("polyline",{points:"4 17 10 11 4 5"}),e.jsx("line",{x1:"12",y1:"19",x2:"20",y2:"19"})," "]})}function Fs(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("path",{d:"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"}),e.jsx("circle",{cx:"12",cy:"13",r:"4"})," "]})}function $s(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("path",{d:"M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"}),e.jsx("path",{d:"M13 2v7h7"}),e.jsx("path",{d:"M9 15h6"}),e.jsx("path",{d:"M9 11h2"})]})}function Ks(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("circle",{cx:"12",cy:"12",r:"3"}),e.jsx("path",{d:"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"})," "]})}function qs(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("rect",{x:"3",y:"3",width:"7",height:"7"}),e.jsx("rect",{x:"14",y:"3",width:"7",height:"7"}),e.jsx("rect",{x:"14",y:"14",width:"7",height:"7"}),e.jsx("rect",{x:"3",y:"14",width:"7",height:"7"})]})}function Ws(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("path",{d:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"}),e.jsx("path",{d:"M12 8v8"}),e.jsx("path",{d:"M8 12h8"})]})}function Vs(){return e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",className:"w-4 h-4",children:[e.jsx("rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}),e.jsx("line",{x1:"3",y1:"9",x2:"21",y2:"9"}),e.jsx("line",{x1:"9",y1:"21",x2:"9",y2:"9"})," "]})}const Us=({tab:i,onChange:m,isBuiltin:t,tabs:a,tabsPillOuterClassName:n,tabsPillOuterStyle:v,tabsPillClassName:c})=>{var p;const f={templates:{label:"Templates",hint:"Starter gallery",icon:e.jsx(Vs,{})},editor:{label:"Main page",hint:"HTML · Markdown · Blocks",icon:e.jsx(Ds,{})},subpages:{label:"Sub-pages",hint:"Extra routes (/files/edit…)",icon:e.jsx($s,{})},actions:{label:"Actions",hint:"Saved executable actions",icon:e.jsx(Os,{})},components:{label:"Components",hint:"Reusable page components",icon:e.jsx(qs,{})},configure:{label:"Configure",hint:"Page variables (like env)",icon:e.jsx(Ws,{})},preview:{label:"Preview",hint:"Live render on an instance",icon:e.jsx(Fs,{})},settings:{label:"Settings",hint:"Meta, icon, import/export",icon:e.jsx(Ks,{})}},l=(a??es).map(u=>({id:u.id,...f[u.id]}));return e.jsxs(e.Fragment,{children:[e.jsx(Me,{className:"hidden lg:block lg:sticky lg:top-4 self-start",children:e.jsx("nav",{"aria-label":"Page studio sections",className:"flex lg:flex-col gap-1",children:l.map(u=>{const E=t&&u.id!=="preview";return e.jsxs("button",{type:"button",role:"tab","aria-selected":i===u.id,onClick:()=>!E&&m(u.id),disabled:E,className:`ks-tab w-full flex items-center gap-2 transition text-left ${i===u.id?"ks-tab-active":""} ${E?"opacity-50 cursor-not-allowed":""}`,children:[e.jsx("span",{className:"inline-flex items-center shrink-0",children:u.icon}),e.jsxs("span",{className:"flex flex-col min-w-0",children:[e.jsx("span",{children:u.label}),e.jsx("span",{className:`text-[10px] hidden lg:block ${i===u.id?"opacity-70":"text-gray-500"}`,style:i===u.id?{color:"var(--ks-tab-active-text, #000000)"}:void 0,children:u.hint})]})]},u.id)})})}),e.jsx(Ut,{ariaLabel:"Page studio sections",spacer:!1,activeLabel:(p=l.find(u=>u.id===i))==null?void 0:p.label,outerClassName:n,outerStyle:v,className:c??"",children:l.map(u=>{const E=t&&u.id!=="preview";return e.jsxs("button",{type:"button",role:"tab","aria-selected":i===u.id,onClick:()=>!E&&m(u.id),disabled:E,className:`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${i===u.id?"ks-tab-active":""} ${E?"opacity-50":""}`,children:[e.jsx("span",{className:"inline-flex items-center shrink-0",children:u.icon}),u.label]},u.id)})})]})},Gs=({search:i,onSearchChange:m,starters:t,query:a,onApply:n,sectionCls:v})=>{var M;const[c,f]=_.useState("all"),[b,l]=_.useState(null),p=At(j=>j.active()),u=_.useMemo(()=>{const j=new Set(["all"]);for(const N of ee)N.category&&j.add(N.category);return j.add("minecraft"),Array.from(j).sort((N,d)=>N==="all"?-1:d==="all"?1:N==="minecraft"?-1:d==="minecraft"?1:N.localeCompare(d))},[]),E=_.useMemo(()=>c==="all"?t:t.filter(j=>j.category===c),[t,c]),x=_.useMemo(()=>{if(!b)return null;const j=b.contentType||(b.blocks?"blocks":b.markdown?"markdown":"html");return j==="blocks"?{type:"blocks",blocks:b.blocks,actions:b.actions}:j==="markdown"?{type:"markdown",markdown:b.markdown,actions:b.actions}:{type:"html",html:b.html,actions:b.actions}},[b]),r=_.useMemo(()=>({id:0,name:"preview",kind:"docker",status:"running",template_id:0,template_name:"preview",node_id:0,node_name:"preview",owner_id:null,owner_name:null,config:{},external_id:"",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),[]);return e.jsxs("div",{className:v,children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section A · Templates"}),e.jsxs("div",{className:"flex items-center justify-between gap-3 flex-wrap",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Start from a functional template"}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:"Every template is a complete working page built only on the page SDK — the same building blocks you can edit by hand. Includes conversions of all built-in panel pages plus VM & container operator essentials and Minecraft tooling."})]}),e.jsx("input",{value:i,onChange:j=>m(j.target.value),placeholder:"Search templates…",className:`${y} max-w-[220px]`})]}),e.jsxs("div",{className:"flex items-center gap-1.5 flex-wrap",children:[u.map(j=>{const N=j===c,d=j==="all"?ee.length:ee.filter(L=>L.category===j).length;return e.jsxs("button",{type:"button",onClick:()=>f(j),className:`px-2.5 py-1 rounded-full text-xs border transition ${N?"bg-white text-black border-white":"bg-white/[0.04] text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"}`,title:`${d} template(s)`,children:[j==="all"?"All":j," ",e.jsxs("span",{className:"opacity-60",children:["· ",d]})]},j)}),e.jsx("span",{className:"text-[11px] text-gray-500 ml-1",children:"Filter by category — minecraft shows 4 starters (mc-properties / mc-players / mc-world / mc-plugins)."})]}),e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3",children:E.map(j=>{var N;return e.jsxs("article",{className:"ks-card rounded-xl p-4 flex flex-col gap-2 hover:border-white/25 transition-colors",children:[e.jsxs("header",{className:"flex items-start gap-2.5",children:[e.jsx("span",{className:"shrink-0 inline-flex w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300 items-center justify-center",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.6",className:"w-4 h-4",children:e.jsx("g",{dangerouslySetInnerHTML:{__html:j.iconSvg}})})}),e.jsxs("div",{className:"min-w-0",children:[e.jsx("h4",{className:"text-sm font-semibold text-white truncate",children:j.name}),e.jsxs("p",{className:"text-[11px] text-gray-500 truncate font-mono",children:["/",j.slug]})]})]}),e.jsx("p",{className:"text-xs text-gray-400 leading-relaxed flex-1",children:j.description}),e.jsxs("footer",{className:"flex items-center justify-between pt-1 gap-1",children:[e.jsxs("span",{className:"flex items-center gap-1.5 flex-wrap",children:[e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400",children:j.category}),!!((N=j.actions)!=null&&N.length)&&e.jsxs("span",{className:"text-[10px] px-1.5 py-0.5 rounded border border-sky-700/50 bg-sky-900/30 text-sky-300",title:`${j.actions.length} saved action(s) included`,children:["⚡ ",j.actions.length," action",j.actions.length===1?"":"s"]})]}),e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx("button",{type:"button",onClick:()=>l((b==null?void 0:b.id)===j.id?null:j),className:`px-2.5 py-1.5 text-xs rounded border ${(b==null?void 0:b.id)===j.id?"bg-sky-600 text-white border-sky-500":"bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"}`,title:"Preview via CustomPageView blocks + ThemePreview",children:"Preview"}),e.jsx("button",{type:"button",onClick:()=>n(j),className:"px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500",children:"Use template"})]})]})]},j.id)})}),E.length===0&&e.jsxs("p",{className:"text-sm text-gray-500",children:["No templates match “",a,"”",c!=="all"?` in ${c}`:"","."]}),b&&x&&e.jsxs("div",{className:"ks-card p-3 space-y-3",children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 flex-wrap",children:[e.jsxs("h4",{className:"text-sm font-semibold text-white",children:["Preview: ",b.name," ",e.jsxs("span",{className:"font-mono text-xs text-gray-500",children:["/",b.slug," · ",b.category]})]}),e.jsx("button",{type:"button",onClick:()=>l(null),className:"text-xs text-gray-400 hover:text-white",children:"Close preview"})]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3",children:[e.jsx("div",{className:"min-w-0 border border-white/10 rounded-lg overflow-hidden bg-black/20 p-2",children:e.jsx(Ze,{content:x,title:b.name,instanceContext:r,pageSlug:b.slug})}),e.jsxs("div",{className:"space-y-2",children:[e.jsx("p",{className:"text-xs text-gray-500",children:"ThemePreview for active theme — instance pages bake --ks-* tokens so this preview matches live InstancePanel rendering (CustomPageView.tsx:11)."}),e.jsx(Gt,{theme:p}),e.jsxs("div",{className:"text-xs text-gray-500 space-y-1",children:[e.jsxs("p",{className:"font-mono text-[11px]",children:["content_type: ",b.contentType||(b.blocks?"blocks":"html")]}),e.jsxs("p",{children:["Actions: ",((M=b.actions)==null?void 0:M.map(j=>`${j.name}(${j.type}${j.open_args?", open_args":""})`).join(", "))||"none"]}),e.jsx("p",{children:"Icon inner svg plain (sanitizeSvgIcon 10-pass) — validated name≤200 slug≤64 content≤1MiB icon≤16KiB actions≤64KiB."})]})]})]})]})]})},Js=({rows:i,onChange:m,jsonError:t,actionNames:a})=>{const n=(c,f)=>{m(i.map((b,l)=>l===c?{...b,...f}:b))},v=(c,f)=>{const b=c+f;if(b<0||b>=i.length)return;const l=i.slice(),[p]=l.splice(c,1);l.splice(b,0,p),m(l)};return e.jsxs("div",{className:"space-y-3",children:[t&&e.jsx("p",{className:"text-xs text-amber-300",children:"The stored blocks JSON is invalid — fix it in the JSON tab to restore visual editing."}),i.length===0&&!t&&e.jsx("p",{className:"text-xs text-gray-500",children:"No blocks yet. Add your first block below."}),i.map((c,f)=>{var b;return e.jsxs("div",{className:"ks-card ks-form-card ks-row-card rounded-lg space-y-2",children:[e.jsxs("div",{className:"flex items-center justify-between gap-2",children:[e.jsx("span",{className:"text-xs font-semibold text-gray-300 uppercase tracking-wide",children:((b=ve.find(l=>l.type===c.type))==null?void 0:b.label)??c.type}),e.jsxs("div",{className:"flex items-center gap-1 text-xs",children:[e.jsx("button",{type:"button",onClick:()=>v(f,-1),disabled:f===0,title:"Move up",className:"px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30",children:"↑"}),e.jsx("button",{type:"button",onClick:()=>v(f,1),disabled:f===i.length-1,title:"Move down",className:"px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30",children:"↓"}),e.jsx("button",{type:"button",onClick:()=>m(i.filter((l,p)=>p!==f)),title:"Remove block",className:"px-1.5 py-0.5 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20",children:"✕"})]})]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-[150px_1fr] gap-2 items-start",children:[e.jsx("select",{value:c.type,onChange:l=>n(f,{type:l.target.value}),className:y,children:ve.map(l=>e.jsx("option",{value:l.type,children:l.label},l.type))}),(c.type==="heading"||c.type==="text"||c.type==="code"||c.type==="html")&&e.jsx("textarea",{value:c.value,onChange:l=>n(f,{value:l.target.value}),rows:c.type==="text"?2:c.type==="heading"?1:4,className:`${y} ${c.type==="html"||c.type==="code"?"font-mono text-xs":""}`,placeholder:c.type==="html"?"<p>raw html…</p>":c.type==="code"?"code…":"content…"}),(c.type==="table"||c.type==="list")&&e.jsx("textarea",{value:c.value,onChange:l=>n(f,{value:l.target.value}),rows:4,className:`${y} font-mono text-xs`,placeholder:c.type==="table"?'[["col A","col B"],["a","b"]]':'["item one","item two"]'}),c.type==="image"&&e.jsx("input",{value:c.value,onChange:l=>n(f,{value:l.target.value}),className:`${y} font-mono`,placeholder:"https://… image URL"}),c.type==="button"&&e.jsxs("div",{className:"space-y-2",children:[e.jsx("input",{value:c.value,onChange:l=>n(f,{value:l.target.value}),className:y,placeholder:"Button label"}),e.jsx("input",{value:c.href??"",onChange:l=>n(f,{href:l.target.value}),className:`${y} font-mono`,placeholder:"https://… link URL"})]}),c.type==="stat"&&e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-2",children:[e.jsx("input",{value:c.label??"",onChange:l=>n(f,{label:l.target.value}),className:y,placeholder:"Label"}),e.jsx("input",{value:c.value,onChange:l=>n(f,{value:l.target.value}),className:y,placeholder:"Value"}),e.jsx("input",{value:c.unit??"",onChange:l=>n(f,{unit:l.target.value}),className:y,placeholder:"Unit"}),e.jsxs("select",{value:c.tone??"default",onChange:l=>n(f,{tone:l.target.value}),className:y,children:[e.jsx("option",{value:"default",children:"Tone: default"}),e.jsx("option",{value:"good",children:"Tone: good"}),e.jsx("option",{value:"warn",children:"Tone: warn"}),e.jsx("option",{value:"bad",children:"Tone: bad"})]})]}),c.type==="action"&&e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-2",children:[e.jsxs("select",{value:c.action??"",onChange:l=>n(f,{action:l.target.value}),className:y,children:[e.jsx("option",{value:"",children:"— pick a saved action —"}),a.map(l=>e.jsx("option",{value:l,children:l},l))]}),e.jsx("input",{value:c.label??"",onChange:l=>n(f,{label:l.target.value}),className:y,placeholder:"Button label (optional)"}),e.jsx("input",{value:c.confirmText??"",onChange:l=>n(f,{confirmText:l.target.value}),className:y,placeholder:"Confirm prompt (optional)"})]}),(c.type==="spacer"||c.type==="divider")&&e.jsx("div",{className:"text-xs text-gray-500 self-center",children:"No settings for this block."})]}),(c.type==="heading"||c.type==="text"||c.type==="image"||c.type==="button"||c.type==="stat")&&e.jsxs("div",{className:"flex items-center gap-2 text-xs",children:[e.jsx("span",{className:"text-gray-500",children:"Align:"}),["left","center","right"].map(l=>e.jsx("button",{type:"button",onClick:()=>n(f,{align:l}),className:`px-2 py-0.5 rounded border ${c.align===l||!c.align&&l==="left"?"border-emerald-500 text-emerald-300":"border-white/10 text-gray-400 hover:text-white"}`,children:l},l))]})]},f)}),e.jsx("div",{className:"flex flex-wrap gap-1.5 pt-1",children:ve.map(c=>e.jsxs("button",{type:"button",onClick:()=>m([...i,{type:c.type,value:"",align:"left"}]),className:"px-2 py-1 text-xs rounded border border-white/10 text-gray-300 hover:bg-white/10",children:["+ ",c.label]},c.type))})]})},Ys=({contentType:i,onContentTypeChange:m,currentContent:t,onContentChange:a,contentBlocks:n,onBlocksChange:v,blocksMode:c,onBlocksModeChange:f,actionNames:b,onCopy:l,onExport:p,onImportClick:u,sectionCls:E})=>{const x=Hs(n??"");return e.jsxs("div",{className:E,children:[e.jsxs("div",{className:"flex items-center justify-between mb-2 flex-wrap gap-2",children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400",children:"Section B · Content"}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[l&&e.jsx("button",{type:"button",onClick:l,className:"text-xs text-gray-400 hover:text-white underline",title:"Copy content to clipboard",children:"Copy"}),e.jsx("button",{type:"button",onClick:p,className:"text-xs text-gray-400 hover:text-white underline",title:"Export page JSON",children:"Export"}),e.jsx("button",{type:"button",onClick:u,className:"text-xs text-gray-400 hover:text-white underline",title:"Import page JSON",children:"Import"}),e.jsx("label",{className:"text-xs text-gray-400",children:"Content Type"}),e.jsxs("select",{value:i,onChange:r=>{m(r.target.value),f("visual")},className:"bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white",children:[e.jsx("option",{value:"html",children:"HTML"}),e.jsx("option",{value:"markdown",children:"Markdown"}),e.jsx("option",{value:"blocks",children:"Visual Blocks"}),e.jsx("option",{value:"react",children:"React (stateful)"})]})]})]}),(i==="html"||i==="markdown")&&e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs text-gray-400 mb-2",children:["Page Content (",i,") — runs in a sandboxed frame with KSPageSDK available for live data."]}),e.jsx("textarea",{value:t,onChange:r=>a(r.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"420px",width:"100%"},spellCheck:!1,placeholder:i==="html"?`<div class="ks-card">
  <button onclick="KSPageSDK.shell('uptime')">Run uptime</button>
</div>`:`# Welcome

Your custom page content here`})]}),i==="blocks"&&e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("label",{className:"text-xs text-gray-400",children:"Visual Blocks"}),e.jsx("div",{className:"flex gap-1 text-xs",children:["visual","json"].map(r=>e.jsx("button",{type:"button",onClick:()=>f(r),className:`px-2 py-1 rounded border ${c===r?"border-emerald-500 text-emerald-300":"border-white/10 text-gray-400 hover:text-white"}`,children:r.toUpperCase()},r))})]}),c==="visual"?e.jsx(Js,{rows:x.rows,jsonError:!x.ok,actionNames:b,onChange:r=>{const M=r.length?JSON.stringify(r,null,2):"";v(M)}}):e.jsx("textarea",{value:n??"",onChange:r=>a(r.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"360px",width:"100%"},spellCheck:!1,placeholder:`[
  { "type": "stat", "label": "CPU", "value": "12", "unit": "%" }
]`})]})]})},Xs=Ee.lazy(()=>Jt(()=>import("./MonacoReactEditor-CEZByojY.js"),__vite__mapDeps([0,1,2,3,4])));class Zs extends Ee.Component{constructor(){super(...arguments);Oe(this,"state",{failed:!1})}static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?this.props.fallback:this.props.children}}const Je=`import { useState } from 'react';

type Props = { title?: string };

function Stat(props: { label: string; value: string }) {
  return (
    <div className="ks-card" style={{ padding: 12 }}>
      <div className="ks-muted" style={{ fontSize: 11 }}>{props.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{props.value}</div>
    </div>
  );
}

function Page() {
  const [count, setCount] = useState<number>(0);
  const run = async () => {
    const r = await sdk.runAction('ping');
    if (r && (r as { ok?: boolean }).ok === false) sdk.toast((r as { error?: string }).error || 'failed', 'error');
    else setCount((c: number) => c + 1);
  };
  return (
    <div className="ks-page">
      <div className="ks-card">
        <h2>{sdk.instance.name}</h2>
        <div className="ks-row">
          <span className="ks-badge">{sdk.instance.status}</span>
          <span className="ks-badge">runs: {count}</span>
        </div>
        <button className="ks-btn ks-btn-blue" onClick={run}>Ping</button>
      </div>
      <Stat label="Instance" value={sdk.instance.kind} />
    </div>
  );
}
return Page;`,Qs=({source:i,onSourceChange:m,css:t,onCssChange:a,buildStatus:n,buildLog:v,onBuild:c,building:f,canBuild:b,onContentTypeChange:l,sectionCls:p,modules:u,onModulesChange:E})=>{const x=n==="ok"?"text-emerald-300":n==="error"?"text-red-300":"text-gray-400",[r,M]=_.useState("index"),[j,N]=_.useState(""),[d,L]=_.useState(""),h=u.find(C=>C.name===r)??null,w=r!=="index"&&!h?"index":r,P=w==="index"?null:h,T=P?P.content:i,A=C=>{P?E(u.map(R=>R.name===P.name?{...R,content:C}:R)):m(C)},[H,F]=_.useState(T);_.useEffect(()=>{const C=setTimeout(()=>F(T),300);return()=>clearTimeout(C)},[T]);const S=_.useMemo(()=>qt(H),[H]),W=C=>/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(C)?u.some(R=>R.name===C)?`File "${C}" already exists.`:u.length>=20?"Too many files (max 20) — merge small helpers into fewer files.":"":`File name "${C}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`,$=()=>{const C=j.trim(),R=W(C);if(R){L(R);return}L(""),N(""),E([...u,{name:C,content:""}]),M(C)},ie=(C,R)=>{const D=R.trim();if(D===C)return;if(D===""){L("File name cannot be empty.");return}const te=u.filter(U=>U.name!==C);if(!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(D)){L(`File name "${D}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`);return}if(te.some(U=>U.name===D)){L(`File "${D}" already exists.`);return}L(""),E(u.map(U=>U.name===C?{...U,name:D}:U)),r===C&&M(D)},J=C=>{L(""),E(u.filter(R=>R.name!==C)),w===C&&M("index")};return e.jsxs("div",{className:p,children:[e.jsxs("div",{className:"flex items-center justify-between mb-2 flex-wrap gap-2",children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400",children:"Section B · React"}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("label",{className:"text-xs text-gray-400",children:"Content Type"}),e.jsxs("select",{value:"react",onChange:C=>l(C.target.value),className:"bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white",children:[e.jsx("option",{value:"html",children:"HTML"}),e.jsx("option",{value:"markdown",children:"Markdown"}),e.jsx("option",{value:"blocks",children:"Visual Blocks"}),e.jsx("option",{value:"react",children:"React (stateful)"})]}),e.jsx("span",{className:`text-xs ${x}`,title:v||"Not built yet",children:n==="ok"?"Built ✓":n==="error"?"Build failed":n==="building"?"Building…":"Not built"}),e.jsx("button",{type:"button",onClick:c,disabled:f||!b,title:b?"Validate source into the executable bundle":"Save the page first to build it",className:"px-3 py-1.5 text-sm rounded border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50",children:f?"Building…":"Build"})]})]}),e.jsxs("p",{className:"text-xs text-gray-500",children:["Near-real React (hooks via ",e.jsx("code",{children:"React.useState/useEffect"}),", state survives re-renders). Write"," ",e.jsx("code",{children:"JSX"})," + light ",e.jsx("code",{children:"TS"})," (",e.jsx("code",{children:"type/interface/enum/namespace"}),", ",e.jsx("code",{children:": Type"}),", ",e.jsx("code",{children:"as Type"}),","," ",e.jsx("code",{children:"<T>"}),") or plain ",e.jsx("code",{children:"React.createElement"})," — all transpile in the renderer. Define"," ",e.jsx("code",{children:"function Page()"})," (closes over ",e.jsx("code",{children:"sdk"})," + ",e.jsx("code",{children:"React"}),") and end with"," ",e.jsx("code",{children:"return Page;"}),". ",e.jsx("code",{children:"import { useState } from 'react'"})," is allowed; other packages are not — use"," ",e.jsx("code",{children:"sdk.runAction/fetchPanel/storage/downloadText/copyText/formatBytes/timeAgo"})," — never ",e.jsx("code",{children:"fetch()"}),","," ",e.jsx("code",{children:"eval"})," or browser storage directly. Tailwind + ",e.jsx("code",{children:"ks-*"})," theme classes work (host origin). Split code with ",e.jsx("code",{children:"Files"})," below: ",e.jsx("code",{children:"import { helper } from './util'"})," inlines ",e.jsx("code",{children:"util"})," at transpile time (relative paths only, ",e.jsx("code",{children:".."})," past the root rejected, cycles fail the build)."]}),e.jsxs("div",{className:"mt-3 rounded-lg border border-white/10 bg-black/20 p-3",children:[e.jsxs("div",{className:"flex items-center justify-between gap-2 flex-wrap",children:[e.jsxs("h5",{className:"text-xs font-semibold uppercase tracking-wide text-gray-400",children:["Files (",u.length,"/20)"]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("input",{value:j,onChange:C=>N(C.target.value),onKeyDown:C=>{C.key==="Enter"&&(C.preventDefault(),$())},className:"bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-36",placeholder:"util","aria-label":"New file name",spellCheck:!1}),e.jsx("button",{type:"button",onClick:$,className:"px-2 py-1 text-xs rounded border border-white/10 text-gray-200 hover:bg-white/10",title:"Add a virtual file (stored as a components entry with type 'module')",children:"Add file"})]})]}),d&&e.jsx("p",{className:"text-xs text-red-300 mt-2",children:d}),e.jsxs("div",{className:"flex items-center gap-1.5 mt-2 flex-wrap",children:[e.jsx("button",{type:"button",onClick:()=>M("index"),title:"Entry file (the page source below when selected)",className:`px-2 py-1 text-xs rounded border font-mono ${w==="index"?"bg-white text-black border-white":"border-white/10 text-gray-300 hover:bg-white/10"}`,children:"index"}),u.map(C=>e.jsxs("span",{className:`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs rounded border font-mono ${w===C.name?"bg-white text-black border-white":"border-white/10 text-gray-300"}`,children:[e.jsx("button",{type:"button",onClick:()=>M(C.name),title:`Edit ${C.name}`,children:C.name}),e.jsx("button",{type:"button",onClick:()=>J(C.name),"aria-label":`Delete ${C.name}`,title:`Delete ${C.name}`,className:"px-1 rounded hover:bg-red-500/30",children:"×"})]},C.name))]}),P&&e.jsxs("label",{className:"block text-xs text-gray-400 mt-2",children:["File name",e.jsx("input",{value:P.name,onChange:C=>ie(P.name,C.target.value),className:"mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-48 block",spellCheck:!1})]}),e.jsxs("p",{className:"text-[11px] text-gray-500 mt-2",children:["Files live at the page root — ",e.jsxs("code",{children:["import … from './",P?P.name:"util","'"]})," (extension optional). Modules share one scope after inlining: keep top-level names unique. Unused files never ship. Budget: same 512KiB components total, ≤20 files."]})]}),e.jsxs("label",{className:"block text-xs text-gray-400 mt-3 mb-2",children:[P?e.jsxs("span",{children:["File ",e.jsx("code",{className:"font-mono",children:P.name})," (JS)"]}):"Page source (JS · index)",e.jsx("span",{className:"float-right",children:e.jsx("button",{type:"button",onClick:()=>{M("index"),m(Je)},className:"text-xs text-gray-400 hover:text-white underline",title:"Replace the entry file with a minimal working page",children:"Starter"})})]}),e.jsx(Ee.Suspense,{fallback:e.jsx("div",{className:"rounded-md border border-white/10 bg-black/30 text-xs text-gray-400 flex items-center justify-center",style:{height:"420px",width:"100%"},children:"Loading editor…"}),children:e.jsx(Zs,{fallback:e.jsx("textarea",{value:T,onChange:C=>A(C.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"420px",width:"100%"},spellCheck:!1,placeholder:P?`// ${P.name} — export helpers/components, e.g.
export function helper() { return 42; }`:Je}),children:e.jsx(Xs,{value:T,onChange:A,fileKey:w,ariaLabel:P?`File ${P.name} (TypeScript)`:"Page source (TypeScript, index)"},w)})}),S.length>0&&e.jsxs("div",{className:"mt-2 rounded-lg border border-amber-700/50 bg-amber-900/30 p-3",role:"status","aria-label":"React warnings",children:[e.jsxs("p",{className:"text-xs font-semibold uppercase tracking-wide text-amber-200",children:["Warnings (",S.length,") — non-blocking, Build stays the gate"]}),e.jsx("ul",{className:"mt-1 space-y-0.5",children:S.map((C,R)=>e.jsxs("li",{className:"text-xs text-amber-300 font-mono",children:["Line ",C.line,": ",C.message]},R))})]}),e.jsx("label",{className:"block text-xs text-gray-400 mt-3 mb-2",children:"Page CSS (optional, scoped under .ks-react-page)"}),e.jsx("textarea",{value:t,onChange:C=>a(C.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"120px",width:"100%"},spellCheck:!1,placeholder:".ks-react-page .ks-card { margin-bottom: 12px; }"}),v&&e.jsx("p",{className:`text-xs mt-2 font-mono whitespace-pre-wrap ${x}`,children:v})]})},ea=({subs:i,editingSubId:m,onEditingChange:t,onAdd:a,onUpdate:n,onRemove:v,onMove:c,pageSlug:f,sectionCls:b})=>e.jsxs("div",{className:b,children:[e.jsxs("div",{className:"flex items-center justify-between mb-1",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section C · Sub-pages"}),e.jsxs("p",{className:"text-xs text-gray-500",children:["Extra routes shipped with this page — each becomes"," ",e.jsxs("code",{className:"font-mono",children:["/",(f==null?void 0:f.trim())||"slug","/<path>"]})," ","when the page is linked to a template or imported (e.g. a Files manager with an editor at /files/edit)."]})]}),e.jsx("button",{type:"button",onClick:a,className:"ks-btn-header ks-icon-btn","aria-label":"Add sub-page",title:"Add sub-page",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-5 h-5",children:[e.jsx("line",{x1:"12",y1:"5",x2:"12",y2:"19"}),e.jsx("line",{x1:"5",y1:"12",x2:"19",y2:"12"})]})})]}),i.length===0&&e.jsx("p",{className:"text-xs text-gray-500",children:"No sub-pages yet. Add one to give this page extra routes."}),e.jsx("div",{className:"space-y-4",children:i.map((l,p)=>{const u=m===l.id,E=l.content_type==="html"?l.content_html:l.content_type==="markdown"?l.content_markdown:l.content_type==="react"?l.source_tsx:l.content_blocks,x=r=>{l.content_type==="html"?n(l.id,{content_html:r}):l.content_type==="markdown"?n(l.id,{content_markdown:r}):l.content_type==="react"?n(l.id,{source_tsx:r,bundle_js:""}):n(l.id,{content_blocks:r})};return e.jsxs("div",{className:"ks-card ks-form-card ks-page-card rounded-md overflow-hidden",children:[e.jsxs("div",{className:"p-3 flex items-center gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex flex-col gap-0.5 shrink-0",children:[e.jsx("button",{type:"button","aria-label":"Move up",onClick:()=>c==null?void 0:c(p,-1),disabled:p===0,className:"ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed",title:"Move up",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-3.5 h-3.5",children:e.jsx("path",{d:"M18 15l-6-6-6 6"})})}),e.jsx("button",{type:"button","aria-label":"Move down",onClick:()=>c==null?void 0:c(p,1),disabled:p===i.length-1,className:"ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed",title:"Move down",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-3.5 h-3.5",children:e.jsx("path",{d:"M6 9l6 6 6-6"})})})]}),e.jsx("div",{className:"min-w-0 flex-1",children:e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("span",{className:"text-sm font-semibold text-white truncate",children:l.name.trim()||l.path.trim()||`Sub-page ${p+1}`}),e.jsxs("code",{className:"text-[11px] text-gray-500 font-mono",children:["/",(f==null?void 0:f.trim())||"slug","/",l.path.trim()||"…"]})]})}),e.jsxs("div",{className:"flex items-center gap-1 shrink-0",children:[e.jsx("button",{type:"button",onClick:()=>v(l.id),className:"ks-btn-header ks-icon-btn","aria-label":"Remove sub-page",title:"Remove sub-page",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:[e.jsx("polyline",{points:"3 6 5 6 21 6"}),e.jsx("path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"})]})}),e.jsx("button",{type:"button",onClick:()=>t(u?null:l.id),className:"ks-btn-header ks-icon-btn","aria-label":"Toggle sub-page editor",title:"Toggle editor",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:e.jsx("polyline",{points:"6 9 12 15 18 9"})})})]})]}),u&&e.jsxs("div",{className:"px-3 pb-3 pt-1 ks-page-card-body space-y-3",children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsxs("span",{className:"text-xs text-gray-400",children:["Path * (becomes /","{slug}","/path)"]}),e.jsx("input",{value:l.path,onChange:r=>n(l.id,{path:r.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"")}),className:`${y} font-mono`,placeholder:"edit"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Display name *"}),e.jsx("input",{value:l.name,onChange:r=>n(l.id,{name:r.target.value}),className:y,placeholder:"Editor"})]})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("label",{className:"text-xs text-gray-400",children:"Content type"}),e.jsxs("select",{value:l.content_type,onChange:r=>n(l.id,{content_type:r.target.value}),className:"bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white",children:[e.jsx("option",{value:"html",children:"HTML"}),e.jsx("option",{value:"markdown",children:"Markdown"}),e.jsx("option",{value:"blocks",children:"Visual Blocks"}),e.jsx("option",{value:"react",children:"React (stateful)"})]})]}),l.content_type!=="blocks"?e.jsx("textarea",{value:E,onChange:r=>x(r.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"320px",width:"100%"},spellCheck:!1,placeholder:l.content_type==="html"?`<div class="ks-card">
  <h3>Editor</h3>
</div>`:l.content_type==="react"?`function Page() {
  return React.createElement("div", null, "Editor");
}
return Page;`:"# Editor"}):e.jsx("textarea",{value:l.content_blocks,onChange:r=>x(r.target.value),className:`${y} font-mono text-sm`,style:{minHeight:"280px",width:"100%"},spellCheck:!1,placeholder:`[
  { "type": "heading", "value": "Editor", "level": 2 }
]`}),l.content_type==="react"&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Sub-page CSS (optional)"}),e.jsx("textarea",{value:l.bundle_css,onChange:r=>n(l.id,{bundle_css:r.target.value}),className:`${y} font-mono text-sm`,style:{minHeight:"90px",width:"100%"},spellCheck:!1,placeholder:".ks-react-page .ks-card { margin-bottom: 12px; }"})]}),l.content_type==="react"&&e.jsx("p",{className:"text-[11px] text-gray-500",children:"Built with the family — click Build on the Main page tab to validate this source."})]})]},l.id)})})]}),ta=({actions:i,onAdd:m,onRemove:t,onUpdate:a,onTest:n,pageId:v,previewInstanceId:c,onPreviewInstanceChange:f,instances:b,executingAction:l,actionResult:p,sectionCls:u})=>{const[E,x]=_.useState(null);return e.jsxs("div",{className:u,children:[e.jsxs("div",{className:"flex items-center justify-between mb-1",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section D · Actions (on-demand)"}),e.jsxs("p",{className:"text-xs text-gray-500",children:["Actions are persisted with this page. Pages can run them via ",e.jsx("code",{children:"KSPageSDK.runAction(name)"}),"; Action-button blocks reference them by name."]})]}),e.jsx("button",{type:"button",onClick:m,className:"ks-btn-header ks-icon-btn","aria-label":"Add action",title:"Add action",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-5 h-5",children:[e.jsx("line",{x1:"12",y1:"5",x2:"12",y2:"19"}),e.jsx("line",{x1:"5",y1:"12",x2:"19",y2:"12"})]})})]}),!v&&e.jsx("p",{className:"text-xs text-amber-300",children:"Save the page to enable test-execution; editing and saving work right away."}),f&&b&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Test instance (same target as the Preview tab)"}),e.jsxs("select",{value:c??"",onChange:r=>f(r.target.value?Number(r.target.value):null),className:`${y} min-w-[220px] mt-1`,children:[e.jsx("option",{value:"",children:"— none (pick one to test) —"}),b.map(r=>e.jsxs("option",{value:r.id,children:["#",r.id," ",r.display_name||r.name," (",r.kind,", ",r.status,")"]},r.id))]})]}),e.jsxs("div",{className:"space-y-4",children:[i.length===0&&e.jsxs("p",{className:"text-sm text-gray-500 border border-dashed border-white/10 rounded-lg p-4 text-center",children:["No actions yet — click ",e.jsx("span",{className:"text-gray-300",children:"+"})," to add one."]}),i.map((r,M)=>{const j=E===r.id;return e.jsxs(Me,{variant:"form",className:"p-4 space-y-3",children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[e.jsxs("span",{className:"text-sm font-semibold text-white truncate",children:["Action #",M+1]}),r.name.trim()&&e.jsx("span",{className:"font-mono text-[11px] text-gray-500 truncate",children:r.name}),e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400",children:r.type})]}),e.jsxs("div",{className:"flex items-center gap-1 shrink-0",children:[e.jsx("button",{type:"button",onClick:()=>n(r),disabled:!v||!c||l===r.id,title:v?c?"Run against selected instance":"Pick a test instance on Preview":"Save the page first",className:"ks-btn-header ks-icon-btn disabled:opacity-50","aria-label":"Test action",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:e.jsx("polygon",{points:"5 3 19 12 5 21 5 3"})})}),e.jsx("button",{type:"button",onClick:()=>x(j?null:r.id),className:"ks-btn-header ks-icon-btn","aria-label":"Toggle edit",title:"Toggle edit",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:e.jsx("polyline",{points:"6 9 12 15 18 9"})})}),e.jsx("button",{type:"button",onClick:()=>t(r.id),className:"ks-btn-header ks-icon-btn","aria-label":"Remove action",title:"Remove action",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:[e.jsx("polyline",{points:"3 6 5 6 21 6"}),e.jsx("path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"})]})})]})]}),j&&e.jsxs("div",{className:"space-y-4 pt-2 border-t border-white/5",children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Action name *"}),e.jsx("input",{value:r.name,onChange:N=>a(r.id,{name:N.target.value}),className:y,placeholder:"restart_service"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Type"}),e.jsxs("select",{value:r.type,onChange:N=>a(r.id,{type:N.target.value}),className:y,children:[e.jsx("option",{value:"shell",children:"Shell command"}),e.jsx("option",{value:"read_file",children:"Read file"}),e.jsx("option",{value:"write_file",children:"Write file"}),e.jsx("option",{value:"list_files",children:"List directory"}),e.jsx("option",{value:"docker",children:"Docker command"}),e.jsx("option",{value:"kvm",children:"KVM/virsh command"}),e.jsx("option",{value:"lxd",children:"LXD/LXC command"}),e.jsx("option",{value:"stat",children:"Stat path"}),e.jsx("option",{value:"chmod",children:"Chmod path"}),e.jsx("option",{value:"archive",children:"Create archive"}),e.jsx("option",{value:"extract",children:"Extract archive"})]})]})]}),(r.type==="shell"||r.type==="docker"||r.type==="kvm"||r.type==="lxd")&&e.jsxs(e.Fragment,{children:[e.jsxs("label",{className:"block",children:[e.jsxs("span",{className:"text-xs text-gray-400",children:[r.type==="shell"?"Command":"Sub-command",r.open_args?" — {{args}} inserts the runtime arguments":""]}),e.jsx("input",{value:r.command,onChange:N=>a(r.id,{command:N.target.value}),className:`${y} font-mono`,placeholder:r.type==="shell"?r.open_args?"docker stop {{args}}":"systemctl restart myservice":"ps / inspect / logs"})]}),e.jsxs("label",{className:"flex items-center gap-2 mt-1 select-none",children:[e.jsx("input",{type:"checkbox",checked:r.open_args,onChange:N=>a(r.id,{open_args:N.target.checked}),className:"accent-emerald-500"}),e.jsxs("span",{className:"text-xs text-gray-400",children:["Allow runtime arguments — pages pass up to 4 values via ",e.jsxs("code",{className:"font-mono",children:["runAction(name, ","{ args }",")"]}),"; every value is validated server-side."]})]})]}),(r.type==="read_file"||r.type==="write_file"||r.type==="list_files"||r.type==="stat"||r.type==="chmod"||r.type==="archive"||r.type==="extract")&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:r.type==="archive"?"Source directory (or file when Entries is empty)":r.type==="extract"?"Archive path (.zip or .tar.gz)":"Path"}),e.jsx("input",{value:r.path,onChange:N=>a(r.id,{path:N.target.value}),className:`${y} font-mono`,placeholder:"/etc/myapp/config.yaml"})]}),r.type==="chmod"&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Mode (octal 000-777)"}),e.jsx("input",{value:r.mode,onChange:N=>a(r.id,{mode:N.target.value}),className:`${y} font-mono`,placeholder:"0644"})]}),r.type==="archive"&&e.jsxs(e.Fragment,{children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Entries (space-separated, relative to the source directory)"}),e.jsx("input",{value:r.names,onChange:N=>a(r.id,{names:N.target.value}),className:`${y} font-mono`,placeholder:"level.dat playerdata"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Destination archive (.zip or .tar.gz)"}),e.jsx("input",{value:r.dest,onChange:N=>a(r.id,{dest:N.target.value}),className:`${y} font-mono`,placeholder:"/tmp/world.tar.gz"})]})]}),r.type==="extract"&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Destination directory (empty = archive's own directory)"}),e.jsx("input",{value:r.dest,onChange:N=>a(r.id,{dest:N.target.value}),className:`${y} font-mono`,placeholder:"/data/restored"})]}),r.type==="write_file"&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"File content"}),e.jsx("textarea",{value:r.content,onChange:N=>a(r.id,{content:N.target.value}),rows:5,className:`${y} font-mono w-full`,placeholder:"Content to write…"})]}),(r.type==="shell"||r.type==="docker"||r.type==="kvm"||r.type==="lxd")&&e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Arguments (space-separated)"}),e.jsx("input",{value:r.args,onChange:N=>a(r.id,{args:N.target.value}),className:`${y} font-mono`,placeholder:"--all --filter name=web"})]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Environment variables (JSON)"}),e.jsx("textarea",{value:r.env,onChange:N=>a(r.id,{env:N.target.value}),rows:2,className:`${y} font-mono text-xs`,placeholder:'{"KEY": "value"}'})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Description"}),e.jsx("input",{value:r.description,onChange:N=>a(r.id,{description:N.target.value}),className:y,placeholder:"What this action does…"})]})]}),e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-4",children:e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Timeout (seconds)"}),e.jsx("input",{type:"number",min:"1",max:"300",value:r.timeout,onChange:N=>a(r.id,{timeout:N.target.value}),className:y})]})}),p&&p.id===r.id&&l===null&&e.jsx("div",{className:"flex items-center gap-2 pt-2 border-t border-white/10",children:e.jsxs("span",{className:`text-xs font-mono ${p.exit_code===0?"text-emerald-300":"text-red-300"}`,children:["Exit: ",p.exit_code]})}),(p==null?void 0:p.id)===r.id&&e.jsxs("details",{children:[e.jsx("summary",{className:"text-xs text-gray-400 cursor-pointer select-none",children:"Show output"}),e.jsxs("pre",{className:"mt-2 p-3 bg-black/50 border border-white/10 rounded text-xs text-gray-300 overflow-auto max-h-64 font-mono",children:[p.stdout||"(no stdout)",p.stderr&&`
--- STDERR ---
${p.stderr}`]})]})]})]},r.id)})]})]})},Ye=({instances:i,previewInstanceId:m,onPreviewInstanceChange:t,previewTarget:a,onPreviewTargetChange:n,subs:v,pageName:c,pageSlug:f,isBuiltin:b,isEdit:l,previewInstance:p,previewContext:u,previewContent:E,editingSub:x,contentType:r,currentContent:M,fullPreview:j,onToggleFullPreview:N,sectionCls:d})=>{const L=(()=>{const w=E.type||r,P=E.type==="html"?E.html??"":E.type==="markdown"?E.markdown??"":E.type==="blocks"?E.blocks??"":M,T=w||r,A=P!=null&&P!==""?P:M;return Bs(T,A,E.components,E.configure,E.config)})(),h=e.jsxs("div",{className:j?"flex h-full flex-col gap-3 overflow-auto p-4":"space-y-4",children:[e.jsxs("div",{className:"flex items-end justify-between gap-3 flex-wrap",children:[j?e.jsx("h3",{className:"text-sm font-semibold text-white mr-auto",children:"Live preview"}):e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Live preview"}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:"Bind a real instance to exercise the page SDK (shell, files, panel APIs) exactly as operators will see it."})]}),!b&&e.jsxs(e.Fragment,{children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Test instance"}),e.jsxs("select",{value:m??"",onChange:w=>t(w.target.value?Number(w.target.value):null),className:`${y} min-w-[220px]`,children:[e.jsx("option",{value:"",children:"— none (static render) —"}),i.map(w=>e.jsxs("option",{value:w.id,children:["#",w.id," ",w.display_name||w.name," (",w.kind,", ",w.status,")"]},w.id))]})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Page"}),e.jsxs("select",{value:a,onChange:w=>n(w.target.value),className:`${y} min-w-[220px]`,disabled:v.length===0,children:[e.jsxs("option",{value:"main",children:["Main page",v.length===0?"":` (/${(f==null?void 0:f.trim())||"slug"})`]}),v.map(w=>e.jsxs("option",{value:w.id,children:[w.name.trim()||w.path.trim()," (/",(f==null?void 0:f.trim())||"slug","/",w.path.trim()||"…",")"]},w.id))]})]})]}),e.jsx("button",{type:"button",onClick:N,title:j?"Exit full screen (Esc)":"Full screen — hides everything except the panel header and sidebar","aria-pressed":j,className:`px-3 py-1.5 text-sm rounded border transition ${j?"bg-white text-black border-white":"border-white/10 text-gray-300 hover:bg-white/10"}`,children:j?"Exit full screen":"Full screen"})]}),p&&u?e.jsxs(e.Fragment,{children:[!l&&e.jsx("p",{className:"text-xs text-amber-300",children:"Tip: unsaved pages preview with the SDK, but actions that hit the panel require the page to be saved & linked."}),e.jsx(Ze,{content:E,title:x?x.name.trim()||x.path||"Preview":c||"Preview",instanceContext:u,pageSlug:f?x?`${f}/${x.path}`:f:void 0})]}):e.jsx("div",{className:`border border-white/10 rounded-lg overflow-hidden bg-black/30 ${j?"flex-1 min-h-0 flex flex-col":""}`,style:j?void 0:{minHeight:"500px"},children:e.jsx("iframe",{srcDoc:L,className:j?"w-full flex-1 min-h-0 border-0":"w-full h-[600px] border-0",title:"Static Page Preview",sandbox:"allow-scripts"})})]});return j?h:e.jsxs("div",{className:d,children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section E · Preview"}),h]})},sa=({page:i,onChange:m,onExport:t,onImportClick:a,sectionCls:n})=>e.jsxs("div",{className:n,children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section F · General"}),e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Page settings"}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Name *"}),e.jsx("input",{value:i.name??"",onChange:v=>m("name",v.target.value),className:y,required:!0})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:'Slug * (URL path segment — "." is the reserved Home/index slug)'}),e.jsx("input",{value:i.slug??"",onChange:v=>m("slug",v.target.value),className:`${y} font-mono`,required:!0})]})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Description"}),e.jsx("textarea",{value:i.description??"",onChange:v=>m("description",v.target.value),rows:2,className:y})]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Kind"}),e.jsx("select",{value:"custom",disabled:!0,className:y,title:'Only "custom" pages exist — the legacy built-in kind was removed (migration 046)',children:e.jsx("option",{value:"custom",children:"Custom"})})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Category"}),e.jsx(Ke,{value:i.category??"",options:ts,placeholder:"monitoring",onChange:v=>m("category",v),onAdd:v=>m("category",v),onDelete:()=>m("category","")})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Type"}),e.jsx(Ke,{value:i.type??"",options:ss,placeholder:"dashboard",onChange:v=>m("type",v),onAdd:v=>m("type",v),onDelete:()=>m("type","")})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs text-gray-400 mb-2",children:"Icon & colour — pick a preset or paste SVG markup (live preview on the left)"}),e.jsx(Yt,{icon:i.icon_svg??"",color:i.icon_color??"",onIconChange:v=>m("icon_svg",v),onColorChange:v=>m("icon_color",v),previewName:i.name||"Page"})]}),e.jsxs("div",{className:"flex items-center gap-3 pt-1",children:[e.jsx("button",{type:"button",onClick:t,className:"text-xs text-gray-400 hover:text-white underline",title:"Export page JSON",children:"Export JSON"}),e.jsx("button",{type:"button",onClick:a,className:"text-xs text-gray-400 hover:text-white underline",title:"Import page JSON",children:"Import JSON"})]})]}),aa=({components:i,onAdd:m,onRemove:t,onUpdate:a,onImport:n,sectionCls:v=K,configure:c=[]})=>{const[f,b]=_.useState(null),[l,p]=_.useState(!1),[u,E]=_.useState(""),x=new Set(i.filter(h=>h.type==="shared").map(h=>(h.shared||h.name||"").trim()).filter(Boolean));for(const h of i){const w=(h.name||"").trim();w&&x.add(w)}const r=Wt.filter(h=>{const w=u.trim().toLowerCase();return w?h.name.toLowerCase().includes(w)||h.label.toLowerCase().includes(w)||h.description.toLowerCase().includes(w):!0}),M=Vt.filter(h=>{const w=u.trim().toLowerCase();return w?h.name.toLowerCase().includes(w)||h.label.toLowerCase().includes(w)||h.description.toLowerCase().includes(w)||h.ksuiKey.toLowerCase().includes(w):!0}),j=h=>{n==null||n(h),p(!1)},N=i.length>0&&i.every(h=>h.editable!==!1),d=h=>{i.forEach(w=>{if(w.editable!==!1!==h){if(h&&w.type==="shared"&&(!w.content||!w.content.trim())){const P=(w.shared||w.name||"").trim(),T=Q(P);if(T){a(w.id,{editable:h,content:T});return}}a(w.id,{editable:h})}})},L=(h,w)=>{if(w&&h.type==="shared"&&(!h.content||!h.content.trim())){const P=(h.shared||h.name||"").trim(),T=Q(P);if(T){a(h.id,{editable:w,content:T});return}}a(h.id,{editable:w})};return e.jsxs("div",{className:v,children:[e.jsxs("div",{className:"flex items-center justify-between mb-1 gap-3",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section E · Components"}),e.jsxs("p",{className:"text-xs text-gray-500",children:["Reusable page components. Reference them in content with ",e.jsx("code",{className:"text-gray-400",children:"{{component:name}}"}),". ",e.jsx("span",{className:"text-gray-400",children:"Per-component toggle:"})," ",e.jsx("span",{className:"text-emerald-300",children:"ON = editable, saved whole in YAML"})," · ",e.jsx("span",{className:"text-sky-300",children:"OFF = locked, not saved, always loads from panel system"}),"."]})]}),e.jsxs("div",{className:"flex items-center gap-1 shrink-0",children:[i.length>0&&e.jsx("button",{type:"button",onClick:()=>d(!N),className:`text-[11px] px-2 py-1 rounded border ${N?"border-emerald-400/30 bg-emerald-400/10 text-emerald-300":"border-white/10 bg-white/[0.04] text-gray-400"}`,title:N?"Lock all (load from panel)":"Make all editable (save to YAML)",children:N?"All editable":"All locked"}),e.jsx("button",{type:"button",onClick:()=>p(!0),className:"ks-btn-header ks-icon-btn","aria-label":"Import panel component",title:"Import panel component",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-5 h-5",children:[e.jsx("path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),e.jsx("polyline",{points:"7 10 12 15 17 10"}),e.jsx("line",{x1:"12",y1:"15",x2:"12",y2:"3"})]})}),e.jsx("button",{type:"button",onClick:m,className:"ks-btn-header ks-icon-btn","aria-label":"Add component",title:"Add component",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-5 h-5",children:[e.jsx("line",{x1:"12",y1:"5",x2:"12",y2:"19"}),e.jsx("line",{x1:"5",y1:"12",x2:"19",y2:"12"})]})})]})]}),e.jsxs("div",{className:"space-y-4",children:[i.map((h,w)=>{var F;const P=f===h.id,T=h.type==="shared",A=h.editable!==!1,H=h.type==="module";return e.jsxs(Me,{variant:"form",className:`p-4 space-y-3 ${!A&&!H?"opacity-90":""}`,children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[e.jsxs("span",{className:"text-sm font-semibold text-white truncate",children:["Component #",w+1]}),h.name.trim()&&e.jsx("span",{className:"font-mono text-[11px] text-gray-500 truncate",children:h.name}),e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400",children:h.type}),T&&e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-sky-300",children:"panel-shared"}),H?e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300",children:"module"}):A?e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300",children:"editable · YAML"}):e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-sky-300",children:"locked · panel"})]}),e.jsxs("div",{className:"flex items-center gap-2 shrink-0",children:[!H&&e.jsxs("label",{className:"flex items-center gap-1.5 cursor-pointer select-none",title:A?"Editable ON — saved whole in YAML":"Locked OFF — not saved, loads from panel system",children:[e.jsx("span",{className:`text-[11px] ${A?"text-emerald-300":"text-gray-500"}`,children:A?"ON":"OFF"}),e.jsxs("span",{className:`relative inline-flex h-5 w-9 items-center rounded-full border transition ${A?"bg-emerald-500/20 border-emerald-400/30":"bg-white/10 border-white/10"}`,children:[e.jsx("input",{type:"checkbox",checked:A,onChange:S=>L(h,S.target.checked),className:"sr-only","aria-label":"Editable toggle"}),e.jsx("span",{className:`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${A?"translate-x-5":"translate-x-1"}`})]}),e.jsx("span",{className:"text-[11px] text-gray-500 hidden sm:inline",children:A?"editable":"locked"})]}),e.jsx("button",{type:"button",onClick:()=>b(P?null:h.id),className:"ks-btn-header ks-icon-btn","aria-label":"Toggle component editor",title:"Toggle editor",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:e.jsx("polyline",{points:"6 9 12 15 18 9"})})}),e.jsx("button",{type:"button",onClick:()=>t(h.id),className:"ks-btn-header ks-icon-btn","aria-label":"Remove component",title:"Remove component",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4",children:[e.jsx("polyline",{points:"3 6 5 6 21 6"}),e.jsx("path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"})]})})]})]}),P&&e.jsx("div",{className:"space-y-3 pt-2 border-t border-white/5",children:!A&&!H?e.jsxs("div",{className:"rounded border border-sky-400/20 bg-sky-400/5 p-3 space-y-3",children:[e.jsxs("p",{className:"text-[11px] text-sky-300/80",children:["🔒 Locked — not editable, not saved whole in YAML. Always loads from panel Instance Pages system. Flip ",e.jsx("span",{className:"text-white",children:"ON"})," to make it editable and save whole content to YAML."]}),T?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Token name *"}),e.jsx("input",{value:h.name,onChange:S=>a(h.id,{name:S.target.value}),className:y,placeholder:"panel_action_pill"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Panel component"}),e.jsx("input",{value:h.shared||h.name,onChange:S=>a(h.id,{shared:S.target.value}),className:y,placeholder:"panel_action_pill"})]})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Description"}),e.jsx("input",{value:h.description,onChange:S=>a(h.id,{description:S.target.value}),className:y,placeholder:"Reusable panel UI"})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Component name *"}),e.jsx("input",{value:h.name,onChange:S=>a(h.id,{name:S.target.value}),className:y,placeholder:"header_nav"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Type"}),e.jsxs("select",{value:h.type,onChange:S=>a(h.id,{type:S.target.value}),className:y,children:[e.jsx("option",{value:"html",children:"HTML"}),e.jsx("option",{value:"markdown",children:"Markdown"}),e.jsx("option",{value:"block",children:"Block JSON"}),e.jsx("option",{value:"shared",children:"Shared (panel)"}),e.jsx("option",{value:"module",children:"Module (React file — edited on the React tab)"})]})]})]}),e.jsx("p",{className:"text-[11px] text-gray-500",children:"Content is locked — turn ON to edit and save. Currently panel supplies the source."})]})]}):T?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Token name *"}),e.jsx("input",{value:h.name,onChange:S=>a(h.id,{name:S.target.value}),className:y,placeholder:"panel_action_pill"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Panel component"}),e.jsx("input",{value:h.shared||h.name,onChange:S=>a(h.id,{shared:S.target.value}),className:y,placeholder:"panel_action_pill"})]})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Description"}),e.jsx("input",{value:h.description,onChange:S=>a(h.id,{description:S.target.value}),className:y,placeholder:"Reusable panel UI"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Content (forked from panel — editable) "}),e.jsx("textarea",{value:h.content,onChange:S=>a(h.id,{content:S.target.value}),rows:6,className:`${y} font-mono`,placeholder:((F=Q(h.shared||h.name))==null?void 0:F.slice(0,120))||"<div>...</div>"})]}),e.jsxs("p",{className:"text-[11px] text-emerald-300/80",children:["✏️ Editable — forked copy saved whole in YAML. Use ",e.jsxs("code",{className:"font-mono",children:["{{component:",h.name.trim()||"name","}}"]})," and ",e.jsx("code",{className:"font-mono",children:"{{config:NAME}}"})," inside it."]}),e.jsxs("div",{className:"rounded border border-emerald-700/30 bg-emerald-900/10 p-3 space-y-2",children:[e.jsx("p",{className:"text-xs font-semibold uppercase tracking-wide text-emerald-300",children:"Config context"}),c.length>0?e.jsxs(e.Fragment,{children:[e.jsxs("p",{className:"text-[11px] text-gray-400",children:["Available ",e.jsx("code",{className:"font-mono",children:"{{config:NAME}}"})," tokens from the Configure tab:"]}),e.jsx("div",{className:"flex flex-wrap gap-1.5",children:c.map(S=>e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-1 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-gray-300",title:`${S.label||S.name}${S.description?" — "+S.description:""} (default: ${S.default||'""'})`,children:[e.jsxs("span",{className:"text-emerald-300",children:["{{config:",S.name,"}}"]}),e.jsxs("span",{className:"text-gray-500 hidden sm:inline",children:["· ",S.display]})]},S.id))}),e.jsx("p",{className:"text-[11px] text-gray-500",children:"Values are set per template via the template editor's Configure button."})]}):e.jsxs("p",{className:"text-[11px] text-gray-500",children:["No configure variables yet — add them in the ",e.jsx("span",{className:"text-white",children:"Configure"})," tab; they'll appear here as ",e.jsx("code",{className:"font-mono",children:"{{config:NAME}}"})," tokens."]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Component name *"}),e.jsx("input",{value:h.name,onChange:S=>a(h.id,{name:S.target.value}),className:y,placeholder:"header_nav"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Type"}),e.jsxs("select",{value:h.type,onChange:S=>a(h.id,{type:S.target.value}),className:y,children:[e.jsx("option",{value:"html",children:"HTML"}),e.jsx("option",{value:"markdown",children:"Markdown"}),e.jsx("option",{value:"block",children:"Block JSON"}),e.jsx("option",{value:"shared",children:"Shared (panel)"}),e.jsx("option",{value:"module",children:"Module (React file — edited on the React tab)"})]})]})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Description"}),e.jsx("input",{value:h.description,onChange:S=>a(h.id,{description:S.target.value}),className:y,placeholder:"Reusable header for all pages"})]}),e.jsxs("label",{className:"block",children:[e.jsx("span",{className:"text-xs text-gray-400",children:"Content"}),e.jsx("textarea",{value:h.content,onChange:S=>a(h.id,{content:S.target.value}),rows:6,className:`${y} font-mono`,placeholder:"<div>...</div>"})]}),e.jsx("p",{className:"text-[11px] text-emerald-300/80",children:"✏️ Editable — content will be saved whole in YAML."}),e.jsxs("div",{className:"rounded border border-emerald-700/30 bg-emerald-900/10 p-3 space-y-2",children:[e.jsx("p",{className:"text-xs font-semibold uppercase tracking-wide text-emerald-300",children:"Config context"}),c.length>0?e.jsxs(e.Fragment,{children:[e.jsxs("p",{className:"text-[11px] text-gray-400",children:["Available ",e.jsx("code",{className:"font-mono",children:"{{config:NAME}}"})," tokens:"]}),e.jsx("div",{className:"flex flex-wrap gap-1.5",children:c.map(S=>e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-1 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-gray-300",title:`${S.label||S.name}${S.description?" — "+S.description:""}`,children:[e.jsxs("span",{className:"text-emerald-300",children:["{{config:",S.name,"}}"]}),e.jsxs("span",{className:"text-gray-500 hidden sm:inline",children:["· ",S.display]})]},S.id))})]}):e.jsx("p",{className:"text-[11px] text-gray-500",children:"No configure variables yet — add them in the Configure tab."})]})]})})]},h.id)}),i.length===0&&e.jsx("div",{className:"p-4 border border-dashed border-white/10 rounded-lg text-center text-sm text-gray-500",children:"No components defined yet. Add a component or import one from the panel."})]}),e.jsxs(Xt,{open:l,onClose:()=>p(!1),title:"Import panel component",children:[e.jsx("input",{value:u,onChange:h=>E(h.target.value),className:y,placeholder:"Search panel components…","aria-label":"Search panel components"}),e.jsxs("div",{className:"space-y-2 max-h-[50vh] overflow-y-auto",children:[r.map(h=>{const w=x.has(h.name);return e.jsxs("div",{className:"flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsxs("p",{className:"text-sm text-white font-medium",children:[h.label," ",e.jsx("span",{className:"font-mono text-[11px] text-gray-500",children:h.name})]}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:h.description}),e.jsxs("p",{className:"text-[11px] text-gray-600 mt-1 font-mono",children:["{{component:",h.name,"}}"]})]}),e.jsx("button",{type:"button",disabled:w,onClick:()=>j(h),className:"ks-btn-header shrink-0 px-3 py-1.5 rounded text-xs disabled:opacity-50",children:w?"Added":"Import"})]},h.name)}),r.length===0&&e.jsxs("p",{className:"text-sm text-gray-500 text-center py-4",children:["No panel components match “",u,"”."]}),M.length>0&&e.jsx("p",{className:"text-[11px] uppercase tracking-wide text-gray-500 pt-1",children:"Live React · instance pages only (KSUI)"}),M.map(h=>{const w=x.has(h.name);return e.jsxs("div",{className:"flex items-start justify-between gap-3 p-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.03]",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsxs("p",{className:"text-sm text-white font-medium",children:[h.label," ",e.jsx("span",{className:"font-mono text-[11px] text-gray-500",children:h.name})," ",e.jsx("span",{className:"text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300",children:"live React"})," ",e.jsxs("span",{className:"font-mono text-[11px] text-emerald-300/70",children:["KSUI.",h.ksuiKey]})]}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:h.description}),e.jsxs("p",{className:"text-[11px] text-gray-600 mt-1 font-mono",children:["{{component:",h.name,"}}"]})]}),e.jsx("button",{type:"button",disabled:w,onClick:()=>j(h),className:"ks-btn-header shrink-0 px-3 py-1.5 rounded text-xs disabled:opacity-50",children:w?"Added":"Import"})]},h.name)})]}),e.jsx("p",{className:"text-[11px] text-gray-500",children:"Import stores only the name — the panel supplies the source on every visit, so updates apply automatically."})]})]})},ia=({configure:i,onAdd:m,onRemove:t,onUpdate:a,onMove:n,sectionCls:v})=>{const[c,f]=_.useState(null),b=p=>{switch(p){case"text":return"bg-sky-900/30 text-sky-300 border-sky-700/40";case"number":return"bg-emerald-900/30 text-emerald-300 border-emerald-700/40";case"select":return"bg-amber-900/30 text-amber-300 border-amber-700/40";case"checkbox":return"bg-violet-900/30 text-violet-300 border-violet-700/40";case"toggle":return"bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/40";default:return"bg-white/10 text-gray-300 border-white/10"}},l=(p,u)=>{n&&n(p,u)};return e.jsxs("div",{className:v,children:[e.jsxs("div",{className:"flex items-center justify-between mb-1",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400",children:"Configure"}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:"Page-level variables — like template Env Variables. Authors define them here; operators fill values per template (Configure button)."})]}),e.jsx("button",{type:"button",onClick:m,className:"text-xs text-sky-300 hover:text-sky-200 underline",children:"+ Add variable"})]}),i.length===0&&e.jsx("p",{className:"text-xs text-gray-500",children:"No variables defined. Add one to let templates configure this page."}),e.jsx("div",{className:"space-y-3",children:i.map((p,u)=>{const E=c===p.id;return e.jsxs("div",{className:"ks-card ks-form-card ks-row-card rounded-md overflow-hidden",children:[e.jsxs("div",{className:"p-3 flex items-center gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex flex-col gap-0.5 shrink-0",children:[e.jsx("button",{type:"button","aria-label":"Move up",onClick:()=>l(p.id,-1),disabled:u===0,className:"p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-3.5 h-3.5",children:e.jsx("path",{d:"M18 15l-6-6-6 6"})})}),e.jsx("button",{type:"button","aria-label":"Move down",onClick:()=>l(p.id,1),disabled:u===i.length-1,className:"p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-3.5 h-3.5",children:e.jsx("path",{d:"M6 9l6 6 6-6"})})})]}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("span",{className:"text-sm font-semibold text-white truncate",children:p.label||p.name||`Variable ${u+1}`}),e.jsx("span",{className:`text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${b(p.display)}`,children:p.display}),e.jsx("code",{className:"text-[11px] text-gray-500 font-mono",children:p.name||"KEY"})]}),p.description&&e.jsx("p",{className:"text-[11px] text-gray-500 truncate mt-0.5",children:p.description})]}),e.jsxs("div",{className:"flex items-center gap-1 shrink-0",children:[e.jsx("button",{type:"button",onClick:()=>t(p.id),className:"p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300","aria-label":"Remove",children:e.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",className:"w-4 h-4",children:[e.jsx("polyline",{points:"3 6 5 6 21 6"}),e.jsx("path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"})]})}),e.jsx("button",{type:"button",onClick:()=>f(E?null:p.id),className:"p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white","aria-label":"Options",children:e.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",className:"w-4 h-4",children:e.jsx("polyline",{points:"6 9 12 15 18 9"})})})]})]}),E&&e.jsxs("div",{className:"px-3 pb-3 pt-1 ks-row-card-body space-y-3",children:[e.jsxs("div",{className:"grid grid-cols-2 gap-2",children:[e.jsx("input",{value:p.name,onChange:x=>a(p.id,{name:x.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"")}),placeholder:"Variable name (KEY)",className:`${y} font-mono`}),e.jsx("input",{value:p.label,onChange:x=>a(p.id,{label:x.target.value}),placeholder:"Display label",className:y})]}),e.jsx("input",{value:p.description,onChange:x=>a(p.id,{description:x.target.value}),placeholder:"Description",className:y}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-2 gap-2",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-[11px] text-gray-500 mb-0.5",children:"Display type"}),e.jsxs("select",{value:p.display,onChange:x=>a(p.id,{display:x.target.value}),className:y,children:[e.jsx("option",{value:"text",children:"Text input"}),e.jsx("option",{value:"number",children:"Number input"}),e.jsx("option",{value:"select",children:"Dropdown"}),e.jsx("option",{value:"checkbox",children:"Checkbox"}),e.jsx("option",{value:"toggle",children:"Toggle (On / Off)"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-[11px] text-gray-500 mb-0.5",children:"Validation rule (regex)"}),e.jsx("input",{value:p.rule,onChange:x=>a(p.id,{rule:x.target.value}),placeholder:"^[a-zA-Z0-9_]+$",className:`${y} font-mono`})]})]}),e.jsx("input",{value:p.default,onChange:x=>a(p.id,{default:x.target.value}),placeholder:"Default value",className:`${y} font-mono`}),p.display==="select"&&e.jsx("input",{value:p.options,onChange:x=>a(p.id,{options:x.target.value}),placeholder:"Options (comma-separated)",className:y}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-2 gap-2",children:[e.jsx("input",{value:p.prepend,onChange:x=>a(p.id,{prepend:x.target.value}),placeholder:"prepend",className:`${y} font-mono`}),e.jsx("input",{value:p.append_value,onChange:x=>a(p.id,{append_value:x.target.value}),placeholder:"append",className:`${y} font-mono`})]}),e.jsxs("div",{className:"flex flex-wrap gap-4 items-center",children:[e.jsxs("label",{className:"inline-flex items-center gap-2 cursor-pointer",children:[e.jsx("button",{type:"button",onClick:()=>a(p.id,{user_viewable:!p.user_viewable}),className:`relative w-9 h-5 rounded-full transition ${p.user_viewable?"bg-green-600":"bg-neutral-700"}`,"aria-pressed":p.user_viewable,children:e.jsx("span",{className:`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${p.user_viewable?"translate-x-4":""}`})}),e.jsx("span",{className:"text-sm text-gray-300",children:"User Viewable"})]}),e.jsxs("label",{className:"inline-flex items-center gap-2 cursor-pointer",children:[e.jsx("button",{type:"button",onClick:()=>a(p.id,{user_editable:!p.user_editable}),className:`relative w-9 h-5 rounded-full transition ${p.user_editable?"bg-green-600":"bg-neutral-700"}`,"aria-pressed":p.user_editable,children:e.jsx("span",{className:`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${p.user_editable?"translate-x-4":""}`})}),e.jsx("span",{className:"text-sm text-gray-300",children:"User Editable"})]}),e.jsxs("label",{className:"inline-flex items-center gap-2 cursor-pointer",children:[e.jsx("button",{type:"button",onClick:()=>a(p.id,{required:!p.required}),className:`relative w-9 h-5 rounded-full transition ${p.required?"bg-green-600":"bg-neutral-700"}`,"aria-pressed":p.required,children:e.jsx("span",{className:`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${p.required?"translate-x-4":""}`})}),e.jsx("span",{className:"text-sm text-gray-300",children:"Required"})]}),e.jsxs("label",{className:"inline-flex items-center gap-2 cursor-pointer",children:[e.jsx("button",{type:"button",onClick:()=>a(p.id,{append:!p.append}),className:`relative w-9 h-5 rounded-full transition ${p.append?"bg-green-600":"bg-neutral-700"}`,"aria-pressed":p.append,children:e.jsx("span",{className:`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${p.append?"translate-x-4":""}`})}),e.jsx("span",{className:"text-sm text-gray-300",children:"Append to command"})]})]}),e.jsxs("p",{className:"text-[11px] text-gray-500",children:["Use ",e.jsx("code",{className:"font-mono",children:"{{config:NAME}}"})," in page content to render the value entered per template. The template's Configure button collects values for these vars."]})]})]},p.id)})})]})},Ea=()=>{const i=Zt(),{id:m}=Qt(),t=!!m,a=m?Number(m):null,[n,v]=_.useState("editor"),[c,f]=_.useState(!0),[b,l]=_.useState(!1),[p,u]=_.useState(""),[E,x]=_.useState(""),[r,M]=_.useState(null),[j,N]=_.useState(null),[d,L]=_.useState({name:"",description:"",slug:"",kind:"custom",category:"",type:"",content_type:"html",content_html:"",content_markdown:"",content_blocks:"",source_tsx:"",bundle_css:"",icon_svg:"",icon_color:"",actions:""}),[h,w]=_.useState(!1),[P,T]=_.useState([]),[A,H]=_.useState([]),[F,S]=_.useState([]),[W,$]=_.useState([]),[ie,J]=_.useState(null),[C,R]=_.useState("main"),[D,te]=_.useState(!1),[U,Pe]=_.useState(null);_.useEffect(()=>{if(!D)return;const s=()=>{const g=document.querySelector("main");if(!g){Pe(null);return}const o=g.getBoundingClientRect();Pe({top:o.top,left:o.left,width:o.width,height:o.height})};return s(),window.addEventListener("resize",s),()=>window.removeEventListener("resize",s)},[D]),_.useEffect(()=>{if(!D)return;const s=g=>{g.key==="Escape"&&te(!1)};return document.addEventListener("keydown",s),()=>document.removeEventListener("keydown",s)},[D]),_.useEffect(()=>{n!=="preview"&&D&&te(!1)},[n,D]);const[et,re]=_.useState("visual"),[ne,tt]=_.useState(""),[oe,st]=_.useState([]),[Z,Ae]=_.useState(null),[ra,na]=_.useState(!1),O=d.kind==="builtin",at=JSON.stringify({page:d,actions:P,components:A,configure:F,subs:W}),me=Ot(at,s=>{const g=JSON.parse(s);L(g.page),T(g.actions),H(g.components),S(g.configure),$(g.subs)}),{suspend:Le}=me,Te=_.useCallback(async()=>{Le(),u("");try{const s=await Lt();st(s)}catch{}if(!t||a==null){f(!1);return}try{const s=await Tt(a);L({...s}),T(xe(s.actions)),$(pe(s.sub_pages)),H(ke(s.components)),S(be(s.configure))}catch(s){u(ce(s,"Failed to load page"))}finally{f(!1)}},[a,t,Le]);_.useEffect(()=>{Te()},[Te]),_.useEffect(()=>{t||f(!1)},[t]);const he=_.useMemo(()=>d.content_type==="html"?d.content_html??"":d.content_type==="markdown"?d.content_markdown??"":d.content_type==="react"?d.source_tsx??"":d.content_blocks??"",[d.content_type,d.content_html,d.content_markdown,d.content_blocks,d.source_tsx]),G=_.useMemo(()=>Ms(P),[P]),Y=(s,g)=>{L(o=>({...o,[s]:g})),(s==="name"||s==="slug")&&u("")};_.useEffect(()=>{var s,g;p&&((s=d.name)!=null&&s.trim())&&((g=d.slug)!=null&&g.trim())&&u("")},[d.name,d.slug]);const it=s=>{d.content_type==="html"?Y("content_html",s):d.content_type==="markdown"?Y("content_markdown",s):d.content_type==="react"?Y("source_tsx",s):Y("content_blocks",s)},ze=()=>{const s=(d.icon_color||"").trim();return{name:d.name.trim(),description:d.description??"",slug:d.slug.trim(),kind:d.kind??"custom",category:d.category??"",type:d.type??"",content_type:d.content_type||"html",content_html:d.content_html??"",content_markdown:d.content_markdown??"",content_blocks:d.content_blocks??"",source_tsx:d.source_tsx??"",bundle_css:d.bundle_css??"",icon_svg:d.icon_svg??"",icon_color:s.toUpperCase(),actions:JSON.stringify(G),sub_pages:Ue(W),components:fe(A),configure:ye(F)}},rt=async()=>{if(!t||a==null){u("Save the page first to build it.");return}const s=Ge(W);if(s){u(s);return}const g=Ve(P);if(g){u(g);return}if(d.content_type==="react"&&!(d.source_tsx??"").trim()){u("React pages need source before building (React tab → Starter).");return}w(!0),u("");try{await Fe(a,ze());const o=await Rt(a,{source_tsx:d.source_tsx??"",bundle_css:d.bundle_css??""});L(k=>({...k,build_status:o.build_status,build_log:o.build_log})),o.build_status==="ok"&&$(k=>k.map(z=>z.content_type==="react"&&z.source_tsx.trim()?{...z,bundle_js:z.source_tsx}:z)),x(o.build_status==="ok"?"Build ok — bundle stored. Re-link templates to ship it.":`Build: ${o.build_log}`)}catch(o){L(k=>({...k,build_status:"error"})),u(ce(o,"Build failed"))}finally{w(!1)}},nt=_.useMemo(()=>{const s=ne.trim().toLowerCase();return s?ee.filter(g=>g.name.toLowerCase().includes(s)||g.slug.toLowerCase().includes(s)||g.category.toLowerCase().includes(s)||g.description.toLowerCase().includes(s)):ee},[ne]),ot=s=>{const g=s.contentType??(s.blocks?"blocks":s.markdown?"markdown":"html");if(L(o=>({...o,...t?{}:{name:s.name,slug:s.slug,category:s.category,description:s.description,icon_svg:s.iconSvg},content_type:g,content_html:g==="html"?s.html??"":o.content_html,content_markdown:g==="markdown"?s.markdown??"":o.content_markdown,content_blocks:g==="blocks"?s.blocks??"":o.content_blocks})),re("visual"),Array.isArray(s.actions)&&T(xe(JSON.stringify(s.actions))),Array.isArray(s.subPages)){const o=pe(JSON.stringify(s.subPages));$(o),J(null),C!=="main"&&R("main")}u(""),x(`Template "${s.name}" applied — review and save.`),v("editor")},lt=()=>T(s=>[...s,Es()]),dt=s=>{T(g=>g.filter(o=>o.id!==s))},ct=(s,g)=>{T(o=>o.map(k=>k.id===s?{...k,...g}:k))},pt=()=>H(s=>[...s,As()]),mt=s=>H(g=>g.filter(o=>o.id!==s)),ht=(s,g)=>H(o=>o.map(k=>k.id===s?{...k,...g}:k)),ut=_.useMemo(()=>A.filter(s=>s.type==="module").map(s=>({name:s.name,content:s.content})),[A]),gt=s=>{H(g=>{const o=g.filter(I=>I.type!=="module"),k=new Map(g.filter(I=>I.type==="module").map(I=>[I.name,I])),z=s.map(I=>{const V=k.get(I.name);return V?{...V,content:I.content}:{id:`c${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:I.name,type:"module",description:"",content:I.content}});return[...o,...z]}),L(g=>({...g,build_status:"",build_log:""}))},vt=s=>{const g=(s.name||"").trim();if(!g)return;if(A.some(k=>(k.name||"").trim()===g||(k.shared||"").trim()===g&&k.type==="shared")){x(`"${g}" is already in Components.`);return}const o={id:`c${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:g,type:"shared",description:s.description||`Panel shared: ${s.label||g}`,content:"",shared:g,editable:!1};x(`Imported "${g}" — use {{component:${g}}} in content.`),H(k=>k.some(z=>(z.name||"").trim()===g)?k:[...k,o])},xt=()=>S(s=>[...s,Ts()]),kt=s=>S(g=>g.filter(o=>o.id!==s)),ft=(s,g)=>S(o=>o.map(k=>k.id===s?{...k,...g}:k)),bt=(s,g)=>{S(o=>{const k=o.findIndex(V=>V.id===s);if(k<0)return o;const z=k+g;if(z<0||z>=o.length)return o;const I=[...o];return[I[k],I[z]]=[I[z],I[k]],I})},yt=()=>{const s=Ps();$(g=>[...g,s]),J(s.id)},wt=(s,g)=>{$(o=>o.map(k=>k.id===s?{...k,...g}:k))},jt=s=>{$(g=>g.filter(o=>o.id!==s)),ie===s&&J(null),C===s&&R("main")},_t=(s,g)=>{$(o=>{const k=s+g;if(k<0||k>=o.length)return o;const z=[...o];return[z[s],z[k]]=[z[k],z[s]],z})},B=_.useMemo(()=>oe.find(s=>s.id===Z)??null,[oe,Z]),St=_.useMemo(()=>B?{id:B.id,name:B.name,kind:B.kind,status:B.status,template_id:B.template_id,template_name:B.template_name??null,node_id:B.node_id,node_name:B.node_name??null,owner_id:B.owner_id??null,owner_name:B.owner_name??null,config:B.config?zt(B.config):{},external_id:B.external_id??"",created_at:B.created_at??"",updated_at:B.updated_at??""}:null,[B]),ue=_.useMemo(()=>W.find(s=>s.id===C)??null,[W,C]),se=_.useMemo(()=>we(fe(A)),[A]),X=_.useMemo(()=>je(ye(F)),[F]),ae=_.useMemo(()=>{const s={};for(const g of X)g.name&&(s[g.name]=g.default??"");return s},[X]),Nt=_.useMemo(()=>{const s=ue;return s?{type:s.content_type,html:s.content_html,markdown:s.content_markdown,blocks:s.content_blocks,bundle:s.content_type==="react"&&(s.bundle_js||s.source_tsx)||void 0,bundleCss:s.content_type==="react"&&s.bundle_css||void 0,actions:G.length?G:void 0,components:se.length?se:void 0,configure:X.length?X:void 0,config:Object.keys(ae).length?ae:void 0}:{type:d.content_type||"html",html:d.content_html,markdown:d.content_markdown,blocks:d.content_blocks,bundle:d.content_type==="react"?d.bundle_js||d.source_tsx:void 0,bundleCss:d.content_type==="react"?d.bundle_css??"":void 0,actions:G.length?G:void 0,components:se.length?se:void 0,configure:X.length?X:void 0,config:Object.keys(ae).length?ae:void 0}},[ue,d.content_type,d.content_html,d.content_markdown,d.content_blocks,d.source_tsx,d.bundle_js,d.bundle_css,G,se,X,ae]),Ct=async s=>{if(!a){u("Save the page first to test its actions.");return}if(!Z){u("Pick a test instance (Actions or Preview tab) to test against.");return}const g=G.find(o=>o.name===s.name.trim());if(!g){u("The action needs a name before it can be tested.");return}M(s.id),N(null),u("");try{const o=await Bt(a,Z,g);N({id:s.id,stdout:o.stdout??"",stderr:o.stderr??"",exit_code:o.exit_code??-1})}catch(o){N({id:s.id,stdout:"",stderr:ce(o,"Action failed"),exit_code:-1})}finally{M(null)}},Ie=async s=>{var V,He,De;if(s&&s.preventDefault(),u(""),O){u("Built-in pages cannot be edited. Create a custom page instead.");return}if(!((V=d.name)!=null&&V.trim())||!((He=d.slug)!=null&&He.trim())){u("Name and slug are required before saving.");return}if(d.name.trim().length>200){u("Name too long (max 200 characters).");return}if((d.description??"").length>500){u("Description too long (max 500 characters).");return}if((d.category??"").length>500){u("Category too long (max 500 characters).");return}if((d.type??"").length>500){u("Type too long (max 500 characters).");return}if(d.slug.trim()!=="."&&!/^[a-z0-9][a-z0-9-._]*$/i.test(d.slug.trim())){u('Slug may contain letters, numbers, dots, dashes and underscores only ("." is the reserved Home slug).');return}if((De=d.slug)!=null&&De.trim().includes("..")){u('Slug must not contain ".." (path traversal).');return}if(d.slug&&d.slug.trim().length>64){u("Slug too long (max 64 characters).");return}const g=(d.icon_color||"").trim();if(g&&!/^#[0-9a-fA-F]{6}$/.test(g)){u("Icon colour must be a #rrggbb hex value (or empty for default).");return}const o=Ge(W);if(o){u(o);return}const k=Ls(A);if(k){u(k);return}const z=zs(F);if(z){u(z);return}const I=Ve(P);if(I){u(I);return}if(d.content_type==="react"&&!(d.source_tsx??"").trim()){u("React pages need source before saving (React tab → Starter).");return}l(!0),u("");try{const de=ze();t&&a!=null?await Fe(a,de):await It(de),me.commit(),i("/instance-pages")}catch(de){u(ce(de,"Save failed"))}finally{l(!1)}},Re=()=>{const s={name:d.name??"",slug:d.slug??"",kind:d.kind??"custom",category:d.category??"",type:d.type??"",description:d.description??"",content_type:d.content_type||"html",content_html:d.content_html??"",content_markdown:d.content_markdown??"",content_blocks:d.content_blocks??"",source_tsx:d.source_tsx??"",bundle_css:d.bundle_css??"",icon_svg:d.icon_svg??"",icon_color:d.icon_color??"",actions:G},g=Xe(Ue(W));g.length>0&&(s.pages=g);const o=we(fe(A));o.length>0&&(s.components=o);const k=je(ye(F));k.length>0&&(s.configure=k);const z=new Blob([JSON.stringify(s,null,2)],{type:"application/json"}),I=URL.createObjectURL(z),V=document.createElement("a");V.href=I,V.download=`${d.slug||"instance-page"}.json`,V.click(),URL.revokeObjectURL(I)},ge=_.useRef(null),Et=async s=>{try{const g=await s.text(),o=JSON.parse(g);if(!o||typeof o!="object")throw new Error("not an object");if(L(k=>({...k,name:typeof o.name=="string"?o.name:k.name,slug:typeof o.slug=="string"?o.slug:k.slug,kind:"custom",category:typeof o.category=="string"?o.category:k.category,type:typeof o.type=="string"?o.type:k.type,description:typeof o.description=="string"?o.description:k.description,content_type:["html","markdown","blocks","react"].includes(o.content_type)?o.content_type:k.content_type,content_html:typeof o.content_html=="string"?o.content_html:k.content_html,content_markdown:typeof o.content_markdown=="string"?o.content_markdown:k.content_markdown,content_blocks:typeof o.content_blocks=="string"?o.content_blocks:k.content_blocks,source_tsx:typeof o.source_tsx=="string"?o.source_tsx:k.source_tsx,bundle_css:typeof o.bundle_css=="string"?o.bundle_css:k.bundle_css,icon_svg:typeof o.icon_svg=="string"?o.icon_svg:k.icon_svg,icon_color:typeof o.icon_color=="string"?o.icon_color:k.icon_color,actions:Array.isArray(o.actions)?JSON.stringify(o.actions):k.actions})),Array.isArray(o.actions)&&T(xe(JSON.stringify(o.actions))),Array.isArray(o.pages)){const k=pe(JSON.stringify(o.pages));$(k),J(null)}else typeof o.sub_pages=="string"&&o.sub_pages.trim()&&($(pe(o.sub_pages)),J(null));if(Array.isArray(o.components)){const k=ke(JSON.stringify(o.components));H(k)}else typeof o.components=="string"&&o.components.trim()&&H(ke(o.components));if(Array.isArray(o.configure)){const k=be(JSON.stringify(o.configure));S(k)}else typeof o.configure=="string"&&o.configure.trim()&&S(be(o.configure));x("Page JSON imported into the form. Review and save.")}catch(g){u(`Import failed: ${(g==null?void 0:g.message)||g}`)}};if(c)return e.jsx($e,{crumbs:[{label:"Instance Pages",to:"/instance-pages"},{label:t?"Edit Page":"New Page"}],hideHeader:!0,maxWidth:"max-w-4xl",children:e.jsx($t,{fields:6})});const le=d.content_type||"html",Be={instances:oe,previewInstanceId:Z,onPreviewInstanceChange:Ae,previewTarget:C,onPreviewTargetChange:R,subs:W,pageName:d.name??"",pageSlug:d.slug??"",isBuiltin:O,isEdit:t,previewInstance:B,previewContext:St,previewContent:Nt,editingSub:ue,contentType:le,currentContent:he,fullPreview:D,onToggleFullPreview:()=>te(s=>!s),sectionCls:K};return D&&n==="preview"?e.jsx("div",{className:"fixed z-40 overflow-hidden",style:U??{top:0,left:0,right:0,bottom:0},children:e.jsx(Ye,{...Be})}):e.jsxs(e.Fragment,{children:[e.jsxs(Dt,{spacer:!1,outerClassName:"fixed right-4 sm:right-6 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-end w-auto max-w-[calc(100vw-2rem)]",children:[e.jsx(Ft,{hist:me}),e.jsx("button",{type:"button",onClick:()=>Ie(),disabled:b||O,title:t?"Save page":"Create page",className:"ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60",style:Ht,children:b?"Saving…":t?"Save":"Create"})]}),e.jsxs($e,{crumbs:[{label:"Instance Pages",to:"/instance-pages"},{label:t?"Edit Page":"New Page"}],onSubmit:Ie,maxWidth:"max-w-4xl",hideHeader:!0,disabled:O,children:[e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4",children:[e.jsx(Us,{tab:n,onChange:v,isBuiltin:O,tabsPillOuterClassName:"lg:hidden fixed left-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-start w-auto max-w-[calc(100vw-2rem)] ks-tabs-pill-wrap-below"}),e.jsxs("div",{className:"space-y-4 min-w-0",children:[p&&e.jsxs("p",{className:"text-red-400 flex items-start justify-between gap-2 border border-red-700/40 rounded px-3 py-2 bg-red-900/20",children:[e.jsx("span",{children:p}),e.jsx("button",{type:"button",onClick:()=>u(""),className:"text-xs text-gray-400 hover:text-white",children:"dismiss"})]}),E&&!p&&e.jsxs("p",{className:"text-emerald-300 flex items-start justify-between gap-2 border border-emerald-700/40 rounded px-3 py-2 bg-emerald-900/20",children:[e.jsx("span",{children:E}),e.jsx("button",{type:"button",onClick:()=>x(""),className:"text-xs text-gray-400 hover:text-white",children:"dismiss"})]}),O&&t&&e.jsxs("div",{className:"p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm",children:[e.jsx("p",{className:"font-semibold",children:"Built-in Page (Read-Only)"}),e.jsxs("p",{className:"mt-1",children:["Built-in pages are provided by the panel and cannot be edited here. To customize one for a specific template, use the ",e.jsx("strong",{children:"Pages"})," tab in the ",e.jsx("strong",{children:"Template"})," editor."]})]}),n==="templates"&&!O&&e.jsx(Gs,{search:ne,onSearchChange:tt,starters:nt,query:ne,onApply:ot,sectionCls:K}),n==="editor"&&!O&&le!=="react"&&e.jsx(Ys,{contentType:le,onContentTypeChange:s=>{Y("content_type",s),re("visual")},currentContent:he,onContentChange:it,contentBlocks:d.content_blocks??"",onBlocksChange:s=>{L(g=>({...g,content_blocks:s})),d.content_type!=="blocks"&&Y("content_type","blocks")},blocksMode:et,onBlocksModeChange:re,actionNames:G.map(s=>s.name),onCopy:()=>navigator.clipboard.writeText(he),onExport:Re,onImportClick:()=>{var s;return(s=ge.current)==null?void 0:s.click()},sectionCls:K}),n==="editor"&&!O&&le==="react"&&e.jsx(Qs,{source:d.source_tsx??"",onSourceChange:s=>L(g=>({...g,source_tsx:s,build_status:"",build_log:""})),css:d.bundle_css??"",onCssChange:s=>L(g=>({...g,bundle_css:s,build_status:"",build_log:""})),buildStatus:d.build_status??"",buildLog:d.build_log??"",onBuild:rt,building:h,canBuild:t&&a!=null,onContentTypeChange:s=>{Y("content_type",s),re("visual")},sectionCls:K,modules:ut,onModulesChange:gt}),n==="subpages"&&!O&&e.jsx(ea,{subs:W,editingSubId:ie,onEditingChange:J,onAdd:yt,onUpdate:wt,onRemove:jt,onMove:_t,pageSlug:d.slug,sectionCls:K}),n==="actions"&&!O&&e.jsx(ta,{actions:P,onAdd:lt,onRemove:dt,onUpdate:ct,onTest:Ct,pageId:a,previewInstanceId:Z,onPreviewInstanceChange:Ae,instances:oe,executingAction:r,actionResult:j,sectionCls:K}),n==="components"&&!O&&e.jsx(aa,{components:A,onAdd:pt,onRemove:mt,onUpdate:ht,onImport:vt,sectionCls:K,configure:F}),n==="configure"&&!O&&e.jsx(ia,{configure:F,onAdd:xt,onRemove:kt,onUpdate:ft,onMove:bt,sectionCls:K}),n==="preview"&&!O&&e.jsx(Ye,{...Be}),n==="settings"&&!O&&e.jsx(sa,{page:d,onChange:Y,onExport:Re,onImportClick:()=>{var s;return(s=ge.current)==null?void 0:s.click()},sectionCls:K}),n==="preview"&&O&&e.jsxs("div",{className:K,children:[e.jsx("h4",{className:"text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1",children:"Section E · Preview (read-only)"}),e.jsx("p",{className:"text-xs text-gray-500",children:"Built-in pages render through their compiled components inside the instance panel; there is nothing to preview here."})]}),n!=="preview"&&O&&e.jsx("div",{className:K,children:e.jsx("p",{className:"text-sm text-gray-400",children:"This built-in page is read-only. Switch to Preview or manage it per-template in the Template editor's Pages tab."})})]})]}),e.jsx("input",{ref:ge,type:"file",accept:"application/json,.json",className:"hidden",onChange:s=>{var o;const g=(o=s.target.files)==null?void 0:o[0];g&&Et(g),s.target.value=""}})]}),e.jsx("div",{"aria-hidden":"true",className:"h-20 lg:hidden"})]})};export{Ea as default};
