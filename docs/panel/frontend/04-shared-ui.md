# Shared UI Kit

Location: `panel/frontend/src/shared/components/`.

## ui/ (reusable)
Card, Modal, Field, Loading, MetricsChart, CustomPageView, RequireAuth, RequirePermission,
RichMenu, plus forms. Instance YAML pages reuse these classes/tokens.

## layout/
Main Layout, Sidebar, Header, InstanceNavContext, ThemeSync, Background. Page chrome lives here.
Sidebar links + permission gating; Header titles.

## forms/ + brand/
Shared form rows + branding components.

## Theme sync
`RouteThemeSync` applies active theme per route. Active theme baked into YAML-page iframes as
CSS vars (`var(--ks-*)`).

## Custom page rendering
CustomPageView handles html (sandboxed iframe), markdown, blocks, react (JSX entry + virtual
module files stored as components type=module).
