# KS Panel vs Minecraft Hosting Panels — Codebase Comparison

> Code-only comparison. No community, popularity, or ecosystem metrics. Trivial UX polish (sidebar search, cinematic intros, tutorials, sparkline widgets, desktop packaging) intentionally excluded — these carry no operational weight and skew scoring.
>
> Verified from source:
> - **KS Panel** — panel/backend/internal/api/server.go (56 endpoints / 16 route groups) + router.tsx (55 paths)
> - **JTG Panel** — github.com/JishnuTheGamer/Jtg (~15k LOC TS/TSX)
> - **Pterodactyl** — github.com/pterodactyl/panel
> - **Pelican** — github.com/pelican-dev/panel
> - **Crafty 4** — crafty-controller/crafty-4

## Identity

|                | KS Panel                        | JTG Panel                    | Pterodactyl        | Pelican                 | Crafty 4               |
|----------------|---------------------------------|------------------------------|--------------------|-------------------------|------------------------|
| Stack          | Go + TS/React                   | Express/Vite + React 19, flat-JSON | Laravel 12 + React | Laravel 13 + Filament 5 | Python Tornado + Jinja2 |
| Database       | SQLite / PostgreSQL / MySQL     | Flat .data/*.json files      | MySQL              | MySQL / PG              | SQLite (peewee)        |
| Containers     | Docker, KVM, LXD, Multipass     | Docker (dockerode)           | Docker/Wings       | Docker/Wings            | Local processes        |
| Version        | 1.0.0                           | 3.x                          | 1.x (mature)       | 1.x (modern rewrite)    | 4.x                    |
| Age            | ~3 days git, 183 commits        | Unknown (v3.x)               | ~8 years           | ~2 years                | ~7 years               |

## Scored Matrix (/100 per case)

| # | Case                                          | KS | JTG | Ptero | Pelican | Crafty |
|---|-----------------------------------------------|----|----|-------|---------|--------|
| 1 | Multi-node & node ops                          | **90** | 55 | 95  | **98**  | 10 |
| 2 | Server lifecycle                               | 85 | 90 | **100** | **100** | 80 |
| 3 | Console / terminal                             | 90 | 85 | 95  | **98**  | 75 |
| 4 | File manager + editor                          | 85 | 65 | 85  | **95**  | 60 |
| 5 | Backups / snapshots                            | 85 | 50 | 95  | **100** | 70 |
| 6 | Metrics / monitoring                           | 85 | 45 | 90  | **92**  | 80 |
| 7 | Ports / allocations                            | 55 | 25 | 95  | **95**  | 15 |
| 8 | Secrets / environment variables                | **95** | 0  | 70  | 75      | 30 |
| 9 | Automation / scheduled tasks                   | 90 | 0  | 92  | **95**  | 75 |
| 10 | Audit / activity logging                      | 90 | 0  | 90  | **92**  | 75 |
| 11 | Permission granularity                        | 90 | 20 | 92  | **96**  | 55 |
| 12 | Auth hardening                                | 95 | 25 | 65  | **100** | 60 |
| 13 | Account lifecycle                             | **90** | 35 | 30 | 40     | 25 |
| 14 | Database support & management                 | **95** | 5  | 80  | 82      | 0  |
| 15 | Security posture                              | **92** | 15 | 60  | 85      | 30 |
| 16 | Panel self-update / reinstall                 | **90** | 10 | 0   | 15      | 15 |
| 17 | Extensibility engine                          | **100** | 0 | 10 | 90      | 20 |
| 18 | Minecraft-specific tooling                    | 40 | **80** | 25 | 25   | 70 |
| 19 | Tunneling (playit.gg)                         | 30 | **90** | 0  | 0    | 0  |
| 20 | SFTP access                                   | 0  | 15 | 85  | **90**  | 0  |
| 21 | Real-time architecture                        | 80 | 55 | 85  | 85      | 65 |
| 22 | Theming engine                                | **95** | 20 | 30 | 45     | 40 |
| 23 | Data-layer robustness                         | **95** | 10 | 90 | 92      | 55 |
| 24 | Codebase maturity / battle-testing            | 30 | 35 | **98** | 95   | 70 |

## Total Score

| Rank     | Panel      | Sum          | Final /100 |
|----------|------------|--------------|------------|
| 1 (tie)  | KS Panel   | 1,872 / 2,400| **78**     |
| 1 (tie)  | Pelican    | 1,880 / 2,400| **78**     |
| 3        | Pterodactyl| 1,657 / 2,400| **69**     |
| 4        | Crafty 4   | 1,075 / 2,400| **45**     |
| 5        | JTG Panel  | 830 / 2,400  | **35**     |

## Key Evidence
- KS strengths: only sandboxed mod engine + apps + .kspm pages; 3 SQL engines w/ live switcher; AES-GCM secrets vault; full auth stack + 5 OAuth providers; SSRF-hardened fetches; working self-update; push heartbeats.
- KS gaps: KS Smart not yet in code; suspend unrouted; no SFTP/allocations/MC GUI tooling; ~3 days old.
- Pelican: chunked uploads, S3 backups, passkeys + 11 OAuth schemas, plugin engine, most granular perms.
- Pterodactyl: battle-tested multi-node + allocations; aging SPA, no marketplace/self-update/OAuth.
- JTG: good console + MC tooling; flat JSON, unenforced sub-users, dev backdoor, default JWT secret, open SSRF vector.
- Crafty 4: best single-host MC wizards + passkeys; single-machine only, weakest security.

*Not scored: CubeCoders AMP, Multicraft, Pyrodactyl.*

## Verdict
KS Panel ties Pelican at 78/100, ahead of Pterodactyl (69), Crafty 4 (45), and JTG (35) — despite being days old. Routing suspend, shipping KS Smart, adding SFTP and MC GUI tooling would put it clearly in first place.
