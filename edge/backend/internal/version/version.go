// Package version exposes the edge's build-time identity (semantic
// version, git commit, build date) so the panel's per-node "Update" UI can
// compare the running ksedge against the latest release served by the public
// artefact store.
//
// The three vars below are intended to be overridden at build time via
// `go build -ldflags "-X github.com/example/ksedge/internal/version.Version=…
// -X github.com/example/ksedge/internal/version.Commit=… -X
// github.com/example/ksedge/internal/version.BuildDate=…"` (rebuild.sh does
// this for both kspanel and ksedge). The defaults below ("1.0.0" / "unknown")
// make a `go run` or `go build` without flags still answer
// `/api/edge/update-info` rather than rendering empty fields.
package version

// Identity strings overridden via -ldflags at build time. Kept in `var`
// (not `const`) on purpose — -ldflags only replaces the contents of an
// existing variable, it can't redefine a constant.
var (
	Version   = "1.0.0"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// Info bundles the build-time identity into a single struct so handlers
// can encode it as one JSON object without re-listing three fields at every
// call site.
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
}

// Snapshot returns the current build identity. Cheap — just reads three
// package vars. Called once per /api/edge/update-info request so
// there's no point caching.
func Snapshot() Info {
	return Info{
		Version:   Version,
		Commit:    Commit,
		BuildDate: BuildDate,
	}
}
