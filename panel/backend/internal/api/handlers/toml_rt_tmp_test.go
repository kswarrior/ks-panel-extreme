package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/BurntSushi/toml"
)

func TestTomlRoundTripTmp(t *testing.T) {
	raw, err := os.ReadFile("../../../themes_market/market/midnight-ocean.json")
	if err != nil {
		t.Skip("market file not present")
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(m); err != nil {
		t.Fatalf("encode: %v", err)
	}
	fmt.Println("=== head ===")
	lines := bytes.Split(buf.Bytes(), []byte("\n"))
	for i := 0; i < 10 && i < len(lines); i++ {
		fmt.Println(string(lines[i]))
	}
	var back map[string]any
	if err := toml.Unmarshal(buf.Bytes(), &back); err != nil {
		t.Fatalf("decode: %v", err)
	}
	nb, _ := json.Marshal(back["spec"])
	var spec map[string]any
	_ = json.Unmarshal(nb, &spec)
	fmt.Printf("scopes back: %#v\n", spec["customCSS"])
	fmt.Println("toml bytes:", buf.Len())
}
