package handlers

import (
	"fmt"
	"testing"
)

func TestZZTmpDefaultAs(t *testing.T) {
	mods := map[string]string{"util": "export default function make(){ return 9; }\nexport const x = 1;"}
	err1 := validateReactModules("import { default as D } from './util'\nfunction Page(){return null;}\nreturn Page;", mods)
	fmt.Printf("ZZ default-as err=%v\n", err1)
	mods2 := map[string]string{"m": "export interface P { t: string }"}
	err2 := validateReactModules("import { P } from './m'\nfunction Page(){return null;}\nreturn Page;", mods2)
	fmt.Printf("ZZ type-import err=%v\n", err2)
	if err1 != nil {
		t.Fatalf("expected default-as to pass, got %v", err1)
	}
	if err2 == nil {
		t.Fatal("expected type-only import to fail")
	}
}
