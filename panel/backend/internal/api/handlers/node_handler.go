package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/probe"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ============================== NODES (admin) ==============================

type createNodeRequest struct {
	Name           string `json:"name"`
	Address        string `json:"address"`
	UseTLS         bool   `json:"use_tls"`
	ConnectionMode string `json:"connection_mode,omitempty"`
	// WssChannels is the NodeForm WSS box state (migration 062). When
	// present the handler replaces the node's full channel set
	// transactionally after the row lands; omitted/nil leaves channels
	// untouched (legacy callers unaffected).
	WssChannels []wssChannelPayload `json:"wss_channels,omitempty"`
	// Advanced per-edge configuration (migration 019). Missing / zero
	// values fall back to the column DEFAULT so a caller using the legacy
	// payload shape is unaffected.
	HealthEnabled  *bool  `json:"health_enabled,omitempty"`
	HealthInterval int    `json:"health_interval,omitempty"`
	HealthTimeout  int    `json:"health_timeout,omitempty"`
	HealthRetries  int    `json:"health_retries,omitempty"`
	SkipTLSVerify  bool   `json:"skip_tls_verify,omitempty"`
	Notes          string `json:"notes,omitempty"`
	InstallDir     string `json:"install_dir,omitempty"`
	AllowedKinds   string `json:"allowed_kinds,omitempty"`
	// Panel-side allocation overrides (migration 025). Zero / empty values
	// leave the column DEFAULT (0 / '') so a legacy payload stays
	// permissive — the deploy handler treats 0 as "inherit live telemetry".
	AllocMemMiB       int    `json:"alloc_mem_mib,omitempty"`
	MemOvercommitPct  int    `json:"mem_overcommit_pct,omitempty"`
	AllocDiskMiB      int    `json:"alloc_disk_mib,omitempty"`
	DiskOvercommitPct int    `json:"disk_overcommit_pct,omitempty"`
	InstancesDir      string `json:"instances_dir,omitempty"`
	// Operator-set categorisation + location (migration 026). Empty
	// strings leave the column DEFAULT ('') so a legacy payload stays
	// fully permissive.
	Category        string `json:"category,omitempty"`
	LocationCountry string `json:"location_country,omitempty"`
	LocationNode    string `json:"location_node,omitempty"`
	// Display identity (migration 044). Icon must be a key from the
	// panel's fixed icon set; Color must be #rrggbb. Both optional.
	Icon  string `json:"icon,omitempty"`
	Color string `json:"color,omitempty"`
}

type updateNodeRequest struct {
	Name           string `json:"name"`
	Address        string `json:"address"`
	UseTLS         bool   `json:"use_tls"`
	ConnectionMode string `json:"connection_mode,omitempty"`
	// WssChannels mirrors createNodeRequest: when present (non-nil) the
	// handler replaces the node's full channel set; nil leaves channels
	// untouched so legacy callers keep working.
	WssChannels []wssChannelPayload `json:"wss_channels,omitempty"`
	HealthEnabled  *bool  `json:"health_enabled,omitempty"`
	HealthInterval int    `json:"health_interval,omitempty"`
	HealthTimeout  int    `json:"health_timeout,omitempty"`
	HealthRetries  int    `json:"health_retries,omitempty"`
	SkipTLSVerify  bool   `json:"skip_tls_verify,omitempty"`
	Notes          string `json:"notes,omitempty"`
	InstallDir     string `json:"install_dir,omitempty"`
	AllowedKinds   string `json:"allowed_kinds,omitempty"`
	AllocMemMiB       int    `json:"alloc_mem_mib,omitempty"`
	MemOvercommitPct  int    `json:"mem_overcommit_pct,omitempty"`
	AllocDiskMiB      int    `json:"alloc_disk_mib,omitempty"`
	DiskOvercommitPct int    `json:"disk_overcommit_pct,omitempty"`
	InstancesDir      string `json:"instances_dir,omitempty"`
	Category          string `json:"category,omitempty"`
	LocationCountry   string `json:"location_country,omitempty"`
	LocationNode      string `json:"location_node,omitempty"`
	Icon              string `json:"icon,omitempty"`
	Color             string `json:"color,omitempty"`
}

// wssChannelPayload is one WSS box row (migration 062): a name, a task
// (all/files/node/instance) and, for both/local_both modes, a preferred
// transport (wss/port/auto) plus the emergency-fallback flag.
type wssChannelPayload struct {
	Name      string `json:"name"`
	Task      string `json:"task,omitempty"`
	Transport string `json:"transport,omitempty"`
	Fallback  *bool  `json:"fallback,omitempty"`
}

// wssChannelsToInput normalizes + validates a channel payload list (fail
// closed). Fallback defaults to true (emergency fallback on) when omitted.
func wssChannelsToInput(payload []wssChannelPayload) ([]repository.WssChannelInput, error) {
	out := make([]repository.WssChannelInput, 0, len(payload))
	for _, p := range payload {
		fb := true
		if p.Fallback != nil {
			fb = *p.Fallback
		}
		task := repository.NormalizeWssTask(p.Task)
		transport := repository.NormalizeWssTransport(p.Transport)
		if msg := repository.ValidateWssChannel(p.Name, task, transport); msg != "" {
			return nil, fmt.Errorf("%s", msg)
		}
		out = append(out, repository.WssChannelInput{
			Name:      p.Name,
			Task:      task,
			Transport: transport,
			Fallback:  fb,
		})
	}
	return out, nil
}

// isValidPortStr reports whether p is a decimal port 1..65535.
func isValidPortStr(p string) bool {
	p = strings.TrimSpace(p)
	if len(p) == 0 || len(p) > 5 {
		return false
	}
	for _, c := range p {
		if c < '0' || c > '9' {
			return false
		}
	}
	n, err := strconv.Atoi(p)
	if err != nil {
		return false
	}
	return n >= 1 && n <= 65535
}

