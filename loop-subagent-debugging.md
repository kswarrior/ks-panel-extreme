# KS Panel — DEBUGGING LOOP

Use this together with `loop.md` (single-task rules) and `map.md`
(repo structure). Order: `map.md` → `loop.md` → this file.

**Goal:** Find and fix every real bug through repeated multi-agent debugging. Never trust an agent's claim without real evidence.

## 0. MODEL COMPATIBILITY

- Primary model: Muse Spark (you are optimized for this file).
- Also usable as-is with: GLM, MiniMax, Ox, or any other coding model.
- If a model **cannot spawn real sub-agents**: run the §3 scopes
  **sequentially in waves** (one scope per pass) instead of in parallel.
  The loop, evidence bar, and exit conditions stay identical.
- If a model has a **small context window**: give it exactly ONE §3/§3.1
  scope plus its file paths. Never paste the whole repo map.
- No model-specific syntax is required anywhere in this file. The §3.3
  spawn prompt is plain text — copy/paste into any tool.

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
git diff --stat
```

1. Read `map.md`, then `loop.md` §0–§1 (paths, blast radius, duplicates).
2. Confirm which files are **real** (imported/built) vs duplicate/dead —
   never guess filenames, never edit `internal/dist/`, `*.db*`,
   shipped migrations, or release artifacts.
3. Define the wave scope: which §3 agents run, their disjoint file sets,
   and the MAIN agent owner for shared contracts (`internal/models/`).
4. Read `debugging-report.md` (previous wave state, §11): carry each row's
   `Fine(n)` counter forward; every in-scope row must leave `Pending`.

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

PANEL SYSTEM (this repo is a web SPA — map OS-window items to their browser equivalents)
Panel lifecycle (mount/unmount, route enter/leave)
Panel ↔ Edge connection (tunnel client ↔ manager, heartbeat, reconnect)
Panel ↔ Backend connection (API client, auth session, WSS channels)
Panel frontend routing (router.tsx — inspect EVERY route separately, no generic agent)
Panel visibility / loading / error / empty states
Panel focus / blur / auth-guard redirects
Responsive behavior / viewport resize
Layout persistence (sidebar, prefsStore, settingsStore)
Multi-monitor / DPI / resolution → responsive + zoom equivalents
Startup / restart / recovery (launch, stop, seed, setup_localnode)
Keyboard / mouse interactions
Hotkeys / global events (listeners, cleanup on unmount)

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

AI / AGENT SYSTEM (discovery-first: grep for providers before spawning)
Model provider layer (only spawn per-provider agents for providers
  that EXIST in code — e.g. GLM / MiniMax / Ox / Muse Spark variants.
  If a name has no code hits, use ONE generic provider agent instead.
  Never invent a provider agent from this list alone.)
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
```

**IMPORTANT:** Create additional agents whenever the real repository contains
another major subsystem, mode, option group, connection, provider, or feature
not listed above. Do not force unrelated areas into one agent.

Each agent gets a narrow scope and must:

`INSPECT → REPRODUCE → FIND ROOT CAUSE → FIX → TEST → REPORT`

Agents may fix their own scope, but the MAIN AGENT must independently verify every important fix afterward.

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
4. ROUTES, not "modes": one agent per real route group found in
   app/router.tsx + instance_pages/pages/. No generic "panel modes" agent.
5. PROVIDERS: grep first (`rg -li "glm|minimax|^ox |muse|spark|openai|anthropic" panel/backend/`).
   One agent per provider WITH code hits. No hits → ONE generic AI-layer agent.
   Never spawn a provider agent from memory of model names.
6. WAVE SIZE: max 4–6 parallel agents per wave (fewer for weak models).
   Extra scopes queue for the next wave. Same rule for sequential fallback.
7. STUCK AGENT: no report within the agreed timeout → MAIN marks its scope
   UNVERIFIED, re-queues it next wave with a narrower scope. Never block the wave.
