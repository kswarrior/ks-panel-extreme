# KS Panel — Futures & Roadmap

Features below are sorted by implementation status. Items are not promised in any specific release order.

---

## IMPLEMENTED

1. **Activity log** — system-wide or self-scoped activity feed; admin area filters to own rows when caller is not an admin.
2. **Audit / per-instance audit timeline** — per-instance event stream; also feeds the global activity page.
3. **Mod engine v2 (panel mods)** — Goja JavaScript sandbox with event bus, slot registry, asset serving (.kspm packages), and per-capability grants + activate/deactivate. URL install is SSRF-hardened.
4. **Applications** — admin-curated bot/service templates (Discord, WhatsApp, Telegram, Slack, custom) with the same grant lifecycle as mods. URL install SSRF-hardened.
5. **Instance pages** — custom sidebar pages (CRUD + link into template + execute page action) rendered inside the instance panel.
6. **Instance advanced** — Secrets (env vault, CRUD + reveal), Automation (cron jobs + run history + trigger), Processes (list + kill), Metrics (live), Ports (list), Snapshots (driver-managed backup + restore via edge), Network, Settings, File Editor (inline for code/config extensions).
7. **Instance actions** — invoke a named template action and stop in-flight workflow; runs through edge install-workflow engine with auto-stop support.
8. **Instance file manager** — proxied to edge: list, read, write, delete, URL upload, inline editor for safe extensions.
9. **Instance terminal** — WebSocket bridge authenticated via session cookie, proxied through panel to edge `/api/edge/exec`.
10. **Cached resources** — bulk read from live_state table (no edge dial) so InstanceCard can show real mem/disk even when config has no limits block.
11. **Theme system** — full studio with scope assignments (global + per-instance). Public read unauthenticated; authoring + assignment gated.
12. **Auth hardening** — MFA, account lockout, password policy + history, session manager, HttpOnly session cookies, CSRF + security headers + rate limiting.
13. **Email verification** — send-verify (code), verify-email (token). Per-device registration limit enforced by cookie.
14. **Multi-account switch** — `switch-login` endpoint returns token in body without overwriting session cookie.
15. **User profiles** — Discord-style: avatar + banner + social links + editable scalar fields with field-level permission enforcement.
16. **Multi-DB** — SQLite, PostgreSQL, MySQL transparently; admin page shows live DB info + one-click engine switch.
17. **Security telemetry** — per-request `security_requests` row; admin page shows RPS, top IPs, blocked, errors, bandwidth, login attempts; attack-toggle persists to settings KV.
18. **System health + self-update** — System snapshot (single round-trip tiles), `update-info`, `update-check`, `update-apply` (download + swap + relaunch), `reinstall`.
19. **Multi-node** — full node CRUD, heartbeats (push ingest + history), probes (single + all), local node setup/purge, rotate token.
20. **Templates** — full CRUD + URL install + download. JSON spec interpreted by edge drivers (docker/lxd/kvm/multipass).
21. **SSRF-hardened fetches** — all URL-install paths (mods, apps, files) restricted to public IPs, DNS-pinned, size/time capped.

## IN PROGRESS / PARTIAL

22. **Instance suspend/unsuspend** — models + repository + handler exist (migrations 037/038); handlers not yet wired in router.
23. **Authority page** — SMTP, OAuth providers, registration toggles, OTP/SMS channels, TOTP authenticator-app connection with QR generation. Page and API exist; provider keyboards require finishing.
24. **Authority branding** — per-authority logo + background image settings exist in the authority spec; routing/rendering still being integrated.
25. **Dashboard charts** — MetricsChart component exists but instance page wiring to live metrics is pending.
26. **File manager UX** — backend proxy fully implemented; frontend has list/read/write/delete/URL-upload and inline editor; advanced FM UX (chunked upload, inline preview, bulk context menu) still being refined.

## PLANNED (not yet implemented)

27. **SFTP credentials** — no code exists (no models, handlers, or frontend). NOT planned.
28. **Playit.gg tunnel** — edge backend has exec/execrpc for tunnel management; frontend integration is deferred. NOT yet planned.
29. **Minecraft-specific tools** — properties editor, player manager, world import with version compatibility. NOT yet planned.
30. **Plugin manager** — install/update/remove Minecraft plugins. NOT yet planned.
31. **Google / OAuth login** — uses session cookie + JWT instead. NOT planned.
32. **Onboarding tutorial** — planned via `enableTutorial` setting; framework stubbed. NOT started.
33. **Cinematic login intro** — planned. NOT started.
34. **Global search (Cmd+K)** — planned. NOT started.
35. **Live sparkline charts** — planned for node/instance resource history. NOT started.
36. **SSE system update listener** — manual admin self-update exists; real-time push notification deferred. NOT started.
37. **Electron desktop app** — `dist/index.html` is embedded for offline/desktop rendering; Electron wrapper NOT started.