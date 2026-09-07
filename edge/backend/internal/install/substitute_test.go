package install

import "testing"

func TestSubstituteBothSyntaxes(t *testing.T) {
	env := map[string]string{"TAG": "v2", "IMAGE": "nginx:alpine"}
	got := substitute("echo {{TAG}} ${IMAGE} {{MISSING}} ${MISSING}", env)
	want := "echo v2 nginx:alpine {{MISSING}} ${MISSING}"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if out := substitute("plain command", env); out != "plain command" {
		t.Fatalf("marker-free string changed: %q", out)
	}
	if out := substitute("x", nil); out != "x" {
		t.Fatalf("nil env changed input: %q", out)
	}
}
