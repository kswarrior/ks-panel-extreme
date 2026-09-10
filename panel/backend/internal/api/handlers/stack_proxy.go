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
// separately — on the SAME host (e.g. a dashboard on 127.0.0.1:6600) or on
// ANOTHER host (e.g. 10.0.0.9:7700, node-style). The admin records the
// dial target on the stack row (proxy_port for loopback, remote_address +
// TLS flags for remote, migration 072/076) plus the mount segment
// (proxy_root_url); the panel then floats the app at /<root>/* — e.g.
// root "dash" renders the whole app at localhost:8080/dash. No API key is
// involved: the browser's panel session cookie IS the auth (same gate as
// the stack's own UI routes), and the proxy stamps the verified panel
// identity onto headers (X-Panel-User-*) so the app can trust them without
// its own login. The app authenticates back to the panel with its pairing
// token (kss_…) on the heartbeat + token API instead.
//
//   GET|POST|… /<proxy_root>/* — proxied to the stack app
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

// stackProxyInsecureTransport is the same bound for remote stacks that opted
// into skip-verify (self-signed certs, mirrors the probe clientFor split).
var stackProxyInsecureTransport = &http.Transport{
	ResponseHeaderTimeout: 30 * time.Second,
	TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
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

// stackProxyTransportFor picks the dial transport for a stack app: the
// insecure one only for remote stacks that explicitly opted into
// skip-verify (self-signed). Same-host loopback and verified remotes share
// the default transport.
func stackProxyTransportFor(s *models.Stack) *http.Transport {
	if s != nil && s.IsRemoteStack() && s.RemoteSkipVerify {
		return stackProxyInsecureTransport
	}
	return stackProxyTransport
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

// ServeStackProxy reverse-proxies one request to the stack app — same-host
// loopback (127.0.0.1:proxy_port) or a remote address (node-style) when
// the row carries one. The caller must already have run AuthMiddleware +
// the STACKS_VIEW gate (server.go wires the same chain the /api/stacks
// routes use); r carries the verified user id in context.
func ServeStackProxy(w http.ResponseWriter, r *http.Request, s *models.Stack, upstreamPath string) {
	if s == nil || s.ProxyRootURL == "" {
		http.NotFound(w, r)
		return
	}
	scheme, addr := s.StackDialTarget()
	if strings.TrimSpace(addr) == "" || strings.TrimSpace(addr) == "127.0.0.1:0" {
		http.NotFound(w, r)
		return
	}
	target := &url.URL{Scheme: scheme, Host: addr}

	// Panel identity for the app: verified server-side from the session the
	// auth chain already checked. The app must only trust these headers on
	// connections coming from the panel (same-host loopback or the panel's
	// IP for remote stacks), never from the open internet.
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
		Transport:     stackProxyTransportFor(s),
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
