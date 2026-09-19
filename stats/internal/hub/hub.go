package hub

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"stats/internal/db"
	"stats/internal/geo"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

var (
	panelTokenEnv string
	once          sync.Once
)

func panelToken() string {
	once.Do(func() {
		for _, k := range []string{"STATS_PANEL_TOKEN", "PANEL_TOKEN", "STATS_TOKEN"} {
			if v := strings.TrimSpace(os.Getenv(k)); v != "" {
				panelTokenEnv = v
				break
			}
		}
	})
	return panelTokenEnv
}

func Handler(sqlDB *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		expected := panelToken()
		if expected != "" {
			got := r.URL.Query().Get("token")
			if got == "" {
				got = r.Header.Get("X-Panel-Token")
				if got == "" {
					got = r.Header.Get("Authorization")
					got = strings.TrimPrefix(got, "Bearer ")
				}
			}
			if got != expected {
				http.Error(w, "bad panel token", http.StatusUnauthorized)
				return
			}
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("hub upgrade failed from %s: %v", geo.ClientIP(r), err)
			return
		}
		log.Printf("hub connected from %s url=%s", geo.ClientIP(r), r.URL.String())
		defer conn.Close()
		conn.SetReadLimit(1 << 20)
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
			return nil
		})
		stopPing := make(chan struct{})
		go func() {
			t := time.NewTicker(30 * time.Second)
			defer t.Stop()
			for {
				select {
				case <-t.C:
					_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						return
					}
				case <-stopPing:
					return
				}
			}
		}()
		defer close(stopPing)

		ip := geo.ClientIP(r)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				log.Printf("hub disconnect from %s: %v", ip, err)
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
			if len(msg) == 0 {
				continue
			}
			var hb db.Heartbeat
			if err := json.Unmarshal(msg, &hb); err != nil {
				continue
			}
			if strings.TrimSpace(hb.PanelID) == "" {
				hb.PanelID = strings.TrimSpace(hb.Hostname)
				if hb.PanelID == "" {
					hb.PanelID = ip
				}
			}
			realIP := ip
			if strings.TrimSpace(hb.IP) != "" && hb.IP != "127.0.0.1" && !strings.HasPrefix(hb.IP, "192.168.") {
				if realIP == "127.0.0.1" || realIP == "::1" || realIP == "" {
					realIP = hb.IP
				}
			}
			g := geo.Lookup(realIP)
			raw := string(msg)
			if err := db.UpsertPanel(sqlDB, hb, realIP, g, raw); err != nil {
				log.Printf("hub upsert failed id=%s host=%s ip=%s: %v", hb.PanelID, hb.Hostname, realIP, err)
			} else {
				log.Printf("hub heartbeat id=%s host=%s ver=%s ip=%s geo=%s", hb.PanelID, hb.Hostname, hb.Version, realIP, g.City)
			}
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"ok":true}`))
		}
	}
}
