import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePanels } from '../context/PanelsContext';
import {
  LogoutIcon,
  MapIcon,
  MenuIcon,
  OverviewIcon,
  RefreshIcon,
  TableIcon,
} from './icons';

const NAV = [
  { to: '/overview', label: 'Overview', icon: OverviewIcon },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/table', label: 'Table', icon: TableIcon },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date().toLocaleString());
  const location = useLocation();
  const { panels, lastUpdated, error, refresh } = usePanels();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleString());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const online = panels.filter((panel) => panel.online).length;

  async function logout() {
    try {
      await fetch('/logout', { method: 'GET' });
    } catch {
      // session is gone either way; fall through to the login page
    }
    window.location.assign('/login');
  }

  return (
    <>
      <header className="topbar">
        <button
          className="hamburger"
          aria-label="menu"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <MenuIcon />
        </button>
        <div className="brand">
          <span className="logo">KS</span>
          <span>KS Panel — Fleet Stats</span>
        </div>
        <div className="spacer" />
        <span className="clock">{clock}</span>
        <button className="iconbtn" title="logout" aria-label="logout" onClick={logout}>
          <LogoutIcon width={18} height={18} />
        </button>
      </header>
      <div className="layout">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="navigation">
          <div className="side-head">Navigation</div>
          <nav className="nav">
            {NAV.map(({ to, label, icon: NavIcon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                <NavIcon />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <div className="hint">Owner only • WSS heartbeat 30s • online if seen &lt;90s</div>
            <button className="btn" onClick={refresh}>
              <RefreshIcon />
              Refresh
            </button>
            <div className="hint">
              <b>{panels.length}</b> panels • <b>{online}</b> online
              <br />
              <span className="small">
                updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
        </aside>
        <div
          className={`overlay${sidebarOpen ? ' show' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <main className="main">
          <Suspense fallback={<div className="page-loader">Loading page…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {error ? (
        <div className="toast show" role="status">
          load failed: {error}
        </div>
      ) : null}
    </>
  );
}
