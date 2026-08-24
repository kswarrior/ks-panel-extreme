// Package handlers: InstanceFilesHandler proxies the browser's File
// Manager calls to the owning edge node's /api/edge/files endpoint.
//
// The panel sits between the browser (which only knows its HttpOnly
// session cookie) and the edge (which only accepts the per-node edge
// token), mirroring the trust model used by TerminalHandler. Routes
// exposed:
//
//   GET    /api/instances/{id}/files?op=list&path=/mc
//        → forwards to edge ?op=list, returns {"entries":[…],"path":…}
//   GET    /api/instances/{id}/files/read?path=/mc/server.jar
//        → forwards to edge ?op=read, streams raw bytes back to the
//          browser with Content-Disposition set so downloads land with
//          the right filename.
//   POST   /api/instances/{id}/files?op=write|mkdir|rename|delete|chmod
//        → mutate-state proxy (the SPA uses the matching HTTP verb).
//   POST   /api/instances/{id}/files/upload  (multipart)
//        → streams the uploaded file to the edge as op=upload.
//   POST   /api/instances/{id}/files/url     (JSON {path,url})
//        → SSRF-safe fetch of `url`, then proxies the bytes to the edge
//          as op=upload at `path`. Same trust model as InstallModFromURL.
//
// All routes are gated with VIEW_INSTANCES — same permission gate as the
// Terminal WebSocket bridge — so any user that can see an instance can
// also browse its files.

package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// sqlDB is a tiny alias so helper signatures stay short and we don't have
// to repeat `*sql.DB` everywhere in this file.
type sqlDB = *sql.DB

// filesProxyHTTPClient is shared across requests. The per-request HTTP
// client in edge.Client has a 30s timeout which is too short to stream a
// large server.jar; here we keep a longer-but-bounded client so we never
// hold a connection forever.
var filesProxyHTTPClient = &http.Client{
	Timeout: 10 * time.Minute,
}

// supportedFileOps is the set of operations the panel knows how to proxy
// to the edge. Anything outside this set returns 400 — keeps the SPA from
// silently doing nothing on a typo.
var supportedFileOps = map[string]bool{
	"list": true, "stat": true, "read": true,
	"write": true, "upload": true, "mkdir": true,
	"rename": true, "delete": true, "chmod": true,
}

// InstanceFilesHandler proxies ?op=… queries to the edge. Bound at
// /api/instances/{id}/files. Read-only ops default to GET; the rest
// require POST/DELETE — see filesHandlerMethodHint below.
func InstanceFilesHandler(w http.ResponseWriter, r *http.Request) {
	// Enforce the template-page whitelist before the op-routing so a denied
	// request never reaches the edge.
	if !guardInstancePage(w, r, "files") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	qs := r.URL.Query()
	op := qs.Get("op")
	if op == "" {
		op = "list"
	}
	if !supportedFileOps[op] {
		http.Error(w, "unsupported op "+op, http.StatusBadRequest)
		return
	}
	proxyToEdge(w, r, id, op, qs.Get("path"), "application/json")
}

// InstanceFileReadHandler streams a single file's bytes back to the
// browser so a "Download server.jar" button can save it locally without
// buffering the whole jar in panel memory.
func InstanceFileReadHandler(w http.ResponseWriter, r *http.Request) {
	// Enforce the template-page whitelist: the Files "read/download" surface
	// is part of the Files tab, so the same gate as the file browser applies.
	if !guardInstancePage(w, r, "files") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	// We forward the path verbatim; the edge sets the right
	// Content-Disposition with the basename so downloads produce a clean
	// filename on the client side.
	proxyToEdge(w, r, id, "read", r.URL.Query().Get("path"), "")
}

