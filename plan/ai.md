# AI Chat Plan

Bottom-right FAB opens panel-wide AI assistant. Plan only, no build yet.

## UX
- `features/ai-chat/`: `ChatFab.tsx`, `ChatPanel.tsx`, `ConfirmCard.tsx`, `api/aiChat.ts`, `store/aiChatStore.ts`.
- Mount once in `src/app/App.tsx` beside `ConfirmDialog`, hidden on `/auth`.
- `fixed bottom-5 right-5`, theme-aware, mobile full-width, header shows `{panel_name} Assistant`.

## Backend
- New `handlers/ai_chat_handler.go`, routes in `server.go` (protected group):
  - `GET /api/ai/config` (authed, masked), `PUT /api/ai/config` + `POST /api/ai/test` (admin, `SETTINGS_EDIT`), `POST /api/ai/chat` (authed, `AI_CHAT_USE`, rate-limited).
- Proxy only — key never reaches browser. One client supports both modes:
  - OpenAI-compatible: `POST {base_url}/chat/completions`
  - Ollama: `POST {base_url}/api/chat` when `ollama_mode=true`.
- Admin config fields: `Base URL`, `API Key` (secret, blank=keep via `secretbox`), `Model ID`, `Ollama mode`, `Temperature`, `Max tokens`, `Writes allowed` kill-switch.
- Migration `040_ai_config.sql` (all 3 DBs): `ai_enabled, ai_base_url, ai_api_key_enc, ai_model_id, ai_ollama_mode, ai_system_extra, ai_allow_writes, hosting_name, hosting_about`.

## Agent tools + safety
- Read (no confirm): `list_instances, get_instance, list_nodes, list_templates, get_docs, get_system_status`.
- Write (confirm required): `instance_action, update_settings, create_theme, create_template, create_instance_page, create_user, deploy_instance`.
- Each tool re-checks existing permission engine (e.g. `create_theme` needs `MANAGE_THEMES`). Denied -> LLM explains.
- Write flow: LLM -> `confirmation_ticket {id, summary, diff}` -> `ConfirmCard` Approve/Deny -> execute on approve. All writes go to `activity_logs`.
- Guards: per-user rate limit (reuse `ip_rate_limiter`), max 5 tool loops, 60s timeout, redact `password/token/secret` from tool output.

## System prompt (built server-side per request)
1. Identity: `You are {panel_name} Assistant for {hosting_name}. About: {hosting_about}.`
2. Panel knowledge (code-owned): game servers, Panel+Edge arch, Docker/LXD/KVM, instances/templates/nodes/mods/apps/tickets.
3. Live context (redacted): `{username, role, permissions[]}`, counts only.
4. Rules: only use allowed tools, list before acting, never invent IDs, writes need confirmation ticket first.
5. Admin extra: `{ai_system_extra}` custom instructions.

## Build order (later)
1. Migration + provider client. 2. Config UI + test button. 3. FAB + read-only chat. 4. Tools + confirm cards.
