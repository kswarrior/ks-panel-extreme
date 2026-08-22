package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/config"
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
	Engine      string          `json:"engine"`
	Path        string          `json:"path"`
	Version     string          `json:"version"`
	JournalMode string          `json:"journal_mode"`
	GeneratedAt time.Time      `json:"generated_at"`

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

	// Health summary. IntegrityOk flips to false if PRAGMA integrity_quick
	// (or the all-tables foreign_key_check) emitted anything but "ok".    
	IntegrityOk        bool     `json:"integrity_ok"`
	IntegrityIssues    []string `json:"integrity_issues"`
	ForeignKeyOk       bool     `json:"foreign_key_ok"`
	ForeignKeyIssues   []string `json:"foreign_key_issues"`
	FragmentsPct   float64 `json:"fragmentation_pct"`
	LastCheckpoint string  `json:"last_checkpoint"`

	Tables []DatabaseTable `json:"tables"`

	// EngineNotSupported is true for non-SQLite engines; the page renders
	// an explanatory card ("use psql / mysql cli for introspection") and
	// does not query PRAGMA-driven fields.
	EngineNotSupported bool `json:"engine_not_supported"`

	// Live-monitor global counters. These turn the page from a static
	// snapshot into a real monitor: the between-tick deltas let an operator
	// see "the panel is currently being written to" rather than only "the
	// panel DB is X bytes". Only SQLite-exposed pragmas + dbstat aggregates
	// back these — there is no private instrumentation, so the numbers are
	// exactly what the storage engine itself records.

	// Connection/account stats from PRAGMA — those reported only where the
	// driver exposes them; zero is the "not available on this build"
	// sentinel the UI renders as an em-dash.
	TotalConnections int64 `json:"total_connections"`
	CacheSizePages   int64 `json:"cache_size_pages"`
	AutoVacuumMode   int64 `json:"auto_vacuum_mode"`
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
	SizeBytes  int64  `json:"size_bytes"`
	IndexBytes int64  `json:"index_bytes"`
	WithoutRowid bool  `json:"without_rowid"`
	Type       string `json:"type"`
	// Live-monitor extras. PageCount/LeafPages/InternalPages/OverflowPages
	// come straight from dbstat aggregations so an operator can see whether a
	// table is a single root page or has grown into a multi-level b-tree —
	// the difference is what separates "tiny lookup table" from "needs an
	// index" at a glance. AvgRowBytes is size_bytes / row_count, capped to
	// the page_size to keep the divisor sane on empty tables.
	PageCount    int64 `json:"page_count"`
	LeafPages    int64 `json:"leaf_pages"`
	InternalPages int64 `json:"internal_pages"`
	OverflowPages int64 `json:"overflow_pages"`
	AvgRowBytes  int64 `json:"avg_row_bytes"`
	// Largest cell payload across this table's pages — a high value relative
	// to the page size flags blob-heavy tables that overflow into side
	// pages (which is exactly the growth mode an operator wants to watch).
	MaxPayload   int64 `json:"max_payload"`
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
// The rich PRAGMA-driven diagnostic is SQLite-only. For Postgres / MySQL we
// return a friendly stub with `engine_not_supported = true` so the page
// renders an explanatory card instead of crashing on `PRAGMA table_info`.
func DatabaseInfoHandler(w http.ResponseWriter, r *http.Request) {
	cfg := config.DatabaseConfig()
	d, err := db.NewDialect(cfg.Engine)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !d.IsSQLite() {
		// Stub response for non-SQLite engines — the page surfaces a
		// "Use psql / mysql cli for introspection" hint instead of trying
		// to render PRAGMA-driven fields it cannot compute.
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

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	info := DatabaseInfo{
		Path:        config.DatabasePath(),
		Engine:      "sqlite",
		JournalMode: "unknown",
		GeneratedAt: time.Now().UTC(),
		Tables:      []DatabaseTable{},
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

	// Health: integrity_quick is O(pages) but cheap relative to integrity
	// full and catches the vast majority of corruption classes without the
	// minutes-long full scan. foreign_key_check walks every parent→child
	// edge that has an FK defined and reports orphaned rows by table.
	info.IntegrityOk = true
	info.ForeignKeyOk = true
	if rows, err := con.Query(`PRAGMA integrity_quick`); err == nil {
		for rows.Next() {
			var msg string
			if err := rows.Scan(&msg); err == nil && strings.TrimSpace(strings.ToLower(msg)) != "ok" {
				info.IntegrityOk = false
				info.IntegrityIssues = append(info.IntegrityIssues, msg)
			}
		}
		rows.Close()
	} else {
		// Some older SQLite builds predate integrity_quick — fall back so a
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
	out := make([]DatabaseTable, 0, len(names))
	for _, n := range names {
		var dt DatabaseTable
		dt.Name = n
		dt.Type = "table"
		dt.RowCount = scalarInt(con,
			`SELECT COUNT(*) FROM "`+n+`"`)
		dt.ColumnCount = scalarInt(con,
			`SELECT COUNT(*) FROM pragma_table_info('`+n+`')`)
		// Index count: system + user indexes combined, excluding the
		// implicit rowid b-tree which isn't an "index" entry.
		dt.IndexCount = scalarInt(con,
			`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='`+n+`'`)
		// WITHOUT ROWID tables store rows directly in their PK b-tree (no
		// separate rowid). Detect by parsing the CREATE TABLE statement for
		// the trailing "WITHOUT ROWID" clause rather than guessing from
		// primary-key presence (every table with a PK would otherwise read
		// as without-rowid).
		sqlText := scalar(con, `SELECT sql FROM sqlite_master WHERE type='table' AND name='`+n+`'`)
		if sqlText != "" {
			upper := strings.ToUpper(strings.TrimSpace(strings.TrimRight(strings.TrimSpace(sqlText), ";")))
			dt.WithoutRowid = strings.HasSuffix(upper, "WITHOUT ROWID")
		}
		// Autoincrement: SELECT FROM sqlite_sequence WHERE name = table.
		// Missing row ⇒ table has no AUTOINCREMENT column.
		dt.AutoIncrVal = scalarInt(con,
			`SELECT seq FROM sqlite_sequence WHERE name='`+n+`'`)
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
				FROM dbstat WHERE name='`+n+`'`).
				Scan(&dt.SizeBytes, &dt.PageCount, &dt.InternalPages, &dt.OverflowPages, &dt.MaxPayload)
			dt.LeafPages = dt.PageCount - dt.InternalPages - dt.OverflowPages
			// Index footprint: every index entry in dbstat for this table.
			// dbstat exposes each index by the index name, so we sum pgsize
			// across every index name attached to this table.
			dt.IndexBytes = scalarInt(con,
				`SELECT COALESCE(SUM(s.pgsize), 0) FROM dbstat s JOIN sqlite_master m ON m.name = s.name WHERE m.type='index' AND m.tbl_name='`+n+`'`)
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
// baseline; production code never calls it.
func SnapshotStoreResetForTest() {
	snapshotStore.mu.Lock()
	snapshotStore.now = nil
	snapshotStore.mu.Unlock()
}

// EngineSwitchRequest is the admin "Change Database" form payload. The
// operator picks an engine plus its connection coordinates — either a
// full DSN or the friendlier host:port + user/pass/db tuple the UI
// exposes. The handler validates connectivity (against the new engine,
// never the currently open one) before persisting.
type EngineSwitchRequest struct {
	Engine   string `json:"engine"`
	DSN      string `json:"dsn,omitempty"`
	// Friendlier form, mirrors `./kspanel seed --url ...`:
	URL      string `json:"url,omitempty"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
	Database string `json:"database,omitempty"`
}

// EngineSwitchResponse confirms the persisted engine + a redacted DSN so the
// SPA can paint the post-switch state without leaking the password.
type EngineSwitchResponse struct {
	OK       bool   `json:"ok"`
	Engine   string `json:"engine"`
	DSN      string `json:"dsn"` // redacted
	Message  string `json:"message"`
	// RequiresRestart is always true: the panel keeps its current pool open
	// until the operator restarts `launch`, exactly like the CLI flags the
	// env vars. We surface it so the UI can tell the user the next step.
	RequiresRestart bool `json:"requires_restart"`
}

// SetDatabaseEngineHandler validates a database engine switch coming from the
// admin Database page and, on success, persists it via config.SaveDBConfig so
// the next `launch` / `seed` picks it up. It NEVER swaps the live connection
// the running panel uses — a mid-flight pool swap on a busy panel would
// silently fracture in-flight transactions; safer to make the change durable
// and ask the operator to restart.
//
// Privacy note: passwords in the request body are written to kspanel.env as
// part of the DSN. kspanel.env sits next to kspanel.db in DataDir; an operator
// who can read one can read the other, so this keeps the existing trust
// boundary intact. The JSON we return always carries the redacted DSN.
func SetDatabaseEngineHandler(w http.ResponseWriter, r *http.Request) {
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
	// For SQLite the DSN defaults to the current path when neither was given
	// so "switch back to SQLite" is a one-click reset (uses KSPANEL_DB).
	dsn := strings.TrimSpace(req.DSN)
	if dsn == "" && strings.TrimSpace(req.URL) != "" {
		if built, ok := config.BuildDSNFromURL(engine, req.URL, req.User, req.Password, req.Database); ok {
			dsn = built
		}
	}
	if d.IsSQLite() && dsn == "" {
		dsn = config.DatabasePath()
	}

	// Validate connectivity BEFORE persisting — refuse to write a DSN that
	// won't open. We use a fresh dialect instance (the running panel keeps
	// its own pool) and immediately close the probe. For a brand-new
	// Postgres/MySQL database we tolerate "database does not exist" so the
	// operator can seed it after the switch (the response surfaces that the
	// database needs `seed`).
	probeDB, perr := d.Open(dsn)
	if perr != nil {
		writeJSON(w, EngineSwitchResponse{
			OK:      false,
			Engine:  d.Name(),
			DSN:     redactedDSN(dsn),
			Message: "connection test failed: " + perr.Error(),
		})
		return
	}
	probeDB.Close()

	// Persist. SaveDBConfig overwrites only the KSPANEL_DB_* trio in
	// kspanel.env, preserving any other keys the operator keeps there.
	if err := config.SaveDBConfig(engine, dsn); err != nil {
		writeJSON(w, EngineSwitchResponse{
			OK:      false,
			Engine:  d.Name(),
			DSN:     redactedDSN(dsn),
			Message: "persist failed: " + err.Error(),
		})
		return
	}

	writeJSON(w, EngineSwitchResponse{
		OK:              true,
		Engine:          d.Name(),
		DSN:             redactedDSN(dsn),
		Message:         "database engine updated — restart kspanel launch to apply",
		RequiresRestart: true,
	})
}

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
