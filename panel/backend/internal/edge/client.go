// Package edge is the panel's outbound RPC client to a ksedge daemon.
//
// The panel never executes docker/lxd/kvm/multipass itself — it always asks
// the owning edge node to do it. Keeping execution on the edge keeps the
// panel stateless, lets a single panel drive many heterogeneous hosts, and
// mirrors the same trust boundary the heartbeat ingest already uses: the
// edge presents its token, the panel verifies the hash.
//
// For lifecycle RPCs the direction is reversed (panel→edge), so the edge
// authenticates the panel by the very same shared token. The first edge RPC
// shipped today is "lifecycle" (deploy/start/stop/destroy); the call shape
// is intentionally generic so future RPCs (migrate, exec, snapshot…) reuse
// the same dialer.
package edge

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/tunnel"
)

// tokenQueryParamRe matches a token=… query parameter inside an error's
// message text. InstallStatus is the one RPC that carries the shared edge
// secret in the URL query, so when the dial fails the wrapped *url.Error
// would otherwise embed the raw token in the message the sweep loop logs.
var tokenQueryParamRe = regexp.MustCompile(`token=[^&\s"']+`)

// redactTokenErr returns err's message with any token=… query value masked,
// so dial failures on token-in-URL RPCs never leak the shared edge secret
// into panel logs.
func redactTokenErr(err error) string {
	if err == nil {
		return ""
	}
	return tokenQueryParamRe.ReplaceAllString(err.Error(), "token=REDACTED")
}

// Client dials a single edge node. The scheme (http vs https) is decided by
// the node's UseTLS flag so the panel transparently talks to edges that put
// it behind a TLS-terminating proxy.
type Client struct {
	baseURL        string
	token          string
	http           *http.Client
	nodeID         int64
	connectionMode string
}

// tlsServerName strips the port from an address for SNI. "edge.example.com:4040"
// -> "edge.example.com", "[::1]:4040" -> "::1", "ftdeycef.com" -> "ftdeycef.com".
func tlsServerName(address string) string {
	if h, _, err := net.SplitHostPort(address); err == nil {
		return h
	}
	// No port (bare host) or already host-only.
	return strings.Trim(address, "[]")
}

// BaseURL returns the base URL for the edge node.
func (c *Client) BaseURL() string {
	return c.baseURL
}

// newClientForNode is the shared constructor for New/NewWithTimeout so TLS +
// address handling stays DRY and a future scheme change can't diverge.
func newClientForNode(node models.Node, token string, timeout time.Duration) *Client {
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	address := node.Address
	if address == "" {
		address = "127.0.0.1:4040"
	}
	// NOTE: address=="tunnel" (reverse_tunnel placeholder) is intentionally
	// NOT rewritten to loopback. Strict-tunnel RPCs never reach HTTP (they
	// fail closed in tryTunnel), so baseURL is unused there; keeping the
	// sentinel ensures any accidental HTTP dial fails fast on DNS instead
	// of hitting an innocent loopback service.
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			ServerName:         tlsServerName(address),
			InsecureSkipVerify: node.SkipTLSVerify,
		},
		// Bound every phase so a hung edge cannot park a sweep goroutine
		// past the client's total Timeout, and reuse idle keep-alives
		// across the 2s/10s poll loops instead of re-dialing + re-TLS on
		// every tick (FD/handshake churn under fleet load).
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
		MaxIdleConns:          20,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       90 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &Client{
		baseURL:        fmt.Sprintf("%s://%s", scheme, address),
		token:          token,
		http:           &http.Client{Timeout: timeout, Transport: transport},
		nodeID:         node.ID,
		connectionMode: strings.ToLower(strings.TrimSpace(node.ConnectionMode)),
	}
}

// New builds a Client for a registered node. The token is the same shared
// secret the edge presented during heartbeat ingest — we reuse it on the
// outbound direction so the edge can authenticate the caller without a
// second credential store.
func New(node models.Node, token string) *Client {
	return newClientForNode(node, token, 30*time.Second)
}

// NewWithTimeout mirrors New but lets the caller pick the HTTP client timeout.
// Used by the deploy path: a deploy that hasn't returned a provisional answer
// inside ~15s is almost certainly stuck on a slow edge driver (cold image pull,
// apt+wget bootstrap of the Minecraft template's first-boot command, …) and a
// panel run behind a CDN/Cloudflare tunnel would otherwise lets the upstream
// proxy's own ~30s origin-response window fire first — surfacing Cloudflare's
// raw HTML "origin returned an invalid or incomplete response" page instead
// of the structured {error,detail,node,kind,name} JSON the SPA renders as a
// banner. By bounding the deploy RPC strictly under the proxy window we
// guarantee the panel returns its JSON 502 in time and the user sees the
// deploy failure banner, not a Cloudflare error page.
func NewWithTimeout(node models.Node, token string, timeout time.Duration) *Client {
	return newClientForNode(node, token, timeout)
}

// isTunnel reports whether this client may use the WSS tunnel at all
// (pure tunnel modes + the dual-transport both/local_both modes).
func (c *Client) isTunnel() bool {
	return UsesTunnel(c.connectionMode)
}

