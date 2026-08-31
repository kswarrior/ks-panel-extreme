package cli

import (
	"fmt"
	"os"
	"path"
	"strings"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/spf13/cobra"
)

// seedCmd creates the database described by --type / KSPANEL_DB_TYPE, runs
// the matching dialect's migrations and seeds core data (roles, permissions,
// admin role↔permission links). The default engine is SQLite, so a fresh
// install with no flags behaves identically to the historical `kspanel seed`.
//
// Examples:
//   panel_name=sqlite   → ./kspanel seed
//   panel_name=postgres → ./kspanel seed --type postgres --url localhost:5432 \
//                                      --user ks --password s3cret --database kspanel
//   full DSN override   → ./kspanel seed --type mysql --dsn 'ks:secret@tcp(10.0.0.1:3306)/kspanel?parseTime=true'
//
// The output is intentionally short — each step gets exactly one line so an
// operator can skim a CI log or scrollback for status. We print nothing
// extra besides the success line.
var seedCmd = &cobra.Command{
	Use:   "seed",
	Short: "Initialize the kspanel database and seed core configuration",
	Long: `Initialize the kspanel database for the chosen engine and seed the
core roles / permissions. Defaults to SQLite (no flag needed). For Postgres /
MySQL/MariaDB pass --type with either --dsn (full conn string) or the friendlier
--url host:port plus --user/--password/--database.`,
	RunE: runSeed,
}

func init() {
	seedCmd.Flags().String("type", "", "Database engine: sqlite (default), postgres, mysql/mariadb")
	seedCmd.Flags().String("dsn", "", "Full database DSN (overrides --url); file path for sqlite, conn string for postgres/mysql")
	seedCmd.Flags().String("url", "", "Database host:port (e.g. localhost:5432) — friendlier alternative to --dsn for postgres/mysql")
	seedCmd.Flags().String("user", "", "Database username — paired with --url for postgres/mysql")
	seedCmd.Flags().String("password", "", "Database password — paired with --url for postgres/mysql")
	seedCmd.Flags().String("database", "", "Database name — paired with --url for postgres/mysql (defaults to kspanel)")
}

func runSeed(cmd *cobra.Command, args []string) error {
	// Apply any persisted kspanel.env (admin "Change Database" writes here)
	// before resolving the CLI flags — env vars and CLI flags still win
	// because LoadEnvFile only sets keys the operator hasn't already set.
	config.LoadEnvFile()

	typ, _ := cmd.Flags().GetString("type")
	dsn, _ := cmd.Flags().GetString("dsn")
	urlFlag, _ := cmd.Flags().GetString("url")
	userFlag, _ := cmd.Flags().GetString("user")
	passFlag, _ := cmd.Flags().GetString("password")
	dbFlag, _ := cmd.Flags().GetString("database")
	eng := strings.ToLower(strings.TrimSpace(typ))

	// --dsn wins over --url when both are given (power-user override). When
	// only --url is passed we build the engine's native DSN from the
	// friendlier host:port + user/pass/db tuple.
	if dsn == "" && urlFlag != "" {
		if built, ok := config.BuildDSNFromURL(eng, urlFlag, userFlag, passFlag, dbFlag); ok {
			dsn = built
		}
	}

	// Record the operator's choice so config.DatabaseConfig() honours it
	// for the rest of this process (the launch command also calls into
	// config.DatabaseConfig when opening its own connection).
	if typ != "" || dsn != "" {
		config.SetDatabaseType(eng, dsn)
	}
	cfg := config.DatabaseConfig()

	// SQLite: pre-create the parent directory so the very first migration
	// doesn't fall over on an unrelated "open: no such file or directory"
	// error. For Postgres / MySQL this is a no-op (the engine owns its own
	// files) and we don't stat the DSN.
	if cfg.Engine == "" || cfg.Engine == "sqlite" {
		if err := os.MkdirAll(path.Dir(cfg.DSN), 0o755); err != nil {
			print.Fail("seed", fmt.Sprintf("create db directory: %v", err))
			return fmt.Errorf("create db directory: %w", err)
		}
	}

	// Per-migration log lines are noise during the optimistic style unless
	// the operator opts in with KSPANEL_LOG=verbose.
	silenceStandardLog()
	defer restoreStandardLog()

	con, d, err := db.Open(cfg)
	if err != nil {
		print.Fail("seed", fmt.Sprintf("open db: %v", err))
		return fmt.Errorf("open db: %w", err)
	}
	defer con.Close()

	print.Step("database", fmt.Sprintf("%s — %s", d.Name(), dbPathLabel(cfg, d)))
	print.OK("connected", d.Name()+" ready")

	print.Step("migrations", "running")
	if err := db.RunMigrations(d, con); err != nil {
		print.Fail("migrations", err.Error())
		return fmt.Errorf("run migrations: %w", err)
	}
	print.OK("migrations", "applied")

	print.Step("seed", "core roles + permissions")
	if err := db.SeedCore(d, con); err != nil {
		print.Fail("seed", err.Error())
		return fmt.Errorf("seed core data: %w", err)
	}
	print.OK("seed", "ready")

	// A small "everything is healthy" summary — operator can see the
	// three things they'd want to know: which engine, where it lives, and
	// how to start the server.
	fmt.Println()
	print.OK("panel seed", "ready")
	fmt.Printf("  next: ./kspanel launch --type %s%s\n", d.Name(), dsnFlagHint(cfg))
	return nil
}

// dbPathLabel hides long DSNs (which often carry passwords) and shows the
// SQLite file path verbatim so the launch summary stays skimmable. For
// Postgres / MySQL we only print the host/db a human would want to verify
// — redact everything we don't trust to be safe to log.
//
// d may be nil when the caller hasn't opened the DB yet (e.g. `launch` prints
// the path before opening). Falling back to a config.Engine check keeps the
// summary line safe regardless of dialect availability.
func dbPathLabel(cfg config.DBConfig, d db.Dialect) string {
	if d == nil {
		if cfg.Engine == "" || cfg.Engine == "sqlite" {
			return cfg.DSN
		}
		return redactedDSN(cfg.DSN)
	}
	if d.IsSQLite() {
		return cfg.DSN
	}
	return redactedDSN(cfg.DSN)
}

// redactedDSN keeps passwords out of the launch summary. We keep a host /
// dbname substring and mask the password segment; anything we can't parse
// is replaced with a generic "masked" placeholder rather than logged.
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
		// postgres://user:pass@host/?... or mysql://user:pass@host/db
		rel := strings.Index(dsn[i:], "@")
		if rel > 0 {
			creds := dsn[i+3 : i+rel]
			if colon := strings.IndexByte(creds, ':'); colon > 0 {
				return dsn[:i+3] + creds[:colon] + ":***" + dsn[i+rel:]
			}
		}
	}
	if strings.Contains(dsn, ":") && strings.Contains(dsn, "@") {
		// go-sql-driver form user:pass@tcp(host)
		if at := strings.Index(dsn, "@"); at > 0 {
			creds := dsn[:at]
			if colon := strings.IndexByte(creds, ':'); colon > 0 {
				return creds[:colon] + ":***" + dsn[at:]
			}
		}
	}
	return dsn
}

// dsnFlagHint echoes the --dsn flag the operator should pass on launch so
// the panel keeps pointing at the same database. SQLite short-circuits to
// nothing (the env var / default path is enough on launch).
func dsnFlagHint(cfg config.DBConfig) string {
	if cfg.Engine == "" || cfg.Engine == "sqlite" {
		return ""
	}
	return fmt.Sprintf(" --dsn '%s'", redactedDSN(cfg.DSN))
}
