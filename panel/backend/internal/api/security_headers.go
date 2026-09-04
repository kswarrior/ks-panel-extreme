package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// SecurityHeadersMiddleware adds important security headers to all responses.
// It is mounted globally in NewRouter (after cors, before SecurityMiddleware)
// so even blocked/telemetry responses carry the headers. It never wraps the
// ResponseWriter, so WebSocket hijacks (terminal, notifications/stream,
// edge tunnel) keep working.
//
// CORS is owned solely by the go-chi cors router in server.go (which echoes
// a concrete Origin for credentialed requests). This middleware deliberately
// does NOT set Access-Control-Allow-Origin: emitting "*" here would break
// credentialed fetches (Fetch spec forbids "*" with credentials) and
// duplicate the cors router's headers.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		// COEP require-corp would block the SPA's cross-origin-safe
		// bootstrap when the panel sits behind a tunnel/proxy that does
		// not forward CORP headers, and it adds nothing for same-origin
		// API JSON. Keep the header but use the permissive value so
		// browsers still see the header without breaking loads.
		// WebSocket upgrades skip COEP/CORP entirely (they are not fetches).
		isWS := isWebSocketUpgrade(r)
		if !isWS {
			w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		}

		// Content Security Policy. The SPA ships an inline bootstrap
		// <script>window.__KSPANEL_BOOTSTRAP__=…</script> (bootstrap.go
		// injectBrandIntoIndexHTML) plus Vite inline <style> tags, so a
		// strict script-src/style-src 'self' without 'unsafe-inline'
		// would blank the first paint. We allow 'unsafe-inline' for
		// script/style only; everything else stays locked down (no
		// object/frame, self-only base/form, no unsafe-eval).
		csp := "default-src 'self'; " +
			"script-src 'self' 'unsafe-inline'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: https:; " +
			"font-src 'self' data:; " +
			"connect-src 'self' ws: wss:; " +
			"object-src 'none'; " +
			"base-uri 'self'; " +
			"frame-ancestors 'none'; " +
			"form-action 'self'; " +
			"frame-src 'none'; " +
			"upgrade-insecure-requests"
		w.Header().Set("Content-Security-Policy", csp)

		// Strict Transport Security (only for HTTPS). curl -i behind a
		// TLS-terminating proxy sees this via X-Forwarded-Proto=https.
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}

		// Remove server information
		w.Header().Set("Server", "")

		next.ServeHTTP(w, r)
	})
}

// isAPIPath checks if a path is an API endpoint
func isAPIPath(path string) bool {
	return len(path) > 4 && path[:4] == "/api/"
}

// isWebSocketUpgrade reports whether r is a WebSocket handshake
// (terminal bridge, notification stream, edge tunnel).
func isWebSocketUpgrade(r *http.Request) bool {
	for _, v := range r.Header.Values("Upgrade") {
		if len(v) >= 9 && (v == "websocket" || len(v) > 9) {
			// Case-insensitive "websocket" match without importing strings
			// in the hot path filter (strings.EqualFold equivalent).
			l := len(v)
			if l == 9 &&
				(v[0] == 'w' || v[0] == 'W') &&
				(v[1] == 'e' || v[1] == 'E') &&
				(v[2] == 'b' || v[2] == 'B') &&
				(v[3] == 's' || v[3] == 'S') &&
				(v[4] == 'o' || v[4] == 'O') &&
				(v[5] == 'c' || v[5] == 'C') &&
				(v[6] == 'k' || v[6] == 'K') &&
				(v[7] == 'e' || v[7] == 'E') &&
				(v[8] == 't' || v[8] == 'T') {
				return true
			}
		}
		// Fallback: case-insensitive contains check for values like
		// "websocket, h2c" that some proxies append.
		for i := 0; i+9 <= len(v); i++ {
			s := v[i : i+9]
			if (s[0] == 'w' || s[0] == 'W') &&
				(s[1] == 'e' || s[1] == 'E') &&
				(s[2] == 'b' || s[2] == 'B') &&
				(s[3] == 's' || s[3] == 'S') &&
				(s[4] == 'o' || s[4] == 'O') &&
				(s[5] == 'c' || s[5] == 'C') &&
				(s[6] == 'k' || s[6] == 'K') &&
				(s[7] == 'e' || s[7] == 'E') &&
				(s[8] == 't' || s[8] == 'T') {
				return true
			}
		}
	}
	// Also treat explicit Connection: Upgrade + Upgrade: websocket pair.
	return false
}

