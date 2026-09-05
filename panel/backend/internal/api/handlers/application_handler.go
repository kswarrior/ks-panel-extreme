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
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

const (
	appURLFetchMaxBytes   = 8 << 20
	appURLFetchTimeout    = 15 * time.Second
	appURLFetchDNSTimeout = 5 * time.Second
)

type appResponse struct {
	ID            int64                       `json:"id"`
	Name          string                      `json:"name"`
	Slug          string                      `json:"slug"`
	Category      string                      `json:"category"`
	Version       string                      `json:"version"`
	Description   string                      `json:"description"`
	Icon          string                      `json:"icon"`
	Color         string                      `json:"color,omitempty"`
	Runtime       string                      `json:"runtime"`
	Entrypoint    string                      `json:"entrypoint"`
	ConfigSchema  json.RawMessage             `json:"config_schema"`
	Files         json.RawMessage             `json:"files"`
	Env           json.RawMessage             `json:"env"`
	Permissions   json.RawMessage             `json:"permissions"`
	Active         bool                `json:"active"`
	UploadedBy     *int64              `json:"uploaded_by,omitempty"`
	OwnerName      string              `json:"owner_name,omitempty"`
	Source         string              `json:"source"`
	SourceURL      string              `json:"source_url,omitempty"`
	PermissionRows []appPermissionView `json:"permission_rows"`
	Pending        int                 `json:"pending"`
	CreatedAt      string              `json:"created_at"`
	UpdatedAt      string              `json:"updated_at"`
}

type appPermissionView struct {
	ID            int64  `json:"id"`
	ApplicationID int64  `json:"application_id"`
	Capability    string `json:"capability"`
	AccessLevel   string `json:"access_level"`
	Granted       bool   `json:"granted"`
}

func openAppRepo() (*repository.ApplicationRepository, func()) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, func() {}
	}
	return repository.NewApplicationRepository(con), func() { _ = con.Close() }
}

func toAppResponse(repo *repository.ApplicationRepository, app *models.Application) appResponse {
	perms, _ := repo.ListApplicationPermissions(app.ID)
	pending := 0
	out := make([]appPermissionView, 0, len(perms))
	for _, p := range perms {
		out = append(out, appPermissionView{
			ID:            p.ID,
			ApplicationID: p.ApplicationID,
			Capability:    p.Capability,
			AccessLevel:   p.AccessLevel,
			Granted:       p.Granted,
		})
		if !p.Granted {
			pending++
		}
	}
	source := app.Source
	if source == "" {
		source = models.ApplicationSourceFile
	}
	return appResponse{
		ID:            app.ID,
		Name:          app.Name,
		Slug:          app.Slug,
		Category:      app.Category,
		Version:       app.Version,
		Description:   app.Description,
		Icon:          app.Icon,
		Color:         app.Color,
		Runtime:       app.Runtime,
		Entrypoint:    app.Entrypoint,
		ConfigSchema:  app.ConfigSchema,
		Files:         app.Files,
		Env:           app.Env,
		Permissions:   app.Permissions,
		Active:         app.Active,
		UploadedBy:     app.UploadedBy,
		OwnerName:      app.OwnerName,
		Source:         source,
		SourceURL:      app.SourceURL,
		PermissionRows: out,
		Pending:        pending,
		CreatedAt:      isoString(app.CreatedAt),
		UpdatedAt:      isoString(app.UpdatedAt),
	}
}

func ListApplicationsHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	apps, err := repo.ListApplications()
	if err != nil {
		log.Println("ListApplications error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]appResponse, 0, len(apps))
	// Ownership scope (migration 054): APPLICATIONS_OWN → only apps the
	// caller uploaded; ALL / MANAGE_APPLICATIONS umbrella → full catalog.
	var scopeOwn map[int]bool
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if con, perr := repository.OpenDB(); perr == nil {
			chk := permissions.NewChecker(con)
			hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ApplicationsOwnKey, permissions.ApplicationsAllKey, permissions.ManageApplicationsKey)
			con.Close()
			if !hasAll && hasOwn {
				scopeOwn = make(map[int]bool)
				for i := range apps {
					if apps[i].OwnerID != uid {
						scopeOwn[i] = true
					}
				}
			}
		}
	}
	for i := range apps {
		if scopeOwn != nil && scopeOwn[i] {
			continue
		}
		out = append(out, toAppResponse(repo, &apps[i]))
	}
	writeJSON(w, out)
}

func GetApplicationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	app, err := repo.GetApplication(id)
	if err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	writeJSON(w, toAppResponse(repo, app))
}

type appUpsertDTO struct {
	Name           string                     `json:"name"`
	Slug           string                     `json:"slug"`
	Category       string                     `json:"category"`
	Version        string                     `json:"version"`
	Description    string                     `json:"description"`
	Icon           string                     `json:"icon"`
	Color          string                     `json:"color"`
	Runtime        string                     `json:"runtime"`
	Entrypoint     string                     `json:"entrypoint"`
	ConfigSchema   json.RawMessage            `json:"config_schema"`
	Files          json.RawMessage            `json:"files"`
	PermissionsReq []repository.ApplicationPermissionReq `json:"permissionsRequested"`
}

func CreateApplicationHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var rawManifest []byte
	var specOverride []byte
	source := models.ApplicationSourceJSON
	if hs := strings.TrimSpace(r.Header.Get("X-KS-Source")); hs != "" {
		switch strings.ToLower(hs) {
		case models.ApplicationSourceFile, models.ApplicationSourceURL, models.ApplicationSourceStudio, models.ApplicationSourceJSON:
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
		source = models.ApplicationSourceFile
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
			return
		}
		file, _, ferr := r.FormFile("manifest")
		if ferr != nil {
			http.Error(w, "missing 'manifest' file part", http.StatusBadRequest)
			return
		}
		defer file.Close()
		rawManifest, err = io.ReadAll(io.LimitReader(file, 8<<20+1))
		if err != nil {
			http.Error(w, "read manifest file: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(rawManifest) > 8<<20 {
			http.Error(w, "manifest file too large (max 8 MiB)", http.StatusRequestEntityTooLarge)
			return
		}
		if sfile, _, serr := r.FormFile("spec"); serr == nil {
			defer sfile.Close()
			specOverride, _ = io.ReadAll(io.LimitReader(sfile, 8<<20))
		}
	} else {
		http.Error(w, "unsupported content type; use application/json or multipart/form-data", http.StatusUnsupportedMediaType)
		return
	}
	var in appUpsertDTO
	if err := json.Unmarshal(rawManifest, &in); err != nil {
		http.Error(w, "invalid manifest JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if in.Name == "" || in.Slug == "" {
		http.Error(w, "manifest must declare name and slug", http.StatusBadRequest)
		return
	}
	if len(specOverride) > 0 {
		in.ConfigSchema = specOverride
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	app, err := repo.CreateApplication(repository.CreateApplicationInput{
		Name:           in.Name,
		Slug:           in.Slug,
		Category:       in.Category,
		Version:        in.Version,
		Description:    in.Description,
		Icon:           in.Icon,
		Color:          strings.ToUpper(strings.TrimSpace(in.Color)),
		Runtime:        in.Runtime,
		Entrypoint:     in.Entrypoint,
		ConfigSchema:   in.ConfigSchema,
		Files:          in.Files,
		PermissionsReq: in.PermissionsReq,
		UploadedBy:     uid,
		Source:         source,
		SourceURL:      "",
	})
	if err != nil {
		log.Println("CreateApplication error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "an application with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod, // reuse existing category
		Action:      "create",
		TargetLabel: in.Name,
		Message:     fmt.Sprintf("uploaded application %q (slug=%s, source=%s, %d permission requests)", in.Name, in.Slug, source, len(in.PermissionsReq)),
	})
	writeJSONStatus(w, http.StatusCreated, toAppResponse(repo, app))
}

func InstallApplicationFromURLHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var dto installFromURLDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}
	rawManifest, ferr := fetchManifestFromURL(r.Context(), dto.URL)
	if ferr != nil {
		// fetchManifestFromURL classifies every user-facing failure as
		// *allowedURLError (same package) — surface its status + reason.
		var ue *allowedURLError
		if errors.As(ferr, &ue) {
			writeJSONStatus(w, ue.status, map[string]any{
				"error": ue.reason,
			})
			return
		}
		log.Println("InstallApplicationFromURL fetch error:", ferr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "fetch failed",
		})
		return
	}
	var in appUpsertDTO
	if err := json.Unmarshal(rawManifest, &in); err != nil {
		http.Error(w, "manifest from URL is invalid: "+err.Error(), http.StatusBadRequest)
		return
	}
	if in.Name == "" || in.Slug == "" {
		http.Error(w, "manifest must declare name and slug", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	app, err := repo.CreateApplication(repository.CreateApplicationInput{
		Name:           in.Name,
		Slug:           in.Slug,
		Category:       in.Category,
		Version:        in.Version,
		Description:    in.Description,
		Icon:           in.Icon,
		Color:          strings.ToUpper(strings.TrimSpace(in.Color)),
		Runtime:        in.Runtime,
		Entrypoint:     in.Entrypoint,
		ConfigSchema:   in.ConfigSchema,
		Files:          in.Files, // URL manifests may ship script files, same as uploads
		PermissionsReq: in.PermissionsReq,
		UploadedBy:     uid,
		Source:         models.ApplicationSourceURL,
		SourceURL:      dto.URL,
	})
	if err != nil {
		log.Println("InstallApplicationFromURL CreateApplication error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "an application with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "create",
		TargetLabel: in.Name,
		Message: fmt.Sprintf("installed application %q from URL %s (slug=%s, %d permission requests)",
			in.Name, dto.URL, in.Slug, len(in.PermissionsReq)),
	})
	writeJSONStatus(w, http.StatusCreated, toAppResponse(repo, app))
}

func UpdateApplicationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto appUpsertDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	// Ownership scope (migration 054): APPLICATIONS_OWN without ALL may
	// only edit applications they uploaded (owner_id mirrors uploaded_by;
	// fall back to uploaded_by for pre-054 orphan rows).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetApplication(id); gerr == nil && ex != nil {
			owner := ex.OwnerID
			if owner == 0 && ex.UploadedBy != nil {
				owner = *ex.UploadedBy
			}
			if owner != 0 && owner != uid {
				if con, perr := repository.OpenDB(); perr == nil {
					chk := permissions.NewChecker(con)
					hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ApplicationsOwnKey, permissions.ApplicationsAllKey, permissions.ManageApplicationsKey)
					con.Close()
					if !hasAll && hasOwn {
						http.Error(w, "forbidden: own-scope may only edit applications you uploaded", http.StatusForbidden)
						return
					}
				}
			}
		}
	}
	app, err := repo.UpdateApplication(id, repository.UpdateApplicationInput{
		Name:         dto.Name,
		Category:     dto.Category,
		Version:      dto.Version,
		Description:  dto.Description,
		Icon:         dto.Icon,
		Color:        strings.ToUpper(strings.TrimSpace(dto.Color)),
		Runtime:      dto.Runtime,
		Entrypoint:   dto.Entrypoint,
		ConfigSchema: dto.ConfigSchema,
		Files:        dto.Files,
	})
	if err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("edited application %q", dto.Name),
	})
	writeJSON(w, toAppResponse(repo, app))
}

func DeleteApplicationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	label := ""
	if a, gerr := repo.GetApplication(id); gerr == nil {
		label = a.Name
	}
	if err := repo.DeleteApplication(id); err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted application %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

type appGrantDecisionDTO struct {
	Grants []repository.AppGrantDecision `json:"grants"`
}

func SetApplicationGrantsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto appGrantDecisionDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if _, gerr := repo.GetApplication(id); gerr != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	if err := repo.SetApplicationGrants(id, dto.Grants); err != nil {
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
		Category: models.ActivityCategoryMod,
		Action:   "grant",
		TargetID: &id,
		Message:  fmt.Sprintf("approved %d permission request(s) for application #%d", grantedCount, id),
	})
	w.WriteHeader(http.StatusNoContent)
}

type appActivateConflict struct {
	Error       string              `json:"error"`
	Message     string              `json:"message"`
	Pending     int                 `json:"pending"`
	Permissions []appPermissionView `json:"permissions"`
}

func ActivateApplicationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if err := repo.ActivateApplication(id); err != nil {
		if errors.Is(err, repository.ErrApplicationPermissionsNotGranted) {
			app, gerr := repo.GetApplication(id)
			if gerr != nil {
				http.Error(w, "application not found", http.StatusNotFound)
				return
			}
			resp := toAppResponse(repo, app)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(appActivateConflict{
				Error:       "permissions pending",
				Message:     fmt.Sprintf("This application needs %d more permission(s) approved before it can be activated.", resp.Pending),
				Pending:     resp.Pending,
				Permissions: resp.PermissionRows,
			})
			return
		}
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryMod,
		Action:   "activate",
		TargetID: &id,
		Message:  fmt.Sprintf("activated application #%d", id),
	})
	w.WriteHeader(http.StatusNoContent)
}

func DeactivateApplicationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if err := repo.DeactivateApplication(id); err != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryMod,
		Action:   "deactivate",
		TargetID: &id,
		Message:  fmt.Sprintf("deactivated application #%d", id),
	})
	w.WriteHeader(http.StatusNoContent)
}

func UpdateApplicationEnvHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto struct {
		Env map[string]string `json:"env"`
	}
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	// Mirror the run engine's rules here so a bad key is rejected with a
	// clear 400 at save time instead of silently poisoning the saved env
	// and failing every future Run with an obscure runtime error.
	if len(dto.Env) > 64 {
		http.Error(w, "too many env keys (max 64)", http.StatusBadRequest)
		return
	}
	for k := range dto.Env {
		if !isAppEnvName(k) {
			http.Error(w, fmt.Sprintf("env key %q is not a valid POSIX identifier", k), http.StatusBadRequest)
			return
		}
	}
	repo, closeFn := openAppRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if _, gerr := repo.GetApplication(id); gerr != nil {
		http.Error(w, "application not found", http.StatusNotFound)
		return
	}
	envBytes, err := json.Marshal(dto.Env)
	if err != nil {
		http.Error(w, "invalid env", http.StatusBadRequest)
		return
	}
	if err := repo.UpdateApplicationEnv(id, string(envBytes)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSONStatus(w, http.StatusNoContent, nil)
}
