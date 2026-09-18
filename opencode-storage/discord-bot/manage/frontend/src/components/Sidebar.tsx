import React from 'react'
import { NavLink } from 'react-router-dom'

export function Sidebar({ open, onClose }: { open: boolean, onClose: ()=>void }){
  const closeMobile = () => { if(window.innerWidth < 900) onClose() }
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} style={{display: window.innerWidth < 900 ? 'block':'none'}} />}
      <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
        <NavLink to="/" className={({isActive})=> `nav-item ${isActive ? 'active':''}`} onClick={closeMobile}>
          <span className="icon">🏠</span> Home
        </NavLink>
        <NavLink to="/files" className={({isActive})=> `nav-item ${isActive ? 'active':''}`} onClick={closeMobile}>
          <span className="icon">📁</span> Files
        </NavLink>
        <NavLink to="/database" className={({isActive})=> `nav-item ${isActive ? 'active':''}`} onClick={closeMobile}>
          <span className="icon">🗄️</span> Database
        </NavLink>

        <div className="nav-section">
          <div className="nav-label">Bot</div>
          <div className="nav-item" style={{cursor:'default', opacity:.7}}><span className="icon">⚙️</span> Settings</div>
          <a href="/api/status" target="_blank" className="nav-item"><span className="icon">🔗</span> API Status</a>
        </div>

        <div style={{marginTop:'auto', padding:'12px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.15)', borderRadius:10}}>
          <div style={{fontSize:12, fontWeight:600, color:'#60a5fa'}}>KS Hub</div>
          <div style={{fontSize:11, color:'var(--text-dim)', marginTop:4}}>Manager v1.0 • Dark + Blue</div>
          <div style={{fontSize:11, color:'var(--text-dim)', marginTop:6}} className="mono">by KS Warrior</div>
        </div>
      </aside>
    </>
  )
}
