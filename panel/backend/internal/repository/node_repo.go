package repository

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// NodeRepository manages the `nodes` table and the rolling `node_heartbeats`
// log. It also mints the shared NOMAD (edge) token the panel uses to
// authenticate incoming metrics pushes from a ksedge.
type NodeRepository struct {
	db *sql.DB
}

func NewNodeRepository(db *sql.DB) *NodeRepository {
	return &NodeRepository{db: db}
}

// EdgeTokenPrefix brands the edge token so it's distinguishable from an API
// key (ksk_…). ksedge operators read this from their ksedge.toml.
const EdgeTokenPrefix = "kse_"

// GenerateEdgeToken returns a fresh node/edge token. Only the SHA-256 digest
// is persisted; the plaintext is handed to the operator exactly once at
// registration time and then forgotten by the panel.
func GenerateEdgeToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return EdgeTokenPrefix + hex.EncodeToString(b), nil
}

func hashEdgeToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateNodeInput is the shape the admin API handler passes when registering
// a new edge. UseTLS flips the panel between http:// and https://when dialing.
type CreateNodeInput struct {
	Name    string
	Address string
	UseTLS  bool
	// Advanced connection / health configuration (migration 019). Zero
	// values fall back to the column DEFAULT so a handler that forwards
	// the form verbatim still produces sensible rows.
	HealthEnabled  bool
	HealthInterval int
	HealthTimeout  int
	HealthRetries  int
	SkipTLSVerify  bool
	Notes          string
	InstallDir     string
	AllowedKinds   string
	// Panel-side allocation overrides (migration 025). Zero = unset /
	// inherit live telemetry, so a handler that forwards a legacy form
	// verbatim still produces permissive rows.
	AllocMemMiB       int
	MemOvercommitPct  int
	AllocDiskMiB      int
	DiskOvercommitPct int
	InstancesDir      string
	// Operator-set categorisation + location (migration 026). Empty
	// strings fall back to the column DEFAULT so a legacy payload stays
	// fully permissive.
	Category        string
	LocationCountry string
	LocationNode    string
	// Display identity (migration 044). Icon is a validated symbolic key;
	// Color is a #rrggbb hex string. Both default to '' (theme defaults).
	Icon  string
	Color string
	// Connection mode (migration 050). Empty = 'direct' default.
	ConnectionMode string
	// OwnerID (migration 054) ties the node to the user that registered
	// it. The NODES_OWN / NODES_ALL scope keys in the role form drive
	// list filtering on this column; the handler passes 0 for admins
	// (full list) and the caller's uid for self-service.
	OwnerID int64
}

// CreateNode returns the new node row and the raw edge token. The token must
// be shown to the operator immediately and then discarded; the panel keeps
// only the SHA-256 digest and a short prefix for UI labelling.
func (r *NodeRepository) CreateNode(in CreateNodeInput) (*models.Node, string, error) {
	token, err := GenerateEdgeToken()
	if err != nil {
		return nil, "", err
	}
	hash := hashEdgeToken(token)
	prefix := token
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}

	cm := in.ConnectionMode
	if cm == "" {
		cm = "direct"
	}
	// owner_id must be NULL for unowned rows — inserting 0 violates the
	// FK to users(id) when PRAGMA foreign_keys=ON. The list handlers treat
	// NULL as "orphan / visible to all", so a zero OwnerID from the CLI's
	// setup:localnode path must not become a concrete 0 FK. Use two query
	// variants so the NULL case is a literal NULL, not a driver-typed nil
	// that the sqlite driver rejects as "invalid driver.Value type <nil>".
	var res sql.Result
	if in.OwnerID != 0 {
		res, err = r.db.Exec(
			`INSERT INTO nodes (name, address, use_tls, token_hash, token_prefix, token_plain, status,
				health_enabled, health_interval, health_timeout, health_retries,
				skip_tls_verify, notes, install_dir, allowed_kinds,
				alloc_mem_mib, mem_overcommit_pct, alloc_disk_mib, disk_overcommit_pct, instances_dir,
				category, location_country, location_node, icon, color, connection_mode, owner_id)
			 VALUES (?, ?, ?, ?, ?, ?, 'down', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Address, boolToInt(in.UseTLS), hash, prefix, token,
			boolToInt(in.HealthEnabled), defaultInt(in.HealthInterval, 60),
			defaultInt(in.HealthTimeout, 4), defaultInt(in.HealthRetries, 3),
			boolToInt(in.SkipTLSVerify), in.Notes, in.InstallDir, in.AllowedKinds,
			in.AllocMemMiB, in.MemOvercommitPct, in.AllocDiskMiB, in.DiskOvercommitPct,
			in.InstancesDir,
			in.Category, in.LocationCountry, in.LocationNode, in.Icon, in.Color, cm,
			in.OwnerID,
		)
	} else {
		res, err = r.db.Exec(
			`INSERT INTO nodes (name, address, use_tls, token_hash, token_prefix, token_plain, status,
				health_enabled, health_interval, health_timeout, health_retries,
				skip_tls_verify, notes, install_dir, allowed_kinds,
				alloc_mem_mib, mem_overcommit_pct, alloc_disk_mib, disk_overcommit_pct, instances_dir,
				category, location_country, location_node, icon, color, connection_mode, owner_id)
			 VALUES (?, ?, ?, ?, ?, ?, 'down', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
			in.Name, in.Address, boolToInt(in.UseTLS), hash, prefix, token,
			boolToInt(in.HealthEnabled), defaultInt(in.HealthInterval, 60),
			defaultInt(in.HealthTimeout, 4), defaultInt(in.HealthRetries, 3),
			boolToInt(in.SkipTLSVerify), in.Notes, in.InstallDir, in.AllowedKinds,
			in.AllocMemMiB, in.MemOvercommitPct, in.AllocDiskMiB, in.DiskOvercommitPct,
			in.InstancesDir,
			in.Category, in.LocationCountry, in.LocationNode, in.Icon, in.Color, cm,
		)
	}
	if err != nil {
		return nil, "", err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, "", err
	}
	return &models.Node{
		ID:          id,
		Name:        in.Name,
		Address:     in.Address,
		UseTLS:      in.UseTLS,
		TokenPrefix: prefix,
		Status:      "down",
		OwnerID:     in.OwnerID,
	}, token, nil
}

