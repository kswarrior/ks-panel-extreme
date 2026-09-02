package drivers

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"unicode"
)

// asStringMap peels an untyped config value into map[string]string with
// coercion of common JSON-decoded scalars. A non-map or empty map returns
// an empty map so callers can safely range without nil checks.
func asStringMap(v any) map[string]string {
	out := map[string]string{}
	switch m := v.(type) {
	case map[string]any:
		for k, val := range m {
			if val == nil {
				continue
			}
			out[k] = anyToString(val)
		}
	case map[string]string:
		return m
	}
	return out
}

// asStringList accepts either []string (when JSON decoded into a typed
// struct) or []any (the common path) and returns a []string. Anything else
// returns an empty slice.
func asStringList(v any) []string {
	switch sl := v.(type) {
	case []string:
		return sl
	case []any:
		out := make([]string, 0, len(sl))
		for _, it := range sl {
			out = append(out, anyToString(it))
		}
		return out
	}
	return nil
}

// asPorts accepts a flexible JSON shape: a slice of typed port mappings
// or a slice of map[string]any (what JSON decoding produces) and produces
// a normalised []portMapping.
func asPorts(v any) []portMapping {
	out := []portMapping{}
	switch sl := v.(type) {
	case []portMapping:
		return sl
	case []PortAllocation:
		for _, p := range sl {
			out = append(out, portMapping{Host: p.Host, Container: p.Container, Protocol: p.Protocol, IP: p.IP})
		}
	case []any:
		for _, it := range sl {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			pm := portMapping{}
			if n, ok := m["host"].(float64); ok {
				pm.Host = int(n)
			} else if n2, ok := m["host_port"].(float64); ok {
				pm.Host = int(n2)
			}
			if n, ok := m["container"].(float64); ok {
				pm.Container = int(n)
			} else if n2, ok := m["container_port"].(float64); ok {
				pm.Container = int(n2)
			}
			if s, ok := m["protocol"].(string); ok {
				pm.Protocol = s
			}
			if s, ok := m["ip"].(string); ok {
				pm.IP = s
			}
			out = append(out, pm)
		}
	}
	return out
}

// asMounts flattens the `mounts` and `volumes` keys of the spec into a
// list of docker -v compatible strings ("host:container" or
// "host:container:mode"). We accept three shapes, one per layer of the
// panel's template form:
//
//   - panel mounts: [{"host":..,"container":..,"mode":"rw"}, …]
//   - docker[array]: [["/h","/c","ro"], …] or ["/h:/c:ro", …]
//   - docker explicit: {"/h:/c:ro": {}}  (compose-style hashed volumes)
//
// The dispatchers live in the driver (not the panel) because the panel's
// spec is opaque JSON — files.go / docker.go only need the typed []string.
func asMounts(mounts any, volumes any) []string {
	out := []string{}
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	// First source: `mounts` (panel form format — objects written as
	// {source, target, mode} by TemplateForm/InstanceForm, plus the legacy
	// {host, container, mode} shape builtin templates and hand-written JSON
	// use, plus a {host, container, mode} tolerance for symmetry with the
	// volumes block). The form's canonical on-disk shape is source/target;
	// without the aliases every bind authored through the template editor was
	// silently dropped at deploy time (no `-v` flag reached docker).
	if entries, ok := mounts.([]any); ok {
		for _, it := range entries {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			h := firstOf(m, "host", "source")
			c := firstOf(m, "container", "target", "destination")
			if h == "" || c == "" {
				if arr, ok := it.([]any); ok && len(arr) >= 2 {
					h, c = anyToString(arr[0]), anyToString(arr[1])
				}
			}
			if h == "" || c == "" {
				continue
			}
			mode := firstOf(m, "mode")
			if mode == "" {
				if ro, ok := m["read_only"].(bool); ok && ro {
					mode = "ro"
				}
			}
			if mode == "" && it != nil {
				if arr, ok := it.([]any); ok && len(arr) >= 3 {
					mode = anyToString(arr[2])
				}
			}
			if mode == "" {
				add(h + ":" + c)
			} else {
				add(h + ":" + c + ":" + mode)
			}
		}
	}
	// Second source: `volumes` (docker native). Accept both list and map.
	switch v := volumes.(type) {
	case []any:
		for _, it := range v {
			if s, ok := it.(string); ok {
				add(s)
			} else if arr, ok := it.([]any); ok {
				parts := make([]string, 0, len(arr))
				for _, e := range arr {
					parts = append(parts, anyToString(e))
				}
				if len(parts) >= 2 {
					add(strings.Join(parts, ":"))
				}
			} else if mp, ok := it.(map[string]any); ok {
				h, _ := mp["host"].(string)
				c, _ := mp["container"].(string)
				if h != "" && c != "" {
					add(h + ":" + c)
				}
			}
		}
	case map[string]any:
		// compose-style hashed map: bind_spec -> {}
		for bind := range v {
			add(bind)
		}
	case map[string]string:
		for bind := range v {
			add(bind)
		}
	}
	return out
}