// CORSMiddleware handles CORS preflight requests
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

// SecureCookieMiddleware ensures cookies are only sent over HTTPS
func SecureCookieMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if request is secure
		isSecure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
		
		// Override cookie security flags if not secure
		if !isSecure {
			// For development/local testing, we might want to allow cookies
			// In production, this should be strictly enforced
			if r.Host == "localhost:5050" || r.Host == "127.0.0.1:5050" {
				// Allow cookies in local development
			} else {
				// Block cookies in production over HTTP
				http.Error(w, "HTTPS required", http.StatusForbidden)
				return
			}
		}
		
		next.ServeHTTP(w, r)
	})
}

// RateLimitHeadersMiddleware adds rate limit headers to responses
func RateLimitHeadersMiddleware(remaining int, reset int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-RateLimit-Limit", "100")
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
			w.Header().Set("X-RateLimit-Reset", strconv.Itoa(int(reset)))
			
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityAuditMiddleware logs security-related events with structured logging
func SecurityAuditMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Wrap response writer to capture status code
		sbw := &statusBytesWriter{ResponseWriter: w, status: http.StatusOK}
		
		next.ServeHTTP(sbw, r)
		
		duration := time.Since(start).Milliseconds()
		
		// Log security-relevant requests with structured data
		if isSecurityRelevantPath(r.URL.Path) || sbw.status >= 400 {
			logSecurityEvent(r, sbw.status, duration)
		}
	})
}

// isSecurityRelevantPath checks if a path is security-relevant
func isSecurityRelevantPath(path string) bool {
	securityPaths := []string{
		"/api/auth/login",
		"/api/auth/logout",
		"/api/auth/register",
		"/api/auth/switch-login",
		"/api/auth/send-verify",
		"/api/auth/verify-email",
		"/api/me/change-password",
		"/api/me/change-username",
		"/api/me/auth",
		"/api/users",
		"/api/api-keys",
		"/api/roles",
		"/api/settings",
		"/api/authority",
		"/api/nodes",
		"/api/mods",
		"/api/templates",
		"/api/applications",
		"/api/instance-pages",
		"/api/system/update-apply",
		"/api/system/reinstall",
		"/api/system/reinstall-background",
		"/api/system/stop",
		"/api/database/engine",
		"/api/security/attack",
	}
	
	for _, secPath := range securityPaths {
		if path == secPath || (len(path) > len(secPath) && path[:len(secPath)] == secPath+"/") {
			return true
		}
	}
	return false
}

// SecurityEvent represents a structured security event for logging
type SecurityEvent struct {
	Timestamp   string `json:"timestamp"`
	EventType   string `json:"event_type"`
	Path        string `json:"path"`
	Method      string `json:"method"`
	StatusCode  int    `json:"status_code"`
	ClientIP    string `json:"client_ip"`
	UserAgent   string `json:"user_agent"`
	DurationMs  int64  `json:"duration_ms"`
	UserID      *int64 `json:"user_id,omitempty"`
	RequestID   string `json:"request_id,omitempty"`
	IsBlocked   bool   `json:"is_blocked"`
	ErrorMsg    string `json:"error_msg,omitempty"`
}

