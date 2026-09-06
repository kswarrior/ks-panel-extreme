# KS Panel — Debugging Report (loop-subagent-debugging.md execution)

- Date (UTC): 2026-09-06
- Repo root: `/home/runner/work/ks-panel-extreme/ks-panel-extreme`
- Base commit (Wave 1 start): `5ce63bf4` | Final HEAD at report time: `17d883de` (auto-sync commits)
- Method: `map.md` → `loop.md` → `loop-subagent-debugging.md`, 4 waves, 14 sub-agent runs total
- Final status: **NO KNOWN ACTIONABLE DEFECTS FOUND IN VERIFIED SCOPE** (never "bug free" — see §7 gaps)

## Wave summary

| Wave | Agents | Result |
|------|--------|--------|
| 1 — auth/security, persistence, edge drivers+exec, frontend router/api, ops/release | 5 | 4 ACCEPT, 1 partial (2 regressions fixed by main: `db.go` gofmt, dead code in `Register.tsx`) |
| 2 — CLI rework, AI/mods/pages, domain contracts, persistence follow-up, fresh-eyes on W1 diff | 5 | 3 ACCEPT (CLI, contracts, persistence); AI/mods PAGES fixes never landed → REWORK; fresh-eyes items triaged |
| 3 — module-action allowlist + bulk owner, AI fallback + stream, hardening bundle | 3 | 3 ACCEPT, all hunks independently verified by main |
| 4 — fresh-eyes final audit of W2+W3 diff | 1 | 1 P1 found (ticket Update placeholders) → fixed by main + regression test → PASS 1 restarted |

## Bugs fixed (strict schema, one block per bug)

### W1-A1 — P1 — device cookie never stuck on localhost/self-registration limit bypassed
- ROOT CAUSE: `setDeviceCookie` set `Secure` only on TLS/XFP=https, but the `__Host-` prefix (RFC 6265bis) requires `Secure` — browsers discarded it even on trustworthy localhost.
- EVIDENCE: `grep -n Secure auth_register_handler.go` exit 0 → now unconditional `Secure: true` (:435).
- FIX: always `Secure:true` (mirrors session cookie).
- FILES: `panel/backend/internal/api/handlers/auth_register_handler.go`
- TESTS: `go vet` exit 0. UNVERIFIED: live LAN-browser behavior (see §7 P2 note).

### W1-A2 — P2 — ChangePassword leaked policy/reuse oracle before ownership proof
- ROOT CAUSE: `CheckPassword(old)` ran after `ValidatePasswordWithHistory` (bcrypt burns + oracle).
- FIX: ownership proof moved first (W3 completed it: length check also moved below `CheckPassword`, now :93 before :100).
- FILES: `panel/backend/internal/api/handlers/me_handler.go`. TESTS: `go vet` exit 0, build exit 0. UNVERIFIED: live DB round-trip.

### W1-A3 — P2 (latent) — lockout/MFA middlewares drained `r.Body` (downstream EOF)
- ROOT CAUSE: `json.NewDecoder(r.Body).Decode` consumed the body. Main proved NEITHER middleware is instantiated anywhere in production (`grep -rn ...Middleware(` → no hits outside defs).
- FIX (W1): restore via `NopCloser(bytes.NewReader(body))`. FIX (W3 hardening): `MaxBytesReader(1<<20)` + `LimitReader` + unconditional restore incl. `GetBody`.
- FILES: `panel/backend/internal/auth/account_lockout.go`, `panel/backend/internal/auth/mfa.go`. TESTS: temp repro PASS then removed; build exit 0.

### W1-B1 — P1 — `api_key_requests` table missing → rate limiting dead (`no such table`)
- ROOT CAUSE: table owned only by uncalled `EnsureAPIKeyTables` Go helper (SQLite-only DDL), never in migrations.
- EVIDENCE: repro `RecordAPIKeyRequest err=SQL logic error: no such table` BEFORE → `ok` AFTER.
- FIX: new `069_api_key_requests.sql` in all 3 dialects (per-dialect DDL) + `RunMigrations` guard case mirroring 062.
- FILES: `panel/backend/internal/db/migrations/{sqlite,postgres,mysql}/069_api_key_requests.sql`, `panel/backend/internal/db/db.go`. TESTS: repro + idempotency + repo/backup/datamove suites exit 0.

### W1-B2 — P2 — backup engine aliases rejected (`sqlite3`, `postgresql`/`pg`, `mariadb`)
- ROOT CAUSE: exact-string switches not normalized to `NewDialect` aliases.
- FIX: widened `isSQLiteEngine`, `NativeToolAvailable`, `NativeDump`, tool label.
- FILES: `panel/backend/internal/backup/backup.go`. TESTS: backup suite exit 0. UNVERIFIED: live pg_dump/mysqldump round-trip.

