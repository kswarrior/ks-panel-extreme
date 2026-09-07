package db

import (
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
)

//go:embed all:migrations
var migrationsFS embed.FS

// readMigrationsFile reads a file from the dialect's migrations fs. embed.FS
// surfaces as fs.FS in Go 1.21+ but the ReadFile helper moved into io/fs as
// fs.ReadFile; aliasing keeps the call site short.
func readMigrationsFile(fsys fs.FS, name string) ([]byte, error) {
	return fs.ReadFile(fsys, name)
}

// Open opens the database described by cfg using a dialect picked for the
// named engine. It returns the live *sql.DB plus the dialect so callers
// (handlers, sweeps) can ask "what engine am I on?" without re-deriving it.
//
// For SQLite the dsn is a file path (or :memory:); EnsureDir is applied
// automatically so the parent directory exists. For Postgres/MySQL the dsn
// is the engine's native connection string and the caller is responsible for
// having a reachable server.
func Open(cfg config.DBConfig) (*sql.DB, Dialect, error) {
	d, err := NewDialect(cfg.Engine)
	if err != nil {
		return nil, nil, err
	}
	if d.IsSQLite() {
		if err := EnsureDir(cfg.DSN); err != nil {
			return nil, nil, fmt.Errorf("prepare db directory: %w", err)
		}
	}
	con, err := d.Open(cfg.DSN)
	if err != nil {
		return nil, nil, err
	}
	d.ConfigurePool(con)
	return con, d, nil
}

// placeholderDialectForTesting is set by dialect-aware test helpers to override
// the engine detection without touching env vars. Production code leaves it
// empty (the factory derives the engine from config.DatabaseConfig instead).
//
// (Kept as a package-level escape hatch so test files can probe individual
// dialects without spinning up a real Postgres / MySQL server.)
var placeholderDialectForTesting Dialect

