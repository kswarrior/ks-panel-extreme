// Package sysinfo collects operational statistics about the host the
// panel is running on and exposes them to the dashboard in a single
// Host snapshot.
//
// All readers are local — no shelling out to free/df/top/UPS tools.
// Linux reads /proc/meminfo, /proc/uptime, /proc/stat, /proc/cpuinfo
// and /proc/mounts directly via os.ReadFile (no exec), so the panel
// works on slim containers (distroless, scratch) where those binaries
// don't exist. Non-Linux platforms return partial info populated from
// the Go runtime only.
//
// Two entry points:
//   - Local() returns one full Host snapshot (RAM/disk/kernel/CPU/model/
//     uptime/load/network/disk mounts/Go runtime).
//   - LocalSeries() returns the rolling time-series populated by the
//     background sampler — last 60s of CPU %, RAM used MB and RAM %.
//     The sampler is started once via Start() in runLaunch.
package sysinfo

import (
	"os"
	"runtime"
	"sync"
	"time"
)

// Host is one full "this panel is running on..." snapshot. The dashboard
// consumes this object as a single tile grid plus a series of charts.
// Fields are zero-values (not omitted in JSON) so the React component
// always sees a stable shape; renderers substitute em-dash for empty.
type Host struct {
	CapturedAt time.Time `json:"captured_at"`

	// Identification ---------------------------------------------------------
	Hostname string `json:"hostname"`
	OS       string `json:"os"`     // runtime.GOOS
	Platform string `json:"platform"`
	Kernel   string `json:"kernel"` // e.g. "5.15.0-…"
	Arch     string `json:"arch"`

	// CPU model + cores + per-core load -------------------------------------
	CPUModel   string    `json:"cpu_model"`
	CPUCores   int       `json:"cpu_cores"`
	CPUPercent float64   `json:"cpu_percent"`     // most-recent sample (instantaneous load)
	Load1      float64   `json:"load1"`
	Load5      float64   `json:"load5"`
	Load15     float64   `json:"load15"`
	PerCore    []float64 `json:"per_core"`        // per-core CPU% since last sample

	// Memory ------------------------------------------------------------------
	RAMTotalMB  float64 `json:"ram_total_mb"`
	RAMUsedMB   float64 `json:"ram_used_mb"`
	RAMUsedPct  float64 `json:"ram_used_pct"`
	RAMAvailMB  float64 `json:"ram_avail_mb"`
	RAMCachedMB float64 `json:"ram_cached_mb"`
	RAMBuffMB   float64 `json:"ram_buffers_mb"`
	SwapTotalMB float64 `json:"swap_total_mb"`
	SwapUsedMB  float64 `json:"swap_used_mb"`
	SwapUsedPct float64 `json:"swap_used_pct"`

	// Disk for the panel's working directory ---------------------------------
	DiskPath    string  `json:"disk_path"`
	DiskTotalGB float64 `json:"disk_total_gb"`
	DiskUsedGB  float64 `json:"disk_used_gb"`
	DiskFreeGB  float64 `json:"disk_free_gb"`
	DiskUsedPct float64 `json:"disk_used_pct"`

	// Other mount points, useful when the operator wants context ----------
	Mounts []DiskMount `json:"mounts"`

	// Network ----------------------------------------------------------------
	Interfaces []NetInterface `json:"interfaces"`
	Addrs      []string       `json:"addrs"` // non-loopback IPv4/IPv6, sorted

	// Process / uptime ------------------------------------------------------
	UptimeSec     int64 `json:"uptime_sec"`      // host uptime if readable, else process uptime
	ProcessUptime int64 `json:"process_uptime"`  // always process uptime
	PID           int   `json:"pid"`             // panel process PID

	// Go runtime ------------------------------------------------------------
	GoVer       string  `json:"go_version"`
	Goroutines  int     `json:"goroutines"`
	HeapAllocMB float64 `json:"heap_alloc_mb"`
	HeapSysMB   float64 `json:"heap_sys_mb"`
	SysMB       float64 `json:"sys_mb"`
	NumGC       uint32  `json:"num_gc"`

	// Panel process ---------------------------------------------------------
	PanelCPUPercent float64 `json:"panel_cpu_percent"`
	PanelRAMUsedMB  float64 `json:"panel_ram_used_mb"`
	PanelRAMTotalMB float64 `json:"panel_ram_total_mb"`
	PanelRAMUsedPct float64 `json:"panel_ram_used_pct"`
}