### W1-C1 — P0 — file-manager symlink escape read host `/etc`
- ROOT CAUSE: dispatcher checked Clean+denylist but never `EvalSymlinks`.
- EVIDENCE: repro test BEFORE `status=200 contains_passwd=true` → AFTER `status=502`, legit path still 200.
- FIX: `resolvedBlocked()` (full-chain + deepest-ancestor resolution) enforced in dispatcher and `tryFixPermission`.
- FILES: `edge/backend/internal/files/handler.go`. TESTS: `go build ./...` + `go test ./...` exit 0.

### W1-C2 — P1 — snapshot `Location` allowed arbitrary host tar write
- ROOT CAUSE: `Location` passed raw; drivers concatenated `location+name+".tar"`.
- FIX (W1): `validateLocation()` (absolute, NUL/length, denylist) + `filepath.Join(Clean(location),…)` in docker/lxd drivers. FIX (W3): denylist += `/var,/opt,/srv,/home,/run` (destBlocked parity), symlink resolution, must be existing dir (`/tmp` intentionally still allowed — documented staging).
- FILES: `edge/backend/internal/snapshot/handler.go`, `edge/backend/internal/drivers/docker.go`, `edge/backend/internal/drivers/lxd.go`. TESTS: edge build/test exit 0.

### W1-C3 — P2 — `PortAllocation.IP` unvalidated
- FIX: `net.ParseIP` reject on non-empty IP; W3 added `%zone` strip for `fe80::1%eth0`.
- FILES: `edge/backend/internal/ports/handler.go`. TESTS: edge build/test exit 0.

### W1-C4 — P1 — `pip_install`/`npm_install` shell injection inside workload
- ROOT CAUSE: `compileStep` concatenated `sub(s.Command)` raw into `sh -lc`.
- EVIDENCE: repro script BEFORE `pip install … requests; echo PWNED` → AFTER each token single-quoted.
- FIX: `shellQuoteFields()` per-token quoting (pins/`==`, extras/`[]`, URLs verified safe).
- FILES: `edge/backend/internal/install/engine.go`. TESTS: edge build/test exit 0.

### W1-D1 — P1 — `clearAuth` dropped multi-account users to login
- ROOT CAUSE: `token: active.token` without the `'authenticated'` fallback `removeAccount` had.
- FIX: `token: active ? active.token || 'authenticated' : null` (mirrors existing pattern).
- FILES: `panel/frontend/src/shared/stores/authStore.ts`. TESTS: typecheck + build exit 0.

### W1-D2 — P2 — register/verify-email missing authed bounce; `*` catch-all lost `from`
- FIX: authed-bounce effects + auth-aware `CatchAll` (anonymous→login with `from`, authed→/instances, null while booting).
- FILES: `panel/frontend/src/features/auth/pages/Register.tsx`, `VerifyEmail.tsx`, `panel/frontend/src/app/router.tsx`. TESTS: typecheck + build exit 0.

### W1-D3 — P2 — Security page crashed on object error + empty page with no retry
- FIX: typeof-string error guard + `!snap && !loading` Retry panel; W3: interval skips ticks while `!snap` (no hammering).
- FILES: `panel/frontend/src/features/security/pages/Security.tsx`. TESTS: typecheck exit 0.

### W1-D4 — P2 — `useInstance` silent poll wiped instance on transient failure
- FIX (W1): silent ticks preserve; (W3): succeeded-but-absent clears (deleted surfaces, transport errors still preserve).
- FILES: `panel/frontend/src/shared/hooks/useInstance.ts`. TESTS: typecheck exit 0.

### W1-D5 — P3 — sidebar collapse reset every reload
- FIX: persist to `kspanel.sidebar.collapsed` (quota-safe).
- FILES: `panel/frontend/src/shared/components/layout/Layout.tsx`. TESTS: typecheck + build exit 0. UNVERIFIED: per-account WS auth (out of wave scope, no fix).

### W2-A1 — P1 — `launch --url/--user/--password/--database` silently ignored
- ROOT CAUSE: `runLaunch` read only `--type/--dsn`; only `seed.go` called `BuildDSNFromURL`.
- FIX: mirrored seed block (`--dsn` wins; build from URL tuple otherwise).
- FILES: `panel/backend/internal/cli/launch.go`. TESTS: vet exit 0; sqlite launch exit 0. UNVERIFIED: live PG/MySQL `--url`.