// tryTunnel attempts to send an RPC over the WSS tunnel. It returns (handled, resp, err).
// handled==true means the tunnel was used (caller should use resp).
// handled==false means tunnel not available / not applicable — caller should fall back to HTTP.
// For reverse_tunnel with no tunnel connected, it returns error directly (handled==true, err).
//
// Task-aware routing (migration 062): the task is inferred from path
// (TaskForPath) and the node's WSS channels decide the preferred transport
// for both/local_both modes. Pure modes keep their existing behaviour:
// reverse_tunnel is strict, local_wss prefers the tunnel with HTTP fallback,
// direct/local_port never use the tunnel.
func (c *Client) tryTunnel(method, path string, reqBody any) (bool, []byte, int, error) {
	if !c.isTunnel() {
		return false, nil, 0, nil
	}
	connected := tunnel.Global().IsConnected(c.nodeID)
	mode := NormalizeMode(c.connectionMode)
	if !IsDualMode(mode) {
		if !connected {
			if IsStrictTunnel(mode) {
				return true, nil, 0, fmt.Errorf("edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)")
			}
			// local_wss fallback to direct HTTP when tunnel not yet connected
			return false, nil, 0, nil
		}
		// Tunnel is connected – dispatch via it.
		timeout := c.http.Timeout
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		status, body, err := tunnel.Global().Send(c.nodeID, method, path, reqBody, timeout)
		return true, body, status, err
	}
	// Dual-transport mode: consult the WSS channels for this task.
	task := TaskForPath(path)
	route := DecideRoute(mode, task, LoadChannels(c.nodeID), connected)
	if !route.PreferTunnel {
		// Strict WSS with tunnel down must not fall back to HTTP when the
		// operator disabled emergency fallback (Strict). Fail closed here
		// so the caller surfaces the tunnel error instead of dialing the
		// port the channel explicitly forbade.
		if !connected && route.Strict && route.Transport == TransportWSS {
			return true, nil, 0, fmt.Errorf("edge not connected via WSS tunnel (%s mode task %q prefers WSS for channel %q with fallback disabled)", mode, task, route.ChannelName)
		}
		// Port preferred (or tunnel down with auto): dial HTTP first. The
		// emergency tunnel retry after an HTTP dial failure happens in
		// emergencyViaTunnel, called by each method's HTTP error branch.
		// Strict port (fallback disabled) is HTTP-only from here.
		return false, nil, 0, nil
	}
	if !connected {
		if route.Fallback {
			// Emergency fallback to direct HTTP on disconnect.
			return false, nil, 0, nil
		}
		return true, nil, 0, fmt.Errorf("edge not connected via WSS tunnel (both mode task %q prefers WSS for channel %q)", task, route.ChannelName)
	}
	timeout := c.http.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	status, body, err := tunnel.Global().Send(c.nodeID, method, path, reqBody, timeout)
	if err != nil && route.Fallback {
		// Tunnel overloaded/failed mid-flight: emergency fallback to HTTP.
		return false, nil, 0, nil
	}
	return true, body, status, err
}

// emergencyViaTunnel retries an RPC over the WSS tunnel after the direct HTTP
// dial failed. It only fires for dual-transport modes (both/local_both) when
// the resolved route prefers HTTP (port) with fallback enabled and the tunnel
// is currently connected — the emergency path for overload or disconnect on
// the port side. Returns attempted==false when the emergency path does not
// apply (caller returns its HTTP error as usual).
func (c *Client) emergencyViaTunnel(method, path string, reqBody any) (body []byte, status int, err error, attempted bool) {
	mode := NormalizeMode(c.connectionMode)
	if !IsDualMode(mode) {
		return nil, 0, nil, false
	}
	if !tunnel.Global().IsConnected(c.nodeID) {
		return nil, 0, nil, false
	}
	task := TaskForPath(path)
	route := DecideRoute(mode, task, LoadChannels(c.nodeID), true)
	if route.PreferTunnel || !route.Fallback {
		return nil, 0, nil, false
	}
	timeout := c.http.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	status, body, err = tunnel.Global().Send(c.nodeID, method, path, reqBody, timeout)
	return body, status, err, true
}

// tryEmergencyTunnel runs the post-HTTP emergency retry over WSS and decodes
// the tunnel response into out (pointer to the method's response struct).
// It returns handled==false when the emergency path does not apply (the
// caller returns its HTTP dial error as usual). When handled==true the caller
// must return (out-typed zero or decoded value, err) — err is nil on success.
// The envelope check (status>=300, ok==false) mirrors each method's tunnel
// block so emergency results carry the same error shapes as normal results.
func (c *Client) tryEmergencyTunnel(method, path string, reqBody any, out any) (bool, error) {
	body, status, err, attempted := c.emergencyViaTunnel(method, path, reqBody)
	if !attempted {
		return false, nil
	}
	if err != nil {
		return true, err
	}
	if err := unmarshalTunnelResponse(body, status, out); err != nil {
		return true, err
	}
	if status >= 300 {
		var env struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &env)
		if env.Error != "" {
			return true, fmt.Errorf("edge rejected: %s", env.Error)
		}
		return true, fmt.Errorf("edge returned HTTP %d", status)
	}
	// ok==false check via envelope so every response shape is covered.
	var okEnv struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &okEnv)
	// Only enforce the ok gate for shapes that carry it (all edge RPCs do,
	// but a missing ok field decodes false — so only fail when the body
	// actually mentioned ok or error).
	var raw map[string]any
	hasOK := false
	if err := json.Unmarshal(body, &raw); err == nil {
		_, hasOK = raw["ok"]
	}
	if hasOK && !okEnv.OK {
		if okEnv.Error != "" {
			return true, fmt.Errorf("%s", okEnv.Error)
		}
		return true, fmt.Errorf("edge reported failure without a message")
	}
	return true, nil
}

