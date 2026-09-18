import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Home } from './pages/Home'
import { Files } from './pages/Files'
import { Database } from './pages/Database'
import { api } from './api'

export default function App(){
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 900)
  const [status, setStatus] = useState<any>(null)

  useEffect(()=>{
    const onResize = ()=>{ if(window.innerWidth >= 900) setSidebarOpen(true); else setSidebarOpen(false) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])
  useEffect(()=>{
    api.status().then(setStatus).catch(()=>{})
    const i=setInterval(()=> api.status().then(setStatus).catch(()=>{}), 5000)
    return ()=>clearInterval(i)
  },[])

  return (
    <BrowserRouter>
      <div className="app">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} status={status} />
        <Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} />
        <main className="main" style={{ marginLeft: window.innerWidth >=900 ? '240px' : '0' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/files" element={<Files />} />
            <Route path="/database" element={<Database />} />
          </Routes>
          <div style={{marginTop:24, padding:'12px 0', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-dim)', display:'flex', gap:12, flexWrap:'wrap'}}>
            <span className="mono">KS Bot Manager • dark+blue • React+TS • self-contained modals (no browser confirm)</span>
            <span style={{marginLeft:'auto'}}>© KS Warrior</span>
          </div>
        </main>
      </div>
    </BrowserRouter>
  )
}
