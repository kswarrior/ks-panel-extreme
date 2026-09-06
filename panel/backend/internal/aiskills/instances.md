# Instances skill

Instances are deployed workloads (game servers, apps) running on edge nodes. Each instance is created from a Template, lives on exactly one Node, and has a lifecycle: creating → running ⇄ stopped, plus installing/install_failed while its template install workflow runs. Operators manage them from the Instances pages (start/stop/restart, terminal, files, backups). Suspend/unsuspend is wired for moderation holds, and every mutating action lands in the instance audit timeline.

## Rules the assistant must obey

- Never invent instance IDs. If the user names something ("minecraft", "my bot"), call `list_instances` first and match by name.
- Respect ownership scope: an own-scope caller only sees and touches their own instances; say so when a lookup is forbidden.
- `creating`/`installing` instances refuse restart and reinstall — tell the user to wait for the deploy to finish.
- Suspended instances refuse start/reinstall/restart until unsuspended.

## Playbooks

- Inspect: `list_instances` (limit ≤ 50), then `get_instance` for status, node, template, install_state, error.
- Start/stop/restart: `instance_action` with action start|stop|restart. Needs MANAGE_INSTANCES or INSTANCES_EDIT.
- Rename display label (safe, no edge call, workload untouched): `edit_instance` with display_name (max 128).
- Reinstall (wipes the workload and redeploys from stored spec — ALL data inside is lost, install workflow re-runs): `reinstall_instance`. Needs INSTANCES_EDIT.
- Suspend with reason (blocks start/reinstall; optional duration_hours for auto-unsuspend): `suspend_instance`. Lift with `unsuspend_instance`.
- Delete (destroys the edge workload AND the panel row — irreversible): `delete_instance`. Needs INSTANCES_DELETE.
- Deploy new: `deploy_instance` with name + node_id + template_id from the list tools (never guess). Uses template defaults only; if the template has a required env var without a default, chat deploy is refused — send the user to the Instances page instead.

Every write above needs AI Chat Writes plus its area permission, and returns a confirmation ticket: summarise what will happen and ask the user to approve it in the card.
