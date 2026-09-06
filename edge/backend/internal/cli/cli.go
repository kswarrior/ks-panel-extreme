// Package cli wires the cobra command surface for the ksedge binary. Keeping
// it separate from main() means the launch routine can be exercised from
// tests without exec'ing the whole binary.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/example/ksedge/internal/config"
	"github.com/example/ksedge/internal/exec"
	"github.com/example/ksedge/internal/execrpc"
	"github.com/example/ksedge/internal/files"
	"github.com/example/ksedge/internal/health"
	"github.com/example/ksedge/internal/heartbeat"
	"github.com/example/ksedge/internal/hostexec"
	"github.com/example/ksedge/internal/inspect"
	"github.com/example/ksedge/internal/install"
	"github.com/example/ksedge/internal/lifecycle"
	"github.com/example/ksedge/internal/pageaction"
	"github.com/example/ksedge/internal/ports"
	"github.com/example/ksedge/internal/sftp"
	"github.com/example/ksedge/internal/snapshot"
	"github.com/example/ksedge/internal/tunnel"
	"github.com/example/ksedge/internal/update"
	"github.com/spf13/cobra"
)

// New builds the root command. subcommands are added here so the caller (main)
// stays a two-line shim.
func New() *cobra.Command {
	root := &cobra.Command{
		Use:   "ksedge",
		Short: "KS Edge – lightweight agent for kspanel",
		Long: `ksedge is the per-host agent that reports telemetry back to a kspanel
instance. Configure it by placing a config.json next to the binary (or pass
--config <path>), then run:

  ./ksedge launch

The config file is produced by the panel when you register a node and copied
verbatim onto the edge machine.`,
	}
	root.AddCommand(launchCmd())
	return root
}

