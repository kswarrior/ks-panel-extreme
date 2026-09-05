import client from '@/shared/api/client';
import type { User, Role, Permission } from '@/shared/types/user';
import type { ApiKey, ApiKeyMutationPayload } from '@/features/api-keys/types/apiKey';
import type { Node, NodeHeartbeat, CreateNodeResult, ProbeResult, SetupLocalResult, NodeUpdateInfoResponse, NodeUpdateCheckResponse, NodeUpdateApplyResponse, NodeReinstallBackgroundResponse, RollingFleetUpdatePayload, RollingFleetUpdateResponse, UpdateWindow, UpdateWindowUpsert } from '@/features/nodes/types/node';
import type { Template, Instance, DeployRequest } from '@/features/instances/types/instance';
import type { InstancePage, CreateInstancePagePayload, UpdateInstancePagePayload } from '@/features/instance-pages/types/instancePage';
export type { InstancePage, CreateInstancePagePayload, UpdateInstancePagePayload };
import type { ActivityLog } from '@/features/activity/types/activity';
import type {
  SystemSnapshot,
  DatabaseInfo,
  UpdateInfoResponse,
  UpdateCheckResponse,
  UpdateApplyResponse,
  ReinstallResponse,
  ReinstallBackgroundResponse,
} from '@/features/system/types/system';
import type { SecuritySnapshot, SecurityConfig } from '@/features/security/types/security';
import type {
  SecuritySessionsResponse,
  SecurityStatusResponse,
  LockoutStatus,
  RecoveryCodesStatus,
  DDOSBackgroundResponse,
} from '@/features/security/types/security';

// Admin users API
export async function listUsers(): Promise<User[]> {
  const res = await client.get<User[]>('/api/users/');
  return res.data;
}

export async function createUser(payload: {
  username: string;
  email: string;
  password: string;
  role_id: number;
}): Promise<void> {
  await client.post('/api/users/', payload);
}

export async function updateUser(
  id: number,
  payload: { username: string; email: string; role_id: number; password?: string },
): Promise<void> {
  await client.put(`/api/users/${id}`, payload);
}

export async function deleteUser(id: number): Promise<void> {
  await client.delete(`/api/users/${id}`);
}

export async function suspendUser(
  id: number,
  payload: { reason: string; duration_hours?: number }
): Promise<{ suspension_count: number }> {
  const res = await client.post<{ suspension_count: number }>(`/api/users/${id}/suspend`, payload);
  return res.data;
}

export async function unsuspendUser(id: number): Promise<{ suspension_count: number }> {
  const res = await client.post<{ suspension_count: number }>(`/api/users/${id}/unsuspend`);
  return res.data;
}

// Admin roles API
export async function listRoles(): Promise<Role[]> {
  const res = await client.get<Role[]>('/api/roles/');
  return res.data;
}

export async function createRole(payload: {
  name: string;
  display_name?: string;
  color?: string;
  description: string;
  icon?: string;
  permissions: string[];
  allowed_auth_types?: string[] | null;
}): Promise<void> {
  await client.post('/api/roles/', payload);
}

export async function updateRole(
  id: number,
  payload: { name: string; display_name?: string; color?: string; description: string; icon?: string; permissions: string[]; allowed_auth_types?: string[] | null },
): Promise<void> {
  await client.put(`/api/roles/${id}`, payload);
}

export async function deleteRole(id: number): Promise<void> {
  await client.delete(`/api/roles/${id}`);
}

// Permissions API (used by the role editor)
export async function listPermissions(): Promise<Permission[]> {
  const res = await client.get<Permission[]>('/api/permissions');
  return res.data;
}

// Authority-provider inventory the RoleForm's "allowed authorities" picker
// derives its option list from. Returns only the admin-enabled provider
// ids + labels + kind so the picker is single-source-of-truth driven by
// the AuthorityConfig the Authority page edits.
export interface AuthProviderInfo {
  id: string;
  label: string;
  kind: 'oauth' | 'channel';
}

export async function listAuthProviders(): Promise<AuthProviderInfo[]> {
  const res = await client.get<AuthProviderInfo[]>('/api/roles/providers');
  return Array.isArray(res.data) ? res.data : [];
}

// Admin API keys – operate across ALL users (gated by MANAGE_API_KEYS).
export async function listAdminApiKeys(): Promise<ApiKey[]> {
  const res = await client.get<ApiKey[]>('/api/api-keys/');
  return res.data;
}

export async function createAdminApiKey(
  payload: ApiKeyMutationPayload & { name: string; user_id: number; permissions: string[] },
): Promise<ApiKey & { token: string }> {
  const res = await client.post<ApiKey & { token: string }>(
    '/api/api-keys/',
    payload,
  );
  return res.data;
}

export async function updateAdminApiKey(
  id: number,
  payload: ApiKeyMutationPayload & { name: string; permissions: string[] },
): Promise<void> {
  await client.put(`/api/api-keys/${id}`, payload);
}

export async function deleteAdminApiKey(id: number): Promise<void> {
  await client.delete(`/api/api-keys/${id}`);
}

// Admin nodes (edges) – gated by MANAGE_NODES. The panel dials each edge over
// http or https depending on the stored use_tls flag.
export async function listNodes(): Promise<Node[]> {
  const res = await client.get<Node[]>('/api/nodes/');
  return res.data;
}

// Advanced per-edge configuration forwarded verbatim to the panel. Missing /
// zero values fall back to the panel's column defaults so legacy callers that
// only send name/address/use_tls stay compatible.
export interface WssChannelPayload {
  name: string;
  task?: string;
  transport?: string;
  fallback?: boolean;
}

export interface WssChannelRow {
  id: number;
  node_id: number;
  name: string;
  task: string;
  transport: string;
  fallback: boolean;
  position: number;
}

