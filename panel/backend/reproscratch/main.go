package main

import (
	"fmt"
	"os"
	"time"

	"github.com/example/kspanel/internal/security"
)

func main() {
	s := &security.State{}
	t0 := time.Unix(1700000000, 0)
	for i := 0; i < 100; i++ {
		s.RecordGlobalHit(t0)
	}
	sum := s.RecordGlobalHit(t0.Add(70 * time.Second))
	fmt.Println("sum after 70s gap:", sum, "(want 1: only the new hit)")
	if sum != 1 {
		fmt.Println("BUG REPRODUCED: ancient buckets never expired")
		os.Exit(1)
	}
	fmt.Println("OK: stale buckets expired")
}
