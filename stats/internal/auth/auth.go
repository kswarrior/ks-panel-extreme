package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"os"
	"strings"
)

// Owner-only: check STATS_ADMIN_USER/PASS or STATS_ADMIN_PASSWORD or ADMIN_PASSWORD
// If no password set, allow all (dev). For production set env.
// Also supports session cookie after successful basic auth.

const cookieName = "stats_session"

func token() string {
	for _, k := range []string{"STATS_ADMIN_PASSWORD", "ADMIN_PASSWORD", "STATS_PASSWORD"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

func user() string {
	for _, k := range []string{"STATS_ADMIN_USER", "ADMIN_USER"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return "admin"
}

func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return base64.StdEncoding.EncodeToString(h[:])
}

var sessionValue = ""

func init() {
	// lazy: computed on first check
}

func IsConfigured() bool { return token() != "" }

func Check(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// public: /ws, /health
		if strings.HasPrefix(r.URL.Path, "/ws") || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		tok := token()
		if tok == "" {
			// dev: no auth
			next.ServeHTTP(w, r)
			return
		}
		// cookie session
		if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
			expected := hashToken(tok)
			if subtle.ConstantTimeCompare([]byte(c.Value), []byte(expected)) == 1 {
				next.ServeHTTP(w, r)
				return
			}
		}
		// basic auth
		u, p, ok := r.BasicAuth()
		if ok && u == user() && subtle.ConstantTimeCompare([]byte(p), []byte(tok)) == 1 {
			http.SetCookie(w, &http.Cookie{Name: cookieName, Value: hashToken(tok), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 86400 * 7})
			next.ServeHTTP(w, r)
			return
		}
		// also allow ?token= query for API polling (dashboard fetch)
		if q := r.URL.Query().Get("token"); q != "" && subtle.ConstantTimeCompare([]byte(q), []byte(tok)) == 1 {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("WWW-Authenticate", `Basic realm="stats"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		_ = r.ParseForm()
		p := r.Form.Get("password")
		tok := token()
		if tok != "" && subtle.ConstantTimeCompare([]byte(p), []byte(tok)) == 1 {
			http.SetCookie(w, &http.Cookie{Name: cookieName, Value: hashToken(tok), Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 86400 * 7})
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		http.Error(w, "bad password", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(`<form method=POST style="max-width:320px;margin:100px auto;font-family:sans-serif"><h3>stats login</h3><input name=password type=password placeholder=password style="width:100%;padding:8px" autofocus><button style="margin-top:8px;width:100%;padding:8px">login</button></form>`))
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/login", http.StatusFound)
}