// DiskMount describes a single mounted filesystem. Field set is best-
// effort; not all platforms populate all columns.
type DiskMount struct {
	Device  string  `json:"device"`
	Path    string  `json:"path"`
	FSType  string  `json:"fs_type"`
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	UsedPct float64 `json:"used_pct"`
}

// NetInterface describes one local NIC.
type NetInterface struct {
	Name  string   `json:"name"`
	MAC   string   `json:"mac"`
	MTU   int      `json:"mtu"`
	Addrs []string `json:"addrs"`
	Bytes uint64   `json:"bytes_rx"` // cumulative rx bytes (Linux only)
}

// SeriesSample is the canonical element of the rolling window the
// dashboard charts. We time-stamp with Unix seconds (UTC) so the React
// x-axis can plot it without per-row Date parsing.
type SeriesSample struct {
	UnixSec         int64   `json:"unix_sec"`
	CPUPercent      float64 `json:"cpu_percent"`
	RAMUsedMB       float64 `json:"ram_used_mb"`
	RAMUsedPct      float64 `json:"ram_used_pct"`
	Load1           float64 `json:"load1"`
	PanelCPUPercent float64 `json:"panel_cpu_percent"`
	PanelRAMUsedMB  float64 `json:"panel_ram_used_mb"`
	PanelRAMUsedPct float64 `json:"panel_ram_used_pct"`
}

// Series is the rolling window exposed to the dashboard. The window is
// implementation-configured (see Start) — the dashboard just plots.
type Series struct {
	Window     time.Duration `json:"window_ns"`  // nanoseconds (we marshal as ns to keep types tight)
	Interval   time.Duration `json:"interval_ns"`
	Samples    []SeriesSample `json:"samples"`
	Current    SeriesSample   `json:"current"`
}

// processStart is the package's wall-clock notion of when the panel
// process started. Used to compute ProcessUptime and as a fallback for
// UptimeSec on platforms that don't expose /proc/uptime (macOS, BSDs).
var (
	processStart  = time.Now()
	samplerMu     sync.RWMutex
	sampler       *ringSampler
	samplerOnceMu sync.Once
)

// ringSampler holds the rolling window for one panel process. We keep
// it deliberately simple: a fixed-size slice addressed modulo size —
// no external deps.
type ringSampler struct {
	size     int
	interval time.Duration
	next     int // index of the next write slot
	count    int // total samples written, capped at size
	samples  []SeriesSample
}

// init() is intentionally empty — we lazy-start the sampler on first
// call to Start() in launch.go so unit tests / CLI commands don't burn
// the resource on paths that don't need it.
func init() {}

