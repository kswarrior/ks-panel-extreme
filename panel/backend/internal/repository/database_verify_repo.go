package repository

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/db"
)

// Database verify-state keys (settings KV singleton, no migration needed).
// Stored as plain TEXT rows in the existing settings table so the state
// survives restarts on all three engines without a new migration.
const (
	DBVerifyCronKey        = "db_verify_cron"
	DBVerifyLastAtKey      = "db_verify_last_at"
	DBVerifyLastOkKey      = "db_verify_last_ok"
	DBVerifyLastIssuesKey  = "db_verify_last_issues"
	DBVerifyLastWarnsKey   = "db_verify_last_warnings"
	DBVerifyLastEngineKey  = "db_verify_last_engine"
	DBVerifyLastTablesKey  = "db_verify_last_table_count"
	DBVerifyLastDurKey     = "db_verify_last_duration_ms"
	DBVerifyNextRunKey     = "db_verify_next_run"
	DefaultDBVerifyCron    = "0 3 * * *"
	DBVerifyTimeLayout     = time.RFC3339
	DBVerifyNextRunLayout  = "2006-01-02 15:04:05"
)

// DatabaseVerifyState is the persisted last-run status surfaced on the
// Database page (DatabaseInfo verify_* fields) and used by the scheduler
// to decide when the next daily sweep is due.
type DatabaseVerifyState struct {
	CheckedAt   *time.Time
	Ok          *bool
	Issues      []string
	Warnings    []string
	Engine      string
	TableCount  int64
	DurationMs  int64
	Cron        string
	NextRun     *time.Time
}

// placeholderFor returns the bind placeholder for param n on dialect d.
func placeholderFor(d db.Dialect, n int) string {
	if d == nil {
		return "?"
	}
	return d.Placeholder(n)
}

// settingsGet reads one settings key. Missing row => "", nil.
func settingsGet(con *sql.DB, d db.Dialect, key string) (string, error) {
	q := `SELECT value FROM settings WHERE key = ` + placeholderFor(d, 1)
	var v string
	if err := con.QueryRow(q, key).Scan(&v); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return v, nil
}

