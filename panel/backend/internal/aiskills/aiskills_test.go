package aiskills

import (
	"strings"
	"testing"
)

// Every advertised topic resolves to a compact guide that survives the
// ~4000-char tool-result cap with margin to spare.
func TestTopicsResolve(t *testing.T) {
	for _, topic := range Topics {
		d, ok := Get(topic)
		if !ok || strings.TrimSpace(d) == "" {
			t.Fatalf("topic %q must resolve", topic)
		}
		if strings.Count(d, ".") < 3 {
			t.Fatalf("topic %q needs 3+ sentences", topic)
		}
		if len(d) > 3200 {
			t.Fatalf("topic %q is %d bytes, over the 3.2KB tool-cap budget", topic, len(d))
		}
	}
}

// Blank and unknown topics fall back to the index, never to nothing.
func TestFallbacks(t *testing.T) {
	idx, ok := Get("")
	if !ok || !strings.Contains(idx, "instances") {
		t.Fatal("blank topic must return the index")
	}
	other, ok := Get("no-such-topic")
	if !ok || other != idx {
		t.Fatal("unknown topic must fall back to the index")
	}
}