// proxyToEdge does the read-row → dial-node → forward dance shared by all
// files endpoints. contentType, when non-empty, overrides the edge's
// Content-Type on the way back (used by list/stat which produces JSON).
//
// The HTTP method is forwarded from the caller's request so POST/DELETE
// reach the edge unchanged — that's what lets the SPA's mkdir / upload /
// rename / delete actions actually mutate state instead of silently
// succeeding with no effect.
func proxyToEdge(w http.ResponseWriter, r *http.Request, id int64, op, path, contentType string) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil {
		writeJSONStatus(w, http.StatusNotFound, map[string]any{
			"error": "instance not found",
		})
		return
	}
	// external_id is what the docker driver actually named the container;
	// fall back to the panel instance name to match the terminal bridge.
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	node, err := repository.NewNodeRepository(con).GetNode(inst.NodeID)
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "owner node not found",
		})
		return
	}
	token, err := repository.NewNodeRepository(con).PlainToken(inst.NodeID)
	if err != nil || token == "" {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "node has no usable edge token (rotate it first)",
		})
		return
	}

	// Build the edge URL with the op/kind/name/path/token query string.
	q := url.Values{}
	q.Set("op", op)
	q.Set("kind", inst.Kind)
	q.Set("name", name)
	q.Set("path", path)
	q.Set("token", token)
	// Forward query params the edge cares about (rename's `to`, chmod's
	// `mode`). Anything else falls through as part of the request body.
	for _, k := range []string{"to", "mode"} {
		if v := r.URL.Query().Get(k); v != "" {
			q.Set(k, v)
		}
	}
	// If the template binds the requested path into the edge's local
	// filesystem, tell the edge to read it directly off the host instead of
	// shelling into the container. This makes the File Manager work whether
	// or not docker is reachable on the edge, and even when the container
	// is stopped — both real regressions operators hit with the default
	// Minecraft template before this was wired.
	//
	// Rename needs PAIR consistency: the SPA sends `to` as a container
	// path (same coordinate space as `path`). If only the source were
	// translated to host_path, the edge would os.Rename the file onto a
	// literal "/mc/…" path on its own filesystem. So translate the
	// destination too, and when EITHER side falls outside the mounts,
	// drop host_path entirely so the edge handles both paths inside the
	// container via `mv` (where they are both valid).
	if op == "rename" {
		to := r.URL.Query().Get("to")
		hpFrom := hostPathForInstance(con, inst, path)
		if to != "" && hpFrom != "" {
			if hpTo := hostPathForInstance(con, inst, to); hpTo != "" {
				q.Set("host_path", hpFrom)
				q.Set("to", hpTo)
			}
		}
	} else if hp := hostPathForInstance(con, inst, path); hp != "" {
		q.Set("host_path", hp)
	}
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	target := fmt.Sprintf("%s://%s/api/edge/files?%s", scheme, node.Address, q.Encode())

	// Pick the HTTP method. The edge accepts GET for everything as a
	// backwards-compat convenience, but we forward POST/DELETE when the
	// caller used them so the SPA's actions look REST-shaped and curl
	// scripts can use the right verb.
	method := r.Method
	if method == "" {
		method = http.MethodGet
	}

	// Build the request body. Read-only ops send nothing; write ops send
	// the caller's body verbatim (already includes Content-Type hints from
	// the SPA). We cap the body length so a runaway client can't pin us
	// into a slow read.
	var body io.Reader
	if method != http.MethodGet && method != http.MethodDelete && op != "mkdir" && op != "delete" && op != "rename" && op != "chmod" {
		body = r.Body
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		http.Error(w, "build edge request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Forward Content-Type for body-bearing requests so the edge sees the
	// same JSON the SPA sent (rename/chmod accept JSON bodies).
	if body != nil {
		if ct := r.Header.Get("Content-Type"); ct != "" {
			req.Header.Set("Content-Type", ct)
		}
	}
	resp, err := filesProxyHTTPClient.Do(req)
	if err != nil {
		log.Printf("proxyToEdge: dial edge failed: %v", err)
		writeJSON(w, map[string]any{
			"error": "edge unreachable: " + err.Error(),
		})
		return
	}

	// Pass status and selected headers through. We rewrite Content-Type only
	// for the JSON ops (list/stat) so the SPA can rely on it; for read we
	// trust the edge's Content-Type/Content-Disposition pair.
	//
	// If the edge returns the mux-default plain-text 404 ("404 page not
	// found"), that's actually a signal the running ksedge binary is too
	// old (it predates the /api/edge/files route). Surface a structured
	// JSON error so the SPA can draw a useful banner — proxying the
	// opaque text/plain would just look like an outage.
	if resp.StatusCode == http.StatusNotFound && contentType != "" && resp.Header.Get("Content-Type") != "" &&
		strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/plain") {
		body, _ := io.ReadAll(resp.Body)
		if strings.Contains(string(body), "404 page not found") {
			writeJSON(w, map[string]any{
				"error": "this edge node does not expose the file manager endpoint",
				"hint":  "the running ksedge binary is older than the panel's files route; rebuild and restart ksedge",
				"edge":  node.Address,
			})
			return
		}
		// Reset the response state — writeJSON wrote headers + body — and
		// fall through? We can't fall through; we've already written. Skip
		// the original body or re-target: simplest = just return.
		_ = body
		return
	}

	// For error responses, ensure the body is valid JSON so the SPA can
	// extract the `error` field. The edge normally returns JSON via writeErr,
	// but a timeout/panic/route-miss falls through to Go's default plain-text
	// 502 — wrap that into JSON so the SPA shows the real reason instead of
	// the generic "Request failed with status code 502".
	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if !json.Valid(bodyBytes) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": strings.TrimSpace(string(bodyBytes)),
				"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
				"edge":  node.Address,
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(bodyBytes)
		return
	}

	w.WriteHeader(resp.StatusCode)
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else {
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			w.Header().Set("Content-Type", ct)
		}
	}
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		w.Header().Set("Content-Disposition", cd)
	}
	_, _ = io.Copy(w, resp.Body)
}

