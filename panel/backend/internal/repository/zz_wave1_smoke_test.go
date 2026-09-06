package repository

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestWave1NodeHeartbeatPortable(t *testing.T) {
	con, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer con.Close()
	con.SetMaxOpenConns(1)
	for _, stmt := range []string{
		`CREATE TABLE nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, address TEXT, use_tls INTEGER, token_hash TEXT, token_prefix TEXT, token_plain TEXT, ram_used INTEGER, ram_total INTEGER, cpu_percent REAL, disk_used INTEGER, disk_total INTEGER, uptime_secs INTEGER, status TEXT, uptime_pct REAL, last_seen_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, driver_docker INTEGER DEFAULT 0, driver_kvm INTEGER DEFAULT 0, driver_multipass INTEGER DEFAULT 0, driver_lxd INTEGER DEFAULT 0, hw_ram_ok INTEGER DEFAULT 0, hw_cpu_ok INTEGER DEFAULT 0, hw_disk_ok INTEGER DEFAULT 0, hw_uptime_ok INTEGER DEFAULT 0, hw_drivers_ok INTEGER DEFAULT 0, probe_reachable INTEGER, probe_seen_name TEXT, probe_checked_at DATETIME, health_enabled INTEGER DEFAULT 1, health_interval INTEGER DEFAULT 60, health_timeout INTEGER DEFAULT 4, health_retries INTEGER DEFAULT 3, skip_tls_verify INTEGER DEFAULT 0, notes TEXT DEFAULT '', install_dir TEXT DEFAULT '', allowed_kinds TEXT DEFAULT '', alloc_mem_mib INTEGER DEFAULT 0, mem_overcommit_pct INTEGER DEFAULT 0, alloc_disk_mib INTEGER DEFAULT 0, disk_overcommit_pct INTEGER DEFAULT 0, instances_dir TEXT DEFAULT '', category TEXT DEFAULT '', location_country TEXT DEFAULT '', location_node TEXT DEFAULT '', icon TEXT DEFAULT '', color TEXT DEFAULT '', probe_fail_count INTEGER DEFAULT 0, next_probe_at DATETIME, connection_mode TEXT DEFAULT 'direct', owner_id INTEGER)`,
		`CREATE TABLE node_heartbeats (node_id INTEGER NOT NULL, bucket_at DATETIME NOT NULL, status TEXT NOT NULL, PRIMARY KEY (node_id, bucket_at))`,
	} {
		if _, err := con.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	nr := NewNodeRepository(con)
	nd, token, err := nr.CreateNode(CreateNodeInput{Name: "smoke", Address: "127.0.0.1:4040"})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := nr.IngestHeartbeat(IngestInput{Token: token, RAMUsed: 1, RAMTotal: 8}); err != nil {
			t.Fatalf("ingest %d: %v", i, err)
		}
	}
	hbs, err := nr.RecentHeartbeats(nd.ID, 5)
	if err != nil || len(hbs) == 0 {
		t.Fatalf("heartbeats: %v len=%d", err, len(hbs))
	}
	if err := nr.RecordProbe(nd.ID, ProbeInput{Reachable: true, SeenName: "smoke", CheckedAt: time.Now().UTC()}); err != nil {
		t.Fatalf("probe: %v", err)
	}
	got, err := nr.GetNode(nd.ID)
	if err != nil || got.NextProbeAt == nil {
		t.Fatalf("get after probe: %v %+v", err, got)
	}
	due, err := nr.NodesDueForHealthCheck()
	if err != nil {
		t.Fatalf("due: %v", err)
	}
	t.Logf("buckets=%d next_probe=%s due=%d", len(hbs), got.NextProbeAt.Format(time.RFC3339), len(due))
	if _, err := nr.MarkStale(0); err != nil {
		t.Fatalf("markstale: %v", err)
	}
}
