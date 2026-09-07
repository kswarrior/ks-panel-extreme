// NodeFilesHandler proxies the NodeDetail → Files tab to the owning
// edge's /api/edge/hostfiles endpoint — a browser jailed to the daemon's
// instance-files directory (instances_dir), which is the filesystem root
// the SPA sees. Operators can inspect per-instance data without ever
// addressing anything else on the edge host.
//
// Routes exposed (see server.go):
//
//	GET  /api/nodes/{id}/files?op=list&path=/
//	    → forwards to edge ?op=list, returns {"entries":[…],"path":…,"root":…}
//	GET  /api/nodes/{id}/files?op=stat&path=/mc-1
//	    → forwards to edge ?op=stat, returns one entry object.
//	GET  /api/nodes/{id}/files?op=read&path=/mc-1/server.jar
//	    → forwards to edge ?op=read, streams raw bytes back with
//	      Content-Disposition so downloads land with the right filename.
//	POST /api/nodes/{id}/files?op=mkdir&path=/mc-1/newdir
//	POST /api/nodes/{id}/files?op=write|upload&path=/mc-1/notes.txt (body = bytes)
//	    → mutate-state proxy (the SPA uses POST for all mutations).
//	POST /api/nodes/{id}/files?op=rename&path=/mc-1/old.txt&to=/mc-1/new.txt
//	POST /api/nodes/{id}/files?op=delete&path=/mc-1/old.txt
//	POST /api/nodes/{id}/files/url   (JSON {path,url})
//	    → SSRF-safe fetch of `url`, then proxies the bytes to the edge
//	      as op=upload at `path`. Same trust model as InstallModFromURL.
//	POST /api/nodes/{id}/files/clone  (JSON {path,url})
//	    → asks the edge to `git clone --depth 1 <url>` into `path`.
//
// Reads are view-level (like probe/heartbeats/update-info); every mutating
// verb is edit-level (like setup-local/rotate-token).
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/tunnel"
)

// supportedNodeFileOps is the op set the edge hostfiles endpoint
// implements. Anything else is a typo — 400 instead of a silent no-op.
var supportedNodeFileOps = map[string]bool{
	"list": true, "stat": true, "read": true,
	"mkdir": true, "write": true, "upload": true,
	"rename": true, "delete": true,
}

// nodeFilesBinaryOps ride outside the WSS tunnel (no binary payloads on
// the tunnel) and always go over direct HTTP on dual modes.
var nodeFilesBinaryOps = map[string]bool{
	"read": true, "write": true, "upload": true,
}

// NodeFilesHandler proxies ?op=… queries to the edge hostfiles endpoint.
// Bound at GET (reads) and POST (mutations) /api/nodes/{id}/files.
func NodeFilesHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return
	}
	qs := r.URL.Query()
	op := qs.Get("op")
	if op == "" {
		op = "list"
	}
	if !supportedNodeFileOps[op] {
		http.Error(w, "unsupported op "+op, http.StatusBadRequest)
		return
	}
	// Reads use GET, mutations require POST — a prefetch/crawler GET can
	// never mutate the instances directory.
	wantPost := op == "mkdir" || op == "write" || op == "upload" || op == "rename" || op == "delete"
	if wantPost && r.Method != http.MethodPost {
		http.Error(w, "method not allowed (use POST for "+op+")", http.StatusMethodNotAllowed)
		return
	}
	if !wantPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed (use GET for "+op+")", http.StatusMethodNotAllowed)
		return
	}
	// Content-Type must reflect the OP: everything except read answers
	// structured JSON; read streams raw bytes with the edge's own
	// Content-Type/Content-Disposition pair.
	ct := "application/json"
	if op == "read" {
		ct = ""
	}
	// Mutating uploads stream the caller's body verbatim (already includes
	// Content-Type hints from the SPA).
	var body io.Reader
	var bodyCT string
	if (op == "write" || op == "upload") && r.Body != nil {
		body = r.Body
		bodyCT = r.Header.Get("Content-Type")
	}
	proxyNodeToEdgeHostFiles(w, r, nd, token, r.Method, op, qs.Get("path"), body, bodyCT, ct)
}