// settingsSet upserts one settings key via UPDATE-then-INSERT so it works
// on SQLite / Postgres / MySQL (ON CONFLICT / ON DUPLICATE differ per
// engine, so we avoid both).
func settingsSet(con *sql.DB, d db.Dialect, key, value string) error {
	ph1, ph2 := placeholderFor(d, 1), placeholderFor(d, 2)
	res, err := con.Exec(`UPDATE settings SET value = `+ph1+` WHERE key = `+ph2, value, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = con.Exec(`INSERT INTO settings (key, value) VALUES (`+ph1+`, `+ph2+`)`, key, value)
	return err
}

// GetDatabaseVerifyState loads the persisted verify state. Never fails the
// caller on parse errors — corrupt values degrade to zero values so the
// Database page renders "never verified" instead of 500ing.
func GetDatabaseVerifyState(con *sql.DB, d db.Dialect) DatabaseVerifyState {
	st := DatabaseVerifyState{
		Issues:   []string{},
		Warnings: []string{},
		Cron:     DefaultDBVerifyCron,
	}
	if con == nil {
		return st
	}
	if v, err := settingsGet(con, d, DBVerifyCronKey); err == nil && strings.TrimSpace(v) != "" {
		st.Cron = strings.TrimSpace(v)
	}
	if v, err := settingsGet(con, d, DBVerifyLastAtKey); err == nil && strings.TrimSpace(v) != "" {
		for _, layout := range []string{DBVerifyTimeLayout, DBVerifyNextRunLayout, "2006-01-02T15:04:05Z07:00"} {
			if t, perr := time.Parse(layout, strings.TrimSpace(v)); perr == nil {
				utc := t.UTC()
				st.CheckedAt = &utc
				break
			}
		}
	}
	if v, err := settingsGet(con, d, DBVerifyLastOkKey); err == nil && strings.TrimSpace(v) != "" {
		b := strings.TrimSpace(v) == "1" || strings.EqualFold(strings.TrimSpace(v), "true")
		// Distinguish "never verified" (no row) from explicit false: only
		// set Ok when the key exists (v != "").
		st.Ok = &b
	}
	if v, err := settingsGet(con, d, DBVerifyLastIssuesKey); err == nil && strings.TrimSpace(v) != "" {
		var arr []string
		if jerr := json.Unmarshal([]byte(v), &arr); jerr == nil && arr != nil {
			st.Issues = arr
		}
	}
	if v, err := settingsGet(con, d, DBVerifyLastWarnsKey); err == nil && strings.TrimSpace(v) != "" {
		var arr []string
		if jerr := json.Unmarshal([]byte(v), &arr); jerr == nil && arr != nil {
			st.Warnings = arr
		}
	}
	if v, err := settingsGet(con, d, DBVerifyLastEngineKey); err == nil {
		st.Engine = strings.TrimSpace(v)
	}
	if v, err := settingsGet(con, d, DBVerifyLastTablesKey); err == nil && strings.TrimSpace(v) != "" {
		if n, perr := strconv.ParseInt(strings.TrimSpace(v), 10, 64); perr == nil {
			st.TableCount = n
		}
	}
	if v, err := settingsGet(con, d, DBVerifyLastDurKey); err == nil && strings.TrimSpace(v) != "" {
		if n, perr := strconv.ParseInt(strings.TrimSpace(v), 10, 64); perr == nil {
			st.DurationMs = n
		}
	}
	if v, err := settingsGet(con, d, DBVerifyNextRunKey); err == nil && strings.TrimSpace(v) != "" {
		for _, layout := range []string{DBVerifyNextRunLayout, DBVerifyTimeLayout, "2006-01-02T15:04:05Z07:00"} {
			if t, perr := time.Parse(layout, strings.TrimSpace(v)); perr == nil {
				utc := t.UTC()
				st.NextRun = &utc
				break
			}
		}
	}
	return st
}

// SetDatabaseVerifyState persists the last-run result + next-run. Issues /
// warnings are JSON-encoded; empty slices become "[]", never NULL, so the
// Database page always receives an array.
func SetDatabaseVerifyState(con *sql.DB, d db.Dialect, st DatabaseVerifyState) error {
	issuesJSON, _ := json.Marshal(st.Issues)
	if issuesJSON == nil {
		issuesJSON = []byte("[]")
	}
	warnsJSON, _ := json.Marshal(st.Warnings)
	if warnsJSON == nil {
		warnsJSON = []byte("[]")
	}
	checkedStr := ""
	if st.CheckedAt != nil {
		checkedStr = st.CheckedAt.UTC().Format(DBVerifyTimeLayout)
	}
	okStr := ""
	if st.Ok != nil {
		if *st.Ok {
			okStr = "1"
		} else {
			okStr = "0"
		}
	}
	nextStr := ""
	if st.NextRun != nil {
		nextStr = st.NextRun.UTC().Format(DBVerifyNextRunLayout)
	}
	cron := strings.TrimSpace(st.Cron)
	if cron == "" {
		cron = DefaultDBVerifyCron
	}
	pairs := map[string]string{
		DBVerifyCronKey:       cron,
		DBVerifyLastAtKey:     checkedStr,
		DBVerifyLastOkKey:     okStr,
		DBVerifyLastIssuesKey: string(issuesJSON),
		DBVerifyLastWarnsKey:  string(warnsJSON),
		DBVerifyLastEngineKey: strings.TrimSpace(st.Engine),
		DBVerifyLastTablesKey: itoaRepo(st.TableCount),
		DBVerifyLastDurKey:    itoaRepo(st.DurationMs),
		DBVerifyNextRunKey:    nextStr,
	}
	for k, v := range pairs {
		if err := settingsSet(con, d, k, v); err != nil {
			return err
		}
	}
	return nil
}

// SetDatabaseVerifyCron updates only the cron expression + recomputed
// next-run, preserving the last-run result.
func SetDatabaseVerifyCron(con *sql.DB, d db.Dialect, cron string, nextRun time.Time) error {
	if err := settingsSet(con, d, DBVerifyCronKey, strings.TrimSpace(cron)); err != nil {
		return err
	}
	var nextStr string
	if !nextRun.IsZero() {
		nextStr = nextRun.UTC().Format(DBVerifyNextRunLayout)
	}
	return settingsSet(con, d, DBVerifyNextRunKey, nextStr)
}

func itoaRepo(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	pos := len(b)
	for n > 0 {
		pos--
		b[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}
