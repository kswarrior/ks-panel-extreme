package cli

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/spf13/cobra"
)

// Supervise tuning defaults: base 2s, double per fast crash, cap 60s.
// A run healthy for >= healthyResetAfter resets the backoff to base.
const (
	superviseBaseDelay      = 2 * time.Second
	superviseMaxDelay       = 60 * time.Second
	superviseHealthyReset   = 60 * time.Second
	superviseBurstWindow    = 120 * time.Second
	superviseBurstLimit     = 5
	superviseBurstCooldown  = 60 * time.Second
	superviseShutdownGrace  = 10 * time.Second
)

var superviseCmd = &cobra.Command{
	Use:   "supervise",
	Short: "Run the panel under an auto-restart supervisor (restarts on crash)",
	Long: `Run kspanel launch as a supervised child and restart it on crash.

  ./kspanel supervise --port 5050

Exit-code contract (what counts as a crash):
  - child exit 0  = clean stop (API /stop, CLI stop) → supervise exits 0, no restart.
  - child exit !=0 = crash (panic, fatal, OOM-kill mapped to 137, segfault) → restart
    with exponential backoff (2s, 4s, 8s … capped at 60s). A run healthy for
    >=60s resets the backoff to 2s.
  - burst guard: 5 restarts inside 120s inserts one extra 60s cooldown so a
    poison binary/config cannot hot-loop the disk/log. Supervise keeps trying
    (never gives up) unless --max-restarts is set.

Use under systemd with Restart=always as a second layer (see
deploy/systemd/kspanel.service), or standalone / docker CMD where no init
supervises the process. SIGTERM/SIGINT to supervise forwards to the child
and exits without restarting.`,
	RunE: runSupervise,
}

func init() {
	superviseCmd.Flags().IntP("port", "p", config.DefaultPort(), "Port to listen on (forwarded to launch)")
	superviseCmd.Flags().String("type", "", "Database engine (forwarded to launch)")
	superviseCmd.Flags().String("dsn", "", "Full database DSN (forwarded to launch)")
	superviseCmd.Flags().String("url", "", "Database host:port (forwarded to launch)")
	superviseCmd.Flags().String("user", "", "Database username (forwarded to launch)")
	superviseCmd.Flags().String("database", "", "Database name (forwarded to launch)")
	superviseCmd.Flags().Duration("restart-delay", superviseBaseDelay, "Base delay between crash restarts (doubles per fast crash)")
	superviseCmd.Flags().Duration("max-backoff", superviseMaxDelay, "Cap for the exponential restart backoff")
	superviseCmd.Flags().Int("max-restarts", 0, "Give up after N crash restarts (0 = unlimited)")
}

