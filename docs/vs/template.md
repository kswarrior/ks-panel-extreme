# Template System vs — `/templates` Only

Scope: only the template blueprint system behind the `/templates` page.
Not instances, nodes, users, themes, tickets, or edge drivers except where a template field maps to them.

Source of truth: `panel/frontend/src/features/templates/`, `panel/backend/internal/models/instance.go:7`, `panel/backend/internal/cli/templates_builtin.go`.

## 1. KS Panel — `/templates`

### 1.1 List — `pages/Templates.tsx`

Card grid. Each card shows `icon/color tile`, driver badge (`docker|lxd|kvm|multipass`), `category · type`, `image` mono-line, `RAM/CPU/Disk`, counts (`ports/env/installs/mounts`), `Updated date`, `View details →`.

Pill actions: search (`name,image,category,type`), filter (`driver`, `category`, sort `updated|newest|name|kind`), links to `/templates/stats` + `/templates/schedules`, `+ Install` button.

`Install modal` (3 tabs):

- `Upload file` — `.json` manifest via `multipart POST /api/templates/`, client-side JSON parse + preview (`name/kind/image`).
- `From URL` — server-side fetch (SSRF-guarded: public hosts only, DNS-pinned, size + time capped), recorded for audit.
- `Create` — jumps to `/templates/new` visual builder.

Delete is confirm-gated (`Existing instances keep running`).

### 1.2 Detail — `pages/TemplateDetail.tsx` (`/template/:id`)

Header (`ID · kind · relative time`) + 4 stat cards (`Created | Updated | Instances total/running/stopped | Spec items ports/env/mounts + install/actions`) + `Description` + `Image + copy` + sections:

- `Resources`: `limits.memory/cpus/disk/swap` + `caps.databases/backups/networks`.
- `Network & Mounts`: `ports[]` (`host:container + protocol`), `mounts[]` (`source → target (mode)`).
- `Environment`: `env[]` (`key = value/default + required` badge).
- `Install & Actions`: `install[]` numbered, `actions[]` (`id · name — desc`), `pages[]` chips.
- `Raw spec JSON`: collapsible pretty print + `Copy JSON / Download`.
- Menu: `Edit | Download JSON | Copy ID | Copy spec | Delete`.

Invalid spec JSON surfaces an amber warning instead of silently rendering empty sections.

### 1.3 Form — `pages/TemplateForm.tsx` (`/templates/new`, `/templates/:id/edit`)

11 tabs (`types/templateForm.ts:TEMPLATE_TABS`):

| Tab | Fields |
|-----|--------|
| `General` | `name*, description, icon_svg, color #rrggbb, kind: docker\|lxd\|kvm\|multipass, image*, category (game/web/database/proxy/bot/other+custom), type (minecraft/nginx/postgres/redis/generic+custom)` |
| `Environment` (`TemplateEnvironmentSection`) | `ports[{host,guest,tcp\|udp}], mounts[{source,target,rw\|ro}], limits{ram_mb,cpu_pct,disk_mb,swap_mb}, caps{databases,backups,networks}` |
| `Env Variables` (`TemplateEnvVariablesSection`) | `name,label,description,default,user_viewable,user_editable,required,rule,display:text\|number\|select\|checkbox,options,append/prepend/append_value`, reorderable |
| `Actions` (`TemplateActionsSection`) | `id,name,description,icon_svg/icon_color,allowed_states,requires_online,async_run,run_on_create,cooldown_s,user_invokable,session:long_running\|console_session\|vm_full,auto_start_instance,auto_stop_on_exit,restart_on_failure,allowed/blocked_commands,max_runtime_s,stop_command,stop_mode:same\|different,terminal_id,terminal_stop_on_exit,terminal_allow_input:all\|allowlist\|disabled,terminal_allowed/blocked_commands,terminal_timeout_s,steps[]` |
| `Install` (`TemplateInstallSection`) | `steps[{shell\|download\|extract\|move\|write\|chmod\|mkdir\|git_clone\|pip_install\|npm_install\|http_check + command/url/filename/archive/dest/from/to/path/content/branch/retries/ignore_errors}]`, `install_timeout_s` |
| `Runtime` (`TemplateRuntimeSection`) | common `startup_command,stop_command,stop_signal,working_dir,user,hostname,privileged,readonly_rootfs,enable_tty,dns,extra_hosts,network_mode:bridge\|host\|none\|container\|macvlan\|ipvlan,restart_policy:no\|always\|unless-stopped\|on-failure,shm_size,pid_limit,ulimits,log_driver/level/rotation,oom_kill_disable,cpu_quota,io_weight,environment_template` + `KVM{vcpus,cpu_model,machine,uefi,secure_boot,tpm,vga,boot_order,kernel_args,extra_args,vnc/spice,iso,disk_bus/cache/io_thread/discard/numa/hugepages}` + `Multipass{cpus,disk,mem,cloud-init, image_alias,bridges}` + `LXD{profiles,storage_pool,volume_size,config,devices,cpu_allowance/priority,security,autostart,snapshot_pattern}` |
| `Labels & Devices` (`TemplateLabelsDevicesSection`) | `labels[{key,value}], devices[{host,container,cgroup}]` |
| `Healthcheck` (`TemplateHealthcheckSection`) | `enabled,test_command,interval_s,timeout_s,retries,start_period_s` |
| `Pages` (inline in `TemplateForm.tsx`) | `home_page` slug (landing route, empty = Home `.`) + `Add pages` from Instance Pages library as `custom{slug,label,icon,content html\|markdown\|blocks,actions[],sub_pages[],components[],configure[]+config{}}`, reorder/enable/disable/edit, per-page `Configure` modal (`spec.pages[].config`, `{{config:NAME}}` / `KSPageSDK.config`) |
| `Instance Controls` (`TemplateControlsSection`) | `files/terminal/ports` shortcuts (`allow_edit,show_sftp,show_header,terminal_max,allow_multi`), `pageSlugs` allow-list |
| `Spec Preview` (`TemplateSpecPreviewSection`) | live `serializeSpec(form)` JSON (`utils/templateFormUtils.ts`) |

