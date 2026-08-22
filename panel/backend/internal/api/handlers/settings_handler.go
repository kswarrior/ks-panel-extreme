package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/repository"
)

// validUintString reports whether s is composed only of ASCII digits and
// represents a value that fits in a non-negative int. Used to guard the
// device_account_limit PUT field before persisting it.
func validUintString(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	if _, err := strconv.Atoi(s); err != nil {
		return false
	}
	// Reject leading negatives and stray signs explicitly.
	if strings.ContainsAny(s, "+- ") {
		return false
	}
	return true
}

// PanelNameHandler – public endpoint (no auth required) used by the login
// page and the in-app brand to read the current panel name.
//
// Always returns 200 with `{"panel_name":"...","panel_logo":{...}}`, even
// if the DB read fails (in which case the default name is returned and
// panel_logo is omitted). This keeps the login UI usable even if the DB is
// transiently unreachable, AND keeps the "first paint" JS payload the SPA
// uses to bootstrap its store.
func PanelNameHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		writeJSON(w, map[string]any{
			"panel_name": repository.DefaultPanelName,
			"panel_logo": nil,
		})
		return
	}
	defer con.Close()

	repo := repository.NewSettingsRepository(con)
	name, err := repo.GetPanelName()
	if err != nil {
		log.Println("PanelNameHandler name error:", err)
		name = repository.DefaultPanelName
	}
	out := map[string]any{
		"panel_name": name,
		"panel_logo": nil,
	}
	logo, ok, err := repo.GetPanelLogo()
	if err != nil {
		log.Println("PanelNameHandler logo error:", err)
	} else if ok {
		out["panel_logo"] = map[string]string{
			"url":      panelLogoURL(logo),
			"mime":     logo.Mime,
			"filename": logo.Filename,
		}
	}
	writeJSON(w, out)
}

// PanelLogoHandler serves the configured panel logo bytes (no auth). When no
// logo is configured we return 204 so the frontend knows the resource is
// missing without having to parse an error body.
func PanelLogoHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSettingsRepository(con)
	logo, ok, err := repo.GetPanelLogo()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !ok {
		// 204 (not 404) so the SPA's <img onerror> doesn't fire and produce
		// a broken-image icon everywhere. The frontend treats 204 as
		// "no logo, fall back to default SVG".
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Cache aggressively so we don't hit the DB on every logout/login.
	// Cache-Control is private because the logo is user-configurable but
	// not user-specific; we keep it conservative to stay correct after an
	// admin replaces the logo (the new filename has a random suffix).
	w.Header().Set("Content-Type", logo.Mime)
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeFile(w, r, repo.LogoDiskPath(logo))
}

