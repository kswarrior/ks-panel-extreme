package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ── Self-service profile (the logged-in user edits THEIR OWN profile) ─────

// profileResponse is the public view of a user's profile returned by both
// /api/me/profile (self) and /api/users/{id}/profile (public). It carries
// the editable profile fields plus the URLs the SPA points its <img> tags at
// so the frontend never has to know the on-disk layout.
type profileResponse struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	RoleID       int64  `json:"role_id"`
	CreatedAt    string `json:"created_at"`
	DisplayName  string `json:"display_name"`
	Bio          string `json:"bio"`
	Pronouns     string `json:"pronouns"`
	AccentColor  string `json:"accent_color"`
	AvatarSymbol string `json:"avatar_symbol"`
	// AvatarURL/BannerURL are "" when the user hasn't uploaded one; the SPA
	// falls back to the avatar symbol (or first-letter tile) in that case.
	AvatarURL string `json:"avatar_url,omitempty"`
	BannerURL string `json:"banner_url,omitempty"`
	// SocialLinks is always a JSON array (possibly empty) so the SPA can
	// .map() over it without null-checks.
	SocialLinks []models.SocialLink `json:"social_links"`
}

// toProfileResponse projects a models.User (with password hash + disk
// filenames already stripped) into the JSON view. The has_* bools drive the
// URL population so we never 404 the <img> when nothing's configured.
func toProfileResponse(u *models.User, publicView bool) profileResponse {
	resp := profileResponse{
		ID:           u.ID,
		Username:     u.Username,
		Email:        u.Email,
		RoleID:       u.RoleID,
		CreatedAt:    u.CreatedAt.Format("2006-01-02 15:04:05"),
		DisplayName:  u.DisplayName,
		Bio:          u.Bio,
		Pronouns:     u.Pronouns,
		AccentColor:  u.AccentColor,
		AvatarSymbol: u.AvatarSymbol,
		SocialLinks:  u.SocialLinks,
	}
	if resp.SocialLinks == nil {
		resp.SocialLinks = []models.SocialLink{}
	}
	if u.HasAvatar {
		resp.AvatarURL = userAvatarURL(u.ID)
	}
	if u.HasBanner {
		resp.BannerURL = userBannerURL(u.ID)
	}
	// Public view hides the email address — only the owner should see it.
	if publicView {
		resp.Email = ""
	}
	return resp
}

// userAvatarURL / userBannerURL build the public streaming URL for a user's
// stored image. Kept as package-level helpers (not methods) so they can be
// referenced from the SPA-fallback brand path in server.go if we ever need
// them there, mirroring panelLogoURL.
func userAvatarURL(id int64) string {
	return "/api/users/" + strconv.FormatInt(id, 10) + "/avatar"
}

func userBannerURL(id int64) string {
	return "/api/users/" + strconv.FormatInt(id, 10) + "/banner"
}

// maxProfileImageSize is the hard cap on avatar + banner uploads. 5 MiB
// mirrors the panel-logo limit; generous enough for an animated GIF without
// being a griefing vector.
const maxProfileImageSize = 5 << 20

// allowedSocialLinkTypes is the closed set of link "type" keys the SPA knows
// how to render an icon for. The list lives here (not in the frontend) so a
// client can never mint an arbitrary key; unknown keys are rejected with a
// 400 so typos surface immediately rather than rendering a broken badge.
var allowedSocialLinkTypes = map[string]struct{}{
	"youtube": {}, "instagram": {}, "facebook": {}, "github": {},
	"huggingface": {}, "twitter": {}, "x": {}, "discord": {},
	"website": {}, "twitch": {}, "tiktok": {}, "linkedin": {},
	"reddit": {}, "mastodon": {}, "bluesky": {}, "gitlab": {},
	"steam": {}, "telegram": {}, "patreon": {},
}

// validCustomLinkType reports whether s is an acceptable user-supplied
// social-link type key when it isn't one of the built-ins. We restrict it to
// lowercase letters/digits plus dash/underscore and 1-32 chars so the SPA
// can render it safely and so the column stays legible. Whitespace is
// trimmed by the caller before this runs.
func validCustomLinkType(s string) bool {
	if len(s) < 1 || len(s) > 32 {
		return false
	}
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'z':
		case c == '-' || c == '_':
		default:
			return false
		}
	}
	return true
}

