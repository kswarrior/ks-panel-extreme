import client from '@/shared/api/client';
import type { Instance } from '@/features/instances/types/instance';

// Self-service instances: every authenticated user (VIEW_INSTANCES) sees only
// the instances they own. Admins manage the whole fleet under /api/instances.
export async function listMyInstances(): Promise<Instance[]> {
  const res = await client.get<Instance[]>('/api/me/instances');
  return res.data;
}
