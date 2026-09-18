package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"stats/internal/auth"
	"stats/internal/db"
	"stats/internal/hub"
)

//go:embed all:../../web
var webFS embed.FS

func main() {
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
	// prefer CLI arg --port
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
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"ok":true}`)) })
	mux.HandleFunc("/ws", hub.Handler(sqlDB))
	// alias for panel client if it uses /api/stats/ws
	mux.HandleFunc("/api/stats/ws", hub.Handler(sqlDB))

	mux.HandleFunc("/api/panels", func(w http.ResponseWriter, r *http.Request) {
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
		b, err := webFS.ReadFile("web/index.html")
		// fallback path if embed layout differs (cmd/server -> ../../web)
		if err != nil {
			// try alternative relative for when built from stats/
			b, err = os.ReadFile("web/index.html")
			if err != nil {
				http.Error(w, "dashboard missing", 500)
				return
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(b)
	})

	handler := auth.Check(mux)

	addr := ":" + strconv.Itoa(port)
	log.Printf("stats listening on %s db=%s auth=%v panel_token=%v", addr, dbPath, auth.IsConfigured(), os.Getenv("STATS_PANEL_TOKEN") != "")
	// for Check linter: ensure sql import used
	_ = sql.ErrNoRows
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
