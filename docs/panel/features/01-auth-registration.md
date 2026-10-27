# Auth and Registration

Backend: `auth_handler.go`, `auth_register_handler.go`, `oauth_handler.go`, `me_auth_handler.go`,
`me_handler.go`, `profile_handler.go`. Frontend: `features/auth/`, `features/account/`.

## Flows
- Login with rate limit + lockout; switch-login; logout.
- Register with email verification (send-verify, verify-email).
- OAuth providers (start/callback).
- MFA (TOTP) via `/api/me/auth`.
- Profile: username/password change, avatar/banner, profile fields, device registration.
- Authority branding (public).

## Permissions
VIEW_ACCOUNT umbrella; account sub-caps for profile customization. Auth pages public.
