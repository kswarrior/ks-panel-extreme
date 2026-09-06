import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, type Account } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { usePrefsStore } from '@/shared/stores/prefsStore';
import { useThemeStore, scopeForArea, type Scope } from '@/shared/stores/themeStore';
import { areaFor, type AreaId } from '@/features/instance-pages/types/pageregistry';
import client from '@/shared/api/client';
import Avatar from '@/shared/components/ui/Avatar';
import { PanelBrandLogo } from '@/shared/components/brand/PanelBrand';
import RichMenu, { type RichMenuItem } from '@/shared/components/ui/RichMenu';
import InstanceTabs from '@/features/instances/components/InstanceTabs';
import NotificationBell from '@/features/notifications/components/NotificationBell';
import { canOpenAIChat } from '@/features/ai-chat/components/ChatFab';
import { useAIChatStore } from '@/features/ai-chat/store/aiChatStore';
import { Icons as SidebarIcons } from './Sidebar';

interface HeaderProps {
  onToggleSidebar: () => void;
  inInstancePanel: boolean;
}

export interface HeaderCrumb {
  parent: string;
  parentTo: string;
  current?: string;
  // Sidebar icon key rendered as [SVG] in front of the title.
  // Mirrors Sidebar `adminSubItems` icon names (e.g. Instances, Nodes).
  icon?: string;
}

