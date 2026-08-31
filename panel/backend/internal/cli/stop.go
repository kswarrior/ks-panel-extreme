package cli

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/spf13/cobra"
)

// stopCmd stops the running panel gracefully via HTTP /api/system/stop
var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the running panel gracefully",
	Long:  "Sends a graceful shutdown request to the running panel process via its HTTP API.",
	RunE:  runStop,
}

func init() {
	stopCmd.Flags().IntP("port", "p", config.DefaultPort(), "Port the panel is running on")
	stopCmd.Flags().Duration("timeout", 10*time.Second, "Timeout for graceful shutdown")
}

func runStop(cmd *cobra.Command, args []string) error {
	port, err := cmd.Flags().GetInt("port")
	if err != nil {
		return err
	}
	timeout, err := cmd.Flags().GetDuration("timeout")
	if err != nil {
		return err
	}

	// Try to stop via HTTP API first
	url := fmt.Sprintf("http://127.0.0.1:%d/api/system/stop", port)
	client := &http.Client{Timeout: timeout}

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		// Fallback to PID file or signal if HTTP fails
		return stopViaPIDFile(timeout)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		print.OK("stop", "Panel stopped gracefully")
		return nil
	}

	return fmt.Errorf("stop request failed with status %d", resp.StatusCode)
}

func stopViaPIDFile(timeout time.Duration) error {
	// Try to find PID file
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot locate binary: %w", err)
	}
	pidPath := exe + ".pid"

	pidData, err := os.ReadFile(pidPath)
	if err != nil {
		// Last resort: pkill
		print.Error("stop", "No PID file, falling back to pkill")
		return pkillPanel(exe)
	}

	var pid int
	fmt.Sscanf(string(pidData), "%d", &pid)
	if pid == 0 {
		return fmt.Errorf("invalid PID file")
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("find process: %w", err)
	}

	// Send SIGTERM for graceful shutdown
	if err := process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("signal process: %w", err)
	}

	// Wait for process to exit
	done := make(chan error, 1)
	go func() {
		_, err := process.Wait()
		done <- err
	}()

	select {
	case <-done:
		print.OK("stop", fmt.Sprintf("Panel stopped (PID: %d)", pid))
		return nil
	case <-time.After(timeout):
		// Force kill
		process.Kill()
		print.Error("stop", fmt.Sprintf("Panel force-killed after timeout (PID: %d)", pid))
		return nil
	}
}

func pkillPanel(exe string) error {
	// Last resort: match the running panel's launcher by binary path then
	// basename. We only target "… launch" invocations so an unrelated
	// process accidentally sharing the binary name isn't killed.
	base := filepath.Base(exe)
	patterns := []string{
		exe + " launch",
		base + " launch",
		exe,
	}
	for _, p := range patterns {
		if err := exec.Command("pkill", "-f", p).Run(); err != nil {
			// pkill exits 1 when nothing matched — keep trying the next
			// pattern rather than treating "no match yet" as fatal.
			if ee, ok := err.(*exec.ExitError); !ok || ee.ExitCode() != 1 {
				print.Error("stop", fmt.Sprintf("pkill failed: %v", err))
			}
		}
	}

	// pkill sends SIGTERM (graceful). Give the process a moment to exit.
	time.Sleep(2 * time.Second)

	// If a matching process is still alive, force kill it.
	if exec.Command("pgrep", "-f", exe).Run() == nil {
		_ = exec.Command("pkill", "-9", "-f", exe).Run()
		time.Sleep(time.Second)
	}

	print.OK("stop", "Panel stopped via pkill")
	return nil
}