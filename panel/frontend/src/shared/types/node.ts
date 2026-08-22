export interface Node {
  id: number;
  name: string;
  /** host:port the panel dials to drive the edge. May also be a bare hostname
   * (e.g. a Cloudflare-tunnel URL) when no port is needed. */
  address: string;
  /** 1/true => dial https://, false => http:// */
  use_tls: boolean;
  token_prefix: string;
  /** When true the panel's background sweep loop actively probes this edge
   * every `health_interval` seconds. Operators can disable it for edges
   * reachable only from a private network the panel can't dial. */
  health_enabled: boolean;
  /** Seconds between scheduled active probes. */
  health_interval: number;
  /** Seconds to wait for a single probe response. */
  health_timeout: number;
  /** Failed probe attempts before the card flips to down. */
  health_retries: number;
  /** Let the panel dial a self-signed edge without making the global probe
   * client outright insecure. */
  skip_tls_verify: boolean;
  /** Free-text user-facing notes shown on the node card. */
  notes: string;
  /** Override for the local-edge install directory (empty = ./localnode/ksedge-<id>). */
  install_dir: string;
  /** Comma-locked set of instance kinds that may deploy to this edge
   * ("docker,kvm,multipass,lxd"). Empty = no restriction. */
  allowed_kinds: string;
  /** Panel-side memory cap (MiB). 0 = unset / inherit live telemetry. */
  alloc_mem_mib: number;
  /** Allowed memory over-allocation as a % of the cap (e.g. 150 = 1.5x). */
  mem_overcommit_pct: number;
  /** Panel-side disk cap (MiB). 0 = unset / inherit live telemetry. */
  alloc_disk_mib: number;
  /** Allowed disk over-allocation as a % of the cap. */
  disk_overcommit_pct: number;
  /** Daemon instance-working-files directory the panel forwards to ksedge.
   *  Empty = daemon default "./instances". */
  instances_dir: string;
  /** Free-text bucket label the operator attaches to the node
   *  ("production", "staging", "dev", "tenant-acme", …). Empty = uncategorised. */
  category: string;
  /** ISO-3166 alpha-2 country code the node physically lives in. The UI
   *  resolves emoji + display name from a client-side table. Empty = none. */
  location_country: string;
  /** Operator's per-site label ("node-1", "rack-a3", …). Empty = none. */
  location_node: string;
  ram_used: number;
  ram_total: number;
  cpu_percent: number;
  disk_used: number;
  disk_total: number;
  /** Sentinel uptime counter reported by the edge, in seconds. */
  uptime_secs: number;
  /** "up" | "down" — derived by the panel from heartbeat freshness (raw column). */
  status: string;
  /**
   * Card-level verdict the UI keys on. Expands the binary status into four
   * states so the operator can tell "pending" (never heard from) from "down"
   * (broke after working) from "partial" (reachable but missing data) from "up".
   */
  state?: 'pending' | 'down' | 'partial' | 'up';
  /** 0-100 rolling uptime over the trailing 24h. */
  uptime_pct: number;
  /** Driver availability reported by ksedge — drives the 4-segment ring. */
  driver_docker: boolean;
  driver_kvm: boolean;
  driver_multipass: boolean;
  driver_lxd: boolean;
  /**
   * Per-metric "did the edge actually collect this?" flags. A false on
   * `hw_ram_ok` means "the edge swallowed a /proc error and sent a fake 0",
   * not "the box has no memory" — the card dims just that bar rather than
   * the whole card. Old edges that don't ship these leave them undefined.
   */
  hw_ram_ok?: boolean;
  hw_cpu_ok?: boolean;
  hw_disk_ok?: boolean;
  hw_uptime_ok?: boolean;
  hw_drivers_ok?: boolean;
  /** Last active probe outcome (panel → edge GET /health). */
  probe_reachable?: boolean | null;
  probe_seen_name?: string;
  probe_checked_at?: string | null;
  probe_fail_count?: number;
  next_probe_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
}

export interface NodeHeartbeat {
  node_id: number;
  /** ISO timestamp of the minute bucket this row covers. */
  bucket_at: string;
  /** "up" | "down" */
  status: string;
}

export interface CreateNodeResult {
  id: number;
  name: string;
  address: string;
  use_tls: boolean;
  token_prefix: string;
  status: string;
  /** Raw edge token — returned only once at registration. */
  token: string;
}

/**
 * ProbeResult is what the panel's `/api/nodes/{id}/probe` endpoint
 * returns. `reachable: "yes"` means a real ksedge answered with its name;
 * "no" is everything from "port closed" to "a different webserver is
 * squatting the port".
 */
export interface ProbeResult {
  node_id: number;
  reachable: 'yes' | 'no' | 'unknown';
  name?: string;
  note?: string;
}

/**
 * SetupLocalResult is what the panel's `/api/nodes/{id}/setup-local`
 * endpoint returns after it has installed and launched a local ksedge. `ok`
 * is true when the edge binary was downloaded, configured and started — the
 * embedded `probe` then tells the UI whether it actually answered.
 */
export interface SetupLocalResult {
  ok: boolean;
  message?: string;
  log?: string;
  probe?: ProbeResult;
}