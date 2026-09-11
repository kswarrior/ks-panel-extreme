package pageaction

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/example/ksedge/internal/drivers"
)

// fakeDriver is a canned Driver for handler round-trips: every Exec pops
// the next queued response (stdout/stderr/exit code) and records the
// dispatched shell program for assertions.
type fakeDriver struct {
	responses []fakeResp
	calls     [][]string
}

type fakeResp struct {
	stdout string
	stderr string
	code   int
}

func (f *fakeDriver) Name() string { return "pafake" }
func (f *fakeDriver) Deploy(ctx context.Context, name string, cfg map[string]any) (drivers.Result, error) {
	return drivers.Result{}, nil
}
func (f *fakeDriver) Start(ctx context.Context, name string) (drivers.Result, error) {
	return drivers.Result{}, nil
}
func (f *fakeDriver) Stop(ctx context.Context, name string) (drivers.Result, error) {
	return drivers.Result{}, nil
}
func (f *fakeDriver) Kill(ctx context.Context, name string) (drivers.Result, error) {
	return drivers.Result{}, nil
}
func (f *fakeDriver) Destroy(ctx context.Context, name string) (drivers.Result, error) {
	return drivers.Result{}, nil
}
func (f *fakeDriver) Attach(ctx context.Context, name string) (*drivers.ExecSession, error) {
	return nil, context.DeadlineExceeded
}
func (f *fakeDriver) Runner(ctx context.Context, name string) (string, string, string, string, error) {
	return "", "", "", "", nil
}
func (f *fakeDriver) UpdatePorts(ctx context.Context, name string, allocs []drivers.PortAllocation) error {
	return nil
}
func (f *fakeDriver) Snapshot(ctx context.Context, name, action, snapName, snapType, location string) (string, int64, error) {
	return "", 0, nil
}

func (f *fakeDriver) Exec(ctx context.Context, name string, tty bool, cols, rows int, command []string) (*drivers.ExecSession, error) {
	f.calls = append(f.calls, command)
	var r fakeResp
	if len(f.responses) > 0 {
		r = f.responses[0]
		f.responses = f.responses[1:]
	}
	outR, outW := io.Pipe()
	errR, errW := io.Pipe()
	go func() {
		_, _ = outW.Write([]byte(r.stdout))
		_ = outW.Close()
	}()
	go func() {
		_, _ = errW.Write([]byte(r.stderr))
		_ = errW.Close()
	}()
	return &drivers.ExecSession{
		Stdin:  nopWC{io.Discard},
		Stdout: outR,
		Stderr: errR,
		Wait:   func() (int, error) { return r.code, nil },
		Close:  func() error { return nil },
	}, nil
}

func withFakeDriver(t *testing.T, fd *fakeDriver) {
	t.Helper()
	drivers.Registry[fd.Name()] = fd
	t.Cleanup(func() { delete(drivers.Registry, fd.Name()) })
}

// ---- pure validators --------------------------------------------------------

func TestValidActionMode(t *testing.T) {
	for _, m := range []string{"644", "0755", "0644", "777", "0000", "0777"} {
		if !validActionMode(m) {
			t.Errorf("%q should be valid", m)
		}
	}
	// Charset-valid but over the 0o777 setuid/setgid/sticky cap.
	for _, m := range []string{"", "abc", "999", "7555", "7777", "1755", "06444", "64"} {
		if validActionMode(m) {
			t.Errorf("%q should be INVALID", m)
		}
	}
}

func TestSanitizeArchiveName(t *testing.T) {
	for _, n := range []string{"level.dat", "playerdata/uuid.dat", "./x", "a/./b", "a//b"} {
		if _, ok := sanitizeArchiveName(n); !ok {
			t.Errorf("%q should be accepted", n)
		}
	}
	for _, n := range []string{"", ".", "/", "../escape", "..", "/abs", "a/../../e", "a/../.."} {
		if _, ok := sanitizeArchiveName(n); ok {
			t.Errorf("%q should be rejected", n)
		}
	}
}

