// Supervise runs ksedge launch as a supervised child and restarts it on
// crash. It is the edge twin of kspanel's `supervise` command: same
// exit-code contract (exit 0 = clean stop, no restart; exit !=0 = crash,
// restart with exponential backoff + burst guard) so operators get identical
// crash-recovery semantics on both sides of the fleet.
package cli

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

const (
	edgeSuperviseBaseDelay     = 2 * time.Second
	edgeSuperviseMaxDelay      = 60 * time.Second
	edgeSuperviseHealthyReset  = 60 * time.Second
	edgeSuperviseBurstWindow   = 120 * time.Second
	edgeSuperviseBurstLimit    = 5
	edgeSuperviseBurstCooldown = 60 * time.Second
	edgeSuperviseShutdownGrace = 10 * time.Second
)

func superviseCmd() *cobra.Command {
	var (
		configPath string
		port       int
		panelURL   string
		token      string
		interval   time.Duration
		skipVerify bool
		sftpPort   int
		baseDelay  time.Duration
		maxBackoff time.Duration
		maxRestart int
	)
	cmd := &cobra.Command{
		Use:   "supervise",
		Short: "Run the edge agent under an auto-restart supervisor (restarts on crash)",
		Long: `Run ksedge launch as a supervised child and restart it on crash.

  ./ksedge supervise --config config.toml

Exit-code contract: child exit 0 = clean stop (no restart); exit !=0 = crash
(panic, fatal, OOM-kill) → restart with exponential backoff (base doubles per
fast crash, capped at --max-backoff; a run healthy for >=60s resets to base).
5 restarts inside 120s insert one extra 60s cooldown so a poison binary/config
cannot hot-loop. SIGTERM/SIGINT forwards to the child and exits without
restarting.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runEdgeSupervise(edgeSuperviseOptions{
				ConfigPath: configPath,
				Port:       port,
				PanelURL:   panelURL,
				Token:      token,
				Interval:   interval,
				SkipVerify: skipVerify,
				SFTPPort:   sftpPort,
				BaseDelay:  baseDelay,
				MaxBackoff: maxBackoff,
				MaxRestart: maxRestart,
			})
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "config.toml", "Path to the edge config file (forwarded to launch)")
	cmd.Flags().IntVarP(&port, "port", "p", 0, "Override the edge HTTP listen port (forwarded to launch)")
	cmd.Flags().StringVar(&panelURL, "panel", "", "Override panel_url from config (forwarded to launch)")
	cmd.Flags().StringVar(&token, "token", "", "Override the edge token (forwarded to launch)")
	cmd.Flags().DurationVar(&interval, "interval", 0, "Override heartbeat interval (forwarded to launch)")
	cmd.Flags().BoolVar(&skipVerify, "skip-verify", false, "Skip upstream TLS verification (forwarded to launch)")
	cmd.Flags().IntVar(&sftpPort, "sftp-port", 0, "SFTP listen port (forwarded to launch; 0 = launch default)")
	cmd.Flags().DurationVar(&baseDelay, "restart-delay", edgeSuperviseBaseDelay, "Base delay between crash restarts (doubles per fast crash)")
	cmd.Flags().DurationVar(&maxBackoff, "max-backoff", edgeSuperviseMaxDelay, "Cap for the exponential restart backoff")
	cmd.Flags().IntVar(&maxRestart, "max-restarts", 0, "Give up after N crash restarts (0 = unlimited)")
	return cmd
}

type edgeSuperviseOptions struct {
	ConfigPath string
	Port       int
	PanelURL   string
	Token      string
	Interval   time.Duration
	SkipVerify bool
	SFTPPort   int
	BaseDelay  time.Duration
	MaxBackoff time.Duration
	MaxRestart int
}

func runEdgeSupervise(o edgeSuperviseOptions) error {
	if o.BaseDelay <= 0 {
		o.BaseDelay = edgeSuperviseBaseDelay
	}
	if o.MaxBackoff <= 0 {
		o.MaxBackoff = edgeSuperviseMaxDelay
	}
	if o.MaxBackoff < o.BaseDelay {
		o.MaxBackoff = o.BaseDelay
	}
	if o.MaxRestart < 0 {
		o.MaxRestart = 0
	}

	exe, err := os.Executable()
	if err != nil || exe == "" {
		return fmt.Errorf("locate ksedge binary: %w", err)
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}

	// NOTE: the token is forwarded as an argv value to the child (same as
	// today's `launch --token` override). Never log it.
	forwarded := []string{"launch", "--config", o.ConfigPath}
	if o.Port != 0 {
		forwarded = append(forwarded, "--port", fmt.Sprint(o.Port))
	}
	if o.PanelURL != "" {
		forwarded = append(forwarded, "--panel", o.PanelURL)
	}
	if o.Token != "" {
		forwarded = append(forwarded, "--token", o.Token)
	}
	if o.Interval != 0 {
		forwarded = append(forwarded, "--interval", o.Interval.String())
	}
	if o.SkipVerify {
		forwarded = append(forwarded, "--skip-verify")
	}
	if o.SFTPPort != 0 {
		forwarded = append(forwarded, "--sftp-port", fmt.Sprint(o.SFTPPort))
	}

	log.Printf("ksedge supervise: watching config=%s (base %s, cap %s)", o.ConfigPath, o.BaseDelay, o.MaxBackoff)

	delay := o.BaseDelay
	var restarts []time.Time
	count := 0

	for {
		if o.MaxRestart > 0 && count >= o.MaxRestart {
			return fmt.Errorf("max-restarts %d reached", o.MaxRestart)
		}
		if wait := edgeBurstCooldown(restarts, time.Now()); wait > 0 {
			log.Printf("ksedge supervise: burst guard (%d restarts in %s) — cooling down %s",
				edgeSuperviseBurstLimit, edgeSuperviseBurstWindow, wait)
			time.Sleep(wait)
		}

		start := time.Now()
		log.Printf("ksedge supervise: starting (attempt %d)", count+1)
		code, signaled := runEdgeSupervisedChild(exe, forwarded)
		healthy := time.Since(start) >= edgeSuperviseHealthyReset

		if !signaled && code == 0 {
			log.Printf("ksedge supervise: clean stop — not restarting")
			return nil
		}
		count++
		restarts = append(restarts, time.Now())
		restarts = edgePruneRestarts(restarts, edgeSuperviseBurstWindow*2)

		log.Printf("ksedge supervise: crash (code %d) — restart %d in %s", code, count, delay)
		time.Sleep(delay)
		if healthy {
			delay = o.BaseDelay
		} else {
			delay = edgeNextBackoff(delay, o.BaseDelay, o.MaxBackoff, false)
		}
	}
}

func runEdgeSupervisedChild(exe string, args []string) (int, bool) {
	child := exec.Command(exe, args...)
	child.Stdout = os.Stdout
	child.Stderr = os.Stderr
	child.Stdin = nil
	child.Env = os.Environ()

	if err := child.Start(); err != nil {
		log.Printf("ksedge supervise: start failed: %v", err)
		return 1, false
	}

	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	done := make(chan error, 1)
	go func() { done <- child.Wait() }()

	select {
	case sig := <-sigCh:
		log.Printf("ksedge supervise: got %s — forwarding to child %d", sig, child.Process.Pid)
		_ = child.Process.Signal(sig.(syscall.Signal))
		select {
		case <-done:
			return 0, true
		case <-time.After(edgeSuperviseShutdownGrace):
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

func edgeNextBackoff(current, base, max time.Duration, healthy bool) time.Duration {
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

func edgeBurstCooldown(restarts []time.Time, now time.Time) time.Duration {
	if len(restarts) < edgeSuperviseBurstLimit {
		return 0
	}
	window := restarts[len(restarts)-edgeSuperviseBurstLimit:]
	if now.Sub(window[0]) <= edgeSuperviseBurstWindow {
		return edgeSuperviseBurstCooldown
	}
	return 0
}

func edgePruneRestarts(restarts []time.Time, keep time.Duration) []time.Time {
	cutoff := time.Now().Add(-keep)
	out := restarts[:0]
	for _, t := range restarts {
		if t.After(cutoff) {
			out = append(out, t)
		}
	}
	return out
}
