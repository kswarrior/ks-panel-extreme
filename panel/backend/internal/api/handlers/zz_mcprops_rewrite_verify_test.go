package handlers

// TEMPORARY verification for the minecraft-properties rewrite (loop V3).
// Deleted after the pass — do not commit.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func loadMcPropsActions(t *testing.T) []map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "instance_pages", "pages", "minecraft-properties.json"))
	if err != nil {
		t.Fatalf("read page json: %v", err)
	}
	var page struct {
		Actions string `json:"actions"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		t.Fatalf("parse page json: %v", err)
	}
	var acts []map[string]any
	if err := json.Unmarshal([]byte(page.Actions), &acts); err != nil {
		t.Fatalf("parse actions: %v", err)
	}
	return acts
}

func findAct(t *testing.T, acts []map[string]any, name string) map[string]any {
	t.Helper()
	for _, a := range acts {
		if a["name"] == name {
			return a
		}
	}
	t.Fatalf("action %q not found", name)
	return nil
}

func TestMcPropsRewriteVerify(t *testing.T) {
	acts := loadMcPropsActions(t)
	if len(acts) != 5 {
		t.Fatalf("expected 5 actions, got %d", len(acts))
	}
	// read_file exact match (SDK readFile equivalent posts type+path only).
	rd := findAct(t, acts, "read_props")
	if !savedActionMatches(rd, "read_file", "", "server.properties", "", nil, nil) {
		t.Fatal("read_props does not match")
	}
	// set_prop with runtime args.
	sp := findAct(t, acts, "set_prop")
	storedCmd, _ := sp["command"].(string)
	if !strings.Contains(storedCmd, "{{args}}") {
		t.Fatal("set_prop missing {{args}}")
	}
	reqArgs := []string{"server.properties", "server-port=25566"}
	if !savedActionMatches(sp, "shell", storedCmd, "", "", reqArgs, nil) {
		t.Fatal("set_prop request does not match stored def")
	}
	finalCmd, _, err := resolveExecPayload(sp, "shell", storedCmd, nil, reqArgs)
	if err != nil {
		t.Fatalf("resolve set_prop: %v", err)
	}
	if !strings.Contains(finalCmd, "'server.properties' 'server-port=25566'") {
		t.Fatalf("bad substitution: %q", finalCmd)
	}
	// Hostile value rejected.
	badArgs := []string{"server.properties", `motd=a"b`}
	if !savedActionMatches(sp, "shell", storedCmd, "", "", badArgs, nil) {
		t.Fatal("prefix match itself should still pass (extras validated in resolve)")
	}
	if _, _, err := resolveExecPayload(sp, "shell", storedCmd, nil, badArgs); err == nil {
		t.Fatal("expected rejection of quote in runtime arg")
	}
	// write_file-style dynamic content must NOT match (documents the design constraint).
	if savedActionMatches(rd, "write_file", "", "server.properties", "motd=x", nil, nil) {
		t.Fatal("read_file def must not match a write_file payload")
	}
	// backup with one arg ok, five rejected.
	bp := findAct(t, acts, "backup_props")
	bakCmd, _ := bp["command"].(string)
	if !savedActionMatches(bp, "shell", bakCmd, "", "", []string{"a.bak"}, nil) {
		t.Fatal("backup_props single-arg request does not match")
	}
	if _, _, err := resolveExecPayload(bp, "shell", bakCmd, nil, []string{"a", "b", "c", "d", "e"}); err == nil {
		t.Fatal("expected rejection of >4 runtime args")
	}
}