export interface NodeAdvancedFields {
  connection_mode?: string;
  wss_channels?: WssChannelPayload[];
  health_enabled?: boolean;
  health_interval?: number;
  health_timeout?: number;
  health_retries?: number;
  skip_tls_verify?: boolean;
  notes?: string;
  install_dir?: string;
  allowed_kinds?: string;
  alloc_mem_mib?: number;
  mem_overcommit_pct?: number;
  alloc_disk_mib?: number;
  disk_overcommit_pct?: number;
  instances_dir?: string;
  category?: string;
  location_country?: string;
  location_node?: string;
  /** Symbolic icon key from the fixed registry (validated server-side). */
  icon?: string;
  /** Accent colour as #rrggbb (validated server-side). */
  color?: string;
}

export async function createNode(payload: {
  name: string;
  address: string;
  use_tls: boolean;
} & NodeAdvancedFields): Promise<CreateNodeResult> {
  const res = await client.post<CreateNodeResult>('/api/nodes/', payload);
  return res.data;
}

export async function updateNode(
  id: number,
  payload: { name: string; address: string; use_tls: boolean } & NodeAdvancedFields,
): Promise<void> {
  await client.put(`/api/nodes/${id}`, payload);
}

export async function deleteNode(id: number): Promise<void> {
  await client.delete(`/api/nodes/${id}`);
}

export async function rotateNodeToken(id: number): Promise<{ token: string }> {
  const res = await client.post<{ token: string }>(
    `/api/nodes/${id}/rotate-token`,
  );
  return res.data;
}

// Create & setup – installs and launches a ksedge edge directly on the panel
// host for a localhost-mode node. Returns an inline log + probe verdict so the
// modal can confirm the edge came up instead of leaving the operator to
// manually recheck the card.
// NOTE: This can take 60-90s on first run (download + launch) so we lift the
// global 15s client timeout for THIS call only; otherwise a Cloudflare-fronted
// origin that needs a cold download would 502 with "origin_bad_gateway" while
// the panel was still streaming the HF/GitHub artifact.
export async function setupLocalNode(id: number): Promise<SetupLocalResult> {
  const res = await client.post<SetupLocalResult>(
    `/api/nodes/${id}/setup-local`,
    null,
    { timeout: 300000 },
  );
  return res.data;
}

// Purge a local edge completely: stop the panel-spawned ksedge daemon, delete
// its on-disk directory (binary/config/log) AND drop the node row from the
// panel. Only valid for localhost nodes — the backend returns 400 for remote
// ones. The returned log lets the modal report exactly what was torn down.
export async function purgeLocalNode(id: number): Promise<{ ok: boolean; message?: string; log?: string[] }> {
  const res = await client.post<{ ok: boolean; message?: string; log?: string[] }>(
    `/api/nodes/${id}/purge-local`,
  );
  return res.data;
}

// Named WSS channels per node (migration 062) — the NodeForm WSS box rows.
// Reads are view-level; writes are edit-level like the node itself.
export async function listNodeWssChannels(id: number): Promise<WssChannelRow[]> {
  const res = await client.get<WssChannelRow[]>(`/api/nodes/${id}/wss-channels`);
  return res.data;
}

export async function createNodeWssChannel(
  id: number,
  payload: WssChannelPayload,
): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>(
    `/api/nodes/${id}/wss-channels`,
    payload,
  );
  return res.data;
}

export async function updateNodeWssChannel(
  id: number,
  cid: number,
  payload: WssChannelPayload,
): Promise<void> {
  await client.put(`/api/nodes/${id}/wss-channels/${cid}`, payload);
}

export async function deleteNodeWssChannel(id: number, cid: number): Promise<void> {
  await client.delete(`/api/nodes/${id}/wss-channels/${cid}`);
}

export async function nodeHeartbeats(
  id: number,
  limit = 60,
): Promise<NodeHeartbeat[]> {
  const res = await client.get<NodeHeartbeat[]>(
    `/api/nodes/${id}/heartbeats?limit=${limit}`,
  );
  return res.data;
}

// Per-card "Recheck" probe — actively dials the edge's /health and records the
// result on the row so the next listNodes reflects the fresh verdict.
export async function probeNode(id: number): Promise<ProbeResult> {
  const res = await client.post<ProbeResult>(
    `/api/nodes/${id}/probe`,
  );
  return res.data;
}

// Page-level "Recheck all" — probes every edge in parallel and returns the
// bulk per-node results without needing a listNodes re-fetch.
export async function probeAllNodes(): Promise<ProbeResult[]> {
  const res = await client.post<ProbeResult[] | { results: ProbeResult[] }>(`/api/nodes/probe`);
  // Backend wraps in {results:[...]}; handle both wrapped and flat shapes.
  const data = res.data;
  return Array.isArray(data) ? data : (data as any).results ?? [];
}


// ---- Templates -----------------------------------------------------------
export async function listTemplates(): Promise<Template[]> {
  const res = await client.get<Template[]>('/api/templates/');
  return res.data;
}

export async function createTemplate(payload: {
  name: string;
  description: string;
  kind: string;
  image: string;
  spec: string;
  icon?: string;
  color?: string;
}): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/templates/', payload);
  return res.data;
}

export async function updateTemplate(
  id: number,
  payload: { name: string; description: string; kind: string; image: string; spec: string; icon?: string; color?: string },
): Promise<void> {
  await client.put(`/api/templates/${id}`, payload);
}

export async function deleteTemplate(id: number): Promise<void> {
  await client.delete(`/api/templates/${id}`);
}

export async function downloadTemplate(id: number): Promise<Blob> {
  const res = await client.get(`/api/templates/${id}/download`, {
    responseType: 'blob',
  });
  return res.data;
}

