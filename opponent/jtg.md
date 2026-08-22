> **Note:** Sections 12–16 appear as primary content; sections 18–24 contain complementary/enhanced detail — cross-referenced where duplicated.
> 
# JTG Panel v3.0.0 — Source-Replica Documentation

> **Scope:** All frontend feature documentation from cloned JTG source at `/tmp/Jtg/src/`  
> **Canonical output:** `/test/ks-panel/opponent/jtg.md`

---

## 1. PROJECT OVERVIEW

**JTG Panel** is a self-hosted, Pterodactyl-inspired game server management panel (v3.0.0) that lets users create, manage, and monitor VPS instances across a multi-node infrastructure. It's built with a Node.js + Express + MongoDB backend and a Next.js + React + Tailwind CSS frontend, plus a client-side installer wizard.

**Key capabilities:**
- Multi-node server deployment across dedicated machines
- Game server lifecycle management (create, start, stop, restart, delete)
- Live terminal console with Socket.IO streaming
- Full file manager, SFTP credential management
- Minecraft-specific tools: properties editor, player manager, mod/plugin installer, world import
- Generic app/runtime support: Node.js, Python, any custom command
- Sub-user permission management (9 granular permissions per server)
- Playit.gg tunnel creation with claim-link flow
- Admin panel for system-wide user management, node monitoring, and API key access
- Audit / statistics dashboards
- Admin invite system with email verification
- Local desktop app version (Electron-based)

---

## 2. TECH STACK

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS 3.x (dark-mode-first) |
| Icons | lucide-react |
| HTTP Client | Axios (custom instance with auth interceptors) |
| Real-time | Socket.IO client |
| Auth | react-oauth/google, custom JWT |
| Animation | Framer Motion (AnimatePresence, scaleIn, variants) |
| State | React Context API (auth, theme, settings, node) |

### Backend (serving/seeding structure)
- Express.js + MongoDB
- Socket.IO server
- JWT + Passport.js authentication
- Docker / LXC container management for server isolation

---

## 3. CODE CONVENTIONS

- **Naming:** PascalCase components, camelCase state/variables, kebab-case CSS classes
- **Icons:** All lucide-react imports prefixed with `Icon` aliases (e.g., `Icon as Package`)
- **API calls:** All via custom `axios` instance stored as `api` import; `baseURL` set at build
- **Theme:** `'dark'` theme is default/primary; `'light'` is alternate
- **Communications:** Success (emerald-500), warning (amber-500), error (rose-500), info (blue-500)
- **Status fill colors:** gray-50 = loading (light bg), bg-* for solid color
- **Error states:** Always use `ExclamationCircle` or `AlertCircle` with corresponding color
- **Loading skeletons:** Spinning RefreshCw icon in a glass card
- **Cards:** `rounded-2xl`, `border border-white/10`, `bg-white/5`, `backdrop-blur-xl`
- **Motion:** `AnimatePresence` for mount/unmount; `variants` for spring-entrance on page switch

---

## 4. ROUTING (`src/app/`)

### 4.1 Public Routes (no auth)
| Route | Page | Access |
|-------|------|--------|
| `/` | Home | Auth → `/servers` |
| `/login` | Login.tsx | Unauthenticated only |
| `/register` | Register.tsx | Unauthenticated only |
| `/forgot-password` | ForgotPassword.tsx | Unauthenticated only |
| `/reset-password?token=` | ResetPassword.tsx | Any |
| `/verify-email?token=` | EmailVerification.tsx | Any |

### 4.2 Protected Routes (authenticated)
| Route | Page | Role |
|-------|------|------|
| `/servers` | ServerList.tsx | All authenticated |
| `/account` | AccountPage.tsx | All authenticated |
| `/nodes` | Nodes.tsx | All authenticated |
| `/api-keys` | ApiKeys.tsx | Super admin |
| `/admin` | AdminPage.tsx | Admin / Owner |
| `/pending-invitations` | PendingInvitations.tsx | Pending invitees |

### 4.3 Dynamic Server Routes
| Route | Page |
|-------|------|
| `/servers/:id` | ServerView.tsx (→ ServerConsole) |
| `/servers/:id/files` | FileManager |
| `/servers/:id/sftp` | ServerSFTP |
| `/servers/:id/subusers` | SubUsersManager |
| `/servers/:id/backup` | ServerBackups |
| `/servers/:id/settings` | ServerSettings |
| `/servers/:id/properties` | ServerProperties |
| `/servers/:id/players` | PlayerManager |
| `/servers/:id/world` | WorldManager |
| `/servers/:id/plugins` | PluginManager |
| `/servers/:id/mods` | ModManager |
| `/servers/:id/playit` | PlayitTunnel |

### 4.4 Software Type Constants
```ts
const MINECRAFT_TYPES = [
  "PAPER","SPIGOT","VANILLA","FORGE","FABRIC",
  "PURPUR","BUNGEECORD","VELOCITY","WATERFALL","NEOFORGE","QUILT"
]
const PROXY_TYPES = ["VELOCITY", "BUNGEECORD", "WATERFALL"]
```

---

## 5. STYLING & THEMES

### 5.1 Theme System
- Three themes: `dark` (default), `light`, `system`
- `ThemeProvider` wraps entire app
- `useTheme()` hook from `src/hooks/useTheme.ts` for runtime toggle
- Class strategy: `data-theme` attribute with CSS custom properties / DaisyUI or similar framework
- `localStorage` key: `jgt-panel-theme`

### 5.2 Design Language: "Dark Glass"
```
Card:   rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
Input:  bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-white/30
Button: rounded-xl px-4 py-3 font-medium transition-all
Hover:  hover:bg-white/10, hover:border-white/20
```

### 5.3 Status Colors
| Status | Light bg | Dark bg |
|--------|---------|---------|
| Online / Active | green-200 / emerald-500 | emerald-500/20 + emerald-400 border |
| Warning | amber-200 | amber-500/20 |
| Error | red-200 | rose-500/20 |
| Offline / Stopped | gray-200 | gray-500/20 |
| Loading | gray-100 | gray-400/20 |

### 5.4 Typography
- `font-inter`: Body text
- `font-mono`: Code, terminal output, file paths (`/world`, `server.properties`)
- Font sizes: `xs` (0.75rem), `sm` (0.875rem), `base` (1rem), `lg` (1.125rem), `xl` (1.25rem), `2xl` (1.5rem)

### 5.5 Animations
- Page entrance: `scaleIn` variant with `spring: { stiffness: 200, damping: 20 }`
- Modals: AnimatePresence with spring scale from 0.95 + opacity fade
- Toast slides in from top-right, auto-dismiss configurable per instance
- Number counters: `FormattedNumber` with 400ms cubic-bezier(0.2, 0.8, 0.2, 1)

---

## 6. LAYOUT & NAVIGATION

### 6.1 Shell Structure
```
┌──────────────────────────────────┐
│ Mobile: TopBar (hamburger)       │
│ Desktop: SidebarNav (left)       │
├────────────────────┬─────────────┤
│                    │ Breadcrumb  │
│   Main Content     │ Heading     │
│   (bg-gray-900)    │ Subtitle    │
│                    ├─────────────┤
│                    │ Body        │
│                    │ Cards...    │
└────────────────────┴─────────────┘
```

### 6.2 Sidebar Navigation (SidebarNav)
- **Public nav** (unauthenticated): Home, Login, Register
- **Authenticated nav:** Dashboard, My Servers, Account
- **Admin nav:** + Nodes, API Keys, Admin (conditionally shown)
- Active indicator: left border highlight + background tint
- Collapsible on mobile (overlay)
- Dark sidebar with glass-panel feel

### 6.3 Reusable Navigation Components

**BowlingStatusBadge** (`src/components/BowlingStatusBadge.tsx`):
- Shows server status: `online` (green, pulsing dot), `offline` (gray), `starting`, `stopping`
- Optional: CPU/RAM/Disk mini bars

**Stepper** (`src/components/Stepper.tsx`):
- Used in installer for node deployment: Step 1 → Step 2 → Step 3 → Complete
- Gray = pending, theme-400 = active, green-500 = completed
- White connector lines; fill as steps complete

**SearchableDropdown** (`src/components/SearchableDropdown.tsx`):
- Generic two-column picker: left = search input, right = scrollable results
- Returns OpenAI-compatible `{ id, name }` objects
- Used for: version selection, user assignment, IP alias

---

