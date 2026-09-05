// Package heartbeat pushes the edge's telemetry to the panel on a fixed
// cadence. It is the only outbound dependency the edge has on the panel — the
// daemon otherwise exposes its own /health endpoint for inbound liveness
// probes.
package heartbeat

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/example/ksedge/internal/config"
	"github.com/example/ksedge/internal/telemetry"
)

// Sender periodically POSTs a telemetry snapshot to the panel's ingest
// endpoint using the shared secret stored in config. It's a tiny struct so
// we can wire a fake transport in tests later, but for now the production
// path uses a plain *http.Client.
type Sender struct {
	cfg     config.Config
	client  *http.Client
}

// New builds a Sender honouring the panel's TLS settings (use_tls_upstream +
// skip_verify so a self-signed panel still works). The Transport is tuned
// for the edge→panel single-host heartbeat profile: the panel is the only
// dial target, the request body is a tiny JSON snapshot, and a stuck /
// unreachable panel must fail fast so the next heartbeat tick (rather than
// the operator's "the card never turned green" patience) is what surfaces
// the recovery. Defaults:
//
//   - DialContext timeout 10s: covers DNS + TCP + the dial connect, so a
//     panel behind a flaky NAT or a half-open route fails the dial within
//     one heartbeat window rather than holding the goroutine + the
//     goroutine's net/http conn until Go's own default 30s dial timeout.
//   - TLSHandshakeTimeout 10s: same rationale for the TLS step.
//   - ResponseHeaderTimeout 10s: the panel must send response headers in
//     under 10s of the request being sent; the heartbeat body is tiny so
//     waiting longer can only mean the panel accepted the connection
//     and never replied — fail fast.
//   - IdleConnTimeout 120s: close idle keep-alive sockets so the agent
//     doesn't leak fds across a panel restart / TLS re-broker swap.
//   - MaxIdleConns / MaxIdleConnsPerHost = 2: a single-host heartbeat
//     only ever needs one persistent socket; the cap of two tolerates
//     the panel idle-closing one mid-flight while a second dial warms
//     up but blocks an attacker / misconfigurable client from opening
//     thousands of idle conns against the same origin.
//   - ForceAttemptHTTP2: let standard HTTP/2 negotiation kick in if the
//     panel is behind an h2c-capable front; harmless on plain http://.
//
// The http.Client Timeout stays at 10s as the hard upper bound on any
// single heartbeat so a wedged dial + wedged read still terminates within
// one tick.
func New(cfg config.Config) *Sender {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: cfg.SkipVerify},
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ResponseHeaderTimeout: 10 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		IdleConnTimeout:       120 * time.Second,
		MaxIdleConns:          2,
		MaxIdleConnsPerHost:   2,
		ForceAttemptHTTP2:     true,
	}
	return &Sender{
		cfg:    cfg,
		client: &http.Client{Timeout: 10 * time.Second, Transport: transport},
	}
}

// Run blocks until the context is cancelled, posting a heartbeat every
// interval. It is expected to be launched in its own goroutine by the CLI.
// Honoring ctx lets a SIGINT/SIGTERM to the edge tear the goroutine down
// promptly instead of relying on process exit to abort the in-flight tick.
func (s *Sender) Run(ctx context.Context) {
	interval := s.cfg.HeartbeatIntervalOr(60 * time.Second)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Fire one heartbeat immediately on startup so the panel flips the node
	// to "up" without waiting a full interval.
	s.SendOnce()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.SendOnce()
		}
	}
}

// payload is the wire format the panel's /api/nodes/heartbeat expects. The
// token ride along so the panel can authenticate the push without a session.
// The `hw_*_ok` flags mirror telemetry's per-metric success bits so the panel
// can dim individual metrics when an edge partially loses /proc access
// instead of blanking the entire card.
type payload struct {
	Token      string  `json:"token"`
	RAMUsed    int64   `json:"ram_used"`
	RAMTotal   int64   `json:"ram_total"`
	CPUPercent float64 `json:"cpu_percent"`
	DiskUsed   int64   `json:"disk_used"`
	DiskTotal  int64   `json:"disk_total"`
	UptimeSecs int64   `json:"uptime_secs"`
	Drivers    telemetry.Drivers `json:"drivers"`
	HwRAMOK    bool    `json:"hw_ram_ok"`
	HwCPUOK    bool    `json:"hw_cpu_ok"`
	HwDiskOK   bool    `json:"hw_disk_ok"`
	HwUptimeOK bool    `json:"hw_uptime_ok"`
	HwDriversOK bool   `json:"hw_drivers_ok"`
}

// SendOnce collects a fresh telemetry snapshot and POSTs it. Errors are
// logged but otherwise swallowed — a transient network blip must not kill the
// edge daemon, the next tick will retry.
func (s *Sender) SendOnce() {
	// Skip heartbeat if token is empty (localnode flow hasn't pushed real config yet)
	if s.cfg.Token == "" {
		log.Printf("heartbeat: skipped (token empty)")
		return
	}
	snap := telemetry.Collect()
	body := payload{
		Token:      s.cfg.Token,
		RAMUsed:    snap.RAMUsed,
		RAMTotal:   snap.RAMTotal,
		CPUPercent: snap.CPUPercent,
		DiskUsed:   snap.DiskUsed,
		DiskTotal:  snap.DiskTotal,
		UptimeSecs: snap.UptimeSecs,
		Drivers:    snap.Drivers,
		HwRAMOK:    snap.HwRAMOK,
		HwCPUOK:    snap.HwCPUOK,
		HwDiskOK:   snap.HwDiskOK,
		HwUptimeOK: snap.HwUptimeOK,
		HwDriversOK: snap.HwDriversOK,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		log.Printf("heartbeat: marshal error: %v", err)
		return
	}
	panelURL := strings.TrimRight(strings.TrimSpace(s.cfg.PanelURL), "/")
	url := panelURL + "/api/nodes/heartbeat"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		log.Printf("heartbeat: build request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("heartbeat: POST %s failed: %v", s.targetLog(), err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("heartbeat: panel returned %d for %s", resp.StatusCode, s.targetLog())
		return
	}
	log.Printf("heartbeat: ok (%s, node up)", s.targetLog())
}

// targetLog returns a token-redacted description of the panel for logs so the
// full secret never lands in plaintext log files.
func (s *Sender) targetLog() string {
	return s.cfg.PanelURL
}
