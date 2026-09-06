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
	"time"

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

	// Ownership scope: Own → only self, All/umbrella → all users.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey)
		if !hasAll && hasOwn {
			u, err := repository.NewUserRepository(con).GetByID(uid)
			if err != nil {
				http.Error(w, "server error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, []models.User{*u})
			return
		}
	}

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

	// Ownership scope for user creation: Own → cannot create other users.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey)
		if !hasAll && hasOwn {
			http.Error(w, "forbidden: own-scope cannot create other users", http.StatusForbidden)
			return
		}
	}

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

	// Ownership scope: Own → may only edit self.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey)
		if !hasAll && hasOwn && id != uid {
			http.Error(w, "forbidden: own-scope may only edit own user", http.StatusForbidden)
			return
		}
	}

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

	// Ownership scope for user deletion/suspension: Own → may only affect self (but self-delete is already blocked by DeleteUser logic).
	if hasOwn, hasAll, _ := permissions.NewChecker(con).HasScope(callerID, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey); !hasAll && hasOwn && id != callerID {
		http.Error(w, "forbidden: own-scope may only delete own user", http.StatusForbidden)
		return
	}

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

// SuspendUserHandler suspends a user with optional auto-unsuspend time.
func SuspendUserHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req struct {
		Reason        string `json:"reason"`
		DurationHours *int   `json:"duration_hours,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		http.Error(w, "reason is required", http.StatusBadRequest)
		return
	}
	callerID, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if callerID == id {
		http.Error(w, "cannot suspend your own account", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Ownership scope for suspend: Own → may only suspend self (but self-suspend already blocked, so effectively Own cannot suspend anyone).
	if hasOwn, hasAll, _ := permissions.NewChecker(con).HasScope(callerID, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey); !hasAll && hasOwn {
		http.Error(w, "forbidden: own-scope cannot suspend other users", http.StatusForbidden)
		return
	}
	caller, err := repository.NewUserRepository(con).GetByID(callerID)
	callerName := "unknown"
	if err == nil && caller != nil {
		callerName = caller.Username
	}
	userRepo := repository.NewUserRepository(con)
	targetUser, err := userRepo.GetByID(id)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	var suspendedUntil *time.Time
	if req.DurationHours != nil && *req.DurationHours > 0 {
		t := time.Now().Add(time.Duration(*req.DurationHours) * time.Hour)
		suspendedUntil = &t
	}
	newCount, err := userRepo.SuspendUser(id, suspendedUntil, req.Reason, callerID, callerName)
	if err != nil {
		log.Println("SuspendUser error:", err)
		http.Error(w, "failed to suspend user", http.StatusInternalServerError)
		return
	}
	// Invalidate all tracked sessions so the suspended user is kicked out
	// immediately (their current bearer/cookie stops working at the next
	// AuthMiddleware check). Without this they could continue using an
	// already-issued session until it naturally expires.
	auth.InvalidateUserSessions(id)
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryUser,
		Action:      "suspend",
		TargetID:    &id,
		TargetLabel: targetUser.Username,
		Message:     fmt.Sprintf("suspended user %q (count: %d, reason: %s)", targetUser.Username, newCount, req.Reason),
	})
	writeJSON(w, map[string]any{"suspension_count": newCount})
}

// UnsuspendUserHandler unsuspends a user.
func UnsuspendUserHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if _, err := UserIDFromContext(r); err != nil {
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
	targetUser, err := userRepo.GetByID(id)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	count, err := userRepo.UnsuspendUser(id)
	if err != nil {
		log.Println("UnsuspendUser error:", err)
		http.Error(w, "failed to unsuspend user", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryUser,
		Action:      "unsuspend",
		TargetID:    &id,
		TargetLabel: targetUser.Username,
		Message:     fmt.Sprintf("unsuspended user %q (total suspensions: %d)", targetUser.Username, count),
	})
	writeJSON(w, map[string]any{"suspension_count": count})
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
	ownerID := int64(0)
	if uid, err := UserIDFromContext(r); err == nil && uid != 0 {
		if checker, cerr := func() (*permissions.Checker, error) { return permissions.NewChecker(con), nil }(); cerr == nil {
			_ = checker
			// Use permissions checker to decide OWN filtering.
			chk := permissions.NewChecker(con)
			hasOwn, hasAll, _ := chk.HasScope(uid, permissions.RolesOwnKey, permissions.RolesAllKey, permissions.ManageRolesKey)
			if hasOwn && !hasAll {
				ownerID = uid
			}
		}
	}
	roles, err := roleRepo.ListRoles(ownerID)
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
	ownerID := int64(0)
	if uid, err := UserIDFromContext(r); err == nil && uid != 0 {
		ownerID = uid
	}
	id, err := roleRepo.CreateRole(req.Name, req.DisplayName, req.Color, req.Description, req.Icon, req.Permissions, ownerID)
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
	// Ownership scope: Own → may only edit roles they authored.
	// Mirrors ListRolesHandler's owner filter + the Users/ApiKeys mutation
	// guards; without this an Own-scoped editor could mutate any role
	// (including admin) by id.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		if hasOwn, hasAll, _ := permissions.NewChecker(con).HasScope(uid, permissions.RolesOwnKey, permissions.RolesAllKey, permissions.ManageRolesKey); !hasAll && hasOwn && existing.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only edit own roles", http.StatusForbidden)
			return
		}
	}
	switch existing.Name {
	case "admin", "moderator", "user":
		if req.Name != existing.Name {
			http.Error(w, "cannot rename built-in role", http.StatusBadRequest)
			return
		}
		if existing.Name == "admin" {
			// Optional safety net: keep admin fully privileged.
			if !containsKey(req.Permissions, permissions.AccessAdminPanelKey) && len(req.Permissions) == 0 {
				req.Permissions = allPermissionKeys(con)
			}
		}
	}

	if err := roleRepo.UpdateRole(id, req.Name, req.DisplayName, req.Color, req.Description, req.Icon, req.Permissions); err != nil {
		log.Println("UpdateRole error:", err)
		http.Error(w, "could not update role", http.StatusInternalServerError)
		return
	}
	// Persist the admin-curated authority restriction list. nil / empty
	// clears the restriction (back to "unrestricted"), matching the
	// wire DTO's intent.
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
	var ownerID int64
	if existing, gerr := roleRepo.GetRoleByID(id); gerr == nil && existing != nil {
		label = existing.Name
		ownerID = existing.OwnerID
	}
	// Ownership scope: Own → may only delete roles they authored.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		if hasOwn, hasAll, _ := permissions.NewChecker(con).HasScope(uid, permissions.RolesOwnKey, permissions.RolesAllKey, permissions.ManageRolesKey); !hasAll && hasOwn && ownerID != uid {
			http.Error(w, "forbidden: own-scope may only delete own roles", http.StatusForbidden)
			return
		}
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
// restriction going stale. Returns nil when the input is empty (the
// caller treats nil as "unrestricted"); non-nil / non-empty out stays.
// Errors are swallowed: an inventory read failure keeps the role write
// going with the user-supplied list rather than blocking the whole edit
// — the picker UI catches stale ids, the persisted blob is the source
// of truth at login time.
func sanitizeAllowedAuthTypes(con *sql.DB, allowed []string) []string {
	if len(allowed) == 0 {
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
		return nil
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
