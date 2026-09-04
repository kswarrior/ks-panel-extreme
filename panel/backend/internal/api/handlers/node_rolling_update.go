package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/probe"
	"github.com/example/kspanel/internal/repository"
)

// ============================== FLEET ROLLING UPDATE ==============================
// POST /api/nodes/update-all drives a fleet-wide orchestrated rollout:
//
//	{mode: "canary"|"sequential", canary_count, health_timeout_s, pause_on_failure}
//
// Semantics (all MANAGE_NODES edit-gated + audit-logged):
//   - Nodes run in ID order; canary mode runs the first canary_count nodes
//     first (they ARE the canary subset — lowest IDs), then the rest.
//   - Per node: check → apply → poll edge /health + heartbeat until the new
//     version answers or health_timeout_s elapses.
//   - On the first failure (with pause_on_failure, default true) the rollout
//     STOPS and remaining nodes are reported `skipped` — left untouched.
//   - Every node emits its own activity_logs row plus one summary row.
//
// The per-node trigger reuses the same edge RPCs as the single-node
// NodeUpdateApplyHandler; the .old rollback + /health-gate semantics live
// on the edge and are untouched.

// Rollout node statuses.
const (
	rollStatusUpdated  = "updated"
	rollStatusUpToDate = "up_to_date"
	rollStatusFailed   = "failed"
	rollStatusSkipped  = "skipped"
)

type rollingUpdateRequest struct {
	Mode           string `json:"mode"`
	CanaryCount    int    `json:"canary_count"`
	HealthTimeoutS int    `json:"health_timeout_s"`
	PauseOnFailure *bool  `json:"pause_on_failure"`
}

