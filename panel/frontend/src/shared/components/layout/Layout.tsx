import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';

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
    return <Outlet />;
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
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;