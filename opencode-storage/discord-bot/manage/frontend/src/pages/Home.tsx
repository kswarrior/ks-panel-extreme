import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Confirm, Modal } from '../components/Modal'

function formatUptime(s: number){
  if(!s) return '—'
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), sec=s%60
  if(d) return `${d}d ${h}h ${m}m`
  if(h) return `${h}h ${m}m ${sec}s`
  if(m) return `${m}m ${sec}s`
  return `${sec}s`
}
function formatBytes(b?: number){
  if(b==null) return '—'
  if(b<1024) return b+' B'
  if(b<1024*1024) return (b/1024).toFixed(1)+' KB'
  return (b/1024/1024).toFixed(1)+' MB'
}

export function Home(){
  const [status, setStatus] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [confirm, setConfirm] = useState<null | 'stop' | 'restart' | 'clear'>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const evRef = useRef<EventSource | null>(null)

  const load = async ()=>{
    const s = await api.status(); setStatus(s)
    const l = await api.logs.get(300); if(l?.lines) setLogs(l.lines)
  }
  useEffect(()=>{ load(); const i=setInterval(load, 5000); return ()=>clearInterval(i)},[])
  useEffect(()=>{
    const es = new EventSource('/api/logs/stream')
    evRef.current = es as any
    es.onmessage = (e)=>{
      try{ const d=JSON.parse(e.data); if(d.line) setLogs(prev=> [...prev.slice(-2000), d.line]) }catch{}
    }
    return ()=> es.close()
  },[])
  useEffect(()=>{ if(autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs, autoScroll])

  const doAction = async (a: string)=>{
    if(a==='stop'){ const r=await api.bot.stop(); await load(); setConfirm(null); }
    if(a==='restart'){ const r=await api.bot.restart(); await load(); setConfirm(null); }
    if(a==='start'){ await api.bot.start(); await load(); }
    if(a==='clear'){ await api.logs.clear(); setLogs([]); setConfirm(null); }
  }

  const running = status?.status === 'running'
  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
        <div>
          <h1 style={{fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>Home</h1>
          <div style={{fontSize:13, color:'var(--text-muted)', marginTop:4}}>Bot overview • control & live logs</div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {!running ? (
            <button className="btn btn-primary" onClick={()=>doAction('start')}>▶ Start</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={()=>setConfirm('restart')}>↻ Restart</button>
              <button className="btn btn-danger" onClick={()=>setConfirm('stop')}>■ Stop</button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card stat">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{display:'flex', alignItems:'center', gap:8, fontSize:18}}>
            <span className={`badge ${running ? 'badge-green':'badge-red'}`}><span style={{width:6,height:6,borderRadius:'50%', background:'currentColor',display:'inline-block'}} />{running ? 'Running' : 'Stopped'}</span>
            {running && <span style={{fontSize:13, color:'var(--text-muted)'}} className="mono">PID {status?.pid}</span>}
          </div>
          <div className="stat-sub">{running ? `Uptime ${formatUptime(status?.uptime)} • Node ${status?.nodeVersion}` : 'Bot is offline'}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Memory</div>
          <div className="stat-value mono">{formatBytes(status?.memory)}</div>
          <div className="stat-sub">RSS • {status?.dbCount ?? 0} DB files • {status?.logLines ?? 0} log lines</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Manager</div>
          <div className="stat-value" style={{fontSize:18}}>● Online</div>
          <div className="stat-sub mono">Uptime {formatUptime(Math.floor(status?.managerUptime||0))} • Port {status?.botDir ? '3000' : '—'}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">⚡ Quick Actions</div>
          </div>
          <div className="card-body" style={{display:'flex', flexDirection:'column', gap:10}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <button className="btn btn-primary" onClick={()=>doAction('start')} disabled={running}>▶ Start Bot</button>
              <button className="btn btn-ghost" onClick={()=>setConfirm('clear')}>🧹 Clear Logs</button>
              <button className="btn btn-ghost" onClick={()=>setConfirm('restart')} disabled={!running}>↻ Restart</button>
              <button className="btn btn-danger" onClick={()=>setConfirm('stop')} disabled={!running}>■ Stop</button>
            </div>
            <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:10, padding:10, fontSize:12, lineHeight:1.5}}>
              <div style={{color:'var(--text-dim)', fontSize:11, letterSpacing:.06, textTransform:'uppercase', fontWeight:600, marginBottom:6}}>Info</div>
              <div className="mono" style={{color:'var(--text-muted)', wordBreak:'break-all'}}>Bot dir: {status?.botDir || '—'}</div>
              <div className="mono" style={{color:'var(--text-muted)'}}>Entry: index.js</div>
              <div style={{marginTop:8, display:'flex', gap:6}}>
                <span className="kbd">HOME</span> <span style={{fontSize:12, color:'var(--text-dim)'}}>you said “later” — add widgets here anytime</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 Bot Info</div>
            <span className="badge badge-blue">v1.0</span>
          </div>
          <div className="card-body" style={{display:'flex', flexDirection:'column', gap:12}}>
            <div style={{display:'flex', gap:10, alignItems:'center'}}>
              <div style={{width:48,height:48, borderRadius:12, background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', display:'grid', placeItems:'center', fontSize:22}}>🤖</div>
              <div>
                <div style={{fontWeight:600}}>KS Bot</div>
                <div style={{fontSize:12, color:'var(--text-muted)'}}>KS Hub • discord.js 14</div>
              </div>
              <div style={{marginLeft:'auto'}}><span className={`badge ${running ? 'badge-green':'badge-gray'}`}>{running ? 'Online' : 'Offline'}</span></div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12}}>
              <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:8, padding:10}}><div style={{color:'var(--text-dim)', fontSize:11, textTransform:'uppercase', letterSpacing:.06}}>Guilds</div><div style={{fontWeight:600, marginTop:4}}>{status?.guilds ?? '—'}</div></div>
              <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:8, padding:10}}><div style={{color:'var(--text-dim)', fontSize:11, textTransform:'uppercase', letterSpacing:.06}}>Commands</div><div style={{fontWeight:600, marginTop:4}}>88</div></div>
            </div>
            <div style={{fontSize:12, color:'var(--text-muted)', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.15)', padding:10, borderRadius:8}}>
              Tip: use <b>Files</b> to edit <span className="mono">.env</span> token, then <b>Restart</b>.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">📝 Live Logs <span className="badge badge-gray" style={{marginLeft:8}}>{logs.length} lines</span></div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted)', cursor:'pointer'}}>
              <input type="checkbox" checked={autoScroll} onChange={e=>setAutoScroll(e.target.checked)} /> Auto-scroll
            </label>
            <button className="btn btn-ghost btn-sm" onClick={()=> api.logs.download()}>⬇ Download</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setConfirm('clear')}>Clear</button>
          </div>
        </div>
        <div className="card-body" style={{padding:12}}>
          <div ref={logRef} className="log-box">
            {logs.length===0 ? <div style={{color:'var(--text-dim)'}}>No logs yet. Start the bot.</div> : logs.map((l,i)=><div key={i} className="line">{l}</div>)}
          </div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
            <button className="btn btn-ghost btn-sm" onClick={async()=>{ const l=await api.logs.get(1000); setLogs(l.lines||[])}}>Load 1000</button>
          </div>
        </div>
      </div>

      <Confirm open={confirm==='stop'} title="Stop bot?" message="This will send SIGTERM to the bot process. You can start it again from Home." confirmText="Stop" danger onConfirm={()=>doAction('stop')} onCancel={()=>setConfirm(null)} />
      <Confirm open={confirm==='restart'} title="Restart bot?" message="Bot will be stopped and started again (2-3s)." confirmText="Restart" onConfirm={()=>doAction('restart')} onCancel={()=>setConfirm(null)} />
      <Confirm open={confirm==='clear'} title="Clear logs?" message="This will truncate bot.log and the in-memory buffer." confirmText="Clear" danger onConfirm={()=>doAction('clear')} onCancel={()=>setConfirm(null)} />
    </div>
  )
}
