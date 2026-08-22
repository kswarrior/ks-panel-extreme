package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// userAuthResponse is the shape returned by GET /api/me/auth — the full
// per-user "make my account safe" snap the Account page reads so it can
// paint in a single round-trip:
//   - available: every authority id the user is ALLOWED to turn on
//     (admin-enabled ∩ role-allowed) with its human label + kind so
//     the picker derives its option list from the server;
//   - role_allowed:  the raw role-allowed list (nil/"unrestricted" is
//     surfaced as unrestricted=true so the UI can render a hint);
//   - cfg:            the user's currently-persisted config (their
//     enabled subset + the required-mode / required-N count).
type userAuthResponse struct {
	Available    []authProviderInfo           `json:"available"`
	Cfg          *models.UserAuthorityConfig   `json:"cfg"`
	RoleAllowed  []string                     `json:"role_allowed"`
	Unrestricted bool                         `json:"unrestricted"`
}

// MeAuthHandler backs the "Sign-in authorities" card on the Account page.
//
// Routes:
//
//	GET /api/me/auth   -> available authorities + current config (one fetch)
//	PUT /api/me/auth   -> persist the user's enabled subset + required-mode
//
// The endpoint sits under plain AuthMiddleware (no role gate): every
// authenticated user is allowed to harden their OWN account. Field-
// level sanitization ensures the persisted EnabledAuthorities stay
// inside the live "available" list (admin-enabled ∩ role-allowed) so
// an authority the admin/role later revoked falls out automatically
// on the next save — a user can never grant themselves a provider
// outside what their role permits.
func MeAuthHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
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

	userRepo := repository.NewUserRepository(con)
	user, err := userRepo.GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	authRepo := repository.NewUserAuthorityRepository(con)

	switch r.Method {
	case http.MethodGet:
		available, roleAllowed, restricted, aerr := authRepo.AvailableAuthorities(uid, user.RoleID)
		if aerr != nil {
			log.Println("AvailableAuthorities error:", aerr)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		cfg, cerr := authRepo.Get(uid)
		if cerr != nil {
			log.Println("UserAuthority Get error:", cerr)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if cfg == nil {
			cfg = models.DefaultUserAuthorityConfig()
		}
		if cfg.EnabledAuthorities == nil {
			cfg.EnabledAuthorities = []string{}
		}
		// Defensive: trim the persisted enabled list against the live
		// "available" set so a revoked authority doesn't linger at login
		// time. mutate on the returned pointer only so the in-flight
		// GET response already reflects it.
		cfg.EnabledAuthorities = intersectAuthorities(cfg.EnabledAuthorities, available)
		writeJSON(w, userAuthResponse{
			Available:    decorateAuthProviders(available),
			Cfg:          cfg,
			RoleAllowed:  roleAllowed,
			Unrestricted: !restricted,
		})

	case http.MethodPut:
		var req models.UserAuthorityConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		available, _, restricted, aerr := authRepo.AvailableAuthorities(uid, user.RoleID)
		if aerr != nil {
			log.Println("AvailableAuthorities error:", aerr)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		// Intersect whatever the SPA sent with the live "available" set.
		// This is the security boundary: a user can only enable authorities
		// their role + admin inventory both permit, regardless of what
		// the SPA shipped.
		sanitized := intersectAuthorities(req.EnabledAuthorities, available)
		if len(sanitized) == 0 {
			http.Error(w, "at least one sign-in authority is required", http.StatusBadRequest)
			return
		}
		// Clamp RequiredN to the live available count for mode "n".
		if req.RequiredMode == models.UserAuthorityN {
			if req.RequiredN < 1 || req.RequiredN > len(sanitized) {
				http.Error(w,
					fmt.Sprintf("required_n must be between 1 and %d (the number of enabled authorities)", len(sanitized)),
					http.StatusBadRequest,
				)
				return
			}
		}
		// Coerce unknown modes back to the safe "any" default.
		switch req.RequiredMode {
		case models.UserAuthorityAny, models.UserAuthorityN, models.UserAuthorityAll:
		default:
			req.RequiredMode = models.UserAuthorityAny
		}
		// password is always implicitly enabled — the user can't disable
		// it (would lock themselves out before any other authority is
		// configured). The intersection above keeps it when available.
		cfg := &models.UserAuthorityConfig{
			EnabledAuthorities: sanitizeEnabledAuthorities(sanitized),
			RequiredMode:        req.RequiredMode,
			RequiredN:           req.RequiredN,
		}
		if err := authRepo.Update(uid, cfg); err != nil {
			http.Error(w, "could not update sign-in authorities", http.StatusBadRequest)
			return
		}
		RecordActivity(r, repository.ActivityInput{
			UserID:      &uid,
			Username:    user.Username,
			Category:    models.ActivityCategoryAuth,
			Action:      "update_signin_authorities",
			TargetLabel: user.Username,
			Message: fmt.Sprintf("updated sign-in authorities (%d enabled, mode=%s)",
				len(cfg.EnabledAuthorities), cfg.RequiredMode),
		})
		writeJSON(w, userAuthResponse{
			Available:    decorateAuthProviders(available),
			Cfg:          cfg,
			Unrestricted: !restricted,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// intersectAuthorities returns the ids that appear in BOTH the user-
// supplied list AND the live available list, in the available list's
// canonical order. Used on GET + PUT so neither a stale persisted blob
// nor a hostile PUT can reference an authority the role/admin revoked.
// Unknown / empty ids are dropped silently.
func intersectAuthorities(enabled, available []string) []string {
	avail := make(map[string]struct{}, len(available))
	for _, id := range available {
		avail[id] = struct{}{}
	}
	seen := make(map[string]struct{}, len(available))
	out := make([]string, 0, len(available))
	for _, id := range enabled {
		id = strings.ToLower(strings.TrimSpace(id))
		if id == "" {
			continue
		}
		if _, hasAvail := avail[id]; !hasAvail {
			continue
		}
		if _, dupe := seen[id]; dupe {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// sanitizeEnabledAuthorities lowercases + dedupes + trims so two writes
// of the same authority don't double-count at the login gate.
func sanitizeEnabledAuthorities(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.ToLower(strings.TrimSpace(id))
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// decorateAuthProviders maps the bare []string of available authorities
// into the same authProviderInfo shape ListAuthProvidersHandler emits,
// so the Account page's authorities picker derives its labels + kind
// from the same server-side table the Roles form uses.
func decorateAuthProviders(ids []string) []authProviderInfo {
	out := make([]authProviderInfo, 0, len(ids))
	for _, id := range ids {
		out = append(out, authProviderInfo{
			ID:    id,
			Label: authProviderLabel(id),
			Kind:  authProviderKind(id),
		})
	}
	return out
}
