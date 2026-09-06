package handlers

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/updatewin"
)

// ====================== SCHEDULED UPDATE-WINDOW RUNNER ======================
// The scheduler sweep (internal/scheduler, once a minute) drives these.
// They own no HTTP request, so audit rows are written directly with the
// "system" actor instead of RecordActivity.

// recordSystemActivity inserts one audit row attributable to the
// background scheduler. Failures are logged, never fatal.
func recordSystemActivity(category models.ActivityCategory, action, targetLabel, message string) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("scheduled update activity: open db:", err)
		return
	}
	defer con.Close()
	_, _ = repository.NewActivityRepository(con).Create(repository.ActivityInput{
		Category:    category,
		Action:      action,
		Username:    "system",
		TargetLabel: targetLabel,
		Message:     message,
	})
}

// DueUpdateWindows returns enabled windows whose next_run_at passed.
func DueUpdateWindows(now time.Time) ([]repository.UpdateWindow, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, err
	}
	defer con.Close()
	return repository.NewUpdateWindowRepository(con).Due(now)
}

// rearmUpdateWindow records a fire/skip outcome and arms the next slot.
// A corrupt cron that parses at write time but never occurs (or that
// slipped past validation) arms zero — which Due matches on EVERY tick
// (per-minute refire loop). Park such rows far in the future instead,
// mirroring scheduler.nextBackupRun/nextRun's fail-closed parking.
func rearmUpdateWindow(id int64, cronExpr, status string) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("scheduled update rearm: open db:", err)
		return
	}
	defer con.Close()
	next := updatewin.NextRun(cronExpr, time.Now())
	if next.IsZero() {
		next = time.Now().AddDate(100, 0, 0)
	}
	_ = repository.NewUpdateWindowRepository(con).MarkRan(id, &next, status)
}

// SkipUpdateWindow marks a due window skipped (outside its maintenance
// window, unknown target, …) and audit-logs the skip — the update NEVER
// executes on this path.
func SkipUpdateWindow(w repository.UpdateWindow, status string) {
	rearmUpdateWindow(w.ID, w.Cron, status)
	recordSystemActivity(models.ActivityCategorySystem, w.Target+"_update_window_skip", w.Name,
		fmt.Sprintf("scheduled %s update window %q %s (cron %s, window %s–%s)",
			w.Target, w.Name, status, w.Cron, w.WindowStart, w.WindowEnd))
}

// productionRollingDeps builds the live edge touchpoints shared by the
// HTTP rolling-update handler and the scheduled fleet runner.
func productionRollingDeps() rollingDeps {
	return rollingDeps{
		check: func(nd models.Node, token string) (bool, string, string, error) {
			out, err := edge.New(nd, token).EdgeUpdateCheck()
			if err != nil {
				return false, "", "", err
			}
			if out.Error != "" {
				return false, out.Local.Version, "", fmt.Errorf("%s", out.Error)
			}
			return out.Available, out.Local.Version, out.Remote.Version, nil
		},
		apply: func(nd models.Node, token string) error {
			// The edge downloads (~10MB) before answering, so allow minutes.
			_, err := edge.NewWithTimeout(nd, token, 6*time.Minute).EdgeUpdateApply()
			return err
		},
		pollHealthy: func(nd models.Node, token, before string, timeout time.Duration) error {
			return rollingPollHealthy(nd, token, before, timeout, time.Now())
		},
	}
}

// loadFleetPlans lists every registered node with its token for a fleet
// run. Nodes without a usable token are still planned — the orchestrator
// fails them fast with "rotate it first" instead of silently skipping.
func loadFleetPlans() ([]rollingNodePlan, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return nil, err
	}
	defer con.Close()
	nodeRepo := repository.NewNodeRepository(con)
	nodes, err := nodeRepo.ListNodes()
	if err != nil {
		return nil, err
	}
	ordered := orderRollingNodes(nodes, "sequential", 0)
	plans := make([]rollingNodePlan, 0, len(ordered))
	for _, nd := range ordered {
		tok, terr := nodeRepo.PlainToken(nd.ID)
		if terr != nil {
			tok = ""
		}
		plans = append(plans, rollingNodePlan{Node: nd, Token: tok})
	}
	return plans, nil
}

