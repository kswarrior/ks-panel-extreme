package configparse

import (
  "context"
  "testing"
)

func TestApplyViaExecMock(t *testing.T) {
  files := map[string]string{"server.properties": "server-port=25565\n"}
  execFn := func(ctx context.Context, cmd []string) (string, string, int, error) {
    script := cmd[len(cmd)-1]
    // cat probe
    if len(script) >= 3 && script[:3] == "cat" {
      // crude: if asking for our file, return content + marker handling is done by caller script
      // The real script is: cat -- 'file' 2>/dev/null; echo "__KSEXIT:$?"
      // Simulate success:
      return "server-port=25565\n\n__KSEXIT:0", "", 0, nil
    }
    if len(script) >= 4 && script[:4] == "test" {
      return "", "", 0, nil
    }
    // write script contains heredoc: capture content between marker lines is complex; just accept
    if contains(script, "KSEDGE_CONFIG_EOF") {
      // extract content between first marker line and last marker? Simplified: check it contains patched value
      if !contains(script, "25566") {
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

func contains(s, sub string) bool {
  return len(s) >= len(sub) && (func() bool {
    for i := 0; i+len(sub) <= len(s); i++ {
      if s[i:i+len(sub)] == sub {
        return true
      }
    }
    return false
  })()
}
