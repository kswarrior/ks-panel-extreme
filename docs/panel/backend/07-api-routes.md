# API Routes

All routes wired in `panel/backend/internal/api/server.go` (`NewRouter`). Middleware: CSRF, rate
limit, security headers, validation. Groups:
- Public: health, csrf-token, auth (login/register/verify/oauth), settings panel-name/logo/favicon,
  themes list, authority branding, user profile/avatar/banner, node/stack heartbeat, edge config/tunnel.
- Authed (`/api/me*`, users, roles, settings, panel-pages, authority, ai, themes, api-keys, nodes,
  templates, mods, applications, stacks, instance-pages, tickets, instances, secrets, automation,
  snapshots, backups, security, system, updates, activity, notifications, database, account).

## Permission gating
Routes use `requireUmbrellaOrAction(group, action)`; instance power sub-actions use control sub-keys.

## WebSockets / channels
- Terminal: `terminal_handler.go`, `wss_channel_handler.go`.
- Notifications hub: `notification_hub.go`.
- Stack proxy/serve: `stack_proxy.go`, `stack_serve.go`, `stack_serve_port.go`.

## Full list
See `reference/api-endpoints.md` (extracted from server.go) and server.go itself.