## 7. CONTEXT PROVIDERS

### 7.1 AuthContext (`src/hooks/useAuth.tsx`)
- `user`: merged `profile` + `role` from `/api/auth/me`
- `login(email, pw)` / `register(username, email, pw)` / `logout()`
- Token: stored in `localStorage` as `jgt-panel-token`
- Axios interceptor: `Authorization: Bearer {token}` on every request

### 7.2 ThemeContext (`src/hooks/useTheme.ts`)
- `theme: 'dark' | 'light' | 'system'`
- Sets `data-theme` on `<html>` root
- Persists to `localStorage.jgt-panel-theme`

### 7.3 ServerListContext (`src/hooks/useServerList.ts`)
- Aggregates `/api/servers` data
- `servers: Server[]`, `loading`, `error`
- Refresh function exposed

### 7.4 NodeContext (`src/hooks/useNode.ts`)
- Node stats: `cpu`, `memory`, `disk`
- Instances count, node name, address

---

## 8. DASHBOARD & SERVER LIST (`src/pages/ServerList.tsx`)

**Route:** `/servers`  

### 8.1 Fetch Behavior
- On mount: `GET /api/servers` 
- Also fetches node list and current user profile

### 8.2 Server List Card
```
┌─────────────────────────────────┐
│ Status dot  Server Name         │
│             UUID: xxxxx         │
│ Software: Paper v1.20.4         │
│                                 │
│  [Start] [Stop] [Restart] [Del] │
│                                 │
│ Console    Files    Settings    │
│ RAM: ●●●●●● 2/4 GB             │
└─────────────────────────────────┘
```

**Fields displayed per server:**
- `name`, `uuid`, `type`, `version` → formatted as "Paper v1.20.4"
- `status` → colored Badge (running=emerald, starting=amber, stopped=gray)
- `ram` → "X / Y GB" with visual progress bar

### 8.3 Action Buttons
- Start → POST `/api/servers/{id}/start`
- Stop → POST `/api/servers/{id}/stop`
- Restart → POST `/api/servers/{id}/restart`
- Delete → show confirmation, then DELETE

### 8.4 Navigation links (under action buttons)
- Console → `/servers/{id}`
- File Manager → `/servers/{id}/files`
- Settings → `/servers/{id}/settings`
- (conditional) Sub-Users → `/servers/{id}/subusers`

### 8.5 Suspend State
Full-screen lock card when server is suspended:
> "Server Suspended"
> Contact administrator to lift suspension.

### 8.6 RAM Warning
If server RAM > total system RAM, shows confirm dialog:
> "Warning: Allocated RAM exceeds node capacity."
> Continue anyway? / Cancel

### 8.7 Add Server Each Button
`isNodeAvailable = nodes.n > 0 && nodeStatus !== 'suspended'`  
If true: shows "Create Server" button with Plus icon → `/install`

### 8.8 Live Stats Card
`<ServerLiveStats>` component:
- Polls `GET /api/servers/{id}/stats` every 5s
- Shows: Live RAM `{liveRam/1024} GB / {limitRam} GB`
- Static: gray, live: emerald

---

## 9. CREATE SERVER / INSTALLER (`src/pages/InstallWizard.tsx`)

**Route:** `/install`  
**Access:** Authenticated users with available nodes

### 9.1 Installer Stepper (3 Steps + Complete)

```
[Step 1] → [Step 2] → [Step 3] → [Complete]
  Choose    Configure     Deploy
```

**Step 1 — Choose Server Type:**
- Grid of software cards with icons, names, tags
- Search bar filters tags/names

**Software types & defaults:**
| Type | Tag | Description |
|------|-----|-------------|
| Paper | MCP | Minecraft: Paper |
| Spigot | MCP | Minecraft: Spigot |
| Vanilla | MCP | Minecraft: Vanilla |
| Forge | MCP | Minecraft: Forge |
| Fabric | MCP | Minecraft: Fabric |
| Purpur | MCP | Minecraft: Purpur |
| BungeeCord | MCP | Minecraft: Bungee Cord |
| Velocity | MCP | Minecraft: Velocity |
| Waterfall | MCP | Minecraft: Waterfall |
| Node.js | AAL | Node.js |
| Python | AAL | Python |
| NeoForge | MCP | Minecraft: Neo-Forge |
| Quilt | MCP | Minecraft: Quilt |

- Tags mapped: MCP (emerald, Crosshair icon), AAL (amber, Cpu icon)
- Selected card: border AmericanRiver-500 or AmericanRiver-400

**Step 2 — Properties:**
- Server Name input
- RAM allocation slider (1–32 GB, 1GB intervals)
- Runtime Version dropdown (all versions fetched from backend)
- Java Version dropdown (only for Minecraft types)
- Node selector dropdown (available nodes)
- Deployment explanation text
- "Proceed to Deployment" button

**Step 3 — Deploy:**
- Summary card: all selected settings in a bordered box
- "Deploy Server" button
- Clicking: POSTs config → switches to Complete with animation

**Complete State (Spring Animation):**
- CheckCircle icon (green-500)
- title: "Success!"
- subtitle: "Server {name} has been created"
- Steps list with checkmarks: Created, Configured, Deployed
- "Go to Dashboard" button → `/servers`
- 3-step connector lines fill emerald-500 from left to right

### 9.2 Context Requirement
- Must have at least 1 available node (getNodes() from NodeContext)
- If `isNodeAvailable` is false: hides installer, shows link to Nodes page

---

## 10. AUTHENTICATION PAGES (`src/pages/`)

### 10.1 Login (`src/pages/Login.tsx`)
**Route:** `/login?redirect={path}`  
**Access:** Only when NOT authenticated

- Email field with Mail icon
- Password field with Lock icon (show/hide toggle via Eye/EyeOff)
- Submit → calls `login(email, password)` (API: POST `/api/auth/login`)
- Button shows spinning Next.js orb icon during auth
- On success: `router.push(redirect || '/servers')`
- Navigation links: "Create an account" → `/register?redirect={path}`, "Forgot password?" → `/forgot-password`
- Layout: centered glass card, decorative background orbs  

### 10.2 Register (`src/pages/Register.tsx`)
**Route:** `/register?redirect={path}`  
**Access:** Only when NOT authenticated

**Standard registration:**
- Username (User icon), Email (Mail icon), Password (Lock + visibility toggle), Confirm Password
- Submit → POST `/api/auth/register {username,email,password}`
- On success: `router.push(redirect || '/servers')`

**Google OAuth:** `react-google-button` → calls `signInWithGoogle()` → POST `/api/auth/oauth/google`

**Admin invite flow** (when `inviteCode` in localStorage):
- Shows: "Complete your account setup"
- Fields: Name, Email (pre-filled from invite), Password
- No username field (filled by invite)
- Calls `completeAdminInvite(inviteCode, name, email, password)`
- Clears localStorage on completion

**Navigation:** "Already have an account? Log in" → `/login?redirect={path}`

---

## 11. ACCOUNT PAGE (`src/pages/AccountPage.tsx`)

**Route:** `/account`  
**Access:** Any authenticated user

**Layout:** `PageHeader(title="Account", subtitle="PREFERENCES")` + motion.div fade-in entrance + `LoadingOverlay` when username/password is changing

**Account section (Card: bg-card border border-border-subtle):**

**Info grid (2 columns on md+):**
- Username: `user.username` (read-only)
- Access Role: Owner (Crown amber), Admin (Shield theme), Member (User gray)

**Change Username** (Google Authenticated Users only — `user.isGoogleUser || user.googleId`):
- Input for new username (min 3 characters)
- "Save Username" → `PUT /api/auth/username {newUsername}` → updates user via `updateUser()` in AuthContext
- Success/error toast banner
- "admin" username is locked (cannot change)
- Note: "Google Authenticated Users can update their display username at any time without impacting their Google login credentials."

**Change Password** (non-Google users only):
- Current password + New password (min 8 chars) inputs
- Submit → `PUT /api/auth/password {oldPassword, newPassword}`
- On success: "You will be logged out." then calls `logout()`
- "admin" default password cannot be changed (shows warning message)

**Does NOT include:** Firebase config, branding, theme, features, API keys, or user management — those are in AdminSettingsPage

---

## 12. ADMIN PAGES

### 12.1 AdminServers (`src/pages/AdminServers.tsx`) — 330 lines

**Route:** `/admin/servers`  
**Access:** Admin / Owner