func unmarshalTunnelResponse(body []byte, status int, out any) error {
	if body == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("edge returned HTTP %d", status)
	}
	return nil
}

// LifecycleRequest is the wire format POSTed to the edge's
// /api/edge/lifecycle endpoint.
//
// The edge validates Token, then dispatches on Action+Kind to the matching
// driver. Name is the instance name the panel uses to identify the workload
// across start/stop/destroy calls; the edge may map it to its own naming
// (e.g. prefix with instance id) and returns the real driver ID in the
// response's ExternalID.
type LifecycleRequest struct {
	Token string `json:"token"`
	// "deploy" | "start" | "stop" | "destroy" | "inspect".
	Action string `json:"action"`
	// "docker" | "lxd" | "kvm" | "multipass".
	Kind string `json:"kind"`
	// Instance label (unique per panel).
	Name string `json:"name"`
	// Driver-specific configuration blob. For "deploy" this is the merged
	// template.spec + per-deploy overrides; for start/stop/destroy the edge
	// ignores it and uses Name+ExternalID instead.
	Config map[string]any `json:"config,omitempty"`
}

// LifecycleResponse is what the edge hands back. ExternalID is only filled
// for "deploy" (the freshly created container/VM name); the panel persists it
// so subsequent RPCs can target the exact workload.
type LifecycleResponse struct {
	OK         bool   `json:"ok"`
	ExternalID string `json:"external_id,omitempty"`
	Status     string `json:"status,omitempty"`
	Error      string `json:"error,omitempty"`
}

// InstallStartRequest is the body POST'd to /api/edge/install to kick off an
// install workflow on the edge. Steps is the spec.install[] array verbatim;
// EnvVars carries the resolved per-deploy KEY=VALUE map (with the operator's
// prompts, regex rules, append/prepend already applied) so the edge can
// substitute {{KEY}} placeholders in step strings.
//
// KeepStdin signals that the edge should keep the running step's stdin open
// for same-terminal stop mode (e.g. Minecraft "stop" command sent to console).
type InstallStartRequest struct {
	Token     string            `json:"token"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	Steps     []InstallStep     `json:"steps"`
	EnvVars   map[string]string `json:"env_vars,omitempty"`
	KeepStdin bool              `json:"keep_stdin,omitempty"`
	// TimeoutSec caps the whole workflow on the edge (all steps + retries).
	//   > 0 → deadline of that many seconds,
	//   < 0 → no deadline (long-running actions that keep a server alive
	//         until the operator clicks Stop),
	//   = 0 → omitted from the JSON; the edge applies its own 30-minute
	//         default, which keeps older callers' behaviour unchanged.
	TimeoutSec int `json:"timeout_sec,omitempty"`
}

// InstallStep mirrors the edge's internal/install.Step so the panel can pass
// the spec's install[] array through opaquely (no re-typing on the panel).
type InstallStep struct {
	Action       string `json:"action"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	Filename     string `json:"filename"`
	Archive      string `json:"archive"`
	Dest         string `json:"dest"`
	From         string `json:"from"`
	To           string `json:"to"`
	Path         string `json:"path"`
	Content      string `json:"content"`
	Branch       string `json:"branch"`
	Retries      string `json:"retries"`
	IgnoreErrors bool   `json:"ignore_errors"`
}

// InstallStartResponse is what the edge returns when the install kick-off is
// accepted. install_id is the key the panel uses for subsequent status polls.
type InstallStartResponse struct {
	OK        bool   `json:"ok"`
	InstallID string `json:"install_id,omitempty"`
	Error     string `json:"error,omitempty"`
}

// InstallStatusRequest is the GET query params for /api/edge/install?kind=&name=&token=.
type InstallStatusRequest struct {
	Token string `json:"token"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
}

// InstallStepStatus is the per-step transcript the panel polls back (mirrors
// edge's internal/install.StepStatus).
type InstallStepStatus struct {
	Index     int    `json:"index"`
	Action    string `json:"action"`
	Status    string `json:"status"`
	Attempt   int    `json:"attempt"`
	ExitCode  int    `json:"exit_code"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	StartedAt string `json:"started_at"`
	EndedAt   string `json:"ended_at,omitempty"`
}

// InstallStatusResponse is the polled install state. State is one of:
// "running" | "done" | "failed" | "unknown" (no record / edge restarted).
type InstallStatusResponse struct {
	OK        bool                `json:"ok"`
	State     string              `json:"state"`
	Steps     []InstallStepStatus `json:"steps"`
	Error     string              `json:"error"`
	StartedAt string              `json:"started_at"`
	EndedAt   string              `json:"ended_at"`
}

// InstallStopRequest is the body POST'd to /api/edge/install/stop to cancel a
// running install workflow (the edge half of the operator's home-page "Stop"
// button). Kind+Name resolve the same <kind>:<name> record key the install
// start used; StopCommand is the optional shell command the edge runs INSIDE
// the container once the in-flight workflow is cancelled — the template
// action's `stop_command` field. StopMode controls delivery: "different" (default)
// execs a new shell; "same" writes to the running process's stdin.
type InstallStopRequest struct {
	Token       string `json:"token"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	StopCommand string `json:"stop_command,omitempty"`
	StopMode    string `json:"stop_mode,omitempty"` // "same" | "different" (default)
}

// InstallStopResponse carries the cancellation outcome + the stop_command's
// captured I/O. State mirrors install.InstallStatusResponse.State: "running"
// (was running, now cancelled), "done"/"failed" (already resolved — cancel
// was a no-op), "unknown" (no record / edge restarted).
type InstallStopResponse struct {
	OK       bool   `json:"ok"`
	State    string `json:"state"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	Error    string `json:"error,omitempty"`
}

