package configparse

import (
	"context"
	"strings"
	"testing"
)

func TestApplyViaExecMock(t *testing.T) {
	files := map[string]string{"server.properties": "server-port=25565\n"}
	execFn := func(ctx context.Context, cmd []string) (string, string, int, error) {
		script := cmd[len(cmd)-1]
		// Read probe: cat -- 'file' 2>/dev/null; echo "__KSEXIT:$?"
		if strings.HasPrefix(script, "cat -- ") {
			return "server-port=25565\n\n__KSEXIT:0", "", 0, nil
		}
		if strings.HasPrefix(script, "test -e ") {
			return "", "", 0, nil
		}
		// Write path: heredoc script must carry the patched value.
		if strings.Contains(script, "KSEDGE_CONFIG_EOF") {
			if !strings.Contains(script, "25566") {
				t.Fatalf("write script missing patched value:\n%s", script)
			}
			files["server.properties"] = "server-port=25566\n"
			return "", "", 0, nil
		}
		return "", "", 0, nil
	}
	res, err := ApplyViaExec(context.Background(), execFn, []File{{File: "server.properties", Parser: "properties", Find: map[string]any{"server-port": "25566"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 || !res[0].Changed {
		t.Fatalf("expected changed, got %+v", res)
	}
	if files["server.properties"] != "server-port=25566\n" {
		t.Fatalf("write not applied: %q", files["server.properties"])
	}
}

func TestApplyViaExecMissingFailClosed(t *testing.T) {
	execFn := func(ctx context.Context, cmd []string) (string, string, int, error) {
		script := cmd[len(cmd)-1]
		if strings.HasPrefix(script, "cat -- ") {
			return "\n__KSEXIT:1", "", 0, nil
		}
		if strings.HasPrefix(script, "test -e ") {
			return "", "", 1, nil
		}
		t.Fatalf("no write expected for missing file, got:\n%s", script)
		return "", "", 1, nil
	}
	_, err := ApplyViaExec(context.Background(), execFn, []File{{File: "gone.properties", Parser: "properties", Find: map[string]any{"a": "b"}}})
	if err == nil {
		t.Fatal("missing file without create_if_missing must fail closed")
	}
}
