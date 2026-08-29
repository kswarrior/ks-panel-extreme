package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/probe"
	"github.com/example/kspanel/internal/repository"
	"github.com/spf13/cobra"
)

// setupLocalnodeCmd: `./kspanel setup:localnode --port 4040`
//
// One-shot installer that adds a localhost node to the database, downloads
// the ksedge binary into ./localnode/ksedge/ next to this kspanel binary,
// writes the matching config.json (panel URL + edge token + listen port),
// and launches `./localnode/ksedge/ksedge launch` detached so the edge
// survives the CLI exit. The resulting edge then heartbeats the panel and
// flips its card green on the Nodes admin page.
//
// Re-running is idempotent: a node row matching (name, address) is reused
// so the existing token stays valid, and an on-disk ksedge is not
// redownloaded.

var setupLocalnodeCmd = &cobra.Command{
	Use:   "setup:localnode",
	Short: "Provision a localhost ksedge edge and run it on the chosen port",
	Long: `Provision a localhost ksedge edge on this host and bring it up.

  ./kspanel setup:localnode --port 4040
  ./kspanel setup:localnode --port 4040 --name local-edge --no-launch

This is the CLI equivalent of the admin "Create & setup" button — it
registers a localhost node, downloads ksedge from the public HF mirror into
./localnode/ksedge/ (next to this binary), writes the panel-generated
config.json, and launches "./ksedge launch" detached.

Re-running the command is idempotent: the matching (name, port) row is
reused so a re-run won't mint a new token, and an existing on-disk ksedge
is not redownloaded.`,
	RunE: runSetupLocalnode,
}

var (
	setupLocalnodePort     int
	setupLocalnodeName     string
	setupLocalnodeNoLaunch bool
)

func init() {
	setupLocalnodeCmd.Flags().IntVarP(&setupLocalnodePort, "port", "p", 4040, "Edge listen port (127.0.0.1:<port>)")
	setupLocalnodeCmd.Flags().StringVarP(&setupLocalnodeName, "name", "n", "local-edge", "Display name for the node row")
	setupLocalnodeCmd.Flags().BoolVar(&setupLocalnodeNoLaunch, "no-launch", false, "Install + write config but do NOT start ksedge")
}

// ksedgeDownloadURL is the public artefact the bootstrap snippet uses. Kept
// in this package (matching the one used by the admin HTTP setup handler) so
// the CLI is self-contained — no cross-package constant chase required.
const ksedgeDownloadURL = "https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-release-32876373128-a36954f895a6/ksedge"

