// Package tunnel implements the edge side of the reverse WSS tunnel.
// An edge dials wss://panel/api/edge/tunnel?token=... and keeps the
// connection alive. The panel then multiplexes RPCs (lifecycle, exec, etc)
// over that socket. The edge reads those requests, forwards them to its
// own local HTTP server (http://127.0.0.1:<port>/...), and sends the response
// back over the same websocket.
//
// This gives two of the four NodeForm modes their WSS transport:
//   - reverse_tunnel  — edge behind NAT, no inbound port needed
//   - local_wss       — local edge that also keeps a tunnel for consistency
// The direct / local_port modes keep using plain HTTP and don't need the tunnel,
// but running the tunnel in parallel is harmless – the panel will prefer the
// tunnel when present for tunnel modes and fall back to HTTP for direct modes.
package tunnel

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// tunnelRequest is panel→edge.
type tunnelRequest struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Body   json.RawMessage `json:"body,omitempty"`
}

// tunnelResponse is edge→panel.
type tunnelResponse struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body,omitempty"`
	Error  string          `json:"error,omitempty"`
}

// Client dials and holds the tunnel.
type Client struct {
	panelURL   string
	token      string
	listenPort int
	skipVerify bool
	mu         sync.Mutex
}

// New builds a tunnel client. panelURL is the edge's configured panel_url
// (e.g. https://panel.example.com:3000), token is the edge token, listenPort
// is the local HTTP port the edge exposes (so we can forward to 127.0.0.1:port).
func New(panelURL, token string, listenPort int) *Client {
	return &Client{
		panelURL:   panelURL,
		token:      token,
		listenPort: listenPort,
	}
}

// NewWithSkipVerify mirrors New but honours the skip-verify flag for
// self-signed panels (mirrors heartbeat.Sender's TLS handling).
func NewWithSkipVerify(panelURL, token string, listenPort int, skipVerify bool) *Client {
	return &Client{
		panelURL:   panelURL,
		token:      token,
		listenPort: listenPort,
		skipVerify: skipVerify,
	}
}

// Run blocks and keeps the tunnel connected with exponential backoff.
// It returns when ctx is cancelled.
func (c *Client) Run(ctx context.Context) {
	if c.token == "" || c.panelURL == "" {
		log.Printf("tunnel: disabled (token or panel_url empty)")
		return
	}
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		start := time.Now()
		if err := c.connectAndServe(ctx); err != nil {
			// Don't spam logs on every reconnect.
			if ctx.Err() == nil {
				log.Printf("tunnel: disconnected: %v (retry in %s)", err, backoff)
			}
		}
		// Reset backoff after a stable connection so a single historic flap
		// doesn't pin retries at 30s forever. Only short-lived sessions
		// (immediate dial failures, auth rejects) keep growing the delay.
		if time.Since(start) > 10*time.Second {
			backoff = time.Second
		} else {
			// Exponential backoff capped at 30s.
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
			}
			continue
		}
		// Stable session ended — still honour a short delay before redial
		// so a clean panel restart doesn't tight-loop, then continue.
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
	}
}

func (c *Client) connectAndServe(ctx context.Context) error {
	u, err := url.Parse(c.panelURL)
	if err != nil {
		return fmt.Errorf("invalid panel_url %q: %w", c.panelURL, err)
	}
	scheme := "ws"
	if u.Scheme == "https" || u.Scheme == "wss" {
		scheme = "wss"
	}
	// Build wss://host/api/edge/tunnel?token=...
	wsURL := url.URL{
		Scheme:   scheme,
		Host:     u.Host,
		Path:     "/api/edge/tunnel",
		RawQuery: url.Values{"token": {c.token}}.Encode(),
	}
	log.Printf("tunnel: dialing %s://%s%s?token=REDACTED", scheme, u.Host, "/api/edge/tunnel")
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: c.skipVerify},
	}
	conn, _, err := dialer.DialContext(ctx, wsURL.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	log.Printf("tunnel: connected to panel via WSS")
	// Note: backoff reset lives in Run (based on session length), not here,
	// so immediate dial-then-drop loops still back off while stable
	// long-lived sessions reset to 1s on the next retry.
	// Handle incoming requests.
	for {
		select {
		case <-ctx.Done():
			_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return ctx.Err()
		default:
		}
		var req tunnelRequest
		if err := conn.ReadJSON(&req); err != nil {
			return err
		}
		if req.Type != "request" || req.ID == "" {
			continue
		}
		// Handle each request in its own goroutine so a slow RPC doesn't block next.
		go c.handleRequest(conn, req)
	}
}

func (c *Client) handleRequest(ws *websocket.Conn, req tunnelRequest) {
	status, body, errStr := c.forwardToLocal(req.Method, req.Path, req.Body)
	resp := tunnelResponse{
		ID:     req.ID,
		Type:   "response",
		Status: status,
		Body:   body,
		Error:  errStr,
	}
	// Writes must be serialized — gorilla/websocket forbids concurrent writers.
	// Use per-client mutex so multiple tunnel clients don't contend on a global.
	c.mu.Lock()
	_ = ws.WriteJSON(resp)
	c.mu.Unlock()
}

func (c *Client) forwardToLocal(method, p string, body json.RawMessage) (int, json.RawMessage, string) {
	// Build local URL. p may contain query string for GET.
	localURL := fmt.Sprintf("http://127.0.0.1:%d%s", c.listenPort, p)
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, localURL, bodyReader)
	if err != nil {
		msg := err.Error()
		if c.token != "" {
			msg = strings.ReplaceAll(msg, c.token, "REDACTED")
		}
		return 500, nil, msg
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	// Short timeout per RPC – mirrors panel's client timeout (30s default).
	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		msg := fmt.Sprintf("local forward failed: %v", err)
		if c.token != "" {
			msg = strings.ReplaceAll(msg, c.token, "REDACTED")
		}
		return 502, nil, msg
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return 500, nil, err.Error()
	}
	// Preserve raw JSON body if any.
	var raw json.RawMessage
	if len(respBody) > 0 {
		// Try to keep as json.RawMessage; if not JSON, wrap as error string.
		if json.Valid(respBody) {
			raw = json.RawMessage(respBody)
		} else {
			// Not JSON – wrap as string error.
			raw = json.RawMessage(fmt.Sprintf(`{"error":%q}`, strings.TrimSpace(string(respBody))))
		}
	}
	errStr := ""
	if resp.StatusCode >= 400 {
		// Try to extract error field from body.
		var tmp map[string]any
		if err := json.Unmarshal(respBody, &tmp); err == nil {
			if e, ok := tmp["error"].(string); ok {
				errStr = e
			}
		}
		if errStr == "" {
			errStr = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
	}
	return resp.StatusCode, raw, errStr
}
