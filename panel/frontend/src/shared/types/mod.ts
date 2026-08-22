// Frontend types for the Mods (panel add-ons) system.
// Keep the capability codes in sync with internal/models/mod.go's CapXxx
// constants — the backend repo rejects any other string at insert time.

// One capability a mod declared it needs in its manifest's
// `permissionsRequested[]`. The panel treats activation as unsafe until
// every row for the mod has `granted === true` — the admin must explicitly
// approve each request before the mod can be turned on.
export interface ModPermission {
  id: number;
  capability: string;
  access_level: string;
  granted: boolean;
}

// A mod (panel add-on). `manifest` + `spec` are stored verbatim so the
// frontend can lay out the mod's declared pages/tools later without a
// schema change. `pending` is the count of un-approved permission rows.
export interface Mod {
  id: number;
  name: string;
  slug: string;
  version: string;
  description: string;
  manifest: Record<string, any> | null;
  spec: Record<string, any> | null;
  active: boolean;
  // Mod Engine version the row targets: 1 = static v1 manifest, 2 = the
  // event-driven Goja engine. Mirrors modResponse.engine_version; defaults to
  // 1 when absent (legacy rows / pre-020 DBs).
  engine_version?: 1 | 2;
  owner_name?: string;
  // Install provenance: where the manifest came from. "file" = uploaded
  // .ksmod, "url" = fetched from a URL via the install-from-URL button,
  // "studio" = authored in the Mod Studio, "json" = POSTed as JSON.
  source?: ModSource;
  source_url?: string;
  // Byte size of the on-disk .kspm package zip (0 == none; the download
  // handler synthesises a minimal .kspm from manifest+spec in that case).
  // Surfaced on the card as "package: N KB".
  package_size?: number;
  permissions: ModPermission[];
  pending: number;
  created_at: string;
  updated_at: string;
}

// Install provenance tags the backend stamps on every mod row. Keep in sync
// with models.ModSource* constants in internal/models/mod.go.
export type ModSource = 'file' | 'url' | 'studio' | 'json';

// Human-readable label + dot colour for the install-source chip the Mods
// page renders on each card. The dot mirrors the chip colour of the
// corresponding capability so the row reads as a tidy colour legend.
export interface ModSourceMeta {
  key: ModSource;
  label: string;
  dot: string;
  badge: string;
}

