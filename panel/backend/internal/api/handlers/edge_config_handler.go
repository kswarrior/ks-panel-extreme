package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/gorilla/websocket"
)

// edgeConfigUpgrader upgrades the GET /api/edge/config handshake. Origin is
// not a security boundary here: the caller is a CLI (`ksedge config`), not a
// browser, and it must present a valid one-time token — mirrors the tunnel
// handler's upgrader.
var edgeConfigUpgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// edgeConfigResponse is the single frame the panel sends back after a
// successful handshake. On success Config carries the full config.toml
// (which includes the node's real edge token); on failure Error explains
// why and Config is empty.
type edgeConfigResponse struct {
	OK     bool   `json:"ok"`
	Config string `json:"config,omitempty"`
	Error  string `json:"error,omitempty"`
}

// EdgeConfigHandler is the public WebSocket endpoint the edge's
// `ksedge config` command dials to bootstrap itself:
//
//	wss://panel/api/edge/config?config_token=ksc_…
//
// The one-time config token is minted when the admin registers the node
// (NodeForm post-create modal) and embedded in the two bootstrap commands
// printed there. It is hashed at rest, expires after repository.ConfigTokenTTL
// and is ATOMICALLY BURNED on first redemption (ConsumeConfigToken), so a
// leaked command can provision at most one edge and only inside the TTL.
//
// It sits outside the session auth middleware for the same reason the tunnel
// endpoint does: the edge has no browser session and authenticates with its
// own one-time token. The response is the same panel-generated config.toml
// the "Create & setup" flow writes locally, carrying the real ksedge token —
// hence everything is gated behind the one-time token's single use, and no
// token/secret is ever logged.
func EdgeConfigHandler(w http.ResponseWriter, r *http.Request) {
	configToken := r.URL.Query().Get("config_token")
	if configToken == "" {
		configToken = r.Header.Get("X-Config-Token")
	}
	if configToken == "" {
		http.Error(w, "config_token is required", http.StatusUnauthorized)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)

	// Burn the one-time token first: an invalid/expired/replayed token can
	// never reach the config builder, and a successful redemption can never
	// be replayed even if the socket then drops.
	nodeID, err := repo.ConsumeConfigToken(configToken)
	if err != nil {
		// Uniform 401 — never echo the token nor distinguish unknown vs
		// expired vs already-used beyond the log line.
		log.Printf("edge config: rejected config token: %v", err)
		http.Error(w, "invalid or expired config token", http.StatusUnauthorized)
		return
	}

	node, err := repo.GetNode(nodeID)
	if err != nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	edgeToken, err := repo.PlainToken(nodeID)
	if err != nil || edgeToken == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	cfgBytes, err := buildNodeConfigTOML(node, panelURLFromRequest(r), edgeToken)
	if err != nil {
		http.Error(w, "could not encode config", http.StatusInternalServerError)
		return
	}

	ws, err := edgeConfigUpgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote its own HTTP error (bad handshake).
		return
	}
	defer ws.Close()

	_ = ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := ws.WriteJSON(edgeConfigResponse{OK: true, Config: string(cfgBytes)}); err != nil {
		log.Printf("edge config: write to node %d failed: %v", nodeID, err)
		return
	}
	log.Printf("edge config: node %d fetched config.toml over WSS", nodeID)

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "config_fetch",
		TargetID:    &nodeID,
		TargetLabel: node.Name,
		Message:     "edge fetched config.toml over WSS with its one-time config token",
	})
}
