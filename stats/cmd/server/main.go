package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"stats/internal/auth"
	"stats/internal/db"
	"stats/internal/hub"
	"stats/internal/version"
	"stats/web"
)

func main() {
	// early --version / --help / -h (no db needed)
	for _, a := range os.Args[1:] {
		switch strings.TrimSpace(a) {
		case "--version", "-v", "version":
			fmt.Printf("ks-stats %s (commit %s, built %s)\n", version.Version, version.Commit, version.BuildDate)
			os.Exit(0)
		case "--help", "-h", "help":
			fmt.Printf("ks-stats %s — private panel telemetry\n\nUsage:\n  ks-stats [--port 3000] [--port=3000]\n  STATS_PORT=3000 ks-stats\n  PORT=3000 ks-stats\n\nEnv:\n  STATS_PORT / PORT            listen port (default 9090, CLI --port wins)\n  STATS_DB / STATS_DB_PATH     sqlite path (default ./stats.db)\n  STATS_ADMIN_PASSWORD         owner dashboard password (BasicAuth admin:password)\n  STATS_ADMIN_USER             owner user (default admin)\n  STATS_PANEL_TOKEN            incoming WSS PSK (panels must send ?token=)\n\nEndpoints:\n  GET  /health                 {\"ok\":true}\n  GET  /  /login               dashboard (owner auth)\n  WSS  /ws  /api/stats/ws      panel heartbeat ingress\n  GET  /api/panels  /api/stats owner JSON\n\n", version.Version)
			os.Exit(0)
		}
	}

	port := 9090
	if v := strings.TrimSpace(os.Getenv("STATS_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			port = n
		}
	}
	if v := strings.TrimSpace(os.Getenv("PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			port = n
		}
	}
	// prefer CLI arg --port (supports --port 3000 and --port=3000)
	for i, a := range os.Args {
		if a == "--port" && i+1 < len(os.Args) {
			if n, err := strconv.Atoi(os.Args[i+1]); err == nil {
				port = n
			}
		}
		if strings.HasPrefix(a, "--port=") {
			if n, err := strconv.Atoi(strings.TrimPrefix(a, "--port=")); err == nil {
				port = n
			}
		}
	}

	dbPath := os.Getenv("STATS_DB")
	if dbPath == "" {
		dbPath = os.Getenv("STATS_DB_PATH")
	}
	if dbPath == "" {
		dbPath = "./stats.db"
	}
	sqlDB, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer sqlDB.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write([]byte(`{"ok":true}`))
	})
	// url.json for panel remote fetch debug — same as stats/url.json (mirrored to uil.json)
	// also serve as /api/url.json for robustness
	for _, p := range []string{"/url.json", "/uil.json", "/api/url.json"} {
		pp := p
		mux.HandleFunc(pp, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Write([]byte(`{"url":"https://ks-panel-extreme-7wut.onrender.com/","ws":"wss://ks-panel-extreme-7wut.onrender.com/ws","health":"https://ks-panel-extreme-7wut.onrender.com/health","api":"https://ks-panel-extreme-7wut.onrender.com/api/panels"}`))
		})
	}
	mux.HandleFunc("/ws", hub.Handler(sqlDB))
	// alias for panel client if it uses /api/stats/ws
	mux.HandleFunc("/api/stats/ws", hub.Handler(sqlDB))

	mux.HandleFunc("/api/panels", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(204)
			return
		}
		panels, err := db.ListPanels(sqlDB)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(panels)
	})
	// also owner may want raw count
	mux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(204)
			return
		}
		panels, _ := db.ListPanels(sqlDB)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"panels": panels, "count": len(panels)})
	})

	mux.HandleFunc("/login", auth.LoginHandler)
	mux.HandleFunc("/logout", auth.LogoutHandler)

	// serve embedded dashboard
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		b := web.Index()
		if len(b) == 0 {
			http.Error(w, "dashboard missing", 500)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(b)
	})

	handler := auth.Check(mux)

	addr := ":" + strconv.Itoa(port)
	log.Printf("ks-stats %s (%s) listening on %s db=%s auth=%v panel_token=%v", version.Version, version.Commit, addr, dbPath, auth.IsConfigured(), os.Getenv("STATS_PANEL_TOKEN") != "")
	// for Check linter: ensure sql import used
	_ = sql.ErrNoRows
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
