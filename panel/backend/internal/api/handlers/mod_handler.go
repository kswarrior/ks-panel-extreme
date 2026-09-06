package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/modengine"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// modResponse is the JSON shape the frontend consumes for one mod. It carries
// the requested-capability rows (each with its grant state) so the activation
// modal can render the "you must approve N permissions" checklist in one
// round-trip instead of calling a second endpoint.
type modResponse struct {
	ID            int64           `json:"id"`
	Name          string          `json:"name"`
	Slug          string          `json:"slug"`
	Version       string          `json:"version"`
	Description   string          `json:"description"`
	Manifest      json.RawMessage `json:"manifest"`
	Spec          json.RawMessage `json:"spec,omitempty"`
	Active        bool            `json:"active"`
	EngineVersion int             `json:"engine_version"`
	OwnerName     string          `json:"owner_name,omitempty"`
	// Source records how the mod was installed ("file" | "url" | "studio" |
	// "json"); SourceURL is only populated when source == "url". Surfaced on
	// the card chip + the install modal so the admin knows the origin.
	Source    string `json:"source"`
	SourceURL string `json:"source_url,omitempty"`
	// PackageSize is the byte size of the on-disk .kspm zip (0 == none, the
	// download handler synthesises a minimal .kspm from the manifest+spec).
	// Surfaced on the card so the admin sees "package: N KB".
	PackageSize int64               `json:"package_size"`
	Permissions []modPermissionView `json:"permissions"`
	Pending     int                 `json:"pending"` // count of caps not yet approved
	CreatedAt   string              `json:"created_at"`
	UpdatedAt   string              `json:"updated_at"`
}

type modPermissionView struct {
	ID          int64  `json:"id"`
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
	Granted     bool   `json:"granted"`
}

func openModRepo() (*repository.ModRepository, func()) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, func() {}
	}
	return repository.NewModRepository(con), func() { _ = con.Close() }
}