// RunMigrations executes every .sql file in the dialect's migrations subdir,
// in lexical order. Per-engine non-idempotent ALTERs are guarded at runtime:
//
//   - SQLite + MySQL have no "ALTER TABLE ADD COLUMN IF NOT EXISTS" on most
//     versions we still want to support, so the runner inspects the live
//     schema (pragma_table_info for SQLite, information_schema for MySQL)
//     and applies each guarded ALTER individually, skipping columns that
//     are already present.
//   - Postgres 9.6+ supports "ADD COLUMN IF NOT EXISTS" natively, so the
//     postgres migration files already use it and the Go guard is a no-op
//     uma that calls the same hasColumn check before applying each column
//     (idempotent either way).
//
// The guarded migrations are: 008, 009, 010, 011, 013, 014, 016, 018, 019,
// 020, 024, 025_instance_install, 025_node_allocations, 026. They alternate
// between "skip the whole file" (single ALTER the guard detects) and "skip
// individual columns within the file" (multi-ALTER file). The dispatch is
// keyed by the migration basename so the same code path runs against every
// dialect.
func RunMigrations(d Dialect, db *sql.DB) error {
	fsys := d.MigrationsFS()
	entries, err := readDir(d, fsys)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		switch {
		case name == "008_nodes_token_plain.sql":
			if hasColumn(d, db, "nodes", "token_plain") {
				log.Printf("Running migration %s (skipped: column already present)", name)
				continue
			}
		case name == "009_panel_logo.sql":
			if hasColumn(d, db, "settings", "logo_mime") && hasColumn(d, db, "settings", "logo_filename") {
				log.Printf("Running migration %s (skipped: columns already present)", name)
				continue
			}
		case name == "010_node_drivers.sql":
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"driver_docker", "INTEGER NOT NULL DEFAULT 0"},
				{"driver_kvm", "INTEGER NOT NULL DEFAULT 0"},
				{"driver_multipass", "INTEGER NOT NULL DEFAULT 0"},
				{"driver_lxd", "INTEGER NOT NULL DEFAULT 0"},
			}); err != nil {
				return err
			}
			continue
		case name == "011_node_telemetry_quality.sql":
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"hw_ram_ok", "INTEGER NOT NULL DEFAULT 0"},
				{"hw_cpu_ok", "INTEGER NOT NULL DEFAULT 0"},
				{"hw_disk_ok", "INTEGER NOT NULL DEFAULT 0"},
				{"hw_uptime_ok", "INTEGER NOT NULL DEFAULT 0"},
				{"hw_drivers_ok", "INTEGER NOT NULL DEFAULT 0"},
				{"probe_reachable", "INTEGER"},
				{"probe_seen_name", "TEXT"},
				{"probe_checked_at", d.datetimeType()},
			}); err != nil {
				return err
			}
			continue
		case name == "013_instance_owner.sql":
			if hasColumn(d, db, "instances", "owner_id") {
				log.Printf("Running migration %s (skipped: column already present)", name)
				continue
			}
		case name == "054_scope_ownership.sql":
			// Seven ALTERs in one file; guard each column so a partial
			// re-run on a host where one of the columns already landed
			// (e.g. via a manual ALTER) doesn't fail with "duplicate
			// column". Postgres uses native ADD COLUMN IF NOT EXISTS so
			// the guard is just a safety net there; on SQLite/MySQL it's
			// the only thing standing between us and a fatal error.
			cols := []struct{ table, col string }{
				{"nodes", "owner_id"},
				{"templates", "owner_id"},
				{"mods", "owner_id"},
				{"applications", "owner_id"},
				{"instance_pages", "owner_id"},
				{"themes", "owner_id"},
				{"roles", "owner_id"},
			}
			any := false
			for _, c := range cols {
				if !hasColumn(d, db, c.table, c.col) {
					any = true
					break
				}
			}
			if !any {
				log.Printf("Running migration %s (columns already present, ensuring indexes)", name)
			} else {
				for _, c := range cols {
					if hasColumn(d, db, c.table, c.col) {
						continue
					}
					if err := guardedAddColumns(d, db, name, c.table, []columnSpec{
						{"owner_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
					}); err != nil {
						return err
					}
				}
			}
			// The file body is never exec'd (every ALTER above is applied
			// individually), so own its seven owner_id lookup indexes here
			// too — otherwise the CREATE INDEX lines in the body never run
			// on any dialect (mirrors 045_application_files_runs.sql).
			// MySQL has no CREATE INDEX IF NOT EXISTS, hence the guard.
			// Indexes are ensured on every run so pre-054 installs that
			// already have the columns still converge.
			for _, c := range cols {
				idx := c.table + "_owner_idx"
				if err := guardedCreateIndex(d, db, name, c.table, idx, "owner_id"); err != nil {
					return err
				}
			}
			log.Printf("Running migration %s", name)
			continue
		case name == "014_role_display_color.sql":
			if err := guardedAddColumns(d, db, name, "roles", []columnSpec{
				{"display_name", "TEXT NOT NULL DEFAULT ''"},
				{"color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "025_role_icon.sql":
			if hasColumn(d, db, "roles", "icon") {
				log.Printf("Running migration %s (skipped: column already present)", name)
				continue
			}
		case name == "016_email_verification.sql":
			// CREATE TABLE + ALTER in the same file. The CREATE TABLE block
			// is idempotent on every dialect; the ALTER on users is guarded.
			// The evc_email_idx line is stripped and owned by the runtime
			// guard below: the mysql body carries a bare CREATE INDEX
			// (no IF NOT EXISTS), which would fail with "duplicate key
			// name" on every re-launch — mirrors 045.
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripAlterColumnLines(body, "users", "email_verified")
			stripped = stripCreateIndexLines(stripped, "evc_email_idx")
			if hasColumn(d, db, "users", "email_verified") {
				log.Printf("Running migration %s (email_verified already present, ALTER stripped)", name)
			} else {
				if err := guardedAddColumns(d, db, name, "users", []columnSpec{
					{"email_verified", "INTEGER NOT NULL DEFAULT 0"},
				}); err != nil {
					return err
				}
				log.Printf("Running migration %s", name)
			}
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "email_verification_codes", "evc_email_idx", "email"); err != nil {
				return err
			}
			continue
		case name == "018_user_profile.sql":
			if err := guardedAddColumns(d, db, name, "users", []columnSpec{
				{"display_name", "TEXT NOT NULL DEFAULT ''"},
				{"bio", "TEXT NOT NULL DEFAULT ''"},
				{"pronouns", "TEXT NOT NULL DEFAULT ''"},
				{"accent_color", "TEXT NOT NULL DEFAULT ''"},
				{"avatar_symbol", "TEXT NOT NULL DEFAULT ''"},
				{"avatar_mime", "TEXT"},
				{"avatar_filename", "TEXT"},
				{"banner_mime", "TEXT"},
				{"banner_filename", "TEXT"},
				{"social_links", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "019_node_advanced.sql":
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"health_enabled", "INTEGER NOT NULL DEFAULT 1"},
				{"health_interval", "INTEGER NOT NULL DEFAULT 60"},
				{"health_timeout", "INTEGER NOT NULL DEFAULT 4"},
				{"health_retries", "INTEGER NOT NULL DEFAULT 3"},
				{"skip_tls_verify", "INTEGER NOT NULL DEFAULT 0"},
				{"notes", "TEXT NOT NULL DEFAULT ''"},
				{"install_dir", "TEXT NOT NULL DEFAULT ''"},
				{"allowed_kinds", "TEXT NOT NULL DEFAULT ''"},
				{"probe_fail_count", "INTEGER NOT NULL DEFAULT 0"},
				{"next_probe_at", d.datetimeType()},
			}); err != nil {
				return err
			}
			continue
		case name == "020_mod_v2.sql":
			// Strip the bare engine_version ALTER from the body so a
			// re-exec doesn't trip on a duplicate column. The CREATE TABLE
			// mod_storage block is idempotent on every dialect. The
			// mod_storage_mod_idx line is stripped and owned by the
			// runtime guard below: the mysql body carries a bare
			// CREATE INDEX (no IF NOT EXISTS), which would fail with
			// "duplicate key name" on every re-launch — mirrors 055.
			if !hasColumn(d, db, "mods", "engine_version") {
				if _, err := db.Exec("ALTER TABLE mods ADD COLUMN " + addColumnIfNotExistsPrefix(d) + "engine_version INTEGER NOT NULL DEFAULT 1"); err != nil {
					return fmt.Errorf("migration %s failed: %w", name, err)
				}
			}
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripAlterColumnLines(body, "mods", "engine_version")
			stripped = stripCreateIndexLines(stripped, "mod_storage_mod_idx")
			log.Printf("Running migration %s", name)
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "mod_storage", "mod_storage_mod_idx", "mod_slug"); err != nil {
				return err
			}
			continue
		case name == "024_api_key_limits.sql":
			if err := guardedAddColumns(d, db, name, "api_keys", []columnSpec{
				{"expires_at", d.datetimeType()},
				{"rate_limit", "INTEGER"},
				{"rate_window_seconds", "INTEGER NOT NULL DEFAULT 60"},
			}); err != nil {
				return err
			}
			continue
		case name == "025_instance_install.sql":
			// Install-workflow tracking columns on instances. Deploy uses
			// these to mirror the async edge install RPC, but the file
			// originally lived at migrations/ root (outside every dialect's
			// subdir) so the runner never saw it. On a fresh DB the deploy
			// INSERT then errored with "table instances has no column named
			// install_state" and returned a plain-text HTTP 500 ("panel
			// failed to store instance"), which surfaced in the SPA as
			// "Panel origin returned HTTP 500 with a non-JSON body". Guard
			// each ALTER individually so a re-launch is idempotent
			// (mirrors 025_node_allocations.sql).
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"install_state", "TEXT NOT NULL DEFAULT ''"},
				{"install_id", "TEXT NOT NULL DEFAULT ''"},
				{"install_step", "INTEGER NOT NULL DEFAULT -1"},
				{"install_error", "TEXT NOT NULL DEFAULT ''"},
				{"install_steps_json", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "030_instance_install_kind.sql":
			// Add install_kind + install_auto_stop columns so the install
			// sweep loop can distinguish "the original template install
			// workflow" (install_kind='') from "an action invocation"
			// (install_kind='action') when a workflow completes, and decide
			// whether to stop the container afterwards based on the action's
			// auto_stop_on_exit flag. Guarded individually so re-launches
			// stay idempotent — mirrors 025_instance_install.sql.
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"install_kind", "TEXT NOT NULL DEFAULT ''"},
				{"install_auto_stop", "INTEGER NOT NULL DEFAULT 0"},
			}); err != nil {
				return err
			}
			continue
		case name == "031_instance_install_action_id.sql":
			// install_action_id names WHICH template action is in flight, so
			// the instance home-page Actions card can morph only that
			// action's button to a "Stop" button while it's running. Guarded
			// to keep re-launches idempotent — mirrors 030. (Postgres uses
			// the native ADD COLUMN IF NOT EXISTS and falls through to the
			// generic exec path.)
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"install_action_id", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "025_node_allocations.sql":
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"alloc_mem_mib", "INTEGER NOT NULL DEFAULT 0"},
				{"mem_overcommit_pct", "INTEGER NOT NULL DEFAULT 0"},
				{"alloc_disk_mib", "INTEGER NOT NULL DEFAULT 0"},
				{"disk_overcommit_pct", "INTEGER NOT NULL DEFAULT 0"},
				{"instances_dir", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "026_node_category_location.sql":
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"category", "TEXT NOT NULL DEFAULT ''"},
				{"location_country", "TEXT NOT NULL DEFAULT ''"},
				{"location_node", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "044_node_icon_color.sql":
			// Per-node display identity (icon key + accent colour, migration
			// 044). Multi-ALTER and the sqlite/mysql bodies are not
			// idempotent, so each column is added via the runtime guard —
			// mirrors 026_node_category_location.sql.
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"icon", "TEXT NOT NULL DEFAULT ''"},
				{"color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "050_node_connection_mode.sql":
			// Connection mode (direct / reverse_tunnel / both / local_port /
			// local_wss / local_both) controlling how panel and edge find
			// each other. Single column with 'direct' default so legacy rows
			// keep bidirectional behaviour.
			// MySQL's TEXT cannot carry a DEFAULT in older versions, so use
			// VARCHAR(32) there to match the dialect migration file.
			colDef := "TEXT NOT NULL DEFAULT 'direct'"
			if d.Name() == "mysql" || d.Name() == "mariadb" {
				colDef = "VARCHAR(32) NOT NULL DEFAULT 'direct'"
			}
			if err := guardedAddColumns(d, db, name, "nodes", []columnSpec{
				{"connection_mode", colDef},
			}); err != nil {
				return err
			}
			continue
		case name == "034_api_key_active.sql":
			if err := guardedAddColumns(d, db, name, "api_keys", []columnSpec{
				{"active", "INTEGER NOT NULL DEFAULT 1"},
			}); err != nil {
				return err
			}
			continue
		case name == "027_mod_source.sql":
			if err := guardedAddColumns(d, db, name, "mods", []columnSpec{
				{"source", "TEXT NOT NULL DEFAULT 'file'"},
				{"source_url", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "036_mod_package.sql":
			// .kspm zip packages: track the on-disk package byte size so the
			// admin UI can show "package: N KB" and the download handler knows
			// a real zip is present (0 == synthesize from manifest+spec).
			if err := guardedAddColumns(d, db, name, "mods", []columnSpec{
				{"package_size", "INTEGER NOT NULL DEFAULT 0"},
			}); err != nil {
				return err
			}
			continue
		case name == "037_user_suspension.sql":
			// User suspension fields (suspended, suspended_until, suspension_count, suspension_history).
			// Guarded individually so re-launches stay idempotent.
			if err := guardedAddColumns(d, db, name, "users", []columnSpec{
				{"suspended", "INTEGER NOT NULL DEFAULT 0"},
				{"suspended_until", d.datetimeType()},
				{"suspension_count", "INTEGER NOT NULL DEFAULT 0"},
				{"suspension_history", "TEXT"},
			}); err != nil {
				return err
			}
			// Create index via the dialect-aware guard: MySQL has no
			// CREATE INDEX IF NOT EXISTS, so the raw form below would
			// fail there with a syntax error — mirrors 045.
			if err := guardedCreateIndex(d, db, name, "users", "idx_users_suspended", "suspended"); err != nil {
				return err
			}
			continue
		case name == "038_instance_suspension.sql":
			// Instance suspension fields (suspended, suspended_until, suspension_count, suspension_history).
			// Guarded individually so re-launches stay idempotent.
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"suspended", "INTEGER NOT NULL DEFAULT 0"},
				{"suspended_until", d.datetimeType()},
				{"suspension_count", "INTEGER NOT NULL DEFAULT 0"},
				{"suspension_history", "TEXT"},
			}); err != nil {
				return err
			}
			// Create index via the dialect-aware guard: MySQL has no
			// CREATE INDEX IF NOT EXISTS, so the raw form below would
			// fail there with a syntax error — mirrors 045.
			if err := guardedCreateIndex(d, db, name, "instances", "idx_instances_suspended", "suspended"); err != nil {
				return err
			}
			continue
		case name == "035_instance_display.sql":
			// Instance display identity (display_name/icon/color, migration
			// 035) is multi-ALTER and the sqlite/mysql bodies are not
			// idempotent, so each column is added via the runtime guard.
			// Fresh installs converge after 007 (which does not carry these
			// columns yet); existing installs that already ran 035 skip.
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"display_name", "TEXT NOT NULL DEFAULT ''"},
				{"icon", "TEXT NOT NULL DEFAULT ''"},
				{"color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "041_instance_page_actions.sql":
			// Instance-page action definitions (a JSON array of executable
			// page actions) persisted on each instance_pages row so the
			// Studio can save/reload them and linking a page to a template
			// ships its actions into spec.pages. Guarded individually so
			// re-launches stay idempotent — mirrors 036_mod_package.sql.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"actions", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "047_instance_page_sub_pages.sql":
			// Instance-page sub-pages (a JSON array of {path,name,content_*}
			// definitions) persisted on each instance_pages row so a library
			// page like Files can carry extra routes (files/edit). Linking or
			// importing the parent expands every entry into its own spec.pages
			// row. Guarded individually so re-launches stay idempotent on all
			// dialects — mirrors 041_instance_page_actions.sql.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"sub_pages", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "048_instance_page_type.sql":
			// Instance-page type classification (API key "type", column
			// page_type): free-form flavor tag (dashboard, status, docs, …)
			// edited via the Studio settings tab's Category/Type pickers.
			// Guarded so re-launches stay idempotent on all dialects —
			// mirrors 047_instance_page_sub_pages.sql.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"page_type", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "049_instance_page_components.sql":
			// Instance-page components (a JSON array of reusable UI blocks
			// {name,type,description,content}) persisted on each instance_pages
			// row so the Studio can save/reload them and so linking a page to a
			// template ships its components into spec.pages for the runtime to
			// substitute {{component:name}} references when rendering. Guarded
			// individually so re-launches stay idempotent on all dialects —
			// mirrors 047_instance_page_sub_pages.sql.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"components", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "045_application_files_runs.sql":
			// Application script files (JSON array of {path,content}) plus
			// the application_runs history table. The ALTER is guarded per
			// dialect and the CREATE INDEX line is stripped from the verbatim
			// body (MySQL lacks CREATE INDEX IF NOT EXISTS and migrations
			// re-run every launch); both are applied through runtime guards
			// below so every engine converges idempotently — mirrors 041.
			if err := guardedAddColumns(d, db, name, "applications", []columnSpec{
				{"files", "TEXT NOT NULL DEFAULT '[]'"},
			}); err != nil {
				return err
			}
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripAlterColumnLines(body, "applications", "files")
			stripped = stripCreateIndexLines(stripped, "idx_application_runs_app")
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "application_runs", "idx_application_runs_app", "application_id"); err != nil {
				return err
			}
			continue
		case name == "051_instance_started_at.sql":
			// started_at tracks when instance last entered "running" (deploy/start/restart).
			// NULL = never started or currently stopped. Guarded so re-launches stay idempotent.
			if err := guardedAddColumns(d, db, name, "instances", []columnSpec{
				{"started_at", d.datetimeType()},
			}); err != nil {
				return err
			}
			// Backfill running rows that pre-date the column so uptime doesn't jump to 0
			// on upgrade — seed started_at from the last status transition (updated_at)
			// or creation time. Stopped rows keep NULL so they correctly show "—".
			if _, err := db.Exec(`UPDATE instances SET started_at = COALESCE(updated_at, created_at) WHERE status = 'running' AND started_at IS NULL`); err != nil {
				log.Printf("migration %s backfill failed: %v", name, err)
			}
			continue
		case name == "056_instance_page_source.sql":
			// Instance-page provenance (market / edited / studio) plus the
			// marketplace id + version the row was imported from, so the
			// library can badge market vs edited vs own pages and the
			// "resync from market links" flow knows what to refresh.
			// Guarded so re-launches stay idempotent on all dialects —
			// mirrors 049_instance_page_components.sql.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"source", "TEXT NOT NULL DEFAULT 'studio'"},
				{"market_id", "TEXT NOT NULL DEFAULT ''"},
				{"market_version", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "057_instance_page_configure.sql":
			// Instance-page configure vars (a JSON array of page-level
			// EnvVariable-style definitions) persisted on each instance_pages
			// row so the Studio can save/reload them and so linking a page
			// to a template ships its configure definitions into spec.pages
			// for the runtime and for the template editor to collect
			// per-page values (Configure button). Guarded so re-launches
			// stay idempotent on all dialects — mirrors 049.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"configure", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "055_instance_ports.sql":
			// Per-instance port allocations (host->container). The CREATE TABLE
			// is IF NOT EXISTS on every dialect, but the index line is
			// `IF NOT EXISTS` only on sqlite/postgres after regen.sh strips it
			// for mysql. Guard the index via hasIndex so the migration is
			// idempotent on every engine (mirrors 045_application_files_runs).
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripCreateIndexLines(body, "idx_instance_ports_instance")
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "instance_ports", "idx_instance_ports_instance", "instance_id"); err != nil {
				return err
			}
			continue
		case name == "059_template_icon_color.sql":
			// Per-template display identity (icon SVG + accent colour,
			// migration 059). Multi-ALTER and the sqlite/mysql bodies are
			// not idempotent, so each column is added via the runtime guard
			// — mirrors 044_node_icon_color.sql.
			if err := guardedAddColumns(d, db, name, "templates", []columnSpec{
				{"icon", "TEXT NOT NULL DEFAULT ''"},
				{"color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "060_instance_page_icon_color.sql":
			// Per-page accent colour tinting the icon tile on library cards
			// (migration 060). icon_svg already exists (032); only the colour
			// column is new. Guarded so re-launches stay idempotent.
			if err := guardedAddColumns(d, db, name, "instance_pages", []columnSpec{
				{"icon_color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "061_application_icon_color.sql":
			// Per-application accent colour (migration 061). icon already
			// exists (029); only the colour column is new. Guarded so
			// re-launches stay idempotent.
			if err := guardedAddColumns(d, db, name, "applications", []columnSpec{
				{"color", "TEXT NOT NULL DEFAULT ''"},
			}); err != nil {
				return err
			}
			continue
		case name == "062_node_wss_channels.sql":
			// Named WSS channels per node (task routing). The CREATE TABLE
			// is IF NOT EXISTS on every dialect, but the index line is
			// `IF NOT EXISTS` only on sqlite/postgres (mysql strips it).
			// Guard the index via hasIndex so the migration is idempotent
			// on every engine — mirrors 055_instance_ports.sql.
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripCreateIndexLines(body, "idx_node_wss_channels_node")
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "node_wss_channels", "idx_node_wss_channels_node", "node_id"); err != nil {
				return err
			}
			continue
		case name == "069_api_key_requests.sql":
			// API-key rate-limit ledger (key_hash + created_at rows counted by
			// CheckAPIKeyRateLimit). The CREATE TABLE is IF NOT EXISTS on every
			// dialect, but the index line is `IF NOT EXISTS` only on
			// sqlite/postgres (mysql strips it). Guard the index via hasIndex
			// so the migration is idempotent on every engine — mirrors
			// 062_node_wss_channels.sql.
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripCreateIndexLines(body, "idx_api_key_requests_hash_time")
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "api_key_requests", "idx_api_key_requests_hash_time", "key_hash, created_at"); err != nil {
				return err
			}
			continue
		case name == "065_tickets_attachments_sla_notify.sql":
			// Ticket attachments + SLA sidecar + notification prefs. The
			// CREATE TABLEs are IF NOT EXISTS on every dialect, but the
			// index lines are `IF NOT EXISTS` only on sqlite/postgres
			// (mysql strips it). Guard each index via hasIndex so the
			// migration is idempotent on every engine — mirrors
			// 062_node_wss_channels.sql.
			body, rerr := readMigrationsFile(fsys, name)
			if rerr != nil {
				return rerr
			}
			stripped := stripCreateIndexLines(body, "idx_ticket_attachments_ticket")
			stripped = stripCreateIndexLines(stripped, "idx_ticket_attachments_sha")
			if err := execMigrationBody(d, db, name, stripped); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "ticket_attachments", "idx_ticket_attachments_ticket", "ticket_id"); err != nil {
				return err
			}
			if err := guardedCreateIndex(d, db, name, "ticket_attachments", "idx_ticket_attachments_sha", "sha256"); err != nil {
				return err
			}
			continue
		}

		// Generic path: read the file and exec it statement-by-statement
		// (see execMigrationBody). One Exec per statement because the
		// MySQL driver rejects multi-statement strings without
		// multiStatements=true (which the panel never sets) and because
		// MySQL has no CREATE INDEX IF NOT EXISTS, so bare index lines
		// must be guarded per statement on re-run. Postgres files already
		// use ADD COLUMN IF NOT EXISTS so the body itself is idempotent;
		// the SQLite files shipping today are either idempotent
		// (CREATE TABLE IF NOT EXISTS + at most one guarded ALTER we already
		// short-circuited above) or pure DDL with no re-run risk.
		content, err := readMigrationsFile(fsys, name)
		if err != nil {
			return err
		}
		log.Printf("Running migration %s", name)
		if err := execMigrationBody(d, db, name, content); err != nil {
			return err
		}
	}
	return nil
}