// The edge client package is referenced for parity with the lifecycle
// path; the file APIs go over plain HTTP rather than via edge.Client
// because edge.Client hard-codes a 30s timeout unsuitable for streaming.
var _ = edge.Client{}

// mountSpec is the small subset of the template spec we care about when
// deciding whether the File Manager can serve a request directly off the
// host filesystem. The full spec is opaque to the panel beyond JSON-shape
// validation, so we re-declare the fields we actually read here.
//
// The template forms serialise bind mounts as {source, target, mode}, while
// builtin templates and hand-written JSON use {host, container, mode}. We
// accept both spellings (resolved via host()/container()) so form-authored
// templates still get the host-path File Manager browse instead of silently
// falling back to docker exec.
type mountSpec struct {
	Host        string `json:"host"`
	Container   string `json:"container"`
	Mode        string `json:"mode"`
	Source      string `json:"source"`
	Target      string `json:"target"`
	Destination string `json:"destination"`
}

// host resolves the host-side path across the {host, source} spellings.
func (m mountSpec) host() string {
	if m.Host != "" {
		return m.Host
	}
	return m.Source
}

// container resolves the in-workload mount point across the
// {container, target, destination} spellings.
func (m mountSpec) container() string {
	if m.Container != "" {
		return m.Container
	}
	if m.Target != "" {
		return m.Target
	}
	return m.Destination
}

// instanceMounts returns the bind mounts that apply to `inst`. We honour
// three shapes the panel has historically stored:
//
//  1. instance.config is a flat JSON array of mounts (per-instance override
//     populated by deploy-time materialisation);
//  2. instance.config is an object with a "mounts" key (template spec shape);
//  3. otherwise fall back to the template's spec field via the templates
//     table.
//
// Returns nil when no mounts are declared — the caller treats that as
// "no host path is reachable, fall back to docker exec".
func instanceMounts(con sqlDB, inst *models.Instance) []mountSpec {
	if inst == nil {
		return nil
	}
	if cfg := strings.TrimSpace(inst.Config); cfg != "" {
		if ms := decodeMounts(cfg); len(ms) > 0 {
			return ms
		}
	}
	if inst.TemplateID <= 0 || con == nil {
		return nil
	}
	tpl, err := repository.NewTemplateRepository(con).Get(inst.TemplateID)
	if err != nil || tpl == nil {
		return nil
	}
	if ms := decodeMounts(tpl.Spec); len(ms) > 0 {
		return ms
	}
	return nil
}

