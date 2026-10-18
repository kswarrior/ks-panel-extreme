package modengine

import "github.com/example/kspanel/internal/models"

// hostops.go — the capability-gated Host Operations layer for Mod Engine v2.
//
// Before this file the sandbox's only host surface was logging + namespaced
// KV storage + event subscription; every capability a mod declared
// (db.*, filesystem, terminal, container.control, vm.control) was approval
// metadata with no runtime binding. This file defines the contract that turns
// those declarations into callable bindings:
//
//   - HostOps is the provider the panel wires in (handlers.NewModHostOps):
//     it executes the actual DB / edge operations. The engine holds no edge
//     or SQL knowledge itself.
//   - hostEnv is the per-activation environment the sandbox consults on EVERY
//     binding call (per-call enforcement — a grant revoked while a mod is
//     active takes effect immediately, no re-activation needed).
//   - ValidateModSQL is the defense-in-depth SQL gate applied to ks.db calls:
//     single statement, no comments, keyword allow-list by direction, and a
//     deny-list for file/escalation primitives (LOAD_FILE, PRAGMA, ATTACH…).
//
// The engine fails CLOSED: a missing grant, missing provider, or validation
// failure returns a structured {ok:false, error} to the script and logs the
// denial into the per-mod diagnostics ring. The raw host is still never
// reachable from JS: everything funnels through these interfaces.

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// FileInfo is one directory entry returned by HostOps.FSList. It mirrors the
// edge page-action FileEntry shape so the provider can map 1:1.
type FileInfo struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"is_dir"`
	ModTime int64  `json:"mod_time,omitempty"`
	Mode    string `json:"mode,omitempty"`
}

// ExecResult is the outcome of running one command inside an instance.
type ExecResult struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

// HostOps is the operation provider the panel injects into the engine. Every
// method is capability-gated by the sandbox BEFORE it is called; providers
// must still validate their own inputs (defense in depth).
type HostOps interface {
	// DBQuery runs a validated read-only statement against the panel DB and
	// returns the rows as JSON-safe maps.
	DBQuery(sql string, args []any) ([]map[string]any, error)
	// DBExec runs a validated INSERT/UPDATE/DELETE and returns rows affected.
	DBExec(sql string, args []any) (int64, error)
	// FSList lists a directory inside an instance (edge page-action
	// list_files).
	FSList(instanceID int64, path string) ([]FileInfo, error)
	// FSRead reads a file inside an instance (edge page-action read_file).
	FSRead(instanceID int64, path string) (string, error)
	// FSWrite writes a file inside an instance (edge page-action write_file).
	FSWrite(instanceID int64, path string, content string) error
	// Exec runs a shell command inside an instance (edge page-action shell).
	// timeoutSec is clamped by the caller to [1, 120]; 0 means provider
	// default.
	Exec(instanceID int64, command string, timeoutSec int) (ExecResult, error)
	// Control performs a lifecycle action (start/stop/kill/status) on an
	// instance through the owning edge.
	Control(instanceID int64, action string) (string, error)
	// ConsoleSend runs a console-style command inside an instance and returns
	// its output (edge page-action shell under the terminal capability).
	ConsoleSend(instanceID int64, command string) (ExecResult, error)
}

// noopHostOps is stored when no provider is wired (stock tests / embedded
// uses). Every call reports an explicit "not available" instead of a nil
// dereference.
type noopHostOps struct{}

func (noopHostOps) DBQuery(string, []any) ([]map[string]any, error) {
	return nil, errors.New("host operations are not wired")
}
func (noopHostOps) DBExec(string, []any) (int64, error) {
	return 0, errors.New("host operations are not wired")
}
func (noopHostOps) FSList(int64, string) ([]FileInfo, error) {
	return nil, errors.New("host operations are not wired")
}
func (noopHostOps) FSRead(int64, string) (string, error) {
	return "", errors.New("host operations are not wired")
}
func (noopHostOps) FSWrite(int64, string, string) error {
	return errors.New("host operations are not wired")
}
func (noopHostOps) Exec(int64, string, int) (ExecResult, error) {
	return ExecResult{}, errors.New("host operations are not wired")
}
func (noopHostOps) Control(int64, string) (string, error) {
	return "", errors.New("host operations are not wired")
}
func (noopHostOps) ConsoleSend(int64, string) (ExecResult, error) {
	return ExecResult{}, errors.New("host operations are not wired")
}

// hostEnv is the immutable per-activation grant snapshot + ops provider the
// sandbox consults on every binding call. Built by the engine from the mod's
// granted rows (fail-closed on load errors: empty sets).
type hostEnv struct {
	slug     string
	caps     map[string]bool
	perms    map[string]bool
	settings []models.ModSettingDefinition
	ops      HostOps
}

func (h *hostEnv) HasCapability(cap string) bool {
	return h != nil && h.caps[cap]
}

// Capabilities returns the sorted granted host capability codes.
func (h *hostEnv) Capabilities() []string {
	if h == nil {
		return nil
	}
	out := make([]string, 0, len(h.caps))
	for c := range h.caps {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}

// HasPermission matches a custom mod permission key. Manifest-declared keys
// are namespaced as "<slug>:<key>" in the grant table; callers may pass either
// the bare key or the fully-qualified code.
func (h *hostEnv) HasPermission(key string) bool {
	if h == nil || key == "" {
		return false
	}
	if h.perms[key] {
		return true
	}
	if h.slug != "" && h.perms[h.slug+":"+key] {
		return true
	}
	return false
}

// Permissions returns the sorted granted custom permission codes.
func (h *hostEnv) Permissions() []string {
	if h == nil {
		return nil
	}
	out := make([]string, 0, len(h.perms))
	for p := range h.perms {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// Settings returns the manifest-declared typed settings schema. Copied by the
// sandbox into its ks.settings binding at Start time.
func (h *hostEnv) Settings() []models.ModSettingDefinition {
	if h == nil {
		return nil
	}
	return h.settings
}

func (h *hostEnv) Ops() HostOps {
	if h == nil {
		return nil
	}
	return h.ops
}

// ---------------------------------------------------------------------------
// SQL guard
// ---------------------------------------------------------------------------

// ErrModSQLRejected wraps every ValidateModSQL rejection so callers can
// distinguish a policy denial from a driver error.
var ErrModSQLRejected = errors.New("mod SQL rejected")

// sqlWordPattern extracts bare words so keyword checks ignore punctuation
// (e.g. `delete(` or `delete;`).
var sqlWordPattern = regexp.MustCompile(`[A-Za-z_][A-Za-z_0-9]*`)

// sqlDeniedAnywhere is the keyword deny-list applied to BOTH directions:
// schema/DDL, transactions/session control, and escalation primitives that
// have no business in a mod query regardless of direction.
var sqlDeniedAnywhere = map[string]bool{
	"PRAGMA": true, "ATTACH": true, "DETACH": true, "VACUUM": true,
	"REINDEX": true, "ANALYZE": true, "GRANT": true, "REVOKE": true,
	"CREATE": true, "ALTER": true, "DROP": true, "TRUNCATE": true,
	"COPY": true, "LOAD_EXTENSION": true, "CALL": true, "DO": true,
	"EXECUTE": true, "PREPARE": true, "DEALLOCATE": true,
	"BEGIN": true, "COMMIT": true, "ROLLBACK": true, "SAVEPOINT": true,
	"RELEASE": true, "OUTFILE": true, "DUMPFILE": true, "XPLOAD": true,
}

// sqlDeniedRead adds write verbs + session/schema probes to the read
// direction. SET is only denied for reads: in writes it is the UPDATE
// assignment keyword (UPDATE t SET …).
var sqlDeniedRead = map[string]bool{
	"INSERT": true, "UPDATE": true, "DELETE": true, "REPLACE": true,
	"MERGE": true, "INTO": true, "UPSERT": true, "SET": true,
}

// sqlDeniedSubstrings catches calls that are only dangerous with an opening
// paren / multi-word primitives the word scanner might split.
var sqlDeniedSubstrings = []string{
	"LOAD_FILE(", "PG_READ_FILE(", "PG_LS_DIR(", "LO_IMPORT(", "LO_EXPORT(",
	"SLEEP(", "BENCHMARK(", "PG_SLEEP(",
}

// ValidateModSQL is the single-statement policy gate for ks.db.query /
// ks.db.exec. readOnly=true requires the statement to begin with SELECT or
// WITH; false requires INSERT/UPDATE/DELETE. Comments, semicolons (statement
// chaining), NUL bytes, and the deny-lists above are rejected. This is
// defense-in-depth: providers still run as the panel DB user and must not
// assume the validator is bulletproof.
func ValidateModSQL(sql string, readOnly bool) error {
	s := strings.TrimSpace(sql)
	if s == "" {
		return fmt.Errorf("%w: empty statement", ErrModSQLRejected)
	}
	if len(s) > 16<<10 {
		return fmt.Errorf("%w: statement too large", ErrModSQLRejected)
	}
	if strings.ContainsRune(s, 0) {
		return fmt.Errorf("%w: NUL byte", ErrModSQLRejected)
	}
	if strings.Contains(s, ";") {
		return fmt.Errorf("%w: multiple statements are not allowed", ErrModSQLRejected)
	}
	if strings.Contains(s, "--") || strings.Contains(s, "/*") || strings.Contains(s, "*/") {
		return fmt.Errorf("%w: SQL comments are not allowed", ErrModSQLRejected)
	}
	lower := strings.ToLower(s)
	for _, bad := range sqlDeniedSubstrings {
		if strings.Contains(lower, strings.ToLower(bad)) {
			return fmt.Errorf("%w: forbidden construct %q", ErrModSQLRejected, bad)
		}
	}

	words := sqlWordPattern.FindAllString(s, -1)
	if len(words) == 0 {
		return fmt.Errorf("%w: no statement keyword", ErrModSQLRejected)
	}
	first := strings.ToUpper(words[0])
	if readOnly {
		if first != "SELECT" && first != "WITH" {
			return fmt.Errorf("%w: read-only statements must start with SELECT or WITH (got %s)", ErrModSQLRejected, first)
		}
	} else {
		switch first {
		case "INSERT", "UPDATE", "DELETE":
		default:
			return fmt.Errorf("%w: write statements must start with INSERT, UPDATE or DELETE (got %s)", ErrModSQLRejected, first)
		}
	}

	for _, w := range words {
		up := strings.ToUpper(w)
		if sqlDeniedAnywhere[up] {
			return fmt.Errorf("%w: keyword %s is not allowed", ErrModSQLRejected, up)
		}
		if readOnly && sqlDeniedRead[up] {
			return fmt.Errorf("%w: keyword %s is not allowed in read-only queries", ErrModSQLRejected, up)
		}
	}
	return nil
}
