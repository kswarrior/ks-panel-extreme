package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/oauth"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// oauthStateCookieName scopes the anti-CSRF state cookie to the OAuth
// routes. Deliberately NOT __Host--prefixed so plain-http dev installs can
// still complete a flow; it carries only a short-lived random nonce, never
// an identity, and is HttpOnly + SameSite=Lax (Lax because the provider's
// top-level redirect back to the callback is a cross-site navigation that
// SameSite=Strict cookies would not survive).
const oauthStateCookieName = "kspanel_oauth_state"

// oauthStateTTL bounds how long may pass between "click Continue with X"
// and "provider redirects back" before the state expires.
const oauthStateTTL = 10 * time.Minute

// oauthHTTPClient bounds the outbound provider round-trips (token exchange
// + userinfo) so a hung provider endpoint can't pin panel workers.
var oauthHTTPClient = &http.Client{Timeout: 15 * time.Second}

type oauthProviderPublic struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// OAuthPublicProvidersHandler lists the providers that are BOTH admin-
// enabled AND fully configured, for the public login/register pages to
// render their "Continue with ..." buttons. No credentials, just ids and
// labels.
func OAuthPublicProvidersHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	out := providerInventory(con)
	if out == nil {
		out = []oauthProviderPublic{}
	}
	writeJSON(w, out)
}

// findUsableProvider returns the provider config when it is enabled AND
// fully configured; nil otherwise. Both start and callback gate on this so
// a half-configured provider can never mint a login.
func findUsableProvider(con *sql.DB, id string) *models.AuthorityProvider {
	cfg, err := repository.NewAuthorityRepository(con).GetRaw()
	if err != nil {
		return nil
	}
	p := cfg.ProviderByID(strings.ToLower(strings.TrimSpace(id)))
	if p == nil || !p.Enabled || !oauth.Configured(*p) || oauth.Label(p.ID) == "" {
		return nil
	}
	return p
}

