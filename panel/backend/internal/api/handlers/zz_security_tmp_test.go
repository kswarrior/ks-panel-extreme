package handlers

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// Temporary security fuzz (item 2 verification only). Deleted before final diff.
func TestZZSecurityFuzz(t *testing.T) {
	mods := map[string]string{"util": "export const u = 1;"}
	for _, spec := range []string{
		"./a/../../b", "../x", "../../x", "/etc/passwd", "~/x",
		"%2e%2e/x", "%2E%2E/x", "./%75til", ".\\util", "..\\secret",
		"./a//b", "./a/", "./", "..", ".", "./a?b", "./a#b", "./a;b",
		"axios", "@mui/material", "react-dom", "", "./..%2fsecret",
		"./.../x", "https://evil/x.js", "./a/./b",
	} {
		src := fmt.Sprintf("import { x } from '%s'\nfunction Page(){return null;}\nreturn Page;", spec)
		err := validateReactModules(src, mods)
		if err == nil {
			// Fall back to the source-only gate (bare shapes never reach graph).
			err = validateReactSource(src)
		}
		if err == nil {
			t.Errorf("BE spec=%q: PASS (UNEXPECTED)", spec)
		} else {
			fmt.Printf("BE spec=%q: REJECT\n", spec)
		}
	}
	// Oversize module.
	big := map[string]string{"big": "export const u = '" + strings.Repeat("x", 600*1024) + "';"}
	err := validateReactModules("import { u } from './big'\nfunction Page(){return null;}\nreturn Page;", big)
	fmt.Printf("BE oversize: err=%v\n", err != nil)
	if err == nil {
		t.Error("expected oversize to fail")
	}
	// 500-deep chain.
	deep := map[string]string{}
	for i := 0; i < 500; i++ {
		deep[fmt.Sprintf("f%d", i)] = fmt.Sprintf("import { v%d } from './f%d'\nexport const v%d = %d;", i+1, i+1, i, i)
	}
	deep["f499"] = "export const v499 = 499;"
	t0 := time.Now()
	err = validateReactModules("import { v0 } from './f0'\nfunction Page(){return null;}\nreturn Page;", deep)
	fmt.Printf("BE deep500: err=%v in %s\n", err != nil, time.Since(t0).Round(time.Millisecond))
	if err == nil {
		t.Error("expected deep chain to fail")
	}
}