// boolToInt maps a Go bool to the 0/1 SQLite expects for the use_tls column.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// defaultInt returns v when non-zero, otherwise def — used so a handler that
// forwards an unset form field still lands the column's sensible default
// instead of an explicit 0 (which would disable an interval the operator
// meant to leave at 60s).
func defaultInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

// ListNodes returns every registered edge with the latest telemetry snapshot
// already shaped into the public Node model. UptimePct is recomputed from the
// heartbeat log so it stays accurate even if the edge crashed mid-report.
func (r *NodeRepository) ListNodes() ([]models.Node, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&n); err != nil {
		return nil, err
	}
	nodes := make([]models.Node, 0, n)
	if n == 0 {
		return nodes, nil
	}
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at,
		driver_docker, driver_kvm, driver_multipass, driver_lxd,
		hw_ram_ok, hw_cpu_ok, hw_disk_ok, hw_uptime_ok, hw_drivers_ok,
		probe_reachable, probe_seen_name, probe_checked_at,
		health_enabled, health_interval, health_timeout, health_retries,
		skip_tls_verify, notes, install_dir, allowed_kinds,
		alloc_mem_mib, mem_overcommit_pct, alloc_disk_mib, disk_overcommit_pct, instances_dir,
		category, location_country, location_node, icon, color,
		probe_fail_count, next_probe_at, connection_mode
		FROM nodes ORDER BY created_at DESC`)
	if err != nil {
		// Try one level of fallback (drivers present, telemetry-quality
		// columns missing) before going legacy (only the original
		// columns). Each fallback keeps the page rendering instead of a
		// hard 500 while migration 011 lands.
		nodes, err2 := r.listNodesWithDrivers()
		if err2 != nil {
			return r.listNodesLegacy()
		}
		return nodes, nil
	}
	defer rows.Close()
	for rows.Next() {
		var nd models.Node
		if err := scanFullNode(rows, &nd); err != nil {
			return nil, err
		}
			nd.State = DeriveState(nd.Status, nd.LastSeenAt,
			allMetricsOK(nd), anyMetricPartial(nd), probeTrue(nd.ProbeReachable), nd.ProbeCheckedAt)
		nodes = append(nodes, nd)
	}
	// Enrich with owner_id (migration 054) — one extra scalar row so the
	// scope filter in the handler has a value to match.
	for i := range nodes {
		if ow, ok := nodeOwnerMap(r.db)[nodes[i].ID]; ok {
			nodes[i].OwnerID = ow
		}
	}
	return nodes, rows.Err()
}

// listNodesWithDrivers handles a DB at migration 010 (driver_* present but no
// telemetry-quality / probe columns yet).
func (r *NodeRepository) listNodesWithDrivers() ([]models.Node, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&n); err != nil {
		return nil, err
	}
	nodes := make([]models.Node, 0, n)
	if n == 0 {
		return nodes, nil
	}
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at,
		driver_docker, driver_kvm, driver_multipass, driver_lxd
		FROM nodes ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var nd models.Node
		if err := scanNodeWithDrivers(rows, &nd); err != nil {
			return nil, err
		}
		// Treat unknown telemetry quality as "all collected" so an older
		// schema represents a fresh heartbeat as "up" rather than scaring
		// the operator with "partial". This is the same conservative path
		// pre-rollback mixed-binary upgrades already take.
		nd.State = DeriveState(nd.Status, nd.LastSeenAt, true, false, false, nil)
		nodes = append(nodes, nd)
	}
	for i := range nodes {
		if ow, ok := nodeOwnerMap(r.db)[nodes[i].ID]; ok {
			nodes[i].OwnerID = ow
		}
	}
	return nodes, rows.Err()
}

// probeTrue unwraps the tristate probe-reachable flag. nil means "never
// probed / unreachable" which DeriveState treats as false.
func probeTrue(p *bool) bool {
	return p != nil && *p
}

// listNodesLegacy is the pre-migration-010 query used as a fallback when the
// driver_* columns are absent. Driver flags default to false (grey ring).
func (r *NodeRepository) listNodesLegacy() ([]models.Node, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&n); err != nil {
		return nil, err
	}
	nodes := make([]models.Node, 0, n)
	if n == 0 {
		return nodes, nil
	}
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at
		FROM nodes ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var nd models.Node
		if err := scanLegacyNode(rows, &nd); err != nil {
			return nil, err
		}
		// With no driver columns the card necessarily shows a grey ring;
		// treat telemetry-quality as unknown so we don't show "partial"
		// for a row whose heartbeats are coming through fine on a legacy
		// binary.
		nd.State = DeriveState(nd.Status, nd.LastSeenAt, true, false, false, nil)
		nodes = append(nodes, nd)
	}
	for i := range nodes {
		if ow, ok := nodeOwnerMap(r.db)[nodes[i].ID]; ok {
			nodes[i].OwnerID = ow
		}
	}
	return nodes, rows.Err()
}

// ListNodesByOwner returns the subset of nodes owned by ownerID. Migration
// 054 wired the NODES_OWN scope key — the panel's admin Nodes handler
// calls this when a caller holds NODES_OWN without NODES_ALL, so an
// Own-restricted role only sees their own edges. ownerID == 0 falls
// through to ListNodes (full fleet, the legacy behaviour).
//
// We post-filter the ListNodes() result in memory rather than pushing a
// WHERE clause down to SQL because ListNodes runs three fallback
// paths (full scan / with-drivers / legacy) and adding a parameterised
// filter to each would triple the surface area. The node fleet is
// bounded by the operator's hardware budget, so the filter cost is
// trivial.
func (r *NodeRepository) ListNodesByOwner(ownerID int64) ([]models.Node, error) {
	all, err := r.ListNodes()
	if err != nil {
		return nil, err
	}
	if ownerID == 0 {
		return all, nil
	}
	out := make([]models.Node, 0, len(all))
	for _, n := range all {
		if n.OwnerID == ownerID {
			out = append(out, n)
		}
	}
	return out, nil
}

// GetNode fetches a single node row by id (used by the panel dialer before it
// talks to the edge). Falls back through migration levels so a partially
// migrated schema still loads cleanly.
func (r *NodeRepository) GetNode(id int64) (*models.Node, error) {
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at,
		driver_docker, driver_kvm, driver_multipass, driver_lxd,
		hw_ram_ok, hw_cpu_ok, hw_disk_ok, hw_uptime_ok, hw_drivers_ok,
		probe_reachable, probe_seen_name, probe_checked_at,
		health_enabled, health_interval, health_timeout, health_retries,
		skip_tls_verify, notes, install_dir, allowed_kinds,
		alloc_mem_mib, mem_overcommit_pct, alloc_disk_mib, disk_overcommit_pct, instances_dir,
		category, location_country, location_node, icon, color,
		probe_fail_count, next_probe_at, connection_mode
		FROM nodes WHERE id = ?`, id)
	if err != nil {
		return r.getNodeWithDrivers(id)
	}
	defer rows.Close()
	if !rows.Next() {
		return r.getNodeWithDrivers(id)
	}
	var nd models.Node
	if e := scanFullNode(rows, &nd); e != nil {
		return nil, e
	}
	nd.State = DeriveState(nd.Status, nd.LastSeenAt,
		allMetricsOK(nd), anyMetricPartial(nd), probeTrue(nd.ProbeReachable), nd.ProbeCheckedAt)
	if ow, ok := nodeOwnerMap(r.db)[nd.ID]; ok {
		nd.OwnerID = ow
	}
	return &nd, nil
}

