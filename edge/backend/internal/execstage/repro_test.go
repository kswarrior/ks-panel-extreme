package execstage

import (
	"fmt"
	"strings"
	"testing"
)

func TestReproEnvUnbounded(t *testing.T) {
	env := map[string]string{"A": strings.Repeat("x", 5<<20)}
	_, err := Script(env, nil, "echo hi")
	fmt.Printf("REPRO execstage huge env err=%v\n", err)
	files := []File{{Path: "a", Content: strings.Repeat("y", 2<<20)}}
	_, err2 := Script(nil, files, "echo hi")
	fmt.Printf("REPRO execstage huge file err=%v (should fail, MaxFileBytes=1MiB)\n", err2)
}
