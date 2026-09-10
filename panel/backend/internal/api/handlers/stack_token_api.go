package handlers

import (
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/sysinfo"
)

// stack_token_api.go — panel API for paired stack apps.
//
// The pairing token (kss_…, minted at stack create/rotate) authenticates
// the REMOTE app back into the panel WITHOUT any manual API key — the
// mirror image of the edge token for nodes. Auth rides
// `Authorization: Bearer <token>` (X-Stack-Token accepted as a fallback
// for minimal HTTP clients). Fail closed:
//
//   - Only the kss_ namespace resolves here: edge (kse_…) and API-key
//     (ksk_…) tokens never authenticate as a stack.
//   - Every endpoint declares its required stack capability; the panel
//     checks the stack's GRANTED set (the admin approval checklist), not
//     the requested set. Ungranted → 403. Unknown token → 401 without
//     leaking which stacks exist.
//   - v1 is reads only (identity, instance inventory, host telemetry).
//     Mutations stay on the session-cookie admin API on purpose: a
//     long-lived app token must not drive lifecycle writes until a
//     dedicated write-grant model lands.
//
// CSRF: Bearer-authenticated calls are already exempt in the CSRF layer
// (hasBearerAuth), so no csrf.go change is needed for the primary scheme.

func extractStackToken(r *http.Request) string {
	if h := strings.TrimSpace(r.Header.Get("Authorization")); h != "" {
		const prefix = "Bearer "
		if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
			if tok := strings.TrimSpace(h[len(prefix):]); tok != "" {
				return tok
			}
		}
	}
	return strings.TrimSpace(r.Header.Get("X-Stack-Token"))
}

// resolveStackToken authenticates the pairing token and returns the stack
// plus its granted-capability set. Writes nothing, logs nothing secret.
func resolveStackToken(r *http.Request) (*models.Stack, map[string]bool, error) {
	token := extractStackToken(r)
	if token == "" || !strings.HasPrefix(token, models.StackTokenPrefix) {
		return nil, nil, repository.ErrStackNotFound
	}
	con, err := repository.OpenDB()
	if err != nil {
		return nil, nil, err
	}
	defer con.Close()
	repo := repository.NewStackRepository(con)
	s, err := repo.GetStackByToken(token)
	if err != nil {
		return nil, nil, err
	}
	perms, err := repo.ListStackPermissions(s.ID)
	if err != nil {
		return nil, nil, err
	}
	granted := make(map[string]bool, len(perms))
	for _, p := range perms {
		if p.Granted {
			granted[p.Capability] = true
		}
	}
	return s, granted, nil
}

// requireStackCap resolves the token and enforces one capability. On
// success it returns the stack; on failure it has already written the
// 401/403 and returns nil.
func requireStackCap(w http.ResponseWriter, r *http.Request, cap string) *models.Stack {
	s, granted, err := resolveStackToken(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil
	}
	if cap != "" && !granted[cap] {
		http.Error(w, "forbidden: capability "+cap+" not granted for this stack", http.StatusForbidden)
		return nil
	}
	return s
}

// StackTokenMeHandler proves pairing works: identity + grant checklist.
// No capability required — the token itself is the credential.
func StackTokenMeHandler(w http.ResponseWriter, r *http.Request) {
	s, granted, err := resolveStackToken(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewStackRepository(con)
	perms, _ := repo.ListStackPermissions(s.ID)
	type grantView struct {
		Capability string `json:"capability"`
		Granted    bool   `json:"granted"`
	}
	out := make([]grantView, 0, len(perms))
	for _, p := range perms {
		out = append(out, grantView{Capability: p.Capability, Granted: granted[p.Capability]})
	}
	writeJSON(w, map[string]any{
		"stack_id": s.ID,
		"slug":     s.Slug,
		"name":     s.Name,
		"active":   s.Active,
		"grants":   out,
	})
}

// StackTokenInstancesHandler serves the instance inventory to a paired app
// with the instances.read grant (same row shape as the admin list — the
// grant IS the authorization, no new data surface).
func StackTokenInstancesHandler(w http.ResponseWriter, r *http.Request) {
	if requireStackCap(w, r, models.StackCapInstancesRead) == nil {
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	insts, err := repository.NewInstanceRepository(con).List()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, insts)
}

// StackTokenMetricsHandler serves panel-host telemetry to a paired app
// with the metrics.read grant (host + rolling series only — no user,
// key or audit data rides this endpoint).
func StackTokenMetricsHandler(w http.ResponseWriter, r *http.Request) {
	if requireStackCap(w, r, models.StackCapMetricsRead) == nil {
		return
	}
	writeJSON(w, map[string]any{
		"local":  sysinfo.Local(),
		"series": sysinfo.LocalSeries(),
	})
}
