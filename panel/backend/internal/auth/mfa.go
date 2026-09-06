package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TOTPConfig defines TOTP configuration
type TOTPConfig struct {
	Issuer    string
	Algorithm string
	Digits    int
	Period    int
	Skew      int
}

// DefaultTOTPConfig returns default TOTP configuration
func DefaultTOTPConfig() *TOTPConfig {
	return &TOTPConfig{
		Issuer:    "KS Panel",
		Algorithm: "SHA1",
		Digits:    6,
		Period:    30,
		Skew:      1,
	}
}

// MFASettings represents a user's MFA settings
type MFASettings struct {
	ID                int64     `json:"id"`
	UserID            int64     `json:"user_id"`
	Secret            string    `json:"secret"`
	Enabled           bool      `json:"enabled"`
	BackupCodes       []string  `json:"backup_codes"`
	CreatedAt         time.Time `json:"created_at"`
	LastUsedAt        time.Time `json:"last_used_at"`
	LastUsedIP        string    `json:"last_used_ip"`
	LastUsedUserAgent string    `json:"last_used_user_agent"`
}

// MFAManager manages MFA settings and verification
type MFAManager struct {
	config *TOTPConfig
}

// NewMFAManager creates a new MFA manager
func NewMFAManager() *MFAManager {
	return &MFAManager{
		config: DefaultTOTPConfig(),
	}
}

// GenerateSecret generates a new TOTP secret
func (mfa *MFAManager) GenerateSecret() (string, error) {
	// Generate a random secret
	secret := make([]byte, 20)
	_, err := rand.Read(secret)
	if err != nil {
		return "", err
	}

	// Encode as base32 (standard for TOTP)
	return base32.StdEncoding.EncodeToString(secret), nil
}

// GenerateQRCode generates a QR code URL for TOTP setup
func (mfa *MFAManager) GenerateQRCode(secret, username string) string {
	issuer := mfa.config.Issuer
	accountName := username

	label := url.PathEscape(issuer + ":" + accountName)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", mfa.config.Algorithm)
	q.Set("digits", fmt.Sprintf("%d", mfa.config.Digits))
	q.Set("period", fmt.Sprintf("%d", mfa.config.Period))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// ValidateTOTP validates a TOTP code using RFC 6238
func (mfa *MFAManager) ValidateTOTP(secret, code string) bool {
	// Clean the code - remove spaces
	code = strings.ReplaceAll(code, " ", "")

	// Check if code is 6 digits
	if len(code) != 6 {
		return false
	}

	// Verify all characters are digits
	for _, c := range code {
		if c < '0' || c > '9' {
			return false
		}
	}

	// Decode the base32 secret
	key, err := base32.StdEncoding.DecodeString(strings.ToUpper(secret))
	if err != nil {
		return false
	}

	// Get current time step (30-second windows)
	timeStep := time.Now().Unix() / 30

	// Check current window and adjacent windows (for clock skew)
	for i := -1; i <= 1; i++ {
		if mfa.validateTOTPAtTimeStep(key, code, timeStep+int64(i)) {
			return true
		}
	}

	return false
}

// validateTOTPAtTimeStep validates TOTP at a specific time step
func (mfa *MFAManager) validateTOTPAtTimeStep(key []byte, code string, timeStep int64) bool {
	// Convert time step to 8-byte big-endian
	msg := make([]byte, 8)
	binary.BigEndian.PutUint64(msg, uint64(timeStep))

	// Calculate HMAC-SHA1
	mac := hmac.New(sha1.New, key)
	mac.Write(msg)
	hash := mac.Sum(nil)

	// Dynamic truncation (RFC 4226)
	offset := hash[len(hash)-1] & 0x0F
	truncated := binary.BigEndian.Uint32(hash[offset : offset+4])
	truncated &= 0x7FFFFFFF

	// Generate 6-digit code
	expectedCode := truncated % 1000000
	expectedCodeStr := fmt.Sprintf("%06d", expectedCode)

	// Constant-time comparison
	return subtleConstantTimeCompare(code, expectedCodeStr)
}

// subtleConstantTimeCompare performs constant-time string comparison
func subtleConstantTimeCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

// GenerateBackupCodes generates backup codes for MFA
func (mfa *MFAManager) GenerateBackupCodes(count int) []string {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		codes[i] = generateRandomCode(8)
	}
	return codes
}

// ValidateBackupCode validates a backup code. Empty codes never validate
// (fail closed): used slots are blanked to "" by UseBackupCode, so without
// the guards below an empty input would match a consumed slot.
func (mfa *MFAManager) ValidateBackupCode(codes []string, code string) bool {
	if code == "" {
		return false
	}
	for _, c := range codes {
		if c == "" {
			continue
		}
		if c == code {
			return true
		}
	}
	return false
}

// UseBackupCode marks a backup code as used
func (mfa *MFAManager) UseBackupCode(codes []string, code string) []string {
	if code == "" {
		return codes
	}
	for i, c := range codes {
		if c == "" {
			continue
		}
		if c == code {
			codes[i] = "" // Mark as used
			break
		}
	}
	return codes
}

// generateRandomCode generates a cryptographically secure random alphanumeric code
func generateRandomCode(length int) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		// Fallback (should not happen)
		for i := range b {
			b[i] = charset[int(b[i])%len(charset)]
		}
	} else {
		for i := range b {
			b[i] = charset[int(b[i])%len(charset)]
		}
	}
	return string(b)
}

// MFARequest represents an MFA request
type MFARequest struct {
	Code   string `json:"code"`
	Method string `json:"method"` // "totp" or "backup"
}

// MFAResponse represents an MFA response
type MFAResponse struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	RequiresMFA bool   `json:"requires_mfa"`
}

