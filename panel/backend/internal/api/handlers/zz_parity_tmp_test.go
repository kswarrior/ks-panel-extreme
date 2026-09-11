package handlers

import (
	"fmt"
	"testing"
)

// Temporary parity printer (item 2 verification only): same corpus as the FE
// harness, verdict per case. Deleted before the final diff.
func TestZZParityPrint(t *testing.T) {
	util := "export function helper() { return 1; }\nexport default function B(){ return null; }"
	type tc struct {
		name string
		src  string
		mods map[string]string
	}
	cases := []tc{
		{"named-relative", "import { helper } from './util'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"default-relative-dq", "import B from \"./util\"\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"namespace-relative", "import * as U from './util'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"side-effect-relative", "import './util'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"dotdot-escape", "import { x } from '../secret'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"deep-escape", "import { x } from './a/../../b'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"absolute", "import { x } from '/etc/passwd'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"tilde", "import { x } from '~/evil'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"url-encoded", "import { x } from '%2e%2e/evil'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"bare-axios", "import x from 'axios'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"missing", "import { x } from './missing'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"cycle", "import { a } from './a'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"a": "import { b } from './b';\nexport const a = 1;", "b": "import { a } from './a';\nexport const b = 2;"}},
		{"export-star-relative", "export * from './util'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
		{"react-only", "import { useState } from 'react'\nfunction Page(){return null;}\nreturn Page;", map[string]string{}},
		{"react-plus-relative", "import { useState } from 'react'\nimport { helper } from './util'\nfunction Page(){return null;}\nreturn Page;", map[string]string{"util": util}},
	}
	for _, c := range cases {
		err1 := validateReactSource(c.src)
		err2 := validateReactModules(c.src, c.mods)
		// Entry gate (save path) runs both: source jail first, then graph.
		final := err1
		if final == nil {
			final = err2
		}
		if final == nil {
			fmt.Printf("%s: PASS\n", c.name)
		} else {
			msg := final.Error()
			if len(msg) > 60 {
				msg = msg[:60]
			}
			fmt.Printf("%s: REJECT: %s\n", c.name, msg)
		}
	}
}
