package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---- validateReactSource ----------------------------------------------------

func TestValidateReactSourceAllowsPlainCreateElement(t *testing.T) {
	src := `function Page(sdk) {
  return React.createElement('div', {className: 'ks-page'},
    React.createElement('button', {onClick: function() { sdk.runAction('ping'); }}, 'Ping'));
}`
	if err := validateReactSource(src); err != nil {
		t.Fatalf("expected plain React source to pass, got %v", err)
	}
}

func TestValidateReactSourceRejectsHostEscapes(t *testing.T) {
	for _, src := range []string{
		`eval("evil")`,
		`var f = new Function("x", "return x")`,
		`fetch("/api/users").then()`,
		`var x = new XMLHttpRequest()`,
		`document.cookie`,
		`localStorage.getItem("k")`,
		`require("fs")`,
		`import x from "axios"`,
		`import { Button } from "@mui/material"`,
		// The renderer injects sdk + React inside a function wrapper, which
		// cannot parse module syntax for other packages.
		`export default Page`,
	} {
		if err := validateReactSource(src); err == nil {
			t.Fatalf("expected rejection for %q", src)
		}
	}
}

func TestValidateReactSourceAllowsReactOnlyImports(t *testing.T) {
	for _, src := range []string{
		`import React from "react"
function Page() { return React.createElement('div', null, 'hi'); }`,
		`import { useState, useEffect } from 'react'
function Page() { const [x] = useState(0); return React.createElement('div', null, String(x)); }`,
		`import * as R from 'react'
function Page() { return R.createElement('div', null, 'hi'); }`,
		`import 'react'
function Page() { return React.createElement('div', null, 'hi'); }`,
	} {
		if err := validateReactSource(src); err != nil {
			t.Fatalf("expected react-only import to pass, got %v", err)
		}
	}
}

func TestValidateReactSourceAllowsExportDeclarations(t *testing.T) {
	for _, src := range []string{
		`export const title = 'hi';
function Page() { return React.createElement('div', null, title); }
return Page;`,
		`export enum Level { Low, High = 5 }
function Page() { return React.createElement('div', null, String(Level.High)); }
return Page;`,
		`export namespace Maps { export const a = 1; }
function Page() { return React.createElement('div', null, String(Maps.a)); }
return Page;`,
		`export interface P { t: string }
function Page(p: P) { return React.createElement('div', null, p.t); }
return Page;`,
		`declare const version: string;
function Page() { return React.createElement('div', null, 'v'); }
return Page;`,
		`export declare const version: string;
function Page() { return React.createElement('div', null, 'v'); }
return Page;`,
	} {
		if err := validateReactSource(src); err != nil {
			t.Fatalf("expected export/declare source to pass, got %v", err)
		}
	}
	for _, src := range []string{
		`export default Page`,
		`export { Page }`,
		`export * from './x'`,
		`export = Page`,
	} {
		if err := validateReactSource(src); err == nil {
			t.Fatalf("expected rejection for %q", src)
		}
	}
}

func TestValidateReactSourceAllowsJSXAndLightTS(t *testing.T) {
	for _, src := range []string{
		`function Page() { return <div className="ks-page">hi</div>; }
return Page;`,
		`import { useState } from 'react'
type Props = { title: string };
interface State { n: number }
function Page(props: Props) {
  const [n, setN] = useState<number>(0);
  const v = props.title as string;
  return <div>{v}{n}</div>;
}
return Page;`,
		// Quoted samples must not trip the deny-list / fetch gate.
		`function Page() { return React.createElement('div', null, 'localStorage is banned, use sdk.storage — fetch( is an example'); }
return Page;`,
	} {
		if err := validateReactSource(src); err != nil {
			t.Fatalf("expected JSX/TS source to pass, got %v", err)
		}
	}
}

func TestValidateReactSourceRejectsOversize(t *testing.T) {
	src := strings.Repeat("x", maxInstancePageReactSourceBytes+1)
	if err := validateReactSource(src); err == nil {
		t.Fatal("expected oversize source to fail")
	}
}

// ---- virtual modules (item 2) ------------------------------------------------

