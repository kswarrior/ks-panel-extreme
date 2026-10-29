import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOverview } from '../context/OverviewContext';
import { usePanels } from '../context/PanelsContext';
import LoginModal from './LoginModal';
import {
  LogoutIcon,
  MapIcon,
  MenuIcon,
  OverviewIcon,
  RefreshIcon,
  TableIcon,
} from './icons';

const NAV = [
  { to: '/overview', label: 'Overview', icon: OverviewIcon, admin: false },
  { to: '/map', label: 'Map', icon: MapIcon, admin: true },
  { to: '/table', label: 'Table', icon: TableIcon, admin: true },
];

interface LoginRedirectState {
  login?: boolean;
  from?: string;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, username, logout } = useAuth();
  const { error: overviewError, refresh: refreshOverview } = useOverview();
  const { error: panelsError, refresh: refreshPanels } = usePanels();
  const state = location.state as LoginRedirectState | null;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (state?.login) setLoginOpen(true);
  }, [state?.login]);

  function refreshAll() {
    refreshOverview();
    if (isAdmin) refreshPanels();
  }

  function closeLogin() {
    setLoginOpen(false);
    if (state?.login) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }

  function handleLoginSuccess() {
    setLoginOpen(false);
    navigate(state?.from || location.pathname, { replace: true, state: null });
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/overview', { replace: true });
    }
  }

  const toast = panelsError || overviewError;

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
          <span className="brand-text">
            <span className="brand-title">KS Panel</span>
            <span className="brand-sub">Fleet Stats</span>
          </span>
        </div>
        <div className="spacer" />
        <button className="iconbtn" title="refresh" aria-label="refresh" onClick={refreshAll}>
          <RefreshIcon width={18} height={18} />
        </button>
        {isAdmin ? (
          <>
            <span className="user-chip" title={`Signed in as ${username}`}>
              {username}
            </span>
            <button
              className="iconbtn"
              title="logout"
              aria-label="logout"
              onClick={handleLogout}
            >
              <LogoutIcon width={18} height={18} />
            </button>
          </>
        ) : (
          <button className="login-btn" onClick={() => setLoginOpen(true)}>
            Login
          </button>
        )}
      </header>
      <div className="layout">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="navigation">
          <nav className="nav">
            {NAV.filter((item) => !item.admin || isAdmin).map(({ to, label, icon: NavIcon }) => (
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
      {toast ? (
        <div className="toast show" role="status">
          load failed: {toast}
        </div>
      ) : null}
      <LoginModal open={loginOpen} onClose={closeLogin} onSuccess={handleLoginSuccess} />
    </>
  );
}
