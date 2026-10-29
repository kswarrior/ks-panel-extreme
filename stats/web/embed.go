package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var distFS embed.FS

// Assets returns the built React dashboard (Vite dist output).
func Assets() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}

func Index() []byte {
	b, _ := fs.ReadFile(Assets(), "index.html")
	return b
}
