package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	if path == "" {
		path = "./stats.db"
	}
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	// pure Go sqlite, same as panel modernc.org/sqlite
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS panels (
		panel_id TEXT PRIMARY KEY,
		hostname TEXT,
		version TEXT,
		commit_hash TEXT,
		os TEXT,
		arch TEXT,
		go_version TEXT,
		ip TEXT,
		city TEXT,
		region TEXT,
		country TEXT,
		country_code TEXT,
		lat REAL,
		lon REAL,
		cpu_percent REAL,
		ram_total_mb REAL,
		ram_used_mb REAL,
		ram_used_pct REAL,
		disk_total_gb REAL,
		disk_used_gb REAL,
		load1 REAL,
		load5 REAL,
		uptime_sec INTEGER,
		process_uptime INTEGER,
		nodes INTEGER,
		instances INTEGER,
		instrunning INTEGER,
		goroutines INTEGER,
		first_seen DATETIME,
		last_seen DATETIME,
		raw TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_panels_last_seen ON panels(last_seen);
	`)
	return err
}

type Panel struct {
	PanelID       string    `json:"panel_id"`
	Hostname      string    `json:"hostname"`
	Version       string    `json:"version"`
	Commit        string    `json:"commit"`
	OS            string    `json:"os"`
	Arch          string    `json:"arch"`
	GoVersion     string    `json:"go_version"`
	IP            string    `json:"ip"`
	City          string    `json:"city"`
	Region        string    `json:"region"`
	Country       string    `json:"country"`
	CountryCode   string    `json:"country_code"`
	Lat           float64   `json:"lat"`
	Lon           float64   `json:"lon"`
	CPUPercent    float64   `json:"cpu_percent"`
	RAMTotalMB    float64   `json:"ram_total_mb"`
	RAMUsedMB     float64   `json:"ram_used_mb"`
	RAMUsedPct    float64   `json:"ram_used_pct"`
	DiskTotalGB   float64   `json:"disk_total_gb"`
	DiskUsedGB    float64   `json:"disk_used_gb"`
	Load1         float64   `json:"load1"`
	Load5         float64   `json:"load5"`
	UptimeSec     int64     `json:"uptime_sec"`
	ProcessUptime int64     `json:"process_uptime"`
	Nodes         int       `json:"nodes"`
	Instances     int       `json:"instances"`
	InstRunning   int       `json:"instrunning"`
	Goroutines    int       `json:"goroutines"`
	FirstSeen     time.Time `json:"first_seen"`
	LastSeen      time.Time `json:"last_seen"`
	Online        bool      `json:"online"`
}

func Upsert(hb Heartbeat, ip string, geo GeoInfo) error { return nil }

type Heartbeat struct {
	PanelID       string  `json:"panel_id"`
	Hostname      string  `json:"hostname"`
	Version       string  `json:"version"`
	Commit        string  `json:"commit"`
	OS            string  `json:"os"`
	Arch          string  `json:"arch"`
	GoVersion     string  `json:"go_version"`
	IP            string  `json:"ip"` // client may send, else server fills from RemoteAddr
	CPUPercent    float64 `json:"cpu_percent"`
	RAMTotalMB    float64 `json:"ram_total_mb"`
	RAMUsedMB     float64 `json:"ram_used_mb"`
	RAMUsedPct    float64 `json:"ram_used_pct"`
	DiskTotalGB   float64 `json:"disk_total_gb"`
	DiskUsedGB    float64 `json:"disk_used_gb"`
	Load1         float64 `json:"load1"`
	Load5         float64 `json:"load5"`
	UptimeSec     int64   `json:"uptime_sec"`
	ProcessUptime int64   `json:"process_uptime"`
	Nodes         int     `json:"nodes"`
	Instances     int     `json:"instances"`
	InstRunning   int     `json:"instrunning"`
	Goroutines    int     `json:"goroutines"`
	CapturedAt    int64   `json:"captured_at"`
}

type GeoInfo struct {
	City        string
	Region      string
	Country     string
	CountryCode string
	Lat         float64
	Lon         float64
}

func UpsertPanel(db *sql.DB, h Heartbeat, ip string, g GeoInfo, raw string) error {
	now := time.Now().UTC()
	// try update, else insert - sqlite UPSERT
	_, err := db.Exec(`
	INSERT INTO panels(panel_id, hostname, version, commit_hash, os, arch, go_version, ip, city, region, country, country_code, lat, lon,
		cpu_percent, ram_total_mb, ram_used_mb, ram_used_pct, disk_total_gb, disk_used_gb, load1, load5, uptime_sec, process_uptime,
		nodes, instances, instrunning, goroutines, first_seen, last_seen, raw)
	VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
	ON CONFLICT(panel_id) DO UPDATE SET
		hostname=excluded.hostname,
		version=excluded.version,
		commit_hash=excluded.commit_hash,
		os=excluded.os,
		arch=excluded.arch,
		go_version=excluded.go_version,
		ip=excluded.ip,
		city= CASE WHEN excluded.city!='' THEN excluded.city ELSE city END,
		region= CASE WHEN excluded.region!='' THEN excluded.region ELSE region END,
		country= CASE WHEN excluded.country!='' THEN excluded.country ELSE country END,
		country_code= CASE WHEN excluded.country_code!='' THEN excluded.country_code ELSE country_code END,
		lat= CASE WHEN excluded.lat!=0 THEN excluded.lat ELSE lat END,
		lon= CASE WHEN excluded.lon!=0 THEN excluded.lon ELSE lon END,
		cpu_percent=excluded.cpu_percent,
		ram_total_mb=excluded.ram_total_mb,
		ram_used_mb=excluded.ram_used_mb,
		ram_used_pct=excluded.ram_used_pct,
		disk_total_gb=excluded.disk_total_gb,
		disk_used_gb=excluded.disk_used_gb,
		load1=excluded.load1,
		load5=excluded.load5,
		uptime_sec=excluded.uptime_sec,
		process_uptime=excluded.process_uptime,
		nodes=excluded.nodes,
		instances=excluded.instances,
		instrunning=excluded.instrunning,
		goroutines=excluded.goroutines,
		last_seen=excluded.last_seen,
		raw=excluded.raw
	`,
		h.PanelID, h.Hostname, h.Version, h.Commit, h.OS, h.Arch, h.GoVersion, ip,
		g.City, g.Region, g.Country, g.CountryCode, g.Lat, g.Lon,
		h.CPUPercent, h.RAMTotalMB, h.RAMUsedMB, h.RAMUsedPct, h.DiskTotalGB, h.DiskUsedGB,
		h.Load1, h.Load5, h.UptimeSec, h.ProcessUptime,
		h.Nodes, h.Instances, h.InstRunning, h.Goroutines,
		now, now, raw,
	)
	return err
}

func ListPanels(db *sql.DB) ([]Panel, error) {
	rows, err := db.Query(`SELECT panel_id, hostname, version, commit_hash, os, arch, go_version, ip, city, region, country, country_code, lat, lon,
		cpu_percent, ram_total_mb, ram_used_mb, ram_used_pct, disk_total_gb, disk_used_gb, load1, load5, uptime_sec, process_uptime,
		nodes, instances, instrunning, goroutines, first_seen, last_seen FROM panels ORDER BY last_seen DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Panel
	for rows.Next() {
		var p Panel
		if err := rows.Scan(&p.PanelID, &p.Hostname, &p.Version, &p.Commit, &p.OS, &p.Arch, &p.GoVersion, &p.IP,
			&p.City, &p.Region, &p.Country, &p.CountryCode, &p.Lat, &p.Lon,
			&p.CPUPercent, &p.RAMTotalMB, &p.RAMUsedMB, &p.RAMUsedPct, &p.DiskTotalGB, &p.DiskUsedGB,
			&p.Load1, &p.Load5, &p.UptimeSec, &p.ProcessUptime,
			&p.Nodes, &p.Instances, &p.InstRunning, &p.Goroutines,
			&p.FirstSeen, &p.LastSeen); err != nil {
			continue
		}
		// online if seen within 75s (30s heartbeat + jitter)
		p.Online = time.Since(p.LastSeen) < 75*time.Second
		out = append(out, p)
	}
	if out == nil {
		out = []Panel{}
	}
	return out, rows.Err()
}
