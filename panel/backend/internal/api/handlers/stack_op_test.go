package handlers

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	_ "modernc.org/sqlite"
)

// newStackOpTestDB builds the minimal schema runStackOpJob touches:
// stacks (full column list), stack_permissions and settings. Activity writes
// go to a throwaway file DB via KSPANEL_DB*, never here.
func newStackOpTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	stmts := []string{
		`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE stacks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', runtime TEXT NOT NULL DEFAULT '', entrypoint TEXT NOT NULL DEFAULT '', manifest TEXT NOT NULL DEFAULT '{}', spec TEXT NOT NULL DEFAULT '{}', frontend_theme_mode TEXT NOT NULL DEFAULT '', page_style TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, uploaded_by INTEGER, owner_id INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', package_size INTEGER NOT NULL DEFAULT 0, proxy_port INTEGER NOT NULL DEFAULT 0, proxy_root_url TEXT NOT NULL DEFAULT '', remote_address TEXT NOT NULL DEFAULT '', remote_use_tls INTEGER NOT NULL DEFAULT 0, remote_skip_verify INTEGER NOT NULL DEFAULT 0, token_hash TEXT NOT NULL DEFAULT '', token_prefix TEXT NOT NULL DEFAULT '', token_plain TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'down', last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', serve_port INTEGER NOT NULL DEFAULT 0, serve_auth INTEGER NOT NULL DEFAULT 1)`,
		`CREATE TABLE stack_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, stack_id INTEGER NOT NULL, capability TEXT NOT NULL DEFAULT '', access_level TEXT NOT NULL DEFAULT '', granted INTEGER NOT NULL DEFAULT 0)`,
		`INSERT INTO stacks (id, name, slug, category, version, manifest, spec, active, created_at, updated_at) VALUES (1, 'Op Probe', 'op-probe', 'tool', '1.0.0', '{}', '{}', 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
		`INSERT INTO stack_permissions (stack_id, capability, access_level, granted) VALUES (1, 'notify', 'allow', 0)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	return db
}

func newStackOpTestJob(op string, stackID int64) *stackOpJob {
	defs := stackOpBuildDefs(op, &models.Stack{ID: stackID, Manifest: json.RawMessage("{}")})
	steps := make([]stackOpStep, 0, len(defs))
	for _, d := range defs {
		steps = append(steps, stackOpStep{Name: d.name, State: "pending"})
	}
	return &stackOpJob{
		cond:      make(chan struct{}),
		JobID:     "test-" + op,
		StackID:   stackID,
		Op:        op,
		Status:    stackOpRunning,
		Steps:     steps,
		Logs:      []string{},
		CreatedAt: stackOpNow(),
		UpdatedAt: stackOpNow(),
	}
}

// Activity writes during the run must not touch the repo checkout: point
// the file DB at a temp path (insert fails on missing table, logged only).
func isolateActivityDB(t *testing.T) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "act.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
}

func TestStackManifestWorkflowSteps(t *testing.T) {
	// Realistic full manifest: string/object keys alongside the step
	// arrays (a map-based parse would reject these manifests outright).
	full := json.RawMessage(`{"name":"Launch Probe","slug":"launch-probe","version":"1.0.0","category":"tool","runtime":"static","panelPermissions":[],"installType":"docker","launchSteps":[{"action":"shell","command":"echo up"}],"launch":[{"action":"mkdir","path":"x"}]}`)
	got := stackManifestLaunchSteps(full)
	if len(got) != 1 || got[0].Action != "shell" {
		t.Fatalf("launchSteps should win in a full manifest, got %+v", got)
	}
	if got := stackManifestWorkflowSteps(full); len(got) != 0 {
		t.Fatalf("no install steps here, got %+v", got)
	}
	// installSteps wins over install.
	got = stackManifestWorkflowSteps(json.RawMessage(`{"installSteps":[{"action":"shell"}],"install":[{"action":"mkdir"}]}`))
	if len(got) != 1 || got[0].Action != "shell" {
		t.Fatalf("installSteps should win, got %+v", got)
	}
	// install fallback.
	got = stackManifestWorkflowSteps(json.RawMessage(`{"install":[{"action":"mkdir"}]}`))
	if len(got) != 1 || got[0].Action != "mkdir" {
		t.Fatalf("install fallback, got %+v", got)
	}
	// empty / invalid.
	if got := stackManifestWorkflowSteps(json.RawMessage(`{}`)); len(got) != 0 {
		t.Fatalf("empty manifest, got %+v", got)
	}
	if got := stackManifestWorkflowSteps(json.RawMessage(`not json`)); len(got) != 0 {
		t.Fatalf("invalid manifest, got %+v", got)
	}
}