// execMigrationBody executes one migration file statement-by-statement
// instead of a single verbatim Exec. Three reasons, one per engine:
//
//   - MySQL (go-sql-driver) rejects multi-statement strings unless the DSN
//     carries multiStatements=true, which the panel never sets — every
//     multi-statement file (e.g. 001 with five CREATE TABLEs) failed on
//     first launch with Error 1064.
//
//   - MySQL has no CREATE INDEX IF NOT EXISTS and regen.sh strips the
//     clause from the mysql files, so re-running any index-bearing file
//     failed with "Duplicate key name". Bare CREATE INDEX lines are owned
//     by the hasIndex guard below on mysql/mariadb (mirrors
//     guardedCreateIndex); sqlite/postgres keep their native IF NOT EXISTS.
//
//   - Postgres validates FK references at CREATE TABLE time while SQLite
//     allows forward references, so 001 (users before roles) failed with
//     "relation roles does not exist". Failed statements retry on later
//     passes until a full pass makes no progress — every statement in the
//     shipped corpus is idempotent (IF NOT EXISTS / OR IGNORE / guarded),
//     so a retry can never double-apply.
//
//   - Postgres has no BLOB type (BYTEA instead) but 021 ships value_blob
//     BLOB in every dialect. The statement is rewritten for postgres only,
//     mirroring what regen.sh now emits for new files; sqlite/mysql keep
//     the original text.
//
//   - MySQL rejects TEXT/BLOB columns with a DEFAULT (Error 1101) and TEXT
//     columns in any key specification without a key length (Error 1170:
//     inline UNIQUE, TEXT PRIMARY KEY, table-level PRIMARY KEY/UNIQUE over
//     TEXT, and CREATE INDEX on TEXT). The shipped mysql files predate this
//     rule (169 TEXT...DEFAULT column defs in 49 files, 9 inline TEXT
//     UNIQUEs, 4 TEXT PRIMARY KEYs, 5 table-level PK/UNIQUE constraints over
//     TEXT, 22 indexed TEXT columns) and shipped migrations are frozen, so
//     the runner rewrites the affected column definitions to VARCHAR for
//     mysql/mariadb only (rewriteTextColumnDefsForMySQL). SQLite/Postgres
//     keep TEXT (unbounded) — the VARCHAR cap (255/1024) only exists on
//     MySQL. Indexes over surviving TEXT columns (no DEFAULT/UNIQUE/PK, so
//     they stay TEXT) get a (191) prefix via qualifyIndexPrefixForMySQL.
//
//   - MySQL also requires FK columns to match the referenced column's type
//     exactly (Error 3780). regen.sh mapped every PK to BIGINT while every
//     FK column stayed INTEGER, so 001 (role_permissions.role_id INTEGER
//     -> roles.id BIGINT) fails right after the TEXT fixes. The runner maps
//     the BIGINT auto-increment PK back to INTEGER for mysql/mariadb only
//     (rewriteBigintPKForMySQL), which also re-aligns mysql with the
//     sqlite (INTEGER) and postgres (SERIAL=int4) PK types. All 38 BIGINT
//     sites in the shipped corpus are this exact PK pattern; no BIGINT FK
//     or counter column exists, so the rule is scoped to the full PK
//     phrase and cannot touch anything else.
//
// Fail-closed: when a pass resolves nothing, the FIRST statement error of
// that pass is returned with the migration name and statement index —
// later statements usually fail only as a consequence (e.g. a missing
// table its index wanted), so the last error would mask the root cause.
func execMigrationBody(d Dialect, db *sql.DB, name string, content []byte) error {
	stmts := splitSQLStatements(content)
	pending := stmts
	isMySQL := d.Name() == "mysql" || d.Name() == "mariadb"
	for pass := 0; len(pending) > 0 && pass <= len(stmts); pass++ {
		type failure struct {
			idx int
			err error
		}
		var failed []string
		var errs []failure
		progressed := false
		for i, s := range pending {
			if idx, tbl, ok := parseCreateIndex(s); ok && isMySQL {
				if hasIndex(d, db, tbl, idx) {
					progressed = true
					continue
				}
			}
			stmt := s
			if d.Name() == "postgres" {
				stmt = rewriteBlobForPostgres(stmt)
				stmt = rewriteInsertOrIgnoreForPostgres(stmt)
			}
			if isMySQL {
				stmt = rewriteBigintPKForMySQL(stmt)
				stmt = rewriteTextColumnDefsForMySQL(stmt)
				if _, tbl, ok := parseCreateIndex(stmt); ok {
					var qerr error
					stmt, qerr = qualifyIndexPrefixForMySQL(db, tbl, stmt)
					if qerr != nil {
						errs = append(errs, failure{i + 1, qerr})
						failed = append(failed, s)
						continue
					}
				}
			}
			if _, err := db.Exec(stmt); err != nil {
				errs = append(errs, failure{i + 1, err})
				failed = append(failed, s)
				continue
			}
			progressed = true
		}
		if len(failed) == 0 {
			return nil
		}
		if !progressed {
			return fmt.Errorf("migration %s statement %d failed: %w", name, errs[0].idx, errs[0].err)
		}
		pending = failed
	}
	return fmt.Errorf("migration %s failed: statements did not converge", name)
}

// rewriteBlobForPostgres swaps the standalone BLOB type token for BYTEA.
// Only the type position is touched (word-boundary match, case-insensitive
// via upper-casing a copy for search while splicing the original): string
// literals and identifiers containing "blob" (e.g. value_blob) keep their
// exact bytes. The shipped corpus holds exactly one BLOB column
// (021 value_blob); regen.sh emits BYTEA for new postgres files, so this
// rewrite only keeps the already-shipped 021 working without editing it.
func rewriteBlobForPostgres(stmt string) string {
	upper := strings.ToUpper(stmt)
	var out strings.Builder
	out.Grow(len(stmt))
	i := 0
	for i < len(stmt) {
		if isBlobTokenAt(upper, stmt, i) {
			out.WriteString("BYTEA")
			i += len("BLOB")
			continue
		}
		out.WriteByte(stmt[i])
		i++
	}
	return out.String()
}

// isBlobTokenAt reports whether upper[pos:pos+4] == "BLOB" as a standalone
// type token: outside single-quoted literals and bounded by non-identifier
// characters on both sides.
func isBlobTokenAt(upper, orig string, pos int) bool {
	if pos+4 > len(orig) || upper[pos:pos+4] != "BLOB" {
		return false
	}
	if pos > 0 && isIdentChar(orig[pos-1]) {
		return false
	}
	if pos+4 < len(orig) && isIdentChar(orig[pos+4]) {
		return false
	}
	inStr := false
	for i := 0; i < pos; i++ {
		if orig[i] == '\'' {
			if inStr && i+1 < len(orig) && orig[i+1] == '\'' {
				i++
				continue
			}
			inStr = !inStr
		}
	}
	return !inStr
}

// isIdentChar reports whether c can continue a SQL identifier (letters,
// digits, underscore, dollar sign).
func isIdentChar(c byte) bool {
	return c == '_' || c == '$' ||
		(c >= '0' && c <= '9') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= 'a' && c <= 'z')
}

// rewriteInsertOrIgnoreForPostgres converts a leading INSERT OR IGNORE
// (any whitespace/casing between keywords) into INSERT ... ON CONFLICT DO
// NOTHING, which is the idempotent form SeedCore's insertIgnorePrefix uses.
// Needed because regen.sh's sed conversion is line-scoped: single-line
// seed INSERTs (065) arrive already converted, but multi-line VALUES lists
// (029, 032, 033, 052, 064) still carry OR IGNORE and Postgres rejects
// them with a syntax error. Non-matching statements pass through
// untouched; shipped files are never modified.
func rewriteInsertOrIgnoreForPostgres(stmt string) string {
	rest := stmt
	for _, want := range []string{"INSERT", "OR", "IGNORE", "INTO"} {
		trimmed := strings.TrimLeft(rest, " \t\r\n")
		kw, after := cutKeyword(trimmed)
		if !strings.EqualFold(kw, want) || after == trimmed {
			return stmt
		}
		rest = after
	}
	return "INSERT INTO " + strings.TrimLeft(rest, " \t\r\n") + " ON CONFLICT DO NOTHING"
}

// cutKeyword splits the first whitespace-delimited token off s. It returns
// (s, s) when s holds no whitespace so callers can tell "no gap" apart
// from a real split.
func cutKeyword(s string) (kw, rest string) {
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n' {
			return s[:i], s[i+1:]
		}
	}
	return s, s
}

// rewriteBigintPKForMySQL maps the regen.sh BIGINT auto-increment PK back
// to INTEGER for mysql/mariadb only. regen.sh widened every PK to BIGINT
// while every FK column stayed INTEGER, and MySQL rejects such pairs with
// Error 3780 (incompatible columns), so without this 001 fails on
// role_permissions.role_id INTEGER -> roles.id BIGINT right after the TEXT
// fixes. Scoped to the full "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY"
// phrase (the only BIGINT shape in the shipped corpus: 38 sites, all PKs),
// matched case-insensitively outside string literals, so a future BIGINT
// counter or data column is never touched.
func rewriteBigintPKForMySQL(stmt string) string {
	mask := maskSQLLiterals(stmt)
	upper := strings.ToUpper(mask)
	const want = "BIGINT"
	var out strings.Builder
	out.Grow(len(stmt))
	i := 0
	for i < len(stmt) {
		if i+len(want) <= len(stmt) && upper[i:i+len(want)] == want &&
			(i == 0 || !isIdentChar(stmt[i-1])) &&
			(i+len(want) == len(stmt) || !isIdentChar(stmt[i+len(want)])) {
			rest := strings.ToUpper(strings.TrimLeft(mask[i+len(want):], " \t\r\n"))
			if strings.HasPrefix(rest, "NOT NULL AUTO_INCREMENT PRIMARY KEY") {
				out.WriteString("INTEGER")
				i += len(want)
				continue
			}
		}
		out.WriteByte(stmt[i])
		i++
	}
	return out.String()
}

// mysqlLongTextColumns names the TEXT columns whose runtime payload is a
// JSON blob, rendered content, captured output, or free-form user text that
// routinely exceeds 255 characters (template/instance spec, page content,
// application files, run output, ticket descriptions, ...). They map to
// VARCHAR(1024); every other rewritten TEXT column maps to VARCHAR(255),
// which covers the longest seed literal in the shipped corpus (390 chars
// into settings.value, which itself stays TEXT) and every identifier,
// enum, status, hash, slug, e-mail (RFC max 254), and token in the schema
// (edge token kse_+64 hex = 68 chars). The cap only exists on MySQL:
// SQLite/Postgres keep unbounded TEXT. Payloads beyond the cap fail loudly
// (strict-mode "Data too long"), never silently truncate.
func mysqlVarcharLen(col string) int {
	switch strings.ToLower(col) {
	case "spec", "config", "config_schema", "config_values", "files",
		"permissions", "env", "secret_refs", "metrics", "processes", "ports",
		"info", "content_html", "content_markdown", "content_blocks",
		"icon_svg", "sub_pages", "components", "configure", "actions",
		"install_steps_json", "install_error", "value", "output",
		"error_output", "stdout", "stderr", "command", "summary", "diff",
		"content", "args_json", "metadata", "message", "detail",
		"description", "bio", "notes", "social_links", "tags", "roles",
		"user_agent", "path", "last_error", "error", "target_label", "note",
		"link", "title":
		return 1024
	default:
		return 255
	}
}

