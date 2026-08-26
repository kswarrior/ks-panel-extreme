import client from '@/shared/api/client';
import type {
  Secret,
  SecretUpsert,
  Automation,
  AutomationUpsert,
  AutomationRun,
  AutomationRunResult,
  InstanceSnapshot,
  InstanceAuditRow,
  ProcessRow,
  PortRow,
  MetricsSnapshot,
} from '@/features/instances/types/instanceAdvanced';

const base = (id: number) => `/api/instances/${id}`;

// ---- Secrets / env -------------------------------------------------------

export async function listSecrets(instanceId: number): Promise<Secret[]> {
  const res = await client.get<Secret[]>(`${base(instanceId)}/secrets/`);
  return res.data;
}

export async function setSecret(
  instanceId: number,
  payload: SecretUpsert,
): Promise<void> {
  await client.post(`${base(instanceId)}/secrets/`, payload);
}

export async function revealSecret(
  instanceId: number,
  key: string,
): Promise<{ key: string; value: string }> {
  const res = await client.get<{ key: string; value: string }>(
    `${base(instanceId)}/secrets/${encodeURIComponent(key)}`,
  );
  return res.data;
}

export async function deleteSecret(instanceId: number, key: string): Promise<void> {
  await client.delete(`${base(instanceId)}/secrets/${encodeURIComponent(key)}`);
}

// ---- Automation ----------------------------------------------------------

export async function listAutomation(instanceId: number): Promise<Automation[]> {
  const res = await client.get<Automation[]>(`${base(instanceId)}/automation/`);
  return res.data;
}

export async function createAutomation(
  instanceId: number,
  payload: AutomationUpsert,
): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>(`${base(instanceId)}/automation/`, payload);
  return res.data;
}

export async function updateAutomation(
  instanceId: number,
  jobId: number,
  payload: AutomationUpsert,
): Promise<void> {
  await client.put(`${base(instanceId)}/automation/${jobId}`, payload);
}

export async function deleteAutomation(instanceId: number, jobId: number): Promise<void> {
  await client.delete(`${base(instanceId)}/automation/${jobId}`);
}

export async function listAutomationRuns(
  instanceId: number,
  limit?: number,
): Promise<AutomationRun[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const res = await client.get<AutomationRun[]>(
    `${base(instanceId)}/automation/runs${qs}`,
  );
  return res.data;
}

export async function runAutomationNow(
  instanceId: number,
  jobId: number,
): Promise<AutomationRunResult> {
  const res = await client.post<AutomationRunResult>(
    `${base(instanceId)}/automation/${jobId}/run`,
  );
  return res.data;
}

// ---- Processes / Metrics / Ports ----------------------------------------

