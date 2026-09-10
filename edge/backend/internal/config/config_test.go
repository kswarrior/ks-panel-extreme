package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadTOML(t *testing.T) {
	dir := t.TempDir()
	raw := "# edge config\nuuid = \"u1\"\nname = \"e1\"\npanel_url = \"https://p.example\"\ntoken = \"kse_abc\"\nlisten_port = 4041\nuse_tls_upstream = true\nheartbeat_interval = 30\nskip_verify = false\ninstances_dir = \"/data/inst\"\nconnection_mode = \"reverse_tunnel\"\n"
	p := filepath.Join(dir, "config.toml")
	if err := os.WriteFile(p, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(p)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.PanelURL != "https://p.example" || cfg.Token != "kse_abc" || cfg.ListenPort != 4041 || cfg.HeartbeatIntervalSeconds != 30 || !cfg.UseTLSUpstream || cfg.ConnectionMode != "reverse_tunnel" || cfg.InstancesDir != "/data/inst" {
		t.Fatalf("decoded wrong: %+v", cfg)
	}
	// defaults backfill
	p2 := filepath.Join(dir, "minimal.toml")
	if err := os.WriteFile(p2, []byte("panel_url = \"http://x\"\ntoken = \"kse_y\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg2, err := Load(p2)
	if err != nil {
		t.Fatalf("Load minimal: %v", err)
	}
	if cfg2.ListenPort != 4040 || cfg2.HeartbeatIntervalSeconds != 60 {
		t.Fatalf("defaults not backfilled: %+v", cfg2)
	}
	// quoted ambiguous strings stay strings
	p4 := filepath.Join(dir, "quoted.toml")
	if err := os.WriteFile(p4, []byte("panel_url = \"http://x\"\ntoken = \"kse_y\"\nname = \"on\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg4, err := Load(p4)
	if err != nil {
		t.Fatalf("Load quoted: %v", err)
	}
	if cfg4.Name != "on" {
		t.Fatalf("quoted name mismatch: %+v", cfg4)
	}
	// missing file -> ErrNotExist wrapped
	if _, err := Load(filepath.Join(dir, "nope.toml")); err == nil {
		t.Fatal("expected error for missing file")
	}
	// garbage -> parse error
	p3 := filepath.Join(dir, "bad.toml")
	_ = os.WriteFile(p3, []byte("panel_url = [unclosed\n"), 0o644)
	if _, err := Load(p3); err == nil {
		t.Fatal("expected parse error")
	}
}
