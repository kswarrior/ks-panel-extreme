package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/example/kspanel/internal/api"
	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/banner"
	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/probe"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/scheduler"
	"github.com/example/kspanel/internal/security"
	"github.com/example/kspanel/internal/sysinfo"
	"github.com/spf13/cobra"
)

// Sweep fan-out bounds: the 60s node-probe, 2s install-poll and 10s
// metrics-poll loops all fan out one goroutine per due row. Without a cap a
// fleet of N rows dials N edges concurrently every tick, and a slow edge
// (15s install RPC, 10s inspect RPC) is still in-flight when the next tick
// fires — stacking duplicate RPCs for the same row. The semaphores cap
// concurrent dials (excess rows skip this tick and retry on the next) and
// the in-flight sets dedup overlapping polls for the same instance.
var (
	nodeProbeSem    = make(chan struct{}, 8)
	installPollSem  = make(chan struct{}, 8)
	metricsPollSem  = make(chan struct{}, 16)
	sweepInflightMu sync.Mutex
	installInflight = map[int64]struct{}{}
	metricsInflight = map[int64]struct{}{}
)

func sweepTryAcquire(sem chan struct{}) bool {
	select {
	case sem <- struct{}{}:
		return true
	default:
		return false
	}
}

func sweepRelease(sem chan struct{}) {
	select {
	case <-sem:
	default:
	}
}

func markInflight(m map[int64]struct{}, id int64) bool {
	sweepInflightMu.Lock()
	defer sweepInflightMu.Unlock()
	if _, ok := m[id]; ok {
		return false
	}
	m[id] = struct{}{}
	return true
}

func unmarkInflight(m map[int64]struct{}, id int64) {
	sweepInflightMu.Lock()
	defer sweepInflightMu.Unlock()
	delete(m, id)
}

// launchCmd starts the HTTP API server and serves the embedded UI.
var launchCmd = &cobra.Command{
	Use:   "launch",
	Short: "Start the API server and serve the UI",
	RunE:  runLaunch,
}

func init() {
	launchCmd.Flags().IntP("port", "p", config.DefaultPort(), "Port to listen on")
	launchCmd.Flags().String("type", "", "Database engine: sqlite (default), postgres, mysql/mariadb — or \"ddos\" to start on a temporary port that is NOT saved as the last port")
	launchCmd.Flags().String("dsn", "", "Full database DSN (overrides --url); file path for sqlite, conn string for postgres/mysql")
	launchCmd.Flags().String("url", "", "Database host:port (e.g. localhost:5432) — friendlier alternative to --dsn for postgres/mysql")
	launchCmd.Flags().String("user", "", "Database username — paired with --url for postgres/mysql")
	launchCmd.Flags().String("password", "", "Database password — paired with --url for postgres/mysql")
	launchCmd.Flags().String("database", "", "Database name — paired with --url for postgres/mysql (defaults to kspanel)")
}

