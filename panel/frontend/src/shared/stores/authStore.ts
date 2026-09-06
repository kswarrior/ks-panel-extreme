import create from 'zustand';
import type { User } from '@/shared/types/user';

// Multi-account support.
//
// kspanel's backend issues a single HttpOnly session cookie per browser
// (so refresh-based auth keeps working), but the SPA can hold several
// accounts at once by keeping each account's signed session token
// (returned by /api/auth/login and /api/auth/switch-login) in
// localStorage and sending the ACTIVE one as `Authorization: Bearer`,
// which the middleware prefers over the cookie. This is the same model
// Discord / Chrome profiles use.
//
// `user` / `permissions` still describe the currently active account so
// every other component in the app (RequireAuth, guards, page titles...)
// stays untouched. `token` is retained for back-compat (some callers pass
// a sentinel like "authenticated"); it is NOT the real session token. The
// real tokens live in `accounts[].token` and back the Bearer header.

export interface Account {
  // The account's real signed session token (HMAC token from the backend).
  // Stored in localStorage so the multi-account switcher survives reloads.
  // Equivalent to the value placed in the HttpOnly cookie for the primary
  // login; for switch-added accounts there is no cookie — only this token.
  token: string;
  user: User;
  permissions: string[];
  // ISO timestamp the token was added, also used for "added X ago" labels.
  addedAt: string;
}

const ACCOUNTS_KEY = 'ks.accounts.list';
const ACTIVE_ID_KEY = 'ks.accounts.activeId';

// Persisted shape — same as Account. We read/write the whole list as one
// JSON blob so the active-vs-others distinction never leaks between reloads.
type StoredAccount = Account;

function loadAccounts(): Account[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is StoredAccount =>
        a && typeof a.token === 'string' && a && a.user && typeof a.user.id === 'number',
    );
  } catch {
    return [];
  }
}