func toModResponse(repo *repository.ModRepository, mod *models.Mod) modResponse {
	ev := mod.EngineVersion
	if ev == 0 {
		ev = 1
	}
	source := mod.Source
	if source == "" {
		source = models.ModSourceFile
	}
	resp := modResponse{
		ID:            mod.ID,
		Name:          mod.Name,
		Slug:          mod.Slug,
		Version:       mod.Version,
		Description:   mod.Description,
		Manifest:      mod.Manifest,
		Spec:          mod.Spec,
		Active:        mod.Active,
		EngineVersion: ev,
		OwnerName:     mod.OwnerName,
		Source:        source,
		SourceURL:     mod.SourceURL,
		PackageSize:   mod.PackageSize,
		CreatedAt:     isoString(mod.CreatedAt),
		UpdatedAt:     isoString(mod.UpdatedAt),
	}
	perms, _ := repo.ListModPermissions(mod.ID)
	pending := 0
	out := make([]modPermissionView, 0, len(perms))
	for _, p := range perms {
		out = append(out, modPermissionView{
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

// ListModsHandler returns every mod (active + inactive) with its requested
// permissions and grant state. MANAGE_MODS-gated by the router.
// Ownership scope (migration 054): MODS_OWN → only mods the caller uploaded;
// MODS_ALL / MANAGE_MODS umbrella → full catalog.
func ListModsHandler(w http.ResponseWriter, r *http.Request) {
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	mods, err := repo.ListMods()
	if err != nil {
		log.Println("ListMods error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	out := make([]modResponse, 0, len(mods))
	// Pre-fetch per-mod permissions; the repo holds one connection (SetMaxOpenConns(1))
	// so we resolve them sequentially rather than racing goroutines.
	// Ownership scope (migration 054): own-scope callers only see mods they own.
	var scopeOwn map[int]bool
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if con, err := repository.OpenDB(); err == nil {
			chk := permissions.NewChecker(con)
			hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
			con.Close()
			if !hasAll && hasOwn {
				scopeOwn = make(map[int]bool)
				for i := range mods {
					if mods[i].OwnerID != uid {
						scopeOwn[i] = true
					}
				}
			}
		}
	}
	for i := range mods {
		if scopeOwn != nil && scopeOwn[i] {
			continue
		}
		out = append(out, toModResponse(repo, &mods[i]))
	}
	writeJSON(w, out)
}

// GetModHandler returns a single mod with its full permission checklist. Used
// when the admin opens a mod card / activation modal.
func GetModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, err := repo.GetMod(id)
	if err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("GetMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): own-scope callers may only read mods
	// they uploaded. Orphans (OwnerID==0) require ALL (fail closed, mirrors
	// Update/Delete/template Download).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if mod != nil && mod.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only read mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	writeJSON(w, toModResponse(repo, mod))
}

// modUpsertDTO is the JSON body the frontend sends when it creates/updates a
// mod through the form (as opposed to uploading a .ksmod file). It mirrors the
// manifest shape directly so the admin can hand-author a mod without a file.
type modUpsertDTO struct {
	Name                 string                     `json:"name"`
	Slug                 string                     `json:"slug"`
	Version              string                     `json:"version"`
	Description          string                     `json:"description"`
	Spec                 json.RawMessage            `json:"spec"`
	PermissionsRequested []repository.PermissionReq `json:"permissionsRequested"`
}

// CreateModHandler installs a mod package (.kspm zip) or, for the Studio / URL
// / JSON paths, a bare manifest that the panel wraps into a .kspm on disk so
// every mod is downloadable. Accepted content types:
//
//   - application/json: the body is the v1/v2 mod manifest DTO directly (the
//     Studio + the install-from-JSON paths). The panel synthesises a minimal
//     .kspm (manifest.json + spec.json) and stores it.
//   - multipart/form-data: a "package" file part holding the .kspm zip the
//     admin picked in the Upload button. The zip must carry a manifest.json
//     (or *.ksmod) at its root; an optional spec.json overrides the manifest's
//     embedded spec. Everything else in the zip (backend/JS, frontend bundles,
//     pages/) is extracted to the mod's workdir on activation.
//
// Either way the manifest is parsed through ParseManifest so the requested
// capabilities are validated against the well-known set, the resulting
// mod_permissions rows start granted = false, and the .kspm package is
// persisted on disk under <datadir>/mod-packages/<slug>.kspm before the row is
// committed visible. Returns 201 with the new mod.
func CreateModHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var rawManifest []byte
	var specOverride []byte
	// packageBytes is the .kspm zip to persist on disk. For the multipart paths
	// it's the uploaded zip verbatim; for the JSON/Studio/URL paths it's
	// synthesised from the manifest+spec so every mod is downloadable.
	packageBytes := []byte{}
	// source tags the install provenance so the mod card + audit timeline can
	// show where the package came from. JSON bodies default to "json"; multipart
	// file uploads are "file"; the Studio path (POSTed as JSON but authored
	// in-browser) overrides this to "studio" via the X-KS-Source header.
	source := models.ModSourceJSON
	if hs := strings.TrimSpace(r.Header.Get("X-KS-Source")); hs != "" {
		switch strings.ToLower(hs) {
		case models.ModSourceFile, models.ModSourceURL, models.ModSourceStudio, models.ModSourceJSON:
			source = strings.ToLower(hs)
		}
	}

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/json") {
		rawManifest, err = io.ReadAll(io.LimitReader(r.Body, 8<<20)) // 8 MiB manifest cap
		if err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else if strings.HasPrefix(ct, "multipart/") {
		// Mods install ONLY from a .kspm zip now — the bare .ksmod/.json manifest
		// upload was removed in favour of bundling pages/code/frontend/backend
		// assets into one package. The Studio + JSON paths still exist for
		// authoring without a zip; the panel wraps their manifest into a .kspm.
		source = models.ModSourceFile // multipart always wins (a file was uploaded)
		// Cap the whole body at modPackageMaxBytes so an oversized upload can't
		// pin the goroutine. ParseMultipartForm spills to a temp file past the
		// memory threshold, so the 8 MiB in-memory cap is the threshold, not max.
		r.Body = http.MaxBytesReader(w, r.Body, modPackageMaxBytes+1024)
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
			return
		}
		file, _, ferr := r.FormFile("package")
		if ferr != nil {
			http.Error(w, `missing 'package' file part — mods install from a .kspm zip. Upload a package.`,
				http.StatusBadRequest)
			return
		}
		defer file.Close()
		zipBytes, rerr := io.ReadAll(io.LimitReader(file, modPackageMaxBytes+1))
		if rerr != nil {
			http.Error(w, "read package: "+rerr.Error(), http.StatusBadRequest)
			return
		}
		if int64(len(zipBytes)) > modPackageMaxBytes {
			http.Error(w, fmt.Sprintf("package too large (max %d MiB)", modPackageMaxBytes>>20),
				http.StatusRequestEntityTooLarge)
			return
		}
		if !modengine.IsZipBytes(zipBytes) {
			http.Error(w, "package is not a valid .kspm zip (missing zip header)", http.StatusBadRequest)
			return
		}
		rawManifest, specOverride, err = modengine.ReadManifestFromZip(zipBytes)
		if err != nil {
			http.Error(w, "read package: "+err.Error(), http.StatusBadRequest)
			return
		}
		packageBytes = zipBytes
	} else {
		http.Error(w, "unsupported content type; use application/json or multipart/form-data", http.StatusUnsupportedMediaType)
		return
	}

	in, err := repository.ParseManifest(rawManifest)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(specOverride) > 0 {
		in.Spec = specOverride
	}

	// For the JSON / Studio / URL-no-zip paths we synthesise a .kspm so the mod
	// is downloadable and the v2 engine's file-based backendScript resolution
	// has a consistent workdir story. The uploaded-zip path already has bytes.
	if len(packageBytes) == 0 {
		b, berr := modengine.BuildPackageZip(rawManifest, in.Spec, nil)
		if berr != nil {
			http.Error(w, "build package: "+berr.Error(), http.StatusInternalServerError)
			return
		}
		packageBytes = b
	}

	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	mod, err := repo.CreateMod(repository.CreateModInput{
		Name:                 in.Name,
		Slug:                 in.Slug,
		Version:              in.Version,
		Description:          in.Description,
		Manifest:             rawManifest,
		Spec:                 in.Spec,
		PermissionsRequested: in.PermissionsRequested,
		UploadedBy:           uid,
		Source:               source,
		PackageSize:          int64(len(packageBytes)),
	})
	if err != nil {
		log.Println("CreateMod error:", err)
		// Duplicate slug -> UNIQUE violation; report a friendly 409.
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a mod with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Persist the .kspm zip on disk so the download + activation paths resolve
	// it. A failure here leaves an installable row with package_size set but no
	// backing file: the download handler synthesises on demand and the v2 engine
	// degrades to manifest-only. We log rather than roll back so a flaky disk
	// doesn't strand the (already-inserted) mod the admin just uploaded.
	if err := modengine.SavePackage(in.Slug, packageBytes); err != nil {
		log.Printf("CreateMod: save .kspm for %q: %v", in.Slug, err)
	}

	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "create",
		TargetLabel: in.Name,
		Message:     fmt.Sprintf("uploaded mod %q (slug=%s, source=%s, %d permission requests, %.1f KiB package)", in.Name, in.Slug, source, len(in.PermissionsRequested), float64(len(packageBytes))/1024.0),
	})
	writeJSONStatus(w, http.StatusCreated, toModResponse(repo, mod))
}

// installFromURLDTO is the JSON body the Mods page sends to
// POST /api/mods/url. `url` is the manifest URL the panel should fetch;
// the response shape mirrors the standard create handler so the SPA can reuse
// the same install flow.
type installFromURLDTO struct {
	URL string `json:"url"`
}

// urlFetchCaps limit how large and how long a URL fetch may take so a hostile
// or slow origin can't pin a request goroutine.
const (
	// modPackageMaxBytes caps an uploaded .kspm zip (and a URL-fetched zip) so a
	// mod shipping frontend/backend/page bundles can't balloon without bound.
	// 64 MiB is generous enough for bundles while staying well inside the
	// multipart streaming path. Keep in sync with the frontend upload picker.
	modPackageMaxBytes    = 64 << 20
	modURLFetchMaxBytes   = modPackageMaxBytes
	modURLFetchTimeout    = 15 * time.Second
	modURLFetchDNSTimeout = 5 * time.Second
)

// allowedURLError is returned for every category of failure the URL fetcher
// classifies; we wrap it through fmt.Errorf so the handler can return a clear
// 400/502/504 with a useful message instead of the raw Go error.
type allowedURLError struct {
	status int
	reason string
}

func (e *allowedURLError) Error() string { return e.reason }

// fetchManifestFromURL performs a hardened GET against `raw` and returns the
// response body. It enforces:
//
//   - scheme must be http(s)
//   - host must resolve to a public IP (loopback / private / link-local /
//     unspecified / multicast ranges are rejected, including IPv6 equivalents)
//   - DNS + TCP + TLS + read deadline capped so a slow / hostile origin
//     cannot stall the request
//   - response body size-capped at modURLFetchMaxBytes
//
// The DNS lookup runs once up-front; the resolved IPs are then dialed directly
// so a DNS-rebinding attacker can't flip the answer between the validation
// lookup and the connection. Returns *allowedURLError for the user-visible
// failures so the handler can pick a status code without parsing strings.
func fetchManifestFromURL(ctx context.Context, raw string) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, &allowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, &allowedURLError{http.StatusBadRequest, "URL must use http or https"}
	}
	if u.Host == "" {
		return nil, &allowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	// Resolve the host up-front so we can validate every IP it points at
	// (and dial the IPs directly) — closing the DNS-rebinding gap.
	host := u.Hostname()
	if host == "" {
		return nil, &allowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, modURLFetchDNSTimeout)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return nil, &allowedURLError{http.StatusBadGateway, "could not resolve host: " + host}
	}
	for _, ipa := range ips {
		ip := ipa.IP
		if ip == nil {
			return nil, &allowedURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host %s resolved to a nil address", host, host),
			}
		}
		if !isPublicIP(ip) {
			return nil, &allowedURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host %s resolves to a non-public address (%s); only public hosts are allowed",
					host, host, ip.String()),
			}
		}
	}

	// Build a Client with explicit timeouts and a Dialer pinned to the
	// resolved IPs so a follow-up DNS answer can't redirect the connection.
	dialCtx, cancelDial := context.WithTimeout(ctx, modURLFetchTimeout)
	defer cancelDial()

	port := portFromHost(u.Host, u.Scheme)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: modURLFetchTimeout,
		TLSHandshakeTimeout:   modURLFetchTimeout,
		IdleConnTimeout:       modURLFetchTimeout,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: modURLFetchTimeout}).DialContext(ctx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			return nil, lastErr
		},
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{Transport: transport, Timeout: modURLFetchTimeout}
	req, err := http.NewRequestWithContext(dialCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, &allowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	req.Header.Set("User-Agent", "kspanel-mod-installer/1.0")
	req.Header.Set("Accept", "application/json, text/plain;q=0.9, */*;q=0.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, &allowedURLError{http.StatusBadGateway, "fetch failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &allowedURLError{
			http.StatusBadGateway,
			fmt.Sprintf("origin returned HTTP %d for %s", resp.StatusCode, u.String()),
		}
	}
	// We accept text-ish content types (raw manifests) AND zip content types
	// (.kspm packages). The downstream ParseManifest / ReadManifestFromZip
	// calls reject anything that isn't valid JSON or a valid zip regardless,
	// so we whitelist broadly by prefix and let the sniff (IsZipBytes) decide.
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") &&
		!strings.HasPrefix(ct, "text/") && !strings.HasPrefix(ct, "application/octet-stream") &&
		!strings.HasPrefix(ct, "application/zip") && !strings.HasPrefix(ct, "application/x-zip-compressed") {
		return nil, &allowedURLError{
			http.StatusUnsupportedMediaType,
			fmt.Sprintf("origin returned unsupported content type %q", ct),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, modURLFetchMaxBytes+1))
	if err != nil {
		return nil, &allowedURLError{http.StatusBadGateway, "read body: " + err.Error()}
	}
	if len(body) > modURLFetchMaxBytes {
		return nil, &allowedURLError{
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("manifest exceeded %d bytes", modURLFetchMaxBytes),
		}
	}
	return body, nil
}

