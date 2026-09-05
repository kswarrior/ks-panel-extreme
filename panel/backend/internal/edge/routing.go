// Package edge holds the panel-side edge RPC client. This file adds the
// task-aware transport routing for the dual-transport modes
// (both / local_both, migration 062).
//
// Task taxonomy (fixed, mirrors the NodeForm WSS box):
//   all      catch-all — handles every WSS payload unless an exact-task row wins.
//   files    file-manager transfers.
//   node     node telemetry (resources, uptime, probe/health).
//   instance instance lifecycle (deploy/delete/edit/start/stop, install, exec).
//
// Multiple rows may share one task; the router divides that task's data
// across them round-robin (logical division over the node's single tunnel
// socket — the counter below picks which named channel is considered active
// for observability; the bytes still flow over the one WSS connection).
//
// Transport per channel (both/local_both only):
//   wss  force WSS tunnel for this task.
//   port force direct HTTP (port) for this task.
//   auto WSS when the tunnel is connected, else HTTP, with emergency
//        fallback on overload/disconnect.
// Fallback flag: when a forced transport fails (tunnel disconnect/timeout or
// HTTP dial error), fall back to the other transport instead of failing.
package edge

import (
	"strings"
	"sync"
	"sync/atomic"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// Task constants for WSS channel routing.
const (
	TaskAll      = "all"
	TaskFiles    = "files"
	TaskNode     = "node"
	TaskInstance = "instance"
)

// Transport constants for both/local_both per-task preference.
const (
	TransportWSS  = "wss"
	TransportPort = "port"
	TransportAuto = "auto"
)

// NormalizeMode lowercases/trims a connection mode.
func NormalizeMode(m string) string {
	return strings.ToLower(strings.TrimSpace(m))
}

// IsLocalMode reports whether the edge runs on the panel host itself.
func IsLocalMode(m string) bool {
	m = NormalizeMode(m)
	return m == "local_port" || m == "local_wss" || m == "local_both"
}

// UsesTunnel reports whether the mode keeps a WSS tunnel alive (pure or dual).
func UsesTunnel(m string) bool {
	m = NormalizeMode(m)
	return m == "reverse_tunnel" || m == "local_wss" || m == "both" || m == "local_both"
}

// UsesDirect reports whether the mode keeps a direct HTTP address dialable.
// Empty/unknown fail closed to direct HTTP (mirrors DecideRoute default).
func UsesDirect(m string) bool {
	m = NormalizeMode(m)
	if m == "" {
		return true
	}
	return m == "direct" || m == "local_port" || m == "both" || m == "local_both"
}

// IsDualMode reports whether the mode keeps BOTH transports alive and routes
// per task (both / local_both).
func IsDualMode(m string) bool {
	m = NormalizeMode(m)
	return m == "both" || m == "local_both"
}

// IsStrictTunnel reports whether the mode hard-requires the tunnel (no HTTP
// fallback): only reverse_tunnel. local_wss and the dual modes fall back to
// direct HTTP when the tunnel is down.
func IsStrictTunnel(m string) bool {
	return NormalizeMode(m) == "reverse_tunnel"
}

// TaskForPath infers the routing task from an edge-local RPC path so the
// tunnel dispatcher can pick the right channel without changing every call
// signature. Unknown paths fall back to TaskAll (catch-all channels apply).
func TaskForPath(path string) string {
	p := strings.ToLower(path)
	switch {
	case strings.Contains(p, "/files") || strings.Contains(p, "/sftp"):
		return TaskFiles
	case strings.Contains(p, "/health"),
		strings.Contains(p, "/inspect"),
		strings.Contains(p, "/heartbeat"),
		strings.Contains(p, "/update"),
		strings.Contains(p, "/reinstall"):
		return TaskNode
	case strings.Contains(p, "/lifecycle"),
		strings.Contains(p, "/install"),
		strings.Contains(p, "/exec"),
		strings.Contains(p, "/host-exec"),
		strings.Contains(p, "/snapshot"),
		strings.Contains(p, "/ports"),
		strings.Contains(p, "/page-action"):
		return TaskInstance
	default:
		return TaskAll
	}
}

// rrCounters holds round-robin positions per (node, task) so duplicate-task
// channels divide data. The key is nodeID + "\x00" + task.
var rrCounters sync.Map // string -> *uint64

func rrNext(nodeID int64, task string) uint64 {
	key := strings.Join([]string{itoa(nodeID), task}, "\x00")
	v, _ := rrCounters.LoadOrStore(key, new(uint64))
	ctr, _ := v.(*uint64)
	if ctr == nil {
		ctr = new(uint64)
		rrCounters.Store(key, ctr)
	}
	return atomic.AddUint64(ctr, 1) - 1
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// ResolveChannel picks the active channel for (task) from the node's list:
// exact-task rows win; otherwise catch-all (all) rows apply. Duplicates
// divide via round-robin. Returns the chosen channel and true, or false when
// no row covers the task (caller uses the mode default: auto with fallback).
func ResolveChannel(channels []models.WssChannel, task string) (models.WssChannel, bool) {
	task = strings.ToLower(strings.TrimSpace(task))
	if task == "" {
		task = TaskAll
	}
	var exact, catchAll []models.WssChannel
	for _, c := range channels {
		t := strings.ToLower(strings.TrimSpace(c.Task))
		if t == "" {
			t = TaskAll
		}
		if t == task {
			exact = append(exact, c)
		} else if t == TaskAll {
			catchAll = append(catchAll, c)
		}
	}
	pool := exact
	if len(pool) == 0 {
		pool = catchAll
	}
	if len(pool) == 0 {
		return models.WssChannel{}, false
	}
	if len(pool) == 1 {
		return pool[0], true
	}
	// Divide same-task data round-robin across the duplicates.
	idx := rrNext(pool[0].NodeID, task) % uint64(len(pool))
	return pool[idx], true
}

// RouteDecision is what the dispatcher needs for one RPC.
type RouteDecision struct {
	// PreferTunnel true means try the WSS tunnel first; false means dial
	// HTTP first. Computed from the channel's transport + connectivity.
	PreferTunnel bool
	// Fallback true means the other transport may be used on overload or
	// disconnect (emergency path).
	Fallback bool
	// Strict means failure on the preferred transport is final (no fallback).
	Strict bool
	// ChannelName is the resolved channel ("" when no row matched).
	ChannelName string
	// Transport is the resolved preference (wss/port/auto).
	Transport string
}

// LoadChannels returns the node's WSS channel rows for routing. It never
// fails hard: any DB error (including a pre-062 database without the table)
// yields nil so the caller falls back to the mode default (auto with
// emergency fallback for dual modes). The caller owns no handle to close.
func LoadChannels(nodeID int64) []models.WssChannel {
	con, err := repository.OpenDB()
	if err != nil {
		return nil
	}
	defer con.Close()
	repo := repository.NewWssChannelRepository(con)
	channels, err := repo.ListChannels(nodeID)
	if err != nil {
		return nil
	}
	return channels
}

// DecideRoute computes the transport order for one RPC in the given mode.
// channels is the node's full list (may be empty → mode defaults).
// connected reports whether the node's WSS tunnel is currently up.
func DecideRoute(mode, task string, channels []models.WssChannel, connected bool) RouteDecision {
	m := NormalizeMode(mode)
	if m == "" {
		m = "direct"
	}
	// Pure modes ignore channels.
	switch m {
	case "direct", "local_port":
		return RouteDecision{PreferTunnel: false, Fallback: false, Strict: true, Transport: TransportPort}
	case "reverse_tunnel":
		return RouteDecision{PreferTunnel: true, Fallback: false, Strict: true, Transport: TransportWSS}
	case "local_wss":
		// Tunnel preferred, HTTP fallback when down (existing behaviour).
		return RouteDecision{PreferTunnel: connected, Fallback: true, Strict: false, Transport: TransportAuto}
	case "both", "local_both":
		// Dual: consult channels.
		ch, ok := ResolveChannel(channels, task)
		if !ok {
			// No rows: auto with emergency fallback (tunnel when up).
			return RouteDecision{PreferTunnel: connected, Fallback: true, Strict: false, Transport: TransportAuto}
		}
		t := strings.ToLower(strings.TrimSpace(ch.Transport))
		if t == "" {
			t = TransportAuto
		}
		switch t {
		case TransportWSS:
			if connected {
				return RouteDecision{PreferTunnel: true, Fallback: ch.Fallback, Strict: !ch.Fallback, ChannelName: ch.Name, Transport: t}
			}
			// Tunnel down: emergency HTTP when allowed, else strict fail.
			return RouteDecision{PreferTunnel: false, Fallback: false, Strict: !ch.Fallback, ChannelName: ch.Name, Transport: t}
		case TransportPort:
			return RouteDecision{PreferTunnel: false, Fallback: ch.Fallback, Strict: !ch.Fallback, ChannelName: ch.Name, Transport: t}
		default: // auto
			return RouteDecision{PreferTunnel: connected, Fallback: true, Strict: false, ChannelName: ch.Name, Transport: t}
		}
	default:
		// Unknown mode: fail closed to direct HTTP (existing rows stay safe).
		return RouteDecision{PreferTunnel: false, Fallback: false, Strict: true, Transport: TransportPort}
	}
}