// FindNodeByNameAndAddress returns the first node row whose name AND address
// both match. Returns (nil, nil) when the row is absent — callers can use
// that to distinguish "found and reused" from "not found, create fresh"
// without parsing an error string. Used by the `setup:localnode` CLI so a
// re-run picks up the existing localhost row (and therefore its edge token)
// instead of minting a new node every time.
func (r *NodeRepository) FindNodeByNameAndAddress(name, address string) (*models.Node, error) {
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at,
		driver_docker, driver_kvm, driver_multipass, driver_lxd,
		hw_ram_ok, hw_cpu_ok, hw_disk_ok, hw_uptime_ok, hw_drivers_ok,
		probe_reachable, probe_seen_name, probe_checked_at,
		health_enabled, health_interval, health_timeout, health_retries,
		skip_tls_verify, notes, install_dir, allowed_kinds,
		alloc_mem_mib, mem_overcommit_pct, alloc_disk_mib, disk_overcommit_pct, instances_dir,
		category, location_country, location_node, icon, color,
		probe_fail_count, next_probe_at, connection_mode
		FROM nodes WHERE name = ? AND address = ? LIMIT 1`, name, address)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	var nd models.Node
	if err := scanFullNode(rows, &nd); err != nil {
		return nil, err
	}
	nd.State = DeriveState(nd.Status, nd.LastSeenAt,
		allMetricsOK(nd), anyMetricPartial(nd), probeTrue(nd.ProbeReachable), nd.ProbeCheckedAt)
	return &nd, nil
}

// getNodeWithDrivers is the migration-010 fallback (drivers present, no
// telemetry-quality or probe columns yet).
func (r *NodeRepository) getNodeWithDrivers(id int64) (*models.Node, error) {
	rows, err := r.db.Query(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at,
		driver_docker, driver_kvm, driver_multipass, driver_lxd
		FROM nodes WHERE id = ?`, id)
	if err != nil {
		return r.getNodeLegacy(id)
	}
	defer rows.Close()
	if !rows.Next() {
		return r.getNodeLegacy(id)
	}
	var nd models.Node
	if e := scanNodeWithDrivers(rows, &nd); e != nil {
		return nil, e
	}
	nd.State = DeriveState(nd.Status, nd.LastSeenAt, true, false, false, nil)
	return &nd, nil
}

// getNodeLegacy is the pre-migration-010 fallback used when the driver_*
// columns are absent. Driver flags default to false.
func (r *NodeRepository) getNodeLegacy(id int64) (*models.Node, error) {
	var nd models.Node
	var useTLS int
	var lastSeen sql.NullString
	var created string
	err := r.db.QueryRow(`SELECT id, name, address, use_tls, token_prefix,
		ram_used, ram_total, cpu_percent, disk_used, disk_total, uptime_secs,
		status, uptime_pct, last_seen_at, created_at
		FROM nodes WHERE id = ?`, id).Scan(
		&nd.ID, &nd.Name, &nd.Address, &useTLS, &nd.TokenPrefix,
		&nd.RAMUsed, &nd.RAMTotal, &nd.CPUPercent, &nd.DiskUsed, &nd.DiskTotal,
		&nd.UptimeSecs, &nd.Status, &nd.UptimePct, &lastSeen, &created)
	if err != nil {
		return nil, err
	}
	nd.UseTLS = useTLS == 1
	nd.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
	nd.LastSeenAt = parseTime(lastSeen)
	nd.State = DeriveState(nd.Status, nd.LastSeenAt, true, false, false, nil)
	return &nd, nil
}

// nodeOwnerMap bulk-loads the `owner_id` (migration 054) for every node
// row the list helpers already scanned through the multi-fallback path.
// Each row is matched by its id; rows that hit a pre-054 path with no
// owner_id column keep the zero value ("orphan") — the handler's
// scope filter treats that as "visible only to admins" (the same
// contract instances already enforce for unattributed rows).
func nodeOwnerMap(db *sql.DB) map[int64]int64 {
	m := make(map[int64]int64)
	rows, err := db.Query(`SELECT id, COALESCE(owner_id, 0) FROM nodes`)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id, oid sql.NullInt64
		if err := rows.Scan(&id, &oid); err != nil {
			continue
		}
		if id.Valid && oid.Valid {
			m[id.Int64] = oid.Int64
		}
	}
	return m
}