> ⚠️ Duplicate — see **§12.1** for the same content. Included here for section continuity.

**Fleet Administration:** Full uniform dark theme (zinc-gray palette, `#121214` cards)

**Server list:**
- Search bar: filters by name or ID (case-insensitive)
- Per-server row: icon badge + name, type/version, "Owner: {username}", SUSPENDED badge if suspended
- "Console" button → `/servers/{id}`

**Action menu (⋯ button per server):**
- Edit Resources → modal: RAM (GB), CPU (%), Disk (GB) → `PUT /api/servers/{id}/resources`
- Suspend / Manage Suspension → modal: dropdown [Not Suspended, 24 Hours, 1 Week, 1 Month, 2 Months, Permanent] → `PUT /api/servers/{id}/suspend`
- Delete Server → confirm → `DELETE /api/servers/{id}`

**Three Framer Motion modals** (initial opacity 0, scale 0.95 → animate 1, 1):
- Edit Resources: form with number inputs
- Suspend: select dropdown
- Delete: red danger button + alert-style header

### 12.2 AdminSettingsPage (`src/pages/AdminSettingsPage.tsx`) — 1183 lines

**Route:** `/admin/settings`  
**Access:** Owner or Admin only (renders "You do not have permission" if neither)

**Layout:** Left sidebar (256px, `bg-ink border-r border-line`) + top header + scrollable content max-w-4xl centered. Sidebar has "ADMIN PANEL" title + 7 tab buttons with `motion.div` active indicator (`layoutId="activeAdminTab"` spring).

**Tabs (adminTabs array):**

**Tab 1: Branding (Layout icon)**
- Panel Name input → `PUT /api/system/settings {panelName}`
- Panel Logo: 80x80 rounded image, hover shows trash to remove→ PUT `{panelLogo: ""}`, upload button opens file picker → base64 → ImageCropper → PUT `{panelLogo}`
- Background: image upload → PUT `{panelBackgroundImage}`, custom URL input, Reset button (clears both bg + blur), 4 Unsplash presets (Deep Space, Cyberpunk City, Dark Abstract, Neon Horizon)
- Blur slider: 0-50px, saves on mouseup/touchend → PUT `{panelBackgroundBlur}`
- Theme Accent: 9-color grid (red/blue/purple/cyan/green/amber/orange/rose/white)

**Tab 2: Features (Settings icon)**
- 4 toggle switches: Playit Tunnel, Onboarding Tutorial, Cinematic Login Intro, User Registration
- Each: custom toggle → PUT immediately on change

**Tab 3: Runtime** (dev only, `isDev` gate)
- Signal banner if `runtimeLocked`: "re-run bash install.sh or edit .env"
- 2 option cards: Docker (Container Isolation, theme-500 emerald badge) vs Local Process (amber badge)
- Active card: ring, shadow, "Active" pill badge
- Saves: PUT `/api/system/settings {defaultRuntime: "docker"|"local"}` with auth header from localStorage
- Info box: "existing servers can be migrated under each server's Settings → Runtime Migration tab"

**Tab 4: Appearance (Image icon)**
- See Branding Tab section (combined in this implementation — appears in both Account and Admin pages same components)

**Tab 5: Authentication (Key icon)**
- Calls renderGoogleFirebase() function: Google Login toggle + 6 Firebase config inputs + Save + Test Connection button
- Firebase test: `initializeApp(config)` with unique app name from timestamp → `deleteApp()` → validates
- 4-step inline setup guide with Firebase Console link
- Status banner: checkmark (success) or AlertCircle (error)

**Tab 6: Users (User icon)**
- Renders `<AdminControls>` component (see §20.2)

**Tab 7: System (RefreshCw icon)**
- "Update Panel" button: `POST /api/system/update`
- Shows spinner during update, disables button

**Loading states:** All major operations → `{condition && <LoadingOverlay />}` at bottom of render

### 12.3 ApiKeysPage (`src/pages/ApiKeysPage.tsx`)

**Route:** `/api-keys`  
**Access:** Super admin only

**Layout:** Uses ApiKeysManager component from `src/components/ApiKeysManager.tsx`

**Two tabs in ApiKeysManager:**
1. **Generate Key** button → form with "Key Label (Optional)" → POST `/api/admin/api-keys {label, scopes: ["*"]}` → displays key ONCE with copy button → auto-switches to List
2. **API Key List:** shows all keys with label, created date, last-used date. Revoke inline confirmation (Yes/No). Revoked keys: "REVOKED" badge + dimmed.

---

## 13. NODES PAGE (`src/pages/Nodes.tsx`) — 704 lines

**Route:** `/nodes`  
**Access:** Any authenticated user  

**Header:**
- Title: "Host & Wings Nodes" + emerald "Live" pulsing badge
- Description: "Real-time telemetry, hardware usage metrics, and daemon cluster management."
- Refresh button + "Add Wings Node" button (theme-600 styled)

**4-column summary stats row:**
1. Active Nodes (count, Server icon, theme-400)
2. Hosted Instances (total serversCount, Layers icon, blue-400)
3. Cluster Status (CheckCircle2 + "100% Operational", emerald)
4. Telemetry Stream ("3.5s Polling", Zap icon, amber)

**Node cards (per-node, rounded-2xl border white/10, bg-zinc-950/70):**

**Top bar:**
- Server icon badge + node name + Online badge + Local Engine OR Wings Agent badge (blue/purple)
- Endpoint: `{hostname}:{apiPort}` with Copy button (2s cooldown checkmark) + Uptime (Clock icon)
- Right: "N Servers" link → `/servers` + Trash2 delete button (non-local only)

**Stats grid (3 columns):**

1. **CPU Usage:** current value (%), thread count, LiveSparkline chart (red/rose, area fill gradient, animated pulse at latest point)
2. **RAM Allocation:** usedGB/totalGB display, percent, freeGB, thin progress bar (gradient blue→cyan)
3. **Disk Capacity:** usedGB/totalGB display, percent, availableGB, thin progress bar (gradient emerald→teal)

**LiveSparkline component:** SVG sparkline with C bezier curves, area gradient fill, animated latest point (animate-pulse). History: stores last 20 data points per node (`curHistory.slice(-19) + new`).

**Node types:**
- `isLocal: true` → "Local Engine" badge → cannot be deleted (alert on attempt)
- `isLocal: false` → "Wings Agent" badge (purple) → can be deleted

**Add Wings Node modal:**
- Form: Node Identifier Name, Hostname/FQDN, Daemon API Port, Total Memory (MB), Total Disk (MB), SSL checkbox, Wings Bearer Token (password input)
- POST `/api/nodes` → reloads grid
- Cancel / Deploy Node buttons

**Comment from code:** "Connect your host daemon or a Pterodactyl Wings node to start orchestrating containers."

**Polling:** Background `setInterval` at 3.5s, manual refresh button also triggers fetch + `setTimeout(500ms)` for spinner reset.

---

## 14. SERVER SUB-PAGES (in `ServerView.tsx` sidebar routing)

### 14.1 ServerView Container (`src/pages/ServerView.tsx`) — 440 lines

**Route:** `/servers/:id/*` (catch-all for sub-pages)  
**Behavior:** Fetches server data on mount + every 5s. Socket.IO for live console. Manages sidebar navigation, suspended state, and suspended server lock screen.

**Fetch:** GET `/api/servers/{id}` on mount→ 5s polling + GET stats for RAM warning check

**RAM warning:** If `server.ram > totalSystemRam`, shows confirm dialog before starting

**isProcessing:** Disabled all action buttons during operation

**Suspended server:** Full-screen lock with "Server Suspended" + Lock icon + link back to `/servers`

**Sidebar tabs (dynamic by type):**

`isGenericApp = ["NODEJS","NODE","PYTHON","PYTHON3"].includes(serverTypeUpper)`  
`isProxy = ["VELOCITY","BUNGEECORD","WATERFALL"].includes(serverTypeUpper)`

| Tab | Generic App | Minecraft (non-proxy) | Conditions |
|-----|------------|----------------------|------------|
| Console/Terminal | ✓ | ✓ | Always first |
| Players | | ✓ | After Terminal |
| Properties | | ✓ | After Players |
| World | | ✓ | After Properties |
| File Manager | ✓ | ✓ | Both |
| SFTP Details | ✓ | ✓ | Both |
| Sub-Users | ✓ | ✓ | Both |
| Plugins | ✓ | ✓ | Type in [PAPER,SPIGOT,PURPUR,BUNGEECORD,VELOCITY,WATERFALL] |
| Mods | ✓ | ✓ | Type in [FORGE,FABRIC,NEOFORGE,QUILT] |
| Playit Tunnel | ✓ | ✓ | `enablePlayit && isDev` |
| Backup | ✓ | ✓ | At end |
| Settings | ✓ | ✓ | At end |