// launchCmd starts the edge: load config, start the heartbeat sender, and run
// the local health/HTTP server.
//
// Flags are provided purely for ad-hoc overrides. The normal operator workflow
// is to drop config.json next to the binary and run `ksedge launch` with no
// flags — the panel-generated file already carries the token.
func launchCmd() *cobra.Command {
	var (
		configPath string
		port       int
		panelURL   string
		token      string
		interval   time.Duration
		skipVerify bool
		once       bool
		sftpPort   int
	)
	cmd := &cobra.Command{
		Use:   "launch",
		Short: "Run the edge agent (heartbeat + local HTTP server)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load(configPath)
			if err != nil {
				// Missing config.json is fine for the panel's localnode flow
				// where the operator only supplied a port. Fall back to the
				// documented defaults so the health endpoint still starts;
				// the panel can push a populated config.json later.
				if errors.Is(err, os.ErrNotExist) {
					log.Printf("config.json not found at %s — starting with defaults (token + panel_url unset)", configPath)
					cfg = config.Default()
				} else {
					return err
				}
			}
			// Flag overrides win over file values. We only override on
			// non-zero/non-empty so `ksedge launch --port 7070` honours the
			// operator's intent while leaving the panel-generated token alone.
			if port != 0 {
				cfg.ListenPort = port
			}
			if panelURL != "" {
				cfg.PanelURL = panelURL
			}
			if token != "" {
				cfg.Token = token
			}
			if interval != 0 {
				// CLI override arrives as a Duration; persist it as the
				// same seconds representation the rest of the config uses.
				cfg.HeartbeatIntervalSeconds = int64(interval / time.Second)
			}
			if skipVerify {
				cfg.SkipVerify = true
			}

			// Surface obvious misconfigurations loudly before they manifest
			// as a card that never turns green. validateConfigFormat runs the
			// same structural checks config.validate() does, but also emits
			// a human-readable hint so the operator sees the cause in their
			// terminal instead of debugging a silent "down" status from the
			// panel side. We do NOT abort — the localnode flow legitimately
			// boots with no token+panel yet, so the edge should still come
			// up and log the warning.
			if warn := validateConfigFormat(cfg); warn != "" {
				log.Printf("⚠️  config warning: %s", warn)
			}

			// --once sends a single heartbeat and tails the /health server
			// in the foreground — handy for smoke-testing the integration
			// without keeping the daemon alive for a full interval.
			sender := heartbeat.New(cfg)
			if once {
				sender.SendOnce()
				log.Println("heartbeat sent once (--once); exiting")
				return nil
			}
			// One signal context shared by the heartbeat goroutine and the
			// HTTP server so a single SIGINT/SIGTERM tears both down
			// promptly — without it the heartbeat goroutine leaks until
			// the process exit abruptly aborts its in-flight tick.
			rootCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stopSignals()
			go sender.Run(rootCtx)
		// WSS reverse tunnel: keep a persistent websocket to the panel so the
		// panel can push RPCs without dialing the edge directly. Only for
		// tunnel modes (reverse_tunnel / local_wss / both / local_both);
		// direct and local_port use plain HTTP and don't need the extra
		// websocket.
		mode := strings.ToLower(strings.TrimSpace(cfg.ConnectionMode))
		if mode == "reverse_tunnel" || mode == "local_wss" || mode == "both" || mode == "local_both" {
				portForTunnel := cfg.ListenPortOr(4040)
				if port != 0 {
					portForTunnel = port
				}
				tc := tunnel.NewWithSkipVerify(cfg.PanelURL, cfg.Token, portForTunnel, cfg.SkipVerify)
				go tc.Run(rootCtx)
			} else {
				log.Printf("tunnel: disabled (connection_mode=%q not a tunnel mode)", cfg.ConnectionMode)
			}

			return runHealthServer(cfg, rootCtx, sftpPort)
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "config.json", "Path to the edge config file")
	cmd.Flags().IntVarP(&port, "port", "p", 0, "Override the edge HTTP listen port (default 4040, or config.json)")
	cmd.Flags().StringVar(&panelURL, "panel", "", "Override panel_url from config")
	cmd.Flags().StringVar(&token, "token", "", "Override the panel-issued edge token from config")
	cmd.Flags().DurationVar(&interval, "interval", 0, "Override heartbeat interval (e.g. 30s)")
	cmd.Flags().BoolVar(&skipVerify, "skip-verify", false, "Skip upstream TLS verification (self-signed panels)")
	cmd.Flags().BoolVar(&once, "once", false, "Send a single heartbeat and exit thereafter")
	cmd.Flags().IntVar(&sftpPort, "sftp-port", sftp.DefaultPort, "Listen port for the chrooted SFTP server (default 2222)")
	return cmd
}

// validateConfigFormat returns a non-empty string when the config looks like
// it would lead to a "down" card for an avoidable reason. It intentionally
// doesn't return an error: the localnode flow starts with an empty token +
// panel URL, and we want the health server up even then. The string is logged
// to stderr so the operator sees it next to the "listening on …" line.
func validateConfigFormat(cfg config.Config) string {
	if cfg.Token == "" && cfg.PanelURL == "" {
		return "token + panel_url are both empty — heartbeats are disabled until the panel pushes a real config.json (localnode flow)"
	}
	if cfg.Token == "" {
		return "token is empty — the panel will reject every heartbeat"
	}
	if cfg.PanelURL == "" {
		return "panel_url is empty — the edge has nowhere to push telemetry to"
	}
	// A listens-port of 4040 is fine for a single edge, but if the operator
	// registered multiple nodes pointing at localhost and reused the default
	// port, two edges would collide on bind. We can't detect collisions here
	// without trying to bind, but flagging a still-default port is a useful
	// nudge when an admin obviously is provisioning more than one edge.
	if cfg.ListenPort == 0 {
		return "listen_port is unset — defaulting to 4040; make sure no other ksedge on this host already uses it"
	}
	return ""
}

