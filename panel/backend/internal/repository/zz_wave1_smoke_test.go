package repository

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestWave1NodeHeartbeatPortable(t *testing.T) {
	dir := t.TempDir()
	dsn := filepath.Join(dir, "smoke.db")
	con, d, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: dsn})
	if err != nil {
		t.Fatal(err)
	}
	defer con.Close()
	if err := db.EnsureSchemaAndSeed(d, con); err != nil {
		t.Fatal(err)
	}
	nr := NewNodeRepository(con)
	nd, token, err := nr.CreateNode(CreateNodeInput{Name: "smoke", Address: "127.0.0.1:4040"})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ { // same-minute: INSERT then UPDATE path
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
	if _, err := nr.MarkStale(0); err != nil { // everything stale: exercises down-bucket path
		t.Fatalf("markstale: %v", err)
	}
}
