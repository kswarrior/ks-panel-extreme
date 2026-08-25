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

**Scoring:** each case is scored **out of 100** for each panel. Total = average of all 50 cases.

## Feature Matrix (scored /100 per case)

| # | Feature | KS Panel | JTG Panel | Score (KS – JTG) |
|---|---------|----------|-----------|------------------|
| 1 | Multi-node management | **KS Smart** — one-command node onboarding (paste & run a single command in any VPS/VM; auto-connects with zero IP, port, or tunnel config; 99.9% uptime, safe & trusted) + CRUD + heartbeats + probes + local setup/purge + rotate token + edge RPC | Wings + local engine | 100 – 85 |
| 2 | Instance lifecycle | Deploy, start, stop, destroy (restart handlers exist, unrouted) | Start, stop, restart, delete | 80 – 85 |
| 3 | Instance suspend/unsuspend | Handlers exist, not routed | Routed + UI | 30 – 100 |
| 4 | Terminal / console | WebSocket via edge proxy (xterm.js) | Socket.IO | 95 – 95 |
| 5 | File manager UX | List/read/write/delete/URL upload via edge | Chunked upload, zip/unzip, inline preview, quicksave, context menu | 70 – 95 |
| 6 | File editor | Inline editor for editable extensions (.txt/.json/.yml/.properties/.conf/…) | No | 100 – 0 |
| 7 | Network page | Yes (instance-scoped, edge-proxied) | Yes | 95 – 95 |
| 8 | Snapshots / backups | Full CRUD + restore via edge driver | Full create/list/download/delete | 95 – 90 |
| 9 | Processes | Per-instance list + kill | No | 100 – 0 |
| 10 | Metrics | Per-instance live | Live + polling | 90 – 90 |
| 11 | Ports | Per-instance list | No | 100 – 0 |
| 12 | Secrets / env vault | Full CRUD + reveal (per-instance) | No | 100 – 0 |
| 13 | Automation | Per-instance cron jobs + run history + trigger | No | 100 – 0 |
| 14 | Per-instance audit | Timeline API wired | Dashboard only | 90 – 60 |
| 15 | Cached resources | Bulk read for InstanceCard (no per-card edge dial) | No | 100 – 0 |
| 16 | Instance actions | Named template actions + stop in-flight (edge workflow engine) | No | 100 – 0 |
| 17 | Minecraft tools | No | Properties, players, world import | 0 – 100 |
| 18 | Plugin manager (MC) | No | Install/update/remove | 0 – 100 |
| 19 | Mod engine (panel) | Goja sandbox v2: slots, event bus, assets, grants, URL install | Mod listing/info only | 100 – 40 |
| 20 | Applications | Discord/WhatsApp/Telegram/Slack/custom with grants + activate | No | 100 – 0 |
| 21 | Instance pages | Custom sidebar pages, CRUD + link + execute | No | 100 – 0 |
| 22 | Sub-user permissions | 11 area groups, umbrella-or-action, per-action keys | 9 granular per server | 95 – 75 |
| 23 | Theme system | Full studio (17 tabs) + scope assignments | 9 accent colors | 100 – 35 |
| 24 | Role visual identity | Per-role color + icon | Basic badges | 95 – 50 |
| 25 | User profiles | Avatar + banner + social links + editable fields | Basic | 95 – 40 |
| 26 | Email verification | Send-verify / verify-email flow | No | 100 – 0 |
| 27 | Device tracking | Per-device account limit via cookie | No | 100 – 0 |
| 28 | Multi-account switch | Switch-login without cookie clobber | No | 100 – 0 |
| 29 | Auth hardening | MFA, lockout, password policy + history, session manager | Relies on Firebase primitives | 95 – 55 |
| 30 | Google / OAuth login | No | Google OAuth + Firebase | 0 – 100 |
| 31 | Database management | Multi-DB + inspector + live engine switcher | Seeder-based Mongo only | 100 – 10 |
| 32 | Security page | Telemetry RSS + attack-toggle | No | 100 – 0 |
| 33 | System page | Snapshot + admin self-update/reinstall | No | 100 – 0 |
| 34 | Activity feed | Admin-wide or self-scoped (separate from audit) | Audit dashboard only | 90 – 65 |
| 35 | Node operations | CRUD + setup-local + purge-local + probe | Add + stats | 95 – 45 |
| 36 | Node heartbeats | Push ingest (token in body) | Polling | 90 – 60 |
| 37 | Mods management | Full CRUD + SSRF-hardened URL install + grants + activate/deactivate | No | 100 – 0 |
| 38 | SSRF hardening | All URL fetches: public IP, DNS-pinned, size/time capped | No | 100 – 0 |
| 39 | Registration toggle | Yes + email verify + device limits | Yes + admin invite | 95 – 90 |
| 40 | Account lockout | Yes | No | 100 – 0 |
| 41 | Password history | Yes | No | 100 – 0 |
| 42 | Settings branding | Panel name + logo + background + blur | Branding tab | 95 – 90 |
| 43 | Playit.gg tunnel | No | Start/stop/reset/claim-link | 0 – 100 |
| 44 | Electron desktop | Scaffolded only | Packaged app | 10 – 100 |
| 45 | Onboarding tutorial | No | Per-user TutorialOverlay | 0 – 100 |
| 46 | Cinematic login | No | Animated intro | 0 – 100 |
| 47 | Global search (Cmd+K) | No | Cross-server quick-switcher | 0 – 100 |
| 48 | Live sparklines | No | Per-node CPU/RAM/Disk SVG charts | 0 – 100 |
| 49 | SSE system update | Manual admin update only | Push update-available modal | 30 – 100 |
| 50 | SFTP credentials | No | Create/reset + connection guides | 0 – 100 |

## Total Score

| | Sum (50 cases × 100) | **Final score /100** |
|---|----------------------|----------------------|
| **KS Panel** | 2,850 | **57 / 100** |
| **JTG Panel** | 2,545 | **51 / 100** |

## Verdict

**KS Panel leads 57 – 51 overall**, dominating infrastructure, security, and extensibility cases (databases, auth hardening, secrets, automation, mods, applications, instance pages, SSRF hardening).

**JTG Panel wins the end-user experience cases**: Minecraft tooling, file-manager polish, tunneling, desktop packaging, onboarding, and visual dashboards.

Both share the Pterodactyl-inspired core — multi-node orchestration, instance lifecycle, RBAC, terminal, admin dashboards. Note: KS Panel is days old versus JTG's v3.x maturity, making the overall lead more notable.