// isPublicIP reports whether ip is routable on the public internet. We
// reject loopback, private (RFC1918 / ULA), link-local, multicast and
// unspecified ranges so a URL like http://127.0.0.1:5050/api/... can't be
// coerced into talking to internal panel endpoints.
func isPublicIP(ip net.IP) bool {
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

// portFromHost extracts the port from a host:port string, defaulting to 443
// for https URLs (which omit the port) and 80 for http. url.Parse stores the
// host as "[::1]:8080" for IPv6 literals; net.SplitHostPort handles both.
//
// The scheme argument is required (not optional): every call site already has
// the parsed *url.URL handy, and inferring the scheme from the host is
// impossible — bare hostnames are valid for both schemes.
func portFromHost(hostport, scheme string) string {
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

// InstallModFromURLHandler fetches a mod manifest from the supplied URL,
// parses it through the same path CreateModHandler uses, and inserts it
// (inactive, pending admin approval). The fetched URL is recorded on the
// row so the audit timeline + card chip show the install provenance. Gated
// by MODS_CREATE in the route table.
func InstallModFromURLHandler(w http.ResponseWriter, r *http.Request) {
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

	// The URL may point at either a .kspm zip package OR a bare manifest JSON,
	// so we sniff the response. A bit-stream that isn't a zip is parsed as a raw
	// manifest and the panel synthesises a minimal .kspm around it (so the mod
	// is still downloadable and the engine workdir story stays consistent).
	fetched, ferr := fetchManifestFromURL(r.Context(), dto.URL)
	if ferr != nil {
		var ue *allowedURLError
		if errors.As(ferr, &ue) {
			http.Error(w, ue.reason, ue.status)
			return
		}
		log.Println("InstallModFromURL fetch error:", ferr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "fetch failed",
		})
		return
	}

	var rawManifest, specOverride, packageBytes []byte
	if modengine.IsZipBytes(fetched) {
		var zerr error
		rawManifest, specOverride, zerr = modengine.ReadManifestFromZip(fetched)
		if zerr != nil {
			http.Error(w, "package from URL is invalid: "+zerr.Error(), http.StatusBadRequest)
			return
		}
		packageBytes = fetched
	} else {
		rawManifest = fetched
	}

	in, err := repository.ParseManifest(rawManifest)
	if err != nil {
		http.Error(w, "manifest from URL is invalid: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(specOverride) > 0 {
		in.Spec = specOverride
	}
	if len(packageBytes) == 0 {
		b, berr := modengine.BuildPackageZip(rawManifest, in.Spec, nil)
		if berr != nil {
			http.Error(w, "build package: "+berr.Error(), http.StatusInternalServerError)
			return
		}
		packageBytes = b
	}

	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, err := repo.CreateMod(repository.CreateModInput{
		Name:                 in.Name,
		Slug:                 in.Slug,
		Version:              in.Version,
		Description:          in.Description,
		Manifest:             rawManifest,
		Spec:                 in.Spec,
		PermissionsRequested: in.PermissionsRequested,
		UploadedBy:           uid,
		Source:               models.ModSourceURL,
		SourceURL:            dto.URL,
		PackageSize:          int64(len(packageBytes)),
	})
	if err != nil {
		log.Println("InstallModFromURL CreateMod error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a mod with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := modengine.SavePackage(in.Slug, packageBytes); err != nil {
		log.Printf("InstallModFromURL: save .kspm for %q: %v", in.Slug, err)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "create",
		TargetLabel: in.Name,
		Message: fmt.Sprintf("installed mod %q from URL %s (slug=%s, %d permission requests, %.1f KiB package)",
			in.Name, dto.URL, in.Slug, len(in.PermissionsRequested), float64(len(packageBytes))/1024.0),
	})
	writeJSONStatus(w, http.StatusCreated, toModResponse(repo, mod))
}

// UpdateModHandler overwrites the editable fields (name/version/description/
// spec). The requested-permission set is NOT mutable here — re-declaring
// capabilities is a re-upload, otherwise the grant contract would silently
// change under the admin.
func UpdateModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto modUpsertDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if dto.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	// Ownership scope (migration 054): own-scope callers may only edit mods
	// they uploaded. Orphans (OwnerID==0) require ALL (fail closed, mirrors
	// theme/template handlers and the List filter).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetMod(id); gerr == nil && ex != nil && ex.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only edit mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	mod, err := repo.UpdateMod(id, repository.UpdateModInput{
		Name:        dto.Name,
		Version:     dto.Version,
		Description: dto.Description,
		Spec:        dto.Spec,
	})
	if err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("UpdateMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("edited mod %q", dto.Name),
	})
	writeJSON(w, toModResponse(repo, mod))
}

