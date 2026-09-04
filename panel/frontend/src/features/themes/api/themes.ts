import client from '@/shared/api/client';
import type { Theme } from '@/features/themes/types/theme';

// API client for the GLOBAL theme library (server-side, shared by every user).
// Personal/local themes are NOT sent over the network — they stay in the
// browser's localStorage; this module is only the admin-managed shared layer.
//
// Precedence the frontend resolver applies: local (localStorage) assignment >
// global (server) assignment > built-in 'default' theme. So a regular user's
// own personal theme always wins for them, while an admin's global theme still
// shows for everyone who hasn't picked their own.

// A server-saved theme. The `spec` field is the full Theme appearance object,
// so the resolver can drop it straight into the same theme applier the local
// themes use — no reshaping required.
export interface StoredTheme {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  spec: Theme;
  owner_name?: string;
  created_at: string;
  updated_at: string;
}

// The combined payload the public /api/themes endpoint returns: every global
// theme + the scope bindings, in one round-trip so the store can resolve the
// active route's theme immediately.
export interface ThemeStoreResponse {
  themes: StoredTheme[];
  assignments: { scope: string; theme_id: string }[];
}

// fetchThemesStore returns the global theme store. Any authenticated user can
// call this — it's the read path the resolver needs. Errors bubble up as
// rejected promises so the store can degrade gracefully (e.g. offline) rather
// than throw in module-init.
export async function fetchThemesStore(): Promise<ThemeStoreResponse> {
  const res = await client.get<ThemeStoreResponse>('/api/themes');
  return res.data;
}

export interface UpsertThemePayload {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  spec: Theme;
}

// createGlobalTheme publishes a new global theme. Requires MANAGE_THEMES on the
// server; 409 if a theme with that id already exists.
export async function createGlobalTheme(p: UpsertThemePayload): Promise<StoredTheme> {
  const res = await client.post<StoredTheme>('/api/themes', p);
  return res.data;
}

// updateGlobalTheme overwrites an existing global theme's name/description/spec.
export async function updateGlobalTheme(id: string, p: UpsertThemePayload): Promise<StoredTheme> {
  const res = await client.put<StoredTheme>(`/api/themes/${encodeURIComponent(id)}`, p);
  return res.data;
}

// deleteGlobalTheme removes a global theme; its assignments cascade-delete so
// any pages pointing at it fall back to default.
export async function deleteGlobalTheme(id: string): Promise<void> {
  await client.delete(`/api/themes/${encodeURIComponent(id)}`);
}

// assignGlobalTheme binds a scope (area:<id> / page:<id>) to a global theme.
// Pass an empty themeId to UN-assign the scope (resolver then falls back to the
// area default / built-in default).
export async function assignGlobalTheme(scope: string, themeId: string): Promise<void> {
  await client.put('/api/themes/assignments', { scope, theme_id: themeId });
}

export async function downloadTheme(id: string): Promise<Blob> {
  const res = await client.get(`/api/themes/${encodeURIComponent(id)}/download`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function installThemeFromUrl(url: string): Promise<StoredTheme> {
  const res = await client.post<StoredTheme>(
    '/api/themes/url',
    { url },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.data;
}

export async function uploadThemeFile(manifestFile: File): Promise<StoredTheme> {
  const form = new FormData();
  form.append('manifest', manifestFile);
  const res = await client.post<StoredTheme>('/api/themes', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ---- Theme marketplace (themelib-backed, mirrors the instance-pages market) ----

// A single theme-marketplace catalog entry. Same schema rules as the
// instance-pages marketplace.json so operator tooling treats both alike.
export interface ThemeMarketEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  tags: string[];
  download_url: string;
  icon_svg: string;
  preview_image: string;
}

export interface ThemeMarketCatalog {
  version: string;
  updated: string;
  pages: ThemeMarketEntry[];
}

// fetchThemeMarket lists the marketplace catalog (working-dir
// themes_market/ first, binary-embedded copy as fallback).
export async function fetchThemeMarket(): Promise<ThemeMarketCatalog> {
  const res = await client.get<ThemeMarketCatalog>('/api/themes/market');
  return res.data;
}

// installThemeFromMarket installs one catalog entry into the GLOBAL library
// server-side. Pass a catalog id, or a direct manifest URL (fetched with
// the same SSRF hardening as installThemeFromUrl). 409 when the id exists.
export async function installThemeFromMarket(id: string, url?: string): Promise<StoredTheme> {
  const res = await client.post<StoredTheme>('/api/themes/market/install', { id, url });
  return res.data;
}

// ---- Theme version history (migration 067) ----

// One snapshotted revision of a theme, newest-first. The spec is included
// so the studio History section can preview it without a second fetch.
export interface ThemeRevision {
  theme_id: string;
  rev: number;
  name: string;
  description: string;
  spec: Theme;
  created_at: string;
}

// fetchThemeRevisions lists every snapshotted revision of a theme.
export async function fetchThemeRevisions(id: string): Promise<ThemeRevision[]> {
  const res = await client.get<ThemeRevision[]>(`/api/themes/${encodeURIComponent(id)}/revisions`);
  return res.data;
}

// rollbackTheme restores a theme from one of its revisions. The server
// snapshots the pre-rollback row first, so the rollback stays reversible.
export async function rollbackTheme(id: string, rev: number): Promise<StoredTheme> {
  const res = await client.post<StoredTheme>(`/api/themes/${encodeURIComponent(id)}/rollback/${rev}`);
  return res.data;
}
