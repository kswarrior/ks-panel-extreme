import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';

// RouteThemeSync re-applies the route-resolved theme whenever the path
// changes. It must live *inside* <BrowserRouter> (it calls useLocation),
// so the router.tsx shell mounts it as the first child of <Routes>'s
// sibling wrapper. Without it, navigating between e.g. an admin page and
// an instance page wouldn't repaint — only the initial paint is themed by
// the module-load call in the theme store.
//
// It renders nothing. We keep it a real component (not a hook) so it can
// sit at the top of the Router tree alongside <Routes>.
// Debounce prevents rapid CSS re-injection on fast navigations (e.g. tab
// switching) — the theme only re-applies after 50ms of path stability.
const RouteThemeSync: React.FC = () => {
  const location = useLocation();
  const applyForRoute = useThemeStore((s) => s.applyForRoute);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      applyForRoute(location.pathname);
    }, 50);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location.pathname, applyForRoute]);

  return null;
};

export default RouteThemeSync;