// rewriteTextColumnDefsForMySQL converts exactly those TEXT column
// definitions that MySQL rejects — DEFAULT (Error 1101), inline
// UNIQUE/PRIMARY KEY (Error 1170), membership in a table-level PRIMARY
// KEY/UNIQUE constraint (Error 1170: 017 capability, 021 key, 023 name,
// 020 mod_slug/key, 067 theme_id), or FK linkage whose referenced PK was
// itself converted (inline REFERENCES or table-level FOREIGN KEY
// membership; else Error 3780: mod_storage.mod_slug -> mods.slug,
// theme_assignments.theme_id -> themes.id) — to VARCHAR(N) for
// mysql/mariadb only. Plain TEXT columns (no DEFAULT, unindexed,
// non-key) stay TEXT: they are legal on MySQL and unbounded. Matching is
// quote-aware (string literals are masked first, so a literal containing
// "TEXT DEFAULT" can never trigger a rewrite) and word-boundaried (a
// column named "context" or "latest" is safe).
func rewriteTextColumnDefsForMySQL(stmt string) string {
	mask := maskSQLLiterals(stmt)
	trimmed := strings.TrimLeft(mask, " \t\r\n(")
	upperLead := strings.ToUpper(trimmed)
	isCreate := strings.HasPrefix(upperLead, "CREATE TABLE ")
	isAlter := strings.HasPrefix(upperLead, "ALTER TABLE ")
	if !isCreate && !isAlter {
		return stmt
	}
	type span struct{ start, end int } // [start,end) offsets of the TEXT token in stmt
	var hits []span
	addHit := func(s span) { hits = append(hits, s) }

	if isAlter {
		// ALTER TABLE <t> ADD COLUMN [IF NOT EXISTS] <col> TEXT ...
		upper := strings.ToUpper(mask)
		pos := strings.Index(upper, "ADD COLUMN")
		if pos < 0 {
			return stmt
		}
		off := pos + len("ADD COLUMN")
		// Skip optional IF NOT EXISTS, then the column name: the TEXT type
		// token is the next word after those.
		restUp := strings.ToUpper(strings.TrimLeft(mask[off:], " \t\r\n"))
		if strings.HasPrefix(restUp, "IF NOT EXISTS") {
			off = indexWordToken(mask, upper, off, "EXISTS") + len("EXISTS")
		}
		for off < len(mask) && (mask[off] == ' ' || mask[off] == '\t' || mask[off] == '\r' || mask[off] == '\n') {
			off++
		}
		for off < len(mask) && mask[off] != ' ' && mask[off] != '\t' && mask[off] != '\r' && mask[off] != '\n' {
			off++ // skip the column name
		}
		textOff := indexWordToken(mask, upper, off, "TEXT")
		if textOff < 0 {
			return stmt
		}
		segUpper := strings.ToUpper(mask[pos:])
		if hasSQLKeyword(segUpper, "DEFAULT") || hasSQLKeyword(segUpper, "UNIQUE") ||
			hasSQLKeyword(segUpper, "PRIMARY KEY") || hasSQLKeyword(segUpper, "REFERENCES") {
			addHit(span{textOff, textOff + len("TEXT")})
		}
	} else {
		// CREATE TABLE: split the outer paren body into top-level segments.
		open := strings.Index(mask, "(")
		if open < 0 {
			return stmt
		}
		depth := 0
		close := -1
		for i := open; i < len(mask); i++ {
			switch mask[i] {
			case '(':
				depth++
			case ')':
				depth--
				if depth == 0 {
					close = i
					i = len(mask)
				}
			}
		}
		if close < 0 {
			return stmt
		}
		body := mask[open+1 : close]
		// First pass: collect table-level constraint columns.
		forced := map[string]bool{}
		for _, seg := range splitTopLevel(body, open+1) {
			su := strings.ToUpper(strings.TrimSpace(seg.text))
			var list string
			switch {
			case strings.HasPrefix(su, "PRIMARY KEY"):
				list = seg.text[strings.Index(strings.ToUpper(seg.text), "PRIMARY KEY")+len("PRIMARY KEY"):]
			case strings.HasPrefix(su, "UNIQUE"):
				// UNIQUE, UNIQUE KEY, UNIQUE INDEX — with or without a name.
				paren := strings.Index(seg.text, "(")
				if paren >= 0 {
					list = seg.text[paren:]
				}
			case strings.HasPrefix(su, "FOREIGN KEY"):
				paren := strings.Index(seg.text, "(")
				end := strings.Index(strings.ToUpper(seg.text), "REFERENCES")
				if paren >= 0 && end > paren {
					list = seg.text[paren:end]
				}
			case strings.HasPrefix(su, "CONSTRAINT"):
				// CONSTRAINT <name> PRIMARY KEY|UNIQUE|FOREIGN KEY ...
				up := strings.ToUpper(seg.text)
				if p := strings.Index(up, "PRIMARY KEY"); p >= 0 {
					list = seg.text[p+len("PRIMARY KEY"):]
				} else if p := strings.Index(up, "FOREIGN KEY"); p >= 0 {
					if e := strings.Index(up[p:], "REFERENCES"); e >= 0 {
						list = seg.text[p : p+e]
					}
				} else if p := strings.Index(up, "UNIQUE"); p >= 0 {
					if q := strings.Index(seg.text[p:], "("); q >= 0 {
						list = seg.text[p+q:]
					}
				}
			default:
				continue
			}
			for _, c := range splitTopLevel(strings.TrimSpace(trimParens(list)), 0) {
				if nm := strings.ToLower(unquoteIdent(strings.TrimSpace(c.text))); nm != "" {
					forced[nm] = true
				}
			}
		}
		// Second pass: column definitions of shape "<col> <TYPE> ...".
		// The type-token test (not a prefix test) decides: a column literally
		// named "key" (permissions.key, instance_secrets.key) must NOT be
		// mistaken for a KEY table constraint.
		for _, seg := range splitTopLevel(body, open+1) {
			words := splitSQLWords(seg.text)
			if len(words) < 2 || !isColumnTypeName(words[1]) {
				continue
			}
			col := strings.ToLower(unquoteIdent(words[0]))
			if col == "" {
				continue
			}
			if !strings.EqualFold(words[1], "TEXT") {
				continue // non-TEXT column: legal on MySQL as-is
			}
			segUp := strings.ToUpper(seg.text)
			if forced[col] || hasSQLKeyword(segUp, "DEFAULT") ||
				hasSQLKeyword(segUp, "UNIQUE") || hasSQLKeyword(segUp, "PRIMARY KEY") ||
				hasSQLKeyword(segUp, "REFERENCES") {
				// Offset of the TEXT token: seg.start + len(col token) + gap.
				// Re-find word-boundaried TEXT at/after the column name.
				colEnd := seg.start + strings.Index(seg.text, words[0]) + len(words[0])
				textOff := indexWordToken(mask, strings.ToUpper(mask), colEnd, "TEXT")
				if textOff >= 0 && textOff < seg.start+len(seg.text) {
					addHit(span{textOff, textOff + len("TEXT")})
				}
			}
		}
	}
	if len(hits) == 0 {
		return stmt
	}
	// Sort by start offset, then splice back-to-front via a forward rebuild;
	// N is resolved per column from the name preceding the TEXT token.
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].start < hits[j-1].start; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
	var out strings.Builder
	out.Grow(len(stmt) + len(hits)*8)
	pos := 0
	for _, h := range hits {
		// Column name precedes the TEXT token: last word before h.start.
		nm := lastWordBefore(mask, h.start)
		n := mysqlVarcharLen(unquoteIdent(nm))
		out.WriteString(stmt[pos:h.start])
		fmt.Fprintf(&out, "VARCHAR(%d)", n)
		pos = h.end
	}
	out.WriteString(stmt[pos:])
	return out.String()
}

// isColumnTypeName reports whether tok is a column type name (with or
// without a parenthesised length, e.g. "TEXT" or "VARCHAR(255)").
func isColumnTypeName(tok string) bool {
	if i := strings.Index(tok, "("); i >= 0 {
		tok = tok[:i]
	}
	switch strings.ToUpper(tok) {
	case "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
		"BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB",
		"INTEGER", "INT", "BIGINT", "SMALLINT", "SERIAL",
		"VARCHAR", "CHAR", "CHARACTER",
		"DATETIME", "TIMESTAMP", "DATE", "TIME",
		"REAL", "FLOAT", "DOUBLE", "NUMERIC", "DECIMAL",
		"BOOLEAN", "BOOL", "BYTEA":
		return true
	}
	return false
}

// maskSQLLiterals blanks single-quoted literals ('' = escaped quote) with
// spaces, preserving length so offsets into the mask match the original.
// Keyword/regex searches run on the mask; splices apply to the original.
func maskSQLLiterals(s string) string {
	b := []byte(s)
	inStr := false
	for i := 0; i < len(b); i++ {
		if b[i] == '\'' {
			if inStr && i+1 < len(b) && b[i+1] == '\'' {
				b[i] = ' '
				b[i+1] = ' '
				i++
				continue
			}
			inStr = !inStr
			b[i] = ' '
			continue
		}
		if inStr {
			b[i] = ' '
		}
	}
	return string(b)
}

// hasSQLKeyword reports a word-boundary (non-identifier-char) match of kw
// (which may itself contain a single space, e.g. "PRIMARY KEY") in the
// already-masked, already-uppercased segment.
func hasSQLKeyword(maskedUpper, kw string) bool {
	for i := 0; ; {
		p := strings.Index(maskedUpper[i:], kw)
		if p < 0 {
			return false
		}
		p += i
		// Boundary = non-identifier char on both sides (space counts, so
		// "PRIMARY KEY" matches inside "... NOT NULL PRIMARY KEY ...").
		leftOK := p == 0 || !isIdentChar(maskedUpper[p-1])
		rightOK := p+len(kw) >= len(maskedUpper) || !isIdentChar(maskedUpper[p+len(kw)])
		if leftOK && rightOK {
			return true
		}
		i = p + 1
	}
}

// segText pairs a top-level comma segment with its offset in the mask.
type segText struct {
	text  string
	start int
}

// splitTopLevel splits s on commas at paren depth 0 (mask: no literals).
func splitTopLevel(s string, base int) []segText {
	var out []segText
	depth := 0
	cur := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				out = append(out, segText{s[cur:i], base + cur})
				cur = i + 1
			}
		}
	}
	out = append(out, segText{s[cur:], base + cur})
	return out
}

// splitSQLWords splits on ASCII whitespace.
func splitSQLWords(s string) []string {
	return strings.Fields(s)
}

// indexWordToken finds kw (already uppercase) in upper at/after `from` with
// identifier-char boundaries on both sides; -1 when absent.
func indexWordToken(mask, upper string, from int, kw string) int {
	for i := from; i+len(kw) <= len(upper); i++ {
		if upper[i:i+len(kw)] != kw {
			continue
		}
		if i > 0 && isIdentChar(mask[i-1]) {
			continue
		}
		if i+len(kw) < len(mask) && isIdentChar(mask[i+len(kw)]) {
			continue
		}
		return i
	}
	return -1
}

// trimParens strips one surrounding paren pair.
func trimParens(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '(' && s[len(s)-1] == ')' {
		return s[1 : len(s)-1]
	}
	return s
}

// lastWordBefore returns the last whitespace-delimited token ending at/before off.
func lastWordBefore(mask string, off int) string {
	i := off - 1
	for i >= 0 && (mask[i] == ' ' || mask[i] == '\t' || mask[i] == '\r' || mask[i] == '\n') {
		i--
	}
	end := i + 1
	for i >= 0 && mask[i] != ' ' && mask[i] != '\t' && mask[i] != '\r' && mask[i] != '\n' && mask[i] != '(' && mask[i] != ',' {
		i--
	}
	if end <= i+1 {
		return ""
	}
	return mask[i+1 : end]
}

