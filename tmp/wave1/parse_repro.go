package main

import (
	"fmt"
	"time"
)
func oldParse(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil { return t, nil }
	return time.Parse(time.RFC3339Nano, s)
}
func main(){
	cases := []string{
		"2026-09-08 12:34:56",
		"2026-09-08T12:34:56Z",
		"2026-09-08 12:34:56.123456",
		"2026-09-08 12:34:56+00:00",
		"2026-09-08 12:34:56.123456+00:00",
		"2026-09-08T12:34:56.123456789Z",
		"2026-09-08 12:34:56 +0000 UTC",
	}
	for _, c := range cases {
		_, err := oldParse(c)
		fmt.Printf("oldParse(%q) err=%v\n", c, err)
	}
}