// gets the flag form it understands without the operator having to type
// hyphens in the JSON spec.
func camelToKebab(s string) string {
	var b strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) && i > 0 {
			if !unicode.IsUpper(rune(s[i-1])) {
				b.WriteRune('-')
			}
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// trim strips whitespace from driver stdout (e.g. the trailing newline
// docker prints after the container ID).
func trim(s string) string { return strings.TrimSpace(s) }

// openPipe creates a fresh os.Pipe. Pulled out as a helper so the drivers'
// Exec implementations stay symmetric and CI/one-off tests can swap in a
// virtual pipe pair if they ever need to.
func openPipe() (*os.File, *os.File, error) {
	return os.Pipe()
}

// startPiped wires an os.Pipe triplet to cmd's stdin/stdout/stderr, calls
// cmd.Start(), and — crucially — closes the parent's copies of the
// stdout/stderr write ends before returning.
//
// Closing the parent's stdout/stderr write ends is load-bearing: without it
// the readers handed back here never see EOF after the child exits (the parent
// itself still holds a write fd to the same pipe), so io.ReadAll on stdoutR
// blocks forever and cmd.Wait() (which waits for I/O copy to drain) hangs
// until Go's GC finaliser happens to close those fds some indefinite time
// later. The child inherits its own copies of the write fds across the
// fork+exec, so closing the parent's copies is safe — the child keeps writing
// until it exits, at which point its copies close and the readers see EOF.
//
// The stdin write end is returned to the caller so a terminal bridge can keep
// feeding bytes; the caller is responsible for closing it when the session
// ends (that's what triggers the child to see stdin EOF).
//
// stdoutR/stderrR are the read ends the caller drains concurrently. The
// driver's Exec non-TTY path used to wire these with newPipeReader /
// newPipeStderr and discard the write ends inside the helpers — that's the
// exact fd-leak the GC race ran on. Routing every non-TTY Exec through here
// keeps the EOF contract identical across docker / lxd / multipass.
func startPiped(cmd *exec.Cmd) (stdinW io.WriteCloser, stdoutR, stderrR io.ReadCloser, err error) {
	stdinR, stdinW, err := openPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	cmd.Stdin = stdinR

	stdoutR, stdoutW, err := openPipe()
	if err != nil {
		stdinR.Close()
		stdinW.Close()
		return nil, nil, nil, err
	}
	cmd.Stdout = stdoutW

	stderrR, stderrW, err := openPipe()
	if err != nil {
		stdinR.Close()
		stdinW.Close()
		stdoutR.Close()
		stdoutW.Close()
		return nil, nil, nil, err
	}
	cmd.Stderr = stderrW

	if err := cmd.Start(); err != nil {
		// Nothing inherited by a failed child: close everything we minted.
		stdinR.Close()
		stdinW.Close()
		stdoutR.Close()
		stdoutW.Close()
		stderrR.Close()
		stderrW.Close()
		return nil, nil, nil, err
	}

	// Child has inherited its own copies across the exec. Close the parent's
	// stdin read end and the stdout/stderr WRITE ends so:
	//   - the child sees stdin EOF once stdinW is later closed by the caller,
	//   - stdoutR/stderrR hit EOF the moment the child exits and closes its
	//     own copies (no lingering write fd in the parent waiting on GC).
	// We deliberately keep stdinW open: the terminal bridge / metrics path may
	// still push bytes; whoever owns the session closes it.
	_ = stdinR.Close()
	_ = stdoutW.Close()
	_ = stderrW.Close()
	return stdinW, stdoutR, stderrR, nil
}

// firstOf returns the first non-nil string-valued entry of m under any of
// the given keys, falling back to anyToString for non-string scalars. Used to
// resolve the alias spellings the template forms tolerate (host/source,
// container/target/destination) so a mount authored in any shape is read.
func firstOf(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			if s, ok := v.(string); ok {
				return s
			}
			return anyToString(v)
		}
	}
	return ""
}

// anyToString coerces typical JSON-decoded scalars into a printable form so
// CPU/RAM numbers stay clean when an operator typed a plain number ("2"
// rather than "2.0000").
func anyToString(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		// JSON numbers decode to float64. Use %g-style: integers come out
		// without trailing zeros.
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'g', -1, 64)
	case int64:
		return strconv.FormatInt(x, 10)
	case int:
		return strconv.Itoa(x)
	default:
		// Fall back to fmt for the rare exotic (maps, slices, nil already
		// handled). Keeps the helper usable for spec values that aren't plain
		// scalars.
		return fmt.Sprintf("%v", v)
	}
}

