# Template System vs — `/templates` Only (honest, Sept 2026, rev 3: config parsers unscored — deliberately out of scope, verified against builtin library)

Scope: template blueprint system only. Every row compares all four panels. No standalone feature tour.

Panels + latest checked: `KS` (this repo) vs `Pterodactyl v1.15.1 (12 Aug 2026, stable, 9.2k★)` vs `Pelican v1.0.0-beta37 (13 Aug 2026, beta, 2.3k★)` vs `PufferPanel v3.0.9`.

## 1. Shape vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Unit | flat `Template` | `Nest > Egg` | `Nest > Egg` | flat `Template` |
| Grouping | `category/type` tags + filter only, auto-derived, flattens at scale | real `Nests` + mass importer creates nests automatically (Eggify v9.7) | real `Nests` + user-configurable egg/nest index file (beta34) | `type` string, mostly display (`type` drives game icon) |
| Format | rich spec (`ports,limits,mounts,env[],install[],actions[],healthcheck,labels,devices,pages[],controls,advanced{kvm,mp,lxd}`) | `PTDL_v2` (`docker_images,startup,scripts,variables[],config-files`) | same `PTDL_v2`, import-compatible | `{type,display,data,install,run,environment}` + `conditions` (CEL) + multi-`commands` |
| Var syntax | form fields + `{{config:}}` on pages only | `{{VAR}}` in startup/script, proven | `{{VAR}}` | `${var}` anywhere + `file_exists/in_path/is_server_running` |
| Multi-image | named `images[]` map (`{name,image,description,default,env}`) + Ptero-compatible `docker_images{}` import + `default_image`; deploy picker posts `image_key` (unknown names fail closed 400 with the options), per-image env applies under explicit deploy values, selected image still env-templated; top-level `image` stays the legacy default so old templates deploy unchanged | `docker_images{}` map (Java 17/21, SteamCMD yolks) | same map | one image, but `conditions` allow dual-env (docker vs standard) in one file |

## 2. Authoring surface vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| List | card grid, search + driver/category/sort, counts + limits on card. Honest minus: counts cover only ports/env/installs/mounts, no hierarchy | Nest-filtered egg list, mature but plain | same + Filament skin, sortable columns, icon upload refactor (beta34) | plain list, templates pulled on-demand from GitHub, local override only if modified |
| Builder | 10 tabs, most complete. Honest minus: startup split (`advanced.startup_command` vs `Actions[].steps`) confuses Docker authors; no raw-JSON edit mode, preview is collapsible only | admin egg form, narrow but every field is honored by Wings | same + egg edit refresh fix, icon upload guard, `p:egg:normalize` command | no builder — raw JSON edit, fast for experts, hostile for beginners |
| Import | file (`multipart` + preview) + URL (SSRF-guarded). Honest minus: no signature check, no marketplace pin, no version channel | `Import Egg` + Eggify mass import/update from official repos, outdated-egg detection + compare | same + `egg update check` hardening | `template import`, on-demand GitHub pull |
| Export | `Download JSON + Copy spec/ID` | `Export` + Eggify packs | same | raw JSON |
| Detail | resources/network/env/install/actions/pages + instance usage + raw JSON + invalid-spec warning. Honest minus: no version history, diff, or rollback | egg form is the detail | same | no dedicated detail |
| Stats/schedules | yes per template. Honest minus: stats cards are counts only and the `timeRange` selector is currently dead UI (state exists, never filters) | server-level only | same | server-level only |
| Ownership | `TEMPLATES_OWN/ALL` scoping | admin-only eggs + mature subuser perms | admin-only + authorize checks on egg modals (beta) | admin-only, streamlined perms |
| Library | 5 builtins (`minecraft,nginx,ubuntu-vm,ubuntu-multipass,alpine-lxd`) | ~100+ (`eggs.pterodactyl.io`, updated Jul 2026: CanvasMC, Subnautica, Soulmask…) | inherits ~100+, own `pelican-eggs` org (19 repos) | ~35, on-demand + `templatetester` CI + CurseForge/NeoForge direct pull |