func runLaunch(cmd *cobra.Command, args []string) error {
	port, err := cmd.Flags().GetInt("port")
	if err != nil {
		return err
	}

	// Resolve the effective port with the same precedence as every other
	// operator-facing surface: explicit --port flag (set above) > KSPANEL_PORT
	// env var > last-persisted port from the settings KV > DefaultPort().
	// The KV lookup lets a bare `kspanel launch` (no flags, no env) come back
	// on the same port the operator was already using — important for the
	// reinstall script, which can't easily forward --port when it spawns the
	// new binary from inside its own cleanup chain.
	if !cmd.Flags().Changed("port") {
		if envPort := os.Getenv("KSPANEL_PORT"); envPort != "" {
			if n, perr := strconv.Atoi(envPort); perr == nil && n >= 1 && n <= 65535 {
				port = n
			}
		} else if db, dberr := repository.OpenDB(); dberr == nil {
			if saved := repository.NewSettingsRepository(db).PanelPort(); saved > 0 {
				port = saved
			}
			db.Close()
		}
	}

	// Apply any persisted kspanel.env (admin "Change Database" writes here)
	// before resolving the CLI flags — env vars and CLI flags still win
	// because LoadEnvFile only sets keys the operator hasn't already set.
	config.LoadEnvFile()

	typ, _ := cmd.Flags().GetString("type")
	dsn, _ := cmd.Flags().GetString("dsn")
	urlFlag, _ := cmd.Flags().GetString("url")
	userFlag, _ := cmd.Flags().GetString("user")
	passFlag, _ := cmd.Flags().GetString("password")
	dbFlag, _ := cmd.Flags().GetString("database")
	eng := strings.ToLower(strings.TrimSpace(typ))

	// --dsn wins over --url when both are given (power-user override). When
	// only --url is passed we build the engine's native DSN from the
	// friendlier host:port + user/pass/db tuple. Mirrors runSeed.
	if dsn == "" && urlFlag != "" {
		if built, ok := config.BuildDSNFromURL(eng, urlFlag, userFlag, passFlag, dbFlag); ok {
			dsn = built
		}
	}

	// "--type ddos" is RESERVED as the DDoS emergency launch mode (used by
	// ddos.sh, internal/api/handlers/ddos_script_handler.go): the panel
	// starts on the alternate port and that port is NOT persisted into the
	// settings KV below, so the saved last port keeps pointing at the
	// original port for the next normal start. "ddos" is not a database
	// engine — clear it here so SetDatabaseType never sees it.
	ddosTempPort := false
	if strings.EqualFold(strings.TrimSpace(typ), "ddos") {
		ddosTempPort = true
		typ = ""
	}

	if typ != "" || dsn != "" {
		config.SetDatabaseType(strings.ToLower(strings.TrimSpace(typ)), dsn)
	}
	cfg := config.DatabaseConfig()

	// Print the banner FIRST so the operator sees the brand even if the
	// DB bootstrap fails halfway through — they'll see "Panel" + a problem,
	// not a silent context-less log dump.
	banner.Print()

	// Per-migration messages go through the Go stdlib log package which
	// adds a timestamp + file:line — useful during development but noisy
	// in the optimistic output most operators want at launch. We redirect
	// the standard logger to /dev/null during the migration phase and
	// restore it once the DB is settled. KSPANEL_LOG=verbose turns this
	// off (logs preserved) for anyone who's debugging a schema step.
	silenceStandardLog()
	defer restoreStandardLog()

	addr := fmt.Sprintf(":%d", port)
	bind := localNonLoopback()
	// The URL the operator should open in a browser. We prefer the first
	// non-loopback IP for box-to-box access; if no such addr is reported
	// by net.InterfaceAddrs, fall back to "localhost".
	host := "localhost"
	if len(bind) > 0 {
		host = bind[0]
	}
	url := "http://" + host + addr

	// If the default port (5050) is already occupied, auto-select a free port
	// now so the banner and the later net.Listen both reflect the same
	// corrected port. This keeps the UX tidy: a busy dev box with 5050 taken
	// still boots without the operator having to guess --port. Only the
	// default 5050 gets this treatment — an explicit non-default --port
	// (e.g. 8080) still fails hard at bind so the requested port is not
	// silently ignored.
	if port == config.DefaultPort() {
		if lnTest, errTest := net.Listen("tcp", addr); errTest != nil {
			if strings.Contains(errTest.Error(), "already in use") || strings.Contains(errTest.Error(), "address already in use") {
				if lnFree, errFree := net.Listen("tcp", ":0"); errFree == nil {
					newPort := lnFree.Addr().(*net.TCPAddr).Port
					lnFree.Close()
					print.Step("listen", fmt.Sprintf("port %d was in use — auto-selected :%d", config.DefaultPort(), newPort))
					port = newPort
					addr = fmt.Sprintf(":%d", port)
					url = "http://" + host + addr
				}
			}
		} else {
			lnTest.Close()
		}
	}

	print.Step("database", fmt.Sprintf("%s — %s", cfg.Engine, dbPathLabel(cfg, nil)))
	con, d, err := db.Open(cfg)
	if err != nil {
		print.Error("paneld", fmt.Sprintf("open db: %v", err))
		return fmt.Errorf("open db: %w", err)
	}
	if err := db.EnsureSchemaAndSeed(d, con); err != nil {
		con.Close()
		print.Error("paneld", fmt.Sprintf("prepare db: %v", err))
		return fmt.Errorf("prepare db: %w", err)
	}
	con.Close()
	// Migration phase over — bring stdlib logging back online.
	restoreStandardLog()
	print.OK("database", d.Name()+" ready")

	print.Step("ui", "embedded bundle")
	print.OK("ui", "served from api/handlers")

	srv := &http.Server{
		Addr:              addr,
		Handler:           api.NewRouter(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// WriteTimeout bounds non-hijacked responses (hijacked WebSockets
		// are exempt per net/http semantics) while staying above the 110s
		// AI-chat outer deadline so healthy SSE streams are not killed.
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

// Start the node-staleness sweep. Once a minute we flip every edge whose
// last heartbeat is older than 90s to "down" and record a "down" bucket
// so the uptime % reflects the outage honestly. Run this in the panel,
// not the edge, so a crashed edge still shows red. The same loop fans
// out per-edge active probes for edges whose health_enabled flag is on
// and whose next_probe_at window has elapsed (migration 019).
go nodeSweepLoop(90*time.Second, time.Minute)

	// Start the install workflow poller. Every ~2s we scan instances with
	// install_state="running" and poll their edge's /api/edge/install endpoint.
	// On done → status="running"; on failed → status="install_failed"
	// for installs, "errored" for invoked actions.
	// This decouples the long-running install (apt, big downloads, git clones)
	// from the 15s deploy RPC window and the 5m lifecycle envelope.
	go installSweepLoop(2*time.Second)

	// Start the per-instance live-state poller. Every ~10s we scan every
	// running/installing instance, dial its edge's /api/edge/inspect, and
	// persist the returned metrics/processes/ports blob into
	// instance_live_state. The SPA's /instances listing reads this cache
	// via /api/instances/cached-resources and renders the card's CPU/RAM/Disk
	// rings from it — without this loop, a fresh deploy shows only the
	// configured limits (template spec.limits → 2 vCPU / 2 GB / 10 GB) and
	// "0%" / "—" for the live usage until an operator opens a detail page.
	// See metricsSweepLoop's doc for cadence / fleet-sizing rationale.
	go metricsSweepLoop(10*time.Second)

	// Start the rolling time-series sampler for the dashboard's host-monitor
	// charts (CPU%/RAM%/load1 — 1s cadence, 60s window). Must start before
	// the listener so the first dashboard round-trip after launch already
	// has one or two real data points instead of a flat line.
	sysinfo.Start()

	// Start the per-instance automation scheduler. It sweeps Due() automation
	// jobs every minute and dials the owning edge's exec-rpc with each job's
	// command + resolved secrets. Lives panel-side so a crashed panel stops
	// auto-firing cleanly (no orphaned loops on the edge).
	schedCtx, schedCancel := context.WithCancel(context.Background())
	defer schedCancel()
	scheduler.Start(schedCtx)

	// Start the ticket/notification mail worker (065): in-process queue with
	// retries (3 attempts, 2s/10s backoff). Handlers EnqueueMail and return
	// immediately so a down SMTP relay never blocks the ticket/notifications
	// HTTP path. Idempotent — safe to call once per launch.
	repository.StartMailWorker(schedCtx)

	// Start the security_requests retention sweep. Every 10 minutes we drop
	// any rows older than 24h so the table stays bounded on a busy panel
	// under sustained attack. The middleware's INSERT path is unaffected
	// (it's append-only), but the Snapshot's window scans stay cheap.
	go securityRetentionLoop(24*time.Hour, 10*time.Minute)

	// Print a tidy block of static-looking panel information right before
	// the listener kicks off. We want a single human-readable summary so
	// someone ssh'd into the box can see "yep, the panel is up" without
	// paging through the migration log lines.
	fmt.Println()
	print.KV("panel pid", fmt.Sprintf("%d", os.Getpid()))
	print.KV("engine", d.Name())
	print.KV("dsn", dbPathLabel(cfg, d))
	print.KV("listen", addr)
	print.KV("open", url)
	print.KV("bind ifs", strings.Join(bind, ", "))
	print.KV("go", strings.TrimPrefix(runtime.Version(), "go"))
	print.KV("goos", runtime.GOOS+"/"+runtime.GOARCH)
	print.KV("cpus", fmt.Sprintf("%d", runtime.NumCPU()))

	// Graceful shutdown handling — deferred until after the listener up so
	// a Ctrl-C comes through cleanly whether the server runs forever or
	// pulls a 0-port bind error.
	go func() {
		c := make(chan os.Signal, 2)
		signal.Notify(c, os.Interrupt, syscall.SIGTERM)
		defer signal.Stop(c)
		select {
		case <-c:
			log.Println("Shutting down server (signal)…")
		case <-handlers.ShutdownChan():
			log.Println("Shutting down server (API request)…")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		// Log instead of Fatal: a Shutdown error during the graceful path
		// must not flip the process exit code to 1 — the listener below
		// still reports servingDone and runLaunch returns nil.
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Server Shutdown returned: %v", err)
		}
	}()

	fmt.Println()
	print.OK("panel ready", "running")

	warnDuplicatePanelProcesses()

	// Bind the TCP listener ourselves so we can wrap it with the
	// DDoS-active gate (internal/security/ddoslistener.go). The wrapper
	// inspects the live security state at the moment each connection
	// is accepted and sheds sockets without parsing a byte of the
	// request while a stop-mode auto-stop is active. This is the
	// strongest defense the panel can run at the application layer:
	// under a flood, each refused connection costs us one atomic load
	// plus an immediate EOF close, so the goroutine count and memory
	// footprint stay flat regardless of attack volume.
	ln, lerr := net.Listen("tcp", addr)
	if lerr != nil {
		// If the default port (5050) is already in use and the operator did not
		// explicitly request this port via --port, auto-select a free ephemeral
		// port instead of failing. This covers: bare `launch` with DefaultPort,
		// KSPANEL_PORT=5050, or a persisted DB panel_port == 5050 that collides
		// with another process on the host. An explicit --port 5050 still
		// respects the same fallback so the panel stays usable on busy dev
		// machines — only a non-default explicit port (e.g. --port 8080) fails
		// hard so the operator notices the requested port is unavailable.
		shouldAutoFallback := strings.Contains(lerr.Error(), "already in use") ||
			strings.Contains(lerr.Error(), "address already in use")
		isDefaultPort := port == config.DefaultPort()
		if shouldAutoFallback && isDefaultPort {
			// Try ephemeral port :0 — kernel picks a free one.
			if ln2, err2 := net.Listen("tcp", ":0"); err2 == nil {
				actualPort := ln2.Addr().(*net.TCPAddr).Port
				print.Step("listen", fmt.Sprintf("port %d was in use — auto-selected :%d", port, actualPort))
				port = actualPort
				addr = fmt.Sprintf(":%d", port)
				ln = ln2
				lerr = nil
			} else {
				print.Error("listen", lerr.Error())
				return fmt.Errorf("failed to bind port %d: %w", port, lerr)
			}
		} else {
			print.Error("listen", lerr.Error())
			return fmt.Errorf("failed to bind port %d: %w", port, lerr)
		}
	}
	state := security.Get()
	ln = security.NewDDoSDroppingListener(ln, state)

	// Restore the live auto-stop flag from the persisted cooldown so a
	// restart mid-cooldown doesn't silently resume normal serving (which
	// would immediately move the panel back under an ongoing flood).
	state.SeedDDOSFromDB()

	// A --type ddos launch (ddos.sh emergency switch) parks on the
	// alternate port for ONE cooldown window and then returns to the real
	// port. Two things make that return actually happen:
	//
	//   1. homePort = the saved panel_port read BEFORE anything else — the
	//      persist step below is skipped in ddos mode, so this is still
	//      the operator's original port. The switcher re-binds it when the
	//      window closes.
	//   2. If no live attack window exists yet (the Test Reaction flow
	//      restarts the panel without going through /ddos/stop), arm one
	//      now using DDOSStopMinutes and persist it, so a crash mid-window
	//      comes back parked instead of dropping onto the attacked port.
	homePort := 0
	if ddosTempPort {
		if con, herr := repository.OpenDB(); herr == nil {
			homePort = repository.NewSettingsRepository(con).PanelPort()
			con.Close()
		}
		if !state.DDOSActive() {
			minutes := state.Cfg().DDOSStopMinutes
			if minutes <= 0 {
				minutes = 5
			}
			until := time.Now().Add(time.Duration(minutes) * time.Minute)
			state.SetDDOSActive(true, until)
			if con, cerr := repository.OpenDB(); cerr == nil {
				_ = repository.NewSecurityRepository(con).SetDDOSCooldownUntil(until)
				con.Close()
			}
			log.Printf("ddos launch: parked on :%d until %s, will return to :%d", port, until.Format(time.RFC3339), homePort)
		}
	}

	// Hand serving over to the port switcher: it serves on the listener
	// above, and when a DDoS reaction in "port_switch" mode fires it
	// re-binds this same http.Server onto the alternate port at runtime
	// (and back once the cooldown expires) without dropping in-flight
	// requests. The returned channel closes after srv.Shutdown, exactly
	// like the old direct srv.Serve(ln) call did. homePort drives the
	// --type ddos return-home move described above.
	servingDone := security.StartPortSwitcher(srv, ln, port, homePort)

	// Persist the bound port so a follow-up bare `kspanel launch` (no
	// --port flag, no KSPANEL_PORT env var) reuses the same port the
	// reinstall script will spawn next. We open a fresh DB connection
	// here because the migration phase above already closed its handle;
	// reusing it would race with the listener goroutines that are about
	// to start below. Errors are intentionally swallowed — the panel
	// must still start if the KV write fails. (The switcher overwrites
	// this key whenever a DDoS reaction moves the panel, so restarts
	// come back on whichever port is actually safe.)
	//
	// ddosTempPort (--type ddos) opts OUT of that write: the ddos.sh
	// emergency script starts the panel on the DDoS alternate port with
	// this flag, and that port must stay temporary — the saved panel_port
	// keeps pointing at the original port so the next normal start comes
	// back to it. Any other --type value persists as usual.
	if !ddosTempPort {
		if persistDB, perr := repository.OpenDB(); perr == nil {
			_ = repository.NewSettingsRepository(persistDB).SetPanelPort(port)
			persistDB.Close()
		}
	}

	// Write <exe>.pid so `kspanel stop` can SIGTERM this exact process via
	// stopViaPIDFile instead of falling through to pkill. Removed on
	// graceful shutdown below; a crash leaves it stale and stop.go's
	// pidBelongsToUs guard already handles that case.
	pidPath := pidFilePath()
	if pidPath != "" {
		if werr := os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0o644); werr != nil {
			log.Printf("launch: write pid file: %v", werr)
			pidPath = ""
		}
	}

	<-servingDone
	if pidPath != "" {
		if rerr := os.Remove(pidPath); rerr != nil && !os.IsNotExist(rerr) {
			log.Printf("launch: remove pid file: %v", rerr)
		}
	}
	return nil
}

// pidFilePath returns the <exe>.pid path stopViaPIDFile reads. Empty when
// the executable path cannot be determined — the caller then skips the
// PID-file lifecycle and stop falls back to pkill as before.
func pidFilePath() string {
	exe, err := os.Executable()
	if err != nil || exe == "" {
		return ""
	}
	return exe + ".pid"
}

// warnDuplicatePanelProcesses scans /proc for OTHER running kspanel
// processes (matched on the executable, not arguments) and prints a loud
// warning when found. Why:
// the #1 way the DDoS port switcher "stops working" is a second panel
// instance left behind by an update/reinstall — it keeps serving the old
// port forever, and no code in THIS process can close another process's
// socket. Surfacing the duplicate at launch turns a mysterious symptom into
// a one-line fix (stop the extra PID). Linux-only best effort; other OSes
// skip silently.
func warnDuplicatePanelProcesses() {
	if runtime.GOOS != "linux" {
		return
	}
	self := strconv.Itoa(os.Getpid())
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return
	}
	var dups []string
	for _, e := range entries {
		if !e.IsDir() || e.Name() == self {
			continue
		}
		if _, err := strconv.Atoi(e.Name()); err != nil {
			continue // not a pid directory
		}
		raw, err := os.ReadFile("/proc/" + e.Name() + "/cmdline")
		if err != nil {
			continue // raced exit or no permission — skip quietly
		}
		// Only the EXECUTABLE counts (argv[0]). Matching the whole command
		// line would flag unrelated wrapper shells that merely mention
		// kspanel in their arguments.
		parts := strings.SplitN(string(raw), "\x00", 2)
		if len(parts) == 0 || parts[0] == "" {
			continue
		}
		exe := parts[0]
		if i := strings.LastIndexByte(exe, '/'); i >= 0 {
			exe = exe[i+1:]
		}
		if !strings.Contains(exe, "kspanel") {
			continue
		}
		cmdline := strings.TrimSpace(strings.ReplaceAll(string(raw), "\x00", " "))
		// Only a second `launch` server can actually hold a port open.
		// Short-lived sibling invocations of the same binary (seed,
		// setup:localnode, create:user, …) share argv[0] but exit on
		// their own and must not trip the duplicate-server warning —
		// otherwise every setup:localnode auto-start flags its own
		// parent. Mirrors stop.go pkillPanel, which only targets
		// "… launch" invocations for the same reason.
		if !strings.Contains(cmdline, "launch") {
			continue
		}
		dups = append(dups, fmt.Sprintf("pid %s: %s", e.Name(), cmdline))
	}
	for _, dup := range dups {
		print.Error("duplicate", fmt.Sprintf("%s — stop the old instance so DDoS port switching can free ports cleanly", dup))
	}
}

