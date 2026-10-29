package db

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestOpenMigratesLegacyPanelsTable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.db")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`CREATE TABLE panels(panel_id TEXT PRIMARY KEY, last_seen DATETIME)`); err != nil {
		t.Fatal(err)
	}
	legacy.Close()

	opened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()

	rows, err := opened.Query(`PRAGMA table_info(panels)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns := map[string]bool{}
	for rows.Next() {
		var cid, notNull, pk int
		var name, typ string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		columns[name] = true
	}
	for _, name := range []string{
		"in_container",
		"container_runtime",
		"container_cpu_percent",
		"container_cpu_limit_cores",
		"container_ram_used_mb",
		"container_ram_limit_mb",
		"container_ram_used_pct",
	} {
		if !columns[name] {
			t.Fatalf("missing migrated column %q", name)
		}
	}
}

func TestUpsertAndListContainerMetrics(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stats.db")
	opened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()

	hb := Heartbeat{
		PanelID:                "panel-1",
		Hostname:               "panel-one",
		Version:                "1.0.0",
		CPUPercent:             12.5,
		RAMTotalMB:             2048,
		RAMUsedMB:              512,
		RAMUsedPct:             25,
		InContainer:            true,
		ContainerRuntime:       "docker",
		ContainerCPUPercent:    40,
		ContainerCPULimitCores: 2,
		ContainerRAMUsedMB:     256,
		ContainerRAMLimitMB:    1024,
		ContainerRAMUsedPct:    25,
	}
	geo := GeoInfo{City: "Quincy", Country: "United States", Lat: 47.2, Lon: -119.8}
	if err := UpsertPanel(opened, hb, "203.0.113.1", geo, "{}"); err != nil {
		t.Fatal(err)
	}

	panels, err := ListPanels(opened)
	if err != nil {
		t.Fatal(err)
	}
	if len(panels) != 1 {
		t.Fatalf("panels = %d, want 1", len(panels))
	}
	panel := panels[0]
	if !panel.InContainer || panel.ContainerRuntime != "docker" {
		t.Fatalf("container = %v/%q", panel.InContainer, panel.ContainerRuntime)
	}
	if panel.ContainerCPUPercent != 40 || panel.ContainerCPULimitCores != 2 {
		t.Fatalf("container cpu = %v/%v", panel.ContainerCPUPercent, panel.ContainerCPULimitCores)
	}
	if panel.ContainerRAMUsedMB != 256 || panel.ContainerRAMLimitMB != 1024 || panel.ContainerRAMUsedPct != 25 {
		t.Fatalf("container ram = %v/%v/%v",
			panel.ContainerRAMUsedMB, panel.ContainerRAMLimitMB, panel.ContainerRAMUsedPct)
	}
}
