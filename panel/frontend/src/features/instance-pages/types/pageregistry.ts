// Page registry — the single source of truth for every route the panel can
// render, grouped into the three "areas" the theme assignment system lets an
// admin target independently (Auth / Admin Panel / Instance Panel).
//
// Each page entry carries a `match` predicate used by the theme store to
// resolve which theme should be active for the *current* route: routes with
// an explicit per-page assignment win; otherwise the page's owning area
// default applies; otherwise the built-in Default theme is used.
//
// Keep this list in sync with router.tsx — every <Route> that renders a
// distinct page should have a matching entry here, otherwise that page
// silently falls back to the area default / built-in Default.

export type AreaId = 'auth' | 'admin' | 'instance';

export interface PageEntry {
  id: string;          // stable page id, e.g. 'admin.users'
  label: string;       // human label shown in the assignment menu
  path: string;        // representative path (also used as a fallback matcher)
  // match returns true when a location pathname corresponds to this page.
  // Most pages use a simple startsWith; the more dynamic ones (with route
  // params) spell the rule out explicitly.
  match: (pathname: string, search: string) => boolean;
}

export interface AreaEntry {
  id: AreaId;
  label: string;
  description: string;
  // The area's primary prefix — used both for grouping and as the coarse
  // matcher when no per-page assignment exists.
  prefix: string;
  pages: PageEntry[];
}

const starts = (p: string) => (pathname: string) =>
  pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?');