// scanFullNode reads a row carrying every migration-011 (and 019, 025, 026, 050)
// column.
func scanFullNode(rows *sql.Rows, nd *models.Node) error {
	var useTLS int
	var lastSeen sql.NullString
	var created string
	var dDocker, dKVM, dMultipass, dLXD int
	var hwRam, hwCPU, hwDisk, hwUptime, hwDrivers int
	var probeReachable sql.NullInt64
	var probeSeenName sql.NullString
	var probeChecked sql.NullString
	var healthEnabled, healthInterval, healthTimeout, healthRetries, skipTLSVerify int
	var probeFailCount int
	var nextProbe sql.NullString
	var allocMemMiB, memOvercommitPct, allocDiskMiB, diskOvercommitPct int
	var instancesDir, category, locationCountry, locationNode string
	var icon, color string
	var connectionMode sql.NullString
	if err := rows.Scan(&nd.ID, &nd.Name, &nd.Address, &useTLS, &nd.TokenPrefix,
		&nd.RAMUsed, &nd.RAMTotal, &nd.CPUPercent, &nd.DiskUsed, &nd.DiskTotal,
		&nd.UptimeSecs, &nd.Status, &nd.UptimePct, &lastSeen, &created,
		&dDocker, &dKVM, &dMultipass, &dLXD,
		&hwRam, &hwCPU, &hwDisk, &hwUptime, &hwDrivers,
		&probeReachable, &probeSeenName, &probeChecked,
		&healthEnabled, &healthInterval, &healthTimeout, &healthRetries,
		&skipTLSVerify, &nd.Notes, &nd.InstallDir, &nd.AllowedKinds,
		&allocMemMiB, &memOvercommitPct, &allocDiskMiB, &diskOvercommitPct, &instancesDir,
		&category, &locationCountry, &locationNode, &icon, &color,
		&probeFailCount, &nextProbe, &connectionMode); err != nil {
		return err
	}
	applyScannedFields(nd, useTLS, created, lastSeen)
	nd.DriverDocker = dDocker == 1
	nd.DriverKVM = dKVM == 1
	nd.DriverMultipass = dMultipass == 1
	nd.DriverLXD = dLXD == 1
	nd.HwRAMOK = hwRam == 1
	nd.HwCPUOK = hwCPU == 1
	nd.HwDiskOK = hwDisk == 1
	nd.HwUptimeOK = hwUptime == 1
	nd.HwDriversOK = hwDrivers == 1
	nd.HealthEnabled = healthEnabled == 1
	nd.HealthInterval = healthInterval
	nd.HealthTimeout = healthTimeout
	nd.HealthRetries = healthRetries
	nd.SkipTLSVerify = skipTLSVerify == 1
	nd.ProbeFailCount = probeFailCount
	nd.AllocMemMiB = allocMemMiB
	nd.MemOvercommitPct = memOvercommitPct
	nd.AllocDiskMiB = allocDiskMiB
	nd.DiskOvercommitPct = diskOvercommitPct
	nd.InstancesDir = instancesDir
	nd.Category = category
	nd.LocationCountry = locationCountry
	nd.LocationNode = locationNode
	nd.Icon = icon
	nd.Color = color
	if connectionMode.Valid {
		nd.ConnectionMode = connectionMode.String
	} else {
		nd.ConnectionMode = "direct"
	}
	if nd.ConnectionMode == "" {
		nd.ConnectionMode = "direct"
	}
	if nextProbe.Valid {
		if t := parseTime(nextProbe); t != nil {
			nd.NextProbeAt = t
		}
	}
	if probeReachable.Valid {
		v := probeReachable.Int64 == 1
		nd.ProbeReachable = &v
	}
	if probeSeenName.Valid {
		nd.ProbeSeenName = probeSeenName.String
	}
	if probeChecked.Valid {
		if t := parseTime(probeChecked); t != nil {
			nd.ProbeCheckedAt = t
		}
	}
	return nil
}

// scanNodeWithDrivers reads a row at migration-010 (drivers present, no
// telemetry-quality or probe columns).
func scanNodeWithDrivers(rows *sql.Rows, nd *models.Node) error {
	var useTLS int
	var lastSeen sql.NullString
	var created string
	var dDocker, dKVM, dMultipass, dLXD int
	if err := rows.Scan(&nd.ID, &nd.Name, &nd.Address, &useTLS, &nd.TokenPrefix,
		&nd.RAMUsed, &nd.RAMTotal, &nd.CPUPercent, &nd.DiskUsed, &nd.DiskTotal,
		&nd.UptimeSecs, &nd.Status, &nd.UptimePct, &lastSeen, &created,
		&dDocker, &dKVM, &dMultipass, &dLXD); err != nil {
		return err
	}
	applyScannedFields(nd, useTLS, created, lastSeen)
	nd.DriverDocker = dDocker == 1
	nd.DriverKVM = dKVM == 1
	nd.DriverMultipass = dMultipass == 1
	nd.DriverLXD = dLXD == 1
	// Pre-019 DB: assume the operator wants active probing on by default so
	// a migrating panel doesn't silently turn the sweep loop off for every
	// edge. The columns are absent, so the read-only defaults take effect.
	nd.HealthEnabled = true
	nd.HealthInterval = 60
	nd.HealthTimeout = 4
	nd.HealthRetries = 3
	nd.ConnectionMode = "direct"
	return nil
}

// scanLegacyNode reads a row at the original schema (no drivers / no quality).
func scanLegacyNode(rows *sql.Rows, nd *models.Node) error {
	var useTLS int
	var lastSeen sql.NullString
	var created string
	if err := rows.Scan(&nd.ID, &nd.Name, &nd.Address, &useTLS, &nd.TokenPrefix,
		&nd.RAMUsed, &nd.RAMTotal, &nd.CPUPercent, &nd.DiskUsed, &nd.DiskTotal,
		&nd.UptimeSecs, &nd.Status, &nd.UptimePct, &lastSeen, &created); err != nil {
		return err
	}
	applyScannedFields(nd, useTLS, created, lastSeen)
	nd.HealthEnabled = true
	nd.HealthInterval = 60
	nd.HealthTimeout = 4
	nd.HealthRetries = 3
	nd.ConnectionMode = "direct"
	return nil
}

// applyScannedFields owns the column-writing rules common to every scan path
// (TLS, created_at, last_seen_at) so the fallback cascade can't drift out of
// sync with the master path.
func applyScannedFields(nd *models.Node, useTLS int, created string, lastSeen sql.NullString) {
	nd.UseTLS = useTLS == 1
	nd.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
	nd.LastSeenAt = parseTime(lastSeen)
}

// parseTime accepts the various formats SQLite may return a datetime in
// (go-sqlite3 driver's own format, RFC3339, or the locale-prefixed form) and
// returns a *time.Time, or nil when the value is missing.
func parseTime(v sql.NullString) *time.Time {
	if !v.Valid || v.String == "" {
		return nil
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		time.RFC3339Nano,
		"2006-01-02 15:04:05 -0700 MST",
	} {
		if t, err := time.Parse(layout, v.String); err == nil {
			return &t
		}
	}
	return nil
}

