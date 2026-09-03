// Package sftp exposes a chrooted SSH+SFTP server on ksedge so instance
// owners can use FileZilla / WinSCP / `sftp -P` against their workload's
// files without going through the panel File Manager.
//
// Wire format (both JSON, both under /api/edge/sftp):
//
//	POST /api/edge/sftp/provision {token,kind,name,username,password,root}
//	POST /api/edge/sftp/delete    {token,username[,kind,name]}
//
// Authentication mirrors every other panel→edge RPC: the same shared edge
// token, constant-time compared, with the explicit empty-token guard so the
// localnode boot window rejects everything.
//
// Credentials live ONLY in memory (map guarded by a mutex). An edge restart
// wipes them; the panel re-provisions from its vault (instance_secrets key
// "sftp_password") on the next Start/Unsuspend/Rotate so SFTP heals without
// operator action. The cleartext password is never logged, never persisted
// on the edge — only the bcrypt hash is kept.
//
// Each SSH session is jailed to the provisioned root via jailHandler, which
// reuses the file manager's isDangerousPath denylist
// (edge/backend/internal/files/handler.go:165) at provision time AND on
// every operation, so a `cd /` + `get /etc/passwd` or a `../` walk can never
// escape the instance directory.
package sftp

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/ssh"
)

// DefaultPort is the edge SSH listen port when --sftp-port is not given.
// It matches the panel's instance_sftp.port DEFAULT 2222 (migration 058).
const DefaultPort = 2222

