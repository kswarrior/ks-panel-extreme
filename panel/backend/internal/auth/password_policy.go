package auth

import (
	"errors"
	"strconv"
	"strings"
	"unicode"
)

// PasswordPolicy defines the complexity requirements for passwords
type PasswordPolicy struct {
	MinLength      int
	MaxLength      int
	RequireUpper   bool
	MinUpper       int
	RequireLower   bool
	MinLower       int
	RequireNumber  bool
	MinNumber      int
	RequireSpecial bool
	MinSpecial     int
	RequireUnique  int  // Minimum number of unique characters
	NoCommon       bool // Check against common passwords
	NoPersonalInfo bool // Check against user info (username, email)
}

// DefaultPasswordPolicy returns a secure password policy
func DefaultPasswordPolicy() *PasswordPolicy {
	return &PasswordPolicy{
		MinLength:      12,
		MaxLength:      128,
		RequireUpper:   true,
		RequireLower:   true,
		RequireNumber:  true,
		RequireSpecial: true,
		RequireUnique:  8,
		NoCommon:       true,
		NoPersonalInfo: true,
	}
}

// ValidatePassword checks if a password meets the policy requirements
func ValidatePassword(password string, policy *PasswordPolicy, userInfo ...string) error {
	if policy == nil {
		policy = DefaultPasswordPolicy()
	}

	// Check length
	if len(password) < policy.MinLength {
		return errors.New("password must be at least " + strconv.Itoa(policy.MinLength) + " characters long")
	}
	if len(password) > policy.MaxLength {
		return errors.New("password must be no more than " + strconv.Itoa(policy.MaxLength) + " characters long")
	}

	// Check character requirements
	var upperCount, lowerCount, numberCount, specialCount int
	uniqueChars := make(map[rune]bool)

	for _, char := range password {
		uniqueChars[char] = true

		switch {
		case unicode.IsUpper(char):
			upperCount++
		case unicode.IsLower(char):
			lowerCount++
		case unicode.IsNumber(char):
			numberCount++
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			specialCount++
		}
	}

	// Check character class requirements
	if policy.RequireUpper && upperCount == 0 {
		return errors.New("password must contain at least one uppercase letter")
	}
	if policy.MinUpper > 0 && upperCount < policy.MinUpper {
		return errors.New("password must contain at least " + strconv.Itoa(policy.MinUpper) + " uppercase letter(s)")
	}
	if policy.RequireLower && lowerCount == 0 {
		return errors.New("password must contain at least one lowercase letter")
	}
	if policy.MinLower > 0 && lowerCount < policy.MinLower {
		return errors.New("password must contain at least " + strconv.Itoa(policy.MinLower) + " lowercase letter(s)")
	}
	if policy.RequireNumber && numberCount == 0 {
		return errors.New("password must contain at least one number")
	}
	if policy.MinNumber > 0 && numberCount < policy.MinNumber {
		return errors.New("password must contain at least " + strconv.Itoa(policy.MinNumber) + " number(s)")
	}
	if policy.RequireSpecial && specialCount == 0 {
		return errors.New("password must contain at least one special character")
	}
	if policy.MinSpecial > 0 && specialCount < policy.MinSpecial {
		return errors.New("password must contain at least " + strconv.Itoa(policy.MinSpecial) + " special character(s)")
	}

	// Check unique characters
	if policy.RequireUnique > 0 && len(uniqueChars) < policy.RequireUnique {
		return errors.New("password must contain at least " + strconv.Itoa(policy.RequireUnique) + " unique characters")
	}

	// Check against common passwords if enabled
	if policy.NoCommon && isCommonPassword(password) {
		return errors.New("password is too common and easily guessable")
	}

	// Check against personal info if enabled
	if policy.NoPersonalInfo && len(userInfo) > 0 {
		for _, info := range userInfo {
			if strings.Contains(strings.ToLower(password), strings.ToLower(info)) {
				return errors.New("password cannot contain personal information")
			}
		}
	}

	return nil
}

// isCommonPassword checks if a password is in a list of common passwords
func isCommonPassword(password string) bool {
	// Common passwords list (in a real implementation, this would be much larger)
	// and loaded from a file or external source
	commonPasswords := []string{
		"password", "123456", "12345678", "123456789", "1234567890",
		"qwerty", "abc123", "letmein", "monkey", "password1",
		"admin", "welcome", "login", "user", "user123",
		"pass123", "master", "hello", "football", "iloveyou",
		"password123", "123123", "dragon", "sunshine", "password1",
	}

	lowerPassword := strings.ToLower(password)
	for _, common := range commonPasswords {
		if lowerPassword == common {
			return true
		}
	}

	// Check for simple patterns
	if isSimplePattern(lowerPassword) {
		return true
	}

	return false
}

