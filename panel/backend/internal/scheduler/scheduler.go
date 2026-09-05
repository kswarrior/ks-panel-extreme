// Package scheduler runs the panel's automation cron loop. Every minute it
// polls the AutomationRepository for jobs whose next_run_at has passed,
// dials the owning edge's exec-rpc endpoint, and records the run's
// stdout/stderr/exit-code into automation_runs.
//
// The loop is panel-wide (one goroutine owned by `launch`); the runner
// evaluates each job in its own goroutine so a slow edge doesn't block the
// scheduler's next tick. Sub-minute precision is intentionally not
// supported — that's the scheduler's cadence.
package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/example/kspanel/internal/backup"
	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// concurrencyLimit controls the maximum number of automation jobs that may
// run simultaneously. This prevents goroutine leaks when thousands of due
// jobs are discovered in a single sweep pass.
var concurrencyLimit = func() int {
	n := runtime.NumCPU()
	if n > 20 {
		return 20
	}
	if n < 1 {
		n = 1
	}
	return n
}()

// semaphore is a simple counting semaphore used to limit concurrent
// goroutines in the scheduler sweep.
type semaphore struct {
	tokens chan struct{}
}

// newSemaphore creates a semaphore with the given number of permits.
func newSemaphore(limit int) *semaphore {
	return &semaphore{tokens: make(chan struct{}, limit)}
}

// acquire blocks until a permit is available, then consumes one. The
// channel capacity IS the permit count: sending blocks once `limit`
// goroutines hold tokens. (The previous select/default version silently
// proceeded when the channel was full, making the limit a no-op.)
func (s *semaphore) acquire() {
	s.tokens <- struct{}{}
}

// release returns a permit to the semaphore.
func (s *semaphore) release() {
	select {
	case <-s.tokens:
		// returned
	default:
	}
}

// Start launches the background scheduler loop and returns immediately. The
// loop runs until ctx is cancelled.
func Start(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	go func() {
		defer ticker.Stop()
		// Fire once on startup so a panel restart immediately re-evaluates
		// any job that was due while the panel was down.
		sweep(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				sweep(ctx)
			}
		}
	}()
}

// sweep loads due jobs and dispatches them with a bounded concurrency
// limit so that a large number of due jobs does not spawn unbounded
// goroutines and exhaust memory or CPU.
func sweep(ctx context.Context) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("automation scheduler: open db:", err)
		return
	}
	defer con.Close()

	automationRepo := repository.NewAutomationRepository(con)
	secretRepo := repository.NewSecretRepository(con)
	instRepo := repository.NewInstanceRepository(con)
	nodeRepo := repository.NewNodeRepository(con)
	auditRepo := repository.NewInstanceAuditRepository(con)

	now := time.Now()
	due, err := automationRepo.Due(now)
	if err != nil {
		log.Println("automation scheduler: query due:", err)
		return
	}

	// Use a counting semaphore to limit concurrent job executions.
	// This replaces the unbounded `go func()` pattern so that at most
	// `concurrencyLimit` jobs run simultaneously, preventing memory/CPU
	// exhaustion in large installations.
	sem := newSemaphore(concurrencyLimit)

	var wg sync.WaitGroup
	for i := range due {
		// respect context cancellation
		select {
		case <-ctx.Done():
			wg.Wait()
			return
		default:
		}

		// Acquire BEFORE spawning so both goroutines AND concurrent job
		// executions stay bounded by the limit — a sweep that discovers
		// thousands of due jobs must not spawn thousands of parked
		// goroutines waiting for a token.
		sem.acquire()
		wg.Add(1)
		go func(job models.Automation) {
			defer wg.Done()
			defer sem.release()
			runJob(ctx, job, instRepo, nodeRepo, secretRepo, automationRepo, auditRepo)
		}(due[i])
	}

	wg.Wait()

	// Backup schedules run in the same minute tick, reusing the TriggerRun
	// pattern (resolve owner, fire, record, re-arm). Errors are logged, never
	// fatal to the automation sweep above.
	sweepBackupSchedules(ctx)

	// Tickets + notifications (065): SLA overdue escalation (breach mark +
	// priority step-up + least-loaded reassignment + owner/assignee
	// notification) and the daily digest-mail sweep for digest-mode users.
	// Same best-effort contract as the backup sweep above.
	sweepTickets(ctx)

	// Database integrity verification (daily cron, configurable via
	// settings KV db_verify_cron): PRAGMA quick_check (SQLite) + connection
	// probe + table-count sanity (all engines). Failures write
	// activity_logs + notify admins. Same best-effort contract.
	sweepDatabaseVerify(ctx)

	// Scheduled update windows (068): cron panel + fleet self-updates
	// with a maintenance-window guard (skip + log outside the window).
	// Same best-effort contract as the sweeps above.
	sweepUpdateWindows(ctx)
}

