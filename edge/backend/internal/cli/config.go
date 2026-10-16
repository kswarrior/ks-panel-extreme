package cli

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/example/ksedge/internal/config"
	"github.com/gorilla/websocket"
	"github.com/spf13/cobra"
)

// configFrame is the single JSON frame the panel sends on the
// /api/edge/config WebSocket after a successful handshake. On success
// Config carries the generated config.toml (including this edge's token);
// on failure Error explains why and Config is empty.
type configFrame struct {
	OK     bool   `json:"ok"`
	Config string `json:"config"`
	Error  string `json:"error"`
}

// configCmd fetches this edge's config.toml from the panel over a one-shot
// WebSocket, authenticated by the panel-minted one-time config token (ksc_…).
// It is the edge-side half of the two bootstrap commands the panel shows
// after registering a node; the operator never copy/pastes the config file.
//
//	./ksedge config --panel https://panel.example.com --config-token ksc_…
func configCmd() *cobra.Command {
	var (
		panelURL    string
		configToken string
		configPath  string
		skipVerify  bool
	)
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Fetch this edge's config.toml from the panel via a one-time token",
		Long: `Dial the panel's WSS config endpoint with the one-time config token the
panel printed when the node was registered. The panel verifies + burns the
token and answers with the generated config.toml, which is written to the
config file next to this binary (default ./config.toml). Afterwards run:

  ./ksedge launch

The token is single-use and expires; ask the panel for a fresh one if the
fetch fails.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runEdgeConfig(panelURL, configToken, configPath, skipVerify)
		},
	}
	cmd.Flags().StringVar(&panelURL, "panel", "", "Panel base URL (e.g. https://panel.example.com)")
	cmd.Flags().StringVar(&configToken, "config-token", "", "One-time config token printed by the panel (ksc_…)")
	cmd.Flags().StringVarP(&configPath, "config", "c", "config.toml", "Where to write the fetched config file")
	cmd.Flags().BoolVar(&skipVerify, "skip-verify", false, "Skip panel TLS verification (self-signed panels)")
	return cmd
}

// edgeConfigWSURL builds the wss:// URL for the config endpoint. http/https
// panel URLs map to ws/wss; an explicit ws/wss scheme is honoured as-is. Any
// path on the panel URL is ignored (the endpoint is absolute) — the panel
// origin is what matters.
func edgeConfigWSURL(panel, configToken string) (string, error) {
	panel = strings.TrimSpace(panel)
	if panel == "" {
		return "", fmt.Errorf("--panel is required (the panel base URL shown on the node page)")
	}
	if strings.TrimSpace(configToken) == "" {
		return "", fmt.Errorf("--config-token is required (the ksc_… one-time token from the panel)")
	}
	u, err := url.Parse(panel)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("invalid --panel URL %q", panel)
	}
	scheme := "ws"
	if u.Scheme == "https" || u.Scheme == "wss" {
		scheme = "wss"
	}
	return url.URL{
		Scheme:   scheme,
		Host:     u.Host,
		Path:     "/api/edge/config",
		RawQuery: url.Values{"config_token": {configToken}}.Encode(),
	}.String(), nil
}

// runEdgeConfig performs the fetch + atomic write. The config content is
// never logged (it carries the edge token).
func runEdgeConfig(panel, configToken, configPath string, skipVerify bool) error {
	wsURL, err := edgeConfigWSURL(panel, configToken)
	if err != nil {
		return err
	}
	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: skipVerify},
	}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("panel refused the config request: HTTP %d (token invalid, expired or already used?)", resp.StatusCode)
		}
		return fmt.Errorf("connect to panel: %w", err)
	}
	defer conn.Close()
	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	_, data, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read config from panel: %w", err)
	}
	var frame configFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		return fmt.Errorf("invalid panel response: %w", err)
	}
	if !frame.OK || strings.TrimSpace(frame.Config) == "" {
		msg := strings.TrimSpace(frame.Error)
		if msg == "" {
			msg = "panel returned no config"
		}
		return fmt.Errorf("config fetch failed: %s", msg)
	}

	// Defense in depth: the frame must decode into the same TOML schema
	// config.Load reads and carry the two fields a working edge needs. A
	// truncated/hostile frame must never overwrite a working config.toml.
	var check config.Config
	if _, err := toml.Decode(frame.Config, &check); err != nil {
		return fmt.Errorf("panel returned an invalid config.toml: %w", err)
	}
	if strings.TrimSpace(check.Token) == "" || strings.TrimSpace(check.PanelURL) == "" {
		return fmt.Errorf("panel returned a config.toml without token/panel_url")
	}

	dir := filepath.Dir(configPath)
	if dir == "" {
		dir = "."
	}
	tmp, err := os.CreateTemp(dir, ".config.toml.*")
	if err != nil {
		return fmt.Errorf("create temp config: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(frame.Config); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := tmp.Chmod(0o600); err != nil { // carries the edge token
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("chmod temp config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp config: %w", err)
	}
	if err := os.Rename(tmpPath, configPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("move config into place: %w", err)
	}

	log.Printf("config fetched from panel (%d bytes) -> %s", len(frame.Config), configPath)
	log.Printf("run ./ksedge launch to start the edge")
	return nil
}
