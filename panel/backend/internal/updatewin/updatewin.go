// Package updatewin holds the shared schedule logic for panel + fleet
// update windows (migration 068): cron validation/arming plus the daily
// maintenance-window guard. Kept in its own package (no DB, no HTTP) so
// the API handlers and the scheduler sweep share one implementation and
// the guard stays unit-testable without a database.
package updatewin

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/cron"
)

// Targets for update_windows rows.
const (
	TargetPanel = "panel"
	TargetFleet = "fleet"
)

// ValidateTarget reports whether target is a known update-windows target.
func ValidateTarget(target string) error {
	switch strings.ToLower(strings.TrimSpace(target)) {
	case TargetPanel, TargetFleet:
		return nil
	default:
		return fmt.Errorf("target must be panel|fleet")
	}
}

// ValidateCron parses a 5-field cron expression with the panel's existing
// validator (the same one automation jobs + backup schedules use).
func ValidateCron(expr string) error {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return fmt.Errorf("cron is required (5-field, e.g. \"0 3 * * *\")")
	}
	if _, err := cron.Parse(expr); err != nil {
		return fmt.Errorf("invalid cron: %w", err)
	}
	return nil
}

// ParseHHMM parses a "HH:MM" 24h wall-clock bound into minutes since
// midnight. Empty string means "unbounded" (ok=false, no error) so an
// empty window side disables that side of the guard.
func ParseHHMM(s string) (mins int, bounded bool, err error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false, nil
	}
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, false, fmt.Errorf("window bound %q must be HH:MM", s)
	}
	h, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || h < 0 || h > 23 {
		return 0, false, fmt.Errorf("window bound %q: hour must be 00..23", s)
	}
	m, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || m < 0 || m > 59 {
		return 0, false, fmt.Errorf("window bound %q: minute must be 00..59", s)
	}
	return h*60 + m, true, nil
}

// ValidateWindow checks one side ("window_start"/"window_end") of the
// maintenance window. Empty = unbounded (always inside on that side).
func ValidateWindow(side, s string) error {
	if _, _, err := ParseHHMM(s); err != nil {
		return fmt.Errorf("%s: %w", side, err)
	}
	return nil
}

// InWindow reports whether now (UTC — the scheduler ticks in UTC) falls
// inside the daily [start, end] maintenance window. Either side empty
// means unbounded on that side (both empty = always inside). Overnight
// ranges wrap: 22:00→06:00 covers 22:00..23:59 + 00:00..06:00. Invalid
// bounds fail CLOSED (false) so a corrupt row can never fire.
func InWindow(now time.Time, start, end string) bool {
	sMins, sBounded, sErr := ParseHHMM(start)
	eMins, eBounded, eErr := ParseHHMM(end)
	if sErr != nil || eErr != nil {
		return false
	}
	if !sBounded && !eBounded {
		return true
	}
	nowMins := now.UTC().Hour()*60 + now.UTC().Minute()
	if sBounded && !eBounded {
		return nowMins >= sMins
	}
	if !sBounded && eBounded {
		return nowMins <= eMins
	}
	if sMins <= eMins {
		return nowMins >= sMins && nowMins <= eMins
	}
	// Overnight wrap.
	return nowMins >= sMins || nowMins <= eMins
}

// NextRun arms next_run_at from a cron expression. Zero time when the
// expression is invalid (the API validates on write, so this only guards
// corrupt rows at sweep time).
func NextRun(cronExpr string, from time.Time) time.Time {
	sched, err := cron.Parse(strings.TrimSpace(cronExpr))
	if err != nil {
		return time.Time{}
	}
	return sched.Next(from)
}
