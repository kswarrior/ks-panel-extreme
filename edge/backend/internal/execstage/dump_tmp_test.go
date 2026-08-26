package execstage

import (
	"os"
	"testing"
)

func TestDumpScript(t *testing.T) {
	s, err := Script(nil, []File{
		{Path: "sub/$(mkdir -p /tmp/opencode/f1inject)/f.txt", Content: "hello"},
	}, "printf staged-ok\n")
	if err != nil {
		t.Fatal(err)
	}
	os.WriteFile("/tmp/opencode/script_dump.txt", []byte(s), 0o644)
}
