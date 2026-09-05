package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// Code migrated from internal/api/server.go for better organization.
// These types and functions handle the SPA bootstrapping and theming.

// brandBootstrap is a tiny JSON blob spliced into index.html so the SPA can
// pick up the panel name + logo URL (and now the global theme store) BEFORE any
// JS runs. This eliminates the "KS Panel" flash users reported when refreshing
// the login page or first navigating between routes, AND the matching
// "Default-theme flash" on refresh / "logged-out visitor sees Default" bugs:
// the frontend theme store seeds from window.__KSPANEL_BOOTSTRAP__.theme at
// module-init (see web/src/stores/themeStore.ts) so the very first paint is
// already themed — no /api/me + /api/themes round-trip needed.
//
// The constants are exported on `window.__KSPANEL_BOOTSTRAP__` and the
// settingsStore / themeStore read them synchronously at module-init time so
// the very first React render already shows the right brand + theme.
//
// We pull a fresh snapshot for every request. The DB read is a couple of
// SELECTs against rows that are always in SQLite's page cache, so the
// per-request cost is negligible for the panel's expected traffic.
type brandBootstrap struct {
	PanelName string `json:"panel_name"`
	LogoURL   string `json:"logo_url,omitempty"`
	LogoMime  string `json:"logo_mime,omitempty"`
	// Theme is the admin-managed GLOBAL theme store, embedded verbatim so
	// the browser can resolve the current route's theme and paint it before
	// React mounts — exactly the same "no flash" trick the brand uses. It
	// carries only appearance specs (no secrets), so it's safe to ship to an
	// unauthenticated visitor; that's also why /api/themes is now public.
	Theme *themeBootstrap `json:"theme,omitempty"`
}

// themeBootstrap mirrors the public /api/themes response so the frontend's
// loadGlobal() and the module-init seed consume the SAME shape.
type themeBootstrap struct {
	Themes      []themeBootstrapTheme `json:"themes"`
	Assignments []themeBootstrapBind  `json:"assignments"`
}

// themeBootstrapTheme is the minimal projection of models.Theme the frontend
// needs: the id/name/description/builtin columns plus the verbatim spec blob.
// We deliberately reuse json.RawMessage so unknown future fields survive.
type themeBootstrapTheme struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Builtin     bool            `json:"builtin"`
	Spec        json.RawMessage `json:"spec"`
}

type themeBootstrapBind struct {
	Scope   string `json:"scope"`
	ThemeID string `json:"theme_id"`
}

// writeBrandedIndex injects the panel brand + theme into the SPA's index.html
// so the first paint already knows the panel name, logo, and current theme.
// The API remains functional; the SPA will show a basic landing without the
// full UI assets if the frontend has not been built.
func writeBrandedIndex(w http.ResponseWriter, r *http.Request, uiFS http.FileSystem) {
	var boot brandBootstrap
	if con, err := repository.OpenDB(); err == nil {
		settingsRepo := repository.NewSettingsRepository(con)
		if name, nerr := settingsRepo.GetPanelName(); nerr == nil {
			boot.PanelName = name
		} else {
			boot.PanelName = repository.DefaultPanelName
		}
		if logo, ok, lerr := settingsRepo.GetPanelLogo(); lerr == nil && ok {
			boot.LogoURL = "/api/settings/panel-logo"
			boot.LogoMime = logo.Mime
		}
		// Inline the admin-managed GLOBAL theme store so the SPA's first
		// paint is already themed (and logged-out visitors see the right
		// theme too, since this requires no auth). We resolve the current
		// request path server-side via ResolveThemeIDByRoute — the frontend
		// only needs the resolved theme body, but we also ship the whole
		// assignment map + theme list so React-side navigation after mount
		// (and the Theme admin UI) already have the data and don't have to
		// re-fetch it.
		themeRepo := repository.NewThemeRepository(con)
		themes, terr := themeRepo.ListThemes()
		asg, aerr := themeRepo.ListAssignments()
		_ = con.Close()
		if terr == nil && aerr == nil {
			boot.Theme = buildThemeBootstrap(r.URL.Path, themes, asg)
		}
	} else {
		boot.PanelName = repository.DefaultPanelName
	}

	file, err := uiFS.Open("index.html")
	if err != nil {
		http.Error(w, "ui not embedded", http.StatusInternalServerError)
		return
	}
	defer file.Close()
	body, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "ui read error", http.StatusInternalServerError)
		return
	}
	body = injectBrandIntoIndexHTML(body, boot)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// No browser cache: the admin might change the brand any moment and
	// they'd expect the next reload to pick it up.
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(body)
}