func runSetupLocalnode(cmd *cobra.Command, args []string) error {
	if setupLocalnodePort <= 0 || setupLocalnodePort > 65535 {
		print.Fail("setup:localnode", fmt.Sprintf("invalid --port %d (1-65535)", setupLocalnodePort))
		return fmt.Errorf("invalid port")
	}
	if strings.TrimSpace(setupLocalnodeName) == "" {
		print.Fail("setup:localnode", "--name must not be empty")
		return fmt.Errorf("empty name")
	}

	cfg := config.DatabaseConfig()

	// Same log-silencing rule as `launch`/`seed`/…—migration lines are noise
	// unless KSPANEL_LOG=verbose is set.
	silenceStandardLog()
	defer restoreStandardLog()

	con, d, err := db.Open(cfg)
	if err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("open db: %v", err))
		return fmt.Errorf("open db: %w", err)
	}
	defer con.Close()

	// Make sure the schema is present, otherwise the nodes table would be
	// missing and the INSERT would blow up.
	if err := db.RunMigrations(d, con); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("migrations: %v", err))
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := db.SeedCore(d, con); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("seed: %v", err))
		return fmt.Errorf("seed core data: %w", err)
	}
	print.OK("database", "ready")

	// Find or create the matching localhost node. If a row already exists
	// for exactly this (name, address) we reuse it (preserves the original
	// token & parity with the live edge), otherwise we mint a fresh row.
	// Repeated runs are therefore idempotent: the operator can rerun after
	// a panel reinstall and the edge just reconnects with its existing
	// token instead of being orphaned on a new id.
	repo := repository.NewNodeRepository(con)
	address := fmt.Sprintf("127.0.0.1:%d", setupLocalnodePort)
	nodeID, token, err := upsertLocalNode(repo, setupLocalnodeName, address)
	if err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("upsert node: %v", err))
		return err
	}
	print.Step("node", fmt.Sprintf("%s @ 127.0.0.1:%d (id %d)", setupLocalnodeName, setupLocalnodePort, nodeID))

	// Working dir sits NEXT to the ksedge binary, not under the panel data
	// dir, so it's discoverable on the same folder the operator cloned.
	// Layout: <cwd>/localnode/ksedge/{ksedge, config.json, ksedge.log}.
	dir := filepath.Join("localnode", "ksedge")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("mkdir %s: %v", dir, err))
		return fmt.Errorf("mkdir: %w", err)
	}
	ksedgePath := filepath.Join(dir, "ksedge")
	configPath := filepath.Join(dir, "config.json")
	logPath := filepath.Join(dir, "ksedge.log")

	// 1) Download ksedge if not already on disk.
	if fi, statErr := os.Stat(ksedgePath); statErr != nil || fi.Size() == 0 {
		print.Step("download", ksedgeDownloadURL)
		if err := downloadKsedge(ksedgeDownloadURL, ksedgePath); err != nil {
			print.Fail("setup:localnode", fmt.Sprintf("download ksedge: %v", err))
			return fmt.Errorf("download ksedge: %w", err)
		}
		if err := os.Chmod(ksedgePath, 0o755); err != nil {
			print.Fail("setup:localnode", fmt.Sprintf("chmod: %v", err))
			return fmt.Errorf("chmod: %w", err)
		}
	} else {
		print.Step("download", "ksedge already present, skipping")
	}

	// 2) Write the config the edge will read on launch.
	panelURL := "http://" + panelHostForEdge()
	panelPort := panelPortForEdge()
	edgeCfg := map[string]any{
		"uuid":               fmt.Sprintf("cli-localnode-%d", nodeID),
		"name":               setupLocalnodeName,
		"panel_url":          panelURL,
		"token":              token,
		"listen_port":        setupLocalnodePort,
		"heartbeat_interval": 60,
		"use_tls_upstream":   false,
		"skip_verify":        false,
	}
	cfgBytes, _ := json.MarshalIndent(edgeCfg, "", "  ")
	if err := os.WriteFile(configPath, cfgBytes, 0o644); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("write config: %v", err))
		return fmt.Errorf("write config: %w", err)
	}
	print.Step("config", configPath)

	if setupLocalnodeNoLaunch {
		print.OK("installed", fmt.Sprintf("ksedge ready at %s (drop --no-launch to start)", ksedgePath))
		return nil
	}

	// 2b) Ensure the panel HTTP server is actually listening on panelURL
	// before we start the edge. The admin "Create & setup" button only ever
	// runs inside an already-running panel, so the edge's heartbeat always
	// lands. The CLI is invoked standalone (often right after installing),
	// so the panel may not be up yet — and without it the edge answers its
	// own /health probe (card -> "partial") but its heartbeats to
	// <panel>/api/nodes/heartbeat are refused forever, leaving the node
	// permanently "partial" instead of flipping "up". Auto-launch the panel
	// detached when its port is closed so the CLI behaves like the button.
	if err := ensurePanelUp(panelURL, panelPort); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("panel not reachable and could not be started: %v", err))
		return fmt.Errorf("panel unavailable: %w", err)
	}

	// 3) Launch ./ksedge launch detached so CLI exit doesn't take it down.
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("open log: %v", err))
		return fmt.Errorf("open log: %w", err)
	}
	defer logFile.Close()
	// Resolve to an absolute path before handing to os/exec — Go only uses
	// LookPath when the path has no slash, but the spawn can still fail with
	// ENOENT on a relative path when our own cwd is / (e.g. behind a
	// service manager). An absolute path travels through fork/exec cleanly.
	absKsedge, absErr := filepath.Abs(ksedgePath)
	if absErr != nil {
		print.Fail("setup:localnode", fmt.Sprintf("abs path: %v", absErr))
		return fmt.Errorf("abs path: %w", absErr)
	}
	ksedgeCmd := exec.Command(absKsedge, "launch")
	ksedgeCmd.Dir = dir
	ksedgeCmd.Stdout = logFile
	ksedgeCmd.Stderr = logFile
	ksedgeCmd.SysProcAttr = detachSysProcAttr()
	if err := ksedgeCmd.Start(); err != nil {
		print.Fail("setup:localnode", fmt.Sprintf("start ksedge: %v", err))
		return fmt.Errorf("start ksedge: %w", err)
	}
	print.Step("launch", fmt.Sprintf("started ksedge (pid %d) on 127.0.0.1:%d", ksedgeCmd.Process.Pid, setupLocalnodePort))

	// 4) Give the edge a moment to bind, then dial /health to confirm. A
	// missing edge doesn't fail the command — we still leave the install
	// in place; the operator just sees "not reachable yet" in the output.
	time.Sleep(1200 * time.Millisecond)
	node, _ := repo.GetNode(nodeID)
	if node != nil {
		res := probe.Probe(*node)
		_ = repo.RecordProbe(nodeID, repository.ProbeInput{
			Reachable: res.Reachable,
			SeenName:  res.SeenName,
			CheckedAt: time.Now().UTC(),
		})
		if res.Reachable {
			print.OK("edge", fmt.Sprintf("up and reachable (name=%q, log=%s)", res.SeenName, logPath))
		} else {
			print.Step("edge", fmt.Sprintf("not reachable yet — %s", res.Note))
		}
	}

	// Surface a one-line quick-reference at the end so operators don't have
	// to re-read the whole log to remember what they just installed.
	fmt.Println()
	print.KV("node id", strconv.FormatInt(nodeID, 10))
	print.KV("edge port", strconv.Itoa(setupLocalnodePort))
	print.KV("binary", ksedgePath)
	print.KV("config", configPath)
	print.KV("log", logPath)
	return nil
}

