package install

import (
	"fmt"
	"strings"
	"testing"
)

func TestReproPipInjection(t *testing.T) {
	s, err := compileStep(Step{Action: "pip_install", Command: "requests; echo PWNED > /tmp/pwned"}, nil)
	fmt.Printf("REPRO pip script err=%v script=%q\n", err, s)
	if strings.Contains(s, "; echo PWNED") {
		fmt.Printf("REPRO pip INJECTION present: raw semicolon survives\n")
	}
	s2, err2 := compileStep(Step{Action: "npm_install", Command: "; rm -rf /tmp/x"}, nil)
	fmt.Printf("REPRO npm script err=%v script=%q\n", err2, s2)
}