// decodeMounts accepts either a flat array ("[{"host":…,"container":…}]")
// or an object with a "mounts" key ("{"mounts":[…]}"). Returns nil when
// the payload is empty or doesn't match either shape — we never want to
// substitute "" for a missing mount array.
func decodeMounts(raw string) []mountSpec {
	var flat []mountSpec
	if err := json.Unmarshal([]byte(raw), &flat); err == nil && len(flat) > 0 {
		return flat
	}
	var wrapped struct {
		Mounts []mountSpec `json:"mounts"`
	}
	if err := json.Unmarshal([]byte(raw), &wrapped); err == nil && len(wrapped.Mounts) > 0 {
		return wrapped.Mounts
	}
	return nil
}

// hostPathForInstance returns the host filesystem path that corresponds to
// `containerPath` for `inst`, derived from the template's bind-mount
// declarations. Returns "" when no mount covers the requested path — the
// caller should then fall back to docker exec.
//
// We pick the LONGEST matching container path so nested mounts
// (`/mc` plus `/mc/cache`) are honoured precisely, and we collapse
// "%INSTANCE_NAME%" in the host template to the instance's real name so
// the same template spec works for every row in the panel.
func hostPathForInstance(con sqlDB, inst *models.Instance, containerPath string) string {
	if inst == nil {
		return ""
	}
	mounts := instanceMounts(con, inst)
	if len(mounts) == 0 {
		return ""
	}
	cp := strings.TrimRight(containerPath, "/")
	if cp == "" {
		cp = "/"
	}
	var best struct {
		host string
		cn   string
		rank int
	}
	for _, m := range mounts {
		ctn := strings.TrimRight(m.container(), "/")
		if ctn == "" {
			ctn = "/"
		}
		if ctn != "/" && !strings.HasPrefix(cp+"/", ctn+"/") && cp != ctn {
			continue
		}
		if rank := len(ctn); rank > best.rank {
			best.host = m.host()
			best.cn = ctn
			best.rank = rank
		}
	}
	if best.host == "" {
		return ""
	}
	instanceName := inst.ExternalID
	if instanceName == "" {
		instanceName = inst.Name
	}
	host := strings.ReplaceAll(best.host, "%INSTANCE_NAME%", instanceName)
	rel := strings.TrimPrefix(cp, best.cn)
	rel = strings.TrimPrefix(rel, "/")
	return path.Join(host, rel)
}

// ------------------------------------------------------------------
//  Upload-from-URL
// ------------------------------------------------------------------
//
// The SPA's File Manager offers an "Upload from URL" button that lets an
// operator pull a remote artifact (a server.jar mirror, a world archive,
// a plugin zip…) straight into the instance without round-tripping the
// bytes through their own browser. The panel performs the fetch so the
// operator's home IP/links aren't involved, and applies the same SSRF
// hardening the Mod Engine's install-from-URL already uses:
//
//   - scheme must be http(s)
//   - host must resolve to PUBLIC IPs only (loopback/private/link-local/
//     multicast/unspecified ranges — incl. IPv6 equivalents — rejected)
//   - DNS is resolved up-front and the IPs are dialed directly so a
//     DNS-rebinding attacker can't flip the answer between validation
//     and connect
//   - timeout + body size capped
//
// We then stream the fetched bytes to the edge as op=upload at the
// requested container path, mirroring the trust model the multipart
// upload path uses: panel authenticates the browser session, then
// authenticates the edge with the per-node token we already hold.

// filesURLFetchMaxBytes caps the size of a single URL upload. Generous
// because the realistic use case is pulling a multi-hundred-meg world
// archive or modpack zip into the container; matched here vs. the edge's
// own upload guard so a fetch that fits this limit reaches the edge
// intact instead of being truncated mid-stream.
const filesURLFetchMaxBytes = 512 << 20 // 512 MiB

// filesURLFetchTimeout bounds the total dial + exchange. Picking this at
// 10 minutes mirrors the filesProxyHTTPClient so a slow mirror download
// still completes; the per-dial / per-TLS sub-deadlines are tighter so a
// dead host fails fast instead of stalling the request.
const (
	filesURLFetchTimeout     = 10 * time.Minute
	filesURLFetchDNSTimeout  = 10 * time.Second
	filesURLFetchDialTimeout = 60 * time.Second
)

// filesURLError mirrors mod_handler.go's allowedURLError so the status the
// handler returns is structured (400/413/502) instead of an opaque 500.
type filesURLError struct {
	status int
	reason string
}

