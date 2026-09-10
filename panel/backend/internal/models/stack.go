package models

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"
)

// Stack is an admin-uploaded full-stack isolated app (dashboard OR tool).
// Like one Mod is one item in Mods, one Stack is one item in Stacks: own
// frontend (spa dist | simple pages) + optional backend sidecar + own nav +
// own data. Dashboard is only category='dashboard', never the system name.
//
// Manifest/spec are opaque pass-through JSON (same contract as mods/themes):
// the backend validates only the enumerated fields below + the requested
// capabilities; the rest is stored verbatim for the frontend.
type Stack struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Category    string          `json:"category"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	Icon        string          `json:"icon"`
	Color       string          `json:"color,omitempty"`
	Runtime     string          `json:"runtime"`
	Entrypoint  string          `json:"entrypoint,omitempty"`
	Manifest    json.RawMessage `json:"manifest"`
	Spec        json.RawMessage `json:"spec,omitempty"`
	// ThemeMode is panel|custom|none: inherit the panel route theme, ship an
	// own theme.css, or run unthemed. PageStyle is spa|simple: full dist
	// bundle in an iframe, or panel-rendered markdown/html/blocks pages.
	ThemeMode string `json:"theme_mode"`
	PageStyle string `json:"page_style"`
	Active    bool   `json:"active"`
	UploadedBy *int64 `json:"uploaded_by,omitempty"`
	// OwnerID ties the stack to the uploader (migration 071 wires
	// STACKS_OWN/STACKS_ALL: Own sees owner rows only, All/umbrella sees all).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username joined from users.
	OwnerName string `json:"owner_name,omitempty"`
	// Source is file|url|studio|json|sample (install provenance).
	Source    string `json:"source"`
	SourceURL string `json:"source_url,omitempty"`
	// PackageSize is the .ksps byte size (0 = synthesize on download).
	PackageSize int64     `json:"package_size"`
	// ProxyPort is the loopback TCP port of the externally-run stack Go app
	// (0 = proxy off). ProxyRootURL is the first path segment the panel
	// serves that app at, e.g. 'dash' floats it at /dash/* ("" = off).
	// Migration 072.
	ProxyPort    int    `json:"proxy_port"`
	ProxyRootURL string `json:"proxy_root_url,omitempty"`
	// RemoteAddress is the node-style dial address of the stack app when it
	// runs on ANOTHER host (host:port or bare host, e.g. "10.0.0.9:7700").
	// "" means same-host: the proxy dials 127.0.0.1:ProxyPort.
	// RemoteUseTLS flips the proxy/probe between http:// and https://.
	// RemoteSkipVerify skips TLS verify for self-signed remotes.
	// Migration 076.
	RemoteAddress    string `json:"remote_address,omitempty"`
	RemoteUseTLS     bool   `json:"remote_use_tls"`
	RemoteSkipVerify bool   `json:"remote_skip_verify"`
	// TokenPrefix is the first 8 chars of the pairing token so the operator
	// can recognise which token is configured (the raw token is returned
	// only at create/rotate time, never again — mirrors nodes).
	TokenPrefix string `json:"token_prefix,omitempty"`
	// Status is "up" or "down" from heartbeat freshness. LastSeenAt is the
	// UTC timestamp of the last heartbeat (nil = never connected).
	Status     string     `json:"status"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Stack install provenance codes. Matches the `stacks.source` default.
const (
	StackSourceFile   = "file"
	StackSourceURL    = "url"
	StackSourceStudio = "studio"
	StackSourceJSON   = "json"
	StackSourceSample = "sample"
)

// Stack runtimes, theme modes, page styles and categories.
const (
	StackRuntimeStatic = "static"
	StackRuntimeNodeJS = "nodejs"
	StackRuntimePython = "python"

	StackThemePanel  = "panel"
	StackThemeCustom = "custom"
	StackThemeNone   = "none"

	StackPageSPA    = "spa"
	StackPageSimple = "simple"
)

var stackSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// ValidStackSlug reports whether slug satisfies the panel's slug contract
// (same contract as mods: lowercase alphanumerics + hyphens, max 64).
func ValidStackSlug(slug string) bool {
	return stackSlugRe.MatchString(slug)
}

// ValidStackRuntime reports whether runtime is a known sidecar runtime.
func ValidStackRuntime(runtime string) bool {
	switch runtime {
	case StackRuntimeStatic, StackRuntimeNodeJS, StackRuntimePython:
		return true
	}
	return false
}

// ValidStackThemeMode reports whether mode is a known theme mode. Empty
// means "not declared" and normalises to panel at parse time.
func ValidStackThemeMode(mode string) bool {
	switch mode {
	case "", StackThemePanel, StackThemeCustom, StackThemeNone:
		return true
	}
	return false
}

// ValidStackPageStyle reports whether style is a known page style. Empty
// normalises to spa at parse time.
func ValidStackPageStyle(style string) bool {
	switch style {
	case "", StackPageSPA, StackPageSimple:
		return true
	}
	return false
}

var stackProxyRootRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