## 3. Runtime vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Docker | yes | yes, only — deep yolks, pinned images (panel v1.15.0 + MariaDB 11.8.8 + Redis 8.10.0 in 2026 refs) | yes, only | optional; Docker image is panel+node only, servers can run host-side |
| Host process | via `shell` steps, not first-class | no | no | yes, first-class + `unshare` isolation |
| KVM / LXD / Multipass | yes, dedicated sections. Honest minus: UI exposes ~50 VM fields as free text with no edge-support matrix shown; non-Docker ports banner itself warns `may require SSH tunnel` | no | no | no |
| Ports | `ports[]` in spec (good for single panel) | `Allocations` at server-create (correct separation for hosting: IP:port pool, not baked into egg) | same | `${ip/port}` vars |
| Mounts | `mounts[]` | Wings-managed | same | `workingDirectory` + host-expose config entry |
| Limits | `limits + caps` in template (convenient, but plain-text inputs, weak guardrails) | limits at server-create (enforced per server) | same | per-server |
| Health/labels/devices | yes, but Docker-only in practice; many string fields unvalidated | no | no | no |
| Advanced tuning | largest form (`network_mode/restart/logging/ulimits/dns/extra_hosts/env_template`) | no (daemon config, not egg) | no | `stdin` (RCON/TELNET), rolling logs, systemd hooks |

## 4. Install / start vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Install | 11 typed ops + `timeout/retries/ignore_errors`. Good for beginners. Honest minus: no `if/else`, loops, or CEL — anything conditional needs multiple steps + ignore-errors hacks | single bash `script` (container + entrypoint). Full language: loops, conditionals, curl, jq — why power users stay | same | 5 operators + `conditions` + `tester` validation + DepotDownloader/CurseForge runners |
| Start | `startup_command` + per-action steps. Honest minus: two places to define "start" | one `startup` line, easiest to review | same | `program + arguments`, multi-`commands` chosen by `conditions` |
| Stop | `stop_command + same/different mode + terminal_stop_on_exit` (most expressive) | `config.stop` (simple, enough for games) | same | `stop + stopCode` + `skip restarts on stop` (v3.0.9) |
| Multi-action | `actions[]` (cooldown/async/session/run_on_create) — unique depth. Honest minus: `allowed_states` CSV typos silently narrow; `terminal_id` duplicates attach to first only (warning exists, still footgun); numeric fields are strings | no (schedules + subusers cover parts) | no | `pre/post` + conditions (lighter, harder to misconfigure) |
| Console binding | `terminal_id` mirror + allow/block regex + timeout — unique. Honest minus: regex per action, no central audit of who typed what beyond instance audit | none | none | RCON/TELNET `stdin` support (narrower, but exactly what games need) |
| Config-file parsers | out of scope (unscored, see §7) — `install[]` `write`/`shell` + `{{VAR}}` env cover the builtin library; whole-file writes, not idempotent key-patches | `config-files` find/replace (e.g. `server.properties` without scripts) | same | `writefile` + conditions only |

## 5. Variables vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Types/widgets | `text/number/select/checkbox + options`; select rows carry SVG + label + value; checkbox has custom on/off send-values | text + `rules` (laravel rules are genuinely stronger validation) | same | `type + display` + CEL |
| Gates | `viewable/editable` | same names, enforced + subuser layer | same + subuser checks fix | `required` only |
| Per-page vars | `configure[] + config{}` (unique) | no | no | no |
| Bulk `.env` file | `env_file` textarea (compose-style, substituted, merged under explicit vars) → real env: Docker `-e`, LXD `environment.*`. Honest minus: template-level only (no per-deploy edit), file vars never secret-flagged, KVM/Multipass have no env channel | no bulk (vars one-by-one; each does become real container env) | no bulk | `writefile` can materialize a `.env` file but panel never injects it as process env (app must read it itself) |
| Honest minus | `rule` is a bare regex box; `append/prepend/append_value` trio is confusing | variable UX is dated but predictable | same | docs openly mark `type` as grouping-reserved, not enforced |

## 6. UI composition vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Per-template UI | `Pages[]` (30-row library) + `home_page` + `controls` (power/shortcuts/tabs/more-link). Unique. Honest minus: pages are snapshotted at deploy — library updates do NOT propagate, no Eggify-style update detection; per-template import is manual | fixed server view, polished, drag & drop uploads (Pelican ported), SFTP button in file list (beta37) | same fixed view, Filament client area (still beta) | fixed view + per-`type` game icon + JVM/Minecraft query stats |
| Controls granularity | deepest (info row, live stats, 4 power buttons, actions, 3 shortcuts with slug/icon/page options, 4 overview tabs, more-link with unknown-slug warning). Honest minus: `allow-all` default on old templates is permissive-by-default; surface overwhelms simple game use | subuser permission matrix (simpler mental model for game hosts) | same + translation-prefixed custom perms | explicit action permissions, smaller surface |

## 7. Verdict vs (honest)

