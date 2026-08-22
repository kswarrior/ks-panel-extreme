# KS Panel Security Configuration

This document describes the enhanced security features implemented in KS Panel to make the authentication system more secure and powerful.

## Security Features Implemented

### 1. Rate Limiting Middleware
**File:** `internal/api/rate_limiter.go`

**Features:**
- Configurable rate limits for different endpoints
- Login attempts: 5 per 15 minutes
- Registration attempts: 3 per 1 hour
- Memory-based with automatic cleanup
- Client identification by IP address

**Configuration:**
```go
rl := NewRateLimiter()
rl.loginAttempts = 5
rl.loginWindow = 15 * time.Minute
rl.registerAttempts = 3
rl.registerWindow = 1 * time.Hour
```

### 2. Password Complexity Policy
**File:** `internal/auth/password_policy.go`

**Features:**
- Minimum 12 characters (configurable)
- Maximum 128 characters (configurable)
- Requirements: uppercase, lowercase, numbers, special characters
- Unique character requirements (minimum 8 unique characters)
- Common password detection
- Personal information checking
- Password strength scoring (0-100)
- Pattern detection (sequential, repeated, keyboard patterns)

**Configuration:**
```go
policy := &PasswordPolicy{
    MinLength:      12,
    MaxLength:      128,
    RequireUpper:   true,
    RequireLower:   true,
    RequireNumber:   true,
    RequireSpecial:  true,
    RequireUnique:   8,
    NoCommon:       true,
    NoPersonalInfo: true,
}
```

### 3. Account Lockout Mechanism
**File:** `internal/auth/account_lockout.go`

**Features:**
- Automatic lockout after 5 failed login attempts
- 30-minute lockout duration (configurable)
- 15-minute attempt reset window
- Account status tracking
- Remaining attempts feedback
- Automatic cleanup of old records

**Configuration:**
```go
al := NewAccountLockout()
al.maxAttempts = 5
al.lockoutWindow = 15 * time.Minute
al.lockoutDuration = 30 * time.Minute
```

### 4. CSRF Protection
**File:** `internal/api/csrf.go`

**Features:**
- CSRF token generation and validation
- Token expiration (1 hour)
- Secure cookie handling
- Exempt endpoints for public APIs
- Token cleanup mechanism

**Configuration:**
```go
ctm := NewCSRFTokenManager()
ctm.tokens = make(map[string]*CSRFToken)
```

### 5. Security Headers
**File:** `internal/api/security_headers.go`

**Features:**
- Content Security Policy (CSP)
- Strict Transport Security (HSTS)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy
- Permissions-Policy
- CORS handling for API endpoints

**Headers Applied:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 6. Session Management
**File:** `internal/auth/session_manager.go`

**Features:**
- Session tracking with metadata
- Session invalidation on password change
- Session invalidation for all user sessions
- Session cleanup after 24 hours of inactivity
- Session validation middleware integration

**Configuration:**
```go
sm := NewSessionManager()
sm.sessions = make(map[string]*Session)
```

### 7. Password History
**File:** `internal/auth/password_history.go`

**Features:**
- Track last 5 passwords (configurable)
- Prevent password reuse
- Password similarity detection
- Configurable reuse policy
- Backup code generation for MFA

**Configuration:**
```go
config := &PasswordHistoryConfig{
    Enabled:         true,
    MaxHistory:      5,
    CheckSimilarity: true,
    ReuseAllowed:    false,
    ReuseAfter:      3,
}
```

### 8. Multi-Factor Authentication (MFA)
**File:** `internal/auth/mfa.go`

**Features:**
- TOTP (Time-based One-Time Password) support
- QR code generation for setup
- Backup code generation
- MFA verification middleware
- MFA status tracking

**Configuration:**
```go
mfa := NewMFAManager()
mfa.config = &TOTPConfig{
    Issuer:     "KS Panel",
    Algorithm:  "SHA1",
    Digits:     6,
    Period:     30,
    Skew:       1,
}
```

## Security Middleware Integration

### Main Security Middleware
**File:** `internal/api/security_middleware.go`

The security middleware combines all security features into a single middleware chain:

