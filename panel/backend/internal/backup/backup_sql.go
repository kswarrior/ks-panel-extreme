package backup

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
)

// ---- Backup kind detection (header, not suffix) --------------------------

// sqliteMagic is the 16-byte header every SQLite database file starts
// with. Checking it (instead of trusting the filename suffix) is what
// lets Restore route .db vs .sql correctly even when an upload was
// misnamed.
var sqliteMagic = []byte("SQLite format 3\x00")

func hasSQLiteHeader(data []byte) bool {
	if len(data) < len(sqliteMagic) {
		return false
	}
	for i, b := range sqliteMagic {
		if data[i] != b {
			return false
		}
	}
	return true
}

// gzipMagic + zstdMagic identify compressed backups before we pick a
// decompressor. They are the standard 2/4-byte magic numbers.
var (
	gzipMagic = []byte{0x1f, 0x8b}
	zstdMagic = []byte{0x28, 0xb5, 0x2f, 0xfd}
)

func hasGzipMagic(data []byte) bool {
	return len(data) >= 2 && data[0] == gzipMagic[0] && data[1] == gzipMagic[1]
}

func hasZstdMagic(data []byte) bool {
	return len(data) >= 4 && data[0] == zstdMagic[0] && data[1] == zstdMagic[1] && data[2] == zstdMagic[2] && data[3] == zstdMagic[3]
}

// looksLikeSQLDump reports whether head looks like a plain-text SQL dump:
// leading SQL comments (-- / /*), pg_dump/MySQL headers, or DDL/DML
// keywords (CREATE TABLE, INSERT, COPY, SET). Matching is
// case-insensitive and BOM/whitespace tolerant so pg_dump + mysqldump
// outputs both qualify.
func looksLikeSQLDump(head []byte) bool {
	s := strings.TrimSpace(strings.TrimPrefix(string(head), "\xef\xbb\xbf"))
	if s == "" {
		return false
	}
	up := strings.ToUpper(s)
	for _, pre := range []string{"--", "/*", "SET ", "CREATE ", "INSERT ", "COPY ", "USE ", "LOCK TABLES", "UNLOCK TABLES", "PGDMP"} {
		if strings.HasPrefix(up, pre) {
			return true
		}
	}
	// pg_dump header ("PostgreSQL database dump") / mysqldump header
	// ("MySQL dump") can appear after comment lines — scan the whole head.
	for _, needle := range []string{"POSTGRESQL DATABASE DUMP", "MYSQL DUMP", "PG_DUMP", "CREATE TABLE", "INSERT INTO", "COPY ", "SET STATEMENT_TIMEOUT"} {
		if strings.Contains(up, needle) {
			return true
		}
	}
	return false
}

// classifyBackupBytes maps a (decompressed) head to "sqlite", "sql" or "".
// SQLite wins when its magic is present; otherwise SQL markers decide.
func classifyBackupBytes(head []byte) string {
	if hasSQLiteHeader(head) {
		return "sqlite"
	}
	if looksLikeSQLDump(head) {
		return "sql"
	}
	return ""
}

func readHead(path string, n int) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	buf := make([]byte, n)
	m, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, err
	}
	return buf[:m], nil
}

// peekGzipHead returns the first n decompressed bytes of a gzip file
// without materialising the whole stream.
func peekGzipHead(path string, n int) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer gz.Close()
	buf := make([]byte, n)
	m, err := io.ReadFull(gz, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, err
	}
	return buf[:m], nil
}