**Sub-routes (inside catch-all):**
- `/` → ServerConsole
- `/players` → PlayerManager
- `/properties` → ServerProperties
- `/world` → WorldManager
- `/files` → FileManager
- `/sftp` → ServerSFTP
- `/subusers` → SubUsersManager
- `/settings` → ServerSettings
- `/backup` → ServerBackups
- `/plugins` → PluginManager
- `/mods` → ModManager
- `/playit` → PlayitTunnel (if `enablePlayit`)

### 14.2 ServerConsole (`src/components/ServerConsole.tsx`) — 738 lines

**Props:** `{ serverId, server: { name, version, type, port, status, startedAt } }`

**State:**
| State | Purpose |
|-------|---------|
| `logs: string[]` | Terminal lines (max 400) |
| `command: string` | Current input |
| `cmdHist: string[]` | Last 50 commands |
| `histIdx: number` | History cursor |
| `stats: ServerStats` | CPU/RAM/Disk |
| `autoScroll: boolean` | Auto-follow |
| `unreadCount: number` | Missed while scrolled |
| `startedAt: string\|null` | Start timestamp |
| `uptime: string` | HH:MM:SS |
| `uptimeHuman: string` | "2h 15m 30s" |

**ServerStats interface:** `{ cpu, ram, disk, limitRam, limitCpu, limitDisk, isRunning, status, startedAt, uptimeSeconds }`

**Socket.IO (live logs):**
```ts
io({ auth: { token }, reconnectionAttempts: 15, reconnectionDelay: 1500, reconnectionDelayMax: 4000 })
```
- On connect: `joinServer(serverId)`; on `log` event: append line (capped at 400); if not auto-scrolling: `unreadCount++`

**Stats polling:** GET `/api/servers/{id}/stats` every 2000ms → CPU/RAM/Disk

**Uptime ticker:** 1s interval → calculates from `startedAt` timestamp

**Send command:** POST `/api/servers/{id}/command {command}` → shows `> {cmd}` in log; on error: `[Error] Command failed: {message}`

**Quick Commands section:** Context-sensitive:
- Node.js: `node -v`, `npm -v`, `npm list`, `npm test`
- Python: `python3 --version`, `pip list`, `pip check`
- Minecraft: `list`, `tps`, `save-all`, `whitelist list`, `gamerule keepInventory true`, `reload confirm`, `stop`

**Log rendering:** Color-coded by prefix pattern — command (prompt+white), `[System]/[CONSOLE]` (tag+gray), Minecraft timecodes (rose=error/amber=warning), plain (white)

**Vitals dock (bottom):** CPU % bar, RAM used/limitM bar, Disk used/limitG bar

**Header:** Server name + version + uptime + start time + port; status badge (emerald Online with pulse, gray Stopped); Clear log button

### 14.3 PlayerManager (`src/components/PlayerManager.tsx`) — 314 lines

**Interface:** `{ name, joinedAt?, isOp? }`

**Socket.IO:** Joins server room, sends `list` command, parses:
- `{name} joined the game` → add
- `{name} left the game` → remove
- `players online: {names}` → full sync
- Regex: `/:\\s+([a-zA-Z0-9_]{3,16})\\s+joined the game/i`

**Quick Player Command dock (top):** Username input + 5 action buttons (OP/De-OP/Kick/Ban/Whitelist) → send MC command via console

**Player cards (grid 2-col):** minotar.net avatar (40px, transparent fallback), name, joinedAt, 4 inline action buttons (OP/Kick/Ban/IP-Ban) with loading state

**Header:** "X Players Online" badge + Refresh button

### 14.4 ServerProperties (`src/components/ServerProperties.tsx`) — 232 lines

**Edits `server.properties` via GET/POST to `/api/servers/{id}/files` with path + save endpoint.**

**10 common properties (shown as individual cards in 2-col grid):**
`online-mode`(bool), `pvp`(bool), `hardcore`(bool), `allow-flight`(bool), `enable-command-block`(bool), `gamemode`(select), `difficulty`(select), `max-players`(number), `motd`(text), `view-distance`(number)

**UI:** Key shown in monospace at card bottom. Boolean = toggle, Select = dropdown, Number/Text = input. "Advanced Properties" section = rest of file as editable textarea.

### 14.5 WorldManager (`src/components/WorldManager.tsx`) — 452 lines

**Props:** `{ serverId, server, onNavigateToFileManager? }`

**Flow (handleAutoImport):**
1. If running → POST `/api/servers/{id}/stop`, wait 1500ms
2. Upload archive → POST `/api/servers/{id}/files/upload` (root, with progress)
3. POST `/api/servers/{id}/world/import {zipPath, targetFolderName, autoUpdateProperties}`
4. System auto-detects folder by scanning `region`, `data`, `datapacks`, `advancements`
5. Moves contents to `/{targetFolderName}` in root File Manager
6. Deletes uploaded zip and temp extraction folders

**Version compatibility:**
- No world folder → "No active world folder"
- `wvMinor == svMinor` → "Compatible" (emerald)
- `wvMinor < svMinor` → "Older, auto-convert" (amber)
- `wvMinor > svMinor` → "Newer world — CRASH RISK" (rose-400)

**UI:** Left = Active World info card; Right = Upload & Place card; 3-step visual explanation; backup notice

**Accept:** `.zip`, `.tar`, `.gz`, `.tgz`

### 14.6 ServerSFTP (`src/components/ServerSFTP.tsx`) — 307 lines

- CREATE: POST `/api/servers/{id}/sftp/create` → shows host, port, username, password
- Password: hidden by default (`••••••`), toggle Eye/EyeOff, copy button
- "Password generated successfully. Copy it now, it won't be shown again." notice
- RESET: POST `/api/servers/{id}/sftp/reset-password` → "old password immediately becomes invalid", resets to hidden
- Security section: orange alert with compromise procedure
- How to Connect: 5-step guide for FileZilla/WinSCP/Cyberduck

### 14.7 ServerBackups (`src/components/ServerBackups.tsx`) — 213 lines

- CREATE: POST `/api/servers/{id}/backups` → "Zipping files..." spinner
- List: filename, human-readable size, createdAt
- Download: blob GET `/api/servers/{id}/backups/{filename}` → `<a download>` click
- Delete: inline "Delete {filename}? Yes/No" → DELETE
- Permission: `(user?.role === "admin" || user)` — any authenticated user

### 14.8 FileManager (`src/components/FileManager.tsx`) — 1008 lines

**Most complex component. Full virtual file system.**

**State:** `files, path, editingFile, fileContent, uploadProgress, searchQuery, selectedFiles, isLoading/isUnzipping/isZipping/isSaving/isDeleting, openMenuRow, toast, activeModal`

**Editable extensions** (only these open in editor): `.txt .json .yml .yaml .properties .log .conf .ini .sh .bat .cmd .env .toml .xml .md`

**File operations:**
| Action | Method | Endpoint |
|--------|--------|---------|
| List | GET | `/api/servers/{id}/files?path={path}` |
| Open | GET | `/api/servers/{id}/files?path=`+name (ext check) |
| Save | POST | `/api/servers/{id}/files/save {filePath, content}` |
| Create file | POST | `/api/servers/{id}/files/create {filePath}` |
| Create folder | POST | `/api/servers/{id}/files/mkdir {filePath}` |
| Rename | POST | `/api/servers/{id}/files/rename {oldPath, newPath}` |
| Delete | DELETE | `/api/servers/{id}/files {paths[]}` |
| Zip | POST | `/api/servers/{id}/files/zip {dirPath, fileNames, outputName}` |
| Unzip | POST | `/api/servers/{id}/files/unzip {path}` |
| Upload (chunk) | POST | `/api/servers/{id}/files/upload-chunk` (FormData) |
| Upload complete | POST | `/api/servers/{id}/files/upload-complete` |
| Download | GET | `/api/servers/{id}/files/download?path={path}` |

**Icons per type:** Folder (Folder fill), Archive (FileArchive), Code (FileCode), Text (FileText), Other (File default)

