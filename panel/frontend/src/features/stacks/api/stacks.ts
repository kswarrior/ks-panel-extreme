import client from '@/shared/api/client';
import type {
  Stack,
  StackActivateConflict,
  StackFileContent,
  StackFileEntry,
  StackNavEntry,
  StackEngineStatus,
  StackPageEntry,
  StackPageContent,
} from '@/shared/types/stack';

// Admin Stacks API — /api/stacks collection (MANAGE_STACKS-gated) plus the
// content endpoints under /api/stacks/v1/* (STACKS_VIEW-gated). Session rides
// the HttpOnly cookie; no extra headers.

export function extractStackApiError(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const msg = data.error ?? data.message ?? data.detail;
    if (typeof msg === 'string' && msg.trim()) return msg;
    try {
      const json = JSON.stringify(data);
      if (json && json !== '{}') return json;
    } catch {
      /* fall through */
    }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

export interface StackGrantDecision {
  capability: string;
  granted: boolean;
}

export async function listStacks(): Promise<Stack[]> {
  const res = await client.get<Stack[]>('/api/stacks/');
  return res.data;
}

export async function getStack(id: number): Promise<Stack> {
  const res = await client.get<Stack>(`/api/stacks/${id}`);
  return res.data;
}

export async function createStackFromManifest(
  manifest: Record<string, any>,
  source: 'studio' | 'json' = 'json',
): Promise<Stack> {
  const res = await client.post<Stack>('/api/stacks/', manifest, {
    headers: { 'Content-Type': 'application/json', 'X-KS-Source': source },
  });
  return res.data;
}

export async function uploadStackPackage(packageFile: File): Promise<Stack> {
  const form = new FormData();
  form.append('package', packageFile);
  const res = await client.post<Stack>('/api/stacks/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'json',
  });
  return res.data;
}

export async function installStackFromUrl(url: string): Promise<Stack> {
  const res = await client.post<Stack>(
    '/api/stacks/url',
    { url },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.data;
}

export async function downloadStack(id: number): Promise<Blob> {
  const res = await client.get<Blob>(`/api/stacks/${id}/download`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function updateStack(
  id: number,
  payload: { name: string; category: string; version: string; description: string; icon: string; color?: string; spec?: unknown },
): Promise<Stack> {
  const res = await client.put<Stack>(`/api/stacks/${id}`, payload);
  return res.data;
}

export async function deleteStack(id: number, wipe = false): Promise<void> {
  await client.delete(`/api/stacks/${id}${wipe ? '?wipe=1' : ''}`);
}

export async function setStackGrants(id: number, grants: StackGrantDecision[]): Promise<void> {
  await client.put(`/api/stacks/${id}/grants`, { grants });
}

// Activate resolves void on success, or the 409 checklist for the grant modal.
export async function activateStack(id: number): Promise<void | StackActivateConflict> {
  try {
    await client.post(`/api/stacks/${id}/activate`);
    return;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      return e.response.data as StackActivateConflict;
    }
    throw e;
  }
}

export async function deactivateStack(id: number): Promise<void> {
  await client.post(`/api/stacks/${id}/deactivate`);
}

export async function getStackNav(): Promise<StackNavEntry[]> {
  const res = await client.get<StackNavEntry[]>('/api/stacks/nav');
  return res.data;
}

export async function getStackEngine(): Promise<StackEngineStatus> {
  const res = await client.get<StackEngineStatus>('/api/stacks/engine');
  return res.data;
}

export async function setStackEngine(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await client.put('/api/stacks/engine', { enabled });
  return res.data;
}

// Content endpoints (served from the extracted workdir, active stacks only).
export async function listStackPages(slug: string): Promise<StackPageEntry[]> {
  const res = await client.get<StackPageEntry[]>(`/api/stacks/v1/pages/${encodeURIComponent(slug)}`);
  return res.data;
}

export async function getStackPage(slug: string, page: string): Promise<StackPageContent> {
  const res = await client.get<StackPageContent>(
    `/api/stacks/v1/pages/${encodeURIComponent(slug)}/${encodeURIComponent(page)}`,
  );
  return res.data;
}

export function stackUiUrl(slug: string, subPath = ''): string {
  const base = `/api/stacks/v1/ui/${encodeURIComponent(slug)}`;
  return subPath ? `${base}/${subPath.replace(/^\/+/, '')}` : `${base}/`;
}

export const STACK_SDK_URL = '/api/stacks/v1/ks-stack-sdk.js';
