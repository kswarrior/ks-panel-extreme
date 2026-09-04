package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/gorilla/websocket"
)

// notification_hub.go — realtime fan-out for the NotificationBell.
//
// The bell used to poll /unread-count every 20s. It now holds a WebSocket
// against NotificationStreamHandler (same gorilla/websocket upgrader + same
// session-cookie auth as the terminal bridge) and falls back to polling
// when the socket drops. EmitNotification/EmitBroadcast push into
// GlobalNotifyHub after the DB row lands, so the bell updates instantly.
//
// Delivery preference (notification_prefs.mode, 065) gates the push:
// realtime + digest → push now (digest users get the daily summary mail
// on top), off → no push. Email follows the same gate via
// repository.ShouldEmailUser (realtime immediate; digest via sweep).

// hubConn is one subscribed browser tab.
type hubConn struct {
	conn *websocket.Conn
	send chan []byte
}

// NotifyHub fans notification payloads out to connected users. A push never
// blocks the HTTP handler: each conn has a buffered channel and a slow
// reader is dropped instead of stalling the sweep.
type NotifyHub struct {
	mu   sync.RWMutex
	subs map[int64]map[*hubConn]struct{}
}

// GlobalNotifyHub is the process-wide fan-out point.
var GlobalNotifyHub = &NotifyHub{subs: map[int64]map[*hubConn]struct{}{}}

// Subscribe registers conn for uid.
func (h *NotifyHub) Subscribe(uid int64, c *hubConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[uid] == nil {
		h.subs[uid] = map[*hubConn]struct{}{}
	}
	h.subs[uid][c] = struct{}{}
}

// Unsubscribe removes conn for uid.
func (h *NotifyHub) Unsubscribe(uid int64, c *hubConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[uid] == nil {
		return
	}
	delete(h.subs[uid], c)
	if len(h.subs[uid]) == 0 {
		delete(h.subs, uid)
	}
}

// Connected returns how many tabs uid currently has subscribed (exported
// for tests).
func (h *NotifyHub) Connected(uid int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[uid])
}

// Push delivers msg to every tab of uid. Slow readers are dropped.
func (h *NotifyHub) Push(uid int64, msg []byte) {
	h.mu.RLock()
	conns := make([]*hubConn, 0, len(h.subs[uid]))
	for c := range h.subs[uid] {
		conns = append(conns, c)
	}
	h.mu.RUnlock()
	for _, c := range conns {
		select {
		case c.send <- msg:
		default:
			h.Unsubscribe(uid, c)
			_ = c.conn.Close()
		}
	}
}

// PushAll delivers msg to every connected user (broadcast path).
func (h *NotifyHub) PushAll(msg []byte) {
	h.mu.RLock()
	type sub struct {
		uid int64
		c   *hubConn
	}
	var all []sub
	for uid, set := range h.subs {
		for c := range set {
			all = append(all, sub{uid, c})
		}
	}
	h.mu.RUnlock()
	for _, s := range all {
		select {
		case s.c.send <- msg:
		default:
			h.Unsubscribe(s.uid, s.c)
			_ = s.c.conn.Close()
		}
	}
}

// notificationPush is the wire shape the bell consumes.
type notificationPush struct {
	Type         string               `json:"type"`
	Notification *models.Notification `json:"notification,omitempty"`
	Unread       int                  `json:"unread"`
}

// pushAndMailNotification pushes one freshly-created notification row to
// the recipient's tabs (realtime + digest; off gets inbox only) and queues
// the immediate email when ShouldEmailUser passes (address present, opted
// in, realtime). Digest users get the WS push now and the daily summary
// mail from the scheduler sweep; off users see the inbox row on next open.
// Failures never propagate — notifications must not break the action that
// caused them.
func pushAndMailNotification(con *sql.DB, repo *repository.NotificationRepository, userID, notifID int64) {
	n, err := repo.Get(notifID, userID)
	if err != nil || n == nil {
		return
	}
	unread, _ := repo.UnreadCount(userID)
	prefs, err := repository.NewNotificationPrefsRepository(con).Get(userID)
	if err != nil {
		prefs = nil
	}
	mode := models.NotificationModeRealtime
	if prefs != nil {
		mode = prefs.Mode
	}
	if mode == models.NotificationModeRealtime || mode == models.NotificationModeDigest {
		msg, merr := json.Marshal(notificationPush{Type: "notification", Notification: n, Unread: unread})
		if merr == nil {
			GlobalNotifyHub.Push(userID, msg)
		}
	}
	if mode == models.NotificationModeRealtime {
		if to, ok := repository.ShouldEmailUser(con, userID); ok {
			repository.EnqueueMail(repository.MailJob{
				UserID:  userID,
				To:      to,
				Subject: n.Title,
				Body:    n.Message,
			})
		}
	}
	// off: inbox row only. digest: pushed above + daily summary mail from
	// the scheduler sweep.
}

// NotificationStreamHandler upgrades the caller's bell to a WebSocket.
// AuthMiddleware runs first (session cookie, like the terminal bridge —
// browsers can't set Authorization headers on WS handshakes, so the cookie
// is the credential; multi-account secondaries keep polling).
func NotificationStreamHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	hc := &hubConn{conn: conn, send: make(chan []byte, 16)}
	GlobalNotifyHub.Subscribe(uid, hc)
	defer func() {
		GlobalNotifyHub.Unsubscribe(uid, hc)
		_ = conn.Close()
	}()

	// Reader: the bell only sends pings; any read error (close, timeout)
	// ends the subscription. Pong extends the read deadline.
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})
	go func() {
		defer conn.Close()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Writer: ping every 30s so NATs/proxies keep the socket alive.
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-hc.send:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// GetNotificationPrefsHandler returns the caller's delivery prefs.
func GetNotificationPrefsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	p, err := repository.NewNotificationPrefsRepository(con).Get(uid)
	if err != nil {
		log.Println("GetNotificationPrefs error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, p)
}

// SetNotificationPrefsHandler updates the caller's delivery prefs
// (mode realtime|digest|off + email opt-out).
func SetNotificationPrefsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		Mode        string `json:"mode"`
		EmailOptOut bool   `json:"email_opt_out"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	p, err := repository.NewNotificationPrefsRepository(con).Set(uid, req.Mode, req.EmailOptOut)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, p)
}