// sweepBackupSchedules fires due backup_schedules rows: kind='db' runs a
// VACUUM INTO (or native dump) + retention prune + optional S3 push;
// kind='snapshot' dials the owning edge's snapshot-create + records the
// row + prunes old snapshots per the schedule's retention.
func sweepBackupSchedules(ctx context.Context) {
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("backup scheduler: open db:", err)
		return
	}
	defer con.Close()
	schedRepo := repository.NewBackupScheduleRepository(con)
	due, err := schedRepo.Due(time.Now())
	if err != nil {
		log.Println("backup scheduler: query due:", err)
		return
	}
	for _, s := range due {
		select {
		case <-ctx.Done():
			return
		default:
		}
		switch s.Kind {
		case "db":
			runDBBackupSchedule(schedRepo, s)
		case "snapshot":
			runSnapshotSchedule(ctx, schedRepo, s)
		default:
			_ = schedRepo.MarkRan(s.ID, time.Time{})
		}
	}
}

func sanitizeScheduleName(name string) string {
	out := make([]rune, 0, len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-', r == '_':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	s := string(out)
	if s == "" {
		return "scheduled"
	}
	if len(s) > 32 {
		s = s[:32]
	}
	return s
}

func nextBackupRun(schedule string) time.Time {
	if schedule == "" {
		return time.Time{}
	}
	sched, err := cron.Parse(schedule)
	if err != nil {
		return time.Time{}
	}
	return sched.Next(time.Now())
}

func loadS3ForScheduler() (backup.S3Config, error) {
	con, err := repository.OpenDB()
	if err != nil {
		return backup.S3Config{}, err
	}
	defer con.Close()
	ep, bucket, region, prefix, access, secret, err := repository.NewS3ConfigRepository(con).GetClear()
	if err != nil {
		return backup.S3Config{}, err
	}
	return backup.S3Config{Endpoint: ep, Bucket: bucket, Region: region, Prefix: prefix, AccessKey: access, SecretKey: secret}, nil
}

func runDBBackupSchedule(schedRepo *repository.BackupScheduleRepository, s repository.BackupSchedule) {
	// Separate OpenDB for the backup itself so the schedule row's conn
	// lifetime doesn't pin the VACUUM lock.
	b, err := backup.CreateWithOptions("scheduled-"+sanitizeScheduleName(s.Name), s.Compression)
	if err != nil {
		log.Printf("backup scheduler: db schedule #%d create failed: %v", s.ID, err)
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	_ = b
	if removed, perr := backup.Prune(s.KeepLastN, s.MaxAgeDays); perr != nil {
		log.Printf("backup scheduler: db schedule #%d prune failed: %v", s.ID, perr)
	} else if len(removed) > 0 {
		log.Printf("backup scheduler: db schedule #%d pruned %d backups", s.ID, len(removed))
	}
	if s.S3Push {
		if cfg, serr := loadS3ForScheduler(); serr == nil {
			// Push the newest backup (the one we just created).
			if latest, lerr := backup.List(); lerr == nil && len(latest) > 0 {
				_ = backup.S3Push(cfg, latest[0].Path)
			}
		} else {
			log.Printf("backup scheduler: db schedule #%d s3 push skipped (remote not configured)", s.ID)
		}
	}
	_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
}

func runSnapshotSchedule(ctx context.Context, schedRepo *repository.BackupScheduleRepository, s repository.BackupSchedule) {
	if s.InstanceID == nil || *s.InstanceID <= 0 {
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	// Fresh handles (don't reuse the sweep conn across edge dials).
	dbCon, err := repository.OpenDB()
	if err != nil {
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	defer dbCon.Close()
	instRepo := repository.NewInstanceRepository(dbCon)
	nodeRepo := repository.NewNodeRepository(dbCon)
	inst, err := instRepo.Get(*s.InstanceID)
	if err != nil {
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}
	snapName := fmt.Sprintf("%s-%s", sanitizeScheduleName(s.Name), time.Now().UTC().Format("20060102-150405"))
	ec := edge.NewWithTimeout(*node, token, 90*time.Second)
	resp, execErr := ec.Snapshot(edge.SnapshotRequest{
		Kind: inst.Kind, Name: name, Action: "create", SnapName: snapName,
	})
	if execErr != nil {
		log.Printf("backup scheduler: snapshot schedule #%d edge failed: %v", s.ID, execErr)
		_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
		return
	}
	_, _ = repository.NewSnapshotRepository(dbCon).Create(models.InstanceSnapshot{
		InstanceID: inst.ID, Name: snapName, ExternalRef: resp.ExternalRef, SizeBytes: resp.SizeBytes,
		Note: "scheduled",
	})
	_, _ = repository.NewInstanceAuditRepository(dbCon).Append(repository.AuditInput{
		InstanceID: inst.ID, Actor: "system", Action: "snapshot.create",
		Detail: fmt.Sprintf("scheduled snapshot %q (ref=%s)", snapName, resp.ExternalRef),
	})
	pruneSnapshots(dbCon, ec, inst, s.KeepLastN, s.MaxAgeDays)
	_ = schedRepo.MarkRan(s.ID, nextBackupRun(s.Cron))
}

// pruneSnapshots keeps the newest keepLastN rows + drops rows older than
// maxAgeDays, deleting edge-side snapshots best-effort.
func pruneSnapshots(dbCon *sql.DB, ec *edge.Client, inst *models.Instance, keepLastN, maxAgeDays int) {
	if keepLastN <= 0 && maxAgeDays <= 0 {
		return
	}
	// Use the snapshot repo list (newest-first) then delete the tail.
	snaps, err := repository.NewSnapshotRepository(dbCon).List(inst.ID)
	if err != nil {
		return
	}
	now := time.Now().UTC()
	for i, sn := range snaps {
		overCount := keepLastN > 0 && i >= keepLastN
		overAge := maxAgeDays > 0 && now.Sub(sn.CreatedAt.UTC()) > time.Duration(maxAgeDays)*24*time.Hour
		if !overCount && !overAge {
			continue
		}
		workload := inst.ExternalID
		if workload == "" {
			workload = inst.Name
		}
		_, _ = ec.Snapshot(edge.SnapshotRequest{Kind: inst.Kind, Name: workload, Action: "delete", SnapName: sn.Name})
		_ = repository.NewSnapshotRepository(dbCon).Delete(inst.ID, sn.Name)
	}
}

// runJob executes a single automation job. It resolves the instance + node
// + token, calls the edge RPC, and records the run's stdout/stderr/exit-code
// into automation_runs. Honest errors are logged but never propagate — a
// transient DB blip must not crash the scheduler.
func runJob(ctx context.Context, job models.Automation, instRepo *repository.InstanceRepository,
	nodeRepo *repository.NodeRepository, secretRepo *repository.SecretRepository,
	automationRepo *repository.AutomationRepository, auditRepo *repository.InstanceAuditRepository,
) {
	// Respect cancellation before touching DB or dialing edge.
	select {
	case <-ctx.Done():
		return
	default:
	}
	// job is already models.Automation; resolve instance + node + token.
	inst, err := instRepo.Get(job.InstanceID)
	if err != nil {
		// Instance gone — record a failed run and bail.
		_, _ = automationRepo.RecordRun(repository.AutomationRunInput{
			JobID: job.ID, InstanceID: job.InstanceID, Trigger: "schedule",
			Command: job.Command, Error: "instance not found", StartedAt: time.Now(), FinishedAt: time.Now(),
		})
		_ = automationRepo.MarkRan(job.ID, nextRun(job.Schedule, time.Now()))
		return
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		_, _ = automationRepo.RecordRun(repository.AutomationRunInput{
			JobID: job.ID, InstanceID: job.InstanceID, Trigger: "schedule",
			Command: job.Command, Error: "node not found", StartedAt: time.Now(), FinishedAt: time.Now(),
		})
		_ = automationRepo.MarkRan(job.ID, nextRun(job.Schedule, time.Now()))
		return
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		_, _ = automationRepo.RecordRun(repository.AutomationRunInput{
			JobID: job.ID, InstanceID: job.InstanceID, Trigger: "schedule",
			Command: job.Command, Error: "node has no edge token", StartedAt: time.Now(), FinishedAt: time.Now(),
		})
		_ = automationRepo.MarkRan(job.ID, nextRun(job.Schedule, time.Now()))
		return
	}

	// Resolve named secrets to env pairs.
	keys, vals, _ := secretRepo.ResolvedEnv(job.InstanceID, job.SecretRefs)
	env := map[string]string{}
	for i := range keys {
		env[keys[i]] = vals[i]
	}

	name := inst.ExternalID
	if name == "" {
		name = inst.Name
	}

	started := time.Now()
	// Check cancellation before dialing edge (edge may be down and the dial would block).
	select {
	case <-ctx.Done():
		return
	default:
	}
	timeout := job.TimeoutSec
	if timeout <= 0 {
		timeout = 300
	}
	// Bound the edge call by both the job timeout and the scheduler's context
	// so a panel shutdown cancels the in-flight RPC promptly instead of
	// waiting for the full 5-minute dial timeout.
	callCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout+10)*time.Second)
	defer cancel()
	ec := edge.NewWithTimeout(*node, token, time.Duration(timeout+10)*time.Second)
	resp, execErr := ec.ExecCtx(callCtx, edge.ExecRequest{
		Kind:       inst.Kind,
		Name:       name,
		Command:    job.Command,
		Env:        env,
		TimeoutSec: job.TimeoutSec,
	})
	finished := time.Now()

	// Record run row.
	exitCode := 0
	stdout := resp.Stdout
	stderr := resp.Stderr
	errMsg := ""
	if execErr != nil {
		errMsg = execErr.Error()
		exitCode = -1
	} else {
		exitCode = resp.ExitCode
	}
	_, _ = automationRepo.RecordRun(repository.AutomationRunInput{
		JobID: job.ID, InstanceID: job.InstanceID, Trigger: "schedule",
		Stdout:     truncate(stdout, 64*1024),
		Stderr:     truncate(stderr, 64*1024),
		ExitCode:   exitCode,
		DurationMS: finished.Sub(started).Milliseconds(),
		Error:      errMsg,
		StartedAt:  started, FinishedAt: finished,
	})

	_, _ = auditRepo.Append(repository.AuditInput{
		InstanceID: job.InstanceID, Actor: "system",
		Action: "automation.run",
		Detail: fmt.Sprintf("scheduled job %q fired (exit=%d, %dms)", job.Name, exitCode, finished.Sub(started).Milliseconds()),
	})

	// Re-arm next_run_at from the cron expression.
	_ = automationRepo.MarkRan(job.ID, nextRun(job.Schedule, finished))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "\n…(truncated)"
}

func nextRun(schedule string, from time.Time) time.Time {
	if schedule == "" {
		// On-demand jobs: no recurring next slot, the manual run is one-off.
		return time.Time{}
	}
	sched, err := cron.Parse(schedule)
	if err != nil {
		// Corrupt row that slipped past API validation: park far in the
		// future instead of zero — MarkRan persists zero as year-1, which
		// Due matches on every tick (per-minute refire loop).
		return from.AddDate(100, 0, 0)
	}
	if n := sched.Next(from); !n.IsZero() {
		return n
	}
	// Parses but never occurs (e.g. Feb 30): same fail-closed parking.
	return from.AddDate(100, 0, 0)
}