**Context menu per file (⋯ button):** Download, Rename, Compress to .ZIP, Extract (archive types only), Resume Upload (`.part` files only), Delete

**Bulk actions bar (floating bottom):** Download Selected (single=direct, multi=zip), Rename (single), Extract (single archive), Zip Selected, Delete Selected, Clear Selection + count badge

**Breadcrumb:** Clickable path segments; double-click folder = enter, double-click file = open

**Quick extend buttons:** `config.yml`, `server.properties`, `settings.json`, `eula.txt`

**Toasts:** AnimatePresence slide-in from top-right, auto-dismiss 3.5s

### 14.9 ServerSettings (`src/components/ServerSettings.tsx`) — 605 lines

**Permission gate:** `canManage = user?.role === "admin" || user?.role === "owner" || server.owner === user?.id`

**Resource update:** `PUT /api/servers/{id} {ram, cpuLimit, diskLimit, port}`

**Sections:**

**1 — Runtime Migration & Conversion** (dev only):
- Shows current runtime: Docker/Local
- Convert button → PUT `/api/servers/{id}/migrate-runtime`
- Runtime Locked banner if `runtimeLocked` from installer

**2 — Runtime Configuration:**
- **Generic App:** locked platform label (Node.js/Python), Runtime Version (SearchableDropdown), Startup Command text input, Docker Image override, "Update Runtime" button with progress bar
- **Minecraft:** Software Type (Paper/Spigot/Fabric/Forge/BungeeCord/Velocity), Software Version (SearchableDropdown), Java Version (Auto-detect/8/11/16/17/21/25), Docker Image, Server JAR, Startup Command, "Re-download JAR" button, "Update Runtime" with progress bar

**3 — Server IP Alias:** text input → PUT

**4 — Server Ownership** (admin/owner): SearchableDropdown of users → save `ownerId`

**Delete Server:** Confirm → DELETE `/api/servers/{id}` → `/servers`

**Side Warning:** If `isProcessing`: lock ring; if `true` for `downloading` or `installing`: disable button; if `true` for `pulsing` (during error): hide result hint

### 14.10 PlayitTunnel (`src/pages/PlayitTunnel.tsx`) — 219 lines

**Route:** `/servers/:id/playit` (via ServerView sub-route)  
**Access:** `enablePlayit` flag must be true

**State:** `status, claimLink, logs, isProcessing, serverRuntimeType`

**Statuses:** `running`, `stopped`, `checking`

**Runtime gate:** If `runtimeType === 'local'` → disabled UI with "Local Process Playit (Beta / Coming Soon)" message + `pointer-events-none`

**Actions:**
- Generate: POST `/api/servers/{id}/playit/start`
- Stop: POST `/api/servers/{id}/playit/stop`
- Restart: same as Generate
- Reset: POST `/reset` then POST `/start` → confirm "Reset agent & IP?"

**Claim link:** "Claim Agent" → opens `claimLink` in new tab if returned

**Terminal:** Fixed 400px height card, monospace font, `white-space: pre-wrap`

**Polling:** `fetchStatus()` every 5s + after each action

---

## 15. API KEYS PAGE (`src/pages/ApiKeysPage.tsx`)
**Route:** `/api-keys`  
**Access:** Super admin  

Renders the `ApiKeysManager` component from `src/components/ApiKeysManager.tsx` with two tabs: Generate API Key and API Key List. Key detail: new keys shown once only, with copy button and "I have stored my key" confirmation.

---

## 16. REUSABLE SUPPORTING COMPONENTS

### 16.1 AdminControls (`src/components/AdminControls.tsx`) — 335 lines
Props-driven sub-component used from AdminSettingsPage's Users tab.

**Create User:** Username + Password + Role select (Owner gets Admin/User dropdown; Admin gets locked "Member" display) → POST `/api/system/users`  
**User Table:** 4 columns — User (avatar+name+auth-type), Assigned Role (icons: Crown/Shield/User badges), Role Control (toggle pair: Member/Admin, owner-only), Actions (Key=change password, Trash=delete with inline confirm "Delete {username}? Yes/No")  
**RBAC:**
- Owner: can demote any admin→user, promote user→admin, delete admin/user (not self)
- Admin: can only create/del

e Member users, change password of anyone except Owner

### 16.2 ApiKeysManager (`src/components/ApiKeysManager.tsx`) — 207 lines

Used in AdminServers or admin sidebar. Two tabs: Generate API Key (form with label) and list (with revoke inline). New key displayed once with copy button. Fetches `GET /api/admin/api-keys`, creates POST `/api/admin/api-keys`, revokes `DELETE /api/admin/api-keys/{id}`.

### 16.3 PageHeader (`src/components/PageHeader.tsx`)

Simple UI: `{ title, subtitle }` → renders centered heading block with optional accent icon. Used in: AccountPage (Account/PREFERENCES), ServerView (server name + status), AdminServers (Manage Servers/FLEET ADMINISTRATION).

### 16.4 Layout (`src/components/Layout.tsx`) — 123 lines

Manages the persistent app shell: sidebar (collapsible for desktop, slide-in overlay for mobile) + top header + scrollable content area. Special-case: `/servers/:id`, `/servers/create`, `/admin/settings` render without sidebar. Header shows panel logo/name (links `/`), global search icon (Cmd+K), notifications icon, green "ALL SYSTEMS GO" badge. Calls `window.dispatchEvent(new CustomEvent('toggle-sidebar'))` for sidebar toggle. Content area: full height, `overflow-auto`, with `p-4 sm:p-6 md:p-8` max-w-7xl container.

### 16.5 Sidebar (`src/components/Sidebar.tsx`)

Desktop: collapsible (80px icon-only fully collapsed, full-width expanded). Mobile: translated -100%, opens with backdrop + overlay. Sections: Dashboard, My Servers, Account (all users); Fleet, API Keys, Nodes (admin/owner). Active route: left-border + tinted bg. Closes on route change via `onClose` callback.

### 16.6 GlobalSearchModal (`src/components/GlobalSearchModal.tsx`) — 322 lines

Cmd/Ctrl+K trigger. Fetches `GET /api/servers` on open. Searches servers (name/id/software/ipAlias/port) + 6 static nav links. Arrow key nav + Enter. ESC to close. NULL state: "No matching results found" with Search icon.

### 16.7 GlobalBackground (`src/components/GlobalBackground.tsx`) — 35 lines

`fixed inset-0 z-0 pointer-events-none`: renders background image URL (from SettingsContext) with blur + scale(1.08) anti-artifact trick + `bg-zinc-950/40 backdrop-brightness-75` dark overlay. Toggles `has-bg-image` class on `<html>`. Null render when no image set.

### 16.8 LoadingOverlay (`src/components/LoadingOverlay.tsx`)

`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center`: spinning badge + "Loading..." text. Shown during: settings save, logo upload, password change, user creation, system update.

### 16.9 NotificationsDropdown (`src/components/NotificationsDropdown.tsx`)

Positioned in header right (beside search). Bell/Settings icon. Dropdown lists system alert items. Uses socket event or polling to fetch latest alerts.

## 17. GLOBAL COMPONENTS

### 17.1 GlobalBackground (`src/components/GlobalBackground.tsx`) — 35 lines

- Listens to `panelBackgroundImage` and `panelBackgroundBlur` from SettingsContext
- Sets `has-bg-image` class on `<html>` when image is set
- Fixed inset-0 div with `bg-cover bg-center` and CSS `filter: blur(Npx) scale(1.08)` to prevent edge artifacts
- Overlay: `bg-zinc-950/40 backdrop-brightness-75` for readability
- `pointer-events-none` so it never intercepts clicks
- `transition-all duration-500` for smooth changes
- Renders nothing (`null`) if no background image set

### 17.2 SystemUpdateListener (`src/components/SystemUpdateListener.tsx`)

- Mounted at root level in App.tsx (outside Router)
- Opens SSE/WebSocket connection to `/api/system/updates/stream`
- On `update_available` event: shows full-screen modal
- Modal: update description, "Update Now" or "Later" buttons
- "Update Now" → `POST /api/system/update` then reloads

### 17.3 TutorialOverlay (`src/components/TutorialOverlay.tsx`)