export async function listProcesses(instanceId: number): Promise<ProcessRow[]> {
  const res = await client.get<ProcessRow[]>(`${base(instanceId)}/processes`);
  try {
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function killProcess(
  instanceId: number,
  pid: number,
  signal?: string,
): Promise<{ ok: boolean; killed: boolean; escalated: boolean; stopped_instance?: boolean }> {
  const params = new URLSearchParams();
  params.append('pid', String(pid));
  if (signal) params.append('signal', signal);
  const res = await client.post<{ ok: boolean; killed: boolean; escalated: boolean; stopped_instance?: boolean }>(
    `${base(instanceId)}/processes/kill?${params.toString()}`,
  );
  return res.data;
}

export async function getMetrics(instanceId: number): Promise<MetricsSnapshot> {
  const res = await client.get<MetricsSnapshot>(`${base(instanceId)}/metrics`);
  return res.data || {};
}

export async function listPorts(instanceId: number): Promise<PortRow[]> {
  const res = await client.get<PortRow[]>(`${base(instanceId)}/ports`);
  try {
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// ---- Snapshots -----------------------------------------------------------

export async function listSnapshots(instanceId: number): Promise<InstanceSnapshot[]> {
  const res = await client.get<InstanceSnapshot[]>(`${base(instanceId)}/snapshots/`);
  return res.data;
}

export async function createSnapshot(
  instanceId: number,
  payload: { name: string; note?: string; type?: string; location?: string },
): Promise<{ id: number; external_ref: string }> {
  const res = await client.post<{ id: number; external_ref: string }>(
    `${base(instanceId)}/snapshots/`,
    payload,
  );
  return res.data;
}

export async function restoreSnapshot(instanceId: number, snapName: string): Promise<void> {
  await client.post(`${base(instanceId)}/snapshots/${encodeURIComponent(snapName)}/restore`);
}

export async function deleteSnapshot(instanceId: number, snapName: string): Promise<void> {
  await client.delete(`${base(instanceId)}/snapshots/${encodeURIComponent(snapName)}`);
}

// ---- Per-instance audit --------------------------------------------------

export async function listInstanceAudit(
  instanceId: number,
  limit?: number,
): Promise<InstanceAuditRow[]> {
  const qs = limit ? `?limit=${limit}` : '';
  const res = await client.get<InstanceAuditRow[]>(
    `${base(instanceId)}/audit${qs}`,
  );
  return res.data;
}

// ---- Bulk cached live-state resources (no edge dial) --------------------
//
// The InstanceCard reads this once on mount so cards whose stored config has
// no `limits` block can still display real workload mem/disk numbers from
// the last successful inspect. The endpoint reads the live_state table
// directly — no per-instance HTTP dial — so it's safe to fan-out across a
// page of N cards.
export interface CachedResource {
  id: number;
  cpu_pct: number;
  mem_used: number;
  mem_total: number;
  disk_used: number;
  disk_total: number;
  updated_at: string;
}

export async function listCachedResources(): Promise<CachedResource[]> {
  const res = await client.get<CachedResource[]>('/api/instances/cached-resources');
  return Array.isArray(res.data) ? res.data : [];
}

// ---- Instance actions ----------------------------------------------------
//
// The /api/instances/{id}/actions/{actionId}/invoke route is the
// operator-clicked button on the instance home page that runs a
// template-defined named action (Minecraft's "Start Java", a "Backup" one-off
// shell, etc.). The panel proxies through the edge install-workflow engine,
// so an action invocation registers a fresh install record on the edge that
// installSweepLoop polls for progress. On done, the sweep loop applies the
// action's auto_stop_on_exit flag: container stops if true, otherwise stays.
export interface InvokeActionResponse {
  id: number;
  action_id: string;
  action_name: string;
  install_state: string;
  status: string;
}

export async function invokeInstanceAction(
  instanceId: number,
  actionId: string,
): Promise<InvokeActionResponse> {
  const res = await client.post<InvokeActionResponse>(
    `/api/instances/${instanceId}/actions/${encodeURIComponent(actionId)}/invoke`,
  );
  return res.data;
}

// Stop an in-flight action: cancels the edge install workflow for this
// instance and (when the template action defines a stop_command) runs that
// command once inside the container. Only the action currently reported as
// running (install_state='running' + install_action_id matches) can be
// stopped — the panel's StopActionHandler refuses a mismatch so a stale
// Stop click can't cancel a different action by mistake.
export interface StopActionResponse {
  id: number;
  action_id: string;
  edge_state: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  stop_command: string;
}

export async function stopInstanceAction(
  instanceId: number,
  actionId: string,
  ): Promise<StopActionResponse> {
  const res = await client.post<StopActionResponse>(
    `/api/instances/${instanceId}/actions/${encodeURIComponent(actionId)}/stop`,
  );
  return res.data;
}
// (Custom-page action execution lives in the page SDK —
// shared/lib/customPageSdk.ts → POST /api/instance-pages/execute-action with
// instance_id + page_slug. A previous host-side helper here posted without
// page_slug, which the backend always rejects, and had no callers.)
