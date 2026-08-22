# KS Panel vs JTG Panel — Feature Comparison

> KS Panel features verified directly from `/test/ks-panel/panel/backend/internal/api/server.go` (635-line route table) and `/test/ks-panel/panel/frontend/src/app/router.tsx` (468-line router).  
> JTG Panel features sourced from `/test/ks-panel/opponent/jtg.md`.

---

## High-Level Overview

| Dimension | KS Panel | JTG Panel |
|-----------|----------|-----------|
| Language | Go (backend) + TypeScript/React (frontend) | Node.js/Express + Next.js 14 + React 18 |
| Database | SQLite / PostgreSQL / MySQL | MongoDB |
| Containers | Docker, KVM, LXD, Multipass | Docker / LXC |
| Real-time | WebSocket terminal + 3.5s polling | Socket.IO |
| Auth | Session cookie + JWT, MFA, lockout, password policy, history | JWT + Passport.js, Google OAuth |
| Styling | Tailwind + glass-morphism + route-scoped themes | Tailwind CSS 3.x "Dark Glass" |
| Icons | SVG inline | lucide-react |
| Routing | React Router v6, feature-slice architecture | Next.js App Router |
| Version (implied) | 1.x (active dev) | 3.0.0 |

---

## Feature Matrix

| Feature | KS Panel | JTG Panel | Notes |
|---------|----------|-----------|-------|
| Multi-node management | Full | Full | KS: CRUD, heartbeats, probes, local setup/purge, edge RPC. JTG: Wings + local engine. |
| Instance lifecycle | Deploy, start, stop, destroy | Start, stop, restart, delete, suspend | KS restart missing from router; JTG has suspend UI. KS has handlers in code. |
| Instance suspend/unsuspend | Handlers exist, not routed | Yes (routed) | JTG ahead — KS migration 038 exists but suspend routes not in router. |
| Terminal / console | WebSocket via edge proxy | Socket.IO | Both wired; KS xterm.js frontend. |
| File manager | Full (proxy to edge): list, read, write, delete, URL upload, inline editor | 1008-line client-side FM | JTG has chunked upload, zip/unzip, inline preview, quicksave. |
| File editor | Inline editor for editable extensions (.txt, .json, .yml, .yaml, .properties, .log, .conf, .ini, .sh, .bat, .cmd, .env, .toml, .xml, .md) | No | KS only |
| Network page | Yes (instance-scoped) | Yes | Parity |
| Snapshots / backups | Full CRUD + restore via edge (driver-managed) | Full (create, list, download, delete) | Both implemented; KS uses edge driver. |
| Processes | Per-instance list + kill | No | KS only |
| Metrics | Per-instance live | LiveSparkline + 3.5s polling | Both implemented; JTG has visual sparklines. |
| Ports | Per-instance list | No | KS only |
| Secrets / env vault | Full CRUD + reveal (per-instance) | No | KS only |
| Automation | Per-instance jobs + runs + trigger | No | KS only |
| Per-instance audit | Timeline API wired | Dashboard | KS per-instance granularity. |
| Cached resources | Bulk read (no edge dial) for InstanceCard | No | KS only — avoids edge dial per card. |
| Instance actions | Invoke named actions + stop in-flight | No | KS only — template-defined actions via edge install-workflow engine. |
| Minecraft tools | No | Properties, players, world, plugins, mods | JTG only |
| Plugin manager (MC) | No | Install/update/remove | JTG only |
| Mod engine (panel) | Goja sandbox v2: slots, event bus, assets, grants, URL install | Mod listing/info only | KS is sandboxed JS; JTG is catalog. |
| Applications | Full (Discord/WhatsApp/Telegram/Slack/custom with grants + activate) | No | KS only |
| Instance pages | Full (custom sidebar pages, CRUD + link + execute) | No | KS only |
| Sub-user permissions | 11 area groups, umbrella-or-action, per-action keys | 9 granular per server | KS is more granular and expressive. |
| Theme system | Full studio (17 tabs) + scope assignments | 9 accent colors | KS far richer. |
| Role visual identity | Per-role display color + icon | Basic role badges | KS more expressive. |
| User profiles | Avatar + banner + social links + editable fields | Basic | KS richer. |
| Email verification | Full (send-verify, verify-email, device cookie) | No | KS only |
| Device tracking | Per-device account limit via cookie | No | KS only |
| Multi-account switch | Switch-login (no cookie clobber, token in body) | No | KS only |
| Auth hardening | MFA, account lockout, password policy, password history, session manager | Google OAuth + Firebase | KS stronger on primitives; JTG has social. |
| Google / OAuth login | No | Google OAuth + Firebase | JTG only |
| Database management | Multi-DB + inspector + engine switcher (SQLite/Postgres/MySQL) | Seeder-based Mongo only | KS only. |
| Security page | Telemetry RSS + attack-toggle | No | KS only. |
| System page | Snapshot + admin self-update + reinstall | No | KS only. |
| Activity feed | Admin-wide or self-scoped | Audit dashboard | KS separates activity vs audit. |
| Node operations | CRUD + rotate token + setup-local + purge-local + probe | Add + stats | KS deeper: local node bootstrap, edge PID tracking. |
| Node heartbeats | Push ingest (public, token-auth in body) | Polling | KS push model. |
| Mods (panel) | Full CRUD + URL install (SSRF-hardened) + download + grants + activate/deactivate | No | KS only. |
| SSRF hardening | All URL fetches (public IP, DNS-pinned, size/time capped) | No | KS only. |
| Registration toggle | Yes + email verify + device limits | Yes + admin invite | Near parity. |
| Account lockout | Yes | No | KS only. |
| Password history | Yes | No | KS only. |
| Settings branding | Panel name + logo + background image + blur | AdminSettingsPage branding tab | KS branding inline. |
| Playit.gg tunnel | No | Full (start, stop, reset, claim link) | JTG only. |
| Electron desktop | No (dist/index.html scaffolded) | Yes | JTG only. |
| Onboarding tutorial | No | Full TutorialOverlay (per-user, dev/prod keys) | JTG only. |
| Cinematic login | No | Yes | JTG only. |
| Global search (Cmd+K) | No | Yes | JTG only. |
| Live sparklines | No | Per-node CPU/RAM/Disk | JTG only. |
| SSE system update | No (manual admin self-update/reinstall) | Yes | JTG only. |
| SFTP credentials | No | Full (create, reset, connection guide) | JTG only. |