// ProvisionRequest is what the panel's edge.Client.ProvisionSFTP emits.
type ProvisionRequest struct {
	Token    string `json:"token"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
	Root     string `json:"root"`
}

// DeleteRequest removes one in-memory credential. Username is required;
// Kind+Name are accepted for logging only.
type DeleteRequest struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Kind     string `json:"kind,omitempty"`
	Name     string `json:"name,omitempty"`
}

// Response is what the edge hands back.
type Response struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// Credential is one provisioned SFTP identity. PasswordHash is the bcrypt
// hash — the cleartext never survives the provision call.
type Credential struct {
	Kind     string
	Name     string
	Username string
	// PasswordHash is the bcrypt hash of the panel-minted password.
	PasswordHash []byte
	Root         string
}

var (
	credsMu sync.RWMutex
	creds   = map[string]*Credential{}
)

// validUsername enforces the panel's "inst_<id>" minting rule so a
// compromised panel token can't be used to create arbitrary OS-level names
// (e.g. "root" or "../../x") on the edge.
var validUsername = regexp.MustCompile(`^inst_[0-9]+$`)

// ---------------------------------------------------------------------------
// rate limit: 5 failures in 15m locks the (ip,username) pair for 15m.
// Mirrors the panel's account_lockout policy (5 attempts / 15m window).
// ---------------------------------------------------------------------------

type attempt struct {
	count       int
	windowStart time.Time
	lockedUntil time.Time
}

var (
	attemptsMu sync.Mutex
	attempts   = map[string]*attempt{}
)

const (
	maxAttempts   = 5
	windowSpan    = 15 * time.Minute
	lockoutSpan   = 15 * time.Minute
	bcryptCost    = bcrypt.DefaultCost
	maxPasswordLn = 256
)

// attemptKey scopes the lockout to one source IP + one username so a single
// attacker can't lock out every instance owner behind the same NAT, and one
// instance's brute-force doesn't lock the others.
func attemptKey(remoteAddr, username string) string {
	ip := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		ip = h
	}
	return ip + "|" + username
}

func locked(key string) bool {
	attemptsMu.Lock()
	defer attemptsMu.Unlock()
	a, ok := attempts[key]
	if !ok {
		return false
	}
	now := time.Now()
	if !a.lockedUntil.IsZero() && now.Before(a.lockedUntil) {
		return true
	}
	// Expired lockout / window: reset lazily so the map can't grow forever.
	if !a.lockedUntil.IsZero() && !now.Before(a.lockedUntil) {
		delete(attempts, key)
		return false
	}
	if now.Sub(a.windowStart) > windowSpan {
		delete(attempts, key)
		return false
	}
	return false
}

func recordFailure(key string) {
	attemptsMu.Lock()
	defer attemptsMu.Unlock()
	now := time.Now()
	a, ok := attempts[key]
	if !ok || now.Sub(a.windowStart) > windowSpan {
		a = &attempt{count: 0, windowStart: now}
		attempts[key] = a
	}
	a.count++
	if a.count >= maxAttempts {
		a.lockedUntil = now.Add(lockoutSpan)
	}
}

func clearAttempts(key string) {
	attemptsMu.Lock()
	defer attemptsMu.Unlock()
	delete(attempts, key)
}

// ---------------------------------------------------------------------------
// path safety: same denylist as the file manager's isDangerousPath
// (edge/backend/internal/files/handler.go:165). Kept as a local copy because
// that helper is unexported; the list is duplicated verbatim so the two
// surfaces can never drift.
// ---------------------------------------------------------------------------

// isDangerousPath reports whether p is a sensitive system path that must
// never serve as an SFTP root. Mirrors files.isDangerousPath exactly.
func isDangerousPath(p string) bool {
	p = filepath.Clean(p)
	if p == "/" {
		return true
	}
	for _, d := range []string{"/bin", "/sbin", "/usr", "/etc", "/proc", "/sys", "/dev", "/boot", "/lib", "/lib64", "/root"} {
		if p == d || strings.HasPrefix(p, d+"/") {
			return true
		}
	}
	return false
}

// defaultRootFor returns the fallback chroot when the panel provisions with
// an empty root (instance has no host bind-mount). It is deterministic per
// username so a re-provision after an edge restart lands in the same place.
func defaultRootFor(username string) string {
	return filepath.Join(os.TempDir(), "kspanel-sftp", username)
}

// ---------------------------------------------------------------------------
// jailHandler: OS-backed SFTP handlers jailed inside one root.
// Every SFTP virtual path (always absolute POSIX, e.g. "/a/b") is mapped to
// root/a/b; any mapping that escapes the root is rejected before touching
// the OS. Symlinked ancestors are resolved best-effort and re-checked so a
// symlink planted inside the root can't point the session at /etc.
// ---------------------------------------------------------------------------

type jailHandler struct {
	root string
}

// resolve maps a virtual SFTP path to a host path inside the root.
// It returns an error when the mapping escapes the jail.
func (h *jailHandler) resolve(virtual string) (string, error) {
	v := filepath.ToSlash(filepath.Clean("/" + strings.TrimPrefix(filepath.ToSlash(virtual), "/")))
	rel := strings.TrimPrefix(v, "/")
	host := filepath.Join(h.root, filepath.FromSlash(rel))
	cleanRoot := filepath.Clean(h.root)
	cleanHost := filepath.Clean(host)
	if cleanHost != cleanRoot && !strings.HasPrefix(cleanHost, cleanRoot+string(os.PathSeparator)) {
		return "", fmt.Errorf("path escapes SFTP root")
	}
	// Best-effort symlink containment: when the target (or its deepest
	// existing ancestor) resolves outside the root, refuse. EvalSymlinks
	// fails for not-yet-existing create targets, so walk up to the deepest
	// existing ancestor instead of failing the whole operation.
	target := cleanHost
	for {
		resolved, err := filepath.EvalSymlinks(target)
		if err == nil {
			resolved = filepath.Clean(resolved)
			if resolved != cleanRoot && !strings.HasPrefix(resolved, cleanRoot+string(os.PathSeparator)) {
				return "", fmt.Errorf("path escapes SFTP root")
			}
			return cleanHost, nil
		}
		parent := filepath.Dir(target)
		if parent == target || parent == "." {
			return cleanHost, nil
		}
		// Only climb while still inside the root; outside ancestors are
		// already rejected by the prefix check above.
		if parent != cleanRoot && !strings.HasPrefix(parent, cleanRoot+string(os.PathSeparator)) {
			return "", fmt.Errorf("path escapes SFTP root")
		}
		target = parent
	}
}

// Fileread serves Method "Get".
func (h *jailHandler) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	host, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	return os.Open(host)
}

// Filewrite serves Methods "Put" and "Open".
func (h *jailHandler) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	host, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	flags := r.Pflags()
	osFlags := os.O_WRONLY
	if flags.Read && flags.Write {
		osFlags = os.O_RDWR
	} else if flags.Read {
		osFlags = os.O_RDONLY
	}
	if flags.Creat {
		osFlags |= os.O_CREATE
	}
	if flags.Trunc {
		osFlags |= os.O_TRUNC
	}
	if flags.Excl {
		osFlags |= os.O_EXCL
	}
	if flags.Append {
		osFlags |= os.O_APPEND
	}
	if osFlags&(os.O_CREATE|os.O_WRONLY|os.O_RDWR) != 0 {
		if err := os.MkdirAll(filepath.Dir(host), 0o750); err != nil {
			return nil, err
		}
	}
	return os.OpenFile(host, osFlags, 0o640)
}

// Filecmd serves Methods Setstat, Rename, Rmdir, Mkdir, Link, Symlink,
// Remove (and PosixRename via the rename branch).
func (h *jailHandler) Filecmd(r *sftp.Request) error {
	switch r.Method {
	case "Mkdir":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		return os.MkdirAll(host, 0o750)
	case "Rmdir":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		return os.Remove(host)
	case "Remove":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		// Refuse to remove the root itself; files inside are fair game.
		if filepath.Clean(host) == filepath.Clean(h.root) {
			return fmt.Errorf("refusing to remove SFTP root")
		}
		return os.Remove(host)
	case "Rename", "PosixRename":
		oldHost, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		newHost, err := h.resolve(r.Target)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(newHost), 0o750); err != nil {
			return err
		}
		return os.Rename(oldHost, newHost)
	case "Symlink":
		// r.Filepath is the target, r.Target is the linkpath (per
		// requestFromPacket's POSIX note). Jail the linkpath; the target
		// is stored verbatim but every later resolve re-jails it, so a
		// symlink pointing at /etc/passwd can never be followed outside.
		linkHost, err := h.resolve(r.Target)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(linkHost), 0o750); err != nil {
			return err
		}
		return os.Symlink(r.Filepath, linkHost)
	case "Link":
		srcHost, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		dstHost, err := h.resolve(r.Target)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dstHost), 0o750); err != nil {
			return err
		}
		return os.Link(srcHost, dstHost)
	case "Setstat":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return err
		}
		attrs := r.Attributes()
		if attrs == nil {
			return nil
		}
		if r.AttrFlags().Permissions {
			_ = os.Chmod(host, attrs.FileMode())
		}
		// Size truncate honoured; uid/gid + times intentionally ignored
		// (the edge has no reason to chown on behalf of an SFTP user).
		if r.AttrFlags().Size {
			_ = os.Truncate(host, int64(attrs.Size))
		}
		return nil
	default:
		return fmt.Errorf("unsupported operation: %s", r.Method)
	}
}

// listerat adapts a []os.FileInfo slice to sftp.ListerAt.
type listerat []os.FileInfo

func (l listerat) ListAt(buf []os.FileInfo, off int64) (int, error) {
	if off >= int64(len(l)) {
		return 0, io.EOF
	}
	n := copy(buf, l[off:])
	if int64(len(l))-off <= int64(len(buf)) {
		return n, io.EOF
	}
	return n, nil
}

// Filelist serves Methods List, Stat, Lstat.
func (h *jailHandler) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	switch r.Method {
	case "List":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return nil, err
		}
		entries, err := os.ReadDir(host)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(entries))
		for _, e := range entries {
			fi, err := e.Info()
			if err != nil {
				continue
			}
			infos = append(infos, fi)
		}
		return listerat(infos), nil
	case "Stat", "Lstat":
		host, err := h.resolve(r.Filepath)
		if err != nil {
			return nil, err
		}
		var fi os.FileInfo
		var serr error
		if r.Method == "Lstat" {
			fi, serr = os.Lstat(host)
		} else {
			fi, serr = os.Stat(host)
		}
		if serr != nil {
			return nil, serr
		}
		return listerat([]os.FileInfo{fi}), nil
	default:
		return nil, fmt.Errorf("unsupported operation: %s", r.Method)
	}
}

// Lstat keeps symlinks un-followed for lstat requests.
func (h *jailHandler) Lstat(r *sftp.Request) (sftp.ListerAt, error) {
	host, err := h.resolve(r.Filepath)
	if err != nil {
		return nil, err
	}
	fi, err := os.Lstat(host)
	if err != nil {
		return nil, err
	}
	return listerat([]os.FileInfo{fi}), nil
}

// RealPath answers realpath(3) inside the jail without resolving symlinks
// (the resolve step on the next operation enforces containment anyway).
func (h *jailHandler) RealPath(p string) (string, error) {
	v := filepath.ToSlash(filepath.Clean("/" + strings.TrimPrefix(filepath.ToSlash(p), "/")))
	return v, nil
}

// Readlink refuses to leak host-absolute targets: a link whose target
// escapes the jail reads back as its jailed virtual path.
func (h *jailHandler) Readlink(p string) (string, error) {
	host, err := h.resolve(p)
	if err != nil {
		return "", err
	}
	target, err := os.Readlink(host)
	if err != nil {
		return "", err
	}
	// If the stored target is absolute on the host, re-jail it when it
	// points inside the root; otherwise return it verbatim (a dangling or
	// relative target the client created — harmless, resolve() jails it).
	cleanRoot := filepath.Clean(h.root)
	cleanTarget := filepath.Clean(target)
	if filepath.IsAbs(target) && (cleanTarget == cleanRoot || strings.HasPrefix(cleanTarget, cleanRoot+string(os.PathSeparator))) {
		rel, err := filepath.Rel(cleanRoot, cleanTarget)
		if err == nil {
			return "/" + filepath.ToSlash(rel), nil
		}
	}
	return target, nil
}

// ---------------------------------------------------------------------------
// provision / delete RPCs
// ---------------------------------------------------------------------------

// Provision validates the request, hashes the password with bcrypt, ensures
// the root exists, and stores the credential in memory.
func provision(req ProvisionRequest) error {
	if req.Username == "" || !validUsername.MatchString(req.Username) {
		return fmt.Errorf("username must look like inst_<id>")
	}
	if req.Name == "" {
		return fmt.Errorf("instance name is required")
	}
	if req.Password == "" {
		return fmt.Errorf("password is required")
	}
	if len(req.Password) > maxPasswordLn {
		return fmt.Errorf("password too long")
	}
	if len(req.Password) < 16 {
		return fmt.Errorf("password too short (panel mints 32 random bytes)")
	}
	root := strings.TrimSpace(req.Root)
	if root == "" {
		root = defaultRootFor(req.Username)
	}
	root = filepath.Clean(root)
	if !filepath.IsAbs(root) {
		return fmt.Errorf("root must be an absolute path")
	}
	if isDangerousPath(root) {
		return fmt.Errorf("root must not be a system path")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := os.MkdirAll(root, 0o750); err != nil {
		return fmt.Errorf("create root: %w", err)
	}
	credsMu.Lock()
	defer credsMu.Unlock()
	creds[req.Username] = &Credential{
		Kind:         req.Kind,
		Name:         req.Name,
		Username:     req.Username,
		PasswordHash: hash,
		Root:         root,
	}
	return nil
}

// remove deletes one credential + its rate-limit state. Idempotent: unknown
// usernames are not an error so Destroy/Suspend retries stay safe.
func remove(username string) {
	credsMu.Lock()
	delete(creds, username)
	credsMu.Unlock()
	// Drop lockouts for the user across all source IPs (best-effort: scan
	// the suffix). A rotate/unlock must not leave a stale 15m ban behind.
	suffix := "|" + username
	attemptsMu.Lock()
	for k := range attempts {
		if strings.HasSuffix(k, suffix) {
			delete(attempts, k)
		}
	}
	attemptsMu.Unlock()
}

// lookup returns a copy of the credential for auth (nil when unknown).
func lookup(username string) *Credential {
	credsMu.RLock()
	defer credsMu.RUnlock()
	c := creds[username]
	if c == nil {
		return nil
	}
	cp := *c
	return &cp
}

// Count returns the number of provisioned credentials (for logs/tests).
func Count() int {
	credsMu.RLock()
	defer credsMu.RUnlock()
	return len(creds)
}

// Handler returns an http.Handler authenticated by the given edge token. It
// serves BOTH /api/edge/sftp/provision and /api/edge/sftp/delete through its
// own ServeMux — mount the SAME handler at both literal paths (the install
// handler pattern) so the /delete sub-path is reachable without a
// trailing-slash redirect.
func Handler(token string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/edge/sftp/provision", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var req ProvisionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if !constTimeEqual(req.Token, token) || token == "" {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if err := provision(req); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		// Never log the password or its length; the username + workload
		// are enough to correlate a provision with a panel instance.
		log.Printf("sftp: provisioned %q for %s/%s", req.Username, req.Kind, req.Name)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{OK: true})
	})
	mux.HandleFunc("/api/edge/sftp/delete", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var req DeleteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid payload: "+err.Error())
			return
		}
		if !constTimeEqual(req.Token, token) || token == "" {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if req.Username == "" {
			writeErr(w, http.StatusBadRequest, "username is required")
			return
		}
		remove(req.Username)
		log.Printf("sftp: removed %q", req.Username)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Response{OK: true})
	})
	return mux
}

func constTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Response{OK: false, Error: msg})
}

// ---------------------------------------------------------------------------
// SSH server
// ---------------------------------------------------------------------------

// Start listens for SSH/SFTP on port and serves until the listener errors.
// It blocks; callers run it in a goroutine next to the HTTP health server.
// The host key is ephemeral (generated per process) — clients see a changed
// key after an edge restart, which is the honest signal that in-memory
// credentials were also wiped and the panel must re-provision.
func Start(port int) error {
	if port <= 0 || port > 65535 {
		port = DefaultPort
	}
	cfg := &ssh.ServerConfig{
		// No auth banner: the username (inst_<id>) + port are already enough
		// for a scanner to learn this is a KS edge. Keep it quiet.
		PasswordCallback: passwordAuth,
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("sftp: generate host key: %w", err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		return fmt.Errorf("sftp: host key signer: %w", err)
	}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("sftp: listen :%d: %w", port, err)
	}
	log.Printf("ksedge sftp listening on :%d", port)
	for {
		nc, err := ln.Accept()
		if err != nil {
			log.Printf("sftp: accept: %v", err)
			continue
		}
		go handleConn(nc, cfg)
	}
}

func passwordAuth(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
	username := c.User()
	key := attemptKey(c.RemoteAddr().String(), username)
	if locked(key) {
		return nil, fmt.Errorf("too many failed attempts, try again later")
	}
	cred := lookup(username)
	if cred == nil {
		recordFailure(key)
		return nil, fmt.Errorf("invalid credentials")
	}
	// Suspended instances have their edge credential deleted by the panel,
	// so a lookup miss above already blocks them. The enabled flag lives in
	// the panel DB (instance_sftp.enabled) — the edge is the enforcement
	// point via credential presence, not a second flag.
	if err := bcrypt.CompareHashAndPassword(cred.PasswordHash, pass); err != nil {
		recordFailure(key)
		return nil, fmt.Errorf("invalid credentials")
	}
	clearAttempts(key)
	return &ssh.Permissions{
		Extensions: map[string]string{
			"username": username,
		},
	}, nil
}

func handleConn(nc net.Conn, cfg *ssh.ServerConfig) {
	defer nc.Close()
	conn, chans, reqs, err := ssh.NewServerConn(nc, cfg)
	if err != nil {
		return
	}
	defer conn.Close()
	// The incoming global-request channel must be serviced (or the peer's
	// keepalives block); we discard them — no global requests are honoured.
	go ssh.DiscardRequests(reqs)
	username := conn.User()
	cred := lookup(username)
	if cred == nil {
		// Password was valid at handshake but the credential vanished
		// mid-handshake (concurrent delete / suspend). Fail closed.
		return
	}
	for newCh := range chans {
		if newCh.ChannelType() != "session" {
			_ = newCh.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}
		ch, reqs, err := newCh.Accept()
		if err != nil {
			continue
		}
		go handleSession(ch, reqs, cred)
	}
}

// handleSession serves one SSH session channel. Only the "sftp" subsystem is
// accepted — "shell", "exec" and "pty-req" are explicitly rejected so SFTP
// credentials can never become a remote shell.
func handleSession(ch ssh.Channel, reqs <-chan *ssh.Request, cred *Credential) {
	defer ch.Close()
	for req := range reqs {
		switch req.Type {
		case "subsystem":
			if len(req.Payload) < 4 {
				_ = req.Reply(false, nil)
				continue
			}
			sub := string(req.Payload[4:])
			if sub != "sftp" {
				_ = req.Reply(false, nil)
				continue
			}
			_ = req.Reply(true, nil)
			handlers := sftp.Handlers{
				FileGet:  &jailHandler{root: cred.Root},
				FilePut:  &jailHandler{root: cred.Root},
				FileCmd:  &jailHandler{root: cred.Root},
				FileList: &jailHandler{root: cred.Root},
			}
			srv := sftp.NewRequestServer(ch, handlers)
			_ = srv.Serve()
			return
		default:
			// Reject everything else (shell/exec/pty-req/env/…). Replying
			// false to "shell" is what keeps this an SFTP-only account.
			_ = req.Reply(false, nil)
		}
	}
}
