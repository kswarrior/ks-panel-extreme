# KS Panel vs JTG Panel — Codebase Comparison

> Code-only comparison. No community, popularity, or ecosystem metrics.
>
> KS Panel features verified directly from `panel/backend/internal/api/server.go` (635-line route table) and `panel/frontend/src/app/router.tsx` (468-line router).
> JTG Panel features captured from a prior internal audit (source doc since removed).

## Identity

| | KS Panel | JTG Panel |
|---|----------|-----------|
| Language | Go (backend) + TypeScript/React (frontend) | Node.js/Express + Next.js 14 + React 18 |
| Database | SQLite / PostgreSQL / MySQL | MongoDB |
| Containers | Docker, KVM, LXD, Multipass | Docker / LXC |
| Real-time | WebSocket terminal + 3.5s polling | Socket.IO |
| Styling | Tailwind + glass-morphism + route-scoped themes | Tailwind CSS 3.x "Dark Glass" |
| Routing | React Router v6, feature-slice architecture | Next.js App Router |
| Version | 1.x (active dev) | 3.0.0 |
| Age | ~3 days of git history (first commit 2026-08-22) — very young, fast-moving | Unknown (v3.x implies a longer development cycle; exact date not recorded) |

**Scoring:** each row awards **1 point** to the winner, or **0.5 / 0.5** on parity.

## Scored Feature Matrix

