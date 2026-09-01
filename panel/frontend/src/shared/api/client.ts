import axios from 'axios';
import { useAuthStore } from '@/shared/stores/authStore';

// Base instance – Vite proxy will forward /api to the backend.
const client = axios.create({
  baseURL: '/',
  withCredentials: true, // send HttpOnly session cookie
  // 15s is well under any upstream proxy's origin-response window (typical
  // Cloudflare / nginx: 30-60s) and well above any healthy panel→edge round
  // trip. A request that hasn't answered in 15s is hung somewhere; abort it
  // so the page renders an error banner instead of a perpetual "Loading…"
  // state that confuses operators when the edge or an intermediary is wedged.
  timeout: 15000,
});

// Request interceptor: attach the active account's session token as an
// `Authorization: Bearer <token>` header so multi-account requests hit the
// right user even when the single HttpOnly cookie belongs to a different
// account. The backend's AuthMiddleware prefers the Bearer over the cookie.
//
// We read the token via the store getter on every request (NOT a captured
// value) so a switch between two XHRs in flight picks up the newly active
// account. When there is no token (boot probe, or the cookie is the source
// of truth for the primary account), we leave the header off and let the
// cookie authenticate — that keeps the first-load /api/me path exactly as
// it was before multi-account landed.
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().activeAccountToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: instantly redirect to login when any protected
// endpoint reports an invalid/expired/revoked session (401). Before this
// fix, only the initial App.tsx boot probe (/api/me) handled 401 by
// clearing auth and letting RequireAuth redirect — every later request
// that 401'd (e.g. after a panel restart that rotated
// KSPANEL_SESSION_SECRET or wiped the in-memory SessionManager) just
// surfaced an "invalid session" toast and stayed on the dashboard until
// the user manually refreshed, which re-ran the boot probe. Now all
// 401s from authenticated surfaces clear the stale token(s) and push to
// /auth/login without a refresh, while login-attempt 401s (bad
// password) are left alone so the Login page can show its own error.
let isRedirecting = false;
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error?.response?.status;
    const url: string = error?.config?.url || '';
    if (status === 401) {
      const isLoginAttempt =
        url.includes('/api/auth/login') || url.includes('/api/auth/switch-login');
      const isPublicAuthCheck =
        url.includes('/api/auth/register') ||
        url.includes('/api/auth/send-verify') ||
        url.includes('/api/auth/verify-email') ||
        url.includes('/api/auth/device-id') ||
        url.includes('/api/auth/flags') ||
        url.includes('/api/auth/oauth');
      if (!isLoginAttempt && !isPublicAuthCheck) {
        const state = useAuthStore.getState();
        const hadSession =
          !!(state.token || state.user || state.accounts.length > 0) ||
          url.includes('/api/me');
        if (hadSession && !isRedirecting) {
          isRedirecting = true;
          try {
            state.clearAuth();
          } catch {
            // Ensure initialized so RequireAuth can redirect even if clear fails
            try {
              state.setInitialized(true);
            } catch {}
          }
          // /api/me 401 on boot is already handled by App.tsx's clearAuth +
          // RequireAuth Navigate — don't force a full reload there, just
          // ensure the store is cleared and let React handle the redirect.
          const isMeProbe = url.includes('/api/me');
          if (!isMeProbe && typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
            // Replace so the back button doesn't return to a 401-failed page.
            setTimeout(() => {
              window.location.replace('/auth/login');
            }, 0);
            setTimeout(() => {
              isRedirecting = false;
            }, 1000);
          } else {
            // For boot probe or already-on-auth, just reset the guard shortly
            setTimeout(() => {
              isRedirecting = false;
            }, 500);
            // If this was a post-boot protected 401 while somehow still on
            // /auth (shouldn't happen), still try to settle at login
            if (!isMeProbe && typeof window !== 'undefined' && window.location.pathname.startsWith('/auth')) {
              try {
                state.clearAuth();
              } catch {}
            }
          }
        } else if (hadSession) {
          try {
            state.clearAuth();
          } catch {}
        }
      }
    }
    return Promise.reject(error);
  },
);

export default client;
