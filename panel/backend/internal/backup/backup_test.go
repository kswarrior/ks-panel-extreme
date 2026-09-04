package backup

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/example/kspanel/internal/config"
)

func TestValidateCompression(t *testing.T) {
	for _, c := range []string{"", "none", "gzip", "zstd", "GZIP"} {
		if _, err := ValidateCompression(c); err != nil {
			t.Fatalf("ValidateCompression(%q) failed: %v", c, err)
		}
	}
	if _, err := ValidateCompression("brotli"); err == nil {
		t.Fatal("expected error for brotli")
	}
}

func TestSplitBackupSuffix(t *testing.T) {
	cases := map[string]string{
		"kspanel-20060102-150405-20240101-000000-a.db":     "none",
		"kspanel-20060102-150405-20240101-000000-a.db.gz":  "gzip",
		"kspanel-20060102-150405-20240101-000000-a.db.zst": "zstd",
		"kspanel-20060102-150405-20240101-000000-a.sql":    "none",
		"kspanel-20060102-150405-20240101-000000-a.sql.gz": "gzip",
	}
	for name, want := range cases {
		_, comp := splitBackupSuffix(name)
		if comp != want {
			t.Fatalf("splitBackupSuffix(%q) = %q, want %q", name, comp, want)
		}
	}
	if sfx, _ := splitBackupSuffix("random.txt"); sfx != "" {
		t.Fatal("expected empty for random.txt")
	}
}

func TestValidateS3Config(t *testing.T) {
	good := S3Config{Endpoint: "https://s3.example.com", Bucket: "b", Region: "us-east-1", AccessKey: "a", SecretKey: "s"}
	if err := ValidateS3Config(good); err != nil {
		t.Fatalf("good config rejected: %v", err)
	}
	bad := []S3Config{
		{Endpoint: "ftp://x", Bucket: "b", AccessKey: "a", SecretKey: "s"},
		{Endpoint: "https://s3.example.com", Bucket: "../evil", AccessKey: "a", SecretKey: "s"},
		{Endpoint: "https://s3.example.com", Bucket: "b", AccessKey: "", SecretKey: "s"},
		{Endpoint: "https://s3.example.com", Bucket: "b", Prefix: "../x", AccessKey: "a", SecretKey: "s"},
	}
	for i, c := range bad {
		if err := ValidateS3Config(c); err == nil {
			t.Fatalf("bad config %d accepted", i)
		}
	}
}

func TestNativeToolMissingShape(t *testing.T) {
	// NativeDump on sqlite engine must error without invoking tools.
	if err := NativeDump("sqlite", "", t.TempDir()+"/x.sql"); err == nil {
		t.Fatal("expected error for sqlite native dump")
	}
	// Missing-tool sentinel carries engine+tool for the fallback path.
	m := &ErrNativeToolMissing{Engine: "postgres", Tool: "pg_dump"}
	if m.Error() == "" {
		t.Fatal("empty error")
	}
}

func TestPruneKeepsNewest(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KSPANEL_DB", filepath.Join(dir, "kspanel.db"))
	// DataDir anchors to KSPANEL_DB's dir while engine is sqlite.
	backupDir := filepath.Join(dir, "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Create 5 fake backups with increasing mtimes. Note fileNamePattern is
	// the literal "kspanel-20060102-150405-" prefix (see backup.go).
	for i := 0; i < 5; i++ {
		name := "kspanel-20060102-150405-20240101-00000" + string(rune('0'+i)) + "-test.db"
		p := filepath.Join(backupDir, name)
		if err := os.WriteFile(p, []byte("data"), 0o644); err != nil {
			t.Fatal(err)
		}
		mt := time.Now().Add(time.Duration(i) * time.Hour)
		_ = os.Chtimes(p, mt, mt)
	}
	_ = config.DataDir // keep import used
	removed, err := Prune(2, 0)
	if err != nil {
		t.Fatalf("Prune failed: %v", err)
	}
	if len(removed) != 3 {
		t.Fatalf("expected 3 pruned, got %d (%v)", len(removed), removed)
	}
	remaining, err := List()
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 2 {
		t.Fatalf("expected 2 remaining, got %d", len(remaining))
	}
}