// validateNodeAddress accepts any of:
//
//	host:port            -> "edge.example.com:4040", "57.6.8.1:3853"
//	bare host / hostname  -> "ftdeycef.com" (Cloudflare-tunnel case; the HTTP
//	                        client dials the scheme default port automatically)
//	IPv6 host literal    -> "[::1]:4040" or bare "::1"
//
// It rejects addresses with a scheme embedded (http(s)://…), whitespace, and
// out-of-range ports so a typo surfaces as a clean 400 instead of a later
// 502 from the edge dial. Returns nil when the address is acceptable.
func validateNodeAddress(addr string) error {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return fmt.Errorf("address is required")
	}
	if strings.HasPrefix(addr, "http://") || strings.HasPrefix(addr, "https://") {
		return fmt.Errorf("address must not include a scheme (drop http(s)://)")
	}
	// Anything with whitespace inside is invalid.
	if strings.ContainsAny(addr, " \t\r\n") {
		return fmt.Errorf("address must not contain whitespace")
	}
	// Reject the tunnel sentinel for non-tunnel modes — "tunnel" is only
	// valid when connection_mode is reverse_tunnel (handled by the caller).
	if addr == "tunnel" {
		return fmt.Errorf("address \"tunnel\" is only valid for reverse_tunnel mode")
	}
	// IPv6 literal in brackets.
	if strings.HasPrefix(addr, "[") {
		end := strings.Index(addr, "]")
		if end == -1 {
			return fmt.Errorf("IPv6 addresses must use [host] or [host]:port form")
		}
		rest := addr[end+1:]
		if rest == "" {
			return nil
		}
		if !strings.HasPrefix(rest, ":") {
			return fmt.Errorf("IPv6 addresses must use [host] or [host]:port form")
		}
		port := rest[1:]
		if port == "" {
			return fmt.Errorf("port is required after ':'")
		}
		if !isValidPortStr(port) {
			return fmt.Errorf("port must be a number between 1 and 65535")
		}
		return nil
	}
	// Bare IPv6 without brackets (e.g. "::1" or "2001:db8::1") — contains
	// multiple colons. Without brackets a port cannot be disambiguated, so
	// we treat the whole string as a bare host and skip port validation.
	// The edge must be registered as "[::1]:4040" when a port is needed.
	if strings.Count(addr, ":") > 1 {
		return nil
	}
	// host:port or bare host
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		hostPart := strings.TrimSpace(addr[:idx])
		portPart := strings.TrimSpace(addr[idx+1:])
		if hostPart == "" {
			return fmt.Errorf("host is required before ':'")
		}
		if portPart == "" {
			return fmt.Errorf("port is required after ':'")
		}
		if !isValidPortStr(portPart) {
			return fmt.Errorf("port must be a number between 1 and 65535")
		}
	}
	return nil
}

// validConnectionModes is the whitelist for the dropdown.
// direct          — panel has edge URL + edge has panel URL (bidirectional)
// reverse_tunnel — only edge stores panel URL, WSS tunnel
// both           — panel keeps BOTH a direct address AND a WSS tunnel;
//                  per-task WSS channels pick port vs WSS per task
// local_port     — edge on panel host via 127.0.0.1:port (HTTP)
// local_wss      — edge on panel host via WSS tunnel
// local_both     — local edge keeping BOTH 127.0.0.1:port AND a WSS tunnel
var validConnectionModes = map[string]bool{
	"direct":         true,
	"reverse_tunnel": true,
	"both":           true,
	"local_port":     true,
	"local_wss":      true,
	"local_both":     true,
}

func normalizeConnectionMode(m string) string {
	m = strings.TrimSpace(strings.ToLower(m))
	if m == "" {
		return "direct"
	}
	return m
}

func isValidConnectionMode(m string) bool {
	if m == "" {
		return true // empty falls back to direct
	}
	return validConnectionModes[strings.ToLower(strings.TrimSpace(m))]
}

func isTunnelMode(m string) bool {
	m = strings.ToLower(strings.TrimSpace(m))
	return m == "reverse_tunnel" || m == "local_wss" || m == "both" || m == "local_both"
}

func isLocalMode(m string) bool {
	m = strings.ToLower(strings.TrimSpace(m))
	return m == "local_port" || m == "local_wss" || m == "local_both"
}

// isDualMode reports whether the mode keeps BOTH transports alive with
// per-task routing (both / local_both).
func isDualMode(m string) bool {
	m = strings.ToLower(strings.TrimSpace(m))
	return m == "both" || m == "local_both"
}

// nodeIconKeys is the fixed set of symbolic icon keys the NodeForm's icon
// picker can produce. The API validates preset icons against exactly this
// whitelist, and additionally accepts a capped custom `<svg>…</svg>` block
// (see validCustomIconSvg), so nothing else arbitrary ever lands in the
// icon column (fail closed). Must stay in sync with NODE_ICONS in
// panel/frontend/src/features/nodes/utils/nodeIcons.ts.
var nodeIconKeys = map[string]bool{
	"server":   true,
	"cloud":    true,
	"globe":    true,
	"shield":   true,
	"cpu":      true,
	"database": true,
	"drive":    true,
	"box":      true,
	"zap":      true,
	"home":     true,
	"network":  true,
	"terminal": true,
}

// maxCustomIconLen caps a pasted custom `<svg>…</svg>` icon block so the
// icon column can never grow into a blob store.
const maxCustomIconLen = 5000

// validCustomIconSvg reports whether s is an acceptable pasted custom icon:
// a full `<svg>…</svg>` block within the length cap and free of `<script`
// payloads (the frontend additionally strips event-handler attributes at
// render time).
func validCustomIconSvg(s string) bool {
	t := strings.TrimSpace(s)
	if len(t) == 0 || len(t) > maxCustomIconLen {
		return false
	}
	lower := strings.ToLower(t)
	if !strings.HasPrefix(lower, "<svg") {
		return false
	}
	if !strings.Contains(lower, "</svg>") {
		return false
	}
	if strings.Contains(lower, "<script") {
		return false
	}
	return true
}

// validNodeColorHex reports whether s is a #rrggbb hex colour.
func validNodeColorHex(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for i := 1; i < len(s); i++ {
		c := s[i]
		if !(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f') && !(c >= 'A' && c <= 'F') {
			return false
		}
	}
	return true
}

// validateNodeDisplay enforces the fail-closed rules for the operator-set
// display metadata: bounded free-text lengths, a whitelisted preset icon
// key or a capped custom `<svg>…</svg>` block, and a #rrggbb colour.
// Returns a user-facing error string or "" when acceptable.
func validateNodeDisplay(name, label, category, notes, icon, color string) string {
	if len(name) > 100 {
		return "name must be 100 characters or fewer"
	}
	if len(label) > 100 {
		return "node label must be 100 characters or fewer"
	}
	if len(category) > 100 {
		return "category must be 100 characters or fewer"
	}
	if len(notes) > 2000 {
		return "notes must be 2000 characters or fewer"
	}
	if icon != "" && !nodeIconKeys[icon] && !validCustomIconSvg(icon) {
		return "unknown icon"
	}
	if color != "" && !validNodeColorHex(color) {
		return "color must be a #rrggbb hex value"
	}
	return ""
}

// probeResultJSON is what the probe handlers emit per node. reachability is a
// tri-state ("yes"|"no"|"unknown") so the frontend can display the four
// distinct cases without forwarding a nullable bool through JSX holes.
type probeResultJSON struct {
	NodeID    int64  `json:"node_id"`
	Reachable string `json:"reachable"` // "yes" | "no" | "unknown"
	Name      string `json:"name,omitempty"`
	Note      string `json:"note,omitempty"`
}

