package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
)

// CtxKey is the unexported context-key type used to namespace kspanel's
// request-scoped context values. It is shared with the api package's
// AuthMiddleware so both write and read the user ID under the same key.
type ctxKey string

// UserIDKey is the context key under which the authenticated user ID is
// stored by AuthMiddleware. It is exported so other packages can read
// (and write) the value using the exact same key instance.
const UserIDKey ctxKey = "userID"

// UserIDFromContext returns the authenticated user ID stored in the
// request context by AuthMiddleware, or an error when no user is set.
func UserIDFromContext(r *http.Request) (int64, error) {
	raw := r.Context().Value(UserIDKey)
	uid, ok := raw.(int64)
	if !ok {
		return 0, http.ErrNoCookie
	}
	return uid, nil
}

type loginRequest struct {
	// Identifier is accepted in place of Username so a client may send either
	// a username or an email. We still accept "username" for back-compat.
	Identifier string `json:"identifier"`
	Username   string `json:"username"`
	Email      string `json:"email"`
	Password   string `json:"password"`
}

type loginResponse struct {
	User        models.User `json:"user"`
	Permissions []string    `json:"permissions"`
	// SessionToken is a freshly-signed session token for the just-authenticated
	// user. It is identical to the value placed in the HttpOnly cookie when
	// `setCookie` is true. Exposing it in the body lets the SPA keep multiple
	// accounts logged in at once by storing each token (the multi-account
	// switcher) and sending the active one as `Authorization: Bearer`. It
	// never grants more than the cookie already would — same HMAC, same TTL.
	SessionToken string `json:"session_token"`
}

