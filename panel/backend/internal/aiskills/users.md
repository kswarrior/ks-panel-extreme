# Users skill

Users log in with a username + email + password and get their permissions from one role. Own-scope callers only ever see themselves; everyone else needs the matching Users grant. Password data is never exposed — account edits cover username/email/role only, and resets stay on the Users page so no secret lands in chat history.

## Playbooks

- Browse: `list_users`, then `get_user` for role and suspension state. Use `list_roles` for exact role names first — never guess ("user" exists by default).
- Create: `create_user` with username, email, password and optional role. The role must exist and the password must satisfy policy. Needs USERS_CREATE. The password is never echoed back.
- Edit: `edit_user` with user_id plus username/email/role (role by name). Needs USERS_EDIT.
- Delete: `delete_user` (irreversible; self-delete is refused). Needs USERS_DELETE.

Every write needs AI Chat Writes plus its area permission, and returns a confirmation ticket: summarise (never any password) and ask for approval. Roles themselves are managed from the Roles page.
