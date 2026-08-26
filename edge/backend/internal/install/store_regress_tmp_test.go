package install

import (
	"sync"
	"sync/atomic"
	"testing"
)

// Regression F6: store.begin must refuse a second claim while a workflow is
// running, atomically.
func TestStoreBeginRefusesConcurrentStart(t *testing.T) {
	s := newStore()
	rec, ok := s.begin("docker:mc-1", nil)
	if !ok || rec == nil {
		t.Fatal("first begin refused")
	}
	if _, ok := s.begin("docker:mc-1", nil); ok {
		t.Fatal("second begin while running was allowed (TOCTOU regression)")
	}
	rec.mu.Lock()
	rec.state = StateDone
	rec.mu.Unlock()
	rec2, ok := s.begin("docker:mc-1", []StepStatus{{Index: 0, Status: stepPending}})
	if !ok {
		t.Fatal("begin after completion refused")
	}
	rec2.mu.RLock()
	defer rec2.mu.RUnlock()
	if rec2.state != StateRunning || len(rec2.steps) != 1 || rec2.steps[0].Status != stepPending {
		t.Fatalf("record not reset: %+v", *rec2)
	}
	var wg sync.WaitGroup
	var refused int64
	s.begin("lxd:c", nil)
	wg.Add(8)
	for i := 0; i < 8; i++ {
		go func() {
			defer wg.Done()
			if _, ok := s.begin("lxd:c", nil); !ok {
				atomic.AddInt64(&refused, 1)
			}
		}()
	}
	wg.Wait()
	if refused != 8 {
		t.Fatalf("expected all 8 concurrent claims refused, got %d", refused)
	}
}
