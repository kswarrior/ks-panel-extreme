import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import Router from '@/app/router';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { getPanelName } from '@/features/settings/api/settings';
import { useThemeStore } from '@/shared/stores/themeStore';
import client from '@/shared/api/client';
import type { User } from '@/shared/types/user';
import { InstanceNavProvider } from '@/shared/components/layout/InstanceNavContext';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';

const App: React.FC = () => {
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const user = useAuthStore((s) => s.user);
  const bootstrapFromServer = useSettingsStore((s) => s.bootstrapFromServer);
  const reapplyTheme = useThemeStore((s) => s.reapply);
  const loadGlobalThemes = useThemeStore((s) => s.loadGlobal);
  const authToken = useAuthStore((s) => {
    const idx = s.activeAccountId;
    return idx != null && s.accounts[idx] ? s.accounts[idx].token : null;
  });

  useEffect(() => {
    // The theme store applies the active theme at import time, but a quick
    // reapply here guarantees the DOM reflects any persisted change made
    // in another tab since this bundle loaded.
    reapplyTheme();
    let cancelled = false;
    // Debug: log token for auth
    console.log('App init active token:', useAuthStore.getState().activeAccountToken());

    // Bootstrap the brand from the API. Most navigations already get this
    // from the inline <script> in index.html (spliced by the Go server at
    // request time) – this fetch covers the case where the user lands on a
    // sub-route via direct URL link and React Router renders before the
    // bootstrap script runs (it doesn't, but this keeps us safe even if
    // the bundler changes).
    getPanelName()
      .then((snap) => {
        if (cancelled) return;
        bootstrapFromServer({
          panel_name: snap.panel_name,
          panel_logo: snap.panel_logo,
          footer_text: snap.footer_text || 'KS Warrior',
        });
        if (typeof document !== 'undefined' && snap.panel_name) {
          document.title = snap.panel_name;
        }
      })
      .catch(() => {/* fall back to bootstrap – silently */});

    if (!authToken) {
      setInitialized(true);
      return () => { cancelled = true };
    }
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
        setInitialized(true);
      }
    });
    return () => { cancelled = true };
  }, [setAuth, clearAuth, setInitialized, bootstrapFromServer, reapplyTheme, loadGlobalThemes, authToken]);

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
    <BrowserRouter>
      <InstanceNavProvider>
        <Router />
        {/* Panel-owned confirm() dialog — replaces every native
            window.confirm across the app. */}
        <ConfirmDialog />
      </InstanceNavProvider>
    </BrowserRouter>
  );
};

export default App;
