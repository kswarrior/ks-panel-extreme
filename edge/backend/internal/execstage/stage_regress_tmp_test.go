package execstage

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// Regression F1: staged paths carrying shell metacharacters must land as
// literals, never as substitutions executed by /bin/sh.
func TestScriptHostilePathsAreLiteral(t *testing.T) {
	inject := "$(mkdir -p /tmp/opencode/f1inject)"
	files := []File{
		{Path: "sub/" + inject + "/f.txt", Content: "hello"},
		{Path: "bt`id`name.txt", Content: "x"},
	}
	script, err := Script(nil, files, "printf staged-ok\\n")
	if err != nil {
		t.Fatalf("Script: %v", err)
	}
	if strings.Contains(script, "\"$STAGE/"+inject) {
		t.Fatalf("path interpolated inside double quotes: %s", script)
	}
	os.RemoveAll("/tmp/opencode/f1inject")
	cmd := exec.Command("/bin/sh", "-c", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("script run failed: %v\nscript:\n%s\noutput:\n%s", err, script, out)
	}
	if !strings.Contains(string(out), "staged-ok") {
		t.Fatalf("command did not run cleanly: %s", out)
	}
	if _, serr := os.Stat("/tmp/opencode/f1inject"); serr == nil {
		t.Fatalf("command substitution EXECUTED — injection still possible")
	}
}

func TestScriptBenignRelativePathStillStages(t *testing.T) {
	script, err := Script(map[string]string{"GREETING": "hi 'there'"}, []File{{Path: "app/run.sh", Content: "#!/bin/sh\necho $GREETING"}}, "sh app/run.sh")
	if err != nil {
		t.Fatalf("Script: %v", err)
	}
	cmd := exec.Command("/bin/sh", "-c", script)
	out, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(out), "hi 'there'") {
		t.Fatalf("benign staging broke: err=%v out=%s\nscript:\n%s", err, out, script)
	}
}
