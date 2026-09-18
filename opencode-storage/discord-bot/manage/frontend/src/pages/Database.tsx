import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Modal } from '../components/Modal'

type DbFile = { name:string, path:string, size:number, mtime:number }
type Table = { name:string, type:string, sql:string, count:number }

export function Database(){
  const [dbs, setDbs]=useState<DbFile[]>([])
  const [selectedDb, setSelectedDb]=useState<string>('')
  const [tables, setTables]=useState<Table[]>([])
  const [selectedTable, setSelectedTable]=useState<string>('')
  const [schema, setSchema]=useState<any[]>([])
  const [createSql, setCreateSql]=useState<string>('')
  const [rows, setRows]=useState<any[]>([])
  const [columns, setColumns]=useState<any[]>([])
  const [total, setTotal]=useState(0)
  const [page, setPage]=useState(1)
  const [limit, setLimit]=useState(50)
  const [search, setSearch]=useState('')
  const [totalPages, setTotalPages]=useState(1)
  const [sql, setSql]=useState('')
  const [sqlResult, setSqlResult]=useState<any>(null)
  const [showSql, setShowSql]=useState(false)
  const [loading, setLoading]=useState(false)

  const loadDbs = async ()=>{
    const r=await api.db.list()
    if(r?.ok){ setDbs(r.dbs); if(r.dbs.length && !selectedDb) { setSelectedDb(r.dbs[0].path); } }
  }
  const loadTables = async (db:string)=>{
    const r=await api.db.tables(db)
    if(r?.ok){ setTables(r.tables); if(r.tables.length) { const first=r.tables[0].name; setSelectedTable(first); } else { setSelectedTable(''); setRows([]) } }
  }
  const loadRows = async (db:string, table:string, p=page, s=search)=>{
    if(!db||!table) return
    setLoading(true)
    const r=await api.db.rows(db, table, p, limit, s)
    if(r?.ok){ setRows(r.rows); setColumns(r.columns||[]); setTotal(r.total); setTotalPages(r.totalPages); setPage(r.page) }
    else { setRows([]) }
    setLoading(false)
  }
  const loadSchema = async (db:string, table:string)=>{
    const r=await api.db.schema(db, table)
    if(r?.ok){ setSchema(r.columns||[]); setCreateSql(r.createSql||'') }
  }

  useEffect(()=>{ loadDbs() },[])
  useEffect(()=>{ if(selectedDb) loadTables(selectedDb) },[selectedDb])
  useEffect(()=>{
    if(selectedDb && selectedTable){ loadRows(selectedDb, selectedTable, 1, ''); loadSchema(selectedDb, selectedTable); setSearch(''); setPage(1) }
  },[selectedTable, selectedDb, limit])
  // search debounce
  useEffect(()=>{
    if(!selectedDb||!selectedTable) return
    const t=setTimeout(()=> loadRows(selectedDb, selectedTable, 1, search), 400)
    return ()=>clearTimeout(t)
  },[search])

  const runSql = async ()=>{
    if(!sql.trim()) return
    const r=await api.db.query(selectedDb, sql)
    setSqlResult(r)
  }

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div>
        <h1 style={{fontSize:20, fontWeight:700}}>Database</h1>
        <div style={{fontSize:13, color:'var(--text-muted)', marginTop:4}}>SQLite viewer • tables • browse & query • <span className="mono">{dbs.length} DB files</span></div>
      </div>

      <div className="grid" style={{gridTemplateColumns:'280px 1fr', gap:16}}>
        <div className="card" style={{height:'fit-content', position:'sticky', top:16}}>
          <div className="card-header"><div className="card-title">🗄️ Databases</div><button className="btn btn-ghost btn-sm" onClick={loadDbs}>↻</button></div>
          <div style={{padding:8, display:'flex', flexDirection:'column', gap:6, maxHeight:360, overflow:'auto'}}>
            {dbs.length===0 ? <div style={{padding:12, textAlign:'center', color:'var(--text-dim)', fontSize:12}}>No .db files in bot/data</div> :
              dbs.map(db=>(
                <div key={db.path} onClick={()=>setSelectedDb(db.path)} style={{padding:'10px 12px', borderRadius:10, cursor:'pointer', border:'1px solid', borderColor: selectedDb===db.path ? 'rgba(59,130,246,.35)' : 'transparent', background: selectedDb===db.path ? 'rgba(59,130,246,.12)':'transparent', display:'flex', flexDirection:'column', gap:4}}>
                  <div style={{fontSize:13, fontWeight:600, wordBreak:'break-all'}} className="mono">{db.path}</div>
                  <div style={{fontSize:11, color:'var(--text-dim)'}}>{(db.size/1024).toFixed(1)} KB • {new Date(db.mtime).toLocaleDateString()}</div>
                </div>
              ))
            }
          </div>

          <div style={{borderTop:'1px solid var(--border)', padding:8}}>
            <div style={{fontSize:11, letterSpacing:.06, textTransform:'uppercase', color:'var(--text-dim)', fontWeight:600, padding:'6px 8px'}}>Tables {tables.length ? `(${tables.length})` : ''}</div>
            <div style={{display:'flex', flexDirection:'column', gap:4, maxHeight:420, overflow:'auto'}}>
              {tables.map(t=>(
                <div key={t.name} onClick={()=>setSelectedTable(t.name)} style={{padding:'8px 10px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', background: selectedTable===t.name ? '#1e293b' : 'transparent', borderLeft: selectedTable===t.name ? '2px solid #3b82f6' : '2px solid transparent'}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{t.name}</div>
                    <div style={{fontSize:11, color:'var(--text-dim)'}}>{t.count ?? '?'} rows • {t.type}</div>
                  </div>
                  <span className="badge badge-gray" style={{fontSize:10}}>{t.count ?? '—'}</span>
                </div>
              ))}
              {tables.length===0 && <div style={{padding:10, color:'var(--text-dim)', fontSize:12, textAlign:'center'}}>No tables</div>}
            </div>
          </div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:16, minWidth:0}}>
          {selectedTable ? (
            <>
              <div className="card">
                <div className="card-header" style={{flexWrap:'wrap'}}>
                  <div>
                    <div className="card-title">📋 {selectedTable} <span className="badge badge-blue" style={{marginLeft:8}}>{total} rows</span></div>
                    <div style={{fontSize:11, color:'var(--text-dim)', marginTop:4}} className="mono">{selectedDb} • {columns.length} cols</div>
                  </div>
                  <div style={{display:'flex', gap:8, alignItems:'center'}}>
                    <input className="input" placeholder="Search all columns…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:180}} />
                    <select className="select" value={limit} onChange={e=>setLimit(parseInt(e.target.value))} style={{width:90}}>
                      <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div style={{padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'#020617', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                  <div style={{fontSize:11, color:'var(--text-dim)', fontWeight:600, letterSpacing:.06, textTransform:'uppercase'}}>Schema</div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                    {schema.map((c:any)=><span key={c.name} className="badge badge-gray" style={{fontSize:11}}>{c.name} <span style={{opacity:.6}}>{c.type}{c.pk ? ' PK':''}</span></span>)}
                  </div>
                </div>

                <div className="table-wrap" style={{maxHeight: 520, overflow:'auto'}}>
                  {loading ? <div style={{padding:20, textAlign:'center', color:'var(--text-dim)'}}>Loading…</div> :
                    rows.length===0 ? <div style={{padding:20, textAlign:'center', color:'var(--text-dim)'}}>No rows {search && `for "${search}"`}</div> :
                    <table className="table">
                      <thead><tr>{columns.map((c:any)=><th key={c.name}>{c.name}</th>)}</tr></thead>
                      <tbody>
                        {rows.map((r,i)=>(
                          <tr key={i}>
                            {columns.map((c:any)=>{
                              const v = r[c.name]
                              let display = v
                              if(v==null) display = <span style={{color:'#64748b', fontStyle:'italic'}}>NULL</span>
                              else if(typeof v==='string' && v.length>120) display = v.slice(0,120)+' …'
                              else if(typeof v==='object') display = JSON.stringify(v)
                              return <td key={c.name} className="mono" style={{fontSize:12, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={String(v??'')}>{display as any}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                </div>

                <div style={{padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, borderTop:'1px solid var(--border)'}}>
                  <div style={{fontSize:12, color:'var(--text-dim)'}}>Page {page} / {totalPages} • {total} total</div>
                  <div className="pagination">
                    <button className="page-btn" disabled={page<=1} onClick={()=>loadRows(selectedDb, selectedTable, 1, search)}>«</button>
                    <button className="page-btn" disabled={page<=1} onClick={()=>loadRows(selectedDb, selectedTable, page-1, search)}>‹</button>
                    {Array.from({length: Math.min(5, totalPages)}, (_,i)=>{
                      const p = Math.max(1, Math.min(totalPages-4, page-2)) + i
                      if(p>totalPages) return null
                      return <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={()=>loadRows(selectedDb, selectedTable, p, search)}>{p}</button>
                    })}
                    <button className="page-btn" disabled={page>=totalPages} onClick={()=>loadRows(selectedDb, selectedTable, page+1, search)}>›</button>
                    <button className="page-btn" disabled={page>=totalPages} onClick={()=>loadRows(selectedDb, selectedTable, totalPages, search)}>»</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">🧩 SQL Playground <span className="badge badge-gray" style={{marginLeft:8}}>SELECT safe, writes allowed</span></div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setShowSql(!showSql)}>{showSql ? 'Hide' : 'Show'} create</button>
                </div>
                <div className="card-body" style={{display:'flex', flexDirection:'column', gap:12}}>
                  {showSql && <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:8, padding:12, fontFamily:'JetBrains Mono', fontSize:11, whiteSpace:'pre-wrap', wordBreak:'break-all', color:'var(--text-muted)'}}>{createSql || '—'}</div>}
                  <div style={{display:'flex', gap:8}}>
                    <textarea className="textarea" placeholder={`SELECT * FROM "${selectedTable}" LIMIT 10;`} value={sql} onChange={e=>setSql(e.target.value)} style={{minHeight:80}} />
                  </div>
                  <div style={{display:'flex', gap:8}}>
                    <button className="btn btn-primary btn-sm" onClick={runSql}>▶ Run</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setSql(`SELECT * FROM "${selectedTable}" LIMIT 20`)}>Fill SELECT</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setSql(`SELECT count(*) FROM "${selectedTable}"`)}>Count</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>{setSql(''); setSqlResult(null)}}>Clear</button>
                    <div style={{marginLeft:'auto', fontSize:11, color:'var(--text-dim)'}} className="mono">DB: {selectedDb}</div>
                  </div>
                  {sqlResult && (
                    <div style={{background:'#020617', border:'1px solid var(--border)', borderRadius:10, padding:12, overflow:'auto', maxHeight:300}}>
                      {sqlResult.ok ? (
                        sqlResult.isSelect ? (
                          sqlResult.rows?.length ? (
                            <table className="table"><thead><tr>{Object.keys(sqlResult.rows[0]||{}).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{sqlResult.rows.map((r:any,i:number)=><tr key={i}>{Object.values(r).map((v:any, j:number)=><td key={j} className="mono" style={{fontSize:12}}>{v==null ? <i style={{color:'#64748b'}}>NULL</i> : String(v).slice(0,200)}</td>)}</tr>)}</tbody></table>
                          ) : <div style={{color:'var(--text-dim)', fontSize:12}}>No rows</div>
                        ) : <div style={{fontSize:13, color:'#22c55e'}}>OK • changes: {sqlResult.info?.changes ?? '?'} • lastInsertRowid: {String(sqlResult.info?.lastInsertRowid ?? '—')}</div>
                      ) : <div style={{color:'#ef4444', fontSize:13}}>{sqlResult.message}</div>}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{padding:40, textAlign:'center'}}>
              <div style={{fontSize:32, marginBottom:12}}>🗄️</div>
              <div style={{fontWeight:600}}>Select a database & table</div>
              <div style={{fontSize:13, color:'var(--text-muted)', marginTop:6}}>Pick a <span className="mono">.db</span> from left, then a table to browse.</div>
            </div>
          )}
        </div>
      </div>

      <style>{`@media(max-width: 900px){ .grid[style*="280px"]{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