// Install-from-URL: server-side fetch of a public manifest URL (SSRF-guarded).
// Mirrors the file-upload path — the panel parses + validates the fetched
// body through the same handler chain.
export async function installTemplateFromURL(url: string): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/templates/url', { url });
  return res.data;
}

// ---- Instances -----------------------------------------------------------
export async function listInstances(): Promise<Instance[]> {
  const res = await client.get<Instance[]>('/api/instances/');
  return res.data;
}

// Fetches a single instance row (same shape as listInstances entries).
export async function getInstance(id: number): Promise<Instance> {
  const res = await client.get<Instance>(`/api/instances/${id}`);
  return res.data;
}

export interface UpdateInstancePayload {
  // Full edited spec (the serializeEditor output). The backend merges it
  // over the stored config and recreates the workload when a
  // create-time-only field changed.
  config: Record<string, unknown>;
}

// Saves admin edits to an instance's config. `recreated` is true when the
// backend tore the workload down and kicked off an async redeploy because a
// create-time-only field (image/ports/mounts/env/command/…) changed.
export async function updateInstance(
  id: number,
  payload: UpdateInstancePayload,
): Promise<{ id: number; status: string; recreated: boolean }> {
  const res = await client.put<{ id: number; status: string; recreated: boolean }>(
    `/api/instances/${id}`,
    payload,
  );
  return res.data;
}

// Deploys an instance from a template + node + optional per-deploy edits.
// Returns the created instance's id/external_id/status, or rejects with an
// Axios error whose `.response.data` is the structured deploy failure the
// backend emits when the edge rejects or is unreachable. The InstanceForm
// renders the {error, detail, node, kind, name} fields as a banner.
export async function deployInstance(
  payload: DeployRequest,
): Promise<{ id: number; external_id: string; status: string }> {
  try {
    const res = await client.post('/api/instances/', payload);
    return res.data;
  } catch (e: any) {
    // We want the InstanceForm catch block to see the *original* axios error
    // so it can render the structured {error, detail, node, kind, name} JSON
    // the backend sends on edge rejection (HTTP 502) — fall through there.
    //
    // Two non-JSON failure shapes need a clean message here instead of leaking
    // a raw proxy/CDN error page (e.g. Cloudflare's "origin returned an
    // invalid or incomplete response" HTML) into the deploy banner:
    //   1. transport-level failure (ERR_NETWORK / ECONNABORTED / timeout) —
    //      no `response` at all, the panel origin never answered;
    //   2. a non-JSON body (HTML/text) returned by an intermediary proxy
    //      because the origin didn't answer within its window.
    const data = e?.response?.data;
    const isStructured = data && typeof data === 'object';
    if (isStructured) throw e;

    const code = e?.code;
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') {
      throw new Error(
        'Could not reach the panel origin — the deploy request timed out or ' +
        'the panel is behind a proxy (e.g. Cloudflare) whose origin response ' +
        'window expired before the edge finished provisioning. Check that ' +
        'the edge node is up, its driver CLI (docker) is installed, and the ' +
        'panel can dial it.',
      );
    }

    // Non-JSON body from an intermediary. `e.response.data` may be a huge HTML
    // page; surface a concise message with the HTTP status rather than the
    // raw markup.
    const status = e?.response?.status;
    if (status) {
      throw new Error(
        `Panel origin returned HTTP ${status} with a non-JSON body — the ` +
        'deploy likely exceeded an upstream proxy timeout. Make sure the ' +
        'edge node responds quickly to the deploy RPC (e.g. docker image is ' +
        'already pulled and the container starts detached).',
      );
    }

    throw new Error(e?.message || 'Deploy failed');
  }
}

export async function startInstance(id: number): Promise<void> {
  await client.post(`/api/instances/${id}/start`);
}

export async function stopInstance(id: number): Promise<void> {
  await client.post(`/api/instances/${id}/stop`);
}

export async function killInstance(id: number): Promise<void> {
  await client.post(`/api/instances/${id}/kill`);
}

export async function restartInstance(id: number): Promise<void> {
  await client.post(`/api/instances/${id}/restart`);
}

export async function destroyInstance(id: number): Promise<void> {
  await client.delete(`/api/instances/${id}`);
}

export async function suspendInstance(
  id: number,
  payload: { reason: string; duration_hours?: number }
): Promise<{ suspension_count: number }> {
  const res = await client.post<{ suspension_count: number }>(`/api/instances/${id}/suspend`, payload);
  return res.data;
}

export async function unsuspendInstance(id: number): Promise<{ suspension_count: number }> {
  const res = await client.post<{ suspension_count: number }>(`/api/instances/${id}/unsuspend`);
  return res.data;
}

// ---- Activity (audit feed) ------------------------------------------------
// Optional `category` filters the feed to a single bucket (user/role/node/
// template/instance/api_key/settings/auth). Pass an empty string for "all".
export async function listActivity(
  category?: string,
  limit?: number,
): Promise<ActivityLog[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (limit && limit > 0) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await client.get<ActivityLog[]>(`/api/activity${qs}`);
  return res.data;
}

// ---- System (monitoring snapshot) ---------------------------------------
// One round-trip carries every tile the System page renders so the page
// can paint in a single fetch and refresh on an interval without re-querying.
export async function systemSnapshot(): Promise<SystemSnapshot> {
  const res = await client.get<SystemSnapshot>('/api/system');
  return res.data;
}

// ---- Database (read-only inspector) ---------------------------------------
// Returns the engine metadata + per-table listing used by the Database
// admin page. Pure snapshot — there is no mutation endpoint here.
export async function databaseInfo(): Promise<DatabaseInfo> {
  const res = await client.get<DatabaseInfo>('/api/database');
  return res.data;
}

