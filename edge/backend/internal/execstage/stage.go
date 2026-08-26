// Package execstage builds the /bin/sh script both one-shot exec surfaces
// run: it exports the requested environment, stages optional {path,content}
// script files into a fresh temp dir (heredocs — no second round-trip), cds
// into that dir and finally appends the caller's command.
//
// Two consumers share this today:
//   - internal/execrpc   (panel → edge exec INSIDE a workload)
//   - internal/hostexec  (panel → edge exec ON the edge host filesystem)
//
// The staging contract is what application runs rely on: the panel ships
// the app's script files inline with the RPC, so no separate file-manager
// push is needed (that surface is docker-only today) and the target needs
// nothing pre-installed beyond /bin/sh + mktemp.
package execstage

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
)

// Limits enforced by Validate. The panel applies the same bounds; the edge
// re-checks because it is the trust boundary.
const (
	MaxFiles       = 64
	MaxFileBytes   = 1 << 20 // 1 MiB per file
	MaxTotalBytes  = 4 << 20 // 4 MiB combined payload
	maxContentLine = 0       // unused placeholder for future streaming support
)

// File is one staged file. Path must be relative and stay inside the
// staging dir (no "..", no absolute paths, no symlink tricks — we only
// ever join+clean it under the fresh temp dir).
type File struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// Validate rejects oversized, malformed or escaping file sets before any
// shell sees them.
func Validate(files []File) error {
	if len(files) > MaxFiles {
		return fmt.Errorf("too many files (%d, max %d)", len(files), MaxFiles)
	}
	total := 0
	for i, f := range files {
		if strings.TrimSpace(f.Path) == "" {
			return fmt.Errorf("file %d: empty path", i)
		}
		clean := filepath.ToSlash(filepath.Clean(f.Path))
		if filepath.IsAbs(clean) || strings.HasPrefix(clean, "../") || clean == ".." ||
			strings.Contains(clean, "/../") || strings.Contains(clean, "\x00") {
			return fmt.Errorf("file %d: path %q escapes the staging directory", i, f.Path)
		}
		total += len(f.Content)
		if len(f.Content) > MaxFileBytes {
			return fmt.Errorf("file %q exceeds %d bytes", f.Path, MaxFileBytes)
		}
	}
	if total > MaxTotalBytes {
		return fmt.Errorf("combined file payload exceeds %d bytes", MaxTotalBytes)
	}
	return nil
}

// Script renders the full /bin/sh program: env exports, file staging, cd
// into the staging dir, then command. The staging dir is removed when the
// command finishes so repeated runs never fill the disk. Env keys are
// restricted to POSIX identifiers and values are single-quote escaped;
// file contents travel inside quoted heredocs with a per-request marker so
// hostile content can't terminate the block early.
func Script(env map[string]string, files []File, command string) (string, error) {
	if err := Validate(files); err != nil {
		return "", err
	}
	var b strings.Builder

	// Environment exports (identical rules to the original execrpc
	// buildScript: POSIX-name keys, single-quoted values).
	for k, v := range env {
		if !IsEnvName(k) {
			continue
		}
		b.WriteString("export ")
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteByte('\'')
		b.WriteString(strings.ReplaceAll(v, "'", "'\\''"))
		b.WriteString("'\n")
	}

	if len(files) > 0 {
		marker, err := newMarker()
		if err != nil {
			return "", err
		}
		b.WriteString("STAGE=$(mktemp -d 2>/dev/null || printf '/tmp/ksapp-%s' \"$$$(date +%s)\")\n")
		b.WriteString("mkdir -p \"$STAGE\"\n")
		for _, f := range files {
			clean := filepath.ToSlash(filepath.Clean(f.Path))
			if strings.Contains(f.Content, "\n"+marker+"\n") ||
				strings.HasPrefix(f.Content, marker+"\n") ||
				strings.HasSuffix(f.Content, "\n"+marker) ||
				f.Content == marker {
				return "", fmt.Errorf("file %q contains the heredoc terminator", f.Path)
			}
			dir := filepath.ToSlash(filepath.Dir(clean))
			if dir != "." && dir != "" {
				// The staged fragment must sit OUTSIDE the "$STAGE/"
				// expansion: inside double quotes quote()'s single-quote
				// escapes are inert, so a path carrying $, a backtick or
				// '"' would execute as shell substitution when the script
				// runs (inside the workload via execrpc, or on the edge
				// host itself via hostexec). Emitting "$STAGE/" as one
				// word and quote(path) as an adjacent fully single-quoted
				// word keeps the variable expansion and the literal path
				// in separate quoting contexts.
				b.WriteString("mkdir -p \"$STAGE/\"" + quote(dir) + "\n")
			}
			b.WriteString("cat > \"$STAGE/\"" + quote(clean) + " <<'" + marker + "'\n")
			b.WriteString(f.Content)
			b.WriteString("\n" + marker + "\n")
		}
		// The EXIT trap guarantees the staging dir is removed no matter how
		// the command ends (success, non-zero exit, or an early `exit` from
		// inside the command) so repeated runs never fill the disk.
		b.WriteString("trap 'rc=$?; cd /; rm -rf \"$STAGE\"; exit $rc' EXIT\n")
		b.WriteString("cd \"$STAGE\" || exit 1\n")
		b.WriteString(command + "\n")
	} else {
		b.WriteString(command)
	}
	return b.String(), nil
}

// quote renders s as a fully single-quoted POSIX shell word ('…'), with
// embedded single quotes escaped the standard way ('\''-style), so EVERY
// metacharacter ($, backtick, ", \, spaces) stays literal when the script
// runs. Callers concatenate it AFTER the separately-double-quoted "$STAGE/"
// prefix — keeping variable expansion and the literal path in separate
// quoting contexts is what stops a hostile staged path from executing as
// shell substitution inside the workload (execrpc) or on the edge host
// itself (hostexec).
func quote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// newMarker returns an unpredictable heredoc terminator so file content can
// never collide with it without carrying the exact random value.
func newMarker() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate heredoc marker: %w", err)
	}
	return "KSEDGE_EOF_" + hex.EncodeToString(buf), nil
}

// IsEnvName reports whether s is a valid POSIX env-var identifier (leading
// underscore-or-letter, then letters/digits/underscores).
func IsEnvName(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' {
			continue
		}
		if r < 'A' || (r > 'Z' && r < 'a') || r > 'z' {
			if r < '0' || r > '9' || i == 0 {
				return false
			}
		}
	}
	return true
}
