package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/stackstore"
	"github.com/go-chi/chi/v5"
)

// stackResponse is the JSON shape the frontend consumes for one stack. It
// carries the requested-capability rows with grant state so the activation
// modal renders its checklist in one round-trip (mirrors modResponse).
type stackResponse struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Category    string          `json:"category"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	Icon        string          `json:"icon"`
	Color       string          `json:"color,omitempty"`
	Runtime     string          `json:"runtime"`
	Entrypoint  string          `json:"entrypoint,omitempty"`
	Manifest    json.RawMessage `json:"manifest"`
	Spec        json.RawMessage `json:"spec,omitempty"`
	ThemeMode   string          `json:"theme_mode"`
	PageStyle   string          `json:"page_style"`
	Active      bool            `json:"active"`
	OwnerName   string          `json:"owner_name,omitempty"`
	Source      string          `json:"source"`
	SourceURL   string          `json:"source_url,omitempty"`
	PackageSize int64                  `json:"package_size"`
	Permissions []stackPermissionView  `json:"permissions"`
	Pending     int                    `json:"pending"`
	CreatedAt   string                 `json:"created_at"`
	UpdatedAt   string                 `json:"updated_at"`
}

type stackPermissionView struct {
	ID          int64  `json:"id"`
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
	Granted     bool   `json:"granted"`
}

func openStackRepo() (*repository.StackRepository, func()) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, func() {}
	}
	return repository.NewStackRepository(con), func() { _ = con.Close() }
}

func toStackResponse(repo *repository.StackRepository, s *models.Stack) stackResponse {
	source := s.Source
	if source == "" {
		source = models.StackSourceFile
	}
	resp := stackResponse{
		ID:          s.ID,
		Name:        s.Name,
		Slug:        s.Slug,
		Category:    s.Category,
		Version:     s.Version,
		Description: s.Description,
		Icon:        s.Icon,
		Color:       s.Color,
		Runtime:     s.Runtime,
		Entrypoint:  s.Entrypoint,
		Manifest:    s.Manifest,
		Spec:        s.Spec,
		ThemeMode:   s.ThemeMode,
		PageStyle:   s.PageStyle,
		Active:      s.Active,
		OwnerName:   s.OwnerName,
		Source:      source,
		SourceURL:   s.SourceURL,
		PackageSize: s.PackageSize,
		CreatedAt:   isoString(s.CreatedAt),
		UpdatedAt:   isoString(s.UpdatedAt),
	}
	perms, _ := repo.ListStackPermissions(s.ID)
	pending := 0
	out := make([]stackPermissionView, 0, len(perms))
	for _, p := range perms {
		out = append(out, stackPermissionView{
			ID:          p.ID,
			Capability:  p.Capability,
			AccessLevel: p.AccessLevel,
			Granted:     p.Granted,
		})
		if !p.Granted {
			pending++
		}
	}
	resp.Permissions = out
	resp.Pending = pending
	return resp
}

// stackOwnBlocked reports whether an own-scope caller (STACKS_OWN without
// STACKS_ALL/umbrella) is touching a stack they don't own. Orphans
// (OwnerID==0) require ALL (fail closed, mirrors mod handlers).
func stackOwnBlocked(r *http.Request, s *models.Stack) bool {
	uid, _ := UserIDFromContext(r)
	if uid == 0 || s == nil || s.OwnerID == uid {
		return false
	}
	con, err := repository.OpenDB()
	if err != nil {
		return false
	}
	defer con.Close()
	chk := permissions.NewChecker(con)
	hasOwn, hasAll, _ := chk.HasScope(uid, permissions.StacksOwnKey, permissions.StacksAllKey, permissions.ManageStacksKey)
	return !hasAll && hasOwn
}

// ListStacksHandler returns every stack (active + inactive) with grants.
// Ownership scope: STACKS_OWN filters to caller-owned rows.
func ListStacksHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	stacks, err := repo.ListStacks()
	if err != nil {
		log.Println("ListStacks error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]stackResponse, 0, len(stacks))
	var scopeOwn map[int]bool
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if con, err := repository.OpenDB(); err == nil {
			chk := permissions.NewChecker(con)
			hasOwn, hasAll, _ := chk.HasScope(uid, permissions.StacksOwnKey, permissions.StacksAllKey, permissions.ManageStacksKey)
			con.Close()
			if !hasAll && hasOwn {
				scopeOwn = make(map[int]bool)
				for i := range stacks {
					if stacks[i].OwnerID != uid {
						scopeOwn[i] = true
					}
				}
			}
		}
	}
	for i := range stacks {
		if scopeOwn != nil && scopeOwn[i] {
			continue
		}
		out = append(out, toStackResponse(repo, &stacks[i]))
	}
	writeJSON(w, out)
}

// GetStackHandler returns a single stack with its permission checklist.
func GetStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStack(id)
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("GetStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, s) {
		http.Error(w, "forbidden: own-scope may only read stacks you uploaded", http.StatusForbidden)
		return
	}
	writeJSON(w, toStackResponse(repo, s))
}

// stackUpsertDTO mirrors the manifest shape for form-based create/update.
type stackUpsertDTO struct {
	Name                 string                          `json:"name"`
	Slug                 string                          `json:"slug"`
	Category             string                          `json:"category"`
	Version              string                          `json:"version"`
	Description          string                          `json:"description"`
	Icon                 string                          `json:"icon"`
	Color                string                          `json:"color"`
	Runtime              string                          `json:"runtime"`
	Entrypoint           string                          `json:"entrypoint"`
	ThemeMode            string                          `json:"themeMode"`
	PageStyle            string                          `json:"pageStyle"`
	Spec                 json.RawMessage                 `json:"spec"`
	PermissionsRequested []repository.StackPermissionReq `json:"permissionsRequested"`
}

// stackPackageMaxBytes caps an uploaded .ksps zip (mirrors modPackageMaxBytes).
const stackPackageMaxBytes = 64 << 20

// CreateStackHandler installs a .ksps zip (multipart `package` part) or a
// bare manifest (application/json, incl. the Studio path tagged via
// X-KS-Source). Either way the manifest runs through ParseStackManifest,
// permission rows seed pending, and a .ksps is persisted on disk.
func CreateStackHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var rawManifest []byte
	var specOverride []byte
	packageBytes := []byte{}
	source := models.StackSourceJSON
	if hs := strings.TrimSpace(r.Header.Get("X-KS-Source")); hs != "" {
		switch strings.ToLower(hs) {
		case models.StackSourceFile, models.StackSourceURL, models.StackSourceStudio, models.StackSourceJSON:
			source = strings.ToLower(hs)
		}
	}

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/json") {
		rawManifest, err = io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else if strings.HasPrefix(ct, "multipart/") {
		source = models.StackSourceFile
		r.Body = http.MaxBytesReader(w, r.Body, stackPackageMaxBytes+1024)
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
			return
		}
		file, _, ferr := r.FormFile("package")
		if ferr != nil {
			http.Error(w, `missing 'package' file part — stacks install from a .ksps zip. Upload a package.`,
				http.StatusBadRequest)
			return
		}
		defer file.Close()
		zipBytes, rerr := io.ReadAll(io.LimitReader(file, stackPackageMaxBytes+1))
		if rerr != nil {
			http.Error(w, "read package: "+rerr.Error(), http.StatusBadRequest)
			return
		}
		if int64(len(zipBytes)) > stackPackageMaxBytes {
			http.Error(w, fmt.Sprintf("package too large (max %d MiB)", stackPackageMaxBytes>>20),
				http.StatusRequestEntityTooLarge)
			return
		}
		if !stackstore.IsZipBytes(zipBytes) {
			http.Error(w, "package is not a valid .ksps zip (missing zip header)", http.StatusBadRequest)
			return
		}
		rawManifest, specOverride, err = stackstore.ReadManifestFromZip(zipBytes)
		if err != nil {
			http.Error(w, "read package: "+err.Error(), http.StatusBadRequest)
			return
		}
		packageBytes = zipBytes
	} else {
		http.Error(w, "unsupported content type; use application/json or multipart/form-data", http.StatusUnsupportedMediaType)
		return
	}

	in, err := repository.ParseStackManifest(rawManifest)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(specOverride) > 0 {
		in.Spec = specOverride
	}
	if len(packageBytes) == 0 {
		b, berr := stackstore.BuildPackageZip(rawManifest, in.Spec, nil)
		if berr != nil {
			http.Error(w, "build package: "+berr.Error(), http.StatusInternalServerError)
			return
		}
		packageBytes = b
	}

	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	reqs := make([]repository.StackPermissionReq, 0, len(in.PermissionsRequested))
	for _, p := range in.PermissionsRequested {
		reqs = append(reqs, repository.StackPermissionReq{Capability: p.Capability, AccessLevel: p.AccessLevel})
	}
	s, err := repo.CreateStack(repository.CreateStackInput{
		Name: in.Name, Slug: in.Slug, Category: in.Category, Version: in.Version,
		Description: in.Description, Icon: in.Icon, Color: in.Color,
		Runtime: in.Runtime, Entrypoint: in.Entrypoint,
		ThemeMode: in.ThemeMode, PageStyle: in.PageStyle,
		Manifest: rawManifest, Spec: in.Spec, PermissionsRequested: reqs,
		UploadedBy: uid, Source: source, PackageSize: int64(len(packageBytes)),
	})
	if err != nil {
		log.Println("CreateStack error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a stack with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := stackstore.SavePackage(in.Slug, packageBytes); err != nil {
		log.Printf("CreateStack: save .ksps for %q: %v", in.Slug, err)
	}
	if _, derr := stackstore.EnsureDataDir(in.Slug); derr != nil {
		log.Printf("CreateStack: data dir for %q: %v", in.Slug, derr)
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryStack,
		Action:      "create",
		TargetLabel: in.Name,
		Message:     fmt.Sprintf("uploaded stack %q (slug=%s, source=%s, runtime=%s, %s/%s)", in.Name, in.Slug, source, in.Runtime, in.PageStyle, in.ThemeMode),
	})
	writeJSONStatus(w, http.StatusCreated, toStackResponse(repo, s))
}

// installStackFromURLDTO is the POST /api/stacks/url body.
type installStackFromURLDTO struct {
	URL string `json:"url"`
}

// InstallStackFromURLHandler fetches a .ksps zip or bare manifest from a URL
// through the shared SSRF-guarded fetcher, then follows CreateStackHandler.
func InstallStackFromURLHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var dto installStackFromURLDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}
	fetched, ferr := fetchManifestFromURL(r.Context(), dto.URL)
	if ferr != nil {
		var ue *allowedURLError
		if errors.As(ferr, &ue) {
			http.Error(w, ue.reason, ue.status)
			return
		}
		log.Println("InstallStackFromURL fetch error:", ferr)
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}
	var rawManifest, specOverride, packageBytes []byte
	if stackstore.IsZipBytes(fetched) {
		var zerr error
		rawManifest, specOverride, zerr = stackstore.ReadManifestFromZip(fetched)
		if zerr != nil {
			http.Error(w, "package from URL is invalid: "+zerr.Error(), http.StatusBadRequest)
			return
		}
		packageBytes = fetched
	} else {
		rawManifest = fetched
	}
	in, err := repository.ParseStackManifest(rawManifest)
	if err != nil {
		http.Error(w, "manifest from URL is invalid: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(specOverride) > 0 {
		in.Spec = specOverride
	}
	if len(packageBytes) == 0 {
		b, berr := stackstore.BuildPackageZip(rawManifest, in.Spec, nil)
		if berr != nil {
			http.Error(w, "build package: "+berr.Error(), http.StatusInternalServerError)
			return
		}
		packageBytes = b
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	reqs := make([]repository.StackPermissionReq, 0, len(in.PermissionsRequested))
	for _, p := range in.PermissionsRequested {
		reqs = append(reqs, repository.StackPermissionReq{Capability: p.Capability, AccessLevel: p.AccessLevel})
	}
	s, err := repo.CreateStack(repository.CreateStackInput{
		Name: in.Name, Slug: in.Slug, Category: in.Category, Version: in.Version,
		Description: in.Description, Icon: in.Icon, Color: in.Color,
		Runtime: in.Runtime, Entrypoint: in.Entrypoint,
		ThemeMode: in.ThemeMode, PageStyle: in.PageStyle,
		Manifest: rawManifest, Spec: in.Spec, PermissionsRequested: reqs,
		UploadedBy: uid, Source: models.StackSourceURL, SourceURL: dto.URL,
		PackageSize: int64(len(packageBytes)),
	})
	if err != nil {
		log.Println("InstallStackFromURL CreateStack error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a stack with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := stackstore.SavePackage(in.Slug, packageBytes); err != nil {
		log.Printf("InstallStackFromURL: save .ksps for %q: %v", in.Slug, err)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryStack,
		Action:      "create",
		TargetLabel: in.Name,
		Message:     fmt.Sprintf("installed stack %q from URL %s (slug=%s)", in.Name, dto.URL, in.Slug),
	})
	writeJSONStatus(w, http.StatusCreated, toStackResponse(repo, s))
}

// UpdateStackHandler overwrites editable fields (never the permission set).
func UpdateStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto stackUpsertDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if ex, gerr := repo.GetStack(id); gerr == nil && stackOwnBlocked(r, ex) {
		http.Error(w, "forbidden: own-scope may only edit stacks you uploaded", http.StatusForbidden)
		return
	}
	s, err := repo.UpdateStack(id, repository.UpdateStackInput{
		Name: dto.Name, Category: dto.Category, Version: dto.Version,
		Description: dto.Description, Icon: dto.Icon, Color: dto.Color, Spec: dto.Spec,
	})
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("UpdateStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "update",
		TargetID: &id, TargetLabel: dto.Name,
		Message: fmt.Sprintf("edited stack %q", dto.Name),
	})
	writeJSON(w, toStackResponse(repo, s))
}

// DeleteStackHandler removes a stack row (+ permission/env cascade) and its
// package/workdir. Data dir is kept unless ?wipe=1.
func DeleteStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	label, slug := "", ""
	if m, gerr := repo.GetStack(id); gerr == nil && m != nil {
		if stackOwnBlocked(r, m) {
			http.Error(w, "forbidden: own-scope may only delete stacks you uploaded", http.StatusForbidden)
			return
		}
		label, slug = m.Name, m.Slug
	}
	if err := repo.DeleteStack(id); err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("DeleteStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if slug != "" {
		wipe := r.URL.Query().Get("wipe") == "1"
		if perr := stackstore.RemoveAll(slug, wipe); perr != nil {
			log.Printf("DeleteStack: remove files for %q: %v", slug, perr)
		}
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "delete",
		TargetID: &id, TargetLabel: label,
		Message: fmt.Sprintf("deleted stack %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// stackGrantDecisionDTO is the PUT /api/stacks/{id}/grants body.
type stackGrantDecisionDTO struct {
	Grants []repository.StackGrantDecision `json:"grants"`
}

// SetStackGrantsHandler records per-capability approval decisions.
func SetStackGrantsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto stackGrantDecisionDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	ex, gerr := repo.GetStack(id)
	if gerr != nil {
		if errors.Is(gerr, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, ex) {
		http.Error(w, "forbidden: own-scope may only approve stacks you uploaded", http.StatusForbidden)
		return
	}
	if err := repo.SetGrants(id, dto.Grants); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	grantedCount := 0
	for _, g := range dto.Grants {
		if g.Granted {
			grantedCount++
		}
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "grant", TargetID: &id,
		Message: fmt.Sprintf("approved %d permission request(s) for stack #%d", grantedCount, id),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ActivateStackHandler flips active = 1 after AllGranted passes; 409 with
// the checklist otherwise.
func ActivateStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if ex, gerr := repo.GetStack(id); gerr == nil && stackOwnBlocked(r, ex) {
		http.Error(w, "forbidden: own-scope may only activate stacks you uploaded", http.StatusForbidden)
		return
	}
	if !repo.StacksEnabled() {
		writeJSONStatus(w, http.StatusConflict, map[string]any{
			"error":   "engine disabled",
			"message": "Stacks are disabled. Re-enable them before activating.",
		})
		return
	}
	if err := repo.Activate(id); err != nil {
		if errors.Is(err, repository.ErrStackPermissionsNotGranted) {
			s, gerr := repo.GetStack(id)
			if gerr != nil {
				http.Error(w, "stack not found", http.StatusNotFound)
				return
			}
			resp := toStackResponse(repo, s)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":       "permissions pending",
				"message":     fmt.Sprintf("This stack needs %d more permission(s) approved before it can be activated.", resp.Pending),
				"pending":     resp.Pending,
				"permissions": resp.Permissions,
			})
			return
		}
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("ActivateStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "activate", TargetID: &id,
		Message: fmt.Sprintf("activated stack #%d", id),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DeactivateStackHandler flips active = 0, keeping grants.
func DeactivateStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if ex, gerr := repo.GetStack(id); gerr == nil && stackOwnBlocked(r, ex) {
		http.Error(w, "forbidden: own-scope may only deactivate stacks you uploaded", http.StatusForbidden)
		return
	}
	if err := repo.Deactivate(id); err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		log.Println("DeactivateStack error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: "deactivate", TargetID: &id,
		Message: fmt.Sprintf("deactivated stack #%d", id),
	})
	w.WriteHeader(http.StatusNoContent)
}

// StackNavEntry is one sidebar entry for an active stack.
type StackNavEntry struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
	Icon  string `json:"icon"`
}

// StackNavHandler serves active stacks for the sidebar. Any authed panel
// user may read it (visibility of stack content is enforced per route).
func StackNavHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	stacks, err := repo.ListStacks()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]StackNavEntry, 0)
	for i := range stacks {
		if !stacks[i].Active {
			continue
		}
		label := stacks[i].Name
		out = append(out, StackNavEntry{Slug: stacks[i].Slug, Label: label, Icon: stacks[i].Icon})
	}
	writeJSON(w, out)
}

// stackEngineStatus is the Phase-0 engine snapshot: kill-switch state plus
// per-stack DB-active flags. The supervisor (Phase-2) extends it with live
// runtime state; the shape stays additive.
type stackEngineStatus struct {
	Enabled bool `json:"enabled"`
	Stacks  []struct {
		Slug   string `json:"slug"`
		Active bool   `json:"active"`
	} `json:"stacks"`
}

// StackEngineStatusHandler serves the engine snapshot (STACKS_VIEW).
func StackEngineStatusHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	stacks, _ := repo.ListStacks()
	st := stackEngineStatus{Enabled: repo.StacksEnabled()}
	for i := range stacks {
		st.Stacks = append(st.Stacks, struct {
			Slug   string `json:"slug"`
			Active bool   `json:"active"`
		}{Slug: stacks[i].Slug, Active: stacks[i].Active})
	}
	if st.Stacks == nil {
		st.Stacks = []struct {
			Slug   string `json:"slug"`
			Active bool   `json:"active"`
		}{}
	}
	writeJSON(w, st)
}

// stackEngineToggleDTO is the PUT /api/stacks/engine body.
type stackEngineToggleDTO struct {
	Enabled *bool `json:"enabled"`
}

// SetStackEngineEnabledHandler flips the stacks kill switch (STACKS_EDIT).
func SetStackEngineEnabledHandler(w http.ResponseWriter, r *http.Request) {
	var dto stackEngineToggleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&dto); err != nil || dto.Enabled == nil {
		http.Error(w, `invalid payload: {"enabled": true|false} required`, http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if err := repo.SetStacksEnabled(*dto.Enabled); err != nil {
		log.Println("SetStacksEnabled error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	action := "enable"
	if !*dto.Enabled {
		action = "disable"
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryStack, Action: action,
		Message: fmt.Sprintf("%sd stacks", action),
	})
	writeJSON(w, map[string]any{"enabled": *dto.Enabled})
}

// DownloadStackHandler streams the .ksps zip (stored bytes, else synth from
// manifest+spec). STACKS_VIEW may download (mirrors mods).
func DownloadStackHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	s, err := repo.GetStack(id)
	if err != nil {
		if errors.Is(err, repository.ErrStackNotFound) {
			http.Error(w, "stack not found", http.StatusNotFound)
			return
		}
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if stackOwnBlocked(r, s) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var body []byte
	if stackstore.PackageExists(s.Slug) {
		body, err = stackstore.LoadPackage(s.Slug)
		if err != nil {
			log.Printf("DownloadStack: load .ksps for %q: %v", s.Slug, err)
			body = nil
		}
	}
	if len(body) == 0 {
		body, err = stackstore.BuildPackageZip(s.Manifest, s.Spec, nil)
		if err != nil {
			http.Error(w, "build package: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	safe := strings.Map(func(rn rune) rune {
		if rn == '/' || rn == '\\' || rn == ':' {
			return '-'
		}
		return rn
	}, s.Slug)
	if safe == "" {
		safe = fmt.Sprintf("stack-%d", s.ID)
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.ksps"`, safe))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	_, _ = w.Write(body)
}
