import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Confirm, Modal } from '../components/Modal'

type Entry = { name:string, path:string, isDirectory:boolean, size:number, mtime:number, mtimeIso:string, ext:string }

export function Files(){
  const [path, setPath]=useState('')
  const [entries, setEntries]=useState<Entry[]>([])
  const [loading, setLoading]=useState(false)
  const [selected, setSelected]=useState<string | null>(null)
  const [editPath, setEditPath]=useState<string | null>(null)
  const [editContent, setEditContent]=useState('')
  const [editLoading, setEditLoading]=useState(false)
  const [showNew, setShowNew]=useState<null | 'file' | 'folder'>(null)
  const [newName, setNewName]=useState('')
  const [showRename, setShowRename]=useState<string | null>(null)
  const [renameVal, setRenameVal]=useState('')
  const [confirmDel, setConfirmDel]=useState<string | null>(null)
  const [dragOver, setDragOver]=useState(false)
  const [filter, setFilter]=useState('')
  const [showGit, setShowGit]=useState(false)
  const [gitUrl, setGitUrl]=useState('https://github.com/kswarrior/ks-panel-extreme/')
  const [gitBranch, setGitBranch]=useState('')
  const [gitSubPath, setGitSubPath]=useState('opencode-storage/discord-bot')
  const [gitFileRoot, setGitFileRoot]=useState('./')
  const [gitLoading, setGitLoading]=useState(false)
  const [gitLogs, setGitLogs]=useState<string[]>([])
  const [gitDone, setGitDone]=useState(false)

  const load = async (p=path)=>{
    setLoading(true)
    const r=await api.files.list(p)
    if(r?.ok){ setEntries(r.entries||[]); setPath(r.path||p) } else if(r?.isFile){ // clicked file
    }
    setLoading(false)
  }
  useEffect(()=>{ load('') },[])

  const navigate = (p: string)=>{
    setSelected(null)
    load(p)
  }
  const breadcrumbs = ()=>{
    const parts = path === '.' || path==='' ? [] : path.split('/').filter(Boolean)
    return (
      <div className="breadcrumb">
        <a onClick={()=>navigate('')}>bot</a>
        {parts.map((part, i)=>{
          const p = parts.slice(0,i+1).join('/')
          return <React.Fragment key={p}><span className="sep">/</span><a onClick={()=>navigate(p)}>{part}</a></React.Fragment>
        })}
      </div>
    )
  }

  const openFile = async (e: Entry)=>{
    if(e.isDirectory){ navigate(e.path) ; return }
    setSelected(e.path)
    // if too large show download
    const r = await api.files.read(e.path)
    if(r?.ok){ setEditPath(e.path); setEditContent(r.content) }
    else { alert(r?.message || 'Cannot open') }
  }

  const saveFile = async ()=>{
    if(!editPath) return
    setEditLoading(true)
    const r=await api.files.write(editPath, editContent)
    setEditLoading(false)
    if(r?.ok){ setEditPath(null); load(path) } else alert(r?.message||'Save failed')
  }

  const createNew = async ()=>{
    if(!newName.trim()) return
    const target = (path === '.' || path==='' ? '' : path+'/') + newName.trim()
    const r = await api.files.create(target, showNew==='folder')
    if(r?.ok){ setShowNew(null); setNewName(''); load(path) } else alert(r?.message||'Create failed')
  }

  const doRename = async ()=>{
    if(!showRename || !renameVal.trim()) return
    const dir = showRename.includes('/') ? showRename.split('/').slice(0,-1).join('/') : ''
    const to = (dir ? dir+'/' : '') + renameVal.trim()
    const r=await api.files.rename(showRename, to)
    if(r?.ok){ setShowRename(null); setRenameVal(''); load(path) } else alert(r?.message||'Rename failed')
  }

  const doDelete = async ()=>{
    if(!confirmDel) return
    const r=await api.files.del(confirmDel)
    if(r?.ok){ setConfirmDel(null); setSelected(null); if(editPath===confirmDel) setEditPath(null); load(path) } else alert(r?.message||'Delete failed')
  }

  const handleUpload = async (files: FileList)=>{
    const r = await api.files.upload(path, files)
    if(r?.ok) load(path); else alert(r?.message||'Upload failed')
  }

  const doGitUpdate = async ()=>{
    if(!gitUrl.trim()) return
    setGitLoading(true); setGitLogs([]); setGitDone(false)
    try{
      const r:any = await api.git.update(gitUrl.trim(), gitBranch.trim(), gitSubPath.trim(), gitFileRoot.trim(), true)
      setGitLogs(r?.logs || [])
      setGitDone(true)
      if(r?.ok){
        // reload files
        setTimeout(()=> load(''), 500)
      } else {
        // keep modal open to show logs
      }
    } catch(e:any){
      setGitLogs([String(e)])
    }
    setGitLoading(false)
  }

  const filtered = entries.filter(e=> !filter || e.name.toLowerCase().includes(filter.toLowerCase()))

  const iconFor = (e: Entry)=>{
    if(e.isDirectory) return '📁'
    if(e.ext==='.js') return '🟨'
    if(e.ext==='.json') return '🟩'
    if(e.ext==='.db' || e.ext==='.sqlite') return '🗄️'
    if(['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(e.ext)) return '🖼️'
    if(['.env','.log','.txt','.md'].includes(e.ext)) return '📄'
    return '📄'
  }
  const classFor = (e: Entry)=>{
    if(e.isDirectory) return 'dir'
    if(e.ext==='.js') return 'js'
    if(e.ext==='.json') return 'json'
    return 'file'
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12}}>
        <div>
          <h1 style={{fontSize:20, fontWeight:700}}>Files</h1>
          <div style={{fontSize:13, color:'var(--text-muted)', marginTop:4}}>Manage <span className="mono">./bot</span> • edit • upload • download</div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowNew('file')}>＋ File</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowNew('folder')}>＋ Folder</button>
          <button className="btn btn-ghost btn-sm" style={{borderColor:'rgba(59,130,246,.35)', color:'#60a5fa', background:'rgba(59,130,246,.12)'}} onClick={()=>setShowGit(true)}>⟳ Git Update</button>
          <label className="btn btn-primary btn-sm" style={{cursor:'pointer'}}>
            ⬆ Upload <input type="file" multiple style={{display:'none'}} onChange={e=> e.target.files && handleUpload(e.target.files)} />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{flexWrap:'wrap'}}>
          {breadcrumbs()}
          <div style={{display:'flex', gap:8, alignItems:'center', marginLeft:'auto'}}>
            <input className="input" placeholder="filter" value={filter} onChange={e=>setFilter(e.target.value)} style={{width:160, padding:'7px 10px'}} />
            <button className="btn btn-ghost btn-sm" onClick={()=>load(path)}>↻</button>
          </div>
        </div>

        <div
          onDragOver={e=>{e.preventDefault(); setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{ e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length) handleUpload(e.dataTransfer.files)}}
          style={{position:'relative'}}
        >
          {dragOver && <div style={{position:'absolute', inset:0, background:'rgba(59,130,246,.12)', border:'2px dashed #3b82f6', borderRadius:10, display:'grid', placeItems:'center', zIndex:5, fontWeight:600, color:'#60a5fa'}}>Drop files to upload</div>}
          <div style={{maxHeight: 520, overflow:'auto'}}>
            {loading ? <div style={{padding:20, textAlign:'center', color:'var(--text-dim)'}}>Loading…</div> : filtered.length===0 ? <div style={{padding:24, textAlign:'center', color:'var(--text-dim)'}}>Empty • drag & drop to upload</div> :
              filtered.map(e=>(
                <div key={e.path} className={`file-row ${selected===e.path?'selected':''}`} onClick={()=> { setSelected(e.path); } } onDoubleClick={()=> openFile(e)}>
                  <div className={`file-icon ${classFor(e)}`}>{iconFor(e)}</div>
                  <div className="file-info" onDoubleClick={()=>openFile(e)} style={{cursor:'pointer'}}>
                    <div className="file-name">{e.name} {e.isDirectory && <span style={{color:'var(--text-dim)', fontWeight:400}}>—</span>}</div>
                    <div className="file-meta"><span className="mono">{e.isDirectory ? 'folder' : (e.size<1024 ? e.size+' B' : e.size<1024*1024 ? (e.size/1024).toFixed(1)+' KB' : (e.size/1024/1024).toFixed(2)+' MB')}</span> <span>{new Date(e.mtime).toLocaleString()}</span></div>
                  </div>
                  <div style={{display:'flex', gap:6, flexShrink:0}}>
                    {!e.isDirectory && <button className="btn btn-ghost btn-sm" onClick={()=>openFile(e)}>Edit</button>}
                    {e.isDirectory ? <button className="btn btn-ghost btn-sm" onClick={()=>navigate(e.path)}>Open</button> : <button className="btn btn-ghost btn-sm" onClick={()=>api.files.download(e.path)}>⬇</button>}
                    <button className="btn btn-ghost btn-sm" onClick={()=>{ setShowRename(e.path); setRenameVal(e.name) }}>✎</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'#ef4444', borderColor:'rgba(239,68,68,.2)'}} onClick={()=>setConfirmDel(e.path)}>🗑</button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div style={{padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', fontSize:12, color:'var(--text-dim)'}}>
          <span>{filtered.length} items • <span className="mono">{path || '/'}</span></span>
          <span style={{marginLeft:'auto'}}>Double-click to open • drag & drop to upload</span>
        </div>
      </div>

      {editPath && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">✎ Editing <span className="mono" style={{color:'#60a5fa'}}>{editPath}</span></div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setEditPath(null)}>Close</button>
              <button className="btn btn-primary btn-sm" onClick={saveFile} disabled={editLoading}>{editLoading ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
          <div className="editor-wrap">
            <div className="editor-toolbar">
              <span style={{fontSize:12, color:'var(--text-muted)'}} className="mono">{editPath} • {(editContent.length/1024).toFixed(2)} KB • {editContent.split('\n').length} lines</span>
              <div style={{marginLeft:'auto', display:'flex', gap:6}}>
                <button className="btn btn-ghost btn-sm" onClick={()=> api.files.download(editPath!)}>⬇ Download</button>
                <button className="btn btn-ghost btn-sm" onClick={()=> { navigator.clipboard.writeText(editContent) }}>Copy</button>
              </div>
            </div>
            <textarea className="editor-area" value={editContent} onChange={e=>setEditContent(e.target.value)} spellCheck={false} />
          </div>
        </div>
      )}

      <Modal open={!!showNew} title={showNew==='folder' ? 'New Folder' : 'New File'} onClose={()=>setShowNew(null)} footer={
        <>
          <button className="btn btn-ghost" onClick={()=>setShowNew(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={createNew}>Create</button>
        </>
      }>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <div style={{fontSize:13, color:'var(--text-muted)'}}>In <span className="mono">{path || '/'}</span></div>
          <input className="input" placeholder={showNew==='folder' ? 'folder-name' : 'file-name.js'} value={newName} onChange={e=>setNewName(e.target.value)} autoFocus onKeyDown={e=> e.key==='Enter' && createNew()} />
        </div>
      </Modal>

      <Modal open={!!showRename} title="Rename" onClose={()=>setShowRename(null)} footer={
        <>
          <button className="btn btn-ghost" onClick={()=>setShowRename(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={doRename}>Rename</button>
        </>
      }>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <div style={{fontSize:12, color:'var(--text-dim)'}} className="mono">{showRename}</div>
          <input className="input" value={renameVal} onChange={e=>setRenameVal(e.target.value)} autoFocus onKeyDown={e=> e.key==='Enter' && doRename()} />
        </div>
      </Modal>

      <Confirm open={!!confirmDel} title="Delete?" message={`Delete "${confirmDel}" ? This cannot be undone. Folders are deleted recursively.`} confirmText="Delete" danger onConfirm={doDelete} onCancel={()=>setConfirmDel(null)} />

      <Modal open={showGit} title="Git Update" onClose={()=> !gitLoading && setShowGit(false)} width={560} footer={
        <>
          <button className="btn btn-ghost" onClick={()=> setShowGit(false)} disabled={gitLoading}>Close</button>
          <button className="btn btn-primary" onClick={doGitUpdate} disabled={gitLoading || !gitUrl.trim()}>
            {gitLoading ? 'Updating…' : gitDone ? 'Update Again' : 'Delete All & Download'}
          </button>
        </>
      }>
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10, padding:10, fontSize:12, lineHeight:1.5}}>
            <div style={{fontWeight:600, color:'#f87171'}}>⚠️ This will delete all files in <span className="mono" style={{background:'#1e293b', padding:'2px 6px', borderRadius:6, color:'#60a5fa'}}>./</span> (bot folder) and re-download from git.</div>
            <div style={{color:'var(--text-muted)', marginTop:4}}><span className="mono">.env</span> and <span className="mono">data/</span> are auto-backed up & restored.</div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <label style={{fontSize:12, fontWeight:600, color:'var(--text-muted)'}}>Git URL <span style={{color:'var(--text-dim)', fontWeight:400}}>(default)</span></label>
            <input className="input mono" value={gitUrl} onChange={e=>setGitUrl(e.target.value)} placeholder="https://github.com/kswarrior/ks-panel-extreme/" style={{fontSize:12}} />
            <div style={{fontSize:11, color:'var(--text-dim)'}}>Default: <span className="mono" style={{color:'#60a5fa'}}>https://github.com/kswarrior/ks-panel-extreme/</span> — ask on click (editable)</div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <label style={{fontSize:12, fontWeight:600, color:'var(--text-muted)'}}>Branch <span style={{fontWeight:400, color:'var(--text-dim)'}}>(empty = default)</span></label>
              <input className="input mono" value={gitBranch} onChange={e=>setGitBranch(e.target.value)} placeholder="main" style={{fontSize:12}} />
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <label style={{fontSize:12, fontWeight:600, color:'var(--text-muted)'}}>File Root</label>
              <input className="input mono" value={gitFileRoot} onChange={e=>setGitFileRoot(e.target.value)} style={{fontSize:12}} />
              <div style={{fontSize:10, color:'var(--text-dim)'}}>default <span className="mono">./</span> = bot folder</div>
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            <label style={{fontSize:12, fontWeight:600, color:'var(--text-muted)'}}>Root Path <span style={{fontWeight:400, color:'var(--text-dim)'}}>(inside repo)</span></label>
            <input className="input mono" value={gitSubPath} onChange={e=>setGitSubPath(e.target.value)} placeholder="opencode-storage/discord-bot" style={{fontSize:12}} />
            <div style={{fontSize:11, color:'var(--text-dim)'}}>Repo path: <span className="mono">opencode-storage/discord-bot</span> → maps <span className="mono">./</span> to <span className="mono">bot/</span> automatically</div>
          </div>

          <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:10, padding:10, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            <div style={{fontSize:12}}>
              <div style={{fontWeight:600}}>Target: <span className="mono" style={{color:'#60a5fa'}}>{gitFileRoot || './'}</span> → <span className="mono">{gitFileRoot === './' ? 'BOT_DIR (./bot)' : gitFileRoot}</span></div>
              <div style={{fontSize:11, color:'var(--text-dim)', marginTop:2}}>Will <b>delete all</b> then <b>git clone --depth 1</b> + copy + <b>npm install</b></div>
            </div>
            <div style={{marginLeft:'auto', display:'flex', gap:6}}>
              <span className="badge badge-blue">git</span>
              <span className="badge badge-gray">deleteAll</span>
            </div>
          </div>

          {gitLogs.length>0 && (
            <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:10, padding:10, maxHeight:200, overflow:'auto'}}>
              <div style={{fontSize:11, fontWeight:600, color:'var(--text-muted)', marginBottom:6}}>{gitDone ? '✓ Done' : '… Logs'}</div>
              <div className="mono" style={{fontSize:11, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-all', color:'var(--text-muted)'}}>
                {gitLogs.join('\n')}
              </div>
            </div>
          )}
          {gitDone && <div style={{background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)', borderRadius:8, padding:8, fontSize:12, color:'#4ade80'}}>Done! Check logs, then Home → Restart bot. <span className="mono" style={{color:'var(--text-muted)'}}>data/.env preserved</span></div>}
        </div>
      </Modal>
    </div>
  )
}
