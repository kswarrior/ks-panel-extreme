package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ============================== NODE WSS CHANNELS (migration 062) ==============================
//
// Named WSS bindings per node, edited in the NodeForm's WSS box (top-right
// Add button). Each row carries a name, a task (all/files/node/instance)
// and — for both/local_both modes — a preferred transport (wss/port/auto)
// plus the emergency-fallback flag.
//
// Routing semantics (see internal/edge/routing.go):
//   - task all      catch-all; exact-task rows win over all rows.
//   - duplicates sharing one task divide that task's data round-robin.
//   - transport wss/port forces the transport for both/local_both; auto
//     uses WSS when connected else HTTP. fallback=1 retries the other
//     transport on overload/disconnect.

// maxWssChannelsPerNode caps rows per node so a stray client cannot grow
// the table without bound.
const maxWssChannelsPerNode = 32

// ListNodeWssChannelsHandler returns a node's WSS channels ordered by
// position then id.
func ListNodeWssChannelsHandler(w http.ResponseWriter, r *http.Request) {
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
	node, err := repository.NewNodeRepository(con).GetNode(id)
	if err != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	channels, err := repository.NewWssChannelRepository(con).ListChannels(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, channels)
}

// CreateNodeWssChannelHandler appends one channel to a node.
func CreateNodeWssChannelHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req wssChannelPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	node, err := repository.NewNodeRepository(con).GetNode(id)
	if err != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	if !isTunnelMode(node.ConnectionMode) {
		http.Error(w, "wss_channels require a WSS or both connection mode", http.StatusBadRequest)
		return
	}
	repo := repository.NewWssChannelRepository(con)
	existing, err := repo.ListChannels(id)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if len(existing) >= maxWssChannelsPerNode {
		http.Error(w, "too many channels on this node (max 32)", http.StatusBadRequest)
		return
	}
	fb := true
	if req.Fallback != nil {
		fb = *req.Fallback
	}
	cid, err := repo.CreateChannel(id, repository.WssChannelInput{
		Name:      req.Name,
		Task:      repository.NormalizeWssTask(req.Task),
		Transport: repository.NormalizeWssTransport(req.Transport),
		Fallback:  fb,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]any{"id": cid})
}

// UpdateNodeWssChannelHandler patches one channel row.
func UpdateNodeWssChannelHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	cid, err := strconv.ParseInt(chi.URLParam(r, "cid"), 10, 64)
	if err != nil {
		http.Error(w, "invalid channel id", http.StatusBadRequest)
		return
	}
	var req wssChannelPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	node, err := repository.NewNodeRepository(con).GetNode(id)
	if err != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	fb := true
	if req.Fallback != nil {
		fb = *req.Fallback
	}
	if err := repository.NewWssChannelRepository(con).UpdateChannel(id, cid, repository.WssChannelInput{
		Name:      req.Name,
		Task:      repository.NormalizeWssTask(req.Task),
		Transport: repository.NormalizeWssTransport(req.Transport),
		Fallback:  fb,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteNodeWssChannelHandler removes one channel row.
func DeleteNodeWssChannelHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	cid, err := strconv.ParseInt(chi.URLParam(r, "cid"), 10, 64)
	if err != nil {
		http.Error(w, "invalid channel id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	node, err := repository.NewNodeRepository(con).GetNode(id)
	if err != nil || node == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, node.OwnerID) {
		return
	}
	if err := repository.NewWssChannelRepository(con).DeleteChannel(id, cid); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
