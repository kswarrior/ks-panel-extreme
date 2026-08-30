import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';
import AiChatWidget from '@/shared/components/ai/AiChatWidget';

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
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      {/* Floating bottom-right AI assistant — cycle SVG bot icon + drop-up chat panel.
          Permission-aware: shows chat when AI_CHAT_USE held, and the gear/config
          (providers / model ids / system prompt) only when AI_CHAT_MANAGE held.
          Rendered here (outside the scroll container) so the fixed positioning
          is viewport-relative and survives route changes. Hidden on /auth pages
          via the early return above. */}
      <AiChatWidget />
    </div>
  );
};

export default Layout;