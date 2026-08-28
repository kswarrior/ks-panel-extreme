package models

import "time"

// Node is one edge machine registered with the panel. The panel issues a
// NOMAD token once (returned only at creation time, identical to how API
// keys work) and stores SHA-256(token) instead of the raw plaintext.
type Node struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Address string `json:"address"`
	UseTLS  bool   `json:"use_tls"`
	// TokenPrefix is the short prefix shown in the admin UI so the operator
	// can recognise which token it is.
	TokenPrefix string `json:"token_prefix"`
	// HealthEnabled flips the panel's background active-probe loop per edge.
	// Default on; an operator may disable it for edges reachable only from
	// inside a private network where a dial would just add noise.
	HealthEnabled  bool `json:"health_enabled"`
	HealthInterval int  `json:"health_interval"` // seconds between probes
	HealthTimeout  int  `json:"health_timeout"`  // seconds per probe dial
	HealthRetries  int  `json:"health_retries"`  // failed attempts -> down
	// SkipTLSVerify lets an operator dial a self-signed edge without making
	// the global probe client insecure. Independent of UseTLS.
	SkipTLSVerify bool   `json:"skip_tls_verify"`
	Notes         string `json:"notes"`
	// InstallDir overrides the default local-edge install location for a
	// localhost node (./localnode/ksedge-<id> when empty). The "Create &
	// setup" path and the bootstrap snippet both honour it so a homelab
	// operator can place the edge on a specific disk.
	InstallDir string `json:"install_dir"`
	// AllowedKinds is a comma-locked set of instance kinds that may deploy
	// to this edge ("docker,kvm,multipass,lxd"). Empty means no
	// restriction; the deploy handler refuses anything not on the list.
	AllowedKinds string `json:"allowed_kinds"`
	// Panel-side resource allocation overrides. These are the caps the
	// operator chooses — they are NOT the live telemetry the edge pushes
	// (that lives in RAMTotal/DiskTotal above, in bytes). A zero value means
	// "unset / inherit live telemetry" so a legacy row stays permissive.
	// AllocMemMiB / AllocDiskMiB are in MiB (1024*1024 bytes);
	// MemOvercommitPct / DiskOvercommitPct are 0-100 (% the panel tolerates
	// beyond the configured cap, e.g. 150 = up to 1.5x the cap may deploy).
	AllocMemMiB       int `json:"alloc_mem_mib"`
	MemOvercommitPct  int `json:"mem_overcommit_pct"`
	AllocDiskMiB      int `json:"alloc_disk_mib"`
	DiskOvercommitPct int `json:"disk_overcommit_pct"`
	// InstancesDir is the daemon's instance working-files directory the
	// panel hands to ksedge (default "./instances"). Empty falls back to
	// the edge's documented default.
	InstancesDir string `json:"instances_dir"`
	// Category is a free-text bucket label the operator attaches to the
	// node ("production", "staging", "dev", "tenant-acme", …). Drives the
	// coloured chip on the card so an operator with many edges can sort
	// visually without a taxonomy. Empty = uncategorised.
	Category string `json:"category"`
	// LocationCountry is the ISO-3166 alpha-2 code for the country the
	// edge physically lives in ("IN", "US", "DE", …). Stored as the code
	// (not the emoji / name) so the schema stays locale-stable; the UI
	// resolves emoji + display name from a client-side table. Empty
	// means "no country picked".
	LocationCountry string `json:"location_country"`
	// LocationNode is the operator's per-site label ("node-1", "rack-a3",
	// "edge-tokyo-east"). Empty = none. Distinct from `name` so the
	// human-readable card can render "🇮🇳 India – node-1" without cramming
	// country info into the host name. The API enforces that the
	// (name, LocationNode) pair is unique across nodes — two edges may
	// share a name, and two may share a label, but not both.
	LocationNode string `json:"location_node"`
	// Icon is a symbolic display key for the node card chip ("server",
	// "cloud", "shield", …). The panel validates it against its fixed icon
	// set; anything else is rejected at the API boundary. Empty = default
	// heartbeat glyph.
	Icon string `json:"icon"`
	// Color is the accent hex colour ("#34d399") tinting the icon chip on
	// cards. Constrained to #rrggbb by the API handler. Empty = theme
	// default grey.
	Color string `json:"color"`
	// ProbeFailCount is how many consecutive active probes failed in a row
	// since the last success. The sweep loop flips status->"down" once this
	// crosses HealthRetries, and resets it to 0 on a green probe.
	ProbeFailCount int `json:"probe_fail_count"`
	// NextProbeAt is when the sweep loop should next dial this edge, computed
	// from the last successful probe + HealthInterval. Nil = due now.
	NextProbeAt *time.Time `json:"next_probe_at,omitempty"`
	RAMUsed     int64      `json:"ram_used"`
	RAMTotal    int64      `json:"ram_total"`
	CPUPercent  float64    `json:"cpu_percent"`
	DiskUsed    int64      `json:"disk_used"`
	DiskTotal   int64      `json:"disk_total"`
	UptimeSecs  int64      `json:"uptime_secs"`
	// Status is "up" or "down" – derived from how recent the last heartbeat is.
	Status    string  `json:"status"`
	UptimePct float64 `json:"uptime_pct"`
	// Driver availability reported by ksedge. The UI draws a four-segment ring
	// (docker/kvm/multipass/lxd) on each node card; a missing driver renders
	// its arc grey.
	DriverDocker    bool `json:"driver_docker"`
	DriverKVM       bool `json:"driver_kvm"`
	DriverMultipass bool `json:"driver_multipass"`
	DriverLXD       bool `json:"driver_lxd"`
	// Telemetry quality flags — true when the edge actually collected the
	// matching metric on its last heartbeat. Drives the per-card "partial"
	// badge in the UI; an edge that swallowed a /proc read error no longer
	// pretends the resulting 0 is a real idle value.
	HwRAMOK     bool `json:"hw_ram_ok"`
	HwCPUOK     bool `json:"hw_cpu_ok"`
	HwDiskOK    bool `json:"hw_disk_ok"`
	HwUptimeOK  bool `json:"hw_uptime_ok"`
	HwDriversOK bool `json:"hw_drivers_ok"`
	// Probe records of the panel's last active GET /health against the edge.
	// ProbeReachable tri-state: nil = never probed / unreachable, true =
	// reachable AND the responder announced service == "ksedge" (port
	// collision where another ksedge answers with a different name sets
	// this to false), ProbeSeenName keeps the edge's reported name so an
	// admin can spot a row ↔ edge misalignment.
	ProbeReachable *bool      `json:"probe_reachable,omitempty"`
	ProbeSeenName  string     `json:"probe_seen_name,omitempty"`
	ProbeCheckedAt *time.Time `json:"probe_checked_at,omitempty"`
	// State is the rolled-up status the UI keys on today. It expands the
	// binary up/down column into four states so an operator can tell, at a
	// glance, between:
	//   "pending"  – never seen a heartbeat AND never probed (new node)
	//   "down"     – previously seen but now stale / unreachable
	//   "partial"  – reachable (probed or heartbeat) but missing ≥1 metric
	//   "up"       – all telemetry collected and edge reachable
	// Keeping the raw `status` column lets the sweep loop keep working
	// unchanged; State is recomputed at read time from status + the new
	// signals so the card's verdict is always consistent with reality.
	State      string     `json:"state"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// NodeHeartbeat is the per-minute snapshot we keep to compute uptime %.
type NodeHeartbeat struct {
	NodeID   int64     `json:"node_id"`
	BucketAt time.Time `json:"bucket_at"`
	Status   string    `json:"status"`
}
