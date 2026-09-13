package handlers

import (
	"testing"

	"github.com/example/kspanel/internal/repository"
	_ "modernc.org/sqlite"
)

func TestDbgOpenDBSeesSeed(t *testing.T) {
	db := newInstancePageScopeTestDB(t)
	if _, err := db.Exec(`INSERT INTO instance_pages (name, slug, kind, content_type) VALUES ('Files','files','custom','html')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	con, err := repository.OpenDB()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer con.Close()
	var n int
	if err := con.QueryRow(`SELECT COUNT(*) FROM instance_pages`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	t.Logf("count=%d", n)
	p, gerr := repository.NewInstancePageRepository(con).Get(1)
	if gerr != nil {
		t.Fatalf("get: %v", gerr)
	}
	t.Logf("page=%+v", p.Slug)
}