// ListNodesHandler returns every registered edge with its latest telemetry and
// recomputed uptime % so the admin UI can draw the monitor cards.
func ListNodesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewNodeRepository(con)
	nodes, err := repo.ListNodes()
	if err != nil {
		log.Println("ListNodes error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): NODES_OWN → only nodes the caller
	// registered; NODES_ALL / MANAGE_NODES umbrella → full fleet.
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
		if !hasAll && hasOwn {
			filtered := make([]models.Node, 0, len(nodes))
			for _, n := range nodes {
				if n.OwnerID == uid {
					filtered = append(filtered, n)
				}
			}
			writeJSON(w, filtered)
			return
		}
	}
	writeJSON(w, nodes)
}

// CreateNodeHandler registers a new edge. The freshly minted token is returned
// exactly once in the response body, mirroring the API-key flow.
func CreateNodeHandler(w http.ResponseWriter, r *http.Request) {
	var req createNodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	// Normalize connection mode.
	req.ConnectionMode = normalizeConnectionMode(req.ConnectionMode)
	if !isValidConnectionMode(req.ConnectionMode) {
		http.Error(w, "invalid connection_mode", http.StatusBadRequest)
		return
	}
	// Address validation depends on mode:
	// - reverse_tunnel: address optional (panel never dials edge) – allow "tunnel" placeholder or empty.
	// - both: BOTH transports alive — a real dialable address is required AND the edge opens a tunnel.
	// - local_* : address is synthesized from port earlier; but req.Address is the effectiveAddress already.
	// - direct: must be a valid address.
	if req.ConnectionMode == "reverse_tunnel" {
		// For tunnel, address may be "tunnel" sentinel or empty; normalize to "tunnel".
		if strings.TrimSpace(req.Address) == "" {
			req.Address = "tunnel"
		}
		// Do not run strict host:port validation for tunnel.
	} else {
		if req.Address == "" {
			http.Error(w, "address is required", http.StatusBadRequest)
			return
		}
		if err := validateNodeAddress(req.Address); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	// WSS channels: validate early so a bad row fails before the node lands.
	var wssInput []repository.WssChannelInput
	if req.WssChannels != nil {
		var err error
		wssInput, err = wssChannelsToInput(req.WssChannels)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// Channels only make sense on tunnel-capable modes; fail closed so a
		// direct/local_port node never ships a misleading channel list.
		if len(wssInput) > 0 && !isTunnelMode(req.ConnectionMode) {
			http.Error(w, "wss_channels require a WSS or both connection mode", http.StatusBadRequest)
			return
		}
	}
	if msg := validateNodeDisplay(req.Name, req.LocationNode, req.Category, req.Notes, req.Icon, req.Color); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	healthEnabled := true
	if req.HealthEnabled != nil {
		healthEnabled = *req.HealthEnabled
	}
	repo := repository.NewNodeRepository(con)
	// Composite uniqueness: two nodes may share a name and two may share a
	// label, but no two nodes may share BOTH. Enforced server-side so the
	// rule holds even for non-UI clients.
	taken, terr := repo.NameLabelTaken(req.Name, req.LocationNode, 0)
	if terr != nil {
		log.Println("NameLabelTaken error:", terr)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if taken {
		http.Error(w, "a node with this name and label pair already exists — change the name or the node label", http.StatusConflict)
		return
	}
	uid, _ := UserIDFromContext(r)
	node, token, err := repo.CreateNode(repository.CreateNodeInput{
		Name:              req.Name,
		Address:           req.Address,
		UseTLS:            req.UseTLS,
		ConnectionMode:    req.ConnectionMode,
		HealthEnabled:     healthEnabled,
		HealthInterval:    req.HealthInterval,
		HealthTimeout:     req.HealthTimeout,
		HealthRetries:     req.HealthRetries,
		SkipTLSVerify:     req.SkipTLSVerify,
		Notes:             req.Notes,
		InstallDir:        req.InstallDir,
		AllowedKinds:      req.AllowedKinds,
		AllocMemMiB:       req.AllocMemMiB,
		MemOvercommitPct:  req.MemOvercommitPct,
		AllocDiskMiB:      req.AllocDiskMiB,
		DiskOvercommitPct: req.DiskOvercommitPct,
		InstancesDir:      req.InstancesDir,
		Category:        req.Category,
		LocationCountry: req.LocationCountry,
		LocationNode:    req.LocationNode,
		Icon:            req.Icon,
		Color:           req.Color,
		OwnerID:           uid,
	})
	if err != nil {
		log.Println("CreateNode error:", err)
		http.Error(w, "could not create node", http.StatusInternalServerError)
		return
	}
	// Persist the WSS box rows atomically with the new node.
	if req.WssChannels != nil {
		if err := repository.NewWssChannelRepository(con).ReplaceChannels(node.ID, wssInput); err != nil {
			log.Println("CreateNode wss_channels error:", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	nid := node.ID
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "create",
		TargetID:    &nid,
		TargetLabel: node.Name,
		Message:     fmt.Sprintf("registered edge %q at %s", node.Name, node.Address),
	})
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]any{
		"id":           node.ID,
		"name":         node.Name,
		"address":      node.Address,
		"use_tls":      node.UseTLS,
		"token_prefix": node.TokenPrefix,
		"status":       node.Status,
		"token":        token, // returned ONCE – never again.
	})
}

// nodeOwnForbidden returns a 403 when the caller holds NODES_OWN
// without NODES_ALL and is trying to touch a node they don't own.
// Call it at the top of every per-node handler (update / delete /
// rotate-token / local-setup / purge / probes / heartbeats); a nil
// *models.Node (e.g. a missing row) falls through and lets the
// handler return its own 404. The helper keeps the six callsites
// consistent and mirrors InstanceOwnForbidden in instance_handler.go.
func nodeOwnForbidden(w http.ResponseWriter, r *http.Request, ownerID int64) bool {
	if uid, _ := UserIDFromContext(r); uid != 0 {
		con, err := repository.OpenDB()
		if err != nil {
			return false
		}
		defer con.Close()
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
		if !hasAll && hasOwn && ownerID != uid {
			http.Error(w, "forbidden: own-scope may only access nodes you registered", http.StatusForbidden)
			return true
		}
	}
	return false
}

// UpdateNodeHandler edits the display name / dial address / TLS toggle.
func UpdateNodeHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req updateNodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	req.ConnectionMode = normalizeConnectionMode(req.ConnectionMode)
	if !isValidConnectionMode(req.ConnectionMode) {
		http.Error(w, "invalid connection_mode", http.StatusBadRequest)
		return
	}
	if req.ConnectionMode == "reverse_tunnel" {
		if strings.TrimSpace(req.Address) == "" {
			req.Address = "tunnel"
		}
	} else {
		if req.Address == "" {
			http.Error(w, "address is required", http.StatusBadRequest)
			return
		}
		if err := validateNodeAddress(req.Address); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	// WSS channels: validate early so a bad row fails before the node lands.
	var wssInput []repository.WssChannelInput
	if req.WssChannels != nil {
		var err error
		wssInput, err = wssChannelsToInput(req.WssChannels)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(wssInput) > 0 && !isTunnelMode(req.ConnectionMode) {
			http.Error(w, "wss_channels require a WSS or both connection mode", http.StatusBadRequest)
			return
		}
	}
	if msg := validateNodeDisplay(req.Name, req.LocationNode, req.Category, req.Notes, req.Icon, req.Color); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	// Ownership scope (migration 054): own-scope callers may only edit
	// nodes they own.
	if nd, gerr := repo.GetNode(id); gerr == nil && nd != nil {
		if nodeOwnForbidden(w, r, nd.OwnerID) {
			return
		}
	}
	healthEnabled := true
	if req.HealthEnabled != nil {
		healthEnabled = *req.HealthEnabled
	}
	// Composite (name, label) uniqueness — skip the row being edited via
	// excludeID so a no-op save doesn't collide with itself.
	taken, terr := repo.NameLabelTaken(req.Name, req.LocationNode, id)
	if terr != nil {
		log.Println("NameLabelTaken error:", terr)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if taken {
		http.Error(w, "a node with this name and label pair already exists — change the name or the node label", http.StatusConflict)
		return
	}
	if err := repo.UpdateNode(id, repository.UpdateNodeInput{
		Name:              req.Name,
		Address:           req.Address,
		UseTLS:            req.UseTLS,
		ConnectionMode:    req.ConnectionMode,
		HealthEnabled:     healthEnabled,
		HealthInterval:    req.HealthInterval,
		HealthTimeout:     req.HealthTimeout,
		HealthRetries:     req.HealthRetries,
		SkipTLSVerify:     req.SkipTLSVerify,
		Notes:             req.Notes,
		InstallDir:        req.InstallDir,
		AllowedKinds:      req.AllowedKinds,
		AllocMemMiB:       req.AllocMemMiB,
		MemOvercommitPct:  req.MemOvercommitPct,
		AllocDiskMiB:      req.AllocDiskMiB,
		DiskOvercommitPct: req.DiskOvercommitPct,
		InstancesDir:      req.InstancesDir,
		Category:        req.Category,
		LocationCountry: req.LocationCountry,
		LocationNode:    req.LocationNode,
		Icon:            req.Icon,
		Color:           req.Color,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Persist the WSS box rows (replace-all) when the payload carried them.
	if req.WssChannels != nil {
		if err := repository.NewWssChannelRepository(con).ReplaceChannels(id, wssInput); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated edge %q -> %s", req.Name, req.Address),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DeleteNodeHandler removes a node and (via FK cascade) its heartbeat log.
func DeleteNodeHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	// Capture the node name up-front so the audit row carries a useful
	// label even after the row is removed.
	var label string
	var ownerID int64
	if nd, gerr := repo.GetNode(id); gerr == nil && nd != nil {
		label = nd.Name
		ownerID = nd.OwnerID
	}
	if nodeOwnForbidden(w, r, ownerID) {
		return
	}
	if err := repo.DeleteNode(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted edge %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// RotateNodeTokenHandler reissues the edge token and returns the plaintext once.
func RotateNodeTokenHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	// Scope check (migration 054): rotate-token is an edit-level verb
	// so own-scope callers may only touch their own nodes.
	var label string
	if nd, gerr := repo.GetNode(id); gerr == nil && nd != nil {
		label = nd.Name
		if nodeOwnForbidden(w, r, nd.OwnerID) {
			return
		}
	}
	token, err := repo.RotateToken(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "rotate_token",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("rotated edge token for %q", label),
	})
	writeJSON(w, map[string]string{"token": token})
}

// NodeHeartbeatsHandler returns the recent up/down buckets for a node so the UI
// can render the ||||||| uptime strip.
func NodeHeartbeatsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	limit := 60
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 288 {
			limit = n
		}
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	// Ownership scope: Own without All may only read own nodes' telemetry.
	if nd, gerr := repo.GetNode(id); gerr == nil && nd != nil {
		if nodeOwnForbidden(w, r, nd.OwnerID) {
			return
		}
	}
	hbs, err := repo.RecentHeartbeats(id, limit)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Emit an empty JSON array (not null) when there's no history yet.
	if len(hbs) == 0 {
		w.Write([]byte("[]"))
		return
	}
	writeJSON(w, hbs)
}

// ============================== HEARTBEAT INGEST ==============================
// This route is NOT behind the auth middleware – ksedge authenticates with the
// shared edge token in the request body. Keeping it in the public group lets
// the edge push metrics without ever holding a panel session cookie.

type heartbeatRequest struct {
	Token      string  `json:"token"`
	RAMUsed    int64   `json:"ram_used"`
	RAMTotal   int64   `json:"ram_total"`
	CPUPercent float64 `json:"cpu_percent"`
	DiskUsed   int64   `json:"disk_used"`
	DiskTotal  int64   `json:"disk_total"`
	UptimeSecs int64   `json:"uptime_secs"`
	// Drivers reports which workload drivers the edge can execute (docker,
	// kvm, multipass, lxd). The panel renders a four-segment ring on the
	// node card; a missing driver keeps its arc grey.
	Drivers struct {
		Docker    bool `json:"docker"`
		KVM       bool `json:"kvm"`
		Multipass bool `json:"multipass"`
		LXD       bool `json:"lxd"`
	} `json:"drivers"`
	// Per-metric "did the edge actually collect this?" flags the edge now
	// ships alongside every telemetry snapshot. Missing on legacy edges,
	// defaulting to false — the panel treats false + zero telemetry as
	// "no data" so the card shows a "partial" verdict instead of pretending
	// the zeros are real measurements.
	HwRAMOK     bool `json:"hw_ram_ok"`
	HwCPUOK     bool `json:"hw_cpu_ok"`
	HwDiskOK    bool `json:"hw_disk_ok"`
	HwUptimeOK  bool `json:"hw_uptime_ok"`
	HwDriversOK bool `json:"hw_drivers_ok"`
}

// HeartbeatIngestHandler is the public endpoint a ksedge calls once per minute.
// On a bad token we return 401; on success we ack with the node id so the edge
// can confirm it's talking to the right panel row.
func HeartbeatIngestHandler(w http.ResponseWriter, r *http.Request) {
	var req heartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	id, err := repo.IngestHeartbeat(repository.IngestInput{
		Token:           req.Token,
		RAMUsed:         req.RAMUsed,
		RAMTotal:        req.RAMTotal,
		CPUPercent:      req.CPUPercent,
		DiskUsed:        req.DiskUsed,
		DiskTotal:       req.DiskTotal,
		UptimeSecs:      req.UptimeSecs,
		DriverDocker:    req.Drivers.Docker,
		DriverKVM:       req.Drivers.KVM,
		DriverMultipass: req.Drivers.Multipass,
		DriverLXD:       req.Drivers.LXD,
		HwRAMOK:         req.HwRAMOK,
		HwCPUOK:         req.HwCPUOK,
		HwDiskOK:        req.HwDiskOK,
		HwUptimeOK:      req.HwUptimeOK,
		HwDriversOK:     req.HwDriversOK,
	})
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]any{"node_id": id, "status": "ok"})
}

// ============================== EDGE PROBE (admin) ==============================

// ProbeNodeHandler dials this node's /health actively and records the result
// on the row, so an operator's "Recheck" button reliably fixes the card even
// before the next heartbeat tick. Runs outside the heartbeat cadence so a
// misconfigured port still surfaces a useful verdict instantly.
func ProbeNodeHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	nd, err := repo.GetNode(id)
	if err != nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	res := probe.Probe(*nd)
	_ = repo.RecordProbe(id, repository.ProbeInput{
		Reachable: res.Reachable,
		SeenName:  res.SeenName,
		CheckedAt: time.Now().UTC(),
	})
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "probe",
		TargetID:    &id,
		TargetLabel: nd.Name,
		Message: fmt.Sprintf("probed edge %q (reachable=%s)", nd.Name,
			probeReachableString(res.Reachable)),
	})
	writeJSON(w, probeResultJSON{
		NodeID:    id,
		Reachable: probeReachableString(res.Reachable),
		Name:      res.SeenName,
		Note:      res.Note,
	})
}

