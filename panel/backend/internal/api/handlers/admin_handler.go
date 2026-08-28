package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/oauth"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ============================== USERS ==============================

type createUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	RoleID   int64  `json:"role_id"`
}

type updateUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	RoleID   int64  `json:"role_id"`
}

func ListUsersHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewUserRepository(con)
	users, err := repo.ListUsers()
	if err != nil {
		log.Println("ListUsers error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, users)
}

func CreateUserHandler(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Email == "" || req.Password == "" || req.RoleID == 0 {
		http.Error(w, "username, email, password and role_id are required", http.StatusBadRequest)
		return
	}

	// Validate password with complexity policy (driven by Authority config)
	policy := resolvePasswordPolicy()
	if err := auth.ValidatePassword(req.Password, policy, req.Username, req.Email); err != nil {
		http.Error(w, "password validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	u := models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		RoleID:       req.RoleID,
	}
	repo := repository.NewUserRepository(con)
	if err := repo.AdminCreateUser(u); err != nil {
		// UNIQUE constraint violations surface here; report a friendly 409.
		log.Println("AdminCreateUser error:", err)
		http.Error(w, "could not create user (username/email may already exist)", http.StatusConflict)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryUser,
		Action:      "create",
		TargetLabel: req.Username,
		Message:     fmt.Sprintf("created user %q (<%s>, role=%d)", req.Username, req.Email, req.RoleID),
	})
	w.WriteHeader(http.StatusCreated)
}

func UpdateUserHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Email == "" || req.RoleID == 0 {
		http.Error(w, "username, email and role_id are required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// If password is being updated, validate it with the policy and
	// against the target user's password history (Authentication tab).
	var hash string
	var previousHash string
	if req.Password != "" {
		policy := resolvePasswordPolicy()
		if err := auth.ValidatePassword(req.Password, policy, req.Username, req.Email); err != nil {
			http.Error(w, "password validation failed: "+err.Error(), http.StatusBadRequest)
			return
		}
		historyConfig := resolvePasswordHistoryConfig()
		if historyConfig.Enabled && historyConfig.MaxHistory > 0 {
			if prev, err := repository.NewUserRepository(con).GetByID(id); err == nil && prev != nil {
				previousHash = prev.PasswordHash
				if hashes, herr := repository.NewPasswordHistoryRepository(con).
					ListHashes(id, historyConfig.MaxHistory); herr == nil {
					history := []auth.PasswordHistory{}
					for _, h := range hashes {
						history = append(history, auth.PasswordHistory{UserID: id, PasswordHash: h})
					}
					if verr := auth.ValidatePasswordWithHistory(req.Password, policy, history, historyConfig, req.Username, req.Email); verr != nil {
						http.Error(w, "password validation failed: "+verr.Error(), http.StatusBadRequest)
						return
					}
				}
			}
		}
		hash, err = auth.HashPassword(req.Password)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
	}
	repo := repository.NewUserRepository(con)
	if err := repo.UpdateUser(id, req.Username, req.Email, req.RoleID, hash); err != nil {
		log.Println("UpdateUser error:", err)
		http.Error(w, "could not update user (username/email may already exist)", http.StatusConflict)
		return
	}
	// Record the replaced hash so reuse checks cover admin resets too.
	if previousHash != "" && hash != "" {
		if err := repository.NewPasswordHistoryRepository(con).
			Add(id, previousHash, resolvePasswordHistoryConfig().MaxHistory); err != nil {
			log.Println("password_history add:", err)
		}
		// A password reset is the "kick the attacker out" action: revoke the
		// target's tracked sessions so existing bearer/cookie tokens stop
		// working immediately (mirrors the self-service change-password path).
		auth.InvalidateUserSessions(id)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryUser,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Username,
		Message:     fmt.Sprintf("updated user %q (role=%d)", req.Username, req.RoleID),
	})
	w.WriteHeader(http.StatusNoContent)
}

func DeleteUserHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	callerID, err := UserIDFromContext(r)
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

	repo := repository.NewUserRepository(con)
	// Resolve the target identity up-front so the audit row carries a useful
	// label even after the user row itself is gone.
	var label string
	if existing, gerr := repo.GetByID(id); gerr == nil && existing != nil {
		label = existing.Username
	}
	if err := repo.DeleteUser(id, callerID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryUser,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted user %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ============================== ROLES ==============================

// roleDTO is the JSON shape used by the API for create/update – it carries the
// permission-key list directly so the frontend doesn't have to know about ids.
// AllowedAuthTypes is the optional list of admin-enabled authority provider
// ids users of this role are allowed to turn on for their own login. nil /
// omitted means "unrestricted" (every admin-enabled provider is offered) —
// the seeded admin / moderator / user roles ship unrestricted so existing
// installs keep working out of the box.
type roleDTO struct {
	Name             string   `json:"name"`
	DisplayName      string   `json:"display_name"`
	Color            string   `json:"color"`
	Description      string   `json:"description"`
	Icon             string   `json:"icon"`
	Permissions      []string `json:"permissions"`
	AllowedAuthTypes []string `json:"allowed_auth_types"`
}

func ListRolesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	roleRepo := repository.NewRoleRepository(con)
	roles, err := roleRepo.ListRoles()
	if err != nil {
		log.Println("ListRoles error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, roles)
}

func CreateRoleHandler(w http.ResponseWriter, r *http.Request) {
	var req roleDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "role name is required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	roleRepo := repository.NewRoleRepository(con)
	id, err := roleRepo.CreateRole(req.Name, req.DisplayName, req.Color, req.Description, req.Icon, req.Permissions)
	if err != nil {
		log.Println("CreateRole error:", err)
		http.Error(w, "could not create role (name may already exist)", http.StatusConflict)
		return
	}
	// persisted AllowedAuthTypes so the restriction takes effect for the
	// Role's future users right away.
	if err := roleRepo.SetRoleAllowedAuthTypes(id, sanitizeAllowedAuthTypes(con, req.AllowedAuthTypes)); err != nil {
		log.Println("SetRoleAllowedAuthTypes error:", err)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryRole,
		Action:      "create",
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("created role %q (%d permissions)", req.Name, len(req.Permissions)),
	})
	w.WriteHeader(http.StatusCreated)
}

func UpdateRoleHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req roleDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "role name is required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	roleRepo := repository.NewRoleRepository(con)
	// Protect the built-in role names from being renamed, since the CLI
	// resolves them by name (admin/moderator/user).
	existing, err := roleRepo.GetRoleByID(id)
	if err != nil {
		http.Error(w, "role not found", http.StatusNotFound)
		return
	}
	switch existing.Name {
	case "admin", "moderator", "user":
		if req.Name != existing.Name {
			http.Error(w, "cannot rename built-in role", http.StatusBadRequest)
			return
		}
		if existing.Name == "admin" {
			// Safety net: admin must retain ACCESS_ADMIN_PANEL — without it
			// the last admin can lock everyone out of the panel shell.
			// If the payload is empty, restore the full permission set;
			// otherwise ensure the essential key is present.
			if len(req.Permissions) == 0 {
				req.Permissions = allPermissionKeys(con)
			} else if !containsKey(req.Permissions, permissions.AccessAdminPanelKey) {
				req.Permissions = append(req.Permissions, permissions.AccessAdminPanelKey)
			}
		}
	}

	if err := roleRepo.UpdateRole(id, req.Name, req.DisplayName, req.Color, req.Description, req.Icon, req.Permissions); err != nil {
		log.Println("UpdateRole error:", err)
		http.Error(w, "could not update role", http.StatusInternalServerError)
		return
	}
	// Persist the admin-curated authority restriction list. nil
	// (JSON null / omitted) === unrestricted (no row); an explicit
	// empty slice (JSON []) === disallow-all (persisted as "[]");
	// non-empty is the curated subset. sanitizeAllowedAuthTypes
	// preserves the nil-vs-[] distinction.
	if err := roleRepo.SetRoleAllowedAuthTypes(id, sanitizeAllowedAuthTypes(con, req.AllowedAuthTypes)); err != nil {
		log.Println("SetRoleAllowedAuthTypes error:", err)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryRole,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated role %q (%d permissions)", req.Name, len(req.Permissions)),
	})
	w.WriteHeader(http.StatusNoContent)
}

