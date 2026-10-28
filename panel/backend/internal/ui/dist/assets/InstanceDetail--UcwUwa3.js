import{r as p,j as e,R as De}from"./react-CQbZUORi.js";import{b as Se,cl as ee,c as Pe,cm as Y,t as U,d as y,al as Z,p as Q,a as qe,cn as He,co as Ue,E as Ee,cp as je,cq as ie,cr as Ke,cs as Ve,j as We,n as K,ct as $e,cu as Ge,cv as Je,cw as Ye,S as Xe}from"./index-Dn3gGLdl.js";import{C as Te,p as Ze}from"./CustomPageView-C3pT6ag1.js";import{A as we,D as Qe}from"./MetricsChart-BXauVgyR.js";import{b as te,S as _e,d as O}from"./SystemCharts-BbE9XPWW.js";import{a as re,u as en,c as se,b as Ne,O as nn}from"./router-we2I1drz.js";import{h as tn}from"./vendor-RGRPoOcy.js";import"./preload-helper-D7HrI6pR.js";const an={running:"bg-emerald-400",stopped:"bg-gray-500",creating:"bg-yellow-400",installing:"bg-sky-400",errored:"bg-red-400",install_failed:"bg-red-400",destroyed:"bg-gray-600"},sn={running:"Running",stopped:"Stopped",creating:"Creating",installing:"Installing",errored:"Errored",install_failed:"Install failed",destroyed:"Destroyed"},rn={details:{label:"Details",icon:e.jsxs("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4","aria-hidden":"true",children:[e.jsx("line",{x1:"8",y1:"6",x2:"21",y2:"6"}),e.jsx("line",{x1:"8",y1:"12",x2:"21",y2:"12"}),e.jsx("line",{x1:"8",y1:"18",x2:"21",y2:"18"}),e.jsx("line",{x1:"3",y1:"6",x2:"3.01",y2:"6"}),e.jsx("line",{x1:"3",y1:"12",x2:"3.01",y2:"12"}),e.jsx("line",{x1:"3",y1:"18",x2:"3.01",y2:"18"})]})},monitoring:{label:"Monitoring",icon:e.jsxs("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4","aria-hidden":"true",children:[e.jsx("path",{d:"M12 20a8 8 0 1 1 8-8"}),e.jsx("path",{d:"M12 12l4-4"})]})},manage:{label:"Manage",icon:e.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4","aria-hidden":"true",children:e.jsx("path",{d:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"})})},activity:{label:"Activity",icon:e.jsxs("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4","aria-hidden":"true",children:[e.jsx("circle",{cx:"12",cy:"12",r:"9"}),e.jsx("path",{d:"M12 7v5l3 2"})]})}},ln=["details","monitoring","manage","activity"];function q(i){if(!i)return"—";const r=new Date(i);return Number.isNaN(r.getTime())?"—":r.toLocaleString()}const X=({icon:i,label:r,value:t,hint:v,accent:s="var(--ks-info)",title:n,onClick:_})=>{const h=e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.03]",style:{color:s},"aria-hidden":"true",children:i}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"text-[17px] font-semibold text-white leading-tight truncate",children:t}),e.jsx("div",{className:"text-[11px] uppercase tracking-wide text-gray-500 mt-0.5",children:r}),v&&e.jsx("div",{className:"text-[11px] text-gray-500 truncate mt-0.5",title:v,children:v})]}),_&&e.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",className:"w-4 h-4 shrink-0 text-gray-600","aria-hidden":"true",children:e.jsx("path",{d:"M9 18l6-6-6-6"})})]}),S=`ks-card flex items-center gap-3 animate-slide-up ${_?"cursor-pointer hover:border-white/25 hover:-translate-y-0.5 transition-all duration-150":""}`;return _?e.jsx("button",{type:"button",onClick:_,title:n,className:`${S} text-left w-full`,children:h}):e.jsx("div",{className:S,title:n,children:h})},H=i=>e.jsx("svg",{viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",className:"w-5 h-5","aria-hidden":"true",children:i}),on=({instanceId:i,section:r})=>{var ye;const t=re(),v=en(),s=Se(),{instance:n,loading:_,error:h,reload:S}=ee(i),c=Pe(a=>a.permissions),P=Y(a=>a.active),T=Y(a=>a.setActive),E=r??P,g=a=>{r||T(a)},[C,b]=p.useState(""),[N,j]=p.useState(!1),[B,A]=p.useState(""),[M,W]=p.useState(!1),[$,F]=p.useState(""),[w,m]=p.useState(!1);U(c,y.MANAGE_INSTANCES,y.INSTANCES_CONTROL,y.INSTANCES_START,y.INSTANCES_STOP,y.INSTANCES_RESTART,y.INSTANCES_KILL,y.INSTANCES_REINSTALL,y.INSTANCES_SUSPEND);const l=U(c,y.MANAGE_INSTANCES,y.INSTANCES_CONTROL,y.INSTANCES_REINSTALL),u=U(c,y.MANAGE_INSTANCES,y.INSTANCES_EDIT),G=U(c,y.MANAGE_INSTANCES,y.INSTANCES_DELETE),le=c.includes(y.MANAGE_TEMPLATES),oe=c.includes(y.MANAGE_NODES),[ne,de]=p.useState(!1),f=p.useMemo(()=>Z(n==null?void 0:n.config),[n==null?void 0:n.config]),Ce=p.useMemo(()=>Q(n==null?void 0:n.config),[n==null?void 0:n.config]),z=p.useMemo(()=>{const a=ln.filter(o=>o==="details"?f.show_details_tab:o==="monitoring"?f.show_monitoring_tab:o==="manage"?f.show_manage_tab:f.show_activity_tab);return a.length>0?a:["details"]},[f]);p.useEffect(()=>{if(n&&!z.includes(E)){const a=f.default_tab||"details";g(z.includes(a)?a:z[0])}},[n==null?void 0:n.id,z]);const J=(n==null?void 0:n.status)??"",D=J==="running";qe(()=>{S(!0)},5e3),p.useEffect(()=>{n&&b(n.display_name||"")},[n==null?void 0:n.display_name]);const[I,Ae]=p.useState(null),[ce,pe]=p.useState(""),[Le,ue]=p.useState(!1);p.useEffect(()=>{if(E!=="activity"||!Number.isFinite(i))return;let a=!1;return ue(!0),pe(""),He(i,100).then(o=>{a||Ae(Array.isArray(o)?o:[])}).catch(o=>{var ke;if(a)return;const x=(ke=o==null?void 0:o.response)==null?void 0:ke.data,ze=typeof x=="string"?x:x&&typeof x.error=="string"?x.error:"";pe(ze||(o==null?void 0:o.message)||"Failed to load activity")}).finally(()=>{a||ue(!1)}),()=>{a=!0}},[E,i]);const{latest:d,history:R}=Ue(i,D),Ie=p.useMemo(()=>R.filter(a=>a.cpu!==null).map(a=>({t:a.t,v:a.cpu})),[R]),Oe=p.useMemo(()=>R.filter(a=>a.ramPct!==null).map(a=>({t:a.t,v:a.ramPct})),[R]),fe=p.useMemo(()=>R.filter(a=>a.cpu!==null).map(a=>a.cpu),[R]),me=p.useMemo(()=>R.filter(a=>a.ramPct!==null).map(a=>a.ramPct),[R]),k={memUsed:(d==null?void 0:d.memUsed)??null,memTotal:(d==null?void 0:d.memTotal)??null,diskUsed:(d==null?void 0:d.diskUsed)??null,diskTotal:(d==null?void 0:d.diskTotal)??null},he=an[J]||"bg-gray-500",xe=sn[J]||J||"—",ve=p.useMemo(()=>z.map(a=>{const o=rn[a];return a==="details"?{id:a,label:o.label,hint:"Facts & timestamps",icon:o.icon,accent:"#38bdf8",marker:{kind:"dot",className:he,title:`Status: ${xe}`}}:a==="monitoring"?{id:a,label:o.label,hint:D?"Streaming live":"CPU · RAM · disk",icon:o.icon,accent:"#34d399",marker:D?{kind:"pulse",title:(d==null?void 0:d.cpu)!==null&&(d==null?void 0:d.cpu)!==void 0?`CPU ${te(d.cpu)} (live)`:"Live"}:void 0}:a==="activity"?{id:a,label:o.label,hint:"Audit trail",icon:o.icon,accent:"#a78bfa",marker:I!==null?{kind:"badge",text:I.length,title:`${I.length} recorded event${I.length===1?"":"s"}`}:void 0}:{id:a,label:o.label,hint:"Rename · reinstall · destroy",icon:o.icon,accent:"#fbbf24",marker:void 0}}),[z,he,xe,D,d,I]);if(p.useEffect(()=>(Y.getState().setSections(ve),()=>{Y.getState().reset()}),[ve]),_)return e.jsxs("div",{className:"glass-card rounded-xl flex items-center gap-4 animate-pulse",children:[e.jsx("div",{className:"w-9 h-9 rounded-lg bg-neutral-800 shrink-0"}),e.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})]});if(!n||h)return e.jsx(Ee,{variant:"not-found",title:"Instance not found",description:h&&h!=="Instance not found"&&h!=="Instance not found."?h:void 0,backLabel:"Back to instances",onBack:()=>t("/instances")});if((ye=v.state)!=null&&ye.fromMore){const a=je(f.more_page,Ce);if(a&&a!=="overview")return e.jsx(se,{to:`/instances/${i}/${a}`,replace:!0})}const ge=n.display_name||n.name,be=(d==null?void 0:d.diskPct)??0,Fe=async()=>{var a;if(!(!u||!f.allow_rename||N)){j(!0),A("");try{await Ke(i,{display_name:C.trim(),icon:n.icon||"",color:n.color||""}),await S(!0),A("Display name saved.")}catch(o){A(((a=o==null?void 0:o.response)==null?void 0:a.data)||(o==null?void 0:o.message)||"Failed to rename")}finally{j(!1)}}},Re=async()=>{var o;if(!(!l||!f.allow_reinstall||M||!await s({title:"Reinstall instance",message:`Wipe "${ge}" and redeploy it from the stored spec? ALL data inside the workload will be lost.`,tone:"danger",confirmLabel:"Reinstall"}))){W(!0),F("");try{await Ve(i),await S(!0),F("Reinstall started — the instance is redeploying.")}catch(x){F(((o=x==null?void 0:x.response)==null?void 0:o.data)||(x==null?void 0:x.message)||"Failed to reinstall")}finally{W(!1)}}},Be=async()=>{var o;if(!(!G||!f.allow_destroy||w||!await s({title:"Destroy instance",message:`Destroy "${ge}"? This runs driver destroy on the edge and removes the row.`,tone:"danger",confirmLabel:"Destroy"}))){m(!0);try{await We(i),t("/instances")}catch(x){m(!1),F(((o=x==null?void 0:x.response)==null?void 0:o.data)||(x==null?void 0:x.message)||"Failed to destroy instance")}}},Me=async()=>{var o;const a=n.external_id||"";if(!(!a||!f.allow_external_id_copy))try{if((o=navigator.clipboard)!=null&&o.writeText)await navigator.clipboard.writeText(a);else{const x=document.createElement("textarea");x.value=a,x.style.position="fixed",x.style.opacity="0",document.body.appendChild(x),x.select(),document.execCommand("copy"),document.body.removeChild(x)}de(!0),window.setTimeout(()=>de(!1),1500)}catch{}};return e.jsxs("div",{className:"space-y-4 animate-fade-in",children:[$&&e.jsx("div",{className:"glass-card rounded-xl text-[13px] text-gray-300",children:e.jsx("span",{className:"break-words",children:$})}),E==="monitoring"&&f.show_monitoring_tab&&e.jsx(ie,{label:"instance-overview-monitoring",children:D?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-4",children:[e.jsxs("div",{className:"ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up",children:[e.jsx("div",{className:"text-[10px] text-gray-400 uppercase tracking-wide",children:"CPU"}),e.jsx("div",{className:"text-2xl font-semibold leading-none tabular-nums text-sky-300",children:(d==null?void 0:d.cpu)!==null&&(d==null?void 0:d.cpu)!==void 0?te(d.cpu):"—"}),fe.length>1&&e.jsx("div",{className:"-mb-1 -mx-1",children:e.jsx(_e,{values:fe,color:"#7dd3fc"})})]}),e.jsxs("div",{className:"ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up",children:[e.jsx("div",{className:"text-[10px] text-gray-400 uppercase tracking-wide",children:"Memory"}),e.jsx("div",{className:"text-2xl font-semibold leading-none tabular-nums text-emerald-300",children:k.memUsed!==null?O(k.memUsed):"—"}),e.jsx("div",{className:"text-[10px] text-gray-500 font-mono",children:k.memUsed!==null&&k.memTotal!==null?`${O(k.memUsed)} / ${O(k.memTotal)}`:"unavailable"}),me.length>1&&e.jsx("div",{className:"-mb-1 -mx-1",children:e.jsx(_e,{values:me,color:"#6ee7b7"})})]}),e.jsxs("div",{className:"ks-stat-card rounded-xl flex flex-col gap-1 animate-slide-up",children:[e.jsx("div",{className:"text-[10px] text-gray-400 uppercase tracking-wide",children:"Disk"}),e.jsx("div",{className:"text-2xl font-semibold leading-none tabular-nums text-amber-300",children:k.diskUsed!==null?O(k.diskUsed):"—"}),e.jsx("div",{className:"text-[10px] text-gray-500 font-mono",children:k.diskUsed!==null&&k.diskTotal!==null?`${O(k.diskUsed)} / ${O(k.diskTotal)}`:"unavailable"})]})]}),e.jsxs("div",{className:"grid grid-cols-1 xl:grid-cols-3 gap-4",children:[e.jsxs("div",{className:"glass-card rounded-xl",children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"CPU"}),e.jsx("p",{className:"text-[11px] text-gray-500",children:"Live usage · warning at 80%"})]}),e.jsx("span",{className:"text-[10px] text-gray-500 font-mono",children:(d==null?void 0:d.cpu)!==null&&(d==null?void 0:d.cpu)!==void 0?te(d.cpu):"—"})]}),e.jsx(we,{samples:Ie,max:100,color:"#7dd3fc",unit:"%",label:"CPU %",threshold:80,heightClass:"h-48"})]}),e.jsxs("div",{className:"glass-card rounded-xl",children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Memory"}),e.jsx("p",{className:"text-[11px] text-gray-500",children:"Live usage · warning at 85%"})]}),e.jsx("span",{className:"text-[10px] text-gray-500 font-mono",children:k.memUsed!==null?O(k.memUsed):"—"})]}),e.jsx(we,{samples:Oe,max:100,color:"#6ee7b7",unit:"%",label:"MEM %",threshold:85,heightClass:"h-48"})]}),e.jsxs("div",{className:"glass-card rounded-xl flex flex-col items-center justify-center p-4",children:[e.jsx("h3",{className:"text-sm font-semibold text-white self-start mb-2",children:"Disk"}),e.jsx(Qe,{pct:Math.min(100,Math.max(0,be)),color:"#fcd34d",label:`${be.toFixed(1)}%`,sub:k.diskUsed!==null&&k.diskTotal!==null?`${O(k.diskUsed)} / ${O(k.diskTotal)}`:"unavailable",warnAt:80,dangerAt:92,size:150})]})]})]}):e.jsx("div",{className:"glass-card rounded-xl text-center text-gray-400",children:e.jsx("p",{className:"text-sm",children:"Start the instance to stream live CPU / RAM / disk graphs."})})}),E==="details"&&f.show_details_tab&&e.jsxs("div",{className:"grid grid-cols-2 xl:grid-cols-4 gap-3",children:[e.jsx(X,{label:"Container",value:e.jsx("span",{className:"ks-mono",children:n.name}),hint:"edge workload name",accent:"#a78bfa",title:n.name,icon:H(e.jsxs(e.Fragment,{children:[e.jsx("path",{d:"M20 12l-8 8-9-9V4h7z"}),e.jsx("circle",{cx:"7.5",cy:"7.5",r:"1"})]}))}),e.jsx(X,{label:"Node",value:n.node_name||`#${n.node_id??"?"}`,hint:"hosting edge",accent:"var(--ks-ok)",title:oe&&f.allow_node_link?`Open node ${n.node_name||n.node_id}`:`Node: ${n.node_name||n.node_id}`,onClick:oe&&f.allow_node_link&&Number.isFinite(n.node_id)?()=>t(`/node/${n.node_id}`):void 0,icon:H(e.jsxs(e.Fragment,{children:[e.jsx("rect",{x:"2",y:"3",width:"20",height:"6",rx:"2"}),e.jsx("rect",{x:"2",y:"13",width:"20",height:"8",rx:"2"}),e.jsx("line",{x1:"6",y1:"6",x2:"6.01",y2:"6"}),e.jsx("line",{x1:"6",y1:"17",x2:"6.01",y2:"17"})]}))}),e.jsx(X,{label:"Template",value:n.template_name||"deleted",hint:"deployed from",accent:"#c4b5fd",title:le&&f.allow_template_link&&n.template_id?`Open template ${n.template_name}`:`Template: ${n.template_name||"deleted"}`,onClick:le&&f.allow_template_link&&n.template_id?()=>t(`/template/${n.template_id}`):void 0,icon:H(e.jsxs(e.Fragment,{children:[e.jsx("rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}),e.jsx("line",{x1:"3",y1:"9",x2:"21",y2:"9"}),e.jsx("line",{x1:"9",y1:"21",x2:"9",y2:"9"})]}))}),e.jsx(X,{label:"External ID",value:e.jsx("span",{className:"ks-mono",children:ne?"Copied!":n.external_id||"—"}),hint:n.external_id?ne?"copied to clipboard":f.allow_external_id_copy?"driver-side ID — click to copy":"driver-side ID":"driver-side ID",accent:"var(--ks-faint)",title:n.external_id?ne?"Copied!":f.allow_external_id_copy?`Click to copy: ${n.external_id}`:n.external_id:"No external ID yet",onClick:n.external_id&&f.allow_external_id_copy?()=>void Me():void 0,icon:H(e.jsxs(e.Fragment,{children:[e.jsx("line",{x1:"4",y1:"9",x2:"20",y2:"9"}),e.jsx("line",{x1:"4",y1:"15",x2:"20",y2:"15"}),e.jsx("line",{x1:"10",y1:"3",x2:"8",y2:"21"}),e.jsx("line",{x1:"16",y1:"3",x2:"14",y2:"21"})]}))}),e.jsxs("div",{className:"ks-card flex items-center gap-3 col-span-2 animate-slide-up",title:"Lifecycle timestamps",children:[e.jsx("div",{className:"shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.03]",style:{color:"var(--ks-info)"},"aria-hidden":"true",children:H(e.jsxs(e.Fragment,{children:[e.jsx("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2"}),e.jsx("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),e.jsx("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),e.jsx("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]}))}),e.jsxs("div",{className:"min-w-0 flex-1 flex items-stretch gap-3",children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"ks-mono text-[15px] font-semibold text-white leading-tight truncate",title:q(n.created_at),children:q(n.created_at)}),e.jsx("div",{className:"text-[11px] uppercase tracking-wide text-gray-500 mt-0.5",children:"Created"})]}),e.jsx("div",{className:"w-px shrink-0 bg-white/10","aria-hidden":"true"}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"ks-mono text-[15px] font-semibold text-white leading-tight truncate",title:q(n.updated_at),children:q(n.updated_at)}),e.jsx("div",{className:"text-[11px] uppercase tracking-wide text-gray-500 mt-0.5",children:"Updated"})]})]})]})]}),E==="manage"&&f.show_manage_tab&&e.jsxs("div",{className:"space-y-4",children:[f.allow_rename&&e.jsxs("div",{className:"ks-card",children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Rename"}),e.jsxs("p",{className:"text-xs text-gray-500 mt-1 mb-3",children:["Changes the display name shown on cards and titles. The container name (",e.jsx("span",{className:"ks-mono",children:n.name}),") on the edge never changes."]}),u?e.jsxs("div",{className:"flex flex-col sm:flex-row gap-2",children:[e.jsx("input",{value:C,onChange:a=>b(a.target.value),maxLength:128,placeholder:n.name,"aria-label":"Display name",className:"ks-input flex-1"}),e.jsx("button",{type:"button",onClick:Fe,disabled:N,className:"ks-btn-form disabled:opacity-40 disabled:cursor-not-allowed",children:N?"Saving…":"Save name"})]}):e.jsx("p",{className:"text-xs text-gray-500",children:"You need instance edit permission to rename."}),B&&e.jsx("p",{className:"text-xs text-gray-400 mt-2",children:B})]}),u&&f.allow_edit_advanced&&e.jsxs("div",{className:"ks-card",children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Advanced config"}),e.jsx("p",{className:"text-xs text-gray-500 mt-1 mb-3",children:"Edit ports, env, volumes and other driver options for this instance."}),e.jsx("button",{type:"button",onClick:()=>t(`/instance/${i}/edit`),className:"ks-btn-form",children:"Edit advanced config"})]}),(f.allow_reinstall||f.allow_destroy)&&e.jsxs("div",{className:"ks-card border-red-500/20",children:[e.jsx("h3",{className:"text-sm font-semibold text-red-300",children:"Danger zone"}),e.jsx("p",{className:"text-xs text-gray-500 mt-1 mb-3",children:"Destructive actions. Reinstall wipes the workload and redeploys it from the stored spec; destroy removes it from the edge and the panel."}),l||G?e.jsxs("div",{className:"flex flex-col sm:flex-row gap-2",children:[f.allow_reinstall&&l&&e.jsx("button",{type:"button",onClick:()=>void Re(),disabled:M||w,className:"ks-btn-form border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed",children:M?"Reinstalling…":"Reinstall"}),f.allow_destroy&&G&&e.jsx("button",{type:"button",onClick:()=>void Be(),disabled:M||w,className:"ks-btn-form border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed",children:w?"Destroying…":"Destroy"})]}):e.jsx("p",{className:"text-xs text-gray-500",children:"You need instance control permission to reinstall, or delete permission to destroy."})]}),!f.allow_rename&&!f.allow_edit_advanced&&!f.allow_reinstall&&!f.allow_destroy&&e.jsx("div",{className:"ks-card",children:e.jsx("p",{className:"text-xs text-gray-500",children:"All manage actions are disabled for this template."})})]}),E==="activity"&&f.show_activity_tab&&e.jsxs("div",{className:"ks-card",children:[e.jsx("h3",{className:"text-sm font-semibold text-white",children:"Activity"}),e.jsx("p",{className:"text-xs text-gray-500 mt-1 mb-3",children:"Audit trail for this instance only."}),Le&&!I?e.jsx("div",{className:"space-y-2 animate-pulse","aria-hidden":"true",children:[0,1,2].map(a=>e.jsx("div",{className:"h-10 rounded bg-neutral-800"},a))}):ce?e.jsx("p",{className:"text-[13px] text-gray-400",children:ce}):I&&I.length>0?e.jsx("ul",{className:"max-h-96 overflow-y-auto divide-y divide-white/5",children:I.map(a=>e.jsxs("li",{className:"py-2 flex items-start gap-3",children:[e.jsx("span",{className:"shrink-0 text-[11px] text-gray-500 tabular-nums pt-0.5",children:q(a.created_at)}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsxs("p",{className:"text-[13px] text-gray-200",children:[e.jsx("span",{className:"font-medium capitalize",children:a.action}),e.jsxs("span",{className:"text-gray-500",children:[" · ",a.actor||"system"]})]}),e.jsx("p",{className:"text-xs text-gray-400 break-words mt-0.5",children:a.detail})]})]},a.id))}):e.jsx("p",{className:"text-[13px] text-gray-500",children:"No recorded events for this instance yet."})]})]})},dn=`# Terminal — instance page (YAML authoring format).
# Converted from terminal.json; edit this file, not JSON.
# Multiline content uses \`|\` literal blocks (raw HTML/JS, no escaping);
# actions/sub_pages/components/configure are native YAML lists.
# See instance_pages/README.md for the field reference.
name: Terminal
slug: terminal
kind: custom
category: console
type: console
description: 'Live terminal consoles for this instance: shell panes, bound action/install/startup terminals, shortcuts, copy/download and display settings.'
content_type: html
content_html: |-
  {{component:ks_theme_head}}<style id="ks-terminal-pills">/* Terminal pills — panel PageActionsPill / PageTabsPill parity.
  Paint comes from Theme Studio Pill vars (--ks-pill-*) injected by the host;
  these fallbacks reproduce the historic geometry when no theme sets them. */
  .ks-actions-pill,.ks-tabs-pill,.ks-form-actions-pill{--ks-card-padding:6px}
  .ks-pill-anim{transition:transform .25s ease,opacity .25s ease}
  .ks-pill-toggle{--ks-tab-px:var(--ks-pill-tab-px,10px);--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px)}
  .ks-pill-content{transition:max-width .3s ease,opacity .3s ease,transform .3s ease}
  .ks-tabs-pill .ks-pill-content{transition:max-height .3s ease,opacity .3s ease,transform .3s ease}
  </style><style id="ks-terminal-bleed">/* Terminal full-bleed: match react pages (mc-properties) — iframe body
  frame removed so there is no extra gap between instance context and page
  body. html body beats the bake rule by specificity (no !important needed);
  .ks-page stays flush (0) like .ks-react-page. */
  html body{padding:0;margin:0}
  .ks-page{padding:0;margin:0}
  </style><div class="ks-page">
    <div id="ks-stopped" style="display:none"></div>
    <div id="ks-live">
      <div id="ks-pill" class="ks-card ks-pill-anim ks-actions-pill" role="toolbar" aria-label="Terminal actions" style="position:fixed;top:12px;right:12px;z-index:40;display:flex;align-items:center;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px"></div>
      <div id="ks-panes" style="display:flex;flex-direction:column;gap:12px"></div>
      <!-- Tabs pill (bottom): panel PageTabsPill parity — ks-card ks-pill-anim ks-tabs-pill shell,
           ks-pill-content vertical list (max-h 50vh), ks-tab ks-pill-toggle with ^/v,
           manual-only (starts collapsed), scroll/outside/Escape closes, select closes. -->
      <nav id="ks-ptabs-wrap" class="ks-tabs-pill-wrap" aria-label="Terminals" style="position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;justify-content:flex-start;pointer-events:none">
        <div style="pointer-events:auto;max-width:100%">
          <div id="ks-ptabs-shell" class="ks-card ks-pill-anim ks-tabs-pill ks-pill-collapsed" role="navigation" aria-label="Terminals" style="display:flex;flex-direction:column;align-items:stretch;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);max-width:calc(100vw - 24px);--ks-card-padding:6px">
            <div id="ks-ptabs" role="tablist" aria-label="Terminals" class="ks-pill-content" style="display:flex;flex-direction:column;gap:4px;width:100%;min-width:0;max-height:0;opacity:0;transform:translateY(8px);pointer-events:none;visibility:hidden;overflow:hidden;padding-top:0;padding-bottom:0;margin-top:0;margin-bottom:0;max-height:50vh;overflow-y:auto" aria-hidden="true"></div>
            <button type="button" id="ks-ptabs-toggle" class="ks-tab ks-pill-toggle" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:100%;--ks-tab-px:4px;--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px)" aria-label="Show tabs — Terminal" aria-expanded="false" title="Show tabs"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg></button>
          </div>
        </div>
      </nav>
      <div aria-hidden="true" class="ks-tabs-pill-spacer" style="height:72px"></div>
      <div id="ks-dialogs"></div>
    </div>
  </div>
  <script>
  (function () {
    'use strict';
    var sdk = null;

    // ---- tiny helpers ---------------------------------------------------------
    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function normTid(v) {
      return String(v == null ? '' : v).trim().toLowerCase().replace(/\\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
    }
    function b64ToBytes(b64) {
      try {
        var bin = atob(b64); var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch (e) { return new Uint8Array(0); }
    }
    function strToB64(s) {
      try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return ''; }
    }
    function bytesToStr(bytes) {
      var out = '';
      for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
    }
    function toast(m, t) { try { sdk.toast(m, t || 'info'); } catch (e) {} }
    function ask(m) {
      try {
        if (sdk && typeof sdk.confirm === 'function') return sdk.confirm(m);
      } catch (e) {}
      return Promise.resolve(window.confirm(m));
    }

    // ---- page config (Configure vars: defaults overlaid by per-template values) --
    var CFG_DEFAULTS = {
      allow_multi: 'true',
      max_terminals: '4',
      default_stop_on_exit: 'true',
      default_allow_input: 'all',
      default_timeout_s: '',
      input_mode: 'direct',
      prompt_style: 'none',
      shortcuts_enabled: 'false',
      shortcuts: '[]',
      default_terminals: '[]'
    };
    function cfgGet(name) {
      try {
        var live = (typeof window.KS_PAGE_CONFIG === 'object' && window.KS_PAGE_CONFIG) || {};
        if (live[name] !== undefined && live[name] !== null && String(live[name]) !== '') return String(live[name]);
      } catch (e) {}
      return CFG_DEFAULTS[name] || '';
    }
    function cfgBool(name, dflt) {
      var v = cfgGet(name);
      if (v === '') return dflt;
      return v === 'true' || v === '1' || v === 'on';
    }
    function cfgJSON(name) {
      try {
        var v = cfgGet(name);
        if (!v || !v.trim()) return [];
        var a = JSON.parse(v);
        return Array.isArray(a) ? a : [];
      } catch (e) { return []; }
    }
    function cfgHash() {
      return ['allow_multi', 'max_terminals', 'default_stop_on_exit', 'default_allow_input', 'default_timeout_s', 'input_mode', 'prompt_style', 'shortcuts_enabled', 'shortcuts', 'default_terminals'].map(cfgGet).join('|');
    }
    function saveSession() {
      try {
        var data = {
          panes: panes.slice(0, 10).map(function (p) { return { name: String(p.name || '').slice(0, 64), tid: normTid(p.tid) }; }),
          active: Math.max(0, panes.indexOf(activePane()))
        };
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      } catch (e) {}
    }
    function loadSession() {
      try {
        var raw = window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        var d = JSON.parse(raw);
        if (!d || !Array.isArray(d.panes) || !d.panes.length) return null;
        var out = [];
        for (var i = 0; i < d.panes.length && out.length < 10; i++) {
          var r = d.panes[i] || {};
          var nm = String(r.name || '').trim().slice(0, 64);
          var id = normTid(r.id !== undefined ? r.id : r.tid);
          if (nm !== '' || id !== '') out.push({ name: nm, tid: id });
        }
        if (!out.length) return null;
        return { panes: out, active: Math.max(0, Math.min(out.length - 1, Number(d.active) || 0)) };
      } catch (e) { return null; }
    }
    function enforceLimits() {
      var maxN = parseInt(cfgGet('max_terminals').trim(), 10);
      if (Number.isFinite(maxN) && maxN > 0 && panes.length > maxN) {
        var keep = activePane();
        while (panes.length > maxN) {
          var victim = null;
          for (var i = panes.length - 1; i >= 0; i--) { if (panes[i] !== keep) { victim = panes[i]; break; } }
          if (!victim) victim = panes[panes.length - 1];
          victim.dead = true;
          closePaneWs(victim);
          delete boxTexts[victim.key];
          panes.splice(panes.indexOf(victim), 1);
        }
      }
      if (!cfgBool('allow_multi', true) && panes.length > 1) {
        var ap = activePane() || panes[0];
        for (var j = panes.length - 1; j >= 0; j--) {
          if (panes[j] !== ap) { panes[j].dead = true; closePaneWs(panes[j]); delete boxTexts[panes[j].key]; panes.splice(j, 1); }
        }
      }
      if (!activePane() && panes.length) activeKey = panes[0].key;
    }

    // ---- shortcut placeholder vars: {{VAR}} / \${VAR} / $(VAR) -------------------
    var SHORTCUT_VAR_RE = /\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}|\\$\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\}|\\$\\(\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\)/g;
    function extractShortcutVars(cmd) {
      var out = [];
      SHORTCUT_VAR_RE.lastIndex = 0;
      var m;
      while ((m = SHORTCUT_VAR_RE.exec(String(cmd || ''))) !== null) {
        var n = m[1] || m[2] || m[3];
        if (n && out.indexOf(n) < 0) out.push(n);
      }
      return out;
    }
    function resolveShortcutCommand(cmd, vals) {
      SHORTCUT_VAR_RE.lastIndex = 0;
      return String(cmd || '').replace(SHORTCUT_VAR_RE, function (match, a, b, c) {
        var v = vals[a || b || c];
        return (typeof v === 'string' && v !== '') ? v : match;
      });
    }

    // ---- ANSI -> HTML (16-color SGR, erase-line, clear-screen) -------------------
    var PALETTE = ['#3a3a3a', '#f48771', '#89e789', '#ffea7c', '#75beff', '#c586c0', '#79d7da', '#e8e8e8',
      '#6e6b6b', '#f48771', '#89e789', '#ffea7c', '#75beff', '#c586c0', '#79d7da', '#ffffff'];
    function ansiToHtml(text) {
      var parts = String(text).split(/\\x1b\\[/);
      var out = esc(parts[0]);
      var spanOpen = false;
      for (var i = 1; i < parts.length; i++) {
        var seg = parts[i];
        var m = seg.match(/^([0-9;]*)([A-Za-z])/);
        if (!m) {
          var fa = seg.match(/[\\x40-\\x7e]/);
          out += esc(fa ? seg.slice(seg.indexOf(fa[0]) + 1) : '');
          continue;
        }
        var code = m[2];
        var nums = m[1].split(';').filter(Boolean).map(Number);
        if (code === 'm') {
          var open = '';
          var reset = false;
          if (nums.length === 0) nums = [0];
          for (var k = 0; k < nums.length; k++) {
            var n = nums[k];
            if (n === 0) { reset = true; }
            else if (n === 1) open += 'font-weight:600;';
            else if (n === 3) open += 'font-style:italic;';
            else if (n === 4) open += 'text-decoration:underline;';
            else if (n >= 30 && n <= 37) open += 'color:' + PALETTE[n - 30] + ';';
            else if (n === 39) open += 'color:var(--ks-secondary,#d4d4d4)';
            else if (n >= 90 && n <= 97) open += 'color:' + PALETTE[n - 90 + 8] + ';';
          }
          if (reset && spanOpen) { out += '</span>'; spanOpen = false; }
          if (open) {
            if (spanOpen) out += '</span>';
            out += '<span style="' + open + '">';
            spanOpen = true;
          }
        } else if (code === 'J' && (nums[0] === 2 || m[1] === '')) {
          if (spanOpen) { out += '</span>'; spanOpen = false; }
          out = '';
        }
        out += esc(seg.slice(m[0].length)).replace(/<\\/?span[^>]*>/g, '');
      }
      if (spanOpen) out += '</span>';
      return out;
    }

    // ---- startup-pane severity tint (display-only, uncolored lines only) --------
    var TINT_ERROR_RE = /error|exception|failed|severe|fatal|unable to|could not|crash/i;
    var TINT_WARN_RE = /warn(ing)?|\\*\\*\\*/i;
    function tintLine(line) {
      if (line.indexOf('\\x1b') >= 0) return line;
      if (TINT_ERROR_RE.test(line)) return '\\x1b[31;1m' + line + '\\x1b[0m';
      if (TINT_WARN_RE.test(line)) return '\\x1b[33;1m' + line + '\\x1b[0m';
      return line;
    }
    // ---- log-stamp strip (display-only): [02:41:03 INFO] style prefixes -------
    var SGR_LEAD_RE = /^((?:\\x1b\\[[0-9;]*m)*)/;
    function hasComplexEscape(line) {
      return line.replace(/\\x1b\\[[0-9;]*m/g, '').indexOf('\\x1b') >= 0;
    }
    var LOG_TS_RE = /^\\s*\\[\\d{1,2}:\\d{2}:\\d{2}(?:\\.\\d+)?\\s*[A-Za-z]*\\]\\s*:?\\s*/;
    var LOG_LVL_RE = /^\\s*\\[[^\\]\\n]*?(?:INFO|WARN(?:ING)?|ERROR|DEBUG|TRACE|FATAL|SEVERE)[^\\]\\n]*?\\]\\s*:?\\s*/i;
    function stripLogPrefix(line) {
      if (!line || hasComplexEscape(line)) return line;
      var lead = (line.match(SGR_LEAD_RE) || ['', ''])[1];
      var rest = lead ? line.slice(lead.length) : line;
      var out = rest;
      for (var i = 0; i < 3; i++) {
        var before = out;
        if (LOG_TS_RE.test(out)) out = out.replace(LOG_TS_RE, '');
        else if (LOG_LVL_RE.test(out)) out = out.replace(LOG_LVL_RE, '');
        else break;
        if (out === before) break;
      }
      return out === rest ? line : lead + out;
    }

    // ---- state ------------------------------------------------------------------
    var panes = [];
    var activeKey = 0;
    var keySeq = 0;
    var boxTexts = {};
    var askFor = null;
    var askVals = {};
    var showAdd = false;
    var draftName = '';
    var draftId = '';
    var pillMsg = '';
    var docMenuWired = false;
    var pillTimer = null;
    // Action-pill collapse parity with PageActionsPill (manual chevron
    // toggle + auto-hide on scroll / outside-tap with idle restore).
    var pillOff = false, pillAutoTimer = null, pillAutoWired = false;
    function pillShow() {
      if (pillAutoTimer) { window.clearTimeout(pillAutoTimer); pillAutoTimer = null; }
    }
    // Chevron glyphs for the live toggle (component tokens resolve at bake
    // time; the toggle swaps them on the EXISTING button so nothing rebuilds).
    var CHEV_L = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
    var CHEV_R = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    // Live collapse: update the EXISTING pill nodes in place so the baked
    // 300ms ks-pill-anim / ks-pill-content transitions can run. A full
    // renderPill() rebuild would recreate the nodes and snap instantly.
    function setPillOff(off) {
      pillOff = off;
      var host = el('ks-pill');
      if (!host) return;
      if (off) host.classList.add('ks-pill-collapsed');
      else host.classList.remove('ks-pill-collapsed');
      var c = host.querySelector('.ks-pill-content');
      if (c) {
        if (off) { c.style.maxWidth = '0'; c.style.opacity = '0'; c.style.transform = 'translateX(8px)'; c.style.pointerEvents = 'none'; c.style.visibility = 'hidden'; c.style.overflow = 'hidden'; }
        else { c.style.maxWidth = '800px'; c.style.opacity = '1'; c.style.transform = 'none'; c.style.pointerEvents = 'auto'; c.style.visibility = 'visible'; c.style.overflow = 'visible'; }
        c.setAttribute('aria-hidden', off ? 'true' : 'false');
      }
      var tg = document.getElementById('ks-pill-toggle');
      if (tg) {
        tg.setAttribute('aria-label', off ? 'Show actions' : 'Hide actions');
        tg.setAttribute('aria-expanded', off ? 'false' : 'true');
        tg.setAttribute('title', off ? 'Show actions' : 'Hide actions');
        tg.style.setProperty('--ks-tab-px', off ? '4px' : 'var(--ks-pill-tab-px,10px)');
        tg.innerHTML = off ? CHEV_L : CHEV_R;
      }
    }
    // Tabs-pill (bottom) parity with PageTabsPill (manual-only dropdown).
    // Starts CLOSED (phone pattern: ^ shows, v hides), never auto-opens.
    // Scroll / outside-tap / Escape closes; selecting a tab closes too.
    var phonePillOpen = false, phonePillWired = false;
    var PHONE_CHEV_UP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
    var PHONE_CHEV_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    function setPhonePillOpen(open) {
      phonePillOpen = !!open;
      var shell = el('ks-ptabs-shell');
      if (!shell) return;
      if (phonePillOpen) shell.classList.remove('ks-pill-collapsed');
      else shell.classList.add('ks-pill-collapsed');
      var c = shell.querySelector('.ks-pill-content');
      var tg = document.getElementById('ks-ptabs-toggle');
      var ap = activePane();
      var activeLabel = ap ? paneLabel(ap, panes.indexOf(ap)) : 'Terminal';
      // Hidden transform mirrors PageTabsPill slide: translateY(8px) when slide, none when fade/scale.
      var hiddenTransform = 'translateY(8px)';
      if (c) {
        if (!phonePillOpen) {
          c.style.maxHeight = '0';
          c.style.opacity = '0';
          c.style.transform = hiddenTransform;
          c.style.pointerEvents = 'none';
          c.style.visibility = 'hidden';
          c.style.overflow = 'hidden';
          c.style.paddingTop = '0';
          c.style.paddingBottom = '0';
          c.style.marginTop = '0';
          c.style.marginBottom = '0';
        } else {
          c.style.maxHeight = '50vh';
          c.style.opacity = '1';
          c.style.transform = 'none';
          c.style.pointerEvents = 'auto';
          c.style.visibility = 'visible';
          c.style.overflowY = 'auto';
          c.style.paddingTop = '';
          c.style.paddingBottom = '';
          c.style.marginTop = '';
          c.style.marginBottom = '';
        }
        c.setAttribute('aria-hidden', phonePillOpen ? 'false' : 'true');
      }
      if (tg) {
        tg.setAttribute('aria-label', phonePillOpen ? 'Hide tabs — Terminals' : ('Show tabs' + (activeLabel ? ' — ' + activeLabel : '')));
        tg.setAttribute('aria-expanded', phonePillOpen ? 'true' : 'false');
        tg.setAttribute('title', phonePillOpen ? 'Hide tabs — Terminals' : ('Show tabs' + (activeLabel ? ' (' + activeLabel + ')' : '')));
        tg.style.setProperty('--ks-tab-px', phonePillOpen ? 'var(--ks-pill-tab-px,10px)' : '4px');
        tg.innerHTML = phonePillOpen ? PHONE_CHEV_DOWN : PHONE_CHEV_UP;
      }
    }
    function wirePhonePill() {
      if (phonePillWired) return;
      phonePillWired = true;
      var shell = el('ks-ptabs-shell');
      var tg = document.getElementById('ks-ptabs-toggle');
      if (tg) tg.addEventListener('click', function () { setPhonePillOpen(!phonePillOpen); });
      // Scroll / outside-tap / Escape closes — never auto-opens (PageTabsPill parity).
      document.addEventListener('scroll', function () { if (phonePillOpen) setPhonePillOpen(false); }, true);
      document.addEventListener('pointerdown', function (ev) {
        var s = el('ks-ptabs-shell');
        if (!s || !phonePillOpen) return;
        var path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
        var inside = path.indexOf(s) >= 0 || (ev.target && s.contains(ev.target));
        if (!inside) setPhonePillOpen(false);
      });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && phonePillOpen) setPhonePillOpen(false); });
      // Ensure initial collapsed visuals are correct after first render.
      setPhonePillOpen(false);
    }
    var liveStatus = '';
    var liveActions = [];
    var liveInstall = { state: '', kind: '', actionId: '' };
    var pollTimer = null;
    var SESSION_KEY = 'ks.terminal.session.v1';
    var lastCfgHash = '';
    var FONT_KEY = 'ks.terminal.fontSize';
    var PREFIX_KEY = 'ks.terminal.showLogPrefix';
    var fontSize = 13;
    var showPrefix = true;
    try {
      var fs0 = Math.floor(Number(window.localStorage.getItem(FONT_KEY)));
      fontSize = Number.isFinite(fs0) ? Math.max(11, Math.min(18, fs0)) : 13;
      var px0 = window.localStorage.getItem(PREFIX_KEY);
      showPrefix = !(px0 === '0' || String(px0).toLowerCase() === 'false' || String(px0).toLowerCase() === 'off');
    } catch (e) {}

    function flashPill(msg) {
      pillMsg = msg;
      if (pillTimer) window.clearTimeout(pillTimer);
      pillTimer = window.setTimeout(function () { pillMsg = ''; renderPill(); }, 1600);
      renderPill();
    }

    function actions() { return liveActions; }
    function installTerminalId() {
      try { return normTid(((sdk.instance.config || {}).install_terminal_id) || ''); } catch (e) { return ''; }
    }
    function startupTerminalId() {
      try {
        var adv = (sdk.instance.config || {}).advanced;
        return normTid((adv && adv.startup_terminal_id) || '');
      } catch (e) { return ''; }
    }
    function bindingOf(pane) {
      var tid = normTid(pane.tid);
      if (!tid) return { kind: 'shell' };
      var list = actions();
      var matched = null;
      for (var i = 0; i < list.length; i++) {
        if (normTid(list[i] && list[i].terminal_id) === tid) { matched = list[i]; break; }
      }
      if (matched && liveInstall.state === 'running' && liveInstall.actionId === matched.id) {
        return { kind: 'workflow', action: matched };
      }
      var iid = installTerminalId();
      if (iid && tid === iid && liveInstall.state === 'running' && liveInstall.kind !== 'action') {
        return { kind: 'workflow', install: true };
      }
      var sid = startupTerminalId();
      if (sid && tid === sid) return { kind: 'startup' };
      return { kind: 'shell', idle: !!(matched || (iid && tid === iid)) };
    }
    function paneLabel(pane, idx) {
      if (pane.name && pane.name.trim() !== '') return pane.name.trim();
      var tid = normTid(pane.tid);
      return tid !== '' ? tid : ('shell ' + (idx + 1));
    }
    function tabDot(pane) {
      var b = bindingOf(pane);
      if (b.kind === 'workflow') return { dot: 'background:var(--ks-ok)', label: 'running' };
      if (b.kind === 'startup') return { dot: 'background:var(--ks-info)', label: 'startup' };
      if (b.idle) return { dot: 'background:var(--ks-warn)', label: 'idle' };
      return { dot: 'background:var(--ks-muted)', label: 'shell' };
    }
    function activePane() {
      for (var i = 0; i < panes.length; i++) if (panes[i].key === activeKey) return panes[i];
      return panes[0] || null;
    }
    function paneText(pane) {
      var ls = pane.lines.slice();
      if (pane.cur && pane.cur.trim() !== '') ls.push(ansiToHtml(pane.cur));
      var isBlank = function (h) { return String(h).replace(/<[^>]*>/g, '').replace(/\\u00a0/g, ' ').trim() === ''; };
      while (ls.length && isBlank(ls[ls.length - 1])) ls.pop();
      while (ls.length && isBlank(ls[0])) ls.shift();
      var div = document.createElement('div');
      div.innerHTML = ls.join('\\n').split('<br>').join('\\n');
      return (div.textContent || '').replace(/\\n+$/, '');
    }

    // ---- emulator core (per pane) -------------------------------------------------
    function feed(pane, text) {
      if (pane.pending) { text = pane.pending + text; pane.pending = ''; }
      var i = 0;
      while (i < text.length) {
        var ch = text[i];
        if (ch === '\\r') {
          if (text[i + 1] === '\\n') { commitLine(pane, true); i += 2; continue; }
          commitLine(pane, false); i++; continue;
        }
        if (ch === '\\n') { commitLine(pane, true); i++; continue; }
        if (ch === '\\x1b') {
          var n1 = text[i + 1];
          if (n1 === undefined || n1 === '') { pane.pending = ch; i++; continue; }
          if (n1 === '[') {
            var m = text.slice(i + 2).match(/^([ -?]*)([@-~])/);
            if (!m) { pane.pending = text.slice(i); i = text.length; continue; }
            var seq = m[0];
            var fin = seq.charAt(seq.length - 1);
            if (fin === 'm') pane.cur += '\\x1b[' + seq;
            else if (fin === 'J') {
              var jp = seq.slice(0, -1);
              if (jp === '' || jp === '0' || jp === '2' || jp === '3') clearPane(pane);
            }
            i += 2 + seq.length;
            continue;
          }
          if (n1 === ']') {
            var rest = text.slice(i + 2);
            var bel = rest.indexOf('\\x07');
            if (bel < 0) { pane.pending = text.slice(i); i = text.length; continue; }
            i += 2 + bel + 1;
            continue;
          }
          if (n1 === '(' || n1 === ')' || n1 === '*' || n1 === '+' || n1 === '#') {
            if (i + 2 >= text.length) { pane.pending = text.slice(i); i = text.length; continue; }
            i += 3; continue;
          }
          i += 2;
          continue;
        }
        pane.cur += ch;
        i++;
      }
      paintPane(pane);
    }
    function commitLine(pane, newlineAfter) {
      if (!newlineAfter && pane.cur === '') { pane.overwritable = true; return; }
      var html = pane.cur === '' ? '&nbsp;' : ansiToHtml(pane.cur);
      if (pane.overwritable && pane.lines.length > 0) pane.lines[pane.lines.length - 1] = html;
      else pane.lines.push(html);
      pane.overwritable = !newlineAfter;
      pane.cur = '';
      if (pane.lines.length > 3000) pane.lines.splice(0, pane.lines.length - 3000);
    }
    function clearPane(pane) { pane.lines = []; pane.cur = ''; pane.overwritable = false; pane.pending = ''; paintPane(pane); }
    function feedBytes(pane, bytes) {
      var text = bytesToStr(bytes);
      if (!showPrefix) {
        var parts = text.split('\\n');
        for (var i = 0; i < parts.length; i++) parts[i] = stripLogPrefix(parts[i]);
        text = parts.join('\\n');
      }
      if (pane.ep === 'startup') {
        var ls = text.split('\\n');
        for (var j = 0; j < ls.length; j++) ls[j] = tintLine(ls[j]);
        text = ls.join('\\n');
      }
      feed(pane, text);
    }
    function paintPane(pane) {
      var pre = document.getElementById('pre-' + pane.key);
      if (!pre) return;
      var html = pane.lines.join('<br>');
      if (pane.cur !== '') {
        var live = ansiToHtml(pane.cur);
        if (pane.overwritable && pane.lines.length > 0) {
          var head = pane.lines.slice(0, -1);
          html = (head.length ? head.join('<br>') + '<br>' : '') + live;
        } else {
          html += (html ? '<br>' : '') + live;
        }
      }
      var atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24;
      pre.innerHTML = '<code>' + html + '</code>';
      if (atBottom) pre.scrollTop = pre.scrollHeight;
    }
    function paintAll() {
      for (var i = 0; i < panes.length; i++) paintPane(panes[i]);
    }
    var paintTimer = window.setInterval(function () {
      if (document.hidden) return;
      try {
        var live = document.getElementById('ks-live');
        if (live && live.style.display === 'none') return;
      } catch (e) {}
      paintAll();
    }, 150);
    window.addEventListener('pagehide', function () {
      try { window.clearInterval(paintTimer); } catch (e) {}
      try { if (pollTimer) window.clearInterval(pollTimer); } catch (e2) {}
      for (var i = 0; i < panes.length; i++) closePaneWs(panes[i]);
    });

    // ---- wire ---------------------------------------------------------------------
    function sendStdin(pane, data) {
      try {
        if (pane.ws && pane.ws.readyState === 1) {
          pane.ws.send(JSON.stringify({ type: 'stdin', data: strToB64(data) }));
        }
      } catch (e) {}
    }
    function sendResize(pane) {
      try {
        var pre = document.getElementById('pre-' + pane.key);
        var cols = 80, rows = 24;
        if (pre && pre.clientWidth > 0) {
          var probe = document.createElement('span');
          probe.style.cssText = 'position:absolute;visibility:hidden;font-family:ui-monospace,Menlo,monospace;font-size:' + fontSize + 'px;';
          probe.textContent = 'MMMMMMMMMM';
          document.body.appendChild(probe);
          var w = probe.getBoundingClientRect().width / 10 || 8;
          document.body.removeChild(probe);
          cols = Math.max(20, Math.floor(pre.clientWidth / w));
          rows = Math.max(10, Math.floor(pre.clientHeight / (fontSize * 1.35)));
        }
        if (pane.ws && pane.ws.readyState === 1) {
          pane.ws.send(JSON.stringify({ type: 'resize', cols: cols, rows: rows }));
        }
      } catch (e) {}
    }
    function setPaneState(pane, st, msg) {
      pane.state = st;
      pane.stateMsg = msg || '';
      renderTabs();
    }
    function scheduleReconnect(pane) {
      if (pane.dead) return;
      if (pane.lastOpenAt && Date.now() - pane.lastOpenAt > 3000) pane.attempt = 0;
      pane.attempt = (pane.attempt || 0) + 1;
      var backoff = Math.min(8000, 500 * Math.pow(2, pane.attempt));
      setPaneState(pane, 'reconnecting', 'reconnecting in ' + Math.round(backoff / 1000) + 's');
      feed(pane, '\\r\\n\\x1b[33m● connection dropped — reconnecting in ' + Math.round(backoff / 1000) + 's\\x1b[0m\\r\\n');
      if (pane.timer) window.clearTimeout(pane.timer);
      pane.timer = window.setTimeout(function () { if (!pane.dead) openPane(pane); }, backoff);
    }
    function openPane(pane) {
      closePaneWs(pane);
      setPaneState(pane, 'connecting');
      var b = bindingOf(pane);
      var ep = b.kind === 'startup' ? 'startup' : (b.kind === 'workflow' ? 'workflow' : 'terminal');
      pane.ep = ep;
      var params = {};
      if (normTid(pane.tid) !== '') params.terminal = normTid(pane.tid);
      var to = cfgGet('default_timeout_s').replace(/[^0-9]/g, '');
      if (to !== '' && to !== '0') params.timeout = to;
      var ws;
      try {
        ws = sdk.connectWS(null, ep, params);
      } catch (e) {
        setPaneState(pane, 'error', (e && e.message) || 'failed to open');
        return;
      }
      pane.ws = ws;
      pane.lastOpenAt = 0;
      ws.onopen = function () { pane.lastOpenAt = Date.now(); setPaneState(pane, 'connecting'); };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'ready') {
          pane.attempt = 0;
          setPaneState(pane, 'connected');
          pane.lines = []; pane.cur = ''; paintPane(pane);
          sendResize(pane);
        } else if (msg.type === 'stdout' || msg.type === 'stderr') {
          if (typeof msg.data === 'string') {
            var bytes = b64ToBytes(msg.data);
            if (bytes.length) feedBytes(pane, bytes);
          }
        } else if (msg.type === 'exit') {
          var code = Number(msg.code);
          setPaneState(pane, 'closed');
          feed(pane, '\\r\\n\\x1b[90m● process exited with code ' + (Number.isFinite(code) ? code : '?') + '\\x1b[0m\\r\\n');
          if (cfgBool('default_stop_on_exit', true)) { pane.stoppedExit = true; renderPanes(); }
        } else if (msg.type === 'error') {
          setPaneState(pane, 'error', msg.message || 'error');
          feed(pane, '\\r\\n\\x1b[31m● ' + (msg.message || 'error') + '\\x1b[0m\\r\\n');
          try { if (pane.ws) pane.ws.close(); } catch (e) {}
          pane.ws = null;
          scheduleReconnect(pane);
        }
      };
      ws.onerror = function () { setPaneState(pane, 'error', 'connection failed'); };
      ws.onclose = function () {
        pane.ws = null;
        scheduleReconnect(pane);
      };
    }
    function closePaneWs(pane) {
      try {
        if (pane.timer) window.clearTimeout(pane.timer);
        pane.timer = null;
        if (pane.ws) {
          pane.ws.onclose = null; pane.ws.onerror = null; pane.ws.onmessage = null; pane.ws.onopen = null;
          try { pane.ws.close(); } catch (e) {}
          pane.ws = null;
        }
      } catch (e) {}
    }
    function reconnectPane(pane) {
      pane.attempt = 0;
      pane.stoppedExit = false;
      openPane(pane);
      renderPanes();
    }

    // ---- completed-line relay (workflow panes stream into the running job) ---------
    function paneLine(pane, line) {
      if (line.trim() === '') return;
      var b = bindingOf(pane);
      if (b.kind === 'workflow' && b.action) {
        sdk.fetchPanel('/actions/' + encodeURIComponent(b.action.id) + '/stdin', {
          method: 'POST', body: JSON.stringify({ data: line })
        }).catch(function (e) { toast((e && e.message) || 'failed to send', 'error'); });
      } else if (b.kind === 'workflow' && b.install) {
        sdk.fetchPanel('/install/stdin', {
          method: 'POST', body: JSON.stringify({ data: line })
        }).catch(function (e) { toast((e && e.message) || 'failed to send', 'error'); });
      }
    }
    function paneReadOnly(pane) {
      if (pane.stoppedExit) return true;
      if (cfgGet('input_mode') === 'box') return true;
      var mode = cfgGet('default_allow_input');
      if (mode === 'disabled') return true;
      if (mode === 'allowlist') return normTid(pane.tid) === '';
      return false;
    }
    // programmatic twin of typing a line + Enter (box Send, shortcuts)
    function sendLineToPane(pane, line) {
      if (pane.stoppedExit) { toast('Pane stopped — Refresh to reconnect', 'error'); return; }
      var mode = cfgGet('default_allow_input');
      if (mode === 'disabled') { toast('Input disabled by template', 'error'); return; }
      if (mode === 'allowlist' && normTid(pane.tid) === '') { toast('Input allowed only on bound terminals', 'error'); return; }
      if (line.trim() === '') return;
      echoLocal(pane, line + '\\r');
      sendStdin(pane, line + '\\r');
      paneLine(pane, line);
    }
    function echoLocal(pane, d) {
      if (pane.ep !== 'workflow' && pane.ep !== 'startup') return;
      var out = '';
      for (var i = 0; i < d.length; i++) {
        var ch = d[i];
        if (ch === '\\x1b') {
          var m = d.slice(i + 1).match(/^\\[[ -?]*[@-~]/);
          if (m) i += m[0].length;
          continue;
        }
        if (ch === '\\r' || ch === '\\n') out += '\\r\\n';
        else if (ch === '\\x7f' || ch === '\\b') out += '\\b \\b';
        else if (ch >= ' ' || ch === '\\t') out += ch;
      }
      if (out) feed(pane, out);
    }

    // ---- per-pane input wiring ------------------------------------------------------
    function wirePaneInput(pane) {
      var pre = document.getElementById('pre-' + pane.key);
      var hid = document.getElementById('hid-' + pane.key);
      if (!pre || !hid) return;
      pre.addEventListener('click', function () { try { hid.focus({ preventScroll: true }); } catch (e) { try { hid.focus(); } catch (e2) {} } });
      hid.addEventListener('input', function (ev) {
        if (ev && ev.isComposing) return;
        var v = hid.value;
        if (!v) return;
        hid.value = '';
        if (paneReadOnly(pane)) return;
        var chunk = '';
        for (var i = 0; i < v.length; i++) chunk += v[i] === '\\n' ? '\\r' : v[i];
        echoLocal(pane, chunk);
        sendStdin(pane, chunk);
        for (var j = 0; j < chunk.length; j++) {
          var c = chunk[j];
          if (c === '\\r') { paneLine(pane, pane.lineBuf || ''); pane.lineBuf = ''; }
          else if (c >= ' ' || c === '\\t') pane.lineBuf = (pane.lineBuf || '') + c;
        }
      });
      hid.addEventListener('keydown', function (ev) {
        if (!pane.ws || pane.ws.readyState !== 1 || paneReadOnly(pane)) return;
        if ((ev.ctrlKey || ev.metaKey) && ev.key !== 'Control' && ev.key !== 'Meta') {
          var k = String(ev.key || '').toLowerCase();
          var code = null;
          if (k === 'c') code = '\\x03'; else if (k === 'd') code = '\\x04'; else if (k === 'l') code = '\\x0c';
          else if (k === 'a') code = '\\x01'; else if (k === 'e') code = '\\x05'; else if (k === 'u') code = '\\x15';
          else if (k === 'w') code = '\\x17'; else if (k === 'z') code = '\\x1a';
          if (code !== null) { ev.preventDefault(); sendStdin(pane, code); return; }
        }
        if (ev.altKey) return;
        var seq = null;
        if (ev.key === 'Enter') seq = '\\r';
        else if (ev.key === 'Backspace') seq = '\\x7f';
        else if (ev.key === 'Tab') seq = '\\t';
        else if (ev.key === 'Escape') seq = '\\x1b';
        else if (ev.key === 'ArrowUp') seq = '\\x1b[A';
        else if (ev.key === 'ArrowDown') seq = '\\x1b[B';
        else if (ev.key === 'ArrowRight') seq = '\\x1b[C';
        else if (ev.key === 'ArrowLeft') seq = '\\x1b[D';
        else if (ev.key === 'Home') seq = '\\x1b[H';
        else if (ev.key === 'End') seq = '\\x1b[F';
        else if (ev.key === 'Delete') seq = '\\x1b[3~';
        if (seq !== null) {
          ev.preventDefault();
          echoLocal(pane, seq);
          sendStdin(pane, seq);
          if (seq === '\\r') {
            var ln = pane.lineBuf || '';
            pane.lineBuf = '';
            paneLine(pane, ln);
          }
          return;
        }
        if (ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) pane.lineBuf = (pane.lineBuf || '') + ev.key;
      });
    }

    // ---- live status poll (stopped state + workflow routing) -------------------------
    function tick() {
      sdk.fetchPanel('').then(function (inst) {
        liveStatus = String((inst && inst.status) || '');
        try {
          var cfg = (inst && inst.config) || {};
          var list = Array.isArray(cfg.actions) ? cfg.actions : [];
          liveActions = list.filter(function (a) { return a && typeof a.id === 'string' && a.id.trim() !== ''; });
        } catch (e) { liveActions = []; }
        liveInstall = {
          state: String((inst && inst.install_state) || ''),
          kind: String((inst && inst.install_kind) || ''),
          actionId: String((inst && inst.install_action_id) || '')
        };
        renderStopped();
        renderTabs();
        var ch = cfgHash();
        if (ch !== lastCfgHash) {
          lastCfgHash = ch;
          enforceLimits();
          renderPill(); renderTabs(); renderPanes(); startPoll();
        }
      }).catch(function () {});
    }
    function startPoll() {
      if (pollTimer) window.clearInterval(pollTimer);
      var bound = false;
      for (var i = 0; i < panes.length; i++) if (normTid(panes[i].tid) !== '') { bound = true; break; }
      pollTimer = window.setInterval(tick, bound ? 3000 : 5000);
    }

    // ---- shortcuts --------------------------------------------------------------------
    function shortcuts() {
      if (!cfgBool('shortcuts_enabled', false)) return [];
      var raw = cfgJSON('shortcuts');
      var out = [];
      for (var i = 0; i < raw.length && out.length < 20; i++) {
        var s = raw[i] || {};
        var label = String(s.label || '').trim().slice(0, 64);
        var cmd = String(s.command || '').slice(0, 500);
        if (label !== '' || cmd.trim() !== '') out.push({ label: label, command: cmd });
      }
      return out;
    }
    function runShortcut(i, target) {
      var sc = shortcuts()[i];
      if (!sc) return;
      if (extractShortcutVars(sc.command).length === 0) {
        if (target === 'box') boxTexts[activeKey] = sc.command;
        else {
          var p = activePane();
          if (p) sendLineToPane(p, sc.command);
        }
        renderPanes();
      } else {
        askFor = { cmd: sc.command, label: sc.label, target: target };
        askVals = {};
        renderDialogs();
      }
    }

    // ---- chrome renders -----------------------------------------------------------------
    function el(id) { return document.getElementById(id); }
    function promptHost() {
      var inst = sdk.instance || {};
      return (inst.display_name || inst.name || 'instance') + '@' + (inst.node_name || 'node');
    }
    function promptHtml() {
      var style = cfgGet('prompt_style');
      if (cfgGet('input_mode') === 'box' || style === 'none' || !style) return '';
      var host = esc(promptHost());
      var h = '<div class="ks-mono" style="font-size:12px;margin:0 0 8px;padding:10px 10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">';
      if (style !== 'path') h += '<span style="color:var(--ks-ok)">'+host+'</span>';
      if (style === 'host_path') h += '<span style="color:var(--ks-muted)">:</span>';
      if (style !== 'host') h += '<span style="color:var(--ks-info)">~</span>';
      return h + '<span style="color:var(--ks-body)">$</span></div>';
    }
    function renderPill() {
      var host = el('ks-pill');
      if (!host) return;
      // Pill shell parity: animation + collapse classes live on the host
      // (the static shell ships plain ks-card; the host bakes the rest).
      host.className = 'ks-card ks-pill-anim ks-actions-pill' + (pillOff ? ' ks-pill-collapsed' : '');
      host.setAttribute('role', 'toolbar');
      host.setAttribute('aria-label', 'Terminal actions');
      var sc = shortcuts();
      var maxN = parseInt(cfgGet('max_terminals').trim(), 10);
      var atMax = Number.isFinite(maxN) && maxN > 0 && panes.length >= maxN;
      var canAdd = cfgBool('allow_multi', true) && !atMax;
      var cs = pillOff
        ? 'display:flex;align-items:center;gap:4px;max-width:0;opacity:0;transform:translateX(8px);pointer-events:none;visibility:hidden;overflow:hidden;padding:0;margin:0'
        : 'display:flex;align-items:center;gap:4px;max-width:800px;opacity:1;transform:none;overflow:visible';
      var ts = pillOff ? '--ks-tab-px:4px' : '--ks-tab-px:var(--ks-pill-tab-px,10px)';
      var h = '<div class="ks-pill-content" style="' + cs + '" aria-hidden="' + (!!pillOff) + '">';
      if (sc.length > 0) {
        h += '<div style="position:relative">'
          + '<button type="button" id="pill-shortcuts" title="Shortcuts" aria-label="Shortcuts" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></button>'
          + '<div id="pill-menu" style="display:none;position:absolute;right:0;top:110%;z-index:30;min-width:220px" class="ks-dropdown ks-menu">'
          + sc.map(function (s, i) { return '<button type="button" data-sc="' + i + '">' + esc(s.label !== '' ? s.label : s.command) + '</button>'; }).join('')
          + '</div></div>';
      }
      h += '<button type="button" id="pill-add" title="' + (atMax ? ('Max ' + maxN + ' terminals') : 'Add terminal') + '" aria-label="Add terminal" class="ks-tab" style="padding:5px 10px;font-size:13px"' + (canAdd ? '' : ' disabled style="padding:5px 10px;font-size:13px;opacity:.4"') + '><span style="display:inline-flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</span></button>';
      h += '<button type="button" id="pill-copy" title="Copy terminal output" aria-label="Copy terminal output" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      h += '<button type="button" id="pill-dl" title="Download terminal output" aria-label="Download terminal output" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>';
      h += '<button type="button" id="pill-clear" title="Clear scrollback" aria-label="Clear scrollback" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      h += '<button type="button" id="pill-refresh" title="Refresh terminal" aria-label="Refresh terminal" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>';
      h += '<div style="position:relative"><button type="button" id="pill-settings" title="Display settings" aria-label="Display settings" class="ks-tab" style="padding:5px 10px;font-size:13px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>' + (!showPrefix ? '<span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:var(--ks-info);margin-left:4px"></span>' : '') + '</button>'
        + '<div id="pill-setmenu" style="display:none;position:absolute;right:0;top:110%;z-index:30;min-width:260px" class="ks-dropdown"><div style="padding:12px;display:flex;flex-direction:column;gap:12px">'
        + '<label style="display:block;font-size:11px;color:var(--ks-muted);text-transform:uppercase;letter-spacing:.05em">Text size<select id="set-font" style="margin-top:6px;width:100%" class="ks-input">'
        + [11, 12, 13, 14, 15, 16, 18].map(function (n) { return '<option value="' + n + '"' + (n === fontSize ? ' selected' : '') + '>' + n + 'px' + (n === 13 ? ' (default)' : '') + '</option>'; }).join('')
        + '</select></label>'
        + '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--ks-body);cursor:pointer"><span class="ks-mono">[02:41:03 INFO]<br><span style="color:var(--ks-muted)">Log timestamp prefix</span></span><input type="checkbox" id="set-prefix" ' + (showPrefix ? 'checked' : '') + ' style="width:16px;height:16px"></label>'
        + '<p style="font-size:11px;color:var(--ks-muted);margin:0">New lines follow at once — Refresh reloads history.</p>'
        + '</div></div></div>';
      if (pillMsg) h += '<span style="font-size:12px;color:var(--ks-ok);white-space:nowrap">' + esc(pillMsg) + '</span>';
      h += '</div>'
        + '<button type="button" id="ks-pill-toggle" aria-label="' + (pillOff ? 'Show actions' : 'Hide actions') + '" aria-expanded="' + (!pillOff) + '" title="' + (pillOff ? 'Show actions' : 'Hide actions') + '" class="ks-tab ks-pill-toggle" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;' + ts + ';--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px)">' + (pillOff ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>') + '</button>';
      host.innerHTML = h;
      var q = function (id) { return document.getElementById(id); };
      var tg = q('ks-pill-toggle');
      if (tg) tg.addEventListener('click', function () { pillShow(); setPillOff(!pillOff); });
      if (!host.getAttribute('data-hover')) {
        host.setAttribute('data-hover', '1');
        host.addEventListener('mouseenter', function () { pillShow(); if (pillOff) setPillOff(false); });
      }
      var scBtn = q('pill-shortcuts');
      if (scBtn) scBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var m = q('pill-menu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
      });
      var setBtn = q('pill-settings');
      if (setBtn) setBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var m = q('pill-setmenu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
      });
      if (!docMenuWired) {
        docMenuWired = true;
        document.addEventListener('click', function () {
          var m1 = document.getElementById('pill-menu'), m2 = document.getElementById('pill-setmenu');
          if (m1) m1.style.display = 'none';
          if (m2) m2.style.display = 'none';
        });
      }
      // Pill auto-hide parity with PageActionsPill: scroll / outside-tap
      // collapses to the chevron, idle 2.5s + hover restore. Bound once.
      if (!pillAutoWired) {
        pillAutoWired = true;
        document.addEventListener('scroll', function () {
          var p = document.getElementById('ks-pill');
          if (p && document.activeElement && p.contains(document.activeElement)) return;
          if (!pillOff) setPillOff(true);
          pillShow();
          pillAutoTimer = window.setTimeout(function () { setPillOff(false); }, 2500);
        }, true);
        document.addEventListener('pointerdown', function (ev) {
          var p = document.getElementById('ks-pill');
          if (!p) return;
          var path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
          var inside = path.indexOf(p) >= 0 || (ev.target && p.contains(ev.target));
          if (!inside && !pillOff) setPillOff(true);
        });
        document.addEventListener('focusin', function (ev) {
          var p = document.getElementById('ks-pill');
          if (p && ev.target && p.contains(ev.target)) { pillShow(); if (pillOff) setPillOff(false); }
        });
      }
      var all = host.querySelectorAll('[data-sc]');
      for (var i = 0; i < all.length; i++) {
        (function (b) {
          b.addEventListener('click', function () { runShortcut(Number(b.getAttribute('data-sc')), cfgGet('input_mode') === 'box' ? 'box' : 'direct'); });
        })(all[i]);
      }
      var add = q('pill-add');
      if (add && canAdd) add.addEventListener('click', function () { showAdd = true; draftName = ''; draftId = ''; renderDialogs(); });
      var cp = q('pill-copy'); if (cp) cp.addEventListener('click', copyActive);
      var dl = q('pill-dl'); if (dl) dl.addEventListener('click', downloadActive);
      var cl = q('pill-clear'); if (cl) cl.addEventListener('click', function () { var p = activePane(); if (p) { clearPane(p); flashPill('Cleared'); } });
      var rf = q('pill-refresh'); if (rf) rf.addEventListener('click', function () { var p = activePane(); if (p) { reconnectPane(p); flashPill('Refreshing'); } });
      var sf = q('set-font');
      if (sf) sf.addEventListener('change', function () {
        fontSize = Math.max(11, Math.min(18, Number(sf.value) || 13));
        try { window.localStorage.setItem(FONT_KEY, String(fontSize)); } catch (e) {}
        applyFontSize(); renderPill();
      });
      var sp = q('set-prefix');
      if (sp) sp.addEventListener('change', function () {
        showPrefix = !!sp.checked;
        try { window.localStorage.setItem(PREFIX_KEY, showPrefix ? '1' : '0'); } catch (e) {}
        renderPill();
      });
    }
    function applyFontSize() {
      for (var i = 0; i < panes.length; i++) {
        var pre = document.getElementById('pre-' + panes[i].key);
        if (pre) pre.style.fontSize = fontSize + 'px';
        var inp = document.getElementById('box-' + panes[i].key);
        if (inp) inp.style.fontSize = fontSize + 'px';
      }
    }
    function copyActive() {
      var p = activePane();
      if (!p) return;
      var t = paneText(p);
      if (t.trim() === '') { flashPill('Empty'); return; }
      var done = function (ok) { flashPill(ok ? 'Copied' : 'Copy failed'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
        else {
          var ta = document.createElement('textarea');
          ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta); done(ok);
        }
      } catch (e) { done(false); }
    }
    function downloadActive() {
      var p = activePane();
      if (!p) return;
      var t = paneText(p);
      if (t.trim() === '') { flashPill('Empty'); return; }
      try {
        var label = paneLabel(p, 0).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 32) || 'shell';
        var stamp = new Date().toISOString().replace(/[:.]/g, '-');
        var blob = new Blob([t + '\\n'], { type: 'text/plain;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'terminal-' + (((sdk && sdk.instance && sdk.instance.id) || 'instance')) + '-' + label + '-' + stamp + '.log';
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
        flashPill('Saved');
      } catch (e) { flashPill('Save failed'); }
    }

    function renderTabs() {
      // Top tabs removed per request — sole tab UI is now the bottom pill
      // (panel PageTabsPill parity: ks-ptabs / ks-ptabs-shell). Keep alias so
      // existing call sites (tick, setPillOff, enforceLimits) still refresh tabs.
      renderPhoneTabs();
    }
    function renderPhoneTabs() {
      var host = el('ks-ptabs');
      if (!host) { wirePhonePill(); return; }
      // Build vertical tab rows like PageTabsPill: full-width, left-aligned, ks-tab-active on selected.
      var h = panes.map(function (p, idx) {
        var st = tabDot(p);
        var active = p.key === activeKey;
        var label = paneLabel(p, idx);
        var tid = normTid(p.tid);
        return '<div data-ptab="' + p.key + '" role="tab" aria-selected="' + active + '" class="ks-tab' + (active ? ' ks-tab-active' : '') + '" style="width:100%;justify-content:flex-start;text-align:left;display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:13px;flex-shrink:0;cursor:pointer">'
          + '<span style="width:6px;height:6px;border-radius:9999px;flex-shrink:0;' + st.dot + '"></span>'
          + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(label) + '</span>'
          + (tid !== '' ? '<span class="ks-mono" style="font-size:11px;opacity:.6;max-width:7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(tid) + '</span>' : '')
          + (panes.length > 1 ? '<button type="button" data-close="' + p.key + '" title="Close ' + esc(label) + '" aria-label="Close ' + esc(label) + '" style="padding:4px;border-radius:6px;color:var(--ks-muted);background:transparent;border:none;cursor:pointer;flex-shrink:0">✕</button>' : '')
          + '</div>';
      }).join('');
      host.innerHTML = h;
      // Apply the current open/closed geometry so the content glides like PageTabsPill (max-height + fade + rise).
      var shell = el('ks-ptabs-shell');
      if (shell) {
        var c = shell.querySelector('.ks-pill-content');
        if (c) {
          // Ensure the inner list has the correct flex column + scroll max-height.
          c.style.display = 'flex';
          c.style.flexDirection = 'column';
          c.style.gap = '4px';
          c.style.width = '100%';
          c.style.minWidth = '0';
          // Width of the shell: shrink-to-content by default (hugs longest tab), max viewport-clamped.
        }
      }
      // Wire tab selection: selecting a tab collapses back to ^ (PageTabsPill parity) and restores aria. Close button handled first.
      var btns = host.querySelectorAll('[data-ptab]');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          b.addEventListener('click', function (e) {
            var c = e.target && e.target.closest ? e.target.closest('[data-close]') : null;
            if (c) { removePane(Number(c.getAttribute('data-close'))); return; }
            activeKey = Number(b.getAttribute('data-ptab'));
            saveSession();
            renderTabs(); renderPanes(); renderPhoneTabs();
            setPhonePillOpen(false);
          });
        })(btns[i]);
      }
      wirePhonePill();
      // Keep the toggle's activeLabel in sync (closed shows current pane name).
      setPhonePillOpen(phonePillOpen);
    }

    function renderPanes() {
      var host = el('ks-panes');
      if (!host) return;
      var savedScroll = {};
      var savedFocus = '';
      try { savedFocus = (document.activeElement && document.activeElement.id) || ''; } catch (e) {}
      for (var si = 0; si < panes.length; si++) {
        var spre = document.getElementById('pre-' + panes[si].key);
        if (spre) { try { savedScroll[panes[si].key] = { top: spre.scrollTop, bottom: spre.scrollTop + spre.clientHeight >= spre.scrollHeight - 24 }; } catch (e2) {} }
      }
      var boxMode = cfgGet('input_mode') === 'box';
      host.innerHTML = panes.map(function (p) {
        var active = p.key === activeKey;
        var ro = paneReadOnly(p);
        var stopped = liveStatus === 'stopped';
        return '<div data-pane="' + p.key + '" style="' + (active ? '' : 'display:none') + '">'
          + '<div style="border-radius:12px;border:1px solid var(--ks-card-border);background:rgba(0,0,0,0.20);overflow:hidden">'
          + (boxMode ? '' : promptHtml())
          + '<div style="position:relative;background:var(--ks-term-bg,#1e1e1e);border-radius:8px">'
          + '<div id="pre-' + p.key + '" tabindex="0" role="textbox" aria-label="Terminal" aria-multiline="true" class="ks-mono" style="background:var(--ks-term-bg,#1e1e1e);color:var(--ks-secondary,#d4d4d4);font-size:' + fontSize + 'px;line-height:1.35;padding:10px;height:24rem;overflow:auto;outline:none;cursor:text;user-select:text;-webkit-user-select:text"></div>'
          + '<textarea id="hid-' + p.key + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" rows="1" aria-label="Terminal input" style="position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;outline:none;background:transparent;color:transparent;caret-color:transparent;resize:none;overflow:hidden;padding:0"></textarea>'
          + '</div>'
          + (p.stoppedExit ? '<p style="font-size:11px;color:var(--ks-warn);margin:8px 10px 10px">Pane stopped — process exited. Refresh to reconnect.</p>' : '')
          + (ro && !p.stoppedExit && !stopped ? '<p style="font-size:11px;color:var(--ks-muted);margin:8px 10px 10px">Read-only pane.</p>' : '')
          + (boxMode ? '<div style="display:flex;align-items:center;gap:8px;margin:8px 10px 10px"><input id="box-' + p.key + '" value="' + esc(boxTexts[p.key] || '') + '" placeholder="Type a command…" aria-label="Command input" class="ks-input" style="flex:1;min-width:0;font-size:' + fontSize + 'px"><button type="button" data-send="' + p.key + '" aria-label="Send" title="Send" class="ks-btn-header ks-icon-btn" style="flex-shrink:0"><span style="font-size:14px;line-height:1">⌯⌲</span></button></div>' : '')
          + '</div></div>';
      }).join('');
      for (var i = 0; i < panes.length; i++) {
        (function (p) {
          wirePaneInput(p);
          paintPane(p);
          sendResize(p);
          if (cfgGet('input_mode') === 'box') {
            var inp = document.getElementById('box-' + p.key);
            if (inp) {
              inp.addEventListener('input', function () { boxTexts[p.key] = inp.value; });
              inp.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                  var v = inp.value;
                  boxTexts[p.key] = '';
                  sendLineToPane(p, v);
                  renderPanes();
                }
              });
            }
            var sb = host.querySelector('[data-send="' + p.key + '"]');
            if (sb) sb.addEventListener('click', function () {
              var v = boxTexts[p.key] || '';
              boxTexts[p.key] = '';
              sendLineToPane(p, v);
              renderPanes();
            });
          }
        })(panes[i]);
      }
      applyFontSize();
      for (var ri = 0; ri < panes.length; ri++) {
        var rp = panes[ri];
        var kept = savedScroll[rp.key];
        var rpre = document.getElementById('pre-' + rp.key);
        if (rpre && kept && !kept.bottom) { try { rpre.scrollTop = kept.top; } catch (e) {} }
      }
      if (savedFocus) {
        var fn = document.getElementById(savedFocus);
        if (fn && fn.focus) { try { fn.focus({ preventScroll: true }); } catch (e) { try { fn.focus(); } catch (e2) {} } }
      }
    }

    function renderStopped() {
      var host = el('ks-stopped');
      if (!host) return;
      if (liveStatus === 'stopped') {
        host.innerHTML = '<div class="ks-card" style="border-radius:12px;text-align:center;padding:48px 24px"><h3 style="font-size:16px;font-weight:600;color:var(--ks-heading);margin:0">Instance Stopped</h3><p style="font-size:13px;color:var(--ks-muted);margin:8px 0 0">Start the instance to use the terminal.</p></div>';
        host.style.display = '';
        var pn = el('ks-live');
        if (pn) pn.style.display = 'none';
      } else {
        host.innerHTML = '';
        host.style.display = 'none';
        var pn2 = el('ks-live');
        if (pn2) pn2.style.display = '';
      }
    }

    function addIdHintHtml() {
      var norm = normTid(draftId);
      if (draftId.trim() !== '' && norm === '') return '<p id="dlg-id-hint" style="font-size:11px;color:var(--ks-bad);margin:6px 0 0">Invalid ID — use only letters, numbers, _ and - (max 64 chars).</p>';
      if (norm !== '') return '<p id="dlg-id-hint" style="font-size:11px;color:var(--ks-muted);margin:6px 0 0">Terminal ID: <code class="ks-mono" style="color:var(--ks-body)">' + esc(norm) + '</code> — must match the action\\u2019s Terminal ID for its live console.</p>';
      return '<p id="dlg-id-hint" style="font-size:11px;color:var(--ks-muted);margin:6px 0 0">Leave empty for a plain shell, or enter the action\\u2019s Terminal ID for its live console.</p>';
    }
    function renderDialogs() {
      var host = el('ks-dialogs');
      if (!host) return;
      var h = '';
      if (showAdd) {
        var norm = normTid(draftId);
        var invalid = draftId.trim() !== '' && norm === '';
        h += '<div data-overlay="1" style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.60);padding:16px">'
          + '<div style="width:100%;max-width:28rem;max-height:90vh;overflow-y:auto" class="ks-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h3 style="font-size:16px;font-weight:600;color:var(--ks-heading);margin:0">Add terminal</h3>'
          + '<button type="button" data-x="add" aria-label="Close" style="border:none;background:transparent;color:var(--ks-muted);cursor:pointer;padding:4px">✕</button></div>'
          + '<label style="display:block;font-size:12px;color:var(--ks-muted);margin-bottom:4px">Name</label>'
          + '<input id="dlg-name" value="' + esc(draftName) + '" placeholder="e.g. MC console" style="width:100%;box-sizing:border-box" class="ks-input">'
          + '<label style="display:block;font-size:12px;color:var(--ks-muted);margin:12px 0 4px">ID <span style="opacity:.7">(empty = plain shell)</span></label>'
          + '<input id="dlg-id" value="' + esc(draftId) + '" placeholder="action terminal id (e.g. mc-console)" style="width:100%;box-sizing:border-box" class="ks-input ks-mono">'
          + addIdHintHtml()
          + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-x="add" class="ks-btn">Cancel</button>'
          + '<button type="button" id="dlg-add-ok" ' + (invalid ? 'disabled style="opacity:.4" class="ks-btn"' : 'class="ks-btn" style="background:var(--ks-btn-bg,#fff);color:var(--ks-btn-text,#000)"') + '>Add</button></div>'
          + '</div></div>';
      }
      if (askFor !== null && askFor.cmd) {
        var sc = askFor;
        {
          var cmd = sc.cmd;
          var vars = extractShortcutVars(cmd);
          var blocked = vars.some(function (v) { return !(askVals[v] || '').trim(); });
          h += '<div data-overlay="1" style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.60);padding:16px">'
            + '<div style="width:100%;max-width:28rem;max-height:90vh;overflow-y:auto" class="ks-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h3 style="font-size:16px;font-weight:600;color:var(--ks-heading);margin:0">' + esc(sc.label !== '' ? sc.label : 'Shortcut') + '</h3>'
            + '<button type="button" data-x="ask" aria-label="Close" style="border:none;background:transparent;color:var(--ks-muted);cursor:pointer;padding:4px">✕</button></div>'
            + '<p class="ks-mono" style="font-size:11px;color:var(--ks-muted);word-break:break-all;margin:0 0 12px">' + esc(cmd) + '</p>'
            + '<div style="display:flex;flex-direction:column;gap:8px;max-height:16rem;overflow-y:auto">'
            + vars.map(function (v) { return '<input data-askvar="' + esc(v) + '" value="' + esc(askVals[v] || '') + '" placeholder="' + esc(v) + '" aria-label="Value for ' + esc(v) + '" class="ks-input" style="width:100%;box-sizing:border-box">'; }).join('')
            + '</div>'
            + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-x="ask" class="ks-btn">Cancel</button>'
            + '<button type="button" id="dlg-ask-ok" ' + (blocked ? 'disabled style="opacity:.4" class="ks-btn"' : 'class="ks-btn" style="background:var(--ks-btn-bg,#fff);color:var(--ks-btn-text,#000)"') + '>Send ⌯⌲</button></div>'
            + '</div></div>';
        }
      }
      host.innerHTML = h;
      var xs = host.querySelectorAll('[data-x]');
      for (var xi = 0; xi < xs.length; xi++) {
        (function (b) {
          b.addEventListener('click', function () {
            if (b.getAttribute('data-x') === 'add') showAdd = false;
            else askFor = null;
            renderDialogs();
          });
        })(xs[xi]);
      }
      var ovs = host.querySelectorAll('[data-overlay]');
      for (var oi = 0; oi < ovs.length; oi++) {
        (function (o) {
          o.addEventListener('click', function (ev) {
            if (ev.target === o) { showAdd = false; askFor = null; renderDialogs(); }
          });
        })(ovs[oi]);
      }
      var dn = document.getElementById('dlg-name');
      if (dn) {
        dn.addEventListener('input', function () { draftName = dn.value; });
        dn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') confirmAddPane(); });
      }
      var di = document.getElementById('dlg-id');
      if (di) {
        di.addEventListener('input', function () {
          draftId = di.value;
          var bad = draftId.trim() !== '' && normTid(draftId) === '';
          var okBtn = document.getElementById('dlg-add-ok');
          if (okBtn) okBtn.disabled = bad;
          var hint = document.getElementById('dlg-id-hint');
          if (hint) {
            var tmp = document.createElement('div');
            tmp.innerHTML = addIdHintHtml();
            if (tmp.firstChild) hint.replaceWith(tmp.firstChild);
          }
        });
        di.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') confirmAddPane(); });
      }
      var ok = document.getElementById('dlg-add-ok');
      if (ok) ok.addEventListener('click', confirmAddPane);
      var av = host.querySelectorAll('[data-askvar]');
      for (var ai = 0; ai < av.length; ai++) {
        (function (inp) {
          inp.addEventListener('input', function () {
            askVals[inp.getAttribute('data-askvar')] = inp.value.slice(0, 200);
            var blocked2 = (askFor && askFor.cmd) ? extractShortcutVars(askFor.cmd).some(function (v) { return !(askVals[v] || '').trim(); }) : false;
            var btn = document.getElementById('dlg-ask-ok');
            if (btn) btn.disabled = blocked2;
          });
        })(av[ai]);
      }
      var ao = document.getElementById('dlg-ask-ok');
      if (ao) ao.addEventListener('click', confirmAsk);
    }
    function confirmAddPane() {
      var norm = normTid(draftId);
      if (draftId.trim() !== '' && norm === '') return;
      addPane(draftName.trim(), norm);
      showAdd = false;
      draftName = ''; draftId = '';
      renderDialogs();
    }
    function confirmAsk() {
      if (askFor === null || !askFor.cmd) { askFor = null; renderDialogs(); return; }
      var sc = askFor;
      var vars = extractShortcutVars(sc.cmd);
      for (var i = 0; i < vars.length; i++) if (!(askVals[vars[i]] || '').trim()) return;
      var text = resolveShortcutCommand(sc.cmd, askVals);
      if (askFor.target === 'box') boxTexts[activeKey] = text;
      else {
        var p = activePane();
        if (p) sendLineToPane(p, text);
      }
      askFor = null;
      renderDialogs(); renderPanes();
    }

    // ---- panes add/remove -----------------------------------------------------------
    function addPane(name, tid) {
      var maxN = parseInt(cfgGet('max_terminals').trim(), 10);
      if (Number.isFinite(maxN) && maxN > 0 && panes.length >= maxN) { toast('Max ' + maxN + ' terminals', 'error'); return; }
      if (!cfgBool('allow_multi', true) && panes.length > 0) { toast('Template allows a single terminal pane', 'error'); return; }
      var p = { key: keySeq++, name: name || '', tid: normTid(tid), ws: null, state: 'connecting', stateMsg: '', attempt: 0, timer: null, lines: [], cur: '', pending: '', overwritable: false, lineBuf: '', ep: 'terminal', stoppedExit: false, dead: false, lastOpenAt: 0 };
      panes.push(p);
      activeKey = p.key;
      saveSession();
      renderTabs(); renderPanes(); startPoll();
      openPane(p);
    }
    function removePane(key) {
      if (panes.length <= 1) return;
      var idx = -1;
      for (var i = 0; i < panes.length; i++) if (panes[i].key === key) idx = i;
      if (idx < 0) return;
      panes[idx].dead = true;
      closePaneWs(panes[idx]);
      panes.splice(idx, 1);
      delete boxTexts[key];
      if (key === activeKey && panes.length) {
        var fb = panes[Math.min(idx, panes.length - 1)];
        activeKey = fb.key;
      }
      saveSession();
      renderTabs(); renderPanes(); startPoll();
    }
    function seedPanes() {
      var raws = cfgJSON('default_terminals').slice(0, 10);
      var list = [];
      for (var i = 0; i < raws.length; i++) {
        var r = raws[i] || {};
        var nm = String(r.name || '').trim().slice(0, 64);
        var id = normTid(r.id);
        if (nm !== '' || id !== '') list.push({ name: nm, tid: id });
      }
      var wantActive = 0;
      if (!list.length) {
        var sess = loadSession();
        if (sess) { list = sess.panes; wantActive = sess.active; }
      }
      if (!cfgBool('allow_multi', true)) { list = list.slice(0, 1); wantActive = 0; }
      var maxN = parseInt(cfgGet('max_terminals').trim(), 10);
      if (Number.isFinite(maxN) && maxN > 0) { list = list.slice(0, maxN); wantActive = Math.min(wantActive, Math.max(0, list.length - 1)); }
      if (!list.length) list = [{ name: '', tid: '' }];
      for (var j = 0; j < list.length; j++) {
        panes.push({ key: keySeq++, name: list[j].name, tid: list[j].tid, ws: null, state: 'connecting', stateMsg: '', attempt: 0, timer: null, lines: [], cur: '', pending: '', overwritable: false, lineBuf: '', ep: 'terminal', stoppedExit: false, dead: false, lastOpenAt: 0 });
      }
      activeKey = panes[Math.min(wantActive, panes.length - 1)].key;
    }

    // ---- boot -------------------------------------------------------------------------
    function renderChrome() { renderPill(); renderTabs(); renderPanes(); renderDialogs(); renderStopped(); }
    function start(s) {
      sdk = s;
      lastCfgHash = cfgHash();
      try {
        var cfg = (s.instance.config || {});
        var list = Array.isArray(cfg.actions) ? cfg.actions : [];
        liveActions = list.filter(function (a) { return a && typeof a.id === 'string' && a.id.trim() !== ''; });
      } catch (e) { liveActions = []; }
      liveStatus = String((s.instance && s.instance.status) || '');
      try {
        liveInstall = {
          state: String(s.instance.install_state || ''),
          kind: String(s.instance.install_kind || ''),
          actionId: String(s.instance.install_action_id || '')
        };
      } catch (e) {}
      seedPanes();
      renderChrome();
      tick();
      startPoll();
      for (var i = 0; i < panes.length; i++) openPane(panes[i]);
      window.addEventListener('resize', function () {
        for (var j = 0; j < panes.length; j++) sendResize(panes[j]);
      });
    }
    window.addEventListener('message', function (ev) {
      if (!ev || ev.source !== window.parent || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'ks-page-config' && ev.data.config && typeof ev.data.config === 'object') {
        try { window.KS_PAGE_CONFIG = ev.data.config; } catch (e) {}
        enforceLimits();
        renderPill(); renderTabs(); renderPanes(); startPoll();
      }
    });
    if (window.KSPageSDK) start(window.KSPageSDK);
    else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
  })();
  <\/script>