Backend model (`models/instance.go:7`):

```go
type Template struct {
  ID, Name, Description, Kind, Image, Spec, Icon, Color,
  OwnerID, OwnerName, CreatedAt, UpdatedAt
}
```

`Spec` is opaque JSON to the panel; edge interprets it per `kind`. Ownership (`OwnerID`, `TEMPLATES_OWN/ALL`) scopes the library. `stats`/`schedules` are fleet views over the same rows.

Builtins (`cli/templates_builtin.go`): `minecraft (paper-1.21.10, mc-console action), nginx, ubuntu-vm (kvm), ubuntu-multipass, alpine-lxd` — 5 total.

Deploy contract: template `spec` is snapshotted into `instance.config` at deploy time; instance sidebar/routes render only that snapshot (`isPageAllowed`, `resolveInstanceNav`).

## 2. Pterodactyl — Eggs (`Admin > Nests > Eggs`)

Hierarchy: `Nest (category, e.g. Minecraft, Source Engine) > Egg (one server type: Paper, Rust, Node.js)`.

Egg JSON (`PTDL_v2`):

```json
{
  "docker_images": { "Java 21": "ghcr.io/pterodactyl/yolks:java_21" },
  "startup": "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
  "config": { "startup": {}, "stop": "stop" },
  "scripts": { "installation": {
    "container": "debian:buster-slim", "entrypoint": "bash",
    "script": "#!/bin/bash\ncurl -o server.jar ..."
  }},
  "variables": [{
    "name": "Server Jar File", "env_variable": "SERVER_JARFILE",
    "default_value": "server.jar", "user_viewable": true,
    "user_editable": true, "rules": "required|string"
  }],
  "config-files": []
}
```

Key points:

- One `startup` command with `{{VAR}}` mustache substitution.
- One `install` bash script (container + entrypoint selectable).
- `variables[]` flat list (name/desc/env/default/viewable/editable/rules).
- `config-files` parsers can find/replace keys inside game configs (e.g. `server.properties`).
- `docker_images` map offers multiple runtime choices per egg.
- `stop` command + log config per egg.
- Management: `Import Egg` JSON into a Nest, `Export`, edit in admin UI, then `Create Server` picks egg + allocation + limits.
- Library: `pterodactyl/game-eggs` ~100+ maintained eggs (games + apps + language yolks).
- Runtime: Docker-only via Wings. Ports are `Allocations` (IP:port) assigned at server-create, not in the egg.

## 3. Pelican — Eggs (Pterodactyl fork)

Same `Nest > Egg` model and `PTDL_v2` JSON — fully import-compatible with Pterodactyl eggs and migration docs.

Differences are panel-level, not format-level: modern UI (Filament), faster release cadence, native 2FA/SSL/AES-256, one-click installs, auto-updates. Template authoring UX is the same fields as §2 (startup/install/variables/docker images).