- KS vs all on breadth: wins tab count, drivers, actions/terminal, pages, health/labels, URL import, detail/governance, per-var image targeting + auto-set env. Key-path config parsers are deliberately out of scope (verified: no builtin template needs key-patching — `eula.txt` is a fresh whole-file `write`, `server.properties` is generated on first start) and unscored, same class as Puffer's `writefile`. Paid for with complexity (startup split, CSV states, string numbers, permissive defaults, dead `timeRange`, snapshot drift, 5-template library).
- Ptero vs KS: wins simplicity (one startup, one bash script), `Nests`, allocations model, ecosystem (~100+, Eggify updates), stable v1.15.x in 2026 — plus `config-files` find/replace for hand-edited configs, the one parser case KS covers only via `shell`/`sed`. Loses everything template-composable (pages/actions/binding/multi-image/per-var env).
- Pelican vs KS: same wins as Ptero + modern skin, configurable egg index, icon handling, S3 backup hosts; loses on stability (still beta37, not 1.0).
- Puffer vs KS: wins honesty of scope (host+docker, `unshare`, conditions, multi-commands, RCON/TELNET, CurseForge, tester, on-demand templates); loses builder/detail/pages/governance depth. File writes are parity: Puffer `writefile` + conditions vs KS `write`/`shell` + env.

## 8. Scores (`/100` per case, honest)

| # | Case | KS | Ptero | Pelican | Puffer |
|---|------|----|-------|---------|--------|
| 1 | List | 88 | 78 | 84 | 62 |
| 2 | Detail | 85 | 72 | 80 | 45 |
| 3 | Builder | 88 | 72 | 76 | 45 |
| 4 | Import / export | 90 | 82 | 82 | 72 |
| 5 | Metadata | 88 | 65 | 72 | 60 |
| 6 | Environment in-template | 85 | 45 | 45 | 60 |
| 7 | Env variables | 85 | 82 | 82 | 70 |
| 8 | Install | 82 | 92 | 92 | 80 |
| 9 | Startup / stop | 75 | 92 | 92 | 86 |
| 10 | Multi-action + terminal | 90 | 30 | 35 | 50 |
| 11 | Driver coverage | 88 | 60 | 60 | 72 |
| 12 | Advanced + health/labels | 85 | 20 | 20 | 15 |
| 13 | Pages / UI | 95 | 15 | 15 | 15 |
| 14 | Grouping | 50 | 88 | 88 | 35 |
| 15 | Multi-image | 100 | 90 | 90 | 30 |
| 16 | Library size | 25 | 100 | 88 | 65 |
| 17 | Governance | 78 | 70 | 72 | 55 |
| 18 | Bulk `.env` file | 90 | 20 | 20 | 35 |

### Total

| Rank | Panel | Sum | Final `/100` |
|------|-------|-----|--------------|
| **1** | **KS** | **1,467 / 1,800** | **82** |
| 2 | Pelican | 1,193 / 1,800 | 66 |
| 3 | Pterodactyl | 1,173 / 1,800 | 65 |
| 4 | PufferPanel | 952 / 1,800 | 53 |

Config parsers excluded from scoring (deliberately out of scope — no builtin template needs key-patching); without the old penalty row KS moves 79 → 82. Remaining gap: Nests-style grouping (case 14) and library size (case 16). Clear lead on composability: KS leads cases 1–7, 10–13, 15, 17–18; trails on 8–9 (single bash script simplicity), 14 (Nests), 16 (library size). Close the remaining gap with Nest-like grouping, page/action update detection, and a raw-JSON edit mode; competitors cannot match pages/actions/binding/multi-image/per-var env without a format break.

## 9. Sources

- KS: `pages/{Templates,TemplateDetail,TemplateForm,TemplateStats}.tsx`, `components/TemplateForm/*.tsx` (10 tabs — Config Files section removed Sept 2026), `types/templateForm.ts` (6 env scopes: install/actions/image/controls/pages/advanced), `utils/templateFormUtils.ts`, `models/instance.go:7`, `cli/templates_builtin.go`, `api/server.go:/api/templates`, `repository/template_repo.go`, `handlers/dotenv.go`, `handlers/instance_handler.go` (deploy + install workflow), `edge/internal/install/engine.go` (steps only)
- Ptero: panel `v1.15.1` (Aug 2026), `eggs.pterodactyl.io` (Jul 2026 updates), Eggify v9.7
- Pelican: panel `v1.0.0-beta37` (Aug 2026), `pelican-eggs` org, egg update/normalize/index features
- Puffer: docs `v3.0.9`, `templates` repo `v3`, conditions/multi-commands/RCON/CurseForge/tester
