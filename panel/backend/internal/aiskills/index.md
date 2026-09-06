# Skill index

Call `get_docs` with one topic to read its playbook. Fleet tools need the AI Chat Tools grant, writes need AI Chat Writes plus the area permission plus the global writes switch — every write returns a confirmation ticket the user approves before anything runs.

- `instances` — inspect, start/stop/restart, rename, reinstall, suspend, delete, deploy workloads.
- `templates` — blueprints (docker/lxd/kvm/multipass) plus their install-workflow steps: read numbered steps, add/remove/move one.
- `nodes` — edge machines: list, inspect, register, rename, delete.
- `instance_pages` — reusable docs/dashboard/config pages: list, inspect, create, edit, delete.
- `users` — accounts: create users (username, email, password, role).
- `updates` — panel self-update: check for a release, reinstall to latest (restarts the panel).
- `mods` — add-on packages (read-only knowledge).
- `applications` — user-installable service templates (read-only knowledge).
- `tickets` — support requests (read-only knowledge).
- `backups` — database/instance/file backups (read-only knowledge).
- `security` — firewall, DDoS, auth, sessions (read-only knowledge).
- `database` — engines, datamove, maintenance (read-only knowledge).
- `automation` — cron schedules and runs (read-only knowledge).
- `sftp` — per-instance file access (read-only knowledge).
- `themes` — global themes: list, publish, edit, delete.
- `notifications` — announcements to every inbox.
- `ai` — how this assistant itself works: tools, approvals, threads, limits.
