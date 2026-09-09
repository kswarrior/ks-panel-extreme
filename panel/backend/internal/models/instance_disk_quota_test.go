package models

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDiskQuotaBytesMinecraftBuiltin(t *testing.T) {
	cfg := `{"limits":{"memory":"4096M","cpus":"2","disk":"10240M"}}`
	if got := DiskQuotaBytes(cfg); got != 10240*1024*1024 {
		t.Fatalf("limits.disk 10240M = %d, want %d", got, 10240*1024*1024)
	}
}

func TestDiskQuotaBytesFallbackToTemplate(t *testing.T) {
	oldInst := `{"limits":{"memory":"4096M"}}`
	tmpl := `{"limits":{"disk":"10240M"}}`
	if got := DiskQuotaBytes(oldInst); got != 0 {
		t.Fatalf("old instance without disk should be 0, got %d", got)
	}
	if got := DiskQuotaBytesWithFallback(oldInst, tmpl); got != 10240*1024*1024 {
		t.Fatalf("fallback to template = %d, want %d", got, 10240*1024*1024)
	}
}

func TestEnrichMetricsWithDiskQuotaFallback(t *testing.T) {
	raw := `{"disk_used":128000,"disk_total":154618822656}`
	cfg := `{"limits":{"disk":"10240M"}}`
	out := EnrichMetricsWithDiskQuotaFallback(raw, cfg, "")
	var m map[string]any
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		t.Fatal(err)
	}
	if int64(m["disk_total"].(float64)) != 10240*1024*1024 {
		t.Fatalf("disk_total not overwritten: %s", out)
	}
	if !strings.Contains(out, "128000") {
		t.Fatalf("disk_used must be preserved: %s", out)
	}
	// Stale cache with no instance quota falls back to template spec.
	oldOut := EnrichMetricsWithDiskQuotaFallback(raw, `{}`, `{"limits":{"disk":"10240M"}}`)
	var m2 map[string]any
	if err := json.Unmarshal([]byte(oldOut), &m2); err != nil {
		t.Fatal(err)
	}
	if int64(m2["disk_total"].(float64)) != 10240*1024*1024 {
		t.Fatalf("template fallback failed: %s", oldOut)
	}
	// No quota anywhere leaves the blob untouched.
	if got := EnrichMetricsWithDiskQuotaFallback(raw, `{}`, `{}`); got != raw {
		t.Fatalf("no-quota must be identity, got %s", got)
	}
}
