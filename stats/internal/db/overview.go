package db

import (
	"database/sql"
	"sort"
	"time"
)

// Overview is the public, aggregate-only fleet summary used by the overview
// page. It deliberately contains no per-panel identifiers or locations.
type Overview struct {
	Total         int       `json:"total"`
	Online        int       `json:"online"`
	Offline       int       `json:"offline"`
	Nodes         int       `json:"nodes"`
	Instances     int       `json:"instances"`
	Running       int       `json:"running"`
	AvgCPU        float64   `json:"avg_cpu"`
	AvgRAM        float64   `json:"avg_ram"`
	Versions      []string  `json:"versions"`
	LatestVersion string    `json:"latest_version"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func OverviewStats(database *sql.DB) (Overview, error) {
	panels, err := ListPanels(database)
	if err != nil {
		return Overview{}, err
	}

	out := Overview{
		Versions:  make([]string, 0),
		UpdatedAt: time.Now().UTC(),
	}
	versions := make(map[string]struct{})
	for _, panel := range panels {
		out.Total++
		if panel.Online {
			out.Online++
		}
		out.Nodes += panel.Nodes
		out.Instances += panel.Instances
		out.Running += panel.InstRunning
		out.AvgCPU += panel.CPUPercent
		out.AvgRAM += panel.RAMUsedPct
		if panel.Version != "" {
			versions[panel.Version] = struct{}{}
		}
	}
	out.Offline = out.Total - out.Online
	if out.Total > 0 {
		out.AvgCPU /= float64(out.Total)
		out.AvgRAM /= float64(out.Total)
	}
	for version := range versions {
		out.Versions = append(out.Versions, version)
	}
	sort.Strings(out.Versions)
	if len(out.Versions) > 0 {
		out.LatestVersion = out.Versions[len(out.Versions)-1]
	}
	return out, nil
}