// nodeSweepLoop periodically marks edges whose heartbeats went stale as "down".
// A stale edge never calls the panel, so nothing else would flip its monitor
// red on its own. On each tick it also drives the per-edge active health
// check for edges whose health_enabled flag is on and whose next_probe_at
// window has elapsed — the depth of retries / flip-to-down logic lives in
// RecordProbe so the loop here stays a thin fan-out. The loop swallows DB
// errors so a transient blip doesn't kill the sweep goroutine.
func nodeSweepLoop(threshold, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		con, err := repository.OpenDB()
		if err != nil {
			continue
		}
		repo := repository.NewNodeRepository(con)
		_, _ = repo.MarkStale(threshold)
		// Active /health probes for due edges. Done in a goroutine-per-node
		// so a slow edge's dial doesn't gate the sweep's staleness pass
		// (and its own ticker). Errors are isolated — one unreachable edge
		// can't poison the others.
		if due, derr := repo.NodesDueForHealthCheck(); derr == nil {
			for _, nd := range due {
				// Bound concurrent probes: skip this tick when 8 are already
				// in-flight (next 60s tick retries). A slow edge's dial no
				// longer stacks unbounded goroutines across ticks.
				if !sweepTryAcquire(nodeProbeSem) {
					continue
				}
				go func(nd models.Node) {
					defer sweepRelease(nodeProbeSem)
					res := probe.Probe(nd)
					pcon, perr := repository.OpenDB()
					if perr != nil {
						return
					}
					defer pcon.Close()
					_ = repository.NewNodeRepository(pcon).RecordProbe(nd.ID, repository.ProbeInput{
						Reachable: res.Reachable,
						SeenName:  res.SeenName,
						CheckedAt: time.Now().UTC(),
					})
				}(nd)
			}
		}
		con.Close()
	}
}