icon_svg: <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
configure:
- name: allow_multi
  label: Allow multiple terminals
  description: Operators may add more terminal panes together on the Terminal page.
  default: 'true'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: toggle
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: max_terminals
  label: Max terminals
  description: Cap on simultaneous panes (empty = unlimited).
  default: '4'
  user_viewable: true
  user_editable: true
  required: false
  rule: ^[0-9]*$
  display: number
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: default_stop_on_exit
  label: Stop pane when process exits
  description: New panes lock input once the bound process exits.
  default: 'true'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: toggle
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: default_allow_input
  label: New-pane input default
  description: Whether new panes accept typed input (all = every pane, allowlist = only panes bound to a terminal ID, disabled = none).
  default: all
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: select
  options: all, allowlist, disabled
  append: false
  prepend: ''
  append_value: ''
- name: default_timeout_s
  label: New-pane timeout (seconds)
  description: Attach budget for new panes (empty = no limit).
  default: ''
  user_viewable: true
  user_editable: true
  required: false
  rule: ^[0-9]*$
  display: number
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: input_mode
  label: Input method
  description: Direct = type straight into the terminal. Box = output-only terminal with an input + Send row below.
  default: direct
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: select
  options: direct, box
  append: false
  prepend: ''
  append_value: ''
- name: prompt_style
  label: Prompt line (direct mode)
  description: Linux-like prompt line above each pane. Display-only, never reaches the shell.
  default: none
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: select
  options: none, host_path, host, path
  append: false
  prepend: ''
  append_value: ''
