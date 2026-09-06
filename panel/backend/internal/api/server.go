package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/api/handlers"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/tunnel"
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
	ticketsG := permissions.AreaGroups[9]
	notificationsG := permissions.AreaGroups[10]
	settingsG := permissions.AreaGroups[11]
	themesG := permissions.AreaGroups[12]

	// Boot the Mod Engine v2 runtime: spin up a Goja VM for every active mod
	// so its slots + hooks are live before the first request lands. A per-mod
	// failure is logged by the engine and never aborts the panel.
	handlers.BootModEngine(context.Background())

	// Once-per-process wiring: let the settings repository know how to
	// build public logo URLs for the JSON snapshot it returns. We point it
	// at the same constant string the SPA-fallback uses; keeping it
	// constant avoids surprising URL changes when a reverse proxy sits in
	// front of the panel.
	repository.SetLogoURLBuilder(func(logo repository.PanelLogo) string {
		return repository.LogoURL(logo)
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

	// Global security headers (CSP/HSTS/nosniff/DENY + friends). Mounted
	// immediately after cors and BEFORE SecurityMiddleware so even
	// telemetry-blocked (429/403/503) responses carry the headers. Never
	// wraps the ResponseWriter, so WebSocket hijacks (terminal,
	// notifications/stream, edge tunnel) keep working. CSP allows
	// 'unsafe-inline' for script/style only because the SPA's branded
	// index.html inlines window.__KSPANEL_BOOTSTRAP__ + Vite styles.
	r.Use(SecurityHeadersMiddleware)

	// Security telemetry middleware — records one security_requests row per
	// inbound request so the Security admin page (admin/security) can render
	// RPS / top IPs / blocked / errors / bandwidth / login attempts / etc.
	// The wrapper spawns the INSERT in its own goroutine so a logging
	// failure never blocks or breaks the response it observed.
	r.Use(SecurityMiddleware)

	// Input hygiene: strip NUL/controls from query params (safe for all
	// routes, including WS handshakes and static assets — it never blocks,
	// only sanitizes).
	r.Use(SanitizeMiddleware)
	// Request validation: reject suspicious paths (../, <script, …) with
	// 400 and unknown Content-Types with 415. Bypasses WS upgrades +
	// static assets internally; allowlist includes octet-stream for the
	// chunked backup PUTs.
	r.Use(RequestValidationMiddleware)
	// XSS headers (nosniff + X-XSS-Protection). Redundant with
	// SecurityHeadersMiddleware by design — kept so each layer owns its
	// contract even if the outer header middleware is ever disabled.
	r.Use(XSSProtectionMiddleware)

	// Request body size limit to prevent DoS attacks. Reads the
	// operator-configured cap (Firewall tab → Request Size Limit) from
	// the live security state instead of a hardcoded constant.
	r.Use(DynamicMaxBodySize())

	// CSRF token enforcement (innermost global, after body limiting so
	// FormValue("csrf_token") never reads an unbounded body). Skips safe
	// methods, Upgrade: websocket, static assets, Bearer auth, and the
	// public exempt families (POST /api/auth/*, POST /api/nodes/heartbeat,
	// /api/edge/tunnel, GET /api/csrf-token, …). Cookie-only browser POSTs
	// without X-CSRF-Token get 403; the SPA fetches the token from
	// GET /api/csrf-token (see frontend shared/api/client.ts).
	r.Use(CSRFMiddleware(CSRFTokenInstance))

	// API routes – set JSON content type for these only
	r.Group(func(r chi.Router) {
		r.Use(middleware.SetHeader("Content-Type", "application/json"))
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"status":"ok"}`)) })
		// CSRF token mint for the SPA: public GET (safe method, also in the
		// CSRF exempt list) so cookie-only browsers can fetch the token
		// they must send as X-CSRF-Token on mutating requests.
		r.Get("/api/csrf-token", CSRFTokenHandler(CSRFTokenInstance))
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

		// Public authority branding snapshot for the login page: the
		// authority-specific logo/background when the admin configured one,
		// else the GLOBAL panel brand (panel_name + panel-logo) as
		// fallback. Same public model as panel-name/panel-logo/themes —
		// brand URLs only, no secrets — so /auth/login can paint before
		// the user has a session.
		r.Get("/api/authority/branding", handlers.AuthorityBrandingHandler)

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
		// Reverse tunnel: edge dials panel via WSS and keeps the socket alive so
		// the panel can multiplex RPCs back to the edge without dialing it directly.
		// Token-auth, not session-cookie.
		r.Get("/api/edge/tunnel", tunnel.Handler)
		r.HandleFunc("/api/edge/tunnel", tunnel.Handler)
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

		// Self-service Instances — now strictly permission-gated (permission is King).
		// Requires any instance view permission (VIEW_INSTANCES page key or
		// MANAGE_INSTANCES umbrella / INSTANCES_VIEW / OWN / ALL).
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/me/instances", handlers.ListMyInstancesHandler)

		// Admin: users management. MANAGE_USERS (umbrella) implies every
		// action on this area, so each route accepts the umbrella OR the
		// matching USERS_* verb — a role can be narrowed to just view /
		// just create without losing access to the umbrella admin role.
		r.Route("/api/users", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionView)).Get("/", handlers.ListUsersHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionCreate)).Post("/", handlers.CreateUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionDelete)).Delete("/{id}", handlers.DeleteUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionEdit)).Post("/{id}/suspend", handlers.SuspendUserHandler)
			r.With(requireUmbrellaOrAction(usersG, permissions.ActionEdit)).Post("/{id}/unsuspend", handlers.UnsuspendUserHandler)
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

		// Custom panel pages (Settings > Pages: About, Docs, …). CRUD rides
		// the settings umbrella (same admins who own the brand own the
		// pages); the nav + slug readers only need a session — each page's
		// own role allow-list decides who sees it.
		r.Route("/api/panel-pages", func(r chi.Router) {
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionView)).Get("/", handlers.ListPanelPagesHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Post("/", handlers.CreatePanelPageHandler)
			r.Get("/nav", handlers.PanelPagesNavHandler)
			r.Get("/slug/{slug}", handlers.GetPanelPageBySlugHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionView)).Get("/{id}", handlers.GetPanelPageHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Put("/{id}", handlers.UpdatePanelPageHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Delete("/{id}", handlers.DeletePanelPageHandler)
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

		// AI assistant (plan/ai.md). Proxy-only: the provider key never
		// reaches the browser. Config read is masked and open to any
		// authenticated user (the FAB needs it); writes + test are
		// SETTINGS_EDIT; chat, stream, threads accept the AI Chat umbrella
		// or any sub-cap (QA/TOOLS/WRITES/THREADS) — the handler narrows
		// further per tool — and chat/stream are per-user rate-limited
		// inside the handler.
		r.Route("/api/ai", func(r chi.Router) {
			r.Get("/config", handlers.AIConfigHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Put("/config", handlers.AIConfigHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionEdit)).Post("/test", handlers.AITestHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Post("/chat", handlers.AIChatHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Post("/chat/stream", handlers.AIChatStreamHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Get("/threads", handlers.AIThreadsHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Post("/threads", handlers.AIThreadsHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Get("/threads/{id}/messages", handlers.AIThreadHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Put("/threads/{id}", handlers.AIThreadHandler)
			r.With(requireAnyPermission(permissions.AIChatKeysForGate()...)).Delete("/threads/{id}", handlers.AIThreadHandler)
			r.With(requireUmbrellaOrAction(settingsG, permissions.ActionView)).Get("/usage", handlers.AIUsageHandler)
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
		// Theme marketplace (themelib, mirrors the instance-pages market):
		// GET lists the catalog (any theme capability may browse, same as
		// the pages market's view gate); POST installs one catalog entry
		// into the GLOBAL library (CREATE_GLOBAL or EDIT, like publishing).
		// Static literals, so they never collide with the {id} routes below.
		r.With(requireAnyPermission(themesG.Umbrella, permissions.CreateGlobalThemesKey, permissions.EditThemesKey, permissions.UseGlobalThemesKey, permissions.AssignThemesKey)).Get("/api/themes/market", handlers.GetThemeMarketHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.CreateGlobalThemesKey, permissions.EditThemesKey)).Post("/api/themes/market/install", handlers.InstallThemeFromMarketHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Put("/api/themes/{id}", handlers.UpdateThemeHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Delete("/api/themes/{id}", handlers.DeleteThemeHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Get("/api/themes/{id}/download", handlers.DownloadThemeHandler)
		// Theme version history (migration 067): list revisions newest-first
		// + roll back to one. EDIT-gated like the overwrite that produces
		// revisions; rollback is audit-logged inside the handler.
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Get("/api/themes/{id}/revisions", handlers.ListThemeRevisionsHandler)
		r.With(requireAnyPermission(themesG.Umbrella, permissions.EditThemesKey)).Post("/api/themes/{id}/rollback/{rev}", handlers.RollbackThemeHandler)
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
			// Named WSS channels per node (migration 062): the NodeForm WSS
			// box rows (name/task/transport/fallback). Reads are view-level;
			// writes are edit-level like the node itself.
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/{id}/wss-channels", handlers.ListNodeWssChannelsHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/wss-channels", handlers.CreateNodeWssChannelHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Put("/{id}/wss-channels/{cid}", handlers.UpdateNodeWssChannelHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Delete("/{id}/wss-channels/{cid}", handlers.DeleteNodeWssChannelHandler)
			// Per-node edge self-update (NodeDetail → Update & Reinstall):
			// the panel proxies a trigger RPC to the edge, and the edge
			// downloads + swaps + restarts via its own reinstall.sh.
			// Info/check are view-level (like probe); mutating verbs are
			// edit-level (like setup-local).
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/{id}/update-info", handlers.NodeUpdateInfoHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/{id}/update-check", handlers.NodeUpdateCheckHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/update-apply", handlers.NodeUpdateApplyHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/reinstall", handlers.NodeReinstallHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/{id}/reinstall-background", handlers.NodeReinstallBackgroundHandler)
			// Fleet rolling update (NodeDetail primitives, orchestrated):
			// order nodes (canary subset first), per node check→apply→poll
			// edge /health + heartbeat until healthy/timeout, stop on first
			// failure. Edit-level like the single-node mutating verbs.
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/update-all", handlers.NodeRollingUpdateHandler)
			// Fleet update windows (cron schedules + maintenance-window
			// guard, scheduler-driven). Same edit-level gate.
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionView)).Get("/update-windows", handlers.ListFleetUpdateWindowsHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Post("/update-windows", handlers.CreateFleetUpdateWindowHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Put("/update-windows/{wid}", handlers.UpdateFleetUpdateWindowHandler)
			r.With(requireUmbrellaOrAction(nodesG, permissions.ActionEdit)).Delete("/update-windows/{wid}", handlers.DeleteFleetUpdateWindowHandler)
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
			// Static literals before param routes so chi's radix tree resolves
			// "/samples" and "/engine" as literals instead of capturing them
			// as {id}="samples"/"engine".
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/samples", handlers.ListSampleModsHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionCreate)).Post("/samples/{key}", handlers.InstallSampleModHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionView)).Get("/engine", handlers.ModEngineStatusHandler)
			r.With(requireUmbrellaOrAction(modsG, permissions.ActionEdit)).Put("/engine", handlers.SetModEngineEnabledHandler)
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
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/", handlers.CreateInstancePageHandler)
			// Bulk create — fast-path for "Select all visible → Import" (single TX, single round-trip).
			// Must sit before param routes so "/bulk" is not captured as {id}.
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/bulk", handlers.BulkCreateInstancePagesHandler)
			// Static literals before param routes so "/execute-action", "/marketplace",
			// "/local", "/import" etc. are not captured as {id}.
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/execute-action", handlers.ExecuteCustomPageActionHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/execute-module-action", handlers.ExecuteModulePageActionHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import", handlers.ImportInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/url", handlers.ImportInstancePageFromURLHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/marketplace", handlers.GetMarketplacePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/marketplace", handlers.ImportInstancePageFromMarketplaceHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionEdit)).Post("/import/marketplace/resync", handlers.ResyncMarketplacePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/local", handlers.ListLocalInstancePagesHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionCreate)).Post("/import/local", handlers.ImportLocalInstancePageHandler)
			r.With(requireUmbrellaOrAction(instancePagesG, permissions.ActionView)).Get("/{id}", handlers.GetInstancePageHandler)
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

		// Tickets: support system. Every ticket holder can list their own
		// tickets; staff (MANAGE_TICKETS / TICKETS_ALL) sees all. Granular
		// TICKETS_* verbs narrow each mutation: CREATE for opening,
		// EDIT for status/priority/assignment/reply, DELETE for removal.
		// The handler itself enforces owner-vs-staff visibility for GET
		// so a single GET /api/tickets endpoint covers both "my tickets"
		// and "all tickets" without a second /me/tickets route.
		// /users (assign dropdown) is staff-only (EDIT) so it cannot be
		// used to enumerate accounts.
		r.Route("/api/tickets", func(r chi.Router) {
			// Literal sub-paths BEFORE the param {id} route so chi resolves
			// "/stats", "/users" and "/sla-config" as fixed segments rather
			// than capturing them as id="stats" etc.
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/", handlers.ListTicketsHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/stats", handlers.TicketStatsHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionEdit)).Get("/users", handlers.ListUsersForAssignHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/sla-config", handlers.GetTicketSLAConfigHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionEdit)).Put("/sla-config", handlers.UpdateTicketSLAConfigHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionCreate)).Post("/", handlers.CreateTicketHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/{id}", handlers.GetTicketHandler)
			// Update/Delete/Assign/Comment allow any ticket holder; handler enforces owner-vs-staff.
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsCreateKey, permissions.TicketsEditKey, permissions.TicketsDeleteKey)).Put("/{id}", handlers.UpdateTicketHandler)
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsDeleteKey, permissions.TicketsCreateKey)).Delete("/{id}", handlers.DeleteTicketHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionEdit)).Post("/{id}/assign", handlers.AssignTicketHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/{id}/comments", handlers.ListTicketCommentsHandler)
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsCreateKey, permissions.TicketsEditKey)).Post("/{id}/comments", handlers.AddTicketCommentHandler)
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsDeleteKey, permissions.TicketsEditKey)).Delete("/{id}/comments/{commentId}", handlers.DeleteTicketCommentHandler)
			// Attachments (065): multipart upload 25 MiB, MIME allowlist,
			// SHA256 dedupe; download streams inline (owner-vs-staff gate +
			// IDOR ticket guard inside the handler). Same gates as comments
			// so any ticket holder can attach/read; delete is
			// uploader-or-staff inside the handler.
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/{id}/attachments", handlers.ListTicketAttachmentsHandler)
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsCreateKey, permissions.TicketsEditKey)).Post("/{id}/attachments", handlers.UploadTicketAttachmentHandler)
			r.With(requireUmbrellaOrAction(ticketsG, permissions.ActionView)).Get("/{id}/attachments/{attId}", handlers.DownloadTicketAttachmentHandler)
			r.With(requireAnyPermission(permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsDeleteKey, permissions.TicketsEditKey)).Delete("/{id}/attachments/{attId}", handlers.DeleteTicketAttachmentHandler)
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
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListInstancesHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionCreate)).Post("/", handlers.DeployInstanceHandler)
			// Bulk cached live-state resources for the InstanceCard. Static
			// literal before param so "/cached-resources" is not captured as
			// {id}="cached-resources".
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/cached-resources", handlers.ListCachedResourcesHandler)
			// Per-id read: consumed by custom HTML pages through the SDK
			// fetchPanel bridge to poll this instance's live status +
			// install-workflow state. Same data the list endpoint returns.
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/{id}", handlers.GetInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/start", handlers.StartInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/stop", handlers.StopInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/kill", handlers.KillInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/restart", handlers.RestartInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/reinstall", handlers.ReinstallInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Put("/{id}/identity", handlers.UpdateInstanceIdentityHandler)
			// Admin config editor: persists the edited spec; recreates the
			// workload on the edge only when a create-time-only field changed.
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Put("/{id}", handlers.UpdateInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionDelete)).Delete("/{id}", handlers.DestroyInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/suspend", handlers.SuspendInstanceHandler)
			r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/{id}/unsuspend", handlers.UnsuspendInstanceHandler)
		})

		// Instance actions: invoke a template-defined named action (e.g. the
		// Minecraft "Start Java" action) against a running—or automagically
		// started—instance. Gated by VIEW_INSTANCES (any operator with
		// read access can run a user-invokable action; the per-action
		// `user_invokable: false` filter lives in the template spec and the
		// panel's actions inventory, not at the route gate).
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/api/instances/{id}/actions/{actionId}/invoke", handlers.InvokeActionHandler)
		// Stop an in-flight action workflow. Same VIEW_INSTANCES gate as
		// invoke: an operator who can run an action can also cancel it. The
		// handler additionally checks install_action_id so Stop only ever
		// targets the action currently reported as running by the banner —
		// a stale "Stop" click on an action that already finished can't
		// cancel a different action by mistake.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/api/instances/{id}/actions/{actionId}/stop", handlers.StopActionHandler)

		// Instance-scoped terminal bridge. The browser opens a WebSocket
		// against this endpoint; the panel authenticates the user via its
		// session cookie, looks up the owning edge, and proxies frames to
		// ksedge /api/edge/exec. VIEW_INSTANCES gates the route because
		// the page it backs (the "Terminal" tab in /instances/:id) is
		// already exposed under that permission.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/terminal", handlers.TerminalHandler)

		// Instance-scoped File Manager. The browser dials these JSON/stream
		// routes; the panel authenticates the session cookie, looks up the
		// owning edge, and proxies the request to ksedge /api/edge/files.
		// Same VIEW_INSTANCES gate as the terminal bridge so any user that
		// can see an instance can also browse its files.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/api/instances/{id}/files", handlers.InstanceFilesHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/files/read", handlers.InstanceFileReadHandler)
		// Upload-from-URL. The panel fetches the remote URL through the same
		// SSRF-hardened path the Mod Engine's install-from-URL uses, then
		// proxies the bytes to the edge as op=upload. VIEW_INSTANCES gate
		// mirrors the rest of the files surface.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/api/instances/{id}/files/url", handlers.InstanceFileURLUploadHandler)

		// ----- Per-instance advanced pages -----
		// Secrets / env vault. VIEW_INSTANCES gates everything; reveal/delete
		// are audited both in the per-instance timeline and globally.
		r.Route("/api/instances/{id}/secrets", func(r chi.Router) {
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListSecretsHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/", handlers.SetSecretHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/{key}", handlers.RevealSecretHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/{key}", handlers.DeleteSecretHandler)
		})

		// Automation jobs + runs. Trigger is the manual "Run now" hit.
		r.Route("/api/instances/{id}/automation", func(r chi.Router) {
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListAutomationHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/", handlers.CreateAutomationHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/runs", handlers.ListAutomationRunsHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Put("/{job_id}", handlers.UpdateAutomationHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/{job_id}", handlers.DeleteAutomationHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/{job_id}/run", handlers.TriggerRunHandler)
		})

		// Live Processes / Metrics / Ports (sourced from edge inspect, cached).
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/processes", handlers.ListProcessesHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/api/instances/{id}/processes/kill", handlers.KillProcessHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/metrics", handlers.MetricsHandler)
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/ports", handlers.ListPortsHandler)
		// Ports editor: PUT requires EDIT (MANAGE_INSTANCES umbrella or INSTANCES_EDIT).
		r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Put("/api/instances/{id}/ports", handlers.UpdatePortsHandler)

		// Bulk cached live-state resources (now inside r.Route("/api/instances") as
		// GET "/cached-resources" so the static literal is resolved before
		// "/{id}"). See the Route block above.

		// Snapshots (driver-managed backups the edge creates/restores/deletes).
		r.Route("/api/instances/{id}/snapshots", func(r chi.Router) {
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListSnapshotsHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/", handlers.CreateSnapshotHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/{snap_name}/restore", handlers.RestoreSnapshotHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/{snap_name}", handlers.DeleteSnapshotHandler)
		})

		// Snapshot schedules (per-instance cron driving edge snapshots +
		// retention). Same VIEW gate as snapshots; mutators audit.
		r.Route("/api/instances/{id}/snapshots/schedules", func(r chi.Router) {
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListSnapshotSchedulesHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/", handlers.CreateSnapshotScheduleHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Put("/{schedule_id}", handlers.UpdateSnapshotScheduleHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/{schedule_id}", handlers.DeleteSnapshotScheduleHandler)
		})

		// Per-instance file-level tar backups (panel-stored, chunked
		// upload with Content-Range resume + Range download). Same VIEW
		// gate as snapshots; chunked routes get the 1 GiB lift in
		// DynamicMaxBodySize.
		r.Route("/api/instances/{id}/backups", func(r chi.Router) {
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/", handlers.ListInstanceBackupsHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/", handlers.InitInstanceBackupHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Put("/{bid}/chunk", handlers.UploadInstanceBackupChunkHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/{bid}/download", handlers.DownloadInstanceBackupHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Post("/{bid}/restore", handlers.RestoreInstanceBackupHandler)
			r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Delete("/{bid}", handlers.DeleteInstanceBackupHandler)
		})

		// Per-instance audit timeline.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/audit", handlers.ListInstanceAuditHandler)

		// Per-instance SFTP credentials. GET is masked (VIEW_INSTANCES, same
		// gate as the terminal/files bridges the sftp.json page sits next
		// to); the mutators require EDIT (MANAGE_INSTANCES umbrella or
		// INSTANCES_EDIT) like the ports editor.
		r.With(requireAnyPermission(permissions.ViewInstancesKey, permissions.ManageInstancesKey, permissions.InstancesViewKey, permissions.InstancesOwnKey, permissions.InstancesAllKey)).Get("/api/instances/{id}/sftp", handlers.GetSFTPHandler)
		r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/api/instances/{id}/sftp/enable", handlers.EnableSFTPHandler)
		r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/api/instances/{id}/sftp/rotate", handlers.RotateSFTPHandler)
		r.With(requireUmbrellaOrAction(instancesG, permissions.ActionEdit)).Post("/api/instances/{id}/sftp/disable", handlers.DisableSFTPHandler)

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
		// Scheduled panel update windows (cron + maintenance-window guard,
		// scheduler-driven). Same MANAGE_PANEL_UPDATE gate as the manual
		// apply verbs above; every mutation is audit-logged.
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Get("/api/system/update-windows", handlers.ListPanelUpdateWindowsHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Post("/api/system/update-windows", handlers.CreatePanelUpdateWindowHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Put("/api/system/update-windows/{wid}", handlers.UpdatePanelUpdateWindowHandler)
		r.With(requirePermission("MANAGE_PANEL_UPDATE")).Delete("/api/system/update-windows/{wid}", handlers.DeletePanelUpdateWindowHandler)

		// Activity feed — now strictly permission-gated (permission is King).
		// No longer open to any authenticated user; requires ACCESS_ADMIN_PANEL.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/activity", handlers.ListActivityHandler)

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
		// Scheduled integrity verification (daily cron, configurable):
		// GET /verify runs the check now (PRAGMA quick_check on SQLite +
		// connection probe + table-count sanity on all engines) and persists
		// it as the new last-verify status; failures write activity_logs +
		// notify admins. /verify/config reads/updates the cron without
		// running. All ACCESS_ADMIN_PANEL-gated like the rest of Database.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/verify/config", handlers.DatabaseVerifyConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Put("/api/database/verify/config", handlers.UpdateDatabaseVerifyConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/verify", handlers.DatabaseVerifyHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/verify", handlers.DatabaseVerifyHandler)

		// Database → Backup tab (ACCESS_ADMIN_PANEL). Named backups that live
		// under <DataDir>/backups. Create is VACUUM INTO (SQLite) or a
		// native pg_dump / mysqldump artifact (Postgres/MySQL) with
		// gzip/zstd compression; download streams the stored bytes; upload
		// accepts a multipart SQLite file or a remote URL (SSRF-hardened).
		// Restore is destructive and requires a panel restart to take
		// effect. Schedules drive cron VACUUM INTO + retention prune; the
		// S3 remote pushes/pulls via SigV4 (secret never logged).
		// Literal sub-paths (/upload, /schedules, /prune, /s3) must be
		// registered BEFORE the param {id} routes so chi resolves them as
		// literals, not as id="schedules" etc.
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/backups", handlers.ListDatabaseBackupsHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups", handlers.CreateDatabaseBackupHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/upload", handlers.UploadDatabaseBackupHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/upload/url", handlers.UploadDatabaseBackupURLHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/backups/schedules", handlers.ListDBBackupSchedulesHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/schedules", handlers.CreateDBBackupScheduleHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Put("/api/database/backups/schedules/{schedule_id}", handlers.UpdateDBBackupScheduleHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Delete("/api/database/backups/schedules/{schedule_id}", handlers.DeleteDBBackupScheduleHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/prune", handlers.PruneDBBackupsHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/backups/s3", handlers.GetS3ConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Put("/api/database/backups/s3", handlers.PutS3ConfigHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/s3/pull", handlers.PullDBBackupFromS3Handler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Get("/api/database/backups/{id}/download", handlers.DownloadDatabaseBackupHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/{id}/restore", handlers.RestoreDatabaseBackupHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Delete("/api/database/backups/{id}", handlers.DeleteDatabaseBackupHandler)
		r.With(requirePermission("ACCESS_ADMIN_PANEL")).Post("/api/database/backups/{id}/s3/push", handlers.PushDBBackupToS3Handler)

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

		// ─────────────────────────────────────────────────────────────────
		// Notifications — now strictly permission-gated (permission is King).
		// Every surface requires a notification permission: inbox list, unread
		// count, stats, and all own-row mutations. No longer open to any
		// authenticated user. Broadcast remains MANAGE_NOTIFICATIONS.
		//
		// Literal sub-paths must be registered BEFORE the param {id} route so
		// chi's radix tree resolves "/read-all" and "/stats" as fixed segments
		// rather than capturing them as id="read-all"/"stats".
		// ─────────────────────────────────────────────────────────────────
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications", handlers.ListNotificationsHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications/unread-count", handlers.UnreadCountHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications/stats", handlers.NotificationStatsHandler)
		// Realtime bell (065): WebSocket push replaces the 20s poll. Same
		// session-cookie auth as the terminal bridge (browsers can't set
		// Authorization on WS handshakes); the bell falls back to polling
		// when the socket drops. Unread-count stays as the fallback source.
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications/stream", handlers.NotificationStreamHandler)
		// Delivery prefs (065): mode realtime|digest|off + email opt-out.
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications/prefs", handlers.GetNotificationPrefsHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Put("/api/notifications/prefs", handlers.SetNotificationPrefsHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionEdit)).Put("/api/notifications/read-all", handlers.MarkAllReadHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionDelete)).Delete("/api/notifications", handlers.ClearNotificationsHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionView)).Get("/api/notifications/{id}", handlers.GetNotificationHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionEdit)).Put("/api/notifications/{id}/read", handlers.MarkReadHandler)
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionDelete)).Delete("/api/notifications/{id}", handlers.DeleteNotificationHandler)
		// Broadcast / single-user creation — gated by the Notifications CREATE
		// action (umbrella MANAGE_NOTIFICATIONS implies it) so a narrowed
		// NOTIFICATIONS_CREATE role can send without holding the full
		// umbrella. Payload controls broadcast vs targeted via `broadcast`
		// boolean; the handler additionally enforces Own-vs-All scope.
		r.With(requireUmbrellaOrAction(notificationsG, permissions.ActionCreate)).Post("/api/notifications", handlers.CreateNotificationHandler)
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