// ProbeAllNodesHandler probes every registered edge with bounded concurrency
// and emits an array of per-node results. Used by the page-level "Recheck all"
// button so the operator can refresh every card's verdict without picking each
// one. Failures per node are isolated — a node that can't be probed does NOT
// break the rest of the response.
func ProbeAllNodesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	nodes, err := repo.ListNodes()
	if err != nil {
		log.Println("ProbeAllNodes ListNodes error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope: Own without All probes only own nodes (mirrors List).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
		if !hasAll && hasOwn {
			filtered := make([]models.Node, 0, len(nodes))
			for _, n := range nodes {
				if n.OwnerID == uid {
					filtered = append(filtered, n)
				}
			}
			nodes = filtered
		}
	}

	type probeResult struct {
		idx       int
		reachable bool
		seenName  string
		note      string
	}

	// Probe nodes with bounded concurrency so we don't spawn thousands of
	// goroutines for large fleets. The channel capacity is bounded by the
	// number of nodes, and we use a WaitGroup to collect results reliably.
	const maxProbeConcurrency = 20
	sem := make(chan struct{}, maxProbeConcurrency)
	var results []probeResult = make([]probeResult, len(nodes))
	var wg sync.WaitGroup

	for i, nd := range nodes {
		wg.Add(1)
		go func(idx int, node models.Node) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			res := probe.Probe(node)
			results[idx] = probeResult{
				idx:       idx,
				reachable: res.Reachable,
				seenName:  res.SeenName,
				note:      res.Note,
			}
		}(i, nd)
	}

	wg.Wait()

	// Record each probe result in the DB and build the JSON response.
	writeJSON(w, struct {
		Results []probeResultJSON `json:"results"`
	}{
		Results: func() []probeResultJSON {
			out := make([]probeResultJSON, len(nodes))
			for i, r := range results {
				_ = repo.RecordProbe(nodes[i].ID, repository.ProbeInput{
					Reachable: r.reachable,
					SeenName:  r.seenName,
					CheckedAt: time.Now().UTC(),
				})
				out[i] = probeResultJSON{
					NodeID:    nodes[i].ID,
					Reachable: probeReachableString(r.reachable),
					Name:      r.seenName,
					Note:      r.note,
				}
			}
			return out
		}(),
	})
}