- name: shortcuts_enabled
  label: Shortcuts
  description: Pre-made command buttons on the Terminal page.
  default: 'false'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: toggle
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: shortcuts
  label: Shortcuts list
  description: 'JSON array of {label, command}. Commands may carry {{VAR}} / \${VAR} / $(VAR) placeholders: picking asks the operator for each value.'
  default: '[]'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: text
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: default_terminals
  label: Default terminals
  description: JSON array of {name, id} panes opened automatically. Empty id = plain shell, otherwise must match an action/install/startup terminal ID for its live console.
  default: '[]'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: text
  options: ''
  append: false
  prepend: ''
  append_value: ''
`,cn=`# Files — instance page (YAML authoring format).
# Converted from files.json; edit this file, not JSON.
# Multiline content uses \`|\` literal blocks (raw HTML/JS, no escaping);
# actions/sub_pages/components/configure are native YAML lists.
# See instance_pages/README.md for the field reference.
name: Files
slug: files
kind: custom
category: management
type: file-manager
description: File manager with upload, download, copy, rename, permissions, archives, server search, SFTP view, and a built-in editor.
content_type: html
content_html: |
  {{component:ks_theme_head}}<style>
  /* Files — fully themed via panel tokens (iframe tokens baked per mount). */
  button.ks-iconbtn{border:none;background:transparent;color:var(--ks-muted);cursor:pointer;padding:6px;border-radius:6px;line-height:0;font-size:15px;display:inline-flex;align-items:center;justify-content:center;transition:background .15s ease,color .15s ease}
  button.ks-iconbtn:hover{background:var(--ks-input-bg);color:var(--ks-heading)}
  button.ks-iconbtn:focus-visible{outline:2px solid var(--ks-info);outline-offset:2px}
  .ks-menu{position:fixed;z-index:var(--ks-z-dropdown,70);background:var(--ks-dropdown-bg, var(--ks-card-bg));border:1px solid var(--ks-dropdown-border, var(--ks-card-border));border-radius:var(--ks-dropdown-radius,10px);box-shadow:var(--ks-dropdown-shadow, 0 16px 40px rgba(0,0,0,.45));min-width:var(--ks-dropdown-min-width,184px);padding:var(--ks-dropdown-padding,4px);backdrop-filter:blur(var(--ks-dropdown-blur,16px));-webkit-backdrop-filter:blur(var(--ks-dropdown-blur,16px))}
  .ks-menu button{display:flex;width:100%;text-align:left;align-items:center;gap:10px;border:none;background:transparent;color:var(--ks-body);font-size:13px;padding:10px 12px;cursor:pointer;border-radius:8px;font-family:inherit;line-height:1;transition:background .12s ease,color .12s ease}
  .ks-menu button:hover{background:var(--ks-input-bg);color:var(--ks-heading)}
  .ks-menu button.danger{color:var(--ks-bad)}
  .ks-menu button.danger:hover{background:var(--ks-bad-wash);color:var(--ks-bad)}
  .ks-menu button:disabled{opacity:.45;cursor:default}
  .ks-menu svg{flex-shrink:0;width:14px;height:14px}
  .ks-menu-info{padding:8px 12px 6px;border-bottom:1px solid var(--ks-card-border);margin:-4px -4px 4px}
  .ks-menu-info-row{display:flex;justify-content:space-between;gap:12px;font-size:11px;line-height:1.5}
  .ks-menu-info-label{color:var(--ks-muted);flex-shrink:0}
  .ks-menu-info-value{color:var(--ks-body);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right;word-break:break-all}
  .ks-only-sm{display:none!important}
  @media (max-width:640px){
    .ks-hidden-sm{display:none!important}
    .ks-only-sm{display:flex!important}
    .ks-menu-info{display:block!important}
    .ks-files-toolbar{flex-direction:column;align-items:stretch!important}
    .ks-files-actions{justify-content:stretch!important;width:100%}
    .ks-files-actions .ks-btn{flex:1;padding:.55rem .5rem;font-size:.85rem}
    #file-filter{width:100%!important;box-sizing:border-box}
    .ks-modal-card{width:min(96vw,480px)!important;margin:8px!important;padding:16px!important}
    .ks-files-name{max-width:52vw!important}
  }
  @media (min-width:641px){
    .ks-only-sm{display:none!important}
    .ks-menu-info{display:none!important}
  }
  @media (min-width:641px) and (max-width:900px){
    .ks-hidden-md{display:none!important}
  }
  </style>
  <div id="root"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px"><div class="ks-skeleton-bar" style="height:14px;width:140px;border-radius:6px"></div><div style="display:flex;gap:8px"><div class="ks-skeleton-bar" style="height:28px;width:92px;border-radius:6px"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div><div class="ks-skeleton-bar" style="height:28px;width:28px;border-radius:var(--ks-skeleton-radius,8px)"></div></div></div><div class="ks-card" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-bottom:1px solid var(--ks-card-border);background:var(--ks-input-bg)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:48px"></div><div class="ks-skeleton-bar" style="height:10px;width:52px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><
  div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:68px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:84px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:72px"><
  /div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:96px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:78px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"><
  /div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:66px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:88px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div><div style="display:grid;grid-template-columns:32px 28px 1fr 90px 80px 100px 44px;gap:8px;padding:10px 12px;border-top:1px solid var(--ks-card-border)"><
  div class="ks-skeleton" style="height:14px;width:14px;border-radius:3px"></div><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div><div class="ks-skeleton-bar" style="height:10px;width:74px"></div><div class="ks-skeleton-bar" style="height:10px;width:42px"></div><div class="ks-skeleton-bar" style="height:10px;width:36px"></div><div class="ks-skeleton-bar" style="height:10px;width:64px"></div><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px"></div></div></div></div>

  <script>
  (function () {
    'use strict';
    var sdk = null;
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function joinPath(base, name) {
      if (!base) return '/' + name;
      var sep = base.endsWith('/') ? '' : '/';
      return base + sep + name;
    }
    function fmtBytes(bytes) {
      if (bytes == null || isNaN(bytes)) return '\\u2014';
      var units = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; var v = Number(bytes);
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return (i >= 3 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
    }
    function extOf(name) {
      var m = String(name).toLowerCase().match(/\\.([a-z0-9]+)$/);
      return m ? m[1] : '';
    }
    // fileTypeOf mirrors the panel's syntaxHighlighter classification closely
    // enough for icon + colour choices. binary files are download-only.
    function fileTypeOf(e) {
      if (e.is_dir) return 'folder';
      var ext = extOf(e.name);
      var img = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
      var code = ['js', 'ts', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'html', 'css', 'scss', 'xml', 'sql', 'lua', 'pl'];
      if (img.indexOf(ext) >= 0) return 'image';
      if (code.indexOf(ext) >= 0) return 'code';
      if (ext === 'md' || ext === 'txt' || ext === 'log' || ext === 'properties') return 'text';
      if (ext === 'zip' || ext === 'tar' || ext === 'gz' || ext === 'jar' || ext === '7z' || ext === 'rar') return 'archive';
      return 'binary';
    }
    function iconColor(kind) {
      switch (kind) {
        case 'folder': return 'var(--ks-warn)';
        case 'image': return 'var(--ks-pink)';
        case 'code': return 'var(--ks-info)';
        case 'archive': return 'var(--ks-warn)';
        case 'text': return 'var(--ks-secondary)';
        default: return 'var(--ks-muted)';
      }
    }
    function fileSvg(kind) {
      var p;
      if (kind === 'folder') p = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>';
      else if (kind === 'image') p = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
      else if (kind === 'code') p = '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';
      else if (kind === 'archive') p = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 7v3"/><path d="M12 13v3"/>';
      else p = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">' + p + '</svg>';
    }
    // ask() routes destructive confirmations through the panel's themed
    // ConfirmDialog (sdk.confirm bridges to the host origin) instead of the
    // browser-native confirm(). Falls back so pages stay usable standalone.
    function ask(m) {
      try { if (window.KSPageSDK && typeof window.KSPageSDK.confirm === 'function') return window.KSPageSDK.confirm(m); } catch (e) {}
      return Promise.resolve(window.confirm(m));
    }

    var state = {
      path: '/',
      entries: [],
      busy: false,
      error: '',
      selected: {},   // name -> true
      search: '',
      menuFor: null,  // entry name whose 3-dot menu is open
      modal: null,    // {kind:'create'|'upload'|'rename'|'copy'|'chmod'|'archive'|'extract'|'srvsearch', ...}
      createTab: 'file',
      uploadTab: 'local',
      uploadPct: 0,
      uploadLabel: '',
      urlPct: 0,
      root: '/'
    };

    function flash(ok, msg) {
      try { sdk.toast(msg, ok ? 'success' : 'error'); } catch (e) { /* ignore */ }
    }

    function computeRoot() {
      var inst = sdk.instance;
      try {
        var cfg = inst.config || {};
        if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch (e) { cfg = {}; } }
        var mounts = Array.isArray(cfg.mounts) ? cfg.mounts : [];
        var first = null;
        for (var i = 0; i < mounts.length; i++) {
          var m = mounts[i];
          if (m && typeof m === 'object') { first = m.container || m.target || m.destination || ''; if (first) break; }
        }
        if (first) return first;
        if (inst.kind === 'docker' && cfg.type === 'minecraft') return '/mc';
      } catch (e) { /* ignore */ }
      return '/';
    }

    var loadSeq = 0;
    function load(dir) {
      dir = fxClamp(dir || state.path || '/');
      state.path = dir;
      var seq = ++loadSeq;
      state.busy = true; state.error = ''; /* keep selection across refresh - filtered after load */ state.menuFor = null;
      render();
      sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=list&path=' + encodeURIComponent(dir))
        .then(function (data) {
          if (seq !== loadSeq) return;
          state.busy = false;
          data = data || {};
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
          if (data.error) { state.error = data.error; state.entries = []; render(); return; }
          var raw = Array.isArray(data.entries) ? data.entries : [];
          raw.sort(function (a, b) {
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
            return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
          });
          state.entries = raw;
          // retain checkbox selection across auto-refresh like React state
          var _keep={}; for(var _k in state.selected){ if(state.selected[_k]){ for(var _i=0;_i<raw.length;_i++) if(raw[_i].name===_k){ _keep[_k]=true; break; } } } state.selected=_keep;
          render();
        })
        .catch(function (e) {
          if (seq !== loadSeq) return;
          state.busy = false;
          state.error = (e && e.message) || 'Failed to list files';
          state.entries = [];
          render();
        });
    }

    function doWrite(p, text) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=write&path=' + encodeURIComponent(p), {
        method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' },
      });
    }
    function doMkdir(p) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=mkdir&path=' + encodeURIComponent(p), { method: 'POST' });
    }
    function doDelete(p) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=delete&path=' + encodeURIComponent(p), { method: 'DELETE' });
    }
    function doRename(from, to) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=rename&path=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), { method: 'POST' });
    }
    // doUploadOne streams the RAW file bytes to op=upload with the FULL target
    // file path — that is what the edge writes (\`cat > path\` in-container /
    // OpenFile on the host bind mount). The previous multipart-to-directory
    // shape never matched the edge contract (the body was dumped verbatim at a
    // directory path), which made every upload fail.
    function doUploadOne(file, targetPath) {
      return sdk.fetchPanel(
        '/api/instances/' + sdk.instance.id + '/files?op=upload&path=' + encodeURIComponent(targetPath),
        { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } },
      );
    }
    function doURLUpload(url, targetDir) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files/url', {
        method: 'POST',
        body: JSON.stringify({ url: url, path: targetDir.endsWith('/') ? targetDir : targetDir + '/' }),
      });
    }

    function openEditorEntry(e) {
      var kind = fileTypeOf(e);
      if (kind === 'binary') { flash(false, 'Binary file \\u2014 download to view'); return; }
      var p = joinPath(state.path, e.name);
      openEditorAt(p);
    }
    // openEditorAt routes to the multi-page editor sub-page served at
    // /files/edit instead of popping an in-page modal \\u2014 the editor lives
    // INSIDE this page family, so the Files tab stays highlighted in the
    // instance tab bar while it is open.
    function openEditorAt(p) {
      try {
        sdk.navigate('/instances/' + sdk.instance.id + '/files/edit?path=' + encodeURIComponent(p));
      } catch (err) {
        flash(false, (err && err.message) || 'Cannot open editor');
      }
    }

    function download(p) {
      // Binary-safe transfer through the SDK bridge (base64): text/config
      // files and archives/images download byte-faithful. Falls back to the
      // text panel read when the bridge call fails.
      var name = String(p).split('/').pop() || 'download';
      var save = function (bytes, type) {
        var blob = new Blob([bytes], { type: type || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      };
      var b64ToU8 = function (b64) {
        var bin = atob(String(b64 || '').replace(/\\s+/g, ''));
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      sdk.downloadFile(p)
        .then(function (r) { save(b64ToU8(r.base64), r.contentType); })
        .catch(function () {
          sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files/read?path=' + encodeURIComponent(p))
            .then(function (text) { save(new Blob([typeof text === 'string' ? text : JSON.stringify(text)]), 'application/octet-stream'); })
            .catch(function (e) { flash(false, (e && e.message) || 'Download failed'); });
        });
    }

    // ---- modals ------------------------------------------------------------
    function modalShell(title, innerHtml, footerHtml) {
      return '<div class="ks-ip-modal-overlay" data-close="1" style="position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease">'
        + '<div class="ks-ip-modal-panel" style="background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 12px)) saturate(180%);width:100%;max-width:480px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column" onclick="event.stopPropagation()">'
        + '<div class="ks-ip-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10">'
        + '<h3 class="ks-ip-modal-title" style="font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0">' + title + '</h3>'
        + '<button type="button" class="ks-ip-modal-close ks-modal-close" style="border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
        + '<div class="ks-ip-modal-body" style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">' + innerHtml + '</div>'
        + '<div class="ks-ip-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02)">' + footerHtml + '</div>'
        + '</div></div>';
    }
    function btn(label, cls, action, disabled) {
      var mapped = cls || '';
      if (mapped.indexOf('ks-btn-blue') >= 0 || mapped.indexOf('ks-btn-primary') >= 0) mapped = 'ks-ip-btn ks-ip-btn-primary';
      else if (mapped.indexOf('ks-btn') >= 0) mapped = 'ks-ip-btn ks-ip-btn-ghost';
      else mapped = 'ks-ip-btn ' + mapped;
      return '<button type="button" class="' + mapped + '"' + (action ? ' data-action="' + action + '"' : '') + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    }

    function buildModal() {
      var m = state.modal;
      if (!m) return '';
      if (m.kind === 'copy') {
        var innerC = '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Copy <code class="ks-mono">' + esc(m.entry.name) + '</code> to</label>'
          + '<input id="copy-name" type="text" value="' + esc(m.name || '') + '" class="ks-ip-input" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Destination inside <code class="ks-mono">' + esc(state.path) + '</code></p>';
        return modalShell('Copy', innerC, btn('Cancel', 'ks-btn', 'modal-close') + btn(m.busy ? 'Copying…' : 'Copy', 'ks-btn ks-btn-blue', 'copy-confirm', !m.name || m.busy));
      }
      if (m.kind === 'chmod') {
        var innerM = '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Mode for <code class="ks-mono">' + esc(m.entry.name) + '</code></label>'
          + '<input id="chmod-mode" type="text" value="' + esc(m.mode || '644') + '" placeholder="644" class="ks-ip-input ks-mono" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Octal permissions, e.g. 644 or 755.</p>';
        return modalShell('Permissions', innerM, btn('Cancel', 'ks-btn', 'modal-close') + btn(m.busy ? 'Saving…' : 'Save', 'ks-btn ks-btn-blue', 'chmod-confirm', m.busy));
      }
      if (m.kind === 'archive') {
        var innerA = '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Archive name (.zip or .tar.gz)</label>'
          + '<input id="archive-name" type="text" value="' + esc(m.name || '') + '" class="ks-ip-input ks-mono" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Archives the selection inside <code class="ks-mono">' + esc(state.path) + '</code></p>';
        return modalShell('Create archive', innerA, btn('Cancel', 'ks-btn', 'modal-close') + btn(m.busy ? 'Archiving…' : 'Create', 'ks-btn ks-btn-blue', 'archive-confirm', !m.name || m.busy));
      }
      if (m.kind === 'extract') {
        var innerE = '<p class="ks-muted" style="font-size:12px;margin:0 0 10px">Extract <code class="ks-mono">' + esc(m.entry.name) + '</code> into:</p>'
          + '<input id="extract-dest" type="text" value="" placeholder="(same folder)" class="ks-ip-input ks-mono" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Subfolder inside <code class="ks-mono">' + esc(state.path) + '</code> — empty keeps the same folder.</p>';
        return modalShell('Extract archive', innerE, btn('Cancel', 'ks-btn', 'modal-close') + btn(m.busy ? 'Extracting…' : 'Extract', 'ks-btn ks-btn-blue', 'extract-confirm', m.busy));
      }
      if (m.kind === 'srvsearch') {
        var innerS = '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Search under <code class="ks-mono">' + esc(state.path) + '</code></label>'
          + '<input id="srvsearch-q" type="text" value="' + esc(m.q || '') + '" placeholder="filename…" class="ks-ip-input" style="width:100%;box-sizing:border-box">';
        return modalShell('Search on server', innerS, btn('Cancel', 'ks-btn', 'modal-close') + btn(m.busy ? 'Searching…' : 'Search', 'ks-btn ks-btn-blue', 'srvsearch-go', m.busy));
      }
      if (m.kind === 'create') {
        var tabs = ''
          + '<div class="ks-ip-tabs" style="display:flex;gap:4px;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:4px;margin-bottom:4px">'
          + '<button type="button" data-ctab="file" class="ks-ip-tab' + (state.createTab === 'file' ? ' ks-ip-tab-active' : '') + '" style="flex:1;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">File</button>'
          + '<button type="button" data-ctab="folder" class="ks-ip-tab' + (state.createTab === 'folder' ? ' ks-ip-tab-active' : '') + '" style="flex:1;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">Folder</button>'
          + '</div>';
        var inner = tabs
          + '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">' + (state.createTab === 'file' ? 'File name' : 'Folder name') + '</label>'
          + '<input id="create-name" type="text" placeholder="' + (state.createTab === 'file' ? 'e.g. server.properties' : 'e.g. plugins') + '" class="ks-ip-input" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Will be created inside <code class="ks-mono">' + esc(state.path) + '</code></p>';
        return modalShell('Create new', inner,
          btn('Cancel', 'ks-btn', 'modal-close')
          + btn(m.busy ? 'Creating…' : 'Create', 'ks-btn ks-btn-blue', m.name ? 'create-confirm' : '', !m.name || m.busy));
      }
      if (m.kind === 'upload') {
        var isLocal = state.uploadTab === 'local';
        var utabs = ''
          + '<div class="ks-ip-tabs" style="display:flex;gap:4px;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:4px;margin-bottom:4px">'
          + '<button type="button" data-utab="local" class="ks-ip-tab' + (isLocal ? ' ks-ip-tab-active' : '') + '" style="flex:1;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">Local</button>'
          + '<button type="button" data-utab="url" class="ks-ip-tab' + (!isLocal ? ' ks-ip-tab-active' : '') + '" style="flex:1;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">URL</button>'
          + '</div>';
        var inner;
        if (isLocal) {
          inner = utabs
            + '<label id="drop-label" style="display:block;border:2px dashed var(--ks-input-border);border-radius:10px;padding:24px;text-align:center;cursor:pointer">'
            + '<input id="upload-file" type="file" multiple style="display:none">'
            + '<p style="font-size:13px;color:var(--ks-secondary);margin:0">Choose files or drag &amp; drop here</p>'
            + '<p class="ks-muted" style="font-size:12px;margin:4px 0 0">Files <strong>and folders</strong> land inside <code class="ks-mono">' + esc(state.path) + '</code></p>'
            + '</label>'
            + '<label id="pick-folder" style="display:block;border:1px dashed var(--ks-input-border);border-radius:10px;padding:12px;margin-top:10px;text-align:center;cursor:pointer">'
            + '<input id="upload-folder" type="file" webkitdirectory multiple style="display:none">'
            + '<p style="font-size:13px;color:var(--ks-secondary);margin:0">Choose a folder\\u2026</p>'
            + '</label>'
            + (m.queue && m.queue.length ? '<p class="ks-muted" style="font-size:12px;margin:10px 0 0">Queued: <span class="ks-mono">' + m.queue.length + '</span> item(s)</p>' : '')
            + progressCircle(state.uploadPct)
            + (state.uploadLabel ? '<p class="ks-muted ks-mono" style="font-size:11px;margin:6px 0 0;text-align:center">' + esc(state.uploadLabel) + '</p>' : '');
        } else {
          inner = utabs
            + '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">URL (http/https only)</label>'
            + '<input id="url-value" type="url" placeholder="https://example.com/server.jar" class="ks-ip-input" style="width:100%;box-sizing:border-box">'
            + '<p class="ks-muted" style="font-size:12px;margin:8px 0 0">The file is fetched by the panel (SSRF-guarded) and saved into <code class="ks-mono">' + esc(state.path) + '</code>.</p>'
            + progressCircle(state.urlPct);
        }
        return modalShell('Upload', inner, isLocal
          ? btn('Close', 'ks-btn', 'modal-close')
          : btn('Cancel', 'ks-btn', 'modal-close') + btn('Upload', 'ks-btn ks-btn-blue', 'url-upload', !(m.name) || m.busy));
      }
      if (m.kind === 'rename') {
        var inner2 = ''
          + '<label class="ks-muted" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">New name</label>'
          + '<input id="rename-name" type="text" value="' + esc(m.entry.name) + '" class="ks-ip-input" style="width:100%;box-sizing:border-box">'
          + '<p class="ks-muted" style="font-size:12px;margin:10px 0 0;word-break:break-all">Renaming <code class="ks-mono">' + esc(m.entry.name) + '</code> in <code class="ks-mono">' + esc(state.path) + '</code></p>';
        return modalShell('Rename', inner2,
          btn('Cancel', 'ks-btn', 'modal-close') + btn('Rename', 'ks-btn ks-btn-blue', 'rename-confirm', !m.name || m.busy));
      }
      return '';
    }

    function progressCircle(pct) {
      if (!pct || pct <= 0) return '';
      return '<div style="display:flex;align-items:center;justify-content:center;padding:10px 0 0">'
        + '<div style="position:relative;width:56px;height:56px">'
        + '<svg viewBox="0 0 36 36" style="width:56px;height:56px;transform:rotate(-90deg)">'
        + '<circle cx="18" cy="18" r="15.9" fill="none" style="stroke:var(--ks-card-border)" stroke-width="3"/>'
        + '<circle cx="18" cy="18" r="15.9" fill="none" style="stroke:var(--ks-info)" stroke-width="3" stroke-dasharray="' + pct + ',100" stroke-linecap="round"/>'
        + '</svg>'
        + '<span class="ks-mono" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--ks-body)">' + pct + '%</span>'
        + '</div></div>';
    }

    // ---- row actions menu (3-dot) -------------------------------------------
    function menuIcon(act, danger){
      if(danger) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      if(act==='open') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h6"/></svg>';
      if(act==='edit') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      if(act==='download') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      if(act==='copy') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      if(act==='chmod') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      if(act==='archive') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v6"/><path d="M9 11h6"/></svg>';
      if(act==='extract') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 16V10"/><path d="M9 13l3-3 3 3"/></svg>';
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    }
    var MENU_ITEMS = [
      { act: 'open', label: 'Open' },
      { act: 'edit', label: 'Edit' },
      { act: 'download', label: 'Download' },
      { act: 'copy', label: 'Copy' },
      { act: 'rename', label: 'Rename' },
      { act: 'chmod', label: 'Permissions' },
      { act: 'archive', label: 'Archive' },
      { act: 'extract', label: 'Extract' },
      { act: 'delete', label: 'Delete', danger: true },
    ];
    function menuHtml(name) {
      var e = state.entries.filter(function (x) { return x.name === name; })[0];
      if (!e) return '';
      var info = '';
      var sizeTxt = e.is_dir ? '—' : fmtBytes(e.size);
      var modeTxt = e.mode ? esc(e.mode) : '—';
      var dateTxt = e.mod_time ? new Date(e.mod_time * 1000).toLocaleString() : '—';
      info = '<div class=\\"ks-menu-info ks-only-sm\\"><div class=\\"ks-menu-info-row\\"><span class=\\"ks-menu-info-label\\">Size</span><span class=\\"ks-menu-info-value\\">' + esc(sizeTxt) + '</span></div>' + '<div class=\\"ks-menu-info-row\\"><span class=\\"ks-menu-info-label\\">Perms</span><span class=\\"ks-menu-info-value\\">' + modeTxt + '</span></div>' + '<div class=\\"ks-menu-info-row\\"><span class=\\"ks-menu-info-label\\">Modified</span><span class=\\"ks-menu-info-value\\">' + esc(dateTxt) + '</span></div></div>';
      var rows = info;
      MENU_ITEMS.forEach(function (it) {
        if (it.act === 'download' && e.is_dir) return;
        if (it.act === 'edit' && e.is_dir) return;
        if (it.act === 'extract' && (e.is_dir || !isArchiveName(e.name))) return;
        var cls = it.danger ? 'danger' : '';
        if (it.act === 'download') cls = cls ? cls + ' ks-only-sm' : 'ks-only-sm';
        rows += '<button type=\\"button\\" data-menu-act=\\"' + it.act + '\\" data-menu-name=\\"' + esc(name) + '\\"' + (cls ? ' class=\\"' + cls + '\\"' : '') + '>'
          + menuIcon(it.act, it.danger) + '<span>' + it.label + '</span></button>';
      });
      return '<div class=\\"ks-menu\\" id=\\"row-menu\\">' + rows + '</div>';
    }
    function positionMenu() {
      var menu = document.getElementById('row-menu');
      if (!menu) return;
      var b = null;
      var btns = document.querySelectorAll('[data-menu]');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-menu') === state.menuFor) { b = btns[i]; break; }
      }
      if (!b) return;
      var r = b.getBoundingClientRect();
      var mw = menu.offsetWidth || 180;
      var mh = menu.offsetHeight || 160;
      var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
      var top = r.bottom + 4;
      if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }
    function closeMenu(rerender) {
      if (!state.menuFor) return;
      state.menuFor = null;
      cleanupMenuListeners();
      if (rerender !== false) render();
    }
    async function menuAction(act, name) {
      var e = state.entries.filter(function (x) { return x.name === name; })[0];
      closeMenu();
      if (!e) return;
      if (act === 'open') {
        if (e.is_dir) { state.path = joinPath(state.path, name); load(state.path); }
        else openEditorEntry(e);
        return;
      }
      if (act === 'edit') { openEditorEntry(e); return; }
      if (act === 'download') { download(joinPath(state.path, name)); return; }
      if (act === 'rename') {
        state.modal = { kind: 'rename', entry: e, name: e.name, busy: false };
        render();
        var elr = document.getElementById('rename-name');
        if (elr) { elr.focus(); elr.select(); }
        return;
      }
      if (act === 'copy') {
        state.modal = { kind: 'copy', entry: e, name: e.name + '.copy', busy: false };
        render();
        var elc = document.getElementById('copy-name');
        if (elc) { elc.focus(); elc.select(); }
        return;
      }
      if (act === 'chmod') {
        state.modal = { kind: 'chmod', entry: e, mode: e.mode || '644', busy: false };
        render();
        var elm = document.getElementById('chmod-mode');
        if (elm) { elm.focus(); elm.select(); }
        return;
      }
      if (act === 'archive') {
        var def = e.name + '.zip';
        state.modal = { kind: 'archive', entry: e, name: def, busy: false };
        render();
        var ela = document.getElementById('archive-name');
        if (ela) { ela.focus(); ela.select(); }
        return;
      }
      if (act === 'extract') {
        state.modal = { kind: 'extract', entry: e, dest: '', busy: false };
        render();
        return;
      }
      if (act === 'delete') {
        var what = e.is_dir ? 'folder "' + name + '" and ALL its contents' : 'file "' + name + '"';
        if (!(await ask('Delete ' + what + '? This cannot be undone.'))) return;
        doDelete(joinPath(state.path, name))
          .then(function () { flash(true, 'Deleted ' + name); load(state.path); })
          .catch(function (err) { flash(false, (err && err.message) || 'Delete failed'); });
      }
    }

    // ---- main render ---------------------------------------------------------
    function render() {
      var crumbs = state.path.split('/').filter(Boolean);
      var crumbHtml = '<span style="white-space:nowrap">';
      if (crumbs.length === 0) crumbHtml += '<button type="button" data-crumb="/" style="border:none;background:transparent;padding:0;font-size:13px;cursor:pointer;font-family:inherit;color:var(--ks-heading)">/</button>';
      crumbs.forEach(function (seg, i) {
        var tgt = '/' + crumbs.slice(0, i + 1).join('/');
        crumbHtml += '<button type="button" data-crumb="' + esc(tgt) + '" style="border:none;background:transparent;padding:0;font-size:13px;cursor:pointer;font-family:inherit;color:' + (i === crumbs.length - 1 ? 'var(--ks-heading)' : 'var(--ks-muted)') + '">' + esc(seg) + '</button><span style="color:var(--ks-faint)">/</span>';
      });
      crumbHtml += '</span>';

      var q = state.search.trim().toLowerCase();
      var filtered = q ? state.entries.filter(function (e) { return String(e.name).toLowerCase().indexOf(q) >= 0; }) : state.entries;

      var rows = '';
      for (var i = 0; i < filtered.length; i++) {
        (function (e) {
          var kind = fileTypeOf(e);
          var isSel = !!state.selected[e.name];
          rows += '<tr data-ks-key="' + esc(e.name) + '" style="border-top:1px solid var(--ks-card-border)">'
            + '<td style="padding:8px 4px;width:32px"><input type="checkbox" data-check="' + esc(e.name) + '"' + (isSel ? ' checked' : '') + ' style="accent-color:var(--ks-info);width:14px;height:14px"></td>'
            + '<td style="padding:8px 6px;width:28px;color:' + iconColor(kind) + '">' + fileSvg(kind) + '</td>'
            + '<td style="padding:8px 12px"><span class="ks-files-name" style="display:inline-block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom">'
            + (e.is_dir
              ? '<button type="button" data-open="' + esc(e.name) + '" style="border:none;background:transparent;padding:0;color:var(--ks-heading);font-weight:500;cursor:pointer;font-size:13px;font-family:inherit" title="Open folder">' + esc(e.name) + '</button>'
              : '<button type="button" data-edit="' + esc(e.name) + '" style="border:none;background:transparent;padding:0;color:var(--ks-body);cursor:pointer;font-size:13px;font-family:inherit" title="Open in editor">' + esc(e.name) + '</button>')
            + '</span></td>'
            + '<td class="ks-hidden-sm ks-mono ks-muted" style="padding:8px 12px;text-align:right;font-size:12px;white-space:nowrap">' + (e.is_dir ? '\\u2014' : fmtBytes(e.size)) + '</td>'
            + '<td class="ks-hidden-sm ks-hidden-md ks-mono ks-muted" style="padding:8px 12px;text-align:right;font-size:12px">' + (e.mode ? esc(e.mode) : '') + '</td>'
            + '<td class="ks-hidden-sm ks-hidden-md ks-muted" style="padding:8px 12px;text-align:right;font-size:12px;white-space:nowrap">' + (e.mod_time ? new Date(e.mod_time * 1000).toLocaleString() : '') + '</td>'
            + '<td style="padding:4px;text-align:right;white-space:nowrap;width:44px">'
            + (e.is_dir ? '' : '<button type="button" class="ks-iconbtn ks-hidden-sm" data-download="' + esc(e.name) + '" title="Download" style="color:var(--ks-muted)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>')
            + '<button type="button" class="ks-iconbtn" data-menu="' + esc(e.name) + '" title="Actions" aria-label="Actions for ' + esc(e.name) + '"'
            + (state.menuFor === e.name ? ' style="color:var(--ks-heading);background:var(--ks-input-bg)"' : '') + '><svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>'
            + '</td></tr>';
        })(filtered[i]);
      }
      if (state.busy) {
        for (var si=0; si<6; si++) {
          rows += '<tr style="border-top:1px solid var(--ks-card-border)"><td style="padding:8px 4px;width:32px"><div class="ks-skeleton" style="width:14px;height:14px;border-radius:3px"></div></td><td style="padding:8px 6px;width:28px"><div class="ks-skeleton-avatar" style="width:16px;height:16px"></div></td><td style="padding:8px 12px"><div class="ks-skeleton-bar" style="height:10px;width:' + (56+si*8) + 'px"></div></td><td class="ks-hidden-sm" style="padding:8px 12px;text-align:right"><div class="ks-skeleton-bar" style="height:10px;width:42px;margin-left:auto"></div></td><td class="ks-hidden-sm ks-hidden-md" style="padding:8px 12px;text-align:right"><div class="ks-skeleton-bar" style="height:10px;width:36px;margin-left:auto"></div></td><td class="ks-hidden-sm ks-hidden-md" style="padding:8px 12px;text-align:right"><div class="ks-skeleton-bar" style="height:10px;width:64px;margin-left:auto"></div></td><td style="padding:4px;text-align:right"><div class="ks-skeleton-bar" style="height:20px;width:20px;border-radius:9999px;margin-left:auto"></div></td></tr>';
        }
      } else if (filtered.length === 0) {
        rows = '<tr><td colspan="7" class="ks-muted" style="text-align:center;padding:24px 12px;font-size:12px">' + (state.error ? esc(state.error) : 'This directory is empty or could not be read') + '</td></tr>';
      }

      var selCount = Object.keys(state.selected).filter(function (k) { return state.selected[k]; }).length;

      var html = ''
        + '<div class="ks-row ks-files-toolbar" style="align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
        + '<div class="ks-row ks-mono" style="min-height:24px;overflow-x:auto;max-width:100%">' + crumbHtml + '</div>'
        + '<div class="ks-row ks-files-actions" style="align-items:center;gap:8px;flex-wrap:wrap">'
        + '<input id="file-filter" type="text" value="' + esc(state.search) + '" placeholder="Filter…"'
        + ' style="width:130px;padding:7px 9px;font-size:12px;border-radius:6px">'
        + (selCount > 0 ? '<button title="Delete selected" aria-label="Delete selected" type="button" class="ks-btn-header ks-icon-btn" data-action="delete-sel"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span style="margin-left:4px">' + selCount + '</span></button>' : '')
        + '<button title="Refresh" aria-label="Refresh" type="button" class="ks-btn-header ks-icon-btn" data-action="refresh"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
        + '<button title="Upload" aria-label="Upload" type="button" class="ks-btn-header ks-icon-btn" data-action="show-upload"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>'
        + '<button title="Create" aria-label="Create" type="button" class="ks-btn-header ks-icon-btn" data-action="show-create"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
        + '</div></div>';

      html += '<div class="ks-card" style="overflow:auto;max-height:calc(100vh - 220px);max-height:calc(100dvh - 220px)" id="dropzone">'
        + '<table style="width:100%;font-size:13px;border-collapse:collapse"><tbody>' + rows + '</tbody></table>'
        + '</div>';

      html += buildModal();
      if (state.menuFor) html += menuHtml(state.menuFor);

      if (sftp.tab === 'sftp' && fxShowSftp()) html = fxSftpHtml();
      document.getElementById('root').innerHTML = fxTopHtml() + html;
      wire();
      positionMenu();

      // Restore filter focus/caret across re-renders so typing isn't broken.
      if (state.refocusFilter) {
        state.refocusFilter = false;
        var ff = document.getElementById('file-filter');
        if (ff) { ff.focus(); ff.setSelectionRange(ff.value.length, ff.value.length); }
      }
    }

    function wire() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-crumb]'), function (b) {
        b.addEventListener('click', function () { state.path = b.getAttribute('data-crumb'); load(state.path); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-check]'), function (b) {
        b.addEventListener('change', function () {
          var n = b.getAttribute('data-check');
          if (b.checked) state.selected[n] = true; else delete state.selected[n];
          render();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) {
        var n = b.getAttribute('data-open');
        b.addEventListener('click', function () { state.path = joinPath(state.path, n); load(state.path); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
        var n = b.getAttribute('data-edit');
        var entry = state.entries.filter(function (e) { return e.name === n; })[0];
        b.addEventListener('click', function () { if (entry) openEditorEntry(entry); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-download]'), function (b) {
        b.addEventListener('click', function () { download(joinPath(state.path, b.getAttribute('data-download'))); });
      });

      // 3-dot menu toggling + actions.
      Array.prototype.forEach.call(document.querySelectorAll('[data-menu]'), function (b) {
        var n = b.getAttribute('data-menu');
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          state.menuFor = state.menuFor === n ? null : n;
          render();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-menu-act]'), function (b) {
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          menuAction(b.getAttribute('data-menu-act'), b.getAttribute('data-menu-name'));
        });
      });
      if (state.menuFor) {
        document.addEventListener('click', onDocClickClose);
        document.addEventListener('keydown', onMenuEscape);
      }

      // top-bar actions
      var act = function (sel, fn) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.addEventListener('click', fn); });
      };
      act('[data-action="refresh"]', function () { load(state.path); });
      act('[data-action="modal-close"]', function () { state.modal = null; render(); });
      act('[data-action="show-create"]', function () { state.modal = { kind: 'create', name: '', busy: false }; state.createTab = 'file'; render(); var elc = document.getElementById('create-name'); if (elc) elc.focus(); });
      act('[data-action="show-upload"]', function () { state.modal = { kind: 'upload', busy: false, queue: [] }; state.uploadTab = 'local'; state.uploadPct = 0; state.urlPct = 0; state.uploadLabel = ''; render(); });
      act('[data-action="delete-sel"]', async function () {
        var names = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
        if (!(await ask('Delete ' + names.length + ' item' + (names.length === 1 ? '' : 's') + '? This cannot be undone.'))) return;
        Promise.all(names.map(function (n) { return doDelete(joinPath(state.path, n)).catch(function (e) { flash(false, n + ': ' + ((e && e.message) || 'failed')); }); }))
          .then(function () { flash(true, 'Deleted ' + names.length + ' item' + (names.length === 1 ? '' : 's')); load(state.path); });
      });

      // filter box \\u2014 typing re-renders the row list only (focus restored after)
      var filter = document.getElementById('file-filter');
      if (filter) {
        filter.addEventListener('input', function () {
          state.search = filter.value;
          state.refocusFilter = true;
          render();
        });
      }

      wireFx();
      // modal wiring
      Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (ov) {
        ov.addEventListener('click', function (ev) { if (ev.target === ov) { state.modal = null; render(); } });
      });
      var closeBtn = document.querySelector('.ks-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { state.modal = null; render(); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-ctab]'), function (b) {
        b.addEventListener('click', function () {
          state.createTab = b.getAttribute('data-ctab');
          var nm = document.getElementById('create-name');
          var cur = nm ? nm.value : '';
          state.modal.name = cur; render();
          var elc = document.getElementById('create-name'); if (elc) { elc.focus(); }
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-utab]'), function (b) {
        b.addEventListener('click', function () { state.uploadTab = b.getAttribute('data-utab'); render(); });
      });

      var createName = document.getElementById('create-name');
      if (createName) {
        createName.value = state.modal.name || '';
        createName.addEventListener('input', function () { state.modal.name = createName.value.trim(); });
        createName.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && state.modal.name && !state.modal.busy) confirmCreate();
          if (ev.key === 'Escape') { state.modal = null; render(); }
        });
      }
      act('[data-action="create-confirm"]', confirmCreate);
      function confirmCreate() {
        var name = (document.getElementById('create-name') || {}).value;
        name = (name || '').trim();
        if (!name) return;
        state.modal.busy = true; render();
        var p = joinPath(state.path, name);
        var after = function (msg) {
          state.modal = null; flash(true, msg); load(state.path);
        };
        if (state.createTab === 'file') {
          doWrite(p, '').then(function () { after('Created ' + name); setTimeout(function () { openPath(p); }, 350); })
            .catch(function (e) { state.modal.busy = false; flash(false, (e && e.message) || 'Create failed'); render(); });
        } else {
          doMkdir(p).then(function () { after('Created ' + name + '/'); })
            .catch(function (e) { state.modal.busy = false; flash(false, (e && e.message) || 'Create failed'); render(); });
        }
      }
      function openPath(p) {
        // open a freshly created empty file in the editor sub-page
        openEditorAt(p);
      }

      // upload modal \\u2014 local picker(s), folder picker and drag & drop all feed
      // the same sequential queue (files keep their relative paths).
      var upFile = document.getElementById('upload-file');
      if (upFile) {
        upFile.addEventListener('change', function () {
          var fs = Array.prototype.slice.call(upFile.files || []);
          queueUploads(fs.map(function (f) { return { file: f, rel: f.name }; }));
        });
        var dl = document.getElementById('drop-label');
        if (dl) {
          dl.addEventListener('dragover', function (ev) { ev.preventDefault(); });
          dl.addEventListener('drop', function (ev) {
            ev.preventDefault();
            collectDrop(ev.dataTransfer, function (items) { queueUploads(items); });
          });
        }
      }
      var pickFolder = document.getElementById('pick-folder');
      if (pickFolder) {
        var upFolder = document.getElementById('upload-folder');
        if (upFolder) {
          upFolder.addEventListener('change', function () {
            var fs = Array.prototype.slice.call(upFolder.files || []);
            queueUploads(fs.map(function (f) { return { file: f, rel: f.webkitRelativePath || f.name }; }));
          });
        }
      }
      var urlInput = document.getElementById('url-value');
      if (urlInput) {
        urlInput.value = state.modal.name || '';
        urlInput.addEventListener('input', function () { state.modal.name = urlInput.value.trim(); });
        urlInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && state.modal.name && !state.modal.busy) submitURL(); });
      }
      act('[data-action="url-upload"]', submitURL);
      function submitURL() {
        var u = (state.modal && state.modal.name) || '';
        if (!u) { flash(false, 'URL is required'); return; }
        state.modal.busy = true; render();
        state.urlPct = 5; render();
        var timer = setInterval(function () { if (state.urlPct < 90) { state.urlPct += 2; } }, 1200);
        doURLUpload(u, state.path)
          .then(function () {
            clearInterval(timer); state.urlPct = 100;
            flash(true, 'Uploaded from URL');
            state.modal = null; state.urlPct = 0; render(); load(state.path);
          })
          .catch(function (e) {
            clearInterval(timer); state.urlPct = 0;
            state.modal.busy = false; render();
            flash(false, (e && e.message) || 'Upload from URL failed');
          });
      }

      // rename modal
      var rn = document.getElementById('rename-name');
      if (rn) {
        rn.addEventListener('input', function () { state.modal.name = rn.value.trim(); });
        rn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && state.modal.name) confirmRename(); });
      }
      act('[data-action="rename-confirm"]', confirmRename);
      act('[data-action="copy-confirm"]', confirmCopy);
      act('[data-action="chmod-confirm"]', confirmChmod);
      act('[data-action="archive-confirm"]', confirmArchive);
      act('[data-action="extract-confirm"]', confirmExtract);
      act('[data-action="srvsearch-go"]', confirmSrvSearch);
      function confirmRename() {
        var m = state.modal;
        var nn = (document.getElementById('rename-name') || {}).value;
        nn = (nn || '').trim();
        if (!m || !m.entry || !nn) return;
        m.busy = true; render();
        doRename(joinPath(state.path, m.entry.name), joinPath(state.path, nn))
          .then(function () { state.modal = null; flash(true, 'Renamed to ' + nn); load(state.path); })
          .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'Rename failed'); render(); });
      }

  }

    // Close the 3-dot menu on any click outside of it.
    function onDocClickClose(ev) {
      if (!state.menuFor) { cleanupMenuListeners(); return; }
      var t = ev.target;
      if (t && t.closest && (t.closest('#row-menu') || t.closest('[data-menu]'))) return;
      closeMenu();
    }
    function onMenuEscape(ev) {
      if (ev.key === 'Escape') closeMenu();
    }
    function cleanupMenuListeners() {
      document.removeEventListener('click', onDocClickClose);
      document.removeEventListener('keydown', onMenuEscape);
    }

    // ---- drag & drop of FILES and FOLDERS onto the page ----------------------
    // walkEntry flattens dropped filesystem trees into {file, rel} pairs so a
    // dropped folder is recreated under the current directory (depth-capped).
    function walkEntry(entry, prefix, out, depth) {
      return new Promise(function (resolve) {
        if (!entry || depth > 8 || out.length >= 500) return resolve();
        if (entry.isFile) {
          entry.file(function (f) { out.push({ file: f, rel: prefix + entry.name }); resolve(); }, function () { resolve(); });
          return;
        }
        if (!entry.isDirectory) return resolve();
        var reader = entry.createReader();
        var sub = prefix + entry.name + '/';
        var next = function () {
          reader.readEntries(function (batch) {
            if (!batch.length) return resolve();
            Promise.all(batch.map(function (ent) { return walkEntry(ent, sub, out, depth + 1); })).then(next);
          }, function () { resolve(); });
        };
        next();
      });
    }
    function collectDrop(dt, cb) {
      var items = dt && dt.items;
      var plain = Array.prototype.slice.call((dt && dt.files) || []).map(function (f) { return { file: f, rel: f.webkitRelativePath || f.name }; });
      if (!items || !items.length || typeof items[0].webkitGetAsEntry !== 'function') { cb(plain); return; }
      var entries = [];
      for (var i = 0; i < items.length; i++) {
        var en = null;
        try { en = items[i].webkitGetAsEntry(); } catch (e) { en = null; }
        if (en) entries.push(en);
      }
      if (!entries.length) { cb(plain); return; }
      var out = [];
      Promise.all(entries.map(function (en) { return walkEntry(en, '', out, 0); }))
        .then(function () { cb(out.length ? out : plain); });
    }

      function queueUploads(items) {
        items = (items || []).filter(function (it) { return it && it.file; }).slice(0, 500);
        if (!items.length) return;
        if (state.modal && state.modal.kind === 'upload') state.modal.queue = items;
        runUploadQueue(items);
      }
      async function runUploadQueue(items) {
        state.modal.busy = true; state.uploadPct = 1; state.uploadLabel = ''; render();
        var ok = 0, failed = 0;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          state.uploadLabel = (i + 1) + '/' + items.length + ' \\u00b7 ' + it.rel;
          state.uploadPct = Math.round(((i) / items.length) * 100) || 1;
          render();
          var target = joinPath(state.path, it.rel);
          try {
            var idx = it.rel.lastIndexOf('/');
            if (idx > 0) await doMkdir(joinPath(state.path, it.rel.slice(0, idx)));
            await doUploadOne(it.file, target);
            ok++;
          } catch (e) {
            failed++;
            flash(false, it.rel + ': ' + ((e && e.message) || 'upload failed'));
          }
        }
        state.uploadPct = 100; state.uploadLabel = '';
        flash(failed === 0, 'Uploaded ' + ok + ' item' + (ok === 1 ? '' : 's') + (failed ? ', ' + failed + ' failed' : ''));
        state.modal = null; render(); load(state.path);
      }

  // ---- page config (Configure vars: show_sftp / files_home / files_jail) ----
    var FX_DEFAULTS = { show_sftp: 'true', files_home: '', files_jail: 'false' };
    function fxCfg(name) {
      try {
        var live = window.KS_PAGE_CONFIG || {};
        if (live[name] !== undefined && live[name] !== null && String(live[name]) !== '') return String(live[name]);
      } catch (e) {}
      return FX_DEFAULTS[name] || '';
    }
    function fxBool(name, dflt) {
      var v = fxCfg(name);
      if (v === '') return dflt;
      return v === 'true' || v === '1' || v === 'on';
    }
    function fxHome() {
      var h = fxCfg('files_home').trim().replace(/\\\\/g, '/');
      if (!h) return '';
      if (h[0] !== '/') h = '/' + h;
      h = h.replace(/\\/+/g, '/');
      if (h.length > 1 && h[h.length - 1] === '/') h = h.slice(0, -1);
      return h;
    }
    function fxJailOn() { return fxBool('files_jail', false) && fxHome() !== ''; }
    function fxClamp(p) {
      if (!fxJailOn()) return p;
      var h = fxHome();
      p = String(p || '/');
      if (p === h || p.indexOf(h + '/') === 0) return p;
      return h;
    }
    function fxShowSftp() { return fxBool('show_sftp', true); }

    // ---- extra file ops (parity with the Files builtin) ----
    function doCopy(from, to) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=copy&path=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), { method: 'POST' });
    }
    function doChmod(p, mode) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=chmod&path=' + encodeURIComponent(p) + '&mode=' + encodeURIComponent(mode), { method: 'POST' });
    }
    function doArchive(dir, names, dest) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=archive&path=' + encodeURIComponent(dir) + '&to=' + encodeURIComponent(dest), { method: 'POST', body: JSON.stringify({ names: names }) });
    }
    function doExtract(archive, dest) {
      var qs = '/api/instances/' + sdk.instance.id + '/files?op=extract&path=' + encodeURIComponent(archive);
      if (dest) qs += '&to=' + encodeURIComponent(dest);
      return sdk.fetchPanel(qs, { method: 'POST' });
    }
    function doServerSearch(dir, q) {
      return sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=search&path=' + encodeURIComponent(dir) + '&q=' + encodeURIComponent(q) + '&limit=100')
        .then(function (data) {
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
          data = data || {};
          return { entries: Array.isArray(data.entries) ? data.entries : [], truncated: !!data.truncated };
        });
    }
    function isArchiveName(name) {
      return /\\.(zip|tar\\.gz|tgz|tar|jar|7z|rar)$/i.test(String(name || ''));
    }

    // ---- SFTP view (mirrors the SFTP builtin card) ----
    var sftp = { tab: 'explorer', info: null, loading: false, error: '', revealed: '', busy: false };
    function loadSftp() {
      sftp.loading = true; sftp.error = ''; sftp.revealed = '';
      render();
      sdk.getSftp()
        .then(function (info) { sftp.loading = false; sftp.info = info || null; render(); })
        .catch(function (e) { sftp.loading = false; sftp.error = (e && e.message) || 'Failed to load SFTP status'; render(); });
    }
    function sftpBusy(p) {
      sftp.busy = true; sftp.error = '';
      render();
      return p.then(function (r) { sftp.busy = false; sftp.revealed = ''; loadSftp(); return r; })
        .catch(function (e) { sftp.busy = false; sftp.error = (e && e.message) || 'SFTP action failed'; render(); });
    }

    // ---- action-pill feedback ----
    var fxMsg = '', fxMsgTimer = null;
    function fxFlash(m) {
      fxMsg = m;
      if (fxMsgTimer) window.clearTimeout(fxMsgTimer);
      fxMsgTimer = window.setTimeout(function () { fxMsg = ''; render(); }, 1800);
    }

    // ---- top chrome: action pill + explorer/SFTP tabs (PageActionsPill /
    // PageTabsPill parity: ks-pill-anim shells, ks-pill-content collapse,
    // chevron toggle, auto-hide with idle restore) ----
    var fxPillOff = false, fxPillTimer = null;
    function fxShowPill() {
      if (fxPillTimer) { window.clearTimeout(fxPillTimer); fxPillTimer = null; }
    }
    function fxTopHtml() {
      var off = fxPillOff ? ' ks-pill-collapsed' : '';
      var cs = off
        ? 'display:flex;align-items:center;gap:4px;max-width:0;opacity:0;transform:translateX(8px);pointer-events:none;visibility:hidden;overflow:hidden;padding:0;margin:0'
        : 'display:flex;align-items:center;gap:4px;max-width:800px;opacity:1;transform:none;overflow:visible';
      var ts = off ? '--ks-tab-px:4px' : '--ks-tab-px:var(--ks-pill-tab-px,10px)';
      var h = '<div id="fx-pill-outer" style="position:fixed;top:12px;right:12px;z-index:40">'
        + '<div id="fx-pill" class="ks-card ks-pill-anim ks-actions-pill' + off + '" role="toolbar" aria-label="File actions" style="display:flex;align-items:center;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px">'
        + '<div class="ks-pill-content" style="' + cs + '" aria-hidden="' + (!!off) + '">'
        + '<button type="button" data-fx="pill-upload" title="Upload" aria-label="Upload" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>'
        + '<button type="button" data-fx="pill-new" title="Create file or folder" aria-label="Create" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
        + '<button type="button" data-fx="pill-search" title="Search on server" aria-label="Search on server" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20L16 16"/></svg></button>'
        + '<button type="button" data-fx="pill-refresh" title="Refresh" aria-label="Refresh" class="ks-btn-header ks-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
        + (fxMsg ? '<span style="font-size:12px;color:var(--ks-ok);white-space:nowrap;padding:0 4px">' + esc(fxMsg) + '</span>' : '')
        + '</div>'
        + '<button type="button" data-fx="pill-toggle" aria-label="' + (fxPillOff ? 'Show actions' : 'Hide actions') + '" aria-expanded="' + (!fxPillOff) + '" title="' + (fxPillOff ? 'Show actions' : 'Hide actions') + '" class="ks-tab ks-pill-toggle" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;' + ts + ';--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px)">' + (fxPillOff ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>') + '</button>'
        + '</div></div>';
      if (fxShowSftp()) {
        h += '<div class="ks-tabs" role="tablist" aria-label="Files views" style="margin-bottom:10px">'
          + '<button type="button" role="tab" aria-selected="' + (sftp.tab === 'explorer') + '" data-fx="tab-explorer" class="ks-tab' + (sftp.tab === 'explorer' ? ' ks-tab-active' : '') + '">Explorer</button>'
          + '<button type="button" role="tab" aria-selected="' + (sftp.tab === 'sftp') + '" data-fx="tab-sftp" class="ks-tab' + (sftp.tab === 'sftp' ? ' ks-tab-active' : '') + '">SFTP</button>'
          + '</div>'
          + '<div style="position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;justify-content:flex-start;pointer-events:none"><div style="pointer-events:auto;max-width:100%"><div class="ks-card ks-pill-anim ks-tabs-pill" role="tablist" aria-label="Files views" style="display:inline-flex;align-items:center;gap:6px;padding:6px;border-radius:8px;max-width:calc(100vw - 24px);--ks-card-padding:6px">'
          + '<button type="button" data-fx="tab-explorer" class="ks-tab" style="padding:6px 12px;font-size:13px;flex-shrink:0' + (sftp.tab === 'explorer' ? ';background:var(--ks-tab-active-bg,#fff);color:var(--ks-tab-active-text,#000)' : '') + '">Explorer</button>'
          + '<button type="button" data-fx="tab-sftp" class="ks-tab" style="padding:6px 12px;font-size:13px;flex-shrink:0' + (sftp.tab === 'sftp' ? ';background:var(--ks-tab-active-bg,#fff);color:var(--ks-tab-active-text,#000)' : '') + '">SFTP</button>'
          + '</div></div></div>'
          + '<div aria-hidden="true" style="height:64px"></div>';
      }
      return h;
    }
    function fxSftpHtml() {
      var h = '<div class="ks-card"><h3 style="margin:0 0 4px;font-size:15px;color:var(--ks-heading)">SFTP access</h3>'
        + '<p class="ks-muted" style="margin:0 0 12px;font-size:12px">Connect with any SFTP client. Credentials are vaulted per instance.</p>';
      if (sftp.loading) {
        h += '<div class="ks-skeleton-bar" style="height:12px;width:40%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:12px;width:65%"></div>';
      } else if (sftp.error) {
        h += '<p style="font-size:12px;color:var(--ks-bad);margin:0 0 12px">' + esc(sftp.error) + '</p>';
        h += '<button type="button" data-fx="sftp-retry" class="ks-btn">Retry</button>';
      } else if (!sftp.info || !sftp.info.enabled) {
        h += '<p class="ks-muted" style="font-size:12px;margin:0 0 12px">SFTP is disabled for this instance.</p>';
        h += '<button type="button" data-fx="sftp-enable" class="ks-btn" ' + (sftp.busy ? 'disabled style="opacity:.5"' : 'style="background:var(--ks-btn-bg,#fff);color:var(--ks-btn-text,#000)"') + '>Enable SFTP</button>';
      } else {
        var info = sftp.info;
        h += '<div class="ks-mono" style="font-size:12px;display:flex;flex-direction:column;gap:6px;margin-bottom:12px">'
          + '<div>Host: <span style="color:var(--ks-heading)">' + esc(info.host || '') + '</span></div>'
          + '<div>Port: <span style="color:var(--ks-heading)">' + esc(info.port != null ? String(info.port) : '') + '</span></div>'
          + '<div>Username: <span style="color:var(--ks-heading)">' + esc(info.username || '') + '</span></div>'
          + (sftp.revealed ? '<div>Password: <span style="color:var(--ks-warn)">' + esc(sftp.revealed) + '</span> <button type="button" data-fx="sftp-copy" class="ks-btn" style="padding:2px 10px;font-size:11px">Copy</button></div>' : '')
          + '</div>';
        h += '<div class="ks-row" style="gap:8px;flex-wrap:wrap">'
          + (sftp.revealed ? '' : '<button type="button" data-fx="sftp-reveal" class="ks-btn">Reveal password</button>')
          + '<button type="button" data-fx="sftp-rotate" class="ks-btn">Rotate password</button>'
          + '<button type="button" data-fx="sftp-disable" class="ks-btn ks-btn-red">Disable</button>'
          + '</div>';
        if (info.edge_error) h += '<p style="font-size:12px;color:var(--ks-warn);margin:12px 0 0">' + esc(info.edge_error) + '</p>';
      }
      return h + '</div>';
    }
    function wireFx() {
      var q = function (sel, fn) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) { b.addEventListener('click', fn); });
      };
      q('[data-fx="pill-upload"]', function () { state.modal = { kind: 'upload', busy: false, queue: [] }; state.uploadTab = 'local'; state.uploadPct = 0; state.urlPct = 0; state.uploadLabel = ''; render(); });
      q('[data-fx="pill-new"]', function () { state.modal = { kind: 'create', name: '', busy: false }; state.createTab = 'file'; render(); var elc = document.getElementById('create-name'); if (elc) elc.focus(); });
      q('[data-fx="pill-search"]', function () { state.modal = { kind: 'srvsearch', q: state.search || '', busy: false }; render(); var elc = document.getElementById('srvsearch-q'); if (elc) { elc.focus(); elc.select(); } });
      q('[data-fx="pill-refresh"]', function () { if (sftp.tab === 'sftp') loadSftp(); else load(state.path); });
      q('[data-fx="pill-toggle"]', function () { fxShowPill(); setFxPillOff(!fxPillOff); });
      // Hover restore rides on the CURRENT pill node (render() recreates it).
      var curFxPill = document.getElementById('fx-pill');
      if (curFxPill && !curFxPill.getAttribute('data-hover')) {
        curFxPill.setAttribute('data-hover', '1');
        curFxPill.addEventListener('mouseenter', function () { fxShowPill(); if (fxPillOff) setFxPillOff(false); });
      }
      q('[data-fx="tab-explorer"]', function () { sftp.tab = 'explorer'; render(); });
      q('[data-fx="tab-sftp"]', function () { sftp.tab = 'sftp'; loadSftp(); });
      q('[data-fx="sftp-retry"]', function () { loadSftp(); });
      q('[data-fx="sftp-enable"]', function () { ask('Enable SFTP for this instance?').then(function (ok) { if (ok) sftpBusy(sdk.enableSftp()); }); });
      q('[data-fx="sftp-rotate"]', function () { ask('Rotate the SFTP password?').then(function (ok) { if (ok) sftpBusy(sdk.rotateSftp()).then(function () { fxFlash('Rotated'); }); }); });
      q('[data-fx="sftp-disable"]', function () { ask('Disable SFTP for this instance?').then(function (ok) { if (ok) sftpBusy(sdk.disableSftp()); }); });
      q('[data-fx="sftp-reveal"]', function () {
        sftp.busy = true; render();
        sdk.revealSftp().then(function (r) {
          sftp.busy = false;
          sftp.revealed = (r && (r.password || r.value)) || '';
          render();
        }).catch(function (e) { sftp.busy = false; sftp.error = (e && e.message) || 'Reveal failed'; render(); });
      });
      q('[data-fx="sftp-copy"]', function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sftp.revealed).then(function () { fxFlash('Copied'); });
          else fxFlash('Copy unavailable');
        } catch (e) { fxFlash('Copy failed'); }
      });
      wireFxPillAutoHide();
    }
    // Chevron glyphs for the live toggle (resolved at bake time).
    var FX_CHEV_L = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
    var FX_CHEV_R = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
    // Live collapse: update the EXISTING pill nodes in place so the baked
    // 300ms transitions run. A full render() rebuild would snap instantly.
    function setFxPillOff(off) {
      fxPillOff = off;
      var host = document.getElementById('fx-pill');
      if (!host) return;
      if (off) host.classList.add('ks-pill-collapsed');
      else host.classList.remove('ks-pill-collapsed');
      var c = host.querySelector('.ks-pill-content');
      if (c) {
        if (off) { c.style.maxWidth = '0'; c.style.opacity = '0'; c.style.transform = 'translateX(8px)'; c.style.pointerEvents = 'none'; c.style.visibility = 'hidden'; c.style.overflow = 'hidden'; }
        else { c.style.maxWidth = '800px'; c.style.opacity = '1'; c.style.transform = 'none'; c.style.pointerEvents = 'auto'; c.style.visibility = 'visible'; c.style.overflow = 'visible'; }
        c.setAttribute('aria-hidden', off ? 'true' : 'false');
      }
      var tg = host.querySelector('[data-fx="pill-toggle"]');
      if (tg) {
        tg.setAttribute('aria-label', off ? 'Show actions' : 'Hide actions');
        tg.setAttribute('aria-expanded', off ? 'false' : 'true');
        tg.setAttribute('title', off ? 'Show actions' : 'Hide actions');
        tg.style.setProperty('--ks-tab-px', off ? '4px' : 'var(--ks-pill-tab-px,10px)');
        tg.innerHTML = off ? FX_CHEV_L : FX_CHEV_R;
      }
    }
    var fxPillAutoWired = false;
    // Pill auto-hide parity with PageActionsPill: scroll / outside-tap
    // collapses to the toggle, idle 2.5s restore. Document listeners bound
    // once; the pill node is re-queried every time (render() recreates it).
    function wireFxPillAutoHide() {
      if (fxPillAutoWired) return;
      fxPillAutoWired = true;
      try {
          var scheduleShow = function () {
            if (fxPillTimer) window.clearTimeout(fxPillTimer);
            fxPillTimer = window.setTimeout(function () { setFxPillOff(false); }, 2500);
          };
          document.addEventListener('scroll', function () {
            var p = document.getElementById('fx-pill');
            if (p && document.activeElement && p.contains(document.activeElement)) return;
            if (!fxPillOff) setFxPillOff(true);
            scheduleShow();
          }, true);
          document.addEventListener('pointerdown', function (ev) {
            var p = document.getElementById('fx-pill');
            if (!p) return;
            var path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
            var inside = path.indexOf(p) >= 0 || (ev.target && p.contains(ev.target));
            if (!inside && !fxPillOff) setFxPillOff(true);
          });
          document.addEventListener('focusin', function (ev) {
            var p = document.getElementById('fx-pill');
            if (p && ev.target && p.contains(ev.target)) { fxShowPill(); if (fxPillOff) setFxPillOff(false); }
          });
      } catch (e) {}
    }
    function confirmCopy() {
      var m = state.modal;
      var nn = ((document.getElementById('copy-name') || {}).value || '').trim();
      if (!m || !m.entry || !nn) return;
      if (nn.indexOf('/') >= 0) { flash(false, 'Name cannot contain /'); return; }
      m.busy = true; render();
      doCopy(joinPath(state.path, m.entry.name), joinPath(state.path, nn))
        .then(function () { state.modal = null; flash(true, 'Copied to ' + nn); load(state.path); })
        .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'Copy failed'); render(); });
    }
    function confirmChmod() {
      var m = state.modal;
      var mode = ((document.getElementById('chmod-mode') || {}).value || '').trim();
      if (!m || !m.entry || !/^[0-7]{3,4}$/.test(mode)) { flash(false, 'Mode must be 3-4 octal digits (e.g. 644)'); return; }
      m.busy = true; render();
      doChmod(joinPath(state.path, m.entry.name), mode)
        .then(function () { state.modal = null; flash(true, 'Permissions updated'); load(state.path); })
        .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'chmod failed'); render(); });
    }
    function confirmArchive() {
      var m = state.modal;
      var dest = ((document.getElementById('archive-name') || {}).value || '').trim();
      if (!m || !dest) return;
      if (!/\\.(zip|tar\\.gz|tgz)$/i.test(dest)) { flash(false, 'Archive name must end with .zip or .tar.gz'); return; }
      if (dest.indexOf('/') >= 0) { flash(false, 'Name cannot contain /'); return; }
      m.busy = true; render();
      var names = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
      if (!names.length && m.entry) names = [m.entry.name];
      if (!names.length) names = [];
      doArchive(state.path, names, joinPath(state.path, dest))
        .then(function () { state.modal = null; flash(true, 'Archive created'); load(state.path); })
        .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'Archive failed'); render(); });
    }
    function confirmExtract() {
      var m = state.modal;
      if (!m || !m.entry) return;
      var dest = ((document.getElementById('extract-dest') || {}).value || '').trim();
      m.busy = true; render();
      doExtract(joinPath(state.path, m.entry.name), dest ? joinPath(state.path, dest) : '')
        .then(function () { state.modal = null; flash(true, 'Archive extracted'); load(state.path); })
        .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'Extract failed'); render(); });
    }
    function confirmSrvSearch() {
      var m = state.modal;
      var q = ((document.getElementById('srvsearch-q') || {}).value || '').trim();
      if (!m || !q) return;
      m.busy = true; render();
      doServerSearch(state.path, q)
        .then(function (r) {
          state.modal = null;
          state.entries = (r.entries || []).slice().sort(function (a, b) {
            if (!!a.is_dir !== !!b.is_dir) return a.is_dir ? -1 : 1;
            return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
          });
          state.selected = {};
          flash(true, state.entries.length + ' result' + (state.entries.length === 1 ? '' : 's') + (r.truncated ? ' (truncated)' : '') + ' — Refresh to clear');
          render();
        })
        .catch(function (e) { m.busy = false; flash(false, (e && e.message) || 'Search failed'); render(); });
    }
    function start(s) {
      sdk = s;
      state.root = fxHome() || computeRoot();
      state.path = fxClamp(state.root);
      load(state.path);
      render();
      setInterval(function () { if (!state.modal && !state.menuFor && Object.keys(state.selected).length===0) load(state.path); }, 15000);

      document.addEventListener('dragover', function (ev) { ev.preventDefault(); });
      document.addEventListener('drop', function (ev) {
        ev.preventDefault();
        // Drops on the modal's own dropzone are handled by its dedicated
        // listener \\u2014 skip here so the file isn't uploaded twice.
        if (ev.target && ev.target.closest && ev.target.closest('#drop-label')) return;
        if (state.modal && state.modal.kind === 'upload' && state.modal.busy) return;
        collectDrop(ev.dataTransfer, function (items) {
          if (!items.length) return;
          if (state.modal && state.modal.kind === 'upload') { queueUploads(items); return; }
          state.modal = { kind: 'upload', busy: false, queue: items };
          state.uploadTab = 'local'; state.uploadPct = 0; state.uploadLabel = '';
          render();
          runUploadQueue(items);
        });
      });
    }

    if (window.KSPageSDK) start(window.KSPageSDK);
    else window.addEventListener('ks-page-sdk-ready', function () { start(window.KSPageSDK); }, { once: true });
  })();
  <\/script>
