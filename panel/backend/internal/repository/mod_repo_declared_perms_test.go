package repository

import (
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
)

// TestValidateDeclaredPermissions covers the manifest custom-permission gate
// (item: persist + enforce custom permissions). Keys arrive normalised as
// "<slug>:<key>" from models.ParseV2Manifest; the validator re-checks shape,
// duplicates and the count cap before any rows are seeded.
func TestValidateDeclaredPermissions(t *testing.T) {
	valid := [][]models.CustomPermission{
		nil,
		{{Key: "cool-mod:audit"}},
		{{Key: "cool-mod:audit", Description: "read the audit log"}, {Key: "cool-mod:configure"}},
		{{Key: "a1:ban-players"}},
		{{Key: "a1:player.ban_v2"}},
		// Bare key (blank-slug edge case) is still shape-checked.
		{{Key: "audit"}},
	}
	for _, list := range valid {
		if err := validateDeclaredPermissions(list); err != nil {
			t.Errorf("expected valid, got %v for %+v", err, list)
		}
	}

	rejected := []struct {
		name string
		list []models.CustomPermission
	}{
		{"empty key", []models.CustomPermission{{Key: ""}}},
		{"whitespace key", []models.CustomPermission{{Key: "   "}}},
		{"uppercase", []models.CustomPermission{{Key: "mod:Audit"}}},
		{"space inside", []models.CustomPermission{{Key: "mod:run job"}}},
		{"leading symbol", []models.CustomPermission{{Key: "mod:-nope"}}},
		{"empty key part", []models.CustomPermission{{Key: "mod:"}}},
		{"duplicate", []models.CustomPermission{{Key: "mod:audit"}, {Key: "mod:audit"}}},
	}
	for _, tc := range rejected {
		if err := validateDeclaredPermissions(tc.list); err == nil {
			t.Errorf("%s: expected rejection for %+v", tc.name, tc.list)
		}
	}

	// Count cap.
	tooMany := make([]models.CustomPermission, modDeclaredPermCap+1)
	for i := range tooMany {
		tooMany[i] = models.CustomPermission{Key: "mod:key" + strings.Repeat("x", i%5) + string(rune('a'+i%26)) + string(rune('a'+(i/26)%26))}
	}
	if err := validateDeclaredPermissions(tooMany); err == nil {
		t.Errorf("expected rejection above the %d-key cap", modDeclaredPermCap)
	}
}
