package cli

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// newConfigWSServer serves /api/edge/config and replies with frame on
// connect; extra is exposed for assertions (headers, query).
func newConfigWSServer(t *testing.T, frame configFrame, path *string, query *string) *httptest.Server {
	t.Helper()
	up := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if path != nil {
			*path = r.URL.Path
		}
		if query != nil {
			*query = r.URL.RawQuery
		}
		conn, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteJSON(frame)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestEdgeConfigWSURL(t *testing.T) {
	cases := []struct {
		panel, token string
		wantErr      bool
		wantPrefix   string
	}{
		{"https://panel.example.com", "ksc_abc", false, "wss://panel.example.com/api/edge/config?config_token=ksc_abc"},
		{"http://127.0.0.1:8080", "ksc_abc", false, "ws://127.0.0.1:8080/api/edge/config?config_token=ksc_abc"},
		{"https://panel.example.com/some/path", "ksc_a b", false, "wss://panel.example.com/api/edge/config?config_token=ksc_a+b"},
		{"", "ksc_abc", true, ""},
		{"https://panel.example.com", "", true, ""},
		{"not a url", "ksc_abc", true, ""},
	}
	for _, c := range cases {
		got, err := edgeConfigWSURL(c.panel, c.token)
		if c.wantErr {
			if err == nil {
				t.Errorf("edgeConfigWSURL(%q, %q) must fail", c.panel, c.token)
			}
			continue
		}
		if err != nil {
			t.Errorf("edgeConfigWSURL(%q, %q): %v", c.panel, c.token, err)
			continue
		}
		if got != c.wantPrefix {
			t.Errorf("edgeConfigWSURL(%q, %q) = %q, want %q", c.panel, c.token, got, c.wantPrefix)
		}
	}
}

func TestRunEdgeConfigWritesFetchedConfig(t *testing.T) {
	toml := "name = \"edge-1\"\npanel_url = \"http://panel.local\"\ntoken = \"kse_test\"\nconnection_mode = \"local_port\"\n"
	var gotPath, gotQuery string
	srv := newConfigWSServer(t, configFrame{OK: true, Config: toml}, &gotPath, &gotQuery)

	dst := filepath.Join(t.TempDir(), "config.toml")
	if err := runEdgeConfig(srv.URL, "ksc_token1", dst, false); err != nil {
		t.Fatalf("runEdgeConfig: %v", err)
	}
	if gotPath != "/api/edge/config" {
		t.Errorf("server path = %q, want /api/edge/config", gotPath)
	}
	if !strings.Contains(gotQuery, "config_token=ksc_token1") {
		t.Errorf("server query = %q, want config_token", gotQuery)
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read written config: %v", err)
	}
	if string(got) != toml {
		t.Errorf("written config = %q, want %q", string(got), toml)
	}
	fi, err := os.Stat(dst)
	if err != nil {
		t.Fatalf("stat written config: %v", err)
	}
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("config perms = %v, want 0600 (carries the edge token)", fi.Mode().Perm())
	}
}

func TestRunEdgeConfigRejectsErrorFrame(t *testing.T) {
	srv := newConfigWSServer(t, configFrame{OK: false, Error: "invalid or expired config token"}, nil, nil)
	dst := filepath.Join(t.TempDir(), "config.toml")
	err := runEdgeConfig(srv.URL, "ksc_used", dst, false)
	if err == nil || !strings.Contains(err.Error(), "invalid or expired config token") {
		t.Fatalf("err = %v, want panel error surfaced", err)
	}
	if _, serr := os.Stat(dst); !os.IsNotExist(serr) {
		t.Fatalf("no config must be written on failure, stat err = %v", serr)
	}
}

func TestRunEdgeConfigRejectsInvalidTOML(t *testing.T) {
	srv := newConfigWSServer(t, configFrame{OK: true, Config: "this is not = = toml ["}, nil, nil)
	dst := filepath.Join(t.TempDir(), "config.toml")
	if err := runEdgeConfig(srv.URL, "ksc_bad", dst, false); err == nil {
		t.Fatal("invalid TOML must be rejected")
	}
	if _, serr := os.Stat(dst); !os.IsNotExist(serr) {
		t.Fatalf("no config must be written on invalid TOML, stat err = %v", serr)
	}
}

func TestRunEdgeConfigRejectsMissingToken(t *testing.T) {
	srv := newConfigWSServer(t, configFrame{OK: true, Config: "name = \"x\"\npanel_url = \"http://p\"\n"}, nil, nil)
	dst := filepath.Join(t.TempDir(), "config.toml")
	if err := runEdgeConfig(srv.URL, "ksc_noauth", dst, false); err == nil {
		t.Fatal("config without token/panel_url must be rejected")
	}
}

// Keep json import honest: the wire frame is JSON (mirrors the panel's
// edgeConfigResponse marshalling).
var _ = json.Marshal