```go
func SecurityMiddleware(next http.Handler) http.Handler {
    return SecurityHeadersMiddleware(
        CORSMiddleware(
            AuthRateLimiterMiddleware(
                auth.AccountLockoutMiddleware(
                    auth.MFAMiddleware(
                        CSRFMiddleware(
                            auth.SessionMiddleware(
                                next
                            )
                        )
                    )
                )
            )
        )
    )
}
```

## Usage Examples

### 1. Password Validation
```go
// Validate password with complexity policy
policy := auth.DefaultPasswordPolicy()
err := auth.ValidatePassword(password, policy, username, email)
if err != nil {
    // Handle validation error
}
```

### 2. Password Change with Session Invalidation
```go
// Change password and invalidate all sessions
hash, err := auth.HashPassword(newPassword)
if err != nil {
    return err
}

err = repo.UpdatePassword(userID, hash)
if err != nil {
    return err
}

// Invalidate all user sessions
invalidatedCount := auth.InvalidateUserSessions(userID)
```

### 3. MFA Setup
```go
// Generate MFA secret
secret, err := mfaManager.GenerateSecret()
if err != nil {
    return err
}

// Generate QR code
qrCode := mfaManager.GenerateQRCode(secret, username)

// Generate backup codes
backupCodes := mfaManager.GenerateBackupCodes(10)
```

### 4. Rate Limiting Check
```go
// Check if client is allowed to make a request
if !rateLimiter.IsAllowed(clientID, "login") {
    rateLimiter.RecordAttempt(clientID, "login")
    return "rate limit exceeded"
}
```

## Security Best Practices

### 1. Password Policy
- Minimum 12 characters
- Require uppercase, lowercase, numbers, and special characters
- Check against common passwords
- Prevent personal information in passwords
- Track password history to prevent reuse

### 2. Session Security
- Use secure cookies with HttpOnly and Secure flags
- Implement session timeout
- Invalidate sessions on password change
- Track session metadata for security auditing

### 3. Rate Limiting
- Implement reasonable limits for auth endpoints
- Use progressive delays for repeated failures
- Lock accounts after excessive attempts

### 4. CSRF Protection
- Use CSRF tokens for state-changing operations
- Validate tokens on all POST/PUT/DELETE requests
- Set appropriate token expiration

### 5. Security Headers
- Implement Content Security Policy
- Use Strict Transport Security in production
- Set appropriate X-Frame-Options
- Enable XSS protection

### 6. MFA
- Enable MFA for all users
- Provide backup codes
- Use TOTP for time-based codes
- Store secrets securely

## Configuration in Production

### Environment Variables
```bash
# Session secret (generate a strong secret)
KSPANEL_SESSION_SECRET=$(openssl rand -base64 32)

# Master key for encryption
KSPANEL_MASTER_KEY=$(openssl rand -base64 32)

# Enable HTTPS in production
KSPANEL_ENV=production
```

### Database Configuration
- Use SSL/TLS for database connections
- Implement proper database access controls
- Regular security audits
- Backup and recovery procedures

### Network Security
- Use HTTPS for all communications
- Implement firewall rules
- Use reverse proxy with SSL termination
- Monitor for suspicious activity

## Monitoring and Auditing

### Security Events
- Failed login attempts
- Successful login attempts
- Password changes
- MFA setup/changes
- Session invalidations
- Security violations

### Metrics to Monitor
- Failed login rate
- Account lockouts
- Password strength distribution
- MFA adoption rate
- Session duration
- Security violations

## Future Enhancements

1. **Biometric Authentication**: Support for fingerprint/face recognition
2. **Advanced Threat Detection**: Machine learning-based anomaly detection
3. **Hardware Security Keys**: Support for FIDO2/U2F
4. **Social Login Integration**: OAuth2 providers with proper security
5. **Advanced Audit Logging**: Structured logging with correlation IDs
6. **Automated Security Testing**: Integration with security scanning tools

## Conclusion

The enhanced security system provides comprehensive protection against common web security threats while maintaining usability. Each component is designed to work together to create a layered security approach that addresses multiple attack vectors.

The system is configurable to meet different security requirements and can be adapted to various deployment scenarios. Regular security audits and updates are recommended to maintain security posture.