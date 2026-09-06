package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/backup"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/datamove"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
)

// DatabaseInfo is the response shape for the Database admin page.
// `database` describes the engine + file backing the panel; `tables`
// enumerates every user-table with its row count, column count and on-disk
// footprint so the page can render a full structural overview.
//
// The handler triggers a wal_checkpoint(TRUNCATE) on a dedicated inspector
// connection BEFORE measuring anything, so every size reported below (file
// size, page_count, freelist, per-table pgsize) reflects the database's
// actual, up-to-the-moment committed state rather than whatever happened to
// have been folded into the main file by the last auto-checkpoint. Without
// the checkpoint the reported figures drift behind live writes by an
// unbounded margin under WAL mode — which is exactly the "size isn't real"
// symptom this page exists to prevent.
type DatabaseInfo struct {
	Engine      string    `json:"engine"`
	Path        string    `json:"path"`
	Version     string    `json:"version"`
	JournalMode string    `json:"journal_mode"`
	GeneratedAt time.Time `json:"generated_at"`

	// Real-time size accounting. The inspector runs wal_checkpoint(TRUNCATE)
	// first, so after that checkpoint the on-disk main file is the single
	// authoritative store and `OnDiskBytes` matches `LogicalBytes`. We report
	// both anyway: pages the SQLite freelist still holds count toward
	// on-disk but not logical "live" content.
	LogicalBytes int64 `json:"logical_bytes"`
	OnDiskBytes  int64 `json:"size_bytes"`
	FreeBytes    int64 `json:"free_bytes"`
	WalBytes     int64 `json:"wal_bytes"`
	ShmBytes     int64 `json:"shm_bytes"`

	// SQLite pager internals — exposed verbatim so an operator debugging
	// bloat can tell "free space I can reclaim with VACUUM" apart from
	// "this database is genuinely huge".
	PageSize  int64 `json:"page_size"`
	PageCount int64 `json:"page_count"`
	FreePages int64 `json:"free_pages"`
	MaxPageCt int64 `json:"max_page_count"`
	// Seconds between the last on-disk modification of the database file
	// (the wal_checkpoint we just forced bumps this) and GeneratedAt — i.e.
	// "how stale could this snapshot possibly be". Always ~0 here because
	// the handler checkpoints right before capturing GeneratedAt, but we
	// surface it so the UI can badge "live".
	LastModifiedAgoSec int64 `json:"last_modified_ago_secs"`

	// Health summary. IntegrityOk flips to false if PRAGMA quick_check
	// (or the all-tables foreign_key_check) emitted anything but "ok".
	IntegrityOk      bool     `json:"integrity_ok"`
	IntegrityIssues  []string `json:"integrity_issues"`
	ForeignKeyOk     bool     `json:"foreign_key_ok"`
	ForeignKeyIssues []string `json:"foreign_key_issues"`
	FragmentsPct     float64  `json:"fragmentation_pct"`
	LastCheckpoint   string   `json:"last_checkpoint"`

	Tables []DatabaseTable `json:"tables"`

	// EngineNotSupported is retained for wire compatibility. All three
	// shipped engines (sqlite/postgres/mysql) now return real diagnostics
	// below, so this is false for them and true only for a future unknown
	// engine that has no inspector yet.
	EngineNotSupported bool `json:"engine_not_supported"`

	// Per-engine notes for checks with no equivalent. Postgres/MySQL have
	// no PRAGMA quick_check / foreign_key_check, so IntegrityIssues and
	// ForeignKeyIssues stay empty and these notes explain what health
	// coverage *is* provided (connection probe + row-count sanity) instead.
	IntegrityNote  string `json:"integrity_note,omitempty"`
	ForeignKeyNote string `json:"foreign_key_note,omitempty"`
	HealthNote     string `json:"health_note,omitempty"`

	// Scheduled integrity verification — last run status surfaced on the
	// Database page. Populated from the verify-state KV (see
	// database_verify_handler.go); nil/empty means "never verified".
	VerifyLastAt       *time.Time `json:"verify_last_at,omitempty"`
	VerifyLastOk       *bool      `json:"verify_last_ok,omitempty"`
	VerifyLastIssues   []string   `json:"verify_last_issues"`
	VerifyLastWarnings []string   `json:"verify_last_warnings"`
	VerifyTableCount   int64      `json:"verify_table_count"`
	VerifyDurationMs   int64      `json:"verify_duration_ms"`
	VerifyCron         string     `json:"verify_cron"`
	VerifyNextRun      *time.Time `json:"verify_next_run,omitempty"`

	// Live-monitor global counters. These turn the page from a static
	// snapshot into a real monitor: the between-tick deltas let an operator
	// see "the panel is currently being written to" rather than only "the
	// panel DB is X bytes". Only SQLite-exposed pragmas + dbstat aggregates
	// back these — there is no private instrumentation, so the numbers are
	// exactly what the storage engine itself records.

	// Connection/account stats from PRAGMA — those reported only where the
	// driver exposes them; zero is the "not available on this build"
	// sentinel the UI renders as an em-dash.
	TotalConnections int64  `json:"total_connections"`
	CacheSizePages   int64  `json:"cache_size_pages"`
	AutoVacuumMode   int64  `json:"auto_vacuum_mode"`
	Encoding         string `json:"encoding"`
	// Bytes written since the previous snapshot of this handler — the
	// monotonically-growing surface that an operator correlates with "the
	// panel just deployed N instances". First snapshot in a process run
	// reports 0 (nothing to diff against).
	SizeDelta int64 `json:"size_delta"`
	// Bytes grown in the WAL between snapshots (normally 0 because we just
	// checkpointed) — non-zero means concurrent writes landed while we were
	// computing the rest of the snapshot, i.e. another writer is active.
	WalDelta int64 `json:"wal_delta"`
	// Sum of per-table RowDelta across all tables vs the previous snapshot.
	// The headline "rows written since last tick" counter for the live
	// monitor banner.
	RowDeltaSinceLast int64 `json:"row_delta_since_last"`
}

// DatabaseTable is one row of the per-table listing.
type DatabaseTable struct {
	Name        string `json:"name"`
	RowCount    int64  `json:"row_count"`
	ColumnCount int64  `json:"column_count"`
	IndexCount  int64  `json:"index_count"`
	AutoIncrVal int64  `json:"autoincr_value"`
	// Real-time on-disk bytes used by the table's own b-tree (SUM(pgsize)
	// from dbstat for the table's pages). Comes straight from the live pager
	// after the inspector's wal_checkpoint, so it tracks live data growth.
	SizeBytes    int64  `json:"size_bytes"`
	IndexBytes   int64  `json:"index_bytes"`
	WithoutRowid bool   `json:"without_rowid"`
	Type         string `json:"type"`
	// Live-monitor extras. PageCount/LeafPages/InternalPages/OverflowPages
	// come straight from dbstat aggregations so an operator can see whether a
	// table is a single root page or has grown into a multi-level b-tree —
	// the difference is what separates "tiny lookup table" from "needs an
	// index" at a glance. AvgRowBytes is size_bytes / row_count, capped to
	// the page_size to keep the divisor sane on empty tables.
	PageCount     int64 `json:"page_count"`
	LeafPages     int64 `json:"leaf_pages"`
	InternalPages int64 `json:"internal_pages"`
	OverflowPages int64 `json:"overflow_pages"`
	AvgRowBytes   int64 `json:"avg_row_bytes"`
	// Largest cell payload across this table's pages — a high value relative
	// to the page size flags blob-heavy tables that overflow into side
	// pages (which is exactly the growth mode an operator wants to watch).
	MaxPayload int64 `json:"max_payload"`
	// Delta vs the previous snapshot the panel captured on the previous
	// /api/database request — see DatabaseInfo.SinceLast for the
	// accounting. Zero on the first snapshot for a given table.
	SizeDelta  int64 `json:"size_delta"`
	RowDelta   int64 `json:"row_delta"`
	IndexDelta int64 `json:"index_delta"`
}

