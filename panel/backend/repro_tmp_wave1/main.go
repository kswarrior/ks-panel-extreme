package main

import (
	"fmt"
	"time"

	"github.com/example/kspanel/internal/auth"
)

func main() {
	now := time.Now()
	t1 := auth.GenerateSessionToken(42, now)
	t2 := auth.GenerateSessionToken(42, now)
	fmt.Printf("TOKEN_SAME_SECOND_EQUAL:%v\n", t1 == t2)
	fmt.Printf("T1:%s\nT2:%s\n", t1, t2)
	uid, issued, err := auth.ValidateSessionToken(t1)
	fmt.Printf("VALIDATE uid=%d issued=%s err=%v\n", uid, issued.Format(time.RFC3339), err)
	// Sscanf strictness probe
	var v int64
	n, serr := fmt.Sscanf("42abc", "%d", &v)
	fmt.Printf("SSCANF n=%d v=%d err=%v\n", n, v, serr)
}
