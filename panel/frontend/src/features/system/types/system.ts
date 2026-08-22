// System types — payload of the single /api/system round-trip.

export interface SystemSnapshot {
  generated_at: string;
  // Top-level entity totals.
  users: number;
  roles: number;
  nodes: number;
  templates: number;
  instances: number;
  api_keys: number;
  mods: number;
  mod_active: number;
  applications: number;
  app_active: number;
  themes: number;
  theme_assignments: number;
  activity_total: number;
  // Per-state breakdown so the card can show "3 up, 1 down".
  nodes_by_state: Record<string, number>;
  // Instance breakdown by lifecycle status.
  instances_by_status: Record<string, number>;
  // Compact per-edge telemetry.
  edges: SystemEdge[];
  overall_uptime_pct: number;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_used_mb: number;
  disk_total_mb: number;
  cpu_percent_avg: number;
  // Local-host telemetry — RAM/CPU/disk/load/uptime for the box the panel
  // is running on. Field set is best-effort; zero means "not available on
  // this platform" (e.g. macOS for /proc/diskstats).
  local: LocalHost;
  // Rolling 60s time-series used by the system line charts.
  series: SystemSeries;
}

export interface SystemEdge {
  id: number;
  name: string;
  address: string;
  state: string;
  uptime_pct: number;
  cpu_percent: number;
  ram_used: number;
  ram_total: number;
  last_seen_at?: string | null;
}

// LocalHost describes the box the panel process is running on. Field set
// is consistent across platforms; zero values are rendered as em-dashes.
export interface LocalHost {
  captured_at: string;
  hostname: string;
  os: string;
  platform: string;
  kernel: string;
  arch: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_percent: number;
  load1: number;
  load5: number;
  load15: number;
  per_core: number[];
  ram_total_mb: number;
  ram_used_mb: number;
  ram_used_pct: number;
  ram_avail_mb: number;
  ram_cached_mb: number;
  ram_buffers_mb: number;
  swap_total_mb: number;
  swap_used_mb: number;
  swap_used_pct: number;
  disk_path: string;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_free_gb: number;
  disk_used_pct: number;
  mounts: DiskMount[];
  interfaces: NetInterface[];
  addrs: string[];
  uptime_sec: number;
  process_uptime: number;
  go_version: string;
  goroutines: number;
  heap_alloc_mb: number;
  heap_sys_mb: number;
  sys_mb: number;
  num_gc: number;
}

export interface DiskMount {
  device: string;
  path: string;
  fs_type: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_pct: number;
}

export interface NetInterface {
  name: string;
  mac: string;
  mtu: number;
  addrs: string[];
  bytes_rx: number;
}

// SystemSeries is the rolling window the line charts plot. Empty array
// (not null) when the sampler hasn't kicked yet — the system renders a
// "warming up…" stub in that case.
export interface SystemSeries {
  window_ns: number;
  interval_ns: number;
  samples: SeriesSample[];
  current: SeriesSample;
}

export interface SeriesSample {
  unix_sec: number;
  cpu_percent: number;
  ram_used_mb: number;
  ram_used_pct: number;
  load1: number;
}

// VersionInfo is the build-time identity baked into the running binary via
// -ldflags (see internal/version/version.go + rebuild.sh). Fields fall back
// to "dev" / "unknown" for binaries built without -ldflags, so a local
// debug build still answers the update-info endpoint without crashing.
export interface VersionInfo {
  version: string;
  commit: string;
  build_date: string;
}

// UpdateInfoResponse backs the "Updates" tab header on the admin System
// page. Bundles the local build identity, the public artefact URLs, and
// the resolved on-disk binary path so the SPA can show "You are running
// X (commit Y, built Z)" without any extra round-trips.
export interface UpdateInfoResponse {
  local: VersionInfo;
  update_url: string;
  version_url: string;
  binary_path: string;
  last_check_at?: string | null;
  last_remote_version?: string | null;
}

// RemoteVersionManifest mirrors the JSON shape served at version_url. Field
// set is loose — a missing field becomes "" in the SPA and renders as an
// em-dash rather than a hard error.
export interface RemoteVersionManifest {
  version: string;
  commit?: string;
  build_date?: string;
  notes?: string;
  size_bytes?: number;
}