// probeReachableString maps the probe.Result bool to the JSON tri-state so
// the frontend doesn't branch on a missing field vs a literal false. Today's
// probe semantics only emit true/false, but "unknown" is reserved for the
// case where the repo couldn't be reached to even attempt the probe.
func probeReachableString(reachable bool) string {
	if reachable {
		return "yes"
	}
	return "no"
}

// ============================== LOCAL EDGE SETUP ============================

// ksedgeEdgeURL is the sole source for the ksedge binary used by local node setup:
// https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge
const ksedgeEdgeURL = "https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge"

// ksedgeDownloadURLs returns the single ksedge source for acquisition.
func ksedgeDownloadURLs() []string {
	return []string{
		ksedgeEdgeURL,
	}
}

// setupLocalResponse is the JSON shape the panel hands back from the
// "Create & setup" button so the UI can render an inline log + probe verdict.
type setupLocalResponse struct {
	OK      bool             `json:"ok"`
	Message string           `json:"message,omitempty"`
	Log     string           `json:"log,omitempty"`
	Probe   *probeResultJSON `json:"probe,omitempty"`
}

// SetupLocalNodeHandler installs and launches a ksedge edge directly on the
// panel host for a localhost-mode node. It is the one-click equivalent of the
// bootstrap snippet the manual flow prints: download ksedge into a per-node
// directory, write the panel-generated config.json, and start `./ksedge
// launch` detached so the edge survives the HTTP request. The freshly started
// edge then pushes heartbeats to the panel with the node token, which flips
// the card green on its own.
//
// Only localhost nodes (127.0.0.1:<port> or localhost:<port>) are eligible —
// running a remote edge from here would just hang the request.
func SetupLocalNodeHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	node, err := repo.GetNode(id)
	if err != nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	if !isLocalNode(node) {
		http.Error(w, "setup is only supported for local edge nodes (local_port / local_wss / local_both)", http.StatusBadRequest)
		return
	}
	token, err := repo.PlainToken(id)
	if err != nil || token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	port := portFromAddress(node.Address, "4040")
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	// Prefer X-Forwarded-Proto when behind a proxy.
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		if proto == "https" {
			scheme = "https"
		} else if proto == "http" {
			scheme = "http"
		}
	}
	panelURL := scheme + "://" + r.Host

	// Per-node working directory under the panel data dir so multiple local
	// edges (or a re-setup) don't stomp each other's binaries. We honour
	// node.InstallDir ONLY when it is a non-default custom path (the stored
	// default "./localnode/" collides with the CLI's "localnode/ksedge/"
	// layout and makes ksedgePath a directory → fork/exec ENOENT). Default/
	// empty values fall back to the isolated per-node dir; a custom absolute
	// (or non-default relative) is respected so "dedicated disk" installs
	// still work. This mirrors PurgeLocalNodeHandler's isDefault check so
	// setup ↔ purge stay symmetric.
	trim := strings.TrimSpace(node.InstallDir)
	isDefaultInstallDir := trim == "" ||
		trim == "./localnode" || trim == "./localnode/" ||
		trim == "localnode" || trim == "localnode/" ||
		trim == "./localnode/ksedge" || trim == "./localnode/ksedge/" ||
		trim == "localnode/ksedge" || trim == "localnode/ksedge/"
	var dir string
	if isDefaultInstallDir {
		dir = filepath.Join(config.DataDir(), "localnode", fmt.Sprintf("ksedge-%d", id))
	} else {
		if filepath.IsAbs(trim) {
			dir = filepath.Clean(trim)
		} else {
			dir = filepath.Join(config.DataDir(), filepath.Clean(trim))
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		http.Error(w, "could not create edge directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	logLines := []string{}
	ksedgePath := filepath.Join(dir, "ksedge")
	configPath := filepath.Join(dir, "config.json")
	logPath := filepath.Join(dir, "ksedge.log")

	// 1) Acquire ksedge if the binary isn't already on disk. We skip the
	//    fetch when a non-empty executable already exists so re-running
	//    "Create & setup" after a network blip doesn't refetch ~10MB every
	//    time. Preference order: local binary next to the panel (instant,
	//    no network) → ks-panel-edge release URL.
	//    Treat a directory at ksedgePath (leftover from CLI layout
	//    localnode/ksedge/) as missing so we don't try to exec a directory.
	if fi, statErr := os.Stat(ksedgePath); statErr != nil || fi.IsDir() || fi.Size() == 0 {
		if localSrc := findLocalKsedge(); localSrc != "" {
			logLines = append(logLines, fmt.Sprintf("copying ksedge from local %s …", localSrc))
			if err := copyFile(localSrc, ksedgePath); err != nil {
				http.Error(w, "local copy failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if err := os.Chmod(ksedgePath, 0o755); err != nil {
				http.Error(w, "chmod failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
			logLines = append(logLines, "copied ksedge from local release")
		} else {
			var lastErr error
			downloaded := false
			for _, u := range ksedgeDownloadURLs() {
				logLines = append(logLines, "downloading ksedge from "+u+" …")
				if err := downloadFile(u, ksedgePath); err != nil {
					lastErr = err
					logLines = append(logLines, fmt.Sprintf("download from %s failed: %v", u, err))
					continue
				}
				if err := os.Chmod(ksedgePath, 0o755); err != nil {
					http.Error(w, "chmod failed: "+err.Error(), http.StatusInternalServerError)
					return
				}
				logLines = append(logLines, "downloaded ksedge from "+u)
				downloaded = true
				break
			}
			if !downloaded {
				msg := "download failed"
				if lastErr != nil {
					msg += ": " + lastErr.Error()
				}
				msg += " — ensure the ks-panel-edge release is reachable or place a ksedge binary next to the panel executable (release/ksedge) and retry"
				writeJSONStatus(w, http.StatusBadGateway, map[string]any{
					"error": msg,
					"log":   strings.Join(logLines, "\n"),
				})
				return
			}
		}
	} else {
		logLines = append(logLines, "ksedge already present, skipping download")
	}

	// 2) Write the panel-generated config.json. The token is the raw edge
	//    token stored on the node row, identical to what the manual snippet
	//    embeds. use_tls_upstream describes edge→panel TLS (panel_url
	//    scheme), not the panel→edge node.UseTLS flag — deriving it from the
	//    observed panel scheme keeps https panels consistent. The edge
	//    currently derives TLS from panel_url itself (flag retained for
	//    backwards compat with older configs).
	cfg := map[string]any{
		"uuid":               fmt.Sprintf("panel-local-%d", id),
		"name":               node.Name,
		"panel_url":          panelURL,
		"token":              token,
		"listen_port":        parseIntDefault(port, 4040),
		"heartbeat_interval": 60,
		"use_tls_upstream":   scheme == "https",
		"skip_verify":        node.SkipTLSVerify,
		"connection_mode":    node.ConnectionMode,
	}
	// Honour the operator's daemon instance-file directory override. The
	// daemon defaults to /var/lib/kspanel/instances when the key is absent
	// (with "./instances" resolved relative to the edge binary), so we only
	// emit it when the node row carried a non-empty setting — keeps the
	// generated config minimal for the common case.
	if dir := strings.TrimSpace(node.InstancesDir); dir != "" {
		cfg["instances_dir"] = dir
	}
	cfgBytes, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.WriteFile(configPath, cfgBytes, 0o644); err != nil {
		http.Error(w, "could not write config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	logLines = append(logLines, "wrote config.json")

	// 3) Launch `./ksedge launch` detached so the HTTP handler returning
	//    does NOT take the edge down with it. We redirect stdout/stderr to a
	//    per-node log file so an operator can still inspect boot output
	//    without keeping the request alive.
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		http.Error(w, "could not open log file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer logFile.Close()
	absKsedge, absErr := filepath.Abs(ksedgePath)
	if absErr != nil {
		http.Error(w, "abs path: "+absErr.Error(), http.StatusInternalServerError)
		return
	}
	cmd := exec.Command(absKsedge, "launch")
	cmd.Dir = dir
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	// Detach the child into its own process group so signals sent to the
	// panel (e.g. the request handler's goroutine cleanup) don't propagate.
	cmd.SysProcAttr = setDetachSysProcAttr()
	if err := cmd.Start(); err != nil {
		http.Error(w, "failed to start edge: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Reap the child so a finished ksedge never lingers as a zombie under
	// the panel: Start without Wait leaks the process descriptor until the
	// panel itself exits. The edge is detached (own process group), so
	// waiting here only reaps — it doesn't block this handler.
	go func() { _ = cmd.Wait() }()
	logLines = append(logLines, fmt.Sprintf("started ksedge (pid %d) on 127.0.0.1:%s", cmd.Process.Pid, port))

	// 4) Give the edge a moment to bind the port, then actively probe it so
	//    the modal can show a green/red verdict without a manual recheck.
	time.Sleep(1200 * time.Millisecond)
	probeRes := probe.Probe(*node)
	_ = repo.RecordProbe(id, repository.ProbeInput{
		Reachable: probeRes.Reachable,
		SeenName:  probeRes.SeenName,
		CheckedAt: time.Now().UTC(),
	})

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "setup_local",
		TargetID:    &id,
		TargetLabel: node.Name,
		Message:     fmt.Sprintf("auto-installed and launched local edge %q on 127.0.0.1:%s", node.Name, port),
	})

	writeJSON(w, setupLocalResponse{
		OK:      true,
		Message: "Edge installed and started",
		Log:     strings.Join(logLines, "\n"),
		Probe: &probeResultJSON{
			NodeID:    id,
			Reachable: probeReachableString(probeRes.Reachable),
			Name:      probeRes.SeenName,
			Note:      probeRes.Note,
		},
	})
}

// isLocalAddress reports whether a node address points at the panel host
// itself (127.0.0.1 or localhost), which is the only case where the panel
// can reasonably launch the edge binary in-process. Accepts the full
// loopback family (127/8, localhost, ::1, [::1]) to stay symmetric with the
// frontend's isLocalAddress — otherwise an IPv6 loopback edge passes the
// form as local but Setup/Purge rejects it with 400.
func isLocalAddress(addr string) bool {
	addr = strings.TrimSpace(addr)
	if strings.HasPrefix(addr, "127.") || strings.HasPrefix(addr, "localhost:") || addr == "localhost" {
		return true
	}
	if addr == "::1" || strings.HasPrefix(addr, "::1:") || strings.HasPrefix(addr, "[::1]") {
		return true
	}
	return false
}

// isLocalNode reports whether a node row is a localhost edge that the panel
// can manage locally (setup/purge). It checks the explicit connection_mode first
// (local_port / local_wss / local_both) and falls back to address sniffing for legacy rows
// and for direct-mode rows that still carry a loopback address (pre-050 rows
// defaulted to 'direct' even when they were created as localhost edges).
func isLocalNode(n *models.Node) bool {
	if n == nil {
		return false
	}
	m := strings.ToLower(strings.TrimSpace(n.ConnectionMode))
	if m == "local_port" || m == "local_wss" || m == "local_both" {
		return true
	}
	if m == "reverse_tunnel" {
		return false
	}
	// For direct, empty, or unknown modes, fall back to address sniffing so
	// legacy rows (which were defaulted to 'direct' by the 050 migration)
	// that actually point at 127.0.0.1/localhost remain manageable via
	// setup/purge until the operator edits them to the proper local_* mode.
	return isLocalAddress(n.Address)
}

// portFromAddress pulls the port segment off a host:port string, falling back
// to the supplied default when the address is malformed or lacks a port.
// Bracketed IPv6 ([host] / [host]:port, the only form validateNodeAddress
// accepts) is parsed bracket-aware: a bare LastIndex(":") split would return
// "1]" for "[::1]". Ports must be numeric (isValidPortStr) — anything else
// falls back rather than propagating garbage into dial strings.
func portFromAddress(addr, fallback string) string {
	if strings.HasPrefix(addr, "[") {
		if end := strings.Index(addr, "]"); end >= 0 {
			if rest := addr[end+1:]; strings.HasPrefix(rest, ":") && isValidPortStr(rest[1:]) {
				return rest[1:]
			}
		}
		return fallback
	}
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		if p := addr[idx+1:]; isValidPortStr(p) {
			return p
		}
	}
	return fallback
}

func parseIntDefault(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// findLocalKsedge returns the path of a ksedge binary that already ships
// alongside the panel (so setup-local can copy instead of downloading).
// It checks next to the running executable and in the repo's release dir.
func findLocalKsedge() string {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, "ksedge"),
			filepath.Join(dir, "release", "ksedge"),
			filepath.Join(dir, "..", "release", "ksedge"),
		)
	}
	candidates = append(candidates,
		filepath.Join("release", "ksedge"),
		filepath.Join(".", "ksedge"),
	)
	for _, p := range candidates {
		if fi, err := os.Stat(filepath.Clean(p)); err == nil && fi.Size() > 0 && fi.Mode().IsRegular() {
			if abs, aerr := filepath.Abs(p); aerr == nil {
				return abs
			}
			return p
		}
	}
	return ""
}

// copyFile streams src to dst via a temp file and renames atomically.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

// downloadFile streams a URL to disk with a generous timeout (the ksedge
// artifact is ~10MB; a slow connection can take a minute or two). We write
// through a temp file and rename so a partial download never leaves a
// truncated binary behind that the "already present" fast path would trust.
func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "kspanel-setup-local/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// Drain body for keep-alive and surface a short snippet to help debug
		// 404/502 from a missing release asset vs a proxy error.
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		snip := strings.TrimSpace(string(body))
		if snip != "" && len(snip) < 200 {
			return fmt.Errorf("HTTP %d: %s", resp.StatusCode, snip)
		}
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	tmp := dest + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dest)
}

// ============================ LOCAL EDGE PURGE ===============================

// purgeLocalResponse is the JSON shape the "Delete edge completely" menu item
// returns so the UI can render an inline report (what was stopped, what was
// removed) instead of a bare 204.
type purgeLocalResponse struct {
	OK      bool     `json:"ok"`
	Message string   `json:"message,omitempty"`
	Log     []string `json:"log,omitempty"`
}

// PurgeLocalNodeHandler is the destructive counterpart to SetupLocalNodeHandler.
// For a localhost node it does ALL of:
//  1. stops the ksedge daemon installed by the panel (the one running from
//     <DataDir>/localnode/ksedge-<id>/),
//  2. removes that whole per-node directory (binary + config + log), and
//  3. deletes the node row from the panel (and its heartbeat history via FK).
//
// It only operates on localhost nodes — a remote edge lives on another host we
// can't reach, so the menu route returns 400 rather than half-delete. The row
// is dropped last so a failure midway leaves the node visible for a retry
// instead of an orphaned running binary with no panel entry.
func PurgeLocalNodeHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	node, err := repo.GetNode(id)
	if err != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	if !isLocalNode(node) {
		http.Error(w, "purge is only supported for local edge nodes (local_port / local_wss / local_both)", http.StatusBadRequest)
		return
	}
	label := node.Name

	// Per-node working dir the admin setup created. This is the only place a
	// panel-managed local edge lives, so it's both the kill target and the
	// rm target. Honour an operator-set install_dir ONLY when it is a
	// non-default custom path; the UI's default "./localnode/" is a shared
	// CLI layout (localnode/ksedge/) that collides with the per-node
	// isolation (ksedge-<id>). For default/empty we always use the per-node
	// dir so setup + purge stay symmetric and we don't accidentally nuke the
	// CLI edge.
	var dir string
	trim := strings.TrimSpace(node.InstallDir)
	isDefaultInstallDir := trim == "" ||
		trim == "./localnode" || trim == "./localnode/" ||
		trim == "localnode" || trim == "localnode/" ||
		trim == "./localnode/ksedge" || trim == "./localnode/ksedge/" ||
		trim == "localnode/ksedge" || trim == "localnode/ksedge/"
	if isDefaultInstallDir {
		dir = filepath.Join(config.DataDir(), "localnode", fmt.Sprintf("ksedge-%d", id))
	} else {
		if filepath.IsAbs(trim) {
			dir = filepath.Clean(trim)
		} else {
			// Relative custom path — resolve against DataDir so the purge
			// operates inside the panel's data tree, not the panel's cwd
			// (which varies between systemd, retest.sh, etc.).
			dir = filepath.Join(config.DataDir(), filepath.Clean(trim))
		}
	}

	logLines := []string{}

	// 1) Stop the running ksedge that booted from this dir. We don't keep a pid
	//    file, so we scan /proc for a process whose cwd matches `dir` — that
	//    survives re-launches and disambiguates from any CLI-spawned edge
	//    (which lives in localnode/ksedge, not ksedge-<id>). Errors here are
	//    soft: a node whose edge already died should still delete cleanly.
	stopped, stopLog := stopEdgeByDir(dir)
	logLines = append(logLines, stopLog...)
	if stopped > 0 {
		logLines = append(logLines, fmt.Sprintf("stopped %d ksedge process(es)", stopped))
	} else {
		logLines = append(logLines, "no running ksedge found for this node")
	}

	// 2) Remove the on-disk edge (binary, config.json, ksedge.log). Missing
	//    dir is fine — purge must be idempotent so a half-deleted node can be
	//    cleared with a second click.
	if _, statErr := os.Stat(dir); statErr == nil {
		if rmErr := os.RemoveAll(dir); rmErr != nil {
			// Don't abort — the row delete still helps the operator, and the
			// leftover dir is harmless. Surface it in the inline log.
			logLines = append(logLines, fmt.Sprintf("could not remove %s: %v", dir, rmErr))
		} else {
			logLines = append(logLines, "removed edge directory "+dir)
		}
	} else {
		logLines = append(logLines, "edge directory already absent")
	}

	// 3) Drop the panel row (cascades heartbeats). Done last on purpose:
	//    if steps 1-2 partly failed the node stays on-screen for a retry.
	if err := repo.DeleteNode(id); err != nil {
		writeJSON(w, purgeLocalResponse{
			OK:      false,
			Message: "edge stopped/removed but node row delete failed: " + err.Error(),
			Log:     logLines,
		})
		return
	}
	logLines = append(logLines, "deleted node row from panel")

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "purge_local",
		TargetLabel: label,
		Message:     fmt.Sprintf("purged local edge %q (stopped daemon + removed files + dropped row)", label),
	})

	writeJSON(w, purgeLocalResponse{
		OK:      true,
		Message: "Edge fully removed",
		Log:     logLines,
	})
}

