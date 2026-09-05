# KS Panel — DEBUGGING LOOP

Use this together with `loop.md`.

**Goal:** Find and fix every real bug through repeated multi-agent debugging. Never trust an agent's claim without real evidence.

## 1. MAIN LOOP

```text
MAP → SPAWN AGENTS → INVESTIGATE/FIX → VERIFY
→ MAIN AUDIT → FIND NEW BUGS → REPEAT
```

Repeat until a complete audit finds **no actionable defect**.

Never stop because "it looks fixed".

## 2. BEFORE EACH WAVE

```bash
git status
git log --oneline -5
git diff
```

Read the real project structure, entrypoints and existing `loop.md`.

Never guess filenames or edit duplicate/dead implementations.

## 3. SPAWN SPECIALIZED SUB-AGENTS

Create **many independent agents based on the real repository structure**. Do not use only generic Backend/Frontend agents. Every major system, mode, feature group, connection, and configuration surface should have its own specialist.

At minimum, inspect and create agents for:

```text
CORE / ARCHITECTURE
Backend
Frontend
Edge
API / IPC
State Management
Config / Environment
Persistence / Database
Authentication / Permissions

PANEL SYSTEM
Panel lifecycle
Panel positioning
Panel ↔ Edge connection
Panel ↔ Backend connection
Panel ↔ Frontend connection
Panel modes — inspect EVERY mode separately
Panel visibility / show-hide
Panel focus / blur
Panel resize
Panel drag / position persistence
Multi-monitor / DPI / resolution
Fullscreen / maximized-window behavior
Startup / restart / recovery
Keyboard / mouse interactions
Hotkeys / global events

UI SYSTEM
Layout
Components
Navigation
Dialogs / Modals
Notifications / Toasts
Forms / Validation
Loading / Error / Empty states
Responsive behavior
Accessibility

THEME SYSTEM
Theme engine
Theme switching
Light/Dark modes
Custom themes
Theme persistence
CSS variables / tokens
Colors / borders / shadows
Fonts / typography
Transitions / animations
Theme ↔ components consistency
Theme ↔ panel/edge consistency

TEMPLATE SYSTEM
Template loading
Template registry
Template selection
Template rendering
Template variables
Template validation
Template persistence
Template ↔ theme compatibility
Template ↔ panel compatibility
Missing / broken templates
Duplicate / stale templates

AI / AGENT SYSTEM
Model provider layer
GLM 5.2
MiniMax M3
Ox Alpha
Muse Spark 1.2
Muse Spark 1.3
Prompt construction
Response parsing
Retries / timeout / cancellation
Fallbacks
Concurrency
Agent orchestration
Sub-agent spawning
Tool calls
Loop execution
Loop state / recovery
Infinite-loop protection
Agent result validation

DATA / NETWORK
API contracts
WebSocket/SSE if used
HTTP requests
Error responses
Serialization
Caching
Persistence
Database
Migrations
File/storage operations

RELIABILITY
Concurrency / races
Memory leaks
CPU / performance
Resource cleanup
Timers / listeners
Background tasks
Long-running operation
Crash recovery
Repeated open/close/restart testing

SECURITY
Secrets
Authentication
Authorization
Input validation
Command execution
Filesystem boundaries
Network security
CORS/CSRF where applicable
Sensitive logging
Production configuration

QUALITY / RELEASE
Tests
Failure injection
Static analysis
Dependency audit
Build
Packaging
Release scripts
Startup/shutdown
Production configuration
Platform compatibility
Documentation/config consistency

FRESH-EYES
Independent architecture reviewer
Independent UI/panel reviewer
Independent security reviewer
Independent release reviewer

IMPORTANT:
Create additional agents whenever the real repository contains another major subsystem, mode, option group, connection, provider, or feature not listed above.

Do not force unrelated areas into one agent.

Each agent gets a narrow scope and must:

`INSPECT → REPRODUCE → FIND ROOT CAUSE → FIX → TEST → REPORT`

Agents may fix their own scope, but the MAIN AGENT must independently verify every important fix afterward.
```

### 3.1 REPO-SPECIFIC AGENTS (discovered from `panel/` + `edge/` — spawn these too)

Derived from real paths. Do not merge unrelated rows into one agent.

