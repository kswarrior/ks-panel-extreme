import React, { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ThemedBackground from './ThemedBackground';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import Loading from '@/shared/components/ui/Loading';
import InstanceMenuFab from '@/features/instances/components/InstanceMenuFab';

// Content column (header + page). Memoized so toggling the mobile drawer
// does NOT re-render the current route's tree: on a slow phone the
// re-render cost froze the drawer slide right on tap. Props are stable
// (useCallback toggle, pathname string, boolean) so React skips it; route
// changes still propagate because `pathname` changes (and router context
// updates reach the Outlet regardless of this memo).
const PanelContent = React.memo(function PanelContent({
  onToggleSidebar,
  pathname,
  inInstancePanel,
}: {
  onToggleSidebar: () => void;
  pathname: string;
  inInstancePanel: boolean;
}) {
  return (
    <div className="relative z-10 flex-1 flex flex-col min-w-0">
      <Header
        onToggleSidebar={onToggleSidebar}
        inInstancePanel={inInstancePanel}
      />
      {/* Floating draggable instance menu (power, actions, status).
          Mounted for instance details only. */}
      {inInstancePanel && <InstanceMenuFab />}
      {/* Page scroll area. ks-page-scroll hooks the themed Scrollbar
          (Theme Studio > Scroll > Pages) onto the main column. */}
      <div className="relative flex-1 min-h-0 flex">
        <main
          className="ks-page-scroll flex-1 min-w-0 overflow-auto p-4 sm:p-6"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'auto' } as React.CSSProperties}
        >
          <ErrorBoundary resetKey={pathname} label="page">
            {/* Route pages are lazy chunks (see app/router.tsx). The
                boundary lives INSIDE the ErrorBoundary so a failed chunk
                download surfaces the retry UI instead of a stuck
                fallback; the sidebar/header stay mounted while a chunk
                loads. */}
            <Suspense fallback={<Loading background="transparent" className="py-16" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
});

const Layout: React.FC = () => {
  const location = useLocation();
  const hideLayout = location.pathname.startsWith('/auth');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('kspanel.sidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('kspanel.sidebar.collapsed', collapsed ? '1' : '0');
    } catch {
      // Storage off / quota: collapse becomes session-only.
    }
  }, [collapsed]);

  const inInstancePanel = useMemo(() => {
    return /^\/instances\/\d+/.test(location.pathname);
  }, [location.pathname]);

  // The main thing of an instance lives in the floating draggable menu
  // (InstanceMenuFab) — no floating pills overlay the details pages.

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Stable out of the box: PanelContent is memoized and only these
  // callbacks cross the boundary on drawer toggles.
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (hideLayout) {
    return (
      <ErrorBoundary resetKey={location.pathname} label="auth">
        <Outlet />
      </ErrorBoundary>
    );
  }

  // The sidebar is in the normal flex flow on md+ (md:static) and an
  // off-canvas overlay below md, so the content column must NOT carry any
  // ml-* margin — one used to be applied here and doubled the space
  // between sidebar and content (a laptop-wide dead gap). Flex handles
  // expand/collapse and the themed --ks-sidebar-width automatically.
  return (
    <div className="relative flex h-dvh overflow-hidden text-white kspanel-bg-overlay">
      <ThemedBackground />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={collapsed} setCollapsed={setCollapsed} />
      <PanelContent
        onToggleSidebar={toggleSidebar}
        pathname={location.pathname}
        inInstancePanel={inInstancePanel}
      />
    </div>
  );
};

export default Layout;