Choose Pelican over Pterodactyl for new installs for the maintained fork; egg authoring knowledge transfers 1:1.

## 4. PufferPanel — Templates (`Templates` page + `PufferPanel/templates` repo, ~35)

Flat template, 4 sections + header (`docs.pufferpanel.com`, `documentation/source/templates/templates.rst`):

```json
{
  "type": "minecraft-java",
  "display": "Minecraft Java (Docker)",
  "data": { "memory": {
    "value": "1024", "required": true,
    "desc": "Memory in MB", "display": "Memory (MB)", "type": "integer"
  }},
  "install": [{ "type": "download",
    "files": ["https://.../server.jar"] }],
  "run": {
    "stop": "stop",
    "program": "java",
    "arguments": ["-Xmx${memory}M", "-jar", "server.jar", "nogui"],
    "pre": [], "post": [],
    "environmentVars": { "IP": "${ip}" },
    "workingDirectory": "/server"
  },
  "environment": { "type": "docker", "image": "openjdk:21" },
  "supported_environments": [{ "type": "docker" }]
}
```

Key points:

- Variables live in `data{}`, referenced as `${var}` anywhere.
- `install` + `run.pre/post` are `operators[]`: `download | move | mkdir | command | writefile` (+ CEL `conditions`, `file_exists()` helper).
- `run` = `program + arguments + stop string + stopCode + environmentVars + workingDirectory`.
- `environment.type`: `standard` (host process) or `docker` (image); Docker is optional — host-process is the default mental model.
- Management: edit JSON directly in panel or `pufferpanel template import`; repo enforces field order (`type,display,data,install,run,environment,supported_environments`).
- Library: `PufferPanel/templates` ~35 (minecraft variants, source games, rust, valheim, terraria, teamspeak, discord bots).
- No visual builder, no per-driver VM sections, no pages/actions/healthcheck/labels UI.

## 5. Head-to-head (template system only)

### 5.1 Shape

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Unit | flat `Template` | `Nest > Egg` | `Nest > Egg` | flat `Template` |
| Grouping | `category/type` tags + filter | real `Nests` | real `Nests` | `type` string (unused for grouping) |
| Format | rich spec object (§1.3) | `PTDL_v2` egg | `PTDL_v2` egg | `{type,display,data,install,run,environment}` |
| Var syntax | form fields, `{{config:}}` only on pages | `{{VAR}}` in startup/script | `{{VAR}}` | `${var}` + CEL |
| Multi-image | one `image` per template | `docker_images{}` map | `docker_images{}` map | one `environment.image` |

### 5.2 Authoring surface (`/templates` page vs equivalents)

| Capability | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| List + search/filter/sort | yes (driver/category/sort, counts, limits on card) | Nest-filtered egg list | same, modern skin | template list, no driver filter |
| Visual builder | yes, 11 tabs | admin egg form (name/docker/startup/vars/script) | same | no (raw JSON edit) |
| Import file | yes (`multipart`) | yes (`Import Egg`) | yes | yes (`template import`) |
| Import URL | yes (SSRF-guarded fetch) | no (paste/upload) | no | no |
| Export/download | yes (`Download JSON`, `Copy spec/ID`) | yes (`Export`) | yes | yes (raw JSON) |
| Detail view | yes (resources/network/env/install/actions/pages + raw JSON) | egg detail form | same | no dedicated detail |
| Stats/schedules per template | yes (`/templates/stats`, `/schedules`) | no (server-level only) | no | no |
| Ownership scoping | yes (`TEMPLATES_OWN/ALL`) | admin-only eggs | admin-only eggs | admin-only |
| Builtin library size | 5 | ~100+ | inherits ~100+ | ~35 |

### 5.3 Runtime coverage per template

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Docker | yes | yes (only) | yes (only) | optional |
| Host process | via docker `shell` steps, not first-class | no | no | yes (first-class) |
| KVM / LXD / Multipass | yes, dedicated form sections | no | no | no |
| Ports in template | `ports[]` in spec | no (Allocations at server-create) | no | `${ip}/${port}` vars |
| Mounts/volumes | `mounts[]` in form | no (Wings-managed) | no | `workingDirectory` only |
| Resource limits in template | `limits + caps` | limits at server-create, not egg | same | per-server, not template |
| Healthcheck / labels / devices | yes | no | no | no |

### 5.4 Install + start + post-start

