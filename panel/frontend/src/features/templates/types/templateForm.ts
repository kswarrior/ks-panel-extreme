// TemplateForm types - extracted from TemplateForm.tsx

import type { InstancePageSubPage } from '@/features/instance-pages/types/instancePage';
import type { InstanceControls } from '@/features/instances/utils/instanceControls';
import { DEFAULT_INSTANCE_CONTROLS } from '@/features/instances/utils/instanceControls';

export type DriverKind = 'docker' | 'lxd' | 'kvm' | 'multipass';

export function stripUnit(v: string): string {
  // Strip memory units (M/G, optional B/iB suffix) AND a trailing time
  // suffix (s) so both "2G" -> "2048" (MB) and "30s" -> "30" (seconds)
  // round-trip. Handles decimals ("1.5G" -> "1536") so serializeSpec never
  // emits corrupt "1.5GM" / "30ss" values.
  const s = (v ?? '').trim();
  if (s === '') return '';
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([MGmg]?)(?:[Bb])?(?:[Ii][Bb]?)?\s*[Ss]?$/);
  if (!m) return v;
  // A trailing "s" with no M/G unit is a time value (healthcheck) — the
  // numeric part is already correct, don't scale.
  if (/s$/i.test(s) && !m[2]) {
    return String(m[1].includes('.') ? Math.round(parseFloat(m[1])) : parseInt(m[1], 10));
  }
  let n = parseFloat(m[1]);
  if (m[2].toLowerCase() === 'g') n *= 1024;
  return String(Math.round(n));
}

export interface PortMapping {
  host: string;
  guest: string;
  protocol: 'tcp' | 'udp';
}

export interface Mount {
  source: string;
  target: string;
  mode: 'rw' | 'ro';
}

export interface ResourceLimits {
  ram_mb: string;
  cpu_pct: string;
  disk_mb: string;
  swap_mb: string;
}

export interface FeatureCaps {
  databases: string;
  backups: string;
  networks: string;
}

export interface EnvVariable {
  name: string;
  label: string;
  description: string;
  default: string;
  user_viewable: boolean;
  user_editable: boolean;
  required: boolean;
  rule: string;
  display: 'text' | 'number' | 'select' | 'checkbox';
  options: string;
  // Structured dropdown rows (preferred over the legacy comma `options`
  // string): each carries its own SVG glyph + display label + value, e.g. a
  // JDK picker row `{svg: java-glyph, label: "Temurin 21", value: "21"}`.
  options_list?: EnvOption[];
  // Checkbox send-values: stored when checked / unchecked. Empty = legacy
  // `'true'` / `'false'`.
  checked_value?: string;
  unchecked_value?: string;
  append: boolean;
  prepend: string;
  append_value: string;
  // Where this variable may be substituted (`{{NAME}}` / `${NAME}` /
  // `$(NAME)`). Empty/missing = everywhere (legacy specs). Otherwise a
  // subset of ENV_VAR_SCOPES — the deploy path only substitutes the variable
  // inside the listed sections, and only forwards it to the matching workflows
  // (install vs actions).
  scopes?: string[];
  // Which named runtimes this var applies to (spec.images[] names).
  // Empty/missing = All images (the default). Non-empty = only these
  // runtimes (case-insensitive); the deploy form hides the var otherwise.
  images?: string[];
  // 'ask' (prompt the operator at deploy, the default) or 'auto' (hidden
  // auto-set like the old .env / per-runtime overrides — applied with the
  // default value, never asked). Missing = 'ask' (legacy specs).
  behavior?: 'ask' | 'auto';
}

// One dropdown row for a `select` env variable: optional SVG glyph,
// human label, and the stored value.
export interface EnvOption {
  svg: string;
  label: string;
  value: string;
}

// parseEnvOptions resolves the dropdown rows for any env-like object:
// structured `options_list` wins, otherwise the legacy comma `options`
// string splits into value-only rows. Tolerates hand-written specs.
export function parseEnvOptions(
  v: { options?: unknown; options_list?: unknown },
): EnvOption[] {
  if (Array.isArray(v.options_list)) {
    const rows: EnvOption[] = [];
    for (const o of v.options_list) {
      if (!o || typeof o !== 'object') continue;
      const r = o as Record<string, unknown>;
      const value = String(r.value ?? '');
      const label = String(r.label ?? '');
      if (value === '' && label === '') continue;
      rows.push({ svg: String(r.svg ?? ''), label, value });
    }
    if (rows.length > 0) return rows;
  }
  const raw = typeof v.options === 'string' ? v.options : '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => ({ svg: '', label: '', value }));
}