// qualifyIndexPrefixForMySQL appends a (191) prefix length to every
// TEXT/BLOB-family column of a CREATE INDEX statement, per the live
// information_schema column types (table_schema = DATABASE()). MySQL
// rejects TEXT/BLOB in a key spec without a length (Error 1170); 191 chars
// x utf8mb4 = 764 bytes fits even the legacy 767-byte prefix limit, and a
// non-unique index is only an access path so the prefix changes no query
// semantics. VARCHAR/INTEGER/DATETIME columns pass through untouched.
// Fail-closed: a lookup error is returned (migration fails loudly); an
// unknown table (zero rows — index ordered before its table this pass)
// returns the statement unchanged so the existing retry loop defers it to
// a later pass instead of misfiring.
func qualifyIndexPrefixForMySQL(db *sql.DB, table, stmt string) (string, error) {
	cols, ok := parseCreateIndexColumns(stmt)
	if !ok || len(cols) == 0 {
		return stmt, nil
	}
	rows, err := db.Query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`, table)
	if err != nil {
		return "", fmt.Errorf("mysql index prefix lookup for %s failed: %w", table, err)
	}
	defer rows.Close()
	types := map[string]string{}
	for rows.Next() {
		var cname, dtype string
		if err := rows.Scan(&cname, &dtype); err != nil {
			return "", fmt.Errorf("mysql index prefix lookup for %s failed: %w", table, err)
		}
		types[strings.ToLower(cname)] = strings.ToLower(dtype)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("mysql index prefix lookup for %s failed: %w", table, err)
	}
	if len(types) == 0 {
		return stmt, nil
	}
	needsPrefix := func(col string) bool {
		switch types[strings.ToLower(col)] {
		case "tinytext", "text", "mediumtext", "longtext",
			"tinyblob", "blob", "mediumblob", "longblob":
			return true
		}
		return false
	}
	changed := false
	for i, c := range cols {
		base, dir := splitIndexDir(c.text)
		if base == "" || !needsPrefix(base) {
			continue
		}
		if strings.Contains(c.text, "(") {
			continue // already has an explicit prefix length
		}
		cols[i].text = c.text[:len(c.text)-len(dir)] + "(191)" + dir
		changed = true
	}
	if !changed {
		return stmt, nil
	}
	open := strings.LastIndex(stmt, "(")
	close := strings.LastIndex(stmt, ")")
	if open < 0 || close < 0 || close < open {
		return stmt, nil
	}
	var b strings.Builder
	b.Grow(len(stmt) + len(cols)*6)
	b.WriteString(stmt[:open+1])
	for i, c := range cols {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(c.text)
	}
	b.WriteString(stmt[close:])
	return b.String(), nil
}

// parseCreateIndexColumns extracts the raw column expressions of a CREATE
// [UNIQUE] INDEX statement (ok=false for anything else). Quoting and
// ASC/DESC suffixes are preserved for re-emission; splitIndexDir strips
// them for type lookup.
func parseCreateIndexColumns(stmt string) ([]segText, bool) {
	open := strings.LastIndex(stmt, "(")
	close := strings.LastIndex(stmt, ")")
	if open < 0 || close < 0 || close < open {
		return nil, false
	}
	head := strings.ToUpper(strings.TrimSpace(stmt[:open]))
	if !strings.Contains(head, "INDEX") || !strings.Contains(head, " ON ") {
		return nil, false
	}
	cols := splitTopLevel(stmt[open+1:close], open+1)
	for i := range cols {
		cols[i].text = strings.TrimSpace(cols[i].text)
	}
	return cols, true
}

// splitIndexDir splits "col DESC" into ("col", " DESC"); plain "col" into
// ("col", ""). The base keeps its original quoting for re-emission.
func splitIndexDir(expr string) (base, dir string) {
	up := strings.ToUpper(strings.TrimSpace(expr))
	for _, suffix := range []string{" DESC", " ASC"} {
		if strings.HasSuffix(up, suffix) {
			cut := strings.TrimSpace(expr[:len(expr)-len(suffix)])
			return unquoteIdent(cut), expr[len(cut):]
		}
	}
	return unquoteIdent(strings.TrimSpace(expr)), ""
}

// splitSQLStatements cuts a migration body into individual statements. Line
// comments (--) are stripped quote-aware first — header comments carry
// semicolons that must not split — then the body is cut on semicolons
// outside single-quoted literals (” is the escaped quote). Empty fragments
// are dropped so stray comment-only tails never reach the driver (pgx
// rejects empty queries). Verified against the shipped corpus: no
// semicolons inside string literals, no -- inside literals, no
// triggers/procedures — a future migration adding any of those must extend
// this splitter, not work around it.
func splitSQLStatements(content []byte) []string {
	lines := strings.Split(string(content), "\n")
	for i, ln := range lines {
		lines[i] = cutLineComment(ln)
	}
	body := strings.Join(lines, "\n")
	var out []string
	var cur strings.Builder
	inStr := false
	for i := 0; i < len(body); i++ {
		c := body[i]
		if c == '\'' {
			if inStr && i+1 < len(body) && body[i+1] == '\'' {
				cur.WriteByte(c)
				cur.WriteByte(body[i+1])
				i++
				continue
			}
			inStr = !inStr
			cur.WriteByte(c)
			continue
		}
		if c == ';' && !inStr {
			if s := strings.TrimSpace(cur.String()); s != "" {
				out = append(out, s)
			}
			cur.Reset()
			continue
		}
		cur.WriteByte(c)
	}
	if s := strings.TrimSpace(cur.String()); s != "" {
		out = append(out, s)
	}
	return out
}

// cutLineComment removes a -- comment suffix outside single-quoted
// literals (” is the escaped quote). All -- occurrences in the shipped
// corpus are real comment starts; the quote tracking keeps a future
// literal containing -- intact.
func cutLineComment(ln string) string {
	inStr := false
	for i := 0; i+1 < len(ln); i++ {
		if ln[i] == '\'' {
			if inStr && ln[i+1] == '\'' {
				i++
				continue
			}
			inStr = !inStr
			continue
		}
		if !inStr && ln[i] == '-' && ln[i+1] == '-' {
			return ln[:i]
		}
	}
	return ln
}

// parseCreateIndex extracts (index, table) from a CREATE [UNIQUE] INDEX
// statement, tolerating the optional IF NOT EXISTS clause and
// double-quote/backtick/bracket quoting. ok=false for anything else so the
// caller falls through to a plain Exec.
func parseCreateIndex(stmt string) (index, table string, ok bool) {
	upper := strings.ToUpper(strings.TrimSpace(stmt))
	if !strings.HasPrefix(upper, "CREATE ") || !strings.Contains(upper, " INDEX ") {
		return "", "", false
	}
	rest := strings.TrimSpace(stmt[len("CREATE "):])
	if strings.HasPrefix(strings.ToUpper(rest), "UNIQUE ") {
		rest = strings.TrimSpace(rest[len("UNIQUE "):])
	}
	if !strings.HasPrefix(strings.ToUpper(rest), "INDEX ") {
		return "", "", false
	}
	rest = strings.TrimSpace(rest[len("INDEX "):])
	if strings.HasPrefix(strings.ToUpper(rest), "IF NOT EXISTS ") {
		rest = strings.TrimSpace(rest[len("IF NOT EXISTS "):])
	}
	onPos := strings.Index(strings.ToUpper(rest), " ON ")
	if onPos < 0 {
		return "", "", false
	}
	index = unquoteIdent(strings.TrimSpace(rest[:onPos]))
	after := strings.TrimSpace(rest[onPos+len(" ON "):])
	paren := strings.Index(after, "(")
	if paren < 0 {
		return "", "", false
	}
	table = unquoteIdent(strings.TrimSpace(after[:paren]))
	if index == "" || table == "" {
		return "", "", false
	}
	return index, table, true
}

// unquoteIdent strips one layer of double-quote/backtick/bracket quoting
// from an identifier spliced out of a CREATE INDEX statement.
func unquoteIdent(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') ||
			(s[0] == '`' && s[len(s)-1] == '`') ||
			(s[0] == '[' && s[len(s)-1] == ']') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// columnSpec pairs a column name with the type/clause a guarded ALTER should
// carry when the column is absent.
type columnSpec struct {
	name string
	def  string
}

// guardedAddColumns walks each column in spec, skipping ones that already
// exist in `table`. For each missing column it issues a single ALTER TABLE;
// on dialects that support ADD COLUMN IF NOT EXISTS it uses that form (so a
// racing migration that landed a ms ago is a no-op), on dialects that
// do not it relies on the hasColumn pre-check.
//
// MySQL mapping: a TEXT column with a DEFAULT is illegal (Error 1101), so
// for mysql/mariadb the leading TEXT of such a spec is rewritten to
// VARCHAR(N) with the same tier rule the file-statement rewrite uses
// (mysqlVarcharLen). Specs that already carry VARCHAR (e.g. 050's
// VARCHAR(32)) pass through untouched; plain TEXT without DEFAULT stays
// TEXT.
func guardedAddColumns(d Dialect, db *sql.DB, name, table string, spec []columnSpec) error {
	prefix := addColumnIfNotExistsPrefix(d)
	isMySQL := d.Name() == "mysql" || d.Name() == "mariadb"
	for _, c := range spec {
		if hasColumn(d, db, table, c.name) {
			continue
		}
		def := c.def
		if isMySQL {
			def = mysqlGuardedColumnDef(c.name, def)
		}
		stmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s%s %s", table, prefix, c.name, def)
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
	}
	log.Printf("Running migration %s", name)
	return nil
}

// mysqlGuardedColumnDef rewrites a guarded ALTER column definition for
// mysql/mariadb: leading TEXT with a DEFAULT becomes VARCHAR(N) (Error
// 1101 otherwise). Anything else (INTEGER, DATETIME, already-VARCHAR,
// plain TEXT) is returned unchanged.
func mysqlGuardedColumnDef(col, def string) string {
	trimmed := strings.TrimLeft(def, " \t\r\n")
	if len(trimmed) < len("TEXT") || !strings.EqualFold(trimmed[:len("TEXT")], "TEXT") {
		return def
	}
	if after := trimmed[len("TEXT"):]; after != "" && isIdentChar(after[0]) {
		return def
	}
	maskedUpper := strings.ToUpper(maskSQLLiterals(def))
	if !hasSQLKeyword(maskedUpper, "DEFAULT") {
		return def
	}
	return fmt.Sprintf("VARCHAR(%d)%s", mysqlVarcharLen(col), trimmed[len("TEXT"):])
}

// addColumnIfNotExistsPrefix returns "IF NOT EXISTS " for dialectics that
// support the clause natively, and "" for ones that rely on the runtime
// hasColumn guard to skip already-applied columns.
func addColumnIfNotExistsPrefix(d Dialect) string {
	if d.Name() == "postgres" {
		return "IF NOT EXISTS "
	}
	return ""
}

// readDir reads the dialect's migrations fs and returns the entries in
// lexical order. SQLite's pure-Go driver handles sub-paths embedded via
// //go:embed just fine through fs.FS / fs.Sub, but a defensive fallback
// returns the root listing when the dialect's subdir is empty.
func readDir(d Dialect, fsys fs.FS) ([]fs.DirEntry, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, err
	}
	// Sort isn't needed — ReadDir returns entries in lexical order on the
	// embed.FS implementation we use.
	return entries, nil
}

// hasColumn reports whether the table already contains the named column.
// SQLite uses PRAGMA table_info; Postgres / MySQL introspect
// information_schema.columns. The result is used to skip guarded ALTERs so
// a database created from a partially-applied migration set converges
// cleanly without "duplicate column name" errors.
func hasColumn(d Dialect, db *sql.DB, table, column string) bool {
	var q string
	var rows *sql.Rows
	var err error
	switch d.Name() {
	case "sqlite":
		var cnt int
		err = db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, table, column).Scan(&cnt)
		if err != nil {
			return false
		}
		return cnt > 0
	case "postgres":
		q = `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`
	case "mysql", "mariadb":
		q = `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`
	default:
		return false
	}
	rows, err = db.Query(q, table, column)
	if err != nil {
		return false
	}
	defer rows.Close()
	var cnt int
	for rows.Next() {
		if err := rows.Scan(&cnt); err != nil {
			return false
		}
	}
	return cnt > 0
}

// stripAlterColumnLines removes bare
//
//	ALTER TABLE <table> ADD COLUMN <column> ...
//
// statements from a migration body so the runtime-guarded ALTER (which we
// run manually, since SQLite + MySQL have no ADD COLUMN IF NOT EXISTS) does
// not collide with the same statement when the file is exec'd. Only lines
// matching the exact (table, column) pair are removed; trailing CREATE TABLE
// / index statements are left intact. A trailing \r is stripped so CRLF
// edited files behave identically.
func stripAlterColumnLines(content []byte, table, column string) []byte {
	lines := strings.Split(string(content), "\n")
	out := make([]string, 0, len(lines))
	needle := strings.ToUpper("ALTER TABLE " + table + " ADD COLUMN")
	wantCol := strings.ToUpper(column)
	for _, ln := range lines {
		trim := strings.TrimSpace(strings.TrimRight(ln, "\r"))
		upper := strings.ToUpper(trim)
		if strings.HasPrefix(upper, needle) {
			if strings.Contains(upper, wantCol) {
				continue
			}
		}
		out = append(out, ln)
	}
	return []byte(strings.Join(out, "\n"))
}

// stripCreateIndexLines removes every CREATE INDEX line naming indexName so
// the guardedCreateIndex runtime check below owns that statement (MySQL has
// no CREATE INDEX IF NOT EXISTS and migrations re-run on every launch).
func stripCreateIndexLines(content []byte, indexName string) []byte {
	lines := strings.Split(string(content), "\n")
	out := make([]string, 0, len(lines))
	needle := strings.ToUpper("CREATE INDEX")
	wantIdx := strings.ToUpper(indexName)
	for _, ln := range lines {
		trim := strings.TrimSpace(strings.TrimRight(ln, "\r"))
		upper := strings.ToUpper(trim)
		if strings.HasPrefix(upper, needle) && strings.Contains(upper, wantIdx) {
			continue
		}
		out = append(out, ln)
	}
	return []byte(strings.Join(out, "\n"))
}

// guardedCreateIndex creates one index when absent, dialect-aware:
// sqlite_master for SQLite, pg_indexes for Postgres and
// information_schema.statistics for MySQL — mirroring hasColumn's shape.
// On mysql/mariadb, TEXT/BLOB-family columns get a (191) prefix length via
// qualifyIndexPrefixForMySQL (Error 1170 otherwise); the prefix only
// affects the access path of these non-unique indexes, never results.
func guardedCreateIndex(d Dialect, db *sql.DB, migration, table, indexName, column string) error {
	if hasIndex(d, db, table, indexName) {
		return nil
	}
	stmt := fmt.Sprintf("CREATE INDEX %s ON %s(%s)", indexName, table, column)
	if d.Name() == "mysql" || d.Name() == "mariadb" {
		var qerr error
		stmt, qerr = qualifyIndexPrefixForMySQL(db, table, stmt)
		if qerr != nil {
			return fmt.Errorf("migration %s failed: %w", migration, qerr)
		}
	}
	if _, err := db.Exec(stmt); err != nil {
		return fmt.Errorf("migration %s failed: %w", migration, err)
	}
	return nil
}

// hasIndex reports whether the named index already exists on the table.
// Same fail-closed convention as hasColumn: any introspection error returns
// false, and the subsequent CREATE INDEX surfaces a duplicate-name failure
// loudly instead of silently skipping.
func hasIndex(d Dialect, db *sql.DB, table, index string) bool {
	var q string
	var err error
	switch d.Name() {
	case "sqlite":
		var cnt int
		err = db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name = ?`, index).Scan(&cnt)
		if err != nil {
			return false
		}
		return cnt > 0
	case "postgres":
		q = `SELECT COUNT(*) FROM pg_indexes WHERE tablename = $1 AND indexname = $2`
	case "mysql", "mariadb":
		q = `SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`
	default:
		return false
	}
	var cnt int
	if err = db.QueryRow(q, table, index).Scan(&cnt); err != nil {
		return false
	}
	return cnt > 0
}

