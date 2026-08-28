# KS Panel Complete File Map — AI-Optimized

This map is rebuilt from direct file-system inspection (`ls`, `find`, `cd`) of `/test/ks-panel/`. It is structured into **3 main parts** to help AI models quickly understand the project layout:

- **Backend** (`panel/backend/`) — Go backend application
- **Frontend** (`panel/frontend/`) — React/TypeScript frontend application
- **Edge Backend** (`edge/backend/`) — Edge deployment/ops backend

Each part is a complete tree listing of all files with `├──` and `└──` connectors. Descriptions follow the `# filename` pattern. No files are skipped or guessed.

```
map.md
├── Backend section   (lines 7–278)
├── Frontend section  (lines 282–507)
└── Edge Backend section (lines 511–555)
```

---

## Structure Guide for AI Models

- **Tree format**: Indented `├──` / `└──` lines show hierarchical folder relationships
- **File syntax**: `├── filename.go            # One-line description`
- **3 parts only**: Backend, Frontend, Edge Backend — no other sections
- **Verification**: All paths confirmed via `find /test/ks-panel/... -type f | sort`
- **Maintenance**: Add any new file immediately per `loop.md` "Map Maintenance"

---

## Backend (`panel/backend/`)

Inspected with `find /test/ks-panel/panel/backend -type f | sort` (node_modules excluded).

