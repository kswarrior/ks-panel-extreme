# Settings

Backend: `settings_handler.go`. Repo: `settings_repo.go`. Migrations: 002 (settings), 009 (panel logo),
040 (panel port). Permission: VIEW_SETTINGS/SETTINGS_VIEW + SETTINGS_EDIT.

## Concept
Panel settings: panel name, logo, favicon, port, etc. Custom panel pages (About/Docs) with role
allow-lists, nav, slug. Frontend: `features/settings/`: Settings, PanelPageView.
