import client from '@/shared/api/client';
import type {
  AuthProviderInfo,
  MeAuthResponse,
  UserAuthorityConfig,
  UserAuthorityMode,
} from '@/features/authority/types/authority';
import { AUTHORITY_PROVIDER } from '@/features/authority/types/authority';

// Self-service "make my account safe" — GET returns the available
// authorities (admin-enabled ∩ role-allowed) alongside the user's current
// config in one round-trip so the Account page's authorities card paints
// in a single fetch. PUT persists the enabled subset + required-mode; the
// server sanitizes the enabled list against the live available set so a
// user can never grant themselves an authority outside what their role
// permits (the security boundary stays server-side, never client-side).

export async function getMyAuth(): Promise<MeAuthResponse> {
  const res = await client.get<MeAuthResponse>('/api/me/auth');
  return normalizeMeAuth(res.data);
}

// updateMyAuth ships the user's chosen enabled subset + the
// required-mode/how-many-N count. Returns the refreshed response so the
// SPA can update its local state without re-fetching the whole snapshot.
export async function updateMyAuth(
  payload: UserAuthorityConfig,
): Promise<MeAuthResponse> {
  const res = await client.put<MeAuthResponse>('/api/me/auth', payload);
  return normalizeMeAuth(res.data);
}

// normalizeMeAuth keeps the wire response access-safe for older/stale
// blobs: password is always implicitly available, enabled list + role
// permissions fall back to sensible empty defaults so the picker never
// dies on a missing field.
function normalizeMeAuth(raw: Partial<MeAuthResponse> | null | undefined): MeAuthResponse {
  const available: AuthProviderInfo[] = Array.isArray(raw?.available)
    ? raw!.available.map((p) => ({
        id: p.id,
        label: p.label || p.id,
        kind: p.kind === 'oauth' ? 'oauth' : 'channel',
      }))
    : [{ id: AUTHORITY_PROVIDER.password, label: 'Password', kind: 'channel' }];
  const cfg = raw?.cfg ?? {
    enabled_authorities: [AUTHORITY_PROVIDER.password],
    required_mode: 'any' as UserAuthorityMode,
    required_n: 1,
  };
  const enabled = Array.isArray(cfg.enabled_authorities)
    ? cfg.enabled_authorities.filter((x) => typeof x === 'string')
    : [];
  return {
    available,
    cfg: {
      enabled_authorities: enabled,
      required_mode: cfg.required_mode === 'n' || cfg.required_mode === 'all'
        ? cfg.required_mode
        : 'any',
      required_n: typeof cfg.required_n === 'number' && cfg.required_n > 0
        ? cfg.required_n
        : 1,
    },
    role_allowed: Array.isArray(raw?.role_allowed) ? raw!.role_allowed : undefined,
    unrestricted: !!raw?.unrestricted,
  };
}

// AuthProviderInfo re-export keeps callers on one import surface.
export type { AuthProviderInfo };
