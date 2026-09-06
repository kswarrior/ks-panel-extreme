package handlers

import (
	"errors"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// Thread titles derive from the first user turn, capped and defaulted.
func TestAIThreadTitle(t *testing.T) {
	if got := aiThreadTitle(""); got != "New chat" {
		t.Fatalf("blank title = %q", got)
	}
	if got := aiThreadTitle("  hello world  "); got != "hello world" {
		t.Fatalf("trim = %q", got)
	}
	long := strings.Repeat("a", 100)
	got := aiThreadTitle(long)
	if len(got) > 64 || !strings.HasSuffix(got, "…") {
		t.Fatalf("long title must truncate with ellipsis, got %q", got)
	}
}

// History merge: persisted window + capped client turns, user turns echoed
// back for persistence.
func TestAIBuildHistoryCaps(t *testing.T) {
	stored := []repository.AIMessage{{ID: 1, Role: "user", Content: "old"}}
	msgs := []aiChatMessage{{Role: "user", Content: "new"}}
	h, turns, err := aiBuildHistory(stored, msgs, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(h) != 2 || h[0].Content != "old" || h[1].Content != "new" {
		t.Fatalf("history wrong: %+v", h)
	}
	if len(turns) != 1 || turns[0] != "new" {
		t.Fatalf("turns wrong: %+v", turns)
	}
	if _, _, err := aiBuildHistory(nil, nil, 10); err == nil {
		t.Fatal("empty messages must fail")
	}
	many := make([]aiChatMessage, 11)
	for i := range many {
		many[i] = aiChatMessage{Role: "user", Content: "x"}
	}
	if _, _, err := aiBuildHistory(nil, many, 10); err == nil {
		t.Fatal("over-cap client turns must fail")
	}
	if _, _, err := aiBuildHistory(nil, []aiChatMessage{{Role: "system", Content: "x"}}, 10); err == nil {
		t.Fatal("system role must fail")
	}
}

// Usage audit lines round-trip through the dashboard parser.
func TestAIUsageSummaryRoundTrip(t *testing.T) {
	cfg := &repository.AIConfig{CostPer1KIn: 0.5, CostPer1KOut: 1.5}
	_ = cfg
	acc := &aiUsageAcc{}
	acc.add(aiUsage{Model: "gpt-4o-mini", Provider: "primary", In: 100, Out: 50})
	acc.add(aiUsage{Model: "gpt-4o-mini", Provider: "fallback", In: 10, Out: 5})
	if acc.provider != "primary+fallback" {
		t.Fatalf("provider = %q", acc.provider)
	}
	msg := "model=\"gpt-4o-mini\" provider=primary+fallback in=110 out=55 cost=0.1375"
	model, provider, in, out, cost, ok := aiUsageSummary(msg)
	if !ok || model != "gpt-4o-mini" || provider != "primary+fallback" || in != 110 || out != 55 || cost != 0.1375 {
		t.Fatalf("parse wrong: %q %q %d %d %f ok=%v", model, provider, in, out, cost, ok)
	}
	if _, _, _, _, _, ok := aiUsageSummary("not a usage line"); ok {
		t.Fatal("garbage must not parse")
	}
}

// Rate-limit helpers: 429s are retryable with a Retry-After hint,
// other provider errors are not.
func TestAIRateLimitHelpers(t *testing.T) {
	if !aiIsRateLimitErr(errors.New("provider HTTP 429: too many requests (retry after 20s)")) {
		t.Fatal("429 must be rate-limited")
	}
	if !aiIsRateLimitErr(errors.New("Rate Limit Exceeded")) {
		t.Fatal("rate limit text must be rate-limited")
	}
	if aiIsRateLimitErr(errors.New("provider HTTP 500: boom")) {
		t.Fatal("500 must not be rate-limited")
	}
	if got := aiRetryAfterSecs(errors.New("provider HTTP 429 (retry after 20s)")); got != 20 {
		t.Fatalf("retry-after = %d, want 20", got)
	}
	if got := aiRetryAfterSecs(errors.New("429 boom")); got != 60 {
		t.Fatalf("bare 429 defaults to 60, got %d", got)
	}
	if got := aiRetryAfterSecs(errors.New("provider HTTP 500")); got != 0 {
		t.Fatalf("non-rate-limit retry-after = %d, want 0", got)
	}
}

// Docs coverage: every advertised topic resolves to a 3+ sentence entry.
func TestAIDocsCoverage(t *testing.T) {
	for _, topic := range []string{"instances", "templates", "nodes", "instance_pages", "users", "mods", "applications", "tickets", "backups", "security", "database", "automation", "sftp", "updates", "themes", "notifications", "ai"} {
		d := aiToolGetDocs(topic)
		if strings.Count(d, ".") < 3 {
			t.Fatalf("topic %q needs 3-5 sentences, got %q", topic, d)
		}
	}
	if !strings.Contains(aiToolGetDocs(""), "security") {
		t.Fatal("index must advertise the new topics")
	}
	if got := aiToolGetDocs("no-such-topic"); !strings.Contains(got, "instances") {
		t.Fatal("unknown topics must fall back to the index")
	}
}

// Install-step summaries use the 1-based numbering users count with, and
// never inline giant values (write bodies report their length only).
func TestAITemplateStepSummary(t *testing.T) {
	got := aiTemplateStepSummary(2, map[string]any{"action": "shell", "command": "touch /mc/.install-complete"})
	if got != "#3 shell: touch /mc/.install-complete" {
		t.Fatalf("numbering/summary wrong: %q", got)
	}
	got = aiTemplateStepSummary(0, map[string]any{"action": "download", "url": "https://x/y.jar", "filename": "/mc/server.jar"})
	if !strings.Contains(got, "#1 download:") || !strings.Contains(got, "/mc/server.jar") {
		t.Fatalf("download summary wrong: %q", got)
	}
	big := strings.Repeat("z", 5000)
	got = aiTemplateStepSummary(1, map[string]any{"action": "write", "path": "/mc/eula.txt", "content": big})
	if strings.Contains(got, big[:100]) || !strings.Contains(got, "5000 chars") {
		t.Fatal("write bodies must not be inlined")
	}
}

// Spec parsing yields one numbered line per install entry, nil when there
// is no workflow.
func TestAITemplateInstallSteps(t *testing.T) {
	tmpl := &models.Template{Spec: `{"install":[{"action":"download","url":"u","filename":"f"},{"action":"shell","command":"echo hi"}]}`}
	steps := aiTemplateInstallSteps(tmpl)
	if len(steps) != 2 || !strings.HasPrefix(steps[0], "#1 ") || !strings.HasPrefix(steps[1], "#2 ") {
		t.Fatalf("steps wrong: %q", steps)
	}
	if got := aiTemplateInstallSteps(&models.Template{Spec: `{}`}); len(got) != 0 {
		t.Fatalf("empty spec must yield no steps, got %q", got)
	}
	if got := aiTemplateInstallSteps(&models.Template{Spec: `{{{`}); len(got) != 0 {
		t.Fatalf("corrupt spec must yield no steps, got %q", got)
	}
}

// Startup-command parsing: exec-form JSON arrays only, bounded size.
func TestAIParseTemplateCommand(t *testing.T) {
	arr, err := aiParseTemplateCommand(`["sh","-c","echo hi"]`)
	if err != nil || len(arr) != 3 {
		t.Fatalf("valid command rejected: %v", err)
	}
	if _, err := aiParseTemplateCommand(`"just a string"`); err == nil {
		t.Fatal("bare string must be rejected")
	}
	if _, err := aiParseTemplateCommand(`[]`); err == nil {
		t.Fatal("empty array must be rejected")
	}
	if _, err := aiParseTemplateCommand(`["ok", 42]`); err == nil {
		t.Fatal("non-string element must be rejected")
	}
	if _, err := aiParseTemplateCommand(`["", "x"]`); err == nil {
		t.Fatal("blank element must be rejected")
	}
	if _, err := aiParseTemplateCommand(`{{{`); err == nil {
		t.Fatal("garbage must be rejected")
	}
}
