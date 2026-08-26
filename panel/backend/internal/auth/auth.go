package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost is the cost factor for bcrypt hashing.
// Default is 12 (higher than DefaultCost of 10) for better security.
// Can be overridden via KSPANEL_BCRYPT_COST environment variable.
var bcryptCost = 12

var (
	secretOnce   sync.Once
	sessionSecret []byte
	secretErr    error
)

// loadSessionSecret resolves KSPANEL_SESSION_SECRET exactly once per
// process. The check is lazy (not in init) so non-session binaries such as
// `kspanel seed` and every test binary can import this package without the
// env var; token minting/validation still FAIL CLOSED — both return an
// error instead of silently falling back to an unkeyed or default secret.
func loadSessionSecret() ([]byte, error) {
	secretOnce.Do(func() {
		secret := os.Getenv("KSPANEL_SESSION_SECRET")
		if secret == "" {
			secretErr = errors.New("KSPANEL_SESSION_SECRET environment variable is required for security. Generate a strong secret with: openssl rand -base64 32")
			return
		}
		if len(secret) < 32 {
			secretErr = errors.New("KSPANEL_SESSION_SECRET must be at least 32 characters long")
			return
		}
		sessionSecret = []byte(secret)

		// Allow custom bcrypt cost via environment variable
		if costStr := os.Getenv("KSPANEL_BCRYPT_COST"); costStr != "" {
			if cost, err := strconv.Atoi(costStr); err == nil && cost >= 10 && cost <= 15 {
				bcryptCost = cost
			}
		}
	})
	return sessionSecret, secretErr
}

// EnsureSessionSecret reports whether a usable session secret is configured.
// The HTTP server calls it once at startup so an operator gets a loud,
// immediate failure instead of every login request failing at runtime.
func EnsureSessionSecret() error {
	_, err := loadSessionSecret()
	return err
}

func HashPassword(pw string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func CheckPassword(hash, pw string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw))
}

// GenerateSessionToken returns a signed token of the form
// "<userID>.<issuedUnix>.<base64url(HMAC-over- userID|issuedUnix)>".
//
// The userID and issued-at are carried in clear text so they can be read
// back during validation; the HMAC covers both, protecting them from
// tampering (and detaching the token's lifetime from the cookie's
// Expires header, which a client can strip out — without the embedded
// issued-at a stolen cookie would be replayable until the secret rotates).
//
// issuedAt lets the middleware compute the session's remaining life and,
// when it dips under rotationWindow, mint a fresh cookie (sliding expiry).
// A zero issuedAt falls back to now for ergonomic one-off use.
//
// Returns an error when no session secret is configured — callers must
// fail rather than issue an unsigned credential.
func GenerateSessionToken(userID int64, issuedAt time.Time) (string, error) {
	secret, err := loadSessionSecret()
	if err != nil {
		return "", err
	}
	if issuedAt.IsZero() {
		issuedAt = time.Now()
	}
	uidStr := fmt.Sprintf("%d", userID)
	issuedStr := strconv.FormatInt(issuedAt.Unix(), 10)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(uidStr))
	mac.Write([]byte{'.'})
	mac.Write([]byte(issuedStr))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return uidStr + "." + issuedStr + "." + sig, nil
}

// ValidateSessionToken verifies the signature of a token produced by
// GenerateSessionToken and, on success, returns the embedded userID and
// the absolute time the token was issued. Callers willing to enforce a
// max session age can compare time.Since(issuedAt) against their TTL.
//
// It also accepts the legacy "<userID>.<sig>" format (no embedded
// issued-at) so sessions minted before the upgrade keep working — the
// caller is told issuedAt is the Unix epoch so an explicit "ancient
// session" check is straightforward.
func ValidateSessionToken(token string) (int64, time.Time, error) {
	secret, err := loadSessionSecret()
	if err != nil {
		// Fail closed: without a configured secret no token can be
		// trusted, so every validation attempt is rejected.
		return 0, time.Time{}, err
	}
	parts := strings.SplitN(token, ".", 3)
	switch len(parts) {
	case 3:
		uidStr, issuedStr, sig := parts[0], parts[1], parts[2]
		mac := hmac.New(sha256.New, secret)
		mac.Write([]byte(uidStr))
		mac.Write([]byte{'.'})
		mac.Write([]byte(issuedStr))
		wantSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
		// Compare in constant time to avoid timing side channels.
		if !hmac.Equal([]byte(wantSig), []byte(sig)) {
			return 0, time.Time{}, errors.New("invalid session token signature")
		}
		var uid int64
		if _, err := fmt.Sscanf(uidStr, "%d", &uid); err != nil {
			return 0, time.Time{}, errors.New("invalid session token payload")
		}
		issuedUnix, err := strconv.ParseInt(issuedStr, 10, 64)
		if err != nil {
			return 0, time.Time{}, errors.New("invalid session token payload")
		}
		return uid, time.Unix(issuedUnix, 0), nil
	case 2:
		// Legacy "<userID>.<sig>" (pre-issued-at) token. Verify with the
		// legacy signing scheme and report issuedAt as the epoch so the
		// middleware can choose to AGE it out (it does) rather than
		// trusting it indefinitely.
		uidStr, sig := parts[0], parts[1]
		mac := hmac.New(sha256.New, sessionSecret)
		mac.Write([]byte(uidStr))
		wantSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(wantSig), []byte(sig)) {
			return 0, time.Time{}, errors.New("invalid session token signature")
		}
		var uid int64
		if _, err := fmt.Sscanf(uidStr, "%d", &uid); err != nil {
			return 0, time.Time{}, errors.New("invalid session token payload")
		}
		return uid, time.Unix(0, 0), nil
	default:
		return 0, time.Time{}, errors.New("invalid session token format")
	}
}
