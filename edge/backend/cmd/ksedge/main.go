// ksedge is the per-host agent for kspanel. It reads config.json (handed to
// the operator by the panel at node-create time, Pterodactyl-style), reports
// telemetry to the panel on a fixed cadence, and exposes a /health endpoint
// for liveness probes.
//
// main stays a tiny shim; all real logic lives in the internal/ packages so it
// can be unit-tested without exec'ing the binary.
package main

import (
	"fmt"
	"os"

	"github.com/example/ksedge/internal/cli"
)

func main() {
	if err := cli.New().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