func TestSafeArchiveEntry(t *testing.T) {
	for _, n := range []string{"level.dat", "sub/dir/file", "./x"} {
		if !safeArchiveEntry(n) {
			t.Errorf("%q should be safe", n)
		}
	}
	for _, n := range []string{"", "/abs", "../e", "a/../../e", "/"} {
		if safeArchiveEntry(n) {
			t.Errorf("%q should be UNSAFE", n)
		}
	}
}

func TestParseStatOutput(t *testing.T) {
	e, err := parseStatOutput("server.properties|123|644|regular file|1700000000\n")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if e.Name != "server.properties" || e.Size != 123 || e.Mode != "644" || e.IsDir || e.ModTime != 1700000000 {
		t.Fatalf("entry = %+v", e)
	}
	// A '|' inside the filename still parses (split runs from the right).
	e, err = parseStatOutput("/data/a|b.txt|9|644|regular file|42\n")
	if err != nil || e.Name != "a|b.txt" || e.Size != 9 {
		t.Fatalf("pipe-name parse = %+v, %v", e, err)
	}
	if _, err := parseStatOutput("garbage\n"); err == nil {
		t.Fatal("garbage must error")
	}
}

func TestParseArchiveNameListCap(t *testing.T) {
	big := strings.Repeat("f\n", maxArchiveEntries+1)
	if _, err := parseArchiveNameList(big); err == nil {
		t.Fatal("over-count listing must error")
	}
	if got, err := parseArchiveNameList("a\nb\n"); err != nil || len(got) != 2 {
		t.Fatalf("small listing = %v, %v", got, err)
	}
}

func TestParseUnzipListTotal(t *testing.T) {
	raw := "Archive:  a.zip\n  Length      Date    Time    Name\n" +
		"---------  ---------- -----   ----\n" +
		"     1234  2024-01-01 00:00   a\n" +
		"---------                     -------\n" +
		"     1234                     1 file\n"
	total, ok := parseUnzipListTotal(raw)
	if !ok || total != 1234 {
		t.Fatalf("total = %d, %v", total, ok)
	}
	if _, ok := parseUnzipListTotal("no total here\n"); ok {
		t.Fatal("missing total must report unknown")
	}
}

func TestParseTarListTotal(t *testing.T) {
	raw := "-rw-r--r-- u/g 100 2024-01-01 a\n-rw-r--r-- u/g 200 2024-01-01 b\n"
	if total := parseTarListTotal(raw); total != 300 {
		t.Fatalf("total = %d", total)
	}
}

// ---- handler round-trips (fake driver, real HTTP path) ----------------------

func TestHandlerStatRoundTrip(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{
		{stdout: "server.properties|123|644|regular file|1700000000\n"},
	}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"stat","path":"/data/server.properties"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d (%+v)", code, out)
	}
	if !out.OK {
		t.Fatalf("out = %+v", out)
	}
	raw, _ := json.Marshal(out.Data)
	var entry FileEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("data decode: %v", err)
	}
	if entry.Name != "server.properties" || entry.Size != 123 || entry.Mode != "644" {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestHandlerStatMissingPath(t *testing.T) {
	fd := &fakeDriver{}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	_, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"stat"}`)
	if out.OK {
		t.Fatal("missing path must fail")
	}
	if len(fd.calls) != 0 {
		t.Fatal("validation must fail before any container exec")
	}
}

func TestHandlerChmodRoundTrip(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{{}}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"chmod","path":"/data/x","mode":"0644"}`)
	if code != http.StatusOK || !out.OK {
		t.Fatalf("status = %d (%+v)", code, out)
	}
	prog := strings.Join(fd.calls[0], " ")
	if !strings.Contains(prog, "chmod 0644") {
		t.Fatalf("dispatched program missing chmod mode: %q", prog)
	}
}

