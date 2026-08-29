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
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
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
		if err := c.connectAndServe(ctx); err != nil {
			// Don't spam logs on every reconnect.
			if ctx.Err() == nil {
				log.Printf("tunnel: disconnected: %v (retry in %s)", err, backoff)
			}
		}
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
	log.Printf("tunnel: dialing %s", wsURL.String())
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.DialContext(ctx, wsURL.String(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	log.Printf("tunnel: connected to panel via WSS")
	// Reset backoff on successful connect
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
	// Writes must be serialized; use a mutex-like approach via single control?
	// gorilla websocket requires single concurrent writer, so we guard with a global.
	// Simple: use a write mutex per connection. Since we share conn, serialize.
	// We'll use the conn's built-in mutex by just locking via a package-level sync.
	// For now, just write directly – Go's websocket will error on concurrent writes,
	// so we add a per-client mutex via tunnel global (lazy).
	// We implement a per-connection write with a sync.Mutex stored in context?
	// Simplest: rely on the fact that handleRequest is called in separate goroutine but
	// WriteJSON is protected by a mutex we create per client. We'll add a simple
	// global write lock for now – acceptable for low concurrency.
	writeMu.Lock()
	_ = ws.WriteJSON(resp)
	writeMu.Unlock()
}

// writeMu serializes writes to the shared websocket.
var writeMu = &syncMutex{}

type syncMutex struct {
	ch chan struct{}
}

func init() {
	writeMu.ch = make(chan struct{}, 1)
	writeMu.ch <- struct{}{}
}

func (m *syncMutex) Lock()   { <-m.ch }
func (m *syncMutex) Unlock() { m.ch <- struct{}{} }

func (c *Client) forwardToLocal(method, p string, body json.RawMessage) (int, json.RawMessage, string) {
	// Build local URL. p may contain query string for GET.
	localURL := fmt.Sprintf("http://127.0.0.1:%d%s", c.listenPort, p)
	var bodyReader io.Reader
	if body != nil && len(body) > 0 && method != "GET" && method != "HEAD" {
		bodyReader = bytes.NewReader(body)
	}
	// For GET with body (unlikely), still send body if present.
	if body != nil && len(body) > 0 && (method == "GET" || method == "HEAD") {
		// Query already in p; body is not needed.
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, localURL, bodyReader)
	if err != nil {
		return 500, nil, err.Error()
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	// Short timeout per RPC – mirrors panel's client timeout (30s default).
	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 502, nil, fmt.Sprintf("local forward failed: %v", err)
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
