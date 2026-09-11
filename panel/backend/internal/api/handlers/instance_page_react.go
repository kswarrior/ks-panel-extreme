package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// BuildInstancePageHandler validates the Studio React source and stores it as
// the executable bundle (near-real: JSX + light TS + react-only imports are
// accepted and transpiled at render time by reactPageTranspile.ts; the
// renderer executes it with the panel React runtime). The bundle columns
// stay build-owned so plain saves never clobber a good build; see
// repository.UpdateBuild.
type buildInstancePageReq struct {
	SourceTSX string `json:"source_tsx"`
	BundleCSS string `json:"bundle_css"`
}

func BuildInstancePageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	var req buildInstancePageReq
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewInstancePageRepository(con)
	page, gerr := repo.Get(id)
	if gerr != nil || page == nil {
		http.Error(w, "instance page not found", http.StatusNotFound)
		return
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, serr := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if serr != nil {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !hasAll && hasOwn && page.OwnerID != uid {
			http.Error(w, "forbidden: own-scope may only build instance pages you authored", http.StatusForbidden)
			return
		}
	}
	source := strings.TrimSpace(req.SourceTSX)
	if source == "" {
		source = page.SourceTSX
	}
	css := req.BundleCSS
	if r.Body == nil || (req.BundleCSS == "" && req.SourceTSX == "") {
		css = page.BundleCSS
	}
	fail := func(msg string) {
		_ = repo.UpdateBuild(id, page.BundleJS, css, "error", msg)
		http.Error(w, msg, http.StatusBadRequest)
	}
	mainIsReact := page.ContentType == "react"
	if mainIsReact && strings.TrimSpace(source) == "" {
		fail("source_tsx is required for react pages")
		return
	}
	if strings.TrimSpace(source) != "" {
		if err := validateReactSource(source); err != nil {
			fail(err.Error())
			return
		}
	}
	if len(css) > maxInstancePageContentBytes {
		fail("bundle_css too large (max 1MB)")
		return
	}
	// Sub-pages build with the family: validate every React sub source and
	// stamp its bundle_js so link + render can use it without a second call.
	subJSON := page.SubPages
	builtSubs := 0
	if strings.TrimSpace(page.SubPages) != "" {
		var subs []instancePageSubPage
		if jerr := json.Unmarshal([]byte(page.SubPages), &subs); jerr == nil {
			changed := false
			for i := range subs {
				src := strings.TrimSpace(subs[i].SourceTSX)
				if subs[i].ContentType != "react" && src == "" {
					continue
				}
				if src == "" {
					fail(fmt.Sprintf("sub-page %q: source_tsx is required for react pages", subs[i].Path))
					return
				}
				if verr := validateReactSource(src); verr != nil {
					fail(fmt.Sprintf("sub-page %q: %s", subs[i].Path, verr.Error()))
					return
				}
				if subs[i].BundleJS != src {
					subs[i].BundleJS = src
					changed = true
				}
				builtSubs++
			}
			if changed {
				if b, merr := json.Marshal(subs); merr == nil {
					subJSON = string(b)
				}
			}
		}
	}
	// Save-and-build in one round-trip when the Studio sends fresh source.
	if source != page.SourceTSX || css != page.BundleCSS || subJSON != page.SubPages {
		if uerr := repo.Update(id, repository.InstancePageInput{
			Name:            page.Name,
			Slug:            page.Slug,
			Kind:            page.Kind,
			Category:        page.Category,
			PageType:        page.PageType,
			Description:     page.Description,
			ContentType:     page.ContentType,
			ContentHTML:     page.ContentHTML,
			ContentMarkdown: page.ContentMarkdown,
			ContentBlocks:   page.ContentBlocks,
			SourceTSX:       source,
			BundleCSS:       css,
			IconSVG:         page.IconSVG,
			IconColor:       page.IconColor,
			Actions:         page.Actions,
			SubPages:        subJSON,
			Components:      page.Components,
			Configure:       page.Configure,
			Source:          page.Source,
			MarketID:        page.MarketID,
			MarketVersion:   page.MarketVersion,
		}); uerr != nil {
			log.Println("BuildInstancePage save source error:", uerr)
			http.Error(w, "could not save source: "+uerr.Error(), http.StatusInternalServerError)
			return
		}
	}
	bundle := strings.TrimSpace(source)
	// Leaving react clears the bundle so a converted page never executes
	// stale output; non-react pages with no source keep an empty bundle.
	if !mainIsReact {
		bundle = ""
	}
	if len(bundle) > maxInstancePageBundleBytes {
		fail("bundle too large (max 1MB)")
		return
	}
	buildLog := fmt.Sprintf("ok: main %d bytes + %d sub-page(s), 0 errors", len(bundle), builtSubs)
	if uerr := repo.UpdateBuild(id, bundle, css, "ok", buildLog); uerr != nil {
		log.Println("BuildInstancePage store bundle error:", uerr)
		http.Error(w, "could not store bundle", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTemplate,
		Action:      "build",
		TargetID:    &id,
		TargetLabel: page.Name,
		Message:     fmt.Sprintf("built react page %q (%d bytes)", page.Name, len(bundle)),
	})
	writeJSON(w, map[string]any{"id": id, "build_status": "ok", "build_log": buildLog})
}

// ServeInstancePageBundleHandler serves the built bundle for Studio preview.
// Instance rendering prefers the inline spec.pages copy (deploy-time
// snapshot); this route exists so unsaved-link previews don't need a template.
func ServeInstancePageBundleHandler(w http.ResponseWriter, r *http.Request) {
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
	page, gerr := repository.NewInstancePageRepository(con).Get(id)
	if gerr != nil || page == nil {
		http.Error(w, "instance page not found", http.StatusNotFound)
		return
	}
	if uid, _ := UserIDFromContext(r); uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, serr := chk.HasScope(uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
		if serr != nil {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !hasAll && hasOwn && page.OwnerID != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}
	isCSS := strings.HasSuffix(r.URL.Path, ".css")
	body := page.BundleJS
	contentType := "application/javascript; charset=utf-8"
	if isCSS {
		body = page.BundleCSS
		contentType = "text/css; charset=utf-8"
	}
	if strings.TrimSpace(body) == "" {
		http.Error(w, "bundle not built yet", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write([]byte(body))
}