### W2-A2 — P2 — no `kspanel version` command
- FIX: cobra `version` cmd (plain + `--json`) from `version.Snapshot()`, registered in `root.go`.
- EVIDENCE: BEFORE `unknown command "version"` exit 1 → AFTER `kspanel 1.0.0 …` exit 0, `--json` exit 0.

### W2-A3 — P1 — `stop` PID path dead + overbroad pkill
- ROOT CAUSE: nothing ever wrote `<exe>.pid`; patterns included bare exe.
- FIX: launch writes/removes `<exe>.pid` (logged errors); pkill scoped to `… launch`.
- FILES: `panel/backend/internal/cli/launch.go`, `stop.go`. TESTS: pidfile present-during-serve/absent-after-SIGTERM; `go vet` exit 0. UNVERIFIED: `stop` PID-branch E2E (test-env stop returned 403).

### W2-C1 — P1 — THEMES_OWN admin list hid own themes
- ROOT CAUSE: `ListThemesWithOwner` selects `created_by`, leaves `OwnerID=0`; handler filtered on `OwnerID`.
- FIX: `owner = OwnerID || *CreatedBy` fallback before scope filter.
- FILES: `panel/backend/internal/api/handlers/theme_handler.go`. TESTS: build/test/tsc exit 0.

### W2-C2 — P1 — instance icon/color stored unvalidated; mixed-case color broke picker
- FIX: 16KB cap + `<script>` reject + `#rrggbb` hex check + `ToUpper(TrimSpace())` in UpdateIdentity + Deploy. V3-proven: frontend already uppercases (`instanceFormUtils.ts:324`), validator accepts both cases.
- FILES: `panel/backend/internal/api/handlers/instance_handler.go`. TESTS: vet + full suite exit 0.

### W2-C3 — P2 — template icon accepted `<script>` (stored SVG → `dangerouslySetInnerHTML`)
- FIX: case-insensitive `<script` reject in all three paths (JSON/file/URL), mirroring `validCustomIconSvg`.
- FILES: `panel/backend/internal/api/handlers/template_handler.go`. TESTS: handlers suite exit 0.

### W2-D1 — P1 — ticket repos used raw `?` + `LastInsertId` (Postgres writes fail)
- FIX: `db.Rebind(engine,q)` (`?`→`$N` on pg) + `repository/pg_compat.go` helpers (`RETURNING id` on pg); ticket/sla/attachment write paths routed through them.
- FILES: `panel/backend/internal/db/dialect.go`, `repository/pg_compat.go` (new), `ticket_repo.go`, `ticket_attachment_repo.go`, `ticket_sla_repo.go`, `pg_compat_test.go` (new). TESTS: 5 new + pre-existing, exit 0. UNVERIFIED: live-PG RETURNING (~20 non-ticket repos still `?`+LastInsertId — future wave).

### W2-D2 — P2 — `enrichTickets` N+1 with swallowed errors
- FIX: batched users IN + counts GROUP BY + last-reply MAX(id) + SLA IN (4 queries); errors propagated (`isMissingTableErr` → zero SLA).
- TESTS: `TestEnrichTicketsBatched`, `TestEnrichPropagatesErrors` PASS, suite exit 0.

### W3-A1 — P0 — module page-action proxied ARBITRARY commands (main-confirmed)
- ROOT CAUSE: `ExecuteModulePageActionHandler` (:1692) forwarded raw `Command/Path/Content/Args/Env` with only a module-enabled check; siblings enforce `savedActionMatches`.
- FIX: `findSpecModuleActions()` resolves the calling module row's SAVED actions from deploy-time config (fail closed); exact `savedActionMatches` + `savedActionExecFields` + `resolveExecPayload` required (403 otherwise); only STORED fields executed; stored/requested timeout semantics mirrored.
- FILES: `panel/backend/internal/api/handlers/instance_page_handler.go`. TESTS: temp forged-command test PASS (removed); action-args suite 10/10; full pkg exit 0. UNVERIFIED: persistent HTTP-level test (needs `_test.go` outside agent scope).

### W3-A2 — P1 — bulk page import orphaned rows (no `owner_id`)
- FIX: `UserIDFromContext` + 20-col statement when uid≠0 (mirrors `repo.Create`), legacy 19-col otherwise.
- TESTS: build/vet/full handlers suite exit 0. UNVERIFIED: persistent bulk-owner DB assertion.