// validHexColor reports whether s looks like a CSS hex color (#rgb or #rrggbb).
// We accept either form so users can save a crisp short color, but reject
// anything with stray characters that would later confuse the SVG renderer.
func validHexColor(s string) bool {
	if s == "" {
		return true
	}
	if len(s) != 4 && len(s) != 7 {
		return false
	}
	if s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

// profileRequest is the PUT body for /api/me/profile. Every field is a
// pointer so the caller can omit one ("leave unchanged") — the handler only
// writes the fields the client actually sent.
type profileRequest struct {
	DisplayName  *string              `json:"display_name"`
	Bio          *string              `json:"bio"`
	Pronouns     *string              `json:"pronouns"`
	AccentColor  *string              `json:"accent_color"`
	AvatarSymbol *string              `json:"avatar_symbol"`
	SocialLinks  *[]models.SocialLink `json:"social_links"`
}

// GetMyProfileHandler returns the logged-in user's full profile. It's a
// dedicated GET (vs. stuffing the profile into /api/me) so the SPA can
// re-fetch just the profile after an edit without re-fetching permissions.
func GetMyProfileHandler(w http.ResponseWriter, r *http.Request) {
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
	user, err := repository.NewUserRepository(con).GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	writeJSON(w, toProfileResponse(user, false))
}

// UpdateMyProfileHandler updates the editable scalar fields + social links.
// Image uploads live on separate (multipart) endpoints so this one stays JSON.
func UpdateMyProfileHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req profileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	// Validate length-bearing fields up front so we return a clean 400 with
	// the offending field name. Limits are generous; the SPA also enforces
	// them so a well-behaved client never hits them, but the server is the
	// source of truth for a hostile client.
	const maxDisplayName = 64
	const maxPronouns = 32
	const maxBio = 1000
	const maxAccentColor = 7 // "#rrggbb"
	const maxAvatarSymbol = 32
	const maxLinks = 25
	const maxLinkURL = 500
	const maxLinkLabel = 64

	if req.DisplayName != nil && len(*req.DisplayName) > maxDisplayName {
		http.Error(w, "display_name is too long (max "+strconv.Itoa(maxDisplayName)+")", http.StatusBadRequest)
		return
	}
	if req.Bio != nil && len(*req.Bio) > maxBio {
		http.Error(w, "bio is too long (max "+strconv.Itoa(maxBio)+")", http.StatusBadRequest)
		return
	}
	if req.Pronouns != nil && len(*req.Pronouns) > maxPronouns {
		http.Error(w, "pronouns is too long (max "+strconv.Itoa(maxPronouns)+")", http.StatusBadRequest)
		return
	}
	if req.AccentColor != nil && !validHexColor(*req.AccentColor) {
		http.Error(w, "accent_color must be a hex color (#rgb or #rrggbb)", http.StatusBadRequest)
		return
	}
	if req.AvatarSymbol != nil && len(*req.AvatarSymbol) > maxAvatarSymbol {
		http.Error(w, "avatar_symbol is too long (max "+strconv.Itoa(maxAvatarSymbol)+")", http.StatusBadRequest)
		return
	}
	var links []models.SocialLink
	if req.SocialLinks != nil {
		links = *req.SocialLinks
		if len(links) > maxLinks {
			http.Error(w, "too many social links (max "+strconv.Itoa(maxLinks)+")", http.StatusBadRequest)
			return
		}
		for i, l := range links {
			if l.URL == "" {
				http.Error(w, "social_links["+strconv.Itoa(i)+"].url is required", http.StatusBadRequest)
				return
			}
			if len(l.URL) > maxLinkURL {
				http.Error(w, "social_links["+strconv.Itoa(i)+"].url is too long", http.StatusBadRequest)
				return
			}
			if len(l.Label) > maxLinkLabel {
				http.Error(w, "social_links["+strconv.Itoa(i)+"].label is too long", http.StatusBadRequest)
				return
			}
			normalized := strings.ToLower(strings.TrimSpace(l.Type))
			if _, ok := allowedSocialLinkTypes[normalized]; !ok {
				// Built-ins are always accepted. Anything else is treated as a
				// user-supplied custom type; we still validate it so clients
				// can't mint arbitrary keys that would break rendering or
				// inject weird strings. Custom keys must be 1-32 chars of
				// [a-z0-9_-].
				if !validCustomLinkType(normalized) {
					http.Error(w, "social_links["+strconv.Itoa(i)+"].type is not a valid or known link type", http.StatusBadRequest)
					return
				}
			}
			// Normalize the type key to lowercase so the SPA's icon map
			// lookup is case-insensitive on the wire.
			links[i].Type = normalized
		}
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Field-level permission enforcement. The route gate (server.go) admits
	// the request if the caller holds the umbrella VIEW_ACCOUNT OR ANY of the
	// five customization sub-caps — that's a coarse "is this user allowed to
	// touch their profile at all" gate. Here we enforce the FINE boundary so
	// a role granted only e.g. ACCOUNT_EDIT_BANNER cannot smuggle a bio
	// change in on the same PUT. Each non-nil field in the request is mapped
	// to the sub-cap (or the umbrella, which implies it) it writes; if any
	// required key is missing we bail with 403 before touching the DB.
	checker := permissions.NewChecker(con)
	// requireField holds the caller accountable for one field: it checks the
	// supplied sub-cap OR the umbrella VIEW_ACCOUNT (which implies every
	// Account sub-cap). Returns false on denial.
	requireField := func(perm, label string) bool {
		if err := checker.EnsureAny(uid, permissions.ViewAccountKey, perm); err != nil {
			http.Error(w, "forbidden: missing "+label+" permission", http.StatusForbidden)
			return false
		}
		return true
	}
	// Group the bio / display_name / pronouns / social_links together under
	// the "about me" sub-cap — they're edited together in the SPA's Profile
	// form, so the same permission implicitly covers all of them.
	if (req.Bio != nil || req.DisplayName != nil || req.Pronouns != nil || req.SocialLinks != nil) &&
		!requireField(permissions.AccountEditAboutKey, "ACCOUNT_EDIT_ABOUT") {
		return
	}
	if req.AccentColor != nil && !requireField(permissions.AccountEditAccentKey, "ACCOUNT_EDIT_ACCENT") {
		return
	}
	if req.AvatarSymbol != nil && !requireField(permissions.AccountUseAvatarSymbolKey, "ACCOUNT_USE_AVATAR_SYMBOL") {
		return
	}

	repo := repository.NewUserRepository(con)
	user, err := repo.GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Apply only the fields the caller supplied; everything else keeps its
	// existing value. This makes the endpoint safe to call with a partial
	// body (e.g. only updating the bio) without wiping the display name.
	displayName := user.DisplayName
	bio := user.Bio
	pronouns := user.Pronouns
	accentColor := user.AccentColor
	avatarSymbol := user.AvatarSymbol
	social := user.SocialLinks
	if req.DisplayName != nil {
		displayName = *req.DisplayName
	}
	if req.Bio != nil {
		bio = *req.Bio
	}
	if req.Pronouns != nil {
		pronouns = *req.Pronouns
	}
	if req.AccentColor != nil {
		accentColor = *req.AccentColor
	}
	if req.AvatarSymbol != nil {
		avatarSymbol = *req.AvatarSymbol
	}
	if req.SocialLinks != nil {
		social = links
	}

	if err := repo.UpdateProfile(uid, displayName, bio, pronouns, accentColor, avatarSymbol, social); err != nil {
		log.Println("UpdateProfile error:", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	RecordActivity(r, repository.ActivityInput{
		UserID:      &uid,
		Username:    user.Username,
		Category:    models.ActivityCategoryUser,
		Action:      "update_profile",
		TargetLabel: user.Username,
		Message:     "updated their profile",
	})

	user, err = repo.GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	writeJSON(w, toProfileResponse(user, false))
}

// ── Avatar / banner image upload + delete (self-service) ──────────────────

// uploadUserImage is the shared implementation behind the avatar + banner
// upload endpoints. `kind` is "avatar" or "banner". It mirrors the panel-logo
// handler's size/mime validation so an attacking client can't bypass the cap
// by lying in the multipart header.
func uploadUserImage(w http.ResponseWriter, r *http.Request, uid int64, kind string) {
	if err := r.ParseMultipartForm(maxProfileImageSize); err != nil {
		http.Error(w, "invalid multipart payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing 'file' part", http.StatusBadRequest)
		return
	}
	defer file.Close()
	if hdr.Size > maxProfileImageSize {
		http.Error(w, kind+" file too large (max 5 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxProfileImageSize+1))
	if err != nil {
		http.Error(w, "read "+kind+" file: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(data) > maxProfileImageSize {
		http.Error(w, kind+" file too large (max 5 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	mime := strings.TrimSpace(hdr.Header.Get("Content-Type"))
	if mime == "" {
		// Some browsers omit Content-Type on the part — fall back to the
		// extension so the most common types still work.
		mime = imageMimeFromExt(filepath.Ext(hdr.Filename))
	}
	// SVGs execute in the panel origin when served on /api/users/{id}/avatar
	// (no CSP, public route). Sanitize with the same rules used for instance-
	// page icons so stored XSS cannot be planted via avatars/banners.
	if strings.EqualFold(mime, "image/svg+xml") {
		data = []byte(sanitizeIconSVG(string(data)))
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewUserRepository(con)
	if _, err := repo.SetUserImage(uid, kind, data, mime); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	user, err := repo.GetByID(uid)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, toProfileResponse(user, false))
}

// UploadAvatarHandler accepts a multipart "file" part and stores it as the
// caller's avatar. Returns the refreshed profile so the SPA updates its image
// src without a second round trip.
func UploadAvatarHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	uploadUserImage(w, r, uid, "avatar")
}

// UploadBannerHandler is the banner counterpart to UploadAvatarHandler.
func UploadBannerHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	uploadUserImage(w, r, uid, "banner")
}

// DeleteAvatarHandler drops the caller's avatar image + its on-disk file.
func DeleteAvatarHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	deleteUserImage(w, r, uid, "avatar")
}

// DeleteBannerHandler drops the caller's banner image + its on-disk file.
func DeleteBannerHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	deleteUserImage(w, r, uid, "banner")
}

func deleteUserImage(w http.ResponseWriter, r *http.Request, uid int64, kind string) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewUserRepository(con)
	if err := repo.ClearUserImage(uid, kind); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	user, err := repo.GetByID(uid)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, toProfileResponse(user, false))
}

// ── Public profile + image streams (no auth needed for the image bytes) ───

// GetUserProfileHandler returns the public-facing profile for any user by
// id. Email is redacted (publicView=true). The page is reachable without a
// session so an eventual public profile page can render before login.
func GetUserProfileHandler(w http.ResponseWriter, r *http.Request) {
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
	user, err := repository.NewUserRepository(con).GetByID(id)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	writeJSON(w, toProfileResponse(user, true))
}

// streamUserImage serves the on-disk bytes for either the avatar or the
// banner of the user identified by {id}. It's public (no auth gate) because
// the image carries no secret — it's just the picture the user picked — and
// the SPA needs to render it on the login page / a public profile eventually.
// 204 (no content) when the user hasn't uploaded one so the SPA's <img
// onerror> doesn't fire.
func streamUserImage(w http.ResponseWriter, r *http.Request, id int64, kind string) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewUserRepository(con)
	// getUserImage + UserImageDiskPath are unexported, but we expose the
	// public helper ImageBytes via a tiny shim. We resolve the meta here.
	img, ok, err := repo.GetUserImageMeta(id, kind)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !ok {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Optional ?max=<bytes> cap (used by the admin Users grid so an admin can
	// suppress large avatars/banners that would otherwise slow the page down
	// when many cards render at once). When the on-disk file is larger than
	// the supplied cap we treat it as "do not load" and answer 204 — the same
	// no-image signal the SPA already handles for users who never uploaded
	// one, so the <img> falls back to the symbol tile rather than firing
	// onerror.
	max := parseMaxImageQuery(r)
	if max > 0 {
		path := repository.UserImageDiskPath(id, img)
		if info, err := os.Stat(path); err == nil && info.Size() > int64(max) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	w.Header().Set("Content-Type", img.Mime)
	w.Header().Set("Cache-Control", "private, max-age=300")
	// We invalidate the browser cache per-upload via the filename, but the
	// ?max query affects selection not content, so the same cache key is
	// safe across cap changes only if the file size never grew past the cap
	// it was first fetched at. To avoid a stale "too big" 204 being served
	// from cache when the admin later raises the cap, vary by max.
	if max > 0 {
		w.Header().Set("Vary", "max")
	}
	http.ServeFile(w, r, repository.UserImageDiskPath(id, img))
}

// parseMaxImageQuery reads the optional ?max=<bytes> avatar/banner display
// cap from the request. Returns 0 when absent or non-positive, which the
// caller treats as "no cap". A garbage value is coerced to 0 so a bad query
// can't 500 the image stream.
func parseMaxImageQuery(r *http.Request) int64 {
	raw := strings.TrimSpace(r.URL.Query().Get("max"))
	if raw == "" {
		return 0
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// UserAvatarImageHandler streams a user's avatar bytes (public).
func UserAvatarImageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	streamUserImage(w, r, id, "avatar")
}

// UserBannerImageHandler streams a user's banner bytes (public).
func UserBannerImageHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	streamUserImage(w, r, id, "banner")
}

// imageMimeFromExt mirrors mimeFromExt in settings_handler.go. Kept here so
// the user-image handlers stay self-contained; the two lists are intentionally
// identical so a user can upload the same image types as the panel logo.
func imageMimeFromExt(ext string) string {
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
