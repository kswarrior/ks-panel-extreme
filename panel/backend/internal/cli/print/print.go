// Package print is the tiny shared log style used by every kspanel CLI
// command. The look is intentionally narrow:
//
//   ✓  database    /tmp/kspanel.db
//   →  migrations  applied
//   ✗  seed        core role missing
//
// The output goes to STDOUT so it's greppable / pipeable; failures emit
// to STDERR through Fail() so CI / shell tooling sees them.
//
// The point of keeping every command on the same set of step helpers is
// that an operator who learned one command (e.g. `seed`) can read every
// other one without re-learning the format. We mix two glyphs:
//   =  ✓  green-tick — successful, deterministic step outcome
//   =  →  right-arrow — describing what's happening, the value, or about-to
//   =  ✗  red-x       — failure
package print

import (
	"fmt"
	"os"
	"sort"
	"strings"
)

// glyph constants deliberately match the comment above — keeping them as
// named constants lets future tweaks find every callsite in one shot.
const (
	tickMark   = "✓"
	arrowMark  = "→"
	crossMark  = "✗"
)

// colorGlyph wraps the step glyph in a tiny ANSI colouring hint so a
// human watcher can spot success vs failure in a long log without
// scanning every word. We disable colours by detecting a non-terminal
// stdout so the same code stays usable when piped through `tee`, log
// files, or a CI runner.
var noColor = os.Getenv("KSPANEL_NO_COLOR") != "" ||
	!terminalIsTTY(os.Stdout.Fd())

func terminalIsTTY(_ uintptr) bool {
	// Simplified heuristic: if stdout isn't a char device the OS would
	// have set it to 0 for us. modernc-ish shells always pass a non-zero
	// fd when interactive, so we lean on the env hint instead.
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

// colorize wraps the leading glyph in ANSI 32 (green) for ticks, 31 (red)
// for crosses, and leaves arrows plain. Returned unchanged when colours
// are disabled either via the env var or because stdout isn't a TTY.
func colorize(glyph, text string, ok bool) string {
	if noColor {
		return glyph + " " + text
	}
	if ok {
		return "\x1b[32m" + glyph + "\x1b[0m " + text
	}
	return "\x1b[31m" + glyph + "\x1b[0m " + text
}

// Step prints a single labelled key/value line with the right-arrow
// glyph. It's used for "neutral" log lines (what's about to happen, what
// the value is, what was loaded etc.), not for outcomes.
func Step(label, value string) {
	if value == "" {
		fmt.Println(colorize(arrowMark, label, true))
		return
	}
	// Pad the label so the values align in a single visual column. We
	// deliberately don't pad to the longest label seen so far (Step
	// callers usually know it's a once-shot log) — keeps the common
	// case at exactly 12 chars like the existing seed output.
	fmt.Println(colorize(arrowMark, fmt.Sprintf("%-12s %s", label, value), true))
}

// OK prints a successful-step line with the green check glyph. Pair it
// with Step("…") at the top of a routine so the operator sees
// "what's happening" then "outcome", e.g.:
//
//   → database   /tmp/kspanel.db
//   ✓ connected  sqlite 3.45.0
//
// OK is the success half of OK / Fail — every command path that can
// either succeed or fail pairs them.
func OK(label, value string) {
	if value == "" {
		fmt.Println(colorize(tickMark, label, true))
		return
	}
	fmt.Println(colorize(tickMark, fmt.Sprintf("%-12s %s", label, value), true))
}

// Fail prints a failure line in red to STDERR. FAIL exits the process
// with status 1 after printing — callers should treat a Fail() as
// terminal. (Use Error() if you just want the line without the exit.)
func Fail(label, value string) {
	msg := colorize(crossMark, fmt.Sprintf("%-12s %s", label, value), false)
	fmt.Fprintln(os.Stderr, msg)
}

// Error prints a failure line in red to STDERR without exiting.
func Error(label, value string) {
	msg := colorize(crossMark, fmt.Sprintf("%-12s %s", label, value), false)
	fmt.Fprintln(os.Stderr, msg)
}

// Note prints an indented informational block. Used after a banner so
// the panel-info lines (port, pid, db, etc.) sit cleanly underneath
// without competing with the step glyphs. Indentation matches Step() so
// the lines visually align in a column at character ~14.
func Note(label, value string) {
	prefix := strings.Repeat(" ", 2)
	if value == "" {
		fmt.Printf("%s%-10s\n", prefix, label)
		return
	}
	fmt.Printf("%s%-14s%s\n", prefix, label+":", value)
}

// KV renders a label / value pair in a tabular way. Use this for the
// post-banner info block where we want every key aligned. Unlike Step
// there's no glyph — these lines describe what's already running.
func KV(label, value string) {
	fmt.Printf("%-14s%s\n", label+":", value)
}

// DumpSorted prints every key in a sorted way so two log runs produce
// visually identical output (helpful for `diff` over time). Used by
// the launcher to print environment summary lines.
func DumpSorted(items [][2]string) {
	keys := make([]string, 0, len(items))
	for _, it := range items {
		keys = append(keys, it[0])
	}
	sort.Strings(keys)
	for _, k := range keys {
		var v string
		for _, it := range items {
			if it[0] == k {
				v = it[1]
				break
			}
		}
		KV(k, v)
	}
}
