// Canonical permission keys – keep in sync with internal/permissions/keys.go
// and the seeded values in internal/db/db.go.
export const PermissionKey = {
  VIEW_INSTANCES: 'VIEW_INSTANCES',
  VIEW_ACCOUNT: 'VIEW_ACCOUNT',
  ACCESS_ADMIN_PANEL: 'ACCESS_ADMIN_PANEL',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  VIEW_SETTINGS: 'VIEW_SETTINGS',
  MANAGE_API_KEYS: 'MANAGE_API_KEYS',
  MANAGE_NODES: 'MANAGE_NODES',
  MANAGE_TEMPLATES: 'MANAGE_TEMPLATES',
  MANAGE_INSTANCES: 'MANAGE_INSTANCES',
  // MANAGE_THEMES is the umbrella "whole themes" capability: ticking it
  // enables the theme surface for a role. The keys below are the granular
  // sub-caps the Roles form renders nested under it (see internal/permissions/
  // keys.go); together they replace what MANAGE_THEMES used to blanket-cover.
  MANAGE_THEMES: 'MANAGE_THEMES',
  USE_LOCAL_THEMES: 'USE_LOCAL_THEMES',
  CREATE_LOCAL_THEMES: 'CREATE_LOCAL_THEMES',
  USE_GLOBAL_THEMES: 'USE_GLOBAL_THEMES',
  CREATE_GLOBAL_THEMES: 'CREATE_GLOBAL_THEMES',
  EDIT_THEMES: 'EDIT_THEMES',
  ASSIGN_THEMES: 'ASSIGN_THEMES',
  MANAGE_MODS: 'MANAGE_MODS',
  MANAGE_APPLICATIONS: 'MANAGE_APPLICATIONS',
  MANAGE_INSTANCE_PAGES: 'MANAGE_INSTANCE_PAGES',
  MANAGE_TICKETS: 'MANAGE_TICKETS',
  MANAGE_NOTIFICATIONS: 'MANAGE_NOTIFICATIONS',
  // Gates the "Updates" tab on the admin System page — checking for a newer
  // release + downloading + swapping + restarting the panel binary. Admin
  // gets it by default; other roles can be denied the self-update verb
  // without losing the rest of the system telemetry (ACCESS_ADMIN_PANEL).
  MANAGE_PANEL_UPDATE: 'MANAGE_PANEL_UPDATE',
  // AI Chat — floating bottom-right assistant (bot icon + drop-up chat panel).
  // MANAGE_AI_CHAT is the umbrella that implies both verbs so the seeded admin
  // keeps full control. AI_CHAT_USE opens the widget + sends messages; AI_CHAT_MANAGE
  // allows adding/editing providers, model ids and the system prompt.
  MANAGE_AI_CHAT: 'MANAGE_AI_CHAT',
  AI_CHAT_USE: 'AI_CHAT_USE',
  AI_CHAT_MANAGE: 'AI_CHAT_MANAGE',

  // ----------------------------------------------------------------------
  // Granular per-area CRUD keys (AREAS_ACTION: USERS_VIEW, NODES_CREATE, ...).
  // The MANAGE_* / VIEW_SETTINGS umbrellas above imply every action on their
  // area (see hasAreaAccess below); these new keys are the finer-grained
  // alternatives so a role can be limited to just one verb. Routes accept the
  // umbrella OR the action key — frontend guards use the same rule via
  // hasAreaAccess / hasPermissionAny.
  // ----------------------------------------------------------------------
  USERS_VIEW: 'USERS_VIEW',
  USERS_CREATE: 'USERS_CREATE',
  USERS_EDIT: 'USERS_EDIT',
  USERS_DELETE: 'USERS_DELETE',

  ROLES_VIEW: 'ROLES_VIEW',
  ROLES_CREATE: 'ROLES_CREATE',
  ROLES_EDIT: 'ROLES_EDIT',
  ROLES_DELETE: 'ROLES_DELETE',

  NODES_VIEW: 'NODES_VIEW',
  NODES_CREATE: 'NODES_CREATE',
  NODES_EDIT: 'NODES_EDIT',
  NODES_DELETE: 'NODES_DELETE',

  TEMPLATES_VIEW: 'TEMPLATES_VIEW',
  TEMPLATES_CREATE: 'TEMPLATES_CREATE',
  TEMPLATES_EDIT: 'TEMPLATES_EDIT',
  TEMPLATES_DELETE: 'TEMPLATES_DELETE',

  INSTANCES_VIEW: 'INSTANCES_VIEW',
  INSTANCES_CREATE: 'INSTANCES_CREATE',
  INSTANCES_EDIT: 'INSTANCES_EDIT',
  INSTANCES_DELETE: 'INSTANCES_DELETE',

  API_KEYS_VIEW: 'API_KEYS_VIEW',
  API_KEYS_CREATE: 'API_KEYS_CREATE',
  API_KEYS_EDIT: 'API_KEYS_EDIT',
  API_KEYS_DELETE: 'API_KEYS_DELETE',

  MODS_VIEW: 'MODS_VIEW',
  MODS_CREATE: 'MODS_CREATE',
  MODS_EDIT: 'MODS_EDIT',
  MODS_DELETE: 'MODS_DELETE',

  APPLICATIONS_VIEW: 'APPLICATIONS_VIEW',
  APPLICATIONS_CREATE: 'APPLICATIONS_CREATE',
  APPLICATIONS_EDIT: 'APPLICATIONS_EDIT',
  APPLICATIONS_DELETE: 'APPLICATIONS_DELETE',

  INSTANCE_PAGES_VIEW: 'INSTANCE_PAGES_VIEW',
  INSTANCE_PAGES_CREATE: 'INSTANCE_PAGES_CREATE',
  INSTANCE_PAGES_EDIT: 'INSTANCE_PAGES_EDIT',
  INSTANCE_PAGES_DELETE: 'INSTANCE_PAGES_DELETE',

  TICKETS_VIEW: 'TICKETS_VIEW',
  TICKETS_CREATE: 'TICKETS_CREATE',
  TICKETS_EDIT: 'TICKETS_EDIT',
  TICKETS_DELETE: 'TICKETS_DELETE',

  NOTIFICATIONS_VIEW: 'NOTIFICATIONS_VIEW',
  NOTIFICATIONS_CREATE: 'NOTIFICATIONS_CREATE',
  NOTIFICATIONS_EDIT: 'NOTIFICATIONS_EDIT',
  NOTIFICATIONS_DELETE: 'NOTIFICATIONS_DELETE',

  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_EDIT: 'SETTINGS_EDIT',

  // ----------------------------------------------------------------------
  // Account / profile customization sub-capabilities. VIEW_ACCOUNT is the
  // page-level umbrella that opens the Account page; the keys below are the
  // finer-grained toggles that decide WHICH customizations a role may
  // actually perform on its own profile. They are referenced by the Roles
  // form (rendered hierarchically under the Account umbrella) AND by the
  // authStore's hasPermissionAny checks the Account page uses to hide UI
  // the role lacks. The umbrella VIEW_ACCOUNT implies all of them so seeded
  // roles that carry only VIEW_ACCOUNT keep full customization.
  // ----------------------------------------------------------------------
  ACCOUNT_EDIT_BANNER: 'ACCOUNT_EDIT_BANNER',
  ACCOUNT_EDIT_ABOUT: 'ACCOUNT_EDIT_ABOUT',
  ACCOUNT_EDIT_ACCENT: 'ACCOUNT_EDIT_ACCENT',
  ACCOUNT_USE_AVATAR_SYMBOL: 'ACCOUNT_USE_AVATAR_SYMBOL',
  ACCOUNT_UPLOAD_AVATAR: 'ACCOUNT_UPLOAD_AVATAR',
} as const;

