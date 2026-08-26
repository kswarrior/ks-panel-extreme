// PAGE STARTERS — a built-in library of fully functional instance-page
// templates for the Instance Page Studio ("Templates" tab).
//
// Every starter is an ordinary custom instance page (content_type 'html')
// whose JavaScript talks ONLY to KSPageSDK — exactly what an admin authors
// in the Studio. Together they prove the instance-pages system can express
// everything the compiled built-in pages do (Home / Files / Network /
// Console / Settings / Env / Automation / Processes / Metrics / Ports /
// Backups / Audit) plus the extra surfaces VM & container operators usually
// need (Docker manager, systemd services, cron, disk analyzer, package
// updates, firewall, users, system info).
//
// Security notes:
//   • No external resources — everything runs offline inside the panel.
//   • All dynamic values pass through esc() before touching innerHTML.
//   • Destructive operations always confirm() first.
//   • Data access goes through the SDK bridge, which is instance-scoped and
//     permission-gated server-side (see CustomPageView / fetchPanel).

import type { PageActionDef } from '../types/instancePage';

export interface PageStarter {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  /** Inner SVG markup (no <svg> wrapper). */
  iconSvg: string;
  html: string;
  /** Saved executable actions the template ships with (loaded into the
   *  Studio's Actions tab when the template is applied). */
  actions?: PageActionDef[];
}

// ---------------------------------------------------------------------------
// Shared helpers injected into every starter page.
// ---------------------------------------------------------------------------
const COMMON_JS = `
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function el(id){return document.getElementById(id);}
function fmtBytes(n){if(n==null||isNaN(n))return'-';var u=['B','KB','MB','GB','TB'];var i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return n.toFixed(n>=100||i===0?0:1)+' '+u[i];}
function badge(s){var c='ks-badge';s=String(s==null?'':s).toLowerCase();if(['running','done','active','ok','up'].indexOf(s)>=0)c+=' ks-ok';else if(['stopped','exited','inactive','paused'].indexOf(s)>=0)c+=' ks-warn';else if(['errored','failed','error','dead'].indexOf(s)>=0)c+=' ks-bad';return '<span class="'+c+'">'+esc(s||'unknown')+'</span>';}
function bar(pct,color){pct=Math.max(0,Math.min(100,Number(pct)||0));if(!color)color=pct>90?'var(--ks-bad)':pct>70?'var(--ks-warn)':'var(--ks-info)';return '<div class="ks-bar"><span style="width:'+pct+'%;background:'+color+'"></span></div>';}
function cssVar(n,f){try{var v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f;}catch(e){return f;}}
function toast(m,t){try{KSPageSDK.toast(m,t||'info');}catch(e){}}
async function sh(cmd,timeout){var r=await KSPageSDK.shell(cmd,[],null,timeout||20);if(r&&r.error&&!r.stdout&&!r.stderr)throw new Error(r.error);return r;}
function pre(text,maxH){return '<pre style="max-height:'+(maxH||420)+'px;overflow:auto;font-size:12px;margin:0">'+esc(text==null?'':text)+'</pre>';}
function card(title,innerHtml){return '<div class="ks-card"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:var(--ks-heading)">'+title+'</h3>'+innerHtml+'</div>';}
`;

// page() wraps a body + script into the standard starter skeleton. The
// generated script is a plain async IIFE whose errors land in #content.
function page(title: string, body: string, js: string): string {
  return `<div class="ks-page">
<div class="ks-row" style="justify-content:space-between;margin-bottom:0.75rem">
  <h2 style="margin:0;font-size:1.3rem;color:var(--ks-heading)">${title}</h2>
</div>
${body}
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
document.currentScript.remove();
</script>`;
}

// ---------------------------------------------------------------------------
// BUILT-IN EQUIVALENTS (12) — each converts one compiled built-in page into a
// pure instance-page definition.
// ---------------------------------------------------------------------------

