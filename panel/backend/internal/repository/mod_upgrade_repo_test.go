package repository

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/example/kspanel/internal/models"
)

func TestModUpgradeReplacesManifestAndDiffsGrants(t *testing.T) {
	con := newModSettingsTestDB(t)
	repo := NewModRepository(con)

	oldManifest := json.RawMessage(`{"name":"Tool","slug":"upgrade-tool","version":"1.0.0","apiVersion":2,"permissionsRequested":[{"capability":"db.read_only","access_level":"read_only"},{"capability":"filesystem","access_level":"read_only"}]}`)
	mod, err := repo.CreateMod(CreateModInput{Name: "Tool", Slug: "upgrade-tool", Version: "1.0.0", Manifest: oldManifest, PermissionsRequested: []models.PermissionReqV2{{Capability: "db.read_only", AccessLevel: "read_only"}, {Capability: "filesystem", AccessLevel: "read_only"}}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.SetGrants(mod.ID, []GrantDecision{{Capability: "db.read_only", Granted: true}, {Capability: "filesystem", Granted: true}}); err != nil {
		t.Fatalf("grant: %v", err)
	}

	newManifest := json.RawMessage(`{"name":"Tool","slug":"upgrade-tool","version":"2.0.0","apiVersion":2,"permissionsRequested":[{"capability":"db.read_write","access_level":"read_write"},{"capability":"filesystem","access_level":"read_only"}]}`)
	upgraded, err := repo.UpgradeMod(mod.ID, UpgradeModInput{
		Name: "Tool", Version: "2.0.0", Description: "new", Manifest: newManifest,
		Spec: json.RawMessage(`{"x":1}`), PackageSize: 123,
	})
	if err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if upgraded.Version != "2.0.0" || upgraded.PackageSize != 123 {
		t.Fatalf("row not updated: %+v", upgraded)
	}
	rows, err := repo.ListModPermissions(mod.ID)
	if err != nil {
		t.Fatalf("list perms: %v", err)
	}
	got := map[string]models.ModPermission{}
	for _, p := range rows {
		got[p.Capability] = p
	}
	if _, ok := got["db.read_only"]; ok {
		t.Fatal("removed capability kept its grant row")
	}
	if p := got["filesystem"]; !p.Granted || p.AccessLevel != "read_only" {
		t.Fatalf("unchanged grant was not preserved: %+v", p)
	}
	if p := got["db.read_write"]; p.Granted || p.AccessLevel != "read_write" {
		t.Fatalf("new capability must start pending: %+v", p)
	}

	if err := repo.SetGrants(mod.ID, []GrantDecision{{Capability: "db.read_write", Granted: true}}); err != nil {
		t.Fatalf("grant new capability: %v", err)
	}
	if err := repo.Activate(mod.ID); err != nil {
		t.Fatalf("activate: %v", err)
	}
	if _, err := repo.UpgradeMod(mod.ID, UpgradeModInput{Manifest: newManifest}); !errors.Is(err, ErrModActive) {
		t.Fatalf("expected ErrModActive, got %v", err)
	}

	other := json.RawMessage(fmt.Sprintf(`{"name":"Other","slug":"other-slug","version":"2.0.0","apiVersion":2}`))
	if _, err := repo.UpgradeMod(mod.ID, UpgradeModInput{Manifest: other}); err == nil {
		t.Fatal("accepted a manifest with a different slug")
	}
}
