package handlers

import (
	"encoding/json"
	"testing"

	"github.com/example/kspanel/internal/models"
	"github.com/gorilla/websocket"
)

// fakeConn is never dialled — Push only needs the buffered channel; the conn
// is closed only on the slow-reader drop path, which these tests avoid by
// draining.
func newTestHubConn() *hubConn {
	return &hubConn{conn: &websocket.Conn{}, send: make(chan []byte, 16)}
}

func TestNotifyHubSubscribePushUnsubscribe(t *testing.T) {
	h := &NotifyHub{subs: map[int64]map[*hubConn]struct{}{}}
	c := &hubConn{send: make(chan []byte, 2)}
	h.Subscribe(7, c)
	if got := h.Connected(7); got != 1 {
		t.Fatalf("connected = %d, want 1", got)
	}
	h.Push(7, []byte(`{"type":"notification"}`))
	select {
	case msg := <-c.send:
		var v map[string]string
		if err := json.Unmarshal(msg, &v); err != nil || v["type"] != "notification" {
			t.Fatalf("pushed payload wrong: %s", msg)
		}
	default:
		t.Fatal("push must deliver to subscriber")
	}
	h.Unsubscribe(7, c)
	if got := h.Connected(7); got != 0 {
		t.Fatalf("connected after unsubscribe = %d, want 0", got)
	}
	// Push to nobody must not block or panic.
	h.Push(7, []byte(`x`))
	h.PushAll([]byte(`y`))
}

func TestNotifyHubIsolatesUsers(t *testing.T) {
	h := &NotifyHub{subs: map[int64]map[*hubConn]struct{}{}}
	a := &hubConn{send: make(chan []byte, 2)}
	b := &hubConn{send: make(chan []byte, 2)}
	h.Subscribe(1, a)
	h.Subscribe(2, b)
	h.Push(1, []byte(`one`))
	select {
	case <-a.send:
	default:
		t.Fatal("user 1 must receive its push")
	}
	select {
	case m := <-b.send:
		t.Fatalf("user 2 must not receive user 1's push, got %s", m)
	default:
	}
}

func TestNotificationPushWireShape(t *testing.T) {
	n := &models.Notification{ID: 3, UserID: 1, Title: "hi", Message: "m"}
	msg, err := json.Marshal(notificationPush{Type: "notification", Notification: n, Unread: 4})
	if err != nil {
		t.Fatal(err)
	}
	var back notificationPush
	if err := json.Unmarshal(msg, &back); err != nil {
		t.Fatal(err)
	}
	if back.Type != "notification" || back.Notification == nil || back.Notification.ID != 3 || back.Unread != 4 {
		t.Fatalf("wire shape wrong: %s", msg)
	}
}

func TestTicketNotifPriorityMapping(t *testing.T) {
	if ticketNotifPriority("critical") != models.NotificationPriorityCritical {
		t.Fatal("critical must map to critical")
	}
	if ticketNotifPriority("low") != models.NotificationPriorityLow {
		t.Fatal("low must map to low")
	}
	if ticketNotifPriority("medium") != models.NotificationPriorityNormal {
		t.Fatal("medium must map to normal")
	}
	if ticketNotifPriority("wat") != models.NotificationPriorityNormal {
		t.Fatal("unknown must fall back to normal")
	}
}

func TestNotifyHubSlowReaderDropIsSafe(t *testing.T) {
	h := &NotifyHub{subs: map[int64]map[*hubConn]struct{}{}}
	// Nil conn (like the other tests): shutdown must not panic and must
	// unsubscribe the slow reader instead of blocking the pusher.
	c := &hubConn{send: make(chan []byte, 1)}
	h.Subscribe(9, c)
	c.send <- []byte(`fill`)
	h.Push(9, []byte(`overflow`))
	h.Push(9, []byte(`overflow2`))
	if got := h.Connected(9); got != 0 {
		t.Fatalf("slow reader must be dropped, connected = %d", got)
	}
	// Double shutdown must be idempotent (writer defer + reader defer +
	// Push drop can all fire for the same conn).
	h.shutdown(9, c)
	h.shutdown(9, c)
}

var _ = newTestHubConn