export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

// --------------------------------------------------------------------------
// Permission-area registry — the frontend mirror of the Go
// internal/permissions.AreaGroups source of truth. The Roles form derives the
// whole Permissions block from this single list, and the auth store's
// hasAreaAccess helper consults it so the umbrella-implies-all-actions
// contract stays consistent with the backend route gating.
// --------------------------------------------------------------------------

export type PermAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

/** Canonical order for sub-permission rendering in the Roles form. */
export const ALL_ACTIONS: PermAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];

/**
 * A regulatable area: its human label, the page-level umbrella key that grants
 * every action on the area, and the granular per-action keys. Areas that don't
 * expose the full CRUD set (Themes, Settings) leave entries out. `extraKeys`
 * carries verbs that don't fit the CRUD enum (Themes' USE/ASSIGN).
 */
export interface PermissionArea {
  /** Human label shown as the parent row in the Permissions block. */
  label: string;
  /** Page-level umbrella key; "" when an area has no umbrella. */
  umbrella: string;
  /** Granular per-action keys; leave a verb out if the area doesn't expose it. */
  keys: Partial<Record<PermAction, string>>;
  /** Extra non-CRUD keys for the area (Themes' USE/ASSIGN_THEMES). */
  extraKeys?: string[];
}

/**
 * The single source of truth for the regulatable areas. Mirrors
 * internal/permissions.AreaGroups. Order matters — it sets the render order
 * in the Permissions block.
 */