|  | KS | Pterodactyl | Pelican | PufferPanel |
|---|---|---|---|---|
| Install steps | typed list (11 ops) + timeout/retries/ignore_errors | single bash `script` | single bash `script` | `operators[]` chain |
| Start command | `advanced.startup_command` + per-`Action.steps` | one `startup` string | one `startup` string | `run.program + arguments` |
| Stop | `stop_command + stop_mode + terminal_stop_on_exit` | `config.stop` string | same | `run.stop + stopCode` |
| Multiple runnable actions per template | yes (`actions[]` buttons, `run_on_create/cooldown/async/session/terminal_id`) | no (one startup) | no (one startup; Kitsune-style forks add addons out of tree) | `pre/post` operators only |
| Console binding | `terminal_id` stdin mirror + allow/block lists + timeout | console is the process output, no binding concept | same | console is the process output |
| Config-file parsers | no (pages edit files via actions instead) | yes (`config-files` find/replace) | yes | `writefile` operator only |

### 5.5 Variables

|  | KS `Env Variables` | Pterodactyl `variables[]` | PufferPanel `data{}` |
|---|---|---|---|
| Display types | `text/number/select/checkbox + options` | text only (+ `rules`) | `type` + `display` label |
| View/edit gates | `user_viewable/user_editable` | same names | `required` only |
| Validation | `required + rule` | `rules` (laravel rules) | `required` |
| Per-page vars | yes (`configure[] + config{}`) | no | no |

### 5.6 UI composition (biggest divergence)

KS `Pages[] + home_page + instance_controls` has no counterpart: Pterodactyl/Pelican/PufferPanel all render a fixed server view (`Console/Files/Databases/Backups/Network/Schedules/Users` or `Console/Files/Settings`). KS lets each template import any subset of the 30-row Instance Pages library (`home, files, terminal, metrics, processes, ports, network, sftp, env, automation, backups, settings, audit, minecraft-*`, …) with full `html/markdown/blocks + actions/sub_pages/components` payloads, choose the landing slug, and rename/reorder/disable per template. Nothing to migrate 1:1 — eggs/templates only cover install/start/vars.

## 6. Verdict (templates only)

- **KS wins**: widest per-template surface (11 tabs), 4 drivers in one form, typed install ops + timeout, multi-`actions[]` with console binding, `Pages + home_page + controls`, healthcheck/labels/devices/caps, file + URL + builder import, detail/stats/schedules views, owner scoping.
- **KS loses**: ecosystem (5 builtins vs ~100+ eggs vs ~35 puffer templates), no `Nest` grouping, no multi-image map (`docker_images{}`), no declarative `config-file` parsers, Docker-only authors must learn the `advanced` + `actions` split instead of one `startup` line.
- **Closest ancestor**: PufferPanel-style (`models/instance.go:5` says so) — flat template + operators — extended with VM drivers, actions, and pages. Pterodactyl/Pelican parity would mean adding Nest-like grouping, `docker_images{}` choice, and config-file parsers; PufferPanel parity would mean keeping raw-JSON editing as a first-class path.

## 7. Scores (`/100` per case, template system only)

Scored against what the `/templates` page (and its direct backend) can do today.
`KS` = this repo (§1), `Ptero` = Pterodactyl Egg, `Pelican` = Pelican Egg, `Puffer` = PufferPanel template.

