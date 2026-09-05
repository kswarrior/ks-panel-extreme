package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ============================== TEMPLATES ==============================
//
// Templates are pure data — the panel validates the JSON blob is parseable,
// nothing more. The real interpretation happens in ksedge's matching driver.

type templateDTO struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Image       string `json:"image"`
	Spec        string `json:"spec"`
	// Display identity (migration 059): raw SVG markup for the tile
	// (same convention as instances) + #rrggbb accent colour. Both
	// optional — empty == driver default / theme default.
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

// validKinds is the set of ksedge drivers a template may target. Kept here
// (not in the repo) so a reject surfaces as a 400 before touching the DB.
var validKinds = map[string]bool{
	"docker":    true,
	"lxd":       true,
	"kvm":       true,
	"multipass": true,
}

// validInstallActions is the set of valid install action types.
var validInstallActions = map[string]bool{
	"shell": true, "download": true, "extract": true, "move": true,
	"write": true, "chmod": true, "mkdir": true, "git_clone": true,
	"pip_install": true, "npm_install": true, "http_check": true,
}

// validateTemplateSpec validates the structure of template spec fields.
func validateTemplateSpec(spec map[string]any) error {
	// Validate env[] if present
	if rawEnv, ok := spec["env"].([]any); ok {
		seenEnv := make(map[string]struct{}, len(rawEnv))
		for i, e := range rawEnv {
			m, ok := e.(map[string]any)
			if !ok {
				return fmt.Errorf("spec.env[%d] must be an object", i)
			}
			name := getString(m, "name")
			if name == "" {
				return fmt.Errorf("spec.env[%d]: name is required", i)
			}
			// Fail closed on variable names: the deploy path substitutes
			// {{NAME}} verbatim into shell steps and docker -e, so only
			// POSIX identifiers are accepted (mirrors isAppEnvName used by
			// the application run engine).
			if !isAppEnvName(name) {
				return fmt.Errorf("spec.env[%d]: name %q is not a valid POSIX identifier (A-Z, 0-9, _; must not start with a digit)", i, name)
			}
			if _, dup := seenEnv[name]; dup {
				return fmt.Errorf("spec.env[%d]: duplicate variable name %q", i, name)
			}
			seenEnv[name] = struct{}{}
			rule := getString(m, "rule")
			if rule != "" {
				if _, err := regexp.Compile(rule); err != nil {
					return fmt.Errorf("spec.env[%d]: rule must be valid regex: %w", i, err)
				}
			}
		}
	}

	// Validate install[] if present
	if rawInstall, ok := spec["install"].([]any); ok {
		for i, s := range rawInstall {
			m, ok := s.(map[string]any)
			if !ok {
				return fmt.Errorf("spec.install[%d] must be an object", i)
			}
			action := strings.ToLower(strings.TrimSpace(getString(m, "action")))
			if action == "" {
				return fmt.Errorf("spec.install[%d]: action is required", i)
			}
			if !validInstallActions[action] {
				return fmt.Errorf("spec.install[%d]: unknown action %q", i, action)
			}
			// Action-specific required fields
			switch action {
			case "download":
				if getString(m, "url") == "" || getString(m, "filename") == "" {
					return fmt.Errorf("spec.install[%d]: download requires url and filename", i)
				}
			case "extract":
				if getString(m, "archive") == "" || getString(m, "dest") == "" {
					return fmt.Errorf("spec.install[%d]: extract requires archive and dest", i)
				}
			case "move":
				if getString(m, "from") == "" || getString(m, "to") == "" {
					return fmt.Errorf("spec.install[%d]: move requires from and to", i)
				}
			case "write":
				if getString(m, "path") == "" {
					return fmt.Errorf("spec.install[%d]: write requires path", i)
				}
			case "chmod":
				if getString(m, "path") == "" || getString(m, "command") == "" {
					return fmt.Errorf("spec.install[%d]: chmod requires path and command (mode)", i)
				}
			case "mkdir":
				if getString(m, "path") == "" {
					return fmt.Errorf("spec.install[%d]: mkdir requires path", i)
				}
			case "git_clone":
				if getString(m, "url") == "" || getString(m, "dest") == "" {
					return fmt.Errorf("spec.install[%d]: git_clone requires url and dest", i)
				}
			case "pip_install":
				if getString(m, "command") == "" {
					return fmt.Errorf("spec.install[%d]: pip_install requires command", i)
				}
			case "npm_install":
				// command is optional for npm_install
			case "http_check":
				if getString(m, "url") == "" {
					return fmt.Errorf("spec.install[%d]: http_check requires url", i)
				}
			case "shell":
				if getString(m, "command") == "" {
					return fmt.Errorf("spec.install[%d]: shell requires command", i)
				}
			}
		}
	}

	// Validate actions[] if present
	if rawActions, ok := spec["actions"].([]any); ok {
		seenAction := make(map[string]struct{}, len(rawActions))
		for i, a := range rawActions {
			m, ok := a.(map[string]any)
			if !ok {
				return fmt.Errorf("spec.actions[%d] must be an object", i)
			}
			id := getString(m, "id")
			if id == "" {
				return fmt.Errorf("spec.actions[%d]: id is required", i)
			}
			if _, dup := seenAction[id]; dup {
				return fmt.Errorf("spec.actions[%d]: duplicate action id %q", i, id)
			}
			seenAction[id] = struct{}{}
			name := getString(m, "name")
			if name == "" {
				return fmt.Errorf("spec.actions[%d]: name is required", i)
			}
			stopMode := getString(m, "stop_mode")
			if stopMode != "" && stopMode != "same" && stopMode != "different" {
				return fmt.Errorf("spec.actions[%d]: stop_mode must be 'same' or 'different'", i)
			}
			if rawSteps, ok := m["steps"].([]any); ok {
				for j, step := range rawSteps {
					sm, ok := step.(map[string]any)
					if !ok {
						return fmt.Errorf("spec.actions[%d].steps[%d] must be an object", i, j)
					}
					stepAction := strings.ToLower(strings.TrimSpace(getString(sm, "action")))
					if stepAction == "" {
						return fmt.Errorf("spec.actions[%d].steps[%d]: action is required", i, j)
					}
					validAction := false
					for valid := range validInstallActions {
						if stepAction == valid {
							validAction = true
							break
						}
					}
					if !validAction {
						return fmt.Errorf("spec.actions[%d].steps[%d]: unknown action %q", i, j, stepAction)
					}
					// Same required-field contract as spec.install[] so an
					// invalid action step fails fast at template save time
					// instead of at runtime on the edge (which reports the
					// same messages from compileStep).
					switch stepAction {
					case "download":
						if getString(sm, "url") == "" || getString(sm, "filename") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: download requires url and filename", i, j)
						}
					case "extract":
						if getString(sm, "archive") == "" || getString(sm, "dest") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: extract requires archive and dest", i, j)
						}
					case "move":
						if getString(sm, "from") == "" || getString(sm, "to") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: move requires from and to", i, j)
						}
					case "write":
						if getString(sm, "path") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: write requires path", i, j)
						}
					case "chmod":
						if getString(sm, "path") == "" || getString(sm, "command") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: chmod requires path and command (mode)", i, j)
						}
					case "mkdir":
						if getString(sm, "path") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: mkdir requires path", i, j)
						}
					case "git_clone":
						if getString(sm, "url") == "" || getString(sm, "dest") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: git_clone requires url and dest", i, j)
						}
					case "pip_install":
						if getString(sm, "command") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: pip_install requires command", i, j)
						}
					case "npm_install":
						// command is optional for npm_install
					case "http_check":
						if getString(sm, "url") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: http_check requires url", i, j)
						}
					case "shell":
						if getString(sm, "command") == "" {
							return fmt.Errorf("spec.actions[%d].steps[%d]: shell requires command", i, j)
						}
					}
				}
			}
		}
	}

	return nil
}