// UpdateNodeInput is the editable surface for an existing edge. The token is
// never changed here – rotate it with RotateToken if compromised.
type UpdateNodeInput struct {
	Name    string
	Address string
	UseTLS  bool
	// Advanced fields mirror CreateNodeInput; the handler forwards only what
	// the form touched, leaving zero values to fall back to the column
	// default via defaultInt when needed.
	HealthEnabled  bool
	HealthInterval int
	HealthTimeout  int
	HealthRetries  int
	SkipTLSVerify  bool
	Notes          string
	InstallDir     string
	AllowedKinds   string
	// Panel-side allocation overrides (migration 025). Mirror CreateNodeInput.
	AllocMemMiB       int
	MemOvercommitPct  int
	AllocDiskMiB      int
	DiskOvercommitPct int
	InstancesDir      string
	// Operator-set categorisation + location (migration 026). Mirror
	// CreateNodeInput.
	Category        string
	LocationCountry string
	LocationNode    string
	// Display identity (migration 044). Mirror CreateNodeInput.
	Icon  string
	Color string
	// Connection mode (migration 050).
	ConnectionMode string
}

// UpdateNode patches the editable columns of an edge. The token
// hash/prefix stay as they were.
func (r *NodeRepository) UpdateNode(id int64, in UpdateNodeInput) error {
	cm := in.ConnectionMode
	if cm == "" {
		cm = "direct"
	}
	res, err := r.db.Exec(
		`UPDATE nodes SET name = ?, address = ?, use_tls = ?,
			health_enabled = ?, health_interval = ?, health_timeout = ?, health_retries = ?,
			skip_tls_verify = ?, notes = ?, install_dir = ?, allowed_kinds = ?,
			alloc_mem_mib = ?, mem_overcommit_pct = ?, alloc_disk_mib = ?, disk_overcommit_pct = ?,
			instances_dir = ?,
			category = ?, location_country = ?, location_node = ?, icon = ?, color = ?, connection_mode = ?
		 WHERE id = ?`,
		in.Name, in.Address, boolToInt(in.UseTLS),
		boolToInt(in.HealthEnabled), defaultInt(in.HealthInterval, 60),
		defaultInt(in.HealthTimeout, 4), defaultInt(in.HealthRetries, 3),
		boolToInt(in.SkipTLSVerify), in.Notes, in.InstallDir, in.AllowedKinds,
		in.AllocMemMiB, in.MemOvercommitPct, in.AllocDiskMiB, in.DiskOvercommitPct,
		in.InstancesDir,
		in.Category, in.LocationCountry, in.LocationNode, in.Icon, in.Color, cm,
		id,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("node not found")
	}
	return nil
}

// NameLabelTaken reports whether ANOTHER node already carries the same
// (name, location_node) pair, compared case-insensitively and
// whitespace-trimmed. The panel's uniqueness rule is composite: two nodes
// may share a name, and two may share a label, but no two nodes may share
// both. `excludeID` lets the update path skip the row being edited
// (pass 0 when creating). TRIM/LOWER exist on SQLite, MySQL and Postgres.
func (r *NodeRepository) NameLabelTaken(name, label string, excludeID int64) (bool, error) {
	var cnt int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM nodes
		 WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
		   AND LOWER(TRIM(location_node)) = LOWER(TRIM(?))
		   AND id != ?`, name, label, excludeID).Scan(&cnt)
	if err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// DeleteNode removes a node and its heartbeat history (the FK ON DELETE CASCADE
// in 005_node_heartbeats.sql takes care of the heartbeat rows).
func (r *NodeRepository) DeleteNode(id int64) error {
	res, err := r.db.Exec(`DELETE FROM nodes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("node not found")
	}
	return nil
}

// RotateToken issues a brand-new edge token for a node and returns the
// plaintext once. The old token stops working immediately. We also persist
// token_plain so the panel can continue to dial the edge for lifecycle RPCs.
func (r *NodeRepository) RotateToken(id int64) (string, error) {
	token, err := GenerateEdgeToken()
	if err != nil {
		return "", err
	}
	hash := hashEdgeToken(token)
	prefix := token
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	res, err := r.db.Exec(
		`UPDATE nodes SET token_hash = ?, token_prefix = ?, token_plain = ? WHERE id = ?`,
		hash, prefix, token, id,
	)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", fmt.Errorf("node not found")
	}
	return token, nil
}

// PlainToken returns the raw edge token stored on the row, used by the panel
// to authenticate outbound lifecycle RPCs. Empty for rows created before the
// token_plain column existed (rotate to populate).
func (r *NodeRepository) PlainToken(id int64) (string, error) {
	var token sql.NullString
	err := r.db.QueryRow(`SELECT token_plain FROM nodes WHERE id = ?`, id).Scan(&token)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	if !token.Valid {
		return "", fmt.Errorf("node has no usable edge token (rotate it first)")
	}
	return token.String, nil
}

// IngestInput is the telemetry payload pushed by a ksedge. Status is reported
// by the edge itself ("up" while running); the panel also flips it to "down"
// whenever a heartbeat goes stale.
type IngestInput struct {
	Token      string
	RAMUsed    int64
	RAMTotal   int64
	CPUPercent float64
	DiskUsed   int64
	DiskTotal  int64
	UptimeSecs int64
	// Driver availability reported by the edge so the panel can render the
	// four-segment ring on the node card.
	DriverDocker    bool
	DriverKVM       bool
	DriverMultipass bool
	DriverLXD       bool
	// Per-metric "collected ok" flags the edge ships so the panel can show a
	// "partial" card separately from a "down" card. Zero values default to
	// false (legacy edges that don't ship them), which the supplied-legacy
	// fallback below treats as "treat zeros as up" so old daemons don't
	// regress during the rollout.
	HwRAMOK     bool
	HwCPUOK     bool
	HwDiskOK    bool
	HwUptimeOK  bool
	HwDriversOK bool
}

