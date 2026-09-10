package handlers

import (
	"database/sql"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// stack_serve_port.go — dedicated per-stack serve ports.
//
// Besides the /<root> path mount (stack_proxy.go), an active stack may also
// be served at the origin root of a dedicated TCP port the PANEL opens
// itself: e.g. serve_port 6901 renders the whole dash app at
// localhost:6901/. The upstream resolves exactly like the path mount
// (proxy_port loopback or remote_address + TLS flags, migration 072/076).
//
// Lifecycle: listeners are data (one per stack row), so they are reconciled
// — started, restarted on port change, stopped — from the stack mutation
// handlers (update/activate/deactivate/delete/reinstall) plus once at panel
// boot (cli/launch.go). A bind failure never fails the save or the boot:
// it is logged and the detail page reports serve_listening=false, exactly
// like privileged-port binds for operators not running as root.
//
// Security: the listener binds 127.0.0.1 only (loopback — same trust zone
// as the path mount's upstream dial). With serve_auth on (the default, fail
// closed) every request must carry a valid panel session (cookie or Bearer,
// same HMAC + lifetime + revocation + suspension checks as AuthMiddleware);
// without one the port answers 401 and the app is never dialled. The proxy
// stamps the verified panel identity onto X-Panel-User-* headers, and any
// client-supplied identity headers are stripped first, mirroring
// ServeStackProxy.

// stackServeProc is one live panel-opened listener for a stack.
type stackServeProc struct {
	stackID int64
	port    int
	srv     *http.Server
}

var (
	stackServeMu    sync.Mutex
	stackServeProcs = map[int64]*stackServeProc{}
)

// ReconcileStackServePorts syncs live listeners with the DB: every active,
// serve-configured stack listens; anything else does not. Runs at panel
// boot and is safe to re-run any time (idempotent, never fatal).
func ReconcileStackServePorts() {
	repo, closeFn := openStackRepo()
	if repo == nil {
		log.Println("stack serve: reconcile skipped (db unavailable)")
		return
	}
	stacks, err := repo.ListActiveServeStacks()
	closeFn()
	if err != nil {
		log.Println("stack serve: reconcile list error:", err)
		return
	}
	want := make(map[int64]models.Stack, len(stacks))
	for _, s := range stacks {
		want[s.ID] = s
	}
	stackServeMu.Lock()
	defer stackServeMu.Unlock()
	for id, proc := range stackServeProcs {
		w, ok := want[id]
		if !ok || w.ServePort != proc.port {
			proc.srv.Close()
			delete(stackServeProcs, id)
		}
	}
	for id, w := range want {
		if _, ok := stackServeProcs[id]; ok {
			continue
		}
		startStackServeLocked(w)
	}
}

// ReconcileStackServePort re-syncs one stack's listener after a mutation
// (update/activate/deactivate/delete/reinstall). A missing row (deleted)
// simply stops the listener.
func ReconcileStackServePort(id int64) {
	repo, closeFn := openStackRepo()
	if repo == nil {
		return
	}
	s, err := repo.GetStack(id)
	closeFn()
	stackServeMu.Lock()
	defer stackServeMu.Unlock()
	if proc, ok := stackServeProcs[id]; ok {
		proc.srv.Close()
		delete(stackServeProcs, id)
	}
	if err != nil || s == nil || !s.Active || s.ServePort == 0 {
		return
	}
	startStackServeLocked(*s)
}

// StackServeListening reports whether the panel currently holds the serve
// listener for stack id (i.e. the configured port actually bound). The
// stack response surfaces this as serve_listening so the detail page can
// render the Open-port link honestly instead of trusting the saved value.
func StackServeListening(id int64) bool {
	stackServeMu.Lock()
	defer stackServeMu.Unlock()
	_, ok := stackServeProcs[id]
	return ok
}

// startStackServeLocked binds 127.0.0.1:port and serves the stack app at /.
// The caller holds stackServeMu. Bind failures are logged, never fatal.
func startStackServeLocked(s models.Stack) {
	if s.ServePort == 0 {
		return
	}
	ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(s.ServePort))
	if err != nil {
		log.Printf("stack serve %q: listen 127.0.0.1:%d: %v", s.Slug, s.ServePort, err)
		return
	}
	stackID := s.ID
	srv := &http.Server{
		Handler:           http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { serveStackPort(w, r, stackID) }),
		ReadHeaderTimeout: 10 * time.Second,
	}
	stackServeProcs[s.ID] = &stackServeProc{stackID: s.ID, port: s.ServePort, srv: srv}
	go func() {
		if serr := srv.Serve(ln); serr != nil && serr != http.ErrServerClosed {
			log.Printf("stack serve %q on :%d ended: %v", s.Slug, s.ServePort, serr)
		}
	}()
	log.Printf("stack serve %q listening on http://127.0.0.1:%d/ (auth=%v)", s.Slug, s.ServePort, s.ServeAuth)
}

