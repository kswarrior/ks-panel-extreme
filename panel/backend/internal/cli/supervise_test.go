package cli

import (
	"testing"
	"time"
)

func TestNextBackoffDoublesAndCaps(t *testing.T) {
	base := 2 * time.Second
	max := 60 * time.Second
	if got := nextBackoff(base, base, max, false); got != 4*time.Second {
		t.Fatalf("expected 4s, got %s", got)
	}
	if got := nextBackoff(32*time.Second, base, max, false); got != 60*time.Second {
		t.Fatalf("expected cap 60s, got %s", got)
	}
	if got := nextBackoff(60*time.Second, base, max, false); got != 60*time.Second {
		t.Fatalf("expected stay at cap, got %s", got)
	}
	if got := nextBackoff(32*time.Second, base, max, true); got != base {
		t.Fatalf("healthy run must reset to base, got %s", got)
	}
}

func TestBurstCooldown(t *testing.T) {
	now := time.Now()
	// 5 restarts inside 120s → cooldown.
	recent := []time.Time{
		now.Add(-100 * time.Second),
		now.Add(-80 * time.Second),
		now.Add(-60 * time.Second),
		now.Add(-40 * time.Second),
		now.Add(-20 * time.Second),
	}
	if got := burstCooldown(recent, now); got != superviseBurstCooldown {
		t.Fatalf("expected burst cooldown %s, got %s", superviseBurstCooldown, got)
	}
	// Spread out → no cooldown.
	old := []time.Time{
		now.Add(-10 * time.Minute),
		now.Add(-9 * time.Minute),
		now.Add(-8 * time.Minute),
		now.Add(-7 * time.Minute),
		now.Add(-6 * time.Minute),
	}
	if got := burstCooldown(old, now); got != 0 {
		t.Fatalf("expected no cooldown, got %s", got)
	}
	// Fewer than 5 → no cooldown.
	if got := burstCooldown(recent[:3], now); got != 0 {
		t.Fatalf("expected no cooldown for <5 restarts, got %s", got)
	}
}

func TestSuperviseCmdRegistered(t *testing.T) {
	found := false
	for _, c := range rootCmd.Commands() {
		if c.Name() == "supervise" {
			found = true
		}
	}
	if !found {
		t.Fatal("supervise command must be registered on rootCmd")
	}
}
