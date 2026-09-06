package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ListPortsHandler returns merged DB allocations + live inspect ports.
// It keeps the original "ports" page guard so only instances with that page
// enabled can read. The response is an object for the new editor but remains
// backward compatible with the legacy array consumers: legacy callers that
// expect a bare array will now receive an object with a `ports` key (the live
// array) — the frontend helper normalizes both shapes.
func ListPortsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "ports") {
		return
	}
	inst, ec, _, ok := loadInstNode(w, r)
	if !ok {
		return
	}
	// OWN scope: if caller is Own-restricted, they may only read own instances.
	// We check here so a user with INSTANCES_OWN can't peek at another user's ports.
	// Fail closed on checker errors so a DB blip never opens another owner's ports.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		if conTmp, cerr := repository.OpenDB(); cerr == nil {
			checker := permissions.NewChecker(conTmp)
			hasOwn, hasAll, serr := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
			_ = conTmp.Close()
			if serr != nil {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			if !hasAll && hasOwn && inst.OwnerID != uid {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}
	}
	// Live ports from edge (cached).
	ls := refreshLiveState(inst, ec)
	liveRaw := "[]"
	if ls != nil && ls.Ports != "" {
		liveRaw = ls.Ports
	}
	var livePorts any
	if err := json.Unmarshal([]byte(liveRaw), &livePorts); err != nil {
		livePorts = []any{}
	}
	// DB allocations.
	con, err := repository.OpenDB()
	if err != nil {
		// DB failure: serve live only.
		writeJSON(w, map[string]any{
			"ports":       livePorts,
			"live":        livePorts,
			"allocations": []any{},
		})
		return
	}
	defer con.Close()
	allocs, _ := repository.NewInstancePortRepository(con).List(inst.ID)
	if allocs == nil {
		allocs = []repository.InstancePort{}
	}
	// For legacy array clients, `ports` historically was live. Keep it as live
	// so existing LIB_PORTS_HTML continues to show listening sockets.
	// The editor consumes `allocations`.
	writeJSON(w, map[string]any{
		"ports":       livePorts,
		"live":        livePorts,
		"allocations": allocs,
	})
}