function loadActiveId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ACTIVE_ID_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function persistAccounts(list: Account[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

function persistActiveId(id: number | null) {
  if (typeof window === 'undefined') return;
  if (id == null) window.localStorage.removeItem(ACTIVE_ID_KEY);
  else window.localStorage.setItem(ACTIVE_ID_KEY, String(id));
}

interface AuthState {
  user: User | null;
  token: string | null;
  permissions: string[];
  initialized: boolean;

  // Multi-account: every signed-in profile the SPA knows about + which one
  // is active. The active account's token is what api/client sends as the
  // Bearer header; the others are remembered so the user can switch back
  // without re-typing passwords.
  accounts: Account[];
  activeAccountId: number | null;

  // setAuth is the legacy "primary login" path: it sets the active user/
  // permissions AND records the account in the multi-account list when a
  // real token is supplied. After App.tsx's /api/me boot probe we call this
  // WITHOUT a usable token (the cookie is the source of truth) — in that
  // case we keep the existing account slot (if any) instead of clobbering
  // the stored token with a sentinel.
  setAuth: (user: User, token: string, permissions: string[]) => void;
  clearAuth: () => void;
  setInitialized: (v: boolean) => void;

  // Multi-account actions.
  // addAccount records a freshly-signed-in account (from /api/auth/login or
  // /api/auth/switch-login) and makes it the active one.
  addAccount: (token: string, user: User, permissions: string[]) => void;
  // switchAccount promotes an already-known account to active. The caller
  // is expected to re-hydrate user/permissions from /api/me afterwards.
  switchAccount: (accountId: number) => void;
  // removeAccount forgets a known account. If it was the active one and
  // others remain, the first remaining becomes active.
  removeAccount: (accountId: number) => void;
  // activeAccountToken returns the real session token for the currently
  // active account, or null (meaning: rely on the cookie). Read by
  // api/client's request interceptor.
  activeAccountToken: () => string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  permissions: [],
  initialized: false,
  // Hydrate the multi-account list once on store creation so the first
  // render (and the App.tsx boot probe) already sees persisted accounts.
  accounts: loadAccounts(),
  activeAccountId: loadActiveId(),

  setAuth: (user, token, permissions) =>
    set((state) => {
      // If we already have an account slot for this user, refresh its
      // permissions + user in-place but keep the real token it holds
      // (the boot probe passes a sentinel "authenticated" string, not a
      // usable token).
      const existingIdx = state.accounts.findIndex((a) => a.user.id === user.id);
      let nextAccounts: Account[];
      let nextActiveId: number | null;
      if (existingIdx !== -1) {
        nextAccounts = state.accounts.map((a, i) =>
          i === existingIdx
            ? {
                ...a,
                user,
                permissions,
                // Only overwrite the token when the caller supplied a real
                // (non-sentinel) one; otherwise keep the persisted real token.
                token:
                  token && token !== 'authenticated' && token !== '' ? token : a.token,
              }
            : a,
        );
        nextActiveId = state.activeAccountId ?? existingIdx;
      } else if (token && token !== 'authenticated' && token !== '') {
        // New account with a real token: record it (this is the normal login
        // path coming from Login.tsx).
        const acct: Account = {
          token,
          user,
          permissions,
          addedAt: new Date().toISOString(),
        };
        nextAccounts = [...state.accounts, acct];
        nextActiveId = nextAccounts.length - 1;
      } else {
        // Boot probe with no token: we have a cookie-backed session for a
        // user we don't yet know. Register a cookie-only placeholder so the
        // active-account machinery + switcher UI still works; api/client
        // will fall back to the cookie (activeAccountToken returns null)
        // because there's no token.
        const acct: Account = {
          token: '',
          user,
          permissions,
          addedAt: new Date().toISOString(),
        };
        nextAccounts = [...state.accounts, acct];
        nextActiveId = nextAccounts.length - 1;
      }
      persistAccounts(nextAccounts);
      persistActiveId(nextActiveId);
      return { user, token, permissions, initialized: true, accounts: nextAccounts, activeAccountId: nextActiveId };
    }),

  clearAuth: () =>
    set((state) => {
      // Remove the active account from the remembered list on logout so a
      // stale token isn't reused. If other accounts remain, the first one
      // becomes active so the user lands on a logged-in view (typical
      // "log out of this account" behaviour in a multi-account app).
      const remaining =
        state.activeAccountId != null
          ? state.accounts.filter((_, i) => i !== state.activeAccountId)
          : state.accounts;
      const nextActive = remaining.length > 0 ? 0 : null;
      persistAccounts(remaining);
      persistActiveId(nextActive);
      const active = nextActive != null ? remaining[nextActive] : null;
      return {
        user: active ? active.user : null,
        token: active ? active.token || 'authenticated' : null,
        permissions: active ? active.permissions : [],
        initialized: true,
        accounts: remaining,
        activeAccountId: nextActive,
      };
    }),

  setInitialized: (v) => set({ initialized: v }),

  addAccount: (token, user, permissions) =>
    set((state) => {
      // If the account is already known (re-login of an existing profile),
      // refresh it rather than duplicating the row.
      const existingIdx = state.accounts.findIndex((a) => a.user.id === user.id);
      let nextAccounts: Account[];
      if (existingIdx !== -1) {
        nextAccounts = state.accounts.map((a, i) =>
          i === existingIdx ? { ...a, token, user, permissions } : a,
        );
        persistAccounts(nextAccounts);
        persistActiveId(existingIdx);
        return { user, token: 'authenticated', permissions, accounts: nextAccounts, activeAccountId: existingIdx };
      }
      const acct: Account = {
        token,
        user,
        permissions,
        addedAt: new Date().toISOString(),
      };
      nextAccounts = [...state.accounts, acct];
      const nextActive = nextAccounts.length - 1;
      persistAccounts(nextAccounts);
      persistActiveId(nextActive);
      return { user, token: 'authenticated', permissions, accounts: nextAccounts, activeAccountId: nextActive };
    }),

  switchAccount: (accountId) =>
    set((state) => {
      const acct = state.accounts[accountId];
      if (!acct) return {};
      persistActiveId(accountId);
      return {
        user: acct.user,
        token: acct.token || 'authenticated',
        permissions: acct.permissions,
        activeAccountId: accountId,
      };
    }),

  removeAccount: (accountId) =>
    set((state) => {
      const remaining = state.accounts.filter((_, i) => i !== accountId);
      let nextActive: number | null = state.activeAccountId;
      // Shift the active pointer when the active one was removed or the
      // indices shifted because a lower-indexed row was deleted.
      if (state.activeAccountId == null || accountId === state.activeAccountId) {
        nextActive = remaining.length > 0 ? 0 : null;
      } else if (accountId < state.activeAccountId) {
        nextActive = state.activeAccountId - 1;
      }
      persistAccounts(remaining);
      persistActiveId(nextActive);
      const active =
        nextActive != null && remaining[nextActive] ? remaining[nextActive] : null;
      return {
        accounts: remaining,
        activeAccountId: nextActive,
        user: active ? active.user : null,
        token: active ? active.token || 'authenticated' : null,
        permissions: active ? active.permissions : [],
      };
    }),

  activeAccountToken: () => {
    const { accounts, activeAccountId } = get();
    if (activeAccountId == null) return null;
    const acct = accounts[activeAccountId];
    return acct && acct.token ? acct.token : null;
  },
}));
