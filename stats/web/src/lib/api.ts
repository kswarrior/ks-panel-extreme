import type { Panel } from './types';

interface PanelsResponse {
  panels?: Panel[];
}

export interface OverviewStats {
  total: number;
  online: number;
  offline: number;
  nodes: number;
  instances: number;
  running: number;
  avg_cpu: number;
  avg_ram: number;
  versions: string[];
  latest_version: string;
  updated_at: string;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export async function fetchPanels(): Promise<Panel[]> {
  const res = await fetch(`/api/panels?_t=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`http ${res.status}`);

  const data: unknown = await res.json();
  if (Array.isArray(data)) return data as Panel[];
  if (data && typeof data === 'object' && Array.isArray((data as PanelsResponse).panels)) {
    return (data as PanelsResponse).panels ?? [];
  }
  return [];
}

export async function fetchOverview(): Promise<OverviewStats> {
  const res = await fetch(`/api/overview?_t=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as OverviewStats;
}
