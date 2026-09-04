import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import InstancePowerBar from '@/features/instances/components/InstancePowerBar';

const Layout: React.FC = () => {
  const location = useLocation();
  const hideLayout = location.pathname.startsWith('/auth');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const inInstancePanel = useMemo(() => {
    return /^\/instances\/\d+/.test(location.pathname);
  }, [location.pathname]);

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
        {/* Instance power controls — OUTSIDE the <header> element, directly
            below it, so the header keeps its fixed height and the dock lives
            as its own row (scrolls with layout, not part of sticky chrome). */}
        {inInstancePanel && (
          <div className="shrink-0 w-full flex justify-start p-0 m-0">
            <ErrorBoundary resetKey={location.pathname} label="instance-power">
              <InstancePowerBar />
            </ErrorBoundary>
          </div>
        )}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <ErrorBoundary resetKey={location.pathname} label="page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default Layout;