func validateTemplate(req templateDTO) (string, error) {
	if strings.TrimSpace(req.Name) == "" {
		return "", errString("template name is required")
	}
	if !validKinds[req.Kind] {
		return "", errString("kind must be one of: docker, lxd, kvm, multipass")
	}
	if req.Icon != "" && len(req.Icon) > 16*1024 {
		return "", errString("icon too large (max 16KB)")
	}
	if req.Color != "" && !validNodeColorHex(strings.TrimSpace(req.Color)) {
		return "", errString("color must be a #rrggbb hex value")
	}
	spec := req.Spec
	if spec == "" {
		spec = "{}"
	}
	var specMap map[string]any
	if err := json.Unmarshal([]byte(spec), &specMap); err != nil {
		return "", errString("spec must be valid JSON: " + err.Error())
	}
	if err := validateTemplateSpec(specMap); err != nil {
		return "", errString("spec validation failed: " + err.Error())
	}
	return spec, nil
}

// ListTemplatesHandler returns every template for the admin UI.
func ListTemplatesHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	temps, err := repository.NewTemplateRepository(con).List()
	if err != nil {
		log.Println("ListTemplates error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Ownership scope (migration 054): TEMPLATES_OWN → only templates the
	// caller authored; TEMPLATES_ALL / MANAGE_TEMPLATES umbrella → full list.
	if uid, _ := UserIDFromContext(r); uid != 0 {
		checker := permissions.NewChecker(con)
		hasOwn, hasAll, _ := checker.HasScope(uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
		if !hasAll && hasOwn {
			filtered := make([]models.Template, 0, len(temps))
			for _, t := range temps {
				if t.OwnerID == uid {
					filtered = append(filtered, t)
				}
			}
			writeJSON(w, filtered)
			return
		}
	}
	writeJSON(w, temps)
}

// CreateTemplateHandler inserts a new template after validating kind + spec.
// Handles both application/json and multipart/form-data (file upload).
func CreateTemplateHandler(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/") {
		handleTemplateFileUpload(w, r)
		return
	}
	// JSON body - existing behavior
	var req templateDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	spec, err := validateTemplate(req)
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
	uid, _ := UserIDFromContext(r)
	id, err := repository.NewTemplateRepository(con).Create(repository.TemplateInput{
		Name: req.Name, Description: req.Description, Kind: req.Kind, Image: req.Image, Spec: spec,
		Icon: strings.TrimSpace(req.Icon), Color: strings.ToUpper(strings.TrimSpace(req.Color)),
		OwnerID: uid,
	})
	if err != nil {
		log.Println("CreateTemplate error:", err)
		http.Error(w, "could not create template (name may already exist)", http.StatusConflict)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "create",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("created template %q (kind=%s, image=%s)", req.Name, req.Kind, req.Image),
	})
	writeJSON(w, map[string]any{"id": id})
}

