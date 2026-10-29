import type { Panel } from './types';

interface PanelsResponse {
  panels?: Panel[];
}

export async function fetchPanels(): Promise<Panel[]> {
  const res = await fetch(`/api/panels?_t=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (res.status === 401) {
    window.location.assign('/login');
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error(`http ${res.status}`);

  const data: unknown = await res.json();
  if (Array.isArray(data)) return data as Panel[];
  if (data && typeof data === 'object' && Array.isArray((data as PanelsResponse).panels)) {
    return (data as PanelsResponse).panels ?? [];
  }
  return [];
}
