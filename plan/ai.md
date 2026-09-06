# AI Chat Plan

Bottom-right FAB opens panel-wide AI assistant. SHIPPED (was plan-only).

## UX
- `features/ai-chat/`: `ChatFab.tsx`, `ChatPanel.tsx`, `ConfirmCard.tsx`, `api/aiChat.ts`, `store/aiChatStore.ts`.
- Mount once in `src/app/App.tsx` beside `ConfirmDialog`, hidden on `/auth`.
- `fixed bottom-5 right-5`, theme-aware, mobile full-width, header shows `{panel_name} Assistant`.

## Backend
- `handlers/ai_chat_handler.go` + `handlers/ai_chat_extra.go`, routes in `server.go` (protected group):
  - `GET /api/ai/config` (authed, masked), `PUT /api/ai/config` + `POST /api/ai/test` (admin, `SETTINGS_EDIT`), `POST /api/ai/chat` (authed, `AI_CHAT_USE`, rate-limited).
  - `POST /api/ai/chat/stream` (SSE, same gate; falls back to `/api/ai/chat` client-side).
  - `GET|POST /api/ai/threads`, `GET|PUT|DELETE /api/ai/threads/{id}[/messages]` (authed, `AI_CHAT_USE`, per-user isolated).
  - `GET /api/ai/usage` (admin, `SETTINGS` view; aggregates usage/cost audit rows).
- Proxy only — key never reaches browser. One client supports both modes:
  - OpenAI-compatible: `POST {base_url}/chat/completions` (`stream:true` for SSE).
  - Ollama: `POST {base_url}/api/chat` when `ollama_mode=true` (`stream:true` NDJSON for SSE).
- Admin config fields: `Base URL`, `API Key` (secret, blank=keep via `secretbox`), `Model ID`, `Ollama mode`, `Temperature`, `Max tokens`, `Writes allowed` kill-switch, fallback triple (`Fallback Base URL`/`Key`/`Model`/`Ollama mode`, empty=disabled), per-1k-token costs.
- Migrations `064_ai_config.sql` (base KV) + `066_ai_persistence.sql` (all 3 DBs; numbered 066 because 065 is taken by tickets_attachments_sla_notify): `ai_confirmation_tickets`, `ai_chat_threads`, `ai_chat_messages`, `ai_fallback_*` / `ai_cost_*` settings.

## Agent tools + safety
- Read (no confirm): `list_instances, get_instance, list_nodes, get_node, list_templates, get_template (sections summary/steps/description), list_instance_pages, get_instance_page, list_users, get_user, list_roles, list_themes, list_tickets, get_ticket, check_panel_update, get_docs, get_system_status`.
- Write (confirm required): `instance_action, edit_instance, reinstall_instance, delete_instance, suspend_instance, unsuspend_instance, update_settings, create_theme, edit_theme, delete_theme, create_template, edit_template, delete_template, edit_template_steps (remove/add/move), set_template_command, remove_template_action, create_node, edit_node, delete_node, create_instance_page, edit_instance_page, delete_instance_page, create_user, edit_user, delete_user, create_ticket, reply_ticket, update_ticket, broadcast_notification, deploy_instance, reinstall_panel`.
- Deliberately unoffered: API keys (would persist secrets in chat history), shell/terminal + file writes (RCE surface), role permission editing (lockout risk), mod/application uploads (needs file bytes), backup execution + datamove (long, destructive ops stay in UI).
- Each tool re-checks existing permission engine (e.g. `create_theme` needs `MANAGE_THEMES`). Denied -> LLM explains.
- Write flow: LLM -> `confirmation_ticket {id, summary, diff}` (DB-backed, 10-min user-bound, survives restarts) -> `ConfirmCard` Approve/Deny -> execute on approve. All writes go to `activity_logs`.
- Guards: per-user rate limit 20/min, max 5 tool loops, 60s timeout, redact `password/token/secret` from tool output.
- Per-request model override honoured for admins (`SETTINGS_EDIT`) only; everyone else's value is ignored.
- Every chat/stream request logs one `activity_logs` row (category `ai`, action `chat`, `model/provider/in/out/cost`) feeding the admin usage dashboard in `AIConfigCard`.

## System prompt (built server-side per request)
1. Identity: `You are {panel_name} Assistant for {hosting_name}. About: {hosting_about}.`
2. Panel knowledge (code-owned): game servers, Panel+Edge arch, Docker/LXD/KVM, instances/templates/nodes/mods/apps/tickets.
3. Live context (redacted): `{username, role, permissions[]}`, counts only.
4. Rules: only use allowed tools, list before acting, never invent IDs, writes need confirmation ticket first.
5. Admin extra: `{ai_system_extra}` custom instructions.

## Docs coverage (`get_docs`)
- 18 topics served from the embedded skill bundle `panel/backend/internal/aiskills/*.md` (one guide per area, each under the ~4KB tool-result cap): `index, instances, templates, nodes, instance_pages, users, updates, mods, applications, tickets, backups, security, database, automation, sftp, themes, notifications, ai`. Each file doubles as a readable repo doc; `TestAIDocsCoverage` + `aiskills` package tests lock the contract.

## Build order (done)
1. Migration + provider client. 2. Config UI + test button. 3. FAB + read-only chat. 4. Tools + confirm cards. 5. Persistent tickets (066) + streaming SSE + threads + fallback + usage/cost + docs expansion.