- Triggered once per user (dev: `sessionStorage`, prod: `localStorage`)
- Key: `tutorialShown_dev_{userId}` or `tutorialShown_prod_{userId}`
- Managed in App.tsx `TutorialManager` component (respects `enableTutorial` setting)
- On complete calls `onComplete` prop from App.tsx → sets storage to `'true'`
- Shows panel name in overlay text

### 17.4 GlobalSearchModal (`src/components/GlobalSearchModal.tsx`) — 322 lines

**Trigger:** Cmd+K / Ctrl+K keyboard shortcut  
**Component:** Rendered in Layout header via search icon button  

**Behavior:**
- Opens on Cmd+K (or click search icon)
- Closes on ESC
- Fetches servers from GET `/api/servers` when opened
- Updates results as user types

**Search scope:**
- Server name, ID, software, ipAlias, port (from live API)
- Nav link title, subtitle (from STATIC_NAV_LINKS)

**Static nav links (6 items):**
1. Overview → `/`
2. All Servers → `/servers`
3. Deploy Server → `/servers/create`
4. Fleet Management → `/admin/servers`
5. Account → `/account`
6. API Keys → `/api-keys`

**Keyboard navigation:** Arrow Up/Down, Enter to select, ESC to close
**Result categorization:** Navigation, Action, Server badges
**Footer:** keyboard shortcut hints

### 17.5 PageHeader (`src/components/PageHeader.tsx`)

- Reusable heading: title + subtitle props
- Title: bold large text with accent icon (optional)
- Subtitle: gray text below
- Breadcrumb helper above title

### 17.6 Sidebar (`src/components/Sidebar.tsx`)

- Collapsible sidebar for desktop, slide-in overlay for mobile
- Nav sections: Dashboard (/), Servers (/servers), Account (/account)
- Admin-only sections: Nodes (/nodes), API Keys (/api-keys), Fleet (/admin/servers), Settings (/admin/settings)
- Active route highlighted with left border accent
- Collapsed mode: icon only (80px wide)
- Mobile: translated off-screen, overlay with onClick-close
- Receives `onClose`, `isCollapsed`, `toggleCollapse` from Layout
- Dispatches `toggle-sidebar` custom event via Layout to toggle

### 17.7 Layout (`src/components/Layout.tsx`) — 123 lines

- Wraps `children` for all protected routes
- Special-case full-screen: routes `/servers/:id`, `/servers/create`, `/admin/settings` render WITHOUT sidebar (children fill main)
- All other routes: sidebar + top header + content area
- Top header: logo/name (links to /), search icon, notifications icon, "ALL SYSTEMS GO" badge
- Content area: full-height scrollable
- Manages `mobileOpen` and `isCollapsed` sidebar state
- Dispatches `toggle-sidebar` custom event to add sidebar toggle to Sidebar
- `getBreadcrumb()` helper maps paths to breadcrumb labels

### 17.8 LoadingOverlay (`src/components/LoadingOverlay.tsx`)

- Full-screen fixed overlay with `bg-black/60 backdrop-blur-sm`
- Centered spinner + text message
- Imported and rendered conditionally in AdminSettingsPage: `{condition && <LoadingOverlay />}`
- Blocks all interaction while any of: saving settings, changing password, creating user, uploading logo, system update

### 17.9 NotificationsDropdown (`src/components/NotificationsDropdown.tsx`)

- Icon button in top header (Layout level)
- Dropdown showing system alerts
- Uses Socket.IO to subscribe to system events

---

## 18. ADMIN PAGES

### 18.1 AdminSettingsPage (`src/pages/AdminSettingsPage.tsx`) — 1183 lines

**Route:** `/admin/settings`  
**Access:** Owner or Admin only (denied page shown otherwise)  

**Layout:** Side navigation (left, 256px) + top header strip + scrollable content area

**7 Admin Tabs (from adminTabs array):**

**Tab 1: Branding**
- Panel Name input → `PUT /api/system/settings {panelName}`
- Panel Logo: upload image → `ImageCropper` component → `PUT /api/system/settings {panelLogo: base64}`
- Hover overlay shows trash icon to remove logo
- "Replace Logo" button if already set

**Tab 2: Features** (toggle switches, all save immediately via PUT)
- Playit Tunnel Integration → `enablePlayit`
- Onboarding Tutorial → `enableTutorial`
- Cinematic Login Intro → `enableLoginAnimation`
- User Registration → `enableRegistration`

**Tab 3: Runtime** (dev mode only, gated by `isDev`)
- Shows signal banner if `runtimeLocked`: "re-run bash install.sh or edit .env"
- Two runtime option cards:
  - Docker (Container Isolation) — selected shows theme-500 active badge
  - Local Process (Direct) — selected shows amber-500 active badge
- Updating via `PUT /api/system/settings {defaultRuntime}` with auth header
- Info box: "existing servers can be migrated individually..."

**Tab 4: Appearance**
- Left column: Custom Dashboard Background
  - Image upload (no cropping → direct PUT, background image)
  - OR custom URL input field with "Apply URL" button
  - Reset button (clears both image and blur)
- Preset wallpapers (4 Unsplash images: Deep Space, Cyberpunk City, Dark Abstract, Neon Horizon)
- Right column: Background Blur slider (0-50px)
  - Saves on `onMouseUp` or `onTouchEnd`
  - Label: "Sharp" (0) / "Soft Blur" / "Heavy Blur" (>20)