// resolveHeaderCrumb maps panel routes to the header breadcrumb. List pages
// show just the parent; forms/stats/detail pages show "Parent / Current".
// Returns null for routes that own their header chrome (instance panel,
// auth) or have no mapping yet. Labels mirror each page's own title —
// update both together when renaming.
export function resolveHeaderCrumb(rawPath: string): HeaderCrumb | null {
  const p = rawPath !== '/' && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const rules: Array<[RegExp, HeaderCrumb]> = [
    [/^\/instances$/, { parent: 'Instances', parentTo: '/instances', icon: 'Instances' }],
    [/^\/instances\/stats$/, { parent: 'Instances', parentTo: '/instances', current: 'Statistics', icon: 'Instances' }],
    [/^\/instances\/new$/, { parent: 'Instances', parentTo: '/instances', current: 'New Instance', icon: 'Instances' }],
    [/^\/instance\/\d+\/edit$/, { parent: 'Instances', parentTo: '/instances', current: 'Edit Instance', icon: 'Instances' }],
    [/^\/account$/, { parent: 'Account', parentTo: '/account', icon: 'Account' }],
    [/^\/system$/, { parent: 'System', parentTo: '/system', icon: 'Dashboard' }],
    [/^\/security$/, { parent: 'Security', parentTo: '/security', icon: 'Security' }],
    [/^\/database$/, { parent: 'Database', parentTo: '/database', icon: 'Database' }],
    [/^\/activity$/, { parent: 'Activity', parentTo: '/activity', icon: 'Activity' }],
    [/^\/settings$/, { parent: 'Settings', parentTo: '/settings', icon: 'Settings' }],
    [/^\/notifications$/, { parent: 'Notifications', parentTo: '/notifications', icon: 'Notifications' }],
    [/^\/notifications\/stats$/, { parent: 'Notifications', parentTo: '/notifications', current: 'Statistics', icon: 'Notifications' }],
    [/^\/notifications\/broadcast$/, { parent: 'Notifications', parentTo: '/notifications', current: 'Broadcast', icon: 'Notifications' }],
    [/^\/themes$/, { parent: 'Themes', parentTo: '/themes', icon: 'Themes' }],
    [/^\/themes\/studio$/, { parent: 'Themes', parentTo: '/themes', current: 'Studio', icon: 'Themes' }],
    [/^\/themes\/stats$/, { parent: 'Themes', parentTo: '/themes', current: 'Statistics', icon: 'Themes' }],
    [/^\/tickets$/, { parent: 'Tickets', parentTo: '/tickets', icon: 'Tickets' }],
    [/^\/tickets\/stats$/, { parent: 'Tickets', parentTo: '/tickets', current: 'Statistics', icon: 'Tickets' }],
    [/^\/tickets\/new$/, { parent: 'Tickets', parentTo: '/tickets', current: 'New Ticket', icon: 'Tickets' }],
    [/^\/tickets\/[^/]+\/edit$/, { parent: 'Tickets', parentTo: '/tickets', current: 'Edit Ticket', icon: 'Tickets' }],
    [/^\/tickets\/[^/]+\/chat$/, { parent: 'Tickets', parentTo: '/tickets', current: 'Chat', icon: 'Tickets' }],
    [/^\/tickets\/[^/]+$/, { parent: 'Tickets', parentTo: '/tickets', current: 'Detail', icon: 'Tickets' }],
    [/^\/users$/, { parent: 'Users', parentTo: '/users', icon: 'Users' }],
    [/^\/users\/stats$/, { parent: 'Users', parentTo: '/users', current: 'Statistics', icon: 'Users' }],
    [/^\/users\/new$/, { parent: 'Users', parentTo: '/users', current: 'New User', icon: 'Users' }],
    [/^\/users\/[^/]+\/edit$/, { parent: 'Users', parentTo: '/users', current: 'Edit User', icon: 'Users' }],
    [/^\/user\/[^/]+$/, { parent: 'Users', parentTo: '/users', current: 'Detail', icon: 'Users' }],
    [/^\/roles$/, { parent: 'Roles', parentTo: '/roles', icon: 'Roles' }],
    [/^\/roles\/stats$/, { parent: 'Roles', parentTo: '/roles', current: 'Statistics', icon: 'Roles' }],
    [/^\/roles\/new$/, { parent: 'Roles', parentTo: '/roles', current: 'New Role', icon: 'Roles' }],
    [/^\/roles\/[^/]+\/edit$/, { parent: 'Roles', parentTo: '/roles', current: 'Edit Role', icon: 'Roles' }],
    [/^\/api-keys$/, { parent: 'API Keys', parentTo: '/api-keys', icon: 'ApiKeys' }],
    [/^\/api-keys\/stats$/, { parent: 'API Keys', parentTo: '/api-keys', current: 'Statistics', icon: 'ApiKeys' }],
    [/^\/api-keys\/new$/, { parent: 'API Keys', parentTo: '/api-keys', current: 'New Key', icon: 'ApiKeys' }],
    [/^\/api-keys\/[^/]+\/edit$/, { parent: 'API Keys', parentTo: '/api-keys', current: 'Edit Key', icon: 'ApiKeys' }],
    [/^\/api-key\/[^/]+$/, { parent: 'API Keys', parentTo: '/api-keys', current: 'Detail', icon: 'ApiKeys' }],
    [/^\/nodes$/, { parent: 'Nodes', parentTo: '/nodes', icon: 'Nodes' }],
    [/^\/nodes\/stats$/, { parent: 'Nodes', parentTo: '/nodes', current: 'Statistics', icon: 'Nodes' }],
    [/^\/nodes\/schedules$/, { parent: 'Nodes', parentTo: '/nodes', current: 'Schedules', icon: 'Nodes' }],
    [/^\/nodes\/new$/, { parent: 'Nodes', parentTo: '/nodes', current: 'New Node', icon: 'Nodes' }],
    [/^\/node\/[^/]+$/, { parent: 'Nodes', parentTo: '/nodes', current: 'Detail', icon: 'Nodes' }],
    [/^\/nodes\/[^/]+\/edit$/, { parent: 'Nodes', parentTo: '/nodes', current: 'Edit Node', icon: 'Nodes' }],
    [/^\/templates$/, { parent: 'Templates', parentTo: '/templates', icon: 'Templates' }],
    [/^\/templates\/stats$/, { parent: 'Templates', parentTo: '/templates', current: 'Statistics', icon: 'Templates' }],
    [/^\/templates\/new$/, { parent: 'Templates', parentTo: '/templates', current: 'New Template', icon: 'Templates' }],
    [/^\/template\/[^/]+$/, { parent: 'Templates', parentTo: '/templates', current: 'Detail', icon: 'Templates' }],
    [/^\/templates\/[^/]+\/edit$/, { parent: 'Templates', parentTo: '/templates', current: 'Edit Template', icon: 'Templates' }],
    [/^\/mods$/, { parent: 'Mods', parentTo: '/mods', icon: 'Mods' }],
    [/^\/mods\/studio$/, { parent: 'Mods', parentTo: '/mods', current: 'Studio', icon: 'Mods' }],
    [/^\/mods\/stats$/, { parent: 'Mods', parentTo: '/mods', current: 'Statistics', icon: 'Mods' }],
    [/^\/applications$/, { parent: 'Applications', parentTo: '/applications', icon: 'Applications' }],
    [/^\/applications\/stats$/, { parent: 'Applications', parentTo: '/applications', current: 'Statistics', icon: 'Applications' }],
    [/^\/applications\/[^/]+\/edit$/, { parent: 'Applications', parentTo: '/applications', current: 'Edit Application', icon: 'Applications' }],
    [/^\/applications\/[^/]+\/configure$/, { parent: 'Applications', parentTo: '/applications', current: 'Configure', icon: 'Applications' }],
    [/^\/instance-pages$/, { parent: 'Pages', parentTo: '/instance-pages', icon: 'Templates' }],
    [/^\/instance-pages\/stats$/, { parent: 'Pages', parentTo: '/instance-pages', current: 'Statistics', icon: 'Templates' }],
    [/^\/instance-pages\/studio$/, { parent: 'Pages', parentTo: '/instance-pages', current: 'Studio', icon: 'Templates' }],
    [/^\/instance-pages\/[^/]+\/studio$/, { parent: 'Pages', parentTo: '/instance-pages', current: 'Studio', icon: 'Templates' }],
    [/^\/instance-pages\/[^/]+$/, { parent: 'Pages', parentTo: '/instance-pages', current: 'Detail', icon: 'Templates' }],
  ];
  for (const [re, crumb] of rules) {
    if (re.test(p)) return crumb;
  }
  return null;
}