// OAuthStartHandler begins the authorization-code flow:
//
//	GET /api/auth/oauth/{provider}/start
//
// It validates the provider is usable, drops a single-use state cookie and
// 302s the browser to the provider's authorize URL. The state cookie is
// what makes the callback provably initiated by THIS panel (CSRF defense).
func OAuthStartHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := chi.URLParam(r, "provider")
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("oauth start: db open:", err)
		oauthFail(w, r, "server error")
		return
	}
	defer con.Close()

	p := findUsableProvider(con, id)
	if p == nil {
		oauthFail(w, r, fmt.Sprintf("%s sign-in is not available", id))
		return
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		oauthFail(w, r, "server error")
		return
	}
	state := hex.EncodeToString(raw)

	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    state + ":" + p.ID,
		Path:     "/api/auth/oauth",
		HttpOnly: true,
		Secure:   auth.IsSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(oauthStateTTL),
		MaxAge:   int(oauthStateTTL.Seconds()),
	})

	authURL, err := oauth.AuthCodeURL(r, *p, state)
	if err != nil {
		oauthFail(w, r, "server error")
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

// OAuthCallbackHandler completes the authorization-code flow:
//
//	GET  /api/auth/oauth/{provider}/callback   (query mode)
//	POST /api/auth/oauth/{provider}/callback   (Apple form_post mode)
//
// It validates the state cookie against the returned state (constant-time),
// exchanges the code at the provider, resolves-or-registers the panel user,
// issues the exact same signed session cookie as password login, and bounces
// the browser into the SPA. Every failure path lands back on the login page
// with an oauth_error message instead of leaking internals.
func OAuthCallbackHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.ToLower(chi.URLParam(r, "provider"))

	// The state check runs before anything else and the cookie is always
	// consumed: a state can never be replayed for a second login.
	stateCookie, err := r.Cookie(oauthStateCookieName)
	clearState := &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    "",
		Path:     "/api/auth/oauth",
		HttpOnly: true,
		Secure:   auth.IsSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Now().Add(-1 * time.Hour),
	}
	http.SetCookie(w, clearState)
	if err != nil || stateCookie == nil || stateCookie.Value == "" {
		oauthFail(w, r, "sign-in session expired — try again")
		return
	}
	parts := strings.SplitN(stateCookie.Value, ":", 2)
	if len(parts) != 2 || parts[1] != id {
		oauthFail(w, r, "sign-in session expired — try again")
		return
	}
	if err := r.ParseForm(); err != nil {
		oauthFail(w, r, "malformed provider response")
		return
	}
	returnedState := r.FormValue("state")
	code := r.FormValue("code")
	if code == "" {
		// Provider bounced the user out (denied consent, wrong creds…).
		providerErr := r.FormValue("error_description")
		if providerErr == "" {
			providerErr = r.FormValue("error")
		}
		if providerErr != "" {
			oauthFail(w, r, "provider refused: "+providerErr)
			return
		}
		oauthFail(w, r, "missing authorization code")
		return
	}
	// Constant-time compare so timing cannot leak the nonce.
	expected := []byte(parts[0])
	got := []byte(returnedState)
	if len(expected) == 0 || !hmac.Equal(expected, got) {
		oauthFail(w, r, "invalid sign-in state — try again")
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		log.Println("oauth callback: db open:", err)
		oauthFail(w, r, "server error")
		return
	}
	defer con.Close()

	p := findUsableProvider(con, id)
	if p == nil {
		oauthFail(w, r, fmt.Sprintf("%s sign-in is not available", id))
		return
	}

	profile, err := oauth.ExchangeCode(r.Context(), oauthHTTPClient, r, *p, code)
	if err != nil {
		// Never log tokens or raw provider bodies — just the failure shape.
		log.Printf("oauth %s exchange failed: %v", p.ID, err)
		oauthFail(w, r, "could not complete "+id+" sign-in")
		return
	}
	if profile.Email == "" {
		oauthFail(w, r, id+" did not share an email address with the panel")
		return
	}
	if !profile.Verified && repository.NewSettingsRepository(con).IsVerifyRequired() {
		oauthFail(w, r, id+" has not verified that email address")
		return
	}

	userRepo := repository.NewUserRepository(con)
	user, err := userRepo.GetByUsernameOrEmail(profile.Email)
	if err != nil || user == nil {
		user, err = oauthRegisterUser(w, r, con, p.ID, profile)
		if err != nil {
			log.Printf("oauth %s register: %v", p.ID, err)
			oauthFail(w, r, err.Error())
			return
		}
	} else if !profile.Verified {
		// Unverified provider email must never auto-merge onto an existing
		// account — otherwise anyone controlling a GitHub/Discord/etc account
		// can set its unverified email to a victim's panel address and log
		// in as them. The IsVerifyRequired toggle is an admin UX choice for
		// the registration flow, not a security gate for account merges.
		oauthFail(w, r, id+" has not verified that email address")
		return
	}

	if suspended, until, serr := userRepo.IsUserSuspended(user.ID); serr == nil && suspended {
		msg := "account suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("account suspended until %s", until.Format("2006-01-02 15:04"))
		}
		RecordActivity(r, repository.ActivityInput{
			UserID:      &user.ID,
			Username:    user.Username,
			Category:    models.ActivityCategoryAuth,
			Action:      "login_blocked_suspended",
			TargetLabel: user.Username,
			Message:     msg,
		})
		oauthFail(w, r, msg)
		return
	}
	if repository.NewSettingsRepository(con).IsVerifyRequired() && !userRepo.IsEmailVerified(user.ID) {
		oauthFail(w, r, "email not verified")
		return
	}

	roleName := ""
	if role, rerr := repository.NewRoleRepository(con).GetRoleByID(user.RoleID); rerr == nil && role != nil {
		roleName = role.Name
	}

	cookieVal := auth.GenerateSessionToken(user.ID, time.Now())
	http.SetCookie(w, auth.NewSessionCookie(r, cookieVal, time.Now().Add(auth.SessionTTL())))
	auth.SessionManagerInstance.CreateSession(user.ID, cookieVal, r.RemoteAddr, r.UserAgent())

	RecordActivity(r, repository.ActivityInput{
		UserID:      &user.ID,
		Username:    user.Username,
		Role:        roleName,
		Category:    models.ActivityCategoryAuth,
		Action:      "login",
		TargetLabel: user.Username,
		Message:     fmt.Sprintf("logged in via %s oauth", p.ID),
	})

	http.Redirect(w, r, "/", http.StatusFound)
}

// oauthFail bounces the browser back to the login page with a user-safe
// message. The message is the ONLY thing echoed — provider responses,
// tokens and stack details stay server-side.
func oauthFail(w http.ResponseWriter, r *http.Request, msg string) {
	target := "/auth/login?oauth_error=" + url.QueryEscape(msg)
	http.Redirect(w, r, target, http.StatusFound)
}