// EnsureSchemaAndSeed brings the database up to date for the given dialect:
// it runs every pending migration and then idempotently seeds permissions,
// roles, and role-permission links. Designed to be called from `launch` so
// the server always serves a schema that matches the code — new permissions
// added between releases are automatically picked up and granted to the
// admin role without requiring a manual `kspanel seed` run.
func EnsureSchemaAndSeed(d Dialect, db *sql.DB) error {
	if err := RunMigrations(d, db); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := SeedCore(d, db); err != nil {
		return fmt.Errorf("seed core: %w", err)
	}
	if err := SeedDefaultApplications(d, db); err != nil {
		return fmt.Errorf("seed default applications: %w", err)
	}
	return nil
}

// EnsureDir creates the directory for the SQLite file if it doesn't exist
// yet. For non-SQLite engines this is a no-op (their DSNs don't map to a
// single file path). The `Open` call itself won't create missing folders,
// so this avoids a confusing "unable to open database file" on first launch.
func EnsureDir(dbPath string) error {
	if dir := path.Dir(dbPath); dir != "" && dir != "." {
		return os.MkdirAll(dir, 0o755)
	}
	return nil
}

// insertIgnorePrefix returns the prefix a dialect uses for an idempotent
// INSERT. SQLite + MySQL use "INSERT OR IGNORE" / "INSERT IGNORE",
// Postgres uses plain INSERT plus an `ON CONFLICT DO NOTHING` clause (which
// the caller has to append — the helper only handles the prefix side of
// the swap).
func insertIgnorePrefix(d Dialect) (prefix, suffix string) {
	switch d.Name() {
	case "postgres":
		return "INSERT INTO", "ON CONFLICT DO NOTHING"
	default:
		return d.insertIgnoreKeyword() + " INTO", ""
	}
}

// SeedCore inserts default roles, permissions, and an admin user if needed.
// The seeded roles follow a fixed logical order used by the CLI:
//
//	1 -> admin     (full access)
//	2 -> moderator (limited admin access)
//	3 -> user      (basic access)
//
// The INSERT statements use the dialect's idempotent form so SeedCore is
// safe to re-run after every launch (every permission seed lands via
// INSERT OR IGNORE / ON CONFLICT DO NOTHING; backfill UPDATEs only touch
// empty rows so they no-op on a fully-seeded install).
func SeedCore(d Dialect, db *sql.DB) error {
	prefix, suffix := insertIgnorePrefix(d)
	pgConflict := ""
	if suffix != "" {
		// For Postgres ONLY we need ON CONFLICT DO NOTHING appended to each
		// INSERT. For SQLite/MySQL the keyword (OR IGNORE / IGNORE) handles
		// idempotency in the prefix, so leave the suffix empty.
		pgConflict = " " + suffix
	}

	// Page-level capability keys (the umbrella MANAGE_* group + granular
	// CRUD verbs). Every page in the panel maps to one of these keys.
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('VIEW_INSTANCES', 'View instances page'),
		('VIEW_ACCOUNT', 'View own account page'),
		('ACCESS_ADMIN_PANEL', 'Open the admin area'),
		('MANAGE_USERS', 'Manage users (list/create/edit/delete)'),
		('MANAGE_ROLES', 'Manage roles & their permissions'),
		('VIEW_SETTINGS', 'View the settings page'),
		('MANAGE_API_KEYS', 'Create and manage API keys'),
		('MANAGE_NODES', 'Manage edge nodes (register, edit, remove)'),
		('MANAGE_TEMPLATES', 'Manage deployment templates (docker/lxd/kvm/multipass)'),
		('MANAGE_INSTANCES', 'Deploy and control instances on edge nodes'),
		('MANAGE_THEMES', 'Manage the theme system (umbrella key – enables the theme surface for a role)'),
		('MANAGE_MODS', 'Upload, edit and activate/deactivate Mods (panel add-ons)'),
		('MANAGE_APPLICATIONS', 'Manage the Applications catalog (upload, edit, activate/deactivate)'),
		('USE_APPLICATIONS', 'Install and run user-level Applications (bots, services)'),
		('USE_LOCAL_THEMES', 'Use personal (browser) themes and assign them to pages for yourself'),
		('CREATE_LOCAL_THEMES', 'Create new personal (browser localStorage) themes in the Theme Studio'),
		('USE_GLOBAL_THEMES', 'Assign an existing GLOBAL theme to a page / area (affects everyone)'),
		('CREATE_GLOBAL_THEMES', 'Publish new GLOBAL themes onto the server (every user sees them)'),
		('EDIT_THEMES', 'Rename / re-spec existing themes in the Theme Studio'),
		('ASSIGN_THEMES', 'Bind a theme to a page or an area (the "Apply to" action)')`, "permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('USERS_VIEW', 'View the users list (admin area)'),
		('USERS_CREATE', 'Create a new user account'),
		('USERS_EDIT', 'Edit an existing user account'),
		('USERS_DELETE', 'Delete a user account'),
		('ROLES_VIEW', 'View the roles list'),
		('ROLES_CREATE', 'Create a new role'),
		('ROLES_EDIT', 'Edit an existing role and its permissions'),
		('ROLES_DELETE', 'Delete a role'),
		('NODES_VIEW', 'View the edge nodes list'),
		('NODES_CREATE', 'Register a new edge node'),
		('NODES_EDIT', 'Edit an existing edge node'),
		('NODES_DELETE', 'Remove an edge node'),
		('TEMPLATES_VIEW', 'View deployment templates'),
		('TEMPLATES_CREATE', 'Create a new deployment template'),
		('TEMPLATES_EDIT', 'Edit an existing deployment template'),
		('TEMPLATES_DELETE', 'Delete a deployment template'),
		('INSTANCES_VIEW', 'View instances (admin)'),
		('INSTANCES_CREATE', 'Deploy a new instance'),
		('INSTANCES_EDIT', 'Start / stop an existing instance'),
		('INSTANCES_DELETE', 'Destroy an instance'),
		('API_KEYS_VIEW', 'View all API keys (admin)'),
		('API_KEYS_CREATE', 'Create an API key on behalf of any user'),
		('API_KEYS_EDIT', 'Edit an API key'),
		('API_KEYS_DELETE', 'Revoke an API key'),
		('MODS_VIEW', 'View the installed Mods list'),
		('MODS_CREATE', 'Upload a new Mod package'),
		('MODS_EDIT', 'Edit a Mod and approve its requested capabilities'),
		('MODS_DELETE', 'Remove a Mod package'),
		('APPLICATIONS_VIEW', 'View the Applications catalog'),
		('APPLICATIONS_CREATE', 'Add a new Application to the catalog'),
		('APPLICATIONS_EDIT', 'Edit an Application and approve its requested capabilities'),
		('APPLICATIONS_DELETE', 'Remove an Application from the catalog'),
		('SETTINGS_VIEW', 'View the panel settings page'),
		('SETTINGS_EDIT', 'Change panel settings and upload logo')`, "permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('ACCOUNT_EDIT_BANNER', 'Upload / replace / remove the profile banner image'),
		('ACCOUNT_EDIT_ABOUT', 'Edit the About Me bio, display name and pronouns'),
		('ACCOUNT_EDIT_ACCENT', 'Change the profile accent colour'),
		('ACCOUNT_USE_AVATAR_SYMBOL', 'Pick a default avatar symbol when no picture is uploaded'),
		('ACCOUNT_UPLOAD_AVATAR', 'Upload / replace / remove the avatar image')`, "permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('MANAGE_TICKETS', 'Manage tickets (support system umbrella – view, create, edit, delete)'),
		('TICKETS_VIEW',   'View tickets (list + detail)'),
		('TICKETS_CREATE', 'Create new tickets'),
		('TICKETS_EDIT',   'Edit tickets, change status/priority, assign, reply'),
		('TICKETS_DELETE', 'Delete tickets and comments')`, "permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('MANAGE_PANEL_UPDATE', 'Check for and apply panel updates (downloads a new binary, replaces the running one and restarts the panel)')`, "permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('MANAGE_NOTIFICATIONS', 'Manage notifications (broadcast announcements, send to user, admin ops)'),
		('NOTIFICATIONS_VIEW',   'View notifications (list + detail)'),
		('NOTIFICATIONS_CREATE', 'Create notifications / broadcast announcements'),
		('NOTIFICATIONS_EDIT',   'Mark notifications read / update'),
		('NOTIFICATIONS_DELETE', 'Delete notifications'),
		('AI_CHAT_USE', 'Chat with the panel-wide AI assistant (umbrella – full AI Chat access)'),
		('AI_CHAT_QA', 'AI Chat Q&A – basic questions + docs, no fleet tools'),
		('AI_CHAT_TOOLS', 'AI Chat Tools – fleet read tools (instances, nodes, templates, status)'),
		('AI_CHAT_WRITES', 'AI Chat Writes – propose + approve write tickets (needs allow_writes + area permission)'),
		('AI_CHAT_THREADS', 'AI Chat Threads – manage own chat threads + history')`, "permissions")); err != nil {
		return err
	}
	// Ownership-scope keys — Own vs All per area. Each regulatable group gains
	// two scope keys that decide whether an actor may touch only their own
	// resources (OWN) or any resource (ALL). They are seeded here so the admin
	// role automatically acquires them (admin gets every permission) and the
	// Roles form can render the Own/All toggles for every group.
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(key, description) VALUES
		('USERS_OWN', 'Users — only own user (view/edit/delete own profile, limited admin)'),
		('USERS_ALL', 'Users — any user (full admin over all accounts)'),
		('ROLES_OWN', 'Roles — only own role (view own role)'),
		('ROLES_ALL', 'Roles — any role (full admin over all roles)'),
		('NODES_OWN', 'Nodes — only own nodes (visibility scoped to owned)'),
		('NODES_ALL', 'Nodes — any node (full admin over all nodes)'),
		('TEMPLATES_OWN', 'Templates — only own templates'),
		('TEMPLATES_ALL', 'Templates — any template'),
		('INSTANCES_OWN', 'Instances — only own instances (view/create/edit/delete scoped to owned)'),
		('INSTANCES_ALL', 'Instances — any instance (full admin over entire fleet)'),
		('API_KEYS_OWN', 'API Keys — only own keys'),
		('API_KEYS_ALL', 'API Keys — any key (admin over all users keys)'),
		('MODS_OWN', 'Mods — only own mods'),
		('MODS_ALL', 'Mods — any mod'),
		('APPLICATIONS_OWN', 'Applications — only own apps'),
		('APPLICATIONS_ALL', 'Applications — any application'),
		('INSTANCE_PAGES_OWN', 'Instance Pages — only own pages'),
		('INSTANCE_PAGES_ALL', 'Instance Pages — any page'),
		('TICKETS_OWN', 'Tickets — only own tickets (created by / assigned to self)'),
		('TICKETS_ALL', 'Tickets — any ticket'),
		('NOTIFICATIONS_OWN', 'Notifications — only own notifications'),
		('NOTIFICATIONS_ALL', 'Notifications — any notification (broadcast)'),
		('SETTINGS_OWN', 'Settings — only own settings scope (no effect, placeholder)'),
		('SETTINGS_ALL', 'Settings — any settings'),
		('THEMES_OWN', 'Themes — only own themes'),
		('THEMES_ALL', 'Themes — any theme'),
		('ACCOUNT_OWN', 'Account — only own account'),
		('ACCOUNT_ALL', 'Account — any account')`, "permissions")); err != nil {
		return err
	}
	// Keep the MANAGE_THEMES description current on legacy installs.
	if _, err := db.Exec(`UPDATE permissions SET description = 'Manage the theme system (umbrella key – enables the theme surface for a role)' WHERE key = 'MANAGE_THEMES'`); err != nil {
		return err
	}
	// Default roles, in deterministic INSERT order (preserves existing IDs).
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(name, description, display_name, color) VALUES
		('admin',     'Administrator',     '𝑨𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓', '#3b82f6'),
		('moderator', 'Moderator',         '𝑴𝒐𝒌𝒆𝒓𝒂𝒕𝒐𝒓',   '#22c55e'),
		('user',      'Regular user',      '𝑼𝒔𝒆𝒓',          '#6b7280')`, "roles")); err != nil {
		return err
	}
	// Backfill display_name + color for pre-migration-014 installs (the
	// UPDATE only touches rows where the cosmetic fields are still empty).
	if _, err := db.Exec(`UPDATE roles SET display_name = '𝑨𝒅𝒎𝒊𝒏𝒊𝒔𝒕𝒓𝒂𝒕𝒐𝒓', color = '#3b82f6' WHERE name = 'admin'     AND display_name = ''`); err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE roles SET display_name = '𝑴𝒐𝒌𝒆𝒓𝒂𝒕𝒐𝒓',   color = '#22c55e' WHERE name = 'moderator' AND display_name = ''`); err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE roles SET display_name = '𝑼𝒔𝒆𝒓',          color = '#6b7280' WHERE name = 'user'      AND display_name = ''`); err != nil {
		return err
	}
	// Admin gets every permission (incl. ones added in later versions).
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(role_id, permission_id)
		SELECT r.id, p.id FROM roles r, permissions p WHERE r.name='admin'`, "role_permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(role_id, permission_id)
		SELECT r.id, p.id FROM roles r, permissions p
		WHERE r.name='moderator' AND p.key IN ('VIEW_INSTANCES', 'VIEW_ACCOUNT', 'VIEW_SETTINGS', 'MANAGE_THEMES', 'MANAGE_MODS', 'MANAGE_APPLICATIONS', 'USE_APPLICATIONS',
		'APPLICATIONS_VIEW', 'APPLICATIONS_CREATE', 'APPLICATIONS_EDIT',
		'MANAGE_TICKETS', 'TICKETS_VIEW', 'TICKETS_CREATE', 'TICKETS_EDIT',
		'NOTIFICATIONS_VIEW', 'NOTIFICATIONS_EDIT', 'NOTIFICATIONS_DELETE',
		'AI_CHAT_USE', 'AI_CHAT_QA', 'AI_CHAT_TOOLS', 'AI_CHAT_WRITES', 'AI_CHAT_THREADS',
		'USE_LOCAL_THEMES', 'USE_GLOBAL_THEMES', 'ASSIGN_THEMES',
		'ACCOUNT_EDIT_BANNER', 'ACCOUNT_EDIT_ABOUT', 'ACCOUNT_EDIT_ACCENT',
		'ACCOUNT_USE_AVATAR_SYMBOL', 'ACCOUNT_UPLOAD_AVATAR')`, "role_permissions")); err != nil {
		return err
	}
	if _, err := db.Exec(translateSeedInsert(prefix, pgConflict, `(role_id, permission_id)
		SELECT r.id, p.id FROM roles r, permissions p
		WHERE r.name='user' AND p.key IN ('VIEW_INSTANCES', 'VIEW_ACCOUNT', 'USE_APPLICATIONS',
		'TICKETS_VIEW', 'TICKETS_CREATE',
		'NOTIFICATIONS_VIEW', 'NOTIFICATIONS_EDIT', 'NOTIFICATIONS_DELETE',
		'AI_CHAT_USE', 'AI_CHAT_QA', 'AI_CHAT_TOOLS', 'AI_CHAT_THREADS',
		'ACCOUNT_EDIT_BANNER', 'ACCOUNT_EDIT_ABOUT', 'ACCOUNT_EDIT_ACCENT',
		'ACCOUNT_USE_AVATAR_SYMBOL', 'ACCOUNT_UPLOAD_AVATAR')`, "role_permissions")); err != nil {
		return err
	}
	return nil
}

// translateSeedInsert stamps an idempotent INSERT prefix + a Postgres
// ON CONFLICT suffix onto a literal (cols) VALUES ... body. The body is
// pre-formatted (it has the parenthetical column-list followed by VALUES
// followed by the values tuple), so the only thing that varies between
// dialectics is the verb and the trailing conflict clause.
func translateSeedInsert(prefix, pgConflict, body, table string) string {
	return prefix + " " + table + " " + body + pgConflict + ";"
}

// appConfigField is the in-Go shape of one entry in an application's
// config_schema JSON array (mirrors the frontend ApplicationConfigField
// type and the repository scanApplication unmarshaling). We keep it local
// to the seeder so the catalog is self-contained in db.go.
type appConfigField struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Type        string `json:"type"`
	Required    bool   `json:"required,omitempty"`
	Default     string `json:"default,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	Description string `json:"description,omitempty"`
}