// IngestHeartbeat authenticates the edge by its token, stores the telemetry
// snapshot, records a per-minute heartbeat bucket, and recomputes the rolling
// uptime percentage. Returns the node id so callers can correlate it.
//
// Authentication is constant-time-ish via a SHA-256 lookup: we hash the token
// the edge presented and match it against the stored digest. No plaintext is
// ever read back from the DB.
func (r *NodeRepository) IngestHeartbeat(in IngestInput) (int64, error) {
	hash := hashEdgeToken(in.Token)
	var id sql.NullInt64
	err := r.db.QueryRow(`SELECT id FROM nodes WHERE token_hash = ?`, hash).Scan(&id)
	if err != nil || !id.Valid {
		// Fallback to token_plain for legacy rows / hash drift (matches tunnel handler).
		if err2 := r.db.QueryRow(`SELECT id FROM nodes WHERE token_plain = ?`, in.Token).Scan(&id); err2 != nil || !id.Valid {
			return 0, fmt.Errorf("invalid edge token")
		}
	}

	now := time.Now().UTC()
	// Store the live telemetry + a "last seen" timestamp, the driver
	// availability flags the edge just reported, AND the per-metric "did
	// the edge actually collect this?" flags so the panel can render a
	// partial card when a collector silently failed.
	// Single UPDATE statement: store live telemetry, driver flags, metric
	// quality flags, and last_seen_at in one round-trip. This avoids the
	// three-level nested fallback path that was the hot-path bottleneck.
	if _, err := r.db.Exec(`UPDATE nodes SET
		ram_used = ?, ram_total = ?, cpu_percent = ?, disk_used = ?, disk_total = ?,
		uptime_secs = ?, status = 'up', last_seen_at = ?,
		driver_docker = ?, driver_kvm = ?, driver_multipass = ?, driver_lxd = ?,
		hw_ram_ok = ?, hw_cpu_ok = ?, hw_disk_ok = ?, hw_uptime_ok = ?, hw_drivers_ok = ?,
		uptime_pct = CASE WHEN uptime_pct IS NULL THEN 0 ELSE uptime_pct END
		WHERE id = ?`,
		in.RAMUsed, in.RAMTotal, in.CPUPercent, in.DiskUsed, in.DiskTotal,
		in.UptimeSecs, now,
		boolToInt(in.DriverDocker), boolToInt(in.DriverKVM),
		boolToInt(in.DriverMultipass), boolToInt(in.DriverLXD),
		boolToInt(in.HwRAMOK), boolToInt(in.HwCPUOK), boolToInt(in.HwDiskOK),
		boolToInt(in.HwUptimeOK), boolToInt(in.HwDriversOK), id.Int64); err != nil {
		return 0, err
	}

	// UPSERT into the current-minute bucket. Collisions in the same minute
	// collapse to one row so a chatty edge doesn't bloat the table.
	// Portable UPDATE-then-INSERT (mirrors settingsSet): the SQLite
	// "ON CONFLICT ... DO UPDATE" form is a syntax error on MySQL, and
	// "datetime('now')" below is SQLite-only too.
	bucket := now.Truncate(time.Minute)
	if err := r.upsertHeartbeatBucket(id.Int64, bucket, "up"); err != nil {
		return 0, err
	}

	// Recompute rolling uptime % from the 24h heartbeat window and persist it.
	// The previous "CASE WHEN uptime_pct IS NULL THEN 0" left new nodes stuck
	// at 0 forever; the separate compute was removed for performance but the
	// UI's uptime ring then showed 0% even on healthy edges that had been
	// heartbeating for hours. Recomputing here restores the honest percentage
	// without an extra round-trip on the hot path: the bucket insert already
	// happened, so the next SELECT sees the fresh row.
	if pct, err := r.computeUptimePct(id.Int64); err == nil {
		_, _ = r.db.Exec(`UPDATE nodes SET uptime_pct = ? WHERE id = ?`, pct, id.Int64)
	}
	return id.Int64, nil
}

// MarkStale flips every node whose last heartbeat is older than the threshold
// to "down". Called periodically by the panel's health loop so the UI shows a
// red monitor even when no error ever reaches the ingest endpoint.
func (r *NodeRepository) MarkStale(threshold time.Duration) (int, error) {
	cutoff := time.Now().UTC().Add(-threshold)
	// Record a "down" heartbeat bucket so the rolling uptime % reflects the
	// outage honestly rather than just silencing the dot.
	rows, err := r.db.Query(`SELECT id FROM nodes WHERE status = 'up' AND (last_seen_at IS NULL OR last_seen_at < ?)`, cutoff)
	if err != nil {
		return 0, err
	}
	var ids []int64
	for rows.Next() {
		// Null-guarded scan: modernc.org/sqlite emits a single all-NULL
		// phantom row for a LEFT/JOIN-filtered empty set (same quirk the
		// instance List() COUNT-guard works around) — a bare int64 scan
		// turns "no stale nodes" (the normal steady state) into a loud
		// converting NULL to int64 error.
		var id sql.NullInt64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		if !id.Valid {
			continue
		}
		ids = append(ids, id.Int64)
	}
	rows.Close()

	bucket := time.Now().UTC().Truncate(time.Minute)
	for _, id := range ids {
		_ = r.upsertHeartbeatBucket(id, bucket, "down")
		// Keep uptime_pct honest after marking down.
		if pct, err := r.computeUptimePct(id); err == nil {
			_, _ = r.db.Exec(`UPDATE nodes SET uptime_pct = ? WHERE id = ?`, pct, id)
		}
	}
	res, err := r.db.Exec(
		`UPDATE nodes SET status = 'down' WHERE status = 'up' AND (last_seen_at IS NULL OR last_seen_at < ?)`,
		cutoff)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// upsertHeartbeatBucket records one per-minute bucket portably across
// SQLite / Postgres / MySQL: UPDATE-then-INSERT (mirrors settingsSet in
// database_verify_repo.go) instead of the SQLite-only
// "ON CONFLICT ... DO UPDATE" form, which is a syntax error on MySQL.
// A concurrent insert for the same minute bucket loses the race with a
// duplicate-key error — converged via a follow-up UPDATE so the status
// still lands instead of surfacing a 500 on the heartbeat hot path.
func (r *NodeRepository) upsertHeartbeatBucket(id int64, bucket time.Time, status string) error {
	res, err := r.db.Exec(`UPDATE node_heartbeats SET status = ? WHERE node_id = ? AND bucket_at = ?`,
		status, id, bucket)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	if _, err := r.db.Exec(`INSERT INTO node_heartbeats (node_id, bucket_at, status) VALUES (?, ?, ?)`,
		id, bucket, status); err != nil {
		if isDupKeyErr(err) {
			_, _ = r.db.Exec(`UPDATE node_heartbeats SET status = ? WHERE node_id = ? AND bucket_at = ?`,
				status, id, bucket)
			return nil
		}
		return err
	}
	return nil
}

// isDupKeyErr reports a duplicate-key violation across SQLite
// ("UNIQUE constraint failed"), MySQL ("Duplicate entry") and Postgres
// ("duplicate key value violates unique constraint").
func isDupKeyErr(err error) bool {
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "duplicate") || strings.Contains(low, "unique")
}