// checkboxValues resolves the (on, off) send-values for a checkbox var,
// falling back to the legacy 'true'/'false' when unset.
export function checkboxValues(
  v: { checked_value?: unknown; unchecked_value?: unknown },
): [string, string] {
  const on = typeof v.checked_value === 'string' && v.checked_value !== '' ? v.checked_value : 'true';
  const off = typeof v.unchecked_value === 'string' && v.unchecked_value !== '' ? v.unchecked_value : 'false';
  return [on, off];
}

// checkboxChecked reports whether a stored value means "checked".
export function checkboxChecked(
  v: { checked_value?: unknown; unchecked_value?: unknown },
  stored: string,
): boolean {
  const [on, off] = checkboxValues(v);
  if (stored === on) return true;
  if (stored === off) return false;
  // Legacy values predate custom send-values.
  return stored === 'true' || stored === '1' || stored === 'on';
}

// Sections an env variable can be applied to. `image` covers the template
// image field (multi-image via a select var), `controls` covers
// instance_controls + home_page, `pages` covers spec.pages rows,
// `advanced` covers startup/limits/mounts/ports and driver blocks.
export const ENV_VAR_SCOPES = [
  'install',
  'actions',
  'image',
  'controls',
  'pages',
  'advanced',
] as const;

export type EnvVarScope = (typeof ENV_VAR_SCOPES)[number];

// normalizeEnvScopes cleans a raw scopes value from a spec: unknown entries
// and the legacy 'all' token collapse to "everywhere" (empty array), so old
// templates and hand-written manifests keep working unchanged.
export function normalizeEnvScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '' || s === 'all') return [];
    if ((ENV_VAR_SCOPES as readonly string[]).includes(s)) seen.add(s);
  }
  if (seen.size === 0 || seen.size === ENV_VAR_SCOPES.length) return [];
  return [...seen];
}

// normalizeEnvImages cleans a raw images value: runtime names this var
// applies to. Empty/missing = All images (the default).
export function normalizeEnvImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? '').trim();
    if (s === '' || s.length > 100) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= 32) break;
  }
  return out;
}

// normalizeEnvBehavior cleans a raw behavior value: 'ask' (default) or
// 'auto' (hidden auto-set). Unknown/empty falls back to 'ask'.
export function normalizeEnvBehavior(raw: unknown): 'ask' | 'auto' {
  return String(raw ?? '').trim().toLowerCase() === 'auto' ? 'auto' : 'ask';
}

// envBehaviorEffective resolves the display state: missing = 'ask'.
export function envBehaviorEffective(v: Pick<EnvVariable, 'behavior'>): 'ask' | 'auto' {
  return v.behavior === 'auto' ? 'auto' : 'ask';
}

// envAppliesToImage reports whether a var applies to a runtime name.
// Empty images = All images.
export function envAppliesToImage(images: unknown, selected: string): boolean {
  const list = normalizeEnvImages(images);
  if (list.length === 0) return true;
  const s = (selected || '').trim().toLowerCase();
  return list.some((n) => n.toLowerCase() === s);
}

// envScopesEffective resolves the display state: empty = all scopes on.
export function envScopesEffective(v: Pick<EnvVariable, 'scopes'>): string[] {
  const n = normalizeEnvScopes(v.scopes);
  return n.length > 0 ? n : [...ENV_VAR_SCOPES];
}

export interface Label {
  key: string;
  value: string;
}

export interface Device {
  host: string;
  container: string;
  cgroup: boolean;
}

export type NetworkMode = 'host' | 'bridge' | 'none' | 'container' | 'macvlan' | 'ipvlan';
export type RestartPolicy = 'no' | 'always' | 'unless-stopped' | 'on-failure';
export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

export type InstallAction = 'shell' | 'download' | 'extract' | 'move' | 'write' | 'chmod' | 'mkdir' | 'git_clone' | 'pip_install' | 'npm_install' | 'http_check';

export interface InstallStep {
  action: InstallAction;
  command: string;
  url: string;
  filename: string;
  archive: string;
  dest: string;
  from: string;
  to: string;
  path: string;
  content: string;
  branch: string;
  retries: string;
  ignore_errors: boolean;
}

export interface ActionStep {
  action: InstallAction;
  command: string;
  url: string;
  filename: string;
  archive: string;
  dest: string;
  from: string;
  to: string;
  path: string;
  content: string;
  branch: string;
  retries: string;
  ignore_errors: boolean;
}

