package telemetry

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/sysinfo"
	"github.com/example/kspanel/internal/version"
	"github.com/gorilla/websocket"
)

// StatsURL is blank by default. Owner will set via env KSPANEL_STATS_URL or
// via ldflags: go build -ldflags "-X github.com/example/kspanel/internal/telemetry.StatsURL=wss://stats.example.com/ws"
var StatsURL = ""

// StatsToken optional panel auth token for stats server (env KSPANEL_STATS_TOKEN wins)
var StatsToken = ""

var once sync.Once

// remote JSON source — same file as stats/url.json (also published as stats/uil.json for typo compat).
// Panel fetches it when no local URL is configured so the owner can change the stats endpoint centrally
// via git (pushed via GitHub Action) without rebuilding/redeploying every panel.
const (
	remoteStatsURLPrimary   = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/stats/url.json"
	remoteStatsURLFallback  = "https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/main/stats/url.json"
	remoteStatsURLDirect    = "https://ks-panel-extreme-7wut.onrender.com/url.json"
	remoteStatsURLDirectAlt = "https://ks-panel-extreme-7wut.onrender.com/uil.json"
)

var (
	remoteCache    string
	remoteCacheExp time.Time
	remoteMu       sync.Mutex
)

var httpClient = &http.Client{Timeout: 6 * time.Second}

func getURL() string {
	// env wins over compiled constant so blank stays blank until owner provides
	for _, k := range []string{"KSPANEL_STATS_URL", "STATS_URL", "KSPANEL_TELEMETRY_URL", "TELEMETRY_URL"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return strings.TrimSpace(v)
		}
	}
	if v := strings.TrimSpace(StatsURL); v != "" {
		return v
	}
	// also try file fallback DataDir/stats.url (owner can echo url > there)
	if p := strings.TrimSpace(readURLFile()); p != "" {
		return p
	}
	// remote JSON fallback — owner-controlled via stats/url.json (mirrored to stats/uil.json)
	if v := strings.TrimSpace(getRemoteURL()); v != "" {
		return v
	}
	return ""
}

func getRemoteURL() string {
	remoteMu.Lock()
	defer remoteMu.Unlock()
	if time.Now().Before(remoteCacheExp) && remoteCache != "" {
		return remoteCache
	}
	// allow opt-out without code change
	if strings.TrimSpace(os.Getenv("KSPANEL_STATS_REMOTE")) == "0" || strings.TrimSpace(os.Getenv("STATS_REMOTE")) == "0" {
		return remoteCache
	}
	// allow env override of JSON location (useful for self-hosted mirrors)
	candidates := []string{remoteStatsURLPrimary, remoteStatsURLFallback, remoteStatsURLDirect, remoteStatsURLDirectAlt}
	if v := strings.TrimSpace(os.Getenv("KSPANEL_STATS_URL_JSON")); v != "" {
		candidates = []string{v}
	}
	for _, u := range candidates {
		if v := fetchRemoteOne(u); v != "" {
			remoteCache = v
			remoteCacheExp = time.Now().Add(30 * time.Minute)
			debugLog("fetched remote URL from %s -> %s", u, v)
			return remoteCache
		} else {
			debugLog("fetch remote failed %s", u)
		}
	}
	// negative cache for 1m to avoid hammering on failure, keep prior good value if any (was 5m, now 1m for faster recovery)
	if remoteCache != "" {
		remoteCacheExp = time.Now().Add(1 * time.Minute)
		return remoteCache
	}
	remoteCacheExp = time.Now().Add(1 * time.Minute)
	return ""
}