const OVERVIEW = page(
  'Instance Overview',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    var inst = KSPageSDK.instance;
    var osOut = '', kernOut = '', upOut = '', hostOut = '';
    try { var os = await sh('. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"'); osOut = os.stdout.trim(); } catch(e){}
    try { kernOut = (await sh('uname -r')).stdout.trim(); } catch(e){}
    try { upOut = (await sh('uptime -p 2>/dev/null || uptime')).stdout.trim().replace(/\\s+/g,' '); } catch(e){}
    try { hostOut = (await sh('hostname')).stdout.trim(); } catch(e){}
    var rows = [
      ['Name', esc(inst.display_name || inst.name)],
      ['Status', badge(inst.status)],
      ['Driver', esc(inst.kind)],
      ['Hostname', esc(hostOut || '-')],
      ['OS', esc(osOut || '-')],
      ['Kernel', esc(kernOut || '-')],
      ['Uptime', esc(upOut || '-')],
      ['Template', esc(inst.template_name ? inst.template_name + ' #' + inst.template_id : '-')],
      ['Node', esc(inst.node_name ? inst.node_name + ' #' + inst.node_id : String(inst.node_id))],
      ['Owner', esc(inst.owner_name || '-')],
      ['External ID', esc(inst.external_id || '-')],
      ['Created', esc(inst.created_at ? new Date(inst.created_at).toLocaleString() : '-')],
    ];
    el('content').innerHTML =
      '<div class="ks-card"><table>' +
      rows.map(function(r){ return '<tr><th style="width:140px">' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') +
      '</table></div>' +
      '<p class="ks-muted" style="font-size:11px">This page is a custom instance page rendered from the Instance Pages library.</p>';
  `,
);

const FILES_BROWSER = page(
  'File Manager',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn" id="up">Up</button>
    <input id="path" value="/" spellcheck="false" style="flex:1;min-width:200px" />
    <button class="ks-btn ks-btn-blue" id="go">Open</button>
    <button class="ks-btn ks-btn-green" id="mkdir">+ Folder</button>
    <button class="ks-btn ks-btn-green" id="mkfile">+ File</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>
  <div id="editor" style="display:none;margin-top:0.75rem">
    <div class="ks-row" style="justify-content:space-between;margin-bottom:0.35rem">
      <code id="editpath" class="ks-muted"></code>
      <div class="ks-row">
        <button class="ks-btn ks-btn-green" id="save">Save</button>
        <button class="ks-btn" id="close">Close</button>
      </div>
    </div>
    <textarea id="editbox" spellcheck="false" style="width:100%;height:320px;font-family:ui-monospace,monospace;font-size:12px"></textarea>
  </div>`,
  `
    var cwd = '/';
    function parent(p){ var q = p.split('/').filter(Boolean); q.pop(); return '/' + q.join('/'); }
    function join(base, name){ return (base === '/' ? '' : base) + '/' + name; }
    async function load(){
      el('path').value = cwd;
      var r = await KSPageSDK.listFiles(cwd);
      var files = Array.isArray(r) ? r : (r && r.data) || [];
      files.sort(function(a,b){ if(a.is_dir!==b.is_dir) return a.is_dir?-1:1; return a.name.localeCompare(b.name); });
      if (!files.length) { el('content').innerHTML = '<p class="ks-muted">Empty directory.</p>'; return; }
      el('content').innerHTML =
        '<div class="ks-card" style="padding:0"><table><thead><tr><th>Name</th><th style="width:90px">Size</th><th style="width:120px">Mode</th><th style="width:180px">Actions</th></tr></thead><tbody>' +
        files.map(function(f){
          var p = join(cwd, f.name);
          var acts = f.is_dir
            ? '<a href="#" data-open="' + esc(p) + '">open</a> &nbsp; <a href="#" data-del="' + esc(p) + '" data-d="dir" class="ks-bad">delete</a>'
            : '<a href="#" data-edit="' + esc(p) + '">view/edit</a> &nbsp; <a href="#" data-del="' + esc(p) + '" class="ks-bad">delete</a>';
          return '<tr><td>' + (f.is_dir ? '&#128193; ' : '') + esc(f.name) + '</td><td class="ks-mono">' + (f.is_dir ? '-' : fmtBytes(f.size)) + '</td><td class="ks-mono">' + esc(f.mode || '') + '</td><td>' + acts + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function openEditor(path){
      var txt = await KSPageSDK.readFile(path);
      el('editpath').textContent = path;
      el('editbox').value = typeof txt === 'string' ? txt : (txt && txt.data) || '';
      el('editor').style.display = 'block';
      el('editor').dataset.path = path;
    }
    el('go').onclick = function(){ cwd = el('path').value || '/'; load(); };
    el('up').onclick = function(){ cwd = parent(cwd === '/' ? '' : cwd); load(); };
    el('mkdir').onclick = async function(){
      var n = window.prompt('New folder name');
      if (!n) return;
      await KSPageSDK.createDirectory(join(cwd, n));
      toast('Folder created', 'success');
      load();
    };
    el('mkfile').onclick = async function(){
      var n = window.prompt('New file name');
      if (!n) return;
      await KSPageSDK.writeFile(join(cwd, n), '');
      toast('File created', 'success');
      load();
    };
    el('save').onclick = async function(){
      await KSPageSDK.writeFile(el('editor').dataset.path, el('editbox').value);
      toast('Saved', 'success');
    };
    el('close').onclick = function(){ el('editor').style.display = 'none'; };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a');
      if (!t) return;
      ev.preventDefault();
      if (t.dataset.open) { cwd = t.dataset.open; load(); }
      else if (t.dataset.edit) { openEditor(t.dataset.edit); }
      else if (t.dataset.del) {
        if (!window.confirm('Delete ' + t.dataset.del + (t.dataset.d === 'dir' ? ' and EVERYTHING inside it' : '') + '?')) return;
        await KSPageSDK.deleteFile(t.dataset.del);
        toast('Deleted', 'success');
        load();
      }
    });
    await load();
  `,
);

const NETWORK_INFO = page(
  'Network',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    var sections = [
      ['Interfaces', 'ip -br addr 2>/dev/null || ifconfig -a 2>/dev/null || cat /proc/net/dev'],
      ['Routes', 'ip route 2>/dev/null || route -n 2>/dev/null'],
      ['Listening sockets', 'ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null'],
      ['DNS', 'cat /etc/resolv.conf 2>/dev/null'],
      ['Hosts', 'cat /etc/hosts 2>/dev/null'],
    ];
    var html = '';
    for (var i = 0; i < sections.length; i++) {
      var out = '';
      try { out = (await sh(sections[i][1])).stdout || '(empty)'; } catch(e){ out = '(unavailable)'; }
      html += card(sections[i][0], pre(out));
    }
    el('content').innerHTML = html;
  `,
);

const WEB_CONSOLE = page(
  'Console',
  `<div class="ks-muted" style="font-size:11px;margin-bottom:0.4rem">Exec-based console: every command runs as a fresh non-TTY shell inside the instance.</div>
  <div id="out" style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:0.75rem;height:340px;overflow:auto;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap"></div>
  <div class="ks-row" style="margin-top:0.5rem">
    <input id="cmd" placeholder="command…" spellcheck="false" style="flex:1" />
    <button class="ks-btn ks-btn-blue" id="run">Run</button>
    <button class="ks-btn" id="clear">Clear</button>
  </div>`,
  `
    var hist = [];
    var hi = 0;
    function print(line, cls){
      var d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = line;
      el('out').appendChild(d);
      el('out').scrollTop = el('out').scrollHeight;
    }
    async function run(cmdline){
      hist.push(cmdline);
      hi = hist.length;
      print('$ ' + cmdline, 'ks-ok');
      var r = await KSPageSDK.shell(cmdline, [], null, 60);
      if (r.stdout) print(r.stdout.replace(/\\n$/, ''));
      if (r.stderr) print(r.stderr.replace(/\\n$/, ''), 'ks-bad');
      print('[exit ' + (r.exit_code != null ? r.exit_code : '?') + ']', 'ks-muted');
    }
    el('run').onclick = async function(){
      var v = el('cmd').value.trim();
      if (!v) return;
      el('cmd').value = '';
      el('run').disabled = true;
      try { await run(v); } finally { el('run').disabled = false; el('cmd').focus(); }
    };
    el('clear').onclick = function(){ el('out').innerHTML = ''; };
    el('cmd').addEventListener('keydown', function(ev){
      if (ev.key === 'Enter') { ev.preventDefault(); el('run').click(); }
      else if (ev.key === 'ArrowUp') { if (hi > 0) { hi--; el('cmd').value = hist[hi] || ''; } ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { if (hi < hist.length - 1) { hi++; el('cmd').value = hist[hi] || ''; } else { hi = hist.length; el('cmd').value = ''; } }
    });
    print('KS Panel exec console — type a command and press Enter.', 'ks-muted');
    el('cmd').focus();
  `,
);

const SYSTEM_SETTINGS = page(
  'System Settings',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    async function out(cmd){ try { return (await sh(cmd)).stdout.trim() || '-'; } catch(e){ return '(unavailable)'; } }
    var hostname = await out('hostname');
    var tz = await out('cat /etc/timezone 2>/dev/null || date +%Z');
    var date = await out('date');
    var ulimit = await out('ulimit -n');
    var free = '(unavailable)';
    try { free = (await sh('free -m 2>/dev/null')).stdout || '(unavailable)'; } catch(e){}
    var disk = '(unavailable)';
    try { disk = (await sh('df -h /')).stdout; } catch(e){}
    el('content').innerHTML =
      card('General', '<table>' +
        '<tr><th style="width:150px">Hostname</th><td>' + esc(hostname) + '</td></tr>' +
        '<tr><th>Timezone</th><td>' + esc(tz) + '</td></tr>' +
        '<tr><th>Date</th><td>' + esc(date) + '</td></tr>' +
        '<tr><th>Open files limit</th><td>' + esc(ulimit) + '</td></tr>' +
        '</table>') +
      card('Memory (MiB)', pre(free)) +
      card('Root filesystem', pre(disk));
  `,
);

const ENV_VAULT = page(
  'Environment Vault',
  `<div class="ks-card">
    <div class="ks-row">
      <input id="k" placeholder="KEY" style="width:180px" />
      <input id="v" placeholder="value" style="flex:1;min-width:160px" />
      <label class="ks-row ks-muted" style="text-transform:none;margin:0"><input type="checkbox" id="sec" checked /> secret</label>
      <button class="ks-btn ks-btn-green" id="add">Set</button>
    </div>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function load(){
      var list = await KSPageSDK.fetchPanel('/secrets/');
      if (!Array.isArray(list) || !list.length) { el('content').innerHTML = '<p class="ks-muted">No variables yet. Add one above.</p>'; return; }
      el('content').innerHTML =
        '<div class="ks-card" style="padding:0"><table><thead><tr><th>Key</th><th>Value</th><th style="width:140px">Actions</th></tr></thead><tbody>' +
        list.map(function(s){
          var val = s.is_secret
            ? '<span class="ks-muted">' + esc(s.masked_value || '••••••') + '</span>'
            : '<span class="ks-mono">' + esc(s.value) + '</span>';
          return '<tr><td class="ks-mono">' + esc(s.key) + (s.is_secret ? ' <span class="ks-badge">secret</span>' : '') + '</td><td>' + val + '</td>' +
            '<td>' + (s.is_secret ? '<a href="#" data-reveal="' + esc(s.key) + '">reveal</a> ' : '') +
            '<a href="#" data-del="' + esc(s.key) + '" class="ks-bad">delete</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    el('add').onclick = async function(){
      var k = el('k').value.trim();
      if (!k) return;
      await KSPageSDK.fetchPanel('/secrets/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k, value: el('v').value, is_secret: el('sec').checked }),
      });
      el('k').value = '';
      el('v').value = '';
      toast('Saved ' + k, 'success');
      load();
    };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a');
      if (!t) return;
      ev.preventDefault();
      if (t.dataset.reveal) {
        var r = await KSPageSDK.fetchPanel('/secrets/' + encodeURIComponent(t.dataset.reveal));
        t.parentElement.previousElementSibling.innerHTML = '<span class="ks-mono ks-ok">' + esc(r.value) + '</span>';
      } else if (t.dataset.del) {
        if (!window.confirm('Delete ' + t.dataset.del + '?')) return;
        await KSPageSDK.fetchPanel('/secrets/' + encodeURIComponent(t.dataset.del), { method: 'DELETE' });
        toast('Deleted', 'success');
        load();
      }
    });
    await load();
  `,
);

const AUTOMATION_HUB = page(
  'Automation',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    var jobs = await KSPageSDK.fetchPanel('/automation/');
    var runs = [];
    try { runs = await KSPageSDK.fetchPanel('/automation/runs?limit=10'); } catch(e){}
    var jobsHtml = !Array.isArray(jobs) || !jobs.length
      ? '<p class="ks-muted">No jobs defined yet.</p>'
      : '<div class="ks-card" style="padding:0"><table><thead><tr><th>Job</th><th>Schedule</th><th>Status</th><th>Last run</th><th style="width:150px">Actions</th></tr></thead><tbody>' +
        jobs.map(function(j){
          return '<tr><td><strong>' + esc(j.name) + '</strong><br /><span class="ks-muted ks-mono" style="font-size:11px">' + esc(j.command) + '</span></td>' +
            '<td class="ks-mono">' + (j.schedule ? esc(j.schedule) : '<span class="ks-muted">manual</span>') + '</td>' +
            '<td>' + (j.enabled ? badge('active') : badge('inactive')) + '</td>' +
            '<td class="ks-mono" style="font-size:11px">' + esc(j.last_run_at || '-') + '</td>' +
            '<td><a href="#" data-run="' + j.id + '" class="ks-ok">run now</a> &nbsp; <a href="#" data-deljob="' + j.id + '" class="ks-bad">delete</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    var runsHtml = !Array.isArray(runs) || !runs.length
      ? '<p class="ks-muted">No recent runs.</p>'
      : '<div class="ks-card" style="padding:0"><table><thead><tr><th>When</th><th>Trigger</th><th>Exit</th><th>Duration</th><th>Output</th></tr></thead><tbody>' +
        runs.map(function(r){
          var text = ((r.stdout || '') + (r.stderr || '')).slice(0, 80);
          return '<tr><td class="ks-mono" style="font-size:11px">' + esc(r.started_at || '-') + '</td><td>' + esc(r.trigger || '-') + '</td>' +
            '<td class="' + (r.exit_code === 0 ? 'ks-ok' : 'ks-bad') + '">' + r.exit_code + '</td><td>' + (r.duration_ms || 0) + ' ms</td>' +
            '<td class="ks-mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(text) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    el('content').innerHTML = '<h3 style="font-size:1rem;color:var(--ks-heading);margin:0 0 .4rem">Jobs</h3>' + jobsHtml +
      '<h3 style="font-size:1rem;color:var(--ks-heading);margin:1rem 0 .4rem">Recent runs</h3>' + runsHtml;
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a');
      if (!t) return;
      ev.preventDefault();
      try {
        if (t.dataset.run) {
          var res = await KSPageSDK.fetchPanel('/automation/' + t.dataset.run + '/run', { method: 'POST' });
          var code = res && res.exit_code != null ? res.exit_code : '?';
          toast('Run finished, exit ' + code, code === 0 ? 'success' : 'error');
        } else if (t.dataset.deljob) {
          if (!window.confirm('Delete job #' + t.dataset.deljob + '?')) return;
          await KSPageSDK.fetchPanel('/automation/' + t.dataset.deljob, { method: 'DELETE' });
          toast('Deleted', 'success');
        }
      } catch (e) { toast(e.message, 'error'); }
    });
  `,
);

const PROCESS_OBSERVER = page(
  'Processes',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
    <label class="ks-row ks-muted" style="text-transform:none;margin:0"><input type="checkbox" id="auto" /> auto-refresh (5s)</label>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    var timer = null;
    async function load(){
      var rows = await KSPageSDK.fetchPanel('/processes');
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) { el('content').innerHTML = '<p class="ks-muted">No processes reported (instance stopped or inspect unavailable).</p>'; return; }
      el('content').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem">' +
        rows.map(function(p){
          var cmd = p.cmd || p.name || '';
          return '<div class="ks-card"><div class="ks-row" style="justify-content:space-between"><strong>PID ' + p.pid + '</strong><span class="ks-badge">' + esc(p.user || '-') + '</span></div>' +
            '<div class="ks-mono" style="font-size:11px;margin:0.35rem 0;word-break:break-all">' + esc(cmd.slice(0, 120)) + '</div>' +
            '<div class="ks-row ks-muted" style="font-size:11px;justify-content:space-between"><span>CPU ' + (p.cpu != null ? Number(p.cpu).toFixed(1) : '0.0') + '%</span>' +
            '<span>MEM ' + (p.mem != null ? Number(p.mem).toFixed(1) : '0.0') + '%</span>' +
            '<a href="#" data-kill="' + p.pid + '" class="ks-bad">kill</a></div></div>';
        }).join('') + '</div>';
    }
    el('refresh').onclick = load;
    el('auto').onchange = function(){
      if (el('auto').checked) timer = setInterval(load, 5000);
      else if (timer) { clearInterval(timer); timer = null; }
    };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a[data-kill]');
      if (!t) return;
      ev.preventDefault();
      if (!window.confirm('Send SIGTERM to pid ' + t.dataset.kill + '?')) return;
      await KSPageSDK.fetchPanel('/processes/kill?pid=' + encodeURIComponent(t.dataset.kill), { method: 'POST' });
      toast('Signal sent', 'success');
      load();
    });
    await load();
  `,
);

const METRICS_LIVE = page(
  'Live Metrics',
  `<div id="gauges" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem"></div>
  <div class="ks-card" style="margin-top:0.75rem"><h3 style="margin:0 0 .5rem;font-size:.95rem;color:#fff">CPU history (last 5 min)</h3><canvas id="cpuChart" width="600" height="90" style="width:100%"></canvas></div>
  <p class="ks-muted" style="font-size:11px">Polled from the panel metrics API every 5 seconds.</p>`,
  `
    var cpuHist = [];
    function gauge(label, pct, sub){
      var color = pct > 90 ? '#f87171' : pct > 70 ? '#fbbf24' : '#38bdf8';
      var v = pct == null ? '--' : Number(pct).toFixed(1);
      return '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">' + label + '</div>' +
        '<div style="font-size:1.6rem;font-weight:600;color:' + color + '">' + v + '%</div>' + bar(pct, color) +
        (sub ? '<div class="ks-muted" style="font-size:11px;margin-top:0.25rem">' + sub + '</div>' : '') + '</div>';
    }
    function drawChart(){
      var cv = el('cpuChart');
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
      if (cpuHist.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      for (var i = 0; i < cpuHist.length; i++) {
        var x = (i / (cpuHist.length - 1)) * (cv.width - 8) + 4;
        var y = cv.height - 6 - (Math.min(100, cpuHist[i]) / 100) * (cv.height - 14);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    async function tick(){
      var m = await KSPageSDK.fetchPanel('/metrics');
      var cpu = m.cpu_pct != null ? m.cpu_pct : m.cpu;
      cpuHist.push(cpu == null ? 0 : Number(cpu));
      if (cpuHist.length > 60) cpuHist.shift();
      el('gauges').innerHTML =
        gauge('CPU', cpu) +
        gauge('Memory', m.mem_pct != null ? m.mem_pct : m.mem,
          m.mem_used != null && m.mem_total != null ? fmtBytes(m.mem_used * 1048576) + ' / ' + fmtBytes(m.mem_total * 1048576) : '') +
        gauge('Disk', m.disk_pct != null ? m.disk_pct : m.disk,
          m.disk_used != null && m.disk_total != null ? fmtBytes(m.disk_used * 1073741824) + ' / ' + fmtBytes(m.disk_total * 1073741824) : '');
      drawChart();
    }
    while (true) {
      try { await tick(); } catch(e){}
      await new Promise(function(r){ setTimeout(r, 5000); });
    }
  `,
);

const PORT_SCANNER = page(
  'Ports',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <input id="q" placeholder="filter…" style="flex:1;max-width:280px" />
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    var all = [];
    function render(){
      var q = el('q').value.trim().toLowerCase();
      var rows = all.filter(function(p){
        if (!q) return true;
        return [p.proto, p.laddr, p.raddr, p.state, p.pid].some(function(v){ return String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0; });
      });
      if (!rows.length) { el('content').innerHTML = '<p class="ks-muted">' + (all.length ? 'No ports match the filter.' : 'No listening sockets reported.') + '</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>Proto</th><th>Local address</th><th>Remote address</th><th>State</th><th>PID</th></tr></thead><tbody>' +
        rows.map(function(p){
          return '<tr><td>' + esc((p.proto || '').toUpperCase()) + '</td><td class="ks-mono">' + esc(p.laddr || '-') + '</td>' +
            '<td class="ks-mono">' + esc(p.raddr || '-') + '</td><td>' + esc(p.state || '-') + '</td><td class="ks-mono">' + (p.pid != null ? p.pid : '-') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function load(){
      all = await KSPageSDK.fetchPanel('/ports');
      all = Array.isArray(all) ? all : [];
      render();
    }
    el('refresh').onclick = load;
    el('q').oninput = render;
    await load();
  `,
);

const SNAPSHOT_CENTER = page(
  'Snapshots & Backups',
  `<div class="ks-card">
    <div class="ks-row">
      <input id="name" placeholder="snapshot name" style="width:220px" />
      <input id="note" placeholder="note (optional)" style="flex:1;min-width:160px" />
      <button class="ks-btn ks-btn-green" id="create">Create snapshot</button>
    </div>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function load(){
      var snaps = await KSPageSDK.fetchPanel('/snapshots/');
      if (!Array.isArray(snaps) || !snaps.length) { el('content').innerHTML = '<p class="ks-muted">No snapshots yet. Create one above.</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>Name</th><th>Size</th><th>Created</th><th>Note</th><th style="width:160px">Actions</th></tr></thead><tbody>' +
        snaps.map(function(s){
          return '<tr><td class="ks-mono">' + esc(s.name) + '</td><td class="ks-mono">' + (s.size_bytes != null ? fmtBytes(s.size_bytes) : '-') + '</td>' +
            '<td class="ks-mono" style="font-size:11px">' + esc(s.created_at || '-') + '</td><td>' + esc(s.note || '-') + '</td>' +
            '<td><a href="#" data-restore="' + esc(s.name) + '" class="ks-warn">restore</a> &nbsp; <a href="#" data-del="' + esc(s.name) + '" class="ks-bad">delete</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    el('create').onclick = async function(){
      var n = el('name').value.trim();
      if (!n) { toast('Snapshot needs a name', 'error'); return; }
      el('create').disabled = true;
      try {
        await KSPageSDK.fetchPanel('/snapshots/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: n, note: el('note').value }),
        });
        el('name').value = '';
        el('note').value = '';
        toast('Snapshot created', 'success');
        await load();
      } finally { el('create').disabled = false; }
    };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a');
      if (!t) return;
      ev.preventDefault();
      if (t.dataset.restore) {
        if (!window.confirm('Restore snapshot "' + t.dataset.restore + '"? Current state will be replaced.')) return;
        await KSPageSDK.fetchPanel('/snapshots/' + encodeURIComponent(t.dataset.restore) + '/restore', { method: 'POST' });
        toast('Restore started', 'success');
      } else if (t.dataset.del) {
        if (!window.confirm('Delete snapshot "' + t.dataset.del + '"?')) return;
        await KSPageSDK.fetchPanel('/snapshots/' + encodeURIComponent(t.dataset.del), { method: 'DELETE' });
        toast('Deleted', 'success');
        load();
      }
    });
    await load();
  `,
);

const AUDIT_TRAIL = page(
  'Audit Trail',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <select id="limit" style="width:110px"><option value="50">50 rows</option><option value="200">200 rows</option><option value="500">500 rows</option></select>
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function load(){
      var n = el('limit').value;
      var rows = await KSPageSDK.fetchPanel('/audit?limit=' + n);
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) { el('content').innerHTML = '<p class="ks-muted">No audit entries yet.</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>' +
        rows.map(function(r){
          return '<tr><td class="ks-mono" style="font-size:11px;white-space:nowrap">' + esc(r.created_at || '-') + '</td>' +
            '<td>' + esc(r.actor || '-') + '</td><td><span class="ks-badge">' + esc(r.action || '-') + '</span></td>' +
            '<td class="ks-muted">' + esc(r.detail || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    el('refresh').onclick = load;
    el('limit').onchange = load;
    await load();
  `,
);

// ---------------------------------------------------------------------------
// VM & CONTAINER OPERATOR EXTRAS — surfaces panel users typically need
// beyond the built-in set.
// ---------------------------------------------------------------------------

const DOCKER_MANAGER = page(
  'Docker Containers',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
    <span id="note" class="ks-muted" style="font-size:11px"></span>
  </div>
  <div id="content" class="ks-muted">Loading…</div>
  <div id="logs" style="display:none;margin-top:0.75rem">
    <div class="ks-row" style="justify-content:space-between;margin-bottom:0.35rem">
      <code id="logtitle" class="ks-muted"></code>
      <button class="ks-btn" id="closelogs">Close logs</button>
    </div>
    <pre id="logbox" style="background:rgba(0,0,0,0.5);border-radius:8px;padding:0.75rem;max-height:320px;overflow:auto;font-size:12px"></pre>
  </div>`,
  `
    if (KSPageSDK.instance.kind !== 'docker') {
      el('note').textContent = 'Driver is "' + KSPageSDK.instance.kind + '" — docker commands only work where a docker CLI exists.';
    }
    async function load(){
      var r = await sh("docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'", 20);
      var lines = (r.stdout || '').split('\\n').filter(Boolean);
      if (!lines.length) { el('content').innerHTML = '<p class="ks-muted">No containers found (or docker unavailable).</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>ID</th><th>Name</th><th>Image</th><th>Status</th><th>Ports</th><th style="width:230px">Actions</th></tr></thead><tbody>' +
        lines.map(function(line){
          var c = line.split('|');
          var name = c[1] || '';
          return '<tr><td class="ks-mono">' + esc(c[0] || '') + '</td><td><strong>' + esc(name) + '</strong></td><td>' + esc(c[2] || '') + '</td>' +
            '<td>' + esc(c[3] || '') + '</td><td class="ks-mono" style="font-size:11px">' + esc(c[4] || '') + '</td>' +
            '<td class="ks-row">' +
            '<a href="#" data-act="start" data-name="' + esc(name) + '" class="ks-ok">start</a> ' +
            '<a href="#" data-act="stop" data-name="' + esc(name) + '" class="ks-warn">stop</a> ' +
            '<a href="#" data-act="restart" data-name="' + esc(name) + '">restart</a> ' +
            '<a href="#" data-act="logs" data-name="' + esc(name) + '">logs</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function showLogs(name){
      var r = await sh('docker logs --tail 200 ' + JSON.stringify(name), 20);
      el('logtitle').textContent = 'logs: ' + name;
      el('logbox').textContent = (r.stdout || '') + (r.stderr || '');
      el('logs').style.display = 'block';
    }
    el('refresh').onclick = load;
    el('closelogs').onclick = function(){ el('logs').style.display = 'none'; };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a[data-act]');
      if (!t) return;
      ev.preventDefault();
      var act = t.dataset.act;
      var name = t.dataset.name;
      try {
        if (act === 'logs') { showLogs(name); return; }
        if ((act === 'stop' || act === 'restart') && !window.confirm(act + ' container "' + name + '"?')) return;
        var r = await sh('docker ' + act + ' ' + JSON.stringify(name), 30);
        toast('docker ' + act + ': exit ' + (r.exit_code != null ? r.exit_code : '?'), r.exit_code === 0 ? 'success' : 'error');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
    await load();
  `,
);

const SERVICE_CONTROL = page(
  'Services',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <input id="q" placeholder="filter services…" style="flex:1;max-width:260px" />
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>
  <div id="detail" style="display:none;margin-top:0.75rem">
    <div class="ks-row" style="justify-content:space-between;margin-bottom:0.35rem">
      <code id="detailtitle" class="ks-muted"></code>
      <button class="ks-btn" id="closedetail">Close</button>
    </div>
    <pre id="detailbox" style="background:rgba(0,0,0,0.5);border-radius:8px;padding:0.75rem;max-height:320px;overflow:auto;font-size:12px"></pre>
  </div>`,
  `
    var units = [];
    function render(){
      var q = el('q').value.trim().toLowerCase();
      var rows = q ? units.filter(function(u){ return u.unit.toLowerCase().indexOf(q) >= 0; }) : units;
      if (!rows.length) { el('content').innerHTML = '<p class="ks-muted">' + (units.length ? 'No match.' : 'No systemd units reported (systemctl may be unavailable).') + '</p>'; return; }
      el('content').innerHTML = '<div class="ks-card" style="padding:0"><table><thead><tr><th>Unit</th><th>Active</th><th>Sub</th><th>Description</th><th style="width:210px">Actions</th></tr></thead><tbody>' +
        rows.map(function(u){
          return '<tr><td class="ks-mono">' + esc(u.unit) + '</td><td>' + esc(u.active) + '</td><td>' + esc(u.sub) + '</td><td>' + esc(u.desc) + '</td>' +
            '<td class="ks-row">' +
            '<a href="#" data-act="start" data-u="' + esc(u.unit) + '" class="ks-ok">start</a> ' +
            '<a href="#" data-act="stop" data-u="' + esc(u.unit) + '" class="ks-warn">stop</a> ' +
            '<a href="#" data-act="restart" data-u="' + esc(u.unit) + '">restart</a> ' +
            '<a href="#" data-act="status" data-u="' + esc(u.unit) + '">status</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    async function load(){
      var r = await sh('systemctl list-units --type=service --all --no-pager --no-legend', 25);
      units = (r.stdout || '').split('\\n').filter(function(l){ return l.trim(); }).map(function(line){
        var f = line.trim().split(/\\s+/);
        return { unit: f[0] || '', active: f[2] || '', sub: f[3] || '', desc: f.slice(4).join(' ') };
      }).filter(function(u){ return u.unit.indexOf('.service') >= 0; });
      render();
    }
    el('refresh').onclick = load;
    el('q').oninput = render;
    el('closedetail').onclick = function(){ el('detail').style.display = 'none'; };
    el('content').addEventListener('click', async function(ev){
      var t = ev.target.closest('a[data-act]');
      if (!t) return;
      ev.preventDefault();
      var act = t.dataset.act;
      var u = t.dataset.u;
      try {
        if (act === 'status') {
          var s = await sh('systemctl status ' + JSON.stringify(u) + ' --no-pager -l', 20);
          el('detailtitle').textContent = 'status: ' + u;
          el('detailbox').textContent = (s.stdout || '') + (s.stderr || '');
          el('detail').style.display = 'block';
          return;
        }
        if ((act === 'stop' || act === 'restart') && !window.confirm(act + ' ' + u + '?')) return;
        var r = await sh('systemctl ' + act + ' ' + JSON.stringify(u), 30);
        toast(u + ' ' + act + ': exit ' + (r.exit_code != null ? r.exit_code : '?'), r.exit_code === 0 ? 'success' : 'error');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
    await load();
  `,
);

const CRON_SCHEDULER = page(
  'Cron Jobs',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function section(title, cmd){
      var out = '(unavailable)';
      try { out = (await sh(cmd)).stdout.trim() || '(empty)'; } catch(e){}
      return card(title, pre(out));
    }
    async function load(){
      el('content').innerHTML = '<p class="ks-muted">Loading…</p>';
      el('content').innerHTML =
        await section('User crontab (crontab -l)', 'crontab -l 2>/dev/null') +
        await section('/etc/crontab', 'cat /etc/crontab 2>/dev/null') +
        await section('/etc/cron.d', 'ls -la /etc/cron.d 2>/dev/null') +
        await section('/etc/cron.daily', 'ls -la /etc/cron.daily 2>/dev/null');
    }
    el('refresh').onclick = load;
    await load();
  `,
);

const DISK_ANALYZER = page(
  'Disk Usage',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function load(){
      el('content').innerHTML = '<p class="ks-muted">Analyzing… (du can take a while on large filesystems)</p>';
      var dfOut = '(unavailable)';
      try { dfOut = (await sh('df -h')).stdout; } catch(e){}
      var duOut = '';
      try { duOut = (await sh('du -x -d1 -h / 2>/dev/null | sort -rh | head -15', 120)).stdout; } catch(e){ duOut = '(du unavailable or timed out)'; }
      el('content').innerHTML =
        card('Filesystems (df -h)', pre(dfOut)) +
        card('Largest top-level directories (du)', pre(duOut));
    }
    el('refresh').onclick = load;
    await load();
  `,
);

const UPDATE_CENTER = page(
  'Package Updates',
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="check">Check updates</button>
    <button class="ks-btn ks-btn-green" id="upgrade" style="display:none">Apply upgrades</button>
    <span id="mgr" class="ks-muted" style="font-size:11px"></span>
  </div>
  <div id="content" class="ks-muted">Run a check to list available package updates.</div>`,
  `
    var mgr = '';
    async function detect(){
      var r = await sh('command -v apt-get || command -v apk || command -v dnf || command -v yum', 10);
      mgr = (r.stdout.trim().split('\\n')[0] || '').split('/').pop();
      el('mgr').textContent = mgr ? ('package manager: ' + mgr) : 'no supported package manager found (apt/apk/dnf/yum)';
      return mgr;
    }
    async function check(){
      if (!mgr) { el('content').innerHTML = '<p class="ks-muted">No supported package manager detected.</p>'; return; }
      el('content').innerHTML = '<p class="ks-muted">Checking…</p>';
      var cmd =
        mgr === 'apt-get' ? 'apt-get update -qq && apt list --upgradable 2>/dev/null | tail -n +2' :
        mgr === 'apk' ? 'apk update >/dev/null 2>&1; apk version -l \\'<\\'' :
        'dnf -q check-update 2>/dev/null || yum -q check-update 2>/dev/null; true';
      var r = await sh(cmd, 120);
      var out = (r.stdout || '').trim();
      if (!out) {
        el('content').innerHTML = '<p class="ks-ok">All packages up to date.</p>';
        el('upgrade').style.display = 'none';
        return;
      }
      el('content').innerHTML = card('Available updates', pre(out));
      el('upgrade').style.display = 'inline-block';
    }
    async function upgrade(){
      if (!window.confirm('Install ALL available package upgrades now? This can take several minutes.')) return;
      el('upgrade').disabled = true;
      el('content').innerHTML = '<p class="ks-muted">Upgrading…</p>';
      try {
        var cmd =
          mgr === 'apt-get' ? 'DEBIAN_FRONTEND=noninteractive apt-get -y upgrade 2>&1 | tail -30' :
          mgr === 'apk' ? 'apk upgrade 2>&1 | tail -30' :
          '(dnf -y upgrade || yum -y update) 2>&1 | tail -30';
        var r = await sh(cmd, 600);
        el('content').innerHTML = card('Upgrade result (exit ' + (r.exit_code != null ? r.exit_code : '?') + ')', pre((r.stdout || '') + (r.stderr || '')));
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
  `<div class="ks-row" style="margin-bottom:0.6rem">
    <button class="ks-btn ks-btn-blue" id="refresh">Refresh</button>
  </div>
  <div id="content" class="ks-muted">Loading…</div>`,
  `
    async function load(){
      var html = '';
      var ufw = null, iptables = null, nft = null;
      try { ufw = (await sh('ufw status verbose 2>/dev/null', 15)); } catch(e){}
      if (ufw && ufw.stdout && ufw.stdout.trim()) html += card('UFW', pre(ufw.stdout));
      try { iptables = (await sh('iptables -L -n -v --line-numbers 2>/dev/null | head -80', 15)); } catch(e){}
      if (iptables && iptables.stdout && iptables.stdout.trim()) html += card('iptables', pre(iptables.stdout));
      try { nft = (await sh('nft list ruleset 2>/dev/null | head -140', 15)); } catch(e){}
      if (nft && nft.stdout && nft.stdout.trim()) html += card('nftables', pre(nft.stdout));
      el('content').innerHTML = html || '<p class="ks-muted">No firewall tooling found (ufw / iptables / nft) or no output.</p>';
    }
    el('refresh').onclick = load;
    await load();
  `,
);

const USER_REGISTRY = page(
  'Users & Groups',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    var passwdOut = '', groupCount = '-', lastOut = '';
    try { passwdOut = (await sh('cat /etc/passwd')).stdout; } catch(e){}
    try { groupCount = (await sh('wc -l < /etc/group')).stdout.trim(); } catch(e){}
    try { lastOut = (await sh('last -n 12 2>/dev/null || who 2>/dev/null', 15)).stdout; } catch(e){}
    var users = passwdOut.split('\\n').filter(Boolean).map(function(line){
      var f = line.split(':');
      return { name: f[0] || '', uid: parseInt(f[2], 10), gid: parseInt(f[3], 10), home: f[5] || '', shell: f[6] || '' };
    });
    var human = users.filter(function(u){ return !isNaN(u.uid) && u.uid >= 1000 || u.uid === 0; });
    el('content').innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Accounts</div><div style="font-size:1.6rem;font-weight:600;color:#fff">' + users.length + '</div></div>' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Human / privileged</div><div style="font-size:1.6rem;font-weight:600;color:#38bdf8">' + human.length + '</div><div class="ks-mono ks-muted" style="font-size:11px">' + esc(human.map(function(u){ return u.name; }).join(', ')) + '</div></div>' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Groups</div><div style="font-size:1.6rem;font-weight:600;color:#fff">' + esc(groupCount) + '</div></div>' +
      '</div>' +
      card('Accounts (/etc/passwd)',
        '<table><thead><tr><th>User</th><th>UID</th><th>GID</th><th>Home</th><th>Shell</th></tr></thead><tbody>' +
        users.map(function(u){
          var tone = u.uid === 0 ? 'ks-warn' : (!isNaN(u.uid) && u.uid >= 1000 ? 'ks-ok' : '');
          return '<tr><td class="' + tone + '">' + esc(u.name) + '</td><td class="ks-mono">' + (isNaN(u.uid) ? '-' : u.uid) + '</td>' +
            '<td class="ks-mono">' + (isNaN(u.gid) ? '-' : u.gid) + '</td><td class="ks-mono">' + esc(u.home) + '</td><td class="ks-mono">' + esc(u.shell) + '</td></tr>';
        }).join('') + '</tbody></table>') +
      card('Recent logins', lastOut.trim() ? pre(lastOut) : '<span class="ks-muted">(unavailable)</span>');
  `,
);

const SYSTEM_PROBE = page(
  'System Info',
  `<div id="content" class="ks-muted">Loading…</div>`,
  `
    async function out(cmd){ try { return (await sh(cmd, 15)).stdout.trim() || '-'; } catch(e){ return '(unavailable)'; } }
    var kernel = await out('uname -r');
    var arch = await out('uname -m');
    var virt = await out('systemd-detect-virt 2>/dev/null || echo n/a');
    var cpuModel = await out('grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 || grep -m1 "Processor" /proc/cpuinfo 2>/dev/null | cut -d: -f2');
    var cores = await out('nproc 2>/dev/null || grep -c processor /proc/cpuinfo');
    var memTotal = await out('free -h 2>/dev/null | awk \\'NR==2{print $2}\\'');
    var osName = await out('. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"');
    var uptime = await out('uptime -p 2>/dev/null || uptime');
    var loadavg = await out('cat /proc/loadavg');
    el('content').innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">OS</div><div style="font-weight:600;color:#fff">' + esc(osName) + '</div></div>' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Kernel</div><div class="ks-mono" style="font-weight:600;color:#fff">' + esc(kernel) + '</div></div>' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Architecture</div><div class="ks-mono" style="font-weight:600;color:#fff">' + esc(arch) + '</div></div>' +
      '<div class="ks-card"><div class="ks-muted" style="font-size:11px;text-transform:uppercase">Virtualization</div><div class="ks-mono" style="font-weight:600;color:#fff">' + esc(virt) + '</div></div>' +
      '</div>' +
      card('Hardware', '<table>' +
        '<tr><th style="width:150px">CPU model</th><td>' + esc(cpuModel) + '</td></tr>' +
        '<tr><th>CPU cores</th><td>' + esc(cores) + '</td></tr>' +
        '<tr><th>Memory total</th><td>' + esc(memTotal) + '</td></tr>' +
        '</table>') +
      card('Load & uptime', '<table>' +
        '<tr><th style="width:150px">Uptime</th><td>' + esc(uptime.replace(/\\s+/g, ' ')) + '</td></tr>' +
        '<tr><th>Load average</th><td class="ks-mono">' + esc(loadavg) + '</td></tr>' +
        '</table>');
  `,
);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PAGE_STARTERS: PageStarter[] = [
  {
    id: 'overview',
    name: 'Instance Overview',
    slug: 'overview',
    category: 'system',
    description: 'Identity, status, OS/kernel/uptime and ownership — the Home-page equivalent as a custom page.',
    iconSvg: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 8.8V21h14V8.8"/><path d="M9 21v-6h6v6"/>',
    html: OVERVIEW,
    actions: [
      {
        name: 'health_check',
        type: 'shell',
        command: 'echo "== health =="; uptime; echo; df -h / | tail -1; echo; free -m 2>/dev/null | head -2',
        timeout: 15,
        description: 'One-shot health snapshot: uptime, root disk and memory.',
      },
      {
        name: 'who_is_logged_in',
        type: 'shell',
        command: 'who 2>/dev/null || last -n 5 2>/dev/null || echo "(no login tooling)"',
        timeout: 10,
        description: 'List currently logged-in sessions.',
      },
    ],
  },
  {
    id: 'files-browser',
    name: 'File Manager',
    slug: 'files-browser',
    category: 'files',
    description: 'Browse, view/edit, create and delete files & folders anywhere in the instance.',
    iconSvg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    html: FILES_BROWSER,
  },
  {
    id: 'web-console',
    name: 'Console',
    slug: 'console-x',
    category: 'terminal',
    description: 'Exec-based command console with history — runs fresh shells inside the instance.',
    iconSvg: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    html: WEB_CONSOLE,
  },
  {
    id: 'metrics-live',
    name: 'Live Metrics',
    slug: 'metrics-live',
    category: 'monitoring',
    description: 'CPU/memory/disk gauges with a live CPU history chart, polled every 5 seconds.',
    iconSvg: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    html: METRICS_LIVE,
  },
  {
    id: 'process-observer',
    name: 'Processes',
    slug: 'process-observer',
    category: 'monitoring',
    description: 'Live process list with CPU/MEM usage and SIGTERM kill, with optional auto-refresh.',
    iconSvg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',
    html: PROCESS_OBSERVER,
  },
  {
    id: 'network-insight',
    name: 'Network',
    slug: 'network-insight',
    category: 'network',
    description: 'Interfaces, routes, listening sockets, DNS and hosts in one read-only dashboard.',
    iconSvg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
    html: NETWORK_INFO,
  },
  {
    id: 'port-scanner',
    name: 'Ports',
    slug: 'port-scanner',
    category: 'network',
    description: 'Listening/recently-used ports table with live filtering.',
    iconSvg: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
    html: PORT_SCANNER,
  },
  {
    id: 'snapshot-center',
    name: 'Snapshots & Backups',
    slug: 'snapshot-center',
    category: 'backups',
    description: 'Create, restore and delete driver-managed snapshots.',
    iconSvg: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
    html: SNAPSHOT_CENTER,
  },
  {
    id: 'env-vault',
    name: 'Environment Vault',
    slug: 'env-vault',
    category: 'config',
    description: 'Set, reveal and delete instance environment variables & secrets via the panel API.',
    iconSvg: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    html: ENV_VAULT,
  },
  {
    id: 'automation-hub',
    name: 'Automation',
    slug: 'automation-hub',
    category: 'automation',
    description: 'List scheduled jobs with one-click "run now", plus recent run history.',
    iconSvg: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    html: AUTOMATION_HUB,
  },
  {
    id: 'audit-trail',
    name: 'Audit Trail',
    slug: 'audit-trail',
    category: 'security',
    description: 'Per-instance audit timeline with actor, action and detail columns.',
    iconSvg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    html: AUDIT_TRAIL,
  },
  {
    id: 'system-settings',
    name: 'System Settings',
    slug: 'system-settings',
    category: 'system',
    description: 'Read-only overview of hostname, timezone, memory, swappiness and root filesystem.',
    iconSvg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    html: SYSTEM_SETTINGS,
  },
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
        command: "docker ps -a --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'",
        timeout: 20,
        description: 'Table of all containers with image and status.',
      },
      {
        name: 'prune_dangling',
        type: 'docker',
        command: 'image',
        args: ['prune', '--force'],
        timeout: 60,
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
        name: 'failed_units',
        type: 'shell',
        command: 'systemctl list-units --state=failed --no-pager --no-legend 2>/dev/null || echo "(none / unavailable)"',
        timeout: 20,
        description: 'List systemd units in a failed state.',
      },
      {
        name: 'restart_sshd',
        type: 'shell',
        command: 'systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null; echo "exit=$?"',
        timeout: 30,
        description: 'Restart the SSH daemon (sshd or ssh).',
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
        name: 'disk_report',
        type: 'shell',
        command: 'df -h; echo; du -x -d1 -h / 2>/dev/null | sort -rh | head -10',
        timeout: 120,
        description: 'Full filesystem table plus largest top-level directories.',
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
  },
  {
    id: 'user-registry',
    name: 'Users & Groups',
    slug: 'user-registry',
    category: 'administration',
    description: 'Account inventory from /etc/passwd with recent logins.',
    iconSvg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    html: USER_REGISTRY,
  },
  {
    id: 'system-probe',
    name: 'System Info',
    slug: 'system-probe',
    category: 'system',
    description: 'CPU model/cores, memory, kernel, architecture and virtualization detail.',
    iconSvg: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
    html: SYSTEM_PROBE,
  },
];

export default PAGE_STARTERS;


