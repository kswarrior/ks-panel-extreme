package handlers

import "testing"

// The terminal bridge classifies every frame it pumps: stdin frames that
// carry a submitted command line feed the pre/post:console.command mod
// hooks, stdout/stderr frames feed post:console.output. The two parsers
// below are the entire classification logic — a miss here either leaks
// half-typed keystrokes to mods or drops legitimate commands, so they get
// a table test.
func TestStdinCommandLine(t *testing.T) {
	cases := []struct {
		name   string
		frame  string
		want   string
		wantOK bool
	}{
		{"plain command with CRLF", `{"type":"stdin","data":"ls -la\r\n"}`, "ls -la", true},
		{"plain command with LF", `{"type":"stdin","data":"whoami\n"}`, "whoami", true},
		{"command with trailing content after newline", `{"type":"stdin","data":"uptime\r\nextra"}`, "uptime", true},
		{"pasted multiline reports first line", `{"type":"stdin","data":"pwd\nls\necho done\n"}`, "pwd", true},
		{"raw keystrokes are invisible", `{"type":"stdin","data":"sud"}`, "", false},
		{"empty entered line is skipped", `{"type":"stdin","data":"\r\n"}`, "", false},
		{"whitespace-only entered line is skipped", `{"type":"stdin","data":"   \r"}`, "", false},
		{"command is trimmed", `{"type":"stdin","data":"  echo hi  \r"}`, "echo hi", true},
		{"non-stdin frame", `{"type":"resize","cols":120}`, "", false},
		{"stdout frame is not a command", `{"type":"stdout","data":"hello\r\n"}`, "", false},
		{"invalid json", `not json`, "", false},
		{"data is not a string", `{"type":"stdin","data":42}`, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := stdinCommandLine([]byte(tc.frame))
			if ok != tc.wantOK || got != tc.want {
				t.Fatalf("stdinCommandLine(%s) = (%q, %v), want (%q, %v)", tc.frame, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

func TestOutputFrame(t *testing.T) {
	cases := []struct {
		name          string
		frame         string
		wantStream    string
		wantData      string
		wantTruncated bool
		wantOK        bool
	}{
		{"stdout", `{"type":"stdout","data":"hello"}`, "stdout", "hello", false, true},
		{"stderr", `{"type":"stderr","data":"boom"}`, "stderr", "boom", false, true},
		{"exit frame carries no console text", `{"type":"exit","code":0}`, "", "", false, false},
		{"ready frame is not output", `{"type":"ready"}`, "", "", false, false},
		{"resize frame is not output", `{"type":"resize","cols":80}`, "", "", false, false},
		{"invalid json", `{`, "", "", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stream, data, truncated, ok := outputFrame([]byte(tc.frame))
			if ok != tc.wantOK || stream != tc.wantStream || data != tc.wantData || truncated != tc.wantTruncated {
				t.Fatalf("outputFrame(%s) = (%q, %q, %v, %v), want (%q, %q, %v, %v)",
					tc.frame, stream, data, truncated, ok, tc.wantStream, tc.wantData, tc.wantTruncated, tc.wantOK)
			}
		})
	}
}

func TestOutputFrameTruncation(t *testing.T) {
	big := make([]byte, maxModConsoleData+100)
	for i := range big {
		big[i] = 'x'
	}
	frame := `{"type":"stdout","data":"` + string(big) + `"}`
	stream, data, truncated, ok := outputFrame([]byte(frame))
	if !ok || stream != "stdout" || !truncated {
		t.Fatalf("oversized frame: stream=%q truncated=%v ok=%v, want stdout/true/true", stream, truncated, ok)
	}
	if len(data) != maxModConsoleData {
		t.Fatalf("truncated data length = %d, want %d", len(data), maxModConsoleData)
	}
}
