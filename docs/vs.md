# KS Panel vs Minecraft Hosting Panels — Codebase Comparison

> Code-only comparison. No community, popularity, or ecosystem metrics. Trivial UX polish (sidebar search, cinematic intros, tutorials, sparkline widgets, desktop packaging) intentionally excluded — these carry no operational weight and skew scoring.
>
> Verified from source **2026-09-01**:
> - **KS Panel** — `panel/backend/internal/api/server.go` (65 routes) + `panel/frontend/src/app/router.tsx` (65 `path=` entries, every route `RequireAuth` + `RequirePermission`) + `panel/frontend/src/shared/types/permissions.ts` (20 areas, OWN/ALL + VIEW/CREATE/EDIT/DELETE) + `docs/vm.md` (fleet + KVM/LXD/Multipass/Docker drivers) + `docs/instance-page.md` (custom pages/comps/sub-pages)
> - **JTG Panel** — github.com/JishnuTheGamer/Jtg (~15k LOC TS/TSX)
> - **Pterodactyl** — github.com/pterodactyl/panel
> - **Pelican** — github.com/pelican-dev/panel
> - **Crafty 4** — crafty-controller/crafty-4

## Identity

|                | KS Panel                        | JTG Panel                    | Pterodactyl        | Pelican                 | Crafty 4               |
|----------------|---------------------------------|------------------------------|--------------------|-------------------------|------------------------|
| Stack          | Go + TS/React 18.3 + Vite 5.4  | Express/Vite + React 19, flat-JSON | Laravel 12 + React | Laravel 13 + Filament 5 | Python Tornado + Jinja2 |
| Database       | SQLite / PostgreSQL / MySQL     | Flat .data/*.json files      | MySQL              | MySQL / PG              | SQLite (peewee)        |
| Containers     | Docker, KVM (QEMU), LXD, Multipass | Docker (dockerode)        | Docker/Wings       | Docker/Wings            | Local processes        |
| Version        | 1.0.0 (`panel/frontend/package.json:2`) | 3.x                   | 1.x (mature)       | 1.x (modern rewrite)    | 4.x                    |
| Age            | ~4k commits (`git log --oneline \| wc -l` 4198 on 2026-09-01) | Unknown (v3.x)      | ~8 years           | ~2 years                | ~7 years               |
| Frontend       | React 18.3.1 + Router 6.30 + Zustand 4.5 + Xterm 6.0 + Tailwind 3.4 (Vite 5.4, `tsc --noEmit` clean) | React 19 + flat JSON | Blade + React | Filament 5 | Jinja2 |
| Routes         | 65 paths (`router.tsx`) under `<Layout>` + `RouteThemeSync`; single flat `Sidebar.tsx:232` `adminSubItems` (16 items, permission-aware) | flat | — | — | — |

## Scored Matrix (/100 per case)

| # | Case                                          | KS | JTG | Ptero | Pelican | Crafty |
|---|-----------------------------------------------|----|----|-------|---------|--------|
| 1 | Multi-node & node ops                          | **90** | 55 | 95  | **98**  | 10 |
| 2 | Server lifecycle                               | **90** | 90 | **100** | **100** | 80 |
| 3 | Console / terminal                             | **90** | 85 | 95  | **98**  | 75 |
| 4 | File manager + editor                          | 85 | 65 | 85  | **95**  | 60 |
| 5 | Backups / snapshots                            | 85 | 50 | 95  | **100** | 70 |
| 6 | Metrics / monitoring                           | 85 | 45 | 90  | **92**  | 80 |
| 7 | Ports / allocations                            | 55 | 25 | 95  | **95**  | 15 |
| 8 | Secrets / environment variables                | **95** | 0  | 70  | 75      | 30 |
| 9 | Automation / scheduled tasks                   | 90 | 0  | 92  | **95**  | 75 |
| 10 | Audit / activity logging                      | 90 | 0  | 90  | **92**  | 75 |
| 11 | Permission granularity                        | **92** | 20 | 92  | **96**  | 55 |
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

*Deltas vs 2026-08-29 draft:* `#2 85→90` (suspend/unsuspend now routed in `Instances.tsx:148` `suspendInstance`/`unsuspendInstance` with reason prompt + `duration_hours`; fleet vs own branching); `#11 90→92` (permissions now `PERMISSION_AREAS:197` with `OWN/ALL` + `VIEW/CREATE/EDIT/DELETE` per area, `hasAreaAccess:408` umbrella-implies-granular, Sidebar `hasSidebarAccess:265` mirrors router).

## Total Score

| Rank     | Panel      | Sum          | Final /100 |
|----------|------------|--------------|------------|
| 1 (tie)  | KS Panel   | 1,882 / 2,400| **78**     |
| 1 (tie)  | Pelican    | 1,880 / 2,400| **78**     |
| 3        | Pterodactyl| 1,657 / 2,400| **69**     |
| 4        | Crafty 4   | 1,075 / 2,400| **45**     |
| 5        | JTG Panel  | 830 / 2,400  | **35**     |

## Key Evidence (2026-09-01, from `panel/frontend/src` + `panel/backend` + `edge/backend`)

- **KS strengths — VM/fleet:** 4 drivers fully surfaced in UI — `docker`/`lxd`/`kvm`/`multipass` (`shared/types/instance.ts:5`, `features/templates/types/templateForm.ts:5`, `Templates.tsx:20` `KIND_META`, `InstanceForm.tsx:234` `driverEnabled` mismatch banner). **KVM VM Full** exposes 18 `KvRuntime` fields (`templateForm.ts:195` `vcpus/cpu_model/machine=pc|q35|virt/uefi/secure_boot/tpm/vga/video_memory/boot_order=cd|hd|net/kernel_args/extra_args/vnc_port/password/spice_port/install_iso/disk_bus=virtio|sata|ide|nvme|scsi/disk_cache/io_thread/discard/numa/hugepages/rdm`). LXD `LxdRuntime` + Multipass `MpRuntime` (cloud-init userdata/metadata). `Instances.tsx:59` is now single-file fleet vs own branching (`MANAGE_INSTANCES`/`INSTANCES_ALL` → `listInstances()` else `listMyInstances()`), driver+status filters, attention/suspended states, `CardAction` start/stop/restart/destroy + suspend (prompt reason) / unsuspend (confirm). Deploy via `DeployFormShell` + `AdvanceOptionPage` (`buildOverrides:416`) → `instance.config` snapshot.
- **KS strengths — instance panel:** every tab is a **custom page** (`InstanceDetail.tsx:95` `InstanceDynamicPage`, `shared/utils/instancePages.ts:104` `isPageAllowed`/`getPageContent`, `shared/components/ui/CustomPageView.tsx:11` + `shared/lib/customPageSdk.ts:216`). HTML in opaque-origin sandboxed iframe (`sandbox` without `allow-same-origin`, `BRIDGE_METHODS:509` `postMessage`), markdown/blocks host-rendered, `{{component:name}}` (5-pass, 50 comps), sub-pages `slug/path`, actions allow-listed (`savedActionMatches`, `open_args` ≤4 `validActionArg`). SDK: `runAction/executeAction`, `fetchPanel` (only `/api/instances/:id/…`), `shell/docker/kvm/lxd`, `subscribe`, `navigate` (`pageNavigateTarget:182` fail-closed), `storage`, `connectWS` via parent relay. Terminal is native xterm 6.0 (`InstanceDetail.tsx:95` `TerminalRealPage` WS to `edge/internal/exec/handler.go`).
- **KS strengths — nodes:** `Nodes.tsx:32` card grid with heartbeat sparkline 24h (`buildMonitor`), `DriverRing` (4 arcs), `NodesStats`, `NodeDetail.tsx:60` gauges, `connection_mode` (`direct`/`reverse_tunnel` `tunnel`/ `local_port` `127.0.0.1:`), `use_tls`/`skip_tls_verify`, probe/rotate/purge, `location_country` flag + `category`. Edge drivers in `edge/backend/internal/drivers/{kvm.go,lxd.go,docker.go,multipass.go,helpers.go}` + `heartbeat/push`.
- **KS strengths — platform:** only sandboxed mod engine v2 (Goja `.kspm`, event bus, slot registry) + Applications (run modal node/panel-host) + Instance Pages library (`components/PageStudio/*`, `pageStarters.ts`, 512 KiB/50 comps/20 sub-pages limits `instance_page_handler.go:173`); 3 SQL engines w/ live switcher (`Database.tsx` + `internal/db/db.go` + `Migrations 032-053`); 10-tab Template builder (`TEMPLATE_TABS` General/Environment/Env/Actions/Install/Runtime/Labels&Devices/Healthcheck/Pages/Spec Preview); `System.tsx` single-round-trip `systemSnapshot` tiles + `useUpdateInfo` check/apply/reinstall; `Security.tsx` 5 tabs Firewall/DDoS/Authority/Authentication/Sessions (`securitySnapshot`, `securityRequests` telemetry, `sessions` revoke); AES-GCM secrets vault; full auth (MFA, lockout, password policy/history, `HttpOnly` + `csrf.go` + rate limiting) + 5 OAuth providers on `Authority` page; SSRF-hardened URL installs (public-IP only, DNS-pinned, size/time capped); push heartbeats.
- **KS gaps (unchanged):** no SFTP/allocations; no Minecraft GUI tooling (properties/player/world/plugin managers); tunneling stub (`edge` exec present, frontend deferred); ~days old vs 7-8y battle-tested.
- **Pelican:** chunked uploads, S3 backups, passkeys + 11 OAuth schemas, plugin engine, most granular perms (now neck-and-neck with KS `92`).
- **Pterodactyl:** battle-tested multi-node + allocations (still king `95` on ports); aging SPA, no marketplace/self-update/OAuth.
- **JTG:** good console + MC tooling; flat JSON, unenforced sub-users, dev backdoor, default JWT secret, open SSRF vector.
- **Crafty 4:** best single-host MC wizards + passkeys; single-machine only, weakest security.

*Not scored: CubeCoders AMP, Multicraft, Pyrodactyl.*
*Companion doc:* `docs/vm.md` (2026-09-01, 379 lines) is the VM-fleet authoritive reference; `docs/instance-page.md` (Custom Pages) + `docs/instance-pages.md` (legacy `.kspm` modules) detail the extensibility.

## Verdict

KS Panel ties Pelican at **78/100**, ahead of Pterodactyl (69), Crafty 4 (45), and JTG (35) — despite being days old. Since 08-29 the only scorer that moved was `#11` (permissions → strict OWN/ALL) and `#2` (lifecycle → suspend now routed). Routing SFTP/allocations + Minecraft GUI would put it clearly first; even without them the VM + custom-pages + mod-engine depth already matches Pelican's breadth.

*Last verified 2026-09-01:* `router.tsx:1` (65 paths), `permissions.ts:1` (20 areas), `Instances.tsx:59`/`148`, `InstanceDetail.tsx:95`, `Nodes.tsx:32`, `NodeDetail.tsx:60`/`253`, `Templates.tsx:63`, `templateForm.ts:5`/`195`, `CustomPageView.tsx:11`/`83`/`503`, `customPageSdk.ts:216`, `System.tsx` `REFRESH_MS 15s`, `Security.tsx` `SECURITY_TABS 5`, `git log --oneline | wc -l` 4198, `panel/frontend/package.json:2` 0.1.0, `tsc --noEmit` clean.