func fetchRemoteOne(u string) string {
	resp, err := httpClient.Get(u)
	if err != nil || resp == nil {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ""
	}
	// limit 64KB — stats/url.json is <1KB
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil || len(body) == 0 {
		return ""
	}
	// also accept plain string JSON "https://..."
	var plain string
	if err2 := json.Unmarshal(body, &plain); err2 == nil {
		if v := strings.TrimSpace(plain); v != "" {
			return v
		}
	}
	var data struct {
		URL      string `json:"url"`
		WS       string `json:"ws"`
		WsURL    string `json:"ws_url"`
		WsUrl    string `json:"wsUrl"`
		StatsURL string `json:"stats_url"`
		Endpoint string `json:"endpoint"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return ""
	}
	// prefer explicit ws fields (wss://.../ws), then https url
	for _, v := range []string{data.WS, data.WsURL, data.WsUrl, data.StatsURL, data.Endpoint, data.URL} {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

func getToken() string {
	for _, k := range []string{"KSPANEL_STATS_TOKEN", "STATS_TOKEN", "PANEL_TOKEN", "TELEMETRY_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return strings.TrimSpace(StatsToken)
}

func readURLFile() string {
	// hidden file: <datadir>/.stats_url  or ./stats.url
	for _, p := range []string{
		config.DataDir() + "/.stats_url",
		"./.stats_url",
		config.DataDir() + "/stats.url",
		"./stats.url",
	} {
		if b, err := os.ReadFile(p); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return v
			}
		}
	}
	return ""
}

func debugLog(format string, args ...any) {
	if strings.TrimSpace(os.Getenv("KSPANEL_STATS_DEBUG")) != "1" {
		return
	}
	msg := fmt.Sprintf(format, args...)
	log.Printf("[telemetry] %s", msg)
}

// Start launches background WSS reporter. No frontend, no logs unless debug.
func Start() {
	once.Do(func() {
		go loop()
	})
}

func loop() {
	backoff := 5 * time.Second
	for {
		rawURL := getURL()
		if rawURL == "" {
			debugLog("blank URL, sleep 15s (was 60s) before retry")
			time.Sleep(15 * time.Second)
			continue
		}
		// ensure scheme
		if !strings.HasPrefix(rawURL, "ws://") && !strings.HasPrefix(rawURL, "wss://") {
			// allow https://stats.example.com/ws -> wss://
			if strings.HasPrefix(rawURL, "https://") {
				rawURL = "wss://" + strings.TrimPrefix(rawURL, "https://")
			} else if strings.HasPrefix(rawURL, "http://") {
				rawURL = "ws://" + strings.TrimPrefix(rawURL, "http://")
			} else {
				debugLog("invalid URL %q, sleep 15s", rawURL)
				time.Sleep(15 * time.Second)
				continue
			}
		}
		// attach token if present and not already in query
		if tok := getToken(); tok != "" {
			if u, err := url.Parse(rawURL); err == nil {
				q := u.Query()
				if q.Get("token") == "" {
					q.Set("token", tok)
					u.RawQuery = q.Encode()
					rawURL = u.String()
				}
			}
		}
		debugLog("dialing %s", rawURL)
		if err := runOnce(rawURL); err != nil {
			debugLog("runOnce error for %s: %v", rawURL, err)
		}
		// reconnect backoff with jitter - max 60s (was 5m) for faster recovery after stats restart
		jitter := time.Duration(1+time.Now().UnixNano()%2) * time.Second
		time.Sleep(backoff + jitter)
		if backoff < 60*time.Second {
			backoff *= 2
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}
		}
		// reset quickly if url changed? keep backoff
		if getURL() != rawURL {
			backoff = 5 * time.Second
		}
	}
}

func runOnce(rawURL string) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.Dial(rawURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	// heartbeat loop
	if err := sendHeartbeat(conn); err != nil {
		return err
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	// also set pong handler
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})
	// reader to keep connection alive (acks + pong)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		}
	}()

	for {
		select {
		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := sendHeartbeat(conn); err != nil {
				return err
			}
		case <-done:
			return nil
		}
	}
}

type heartbeat struct {
	PanelID       string  `json:"panel_id"`
	Hostname      string  `json:"hostname"`
	Version       string  `json:"version"`
	Commit        string  `json:"commit"`
	OS            string  `json:"os"`
	Arch          string  `json:"arch"`
	GoVersion     string  `json:"go_version"`
	IP            string  `json:"ip"`
	CPUPercent    float64 `json:"cpu_percent"`
	RAMTotalMB    float64 `json:"ram_total_mb"`
	RAMUsedMB     float64 `json:"ram_used_mb"`
	RAMUsedPct    float64 `json:"ram_used_pct"`
	DiskTotalGB   float64 `json:"disk_total_gb"`
	DiskUsedGB    float64 `json:"disk_used_gb"`
	Load1         float64 `json:"load1"`
	Load5         float64 `json:"load5"`
	UptimeSec     int64   `json:"uptime_sec"`
	ProcessUptime int64   `json:"process_uptime"`
	Nodes         int     `json:"nodes"`
	Instances     int     `json:"instances"`
	InstRunning   int     `json:"instrunning"`
	Goroutines    int     `json:"goroutines"`
	CapturedAt    int64   `json:"captured_at"`
}

func sendHeartbeat(conn *websocket.Conn) error {
	h := buildHeartbeat()
	b, _ := json.Marshal(h)
	_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return conn.WriteMessage(websocket.TextMessage, b)
}

func buildHeartbeat() heartbeat {
	vi := version.Snapshot()
	host := sysinfo.Local()
	hostname := host.Hostname
	if hostname == "" {
		hostname, _ = os.Hostname()
	}
	// Counts from DB (silent on error)
	nodes, instances, running := countDB()

	return heartbeat{
		PanelID:       panelID(hostname),
		Hostname:      hostname,
		Version:       vi.Version,
		Commit:        vi.Commit,
		OS:            host.OS,
		Arch:          host.Arch,
		GoVersion:     host.GoVer,
		IP:            "", // server derives from RemoteAddr
		CPUPercent:    host.CPUPercent,
		RAMTotalMB:    host.RAMTotalMB,
		RAMUsedMB:     host.RAMUsedMB,
		RAMUsedPct:    host.RAMUsedPct,
		DiskTotalGB:   host.DiskTotalGB,
		DiskUsedGB:    host.DiskUsedGB,
		Load1:         host.Load1,
		Load5:         host.Load5,
		UptimeSec:     host.UptimeSec,
		ProcessUptime: host.ProcessUptime,
		Nodes:         nodes,
		Instances:     instances,
		InstRunning:   running,
		Goroutines:    host.Goroutines,
		CapturedAt:    host.CapturedAt.Unix(),
	}
}

var (
	cachedPanelID   string
	cachedPanelIDMu sync.Mutex
)

func panelID(hostname string) string {
	cachedPanelIDMu.Lock()
	if cachedPanelID != "" {
		defer cachedPanelIDMu.Unlock()
		return cachedPanelID
	}
	cachedPanelIDMu.Unlock()

	// env override
	if v := strings.TrimSpace(os.Getenv("KSPANEL_STATS_ID")); v != "" {
		cachedPanelIDMu.Lock()
		cachedPanelID = v
		cachedPanelIDMu.Unlock()
		return v
	}
	// persisted in settings KV: key telemetry_id (not exposed via snapshot, so hidden from frontend)
	if db, err := repository.OpenDB(); err == nil {
		var v string
		err = db.QueryRow(`SELECT value FROM settings WHERE key='telemetry_id'`).Scan(&v)
		if err == nil && strings.TrimSpace(v) != "" {
			cachedPanelIDMu.Lock()
			cachedPanelID = strings.TrimSpace(v)
			cachedPanelIDMu.Unlock()
			db.Close()
			return cachedPanelID
		}
		// generate new - use INSERT OR IGNORE to avoid duplicate key error race
		newID := genID(hostname)
		_, _ = db.Exec(`INSERT OR IGNORE INTO settings(key,value) VALUES('telemetry_id',?)`, newID)
		var check string
		if err2 := db.QueryRow(`SELECT value FROM settings WHERE key='telemetry_id'`).Scan(&check); err2 == nil && strings.TrimSpace(check) != "" {
			newID = strings.TrimSpace(check)
		} else {
			_, _ = db.Exec(`UPDATE settings SET value=? WHERE key='telemetry_id'`, newID)
		}
		db.Close()
		cachedPanelIDMu.Lock()
		cachedPanelID = newID
		cachedPanelIDMu.Unlock()
		return newID
	}
	// fallback deterministic from hostname
	id := genID(hostname)
	cachedPanelIDMu.Lock()
	cachedPanelID = id
	cachedPanelIDMu.Unlock()
	return id
}

func genID(hostname string) string {
	// stable but unique: sha256(hostname + random 8 bytes) hex 16
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	h := sha256.Sum256([]byte(hostname + hex.EncodeToString(b) + config.DataDir()))
	return hex.EncodeToString(h[:])[:16]
}

func countDB() (nodes, instances, running int) {
	db, err := repository.OpenDB()
	if err != nil {
		return 0, 0, 0
	}
	defer db.Close()
	_ = db.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&nodes)
	_ = db.QueryRow(`SELECT COUNT(*) FROM instances`).Scan(&instances)
	_ = db.QueryRow(`SELECT COUNT(*) FROM instances WHERE status IN ('running','installing')`).Scan(&running)
	if nodes < 0 {
		nodes = 0
	}
	if instances < 0 {
		instances = 0
	}
	if running < 0 {
		running = 0
	}
	return
}