// serveStackPort serves one request on a dedicated stack port. The stack row
// is resolved live per request (openStackRepo + GetStack) so deactivation,
// deletion, port/auth changes and reconciler stops take effect on the very
// next request without waiting for a listener restart.
func serveStackPort(w http.ResponseWriter, r *http.Request, stackID int64) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	repo, closeFn := openStackRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	s, err := repo.GetStack(stackID)
	closeFn()
	if err != nil || s == nil || !s.Active || s.ServePort == 0 {
		http.NotFound(w, r)
		return
	}
	var uid int64
	var username string
	if s.ServeAuth {
		var ok bool
		if uid, username, ok = stackServeSession(r); !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"panel login required"}`))
			return
		}
	} else if id, uerr := stackServeOptionalSession(r); uerr == nil {
		uid = id
		username, _ = stackServeUsername(id)
	}
	scheme, addr := s.StackDialTarget()
	if strings.TrimSpace(addr) == "" || strings.TrimSpace(addr) == "127.0.0.1:0" {
		http.Error(w, "stack app unreachable", http.StatusBadGateway)
		return
	}
	target := &url.URL{Scheme: scheme, Host: addr}
	proxy := &httputil.ReverseProxy{
		Director: func(out *http.Request) {
			out.URL.Scheme = target.Scheme
			out.URL.Host = target.Host
			// The app IS at the origin root here — the request path
			// passes through untouched (unlike the /<root> mount,
			// which strips its first segment). No Location rewrite
			// is needed for the same reason.
			out.URL.Path = r.URL.Path
			out.URL.RawPath = ""
			out.Host = target.Host
			// Never forward a client-supplied identity: the headers
			// below are panel-asserted (delete first so a multi-value
			// smuggle can't survive).
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
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("stack serve %q -> %s: %v", s.Slug, r.URL.Path, err)
			http.Error(w, "stack app unreachable", http.StatusBadGateway)
		},
	}
	proxy.ServeHTTP(w, r)
}

// stackServeSession validates a panel session for the serve-auth gate:
// cookie or Bearer HMAC, absolute lifetime, revocation list, suspension —
// the same checks AuthMiddleware enforces on the main port. Fail closed:
// any doubt returns ok=false and the app is never dialled.
func stackServeSession(r *http.Request) (int64, string, bool) {
	raw := stackServeBearer(r)
	if raw == "" {
		c, err := r.Cookie(auth.SessionCookieName)
		if err != nil {
			return 0, "", false
		}
		raw = c.Value
	}
	uid, issuedAt, err := auth.ValidateSessionToken(raw)
	if err != nil {
		return 0, "", false
	}
	policy := auth.CurrentSessionPolicy()
	if !issuedAt.IsZero() && time.Since(issuedAt) > policy.Lifetime {
		return 0, "", false
	}
	if !auth.SessionManagerInstance.TrackedSessionValid(raw, policy.IdleTimeout) {
		return 0, "", false
	}
	con, err := repository.OpenDB()
	if err != nil {
		return 0, "", false
	}
	defer con.Close()
	if suspended, _, _ := repository.NewUserRepository(con).IsUserSuspended(uid); suspended {
		return 0, "", false
	}
	username, _ := stackServeUsername(con, uid)
	return uid, username, true
}

// stackServeOptionalSession best-effort resolves the session for an
// auth-off port so the app still sees WHO is browsing when a session
// happens to be present. Never gates: any failure yields uid 0.
func stackServeOptionalSession(r *http.Request) (int64, error) {
	raw := stackServeBearer(r)
	if raw == "" {
		c, err := r.Cookie(auth.SessionCookieName)
		if err != nil {
			return 0, fmt.Errorf("no session")
		}
		raw = c.Value
	}
	uid, _, err := auth.ValidateSessionToken(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	return uid, nil
}

// stackServeBearer pulls a `Bearer <token>` session out of the
// Authorization header (mirrors the middleware's cookie-first fallback
// order in reverse: explicit header wins when both are present).
func stackServeBearer(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}

func stackServeUsername(uid int64) (string, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return "", err
	}
	defer con.Close()
	return stackServeUsernameWith(con, uid)
}

func stackServeUsernameWith(con interface {
	QueryRow(query string, args ...any) *struct{} // placeholder — replaced below
}, uid int64) (string, error) {
	return "", fmt.Errorf("unimplemented")
}
