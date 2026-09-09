# KS Panel vs Minecraft Hosting Panels — Codebase Comparison

## Identity

|                | KS Panel                        | JTG Panel                    | Pterodactyl        | Pelican                 | Crafty 4               | PufferPanel | AMP | Multicraft | MineOS | Pyrodactyl |
|----------------|---------------------------------|------------------------------|--------------------|-------------------------|------------------------|-------------|-----|------------|--------|------------|
| Stack          | Go 1.25 + TS/React 18.3 + Vite 5.4 + Zustand 4.5 + Xterm 6.0 + Tailwind 3.4 | Express/Vite + React 19, flat-JSON | Laravel 12 + React | Laravel 13 + Filament 5 | Python Tornado + Jinja2 | Go + Vue.js + SCSS (single static binary) | C#/.NET 8 + Kestrel (commercial ADS) | PHP Yii panel + native daemon (commercial) | Node.js + AngularJS + websockets | Laravel 12 + Vite/React (Ptero fork) |
| Database       | SQLite / PostgreSQL / MySQL transparent (`internal/db/db.go` + `dialect.go`, `datamove` parents-first batch 500, `kspanel.env`) | Flat `.data/*.json` files | MySQL | MySQL / PG | SQLite (peewee) | SQLite / MySQL / PG / MSSQL (config-only, no live switch) | SQLite / MySQL (`ampinstmgr`, file+DB) | SQLite / MySQL (panel+daemon DBs) | No DB (filesystem + `cron.config`, shadow auth) | MySQL (same as Ptero) |
| Containers     | Docker, KVM (QEMU `virt-install`/`virsh`), LXD (`lxc`), Multipass — 4 drivers `edge/backend/internal/drivers/*` (851+373+392+244 lines) | Docker (dockerode) | Docker/Wings | Docker/Wings | Local processes | Host processes + Docker optional | Host + Docker/Podman rootless | Local processes (daemon per host) | Local processes (profiles) | Docker/Wings (same as Ptero) |
| Version        | 0.1.0 (`panel/frontend/package.json:2`) — ~4306 commits `git log --oneline \| wc -l` 2026-09-02 | 3.x | 1.x (mature 8y) | 1.x (modern rewrite 2y) | 4.x (7y) | 3.x (v3.0.6 2026-03, ~12y project) | 2.x → 3 beta (commercial 10y+) | 2.x (commercial 13y+) | mineos-node (10y+, single-host) | 1.x (Ptero fork, Vite) |
| Frontend       | React 18.3.1 + Router 6.30 + Zustand 4.5 + Xterm 6.0 (`@xterm/addon-fit|web-links`) + Tailwind 3.4 (Vite 5.4 `manualChunks xterm|router|react|vendor`, `tsc --noEmit` clean, dev proxy `ws:true` → :5050) | React 19 + flat JSON | Blade + React | Filament 5 | Jinja2 | Vue.js Web UI | JS web UI (ADS) | PHP Yii + AJAX | AngularJS + websockets | Vite/React (170x smaller bundle, a11y) |
| Routes         | **Panel API ~110 routes** (`server.go:806` public ~20 + protected ~90 handlers) + **Frontend 65 `path=`** (`router.tsx:604`) under `<Layout>` + `RouteThemeSync` + single flat `Sidebar.tsx:232` `adminSubItems` 16 items permission-aware `hasSidebarAccess` | flat JSON routes | — | — | — | OAuth2 API + Vue UI | ADS API + APIGEN SDK | API opt-in (`api_enabled`) | WS webui | same as Ptero |
| Build          | `rebuild.sh` `-trimpath -ldflags="-s -w"` `strip` `npm ci vite → backend/internal/ui/dist` embed `ui.FileSystem()` `writeBrandedIndex window.__KSPANEL_BOOTSTRAP__`, SHA256 `release/*.sha256`, `GARBLE_ENABLE`, `SIGN_KEY` cosign ( `docs/BUILD_SECURITY.md` 16 measures) | — | — | — | — | OS package / Docker | `getamp` / `ampinstmgr upgradeall` | `install.php` + `bin/multicraft` | `npm` + `service.js` | Docker / Vite (<7s cold build) |

## Scored Matrix (/100 per case)