// DeleteModHandler removes a mod and (via FK cascade) its permission rows.
func DeleteModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	// Ownership scope (migration 054): own-scope callers may only delete mods
	// they uploaded. Orphans (OwnerID==0) require ALL (fail closed, mirrors
	// theme/template handlers and the List filter).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetMod(id); gerr == nil && ex != nil && ex.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only delete mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	// Capture the label AND slug up front so the audit row survives the
	// delete and the engine teardown has a stable identity. Without the
	// slug we leak the mod's Goja runtime + bus subscriptions until the
	// panel restarts (Deactivate on an unknown slug is a no-op).
	label := ""
	slug := ""
	if m, gerr := repo.GetMod(id); gerr == nil && m != nil {
		label = m.Name
		slug = m.Slug
	}
	// Tear the VM down BEFORE deleting the row so the engine can't observe
	// a half-deleted mod (the row is gone but slots are still advertised).
	// Deactivate is idempotent and a no-op when the slug was never booted.
	if slug != "" {
		modengine.Default().Deactivate(slug)
		modengine.Default().ForgetMod(slug) // drop statuses + log ring too
	}
	if err := repo.DeleteMod(id); err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("DeleteMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Drop the on-disk .kspm package + extracted workdir so a deleted mod
	// doesn't leak its bundle bytes. Best-effort: a failure here (e.g. a
	// read-only mod-packages dir) is logged but doesn't fail the delete —
	// the row + permission rows are already gone via the FK cascade.
	if slug != "" {
		if perr := modengine.RemovePackage(slug); perr != nil {
			log.Printf("DeleteMod: remove .kspm for %q: %v", slug, perr)
		}
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted mod %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// grantDecisionDTO is the body of the grant-set endpoint. The admin picks
// which requested capabilities to approve; an empty list means "deny all"
// (every requested cap is reset to pending) which effectively blocks
// activation.
type grantDecisionDTO struct {
	Grants []repository.GrantDecision `json:"grants"`
}

// SetModGrantsHandler records the admin's per-capability approval decision.
// Only capabilities the mod actually requested are stored (SetGrants skips
// unknown ones). This is the explicit "admin decide that they give this mod
// that permissions" step described by the requirement; nothing activates
// automatically — activation is a separate call guarded by AllGranted.
func SetModGrantsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var dto grantDecisionDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if _, gerr := repo.GetMod(id); gerr != nil {
		if errors.Is(gerr, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("SetModGrants GetMod error:", gerr)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): own-scope callers may only approve
	// capabilities on mods they uploaded. Orphans (OwnerID==0) require ALL
	// (fail closed, mirrors Update/Delete).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetMod(id); gerr == nil && ex != nil && ex.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only approve mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
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
		Category: models.ActivityCategoryMod,
		Action:   "grant",
		TargetID: &id,
		Message:  fmt.Sprintf("approved %d permission request(s) for mod #%d", grantedCount, id),
	})
	w.WriteHeader(http.StatusNoContent)
}

