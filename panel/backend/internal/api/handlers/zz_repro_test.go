package handlers

import "testing"

// Repro: aiCaps fail-open paths (Wave 2 scope).
func TestReproAICapsFailOpen(t *testing.T) {
	qa, rd, wr := aiCaps(nil, 1)
	t.Logf("aiCaps(nil) = qa=%v read=%v write=%v (fail-open grants full tools)", qa, rd, wr)
	if !(qa && rd && wr) {
		t.Fatalf("expected current fail-open (true,true,true), got %v %v %v", qa, rd, wr)
	}
}