// isSimplePattern checks for simple password patterns
func isSimplePattern(password string) bool {
	// Check for sequential characters (12345, abcde, etc.)
	if isSequential(password) {
		return true
	}

	// Check for repeated characters (aaaa, 1111, etc.)
	if isRepeated(password) {
		return true
	}

	// Check for keyboard patterns (qwerty, asdf, etc.)
	if isKeyboardPattern(password) {
		return true
	}

	return false
}

// isSequential checks if characters are sequential
func isSequential(password string) bool {
	for i := 0; i < len(password)-1; i++ {
		if password[i+1]-password[i] != 1 {
			continue
		}
		// Found sequential characters, check if it's at least 3 long
		for j := i; j < len(password)-1 && password[j+1]-password[j] == 1; j++ {
			if j-i >= 2 {
				return true
			}
		}
	}
	return false
}

// isRepeated checks if characters are repeated
func isRepeated(password string) bool {
	for i := 0; i < len(password)-1; i++ {
		if password[i] != password[i+1] {
			continue
		}
		// Found repeated characters, check if it's at least 3 long
		for j := i; j < len(password) && password[j] == password[i]; j++ {
			if j-i >= 2 {
				return true
			}
		}
	}
	return false
}

// isKeyboardPattern checks for keyboard patterns
func isKeyboardPattern(password string) bool {
	keyboardPatterns := []string{
		"qwerty", "asdf", "zxcv", "1234", "qwer", "asdf",
		"1q2w", "qaz", "wsx", "edc", "rfv", "tgb",
	}

	lowerPassword := strings.ToLower(password)
	for _, pattern := range keyboardPatterns {
		if strings.Contains(lowerPassword, pattern) {
			return true
		}
	}
	return false
}

// PasswordStrength calculates a strength score (0-100)
func PasswordStrength(password string) int {
	score := 0

	// Length score
	length := len(password)
	if length >= 12 {
		score += 25
	} else if length >= 8 {
		score += 15
	} else {
		score += 5
	}

	// Character variety score
	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if hasUpper && hasLower && hasNumber && hasSpecial {
		score += 35
	} else if hasUpper && hasLower && hasNumber {
		score += 25
	} else if hasUpper && hasLower {
		score += 15
	}

	// Uniqueness score
	uniqueChars := make(map[rune]bool)
	for _, char := range password {
		uniqueChars[char] = true
	}
	uniqueRatio := float64(len(uniqueChars)) / float64(length)
	if uniqueRatio >= 0.7 {
		score += 20
	} else if uniqueRatio >= 0.5 {
		score += 15
	} else {
		score += 10
	}

	// Complexity penalty for common patterns
	if isCommonPassword(password) || isSimplePattern(password) {
		score -= 20
	}

	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	return score
}

// GetPasswordFeedback provides feedback on how to improve password strength
func GetPasswordFeedback(password string, policy *PasswordPolicy) []string {
	if policy == nil {
		policy = DefaultPasswordPolicy()
	}

	var feedback []string

	// Length feedback
	if len(password) < policy.MinLength {
		feedback = append(feedback, "Use at least "+strconv.Itoa(policy.MinLength)+" characters")
	}
	if len(password) > policy.MaxLength {
		feedback = append(feedback, "Password is too long")
	}

	// Character class feedback
	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if policy.RequireUpper && !hasUpper {
		feedback = append(feedback, "Add uppercase letters")
	}
	if policy.RequireLower && !hasLower {
		feedback = append(feedback, "Add lowercase letters")
	}
	if policy.RequireNumber && !hasNumber {
		feedback = append(feedback, "Add numbers")
	}
	if policy.RequireSpecial && !hasSpecial {
		feedback = append(feedback, "Add special characters")
	}

	// Strength feedback
	strength := PasswordStrength(password)
	switch {
	case strength < 30:
		feedback = append(feedback, "Password is very weak")
	case strength < 60:
		feedback = append(feedback, "Password is weak")
	case strength < 80:
		feedback = append(feedback, "Password is moderate")
	default:
		feedback = append(feedback, "Password is strong")
	}

	return feedback
}
