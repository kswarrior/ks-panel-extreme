package models

import (
	"encoding/json"
	"testing"
)

func depMod(id int64, slug, version string, active bool, manifest string) *Mod {
	return &Mod{
		ID: id, Slug: slug, Version: version, Active: active,
		Manifest: json.RawMessage(manifest),
	}
}

func TestCheckDependenciesReasons(t *testing.T) {
	base := depMod(1, "base", "1.0.0", true, `{"apiVersion":3}`)
	installed := []*Mod{
		base,
		depMod(2, "inactive", "1.0.0", false, `{}`),
		depMod(3, "old", "0.9.0", true, `{}`),
	}
	cases := []struct {
		name   string
		mod    *Mod
		reason string
	}{
		{"missing", depMod(10, "target", "1.0.0", false, `{"apiVersion":3,"requires":{"nope":"*"}}`), "missing"},
		{"inactive", depMod(11, "target", "1.0.0", false, `{"apiVersion":3,"requires":{"inactive":"*"}}`), "inactive"},
		{"version", depMod(12, "target", "1.0.0", false, `{"apiVersion":3,"requires":{"old":">=1.0.0"}}`), "version"},
		{"self", depMod(13, "target", "1.0.0", false, `{"apiVersion":3,"requires":{"target":"*"}}`), "self"},
	}
	for _, tc := range cases {
		issues := CheckDependencies(tc.mod, append(installed, tc.mod), true)
		if len(issues) != 1 || issues[0].Reason != tc.reason {
			t.Errorf("%s: got %+v, want reason %s", tc.name, issues, tc.reason)
		}
	}
	if issues := CheckDependencies(base, installed, true); len(issues) != 0 {
		t.Fatalf("base has no deps: %+v", issues)
	}
}

func TestSortModsByDependency(t *testing.T) {
	a := depMod(1, "a", "1.0.0", true, `{"apiVersion":3,"requires":{"b":"*"}}`)
	b := depMod(2, "b", "1.0.0", true, `{"apiVersion":3,"requires":{"c":"*"}}`)
	c := depMod(3, "c", "1.0.0", true, `{"apiVersion":3}`)
	ordered, blocked := SortModsByDependency([]*Mod{a, b, c})
	if len(blocked) != 0 {
		t.Fatalf("unexpected blocked: %+v", blocked)
	}
	got := []string{ordered[0].Slug, ordered[1].Slug, ordered[2].Slug}
	want := []string{"c", "b", "a"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
}

func TestSortModsByDependencyBlocksMissingAndCycles(t *testing.T) {
	missing := depMod(1, "missing-dep", "1.0.0", true, `{"apiVersion":3,"requires":{"nope":"*"}}`)
	child := depMod(2, "child", "1.0.0", true, `{"apiVersion":3,"requires":{"missing-dep":"*"}}`)
	x := depMod(3, "x", "1.0.0", true, `{"apiVersion":3,"requires":{"y":"*"}}`)
	y := depMod(4, "y", "1.0.0", true, `{"apiVersion":3,"requires":{"x":"*"}}`)
	ordered, blocked := SortModsByDependency([]*Mod{missing, child, x, y})
	if len(ordered) != 0 {
		t.Fatalf("expected no bootable mods, got %v", ordered)
	}
	if blocked["missing-dep"][0].Reason != "missing" {
		t.Fatalf("missing-dep reason = %+v", blocked["missing-dep"])
	}
	if blocked["child"][0].Reason != "dependency_blocked" {
		t.Fatalf("child reason = %+v", blocked["child"])
	}
	if blocked["x"][0].Reason != "cycle" || blocked["y"][0].Reason != "cycle" {
		t.Fatalf("cycle reasons = %+v", blocked)
	}
}

func TestCheckConflictsAndDependents(t *testing.T) {
	a := depMod(1, "a", "1.0.0", false, `{"apiVersion":3,"provides":["slot:one"]}`)
	b := depMod(2, "b", "1.0.0", true, `{"apiVersion":3,"provides":["slot:one"]}`)
	if got := CheckConflicts(b, []*Mod{a, b}); len(got) != 0 {
		t.Fatalf("inactive provider should not block activation yet: %v", got)
	}
	a.Active = true
	if got := CheckConflicts(b, []*Mod{a, b}); len(got) != 1 {
		t.Fatalf("active duplicate provide should conflict: %v", got)
	}
	c := depMod(3, "c", "1.0.0", true, `{"apiVersion":3,"requires":{"a":"*"}}`)
	if got := ActiveDependents(a, []*Mod{a, b, c}); len(got) != 1 || got[0] != "c" {
		t.Fatalf("dependents = %v, want [c]", got)
	}
}
