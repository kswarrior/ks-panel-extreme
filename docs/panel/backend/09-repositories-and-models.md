# Repositories and Models

## Models (`internal/models/`)
Shared DB structs used by handlers + repositories. Files: activity, api_key, authority, instance,
instance_advanced, mod, moddeps, modmanifest, modver, node, notification, security, stack, theme, ticket,
plus `models.go` (User, Role, Permission, Template, Instance, ApiKey, Node, etc.).

## Repositories (`internal/repository/`)
DB access only. One repo per domain (~60 files). Notable:
- `db.go` connection helpers, `db_time.go`, `pg_compat.go` (dialect compat).
- `instance_repo.go`, `instance_advanced_repo.go`, `instance_page_repo.go`, `instance_port_repo.go`.
- `page_kv_repo.go` (instance page KV store).
- `mod_repo.go`, `mod_settings_repo.go`, `mod_deps_repo_test.go`.
- `application_repo.go`, `stack_repo.go`, `stack_serve_test.go`.
- `theme_repo.go`, `template_repo.go`, `node_repo.go`.
- `user_repo.go`, `role_repo.go`, `permission_repo.go`, `user_auth_repo.go`, `role_auth_repo.go`.
- `ai_config_repo.go`, `ai_persist_repo.go`.
- `automation_repo.go`, `backup_repo.go`, `security_repo.go`, `settings_repo.go`, `secret_repo.go`.
- `ticket_repo.go`, `ticket_attachment_repo.go`, `ticket_sla_repo.go`.
- `activity_repo.go`, `notification_repo.go`, `notification_pref_repo.go`.
- `api_key_repo.go`, `authority_repo.go`, `sftp_repo.go`, `wss_channel_repo.go`, `update_window_repo.go`,
  `panel_page_repo.go`, `password_history_repo.go`, `recovery_code_repo.go`, `role_quota_repo.go`,
  `verification_repo.go`, `device_registration_repo.go`, `backup_repo.go`, `database_verify_repo.go`.
- `smtp_sender.go`, `notify_mail.go`.

## Conventions
- Repos accept context + db handle; use dialect-aware SQL.
- Time handling via `db_time.go`.
- Tests: `*_test.go` alongside (pg_compat, user_repo_time, instance_repo_time, etc.).
