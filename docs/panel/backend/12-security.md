# Backend Security

## Surfaces
- Auth: rate limit, lockout, password policy/history, MFA, CSRF, sessions, device registration.
- Permissions: granular capability keys, ownership scopes, umbrella-or-action gates.
- Security handlers: `security_handler.go`, `security_status.go`, `ddos_script_handler.go`,
  `authentication_admin_handler.go`.
- Security repo: `security_repo.go`, `security_config` migration 028, `ddos_security` migration 039,
  `security_tabs` migration 042, `auth_hardening` migration 043.
- Secret storage: `internal/secretbox/`, `instance secrets` migration 021, `secret_repo.go`.
- Rate limiter: `internal/api/rate_limiter.go`.
- Security headers: `internal/api/security_headers.go`, `security_middleware.go`, `security_wiring_test.go`.
- Validation: `internal/api/validation_middleware.go`.

## Firewall / DDoS
Security page + tabs: firewall, DDoS scripts, auth config. See aiskills/security.md.

## Threat model / build security
See `docs/THREAT_MODEL.md`, `docs/BUILD_SECURITY.md`, `docs/panel/security/`.

## Hardening doc
`panel/backend/SECURITY_ENHANCEMENTS.md` — rate limiting, password policy, lockout, session mgmt,
security headers, input validation, CSRF, file upload security, security monitoring.