// oauthRegisterUser provisions a fresh panel account for an OAuth identity
// nobody matches. It mirrors RegisterHandler's gates exactly: registration
// must be enabled, the register role must exist and never be "admin", and
// the per-device account cap applies. The account gets an UNUSABLE random
// password (sign-in stays OAuth until the owner sets a password) and is
// marked verified when the provider vouches for the address.
func oauthRegisterUser(w http.ResponseWriter, r *http.Request, con *sql.DB, providerID string, profile *oauth.Profile) (*models.User, error) {
	settingsRepo := repository.NewSettingsRepository(con)
	if !settingsRepo.IsRegisterAllowed() {
		return nil, fmt.Errorf("no panel account matches your %s email and registration is disabled", providerID)
	}
	roleRepo := repository.NewRoleRepository(con)
	role, err := roleRepo.GetRoleByName(settingsRepo.RegisterRoleName())
	if err != nil || role == nil {
		role, err = roleRepo.GetRoleByName("user")
		if err != nil || role == nil {
			log.Println("oauth register: base 'user' role missing:", err)
			return nil, fmt.Errorf("registration unavailable")
		}
	}
	if role.Name == "admin" {
		log.Println("oauth register: refusing to self-register into admin role")
		return nil, fmt.Errorf("registration unavailable")
	}

	// Same per-device cap as password self-registration.
	deviceRepo := repository.NewDeviceRegistrationRepository(con)
	deviceID := deviceIDFromRequest(r)
	if deviceID == "" {
		deviceID, err = repository.NewDeviceID()
		if err != nil {
			return nil, fmt.Errorf("server error")
		}
		setDeviceCookie(w, r, deviceID)
	}
	if limit := settingsRepo.DeviceAccountLimit(); limit > 0 {
		if deviceRepo.CountForDevice(deviceID) >= limit {
			return nil, fmt.Errorf("account limit reached for this device")
		}
	}

	username, err := uniqueUsername(con, profile.DisplayName, profile.Email)
	if err != nil {
		return nil, err
	}

	// Unusable password: 32 random bytes through bcrypt. Nobody (including
	// the owner) knows it; only OAuth can sign this account in unless the
	// owner later sets a real password via change-password.
	pwRaw := make([]byte, 32)
	if _, err := rand.Read(pwRaw); err != nil {
		return nil, fmt.Errorf("server error")
	}
	hash, err := auth.HashPassword(hex.EncodeToString(pwRaw))
	if err != nil {
		return nil, fmt.Errorf("server error")
	}

	u := models.User{Username: username, Email: profile.Email, PasswordHash: hash, RoleID: role.ID}
	userRepo := repository.NewUserRepository(con)
	if err := userRepo.AdminCreateUser(u); err != nil {
		log.Println("oauth register: create user:", err)
		return nil, fmt.Errorf("could not create the panel account")
	}
	user, err := userRepo.GetByUsernameOrEmail(profile.Email)
	if err != nil || user == nil {
		return nil, fmt.Errorf("could not load the created account")
	}
	if profile.Verified {
		if verr := userRepo.MarkEmailVerified(user.ID); verr != nil {
			log.Println("oauth register: mark verified:", verr)
		}
	}
	if recErr := deviceRepo.Record(deviceID, user.ID, profile.Email); recErr != nil {
		log.Println("oauth register: record device:", recErr)
	}
	RecordActivity(r, repository.ActivityInput{
		UserID:      &user.ID,
		Username:    user.Username,
		Category:    models.ActivityCategoryAuth,
		Action:      "register",
		TargetLabel: user.Username,
		Message:     fmt.Sprintf("account created via %s oauth into role %q", providerID, role.Name),
	})
	return user, nil
}

// uniqueUsername derives a free username from the display name or email
// local-part, appending numeric suffixes on collision.
func uniqueUsername(con *sql.DB, displayName, email string) (string, error) {
	repo := repository.NewUserRepository(con)
	base := sanitizeUsername(displayName)
	if base == "" {
		local, _, found := strings.Cut(strings.TrimSpace(email), "@")
		if !found || local == "" {
			return "", fmt.Errorf("could not derive a username from the provider profile")
		}
		base = sanitizeUsername(local)
	}
	if base == "" {
		base = "user"
	}
	candidate := base
	for i := 1; ; i++ {
		existing, err := repo.GetByUsername(candidate)
		if err != nil || existing == nil {
			return candidate, nil
		}
		if i > 999 {
			return "", fmt.Errorf("could not derive a free username")
		}
		candidate = fmt.Sprintf("%s%d", base, i)
	}
}

// sanitizeUsername keeps [a-zA-Z0-9._-] only, trimmed to 32 chars — the
// loosest shape the rest of the panel already accepts.
func sanitizeUsername(in string) string {
	var b strings.Builder
	in = strings.TrimSpace(in)
	for _, r := range in {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
			b.WriteRune(r)
		}
		if b.Len() >= 32 {
			break
		}
	}
	return strings.Trim(b.String(), "-._")
}
