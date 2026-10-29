package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
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
			fmt.Printf("ks-stats %s — private panel telemetry\n\nUsage:\n  ks-stats [--port 3000] [--port=3000]\n  STATS_PORT=3000 ks-stats\n  PORT=3000 ks-stats\n\nEnv:\n  ADMIN_USERNAME               admin username (default admin)\n  ADMIN_PASSWORD               admin password (required for map/table)\n  STATS_PORT / PORT            listen port (default 9090, CLI --port wins)\n  STATS_DB / STATS_DB_PATH     sqlite path (default ./stats.db)\n  STATS_PANEL_TOKEN            incoming WSS PSK (panels must send ?token=)\n\nEndpoints:\n  GET  /health                 {\"ok\":true}\n  GET  /api/overview           public fleet summary\n  GET  /api/auth/me            current admin session\n  POST /api/auth/login         admin login\n  POST /api/auth/logout        admin logout\n  GET  /  /overview            public dashboard\n  GET  /map  /table            admin dashboard pages\n  WSS  /ws  /api/stats/ws      panel heartbeat ingress\n  GET  /api/panels  /api/stats admin-only owner JSON\n\n", version.Version)
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
			w.Write([]byte(`{"url":"https://ks-panel-stats.onrender.com/","ws":"wss://ks-panel-stats.onrender.com/ws","health":"https://ks-panel-stats.onrender.com/health","api":"https://ks-panel-stats.onrender.com/api/panels"}`))
		})
	}
	mux.HandleFunc("/ws", hub.Handler(sqlDB))
	// alias for panel client if it uses /api/stats/ws
	mux.HandleFunc("/api/stats/ws", hub.Handler(sqlDB))

	mux.HandleFunc("/api/overview", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET, OPTIONS")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		summary, err := db.OverviewStats(sqlDB)
		if err != nil {
			log.Printf("overview: %v", err)
			http.Error(w, "could not load overview", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(summary)
	})

	mux.Handle("/api/panels", auth.RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET, OPTIONS")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		panels, err := db.ListPanels(sqlDB)
		if err != nil {
			log.Printf("list panels: %v", err)
			http.Error(w, "could not load panels", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(panels)
	})))
	// also owner may want raw count
	mux.Handle("/api/stats", auth.RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET, OPTIONS")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		panels, err := db.ListPanels(sqlDB)
		if err != nil {
			log.Printf("list panels: %v", err)
			http.Error(w, "could not load panels", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"panels": panels, "count": len(panels)})
	})))

	mux.HandleFunc("/api/auth/me", auth.MeHandler)
	mux.HandleFunc("/api/auth/login", auth.LoginHandler)
	mux.HandleFunc("/api/auth/logout", auth.LogoutHandler)

	// serve embedded React dashboard; unknown paths fall back to index.html (SPA)
	assets := web.Assets()
	fileServer := http.FileServer(http.FS(assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "" && name != "." {
			if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
				if strings.HasPrefix(name, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else {
					w.Header().Set("Cache-Control", "no-cache")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
			if strings.HasPrefix(name, "assets/") {
				http.NotFound(w, r)
				return
			}
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

	handler := mux

	addr := ":" + strconv.Itoa(port)
	log.Printf("ks-stats %s (%s) listening on %s db=%s auth=%v panel_token=%v", version.Version, version.Commit, addr, dbPath, auth.IsConfigured(), os.Getenv("STATS_PANEL_TOKEN") != "")
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