export const PERMISSION_AREAS: PermissionArea[] = [
  {
    label: 'Users',
    umbrella: PermissionKey.MANAGE_USERS,
    keys: {
      VIEW: PermissionKey.USERS_VIEW,
      CREATE: PermissionKey.USERS_CREATE,
      EDIT: PermissionKey.USERS_EDIT,
      DELETE: PermissionKey.USERS_DELETE,
    },
  },
  {
    label: 'Roles',
    umbrella: PermissionKey.MANAGE_ROLES,
    keys: {
      VIEW: PermissionKey.ROLES_VIEW,
      CREATE: PermissionKey.ROLES_CREATE,
      EDIT: PermissionKey.ROLES_EDIT,
      DELETE: PermissionKey.ROLES_DELETE,
    },
  },
  {
    label: 'Nodes',
    umbrella: PermissionKey.MANAGE_NODES,
    keys: {
      VIEW: PermissionKey.NODES_VIEW,
      CREATE: PermissionKey.NODES_CREATE,
      EDIT: PermissionKey.NODES_EDIT,
      DELETE: PermissionKey.NODES_DELETE,
    },
  },
  {
    label: 'Templates',
    umbrella: PermissionKey.MANAGE_TEMPLATES,
    keys: {
      VIEW: PermissionKey.TEMPLATES_VIEW,
      CREATE: PermissionKey.TEMPLATES_CREATE,
      EDIT: PermissionKey.TEMPLATES_EDIT,
      DELETE: PermissionKey.TEMPLATES_DELETE,
    },
  },
  {
    label: 'Instances',
    umbrella: PermissionKey.MANAGE_INSTANCES,
    keys: {
      VIEW: PermissionKey.INSTANCES_VIEW,
      CREATE: PermissionKey.INSTANCES_CREATE,
      EDIT: PermissionKey.INSTANCES_EDIT,
      DELETE: PermissionKey.INSTANCES_DELETE,
    },
  },
  {
    label: 'API Keys',
    umbrella: PermissionKey.MANAGE_API_KEYS,
    keys: {
      VIEW: PermissionKey.API_KEYS_VIEW,
      CREATE: PermissionKey.API_KEYS_CREATE,
      EDIT: PermissionKey.API_KEYS_EDIT,
      DELETE: PermissionKey.API_KEYS_DELETE,
    },
  },
  {
    label: 'Mods',
    umbrella: PermissionKey.MANAGE_MODS,
    keys: {
      VIEW: PermissionKey.MODS_VIEW,
      CREATE: PermissionKey.MODS_CREATE,
      EDIT: PermissionKey.MODS_EDIT,
      DELETE: PermissionKey.MODS_DELETE,
    },
  },
  {
    label: 'Applications',
    umbrella: PermissionKey.MANAGE_APPLICATIONS,
    keys: {
      VIEW: PermissionKey.APPLICATIONS_VIEW,
      CREATE: PermissionKey.APPLICATIONS_CREATE,
      EDIT: PermissionKey.APPLICATIONS_EDIT,
      DELETE: PermissionKey.APPLICATIONS_DELETE,
    },
  },
  {
    label: 'Instance Pages',
    umbrella: PermissionKey.MANAGE_INSTANCE_PAGES,
    keys: {
      VIEW: PermissionKey.INSTANCE_PAGES_VIEW,
      CREATE: PermissionKey.INSTANCE_PAGES_CREATE,
      EDIT: PermissionKey.INSTANCE_PAGES_EDIT,
      DELETE: PermissionKey.INSTANCE_PAGES_DELETE,
    },
  },
  {
    label: 'Tickets',
    umbrella: PermissionKey.MANAGE_TICKETS,
    keys: {
      VIEW: PermissionKey.TICKETS_VIEW,
      CREATE: PermissionKey.TICKETS_CREATE,
      EDIT: PermissionKey.TICKETS_EDIT,
      DELETE: PermissionKey.TICKETS_DELETE,
    },
  },
  {
    label: 'Notifications',
    umbrella: PermissionKey.MANAGE_NOTIFICATIONS,
    keys: {
      VIEW: PermissionKey.NOTIFICATIONS_VIEW,
      CREATE: PermissionKey.NOTIFICATIONS_CREATE,
      EDIT: PermissionKey.NOTIFICATIONS_EDIT,
      DELETE: PermissionKey.NOTIFICATIONS_DELETE,
    },
  },
  {
    label: 'Settings',
    umbrella: PermissionKey.VIEW_SETTINGS,
    keys: {
      VIEW: PermissionKey.SETTINGS_VIEW,
      EDIT: PermissionKey.SETTINGS_EDIT,
    },
  },
  {
    label: 'Themes',
    umbrella: PermissionKey.MANAGE_THEMES,
    keys: {
      // Themes maps CREATE/EDIT onto its own ID-verined styles.
      CREATE: PermissionKey.CREATE_GLOBAL_THEMES,
      EDIT: PermissionKey.EDIT_THEMES,
    },
    extraKeys: [
      PermissionKey.USE_LOCAL_THEMES,
      PermissionKey.CREATE_LOCAL_THEMES,
      PermissionKey.USE_GLOBAL_THEMES,
      PermissionKey.ASSIGN_THEMES,
    ],
  },
  // AI Chat — floating bottom-right assistant (bot icon + drop-up chat panel).
  // VIEW covers "can chat" (send messages + see chat text); EDIT covers
  // "can configure providers / model ids / system prompt".
  {
    label: 'AI Chat',
    umbrella: PermissionKey.MANAGE_AI_CHAT,
    keys: {
      VIEW: PermissionKey.AI_CHAT_USE,
      EDIT: PermissionKey.AI_CHAT_MANAGE,
    },
  },
  // Account / profile customization cluster. VIEW_ACCOUNT is the page-level
  // umbrella (opens the Account page). The Account area doesn't use the CRUD
  // verbs — self-service profile customization is split into the five
  // finer-grained sub-caps below, carried in extraKeys and rendered as sub
  // rows in the Permissions block just like the Themes cluster. The umbrella
  // VIEW_ACCOUNT implies every one of them so seeded roles that hold only the
  // umbrella keep full customization. The Account page consults
  // hasPermissionAny(umbrella, subCap) on each section so the UI matches the
  // backend route gate exactly.
  {
    label: 'Account',
    umbrella: PermissionKey.VIEW_ACCOUNT,
    keys: {},
    extraKeys: [
      PermissionKey.ACCOUNT_EDIT_BANNER,
      PermissionKey.ACCOUNT_EDIT_ABOUT,
      PermissionKey.ACCOUNT_EDIT_ACCENT,
      PermissionKey.ACCOUNT_USE_AVATAR_SYMBOL,
      PermissionKey.ACCOUNT_UPLOAD_AVATAR,
    ],
  },
];

