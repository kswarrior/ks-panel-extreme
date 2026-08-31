package permissions

// Permission keys are the canonical page-level capability strings stored in the
// `permissions` table and used by PermissionMiddleware / frontend guards.
// Keep these in sync with the seed values in internal/db/db.go SeedCore.
const (
	ViewInstancesKey    = "VIEW_INSTANCES"
	ViewAccountKey      = "VIEW_ACCOUNT"
	AccessAdminPanelKey = "ACCESS_ADMIN_PANEL"
	ManageUsersKey      = "MANAGE_USERS"
	ManageRolesKey      = "MANAGE_ROLES"
	ViewSettingsKey     = "VIEW_SETTINGS"
	ManageApiKeysKey    = "MANAGE_API_KEYS"
	// ManageNodesKey gates the "Nodes" admin page so a moderator can be
	// blocked from registering/removing edges even if they have other admin
	// privileges.
	ManageNodesKey = "MANAGE_NODES"
	// ManageTemplatesKey gates the Templates admin page — operators define
	// reusable blueprints for docker/lxd/kvm/multipass instances here.
	ManageTemplatesKey = "MANAGE_TEMPLATES"
	// ManageInstancesKey gates the Instances admin page — deploy/start/stop
	// destroy workloads on edge nodes. Kept separate from MANAGE_NODES so a
	// role can drive instances without touching the edge registry.
	ManageInstancesKey = "MANAGE_INSTANCES"
	// ManageThemesKey gates creating / editing / deleting GLOBAL themes (the
	// server-side themes every user sees) and assigning them to areas/pages.
	// Personal/local themes (in a user's own browser) never need this — any
	// authenticated user can keep making those. MANAGE_THEMES is the gate that
	// lets an admin publish a theme FOR everyone.
	ManageThemesKey = "MANAGE_THEMES"
	// Granular theme sub-capabilities. MANAGE_THEMES is the umbrella "whole
	// themes" capability an admin ticks to enable the theme surface for a role;
	// the keys below are the finer-grained toggles that decide WHICH parts of
	// the theme system that role can touch. They are referenced by the Roles
	// form (rendered hierarchically under MANAGE_THEMES) and by the theme API
	// / Theme Studio UI guards so a role can be limited to, e.g., just picking
	// from already-built themes without being able to mint new ones.
	//
	// USE_LOCAL_THEMES     – hold personal (browser localStorage) themes and
	//   assign them to pages/areas for the user's own browser only.
	// CREATE_LOCAL_THEMES  – open the Theme Studio and mint a brand-new LOCAL
	//   (localStorage) theme from scratch.
	// USE_GLOBAL_THEMES    – assign an already-published GLOBAL theme to an
	//   area / page (applies for everyone who hasn't overridden it locally).
	// CREATE_GLOBAL_THEMES – publish a brand-new GLOBAL theme on the server
	//   so every user sees it (replaces the old blanket MANAGE_THEMES meaning).
	// EDIT_THEMES          – rename / re-spec existing themes in the studio.
	// ASSIGN_THEMES        – bind a theme to a page or an area (the "Apply to"
	//   action on the Themes page); can be granted without EDIT/CREATE so a
	//   moderator can pick from the available pool without authoring rights.
	UseLocalThemesKey    = "USE_LOCAL_THEMES"
	CreateLocalThemesKey = "CREATE_LOCAL_THEMES"
	UseGlobalThemesKey   = "USE_GLOBAL_THEMES"
	CreateGlobalThemesKey = "CREATE_GLOBAL_THEMES"
	EditThemesKey        = "EDIT_THEMES"
	AssignThemesKey      = "ASSIGN_THEMES"
	// ManageModsKey gates the Mods admin page. Mods are extensible add-on
	// packages (extra pages, tools, integrations…) that an admin uploads and
	// then activates. Activation is gated by an explicit per-requested-
	// capability grant: a mod declares what kind of resources it needs
	// (database read-only / read+write, terminal access, container / vm
	// control, …) and the panel refuses to activate it until the admin has
	// explicitly approved each one. MANAGE_MODS gates the whole upload /
	// edit / activate lifecycle.
	ManageModsKey = "MANAGE_MODS"

// ManageApplicationsKey gates the Applications admin page. Applications
// are admin-curated bot / service templates (Discord, WhatsApp, custom…)
// that users install under their own account. Activation is gated by an
// explicit per-capability grant: an application declares what resources
// it needs (network access, file storage, outbound http, ...) and the
// panel refuses to flip active=1 until the admin has approved every
// requested capability.
ManageApplicationsKey = "MANAGE_APPLICATIONS"

	// ManageTicketsKey gates the Tickets support system. Tickets are user-
	// opened requests (general, billing, technical, feature, bug, abuse)
	// triaged by staff. MANAGE_TICKETS is the umbrella that grants the
	// whole surface; the granular TICKETS_* verbs narrow it so a role can
	// be limited to e.g. just viewing or just creating tickets.
	ManageTicketsKey = "MANAGE_TICKETS"

	// ManageInstancePagesKey gates the Instance Pages admin page — operators define
	// reusable page definitions (custom HTML/markdown/blocks with icons) that can be
	// used across instance templates.
	ManageInstancePagesKey = "MANAGE_INSTANCE_PAGES"

	// ManagePanelUpdateKey gates the "Updates" tab on the admin System page.
	// Checking for a newer release + downloading + swapping + restarting the
	// panel binary are all guarded by this key so a role that can view the
	// System page (ACCESS_ADMIN_PANEL) but shouldn't be allowed to self-update
	// the running process can be carved out without losing the rest of the
	// system telemetry. Admin gets it by default via the seed-all-permissions
	// INSERT in db.go SeedCore.
	ManagePanelUpdateKey = "MANAGE_PANEL_UPDATE"

	// ManageNotificationsKey gates the powerful notification inbox — creating
	// broadcast announcements, clearing another user's inbox, and the admin
	// notification-ops surface. Every authenticated user can ALWAYS read +
	// mutate their OWN inbox (list / mark-read / delete); this key only
	// guards the cross-user ops (broadcast, send-to-user, admin list-all).
	ManageNotificationsKey = "MANAGE_NOTIFICATIONS"

	// ----------------------------------------------------------------------
	// Granular per-area CRUD capability keys.
	//
	// The MANAGE_* keys above are page-level UMBRELLAS: holding one unlocks
	// the whole area (view + create + edit + delete). The keys below are the
	// finer-grained, per-action alternatives so a role can be limited to,
	// e.g. "view users but never create / delete them". They use the naming
	// convention <RESOURCE>_<ACTION> (USERS_VIEW, USERS_CREATE, ...).
	//
	// Routes are gated by an OR of the umbrella and the matching action key,
	// so roles that still carry an umbrella keep working untouched: the
	// umbrella implies all actions for its area. This keeps backward
	// compatibility with seeded admin / moderator roles and lets new roles
	// be narrowed to specific verbs instead.
	//
	// The Group / ActionKey helpers below keep the route table and the
	// frontend Permissions block driven from one source of truth.
	// ----------------------------------------------------------------------

	UsersViewKey    = "USERS_VIEW"
	UsersCreateKey  = "USERS_CREATE"
	UsersEditKey    = "USERS_EDIT"
	UsersDeleteKey  = "USERS_DELETE"

	RolesViewKey    = "ROLES_VIEW"
	RolesCreateKey  = "ROLES_CREATE"
	RolesEditKey    = "ROLES_EDIT"
	RolesDeleteKey  = "ROLES_DELETE"

	NodesViewKey    = "NODES_VIEW"
	NodesCreateKey  = "NODES_CREATE"
	NodesEditKey    = "NODES_EDIT"
	NodesDeleteKey  = "NODES_DELETE"

	TemplatesViewKey   = "TEMPLATES_VIEW"
	TemplatesCreateKey = "TEMPLATES_CREATE"
	TemplatesEditKey   = "TEMPLATES_EDIT"
	TemplatesDeleteKey  = "TEMPLATES_DELETE"

	InstancesViewKey   = "INSTANCES_VIEW"
	InstancesCreateKey = "INSTANCES_CREATE"
	InstancesEditKey   = "INSTANCES_EDIT" // start / stop
	InstancesDeleteKey = "INSTANCES_DELETE"

	ApiKeysViewKey   = "API_KEYS_VIEW"
	ApiKeysCreateKey = "API_KEYS_CREATE"
	ApiKeysEditKey   = "API_KEYS_EDIT"
	ApiKeysDeleteKey = "API_KEYS_DELETE"

	ModsViewKey   = "MODS_VIEW"
	ModsCreateKey = "MODS_CREATE"
	ModsEditKey   = "MODS_EDIT" // upload / edit / activate / grants
	ModsDeleteKey = "MODS_DELETE"

ApplicationsViewKey   = "APPLICATIONS_VIEW"
ApplicationsCreateKey = "APPLICATIONS_CREATE"
ApplicationsEditKey   = "APPLICATIONS_EDIT"
ApplicationsDeleteKey = "APPLICATIONS_DELETE"

	InstancePagesViewKey   = "INSTANCE_PAGES_VIEW"
	InstancePagesCreateKey = "INSTANCE_PAGES_CREATE"
	InstancePagesEditKey   = "INSTANCE_PAGES_EDIT"
	InstancePagesDeleteKey = "INSTANCE_PAGES_DELETE"

	TicketsViewKey   = "TICKETS_VIEW"
	TicketsCreateKey = "TICKETS_CREATE"
	TicketsEditKey   = "TICKETS_EDIT"
	TicketsDeleteKey = "TICKETS_DELETE"

	NotificationsViewKey   = "NOTIFICATIONS_VIEW"
	NotificationsCreateKey = "NOTIFICATIONS_CREATE"
	NotificationsEditKey   = "NOTIFICATIONS_EDIT"
	NotificationsDeleteKey = "NOTIFICATIONS_DELETE"

	SettingsViewKey  = "SETTINGS_VIEW"
	SettingsEditKey  = "SETTINGS_EDIT"

	// ----------------------------------------------------------------------
	// Account / profile customization sub-capabilities. VIEW_ACCOUNT is the
	// page-level umbrella that opens the Account page; the keys below are the
	// finer-grained toggles that decide WHICH customizations a role can
	// actually perform on its own profile. They are referenced by the Roles
	// form (rendered hierarchically under the Account umbrella) AND by the
	// /api/me/profile + /api/me/avatar + /api/me/banner route gates so a role
	// can be limited to, e.g., just uploading an avatar without touching the
	// about-me text or accent colour. The umbrella VIEW_ACCOUNT implies all
	// of them so existing seeded roles still get full customization.
	AccountEditBannerKey      = "ACCOUNT_EDIT_BANNER"      // upload / replace / remove the profile banner image
	AccountEditAboutKey       = "ACCOUNT_EDIT_ABOUT"       // edit the "about me" bio + display name + pronouns
	AccountEditAccentKey      = "ACCOUNT_EDIT_ACCENT"      // change the profile accent colour (also used by banner fallback)
	AccountUseAvatarSymbolKey = "ACCOUNT_USE_AVATAR_SYMBOL" // pick a default avatar symbol when no uploaded picture
	AccountUploadAvatarKey    = "ACCOUNT_UPLOAD_AVATAR"    // upload / replace / remove the avatar image

	// ----------------------------------------------------------------------
	// Ownership-scope keys — Own vs All per area.
	//
	// Each regulatable area gains two scope keys:
	//   <AREA>_OWN – the holder may act only on resources they own (or on
	//     themselves, for Users/Users-like areas).
	//   <AREA>_ALL – the holder may act on ANY resource in the area.
	//
	// The route layer still gates on the umbrella OR the granular action key
	// (KeysForAction). The scope keys are evaluated INSIDE the handler to
	// decide whether to filter to owned rows or to allow cross-user mutation.
	// A role that holds the area umbrella or an action key plus the Own scope
	// is restricted to self-owned rows; a role that holds the same plus the
	// All scope (or the umbrella, which conceptually implies All) may touch
	// any row.  When neither scope is granted the handler falls back to the
	// legacy behaviour (treat as All) so existing seeded roles keep working.
	// ----------------------------------------------------------------------

	UsersOwnKey = "USERS_OWN"
	UsersAllKey = "USERS_ALL"

	RolesOwnKey = "ROLES_OWN"
	RolesAllKey = "ROLES_ALL"

	NodesOwnKey = "NODES_OWN"
	NodesAllKey = "NODES_ALL"

	TemplatesOwnKey = "TEMPLATES_OWN"
	TemplatesAllKey = "TEMPLATES_ALL"

	InstancesOwnKey = "INSTANCES_OWN"
	InstancesAllKey = "INSTANCES_ALL"

	ApiKeysOwnKey = "API_KEYS_OWN"
	ApiKeysAllKey = "API_KEYS_ALL"

	ModsOwnKey = "MODS_OWN"
	ModsAllKey = "MODS_ALL"

	ApplicationsOwnKey = "APPLICATIONS_OWN"
	ApplicationsAllKey = "APPLICATIONS_ALL"

	InstancePagesOwnKey = "INSTANCE_PAGES_OWN"
	InstancePagesAllKey = "INSTANCE_PAGES_ALL"

	TicketsOwnKey = "TICKETS_OWN"
	TicketsAllKey = "TICKETS_ALL"

	NotificationsOwnKey = "NOTIFICATIONS_OWN"
	NotificationsAllKey = "NOTIFICATIONS_ALL"

	SettingsOwnKey = "SETTINGS_OWN"
	SettingsAllKey = "SETTINGS_ALL"

	ThemesOwnKey = "THEMES_OWN"
	ThemesAllKey = "THEMES_ALL"

	AccountOwnKey = "ACCOUNT_OWN"
	AccountAllKey = "ACCOUNT_ALL"
)

