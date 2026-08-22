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

export default client;