- Theme Selector (9 accent colors):
  1. Crimson Red (#ef4444)
  2. Cobalt Blue (#3b82f6)
  3. Electric Purple (#a855f7)
  4. Cyber Cyan (#06b6d4)
  5. Emerald Green (#10b981)
  6. Amber Gold (#f59e0b)
  7. Sunset Orange (#f97316)
  8. Vivid Rose (#f43f5e)
  9. Monochrome Slate (#71717a)
  - Selected: ring-1 border-theme-500 shadow, checkmark inside color circle

**Tab 5: Authentication** (renders `renderGoogleFirebase()`)
- Enable Google Login toggle
- 6 Firebase config fields (API Key, Auth Domain, Project ID, Storage Bucket, Messaging Sender ID, App ID)
- "Save Firebase Credentials" button
- "Test Connection" button: creates/instantiates test Firebase app then deletes it → validates config
- Guided 4-step setup instructions embedded in banner

**Tab 6: Users** (renders `AdminControls` component)

**Tab 7: System**
- System Update card
- "Update Panel" button → `POST /api/system/update`
- Warning text: "git pull and rebuild", unavailable for a few seconds
- Loading state: RefreshCw animates

**Sidebar navigation:** Branding, Features, Runtime (dev only), Appearance, Authentication, Users, System + "BACK TO APP"  
**Active tab animation:** `motion.div` with `layoutId="activeAdminTab"` spring transition

### 18.2 AdminServers (`src/pages/AdminServers.tsx`) — 330 lines

**Route:** `/admin/servers`  
**Access:** Admin / Owner

**Fleet management grid:**
- Search bar: filters by name or ID (case-insensitive)
- Server rows: icon + name, type/version, owner, STATUS badge, Console link

**Three modals (Framer Motion spring-animated):**
1. **Edit Resources:** RAM (GB), CPU (%), Disk (GB) → PUT `/api/servers/{id}/resources {ram,cpu,disk}`
2. **Manage Suspension:** dropdown: Not Suspended / 24 Hours / 1 Week / 1 Month / 2 Months / Permanent → PUT `/api/servers/{id}/suspend {suspendDuration}`
3. **Delete Server:** "Are you sure?" → DELETE `/api/servers/{id}`

**ActionMenu (⋯ buttons per server):**
- Edit Resources
- Suspend / Manage Suspension (conditional on current state)
- Divider
- Delete Server
- Closes on outside click (useEffect)

### 18.3 ApiKeysPage (`src/pages/ApiKeysPage.tsx`)

**Route:** `/api-keys`  
**Access:** Super admin only

**Two-tab UI:**
1. **Generate New API Key:** single "Generate" key button
2. **API Key List:** table of existing keys, Revoke button each

**Create:** POST `/api/admin/api-keys {label, scopes: ["*"]}` → shows `jwt`/`apiKey` once with copy button → auto-switches to List tab

**Revoke:** DELETE `/api/admin/api-keys/{id}`

---

## 19. CREATE SERVER / SERVER DEPLOYMENT FORMS *(enhanced detail — §9 covers the primary documentation)*

### 19.1 CreateServer Page (`src/pages/CreateServer.tsx`) — 1169 lines

**Route:** `/servers/create` (primary deployment form)  
**Also:** `/install` is the InstallWizard flow

**Visual theme:** Pure black (#050505) with white accent, IBM Plex Sans + Chakra Petch fonts  
**Effects:** Noise overlay, scan-line animation, grid pattern, corner brackets on cards  

**5-Step Wizard (`STEPS = ['IDENTITY','RESOURCES','ACCESS','SOFTWARE','REVIEW']`):**

**Stepper UI:**
- 5 numbered circles, done = filled white check, active = white border glow, pending = gray outline
- Connecting lines between circles, white fill as steps advance
- Animation: forward (slide right) or back (slide left) with CSS keyframes
- Mobile: shows "STEP X / Y — STEP NAME" text label

**Step 1: IDENTITY**
- Instance Name (required) + inline error (rose-500 border + AlertTriangle)
- Description (textarea, optional)
- Dev-mode card (only when `isDev` is true):
  - Execution Runtime selector: Docker vs Local (radio cards with tick icon)
  - Runtime prefilled from `defaultRuntime` setting via SettingsContext

**Step 2: RESOURCES**
- RAM allocation grid: 1, 2, 4, 8, 16, 24, 32, 48, 64 GB
  - Each card: big bold number, description label (e.g., "Starter Survival")
  - Click to select → black border glow + white checkmark
- CPU Limit (%): manual input or AUTO toggle
  - AUTO map: 1GB→100%, 2GB→100%, 4GB→150%, 8GB→200%, 16GB→300%, 24GB→400%, 32GB→500%, 48GB→700%, 64GB→800%
  - MANUAL: type any value ≥10
  - Toggle: white bg when active, border when manual
- Disk Limit (GB): number input

**Step 3: NETWORK & ACCESS**
- Server Port: number input (1-65535)
  - Auto-checks availability via `GET /api/servers/check-port?port={port}` (debounced 400ms)
  - Inline status: CHECKING... / AVAILABLE (green) / IN USE (red) / INVALID (red) / ERROR (red)
  - Warns on conflict; blocks next if in-use
- IP Alias: text input for custom domain
- Admin-only: Assign Server Owner dropdown (of all users)
  - CustomDropdown with avatar circles (initials)
- Admin-only: Deployment Node dropdown (from GET `/api/nodes`)
  - Shows node name (IP) with Radio icon

**Step 4: SOFTWARE**
- Primary workload selector: Minecraft Server (Gamepad2 icon) vs Application & Script Runtime (Code2 icon)
  - Changing category auto-resets port (25565 ↔ 3000) and validates software

- Minecraft category: 6 software engines (grid, 2-col sm / 3-col md / 6-col lg)
  - Paper (Zap), Spigot (Wrench), Fabric (Feather), Forge (Wrench), BungeeCord (Network), Velocity (FastForward)
  - Selected: white border + icon glow
  - Info banner: "Includes Minecraft RCON console, auto-EULA acceptance..."
  - Minecraft Version: CustomDropdown from GET `/api/system/versions?type={software}`

- Application category: 2 options (grid, 1-col sm / 2-col)
  - Node.js (Code2), Python (TerminalSquare)
  - Standalone badge on each card
  - Warning banner: "Game features are disabled. Upload index.js or main.py..."
  - Runtime Version: CustomDropdown from GET `/api/system/versions?type={software}`

**Step 5: FINAL SPECIFICATION (REVIEW)**
- Configuration table: INSTANCE, RUNTIME (dev), DESCRIPTION, PORT, RAM, CPU, DISK, IP ALIAS, OWNER ID (admin), NODE ID (admin), WORKLOAD TYPE, SOFTWARE, VERSION
- Host footprint bar: `{ram/32*100}%` capped at 100
- Launch button → `POST /api/servers` with all fields

**Launch sequence (`launch()`):**
1. Sets deploy stage message (multistage: Configuring → Allocating → Provisioning → Network bindings → Permissions → Syncing → Finalizing)
2. Dynamic progress bar (fast initial, slow near end, capped at 99.4%)
3. Parallel safety poll: `GET /api/servers` every 2.5s checks if server already created
4. Once found OR POST succeeds: jumps to 100% → "Instance Deployed!" → `navigate('/servers')` after 1.4s
5. On error: resets to 0, shows alert

---

## 20. REUSABLE SUB-COMPONENTS *(summary — §16 covers the primary documentation)*

### 20.1 CustomDropdown (inside CreateServer.tsx)

Custom searchable select component used for owner and node selection.

**Props:** `{ value, options, onChange, renderValue, renderOption, placeholder }`

- Opens on click, closes on outside click (useRef + mousedown listener)
- Search input filters options by label/name/value
- Renders value with `renderValue(selectedItem)`
- Renders each option with `renderOption(item, isSelected)`
- Keyboard support: type to search, click to select

### 20.2 AdminControls (`src/components/AdminControls.tsx`) — 335 lines

**Props interface:**
```ts
interface AdminControlsProps {
  user: any; users: any[];
  username: string; setUsername: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  role: string; setRole: (v: string) => void;
  isCreatingUser: boolean; createUser: (e: React.FormEvent) => void;
  editingUserId: string | null; setEditingUserId: (id: string | null) => void;
  adminUserNewPassword: string; setAdminUserNewPassword: (v: string) => void;
  changeUserPassword: (id: string) => void; deleteUser: (id: string) => void;
  changeUserRole?: (id: string, newRole: string) => void;
}
```

**Create User Form:**
- Username, Password, Role select (Owner only: Admin/User; non-owner: locked "Member")
- "Create User" → POST `/api/system/users {username, password, role}`

**User Table:**
- 4 columns: User (avatar+name+role+auth-method), Assigned Role, Role Control, Actions
- Icons per role: Crown (owner), Shield (admin), User (member)
- Role change button pairs (Owner → can demote to User or promote to Admin, Member → locked)
- Action buttons: Key (change password) + Trash (delete with inline confirmation "Delete {username}?" Yes/No)

**RBAC permissions:**
- Owner can: change role of any non-owner user, delete admin or user (not self)
- Admin can: create only member users, change password of anyone except owner/admin, delete only member users (not admin/owner)
- "Protected Primary" / "Owner Locked" / "YOU" badges as needed

### 20.3 ApiKeysManager (`src/components/ApiKeysManager.tsx`) — 207 lines

- Used in AdminServers.tsx? (no — appears to be a separate component actually used from ApiKeysPage)
- Fetches `GET /api/admin/api-keys`, displays list
- Create API key: POST `/api/admin/api-keys {label, scopes: ["*"]}`
- Returns key string shown once with copy button
- Delete: confirms inline → DELETE `/api/admin/api-keys/{id}`
- Revoked keys: shown with "REVOKED" badge, dimmed opacity

### 20.4 SearchableDropdown (`src/components/SearchableDropdown.tsx`)

Generic reusable dropdown with search filter.
- Left panel: search input with Search icon
- Right panel: scrollable results
- Returns `{ id, name }` objects (OpenAI-compatible format)
- Used in: InstallWizard, CreateServer Step 3 (owner/node) & Step 4 (version), AdminSettingsPage (user assignment)

### 20.5 ImageCropper (`src/components/ImageCropper.tsx`)

- Used in AdminSettingsPage for logo/background cropping
- Props: `{ imageSrc, onCropComplete, onCancel, aspectRatio, title }`
- Returns cropped base64 result
- aspectRatio=1 for logo, 16/9 for background

### 20.6 TutorialOverlay (`src/components/TutorialOverlay.tsx`)

- Full-screen onboarding tour
- Props: `{ onComplete, panelName }`
- Steps through feature highlights (modal-style overlay with next/close)
- Completion memoized in sessionStorage or localStorage per user

---

## 21. CONTEXT PROVIDERS & HOOKS

### 21.1 AuthContext (`src/context/AuthContext.tsx`)

**State:** `user: any`, `loading: boolean`, `error: any`  
**Methods:** `login, register, logout, forgotPassword, resetPassword, verifyEmail, me, updateUser`  

**Auth flow:**
1. `fetchUser()` called on mount → `GET /api/auth/me` with stored token
2. If 401: clear state (user=null, loading=false)
3. If 200: set user state
4. `Authorization: Bearer {token}` header auto-injected via axios interceptor
5. On logout: POST `/api/auth/logout`, clear state, remove token

**Token storage:** `localStorage.token`

**Interceptors:** request interceptor adds `Authorization: Bearer {token}` to all axios calls; response interceptor redirects to /login on 401

### 21.2 SettingsContext (`src/context/SettingsContext.tsx`) — 124 lines

**State (all from `GET /api/settings`):**
```ts
{
  panelName: string;           // "JTG Panel"
  panelLogo: string;           // base64 or URL
  panelBackgroundImage: string;
  panelBackgroundBlur: number; // 0-50 px
  enablePlayit: boolean;
  enableTutorial: boolean;
  enableLoginAnimation: boolean;
  enableRegistration: boolean;
  theme: string;               // "red", "blue", "purple", etc.
  enableGoogleLogin: boolean;
  firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
  firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId: string;
  defaultRuntime: string;      // "docker" or "local"
  runtimeLocked: boolean;      // set by install.sh
  isDev: boolean;
}
```

**Socket.IO listener:** Connects to `{ auth: {token} }`, listens for `settings_updated` event → auto-refetches all settings

**Side effects:**
- `fetchSettings()` on mount
- Updates `<html>.data-theme` when theme changes
- Updates `document.title` to panelName
- Sets favicon (link[rel='icon']) to panelLogo or /vite.svg fallback

**APIs:**
- GET: `/api/settings`
- PUT: `/api/system/settings` (for many fields)

### 21.3 UploadContext (`src/context/UploadContext.tsx`)

- Handles chunked file upload state for FileManager
- Provides `uploadProgress` state
- Coordinates with `/api/servers/{id}/files/upload-chunk` and `/upload-complete`

### 21.4 useDashboardData hook (`src/hooks/useDashboardData.ts`)

- Fetches `GET /api/servers` then normalizes data
- Returns `{ servers, loading, error }`
- Used by Dashboard, ServerList

### 21.5 useAuth hook (`src/hooks/useAuth.tsx`)

- Exposes AuthContext: `{ user, login, register, logout, ... }`

### 21.6 useTheme hook (`src/hooks/useTheme.ts`)

- LocalStorage-backed theme state
- Options: 'dark' | 'light' | 'system'
- Sets `data-theme` attribute on document

### 21.7 useSocket hook (`src/hooks/useSocket.ts` or inline)

- Socket.IO client initialization used in ServerConsole
- `io({ auth: { token }, reconnectionAttempts: 15, reconnectionDelay: 1500, reconnectionDelayMax: 4000 })`

---

## 22. REUSABLE DASHBOARD COMPONENTS *(brief list — primary detail in dashboard code)* (`src/components/dashboard/`)

### 22.1 ServerCard (`src/components/dashboard/ServerCard.tsx`)
*Appears in ServerList.tsx — displays server as a card in the grid*
- Name, status badge, software type/version
- Action row: Start/Stop/Restart/Delete
- Console, Files, Settings links
- Live RAM bar

### 22.2 ServerRow (`src/components/dashboard/ServerRow.tsx`)
*Appears in Dashboard.tsx section 01 MY SERVERS*
- Rank number (01, 02...)
- Sparkline SVG chart (random-walk with gradient fill)
- Server name, ID, region badge
- LOAD percentage with color-coded bar (gray<40%, theme-400 40-70%, theme-400 bold >70%)
- UPTIME %, status dot (pulse when online)
- Clickable → navigate to server console

### 22.3 StatCard (`src/components/dashboard/StatCard.tsx`)
- Used in Dashboard for aggregate stats
- Icon, label, animated number value

### 22.4 ResourcesSlider (`src/components/dashboard/ResourcesSlider.tsx`)
- Horizontal resource bar (CPU/RAM/Disk)
- Color fill based on usage percentage

### 22.5 PremiumLoader (`src/components/dashboard/PremiumLoader.tsx`)
- Full-page animated loader shown on first visit
- Maybe an animated sequence

### 22.6 AmbientBackground (`src/components/dashboard/AmbientBackground.tsx`)
- Canvas or CSS animated background for Dashboard hero section

### 22.7 Shared (`src/components/dashboard/Shared.tsx`)
- Shared utilities/types for dashboard sub-components

---

## 23. UTILITY & SERVER-SIDE CODE

### 23.1 cropImage (`src/utils/cropImage.ts`)

Utility used by AdminSettingsPage for logo upload.
- Takes a base64 image and crop parameters
- Returns cropped base64 string
- Used in ImageCropper onCropComplete

### 23.2 Server entry (`server.ts`)

Main Express server bootstrap file.
- Initializes Express app
- Configures middleware: `cors`, `json`, `urlencoded`
- Loads routes
- Connects MongoDB via db.ts
- Starts HTTP server on configured port (default often 3000 or configurable)
- Manages Socket.IO server initialization

### 23.3 Frontend entry (`src/main.tsx`)

Vite entry point.
- Imports CSS files (Tailwind directives)
- Stitches `App` from App.tsx
- Renders into `#root`

### 23.4 Backend Routes (`src/server/routes/`)

| File | Path | Notes |
|------|------|-------|
| `auth.ts` | `/api/auth/*` | Login, register, OAuth, password reset, API key |
| `servers.ts` | `/api/servers/*` | CRUD, start/stop/restart, install, stats, files, commands, logs |
| `nodes.ts` | `/api/nodes` | Node CRUD, node metrics |
| `system.ts` | `/api/system/*` | Settings, users, update, versions, port-check |
| `api-keys.ts` | `/api/api-keys` | Admin API key management |
| `api.ts` | `/api/logs/*` | API usage logs |

### 23.5 middleware/auth.ts

Authenticates WS and HTTP routes:
- Extracts token from `Authorization: Bearer {token}` header
- Or from query param / cookie
- Verifies JWT, attaches user to request
- Returns 401 if invalid

### 23.6 controllers/

**`auth.ts`** — passport.js local + Google OAuth2 strategy  
**`servers.ts`** — all server CRUD, instancing logic  
**`world.ts`** — `POST /world/import`, `GET /world/info` — MCRegion world detection & migration

### 23.7 services/

**`docker.ts`** — Docker container lifecycle (create, start, stop, remove, exec)  
**`local.ts`** — Local process spawning (child_process.exec/spawn)  
**`minecraft.ts`** — MC-specific logic: version fetch, EULA handling, server.properties parsing  
**`jarDownloader.ts`** — Fetches Paper/Spigot/Fabric/Forge JARs from official sources  
**`sftp.ts`** — SSH/SFTP account creation (ssh-keygen, chroot jail)  
**`wings.ts`** — Wings proxy communication (for Pterodactyl-compatible Wings nodes)  
**`runtime.ts`** — Base runtime abstraction  
**`runtimeFactory.ts`** — Factory returning docker/local provider based on config  
**`runtimeProvider.ts`** — Interface/base for runtime providers  
**`mockProvider.ts`** — Mock runtime for development  
**`metrics.ts`** — Polls Docker/stats APIs for CPU/RAM/Disk  
**`db.ts`** — MongoDB connection + models  

### 23.8 events.ts

Socket.IO event handlers:
- `joinServer(serverId)` — joins socket room for console log broadcast
- `leaveServer(serverId)` — leaves room
- Emits `log` events for each new server log line
- `settings_updated` — broadcasts when admin changes settings

---

## 24. INSTALLER & WIZARD (`src/pages/InstallWizard.tsx`)

**Route:** `/install` (separate from `CreateServer`)  
**Access:** Authenticated with available nodes

**Stepper: 4 Steps + Complete (vs CreateServer's 5-step DEPLOY form)**

**Step 1: Choose Server Type**
- Grid of software cards with search
- Categories: MCP (Minecraft) and AAL (Application)
- Same software list as CreateServer but additionally: Vanilla, Purpur, BungeeCord
- Selected card shows amber border glow

**Step 2: Configure**
- Server Name input
- RAM slider (1-32 GB recommended range)
- Runtime Version dropdown
- Java Version dropdown (Minecraft types only: Auto-detect, 8, 11, 16, 17, 21, 25)
- Node selector
- Deployment explanation text

**Step 3: Deploy**
- Summary card with all settings
- "Deploy Server" button → POSTs config → transitions to Complete

**Complete State**
- CheckCircle icon, "Success!" title
- Steps with checkmarks: Created, Configured, Deployed
- Connector lines fill emerald as steps complete
- "Go to Dashboard" → `/servers`

**Key difference from CreateServer:** InstallWizard is the newer/simplified route; CreateServer is the full production deployment form. Both render server configuration through to `POST /api/servers`.