// DetectBackupKind returns "sqlite" or "sql" for the backup at path,
// inspecting the (decompressed) header rather than the filename suffix.
// compression is the Backup.Compression label ("none"|"gzip"|"zstd").
// Unknown content returns an error so callers fail closed instead of
// routing a corrupt file to the wrong restore path.
func DetectBackupKind(path, compression string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(compression)) {
	case "", "none":
		head, err := readHead(path, 8192)
		if err != nil {
			return "", err
		}
		if kind := classifyBackupBytes(head); kind != "" {
			return kind, nil
		}
		// A gzip/zstd file stored without a compression label (legacy
		// upload) still carries its magic — peek inside before giving up.
		if hasGzipMagic(head) {
			if inner, gerr := peekGzipHead(path, 8192); gerr == nil {
				if kind := classifyBackupBytes(inner); kind != "" {
					return kind, nil
				}
			}
		}
		return "", fmt.Errorf("unrecognised backup header (not SQLite nor SQL dump)")
	case "gzip":
		inner, err := peekGzipHead(path, 8192)
		if err != nil {
			return "", fmt.Errorf("read gzip backup header: %w", err)
		}
		if kind := classifyBackupBytes(inner); kind != "" {
			return kind, nil
		}
		return "", fmt.Errorf("unrecognised gzip backup header (not SQLite nor SQL dump)")
	case "zstd":
		tmp, err := decompressToTemp(path, "zstd")
		if err != nil {
			return "", err
		}
		defer os.Remove(tmp)
		head, herr := readHead(tmp, 8192)
		if herr != nil {
			return "", herr
		}
		if kind := classifyBackupBytes(head); kind != "" {
			return kind, nil
		}
		return "", fmt.Errorf("unrecognised zstd backup header (not SQLite nor SQL dump)")
	default:
		return "", fmt.Errorf("unknown compression %q", compression)
	}
}

// ---- Native restores (psql/pg_restore + mysql) ---------------------------

// isCustomPGDump reports whether sqlPath holds a pg_dump custom-format
// archive (magic "PGDMP" at offset 0) as opposed to a plain-text .sql
// dump. Custom archives must go through pg_restore; plain dumps go
// through psql.
func isCustomPGDump(sqlPath string) bool {
	head, err := readHead(sqlPath, 5)
	if err != nil || len(head) < 5 {
		return false
	}
	return string(head) == "PGDMP"
}

// plainSQLPath resolves b to a plain (decompressed) .sql path for piping
// into a native client. When the backup is compressed the content is
// materialised into a temp file the caller removes.
func plainSQLPath(b Backup) (sqlPath string, cleanup func(), err error) {
	if !b.Compressed {
		return b.Path, func() {}, nil
	}
	tmp, derr := decompressToTemp(b.Path, b.Compression)
	if derr != nil {
		return "", func() {}, fmt.Errorf("decompress backup: %w", derr)
	}
	return tmp, func() { os.Remove(tmp) }, nil
}

// RestorePG replays a .sql backup into the live Postgres database using
// the native client, symmetric to NativeDump:
//
//   - plain-text dumps stream through `psql <dsn> -v ON_ERROR_STOP=1`
//     with the decompressed bytes on stdin;
//   - custom-format archives (pg_dump -Fc, magic PGDMP) go through
//     `pg_restore -d <dsn> --clean --if-exists`.
//
// Compressed backups (.sql.gz/.sql.zst) are decompressed first.
// Returns *ErrNativeToolMissing when neither psql nor pg_restore is
// installed so the HTTP layer can render a 400 with an install hint.
func RestorePG(id string) error {
	opMu.Lock()
	defer opMu.Unlock()
	b, err := Get(id)
	if err != nil {
		return err
	}
	cfg := config.DatabaseConfig()
	eng := strings.ToLower(strings.TrimSpace(cfg.Engine))
	if eng != "postgres" && eng != "postgresql" && eng != "pg" {
		return fmt.Errorf("live engine is %q, not postgres — cannot replay a SQL dump into it", cfg.Engine)
	}
	sqlPath, cleanup, err := plainSQLPath(b)
	if err != nil {
		return err
	}
	defer cleanup()
	// Header check: refuse SQLite snapshots routed here by mistake.
	if head, herr := readHead(sqlPath, 8192); herr == nil {
		if hasSQLiteHeader(head) {
			return fmt.Errorf("backup %q is a SQLite snapshot, not a Postgres dump — restore it onto a SQLite engine", b.Filename)
		}
	}
	if isCustomPGDump(sqlPath) {
		if _, lerr := exec.LookPath("pg_restore"); lerr != nil {
			return &ErrNativeToolMissing{Engine: "postgres", Tool: "pg_restore"}
		}
		return runPgRestore(cfg.DSN, sqlPath)
	}
	if _, lerr := exec.LookPath("psql"); lerr != nil {
		// pg_restore cannot replay plain SQL, so its presence does not
		// help here — report psql as the missing tool.
		return &ErrNativeToolMissing{Engine: "postgres", Tool: "psql"}
	}
	return runPsql(cfg.DSN, sqlPath)
}

