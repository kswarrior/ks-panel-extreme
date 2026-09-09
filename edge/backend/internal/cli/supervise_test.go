package cli

import (
	"testing"
	"time"
)

func TestEdgeNextBackoffDoublesAndCaps(t *testing.T) {
	base := 2 * time.Second
	max := 60 * time.Second
	if got := edgeNextBackoff(base, base, max, false); got != 4*time.Second {
		t.Fatalf("expected 4s, got %s", got)
	}
	if got := edgeNextBackoff(32*time.Second, base, max, false); got != 60*time.Second {
		t.Fatalf("expected cap 60s, got %s", got)
	}
	if got := edgeNextBackoff(32*time.Second, base, max, true); got != base {
		t.Fatalf("healthy run must reset to base, got %s", got)
	}
}

func TestEdgeBurstCooldown(t *testing.T) {
	now := time.Now()
	recent := []time.Time{
		now.Add(-100 * time.Second),
		now.Add(-80 * time.Second),
		now.Add(-60 * time.Second),
		now.Add(-40 * time.Second),
		now.Add(-20 * time.Second),
	}
	if got := edgeBurstCooldown(recent, now); got != edgeSuperviseBurstCooldown {
		t.Fatalf("expected burst cooldown, got %s", got)
	}
	old := []time.Time{
		now.Add(-10 * time.Minute),
		now.Add(-9 * time.Minute),
		now.Add(-8 * time.Minute),
		now.Add(-7 * time.Minute),
		now.Add(-6 * time.Minute),
	}
	if got := edgeBurstCooldown(old, now); got != 0 {
		t.Fatalf("expected no cooldown, got %s", got)
	}
}

func TestEdgeSuperviseCmdRegistered(t *testing.T) {
	root := New()
	found := false
	for _, c := range root.Commands() {
		if c.Name() == "supervise" {
			found = true
		}
	}
	if !found {
		t.Fatal("supervise command must be registered on ksedge root")
	}
}
