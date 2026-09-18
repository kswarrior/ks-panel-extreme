import React from 'react'

export function Header({ sidebarOpen, setSidebarOpen, status }: { sidebarOpen: boolean, setSidebarOpen: (v:boolean)=>void, status: any }){
  const running = status?.status === 'running'
  return (
    <header className="header">
      <div className="header-left">
        <button className={`hamburger ${sidebarOpen ? 'active':''}`} onClick={()=>setSidebarOpen(!sidebarOpen)} aria-label="menu">
          <span />
        </button>
        <div className="logo">
          <div className="logo-icon">🤖</div>
          <div className="logo-text">KS <span>Manager</span></div>
        </div>
      </div>
      <div className="header-right">
        <div className="header-status">
          <div className={`status-dot ${running ? '' : 'stopped'}`} />
          <span>{running ? `Running • PID ${status?.pid}` : 'Stopped'}</span>
        </div>
      </div>
    </header>
  )
}
