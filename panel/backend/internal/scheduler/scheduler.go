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
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

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
}

// runJob executes a single automation job. It resolves the instance + node
// + token, calls the edge RPC, and records the run's stdout/stderr/exit-code
// into automation_runs. Honest errors are logged but never propagate — a
// transient DB blip must not crash the scheduler.
func runJob(_ context.Context, job models.Automation, instRepo *repository.InstanceRepository,
	nodeRepo *repository.NodeRepository, secretRepo *repository.SecretRepository,
	automationRepo *repository.AutomationRepository, auditRepo *repository.InstanceAuditRepository,
) {
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
	ec := edge.New(*node, token)
	resp, execErr := ec.Exec(edge.ExecRequest{
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
	sched, err := cron.Parse(schedule)
	if err != nil || schedule == "" {
		// On-demand jobs: no recurring next slot, the manual run is one-off.
		return time.Time{}
	}
	return sched.Next(from)
}