// appPermissionReq is the in-Go shape of one capability an application
// declares it needs (mirrors repository.ApplicationPermissionReq). The
// slug keyed insert guarantees we only seed capability rows for freshly
// inserted catalog rows (an admin who edited an existing app keeps their
// grants untouched on a re-seed).
type appPermissionReq struct {
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level,omitempty"`
}

// appFile is one script file shipped inside a seeded application
// (mirrors the {path, content} entries the Studio authors).
type appFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// defaultApplication is one row we seed into the catalog on every
// EnsureSchemaAndSeed call. All shipped defaults start INACTIVE and with no
// permissions pre-granted — the admin must review and approve each
// capability before activation, exactly like any uploaded application.
type defaultApplication struct {
	Name         string
	Slug         string
	Category     string
	Version      string
	Description  string
	Icon         string
	Runtime      string
	Entrypoint   string
	ConfigFields []appConfigField
	Permissions  []appPermissionReq
	Files        []appFile
}

// defaultApplications is the fixed catalog the panel seeds for every fresh
// install. The set covers the well-known bot families the Applications UI
// already renders category icons for (Discord, WhatsApp, Telegram, Slack,
// custom) plus the config_schema fields each of those bots needs from the
// user. No default is pre-granted; the admin toggles grants before
// activation exactly like an uploaded app.
//
// Keep the set deliberately small + template-shaped — these are *catalog
// entries*, not running bots. An admin can edit/Delete any of them via the
// Applications admin page after the first launch. Re-seed only adds rows
// for slugs that are missing, so removing one from this slice (or deleting
// it from the panel) keeps it gone.
var defaultApplications = []defaultApplication{
	{
		Name:        "Discord Bot",
		Slug:        "discord-bot",
		Category:    "discord",
		Version:     "1.0.0",
		Description: "A generic Discord bot template. Users supply their bot token + client ID; the entrypoint launches the bot on the edge.",
		Icon:        "🤖",
		Runtime:     "nodejs",
		Entrypoint:  "src/bot.js",
		ConfigFields: []appConfigField{
			{Key: "bot_token", Label: "Bot Token", Type: "secret", Required: true, Placeholder: "MTk4NjIy…", Description: "The bot token from the Discord Developer Portal."},
			{Key: "client_id", Label: "Client ID", Type: "text", Required: true, Placeholder: "123456789012345678", Description: "Application Client ID (Application ID in the portal)."},
			{Key: "guild_id", Label: "Guild ID (optional)", Type: "text", Required: false, Placeholder: "987654321098765432", Description: "Restrict the bot to a single server; leave blank to register globally."},
			{Key: "prefix", Label: "Command Prefix", Type: "text", Required: false, Default: "!", Description: "Character that triggers commands."},
		},
		Permissions: []appPermissionReq{
			{Capability: "outbound_http", AccessLevel: "standard"},
			{Capability: "filesystem", AccessLevel: "read_write"},
		},
		Files: []appFile{
			{Path: "src/bot.js", Content: discordBotScript},
		},
	},
	{
		Name:        "WhatsApp Bot",
		Slug:        "whatsapp-bot",
		Category:    "whatsapp",
		Version:     "1.0.0",
		Description: "A WhatsApp Cloud API bot template. Users supply their phone_number_id and access token; the entrypoint receives webhooks + sends messages on the edge.",
		Icon:        "💬",
		Runtime:     "nodejs",
		Entrypoint:  "src/bot.js",
		ConfigFields: []appConfigField{
			{Key: "phone_number_id", Label: "Phone Number ID", Type: "text", Required: true, Placeholder: "107…", Description: "From the Meta WhatsApp Cloud API config."},
			{Key: "access_token", Label: "Access Token", Type: "secret", Required: true, Placeholder: "EAAG…", Description: "Permanent access token from the Meta App Dashboard."},
			{Key: "verify_token", Label: "Webhook Verify Token", Type: "secret", Required: true, Placeholder: "my-verify-token", Description: "Token used when registering the webhook with Meta."},
			{Key: "waba_id", Label: "WhatsApp Business Account ID", Type: "text", Required: false, Placeholder: "102…", Description: "Optional; helps disambiguate multi-account setups."},
		},
		Permissions: []appPermissionReq{
			{Capability: "outbound_http", AccessLevel: "standard"},
			{Capability: "network", AccessLevel: "listen"},
		},
		Files: []appFile{
			{Path: "src/bot.js", Content: whatsappBotScript},
		},
	},
	{
		Name:        "Telegram Bot",
		Slug:        "telegram-bot",
		Category:    "telegram",
		Version:     "1.0.0",
		Description: "A Telegram bot template using long polling against the Bot API. Users supply their bot token; the entrypoint polls + answers updates.",
		Icon:        "📨",
		Runtime:     "nodejs",
		Entrypoint:  "src/bot.js",
		ConfigFields: []appConfigField{
			{Key: "bot_token", Label: "Bot Token", Type: "secret", Required: true, Placeholder: "123456789:AA…", Description: "From @BotFather."},
			{Key: "allowed_updates", Label: "Allowed Updates (comma list)", Type: "text", Required: false, Default: "message", Description: "Comma-separated update types the bot wants (message, callback_query, …)."},
		},
		Permissions: []appPermissionReq{
			{Capability: "outbound_http", AccessLevel: "standard"},
			{Capability: "filesystem", AccessLevel: "read_write"},
		},
		Files: []appFile{
			{Path: "src/bot.js", Content: telegramBotScript},
		},
	},
	{
		Name:        "Slack Bot",
		Slug:        "slack-bot",
		Category:    "slack",
		Version:     "1.0.0",
		Description: "A Slack bot template (Bolt-style). Users supply their bot + signing tokens; the entrypoint listens for Slack events over HTTP.",
		Icon:        "💭",
		Runtime:     "nodejs",
		Entrypoint:  "src/bot.js",
		ConfigFields: []appConfigField{
			{Key: "bot_token", Label: "Bot Token (xoxb-)", Type: "secret", Required: true, Placeholder: "xoxb-…", Description: "OAuth bot token from the Slack App config."},
			{Key: "signing_secret", Label: "Signing Secret", Type: "secret", Required: true, Placeholder: "abc…", Description: "Used to verify Slack request signatures."},
			{Key: "app_token", Label: "App-Level Token (xapp-)", Type: "secret", Required: false, Placeholder: "xapp-…", Description: "Required only for Socket Mode."},
			{Key: "port", Label: "Listen Port", Type: "number", Required: false, Default: "3000", Description: "Port the Slack event receiver listens on (edge node must allow inbound)."},
		},
		Permissions: []appPermissionReq{
			{Capability: "outbound_http", AccessLevel: "standard"},
			{Capability: "network", AccessLevel: "listen"},
			{Capability: "filesystem", AccessLevel: "read_write"},
		},
		Files: []appFile{
			{Path: "src/bot.js", Content: slackBotScript},
		},
	},
	{
		Name:        "Custom Bot",
		Slug:        "custom-bot",
		Category:    "custom",
		Version:     "1.0.0",
		Description: "A blank-slate bot template. Users supply a generic token + target URL; edit the entrypoint on the edge to wire up whatever the bot does.",
		Icon:        "⚙️",
		Runtime:     "nodejs",
		Entrypoint:  "src/bot.js",
		ConfigFields: []appConfigField{
			{Key: "api_token", Label: "API Token", Type: "secret", Required: true, Placeholder: "••••••••", Description: "Whatever secret your custom bot uses to authenticate."},
			{Key: "api_base_url", Label: "API Base URL", Type: "text", Required: false, Placeholder: "https://api.example.com"},
			{Key: "extra_config", Label: "Extra Config (JSON)", Type: "textarea", Required: false, Description: "Free-form JSON passed to the entrypoint as-is."},
		},
		Permissions: []appPermissionReq{
			{Capability: "outbound_http", AccessLevel: "standard"},
			{Capability: "filesystem", AccessLevel: "read_write"},
		},
		Files: []appFile{
			{Path: "src/bot.js", Content: customBotScript},
		},
	},
}