export type TerminalAllowInput = 'all' | 'allowlist' | 'disabled';

export interface TemplateAction {
  id: string;
  name: string;
  description: string;
  /** Raw SVG markup for the action tile (empty = default play glyph). */
  icon_svg: string;
  /** Optional #rrggbb tint for the action icon in tiles/menus. */
  icon_color: string;
  allowed_states: string;
  requires_online: boolean;
  async_run: boolean;
  run_on_create: boolean;
  cooldown_s: string;
  user_invokable: boolean;
  session: 'long_running' | 'console_session' | 'vm_full';
  auto_start_instance: boolean;
  auto_stop_on_exit: boolean;
  restart_on_failure: boolean;
  allowed_commands: string;
  blocked_commands: string;
  max_runtime_s: string;
  stop_command: string;
  stop_mode: 'same' | 'different';
  // Terminal binding: which instance-control terminal pane(s) this action
  // attaches to. Empty = no dedicated terminal (legacy behaviour). When a
  // terminal pane's ID matches this value (case-insensitive, trimmed), that
  // pane streams this action's logs and routes gated input to it while the
  // action runs (e.g. Minecraft console: /tps /op /ban).
  terminal_id: string;
  // Stop the bound terminal pane when the action's command ends: the pane
  // flips to a closed state and refuses further input (e.g. `stop` in
  // Minecraft kills java → the console locks instead of accepting dead input).
  terminal_stop_on_exit: boolean;
  // Input gate for the bound terminal: 'all' = free stdin, 'allowlist' =
  // only lines matching terminal_allowed_commands (and not blocked),
  // 'disabled' = read-only log view.
  terminal_allow_input: TerminalAllowInput;
  // Allowed input lines for the bound terminal (regex, one per line; empty =
  // all lines when mode is 'all'). Same syntax as console_session's
  // allowed_commands so RCON verbs like ^tps$ pass and apt/reboot never do.
  terminal_allowed_commands: string;
  // Blocked input tokens (comma-separated, defence-in-depth, checked before
  // the allowlist).
  terminal_blocked_commands: string;
  // Idle/attach budget in seconds for the bound terminal (empty/0 = no
  // limit). The pane auto-locks when the budget elapses.
  terminal_timeout_s: string;
  steps: ActionStep[];
}

export interface Healthcheck {
  enabled: boolean;
  test_command: string;
  interval_s: string;
  timeout_s: string;
  retries: string;
  start_period_s: string;
}

export interface PageOverride {
  slug: string;
  enabled: boolean;
  label: string;
  icon_svg: string;
  icon_color?: string;
  original_slug?: string;
  kind?: 'custom' | 'builtin';
  content_type?: 'html' | 'markdown' | 'blocks';
  content_html?: string;
  content_markdown?: string;
  content_blocks?: string;
  /** Saved executable actions copied from the Instance Pages library row.
   *  The runtime allow-list (ExecuteCustomPageActionHandler) matches against
   *  THIS array — dropping it makes every action button on the page fail
   *  with 403 "action is not defined on this page". */
  actions?: import('@/features/instance-pages/types/instancePage').PageActionDef[];
  /** Reusable UI components copied from the Instance Pages library row.
   *  Referenced in content with {{component:name}} — React-like reusable
   *  blocks that render on both main page and any nested sub-page. */
  components?: import('@/features/instance-pages/types/instancePage').PageComponentDef[];
  /** Multi-page support: extra pages nested INSIDE this row. Effective route
   *  of each is "<slug>/<path>" (e.g. files/edit); they never render as
   *  separate top-level tabs. */
  sub_pages?: InstancePageSubPage[];
  /** Page-level configure vars copied from the library row (Studio Configure tab).
   *  Like template env vars but per-page. */
  configure?: import('@/features/instance-pages/types/instancePage').PageConfigureVar[];
  /** Per-template values for this page's configure vars, keyed by var name.
   *  Filled via the template Pages tab Configure button. */
  config?: Record<string, string>;
}

export type LogDriver = 'json-file' | 'syslog' | 'journald' | 'none';