icon_svg: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2-2Z"/>
sub_pages:
- path: edit
  name: Editor
  content_type: html
  content_html: |
    {{component:ks_theme_head}}<div id="ed" style="display:flex;flex-direction:column;gap:10px;height:calc(100vh - 2rem);min-height:420px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <h2 style="font-size:18px;font-weight:600;color:var(--ks-heading);margin:0">Editor</h2>
          <p id="ed-path" class="ks-mono ks-muted" style="font-size:11px;margin:2px 0 0;word-break:break-all"></p>
        </div>
        <div class="ks-row" style="flex-wrap:wrap">
          <button type="button" class="ks-btn-header ks-icon-btn" id="ed-back" title="Back to the Files page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;margin-right:4px"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg> Files</button>
          <button type="button" class="ks-btn-header ks-icon-btn" id="ed-reload" title="Re-read the file from disk"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
          <button type="button" class="ks-btn-header ks-icon-btn" id="ed-save" title="Write the file (Ctrl+S)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
        </div>
      </div>
      <div class="ks-card" style="flex:1;display:flex;flex-direction:column;margin-bottom:0;padding:10px">
        <textarea id="ed-text" spellcheck="false" style="flex:1;width:100%;box-sizing:border-box;min-height:300px;resize:vertical;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5"></textarea>
      </div>
      <p id="ed-status" class="ks-muted" style="font-size:11px;margin:0">Ready.</p>
    </div>

    <script>
    (function () {
      'use strict';
      var started = false;
      function qparam(name) {
        var q = String(window.KS_PAGE_QUERY || '');
        var m = q.match(new RegExp('[?&]' + name + '=([^&]*)'));
        return m ? decodeURIComponent(m[1].replace(/\\+/g, ' ')) : '';
      }
      function start() {
        if (started) return;
        started = true;
        var sdk = window.KSPageSDK;
        var ta = document.getElementById('ed-text');
        var statusEl = document.getElementById('ed-status');
        var path = qparam('path');
        try {
          var __cfg = window.KS_PAGE_CONFIG || {};
          var __home = String(__cfg.files_home || '').trim().replace(/\\\\/g, '/');
          if (__home !== '' && __home[0] !== '/') __home = '/' + __home;
          __home = __home.replace(/\\/+/g, '/');
          if (__home.length > 1 && __home[__home.length - 1] === '/') __home = __home.slice(0, -1);
          var __jail = (String(__cfg.files_jail || '') === 'true' || String(__cfg.files_jail || '') === '1') && __home !== '';
          if (__jail && __home && !(path === __home || path.indexOf(__home + '/') === 0)) path = __home;
        } catch (e) {}
        var dirty = false;
        // ask() routes through the panel's themed ConfirmDialog when available.
        function ask(m) {
          try { if (sdk && typeof sdk.confirm === 'function') return sdk.confirm(m); } catch (e) {}
          return Promise.resolve(window.confirm(m));
        }
        function say(msg, bad) {
          if (!statusEl) return;
          statusEl.textContent = msg;
          statusEl.style.color = bad ? 'var(--ks-bad)' : 'var(--ks-muted)';
        }
        function load() {
          if (!sdk || !sdk.instance) { say('SDK unavailable', true); return; }
          say('Loading ' + path + '\\u2026');
          sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files/read?path=' + encodeURIComponent(path))
            .then(function (t) {
              ta.value = typeof t === 'string' ? t : '';
              dirty = false;
              say('Loaded ' + path + ' \\u00b7 ' + ta.value.length + ' bytes');
            })
            .catch(function (e) { say((e && e.message) || 'Read failed', true); });
        }
        async function goBack() {
          if (dirty && !(await ask('Discard unsaved changes to "' + path + '"?'))) return;
          try { sdk.navigate('/instances/' + sdk.instance.id + '/files'); }
          catch (e) { say((e && e.message) || 'Cannot go back', true); }
        }
        function save() {
          say('Saving\\u2026');
          sdk.fetchPanel('/api/instances/' + sdk.instance.id + '/files?op=write&path=' + encodeURIComponent(path), {
            method: 'POST', body: ta.value, headers: { 'Content-Type': 'text/plain' },
          })
            .then(function () {
              dirty = false;
              say('Saved ' + path + ' \\u00b7 ' + ta.value.length + ' bytes');
              try { sdk.toast('Saved ' + path, 'success'); } catch (e) { /* ignore */ }
            })
            .catch(function (e) { say((e && e.message) || 'Write failed', true); });
        }
        document.getElementById('ed-path').textContent = path || '(no ?path= given \\u2014 open a file from the Files page)';
        document.getElementById('ed-save').addEventListener('click', function () { if (path) save(); });
        document.getElementById('ed-reload').addEventListener('click', async function () {
          if (!path) return;
          if (dirty && !(await ask('Reload from disk and discard your unsaved changes?'))) return;
          load();
        });
        document.getElementById('ed-back').addEventListener('click', goBack);
        ta.addEventListener('input', function () { if (!dirty) { dirty = true; say('Unsaved changes'); } });
        document.addEventListener('keydown', function (ev) {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') { ev.preventDefault(); if (path) save(); }
        });
        if (!sdk) { say('SDK unavailable outside an instance view.', true); return; }
        if (path) load();
        else say('No file path given \\u2014 open a file from the Files page.', true);
      }
      if (window.KSPageSDK) start();
      else window.addEventListener('ks-page-sdk-ready', start, { once: true });
    })();
    <\/script>