// securityRetentionLoop periodically drops security_requests rows older
// than `age` so the table doesn't grow unbounded on a busy panel under
// sustained attack. Mirrors the nodeSweepLoop pattern above: thin ticker
// loop that opens its own DB connection per tick and swallows transient
// errors so the goroutine never dies.
func securityRetentionLoop(age, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		con, err := repository.OpenDB()
		if err != nil {
			continue
		}
		repo := repository.NewSecurityRepository(con)
		_, _ = repo.PurgeBefore(age)
		con.Close()
	}
}

// localNonLoopback returns the local / non-loopback IPv4/IPv6 addresses
// the panel would be reachable on. Used only for the launch banner so the
// operator can see at a glance "if you're testing from inside the box,
// try these URLs". The returned slice is sorted to keep two consecutive
// launches byte-identical.
func localNonLoopback() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return []string{"localhost"}
	}
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		var ip net.IP
		switch v := a.(type) {
		case *net.IPNet:
			ip = v.IP
		case *net.IPAddr:
			ip = v.IP
		default:
			continue
		}
		if ip.IsLoopback() || ip.IsLinkLocalUnicast() {
			continue
		}
		if ip.To4() == nil && ip.To16() == nil {
			continue
		}
		out = append(out, ip.String())
	}
	if len(out) == 0 {
		return []string{"localhost"}
	}
	return out
}