// InstallStart POSTs the install kick-off to the edge. Returns the install_id
// immediately so the panel can start polling.
func (c *Client) InstallStart(req InstallStartRequest) (InstallStartResponse, error) {
	req.Token = c.token
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/install", req); handled {
		if err != nil {
			return InstallStartResponse{}, err
		}
		var out InstallStartResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return InstallStartResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return InstallStartResponse{}, fmt.Errorf("encode request: %w", err)
	}

	endpoint := c.baseURL + "/api/edge/install"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return InstallStartResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut InstallStartResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/install", req, &emOut); ok {
			return emOut, err2
		}
		return InstallStartResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()

	var out InstallStartResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return InstallStartResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// InstallStatus GETs the install status from the edge. Token is passed as a
// query param (browsers can't set headers on fetch/EventSource behind proxies).
func (c *Client) InstallStatus(req InstallStatusRequest) (InstallStatusResponse, error) {
	req.Token = c.token
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if c.isTunnel() {
		connected := tunnel.Global().IsConnected(c.nodeID)
		if connected {
			path := fmt.Sprintf("/api/edge/install?kind=%s&name=%s&token=%s",
				urlQueryEscape(req.Kind), urlQueryEscape(req.Name), urlQueryEscape(req.Token))
			if handled, body, status, err := c.tryTunnel("GET", path, nil); handled {
				if err != nil {
					return InstallStatusResponse{}, fmt.Errorf("dial edge: %s", redactTokenErr(err))
				}
				var out InstallStatusResponse
				if err := unmarshalTunnelResponse(body, status, &out); err != nil {
					return InstallStatusResponse{}, err
				}
				if status >= 300 {
					if out.Error != "" {
						return out, fmt.Errorf("edge rejected: %s", out.Error)
					}
					return out, fmt.Errorf("edge returned HTTP %d", status)
				}
				return out, nil
			}
			// Tunnel connected but tryTunnel declined (dual port-preferred):
			// fall through to HTTP below. A strict-WSS failure would have
			// returned handled==true with an error above, so no extra check.
		} else if IsStrictTunnel(c.connectionMode) {
			return InstallStatusResponse{}, fmt.Errorf("edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)")
		} else if IsDualMode(NormalizeMode(c.connectionMode)) {
			// Dual with strict WSS install task and no tunnel must not
			// fall back to HTTP when fallback is disabled.
			mode := NormalizeMode(c.connectionMode)
			route := DecideRoute(mode, TaskInstance, LoadChannels(c.nodeID), false)
			if route.Strict && route.Transport == TransportWSS {
				return InstallStatusResponse{}, fmt.Errorf("edge not connected via WSS tunnel (%s mode task %q prefers WSS for channel %q with fallback disabled)", mode, TaskInstance, route.ChannelName)
			}
		}
	}
	endpoint := c.baseURL + "/api/edge/install"
	httpReq, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return InstallStatusResponse{}, fmt.Errorf("build request: %w", err)
	}
	q := httpReq.URL.Query()
	q.Set("kind", req.Kind)
	q.Set("name", req.Name)
	q.Set("token", req.Token)
	httpReq.URL.RawQuery = q.Encode()

	resp, err := c.http.Do(httpReq)
	if err != nil {
		// The URL carries the token as a query param — mask it before the
		// error reaches any log.
		var emOut InstallStatusResponse
		emPath := fmt.Sprintf("/api/edge/install?kind=%s&name=%s&token=%s",
			urlQueryEscape(req.Kind), urlQueryEscape(req.Name), urlQueryEscape(req.Token))
		if ok, err2 := c.tryEmergencyTunnel("GET", emPath, nil, &emOut); ok {
			if err2 != nil {
				return InstallStatusResponse{}, fmt.Errorf("dial edge: %s", redactTokenErr(err2))
			}
			return emOut, nil
		}
		return InstallStatusResponse{}, fmt.Errorf("dial edge: %s", redactTokenErr(err))
	}
	defer resp.Body.Close()

	var out InstallStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return InstallStatusResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	return out, nil
}

func urlQueryEscape(s string) string {
	return url.QueryEscape(s)
}

// InstallStop POSTs the cancel + optional stop_command to the edge's
// /api/edge/install/stop endpoint. The edge cancels the running workflow's
// context (install.Run observes the context between + within steps and aborts
// promptly) and, when StopCommand is supplied, execs it once inside the
// container. Returns the prior workflow state plus the stop_command's captured
// I/O so the panel can surface whether the cleanup ran cleanly.
//
// A 404 (edge lost the install record) is mapped to State="unknown" rather
// than an error so the panel's StopActionHandler can treat a missing workflow
// the same way installSweepLoop does ("workflow already resolved") and still
// run the stop_command for the container-side cleanup.
func (c *Client) InstallStop(req InstallStopRequest) (InstallStopResponse, error) {
	req.Token = c.token
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/install/stop", req); handled {
		if err != nil {
			return InstallStopResponse{}, err
		}
		var out InstallStopResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return InstallStopResponse{}, err
		}
		if status >= 300 && status != http.StatusNotFound {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return InstallStopResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/install/stop"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return InstallStopResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut InstallStopResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/install/stop", req, &emOut); ok {
			return emOut, err2
		}
		return InstallStopResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()

	var out InstallStopResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return InstallStopResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotFound {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	return out, nil
}

