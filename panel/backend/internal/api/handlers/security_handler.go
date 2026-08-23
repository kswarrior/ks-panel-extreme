package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"strconv"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/security"
	"github.com/example/kspanel/internal/sysinfo"
)

// securityWindow is the aggregate window the Security page uses for its
// cumulatives. 5 minutes is long enough that the top-IP and per-country
// buckets reflect a real attack pattern rather than a single noisy second,
// but short enough that the table scan stays cheap on a busy panel.
const securityWindow = 5 * time.Minute

// SecuritySnapshotHandler aggregates the security_requests feed into the
// single response shape the Security admin page (admin/security) renders.
// ACCESS_ADMIN_PANEL-gated like DashboardSnapshotHandler; the page is
// read-only so no second gate is needed. One round-trip carries every tile
// the React side renders so the page can paint in a single fetch and
// refresh on an interval without re-querying.
func SecuritySnapshotHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewSecurityRepository(con)
	snap, err := repo.Snapshot(securityWindow)
	if err != nil {
		log.Println("security snapshot:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// Fill the defense-service CPU/memory figures from the running Go
	// process. The "protection service" the page surfaces is the panel
	// itself (the middleware that fronts every request), so its resource
	// footprint IS the panel's goroutine + heap set; using runtime stats
	// keeps the page honest without a separate telemetry pipeline.
	snap.DefenseCPU = int64(sysinfo.Local().CPUPercent)
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	if ms.Sys > 0 {
		snap.DefenseMemory = int64(float64(ms.Alloc) / float64(ms.Sys) * 100.0)
	}

	// Surface the TCP-level DDoS drop counters from the listener wrapper
	// so the admin page can show how many connections were hard-refused
	// at the socket layer during the current/prior auto-stops.
	snap.DDOSTCPAccepted, snap.DDOSTCPDropped = security.DDoSListenerStats()

	// Surface the live port-switch state so the admin page can show
	// which port the panel is actually serving on and whether a DDoS
	// reaction moved it off the launch port.
	snap.DDOSActivePort, snap.DDOSPortSwitched, snap.DDOSPortError = security.PortStatus()

	writeJSON(w, snap)
}

// SecurityToggleAttackHandler flips the persisted Attack Status flag (the
// "Under Attack / Normal" toggle on the Security page) and persists it in
// the settings KV so a panel restart keeps the current state. The handler
// returns the resulting flag so the SPA can update its UI without a
// re-fetch of the whole snapshot.
//
// It also tells the in-memory SecurityState to reload so the very next
// request picks up the new toggle — that contract is what makes the
// switch feel instant rather than only-after-snapshot-refetch.
func SecurityToggleAttackHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UnderAttack bool `json:"under_attack"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)
	if err := repo.SetUnderAttack(req.UnderAttack); err != nil {
		log.Println("security set attack:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Push the new toggle into the live middleware state so the next
	// request sees the right global-RPM verdict without waiting for
	// the next security-config PUT to call Reload.
	if s := security.Get(); s != nil {
		s.Reload()
	}
	writeJSON(w, map[string]bool{"under_attack": req.UnderAttack})
}

// SecurityGetConfigHandler returns the persisted security config (per-IP
// RPM cap, rolling window, global RPM ceiling, unknown-UA toggle) in the
// same shape the PUT endpoint echoes back. Kept distinct from
// SecuritySnapshotHandler because: (1) the snapshot already carries the
// config embedded in its `config` field, so the dedicated endpoint exists
// only for the rare case the SPA wants the config alone without the
// telemetry; (2) keeping it separate lets us version the two shapes
// independently if the snapshot ever grows a second view.
func SecurityGetConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)
	c := repo.GetConfig()
	writeJSON(w, c)
}

// SecurityUpdateConfigHandler accepts the security-rate config PUT. The
// body is the same shape SecurityGetConfigHandler returns; the handler
// clamps numbers to safe ranges (window >= 1s, RPM >= 0) before passing
// them to the repository so an errant UI input can't accidentally disable
// the limiter by setting a 0-second window.
//
// After the upsert succeeds the handler calls SecurityState.Reload so the
// very next request is judged against the new thresholds — no panel
// restart required.
func SecurityUpdateConfigHandler(w http.ResponseWriter, r *http.Request) {
	var req models.SecurityConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Clamp to safe ranges. We only EVER clamp upward/downward toward a
	// safe value so the admin can never set a window of "0" (which would
	// make the limiter always block) or a negative number.
	if req.WindowSecondsLimit < 1 {
		req.WindowSecondsLimit = 60
	}
	if req.WindowSecondsLimit > 3600 {
		req.WindowSecondsLimit = 3600
	}
	if req.RequestsPerMinuteLimit < 0 {
		req.RequestsPerMinuteLimit = 0
	}
	if req.GlobalRPMLimit < 0 {
		req.GlobalRPMLimit = 0
	}
	if req.DDOSStopMinutes < 1 {
		req.DDOSStopMinutes = 1
	}
	if req.DDOSStopMinutes > 1440 {
		req.DDOSStopMinutes = 1440 // max 24 hours
	}
	if req.DDOSMaxStopCount < 0 {
		req.DDOSMaxStopCount = 0
	}
	// DDoS reaction mode: anything unknown falls back to the safe
	// "stop" default so a malformed payload can't arm a mode this build
	// doesn't implement (fail closed).
	if req.DDOSMode != models.DDOSModePortSwitch && req.DDOSMode != models.DDOSModeStop {
		req.DDOSMode = models.DDOSModeStop
	}
	// Alternate port must be a real TCP port; in port_switch mode it is
	// REQUIRED and must differ from the port the panel currently serves,
	// otherwise the reaction would try to re-bind onto itself.
	if req.DDOSAltPort < 0 || req.DDOSAltPort > 65535 {
		http.Error(w, "ddos_alt_port must be between 0 and 65535", http.StatusBadRequest)
		return
	}
	if req.DDOSGlobalTriggerHits < 0 {
		req.DDOSGlobalTriggerHits = 0
	}
	if req.DDOSGlobalTriggerWindow < 5 {
		req.DDOSGlobalTriggerWindow = 5
	}
	if req.DDOSGlobalTriggerWindow > 60 {
		req.DDOSGlobalTriggerWindow = 60
	}
	// Firewall / WAF knobs. Body size must stay >= 1 MB so a typo cannot
	// make the panel reject every mutation; sessions must keep a real
	// lifetime (a 0-minute session would log everyone out instantly).
	if req.MaxBodySizeMB < 1 {
		req.MaxBodySizeMB = 1
	}
	if req.MaxBodySizeMB > 1024 {
		req.MaxBodySizeMB = 1024
	}
	if req.SessionLifetimeMinutes < 1 {
		req.SessionLifetimeMinutes = 480
	}
	if req.SessionLifetimeMinutes > 10080 {
		req.SessionLifetimeMinutes = 10080 // max 7 days
	}
	if req.SessionIdleTimeoutMinutes < 1 {
		req.SessionIdleTimeoutMinutes = 1440
	}
	if req.SessionIdleTimeoutMinutes > 43200 {
		req.SessionIdleTimeoutMinutes = 43200 // max 30 days
	}
	if req.SessionMaxPerUser < 0 {
		req.SessionMaxPerUser = 0
	}
	if req.DDOSMode == models.DDOSModePortSwitch {
		if req.DDOSAltPort < 1 {
			http.Error(w, "ddos_alt_port is required when ddos_mode is port_switch", http.StatusBadRequest)
			return
		}
		settingsRepo := repository.NewSettingsRepository(con)
		if current := settingsRepo.PanelPort(); current > 0 && int(req.DDOSAltPort) == current {
			http.Error(w, "ddos_alt_port must differ from the panel's current port ("+strconv.Itoa(current)+")", http.StatusBadRequest)
			return
		}
	}

	repo := repository.NewSecurityRepository(con)
	if err := repo.UpdateConfig(req); err != nil {
		log.Println("security update config:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Push the new limits to the live middleware so the next request
	// is judged against them. Reload re-reads from the DB so the values
	// we persisted above flow through the same path a fresh launch uses.
	if s := security.Get(); s != nil {
		s.Reload()
	}
	writeJSON(w, &req)
}

// SecurityDDOSResetHandler resets the DDoS auto-stop runtime state
// (stop count and cooldown). Used when an admin wants to clear the
// auto-stop history and re-enable auto-stop after max count was reached.
func SecurityDDOSResetHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)
	if err := repo.ClearDDOSState(); err != nil {
		log.Println("security ddos reset:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Also clear UnderAttack if it was set by DDoS
	_ = repo.SetUnderAttack(false)
	// Reload live state
	if s := security.Get(); s != nil {
		s.ClearDDOSAutoStop()
		s.Reload()
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

// SecurityDDOSManualStopHandler manually triggers a DDoS auto-stop.
// Useful for testing the auto-stop behavior.
func SecurityDDOSManualStopHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewSecurityRepository(con)

	// Get current config to know stop minutes
	c := repo.GetConfig()

	// Increment stop count
	newCount, err := repo.IncrementDDOSStopCount()
	if err != nil {
		log.Println("security ddos manual stop:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// Set cooldown
	stopAt := time.Now().Add(time.Duration(c.DDOSStopMinutes) * time.Minute)
	_ = repo.SetDDOSCooldownUntil(stopAt)

	// Set UnderAttack = true
	_ = repo.SetUnderAttack(true)

	// Update live state
	if s := security.Get(); s != nil {
		s.SetDDOSActive(true, stopAt)
		s.Reload()
	}

	writeJSON(w, map[string]interface{}{
		"status":         "ok",
		"stop_count":     newCount,
		"cooldown_until": stopAt.Format(time.RFC3339),
	})
}
