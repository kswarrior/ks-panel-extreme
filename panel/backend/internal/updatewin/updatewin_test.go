package updatewin

import (
	"testing"
	"time"
)

func TestValidateCronAcceptsFiveField(t *testing.T) {
	for _, expr := range []string{"0 3 * * *", "*/15 * * * *", "0 22 * * 1-5"} {
		if err := ValidateCron(expr); err != nil {
			t.Fatalf("%q must validate: %v", expr, err)
		}
	}
}

func TestValidateCronRejectsBad(t *testing.T) {
	for _, expr := range []string{"", "0 3 * *", "not a cron", "* * * * * *"} {
		if err := ValidateCron(expr); err == nil {
			t.Fatalf("%q must not validate", expr)
		}
	}
}

func TestInWindowDayRange(t *testing.T) {
	at := func(h, m int) time.Time {
		return time.Date(2026, 9, 4, h, m, 0, 0, time.UTC)
	}
	if !InWindow(at(3, 0), "02:00", "04:00") {
		t.Fatal("03:00 must be inside 02:00-04:00")
	}
	if InWindow(at(5, 0), "02:00", "04:00") {
		t.Fatal("05:00 must be outside 02:00-04:00")
	}
	// Boundaries inclusive.
	if !InWindow(at(2, 0), "02:00", "04:00") || !InWindow(at(4, 0), "02:00", "04:00") {
		t.Fatal("window bounds must be inclusive")
	}
}

func TestInWindowOvernightWrap(t *testing.T) {
	at := func(h, m int) time.Time {
		return time.Date(2026, 9, 4, h, m, 0, 0, time.UTC)
	}
	for _, hm := range [][2]int{{23, 30}, {0, 30}, {5, 59}} {
		if !InWindow(at(hm[0], hm[1]), "22:00", "06:00") {
			t.Fatalf("%02d:%02d must be inside overnight 22:00-06:00", hm[0], hm[1])
		}
	}
	if InWindow(at(12, 0), "22:00", "06:00") {
		t.Fatal("12:00 must be outside overnight 22:00-06:00")
	}
}

func TestInWindowUnbounded(t *testing.T) {
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	if !InWindow(now, "", "") {
		t.Fatal("empty window must always be inside")
	}
	if !InWindow(now, "02:00", "") {
		t.Fatal("open-ended start must cover later hours")
	}
	if InWindow(now, "13:00", "") {
		t.Fatal("open-ended start must exclude earlier hours")
	}
}

func TestInWindowFailsClosedOnGarbage(t *testing.T) {
	now := time.Now().UTC()
	if InWindow(now, "99:99", "04:00") {
		t.Fatal("corrupt bounds must fail closed")
	}
}

func TestNextRunArmsFuture(t *testing.T) {
	from := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	next := NextRun("0 3 * * *", from)
	if next.IsZero() || !next.After(from) {
		t.Fatalf("expected future next run, got %v", next)
	}
	if next.Hour() != 3 || next.Minute() != 0 {
		t.Fatalf("expected 03:00 slot, got %v", next)
	}
	if got := NextRun("garbage", from); !got.IsZero() {
		t.Fatalf("invalid cron must arm zero time, got %v", got)
	}
}