// Header renders the brand chrome up top + the profile dropdown. The
// profile dropdown is now a RichMenu driving live per-user prefs
// (compact / dense / reduced motion / show shortcuts) plus a Theme
// submenu that switches the active theme for the page's area without
// bouncing through the Themes page.

const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  inInstancePanel,
}) => {
  const { user, clearAuth, accounts, activeAccountId, switchAccount, removeAccount, setAuth } =
    useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = React.useState<boolean>(false);

  // Page-switch loader — white hairline that sweeps left → right ONLY while
  // a new page is opening (null = hidden/idle, number = visible width %).
  // Trigger is the route key so it fires when any page opens, including the
  // first mount, and stays hidden otherwise (fixes always-visible line).
  const [loadProgress, setLoadProgress] = React.useState<number | null>(null);
  const loadTimers = React.useRef<number[]>([]);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);

  React.useEffect(() => {
    if (reducedMotion) {
      loadTimers.current.forEach((t) => window.clearTimeout(t));
      loadTimers.current = [];
      setLoadProgress(null);
      return;
    }
    loadTimers.current.forEach((t) => window.clearTimeout(t));
    loadTimers.current = [];
    setLoadProgress(0);
    const t1 = window.setTimeout(() => setLoadProgress(70), 30);
    const t2 = window.setTimeout(() => setLoadProgress(90), 350);
    const t3 = window.setTimeout(() => setLoadProgress(100), 650);
    const t4 = window.setTimeout(() => setLoadProgress(null), 950);
    loadTimers.current = [t1, t2, t3, t4];
    return () => {
      loadTimers.current.forEach((t) => window.clearTimeout(t));
      loadTimers.current = [];
    };
  }, [location.pathname, location.search, reducedMotion]);

  React.useEffect(() => {
    return () => {
      loadTimers.current.forEach((t) => window.clearTimeout(t));
      loadTimers.current = [];
    };
  }, []);

  // Pick up the brand and bootstrap document.title. The hook dedupes the
  // network fetch, so multiple components calling it is fine.
  const panelName = useSettingsStore((s) => s.panelName);
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = panelName || 'KS Panel';
  }, [panelName]);

  // prefs store — drives the four toggles.
  const prefs = usePrefsStore();
  const setPref = usePrefsStore((s) => s.setPref);

  // AI chat prefs (per-user): floating-button toggle + panel opener.
  // Shown only for roles with any chat-capable AI key.
  const permissions = useAuthStore((s) => s.permissions);
  const canChat = canOpenAIChat(permissions);
  const fabHidden = useAIChatStore((s) => s.fabHidden);
  const setFabHidden = useAIChatStore((s) => s.setFabHidden);
  const setChatOpen = useAIChatStore((s) => s.setOpen);
  const refreshFabPref = useAIChatStore((s) => s.refreshFabPref);

  // Pick up each account's own FAB preference on login / switch so a
  // shared browser never leaks one user's toggle to another.
  React.useEffect(() => {
    refreshFabPref();
  }, [activeAccountId, refreshFabPref]);

  // theme store — for the theme submenu.
  const themes = useThemeStore((s) => s.themes);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const assignments = useThemeStore((s) => s.assignments);
  const assignTheme = useThemeStore((s) => s.assignTheme);
  const resolveThemeForRoute = useThemeStore((s) => s.resolveThemeForRoute);

  // Header loading-bar theme — resolved for the CURRENT route so the bar
  // repaints on navigation (same resolver RouteThemeSync uses to paint the
  // CSS vars). Falls back to the Default look when an older theme lacks the
  // fields. Paint itself comes from the --ks-header-loading-bar-* vars the
  // store emits; position/enabled change layout so they are read here.
  const headerTheme = React.useMemo(
    () => resolveThemeForRoute(location.pathname)?.header as any,
    [resolveThemeForRoute, location.pathname],
  );
  const lbEnabled = headerTheme?.loading_bar_enabled ?? true;
  const lbPosition = headerTheme?.loading_bar_position === 'top' ? 'top' : 'bottom';

  // The active area for the Theme submenu is the area the user is
  // currently looking at (default: admin). Switching a theme here
  // assigns it to that whole area's scope.
  const currentArea: AreaId | null = areaFor(location.pathname);

  // Merged, deduped list of themes (built-in + local + global). Used
  // both as menu rows and for the "currently active" checkmark.
  const merged = React.useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const t of themes) byId.set(t.id, { id: t.id, name: t.name });
    for (const t of globalThemes) byId.set(t.id, { id: t.id, name: t.name });
    return Array.from(byId.values());
  }, [themes, globalThemes]);

  const activeScope: Scope | null = currentArea ? scopeForArea(currentArea) : null;
  const activeThemeId = activeScope ? assignments[activeScope] : undefined;

  // accountSwitcherChildren builds the rows for the "Switch account" submenu:
  // one checkbox row per logged-in profile (checked = currently active), then
  // a separator, then an Add-account action. The count of rows == the number
  // of accounts logged in, which the submenu label surfaces as the count.
  const accountSwitcherChildren = (): RichMenuItem[] => {
    const rows: RichMenuItem[] = accounts.map((acct: Account, i: number) => ({
      kind: 'checkbox',
      key: `switch-account-${i}`,
      // Display name (when set) as the row label, @username as the hint line.
      // Email is intentionally NOT shown here — the header dropdown's
      // identity block above already carries the brand logo + display name +
      // username and we keep these rows scannable the same way.
      label:
        (acct.user.display_name && acct.user.display_name.trim()) || acct.user.username,
      checked: i === activeAccountId,
      hint:
        acct.user.display_name && acct.user.display_name.trim()
          ? `@${acct.user.username}`
          : undefined,
    }));
    rows.push({ kind: 'separator', key: 'switch-sep' });
    rows.push({
      key: 'add-account',
      label: 'Add account…',
      tone: 'default',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="16" y1="11" x2="22" y2="11" />
         </svg>
      ),
    });
    return rows;
  };

  // ---- Menu items ----------------------------------------------------------------
  // Build the rich item list. Order matters: header → prefs group (incl.
  // the AI chat button toggle + opener) → theme submenu → account actions.
  const items: RichMenuItem[] = React.useMemo(() => {
    const themeChildren: RichMenuItem[] = merged.map((t) => ({
      kind: 'checkbox',
      key: `theme-${t.id}`,
      label: t.name,
      checked: t.id === activeThemeId,
      hint: t.id === 'default' ? 'Built-in baseline theme' : undefined,
    }));

    return [
      {
        kind: 'toggle',
        key: 'compact',
        label: 'Compact mode',
        checked: prefs.compact,
        hint: 'Tighter paddings / borders',
      },
      {
        kind: 'toggle',
        key: 'dense',
        label: 'Dense lists',
        checked: prefs.dense,
        hint: 'Smaller rows in card grids',
      },
      {
        kind: 'toggle',
        key: 'reducedMotion',
        label: 'Reduced motion',
        checked: prefs.reducedMotion,
        hint: 'Disable transitions + aurora drift',
      },
      {
        kind: 'checkbox',
        key: 'showShortcuts',
        label: 'Show keyboard shortcuts',
        checked: prefs.showShortcuts,
        hint: 'Reveal hint text next to actions',
      },
      ...(canChat
        ? [
            {
              kind: 'toggle',
              key: 'ai-fab',
              label: 'AI chat button',
              checked: !fabHidden,
              hint: 'Floating button',
            } as RichMenuItem,
          ]
        : []),
      ...(canChat && fabHidden
        ? [
            {
              key: 'open-ai-chat',
              label: 'Open AI assistant…',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              ),
            } as RichMenuItem,
          ]
        : []),
      { kind: 'separator', key: 'sep1' },
      {
        kind: 'submenu',
        key: 'switch-account',
        // The label carries the live count so the admin sees "how many
        // accounts are logged in" without opening it. Pluralization matches
        // the common 1 vs many case.
        label:
          accounts.length <= 1
            ? 'Switch account'
            : `Switch account · ${accounts.length}`,
        children: accountSwitcherChildren(),
      },
      {
        kind: 'submenu',
        key: 'theme',
        label: currentArea
          ? `Theme for ${currentArea}…`
          : 'Theme…',
        children: themeChildren,
      },
      { kind: 'separator', key: 'sep2' },
      {
        key: 'account',
        label: 'Account',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M20 21a8 8 0 1 0-16 0" />
            <circle cx="12" cy="7" r="4" />
           </svg>
        ),
      },
      {
        key: 'themes',
        label: 'Manage themes…',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
            <circle cx="13.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="10.5" r="2.5" />
            <circle cx="8.5" cy="7.5" r="2.5" />
            <circle cx="6.5" cy="12.5" r="2.5" />
            <path d="M12 2a10 10 0 0 0 0 20c1.66 0 2-1 1.5-2.5-.5-1.5.5-2.5 2-2.5H17a3 3 0 0 0 3-3v-1a10 10 0 0 0-7.5-9z" />
           </svg>
        ),
      },
      {
        key: 'logout',
        label: loggingOut ? 'Logging out…' : 'Logout',
        tone: 'danger',
        disabled: loggingOut,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
           </svg>
        ),
      },
    ];
  }, [merged, prefs, activeThemeId, currentArea, loggingOut, accounts, activeAccountId, canChat, fabHidden]);

  const onSelect = (key: string) => {
    if (key === 'account') navigate('/account');
    else if (key === 'themes') navigate('/themes');
    else if (key === 'open-ai-chat') setChatOpen(true);
    else if (key === 'add-account') {
      // Send the user to the login page in "add account" mode so the cookie
      // for the current account isn't clobbered; return-to here once done.
      navigate('/auth/login', {
        state: { addAccount: true, returnTo: location.pathname + location.search },
      });
    } else if (key === 'logout') {
      if (loggingOut) return;
      setLoggingOut(true);
      client
        .post('/api/auth/logout')
        .catch(() => {})
        .finally(() => {
          clearAuth();
          setLoggingOut(false);
          navigate('/auth/login', { replace: true });
        });
    }
  };

  const onToggle = (key: string, next: boolean) => {
    // Prefs toggles.
    if (key === 'compact') setPref('compact', next);
    else if (key === 'dense') setPref('dense', next);
    else if (key === 'reducedMotion') setPref('reducedMotion', next);
    else if (key === 'showShortcuts') setPref('showShortcuts', next);
    else if (key === 'ai-fab') setFabHidden(!next);
    // Theme submenu checkbox items have keys `theme-<id>`.
    else if (key.startsWith('theme-') && activeScope) {
      const tid = key.slice(6);
      if (next) assignTheme(tid, activeScope);
    }
    // Account-switcher rows have keys `switch-account-<i>`. Toggling one ON
    // promotes that account to active; toggling OFF (un-checking the active
    // row) is a no-op — you stay on your current account. After a switch we
    // re-hydrate from /api/me using the new Bearer token so permissions +
    // profile reflect the freshly-active account (the active token is sent
    // automatically by api/client's interceptor).
    else if (key.startsWith('switch-account-')) {
      if (!next) return;
      const i = Number(key.slice('switch-account-'.length));
      if (!Number.isFinite(i) || i < 0 || i >= accounts.length) return;
      if (i === activeAccountId) return;
      switchAccount(i);
      client
        .get('/api/me')
        .then((res: { data: { user: unknown; permissions: string[] } }) => {
          const u = res.data.user as Account['user'];
          setAuth(u, 'authenticated', res.data.permissions);
        })
        .catch(() => {
          // The switch target's token may be expired; drop it from the list
          // so the user isn't stuck on a dead session.
          removeAccount(i);
        });
    }
  };

  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const logoStyle = useSettingsStore((s) => s.logoStyle);

  const headerNode = (
    <div className="flex items-center gap-2.5 min-w-0">
      {/* Panel logo (or avatar fallback) so the brand stays present at the
       * top of the profile dropdown next to the identity lines. Rendered
       * with the shared crisp BrandLogo (contain-fit) — the old
       * object-cover cropped wide logos here. */}
      {panelLogo?.url ? (
        <PanelBrandLogo logo={panelLogo} style={logoStyle} baseSize={28} alt={panelName || 'Panel logo'} />
      ) : (
        <Avatar
          name={user?.username || 'Guest'}
          size={28}
          accentColor={user?.accent_color || undefined}
          symbol={user?.avatar_symbol}
          imageUrl={user?.has_avatar ? `/api/users/${user.id}/avatar` : undefined}
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {(user?.display_name && user.display_name.trim()) || user?.username || 'Guest'}
        </p>
        {user?.display_name && user.display_name.trim() && (
          <p className="text-xs text-gray-300/80 truncate">@{user.username}</p>
        )}
      </div>
    </div>
  );

  return (
    <header className="glass-chrome ks-header-bg w-full sticky top-0 z-20 relative flex flex-col justify-center px-[5px]">
      <div className="w-full flex items-center justify-between min-h-[var(--ks-header-height,56px)]">
      <div className="flex items-center gap-2 min-w-0">
        {/* Sidebar toggle — mobile only. Modern three-line icon with
            smooth pill-style bars that compress on hover and reveal a
            subtle accent stripe. */}
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          className="md:hidden shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition-all duration-200 relative overflow-hidden group"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
            aria-hidden="true"
          >
            {/* Left accent stripe — subtle vertical bar that signals "panel" */}
            <line
              x1="4"
              y1="5"
              x2="4"
              y2="19"
              strokeWidth="2"
              className="opacity-60 transition-all duration-300 group-hover:opacity-100 group-hover:[stroke-width:2.5]"
            />
            {/* Top bar — slightly indented from accent */}
            <line
              x1="9"
              y1="7"
              x2="20"
              y2="7"
              strokeWidth="2"
              className="transition-all duration-300 group-hover:translate-x-[-1px]"
            />
            {/* Middle bar — full width */}
            <line
              x1="9"
              y1="12"
              x2="20"
              y2="12"
              strokeWidth="2"
              className="transition-all duration-300"
            />
            {/* Bottom bar — shorter, hints at hierarchy */}
            <line
              x1="9"
              y1="17"
              x2="16"
              y2="17"
              strokeWidth="2"
              className="transition-all duration-300 group-hover:[x2:20]"
            />
            {/* Soft hover ring */}
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0"
              className="group-hover:opacity-20 transition-opacity duration-300"
            />
          </svg>
        </button>

        {/* Page crumb — every list/form/stats/detail page shows its title
            here, right of the sidebar toggle, so page bodies stay clean.
            Labels come from resolveHeaderCrumb below (kept in sync with
            each page's own title by the area owners). Icon is the same
            glyph the sidebar uses: [SVG] [Parent] [/ Current]. */}
        {!inInstancePanel && (() => {
          const crumb = resolveHeaderCrumb(location.pathname);
          if (!crumb) return null;
          const rawIcon = (crumb.icon && SidebarIcons[crumb.icon]) || null;
          // Same glyph as the sidebar, upsized for the header title.
          const sizedIcon = React.isValidElement(rawIcon)
            ? React.cloneElement(rawIcon as React.ReactElement<{ className?: string }>, {
                className: 'w-5 h-5',
              })
            : rawIcon;
          const iconNode = sizedIcon ? (
            <span aria-hidden="true" className="shrink-0 inline-flex items-center text-gray-300">
              {sizedIcon}
            </span>
          ) : null;
          return (
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
              {crumb.current ? (
                <>
                  <span className="flex items-center gap-1.5 min-w-0">
                    {iconNode}
                    <button
                      type="button"
                      onClick={() => navigate(crumb.parentTo)}
                      className="hover:text-white transition-colors shrink-0"
                    >
                      {crumb.parent}
                    </button>
                  </span>
                  <span className="text-gray-600 shrink-0">/</span>
                  <span className="text-gray-200 truncate">{crumb.current}</span>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-gray-200 min-w-0">
                  {iconNode}
                  <span className="truncate">{crumb.parent}</span>
                </span>
              )}
            </nav>
          );
        })()}

        {/* Instance tabs — visible when inside an instance panel.
            Horizontal scroll with gradient fade indicator. */}
        {inInstancePanel && <InstanceTabs />}
      </div>

      {/* Right cluster: notification bell + profile. Always visible so the
       * header stays a normal single row on every page (the main thing of
       * an instance lives in the floating instance menu). */}
      <div className="flex items-center gap-2">
          <NotificationBell />
          <RichMenu
            items={items}
            onSelect={onSelect}
            onToggle={onToggle}
            width={248}
            header={headerNode}
            placement="bottom-right"
            ariaLabel="Profile menu"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-label="Profile menu"
                className="ks-icon-btn inline-flex items-center justify-center w-9 h-9 !rounded-full overflow-hidden !p-0 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                style={
                  {
                    ['--ks-btn-icon-radius' as string]: '9999px',
                    ['--ks-btn-icon-padding' as string]: '0px',
                    ['--ks-btn-icon-bg' as string]: 'transparent',
                    ['--ks-btn-icon-border' as string]: 'none',
                    borderRadius: '9999px',
                    padding: 0,
                    overflow: 'hidden',
                  } as React.CSSProperties
                }
              >
                {/* The trigger shows the active user's profile avatar/logo
                 * (uploaded image, accent symbol, or initials) so the admin
                 * sees who they are acting as — the same Discord-style affordance
                 * the rest of the panel already uses. Kept perfectly circular
                 * (cycle shape) in the top-right header: CSS vars override the
                 * themed --ks-btn-icon-radius/padding which otherwise force a
                 * rounded-square icon-button, plus Tailwind !rounded-full +
                 * inline borderRadius + overflow-hidden guarantee a true circle
                 * even when the theme injects `border-radius: var(...) !important`.
                 * Sized to match the sidebar toggle (w-9 h-9 outer, 20px inner icon)
                 * so the top-right cluster feels balanced. */}
                <Avatar
                  name={user?.username || 'Guest'}
                  size={28}
                  accentColor={user?.accent_color || undefined}
                  symbol={user?.avatar_symbol}
                  imageUrl={user?.has_avatar ? `/api/users/${user.id}/avatar` : undefined}
                  className="shrink-0 rounded-full"
                />
              </button>
            )}
          />
        </div>
      </div>
      {/* Page-load bar — Google-style sweep shown ONLY while a page opens
          (Header mounts once in Layout, so the route-key effect above
          re-fires on every navigation). Hidden when idle, when the theme
          disables it (header.loading_bar_enabled), or under reduced motion.
          Fill / track / thickness come from the theme vars
          (--ks-header-loading-bar-*) so the Header tab restyles it live;
          edge (top/bottom) comes from header.loading_bar_position. A
          dedicated element is used instead of border-b so the themed
          --ks-header-border (!important) can never recolor it. */}
      {lbEnabled && loadProgress !== null && (
        <div
          aria-hidden="true"
          className={`ks-header-loading-track pointer-events-none absolute left-0 right-0 bg-transparent ${lbPosition === 'top' ? 'top-0' : 'bottom-0'}`}
        >
          <div
            className="ks-header-loading-fill transition-all duration-300 ease-out"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}
    </header>
  );
};

export default Header;
