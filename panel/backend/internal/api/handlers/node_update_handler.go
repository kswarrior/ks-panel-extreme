package handlers

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ============================== NODE SELF-UPDATE (proxy) ==============================
// The panel never upgrades a remote edge binary itself — it proxies a trigger
// RPC to the edge, and the edge downloads + swaps + restarts via its own
// reinstall.sh (mirrors System → Panel tab, but the script lives on the edge
// host). These five handlers are thin proxies over the edge client's
// tunnel-aware RPCs so direct, tunnel and local_* modes all work:
//
//	GET  /api/nodes/{id}/update-info          — edge build identity (view)
//	GET  /api/nodes/{id}/update-check         — remote manifest compare (view)
//	POST /api/nodes/{id}/update-apply         — download latest + relaunch (edit)
//	POST /api/nodes/{id}/reinstall            — force reinstall current (edit)
//	POST /api/nodes/{id}/reinstall-background — write + run reinstall.sh (edit)
//
// Info/check are view-level (like probe/heartbeats); the three mutating verbs
// are edit-level (like setup-local/rotate-token) since they restart the edge.

func loadNodeForUpdate(id int64) (*models.Node, string, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, "", err
	}
	defer con.Close()
	repo := repository.NewNodeRepository(con)
	nd, err := repo.GetNode(id)
	if err != nil || nd == nil {
		return nil, "", err
	}
	token, terr := repo.PlainToken(id)
	if terr != nil || token == "" {
		return nd, "", terr
	}
	return nd, token, nil
}

func parseNodeID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

// NodeUpdateInfoHandler proxies GET /api/edge/update-info.
func NodeUpdateInfoHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	out, err := edge.New(*nd, token).EdgeUpdateInfo()
	if err != nil {
		log.Printf("node %d update-info proxy failed: %v", id, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, out)
}

// NodeUpdateCheckHandler proxies GET /api/edge/update-check.
func NodeUpdateCheckHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	out, err := edge.New(*nd, token).EdgeUpdateCheck()
	if err != nil {
		log.Printf("node %d update-check proxy failed: %v", id, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, out)
}

// NodeUpdateApplyHandler proxies POST /api/edge/update-apply.
func NodeUpdateApplyHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	// The edge downloads (~10MB) before answering, so allow minutes.
	out, err := edge.NewWithTimeout(*nd, token, 6*time.Minute).EdgeUpdateApply()
	if err != nil {
		log.Printf("node %d update-apply proxy failed: %v", id, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "edge_update",
		TargetID:    &id,
		TargetLabel: nd.Name,
		Message:     "triggered edge self-update on node",
	})
	writeJSON(w, out)
}

// NodeReinstallHandler proxies POST /api/edge/reinstall.
func NodeReinstallHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	out, err := edge.NewWithTimeout(*nd, token, 6*time.Minute).EdgeReinstall()
	if err != nil {
		log.Printf("node %d reinstall proxy failed: %v", id, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "edge_reinstall",
		TargetID:    &id,
		TargetLabel: nd.Name,
		Message:     "triggered edge reinstall on node",
	})
	writeJSON(w, out)
}

// NodeReinstallBackgroundHandler proxies POST /api/edge/reinstall-background.
func NodeReinstallBackgroundHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	out, err := edge.New(*nd, token).EdgeReinstallBackground()
	if err != nil {
		log.Printf("node %d reinstall-background proxy failed: %v", id, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryNode,
		Action:      "edge_reinstall_background",
		TargetID:    &id,
		TargetLabel: nd.Name,
		Message:     "triggered edge background reinstall on node",
	})
	writeJSON(w, out)
}
