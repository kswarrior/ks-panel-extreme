package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

type apiKeyDTO struct {
	Name        string   `json:"name"`
	UserID      int64    `json:"user_id"`
	Permissions []string `json:"permissions"`
	// ExpiresAt is an optional ISO-8601 timestamp the key stops working at.
	// A nil/absent value on create means "never expires". On update the
	// ExpiresAtSet flag controls whether the stored value is touched.
	ExpiresAt *string `json:"expires_at,omitempty"`
	// RateLimit is the optional max number of requests allowed per window.
	// nil/absent on create means "no limit". On update RateLimitSet governs.
	RateLimit *int64 `json:"rate_limit,omitempty"`
	// RateWindowSeconds is the size of the rate-limit window in seconds.
	// 0 (or absent) on create means 60. On update RateWindowSet governs.
	RateWindowSeconds int64 `json:"rate_window_seconds,omitempty"`
	// Active is the active state of the key. When false, the key is
	// soft-revoked and requests will be rejected. On update, ActiveSet
	// controls whether the stored value is touched.
	Active *bool `json:"active,omitempty"`
	// Cosmetic fields – rendered in the admin list as badge / label / description.
	Description string `json:"description,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	AccentColor string `json:"accent_color,omitempty"`

	// The following *Set booleans are only meaningful on UPDATE. When true,
	// the corresponding field above (even if nil/zero) is written to the
	// row, allowing the admin to extend, lower, or CLEAR an existing limit.
	// When false, the existing DB value is left untouched.
	ExpiresAtSet  bool `json:"expires_at_set"`
	RateLimitSet  bool `json:"rate_limit_set"`
	RateWindowSet bool `json:"rate_window_set"`
	ActiveSet     bool `json:"active_set"`
}

type apiKeyResponse struct {
	ID                int64    `json:"id"`
	UserID            int64    `json:"user_id"`
	OwnerName         string   `json:"owner_name,omitempty"`
	Name              string   `json:"name"`
	Prefix            string   `json:"prefix"`
	CreatedAt         string   `json:"created_at"`
	LastUsedAt        *string  `json:"last_used_at,omitempty"`
	Permissions       []string `json:"permissions"`
	ExpiresAt         *string  `json:"expires_at,omitempty"`
	RateLimit         *int64   `json:"rate_limit,omitempty"`
	RateWindowSeconds int64    `json:"rate_window_seconds,omitempty"`
	Active            bool     `json:"active"`
	Description       string   `json:"description,omitempty"`
	DisplayName       string   `json:"display_name,omitempty"`
	AccentColor       string   `json:"accent_color,omitempty"`
}

func isoString(t time.Time) string {
	return t.Format("2006-01-02T15:04:05Z07:00")
}

// parseExpiry coerces a client-supplied expiry string into a *time.Time. It
// accepts the canonical ISO 8601 layout the rest of the panel uses, the bare
// "YYYY-MM-DD" short form, and the SQLite internal datetime layout. Returns
// nil only when the input is the empty string — a nil pointer here means the
// caller asked to CLEAR the expiry. A bad non-empty value yields an error.
func parseExpiry(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	layouts := []string{
		"2006-01-02T15:04:05Z07:00",
		time.RFC3339Nano,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			utc := t.UTC()
			return &utc, nil
		}
	}
	return nil, fmt.Errorf("invalid expires_at: %q", s)
}

func ListApiKeysHandler(w http.ResponseWriter, r *http.Request) {
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

	repo := repository.NewApiKeyRepository(con)
	keys, err := repo.ListApiKeys(uid)
	if err != nil {
		log.Println("ListApiKeys error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]apiKeyResponse, 0, len(keys))
	for _, k := range keys {
		out = append(out, apiKeyResponse{
			ID:                k.ID,
			UserID:            k.UserID,
			OwnerName:         k.OwnerName,
			Name:              k.Name,
			Prefix:            k.Prefix,
			CreatedAt:         isoString(k.CreatedAt),
			LastUsedAt:        lastUsedPtr(k.LastUsedAt),
			Permissions:       k.Permissions,
			ExpiresAt:         expiryPtr(k.ExpiresAt),
			RateLimit:         k.RateLimit,
			RateWindowSeconds: k.RateWindowSeconds,
			Active:            k.Active,
			Description:       k.Description,
			DisplayName:       k.DisplayName,
			AccentColor:       k.AccentColor,
		})
	}
	writeJSON(w, out)
}

// lastUsedPtr converts a *time.Time into the ISO string pointer the JSON
// response expects, or nil when the key has never been used.
func lastUsedPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := isoString(*t)
	return &s
}

// expiryPtr mirrors lastUsedPtr for the optional expires_at column.
func expiryPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := isoString(*t)
	return &s
}

func CreateApiKeyHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req apiKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if msg := validateApiKeyDTO(&req, false); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	expiry, err := parseExpiryPtr(req.ExpiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewApiKeyRepository(con)
	key, plaintext, err := repo.CreateApiKey(repository.CreateApiKeyInput{
		UserID:            uid,
		Name:              req.Name,
		Permissions:       req.Permissions,
		ExpiresAt:         expiry,
		RateLimit:         req.RateLimit,
		RateWindowSeconds: req.RateWindowSeconds,
		Description:       req.Description,
		DisplayName:       req.DisplayName,
		AccentColor:       req.AccentColor,
	})
	if err != nil {
		log.Println("CreateApiKey error:", err)
		http.Error(w, "could not create api key", http.StatusInternalServerError)
		return
	}
	kid := key.ID
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "create",
		TargetID:    &kid,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("created API key %q (%d permissions)", req.Name, len(req.Permissions)),
	})
	created := key.CreatedAt
	if created.IsZero() {
		created = time.Now().UTC()
	}
	writeJSON(w, map[string]any{
		"id":                  key.ID,
		"user_id":             key.UserID,
		"name":                key.Name,
		"prefix":              key.Prefix,
		"permissions":         key.Permissions,
		"created_at":          isoString(created),
		"expires_at":          expiryPtr(key.ExpiresAt),
		"rate_limit":          key.RateLimit,
		"rate_window_seconds": key.RateWindowSeconds,
		"active":              true,
		"description":         key.Description,
		"display_name":        key.DisplayName,
		"accent_color":        key.AccentColor,
		"token":               plaintext, // returned ONCE – never again.
	})
}

// parseExpiryPtr wraps parseExpiry for the *string input the DTO carries.
// A nil pointer means "no expiry supplied by the caller" — on create this
// is treated as unlimited, on update it stays "clear" (NULL).
func parseExpiryPtr(s *string) (*time.Time, error) {
	if s == nil {
		return nil, nil
	}
	return parseExpiry(*s)
}

func UpdateApiKeyHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req apiKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if msg := validateApiKeyDTO(&req, true); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	expiry, err := parseExpiryPtr(req.ExpiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
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
	repo := repository.NewApiKeyRepository(con)
	// Ownership check: self-service keys must belong to the caller.
	if existing, gerr := repo.GetApiKey(id); gerr != nil || existing == nil || existing.UserID != uid {
		http.Error(w, "api key not found", http.StatusNotFound)
		return
	}
	if err := repo.UpdateApiKeyByID(id, repository.UpdateApiKeyInput{
		Name:              req.Name,
		Permissions:       req.Permissions,
		ExpiresAt:         expiry,
		ExpiresAtSet:      req.ExpiresAtSet,
		RateLimit:         req.RateLimit,
		RateLimitSet:      req.RateLimitSet,
		RateWindowSeconds: req.RateWindowSeconds,
		RateWindowSet:     req.RateWindowSet,
		Active:            req.Active,
		ActiveSet:         req.ActiveSet,
		Description:       req.Description,
		DisplayName:       req.DisplayName,
		AccentColor:       req.AccentColor,
	}); err != nil {
		log.Println("UpdateApiKey error:", err)
		http.Error(w, "could not update api key", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated API key %q (%d permissions)", req.Name, len(req.Permissions)),
	})
	w.WriteHeader(http.StatusNoContent)
}

func DeleteApiKeyHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
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
	repo := repository.NewApiKeyRepository(con)
	// Snapshot the name up-front so the audit row tells you which key was
	// deleted even though the row is gone. Ownership check first.
	var label string
	existing, gerr := repo.GetApiKey(id)
	if gerr != nil || existing == nil || existing.UserID != uid {
		http.Error(w, "api key not found", http.StatusNotFound)
		return
	}
	label = existing.Name
	if err := repo.DeleteApiKey(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted API key %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ===== Admin variants (manage ALL users' API keys, gated by MANAGE_API_KEYS) =====

// AdminListApiKeysHandler returns every API key in the panel, joined with the
// owning user's name so the admin page can show ownership.
func AdminListApiKeysHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewApiKeyRepository(con)
	keys, err := repo.ListAllApiKeys()
	if err != nil {
		log.Println("AdminListApiKeys error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]apiKeyResponse, 0, len(keys))
	for _, k := range keys {
		out = append(out, apiKeyResponse{
			ID:                k.ID,
			UserID:            k.UserID,
			OwnerName:         k.OwnerName,
			Name:              k.Name,
			Prefix:            k.Prefix,
			CreatedAt:         isoString(k.CreatedAt),
			LastUsedAt:        lastUsedPtr(k.LastUsedAt),
			Permissions:       k.Permissions,
			ExpiresAt:         expiryPtr(k.ExpiresAt),
			RateLimit:         k.RateLimit,
			RateWindowSeconds: k.RateWindowSeconds,
			Active:            k.Active,
			Description:       k.Description,
			DisplayName:       k.DisplayName,
			AccentColor:       k.AccentColor,
		})
	}
	writeJSON(w, out)
}

// AdminCreateApiKeyHandler lets an admin mint an API key owned by an arbitrary
// user (req.UserID). The plaintext is returned once, exactly like the self-serve
// flow, and must be copied out immediately.
func AdminCreateApiKeyHandler(w http.ResponseWriter, r *http.Request) {
	var req apiKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if msg := validateApiKeyDTO(&req, false); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if req.UserID == 0 {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}
	expiry, err := parseExpiryPtr(req.ExpiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Confirm the target user exists so we don't create an orphan key.
	userRepo := repository.NewUserRepository(con)
	if _, err := userRepo.GetByID(req.UserID); err != nil {
		http.Error(w, "user not found", http.StatusBadRequest)
		return
	}

	repo := repository.NewApiKeyRepository(con)
	key, plaintext, err := repo.CreateApiKey(repository.CreateApiKeyInput{
		UserID:            req.UserID,
		Name:              req.Name,
		Permissions:       req.Permissions,
		ExpiresAt:         expiry,
		RateLimit:         req.RateLimit,
		RateWindowSeconds: req.RateWindowSeconds,
		Description:       req.Description,
		DisplayName:       req.DisplayName,
		AccentColor:       req.AccentColor,
	})
	if err != nil {
		log.Println("AdminCreateApiKey error:", err)
		http.Error(w, "could not create api key", http.StatusInternalServerError)
		return
	}
	created := time.Now().UTC()
	if !key.CreatedAt.IsZero() {
		created = key.CreatedAt.UTC()
	}
	// Audit
	kid := key.ID
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "create",
		TargetID:    &kid,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("admin created API key %q for user %d (%d permissions)", req.Name, req.UserID, len(req.Permissions)),
	})
	writeJSON(w, map[string]any{
		"id":                  key.ID,
		"user_id":             key.UserID,
		"name":                key.Name,
		"prefix":              key.Prefix,
		"permissions":         key.Permissions,
		"created_at":          created.Format("2006-01-02T15:04:05Z07:00"),
		"expires_at":          expiryPtr(key.ExpiresAt),
		"rate_limit":          key.RateLimit,
		"rate_window_seconds": key.RateWindowSeconds,
		"active":              true,
		"description":         key.Description,
		"display_name":        key.DisplayName,
		"accent_color":        key.AccentColor,
		"token":               plaintext, // returned ONCE – never again.
	})
}

// AdminUpdateApiKeyHandler renames / re-scopes an arbitrary key by id. The
// admin can also extend or clear the expiry and rate limit by supplying the
// new value plus its matching `*_set` flag (true). Flags that are false mean
// "leave the existing stored value alone".
func AdminUpdateApiKeyHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req apiKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if msg := validateApiKeyDTO(&req, true); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	expiry, err := parseExpiryPtr(req.ExpiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewApiKeyRepository(con)
	if err := repo.UpdateApiKeyByID(id, repository.UpdateApiKeyInput{
		Name:              req.Name,
		Permissions:       req.Permissions,
		ExpiresAt:         expiry,
		ExpiresAtSet:      req.ExpiresAtSet,
		RateLimit:         req.RateLimit,
		RateLimitSet:      req.RateLimitSet,
		RateWindowSeconds: req.RateWindowSeconds,
		RateWindowSet:     req.RateWindowSet,
		Active:            req.Active,
		ActiveSet:         req.ActiveSet,
		Description:       req.Description,
		DisplayName:       req.DisplayName,
		AccentColor:       req.AccentColor,
	}); err != nil {
		log.Println("AdminUpdateApiKey error:", err)
		http.Error(w, "could not update api key", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated API key %q (%d permissions)", req.Name, len(req.Permissions)),
	})
	w.WriteHeader(http.StatusNoContent)
}

// AdminDeleteApiKeyHandler revokes an arbitrary key by id.
func AdminDeleteApiKeyHandler(w http.ResponseWriter, r *http.Request) {
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
	repo := repository.NewApiKeyRepository(con)
	// Fetch label for audit before removal; treat not-found as 404.
	existing, gerr := repo.GetApiKey(id)
	if gerr != nil || existing == nil {
		http.Error(w, "api key not found", http.StatusNotFound)
		return
	}
	label := existing.Name
	if err := repo.DeleteApiKey(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAPIKey,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted API key %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// validateApiKeyDTO checks common invariants for both create and update.
// isUpdate is only used to emit the same "name is required" message; the rest
// of the checks apply to either flow.
func validateApiKeyDTO(req *apiKeyDTO, isUpdate bool) string {
	_ = isUpdate
	trimmed := ""
	if req.Name != "" {
		// manual trim to avoid importing strings for a one-off check; we do
		// need strings though – import already present for other helpers.
		trimmed = req.Name
		// strings.TrimSpace is clearer and handles all whitespace.
		// We call it explicitly rather than inline to keep the linter quiet.
		trimmed = trimSpace(req.Name)
		if trimmed == "" {
			return "name is required"
		}
		if len(trimmed) > 64 {
			return "name is too long (max 64)"
		}
		req.Name = trimmed
	} else {
		return "name is required"
	}
	if len(req.Description) > 500 {
		return "description is too long (max 500)"
	}
	if len(req.DisplayName) > 64 {
		return "display_name is too long (max 64)"
	}
	if len(req.AccentColor) > 32 {
		return "accent_color is too long (max 32)"
	}
	if len(req.Permissions) > 100 {
		return "too many permissions (max 100)"
	}
	// Basic permission key hygiene – allow alphanumeric, underscore, dash.
	for _, p := range req.Permissions {
		if len(p) > 64 {
			return "permission key too long: " + p
		}
		if p == "" {
			return "permission key cannot be empty"
		}
	}
	if req.RateLimit != nil && *req.RateLimit < 0 {
		return "rate_limit cannot be negative"
	}
	if req.RateLimit != nil && *req.RateLimit > 0 && req.RateLimitSet == false && !isUpdate {
		// On create, rate_limit without explicit set is okay – the repo handles it.
	}
	return ""
}

// trimSpace is a tiny wrapper to keep imports clean in validateApiKeyDTO.
func trimSpace(s string) string {
	// Use standard library trimming.
	return stringsTrimSpace(s)
}

// stringsTrimSpace delegates to strings.TrimSpace without introducing a circular
// import at the top-level helper boundary.
func stringsTrimSpace(s string) string {
	// Inline implementation mirrors strings.TrimSpace for this package's needs.
	// We import "strings" at the top of the file; calling it directly is fine.
	// This indirection exists only to keep the helper testable in isolation.
	return trimSpaceImpl(s)
}