// Action enumerates the granular CRUD verbs every regulatable area exposes.
// It mirrors the user-facing labels in the Roles form Permissions block.
type Action string

const (
	ActionView   Action = "VIEW"
	ActionCreate Action = "CREATE"
	ActionEdit   Action = "EDIT"
	ActionDelete Action = "DELETE"
)

// AllActions is the canonical order the Roles form renders sub-permissions in.
var AllActions = []Action{ActionView, ActionCreate, ActionEdit, ActionDelete}

// Group describes a regulatable area: its human label, the umbrella MANAGE_*
// (or VIEW_*) key that grants every action on the area, and the granular
// per-action keys. Keeping this as a single slice lets the route table and
// the frontend derive everything from the same source of truth.
type Group struct {
	// Label is the human-readable area name shown as the parent in the
	// Permissions block ("Users", "Nodes", "Themes", ...).
	Label string
	// Umbrella is the page-level key that implies every action on the area.
	// May be "" when an area has no umbrella.
	Umbrella string
	// Keys maps each granular action to its permission key. Areas that
	// don't expose the full CRUD set (Themes, Settings) leave entries out.
	Keys map[Action]string
	// ExtraKeys lists any non-CRUD per-area keys that don't fit the
	// Action enum. Used by the Themes cluster for its USE_*/ASSIGN_THEMES
	// verbs. Rendered as additional sub-rows after the CRUD sub-rows.
	ExtraKeys []string
	// OwnKey / AllKey are the ownership-scope keys for the area:
	//   OwnKey – may act only on resources they own (or on themselves)
	//   AllKey – may act on ANY resource in the area
	OwnKey string
	AllKey string
}