// UpdatePortsHandler replaces the whole allocation set for an instance.
// PUT /api/instances/{id}/ports  body {ports: [{host,container,protocol,ip}]}
// Validates 1-65535, protocol tcp/udp, ip optional net.ParseIP, rejects
// duplicates host+ip+protocol. Persists to DB, then calls edge UpdatePorts
// when the instance is live (status running). Audited via RecordActivity +
// instance_audit.
func UpdatePortsHandler(w http.ResponseWriter, r *http.Request) {
	if !guardInstancePage(w, r, "ports") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var req struct {
		Ports []struct {
			Host      *int   `json:"host"`
			Container *int   `json:"container"`
			Protocol  string `json:"protocol"`
			IP        string `json:"ip"`
		} `json:"ports"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Ports == nil {
		req.Ports = []struct {
			Host      *int   `json:"host"`
			Container *int   `json:"container"`
			Protocol  string `json:"protocol"`
			IP        string `json:"ip"`
		}{}
	}
	// Validate.
	inputs := make([]repository.InstancePortInput, 0, len(req.Ports))
	seen := make(map[string]bool, len(req.Ports))
	for i, p := range req.Ports {
		if p.Host == nil || p.Container == nil {
			http.Error(w, fmt.Sprintf("ports[%d]: host and container are required", i), http.StatusBadRequest)
			return
		}
		host := *p.Host
		ctr := *p.Container
		if host < 1 || host > 65535 {
			http.Error(w, fmt.Sprintf("ports[%d]: host must be 1-65535", i), http.StatusBadRequest)
			return
		}
		if ctr < 1 || ctr > 65535 {
			http.Error(w, fmt.Sprintf("ports[%d]: container must be 1-65535", i), http.StatusBadRequest)
			return
		}
		proto := strings.ToLower(strings.TrimSpace(p.Protocol))
		if proto == "" {
			proto = "tcp"
		}
		if proto != "tcp" && proto != "udp" {
			http.Error(w, fmt.Sprintf("ports[%d]: protocol must be tcp or udp", i), http.StatusBadRequest)
			return
		}
		ip := strings.TrimSpace(p.IP)
		if ip != "" {
			if net.ParseIP(ip) == nil {
				http.Error(w, fmt.Sprintf("ports[%d]: ip is not a valid IP", i), http.StatusBadRequest)
				return
			}
		}
		key := fmt.Sprintf("%s:%d/%s", ip, host, proto)
		if seen[key] {
			http.Error(w, fmt.Sprintf("ports[%d]: duplicate host+ip+protocol %q", i, key), http.StatusBadRequest)
			return
		}
		seen[key] = true
		inputs = append(inputs, repository.InstancePortInput{
			Host:      host,
			Container: ctr,
			Protocol:  proto,
			IP:        ip,
		})
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	instRepo := repository.NewInstanceRepository(con)
	inst, err := instRepo.Get(id)
	if err != nil || inst == nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	// Ownership scope check for edit: Own may only edit own. Fail closed on checker error.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, serr := checker.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if serr != nil {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !hasAll && hasOwn && inst.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only edit own instances", http.StatusForbidden)
			return
		}
	}

	// Cross-instance collision check: another instance on the same node must
	// not already own any wanted host binding, otherwise the edge's docker
	// recreate would die with exit 125 `port is already allocated`.
	if len(inputs) > 0 && inst.Kind == "docker" {
		want := make([]requestedPort, 0, len(inputs))
		for _, p := range inputs {
			want = append(want, requestedPort{host: p.Host, proto: p.Protocol, ip: p.IP})
		}
		if bad, owner, found := findPortCollision(con, inst.NodeID, id, want); found {
			writeJSONStatus(w, http.StatusConflict, map[string]any{
				"error":  fmt.Sprintf("host port %d is already allocated to instance %q on this node — pick a different host port", bad.host, owner),
				"detail": fmt.Sprintf("docker would fail with exit 125: Bind for 0.0.0.0:%d failed: port is already allocated", bad.host),
				"port":   bad.host,
				"owner":  owner,
			})
			return
		}
	}

	portRepo := repository.NewInstancePortRepository(con)
	saved, err := portRepo.Replace(id, inputs)
	if err != nil {
		http.Error(w, "failed to save ports: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Audit.
	auditInst(r, id, "ports.update", fmt.Sprintf("updated %d port allocation(s)", len(inputs)))
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance,
		Action:   "ports.update",
		TargetID: &id,
		Message:  fmt.Sprintf("updated ports for instance %q (%d allocations)", inst.Name, len(inputs)),
	})

	// Live reconcile: only if instance is live (running/installing).
	needsEdge := inst.Status == "running" || inst.Status == "installing"
	var edgeErr string
	if needsEdge {
		nodeRepo := repository.NewNodeRepository(con)
		node, nerr := nodeRepo.GetNode(inst.NodeID)
		if nerr == nil {
			token, terr := nodeRepo.PlainToken(inst.NodeID)
			if terr == nil && token != "" {
				ec := edge.NewWithTimeout(*node, token, 30*time.Second)
				// Convert to edge PortAllocation slice.
				allocs := make([]edge.PortAllocation, 0, len(inputs))
				for _, p := range inputs {
					allocs = append(allocs, edge.PortAllocation{
						Host:      p.Host,
						Container: p.Container,
						Protocol:  p.Protocol,
						IP:        p.IP,
					})
				}
				// Use workloadName helper (external_id fallback).
				name := inst.ExternalID
				if name == "" {
					name = inst.Name
				}
				if _, err := ec.UpdatePorts(edge.UpdatePortsRequest{
					Kind:  inst.Kind,
					Name:  name,
					Ports: allocs,
				}); err != nil {
					edgeErr = err.Error()
				}
			}
		}
	}

	resp := map[string]any{
		"ok":          true,
		"allocations": saved,
	}
	if edgeErr != "" {
		resp["edge_error"] = edgeErr
		resp["edge_warning"] = "ports saved to DB but edge reconcile failed; reconcile on next restart"
	}
	writeJSON(w, resp)
}