// UpdateCheckResponse is the result of one update-check round-trip. When
// the remote manifest can't be fetched `error` carries a human-readable
// reason and the rest of the fields stay at their zero values.
export interface UpdateCheckResponse {
  available: boolean;
  local: VersionInfo;
  remote: RemoteVersionManifest;
  checked_at: string;
  update_url: string;
  error?: string;
}

// UpdateApplyResponse is what POST /api/system/update-apply returns.
// The HTTP request always succeeds with this shape — the binary swap +
// relaunch happens AFTER the response is written, so the SPA sees a clean
// 200 followed by a brief hang while the panel process is recycled.
export interface UpdateApplyResponse {
  ok: boolean;
  message: string;
  local_version_before: string;
  target_binary: string;
  log?: string;
}

// ReinstallResponse is what POST /api/system/reinstall returns.
// Same shape as UpdateApplyResponse since it uses the same backend logic.
export interface ReinstallResponse {
  ok: boolean;
  message: string;
  local_version_before: string;
  target_binary: string;
  log?: string;
}

// ReinstallBackgroundResponse is what POST /api/system/reinstall-background returns.
export interface ReinstallBackgroundResponse {
  ok: boolean;
  message: string;
  script: string;
}

// DatabaseInfo is the response shape for the read-only Database admin page.
// The handler runs a wal_checkpoint(TRUNCATE) before measuring, so every
// size field here reflects the live committed state of the database rather
// than whatever happened to be folded into the main file by the last
// auto-checkpoint.
export interface DatabaseInfo {
  engine: string;
  path: string;
  version: string;
  journal_mode: string;
  generated_at: string;
  // `logical_bytes` is page_count * page_size — the size SQLite's pager
  // believes the database is. `size_bytes` is the on-disk main file length.
  // After the handler's checkpoint the two match; freelist pages count
  // toward both but can be reclaimed by VACUUM (free_bytes).
  logical_bytes: number;
  size_bytes: number;
  free_bytes: number;
  wal_bytes: number;
  shm_bytes: number;
  page_size: number;
  page_count: number;
  free_pages: number;
  max_page_count: number;
  last_modified_ago_secs: number;
  // Live health summary surfaced by PRAGMA integrity_quick and
  // foreign_key_check.
  integrity_ok: boolean;
  integrity_issues: string[];
  foreign_key_ok: boolean;
  foreign_key_issues: string[];
  fragmentation_pct: number;
  // ISO timestamp of the last on-disk write — bumped by the checkpoint.
  last_checkpoint: string;
  // Live-monitor global counters (see DatabaseInfo Go struct for the
  // exact semantics). All zeros on the first snapshot in a panel run —
  // there's nothing to diff against, so the UI surfaces "warming up…".
  total_connections: number;
  cache_size_pages: number;
  auto_vacuum_mode: number;
  encoding: string;
  // Bytes the on-disk main file grew by since the previous /api/
  // database snapshot (5s by default). WAL delta is non-zero only when
  // concurrent writers landed during the snapshot window.
  size_delta: number;
  wal_delta: number;
  // Sum of per-table row deltas across every user table — the headline
  // "rows written since last tick" figure for the live banner.
  row_delta_since_last: number;
  tables: DatabaseTable[];
  // True for non-SQLite engines (postgres/mysql) — the backend returns a
  // stub instead of computing PRAGMA-driven metrics the engine doesn't
  // expose. The page surfaces a "use psql / mysql cli" hint plus the
  // Change Database card so the operator can switch back.
  engine_not_supported?: boolean;
}

export interface DatabaseTable {
  name: string;
  row_count: number;
  column_count: number;
  index_count: number;
  autoincr_value: number;
  // Real-time on-disk bytes used by the table's own b-tree, from dbstat.
  size_bytes: number;
  // Bytes used by the table's indexes (sum of pgsize across attached
  // indexes), also from dbstat.
  index_bytes: number;
  without_rowid: boolean;
  type: string;
  // Live-monitor extras from dbstat aggregations. The
  // leaf/internal/overflow split reveals whether the b-tree is still flat
  // (internal=0) or multi-level — that's the "needs an index?" marker.
  page_count: number;
  leaf_pages: number;
  internal_pages: number;
  overflow_pages: number;
  avg_row_bytes: number;
  // Largest cell payload across the table's pages — high relative to
  // page_size flags blob-heavy tables that spill into overflow pages.
  max_payload: number;
  // per-tick delta vs the previous /api/database response.
  size_delta: number;
  row_delta: number;
  index_delta: number;
}
