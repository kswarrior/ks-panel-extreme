import{r as F,j as R,R as Ee}from"./react-CQbZUORi.js";import{b2 as Re,u as Ye,b3 as W,b4 as lt}from"./index-DPcjkybs.js";import{a as ct,u as dt}from"./router-CncShCvU.js";function Xe(t,o,e,r,s){const n=`${o==="https:"?"wss:":"ws:"}//${t}/api/instances/${e}/${r==="startup"?"startup":r==="workflow"?"workflow":"terminal"}`,l=[],p=String((s==null?void 0:s.terminal)??"").trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_-]/g,"").slice(0,64);p&&l.push(`terminal=${encodeURIComponent(p)}`);const c=String((s==null?void 0:s.timeout)??"").trim().replace(/[^0-9]/g,"").slice(0,6);return c&&c!=="0"&&l.push(`timeout=${encodeURIComponent(c)}`),l.length>0?`${n}?${l.join("&")}`:n}function pt(t){const o=String(t??"").replace(/\s+/g,"");if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(o)||o.length%4!==0)throw new Error("uploadFile: invalid base64 payload");const e=atob(o),r=new Uint8Array(e.length);for(let s=0;s<e.length;s++)r[s]=e.charCodeAt(s);return r}function ut(t){const o=new Uint8Array(t),e=32768;let r="";for(let s=0;s<o.length;s+=e)r+=String.fromCharCode.apply(null,Array.from(o.subarray(s,s+e)));return btoa(r)}window.KSPageSDK=null;function ft(t,o){if(typeof o!="string")return null;const e=o.trim();if(!e||e.length>2048||/^[a-z][a-z0-9+.-]*:/i.test(e)||e.startsWith("//"))return null;const r=e.indexOf("?");if((r>=0?e.slice(0,r):e).split("/").some(n=>n==="."||n===".."))return null;const a=`/instances/${t}`;return e===a||e.startsWith(a+"/")||e.startsWith(a+"?")?e:null}const bt=/^[a-z0-9_-]{1,64}$/;function ze(t){return typeof t=="string"&&bt.test(t)}function Ce(t,o,e){try{const r=String(t??""),s=r.startsWith("#")?r.slice(1):r;if(!s)return e;const n=new URLSearchParams(s).get("tab");if(n!==null&&ze(n)&&o.includes(n))return n}catch{}return e}function mt(t){return`#tab=${t}`}function kt(t){if(!ze(t))return!1;try{if(typeof window>"u")return!1;if(window.history&&typeof window.history.replaceState=="function")window.history.replaceState(null,"",mt(t));else if(window.location)window.location.hash=`tab=${t}`;else return!1;return!0}catch{return!1}}function gt(t,o){const[e,r]=F.useState(()=>typeof window>"u"||typeof window.location>"u"?o:Ce(window.location.hash,t,o)),s=F.useRef(t);s.current=t;const a=F.useRef(o);a.current=o,F.useEffect(()=>{if(typeof window>"u"||typeof window.addEventListener>"u")return;const l=()=>{try{r(Ce(window.location.hash,s.current,a.current))}catch{}};return window.addEventListener("hashchange",l),()=>{try{window.removeEventListener("hashchange",l)}catch{}}},[]);const n=F.useCallback(l=>{!s.current.includes(l)||!ze(l)||(r(l),kt(l))},[]);return[e,n]}function ke(t,o){const e=(t||"").trim();return e?e.startsWith("<")?`Panel unreachable (HTTP ${o})`:e.length>300?e.slice(0,300)+"…":e:`HTTP ${o}`}function Me(t){return"'"+String(t).replace(/'/g,"'\\''")+"'"}function ge(t,o,e){try{return getComputedStyle(t).getPropertyValue(o).trim()||e}catch{return e}}function ht(t){return(Array.isArray(t)?t:[]).slice(-120).map(e=>{if(typeof e=="number")return{label:"",value:Number.isFinite(e)?e:0};const r=Number(e==null?void 0:e.value);return{label:String((e==null?void 0:e.label)??""),value:Number.isFinite(r)?r:0}})}function vt(t,o,e){if(!t||typeof t.appendChild!="function")throw new Error("sdk.chart: el must be an HTMLElement");const r=t,s=(e==null?void 0:e.kind)==="line"?"line":"bars",a=document.createElement("canvas");a.style.width="100%",r.appendChild(a);function n(){const l=ht(o),p=Math.min(3,Math.max(1,Math.floor(window.devicePixelRatio||1))),c=Math.max(80,Math.floor(r.clientWidth||300)),b=120;a.style.height=`${b}px`,a.width=Math.floor(c*p),a.height=Math.floor(b*p);const i=a.getContext("2d");if(!i)return;i.setTransform(p,0,0,p,0,0),i.clearRect(0,0,c,b);const d=String((e==null?void 0:e.color)||"").trim()||ge(r,"--ks-info","#38bdf8"),v=ge(r,"--ks-card-border","rgba(255,255,255,0.10)"),w=ge(r,"--ks-muted","#9ca3af");if(l.length===0){i.fillStyle=w,i.font="12px sans-serif",i.textAlign="center",i.fillText("No data yet",c/2,b/2);return}i.fillStyle=v,i.fillRect(0,b-17,c,1);const g=Math.max(1e-9,...l.map(I=>Math.max(0,I.value))),A=8,T=20,z=b-A-T,O=I=>l.length===1?c/2:4+I*(c-8)/(l.length-1),m=I=>b-T-Math.max(0,I)/g*z;if(s==="line")i.strokeStyle=d,i.lineWidth=2,i.beginPath(),l.forEach((I,q)=>{q===0?i.moveTo(O(q),m(I.value)):i.lineTo(O(q),m(I.value))}),i.stroke();else{const I=c/l.length;l.forEach((q,E)=>{const _=Math.max(2,Math.max(0,q.value)/g*z);i.fillStyle=d,i.globalAlpha=E===l.length-1?1:.45,i.fillRect(E*I+1,b-T-_,Math.max(1,I-2),_)}),i.globalAlpha=1}i.fillStyle=w,i.font="10px sans-serif",i.textAlign="center";const H=Math.max(1,Math.ceil(l.length/6));for(let I=0;I<l.length;I+=H){const q=l[I].label;q&&i.fillText(q.slice(0,12),O(I),b-4)}}return n(),window.addEventListener("resize",n),()=>{window.removeEventListener("resize",n);try{a.remove()}catch{}}}function ae(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function xt(t){const o=(t??"").trim();return o?/^(https?:|mailto:)/i.test(o)?o:/^[a-z][a-z0-9+.-]*:/i.test(o)?"#":o:"#"}function yt(t){const o=String(t??"").split(`
`),e=[];let r=[],s=null;const a=()=>{if(r.length===0){s=null;return}const l=s==="ol"?"ol":"ul";e.push(`<${l}>${r.join("")}</${l}>`),r=[],s=null},n=l=>{const p=[],c=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;let b=0,i;for(;(i=c.exec(l))!==null;)p.push(ae(l.slice(b,i.index))),i[2]!==void 0?p.push(`<strong>${ae(i[2])}</strong>`):i[3]!==void 0?p.push(`<em>${ae(i[3])}</em>`):i[4]!==void 0?p.push(`<code>${ae(i[4])}</code>`):p.push(`<a href="${ae(xt(i[6]))}" target="_blank" rel="noreferrer">${ae(i[5])}</a>`),b=i.index+i[0].length;return p.push(ae(l.slice(b))),p.join("")};for(const l of o){const p=l.trim();if(/^#{1,3}\s/.test(p)){a();const c=p.match(/^#+/)[0].length,b=n(p.replace(/^#+\s/,""));e.push(c===1?`<h1>${b}</h1>`:c===2?`<h2>${b}</h2>`:`<h3>${b}</h3>`)}else/^---\s*$/.test(p)?(a(),e.push("<hr />")):/^[-*]\s/.test(p)?(s==="ol"&&a(),s="ul",r.push(`<li>${n(p.replace(/^[-*]\s/,""))}</li>`)):/^\d+\.\s/.test(p)?(s==="ul"&&a(),s="ol",r.push(`<li>${n(p.replace(/^\d+\.\s/,""))}</li>`)):p===""?a():(a(),e.push(`<p>${n(p)}</p>`))}return a(),e.join(`
`)}let de=null,fe=null;function Le(t){return t.includes("/api/csrf-token")||t.includes("/api/auth/")||t.includes("/api/nodes/heartbeat")||t.includes("/api/edge/tunnel")}async function Ie(){return de||(fe||(fe=fetch("/api/csrf-token",{credentials:"include"}).then(t=>t.ok?t.json():null).then(t=>(de=t&&typeof t.csrf_token=="string"?t.csrf_token:null,de)).catch(()=>null).finally(()=>{fe=null})),fe)}function wt(){de=null}function $t(t,o=[],e="",r={}){const s=`/api/instances/${t.id}`,a=new Map,n=3e4;function l(u,f){if(f!=null&&f.signal)return fetch(u,{...f,credentials:"include"});const h=new AbortController,x=setTimeout(()=>h.abort(),n);return fetch(u,{...f,signal:h.signal,credentials:"include"}).finally(()=>{clearTimeout(x)})}function p(u){return u instanceof DOMException&&u.name==="AbortError"?new Error("request timed out after 30s"):u}function c(u,f){const h=String((f==null?void 0:f.method)||"GET").toUpperCase();return h!=="POST"&&h!=="PUT"&&h!=="PATCH"&&h!=="DELETE"?!1:!Le(u)}async function b(u,f){if(!c(u,f))return f;const h=await Ie();return h?{...f,headers:{...(f==null?void 0:f.headers)||{},"X-CSRF-Token":h}}:f}async function i(u,f,h=!1){let x;try{x=await l(u,await b(u,f))}catch(N){throw p(N)}if(!h&&x.status===403&&!Le(u)){const N=await x.text();if(N.toLowerCase().includes("csrf")){wt();const S=await Ie();if(S)return i(u,{...f,headers:{...(f==null?void 0:f.headers)||{},"X-CSRF-Token":S}},!0)}throw new Error(ke(N,x.status))}return x}async function d(u,f){const h=f==null?void 0:f.body,x=typeof FormData<"u"&&h instanceof FormData,N={};h!=null&&!x&&(N["Content-Type"]="application/json");const S=await i(u,{...f,headers:{...N,...(f==null?void 0:f.headers)||{}}});if(!S.ok){const ie=await S.text();throw new Error(ke(ie,S.status))}const U=S.headers.get("content-type")||"",Y=await S.text();if(U.includes("json"))try{return JSON.parse(Y)}catch{}return Y}async function v(u){return d("/api/instance-pages/execute-action",{method:"POST",body:JSON.stringify({instance_id:t.id,page_slug:e,...u})})}async function w(u,f){const h=o.find(x=>x.name===u);return h?v({type:h.type,command:h.command,path:h.path,content:h.content,args:h.args?[...h.args]:void 0,env:h.env?{...h.env}:void 0,timeout:h.timeout,mode:h.mode,names:h.names?[...h.names]:void 0,dest:h.dest,...f}):{ok:!1,error:`No saved action named "${u}" on this page`}}async function g(u,f){const h=`/api/instances/${t.id}`;if(typeof u!="string"||u.length>2048)throw new Error("fetchPanel: invalid path");if(u==="")return d(h,f);if(!u.startsWith("/"))throw new Error("fetchPanel: invalid path");let x=u;if(!u.startsWith(h)){if(u.startsWith("//"))throw new Error("fetchPanel: invalid path");x=h+u}if(x.length>h.length&&x[h.length]!=="/"&&x[h.length]!=="?")throw new Error(`fetchPanel: only ${h}/… paths are allowed`);return d(x,f)}function A(u,f){return a.has(u)||a.set(u,new Set),a.get(u).add(f),()=>{var h;return(h=a.get(u))==null?void 0:h.delete(f)}}function T(u,f){var h;(h=a.get(u))==null||h.forEach(x=>{try{x(f)}catch(N){console.error("Event callback error:",N)}})}function z(u,f){const h=A(u,x=>{h(),f(x)});return h}const O=`ks_page_${t.id}_`,m={get:u=>Promise.resolve(localStorage.getItem(O+u)),set:(u,f)=>Promise.resolve(localStorage.setItem(O+u,f)),delete:u=>Promise.resolve(localStorage.removeItem(O+u)),clear:()=>Promise.resolve(Object.keys(localStorage).filter(u=>u.startsWith(O)).forEach(u=>localStorage.removeItem(u))),keys:()=>Promise.resolve(Object.keys(localStorage).filter(u=>u.startsWith(O)).map(u=>u.slice(O.length)))};function H(){return`instance_id=${encodeURIComponent(String(t.id))}&page_slug=${encodeURIComponent(e)}`}const I={get:async u=>{const f=await d(`/api/instance-pages/kv?${H()}`,{method:"GET"}),h=Array.isArray(f==null?void 0:f.entries)?f.entries.find(x=>(x==null?void 0:x.k)===u):void 0;return h?String(h.v):null},set:async(u,f)=>{if(typeof f!="string")return Promise.reject(new Error("kv.set: value must be a string"));await d(`/api/instance-pages/kv?${H()}`,{method:"PUT",body:JSON.stringify({k:u,v:f})})},delete:async u=>{await d(`/api/instance-pages/kv?${H()}&k=${encodeURIComponent(u)}`,{method:"DELETE"})},keys:async()=>{const u=await d(`/api/instance-pages/kv?${H()}`,{method:"GET"});return Array.isArray(u==null?void 0:u.entries)?u.entries.map(f=>String((f==null?void 0:f.k)??"")).filter(f=>f!==""):[]}};function q(u,f,h){return new WebSocket(Xe(window.location.host,window.location.protocol,t.id,f,h),u)}const E=encodeURIComponent;async function _(u,f){const h=await i(u,f);if(!h.ok)throw new Error(ke(await h.text(),h.status));return{base64:ut(await h.arrayBuffer()),contentType:h.headers.get("content-type")||"application/octet-stream"}}async function P(u,f,h){const x=pt(f);await d(`${s}/files?op=upload&path=${E(u)}`,{method:"POST",headers:{"Content-Type":h||"application/octet-stream"},body:x})}async function C(u){const f=await _(`${s}/files/read?path=${E(u)}`);return{name:String(u).split("/").pop()||"download",...f}}function M(u,f="info"){window.dispatchEvent(new CustomEvent("ks-toast",{detail:{message:u,type:f}}))}function k(u){window.dispatchEvent(new CustomEvent("ks-modal",{detail:u}))}function y(u,f,h){const x=String(u||"download.txt").split("/").pop()||"download.txt",N=new Blob([String(f??"")],{type:h||"text/plain;charset=utf-8"}),S=URL.createObjectURL(N),U=document.createElement("a");U.href=S,U.download=x,document.body.appendChild(U),U.click(),setTimeout(()=>{try{document.body.removeChild(U)}catch{}URL.revokeObjectURL(S)},100)}async function j(u){const f=String(u??"");try{await navigator.clipboard.writeText(f);return}catch{}const h=document.createElement("textarea");h.value=f,h.setAttribute("readonly",""),h.style.position="fixed",h.style.opacity="0",document.body.appendChild(h),h.select();try{document.execCommand("copy")}finally{try{document.body.removeChild(h)}catch{}}}function L(u){const f=Number(u);if(!Number.isFinite(f)||f<0)return"—";if(f<1024)return`${Math.floor(f)} B`;const h=["KB","MB","GB","TB"];let x=f/1024,N=0;for(;x>=1024&&N<h.length-1;)x/=1024,N++;return`${x>=100?Math.round(x):Math.round(x*10)/10} ${h[N]}`}function Z(u){const f=typeof u=="string"?Date.parse(u):Number(u);if(!Number.isFinite(f))return"—";const h=f>1e12?f:f*1e3,x=Math.max(0,Math.floor((Date.now()-h)/1e3));if(x<5)return"just now";if(x<60)return`${x}s ago`;const N=Math.floor(x/60);if(N<60)return`${N}m ago`;const S=Math.floor(N/60);if(S<24)return`${S}h ago`;const U=Math.floor(S/24);return U<30?`${U}d ago`:new Date(h).toLocaleDateString()}function V(u,f=250){let h=null;return(...x)=>{h&&clearTimeout(h),h=setTimeout(()=>{h=null,u(...x)},Math.max(0,f))}}function J(u,f,h=5e3){let x=!1;async function N(){if(!x){try{const S=await v(u);x||f(S)}catch(S){x||f({ok:!1,error:S instanceof Error?S.message:String(S)})}x||setTimeout(N,h)}}return N(),()=>{x=!0}}return{instance:t,pageSlug:e,actions:o,runAction:w,config:r,executeAction:v,fetchPanel:g,shell:(u,f,h,x)=>v({type:"shell",command:u,args:f,env:h,timeout:x}),readFile:u=>v({type:"read_file",path:u}).then(f=>f.ok?f.data??f.stdout??"":Promise.reject(new Error(f.error??f.stderr??"Read failed"))),writeFile:(u,f)=>v({type:"write_file",path:u,content:f}),listFiles:u=>v({type:"list_files",path:u}).then(f=>f.ok?f.data??[]:Promise.reject(new Error(f.error??f.stderr??"List failed"))),deleteFile:u=>v({type:"shell",command:`rm -rf -- ${Me(u)}`}),createDirectory:u=>v({type:"shell",command:`mkdir -p -- ${Me(u)}`}),docker:(u,f)=>v({type:"docker",command:u,args:f}),kvm:(u,f)=>v({type:"kvm",command:u,args:f}),lxd:(u,f)=>v({type:"lxd",command:u,args:f}),subscribe:J,navigate:u=>{window.dispatchEvent(new CustomEvent("ks-navigate",{detail:{to:u}}))},useHashRoute:gt,toast:M,confirm:u=>Re({title:"Please confirm",message:u}),prompt:(u,f="")=>Promise.resolve(window.prompt(u,f)),modal:k,downloadText:y,copyText:j,formatBytes:L,timeAgo:Z,debounce:V,chart:(u,f,h)=>vt(u,f,h),markdown:u=>yt(u),on:A,emit:T,once:z,storage:m,kv:I,connectWS:q,statPath:u=>g(`/files?op=stat&path=${E(u)}`),renamePath:(u,f)=>g(`/files?op=rename&path=${E(u)}&to=${E(f)}`,{method:"POST"}).then(()=>{}),copyPath:(u,f)=>g(`/files?op=copy&path=${E(u)}&to=${E(f)}`,{method:"POST"}).then(()=>{}),chmodPath:(u,f)=>g(`/files?op=chmod&path=${E(u)}&mode=${E(f)}`,{method:"POST"}).then(()=>{}),archivePaths:(u,f,h)=>g(`/files?op=archive&path=${E(u)}&to=${E(h)}`,{method:"POST",body:JSON.stringify({names:f})}),extractArchive:(u,f)=>g(`/files?op=extract&path=${E(u)}${f?`&to=${E(f)}`:""}`,{method:"POST"}).then(()=>{}),searchFiles:(u,f,h=100)=>g(`/files?op=search&path=${E(u)}&q=${E(f)}&limit=${h}`),uploadFromUrl:(u,f)=>g("/files/url",{method:"POST",body:JSON.stringify({url:f,path:u.endsWith("/")?u:`${u}/`})}).then(()=>{}),uploadFile:P,downloadFile:C,listPorts:async()=>{const u=await g("/ports");return Array.isArray(u)?u:u&&Array.isArray(u.allocations)?u.allocations:[]},savePorts:u=>g("/ports",{method:"PUT",body:JSON.stringify({ports:u})}).then(()=>{}),listAutomation:()=>g("/automation/"),listAutomationRuns:(u=50)=>g(`/automation/runs?limit=${u}`),runAutomationJob:u=>g(`/automation/${u}/run`,{method:"POST"}),deleteAutomationJob:u=>g(`/automation/${u}`,{method:"DELETE"}).then(()=>{}),createAutomationJob:u=>g("/automation/",{method:"POST",body:JSON.stringify(u)}),updateAutomationJob:(u,f)=>g(`/automation/${u}`,{method:"PUT",body:JSON.stringify(f)}).then(()=>{}),downloadAutomation:u=>_(`${s}/automation/${u}/download`).then(f=>({base64:f.base64})),importAutomationURL:u=>g("/automation/import/url",{method:"POST",body:JSON.stringify({url:u})}),listSecrets:()=>g("/secrets/"),setSecret:(u,f)=>g("/secrets/",{method:"POST",body:JSON.stringify({key:u,value:f})}).then(()=>{}),deleteSecret:u=>g(`/secrets/${E(u)}`,{method:"DELETE"}).then(()=>{}),revealSecret:u=>g(`/secrets/${E(u)}`),saveEnv:u=>g("",{method:"PUT",body:JSON.stringify({config:{env:u}})}),power:u=>["start","stop","restart","kill"].includes(u)?g(`/${u}`,{method:"POST"}).then(()=>{}):Promise.reject(new Error(`power: unknown action "${u}"`)),reinstall:()=>g("/reinstall",{method:"POST"}),updateIdentity:u=>g("/identity",{method:"PUT",body:JSON.stringify(u)}).then(()=>{}),getMetrics:()=>g("/metrics"),listProcesses:async()=>{const u=await g("/processes");return Array.isArray(u)?u:[]},killProcess:(u,f)=>{const h=`pid=${E(String(u))}${f?`&signal=${E(f)}`:""}`;return g(`/processes/kill?${h}`,{method:"POST"})},listAudit:async(u=100)=>{const f=await g(`/audit?limit=${u}`);return Array.isArray(f)?f:Array.isArray(f==null?void 0:f.rows)?f.rows:[]},getSftp:()=>g("/sftp"),enableSftp:()=>g("/sftp/enable",{method:"POST"}),rotateSftp:()=>g("/sftp/rotate",{method:"POST"}),disableSftp:()=>g("/sftp/disable",{method:"POST"}),revealSftp:()=>g("/sftp?reveal=1"),sendActionStdin:(u,f)=>g(`/actions/${E(u)}/stdin`,{method:"POST",body:JSON.stringify({data:f})}),sendInstallStdin:u=>g("/install/stdin",{method:"POST",body:JSON.stringify({data:u})})}}function _t(t){return/[A-Za-z_$]/.test(t)}function te(t){return/[A-Za-z0-9_$]/.test(t)}function St(t){const o=t.split(`
`),e=[];let r=!1;const s=/^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/,a=/^\s*import\s+['"]react['"]\s*;?\s*$/;for(const c of o){const b=c.trim();if(a.test(b)){r=!0,e.push("// (dropped side-effect import of react: runtime already in scope)");continue}const i=b.match(s);if(i){r=!0;const d=i[1].trim(),v=d.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);if(v){e.push(`const ${v[1]} = React;`);continue}const w=d.match(/^([A-Za-z_$][A-Za-z0-9_$]*)?\s*,?\s*(\{[^}]*\})?$/);if(w){const g=w[2];if(g){const A=g.slice(1,-1).split(",").map(T=>T.trim()).filter(Boolean).map(T=>{const z=T.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);return z?`${z[1]}: ${z[2]}`:T}).join(", ");e.push(A?`const {${A}} = React;`:"// (react import: nothing to bind)")}else e.push("// (dropped default react import: React already in scope)");continue}throw new Error(`unsupported react import shape: ${b.slice(0,80)} — use \`import { useState } from 'react'\` or plain script`)}e.push(c)}const n=re(e.join(`
`)),l=/(^|[^A-Za-z0-9_$])((import|export)\b[^\n]{0,60})/g;let p;for(;(p=l.exec(n))!==null;){const c=p[2].trim();if(!/^export\s+(const|let|var|async|function|class|enum|namespace|interface|type|declare)\b/.test(c))throw new Error(`import/export is not supported here (${c.slice(0,60)}) — pages are private scripts (end with \`return Page;\`), React and sdk are already in scope; use sdk.* helpers instead`)}return{code:e.join(`
`),hadImport:r}}function re(t){let o="",e=0;const r=t.length;let s="code",a=0;for(;e<r;){const n=t[e],l=e+1<r?t[e+1]:"";if(s==="code"){if(n==="/"&&l==="/"){s="line",o+="  ",e+=2;continue}if(n==="/"&&l==="*"){s="block",o+="  ",e+=2;continue}if(n==="'"){s="sq",o+=" ",e++;continue}if(n==='"'){s="dq",o+=" ",e++;continue}if(n==="`"){s="tpl",o+=" ",e++;continue}o+=n,e++;continue}if(s==="line"){n===`
`?(s="code",o+=`
`):o+=" ",e++;continue}if(s==="block"){n==="*"&&l==="/"?(s="code",o+="  ",e+=2):(o+=n===`
`?`
`:" ",e++);continue}if(s==="sq"){if(n==="\\"){o+="  ",e+=2;continue}if(n==="'"){s="code",o+=" ",e++;continue}o+=n===`
`?`
`:" ",e++;continue}if(s==="dq"){if(n==="\\"){o+="  ",e+=2;continue}if(n==='"'){s="code",o+=" ",e++;continue}o+=n===`
`?`
`:" ",e++;continue}if(n==="\\"){o+="  ",e+=2;continue}if(n==="`"&&a===0){s="code",o+=" ",e++;continue}if(n==="$"&&l==="{"){a++,o+="  ",e+=2;continue}if(n==="{"&&a>0||n==="}"&&a>0){n==="{"?a++:a--,o+=" ",e++;continue}o+=n===`
`?`
`:" ",e++}return o}function Et(t){let o=!1,e=t;return e=et(e,()=>{o=!0}).code,e=Pt(e,()=>{o=!0}),e=Ot(e,()=>{o=!0}),e=e.replace(/^[ \t]*type\s+[A-Za-z_$][A-Za-z0-9_$.]*[\s\S]*?;[ \t]*(?:\n|$)/gm,r=>r.includes("=")?(o=!0,`
`):r),e=jt(e,()=>{o=!0}),e=Nt(e,()=>{o=!0}),{code:e,hadTS:o}}function He(t,o,e){let r=e;const s=t.length;let a="code";for(;r<s;){const n=t[r];if(a==="code"){if(n==="/"&&t[r+1]==="/"){a="line",r+=2;continue}if(n==="/"&&t[r+1]==="*"){a="block",r+=2;continue}if(n==="'"){a="sq",r++;continue}if(n==='"'){a="dq",r++;continue}if(n==="`"){a="tpl",r++;continue}if(t.startsWith(o,r)&&!te(t[r-1]??"")&&t[r-1]!=="."&&!te(t[r+o.length]??""))return r;r++;continue}if(a==="line"){n===`
`&&(a="code"),r++;continue}if(a==="block"){if(n==="*"&&t[r+1]==="/"){a="code",r+=2;continue}r++;continue}if(n==="\\"){r+=2;continue}(a==="sq"&&n==="'"||a==="dq"&&n==='"'||a==="tpl"&&n==="`")&&(a="code"),r++}return-1}function Qe(t,o){let e=0,r=o;const s=t.length;let a="code";for(;r<s;){const n=t[r];if(a==="code"){if(n==="/"&&t[r+1]==="/"){a="line",r+=2;continue}if(n==="/"&&t[r+1]==="*"){a="block",r+=2;continue}if(n==="'"){a="sq",r++;continue}if(n==='"'){a="dq",r++;continue}if(n==="`"){a="tpl",r++;continue}if(n==="{"&&e++,n==="}"&&(e--,e===0))return r+1;r++;continue}if(a==="line"){n===`
`&&(a="code"),r++;continue}if(a==="block"){if(n==="*"&&t[r+1]==="/"){a="code",r+=2;continue}r++;continue}if(n==="\\"){r+=2;continue}(a==="sq"&&n==="'"||a==="dq"&&n==='"'||a==="tpl"&&n==="`")&&(a="code"),r++}return-1}const At=/^[+-]?(?:0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/;function qe(t){let o="",e=0;const r=t.length;let s="code";for(;e<r;){const a=t[e];if(s==="code"){if(a==="/"&&t[e+1]==="/"){s="line",e+=2;continue}if(a==="/"&&t[e+1]==="*"){s="block",e+=2;continue}if(a==="'"){s="sq",o+=a,e++;continue}if(a==='"'){s="dq",o+=a,e++;continue}if(a==="`"){s="tpl",o+=a,e++;continue}o+=a,e++;continue}if(s==="line"){a===`
`&&(s="code",o+=`
`),e++;continue}if(s==="block"){if(a==="*"&&t[e+1]==="/"){s="code",e+=2;continue}a===`
`&&(o+=`
`),e++;continue}if(o+=a,a==="\\"){o+=t[e+1]??"",e+=2;continue}(s==="sq"&&a==="'"||s==="dq"&&a==='"'||s==="tpl"&&a==="`")&&(s="code"),e++}return o}function Rt(t,o){let e=o;const r=[];for(;;){let s=e;for(;s>0&&(t[s-1]===" "||t[s-1]==="	"||t[s-1]===`
`||t[s-1]==="\r");)s--;let a=s;for(;a>0&&te(t[a-1]);)a--;const n=t.slice(a,s);if(n!=="export"&&n!=="const"&&n!=="declare")return{start:e,words:r};r.unshift(n),e=a}}function zt(t,o,e){const r=re(o),s=[];{let p=0,c=0,b=0;for(let i=0;i<=r.length;i++){const d=r[i]??"";d==="("||d==="["||d==="{"?p++:d===")"||d==="]"||d==="}"?p=Math.max(0,p-1):d==="<"&&/[A-Za-z0-9_$\]>)\]?]/.test(r[i-1]??"")?c++:d===">"&&c>0&&c--,(d===","||i===r.length)&&p===0&&c===0&&(s.push({from:b,to:i}),b=i+1)}}const a=[`const ${t} = {};`];let n=0,l=!0;for(const{from:p,to:c}of s){const b=o.slice(p,c),i=qe(b).trim();if(i==="")continue;const d=/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=\s*([\s\S]+))?$/.exec(i);if(!d)throw new Error(`invalid enum member: ${i.slice(0,40)} — expected Name or Name = value`);const v=d[1];let w="";if(d[2]!==void 0){const g=b.search(/=/),A=qe(b.slice(g+1)).trim();A!==""&&(w=A)}if(w===""){if(!l)throw new Error(`enum member ${v} needs an initializer because the previous member is not a number — same rule as TypeScript`);a.push(`${t}[${JSON.stringify(v)}] = ${n}; ${t}[${n}] = ${JSON.stringify(v)};`),n++}else if(At.test(w)){const g=Number(w);a.push(`${t}[${JSON.stringify(v)}] = (${w}); ${t}[${g}] = ${JSON.stringify(v)};`),n=g+1,l=!0}else a.push(`${t}[${JSON.stringify(v)}] = (${w});`),l=!1}return e(),a.join(`
`)}function Tt(t,o){let e="",r=0;const s=t.length,a=[];let n=0,l="code";const p=()=>{if(!t.startsWith("export",r)||te(t[r-1]??"")||!/\s/.test(t[r+6]??"")||n!==0)return!1;const c=t.slice(r+6),b=/^\s+(default\b|[{*=]|\bfrom\b|declare\b|const\b|let\b|var\b|async\s+function\b|function\b|class\b|enum\b|namespace\b|interface\b|type\b)/.exec(c);if(!b)return!1;const i=b[1].replace(/\s+/g," ");if(i==="default"||i==="{"||i==="*"||i==="="||i==="from"||i==="declare")throw new Error(`export ${i} is not supported inside namespace ${o} — export plain declarations (const, function, class, enum, namespace) instead`);if(i==="interface"||i==="type")return r+=6,!0;let d=r+6+b[0].length-i.length;for(d+=(i==="async function"?"async function":i).length;d<s&&(t[d]===" "||t[d]==="	"||t[d]===`
`||t[d]==="\r");)d++;const w=/^[A-Za-z_$][A-Za-z0-9_$]*/.exec(t.slice(d,d+64));if(!w)throw new Error(`exported member in namespace ${o} needs a name — anonymous defaults are not supported`);return a.push(w[0]),r+=6,!0};for(;r<s;){const c=t[r];if(l==="code"){if(c==="/"&&t[r+1]==="/"){l="line",e+="//",r+=2;continue}if(c==="/"&&t[r+1]==="*"){l="block",e+="/*",r+=2;continue}if(c==="'"){l="sq",e+=c,r++;continue}if(c==='"'){l="dq",e+=c,r++;continue}if(c==="`"){l="tpl",e+=c,r++;continue}if((c==="("||c==="["||c==="{")&&n++,(c===")"||c==="]"||c==="}")&&(n=Math.max(0,n-1)),c==="e"&&p())continue;e+=c,r++;continue}if(l==="line"){e+=c,c===`
`&&(l="code"),r++;continue}if(l==="block"){if(e+=c,c==="*"&&t[r+1]==="/"){e+="/",r+=2,l="code";continue}r++;continue}if(e+=c,c==="\\"){e+=t[r+1]??"",r+=2;continue}(l==="sq"&&c==="'"||l==="dq"&&c==='"'||l==="tpl"&&c==="`")&&(l="code"),r++}return{body:e,names:a}}function et(t,o){let e=t;for(;;){const r=He(e,"enum",0),s=He(e,"namespace",0);if(r===-1&&s===-1)break;const a=r!==-1&&(s===-1||r<s),n=a?r:s,l=a?4:9,{start:p,words:c}=Rt(e,n),b=c.includes("export"),i=c.includes("const"),d=c.includes("declare");if(c.some(m=>m!=="export"&&m!=="const"&&m!=="declare")||!a&&i||i&&d||b&&d)throw new Error(`invalid ${a?"enum":"namespace"} declaration (${c.join(" ")}) — use [export] [const] enum / [export] namespace`);let w=n+l;for(;w<e.length&&(e[w]===" "||e[w]==="	"||e[w]===`
`||e[w]==="\r");)w++;if(e.startsWith("//",w)){const m=e.indexOf(`
`,w);for(w=m===-1?e.length:m+1;w<e.length&&(e[w]===" "||e[w]==="	"||e[w]===`
`||e[w]==="\r");)w++}const g=/^[A-Za-z_$][A-Za-z0-9_$]*/.exec(e.slice(w,w+64));if(!g)throw new Error(`invalid ${a?"enum":"namespace"} declaration — a name must follow the keyword`);let A=w+g[0].length;for(;A<e.length&&(e[A]===" "||e[A]==="	"||e[A]===`
`||e[A]==="\r");)A++;if(e[A]!=="{")throw new Error(`invalid ${a?"enum":"namespace"} ${g[0]} — expected { but found ${JSON.stringify(e[A]??"end of input")}`);const T=Qe(e,A);if(T===-1)throw new Error(`unbalanced { in ${a?"enum":"namespace"} ${g[0]} — a closing } is missing`);if(d){o(),e=`${e.slice(0,p)}
${e.slice(T)}`;continue}const z=e.slice(A+1,T-1);let O;if(a){const m=zt(g[0],z,o);O=`${b?"export ":""}${m}`}else{const m=et(z,o),H=Tt(m.code,g[0]);o(),O=`${b?"export ":""}const ${g[0]} = (() => {
${H.body}
return { ${H.names.join(", ")} };
})();`}e=`${e.slice(0,p)}${O}${e.slice(T)}`}return{code:e}}function Pt(t,o){let e="",r=0;const s=t.length;let a="code",n=!0;for(;r<s;){const l=t[r];if(a==="code"){if(l==="/"&&t[r+1]==="/"){a="line",e+="//",n=!1,r+=2;continue}if(l==="/"&&t[r+1]==="*"){a="block",e+="/*",n=!1,r+=2;continue}if(l==="'"){a="sq",e+=l,n=!1,r++;continue}if(l==='"'){a="dq",e+=l,n=!1,r++;continue}if(l==="`"){a="tpl",e+=l,n=!1,r++;continue}if((l===" "||l==="	")&&n){e+=l,r++;continue}if(n){const p=t.slice(r,r+80);if(/^export\s+(const|let|var|async\s+function|function|class|enum|namespace|interface|type)\b/.exec(p)){o(),r+=6,n=!1;continue}const b=/^(?:export\s+)?declare\b/.exec(p);if(b){o();let i=r+b[0].length,d="code";for(;i<s;){const v=t[i];if(d==="code"){if(v==="/"&&t[i+1]==="/"){d="line",i+=2;continue}if(v==="/"&&t[i+1]==="*"){d="block",i+=2;continue}if(v==="'"){d="sq",i++;continue}if(v==='"'){d="dq",i++;continue}if(v==="`"){d="tpl",i++;continue}if(v==="{"){const w=Qe(t,i);i=w===-1?s:w;break}if(v===";"||v===`
`){i=v===";"?i+1:i;break}i++;continue}if(d==="line"){if(v===`
`){i++;break}i++;continue}if(d==="block"){if(v==="*"&&t[i+1]==="/"){d="code",i+=2;continue}i++;continue}if(v==="\\"){i+=2;continue}(d==="sq"&&v==="'"||d==="dq"&&v==='"'||d==="tpl"&&v==="`")&&(d="code"),i++}e+=`
`,r=i,n=!0;continue}}l===`
`?n=!0:l!==" "&&l!=="	"&&l!=="\r"&&(n=!1),e+=l,r++;continue}if(a==="line"){e+=l,l===`
`&&(a="code",n=!0),r++;continue}if(a==="block"){if(e+=l,l==="*"&&t[r+1]==="/"){e+="/",r+=2,a="code";continue}r++;continue}if(e+=l,l==="\\"){e+=t[r+1]??"",r+=2;continue}(a==="sq"&&l==="'"||a==="dq"&&l==='"'||a==="tpl"&&l==="`")&&(a="code"),r++}return e}function Ot(t,o){let e="",r=0;const s=t.length;for(;r<s;){if(t.startsWith("interface",r)&&!te(t[r-1]??"")&&!te(t[r+9]??"")){let a=r+9;for(;a<s&&t[a]!=="{"&&t[a]!==`
`;)a++;for(;a<s&&t[a]!=="{";)a++;if(a<s&&t[a]==="{"){let n=0,l=a,p=null;for(;l<s;){const c=t[l];if(p){if(c==="\\"){l+=2;continue}c===p&&(p=null),l++;continue}if(c==="'"||c==='"'||c==="`"){p=c,l++;continue}if(c==="{"&&n++,c==="}"&&(n--,n===0)){l++;break}l++}o(),e+=`
`,r=l;continue}}e+=t[r],r++}return e}function jt(t,o){let e="",r=0;const s=t.length;let a="code";for(;r<s;){const n=t[r];if(a==="code"){if(n==="/"&&t[r+1]==="/"){a="line",e+=n+t[r+1],r+=2;continue}if(n==="/"&&t[r+1]==="*"){a="block",e+=n+t[r+1],r+=2;continue}if(n==="'"){a="sq",e+=n,r++;continue}if(n==='"'){a="dq",e+=n,r++;continue}if(n==="`"){a="tpl",e+=n,r++;continue}if(n==="a"&&t.startsWith("as",r)&&!te(t[r-1]??"")&&!te(t[r+2]??"")){let l=r+2;for(;l<s&&/[ \t]/.test(t[l]);)l++;if(l<s&&(_t(t[l])||t[l]==="{"||t[l]==='"'||t[l]==="'")){let p=l,c=0,b="code",i=-1;for(;p<s;){const d=t[p];if(b!=="code"){if(d==="\\"){p+=2;continue}(b==="sq"&&d==="'"||b==="dq"&&d==='"'||b==="tpl"&&d==="`")&&(b="code"),p++;continue}if(d==="'"||d==='"'||d==="`"){b=d==="'"?"sq":d==='"'?"dq":"tpl",p++;continue}if(d==="<"||d==="("||d==="["||d==="{"){c++,p++;continue}if(d===">"||d===")"||d==="]"||d==="}"){if(c===0){i=p;break}c--,p++;continue}if(c===0&&/[,;=[&|?:+\-*/!%\n]/.test(d)){i=p;break}p++}if(i===-1&&(i=p),i>l){o(),r=i;continue}}}if(n==="!"&&t[r+1]!=="="&&t[r+1]!=="!"){const l=e.length?e[e.length-1]:"";if(/[A-Za-z0-9_$\]\)'"]/.test(l)){o(),r++;continue}}e+=n,r++;continue}if(a==="line"){e+=n,n===`
`&&(a="code"),r++;continue}if(a==="block"){if(e+=n,n==="*"&&t[r+1]==="/"){e+="/",r+=2,a="code";continue}r++;continue}if(a==="sq"){if(e+=n,n==="\\"){e+=t[r+1]??"",r+=2;continue}n==="'"&&(a="code"),r++;continue}if(a==="dq"){if(e+=n,n==="\\"){e+=t[r+1]??"",r+=2;continue}n==='"'&&(a="code"),r++;continue}if(e+=n,n==="\\"){e+=t[r+1]??"",r+=2;continue}n==="`"&&(a="code"),r++}return e.replace(/([A-Za-z_$][A-Za-z0-9_$.]*)\s*<[A-Za-z_$][A-Za-z0-9_$.<>\[\],\s|&?]*>\s*\(/g,(n,l)=>{o();const p=n.slice(n.lastIndexOf("("));return`${l}${p}`})}function Nt(t,o){let e="",r=0;const s=t.length;let a="code";const n=[],l=()=>{for(let i=e.length-1;i>=0;i--){const d=e[i];if(!(d===" "||d==="	"||d===`
`||d==="\r"))return d}return""},p=()=>{const i=e.lastIndexOf(`
`);return e.slice(i+1).trimStart()},c=()=>{let i=0,d=0,v=0,w=null,g=e.length-1;for(;g>=0;){const A=e[g];if(w){if(A===w){let T=0,z=g-1;for(;z>=0&&e[z]==="\\";)T++,z--;T%2===0&&(w=null)}g--;continue}if(A==='"'||A==="'"||A==="`"){w=A,g--;continue}if(A===")"||A==="]"||A==="}"){A===")"?i++:A==="]"?d++:v++,g--;continue}if(A==="("||A==="["||A==="{"){if(A==="("){if(i===0)return{kind:"top",stmt:e.slice(g+1)};i--,g--;continue}if(A==="["){if(d===0)return{kind:"top",stmt:e.slice(g+1)};d--,g--;continue}if(v>0){v--,g--;continue}let T=g-1;for(;T>=0&&(e[T]===" "||e[T]==="	"||e[T]===`
`||e[T]==="\r");)T--;const z=T>=0?e[T]:"",O=e.slice(Math.max(0,T-7),T+1),m=z==="("||z===","||z==="="||z===":"||z==="["||z==="?"||z==="."||/return\b/.test(O)||/=>$/.test(e.slice(Math.max(0,T-1),T+1));return/=>$/.test(e.slice(Math.max(0,T-1),T+1))?{kind:"block",stmt:e.slice(g+1)}:m?{kind:"object",stmt:""}:{kind:"block",stmt:e.slice(g+1)}}if(A===";"&&i===0&&d===0&&v===0)return{kind:"block",stmt:e.slice(g+1)};g--}return{kind:"top",stmt:e}},b=i=>/^\s*(export\s+default\s+|export\s+)?(async\s+function\*?\s|function\*?\s|const\s|let\s|var\s|class\s)/.test(i);for(;r<s;){const i=t[r];if(a==="code"){if(i==="/"&&t[r+1]==="/"){a="line",e+="//",r+=2;continue}if(i==="/"&&t[r+1]==="*"){a="block",e+="/*",r+=2;continue}if(i==="'"){a="sq",e+=i,r++;continue}if(i==='"'){a="dq",e+=i,r++;continue}if(i==="`"){a="tpl",e+=i,r++;continue}if(i==="("||i==="["||i==="{"){n.push(i),e+=i,r++;continue}if(i===")"||i==="]"||i==="}"){const d=i===")"?"(":i==="]"?"[":"{";n.length&&n[n.length-1]===d&&n.pop(),e+=i,r++;continue}if(i===":"&&t[r+1]!==":"){const d=n.length?n[n.length-1]:"",v=l();if(!(/[A-Za-z0-9_$\])}]/.test(v)||v==="?"||v==='"'||v==="'")){e+=i,r++;continue}let A=d==="("||v===")";if(!A){const k=c();A=k.kind!=="object"&&b(k.stmt)}if(!A){e+=i,r++;continue}const T=p();if(/^(case|default)\b/.test(T)){e+=i,r++;continue}let z=r+1;for(;z<s&&(t[z]===" "||t[z]==="	"||t[z]===`
`||t[z]==="\r");)z++;const O=/^[A-Za-z_]+/.exec(t.slice(z,z+16));if(/^[A-Za-z_$][A-Za-z0-9_$]*\s*:$/.test(T+" ")&&O&&/^(for|while|switch|do)$/.test(O[0])){e+=i,r++;continue}if(Ct(t,r)){e+=i,r++;continue}if(z>=s||!/[A-Za-z_{(['"<|!?]/.test(t[z])){e+=i,r++;continue}let m=z,H=0,I=0,q=0,E=0,_=!1,P=!1,C="code",M=-1;for(;m<s;){const k=t[m];if(C==="code"){if(k==="'"||k==='"'||k==="`"){C=k==="'"?"sq":k==='"'?"dq":"tpl",_=!0,m++;continue}if(k==="<"&&/[A-Za-z0-9_$\]>)\]?]/.test(t[m-1]??"")){E++,_=!0,m++;continue}if(k===">"&&E>0&&t[m+1]!=="="){E--,m++;continue}if(k==="="&&t[m+1]===">"){if(H===0&&I===0&&q===0&&E===0&&!P){M=m;break}_=!0,m+=2;continue}if(k==="("||k==="["){k==="("?(H++,P=!0):I++,_=!0,m++;continue}if(k==="{"){if(H===0&&I===0&&q===0&&E===0&&_){M=m;break}q++,_=!0,m++;continue}if(k===")"||k==="]"||k==="}"){if(H===0&&I===0&&q===0){M=m;break}k===")"?H--:k==="]"?I--:q--,m++;continue}if((k===","||k===";"||k==="=")&&H===0&&I===0&&q===0&&E===0){M=m;break}k!==" "&&k!=="	"&&k!==`
`&&k!=="\r"&&(_=!0),m++;continue}if(k==="\\"){m+=2;continue}(C==="sq"&&k==="'"||C==="dq"&&k==='"'||C==="tpl"&&k==="`")&&(C="code"),m++}if(M===-1||M<=z){e+=i,r++;continue}v==="?"&&(e=e.slice(0,-1)),o(),r=M;continue}e+=i,r++;continue}if(a==="line"){e+=i,i===`
`&&(a="code"),r++;continue}if(a==="block"){if(e+=i,i==="*"&&t[r+1]==="/"){e+="/",r+=2,a="code";continue}r++;continue}if(a==="sq"||a==="dq"){const d=a==="sq"?"'":'"';if(e+=i,i==="\\"){e+=t[r+1]??"",r+=2;continue}i===d&&(a="code"),r++;continue}if(e+=i,i==="\\"){e+=t[r+1]??"",r+=2;continue}i==="`"&&(a="code"),r++}return e}function Ct(t,o){let e=0,r=0,s=0;for(let a=o-1;a>=0;a--){const n=t[a];if(n===";")return!1;if(n===")"||n==="]"||n==="}"){n===")"?e++:n==="]"?r++:s++;continue}if(n==="("||n==="["||n==="{"){if(n==="("){if(e===0)return!1;e--}else if(n==="["){if(r===0)return!1;r--}else{if(s===0)return!1;s--}continue}if(n==="?"&&e===0&&r===0&&s===0){if(t[a+1]==="."||a>0&&/[A-Za-z0-9_$]/.test(t[a-1])&&t[a+1]==="?")continue;let l=a+1;for(;l<t.length&&(t[l]===" "||t[l]==="	"||t[l]===`
`||t[l]==="\r");)l++;if(l<t.length&&(t[l]===":"||t[l]===","||t[l]===")"))continue;return!0}if(n===":"&&e===0&&r===0&&s===0)return!1}return!1}function Be(t){let o="",e=0;const r=t.length;let s="code",a=0;for(;e<r;){const n=t[e];if(s==="code"){if(n==="/"&&t[e+1]==="/"){s="line",o+="//",e+=2;continue}if(n==="/"&&t[e+1]==="*"){s="block",o+="/*",e+=2;continue}if(n==="'"){s="sq",o+=n,e++;continue}if(n==='"'){s="dq",o+=n,e++;continue}if(n==="`"){s="tpl",o+=n,e++;continue}if(n==="<"){const l=t[e+1]??"";if(/[A-Za-z_>/]/.test(l)||l==="/"&&/[A-Za-z_>]/.test(t[e+2]??"")){const p=Te(t,e);if(p){o+=Pe(p.node),e=p.end;continue}}o+=n,e++;continue}o+=n,e++;continue}if(s==="line"){o+=n,n===`
`&&(s="code"),e++;continue}if(s==="block"){if(o+=n,n==="*"&&t[e+1]==="/"){o+="/",e+=2,s="code";continue}e++;continue}if(s==="sq"||s==="dq"){const l=s==="sq"?"'":'"';if(o+=n,n==="\\"){o+=t[e+1]??"",e+=2;continue}n===l&&(s="code"),e++;continue}if(o+=n,n==="\\"){o+=t[e+1]??"",e+=2;continue}if(n==="$"&&t[e+1]==="{"){a++,o+="{",e+=2;continue}if(n==="{"&&a>0){a++,e++;continue}if(n==="}"&&a>0){a--,e++;continue}n==="`"&&a===0&&(s="code"),e++}return o}function Mt(t){let o=!1,e="",r=0;const s=t.length;let a="code";for(;r<s;){const n=t[r];if(a==="code"){if(n==="/"&&t[r+1]==="/"){a="line",e+="//",r+=2;continue}if(n==="/"&&t[r+1]==="*"){a="block",e+="/*",r+=2;continue}if(n==="'"){a="sq",e+=n,r++;continue}if(n==='"'){a="dq",e+=n,r++;continue}if(n==="`"){a="tpl",e+=n,r++;continue}if(n==="<"){const l=t[r+1]??"";if(/[A-Za-z_>/]/.test(l)||l==="/"&&/[A-Za-z_>]/.test(t[r+2]??"")){const p=Te(t,r);if(p){o=!0,e+=Pe(p.node),r=p.end;continue}}e+=n,r++;continue}e+=n,r++;continue}if(a==="line"){e+=n,n===`
`&&(a="code"),r++;continue}if(a==="block"){if(e+=n,n==="*"&&t[r+1]==="/"){e+="/",r+=2,a="code";continue}r++;continue}if(a==="sq"||a==="dq"){const l=a==="sq"?"'":'"';if(e+=n,n==="\\"){e+=t[r+1]??"",r+=2;continue}n===l&&(a="code"),r++;continue}if(e+=n,n==="\\"){e+=t[r+1]??"",r+=2;continue}n==="`"&&(a="code"),r++}return{code:e,hadJSX:o}}function oe(t,o){for(;o<t.length&&/\s/.test(t[o]);)o++;return o}function Fe(t,o){if(t[o]===">")return{name:"",end:o};const e=/^[A-Za-z_][A-Za-z0-9_.-]*/.exec(t.slice(o,o+64));return e?{name:e[0],end:o+e[0].length}:null}function Lt(t,o){const e=t[o];if(e!=='"'&&e!=="'")return null;let r=o+1;for(;r<t.length;){if(t[r]==="\\"){r+=2;continue}if(t[r]===e)return{end:r+1};if(t[r]===`
`)return null;r++}return null}function he(t,o,e,r){let s=0,a=o,n="code";for(;a<t.length;){const l=t[a],p=t[a+1]??"";if(n==="code"){if(l==="/"&&p==="/"){n="line",a+=2;continue}if(l==="/"&&p==="*"){n="block",a+=2;continue}if(l==="'"){n="sq",a++;continue}if(l==='"'){n="dq",a++;continue}if(l==="`"){n="tpl",a++;continue}if(l===e&&s++,l===r&&(s--,s===0))return{end:a+1};a++;continue}if(n==="line"){l===`
`&&(n="code"),a++;continue}if(n==="block"){if(l==="*"&&p==="/"){n="code",a+=2;continue}a++;continue}if(n==="sq"||n==="dq"){const c=n==="sq"?"'":'"';if(l==="\\"){a+=2;continue}l===c&&(n="code"),a++;continue}if(l==="\\"){a+=2;continue}l==="`"&&(n="code"),a++}return null}function Te(t,o){let e=o+1,r=!1;t[e]==="/"&&(r=!0,e++);const s=Fe(t,e);if(!s||(e=oe(t,s.end),r))return null;const a=[];let n=!1;for(;e<t.length;){if(e=oe(t,e),t[e]==="/"&&t[e+1]===">"){n=!0,e+=2;break}if(t[e]===">"){e++;break}if(t[e]==="{"){const b=he(t,e,"{","}");if(!b)return null;const i=t.slice(e+1,b.end-1).trim();if(!i.startsWith("..."))return null;a.push(`...(${i.slice(3).trim()||"{}"})`),e=b.end;continue}const p=/^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(t.slice(e,e+64));if(!p)return null;const c=p[0];if(e+=c.length,e=oe(t,e),t[e]!=="="){a.push(`${JSON.stringify(c)}: true`);continue}if(e++,e=oe(t,e),t[e]==='"'||t[e]==="'"){const b=Lt(t,e);if(!b)return null;a.push(`${JSON.stringify(c)}: ${t.slice(e,b.end)}`),e=b.end;continue}if(t[e]==="{"){const b=he(t,e,"{","}");if(!b)return null;const i=t.slice(e+1,b.end-1).trim();a.push(`${JSON.stringify(c)}: (${Be(i)||"undefined"})`),e=b.end;continue}return null}const l={tag:s.name,props:a.length?`{${a.join(", ")}}`:"null",children:[]};if(n)return{node:l,end:e};for(;e<t.length;){if(t[e]==="<"&&t[e+1]==="/"){let i=e+2;if(i=oe(t,i),s.name==="")return i=oe(t,i),t[i]!==">"?null:{node:l,end:i+1};const d=Fe(t,i);if(!d||d.name!==s.name)return null;let v=oe(t,d.end);return t[v]!==">"?null:{node:l,end:v+1}}if(t[e]==="<"){const i=t[e+1]??"";if(/[A-Za-z_>/]/.test(i)||i==="/"&&/[A-Za-z_>]/.test(t[e+2]??"")){const d=Te(t,e);if(!d)return null;l.children.push(Pe(d.node)),e=d.end;continue}l.children.push(JSON.stringify("<")),e++;continue}if(t[e]==="{"){const i=he(t,e,"{","}");if(!i)return null;const d=t.slice(e+1,i.end-1);d.trim()===""||/^\/\*[\s\S]*\*\/$/.test(d.trim())||l.children.push(`(${Be(d.trim())||"undefined"})`),e=i.end;continue}let p=e;for(;p<t.length&&t[p]!=="<"&&t[p]!=="{";)p++;const c=t.slice(e,p),b=c.replace(/\s+/g," ");if(b.trim()!==""){const i=/^\s/.test(c)?" ":"",d=/\s$/.test(c)?" ":"";l.children.push(JSON.stringify(`${i}${b.trim()}${d}`))}e=p}return null}function Pe(t){const o=t.tag===""?"React.Fragment":/^[A-Z]/.test(t.tag)||t.tag.includes(".")?t.tag:JSON.stringify(t.tag),e=t.children.length?`, ${t.children.join(", ")}`:"";return`React.createElement(${o}, ${t.props}${e})`}const ve=20,be=100,It=/\.(js|jsx|ts|tsx|mjs|cjs)$/,Ht=/^[A-Za-z0-9_][A-Za-z0-9_-]*$/,qt=/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;function Ze(t){return t.replace(It,"")}function Ue(t){const o=t.lastIndexOf("/");return o===-1?"":t.slice(0,o)}function ce(t){const o=t.replace(/[^A-Za-z0-9_$]/g,"_");return/^[0-9]/.test(o)?`_${o}`:o}function Bt(t,o){if(t==="react")return"react";if(t.includes("\\"))throw new Error(`import '${t.slice(0,80)}' must use '/' separators (found '\\') — use './name' instead`);if(t.includes("%"))throw new Error(`import '${t.slice(0,80)}' must not contain URL-encoded characters ('%') — use './name' instead`);if(t.includes("?")||t.includes("#"))throw new Error(`import '${t.slice(0,80)}' must not contain '?' or '#' — use './name' instead`);if(!t.startsWith("./")&&!t.startsWith("../"))throw new Error(`import '${t.slice(0,80)}' is not allowed — only relative './...'/'../...' staying inside the page root and 'react' are allowed; React and sdk are already in scope`);if(t.includes("//"))throw new Error(`import '${t.slice(0,80)}' contains an empty path segment ('//') — use './name' instead`);const e=o?o.split("/"):[];for(const r of t.split("/")){if(r===""||r==="."){if(r==="")throw new Error(`import '${t.slice(0,80)}' contains an empty path segment — use './name' instead`);continue}if(r===".."){if(e.length===0)throw new Error(`import '${t.slice(0,80)}' escapes the page root (.. beyond root) — keep files at the page root and import with './name'`);e.pop();continue}if(!qt.test(r))throw new Error(`import '${t.slice(0,80)}' has an unsupported path segment '${r.slice(0,40)}' — use letters, numbers, '_', '-' or '.'`);e.push(r)}if(e.length===0)throw new Error(`import '${t.slice(0,80)}' points at the page root — import a file (e.g. './util') instead`);return e.join("/")}function Ft(t){if(t.length===0||t.length>64||!Ht.test(t))throw new Error(`module name '${t.slice(0,64)}' is not allowed — keep files at the page root (start with a letter, number or underscore; letters, numbers, '_' or '-' only; max 64 chars)`)}function tt(t){const o=[];for(const e of t.split(`
`)){if(!/^\s*import\b/.test(re(e)))continue;let r=e.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);if(r){o.push({spec:r[1],kind:"side"});continue}r=e.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/),r&&o.push({...rt(r[1]),spec:r[2]})}return o}function rt(t){const o=t.trim(),e=o.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);if(e)return{kind:"namespace",namespace:e[1]};const r=/^[A-Za-z_$][A-Za-z0-9_$]*$/;if(o.startsWith("{")){const a=We(o);return a?{kind:"named",named:a}:{kind:"odd"}}const s=o.indexOf("{");if(s!==-1){const a=o.slice(0,s).trim().replace(/,$/,"").trim(),n=We(o.slice(s));return n&&r.test(a)?{kind:"mixed",defaultName:a,named:n}:{kind:"odd"}}return r.test(o)?{kind:"default",defaultName:o}:{kind:"odd"}}function We(t){const o=t.trim().match(/^\{([^}]*)\}$/);if(!o)return null;const e=[];for(const r of o[1].split(",")){const s=r.trim();if(!s)continue;const a=s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);if(a){e.push({imported:a[1],local:a[2]});continue}if(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)){e.push({imported:s,local:s});continue}return null}return e}function Zt(t){const o=[],e=[];let r=!1;for(const s of t.split(`
`)){const n=re(s).trim();if(/^export\s+default\b/.test(n)){r=!0;continue}let l=n.match(/^export\s+(?:async\s+function\s+|function\s+|class\s+|enum\s+|namespace\s+)([A-Za-z_$][A-Za-z0-9_$]*)/);if(l){o.push(l[1]);continue}if(l=n.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/),l){o.push(l[1]);continue}if(l=n.match(/^export\s+(interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/),l){e.push(l[2]);continue}if(l=n.match(/^export\s*\{([^}]*)\}\s*;?\s*$/),l&&!/\bfrom\b/.test(n))for(const p of l[1].split(",")){const c=p.trim();if(!c)continue;const b=c.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);b?o.push(b[2]):/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c)&&o.push(c)}}return{values:o,types:e,hasDefault:r}}function Ut(t,o){var q;const e=Object.keys(o);if(e.length>ve)throw new Error(`too many modules (${e.length}, max ${ve}) — merge small helpers into fewer files`);const r=new Map;for(const E of e){Ft(E);const _=Ze(E),P=r.get(_);if(P)throw new Error(`duplicate module '${_}' ('${P.name}' vs '${E}') — Files names must be unique ignoring extensions`);r.set(_,{name:E,content:o[E]??""})}const s=[...r.keys()].sort(),a=new Map,n=(E,_,P)=>{if(E==="react")return null;const C=Ze(Bt(E,P));if(!r.has(C)){const M=_==="index"?"index":`'${_}'`,k=s.length?s.join(", "):"(no modules)";throw new Error(`unknown module '${E.slice(0,80)}' (imported by ${M}) — available modules: ${k} — add a Files entry or fix the path`)}return C},l=[{key:"index",dir:"",src:t},...[...r].map(([E,_])=>({key:E,dir:Ue(E),src:_.content}))];for(const E of l){const _=[];for(const P of tt(E.src)){if(P.kind==="odd")continue;const C=n(P.spec,E.key==="index"?"index":((q=r.get(E.key))==null?void 0:q.name)??E.key,E.dir);C!==null&&!_.includes(C)&&_.push(C)}a.set(E.key,_)}const p=new Set(["index"]),c=["index"];let b=0;for(;c.length;){if(++b>be*20)throw new Error(`module graph too large — check for runaway imports (max ${ve} modules)`);const E=c.pop();for(const _ of a.get(E)??[])p.has(_)||(p.add(_),c.push(_))}{const E=_=>{let P=0,C=_;const M=new Set;for(;C!=="index"&&!M.has(C);){M.add(C);let k=null;for(const[y,j]of a)if(p.has(y)&&j.includes(C)){k=y;break}if(!k||(C=k,++P>be))break}return P};for(const _ of p)if(_!=="index"&&E(_)>be)throw new Error(`module graph too deep (>${be}) — flatten the import chain`)}const i=[],d=new Map,v=[];(E=>{const _=[{key:E,i:0}];for(;_.length;){const P=_[_.length-1];(d.get(P.key)??0)===0&&(d.set(P.key,1),v.push(P.key));const M=(a.get(P.key)??[]).filter(k=>p.has(k));if(P.i<M.length){const k=M[P.i++],y=d.get(k)??0;if(y===1){const j=[...v.slice(v.indexOf(k)),k].map(L=>{var Z;return L==="index"?"index":`'${((Z=r.get(L))==null?void 0:Z.name)??L}'`});throw new Error(`circular import detected: ${j.join(" -> ")} — break the cycle by moving shared code into a leaf module`)}y===0&&_.push({key:k,i:0});continue}d.set(P.key,2),v.pop(),P.key!=="index"&&i.push(P.key),_.pop()}})("index");const g=new Map;for(const E of i)g.set(E,Zt(r.get(E).content));const A=new Map,T=new Map;let z=!1;const O=E=>{for(const _ of E.split(`
`)){if(!/^\s*import\b/.test(re(_)))continue;if(/^\s*import\s+['"]react['"]\s*;?\s*$/.test(_)){z=!0;continue}const P=_.match(/^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/);if(!P)continue;const C=P[1].trim(),M=C.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);if(M){T.set(M[1],!0);continue}const k=C.match(/^([A-Za-z_$][A-Za-z0-9_$]*)?\s*,?\s*(\{[^}]*\})?$/);if(k&&k[2])for(const y of k[2].slice(1,-1).split(",")){const j=y.trim();if(!j)continue;const L=j.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);L?A.has(L[2])||A.set(L[2],L[1]):/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(j)&&(A.has(j)||A.set(j,j))}}};O(t);for(const E of i)O(r.get(E).content);const m=(E,_,P)=>{var y,j,L,Z,V;const C=`__ks_default_${ce(_==="index"?"index":((y=r.get(_))==null?void 0:y.name)??_)}`,M=E.split(`
`),k=[];for(const J of M){const Q=re(J);if(_!=="index"&&/^\s*export\s+default\b/.test(Q)){k.push(J.replace(/export\s+default/,`const ${C} =`));continue}if(_!=="index"&&/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(Q)&&!/\bfrom\b/.test(Q)){k.push("// (bundled export list: names are top-level after inlining)");continue}if(!/^\s*import\b/.test(Q)){k.push(J);continue}if(/^\s*import\s+['"]react['"]\s*;?\s*$/.test(J)||J.match(/^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/))continue;const u=J.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);if(u){const D=u[1];if(D==="react")continue;n(D,_==="index"?"index":((j=r.get(_))==null?void 0:j.name)??_,P),k.push(`// (bundled import '${D.slice(0,60)}')`);continue}const f=J.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);if(!f){k.push(J);continue}const h=rt(f[1]),x=f[2];if(x==="react"||h.kind==="odd"){k.push(J);continue}const N=n(x,_==="index"?"index":((L=r.get(_))==null?void 0:L.name)??_,P),S=g.get(N)??{values:[],types:[],hasDefault:!1},U=`'${((Z=r.get(N))==null?void 0:Z.name)??N}'`,Y=[],ie=D=>{for(const{imported:K,local:X}of D){if(K==="default"){if(!S.hasDefault){const B=S.values.length?S.values.slice().sort().join(", "):"(no value exports)";throw new Error(`module ${U} has no default export — available: ${B} — add 'export default ...' or use a named import`)}Y.push(`const ${X} = __ks_default_${ce(r.get(N).name)};`);continue}if(S.types.includes(K)&&!S.values.includes(K))throw new Error(`module ${U} export '${K}' is a type (interface/type) and cannot be imported as a value — import a function, const or component instead`);if(!S.values.includes(K)){const B=S.values.length?S.values.slice().sort().join(", "):"(no value exports)";throw new Error(`module ${U} has no export '${K}' — available: ${B}`)}X!==K&&Y.push(`const ${X} = ${K};`)}};if(h.kind==="namespace"){const D=S.values.map(K=>`${K}: ${K}`);S.hasDefault&&D.push(`default: ${`__ks_default_${ce(r.get(N).name)}`}`),Y.push(`const ${h.namespace} = { ${D.join(", ")} };`)}else if(h.kind==="default"){if(!S.hasDefault){const D=S.values.length?S.values.slice().sort().join(", "):"(no value exports)";throw new Error(`module ${U} has no default export (imported by ${_==="index"?"index":`'${((V=r.get(_))==null?void 0:V.name)??_}'`}) — available: ${D} — add 'export default ...' or use a named import`)}Y.push(`const ${h.defaultName} = __ks_default_${ce(r.get(N).name)};`)}else if(h.kind==="named"&&h.named)ie(h.named);else if(h.kind==="mixed"&&h.named&&h.defaultName){if(!S.hasDefault){const D=S.values.length?S.values.slice().sort().join(", "):"(no value exports)";throw new Error(`module ${U} has no default export — available: ${D} — add 'export default ...' or use a named import`)}Y.push(`const ${h.defaultName} = __ks_default_${ce(r.get(N).name)};`),ie(h.named)}else{k.push(J);continue}k.push(`// (bundled import from '${x.slice(0,60)}')`);for(const D of Y)k.push(D)}return k.join(`
`)},H=[];if(z||A.size>0||T.size>0){H.push("// (bundled react imports: runtime already in scope)"),z&&H.push("// (dropped side-effect import of react: runtime already in scope)");for(const E of[...T.keys()].sort())H.push(`const ${E} = React;`);if(A.size>0){const E=[...A.entries()].sort((_,P)=>_[0]<P[0]?-1:1).map(([_,P])=>_===P?_:`${P}: ${_}`).join(", ");H.push(`const {${E}} = React;`)}}for(const E of i){const _=r.get(E);H.push(`// ---- module: ${_.name} (bundled) ----`),H.push(m(_.content,E,Ue(E)))}H.push("// ---- entry (index) ----"),H.push(m(t,"index",""));const I=H.join(`
`);if(I.length>512*1024)throw new Error(`combined page source too large (${I.length} bytes including ${i.length} module(s), max 524288) — split the page or shrink modules (components budget is 512KiB total)`);return I}function Wt(t,o){const e=o??{},s=tt(t).some(p=>p.spec!=="react")?Ut(t,e):t,a=St(s),n=Mt(a.code),l=Et(n.code);return{code:l.code,hadJSX:n.hadJSX,hadTS:l.hadTS,hadImport:a.hadImport}}const Dt=["actions","archivePaths","chart","chmodPath","config","confirm","connectWS","copyPath","copyText","createAutomationJob","createDirectory","debounce","deleteAutomationJob","deleteFile","deleteSecret","disableSftp","docker","downloadAutomation","downloadFile","downloadText","emit","enableSftp","executeAction","extractArchive","fetchPanel","formatBytes","getMetrics","getSftp","importAutomationURL","instance","killProcess","kv","kvm","listAudit","listAutomation","listAutomationRuns","listFiles","listPorts","listProcesses","listSecrets","lxd","markdown","modal","navigate","on","once","pageSlug","power","prompt","readFile","reinstall","renamePath","revealSecret","revealSftp","rotateSftp","runAction","runAutomationJob","saveEnv","savePorts","searchFiles","sendActionStdin","sendInstallStdin","setSecret","shell","statPath","storage","subscribe","timeAgo","toast","updateAutomationJob","updateIdentity","uploadFile","uploadFromUrl","useHashRoute","writeFile"],Jt=new Set(Dt),Kt=[{needle:"eval(",message:"Build will reject `eval(` — pages must use sdk.* helpers instead (no dynamic code execution)"},{needle:"new function",message:"Build will reject the `Function` constructor (`new function`) — pages must use sdk.* helpers instead"},{needle:"__proto__",message:"Build will reject `__proto__` — prototype pollution is not allowed in page sources"},{needle:"xmlhttprequest",message:"Build will reject `XMLHttpRequest` — use `sdk.fetchPanel` instead"},{needle:"document.cookie",message:"Build will reject `document.cookie` — pages must not touch cookies directly"},{needle:"localstorage",message:"Build will reject `localStorage` — use `sdk.storage` instead"},{needle:"sessionstorage",message:"Build will reject `sessionStorage` — use `sdk.storage` instead"},{needle:"child_process",message:"Build will reject `child_process` — pages must use saved actions via `sdk.runAction`"},{needle:"require(",message:"Build will reject `require(` — only `import ... from 'react'` and relative `./...` modules are allowed"}];function Pr(t){const o=[],e=re(t),r=e.split(`
`).length,s=[0];for(let n=0;n<e.length;n++)e[n]===`
`&&s.push(n+1);const a=n=>{let l=0,p=s.length-1;for(;l<p;){const c=l+p+1>>1;s[c]<=n?l=c:p=c-1}return l+1};{const n=[],l={")":"(","]":"[","}":"{"},p={"(":")","[":"]","{":"}"};let c=1;for(let b=0;b<e.length;b++){const i=e[b];if(i===`
`){c++;continue}if(i==="("||i==="["||i==="{")n.push({ch:i,line:c});else if(i===")"||i==="]"||i==="}"){const d=n.pop();d?d.ch!==l[i]&&o.push({line:c,message:`mismatched brackets — \`${d.ch}\` opened on line ${d.line} closed by \`${i}\` here`,severity:"warn"}):o.push({line:c,message:`unbalanced \`${i}\` — no matching \`${l[i]}\` (Build will fail)`,severity:"warn"})}}for(const b of n)o.push({line:b.line,message:`unclosed \`${b.ch}\` — missing \`${p[b.ch]}\` (Build will fail)`,severity:"warn"})}/(^|[^A-Za-z0-9_$])return\s+Page\b/.test(e)||o.push({line:Math.max(1,r),message:"missing `return Page;` — pages must define `function Page()` and end with `return Page;`",severity:"warn"});{const n=/(^|[^A-Za-z0-9_$])sdk\.([A-Za-z_$][A-Za-z0-9_$]*)/g,l=new Set;let p;for(;(p=n.exec(e))!==null;){const c=p[2];if(Jt.has(c))continue;const b=a(p.index+p[1].length),i=`${b}:${c}`;l.has(i)||(l.add(i),o.push({line:b,message:`unknown sdk.${c} — not on CustomPageAPI (typo? check the SDK method name)`,severity:"warn"}))}}{const n=e.toLowerCase();for(const{needle:b,message:i}of Kt){let d=0;for(;;){const v=n.indexOf(b,d);if(v===-1)break;o.push({line:a(v),message:i,severity:"warn"}),d=v+b.length}}const l=e.split("sdk.fetchPanel").join(" ".repeat(14)),p=/(^|[^A-Za-z0-9_$])fetch\s*\(/g;let c;for(;(c=p.exec(l))!==null;)o.push({line:a(c.index+c[1].length),message:"Build will reject raw `fetch(` — use `sdk.fetchPanel` instead",severity:"warn"})}{const n=t.split(`
`);for(let l=0;l<n.length;l++){const p=n[l];if(!/^\s*import\b/.test(re(p)))continue;let c=null;const b=p.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);if(b)c=b[1];else{const i=p.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);i&&(c=i[2])}c!==null&&c!=="react"&&(c.startsWith("./")||c.startsWith("../")||o.push({line:l+1,message:`import from '${c.slice(0,60)}' will fail Build — only \`from 'react'\` and relative \`./...\` staying inside the page root are allowed; React and sdk are already in scope`,severity:"warn"}))}}return o.sort((n,l)=>n.line-l.line),o}const xe='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',ye='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>',De='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',Je='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px" aria-hidden="true"><polyline points="6 9 12 15 18 15"/></svg>',Ke="var p=this.closest('.ks-actions-pill,.ks-form-actions-pill');var c=p.querySelector('.ks-pill-content');var off=p.classList.toggle('ks-pill-collapsed');if(c){c.style.maxWidth=off?'0':'800px';c.style.opacity=off?'0':'1';c.style.transform=off?'translateX(8px)':'none';c.style.pointerEvents=off?'none':'auto';c.style.visibility=off?'hidden':'visible';c.style.overflow='hidden';if(!off){c.style.overflow='visible';}c.setAttribute('aria-hidden',off?'true':'false');}var a=this.querySelector('[data-chev=open]'),b=this.querySelector('[data-chev=shut]');if(a)a.style.display=off?'none':'';if(b)b.style.display=off?'':'none';this.setAttribute('aria-label',off?'Show actions':'Hide actions');this.setAttribute('aria-expanded',off?'false':'true');this.setAttribute('title',off?'Show actions':'Hide actions');if(off){this.style.setProperty('--ks-tab-px','4px');}else{this.style.setProperty('--ks-tab-px','var(--ks-pill-tab-px,10px)');}",Gt="var p=this.closest('.ks-tabs-pill');var c=p.querySelector('.ks-pill-content');var off=p.classList.toggle('ks-pill-collapsed');if(c){c.style.maxHeight=off?'0':'50vh';c.style.opacity=off?'0':'1';c.style.transform=off?'translateY(8px)':'none';c.style.pointerEvents=off?'none':'auto';c.style.visibility=off?'hidden':'visible';c.style.overflow='hidden';if(!off){c.style.overflowY='auto';}c.setAttribute('aria-hidden',off?'true':'false');p.setAttribute('data-open',off?'false':'true');}var a=this.querySelector('[data-chev=open]'),b=this.querySelector('[data-chev=shut]');if(a)a.style.display=off?'none':'';if(b)b.style.display=off?'':'none';this.setAttribute('aria-expanded',off?'false':'true');if(off){this.style.setProperty('--ks-tab-px','4px');}else{this.style.setProperty('--ks-tab-px','var(--ks-pill-tab-px,10px)');}",we="var g=this.parentElement;g.querySelectorAll('.ks-tab').forEach(function(b){b.classList.remove('ks-tab-active');b.setAttribute('aria-selected','false');});this.classList.add('ks-tab-active');this.setAttribute('aria-selected','true');",$e="--ks-tab-px:var(--ks-pill-tab-px,10px);--ks-tab-py:var(--ks-pill-tab-py,5px);--ks-tab-font:var(--ks-pill-tab-font,13px);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0",Vt=`<style id="ks-instance-theme-support">/* Instance pages — unified panel design system
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
`,Yt=[{name:"ks_theme_head",label:"Theme head",description:"Global theme header: panel design-system CSS using var(--ks-*) tokens. Include once at the top of every html page via {{component:ks_theme_head}}.",content:Vt},{name:"panel_action_pill",label:"Action pill",description:"Functional top-right actions cluster mirroring PageActionsPill (role=toolbar, ks-pill-content, slide+fade collapse, slim 4px chevron toggle, aria-expanded/hidden). Demo Refresh/Run buttons — replace the content row with your own actions; the toggle works as-is.",content:`<div style="position:fixed;top:12px;right:12px;z-index:40"><div class="ks-card ks-pill-anim ks-actions-pill" role="toolbar" aria-label="Page actions" style="display:flex;align-items:center;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px"><div class="ks-pill-content" style="display:flex;align-items:center;gap:4px" aria-hidden="false"><button type="button" class="ks-tab" style="padding:5px 10px;font-size:13px" onclick="location.reload()" title="Refresh">Refresh</button><button type="button" class="ks-tab ks-tab-active" style="padding:5px 10px;font-size:13px" onclick="KSPageSDK.toast('Action pill ready','success')" title="Primary action">Run</button></div><button type="button" class="ks-tab ks-pill-toggle" style="${$e}" aria-label="Hide actions" aria-expanded="true" title="Hide actions" onclick="${Ke}"><span data-chev="open">${ye}</span><span data-chev="shut" style="display:none">${xe}</span></button></div></div>`},{name:"panel_tabs_pill",label:"Tabs pill",description:"Functional phone tab bar mirroring PageTabsPill (ks-tabs-pill shell, tablist semantics, rise+fade menu, ^/v toggle, aria-selected updates on select). Tab clicks also collapse back to ^ like the panel.",content:`<nav class="ks-tabs-pill-wrap" aria-label="Page tabs" style="position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;justify-content:flex-start;pointer-events:none"><div style="pointer-events:auto;max-width:100%"><div class="ks-card ks-pill-anim ks-tabs-pill" style="display:inline-flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;border-radius:8px;max-width:calc(100vw - 24px);--ks-card-padding:6px" data-open="true"><div class="ks-pill-content" role="tablist" aria-label="Page tabs" onclick="if(event.target&&event.target.closest&&event.target.closest('button')){var p=this.closest('.ks-tabs-pill');var c=this;var t=p.querySelector('.ks-pill-toggle');c.style.maxHeight='0';c.style.opacity='0';c.style.transform='translateY(8px)';c.style.pointerEvents='none';c.style.visibility='hidden';c.style.overflow='hidden';c.setAttribute('aria-hidden','true');p.classList.add('ks-pill-collapsed');p.setAttribute('data-open','false');if(t){var a=t.querySelector('[data-chev=open]'),b=t.querySelector('[data-chev=shut]');if(a)a.style.display='none';if(b)b.style.display='';t.setAttribute('aria-expanded','false');t.style.setProperty('--ks-tab-px','4px');}}" style="display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow-y:auto" aria-hidden="false" data-open="true"><button type="button" class="ks-tab ks-tab-active" role="tab" aria-selected="true" style="justify-content:flex-start" onclick="${we}">Overview</button><button type="button" class="ks-tab" role="tab" aria-selected="false" style="justify-content:flex-start" onclick="${we}">Details</button><button type="button" class="ks-tab" role="tab" aria-selected="false" style="justify-content:flex-start" onclick="${we}">Settings</button></div><button type="button" class="ks-tab ks-pill-toggle" style="${$e};width:100%" aria-label="Hide tabs" aria-expanded="true" title="Hide tabs" onclick="${Gt}"><span data-chev="open">${Je}</span><span data-chev="shut" style="display:none">${De}</span></button></div></div></nav>`},{name:"panel_form_actions_pill",label:"Form actions pill",description:"Bottom-right Save/Cancel bar mirroring PageFormActionsPill (ks-form-actions-pill, wrap-friendly, same slide+fade toggle as the actions pill). Always visible by default; auto-hide is opt-in per page.",content:`<div style="position:fixed;left:12px;right:12px;bottom:12px;z-index:40;display:flex;justify-content:flex-end;pointer-events:none"><div style="pointer-events:auto"><div class="ks-card ks-pill-anim ks-form-actions-pill" role="toolbar" aria-label="Form actions" style="display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px;padding:6px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.40);--ks-card-padding:6px"><div class="ks-pill-content" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap" aria-hidden="false"><button type="button" class="ks-btn" title="Cancel">Cancel</button><button type="button" class="ks-btn ks-btn-blue" title="Save">Save</button></div><button type="button" class="ks-tab ks-pill-toggle" style="${$e}" aria-label="Hide form actions" aria-expanded="true" title="Hide form actions" onclick="${Ke}"><span data-chev="open">${ye}</span><span data-chev="shut" style="display:none">${xe}</span></button></div></div></div>`},{name:"panel_page_header",label:"Page header",description:"Panel page header: title left, icon buttons right (Templates/Nodes pattern).",content:'<div class="ks-page-header"><h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">Title</h2><div class="ks-page-header-actions"><button type="button" class="ks-btn-header ks-icon-btn" title="Refresh" aria-label="Refresh" onclick="location.reload()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button></div></div>'},{name:"panel_glass_card",label:"Glass card",description:"Baseline panel surface (.ks-card / .glass-card) with heading + body.",content:'<div class="ks-card"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">Card title</h3><p class="ks-muted" style="margin:0;font-size:13px">Body text follows the active theme automatically.</p></div>'},{name:"panel_stat_card",label:"Stat card",description:"Panel stat card with label, big value and unit.",content:'<div class="ks-card ks-stat-card" role="group" aria-label="Statistic"><p class="ks-muted" style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Containers</p><p style="margin:0;font-size:1.5rem;font-weight:600;color:var(--ks-heading)">42<span class="ks-muted" style="font-size:.85rem;margin-left:4px">up</span></p></div>'},{name:"panel_badge",label:"Badge",description:"Status pills (.ks-badge) with ok/warn/bad tones — one per state.",content:'<span role="group" aria-label="Badge examples"><span class="ks-badge">default</span> <span class="ks-badge ks-ok">running</span> <span class="ks-badge ks-warn">paused</span> <span class="ks-badge ks-bad">stopped</span></span>'},{name:"panel_alert",label:"Alert",description:"Inline notice using panel wash tokens. Announced to screen readers.",content:'<div class="ks-card" role="alert" style="border-color:var(--ks-info-line,rgba(7,89,133,.45));background:var(--ks-info-wash,rgba(2,132,199,.3));color:var(--ks-body)">Heads up — this uses the active theme colors.</div>'},{name:"panel_progress",label:"Progress bar",description:"Panel progress bar (.ks-bar). Set width % on the inner span and keep aria-valuenow in sync.",content:'<div class="ks-bar" role="progressbar" aria-label="Progress" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100"><span style="width:62%"></span></div>'},{name:"panel_table",label:"Table",description:"Panel table shell (thead + body) with theme borders.",content:'<div class="ks-card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead><tr><th scope="col">Name</th><th scope="col">Status</th></tr></thead><tbody><tr><td>web</td><td class="ks-ok">Running</td></tr><tr><td>db</td><td class="ks-muted">Stopped</td></tr></tbody></table></div></div>'},{name:"panel_buttons",label:"Buttons",description:"Panel button family (.ks-btn / .ks-btn-blue / .ks-btn-green / .ks-btn-red).",content:'<div class="ks-row"><button type="button" class="ks-btn">Default</button><button type="button" class="ks-btn ks-btn-blue">Primary</button><button type="button" class="ks-btn ks-btn-green">Success</button><button type="button" class="ks-btn ks-btn-red">Danger</button></div>'},{name:"panel_skeleton",label:"Skeleton",description:"Loading shimmer used while KSPageSDK data loads. Hidden from screen readers.",content:'<div class="ks-card" aria-hidden="true"><div class="ks-skeleton-bar" style="height:10px;width:40%;margin-bottom:8px"></div><div class="ks-skeleton" style="height:10px;width:70%"></div></div>'},{name:"panel_modal",label:"Modal",description:"Panel modal shell (.ks-ip-modal-*). Static preview — wire your own open/close; the ✕ hides this demo copy.",content:`<div class="ks-ip-modal-overlay" style="position:static;padding:0;background:transparent"><div class="ks-ip-modal-panel" role="dialog" aria-modal="true" aria-label="Dialog" style="max-width:420px;margin:0 auto"><div class="ks-ip-modal-header"><h3 class="ks-ip-modal-title">Dialog</h3><button type="button" class="ks-ip-modal-close" aria-label="Close dialog" onclick="this.closest('.ks-ip-modal-panel').style.display='none'">✕</button></div><div class="ks-ip-modal-body"><p class="ks-muted" style="margin:0;font-size:13px">Modal body text.</p></div><div class="ks-ip-modal-footer"><button type="button" class="ks-btn">Cancel</button><button type="button" class="ks-btn ks-btn-blue">Confirm</button></div></div></div>`},{name:"panel_empty_state",label:"Empty state",description:'Centered empty-state card from panel primitives (mirrors host "no content yet" blocks).',content:'<div class="ks-card" role="status" style="text-align:center;padding:2rem 1rem"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">Nothing here yet</h3><p class="ks-muted" style="margin:0;font-size:13px">Items you create will appear here.</p></div>'},{name:"icon_chev_left",label:"Chevron left",description:"Pill toggle glyph: show actions (collapsed pill).",content:xe},{name:"icon_chev_right",label:"Chevron right",description:"Pill toggle glyph: hide actions (expanded pill).",content:ye},{name:"icon_chev_up",label:"Chevron up",description:"Tabs-pill toggle glyph: collapsed menu (show tabs).",content:De},{name:"icon_chev_down",label:"Chevron down",description:"Tabs-pill toggle glyph: open menu (hide tabs).",content:Je}],Xt=new Map(Yt.map(t=>[t.name,t]));function Ae(t){var o;return((o=Xt.get(t))==null?void 0:o.content)??""}const Oe="{ padding: '5px 10px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '--ks-tab-px': 'var(--ks-pill-tab-px,10px)', '--ks-tab-py': 'var(--ks-pill-tab-py,5px)', '--ks-tab-font': 'var(--ks-pill-tab-font,13px)' }",je="{ padding: '5px 4px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '--ks-tab-px': '4px', '--ks-tab-py': 'var(--ks-pill-tab-py,5px)', '--ks-tab-font': 'var(--ks-pill-tab-font,13px)' }",nt="React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, React.createElement('polyline', { points: '15 18 9 12 15 6' }))",at="React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, React.createElement('polyline', { points: '9 18 15 12 9 6' }))",Qt="React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, React.createElement('polyline', { points: '18 15 12 9 6 15' }))",er="React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: '16px', height: '16px' }, 'aria-hidden': 'true' }, React.createElement('polyline', { points: '6 9 12 15 18 15' }))",tr=`function ActionPill(props) {
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
      React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: collapsed ? ${je} : ${Oe}, title: collapsed ? 'Show actions' : 'Hide actions', 'aria-label': collapsed ? 'Show actions' : 'Hide actions', 'aria-expanded': !collapsed, onClick: handleToggle }, collapsed ? ${nt} : ${at})));
}`,rr=`function TabsPill(props) {
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
}`,nr=`function TabsDropdown(props) {
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
        React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: isOff ? ${je} : Object.assign(${Oe}, { width: '100%' }), title: isOff ? ('Show tabs' + (activeLabel ? ' (currently: ' + activeLabel + ')' : '')) : 'Hide tabs', 'aria-label': isOff ? ('Show tabs' + (activeLabel ? ' — ' + activeLabel : '')) : 'Hide tabs', 'aria-expanded': open, onClick: toggle }, isOff ? ${Qt} : ${er}))));
}`,ar=`function FormActions(props) {
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
        React.createElement('button', { key: 't', type: 'button', className: 'ks-tab ks-pill-toggle', style: collapsed ? ${je} : ${Oe}, title: collapsed ? 'Show form actions' : 'Hide form actions', 'aria-label': collapsed ? 'Show form actions' : 'Hide form actions', 'aria-expanded': !collapsed, onClick: handleToggle }, collapsed ? ${nt} : ${at}))));
}`,or=`function StatCard(props) {
  props = props || {};
  var tones = { good: 'var(--ks-accent-success, #4ade80)', warn: 'var(--ks-accent-warning, #fbbf24)', bad: 'var(--ks-accent-danger, #ef4444)' };
  var valueColor = tones[props.tone] || 'var(--ks-heading)';
  return React.createElement('div', { className: 'ks-card ks-stat-card', role: 'group', 'aria-label': props.label != null ? String(props.label) : 'Statistic' },
    props.label != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ks-muted, #9ca3af)' } }, String(props.label)) : null,
    React.createElement('p', { style: { margin: 0, fontSize: '1.5rem', fontWeight: 600, color: valueColor } },
      props.value != null ? String(props.value) : '',
      props.unit != null ? React.createElement('span', { className: 'ks-muted', style: { fontSize: '.85rem', marginLeft: '4px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.unit)) : null));
}`,sr=`function Badge(props) {
  props = props || {};
  var tone = props.tone === 'ok' || props.tone === 'warn' || props.tone === 'bad' ? ' ks-' + props.tone : '';
  var kids = props.text != null ? String(props.text) : (props.children !== undefined ? props.children : '');
  return React.createElement('span', { className: 'ks-badge' + tone, title: props.title }, kids);
}`,ir=`function PageHeader(props) {
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
}`,lr=`function EmptyState(props) {
  props = props || {};
  function handleAction(e) { if (typeof props.onAction === 'function') props.onAction(e); }
  return React.createElement('div', { className: 'ks-card', role: 'status', style: { textAlign: 'center', padding: '2rem 1rem' } },
    React.createElement('h3', { style: { margin: '0 0 .5rem', fontSize: '.95rem', color: 'var(--ks-heading)' } }, props.title != null ? String(props.title) : 'Nothing here yet'),
    props.hint != null ? React.createElement('p', { className: 'ks-muted', style: { margin: '0 0 1rem', fontSize: '13px', color: 'var(--ks-muted, #9ca3af)' } }, String(props.hint)) : null,
    props.actionLabel != null ? React.createElement('button', { type: 'button', className: 'ks-btn ks-btn-blue', onClick: handleAction }, String(props.actionLabel)) : null);
}`,me=[{name:"page_action_pill",ksuiKey:"ActionPill",label:"Action pill (React)",description:'Live React clone of PageActionsPill (ks-pill-content, slide/fade/scale/none collapse, slim 4px chevron toggle, aria-expanded/hidden). CONTROLLED — pass `collapsed` + `onToggleCollapse`; buttons call YOUR callbacks. Auto-hide recipe: const [off, setOff] = React.useState(false); React.useEffect(() => { const on = () => { setOff(true); const t = setTimeout(() => setOff(false), 2500); return () => clearTimeout(t); }; document.addEventListener("scroll", on, true); return () => document.removeEventListener("scroll", on, true); }, []); then <KSUI.ActionPill collapsed={off} onToggleCollapse={setOff} .../>.',props:'refreshLabel?: string (default "Refresh"); primaryLabel?: string (default "Run"); onRefresh?(e): void; onPrimary?(e): void; actions?: Array<{label, primary?, title?, onClick?}>; collapsed?: boolean; onToggleCollapse?(next: boolean, e): void; animation?: "slide" | "fade" | "scale" | "none" (default "slide"); ariaLabel?: string.',source:tr},{name:"page_tabs_pill",ksuiKey:"TabsPill",label:"Tabs pill (React)",description:"Inline tab strip (desktop ks-tabs pattern with tablist semantics and truthful aria-selected). CONTROLLED — pass `active` + `onSelect`. For the phone dropdown pill use page_tabs_dropdown instead.",props:'tabs?: Array<string | {id, label}> (default ["Overview","Details","Settings"]); active?: string (tab id, defaults to first); onSelect?(id: string, e): void; ariaLabel?: string.',source:rr},{name:"page_tabs_dropdown",ksuiKey:"TabsDropdown",label:"Tabs dropdown (React)",description:"Live React clone of PageTabsPill (fixed bottom dropdown, starts closed, ^/v toggle, select/Escape closes, rise+fade menu, 50vh scroll). Uncontrolled by default (internal open state); pass `open` + `onToggle` to control it. Never auto-opens — exactly like the panel.",props:'tabs?: Array<string | {id, label}>; active?: string; onSelect?(id: string, e): void; open?: boolean; defaultOpen?: boolean (default false); onToggle?(open: boolean): void; animation?: "slide" | "fade" | "scale" | "none"; ariaLabel?: string.',source:nr},{name:"page_form_actions",ksuiKey:"FormActions",label:"Form actions (React)",description:"Live React clone of PageFormActionsPill (bottom-right Save/Cancel bar, wrap-friendly, same slide+fade toggle). CONTROLLED — pass `collapsed` + `onToggleCollapse`; render your buttons as children.",props:'children?: React.ReactNode (your Cancel/Save buttons); collapsed?: boolean; onToggleCollapse?(next: boolean, e): void; animation?: "slide" | "fade" | "scale" | "none"; ariaLabel?: string.',source:ar},{name:"page_stat_card",ksuiKey:"StatCard",label:"Stat card (React)",description:"Live React clone of the panel stat card (same ks-card ks-stat-card classes + label/value/unit styles). Adds an optional `tone` (good/warn/bad tinting the value via --ks-accent-* tokens with the same fallbacks CustomPageView uses); omit it for the pixel-identical default.",props:'label?: string; value?: string | number; unit?: string; tone?: "default" | "good" | "warn" | "bad".',source:or},{name:"page_badge",ksuiKey:"Badge",label:"Badge (React)",description:"Live React clone of the panel badge (same ks-badge + ks-ok/ks-warn/ks-bad classes). Renders ONE badge (text + tone props); paint comes from the host theme, no inline duplicates.",props:'text?: string; children?: React.ReactNode (used when text omitted); tone?: "default" | "ok" | "warn" | "bad"; title?: string.',source:sr},{name:"page_page_header",ksuiKey:"PageHeader",label:"Page header (React)",description:"Live React clone of the panel page header (same ks-page-header / ks-page-header-actions / ks-btn-header ks-icon-btn classes + identical refresh SVG). Differs from panel_page_header on purpose: the refresh icon renders ONLY when `onRefresh` is wired (no dead buttons), and extra text `actions` may follow it. SVG attrs are the React camelCase equivalents of the original.",props:'title?: string (default "Title"); onRefresh?(e): void; actions?: Array<{label, title?, onClick?}>.',source:ir},{name:"page_empty_state",ksuiKey:"EmptyState",label:"Empty state (React)",description:'Centered empty-state card composed from panel primitives (ks-card / ks-muted / ks-btn ks-btn-blue, role=status). No single panel_* original — it mirrors the host empty patterns (e.g. "no content yet" blocks). The action button renders only when `actionLabel` is set and calls `onAction`.',props:'title?: string (default "Nothing here yet"); hint?: string; actionLabel?: string; onAction?(e): void.',source:lr}];new Map(me.map(t=>[t.name,t]));new Map(me.map(t=>[t.name,t.ksuiKey]));function cr(t){const o=me.map(r=>r.source).join(`
`),e=me.map(r=>`O[${JSON.stringify(r.ksuiKey)}]=${r.ksuiKey};`).join("");return`(function(React){var O={};
${o}
${e}return O;})(${t})`}function dr(t){let o=5381;for(let e=0;e<t.length;e++)o=(o<<5)+o+t.charCodeAt(e)|0;return(o>>>0).toString(36)}class pr extends Ee.Component{constructor(o){super(o),this.state={error:null}}static getDerivedStateFromError(o){return{error:o instanceof Error?o.message:String(o)}}componentDidUpdate(o){o.resetKey!==this.props.resetKey&&this.state.error&&this.setState({error:null})}render(){return this.state.error?R.jsxs("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:[R.jsx("p",{className:"text-sm",children:"This React page threw an error."}),R.jsx("p",{className:"text-xs text-gray-500 mt-1 font-mono break-words",children:this.state.error.slice(0,300)}),R.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Fix the source in the Instance Page Studio and rebuild."})]}):this.props.children}}const _e=new Map;let ur=0;function fr(){const t=window;let o=t.__ksReactSlots;return o||(o={},t.__ksReactSlots=o),o}const br=cr("slot.react"),mr=({bundle:t,bundleCss:o,sdk:e,sdkKey:r,resetKey:s,modules:a})=>{const[n,l]=F.useState(null),[p,c]=F.useState(null),b=F.useMemo(()=>{try{return{code:Wt(t,a??{}).code,error:null}}catch(v){return{code:"",error:v instanceof Error?v.message:String(v)}}},[t,a]);F.useEffect(()=>{let v=!1;if(l(null),c(null),b.error){c(`This React page has a syntax error: ${b.error}`);return}const w=`r${++ur}_${Date.now().toString(36)}`,g=fr();let A=null;const T=()=>{window.removeEventListener("error",z),delete g[w],_e.delete(w),A&&A.parentNode&&A.parentNode.removeChild(A),A=null},z=m=>{m.filename||v||(c(m.message||"bundle failed to execute"),T())};_e.set(w,{sdk:e,react:Ee,done:m=>{if(!v){if(typeof m=="function")l(()=>m);else if(m&&typeof m=="object"&&m.$$typeof){const H=m;l(()=>()=>H)}else c("bundle must return a component (end the source with `return Page;`)");T()}},fail:m=>{v||(c(m),T())}}),g[w]=_e.get(w),window.addEventListener("error",z),A=document.createElement("script");const O=b.code;return A.textContent=`"use strict";(function(){
var slot=window.__ksReactSlots[${JSON.stringify(w)}];
try{var Page=(function(sdk,React,KSUI){
${O}
})(slot.sdk,slot.react,${br});slot.done(Page);}catch(e){slot.fail((e&&(e.message||e.stack))||String(e));}
})();`,document.head.appendChild(A),()=>{v=!0,T()}},[t,b.code,b.error,r]);const i=F.useMemo(()=>dr(t),[t]),d=F.useMemo(()=>Object.keys(a??{}).sort().join(","),[a]);return R.jsx(pr,{resetKey:`${s}:${t.length}:${i}:${d}`,children:R.jsxs("div",{className:"ks-react-page animate-fade-in",children:[o&&o.trim()!==""?R.jsx("style",{children:`/* react page css (scope selectors under .ks-react-page) */
${o}`}):null,p?R.jsxs("div",{className:"ks-card ks-form-card rounded-xl text-center text-gray-400",children:[R.jsx("p",{className:"text-sm",children:"This React page failed to load."}),R.jsx("p",{className:"text-xs text-gray-500 mt-1 font-mono break-words",children:p.slice(0,300)}),R.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Fix the source in the Instance Page Studio and rebuild."})]}):n?Ee.createElement(n):R.jsxs("div",{className:"glass-card rounded-xl flex items-center gap-4 animate-pulse",children:[R.jsx("div",{className:"w-9 h-9 rounded-lg bg-neutral-800 shrink-0"}),R.jsx("div",{className:"h-5 w-1/3 bg-neutral-800 rounded"})]})]})})},Ge={default:{color:"var(--ks-text-heading, var(--ks-heading, #fff))"},good:{color:"var(--ks-accent-success, #4ade80)"},warn:{color:"var(--ks-accent-warning, #fbbf24)"},bad:{color:"var(--ks-accent-danger, #ef4444)"}};function ue(t){const o=(t??"").trim();return o?/^(https?:|mailto:)/i.test(o)?o:/^[a-z][a-z0-9+.-]*:/i.test(o)?"#":o:"#"}function ot(t){const o=(t??"").trim();return/^data:image\//i.test(o)?o:ue(o)}const Se=/\{\{\s*component:([A-Za-z0-9_][A-Za-z0-9_-]*)\s*\}\}/g,kr=/\{\{\s*config:([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;function gr(t){const o={};for(const e of t??[])!e||e.type!=="module"||typeof e.name!="string"||!e.name||Object.prototype.hasOwnProperty.call(o,e.name)||(o[e.name]=typeof e.content=="string"?e.content:"");return o}function hr(t,o){if(!t||t.indexOf("{{component:")===-1)return t;const e=new Map((o||[]).filter(s=>s&&s.type!=="module").map(s=>[s.name,s]));let r=t;for(let s=0;s<5;s++){let a=!1;if(r=r.replace(Se,(l,p)=>{const c=e.get(p);if(c)return a=!0,xr(c);const b=Ae(p);return b?(a=!0,b):l}),!a)break;Se.lastIndex=0}return Se.lastIndex=0,r}function vr(t,o){const e={};if(t)for(const r of t)r.name&&(e[r.name]=r.default??"");if(o)for(const[r,s]of Object.entries(o))e[r]=String(s??"");return e}function Ve(t,o,e){if(!t)return t;const r=vr(o,e);return Object.keys(r).length===0?t:t.replace(kr,(s,a)=>Object.prototype.hasOwnProperty.call(r,a)?String(r[a]??""):s)}function Ne(t,o,e,r){let s=t;return s&&s.indexOf("{{component:")!==-1&&(s=hr(s,o??[])),(e||r)&&(s=Ve(s,e,r)),(e||r)&&(s=Ve(s,e,r)),s}function xr(t){if(t.editable===!1){const o=(t.shared||t.name||"").trim(),e=Ae(o);return e||t.type==="shared"?e:e||""}if(t.type==="shared"&&t.editable!==!1&&typeof t.content=="string"&&t.content.trim()!=="")return t.content;switch(t.type){case"html":return t.content;case"markdown":return yr(t.content);case"block":return wr(t.content);case"shared":{const o=(t.shared||t.name||"").trim();return Ae(o)}case"module":return"";default:return t.content}}function se(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function le(t){const o=[],e=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;let r=0,s;for(;(s=e.exec(t))!==null;)o.push(se(t.slice(r,s.index))),s[2]!==void 0?o.push(`<strong>${se(s[2])}</strong>`):s[3]!==void 0?o.push(`<em>${se(s[3])}</em>`):s[4]!==void 0?o.push(`<code>${se(s[4])}</code>`):o.push(`<a href="${se(ue(s[6]))}" target="_blank" rel="noreferrer">${se(s[5])}</a>`),r=s.index+s[0].length;return o.push(se(t.slice(r))),o.join("")}function yr(t){return t.trim()?t.split(`
`).map(o=>{const e=o.trim();return/^###\s/.test(e)?`<h3>${le(e.replace(/^###\s/,""))}</h3>`:/^##\s/.test(e)?`<h2>${le(e.replace(/^##\s/,""))}</h2>`:/^#\s/.test(e)?`<h1>${le(e.replace(/^#\s/,""))}</h1>`:/^[-*]\s/.test(e)?`<li>${le(e.replace(/^[-*]\s/,""))}</li>`:/^\d+\.\s/.test(e)?`<li>${le(e.replace(/^\d+\.\s/,""))}</li>`:e===""?"":`<p>${le(e)}</p>`}).join(`
`).replace(/(<li>.*<\/li>)/g,"<ul>$1</ul>").replace(/(<ul>.*<\/ul>)/g,"$1"):""}function wr(t){let o=[];try{const e=JSON.parse(t);Array.isArray(e)&&(o=e)}catch{return""}return o.length===0?"":o.map(e=>{switch(e.type){case"heading":{const r=e.level??2;return`<h${r}>${e.value}</h${r}>`}case"text":return`<p>${e.value}</p>`;case"image":{const r=ot(e.value);return r!=="#"?`<img src="${r}" alt="" />`:""}case"button":return e.href?`<a href="${ue(e.href)}" target="_blank" rel="noreferrer">${e.value}</a>`:`<span>${e.value}</span>`;case"code":return`<pre><code>${e.value}</code></pre>`;case"spacer":return'<div style="height: 1.5rem"></div>';case"divider":return"<hr />";case"stat":{const r=e.value;return`<div class="stat">${e.label?`<div class="stat-label">${e.label}</div>`:""}<div class="stat-value">${r}${e.unit||""}</div></div>`}case"table":{let r=[];try{const n=JSON.parse(e.value);Array.isArray(n)&&(r=n.map(l=>Array.isArray(l)?l.map(p=>String(p??"")):[]))}catch{}if(r.length===0)return"<p>[empty table]</p>";const[s,...a]=r;return`<table><thead><tr>${s.map(n=>`<th>${n}</th>`).join("")}</tr></thead><tbody>${a.map(n=>`<tr>${s.map((l,p)=>`<td>${n[p]||""}</td>`).join("")}</tr>`).join("")}</tbody></table>`}case"list":{let r=[];try{const s=JSON.parse(e.value);Array.isArray(s)&&(r=s.map(a=>String(a??"")))}catch{r=e.value.split(`
`).filter(Boolean)}return`<ul>${r.map(s=>`<li>${s}</li>`).join("")}</ul>`}case"html":return e.value;case"action":return`<button class="action-btn" disabled>${e.label||e.value||"Run"}</button>`;default:return""}}).join(`
`)}function $r(t,o,e,r){let s=[];try{const p=JSON.parse(t);Array.isArray(p)&&(s=p)}catch{}if(s.length===0)return R.jsx("p",{className:"text-sm",style:{color:"var(--ks-text-body, var(--ks-muted, #9ca3af))"},children:"This page has no content yet."});const a=p=>Ne(p,o??[],e,r),n=p=>p==="center"?"text-center":p==="right"?"text-right":"",l=async(p,c)=>{if(!p)return;const b=window.KSPageSDK,i=(d,v="error")=>{var w;try{(w=b==null?void 0:b.toast)==null||w.call(b,d,v)}catch{}};if(!(b!=null&&b.runAction)){i("Actions are unavailable on this page view.");return}if(!(c&&!await Re({title:"Please confirm",message:c})))try{const d=await b.runAction(p);d&&d.ok===!1&&(d.error||d.stderr)?i(String(d.error||d.stderr)):i(`${p} finished`,"info")}catch(d){i((d==null?void 0:d.message)||String(d))}};return R.jsx("div",{className:"space-y-4",children:s.map((p,c)=>{const b=n(p.align);switch(p.type){case"heading":{const i=p.level??2,d=`font-semibold ${b} ${i===1?"text-2xl":i===2?"text-xl":"text-lg"}`,v={color:"var(--ks-text-heading, var(--ks-heading, #fff))"};return i===1?R.jsx("h1",{className:d,style:v,children:a(p.value)},c):i===2?R.jsx("h2",{className:d,style:v,children:a(p.value)},c):R.jsx("h3",{className:d,style:v,children:a(p.value)},c)}case"text":return R.jsx("p",{className:`text-sm leading-relaxed whitespace-pre-wrap ${b}`,style:{color:"var(--ks-text-body, var(--ks-body, #d1d5db))"},children:a(p.value)},c);case"image":{const i=ot(a(p.value));return i!=="#"?R.jsx("img",{src:i,alt:"",className:`max-w-full rounded-lg ${b}`,style:{border:"1px solid var(--ks-card-border, rgba(255,255,255,0.10))"}},c):R.jsx("div",{className:"text-xs",style:{color:"var(--ks-text-body, #9ca3af)"},children:"[no image url]"},c)}case"button":return R.jsx("div",{className:`${b}`,children:R.jsx("a",{href:ue(a(p.href??"")),target:"_blank",rel:"noreferrer",className:"ks-primary-btn inline-flex items-center px-4 py-2 rounded text-sm font-medium transition",children:a(p.value)})},c);case"code":return R.jsx("pre",{className:"rounded-lg p-3 overflow-auto text-xs font-mono",style:{background:"var(--ks-card-bg, rgba(255,255,255,0.04))",border:"1px solid var(--ks-card-border, rgba(255,255,255,0.10))",color:"var(--ks-text-body, #e5e7eb)"},children:a(p.value)},c);case"spacer":return R.jsx("div",{className:"h-6"},c);case"divider":return R.jsx("hr",{style:{borderColor:"var(--ks-card-border, rgba(255,255,255,0.10))"}},c);case"stat":{const i=Ge[p.tone??"default"]??Ge.default;return R.jsxs("div",{className:`glass-card ks-stat-card rounded-xl p-4 ${b}`,children:[p.label&&R.jsx("p",{className:"text-xs uppercase tracking-wide mb-1",style:{color:"var(--ks-text-body, #9ca3af)"},children:a(p.label)}),R.jsxs("p",{className:"text-2xl font-semibold tabular-nums",style:i,children:[a(p.value),R.jsx("span",{className:"text-sm ml-1",style:{color:"var(--ks-text-body, #9ca3af)"},children:a(p.unit??"")})]})]},c)}case"table":{let i=[];try{const w=JSON.parse(p.value);Array.isArray(w)&&(i=w.map(g=>Array.isArray(g)?g.map(A=>String(A??"")):[]))}catch{}i=i.map(w=>w.map(g=>a(g)));const[d,...v]=i;return d?R.jsx("div",{className:"overflow-x-auto rounded-lg",style:{border:"1px solid var(--ks-card-border, rgba(255,255,255,0.10))"},children:R.jsxs("table",{className:"w-full text-xs",children:[R.jsx("thead",{children:R.jsx("tr",{style:{background:"var(--ks-card-bg, rgba(0,0,0,0.35))"},children:d.map((w,g)=>R.jsx("th",{className:"text-left px-3 py-2 font-semibold",style:{color:"var(--ks-text-body, #d1d5db)",borderBottom:"1px solid var(--ks-card-border, rgba(255,255,255,0.10))"},children:w},g))})}),R.jsxs("tbody",{children:[v.map((w,g)=>R.jsx("tr",{style:{borderTop:"1px solid var(--ks-card-border, rgba(255,255,255,0.06))"},children:d.map((A,T)=>R.jsx("td",{className:"px-3 py-1.5 font-mono break-all",style:{color:"var(--ks-text-body, #e5e7eb)"},children:w[T]??""},T))},g)),v.length===0&&R.jsx("tr",{children:R.jsx("td",{colSpan:d.length,className:"px-3 py-2 text-center",style:{color:"var(--ks-text-body, #9ca3af)"},children:"No rows"})})]})]})},c):R.jsx("div",{className:"text-xs",style:{color:"var(--ks-text-body, #9ca3af)"},children:"[table needs a JSON array of row arrays]"},c)}case"list":{let i=[];try{const d=JSON.parse(p.value);Array.isArray(d)&&(i=d.map(v=>String(v??"")))}catch{i=p.value.split(`
`).filter(Boolean)}return i=i.map(d=>a(d)),R.jsx("ul",{className:`list-disc pl-5 space-y-1 text-sm ${b}`,style:{color:"var(--ks-text-body, #d1d5db)"},children:i.length===0?R.jsx("li",{style:{color:"var(--ks-text-body, #6b7280)"},children:"[empty list]"}):i.map((d,v)=>R.jsx("li",{children:d},v))},c)}case"html":return p.value?R.jsx("div",{className:b,children:R.jsx(_r,{html:a(p.value)})},c):null;case"action":return R.jsxs("div",{className:`${b}`,children:[R.jsx("button",{type:"button",onClick:()=>l(p.action||p.value,p.confirmText),disabled:!p.action&&!p.value,className:"ks-primary-btn px-4 py-2 disabled:opacity-50 rounded text-sm font-medium transition",style:{background:"var(--ks-btn-bg, var(--ks-accent-primary, #0ea5e9))",color:"var(--ks-btn-text, #fff)",border:"none"},children:a(p.label||p.value||p.action||"Run")}),p.action&&p.label&&R.jsx("span",{className:"ml-2 text-[11px] font-mono",style:{color:"var(--ks-text-body, #6b7280)"},children:p.action})]},c);default:return null}})})}function _r({html:t}){const o=F.useRef(null),[e,r]=F.useState(160);F.useEffect(()=>{const a=n=>{var p;if(n.source!==((p=o.current)==null?void 0:p.contentWindow))return;const l=n.data;l&&l.type==="ks-block-resize"&&typeof l.height=="number"&&r(Math.min(Math.max(Math.ceil(l.height),40),2e4))};return window.addEventListener("message",a),()=>window.removeEventListener("message",a)},[]);const s=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:.25rem;color:var(--ks-body,#e5e7eb);background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;overflow-x:hidden}
img{max-width:100%}table{border-collapse:collapse;width:100%}
a{color:var(--ks-link,#7dd3fc)}
${Ar()}
</style></head><body>${t}<script>
(function(){var last=0,raf=false;function r(){raf=false;var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h!==last){last=h;try{window.parent.postMessage({type:'ks-block-resize',height:h},'*')}catch(e){}}}function s(){if(raf)return;raf=true;requestAnimationFrame(r)}if(window.ResizeObserver){var ro=new ResizeObserver(s);ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}if(window.MutationObserver){new MutationObserver(s).observe(document.documentElement,{subtree:true,childList:true,attributes:true});}window.addEventListener('load',r);window.addEventListener('resize',s)})();
<\/script></body></html>`;return R.jsx("iframe",{ref:o,srcDoc:s,style:{width:"100%",height:e,border:0,background:"transparent"},title:"HTML block",sandbox:"allow-scripts allow-forms allow-popups allow-modals"})}function Sr(t,o,e,r){const a=Ne(t,o??[],e,r).split(`
`),n=[];let l=[],p=null;const c=()=>{l.length!==0&&(p==="ul"?n.push(R.jsx("ul",{className:"list-disc pl-5 space-y-1 text-sm",style:{color:"var(--ks-text-body, var(--ks-body, #d1d5db))"},children:l},n.length)):p==="ol"&&n.push(R.jsx("ol",{className:"list-decimal pl-5 space-y-1 text-sm",style:{color:"var(--ks-text-body, var(--ks-body, #d1d5db))"},children:l},n.length)),l=[],p=null)},b=i=>{const d=[],v=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;let w=0,g,A=0;for(;(g=v.exec(i))!==null;)g.index>w&&d.push(i.slice(w,g.index)),g[2]!==void 0?d.push(R.jsx("strong",{className:"font-semibold",style:{color:"var(--ks-text-heading, var(--ks-heading, #fff))"},children:g[2]},A++)):g[3]!==void 0?d.push(R.jsx("em",{children:g[3]},A++)):g[4]!==void 0?d.push(R.jsx("code",{className:"font-mono text-xs px-1 rounded",style:{background:"var(--ks-card-bg, rgba(0,0,0,0.35))",border:"1px solid var(--ks-card-border, rgba(255,255,255,0.10))",color:"var(--ks-text-body, #e5e7eb)"},children:g[4]},A++)):g[5]!==void 0&&g[6]!==void 0&&d.push(R.jsx("a",{href:ue(g[6]),target:"_blank",rel:"noreferrer",className:"hover:underline",style:{color:"var(--ks-link, var(--ks-text-link, #7dd3fc))"},children:g[5]},A++)),w=g.index+g[0].length;return w<i.length&&d.push(i.slice(w)),d};for(const i of a){const d=i.trim();if(/^#{1,3}\s/.test(d)){c();const v=d.match(/^#+/)[0].length,w=d.replace(/^#+\s/,""),g=`font-semibold ${v===1?"text-2xl":"text-xl"}`;n.push(v===1?R.jsx("h1",{className:g,style:{color:"var(--ks-text-heading, var(--ks-heading, #fff))"},children:b(w)},n.length):R.jsx("h2",{className:g,style:{color:"var(--ks-text-heading, var(--ks-heading, #fff))"},children:b(w)},n.length))}else/^[-*]\s/.test(d)?(p&&p!=="ul"&&c(),p="ul",l.push(R.jsx("li",{children:b(d.replace(/^[-*]\s/,""))},l.length))):/^\d+\.\s/.test(d)?(p&&p!=="ol"&&c(),p="ol",l.push(R.jsx("li",{children:b(d.replace(/^\d+\.\s/,""))},l.length))):d===""?c():(c(),n.push(R.jsx("p",{className:"text-sm leading-relaxed",style:{color:"var(--ks-text-body, var(--ks-body, #d1d5db))"},children:b(d)},n.length)))}return c(),R.jsx("div",{className:"space-y-3",children:n})}const st=["executeAction","runAction","fetchPanel","shell","readFile","writeFile","listFiles","deleteFile","createDirectory","docker","kvm","lxd","toast","confirm","navigate","storage.get","storage.set","storage.delete","storage.clear","storage.keys","kv.get","kv.set","kv.delete","kv.keys","statPath","renamePath","copyPath","chmodPath","archivePaths","extractArchive","searchFiles","uploadFromUrl","uploadFile","downloadFile","listPorts","savePorts","listAutomation","listAutomationRuns","runAutomationJob","deleteAutomationJob","createAutomationJob","updateAutomationJob","downloadAutomation","importAutomationURL","listSecrets","setSecret","deleteSecret","revealSecret","saveEnv","power","reinstall","updateIdentity","getMetrics","listProcesses","killProcess","listAudit","getSftp","enableSftp","rotateSftp","disableSftp","revealSftp","sendActionStdin","sendInstallStdin"];function pe(t){return JSON.stringify(t??null).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")}function Er(t,o,e,r,s,a,n){const l=`
(function() {
  'use strict';
  var seq = 0;
  var pending = Object.create(null);

  function rpc(method, args) {
    return new Promise(function(resolve, reject) {
      var id = 'c' + (++seq) + '-' + Date.now();
      pending[id] = { resolve: resolve, reject: reject };
      // Shortened from 120s to 15s so starter pages that show a skeleton
      // while awaiting sdk.fetchPanel do not appear "stuck loading" for
      // two minutes when the edge is offline or the instance is stopped.
      // Individual pages still get a 3.5s iframe fallback that replaces
      // remaining skeletons with a clear error.
      var timer = setTimeout(function() {
        if (pending[id]) { delete pending[id]; reject(new Error('KSPageSDK timeout: ' + method)); }
      }, 15000);
      pending[id].timer = timer;
      try {
        window.parent.postMessage({ type: 'ks-sdk-call', id: id, method: method, args: args }, '*');
      } catch (e) {
        clearTimeout(timer); delete pending[id]; reject(e);
      }
    });
  }

  function settle(id, fn) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    clearTimeout(p.timer);
    fn(p);
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'ks-sdk-response') {
      settle(event.data.id, function(p) {
        if (event.data.error) p.reject(new Error(event.data.error));
        else p.resolve(event.data.result);
      });
    }
  });

  var sdk = { instance: ${o}, actions: ${e}, config: ${a||"{}"}, pageSlug: ${n||'""'} };
  try { window.KS_PAGE_CONFIG = sdk.config; } catch(e) {}
  ${JSON.stringify(st)}.forEach(function(m) {
    var parts = m.split('.');
    var target = sdk;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = function() {
      return rpc(m, Array.prototype.slice.call(arguments));
    };
  });

  // Polling subscription built on the bridged executeAction.
  sdk.subscribe = function(action, callback, intervalMs) {
    var iv = Math.max(1000, intervalMs || 5000);
    var stopped = false;
    (async function loop() {
      while (!stopped) {
        var result;
        try { result = await sdk.executeAction(action); }
        catch (e) { result = { ok: false, error: e && e.message ? e.message : String(e) }; }
        try { callback(result); } catch (e) { /* page bug, keep polling */ }
        await new Promise(function(r) { setTimeout(r, iv); });
      }
    })();
    return function() { stopped = true; };
  };

  // Events (page-local pub/sub).
  var listeners = Object.create(null);
  sdk.on = function(ev, cb) {
    (listeners[ev] = listeners[ev] || []).push(cb);
    return function() {
      var arr = listeners[ev] || [];
      var i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  };
  sdk.once = function(ev, cb) {
    var off = sdk.on(ev, function(d) { off(); cb(d); });
    return off;
  };
  sdk.emit = function(ev, data) {
    (listeners[ev] || []).slice().forEach(function(cb) {
      try { cb(data); } catch (e) { /* listener bug */ }
    });
    try { window.parent.postMessage({ type: 'ks-page-event', detail: { event: ev, data: data } }, '*'); } catch (e) {}
  };

  // WebSocket proxy: session cookies never leave the host origin, so the
  // sandboxed page asks the parent to open one of its own instance's three
  // bridges (/terminal, /workflow, /startup) and relays frames. Exposes a
  // minimal WebSocket-compatible surface.
  var wsSeq = 0;
  var sockets = Object.create(null);
  sdk.connectWS = function(protocols, endpoint, params) {
    var wsId = 'ws' + (++wsSeq);
    var reqId = 'r' + wsId;
    var handlers = { onopen: null, onmessage: null, onclose: null, onerror: null };
    var sock = {
      readyState: 0,
      send: function(data) {
        try { window.parent.postMessage({ type: 'ks-ws-send', wsId: wsId, data: String(data) }, '*'); } catch (e) {}
      },
      close: function() {
        try { window.parent.postMessage({ type: 'ks-ws-close', wsId: wsId }, '*'); } catch (e) {}
        sock.readyState = 3;
      },
    };
    Object.defineProperty(sock, 'onopen', { get: function() { return handlers.onopen; }, set: function(v) { handlers.onopen = v; } });
    Object.defineProperty(sock, 'onmessage', { get: function() { return handlers.onmessage; }, set: function(v) { handlers.onmessage = v; } });
    Object.defineProperty(sock, 'onclose', { get: function() { return handlers.onclose; }, set: function(v) { handlers.onclose = v; } });
    Object.defineProperty(sock, 'onerror', { get: function() { return handlers.onerror; }, set: function(v) { handlers.onerror = v; } });
    sockets[wsId] = sock;

    function onEvent(event) {
      return function(e) {
        try {
          if (event === 'message') handlers.onmessage && handlers.onmessage({ data: e.data });
          else handlers[event] && handlers[event](e);
        } catch (err) { /* handler bug */ }
      };
    }
    messageHandlers[wsId] = { open: onEvent('open'), message: onEvent('message'), close: onEvent('close'), error: onEvent('error') };

    window.parent.postMessage({ type: 'ks-ws-open', reqId: reqId, wsId: wsId, protocols: protocols || null, endpoint: endpoint || 'terminal', params: params || {} }, '*');
    return sock;
  };

  // Route parent -> iframe WS events to the matching socket shim.
  var messageHandlers = Object.create(null);
  window.addEventListener('message', function(event) {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'ks-ws-opened') {
      var sockOpen = sockets[String(event.data.wsId)];
      if (!sockOpen) return;
      if (event.data.error) {
        // A real WebSocket always fires close after a failed handshake; do
        // the same here or pages that reconnect on close would stall.
        sockOpen.readyState = 3;
        var hsOpen = messageHandlers[String(event.data.wsId)];
        if (hsOpen) { hsOpen.error({}); hsOpen.close({}); }
        delete sockets[String(event.data.wsId)];
        delete messageHandlers[String(event.data.wsId)];
      }
      return;
    }
    if (event.data.type === 'ks-ws-event') {
      var sockEv = sockets[String(event.data.wsId)];
      var h = messageHandlers[String(event.data.wsId)];
      if (!sockEv || !h) return;
      if (event.data.event === 'open') { sockEv.readyState = 1; h.open({}); }
      else if (event.data.event === 'message') h.message({ data: String(event.data.data == null ? '' : event.data.data) });
      else if (event.data.event === 'error') h.error({});
      else if (event.data.event === 'close') { sockEv.readyState = 3; h.close({}); delete sockets[String(event.data.wsId)]; delete messageHandlers[String(event.data.wsId)]; }
    }
  });

  // Auto-resize: report document height so the parent frame grows with content.
  var lastH = 0;
  function reportHeight() {
    var h = Math.max(320, Math.ceil(document.documentElement.getBoundingClientRect().height));
    if (h !== lastH) {
      lastH = h;
      try { window.parent.postMessage({ type: 'ks-iframe-resize', height: h }, '*'); } catch (e) {}
    }
  }
  // Height changes are observed (ResizeObserver + DOM mutations, coalesced
  // to one measure per frame) instead of a 400ms interval: no constant
  // layout reads, no periodic postMessage churn on phones.
  var rafPending = false;
  function scheduleHeight() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; reportHeight(); });
  }
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(scheduleHeight);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
  if (window.MutationObserver) {
    new MutationObserver(scheduleHeight).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  }
  window.addEventListener('resize', scheduleHeight);
  window.addEventListener('load', reportHeight);

  window.KSPageSDK = sdk;
  // KS_PAGE_QUERY carries the PARENT route's query string (the iframe itself
  // is srcdoc on an opaque origin and cannot see it). Sub-pages read it to
  // pick up parameters — e.g. /files/edit?path=/etc/app.conf preloads the
  // editor with that path.
  window.KS_PAGE_QUERY = ${pe(r)};
  window.dispatchEvent(new CustomEvent('ks-page-sdk-ready', { detail: sdk }));
  try { window.parent.postMessage({ type: 'ks-sdk-ready' }, '*'); } catch (e) {}
})();`;return`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { box-sizing: border-box; }
/* Theme tokens — stock defaults mirroring the pre-theme look. The themed
   override block appended below re-emits every token from the ACTIVE panel
   theme (customPageThemeCss), so pages referencing var(--ks-*) follow the
   admin's theme exactly like the host UI does. */
:root {
  --ks-font-family: -apple-system, BlinkMacSystemFont,'Segoe UI', Roboto, sans-serif;
  --ks-heading: #ffffff;
  --ks-body: #e5e7eb;
  --ks-secondary: #d1d5db;
  --ks-muted: #9ca3af;
  --ks-faint: #6b7280;
  --ks-link: #7dd3fc;
  --ks-ok: #34d399;
  --ks-ok-soft: rgba(52,211,153,0.75);
  --ks-ok-wash: rgba(6,78,59,0.2);
  --ks-ok-line: rgba(6,78,59,0.4);
  --ks-warn: #fcd34d;
  --ks-warn-soft: rgba(252,211,77,0.75);
  --ks-warn-wash: rgba(120,53,15,0.3);
  --ks-warn-line: rgba(180,83,9,0.4);
  --ks-bad: #fca5a5;
  --ks-bad-soft: rgba(252,165,165,0.75);
  --ks-bad-wash: rgba(127,29,29,0.3);
  --ks-bad-line: rgba(185,28,28,0.5);
  --ks-info: #38bdf8;
  --ks-info-wash: rgba(2,132,199,0.3);
  --ks-info-line: rgba(7,89,133,0.45);
  /* Decorative hues without a panel token — stable across themes. */
  --ks-purple: #c4b5fd;
  --ks-pink: #f0abfc;
  --ks-cyan: #22d3ee;
  --ks-card-bg: rgba(255,255,255,0.04);
  --ks-card-border: rgba(255,255,255,0.10);
  --ks-input-bg: rgba(0,0,0,0.4);
  --ks-input-border: rgba(255,255,255,0.15);
}
body { font-family: var(--ks-font-family); margin: 0; padding: 1rem; color: var(--ks-body); background: transparent; line-height: 1.6; overflow-x: hidden; }
h1,h2,h3 { color: var(--ks-heading); margin: 1rem 0 0.5rem; }
code { background: rgba(0,0,0,0.35); padding: 0.1rem 0.3rem; border-radius: 3px; }
pre { background: rgba(0,0,0,0.35); padding: 1rem; border-radius: 6px; overflow-x: auto; }
a { color: var(--ks-link); }
a:hover { color: var(--ks-info); }
button, .btn { cursor: pointer; }
input, textarea, select { background: var(--ks-input-bg); border: 1px solid var(--ks-input-border); color: var(--ks-body); padding: 0.5rem; border-radius: 0.375rem; font-family: inherit; max-width: 100%; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ks-info); }
label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; color: var(--ks-muted); text-transform: uppercase; letter-spacing: 0.05em; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--ks-card-border); font-size: 0.8125rem; }
th { color: var(--ks-muted); text-transform: uppercase; font-size: 0.6875rem; letter-spacing: 0.05em; }
img { max-width: 100%; }
.ks-btn { display: inline-block; background: #fff; color: #000; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; font-size: 0.875rem; }
.ks-btn:hover { background: #e5e7eb; }
.ks-btn-blue { background: #0284c7; color: #fff; }
.ks-btn-blue:hover { background: #0ea5e9; }
.ks-btn-red { background: #b91c1c; color: #fff; }
.ks-btn-red:hover { background: #dc2626; }
.ks-btn-green { background: #059669; color: #fff; }
.ks-btn-green:hover { background: #10b981; }
.ks-card { background: var(--ks-card-bg); border: 1px solid var(--ks-card-border); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; }
.ks-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.ks-muted { color: var(--ks-muted); }
.ks-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ks-ok { color: var(--ks-ok); }
.ks-bad { color: var(--ks-bad); }
.ks-warn { color: var(--ks-warn); }
.ks-badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.6875rem; border: 1px solid var(--ks-input-border); background: var(--ks-input-bg); }
.ks-bar { position: relative; background: var(--ks-input-bg); border-radius: 9999px; height: 8px; overflow: hidden; min-width: 80px; }
.ks-bar > span { position: absolute; inset: 0 auto 0 0; background: var(--ks-info); border-radius: 9999px; }
 ${s||""}
</style>
<script>

(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function cardUnit(key,title,innerHtml){return '<div class="ks-card" data-ks-key="'+esc(key)+'"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">'+esc(title)+'</h3>'+innerHtml+'</div>';}
  var ksOrigDesc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  var ksOrigGet=ksOrigDesc&&ksOrigDesc.get?ksOrigDesc.get:function(){return this.__ksHtml||'';};
  var ksOrigSet=ksOrigDesc&&ksOrigDesc.set?ksOrigDesc.set:function(v){this.__ksHtml=String(v);};
  var ksPatchGuard={};
  function ksRawGet(n){try{return ksOrigGet.call(n);}catch(e){return n.innerHTML;}}
  function ksRawSet(n,v){try{ksOrigSet.call(n,String(v));}catch(e){try{n.innerHTML=String(v);}catch(e2){}}}
  function ksPatch(targetId, newHtml){
    if(ksPatchGuard[targetId]) return;
    ksPatchGuard[targetId]=true;
    try{
    var root=document.getElementById(targetId);
    if(!root) return;
    var tmp=document.createElement('div'); tmp.innerHTML=newHtml;
    var newKeys=tmp.querySelectorAll('[data-ks-key]');
    var oldNodes=root.querySelectorAll('[data-ks-key]');
    var oldMap={}; for(var oi=0;oi<oldNodes.length;oi++){ var on=oldNodes[oi]; oldMap[on.getAttribute('data-ks-key')]=on; }
    var hasKeyed=newKeys.length>0;
    if(hasKeyed){
      function findParentInRoot(node, tmpRoot, realRoot){
        var path=[]; var cur=node.parentElement;
        while(cur && cur!==tmpRoot){ var p=cur.parentElement; if(!p) break; var idx=Array.prototype.indexOf.call(p.children, cur); path.unshift(idx); cur=p; }
        var target=realRoot; for(var pi=0; pi<path.length; pi++){ if(!target || target.children.length<=path[pi]) return realRoot; target=target.children[path[pi]]; } return target;
      }
      for(var i=0;i<newKeys.length;i++){ var n=newKeys[i]; var key=n.getAttribute('data-ks-key'); var o=oldMap[key]; if(o && o.outerHTML!==n.outerHTML){ o.replaceWith(n.cloneNode(true)); } else if(!o){ try{ var pr=findParentInRoot(n, tmp, root); pr.appendChild(n.cloneNode(true)); }catch(e){} } if(o) delete oldMap[key]; }
      for(var k in oldMap){ try{ oldMap[k].remove(); }catch(e){} }
      if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
        for(var i=0;i<tmp.children.length;i++){ var nn=tmp.children[i]; var oo=root.children[i]; var nnHasKey=!!nn.querySelector('[data-ks-key]')||nn.hasAttribute('data-ks-key'); var ooHasKey=!!oo.querySelector('[data-ks-key]')||oo.hasAttribute('data-ks-key'); if(nnHasKey||ooHasKey) continue; if(oo.outerHTML!==nn.outerHTML){ oo.replaceWith(nn.cloneNode(true)); } }
      }
      if(oldNodes.length===0 && newKeys.length>0){
        if(ksRawGet(root)!==newHtml){ var st0=root.scrollTop, sl0=root.scrollLeft; ksRawSet(root,newHtml); try{root.scrollTop=st0; root.scrollLeft=sl0;}catch(e){} }
        return;
      }
      return;
    }
    if(root.children.length && tmp.children.length && root.children.length===tmp.children.length){
      var ch=0; for(var i=0;i<tmp.children.length;i++){ var nn2=tmp.children[i]; var oo2=root.children[i]; var nk=nn2.getAttribute('data-ks-key')||nn2.id||''; var ok=oo2.getAttribute('data-ks-key')||oo2.id||''; if(nk!==ok){ if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; } continue; } if(oo2.outerHTML!==nn2.outerHTML){ oo2.replaceWith(nn2.cloneNode(true)); ch++; } }
      if(ch===0 && ksRawGet(root)!==ksRawGet(tmp)){ if(ksRawGet(root)!==newHtml){ var st=root.scrollTop, sl=root.scrollLeft; ksRawSet(root,newHtml); try{root.scrollTop=st; root.scrollLeft=sl;}catch(e){} } }
      return;
    }
    if(ksRawGet(root)!==newHtml){ var st2=root.scrollTop, sl2=root.scrollLeft; ksRawSet(root,newHtml); try{root.scrollTop=st2; root.scrollLeft=sl2;}catch(e){} }
    }finally{ksPatchGuard[targetId]=false;}
  }
  function ksUnitPatch(unitId, innerHtml){ var n=document.getElementById(unitId); if(!n) return; if(ksRawGet(n)!==innerHtml) ksRawSet(n,innerHtml); }
  function ksRefreshUnit(unitId, fetcher, renderer){ return fetcher().then(function(data){ var html=renderer(data); ksUnitPatch(unitId, html); return data; }); }
  try{
    var _gid=document.getElementById.bind(document);
    function _patchNode(n){
      if(!n || n._ksPatched) return n;
      try{
        var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
        if(!desc || !desc.set) return n;
        var origGet=desc.get, origSet=desc.set;
        Object.defineProperty(n,'innerHTML',{ get:function(){ return origGet.call(this); }, set:function(v){ if(this.id){ ksPatch(this.id, String(v)); } else { origSet.call(this, String(v)); } }, configurable:true, enumerable:true });
        n._ksPatched=true;
      }catch(e){}
      return n;
    }
    var origGetEl=document.getElementById.bind(document);
    document.getElementById=function(id){ return _patchNode(origGetEl(id)); };
    window.ksPatch=ksPatch; window.ksUnitPatch=ksUnitPatch; window.ksRefreshUnit=ksRefreshUnit; window.cardUnit=cardUnit;
    window.el=function(id){ return _patchNode(_gid(id)); };
  }catch(e){}
})();

document.currentScript.remove();
<\/script>
<script>
${l}
document.currentScript.remove();
<\/script>
</head>
<body>
${t}
<script>
// Skeleton fallback: if a starter page's loader never replaced its
// placeholder (SDK never ready, fetch never returned), the iframe would
// show an infinite shimmer. After 3.5s replace remaining skeletons with a
// clear fallback so the page never appears "stuck loading" — this was the
// regression where many starter pages showed only skeletons after an AI
// added loading states.
setTimeout(function(){
  try{
    var r=document.getElementById('root');
    var c=document.getElementById('content');
    // Element query (not innerHTML substring): the theme <style> block in
    // body textually contains "ks-skeleton" (CSS rules), which made the old
    // substring check misfire on pages without #root/#content (terminal) and
    // append a bogus "still showing loading placeholders" card on every load.
    var hasSkeletonEl=function(scope){try{return !!(scope&&scope.querySelector&&scope.querySelector('.ks-skeleton,.ks-skeleton-bar,.ks-skeleton-avatar,.ks-skeleton-card,.ks-skeleton-table'));}catch(e){return false;}};
    if(r && hasSkeletonEl(r)){
      r.innerHTML='<div class="ks-card" style="border:1px solid var(--ks-bad-line, rgba(239,68,68,0.3))"><p style="color:var(--ks-bad,#fca5a5);font-size:13px;margin:0 0 6px;font-weight:600">Page did not load — fallback</p><p class="ks-muted" style="font-size:12px;margin:0">The page was still showing its loading skeleton after 3s. This usually means the SDK or data fetch failed. Try refreshing the instance page. If this persists, check that the instance is running and the edge is online.</p></div>';
    }
    if(c && hasSkeletonEl(c)){
      c.innerHTML='<p class="ks-bad" style="font-size:12px;padding:12px;background:var(--ks-bad-wash);border:1px solid var(--ks-bad-line);border-radius:6px">Failed to load content — please refresh or check instance status.</p>';
    }
    if(!r && !c && hasSkeletonEl(document)){
      var b=document.createElement('div');
      b.className='ks-card';
      b.style.cssText='margin:12px;border:1px solid var(--ks-bad-line)';
      b.innerHTML='<p style="color:var(--ks-bad);font-size:12px">Some sections are still showing loading placeholders. Refresh to retry.</p>';
      document.body.appendChild(b);
    }
  }catch(e){}
}, 3500);
<\/script>
</body>
</html>`}function $(t,o){const e=String(t??"").replace(/[{}<>\\;]/g,"").replace(/[\u0000-\u001f\u007f]/g,"").trim();return e?e.slice(0,256):o}function it(t,o){const e=t.forms,r=t.button,s=t.card,a=t.accent,n=t.typography,l=t.background,p=t.shape,c=t.tabs,b=t.dropdowns,i=t.components,d=t.cards,v=t.utilities,w=$(s.text_color,"#e5e7eb"),g=W(a.success,1,"#34d399"),A=W(a.warning,1,"#fcd34d"),T=W(a.danger,1,"#fca5a5"),z=W(a.info,1,"#38bdf8"),O=$(a.primary,"#38bdf8"),m=(B,G)=>{const ee=Number(B);return Number.isFinite(ee)?ee:G},H=(B,G,ee,ne)=>Math.max(ee,Math.min(ne,m(B,G))),I=B=>{const G=String(B??"").trim();return!G||!/^(https?:\/\/|data:(image|video)\/[a-z0-9.+-]+(;base64)?,|blob:|\/)/i.test(G)||G.length>(G.toLowerCase().startsWith("data:")?10*1024*1024:4096)?"":G.replace(/['\\]/g,"")};let q="none";if(s.bg_type==="image"&&s.bg_image){const B=I(s.bg_image);if(B){const ee="rgba(0,0,0,"+(1-H(s.bg_opacity,1,0,1))+")",ne="url('"+B+"')";q=ee+" linear-gradient("+ne+", "+ne+")"}}else if(s.bg_type==="gradient"&&s.bg_gradient){const B=$(s.bg_gradient,"");B&&(q=B)}const E=$(b==null?void 0:b.background,"rgba(12,14,18,0.22)"),_=$(b==null?void 0:b.border_color,"rgba(255,255,255,0.10)"),P=$(i==null?void 0:i.modal_overlay_color,"rgba(0,0,0,0.60)"),C=$(i==null?void 0:i.modal_background,"rgba(255,255,255,0.04)"),M=$(i==null?void 0:i.modal_border_color,"rgba(255,255,255,0.10)"),k=$(i==null?void 0:i.modal_shadow,"0 8px 32px rgba(0,0,0,0.45)"),y=m(i==null?void 0:i.modal_border_radius,5),j=m(i==null?void 0:i.modal_backdrop_blur,1),L=$((d==null?void 0:d.list_background)??s.background,"rgba(255,255,255,0.04)"),Z=$((d==null?void 0:d.list_border_color)??s.border_color,"rgba(255,255,255,0.10)"),V=$((d==null?void 0:d.list_hover_border_color)??s.hover_border,"rgba(255,255,255,0.20)"),J=$((d==null?void 0:d.list_shadow)??s.shadow,"0 8px 32px rgba(0,0,0,0.45)"),Q=$((d==null?void 0:d.stat_background)??s.background,"rgba(255,255,255,0.04)"),u=$((d==null?void 0:d.stat_border_color)??s.border_color,"rgba(255,255,255,0.10)"),f=$((d==null?void 0:d.form_background)??s.background,"rgba(255,255,255,0.04)"),h=$((d==null?void 0:d.form_border_color)??s.border_color,"rgba(255,255,255,0.10)"),x=t.pill,N=t.loading,S=lt.pill,U=(B,G,ee,ne)=>B===G?ee:$(B,ne),Y=((x==null?void 0:x.border_radius)??(S==null?void 0:S.border_radius))===(S==null?void 0:S.border_radius)?"var(--ks-card-radius)":`${m(x==null?void 0:x.border_radius,5)}px`,ie=((x==null?void 0:x.backdrop_blur)??(S==null?void 0:S.backdrop_blur))===(S==null?void 0:S.backdrop_blur)?"var(--ks-card-blur)":`${m(x==null?void 0:x.backdrop_blur,1)}px`;let D=`
    /* Theme tokens — re-emitted from the ACTIVE panel theme. These override
       the stock :root defaults above so pages consuming var(--ks-*) follow
       the admin's theme exactly like the host UI does. Complete set covers
       every theme section (card, button, forms, dropdown, tabs, modal,
       typography, accent, utilities) — fulfilling full theme parity. */
    :root {
      --ks-font-family: ${$(n.font_family,"-apple-system, BlinkMacSystemFont,'Segoe UI', Roboto, sans-serif")};
      --ks-heading: ${$(n.heading_color,"#ffffff")};
      --ks-body: ${w};
      --ks-secondary: ${W(w,.88,"#d1d5db")};
      --ks-muted: ${$(n.body_color,"#9ca3af")};
      --ks-faint: ${$(e.label_hint_color,"#6b7280")};
      --ks-link: ${$(n.link_color,"#60a5fa")};
      --ks-ok: ${g};
      --ks-ok-soft: ${W(g,.75,"rgba(52,211,153,0.75)")};
      --ks-ok-wash: ${W(g,.2,"rgba(6,78,59,0.2)")};
      --ks-ok-line: ${W(g,.4,"rgba(6,78,59,0.4)")};
      --ks-warn: ${A};
      --ks-warn-soft: ${W(A,.75,"rgba(252,211,77,0.75)")};
      --ks-warn-wash: ${W(A,.25,"rgba(120,53,15,0.3)")};
      --ks-warn-line: ${W(A,.4,"rgba(180,83,9,0.4)")};
      --ks-bad: ${T};
      --ks-bad-soft: ${W(T,.75,"rgba(252,165,165,0.75)")};
      --ks-bad-wash: ${W(T,.28,"rgba(127,29,29,0.3)")};
      --ks-bad-line: ${W(T,.5,"rgba(185,28,28,0.5)")};
      --ks-info: ${z};
      --ks-info-wash: ${W(z,.3,"rgba(2,132,199,0.3)")};
      --ks-info-line: ${W(z,.45,"rgba(7,89,133,0.45)")};
      --ks-purple: #c4b5fd;
      --ks-pink: #f0abfc;
      --ks-cyan: #22d3ee;
      --ks-bg-color: ${$(l==null?void 0:l.color,"#000000")};
      --ks-bg-gradient: ${(l==null?void 0:l.type)==="gradient"?$(l.gradient,"none"):"none"};
      --ks-card-bg: ${$(s.background,"rgba(255,255,255,0.04)")};
      --ks-card-bg-layer: ${q};
      --ks-card-bg-size: ${$(s.bg_size,"cover")};
      --ks-card-bg-position: ${$(s.bg_position,"center")};
      --ks-card-bg-repeat: ${$(s.bg_repeat,"no-repeat")};
      --ks-card-border: ${$(s.border_color,"rgba(255,255,255,0.10)")};
      --ks-card-border-width: ${m(s.border_width,1)}px;
      --ks-card-radius: ${m(s.border_radius,5)}px;
      --ks-card-padding: ${m(s.padding,15)}px;
      --ks-card-margin: ${m(s.margin,0)}px;
      --ks-card-blur: ${m(s.backdrop_blur,1)}px;
      --ks-card-shadow: ${$(s.shadow,"0 8px 32px rgba(0,0,0,0.45)")};
      --ks-card-hover-border: ${$(s.hover_border,"rgba(255,255,255,0.20)")};
      --ks-card-gap-h: ${m(s.gap_h??s.gap??16,16)}px;
      --ks-card-gap-v: ${m(s.gap_v??s.gap??16,16)}px;
      --ks-input-bg: ${$(e.input_background,"rgba(0,0,0,0.4)")};
      --ks-input-border: ${$(e.input_border_color,"rgba(255,255,255,0.15)")};
      --ks-input-text: ${$(e.input_text_color,"#ffffff")};
      --ks-input-placeholder: ${$(e.input_placeholder_color,"#6b7280")};
      --ks-input-focus-border: ${$(e.input_focus_border_color,"rgba(255,255,255,0.40)")};
      --ks-input-focus-ring: ${$(e.input_focus_ring_color,"rgba(255,255,255,0.60)")};
      --ks-input-radius: ${m(e.input_border_radius,6)}px;
      --ks-input-px: ${m(e.input_padding_x,12)}px;
      --ks-input-py: ${m(e.input_padding_y,8)}px;
      --ks-input-font: ${m(e.input_font_size,14)}px;
      --ks-select-bg: ${$(e.select_background,"rgba(0,0,0,0.30)")};
      --ks-select-text: ${$(e.select_text_color,"#ffffff")};
      --ks-select-border: ${$(e.select_border_color,"rgba(255,255,255,0.10)")};
      --ks-select-radius: ${m(e.select_border_radius,6)}px;
      --ks-textarea-bg: ${$(e.textarea_background,"rgba(0,0,0,0.30)")};
      --ks-textarea-text: ${$(e.textarea_text_color,"#ffffff")};
      --ks-textarea-border: ${$(e.textarea_border_color,"rgba(255,255,255,0.10)")};
      --ks-label-text: ${$(e.label_text_color,"#e5e7eb")};
      --ks-label-hint: ${$(e.label_hint_color,"#6b7280")};
      --ks-hint-text: ${$(e.hint_text_color,"#6b7280")};
      --ks-hint-error: ${$(e.hint_error_color,"#f87171")};
      --ks-hint-success: ${$(e.hint_success_color,"#34d399")};
      --ks-btn-bg: ${$(r.background,"#ffffff")};
      --ks-btn-text: ${$(r.text_color,"#000000")};
      --ks-btn-hover: ${$(r.hover_background,"#e5e7eb")};
      --ks-btn-border: ${$(r.border,"none")};
      --ks-btn-radius: ${m(r.border_radius,5)}px;
      --ks-btn-px: ${m(r.padding_x,19)}px;
      --ks-btn-py: ${m(r.padding_y,8)}px;
      --ks-btn-font: ${m(r.font_size,14)}px;
      --ks-btn-ghost-bg: ${$(r.ghost_background,"transparent")};
      --ks-btn-ghost-text: ${$(r.ghost_text_color,"#e5e7eb")};
      --ks-btn-ghost-hover: ${$(r.ghost_hover_background,"rgba(255,255,255,0.10)")};
      --ks-btn-ghost-border: ${$(r.ghost_border,"1px solid rgba(255,255,255,0.10)")};
      --ks-btn-ghost-radius: ${m(r.ghost_border_radius,5)}px;
      --ks-btn-icon-bg: ${$(r.icon_background,"rgba(255,255,255,0.10)")};
      --ks-btn-icon-text: ${$(r.icon_text_color,"#ffffff")};
      --ks-btn-icon-hover: ${$(r.icon_hover_background,"rgba(255,255,255,0.20)")};
      --ks-btn-icon-border: ${$(r.icon_border,"none")};
      --ks-btn-icon-radius: ${m(r.icon_border_radius,5)}px;
      --ks-btn-icon-size: ${m(r.icon_size,14)}px;
      --ks-tab-active-bg: ${$(c==null?void 0:c.active_background,"#ffffff")};
      --ks-tab-active-text: ${$(c==null?void 0:c.active_text_color,"#000000")};
      --ks-tab-inactive-bg: ${$(c==null?void 0:c.inactive_background,"transparent")};
      --ks-tab-inactive-text: ${$(c==null?void 0:c.inactive_text_color,"#d1d5db")};
      --ks-tab-hover-bg: ${$(c==null?void 0:c.hover_background,"rgba(255,255,255,0.05)")};
      --ks-tab-hover-text: ${$(c==null?void 0:c.hover_text_color,"#ffffff")};
      --ks-tab-border: ${$(c==null?void 0:c.border,"none")};
      --ks-tab-radius: ${m(c==null?void 0:c.border_radius,5)}px;
      --ks-tab-px: ${m(c==null?void 0:c.padding_x,12)}px;
      --ks-tab-py: ${m(c==null?void 0:c.padding_y,6)}px;
      --ks-tab-font: ${m(c==null?void 0:c.font_size,14)}px;
      --ks-dropdown-bg: ${E};
      --ks-dropdown-border: ${_};
      --ks-dropdown-border-width: ${m(b==null?void 0:b.border_width,1)}px;
      --ks-dropdown-radius: ${m(b==null?void 0:b.border_radius,5)}px;
      --ks-dropdown-shadow: ${$(b==null?void 0:b.shadow,"0 12px 40px rgba(0,0,0,0.55)")};
      --ks-dropdown-blur: ${m(b==null?void 0:b.backdrop_blur,25)}px;
      --ks-dropdown-item-text: ${$(b==null?void 0:b.item_text_color,"#e5e7eb")};
      --ks-dropdown-item-hover: ${$(b==null?void 0:b.item_hover_background,"rgba(255,255,255,0.08)")};
      --ks-modal-bg: ${C};
      --ks-modal-border: ${M};
      --ks-modal-shadow: ${k};
      --ks-modal-radius: ${y}px;
      --ks-modal-blur: ${j}px;
      --ks-modal-overlay: ${P};
      --ks-listcard-bg: ${L};
      --ks-listcard-border: ${Z};
      --ks-listcard-hover: ${V};
      --ks-listcard-shadow: ${J};
      --ks-statcard-bg: ${Q};
      --ks-statcard-border: ${u};
      --ks-statcard-icon: ${$(d==null?void 0:d.stat_icon_color,"#ffffff")};
      --ks-formcard-bg: ${f};
      --ks-formcard-border: ${h};
      --ks-term-bg: ${$(e.input_background,"rgba(0,0,0,0.50)")};
      --ks-term-text: ${$(e.input_text_color,"#d4d4d4")};
      --ks-term-border: ${$(s.border_color,"rgba(255,255,255,0.10)")};
      --ks-radius-sm: ${m(p==null?void 0:p.border_radius_sm,4)}px;
      --ks-radius-md: ${m(p==null?void 0:p.border_radius_md,6)}px;
      --ks-radius-lg: ${m(p==null?void 0:p.border_radius_lg,12)}px;
      --ks-z-dropdown: ${m(v==null?void 0:v.z_dropdown,50)};
      --ks-z-modal: ${m(v==null?void 0:v.z_modal,60)};
      --ks-z-tooltip: ${m(v==null?void 0:v.z_tooltip,70)};
      --ks-z-toast: ${m(v==null?void 0:v.z_toast,80)};
      /* Host ↔ iframe token parity — block/markdown React renderers use --ks-text-* names */
      --ks-text-heading: ${$(n.heading_color,"#ffffff")};
      --ks-text-body: ${$(n.body_color,"#9ca3af")};
      --ks-text-card: ${$(s.text_color,"#ffffff")};
      --ks-accent-primary: ${O};
      --ks-accent-success: ${g};
      --ks-accent-warning: ${A};
      --ks-accent-danger: ${T};
      --ks-accent-info: ${z};
      --ks-base-size: ${m(n.base_size,14)}px;
      /* Component parity tokens — Tabs geometry, Loading skeletons and the
         Pill tab surface consumed by the parity rules below (shared panel
         fragments + hand-written ks-* markup). Same names/defaults as the
         host theme stylesheet so instance pages follow those Studio tabs. */
      --ks-skeleton-base: ${$(N==null?void 0:N.skeleton_base_color,"rgba(255,255,255,0.06)")};
      --ks-skeleton-shimmer: ${$(N==null?void 0:N.skeleton_shimmer_color,"rgba(255,255,255,0.18)")};
      --ks-skeleton-radius: ${m(N==null?void 0:N.skeleton_radius,6)}px;
      --ks-pill-bg: ${U(x==null?void 0:x.background,S==null?void 0:S.background,"var(--ks-card-bg)","rgba(255,255,255,0.04)")};
      --ks-pill-border: ${U(x==null?void 0:x.border_color,S==null?void 0:S.border_color,"var(--ks-card-border)","rgba(255,255,255,0.10)")};
      --ks-pill-border-width: ${m((x==null?void 0:x.border_width)??(S==null?void 0:S.border_width),1)}px;
      --ks-pill-radius: ${Y};
      --ks-pill-padding: ${m((x==null?void 0:x.padding)??(S==null?void 0:S.padding),6)}px;
      --ks-pill-blur: ${ie};
      --ks-pill-shadow: ${U(x==null?void 0:x.shadow,S==null?void 0:S.shadow,"var(--ks-card-shadow)","0 8px 32px rgba(0,0,0,0.45)")};
      --ks-pill-text: ${$(x==null?void 0:x.text_color,"#e5e7eb")};
      --ks-pill-gap: ${m((x==null?void 0:x.gap)??(S==null?void 0:S.gap),4)}px;
      --ks-pill-tab-px: ${m((x==null?void 0:x.tab_padding_x)??(S==null?void 0:S.tab_padding_x),10)}px;
      --ks-pill-tab-py: ${m((x==null?void 0:x.tab_padding_y)??(S==null?void 0:S.tab_padding_y),5)}px;
      --ks-pill-tab-font: ${m((x==null?void 0:x.font_size)??(S==null?void 0:S.font_size),13)}px;
      --ks-pill-icon-size: ${m((x==null?void 0:x.icon_size)??(S==null?void 0:S.icon_size),16)}px;
    }
    html { font-size: var(--ks-base-size); }
    body { color: ${w}; font-family: ${$(n.font_family,"inherit")}; background-color: transparent; line-height: 1.6; }
    h1,h2,h3 { color: ${$(n.heading_color,"#fff")}; }
    h4,h5,h6 { color: ${$(n.heading_color,"#fff")}; }
    a { color: ${$(n.link_color,"#7dd3fc")}; }
    a:hover { color: ${z}; }
    code { background: var(--ks-input-bg, rgba(0,0,0,0.35)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); padding: 0.1rem 0.3rem; border-radius: var(--ks-radius-sm, 4px); }
    pre { background: var(--ks-input-bg, rgba(0,0,0,0.35)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); padding: 1rem; border-radius: var(--ks-radius-md, 6px); overflow-x: auto; }
    input, textarea, select { background: var(--ks-input-bg, rgba(0,0,0,0.4)); border: 1px solid var(--ks-input-border, rgba(255,255,255,0.15)); color: var(--ks-input-text, #e5e7eb); border-radius: var(--ks-input-radius, 6px); padding: var(--ks-input-py, 8px) var(--ks-input-px, 12px); font-size: var(--ks-input-font, 14px); }
    input::placeholder, textarea::placeholder { color: var(--ks-input-placeholder, #6b7280); opacity: 1; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ks-input-focus-border, #38bdf8); box-shadow: 0 0 0 2px var(--ks-input-focus-ring, rgba(255,255,255,0.6)); }
    label { color: var(--ks-label-hint, #9ca3af); font-size: 12px; }
    th { color: var(--ks-label-hint, #9ca3af); background: var(--ks-card-bg, rgba(0,0,0,0.35)); }
    th, td { border-bottom: 1px solid var(--ks-card-border, rgba(255,255,255,0.08)); }
    table { border-collapse: collapse; width: 100%; }
    hr { border: none; border-top: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); margin: 1rem 0; }
    .ks-btn { background: var(--ks-btn-bg, #fff); color: var(--ks-btn-text, #000); border: var(--ks-btn-border, none); border-radius: var(--ks-btn-radius, 6px); font-size: var(--ks-btn-font, 14px); padding: var(--ks-btn-py, 8px) var(--ks-btn-px, 19px); font-weight: 500; cursor: pointer; display: inline-block; transition: background .15s ease, filter .15s ease; }
    .ks-btn:hover { background: var(--ks-btn-hover, #e5e7eb); }
    .ks-btn:disabled { opacity: 0.55; cursor: default; }
    .ks-btn-blue { background: var(--ks-info, ${z}); color: #fff; }
    .ks-btn-blue:hover { background: var(--ks-info, ${z}); filter: brightness(1.15); }
    .ks-btn-red { background: var(--ks-accent-danger, ${W(a.danger,1,"#b91c1c")}); color: #fff; }
    .ks-btn-red:hover { background: var(--ks-accent-danger, ${W(a.danger,1,"#dc2626")}); filter: brightness(1.15); }
    .ks-btn-green { background: var(--ks-accent-success, ${W(a.success,1,"#059669")}); color: #0b0d10; }
    .ks-btn-green:hover { background: var(--ks-accent-success, ${W(a.success,1,"#10b981")}); filter: brightness(1.08); }
    .ks-btn-ghost { background: var(--ks-btn-ghost-bg, transparent); color: var(--ks-btn-ghost-text, #e5e7eb); border: var(--ks-btn-ghost-border, 1px solid rgba(255,255,255,0.10)); border-radius: var(--ks-btn-ghost-radius, 5px); }
    .ks-btn-ghost:hover { background: var(--ks-btn-ghost-hover, rgba(255,255,255,0.10)); }
    .ks-btn-icon, .ks-iconbtn, .ks-btn-header, .ks-icon-btn { background: var(--ks-btn-icon-bg, rgba(255,255,255,0.10)); color: var(--ks-btn-icon-text, #fff); border: var(--ks-btn-icon-border, none); border-radius: var(--ks-btn-icon-radius, 5px); }
    .ks-btn-icon:hover, .ks-iconbtn:hover, .ks-btn-header:hover, .ks-icon-btn:hover { background: var(--ks-btn-icon-hover, rgba(255,255,255,0.20)); }
    .ks-btn-header { display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;font-size:12px;font-weight:500;cursor:pointer;transition: background .15s ease; line-height:1; min-height:32px; min-width:32px; }
    .ks-btn-header svg, .ks-icon-btn svg { width:var(--ks-btn-icon-size, 14px);height:var(--ks-btn-icon-size, 14px); }
    .ks-btn-header.is-open { background: var(--ks-btn-icon-hover, rgba(255,255,255,0.20)) !important; }
    .ks-page-header { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:0.75rem; }
    .ks-page-header-actions { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
    .ks-card { background-color: var(--ks-card-bg, rgba(255,255,255,0.04)) !important; background-image: var(--ks-card-bg-layer, none) !important; background-size: var(--ks-card-bg-size, cover); background-position: var(--ks-card-bg-position, center); background-repeat: var(--ks-card-bg-repeat, no-repeat); border: var(--ks-card-border-width, 1px) solid var(--ks-card-border, rgba(255,255,255,0.10)) !important; border-radius: var(--ks-card-radius, 12px) !important; padding: var(--ks-card-padding, 16px) !important; box-shadow: var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.45)) !important; backdrop-filter: blur(var(--ks-card-blur, 1px)); -webkit-backdrop-filter: blur(var(--ks-card-blur, 1px)); }
    .ks-card:hover { border-color: var(--ks-card-hover-border, rgba(255,255,255,0.20)) !important; }
    .ks-list-card { background: var(--ks-listcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-listcard-border, var(--ks-card-border)) !important; box-shadow: var(--ks-listcard-shadow, var(--ks-card-shadow)) !important; }
    .ks-list-card:hover { border-color: var(--ks-listcard-hover, var(--ks-card-hover-border)) !important; }
    .ks-stat-card { background: var(--ks-statcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-statcard-border, var(--ks-card-border)) !important; }
    .ks-form-card { background: var(--ks-formcard-bg, var(--ks-card-bg)) !important; border-color: var(--ks-formcard-border, var(--ks-card-border)) !important; }
    .ks-muted { color: var(--ks-muted, #9ca3af) !important; }
    .ks-faint { color: var(--ks-faint, #6b7280) !important; }
    .ks-ok { color: var(--ks-ok, #34d399) !important; }
    .ks-bad { color: var(--ks-bad, #fca5a5) !important; }
    .ks-warn { color: var(--ks-warn, #fcd34d) !important; }
    .ks-info { color: var(--ks-info, #38bdf8) !important; }
    .ks-badge { display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-size:11px;border:1px solid var(--ks-card-border, rgba(255,255,255,0.15));background:var(--ks-input-bg, rgba(0,0,0,0.3));color:var(--ks-body, #d1d5db); }
    .ks-bar { position: relative; background: var(--ks-input-bg, rgba(0,0,0,0.4)); border-radius: 9999px; height: 8px; overflow: hidden; min-width: 80px; }
    .ks-bar > span { background: var(--ks-info, #38bdf8) !important; position: absolute; inset: 0 auto 0 0; border-radius: 9999px; }
    .ks-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .ks-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .ks-menu, .ks-dropdown { background: var(--ks-dropdown-bg, rgba(12,14,18,0.22)) !important; border: var(--ks-dropdown-border-width, 1px) solid var(--ks-dropdown-border, rgba(255,255,255,0.10)) !important; border-radius: var(--ks-dropdown-radius, 10px) !important; box-shadow: var(--ks-dropdown-shadow, 0 12px 40px rgba(0,0,0,0.55)) !important; backdrop-filter: blur(var(--ks-dropdown-blur, 25px)); -webkit-backdrop-filter: blur(var(--ks-dropdown-blur, 25px)); color: var(--ks-dropdown-item-text, #e5e7eb) !important; }
    .ks-menu button, .ks-dropdown button { color: var(--ks-dropdown-item-text, #e5e7eb); }
    .ks-menu button:hover, .ks-dropdown button:hover { background: var(--ks-dropdown-item-hover, rgba(255,255,255,0.08)) !important; }
    .ks-tab { background: var(--ks-tab-inactive-bg, transparent) !important; color: var(--ks-tab-inactive-text, #d1d5db) !important; border: var(--ks-tab-border, none) !important; border-radius: var(--ks-tab-radius, 5px) !important; }
    .ks-tab:hover { background: var(--ks-tab-hover-bg, rgba(255,255,255,0.05)) !important; color: var(--ks-tab-hover-text, #fff) !important; }
    .ks-tab-active { background: var(--ks-tab-active-bg, #fff) !important; color: var(--ks-tab-active-text, #000) !important; }
    .ks-modal-overlay, [data-overlay="1"], [data-close="1"] { background: var(--ks-modal-overlay, rgba(0,0,0,0.60)) !important; }
    .ks-modal-card, .ks-modal-panel { background: var(--ks-modal-bg, var(--ks-card-bg)) !important; border: 1px solid var(--ks-modal-border, var(--ks-card-border)) !important; box-shadow: var(--ks-modal-shadow, var(--ks-card-shadow)) !important; border-radius: var(--ks-modal-radius, 5px) !important; backdrop-filter: blur(var(--ks-modal-blur, 1px)); -webkit-backdrop-filter: blur(var(--ks-modal-blur, 1px)); }
    .ks-term-bg { background: var(--ks-term-bg, #1e1e1e) !important; color: var(--ks-term-text, #d4d4d4) !important; border-color: var(--ks-term-border) !important; }
    /* Scrollbar theming inside instance pages */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: var(--ks-card-border, rgba(255,255,255,0.15)); border-radius: 9999px; }
    ::-webkit-scrollbar-track { background: transparent; }
    /* Utility: make any inline hardcoded dark overlay respect theme via attribute override */
    div[style*="rgba(0,0,0,0.55)"] { background: var(--ks-modal-overlay, rgba(0,0,0,0.60)) !important; }
    /* Instance-page component parity — rules the starter-library preamble
       (pageStarters INSTANCE_THEME_SUPPORT_CSS) ships inline, promoted here
       so hand-written HTML pages and shared fragments (tabs strip, pill
       clusters, modal shells, skeletons) get the same themed paint without
       starter scaffolding. Values mirror the starter preamble + host theme
       rules 1:1. .ks-tab:hover / .ks-tab-active are intentionally NOT
       repeated — the themed overrides above own that paint. */
    @keyframes ks-overlay-in{from{opacity:0}to{opacity:1}}
    @keyframes ks-modal-in{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes ks-skeleton-p{0%,100%{opacity:1}50%{opacity:.45}}
    .ks-tabs{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
    .ks-tab{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var(--ks-tab-py, 8px) var(--ks-tab-px, 12px);border-radius:var(--ks-tab-radius, 6px);font-size:var(--ks-tab-font, 14px);font-weight:500;border:var(--ks-tab-border, none);cursor:pointer;transition:all .15s ease;background:var(--ks-tab-inactive-bg, transparent);color:var(--ks-tab-inactive-text, #d1d5db);font-family:inherit;line-height:1;white-space:nowrap}
    .ks-card.ks-pill-anim { transition-property: transform, opacity !important; transition-duration: 300ms !important; transition-timing-function: ease-out !important; }
    .ks-card.ks-pill-anim.ks-actions-pill, .ks-card.ks-pill-anim.ks-tabs-pill { background-color: var(--ks-pill-bg) !important; border-color: var(--ks-pill-border) !important; border-width: var(--ks-pill-border-width) !important; border-radius: var(--ks-pill-radius) !important; box-shadow: var(--ks-pill-shadow) !important; padding: var(--ks-pill-padding) !important; backdrop-filter: blur(var(--ks-pill-blur)) !important; -webkit-backdrop-filter: blur(var(--ks-pill-blur)) !important; }
    .ks-actions-pill .ks-tab, .ks-tabs-pill .ks-tab { --ks-tab-px: var(--ks-pill-tab-px); --ks-tab-py: var(--ks-pill-tab-py); --ks-tab-font: var(--ks-pill-tab-font); }
    .ks-actions-pill .ks-pill-toggle, .ks-tabs-pill .ks-pill-toggle { color: var(--ks-pill-text) !important; }
    .ks-actions-pill .ks-pill-toggle svg, .ks-tabs-pill .ks-pill-toggle svg { width: var(--ks-pill-icon-size) !important; height: var(--ks-pill-icon-size) !important; }
    .ks-card.ks-pill-anim.ks-actions-pill.ks-pill-collapsed, .ks-card.ks-pill-anim.ks-form-actions-pill.ks-pill-collapsed, .ks-card.ks-pill-anim.ks-tabs-pill.ks-pill-collapsed { padding-left: 4px !important; padding-right: 4px !important; }
    .ks-actions-pill.ks-pill-collapsed .ks-pill-toggle, .ks-form-actions-pill.ks-pill-collapsed .ks-pill-toggle, .ks-tabs-pill.ks-pill-collapsed .ks-pill-toggle { padding-left: 4px !important; padding-right: 4px !important; }
    .ks-actions-pill .ks-pill-toggle:hover, .ks-actions-pill .ks-pill-toggle:active, .ks-actions-pill .ks-pill-toggle:focus, .ks-actions-pill .ks-pill-toggle:focus-visible, .ks-form-actions-pill .ks-pill-toggle:hover, .ks-form-actions-pill .ks-pill-toggle:active, .ks-form-actions-pill .ks-pill-toggle:focus, .ks-form-actions-pill .ks-pill-toggle:focus-visible, .ks-tabs-pill .ks-pill-toggle:hover, .ks-tabs-pill .ks-pill-toggle:active, .ks-tabs-pill .ks-pill-toggle:focus, .ks-tabs-pill .ks-pill-toggle:focus-visible { background: var(--ks-tab-inactive-bg, transparent) !important; color: var(--ks-pill-text, #e5e7eb) !important; }
    .ks-card.ks-pill-anim.ks-actions-pill, .ks-card.ks-pill-anim.ks-form-actions-pill, .ks-card.ks-pill-anim.ks-tabs-pill { transition-property: transform, opacity, padding-left, padding-right !important; }
    .ks-actions-pill .ks-pill-toggle, .ks-form-actions-pill .ks-pill-toggle, .ks-tabs-pill .ks-pill-toggle { transition-property: background-color, color, padding-left, padding-right !important; transition-duration: 300ms !important; }
    .ks-card.ks-pill-anim.ks-pill-instant, .ks-card.ks-pill-anim.ks-pill-instant .ks-pill-toggle { transition: none !important; }
    .ks-actions-pill .ks-pill-content, .ks-tabs-pill .ks-pill-content, .ks-form-actions-pill .ks-pill-content { gap: var(--ks-pill-gap) !important; transition-property: max-width, max-height, opacity, transform !important; transition-duration: 300ms !important; transition-timing-function: ease-out !important; }
    .ks-ip-modal-overlay{position:fixed;inset:0;z-index:var(--ks-z-modal,60);display:flex;align-items:center;justify-content:center;background:var(--ks-modal-overlay, rgba(0,0,0,0.60));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;animation:ks-overlay-in .18s ease}
    .ks-ip-modal-panel{background:var(--ks-modal-bg, var(--ks-card-bg, rgba(255,255,255,0.07)));border:1px solid var(--ks-modal-border, var(--ks-card-border, rgba(255,255,255,0.10)));box-shadow:var(--ks-modal-shadow, var(--ks-card-shadow, 0 8px 32px rgba(0,0,0,0.6)));border-radius:var(--ks-modal-radius, 12px);backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%);-webkit-backdrop-filter:blur(var(--ks-modal-blur, 16px)) saturate(180%);width:100%;max-width:512px;max-height:90vh;max-height:90dvh;overflow-y:auto;animation:ks-modal-in .22s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column}
    .ks-ip-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.10);position:sticky;top:0;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:10;border-radius:var(--ks-modal-radius,12px) var(--ks-modal-radius,12px) 0 0}
    .ks-ip-modal-title{font-size:18px;font-weight:600;color:var(--ks-heading, #fff);margin:0;line-height:1.2}
    .ks-ip-modal-close{border:none;background:transparent;color:var(--ks-muted, #9ca3af);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:color .15s ease, background .15s ease}
    .ks-ip-modal-close:hover{color:var(--ks-heading, #fff);background:rgba(255,255,255,0.08)}
    .ks-ip-modal-body{padding:20px 24px;display:flex;flex-direction:column;gap:16px;flex:1}
    .ks-ip-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;background:rgba(255,255,255,0.02);border-radius:0 0 var(--ks-modal-radius,12px) var(--ks-modal-radius,12px)}
    .ks-skeleton{background:var(--ks-skeleton-base, rgba(255,255,255,0.06)) !important;border-radius:var(--ks-skeleton-radius,6px) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite}
    .ks-skeleton-bar{background:var(--ks-skeleton-shimmer, rgba(255,255,255,0.13)) !important;border-radius:var(--ks-skeleton-radius,6px) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite}
    .ks-skeleton-avatar{width:32px;height:32px;border-radius:9999px;background:var(--ks-skeleton-shimmer, rgba(255,255,255,0.13)) !important;animation:ks-skeleton-p 1.45s ease-in-out infinite;flex-shrink:0}
    .ks-skeleton-table th .ks-skeleton-bar,.ks-skeleton-table td .ks-skeleton-bar{height:10px}
    @media(max-width:640px){.ks-ip-modal-panel{width:96vw;margin:8px;max-height:92vh}}
    @media(prefers-reduced-motion:reduce){.ks-ip-modal-overlay,.ks-ip-modal-panel,.ks-skeleton,.ks-skeleton-bar,.ks-skeleton-avatar,.ks-skeleton-card{animation:none !important}}
    html[data-ks-reduced-motion='1'] .ks-ip-modal-overlay,html[data-ks-reduced-motion='1'] .ks-ip-modal-panel{animation:none !important}
    html[data-ks-reduced-motion='1'] .ks-skeleton,html[data-ks-reduced-motion='1'] .ks-skeleton-bar,html[data-ks-reduced-motion='1'] .ks-skeleton-avatar,html[data-ks-reduced-motion='1'] .ks-skeleton-card{animation:none !important}
    @media (max-width:640px){ .ks-hidden-sm{display:none!important} }`,K="";const X=t.customCSS;if(X&&(X.global&&String(X.global).trim()&&(K+=`
/* Custom CSS — global (instance page) */
${String(X.global)}
`),X.scopes&&typeof X.scopes=="object"))for(const[B,G]of Object.entries(X.scopes))!G||!String(G).trim()||(B==="area:instance"||B.startsWith("page:instance"))&&(o?(B==="area:instance"||B==="page:instance.panel.custom"||B.includes(o)||o.includes(B.replace("page:","")))&&(K+=`
/* Custom CSS — ${B} */
${String(G)}
`):K+=`
/* Custom CSS — ${B} */
${String(G)}
`);return K&&(D+=K),D}function Ar(t){return it(Ye.getState().active(),t)}const Or=({content:t,title:o,instanceContext:e,pageSlug:r})=>{const s=F.useRef(null),a=F.useRef(new Map),n=F.useRef(0),l=ct(),p=dt(),c=Ye(z=>z.active()),b=F.useRef(null),i=F.useMemo(()=>{const z={};if(t.configure)for(const O of t.configure)O.name&&(z[O.name]=O.default??"");return t.config&&Object.entries(t.config).forEach(([O,m])=>{z[O]=String(m??"")}),z},[t.configure,t.config]),d=F.useMemo(()=>JSON.stringify(Array.isArray(t.actions)?t.actions:[]),[t.actions]),v=F.useMemo(()=>gr(t.components),[t.components]),w=F.useMemo(()=>e?$t(e,Array.isArray(t.actions)?t.actions:[],r??"",i):null,[e==null?void 0:e.id,r,d,i]),g=(e==null?void 0:e.id)??0;F.useEffect(()=>(b.current=w,e&&(window.KSPageSDK=w),()=>{window.KSPageSDK===w&&(window.KSPageSDK=null)}),[g,w]);const A=pe(e??{id:0,name:"(no instance bound — bind one for live data)",kind:"-",status:"-",template_id:0,template_name:null,node_id:0,node_name:null,owner_id:null,owner_name:null,config:{},external_id:"",created_at:"",updated_at:""}),T=F.useMemo(()=>{if(t.type!=="html")return;const z=Ne(t.html??"",t.components??[],t.configure,t.config),O=it(c,r??p.pathname);return Er(z,A,pe(Array.isArray(t.actions)?t.actions:[]),p.search,O,pe(i),pe(r??""))},[t.type,t.html,t.components,t.configure,t.config,t.actions,A,p.search,c,r,i]);if(F.useEffect(()=>{const z=O=>{var H,I,q,E;if(O.source!==((H=s.current)==null?void 0:H.contentWindow))return;const m=O.data;if(!(!m||typeof m!="object"||!m.type))switch(m.type){case"ks-sdk-call":{const{id:_,method:P,args:C}=m,M=y=>{var j,L;(L=(j=s.current)==null?void 0:j.contentWindow)==null||L.postMessage({type:"ks-sdk-response",id:_,...y},"*")},k=b.current;if(!k){M({error:"SDK not bound to an instance"});break}if(typeof P!="string"||!st.includes(P)){M({error:`Method not allowed: ${String(P)}`});break}Promise.resolve().then(async()=>{const y=C;switch(P){case"executeAction":return k.executeAction(y[0]);case"runAction":return k.runAction(y[0],y[1]);case"fetchPanel":return k.fetchPanel(y[0],y[1]);case"shell":return k.shell(y[0],y[1],y[2],y[3]);case"readFile":return k.readFile(y[0]);case"writeFile":return k.writeFile(y[0],y[1]);case"listFiles":return k.listFiles(y[0]);case"deleteFile":return k.deleteFile(y[0]);case"createDirectory":return k.createDirectory(y[0]);case"docker":return k.docker(y[0],y[1]);case"kvm":return k.kvm(y[0],y[1]);case"lxd":return k.lxd(y[0],y[1]);case"statPath":return k.statPath(y[0]);case"renamePath":return k.renamePath(y[0],y[1]);case"copyPath":return k.copyPath(y[0],y[1]);case"chmodPath":return k.chmodPath(y[0],y[1]);case"archivePaths":return k.archivePaths(y[0],y[1],y[2]);case"extractArchive":return k.extractArchive(y[0],y[1]);case"searchFiles":return k.searchFiles(y[0],y[1],y[2]);case"uploadFromUrl":return k.uploadFromUrl(y[0],y[1]);case"uploadFile":return k.uploadFile(y[0],y[1],y[2]);case"downloadFile":return k.downloadFile(y[0]);case"listPorts":return k.listPorts();case"savePorts":return k.savePorts(y[0]);case"listAutomation":return k.listAutomation();case"listAutomationRuns":return k.listAutomationRuns(y[0]);case"runAutomationJob":return k.runAutomationJob(y[0]);case"deleteAutomationJob":return k.deleteAutomationJob(y[0]);case"createAutomationJob":return k.createAutomationJob(y[0]);case"updateAutomationJob":return k.updateAutomationJob(y[0],y[1]);case"downloadAutomation":return k.downloadAutomation(y[0]);case"importAutomationURL":return k.importAutomationURL(y[0]);case"listSecrets":return k.listSecrets();case"setSecret":return k.setSecret(y[0],y[1]);case"deleteSecret":return k.deleteSecret(y[0]);case"revealSecret":return k.revealSecret(y[0]);case"saveEnv":return k.saveEnv(y[0]);case"power":return k.power(y[0]);case"reinstall":return k.reinstall();case"updateIdentity":return k.updateIdentity(y[0]);case"getMetrics":return k.getMetrics();case"listProcesses":return k.listProcesses();case"killProcess":return k.killProcess(y[0],y[1]);case"listAudit":return k.listAudit(y[0]);case"getSftp":return k.getSftp();case"enableSftp":return k.enableSftp();case"rotateSftp":return k.rotateSftp();case"disableSftp":return k.disableSftp();case"revealSftp":return k.revealSftp();case"sendActionStdin":return k.sendActionStdin(y[0],y[1]);case"sendInstallStdin":return k.sendInstallStdin(y[0]);case"toast":return k.toast(y[0],y[1]),{ok:!0};case"confirm":{const j=typeof y[0]=="string"?y[0]:String(y[0]??"");return Re({title:"Please confirm",message:j})}case"navigate":{const j=ft(g,y[0]);if(!j)throw new Error("navigate: path outside this instance");return l(j),{ok:!0}}default:{const[j,L]=P.split(".");return j==="kv"?k.kv[L](...y.slice(0,2)):k.storage[L](...y.slice(0,2))}}}).then(y=>{try{structuredClone(y),M({result:y})}catch{M({result:String(y)})}}).catch(y=>M({error:y instanceof Error?y.message:String(y)}));break}case"ks-iframe-resize":{typeof m.height=="number"&&s.current&&(s.current.style.height=`${Math.min(Math.max(m.height,320),2e4)}px`);break}case"ks-toast":window.dispatchEvent(new CustomEvent("ks-toast",{detail:m.detail}));break;case"ks-modal":window.dispatchEvent(new CustomEvent("ks-modal",{detail:m.detail}));break;case"ks-page-event":window.dispatchEvent(new CustomEvent("ks-page-event",{detail:m.detail}));break;case"ks-ws-open":{const _=m.wsId,P=typeof _=="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(_)?_:`ws${++n.current}`,C=m,M=C.params&&typeof C.params=="object"?C.params:{},k=Xe(window.location.host,window.location.protocol,g,C.endpoint,{terminal:typeof M.terminal=="string"?M.terminal:"",timeout:typeof M.timeout=="string"||typeof M.timeout=="number"?M.timeout:""}),y=(()=>{const j=m.protocols,Z=(typeof j=="string"?[j]:Array.isArray(j)?j:[]).filter(V=>typeof V=="string").map(V=>V.trim()).filter(V=>V!==""&&V.length<=64&&/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(V)).slice(0,8);return Z.length>0?Z:void 0})();try{const j=new WebSocket(k,y);a.current.set(P,j),j.onopen=()=>{var L,Z;return(Z=(L=s.current)==null?void 0:L.contentWindow)==null?void 0:Z.postMessage({type:"ks-ws-event",wsId:P,event:"open"},"*")},j.onmessage=L=>{const Z=V=>{var J,Q;return(Q=(J=s.current)==null?void 0:J.contentWindow)==null?void 0:Q.postMessage({type:"ks-ws-event",wsId:P,event:"message",data:V},"*")};if(typeof L.data=="string"){Z(L.data);return}L.data instanceof Blob&&L.data.text().then(Z).catch(()=>{})},j.onerror=()=>{var L,Z;return(Z=(L=s.current)==null?void 0:L.contentWindow)==null?void 0:Z.postMessage({type:"ks-ws-event",wsId:P,event:"error"},"*")},j.onclose=()=>{var L,Z;(Z=(L=s.current)==null?void 0:L.contentWindow)==null||Z.postMessage({type:"ks-ws-event",wsId:P,event:"close"},"*"),a.current.delete(P)},(I=s.current.contentWindow)==null||I.postMessage({type:"ks-ws-opened",reqId:m.reqId,wsId:P},"*")}catch(j){(E=(q=s.current)==null?void 0:q.contentWindow)==null||E.postMessage({type:"ks-ws-opened",reqId:m.reqId,error:String(j)},"*")}break}case"ks-ws-send":{const _=a.current.get(m.wsId);_&&_.readyState===WebSocket.OPEN&&typeof m.data=="string"&&_.send(m.data);break}case"ks-ws-close":{const _=a.current.get(m.wsId);if(_){try{_.close()}catch{}a.current.delete(m.wsId)}break}}};return window.addEventListener("message",z),()=>{window.removeEventListener("message",z),a.current.forEach(O=>{try{O.close()}catch{}}),a.current.clear()}},[g,l,r]),t.type==="html")return R.jsx("iframe",{ref:s,srcDoc:T,className:"w-full border-0 bg-transparent animate-fade-in",style:{minHeight:"500px",height:"500px"},title:o,sandbox:"allow-scripts allow-forms allow-popups allow-modals allow-downloads"});if(t.type==="react"){const z=(t.bundle??"").trim();if(z==="")return R.jsxs("div",{className:"glass-card rounded-xl text-center text-gray-400",children:[R.jsx("p",{className:"text-sm",children:"This React page has no built bundle."}),R.jsx("p",{className:"text-xs text-gray-500 mt-1",children:"Open it in the Instance Page Studio and click Build."})]});if(!w)return R.jsx("div",{className:"glass-card rounded-xl text-center text-gray-400",children:R.jsx("p",{className:"text-sm",children:"Bind an instance to render this React page."})});const O=`${(e==null?void 0:e.id)??0}:${(e==null?void 0:e.status)??""}:${r??""}:${d}:${JSON.stringify(i)}`;return R.jsx(mr,{bundle:z,bundleCss:t.bundleCss,sdk:w,sdkKey:O,resetKey:`${r??""}`,modules:v})}return R.jsxs("div",{className:"animate-fade-in",children:[t.type==="markdown"&&Sr(t.markdown??"",t.components,t.configure,t.config),t.type==="blocks"&&$r(t.blocks??"",t.components,t.configure,t.config)]})};export{Or as C,me as P,Yt as S,Ar as a,Xe as b,Pr as d,Ae as g,yr as m,ft as p};
