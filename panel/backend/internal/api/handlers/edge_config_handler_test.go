package handlers

import (
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	kdb "github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
	"github.com/gorilla/websocket"
	_ "modernc.org/sqlite"
)

// newEdgeConfigTestDB points OpenDB at a temp sqlite file carrying the full
// migrated schema (all 79 migrations) and returns the handle for seeding.
func newEdgeConfigTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "edgeconfig.db")
	t.Setenv("KSPANEL_DB", p)
	t.Setenv("KSPANEL_DB_DSN", p)
	d, err := kdb.NewDialect("sqlite")
	if err != nil {
		t.Fatalf("dialect: %v", err)
	}
	con, err := d.Open(p)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { con.Close() })
	if err := kdb.RunMigrations(d, con); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return con
}

// TestEdgeConfigHandlerServesConfigOnce proves the full bootstrap contract:
// a minted one-time token dials the WSS endpoint, receives the generated
// config.toml (carrying the node's real edge token) exactly once, and every
// replay is rejected with 401.
func TestEdgeConfigHandlerServesConfigOnce(t *testing.T) {
	con := newEdgeConfigTestDB(t)
	repo := repository.NewNodeRepository(con)

	node, edgeToken, err := repo.CreateNode(repository.CreateNodeInput{
		Name:           "edge-config-test",
		Address:        "127.0.0.1:4321",
		ConnectionMode: "local_port",
		HealthEnabled:  true,
		HealthInterval: 60,
		HealthTimeout:  4,
		HealthRetries:  3,
	})
	if err != nil {
		t.Fatalf("create node: %v", err)
	}
	cfgToken, err := repo.MintConfigToken(node.ID, time.Minute)
	if err != nil {
		t.Fatalf("mint config token: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(EdgeConfigHandler))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/edge/config?config_token=" + cfgToken

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var resp edgeConfigResponse
	if err := conn.ReadJSON(&resp); err != nil {
		t.Fatalf("read config frame: %v", err)
	}
	conn.Close()

	if !resp.OK {
		t.Fatalf("expected ok frame, got error %q", resp.Error)
	}
	for _, want := range []string{
		`token = "` + edgeToken + `"`,
		`name = "edge-config-test"`,
		`connection_mode = "local_port"`,
		`listen_port = 4321`,
		`panel_url = "` + strings.TrimPrefix(srv.URL, "http://") + `"`,
	} {
		if !strings.Contains(resp.Config, want) {
			t.Errorf("config.toml missing %q\n%s", want, resp.Config)
		}
	}

	// Replay: the token is single-use, so the handshake must be refused.
	replayConn, httpResp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		replayConn.Close()
		t.Fatal("replayed config token must be rejected")
	}
	if httpResp == nil || httpResp.StatusCode != http.StatusUnauthorized {
		status := 0
		if httpResp != nil {
			status = httpResp.StatusCode
		}
		t.Fatalf("replay status = %d, want 401", status)
	}
	body, _ := io.ReadAll(io.LimitReader(httpResp.Body, 4096))
	httpResp.Body.Close()
	if !strings.Contains(string(body), "invalid or expired config token") {
		t.Errorf("replay body = %q, want generic invalid-token error", string(body))
	}
}

// TestEdgeConfigHandlerRejectsUnknownToken keeps the authn gate honest for a
// token that was never minted.
func TestEdgeConfigHandlerRejectsUnknownToken(t *testing.T) {
	_ = newEdgeConfigTestDB(t)
	srv := httptest.NewServer(http.HandlerFunc(EdgeConfigHandler))
	defer srv.Close()

	_, httpResp, err := websocket.DefaultDialer.Dial(
		"ws"+strings.TrimPrefix(srv.URL, "http")+"/api/edge/config?config_token=ksc_deadbeef", nil)
	if err == nil {
		t.Fatal("unknown token must be rejected")
	}
	if httpResp == nil || httpResp.StatusCode != http.StatusUnauthorized {
		status := 0
		if httpResp != nil {
			status = httpResp.StatusCode
		}
		t.Fatalf("status = %d, want 401", status)
	}
	httpResp.Body.Close()
}
