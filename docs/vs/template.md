# Template System vs — `/templates` Only

Scope: template blueprint system only. Panels: `KS` vs `Pterodactyl` vs `Pelican` vs `PufferPanel`.

## 1. Shape vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Unit | flat `Template` | `Nest > Egg` | `Nest > Egg` | flat `Template` |
| Grouping | `category/type` tags + filter only | real `Nests` (e.g. Minecraft, Source Engine) | real `Nests` | `type` string, unused for grouping |
| Format | rich spec (`ports,limits,mounts,env[],install[],actions[],healthcheck,labels,devices,pages[],controls,advanced{kvm,mp,lxd}`) | `PTDL_v2` egg (`docker_images,startup,scripts,variables[],config-files`) | same `PTDL_v2`, import-compatible | `{type,display,data,install,run,environment}` |
| Var syntax | form fields + `{{config:}}` on pages | `{{VAR}}` in startup/script | `{{VAR}}` | `${var}` + CEL |
| Multi-image | one `image` | `docker_images{}` map (e.g. Java 17/21) | `docker_images{}` map | one `environment.image` |

## 2. Authoring surface vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| List | card grid + search (`name,image,category,type`) + filter (driver/category/sort) + counts + limits on card | Nest-filtered egg list | same, modern skin | plain template list, no driver filter |
| Builder | 11 tabs (General, Environment, Env Vars, Actions, Install, Runtime, Labels & Devices, Healthcheck, Pages, Controls, Spec Preview) | admin egg form (name/docker/startup/vars/script) | same | no, raw JSON edit |
| Import | file (`multipart`) + URL (SSRF-guarded + preview) | `Import Egg` file/paste | same | `template import` file |
| Export | `Download JSON + Copy spec/ID` | `Export` | same | raw JSON |
| Detail | resources/network/env/install/actions/pages + instance usage (`total/running/stopped`) + raw JSON + invalid-spec warning | egg detail form | same | no dedicated detail |
| Stats/schedules per template | yes (`/templates/stats`, `/schedules`) | no, server-level only | no | no |
| Ownership scoping | yes (`TEMPLATES_OWN/ALL`) | admin-only | admin-only | admin-only |
| Library size | 5 builtins | ~100+ (`game-eggs`) | inherits ~100+ | ~35 |

## 3. Runtime vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Docker | yes | yes, only | yes, only | optional |
| Host process | via `shell` steps, not first-class | no | no | yes, first-class |
| KVM / LXD / Multipass | yes, dedicated sections | no | no | no |
| Ports | `ports[]` in spec | `Allocations` at server-create, not in egg | same | `${ip/port}` vars |
| Mounts | `mounts[]` | Wings-managed, not in egg | same | `workingDirectory` only |
| Limits | `limits + caps{databases,backups,networks}` in template | limits at server-create | same | per-server |
| Healthcheck / labels / devices | yes | no | no | no |
| Advanced tuning | `network_mode/restart/logging/ulimits/user/hostname/dns` + per-driver KVM/Multipass/LXD blocks | no | no | no |

## 4. Install / start vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Install | 11 typed ops (`shell/download/extract/move/write/chmod/mkdir/git_clone/pip_install/npm_install/http_check`) + `timeout/retries/ignore_errors` | single bash `script` (container + entrypoint) | same | `operators[]` (`download/move/mkdir/command/writefile` + CEL) |
| Start | `startup_command` + per-`Action.steps` | one `startup` string | same | `program + arguments` |
| Stop | `stop_command + stop_mode + terminal_stop_on_exit` | `config.stop` | same | `stop + stopCode` |
| Multi-action | yes (`actions[]` + `run_on_create/cooldown/async/session/terminal_id`) | no, one startup | no | `pre/post` only |
| Console binding | `terminal_id` mirror + allow/block + timeout | none | none | none |
| Config-file parsers | no, via page actions | yes (`config-files`) | yes | `writefile` only |