// MFAHandler handles MFA-related requests
type MFAHandler struct {
	mfaManager *MFAManager
}

// NewMFAHandler creates a new MFA handler
func NewMFAHandler() *MFAHandler {
	return &MFAHandler{
		mfaManager: NewMFAManager(),
	}
}

// SetupMFAHandler handles MFA setup
func (mfaHandler *MFAHandler) SetupMFAHandler(w http.ResponseWriter, r *http.Request) {
	// This would normally be called after password authentication
	// In a real implementation, the secret would be stored in the database
	// associated with the user, and only the QR code returned to the client

	secret, err := mfaHandler.mfaManager.GenerateSecret()
	if err != nil {
		http.Error(w, "failed to generate MFA secret", http.StatusInternalServerError)
		return
	}

	// In production, store the secret in the database for the user
	// For now, we return the QR code (which contains the secret) for setup
	// The secret should be stored securely and not exposed in production
	qrCode := mfaHandler.mfaManager.GenerateQRCode(secret, "user")
	backupCodes := mfaHandler.mfaManager.GenerateBackupCodes(10)

	response := map[string]interface{}{
		"qr_code":      qrCode,
		"backup_codes": backupCodes,
		// Secret is included for initial setup only - in production, store server-side
		"secret": secret,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// VerifyMFAHandler handles MFA verification
func (mfaHandler *MFAHandler) VerifyMFAHandler(w http.ResponseWriter, r *http.Request) {
	var req MFARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	// In a real implementation, fetch the user's MFA secret and backup codes from the database
	// For now, we require the secret to be passed in the request (for testing)
	// In production, this would be retrieved from the user's stored MFA settings
	var secret string
	var backupCodes []string

	// This is a placeholder - in production, fetch from database
	// secret = getUserMFASecret(userID)
	// backupCodes = getUserBackupCodes(userID)

	// For testing purposes, we'll check if secret was provided in request
	// In production, NEVER accept secret from client - always fetch server-side
	if req.Method == "totp" {
		// The secret should come from the user's stored MFA settings
		// This is a placeholder implementation
		http.Error(w, "MFA secret not configured - please set up MFA first", http.StatusBadRequest)
		return
	}

	var isValid bool
	var message string

	switch req.Method {
	case "totp":
		if secret == "" {
			http.Error(w, "MFA not configured", http.StatusBadRequest)
			return
		}
		isValid = mfaHandler.mfaManager.ValidateTOTP(secret, req.Code)
		message = "TOTP code"
	case "backup":
		if len(backupCodes) == 0 {
			http.Error(w, "No backup codes available", http.StatusBadRequest)
			return
		}
		isValid = mfaHandler.mfaManager.ValidateBackupCode(backupCodes, req.Code)
		if isValid {
			// Mark backup code as used
			backupCodes = mfaHandler.mfaManager.UseBackupCode(backupCodes, req.Code)
			// In production, update the database with the new backup codes list
		}
		message = "Backup code"
	default:
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	response := MFAResponse{
		Success:     isValid,
		Message:     message,
		RequiresMFA: false, // This would be set based on user settings
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// EnableMFAHandler enables MFA for a user
func (mfaHandler *MFAHandler) EnableMFAHandler(w http.ResponseWriter, r *http.Request) {
	// This would normally be called after successful MFA verification
	// For now, we'll just return a success response

	response := map[string]interface{}{
		"success": true,
		"message": "MFA enabled successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DisableMFAHandler disables MFA for a user
func (mfaHandler *MFAHandler) DisableMFAHandler(w http.ResponseWriter, r *http.Request) {
	// This would normally require confirmation or additional verification
	// For now, we'll just return a success response

	response := map[string]interface{}{
		"success": true,
		"message": "MFA disabled successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetMFAStatusHandler returns the current MFA status for a user
func (mfaHandler *MFAHandler) GetMFAStatusHandler(w http.ResponseWriter, r *http.Request) {
	// This would normally check the database for user's MFA status
	// For now, we'll return a default response

	response := map[string]interface{}{
		"enabled":        false,
		"setup_complete": false,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// MFAMiddleware creates middleware that enforces MFA
func MFAMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip MFA for certain endpoints
		if isMFAExemptPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		// Check if user has MFA enabled
		// This would normally check the database
		hasMFA := false

		if hasMFA {
			// Check for MFA token in the request without consuming the
			// body for the downstream handler (see AccountLockoutMiddleware).
			var mfaToken string
			if r.Method == "POST" {
				body, err := io.ReadAll(r.Body)
				if err == nil {
					_ = r.Body.Close()
					r.Body = io.NopCloser(bytes.NewReader(body))
					var req map[string]interface{}
					if jerr := json.Unmarshal(body, &req); jerr == nil {
						if token, ok := req["mfa_token"].(string); ok {
							mfaToken = token
						}
					}
				}
			}

			if mfaToken == "" {
				http.Error(w, "MFA required", http.StatusUnauthorized)
				return
			}

			// Validate MFA token
			// This would normally validate against the database
			isValid := false // Placeholder for actual validation

			if !isValid {
				http.Error(w, "invalid MFA token", http.StatusUnauthorized)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// isMFAExemptPath checks if a path should be exempt from MFA
func isMFAExemptPath(path string) bool {
	exemptPaths := []string{
		"/api/auth/login",
		"/api/auth/logout",
		"/api/auth/register",
		"/api/auth/verify-email",
		"/api/auth/flags",
		"/api/auth/device-id",
		"/api/settings/panel-name",
		"/api/settings/panel-logo",
		"/api/themes",
		"/health",
	}

	for _, exempt := range exemptPaths {
		if path == exempt {
			return true
		}
	}
	return false
}

// MFAHandlerInstance is the global MFA handler
var MFAHandlerInstance = NewMFAHandler()
