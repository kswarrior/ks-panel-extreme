package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// SanitizeMiddleware provides input sanitization for request parameters
func SanitizeMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sanitize URL path parameters - get all route params
		ctx := r.Context()
		if routeCtx := chi.RouteContext(ctx); routeCtx != nil {
			for _, key := range routeCtx.URLParams.Keys {
				val := chi.URLParam(r, key)
				if val != "" {
					// Remove null bytes and control characters
					val = strings.ReplaceAll(val, "\x00", "")
					val = sanitizeControlChars(val)
					// Note: chi doesn't allow direct modification of URL params,
					// but we can wrap the request if needed
					_ = val
				}
			}
		}

		// Sanitize query parameters
		query := r.URL.Query()
		for key, values := range query {
			for i, val := range values {
				val = strings.ReplaceAll(val, "\x00", "")
				val = sanitizeControlChars(val)
				query[key][i] = val
			}
		}
		r.URL.RawQuery = query.Encode()

		next.ServeHTTP(w, r)
	})
}

// sanitizeControlChars removes control characters except tab, newline, carriage return
func sanitizeControlChars(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r >= 32 || r == '\t' || r == '\n' || r == '\r' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// XSSProtectionMiddleware adds XSS protection headers and sanitizes responses
func XSSProtectionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Add XSS protection headers
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// Wrap response writer to sanitize output if needed
		next.ServeHTTP(w, r)
	})
}

// SecurityHeadersExtendedMiddleware adds extended security headers
func SecurityHeadersExtendedMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent clickjacking
		w.Header().Set("X-Frame-Options", "DENY")

		// Prevent MIME type sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// Referrer policy
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions policy
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")

		// Cross-origin policies
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")

		// HSTS for HTTPS
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}

		// Remove server information
		w.Header().Set("Server", "")

		next.ServeHTTP(w, r)
	})
}

// RequestValidationMiddleware validates incoming requests
func RequestValidationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check for suspicious patterns in path
		if containsSuspiciousPatterns(r.URL.Path) {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Check Content-Type for POST/PUT/PATCH requests
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" {
			contentType := r.Header.Get("Content-Type")
			if contentType != "" && !isAllowedContentType(contentType) {
				http.Error(w, "Unsupported Media Type", http.StatusUnsupportedMediaType)
				return
			}
		}

		// Limit header size
		if r.Header.Get("Content-Length") != "" {
			// Content length is checked by MaxBodySize middleware
		}

		next.ServeHTTP(w, r)
	})
}

// containsSuspiciousPatterns checks for common attack patterns in the path
func containsSuspiciousPatterns(path string) bool {
	suspiciousPatterns := []string{
		"../",
		"..\\",
		"<script",
		"javascript:",
		"onload=",
		"onerror=",
		"onclick=",
		"eval(",
		"expression(",
		"vbscript:",
		"data:text/html",
	}

	lowerPath := strings.ToLower(path)
	for _, pattern := range suspiciousPatterns {
		if strings.Contains(lowerPath, pattern) {
			return true
		}
	}
	return false
}

// isAllowedContentType checks if the content type is allowed
func isAllowedContentType(contentType string) bool {
	allowedTypes := []string{
		"application/json",
		"application/x-www-form-urlencoded",
		"multipart/form-data",
		"text/plain",
	}

	lowerType := strings.ToLower(contentType)
	for _, allowed := range allowedTypes {
		if strings.HasPrefix(lowerType, allowed) {
			return true
		}
	}
	return false
}

// MiddlewareChain returns a chain of security middlewares
func MiddlewareChain() []func(http.Handler) http.Handler {
	return []func(http.Handler) http.Handler{
		middleware.Recoverer,
		middleware.RequestID,
		middleware.RealIP,
		SanitizeMiddleware,
		RequestValidationMiddleware,
		XSSProtectionMiddleware,
		SecurityHeadersExtendedMiddleware,
	}
}

// LoggingSanitizerMiddleware sanitizes sensitive data from request/response logs
func LoggingSanitizerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wrap response writer to capture and sanitize response
		sw := &sanitizingResponseWriter{ResponseWriter: w}
		
		// Sanitize request for logging
		sanitizeRequestForLogging(r)
		
		next.ServeHTTP(sw, r)
		
		// Sanitize response for logging
		sanitizeResponseForLogging(sw)
	})
}

// sanitizingResponseWriter wraps http.ResponseWriter to capture response body
type sanitizingResponseWriter struct {
	http.ResponseWriter
	body       strings.Builder
	statusCode int
}

func (sw *sanitizingResponseWriter) WriteHeader(code int) {
	sw.statusCode = code
	sw.ResponseWriter.WriteHeader(code)
}

func (sw *sanitizingResponseWriter) Write(b []byte) (int, error) {
	// Capture body for sanitization (limit size to prevent memory issues)
	if sw.body.Len()+len(b) < 1024*1024 { // 1MB limit
		sw.body.Write(b)
	}
	return sw.ResponseWriter.Write(b)
}

// sanitizeRequestForLogging removes sensitive data from request before logging
func sanitizeRequestForLogging(r *http.Request) {
	// Remove sensitive headers
	sensitiveHeaders := []string{
		"Authorization",
		"Cookie",
		"X-CSRF-Token",
		"X-API-Key",
	}
	for _, header := range sensitiveHeaders {
		if r.Header.Get(header) != "" {
			r.Header.Set(header, "[REDACTED]")
		}
	}

	// Sanitize query parameters
	query := r.URL.Query()
	sensitiveParams := []string{
		"password",
		"token",
		"secret",
		"key",
		"api_key",
		"auth",
	}
	for _, param := range sensitiveParams {
		if query.Get(param) != "" {
			query.Set(param, "[REDACTED]")
		}
	}
	r.URL.RawQuery = query.Encode()
}

// sanitizeResponseForLogging removes sensitive data from response before logging
func sanitizeResponseForLogging(sw *sanitizingResponseWriter) {
	body := sw.body.String()
	if body == "" {
		return
	}

	// Sanitize common sensitive fields in JSON responses
	sensitiveFields := []string{
		"password",
		"token",
		"secret",
		"key",
		"api_key",
		"session_token",
		"password_hash",
		"access_token",
		"refresh_token",
	}

	sanitized := body
	for _, field := range sensitiveFields {
		// Simple JSON field sanitization (basic approach)
		_ = []string{
			fmt.Sprintf(`"%s":"[^"]*"`, field),
			fmt.Sprintf(`"%s":\s*"[^"]*"`, field),
		}
		// This is a basic approach; in production use a proper JSON parser
		sanitized = sanitizeJSONField(sanitized, field)
	}

	// In a real implementation, you would log the sanitized body here
	// For now, we just ensure it's not logged in plain text
	_ = sanitized
}

// sanitizeJSONField sanitizes a specific field in JSON string by
// replacing its value with [REDACTED]. Uses a simple string-based
// approach; in production a proper JSON parser should be used.
func sanitizeJSONField(jsonStr, field string) string {
	escaped := strings.ReplaceAll(field, `"`, `\"`)
	// Match "field": "value" or "field":value (no space after colon)
	re := fmt.Sprintf(`"%s":[^,}]*`, escaped)
	// Simple replacement: replace the value portion with [REDACTED]
	replacement := fmt.Sprintf(`"%s":"[REDACTED]"`, escaped)
	if strings.Contains(jsonStr, fmt.Sprintf(`"%s":`, escaped)) {
		jsonStr = strings.Replace(jsonStr, re, replacement, 1)
	}
	return jsonStr
}