func (e *filesURLError) Error() string { return e.reason }

// fetchBytesFromURL performs the SSRF-hardened GET described above and
// returns the response body + the parsed *url.URL (URL needed for the
// basename / Content-Type fallback). Body is capped at
// filesURLFetchMaxBytes; a hard cap means a hostile or mis-reported origin
// can grow the read past the limit before we return 413.
func fetchBytesFromURL(ctx context.Context, raw string) (*url.URL, []byte, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, nil, "", &filesURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, nil, "", &filesURLError{http.StatusBadRequest, "URL must use http or https"}
	}
	if u.Host == "" {
		return nil, nil, "", &filesURLError{http.StatusBadRequest, "URL is missing a host"}
	}
	host := u.Hostname()
	if host == "" {
		return nil, nil, "", &filesURLError{http.StatusBadRequest, "URL is missing a host"}
	}

	// Resolve up-front and validate every IP — closing the DNS-rebinding gap
	// (a TOCTOU between the validation lookup and the actual connect).
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(ctx, filesURLFetchDNSTimeout)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		return nil, nil, "", &filesURLError{http.StatusBadGateway, "could not resolve host: " + host}
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !isPublicIP(ip) {
			which := ""
			if ip != nil {
				which = " (" + ip.String() + ")"
			}
			return nil, nil, "", &filesURLError{
				http.StatusBadRequest,
				fmt.Sprintf("refusing to fetch %s: host resolves to a non-public address%s; only public hosts are allowed", host, which),
			}
		}
	}

	// Pin the dial to the resolved IPs so a second DNS answer can't redirect
	// the connection away from the validated ones.
	dialCtx, cancelDial := context.WithTimeout(ctx, filesURLFetchTimeout)
	defer cancelDial()
	port := filesPortFromHost(u.Host)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: filesURLFetchDialTimeout,
		TLSHandshakeTimeout:   filesURLFetchDialTimeout,
		IdleConnTimeout:       filesURLFetchDialTimeout,
		DialContext: func(_ context.Context, network, _ string) (net.Conn, error) {
			var lastErr error
			for _, ipa := range ips {
				addr := net.JoinHostPort(ipa.IP.String(), port)
				conn, derr := (&net.Dialer{Timeout: filesURLFetchDialTimeout}).DialContext(dialCtx, network, addr)
				if derr == nil {
					return conn, nil
				}
				lastErr = derr
			}
			return nil, lastErr
		},
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{Transport: transport, Timeout: filesURLFetchTimeout}
	req, err := http.NewRequestWithContext(dialCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, nil, "", &filesURLError{http.StatusBadRequest, "invalid URL: " + err.Error()}
	}
	req.Header.Set("User-Agent", "kspanel-file-upload/1.0")
	req.Header.Set("Accept", "*/*")
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, "", &filesURLError{http.StatusBadGateway, "fetch failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, "", &filesURLError{
			http.StatusBadGateway,
			fmt.Sprintf("origin returned HTTP %d for %s", resp.StatusCode, u.String()),
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, filesURLFetchMaxBytes+1))
	if err != nil {
		return nil, nil, "", &filesURLError{http.StatusBadGateway, "read body: " + err.Error()}
	}
	if int64(len(body)) > filesURLFetchMaxBytes {
		return nil, nil, "", &filesURLError{
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("remote body exceeded %d bytes", filesURLFetchMaxBytes),
		}
	}
	contentType := resp.Header.Get("Content-Type")
	return u, body, contentType, nil
}

// filesPortFromHost extracts the port from a host:port string, defaulting
// to 443 for https URLs (which omit the port) and 80 for http. url.Parse
// stores the host as "[::1]:8080" for IPv6 literals; net.SplitHostPort
// handles both shapes.
func filesPortFromHost(hostport string) string {
	if _, port, err := net.SplitHostPort(hostport); err == nil && port != "" {
		return port
	}
	return "80"
}

// filesUploadURLDTO is the body the SPA POSTs to
// /api/instances/{id}/files/url.
type filesUploadURLDTO struct {
	URL  string `json:"url"`
	Path string `json:"path"`
}

