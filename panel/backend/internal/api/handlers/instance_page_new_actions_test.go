package handlers

import (
	"strings"
	"testing"
)

// ---- validatePageActions: new edge action types ----------------------------
// Valid definitions for every new type must pass (alongside the legacy
// types, which stay permissive so older pages keep loading).

func TestValidatePageActionsNewTypesValid(t *testing.T) {
	raw := `[
		{"name":"s","type":"stat","path":"/data/server.properties"},
		{"name":"c","type":"chmod","path":"/data/server.properties","mode":"0644"},
		{"name":"a","type":"archive","path":"/data/world","names":["level.dat","playerdata"],"dest":"/tmp/world.tar.gz"},
		{"name":"a2","type":"archive","path":"/data/world","dest":"/tmp/world.zip"},
		{"name":"e","type":"extract","path":"/tmp/world.zip","dest":"/data/restored"},
		{"name":"e2","type":"extract","path":"/tmp/world.tar.gz"},
		{"name":"old","type":"shell","command":"echo hi"}
	]`
	if err := validatePageActions(raw); err != nil {
		t.Fatalf("valid new-type defs must pass, got %v", err)
	}
}

func TestValidatePageActionsMissingFields(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"stat-no-path", `[{"name":"s","type":"stat"}]`},
		{"stat-empty-path", `[{"name":"s","type":"stat","path":""}]`},
		{"chmod-no-path", `[{"name":"c","type":"chmod","mode":"0644"}]`},
		{"chmod-no-mode", `[{"name":"c","type":"chmod","path":"/data/x"}]`},
		{"archive-no-path", `[{"name":"a","type":"archive","dest":"/tmp/a.zip"}]`},
		{"archive-no-dest", `[{"name":"a","type":"archive","path":"/data/world"}]`},
		{"archive-bad-dest-ext", `[{"name":"a","type":"archive","path":"/data/world","dest":"/tmp/a.bin"}]`},
		{"extract-no-path", `[{"name":"e","type":"extract"}]`},
		{"extract-bad-path-ext", `[{"name":"e","type":"extract","path":"/tmp/a.bin"}]`},
		{"missing-name", `[{"type":"stat","path":"/data/x"}]`},
		{"unknown-type", `[{"name":"x","type":"teleport","path":"/data/x"}]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := validatePageActions(tc.raw); err == nil {
				t.Fatal("expected rejection, got nil error")
			}
		})
	}
}

func TestValidatePageActionsModeStrictness(t *testing.T) {
	valid := []string{"644", "0755", "0644", "777", "0000", "0777"}
	for _, m := range valid {
		raw := `[{"name":"c","type":"chmod","path":"/data/x","mode":"` + m + `"}]`
		if err := validatePageActions(raw); err != nil {
			t.Errorf("mode %q should pass, got %v", m, err)
		}
	}
	// "7777" passes the ^[0-7]{3,4}$ charset but exceeds the 0o777
	// setuid/setgid/sticky-bit cap, so it must still fail.
	invalid := []string{"", "abc", "999", "888", "89", "7555", "7777", "1755", "06444", "64", "0o644", "-644", "644 "}
	for _, m := range invalid {
		raw := `[{"name":"c","type":"chmod","path":"/data/x","mode":"` + m + `"}]`
		if err := validatePageActions(raw); err == nil {
			t.Errorf("mode %q should be rejected", m)
		}
	}
}

func TestValidatePageActionsArchiveNamesJail(t *testing.T) {
	// Traversal outside the source dir must fail the definition closed.
	bad := []string{"../escape", "..", ".", "/", "", "/abs/path", "a/../../escape", "a/../.."}
	for _, n := range bad {
		raw := `[{"name":"a","type":"archive","path":"/data/world","names":["level.dat","` + n + `"],"dest":"/tmp/a.zip"}]`
		if err := validatePageActions(raw); err == nil {
			t.Errorf("archive entry %q should be rejected", n)
		}
	}
	// Non-string names must fail closed (never partially forwarded).
	if err := validatePageActions(`[{"name":"a","type":"archive","path":"/data/world","names":["ok",42],"dest":"/tmp/a.zip"}]`); err == nil {
		t.Fatal("non-string archive entry must be rejected")
	}
}

func TestValidatePageActionsOversize(t *testing.T) {
	// 1001 names exceeds the maxPageActionNames cap.
	var sb strings.Builder
	sb.WriteString(`[{"name":"a","type":"archive","path":"/data/world","names":[`)
	for i := 0; i < 1001; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`"f`)
		sb.WriteString(strings.Repeat("a", 3))
		sb.WriteString(`"`)
	}
	sb.WriteString(`],"dest":"/tmp/a.zip"}]`)
	if err := validatePageActions(sb.String()); err == nil {
		t.Fatal("more than maxPageActionNames entries must be rejected")
	}
	// Absurd path lengths are rejected.
	long := strings.Repeat("a", maxPageActionPathLen+1)
	if err := validatePageActions(`[{"name":"s","type":"stat","path":"/` + long + `"}]`); err == nil {
		t.Fatal("oversize path must be rejected")
	}
	// NUL bytes are rejected.
	if err := validatePageActions("[{\"name\":\"s\",\"type\":\"stat\",\"path\":\"/data/x\x00y\"}]"); err == nil {
		t.Fatal("NUL-byte path must be rejected")
	}
}

// ---- validateInstancePage wiring -------------------------------------------
// The save gate must enforce the new shape (not just the helper above).

func TestValidateInstancePageNewActionTypes(t *testing.T) {
	good := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"s","type":"stat","path":"/data/x"}]`,
	}
	if _, err := validateInstancePage(good); err != nil {
		t.Fatalf("valid stat action must save, got %v", err)
	}
	bad := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"c","type":"chmod","path":"/data/x"}]`,
	}
	if _, err := validateInstancePage(bad); err == nil {
		t.Fatal("chmod without mode must fail the save gate")
	}
	huge := instancePageDTO{
		Name:    "P",
		Slug:    "p",
		Kind:    "custom",
		Actions: `[{"name":"x","type":"shell","command":"` + strings.Repeat("a", maxInstancePageActionsBytes) + `"}]`,
	}
	if _, err := validateInstancePage(huge); err == nil {
		t.Fatal("oversize actions JSON must fail the save gate")
	}
}

