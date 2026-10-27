# Users and Roles

Backend: `user_handler`? `admin_handler.go`, `users` routes; `role_*`. Repos: `user_repo.go`,
`role_repo.go`, `permission_repo.go`, `role_auth_repo.go`, `role_quota_repo.go`,
`password_history_repo.go`, `recovery_code_repo.go`, `verification_repo.go`, `device_registration_repo.go`.
Frontend: `features/users/`, `features/roles/`.

## Users
CRUD, suspend/unsuspend, profile, avatar/banner, schedules, stats. Ownership scope Own/All.

## Roles
CRUD, permission assignment, schedules, stats, detail. Role quota. Allowed authorities picker.
Permission groups from `permissions.AreaGroups`. Granular CRUD + scope + sub-keys.

## Schedules
User/role schedules (cron). Migration 054 scope ownership.

## Stats
UserStats, RoleStats pages.