| # | Case                                          | KS | JTG | Ptero | Pelican | Crafty | Puffer | AMP | Multi | MineOS | Pyro |
|---|-----------------------------------------------|----|----|-------|---------|--------|--------|-----|-------|--------|------|
| 1 | Multi-node & node ops                          | 93 | 30 | 95  | **98**  | 0 | 80 | 90 | 90 | 0 | 95 |
| 2 | Server lifecycle                               | 92 | 90 | **100** | **100** | 80 | 85 | 95 | 85 | 70 | **100** |
| 3 | Console / terminal                             | 92 | 85 | 95  | **98**  | 75 | 80 | 95 | 75 | 70 | 95 |
| 4 | File manager + editor                          | 90 | 65 | 75  | **95**  | 60 | 80 | 90 | 70 | 55 | 75 |
| 5 | Backups / snapshots                            | **96** | 35 | 95 | 85  | 70 | 50 | 90 | 75 | 80 | 95 |
| 6 | Metrics / monitoring                           | **88** | 30 | 70  | 85      | 70 | 55 | 85 | 60 | 60 | 70 |
| 7 | Ports / allocations                            | 92 | 15 | **95**  | **95**  | 15 | 70 | 85 | 70 | 10 | **95** |
| 8 | Secrets / environment variables                | **97** | 0  | 25  | 55      | 15 | 50 | 70 | 20 | 10 | 25 |
| 9 | Automation / scheduled tasks                   | 92 | 0  | 68  | **95**  | 75 | 70 | 90 | 80 | 65 | 68 |
| 10 | Audit / activity logging                      | **92** | 0  | 72  | 60      | 60 | 40 | 75 | 55 | 30 | 72 |
| 11 | Permission granularity                        | **96** | 15 | 60  | 65      | 55 | 55 | 70 | 65 | 15 | 60 |
| 12 | Auth hardening                                | 97 | 20 | 40  | **100** | 60 | 60 | 75 | 50 | 20 | 40 |
| 13 | Account lifecycle                             | **92** | 25 | 45 | 40     | 25 | 60 | 65 | 60 | 20 | 45 |
| 14 | Database support & management                 | **97** | 5  | 80  | 82      | 0  | 70 | 60 | 70 | 0 | 80 |
| 15 | Security posture                              | **94** | 10 | 60  | 85      | 30 | 60 | 80 | 55 | 25 | 65 |
| 16 | Panel & Edge self-update / reinstall          | **100** | 10 | 0   | 15      | 15 | 30 | 80 | 20 | 10 | 0 |
| 17 | Extensibility engine                          | **100** | 0 | 10 | 90      | 20 | 50 | 75 | 60 | 15 | 10 |
| 18 | Minecraft-specific tooling                    | 78 | 70 | 25 | 25   | 70 | 75 | **95** | 90 | 85 | 25 |
| 19 | SFTP access                                   | 85 | 15 | 85  | **90**  | 0  | 85 | 75 | 70 | 0 | 85 |
| 20 | Real-time architecture                        | **85** | 55 | **85**  | **85**      | 65 | 70 | 80 | 60 | 70 | **85** |
| 21 | Theming engine                                | **100** | 20 | 15 | 45     | 25 | 35 | 30 | 20 | 10 | 35 |
| 22 | Data-layer robustness                         | **96** | 10 | 90 | 92      | 35 | 65 | 70 | 60 | 20 | 90 |
| 23 | Tickets & notifications                       | **100** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 24 | AI assistant                                    | **100** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Total Score

| Rank     | Panel      | Sum          | Final /100 |
|----------|------------|--------------|------------|
| **1**    | **KS Panel**   | **2,230 / 2,400**| **93**     |
| 2        | AMP        | 1,720 / 2,400| 72     |
| 3        | Pelican    | 1,680 / 2,400| 70     |
| 4        | Pyrodactyl | 1,410 / 2,400| 59     |
| 5        | Pterodactyl| 1,385 / 2,400| 58     |
| 6        | PufferPanel| 1,375 / 2,400| 57     |
| 7        | Multicraft | 1,360 / 2,400| 57     |
| 8        | Crafty 4   | 920 / 2,400| 38     |
| 9        | MineOS     | 740 / 2,400| 31     |
| 10       | JTG Panel  | 605 / 2,400  | 25     |

## AMP in depth — why it ranks #2 (72/100) and where KS Panel wins

AMP = CubeCoders Application Management Panel (commercial, 10y+, McMyAdmin successor).
Stack: C#/.NET 8 + Kestrel (ADS). Install: `getamp` wizard + `ampinstmgr`
(create/start/stop/logs/upgrade/upgradeall). Base images: `cubecoders/ampbase`
(Debian Slim, `java/wine/xvfb/python3/node` tags). Runs on Windows + Linux,
host processes + Docker/Podman rootless (per-instance recommendation whether to
containerize). Data: SQLite / MySQL (`ampinstmgr`, file+DB). Public repo
(`CubeCoders/AMP`, ~245★) is issue-tracking + scripts/docs only — core is
closed-source. Version: 2.x → 3 beta.

