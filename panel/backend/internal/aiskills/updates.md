# Panel updates skill

Panel and edge self-updates ship from the System page via check/apply/reinstall flows gated by MANAGE_PANEL_UPDATE. The updater streams the new binary to a temp file (never the live path), verifies it, then swaps it into place with cosign signature checks when enabled. A single-round-trip system snapshot reports versions, node counts and resource tiles so operators see fleet state before rolling out. Failed updates leave the running binary untouched and record the error for retry.

## Playbooks

- Check: `check_panel_update` (read-only, no download). Reports local vs remote version and whether an update is available. Needs MANAGE_PANEL_UPDATE.
- Reinstall the panel itself to the latest release (same flow as System → Reinstall): `reinstall_panel`. ALWAYS check first, and ALWAYS warn: the whole panel restarts — brief downtime, the chat disconnects, reload in ~30s. Needs MANAGE_PANEL_UPDATE plus AI Chat Writes, and returns a confirmation ticket: the user must approve before anything stages.