```
panel/backend/
├── go.mod, go.sum               # Go module definition
├── cmd/kspanel/main.go           # Main entry -> cli.Execute()
├── cmd_chpw_ignore/main.go       # Password-change ignore handler
├── internal/
│   ├── api/
│   │   ├── bootstrap.go          # SPA bootstrap + brand/theme injection
│   │   ├── csrf.go               # CSRF protection
│   │   ├── middleware.go           # General middleware
│   │   ├── rate_limiter.go         # Rate limiting
│   │   ├── security_headers.go       # Security headers
│   │   ├── security_middleware.go      # Security middleware
│   │   ├── server.go               # HTTP server setup
│   │   ├── validation_middleware.go    # Request validation
│   │   └── handlers/
│   │       ├── activity_handler.go      # Activity feed handlers
│   │       ├── admin_handler.go         # Admin users/roles/nodes
│   │       ├── api_key_handler.go       # API key management
│   │       ├── application_handler.go   # Applications catalog
│   │       ├── application_run.go       # One-shot app run engine (node/local-node/host-shell targets)
│   │       ├── auth_handler.go          # Login/logout/session
│   │       ├── auth_register_handler.go # Registration/verification
│   │       ├── authority_handler.go     # Authority (SMTP, OAuth, OTP)
│   │       ├── database_handler.go      # Database inspector
│   │       ├── files_handler.go         # Instance file manager
│   │       ├── instance_advanced_handler.go # Advanced instance pages
│   │       ├── instance_handler.go      # Instance CRUD + actions
│   │       ├── instance_inspect_handler.go # Live process/metric/port
│   │       ├── instance_page_guard.go   # Instance page permissions
│   │       ├── instance_page_handler.go # Instance pages
│   │       ├── me_auth_handler.go       # Self-service auth hardening
│   │       ├── me_handler.go            # Current user profile
│   │       ├── mod_handler.go           # Mod packages
│   │       ├── node_handler.go          # Edge nodes
│   │       ├── profile_handler.go       # User profile
│   │       ├── security_handler.go      # Security snapshot/config/DDoS
│   │       ├── security_status.go       # GET /api/security/status (CORS/CSRF/headers/cookie cards)
│   │       ├── session_admin_handler.go # Security Sessions tab (list/revoke/revoke-all)
│   │       ├── authentication_admin_handler.go # Lockout status/unlock + MFA recovery codes
│   │       ├── settings_handler.go      # Panel settings
│   │       ├── system_handler.go        # System telemetry/updates
│   │       ├── template_handler.go      # Templates
│   │       ├── terminal_handler.go      # Instance terminal
│   │       ├── theme_handler.go         # Themes
│   │       └── update_handler.go        # Panel self-update
│   ├── auth/
│   │   ├── auth.go               # Core auth logic (HMAC session tokens)
│   │   ├── account_lockout.go      # Account lockout
│   │   ├── cookie.go               # Cookie management
│   │   ├── mfa.go                  # Multi-factor auth
│   │   ├── password_history.go       # Password history
│   │   ├── password_policy.go        # Password policy
│   │   └── session_manager.go        # Session management
│   ├── backup/
│   │   └── backup.go               # Backup functionality
│   ├── banner/
│   │   └── banner.go                 # Banner display
│   ├── cli/
│   │   ├── create_user.go          # Create-user CLI command
│   │   ├── import_template.go        # Template import CLI
│   │   ├── launch.go                 # Launch CLI
│   │   ├── print/print.go              # Print CLI helper
│   │   ├── root.go                   # Root CLI command
│   │   ├── seed.go                   # Seed CLI
│   │   ├── setup_localnode.go          # Local node setup
│   │   ├── setup_localnode_linux.go      # Linux-specific setup
│   │   ├── setup_localnode_other.go        # Other OS setup
│   │   └── silence.go                  # Silence CLI
│   ├── cron/
│   │   └── cron.go                   # Scheduled tasks
│   ├── db/
│   │   ├── db.go                     # DB connection
│   │   └── migrations/
│   │       ├── mysql/
│   │       │   ├── 001_init.sql
│   │       │   ├── 002_settings.sql
│   │       │   ├── 003_api_keys.sql
│   │       │   ├── 004_nodes.sql
│   │       │   ├── 005_node_heartbeats.sql
│   │       │   ├── 006_templates.sql
│   │       │   ├── 007_instances.sql
│   │       │   ├── 008_nodes_token_plain.sql
│   │       │   ├── 009_panel_logo.sql
│   │       │   ├── 010_node_drivers.sql
│   │       │   ├── 011_node_telemetry_quality.sql
│   │       │   ├── 012_activity_logs.sql
│   │       │   ├── 013_instance_owner.sql
│   │       │   ├── 014_role_display_color.sql
│   │       │   ├── 015_themes.sql
│   │       │   ├── 016_email_verification.sql
│   │       │   ├── 017_device_registration.sql
│   │       │   ├── 017_mods.sql
│   │       │   ├── 018_user_profile.sql
│   │       │   ├── 019_node_advanced.sql
│   │       │   ├── 020_mod_v2.sql
│   │       │   ├── 021_instance_secrets.sql
│   │       │   ├── 022_instance_automation.sql
│   │       │   ├── 023_instance_advanced.sql
│   │       │   ├── 024_api_key_limits.sql
│   │       │   ├── 025_instance_install.sql
│   │       │   ├── 025_node_allocations.sql
│   │       │   ├── 025_role_icon.sql
│   │       │   ├── 026_node_category_location.sql
│   │       │   ├── 027_mod_source.sql
│   │       │   ├── 027_security_requests.sql
│   │       │   ├── 028_security_config.sql
│   │       │   ├── 029_applications.sql
│   │       │   ├── 030_instance_install_kind.sql
│   │       │   ├── 031_instance_install_action_id.sql
│   │       │   ├── 032_instance_pages.sql
│   │       │   ├── 033_instance_pages_builtin_seed.sql
│   │       │   ├── 034_api_key_active.sql
│   │       │   ├── 035_instance_display.sql
│   │       │   ├── 036_mod_package.sql
│   │       │   ├── 037_user_suspension.sql (postgres/sqlite only)
│   │       │   ├── 038_instance_suspension.sql (postgres/sqlite only)
│   │       │   ├── 039_ddos_security.sql
│   │       │   └── 045_application_files_runs.sql
│   │       ├── postgres/
│   │       │   ├── 001_init.sql
│   │       │   ├── 002_settings.sql
│   │       │   ├── 003_api_keys.sql
│   │       │   ├── 004_nodes.sql
│   │       │   ├── 005_node_heartbeats.sql
│   │       │   ├── 006_templates.sql
│   │       │   ├── 007_instances.sql
│   │       │   ├── 008_nodes_token_plain.sql
│   │       │   ├── 009_panel_logo.sql
│   │       │   ├── 010_node_drivers.sql
│   │       │   ├── 011_node_telemetry_quality.sql
│   │       │   ├── 012_activity_logs.sql
│   │       │   ├── 013_instance_owner.sql
│   │       │   ├── 014_role_display_color.sql
│   │       │   ├── 015_themes.sql
│   │       │   ├── 016_email_verification.sql
│   │       │   ├── 017_mods.sql
│   │       │   ├── 018_user_profile.sql
│   │       │   ├── 019_node_advanced.sql
│   │       │   ├── 020_mod_v2.sql
│   │       │   ├── 021_instance_secrets.sql
│   │       │   ├── 022_instance_automation.sql
│   │       │   ├── 023_instance_advanced.sql
│   │       │   ├── 024_api_key_limits.sql
│   │       │   ├── 025_instance_install.sql
│   │       │   ├── 025_node_allocations.sql
│   │       │   ├── 025_role_icon.sql
│   │       │   ├── 026_node_category_location.sql
│   │       │   ├── 027_mod_source.sql
│   │       │   ├── 027_security_requests.sql
│   │       │   ├── 028_security_config.sql
│   │       │   ├── 029_applications.sql
│   │       │   ├── 030_instance_install_kind.sql
│   │       │   ├── 031_instance_install_action_id.sql
│   │       │   ├── 032_instance_pages.sql
│   │       │   ├── 033_instance_pages_builtin_seed.sql
│   │       │   ├── 034_api_key_active.sql
│   │       │   ├── 035_instance_display.sql
│   │       │   ├── 036_mod_package.sql
│   │       │   ├── 037_user_suspension.sql
│   │       │   ├── 038_instance_suspension.sql
│   │       │   ├── 039_ddos_security.sql
│   │       │   └── 045_application_files_runs.sql
│   │       └── sqlite/
│   │           ├── 001_init.sql
│   │           ├── 002_settings.sql
│   │           ├── 003_api_keys.sql
│   │           ├── 004_nodes.sql
│   │           ├── 005_node_heartbeats.sql
│   │           ├── 006_templates.sql
│   │           ├── 007_instances.sql
│   │           ├── 008_nodes_token_plain.sql
│   │           ├── 009_panel_logo.sql
│   │           ├── 010_node_drivers.sql
│   │           ├── 011_node_telemetry_quality.sql
│   │           ├── 012_activity_logs.sql
│   │           ├── 013_instance_owner.sql
│   │           ├── 014_role_display_color.sql
│   │           ├── 015_themes.sql
│   │           ├── 016_email_verification.sql
│   │           ├── 017_mods.sql
│   │           ├── 018_user_profile.sql
│   │           ├── 019_node_advanced.sql
│   │           ├── 020_mod_v2.sql
│   │           ├── 021_instance_secrets.sql
│   │           ├── 022_instance_automation.sql
│   │           ├── 023_instance_advanced.sql
│   │           ├── 024_api_key_limits.sql
│   │           ├── 025_instance_install.sql
│   │           ├── 025_node_allocations.sql
│   │           ├── 025_role_icon.sql
│   │           ├── 026_node_category_location.sql
│   │           ├── 027_mod_source.sql
│   │           ├── 027_security_requests.sql
│   │           ├── 028_security_config.sql
│   │           ├── 029_applications.sql
│   │           ├── 030_instance_install_kind.sql
│   │           ├── 031_instance_install_action_id.sql
│   │           ├── 032_instance_pages.sql
│   │           ├── 033_instance_pages_builtin_seed.sql
│   │           ├── 034_api_key_active.sql
│   │           ├── 035_instance_display.sql
│   │           ├── 036_mod_package.sql
│   │           ├── 037_user_suspension.sql (postgres/sqlite only)
│   │           ├── 038_instance_suspension.sql (postgres/sqlite only)
│   │           ├── 039_ddos_security.sql
│   │           └── 045_application_files_runs.sql
│   ├── edge/
│   │   └── client.go                 # Edge client logic
│   ├── embed/
│   │   └── embed.go                  # UI embed
│   ├── health/
│   │   └── health.go                 # Health check endpoints
│   ├── heartbeat/
│   │   └── heartbeat.go              # Heartbeat monitoring
│   ├── install/
│   │   ├── engine.go                 # Installation engine
│   │   └── handler.go                # Install handler
│   ├── lifecycle/
│   │   └── lifecycle.go              # Lifecycle management
│   ├── middleware/
│   │   ├── csrf.go                   # CSRF protection
│   │   ├── middleware.go               # General middleware
│   │   ├── rate_limiter.go             # Rate limiting
│   │   ├── security_headers.go           # Security headers
│   │   ├── security_middleware.go          # Security middleware
│   │   └── validation_middleware.go        # Request validation
│   ├── models/
│   │   ├── activity.go               # Activity model
│   │   ├── api_key.go                # API key model
│   │   ├── authority.go              # Authority model
│   │   ├── instance.go                 # Instance model
│   │   ├── instance_advanced.go        # Advanced instance model
│   │   ├── mod.go                    # Mod model
│   │   ├── models.go                   # Base / shared models
│   │   ├── node.go                     # Node model
│   │   ├── security.go                 # Security model
│   │   └── theme.go                    # Theme model
│   ├── modengine/
│   │   ├── engine.go                   # Module engine core
│   │   ├── eventbus.go                 # Event bus
│   │   ├── pkgstore.go                 # Package store
│   │   ├── runtime.go                    # Runtime (real)
│   │   ├── runtime_noop.go               # Runtime (noop)
│   │   ├── sandbox.go                  # Sandbox
│   │   └── storage.go                  # Module storage
│   ├── permissions/
│   │   ├── engine.go                 # Permission engine
│   │   └── keys.go                     # Permission keys
│   ├── probe/
│   │   └── probe.go                    # Probe functionality
│   ├── repository/
│   │   ├── db.go                       # DB repository base
│   │   ├── activity_repo.go            # Activity repo
│   │   ├── api_key_repo.go               # API key repo
│   │   ├── application_repo.go             # Application repo
│   │   ├── authority_repo.go               # Authority repo
│   │   ├── automation_repo.go              # Automation repo
│   │   ├── device_registration_repo.go       # Device registration repo
│   │   ├── instance_advanced_repo.go         # Advanced instance repo
│   │   ├── instance_page_repo.go               # Instance page repo
│   │   ├── instance_repo.go                  # Instance repo
│   │   ├── mod_repo.go                     # Mod repo
│   │   ├── node_repo.go                    # Node repo
│   │   ├── permission_repo.go              # Permission repo
│   │   ├── role_auth_repo.go               # Role auth repo
│   │   ├── role_repo.go                    # Role repo
│   │   ├── secret_repo.go                  # Secret repo
│   │   ├── security_repo.go                # Security repo
│   │   ├── settings_repo.go                # Settings repo
│   │   ├── smtp_sender.go                  # SMTP sender
│   │   ├── template_repo.go                  # Template repo
│   │   ├── theme_repo.go                   # Theme repo
│   │   ├── user_auth_repo.go                 # User auth repo
│   │   ├── user_repo.go                      # User repo
│   │   └── verification_repo.go              # Verification repo
│   ├── scheduler/
│   │   └── scheduler.go                # Scheduler
│   ├── secretbox/
│   │   └── secretbox.go                # Secret storage
│   ├── security/
│   │   ├── ip_rate_limiter.go            # IP rate limiter
│   │   ├── persistent_rate_limiter.go      # Persistent rate limiter
│   │   └── state.go                        # Security state
│   ├── sysinfo/
│   │   ├── sysinfo.go                    # System info (platform-independent)
│   │   ├── sysinfo_linux.go                # Linux-specific info
│   │   └── sysinfo_other.go                  # Other OS info
│   ├── ui/
│   │   ├── embed.go                    # UI embed
│   │   └── uiFS/                         # UI filesystem
│   │       ├── dist/                         # Dist folder
│   │       │   ├── index.html                      # Embedded HTML
│   │       │   ├── assets/                         # Assets folder
│   │       │   │   ├── index-*.css                     # CSS bundles
│   │       │   │   ├── index-*.js                      # JS bundles
│   │       │   │   ├── react-*.js                      # React runtime
│   │       │   │   ├── router-*.js                     # Router bundle
│   │       │   │   ├── vendor-*.js                     # Vendor bundle
│   │       │   │   ├── xterm-*.css                     # Xterm CSS
│   │       │   │   └── xterm-*.js                      # Xterm JS
│   │       └── src/                          # Source folder
│   └── version/
│       └── version.go                    # Version info
```

