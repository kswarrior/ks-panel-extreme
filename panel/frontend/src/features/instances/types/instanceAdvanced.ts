// Per-instance advanced feature types: secrets/env vault, automation jobs +
// runs, snapshots, the per-instance audit feed, and cached live state.

export interface Secret {
  id: number;
  instance_id: number;
  key: string;
  /** Visible-env value OR the revealed secret. Always present for is_secret=0;
   * populated for is_secret=1 only when an explicit reveal call was made. */
  value?: string;
  /** Masked preview, e.g. "ab••••cd". Present for is_secret=1 secrets. */
  masked_value?: string;
  is_secret: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface SecretUpsert {
  key: string;
  value: string;
  is_secret: boolean;
  description?: string;
}

export interface Automation {
  id: number;
  instance_id: number;
  name: string;
  command: string;
  /** 5-field cron expression, or '' for on-demand-only jobs. */
  schedule: string;
  enabled: boolean;
  secret_refs: string[];
  timeout_sec: number;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationUpsert {
  name: string;
  command: string;
  schedule: string;
  enabled: boolean;
  secret_refs?: string[];
  timeout_sec?: number;
}

export interface AutomationRun {
  id: number;
  job_id: number;
  instance_id: number;
  trigger: 'schedule' | 'manual';
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  error?: string;
  started_at: string;
  finished_at?: string;
}

/** Result of a manual "Run now" trigger. Mirrors the backend response. */
export interface AutomationRunResult {
  run_id: number;
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface InstanceSnapshot {
  id: number;
  instance_id: number;
  name: string;
  external_ref?: string;
  size_bytes?: number;
  note?: string;
  created_at: string;
}

export interface InstanceAuditRow {
  id: number;
  instance_id: number;
  actor: string;
  action: string;
  detail?: string;
  created_at: string;
}

/** Opaque driver-supplied live-state shapes. Decoded inline by the pages. */
export interface ProcessRow {
  pid: number;
  cmd?: string;
  name?: string;
  cpu?: number;
  mem?: number;
  rss?: number;
  user?: string;
}

export interface PortRow {
  proto?: string;
  laddr?: string;
  raddr?: string;
  pid?: number;
  state?: string;
}

export interface MetricsSnapshot {
  cpu?: number;
  cpu_pct?: number;
  mem?: number;
  mem_pct?: number;
  mem_used?: number;
  mem_total?: number;
  disk?: number;
  disk_pct?: number;
  disk_used?: number;
  disk_total?: number;
  net_rx?: number;
  net_tx?: number;
  net_in?: number;
  net_out?: number;
  load1?: number;
  uptime?: number;
  [k: string]: unknown;
}