| # | Case | KS | Ptero | Pelican | Puffer | Notes |
|---|------|----|-------|---------|--------|-------|
| 1 | List / browse / search / filter | 95 | 75 | 82 | 60 | KS: search + driver + category + sort + counts + limits on card. Pelican +7 over Ptero for modern skin, same model. Puffer: plain list. |
| 2 | Detail view | 96 | 70 | 78 | 40 | KS: usage (`total/running/stopped`), resources/network/env/install/actions/pages, raw JSON, invalid-spec warning. Others: egg form only / no detail. |
| 3 | Visual builder | 96 | 70 | 75 | 30 | KS: 11 tabs (§1.3). Ptero/Pelican: admin egg form. Puffer: raw JSON edit. |
| 4 | Import / export | 98 | 75 | 75 | 70 | KS: file (`multipart`) + URL (SSRF-guarded + preview) + `Download/Copy spec/ID`. Others: file/paste only. |
| 5 | Metadata / branding | 95 | 60 | 60 | 55 | KS: `icon_svg + color + category/type` (custom values allowed). Others: name/desc only (`type/display` on Puffer). |
| 6 | Environment in-template (ports/mounts/limits/caps) | 95 | 30 | 30 | 55 | KS: `ports[] + mounts[] + limits + caps` in form. Ptero/Pelican: allocations + limits at server-create, not in egg. Puffer: `${ip/port}` vars only. |
| 7 | Env variables | 92 | 75 | 75 | 65 | KS: `text/number/select/checkbox + options`, `viewable/editable`, `required + rule`, per-page `configure[]`. Ptero rules engine is strong, hence 75. |
| 8 | Install workflow | 90 | 85 | 85 | 75 | KS: 11 typed ops + `timeout/retries/ignore_errors`. Ptero/Pelican: full bash freedom (why 85). Puffer: 5 operators + CEL. |
| 9 | Startup / stop definition | 88 | 90 | 90 | 85 | Ptero/Pelican win on simplicity: one `startup` + `stop` line. KS splits across `advanced + actions`. |
| 10 | Multi-action system + terminal binding | 97 | 20 | 25 | 40 | KS: `actions[]` (cooldown/async/session/`run_on_create`) + `terminal_id` stdin mirror + allow/block + timeout. Others: one startup (`pre/post` on Puffer). |
| 11 | Driver coverage | 95 | 50 | 50 | 70 | KS: `docker/lxd/kvm/multipass` + dedicated sections. Puffer: host + docker (why 70). Ptero/Pelican: docker-only, mature yolks (why 50 not 0). |
| 12 | Advanced runtime + healthcheck/labels/devices | 96 | 15 | 15 | 10 | KS-only: `network_mode/restart/logging/ulimits` + `healthcheck` + `labels/devices`. |
| 13 | Pages / UI composition | 100 | 10 | 10 | 10 | KS-only: 30-row library + `home_page` + `controls`. Others: fixed server view. |
| 14 | Grouping / organization | 55 | 90 | 90 | 30 | Ptero/Pelican `Nests` win. KS has `category/type` tags + filter only. Puffer `type` unused. |
| 15 | Multi-image choice | 20 | 90 | 90 | 20 | Ptero/Pelican `docker_images{}` map win. KS/Puffer: one image per template. |
| 16 | Config-file parsers | 15 | 85 | 85 | 20 | Ptero/Pelican `config-files` find/replace win. KS does it via page actions instead. |
| 17 | Library ecosystem size | 25 | 100 | 95 | 60 | 5 builtins vs ~100+ eggs (Pelican inherits) vs ~35 puffer templates. |
| 18 | Governance (ownership, stats, validation, usage) | 95 | 50 | 55 | 35 | KS: `TEMPLATES_OWN/ALL`, `/templates/stats + /schedules`, instance-usage card, invalid-JSON + required checks. |

### Total

| Rank | Panel | Sum | Final `/100` (avg) |
|------|-------|-----|--------------------|
| **1** | **KS Panel** | **1,443 / 1,800** | **80** |
| 2 | Pelican | 1,165 / 1,800 | 65 |
| 3 | Pterodactyl | 1,140 / 1,800 | 63 |
| 4 | PufferPanel | 830 / 1,800 | 46 |

Reading: KS wins the authoring surface (cases 1–8, 10–13, 18) and loses the ecosystem/format-maturity cases (14–17). That matches §6: to close the gap, add Nest-like grouping, `docker_images{}` choice, and config-file parsers; competitors cannot match Pages/Actions/terminal-binding without a format break.

## 8. File map

- List: `panel/frontend/src/features/templates/pages/Templates.tsx`
- Detail: `panel/frontend/src/features/templates/pages/TemplateDetail.tsx`
- Form shell + Pages tab: `panel/frontend/src/features/templates/pages/TemplateForm.tsx`
- Sections: `panel/frontend/src/features/templates/components/TemplateForm/{TemplateRuntimeSection,TemplateLabelsDevicesSection,TemplatePagesSection,TemplateEnvironmentSection,TemplateActionsSection,TemplateInstallSection,TemplateSpecPreviewSection,TemplateEnvVariablesSection,TemplateHealthcheckSection,TemplateControlsSection}.tsx`
- Types/tabs: `panel/frontend/src/features/templates/types/templateForm.ts` (`TEMPLATE_TABS`, `emptyForm`)
- Serialize/parse: `panel/frontend/src/features/templates/utils/templateFormUtils.ts`
- Model: `panel/backend/internal/models/instance.go:7`
- Builtins: `panel/backend/internal/cli/templates_builtin.go`
- Deploy snapshot: `instance.config` (`models/instance.go:106`)
