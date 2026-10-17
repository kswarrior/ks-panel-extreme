//go:build modengine_goja

package modengine

import (
	"errors"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"github.com/example/kspanel/internal/models"
)

// fakeOps is a scriptable HostOps provider for binding tests. Only DBQuery is
// meaningful; everything else fails loudly so an accidentally-enabled binding
// path is caught rather than silently no-op'ing.
type fakeOps struct {
	queries  []string
	affected int64
}

func (f *fakeOps) DBQuery(sql string, args []any) ([]map[string]any, error) {
	f.queries = append(f.queries, sql)
	return []map[string]any{{"id": int64(1), "slug": "demo"}}, nil
}
func (f *fakeOps) DBExec(sql string, args []any) (int64, error) {
	f.queries = append(f.queries, sql)
	return f.affected, nil
}
func (f *fakeOps) FSList(int64, string) ([]FileInfo, error) {
	return []FileInfo{{Name: "server.properties", Size: 42}}, nil
}
func (f *fakeOps) FSRead(int64, string) (string, error) { return "hello", nil }
func (f *fakeOps) FSWrite(int64, string, string) error  { return nil }
func (f *fakeOps) Exec(int64, string, int) (ExecResult, error) {
	return ExecResult{ExitCode: 0, Stdout: "ok"}, nil
}
func (f *fakeOps) Control(int64, string) (string, error) { return "running", nil }
func (f *fakeOps) ConsoleSend(int64, string) (ExecResult, error) {
	return ExecResult{ExitCode: 0, Stdout: "said"}, nil
}

// newSandbox builds a bare gojaRuntime with the ks host object installed and
// no script evaluated — the test then drives bindings from JS directly.
func newSandbox(t *testing.T, env HostEnv) (*gojaRuntime, *goja.Runtime) {
	t.Helper()
	rt := &gojaRuntime{slug: "test-mod", host: env}
	vm := goja.New()
	rt.vm = vm
	if err := vm.Set("ks", rt.buildKS(vm)); err != nil {
		t.Fatalf("inject ks: %v", err)
	}
	return rt, vm
}

func runJS(t *testing.T, vm *goja.Runtime, src string) goja.Value {
	t.Helper()
	v, err := vm.RunString(src)
	if err != nil {
		t.Fatalf("eval %q: %v", src, err)
	}
	return v
}

// resultObject asserts the {ok, error} shape bindings return and hands back
// the exported map.
func resultObject(t *testing.T, v goja.Value, context string) map[string]any {
	t.Helper()
	obj, ok := v.Export().(map[string]any)
	if !ok {
		t.Fatalf("%s: expected object result, got %T (%v)", context, v.Export(), v.Export())
	}
	return obj
}

func TestBindingDeniesWithoutCapability(t *testing.T) {
	env := &hostEnv{slug: "test-mod", caps: map[string]bool{}, perms: map[string]bool{}, ops: &fakeOps{}}
	_, vm := newSandbox(t, env)

	for _, src := range []string{
		`ks.files.list(1, "/")`,
		`ks.files.read(1, "/x")`,
		`ks.files.write(1, "/x", "y")`,
		`ks.exec(1, "id")`,
		`ks.console.send(1, "say hi")`,
		`ks.container.action(1, "start")`,
		`ks.vm.action(1, "stop")`,
		`ks.db.query("SELECT 1")`,
		`ks.db.exec("DELETE FROM t")`,
	} {
		res := resultObject(t, runJS(t, vm, src), src)
		if res["ok"] != false {
			t.Errorf("%s: expected ok=false, got %v", src, res)
		}
		msg, _ := res["error"].(string)
		if !strings.Contains(msg, "not granted") {
			t.Errorf("%s: expected capability denial, got %q", src, msg)
		}
	}
}

func TestDBQueryGranted(t *testing.T) {
	ops := &fakeOps{}
	env := &hostEnv{slug: "test-mod", caps: map[string]bool{models.CapDatabaseRead: true}, perms: map[string]bool{}, ops: ops}
	_, vm := newSandbox(t, env)

	res := resultObject(t, runJS(t, vm, `ks.db.query("SELECT id, slug FROM mods WHERE slug = ?", ["demo"])`), "db.query")
	if res["ok"] != true {
		t.Fatalf("expected ok=true, got %v", res)
	}
	rows, ok := res["data"].([]any)
	if !ok || len(rows) != 1 {
		t.Fatalf("expected one row, got %v", res["data"])
	}
	if len(ops.queries) != 1 {
		t.Fatalf("expected provider called once, got %d", len(ops.queries))
	}
}

func TestDBExecRequiresReadWrite(t *testing.T) {
	readOnlyEnv := &hostEnv{slug: "m", caps: map[string]bool{models.CapDatabaseRead: true}, perms: map[string]bool{}, ops: &fakeOps{}}
	_, vm := newSandbox(t, readOnlyEnv)
	res := resultObject(t, runJS(t, vm, `ks.db.exec("DELETE FROM t WHERE id = ?", [1])`), "db.exec read-only")
	if res["ok"] != false || !strings.Contains(res["error"].(string), models.CapDatabaseReadWrite) {
		t.Fatalf("expected read_write denial, got %v", res)
	}

	ops := &fakeOps{affected: 3}
	rwEnv := &hostEnv{slug: "m", caps: map[string]bool{models.CapDatabaseReadWrite: true}, perms: map[string]bool{}, ops: ops}
	_, vm2 := newSandbox(t, rwEnv)
	res2 := resultObject(t, runJS(t, vm2, `ks.db.exec("DELETE FROM t WHERE id = ?", [1])`), "db.exec read-write")
	if res2["ok"] != true {
		t.Fatalf("expected ok=true, got %v", res2)
	}
	data, ok := res2["data"].(map[string]any)
	if !ok || data["affected"] != int64(3) {
		t.Fatalf("expected affected=3, got %v", res2["data"])
	}
}