// AreaGroups is the single source of truth for the regulatable CRUD areas
// whose per-action keys AREAS_ACTION-style (USERS_VIEW, NODES_CREATE, ...).
// The Themes cluster is appended last (see ThemeGroup) so the Roles form can
// render it with its own verb set (USE/CREATE/EDIT/ASSIGN) in the same block.
var AreaGroups = []Group{
	{Label: "Users", Umbrella: ManageUsersKey, Keys: map[Action]string{
		ActionView: UsersViewKey, ActionCreate: UsersCreateKey, ActionEdit: UsersEditKey, ActionDelete: UsersDeleteKey,
	}, OwnKey: UsersOwnKey, AllKey: UsersAllKey},
	{Label: "Roles", Umbrella: ManageRolesKey, Keys: map[Action]string{
		ActionView: RolesViewKey, ActionCreate: RolesCreateKey, ActionEdit: RolesEditKey, ActionDelete: RolesDeleteKey,
	}, OwnKey: RolesOwnKey, AllKey: RolesAllKey},
	{Label: "Nodes", Umbrella: ManageNodesKey, Keys: map[Action]string{
		ActionView: NodesViewKey, ActionCreate: NodesCreateKey, ActionEdit: NodesEditKey, ActionDelete: NodesDeleteKey,
	}, OwnKey: NodesOwnKey, AllKey: NodesAllKey},
	{Label: "Templates", Umbrella: ManageTemplatesKey, Keys: map[Action]string{
		ActionView: TemplatesViewKey, ActionCreate: TemplatesCreateKey, ActionEdit: TemplatesEditKey, ActionDelete: TemplatesDeleteKey,
	}, OwnKey: TemplatesOwnKey, AllKey: TemplatesAllKey},
	{Label: "Instances", Umbrella: ManageInstancesKey, Keys: map[Action]string{
		ActionView: InstancesViewKey, ActionCreate: InstancesCreateKey, ActionEdit: InstancesEditKey, ActionDelete: InstancesDeleteKey,
	}, OwnKey: InstancesOwnKey, AllKey: InstancesAllKey},
	{Label: "API Keys", Umbrella: ManageApiKeysKey, Keys: map[Action]string{
		ActionView: ApiKeysViewKey, ActionCreate: ApiKeysCreateKey, ActionEdit: ApiKeysEditKey, ActionDelete: ApiKeysDeleteKey,
	}, OwnKey: ApiKeysOwnKey, AllKey: ApiKeysAllKey},
	{Label: "Mods", Umbrella: ManageModsKey, Keys: map[Action]string{
		ActionView: ModsViewKey, ActionCreate: ModsCreateKey, ActionEdit: ModsEditKey, ActionDelete: ModsDeleteKey,
	}, OwnKey: ModsOwnKey, AllKey: ModsAllKey},
	{Label: "Applications", Umbrella: ManageApplicationsKey, Keys: map[Action]string{
		ActionView: ApplicationsViewKey, ActionCreate: ApplicationsCreateKey, ActionEdit: ApplicationsEditKey, ActionDelete: ApplicationsDeleteKey,
	}, OwnKey: ApplicationsOwnKey, AllKey: ApplicationsAllKey},
	{Label: "Instance Pages", Umbrella: ManageInstancePagesKey, Keys: map[Action]string{
		ActionView: InstancePagesViewKey, ActionCreate: InstancePagesCreateKey, ActionEdit: InstancePagesEditKey, ActionDelete: InstancePagesDeleteKey,
	}, OwnKey: InstancePagesOwnKey, AllKey: InstancePagesAllKey},
	{Label: "Tickets", Umbrella: ManageTicketsKey, Keys: map[Action]string{
		ActionView: TicketsViewKey, ActionCreate: TicketsCreateKey, ActionEdit: TicketsEditKey, ActionDelete: TicketsDeleteKey,
	}, OwnKey: TicketsOwnKey, AllKey: TicketsAllKey},
	{Label: "Notifications", Umbrella: ManageNotificationsKey, Keys: map[Action]string{
		ActionView: NotificationsViewKey, ActionCreate: NotificationsCreateKey, ActionEdit: NotificationsEditKey, ActionDelete: NotificationsDeleteKey,
	}, OwnKey: NotificationsOwnKey, AllKey: NotificationsAllKey},
	{Label: "Settings", Umbrella: ViewSettingsKey, Keys: map[Action]string{
		ActionView: SettingsViewKey, ActionEdit: SettingsEditKey,
	}, OwnKey: SettingsOwnKey, AllKey: SettingsAllKey},
	// Themes cluster: MANAGE_THEMES is the umbrella (ticking it enables the
	// theme surface for a role). CREATE/EDIT map to the matching CRUD verbs
	// and the USE/ASSIGN verbs are carried in ExtraKeys — keeping the
	// long-standing meanings documented at the top of this file intact.
	{Label: "Themes", Umbrella: ManageThemesKey, Keys: map[Action]string{
		ActionCreate: CreateGlobalThemesKey, // publish global themes
		ActionEdit:   EditThemesKey,        // rename / re-spec themes
	}, ExtraKeys: []string{
		UseLocalThemesKey,
		CreateLocalThemesKey,
		UseGlobalThemesKey,
		AssignThemesKey,
	}, OwnKey: ThemesOwnKey, AllKey: ThemesAllKey},
	// Account / profile customization cluster: VIEW_ACCOUNT is the page-level
	// umbrella (opens the Account page). It doesn't use the CRUD verbs — self
	// service profile customization is split into the five finer-grained
	// sub-caps below, carried in ExtraKeys. The umbrella VIEW_ACCOUNT implies
	// every one of them so seeded roles that carry only VIEW_ACCOUNT keep full
	// customization. The route layer (server.go) ORs the umbrella + the
	// matching sub-cap on each /api/me/profile* write route so a narrowed role
	// (e.g. only ACCOUNT_EDIT_BANNER) can still write just the banner.
	{Label: "Account", Umbrella: ViewAccountKey, ExtraKeys: []string{
		AccountEditBannerKey,
		AccountEditAboutKey,
		AccountEditAccentKey,
		AccountUseAvatarSymbolKey,
		AccountUploadAvatarKey,
	}, OwnKey: AccountOwnKey, AllKey: AccountAllKey},
}