// A non-2xx status is converted into an error so callers can treat the RPC
// uniformly with `err != nil`.
func (c *Client) Lifecycle(req LifecycleRequest) (LifecycleResponse, error) {
	return c.LifecycleCtx(context.Background(), req)
}

// LifecycleCtx is Lifecycle with a caller-supplied context so a handler can
// bound the call below its own response deadline: `docker stop` may honor a
// full grace period before SIGKILL, and a request that outlives the CDN/
// tunnel origin window surfaces the proxy's raw HTML error page instead of
// this client's structured error.
func (c *Client) LifecycleCtx(ctx context.Context, req LifecycleRequest) (LifecycleResponse, error) {
	req.Token = c.token
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/lifecycle", req); handled {
		if err != nil {
			return LifecycleResponse{}, err
		}
		var out LifecycleResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return LifecycleResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return LifecycleResponse{}, fmt.Errorf("encode request: %w", err)
	}

	endpoint := c.baseURL + "/api/edge/lifecycle"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return LifecycleResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut LifecycleResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/lifecycle", req, &emOut); ok {
			return emOut, err2
		}
		return LifecycleResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()

	var out LifecycleResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		// The edge may have returned a text/plain error body; surface status.
		return LifecycleResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// ExecRequest POST'd to /api/edge/exec-rpc. The edge runs `command` inside
// the named workload's namespace, injects the supplied env, returns the
// captured stdout/stderr/exit-code.
type ExecRequest struct {
	Token   string            `json:"token"`
	Action  string            `json:"action"` // "exec" (kept for symmetry)
	Kind    string            `json:"kind"`
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Env     map[string]string `json:"env,omitempty"`
	// Files optionally stages {path,content} entries into a fresh temp dir
	// inside the workload before `command` runs; the panel prefixes the
	// command with a cd into that dir. Used by application runs so the
	// script travels with the request instead of a separate file-manager
	// round-trip (which only supports docker today).
	Files []ExecFile `json:"files,omitempty"`
	// TimeoutSec caps how long the edge will let the command run. 0 is left
	// to the edge's own default.
	TimeoutSec int `json:"timeout_sec,omitempty"`
}

// ExecFile is one script file staged by ExecRequest / HostExecRequest.
// Path is relative (the edge rejects absolute paths and "..").
type ExecFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// ExecResponse carries the captured process I/O.
type ExecResponse struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
}

// Exec runs a one-shot command on the edge synchronously and returns the
// captured I/O. Mirrors LifecycleRequest's auth + dispatch model.
func (c *Client) Exec(req ExecRequest) (ExecResponse, error) {
	return c.ExecCtx(context.Background(), req)
}

// ExecCtx is Exec with a caller-supplied context so the caller can bound the
// call or cancel it on shutdown (e.g. scheduler sweep cancellation).
func (c *Client) ExecCtx(ctx context.Context, req ExecRequest) (ExecResponse, error) {
	req.Token = c.token
	req.Action = "exec"
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/exec-rpc", req); handled {
		if err != nil {
			return ExecResponse{}, err
		}
		var out ExecResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return ExecResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return ExecResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/exec-rpc"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return ExecResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut ExecResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/exec-rpc", req, &emOut); ok {
			return emOut, err2
		}
		return ExecResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()

	var out ExecResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return ExecResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// HostExecRequest POST'd to /api/edge/host-exec. Runs `command` directly on
// the edge HOST filesystem (no workload), staging Files into a fresh temp
// dir the command starts in. Used by application runs whose target is the
// host itself rather than a container/VM.
type HostExecRequest struct {
	Token      string            `json:"token"`
	Command    string            `json:"command"`
	Env        map[string]string `json:"env,omitempty"`
	Files      []ExecFile        `json:"files,omitempty"`
	TimeoutSec int               `json:"timeout_sec,omitempty"`
}

// HostExecResponse carries the captured process I/O (same shape as
// ExecResponse so one decode path covers both).
type HostExecResponse struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
}

// HostExec runs a one-shot command on the edge host filesystem.
func (c *Client) HostExec(req HostExecRequest) (HostExecResponse, error) {
	return c.HostExecCtx(context.Background(), req)
}

// HostExecCtx is HostExec with a caller-supplied context.
func (c *Client) HostExecCtx(ctx context.Context, req HostExecRequest) (HostExecResponse, error) {
	req.Token = c.token
	// Try WSS tunnel first for reverse_tunnel / local_wss / both / local_both.
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/host-exec", req); handled {
		if err != nil {
			return HostExecResponse{}, err
		}
		var out HostExecResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return HostExecResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return HostExecResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/host-exec"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return HostExecResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut HostExecResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/host-exec", req, &emOut); ok {
			return emOut, err2
		}
		return HostExecResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out HostExecResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return HostExecResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// InspectRequest fetches driver-side metrics + processes + ports for a
