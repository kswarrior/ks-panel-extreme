// Package config defines the on-disk configuration format for a ksedge
// instance. A daemon reads config.json from its working directory (or the path
// passed via --config) on startup, exactly the same way the Pterodactyl
// /wings/ binary reads config.yml — except we use JSON so the file the panel
// hands the operator can be pasted straight in with no conversion step.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config is the full descent of config.json. Field names use snake_case JSON
// tags so the file the operator edits matches the field labels they see in the
// panel's "Node token" disclosure modal.
type Config struct {
	// Node identity. UUID is optional and only used for human-friendly logs;
	// the panel already identifies the edge by its token hash.
	UUID string `json:"uuid,omitempty"`
	// Display name – purely cosmetic in edge logs; the panel already stores it.
	Name string `json:"name,omitempty"`

	// Panel connection settings. The panel talks TO the edge over the
	// address/use_tls columns stored on the node row; the edge talks BACK to
	// the panel using PanelURL below.
	PanelURL string `json:"panel_url"`
	// The long-lived shared secret minted by the panel when the node was
	// registered (e.g. kse_xxx…). The edge presents this on every heartbeat
	// so the panel can authenticate it. Never logged in full.
	Token string `json:"token"`

	// Edge "wings" listener. The local HTTP server that exposes /health and
	// (in the future) the instance control API. Defaults to 4040 to match
	// the documented `./ksedge launch` behaviour.
	ListenPort int `json:"listen_port,omitempty"`

	// Overrides for testing / small boxes. When UseTLSUpstream is true the
	// edge dials the panel over https://.
	UseTLSUpstream bool `json:"use_tls_upstream,omitempty"`

	// Heartbeat tuning. Stored as seconds in JSON — Go's time.Duration can't
	// be unmarshalled from a bare JSON number, and a numeric "60" is far
	// friendlier for operators than "60s".
	HeartbeatIntervalSeconds int64 `json:"heartbeat_interval,omitempty"`
	// SkipVerify disables upstream TLS verification. Provided for
	// self-signed panel deployments; defaults to false.
	SkipVerify bool `json:"skip_verify,omitempty"`
	// InstancesDir overrides where the daemon keeps its per-instance
	// working files (logs, mounts, sockets). Empty lets the daemon fall
	// back to its documented default "/var/lib/kspanel/instances".
	// The panel forwards it through config.json so every ksedge started
	// by "Create & setup" honours the operator's choice without adding a
	// CLI flag. A value of "./instances" (or "./instances/") is resolved
	// relative to the edge binary directory (./ = edge location).
	InstancesDir string `json:"instances_dir,omitempty"`
	// ConnectionMode mirrors the panel's dropdown: direct / reverse_tunnel /
	// local_port / local_wss. Stored so the edge can decide whether to keep
	// the reverse tunnel alive or rely on inbound HTTP. Empty defaults to
	// direct for legacy configs that predate the field.
	ConnectionMode string `json:"connection_mode,omitempty"`
}

// Default returns a Config pre-filled with the documented defaults so a
// missing field in the on-disk file still gets a sane value (mirrors the
// behaviour of the original flag-only launcher).
func Default() Config {
	return Config{
		PanelURL:                "http://localhost:5050",
		ListenPort:              4040,
		HeartbeatIntervalSeconds: 60,
	}
}

// Load reads and decodes config.json from the given path. Missing fields are
// backfilled from Default(), so the operator only needs to specify the bits
// unique to their deployment (token, panel url, maybe listen port).
//
// We merge rather than overwrite so an older config.json that predates a new
// field (e.g. skip_verify) still loads cleanly — the new field just gets its
// zero/ default value.
func Load(path string) (Config, error) {
	cfg := Default()
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg, fmt.Errorf("read config: %w", err)
	}
	// Unmarshal on top of the default-filled struct so json's "omit" behaviour
	// preserves defaults for absent keys.
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return cfg, err
	}
	// Normalise: a bare number of seconds in JSON is fine for humans, but Go's
	// time.Duration decode wants "60s" style strings. If the field came in as
	// a number (float64), treat it as seconds. We retry via a shadow struct
	// only when the high-level decode produced 0 AND we know JSON had a raw
	// token that didn't parse as a duration — simplest approach: re-decode
	// HeartbeatIntervalSeconds if present.
	return cfg, nil
}

// validate enforces the load-bearing fields so a misconfigured edge fails
// loudly at startup rather than silently sending junk heartbeats.
//
// For the panel's "localnode" flow the operator can start the health
// endpoint with just a listen port — the panel will push a real config.json
// later. In that case both the token and panel URL are empty, so we treat
// the config as valid (the lifecycle handler will reject any RPC until the
// edge receives real credentials).
func (c Config) validate() error {
	if c.Token == "" && c.PanelURL == "" {
		return nil
	}
	if c.Token == "" {
		return fmt.Errorf("config: token is required (copy the one issued by the panel)")
	}
	if c.PanelURL == "" {
		return fmt.Errorf("config: panel_url is required")
	}
	return nil
}

// HeartbeatIntervalOr returns the configured heartbeat interval, falling back
// to the default when the JSON supplied something that decoded to zero (e.g.
// an empty field). Kept as a method so callers don't have to repeat the
// normalisation logic.
func (c Config) HeartbeatIntervalOr(def time.Duration) time.Duration {
	if c.HeartbeatIntervalSeconds <= 0 {
		return def
	}
	return time.Duration(c.HeartbeatIntervalSeconds) * time.Second
}

// ListenPortOr returns the configured listen port, or def when zero.
func (c Config) ListenPortOr(def int) int {
	if c.ListenPort <= 0 {
		return def
	}
	return c.ListenPort
}

// DefaultInstancesDir is the absolute fallback when neither the config
// nor the caller supplied a directory.
const DefaultInstancesDir = "/var/lib/kspanel/instances"

// InstancesDirOr returns the daemon's instance-files directory, falling back
// to the documented default "/var/lib/kspanel/instances" when the operator
// left it empty. A relative value such as "./instances" or
// "./instances/" is resolved relative to the edge binary directory
// (./ = edge location) so the operator can keep instance data next to the
// edge binary on portable installs. Absolute paths are cleaned and returned
// as-is. Callers shouldn't peek at the field directly so the fallback and
// relative resolution stay in one place (mirrors ListenPortOr).
func (c Config) InstancesDirOr(def string) string {
	raw := strings.TrimSpace(c.InstancesDir)
	if raw == "" {
		raw = strings.TrimSpace(def)
	}
	if raw == "" {
		return DefaultInstancesDir
	}
	return ResolveInstancesDir(raw)
}

// ResolveInstancesDir turns an operator-supplied instances_dir string into an
// absolute, cleaned path. Absolute inputs are returned cleaned; relative
// inputs (including "./instances" and "./instances/") are joined to the edge
// binary directory (./ = edge location) and cleaned. Empty input yields
// DefaultInstancesDir.
func ResolveInstancesDir(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return DefaultInstancesDir
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	base := edgeBaseDir()
	return filepath.Clean(filepath.Join(base, p))
}

// edgeBaseDir is the ./ reference for relative instances_dir values: the
// directory containing the running ksedge executable, falling back to the
// current working directory when the executable path is unavailable.
func edgeBaseDir() string {
	if exe, err := os.Executable(); err == nil && exe != "" {
		if dir := filepath.Dir(exe); dir != "" && dir != "." {
			return filepath.Clean(dir)
		}
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		return filepath.Clean(wd)
	}
	return "."
}