export interface Advanced {
  startup_command: string;
  // Terminal binding for the Startup command's main-process console
  // (same attach-by-ID UX as actions[].terminal_id): a terminal pane
  // whose ID matches this value attaches to the container's main stdio.
  // Empty = no dedicated startup console.
  startup_terminal_id: string;
  stop_command: string;
  stop_signal: string;
  working_dir: string;
  user: string;
  hostname: string;
  privileged: boolean;
  readonly_rootfs: boolean;
  enable_tty: boolean;
  dns: string;
  extra_hosts: string;
  network_mode: NetworkMode;
  restart_policy: RestartPolicy;
  shm_size_mb: string;
  pid_limit: string;
  ulimit_nofiles: string;
  ulimit_nproc: string;
  log_driver: LogDriver;
  log_max_size_mb: string;
  log_max_files: string;
  log_level: LogLevel;
  oom_kill_disable: boolean;
  cpu_quota_period: string;
  io_weight: string;
  environment_template: string;
  kvm: KvRuntime;
  multipass: MpRuntime;
  lxd: LxdRuntime;
}

export interface KvRuntime {
  vcpus: string;
  cpu_model: 'host-passthrough' | 'host-model' | 'kvm64' | '';
  machine: 'pc' | 'q35' | 'virt';
  uefi: boolean;
  secure_boot: boolean;
  tpm: boolean;
  vga: 'virtio' | 'std' | 'qxl' | 'none';
  video_memory_mb: string;
  boot_order: 'cd' | 'hd' | 'net';
  kernel_args: string;
  extra_args: string;
  vnc_port: string;
  vnc_password: string;
  spice_port: string;
  install_iso: string;
  disk_bus: 'virtio' | 'sata' | 'ide' | 'nvme' | 'scsi';
  disk_cache: 'writeback' | 'none' | 'writethrough' | 'directsync';
  io_thread: boolean;
  discard: boolean;
  numa: boolean;
  hugepages: boolean;
  rdm_reservation: boolean;
}

export interface MpRuntime {
  cpus: string;
  disk_mb: string;
  mem_mb: string;
  cloud_init_userdata: string;
  cloud_init_metadata: string;
  image_alias: string;
  bridges: string;
  bridged: string;
  launch_argument: string;
  autorecovery: boolean;
}

export interface LxdRuntime {
  profiles: string;
  storage_pool: string;
  storage_volume_size: string;
  config: string;
  devices: string;
  limits_cpu_allowance: string;
  limits_cpu_priority: string;
  security_protection: boolean;
  security_privileged: boolean;
  raw_idmap: string;
  boot_autostart: boolean;
  snapshot_pattern: string;
}

export interface TemplateFormState {
  id: string;
  name: string;
  category: string;
  type: string;
  description: string;
  kind: DriverKind;
  image: string;
  // Named multi-image runtimes (spec.images[]): each row is a selectable
  // runtime with per-image metadata. The top-level `image` stays the
  // implicit default so old templates deploy unchanged; when rows exist
  // the deploy form offers them as a picker and posts `image_key`.
  // Ptero-style spec.docker_images{} maps are merged into this list on
  // load (sorted by name) and saved back as images[].
  images: TemplateImage[];
  // Explicit default entry name (spec.default_image). Empty = the
  // default:true row, else the top-level image, else the first row.
  default_image: string;
  /** Raw SVG markup for the template tile (migration 059). */
  icon: string;
  /** Optional #rrggbb accent tinting the tile on cards. */
  color: string;
  ports: PortMapping[];
  mounts: Mount[];
  limits: ResourceLimits;
  caps: FeatureCaps;
  env: EnvVariable[];
  install: InstallStep[];
  // Whole-workflow budget in seconds for the template's install workflow
  // (spec.install_timeout_sec). Empty = the edge's default (30 min).
  install_timeout_s: string;
  // Terminal binding for the Installation workflow console (same
  // attach-by-ID UX as actions[].terminal_id): a terminal pane whose ID
  // matches this value streams the install transcript and relays input
  // while the workflow runs. Empty = no dedicated install console (the
  // install runs non-interactive, legacy behaviour).
  install_terminal_id: string;
  actions: TemplateAction[];
  labels: Label[];
  devices: Device[];
  healthcheck: Healthcheck;
  advanced: Advanced;
  pages: PageOverride[];
  // Landing page slug for the instance index route (/instances/:id).
  // Empty = default Home (slug "."). Snapshotted into instance.Config.
  home_page: string;
  // Built-in Instance controls allow-list (spec.instance_controls).
  // Snapshotted into instance.Config on deploy. Missing = allow all.
  instance_controls: InstanceControls;
}

// One named runtime in the multi-image map (spec.images[] entry):
// selectable at deploy time via `image_key`, with per-image metadata.
export interface TemplateImage {
  name: string;
  image: string;
  description: string;
  is_default: boolean;
}