// Database engine catalogue the admin "Change Database" form renders. Kept
// server-side so adding a dialect is a one-file change instead of plumbing
// the option through the SPA bundle too.
export interface DatabaseEngineInfo {
  name: string;
  label: string;
  default_port: string;
  supports_url: boolean;
}

// One copied table inside a "Change Database" sync. baseline_rows is the
// source COUNT(*) captured while the table was streamed; target_rows is what
// the new database holds afterwards.
export interface DatabaseTableSyncResult {
  table: string;
  baseline_rows: number;
  source_rows: number;
  target_rows: number;
  rows_copied: number;
  status: string;
}

// Result of a "Change Database" submit. The backend validates connectivity
// against the new engine before doing anything else; OK=false surfaces a
// human error in `message` for the form banner. When sync_data was requested
// the response also carries the full pipeline outcome: the pre-switch backup
// coordinates, per-table copy results, step log, post-sync recheck results
// and whether an error rolled the target back.
export interface DatabaseEngineSwitchResponse {
  ok: boolean;
  engine: string;
  dsn: string; // Always redacted — safe to render / log.
  message: string;
  requires_restart: boolean;
  // ── Sync pipeline results ──
  synced: boolean;
  rows_copied: number;
  tables: DatabaseTableSyncResult[];
  steps: string[];
  duration_ms: number;
  backup_id?: string;
  backup_path?: string;
  backup_bytes?: number;
  rolled_back: boolean;
  verified: boolean;
  verify_issues: string[];
  verify_warnings: string[];
}

export interface DatabaseEngineSwitchPayload {
  engine: string;
  dsn?: string;
  url?: string;
  user?: string;
  password?: string;
  database?: string;
  // ── Operator-configurable sync options ──
  // Copy every row from the current database into the new one before the
  // coordinates are persisted.
  sync_data: boolean;
  create_backup?: boolean;
  verify?: boolean;
  batch_size?: number;
  clear_target?: boolean;
  tables?: string[];
}

export async function listDatabaseEngines(): Promise<DatabaseEngineInfo[]> {
  const res = await client.get<DatabaseEngineInfo[]>('/api/database/engines');
  return res.data;
}

// Validates the operator's new DB coordinates against the target engine and,
// on success, persists them to kspanel.env so the next `launch` picks them
// up. With sync_data enabled the request additionally backs up the current
// database, migrates every row across, rechecks the result and restores the
// previous state on any failure — that can take minutes on big databases, so
// the 15s client default is explicitly lifted for THIS call only (timeout: 0
// = no client-side abort).
export async function switchDatabaseEngine(
  payload: DatabaseEngineSwitchPayload,
): Promise<DatabaseEngineSwitchResponse> {
  const res = await client.post<DatabaseEngineSwitchResponse>(
    '/api/database/engine',
    payload,
    { timeout: 0 },
  );
  return res.data;
}

// ---- Database integrity verification ------------------------------------
// Scheduled sweep (default daily, configurable) running PRAGMA quick_check
// (SQLite) + connection probe + table-count sanity (all engines). Failures
// write activity_logs + notify admins; the last-run status rides on
// DatabaseInfo.verify_* so the Database page can badge it.
export interface DatabaseVerifyResult {
  ok: boolean;
  engine: string;
  checked_at: string;
  table_count: number;
  duration_ms: number;
  issues: string[];
  warnings: string[];
  cron: string;
  next_run_at?: string;
}

export interface DatabaseVerifyConfig {
  cron: string;
  next_run_at?: string | null;
  last_at?: string | null;
  last_ok?: boolean | null;
  last_issues: string[];
  last_warnings: string[];
  last_engine: string;
  last_table_count: number;
  last_duration_ms: number;
}

// Runs verification now and returns the result (also persisted as the new
// last-verify status; failures audit-log + notify admins).
export async function runDatabaseVerify(): Promise<DatabaseVerifyResult> {
  const res = await client.get<DatabaseVerifyResult>('/api/database/verify', { timeout: 0 });
  return res.data;
}

// Reads the verify schedule + last status without running a check.
export async function getDatabaseVerifyConfig(): Promise<DatabaseVerifyConfig> {
  const res = await client.get<DatabaseVerifyConfig>('/api/database/verify/config');
  return res.data;
}

// Updates the verify cron (5-field). Recomputes next_run server-side.
export async function updateDatabaseVerifyConfig(cron: string): Promise<{ ok: boolean; cron: string; next_run_at: string }> {
  const res = await client.put<{ ok: boolean; cron: string; next_run_at: string }>('/api/database/verify/config', { cron });
  return res.data;
}

// ---- Database → Backup tab ------------------------------------------------
// Named on-disk snapshots under <DataDir>/backups. Create is VACUUM INTO
// (SQLite) or a native pg_dump / mysqldump artifact (Postgres/MySQL) with
// gzip/zstd compression; download streams the stored bytes; upload accepts
// a multipart file or a remote URL. Schedules drive cron VACUUM INTO +
// retention prune; the S3 remote pushes/pulls via SigV4. All gated by
// ACCESS_ADMIN_PANEL on the backend so only database admins can use them.
export interface DatabaseBackup {
  id: string;
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
  sha256: string;
  source: string;
  is_live_safe: boolean;
  compressed: boolean;
  compression: string;
  s3_pushed: boolean;
}

