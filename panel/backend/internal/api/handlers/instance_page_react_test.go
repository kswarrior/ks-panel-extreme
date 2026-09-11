package handlers

import (
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
