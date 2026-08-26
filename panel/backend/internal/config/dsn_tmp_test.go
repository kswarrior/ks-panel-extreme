package config

import (
	"fmt"
	"testing"
)

func TestTmpMySQLEscape(t *testing.T) {
	got, ok := BuildDSNFromURL("mysql", "127.0.0.1", "ks@weird:user", "p@ss:w/o/rd(x)", "kspanel")
	fmt.Printf("DSN=%q ok=%v\n", got, ok)
}
