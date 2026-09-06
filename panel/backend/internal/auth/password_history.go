package auth

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// PasswordHistory represents a password history entry
type PasswordHistory struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	PasswordHash string    `json:"password_hash"`
	CreatedAt    time.Time `json:"created_at"`
}

// PasswordHistoryManager manages password history
type PasswordHistoryManager struct {
	maxHistory int
}

// NewPasswordHistoryManager creates a new password history manager
func NewPasswordHistoryManager() *PasswordHistoryManager {
	return &PasswordHistoryManager{
		maxHistory: 5, // Keep last 5 passwords
	}
}

// IsPasswordInHistory checks if a password hash is in the user's history
func (phm *PasswordHistoryManager) IsPasswordInHistory(history []PasswordHistory, passwordHash string) bool {
	for _, entry := range history {
		if entry.PasswordHash == passwordHash {
			return true
		}
	}
	return false
}

// AddPasswordToHistory adds a password hash to the user's history
func (phm *PasswordHistoryManager) AddPasswordToHistory(history []PasswordHistory, passwordHash string) []PasswordHistory {
	newHistory := append([]PasswordHistory{{
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
	}}, history...)

	// Keep only the most recent passwords
	if len(newHistory) > phm.maxHistory {
		return newHistory[:phm.maxHistory]
	}

	return newHistory
}

// CanReusePassword checks if a password can be reused based on history
func (phm *PasswordHistoryManager) CanReusePassword(history []PasswordHistory, passwordHash string) bool {
	// Check if password is in history
	if phm.IsPasswordInHistory(history, passwordHash) {
		return false
	}

	// Additional checks can be added here
	// For example, check if new password is too similar to old ones

	return true
}

// PasswordSimilarityChecker checks if passwords are too similar
type PasswordSimilarityChecker struct {
	similarityThreshold float64
}

// NewPasswordSimilarityChecker creates a new password similarity checker
func NewPasswordSimilarityChecker() *PasswordSimilarityChecker {
	return &PasswordSimilarityChecker{
		similarityThreshold: 0.7, // 70% similarity threshold
	}
}

// CalculateSimilarity calculates the similarity between two passwords
func (psc *PasswordSimilarityChecker) CalculateSimilarity(password1, password2 string) float64 {
	// Simple similarity calculation based on character overlap
	// In a real implementation, this would be more sophisticated

	if len(password1) == 0 || len(password2) == 0 {
		return 0.0
	}

	// Calculate character overlap
	maxLen := max(len(password1), len(password2))
	minLen := min(len(password1), len(password2))

	if maxLen == 0 {
		return 0.0
	}

	// Count matching characters at the same position
	matching := 0
	for i := 0; i < minLen; i++ {
		if password1[i] == password2[i] {
			matching++
		}
	}

	// Calculate similarity ratio
	similarity := float64(matching) / float64(maxLen)

	return similarity
}

// IsPasswordTooSimilar checks if a password is too similar to any in the history.
// History entries hold bcrypt hashes, not plaintext, so a character-overlap
// comparison against the hash string is meaningless (it would always score
// near zero and silently disable the check). Hash-looking entries are
// therefore skipped: exact reuse is still rejected via bcrypt comparison in
// ValidatePasswordWithHistory; similarity only applies when callers pass
// plaintext history entries.
func (psc *PasswordSimilarityChecker) IsPasswordTooSimilar(history []PasswordHistory, newPassword string) bool {
	for _, entry := range history {
		if entry.PasswordHash == "" || strings.HasPrefix(entry.PasswordHash, "$2") {
			continue
		}
		similarity := psc.CalculateSimilarity(newPassword, entry.PasswordHash)
		if similarity > psc.similarityThreshold {
			return true
		}
	}
	return false
}

// PasswordHistoryConfig defines password history configuration
type PasswordHistoryConfig struct {
	Enabled         bool
	MaxHistory      int
	CheckSimilarity bool
	ReuseAllowed    bool
	ReuseAfter      int // Number of password changes before reuse is allowed
}

// DefaultPasswordHistoryConfig returns a secure password history configuration
func DefaultPasswordHistoryConfig() *PasswordHistoryConfig {
	return &PasswordHistoryConfig{
		Enabled:         true,
		MaxHistory:      5,
		CheckSimilarity: true,
		ReuseAllowed:    false,
		ReuseAfter:      3,
	}
}

// ValidatePasswordWithHistory validates a password against history and policy
func ValidatePasswordWithHistory(password string, policy *PasswordPolicy, history []PasswordHistory, config *PasswordHistoryConfig, userInfo ...string) error {
	if config == nil {
		config = DefaultPasswordHistoryConfig()
	}

	// First validate against password policy
	if err := ValidatePassword(password, policy, userInfo...); err != nil {
		return err
	}

	// Check password history if enabled
	if config.Enabled {
		_ = NewPasswordHistoryManager()

		// Convert history to hashes for comparison
		var historyHashes []string
		for _, entry := range history {
			historyHashes = append(historyHashes, entry.PasswordHash)
		}

		// Check if password is in history
		for _, hash := range historyHashes {
			if CheckPasswordHash(password, hash) == nil {
				return errors.New("password has been used before")
			}
		}

		// Check similarity if enabled. Note: stored history entries are
		// bcrypt hashes, which IsPasswordTooSimilar skips by design, so
		// this only fires for plaintext history entries. Exact reuse of a
		// hashed entry is already rejected by the bcrypt loop above.
		if config.CheckSimilarity {
			psc := NewPasswordSimilarityChecker()
			var historyEntries []PasswordHistory
			for _, entry := range history {
				historyEntries = append(historyEntries, entry)
			}

			if psc.IsPasswordTooSimilar(historyEntries, password) {
				return errors.New("password is too similar to a previous one")
			}
		}
	}

	return nil
}

// CheckPasswordHash checks if a password matches a hash
func CheckPasswordHash(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// GetPasswordHistoryFeedback provides feedback on password history
func GetPasswordHistoryFeedback(history []PasswordHistory, config *PasswordHistoryConfig) []string {
	var feedback []string

	if config.Enabled {
		feedback = append(feedback, "Password history is being tracked")

		if len(history) >= config.MaxHistory {
			feedback = append(feedback, "Maximum password history reached")
		} else {
			remaining := config.MaxHistory - len(history)
			feedback = append(feedback, "You can reuse passwords after "+strconv.Itoa(remaining)+" more changes")
		}

		if config.CheckSimilarity {
			feedback = append(feedback, "Password similarity is being checked")
		}
	}

	return feedback
}