// proxyNodeToEdgeHostFiles dials the edge's /api/edge/hostfiles endpoint
// for one node. It mirrors the tunnel-aware dispatch in proxyToEdge
// (files_handler.go) — tunnel first for JSON ops on tunnel modes, direct
// HTTP otherwise — with the same binary-payload rule: read/write/upload
// never ride the tunnel.
func proxyNodeToEdgeHostFiles(w http.ResponseWriter, r *http.Request, node *models.Node, token, method, op, path string, body io.Reader, bodyCT, contentType string) {
	q := url.Values{}
	q.Set("op", op)
	q.Set("path", path)
	q.Set("token", token)
	// Forward the rename destination verbatim; the edge resolves it
	// through the identical jail, so a `to` outside the root is refused
	// there (defence in depth next to the SPA sending root-relative paths).
	if to := r.URL.Query().Get("to"); to != "" {
		q.Set("to", to)
	}
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	target := scheme + "://" + node.Address + "/api/edge/hostfiles?" + q.Encode()

	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	isTunnelMode := mode == "reverse_tunnel" || mode == "local_wss" || mode == "both" || mode == "local_both"
	connected := tunnel.Global().IsConnected(node.ID)
	filesRoute := edge.DecideRoute(mode, edge.TaskFiles, edge.LoadChannels(node.ID), connected)
	useTunnelFirst := false
	switch mode {
	case "reverse_tunnel":
		useTunnelFirst = true
	case "local_wss":
		useTunnelFirst = connected
	case "both", "local_both":
		useTunnelFirst = filesRoute.PreferTunnel && connected
		// Binary payloads cannot ride the tunnel — dual modes always have
		// a dialable address, so they go over HTTP (port).
		if nodeFilesBinaryOps[op] {
			useTunnelFirst = false
		}
	}
	// local_wss binary ops skip the tunnel and fall through to direct HTTP
	// below: the edge listens on 127.0.0.1:<port> on the same host.
	// reverse_tunnel has no dialable address and correctly stays on the
	// 501 path.
	isLocalWSSBinary := mode == "local_wss" && nodeFilesBinaryOps[op]
	if isTunnelMode && connected && useTunnelFirst && !isLocalWSSBinary {
		tunnelPath := "/api/edge/hostfiles?" + q.Encode()
		if nodeFilesBinaryOps[op] {
			writeJSONStatus(w, http.StatusNotImplemented, map[string]any{
				"error": "file transfer via WSS tunnel not yet supported for binary files",
				"hint":  "use direct or local_port mode for binary transfers, or rely on JSON ops (list/stat) via tunnel",
				"edge":  node.Address,
			})
			return
		}
		// The only tunnel-eligible op with a body is clone (small JSON).
		// Buffer it (64 KiB is plenty for {path,url}) so the tunnel Send
		// gets a replayable payload; binary bodies never reach this branch.
		var tunnelBody any
		if body != nil {
			const tunnelJSONLimit = 64 << 10
			b, _ := io.ReadAll(io.LimitReader(body, tunnelJSONLimit+1))
			if int64(len(b)) > tunnelJSONLimit {
				writeJSONStatus(w, http.StatusRequestEntityTooLarge, map[string]any{
					"error": "request body too large for WSS tunnel",
					"edge":  node.Address,
				})
				return
			}
			if len(b) > 0 {
				tunnelBody = json.RawMessage(b)
			}
		}
		status, respBody, err := tunnel.Global().Send(node.ID, method, tunnelPath, tunnelBody, 5*time.Minute)
		if err != nil {
			if (mode == "both" || mode == "local_both") && filesRoute.Fallback {
				if body != nil {
					// The body was already consumed above — only nil-body
					// ops are safely replayable over HTTP below.
					writeJSONStatus(w, http.StatusBadGateway, map[string]any{
						"error": "tunnel send failed and the request body cannot be replayed",
						"edge":  node.Address,
					})
					return
				}
				goto httpFallback
			}
			safeErr := strings.ReplaceAll(err.Error(), token, "[redacted]")
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "tunnel send failed: " + safeErr,
				"edge":  node.Address,
			})
			return
		}
		if status == http.StatusNotFound && contentType != "" {
			if strings.Contains(string(respBody), "404 page not found") {
				writeJSONStatus(w, http.StatusBadGateway, map[string]any{
					"error": "this edge node does not expose the host files endpoint",
					"hint":  "the running ksedge binary is older than the panel's host files route; rebuild and restart ksedge",
					"edge":  node.Address,
				})
				return
			}
		}
		if status >= 400 {
			if !json.Valid(respBody) {
				writeJSONStatus(w, status, map[string]any{
					"error": strings.TrimSpace(string(respBody)),
					"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
					"edge":  node.Address,
				})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = w.Write(respBody)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(status)
		_, _ = w.Write(respBody)
		return
	}
httpFallback:
	if mode == "reverse_tunnel" && !connected {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)",
			"hint":  "ensure ksedge is running with panel_url and token, and that it can reach the panel via WSS",
			"edge":  node.Address,
		})
		return
	}
	if (mode == "both" || mode == "local_both") && !connected && filesRoute.Strict && filesRoute.Transport == edge.TransportWSS {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge not connected via WSS tunnel (files task prefers WSS with fallback disabled)",
			"hint":  "start ksedge so the tunnel connects, or enable emergency fallback on the files channel",
			"edge":  node.Address,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		http.Error(w, "build edge request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Forward Content-Type for body-bearing requests so the edge sees the
	// same JSON the SPA sent (clone accepts a JSON body).
	if body != nil && bodyCT != "" {
		req.Header.Set("Content-Type", bodyCT)
	}
	resp, err := httpClientForNode(node).Do(req)
	if err != nil {
		// Dual-mode emergency: a port-preferred files task whose HTTP dial
		// failed retries idempotent (nil-body) JSON ops over the tunnel
		// when fallback is on and the tunnel is up. Body-bearing and
		// binary transfers skip the retry (no safe replay).
		if (mode == "both" || mode == "local_both") && filesRoute.Fallback && body == nil &&
			tunnel.Global().IsConnected(node.ID) && !nodeFilesBinaryOps[op] {
			tunnelPath := "/api/edge/hostfiles?" + q.Encode()
			if status, respBody, terr := tunnel.Global().Send(node.ID, method, tunnelPath, nil, 5*time.Minute); terr == nil {
				if status < 400 {
					w.Header().Set("Content-Type", contentType)
					w.WriteHeader(status)
					_, _ = w.Write(respBody)
					return
				}
			}
		}
		safeErr := strings.ReplaceAll(err.Error(), token, "[redacted]")
		log.Printf("proxyNodeToEdgeHostFiles: dial edge failed: %v", safeErr)
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge unreachable: " + safeErr,
		})
		return
	}
	defer resp.Body.Close()

	// A mux-default plain-text 404 means the running ksedge predates the
	// /api/edge/hostfiles route — surface a structured hint instead.
	if resp.StatusCode == http.StatusNotFound && contentType != "" && resp.Header.Get("Content-Type") != "" &&
		strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/plain") {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if strings.Contains(string(bodyBytes), "404 page not found") {
			writeJSONStatus(w, http.StatusBadGateway, map[string]any{
				"error": "this edge node does not expose the host files endpoint",
				"hint":  "the running ksedge binary is older than the panel's host files route; rebuild and restart ksedge",
				"edge":  node.Address,
			})
			return
		}
		writeJSONStatus(w, resp.StatusCode, map[string]any{
			"error": strings.TrimSpace(string(bodyBytes)),
			"hint":  "the edge returned a non-JSON error response; check that ksedge is up to date and running",
			"edge":  node.Address,
		})
		return
	}

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		if !json.Valid(bodyBytes) {
			writeJSONStatus(w, resp.StatusCode, map[string]any{
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

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		w.Header().Set("Content-Disposition", cd)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// nodeFilesPathDTO is the body the SPA POSTs to
// /api/nodes/{id}/files/url and /api/nodes/{id}/files/clone.
type nodeFilesPathDTO struct {
	URL  string `json:"url"`
	Path string `json:"path"`
}

// loadNodeFilesTarget resolves the node + edge token for the mutation
// endpoints below. It mirrors NodeFilesHandler's preamble so the three
// verbs can't diverge on auth.
func loadNodeFilesTarget(w http.ResponseWriter, r *http.Request, id int64) (*models.Node, string, bool) {
	nd, token, err := loadNodeForUpdate(id)
	if err != nil || nd == nil {
		http.Error(w, "node not found", http.StatusNotFound)
		return nil, "", false
	}
	if nodeOwnForbidden(w, r, nd.OwnerID) {
		return nil, "", false
	}
	if token == "" {
		http.Error(w, "node has no usable edge token (rotate it first)", http.StatusBadRequest)
		return nil, "", false
	}
	return nd, token, true
}

// decodeNodeFilesDTO parses the small JSON body of the url/clone
// endpoints. Bodies are capped at 64 KiB — both DTOs are two short
// strings, anything larger is unambiguously abusive.
func decodeNodeFilesDTO(w http.ResponseWriter, r *http.Request) (nodeFilesPathDTO, bool) {
	var dto nodeFilesPathDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return dto, false
	}
	if strings.TrimSpace(dto.URL) == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return dto, false
	}
	if strings.TrimSpace(dto.Path) == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return dto, false
	}
	return dto, true
}

