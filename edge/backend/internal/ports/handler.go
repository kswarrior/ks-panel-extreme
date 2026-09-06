package ports

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/example/ksedge/internal/drivers"
)

// Request matches the panel's edge.UpdatePorts wire format.
type Request struct {
	Token string                `json:"token"`
	Kind  string                `json:"kind"`
	Name  string                `json:"name"`
	Ports []drivers.PortAllocation `json:"ports"`
}

// Response is what the edge hands back.
type Response struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// Handler returns an http.Handler authenticated by the given edge token.
// It dispatches to drivers.Registry[Kind].UpdatePorts.
func Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req Request
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if !constTimeEqual(req.Token, token) || token == "" {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if _, ok := drivers.Registry[req.Kind]; !ok {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("unknown driver kind: %s", req.Kind))
			return
		}
		if req.Name == "" {
			writeErr(w, http.StatusBadRequest, "instance name is required")
			return
		}
		// Validate ports locally as a safety net (panel already validates).
		for i, p := range req.Ports {
			if p.Host < 1 || p.Host > 65535 {
				writeErr(w, http.StatusBadRequest, fmt.Sprintf("ports[%d]: host must be 1-65535", i))
				return
			}
			if p.Container < 1 || p.Container > 65535 {
				writeErr(w, http.StatusBadRequest, fmt.Sprintf("ports[%d]: container must be 1-65535", i))
				return
			}
			if p.Protocol != "tcp" && p.Protocol != "udp" {
				writeErr(w, http.StatusBadRequest, fmt.Sprintf("ports[%d]: protocol must be tcp or udp", i))
				return
			}
			if ip := strings.TrimSpace(p.IP); ip != "" {
				if net.ParseIP(ip) == nil {
					writeErr(w, http.StatusBadRequest, fmt.Sprintf("ports[%d]: invalid ip %q", i, p.IP))
					return
				}
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		drv := drivers.Registry[req.Kind]
		if err := drv.UpdatePorts(ctx, req.Name, req.Ports); err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Response{OK: false, Error: err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{OK: true})
	})
}

func constTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}