// ---- savedActionMatches: new executable fields are pinned ------------------
// A swapped mode/names/dest must NOT match (the mismatch is what the three
// execute handlers turn into a 403 "action is not defined on this page").

func TestSavedActionMatchesNewFields(t *testing.T) {
	statDef := map[string]any{"type": "stat", "path": "/data/x"}
	if !savedActionMatches(statDef, "stat", "", "/data/x", "", nil, nil, "", nil, "") {
		t.Fatal("exact stat payload must match")
	}
	chmodDef := map[string]any{"type": "chmod", "path": "/data/x", "mode": "0644"}
	if !savedActionMatches(chmodDef, "chmod", "", "/data/x", "", nil, nil, "0644", nil, "") {
		t.Fatal("exact chmod payload must match")
	}
	if savedActionMatches(chmodDef, "chmod", "", "/data/x", "", nil, nil, "0755", nil, "") {
		t.Fatal("swapped chmod mode must not match (allow-list bypass)")
	}
	archiveDef := map[string]any{
		"type": "archive", "path": "/data/world",
		"names": []any{"level.dat"}, "dest": "/tmp/a.zip",
	}
	if !savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"level.dat"}, "/tmp/a.zip") {
		t.Fatal("exact archive payload must match")
	}
	if savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"other.dat"}, "/tmp/a.zip") {
		t.Fatal("swapped archive names must not match (allow-list bypass)")
	}
	if savedActionMatches(archiveDef, "archive", "", "/data/world", "", nil, nil, "", []string{"level.dat"}, "/tmp/b.zip") {
		t.Fatal("swapped archive dest must not match (allow-list bypass)")
	}
	extractDef := map[string]any{"type": "extract", "path": "/tmp/a.zip", "dest": "/data/r"}
	if savedActionMatches(extractDef, "extract", "", "/tmp/a.zip", "", nil, nil, "", nil, "/data/other") {
		t.Fatal("swapped extract dest must not match (allow-list bypass)")
	}
}

// ---- savedActionExecFields: new fields round-trip, malformed fails closed --

func TestSavedActionExecFieldsNewTypes(t *testing.T) {
	def := map[string]any{
		"type": "archive", "path": "/data/world",
		"names": []any{"a", "b"}, "dest": "/tmp/a.tar.gz",
	}
	typ, _, execPath, _, _, _, mode, names, dest, _, ok := savedActionExecFields(def)
	if !ok || typ != "archive" || execPath != "/data/world" || mode != "" {
		t.Fatalf("archive exec fields wrong: typ=%q path=%q mode=%q ok=%v", typ, execPath, mode, ok)
	}
	if len(names) != 2 || names[0] != "a" || dest != "/tmp/a.tar.gz" {
		t.Fatalf("names/dest lost: %v %q", names, dest)
	}
	bad := map[string]any{"type": "extract", "path": "/tmp/a.zip", "names": []any{"ok", 42}}
	if _, _, _, _, _, _, _, _, _, _, ok := savedActionExecFields(bad); ok {
		t.Fatal("non-string names must fail closed")
	}
	if _, _, _, _, _, _, _, _, _, _, ok := savedActionExecFields(map[string]any{"type": "teleport"}); ok {
		t.Fatal("unknown type must fail closed")
	}
}

// ---- resolveExecPayload: new types never accept runtime extras -------------

func TestResolveExecPayloadNewTypesRejectExtras(t *testing.T) {
	for _, typ := range []string{"stat", "chmod", "archive", "extract", "read_file", "write_file", "list_files"} {
		def := map[string]any{"type": typ, "open_args": true}
		if _, _, err := resolveExecPayload(def, typ, "", nil, []string{"extra"}); err == nil {
			t.Errorf("%s with open_args must still reject runtime extras", typ)
		}
	}
}
