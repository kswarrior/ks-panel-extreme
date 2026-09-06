# Themes skill

Global themes repaint the whole panel for everyone; personal browser themes need no permission and live outside this skill. Publishing, editing and deleting global themes is gated by MANAGE_THEMES (or CREATE/EDIT sub-grants), and every overwrite keeps an automatic revision snapshot so it stays reversible from the version history. A full authoring manual lives in the Theme Studio UI.

## Playbooks

- Browse: `list_themes` (id, name, description; builtins visible to all, own-scope otherwise limited to authored themes).
- Publish: `create_theme` with name + description + spec JSON object string (default {}). Needs CREATE_GLOBAL_THEMES.
- Edit: `edit_theme` with theme_id plus name/description/spec. A revision is snapshotted first. Needs EDIT_THEMES.
- Delete: `delete_theme` (pages using it fall back to default). Needs EDIT_THEMES.

Never invent theme IDs — list first. Every write needs AI Chat Writes and returns a confirmation ticket: summarise and ask for approval.