func TestDBQueryRejectsBadSQL(t *testing.T) {
	ops := &fakeOps{}
	env := &hostEnv{slug: "m", caps: map[string]bool{models.CapDatabaseRead: true}, perms: map[string]bool{}, ops: ops}
	_, vm := newSandbox(t, env)

	res := resultObject(t, runJS(t, vm, `ks.db.query("DROP TABLE mods")`), "bad query")
	if res["ok"] != false {
		t.Fatalf("expected rejection, got %v", res)
	}
	if len(ops.queries) != 0 {
		t.Fatalf("provider must not be called for rejected SQL, got %v", ops.queries)
	}
}

func TestFilesAndControlGranted(t *testing.T) {
	env := &hostEnv{
		slug:  "test-mod",
		caps:  map[string]bool{models.CapFilesystem: true, models.CapContainerControl: true, models.CapTerminal: true},
		perms: map[string]bool{},
		ops:   &fakeOps{},
	}
	_, vm := newSandbox(t, env)

	res := resultObject(t, runJS(t, vm, `ks.files.list(7, "/srv")`), "files.list")
	if res["ok"] != true {
		t.Fatalf("files.list failed: %v", res)
	}
	files, ok := res["data"].([]any)
	if !ok || len(files) != 1 {
		t.Fatalf("expected one file entry, got %v", res["data"])
	}
	entry, _ := files[0].(map[string]any)
	if entry["name"] != "server.properties" {
		t.Fatalf("unexpected entry: %v", entry)
	}

	res = resultObject(t, runJS(t, vm, `ks.files.read(7, "/etc/motd")`), "files.read")
	if res["ok"] != true || res["data"] != "hello" {
		t.Fatalf("files.read failed: %v", res)
	}

	res = resultObject(t, runJS(t, vm, `ks.container.action(7, "start")`), "container.action")
	if res["ok"] != true {
		t.Fatalf("container.action failed: %v", res)
	}

	res = resultObject(t, runJS(t, vm, `ks.console.send(7, "say hi")`), "console.send")
	if res["ok"] != true {
		t.Fatalf("console.send failed: %v", res)
	}

	res = resultObject(t, runJS(t, vm, `ks.container.action(7, "restart")`), "bad action")
	if res["ok"] != false {
		t.Fatalf("expected action rejection, got %v", res)
	}
}

func TestPermissionsAndCapabilities(t *testing.T) {
	env := &hostEnv{
		slug:  "cool-mod",
		caps:  map[string]bool{models.CapFilesystem: true, models.CapTerminal: true},
		perms: map[string]bool{"cool-mod:backup.run": true},
		ops:   &fakeOps{},
	}
	_, vm := newSandbox(t, env)

	if v := runJS(t, vm, `ks.permissions.has("backup.run")`); v.ToBoolean() != true {
		t.Fatalf("bare key should resolve via slug qualification")
	}
	if v := runJS(t, vm, `ks.permissions.has("cool-mod:backup.run")`); v.ToBoolean() != true {
		t.Fatalf("qualified key should resolve")
	}
	if v := runJS(t, vm, `ks.permissions.has("other")`); v.ToBoolean() != false {
		t.Fatalf("ungranted permission must be false")
	}

	res := resultObject(t, runJS(t, vm, `ks.capabilities.list()`), "capabilities.list")
	if res["ok"] != true {
		t.Fatalf("capabilities.list failed: %v", res)
	}
	caps, ok := res["data"].([]any)
	if !ok || len(caps) != 2 {
		t.Fatalf("expected two capabilities, got %v", res["data"])
	}

	res = resultObject(t, runJS(t, vm, `ks.permissions.list()`), "permissions.list")
	perms, ok := res["data"].([]any)
	if !ok || len(perms) != 1 || perms[0] != "cool-mod:backup.run" {
		t.Fatalf("expected the granted permission, got %v", res["data"])
	}
}

// failingOps proves provider errors surface as structured failures instead of
// panics crossing the VM boundary.
type failingOps struct{ fakeOps }

func (f *failingOps) FSRead(int64, string) (string, error) { return "", errors.New("edge unreachable") }

func TestProviderErrorSurfaces(t *testing.T) {
	env := &hostEnv{slug: "m", caps: map[string]bool{models.CapFilesystem: true}, perms: map[string]bool{}, ops: &failingOps{}}
	_, vm := newSandbox(t, env)
	res := resultObject(t, runJS(t, vm, `ks.files.read(1, "/x")`), "files.read err")
	if res["ok"] != false || !strings.Contains(res["error"].(string), "edge unreachable") {
		t.Fatalf("expected provider error surfaced, got %v", res)
	}
}

func TestNilHostDeniesClosed(t *testing.T) {
	_, vm := newSandbox(t, nil)
	res := resultObject(t, runJS(t, vm, `ks.db.query("SELECT 1")`), "nil host")
	if res["ok"] != false {
		t.Fatalf("nil host must deny, got %v", res)
	}
}