| # | Feature | KS Panel | JTG Panel | Score (KS–JTG) |
|---|---------|----------|-----------|----------------|
| 1 | Multi-node management | CRUD + heartbeats + probes + local setup/purge + edge RPC | Wings + local engine | 0.5 – 0.5 |
| 2 | Instance lifecycle | Deploy, start, stop, destroy (restart handlers exist, unrouted) | Start, stop, restart, delete | 0.5 – 0.5 |
| 3 | Instance suspend/unsuspend | Handlers exist, not routed | Routed + UI | 0 – 1 |
| 4 | Terminal / console | WebSocket via edge proxy (xterm.js) | Socket.IO | 0.5 – 0.5 |
| 5 | File manager UX | List/read/write/delete/URL upload via edge | Chunked upload, zip/unzip, inline preview, quicksave, context menu | 0 – 1 |
| 6 | File editor | Inline editor for editable extensions (.txt/.json/.yml/.properties/.conf/…) | No | 1 – 0 |
| 7 | Network page | Yes (instance-scoped, edge-proxied) | Yes | 0.5 – 0.5 |
| 8 | Snapshots / backups | Full CRUD + restore via edge driver | Full create/list/download/delete | 0.5 – 0.5 |
| 9 | Processes | Per-instance list + kill | No | 1 – 0 |
| 10 | Metrics | Per-instance live | Live + 3.5s polling | 0.5 – 0.5 |
| 11 | Ports | Per-instance list | No | 1 – 0 |
| 12 | Secrets / env vault | Full CRUD + reveal (per-instance) | No | 1 – 0 |
| 13 | Automation | Per-instance cron jobs + run history + trigger | No | 1 – 0 |
| 14 | Per-instance audit | Timeline API wired | Dashboard only | 1 – 0 |
| 15 | Cached resources | Bulk read for InstanceCard (no per-card edge dial) | No | 1 – 0 |
| 16 | Instance actions | Named template actions + stop in-flight (edge workflow engine) | No | 1 – 0 |
| 17 | Minecraft tools | No | Properties, players, world, plugins, mods | 0 – 1 |
| 18 | Plugin manager (MC) | No | Install/update/remove | 0 – 1 |
| 19 | Mod engine (panel) | Goja sandbox v2: slots, event bus, assets, grants, URL install | Mod listing/info only | 1 – 0 |
| 20 | Applications | Discord/WhatsApp/Telegram/Slack/custom with grants + activate | No | 1 – 0 |
| 21 | Instance pages | Custom sidebar pages, CRUD + link + execute | No | 1 – 0 |
| 22 | Sub-user permissions | 11 area groups, umbrella-or-action, per-action keys | 9 granular per server | 1 – 0 |
| 23 | Theme system | Full studio (17 tabs) + scope assignments | 9 accent colors | 1 – 0 |
| 24 | Role visual identity | Per-role color + icon | Basic badges | 1 – 0 |
| 25 | User profiles | Avatar + banner + social links + editable fields | Basic | 1 – 0 |
| 26 | Email verification | Send-verify / verify-email flow | No | 1 – 0 |
| 27 | Device tracking | Per-device account limit via cookie | No | 1 – 0 |
| 28 | Multi-account switch | Switch-login without cookie clobber | No | 1 – 0 |
| 29 | Auth hardening | MFA, lockout, password policy + history, session manager | Relies on Firebase primitives | 1 – 0 |
| 30 | Google / OAuth login | No | Google OAuth + Firebase | 0 – 1 |
| 31 | Database management | Multi-DB + inspector + live engine switcher | Seeder-based Mongo only | 1 – 0 |
| 32 | Security page | Telemetry RSS + attack-toggle | No | 1 – 0 |
| 33 | System page | Snapshot + admin self-update/reinstall | No | 1 – 0 |
| 34 | Activity feed | Admin-wide or self-scoped (separate from audit) | Audit dashboard only | 1 – 0 |
| 35 | Node operations | CRUD + rotate token + setup-local + purge-local + probe | Add + stats | 1 – 0 |
| 36 | Node heartbeats | Push ingest (token in body) | Polling | 1 – 0 |
| 37 | Mods management | Full CRUD + SSRF-hardened URL install + grants + activate/deactivate | No | 1 – 0 |
| 38 | SSRF hardening | All URL fetches: public IP, DNS-pinned, size/time capped | No | 1 – 0 |
| 39 | Registration toggle | Yes + email verify + device limits | Yes + admin invite | 0.5 – 0.5 |
| 40 | Account lockout | Yes | No | 1 – 0 |
| 41 | Password history | Yes | No | 1 – 0 |
| 42 | Settings branding | Panel name + logo + background + blur | Branding tab | 0.5 – 0.5 |
| 43 | Playit.gg tunnel | No | Start/stop/reset/claim-link | 0 – 1 |
| 44 | Electron desktop | Scaffolded only | Packaged app | 0 – 1 |
| 45 | Onboarding tutorial | No | Per-user TutorialOverlay | 0 – 1 |
| 46 | Cinematic login | No | Animated intro | 0 – 1 |
| 47 | Global search (Cmd+K) | No | Cross-server quick-switcher | 0 – 1 |
| 48 | Live sparklines | No | Per-node CPU/RAM/Disk SVG charts | 0 – 1 |
| 49 | SSE system update | Manual admin update only | Push update-available modal | 0 – 1 |
| 50 | SFTP credentials | No | Create/reset + connection guides | 0 – 1 |

## Total Score

| | Wins | Ties | Points |
|---|------|------|--------|
| **KS Panel** | 29 | 8 | **33 / 50** |
| **JTG Panel** | 13 | 8 | **17 / 50** |

## Verdict

**KS Panel wins 33 – 17.**

KS Panel is a backend-first, security-hardened multi-tenant platform: three databases, a sandboxed JavaScript mod engine, 11 permission area groups, applications and instance pages, and the full instance shell (terminal, files, processes, metrics, ports, snapshots, secrets, automation, network, audit) proxied through a driver-agnostic edge RPC layer.

JTG Panel is a consumer-facing Minecraft hosting UX: game-specific tooling, file-manager polish, Playit tunnel, desktop packaging, social login, and sparkline dashboards.

Both share the Pterodactyl-inspired core — multi-node orchestration, instance lifecycle, RBAC, terminal, admin dashboards — but optimize for different operators. Note: KS Panel is days old versus JTG's v3.x maturity, making the point gap more notable.