// installSweepLoop polls the edge for install workflow progress on all
// instances currently in "installing" state. It runs every `interval`
// (default ~2s) and:
//  1. Finds instances with install_state = 'running'
//  2. For each, calls edge.InstallStatus with the stored install_id
//  3. Updates the instance row with the polled state/step/error
//  4. On state="done" → sets instance status="running", install_state="done"
//  5. On state="failed" → sets instance status="install_failed"
//     (installs) or "errored" (invoked actions), install_state="failed"
//  6. On state="unknown" (edge restarted) → marks failed with "edge lost install state"
//
// The loop swallows DB/edge errors so a transient blip doesn't kill the
// goroutine. Each instance is polled in its own goroutine so a slow edge
// doesn't gate the others.
func installSweepLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		con, err := repository.OpenDB()
		if err != nil {
			continue
		}

		// Find instances with install_state = 'running'.
		// We query kind + name + install_id together so we don't have to
		// re-parse install_id (which is "<kind>:<name>") on every poll —
		// using the canonical columns keeps the poll logic immune to any
		// future change in the install_id format (e.g. names that contain
		// a colon, which would break a SplitN).
		rows, err := con.Query(`SELECT id, node_id, kind, name, install_id, install_kind, install_auto_stop, install_action_id FROM instances WHERE install_state = 'running'`)
		if err != nil {
			con.Close()
			continue
		}
		type instRow struct {
			id            int64
			nodeID        int64
			kind          string
			name          string
			installID     string
			installKind   string
			installAutoStop int
			installActionID string
		}
		var toPoll []instRow
		for rows.Next() {
			var r instRow
			if err := rows.Scan(&r.id, &r.nodeID, &r.kind, &r.name, &r.installID, &r.installKind, &r.installAutoStop, &r.installActionID); err == nil && r.installID != "" {
				toPoll = append(toPoll, r)
			}
		}
		rows.Close()
		con.Close()

		if len(toPoll) == 0 {
			continue
		}

		// Poll each in parallel so one slow edge doesn't block the rest,
		// bounded to 8 concurrent dials with per-instance dedup: a 15s
		// InstallStatus RPC still in-flight when the next 2s tick fires
		// skips the duplicate poll instead of stacking a second RPC.
		for _, ir := range toPoll {
			if !markInflight(installInflight, ir.id) {
				continue
			}
			if !sweepTryAcquire(installPollSem) {
				unmarkInflight(installInflight, ir.id)
				continue
			}
			go func(inst instRow) {
				defer sweepRelease(installPollSem)
				defer unmarkInflight(installInflight, inst.id)
				con2, err := repository.OpenDB()
				if err != nil {
					return
				}
				defer con2.Close()

				instRepo2 := repository.NewInstanceRepository(con2)
				nodeRepo2 := repository.NewNodeRepository(con2)

				node, err := nodeRepo2.GetNode(inst.nodeID)
				if err != nil {
					return
				}
				token, err := nodeRepo2.PlainToken(inst.nodeID)
				if err != nil || token == "" {
					return
				}

				ec := edge.NewWithTimeout(*node, token, 15*time.Second)
				// Use the canonical kind + name columns from the row rather
				// than re-parsing install_id (which is "<kind>:<name>"). Using
				// the columns keeps the poll immune to any future change in
				// the install_id format (e.g. instance names that contain a
				// colon, which would break a SplitN).
				resp, err := ec.InstallStatus(edge.InstallStatusRequest{
					Token: token,
					Kind:  inst.kind,
					Name:  inst.name,
				})
				if err != nil {
					// Edge unreachable or auth failed — don't flip state, retry
					// on next tick. Only log to avoid noise.
					log.Printf("install poll: instance %d edge error: %v", inst.id, err)
					return
				}

			stepsJSON, _ := json.Marshal(resp.Steps)
			switch resp.State {
		case "done":
			// Flip install_state to 'done' BEFORE clearing install_kind +
			// install_action_id. The container stop RPC that follows can
			// take up to ~30s on a slow host, so the row stays in this
			// "done but kind/action_id still set" snapshot for a while —
			// which is fine because install_state==='done' already tells
			// StopActionHandler "no workflow to cancel" and returns the
			// harmless 409 the UI swallows. The previous order (clear
			// kind/action_id first) opened a race window where the row
			// showed (state=running, kind='', action_id='') for a few ms,
			// which StopActionHandler interpreted as "workflow running
			// but not the action you think it is" → operator saw a 502
			// from a stale Stop click that the Actions card had already
			// rendered as the in-flight Stop button.
			_ = instRepo2.UpdateInstallStatus(inst.id, "done", inst.installID, -1, "", string(stepsJSON))
			_ = instRepo2.SetInstallKind(inst.id, "", 0)
			_ = instRepo2.SetInstallActionID(inst.id, "")

			// Container post-completion policy. Two cases:
			//
			//  1. install_kind='' — this was the template's own install
			//     workflow (download server.jar, write eula, touch sentinel).
			//     Per the install-complete-means-stopped contract: the panel
			//     explicitly STOPs the container on the edge and sets the
			//     row to status=stopped. The container's startup command is
			//     intentionally NOT a long-running workload — production
			//     workloads (Minecraft java, Node.js apps, etc.) are launched
			//     by the operator clicking an Action button on the instance
			//     home page, which calls the edge lifecycle "start" RPC if
			//     the container is stopped, then exec's the action's command
			//     inside. Leaving the container running post-install would
			//     mean "the card says running but the service doesn't
			//     answer" — confusing and wasteful on the host.
			//
			//  2. install_kind='action' — the operator invoked a template
			//     action (e.g. "Start Java"). Respect install_auto_stop:
			//       auto_stop=1 → the action wants the container torn down
			//         once its foreground process exits (auto_stop_on_exit).
			//         For long_running actions like the Minecraft java step
			//         we then call lifecycle{stop} here; the row goes to
			//         "stopped" and a fresh action invocation can boot it
			//         again via auto_start_instance.
			//       auto_stop=0 → the action was a one-off command (e.g. a
			//         "backup" step) and the container should KEEP running.
			//         We leave the container where it is and set status
			//         back to "running" (the state before the action).
			//
			// The stop RPC is best-effort: if the edge is unreachable we
			// still mark the instal as "done" so the banner resolves — the
			// container will be cleaned up by the next start/stop action
			// the operator issues, or by destroy.
			shouldStop := inst.installKind != "action" || inst.installAutoStop != 0
			var nextStatus string
			if shouldStop {
				_, stopErr := ec.Lifecycle(edge.LifecycleRequest{
					Action: "stop",
					Kind:   inst.kind,
					Name:   inst.name,
				})
				if stopErr != nil {
					log.Printf("install poll: instance %d done, but stop RPC failed: %v", inst.id, stopErr)
				}
				nextStatus = "stopped"
				log.Printf("install poll: instance %d done (container stopped)", inst.id)
			} else {
				// action that opted out of auto-stop → leave running.
				nextStatus = "running"
				log.Printf("install poll: instance %d action done (container kept running)", inst.id)
			}
			_ = instRepo2.SetStatus(inst.id, nextStatus, "", "")
		case "failed":
			// Find the failing step's index for install_step.
			stepIdx := -1
			for _, s := range resp.Steps {
				if s.Status == "failed" {
					stepIdx = s.Index
					break
				}
			}
			// Flip install_state to 'failed' BEFORE clearing kind/action_id —
			// same race-window rationale as the "done" branch above. A
			// concurrent operator Stop click must see install_state!='running'
			// rather than the transient (running, kind='', action_id='')
			// snapshot that would otherwise make StopActionHandler return 502.
			_ = instRepo2.UpdateInstallStatus(inst.id, "failed", inst.installID, stepIdx, resp.Error, string(stepsJSON))
			_ = instRepo2.SetInstallKind(inst.id, "", 0)
			_ = instRepo2.SetInstallActionID(inst.id, "")
			// Status mirrors WHAT failed: a template install workflow that
			// fails is "install_failed"; an invoked ACTION that fails (or is
			// killed by its own max_runtime_s budget) reuses the install
			// engine but is NOT an install — stamping it "install_failed"
			// made the card claim an install the operator never started.
			// Actions surface as "errored" with the edge's reason instead.
			nextStatus := "install_failed"
			if inst.installKind == "action" {
				nextStatus = "errored"
			}
			_ = instRepo2.SetStatus(inst.id, nextStatus, "", resp.Error)
			log.Printf("install poll: instance %d failed (kind=%s): %s", inst.id, inst.installKind, resp.Error)
		case "unknown":
			// Edge lost the record (restarted mid-install). Mark failed.
			// Flip install_state first for the same race-window rationale
			// as the "done"/"failed" branches above.
			_ = instRepo2.UpdateInstallStatus(inst.id, "failed", inst.installID, -1, "edge lost install state (edge restarted?)", string(stepsJSON))
			_ = instRepo2.SetInstallKind(inst.id, "", 0)
			_ = instRepo2.SetInstallActionID(inst.id, "")
			// Same action-vs-install distinction as the "failed" branch.
			unknownStatus := "install_failed"
			if inst.installKind == "action" {
				unknownStatus = "errored"
			}
			_ = instRepo2.SetStatus(inst.id, unknownStatus, "", "edge lost install state")
			log.Printf("install poll: instance %d unknown (edge restart?)", inst.id)
		case "running":
			// Update step progress so the UI can show a progress bar.
			curStep := -1
			for _, s := range resp.Steps {
				if s.Status == "running" {
					curStep = s.Index
					break
				}
			}
			_ = instRepo2.UpdateInstallStatus(inst.id, "running", inst.installID, curStep, "", string(stepsJSON))
		}
	}(ir)
	}
}
}