func DeleteRoleHandler(w http.ResponseWriter, r *http.Request) {
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

	roleRepo := repository.NewRoleRepository(con)
	// Capture the role name up-front so the audit row carries a useful
	// label after DeleteRole refuses built-in roles / completes the row.
	var label string
	if existing, gerr := roleRepo.GetRoleByID(id); gerr == nil && existing != nil {
		label = existing.Name
	}
	if err := roleRepo.DeleteRole(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryRole,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted role %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ============================== PERMISSIONS ==============================

func ListPermissionsHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	permRepo := repository.NewPermissionRepository(con)
	perms, err := permRepo.ListPermissions()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, perms)
}

// ============================== helpers ==============================

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func containsKey(keys []string, k string) bool {
	for _, x := range keys {
		if x == k {
			return true
		}
	}
	return false
}

// allPermissionKeys returns every permission key currently in the DB. Used as
// a safety net to keep the admin role fully privileged.
func allPermissionKeys(con *sql.DB) []string {
	permRepo := repository.NewPermissionRepository(con)
	perms, err := permRepo.ListPermissions()
	if err != nil {
		return nil
	}
	keys := make([]string, 0, len(perms))
	for _, p := range perms {
		keys = append(keys, p.Key)
	}
	return keys
}

// sanitizeAllowedAuthTypes intersects the wire-supplied authority id list
// with the admin-enabled provider inventory (AuthorityConfig) so a role
// can never reference an authority the admin later revoked without the
// restriction going stale. Returns nil when the input is nil (the
// caller treats nil as "unrestricted"); a non-nil empty slice is
// preserved as []string{} (explicit "disallow all" — persisted as "[]"
// rather than deleted) so the nil vs [] distinction round-trips.
// Errors are swallowed: an inventory read failure keeps the role write
// going with the user-supplied list rather than blocking the whole edit
// — the picker UI catches stale ids, the persisted blob is the source
// of truth at login time.
func sanitizeAllowedAuthTypes(con *sql.DB, allowed []string) []string {
	if allowed == nil {
		return nil
	}
	var adminEnabled map[string]struct{}
	authRepo := repository.NewAuthorityRepository(con)
	if cfg, err := authRepo.GetRaw(); err == nil && cfg != nil {
		adminEnabled = make(map[string]struct{}, len(cfg.Providers))
		for _, p := range cfg.Providers {
			if p.Enabled {
				adminEnabled[p.ID] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(allowed))
	for _, id := range allowed {
		id = strings.ToLower(strings.TrimSpace(id))
		if id == "" {
			continue
		}
		if adminEnabled != nil {
			if _, ok := adminEnabled[id]; !ok {
				continue
			}
		}
		out = append(out, id)
	}
	if len(out) == 0 {
		return []string{}
	}
	return out
}

// authProviderInfo is one entry returned by ListAuthProvidersHandler —
// the Roles form's "allowed authorities" picker derives its option list
// from this. We expose only the admin-enabled provider id + label +
// channel kind so the picker can group OAuth providers separately from
// channel providers (Email/Phone/TOTP/Password) — mirroring the way
// the Authority admin page renders the same inventory.
type authProviderInfo struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"` // "oauth" | "channel"
}

// ListAuthProvidersHandler returns the admin-enabled authority provider
// inventory so the RoleForm's "allowed authorities" picker derives its
// option list from one source of truth (the same AuthorityConfig the
// Authority page edits). The endpoint is gated by the Roles
// umbrella-or-view permission at the route layer — anyone authorised
// to edit roles is authorised to see which authorities exist.
func ListAuthProvidersHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	cfg, err := repository.NewAuthorityRepository(con).GetRaw()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]authProviderInfo, 0, len(cfg.Providers))
	for _, p := range cfg.Providers {
		if !p.Enabled {
			continue
		}
		out = append(out, authProviderInfo{
			ID:    p.ID,
			Label: authProviderLabel(p.ID),
			Kind:  authProviderKind(p.ID),
		})
	}
	// Defensive: the seed always has password enabled, but a corrupt
	// blob could miss it — fall back to bare password so the picker
	// never renders empty.
	if len(out) == 0 {
		out = []authProviderInfo{
			{ID: models.AuthorityProviderPassword, Label: "Password", Kind: "channel"},
		}
	}
	writeJSON(w, out)
}

