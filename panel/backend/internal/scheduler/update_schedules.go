// Scheduled update windows (migration 068): cron schedules for panel +
// fleet self-updates with a daily maintenance-window guard.
//
// Evaluated once per minute from the scheduler sweep, AFTER the backup
// sweep so update runs never interleave with VACUUM/snapshot I/O. Each
// due + enabled row:
//   - outside its window → SKIP + audit-log (the update NEVER executes);
//   - inside → run detached (fleet rolling rollout / panel stage+relaunch)
//     so a slow fleet or a multi-minute binary download never blocks the
//     minute tick.
// Re-arming (next_run_at + last_status) lives in the handlers package
// next to the runners so the HTTP CRUD and the sweep share it.
package scheduler

import (
	"context"
	"log"
	"time"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/updatewin"
)

// sweepUpdateWindows fires due panel + fleet update windows. Errors are
// logged, never fatal to the automation/backup sweeps above.
func sweepUpdateWindows(ctx context.Context) {
	due, err := handlers.DueUpdateWindows(time.Now())
	if err != nil {
		log.Println("update-window scheduler: query due:", err)
		return
	}
	for _, w := range due {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if err := updatewin.ValidateTarget(w.Target); err != nil {
			handlers.SkipUpdateWindow(w, "skipped: "+err.Error())
			continue
		}
		// Maintenance-window guard: run ONLY inside the window.
		if !updatewin.InWindow(time.Now(), w.WindowStart, w.WindowEnd) {
			handlers.SkipUpdateWindow(w, "skipped: outside maintenance window")
			continue
		}
		switch w.Target {
		case updatewin.TargetFleet:
			go handlers.RunScheduledFleetUpdate(w)
		case updatewin.TargetPanel:
			go handlers.RunScheduledPanelUpdate(w)
		}
	}
}