func handleTemplateFileUpload(w http.ResponseWriter, r *http.Request) {
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

	name := getString(manifest, "name")
	description := getString(manifest, "description")
	kind := getString(manifest, "kind")
	image := getString(manifest, "image")
	icon := strings.TrimSpace(getString(manifest, "icon"))
	color := strings.ToUpper(strings.TrimSpace(getString(manifest, "color")))
	// Spec arrives in two shapes: the download endpoint exports it as a
	// JSON-encoded STRING, while hand-written manifests carry it as an
	// OBJECT. Accept both so download → upload round-trips.
	var spec string
	if rawSpec, ok := manifest["spec"]; ok && rawSpec != nil {
		if s, ok := rawSpec.(string); ok {
			spec = s
		} else {
			specBytes, _ := json.Marshal(rawSpec)
			spec = string(specBytes)
		}
	}

	if name == "" {
		http.Error(w, "template name is required", http.StatusBadRequest)
		return
	}
	if !validKinds[kind] {
		http.Error(w, "kind must be one of: docker, lxd, kvm, multipass", http.StatusBadRequest)
		return
	}
	if icon != "" && len(icon) > 16*1024 {
		http.Error(w, "icon too large (max 16KB)", http.StatusBadRequest)
		return
	}
	if color != "" && !validNodeColorHex(color) {
		http.Error(w, "color must be a #rrggbb hex value", http.StatusBadRequest)
		return
	}
	if spec == "" {
		spec = "{}"
	}
	var specMap map[string]any
	if err := json.Unmarshal([]byte(spec), &specMap); err != nil {
		http.Error(w, "spec must be valid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateTemplateSpec(specMap); err != nil {
		http.Error(w, "spec validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	ownerID, _ := UserIDFromContext(r)
	id, err := repository.NewTemplateRepository(con).Create(repository.TemplateInput{
		Name: name, Description: description, Kind: kind, Image: image, Spec: spec,
		Icon: icon, Color: color,
		OwnerID: ownerID,
	})
	if err != nil {
		log.Println("CreateTemplate from file error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a template with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "create",
		TargetID:    &id,
		TargetLabel: name,
		Message:     fmt.Sprintf("uploaded template %q (kind=%s, image=%s)", name, kind, image),
	})
	writeJSON(w, map[string]any{"id": id})
}

// InstallTemplateFromURLHandler fetches a template manifest from the supplied URL,
// parses it, and inserts it. SSRF-guarded (only public IPs, DNS-pinned, size/time capped).
func InstallTemplateFromURLHandler(w http.ResponseWriter, r *http.Request) {
	_, err := UserIDFromContext(r)
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

	rawManifest, ferr := fetchTemplateManifestFromURL(r.Context(), dto.URL)
	if ferr != nil {
		var ue *templateAllowedURLError
		if errors.As(ferr, &ue) {
			http.Error(w, ue.reason, ue.status)
			return
		}
		log.Println("InstallTemplateFromURL fetch error:", ferr)
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}

	var manifest map[string]any
	if err := json.Unmarshal(rawManifest, &manifest); err != nil {
		http.Error(w, "manifest from URL is invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate the template using existing validation
	name := getString(manifest, "name")
	description := getString(manifest, "description")
	kind := getString(manifest, "kind")
	image := getString(manifest, "image")
	icon := strings.TrimSpace(getString(manifest, "icon"))
	color := strings.ToUpper(strings.TrimSpace(getString(manifest, "color")))
	// Same dual-shape spec handling as the file-upload path: the download
	// endpoint exports spec as a JSON-encoded STRING, hand-written
	// manifests carry it as an OBJECT.
	var spec string
	if rawSpec, ok := manifest["spec"]; ok && rawSpec != nil {
		if s, ok := rawSpec.(string); ok {
			spec = s
		} else {
			specBytes, _ := json.Marshal(rawSpec)
			spec = string(specBytes)
		}
	}

	if name == "" {
		http.Error(w, "template name is required", http.StatusBadRequest)
		return
	}
	if !validKinds[kind] {
		http.Error(w, "kind must be one of: docker, lxd, kvm, multipass", http.StatusBadRequest)
		return
	}
	if icon != "" && len(icon) > 16*1024 {
		http.Error(w, "icon too large (max 16KB)", http.StatusBadRequest)
		return
	}
	if color != "" && !validNodeColorHex(color) {
		http.Error(w, "color must be a #rrggbb hex value", http.StatusBadRequest)
		return
	}
	if spec == "" {
		spec = "{}"
	}
	var specMap map[string]any
	if err := json.Unmarshal([]byte(spec), &specMap); err != nil {
		http.Error(w, "spec must be valid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateTemplateSpec(specMap); err != nil {
		http.Error(w, "spec validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	ownerID, _ := UserIDFromContext(r)
	id, err := repository.NewTemplateRepository(con).Create(repository.TemplateInput{
		Name: name, Description: description, Kind: kind, Image: image, Spec: spec,
		Icon: icon, Color: color,
		OwnerID: ownerID,
	})
	if err != nil {
		log.Println("CreateTemplate from URL error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "a template with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "create",
		TargetID:    &id,
		TargetLabel: name,
		Message:     fmt.Sprintf("installed template %q from URL %s (kind=%s, image=%s)", name, dto.URL, kind, image),
	})
	writeJSON(w, map[string]any{"id": id})
}

// URL fetch infrastructure (template-specific to avoid conflicts with mod_handler)
const (
	templateURLFetchMaxBytes   = 8 << 20 // 8 MiB
	templateURLFetchTimeout    = 15 * time.Second
	templateURLFetchDNSTimeout = 5 * time.Second
)

type templateAllowedURLError struct {
	status int
	reason string
}

func (e *templateAllowedURLError) Error() string { return e.reason }

func fetchTemplateManifestFromURL(ctx context.Context, raw string) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, &templateAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, &templateAllowedURLError{http.StatusBadRequest, "URL must use http or https"}
	}
	if u.Host == "" {
		return nil, &templateAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	host := u.Hostname()
	if host == "" {
		return nil, &templateAllowedURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, templateURLFetchDNSTimeout)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return nil, &templateAllowedURLError{http.StatusBadGateway, "could not resolve host: " + host}
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !templateIsPublicIP(ip) {
			return nil, &templateAllowedURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host %s resolves to a non-public address (%s); only public hosts are allowed",
					host, host, ip.String()),
			}
		}
	}

	dialCtx, cancelDial := context.WithTimeout(ctx, templateURLFetchTimeout)
	defer cancelDial()

	port := templatePortFromHost(u.Host, u.Scheme)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: templateURLFetchTimeout,
		TLSHandshakeTimeout:   templateURLFetchTimeout,
		IdleConnTimeout:       templateURLFetchTimeout,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: templateURLFetchTimeout}).DialContext(ctx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			return nil, lastErr
		},
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{Transport: transport, Timeout: templateURLFetchTimeout}
	req, err := http.NewRequestWithContext(dialCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, &templateAllowedURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	req.Header.Set("User-Agent", "kspanel-template-installer/1.0")
	req.Header.Set("Accept", "application/json, text/plain;q=0.9, */*;q=0.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, &templateAllowedURLError{http.StatusBadGateway, "fetch failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &templateAllowedURLError{
			http.StatusBadGateway,
			fmt.Sprintf("origin returned HTTP %d for %s", resp.StatusCode, u.String()),
		}
	}
	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(ct, "application/json") &&
		!strings.HasPrefix(ct, "text/") && !strings.HasPrefix(ct, "application/octet-stream") {
		return nil, &templateAllowedURLError{
			http.StatusUnsupportedMediaType,
			fmt.Sprintf("origin returned unsupported content type %q", ct),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, templateURLFetchMaxBytes+1))
	if err != nil {
		return nil, &templateAllowedURLError{http.StatusBadGateway, "read body: " + err.Error()}
	}
	if len(body) > templateURLFetchMaxBytes {
		return nil, &templateAllowedURLError{
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("manifest exceeded %d bytes", templateURLFetchMaxBytes),
		}
	}
	return body, nil
}

func templateIsPublicIP(ip net.IP) bool {
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

func templatePortFromHost(hostport, scheme string) string {
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

// UpdateTemplateHandler patches an editable template.
// Ownership scope (migration 054): TEMPLATES_OWN may only edit templates
// the caller authored; TEMPLATES_ALL / MANAGE_TEMPLATES umbrella keep
// full edit. Own-restricted callers are enforced by the scope branch.
func UpdateTemplateHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req templateDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	spec, err := validateTemplate(req)
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
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
		if !hasAll && hasOwn {
			if ex, gerr := repository.NewTemplateRepository(con).Get(id); gerr == nil && ex != nil && ex.OwnerID != uid {
				http.Error(w, "forbidden: own-scope may only edit templates you authored", http.StatusForbidden)
				return
			}
		}
	}
	if err := repository.NewTemplateRepository(con).Update(id, repository.TemplateInput{
		Name: req.Name, Description: req.Description, Kind: req.Kind, Image: req.Image, Spec: spec,
		Icon: strings.TrimSpace(req.Icon), Color: strings.ToUpper(strings.TrimSpace(req.Color)),
	}); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "update",
		TargetID:    &id,
		TargetLabel: req.Name,
		Message:     fmt.Sprintf("updated template %q (kind=%s)", req.Name, req.Kind),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DeleteTemplateHandler removes a template. Existing instances keep running
// and lose their back-link (FK ON DELETE SET NULL).
func DeleteTemplateHandler(w http.ResponseWriter, r *http.Request) {
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
	tmplRepo := repository.NewTemplateRepository(con)
	var label string
	var ownerID int64
	if existing, gerr := tmplRepo.Get(id); gerr == nil && existing != nil {
		label = existing.Name
		ownerID = existing.OwnerID
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
		if !hasAll && hasOwn && ownerID != uid {
			http.Error(w, "forbidden: own-scope may only delete templates you authored", http.StatusForbidden)
			return
		}
	}
	if err := tmplRepo.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "delete",
		TargetID:    &id,
		TargetLabel: label,
		Message:     fmt.Sprintf("deleted template %q", label),
	})
	w.WriteHeader(http.StatusNoContent)
}

// DownloadTemplateHandler returns a template as a downloadable JSON file.
func DownloadTemplateHandler(w http.ResponseWriter, r *http.Request) {
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
	tmplRepo := repository.NewTemplateRepository(con)
	tmpl, err := tmplRepo.Get(id)
	if err != nil || tmpl == nil {
		http.Error(w, "template not found", http.StatusNotFound)
		return
	}
	// Ownership scope (migration 054): own-scope callers may only
	// download templates they authored; the download route already
	// passed the per-action VIEW gate, this is the extra filter.
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, _ := chk.HasScope(uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
		if !hasAll && hasOwn && tmpl.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}

	exportData := map[string]any{
		"name":        tmpl.Name,
		"description": tmpl.Description,
		"kind":        tmpl.Kind,
		"image":       tmpl.Image,
		"spec":        tmpl.Spec,
		"icon":        tmpl.Icon,
		"color":       tmpl.Color,
	}

	jsonData, err := json.MarshalIndent(exportData, "", "  ")
	if err != nil {
		http.Error(w, "failed to serialize template", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	safeName := sanitizeDownloadFilename(tmpl.Name)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.json\"", safeName))
	w.Write(jsonData)
}

// sanitizeDownloadFilename strips header-breaking characters from the
// template name used in Content-Disposition. Only alphanumerics, dash,
// underscore and dot survive; everything else becomes '_'. Empty results
// fall back to "template" so the header never carries raw user input
// (quote / newline injection).
func sanitizeDownloadFilename(name string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(name) {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	out := strings.Trim(b.String(), "._")
	if out == "" {
		return "template"
	}
	if len(out) > 64 {
		out = out[:64]
	}
	return out
}

// silence unused import guard for sql (kept for symmetry with other handlers)
var _ = sql.ErrNoRows