Licensing (one-time lifetime licence, tiered by instance count, stackable;
Enterprise is a separate subscription): Standard ~5 / Professional ~15 /
Advanced 50 app instances. Licence counts configured game instances, not
machines; movable between systems. Try-before-buy (install unlicensed to check
compatibility). Monetising your own game servers is allowed and is not counted
as commercial use of AMP itself.

Architecture: ADS controller + targets. One ADS instance is the management
entry point; targets attach to the controller; each game/app is an instance
under a target. Multi-node works (case 1: 90) but has known rough edges
(e.g. controller → target → game-instance management path, open issue #472 —
workaround is managing instances directly from the controller).

Where AMP wins (honest — this is why it is the only panel above 70 besides KS):
- Minecraft-specific tooling (case 18: **95**, best in matrix): turn-key Java +
  Bedrock setups, one-click mod/plugin store (Modrinth, CurseForge, Hangar,
  Steam Workshop — AMP 2.7 'Deimos'), graphical settings editor (no hand-edit),
  complete state tracking (knows what happens *inside* the server, not just
  on/off).
- Automation (case 9: 90): scheduler runs on interval **and** on in-game events
  (join/leave/actions) — unique to AMP — plus webhooks, Stream Deck
  integration, Discord messages on first join, nightly backups.
- Breadth: dozens of supported games out of the box (Minecraft, Hytale,
  Palworld, Rust, ARK, Valheim, Terraria/tModLoader, GMod, Factorio, NodeJS /
  Python bots, …), community-addable; file manager (syntax-highlight editor) +
  web upload + integrated SFTP; analytics / play-time + geo-filtering
  (Advanced); OIDC SSO + custom branding (Advanced); themes/plugins/addons +
  API/plugin API (file manager and backups themselves ship as plugins).
- Ops maturity: lifecycle 95, console 95, file manager 90, backups 90,
  self-update 80 (`getamp update` + `ampinstmgr upgradeall`), security 80.

Where KS Panel wins vs AMP (matrix deltas, same scoring):
- No licence cap or fee: KS is self-hosted OSS, unlimited instances/nodes;
  AMP caps instances per tier and core is closed-source.
- Virtualization breadth: KS has 4 drivers (Docker, KVM/QEMU, LXD, Multipass);
  AMP has host + Docker/Podman only — no KVM/LXD/Multipass.
- Platform depth: secrets/env 97 vs 70, permissions 96 vs 70, audit 92 vs 75,
  auth hardening 97 vs 75, account lifecycle 92 vs 65, DB support 97 vs 60
  (KS: SQLite/PG/MySQL transparent + `datamove`; AMP: SQLite/MySQL file+DB),
  data robustness 96 vs 70, theming 100 vs 30, extensibility 100 vs 75,
  self-update/reinstall 100 vs 80, metrics 88 vs 85, ports 92 vs 85.
- Exclusive KS cases (AMP scores 0): tickets & notifications (23), AI
  assistant (24). AMP covers parts via webhooks/Discord but has no built-in
  ticket system or assistant.
- AMP's only outright win over KS is case 18 (Minecraft tooling 95 vs 78).
  Closest gaps: lifecycle 92 vs 95, console 92 vs 95, multi-node 93 vs 90,
  backups 96 vs 90, automation 92 vs 90 — all within 5 points.

Verdict: pick AMP if you want the fastest turn-key commercial game-server
panel (best Minecraft/modpack UX, event-driven scheduler, Windows support) and
accept per-instance licensing + closed core + host/Docker-only scope. Pick KS
Panel if you need unlimited multi-driver hosting (Docker/KVM/LXD/Multipass),
finer permissions/audit/secrets, transparent multi-DB, full self-update,
theming/extensibility, tickets/notifications, and AI assistance.

Sources: `cubecoders.com/AMP` (feature overview, scheduler/state-tracking,
mod store, ADS), `cubecoders.com/AMPTermsOfSale` (May 2026 — instance-based
tiers, stackable, movable), `CubeCoders/AMP` GitHub (`Scripts/getamp.sh`,
issue #472), `hub.docker.com/r/cubecoders/ampbase` (Debian Slim + tags).
