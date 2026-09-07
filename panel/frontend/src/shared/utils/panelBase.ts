// panelBase — the Settings > General > Root URL the panel lives under.
// "" (default) serves the SPA at the origin root (/mods, /instances, …);
// e.g. "panel" serves it at /panel/mods, /panel/instances/:id, ….
//
// The value is spliced into index.html by the Go server
// (window.__KSPANEL_BOOTSTRAP__.panel_root_url) so it is known
// synchronously at module init — before <BrowserRouter> mounts. Backend
// /api/* routes stay at the origin root, so axios' absolute paths need no
// rewriting; only UI-route handling (basename, auth redirects, theme route
// resolution) goes through these helpers. A base change takes effect after
// a reload (basename is mount-time).

// getPanelBase returns the normalized base segment without slashes
// ("" = origin root). Defensive: a corrupt bootstrap value reads as "".
export function getPanelBase(): string {
  if (typeof window === 'undefined') return '';
  const raw = (window as any).__KSPANEL_BOOTSTRAP__?.panel_root_url;
  if (typeof raw !== 'string') return '';
  const norm = raw.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!norm || norm.length > 32) return '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(norm)) return '';
  if (norm === 'api' || norm === 'health' || norm === 'favicon.ico' || norm === 'assets') return '';
  return norm;
}

// panelBasename is the react-router basename ("/panel" or undefined for
// the origin root). Computed once at module init — basename is mount-time.
export const panelBasename: string | undefined = (() => {
  const base = getPanelBase();
  return base ? `/${base}` : undefined;
})();

// stripPanelBase removes the base prefix from an origin-root pathname so
// route matching (themes, auth guards) sees the logical route: with base
// "panel", "/panel/mods" → "/mods". Returns the input unchanged when no
// base is set or the path doesn't carry it.
export function stripPanelBase(pathname: string): string {
  const base = getPanelBase();
  if (!base || !pathname) return pathname || '/';
  if (pathname === `/${base}`) return '/';
  if (pathname.startsWith(`/${base}/`)) return pathname.slice(base.length + 1) || '/';
  return pathname;
}

// loginPath is the basename-aware login route for full-page redirects
// (axios 401 handling), which bypass react-router's basename resolution.
export function loginPath(): string {
  const base = getPanelBase();
  return base ? `/${base}/auth/login` : '/auth/login';
}

// onAuthRoute reports whether an origin-root pathname is inside the public
// auth area (basename-aware), for the axios 401 handler.
export function onAuthRoute(pathname: string): boolean {
  const stripped = stripPanelBase(pathname || '');
  return stripped === '/auth/login' || stripped.startsWith('/auth/');
}
