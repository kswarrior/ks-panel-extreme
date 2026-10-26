package repository

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/example/kspanel/internal/models"
)

func createDependencyTestMod(t *testing.T, repo *ModRepository, name, slug, version, extra string) *models.Mod {
	t.Helper()
	manifest := fmt.Sprintf(`{"name":%q,"slug":%q,"version":%q,"apiVersion":3%s}`, name, slug, version, extra)
	mod, err := repo.CreateMod(CreateModInput{
		Name: name, Slug: slug, Version: version,
		Manifest: json.RawMessage(manifest),
	})
	if err != nil {
		t.Fatalf("create %s: %v", slug, err)
	}
	return mod
}

func TestModActivationDependencyAndConflictContract(t *testing.T) {
	con := newModSettingsTestDB(t)
	repo := NewModRepository(con)

	base := createDependencyTestMod(t, repo, "Base", "base-dep", "1.0.0", "")
	child := createDependencyTestMod(t, repo, "Child", "child-mod", "1.0.0", `,"requires":{"base-dep":"^1.0.0"}`)

	if err := repo.Activate(child.ID); err == nil {
		t.Fatal("child activated while dependency was inactive")
	} else {
		var depErr *models.DependencyError
		if !errors.As(err, &depErr) || depErr.Issues[0].Reason != "inactive" {
			t.Fatalf("expected inactive dependency, got %v", err)
		}
	}
	if err := repo.Activate(base.ID); err != nil {
		t.Fatalf("activate base: %v", err)
	}
	if err := repo.Activate(child.ID); err != nil {
		t.Fatalf("activate child: %v", err)
	}
	if err := repo.Deactivate(base.ID); err == nil {
		t.Fatal("deactivated a mod with an active dependent")
	} else {
		var depsErr *models.DependentsError
		if !errors.As(err, &depsErr) || len(depsErr.Dependents) != 1 || depsErr.Dependents[0] != "child-mod" {
			t.Fatalf("expected active dependent, got %v", err)
		}
	}
	if err := repo.Deactivate(child.ID); err != nil {
		t.Fatalf("deactivate child: %v", err)
	}
	if err := repo.Deactivate(base.ID); err != nil {
		t.Fatalf("deactivate base: %v", err)
	}

	missing := createDependencyTestMod(t, repo, "Missing", "missing-child", "1.0.0", `,"requires":{"ghost-mod":"*"}`)
	if err := repo.Activate(missing.ID); err == nil {
		t.Fatal("activated with a missing dependency")
	} else {
		var depErr *models.DependencyError
		if !errors.As(err, &depErr) || depErr.Issues[0].Reason != "missing" {
			t.Fatalf("expected missing dependency, got %v", err)
		}
	}

	old := createDependencyTestMod(t, repo, "Old", "old-dep", "1.0.0", "")
	newer := createDependencyTestMod(t, repo, "Newer", "needs-newer", "1.0.0", `,"requires":{"old-dep":">=2.0.0"}`)
	if err := repo.Activate(old.ID); err != nil {
		t.Fatalf("activate old: %v", err)
	}
	if err := repo.Activate(newer.ID); err == nil {
		t.Fatal("activated with a version-mismatched dependency")
	} else {
		var depErr *models.DependencyError
		if !errors.As(err, &depErr) || depErr.Issues[0].Reason != "version" {
			t.Fatalf("expected version mismatch, got %v", err)
		}
	}

	ownerA := createDependencyTestMod(t, repo, "Owner A", "owner-a", "1.0.0", `,"provides":["slot:shared"]`)
	ownerB := createDependencyTestMod(t, repo, "Owner B", "owner-b", "1.0.0", `,"provides":["slot:shared"]`)
	if err := repo.Activate(ownerA.ID); err != nil {
		t.Fatalf("activate owner-a: %v", err)
	}
	if err := repo.Activate(ownerB.ID); err == nil {
		t.Fatal("activated a second owner of the same provided token")
	} else {
		var conflictErr *models.ConflictError
		if !errors.As(err, &conflictErr) || len(conflictErr.Conflicts) == 0 {
			t.Fatalf("expected provides conflict, got %v", err)
		}
	}
}

func TestModCreateRejectsIncompatiblePanel(t *testing.T) {
	con := newModSettingsTestDB(t)
	repo := NewModRepository(con)
	manifest := json.RawMessage(`{"name":"Future","slug":"future-mod","version":"1.0.0","apiVersion":3,"requires":{"panel":">=99.0.0"}}`)
	_, err := repo.CreateMod(CreateModInput{Name: "Future", Slug: "future-mod", Version: "1.0.0", Manifest: manifest})
	var incompat *models.IncompatibilityError
	if !errors.As(err, &incompat) || incompat.Component != "panel" {
		t.Fatalf("expected panel incompatibility, got %v", err)
	}
}
