package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
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
	"github.com/example/kspanel/internal/models"
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
// Uses the latest release redirect so the CLI never pins to a stale tag.
const ksedgeDownloadURL = "https://github.com/kswarrior/ks-panel-extreme/releases/latest/download/ksedge"

const ksedgeHuggingFaceURL = "https://huggingface.co/buckets/kswarrior/opencode-storage/resolve/ks-panel/release/ksedge?download=true"

// ksedgeEdgeURL is the dedicated edge release asset requested for local node setup.
const ksedgeEdgeURL = "https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge"

func ksedgeDownloadURLs() []string {
	return []string{
		ksedgeEdgeURL,
		ksedgeHuggingFaceURL,
		ksedgeDownloadURL,
		"https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-release-32876373128-a36954f895a6/ksedge",
	}
}

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

	// 1) Download ksedge if not already on disk. Prefer a local binary next
	// to the panel (instant, no network) then HF → GitHub fallbacks.
	if fi, statErr := os.Stat(ksedgePath); statErr != nil || fi.Size() == 0 || fi.IsDir() {
		if localSrc := findLocalKsedgeCLI(); localSrc != "" {
			print.Step("download", fmt.Sprintf("copying from local %s", localSrc))
			if err := copyFileCLI(localSrc, ksedgePath); err != nil {
				print.Fail("setup:localnode", fmt.Sprintf("local copy: %v", err))
				return fmt.Errorf("local copy: %w", err)
			}
			if err := os.Chmod(ksedgePath, 0o755); err != nil {
				print.Fail("setup:localnode", fmt.Sprintf("chmod: %v", err))
				return fmt.Errorf("chmod: %w", err)
			}
			print.Step("download", "copied ksedge from local release")
		} else {
			var lastErr error
			downloaded := false
			for _, u := range ksedgeDownloadURLs() {
				print.Step("download", u)
				if err := downloadKsedge(u, ksedgePath); err != nil {
					lastErr = err
					print.Step("download", fmt.Sprintf("failed %s: %v", u, err))
					continue
				}
				if err := os.Chmod(ksedgePath, 0o755); err != nil {
					print.Fail("setup:localnode", fmt.Sprintf("chmod: %v", err))
					return fmt.Errorf("chmod: %w", err)
				}
				print.Step("download", fmt.Sprintf("downloaded ksedge from %s", u))
				downloaded = true
				break
			}
			if !downloaded {
				msg := fmt.Sprintf("all download mirrors failed: %v", lastErr)
				print.Fail("setup:localnode", msg)
				return fmt.Errorf("download ksedge: %w", lastErr)
			}
		}
	} else {
		print.Step("download", "ksedge already present, skipping")
	}

	// 2) Write the config the edge will read on launch.
	// Call panelPortForEdge once so panelURL and panelPort stay in sync when
	// the default 5050 is auto-bumped to a free port.
	effectivePanelPort := panelPortForEdge()
	panelURL := "http://127.0.0.1:" + effectivePanelPort
	panelPort := effectivePanelPort
	edgeCfg := map[string]any{
		"uuid":               fmt.Sprintf("cli-localnode-%d", nodeID),
		"name":               setupLocalnodeName,
		"panel_url":          panelURL,
		"token":              token,
		"listen_port":        setupLocalnodePort,
		"heartbeat_interval": 60,
		"use_tls_upstream":   false,
		"skip_verify":        false,
		"connection_mode":    "local_port",
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
	// NOTE: do NOT re-read the row via repo.GetNode here — GetNode holds
	// its outer Rows open while issuing the nested nodeOwnerMap query,
	// which deadlocks on SQLite's single-connection pool
	// (SetMaxOpenConns(1)) and hangs the installer forever after the
	// "started ksedge" log. Probe only needs the address/mode we already
	// know, so construct the node locally (same values upserted above).
	time.Sleep(1200 * time.Millisecond)
	probeNode := models.Node{
		ID:             nodeID,
		Name:           setupLocalnodeName,
		Address:        address,
		UseTLS:         false,
		ConnectionMode: "local_port",
		HealthTimeout:  4,
	}
	res := probe.Probe(probeNode)
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
// the edge will dial. If the default port (5050) is already occupied, it
// auto-selects a free ephemeral port so the edge config points at a port the
// panel can actually bind (matching launch.go's fallback).
func panelPortForEdge() string {
	port := os.Getenv("KSPANEL_PORT")
	if port == "" {
		port = strconv.Itoa(config.DefaultPort())
	}
	// Auto-fallback only for the default 5050 — explicit env ports (e.g.
	// KSPANEL_PORT=8080) are respected verbatim so the operator's intent is
	// not silently ignored.
	if port == strconv.Itoa(config.DefaultPort()) {
		if p, err := strconv.Atoi(port); err == nil {
			if !isPanelPortAvailable(p) {
				if free, ferr := findFreePort(); ferr == nil {
					print.Step("panel", fmt.Sprintf("port %s was in use — auto-selected :%d for edge panel_url", port, free))
					return strconv.Itoa(free)
				}
			}
		}
	}
	return port
}

// isPanelPortAvailable reports whether a TCP listen on :port succeeds.
func isPanelPortAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

// findFreePort asks the kernel for an ephemeral port (bind :0) and returns
// the assigned port number.
func findFreePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// ensurePanelUp verifies the panel HTTP server is reachable at panelURL (the
// exact host:port we just wrote into the edge's config, so heartbeats will
// land). If nothing answers, it auto-launches this same binary as
// `kspanel launch --port <port>` detached and waits a moment for it to bind.
// Returns nil once the panel responds to /health, or an error if it can't be
// brought up within the timeout. If the requested port is the default 5050
// and is already occupied by a non-panel process, it auto-selects a free
// port, rewrites the edge config, and launches there so the edge heartbeats
// still land.
func ensurePanelUp(panelURL, port string) error {
	if panelReachable(panelURL) {
		print.Step("panel", fmt.Sprintf("already running at %s", panelURL))
		return nil
	}

	// Default-port auto-fallback: if 5050 is occupied by something that is
	// NOT the panel (panelReachable was false but listen would fail), pick a
	// free port now and rewrite the edge config so the later launch and the
	// edge's panel_url stay in sync. This mirrors launch.go's own fallback
	// but does it before we fork the panel so the log shows the corrected port.
	if port == strconv.Itoa(config.DefaultPort()) {
		if p, err := strconv.Atoi(port); err == nil && !isPanelPortAvailable(p) {
			if free, ferr := findFreePort(); ferr == nil {
				newPortStr := strconv.Itoa(free)
				newURL := "http://127.0.0.1:" + newPortStr
				print.Step("panel", fmt.Sprintf("port %s was in use — auto-selected :%s for panel launch", port, newPortStr))
				// Rewrite edge config that was just written with the old URL.
				if data, rerr := os.ReadFile(filepath.Join("localnode", "ksedge", "config.json")); rerr == nil {
					var cfg map[string]any
					if jerr := json.Unmarshal(data, &cfg); jerr == nil {
						cfg["panel_url"] = newURL
						if out, merr := json.MarshalIndent(cfg, "", "  "); merr == nil {
							_ = os.WriteFile(filepath.Join("localnode", "ksedge", "config.json"), out, 0o644)
							print.Step("config", fmt.Sprintf("rewrote panel_url to %s (free port)", newURL))
						}
					}
				}
				panelURL = newURL
				port = newPortStr
			}
		}
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

func findLocalKsedgeCLI() string {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, "ksedge"),
			filepath.Join(dir, "release", "ksedge"),
			filepath.Join(dir, "..", "release", "ksedge"),
		)
	}
	candidates = append(candidates,
		filepath.Join("release", "ksedge"),
		filepath.Join(".", "ksedge"),
	)
	for _, p := range candidates {
		if fi, err := os.Stat(filepath.Clean(p)); err == nil && fi.Size() > 0 && fi.Mode().IsRegular() {
			if abs, aerr := filepath.Abs(p); aerr == nil {
				return abs
			}
			return p
		}
	}
	return ""
}

func copyFileCLI(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

// downloadKsedge streams a URL to disk with a generous timeout. The ksedge
// artefact is ~10MB; a slow connection can take a minute. We write through a
// temp file and rename so a partial download never leaves a truncated binary
// behind that a subsequent run would mistakenly treat as "already present".
func downloadKsedge(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "kspanel-setup-local/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		snip := strings.TrimSpace(string(body))
		if snip != "" && len(snip) < 200 {
			return fmt.Errorf("HTTP %d: %s", resp.StatusCode, snip)
		}
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
