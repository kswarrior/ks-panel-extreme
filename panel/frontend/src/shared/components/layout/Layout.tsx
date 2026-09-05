import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import InstancePowerBar from '@/features/instances/components/InstancePowerBar';
import InstanceInfoBar from '@/features/instances/components/InstanceInfoBar';

const Layout: React.FC = () => {
  const location = useLocation();
  const hideLayout = location.pathname.startsWith('/auth');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const inInstancePanel = useMemo(() => {
    return /^\/instances\/\d+/.test(location.pathname);
  }, [location.pathname]);

  // Power dock auto-off lives inside InstancePowerBar itself: scroll /
  // outside-click collapses < to > (never invisible), idle / hover / `>`
  // click expands back. Layout just positions the floating dock.

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (hideLayout) {
    return (
      <ErrorBoundary resetKey={location.pathname} label="auth">
        <Outlet />
      </ErrorBoundary>
    );
  }

  const toggleSidebar = () => setSidebarOpen((v) => !v);
  const closeSidebar = () => setSidebarOpen(false);

  // The sidebar is in the normal flex flow on md+ (md:static) and an
  // off-canvas overlay below md, so the content column must NOT carry any
  // ml-* margin — one used to be applied here and doubled the space
  // between sidebar and content (a laptop-wide dead gap). Flex handles
  // expand/collapse and the themed --ks-sidebar-width automatically.
  return (
    <div className="relative flex h-dvh overflow-hidden text-white kspanel-bg-overlay">
      <ThemedBackground />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={toggleSidebar}
          inInstancePanel={inInstancePanel}
        />
        {/* Instance info dock — fixed right edge (Status / Uptime / Type),
            own auto-hide at 1.5s inside the component. */}
        {inInstancePanel && (
          <ErrorBoundary resetKey={location.pathname} label="instance-info">
            <InstanceInfoBar />
          </ErrorBoundary>
        )}
        {/* Page scroll area. The power dock floats OVER the content
            (absolute overlay, clicks pass through except on the dock itself)
            so no layout row — and no gap — is reserved for it. */}
        <div className="relative flex-1 min-h-0 flex">
          <main className="flex-1 min-w-0 overflow-auto p-4 sm:p-6">
            <ErrorBoundary resetKey={location.pathname} label="page">
              <Outlet />
            </ErrorBoundary>
          </main>
          {/* Instance power controls — OUTSIDE the <header> element, floating
              over the page content top-left, so the header keeps its fixed
              height and pages start with zero gap. */}
          {inInstancePanel && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-start px-4 sm:px-6 pt-2">
              <div className="pointer-events-auto opacity-100">
                <ErrorBoundary resetKey={location.pathname} label="instance-power">
                  <InstancePowerBar />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;