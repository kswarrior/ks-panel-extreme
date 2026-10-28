import client from '@/shared/api/client';

export interface InstancePort {
  id: number;
  instance_id: number;
  host_port: number;
  container_port: number;
  protocol: string;
  ip: string;
  created_at: string;
}

export interface PortAllocationInput {
  host: number;
  container: number;
  protocol: string;
  ip?: string;
}

export interface LivePort {
  proto?: string;
  laddr?: string;
  raddr?: string;
  state?: string;
  pid?: number;
}

export interface PortsSnapshot {
  allocations: InstancePort[];
  live: LivePort[];
}

export interface PortsResponse {
  allocations?: InstancePort[];
  live?: LivePort[];
  ports?: LivePort[];
}

// getInstancePorts returns both DB allocations and the driver's live
// listening sockets. Older panels answered with a bare allocation array;
// normalize both shapes so the native page works against either.
export async function getInstancePorts(instanceId: number): Promise<PortsSnapshot> {
  const res = await client.get<PortsResponse | InstancePort[]>(`/api/instances/${instanceId}/ports`);
  const data: any = res.data;
  if (Array.isArray(data)) {
    return { allocations: data as InstancePort[], live: [] };
  }
  const allocations = data && Array.isArray(data.allocations) ? (data.allocations as InstancePort[]) : [];
  const liveRaw = data && (Array.isArray(data.live) ? data.live : data.ports);
  const live = Array.isArray(liveRaw) ? (liveRaw as LivePort[]) : [];
  return { allocations, live };
}

export async function listInstancePorts(instanceId: number): Promise<InstancePort[]> {
  const { allocations } = await getInstancePorts(instanceId);
  return allocations;
}

export async function updateInstancePorts(instanceId: number, ports: PortAllocationInput[]): Promise<InstancePort[]> {
  const res = await client.put<{ ok: boolean; allocations: InstancePort[]; edge_error?: string }>(`/api/instances/${instanceId}/ports`, { ports });
  if (res.data && Array.isArray(res.data.allocations)) return res.data.allocations;
  return [];
}

export function isIP(s: string): boolean {
  const ip = s.trim();
  if (ip === '') return true;
  // IPv4
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (v4.test(ip)) {
    return ip.split('.').every((oct) => {
      const n = Number(oct);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  // IPv6 simple: contains colon and hex chars
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v6.test(ip) && ip.includes(':')) {
    // basic validation: not empty groups, at most 8 groups, handle ::
    const parts = ip.split(':');
    if (parts.length > 8) return false;
    // allow empty part for ::
    for (const p of parts) {
      if (p === '') continue;
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return false;
    }
    return true;
  }
  return false;
}