// The starter scripts below are deliberately dependency-free Node.js —
// every value they need arrives through environment variables (the
// application's config_schema fields), so an operator configures a bot by
// filling in the Run form and never edits code. Each script performs one
// real authenticated call against its platform API and exits 0 on success,
// 1 on failure, so a Run proves the configured credentials work.

const discordBotScript = `// Discord bot starter — validates BOT_TOKEN against the Discord API.
// Zero dependencies: uses only Node's built-in https client.
const https = require('https');

const token = process.env.bot_token || '';
if (!token) {
  console.error('bot_token is not set — fill it in on the Run form.');
  process.exit(1);
}

https.get({
  hostname: 'discord.com',
  path: '/api/v10/users/@me',
  headers: { Authorization: 'Bot ' + token },
}, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('Discord API returned HTTP ' + res.statusCode + ': ' + body);
      process.exit(1);
    }
    const me = JSON.parse(body);
    console.log('Token OK — authenticated as bot "' + me.username + '" (id ' + me.id + ').');
    const cid = process.env.client_id || '';
    if (cid && cid !== me.id) {
      console.log('Note: client_id ' + cid + ' differs from this token application id ' + me.id + '.');
    }
  });
}).on('error', (e) => {
  console.error('Network error talking to Discord: ' + e.message);
  process.exit(1);
});
`

const whatsappBotScript = `// WhatsApp Cloud API starter — validates access_token + phone_number_id
// against the Meta Graph API. Zero dependencies.
const https = require('https');

const token = process.env.access_token || '';
const phoneId = process.env.phone_number_id || '';
if (!token || !phoneId) {
  console.error('access_token and phone_number_id are required — fill them in on the Run form.');
  process.exit(1);
}

https.get({
  hostname: 'graph.facebook.com',
  path: '/v18.0/' + encodeURIComponent(phoneId) + '?access_token=' + encodeURIComponent(token),
}, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('Graph API returned HTTP ' + res.statusCode + ': ' + body);
      process.exit(1);
    }
    const info = JSON.parse(body);
    console.log('Token OK — phone number "' + (info.display_phone_number || '?') +
      '" verified (id ' + info.id + ', status ' + (info.account_mode || 'unknown') + ').');
    if (process.env.verify_token) {
      console.log('verify_token saved for webhook registration.');
    }
  });
}).on('error', (e) => {
  console.error('Network error talking to Graph API: ' + e.message);
  process.exit(1);
});
`

const telegramBotScript = `// Telegram bot starter — validates BOT_TOKEN via getMe, then does one
// short getUpdates poll to prove polling works. Zero dependencies.
const https = require('https');

const token = process.env.bot_token || '';
if (!token) {
  console.error('bot_token is not set — fill it in on the Run form.');
  process.exit(1);
}

function call(method, qs) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method + (qs ? '?' + qs : ''),
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('bad JSON from Telegram')); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const me = await call('getMe');
  if (!me.ok) {
    console.error('Telegram rejected the token: ' + JSON.stringify(me));
    process.exit(1);
  }
  console.log('Token OK — authenticated as @' + me.result.username + ' (id ' + me.result.id + ').');
  const updates = await call('getUpdates', 'timeout=10&limit=10' +
    (process.env.allowed_updates ? '&allowed_updates=' + encodeURIComponent(process.env.allowed_updates) : ''));
  if (!updates.ok) {
    console.error('getUpdates failed: ' + JSON.stringify(updates));
    process.exit(1);
  }
  console.log('Polling works — ' + updates.result.length + ' pending update(s).');
})().catch((e) => {
  console.error('Network error talking to Telegram: ' + e.message);
  process.exit(1);
});
`

const slackBotScript = `// Slack bot starter — validates BOT_TOKEN with auth.test. Zero dependencies.
const https = require('https');

const token = process.env.bot_token || '';
if (!token) {
  console.error('bot_token is not set — fill it in on the Run form.');
  process.exit(1);
}

const req = https.request({
  hostname: 'slack.com',
  path: '/api/auth.test',
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8',
  },
}, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    const out = JSON.parse(body);
    if (!out.ok) {
      console.error('Slack rejected the token: ' + (out.error || body));
      process.exit(1);
    }
    console.log('Token OK — authenticated as "' + out.user + '" on team "' + out.team + '" (' + out.team_id + ').');
  });
});
req.on('error', (e) => {
  console.error('Network error talking to Slack: ' + e.message);
  process.exit(1);
});
req.end();
`

const customBotScript = `// Custom bot starter — prints the configuration it received (secrets are
// never printed, only their presence) and optionally pings api_base_url
// with the token as a Bearer header. Wire up your own logic below.
const https = require('https');
const url = require('url');

const token = process.env.api_token || '';
if (!token) {
  console.error('api_token is not set — fill it in on the Run form.');
  process.exit(1);
}
console.log('api_token: present (' + token.length + ' chars)');
console.log('extra_config:', process.env.extra_config || '(none)');

const base = process.env.api_base_url || '';
if (!base) {
  console.log('api_base_url not set — nothing further to do. Edit src/bot.js to add your logic.');
  process.exit(0);
}

const parsed = url.parse(base);
https.get({
  hostname: parsed.hostname,
  port: parsed.port,
  path: parsed.path || '/',
  headers: { Authorization: 'Bearer ' + token },
}, (res) => {
  console.log('GET ' + base + ' -> HTTP ' + res.statusCode);
  process.exit(res.statusCode < 500 ? 0 : 1);
}).on('error', (e) => {
  console.error('Request to api_base_url failed: ' + e.message);
  process.exit(1);
});
`

// SeedDefaultApplications idempotently inserts the catalog the panel ships
// with — one row per defaultApplication above — into `applications` plus
// their requested capabilities into `application_permissions`. Skipped
// cleanly when an app with the same slug already exists (admin-edited or
// deleted defaults stay as they are), so re-running `seed` or `launch` is
// safe on populated installs.
//
// All seeded apps land INACTIVE with every capability un-granted (granted=0);
// the admin must approve permissions before activating, identical to an
// upload. No role↔permission wiring is touched here — `applications` rows
// are catalog entries, not RBAC primitives, and the MANAGE_APPLICATIONS /
// USE_APPLICATIONS / APPLICATIONS_* permission seeds already live in 029.
func SeedDefaultApplications(d Dialect, db *sql.DB) error {
	// Defensive guard: the applications table may not exist on an install
	// that ran migrations only partially. EnsureSchemaAndSeed calls this
	// *after* RunMigrations, so the check is a no-op in production; if
	// absent we skip seeding instead of failing loudly so `launch` can
	// converge after a partial migration run.
	if !applicationsTableExists(d, db) {
		return nil
	}

	now := time.Now().UTC().Format("2006-01-02 15:04:05")

	for _, app := range defaultApplications {
		cfgSchema, err := json.Marshal(app.ConfigFields)
		if err != nil {
			return fmt.Errorf("marshal config_schema for %s: %w", app.Slug, err)
		}
		if len(cfgSchema) == 0 || string(cfgSchema) == "null" {
			cfgSchema = []byte("[]")
		}
		filesJSON, err := json.Marshal(app.Files)
		if err != nil {
			return fmt.Errorf("marshal files for %s: %w", app.Slug, err)
		}
		if len(filesJSON) == 0 || string(filesJSON) == "null" {
			filesJSON = []byte("[]")
		}
		permsPreview, err := json.Marshal(app.Permissions)
		if err != nil {
			return fmt.Errorf("marshal permissions preview for %s: %w", app.Slug, err)
		}
		if len(permsPreview) == 0 || string(permsPreview) == "null" {
			permsPreview = []byte("[]")
		}

		// Idempotent INSERT keyed on the UNIQUE slug. SQLite uses
		// "INSERT OR IGNORE", MySQL "INSERT IGNORE", Postgres a plain
		// INSERT plus ON CONFLICT (slug) DO NOTHING — they all skip if a
		// row with the same slug already exists, which is exactly the
		// contract we want (an admin who deleted an app keeps it gone).
		p := d.Placeholder
		insertSQL := "INSERT INTO applications (name, slug, category, version, description, icon, runtime, entrypoint, config_schema, files, permissions, created_at, updated_at) VALUES (" +
			p(1) + "," + p(2) + "," + p(3) + "," + p(4) + "," + p(5) + "," + p(6) + "," + p(7) + "," + p(8) + "," + p(9) + "," + p(10) + "," + p(11) + "," + p(12) + "," + p(13) + ")"
		switch d.Name() {
		case "postgres":
			insertSQL += " ON CONFLICT (slug) DO NOTHING"
		case "mysql", "mariadb":
			insertSQL = "INSERT IGNORE" + insertSQL[len("INSERT"):]
		default: // sqlite
			insertSQL = "INSERT OR IGNORE" + insertSQL[len("INSERT"):]
		}

		if _, err := db.Exec(insertSQL,
			app.Name, app.Slug, app.Category, app.Version, app.Description, app.Icon,
			app.Runtime, app.Entrypoint, string(cfgSchema), string(filesJSON), string(permsPreview), now, now,
		); err != nil {
			return fmt.Errorf("insert default application %s: %w", app.Slug, err)
		}

		// Re-fetch the live id so we can pair the requested capability rows
		// with this catalog entry. We re-select regardless of whether the
		// insert landed a new row or hit an IGNORE (e.g. because the admin
		// had deleted the default — re-seed recreates the permissions too
		// rather than leaving an entry with zero requested caps).
		var appID int64
		if err := db.QueryRow("SELECT id FROM applications WHERE slug = "+p(1), app.Slug).Scan(&appID); err != nil {
			return fmt.Errorf("lookup seeded application %s: %w", app.Slug, err)
		}
		for _, perm := range app.Permissions {
			if perm.Capability == "" {
				continue
			}
			// application_permissions has no UNIQUE constraint on
			// (application_id, capability), so dialect-level IGNORE/ON
			// CONFLICT clauses won't dedupe a re-seed. We check-and-skip
			// explicitly so the seeder is idempotent on every engine.
			var existing int
			if err := db.QueryRow(
				"SELECT COUNT(*) FROM application_permissions WHERE application_id = "+p(1)+" AND capability = "+p(2),
				appID, perm.Capability,
			).Scan(&existing); err != nil {
				return fmt.Errorf("lookup permission %s for %s: %w", perm.Capability, app.Slug, err)
			}
			if existing > 0 {
				continue
			}
			permSQL := "INSERT INTO application_permissions (application_id, capability, access_level, granted) VALUES (" +
				p(1) + "," + p(2) + "," + p(3) + ", 0)"
			if _, err := db.Exec(permSQL, appID, perm.Capability, perm.AccessLevel); err != nil {
				return fmt.Errorf("insert permission %s for %s: %w", perm.Capability, app.Slug, err)
			}
		}
	}
	return nil
}

// applicationsTableExists reports whether the `applications` table is
// present. The check is dialect-aware because SQLite uses sqlite_master and
// Postgres / MySQL introspect information_schema. We swallow the error path
// (it returns false on any failure) so the seeder just no-ops on a partially
// migrated install instead of crashing.
func applicationsTableExists(d Dialect, db *sql.DB) bool {
	var probe string
	switch d.Name() {
	case "sqlite":
		probe = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='applications'"
	case "postgres":
		probe = "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='applications'"
	default: // mysql / mariadb
		probe = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='applications'"
	}
	var n int
	if err := db.QueryRow(probe).Scan(&n); err != nil {
		return false
	}
	return n > 0
}
