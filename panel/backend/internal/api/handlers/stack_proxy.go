package handlers

import (
	"crypto/tls"
	"errors"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// stack_proxy.go — reverse proxy that serves an externally-run stack Go app
// under a panel-owned path.
//
// A stack is a complete, indivisible Go program the operator runs
// separately (e.g. a dashboard listening on 127.0.0.1:6600). The admin
// records its loopback port + mount segment on the stack row
// (proxy_port/proxy_root_url, migration 072); the panel then floats the app
// at /<root>/* — e.g. port 6600 + root "dash" renders the whole app at
// localhost:8080/dash. No API key is involved: the browser's panel session
// cookie IS the auth (same gate as the stack's own UI routes), and the
// proxy stamps the verified panel identity onto loopback-only headers
// (X-Panel-User-*) so the app can trust them without its own login.
//
//   GET|POST|… /<proxy_root>/* — proxied to 127.0.0.1:<proxy_port>/*
//
// Routing: roots are data (one per stack row), so chi can't mount them.
// server.go's /* SPA fallback intercepts first-segment matches and runs the
// same AuthMiddleware + STACKS_VIEW chain the /api/stacks routes use.
// Inactive/unconfigured stacks 404, so installed-but-not-activated stacks
// never render — same rule as StackUIHandler.

// stackProxyTimeouts bounds the loopback hop so a wedged stack app can't
// pin a panel worker forever. Loopback dials are microseconds; 30s to first
// byte leaves headroom for slow dashboard queries while streaming
// (FlushInterval -1) keeps SSE/live views flowing.
var stackProxyTransport = &http.Transport{
	ResponseHeaderTimeout: 30 * time.Second,
}

// LookupStackProxyRoot resolves an origin-root request path to its mounted
// stack app. Returns the active, proxy-configured stack plus the upstream
// path (always starting with "/"). ok=false when the first segment is not
// a live mount — the caller falls through to normal UI serving.
func LookupStackProxyRoot(reqPath string) (s *models.Stack, upstreamPath string, ok bool) {
	trimmed := strings.Trim(reqPath, "/")
	if trimmed == "" {
		return nil, "", false
	}
	seg := trimmed
	if i := strings.IndexByte(trimmed, '/'); i >= 0 {
		seg = trimmed[:i]
	}
	if models.IsReservedStackProxyRoot(seg) {
		return nil, "", false
	}
	repo, closeFn := openStackRepo()
	if repo == nil {
		return nil, "", false
	}
	defer closeFn()
	s, err := repo.GetActiveStackByProxyRoot(seg)
	if err != nil {
		if !errors.Is(err, repository.ErrStackNotFound) {
			log.Println("LookupStackProxyRoot error:", err)
		}
		return nil, "", false
	}
	rest := strings.TrimPrefix(trimmed[len(seg):], "/")
	return s, "/" + rest, true
}

// IsStackProxyPath reports whether path (or its first segment) is a live
// stack-app mount. Used by the CSRF layer: a proxied app's own forms POST
// back to its mount with the session cookie but no panel CSRF token, so
// those paths must not demand one. The panel session gate still runs in
// the proxy chain itself — this only skips the token check.
func IsStackProxyPath(path string) bool {
	_, _, ok := LookupStackProxyRoot(path)
	return ok
}

// ServeStackProxy reverse-proxies one request to the stack's loopback app.
// The caller must already have run AuthMiddleware + the STACKS_VIEW gate
// (server.go wires the same chain the /api/stacks routes use); r carries
// the verified user id in context.
func ServeStackProxy(w http.ResponseWriter, r *http.Request, s *models.Stack, upstreamPath string) {
	if s == nil || s.ProxyPort <= 0 || s.ProxyRootURL == "" {
		http.NotFound(w, r)
		return
	}
	target := &url.URL{Scheme: "http", Host: "127.0.0.1:" + strconv.Itoa(s.ProxyPort)}

	// Panel identity for the app: verified server-side from the session the
	// auth chain already checked. The app must only trust these headers
	// from loopback (the panel), never from the open internet.
	var uid int64
	var username string
	if id, uerr := UserIDFromContext(r); uerr == nil {
		uid = id
		if con, cerr := repository.OpenDB(); cerr == nil {
			if u, gerr := repository.NewUserRepository(con).GetByID(id); gerr == nil && u != nil {
				username = u.Username
			}
			_ = con.Close()
		}
	}

	// The panel's own middleware set framing/script policies for the SPA
	// before this handler ran. A proxied app ships its own scripts and
	// framing needs — strip the panel's so the app renders as if hit
	// directly, keeping only transport-level hygiene (nosniff/HSTS/etc).
	for _, h := range []string{
		"Content-Security-Policy",
		"X-Frame-Options",
		"Cross-Origin-Embedder-Policy",
		"Cross-Origin-Opener-Policy",
		"Cross-Origin-Resource-Policy",
	} {
		w.Header().Del(h)
	}

	proxy := &httputil.ReverseProxy{
		Director: func(out *http.Request) {
			out.URL.Scheme = target.Scheme
			out.URL.Host = target.Host
			out.URL.Path = upstreamPath
			out.URL.RawPath = ""
			// RawQuery rides through untouched.
			out.Host = target.Host
			// Never forward a client-supplied identity: the headers below
			// are panel-asserted. (Set overwrites, but delete first so a
			// multi-value smuggle can't survive.)
			out.Header.Del("X-Panel-User-Id")
			out.Header.Del("X-Panel-Username")
			out.Header.Set("X-Forwarded-Host", r.Host)
			proto := "http"
			if r.TLS != nil {
				proto = "https"
			}
			out.Header.Set("X-Forwarded-Proto", proto)
			out.Header.Set("X-Panel-User-Id", strconv.FormatInt(uid, 10))
			if username != "" {
				out.Header.Set("X-Panel-Username", username)
			}
			out.Header.Set("X-Panel-Stack", s.Slug)
		},
		Transport:     stackProxyTransport,
		FlushInterval: -1,
		ModifyResponse: func(resp *http.Response) error {
			// The app thinks it lives at the origin root, so root-relative
			// redirects (Location: /login) would escape the mount into the
			// panel UI. Re-anchor them under /<root>.
			if loc := resp.Header.Get("Location"); strings.HasPrefix(loc, "/") && !strings.HasPrefix(loc, "/"+s.ProxyRootURL+"/") && loc != "/"+s.ProxyRootURL {
				resp.Header.Set("Location", "/"+s.ProxyRootURL+loc)
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("stack proxy %q -> %s: %v", s.Slug, upstreamPath, err)
			http.Error(w, "stack app unreachable", http.StatusBadGateway)
		},
	}
	proxy.ServeHTTP(w, r)
}