func TestStackWorkflowShell(t *testing.T) {
	cases := []struct {
		name    string
		step    stackWorkflowStep
		want    []string // fragments the shell must contain
		wantErr string   // fragment the error must contain ("" = success)
	}{
		{name: "shell passthrough", step: stackWorkflowStep{Action: "shell", Command: "echo hi"}, want: []string{"echo hi"}},
		{name: "shell empty", step: stackWorkflowStep{Action: "shell"}, wantErr: "command is required"},
		{name: "download default filename", step: stackWorkflowStep{Action: "download", URL: "https://x.test/a/app.tar.gz"}, want: []string{"curl -fsSL", "https://x.test/a/app.tar.gz", "app.tar.gz"}},
		{name: "download empty url", step: stackWorkflowStep{Action: "download"}, wantErr: "url is required"},
		{name: "download absolute rejected", step: stackWorkflowStep{Action: "download", URL: "https://x.test/a", Filename: "/etc/x"}, wantErr: "relative"},
		{name: "extract zip", step: stackWorkflowStep{Action: "extract", Archive: "a.zip", Dest: "out"}, want: []string{"unzip -o", "a.zip", "out"}},
		{name: "extract tgz", step: stackWorkflowStep{Action: "extract", Archive: "a.tgz"}, want: []string{"tar -xzf"}},
		{name: "extract unsupported", step: stackWorkflowStep{Action: "extract", Archive: "a.rar"}, wantErr: "unsupported archive"},
		{name: "move", step: stackWorkflowStep{Action: "move", From: "a", To: "b/c"}, want: []string{"mv"}},
		{name: "move escape rejected", step: stackWorkflowStep{Action: "move", From: "../a", To: "b"}, wantErr: "workdir"},
		{name: "mkdir", step: stackWorkflowStep{Action: "mkdir", Path: "sub/dir"}, want: []string{"mkdir -p"}},
		{name: "chmod ok", step: stackWorkflowStep{Action: "chmod", Path: "run.sh", Command: "755"}, want: []string{"chmod 755"}},
		{name: "chmod bad mode", step: stackWorkflowStep{Action: "chmod", Path: "run.sh", Command: "999"}, wantErr: "octal"},
		{name: "git branch", step: stackWorkflowStep{Action: "git_clone", URL: "https://x.test/r.git", Dest: "code", Branch: "dev"}, want: []string{"git clone", "--branch", "dev"}},
		{name: "pip", step: stackWorkflowStep{Action: "pip_install", Command: "-r req.txt"}, want: []string{"pip install -r req.txt"}},
		{name: "npm empty", step: stackWorkflowStep{Action: "npm_install"}, want: []string{"npm install"}},
		{name: "http check", step: stackWorkflowStep{Action: "http_check", URL: "http://x.test/h"}, want: []string{"curl -fsS", "http://x.test/h"}},
		{name: "unknown", step: stackWorkflowStep{Action: "teleport"}, wantErr: "unknown action"},
		{name: "empty action", step: stackWorkflowStep{}, wantErr: "action is required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := stackWorkflowShell(tc.step, 1)
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want fragment %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			for _, f := range tc.want {
				if !strings.Contains(got, f) {
					t.Errorf("shell %q missing fragment %q", got, f)
				}
			}
		})
	}
}

func TestStackWorkflowShellWriteRoundTrip(t *testing.T) {
	content := "line1\nline2 with 'quotes' and $vars\n{{token}}"
	cmd, err := stackWorkflowShell(stackWorkflowStep{Action: "write", Path: "sub/note.txt", Content: content}, 1)
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	// The payload rides as single-quoted base64: extract and decode it.
	start := strings.Index(cmd, "printf '%s' '")
	end := strings.LastIndex(cmd, "' | base64 -d")
	if start < 0 || end < 0 || end <= start {
		t.Fatalf("unexpected write shape: %q", cmd)
	}
	raw := cmd[start+len("printf '%s' '") : end]
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(decoded) != content {
		t.Fatalf("round trip mismatch: %q", decoded)
	}
	if !strings.Contains(cmd, "mkdir -p") {
		t.Errorf("write should create parent dirs: %q", cmd)
	}
}

func TestStackOpBuildDefsInstall(t *testing.T) {
	s := &models.Stack{
		ID:       1,
		Manifest: json.RawMessage(`{"installSteps":[{"action":"shell","command":"echo hi"},{"action":"mkdir","path":"data"}]}`),
	}
	defs := stackOpBuildDefs("install", s)
	// Load + Build + Save + Ensure workdir + 2 workflow + Data dir + Verify.
	if len(defs) != 8 {
		names := []string{}
		for _, d := range defs {
			names = append(names, d.name)
		}
		t.Fatalf("want 8 defs, got %d (%v)", len(defs), names)
	}
	if !strings.Contains(defs[4].name, "shell") || !strings.Contains(defs[5].name, "mkdir") {
		t.Errorf("workflow steps mislabeled: %q %q", defs[4].name, defs[5].name)
	}
	empty := stackOpBuildDefs("install", &models.Stack{ID: 1, Manifest: json.RawMessage(`{}`)})
	if len(empty) != 6 {
		t.Errorf("no-workflow install should have 6 defs, got %d", len(empty))
	}
}