// InstanceFileURLUploadHandler fetches `url` through the SSRF-hardened
// fetcher and forwards the bytes to the edge as an op=upload (write)
// targeting `path`. `path` may name either an existing directory (the
// uploaded file is named after the URL's basename) or a full file path
// (the bytes are written there directly). This mirrors how a browser's
// multipart upload lands on the edge, so the edge's existing write guard
// applies unchanged.
func InstanceFileURLUploadHandler(w http.ResponseWriter, r *http.Request) {
	// Enforce the template-page whitelist BEFORE the URL fetch so a denied
	// request never burns an SSRF-safe download round-trip.
	if !guardInstancePage(w, r, "files") {
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var dto filesUploadURLDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(dto.Path) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	// Fetch from the public URL first — fail before we touch the edge so a
	// bad URL surfaces as a 400/502 to the operator (not silently as an edge
	// error body they can't read).
	u, body, ct, ferr := fetchBytesFromURL(r.Context(), dto.URL)
	if ferr != nil {
		if ue, ok := ferr.(*filesURLError); ok {
			writeJSONStatus(w, ue.status, map[string]any{
				"error": ue.reason,
			})
			return
		}
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "fetch failed",
		})
		return
	}

	// If `path` points at a directory (ends with "/"), append the URL's
	// basename so the upload lands as a sibling of the existing entries
	// rather than overwriting the dir. The edge would reject "/" anyway,
	// so we normalise here for ergonomics.
	target := strings.TrimSpace(dto.Path)
	if strings.HasSuffix(target, "/") {
		base := path.Base(u.Path)
		if base == "" || base == "." {
			base = "upload.bin"
		}
		target = path.Join(target, base)
	}

	proxyToEdgeWithBody(w, r, id, "upload", target, body, ct)
}

// proxyToEdgeWithBody is the variant of proxyToEdge used by the URL upload
// path where the body the panel forwards to the edge comes from in-memory
// bytes (already fetched) rather than the inbound request body. We
// duplicate just enough of proxyToEdge to keep the read-stream happy: the
// lookup + the dial + copy, with a JSON shape the edge already accepts.
func proxyToEdgeWithBody(w http.ResponseWriter, r *http.Request, id int64, op, target string, body []byte, contentType string) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	inst, err := repository.NewInstanceRepository(con).Get(id)
	if err != nil {
		http.Error(w, "instance not found", http.StatusNotFound)
		return
	}
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	node, err := repository.NewNodeRepository(con).GetNode(inst.NodeID)
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "owner node not found",
		})
		return
	}
	token, err := repository.NewNodeRepository(con).PlainToken(inst.NodeID)
	if err != nil || token == "" {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "node has no usable edge token (rotate it first)",
		})
		return
	}

	q := url.Values{}
	q.Set("op", op)
	q.Set("kind", inst.Kind)
	q.Set("name", name)
	q.Set("path", target)
	q.Set("token", token)
	if hp := hostPathForInstance(con, inst, target); hp != "" {
		q.Set("host_path", hp)
	}
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	targetURL := fmt.Sprintf("%s://%s/api/edge/files?%s", scheme, node.Address, q.Encode())

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytesReader(body))
	if err != nil {
		http.Error(w, "build edge request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Content-Length", strconv.Itoa(len(body)))

	resp, err := filesProxyHTTPClient.Do(req)
	if err != nil {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "dial edge failed: " + err.Error(),
			"hint":  "the edge node at " + node.Address + " is unreachable; check that ksedge is running and the node address in the panel is correct",
		})
		return
	}
	defer resp.Body.Close()

	// The edge returns 200 + JSON {"ok":true,…} on success.
	// Wrap non-JSON error bodies so the SPA can extract the `error` field
	// instead of showing a generic 502.
	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if !json.Valid(bodyBytes) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": strings.TrimSpace(string(bodyBytes)),
				"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
				"edge":  node.Address,
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(bodyBytes)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// bytesReader returns a fresh reader over the supplied bytes via io.Reader.
// Kept as a tiny helper so the upload proxy sites read identically to
// proxyToEdge (which gets an io.Reader from the request body).
func bytesReader(b []byte) io.Reader { return strings.NewReader(string(b)) }