// runHealthServer exposes the operator-facing HTTP surface:
//
//	GET  /health                 — liveness probe
//	POST /api/edge/lifecycle     — panel→edge deploy/start/stop/destroy
//	GET  /api/edge/exec          — panel→edge WebSocket bridge for terminal/shell
//	POST /api/edge/exec-rpc      — panel→edge one-shot command exec (automation / process-kill)
//	GET/POST/DELETE /api/edge/files — panel→edge file manager (list/read/stat/write/upload/mkdir/rename/delete/chmod)
//	POST /api/edge/inspect       — panel→edge live state (metrics/processes/ports)
//	POST /api/edge/install       — panel→edge kick off an install workflow (async)
//	GET  /api/edge/install       — panel→edge poll an in-progress install
//	POST /api/edge/install/stop  — panel→edge cancel a running install + run stop_command
//	POST /api/edge/page-action   — panel→edge execute custom page actions (shell, file ops, driver cmds)
//	POST /api/edge/snapshot      — panel→edge create/restore/delete a workload snapshot
//	POST /api/edge/sftp/provision — panel→edge provision an SFTP identity (chrooted, bcrypt)
//	POST /api/edge/sftp/delete   — panel→edge remove an SFTP identity (destroy/suspend)
//	TCP  :2222 (--sftp-port)     — edge SSH/SFTP listener, one chroot per inst_<id>
//
// The lifecycle + files + inspect + install + page-action + snapshot + sftp + exec
// handlers are all gated by the same token the panel carries, so even if any
// of these were accidentally exposed through a reverse proxy without ACLs,
// an attacker would still need the panel-minted secret (kse_…) to do
// anything useful.
//
// Two subtle route-mounting notes (both were real production-impacting
// regressions before this fix):
//   - The install handler exposes TWO paths via its own internal ServeMux
//     (`/api/edge/install` and `/api/edge/install/stop`). Go's
//     http.ServeMux only subtree-matches a trailing-slash registration,
//     so registering the handler under the bare `/api/edge/install` (no
//     trailing slash) silently swallowed every POST to
//     `/api/edge/install/stop` as a 404 from the ROOT mux — the inner
//     handler's /stop route was never reached. Mounting the SAME handler
//     at both paths is the explicit, redirect-free fix the panel's
//     Client.InstallStop RPC depends on.
//   - The page-action endpoint is exercised by the panel's
//     instance_page_handler (the operator-authored custom pages). Its
//     handler has lived in internal/pageaction since the feature shipped,
//     but the route mount here was missing entirely, so every page-action
//     RPC the panel issued 404'd silently. Mount it now.
func runHealthServer(cfg config.Config, ctx context.Context, sftpPort int) error {
	port := cfg.ListenPortOr(4040)
	if sftpPort <= 0 || sftpPort > 65535 {
		sftpPort = sftp.DefaultPort
	}

	mux := http.NewServeMux()
	// /health is unauthenticated by design — it's the endpoint the panel's
	// active probe dials to distinguish "edge is alive" from "another process
	// is squatting the port". It returns no secret, only the edge's identity.
	mux.Handle("/health", health.Handler(cfg.Name, port))
	mux.Handle("/api/edge/lifecycle", lifecycle.Handler(cfg.Token))
	mux.Handle("/api/edge/exec", exec.Handler(cfg.Token))
	mux.Handle("/api/edge/exec-rpc", execrpc.Handler(cfg.Token))
	// Host-level one-shot exec: application runs targeting the HOST itself
	// (panel host fallback / a node's own filesystem) rather than a
	// container or VM. Same shared-token gate as every other RPC.
	mux.Handle("/api/edge/host-exec", hostexec.Handler(cfg.Token))
	mux.Handle("/api/edge/files", files.Handler(cfg.Token))
	mux.Handle("/api/edge/inspect", inspect.Handler(cfg.Token))
	// The install handler is itself a *ServeMux registering BOTH
	// /api/edge/install (POST start / GET poll) AND /api/edge/install/stop
	// (POST cancel + stop_command). To make the /stop sub-path actually
	// reachable through the ROOT mux without a trailing-slash redirect
	// (which would convert the POST into a stripped GET and silently drop
	// the request body the panel sent) we mount the SAME handler at both
	// literal paths.
	installHandler := install.Handler(cfg.Token)
	mux.Handle("/api/edge/install", installHandler)
	mux.Handle("/api/edge/install/stop", installHandler)
	mux.Handle("/api/edge/page-action", pageaction.Handler(cfg.Token))
	mux.Handle("/api/edge/snapshot", snapshot.Handler(cfg.Token))
	mux.Handle("/api/edge/ports/update", ports.Handler(cfg.Token))
	// SFTP provision/delete share one handler (own ServeMux with both
	// literal paths) so /delete is reachable without a trailing-slash
	// redirect — the same mount-both-paths fix the install handler needs.
	sftpHandler := sftp.Handler(cfg.Token)
	mux.Handle("/api/edge/sftp/provision", sftpHandler)
	mux.Handle("/api/edge/sftp/delete", sftpHandler)
	// Edge self-update (per-node Update & Reinstall UI): the update handler
	// is itself a *ServeMux registering all five paths, so mount the SAME
	// handler at each literal path to avoid trailing-slash redirects.
	updateHandler := update.Handler(cfg.Token)
	mux.Handle("/api/edge/update-info", updateHandler)
	mux.Handle("/api/edge/update-check", updateHandler)
	mux.Handle("/api/edge/update-apply", updateHandler)
	mux.Handle("/api/edge/reinstall", updateHandler)
	mux.Handle("/api/edge/reinstall-background", updateHandler)

	// Wrap the routing mux in two defensive middlewares so the edge stays
	// healthy under heavy / hostile load:
	//   - edgeBodyLimit caps the inbound request body per path. The small
	//     JSON RPCs (lifecycle / inspect / exec-rpc / page-action /
	//     snapshot / install start) are bounded to 1 MiB so a hostile peer
	//     can't pin edge RAM by streaming a 100 GB body into a JSON
	//     decoder. The file manager (op=write/upload) legitimately ships
	//     large binaries (server.jar, world backups) and gets a much larger
	//     cap that still bounds runaway uploads without breaking the
	//     streaming io.Copy the handler uses.
	//   - recoverPanic turns an unexpected nil-deref / out-of-bounds inside
	//     any handler into a logged structured 200-ish response instead of
	//     tearing the connection / spooking the panel's poller while leaving
	//     the daemon's other goroutines intact.
	wrapped := edgeBodyLimit(recoverPanic(mux))

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", port),
		Handler:           wrapped,
		ReadHeaderTimeout: 10 * time.Second, // Slowloris shield: clients must finish sending headers in 10s
		// ReadTimeout / WriteTimeout are intentionally left at 0 (unbounded)
		// because several endpoints are streaming workloads that outlast any
		// fixed budget legitimately: WebSocket terminal exec sessions can be
		// open for hours; the file manager streams 100+ MiB server.jar
		// uploads; install workflows polled over GET stay open while the
		// panel's long poll waits on the workflow's final transcript. Each
		// such long-running path already wraps its own per-op
		// context.WithTimeout (lifecycle 5 min, inspect 12 s, exec-rpc 5
		// min, page-action 30 s, snapshot 30 s, per-step install 30 min),
		// so a global Read/Write timeout would only break those streams
		// without adding real safety.
		IdleTimeout:    120 * time.Second, // drop idle keep-alives so thousands of panel polls don't queue forever
		MaxHeaderBytes: 1 << 20,           // 1 MiB header cap — anything larger is abusive
	}

	// The signal context is owned by the caller (launchCmd) and shared with
	// the heartbeat goroutine so a single SIGINT/SIGTERM stops both.

	// Run the server in a goroutine; the main goroutine waits for shutdown.
	errCh := make(chan error, 1)
	go func() {
		log.Printf("ksedge listening on http://localhost:%d/health", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// SFTP runs on its own listener (default :2222) next to HTTP. It holds
	// no state worth shutting down gracefully — in-memory credentials are
	// intentionally ephemeral (the panel re-provisions after a restart) —
	// so a failure here is logged, not fatal to the HTTP control plane.
	go func() {
		if err := sftp.Start(sftpPort); err != nil {
			log.Printf("sftp server stopped: %v", err)
		}
	}()

	select {
	case <-ctx.Done():
		log.Println("Shutting down ksedge…")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

// recoverPanic wraps an http.Handler in a deferred recover so a panic
// anywhere down the call chain is turned into a logged structured JSON
// response instead of:
//
//   - tearing the single in-flight HTTP connection (already true in net/http:
//     Go wraps each handler invocation in its own recover, but the default
//     handler recover closes the connection with NO response body, which
//     the panel's RPC layer then surfaces as an opaque "edge returned HTTP
//     <status>" or a truncated/empty decode error);
//   - leaving half-spawned child processes (e.g. a docker exec whose
//     stdout pipe was already wired when the panic fired) without a
//     deterministic teardown.
//
// Recovering here lets the OTHER goroutines the edge is serving keep
// running: the operator's terminal session, an unrelated file upload, the
// next install poll — none of these should die because a side-channel
// inspect call nil-dereferenced a driver struct.
//
// The recovered error is logged (so a developer running the agent sees the
// stack-relevant value next to the path) AND emitted as the wire-format the
// rest of the edge already uses — `{ok:false, error:"…"}` — so the panel's
// single decode path treats it the same way as any other edge-side
// failure.
func recoverPanic(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("ksedge: recovered panic on %s %s: %v", r.Method, r.URL.Path, rec)
				w.Header().Set("Content-Type", "application/json")
				// WriteHeader is a no-op if the handler already wrote one;
				// in that case the inline JSON below lands in an already-
				// started response and the panel's decoder sees a malformed
				// trailing chunk (which its existing "edge returned HTTP X"
				// path handles). For the common panic-before-any-write case
				// the status + JSON both land cleanly.
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"ok":    false,
					"error": "internal edge error (recovered)",
				})
			}
		}()
		h.ServeHTTP(w, r)
	})
}