// SettingsHandler – protected (gated by VIEW_SETTINGS permission by the
// router). Returns the full settings snapshot and accepts PUT to update.
func SettingsHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewSettingsRepository(con)

	switch r.Method {
	case http.MethodGet:
		snap, err := repo.Get()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		// The SMTP password is a secret — never echo it back, even to admins.
		// The Settings page renders a masked control + a "leave blank to keep"
		// placeholder; the wire must match that promise.
		if snap != nil {
			snap.SMTPPassword = ""
		}
		writeJSON(w, snap)
	case http.MethodPut:
		var body struct {
			PanelName          *string `json:"panel_name"`
			RegisterAllow      *string `json:"register_allow"`
			RegisterRole       *string `json:"register_role"`
			DeviceAccountLimit *string `json:"device_account_limit"`
			VerifyRequired     *string `json:"verify_required"`
			SMTPHost           *string `json:"smtp_host"`
			SMTPPort           *string `json:"smtp_port"`
			SMTPUser           *string `json:"smtp_user"`
			SMTPPassword       *string `json:"smtp_password"`
			SMTPFrom           *string `json:"smtp_from"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		// Validate DeviceAccountLimit before persisting so an invalid value
		// (non-numeric or negative) is rejected with a clear message instead
		// of silently storing it as the string the repo would later parse as
		// "unlimited". Allow the admin to send an empty string to clear it.
		if body.DeviceAccountLimit != nil && *body.DeviceAccountLimit != "" {
			if !validUintString(*body.DeviceAccountLimit) {
				http.Error(w, "device_account_limit must be a non-negative integer (0 = unlimited)", http.StatusBadRequest)
				return
			}
		}
		// RegisterRole: if the admin picks a role name that doesn't exist,
		// we still store it (the register handler falls back to "user" at
		// runtime). But we validate it's a *known* role up-front and 400 if
		// it's an unknown name so typos surface immediately rather than
		// silently degrading to "user".
		if body.RegisterRole != nil && *body.RegisterRole != "" {
			roleRepo := repository.NewRoleRepository(con)
			if _, rerr := roleRepo.GetRoleByName(*body.RegisterRole); rerr != nil {
				http.Error(w, "register_role is not a known role: "+*body.RegisterRole, http.StatusBadRequest)
				return
			}
		}
		var snap repository.SettingsSnapshot
		if body.PanelName != nil {
			snap.PanelName = *body.PanelName
		}
		if body.RegisterAllow != nil {
			snap.RegisterAllow = *body.RegisterAllow
		}
		if body.RegisterRole != nil {
			snap.RegisterRole = *body.RegisterRole
		}
		if body.DeviceAccountLimit != nil {
			snap.DeviceAccountLimit = *body.DeviceAccountLimit
		}
		if body.VerifyRequired != nil {
			snap.VerifyRequired = *body.VerifyRequired
		}
		if body.SMTPHost != nil {
			snap.SMTPHost = *body.SMTPHost
		}
		if body.SMTPPort != nil {
			snap.SMTPPort = *body.SMTPPort
		}
		if body.SMTPUser != nil {
			snap.SMTPUser = *body.SMTPUser
		}
		if body.SMTPPassword != nil {
			// Sentinel "*" means "leave unchanged"; anything else (including
			// the empty string) is written through. The settings repo's
			// Update skips "*" so the stored secret never gets clobbered.
			snap.SMTPPassword = *body.SMTPPassword
		}
		if body.SMTPFrom != nil {
			snap.SMTPFrom = *body.SMTPFrom
		}
		if err := repo.Update(&snap); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		out, _ := repo.Get()
		// Never echo the SMTP password back to the client — the public
		// snapshot field is left empty so the SPA renders "configured" but
		// can't read the secret. Re-fetching here is safe because the repo's
		// getString just reads the stored value; we zero it before sending.
		if out != nil {
			out.SMTPPassword = ""
		}
		writeJSON(w, out)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// SettingsLogoUploadHandler accepts a multipart/form-data POST with a single
// "logo" file part. After a successful upload it returns the same shape as
// SettingsHandler.Get (i.e. the snapshot) so the SPA can refresh its store
// without a second round trip.
func SettingsLogoUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// 5 MiB hard limit; the parse multipart reader enforces it.
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("logo")
	if err != nil {
		http.Error(w, "missing 'logo' file part", http.StatusBadRequest)
		return
	}
	defer file.Close()
	// Cap by declared AND actual size; a malicious client could lie in the
	// header. 5 MiB mirrors the parser limit above.
	if hdr.Size > 5<<20 {
		http.Error(w, "logo file too large (max 5 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, 5<<20+1))
	if err != nil {
		http.Error(w, "read logo file: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(data) > 5<<20 {
		http.Error(w, "logo file too large (max 5 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	mime := strings.TrimSpace(hdr.Header.Get("Content-Type"))
	if mime == "" {
		// Some browsers omit Content-Type on the part – fall back to the
		// extension so the most common types still work.
		mime = mimeFromExt(filepath.Ext(hdr.Filename))
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSettingsRepository(con)
	if _, err := repo.SetPanelLogo(data, mime); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	snap, _ := repo.Get()
	writeJSON(w, snap)
}

// SettingsLogoDeleteHandler deletes the configured logo (and its file on
// disk). It mirrors SettingsLogoUploadHandler's success response so the SPA
// can call delete then refresh in one place.
func SettingsLogoDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSettingsRepository(con)
	if err := repo.ClearPanelLogo(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	snap, _ := repo.Get()
	writeJSON(w, snap)
}

// panelLogoURL returns the public URL that streams the logo bytes. Kept as
// a free function (not a method on *SettingsRepository) so the bootstrap
// injection in server.go can use the same logic without depending on a
// live *sql.DB.
func panelLogoURL(logo repository.PanelLogo) string {
	return "/api/settings/panel-logo"
}

// MIME-from-extension fallback for clients whose multipart writer is lazy.
// Mirrors extensionForMime in settings_repo.go (kept here so we don't have
// to mirror the change there when we tweak the list).
func mimeFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return ""
	}
}