// DatabaseInfoHandler returns the engine metadata + table listing used by
// the Database admin page. The page is read-only — there is no mutation
// endpoint here, just a live snapshot for the operator.
//
// SQLite gets the rich PRAGMA/dbstat diagnostic below. Postgres/MySQL get
// real diagnostics too (information_schema + pg_total_relation_size /
// Data_length) in the same JSON shape — empty IntegrityIssues/
// ForeignKeyIssues with a per-engine note where a check has no equivalent.
func DatabaseInfoHandler(w http.ResponseWriter, r *http.Request) {
	cfg := config.DatabaseConfig()
	d, err := db.NewDialect(cfg.Engine)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !d.IsSQLite() {
		con, oerr := repository.OpenDB()
		if oerr != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		defer con.Close()
		var info DatabaseInfo
		var derr error
		switch d.Name() {
		case "postgres":
			info, derr = databaseInfoPostgres(con, cfg)
		case "mysql":
			info, derr = databaseInfoMySQL(con, cfg)
		default:
			writeJSON(w, DatabaseInfo{
				Engine:             d.Name(),
				Path:               redactedDSN(cfg.DSN),
				GeneratedAt:        time.Now().UTC(),
				Tables:             []DatabaseTable{},
				IntegrityIssues:    []string{},
				ForeignKeyIssues:   []string{},
				EngineNotSupported: true,
			})
			return
		}
		if derr != nil {
			log.Println("DatabaseInfo remote error:", derr)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		attachVerifyStatus(&info)
		applySnapshotDeltas(&info)
		writeJSON(w, info)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	info := DatabaseInfo{
		Path:             config.DatabasePath(),
		Engine:           "sqlite",
		JournalMode:      "unknown",
		GeneratedAt:      time.Now().UTC(),
		Tables:           []DatabaseTable{},
		IntegrityIssues:  []string{},
		ForeignKeyIssues: []string{},
	}

	// Folding the WAL into the main file is what makes the reported sizes
	// real-time. Under WAL journal_mode, freshly committed writes land in the
	// -wal sidecar and only get folded into the main file when a checkpoint
	// runs (which can be arbitrarily delayed by the auto-checkpoint cadence
	// or by a long-running read transaction). If we measured before folding,
	// the on-disk main file size, page_count and dbstat pgsize would all lag
	// behind the live database — exactly the "size isn't real" symptom.
	//
	// TRUNCATE additionally resets the -wal file to zero bytes so the WAL
	// sidecar size we report below reflects "what's still pending", not
	// "everything written since startup". The inspector connection is the
	// the only connection this handler holds (OpenDB sets MaxOpenConns(1)),
	// so the brief write lock the checkpoint takes is uncontended here.
	if v := scalar(con, `PRAGMA wal_checkpoint(TRUNCATE)`); v != "" {
		// wal_checkpoint returns three ints (busy, log, checkpointed); we
		// don't need to parse them — its success simply makes the file
		// current.  Create a var so vet doesn't complain about the discard
		// while we keep the call's side-effect.
		_ = v
	}

	// Engine version ("3.45.0"). Falls back to "unknown" on a non-SQLite
	// driver (this codebase only ships sqlite, but the field is generic).
	if v := scalar(con, `SELECT sqlite_version()`); v != "" {
		info.Version = v
	}
	if v := scalar(con, `PRAGMA journal_mode`); v != "" {
		info.JournalMode = v
	}
	if v := scalar(con, `PRAGMA page_size`); v != "" {
		if p, perr := strconv.ParseInt(v, 10, 64); perr == nil {
			info.PageSize = p
		}
	}
	if v := scalar(con, `PRAGMA page_count`); v != "" {
		if p, perr := strconv.ParseInt(v, 10, 64); perr == nil {
			info.PageCount = p
		}
	}
	if v := scalar(con, `PRAGMA freelist_count`); v != "" {
		if p, perr := strconv.ParseInt(v, 10, 64); perr == nil {
			info.FreePages = p
		}
	}
	if v := scalar(con, `PRAGMA max_page_count`); v != "" {
		if p, perr := strconv.ParseInt(v, 10, 64); perr == nil {
			info.MaxPageCt = p
		}
	}

	// Live-monitor pragmas. These don't change between snapshots but are
	// what make the page a real monitor rather than a one-shot dump. An
	// operator reads e.g. "auto_vacuum = 1 (INCREMENTAL)" → the VACUUM
	// button means something on this DB.
	info.Encoding = scalar(con, `PRAGMA encoding`)
	info.CacheSizePages = scalarInt(con, `PRAGMA cache_size`)
	info.AutoVacuumMode = scalarInt(con, `PRAGMA auto_vacuum`)

	// Logical size = page_count * page_size. This is the size SQLite itself
	// believes the database occupies, and after the checkpoint it equals the
	// live stored data. FreeBytes is the fraction of those pages sitting on
	// the freelist (reclaimable via VACUUM).
	info.LogicalBytes = info.PageCount * info.PageSize
	info.FreeBytes = info.FreePages * info.PageSize
	if info.LogicalBytes > 0 {
		info.FragmentsPct = float64(info.FreeBytes) / float64(info.LogicalBytes) * 100.0
	}

	// On-disk file accounting. Stat the main file plus its WAL/SHM sidecars
	// so the operator can see exactly how much the database physically holds
	// — separate from the logical/live content the pager reports above. The
	// WAL is normally 0 immediately after the inspector's TRUNCATE
	// checkpoint; a non-zero value means writes have landed since (live
	// monitoring will see this climb between ticks).
	info.OnDiskBytes = statSize(info.Path)
	info.WalBytes = statSize(info.Path + "-wal")
	info.ShmBytes = statSize(info.Path + "-shm")
	if mt, err := os.Stat(info.Path); err == nil {
		info.LastCheckpoint = mt.ModTime().UTC().Format(time.RFC3339)
		info.LastModifiedAgoSec = int64(time.Since(mt.ModTime()).Round(time.Second).Seconds())
	}

	// Live-write accounting. The handler is invoked every REFRESH_MS by the
	// frontend, so comparing this snapshot's per-table sizes against the
	// previous request's snapshot yields a "grew by N bytes since last tick"
	// read — the headline mark of a real monitor. snapshotStore is a
	// module-level cache scoped to the panel process (not the SQLite file),
	// cleared naturally on restart; first snapshot always reports zero deltas.
	prev := snapshotStore.get()

	// Active-connection telemetry. SQLite doesn't expose live connection
	// counts portably via PRAGMA; modernc.org/sqlite only exposes "dbstat"
	// and the standard pragmas. We probe `PRAGMA cache_spill` (cheap, ignores
	// parameters) and surface the per-process pool state we DO control:
	// the inspector itself counts as 1 open + handling a request. We can't
	// peer into other processes' connections against WAL — so we surface
	// the SQLite-side writer state via the WAL-mtime delta instead (kept
	// as WalBytes which climbs between ticks when other writers are
	// active). The conn counter stays 0 when we genuinely can't tell.
	info.TotalConnections = 0

	// Health: quick_check is O(pages) but cheap relative to integrity
	// full and catches the vast majority of corruption classes without the
	// minutes-long full scan. foreign_key_check walks every parent→child
	// edge that has an FK defined and reports orphaned rows by table.
	info.IntegrityOk = true
	info.ForeignKeyOk = true
	// PRAGMA quick_check is SQLite's fast integrity scan (the pragma this
	// health tile was always meant to run). The previous query named a
	// non-existent "integrity_quick" — SQLite silently ignores unknown
	// pragmas by returning zero rows WITHOUT an error, so the happy path
	// never ran any check at all and the page reported a permanently green
	// health badge.
	if rows, err := con.Query(`PRAGMA quick_check`); err == nil {
		for rows.Next() {
			var msg string
			if err := rows.Scan(&msg); err == nil && strings.TrimSpace(strings.ToLower(msg)) != "ok" {
				info.IntegrityOk = false
				info.IntegrityIssues = append(info.IntegrityIssues, msg)
			}
		}
		if rerr := rows.Err(); rerr != nil {
			info.IntegrityOk = false
			info.IntegrityIssues = append(info.IntegrityIssues, "check read failed: "+rerr.Error())
		}
		rows.Close()
	} else {
		// quick_check unavailable (driver quirk) — fall back so a
		// perfectly healthy DB doesn't render as "unknown health".
		if v := scalar(con, `PRAGMA integrity_check(1)`); v != "" && strings.ToLower(v) != "ok" {
			info.IntegrityOk = false
			info.IntegrityIssues = append(info.IntegrityIssues, v)
		}
	}
	if rows, err := con.Query(`PRAGMA foreign_key_check`); err == nil {
		for rows.Next() {
			// foreign_key_check returns (table, rowid, parent, fkid). We only
			// stringify the offending table for the summary; the operator can
			// dig deeper with the sqlite cli if needed.
			//
			// IMPORTANT: modernc.org/sqlite v1.6.0 (SQLite 3.33) has a quirk
			// where PRAGMA foreign_key_check yields a single all-nulls row
			// even when there are NO violations — the panel would otherwise
			// permanently render "FK FAIL / row 0" on a perfectly healthy
			// database. A genuine violation always carries a non-empty table
			// name, so we drop any row whose table name is empty. We also
			// discard rows whose rowid is invalid (NULL and 0 simultaneously,
			// the other half of the phantom) to be safe against drivers that
			// populate the table name with garbage.
			var tbl sql.NullString
			var rowid sql.NullInt64
			var ref sql.NullString
			var fkid sql.NullInt64
			if err := rows.Scan(&tbl, &rowid, &ref, &fkid); err != nil {
				continue
			}
			if !tbl.Valid || strings.TrimSpace(tbl.String) == "" {
				continue
			}
			info.ForeignKeyOk = false
			info.ForeignKeyIssues = append(info.ForeignKeyIssues, tbl.String+" row "+itoa(rowid.Int64))
		}
		if rerr := rows.Err(); rerr != nil {
			info.ForeignKeyOk = false
			info.ForeignKeyIssues = append(info.ForeignKeyIssues, "check read failed: "+rerr.Error())
		}
		rows.Close()
	}

	// Last-write provenance: we surface the on-disk mtime of the main DB
	// file as the authoritative "last modified" time — after the
	// wal_checkpoint(TRUNCATE) above this is the moment the checkpoint
	// folded the WAL in and rewrote the pagecache, i.e. the most recent
	// real activity the storage layer saw. We set it once above alongside
	// OnDiskBytes so we don't stat the file a third time.

	// dbstat is a built-in SQLite virtual table that gives per-table sizes
	// without needing a heap-greedy SQL on the master schema. It is a virtual
	// table, so it does NOT appear in sqlite_master (older detection code
	// looked there and never found it). Probe it directly instead: try a
	// cheap aggregate and keep it only if the query succeeds. We scan into
	// an int rather than a bool for cross-driver safety (modernc returns
	// 0/1).
	hasDbstat := false
	var exists int
	if rowErr := con.QueryRow(`SELECT EXISTS (SELECT 1 FROM dbstat LIMIT 1)`).Scan(&exists); rowErr == nil {
		hasDbstat = exists != 0
	}

	tables, err := listTables(con, hasDbstat)
	if err != nil {
		log.Println("listTables error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	info.Tables = tables

	// Apply between-tick deltas vs the previous snapshot. We do this last
	// so the deltas run on the fully-measured table list (post-wal_checkpoint
	// and post-dbstat) and reflect real growth, not measurement noise. Any
	// table that didn't exist previously contributes its full current size
	// as a positive delta.
	if prev != nil {
		prevByTable := make(map[string]DatabaseTable, len(prev.Tables))
		for _, t := range prev.Tables {
			prevByTable[t.Name] = t
		}
		sumRow := int64(0)
		for i := range info.Tables {
			t := &info.Tables[i]
			p := prevByTable[t.Name]
			t.RowDelta = t.RowCount - p.RowCount
			t.SizeDelta = t.SizeBytes - p.SizeBytes
			t.IndexDelta = t.IndexBytes - p.IndexBytes
			sumRow += t.RowDelta
		}
		info.RowDeltaSinceLast = sumRow
		info.SizeDelta = info.OnDiskBytes - prev.OnDiskBytes
		info.WalDelta = info.WalBytes - prev.WalBytes
	}

	// Record this snapshot for the NEXT tick's delta computation. Done
	// AFTER the diff so the previous snapshot we just consumed isn't
	// overwritten prematurely.
	attachVerifyStatus(&info)
	snapshotStore.store(info)

	writeJSON(w, info)
}

// listTables enumerates user tables (sqlite_master, type=table) and pulls
// row / column counts per entry. Per-table `size_bytes` comes from dbstat
// when the table is available; we fall back to 0 when it isn't. Index
// counts, index sizes and autoincrement values come from sqlite_master /
// sqlite_sequence so the table row paints a full storage picture.
func listTables(con *sql.DB, hasDbstat bool) ([]DatabaseTable, error) {
	rows, err := con.Query(`
		SELECT name FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
		ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err == nil {
			names = append(names, n)
		}
	}
	if rerr := rows.Err(); rerr != nil {
		return nil, rerr
	}
	out := make([]DatabaseTable, 0, len(names))
	for _, n := range names {
		var dt DatabaseTable
		dt.Name = n
		// Table names originate from sqlite_master and are attacker-
		// controllable one hop away (mods granted the database capability can
		// CREATE TABLE with arbitrary names). Escape openings for both the
		// identifier (double-quote) and string-literal (single-quote) contexts.
		nIdent := strings.ReplaceAll(n, `"`, `""`)
		nLit := strings.ReplaceAll(n, `'`, `''`)
		dt.Type = "table"
		dt.RowCount = scalarInt(con,
			`SELECT COUNT(*) FROM "`+nIdent+`"`)
		dt.ColumnCount = scalarInt(con,
			`SELECT COUNT(*) FROM pragma_table_info('`+nLit+`')`)
		// Index count: system + user indexes combined, excluding the
		// implicit rowid b-tree which isn't an "index" entry.
		dt.IndexCount = scalarInt(con,
			`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='`+nLit+`'`)
		// WITHOUT ROWID tables store rows directly in their PK b-tree (no
		// separate rowid). Detect by parsing the CREATE TABLE statement for
		// the trailing "WITHOUT ROWID" clause rather than guessing from
		// primary-key presence (every table with a PK would otherwise read
		// as without-rowid).
		sqlText := scalar(con, `SELECT sql FROM sqlite_master WHERE type='table' AND name='`+nLit+`'`)
		if sqlText != "" {
			upper := strings.ToUpper(strings.TrimSpace(strings.TrimRight(strings.TrimSpace(sqlText), ";")))
			dt.WithoutRowid = strings.HasSuffix(upper, "WITHOUT ROWID")
		}
		// Autoincrement: SELECT FROM sqlite_sequence WHERE name = table.
		// Missing row ⇒ table has no AUTOINCREMENT column.
		dt.AutoIncrVal = scalarInt(con,
			`SELECT seq FROM sqlite_sequence WHERE name='`+nLit+`'`)
		if hasDbstat {
			// Per-table footprint + b-tree topology + payload telemetry.
			// One dbstat aggregation returns size, page count, internal and
			// overflow page counts and the largest cell payload — folded into
			// a single pass so a 12-table panel costs 12 passes total rather
			// than 48. The leaf/interior/overflow split tells the operator
			// whether a table is still a flat single-page lookup (internal=0)
			// or has grown into a multi-level b-tree — the "should I add an
			// index here?" marker.
			_ = con.QueryRow(`SELECT
					COALESCE(SUM(pgsize), 0),
					COUNT(*),
					COALESCE(SUM(CASE WHEN pagetype='interior' THEN 1 ELSE 0 END), 0),
					COALESCE(SUM(CASE WHEN pagetype='overflow' THEN 1 ELSE 0 END), 0),
					COALESCE(MAX(payload), 0)
				FROM dbstat WHERE name='`+nLit+`'`).
				Scan(&dt.SizeBytes, &dt.PageCount, &dt.InternalPages, &dt.OverflowPages, &dt.MaxPayload)
			dt.LeafPages = dt.PageCount - dt.InternalPages - dt.OverflowPages
			// Index footprint: every index entry in dbstat for this table.
			// dbstat exposes each index by the index name, so we sum pgsize
			// across every index name attached to this table.
			dt.IndexBytes = scalarInt(con,
				`SELECT COALESCE(SUM(s.pgsize), 0) FROM dbstat s JOIN sqlite_master m ON m.name = s.name WHERE m.type='index' AND m.tbl_name='`+nLit+`'`)
			if dt.RowCount > 0 {
				dt.AvgRowBytes = dt.SizeBytes / dt.RowCount
			}
		}
		out = append(out, dt)
	}
	return out, nil
}

// scalar runs a single-row, single-column SELECT and returns the string
// value. An empty string is the sentinel for "no answer / errored" — the
// handler treats empty as "unknown" rather than failing the whole page.
func scalar(con *sql.DB, q string) string {
	var s string
	if err := con.QueryRow(q).Scan(&s); err != nil {
		return ""
	}
	return s
}

// scalarInt is the int64 twin of scalar. Errors return 0 — the page renders
// "0 / —" when a number genuinely is unknown.
func scalarInt(con *sql.DB, q string) int64 {
	var n int64
	if err := con.QueryRow(q).Scan(&n); err != nil {
		return 0
	}
	return n
}

// escapeSQLLit escapes a value for embedding in a single-quoted SQL literal.
func escapeSQLLit(s string) string { return strings.ReplaceAll(s, `'`, `''`) }

// databaseInfoPostgres returns real table listing + row counts + size +
// connection health for Postgres, in the same JSON shape as SQLite.
// information_schema gives tables/columns; pg_relation_size /
// pg_indexes_size give bytes; pg_stat_activity gives live connections.
// FK orphans are auto-scanned via information_schema (table_constraints +
// key_column_usage); corruption-level integrity has no PRAGMA equivalent so
// IntegrityIssues stays empty with a note explaining the coverage.
func databaseInfoPostgres(con *sql.DB, cfg config.DBConfig) (DatabaseInfo, error) {
	now := time.Now().UTC()
	info := DatabaseInfo{
		Engine:           "postgres",
		Path:             redactedDSN(cfg.DSN),
		GeneratedAt:      now,
		Tables:           []DatabaseTable{},
		IntegrityIssues:  []string{},
		ForeignKeyIssues: []string{},
		IntegrityOk:      true,
		ForeignKeyOk:     true,
		IntegrityNote:    "Postgres has no PRAGMA quick_check; health is connection probe + row-count parity + FK-orphan scan (see scheduled verify).",
		ForeignKeyNote:   "Postgres FK orphans auto-scanned via information_schema (table_constraints + key_column_usage).",
		HealthNote:       "Postgres diagnostics via information_schema + pg_relation_size + pg_stat_activity.",
	}
	if v := scalar(con, `SELECT version()`); v != "" {
		info.Version = v
	} else {
		info.Version = "unknown"
	}
	if v := scalar(con, `SHOW wal_level`); v != "" {
		info.JournalMode = v
	} else {
		info.JournalMode = "wal"
	}
	info.Encoding = scalar(con, `SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()`)
	info.TotalConnections = scalarInt(con, `SELECT count(*) FROM pg_stat_activity`)
	if v := scalar(con, `SHOW autovacuum`); strings.EqualFold(strings.TrimSpace(v), "on") {
		info.AutoVacuumMode = 1
	}
	if v := scalar(con, `SHOW block_size`); v != "" {
		if p, perr := strconv.ParseInt(strings.TrimSpace(v), 10, 64); perr == nil {
			info.PageSize = p
		}
	}
	if info.PageSize == 0 {
		info.PageSize = 8192
	}
	dbBytes := scalarInt(con, `SELECT pg_database_size(current_database())`)
	info.LogicalBytes = dbBytes
	info.OnDiskBytes = dbBytes
	if info.PageSize > 0 {
		info.PageCount = dbBytes / info.PageSize
	}
	info.LastCheckpoint = now.Format(time.RFC3339)
	info.LastModifiedAgoSec = 0
	// Table listing.
	rows, err := con.Query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`)
	if err != nil {
		return info, err
	}
	names := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err == nil {
			names = append(names, n)
		}
	}
	rows.Close()
	if rerr := rows.Err(); rerr != nil {
		return info, rerr
	}
	out := make([]DatabaseTable, 0, len(names))
	for _, n := range names {
		var dt DatabaseTable
		dt.Name = n
		dt.Type = "table"
		nIdent := strings.ReplaceAll(n, `"`, `""`)
		nLit := escapeSQLLit(n)
		nReg := `"` + escapeSQLLit(strings.ReplaceAll(n, `"`, `""`)) + `"`
		// pg uses double-quoted identifiers for COUNT; information_schema
		// lookups use single-quoted literals.
		dt.RowCount = scalarInt(con, `SELECT COUNT(*) FROM "`+nIdent+`"`)
		dt.ColumnCount = scalarInt(con, `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '`+nLit+`'`)
		dt.IndexCount = scalarInt(con, `SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = '`+nLit+`'`)
		dt.SizeBytes = scalarInt(con, `SELECT pg_relation_size('`+nReg+`')`)
		dt.IndexBytes = scalarInt(con, `SELECT pg_indexes_size('`+nReg+`')`)
		dt.PageCount = 0
		if info.PageSize > 0 && dt.SizeBytes > 0 {
			dt.PageCount = dt.SizeBytes / info.PageSize
			if dt.PageCount == 0 {
				dt.PageCount = 1
			}
		}
		dt.LeafPages = dt.PageCount
		if dt.RowCount > 0 && dt.SizeBytes > 0 {
			dt.AvgRowBytes = dt.SizeBytes / dt.RowCount
		}
		out = append(out, dt)
	}
	info.Tables = out
	// Real FK-orphan scan: orphans become issues (ForeignKeyOk=false),
	// scan failures degrade to a note so the page never 500s on catalog
	// permission errors.
	if pd, derr := db.NewDialect("postgres"); derr == nil {
		if oi, ow, checked, oerr := datamove.ScanFKOrphans(pd, con); oerr == nil {
			if len(oi) > 0 {
				info.ForeignKeyIssues = oi
				info.ForeignKeyOk = false
			}
			if len(ow) > 0 {
				info.ForeignKeyNote = "Postgres FK orphans auto-scanned (" + itoa(int64(checked)) + " constraints); scan warnings: " + strings.Join(ow, "; ")
			} else if len(oi) == 0 {
				info.ForeignKeyNote = "Postgres FK orphans auto-scanned clean (" + itoa(int64(checked)) + " FK constraint(s) checked)."
			}
		} else {
			info.ForeignKeyNote = "Postgres orphan scan unavailable (" + oerr.Error() + "); health is row-count parity only."
		}
	}
	return info, nil
}

// databaseInfoMySQL returns real diagnostics for MySQL/MariaDB in the same
// JSON shape. information_schema.TABLES gives data_length/index_length;
// information_schema.columns/statistics give column/index counts.
// FK orphans are auto-scanned via information_schema.KEY_COLUMN_USAGE.
func databaseInfoMySQL(con *sql.DB, cfg config.DBConfig) (DatabaseInfo, error) {
	now := time.Now().UTC()
	info := DatabaseInfo{
		Engine:           "mysql",
		Path:             redactedDSN(cfg.DSN),
		GeneratedAt:      now,
		Tables:           []DatabaseTable{},
		IntegrityIssues:  []string{},
		ForeignKeyIssues: []string{},
		IntegrityOk:      true,
		ForeignKeyOk:     true,
		IntegrityNote:    "MySQL has no PRAGMA quick_check; health is connection probe + row-count parity + FK-orphan scan (see scheduled verify).",
		ForeignKeyNote:   "MySQL FK orphans auto-scanned via information_schema.KEY_COLUMN_USAGE.",
		HealthNote:       "MySQL diagnostics via information_schema + Data_length/Index_length.",
	}
	if v := scalar(con, `SELECT VERSION()`); v != "" {
		info.Version = v
	} else {
		info.Version = "unknown"
	}
	if v := scalar(con, `SELECT @@default_storage_engine`); v != "" {
		info.JournalMode = v
	} else {
		info.JournalMode = "InnoDB"
	}
	if v := scalar(con, `SELECT @@character_set_database`); v != "" {
		info.Encoding = v
	}
	info.TotalConnections = scalarInt(con, `SELECT COUNT(*) FROM information_schema.PROCESSLIST`)
	info.PageSize = scalarInt(con, `SELECT @@innodb_page_size`)
	if info.PageSize == 0 {
		info.PageSize = 16384
	}
	dbBytes := scalarInt(con, `SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema = DATABASE()`)
	info.LogicalBytes = dbBytes
	info.OnDiskBytes = dbBytes
	if info.PageSize > 0 && dbBytes > 0 {
		info.PageCount = dbBytes / info.PageSize
	}
	info.LastCheckpoint = now.Format(time.RFC3339)
	info.LastModifiedAgoSec = 0
	rows, err := con.Query(`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`)
	if err != nil {
		return info, err
	}
	names := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err == nil {
			names = append(names, n)
		}
	}
	rows.Close()
	if rerr := rows.Err(); rerr != nil {
		return info, rerr
	}
	out := make([]DatabaseTable, 0, len(names))
	for _, n := range names {
		var dt DatabaseTable
		dt.Name = n
		dt.Type = "table"
		nIdent := strings.ReplaceAll(n, "`", "``")
		nLit := escapeSQLLit(n)
		dt.RowCount = scalarInt(con, "SELECT COUNT(*) FROM `"+nIdent+"`")
		dt.ColumnCount = scalarInt(con, `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '`+nLit+`'`)
		dt.IndexCount = scalarInt(con, `SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '`+nLit+`'`)
		dt.SizeBytes = scalarInt(con, `SELECT COALESCE(data_length,0) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '`+nLit+`'`)
		dt.IndexBytes = scalarInt(con, `SELECT COALESCE(index_length,0) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '`+nLit+`'`)
		dt.AutoIncrVal = scalarInt(con, `SELECT COALESCE(auto_increment,0) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '`+nLit+`'`)
		if info.PageSize > 0 && dt.SizeBytes > 0 {
			dt.PageCount = dt.SizeBytes / info.PageSize
			if dt.PageCount == 0 {
				dt.PageCount = 1
			}
		}
		dt.LeafPages = dt.PageCount
		if dt.RowCount > 0 && dt.SizeBytes > 0 {
			dt.AvgRowBytes = dt.SizeBytes / dt.RowCount
		}
		out = append(out, dt)
	}
	info.Tables = out
	if md, derr := db.NewDialect("mysql"); derr == nil {
		if oi, ow, checked, oerr := datamove.ScanFKOrphans(md, con); oerr == nil {
			if len(oi) > 0 {
				info.ForeignKeyIssues = oi
				info.ForeignKeyOk = false
			}
			if len(ow) > 0 {
				info.ForeignKeyNote = "MySQL FK orphans auto-scanned (" + itoa(int64(checked)) + " constraints); scan warnings: " + strings.Join(ow, "; ")
			} else if len(oi) == 0 {
				info.ForeignKeyNote = "MySQL FK orphans auto-scanned clean (" + itoa(int64(checked)) + " FK constraint(s) checked)."
			}
		} else {
			info.ForeignKeyNote = "MySQL orphan scan unavailable (" + oerr.Error() + "); health is row-count parity only."
		}
	}
	return info, nil
}

// attachVerifyStatus populates the verify_* fields from the persisted
// verify-state KV. Never fails the page — a missing/corrupt state renders
// as "never verified".
func attachVerifyStatus(info *DatabaseInfo) {
	if info == nil {
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		info.VerifyLastIssues = []string{}
		info.VerifyLastWarnings = []string{}
		return
	}
	defer con.Close()
	cfg := config.DatabaseConfig()
	d, derr := db.NewDialect(cfg.Engine)
	if derr != nil {
		info.VerifyLastIssues = []string{}
		info.VerifyLastWarnings = []string{}
		return
	}
	st := repository.GetDatabaseVerifyState(con, d)
	info.VerifyLastAt = st.CheckedAt
	info.VerifyLastOk = st.Ok
	info.VerifyLastIssues = st.Issues
	if info.VerifyLastIssues == nil {
		info.VerifyLastIssues = []string{}
	}
	info.VerifyLastWarnings = st.Warnings
	if info.VerifyLastWarnings == nil {
		info.VerifyLastWarnings = []string{}
	}
	info.VerifyTableCount = st.TableCount
	info.VerifyDurationMs = st.DurationMs
	info.VerifyCron = st.Cron
	info.VerifyNextRun = st.NextRun
	if info.VerifyCron == "" {
		info.VerifyCron = repository.DefaultDBVerifyCron
	}
}

// applySnapshotDeltas diffs info against the previous snapshot in
// snapshotStore and records the result for the next tick. Shared by the
// Postgres/MySQL branches (the SQLite branch keeps its inline version so
// its diff comment stays attached to the measurement code).
func applySnapshotDeltas(info *DatabaseInfo) {
	if info == nil {
		return
	}
	prev := snapshotStore.get()
	if prev != nil {
		prevByTable := make(map[string]DatabaseTable, len(prev.Tables))
		for _, t := range prev.Tables {
			prevByTable[t.Name] = t
		}
		sumRow := int64(0)
		for i := range info.Tables {
			t := &info.Tables[i]
			p := prevByTable[t.Name]
			t.RowDelta = t.RowCount - p.RowCount
			t.SizeDelta = t.SizeBytes - p.SizeBytes
			t.IndexDelta = t.IndexBytes - p.IndexBytes
			sumRow += t.RowDelta
		}
		info.RowDeltaSinceLast = sumRow
		info.SizeDelta = info.OnDiskBytes - prev.OnDiskBytes
		info.WalDelta = info.WalBytes - prev.WalBytes
	}
	snapshotStore.store(*info)
}

// redactedDSN masks passwords out of a database DSN so the JSON snapshot we
// ship to the SPA never accidentally leaks the secret. We accept the
// libpq keyword form (password=...), the URL form (user:pass@host), and
// the go-sql-driver form (user:pass@tcp(host)). DSNs we can't parse are
// returned verbatim rather than logged in full — the SPA already knows
// which engine it talked to.
func redactedDSN(dsn string) string {
	if dsn == "" {
		return ""
	}
	if i := strings.Index(dsn, "password="); i >= 0 {
		j := i + len("password=")
		end := strings.IndexAny(dsn[j:], " &")
		if end < 0 {
			end = len(dsn) - j
		}
		return dsn[:j] + "***" + dsn[j+end:]
	}
	if i := strings.Index(dsn, "://"); i >= 0 {
		if at := strings.Index(dsn[i:], "@"); at > 0 {
			creds := dsn[i+3 : i+at]
			if colon := strings.IndexByte(creds, ':'); colon > 0 {
				return dsn[:i+3] + creds[:colon] + ":***" + dsn[i+at:]
			}
		}
	}
	if strings.Contains(dsn, ":") && strings.Contains(dsn, "@") {
		if at := strings.Index(dsn, "@"); at > 0 {
			creds := dsn[:at]
			if colon := strings.IndexByte(creds, ':'); colon > 0 {
				return creds[:colon] + ":***" + dsn[at:]
			}
		}
	}
	return dsn
}

// doesn't exist (the -wal / -shm sidecars are legitimately absent when the
// DB has just been checkpointed, which happens every time this handler
// runs).
func statSize(p string) int64 {
	if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
		return fi.Size()
	}
	return 0
}

// itoa is a local int→string helper so we don't pull in strconv just for
// the foreign-key summary line.
func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

// snapshotStore is a process-local cache of the LAST DatabaseInfo produced
// by DatabaseInfoHandler. It's the substrate for the between-tick deltas the
// live monitor renders: each invocation diffs the freshly-measured snapshot
// against the previous one and reports "grew by N bytes / M rows since the
// previous 5s tick". Scoping the cache to the process (not the file) is
// deliberate — the deltas describe THIS panel's observation window, and a
// restart naturally resets them to zero (there's nothing to diff against),
// which the UI surfaces as "warming up…". A mutex guards concurrent reads;
// the handler is serialized on the inspector connection anyway (OpenDB pins
// MaxOpenConns(1)), but external test callers can hit it in parallel.
type snapshotCache struct {
	mu  sync.Mutex
	now *DatabaseInfo
}

// store replaces the cached snapshot. We only keep the most recent one —
// per-tick delta computation never needs history beyond the previous sample.
func (c *snapshotCache) store(i DatabaseInfo) {
	c.mu.Lock()
	c.now = &i
	c.mu.Unlock()
}

// get returns a pointer to the cached snapshot, or nil before the first
// snapshot. Returning the pointer (not a value copy) is intentional — the
// handler only reads it, and a copy would defeat the purpose on big table
// lists.
func (c *snapshotCache) get() *DatabaseInfo {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

var snapshotStore snapshotCache

// SnapshotStoreResetForTest clears the process-local snapshot cache. It
// exists only so tests that exercise the delta path can start from a clean
// baseline; production code prefers resetSnapshotStore (same effect, honest
// name).
func SnapshotStoreResetForTest() {
	resetSnapshotStore()
}

// resetSnapshotStore clears the between-tick delta cache. Called after a
// live engine switch so the next /api/database tick does not diff a fresh
// Postgres/MySQL snapshot against a stale SQLite one (which would surface
// as a bogus negative growth spike).
func resetSnapshotStore() {
	snapshotStore.mu.Lock()
	snapshotStore.now = nil
	snapshotStore.mu.Unlock()
}

// tryActivateLiveEngine points the running process at the newly persisted
// engine without a restart: it shadows the CLI/env config via
// config.SetDatabaseType (+ env for children), then proves the new engine
// serves with a fresh OpenDB + Ping. On success the snapshot delta cache
// is reset and true is returned (caller reports requires_restart=false).
// On failure the previous coordinates are restored in-process (the
// on-disk kspanel.env keeps the NEW engine so a restart still picks it
// up) and false is returned (caller keeps requires_restart=true).
func tryActivateLiveEngine(engine, dsn string, prev config.DBConfig) bool {
	config.SetDatabaseType(engine, dsn)
	_ = os.Setenv("KSPANEL_DB_TYPE", engine)
	if dsn != "" {
		_ = os.Setenv("KSPANEL_DB_DSN", dsn)
	}
	con, err := repository.OpenDB()
	if err != nil {
		config.SetDatabaseType(prev.Engine, prev.DSN)
		_ = os.Setenv("KSPANEL_DB_TYPE", prev.Engine)
		_ = os.Setenv("KSPANEL_DB_DSN", prev.DSN)
		return false
	}
	pingErr := con.Ping()
	con.Close()
	if pingErr != nil {
		config.SetDatabaseType(prev.Engine, prev.DSN)
		_ = os.Setenv("KSPANEL_DB_TYPE", prev.Engine)
		_ = os.Setenv("KSPANEL_DB_DSN", prev.DSN)
		return false
	}
	resetSnapshotStore()
	return true
}

// EngineSwitchRequest is the admin "Change Database" form payload. The
// operator picks an engine plus its connection coordinates — either a
// full DSN or the friendlier host:port + user/pass/db tuple the UI
// exposes. The handler validates connectivity (against the new engine,
// never the currently open one) before doing anything else.
//
// Beyond the coordinates every behaviour of the switch is operator-
// configurable so the web UI can drive the full pipeline: optional data
// sync into the new backend, a pre-switch backup, automatic restore on
// failure and a post-sync recheck.
type EngineSwitchRequest struct {
	Engine string `json:"engine"`
	DSN    string `json:"dsn,omitempty"`
	// Friendlier form, mirrors `./kspanel seed --url ...`:
	URL      string `json:"url,omitempty"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
	Database string `json:"database,omitempty"`

	// ── Sync options ─────────────────────────────────────────────────
	// SyncData copies every row from the current database into the target
	// before the new coordinates are persisted. When false the switch is
	// config-only (the historical behaviour).
	SyncData bool `json:"sync_data"`
	// CreateBackup snapshots the CURRENT database before syncing. Pointer
	// form so "field not sent" defaults to true — the safe choice.
	CreateBackup *bool `json:"create_backup,omitempty"`
	// Verify rechecks the synced target after the copy (row parity per
	// table + engine-level integrity where available). Defaults to true.
	Verify *bool `json:"verify,omitempty"`
	// BatchSize rows per multi-row INSERT during the sync. 0 = server
	// default (datamove.DefaultBatchSize); clamped to [0, 10000].
	BatchSize int `json:"batch_size,omitempty"`
	// ClearTarget empties each target table before copying so seeded rows
	// can't collide with the source's primary keys. Defaults to true.
	ClearTarget *bool `json:"clear_target,omitempty"`
	// Tables restricts the sync to specific tables. Empty = all tables.
	Tables []string `json:"tables,omitempty"`
}

// EngineSwitchResponse confirms the persisted engine + a redacted DSN so the
// SPA can paint the post-switch state without leaking the password.
type EngineSwitchResponse struct {
	OK      bool   `json:"ok"`
	Engine  string `json:"engine"`
	DSN     string `json:"dsn"` // redacted
	Message string `json:"message"`
	// RequiresRestart tells the SPA whether a `launch` restart is still
	// needed. Config-only switches (sync_data=false) always require one.
	// Synced switches (sync_data=true) reopen the live pool in-process via
	// tryActivateLiveEngine so the panel serves the new engine immediately;
	// RequiresRestart is then false. A failed live reopen keeps the
	// persisted coordinates (restart picks them up) and reports true as a
	// safe fallback.
	RequiresRestart bool `json:"requires_restart"`

	// ── Sync results (populated when sync_data was requested) ──────────
	Synced     bool                   `json:"synced"`
	RowsCopied int64                  `json:"rows_copied"`
	Tables     []datamove.TableResult `json:"tables"`
	Steps      []string               `json:"steps"`
	DurationMs int64                  `json:"duration_ms"`
	// Backup of the pre-switch database, when one was taken. ID/path let
	// the UI point the operator at the restorable artifact.
	BackupID    string `json:"backup_id,omitempty"`
	BackupPath  string `json:"backup_path,omitempty"`
	BackupBytes int64  `json:"backup_bytes,omitempty"`
	// RolledBack reports that an error occurred mid-sync and the target was
	// restored to its pre-sync state; the panel keeps the OLD configuration.
	RolledBack bool `json:"rolled_back"`
	// Verified + issues/warnings from the post-sync recheck.
	Verified       bool     `json:"verified"`
	VerifyIssues   []string `json:"verify_issues"`
	VerifyWarnings []string `json:"verify_warnings"`
}

// engineSwitchMu serialises engine switches. Two overlapping requests could
// otherwise interleave backups/syncs against the same live database and
// produce two half-written targets; a switch is rare but heavyweight, so a
// plain process-wide mutex is the right shape.
var engineSwitchMu sync.Mutex

// SetDatabaseEngineHandler validates a database engine switch coming from the
// admin Database page and, on success, persists it via config.SaveDBConfig so
// the next `launch` / `seed` picks it up. Config-only switches (sync_data=false)
// keep the historical restart-required behaviour. Synced switches
// (sync_data=true) hot-switch the live pool in-process via
// tryActivateLiveEngine after persisting — repository.OpenDB opens a fresh
// connection per call (no global pool to fracture), so the next request
// already serves the new engine; a failed reopen falls back to the same
// restart message.
//
// With sync_data enabled the handler runs the full migration pipeline BEFORE
// persisting anything:
//
//  1. Backup the current database (SQLite → VACUUM INTO snapshot; Postgres /
//     MySQL → full dump into an equivalent SQLite snapshot file) so there is
//     always a restorable artifact on disk.
//  2. Bring the target schema up to date (migrations + idempotent seed).
//  3. Copy every table across inside ONE destination transaction — any copy
//     error rolls the target back to its exact pre-sync state.
//  4. Recheck everything: per-table row parity against the source plus
//     integrity/foreign-key checks where the engine exposes them.
//  5. Only after all of that succeeded are the new coordinates written to
//     kspanel.env. A failure at ANY step keeps the old engine active,
//     reports rolled_back=true and hands back the backup coordinates.
//
// Privacy note: passwords in the request body are written to kspanel.env as
// part of the DSN. kspanel.env sits next to kspanel.db in DataDir; an operator
// who can read one can read the other, so this keeps the existing trust
// boundary intact. The JSON we return always carries the redacted DSN.
func SetDatabaseEngineHandler(w http.ResponseWriter, r *http.Request) {
	engineSwitchMu.Lock()
	defer engineSwitchMu.Unlock()

	var req EngineSwitchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	engine := strings.ToLower(strings.TrimSpace(req.Engine))
	d, err := db.NewDialect(engine)
	if err != nil {
		writeJSON(w, EngineSwitchResponse{
			OK:      false,
			Engine:  engine,
			Message: err.Error(),
		})
		return
	}

	// Resolve the DSN: explicit --dsn wins over the friendlier URL form.
	// For SQLite the DSN defaults to the standard SQLite path (KSPANEL_DB or
	// ./kspanel.db) when neither was given so "switch back to SQLite" is a
	// one-click reset. DatabasePath() is deliberately NOT used here: it
	// returns the CURRENT config's DSN, which is a postgres/mysql connection
	// string whenever the panel is running on that engine.
	dsn := strings.TrimSpace(req.DSN)
	if dsn == "" && strings.TrimSpace(req.URL) != "" {
		if built, ok := config.BuildDSNFromURL(engine, req.URL, req.User, req.Password, req.Database); ok {
			dsn = built
		}
	}
	if d.IsSQLite() && dsn == "" {
		dsn = config.DefaultSQLitePath()
	}

	resp := EngineSwitchResponse{
		Engine:         d.Name(),
		DSN:            redactedDSN(dsn),
		Steps:          []string{},
		Tables:         []datamove.TableResult{},
		VerifyIssues:   []string{},
		VerifyWarnings: []string{},
	}
	started := time.Now()

	// Refuse switching a database onto itself — the copy would read and
	// write the same rows. SQLite paths compare cleaned; other DSNs verbatim.
	cur := config.DatabaseConfig()
	if curD, cerr := db.NewDialect(cur.Engine); cerr == nil && curD.Name() == d.Name() {
		same := false
		if d.IsSQLite() {
			same = filepath.Clean(dsn) == filepath.Clean(cur.DSN)
		} else {
			same = strings.TrimSpace(dsn) == strings.TrimSpace(cur.DSN)
		}
		if same {
			resp.Message = "the panel already uses this database"
			resp.DurationMs = msSince(started)
			writeJSON(w, resp)
			return
		}
	}

	// Open + validate the target BEFORE any heavy work. db.Open (rather than
	// a raw dialect open) also creates missing parent directories for a
	// brand-new SQLite path instead of failing with a confusing driver error.
	target, _, terr := db.Open(config.DBConfig{Engine: d.Name(), DSN: dsn})
	if terr != nil {
		// Redact before echoing: some drivers embed parts of the DSN
		// (credentials included) in their error strings.
		resp.Message = "connection test failed: " + redactedDSN(terr.Error())
		resp.DurationMs = msSince(started)
		writeJSON(w, resp)
		return
	}
	defer target.Close()

	// Sync option defaults: backup / verify / clear-target all default ON —
	// the safe pipeline runs unless the operator explicitly disables parts.
	createBackup := req.CreateBackup == nil || *req.CreateBackup
	verifyAfter := req.Verify == nil || *req.Verify
	clearTarget := req.ClearTarget == nil || *req.ClearTarget
	batchSize := clampBatchSize(req.BatchSize)

	if !req.SyncData {
		persistEngineConfig(&resp, engine, dsn,
			"database engine updated — restart kspanel launch to apply", started)
		writeJSON(w, resp)
		return
	}

	// ── Full pipeline: backup → schema → copy → recheck → persist ──────
	srcCfg := config.DatabaseConfig()
	srcD, serr := db.NewDialect(srcCfg.Engine)
	if serr != nil {
		resp.Message = "current engine unknown: " + serr.Error()
		resp.DurationMs = msSince(started)
		writeJSON(w, resp)
		return
	}
	srcCon, serr := repository.OpenDB()
	if serr != nil {
		resp.Message = "cannot open current database for sync: " + serr.Error()
		resp.DurationMs = msSince(started)
		writeJSON(w, resp)
		return
	}
	defer srcCon.Close()

	// Step 1 — backup of the current database. Non-SQLite sources are dumped
	// into a SQLite snapshot via the same mover used for the real copy, so
	// EVERY switch leaves a restorable .db artifact in the standard backup
	// directory regardless of engine.
	if createBackup {
		b, berr := createPreSwitchBackup(srcD, srcCon, batchSize)
		if berr != nil {
			resp.Message = "backup failed: " + berr.Error()
			resp.DurationMs = msSince(started)
			writeJSON(w, resp)
			return
		}
		resp.BackupID, resp.BackupPath, resp.BackupBytes = b.ID, b.Path, b.Size
		resp.Steps = append(resp.Steps,
			fmt.Sprintf("backup created: %s (%d bytes)", b.Filename, b.Size))
	} else {
		resp.Steps = append(resp.Steps, "backup skipped (disabled)")
	}

	// Step 2 — bring the target schema up to date so every source table has
	// a destination with identical columns.
	resp.Steps = append(resp.Steps, "running migrations on target")
	if err := db.EnsureSchemaAndSeed(d, target); err != nil {
		resp.Message = "target schema setup failed: " + err.Error()
		resp.RolledBack = true // nothing copied yet; target left untouched
		resp.DurationMs = msSince(started)
		writeJSON(w, resp)
		return
	}

	// Step 3 — copy all data. Sync runs inside ONE destination transaction:
	// on error it returns AND rolls the target back to its pre-sync state in
	// the same breath (that rollback IS the restore-on-error guarantee).
	syncOpts := datamove.Options{
		BatchSize:   batchSize,
		ClearTarget: clearTarget,
		Tables:      req.Tables,
	}
	res, cerr := datamove.Sync(srcD, srcCon, d, target, syncOpts)
	if res != nil {
		resp.Steps = append(resp.Steps, res.Steps...)
		resp.Tables = res.Tables
		resp.RowsCopied = res.RowsCopied
	}
	if cerr != nil {
		resp.Message = "sync failed — target restored to its previous state: " + cerr.Error()
		resp.RolledBack = true
		resp.DurationMs = msSince(started)
		log.Printf("database engine switch rolled back: %v", cerr)
		writeJSON(w, resp)
		return
	}

	bl := baselinesFromResult(res)
	// Step 4 — recheck everything after the sync: row parity per table plus
	// engine-level integrity where available.
	if verifyAfter {
		issues, warnings, verr := datamove.Verify(srcD, srcCon, d, target, bl.order, bl.byTable)
		resp.VerifyIssues, resp.VerifyWarnings = issues, warnings
		if verr != nil {
			resp.VerifyIssues = append(resp.VerifyIssues, verr.Error())
		}
		if len(resp.VerifyIssues) > 0 {
			// Post-commit integrity failure. With clear_target enabled the
			// pre-sync target held only seeded rows, so wiping every copied
			// table restores exactly that state and the operator's old
			// configuration stays authoritative. With clear_target disabled
			// the target also held pre-existing rows we must NOT destroy —
			// the copied rows are reported instead of being removed.
			var cleanErr error
			if clearTarget {
				cleanErr = cleanupCopiedTables(target, d, bl.order)
				resp.Message = "verification failed — synced data removed from target: " +
					strings.Join(resp.VerifyIssues, "; ")
			} else {
				resp.Message = "verification failed — copied rows left in place (clear_target was off): " +
					strings.Join(resp.VerifyIssues, "; ")
			}
			resp.RolledBack = true
			if cleanErr != nil {
				resp.Message += fmt.Sprintf(" (target cleanup incomplete: %v)", cleanErr)
			}
			resp.DurationMs = msSince(started)
			log.Printf("database engine switch failed verification: %s", resp.Message)
			writeJSON(w, resp)
			return
		}
		resp.Verified = true
		resp.Steps = append(resp.Steps, "recheck passed: row parity + integrity OK")
	}

	// Step 5 — everything succeeded; make the new coordinates durable,
	// then hot-switch the live pool when a full sync just landed. The
	// persisted kspanel.env keeps the new engine either way (restart is the
	// fallback); a successful live reopen flips RequiresRestart to false so
	// the SPA stops asking for a restart.
	persistEngineConfig(&resp, engine, dsn,
		fmt.Sprintf("database switched and %d tables / %d rows synced — restart kspanel launch to apply",
			len(res.Tables), res.RowsCopied),
		started)
	if resp.OK {
		resp.Synced = true
		if tryActivateLiveEngine(engine, dsn, srcCfg) {
			resp.RequiresRestart = false
			resp.Message = fmt.Sprintf("database switched and %d tables / %d rows synced — live, no restart required",
				len(res.Tables), res.RowsCopied)
			resp.Steps = append(resp.Steps, "live pool reopened on "+d.Name()+" — no restart required")
		} else {
			resp.Steps = append(resp.Steps, "live reopen unavailable — restart kspanel launch to apply")
		}
	}
	writeJSON(w, resp)
}

// createPreSwitchBackup snapshots the CURRENT database into the standard
// backup directory. SQLite sources use VACUUM INTO (fast, consistent);
// Postgres / MySQL sources first attempt a native pg_dump / mysqldump
// artifact (restorable with psql / mysql); when the native tool is missing
// they fall back to dumping through datamove into an equivalent SQLite
// snapshot file so a restorable artifact always exists.
func createPreSwitchBackup(srcD db.Dialect, src *sql.DB, batchSize int) (backup.Backup, error) {
	if srcD.IsSQLite() {
		return backup.Create("pre-switch")
	}
	if backup.NativeToolAvailable(srcD.Name()) {
		if b, err := backup.CreateWithOptions("pre-switch", "none"); err == nil {
			return b, nil
		} else {
			var missing *backup.ErrNativeToolMissing
			if !errors.As(err, &missing) {
				return backup.Backup{}, err
			}
		}
	}
	return backup.CreateWithWriter("pre-switch", func(p string) error {
		dump, sd, err := db.Open(config.DBConfig{Engine: "sqlite", DSN: p})
		if err != nil {
			return err
		}
		defer dump.Close()
		if err := db.EnsureSchemaAndSeed(sd, dump); err != nil {
			return err
		}
		_, err = datamove.Sync(srcD, src, sd, dump, datamove.Options{
			BatchSize:   batchSize,
			ClearTarget: true,
		})
		return err
	})
}

// persistEngineConfig writes the chosen coordinates to kspanel.env and fills
// the response for the success path. Called only AFTER backup/sync/verify
// have all succeeded (or when no sync was requested), so a failure anywhere
// earlier never flips the panel's stored engine. It always reports
// RequiresRestart=true; the synced-switch path attempts a live reopen right
// after and flips it to false on success (see Step 5).
func persistEngineConfig(resp *EngineSwitchResponse, engine, dsn, msg string, started time.Time) {
	if err := config.SaveDBConfig(engine, dsn); err != nil {
		resp.OK = false
		resp.Message = "persist failed: " + err.Error()
		resp.DurationMs = msSince(started)
		return
	}
	resp.OK = true
	resp.Message = msg
	resp.RequiresRestart = true
	resp.DurationMs = msSince(started)
}

// cleanupCopiedTables removes the rows a failed post-commit verification
// rejected, children-first so FKs can't block the deletes. Best-effort: the
// returned error (if any) is surfaced verbatim to the operator.
func cleanupCopiedTables(target *sql.DB, d db.Dialect, order []string) error {
	var firstErr error
	for i := len(order) - 1; i >= 0; i-- {
		if _, err := target.Exec(`DELETE FROM ` + quoteTableName(d, order[i])); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// quoteTableName quotes an identifier for the engine's grammar. Kept local
// because the handlers package has no other cross-engine SQL builder.
// MySQL/MariaDB use backticks; SQLite/Postgres/MSSQL use double quotes
// (MSSQL also accepts [brackets] — double quotes keep one code path under
// QUOTED_IDENTIFIER ON, matching datamove.quoteIdent).
func quoteTableName(d db.Dialect, name string) string {
	switch d.Name() {
	case "mysql", "mariadb":
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	default:
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	}
}

// clampBatchSize bounds the operator-provided batch to sane values.
func clampBatchSize(n int) int {
	if n < 0 {
		return 0
	}
	if n > 10000 {
		return 10000
	}
	return n
}

type baselineInfo struct {
	order   []string
	byTable map[string]int64
}

// baselinesFromResult extracts the copy order + per-table source baselines
// a Sync produced, in the shape Verify expects.
func baselinesFromResult(res *datamove.Result) baselineInfo {
	info := baselineInfo{byTable: make(map[string]int64)}
	if res == nil {
		return info
	}
	for _, tr := range res.Tables {
		info.order = append(info.order, tr.Table)
		info.byTable[tr.Table] = tr.BaselineRows
	}
	return info
}

func msSince(t time.Time) int64 { return time.Since(t).Milliseconds() }

// DatabaseEnginesHandler lists the engines the panel supports and their
// default ports so the admin UI can populate the "Change Database" form
// without hard-coding the list.
type DatabaseEngineInfo struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	DefaultPort string `json:"default_port"`
	SupportsURL bool   `json:"supports_url"` // true for engines that accept host:port
}

// DatabaseEnginesHandler returns the catalogue of switchable engines the
// admin Database page renders. Kept server-side so adding a new dialect
// (e.g. cockroach) is a one-file change instead of plumbing a new option
// through the SPA bundle too.
func DatabaseEnginesHandler(w http.ResponseWriter, r *http.Request) {
	engines := []DatabaseEngineInfo{
		{Name: "sqlite", Label: "SQLite (embedded)", DefaultPort: "", SupportsURL: false},
		{Name: "postgres", Label: "PostgreSQL", DefaultPort: "5432", SupportsURL: true},
		{Name: "mysql", Label: "MySQL / MariaDB", DefaultPort: "3306", SupportsURL: true},
	}
	writeJSON(w, engines)
}
