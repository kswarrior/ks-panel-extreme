package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// SecurityLockoutStatusHandler serves GET /api/security/authentication/lockout:
// the effective login-protection policy (the AccountLockout instance is
// process-local with fixed thresholds — surfaced read-only, not editable)
// plus every currently locked account so an admin can undo a lockout.
func SecurityLockoutStatusHandler(w http.ResponseWriter, r *http.Request) {
	al := auth.AccountLockoutInstance
	maxAttempts, windowMinutes, lockMinutes := al.Policy()
	type lockedAccount struct {
		Username string    `json:"username"`
		LockedAt time.Time `json:"locked_at"`
	}
	lockedList := make([]lockedAccount, 0)
	for _, la := range al.LockedAccounts() {
		lockedList = append(lockedList, lockedAccount{Username: la.Username, LockedAt: la.LockedAt})
	}
	writeJSON(w, map[string]interface{}{
		"max_attempts":    maxAttempts,
		"window_minutes":  windowMinutes,
		"lockout_minutes": lockMinutes,
		"locked":          lockedList,
	})
}

// SecurityUnlockAccountHandler serves POST /api/security/authentication/unlock:
// clears the failed-attempt state for one identifier.
func SecurityUnlockAccountHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	auth.AccountLockoutInstance.UnlockAccount(req.Username)
	writeJSON(w, map[string]interface{}{"status": "ok"})
}

// SecurityRecoveryCodesStatusHandler serves GET /api/security/authentication/recovery-codes:
// aggregate counts only — never codes themselves.
func SecurityRecoveryCodesStatusHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	users, unused, err := repository.NewRecoveryCodeRepository(con).Summary()
	if err != nil {
		log.Println("recovery codes summary:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]interface{}{
		"users_with_codes": users,
		"unused_codes":     unused,
	})
}

// SecurityRecoveryCodesGenerateHandler serves POST
// /api/security/authentication/recovery-codes/generate {username, count}:
// mints a replacement recovery-code set for a user. The plaintext codes are
// returned EXACTLY ONCE in this response; only bcrypt hashes are stored.
func SecurityRecoveryCodesGenerateHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Count    int    `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if req.Count == 0 {
		req.Count = 8
	}
	if req.Count < 6 {
		req.Count = 6
	}
	if req.Count > 12 {
		req.Count = 12
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	user, err := repository.NewUserRepository(con).GetByUsernameOrEmail(req.Username)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	codes := auth.NewMFAManager().GenerateBackupCodes(req.Count)
	if err := repository.NewRecoveryCodeRepository(con).ReplaceForUser(user.ID, codes); err != nil {
		log.Println("recovery codes replace:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryAuth,
		Action:      "recovery_codes_regenerated",
		TargetID:    &user.ID,
		TargetLabel: user.Username,
		Message:     "regenerated MFA recovery codes",
	})
	writeJSON(w, map[string]interface{}{"codes": codes})
}

// SecurityRecoveryCodesConsumeHandler serves POST
// /api/security/authentication/recovery-codes/consume {username, code}:
// marks a single code as used. Exposed for support flows and future login
// integration; it can only burn a code, never reveal one.
func SecurityRecoveryCodesConsumeHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Code     string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Code == "" {
		http.Error(w, "username and code are required", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	user, err := repository.NewUserRepository(con).GetByUsernameOrEmail(req.Username)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	ok, err := repository.NewRecoveryCodeRepository(con).Consume(user.ID, req.Code)
	if err != nil {
		log.Println("recovery codes consume:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]interface{}{"valid": ok})
}