// ActivateModHandler flips a mod's active flag to 1, but ONLY after AllGranted
// passes (every requested capability has been explicitly approved). On the
// pending case it returns 409 with the checklist so the frontend can render
// "you still need to approve N permissions".
func ActivateModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	// Ownership scope (migration 054): own-scope callers may only activate
	// mods they uploaded. Orphans (OwnerID==0) require ALL (fail closed).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetMod(id); gerr == nil && ex != nil && ex.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only activate mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	// Kill switch first: refuse BEFORE flipping the DB flag so "active" rows
	// and running runtimes never disagree with the engine gate.
	if !modengine.Default().Enabled() {
		writeJSONStatus(w, http.StatusConflict, map[string]any{
			"error":   "engine disabled",
			"message": "The mod engine is disabled. Re-enable it before activating mods.",
		})
		return
	}
	if err := repo.Activate(id); err != nil {
		if errors.Is(err, repository.ErrPermissionsNotGranted) {
			// Re-fetch the checklist so the client can surface what's still
			// outstanding instead of guessing.
			mod, gerr := repo.GetMod(id)
			if gerr != nil {
				http.Error(w, "mod not found", http.StatusNotFound)
				return
			}
			resp := toModResponse(repo, mod)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":       "permissions pending",
				"message":     fmt.Sprintf("This mod needs %d more permission(s) approved before it can be activated.", resp.Pending),
				"pending":     resp.Pending,
				"permissions": resp.Permissions,
			})
			return
		}
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("ActivateMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryMod,
		Action:   "activate",
		TargetID: &id,
		Message:  fmt.Sprintf("activated mod #%d", id),
	})

	// Spin the mod's Goja runtime up so its hooks + slots take effect
	// immediately. A boot failure is logged by the engine but MUST NOT fail
	// the activate: the DB already says active=1, so we keep the success
	// status and let the admin see "registered but not running" via the slot
	// response's runtime mode. This honours Error Isolation — a single
	// crashing script never rolls back the admin's activation.
	//
	// Use a fresh background context, NOT r.Context(): r.Context() is
	// cancelled the moment the HTTP response is written, and the engine
	// wraps every installed hook in context.WithTimeout(ctx, …). Using the
	// request context here would cancel every hook the activation just
	// installed before the next request arrives.
	if mod, gerr := repo.GetMod(id); gerr == nil && mod != nil {
		if err := modengine.Default().Activate(context.Background(), mod); err != nil {
			log.Printf("[modengine] activate runtime for mod %q: %v", mod.Slug, err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeactivateModHandler flips a mod back to inactive without clearing the
// grant rows so it can be re-activated later without re-approval.
func DeactivateModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	// Ownership scope (migration 054): own-scope callers may only deactivate
	// mods they uploaded. Orphans (OwnerID==0) require ALL (fail closed).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if ex, gerr := repo.GetMod(id); gerr == nil && ex != nil && ex.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only deactivate mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	// Capture the slug BEFORE the row could be touched so the engine teardown
	// has a stable identity even if the mod is concurrently edited.
	slug := ""
	if m, gerr := repo.GetMod(id); gerr == nil && m != nil {
		slug = m.Slug
	}
	dbErr := repo.Deactivate(id)
	// Tear the VM down: stop the runtime, uninstall hooks, drop slots. Safe to
	// call with a slug the engine never booted (v1 mod, or boot skipped) — the
	// engine treats unknown slugs as no-ops, mirroring the repo's idempotent
	// Deactivate contract. Run the teardown EVEN IF the DB deactivate failed:
	// a row that's gone (or concurrently deactivated) should still release
	// the engine's references.
	if slug != "" {
		modengine.Default().Deactivate(slug)
	}
	if dbErr != nil {
		if errors.Is(dbErr, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("DeactivateMod error:", dbErr)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryMod,
		Action:   "deactivate",
		TargetID: &id,
		Message:  fmt.Sprintf("deactivated mod #%d", id),
	})
	w.WriteHeader(http.StatusNoContent)
}

// slotsResponse is the shape the React slot loader fetches from
// /api/mods/v1/slots. `mode` tells the client whether active backend scripts
// execute ("goja") or are parked in manifest-only mode ("noop") so the UI can
// show a banner / disable slot interactions when no JS is running. `enabled`
// mirrors the engine kill switch (additive field; older clients ignore it).
type slotsResponse struct {
	Mode    string                     `json:"mode"` // "noop" | "goja"
	Enabled bool                       `json:"enabled"`
	Slots   []modengine.RegisteredSlot `json:"slots"` // every active mod's slots
}

// SlotsHandler serves the union of every active mod's declared UI slots, so the
// frontend <Slot /> can mount the right components at each layout injection
// point in one round-trip. The endpoint is read-only and panel-wide (not
// mod-scoped), so it lives under /api/mods/v1/slots rather than the per-mod
// admin collection.
func SlotsHandler(w http.ResponseWriter, r *http.Request) {
	eng := modengine.Default()
	writeJSON(w, slotsResponse{
		Mode:    eng.RunningMode(),
		Enabled: eng.Enabled(),
		Slots:   eng.ActiveSlots(),
	})
}

// ModEngineStatusHandler serves the engine diagnostics snapshot: runtime mode,
// kill-switch state, and one status row per tracked mod slug (running /
// error / stopped + last activation error). Gated like the rest of the mods
// collection (MODS_VIEW).
func ModEngineStatusHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, modengine.Default().Diagnostics())
}

