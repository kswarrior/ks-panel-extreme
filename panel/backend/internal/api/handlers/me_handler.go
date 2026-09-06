package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

type changeUsernameRequest struct {
	NewUsername string `json:"new_username"`
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangeUsername updates the caller's own username. The login flow already
// accepts username OR email so renaming keeps the user signed in.
func ChangeUsernameHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req changeUsernameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.NewUsername == "" {
		http.Error(w, "new_username is required", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewUserRepository(con)
	if err := repo.UpdateUsername(uid, req.NewUsername, uid); err != nil {
		log.Println("ChangeUsername error:", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ChangePassword requires the old password to guard against CSRF + stolen-cookie
// password resets. The user can confirm ownership of the existing account by
// re-authenticating with their chosen secret.
func ChangePasswordHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		http.Error(w, "old_password and new_password are required", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 8 {
		http.Error(w, "new password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewUserRepository(con)
	me, err := repo.GetByID(uid)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Verify ownership FIRST (fail closed): policy/history validation below
	// burns bcrypt comparisons and would otherwise let any session holder
	// probe reuse/policy oracles without knowing the current password.
	if err := auth.CheckPassword(me.PasswordHash, req.OldPassword); err != nil {
		http.Error(w, "old password is incorrect", http.StatusBadRequest)
		return
	}

	// Validate new password with complexity policy (driven by Authority config)
	policy := resolvePasswordPolicy()
	if err := auth.ValidatePassword(req.NewPassword, policy, me.Username, me.Email); err != nil {
		http.Error(w, "password validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Check password history against the hashes recorded on previous
	// changes (Authentication tab → Password History). Before migration
	// 043 this list was always empty, silently disabling reuse checks.
	historyConfig := resolvePasswordHistoryConfig()
	passwordHistory := []auth.PasswordHistory{}
	if historyConfig.Enabled && historyConfig.MaxHistory > 0 {
		hashes, err := repository.NewPasswordHistoryRepository(con).
			ListHashes(uid, historyConfig.MaxHistory)
		if err == nil {
			for _, h := range hashes {
				passwordHistory = append(passwordHistory, auth.PasswordHistory{UserID: uid, PasswordHash: h})
			}
		}
		// A failed read falls through with the empty list: the reuse
		// check degrades to no-op instead of locking the user out.
	}

	if err := auth.ValidatePasswordWithHistory(req.NewPassword, policy, passwordHistory, historyConfig, me.Username, me.Email); err != nil {
		http.Error(w, "password validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if err := repo.UpdatePassword(uid, hash); err != nil {
		http.Error(w, "could not update password", http.StatusInternalServerError)
		return
	}

	// Record the OUTGOING password's hash so it (and the previous N-1
	// hashes) are rejected as reuse on the next change.
	if historyConfig.Enabled && historyConfig.MaxHistory > 0 {
		if err := repository.NewPasswordHistoryRepository(con).
			Add(uid, me.PasswordHash, historyConfig.MaxHistory); err != nil {
			log.Println("password_history add:", err)
		}
	}

	// Invalidate all user sessions on password change
	invalidatedCount := auth.InvalidateUserSessions(uid)

	// Record password change activity
	RecordActivity(r, repository.ActivityInput{
		Username:    me.Username,
		UserID:      &uid,
		Category:    models.ActivityCategoryAuth,
		Action:      "password_change",
		TargetLabel: me.Username,
		Message:     fmt.Sprintf("password changed, invalidated %d sessions", invalidatedCount),
	})

	w.WriteHeader(http.StatusNoContent)
}