// authProviderLabel / authProviderKind mirror the canonical human
// label + provider kind the Authority page renders the same ids with.
// Kept server-side so the Roles form gets the same labels without
// duplicating the table in the SPA bundle. OAuth labels come from the
// oauth package (single source); unknown ids fall back to their raw id +
// "channel" so removing / renaming a provider later never breaks the
// picker.
func authProviderLabel(id string) string {
	if l := oauth.Label(id); l != "" {
		return l
	}
	switch id {
	case models.AuthorityProviderEmail:
		return "Email"
	case models.AuthorityProviderPhone:
		return "Phone (SMS)"
	case models.AuthorityProviderTOTP:
		return "TOTP / Authenticator app"
	case models.AuthorityProviderPassword:
		return "Password"
	default:
		return id
	}
}

func authProviderKind(id string) string {
	switch id {
	case models.AuthorityProviderGoogle,
		models.AuthorityProviderMicrosoft,
		models.AuthorityProviderApple,
		models.AuthorityProviderDiscord,
		models.AuthorityProviderGithub:
		return "oauth"
	case models.AuthorityProviderEmail,
		models.AuthorityProviderPhone,
		models.AuthorityProviderTOTP,
		models.AuthorityProviderPassword:
		return "channel"
	default:
		return "channel"
	}
}

// errVar keeps the linter quiet about unused errors in early returns.
var _ = errors.New
