package cron

import (
	"testing"
	"time"
)

// Out-of-range values must fail at Parse (fail closed) instead of building
// an unsatisfiable bitmap whose Next() scans 2 years and returns zero —
// zero re-arms scheduler rows into firing every tick.
func TestParseRejectsOutOfRange(t *testing.T) {
	for _, expr := range []string{
		"70 * * * *",     // minute > 59
		"0-100 * * * *",  // minute range exceeds hi
		"5-2 * * * *",    // inverted range
		"* 25 * * *",     // hour > 23
		"* * 0 * *",      // dom < 1
		"* * * 13 *",     // month > 12
		"* * * * 7",      // dow > 6 (use 0/6 for Sunday)
		"*/0 * * * *",    // non-positive step
		"1-59/0 * * * *", // non-positive step in range form
	} {
		if _, err := Parse(expr); err == nil {
			t.Fatalf("Parse(%q) must fail, got nil", expr)
		}
	}
}

func TestParseAcceptsValid(t *testing.T) {
	for _, expr := range []string{
		"* * * * *",
		"*/15 * * * *",
		"0 3 * * *",
		"5-10/2 9-17 1,15 1-6 1-5",
	} {
		s, err := Parse(expr)
		if err != nil {
			t.Fatalf("Parse(%q) failed: %v", expr, err)
		}
		if n := s.Next(time.Now().UTC()); n.IsZero() {
			t.Fatalf("Next(%q) must be non-zero", expr)
		}
	}
}