// NodeFilesURLUploadHandler fetches `url` through the SSRF-hardened
// fetcher (same one the instance File Manager uses) and forwards the
// bytes to the edge as an op=upload (write) targeting `path`. `path` may
// name either a directory (trailing "/": the file is named after the
// URL's basename) or a full file path (bytes land there directly).
func NodeFilesURLUploadHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, ok := loadNodeFilesTarget(w, r, id)
	if !ok {
		return
	}
	dto, ok := decodeNodeFilesDTO(w, r)
	if !ok {
		return
	}

	// Fetch from the public URL first — fail before we touch the edge so a
	// bad URL surfaces as a 400/502 to the operator, not an edge error.
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
	// rather than failing against the dir.
	target := strings.TrimSpace(dto.Path)
	if strings.HasSuffix(target, "/") {
		base := path.Base(u.Path)
		if base == "" || base == "." || base == "/" {
			base = "upload.bin"
		}
		target = path.Join(target, base)
	}

	proxyNodeFilesBytes(w, r, nd, token, "upload", target, body, ct)
}

// NodeFilesCloneHandler asks the edge to `git clone --depth 1 <url>` into
// `path` (a directory inside the instances root; the repo lands in a
// sanitised subdirectory named after the URL). The URL's host is
// SSRF-validated here with the same public-IP rule as the URL upload;
// the edge re-checks the scheme, sanitises the destination name, refuses
// overwrites and runs git with no shell, no prompts and a hard timeout.
func NodeFilesCloneHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNodeID(w, r)
	if !ok {
		return
	}
	nd, token, ok := loadNodeFilesTarget(w, r, id)
	if !ok {
		return
	}
	dto, ok := decodeNodeFilesDTO(w, r)
	if !ok {
		return
	}
	if _, _, ferr := validatePublicHTTPURL(r.Context(), dto.URL); ferr != nil {
		writeJSONStatus(w, ferr.status, map[string]any{
			"error": ferr.reason,
		})
		return
	}

	payload, err := json.Marshal(map[string]string{
		"path": strings.TrimSpace(dto.Path),
		"url":  strings.TrimSpace(dto.URL),
	})
	if err != nil {
		http.Error(w, "encode request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	proxyNodeToEdgeHostFiles(w, r, nd, token, http.MethodPost, "clone", strings.TrimSpace(dto.Path),
		bytes.NewReader(payload), "application/json", "application/json")
}