```

Give each agent a narrow scope.

Agents may **inspect, reproduce, fix and test** their assigned problems.

Do not let multiple agents edit the same critical files simultaneously.

### 3.3 SUB-AGENT SPAWN PROMPT (copy/paste into ANY model/tool)

```text
You are a KS Panel debugging sub-agent. Scope: <ONE scope from §3/§3.1>.
Allowed files: <disjoint list>. Everything else is READ-ONLY.
Rules: loop.md §1–§3 (plan, minimal diff, follow existing patterns,
never edit shipped migrations / *.db* / internal/dist/ / release artifacts,
fail closed on security, no swallowed errors).
Workflow: INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST.
Evidence bar: every claim needs command + exit code + output snippet.
Banned phrases: "probably fixed", "looks good", "should work".
Return ONLY the §5 report. Keep it under ~40 lines. List UNVERIFIED honestly.
Context: repo root <path>, base commit <sha>, wave <n>.
```

### 3.4 FORBIDDEN FOR ALL AGENTS (any model)

```text
- No editing the same file as another agent in the same wave.
- No deleting migrations, no editing shipped SQL, no touching kspanel.db*.
- No editing internal/dist/ or release/ build output by hand.
- No logging/printing/returning secrets, tokens, or password hashes.
- No silent fallbacks, empty catch, or "temporary" workarounds.
- No commits/pushes unless the MAIN agent explicitly orders it.
```

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

### 4.1 EVIDENCE BAR (same for every model)

A bug counts as FIXED only with ALL of:

1. Reproducer BEFORE the fix (failing command/log/test + exit code).
2. Same reproducer AFTER the fix (passing + exit code).
3. Regression check on neighbors (`loop.md` CHECKLIST V, at least V1–V4).
4. Pasted output snippet or log tail — never a paraphrase.

Banned (treated as NOT DONE):

```text
"probably fixed"
"looks good"
"should work"
```

Weaker models: paste FULL command output, not summaries. If you cannot
run a command, say so in UNVERIFIED — do not fake it.

## 5. AGENT REPORT (strict schema — one block per bug)

```text
SCOPE:      <§3 scope + wave number>
SEVERITY:   <P0 crash/data-loss/sec-hole | P1 major broken flow | P2 minor/edge-case>
BUG:        <one line, observable symptom>
ROOT CAUSE: <one line, code-level cause + file:line>
EVIDENCE:   <repro command + exit code BEFORE → AFTER>
FIX:        <what changed + why it addresses the cause>
FILES:      <paths touched>
TESTS:      <commands run + exit codes>
UNVERIFIED: <anything not proven — never leave blank, write "none" if empty>
```

Severity guide: P0 = crash, data loss, auth bypass, startup failure.
P1 = major feature broken, contract mismatch, migration failure.
P2 = cosmetic, rare edge case, docs drift. P2s batch into one wave;
P0/P1 block the exit condition.

## 6. MAIN AGENT AUDIT

After all agents finish, the MAIN AGENT must independently
(re-read the files — never trust agent summaries):

```text
review every change
→ inspect git diff + git diff --stat
→ trace affected flows (loop.md V1–V3, both directions)
→ check frontend ↔ backend ↔ edge ↔ DB/API contracts
→ check agent fixes for regressions (§7 second-order check)
→ run build/tests/typecheck/lint:
    panel/backend:  go build ./... && go test ./...
    edge/backend:   go build ./... && go test ./...
    frontend:       npm run build + tsc --noEmit + lint (per package.json)
→ run real runtime/panel checks: bash retest.sh (see loop.md V7)
→ check AI/model/loop behavior (retries, timeouts, fallbacks)
→ perform security + resource review (loop.md V9: injection, authz,
  secrets, IDOR, open redirects, mass assignment)