type nodeRollStatus struct {
	NodeID        int64  `json:"node_id"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	Detail        string `json:"detail,omitempty"`
	VersionBefore string `json:"version_before,omitempty"`
	VersionAfter  string `json:"version_after,omitempty"`
}

type rollingUpdateResponse struct {
	OK           bool             `json:"ok"`
	Mode         string           `json:"mode"`
	Results      []nodeRollStatus `json:"results"`
	StoppedEarly bool             `json:"stopped_early"`
	Summary      string           `json:"summary"`
}

// rollingNodePlan is one ordered unit of work: the node + its token.
type rollingNodePlan struct {
	Node  models.Node
	Token string
}

// rollingDeps injects every edge touchpoint so the orchestrator core is
// unit-testable with a fake health poller (no DB, no network).
type rollingDeps struct {
	// check asks the edge whether an update is available.
	check func(nd models.Node, token string) (available bool, before, remote string, err error)
	// apply triggers the edge download + swap + relaunch.
	apply func(nd models.Node, token string) error
	// pollHealthy blocks until the edge answers /health with a NEW version
	// (and a fresh heartbeat landed) or the timeout elapses.
	pollHealthy func(nd models.Node, token, before string, timeout time.Duration) error
}

// orderRollingNodes sorts nodes by ID ascending. Canary mode keeps the
// same order — the first canaryCount nodes are the canary subset that
// rolls before the rest. canaryCount <= 0 defaults to 1.
func orderRollingNodes(nodes []models.Node, mode string, canaryCount int) []models.Node {
	ordered := append([]models.Node(nil), nodes...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })
	if strings.ToLower(strings.TrimSpace(mode)) != "canary" {
		return ordered
	}
	if canaryCount <= 0 {
		canaryCount = 1
	}
	if canaryCount >= len(ordered) {
		return ordered
	}
	// Canary subset first, then the remainder — both in ID order.
	out := append([]models.Node(nil), ordered[:canaryCount]...)
	return append(out, ordered[canaryCount:]...)
}

// runRollingUpdate executes the ordered plans with the injected deps.
// Plans with an empty token fail fast (rotate the token first). A node
// whose check reports no available update is marked up_to_date without an
// apply (no pointless edge restart). On failure with pauseOnFailure the
// loop stops and every remaining plan is reported skipped (untouched).
func runRollingUpdate(plans []rollingNodePlan, healthTimeout time.Duration, pauseOnFailure bool, deps rollingDeps) ([]nodeRollStatus, bool) {
	results := make([]nodeRollStatus, 0, len(plans))
	stoppedEarly := false
	for i, p := range plans {
		st := nodeRollStatus{NodeID: p.Node.ID, Name: p.Node.Name}
		if strings.TrimSpace(p.Token) == "" {
			st.Status = rollStatusFailed
			st.Detail = "node has no usable edge token (rotate it first)"
			results = append(results, st)
			if pauseOnFailure {
				markRollingSkipped(plans[i+1:], &results, "not attempted (stopped on earlier failure)")
				stoppedEarly = true
				break
			}
			continue
		}
		available, before, remote, err := deps.check(p.Node, p.Token)
		if err != nil {
			st.Status = rollStatusFailed
			st.VersionBefore = before
			st.Detail = "update check failed: " + err.Error()
			results = append(results, st)
			if pauseOnFailure {
				markRollingSkipped(plans[i+1:], &results, "not attempted (stopped on earlier failure)")
				stoppedEarly = true
				break
			}
			continue
		}
		st.VersionBefore = before
		if !available {
			st.Status = rollStatusUpToDate
			st.Detail = "already on latest (" + before + ")"
			st.VersionAfter = before
			results = append(results, st)
			continue
		}
		if err := deps.apply(p.Node, p.Token); err != nil {
			st.Status = rollStatusFailed
			st.Detail = "update apply failed: " + err.Error()
			results = append(results, st)
			if pauseOnFailure {
				markRollingSkipped(plans[i+1:], &results, "not attempted (stopped on earlier failure)")
				stoppedEarly = true
				break
			}
			continue
		}
		if err := deps.pollHealthy(p.Node, p.Token, before, healthTimeout); err != nil {
			st.Status = rollStatusFailed
			st.Detail = "edge did not become healthy: " + err.Error()
			results = append(results, st)
			if pauseOnFailure {
				markRollingSkipped(plans[i+1:], &results, "not attempted (stopped on earlier failure)")
				stoppedEarly = true
				break
			}
			continue
		}
		st.Status = rollStatusUpdated
		st.VersionAfter = remote
		st.Detail = "updated " + before + " → " + remote
		results = append(results, st)
	}
	return results, stoppedEarly
}

func markRollingSkipped(plans []rollingNodePlan, results *[]nodeRollStatus, detail string) {
	for _, p := range plans {
		*results = append(*results, nodeRollStatus{
			NodeID: p.Node.ID, Name: p.Node.Name,
			Status: rollStatusSkipped, Detail: detail,
		})
	}
}

// rollingPollHealthy is the production pollHealthy: loop probe.Probe
// (/health, tunnel-aware) + EdgeUpdateInfo until the edge answers with a
// version different from `before` AND a heartbeat newer than applyStart
// landed, or the timeout elapses. The heartbeat gate gets a 45s grace:
// once the new version answers, the 30s KeepAlive cadence guarantees a
// heartbeat follows shortly; we don't burn the whole timeout waiting for
// it, but we prefer to observe it.
func rollingPollHealthy(nd models.Node, token, before string, timeout time.Duration, applyStart time.Time) error {
	ec := edge.New(nd, token)
	deadline := time.Now().Add(timeout)
	var versionSeenAt time.Time
	for time.Now().Before(deadline) {
		if pr := probe.Probe(nd); pr.Reachable {
			if info, err := ec.EdgeUpdateInfo(); err == nil {
				after := strings.TrimSpace(info.Local.Version)
				if after != "" && after != strings.TrimSpace(before) {
					if versionSeenAt.IsZero() {
						versionSeenAt = time.Now()
					}
					if heartbeatFreshSince(nd.ID, applyStart) {
						return nil
					}
					if time.Since(versionSeenAt) > 45*time.Second {
						return nil
					}
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("edge %q did not report a new version within %s", nd.Name, timeout)
}

// heartbeatFreshSince reports whether any heartbeat bucket for the node is
// newer than t. Best-effort: any DB error means "not observed" (the poll
// loop keeps waiting until the grace path succeeds).
func heartbeatFreshSince(nodeID int64, t time.Time) bool {
	con, err := repository.OpenDB()
	if err != nil {
		return false
	}
	defer con.Close()
	hbs, err := repository.NewNodeRepository(con).RecentHeartbeats(nodeID, 1)
	if err != nil || len(hbs) == 0 {
		return false
	}
	// Bucket rows carry bucket_at; accept zero times as stale.
	return !hbs[0].BucketAt.IsZero() && !hbs[0].BucketAt.Before(t)
}

// NodeRollingUpdateHandler drives the fleet rollout. Synchronous: each
// node costs one edge download + one health window, so callers (SPA,
// scheduler, curl) must allow minutes — the SPA lifts the client timeout
// for this call. MANAGE_NODES edit gate is enforced at the route; the
// handler additionally narrows own-scope callers to their own nodes.
func NodeRollingUpdateHandler(w http.ResponseWriter, r *http.Request) {
	var req rollingUpdateRequest
	if r.Body != nil {
		// Empty body = defaults; a body must be valid JSON.
		if body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10)); err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		} else if len(body) > 0 {
			if err := json.Unmarshal(body, &req); err != nil {
				http.Error(w, "invalid payload: "+err.Error(), http.StatusBadRequest)
				return
			}
		}
	}
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "sequential"
	}
	if mode != "sequential" && mode != "canary" {
		http.Error(w, "mode must be canary|sequential", http.StatusBadRequest)
		return
	}
	healthTimeout := time.Duration(req.HealthTimeoutS) * time.Second
	if req.HealthTimeoutS <= 0 {
		healthTimeout = 120 * time.Second
	}
	if healthTimeout < 10*time.Second || healthTimeout > 600*time.Second {
		http.Error(w, "health_timeout_s must be 10..600", http.StatusBadRequest)
		return
	}
	pauseOnFailure := true
	if req.PauseOnFailure != nil {
		pauseOnFailure = *req.PauseOnFailure
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	nodeRepo := repository.NewNodeRepository(con)

	// Own-scope narrowing mirrors nodeOwnForbidden: NODES_OWN without
	// NODES_ALL (or the MANAGE_NODES umbrella) may only roll their own.
	var nodes []models.Node
	ownOnly := false
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
		ownOnly = !hasAll && hasOwn
		if ownOnly {
			nodes, err = nodeRepo.ListNodesByOwner(uid)
		} else {
			nodes, err = nodeRepo.ListNodes()
		}
	} else {
		nodes, err = nodeRepo.ListNodes()
	}
	if err != nil {
		log.Println("rolling update ListNodes error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if len(nodes) == 0 {
		writeJSON(w, rollingUpdateResponse{
			OK: true, Mode: mode, Results: []nodeRollStatus{},
			Summary: "no nodes registered — nothing to roll",
		})
		return
	}

	ordered := orderRollingNodes(nodes, mode, req.CanaryCount)
	plans := make([]rollingNodePlan, 0, len(ordered))
	for _, nd := range ordered {
		tok, terr := nodeRepo.PlainToken(nd.ID)
		if terr != nil {
			tok = ""
		}
		plans = append(plans, rollingNodePlan{Node: nd, Token: tok})
	}

	deps := productionRollingDeps()
	results, stoppedEarly := runRollingUpdate(plans, healthTimeout, pauseOnFailure, deps)

	// Audit: one row per node + one summary row (permission-gated route,
	// so every run is attributable via the request actor).
	updated, upToDate, failed, skipped := 0, 0, 0, 0
	for _, st := range results {
		switch st.Status {
		case rollStatusUpdated:
			updated++
		case rollStatusUpToDate:
			upToDate++
		case rollStatusFailed:
			failed++
		case rollStatusSkipped:
			skipped++
		}
		id := st.NodeID
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategoryNode,
			Action:      "edge_rolling_update",
			TargetID:    &id,
			TargetLabel: st.Name,
			Message:     fmt.Sprintf("rolling update %s: %s", st.Status, st.Detail),
		})
	}
	summary := fmt.Sprintf("rolling update (%s): %d updated, %d up-to-date, %d failed, %d skipped%s",
		mode, updated, upToDate, failed, skipped,
		map[bool]string{true: " — stopped early on first failure", false: ""}[stoppedEarly])
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryNode,
		Action:   "edge_rolling_update_summary",
		Message:  summary,
	})

	writeJSON(w, rollingUpdateResponse{
		OK: true, Mode: mode, Results: results,
		StoppedEarly: stoppedEarly, Summary: summary,
	})
}