// proxyNodeFilesBytes forwards in-memory bytes (already fetched by the
// URL-upload path) to the edge as op=upload at target. Uploads always go
// over direct HTTP: reverse_tunnel has no dialable address, and the WSS
// tunnel cannot carry binary payloads.
func proxyNodeFilesBytes(w http.ResponseWriter, r *http.Request, node *models.Node, token, op, target string, body []byte, contentType string) {
	mode := strings.ToLower(strings.TrimSpace(node.ConnectionMode))
	connected := tunnel.Global().IsConnected(node.ID)
	if mode == "reverse_tunnel" && connected {
		writeJSONStatus(w, http.StatusNotImplemented, map[string]any{
			"error": "file upload via WSS tunnel not yet supported for binary payloads",
			"hint":  "use direct or local_port mode for URL uploads",
			"edge":  node.Address,
		})
		return
	}
	if mode == "reverse_tunnel" && !connected {
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)",
			"hint":  "ensure ksedge is running with panel_url and token, and that it can reach the panel via WSS",
			"edge":  node.Address,
		})
		return
	}

	q := url.Values{}
	q.Set("op", op)
	q.Set("path", target)
	q.Set("token", token)
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	targetURL := scheme + "://" + node.Address + "/api/edge/hostfiles?" + q.Encode()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "build edge request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Content-Length", strconv.Itoa(len(body)))

	resp, err := httpClientForNode(node).Do(req)
	if err != nil {
		safeErr := strings.ReplaceAll(err.Error(), token, "[redacted]")
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{
			"error": "dial edge failed: " + safeErr,
			"hint":  "the edge node at " + node.Address + " is unreachable; check that ksedge is running and the node address in the panel is correct",
		})
		return
	}
	defer resp.Body.Close()

	// The edge returns 200 + JSON {"ok":true,…} on success. Wrap non-JSON
	// error bodies so the SPA can extract the `error` field.
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