export const MOD_SOURCES: ModSourceMeta[] = [
  { key: 'file',   label: 'Uploaded file', dot: 'bg-sky-400',   badge: 'bg-sky-900/40 text-sky-200 border-sky-700/50' },
  { key: 'url',    label: 'Installed from URL', dot: 'bg-violet-400', badge: 'bg-violet-900/40 text-violet-200 border-violet-700/50' },
  { key: 'studio', label: 'Built in Mod Studio', dot: 'bg-emerald-400', badge: 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' },
  { key: 'json',   label: 'Posted as JSON', dot: 'bg-amber-400', badge: 'bg-amber-900/40 text-amber-200 border-amber-700/50' },
];

export const modSourceMeta = (key: string | undefined): ModSourceMeta | undefined =>
  MOD_SOURCES.find((s) => s.key === key);

// The well-known capability codes a mod is allowed to request. These match
// `models.AllowedCapabilties()` exactly — keep both sides aligned or the
// backend will reject the manifest at upload time.
export const ModCapability = {
  DatabaseRead: 'db.read_only',
  DatabaseReadWrite: 'db.read_write',
  Terminal: 'terminal',
  ContainerControl: 'container.control',
  VMControl: 'vm.control',
  Filesystem: 'filesystem',
} as const;

export type ModCapabilityKey = (typeof ModCapability)[keyof typeof ModCapability];

// Human-readable catalogue used to render permission chips on cards and the
// approval checklist in the activation modal. `accessLevels` lists the
// per-capability access levels the manifest may declare; the chip tone/dot
// give the cards a colour-coded hint of how sensitive the capability is.
export interface ModCapabilityMeta {
  key: string;
  label: string;
  description: string;
  dot: string;
  badge: string;
  accessLevels: { value: string; label: string; tone: 'neutral' | 'amber' | 'red' }[];
}

export const MOD_CAPABILITIES: ModCapabilityMeta[] = [
  {
    key: ModCapability.DatabaseRead,
    label: 'Database (read)',
    description: 'Read rows from the panel database without changing them.',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60',
    accessLevels: [{ value: 'read_only', label: 'Read-only', tone: 'amber' }],
  },
  {
    key: ModCapability.DatabaseReadWrite,
    label: 'Database (read+write)',
    description: 'Create, update and delete rows in the panel database.',
    dot: 'bg-red-400',
    badge: 'bg-red-900/60 text-red-200 border-red-700/60',
    accessLevels: [{ value: 'read_write', label: 'Read & write', tone: 'red' }],
  },
  {
    key: ModCapability.Terminal,
    label: 'Terminal',
    description: 'Run shell commands on the panel host.',
    dot: 'bg-orange-400',
    badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60',
    accessLevels: [
      { value: 'read_only', label: 'Read-only (no commands)', tone: 'amber' },
      { value: 'read_write', label: 'Execute commands', tone: 'red' },
    ],
  },
  {
    key: ModCapability.ContainerControl,
    label: 'Container control',
    description: 'Start / stop / manage containers and instances.',
    dot: 'bg-sky-400',
    badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60',
    accessLevels: [
      { value: 'read_only', label: 'Inspect only', tone: 'amber' },
      { value: 'read_write', label: 'Control (start/stop)', tone: 'red' },
    ],
  },
  {
    key: ModCapability.VMControl,
    label: 'VM control',
    description: 'Manage KVM / LXD virtual machines on the panel host.',
    dot: 'bg-indigo-400',
    badge: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60',
    accessLevels: [
      { value: 'read_only', label: 'Inspect only', tone: 'amber' },
      { value: 'read_write', label: 'Control (start/stop)', tone: 'red' },
    ],
  },
  {
    key: ModCapability.Filesystem,
    label: 'Filesystem',
    description: 'Read (or write) files on the panel host filesystem.',
    dot: 'bg-fuchsia-400',
    badge: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60',
    accessLevels: [
      { value: 'read_only', label: 'Read-only', tone: 'amber' },
      { value: 'read_write', label: 'Read & write', tone: 'red' },
    ],
  },
];

export const modCapabilityMeta = (key: string): ModCapabilityMeta | undefined =>
  MOD_CAPABILITIES.find((c) => c.key === key);

// The JSON the admin sends when creating/updating a mod by hand (as opposed
// to uploading a .ksmod file).
export interface PermissionRequest {
  capability: string;
  access_level: string;
}

export interface ModUpsertPayload {
  name: string;
  slug: string;
  version: string;
  description: string;
  spec?: unknown;
  permissionsRequested: PermissionRequest[];
}

// Shape of the 409 activate response when there are still pending grants.
export interface ModActivateConflict {
  error: string;
  message: string;
  pending: number;
  permissions: ModPermission[];
}

// ---------------------------------------------------------------------------
// Mod Engine v2 client-side types.
// ---------------------------------------------------------------------------

// v2 manifest extension. Every field below the v1 set is OPTIONAL — a v1
// manifest decodes into an object with `engineVersion === 1` and empty v2
// arrays, which is the contract the React slot loader branches on so an
// admin-uploaded v1 mod never tries to fetch a JS bundle.
export interface ModManifestV2 {
  name: string;
  slug: string;
  version?: string;
  description?: string;
  // 1 = static v1 manifest (no JS runtime). 2 = event-driven Goja engine.
  engineVersion: 1 | 2;
  // Entry JS file the panel's embedded VM evaluates on activation.
  backendScript?: string;
  // Inline script source (self-contained dev manifest). Preferred over the
  // file path when both are set.
  backendScriptSource?: string;
  // Frontend injection points the mod registers into the panel layout.
  slots?: SlotDefinition[];
  // Event listeners (pre/post) the backendScript subscribes to.
  hooks?: HookDefinition[];
  // Custom mod-scoped RBAC keys surfaced next to the host capabilities.
  permissionsDeclared?: CustomPermission[];
  // Opaque editable spec blob (pages/tools definitions).
  spec?: Record<string, any>;
  permissionsRequested?: PermissionRequest[];
}

// One frontend injection point a v2 mod declares. The panel renders a <Slot
// name="…" /> at each well-known location; the registry looks up every active
// mod that declared a slot of that name and mounts its `component`.
export interface SlotDefinition {
  // Well-known layout slot name, e.g. "instance.detail.tabs".
  name: string;
  // Export name in the mod's JS bundle the registry should mount.
  component: string;
  // Verbatim props forwarded to the mounted component.
  props?: Record<string, any>;
}

// One event listener a v2 mod registers declaratively in its manifest. Paired
// with `ks.events.on(name, fn)` from the backendScript.
export interface HookDefinition {
  event: string;
  // "pre" = cancellable, runs before the host action; "post" = async after.
  phase: 'pre' | 'post';
  // Exported JS function name the backendScript provides for this hook.
  handler: string;
}

// A mod-scoped custom RBAC key. The backend namespaces the code under
// `<slug>:<key>` so two mods can't collide.
export interface CustomPermission {
  key: string;
  description?: string;
}

// One slot served by /api/mods/v1/slots. `mod` is the owning slug; the loader
// maps (slot name) -> registration and resolves the React component from the
// mod's bundle registry.
export interface RegisteredSlot {
  mod: string;
  mod_id: number;
  name: string;
  component: string;
  props?: Record<string, any>;
}

// Runtime state of the embedded JS engine, surfaced by the slots endpoint so
// the UI can warn "scripts not executing" when the panel ships in noop mode.
export type ModEngineMode = 'noop' | 'goja';

// Shape of the /api/mods/v1/slots response.
export interface SlotRegistryResponse {
  mode: ModEngineMode;
  slots: RegisteredSlot[];
}

// The browser-side plugin component registry shape mounted on window.KS. A mod
// bundle calls `window.KS.registerComponent(slotName, name, Component)` to make
// a React component discoverable by <Slot />.
export interface KSPluginComponent {
  mod: string;
  name: string;
  Component: React.ComponentType<any>;
}

interface KSWindow {
  __ksComponents: Map<string, KSPluginComponent>;
  registerComponent: (this: void, slotName: string, name: string, component: React.ComponentType<any>) => void;
  getComponent: (this: void, slotName: string, name: string) => KSPluginComponent | undefined;
  __ksReady: boolean;
}

// ---------------------------------------------------------------------------
// Mod Studio — visual + code manifest builder types.
//
/// The Studio models a mod as an editable "draft": the admin edits structured
// builder blocks (no-code) OR types raw manifest JSON (pro-code), previewing
// the produced manifest live. Saving the draft ships it through the existing
// POST /api/mods endpoint, so the Studio is a generator, not a new
// runtime — it keeps the security model (capability whitelist, admin grant
// gate) intact by feeding the same validated upload path the file uploader
// uses.
// ---------------------------------------------------------------------------

// A builder block is one piece the no-code editor renders. `kind` picks the
// editor surface; the union lets the Studio switch on it without a stringly
// map. Blocks are grouped under sections surfaced as sidebar tabs.
export type ModStudioBlockKind =
  | 'meta'        // name / slug / version / description
  | 'permissions' // checked list of host capabilities + access levels
  | 'slots'      // frontend injection points (name + component + props)
  | 'hooks'      // event listeners (event + phase + handler)
  | 'backend'    // inline backendScript source (the Goja entry)
  | 'customPerms'; // mod-scoped RBAC keys

// The full editable draft. It intentionally mirrors ModManifestV2 + the v1
// metadata so the Studio can emit either a v1 or a v2 manifest (the engine
// version is a builder decision; defaulting to 1 keeps the no-code path
// safe — only opt into v2 once slots/hooks/backendScript are used).
export interface ModStudioDraft {
  name: string;
  slug: string;
  version: string;
  description: string;
  // 1 = static v1 manifest (no JS runtime). 2 = event-driven engine: the
  // active slots/hooks/backendScript below take effect on activation. The
  // Studio auto-promotes to 2 the moment any v2-only block is touched, so a
  // no-code admin never ships a v2 manifest by accident.
  engineVersion: 1 | 2;
  permissionsRequested: PermissionRequest[];
  slots: SlotDefinition[];
  hooks: HookDefinition[];
  permissionsDeclared: CustomPermission[];
  // Inline backend script source. Stored as `backendScriptSource` in the
  // emitted manifest (the engine prefers inline source over a file path,
  // see models.resolveScript) so a Studio-built mod is self-contained.
  backendScript: string;
  // Opaque editable spec blob. Surfaced verbatim on the mod card's Edit
  // modal after install, so the admin can keep tuning layout / config
  // without re-importing.
  spec: Record<string, any>;
}

// The empty starter draft the Studio opens with. Centralising it keeps the
// "New mod" button and a hard reload consistent.
export const blankModStudioDraft = (): ModStudioDraft => ({
  name: '',
  slug: '',
  version: '1.0.0',
  description: '',
  engineVersion: 1,
  permissionsRequested: [],
  slots: [],
  hooks: [],
  permissionsDeclared: [],
  backendScript: '',
  spec: {},
});

// A curated preset the Studio offers as a one-click starting point. Each
// preset carries a ready-made draft the admin can edit further. The
// catalog lives in code (not the DB) so it ships with the panel and needs no
// migration; a future admin endpoint can surface user-saved presets on top.
export interface ModStudioPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // emoji, rendered in the picker card
  build: () => ModStudioDraft;
}

