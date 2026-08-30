import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';
import AiChatWidget from '@/shared/components/ai/AiChatWidget';

class LayoutErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  state: { hasError: boolean; error?: any } = { hasError: false };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('Layout crash', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6 text-white bg-black/50">
          <div className="max-w-md w-full rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-semibold text-red-200">Page crashed</p>
            <p className="text-xs text-red-100/70 mt-1 break-all">{String(this.state.error?.message || this.state.error || 'Unknown error')}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-3 px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium">Reload</button>
            <button type="button" onClick={() => this.setState({ hasError: false })} className="ml-2 mt-3 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10">Dismiss</button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

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
          <LayoutErrorBoundary>
            <Outlet />
          </LayoutErrorBoundary>
        </main>
      </div>
      {/* Floating bottom-right AI assistant — wrapped in error boundary so a widget crash never blanks the show page */}
      <LayoutErrorBoundary>
        <AiChatWidget />
      </LayoutErrorBoundary>
    </div>
  );
};

export default Layout;