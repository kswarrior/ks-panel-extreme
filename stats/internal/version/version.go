package version

// Build-time identity overridden via ldflags:
// go build -ldflags "-X stats/internal/version.Version=1.0.x -X stats/internal/version.Commit=abc123 -X stats/internal/version.BuildDate=2026-..."
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
}

func Get() Info { return Info{Version: Version, Commit: Commit, BuildDate: BuildDate} }
