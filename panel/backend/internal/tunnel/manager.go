// Package tunnel maintains persistent WSS connections from edges that use
// tunnel modes (reverse_tunnel / local_wss / both / local_both). An edge dials
// wss://panel/api/edge/tunnel?token=... and keeps the socket alive. The panel
// then multiplexes all panel→edge RPCs (lifecycle, exec, inspect, files,
// install, heartbeats probe) over that single socket instead of dialing the
// edge's address directly.
//
// Each edge gets ONE active tunnel connection. If an edge reconnects, the old
// socket is closed and replaced. RPCs are correlated by an id field; the panel
// side waits on a channel for the matching response with a timeout.
package tunnel

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// pendingResponse is the channel a caller waits on for a specific RPC id.
type pendingResponse struct {
	ch chan tunnelResponse
}

// tunnelRequest is panel→edge.
type tunnelRequest struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"` // "request"
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Body   json.RawMessage `json:"body,omitempty"`
}

// tunnelResponse is edge→panel.
type tunnelResponse struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"` // "response"
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body,omitempty"`
	Error  string          `json:"error,omitempty"`
}

// Conn wraps a single edge tunnel websocket plus its pending RPC map.
type Conn struct {
	nodeID   int64
	ws       *websocket.Conn
	writeMu  sync.Mutex
	pending  sync.Map // id -> chan tunnelResponse
	closed   chan struct{}
}

func newConn(nodeID int64, ws *websocket.Conn) *Conn {
	return &Conn{
		nodeID: nodeID,
		ws:     ws,
		closed: make(chan struct{}),
	}
}

// sendRequest writes a tunnelRequest to the edge and waits for a matching response.
func (c *Conn) sendRequest(req tunnelRequest, timeout time.Duration) (tunnelResponse, error) {
	respCh := make(chan tunnelResponse, 1)
	c.pending.Store(req.ID, respCh)
	defer c.pending.Delete(req.ID)

	c.writeMu.Lock()
	err := c.ws.WriteJSON(req)
	c.writeMu.Unlock()
	if err != nil {
		return tunnelResponse{}, fmt.Errorf("tunnel write: %w", err)
	}

	select {
	case resp := <-respCh:
		return resp, nil
	case <-time.After(timeout):
		return tunnelResponse{}, fmt.Errorf("tunnel response timeout after %s", timeout)
	case <-c.closed:
		return tunnelResponse{}, fmt.Errorf("tunnel closed")
	}
}

// handleReadLoop reads responses from the edge and dispatches them to pending callers.
func (c *Conn) handleReadLoop(mgr *Manager) {
	defer func() {
		select {
		case <-c.closed:
		default:
			close(c.closed)
		}
		mgr.remove(c.nodeID, c)
		_ = c.ws.Close()
	}()
	c.ws.SetReadLimit(8 << 20) // 8 MiB per message – generous but bounded
	for {
		var msg json.RawMessage
		if err := c.ws.ReadJSON(&msg); err != nil {
			return
		}
		// Try to decode as response first.
		var resp tunnelResponse
		if err := json.Unmarshal(msg, &resp); err != nil {
			continue
		}
		if resp.Type != "response" || resp.ID == "" {
			continue
		}
		if chAny, ok := c.pending.Load(resp.ID); ok {
			if ch, ok := chAny.(chan tunnelResponse); ok {
				select {
				case ch <- resp:
				default:
				}
			}
		}
	}
}

// Manager tracks all active tunnel connections.
type Manager struct {
	mu    sync.RWMutex
	conns map[int64]*Conn
}

var global = &Manager{conns: make(map[int64]*Conn)}

// Global returns the singleton manager.
func Global() *Manager { return global }

func (m *Manager) add(nodeID int64, c *Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if old, ok := m.conns[nodeID]; ok && old != c {
		_ = old.ws.Close()
		// Avoid double-close panic if handleReadLoop already closed the channel.
		select {
		case <-old.closed:
		default:
			close(old.closed)
		}
	}
	m.conns[nodeID] = c
}

func (m *Manager) remove(nodeID int64, c *Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cur, ok := m.conns[nodeID]; ok && cur == c {
		delete(m.conns, nodeID)
	}
}

// Get returns the active tunnel for a node, if any.
func (m *Manager) Get(nodeID int64) *Conn {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.conns[nodeID]
}

// IsConnected reports whether the node has an active tunnel.
func (m *Manager) IsConnected(nodeID int64) bool {
	return m.Get(nodeID) != nil
}

// Register is called by the WS handler after upgrading.
func (m *Manager) Register(nodeID int64, ws *websocket.Conn) *Conn {
	c := newConn(nodeID, ws)
	m.add(nodeID, c)
	go c.handleReadLoop(m)
	return c
}

// Send sends a JSON RPC over the tunnel and waits for a response.
// Path must be the edge-local path like "/api/edge/lifecycle".
func (m *Manager) Send(nodeID int64, method, path string, body any, timeout time.Duration) (int, []byte, error) {
	c := m.Get(nodeID)
	if c == nil {
		return 0, nil, fmt.Errorf("no tunnel connected for node %d", nodeID)
	}
	var raw json.RawMessage
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		raw = b
	}
	// Use cryptographic randomness plus timestamp to avoid collisions when two
	// goroutines send at the same nanosecond (UnixNano alone collides under
	// concurrent Sends).
	var randSuffix string
	var rb [8]byte
	if _, err := rand.Read(rb[:]); err == nil {
		randSuffix = hex.EncodeToString(rb[:])
	} else {
		randSuffix = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	id := fmt.Sprintf("%d-%d-%s", nodeID, time.Now().UnixNano(), randSuffix)
	req := tunnelRequest{
		ID:     id,
		Type:   "request",
		Method: method,
		Path:   path,
		Body:   raw,
	}
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	resp, err := c.sendRequest(req, timeout)
	if err != nil {
		return 0, nil, err
	}
	if resp.Error != "" && resp.Status >= 400 {
		return resp.Status, resp.Body, fmt.Errorf("%s", resp.Error)
	}
	return resp.Status, resp.Body, nil
}
