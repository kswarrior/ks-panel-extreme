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

  // Instance pills are nodes-style fixed top-right PageActionsPills owned by
  // the components themselves (power on top, info stacked below) — Layout
  // just mounts them inside the instance panel, no positioning wrappers.

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
        {/* Instance pills — nodes-style fixed top-right (power + info stacked),
            each with its own auto-hide inside PageActionsPill. */}
        {inInstancePanel && (
          <>
            <ErrorBoundary resetKey={location.pathname} label="instance-info">
              <InstanceInfoBar />
            </ErrorBoundary>
            <ErrorBoundary resetKey={location.pathname} label="instance-power">
              <InstancePowerBar variant="pill" />
            </ErrorBoundary>
          </>
        )}
        {/* Page scroll area. */}
        <div className="relative flex-1 min-h-0 flex">
          <main className="flex-1 min-w-0 overflow-auto p-4 sm:p-6">
            <ErrorBoundary resetKey={location.pathname} label="page">
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;