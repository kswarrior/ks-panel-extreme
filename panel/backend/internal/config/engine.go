package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

// EnvFileName is the dotenv-style file kspanel writes when an operator changes
// the database engine from the admin UI (or via `seed --url`). `launch` and
// `seed` call LoadEnvFile() early so the persisted choice wins over the bare
// SQLite default — exactly the same effect as setting KSPANEL_DB_TYPE /
// KSPANEL_DB_DSN in the environment, but durable across restarts and visible
// to anyone who opens the file.
//
// The file lives next to the SQLite default path (DataDir) so a single
// `rm kspanel.env` reverts to the original SQLite behaviour without any
// registry/state to clean up.
const EnvFileName = "kspanel.env"

// EnvFilePath returns the absolute path to the dotenv file. Resolved relative
// to the SQLite default location so it co-habits with kspanel.db regardless of
// the cwd the operator launched from.
func EnvFilePath() string {
	return filepath.Join(DataDir(), EnvFileName)
}

// LoadEnvFile reads kspanel.env (if present) and applies the KSPANEL_DB_* /
// KSPANEL_DB_DSN / KSPANEL_DB keys it carries to the live process env, but
// only for keys the caller hasn't already set — explicit env vars and CLI
// flags keep priority over the file. This way the dotenv is a safe default
// rather than a surprise override.
//
// Missing file / unreadable file / parse errors are swallowed: a fresh
// install has no kspanel.env, and we never want a malformed file to abort
// panel startup. The operator will find the parse error in the file itself.
func LoadEnvFile() {
	p := EnvFilePath()
	f, err := os.Open(p)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || line[0] == '#' {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.TrimSpace(line[eq+1:])
		// Strip a single pair of surrounding quotes (operator-editable).
		val = strings.TrimSpace(val)
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') ||
				(val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		// Only set if unset — live env / CLI flags win.
		if _, present := os.LookupEnv(key); !present {
			_ = os.Setenv(key, val)
		}
	}
}

// SaveDBConfig persists an engine + DSN choice to kspanel.env so the next
// launch/seed picks it up automatically. Overwrites the DB_* keys only —
// other keys the operator may have added to the file are preserved.
//
// engine is normalised to lowercase; an empty engine falls back to "sqlite"
// and DSN persists only for non-empty values (SQLite keeps its default path).
func SaveDBConfig(engine, dsn string) error {
	engine = strings.ToLower(strings.TrimSpace(engine))
	if engine == "" {
		engine = "sqlite"
	}

	p := EnvFilePath()
	existing := map[string]string{}
	if f, err := os.Open(p); err == nil {
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" || line[0] == '#' {
				continue
			}
			eq := strings.IndexByte(line, '=')
			if eq <= 0 {
				continue
			}
			existing[strings.TrimSpace(line[:eq])] = strings.TrimSpace(line[eq+1:])
		}
		f.Close()
	}

	// Replace the three DB keys the panel honours; remove the SQLite-shortcut
	// KSPANEL_DB so the type/dsn pair is the single source of truth once an
	// operator picks a non-default engine.
	existing["KSPANEL_DB_TYPE"] = engine
	if dsn != "" {
		existing["KSPANEL_DB_DSN"] = dsn
	} else {
		delete(existing, "KSPANEL_DB_DSN")
	}
	// Clear the legacy shortcut unless we're storing an explicit SQLite path.
	if engine != "sqlite" || dsn == "" {
		delete(existing, "KSPANEL_DB")
	}

	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return fmt.Errorf("create env dir: %w", err)
	}
	out, err := os.Create(p)
	if err != nil {
		return fmt.Errorf("write env file: %w", err)
	}
	defer out.Close()

	// Stable key order for diff-friendly output.
	ordered := []string{"KSPANEL_DB", "KSPANEL_DB_TYPE", "KSPANEL_DB_DSN"}
	written := map[string]bool{}
	for _, k := range ordered {
		v, ok := existing[k]
		if !ok {
			continue
		}
		fmt.Fprintf(out, "%s=%s\n", k, v)
		written[k] = true
	}
	// Any other keys the operator added (KSPANEL_MASTER_KEY etc.).
	rest := make([]string, 0, len(existing))
	for k, v := range existing {
		if !written[k] {
			rest = append(rest, k)
		}
		_ = v
	}
	// Sort the rest so the file stays reproducible.
	for i := 1; i < len(rest); i++ {
		for j := i; j > 0 && rest[j-1] > rest[j]; j-- {
			rest[j-1], rest[j] = rest[j], rest[j-1]
		}
	}
	for _, k := range rest {
		fmt.Fprintf(out, "%s=%s\n", k, existing[k])
	}
	return nil
}