// stopEdgeByDir finds every running process whose current working directory is
// `dir` and terminates it. It returns the number of killed processes plus per-
// step log lines. This is Linux-specific (/proc scan); on other platforms it
// falls back to a best-effort pgrep/kill on the directory path inside the
// command line. SIGTERM first (lets the edge flush), SIGKILL after a short
// grace for anything still alive.
func stopEdgeByDir(dir string) (int, []string) {
	pids := findEdgePIDs(dir)
	if len(pids) == 0 {
		return 0, nil
	}
	var logLines []string
	// SIGTERM the lot.
	for _, pid := range pids {
		if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
			logLines = append(logLines, fmt.Sprintf("SIGTERM pid %d: %v", pid, err))
		}
	}
	// Give them a moment to exit cleanly.
	deadline := time.Now().Add(1500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if !anyAlive(pids) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	// SIGKILL the survivors.
	killed := 0
	for _, pid := range pids {
		if isAlive(pid) {
			_ = syscall.Kill(pid, syscall.SIGKILL)
			logLines = append(logLines, fmt.Sprintf("escalated pid %d to SIGKILL", pid))
			killed++
		}
	}
	// Wait briefly for the SIGKILLs to reap.
	time.Sleep(200 * time.Millisecond)
	return len(pids), logLines
}