// modEngineToggleDTO is the PUT /api/mods/engine body.
type modEngineToggleDTO struct {
	Enabled *bool `json:"enabled"`
}

// SetModEngineEnabledHandler flips the panel-wide mod engine kill switch.
// Disabling tears every running runtime down immediately; enabling only lifts
// the gate (mods must be re-activated explicitly). The desired state is
// persisted first so a crash between persist and apply converges on the next
// boot (Boot re-reads the setting). Edit-gated — it's a panel-wide control.
func SetModEngineEnabledHandler(w http.ResponseWriter, r *http.Request) {
	var dto modEngineToggleDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&dto); err != nil || dto.Enabled == nil {
		http.Error(w, `invalid payload: {"enabled": true|false} required`, http.StatusBadRequest)
		return
	}
	enabled := *dto.Enabled

	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	if err := repo.SetModsEnabled(enabled); err != nil {
		log.Println("SetModsEnabled error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Apply to the live engine AFTER the persist so the in-memory mirror can't
	// drift from the DB on a failed write.
	modengine.Default().SetEnabled(enabled)

	action := "enable"
	if !enabled {
		action = "disable"
	}
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryMod,
		Action:   action,
		Message:  fmt.Sprintf("%sd the mod engine (all runtimes stopped)", action),
	})
	writeJSON(w, map[string]any{"enabled": enabled, "mode": modengine.Default().RunningMode()})
}