// ValidStackProxyPort reports whether port is a usable proxy target.
// 0 disables the proxy; otherwise a TCP port number is required.
func ValidStackProxyPort(port int) bool {
	return port == 0 || (port >= 1 && port <= 65535)
}

// ValidStackProxyRoot reports whether root is a usable proxy mount: one
// lowercase path segment (empty disables the proxy).
func ValidStackProxyRoot(root string) bool {
	if root == "" {
		return true
	}
	return stackProxyRootRe.MatchString(root)
}

// ReservedStackProxyRoots are first path segments the proxy mount must never
// claim: the API tree, the health probe, the favicon alias and the SPA
// asset prefix all live at the origin root beside proxy mounts.
func ReservedStackProxyRoots() []string {
	return []string{"api", "health", "favicon.ico", "assets"}
}

// IsReservedStackProxyRoot reports whether root collides with a panel-owned
// origin-root path.
func IsReservedStackProxyRoot(root string) bool {
	for _, r := range ReservedStackProxyRoots() {
		if root == r {
			return true
		}
	}
	return false
}

// StackTokenPrefix brands the stack pairing token so it is
// distinguishable from an edge token (kse_…) and an API key (ksk_…).
// The stack app operator pastes this into the app's config file.
const StackTokenPrefix = "kss_"

// ValidStackRemoteAddress reports whether addr is an acceptable node-style
// dial address for a remote stack app: host:port, bare host/hostname, or
// "" (same-host loopback — never validated here, the caller treats empty
// as "use proxy_port"). It mirrors the node address rules: no scheme,
// no whitespace, numeric ports 1..65535, bracketed IPv6 supported.
func ValidStackRemoteAddress(addr string) bool {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return true
	}
	if strings.HasPrefix(addr, "http://") || strings.HasPrefix(addr, "https://") {
		return false
	}
	if strings.ContainsAny(addr, " \t\r\n") {
		return false
	}
	if strings.HasPrefix(addr, "[") {
		end := strings.Index(addr, "]")
		if end == -1 {
			return false
		}
		rest := addr[end+1:]
		if rest == "" {
			return true
		}
		if !strings.HasPrefix(rest, ":") || rest[1:] == "" {
			return false
		}
		return validStackPortStr(rest[1:])
	}
	if strings.Count(addr, ":") > 1 {
		return true // bare IPv6 literal, no port to validate
	}
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		if strings.TrimSpace(addr[:idx]) == "" || strings.TrimSpace(addr[idx+1:]) == "" {
			return false
		}
		return validStackPortStr(strings.TrimSpace(addr[idx+1:]))
	}
	return true
}

func validStackPortStr(p string) bool {
	if len(p) == 0 || len(p) > 5 {
		return false
	}
	n := 0
	for i := 0; i < len(p); i++ {
		if p[i] < '0' || p[i] > '9' {
			return false
		}
		n = n*10 + int(p[i]-'0')
	}
	return n >= 1 && n <= 65535
}

// IsRemoteStack reports whether the stack app lives on another host
// (RemoteAddress set) versus same-host loopback (ProxyPort only).
func (s *Stack) IsRemoteStack() bool {
	return s != nil && strings.TrimSpace(s.RemoteAddress) != ""
}

// StackDialTarget returns the scheme + authority the panel dials for
// probe/proxy: remote_address when set, else 127.0.0.1:proxyPort.
func (s *Stack) StackDialTarget() (scheme, addr string) {
	if s.IsRemoteStack() {
		scheme = "http"
		if s.RemoteUseTLS {
			scheme = "https"
		}
		return scheme, strings.TrimSpace(s.RemoteAddress)
	}
	return "http", "127.0.0.1:" + stackItoa(s.ProxyPort)
}

func stackItoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	pos := len(b)
	for n > 0 {
		pos--
		b[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}

// StackPermission is one capability a stack declared it needs. Activation is
// refused until every row has Granted == true (same gate as mods).
type StackPermission struct {
	ID          int64  `json:"id"`
	StackID     int64  `json:"stack_id"`
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
	Granted     bool   `json:"granted"`
}

// Stack capability codes. Deliberately NOT reusing the mod CapXxx codes:
// stacks reach capabilities through the sidecar proxy allow-list, so the
// namespace stays separate even where the English overlaps.
const (
	StackCapMetricsRead  = "metrics.read"
	StackCapInstancesRead = "instances.read"
	StackCapKVReadWrite  = "kv.read_write"
	StackCapDBReadWrite  = "db.read_write"
	StackCapOutboundHTTP = "outbound_http"
	StackCapNotify       = "notify"
)

// AllowedStackCapabilities returns the capability codes a stack manifest may
// request. The repo rejects any other string at insert time.
func AllowedStackCapabilities() []string {
	return []string{
		StackCapMetricsRead,
		StackCapInstancesRead,
		StackCapKVReadWrite,
		StackCapDBReadWrite,
		StackCapOutboundHTTP,
		StackCapNotify,
	}
}

// StackEnv is one saved environment KEY row (secret values stay masked).
type StackEnv struct {
	Key    string `json:"key"`
	Masked bool   `json:"masked,omitempty"`
	Secret bool   `json:"secret"`
}

// StackKV is one namespaced key/value row.
type StackKV struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}