/** All perm keys that belong to a regulatable area (umbrella + sub-keys), for quick membership tests. */
export const AREA_PERM_KEYS: Set<string> = new Set(
  PERMISSION_AREAS.flatMap((a) => [a.umbrella, ...Object.values(a.keys), ...(a.extraKeys ?? [])].filter(Boolean)),
);

/**
 * Returns the set of keys that grant the supplied action on an area: the
 * umbrella (if present) PLUS the granular action key (if the area exposes
 * one). Mirrors the backend Group.KeysForAction so the frontend's gate rule
 * ("umbrella implies all actions") matches the route rule exactly.
 */
export function keysForAreaAction(area: PermissionArea, action: PermAction): string[] {
  const out: string[] = [];
  if (area.umbrella) out.push(area.umbrella);
  const k = area.keys[action];
  if (k) out.push(k);
  return out;
}

/**
 * True if the supplied permission-key set holds ANY key that grants the
 * action on the area (umbrella OR the granular action key). Use this in UI
 * guards instead of bare `.includes(umbrella)` so a role carrying only
 * USERS_CREATE still passes a "can create users" gate.
 */
export function hasAreaAccess(
  permissionSet: ReadonlySet<string> | string[],
  area: PermissionArea,
  action: PermAction,
): boolean {
  const set = Array.isArray(permissionSet) ? new Set(permissionSet) : permissionSet;
  return keysForAreaAction(area, action).some((k) => set.has(k));
}

/** Convenience: returns true if the user holds ANY of the supplied keys. */
export function hasPermissionAny(
  permissionSet: ReadonlySet<string> | string[],
  ...keys: string[]
): boolean {
  const set = Array.isArray(permissionSet) ? new Set(permissionSet) : permissionSet;
  return keys.some((k) => set.has(k));
}
