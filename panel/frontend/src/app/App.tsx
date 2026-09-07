import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { panelBasename } from '@/shared/utils/panelBase';
import Router from '@/app/router';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { getPanelName } from '@/features/settings/api/settings';
import { applyBrandToDocument } from '@/shared/utils/brandTab';
import { fetchAuthorityBranding, isSafeAuthorityLogoUrl } from '@/shared/api/authorityBranding';
import { useThemeStore } from '@/shared/stores/themeStore';
import client from '@/shared/api/client';
import type { User } from '@/shared/types/user';
import { InstanceNavProvider } from '@/shared/components/layout/InstanceNavContext';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';
import ChatFab from '@/features/ai-chat/components/ChatFab';
import ChatPanel from '@/features/ai-chat/components/ChatPanel';

const App: React.FC = () => {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const bootstrapFromServer = useSettingsStore((s) => s.bootstrapFromServer);
  const reapplyTheme = useThemeStore((s) => s.reapply);
  const loadGlobalThemes = useThemeStore((s) => s.loadGlobal);
  // Non-401 boot-probe failure (5xx / network blip): initialized stays false
  // so RequireAuth keeps the boot splash instead of bouncing to login.
  // Without a visible retry the splash hangs forever — flag it so we can
  // offer a reload.
  const [bootFailed, setBootFailed] = React.useState(false);

  useEffect(() => {
    // The theme store applies the active theme at import time, but a quick
    // reapply here guarantees the DOM reflects any persisted change made
    // in another tab since this bundle loaded.
    reapplyTheme();
    let cancelled = false;

    // Bootstrap the brand from the API. Most navigations already get this
    // from the inline <script> in index.html (spliced by the Go server at
    // request time) – this fetch covers the case where the user lands on a
    // sub-route via direct URL link and React Router renders before the
    // bootstrap script runs (it doesn't, but this keeps us safe even if
    // the bundler changes).
    //
    // Authority branding is resolved in the SAME block with the SAME
    // "authority wins, else global fallback" precedence the login page
    // applies, so the two writers always converge: whichever resolves last
    // (this boot fetch or the login page's own fetch) leaves the identical
    // final brand instead of the boot fetch clobbering the login page's
    // authority logo with the global fallback.
    Promise.allSettled([getPanelName(), fetchAuthorityBranding()]).then(([nameRes, brandRes]) => {
      if (cancelled) return;
      const store = useSettingsStore.getState();
      if (nameRes.status === 'fulfilled') {
        const snap = nameRes.value;
        bootstrapFromServer({
          panel_name: snap.panel_name,
          panel_logo: snap.panel_logo,
          footer_text: snap.footer_text || 'KS Warrior',
          browser_tab_title: (snap as any).browser_tab_title || '',
          favicon: (snap as any).favicon || null,
          panel_root_url: (snap as any).panel_root_url || '',
          nameStyle: (snap as any).nameStyle,
          logoStyle: (snap as any).logoStyle,
        });
        applyBrandToDocument({
          panelName: snap.panel_name,
          tabTitle: (snap as any).browser_tab_title,
          faviconUrl: (snap as any).favicon?.url,
          faviconMime: (snap as any).favicon?.mime,
        });
      }
      if (brandRes.status === 'fulfilled') {
        const b = brandRes.value;
        store.setBranding({
          panel_name: b.panel_name,
          logo_url: b.logo_url,
          logo_source: b.logo_source,
          background_url: b.background_url,
          background_type: b.background_type,
          background_source: b.background_source,
        });
        if (b.panel_name) {
          store.setPanelName(b.panel_name);
          // Authority name wins for the tab (same clobber order as before);
          // the global favicon stays — authorities have no icon concept.
          const cur = useSettingsStore.getState();
          applyBrandToDocument({
            panelName: b.panel_name,
            faviconUrl: cur.favicon?.url,
            faviconMime: cur.favicon?.mime,
          });
        }
        if (b.logo_url && isSafeAuthorityLogoUrl(b.logo_url)) {
          store.setPanelLogo({ url: b.logo_url, mime: '' });
        }
      } else {
        store.setBranding(null);
      }
    }).catch(() => {/* fall back to bootstrap – silently */});

    client.get('/api/me').then((res: { data: { user: unknown; permissions: string[] } }) => {
      if (cancelled) return;
      const { user, permissions } = res.data as { user: User; permissions: string[] };
      setAuth(user, 'authenticated', permissions);
      // The user-keyed effect below pulls the admin-managed GLOBAL theme
      // store + re-applies the merged resolver as soon as `user` is set
      // (covering both this session-restore path and login-page logins).
    }).catch((err: { response?: { status?: number } }) => {
      if (cancelled) return;
      // Only treat an actual 401 as "no session". A network blip / 5xx
      // shouldn't rip the user's auth out from under them and force a
      // re-login on refresh — that's what was happening before. In that
      // case we keep initialized=false so RequireAuth keeps showing the
      // boot splash and the user can retry by reloading, rather than
      // being dropped onto the login screen over a transient error.
      if (err?.response?.status === 401) {
        clearAuth();
      } else {
        setBootFailed(true);
      }
    });
    return () => { cancelled = true };
  }, [setAuth, clearAuth, bootstrapFromServer, reapplyTheme, loadGlobalThemes]);

  // Whenever a session becomes active (initial /api/me success, a login-page
  // login, or a multi-account switch) re-fetch the ADMIN-MANAGED GLOBAL theme
  // store and re-apply the merged resolver. Without this, a SECOND device (or
  // any fresh browser) that logs in via the Login page would only see the
  // built-in Default until the user manually opened the Themes page — because
  // the App's mount-time /api/me already returned 401 (pre-login) and the
  // effect above never re-ran. loadGlobalThemes() re-applies for the current
  // route on success. Keying on user.id fires for every login/switch.
  useEffect(() => {
    if (!user) return;
    loadGlobalThemes();
  }, [user?.id, loadGlobalThemes]);

  return (
    <BrowserRouter basename={panelBasename}>
      <InstanceNavProvider>
        <ErrorBoundary label="app">
          <Router />
        </ErrorBoundary>
        {bootFailed && (
          <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-xl">
            Couldn&apos;t reach the panel server.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-white"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
        {/* Panel-owned confirm() dialog — replaces every native
            window.confirm across the app. */}
        <ConfirmDialog />
        {/* Panel-wide AI assistant (hidden on /auth + without AI_CHAT_USE
            by the components themselves). */}
        <ChatFab />
        <ChatPanel />
      </InstanceNavProvider>
    </BrowserRouter>
  );
};

export default App;