func (r *ringSampler) push(s SeriesSample) {
	r.samples[r.next] = s
	r.next = (r.next + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

func (r *ringSampler) snapshot() []SeriesSample {
	if r.count == 0 {
		return nil
	}
	out := make([]SeriesSample, r.count)
	if r.count < r.size {
		copy(out, r.samples[:r.count])
	} else {
		// Buffer is full — order it oldest→newest by walking next..next+size.
		copy(out, r.samples[r.next:])
		copy(out[r.size-r.next:], r.samples[:r.next])
	}
	return out
}

// Start kicks off the background sampler. Idempotent — call as many
// times as you want, the goroutine runs once. Interval defaults to 1s
// (matches the dashboard polling rhythm but is independent). Window
// defaults to 60s (60 samples); the dashboard line chart will show one
// point per second for the last minute.
//
// Should be called from runLaunch (cli package) before the listener
// starts.
func Start() {
	StartWith(1*time.Second, 60*time.Second)
}

// StartWith lets the caller configure interval / window. We expose this
// for tests so we don't have to wait 60 wall-clock seconds to check
// that the ring is being filled.
func StartWith(interval, window time.Duration) {
	if interval <= 0 || window <= 0 {
		return
	}
	samplerOnceMu.Do(func() {
		size := int(window / interval)
		if size < 2 {
			size = 2
		}
		samplerMu.Lock()
		sampler = &ringSampler{
			size:     size,
			interval: interval,
			samples:  make([]SeriesSample, size),
		}
		samplerMu.Unlock()
		go samplerLoop(interval)
	})
}

// samplerLoop ticks once per interval and re-reads host state.
func samplerLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	// Take a "warm-up" sample right away so the first /admin/dashboard
	// call after boot already has one data point rather than waiting
	// a full tick.
	samplerMu.Lock()
	s := readOnce()
	sampler.push(s)
	samplerMu.Unlock()

	for range ticker.C {
		s = readOnce()
		samplerMu.Lock()
		sampler.push(s)
		samplerMu.Unlock()
	}
}

// readOnce pulls one fresh row of CPU/RAM/load and shapes it into a
// SeriesSample. CPU% is computed against the previous reading so the
// first call returns 0 (no baseline).
func readOnce() SeriesSample {
	h := Local()
	return SeriesSample{
		UnixSec:         time.Now().UTC().Unix(),
		CPUPercent:      h.CPUPercent,
		RAMUsedMB:       h.RAMUsedMB,
		RAMUsedPct:      h.RAMUsedPct,
		Load1:           h.Load1,
		PanelCPUPercent: h.PanelCPUPercent,
		PanelRAMUsedMB:  h.PanelRAMUsedMB,
		PanelRAMUsedPct: h.PanelRAMUsedPct,
	}
}

// Local returns one full Host snapshot. Cheap (≤1ms on a typical box);
// called once per dashboard fetch on the handler side and once per
// sampler tick on the loop side.
func Local() Host {
	h := readPlatform()
	// Fill in the bits that are usable everywhere (Go runtime + process).
	h.CapturedAt = time.Now().UTC()
	h.GoVer = runtime.Version()
	h.Goroutines = runtime.NumGoroutine()
	h.Arch = runtime.GOARCH
	h.OS = runtime.GOOS
	h.PID = os.Getpid()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	h.HeapAllocMB = mb(ms.HeapAlloc)
	h.HeapSysMB = mb(ms.HeapSys)
	h.SysMB = mb(ms.HeapSys + ms.StackSys)
	h.NumGC = ms.NumGC
	h.ProcessUptime = int64(time.Since(processStart).Seconds())
	if h.UptimeSec == 0 {
		h.UptimeSec = h.ProcessUptime
	}

	// Panel process metrics
	rssMB := readPanelRSS()
	h.PanelRAMUsedMB = rssMB
	// Use system RAM total as reference for % so the chart shows panel share of host
	if h.RAMTotalMB > 0 {
		h.PanelRAMUsedPct = 100.0 * h.PanelRAMUsedMB / h.RAMTotalMB
		h.PanelRAMTotalMB = h.RAMTotalMB
	} else {
		h.PanelRAMTotalMB = mb(ms.HeapSys)
		h.PanelRAMUsedPct = 100.0 * h.PanelRAMUsedMB / h.PanelRAMTotalMB
	}
	h.PanelCPUPercent = readPanelCPUPercent()

	return h
}

// LocalSeries returns the rolling window. Returns an empty Series (not
// nil) when the sampler hasn't started yet — lets the React side
// gracefully render "warming up…" instead of crashing on .samples.
func LocalSeries() Series {
	samplerMu.RLock()
	defer samplerMu.RUnlock()
	out := Series{
		Samples: []SeriesSample{},
	}
	if sampler == nil {
		return out
	}
	out.Window = time.Duration(sampler.size) * sampler.interval
	out.Interval = sampler.interval
	out.Samples = sampler.snapshot()
	if len(out.Samples) > 0 {
		out.Current = out.Samples[len(out.Samples)-1]
	}
	return out
}

// mb converts a uint64 byte count into a float64 megabyte count. Using
// float so the JSON wire-format is a number, not a stringified int.
func mb(b uint64) float64 {
	return float64(b) / 1024.0 / 1024.0
}
