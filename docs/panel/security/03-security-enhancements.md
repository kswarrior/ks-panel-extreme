# Security Enhancements (Reference)

Canonical: `panel/backend/SECURITY_ENHANCEMENTS.md`. Summary of implemented hardening:
rate limiting (login 5/15min, register 3/hour), password complexity + history, account lockout
(5 attempts/30min), session management, security headers, input validation, CSRF, file upload
security, security monitoring, MFA, device registration.
EOF