---

## Frontend (`panel/frontend/`)

Inspected with `find /test/ks-panel/panel/frontend -type f | sort` + `ls -R` (node_modules excluded).

```
panel/frontend/
├── package.json, package-lock.json    # Dependencies
├── postcss.config.js                   # PostCSS
├── vite.config.ts                      # Vite build config
├── tsconfig.json                       # TypeScript config
├── tailwind.config.js                  # Tailwind CSS
├── index.html                          # Entry HTML
├── src/
│   ├── main.tsx                        # React entry
│   ├── index.css                       # Global styles
│   ├── App.tsx                         # Root app component
│   ├── router.tsx                      # Routing
│   └── features/
│       ├── account/
│       │   ├── api/profile.ts          # Profile API
│       │   └── pages/Account.tsx       # Account page
│       ├── activity/
│       │   ├── components/ActivityCards.tsx  # Activity cards
│       │   └── pages/Activity.tsx         # Activity page
│       │   └── types/activity.ts          # Activity types
│       ├── api-keys/
│       │   ├── pages/ApiKeyDetail.tsx       # API key detail
│       │   ├── pages/ApiKeyForm.tsx          # API key form
│       │   ├── pages/ApiKeys.tsx             # API keys list
│       │   └── types/apiKey.ts               # API key types
│       ├── applications/
│       │   ├── api/applications.ts           # App API (+ run/runs)
│       │   ├── components/ApplicationRunModal.tsx # Run dialog: target node/panel-host, container/VM/host, env
│       │   ├── components/ApplicationStudioTab.tsx # Studio: info/permissions/env/script editor
│       │   ├── pages/ApplicationConfigure.tsx  # App configure
│       │   ├── pages/ApplicationEdit.tsx        # App edit
│       │   ├── pages/Applications.tsx            # App list
│       │   └── types/application.ts              # App types
│       ├── auth/
│       │   ├── api/auth.ts                   # Auth API
│       │   ├── api/me.ts                     # /me API
│       │   ├── api/meAuth.ts                 # Auth helper
│       │   ├── pages/Login.tsx               # Login page
│       │   ├── pages/Register.tsx              # Register page
│       │   └── pages/VerifyEmail.tsx           # Verify email
│       ├── authority/
│       │   ├── api/authority.ts               # Authority API
│       │   ├── pages/Authority.tsx             # Authority page
│       │   └── types/authority.ts               # Authority types
│       ├── database/
│       │   └── pages/Database.tsx              # Database page
│       ├── instances/
│       │   ├── api/instanceAdvanced.ts        # Advanced instance API
│       │   ├── components/InstanceCard.tsx     # Instance card
│       │   ├── components/InstanceTabs.tsx       # Header instance-page tabs
│       │   ├── pages/AdminInstances.tsx          # Admin instances
│       │   ├── pages/InstanceAdvancedPages.tsx   # Advanced pages
│       │   ├── pages/InstanceDetail.tsx          # Instance detail
│       │   ├── pages/InstanceForm.tsx            # Instance form
│       │   ├── pages/InstanceStats.tsx           # Instance stats
│       │   ├── pages/Instances.tsx               # Instance list
│       │   ├── pages/InstancesRouter.tsx         # Instance router
│       │   └── types/instance.ts                 # Instance types
│       ├── mods/
│       │   ├── api/mods.ts                     # Mod API
│       │   ├── pages/ModStudio.tsx             # Mod studio
│       │   ├── pages/Mods.tsx                  # Mods list
│       │   ├── pages/modStudioPresets.ts         # Mod studio presets
│       │   └── types/mod.ts                    # Mod types
│       ├── nodes/
│       │   ├── pages/NodeDetail.tsx            # Node detail
│       │   ├── pages/NodeForm.tsx              # Node form
│       │   ├── pages/NodeStats.tsx             # Node stats
│       │   └── types/node.ts                   # Node types
│       ├── roles/
│       │   ├── pages/RoleForm.tsx              # Role form
│       │   └── pages/Roles.tsx                 # Roles list
│       ├── security/
│       │   ├── components/Authentication.tsx   # Lockout policy + unlock (Security tab)
│       │   ├── components/Sessions.tsx         # Active sessions + revocation (Security tab)
│       │   ├── pages/Security.tsx              # Security page
│       │   └── types/security.ts               # Security types
│       ├── settings/
│       │   ├── api/settings.ts                 # Settings API
│       │   └── pages/Settings.tsx              # Settings page
│       ├── system/
│       │   ├── components/
│       │   │   ├── SystemCharts.tsx         # Chart components (Donut, Gauge, LineChart, Sparkline, etc.)
│       │   │   ├── HostPanel.tsx            # Local host telemetry panel
│       │   │   ├── PanelTab.tsx             # Panel info + update/reinstall flow
│       │   │   ├── IdentityCard.tsx         # Identity card component
│       │   │   └── index.ts                 # Component exports
│       │   ├── hooks/useUpdateInfo.ts   # Shared getUpdateInfo state (dedup)
│       │   ├── pages/System.tsx                # System page
│       │   └── types/system.ts                 # System types
│       ├── templates/
│       │ ├── components/
│       │ │   ├── TemplateForm/
│       │ │   │   ├── TemplateActionsSection.tsx
│       │ │   │   ├── TemplateEnvVariablesSection.tsx
│       │ │   │   ├── TemplateEnvironmentSection.tsx
│       │ │   │   ├── TemplateHealthcheckSection.tsx
│       │ │   │   ├── TemplateInstallSection.tsx
│       │ │   │   ├── TemplateLabelsDevicesSection.tsx
│       │ │   │   ├── TemplatePagesSection.tsx
│       │ │   │   ├── TemplateRuntimeSection.tsx
│       │ │   │   └── TemplateSpecPreviewSection.tsx
│       │ │   └── index.ts
│       │ └── pages/
│       │   ├── TemplateForm.tsx              # Template form
│       │   ├── TemplateStats.tsx               # Template stats
│       │   └── Templates.tsx                 # Templates list
│       ├── themes/
│       │   ├── api/themes.ts                   # Themes API
│       │   ├── components/
│       │   │   ├── ThemeAssignMenu.tsx         # Theme assign menu
│       │   │   ├── ThemePreview.tsx            # Theme preview
│       │   │   └── ThemeStudio/
│       │   │       ├── AccentTab.tsx
│       │   │       ├── BackgroundTab.tsx
│       │   │       ├── ButtonTab.tsx
│       │   │       ├── CardTab.tsx
│       │   │       ├── ComponentsTab.tsx
│       │   │       ├── CustomCSSTab.tsx
│       │   │       ├── DropdownsTab.tsx
│       │   │       ├── FormsTab.tsx
│       │   │       ├── HeaderTab.tsx
│       │   │       ├── LoadingTab.tsx
│       │   │       ├── ShapeTab.tsx
│       │   │       ├── SidebarTab.tsx
│       │   │       ├── TypographyTab.tsx
│       │   │       └── index.ts
│       │   └── pages/
│       │       ├── ThemeStudio.tsx             # Theme studio page
│       │       └── Themes.tsx                  # Themes list
│       │       └── types/theme.ts              # Theme types
│       ├── users/
│       │   ├── pages/UserDetail.tsx            # User detail
│       │   ├── pages/UserForm.tsx              # User form
│       │   └── pages/Users.tsx                 # Users list
│       └── builtin-pages/
│           ├── index.ts                        # BUILTIN_PAGE_MANIFEST + getBuiltinComponent
│           ├── types.ts                        # BuiltinPageManifestEntry / BuiltinPageManifest
│           ├── _shared.tsx                     # Shared helpers (Skeletons, Boundary, errText)
│           ├── Home.tsx                        # Instance overview with status and actions
│           ├── Files.tsx                       # File manager with upload/edit
│           ├── Network.tsx                     # Port forwarding overview
│           ├── Terminal.tsx                    # Interactive terminal
│           ├── Settings.tsx                    # Resource limits and runtime policy
│           ├── Env.tsx                       # Environment variables and secrets
│           ├── Automation.tsx                # Scheduled tasks and automation
│           ├── Processes.tsx                 # Running processes monitor
│           ├── Metrics.tsx                   # Real-time metrics with charts
│           ├── Ports.tsx                     # Listening sockets
│           ├── Backups.tsx                   # Snapshot management
│           └── Audit.tsx                     # Audit log
│   ├── lib/
│   │   ├── builtin/
│   │   │   ├── Audit.tsx
│   │   │   ├── Automation.tsx
│   │   │   ├── Backups.tsx
│   │   │   ├── Env.tsx
│   │   │   ├── Files.tsx
│   │   │   ├── Home.tsx
│   │   │   ├── Metrics.tsx
│       │   │   ├── Network.tsx
│       │   │   ├── Ports.tsx
│       │   │   ├── Processes.tsx
│       │   │   ├── Settings.tsx
│       │   │   ├── Terminal.tsx
│       │   │   └── _shared.tsx
│       │   │     └── types.ts
│       │   │     └── index.ts
│       │   └── shared/
│       │       ├── api/
│       │       │   ├── admin.ts                # Admin API client
│       │       │   └── client.ts               # Base API client
│       │       └── components/
│       │           ├── forms/
│       │           │   ├── FormPage.tsx          # Form page component
│       │           │   └── LocationField/LocationField.tsx
│       │           │       └── countries.ts      # Country list
│       │           └── layout/
│       │               ├── Header.tsx            # Header
│       │               ├── InstanceNavContext.tsx  # Instance nav context
│       │               ├── Layout.tsx              # Main layout
│       │               ├── RouteThemeSync.tsx      # Theme sync
│       │               ├── Sidebar.tsx             # Sidebar
│       │               └── ThemedBackground.tsx    # Background
│       │       ├── ui/
│       │           ├── AuroraBackground.tsx      # Aurora background
│       │           ├── Avatar.tsx                # Avatar
│       │           ├── Card.tsx                  # Card
│       │           ├── CardMediaLayer.tsx          # Card media layer
│       │           ├── CardMenu/CardMenu.tsx       # Card menu
│       │       ├── CustomPageView.tsx          # Custom page view
│       │       ├── customPageSdk.ts              # Custom page JavaScript SDK
│       │           ├── ExpandableSearch.tsx        # Expandable search
│       │           ├── FullScreenLoading.tsx       # Full screen loading
│       │           ├── Field.tsx                   # Field input
│       │           ├── LimitSelect.tsx             # Limit select
│       │           ├── Loading.tsx                 # Loading spinner
│       │           ├── MarkdownBio.tsx             # Markdown bio
│       │           ├── MetricsChart.tsx            # Metrics chart
│       │           ├── Modal.tsx                 # Modal
│       │           ├── RequireAuth.tsx             # Require auth
│       │           ├── RequirePermission.tsx         # Require permission
│       │           ├── RichMenu/
│       │           │   ├── RichMenu.tsx
│       │           │   ├── icons.tsx
│       │           │   └── index.ts
│       │           └── types.ts
│       │       ├── constants/                  # Constants (empty dir observed)
│       │       ├── hooks/
│       │       │   └── useInstance.ts            # Instance hook
│       │       ├── stores/
│       │       │   ├── authStore.ts              # Auth store
│       │       │   ├── prefsStore.ts               # Preferences store
│       │       │   └── settingsStore.ts              # Settings store
│       │       ├── styles/                     # Shared styles (empty dir observed)
│       │       ├── types/
│       │           ├── apiKey.ts                 # Shared API key types
│       │           ├── application.ts              # Shared app types
│       │           ├── authority.ts                # Shared authority types
│       │           ├── instance.ts                 # Shared instance types
│       │           ├── instanceAdvanced.ts           # Shared advanced instance types
│       │           ├── instancePage.ts               # Shared page types
│       │           ├── mod.ts                      # Shared mod types
│       │           ├── node.ts                     # Shared node types
│       │           ├── permissions.ts                # Shared permissions types
│       │           ├── system.ts                   # Shared system types
│       │           └── user.ts                     # Shared user types
│       └── utils/
│           └── instancePages.ts                # Instance pages utility
│   └── theme/
│       ├── defaults.ts                         # Theme defaults
│       └── studioControls.tsx                  # Studio controls
```

