# Frontend Features

Each feature lives in `src/features/<domain>/` with `pages/`, `components/`, `api/`, `types/`,
optional `hooks/`. Domains:

- auth — login, register, verify-email
- account — own profile
- users, roles — admin CRUD
- nodes — list/detail/form/stats
- instances — list/detail/router/stats + tabs header
- instance-pages — Studio (create/edit pages), templates tab, blocks/actions/components/sub-pages editors, preview
- templates — list/form/stats + TemplateForm sections (runtime, env, actions, healthcheck, labels, pages)
- applications — catalog + configure/edit + run modal + studio tab
- mods — list + studio + presets
- stacks — external stack dashboards
- security — security page + Authentication (lockout/MFA) + Sessions tabs
- system — system page + PanelTab (update/reinstall) + HostPanel (telemetry) + charts
- themes — list + ThemeStudio tabs
- activity — feed + cards
- api-keys — list/form/detail
- authority — SMTP/OAuth/OTP settings
- database — DB inspector
- settings — panel settings
- notifications, tickets, ai-chat — supporting surfaces

See `reference/frontend-features.md` for file counts.
