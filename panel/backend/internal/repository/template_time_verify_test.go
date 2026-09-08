package repository

import (
	"database/sql"
	"testing"
	_ "modernc.org/sqlite"
)

func TestVerifyTemplateTime(t *testing.T) {
	db, _ := sql.Open("sqlite", ":memory:")
	defer db.Close()
	db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT)`)
	db.Exec(`CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL DEFAULT '{}', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, UNIQUE(name))`)
	repo := NewTemplateRepository(db)
	id, err := repo.Create(TemplateInput{Name: "demo", Kind: "docker", Image: "alpine:3.19", Spec: "{}"})
	if err != nil { t.Fatal(err) }
	list, err := repo.List()
	if err != nil { t.Fatal(err) }
	for _, tm := range list {
		t.Logf("List created=%v updated=%v zero=%v", tm.CreatedAt, tm.UpdatedAt, tm.UpdatedAt.IsZero())
		if tm.UpdatedAt.IsZero() { t.Fatalf("FAIL: zero time, id=%d", id) }
	}
	got, _ := repo.Get(id)
	if got.UpdatedAt.IsZero() { t.Fatalf("FAIL Get zero") }
	byName, _ := repo.GetByName("demo")
	if byName.UpdatedAt.IsZero() { t.Fatalf("FAIL GetByName zero") }
	// parser unit checks
	for _, s := range []string{"2026-09-08 19:13:50", "2026-09-08T19:13:50Z", "2026-09-08T19:13:50.123456789Z"} {
		if _, err := parseTemplateTime(s); err != nil { t.Fatalf("parse %q: %v", s, err) }
	}
}