// workload. Used by the panel's live-state cache for the per-instance
// Processes / Metrics / Ports pages.
type InspectRequest struct {
	Token string `json:"token"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
}

// InspectResponse is the opaque edge-side blob. The panel stores it raw in
// instance_live_state and the SPA decodes the fields.
type InspectResponse struct {
	OK        bool            `json:"ok"`
	Status    string          `json:"status,omitempty"`
	Metrics   json.RawMessage `json:"metrics,omitempty"`
	Processes json.RawMessage `json:"processes,omitempty"`
	Ports     json.RawMessage `json:"ports,omitempty"`
	Info      json.RawMessage `json:"info,omitempty"`
	Error     string          `json:"error,omitempty"`
}

// Inspect calls the edge's /api/edge/inspect endpoint.
func (c *Client) Inspect(req InspectRequest) (InspectResponse, error) {
	req.Token = c.token
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/inspect", req); handled {
		if err != nil {
			return InspectResponse{}, err
		}
		var out InspectResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return InspectResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return InspectResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/inspect"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return InspectResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut InspectResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/inspect", req, &emOut); ok {
			return emOut, err2
		}
		return InspectResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out InspectResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return InspectResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// SnapshotRequest asks the edge to create/restore/delete a driver-side
// snapshot of the workload. The panel persists the returned external_ref.
type SnapshotRequest struct {
	Token string `json:"token"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	// "create" | "restore" | "delete".
	Action   string `json:"action"`
	SnapName string `json:"snap_name,omitempty"`
	Type     string `json:"type,omitempty"`     // e.g., "zip", "tar", "docker", "lxd"
	Location string `json:"location,omitempty"` // e.g., "/mc/", "/tmp/snapshots/"
}

type SnapshotResponse struct {
	OK          bool   `json:"ok"`
	ExternalRef string `json:"external_ref,omitempty"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	Error       string `json:"error,omitempty"`
}

// Snapshot dispatches a create/restore/delete RPC.
func (c *Client) Snapshot(req SnapshotRequest) (SnapshotResponse, error) {
	req.Token = c.token
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/snapshot", req); handled {
		if err != nil {
			return SnapshotResponse{}, err
		}
		var out SnapshotResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return SnapshotResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return SnapshotResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/snapshot"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return SnapshotResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut SnapshotResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/snapshot", req, &emOut); ok {
			return emOut, err2
		}
		return SnapshotResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out SnapshotResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return SnapshotResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// PageActionRequest is the wire format POSTed to the edge's
// /api/edge/page-action endpoint.
type PageActionRequest struct {
	Token    string            `json:"token"`
	Kind     string            `json:"kind"`
	Name     string            `json:"name"`
	Type     string            `json:"type"`
	Command  string            `json:"command,omitempty"`
	Path     string            `json:"path,omitempty"`
	Content  string            `json:"content,omitempty"`
	Args     []string          `json:"args,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Timeout  int               `json:"timeout,omitempty"`
	ModuleID string            `json:"module_id,omitempty"`
}

// PageActionResponse is what the edge hands back.
type PageActionResponse struct {
	OK       bool   `json:"ok"`
	ExitCode int    `json:"exit_code,omitempty"`
	Stdout   string `json:"stdout,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	Error    string `json:"error,omitempty"`
	Data     any    `json:"data,omitempty"`
}

// PortAllocation is one host->container binding the panel persists in
// instance_ports and the edge reconciles into docker -p flags.
type PortAllocation struct {
	Host      int    `json:"host"`
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
	IP        string `json:"ip,omitempty"`
}

// UpdatePortsRequest is POSTed to /api/edge/ports/update. The edge validates
// Token, then dispatches Kind+Name to the driver's UpdatePorts.
type UpdatePortsRequest struct {
	Token string           `json:"token"`
	Kind  string           `json:"kind"`
	Name  string           `json:"name"`
	Ports []PortAllocation `json:"ports"`
}

// UpdatePortsResponse carries the edge reconcile outcome.
type UpdatePortsResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// UpdatePorts dispatches the allocation editor reconcile. It honours the WSS
// tunnel like Lifecycle/Inspect etc. The panel has already persisted the new
// allocations to instance_ports; the edge's job is to make the live container
// reflect them when it is running (recreate with new -p), or no-op when
// stopped (DB-only path).
func (c *Client) UpdatePorts(req UpdatePortsRequest) (UpdatePortsResponse, error) {
	req.Token = c.token
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/ports/update", req); handled {
		if err != nil {
			return UpdatePortsResponse{}, err
		}
		var out UpdatePortsResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return UpdatePortsResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return UpdatePortsResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/ports/update"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return UpdatePortsResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut UpdatePortsResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/ports/update", req, &emOut); ok {
			return emOut, err2
		}
		return UpdatePortsResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out UpdatePortsResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return UpdatePortsResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// SFTPProvisionRequest is POSTed to /api/edge/sftp/provision. The panel
// mints username inst_<id> + a 32-byte random password (vaulted in
// instance_secrets); the edge bcrypt-hashes it and jails the session to
// root.
type SFTPProvisionRequest struct {
	Token    string `json:"token"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Password string `json:"password"`
	Root     string `json:"root,omitempty"`
}

// SFTPDeleteRequest is POSTed to /api/edge/sftp/delete.
type SFTPDeleteRequest struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Kind     string `json:"kind,omitempty"`
	Name     string `json:"name,omitempty"`
}

// SFTPResponse carries the edge provision/delete outcome.
type SFTPResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// sftpDo is the shared tunnel-aware POST for the two SFTP RPCs.
func (c *Client) sftpDo(path string, reqBody any) (SFTPResponse, error) {
	switch r := reqBody.(type) {
	case *SFTPProvisionRequest:
		r.Token = c.token
	case *SFTPDeleteRequest:
		r.Token = c.token
	}
	if handled, body, status, err := c.tryTunnel("POST", path, reqBody); handled {
		if err != nil {
			return SFTPResponse{}, err
		}
		var out SFTPResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return SFTPResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		if !out.OK {
			if out.Error != "" {
				return out, fmt.Errorf("%s", out.Error)
			}
			return out, fmt.Errorf("edge reported failure without a message")
		}
		return out, nil
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return SFTPResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + path
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return SFTPResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut SFTPResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", path, reqBody, &emOut); ok {
			return emOut, err2
		}
		return SFTPResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out SFTPResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return SFTPResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if !out.OK {
		if out.Error != "" {
			return out, fmt.Errorf("%s", out.Error)
		}
		return out, fmt.Errorf("edge reported failure without a message")
	}
	return out, nil
}

