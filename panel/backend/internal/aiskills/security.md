# Security skill

Security is managed from the Security page with five tabs: Firewall, DDoS, Authority, Authentication and Sessions. Every request is logged to security_requests (24h window) feeding an RPS/top-IPs/blocked/4xx/5xx snapshot, and suspicious probe paths plus automatic DDoS mitigation can stop traffic for 5 minutes. Authentication hardens logins with MFA recovery codes, 5-failures/15-minute lockout, password policy plus history, HttpOnly SameSite-Strict session cookies, per-endpoint rate limits and five OAuth providers. Secrets are sealed with AES-256-GCM and every reveal is audited.

Assistant coverage is read-only here: there are no security tools, so answer from this guide and point at the matching Security tab. Never reveal or guess secrets, tokens or hashes — tool output already redacts them.