```text
EDGE DRIVERS (one agent per driver — never merge)
- Edge Docker driver      → edge/backend/internal/drivers/docker.go
- Edge LXD driver         → edge/backend/internal/drivers/lxd.go
- Edge KVM driver         → edge/backend/internal/drivers/kvm.go
- Edge Multipass driver   → edge/backend/internal/drivers/multipass.go
- Edge driver helpers     → edge/backend/internal/drivers/helpers.go, inspect_helpers.go

EDGE EXEC / LIFECYCLE
- Edge exec pipeline      → edge/backend/internal/exec/, execrpc/, execstage/, hostexec/
- Edge terminal / WSS     → panel/backend/internal/api/handlers/terminal_handler.go + wss_channel_handler.go + frontend shared/ui/Terminal.tsx
- Edge lifecycle          → edge/backend/internal/lifecycle/
- Edge install engine     → edge/backend/internal/install/engine.go, handler.go
- Edge page actions       → edge/backend/internal/pageaction/ + panel/backend/internal/pagelib/ + instance_page_* handlers
- Edge inspect            → edge/backend/internal/inspect/
- Edge files / SFTP       → edge/backend/internal/files/, sftp/ + panel files_handler.go, sftp_handler.go
- Edge ports              → edge/backend/internal/ports/ + instance_port_handler.go
- Edge snapshots          → edge/backend/internal/snapshot/
- Edge health/heartbeat/telemetry → edge/backend/internal/health/, heartbeat/, telemetry/
- Edge update/verify      → edge/backend/internal/update/ (update.go, verify.go, detach_*)
- Edge tunnel client      → edge/backend/internal/tunnel/client.go ↔ panel/backend/internal/tunnel/manager.go, handler.go
- Edge routing/client     → panel/backend/internal/edge/client.go, routing.go
- Edge config/CLI/version → edge/backend/internal/config/, cli/, version/

PANEL BACKEND DOMAINS (one agent per group)
- Auth/Session            → internal/auth/ (auth, session_manager/policy, mfa, cookie, lockout, password_policy/history) + auth_handler, me_handler, session_admin_handler
- OAuth                   → internal/oauth/ + oauth_handler.go
- Permissions/Roles/Keys  → internal/permissions/, api_key_handler.go, roles + frontend features/roles, api-keys
- Nodes / Rolling updates → node_handler, node_update_handler, node_rolling_update.go, scheduled_update_runs.go + frontend features/nodes
- Instances (core/advanced/backup/inspect/ports) → instance_handler, instance_advanced_handler, instance_backup_handler, instance_inspect_handler, instance_port_handler + frontend features/instances
- Instance pages          → instance_page_handler, instance_page_guard.go + internal/config/instance_pages.go + frontend features/instance-pages + instance_pages/pages/
- Applications            → application_handler, application_run.go + frontend features/applications
- Mods / ModEngine        → mod_handler, mod_samples.go + internal/modengine/ (engine, runtime, sandbox, eventbus, pkgstore, storage) + frontend features/mods
- Templates               → template_handler + cli/import_template, templates_builtin + frontend features/templates + TemplateForm* components
- Themes/Themelib         → theme_handler + internal/themelib/ + frontend features/themes + theme/*.ts + themes_market/
- Database/Migrations/Backup → internal/db/ (db.go, dialect.go, migrations/), backup/, datamove/, database_handler, database_backup_handler, database_verify_handler + frontend features/database
- Scheduler/Cron          → internal/cron/, scheduler/, backup_schedule_handler, update_window_handler
- Notifications hub       → notification_hub.go, notification_handler + frontend features/notifications (bell, broadcast, schedules, stats)
- Tickets/SLA             → ticket_handler, ticket_sla_handler, ticket_attachment_handler + frontend features/tickets
- Activity/Audit          → activity_handler + internal/models/activity.go + frontend features/activity
- System/Sysinfo/Sysproc  → system_handler, sysproc_*, internal/sysinfo/, probe/ + frontend features/system
- Update/UpdateWin        → update_handler, update_verify.go + internal/updatewin/
- DDoS/Security stack     → security_handler, ddos_script_handler, internal/security/ (state, ip_rate_limiter, persistent_rate_limiter, portswitch, ddoslistener) + frontend features/security (DDoS, Firewall, Sessions, Authentication, Authority)
- AI chat backend         → ai_chat_handler.go, ai_chat_extra.go + frontend features/ai-chat (api, store, ChatPanel/Fab/Settings)
- Settings/Users/Authority → settings_handler, profile_handler, authority_handler, authority_branding_handler, admin_handler + frontend features/settings, users, account, authority
- Config/Secretbox/Banner → internal/config/, secretbox/, banner/, version/
- API middleware surface  → server.go, router, middleware, csrf, validation_middleware, security_headers/middleware, rate_limiter

FRONTEND INFRA (do not fold into feature agents)
- Router/Auth guards      → app/router.tsx, App.tsx, RequireAuth, RequirePermission
- Layout/Sidebar/Header   → shared/components/layout/ (Layout, Sidebar, Header, ThemedBackground, RouteThemeSync, InstanceNavContext)
- Shared UI kit           → shared/components/ui/ (Modal, ConfirmDialog, ErrorBoundary, Card*, MetricsChart, Terminal, RichMenu, forms...)
- Shared API/stores       → shared/api/client.ts, shared/stores, shared/hooks, shared/lib, shared/utils
- Realtime layer          → wss_channel_handler ↔ frontend subscribers (notifications, terminal, stats)

OPS / RELEASE
- Rebuild/Retest harness  → rebuild.sh, retest.sh, release/, tools/, ddos-tester/
- Dist/embed + CLI ops    → internal/dist/, ui/embed.go, cli/launch, cli/stop, cli/seed, cli/create_user, cli/setup_localnode*
- Docs/config consistency → docs/, plan/, instance_pages/GUIDE.md, marketplace.json files, PROMPT.md, test.md
```

