# Auth and Sessions

Package: `panel/backend/internal/auth/`.

## Components
- `auth.go` — login/logout, password verify, session token issuance.
- `cookie.go` — cookie handling (secure flags).
- `session_manager.go` / `session_policy.go` — session lifecycle, expiry, concurrent sessions.
- `mfa.go` — TOTP/MFA.
- `password_policy.go` — complexity (min 12, max 128, upper/lower/number/special, unique chars, common password detection, strength score, pattern detection).
- `password_history.go` — history to prevent reuse.
- `account_lockout.go` — lockout after 5 failed attempts, 30 min duration, 15 min reset window.

## Flows
- Login: `handlers/auth_handler.go` LoginHandler; rate-limited (5/15min). Account lockout.
- Register: `auth_register_handler.go` (3/hour rate limit), email verification.
- OAuth: `oauth_handler.go` + `internal/oauth/`.
- MFA: `/api/me/auth` get/put; admin auth settings in authority.
- Sessions: admin session management (`session_admin_handler.go`), device registration.

## Security hardening
See `docs/panel/security/` and `SECURITY_ENHANCEMENTS.md`. Rate limiter `internal/api/rate_limiter.go`.
Password policy configurable; lockout configurable.
- Device registration: `device_registration_repo.go`, device-id endpoint.
- Email verification: migration 016, verification_repo.

## CSRF
`internal/api/csrf.go` — CSRF token endpoint `/api/csrf-token`, middleware.
