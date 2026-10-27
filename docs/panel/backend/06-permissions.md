# Permissions

Package: `panel/backend/internal/permissions/` (`engine.go`, `keys.go`).

## Model
- Permission keys are canonical strings stored in `permissions` table, seeded in `db.go SeedCore`.
- Area groups (`AreaGroups`) define regulatable areas: Users, Roles, Nodes, Templates, Instances,
  API Keys, Mods, Applications, Instance Pages, Tickets, Notifications, Settings, Themes, Account,
  AI Chat, Stacks, System.
- Each group has an umbrella key (e.g. `MANAGE_INSTANCES`) implying all actions, granular action
  keys (`*_VIEW/CREATE/EDIT/CONTROL/DELETE`), extra keys, sub-keys (instance power sub-actions),
  and ownership scope keys (`*_OWN`/`*_ALL`).

## Evaluation
- `requireUmbrellaOrAction(group, action)` middleware gates routes: allowed if holds umbrella OR
  granular action key.
- `engine.HasScope` decides Own vs All filtering inside handlers.
- Umbrella implies all actions + All scope (legacy roles keep working).

## Frontend mirror
`panel/frontend/src/shared/types/permissions.ts` must stay in sync with backend keys.

## Sub-capabilities
- Instance power: START/STOP/RESTART/KILL/REINSTALL/SUSPEND under INSTANCES_CONTROL.
- Theme verbs: USE/CREATE (local/global), EDIT, ASSIGN.
- Account profile: banner/about/accent/avatar symbol/upload.
- AI Chat: QA/TOOLS/WRITES/THREADS.
- Ownership scope per area.

## Keys reference
See `reference/permission-keys.md` (full list from keys.go).
