package handlers

import (
	"testing"

	"github.com/example/kspanel/internal/repository"
)

// TEMPORARY repro: mirrors AITestHandler probe lines verbatim
// (ai_chat_handler.go) against the real repository.AIConfig type.
func TestZZProbeAliasRepro(t *testing.T) {
	cfg := &repository.AIConfig{MaxTokens: 5}
	// --- begin verbatim handler lines ---
	probe := cfg
	probe.MaxTokens = 16
	if probe.MaxTokens > cfg.MaxTokens {
		probe.MaxTokens = cfg.MaxTokens
	}
	// --- end verbatim handler lines ---
	t.Logf("probe.MaxTokens=%d cfg.MaxTokens=%d", probe.MaxTokens, cfg.MaxTokens)
	if probe.MaxTokens != 5 {
		t.Fatalf("REPRO: admin MaxTokens=5, probe sends %d (want 5); cfg mutated to %d", probe.MaxTokens, cfg.MaxTokens)
	}
}