---

## Unique to KS Panel

- **Multi-DB support** — runs on SQLite, PostgreSQL, or MySQL with a live engine-switcher in the admin Database page.
- **Applications** — admin-curated bot/service templates (Discord, WhatsApp, Telegram, Slack, custom) with a grant lifecycle mirroring mods.
- **Instance Pages** — custom sidebar pages injected into the instance panel, linkable to any template, with server-side action execution.
- **Mod Engine v2** — Goja JavaScript sandbox with event bus, slot registry, asset serving, and capability grants; mods are safe add-ons that extend the panel UI.
- **Per-instance advanced pages** — Secrets (env vault), Automation (cron jobs + run history), Processes (list + kill), Metrics (live), Ports, Snapshots (driver-managed backup + restore), Audit timeline, Cached resources (bulk, no edge dial).
- **Instance actions** — invoke named template-defined actions and stop in-flight workflows; runs through the edge install-workflow engine.
- **Instance file editor** — inline text editor for common code/config extensions inside the file browser.
- **Network page** — per-instance network information (proxied via edge).
- **11 permission area groups** — umbrella-or-action pattern with granular per-verb keys, fluent per-role narrowing.
- **Multi-account switch-login** — second-account login without clobbering the primary session cookie; token returned in body.
- **User profiles** — Discord-style: avatar + banner + social links + editable scalar fields with field-level permission enforcement.
- **Email verification** — full send-verify / verify-email flow with per-device account limit via cookie.
- **Device registration** — cookie-tracked device ID enforcing per-device account creation limits.
- **SSRF-hardened URL fetches** — all install-from-URL paths (mods, apps, files) restricted to public IPs, DNS-pinned, size/time capped.
- **Node bootstrap** — setup-local downloads and installs the edge binary; purge-local stops and removes the local node directory.
- **Templates** — import from URL + download; admin-managed JSON specs interpreted by edge drivers.
- **Security telemetry** — per-request security_requests row; admin page shows RPS, top IPs, blocked, errors, bandwidth, login attempts.
- **Admin self-update/reinstall** — download + swap + relaunch panel binary from within the admin System page.
- **File URL upload** — SSRF-hardened fetch then proxied to edge as upload.
- **Instance cached resources** — fan-out across instance cards reads live_state table once (no per-instance edge dial).

---

## Unique to JTG Panel

- **Playit.gg integration** — one-click tunnel creation with claim-link flow, restart, and reset.
- **Electron desktop app** — packaged host-level desktop client.
- **SFTP credentials** — create, reset, and client connection guides for FileZilla/WinSCP/Cyberduck.
- **Full file manager UX** — chunked upload, zip/unzip, inline file preview, quicksave buttons, context menu per file.
- **Minecraft tools** — properties editor, player manager (OP/Kick/Ban/IP-Ban), world import with version compatibility check.
- **Plugin / mod manager** — install, update, remove Minecraft plugins per server.
- **Google OAuth + Firebase Auth** — social login backed by Firebase config.
- **Onboarding tutorial** — first-run per-user tutorial overlay (dev: sessionStorage, prod: localStorage).
- **Cinematic login intro** — animated background experience.
- **Global search (Cmd+K)** — cross-server and nav quick-switcher with arrow-key nav.
- **Live sparklines** — per-node CPU/RAM/Disk history charts (last 20 points, SVG bezier).
- **SSE system update listener** — WebSocket/SSE stream pushes update-available modal in real time.

---

## Verdict

**KS Panel** is a backend-first, security-hardened multi-tenant platform: it supports three databases, ships a sandboxed JavaScript mod engine, exposes 11 permission area groups with per-action granularity, runs applications and instance pages, and proxies the full instance shell (terminal, files, processes, metrics, ports, snapshots, secrets, automation, network, audit) through a driver-agnostic edge RPC layer. Its deal strengths are multi-tenancy, auditability, and extensibility.

**JTG Panel** is a consumer-facing Minecraft hosting UX: it wins on game-specific tooling (properties/players/world/plugins), file-system polish (chunked upload, inline preview), the Playit tunnel, desktop packaging, social login, and visual sparkline dashboards. Its deal strengths are game-native UX and end-user delight.

Both panels share the Pterodactyl-inspired core: multi-node orchestration, instance lifecycle, RBAC, terminal, and admin dashboards — but they optimize for different operators.