export const emptyTemplateImage = (): TemplateImage => ({
  name: '',
  image: '',
  description: '',
  is_default: false,
});

export type TemplateTabId =
  | 'general'
  | 'environment'
  | 'env'
  | 'actions'
  | 'install'
  | 'runtime'
  | 'labels'
  | 'healthcheck'
  | 'pages'
  | 'controls'
  | 'spec';

export const TEMPLATE_TABS: Array<{ id: TemplateTabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'environment', label: 'Environment' },
  { id: 'env', label: 'Env Variables' },
  { id: 'actions', label: 'Actions' },
  { id: 'install', label: 'Install' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'labels', label: 'Labels & Devices' },
  { id: 'healthcheck', label: 'Healthcheck' },
  { id: 'pages', label: 'Pages' },
  { id: 'controls', label: 'Instance Controls' },
  { id: 'spec', label: 'Spec Preview' },
];

export interface TagPickerProps {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  onAdd: (v: string) => void;
  onDelete: (v: string) => void;
  // Rename a managed entry (old -> new). Optional — the picker manages its
  // own list internally; callers that persist taxonomies can sync here.
  onRename?: (oldValue: string, newValue: string) => void;
}

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export interface BlockRow {
  type: 'heading' | 'text' | 'image' | 'button' | 'spacer' | 'code' | 'divider';
  value: string;
  href?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
}

export const BLOCK_LABELS: Record<BlockRow['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  spacer: 'Spacer',
  code: 'Code block',
  divider: 'Divider',
};

export const emptyForm: TemplateFormState = {
  id: '',
  name: '',
  category: '',
  type: '',
  description: '',
  kind: 'docker',
  image: '',
  images: [],
  default_image: '',
  icon: '',
  color: '',
  ports: [{ host: '', guest: '', protocol: 'tcp' }],
  mounts: [{ source: '', target: '', mode: 'rw' }],
  limits: { ram_mb: '', cpu_pct: '', disk_mb: '', swap_mb: '' },
  caps: { databases: '', backups: '', networks: '' },
  env: [],
  install: [],
  install_timeout_s: '',
  install_terminal_id: '',
  actions: [],
  labels: [],
  devices: [],
  pages: [],
  home_page: '',
  instance_controls: { ...DEFAULT_INSTANCE_CONTROLS },
  healthcheck: {
    enabled: false,
    test_command: '',
    interval_s: '30',
    timeout_s: '5',
    retries: '3',
    start_period_s: '10',
  },
  advanced: {
    startup_command: '',
    startup_terminal_id: '',
    stop_command: '',
    stop_signal: '',
    working_dir: '',
    user: '',
    hostname: '',
    privileged: false,
    readonly_rootfs: false,
    enable_tty: false,
    dns: '',
    extra_hosts: '',
    network_mode: 'bridge',
    restart_policy: 'unless-stopped',
    shm_size_mb: '',
    pid_limit: '',
    ulimit_nofiles: '',
    ulimit_nproc: '',
    log_driver: 'json-file',
    log_max_size_mb: '',
    log_max_files: '',
    log_level: 'info',
    oom_kill_disable: false,
    cpu_quota_period: '',
    io_weight: '',
    environment_template: '',
    kvm: {
      vcpus: '2',
      cpu_model: 'host-passthrough',
      machine: 'q35',
      uefi: true,
      secure_boot: false,
      tpm: false,
      vga: 'virtio',
      video_memory_mb: '16',
      boot_order: 'hd',
      kernel_args: '',
      extra_args: '',
      vnc_port: '',
      vnc_password: '',
      spice_port: '',
      install_iso: '',
      disk_bus: 'virtio',
      disk_cache: 'writeback',
      io_thread: true,
      discard: true,
      numa: false,
      hugepages: false,
      rdm_reservation: false,
    },
    multipass: {
      cpus: '2',
      disk_mb: '10240',
      mem_mb: '1024',
      cloud_init_userdata: '',
      cloud_init_metadata: '',
      image_alias: '',
      bridges: '',
      bridged: '',
      launch_argument: '',
      autorecovery: true,
    },
    lxd: {
      profiles: 'default',
      storage_pool: 'default',
      storage_volume_size: '',
      config: '',
      devices: '',
      limits_cpu_allowance: '',
      limits_cpu_priority: '0',
      security_protection: true,
      security_privileged: false,
      raw_idmap: '',
      boot_autostart: true,
      snapshot_pattern: '',
    },
  },
};