// emitStudioManifest turns a draft into the exact JSON object the backend's
// POST /api/mods (and ParseManifest) expect: the v1 fields plus the v2
// blocks when engineVersion == 2. returning a plain object (not a string)
// lets the caller POST it as application/json OR show it in the live-preview
// code pane. Unknown-to-the-backend v2 fields ride along verbatim — that's the
// pass-through contract the mod system is built on.
export function emitStudioManifest(draft: ModStudioDraft): Record<string, any> {
  const out: Record<string, any> = {
    name: draft.name,
    slug: draft.slug,
    version: draft.version,
    description: draft.description,
    permissionsRequested: draft.permissionsRequested,
  };
  if (draft.engineVersion === 2) {
    out.engineVersion = 2;
    if (draft.backendScript.trim()) out.backendScriptSource = draft.backendScript;
    if (draft.slots.length) out.slots = draft.slots;
    if (draft.hooks.length) out.hooks = draft.hooks;
    if (draft.permissionsDeclared.length) out.permissionsDeclared = draft.permissionsDeclared;
  }
  // ALWAYS emit spec last so a no-code admin's layout blob survives even on
  // a v1 manifest (the backend stores it verbatim and the Edit modal exposes
  // it later). Skip an empty object so the preview reads cleanly.
  if (Object.keys(draft.spec).length) out.spec = draft.spec;
  return out;
}

// slugify produces a URL-safe slug from a freeform name, matching the
// convention the mod system keys on. Used by the Studio to prefill the slug
// field as the admin types the mod name; the admin can still edit it.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}