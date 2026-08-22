package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// themeStoreResponse is the shape the frontend's theme resolver reads on every
// page load: the list of global themes plus their scope assignments. Both are
// returned together so one round-trip is enough for the store to resolve the
// active route against (local > global > default) and apply the theme.
type themeStoreResponse struct {
	Themes      []storedTheme        `json:"themes"`
	Assignments []assignmentBinding  `json:"assignments"`
}

// storedTheme is a server-saved theme as the frontend consumes it. The `spec`
// field is the full Theme appearance object (background/card/sidebar/...) so
// the client can drop it straight into its theme application path without
// re-shaping.
type storedTheme struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Builtin     bool            `json:"builtin"`
	Spec        json.RawMessage `json:"spec"`
	OwnerName   string          `json:"owner_name,omitempty"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

type assignmentBinding struct {
	Scope   string `json:"scope"`
	ThemeID string `json:"theme_id"`
}

// writeJSONStatus encodes v with an explicit status code. writeJSON (in
// admin_handler.go) always emits 200, so Create needs this for 201 Created.
func writeJSONStatus(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// openThemeRepo is a tiny helper so every handler follows the same
// connection-open / repository-build / defer-close pattern the rest of the
// handler package uses (chi handlers can't share one across the lifecycle).
func openThemeRepo() (*repository.ThemeRepository, func()) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, func() {}
	}
	return repository.NewThemeRepository(con), func() { _ = con.Close() }
}

func storedThemeFromModel(t models.Theme) storedTheme {
	return storedTheme{
		ID:          t.ID,
		Name:        t.Name,
		Description: t.Description,
		Builtin:     t.Builtin,
		Spec:        t.Spec,
		CreatedAt:   isoString(t.CreatedAt),
		UpdatedAt:   isoString(t.UpdatedAt),
	}
}

func storedThemeFromOwner(t models.ThemeWithOwner) storedTheme {
	return storedTheme{
		ID:          t.ID,
		Name:        t.Name,
		Description: t.Description,
		Builtin:     t.Builtin,
		Spec:        t.Spec,
		OwnerName:   t.OwnerName,
		CreatedAt:   isoString(t.CreatedAt),
		UpdatedAt:   isoString(t.UpdatedAt),
	}
}

// ListThemesHandler is the PUBLIC read path: every authenticated user (any
// role) fetches the global theme store so their browser can resolve the route
// against (local assignment > global assignment > built-in default) and paint.
// It is NOT behind MANAGE_THEMES — seeing the assigned theme is part of just
// using the panel.
func ListThemesHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	themes, err := repo.ListThemes()
	if err != nil {
		log.Println("ListThemes error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	assignments, err := repo.ListAssignments()
	if err != nil {
		log.Println("ListThemeAssignments error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]storedTheme, 0, len(themes))
	for _, t := range themes {
		out = append(out, storedThemeFromModel(t))
	}
	bindings := make([]assignmentBinding, 0, len(assignments))
	for _, a := range assignments {
		bindings = append(bindings, assignmentBinding{Scope: a.Scope, ThemeID: a.ThemeID})
	}
	writeJSON(w, themeStoreResponse{Themes: out, Assignments: bindings})
}

// AdminListThemesHandler returns the global themes WITH the creator's username,
// for the admin Theme Studio management view. Behind MANAGE_THEMES (the route
// is permission-gated in server.go).
func AdminListThemesHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	ts, err := repo.ListThemesWithOwner()
	if err != nil {
		log.Println("ListThemesWithOwner error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]storedTheme, 0, len(ts))
	for _, t := range ts {
		out = append(out, storedThemeFromOwner(t))
	}
	writeJSON(w, out)
}

// themeUpsertDTO is the POST/PUT body. It is the FULL Theme appearance object
// the studio already serialises to localStorage; the backend stores it as the
// opaque `spec` blob and forwards id/name/description/builtin as columns so the
// list endpoint can render without decoding the spec.
type themeUpsertDTO struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Builtin     bool            `json:"builtin"`
	Spec        json.RawMessage `json:"spec"`
}

// CreateThemeHandler publishes a global theme. MANAGE_THEMES-gated. Returns
// 409 on a duplicate id (PRIMARY KEY clash) so the studio can prompt the admin
// to rename rather than silently overwrite another admin's theme.
func createThemeFromJSON(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var dto themeUpsertDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.ID == "" || dto.Name == "" || len(dto.Spec) == 0 {
		http.Error(w, "id, name and spec are required", http.StatusBadRequest)
		return
	}

	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	t, err := repo.CreateTheme(repository.UpsertThemeInput{
		ID:          dto.ID,
		Name:        dto.Name,
		Description: dto.Description,
		Spec:        dto.Spec,
		Builtin:     dto.Builtin,
		CreatedBy:   uid,
	})
	if err != nil {
		log.Println("CreateTheme error:", err)
		http.Error(w, "theme id already exists", http.StatusConflict)
		return
	}
	writeJSONStatus(w, http.StatusCreated, storedThemeFromModel(*t))
}

// UpdateThemeHandler overwrites name/description/spec and bumps updated_at.
// MANAGE_THEMES-gated. 404 when the id doesn't exist.
func UpdateThemeHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}
	var dto themeUpsertDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Name == "" || len(dto.Spec) == 0 {
		http.Error(w, "name and spec are required", http.StatusBadRequest)
		return
	}

	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	t, err := repo.UpdateTheme(id, dto.Name, dto.Description, dto.Spec)
	if err != nil {
		log.Println("UpdateTheme error:", err)
		http.Error(w, "theme not found", http.StatusNotFound)
		return
	}
	writeJSON(w, storedThemeFromModel(*t))
}

// DeleteThemeHandler removes a global theme; its assignments cascade-delete so
// any pages pointing at it fall back to the default. MANAGE_THEMES-gated.
func DeleteThemeHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if err := repo.DeleteTheme(id); err != nil {
		log.Println("DeleteTheme error:", err)
		http.Error(w, "theme not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// assignDTO is a single scope -> theme binding. `theme_id` empty means
// UN-assign the scope (so the resolver falls back to area default / default).
type assignDTO struct {
	Scope   string `json:"scope"`
	ThemeID string `json:"theme_id"`
}

// AssignThemeHandler upserts one binding (MANAGE_THEMES-gated). Empty
// theme_id removes the binding, matching the frontend's toggle semantics.
func AssignThemeHandler(w http.ResponseWriter, r *http.Request) {
	var dto assignDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Scope == "" {
		http.Error(w, "scope is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if dto.ThemeID == "" {
		if err := repo.UnassignTheme(dto.Scope); err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
	} else {
		if err := repo.AssignTheme(dto.Scope, dto.ThemeID); err != nil {
			log.Println("AssignTheme error:", err)
			http.Error(w, "invalid theme_id or scope", http.StatusBadRequest)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// DownloadThemeHandler returns a theme as a downloadable JSON file.
func DownloadThemeHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	t, err := repo.GetTheme(id)
	if err != nil || t == nil {
		http.Error(w, "theme not found", http.StatusNotFound)
		return
	}

	exportData := map[string]any{
		"id":          t.ID,
		"name":        t.Name,
		"description": t.Description,
		"builtin":     t.Builtin,
		"spec":        t.Spec,
	}

	jsonData, err := json.MarshalIndent(exportData, "", "  ")
	if err != nil {
		http.Error(w, "failed to serialize theme", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.json\"", t.Name))
	w.Write(jsonData)
}

// CreateThemeHandler handles both JSON and multipart/form-data for theme creation.
func CreateThemeHandler(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/") {
		handleThemeFileUpload(w, r)
		return
	}
	// JSON body - existing behavior (delegated to createThemeFromJSON)
	createThemeFromJSON(w, r)
}

func handleThemeFileUpload(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
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
	rawManifest, err := io.ReadAll(io.LimitReader(file, 8<<20+1))
	if err != nil {
		http.Error(w, "read manifest file: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(rawManifest) > 8<<20 {
		http.Error(w, "manifest file too large (max 8 MiB)", http.StatusRequestEntityTooLarge)
		return
	}

	var manifest map[string]any
	if err := json.Unmarshal(rawManifest, &manifest); err != nil {
		http.Error(w, "manifest file is not valid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	id := getString(manifest, "id")
	name := getString(manifest, "name")
	description := getString(manifest, "description")
	specRaw, ok := manifest["spec"]
	if !ok || specRaw == nil {
		http.Error(w, "spec is required", http.StatusBadRequest)
		return
	}
	specBytes, err := json.Marshal(specRaw)
	if err != nil {
		http.Error(w, "spec must be valid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if id == "" || name == "" || len(specBytes) == 0 {
		http.Error(w, "id, name and spec are required", http.StatusBadRequest)
		return
	}

	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	t, err := repo.CreateTheme(repository.UpsertThemeInput{
		ID:          id,
		Name:        name,
		Description: description,
		Spec:        specBytes,
		Builtin:     false,
		CreatedBy:   uid,
	})
	if err != nil {
		log.Println("CreateTheme from file error:", err)
		http.Error(w, "theme id already exists", http.StatusConflict)
		return
	}
	writeJSONStatus(w, http.StatusCreated, storedThemeFromModel(*t))
}

// InstallThemeFromURLHandler fetches a theme manifest from the supplied URL,
// parses it, and inserts it. SSRF-guarded (only public IPs, DNS-pinned, size/time capped).
func InstallThemeFromURLHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var dto struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}

	rawManifest, ferr := fetchThemeManifestFromURL(r.Context(), dto.URL)
	if ferr != nil {
		var ue *themeAllowedURLError
		if errors.As(ferr, &ue) {
			http.Error(w, ue.reason, ue.status)
			return
		}
		log.Println("InstallThemeFromURL fetch error:", ferr)
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}

	var manifest map[string]any
	if err := json.Unmarshal(rawManifest, &manifest); err != nil {
		http.Error(w, "manifest from URL is invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	id := getString(manifest, "id")
	name := getString(manifest, "name")
	description := getString(manifest, "description")
	specRaw, ok := manifest["spec"]
	if !ok || specRaw == nil {
		http.Error(w, "spec is required", http.StatusBadRequest)
		return
	}
	specBytes, err := json.Marshal(specRaw)
	if err != nil {
		http.Error(w, "spec must be valid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if id == "" || name == "" || len(specBytes) == 0 {
		http.Error(w, "id, name and spec are required", http.StatusBadRequest)
		return
	}

	repo, closeFn := openThemeRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	t, err := repo.CreateTheme(repository.UpsertThemeInput{
		ID:          id,
		Name:        name,
		Description: description,
		Spec:        specBytes,
		Builtin:     false,
		CreatedBy:   uid,
	})
	if err != nil {
		log.Println("CreateTheme from URL error:", err)
		http.Error(w, "theme id already exists", http.StatusConflict)
		return
	}
	writeJSONStatus(w, http.StatusCreated, storedThemeFromModel(*t))
}

// URL fetch infrastructure (theme-specific to avoid conflicts with other handlers)
const (
	themeURLFetchMaxBytes  = 8 << 20 // 8 MiB
	themeURLFetchTimeout   = 15 * time.Second
	themeURLFetchDNSTimeout = 5 * time.Second
)

type themeAllowedURLError struct {
	status int
	reason string
}

func (e *themeAllowedURLError) Error() string { return e.reason }

func fetchThemeManifestFromURL(ctx context.Context, raw string) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, &themeAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, &themeAllowedURLError{http.StatusBadRequest, "URL must use http or https"}
	}
	if u.Host == "" {
		return nil, &themeAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	host := u.Hostname()
	if host == "" {
		return nil, &themeAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, themeURLFetchDNSTimeout)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return nil, &themeAllowedURLError{http.StatusBadGateway, "could not resolve host: " + host}
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !themeIsPublicIP(ip) {
			return nil, &themeAllowedURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host %s resolves to a non-public address (%s); only public hosts are allowed",
					host, host, ip.String()),
			}
		}
	}

	dialCtx, cancelDial := context.WithTimeout(ctx, themeURLFetchTimeout)
	defer cancelDial()

	port := themePortFromHost(u.Host, u.Scheme)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: themeURLFetchTimeout,
		TLSHandshakeTimeout:   themeURLFetchTimeout,
		IdleConnTimeout:       themeURLFetchTimeout,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: themeURLFetchTimeout}).DialContext(ctx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			return nil, lastErr
		},
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{Transport: transport, Timeout: themeURLFetchTimeout}
	req, err := http.NewRequestWithContext(dialCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, &themeAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	req.Header.Set("User-Agent", "kspanel-theme-installer/1.0")
	req.Header.Set("Accept", "application/json, text/plain;q=0.9, */*;q=0.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, &themeAllowedURLError{http.StatusBadGateway, "fetch failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &themeAllowedURLError{
			http.StatusBadGateway,
			fmt.Sprintf("origin returned HTTP %d for %s", resp.StatusCode, u.String()),
		}
	}
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") &&
		!strings.HasPrefix(ct, "text/") && !strings.HasPrefix(ct, "application/octet-stream") {
		return nil, &themeAllowedURLError{
			http.StatusUnsupportedMediaType,
			fmt.Sprintf("origin returned unsupported content type %q", ct),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, themeURLFetchMaxBytes+1))
	if err != nil {
		return nil, &themeAllowedURLError{http.StatusBadGateway, "read body: " + err.Error()}
	}
	if len(body) > themeURLFetchMaxBytes {
		return nil, &themeAllowedURLError{
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("manifest exceeded %d bytes", themeURLFetchMaxBytes),
		}
	}
	return body, nil
}

func themeIsPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if ip.IsPrivate() {
		return false
	}
	return true
}

func themePortFromHost(hostport, scheme string) string {
	if _, port, err := net.SplitHostPort(hostport); err == nil && port != "" {
		return port
	}
	switch strings.ToLower(scheme) {
	case "http":
		return "80"
	default:
		return "443"
	}
}
