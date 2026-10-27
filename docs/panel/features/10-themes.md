# Themes

Backend: `theme_handler.go`, `theme_manifest_test.go`. Repo: `theme_repo.go`. Models: `theme.go`.
Migrations: 015, 067 (revisions). Permission: MANAGE_THEMES umbrella + theme verbs + scope.

## Concept
Global/local themes: tokens (accent, background, button, card, typography, sidebar, etc.). Theme
revisions. Publishing global themes (server-side) requires MANAGE_THEMES/CREATE_GLOBAL_THEMES.
Local themes in browser localStorage.

## Frontend
`features/themes/`: Themes, ThemeStudio, ThemeStats, ThemeDetail, ThemeSchedules. `src/theme/` defaults
+ studio controls.

## Market
`themes_market/` → embedded via `themelib` (rebuild sync). Theme assignment to pages/areas.
> 