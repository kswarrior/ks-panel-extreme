# KS Panel — Debugging Report (cumulative per-wave table)

Maintained by the MAIN agent every debugging wave, after the §6 audit
(see `loop-subagent-debugging.md` §11). Sub-agents PROPOSE row values in
their §5 report; only MAIN writes this file.

- Wave: 0 (baseline — scopes listed, no wave run yet)
- Date (UTC): 2026-09-06
- Base commit: 6e7338df
- MAIN auditor: —
- In-scope IDs this wave: —

Legend — `Changes` allows ONLY: `Yes` (change needed/made this wave,
Cases cell MUST name each case) | `Fine(n)` (no change needed; n counts
CONSECUTIVE clean waves: first clean wave `Fine(1)`, next still-clean
wave `Fine(2)`, and so on; any `Yes` resets the counter so the next
clean wave is `Fine(1)` again; never bare `Fine`) | `Pending` (not yet
checked — starter state, not a verdict). `Section` names are VERBATIM
from `loop-subagent-debugging.md` §3/§3.1 — same spelling, same CASE,
every wave. `Cases` lists case/bug names (same exact case) or `—`.

| ID | Section | Part | Subagent Task | Changes | Cases |
|----|---------|------|---------------|---------|-------|
| S01 | Backend | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S02 | Frontend | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S03 | Edge | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S04 | API / IPC | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S05 | State Management | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S06 | Config / Environment | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S07 | Persistence / Database | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S08 | Authentication / Permissions | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S09 | Panel lifecycle (mount/unmount, route enter/leave) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S10 | Panel ↔ Edge connection (tunnel client ↔ manager, heartbeat, reconnect) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S11 | Panel ↔ Backend connection (API client, auth session, WSS channels) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S12 | Panel frontend routing (router.tsx — inspect EVERY route separately, no generic agent) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S13 | Panel visibility / loading / error / empty states | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S14 | Panel focus / blur / auth-guard redirects | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S15 | Responsive behavior / viewport resize | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S16 | Layout persistence (sidebar, prefsStore, settingsStore) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S17 | Multi-monitor / DPI / resolution → responsive + zoom equivalents | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S18 | Startup / restart / recovery (launch, stop, seed, setup_localnode) | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S19 | Keyboard / mouse interactions | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S20 | Hotkeys / global events (listeners, cleanup on unmount) | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S21 | Layout | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S22 | Components | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S23 | Navigation | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S24 | Dialogs / Modals | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S25 | Notifications / Toasts | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S26 | Forms / Validation | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S27 | Loading / Error / Empty states | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S28 | Responsive behavior | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S29 | Accessibility | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S30 | Theme engine | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S31 | Theme switching | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S32 | Light/Dark modes | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S33 | Custom themes | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S34 | Theme persistence | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S35 | CSS variables / tokens | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S36 | Colors / borders / shadows | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S37 | Fonts / typography | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S38 | Transitions / animations | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S39 | Theme ↔ components consistency | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S40 | Theme ↔ panel/edge consistency | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S41 | Template loading | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S42 | Template registry | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S43 | Template selection | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S44 | Template rendering | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S45 | Template variables | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S46 | Template validation | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S47 | Template persistence | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S48 | Template ↔ theme compatibility | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S49 | Template ↔ panel compatibility | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S50 | Missing / broken templates | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S51 | Duplicate / stale templates | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S52 | Model provider layer (only per-provider agents for providers that EXIST in code; otherwise ONE generic provider agent) | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S53 | Prompt construction | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S54 | Response parsing | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S55 | Retries / timeout / cancellation | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S56 | Fallbacks | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S57 | Concurrency | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S58 | Agent orchestration | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S59 | Sub-agent spawning | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S60 | Tool calls | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S61 | Loop execution | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S62 | Loop state / recovery | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S63 | Infinite-loop protection | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S64 | Agent result validation | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S65 | API contracts | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S66 | WebSocket/SSE if used | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S67 | HTTP requests | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S68 | Error responses | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S69 | Serialization | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S70 | Caching | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S71 | Persistence | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S72 | Database | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S73 | Migrations | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S74 | File/storage operations | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S75 | Concurrency / races | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S76 | Memory leaks | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S77 | CPU / performance | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S78 | Resource cleanup | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S79 | Timers / listeners | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S80 | Background tasks | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S81 | Long-running operation | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S82 | Crash recovery | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S83 | Repeated open/close/restart testing | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S84 | Secrets | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S85 | Authentication | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S86 | Authorization | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S87 | Input validation | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S88 | Command execution | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S89 | Filesystem boundaries | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S90 | Network security | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S91 | CORS/CSRF where applicable | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S92 | Sensitive logging | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S93 | Production configuration | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S94 | Tests | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S95 | Failure injection | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S96 | Static analysis | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S97 | Dependency audit | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S98 | Build | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S99 | Packaging | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S100 | Release scripts | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S101 | Startup/shutdown | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S102 | Production configuration | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S103 | Platform compatibility | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S104 | Documentation/config consistency | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S105 | Independent architecture reviewer | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S106 | Independent UI/panel reviewer | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S107 | Independent security reviewer | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S108 | Independent release reviewer | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S109 | Edge Docker driver | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S110 | Edge LXD driver | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S111 | Edge KVM driver | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S112 | Edge Multipass driver | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S113 | Edge driver helpers | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S114 | Edge exec pipeline | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S115 | Edge terminal / WSS | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S116 | Edge lifecycle | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S117 | Edge install engine | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S118 | Edge page actions | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S119 | Edge inspect | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S120 | Edge files / SFTP | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S121 | Edge ports | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S122 | Edge snapshots | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S123 | Edge health/heartbeat/telemetry | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S124 | Edge update/verify | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S125 | Edge tunnel client | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S126 | Edge routing/client | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S127 | Edge config/CLI/version | Edge | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S128 | Auth/Session | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S129 | OAuth | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S130 | Permissions/Roles/Keys | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S131 | Nodes / Rolling updates | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S132 | Instances (core/advanced/backup/inspect/ports) | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S133 | Instance pages | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S134 | Applications | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S135 | Mods / ModEngine | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S136 | Templates | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S137 | Themes/Themelib | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S138 | Database/Migrations/Backup | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S139 | Scheduler/Cron | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S140 | Notifications hub | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S141 | Tickets/SLA | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S142 | Activity/Audit | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S143 | System/Sysinfo/Sysproc | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S144 | Update/UpdateWin | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S145 | DDoS/Security stack | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S146 | AI chat backend | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S147 | Settings/Users/Authority | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S148 | Config/Secretbox/Banner | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S149 | API middleware surface | Backend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S150 | Router/Auth guards | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S151 | Layout/Sidebar/Header | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S152 | Shared UI kit | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S153 | Shared API/stores | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S154 | Realtime layer | Frontend | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S155 | Rebuild/Retest harness | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S156 | Dist/embed + CLI ops | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |
| S157 | Docs/config consistency | Cross-cutting | INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report | Pending | — |

## Wave log

| Wave | Date (UTC) | Base commit | Changed IDs (Yes) | Notes |
|------|------------|-------------|-------------------|-------|
| 0 | 2026-09-06 | 6e7338df | — | Baseline: all 157 scopes listed as Pending; no wave run yet. |