export async function listDatabaseBackups(): Promise<DatabaseBackup[]> {
  const res = await client.get<DatabaseBackup[]>('/api/database/backups');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createDatabaseBackup(name: string, compression?: string): Promise<DatabaseBackup> {
  const res = await client.post<DatabaseBackup>('/api/database/backups', { name, compression: compression || 'none' });
  return res.data;
}

export async function downloadDatabaseBackup(id: string): Promise<Blob> {
  const res = await client.get(`/api/database/backups/${encodeURIComponent(id)}/download`, {
    responseType: 'blob',
  });
  return res.data as Blob;
}

export async function uploadDatabaseBackup(file: File): Promise<DatabaseBackup> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await client.post<DatabaseBackup>('/api/database/backups/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return res.data;
}

export async function uploadDatabaseBackupByURL(url: string): Promise<DatabaseBackup> {
  const res = await client.post<DatabaseBackup>(
    '/api/database/backups/upload/url',
    { url },
    { timeout: 0 },
  );
  return res.data;
}

export async function restoreDatabaseBackup(id: string): Promise<{ ok: boolean; message: string }> {
  const res = await client.post<{ ok: boolean; message: string }>(
    `/api/database/backups/${encodeURIComponent(id)}/restore`,
  );
  return res.data;
}

export async function deleteDatabaseBackup(id: string): Promise<void> {
  await client.delete(`/api/database/backups/${encodeURIComponent(id)}`);
}

export interface BackupSchedule {
  id: number;
  kind: string;
  instance_id?: number | null;
  name: string;
  cron: string;
  enabled: boolean;
  keep_last_n: number;
  max_age_days: number;
  compression: string;
  s3_push: boolean;
  next_run_at?: string | null;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupScheduleUpsert {
  name: string;
  cron: string;
  enabled: boolean;
  keep_last_n: number;
  max_age_days: number;
  compression: string;
  s3_push: boolean;
}

export async function listDBBackupSchedules(): Promise<BackupSchedule[]> {
  const res = await client.get<BackupSchedule[]>('/api/database/backups/schedules');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createDBBackupSchedule(payload: BackupScheduleUpsert): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/database/backups/schedules', payload);
  return res.data;
}

export async function updateDBBackupSchedule(id: number, payload: BackupScheduleUpsert): Promise<void> {
  await client.put(`/api/database/backups/schedules/${id}`, payload);
}

export async function deleteDBBackupSchedule(id: number): Promise<void> {
  await client.delete(`/api/database/backups/schedules/${id}`);
}

export async function pruneDBBackups(keep_last_n: number, max_age_days: number): Promise<{ removed: string[]; count: number }> {
  const res = await client.post<{ removed: string[]; count: number }>('/api/database/backups/prune', { keep_last_n, max_age_days });
  return res.data;
}

export interface S3ConfigView {
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  access_key: string;
  configured: boolean;
  updated_at?: string;
}

export async function getBackupS3Config(): Promise<S3ConfigView> {
  const res = await client.get<S3ConfigView>('/api/database/backups/s3');
  return res.data;
}

export async function putBackupS3Config(payload: { endpoint: string; bucket: string; region: string; prefix: string; access_key: string; secret_key: string }): Promise<void> {
  await client.put('/api/database/backups/s3', payload);
}

export async function pushDBBackupToS3(id: string): Promise<void> {
  await client.post(`/api/database/backups/${encodeURIComponent(id)}/s3/push`);
}

export async function pullDBBackupFromS3(filename: string): Promise<void> {
  await client.post('/api/database/backups/s3/pull', { filename }, { timeout: 0 });
}

// ---- Security (per-request telemetry aggregated) --------------------------
// One round-trip carries every tile the Security admin page renders so the
// page can paint in a single fetch and refresh on an interval without
// re-querying. The backend aggregates the security_requests feed into the
// headline counters (RPS, top IPs, blocked, errors, bandwidth, login
// attempts, ...) on demand.
export async function securitySnapshot(): Promise<SecuritySnapshot> {
  const res = await client.get<SecuritySnapshot>('/api/security');
  return res.data;
}

// Toggle the persisted Attack Status flag (the "Under Attack / Normal"
// switch on the Security page). Returns the resulting flag so the SPA can
// update its UI without re-fetching the whole snapshot.
export async function securityToggleAttack(underAttack: boolean): Promise<{ under_attack: boolean }> {
  const res = await client.post<{ under_attack: boolean }>(
    '/api/security/attack',
    { under_attack: underAttack },
  );
  return res.data;
}

// Get the full security config (per-IP RPM, window, global RPM, UA block, DDoS).
export async function securityGetConfig(): Promise<SecurityConfig> {
  const res = await client.get<SecurityConfig>('/api/security/config');
  return res.data;
}

// Update the security config (per-IP RPM, window, global RPM, UA block, DDoS).
export async function securityUpdateConfig(config: SecurityConfig): Promise<SecurityConfig> {
  const res = await client.put<SecurityConfig>('/api/security/config', config);
  return res.data;
}

// Reset DDoS auto-stop runtime state (stop count and cooldown).
export async function securityDDOSReset(): Promise<{ status: string }> {
  const res = await client.post<{ status: string }>('/api/security/ddos/reset', {});
  return res.data;
}

// Manually trigger a DDoS auto-stop (for testing).
export async function securityDDOSManualStop(): Promise<{
  status: string;
  stop_count: number;
  cooldown_until: string;
}> {
  const res = await client.post<{
    status: string;
    stop_count: number;
    cooldown_until: string;
  }>('/api/security/ddos/stop', {});
  return res.data;
}

// getDDOSScript downloads the standalone ddos.sh emergency port-switch
// script. The script stops the panel and restarts it on the DDoS
// alternate port WITHOUT saving that port as the last port, so the next
// normal start returns to the original one.
export async function getDDOSScript(): Promise<string> {
  const res = await client.get('/api/security/ddos/script', {
    responseType: 'text',
  });
  return res.data;
}

// ddosBackground triggers the panel to write a ddos.sh script next to
// its binary and execute it detached. Returns immediately while the
// panel stops and comes back on the alternate port in the background.
export async function ddosBackground(): Promise<DDOSBackgroundResponse> {
  const res = await client.post<DDOSBackgroundResponse>('/api/security/ddos/background');
  return res.data;
}

// Read-only status of the panel-wide network protections (CORS / CSRF /
// security headers / cookie flags) rendered by the Firewall tab.
export async function securityGetStatus(): Promise<SecurityStatusResponse> {
  const res = await client.get<SecurityStatusResponse>('/api/security/status');
  return res.data;
}

// ---- Security → Sessions tab -----------------------------------------------
export async function securityListSessions(): Promise<SecuritySessionsResponse> {
  const res = await client.get<SecuritySessionsResponse>('/api/security/sessions');
  return res.data;
}

// Revoke one tracked session by its non-reversible id.
export async function securityRevokeSession(id: string): Promise<{ status: string }> {
  const res = await client.delete<{ status: string }>(`/api/security/sessions/${id}`);
  return res.data;
}

// Revoke every active tracked session for all users.
export async function securityRevokeAllSessions(): Promise<{ status: string; revoked: number }> {
  const res = await client.post<{ status: string; revoked: number }>('/api/security/sessions/revoke-all', {});
  return res.data;
}

// ---- Security → Authentication tab ------------------------------------------
export async function securityGetLockout(): Promise<LockoutStatus> {
  const res = await client.get<LockoutStatus>('/api/security/authentication/lockout');
  return res.data;
}

export async function securityUnlockAccount(username: string): Promise<{ status: string }> {
  const res = await client.post<{ status: string }>('/api/security/authentication/unlock', { username });
  return res.data;
}

export async function securityRecoveryCodesStatus(): Promise<RecoveryCodesStatus> {
  const res = await client.get<RecoveryCodesStatus>('/api/security/authentication/recovery-codes');
  return res.data;
}

// Mint a replacement recovery-code set for a user. Codes are returned
// exactly once — the backend stores only bcrypt hashes.
export async function securityGenerateRecoveryCodes(username: string, count = 8): Promise<{ codes: string[] }> {
  const res = await client.post<{ codes: string[] }>(
    '/api/security/authentication/recovery-codes/generate',
    { username, count },
  );
  return res.data;
}

// ---- Instance Pages --------------------------------------------------------
export async function listInstancePages(): Promise<InstancePage[]> {
  const res = await client.get<InstancePage[]>('/api/instance-pages/');
  return res.data;
}

export async function getInstancePage(id: number): Promise<InstancePage> {
  const res = await client.get<InstancePage>(`/api/instance-pages/${id}`);
  return res.data;
}

export async function createInstancePage(payload: CreateInstancePagePayload): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/instance-pages/', payload);
  return res.data;
}

// Bulk create — fast-path for "Select all visible → Import". Single HTTP
// round-trip, single DB transaction, ~10x faster than N sequential
// createInstancePage calls. Directly adds staterpages (starter pages) to
// instance_pages in one go without browser-per-page looping.
export interface BulkCreateInstancePagesResult {
  imported: number;
  skipped: number;
  errors: string[];
  ids: number[];
}

export async function bulkCreateInstancePages(
  pages: CreateInstancePagePayload[],
): Promise<BulkCreateInstancePagesResult> {
  const res = await client.post<BulkCreateInstancePagesResult>('/api/instance-pages/bulk', { pages });
  return res.data;
}

// Alias matching user's "staterpages to pages" wording — same endpoint, just
// a naming alias so existing starter-centric code and new staterpages-centric
// callers both resolve without browser-per-page loops.
export const bulkCreateStaterPages = bulkCreateInstancePages;

export async function updateInstancePage(
  id: number,
  payload: UpdateInstancePagePayload,
): Promise<void> {
  await client.put(`/api/instance-pages/${id}`, payload);
}

export async function deleteInstancePage(id: number): Promise<void> {
  await client.delete(`/api/instance-pages/${id}`);
}

// Link an existing instance page into one or more templates' spec.pages. The
// page's content is copied into each template's spec so the Instance panel
// renders it as a custom sidebar page without a second round-trip. Re-linking
// re-seeds the spec from the latest instance page content (idempotent on slug).
export async function linkInstancePage(
  id: number,
  payload: { template_ids: number[]; label?: string; icon_svg?: string; icon_color?: string; enabled?: boolean },
): Promise<{ linked: number[]; skipped: number[] }> {
  const res = await client.post<{ linked: number[]; skipped: number[] }>(
    `/api/instance-pages/${id}/link`,
    payload,
  );
  return res.data;
}

export interface InstancePageAction {
  type: 'shell' | 'read_file' | 'write_file' | 'list_files' | 'docker' | 'kvm' | 'lxd';
  command?: string;
  path?: string;
  content?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface InstancePageActionResult {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  error?: string;
  data?: any;
}

// Execute a saved page action against a specific instance (Studio "Test
// execute"). instance_id is REQUIRED by the backend — it resolves the node,
// verifies the page is enabled in that instance's spec snapshot and proxies
// to the edge. Omitting it made every test run fail with
// "instance_id and type are required" (HTTP 400).
export async function executePageAction(
  pageId: number,
  instanceId: number,
  action: InstancePageAction
): Promise<InstancePageActionResult> {
  const res = await client.post<InstancePageActionResult>(
    `/api/instance-pages/${pageId}/actions`,
    { instance_id: instanceId, ...action }
  );
  return res.data;
}

export async function executeModulePageAction(
  instanceId: number,
  moduleId: string,
  action: {
    type: InstancePageAction['type']
    command?: string
    path?: string
    content?: string
    args?: string[]
    env?: Record<string, string>
    timeout?: number
  }
): Promise<InstancePageActionResult> {
  const res = await client.post<InstancePageActionResult>(
    '/api/instance-pages/execute-module-action',
    {
      instance_id: instanceId,
      module_id: moduleId,
      ...action,
    }
  );
  return res.data;
}

// ---- Instance Page Modules ------------------------------------------------
export interface InstancePageModuleManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  license: string
  homepage: string
  repository: string
  slug: string
  kind: string
  category: string
  entry: string
  exports?: Record<string, string>
  permissions?: Record<string, string[]>
  capabilities?: Record<string, any>
  instanceConstraints?: Record<string, any>
  ui?: Record<string, any>
  configuration?: Record<string, any>
  dependencies?: Record<string, any>
}

export interface InstalledModule extends InstancePageModuleManifest {
  path: string
  installedAt: string
  installedBy: number
}

// List all available instance page modules (marketplace + local)
export async function listInstancePageModules(): Promise<InstancePageModuleManifest[]> {
  const res = await client.get<InstancePageModuleManifest[]>('/api/instance-page-modules/')
  return res.data
}

// Get module manifest by ID and version
export async function getInstancePageModuleManifest(
  moduleId: string,
  version: string
): Promise<InstancePageModuleManifest> {
  const res = await client.get<InstancePageModuleManifest>(`/api/instance-page-modules/${encodeURIComponent(moduleId)}/${encodeURIComponent(version)}`)
  return res.data
}

// Upload a .kspm module file
export async function uploadInstancePageModule(file: File): Promise<{ id: string; name: string; version: string; message: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await client.post<{ id: string; name: string; version: string; message: string }>(
    '/api/instance-page-modules/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  return res.data
}

// Install a module from the marketplace
export async function installInstancePageModule(
  moduleId: string,
  version: string
): Promise<{ module_id: string; version: string; message: string }> {
  const res = await client.post<{ module_id: string; version: string; message: string }>(
    '/api/instance-page-modules/install',
    { module_id: moduleId, version }
  )
  return res.data
}

// Uninstall a module
export async function uninstallInstancePageModule(
  moduleId: string,
  version: string
): Promise<void> {
  await client.delete(`/api/instance-page-modules/${encodeURIComponent(moduleId)}/${encodeURIComponent(version)}`)
}

// Import Instance Page from file upload
export async function importInstancePageFromFile(file: File): Promise<{ id: number; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post<{ id: number; message: string }>(
    '/api/instance-pages/import',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return res.data;
}

// Import Instance Page from URL
export async function importInstancePageFromURL(url: string): Promise<{ id: number; message: string }> {
  const res = await client.post<{ id: number; message: string }>(
    '/api/instance-pages/import/url',
    { url }
  );
  return res.data;
}

// Marketplace types
export interface MarketplacePage {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  tags: string[];
  download_url: string;
  icon_svg: string;
  icon_color?: string;
  preview_image: string;
}

export interface MarketplaceCatalog {
  version: string;
  updated: string;
  pages: MarketplacePage[];
}

// Get marketplace catalog
export async function getMarketplacePages(): Promise<MarketplaceCatalog> {
  const res = await client.get<MarketplaceCatalog>('/api/instance-pages/marketplace');
  return res.data;
}

// Import Instance Page from marketplace
export async function importInstancePageFromMarketplace(pageId: string): Promise<{ id: number; message: string }> {
  const res = await client.post<{ id: number; message: string }>(
    '/api/instance-pages/import/marketplace',
    { page_id: pageId }
  );
  return res.data;
}

export interface ResyncMarketplaceResult {
  updated: number;
  skipped: number;
  errors: string[];
  ids: number[];
}

// Resync all market-tracked pages from their marketplace download links.
export async function resyncMarketplacePages(): Promise<ResyncMarketplaceResult> {
  const res = await client.post<ResyncMarketplaceResult>(
    '/api/instance-pages/import/marketplace/resync',
    {}
  );
  return res.data;
}

// List local instance pages from instance_pages directory
export interface LocalInstancePage {
  name: string;
  slug: string;
  kind: string;
  category: string;
  /** Page flavor tag (dashboard, status, docs, …). Optional: older library files omit it. */
  type?: string;
  description: string;
  content_type: string;
  content_html: string;
  content_markdown: string;
  content_blocks: string;
  icon_svg: string;
  icon_color?: string;
  /** Multi-page support: extra pages shipped with this definition. */
  pages?: import('@/features/instance-pages/types/instancePage').InstancePageSubPage[];
}

export async function listLocalInstancePages(): Promise<LocalInstancePage[]> {
  const res = await client.get<LocalInstancePage[]>('/api/instance-pages/local');
  return res.data;
}

// Import Instance Page from local directory
export async function importLocalInstancePage(filename: string): Promise<{ id: number; message: string }> {
  const res = await client.post<{ id: number; message: string }>(
    '/api/instance-pages/import/local',
    { filename }
  );
  return res.data;
}

// ---- Panel self-update (Updates tab on the System page) ------------------
// All three endpoints sit under MANAGE_PANEL_UPDATE. The apply endpoint
// is destructive: it swaps the running binary and restarts the panel. The
// HTTP response returns BEFORE the swap happens so the SPA can paint a
// "panel is restarting" banner immediately — the next page load hits the
// freshly upgraded binary.

// getUpdateInfo returns the local build identity (version / commit / build
// date stamped in via -ldflags at build time) plus the public artefact URLs
// the check + apply endpoints use. Pure read, safe to poll.
export async function getUpdateInfo(): Promise<UpdateInfoResponse> {
  const res = await client.get<UpdateInfoResponse>('/api/system/update-info');
  return res.data;
}

// checkUpdate fetches the remote version.json manifest and compares it
// against the local build. Returns a single object whose `available` flag
// drives the "Update available" badge on the Updates tab.
export async function checkUpdate(): Promise<UpdateCheckResponse> {
  const res = await client.get<UpdateCheckResponse>('/api/system/update-check');
  return res.data;
}

// applyUpdate downloads the latest kspanel binary, swaps it over the
// running executable and restarts the panel. The HTTP response returns
// BEFORE the swap is performed, so the SPA can show a "restarting" banner
// and start polling /api/system to detect when the new binary
// answers.
export async function applyUpdate(): Promise<UpdateApplyResponse> {
  const res = await client.post<UpdateApplyResponse>('/api/system/update-apply');
  return res.data;
}

// reinstallUpdate forces a reinstall of the current channel binary from
// the update URL. This is useful if the on-disk binary was corrupted or
// replaced externally. It uses the same endpoint as applyUpdate since the
// backend just downloads from the fixed URL and replaces the binary.
export async function reinstallUpdate(): Promise<ReinstallResponse> {
  const res = await client.post<ReinstallResponse>('/api/system/reinstall');
  return res.data;
}

// getReinstallScript downloads the standalone reinstall.sh script that
// runs independently of the panel process. The script stops the panel,
// downloads the new binary, starts it, and rolls back to the old binary
// if download fails or new binary fails to start.
export async function getReinstallScript(): Promise<string> {
  const res = await client.get('/api/system/reinstall-script', {
    responseType: 'text',
  });
  return res.data;
}

// reinstallBackground triggers the panel to write a reinstall.sh script
// to the binary directory and execute it in the background. The script
// stops the panel, downloads the new binary, starts it with the same port,
// and rolls back on failure. Returns immediately while the script runs detached.
export async function reinstallBackground(): Promise<ReinstallBackgroundResponse> {
  const res = await client.post<ReinstallBackgroundResponse>('/api/system/reinstall-background');
  return res.data;
}

// ---- Per-node edge self-update (NodeDetail → Update & Reinstall) --------
// The panel proxies a trigger RPC to the edge, and the edge downloads +
// swaps + restarts via its own reinstall.sh (mirrors the System → Panel
// tab, but the script lives on the edge host). Info/check are view-level;
// the three mutating verbs are edit-level (like setup-local).
// Apply/reinstall can take minutes (binary download + relaunch), so the
// 15s client default is lifted for THOSE calls only (timeout: 300000).

export async function getNodeUpdateInfo(id: number): Promise<NodeUpdateInfoResponse> {
  const res = await client.get<NodeUpdateInfoResponse>(`/api/nodes/${id}/update-info`);
  return res.data;
}

export async function checkNodeUpdate(id: number): Promise<NodeUpdateCheckResponse> {
  const res = await client.get<NodeUpdateCheckResponse>(`/api/nodes/${id}/update-check`);
  return res.data;
}

export async function applyNodeUpdate(id: number): Promise<NodeUpdateApplyResponse> {
  const res = await client.post<NodeUpdateApplyResponse>(
    `/api/nodes/${id}/update-apply`,
    null,
    { timeout: 300000 },
  );
  return res.data;
}

export async function reinstallNode(id: number): Promise<NodeUpdateApplyResponse> {
  const res = await client.post<NodeUpdateApplyResponse>(
    `/api/nodes/${id}/reinstall`,
    null,
    { timeout: 300000 },
  );
  return res.data;
}

export async function reinstallNodeBackground(id: number): Promise<NodeReinstallBackgroundResponse> {
  const res = await client.post<NodeReinstallBackgroundResponse>(
    `/api/nodes/${id}/reinstall-background`,
    null,
    { timeout: 300000 },
  );
  return res.data;
}

// ---- Fleet rolling update (POST /api/nodes/update-all) -------------------
// Orchestrated rollout: order nodes (canary subset first), per node
// check→apply→poll edge /health + heartbeat until healthy/timeout, stop
// on first failure. MANAGE_NODES edit-gated + audit-logged server-side.
// A full fleet can take minutes per node, so the client timeout is lifted
// for this call (timeout: 0 = no client-side abort).
export async function rollingFleetUpdate(payload: RollingFleetUpdatePayload): Promise<RollingFleetUpdateResponse> {
  const res = await client.post<RollingFleetUpdateResponse>(
    '/api/nodes/update-all',
    payload,
    { timeout: 0 },
  );
  return res.data;
}

// ---- Scheduled update windows (migration 068) ----------------------------
// Panel surface (MANAGE_PANEL_UPDATE): cron schedules that self-update the
// panel binary inside a daily maintenance window (skip + log outside).
export async function listPanelUpdateWindows(): Promise<UpdateWindow[]> {
  const res = await client.get<UpdateWindow[]>('/api/system/update-windows');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createPanelUpdateWindow(payload: UpdateWindowUpsert): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/system/update-windows', payload);
  return res.data;
}

export async function updatePanelUpdateWindow(id: number, payload: UpdateWindowUpsert): Promise<void> {
  await client.put(`/api/system/update-windows/${id}`, payload);
}

export async function deletePanelUpdateWindow(id: number): Promise<void> {
  await client.delete(`/api/system/update-windows/${id}`);
}

// Fleet surface (MANAGE_NODES view/edit): cron schedules that run the
// rolling update over every node inside a maintenance window.
export async function listFleetUpdateWindows(): Promise<UpdateWindow[]> {
  const res = await client.get<UpdateWindow[]>('/api/nodes/update-windows');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createFleetUpdateWindow(payload: UpdateWindowUpsert): Promise<{ id: number }> {
  const res = await client.post<{ id: number }>('/api/nodes/update-windows', payload);
  return res.data;
}

export async function updateFleetUpdateWindow(id: number, payload: UpdateWindowUpsert): Promise<void> {
  await client.put(`/api/nodes/update-windows/${id}`, payload);
}

export async function deleteFleetUpdateWindow(id: number): Promise<void> {
  await client.delete(`/api/nodes/update-windows/${id}`);
}