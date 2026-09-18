package web

import "embed"

//go:embed index.html
var FS embed.FS

func Index() []byte {
	b, _ := FS.ReadFile("index.html")
	return b
}