// buildThemeBootstrap assembles the themeBootstrap object shipped in the boot
// blob. It mirrors the public /api/themes response shape but resolves the
// CURRENT request path so the frontend can paint with the right theme before
// React even mounts — the path is the only thing the index.html response
// knows that the bundled JS can also read (window.location.pathname).
func buildThemeBootstrap(pathname string, themes []models.Theme, asg []models.ThemeAssignment) *themeBootstrap {
	assignments := make(map[string]string, len(asg))
	for _, a := range asg {
		assignments[a.Scope] = a.ThemeID
	}
	tb := &themeBootstrap{
		Themes: make([]themeBootstrapTheme, 0, len(themes)),
	}
	// Include every global theme verbatim — the SPA's Theme admin UI reads
	// the full library to populate its list, and the resolver needs them to
	// look up the resolved id's body.
	for _, t := range themes {
		tb.Themes = append(tb.Themes, themeBootstrapTheme{
			ID:          t.ID,
			Name:        t.Name,
			Description: t.Description,
			Builtin:     t.Builtin,
			Spec:        t.Spec,
		})
	}
	tb.Assignments = make([]themeBootstrapBind, 0, len(assignments))
	for scope, tid := range assignments {
		tb.Assignments = append(tb.Assignments, themeBootstrapBind{Scope: scope, ThemeID: tid})
	}
	return tb
}

// brand and the document title match the configured values from the very
// first render. We replace two places:
//
//   - <title>...</title>
//   - a tiny inline <script> that sets window.__KSPANEL_BOOTSTRAP__ and
//     applies document.title immediately. The settingsStore reads the same
//     global synchronously during module init so React's first render
//     already has the right values.
//
// Anything we miss is harmless – the SPA's settingsStore reconciliation
// fetches the live values on mount.
func injectBrandIntoIndexHTML(html []byte, boot brandBootstrap) []byte {
	// 1) Document title – start from a known-good replacement. The
	//    upstream index.html ships as <title>KS Panel</title>; we overwrite
	//    it inline when present so search-engine crawlers / tab favicon
	//    tools see the right name even before JS runs.
	titleOpen := []byte("<title>")
	titleClose := []byte("</title>")
	if i := indexBytes(html, titleOpen); i >= 0 {
		if j := indexBytesFrom(html, titleClose, i); j >= 0 {
			out := make([]byte, 0, len(html))
			out = append(out, html[:i+len(titleOpen)]...)
			out = append(out, []byte(boot.PanelName)...)
			out = append(out, html[j:]...)
			html = out
		}
	}

	// 2) Inline bootstrap script. Inserted right before the existing
	//    <script type="module"> so the global is defined before the React
	//    entrypoint loads.
	bootJSON, err := json.Marshal(boot)
	if err != nil {
		return html
	}
	script := []byte("<script>window.__KSPANEL_BOOTSTRAP__=" + string(bootJSON) +
		`;(function(){var n=window.__KSPANEL_BOOTSTRAP__&&window.__KSPANEL_BOOTSTRAP__.panel_name;` +
		`if(n){document.title=n}})();</script>`)
	marker := []byte(`<script type="module"`)
	if idx := indexBytes(html, marker); idx >= 0 {
		out := make([]byte, 0, len(html)+len(script))
		out = append(out, html[:idx]...)
		out = append(out, script...)
		out = append(out, html[idx:]...)
		html = out
	}
	return html
}

// indexBytes / indexBytesFrom are tiny stdlib aliases (kept local so we
// don't pull in bytes for one call site).
func indexBytes(haystack, needle []byte) int {
	if len(needle) == 0 {
		return 0
	}
outer:
	for i := 0; i+len(needle) <= len(haystack); i++ {
		for k := 0; k < len(needle); k++ {
			if haystack[i+k] != needle[k] {
				continue outer
			}
		}
		return i
	}
	return -1
}

func indexBytesFrom(haystack, needle []byte, start int) int {
	if start < 0 {
		start = 0
	}
	rel := indexBytes(haystack[start:], needle)
	if rel < 0 {
		return -1
	}
	return start + rel
}

// isDevelopment checks if the application is running in development mode.
// Fail-closed: an unset KSPANEL_ENV means production, so CORS reflects no
// foreign Origin with credentials unless the operator explicitly opts into
// development (KSPANEL_ENV=development|dev) or allowlists the origin.
func isDevelopment() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("KSPANEL_ENV")))
	return env == "development" || env == "dev"
}

// isAllowedOrigin checks if the origin is in the allowed list from settings
func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}

	// Parse allowed origins from environment or settings
	allowedOriginsStr := os.Getenv("KSPANEL_ALLOWED_ORIGINS")
	if allowedOriginsStr == "" {
		// Default to allowing localhost for development
		allowedOriginsStr = "http://localhost:5050,http://localhost:3000,http://127.0.0.1:5050,http://127.0.0.1:3000"
	}

	allowedOrigins := strings.Split(allowedOriginsStr, ",")
	for _, allowed := range allowedOrigins {
		if strings.TrimSpace(allowed) == origin {
			return true
		}
	}
	return false
}