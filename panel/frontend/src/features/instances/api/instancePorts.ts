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

export interface PortsResponse {
  allocations: InstancePort[];
  live: unknown[];
  ports: unknown[];
}

export async function listInstancePorts(instanceId: number): Promise<InstancePort[]> {
  const res = await client.get<PortsResponse | InstancePort[]>(`/api/instances/${instanceId}/ports`);
  const data: any = res.data;
  if (Array.isArray(data)) return data as InstancePort[];
  if (data && Array.isArray(data.allocations)) return data.allocations as InstancePort[];
  if (data && Array.isArray(data.ports) && data.allocations === undefined) {
    // legacy live array, no allocations yet
    return [];
  }
  return [];
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
