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
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/example/kspanel/internal/models"
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
	baseURL string
	token   string
	http    *http.Client
}

// BaseURL returns the base URL for the edge node.
func (c *Client) BaseURL() string {
	return c.baseURL
}

// New builds a Client for a registered node. The token is the same shared
// secret the edge presented during heartbeat ingest — we reuse it on the
// outbound direction so the edge can authenticate the caller without a
// second credential store.
func New(node models.Node, token string) *Client {
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			ServerName:         node.Address,
			InsecureSkipVerify: node.SkipTLSVerify,
		},
	}
	return &Client{
		baseURL: fmt.Sprintf("%s://%s", scheme, node.Address),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second, Transport: transport},
	}
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
	scheme := "http"
	if node.UseTLS {
		scheme = "https"
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			ServerName:         node.Address,
			InsecureSkipVerify: node.SkipTLSVerify,
		},
	}
	return &Client{
		baseURL: fmt.Sprintf("%s://%s", scheme, node.Address),
		token:   token,
		http:    &http.Client{Timeout: timeout, Transport: transport},
	}
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
	req.Token = c.token
	req.Action = "exec"
	body, err := json.Marshal(req)
	if err != nil {
		return ExecResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/exec-rpc"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return ExecResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
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
	req.Token = c.token
	body, err := json.Marshal(req)
	if err != nil {
		return HostExecResponse{}, fmt.Errorf("encode request: %w", err)
	}
	endpoint := c.baseURL + "/api/edge/host-exec"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return HostExecResponse{}, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(httpReq)
	if err != nil {
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
	return out, nil
}
