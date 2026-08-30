package repository

import (
	"testing"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
)

func TestUptimeStartedAt(t *testing.T) {
	cfg := config.DBConfig{Engine: "sqlite", DSN: ":memory:"}
	dialect, _ := db.NewDialect(cfg.Engine)
	conn, _ := dialect.Open(cfg.DSN)
	defer conn.Close()
	if err := db.RunMigrations(dialect, conn); err != nil {
		t.Fatalf("migrations %v", err)
	}
	// create minimal valid node/template
	_, err := conn.Exec(`INSERT INTO nodes (name, address, use_tls, token_hash, token_prefix) VALUES ('test-node','127.0.0.1:9999',0,'hash','pref')`)
	if err != nil {
		t.Fatalf("node insert %v", err)
	}
	_, err = conn.Exec(`INSERT INTO templates (name, kind, image, spec) VALUES ('t','docker','alpine','{}')`)
	if err != nil {
		t.Fatalf("tmpl insert %v", err)
	}
	var nodeID, tmplID int64
	conn.QueryRow(`SELECT id FROM nodes LIMIT 1`).Scan(&nodeID)
	conn.QueryRow(`SELECT id FROM templates LIMIT 1`).Scan(&tmplID)
	t.Logf("node %d tmpl %d", nodeID, tmplID)
	repo := NewInstanceRepository(conn)
	id, err := repo.Create(InstanceCreateInput{
		NodeID: nodeID, TemplateID: tmplID, OwnerID: 1, Name: "test-inst", Kind: "docker", Status: "creating", Config: "{}", InstallStep: -1,
	})
	if err != nil {
		t.Fatalf("create %v", err)
	}
	inst, _ := repo.Get(id)
	if inst.StartedAt != nil {
		t.Fatalf("after create should be nil, got %v", inst.StartedAt)
	}
	time.Sleep(1100 * time.Millisecond)
	repo.SetStatus(id, "running", "ext1", "")
	inst, _ = repo.Get(id)
	if inst.StartedAt == nil {
		t.Fatalf("after running should be set")
	}
	diff := time.Since(*inst.StartedAt)
	if diff > 2*time.Second {
		t.Fatalf("uptime diff too large %v", diff)
	}
	t.Logf("running started_at %v diff %.1f", *inst.StartedAt, diff.Seconds())
	time.Sleep(1100 * time.Millisecond)
	repo.SetStatus(id, "stopped", "", "")
	inst, _ = repo.Get(id)
	if inst.StartedAt != nil {
		t.Fatalf("after stopped should be nil, got %v", *inst.StartedAt)
	}
	t.Logf("stopped correctly nil")
	time.Sleep(1100 * time.Millisecond)
	repo.SetStatus(id, "running", "ext1", "")
	inst, _ = repo.Get(id)
	if inst.StartedAt == nil {
		t.Fatalf("after restart should be set")
	}
	diff = time.Since(*inst.StartedAt)
	if diff > 2*time.Second {
		t.Fatalf("restart uptime not reset %v", diff)
	}
	t.Logf("restart started_at %v diff %.1f", *inst.StartedAt, diff.Seconds())
	// UpdateConfig should not reset
	old := *inst.StartedAt
	time.Sleep(1100 * time.Millisecond)
	repo.UpdateConfig(id, `{"image":"new"}`)
	inst, _ = repo.Get(id)
	if inst.StartedAt == nil || !inst.StartedAt.Equal(old) {
		t.Fatalf("UpdateConfig should not change started_at old=%v new=%v", old, inst.StartedAt)
	}
	t.Logf("UpdateConfig preserved started_at")
	// List
	list, err := repo.List()
	if err != nil {
		t.Fatalf("list err %v", err)
	}
	if len(list)==0 || list[0].StartedAt == nil {
		t.Fatalf("list should have started_at, got %v len %d err %v", list, len(list), err)
	}
	t.Logf("PASS list %d started_at %v", len(list), *list[0].StartedAt)
}