// computeUptimePct counts the up/down buckets over the trailing 24h and returns
// the percentage as a 0-100 float. A node with no history yet returns 0.
func (r *NodeRepository) computeUptimePct(id int64) (float64, error) {
	since := time.Now().UTC().Add(-24 * time.Hour)
	var up, total int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM node_heartbeats WHERE node_id = ? AND bucket_at >= ?`, id, since,
	).Scan(&total); err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM node_heartbeats WHERE node_id = ? AND bucket_at >= ? AND status = 'up'`, id, since,
	).Scan(&up); err != nil {
		return 0, err
	}
	return float64(up) / float64(total) * 100, nil
}

// RecentHeartbeats returns the last `limit` up/down buckets (oldest first) for a
// node. The UI renders them as the ||||||| uptime monitor strip.
func (r *NodeRepository) RecentHeartbeats(id int64, limit int) ([]models.NodeHeartbeat, error) {
	rows, err := r.db.Query(
		`SELECT node_id, bucket_at, status FROM node_heartbeats
		 WHERE node_id = ? ORDER BY bucket_at DESC LIMIT ?`, id, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.NodeHeartbeat
	for rows.Next() {
		var h models.NodeHeartbeat
		var nid sql.NullInt64
		var bucket sql.NullString
		var status sql.NullString
		if err := rows.Scan(&nid, &bucket, &status); err != nil {
			return nil, err
		}
		if !nid.Valid || !bucket.Valid || !status.Valid {
			continue
		}
		h.NodeID = nid.Int64
		if bucket.Valid {
			if t, err := time.Parse("2006-01-02 15:04:05", bucket.String); err == nil {
				h.BucketAt = t
			} else if t, err := time.Parse(time.RFC3339Nano, bucket.String); err == nil {
				h.BucketAt = t
			} else if t, err := time.Parse("2006-01-02 15:04:05 -0700 MST", bucket.String); err == nil {
				h.BucketAt = t
			}
		}
		h.Status = status.String
		out = append(out, h)
	}
	// reverse to oldest-first so the strip reads left-to-right over time
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}

// TrimString is a tiny helper kept here so callers trimming long node names in
// the UI don't reinvent the wheel. Pattern matches the rest of the repo.
func TrimString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.TrimSpace(s[:n]) + "…"
}

// ProbeInput is the result of the panel's active GET /health against an edge.
// Reachable=false with a non-empty SeenName means ANOTHER ksedge answered at
// this address (port collision); SeenName=="" with Reachable=false means either
// nothing answered or it wasn't a ksedge at all.
type ProbeInput struct {
	Reachable bool
	SeenName  string
	CheckedAt time.Time
}

// RecordProbe stashes the result of an active /health probe against the node
// row. The card reads it to show "reachable / not ours / unreachable" even
// before the first heartbeat (or when the edge is configured but has never
// successfully pushed telemetry). Migration-tolerant: if the probe_*
// columns don't exist yet we no-op so an older DB still loads cleanly.
//
// For nodes carrying the 019 health columns, the probe also:
//   - resets/consecutively bumps `probe_fail_count` based on Reachable, and
//   - schedules `next_probe_at` = now + health_interval so the sweep loop
//     spreads probes evenly instead of stampeding every edge every tick.
//   - when `probe_fail_count` crosses `health_retries`, flips status to
//     "down" so the card reflects an edge the panel can actually reach.
func (r *NodeRepository) RecordProbe(id int64, in ProbeInput) error {
	if in.CheckedAt.IsZero() {
		in.CheckedAt = time.Now().UTC()
	}
	// Try the 019 path first: rows here carry the fail counter + schedule.
	// We wrap the probe outcome update and the counter update in a single
	// statement so a mid-flight DB close can't leave the two out of sync.
	var newStatus string
	if in.Reachable {
		newStatus = "up"
	} else {
		// Don't preempt the heartbeat-derived "up" until retries are
		// exhausted; the UPDATE below bumps the count conditionally and the
		// CASE flips status only once it crosses the threshold.
		newStatus = ""
	}
	// Schedule the next active probe at now + the node's own health_interval
	// so the sweep loop spreads dials evenly instead of hammering every edge
	// every tick. NULL when the interval is missing on a legacy row.
	// Computed in Go (not datetime(?,'+'||...) — that's SQLite-only and a
	// syntax error on Postgres/MySQL).
	var healthInterval int
	_ = r.db.QueryRow(`SELECT health_interval FROM nodes WHERE id = ?`, id).Scan(&healthInterval)
	var nextProbeAt any
	if healthInterval > 0 {
		nextProbeAt = in.CheckedAt.Add(time.Duration(healthInterval) * time.Second)
	}
	_, err := r.db.Exec(`UPDATE nodes SET
		probe_reachable = ?, probe_seen_name = ?, probe_checked_at = ?,
		probe_fail_count = CASE WHEN ? = 1 THEN 0 ELSE probe_fail_count + 1 END,
		next_probe_at = ?,
		status = CASE
			WHEN ? = 1 THEN 'up'
			WHEN probe_fail_count + 1 >= health_retries THEN 'down'
			ELSE status
		END
		WHERE id = ?`,
		boolToInt(in.Reachable), in.SeenName, in.CheckedAt,
		boolToInt(in.Reachable), nextProbeAt,
		boolToInt(in.Reachable), id)
	if err != nil {
		// Try the migration-011 path (no fail counter / schedule) so a
		// panel running a slightly older schema still records the verdict.
		_, err2 := r.db.Exec(`UPDATE nodes SET
			probe_reachable = ?, probe_seen_name = ?, probe_checked_at = ?
			WHERE id = ?`,
			boolToInt(in.Reachable), in.SeenName, in.CheckedAt, id)
		if err2 != nil {
			// Older still: surface a soft failure.
			if _, fall := r.db.Exec(`UPDATE nodes SET last_seen_at = last_seen_at WHERE id = ?`, id); fall != nil {
				return fall
			}
			return nil
		}
		return nil
	}
	_ = newStatus
	return nil
}

