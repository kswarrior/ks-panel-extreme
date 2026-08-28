package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/ui"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter builds the HTTP router with API routes and SPA fallback.
func NewRouter() http.Handler {
	// Per-area permission groups (umbrella + granular CRUD verbs). Imported
	// here so the route table reads as "gate this action on this area" — the
	// umbrella key (MANAGE_USERS ...) stays the fallback so legacy roles that
	// carry only the umbrella keep working alongside the new per-action keys.
	usersG := permissions.AreaGroups[0]
	rolesG := permissions.AreaGroups[1]
	nodesG := permissions.AreaGroups[2]
	templatesG := permissions.AreaGroups[3]
	instancesG := permissions.AreaGroups[4]
	apikeysG := permissions.AreaGroups[5]
	modsG := permissions.AreaGroups[6]
	appsG := permissions.AreaGroups[7]
	instancePagesG := permissions.AreaGroups[8]
	settingsG := permissions.AreaGroups[9]
	themesG := permissions.AreaGroups[10]

	// Boot the Mod Engine v2 runtime: spin up a Goja VM for every active mod
	// so its slots + hooks are live before the first request lands. A per-mod
	// failure is logged by the engine and never aborts the panel.
	handlers.BootModEngine(context.Background())

	// Once-per-process wiring: let the settings repository know how to
	// build public logo URLs for the JSON snapshot it returns. We point it
	// at the same constant string the SPA-fallback uses; keeping it
	// constant avoids surprising URL changes when a reverse proxy sits in
	// front of the panel.
	repository.SetLogoURLBuilder(func(_ repository.PanelLogo) string {
		return "/api/settings/panel-logo"
	})

	r := chi.NewRouter()

	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	// Normalize trailing slashes: a request to /api/themes (no slash)
	// matches the route mounted at /api/themes/ via r.Post("/", ...).
	// Without this, chi v5 returns 404 for the bare form, which silently broke
	// global theme creation (the frontend POSTs /api/themes).
	r.Use(middleware.StripSlashes)

	// Allow cross‑origin requests (required when exposing the app via tunnels like localtunnel).
	// Using AllowedOrigins: ["*"] together with AllowCredentials: true is forbidden by the
	// Fetch spec (browsers reject "Access-Control-Allow-Origin: *" on credentialed requests),
	// which would make every login from a tunnel origin fail with a CORS / network error in
	// the browser (the SPA shows "Invalid credentials" even though the API returned 200).
	//
	// AllowOriginFunc echoes the request's Origin back, so the response carries a concrete
	// origin string instead of the wildcard "*" – this is the spec-compliant way to allow any
	// origin while still sending cookies (HttpOnly session_id).
	// In production, we validate the origin against a configured allowlist.
	c := cors.New(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			// Allow any origin in development
			if isDevelopment() {
				return true
			}
			// In production, validate against allowed origins from settings
			return isAllowedOrigin(origin)
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           86400,
	})
	r.Use(c.Handler)

	// Security telemetry middleware — records one security_requests row per
	// inbound request so the Security admin page (admin/security) can render
	// RPS / top IPs / blocked / errors / bandwidth / login attempts / etc.
	// The wrapper spawns the INSERT in its own goroutine so a logging
	// failure never blocks or breaks the response it observed.
	r.Use(SecurityMiddleware)

	// Request body size limit to prevent DoS attacks. Reads the
	// operator-configured cap (Firewall tab → Request Size Limit) from
	// the live security state instead of a hardcoded constant.
	r.Use(DynamicMaxBodySize())

	// API routes – set JSON content type for these only
	r.Group(func(r chi.Router) {
		r.Use(middleware.SetHeader("Content-Type", "application/json"))
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"status":"ok"}`)) })
		r.Post("/api/auth/login", handlers.LoginHandler)
		// Switch-login: same as login but does NOT set the session cookie so
		// the SPA's multi-account switcher can add a second account without
		// clobbering the primary cookie. The token comes back in the body.
		r.Post("/api/auth/switch-login", handlers.SwitchLoginHandler)
		r.Post("/api/auth/logout", handlers.LogoutHandler)

		// Self-service registration + email verification flow. Each lives behind
		// no auth gate (the user has no session cookie yet); the handlers consult
		// the register_allow / verify_required settings themselves so a disabled
		// toggle returns 403 and a verify-not-required install short-circuits.
		r.Post("/api/auth/register", handlers.RegisterHandler)
		r.Post("/api/auth/send-verify", handlers.SendVerifyCodeHandler)
		r.Post("/api/auth/verify-email", handlers.VerifyEmailHandler)
		// Public read of the register_allow / verify_required flags so the login
		// page can decide whether to render the "Create new account" link without
		// needing to be authenticated.
		r.Get("/api/auth/flags", handlers.PublicAuthFlagsHandler)
		// Mint/return the long-lived device id cookie used by the registration
		// flow to enforce the per-device account limit. Public (no auth) since
		// the device id isn't an authentication secret.
		r.Get("/api/auth/device-id", handlers.DeviceIdHandler)

		// OAuth "Sign in with ..." flows. All public: the browser carries no
		// session yet. /providers tells the login page which buttons to
		// render; /start 302s to the provider; /callback completes the code
		// exchange and issues the standard session cookie. The callback also
		// accepts POST because Apple answers form_post.
		r.Get("/api/auth/oauth/providers", handlers.OAuthPublicProvidersHandler)
		r.Get("/api/auth/oauth/{provider}/start", handlers.OAuthStartHandler)
		r.Get("/api/auth/oauth/{provider}/callback", handlers.OAuthCallbackHandler)
		r.Post("/api/auth/oauth/{provider}/callback", handlers.OAuthCallbackHandler)

		// Public brand endpoint used by the login page (and the in-app layout
		// header) so they can render the configured panel name without needing
		// to be authenticated.
		r.Get("/api/settings/panel-name", handlers.PanelNameHandler)

		// Public theme store read: returns all GLOBAL themes + their scope
		// bindings. Authoring+assignment remain MANAGE_THEMES-gated below,
		// but SEEING the assigned theme is part of just using the panel — incl.
		// for logged-out visitors landing on the Login page (their browser
		// needs to resolve the auth-area theme without an auth round-trip).
		// This carries only appearance specs (no secrets), so it's safe. The
		// same data is also inlined into index.html (window.__KSPANEL_BOOTSTRAP__.theme)
		// so the very first paint is themed before JS runs; this endpoint is
		// the reconciliation path the SPA hits after mount.
		r.Get("/api/themes", handlers.ListThemesHandler)
		// Public logo stream – same auth model as panel-name. It's a small
		// image streamed from disk, served behind no auth gate so the
		// /auth/login page can render before the user has a session.
		r.Get("/api/settings/panel-logo", handlers.PanelLogoHandler)

		// Public user profile + image streams. Anyone can read a user's
		// profile (email is redacted server-side) and render their avatar /
		// banner — the page paints before login (e.g. future public profile
		// page) and the images carry no secret. 204 when none is configured
		// so the SPA's <img onerror> stays quiet.
		r.Get("/api/users/{id}/profile", handlers.GetUserProfileHandler)
		r.Get("/api/users/{id}/avatar", handlers.UserAvatarImageHandler)
		r.Get("/api/users/{id}/banner", handlers.UserBannerImageHandler)

		// Public edge metrics ingest. ksedge authenticates with its edge token in
		// the body, so this must NOT sit behind the session-cookie auth middleware.
		r.Post("/api/nodes/heartbeat", handlers.HeartbeatIngestHandler)
	})

	// Protected API group
	r.Group(func(r chi.Router) {
		// Authentication middleware – extracts user ID from session cookie and stores in context
		r.Use(AuthMiddleware)
		r.Use(middleware.SetHeader("Content-Type", "application/json"))

		r.Get("/api/me", handlers.MeHandler) // returns current user & permissions
		r.Put("/api/me/change-username", handlers.ChangeUsernameHandler)
		r.Put("/api/me/change-password", handlers.ChangePasswordHandler)
		// Self-service "make my account safe" — the user picks which
		// authority providers their own login must satisfy (within the
		// admin-enabled ∩ role-allowed intersection) and HOW MANY of
		// the enabled ones a sign-in requires. Sits under plain
		// AuthMiddleware (no role gate): every authenticated user may
		// harden their OWN account.
		r.Get("/api/me/auth", handlers.MeAuthHandler)
		r.Put("/api/me/auth", handlers.MeAuthHandler)

		// Self-service Discord-like profile. The scalar fields + social
		// links flow through PUT (JSON); avatar + banner uploads use
		// multipart on dedicated endpoints so the JSON path stays lean.
		//
		// Permission model: VIEW_ACCOUNT (Account umbrella) implies every
		// customization sub-cap, so a role holding only the umbrella keeps
		// full personalization (that's the seeded admin/moderator/user
		// behaviour). To narrow a role — e.g. let it only upload a banner
		// without touching the about-me text — grant the matching sub-cap
		// (ACCOUNT_EDIT_BANNER / ACCOUNT_EDIT_ABOUT / ACCOUNT_EDIT_ACCENT /
		// ACCOUNT_USE_AVATAR_SYMBOL / ACCOUNT_UPLOAD_AVATAR) instead of the
		// umbrella. Each route ORs the umbrella with the sub-cap it backs;
		// the PUT /api/me/profile route ORs the umbrella with ALL five
		// sub-caps (it's the JSON write path for every scalar field) and the
		// handler additionally does field-level enforcement so a role may
		// NOT escalate a partial grant into a full profile rewrite (e.g. a
		// role with only ACCOUNT_EDIT_BANNER cannot ship a bio change on
		// the same PUT — the handler rejects it with 403).
		r.Get("/api/me/profile", handlers.GetMyProfileHandler)
		r.With(requireAnyPermission(
			permissions.ViewAccountKey,
			permissions.AccountEditBannerKey,
			permissions.AccountEditAboutKey,
			permissions.AccountEditAccentKey,
			permissions.AccountUseAvatarSymbolKey,
			permissions.AccountUploadAvatarKey,
		)).Put("/api/me/profile", handlers.UpdateMyProfileHandler)
		r.With(requireAnyPermission(
			permissions.ViewAccountKey,
			permissions.AccountUploadAvatarKey,
		)).Post("/api/me/avatar", handlers.UploadAvatarHandler)
		r.With(requireAnyPermission(
			permissions.ViewAccountKey,
			permissions.AccountUploadAvatarKey,
		)).Delete("/api/me/avatar", handlers.DeleteAvatarHandler)
		r.With(requireAnyPermission(
			permissions.ViewAccountKey,
			permissions.AccountEditBannerKey,
		)).Post("/api/me/banner", handlers.UploadBannerHandler)
		r.With(requireAnyPermission(
			permissions.ViewAccountKey,
			permissions.AccountEditBannerKey,
		)).Delete("/api/me/banner", handlers.DeleteBannerHandler)

		// Themes: the public read path used to live here behind plain
		// AuthMiddleware. It now sits in the PUBLIC group above (alongside
		// the brand endpoints) so logged-out visitors landing on /auth/*
		// can also resolve their route's theme. The admin authoring /
		// assignment endpoints below remain MANAGE_THEMES-gated; SEEING the
		// assigned theme is part of just using the panel.
		//  -> r.Get("/api/themes", handlers.ListThemesHandler)   // (moved up)

		// API Keys (managed by every authenticated user for themselves).
		// We use /api/me/api-keys so admins inherit this without an extra
		// permission gate – it's their own key, exposed in /account area.
		r.Get("/api/me/api-keys", handlers.ListApiKeysHandler)
		r.Post("/api/me/api-keys", handlers.CreateApiKeyHandler)
		r.Put("/api/me/api-keys/{id}", handlers.UpdateApiKeyHandler)
		r.Delete("/api/me/api-keys/{id}", handlers.DeleteApiKeyHandler)

		// Self-service Instances: every authenticated user (VIEW_INSTANCES)
		// sees only the instances they own. Admins may additionally manage
		// the whole fleet under /api/instances.
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/me/instances", handlers.ListMyInstancesHandler)

		// Admin: users management. MANAGE_USERS (umbrella) implies every
		// action on this area, so each route accepts the umbrella OR the
		// matching USERS_* verb — a role can be narrowed to just view /
		// just create without losing access to the umbrella admin role.
		r.Route("/api/users", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionView)).Get("/", handlers.ListUsersHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionCreate)).Post("/", handlers.CreateUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteUserHandler)
		})

		// Admin: roles management (same umbrella-or-action pattern).
		r.Route("/api/roles", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(rolesG, permissions.ActionView)).Get("/", handlers.ListRolesHandler)
			r.With(requireUmbrellaOrAction(rolesG, permissions.ActionCreate)).Post("/", handlers.CreateRoleHandler)
			r.With(requireUmbrellaOrAction(rolesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateRoleHandler)
			r.With(requireUmbrellaOrAction(rolesG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteRoleHandler)
		})

		// Admin: permissions listing (the role editor needs it). Gated by
		// the Roles umbrella-or-view so a narrowed "ROLES_VIEW" role can
		// still build the Permissions block on roles/new.
		r.With(requireUmbrellaOrAction(rolesG, permissions.ActionView)).Get("/api/permissions", handlers.ListPermissionsHandler)

		// Admin: authority-provider inventory the Roles form renders its
		// "allowed authorities" picker from. Returns only the admin-
		// enabled provider ids + labels + kind so the picker derives its
		// option list from one source of truth (the AuthorityConfig the
		// Authority page edits). Same Roles umbrella-or-view gate as the
		// permissions listing — anyone authorised to edit roles is
		// authorised to see which authorities exist.
		r.With(requireUmbrellaOrAction(rolesG, permissions.ActionView)).Get("/api/roles/providers", handlers.ListAuthProvidersHandler)

		// Admin: settings. VIEW_SETTINGS is the umbrella; SETTINGS_VIEW /
		// SETTINGS_EDIT narrow it to read vs. write respectively.
		r.Route("/api/settings", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionView)).Get("/", handlers.SettingsHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Put("/", handlers.SettingsHandler)
			// Logo upload/delete sit beside the rest of the settings
			// endpoints but use multipart streaming so the binary doesn't
			// bloat the JSON parser path.
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Post("/logo", handlers.SettingsLogoUploadHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Delete("/logo", handlers.SettingsLogoDeleteHandler)
		})

		// Admin: Authority (the auth-only page that replaced the "Auth"
		// tab on Settings — it owns SMTP, registration toggles, OAuth
		// providers, OTP/SMS channels, the TOTP authenticator-app
		// connection, and the configurable registration requirement
		// policy). Gated by the SETTINGS umbrella-or-action pair, same
		// as SettingsHandler: a role that can read settings can read
		// authority; SETTINGS_EDIT narrow it to read vs. write.
		r.Route("/api/authority", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionView)).Get("/", handlers.AuthorityHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Put("/", handlers.AuthorityHandler)
			// Mint a fresh TOTP secret for the authenticator-app
			// connection; edit-gated since it mutates the persisted
			// config. Returns the secret once so the SPA can render a
			// QR code at the same moment.
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Post("/app/regenerate-secret", handlers.AuthorityRegenerateAppSecretHandler)
		})

		// Admin: GLOBAL themes. MANAGE_THEMES is the umbrella that grants
		// the whole theme surface for a role; the granular sub-caps
		// (CREATE_GLOBAL_THEMES / EDIT_THEMES / ASSIGN_THEMES) narrow each
		// route so a role can be limited to, e.g., just publishing new
		// themes or just assigning them. The public read path /api/themes
		// lives outside this gate so every user can resolve their route's
		// theme; only authoring + assignment need the gate.
		//
		// NOTE: this collection is registered as LOOSE gated routes, not as
		// a Resource via r.Route("/api/themes", ...). A chi v5 Route mount
		// at /api/themes "claims" the literal path: a GET /api/themes call
		// (the resolver's public read handler, registered above in the
		// PUBLIC group so logged-out visitors on /auth/login can resolve
		// their theme) returns 405 Method Not Allowed because the mounted
		// sub-router has no Get("/") of its own. Registering the writes as
		// loose gated routes — exactly the pattern the system / database /
		// security endpoints already use — lets them live at /api/themes
		// for POST / PUT / DELETE while the public loose GET /api/themes
		// stays the resolver's read path.
		r.With(requireAnyPermission(themesG.Umbrella, permissions.CreateGlobalThemesKey)).Post("/api/themes", handlers.CreateThemeHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.CreateGlobalThemesKey)).Post("/api/themes/url", handlers.InstallThemeFromURLHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Put("/api/themes/{id}", handlers.UpdateThemeHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Delete("/api/themes/{id}", handlers.DeleteThemeHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Get("/api/themes/{id}/download", handlers.DownloadThemeHandler)
		// One scope -> theme binding (empty theme_id = unassign).
		r.With(requireAnyPermission(themesG.Umbrella, permissions.AssignThemesKey)).Put("/api/themes/assignments", handlers.AssignThemeHandler)
		// GET /api/themes/owners: the admin list of global themes WITH the
		// creator's username (for the Theme Studio management view). Distinct
		// pattern from the resolver's GET /api/themes so the public read
		// handler and this admin-with-owner list never collide in chi's
		// route table.
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Get("/api/themes/owners", handlers.AdminListThemesHandler)

		// Admin: API key management. MANAGE_API_KEYS (umbrella) implies every
		// action; API_KEYS_* narrow each route. Unlike the /api/me/api-keys
		// self-serve routes, these operate across ALL users, so the admin can
		// mint/revoke keys on anyone's behalf.
		r.Route("/api/api-keys", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(apikeysG, permissions.ActionView)).Get("/", handlers.AdminListApiKeysHandler)
			r.With(requireUmbrellaOrAction(apikeysG, permissions.ActionCreate)).Post("/", handlers.AdminCreateApiKeyHandler)
			r.With(requireUmbrellaOrAction(apikeysG, permissions.ActionEdit)).Put("/{id}", handlers.AdminUpdateApiKeyHandler)
			r.With(requireUmbrellaOrAction(apikeysG, permissions.ActionDelete)).Delete("/{id}", handlers.AdminDeleteApiKeyHandler)
		})

		// Admin: node (edge) management. MANAGE_NODES (umbrella) implies every
		// action; NODES_* narrow each route. Operational sub-actions (rotate
		// token, setup/purge local, probes, heartbeats) are gated at the
		// edit-level since they mutate the node's state; the heartbeat-only
		// ingest runs above as a public route so the edge never needs a panel
		// session cookie.
		r.Route("/api/nodes", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/", handlers.ListNodesHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionCreate)).Post("/", handlers.CreateNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/rotate-token", handlers.RotateNodeTokenHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/setup-local", handlers.SetupLocalNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/purge-local", handlers.PurgeLocalNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/{id}/heartbeats", handlers.NodeHeartbeatsHandler)
			// Active /health probes dial the edge directly so operators can
			// "re-check" a card's verdict without waiting for the heartbeat.
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Post("/{id}/probe", handlers.ProbeNodeHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Post("/probe", handlers.ProbeAllNodesHandler)
		})

		// Admin: template management. MANAGE_TEMPLATES (umbrella) implies
		// every action; TEMPLATES_* narrow each route. Templates are pure
		// data — the panel stores a JSON spec; ksedge interprets it through
		// the matching docker/lxd/kvm/multipass driver at deploy.
		r.Route("/api/templates", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionView)).Get("/", handlers.ListTemplatesHandler)
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionCreate)).Post("/", handlers.CreateTemplateHandler)
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionCreate)).Post("/url", handlers.InstallTemplateFromURLHandler)
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateTemplateHandler)
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteTemplateHandler)
			r.With(requireUmbrellaOrAction(templatesG, permissions.ActionView)).Get("/{id}/download", handlers.DownloadTemplateHandler)
		})

		// Admin: Mods management. MANAGE_MODS (umbrella) implies every action;
		// MODS_* narrow each route. Mods are admin-uploaded add-on packages
		// that extend the panel (extra pages, tools, integrations). They
		// install INACTIVE and only activate after the admin explicitly
		// approves every capability the mod requested (database read/write,
		// terminal, container/VM control, …). See internal/repository/mod_repo.go
		// for the grant lifecycle.
		r.Route("/api/mods", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/", handlers.ListModsHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionCreate)).Post("/", handlers.CreateModHandler)
			// Install-from-URL: server-side fetch of a public manifest URL,
			// then the same parse + insert path the file upload uses. SSRF-
			// guarded (only public IPs, DNS-pinned, size/time capped) — see
			// InstallModFromURLHandler for the full policy.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionCreate)).Post("/url", handlers.InstallModFromURLHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/{id}", handlers.GetModHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateModHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteModHandler)
			// Download the mod's .kspm package zip (the on-disk bundle if it
			// was uploaded as a zip, else synthesised from manifest+spec so
			// every mod is downloadable). View-gated so a read-only admin can
			// pull a package too.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/{id}/download", handlers.DownloadModHandler)
			// Per-capability approval: the admin's explicit "yes/no" for each
			// requested permission. Activation refuses to flip until every
			// requested cap has granted = true.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Put("/{id}/grants", handlers.SetModGrantsHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Post("/{id}/activate", handlers.ActivateModHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Post("/{id}/deactivate", handlers.DeactivateModHandler)
			// Per-mod runtime log ring (ks.log output + engine lifecycle
			// events). View-gated like the mod itself.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/{id}/logs", handlers.ModLogsHandler)
			// Built-in sample mods ("test mods"): the catalog is read-only;
			// installing creates a real (inactive) mod row through the same
			// validated pipeline as an upload, so CREATE gates it.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/samples", handlers.ListSampleModsHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionCreate)).Post("/samples/{key}", handlers.InstallSampleModHandler)
			// Engine diagnostics + kill switch. Status is view-gated; the
			// toggle stops every running runtime panel-wide, so it is
			// edit-gated like activation.
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/engine", handlers.ModEngineStatusHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Put("/engine", handlers.SetModEngineEnabledHandler)
		})

		// Admin: Applications management. MANAGE_APPLICATIONS (umbrella) implies every action;
		// APPLICATIONS_* narrow each route. Applications are admin-curated bot / service templates
		// (Discord, WhatsApp, Telegram, Slack, custom) that users install under their own account.
		// They install INACTIVE and only activate after the admin explicitly
		// approves every capability the application requested (network, storage, outbound http, …).
		// The grant lifecycle mirrors mods — see internal/repository/application_repo.go.
		r.Route("/api/applications", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionView)).Get("/", handlers.ListApplicationsHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionCreate)).Post("/", handlers.CreateApplicationHandler)
			// Install-from-URL: server-side fetch of a public manifest URL,
			// then the same parse + insert path the file upload uses. SSRF-
			// guarded (only public IPs, DNS-pinned, size/time capped).
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionCreate)).Post("/url", handlers.InstallApplicationFromURLHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionView)).Get("/{id}", handlers.GetApplicationHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateApplicationHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteApplicationHandler)
			// Per-capability approval: the admin's explicit "yes/no" for each
			// requested permission. Activation refuses to flip until every
			// requested cap has granted = true.
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Put("/{id}/grants", handlers.SetApplicationGrantsHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Post("/{id}/activate", handlers.ActivateApplicationHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Post("/{id}/deactivate", handlers.DeactivateApplicationHandler)
            r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Post("/{id}/env", handlers.UpdateApplicationEnvHandler)
			// One-shot execution of the application's script on a chosen
			// target (registered node / panel host via its local node or
			// direct shell; host or container/VM exec mode). EDIT-gated like
			// activation because a run executes arbitrary staged code.
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionEdit)).Post("/{id}/run", handlers.RunApplicationHandler)
			r.With(requireUmbrellaOrAction(appsG, permissions.ActionView)).Get("/{id}/runs", handlers.ListApplicationRunsHandler)
		})

		// Admin: Instance Pages management. MANAGE_INSTANCE_PAGES (umbrella) implies every action;
		// INSTANCE_PAGES_* narrow each route. Instance pages are reusable page definitions
		// (HTML/markdown/visual blocks with icons) that template authors reference to provide
		// custom documentation, dashboards, or configuration UIs in the instance panel sidebar.
		r.Route("/api/instance-pages", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/", handlers.ListInstancePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}", handlers.GetInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/", handlers.CreateInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteInstancePageHandler)
			// Link an existing instance page into one or more templates'
			// spec.pages so the Instance panel renders it as a custom sidebar
			// page. Idempotent on slug; re-linking copies the latest lib page
			// content into the spec.
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionEdit)).Post("/{id}/link", handlers.LinkInstancePageHandler)
			// Execute a page action against a specific instance. Proxies to the
			// edge's page-action endpoint which runs the command inside the
			// instance container.
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionEdit)).Post("/{id}/actions", handlers.ExecutePageActionHandler)
			// Execute an action from a custom page (called by the page's JS SDK).
			// Gated by VIEW_INSTANCES since the page runs in the instance panel.
			r.With(requirePermission("VIEW_INSTANCES")).Post("/execute-action", handlers.ExecuteCustomPageActionHandler)
			// Execute an action from a module-based page (called by the page's JS SDK).
			// Gated by VIEW_INSTANCES since the page runs in the instance panel.
			r.With(requirePermission("VIEW_INSTANCES")).Post("/execute-module-action", handlers.ExecuteModulePageActionHandler)

			// Import endpoints
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import", handlers.ImportInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/url", handlers.ImportInstancePageFromURLHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/marketplace", handlers.GetMarketplacePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/marketplace", handlers.ImportInstancePageFromMarketplaceHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/local", handlers.ListLocalInstancePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/local", handlers.ImportLocalInstancePageHandler)
		})

		// Admin: Instance Page Modules management. MANAGE_INSTANCE_PAGES (umbrella) implies every action;
		// INSTANCE_PAGE_MODULES_* narrow each route. Instance page modules are .kspm bundles that provide
		// fully functional UI pages with access to instance context, APIs, sockets, and permissions.
		r.Route("/api/instance-page-modules", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/", handlers.ListInstancePageModulesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}/{version}", handlers.GetInstancePageModuleManifestHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/upload", handlers.UploadInstancePageModuleHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/install", handlers.InstallInstancePageModuleHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionDelete)).Delete("/{id}/{version}", handlers.UninstallInstancePageModuleHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}/{version}/page.js", handlers.ServeInstancePageModuleAssetHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}/{version}/page.css", handlers.ServeInstancePageModuleAssetHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}/{version}/assets/*", handlers.ServeInstancePageModuleAssetHandler)
		})

		// Mod Engine v2 slot registry. Read-only, panel-wide: every active
		// mod's declared UI injection points served in one round-trip so the
		// React <Slot /> component can mount the right components. Gated by
		// ACCESS_ADMIN_PANEL because slots render inside the admin shell; an
		// anonymous caller would have nothing to render them into anyway.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/mods/v1/slots", handlers.SlotsHandler)
		// Per-mod asset stream: serves a single file from an active mod's
		// extracted .kspm workdir to the browser (the JS bundle the slots
		// loader mounts, page content referenced by spec.pages, …). Same
		// ACCESS_ADMIN_PANEL gate as the slot registry since assets render
		// inside the admin shell alongside the slots that point at them.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/mods/v1/assets/{slug}/*", handlers.ModAssetHandler)

		// Admin: instance management. MANAGE_INSTANCES (umbrella) implies
		// every action; INSTANCES_* narrow each route. Deploy spins up a
		// real workload on the chosen edge by RPC; start/stop/destroy
		// operate on the row the deploy created.
		r.Route("/api/instances", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionView)).Get("/", handlers.ListInstancesHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionCreate)).Post("/", handlers.DeployInstanceHandler)
			// Per-id read: consumed by custom HTML pages through the SDK
			// fetchPanel bridge to poll this instance's live status +
			// install-workflow state. Same data the list endpoint returns.
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionView)).Get("/{id}", handlers.GetInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/start", handlers.StartInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/stop", handlers.StopInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/restart", handlers.RestartInstanceHandler)
			// Admin config editor: persists the edited spec; recreates the
			// workload on the edge only when a create-time-only field changed.
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionDelete)).Delete("/{id}", handlers.DestroyInstanceHandler)
		})

		// Instance actions: invoke a template-defined named action (e.g. the
		// Minecraft "Start Java" action) against a running—or automagically
		// started—instance. Gated by VIEW_INSTANCES (any operator with
		// read access can run a user-invokable action; the per-action
		// `user_invokable: false` filter lives in the template spec and the
		// panel's actions inventory, not at the route gate).
		r.With(requirePermission("VIEW_INSTANCES")).Post("/api/instances/{id}/actions/{actionId}/invoke", handlers.InvokeActionHandler)
		// Stop an in-flight action workflow. Same VIEW_INSTANCES gate as
		// invoke: an operator who can run an action can also cancel it. The
		// handler additionally checks install_action_id so Stop only ever
		// targets the action currently reported as running by the banner —
		// a stale "Stop" click on an action that already finished can't
		// cancel a different action by mistake.
		r.With(requirePermission("VIEW_INSTANCES")).Post("/api/instances/{id}/actions/{actionId}/stop", handlers.StopActionHandler)

		// Instance-scoped terminal bridge. The browser opens a WebSocket
		// against this endpoint; the panel authenticates the user via its
		// session cookie, looks up the owning edge, and proxies frames to
		// ksedge /api/edge/exec. VIEW_INSTANCES gates the route because
		// the page it backs (the "Terminal" tab in /instances/:id) is
		// already exposed under that permission.
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/terminal", handlers.TerminalHandler)

		// Instance-scoped File Manager. The browser dials these JSON/stream
		// routes; the panel authenticates the session cookie, looks up the
		// owning edge, and proxies the request to ksedge /api/edge/files.
		// Same VIEW_INSTANCES gate as the terminal bridge so any user that
		// can see an instance can also browse its files.
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Post("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Delete("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/files/read", handlers.InstanceFileReadHandler)
		// Upload-from-URL. The panel fetches the remote URL through the same
		// SSRF-hardened path the Mod Engine's install-from-URL uses, then
		// proxies the bytes to the edge as op=upload. VIEW_INSTANCES gate
		// mirrors the rest of the files surface.
		r.With(requirePermission("VIEW_INSTANCES")).Post("/api/instances/{id}/files/url", handlers.InstanceFileURLUploadHandler)

		// ----- Per-instance advanced pages -----
		// Secrets / env vault. VIEW_INSTANCES gates everything; reveal/delete
		// are audited both in the per-instance timeline and globally.
		r.Route("/api/instances/{id}/secrets", func(r chi.Router) {
			r.With(requirePermission("VIEW_INSTANCES")).Get("/", handlers.ListSecretsHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Post("/", handlers.SetSecretHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Get("/{key}", handlers.RevealSecretHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Delete("/{key}", handlers.DeleteSecretHandler)
		})

		// Automation jobs + runs. Trigger is the manual "Run now" hit.
		r.Route("/api/instances/{id}/automation", func(r chi.Router) {
			r.With(requirePermission("VIEW_INSTANCES")).Get("/", handlers.ListAutomationHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Post("/", handlers.CreateAutomationHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Get("/runs", handlers.ListAutomationRunsHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Put("/{job_id}", handlers.UpdateAutomationHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Delete("/{job_id}", handlers.DeleteAutomationHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Post("/{job_id}/run", handlers.TriggerRunHandler)
		})

		// Live Processes / Metrics / Ports (sourced from edge inspect, cached).
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/processes", handlers.ListProcessesHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Post("/api/instances/{id}/processes/kill", handlers.KillProcessHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/metrics", handlers.MetricsHandler)
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/ports", handlers.ListPortsHandler)

		// Bulk cached live-state resources for the InstanceCard. Reads the
		// live_state table once (no edge dial) and returns the per-instance
		// cpu/mem/disk snapshot the card uses as a fallback when the stored
		// config has no `limits` block. Same VIEW_INSTANCES gate as the rest
		// of the instance-scoped routes.
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/cached-resources", handlers.ListCachedResourcesHandler)

		// Snapshots (driver-managed backups the edge creates/restores/deletes).
		r.Route("/api/instances/{id}/snapshots", func(r chi.Router) {
			r.With(requirePermission("VIEW_INSTANCES")).Get("/", handlers.ListSnapshotsHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Post("/", handlers.CreateSnapshotHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Post("/{snap_name}/restore", handlers.RestoreSnapshotHandler)
			r.With(requirePermission("VIEW_INSTANCES")).Delete("/{snap_name}", handlers.DeleteSnapshotHandler)
		})

		// Per-instance audit timeline.
		r.With(requirePermission("VIEW_INSTANCES")).Get("/api/instances/{id}/audit", handlers.ListInstanceAuditHandler)

		// System snapshot (ACCESS_ADMIN_PANEL). One round-trip carries
		// every tile the System page renders so the page can paint in a
		// single fetch and refresh on an interval without re-querying.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/system", handlers.SystemSnapshotHandler)

		// Panel self-update (MANAGE_PANEL_UPDATE). Endpoints back
		// the "Updates" tab on the System page:
		//   GET  /api/system/update-info          – local build + URL hints
		//   GET  /api/system/update-check         – fetch remote version.json
		//   POST /api/system/update-apply         – download + swap + relaunch
		//   POST /api/system/reinstall            – force reinstall current channel (in-process)
		//   GET  /api/system/reinstall-script     – generate standalone reinstall.sh script
		//   POST /api/system/reinstall-background – write script to host + run in background
		//   POST /api/system/stop                 – gracefully stop the panel
		// Gated by the dedicated MANAGE_PANEL_UPDATE permission so a role
		// that can view System telemetry can be carved out from the more
		// destructive self-update verb.
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Get("/api/system/update-info", handlers.UpdateInfoHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Get("/api/system/update-check", handlers.UpdateCheckHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Post("/api/system/update-apply", handlers.UpdateApplyHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Post("/api/system/reinstall", handlers.ReinstallHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Get("/api/system/reinstall-script", handlers.ReinstallScriptHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Post("/api/system/reinstall-background", handlers.ReinstallBackgroundHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Post("/api/system/stop", handlers.SystemStopHandler)

		// Activity feed (ACCESS_ADMIN_PANEL). The list is admin-wide when
		// the caller has admin rights; non-admins get only their own rows
		// — the handler narrows the SQL itself so the gate stays useful.
		r.Get("/api/activity", handlers.ListActivityHandler)

		// Database page (ACCESS_ADMIN_PANEL). The GET is the read-only
		// SQLite-flavoured inspector; the two POSTs drive the admin
		// "Change Database" surface: GET /engines lists switchable backends,
		// POST /engine validates + persists a new engine selection (the
		// running panel keeps its pool until a launch restart). Every route
		// here is explicitly permission-gated — the engine switch can copy
		// the whole dataset to an external server, so plain authentication
		// must never be enough to reach it.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database", handlers.DatabaseInfoHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/engines", handlers.DatabaseEnginesHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/engine", handlers.SetDatabaseEngineHandler)

		// Security page (ACCESS_ADMIN_PANEL). Per-request security telemetry
		// aggregated into the headline counters + top-N lists the page renders.
		// The toggle endpoint flips the persisted Attack Status flag in the
		// settings KV so the middleware (and the page) can react.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security", handlers.SecuritySnapshotHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/attack", handlers.SecurityToggleAttackHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/config", handlers.SecurityGetConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Put("/api/security/config", handlers.SecurityUpdateConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/ddos/reset", handlers.SecurityDDOSResetHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/ddos/stop", handlers.SecurityDDOSManualStopHandler)
		// Security page → DDoS tab: emergency port-switch script (ddos.sh).
		// Same delivery pattern as the reinstall script: GET generates and
		// downloads the standalone script; POST writes it next to the
		// binary and runs it detached. The script stops the panel and
		// restarts it on DDOSAltPort WITHOUT persisting that port, so the
		// saved last port keeps pointing at the original port.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/ddos/script", handlers.DDOSScriptHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/ddos/background", handlers.DDOSBackgroundHandler)

		// Security page → Sessions tab. The list is the SessionManager's
		// tracked sessions across all users; revocation is enforced by
		// AuthMiddleware's TrackedSessionValid check on the next request.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/status", handlers.SecurityStatusHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/sessions", handlers.SecurityListSessionsHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Delete("/api/security/sessions/{id}", handlers.SecurityRevokeSessionHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/sessions/revoke-all", handlers.SecurityRevokeAllSessionsHandler)

		// Security page → Authentication tab: login-protection status
		// (in-memory lockout) + MFA recovery-code management.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/authentication/lockout", handlers.SecurityLockoutStatusHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/authentication/unlock", handlers.SecurityUnlockAccountHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/security/authentication/recovery-codes", handlers.SecurityRecoveryCodesStatusHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/authentication/recovery-codes/generate", handlers.SecurityRecoveryCodesGenerateHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/security/authentication/recovery-codes/consume", handlers.SecurityRecoveryCodesConsumeHandler)
	})

	// Serve SPA from embedded UI – any route not matched above falls through to UI
	uiFS := ui.FileSystem()
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Serve static files; index.html (and any unmatched path) gets
		// brand-injected so the SPA boots already knowing its name + logo,
		// fixing the "KS Panel" flash on hard reload.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" || path == "index.html" {
			writeBrandedIndex(w, r, uiFS)
			return
		}
		f, err := uiFS.Open(path)
		if err != nil {
			writeBrandedIndex(w, r, uiFS)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if info.IsDir() {
			writeBrandedIndex(w, r, uiFS)
			return
		}
		http.FileServer(uiFS).ServeHTTP(w, r)
	}))

	return r
}