// AllGroups is the ordered slice of every regulatable area. It is the union of
// AreaGroups (CRUD areas) plus the Themes cluster, ordered so the Roles form's
// Permissions block can iterate a single list. Ordered for stable rendering.
func AllGroups() []Group { return AreaGroups }

// GroupByLabel returns the Group with the given label, or nil if not found.
func GroupByLabel(label string) *Group {
	for i := range AreaGroups {
		if AreaGroups[i].Label == label {
			return &AreaGroups[i]
		}
	}
	return nil
}

// ScopeKeys returns the ownership-scope keys for the area: Own and All.
// Empty strings are omitted.
func (g Group) ScopeKeys() []string {
	var out []string
	if g.OwnKey != "" {
		out = append(out, g.OwnKey)
	}
	if g.AllKey != "" {
		out = append(out, g.AllKey)
	}
	return out
}

// AllKeys returns every key that belongs to the group: umbrella + CRUD +
// extras + scope (Own/All). Used by the Roles form parent checkbox to decide
// whether the whole group is on/off.
func (g Group) AllKeys() []string {
	var out []string
	if g.Umbrella != "" {
		out = append(out, g.Umbrella)
	}
	for _, k := range g.Keys {
		if k != "" {
			out = append(out, k)
		}
	}
	out = append(out, g.ExtraKeys...)
	out = append(out, g.ScopeKeys()...)
	return out
}

// UmbrellaForAction returns the set of permission keys that grant the given
// action on the supplied area group: the umbrella (if present) plus the
// granular action key (if the area exposes one). Used by route gating so a
// role is allowed in when it holds EITHER the umbrella OR the specific verb.
func (g Group) KeysForAction(action Action) []string {
	var out []string
	if g.Umbrella != "" {
		out = append(out, g.Umbrella)
	}
	if k, ok := g.Keys[action]; ok {
		out = append(out, k)
	}
	return out
}