// upsertLocalNode returns the id+token of (creating or reusing) the row for
// (name, address). If the token_plain column is empty (rotated away) we mint
// a fresh token via RotateToken so the edge config the CLI writes below is
// always load-bearing.
func upsertLocalNode(repo *repository.NodeRepository, name, address string) (int64, string, error) {
	if existing, _ := repo.FindNodeByNameAndAddress(name, address); existing != nil {
		token, err := repo.PlainToken(existing.ID)
		if err != nil || token == "" {
			t, rerr := repo.RotateToken(existing.ID)
			if rerr != nil {
				return 0, "", fmt.Errorf("rotate token: %w", rerr)
			}
			return existing.ID, t, nil
		}
		return existing.ID, token, nil
	}
	created, plain, err := repo.CreateNode(repository.CreateNodeInput{
		Name: name, Address: address, UseTLS: false, ConnectionMode: "local_port",
	})
	if err != nil {
		return 0, "", fmt.Errorf("create node: %w", err)
	}
	return created.ID, plain, nil
}

// panelHostForEdge returns host:port the edge should dial back to. Prefer
// KSPANEL_PORT so `KSPANEL_PORT=5050 kspanel setup:localnode ...` works
// alongside a non-default port; fall back to config.DefaultPort otherwise.
func panelHostForEdge() string {
	return "127.0.0.1:" + panelPortForEdge()
}

// panelPortForEdge returns just the port segment of panelHostForEdge so the
// panel-launch path can spawn `kspanel launch --port <n>` on the same port
// the edge will dial.
func panelPortForEdge() string {
	port := os.Getenv("KSPANEL_PORT")
	if port == "" {
		port = strconv.Itoa(config.DefaultPort())
	}
	return port
}

// ensurePanelUp verifies the panel HTTP server is reachable at panelURL (the
// exact host:port we just wrote into the edge's config, so heartbeats will
// land). If nothing answers, it auto-launches this same binary as
// `kspanel launch --port <port>` detached and waits a moment for it to bind.
// Returns nil once the panel responds to /health, or an error if it can't be
// brought up within the timeout.
func ensurePanelUp(panelURL, port string) error {
	if panelReachable(panelURL) {
		print.Step("panel", fmt.Sprintf("already running at %s", panelURL))
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locate kspanel binary: %w", err)
	}
	if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
		exe = resolved
	}

	// Detach the panel into its own process group so the CLI exiting
	// doesn't tear it down — mirroring how we launch ksedge below.
	logPath := filepath.Join(filepath.Dir(exe), "panel.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open panel log: %w", err)
	}
	defer logFile.Close()
	cmd := exec.Command(exe, "launch", "--port", port)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = detachSysProcAttr()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start panel: %w", err)
	}
	print.Step("panel", fmt.Sprintf("started (pid %d) on 127.0.0.1:%s", cmd.Process.Pid, port))

	// Release the child immediately so the CLI doesn't keep waitpid'ing.
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}

	// Wait for the panel to finish booting (migrations + listener bind).
	// Cap at ~8s so a genuinely broken panel doesn't hang the installer.
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if panelReachable(panelURL) {
			print.OK("panel", fmt.Sprintf("ready at %s", panelURL))
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("panel did not answer /health at %s within timeout", panelURL)
}

// panelReachable reports whether something on panelURL answers GET /health
// with a 200. The panel exposes this endpoint unauthenticated, so it's a
// cheap liveness signal without needing a token.
func panelReachable(panelURL string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(panelURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

// downloadKsedge streams a URL to disk with a generous timeout. The ksedge
// artefact is ~10MB; a slow connection can take a minute. We write through a
// temp file and rename so a partial download never leaves a truncated binary
// behind that a subsequent run would mistakenly treat as "already present".
func downloadKsedge(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	tmp := dest + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dest)
}

// ensure syscall import is referenced even on platforms where
// detachSysProcAttr returns the zero value (see setup_localnode_other.go).
var _ = syscall.SIGTERM