// BuildDSNFromURL turns the friendlier --url host:port form the CLI / admin
// UI exposes into the engine's native DSN. It honours the `--user`,
// `--password`, `--database` companions so an operator can write:
//
//	./kspanel seed --type postgres --url localhost:5432 --user ks \
//	               --password s3cret --database kspanel
//
// instead of memorising the libpq / go-sql-driver DSN grammar. For SQLite the
// url is treated as a file path (DB config still honours KSPANEL_DB).
//
// Returns ("", false) when url is empty/irrelevant so callers can keep
// falling back to --dsn / env / defaults.
func BuildDSNFromURL(engine, url, user, password, database string) (string, bool) {
	url = strings.TrimSpace(url)
	if url == "" {
		return "", false
	}
	engine = strings.ToLower(strings.TrimSpace(engine))
	if engine == "" || engine == "sqlite" {
		// For SQLite the URL is a file path; honoured verbatim by the caller.
		return url, true
	}

	host := url
	port := ""
	// Split host:port — tolerate IPv6 by only splitting on the last colon.
	if c := strings.LastIndex(url, ":"); c >= 0 {
		// Heuristic: if the part before ':' contains more colons it's IPv6
		// (e.g. [::1]:5432); skip unless wrapped in brackets. Brackets are
		// stripped so the dial form stays clean.
		if strings.Count(url[:c], ":") > 0 && !strings.HasPrefix(url, "[") {
			// IPv6 without brackets — leave whole as host, no port.
		} else {
			host = url[:c]
			port = url[c+1:]
		}
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")

	switch engine {
	case "postgres", "postgresql", "pg":
		db := database
		if db == "" {
			db = "kspanel"
		}
		// libpq URL form. sslmode defaults to disable for localhost-style
		// installs; operators wanting TLS can pass --dsn with sslmode=require.
		return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&connect_timeout=10",
			urlEscape(user), urlEscape(password), host, defaultPort(port, engine), db), true
	case "mysql", "mariadb":
		db := database
		if db == "" {
			db = "kspanel"
		}
		// Built through mysql.Config + FormatDSN rather than string
		// splicing so credentials containing '@', ':', '/', '(' etc. are
		// escaped exactly the way go-sql-driver parses them back — a raw
		// "%s:%s@tcp(%s)/%s" template silently mis-routes on such passwords.
		// parseTime + loc mirror the dialect docs; multiStatements stays
		// OFF (the migration runner executes one statement at a time).
		cfg := mysql.Config{
			User:                 user,
			Passwd:               password,
			Net:                  "tcp",
			Addr:                 fmt.Sprintf("%s:%s", host, defaultPort(port, engine)),
			DBName:               db,
			AllowNativePasswords: true,
			ParseTime:            true,
			Loc:                  time.UTC,
			Timeout:              10 * time.Second,
		}
		return cfg.FormatDSN(), true
	}
	return "", false
}

// defaultPort returns the canonical default port per engine when the caller
// didn't pass one (postgres=5432, mysql/mariadb=3306).
func defaultPort(port, engine string) string {
	if port != "" {
		return port
	}
	switch engine {
	case "postgres", "postgresql", "pg":
		return "5432"
	case "mysql", "mariadb":
		return "3306"
	}
	return ""
}

// urlEscape percent-encodes a bare username/password segment for the libpq
// URL form so special chars (':@/?#' etc.) don't break the parse. Stays
// simple: we escape the few characters that would definitely split the URL.
func urlEscape(s string) string {
	const special = ":@/?#%"
	r := strings.NewReplacer(
		"%", "%25", ":", "%3A", "@", "%40", "/", "%2F", "?", "%3F", "#", "%23",
	)
	return r.Replace(s)
}
