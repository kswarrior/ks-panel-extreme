import client from '@/shared/api/client';
import { AUTHORITY_SECRET_KEEP } from '@/features/authority/types/authority';
import type {
  AuthorityConfig,
  AuthorityProvider,
  AuthorityOTPOptions,
  AuthorityAppConnection,
  AuthorityRegistrationMode,
  UserAuthorityConfig,
  AuthProviderInfo,
  MeAuthResponse,
} from '@/features/authority/types/authority';

export { AUTHORITY_SECRET_KEEP };
export type {
  AuthorityConfig,
  AuthorityProvider,
  AuthorityOTPOptions,
  AuthorityAppConnection,
  AuthorityRegistrationMode,
  UserAuthorityConfig,
  AuthProviderInfo,
  MeAuthResponse,
};

let lastSnapshot: AuthorityConfig | null = null;

export async function getAuthority(): Promise<AuthorityConfig> {
  const res = await client.get<AuthorityConfig>('/api/authority');
  const cfg: AuthorityConfig = res.data || {};
  lastSnapshot = cfg;
  return cfg;
}

export async function updateAuthority(payload: AuthorityConfig): Promise<AuthorityConfig> {
  const res = await client.put<AuthorityConfig>('/api/authority', payload);
  lastSnapshot = res.data || {};
  return lastSnapshot;
}

export async function regenerateAppSecret(): Promise<string> {
  const res = await client.post<{ secret: string }>(
    '/api/authority/app/regenerate-secret'
  );
  return res.data?.secret || '';
}

export function secretKeepOr(candidate: string | undefined): string {
  if (!candidate) return AUTHORITY_SECRET_KEEP;
  return candidate;
}

export function LastAuthoritySnapshot(): AuthorityConfig | null {
  return lastSnapshot;
}