// RunScheduledFleetUpdate executes one due fleet window: sequential
// rollout (2min health window per node, stop on first failure) with
// per-node + summary audit rows. Runs detached — the scheduler fires it
// in a goroutine so a slow fleet never blocks the minute tick.
func RunScheduledFleetUpdate(w repository.UpdateWindow) {
	// Re-arm FIRST so a panel restart mid-rollout doesn't re-fire it.
	rearmUpdateWindow(w.ID, w.Cron, "started")
	recordSystemActivity(models.ActivityCategoryNode, "edge_rolling_update_summary", w.Name,
		fmt.Sprintf("scheduled fleet update window %q started (%s)", w.Name, w.Cron))
	plans, err := loadFleetPlans()
	if err != nil {
		rearmUpdateWindow(w.ID, w.Cron, "failed: "+err.Error())
		recordSystemActivity(models.ActivityCategoryNode, "edge_rolling_update_summary", w.Name,
			fmt.Sprintf("scheduled fleet update window %q failed to list nodes: %v", w.Name, err))
		return
	}
	results, stoppedEarly := runRollingUpdate(plans, 120*time.Second, true, productionRollingDeps())
	updated, upToDate, failed, skipped := 0, 0, 0, 0
	for _, st := range results {
		switch st.Status {
		case rollStatusUpdated:
			updated++
		case rollStatusUpToDate:
			upToDate++
		case rollStatusFailed:
			failed++
		case rollStatusSkipped:
			skipped++
		}
		id := st.NodeID
		con, oerr := repository.OpenDB()
		if oerr != nil {
			continue
		}
		_, _ = repository.NewActivityRepository(con).Create(repository.ActivityInput{
			Category: models.ActivityCategoryNode, Action: "edge_rolling_update",
			Username: "system", TargetID: &id, TargetLabel: st.Name,
			Message: fmt.Sprintf("scheduled rolling update %s: %s", st.Status, st.Detail),
		})
		con.Close()
	}
	summary := fmt.Sprintf("scheduled fleet update window %q done: %d updated, %d up-to-date, %d failed, %d skipped%s",
		w.Name, updated, upToDate, failed, skipped,
		map[bool]string{true: " — stopped early on first failure", false: ""}[stoppedEarly])
	rearmUpdateWindow(w.ID, w.Cron, summary)
	recordSystemActivity(models.ActivityCategoryNode, "edge_rolling_update_summary", w.Name, summary)
}

// RunScheduledPanelUpdate executes one due panel window: download +
// verify + swap via the shared stager, then relaunch detached and exit —
// the same .old rollback + /health-gate semantics as the manual apply.
// Runs detached in a goroutine owned by the scheduler.
func RunScheduledPanelUpdate(w repository.UpdateWindow) {
	exe, logLines, serr := stagePanelBinary("update")
	if serr != nil {
		msg := serr.Error()
		if sf, ok := serr.(*stageFailure); ok && sf.IsVerify {
			msg = "checksum failure: " + sf.Msg
		}
		rearmUpdateWindow(w.ID, w.Cron, "failed: "+msg)
		recordSystemActivity(models.ActivityCategorySystem, "self_update", w.Name,
			fmt.Sprintf("scheduled panel update window %q failed: %s (live binary untouched)", w.Name, msg))
		return
	}
	rearmUpdateWindow(w.ID, w.Cron, "staged, relaunching")
	recordSystemActivity(models.ActivityCategorySystem, "self_update", w.Name,
		fmt.Sprintf("scheduled panel update window %q applied, relaunching", w.Name))
	time.Sleep(600 * time.Millisecond)
	if err := relaunchPanel(exe, logLines); err != nil {
		log.Printf("scheduled panel relaunch failed: %v", err)
		os.Exit(1)
	}
	os.Exit(0)
}
