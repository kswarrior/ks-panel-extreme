package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/oauth"
	"github.com/example/kspanel/internal/repository"
)

// DeviceCookieName is the long-lived cookie we use to recognize a returning
// browser across registrations so the "accounts per device" limit can be
// enforced. It's NOT an authentication token — it only identifies a device
// for the registration flow, so HttpOnly + a 10-year expiry keeps it sticky
// without exposing it to JS.
// Uses __Host- prefix for additional security (requires Secure, Path=/, no Domain)
const DeviceCookieName = "__Host-device_id"

// registerRequest is the JSON body sent by the SPA's /auth/register page.
// Role is intentionally omitted: self-registered users always get the
// built-in "user" role so the public registration endpoint can never mint
// an admin (the admin flow is /api/users under MANAGE_USERS).
type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RegisterHandler creates a brand-new self-service account. It only runs when
// the operator has enabled register_allow in Settings; when disabled it
// returns 403 so the SPA can surface "registration is disabled" cleanly.
//
// If verify_required is also on, the new account is left unverified (the
// users.email_verified column defaults to 0): the user must drive the verify
// page before LoginHandler (which checks the toggle) lets them in. We mint a
// verification code + email right here so the very next thing the user sees
// on the verify page is "check your inbox".
func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Username == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "username, email and password are required", http.StatusBadRequest)
		return
	}
	// Validate password with complexity policy (driven by Authority config)
	policy := resolvePasswordPolicy()
	if err := auth.ValidatePassword(req.Password, policy, req.Username, req.Email); err != nil {
		http.Error(w, "password validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	settingsRepo := repository.NewSettingsRepository(con)
	if !settingsRepo.IsRegisterAllowed() {
		http.Error(w, "registration is disabled", http.StatusForbidden)
		return
	}

	// Resolve the role self-registered accounts land in. The admin picks it
	// from the Settings page (defaults to "user"); we refuse to mint an
	// account when the configured role is missing so a mis-seeded DB or a
	// deleted role can't hand out role_id=0. We additionally refuse the
	// "admin" role as a register target as a hard safety net — admins are
	// always minted through the gated /api/users flow.
	roleRepo := repository.NewRoleRepository(con)
	registerRoleName := settingsRepo.RegisterRoleName()
	role, err := roleRepo.GetRoleByName(registerRoleName)
	if err != nil || role == nil {
		// Fall back to the built-in "user" role when the configured name
		// is stale (e.g. the role was deleted) so registration never 500s
		// because of a stale settings row.
		role, err = roleRepo.GetRoleByName("user")
		if err != nil || role == nil {
			log.Println("RegisterHandler: base 'user' role missing:", err)
			http.Error(w, "registration unavailable", http.StatusInternalServerError)
			return
		}
	}
	if role.Name == "admin" {
		log.Println("RegisterHandler: refusing to self-register into admin role")
		http.Error(w, "registration unavailable", http.StatusInternalServerError)
		return
	}

	// Device account limit — enforce per-device caps before we create the
	// account so a limit-breach never persists a half-created user. The
	// device id travels in a long-lived cookie (DeviceCookieName); when
	// absent we mint a fresh one and Set-Cookie it on the response.
	deviceRepo := repository.NewDeviceRegistrationRepository(con)
	deviceID := deviceIDFromRequest(r)
	if deviceID == "" {
		deviceID, err = repository.NewDeviceID()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		setDeviceCookie(w, r, deviceID)
	}
	if limit := settingsRepo.DeviceAccountLimit(); limit > 0 {
		if deviceRepo.CountForDevice(deviceID) >= limit {
			http.Error(w, "account limit reached for this device", http.StatusForbidden)
			return
		}
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	u := models.User{Username: req.Username, Email: req.Email, PasswordHash: hash, RoleID: role.ID}
	userRepo := repository.NewUserRepository(con)
	if err := userRepo.AdminCreateUser(u); err != nil {
		log.Println("RegisterHandler create user:", err)
		http.Error(w, "username or email already exists", http.StatusConflict)
		return
	}
	// Record the registration against the device id for limit accounting.
	// Best-effort: a failure here doesn't block the just-created account,
	// but we log so the operator notices a drifted device table.
	if recErr := deviceRepo.Record(deviceID, 0, req.Email); recErr != nil {
		log.Println("RegisterHandler record device:", recErr)
	}

	panelName, _ := settingsRepo.GetPanelName()
	resp := map[string]any{
		"username": req.Username,
		"email":    req.Email,
		"verify":   false,
	}

	if settingsRepo.IsVerifyRequired() {
		// Mint the code + fire the email now so the verify page can render
		// "we sent a code to <email>" without needing a second click.
		vcode, cerr := userRepo.CreateVerificationCode(req.Email)
		if cerr != nil {
			log.Println("RegisterHandler create code:", cerr)
		} else {
			if serr := settingsRepo.SMTPSender().SendVerificationCode(req.Email, vcode.Code, panelName); serr != nil {
				log.Println("RegisterHandler send email:", serr)
			}
		}
		resp["verify"] = true
	}
	RecordActivity(r, repository.ActivityInput{
		Username:    req.Username,
		Category:    models.ActivityCategoryAuth,
		Action:      "register",
		TargetLabel: req.Username,
		Message:     fmt.Sprintf("self-registered into role %q (verify=%v)", role.Name, resp["verify"]),
	})
	writeJSON(w, resp)
}

// sendVerifyRequest lets the verify page request a fresh code for the email
// the SPA already knows (the user landed there from the register form).
type sendVerifyRequest struct {
	Email string `json:"email"`
}

// SendVerifyCodeHandler resends the verification code to the supplied email
// address. Intended to back the "Send code" button on the verify page. We
// don't reveal whether the email exists (404 == 200 response shape) so an
// attacker can't enumerate accounts — they hit the same JSON each time.
func SendVerifyCodeHandler(w http.ResponseWriter, r *http.Request) {
	var req sendVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	settingsRepo := repository.NewSettingsRepository(con)
	if !settingsRepo.IsVerifyRequired() {
		// No-op response so the SPA reproduces a friendly OK even when the
		// toggle is off (the admin might have disabled it after the register
		// flow started; in that case there's nothing to send).
		writeJSON(w, map[string]any{"sent": false})
		return
	}
	// Only mint a code if a user with this email actually exists. We always
	// return the same JSON so the response can't be used for enumeration.
	userRepo := repository.NewUserRepository(con)
	if user, _ := userRepo.GetByUsernameOrEmail(email); user != nil {
		code, cerr := userRepo.CreateVerificationCode(user.Email)
		if cerr == nil {
			panelName, _ := settingsRepo.GetPanelName()
			if serr := settingsRepo.SMTPSender().SendVerificationCode(user.Email, code.Code, panelName); serr != nil {
				log.Println("SendVerifyCodeHandler send email:", serr)
				writeJSON(w, map[string]any{"sent": false, "error": "could not send email"})
				return
			}
		}
	}
	writeJSON(w, map[string]any{"sent": true})
}

// verifyEmailRequest is the body the verify page posts to confirm the code.
type verifyEmailRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// VerifyEmailHandler confirms the supplied code against the supplied email,
// marks the matching user verified, and tells the SPA to redirect to login.
// On success the consumed row can't be reused; the SPA shows a success toast
// and bounces to /auth/login.
func VerifyEmailHandler(w http.ResponseWriter, r *http.Request) {
	var req verifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Code == "" {
		http.Error(w, "email and code are required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	userRepo := repository.NewUserRepository(con)
	ok, err := userRepo.ConsumeVerificationCode(req.Email, req.Code)
	if err != nil {
		http.Error(w, "invalid or expired code", http.StatusBadRequest)
		return
	}
	if !ok {
		http.Error(w, "invalid or expired code", http.StatusBadRequest)
		return
	}
	user, err := userRepo.GetByUsernameOrEmail(req.Email)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err := userRepo.MarkEmailVerified(user.ID); err != nil {
		http.Error(w, "could not verify email", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Username:    user.Username,
		UserID:      &user.ID,
		Category:    models.ActivityCategoryAuth,
		Action:      "verify_email",
		TargetLabel: user.Username,
		Message:     "verified email",
	})
	writeJSON(w, map[string]any{"verified": true})
}

// PublicKeyHandler is the tiny public read the SPA uses to decide whether to
// render the "Create new account" link on the login page. It reuses the same
// bootstrap snapshot minus the SMTP details (those stay admin-only).
func PublicAuthFlagsHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		writeJSON(w, map[string]any{
			"register_allow":               false,
			"verify_required":              false,
			"session_lifetime_minutes":     480,
			"session_idle_timeout_minutes": 1440,
			"session_max_per_user":         0,
			"password_policy": map[string]any{
				"min_length":     12,
				"max_length":     128,
				"require_upper":  true,
				"require_lower":  true,
				"require_number": true,
				"require_symbol": true,
				"no_common":      true,
				"no_personal":    true,
			},
		})
		return
	}
	defer con.Close()
	repo := repository.NewSettingsRepository(con)
	limit := repo.DeviceAccountLimit()
	// Report the current device's account usage so the SPA can warn on the
	// register page ("you've used N of M accounts from this device").
	// Only counting self-registrations; admin-created accounts skip this.
	deviceID := deviceIDFromRequest(r)
	used := 0
	if deviceID != "" {
		used = repository.NewDeviceRegistrationRepository(con).CountForDevice(deviceID)
	}
	// Enabled + fully configured OAuth providers, so the login page renders
	// its "Continue with ..." buttons in the same round-trip. Ids/labels
	// only — never credentials.
	oauthProviders := []map[string]string{}
	for _, p := range providerInventory(con) {
		oauthProviders = append(oauthProviders, map[string]string{"id": p.ID, "label": p.Label})
	}
	// Real security session policy (from Security -> Sessions tab).
	// Public read so login page can show "Auto logout after X" with real data
	// without requiring auth; these values are not sensitive.
	secCfg := repository.NewSecurityRepository(con).GetConfig()
	// Real password policy (from Authority -> Password provider).
	// Public so register page can render live per-rule checklist with red/green dots.
	authCfg, _ := repository.NewAuthorityRepository(con).GetRaw()
	var pwdPolicy any = nil
	if authCfg != nil && authCfg.PasswordPolicy != nil {
		pwdPolicy = authCfg.PasswordPolicy
	} else {
		// Fallback to secure defaults matching auth.DefaultPasswordPolicy()
		pwdPolicy = map[string]any{
			"min_length":     12,
			"max_length":     128,
			"require_upper":  true,
			"require_lower":  true,
			"require_number": true,
			"require_symbol": true,
			"no_common":      true,
			"no_personal":    true,
		}
	}
	writeJSON(w, map[string]any{
		"register_allow":               repo.IsRegisterAllowed(),
		"verify_required":              repo.IsVerifyRequired(),
		"device_limit":                 limit,
		"device_used":                  used,
		"has_device_cookie":            deviceID != "",
		"oauth_providers":              oauthProviders,
		"session_lifetime_minutes":     secCfg.SessionLifetimeMinutes,
		"session_idle_timeout_minutes": secCfg.SessionIdleTimeoutMinutes,
		"session_max_per_user":         secCfg.SessionMaxPerUser,
		"password_policy":              pwdPolicy,
	})
}

// providerInventory returns the usable OAuth providers (enabled +
// configured) in a shape both this handler and the OAuth routes share.
func providerInventory(con *sql.DB) []oauthProviderPublic {
	cfg, err := repository.NewAuthorityRepository(con).GetRaw()
	if err != nil {
		return nil
	}
	out := make([]oauthProviderPublic, 0, len(cfg.Providers))
	for _, p := range cfg.Providers {
		if !p.Enabled || !oauth.Configured(p) {
			continue
		}
		label := oauth.Label(p.ID)
		if label == "" {
			continue
		}
		out = append(out, oauthProviderPublic{ID: p.ID, Label: label})
	}
	return out
}

// DeviceIdHandler mints a brand-new device id on first visit and Set-Cookies
// it back so the next /auth/register call carries it. Intended for the SPA to
// call from the register page on mount when no cookie is present. Returns
// the id in the body too so the SPA can store it without re-reading cookies.
func DeviceIdHandler(w http.ResponseWriter, r *http.Request) {
	deviceID := deviceIDFromRequest(r)
	if deviceID == "" {
		var err error
		deviceID, err = repository.NewDeviceID()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		setDeviceCookie(w, r, deviceID)
	}
	writeJSON(w, map[string]any{"device_id": deviceID})
}

// deviceIDFromRequest reads the device id cookie, returning "" when absent
// or malformed. We deliberately don't trust a client-supplied id other than
// the one we issued: only the cookie value (HttpOnly, not JS-writable in
// practice) is honored.
func deviceIDFromRequest(r *http.Request) string {
	c, err := r.Cookie(DeviceCookieName)
	if err != nil || c == nil {
		return ""
	}
	v := strings.TrimSpace(c.Value)
	if len(v) < 16 || len(v) > 64 {
		return ""
	}
	return v
}

// setDeviceCookie writes the device id into a long-lived HttpOnly cookie so
// the same browser is recognized across registrations. SameSite=Lax keeps it
// portable with the SPA's redirect / navigation patterns.
// The __Host- prefix REQUIRES Secure per RFC 6265bis: browsers discard the
// cookie when Secure is missing, which silently disables the per-device
// account limit on plain-HTTP hosts. Secure cookies are accepted from
// trustworthy origins (localhost over plain HTTP), so always set it like
// the session cookie does.
func setDeviceCookie(w http.ResponseWriter, r *http.Request, deviceID string) {
	c := &http.Cookie{
		Name:     DeviceCookieName,
		Value:    deviceID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(10 * 365 * 24 * time.Hour),
		Secure:   true,
	}
	_ = r
	http.SetCookie(w, c)
}