configure:
- name: show_sftp
  label: Show SFTP view
  description: Show the Explorer / SFTP tabs on the Files page.
  default: 'true'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: toggle
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: files_home
  label: Home folder
  description: Folder the Files page opens by default (e.g. /mc). Empty = volume mount root.
  default: ''
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: text
  options: ''
  append: false
  prepend: ''
  append_value: ''
- name: files_jail
  label: Lock to home folder
  description: Operators can't navigate above the home path, but see everything inside it.
  default: 'false'
  user_viewable: true
  user_editable: true
  required: false
  rule: ''
  display: toggle
  options: ''
  append: false
  prepend: ''
  append_value: ''
`,pn={terminal:dn,files:cn};function un(i){const r=pn[i];if(!r)return null;let t=null;try{t=tn(r)}catch{return null}if(!t||typeof t!="object")return null;const v=String(t.content_type||"html").toLowerCase(),s=v==="markdown"||v==="blocks"||v==="react"||v==="html"?v:"html",n={type:s};return s==="html"&&(n.html=String(t.content_html||"")),s==="markdown"&&(n.markdown=String(t.content_markdown||t.content_html||"")),s==="blocks"&&(n.blocks=String(t.content_blocks||"")),Array.isArray(t.actions)&&(n.actions=t.actions),Array.isArray(t.components)&&(n.components=t.components),Array.isArray(t.configure)&&(n.configure=t.configure),t.config&&typeof t.config=="object"&&(n.config=t.config),n}const fn=({instanceId:i,slug:r})=>{const{instance:t,loading:v}=ee(i),s=De.useMemo(()=>un(r),[r]);if(v)return e.jsxs("div",{className:"glass-card rounded-xl flex items-center gap-4 animate-pulse",children:[e.jsx("div",{className:"w-9 h-9 rounded-lg bg-neutral-800 shrink-0"}),e.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})]});if(!t||!s)return e.jsx("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:e.jsx("p",{className:"text-sm",children:"Page unavailable."})});const n={id:t.id,name:t.name,kind:t.kind,status:t.status,template_id:t.template_id,template_name:t.template_name??null,node_id:t.node_id,node_name:t.node_name??null,owner_id:t.owner_id??null,owner_name:t.owner_name??null,config:t.config?t.config:{},external_id:t.external_id??"",created_at:t.created_at??"",updated_at:t.updated_at??"",install_state:t.install_state??"",install_kind:t.install_kind??"",install_step:typeof t.install_step=="number"?t.install_step:-1,install_error:t.install_error??"",install_steps_json:t.install_steps_json??"",install_action_id:t.install_action_id??"",display_name:t.display_name??"",icon:t.icon??"",color:t.color??""};return e.jsx(Te,{content:s,title:r==="terminal"?"Terminal":"Files",instanceContext:n,pageSlug:r})},V=i=>`/api/instances/${i}/sftp`;async function mn(i){return(await K.get(V(i))).data}async function hn(i){return(await K.post(`${V(i)}/enable`)).data}async function xn(i){return(await K.post(`${V(i)}/rotate`)).data}async function vn(i){return(await K.post(`${V(i)}/disable`)).data}async function gn(i){const r=await K.get(`${V(i)}?reveal=1`);if(r.data&&typeof r.data.password=="string"&&r.data.password!=="")return r.data.password;throw new Error("Password not returned (missing INSTANCES_EDIT?)")}function L(i,r="info"){window.dispatchEvent(new CustomEvent("ks-toast",{detail:{message:i,type:r}}))}function ae(i){const r=()=>L("Copied to clipboard","success");if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(i).then(r,()=>L("Copy failed","error"));return}try{const t=document.createElement("textarea");t.value=i,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),r()}catch{L("Copy failed","error")}}const bn=({instanceId:i})=>{const r=Pe(w=>w.permissions),t=U(r,y.INSTANCES_EDIT,y.MANAGE_INSTANCES),v=Se(),[s,n]=p.useState(null),[_,h]=p.useState(!1),[S,c]=p.useState(!0),[P,T]=p.useState(!1),[E,g]=p.useState(""),[C,b]=p.useState(""),[N,j]=p.useState(!1),B=p.useCallback(async()=>{var w,m,l;if(i){c(!0),g("");try{const u=await mn(i);n(u),h(!1),u.password&&(b(u.password),j(!0))}catch(u){((w=u==null?void 0:u.response)==null?void 0:w.status)===404?(n(null),h(!0),b(""),j(!1)):g(((l=(m=u==null?void 0:u.response)==null?void 0:m.data)==null?void 0:l.error)||(u==null?void 0:u.message)||"Failed to load SFTP status")}finally{c(!1)}}},[i]);p.useEffect(()=>{B()},[B]);const A=async()=>{var w;T(!0),g("");try{const m=await hn(i);n(m),h(!1),m.password&&(b(m.password),j(!0)),L(m.edge_error?"SFTP vaulted but edge provision failed — rotate to retry":"SFTP enabled",m.edge_error?"error":"success"),m.port_warning&&L(String(m.port_warning),"info")}catch(m){const l=((w=m==null?void 0:m.response)==null?void 0:w.data)||(m==null?void 0:m.message)||"Failed to enable SFTP";g(typeof l=="string"?l:JSON.stringify(l)),L(typeof l=="string"?l:"Failed to enable SFTP","error")}finally{T(!1)}},M=async()=>{var m;if(await v({title:"Rotate SFTP password?",message:"The current password stops working immediately. Update FileZilla / WinSCP with the new one.",confirmLabel:"Rotate",tone:"default"})){T(!0),g("");try{const l=await xn(i);n(l),l.password&&(b(l.password),j(!0)),L(l.edge_error?"Password rotated in vault but edge re-provision failed — rotate again":"SFTP password rotated",l.edge_error?"error":"success")}catch(l){const u=((m=l==null?void 0:l.response)==null?void 0:m.data)||(l==null?void 0:l.message)||"Failed to rotate SFTP password";g(typeof u=="string"?u:JSON.stringify(u)),L(typeof u=="string"?u:"Failed to rotate SFTP password","error")}finally{T(!1)}}},W=async()=>{var m;if(await v({title:"Disable SFTP?",message:"Removes the SFTP identity from the edge and deletes the vaulted password. This cannot be undone.",confirmLabel:"Disable",tone:"danger"})){T(!0),g("");try{await vn(i),n(null),h(!0),b(""),j(!1),L("SFTP disabled","success")}catch(l){const u=((m=l==null?void 0:l.response)==null?void 0:m.data)||(l==null?void 0:l.message)||"Failed to disable SFTP";g(typeof u=="string"?u:JSON.stringify(u)),L(typeof u=="string"?u:"Failed to disable SFTP","error")}finally{T(!1)}}},$=async()=>{var w,m;T(!0),g("");try{const l=await gn(i);b(l),j(!0)}catch(l){const u=((m=(w=l==null?void 0:l.response)==null?void 0:w.data)==null?void 0:m.error)||(l==null?void 0:l.message)||"Failed to reveal password";g(typeof u=="string"?u:JSON.stringify(u)),L("Failed to reveal password","error")}finally{T(!1)}};if(S)return e.jsx("div",{className:"glass-card rounded-xl p-6 animate-pulse",children:e.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})});if(_||!s)return e.jsxs("div",{className:"glass-card rounded-xl p-6 space-y-3",children:[e.jsx("h2",{className:"text-xl font-semibold",style:{color:"var(--ks-heading)"},children:"SFTP access"}),E&&e.jsx("div",{className:"ks-card",style:{borderColor:"var(--ks-bad-line)",color:"var(--ks-bad)",fontSize:12},children:E}),e.jsx("p",{className:"text-sm text-gray-400",children:"This instance has no SFTP credentials yet."}),t?e.jsx("button",{type:"button",onClick:A,disabled:P,className:"px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50",children:P?"Enabling…":"Enable SFTP"}):e.jsx("p",{className:"text-xs text-gray-500",children:"You need INSTANCES_EDIT permission to enable SFTP."})]});const F=`sftp -P ${s.port} ${s.username}@${s.host}`;return e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"glass-card rounded-xl p-6 space-y-4",children:[e.jsxs("div",{className:"flex items-center justify-between gap-4 flex-wrap",children:[e.jsx("h2",{className:"text-xl font-semibold",style:{color:"var(--ks-heading)"},children:"SFTP access"}),!s.enabled&&e.jsx("span",{className:"ks-badge",style:{color:"var(--ks-bad)"},children:"Suspended — auth blocked"})]}),E&&e.jsx("div",{className:"ks-card",style:{borderColor:"var(--ks-bad-line)",color:"var(--ks-bad)",fontSize:12},children:E}),s.edge_error&&e.jsxs("div",{className:"ks-card",style:{borderColor:"var(--ks-bad-line)",color:"var(--ks-bad)",fontSize:12},children:["Edge provision failed: ",String(s.edge_error),". Rotate to retry."]}),e.jsxs("p",{className:"text-sm text-gray-400",children:["Connect with FileZilla, WinSCP or ",e.jsx("code",{className:"text-gray-200",children:F})]}),e.jsx("div",{className:"overflow-x-auto",children:e.jsx("table",{className:"w-full text-sm",children:e.jsxs("tbody",{children:[e.jsxs("tr",{className:"border-b border-white/5",children:[e.jsx("td",{className:"px-4 py-2 text-gray-400 w-32",children:"Host"}),e.jsx("td",{className:"px-4 py-2 font-mono text-white",children:s.host})]}),e.jsxs("tr",{className:"border-b border-white/5",children:[e.jsx("td",{className:"px-4 py-2 text-gray-400",children:"Port"}),e.jsx("td",{className:"px-4 py-2 font-mono text-white",children:s.port})]}),e.jsxs("tr",{className:"border-b border-white/5",children:[e.jsx("td",{className:"px-4 py-2 text-gray-400",children:"Username"}),e.jsx("td",{className:"px-4 py-2 font-mono text-white",children:s.username})]}),e.jsxs("tr",{className:"border-b border-white/5",children:[e.jsx("td",{className:"px-4 py-2 text-gray-400",children:"Password"}),e.jsx("td",{className:"px-4 py-2 font-mono text-white",children:N&&C?e.jsx("span",{children:C}):e.jsx("span",{className:"text-gray-500",children:"•••• (vaulted — use Reveal)"})})]}),e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-2 text-gray-400",children:"URI"}),e.jsx("td",{className:"px-4 py-2 font-mono text-gray-300 break-all",children:s.uri})]})]})})}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[N&&C?e.jsx("button",{type:"button",onClick:()=>j(!1),className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white",children:"Hide"}):e.jsx("button",{type:"button",onClick:$,disabled:P,className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white disabled:opacity-50",children:"Reveal password"}),N&&C&&e.jsx("button",{type:"button",onClick:()=>ae(C),className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white",children:"Copy password"}),e.jsx("button",{type:"button",onClick:()=>ae(s.uri),className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white",children:"Copy URI"}),e.jsx("button",{type:"button",onClick:()=>ae(F),className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white",children:"Copy CLI"}),t&&e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",onClick:M,disabled:P,className:"px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white disabled:opacity-50",children:"Rotate"}),e.jsx("button",{type:"button",onClick:W,disabled:P,className:"px-3 py-1.5 rounded-md text-sm bg-red-800 text-white hover:bg-red-700 disabled:opacity-50",children:"Disable"})]})]}),!t&&e.jsx("p",{className:"text-xs text-gray-500",children:"You need INSTANCES_EDIT permission to rotate or disable SFTP."})]}),e.jsxs("div",{className:"glass-card rounded-xl p-6 space-y-2",children:[e.jsx("h3",{className:"text-sm font-semibold",style:{color:"var(--ks-heading)"},children:"Client hints"}),e.jsx("p",{className:"text-xs text-gray-400",children:"FileZilla: File → Site Manager → SFTP, host + port + user + password."}),e.jsx("p",{className:"text-xs text-gray-400",children:"WinSCP: New Session → SFTP, same fields."}),e.jsxs("p",{className:"text-xs text-gray-400",children:["CLI: ",e.jsx("code",{className:"text-gray-200",children:F})]})]})]})},Nn=()=>{const{id:i}=Ne(),r=Number(i),{instance:t,loading:v}=ee(r),s=re();p.useEffect(()=>{if(!r)return;const h=S=>{const c=S.detail,P=Ze(r,c==null?void 0:c.to);P&&s(P)};return window.addEventListener("ks-navigate",h),()=>window.removeEventListener("ks-navigate",h)},[r,s]);const n=p.useMemo(()=>t!=null&&t.config?Q(t.config):null,[t==null?void 0:t.config]);Ye(r,n,v);const _=p.useMemo(()=>({instanceId:r}),[r]);return e.jsxs("div",{className:"space-y-3",children:[v&&e.jsxs("div",{className:"ks-card ks-form-card rounded-xl flex items-center gap-4 animate-pulse",children:[e.jsx("div",{className:"w-9 h-9 rounded-lg bg-neutral-800 shrink-0"}),e.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})]}),e.jsx(Xe,{name:"instance.detail.tabs",context:_}),e.jsx(ie,{resetKey:r,label:"instance-panel",children:e.jsx(nn,{})})]})},yn=({slug:i})=>e.jsxs("div",{className:"glass-card rounded-xl text-center text-gray-400 space-y-2",children:[e.jsx("p",{className:"text-sm pt-2",children:"This instance has no pages yet."}),e.jsx("p",{className:"text-xs text-gray-500 pb-3",children:"Import pages (Home, Terminal, Files, Ports, Env, Metrics, …) from the Instance Pages library in the template or deploy editor. Automation always works — it lives in the floating instance menu."}),e.jsxs("code",{className:"text-[11px] text-gray-600 block pb-3",children:["resolved route: /",i]})]}),Cn=()=>{var C;const{id:i,"*":r}=Ne(),t=Number(i),v=re(),{instance:s,loading:n,error:_}=ee(t);if(n)return e.jsxs("div",{className:"glass-card rounded-xl flex items-center gap-4 animate-pulse",children:[e.jsx("div",{className:"w-9 h-9 rounded-lg bg-neutral-800 shrink-0"}),e.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})]});if(!s||_)return e.jsx(Ee,{variant:"not-found",title:"Instance not found",description:_&&_!=="Instance not found"&&_!=="Instance not found."?_:void 0,backLabel:"Back to instances",onBack:()=>v("/instances")});const h=s.config?Q(s.config):null,S=(r??"").replace(/\/+$/,""),c=S===""?".":S;if(c==="sftp")return e.jsx(bn,{instanceId:t});if(c==="terminal"||c==="files")return Z(s.config)[c==="terminal"?"show_terminal_page":"show_files_page"]?e.jsx(fn,{instanceId:t,slug:c}):e.jsx("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:e.jsx("p",{className:"text-sm",children:"This page is disabled for this instance."})});const P=["details","monitoring","manage","activity"];if(c==="overview"){const b=Z(s.config),N=A=>A==="details"?"show_details_tab":A==="monitoring"?"show_monitoring_tab":A==="manage"?"show_manage_tab":"show_activity_tab",j=P.includes(b.default_tab)?b.default_tab:"details",B=b[N(j)]?j:P.find(A=>b[N(A)])??"details";return e.jsx(se,{to:`/instances/${t}/${B}`,replace:!0})}if(P.includes(c))return Z(s.config)[c==="details"?"show_details_tab":c==="monitoring"?"show_monitoring_tab":c==="manage"?"show_manage_tab":"show_activity_tab"]?e.jsx(on,{instanceId:t,section:c}):e.jsx("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:e.jsx("p",{className:"text-sm",children:"This page is disabled for this instance."})});if(c==="."){const b=je(h==null?void 0:h.home_page,h);if(b)return e.jsx(se,{to:`/instances/${t}/${b}`,replace:!0})}const T={id:s.id,name:s.name,kind:s.kind,status:s.status,template_id:s.template_id,template_name:s.template_name??null,node_id:s.node_id,node_name:s.node_name??null,owner_id:s.owner_id??null,owner_name:s.owner_name??null,config:s.config?Q(s.config):{},external_id:s.external_id??"",created_at:s.created_at??"",updated_at:s.updated_at??"",install_state:s.install_state??"",install_kind:s.install_kind??"",install_step:typeof s.install_step=="number"?s.install_step:-1,install_error:s.install_error??"",install_steps_json:s.install_steps_json??"",install_action_id:s.install_action_id??"",display_name:s.display_name??"",icon:s.icon??"",color:s.color??""};if(!$e(c,h))return c==="."&&!(((C=h==null?void 0:h.pages)==null?void 0:C.length)>0)?e.jsx(yn,{slug:""}):e.jsx("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:e.jsxs("p",{className:"text-sm",children:["This page (",e.jsxs("code",{className:"text-gray-300",children:["/",S||"home"]}),") is not part of this instance's template."]})});const E=Ge(c,h)??(c==="."?"Home":c),g=Je(c,h);return!g||!g.html&&!g.markdown&&!g.blocks&&!g.bundle?e.jsxs("div",{className:"glass-card rounded-xl text-center text-gray-400",children:[e.jsxs("p",{className:"text-sm",children:["This page (",e.jsxs("code",{className:"text-gray-300",children:["/",S]}),") has no content."]}),e.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Re-import it from the Instance Pages library to restore its definition."})]}):e.jsx(ie,{resetKey:`${c}-${t}`,label:"instance-page",children:e.jsx(Te,{content:g,title:E,instanceContext:T,pageSlug:c})})};export{Cn as InstanceDynamicPage,Nn as InstancePanel,Nn as default};
