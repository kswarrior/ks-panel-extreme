package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestHostJailResolveKeepsPathsInsideRoot covers the security contract of
// the node Files tab: whatever `path` the panel sends, the resolved
// absolute path must stay inside the instances root.
func TestHostJailResolveKeepsPathsInsideRoot(t *testing.T) {
	root := t.TempDir()
	jail, err := newHostJail(root)
	if err != nil {
		t.Fatalf("newHostJail: %v", err)
	}
	// Seed: a subdir, a file, an in-jail symlink (allowed) and an
	// escaping symlink (must be refused).
	if err := os.MkdirAll(filepath.Join(root, "mc-1", "world"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "mc-1", "server.jar"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "mc-1"), filepath.Join(root, "alias")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(string(filepath.Separator)+"etc", filepath.Join(root, "evil")); err != nil {
		t.Fatal(err)
	}

	ok := []string{"", "/", "/mc-1", "/mc-1/", "mc-1", "/mc-1/world", "/alias", "/alias/world", "/nope/deep/path",
		// Above-root traversals clamp back inside the jail ("/.." cleans
		// to "/", "../etc" to "<root>/etc") — they must resolve, never
		// escape to the host's own paths.
		"..", "../etc", "/..", "/../..", "/mc-1/../..", "/mc-1/../../etc"}
	for _, rel := range ok {
		if _, err := jail.resolve(rel); err != nil {
			t.Errorf("resolve(%q) wrongly rejected: %v", rel, err)
		}
	}
	// None of the accepted above-root forms may land outside the root.
	for _, rel := range []string{"..", "../etc", "/..", "/../..", "/mc-1/../..", "/mc-1/../../etc"} {
		got, err := jail.resolve(rel)
		if err != nil {
			t.Fatalf("resolve(%q): %v", rel, err)
		}
		if got != root && !strings.HasPrefix(got, root+string(filepath.Separator)) {
			t.Errorf("resolve(%q) = %q, outside root %q", rel, got, root)
		}
	}
	bad := []string{"/evil", "/evil/passwd"}
	for _, rel := range bad {
		if got, err := jail.resolve(rel); err == nil {
			t.Errorf("resolve(%q) escaped the jail to %q, want rejection", rel, got)
		}
	}
}

// TestCloneRepoNameDerivesSafeNames checks the git-clone destination
// sanitiser: only clean repo names pass, everything shaped like a flag,
// traversal or shell metachar is rejected.
func TestCloneRepoNameDerivesSafeNames(t *testing.T) {
	ok := map[string]string{
		"https://github.com/example/repo.git":      "repo",
		"https://github.com/example/repo":          "repo",
		"https://github.com/example/my-mod_2_pack": "my-mod_2_pack",
		"http://git.local:3000/a/b.git":            "b",
	}
	for raw, want := range ok {
		got, err := cloneRepoName(raw)
		if err != nil {
			t.Errorf("cloneRepoName(%q): %v", raw, err)
			continue
		}
		if got != want {
			t.Errorf("cloneRepoName(%q) = %q, want %q", raw, got, want)
		}
	}
	bad := []string{
		"",
		"not a url",
		"git@github.com:example/repo.git", // scp syntax: no scheme
		"ssh://git@github.com/example/repo.git",
		"git://github.com/example/repo.git",
		"ftp://github.com/example/repo.git",
		"https://github.com/",
		"https://github.com/.git",
		"https://github.com/-evil.git", // would look like a flag
		"https://github.com/.hidden.git",
		"https://github.com/a b.git",
		"https://github.com/;rm -rf.git",
		"https:///repo.git",
	}
	for _, raw := range bad {
		if got, err := cloneRepoName(raw); err == nil {
			t.Errorf("cloneRepoName(%q) = %q, want rejection", raw, got)
		}
	}
}
// TestNewHostJailRejectsBadRoots ensures a missing/relative instances dir
// fails closed at handler construction instead of jailing to ".".
func TestNewHostJailRejectsBadRoots(t *testing.T) {
	for _, root := range []string{"", "   ", ".", "relative/path"} {
		if _, err := newHostJail(root); err == nil {
			t.Errorf("newHostJail(%q) accepted, want rejection", root)
		}
	}
	if _, err := newHostJail(t.TempDir()); err != nil {
		t.Errorf("newHostJail(tempdir): %v", err)
	}
}