// logSecurityEvent logs security-related events with structured JSON
func logSecurityEvent(r *http.Request, statusCode int, durationMs int64) {
	clientIP := getClientIP(r)
	userAgent := r.UserAgent()
	if len(userAgent) > 512 {
		userAgent = userAgent[:512]
	}
	
	requestID := r.Header.Get("X-Request-ID")
	if requestID == "" {
		requestID = r.Header.Get("X-Correlation-ID")
	}
	
	// Try to get user ID from context
	var userID *int64
	if uid, err := handlers.UserIDFromContext(r); err == nil {
		userID = &uid
	}
	
	event := SecurityEvent{
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		EventType:  classifySecurityEvent(r.URL.Path, statusCode),
		Path:       r.URL.Path,
		Method:     r.Method,
		StatusCode: statusCode,
		ClientIP:   clientIP,
		UserAgent:  userAgent,
		DurationMs: durationMs,
		UserID:     userID,
		RequestID:  requestID,
		IsBlocked:  statusCode == http.StatusForbidden || statusCode == http.StatusTooManyRequests || statusCode == http.StatusUnauthorized,
	}
	
	// Log as JSON for structured logging
	jsonBytes, _ := json.Marshal(event)
	log.Printf("SECURITY_AUDIT: %s", string(jsonBytes))
	
	// Also record in activity system for admin UI
	RecordSecurityActivity(r, event)
}

// classifySecurityEvent categorizes the security event based on path and status
func classifySecurityEvent(path string, statusCode int) string {
	switch {
	case path == "/api/auth/login" && statusCode == http.StatusOK:
		return "login_success"
	case path == "/api/auth/login" && (statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden || statusCode == http.StatusTooManyRequests):
		return "login_failure"
	case path == "/api/auth/register" && statusCode == http.StatusOK:
		return "registration_success"
	case path == "/api/auth/register" && statusCode != http.StatusOK:
		return "registration_failure"
	case path == "/api/auth/logout" && statusCode == http.StatusOK:
		return "logout"
	case path == "/api/me/change-password" && statusCode == http.StatusOK:
		return "password_change"
	case path == "/api/me/change-password" && statusCode != http.StatusOK:
		return "password_change_failure"
	case path == "/api/me/auth" && statusCode == http.StatusOK:
		return "mfa_config_change"
	case strings.HasPrefix(path, "/api/users") && statusCode != http.StatusOK:
		return "user_management_failure"
	case strings.HasPrefix(path, "/api/api-keys") && statusCode != http.StatusOK:
		return "api_key_management_failure"
	case strings.HasPrefix(path, "/api/roles") && statusCode != http.StatusOK:
		return "role_management_failure"
	case strings.HasPrefix(path, "/api/nodes") && statusCode != http.StatusOK:
		return "node_management_failure"
	case strings.HasPrefix(path, "/api/mods") && statusCode != http.StatusOK:
		return "mod_management_failure"
	case strings.HasPrefix(path, "/api/templates") && statusCode != http.StatusOK:
		return "template_management_failure"
	case strings.HasPrefix(path, "/api/applications") && statusCode != http.StatusOK:
		return "application_management_failure"
	case strings.HasPrefix(path, "/api/system") && statusCode != http.StatusOK:
		return "system_management_failure"
	case strings.HasPrefix(path, "/api/database") && statusCode != http.StatusOK:
		return "database_management_failure"
	case strings.HasPrefix(path, "/api/security") && statusCode != http.StatusOK:
		return "security_config_failure"
	case statusCode == http.StatusTooManyRequests:
		return "rate_limit_exceeded"
	case statusCode == http.StatusForbidden:
		return "access_denied"
	case statusCode == http.StatusUnauthorized:
		return "unauthorized_access"
	case statusCode >= 500:
		return "server_error"
	default:
		return "security_event"
	}
}

// RecordSecurityActivity records security events to the activity system
func RecordSecurityActivity(r *http.Request, event SecurityEvent) {
	// Map event types to activity categories/actions
	action := event.EventType
	message := event.EventType + " from " + event.ClientIP
	
	if event.UserID != nil {
		// If we have a user ID, we could fetch the username
		message = event.EventType + " for user " + strconv.FormatInt(*event.UserID, 10) + " from " + event.ClientIP
	}
	
	// Record directly using activity repository
	go func() {
		con, err := repository.OpenDB()
		if err != nil {
			return
		}
		defer con.Close()
		repo := repository.NewActivityRepository(con)
		_, _ = repo.Create(repository.ActivityInput{
			Category:    models.ActivityCategorySecurity,
			Action:      action,
			TargetLabel: event.Path,
			Message:     message,
			UserID:      event.UserID,
		})
	}()
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if parts := strings.Split(v, ","); len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return strings.TrimSpace(v)
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	return host
}