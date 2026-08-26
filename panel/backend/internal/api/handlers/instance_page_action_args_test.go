package handlers

import (
	"strings"
	"testing"
)

// ---- savedActionMatches -----------------------------------------------------

func TestSavedActionMatchesExactArgs(t *testing.T) {
	def := map[string]any{
		"type":    "shell",
		"command": "df -h",
		"args":    []any{"-x"},
	}
	if !savedActionMatches(def, "shell", "df -h", "", "", []string{"-x"}, nil) {
		t.Fatal("exact payload must match")
	}
	// Without open_args even a benign extra argument must be rejected: the
	// browser may never widen a stored command.
	if savedActionMatches(def, "shell", "df -h", "", "", []string{"-x", "extra"}, nil) {
		t.Fatal("extra args must not match without open_args")
	}
}

func TestSavedActionMatchesOpenArgsPrefix(t *testing.T) {
	def := map[string]any{
		"type":      "shell",
		"command":   "docker stop {{args}}",
		"open_args": true,
	}
	if !savedActionMatches(def, "shell", "docker stop {{args}}", "", "", []string{"web-1"}, nil) {
		t.Fatal("open_args action must match with runtime args")
	}
	if !savedActionMatches(def, "shell", "docker stop {{args}}", "", "", nil, nil) {
		t.Fatal("open_args action must also match with zero runtime args")
	}
	if savedActionMatches(def, "shell", "docker start {{args}}", "", "", []string{"web-1"}, nil) {
		t.Fatal("stored command is the trust anchor — a different command must not match")
	}
}

// ---- resolveExecPayload ------------------------------------------------------

func TestResolveExecPayloadShellSubstitution(t *testing.T) {
	def := map[string]any{"type": "shell", "command": "docker logs --tail 200 {{args}}", "open_args": true}
	cmd, args, err := resolveExecPayload(def, "shell", "docker logs --tail 200 {{args}}", nil, []string{"my ctr"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "docker logs --tail 200 'my ctr'"
	if cmd != want {
		t.Fatalf("command = %q, want %q", cmd, want)
	}
	if len(args) != 0 {
		t.Fatalf("shell extras must ride inside the command, argv = %v", args)
	}
}

func TestResolveExecPayloadShellQuoteEscape(t *testing.T) {
	def := map[string]any{"type": "shell", "command": "cat {{args}}", "open_args": true}
	cmd, _, err := resolveExecPayload(def, "shell", "cat {{args}}", nil, []string{"my file.txt"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd != "cat 'my file.txt'" {
		t.Fatalf("spaced args must land as one quoted word, got %q", cmd)
	}
}

// Quotes never pass validActionArg, so shellQuoteArg's escaping is pure
// defense-in-depth — prove it is still correct on its own.
func TestShellQuoteArgEscapesApostrophe(t *testing.T) {
	if got := shellQuoteArg("it's"); got != "'it'\\''s'" {
		t.Fatalf("shellQuoteArg = %q", got)
	}
}

func TestResolveExecPayloadRejectsBadInput(t *testing.T) {
	cases := []struct {
		name   string
		def    map[string]any
		typ    string
		cmd    string
		reqArg string
	}{
		{"metacharacters", map[string]any{"type": "shell", "command": "echo {{args}}", "open_args": true}, "shell", "echo {{args}}", "a;b"},
		{"placeholder-missing", map[string]any{"type": "shell", "command": "uptime", "open_args": true}, "shell", "uptime", "x"},
		{"file-op-extra", map[string]any{"type": "read_file", "path": "/etc/hosts", "open_args": true}, "read_file", "", "x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := resolveExecPayload(tc.def, tc.typ, tc.cmd, nil, []string{tc.reqArg})
			if err == nil {
				t.Fatal("expected rejection, got nil error")
			}
		})
	}
}

func TestResolveExecPayloadMaxArgs(t *testing.T) {
	def := map[string]any{"type": "shell", "command": "echo {{args}}", "open_args": true}
	extras := []string{"a", "b", "c", "d", "e"}
	if _, _, err := resolveExecPayload(def, "shell", "echo {{args}}", nil, extras); err == nil {
		t.Fatal("more than maxOpenActionArgs extras must be rejected")
	}
}

func TestResolveExecPayloadDriverAppendsQuoted(t *testing.T) {
	def := map[string]any{"type": "docker", "command": "stop", "open_args": true}
	_, args, err := resolveExecPayload(def, "docker", "stop", nil, []string{"web-1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(args) != 1 || args[0] != "'web-1'" {
		t.Fatalf("driver extras must append pre-quoted, got %v", args)
	}
}

func TestResolveExecPayloadNonOpenPassthrough(t *testing.T) {
	def := map[string]any{"type": "lxd", "command": "list"}
	cmd, args, err := resolveExecPayload(def, "lxd", "list", []string{"--fast"}, []string{"--fast"})
	if err != nil || cmd != "list" || len(args) != 1 || args[0] != "--fast" {
		t.Fatalf("non-open defs must pass stored fields through untouched (cmd=%q args=%v err=%v)", cmd, args, err)
	}
}

func TestValidActionArgCharset(t *testing.T) {
	valid := []string{"web-1", "ssh.service", "/etc/app.conf", "user@1000", "my ctr", "a.b:c"}
	for _, s := range valid {
		if !validActionArg(s) {
			t.Errorf("%q should be valid", s)
		}
	}
	invalid := []string{"", strings.Repeat("a", 201), "a;b", "a|b", "$(id)", "`id`", "a\nb", "a'b", `"x"`, "a>b", "~x"}
	for _, s := range invalid {
		if validActionArg(s) {
			t.Errorf("%q should be INVALID", s)
		}
	}
}
