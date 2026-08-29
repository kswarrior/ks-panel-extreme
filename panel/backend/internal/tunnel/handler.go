package tunnel

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"

	"github.com/example/kspanel/internal/repository"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// Handler is the public WebSocket endpoint edges dial for reverse tunnels.
// It is intentionally outside the session auth middleware — the edge
// authenticates with its per-node token carried in ?token=.
func Handler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		// Also try X-Edge-Token header for non-URL carriers.
		token = r.Header.Get("X-Edge-Token")
	}
	if token == "" {
		http.Error(w, "token is required", http.StatusUnauthorized)
		return
	}

	// Resolve node id from token. We check both token_hash (hashed) and token_plain
	// for legacy rows where hash comparison is the source of truth.
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	// Try hashed lookup first (normal path).
	hash := hashToken(token)
	var nodeID int64
	err = con.QueryRow(`SELECT id FROM nodes WHERE token_hash = ?`, hash).Scan(&nodeID)
	if err != nil {
		// Fallback: token_plain direct compare (covers rows where hashing drifted or test fixtures).
		err2 := con.QueryRow(`SELECT id FROM nodes WHERE token_plain = ?`, token).Scan(&nodeID)
		if err2 != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	log.Printf("tunnel: edge node %d connected via WSS", nodeID)
	mgr := Global()
	conn := mgr.Register(nodeID, ws)
	// Block until the read loop ends (conn closed). The read loop is running in a goroutine
	// and will clean up the manager entry. We just wait for close.
	<-conn.closed
	log.Printf("tunnel: edge node %d disconnected", nodeID)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