// edgeBodyLimit caps the inbound request body per path so a hostile or
// runaway peer can't pin edge RAM by streaming a giant body into a JSON
// decoder. Two tiers:
//
//   - /api/edge/files: 4 GiB. The file manager legitimately ships large
//     binaries (server.jar is ~50 MiB; world tarballs can be hundreds of
//     MiB). The handler's write/upload path streams via io.Copy so the cap
//     never materialises as a 4 GiB allocation — the cap only bounds
//     runaway uploads (a hostile body that never ends) so the connection
//     terminates instead of consuming edge CPU + disk indefinitely.
//   - /api/edge/host-exec: 8 MiB. The JSON RPC carries the command plus an
//     optional inline script-file payload (application runs stage their
//     files through it), so it needs headroom above the plain-RPC tier;
//     the execstage validator still caps each file at 1 MiB / 4 MiB total.
//   - everything else: 1 MiB. The JSON RPCs (lifecycle request, inspect
//     exec-rpc request, page-action input, snapshot request,
//     install start []steps) are tiny structured messages; a body bigger
//     than 1 MiB is unambiguously abusive and rejecting it saves the JSON
//     decoder from naively decoding a malformed multi-megabyte blob into
//     memory.
//
// http.MaxBytesReader is wired through ResponseWriter so the underlying
// net/http server-side reader returns http.MaxBytesError once the limit is
// crossed, which causes io.ReadAll / io.Copy on r.Body to surface the
// truncation deterministically rather than silently reading until EOF.
func edgeBodyLimit(h http.Handler) http.Handler {
	const (
		smallLimit   int64 = 1 << 20 // 1 MiB — every JSON RPC
		hostExecLim  int64 = 8 << 20 // 8 MiB — host-exec with inline script files
		filesLimit   int64 = 4 << 30 // 4 GiB — file manager uploads (streamed, not buffered)
	)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil {
			h.ServeHTTP(w, r)
			return
		}
		limit := smallLimit
		switch r.URL.Path {
		case "/api/edge/files":
			limit = filesLimit
		case "/api/edge/host-exec", "/api/edge/exec-rpc":
			limit = hostExecLim
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		h.ServeHTTP(w, r)
	})
}
