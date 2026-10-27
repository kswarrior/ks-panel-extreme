# API Keys

Backend: `api_key_handler.go`. Repo: `api_key_repo.go`. Models: `api_key.go`. Migrations: 003, 024,
034, 069. Permission: MANAGE_API_KEYS umbrella + CRUD + scope.

## Concept
Per-user API keys with limits, active flag, requests tracking. Used for programmatic access.
Frontend: `features/api-keys/`: ApiKeys, ApiKeyForm, ApiKeyDetail, ApiKeyStats, ApiKeySchedules.
User-scoped endpoints under `/api/me/api-keys`.
