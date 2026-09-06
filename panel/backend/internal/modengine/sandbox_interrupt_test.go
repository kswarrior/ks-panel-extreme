//go:build modengine_goja

package modengine

import (
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
)

// A watchdog timer firing after Stop() nils the VM must be a silent no-op,
// not a timer-goroutine panic (unrecoverable: crashes the panel process).
func TestInterruptVMAfterStopNoPanic(t *testing.T) {
	r := &gojaRuntime{}
	r.interruptVM("hook timeout") // nil from construction: must not panic
	r.vm = goja.New()
	r.Stop()                      // nils vm
	r.interruptVM("hook timeout") // post-teardown watchdog: must not panic
	r.interruptVM("script timeout")
}

// The guard must not swallow real interrupts: an over-running script still
// gets its *InterruptedError.
func TestInterruptVMDeliversToLiveVM(t *testing.T) {
	r := &gojaRuntime{vm: goja.New()}
	done := make(chan error, 1)
	go func() {
		_, err := r.vm.RunString(`for(;;){}`)
		done <- err
	}()
	time.Sleep(100 * time.Millisecond) // let the loop spin up
	r.interruptVM("hook timeout")
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected InterruptedError, got nil")
		}
		if _, ok := err.(*goja.InterruptedError); !ok {
			t.Fatalf("expected *goja.InterruptedError, got %T (%v)", err, err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("timed out waiting for interrupt to land")
	}
}

// Teardown racing live watchdogs under -race must stay panic-free.
func TestInterruptVMConcurrentWithStop(t *testing.T) {
	r := &gojaRuntime{vm: goja.New()}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				r.interruptVM("hook timeout")
			}
		}()
	}
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.Stop()
		}()
	}
	wg.Wait()
}