// metricsSweepLoop polls /api/edge/inspect for every RUNNING instance and
// refreshes its row in instance_live_state on a steady cadence. The SPA's
// /instances listing (and dashboard, instance home, metrics page) all read
// instance_live_state via the bulk /api/instances/cached-resources endpoint
// rather than dialing the edge per-render — so without this loop, a card
// on /instances shows only the configured limits (template's spec.limits
// → 2 vCPU, 2.0 GB, 10 GB) and "—" or "0%" for the live usage until the
// operator manually opens a detail page (Processes / Metrics / Ports),
// each of which has its own refreshLiveState call. That UX is bad — a
// Minecraft container can be running fine on the edge and the panel
// claims the operator has no live telemetry for it.
//
// The loop mirrors installSweepLoop's pattern: query for the rows we care
// about, dial the edge in parallel goroutines (one slow edge can't gate
// the rest), persist whatever the driver returned. We only poll instances
// whose status is "running" (or "installing") — stopped / destroyed /
// errored containers report no useful metrics and a `docker exec` against
// them is wasted RPC traffic. The interval is intentionally longer than
// installSweepLoop's 2s — telemetry doesn't need that resolution and a
// fleet of N instances would otherwise overwhelm the panel with N dials
// every tick. 10s is the sweet spot: the card's % ring shows fresh data
// within a few seconds of refresh, and a busy fleet (50 instances) dials
// the edges at ~5 req/s total — well under any single-edge dials-cap.
//
// Edge dial failures are swallowed so a transient blip on one node can't
// kill the goroutine. The previous cached row stays put, and the next
// tick retries — exactly the same "best-effort, never 5xx" guarantee the
// cached-resources handler enforces on read.
func metricsSweepLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		con, err := repository.OpenDB()
		if err != nil {
			continue
		}

		// Statuses worth polling: "running" (steady-state) and "installing"
		// (container is up, install workflow in flight — its real CPU/RAM
		// usage is still useful for the operator to see whether the
		// install workflow is hammering the container or quietly idling).
		rows, err := con.Query(`SELECT id, node_id, kind, external_id, name FROM instances WHERE status IN ('running', 'installing')`)
		if err != nil {
			con.Close()
			continue
		}
		type instRow struct {
			id         int64
			nodeID     int64
			kind       string
			externalID string
			name       string
		}
		var toPoll []instRow
		for rows.Next() {
			var r instRow
			if err := rows.Scan(&r.id, &r.nodeID, &r.kind, &r.externalID, &r.name); err == nil {
				toPoll = append(toPoll, r)
			}
		}
		rows.Close()
		con.Close()

		if len(toPoll) == 0 {
			continue
		}

		for _, ir := range toPoll {
			// Bound to 16 concurrent inspects with per-instance dedup: a
			// 10s Inspect RPC still in-flight when the next 10s tick fires
			// skips the duplicate instead of stacking a second dial.
			if !markInflight(metricsInflight, ir.id) {
				continue
			}
			if !sweepTryAcquire(metricsPollSem) {
				unmarkInflight(metricsInflight, ir.id)
				continue
			}
			go func(inst instRow) {
				defer sweepRelease(metricsPollSem)
				defer unmarkInflight(metricsInflight, inst.id)
				con2, err := repository.OpenDB()
				if err != nil {
					return
				}
				defer con2.Close()

				nodeRepo2 := repository.NewNodeRepository(con2)
				node, err := nodeRepo2.GetNode(inst.nodeID)
				if err != nil {
					return
				}
				token, err := nodeRepo2.PlainToken(inst.nodeID)
				if err != nil || token == "" {
					return
				}

				// Prefer the edge-reported external_id (the actual container
				// name ksedge sees) so a rename-on-deploy doesn't make us
				// poll a stale name. Fall back to the panel logical name
				// for legacy rows that pre-date the ExternalID column.
				name := inst.externalID
				if name == "" {
					name = inst.name
				}

				ec := edge.NewWithTimeout(*node, token, 10*time.Second)
				resp, err := ec.Inspect(edge.InspectRequest{
					Token: token,
					Kind:  inst.kind,
					Name:  name,
				})
				if err != nil {
					// Best-effort: never log here — a panel next to a flaky
					// edge would spam the log every 10s. A rare transient
					// blip stays invisible; a persistent failure surfaces
					// in the live-state's `updated_at` going stale, which
					// the SPA already renders as "no recent telemetry".
					return
				}

				live := models.InstanceLiveState{
					InstanceID: inst.id,
					Metrics:    string(resp.Metrics),
					Processes:  string(resp.Processes),
					Ports:      string(resp.Ports),
					Info:       string(resp.Info),
				}
				if live.Metrics == "" {
					live.Metrics = "{}"
				}
				if live.Processes == "" {
					live.Processes = "[]"
				}
				if live.Ports == "" {
					live.Ports = "[]"
				}
				if live.Info == "" {
					live.Info = "{}"
				}
				_ = repository.NewLiveStateRepository(con2).Save(live)
			}(ir)
		}
	}
}