// ModLogsHandler returns the bounded log ring for one mod, oldest line first.
// The ring captures ks.log output plus engine lifecycle events (activation,
// hook panics, timeouts) so the admin can debug a mod without SSH + log grep.
// View-gated; logs never contain secrets (scripts only see their own output).
func ModLogsHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, err := repo.GetMod(id)
	if err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("ModLogs GetMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): own-scope callers may only read logs
	// of mods they uploaded. Orphans (OwnerID==0) require ALL (fail closed).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if mod != nil && mod.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden: own-scope may only read mods you uploaded", http.StatusForbidden)
					return
				}
			}
		}
	}
	eng := modengine.Default()
	state := ""
	if st, ok := eng.ModStatus(mod.Slug); ok {
		state = st.State
	}
	writeJSON(w, map[string]any{
		"slug":      mod.Slug,
		"mode":      eng.RunningMode(),
		"state":     state,
		"log_count": len(eng.ModLogs(mod.Slug)),
		"logs":      eng.ModLogs(mod.Slug),
	})
}

// BootModEngine loads every active mod's runtime at panel startup. Call it once
// after migrations have run and the HTTP server is ready; it is idempotent and
// safe to invoke from the panel's launch path. A per-mod boot failure is
// logged by the engine and does not abort the panel, honouring the Error
// Isolation contract.
//
// The persisted kill switch is reconciled BEFORE boot: when the admin disabled
// the engine, no runtime starts (the DB may still hold active rows; they stay
// installed-but-parked until re-enabled and re-activated).
func BootModEngine(ctx context.Context) {
	if con, err := repository.OpenDB(); err == nil {
		enabled := repository.NewModRepository(con).ModsEnabled()
		_ = con.Close()
		modengine.Default().SetEnabled(enabled)
		if !enabled {
			log.Printf("[modengine] boot: engine disabled by settings, skipping mod start")
			return
		}
	} else {
		log.Printf("[modengine] boot: read kill switch: %v (defaulting to enabled)", err)
		modengine.Default().SetEnabled(true)
	}
	active, err := modengine.LoadActiveMods()
	if err != nil {
		log.Printf("[modengine] boot: load active mods: %v", err)
		return
	}
	modengine.Default().SetStartCtx(ctx)
	modengine.Default().Boot(ctx, active)
}

