package telemetry

import (
	"sync"
	"testing"
)

func TestRaceReproConcurrentCollect(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				Collect()
			}
		}()
	}
	wg.Wait()
}