## 5. Variables vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Types | `text/number/select/checkbox + options` | text + `rules` | text + `rules` | `type + display` |
| Gates | `user_viewable/user_editable` | same | same | `required` only |
| Validation | `required + rule` | `rules` (laravel) | same | `required` |
| Per-page vars | yes (`configure[] + config{}`) | no | no | no |

## 6. UI composition vs

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Per-template UI | `Pages[]` (30-row library: `home/files/terminal/metrics/.../minecraft-*`) + `home_page` slug + `controls` | fixed view (`Console/Files/DB/Backups/Network/Schedules/Users`) | same fixed view | fixed view (`Console/Files/Settings`) |
| Page payload | `html/markdown/blocks + actions/sub_pages/components` + reorder/disable/Configure | n/a | n/a | n/a |

## 7. Verdict vs

- KS vs Ptero/Pelican/Puffer on breadth: KS wins builder (11 tabs), drivers (4 vs 1–2), actions + terminal binding, pages, health/labels, URL import, detail/stats/governance.
- Ptero/Pelican vs KS: win grouping (`Nests`), multi-image map, config-file parsers, startup simplicity, ecosystem (~100+ vs 5).
- Pelican vs Pterodactyl: same egg format, Pelican wins skin + cadence.
- Puffer vs all: wins host-process simplicity; loses builder, detail, governance, pages.

## 8. Scores (`/100` per case)

| # | Case | KS | Ptero | Pelican | Puffer |
|---|------|----|-------|---------|--------|
| 1 | List / browse / search / filter | 95 | 75 | 82 | 60 |
| 2 | Detail view | 96 | 70 | 78 | 40 |
| 3 | Visual builder | 96 | 70 | 75 | 30 |
| 4 | Import / export | 98 | 75 | 75 | 70 |
| 5 | Metadata / branding | 95 | 60 | 60 | 55 |
| 6 | Environment in-template | 95 | 30 | 30 | 55 |
| 7 | Env variables | 92 | 75 | 75 | 65 |
| 8 | Install workflow | 90 | 85 | 85 | 75 |
| 9 | Startup / stop | 88 | 90 | 90 | 85 |
| 10 | Multi-action + terminal binding | 97 | 20 | 25 | 40 |
| 11 | Driver coverage | 95 | 50 | 50 | 70 |
| 12 | Advanced + health/labels/devices | 96 | 15 | 15 | 10 |
| 13 | Pages / UI composition | 100 | 10 | 10 | 10 |
| 14 | Grouping | 55 | 90 | 90 | 30 |
| 15 | Multi-image | 20 | 90 | 90 | 20 |
| 16 | Config-file parsers | 15 | 85 | 85 | 20 |
| 17 | Library size | 25 | 100 | 95 | 60 |
| 18 | Governance (ownership, stats, validation, usage) | 95 | 50 | 55 | 35 |

### Total

| Rank | Panel | Sum | Final `/100` |
|------|-------|-----|--------------|
| **1** | **KS** | **1,443 / 1,800** | **80** |
| 2 | Pelican | 1,165 / 1,800 | 65 |
| 3 | Pterodactyl | 1,140 / 1,800 | 63 |
| 4 | PufferPanel | 830 / 1,800 | 46 |

## 9. Sources

- KS: `panel/frontend/src/features/templates/pages/{Templates,TemplateDetail,TemplateForm}.tsx`, `components/TemplateForm/*.tsx`, `types/templateForm.ts`, `utils/templateFormUtils.ts`, `panel/backend/internal/models/instance.go:7`, `panel/backend/internal/cli/templates_builtin.go`
- Ptero/Pelican: `PTDL_v2` egg (`docker_images/startup/scripts/variables/config-files`), `Nests`, `game-eggs` catalog
- Puffer: `type/display/data/install/run/environment`, operators + CEL, `PufferPanel/templates` repo