### W3-B1 — P1 — AI fallback fired on ANY error incl. 400/401/403
- FIX: `aiProviderHTTPStatus` + `aiShouldFallbackToProvider` (fallback only on transport/5xx/429 incl. `aiIsRateLimitErr`; 4xx + cancelled ctx return directly). Single generic provider layer kept (code has only OpenAI-compatible + Ollama paths).
- FILES: `ai_chat_handler.go`, `ai_chat_extra.go`. TESTS: 5 new (`401NoFallback`/`500UsesFallback` × chat+stream, retryable gate) — 10/10 PASS exit 0.

### W3-B2 — P2 — stream fallback appended to already-flushed primary partials (garbled reply)
- FIX: buffer primary deltas, replay on success only, discard on error; SSE contract unchanged.
- TESTS: `TestAIStreamFallbackInterleaveDiscardsPrimary` PASS.

### W4-P1 (main fix) — P1 — ticket Update mixed `$N`/`?` on Postgres
- ROOT CAUSE (fresh-eyes): `fmt.Sprintf(r.rebind(tmplWith%s), …)` numbered static binds BEFORE injecting fragments with raw `?`.
- FIX: extracted `ticketUpdateQuery(engine, hasAssigned, hasClosed, hasDue)` (Sprintf-then-Rebind) + `TestTicketUpdateQueryPlaceholders` (5 branches × pg/sqlite: zero raw `?` on pg, exact `$N` count, sqlite passthrough).
- FILES: `ticket_repo.go`, `pg_compat_test.go`. TESTS: new test + full repo/handlers suites `-count=1` exit 0. PASS 1 restarted per THE LOOP.

## Verification (REAL output, exit codes)

- `go build ./... && go test ./...` panel/backend → exit 0 (all pkgs ok, incl. uncached reruns)
- `go build ./... && go test ./...` edge/backend → exit 0
- `npm run typecheck` / `lint` (same script) → exit 0; `npm run build` → exit 0 (`✓ built in ~6.5s`)
- `bash retest.sh` → exit 0 (panel ready :8080, sqlite); smoke: `/health` 200, `/auth/login` 200, `/api/instances` unauth 401, `/api/instance-pages/module-action` forged unauth 403; log tail read; panel stopped
- `bash rebuild.sh` → exit 0 (v1.0.6, secret scan clean, checksums generated)
- `gofmt -l` on every touched Go file → clean or proven pre-existing drift outside added hunks (no drive-by reformats)
- No TODO/FIXME/debug prints in the combined diff (grep sweep)

## Known gaps / explicitly NOT verified (honest list)

1. Live Postgres/MySQL paths (no servers in env) — PG correctness proven at dialect/unit level only; ~20 non-ticket repos still use `?`+`LastInsertId` (future wave).
2. Live MySQL bootstrap: Wave 2-D proved with live MySQL 8.0.46 that `001_init` fails first (ERROR 1170, TEXT UNIQUE) plus TEXT…DEFAULT '' (ERROR 1101) in 45 files — needs NEW migration(s); shipped files untouched per rules.
3. Live edge drivers (docker/lxd/kvm/multipass), live provider 401/500 matrix, LAN-browser cookie, live PG/MySQL `--url` launch, `stop` PID-branch E2E, MFA peek path (behind `hasMFA=false`).
4. Out-of-scope concurrent edits left in place (build-green, need their own wave): ai-chat `ChatPanel→ChatView` split + dimension change + model-override/greeting removal; `Nodes.tsx` background heartbeat/version passes; `VERSION`/release-binary churn from build runs.
5. Repo hygiene (pre-existing, untouched): no root `.gitignore` (`*.db*`, `internal/dist/` tracked — a test run dirtied `internal/api/kspanel.db*`, reverted by main); `map.md` stale vs real tree (datamove/oauth/pagelib/tunnel/themelib/ai-chat/tickets/notifications missing); pre-existing gofmt drift in untouched files.
6. Device-cookie design decision (P2): always-`Secure` + `__Host-` still drops on non-localhost plain-HTTP LAN — dropping the prefix needs a product call.

## Per-agent verdicts

- W1: auth/security ACCEPT · persistence ACCEPT · edge ACCEPT · frontend ACCEPT (main repaired 2 second-order regressions) · ops/release REWORK (nothing applied → redone in W2-A)
- W2: CLI ACCEPT · contracts ACCEPT · persistence ACCEPT · AI/mods/pages REWORK (nothing applied → redone in W3-A/B) · fresh-eyes triaged (1 downgrade P1→P2 with written reasoning, 1 confirmed-latent, residuals queued)
- W3: module-action ACCEPT · AI fallback ACCEPT · hardening ACCEPT (6/6 items, `/tmp` exception documented)
- W4: fresh-eyes 1 P1 ACCEPTED and fixed by main with regression test