// LoginHandler authenticates a user and issues a signed HMAC session cookie.
// The user may identify themselves with either their username or their email.
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	// Accept the identifier from any of the supported JSON fields, in priority
	// order: "identifier" > "email" > "username". This keeps the endpoint
	// friendly to both new and pre-existing clients.
	identifier := req.Identifier
	if identifier == "" {
		identifier = req.Email
	}
	if identifier == "" {
		identifier = req.Username
	}
	if identifier == "" || req.Password == "" {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		log.Println("DB open error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	userRepo := repository.NewUserRepository(con)
	user, err := userRepo.GetByUsernameOrEmail(identifier)
	if err != nil {
		log.Println("GetByUsernameOrEmail error:", err)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Check account lockout status
	if auth.AccountLockoutInstance.IsAccountLocked(identifier) {
		lockoutTime := auth.AccountLockoutInstance.GetLockoutTime(identifier)
		w.Header().Set("Retry-After", lockoutTime.String())
		http.Error(w, "account temporarily locked due to multiple failed attempts", http.StatusTooManyRequests)
		return
	}

	if err := auth.CheckPassword(user.PasswordHash, req.Password); err != nil {
		// Record failed attempt
		auth.AccountLockoutInstance.RecordFailedAttempt(identifier)

		log.Println("Password check error:", err)
		RecordActivity(r, repository.ActivityInput{
			Username:    user.Username,
			UserID:      &user.ID,
			Category:    models.ActivityCategoryAuth,
			Action:      "login_failed",
			TargetLabel: user.Username,
			Message:     "failed login attempt (wrong password)",
		})
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Enforce email verification when the operator has turned the toggle on.
	// The gate sits here (not at register) so an admin who flips the setting
	// AFTER a user self-registered still forces that user to verify before
	// they're let in. We bypass the gate when the toggle is off so existing
	// installations stay login-friendly after the migration.
	if settingsRepo := repository.NewSettingsRepository(con); settingsRepo.IsVerifyRequired() {
		if !repository.NewUserRepository(con).IsEmailVerified(user.ID) {
			http.Error(w, "email not verified", http.StatusForbidden)
			return
		}
	}

	// Check if user is suspended
	if suspended, suspendedUntil, err := userRepo.IsUserSuspended(user.ID); err == nil && suspended {
		var msg string
		if suspendedUntil != nil {
			msg = fmt.Sprintf("account suspended until %s", suspendedUntil.Format("2006-01-02 15:04"))
		} else {
			msg = "account suspended indefinitely"
		}
		RecordActivity(r, repository.ActivityInput{
			Username:    user.Username,
			UserID:      &user.ID,
			Category:    models.ActivityCategoryAuth,
			Action:      "login_blocked_suspended",
			TargetLabel: user.Username,
			Message:     msg,
		})
		http.Error(w, msg, http.StatusForbidden)
		return
	}

	// Check if user requires MFA
	// This would normally check the database for MFA settings
	requiresMFA := false

	if requiresMFA {
		// Return MFA required response
		response := map[string]interface{}{
			"requires_mfa": true,
			"user":         user,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	permChecker := permissions.NewChecker(con)
	perms, err := permChecker.ListUserPermissions(user.ID)
	if err != nil {
		http.Error(w, "failed to load permissions", http.StatusInternalServerError)
		return
	}

	// Look up the role display name for the audit entry / future use.
	roleName := ""
	if role, rerr := repository.NewRoleRepository(con).GetRoleByID(user.RoleID); rerr == nil && role != nil {
		roleName = role.Name
	}

	// Reset failed attempts on successful login
	auth.AccountLockoutInstance.ResetAttempts(identifier)

	// Create session
	cookieVal, err := auth.GenerateSessionToken(user.ID, time.Now())
	if err != nil {
		log.Println("GenerateSessionToken error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, auth.NewSessionCookie(r, cookieVal, time.Now().Add(auth.SessionTTL())))

	// Record session in session manager
	auth.SessionManagerInstance.CreateSession(user.ID, cookieVal, r.RemoteAddr, r.UserAgent())

	RecordActivity(r, repository.ActivityInput{
		Username:    user.Username,
		Role:        roleName,
		UserID:      &user.ID,
		Category:    models.ActivityCategoryAuth,
		Action:      "login",
		TargetLabel: user.Username,
		Message:     "logged in",
	})

	writeLoginResponse(w, r, user, perms, cookieVal)
}

// writeLoginResponse serializes the login payload. The `token` is what was
// just signed into the cookie (the caller mints it; we just echo it back so
// the SPA can hold it for the multi-account switcher without re-signing).
func writeLoginResponse(w http.ResponseWriter, r *http.Request, user *models.User, perms []string, token string) {
	_ = r
	resp := loginResponse{User: *user, Permissions: perms, SessionToken: token}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// LogoutHandler invalidates the session by revoking the tracked credential
// (cookie or Bearer — whichever the request authenticated with) and
// clearing the cookie. Without the revocation the token would stay valid
// until its TTL even though the user logged out.
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if tok := callerSessionToken(r); tok != "" {
		auth.SessionManagerInstance.InvalidateSession(tok)
	}
	http.SetCookie(w, auth.ClearSessionCookie(r))
	w.WriteHeader(http.StatusOK)
}

// SwitchLoginHandler authenticates a user exactly like LoginHandler but DOES
// NOT set the session cookie. It's the entry point for the SPA's "add
// account" / multi-account switcher: a second login where the resulting
// token is returned in the body so the SPA can hold it alongside the
// already-logged-in account without clobbering the primary cookie. The
// active account is then chosen client-side and sent as `Authorization:
// Bearer` (which AuthMiddleware accepts in place of the cookie).
//
// The handler reuses the same credential checks, verification gate and
// activity log entry as the normal login.
func SwitchLoginHandler(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	identifier := req.Identifier
	if identifier == "" {
		identifier = req.Email
	}
	if identifier == "" {
		identifier = req.Username
	}
	if identifier == "" || req.Password == "" {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		log.Println("DB open error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	userRepo := repository.NewUserRepository(con)
	user, err := userRepo.GetByUsernameOrEmail(identifier)
	if err != nil {
		log.Println("GetByUsernameOrEmail error:", err)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Check account lockout status — same policy as LoginHandler so the
	// switcher endpoint can't be used to brute-force around it.
	if auth.AccountLockoutInstance.IsAccountLocked(identifier) {
		lockoutTime := auth.AccountLockoutInstance.GetLockoutTime(identifier)
		w.Header().Set("Retry-After", lockoutTime.String())
		http.Error(w, "account temporarily locked due to multiple failed attempts", http.StatusTooManyRequests)
		return
	}

	if err := auth.CheckPassword(user.PasswordHash, req.Password); err != nil {
		// Record failed attempt
		auth.AccountLockoutInstance.RecordFailedAttempt(identifier)

		RecordActivity(r, repository.ActivityInput{
			Username:    user.Username,
			UserID:      &user.ID,
			Category:    models.ActivityCategoryAuth,
			Action:      "switch_login_failed",
			TargetLabel: user.Username,
			Message:     "failed switch login attempt (wrong password)",
		})
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if settingsRepo := repository.NewSettingsRepository(con); settingsRepo.IsVerifyRequired() {
		if !repository.NewUserRepository(con).IsEmailVerified(user.ID) {
			http.Error(w, "email not verified", http.StatusForbidden)
			return
		}
	}

	// Check if user is suspended
	if suspended, suspendedUntil, err := userRepo.IsUserSuspended(user.ID); err == nil && suspended {
		var msg string
		if suspendedUntil != nil {
			msg = fmt.Sprintf("account suspended until %s", suspendedUntil.Format("2006-01-02 15:04"))
		} else {
			msg = "account suspended indefinitely"
		}
		RecordActivity(r, repository.ActivityInput{
			Username:    user.Username,
			UserID:      &user.ID,
			Category:    models.ActivityCategoryAuth,
			Action:      "switch_login_blocked_suspended",
			TargetLabel: user.Username,
			Message:     msg,
		})
		http.Error(w, msg, http.StatusForbidden)
		return
	}

	permChecker := permissions.NewChecker(con)
	perms, err := permChecker.ListUserPermissions(user.ID)
	if err != nil {
		http.Error(w, "failed to load permissions", http.StatusInternalServerError)
		return
	}

	roleName := ""
	if role, rerr := repository.NewRoleRepository(con).GetRoleByID(user.RoleID); rerr == nil && role != nil {
		roleName = role.Name
	}

	// Reset failed attempts on successful login (mirrors LoginHandler).
	auth.AccountLockoutInstance.ResetAttempts(identifier)

	// No cookie here — the caller (SPA's switcher) owns the token. We only
	// record the attempt, sign a token, and hand it back in the body.
	RecordActivity(r, repository.ActivityInput{
		Username:    user.Username,
		Role:        roleName,
		UserID:      &user.ID,
		Category:    models.ActivityCategoryAuth,
		Action:      "switch_login",
		TargetLabel: user.Username,
		Message:     "logged in for account switcher (no cookie)",
	})

	tokenVal, err := auth.GenerateSessionToken(user.ID, time.Now())
	if err != nil {
		log.Println("GenerateSessionToken error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Register the switcher bearer with the session manager so it shows
	// up on the admin Sessions tab and is subject to revocation, the
	// per-user cap and the idle timeout like any cookie session.
	auth.SessionManagerInstance.CreateSession(user.ID, tokenVal, r.RemoteAddr, r.UserAgent())
	writeLoginResponse(w, r, user, perms, tokenVal)
}

// MeHandler returns the current authenticated user and permission list.
func MeHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := repository.OpenDB()
	if err != nil {
		log.Println("OpenDB error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	userRepo := repository.NewUserRepository(conn)
	user, err := userRepo.GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	permChecker := permissions.NewChecker(conn)
	perms, err := permChecker.ListUserPermissions(uid)
	if err != nil {
		log.Println("ListUserPermissions error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	resp := loginResponse{User: *user, Permissions: perms}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