func TestStackOpBuildDefsLaunch(t *testing.T) {
	s := &models.Stack{
		ID:       1,
		Manifest: json.RawMessage(`{"launchSteps":[{"action":"shell","command":"echo up"},{"action":"http_check","url":"http://x.test/h"}]}`),
	}
	defs := stackOpBuildDefs("launch", s)
	// Load + Check engine + Check grants + Ensure workdir + 2 workflow +
	// Activate + Verify.
	if len(defs) != 8 {
		names := []string{}
		for _, d := range defs {
			names = append(names, d.name)
		}
		t.Fatalf("want 8 defs, got %d (%v)", len(defs), names)
	}
	if !strings.Contains(defs[4].name, "shell") || !strings.Contains(defs[5].name, "http_check") {
		t.Errorf("workflow steps mislabeled: %q %q", defs[4].name, defs[5].name)
	}
	if defs[6].name != "Activate" || defs[7].name != "Verify" {
		t.Errorf("workflow must run before activate: %q %q", defs[6].name, defs[7].name)
	}
	empty := stackOpBuildDefs("launch", &models.Stack{ID: 1, Manifest: json.RawMessage(`{}`)})
	if len(empty) != 6 {
		t.Errorf("no-workflow launch should have 6 defs, got %d", len(empty))
	}
}

func TestStackOpLaunchPendingGrants(t *testing.T) {
	isolateActivityDB(t)
	db := newStackOpTestDB(t)
	repo := repository.NewStackRepository(db)
	s, err := repo.GetStack(1)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	job := newStackOpTestJob("launch", 1)
	req := httptest.NewRequest("POST", "/api/stacks/1/op/launch", nil)
	runStackOpJob(job, repo, func() {}, s, "launch", req, context.Background(), stackOpBuildDefs("launch", s))

	snap := job.snapshot()
	if snap.Status != stackOpError {
		t.Fatalf("status = %q, want %q (logs: %v)", snap.Status, stackOpError, snap.Logs)
	}
	if !strings.Contains(snap.Error, "1 permission(s) pending") {
		t.Fatalf("error = %q, want pending-grants message", snap.Error)
	}
	// Load + engine pass; grants fails; workdir/workflow/activate/verify
	// never run.
	want := map[string]string{"Load stack": "done", "Check engine": "done", "Check grants": "error", "Ensure workdir": "skipped", "Activate": "skipped", "Verify": "skipped"}
	for _, st := range snap.Steps {
		if want[st.Name] != st.State {
			t.Errorf("step %q = %q, want %q", st.Name, st.State, want[st.Name])
		}
	}
}

func TestStackOpLaunchSuccess(t *testing.T) {
	isolateActivityDB(t)
	db := newStackOpTestDB(t)
	repo := repository.NewStackRepository(db)
	if err := repo.SetGrants(1, []repository.StackGrantDecision{{Capability: "notify", Granted: true}}); err != nil {
		t.Fatalf("SetGrants: %v", err)
	}
	s, err := repo.GetStack(1)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	job := newStackOpTestJob("launch", 1)
	req := httptest.NewRequest("POST", "/api/stacks/1/op/launch", nil)
	runStackOpJob(job, repo, func() {}, s, "launch", req, context.Background(), stackOpBuildDefs("launch", s))

	snap := job.snapshot()
	if snap.Status != stackOpDone {
		t.Fatalf("status = %q, want done (error=%q logs=%v)", snap.Status, snap.Error, snap.Logs)
	}
	fresh, err := repo.GetStack(1)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	if !fresh.Active {
		t.Fatal("stack should be active after launch job")
	}
}

func TestStackOpCancelledBeforeStart(t *testing.T) {
	isolateActivityDB(t)
	db := newStackOpTestDB(t)
	repo := repository.NewStackRepository(db)
	s, err := repo.GetStack(1)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	job := newStackOpTestJob("reinstall", 1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Stop pressed before the first step runs.
	req := httptest.NewRequest("POST", "/api/stacks/1/op/reinstall", nil)
	runStackOpJob(job, repo, func() {}, s, "reinstall", req, ctx, stackOpBuildDefs("reinstall", s))

	snap := job.snapshot()
	if snap.Status != stackOpCancelled {
		t.Fatalf("status = %q, want %q", snap.Status, stackOpCancelled)
	}
	for _, st := range snap.Steps {
		if st.State != "skipped" {
			t.Errorf("step %q = %q, want skipped", st.Name, st.State)
		}
	}
	found := false
	for _, l := range snap.Logs {
		if strings.Contains(l, "stopped by user") {
			found = true
		}
	}
	if !found {
		t.Errorf("logs should note the stop, got %v", snap.Logs)
	}
	// Nothing ran: still inactive, grant still pending.
	fresh, err := repo.GetStack(1)
	if err != nil {
		t.Fatalf("GetStack: %v", err)
	}
	if fresh.Active {
		t.Error("cancelled job must not activate")
	}
	perms, err := repo.ListStackPermissions(1)
	if err != nil {
		t.Fatalf("ListStackPermissions: %v", err)
	}
	if len(perms) != 1 || perms[0].Granted {
		t.Errorf("cancelled job must not touch grants, got %+v", perms)
	}
}
