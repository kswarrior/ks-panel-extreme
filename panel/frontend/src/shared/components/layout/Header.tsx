import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, type Account } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { usePrefsStore } from '@/shared/stores/prefsStore';
import { useThemeStore, scopeForArea, type Scope } from '@/shared/stores/themeStore';
import { areaFor, type AreaId } from '@/features/instance-pages/types/pageregistry';
import client from '@/shared/api/client';
import Avatar from '@/shared/components/ui/Avatar';
import RichMenu, { type RichMenuItem } from '@/shared/components/ui/RichMenu';
import InstanceTabs from '@/features/instances/components/InstanceTabs';
import NotificationBell from '@/features/notifications/components/NotificationBell';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';

interface HeaderProps {
  onToggleSidebar: () => void;
  inInstancePanel: boolean;
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
  const { user, clearAuth, accounts, activeAccountId, switchAccount, removeAccount, setAuth, permissions } =
    useAuthStore();
  const canViewApiKeys = hasPermissionAny(permissions, PermissionKey.MANAGE_API_KEYS, PermissionKey.API_KEYS_VIEW, PermissionKey.API_KEYS_CREATE, PermissionKey.API_KEYS_EDIT, PermissionKey.API_KEYS_DELETE);
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = React.useState<boolean>(false);

  // Pick up the brand and bootstrap document.title. The hook dedupes the
  // network fetch, so multiple components calling it is fine.
  const panelName = useSettingsStore((s) => s.panelName);
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = panelName || 'KS Panel';
  }, [panelName]);

  // prefs store — drives the four toggles.
  const prefs = usePrefsStore();
  const setPref = usePrefsStore((s) => s.setPref);

  // theme store — for the theme submenu.
  const themes = useThemeStore((s) => s.themes);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const assignments = useThemeStore((s) => s.assignments);
  const assignTheme = useThemeStore((s) => s.assignTheme);

  // The active area for the Theme submenu is the area the user is
  // currently looking at (default: admin). Switching a theme here
  // assigns it to that whole area's scope.
  const currentArea: AreaId | null =
    typeof window === 'undefined' ? null : areaFor(window.location.pathname);

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
  // Build the rich item list. Order matters: header → prefs group →
  // theme submenu → account actions.
  const items: RichMenuItem[] = React.useMemo(() => {
    const themeChildren: RichMenuItem[] = merged.map((t) => ({
      kind: 'checkbox',
      key: `theme-${t.id}`,
      label: t.name,
      checked: t.id === activeThemeId,
      hint: t.id === 'default' ? 'Built-in baseline theme' : undefined,
    }));

    const baseItems: RichMenuItem[] = [
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
      ...(canViewApiKeys
        ? [
            {
              key: 'api-keys',
              label: 'API Keys',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              ),
            } as RichMenuItem,
          ]
        : []),
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
    return baseItems;
  }, [merged, prefs, activeThemeId, currentArea, loggingOut, accounts, activeAccountId, canViewApiKeys]);

  const onSelect = (key: string) => {
    if (key === 'account') navigate('/account');
    else if (key === 'api-keys') navigate('/account/api-keys');
    else if (key === 'themes') navigate('/themes');
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

  const headerNode = (
    <div className="flex items-center gap-2.5 min-w-0">
      {/* Panel logo (or avatar fallback) so the brand stays present at the
       * top of the profile dropdown next to the identity lines. */}
      {panelLogo?.url ? (
        <img
          src={panelLogo.url}
          alt={panelName || 'Panel logo'}
          className="w-7 h-7 rounded-md object-cover shrink-0"
          loading="lazy"
        />
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
    <header className="glass-chrome ks-header-bg w-full flex items-center justify-between sticky top-0 z-20">
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

        {/* Instance tabs — visible when inside an instance panel.
            Horizontal scroll with gradient fade indicator. */}
        {inInstancePanel && <InstanceTabs />}
      </div>

      {/* Right cluster: notification bell + profile. The bell is the
       * powerful real-time surface — badge polls unread-count every 20s and
       * the dropdown surfaces the 10 most recent rows with inline mark-read.
       * Kept outside the profile RichMenu so the unread count stays glanceable
       * without opening any menu. Hidden inside instance panel to keep that
       * chrome minimal (instance tabs own the header there). */}
      {!inInstancePanel && (
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
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-full glass-chrome border border-white/10 text-gray-200 hover:text-white hover:bg-white/10 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 group overflow-hidden"
                title={user?.username ? `Profile: ${user.username}` : 'Profile'}
              >
                {/* Cycle-shaped profile icon like notification bell — shows user's avatar/symbol/initials centered in the circle.
                 * Uses the same glass-chrome + border + hover as NotificationBell for visual parity.
                 * Profit indicator: small green dot with dollar/trending icon overlay signals profit status. */}
                <span className="relative inline-flex items-center justify-center w-full h-full rounded-full overflow-hidden transition-transform duration-200 group-hover:scale-110">
                  <Avatar
                    name={user?.username || 'Guest'}
                    size={28}
                    accentColor={user?.accent_color || undefined}
                    symbol={user?.avatar_symbol}
                    imageUrl={user?.has_avatar ? `/api/users/${user.id}/avatar` : undefined}
                  />
                </span>
                {/* Profit badge — small cycle at bottom-right, like notification's unread dot but green for profit */}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0f0f12] hidden" aria-hidden="true" />
              </button>
            )}
          />
        </div>
      )}
    </header>
  );
};

export default Header;
