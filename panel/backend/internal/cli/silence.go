package cli

import (
	"log"
	"os"
)

// savedLogWriter is the io.Writer the standard logger pointed at before
// we silenced it. Indirected via a package variable so the restore call
// doesn't need to thread the snapshot through every caller.
//
// We only ever flip this once per process (every CLI command calls
// exactly one silenceStandardLog + the matching restoreStandardLog), so
// the package-level state stays trivially correct.
var savedLogWriter interface{ Write(p []byte) (int, error) }

// silenceStandardLog redirects the stdlib log package to /dev/null during
// the optimistic output phases (migrate, seed, etc.) so the per-step
// migration log lines don't pollute the human-readable output.
//
// KSPANEL_LOG=verbose disables the silencing so anyone debugging a
// schema upgrade can see exactly which migration fired.
//
// Pair every call with a deferred restoreStandardLog().
func silenceStandardLog() {
	if savedLogWriter != nil {
		return // already silenced — stay silent until the outermost restore.
	}
	savedLogWriter = log.Writer()
	if os.Getenv("KSPANEL_LOG") == "verbose" {
		return // keep saved writer but redirect to stderr so per-step logs surface
	}
	log.SetOutput(devNull{})
}

// restoreStandardLog flips the stdlib log writer back to whatever it
// pointed at before silenceStandardLog ran. Safe to call multiple times;
// only the first call after a saved restore actually does work — that
// matches the "restore as many times as you silenced" model and keeps
// behavior predictable for nested callers.
func restoreStandardLog() {
	if savedLogWriter == nil {
		return
	}
	log.SetOutput(savedLogWriter)
	savedLogWriter = nil
}

// devNull is an io.Writer that throws away everything written. Used as
// the silent target during the optimistic migration / seed phase.
type devNull struct{}

func (devNull) Write(p []byte) (int, error) { return len(p), nil }