// ProvisionSFTP provisions (or re-provisions) one SFTP identity on the edge.
func (c *Client) ProvisionSFTP(req SFTPProvisionRequest) (SFTPResponse, error) {
	return c.sftpDo("/api/edge/sftp/provision", &req)
}

// DeleteSFTP removes one SFTP identity from the edge. Idempotent: unknown
// usernames are OK on the edge so Destroy/Suspend retries stay safe.
func (c *Client) DeleteSFTP(req SFTPDeleteRequest) (SFTPResponse, error) {
	return c.sftpDo("/api/edge/sftp/delete", &req)
}

// PageAction dispatches a custom-page action RPC, honouring the WSS tunnel
// when the node is in a tunnel mode (reverse_tunnel / local_wss / both /
// local_both, same as Lifecycle, Inspect, etc.). This replaces the previous
// direct-HTTP dial that bypassed the tunnel and always verified TLS
// regardless of SkipTLSVerify.
func (c *Client) PageAction(req PageActionRequest) (PageActionResponse, error) {
	req.Token = c.token
	if handled, body, status, err := c.tryTunnel("POST", "/api/edge/page-action", req); handled {
		if err != nil {
			return PageActionResponse{}, err
		}
		var out PageActionResponse
		if err := unmarshalTunnelResponse(body, status, &out); err != nil {
			return PageActionResponse{}, err
		}
		if status >= 300 {
			if out.Error != "" {
				return out, fmt.Errorf("edge rejected: %s", out.Error)
			}
			return out, fmt.Errorf("edge returned HTTP %d", status)
		}
		return out, nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return PageActionResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/page-action"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return PageActionResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		var emOut PageActionResponse
		if ok, err2 := c.tryEmergencyTunnel("POST", "/api/edge/page-action", req, &emOut); ok {
			return emOut, err2
		}
		return PageActionResponse{}, fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	var out PageActionResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return PageActionResponse{}, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		if out.Error != "" {
			return out, fmt.Errorf("edge rejected: %s", out.Error)
		}
		return out, fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	return out, nil
}

// ---- Edge self-update (per-node Update & Reinstall UI) -------------------
// The panel never upgrades a remote edge binary itself — it proxies a
// trigger RPC to the edge, and the edge downloads + swaps + restarts via
// its own reinstall.sh (mirrors the panel's System → Panel tab, but the
// script lives on the edge host). All five RPCs honour the WSS tunnel like
// every other edge call so reverse_tunnel / both / local_* nodes work.

type EdgeVersionInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
}

type EdgeRemoteManifest struct {
	Version       string `json:"version"`
	Commit        string `json:"commit,omitempty"`
	BuildDate     string `json:"build_date,omitempty"`
	Notes         string `json:"notes,omitempty"`
	SizeBytes     int64  `json:"size_bytes,omitempty"`
	SHA256        string `json:"sha256,omitempty"`
	SHA256Edge    string `json:"sha256_edge,omitempty"`
	Signature     string `json:"signature,omitempty"`
	SignatureEdge string `json:"signature_edge,omitempty"`
}

type EdgeUpdateInfoResponse struct {
	Local      EdgeVersionInfo `json:"local"`
	UpdateURL  string          `json:"update_url"`
	VersionURL string          `json:"version_url"`
	BinaryPath string          `json:"binary_path"`
	Error      string          `json:"error,omitempty"`
}

type EdgeUpdateCheckResponse struct {
	Available bool               `json:"available"`
	Local     EdgeVersionInfo    `json:"local"`
	Remote    EdgeRemoteManifest `json:"remote"`
	CheckedAt string             `json:"checked_at"`
	UpdateURL string             `json:"update_url"`
	Error     string             `json:"error,omitempty"`
}

type EdgeUpdateApplyResponse struct {
	OK           bool   `json:"ok"`
	Message      string `json:"message"`
	LocalBefore  string `json:"local_version_before"`
	TargetBinary string `json:"target_binary"`
	Log          string `json:"log,omitempty"`
	Error        string `json:"error,omitempty"`
}

type EdgeReinstallBackgroundResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Script  string `json:"script_path"`
	Error   string `json:"error,omitempty"`
}

type edgeTokenBody struct {
	Token string `json:"token"`
}