func TestValidateReactSourceAllowsJailedRelativeImports(t *testing.T) {
	for _, src := range []string{
		"import { helper } from './util'\nfunction Page() { return React.createElement('div', null, helper()); }\nreturn Page;",
		"import def from \"./util\"\nfunction Page() { return React.createElement('div', null, String(def)); }\nreturn Page;",
		"import * as U from './util'\nfunction Page() { return React.createElement('div', null, U.helper()); }\nreturn Page;",
		"import './util'\nfunction Page() { return React.createElement('div', null, 'hi'); }\nreturn Page;",
	} {
		if err := validateReactSource(src); err != nil {
			t.Fatalf("expected jailed relative import to pass, got %v", err)
		}
	}
	// Direct jail verdicts (mirror the FE normalizeModuleSpecifier).
	if _, err := normalizeReactImportSpecifier("./util", ""); err != nil {
		t.Fatalf("expected ./util to jail-pass, got %v", err)
	}
	if _, err := normalizeReactImportSpecifier("./a/b", ""); err != nil {
		t.Fatalf("expected ./a/b to jail-pass, got %v", err)
	}
	// '../x' from a nested importer that stays inside the root passes.
	if got, err := normalizeReactImportSpecifier("../c", "a"); err != nil || got != "c" {
		t.Fatalf("expected ../c from a to resolve to c, got %q, %v", got, err)
	}
}

func TestValidateReactSourceRejectsEscapingImports(t *testing.T) {
	for _, src := range []string{
		"import { x } from '../secret'\nfunction Page() { return null; }\nreturn Page;",
		"import { x } from './a/../../b'\nfunction Page() { return null; }\nreturn Page;",
		"import { x } from '/etc/passwd'\nfunction Page() { return null; }\nreturn Page;",
		"import { x } from '~/evil'\nfunction Page() { return null; }\nreturn Page;",
		"import { x } from '%2e%2e/evil'\nfunction Page() { return null; }\nreturn Page;",
	} {
		if err := validateReactSource(src); err == nil {
			t.Fatalf("expected escape/absolute import to fail for %q", src)
		}
	}
}

func TestValidateReactModulesRejectsCycle(t *testing.T) {
	mods := map[string]string{
		"a": "import { b } from './b'\nexport const a = 1;",
		"b": "import { a } from './a'\nexport const b = 2;",
	}
	entry := "import { a } from './a'\nfunction Page() { return React.createElement('div', null, a); }\nreturn Page;"
	if err := validateReactModules(entry, mods); err == nil || !strings.Contains(err.Error(), "circular import") {
		t.Fatalf("expected circular import error, got %v", err)
	}
}

func TestValidateReactModulesRejectsMissing(t *testing.T) {
	mods := map[string]string{"util": "export const helper = 1;"}
	entry := "import { x } from './missing'\nfunction Page() { return null; }\nreturn Page;"
	err := validateReactModules(entry, mods)
	if err == nil || !strings.Contains(err.Error(), "unknown module") {
		t.Fatalf("expected unknown module error, got %v", err)
	}
	if !strings.Contains(err.Error(), "util") {
		t.Fatalf("expected missing error to list available names, got %v", err)
	}
}

func TestValidateReactModulesRejectsBareImport(t *testing.T) {
	entry := "import x from 'axios'\nfunction Page() { return null; }\nreturn Page;"
	if err := validateReactModules(entry, map[string]string{}); err == nil {
		t.Fatal("expected bare non-react import to fail")
	}
	if err := validateReactSource(entry); err == nil {
		t.Fatal("expected bare non-react import to fail validateReactSource too")
	}
}

func TestValidateReactModulesAcceptsTwoModules(t *testing.T) {
	mods := map[string]string{
		"util": "export function helper() { return 42; }\nexport function MyComp() { return React.createElement('span', null, 'hi'); }",
	}
	entry := "import { helper, MyComp } from './util'\nfunction Page() { return React.createElement('div', null, String(helper())); }\nreturn Page;"
	if err := validateReactModules(entry, mods); err != nil {
		t.Fatalf("expected two-module page to pass, got %v", err)
	}
}

// ---- validateInstancePage react gate ---------------------------------------

func TestValidateInstancePageReactRequiresSource(t *testing.T) {
	req := instancePageDTO{Name: "R", Slug: "r-page", Kind: "custom", ContentType: "react"}
	if _, err := validateInstancePage(req); err == nil {
		t.Fatal("expected react page without source_tsx to fail")
	}
	req.SourceTSX = `function Page() { return React.createElement('div', null, 'hi'); }`
	if _, err := validateInstancePage(req); err != nil {
		t.Fatalf("expected react page with source to pass, got %v", err)
	}
}