func runSupervise(cmd *cobra.Command, args []string) error {
	port, _ := cmd.Flags().GetInt("port")
	baseDelay, _ := cmd.Flags().GetDuration("restart-delay")
	maxBackoff, _ := cmd.Flags().GetDuration("max-backoff")
	maxRestarts, _ := cmd.Flags().GetInt("max-restarts")

	if !cmd.Flags().Changed("port") {
		if envPort := os.Getenv("KSPANEL_PORT"); envPort != "" {
			if n, perr := strconv.Atoi(envPort); perr == nil && n >= 1 && n <= 65535 {
				port = n
			}
		}
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port %d (1-65535)", port)
	}
	if baseDelay <= 0 {
		baseDelay = superviseBaseDelay
	}
	if maxBackoff <= 0 {
		maxBackoff = superviseMaxDelay
	}
	if maxBackoff < baseDelay {
		maxBackoff = baseDelay
	}
	if maxRestarts < 0 {
		maxRestarts = 0
	}

	exe, err := os.Executable()
	if err != nil || exe == "" {
		return fmt.Errorf("locate kspanel binary: %w", err)
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}

	// Forward DB flags verbatim so supervise is a drop-in for launch.
	// NOTE: never log flag values — --dsn/--url/--user may carry secrets.
	forwardKeys := []string{"type", "dsn", "url", "user", "password", "database"}
	forwarded := []string{"launch", "--port", strconv.Itoa(port)}
	for _, k := range forwardKeys {
		if v, _ := cmd.Flags().GetString(k); v != "" {
			forwarded = append(forwarded, "--"+k, v)
		}
	}

	print.Step("supervise", fmt.Sprintf("kspanel on :%d (base %s, cap %s)", port, baseDelay, maxBackoff))
	print.Step("supervise", "exit 0 = clean stop (no restart); exit !=0 = crash (restart)")

	delay := baseDelay
	var restarts []time.Time
	count := 0

	for {
		if maxRestarts > 0 && count >= maxRestarts {
			print.Error("supervise", fmt.Sprintf("max-restarts %d reached — giving up", maxRestarts))
			return fmt.Errorf("max-restarts %d reached", maxRestarts)
		}
		// Burst guard: 5 restarts inside 120s → one 60s cooldown, keep trying.
		if wait := burstCooldown(restarts, time.Now()); wait > 0 {
			print.Step("supervise", fmt.Sprintf("burst guard: %d restarts in %s — cooling down %s", superviseBurstLimit, superviseBurstWindow, wait))
			time.Sleep(wait)
		}

		start := time.Now()
		print.Step("supervise", fmt.Sprintf("starting (attempt %d)", count+1))
		code, signaled := runSupervisedChild(exe, forwarded)
		healthy := time.Since(start) >= superviseHealthyReset

		if !signaled && code == 0 {
			print.OK("supervise", "clean stop — not restarting")
			return nil
		}
		count++
		restarts = append(restarts, time.Now())
		restarts = pruneRestarts(restarts, superviseBurstWindow*2)

		log.Printf("supervise: child exited code=%d signaled=%v run=%s (restart %d)", code, signaled, time.Since(start).Round(time.Second), count)
		print.Error("supervise", fmt.Sprintf("crash (code %d) — restart %d in %s", code, count, delay))
		time.Sleep(delay)
		if healthy {
			delay = baseDelay
		} else {
			delay = nextBackoff(delay, baseDelay, maxBackoff, false)
		}
	}
}

// runSupervisedChild starts exe args, forwards SIGTERM/SIGINT to the child,
// and reports (exitCode, signaledByUs). Clean child exit 0 with no operator
// signal returns (0, false). A forwarded operator signal returns (_, true)
// so the caller exits instead of restarting.
func runSupervisedChild(exe string, args []string) (int, bool) {
	child := exec.Command(exe, args...)
	child.Stdout = os.Stdout
	child.Stderr = os.Stderr
	child.Stdin = nil
	child.Env = os.Environ()
	child.SysProcAttr = detachSysProcAttr()

	if err := child.Start(); err != nil {
		log.Printf("supervise: start failed: %v", err)
		return 1, false
	}

	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	done := make(chan error, 1)
	go func() { done <- child.Wait() }()

	select {
	case sig := <-sigCh:
		log.Printf("supervise: got %s — forwarding to child %d", sig, child.Process.Pid)
		_ = child.Process.Signal(sig.(syscall.Signal))
		select {
		case <-done:
			return 0, true
		case <-time.After(superviseShutdownGrace):
			_ = child.Process.Kill()
			<-done
			return 0, true
		}
	case err := <-done:
		if err == nil {
			return 0, false
		}
		if ee, ok := err.(*exec.ExitError); ok {
			if ws, ok := ee.Sys().(syscall.WaitStatus); ok {
				if ws.Signaled() {
					return 128 + int(ws.Signal()), false
				}
				return ws.ExitStatus(), false
			}
			return ee.ExitCode(), false
		}
		return 1, false
	}
}

// nextBackoff doubles the delay per consecutive fast crash, capped at max.
// A healthy run (healthy=true) resets to base.
func nextBackoff(current, base, max time.Duration, healthy bool) time.Duration {
	if healthy {
		return base
	}
	if current <= 0 {
		return base
	}
	next := current * 2
	if next > max {
		return max
	}
	return next
}

// burstCooldown returns superviseBurstCooldown when the last
// superviseBurstLimit restarts all fall inside superviseBurstWindow.
func burstCooldown(restarts []time.Time, now time.Time) time.Duration {
	if len(restarts) < superviseBurstLimit {
		return 0
	}
	window := restarts[len(restarts)-superviseBurstLimit:]
	if now.Sub(window[0]) <= superviseBurstWindow {
		return superviseBurstCooldown
	}
	return 0
}

func pruneRestarts(restarts []time.Time, keep time.Duration) []time.Time {
	cutoff := time.Now().Add(-keep)
	out := restarts[:0]
	for _, t := range restarts {
		if t.After(cutoff) {
			out = append(out, t)
		}
	}
	return out
}
