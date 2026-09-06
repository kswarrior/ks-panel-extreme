# Templates skill

Templates are reusable blueprints (docker, lxd, kvm or multipass) stored as a JSON spec: image, env vars with validation rules, install steps, actions and custom pages. Deploying a template onto a node creates an instance. Operators define them on the Templates page builder (Runtime, Install, Environment, Healthcheck, Pages, Actions, Spec Preview). Deleting a template never stops running instances — they just lose the back-link.

## Spec reference (validated server-side, fail-closed)

- `kind` is one of docker, lxd, kvm, multipass. `image` is the container/os image.
- `env[]`: each entry needs a POSIX `name`; optional `default`, `required`, `is_secret`, `description`, and `rule` (must be valid regex).
- `install[]`: the workflow that runs on first deploy/reinstall. Each step needs an `action` (shell, download, extract, move, write, chmod, mkdir, git_clone, pip_install, npm_install, http_check) plus action fields: shell/pip_install need `command`; download needs `url`+`filename`; extract needs `archive`+`dest`; move needs `from`+`to`; write/mkdir need `path`; chmod needs `path`+`command`; git_clone needs `url`+`dest`; http_check needs `url`.
- `actions[]`: instance buttons; each needs `id`+`name`, with `steps[]` using the same action set.

## Playbooks

- Inspect: `list_templates`, then `get_template` (`section=steps` for the numbered #1/#2/#3 workflow, `runtime` for startup command + action buttons, `description` for text, `summary` for overview). Never ask the user to paste the workflow — read it first, then propose.
- Create: `create_template` with name + kind (+ description/image/spec JSON, default {}). Needs TEMPLATES_CREATE.
- Edit fields (name/description/image/whole spec): `edit_template`. Needs TEMPLATES_EDIT.
- Edit the install workflow WITHOUT rewriting the whole spec: `edit_template_steps` with op remove|add|move. `remove` needs the 1-based step_number; `add` needs a `step` JSON object (+ optional 1-based `position`, omit to append); `move` needs step_number + position. Example: "remove #3 step" → get_template section=steps → edit_template_steps remove step_number 3 → approval. Needs TEMPLATES_EDIT.
- Autostart a service on container start: `set_template_command` with the exec-form JSON array, gated on files the install guarantees (example: ["sh","-c","while [ ! -f /mc/server.jar ] || [ ! -f /mc/eula.txt ]; do sleep 1; done; cd /mc && exec java -Xmx1500M -jar server.jar --nogui"]). Never gate on a deleted sentinel. Warn: the panel still stops the container once right after install (by design) — every later start then launches the service. Needs TEMPLATES_EDIT.
- Remove a manual action button (e.g. Start, once autostart replaces it): `remove_template_action` with the id from section=runtime. Needs TEMPLATES_EDIT. A full autostart conversion is three approvals across turns: set command → remove action → refresh the description (it likely documents the old button).
- Delete: `delete_template`. Needs TEMPLATES_DELETE. Running instances keep running.

Never invent template IDs — look them up first. Every write needs AI Chat Writes and returns a confirmation ticket: summarise and ask for approval.
