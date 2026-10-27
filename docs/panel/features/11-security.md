# Security (Feature)

Backend: `security_handler.go`, `security_status.go`, `authentication_admin_handler.go`,
`ddos_script_handler.go`. Repo: `security_repo.go`. Models: `security.go`. Migrations: 027, 028,
039, 042, 043.

## Areas
- Security page tabs: firewall, DDoS scripts, authentication (lockout/MFA), sessions.
- Auth hardening: password policy, lockout, MFA, session policy, device registration.
- Security status endpoint.

## Frontend
`features/security/`: Security page + Authentication + Sessions tabs. `features/system/` for host
telemetry.

## Permissions
Security surfaces gated by ACCESS_ADMIN_PANEL + settings/security. Authentication admin requires
settings edit. See `docs/panel/backend/12-security.md`.