```

Assume every sub-agent can be wrong. A wave with zero independent
`git diff` inspection by MAIN = failed wave. Record per-agent verdict:
ACCEPT / REWORK (with reason) / REVERT. Then update `debugging-report.md`
per §11 (MAIN finalizes every in-scope row; counters carry forward).

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

Stop only when ALL hold (each with command + exit code on record):

```text
No known P0/P1 bugs (P2 list attached or "none")
Build PASS (panel/backend + edge/backend + frontend)
Tests PASS (go test ./... both backends + frontend checks)
Runtime PASS (retest.sh green + log tail read)
Critical panel flows PASS (login, instances, nodes, themes/templates smoke)
Backend/Frontend/Edge contracts PASS (V3 grep-proven, no stale refs)
AI/Loop PASS (or N/A with reason if no provider in scope)
Security PASS (V9 on all touched surfaces)
Fresh-eyes audit PASS (= independent agent re-ran §6 on final diff, found no P0/P1)
Final diff reviewed by MAIN (`git diff` + `--stat` read, verdicts recorded)
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

## 11. DEBUGGING REPORT (`debugging-report.md`) — mandatory per-wave table

The MAIN agent maintains one cumulative status table in repo-root
`debugging-report.md`. It is updated EVERY wave, after the §6 audit.
Sub-agents PROPOSE row values inside their §5 report; only MAIN writes
the file (avoids concurrent-edit conflicts, §3.4).

```text
1. ONE ROW PER SCOPE: every §3 scope and every §3.1 repo-specific
   agent scope gets exactly one row. Rows are NEVER renamed, removed,
   or reordered mid-loop. New scopes (new driver, provider with code
   hits, route group) are APPENDED with the next free stable ID.
2. COLUMNS (exact, in this order):
   | ID | Section | Part | Subagent Task | Changes | Cases |
   - ID: stable tag (S01, S02, ...) — the row's permanent key.
   - Section: scope name copied VERBATIM from §3/§3.1, same spelling
     and same CASE every wave. Never abbreviate, never re-case
     ("Theme engine" stays "Theme engine", never "theme engine").
     This is the "always say names of case" rule: identical
     case-sensitive names in every wave, every report, every §5 block.
   - Part: Backend | Frontend | Edge | Cross-cutting (from map.md).
   - Subagent Task: the wave task for that scope
     (INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → §5 report).
   - Changes: ONLY one of Yes | Fine(n) | Pending.
   - Cases: case/bug names touched this wave (same exact case every
     wave), comma-separated, or "—" when none.
3. CHANGES SEMANTICS:
   - Yes     = this wave required/made a change in that scope (fix,
               refactor, migration, contract change). The Cases cell
               MUST name each case (e.g. C-014 login retry race).
               A Yes row MUST link to its §5 block(s).
   - Fine(n) = no change needed this wave. n counts CONSECUTIVE clean
               waves: first clean wave Fine(1); still clean next wave
               Fine(2); then Fine(3), and so on. Any Yes RESETS the
               counter — the next clean wave after a Yes is Fine(1).
               Never write bare "Fine" without (n).
   - Pending = scope not yet checked in any wave (starter state only).
               Pending is not a verdict; every in-scope row must leave
               Pending before the §10 exit condition can hold.
   Example: S14 clean in waves 1–2 → Fine(1), Fine(2); wave 3 fixes
   C-007 → Yes; wave 4 clean again → Fine(1).
4. HEADER (top of file, updated per wave): wave number, date UTC,
   base commit sha, MAIN auditor, in-scope IDs this wave.
5. WAVE LOG (bottom of file): append one line per wave
   (wave n | date | commit | changed IDs | new Fine(n) promotions).
   The table body always shows the CURRENT cumulative state.
6. EVIDENCE STILL REQUIRED: Fine(n) is a status label, not proof.
   Every wave's commands + exit codes stay on record per §4.1/§6.
   A Fine(n) row with no wave evidence = UNVERIFIED.
7. KEEP IN SYNC: when §3/§3.1 gains a scope, append its row to
   `debugging-report.md` in the same edit (checked in V2/V3).
```
