import client from '@/shared/api/client';
import type { ApiKey, CreateApiKeyResult, ApiKeyMutationPayload } from '@/features/api-keys/types/apiKey';
import type { Profile, SocialLink } from '@/shared/types/user';

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await client.get<ApiKey[]>('/api/me/api-keys');
  return res.data;
}

export async function createApiKey(
  payload: ApiKeyMutationPayload & { name: string; permissions: string[] },
): Promise<CreateApiKeyResult> {
  const res = await client.post<CreateApiKeyResult>('/api/me/api-keys', payload);
  return res.data;
}

export async function updateApiKey(
  id: number,
  payload: ApiKeyMutationPayload & { name: string; permissions: string[] },
): Promise<void> {
  await client.put(`/api/me/api-keys/${id}`, payload);
}

export async function deleteApiKey(id: number): Promise<void> {
  await client.delete(`/api/me/api-keys/${id}`);
}

// Profile changes (callers authenticate themselves; the body's old password
// proves they're the legit account owner).
export async function changeUsername(newUsername: string): Promise<void> {
  await client.put('/api/me/change-username', { new_username: newUsername });
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await client.put('/api/me/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

// ── Discord-like profile (display name, banner, avatar, bio, links) ────────

// getMyProfile returns the editing view of the caller's own profile: it
// carries the avatar_url / banner_url the SPA points <img> at so the page
// never has to assemble them by hand.
export async function getMyProfile(): Promise<Profile> {
  const res = await client.get<Profile>('/api/me/profile');
  return res.data;
}

// updateMyProfile accepts a partial payload — every field is optional and
// only the keys you pass get persisted; the rest keep their existing value.
export async function updateMyProfile(payload: {
  display_name?: string;
  bio?: string;
  pronouns?: string;
  accent_color?: string;
  avatar_symbol?: string;
  social_links?: SocialLink[];
}): Promise<Profile> {
  const res = await client.put<Profile>('/api/me/profile', payload);
  return res.data;
}

// uploadAvatar / uploadBanner send a multipart 'file' part and return the
// refreshed profile so the caller can update its <img src> from the new
// cache-busting filename returned by the backend.
export async function uploadAvatar(file: File): Promise<Profile> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post<Profile>('/api/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function uploadBanner(file: File): Promise<Profile> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post<Profile>('/api/me/banner', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteAvatar(): Promise<Profile> {
  const res = await client.delete<Profile>('/api/me/avatar');
  return res.data;
}

export async function deleteBanner(): Promise<Profile> {
  const res = await client.delete<Profile>('/api/me/banner');
  return res.data;
}

// getPublicProfile fetches the redacted (no email) profile for any user by id,
// used by an eventual public profile page. Returns the same shape as the
// self profile endpoint so a single component can render both.
export async function getPublicProfile(id: number): Promise<Profile> {
  const res = await client.get<Profile>(`/api/users/${id}/profile`);
  return res.data;
}

