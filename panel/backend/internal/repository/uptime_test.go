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
	var cnt int
	conn.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('instances') WHERE name='started_at'`).Scan(&cnt)
	if cnt == 0 {
		t.Fatalf("started_at column not exists")
	}
	// disable FK for test
	conn.Exec(`PRAGMA foreign_keys=OFF`)
	repo := NewInstanceRepository(conn)
	id, err := repo.Create(InstanceCreateInput{
		NodeID: 999, TemplateID: 999, OwnerID: 1, Name: "test-inst", Kind: "docker", Status: "creating", Config: "{}", InstallStep: -1,
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
	time.Sleep(1100 * time.Millisecond)
	repo.SetStatus(id, "stopped", "", "")
	inst, _ = repo.Get(id)
	if inst.StartedAt != nil {
		t.Fatalf("after stopped should be nil, got %v", *inst.StartedAt)
	}
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
	// UpdateConfig should not reset
	old := *inst.StartedAt
	time.Sleep(1100 * time.Millisecond)
	repo.UpdateConfig(id, `{"image":"new"}`)
	inst, _ = repo.Get(id)
	if inst.StartedAt == nil || !inst.StartedAt.Equal(old) {
		t.Fatalf("UpdateConfig should not change started_at old=%v new=%v", old, inst.StartedAt)
	}
	// List
	list, _ := repo.List()
	if len(list)==0 || list[0].StartedAt == nil {
		t.Fatalf("list should have started_at, got %v", list)
	}
	t.Logf("PASS")
}
