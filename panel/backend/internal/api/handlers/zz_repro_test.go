package handlers

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func TestReproCompoundExt(t *testing.T) {
	for _, f := range []string{"a.tar.gz", "b.tar.zst", "c.db.gz", "d.tar"} {
		stored := strings.TrimSuffix(f, filepath.Ext(f)) + "-retry" + filepath.Ext(f)
		fmt.Printf("in=%q ext=%q out=%q\n", f, filepath.Ext(f), stored)
	}
	s, tot, _ := parseContentRange("bytes 0-0/100")
	fmt.Printf("parse end-ignored: start=%d total=%d (end 0 discarded)\n", s, tot)
}