---

## Edge Backend (`edge/backend/`)

Exact path inspected with `find /test/ks-panel/edge -type f | sort`.

```
edge/backend/
├── go.mod, go.sum               # Go module definition
├── cmd/ksedge/main.go           # Edge CLI entry (tiny shim -> cli.New().Execute())
└── internal/
    ├── cli/
    │   └── cli.go                 # CLI command builder
    ├── config/
    │   └── config.go              # Config (JSON) loader, defaults, validation
    ├── drivers/
    │   ├── drivers.go               # Driver registry / interfaces
    │   ├── docker.go                # Docker virtualization driver
    │   ├── kvm.go                   # KVM driver
    │   ├── lxd.go                   # LXD driver
    │   ├── multipass.go             # Multipass driver
    │   ├── helpers.go               # Driver helpers
    │   └── inspect_helpers.go       # Inspection helpers for drivers
    ├── exec/
    │   └── handler.go               # Execution handler
    ├── execrpc/
    │   └── handler.go               # Execution RPC handler
    ├── execstage/
    │   └── stage.go                 # Shared env-export + file-staging script builder (exec-rpc & host-exec)
    ├── files/
    │   └── handler.go               # File handler
    ├── health/
    │   └── health.go                # /health endpoint
    ├── heartbeat/
    │   └── heartbeat.go             # Heartbeat monitoring
    ├── hostexec/
    │   └── handler.go               # POST /api/edge/host-exec — one-shot exec on the edge HOST filesystem
    ├── inspect/
    │   └── inspect.go               # Inspection functionality
    ├── install/
    │   ├── engine.go                # Installation engine
    │   └── handler.go               # Install handler
    ├── lifecycle/
    │   └── lifecycle.go             # Lifecycle management
    ├── pageaction/
    │   └── handler.go               # Page action handling
    ├── snapshot/
    │   └── handler.go               # Snapshot functionality
    └── telemetry/
        └── telemetry.go             # Telemetry collection
```

---

## Additional Notes for AI Models

- `loop.md` mandates: Map First (`map.md`), Scoped Navigation (no broad `/` searches), Zero Assumptions (verify every output), Twice Check (read modified files twice, verify build/test twice).
- All file paths above are verified by `find` / `ls` / `cat` / `head` commands executed directly against `/test/ks-panel/`.
- No file references are guessed; any new file must be added to this map immediately per `loop.md` "Map Maintenance".
- `rebuild.sh` is the final verification gate; it must pass after any file edit.