func TestHandlerChmodBadMode(t *testing.T) {
	for _, body := range []string{
		`{"token":"sekret","kind":"pafake","name":"i","type":"chmod","path":"/data/x","mode":"999"}`,
		`{"token":"sekret","kind":"pafake","name":"i","type":"chmod","path":"/data/x","mode":"7777"}`,
		`{"token":"sekret","kind":"pafake","name":"i","type":"chmod","path":"/data/x"}`,
	} {
		fd := &fakeDriver{}
		withFakeDriver(t, fd)
		h := Handler("sekret")
		_, out := postAction(t, h, body)
		if out.OK {
			t.Fatalf("bad mode must fail: %s", body)
		}
		if len(fd.calls) != 0 {
			t.Fatalf("mode validation must precede exec: %s", body)
		}
	}
}

func TestHandlerArchiveRoundTrip(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{{}}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"archive","path":"/data/world","names":["level.dat"],"dest":"/tmp/a.tar.gz"}`)
	if code != http.StatusOK || !out.OK {
		t.Fatalf("status = %d (%+v)", code, out)
	}
	prog := strings.Join(fd.calls[0], " ")
	if !strings.Contains(prog, "tar -czf") || !strings.Contains(prog, "level.dat") {
		t.Fatalf("dispatched program wrong: %q", prog)
	}
}

func TestHandlerArchiveValidation(t *testing.T) {
	for _, body := range []string{
		// bad dest extension
		`{"token":"sekret","kind":"pafake","name":"i","type":"archive","path":"/data/world","dest":"/tmp/a.bin"}`,
		// traversal entry
		`{"token":"sekret","kind":"pafake","name":"i","type":"archive","path":"/data/world","names":["../e"],"dest":"/tmp/a.zip"}`,
		// missing dest
		`{"token":"sekret","kind":"pafake","name":"i","type":"archive","path":"/data/world"}`,
	} {
		fd := &fakeDriver{}
		withFakeDriver(t, fd)
		h := Handler("sekret")
		_, out := postAction(t, h, body)
		if out.OK {
			t.Fatalf("invalid archive def must fail: %s", body)
		}
		if len(fd.calls) != 0 {
			t.Fatalf("archive validation must precede exec: %s", body)
		}
	}
}

func TestHandlerExtractRoundTrip(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{
		{stdout: "level.dat\n"}, // member listing
		{stdout: "Archive:  a.zip\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n     10  2024-01-01 00:00   level.dat\n---------                     -------\n     10                     1 file\n"}, // size listing
		{stdout: ""}, // extraction
	}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"extract","path":"/tmp/a.zip","dest":"/data/r"}`)
	if code != http.StatusOK || !out.OK {
		t.Fatalf("status = %d (%+v)", code, out)
	}
	if len(fd.calls) != 3 {
		t.Fatalf("extract must list + size-check + unpack, calls = %d", len(fd.calls))
	}
}

func TestHandlerExtractZipSlipBlocked(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{
		{stdout: "../evil\n"},
	}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	_, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"extract","path":"/tmp/a.zip"}`)
	if out.OK {
		t.Fatal("unsafe member must fail the action closed")
	}
	if len(fd.calls) != 1 {
		t.Fatalf("must stop after the listing, calls = %d", len(fd.calls))
	}
}

func TestHandlerExtractBombCountBlocked(t *testing.T) {
	fd := &fakeDriver{responses: []fakeResp{
		{stdout: strings.Repeat("f\n", maxArchiveEntries+1)},
	}}
	withFakeDriver(t, fd)
	h := Handler("sekret")
	_, out := postAction(t, h, `{"token":"sekret","kind":"pafake","name":"i","type":"extract","path":"/tmp/a.tar.gz"}`)
	if out.OK || !strings.Contains(out.Error, "exceeds") {
		t.Fatalf("over-count archive must fail closed, out = %+v", out)
	}
}

func TestHandlerNewTypesUnknownDriver(t *testing.T) {
	h := Handler("sekret")
	code, out := postAction(t, h, `{"token":"sekret","kind":"nope","name":"i","type":"stat","path":"/x"}`)
	if code != http.StatusBadRequest || out.OK {
		t.Fatalf("unknown driver must 400, got %d %+v", code, out)
	}
}