// edgeUpdateGet is the shared tunnel-aware GET for update-info /
// update-check. Token travels as ?token= query (mirrors InstallStatus)
// and is redacted from dial errors so the shared edge secret never lands
// in panel logs.
func (c *Client) edgeUpdateGet(path string, out any) error {
	token := c.token
	if c.isTunnel() {
		connected := tunnel.Global().IsConnected(c.nodeID)
		if connected {
			qpath := fmt.Sprintf("%s?token=%s", path, urlQueryEscape(token))
			if handled, body, status, err := c.tryTunnel("GET", qpath, nil); handled {
				if err != nil {
					return fmt.Errorf("dial edge: %s", redactTokenErr(err))
				}
				if err := unmarshalTunnelResponse(body, status, out); err != nil {
					return err
				}
				if status >= 300 {
					var env struct {
						Error string `json:"error"`
					}
					_ = json.Unmarshal(body, &env)
					if env.Error != "" {
						return fmt.Errorf("edge rejected: %s", env.Error)
					}
					return fmt.Errorf("edge returned HTTP %d", status)
				}
				return nil
			}
			// Tunnel connected but tryTunnel declined (dual port-preferred):
			// fall through to HTTP below. Strict-WSS failures return
			// handled==true with an error above.
		} else if IsStrictTunnel(c.connectionMode) {
			return fmt.Errorf("edge not connected via WSS tunnel (reverse_tunnel mode requires edge to be online)")
		} else if IsDualMode(NormalizeMode(c.connectionMode)) {
			// Dual with strict WSS node task (update RPCs route as node)
			// and no tunnel must not fall back to HTTP when disabled.
			mode := NormalizeMode(c.connectionMode)
			route := DecideRoute(mode, TaskForPath(path), LoadChannels(c.nodeID), false)
			if route.Strict && route.Transport == TransportWSS {
				return fmt.Errorf("edge not connected via WSS tunnel (%s mode task %q prefers WSS for channel %q with fallback disabled)", mode, TaskForPath(path), route.ChannelName)
			}
		}
	}
	endpoint := c.baseURL + path
	httpReq, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	q := httpReq.URL.Query()
	q.Set("token", token)
	httpReq.URL.RawQuery = q.Encode()
	resp, err := c.http.Do(httpReq)
	if err != nil {
		emPath := fmt.Sprintf("%s?token=%s", path, urlQueryEscape(token))
		if ok, err2 := c.tryEmergencyTunnel("GET", emPath, nil, out); ok {
			if err2 != nil {
				return fmt.Errorf("dial edge: %s", redactTokenErr(err2))
			}
			return nil
		}
		return fmt.Errorf("dial edge: %s", redactTokenErr(err))
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		var env struct {
			Error string `json:"error"`
		}
		raw, _ := json.Marshal(out)
		_ = json.Unmarshal(raw, &env)
		if env.Error != "" {
			return fmt.Errorf("edge rejected: %s", env.Error)
		}
		return fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// edgeUpdatePost is the shared tunnel-aware POST for update-apply /
// reinstall / reinstall-background. Token travels in the JSON body
// (mirrors Lifecycle/Inspect) so it never lands in URLs or logs.
func (c *Client) edgeUpdatePost(path string, out any) error {
	req := edgeTokenBody{Token: c.token}
	if handled, body, status, err := c.tryTunnel("POST", path, req); handled {
		if err != nil {
			return err
		}
		if err := unmarshalTunnelResponse(body, status, out); err != nil {
			return err
		}
		if status >= 300 {
			var env struct {
				Error string `json:"error"`
			}
			_ = json.Unmarshal(body, &env)
			if env.Error != "" {
				return fmt.Errorf("edge rejected: %s", env.Error)
			}
			return fmt.Errorf("edge returned HTTP %d", status)
		}
		return nil
	}
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + path
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
		if ok, err2 := c.tryEmergencyTunnel("POST", path, req, out); ok {
			return err2
		}
		return fmt.Errorf("dial edge: %w", err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		var env struct {
			Error string `json:"error"`
		}
		raw, _ := json.Marshal(out)
		_ = json.Unmarshal(raw, &env)
		if env.Error != "" {
			return fmt.Errorf("edge rejected: %s", env.Error)
		}
		return fmt.Errorf("edge returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// EdgeUpdateInfo fetches the edge's local build identity + artefact URLs.
func (c *Client) EdgeUpdateInfo() (EdgeUpdateInfoResponse, error) {
	var out EdgeUpdateInfoResponse
	if err := c.edgeUpdateGet("/api/edge/update-info", &out); err != nil {
		return EdgeUpdateInfoResponse{}, err
	}
	return out, nil
}

// EdgeUpdateCheck asks the edge to fetch the remote manifest and compare.
func (c *Client) EdgeUpdateCheck() (EdgeUpdateCheckResponse, error) {
	var out EdgeUpdateCheckResponse
	if err := c.edgeUpdateGet("/api/edge/update-check", &out); err != nil {
		return EdgeUpdateCheckResponse{}, err
	}
	return out, nil
}

// EdgeUpdateApply triggers an in-process download + swap + relaunch.
func (c *Client) EdgeUpdateApply() (EdgeUpdateApplyResponse, error) {
	var out EdgeUpdateApplyResponse
	if err := c.edgeUpdatePost("/api/edge/update-apply", &out); err != nil {
		return EdgeUpdateApplyResponse{}, err
	}
	return out, nil
}

// EdgeReinstall forces a reinstall of the current channel binary.
func (c *Client) EdgeReinstall() (EdgeUpdateApplyResponse, error) {
	var out EdgeUpdateApplyResponse
	if err := c.edgeUpdatePost("/api/edge/reinstall", &out); err != nil {
		return EdgeUpdateApplyResponse{}, err
	}
	return out, nil
}

// EdgeReinstallBackground asks the edge to write + run reinstall.sh detached.
func (c *Client) EdgeReinstallBackground() (EdgeReinstallBackgroundResponse, error) {
	var out EdgeReinstallBackgroundResponse
	if err := c.edgeUpdatePost("/api/edge/reinstall-background", &out); err != nil {
		return EdgeReinstallBackgroundResponse{}, err
	}
	return out, nil
}
