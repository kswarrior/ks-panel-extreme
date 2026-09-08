package repository

import (
	"fmt"
	"strings"
	"time"
)

// parseDBTime parses a DATETIME column read back as text, accepting every
// spelling the fleet has been observed to carry. modernc.org/sqlite v1.39
// returns DATETIME columns as time.Time, which database/sql formats to
// RFC3339Nano ("2026-09-08T19:13:50Z") when scanned into a string — parsing
// only "2006-01-02 15:04:05" silently collapsed every timestamp to the zero
// time (frontend showed "Jan 1, 1"). Trying all known layouts in order keeps
// readers working on SQLite / Postgres / MySQL without touching the schema.
//
// Order (matches template_repo.parseTemplateTime + theme_repo.parseSQLiteTime):
// "2006-01-02 15:04:05", "2006-01-02 15:04:05.999999999",
// "2006-01-02 15:04:05.999999999Z07:00", "2006-01-02 15:04:05Z07:00",
// "2006-01-02 15:04:05 -0700 MST", time.RFC3339Nano, time.RFC3339,
// plus the legacy "T"-separator instance spellings for backward compat.
func parseDBTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty time")
	}
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05.999999999", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05.999999999Z07:00", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05Z07:00", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05 -0700 MST", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	// Legacy instance spellings (pre-shared-helper dbTimeLayouts): ISO "T"
	// separator without a zone, with and without fractional seconds.
	if t, err := time.Parse("2006-01-02T15:04:05", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05.999999999", s); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("unparseable time %q", s)
}