func runPsql(dsn, sqlPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	f, err := os.Open(sqlPath)
	if err != nil {
		return err
	}
	defer f.Close()
	cmd := exec.CommandContext(ctx, "psql", dsn, "-v", "ON_ERROR_STOP=1", "-q")
	if pw := postgresPassword(dsn); pw != "" {
		cmd.Env = append(os.Environ(), "PGPASSWORD="+pw)
	}
	cmd.Stdin = f
	var stderr strings.Builder
	// Bound stderr so a verbose dump cannot OOM the panel.
	stderr.Grow(8192)
	cmd.Stderr = &stderrWriter{sb: &stderr, limit: 8192}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("psql restore failed: %v (%s)", err, truncateErr(stderr.String(), 500))
	}
	return nil
}

func runPgRestore(dsn, dumpPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pg_restore", "-d", dsn, "--clean", "--if-exists", dumpPath)
	if pw := postgresPassword(dsn); pw != "" {
		cmd.Env = append(os.Environ(), "PGPASSWORD="+pw)
	}
	var stderr strings.Builder
	stderr.Grow(8192)
	cmd.Stderr = &stderrWriter{sb: &stderr, limit: 8192}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pg_restore failed: %v (%s)", err, truncateErr(stderr.String(), 500))
	}
	return nil
}

// RestoreMySQL replays a .sql backup into the live MySQL/MariaDB database
// via the `mysql` client, symmetric to NativeDump's mysqldump path. The
// decompressed bytes stream via stdin; credentials travel via MYSQL_PWD
// and are never logged. Returns *ErrNativeToolMissing when `mysql` is
// absent.
func RestoreMySQL(id string) error {
	opMu.Lock()
	defer opMu.Unlock()
	b, err := Get(id)
	if err != nil {
		return err
	}
	cfg := config.DatabaseConfig()
	eng := strings.ToLower(strings.TrimSpace(cfg.Engine))
	if eng != "mysql" && eng != "mariadb" {
		return fmt.Errorf("live engine is %q, not mysql — cannot replay a SQL dump into it", cfg.Engine)
	}
	if _, lerr := exec.LookPath("mysql"); lerr != nil {
		return &ErrNativeToolMissing{Engine: "mysql", Tool: "mysql"}
	}
	sqlPath, cleanup, err := plainSQLPath(b)
	if err != nil {
		return err
	}
	defer cleanup()
	if head, herr := readHead(sqlPath, 8192); herr == nil {
		if hasSQLiteHeader(head) {
			return fmt.Errorf("backup %q is a SQLite snapshot, not a MySQL dump — restore it onto a SQLite engine", b.Filename)
		}
	}
	return runMysql(cfg.DSN, sqlPath)
}

func runMysql(dsn, sqlPath string) error {
	host, port, user, pw, dbname := parseMySQLDSN(dsn)
	args := []string{}
	if host != "" {
		args = append(args, "-h", host)
	}
	if port != "" {
		args = append(args, "-P", port)
	}
	if user != "" {
		args = append(args, "-u", user)
	}
	if dbname != "" {
		args = append(args, dbname)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	f, err := os.Open(sqlPath)
	if err != nil {
		return err
	}
	defer f.Close()
	cmd := exec.CommandContext(ctx, "mysql", args...)
	if pw != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+pw)
	}
	cmd.Stdin = f
	var stderr strings.Builder
	stderr.Grow(8192)
	cmd.Stderr = &stderrWriter{sb: &stderr, limit: 8192}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("mysql restore failed: %v (%s)", err, truncateErr(stderr.String(), 500))
	}
	return nil
}

// stderrWriter is an io.Writer that caps buffered stderr so a chatty
// native tool cannot grow the panel's memory without bound.
type stderrWriter struct {
	sb    *strings.Builder
	limit int
}

func (w *stderrWriter) Write(p []byte) (int, error) {
	if w.sb.Len() >= w.limit {
		return len(p), nil
	}
	remain := w.limit - w.sb.Len()
	if len(p) > remain {
		p = p[:remain]
	}
	return w.sb.Write(p)
}