func TestValidateInstancePageAcceptsReactContentType(t *testing.T) {
	if !validContentTypes["react"] {
		t.Fatal("validContentTypes must include react")
	}
}

// ---- sub-page react ---------------------------------------------------------

func TestValidateSubPagesReactRequiresSource(t *testing.T) {
	raw := `[{"path":"edit","name":"Editor","content_type":"react"}]`
	if err := validateSubPages(raw); err == nil {
		t.Fatal("expected react sub-page without source_tsx to fail")
	}
	raw = `[{"path":"edit","name":"Editor","content_type":"react","source_tsx":"function Page(){return React.createElement('div',null,'hi');} return Page;"}]`
	if err := validateSubPages(raw); err != nil {
		t.Fatalf("expected react sub-page with source to pass, got %v", err)
	}
}

func TestValidateSubPagesReactRejectsHostEscapes(t *testing.T) {
	raw := `[{"path":"edit","name":"Editor","content_type":"react","source_tsx":"fetch('/x')"}]`
	if err := validateSubPages(raw); err == nil {
		t.Fatal("expected react sub-page with fetch() to fail")
	}
}

func TestValidateSubPagesStillAcceptsHTML(t *testing.T) {
	raw := `[{"path":"edit","name":"Editor","content_type":"html","content_html":"<div>hi</div>"}]`
	if err := validateSubPages(raw); err != nil {
		t.Fatalf("expected html sub-page to pass, got %v", err)
	}
}

// A garbage build body must 400, never silently build the stored source and
// report ok (fail closed on malformed input).
func TestBuildRejectsGarbageBody(t *testing.T) {
	db := newInstancePageScopeTestDB(t)
	src := `function Page() { return React.createElement('div', null, 'hi'); }`
	if _, err := db.Exec(`INSERT INTO instance_pages (name, slug, kind, content_type, source_tsx) VALUES ('R','r-page','custom','react',?)`, src); err != nil {
		t.Fatalf("seed page: %v", err)
	}
	r := httptest.NewRequest("POST", "/api/instance-pages/1/build", strings.NewReader(`not json{{{`))
	r = withChiIDParam(r, "1")
	w := httptest.NewRecorder()
	BuildInstancePageHandler(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("garbage build body: got %d (%s), want 400", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

// The build gate must enforce the same virtual-module graph as the save gate
// (validateInstancePage): an entry importing a missing Files module fails
// before any bundle is stamped.
func TestBuildEnforcesModuleGraph(t *testing.T) {
	db := newInstancePageScopeTestDB(t)
	stored := `function Page() { return React.createElement('div', null, 'hi'); }`
	if _, err := db.Exec(`INSERT INTO instance_pages (name, slug, kind, content_type, source_tsx) VALUES ('R','r-page','custom','react',?)`, stored); err != nil {
		t.Fatalf("seed page: %v", err)
	}
	fresh := "import { x } from './missing'\nfunction Page() { return React.createElement('div', null, String(x)); }\nreturn Page;"
	dto := instancePageDTO{Name: "R", Slug: "r-page", Kind: "custom", ContentType: "react", SourceTSX: fresh}
	if _, err := validateInstancePage(dto); err == nil {
		t.Fatal("premise: save gate must reject the missing-module import")
	}
	r := httptest.NewRequest("POST", "/api/instance-pages/1/build", strings.NewReader(`{"source_tsx":`+quoteForBuildTest(fresh)+`}`))
	r = withChiIDParam(r, "1")
	w := httptest.NewRecorder()
	BuildInstancePageHandler(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("build with missing module: got %d (%s), want 400", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var bundle string
	if err := db.QueryRow(`SELECT COALESCE(bundle_js,'') FROM instance_pages WHERE id = 1`).Scan(&bundle); err != nil {
		t.Fatalf("re-read page: %v", err)
	}
	if strings.Contains(bundle, "missing") {
		t.Fatal("build stamped a bundle referencing a missing module")
	}
}

func quoteForBuildTest(s string) string {
	q := strings.ReplaceAll(s, `\`, `\\`)
	q = strings.ReplaceAll(q, `"`, `\"`)
	q = strings.ReplaceAll(q, "\n", `\n`)
	return `"` + q + `"`
}