### 3.2 SPAWN RULES

```text
1. MAP FIRST: `ls panel/backend/internal/`, `ls edge/backend/internal/`,
   `ls panel/frontend/src/features/` — spawn from what EXISTS, not from memory.
2. ONE SUBSYSTEM = ONE AGENT. Never merge e.g. Docker driver + KVM driver,
   or Auth + OAuth + API keys, or Themes + Templates.
3. FILE OWNERSHIP: assign disjoint file sets per agent; shared contracts
   (API shapes, DB models in internal/models/) are READ-ONLY for all except
   the owning agent; MAIN AGENT resolves conflicts.
4. PANEL MODES: one agent per real mode found in router.tsx / instance_pages/pages/.
   No generic "panel modes" agent.
5. PROVIDERS: one agent per real AI provider found in code (GLM / MiniMax /
   Ox / Muse Spark 1.2 / 1.3). No generic "AI" agent.
```

Give each agent a narrow scope.

Agents may **inspect, reproduce, fix and test** their assigned problems.

Do not let multiple agents edit the same critical files simultaneously.

## 4. EACH AGENT MUST

```text
FIND → REPRODUCE → ROOT CAUSE → FIX → TEST
```

Check for:

* crashes/errors
* race conditions/deadlocks
* memory/resource leaks
* broken state/lifecycle
* bad API contracts
* edge/panel behavior
* model failures/timeouts/retries
* persistence bugs
* security issues
* performance problems
* duplicate/dead/conflicting code
* build/release failures

No:

```text
"probably fixed"
"looks good"
"should work"
```

Evidence only.

## 5. AGENT REPORT

```text
BUG:
ROOT CAUSE:
EVIDENCE:
FIX:
FILES:
TESTS:
EXIT CODES:
UNVERIFIED:
```

## 6. MAIN AGENT AUDIT

After all agents finish, the MAIN AGENT must independently:

```text
review every change
→ inspect git diff
→ trace affected flows
→ check frontend ↔ backend ↔ edge ↔ DB/API contracts
→ check agent fixes for regressions
→ run build/tests/typecheck/lint
→ run real runtime/panel checks
→ check AI/model/loop behavior
→ perform security + resource review
```

Assume every sub-agent can be wrong.

## 7. SECOND-ORDER CHECK

After fixing bugs, actively search for bugs **created by the fixes**:

```text
new race?
new duplicate request?
new state bug?
broken caller?
bad cancellation?
startup/restart failure?
model failure handling?
resource leak?
API mismatch?
```

## 8. FAILURE LOOP

Any failure:

```text
FAIL
 ↓
reproduce
 ↓
root cause
 ↓
fix
 ↓
FULL VERIFY
 ↓
START NEW DEBUG WAVE
```

Do not only rerun the failed test.

## 9. HARD PROBLEMS

If the same bug survives repeated attempts:

```text
STOP PATCHING
→ create fresh investigation agent
→ re-read actual code
→ reproduce from scratch
→ find the wrong assumption
→ redesign the fix
→ verify again
```

## 10. EXIT CONDITION

Stop only when:

```text
No known P0/P1 bugs
Build PASS
Tests PASS
Runtime PASS
Critical panel flows PASS
Backend/Frontend/Edge contracts PASS
AI/Loop PASS
Security PASS
Fresh-eyes audit PASS
Final diff reviewed
```

Otherwise start another wave.

**There is no fixed number of waves.**

```text
MAIN
 ↓
AGENTS
 ↓
FIX
 ↓
VERIFY
 ↓
MAIN AUDIT
 ↓
NEW BUG?
 ├─ YES → NEW WAVE
 └─ NO  → FINAL VERIFY
```

Final status must be:

`NO KNOWN ACTIONABLE DEFECTS FOUND IN VERIFIED SCOPE`

Never claim `BUG FREE`.