// DeriveState rolls the raw `status` column together with the richer signals
// (last_seen_at, telemetry quality flags, probe outcome) into one of four
// card-level verdicts: "up", "partial", "down", "pending". It is the
// authoritative thing the UI keys on — the binary status column is left as
// the sweep loop's input only.
//
// Rules:
//
//	pending  – last_seen_at IS NULL AND probe never set / unreachable. This
//	           is a brand-new row that has never heard from its edge.
//	up       – status=="up" AND (every telemetry collector reported ok OR
//	           the edge reported NO collector flags at all — i.e. a legacy
//	           ksedge that predates the per-metric quality bits, or a
//	           freshly-launched edge whose first heartbeat lands before the
//	           collectors report).
//	partial  – reachable (status=="up" OR probe_reachable==1) AND at least
//	           one collector explicitly reported !ok (a mixed result — some
//	           flags true, some false). A reachable edge with no flags
//	           reported is up rather than partial so a legacy build doesn't
//	           get stuck grey on the card.
//	down     – everything else (stale heartbeat AND unreachable probe, or
//	           explicit status=="down" after the sweep loop).
//
// The never-probed and never-heartbeaten distinction matters because they
// call for different operator actions: "pending" tells you to start ksedge
// (or check the port), "down" tells you it WAS working and broke.
func DeriveState(status string, lastSeen *time.Time, allOK, mixed, probeReachable bool, probeChecked *time.Time) string {
	neverSeen := lastSeen == nil
	neverProbed := probeChecked == nil
	if neverSeen && (!probeReachable || neverProbed) {
		return "pending"
	}
	up := status == "up"
	// Healthy when every collector reported ok, OR when the edge reported
	// no flags at all (legacy / first-heartbeat case). `mixed` is the
	// "at least one real collector failed" signal worth dimming the card.
	metricsHealthy := allOK || !mixed
	if up && metricsHealthy {
		return "up"
	}
	if up && !metricsHealthy {
		return "partial"
	}
	// status == "down" here.
	if probeReachable {
		// Edge responds to the probe but its heartbeat hasn't ticked
		// recently (still in the 90s grace window, or the panel
		// mis-recorded a heartbeat) — surface as partial so the card
		// doesn't lie about being offline.
		return "partial"
	}
	return "down"
}

// allMetricsOK returns true iff every telemetry-quality flag the edge has
// reported so far is true. Used by DeriveState callers; kept here because the
// answer is repo-shaped (it depends on the panel's notion of "every metric").
func allMetricsOK(n models.Node) bool {
	return n.HwRAMOK && n.HwCPUOK && n.HwDiskOK && n.HwUptimeOK && n.HwDriversOK
}

// anyMetricPartial returns true iff at least one telemetry-quality flag flips
// false while another flips true — the real "a collector failed" pattern. An
// edge that reports NO flags at all (legacy ksedge predating the quality bits)
// returns false here so DeriveState treats it as healthy, not partial.
func anyMetricPartial(n models.Node) bool {
	flags := []bool{n.HwRAMOK, n.HwCPUOK, n.HwDiskOK, n.HwUptimeOK, n.HwDriversOK}
	anyTrue := false
	anyFalse := false
	for _, f := range flags {
		if f {
			anyTrue = true
		} else {
			anyFalse = true
		}
	}
	return anyTrue && anyFalse
}

// NodesDueForHealthCheck returns every edge whose health check is enabled and
// whose next_probe_at is NULL or already in the past. The sweep loop calls
// this each tick to drive active probes without re-querying the whole table.
// Migration-tolerant: a DB that hasn't run 019 yet returns an empty slice so
// the loop silently keeps using the heartbeat-derived status only.
func (r *NodeRepository) NodesDueForHealthCheck() ([]models.Node, error) {
	// Include connection_mode so probe.Probe can pick the WSS-tunnel path
	// for reverse_tunnel / local_wss. Without it the sweep probed every
	// tunnel node via direct HTTP to address "tunnel" and always marked it
	// down even while the WSS tunnel was healthy.
	// The due filter uses a Go-side timestamp parameter, not SQLite's
	// datetime('now') (a syntax error on Postgres/MySQL).
	now := time.Now().UTC()
	rows, err := r.db.Query(`SELECT id, name, address, use_tls,
		health_timeout, skip_tls_verify, health_retries, connection_mode
		FROM nodes WHERE health_enabled = 1
		AND (next_probe_at IS NULL OR next_probe_at <= ?)`, now)
	if err != nil {
		// Pre-050 DBs lack connection_mode (all rows are implicitly
		// direct). Fall back to the legacy shape so probing keeps working
		// instead of silently disabling the sweep. Pre-019 DBs lack the
		// health columns entirely and still return empty (heartbeat-only).
		if !strings.Contains(strings.ToLower(err.Error()), "connection_mode") {
			return nil, nil
		}
		legacy, lerr := r.db.Query(`SELECT id, name, address, use_tls,
			health_timeout, skip_tls_verify, health_retries
			FROM nodes WHERE health_enabled = 1
			AND (next_probe_at IS NULL OR next_probe_at <= ?)`, now)
		if lerr != nil {
			return nil, nil
		}
		defer legacy.Close()
		var out []models.Node
		for legacy.Next() {
			var nd models.Node
			var useTLS, skipTLS int
			if err := legacy.Scan(&nd.ID, &nd.Name, &nd.Address, &useTLS,
				&nd.HealthTimeout, &skipTLS, &nd.HealthRetries); err != nil {
				continue
			}
			nd.UseTLS = useTLS == 1
			nd.SkipTLSVerify = skipTLS == 1
			nd.ConnectionMode = "direct"
			out = append(out, nd)
		}
		return out, legacy.Err()
	}
	defer rows.Close()
	var out []models.Node
	for rows.Next() {
		var nd models.Node
		var useTLS, skipTLS int
		var cm sql.NullString
		if err := rows.Scan(&nd.ID, &nd.Name, &nd.Address, &useTLS,
			&nd.HealthTimeout, &skipTLS, &nd.HealthRetries, &cm); err != nil {
			continue
		}
		nd.UseTLS = useTLS == 1
		nd.SkipTLSVerify = skipTLS == 1
		if cm.Valid && strings.TrimSpace(cm.String) != "" {
			nd.ConnectionMode = cm.String
		} else {
			nd.ConnectionMode = "direct"
		}
		out = append(out, nd)
	}
	return out, rows.Err()
}

// KindAllowed reports whether an instance `kind` ("docker", "kvm", ...) may
// deploy to this edge. An empty AllowedKinds list means "no restriction" so
// legacy rows stay permissive. The check is case-insensitive and trims
// whitespace so operators can type "Docker, kvm" without surprises.
func KindAllowed(allowed, kind string) bool {
	allowed = strings.TrimSpace(allowed)
	if allowed == "" {
		return true
	}
	kind = strings.ToLower(strings.TrimSpace(kind))
	for _, part := range strings.Split(allowed, ",") {
		if strings.ToLower(strings.TrimSpace(part)) == kind {
			return true
		}
	}
	return false
}
