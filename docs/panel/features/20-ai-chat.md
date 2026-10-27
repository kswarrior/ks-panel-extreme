# AI Chat

Backend: `ai_chat_handler.go`, `ai_chat_extra.go`. Repos: `ai_config_repo.go`, `ai_persist_repo.go`.
Migrations: 064, 066. Skills: `internal/aiskills/*.md`. Permission: AI_CHAT_USE umbrella + QA/TOOLS/WRITES/THREADS.

## Concept
Panel-wide chat assistant behind server-side proxy (provider key never in browser). OpenAI-compatible
or Ollama (fallback). SSE streaming with JSON fallback. Tools: list/get instances, nodes, templates,
instance pages, users, roles, themes, tickets, panel update check, system status, skill docs. Writes
produce confirmation tickets. Chats persist per-user threads (last 50 messages). 20 chats/min per user;
5 tool rounds/turn. Usage/cost lines in activity_logs. Admins configure provider/pricing in chat settings.

## AI skills
`internal/aiskills/` guides: ai, applications, automation, backups, database, instance_pages, instances,
mods, nodes, notifications, security, sftp, templates, themes, tickets, updates, users, index.
Size cap ~3.2KB each; topics/index/enum sync; TestAIDocsCoverage.

## Frontend
`features/ai-chat/`. Global writes switch + area permissions required for writes.
EOF