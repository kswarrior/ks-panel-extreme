package main

import (
	"fmt"
	"strings"

	"github.com/example/ksedge/internal/execstage"
)

func main() {
	// Repro: STAGE variable can be overwritten by command -> rm -rf / on EXIT trap
	script, err := execstage.Script(nil, []execstage.File{{Path: "a.txt", Content: "hi"}}, "echo hello")
	if err != nil {
		fmt.Println("Script err:", err)
		return
	}
	fmt.Println("=== SCRIPT ===")
	fmt.Println(script)
	fmt.Println("=== END ===")
	hasTrap := strings.Contains(script, `rm -rf "$STAGE"`)
	hasReadonly := strings.Contains(script, "readonly STAGE")
	fmt.Printf("hasTrap=%v hasReadonly=%v\n", hasTrap, hasReadonly)
	if hasTrap && !hasReadonly {
		fmt.Println("BUG REPRO: trap uses $STAGE evaluated at EXIT, command can overwrite STAGE (e.g. STAGE=/; echo hi) -> rm -rf / . No readonly guard.")
	} else if hasReadonly {
		fmt.Println("FIXED: readonly guard present")
	} else {
		fmt.Println("UNEXPECTED: no trap")
	}
	// Show exploit: if command sets STAGE=/, trap becomes rm -rf /
	exploit, _ := execstage.Script(nil, []execstage.File{{Path: "a.txt", Content: "hi"}}, "STAGE=/; echo pwned")
	fmt.Println("--- exploit script tail ---")
	lines := strings.Split(exploit, "\n")
	for _, l := range lines {
		if strings.Contains(l, "STAGE") || strings.Contains(l, "trap") || strings.Contains(l, "pwned") {
			fmt.Println(l)
		}
	}
}
