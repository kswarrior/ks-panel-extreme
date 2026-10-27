# Authority

Backend: `authority_handler.go`, `authority_branding_handler.go`, `oauth_handler.go`.
Repo: `authority_repo.go`. Models: `authority.go`. Migrations: authority settings in 002? OAuth.

## Concept
Auth-only admin page: SMTP, registration toggles, OAuth providers, OTP/SMS channels, TOTP
authenticator-app connection, registration requirement policy. Authority branding public endpoint.
Gated by settings umbrella-or-action. Frontend: `features/authority/`.
