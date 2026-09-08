package files

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
// TestHostFilesWriteOpsRoundtrip drives mkdir → write → rename → delete
// through the real HTTP handler against a temp root, proving the ops work
// and stay jailed end to end.
func TestHostFilesWriteOpsRoundtrip(t *testing.T) {
	root := t.TempDir()
	h := HostFilesHandler("sekrit", root)

	call := func(method, target, body string) (int, map[string]any) {
		t.Helper()
		var rdr *strings.Reader
		if body == "" {
			rdr = strings.NewReader("")
		} else {
			rdr = strings.NewReader(body)
		}
		req := httptest.NewRequest(method, target+"&token=sekrit", rdr)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		var decoded map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &decoded)
		return rec.Code, decoded
	}

	// Wrong token is rejected before anything else.
	req := httptest.NewRequest(http.MethodGet, "/api/edge/hostfiles?op=list&path=/&token=nope", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad token: got %d, want 401", rec.Code)
	}

	// Reads require GET, writes require POST.
	if code, _ := call(http.MethodGet, "/api/edge/hostfiles?op=mkdir&path=/a", ""); code != http.StatusMethodNotAllowed {
		t.Errorf("GET mkdir: got %d, want 405", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=list&path=/", ""); code != http.StatusMethodNotAllowed {
		t.Errorf("POST list: got %d, want 405", code)
	}

	// mkdir + write a file inside it.
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=mkdir&path=/mc-1", ""); code != http.StatusOK {
		t.Fatalf("mkdir: got %d", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=write&path=/mc-1/notes.txt", "hello"); code != http.StatusOK {
		t.Fatalf("write: got %d", code)
	}
	if b, err := os.ReadFile(filepath.Join(root, "mc-1", "notes.txt")); err != nil || string(b) != "hello" {
		t.Fatalf("write content = %q, err = %v", string(b), err)
	}

	// Rename inside the jail works; rename onto an existing name 409s;
	// rename out of the jail 400s.
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=rename&path=/mc-1/notes.txt&to=/mc-1/renamed.txt", ""); code != http.StatusOK {
		t.Errorf("rename: got %d", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=write&path=/mc-1/other.txt", "x"); code != http.StatusOK {
		t.Fatalf("write other: got %d", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=rename&path=/mc-1/renamed.txt&to=/mc-1/other.txt", ""); code != http.StatusConflict {
		t.Errorf("rename onto existing: got %d, want 409", code)
	}
	// Above-root `to` values clamp inside the jail ("/../../evil.txt"
	// cleans to "<root>/evil.txt") — the file must land inside the root,
	// never on the host's own filesystem.
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=rename&path=/mc-1/renamed.txt&to=/../../evil.txt", ""); code != http.StatusOK {
		t.Errorf("rename clamped: got %d, want 200", code)
	}
	if b, err := os.ReadFile(filepath.Join(root, "evil.txt")); err != nil || string(b) != "hello" {
		t.Errorf("clamped rename content = %q, err = %v", string(b), err)
	}
	// A `to` smuggled through an in-jail symlink pointing outside is
	// refused.
	if err := os.Symlink(string(filepath.Separator)+"etc", filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=write&path=/mc-1/victim.txt", "x"); code != http.StatusOK {
		t.Fatalf("write victim: got %d", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=rename&path=/mc-1/victim.txt&to=/link/victim.txt", ""); code != http.StatusBadRequest {
		t.Errorf("rename via symlink escape: got %d, want 400", code)
	}

	// Delete the files, then the directory recursively.
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=delete&path=/evil.txt", ""); code != http.StatusOK {
		t.Errorf("delete file: got %d", code)
	}
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=delete&path=/mc-1", ""); code != http.StatusOK {
		t.Errorf("delete dir: got %d", code)
	}
	if _, err := os.Stat(filepath.Join(root, "mc-1")); !os.IsNotExist(err) {
		t.Errorf("mc-1 still exists after recursive delete")
	}

	// The root itself can never be deleted.
	if code, _ := call(http.MethodPost, "/api/edge/hostfiles?op=delete&path=/", ""); code != http.StatusBadRequest {
		t.Errorf("delete root: got %d, want 400", code)
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

// TestHostFilesDeleteDirIsInstant is the regression test for the "0 of 1
// deleted … Gateway error (502)" report: deleting a big world-like tree
// must answer 200 near-instantly (rename-away) instead of holding the
// request open for the whole recursive unlink, which outlived the proxies
// in front of the panel. The name must be gone from the very next listing,
// and the staged trash must drain in the background.
func TestHostFilesDeleteDirIsInstant(t *testing.T) {
	root := t.TempDir()
	for d := 0; d < 200; d++ {
		dir := filepath.Join(root, "mc", "world", fmt.Sprintf("region-%03d", d))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		for f := 0; f < 150; f++ {
			if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("r.%03d.mca", f)), make([]byte, 4096), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	h := HostFilesHandler("sekrit", root)

	start := time.Now()
	req := httptest.NewRequest(http.MethodPost, "/api/edge/hostfiles?op=delete&path=/mc&token=sekrit", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	el := time.Since(start)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete dir: got %d (%s), want 200", rec.Code, rec.Body.String())
	}
	// 30k files must not hold the request: generous 10s budget so slow CI
	// never flakes (the synchronous walk this replaced took ~0.3s here and
	// minutes on loaded spinning disks).
	if el > 10*time.Second {
		t.Errorf("delete dir held the request for %v, want near-instant rename-away", el)
	}
	// The name is gone from the very next listing, even while the disk
	// is still reclaiming in the background.
	lreq := httptest.NewRequest(http.MethodGet, "/api/edge/hostfiles?op=list&path=/&token=sekrit", nil)
	lrec := httptest.NewRecorder()
	h.ServeHTTP(lrec, lreq)
	if lrec.Code != http.StatusOK {
		t.Fatalf("list after delete: got %d", lrec.Code)
	}
	var listed struct {
		Entries []Entry `json:"entries"`
	}
	if err := json.Unmarshal(lrec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("list decode: %v", err)
	}
	for _, e := range listed.Entries {
		if e.Name == "mc" {
			t.Fatalf("mc still listed right after delete")
		}
		if strings.HasPrefix(e.Name, trashPrefix) {
			t.Fatalf("trash %q visible in listing", e.Name)
		}
	}
	// The staged trash must drain on its own (background RemoveAll).
	deadline := time.Now().Add(30 * time.Second)
	for {
		leftovers, _ := filepath.Glob(filepath.Join(root, trashPrefix+"*"))
		if len(leftovers) == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("trash never drained: %v", leftovers)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// TestSweepStaleTrashKeepsOperatorData proves the lazy GC only finishes our
// own orphaned trash: fresh trash is left for its live background removal,
// and operator files/dirs — even dotfiles, even ones starting with a
// similar prefix — are never touched.
func TestSweepStaleTrashKeepsOperatorData(t *testing.T) {
	root := t.TempDir()
	old := time.Now().Add(-25 * time.Hour)
	mk := func(name string, backdate bool) {
		p := filepath.Join(root, name)
		if strings.HasSuffix(name, ".txt") {
			if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
		} else if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		if backdate {
			if err := os.Chtimes(p, old, old); err != nil {
				t.Fatal(err)
			}
		}
	}
	mk(trashPrefix+"old-1", true)   // orphaned: must go
	mk(trashPrefix+"fresh-1", false) // live removal: must stay
	mk(".mydot", true)               // operator dotdir, old: must stay
	mk(trashPrefix+"note.txt", true) // trash-prefixed FILE, old: must stay (dirs only)
	mk("mc", false)                  // ordinary dir: must stay

	sweepStaleTrash(root)

	if _, err := os.Stat(filepath.Join(root, trashPrefix+"old-1")); !os.IsNotExist(err) {
		t.Errorf("stale trash not swept")
	}
	for _, keep := range []string{trashPrefix + "fresh-1", ".mydot", trashPrefix + "note.txt", "mc"} {
		if _, err := os.Stat(filepath.Join(root, keep)); err != nil {
			t.Errorf("%s should survive the sweep, stat: %v", keep, err)
		}
	}
}