export const AREAS: AreaEntry[] = [
  {
    id: 'auth',
    label: 'Auth Pages',
    description: 'The login page and any future public auth screens.',
    prefix: '/auth',
    pages: [
      {
        id: 'auth.login',
        label: 'Login',
        path: '/auth/login',
        match: starts('/auth/login'),
      },
      {
        id: 'auth.register',
        label: 'Register',
        path: '/auth/register',
        match: starts('/auth/register'),
      },
      {
        id: 'auth.verify-email',
        label: 'Verify Email',
        path: '/auth/verify-email',
        match: starts('/auth/verify-email'),
      },
    ],
  },
  {
    id: 'instance',
    label: 'Instance Panel',
    description: 'The instance list plus every per-instance sub-panel (Home, Files, Network, Terminal, Settings, Ports, SFTP, Snapshots, Overview and custom pages).',
    prefix: '/instances',
    pages: [
      {
        id: 'instance.list',
        label: 'My / All Instances',
        path: '/instances',
        // Bare /instances (and only that) — the per-instance panels live
        // under /instances/:id/* and are matched by the children below.
        match: (pathname) => pathname === '/instances' || pathname === '/',
      },
      {
        id: 'instance.list.stats',
        label: 'Instances · Stats',
        path: '/instances/stats',
        match: starts('/instances/stats'),
      },
      {
        id: 'instance.list.schedules',
        label: 'Instances · Schedules',
        path: '/instances/schedules',
        match: starts('/instances/schedules'),
      },
      {
        id: 'instance.create',
        label: 'Instance · Create',
        path: '/instances/new',
        match: starts('/instances/new'),
      },
      {
        id: 'instance.edit',
        label: 'Instance · Edit',
        path: '/instance/:id/edit',
        match: (pathname) => /^\/instance\/\d+\/edit\/?$/.test(pathname),
      },
      {
        id: 'instance.panel.home',
        label: 'Instance · Home',
        path: '/instances/:id',
        match: defaultInstanceMatcher(''),
      },
      {
        id: 'instance.panel.files',
        label: 'Instance · Files',
        path: '/instances/:id/files',
        match: defaultInstanceMatcher('files'),
      },
      {
        id: 'instance.panel.network',
        label: 'Instance · Network',
        path: '/instances/:id/network',
        match: defaultInstanceMatcher('network'),
      },
      {
        id: 'instance.panel.terminal',
        label: 'Instance · Terminal',
        path: '/instances/:id/terminal',
        match: defaultInstanceMatcher('terminal'),
      },
      {
        id: 'instance.panel.settings',
        label: 'Instance · Settings',
        path: '/instances/:id/settings',
        match: defaultInstanceMatcher('settings'),
      },
      {
        id: 'instance.panel.ports',
        label: 'Instance · Ports',
        path: '/instances/:id/ports',
        match: defaultInstanceMatcher('ports'),
      },
      {
        id: 'instance.panel.sftp',
        label: 'Instance · SFTP',
        path: '/instances/:id/sftp',
        match: defaultInstanceMatcher('sftp'),
      },
      {
        id: 'instance.panel.snapshots',
        label: 'Instance · Snapshots',
        path: '/instances/:id/snapshots',
        match: defaultInstanceMatcher('snapshots'),
      },
      {
        id: 'instance.panel.overview',
        label: 'Instance · Overview',
        path: '/instances/:id/overview',
        match: defaultInstanceMatcher('overview'),
      },
      {
        id: 'instance.panel.custom',
        label: 'Instance · Custom Page',
        path: '/instances/:id/:page',
        // Catch-all for any custom instance page (including sub-pages like
        // files/edit). Placed after explicit tab entries so per-page
        // assignments for Home/Files/Network/Terminal/Settings win.
        match: (pathname) => /^\/instances\/\d+\/[^/]+(?:\/[^/]+)*\/?$/.test(pathname),
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    description: 'System overview, security telemetry, activity, database, users, roles, API keys, nodes, templates, themes, instances.',
    prefix: '/',
    pages: [
      adminPage('admin.system', 'System', 'system'),
      adminPage('admin.security', 'Security', 'security'),
      adminPage('admin.activity', 'Activity', 'activity'),
      adminPage('admin.database', 'Database', 'database'),
      adminPage('admin.users', 'Users', 'users'),
      adminPage('admin.users.new', 'User · Create', 'users/new'),
      adminPage('admin.users.edit', 'User · Edit', 'users/:id/edit'),
      adminPage('admin.roles', 'Roles', 'roles'),
      adminPage('admin.roles.new', 'Role · Create', 'roles/new'),
      adminPage('admin.roles.edit', 'Role · Edit', 'roles/:id/edit'),
      adminPage('admin.settings', 'Settings', 'settings'),
      adminPage('admin.authority', 'Authority', 'authority'),
      adminPage('admin.api-keys', 'API Keys', 'api-keys'),
      adminPage('admin.api-keys.new', 'API Key · Create', 'api-keys/new'),
      adminPage('admin.api-keys.edit', 'API Key · Edit', 'api-keys/:id/edit'),
      adminPage('admin.nodes', 'Nodes', 'nodes'),
      adminPage('admin.nodes.new', 'Node · Create', 'nodes/new'),
      adminPage('admin.nodes.edit', 'Node · Edit', 'nodes/:id/edit'),
      adminPage('admin.templates', 'Templates', 'templates'),
      adminPage('admin.templates.new', 'Template · Create', 'templates/new'),
      adminPage('admin.templates.edit', 'Template · Edit', 'templates/:id/edit'),
      adminPage('admin.mods', 'Mods', 'mods'),
      adminPage('admin.mods.studio', 'Mod Studio', 'mods/studio'),
      adminPage('admin.applications', 'Applications', 'applications'),
      adminPage('admin.applications.edit', 'Application · Edit', 'applications/:id/edit'),
      adminPage('admin.applications.configure', 'Application · Configure', 'applications/:id/configure'),
      adminPage('admin.themes', 'Themes', 'themes'),
      adminPage('admin.themes.studio', 'Theme Studio', 'themes/studio'),
      adminPage('admin.instances', 'All Instances', 'instances'),
      adminPage('admin.instances.new', 'Instance · Create', 'instances/new'),
      adminPage('admin.instance-pages', 'Instance Pages', 'instance-pages'),
      adminPage('admin.instance-pages.studio', 'Instance Page Studio', 'instance-pages/studio'),
      adminPage('admin.instance-pages.edit', 'Instance Page · Edit', 'instance-pages/:id/studio'),
    ],
  },
];

function adminPage(id: string, label: string, suffix: string): PageEntry {
  // Panel pages live at the URL root: the suffix may contain a `:id`
  // placeholder for edit pages which we turn into a numeric matcher.
  const fullPath = `/${suffix}`;
  if (suffix.includes(':id')) {
    const re = new RegExp(
      '^' + fullPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(':id', '\\d+') + '$',
    );
    return { id, label, path: fullPath, match: (p) => re.test(p) };
  }
  return { id, label, path: fullPath, match: starts(fullPath) };
}

// defaultInstanceMatcher builds the matcher for /instances/:id[/<tab>]. The
// per-instance Home page is /instances/:id (no trailing tab), which means
// `tab === ''` should match /instances/<digits> exactly; other tabs match
// /instances/<digits>/<tab>.
function defaultInstanceMatcher(tab: string): (pathname: string) => boolean {
  const re = new RegExp(
    tab === ''
      ? '^/instances/\\d+/?$'
      : `^/instances/\\d+/${tab}/?$`,
  );
  return (p) => re.test(p);
}

// Flatten helper for callers that want a flat list of pages with their area.
export const ALL_PAGES: Array<PageEntry & { areaId: AreaId; areaLabel: string }> = AREAS.flatMap((a) =>
  a.pages.map((p) => ({ ...p, areaId: a.id, areaLabel: a.label })),
);

// The Account page is authed but is its own top-level surface — it's not an
// auth page, not an admin page, and not an instance panel. We still want it
// themable, so we expose it as a standalone "Page" grouped under its own
// synthetic area so the assignment menu can list it.
export const STANDALONE_PAGES: Array<PageEntry & { areaId: AreaId; areaLabel: string }> = [
  {
    id: 'account',
    label: 'My Account',
    path: '/account',
    areaId: 'instance', // group it visually under the user-facing area
    areaLabel: 'My Account',
    match: starts('/account'),
  },
];

// The full, flat catalogue surfaced in the assignment dropdown. Auth + Admin
// + Instance areas first, then the Account standalone.
export const CATALOGUE: Array<PageEntry & { areaId: AreaId; areaLabel: string }> = [
  ...ALL_PAGES,
  ...STANDALONE_PAGES,
];

// bestPageFor(path) returns the MOST SPECIFIC catalogue entry whose matcher
// claims the pathname (longest `path` wins, earliest entry wins ties). This
// matters because generic matchers shadow specific ones under first-match
// semantics — e.g. starts('/users') also matches '/users/new', so a naive
// first-match walk would resolve User Create to admin.users and a
// page:admin.users.new assignment would never fire. Longest-path-wins makes
// per-page theming work for every nested page regardless of registry order.
export function bestPageFor(
  pathname: string,
): (PageEntry & { areaId: AreaId; areaLabel: string }) | null {
  let best: (PageEntry & { areaId: AreaId; areaLabel: string }) | null = null;
  for (const p of CATALOGUE) {
    let m = false;
    try {
      m = p.match(pathname, '');
    } catch {
      m = false;
    }
    if (!m) continue;
    if (!best || p.path.length > best.path.length) best = p;
  }
  return best;
}

// areaFor(path) returns the area id a given pathname belongs to, or null for
// the catch-all. The admin area (panel pages at the URL root) has no shared
// prefix any more, so we resolve the area via bestPageFor (most-specific
// matcher wins). Used by the resolver to pick an area-level default when no
// per-page assignment exists.
//
// Instance custom pages (/instances/:id/<slug> and sub-pages) are not
// enumerated individually; the catch-all instance.panel.custom covers them
// via the catalogue walk, but we also keep an explicit prefix fast-path
// so any future slug instantly resolves to the 'instance' area even if the
// catalogue entry is reordered or the pathname has a trailing query fragment.
export function areaFor(pathname: string): AreaId | null {
  const best = bestPageFor(pathname);
  if (best) return best.areaId;
  // Fallback: every per-instance route lives under /instances/<numeric-id>
  // and must follow the instance area's theme (assignment > default). This
  // covers custom pages and any future tabs without requiring a registry edit.
  if (/^\/instances\/\d+(\/|$)/.test(pathname)) return 'instance';
  return null;
}
