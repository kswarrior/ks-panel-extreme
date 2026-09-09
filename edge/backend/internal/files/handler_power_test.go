package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyRecursiveFileAndDir(t *testing.T) {
	root := t.TempDir()
	srcDir := filepath.Join(root, "src")
	if err := os.MkdirAll(filepath.Join(srcDir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "a.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "sub", "b.txt"), []byte("world"), 0o644); err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(root, "dst")
	if err := copyRecursive(srcDir, dst); err != nil {
		t.Fatalf("copyRecursive: %v", err)
	}
	for _, p := range []string{"a.txt", "sub/b.txt"} {
		b, err := os.ReadFile(filepath.Join(dst, p))
		if err != nil {
			t.Fatalf("read %s: %v", p, err)
		}
		if len(b) == 0 {
			t.Errorf("%s copied empty", p)
		}
	}
}

func TestZipRoundTrip(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "data")
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "server.properties"), []byte("motd=hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(root, "out.zip")
	if err := createZip(src, []string{"server.properties"}, dst); err != nil {
		t.Fatalf("createZip: %v", err)
	}
	out := filepath.Join(root, "restored")
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatal(err)
	}
	n, err := extractZip(dst, out)
	if err != nil {
		t.Fatalf("extractZip: %v", err)
	}
	if n != 1 {
		t.Errorf("extractZip count = %d, want 1", n)
	}
	b, err := os.ReadFile(filepath.Join(out, "server.properties"))
	if err != nil || string(b) != "motd=hi\n" {
		t.Errorf("roundtrip content = %q, err = %v", string(b), err)
	}
}

func TestTarGzRoundTrip(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "data")
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "notes.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(root, "out.tar.gz")
	if err := createTarGz(src, []string{"notes.txt"}, dst); err != nil {
		t.Fatalf("createTarGz: %v", err)
	}
	out := filepath.Join(root, "restored")
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatal(err)
	}
	n, err := extractTarGz(dst, out)
	if err != nil {
		t.Fatalf("extractTarGz: %v", err)
	}
	if n != 1 {
		t.Errorf("extractTarGz count = %d, want 1", n)
	}
}

func TestSafeJoinDestRejectsEscape(t *testing.T) {
	dest := t.TempDir()
	for _, evil := range []string{"/etc/passwd", "../evil", "../../x", ".."} {
		if _, ok := safeJoinDest(dest, evil); ok {
			t.Errorf("safeJoinDest(%q) wrongly allowed", evil)
		}
	}
	if _, ok := safeJoinDest(dest, "world/level.dat"); !ok {
		t.Errorf("safeJoinDest(good) wrongly rejected")
	}
}

func TestValidateHostDestRejectsSystem(t *testing.T) {
	for _, p := range []string{"/etc/cron.d/evil", "/proc/self", "/"} {
		if _, err := validateHostDest(p); err == nil {
			t.Errorf("validateHostDest(%q) wrongly allowed", p)
		}
	}
}

func TestArchiveNameDetection(t *testing.T) {
	if !isZipName("backup.ZIP") || isZipName("backup.tar.gz") {
		t.Errorf("isZipName wrong")
	}
	if !isTarGzName("a.tar.gz") || !isTarGzName("a.tgz") || isTarGzName("a.zip") {
		t.Errorf("isTarGzName wrong")
	}
}
