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
    </div>
  )
}
