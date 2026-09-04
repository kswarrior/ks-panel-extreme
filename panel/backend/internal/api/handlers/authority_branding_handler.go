package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/repository"
)

// authorityBrandingResponse is the public login-page brand snapshot.
//
// Precedence per field: authority-specific branding (PUT /api/authority,
// SETTINGS_EDIT-gated) wins when set; otherwise the GLOBAL panel brand
// (settings KV panel_name + /api/settings/panel-logo) is the fallback so
// the login page keeps rendering the operator's brand even when no
// authority branding was ever configured. `logo_source` /
// `background_source` tell the SPA which layer won without it having to
// re-derive the fallback chain.
type authorityBrandingResponse struct {
	PanelName        string `json:"panel_name"`
	LogoURL          string `json:"logo_url,omitempty"`
	LogoSource       string `json:"logo_source"`
	BackgroundURL    string `json:"background_url,omitempty"`
	BackgroundType   string `json:"background_type,omitempty"`
	BackgroundSource string `json:"background_source"`
}

// AuthorityBrandingHandler serves the public login-page brand. No auth gate
// (same model as PanelNameHandler / PanelLogoHandler / ListThemesHandler):
// the login page renders before the user has a session, and the payload
// carries only brand URLs + the panel name — no secrets. The authority
// blob is read with secrets masked by construction (branding fields are
// never secrets), and the global logo is referenced by URL, never bytes.
func AuthorityBrandingHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		writeJSON(w, authorityBrandingResponse{
			PanelName:        repository.DefaultPanelName,
			LogoSource:       "none",
			BackgroundSource: "none",
		})
		return
	}
	defer con.Close()

	out := authorityBrandingResponse{
		PanelName:        repository.DefaultPanelName,
		LogoSource:       "none",
		BackgroundSource: "none",
	}
	settingsRepo := repository.NewSettingsRepository(con)
	if name, nerr := settingsRepo.GetPanelName(); nerr == nil && strings.TrimSpace(name) != "" {
		out.PanelName = name
	}
	// Global logo fallback (settings KV + disk, same source PanelLogoHandler
	// streams). Referenced by URL so this JSON stays tiny.
	globalLogo := ""
	if logo, ok, lerr := settingsRepo.GetPanelLogo(); lerr == nil && ok {
		globalLogo = "/api/settings/panel-logo"
		_ = logo
	}
	// Authority-specific override wins when the admin configured it.
	authorityRepo := repository.NewAuthorityRepository(con)
	if cfg, cerr := authorityRepo.Get(); cerr == nil && cfg != nil {
		if u := strings.TrimSpace(cfg.Branding.LogoURL); u != "" {
			out.LogoURL = u
			out.LogoSource = "authority"
		}
		if u := strings.TrimSpace(cfg.Branding.BackgroundURL); u != "" {
			out.BackgroundURL = u
			if strings.ToLower(strings.TrimSpace(cfg.Branding.BackgroundType)) == "gradient" {
				out.BackgroundType = "gradient"
			} else {
				out.BackgroundType = "image"
			}
			out.BackgroundSource = "authority"
		}
	} else if cerr != nil {
		log.Println("AuthorityBranding config error:", cerr)
	}
	if out.LogoSource == "none" && globalLogo != "" {
		out.LogoURL = globalLogo
		out.LogoSource = "global"
	}
	writeJSON(w, out)
}