// findEdgePIDs returns the pids of processes whose current working directory
// equals dir. That cwd match is the only authoritative signal: the panel
// launched the edge with cmd.Dir == dir, and a ksedge that re-execs or
// relocated would change cwd away from it. We deliberately do NOT fall back
// to "any process named ksedge under localnode" — that could kill an
// unrelated edge (one installed by the CLI in localnode/ksedge, or owned by a
// different panel) on the same host. pgrep is only used when /proc isn't
// readable (non-Linux dev hosts) and even then keyed on the dir path being
// present in the command line so we never broaden to a sibling edge.
func findEdgePIDs(dir string) []int {
	var out []int
	procDir := "/proc"
	if entries, err := os.ReadDir(procDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			pid, perr := strconv.Atoi(e.Name())
			if perr != nil {
				continue
			}
			if cwd, lerr := os.Readlink(filepath.Join(procDir, e.Name(), "cwd")); lerr == nil && cwd == dir {
				out = append(out, pid)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	// Best-effort pgrep fallback for non-Linux hosts behind the same build.
	// Require the full dir path in the command line so we never match a
	// sibling ksedge launched from a different localnode/ subdirectory.
	if out = pgrepEdge(dir); len(out) > 0 {
		return out
	}
	return nil
}

// pgrepEdge shells out to pgrep as a portable fallback when /proc isn't
// usable (e.g. macOS dev box). Matches the full dir path in the command line.
// Returns the parsed pids, or nil on any error.
func pgrepEdge(dir string) []int {
	// Include the dir in the pattern so we never match a sibling ksedge
	// launched from a different localnode/ subdirectory.
	pattern := "ksedge launch"
	if strings.TrimSpace(dir) != "" {
		pattern = "ksedge launch.*" + regexpQuoteMeta(dir)
	}
	cmd := exec.Command("pgrep", "-f", pattern)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var pids []int
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if pid, e := strconv.Atoi(strings.TrimSpace(line)); e == nil {
			pids = append(pids, pid)
		}
	}
	// On Linux, additionally verify cwd == dir to avoid regex false-positives
	// from a dir substring appearing elsewhere in the command line.
	if len(pids) > 0 && dir != "" {
		var filtered []int
		for _, pid := range pids {
			if cwd, err := os.Readlink(filepath.Join("/proc", strconv.Itoa(pid), "cwd")); err == nil && cwd == dir {
				filtered = append(filtered, pid)
			} else if err != nil {
				// /proc not available (macOS) or unreadable — keep pid since
				// pattern already matched dir; better to over-match than miss.
				filtered = append(filtered, pid)
			}
		}
		return filtered
	}
	return pids
}

// regexpQuoteMeta escapes s so it can be used as a literal inside a regexp
// without pulling in the regexp package (keeps import minimal).
func regexpQuoteMeta(s string) string {
	var buf bytes.Buffer
	for _, r := range s {
		if strings.ContainsRune(`\.+*?()|[]{}^$`, r) {
			buf.WriteRune('\\')
		}
		buf.WriteRune(r)
	}
	return buf.String()
}

func isAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	if err == nil {
		return true
	}
	// ESRCH means the process is gone; anything else (EPERM) we treat as
	// alive so we don't skip a kill we should have done.
	return errnoIsPerm(err)
}

func anyAlive(pids []int) bool {
	for _, p := range pids {
		if isAlive(p) {
			return true
		}
	}
	return false
}

// errnoIsPerm reports whether err is an EPERM (process exists but is owned by
// someone else). Uses errors.Is for locale-independent check, with a string
// fallback for wrapped syscall errors on platforms where EPERM string differs.
func errnoIsPerm(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, syscall.EPERM) || errors.Is(err, syscall.EACCES) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "operation not permitted") ||
		strings.Contains(strings.ToLower(err.Error()), "permission denied")
}