// DownloadModHandler streams the mod's .kspm package zip back to the admin. A
// mod that was installed from a .kspm zip serves the bytes verbatim; a mod
// installed via the Studio / URL / JSON path that never carried a zip is
// synthesised on the fly from the stored manifest + spec so every mod is still
// downloadable. The on-disk package is preferred because it carries the full
// bundle (frontend / backend / pages assets); the synthesised form is the
// manifest-only fallback. Gated by MODS_VIEW in the route table so a
// read-only admin can still grab a package.
func DownloadModHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()
	mod, err := repo.GetMod(id)
	if err != nil {
		if errors.Is(err, repository.ErrModNotFound) {
			http.Error(w, "mod not found", http.StatusNotFound)
			return
		}
		log.Println("DownloadMod GetMod error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): own-scope callers may only download
	// mods they uploaded. Orphans (OwnerID==0) require ALL (fail closed,
	// mirrors template/theme Download).
	if uid, _ := UserIDFromContext(r); uid != 0 {
		if mod != nil && mod.OwnerID != uid {
			if con, perr := repository.OpenDB(); perr == nil {
				chk := permissions.NewChecker(con)
				hasOwn, hasAll, _ := chk.HasScope(uid, permissions.ModsOwnKey, permissions.ModsAllKey, permissions.ManageModsKey)
				con.Close()
				if !hasAll && hasOwn {
					http.Error(w, "forbidden", http.StatusForbidden)
					return
				}
			}
		}
	}

	var body []byte
	if modengine.PackageExists(mod.Slug) {
		body, err = modengine.LoadPackage(mod.Slug)
		if err != nil {
			log.Printf("DownloadMod: load .kspm for %q: %v", mod.Slug, err)
			// fall through to synth path rather than 500 on a read hiccup
			body = nil
		}
	}
	if len(body) == 0 {
		body, err = modengine.BuildPackageZip(mod.Manifest, mod.Spec, nil)
		if err != nil {
			http.Error(w, "build package: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Always emit .kspm so downloads round-trip cleanly back through the upload
	// path. Slug is already file-system-safe, but guard against weird names by
	// stripping any path separators.
	safe := strings.Map(func(rn rune) rune {
		if rn == '/' || rn == '\\' || rn == ':' {
			return '-'
		}
		return rn
	}, mod.Slug)
	if safe == "" {
		safe = fmt.Sprintf("mod-%d", mod.ID)
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.kspm"`, safe))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	_, _ = w.Write(body)
}

// ModAssetHandler serves a single file from a mod's extracted .kspm workdir to
// the browser — the path backend / frontend bundle / multipage asset a mod's
// slots + spec.pages reference. Mounting happens under
// /api/mods/v1/assets/{slug}/{path...} so the slot loader can resolve a mod's
// JS bundle as <script src="/api/mods/v1/assets/<slug>/frontend/bundle.js">.
// Gated by ACCESS_ADMIN_PANEL because mod slots render inside the admin shell;
// an anonymous caller has nothing to load them into anyway. Path-traversal is
// guarded inside ReadAsset (the resolved path can't escape the mod workdir).
func ModAssetHandler(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, "missing slug", http.StatusBadRequest)
		return
	}
	rel := chi.URLParam(r, "*")
	if rel == "" {
		http.NotFound(w, r)
		return
	}
	// Ensure the workdir is present (extracts the .kspm if it isn't yet). A
	// Studio/JSON mod with no package has an empty workdir; missing assets 404.
	if _, err := modengine.EnsureWorkDirLocked(slug); err != nil {
		log.Printf("ModAsset: ensure workdir for %q: %v", slug, err)
	}
	body, err := modengine.ReadAsset(slug, rel)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ctype := mime.TypeByExtension(filepath.Ext(path.Base(rel)))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(body)
}
