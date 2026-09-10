// InstanceControls — per-template allow-list for the built-in Instance
// controls (floating menu) + More → Overview page.
//
// Stored on the template spec as `instance_controls` and snapshotted into
// instance.Config on deploy, so instances carry their own copy (existing
// instances keep their snapshot when the template later changes).
//
// Allow-all defaults: a missing/unparseable block (old templates) enables
// everything, so behaviour is backward compatible.

export type OverviewDefaultTab = 'details' | 'monitoring' | 'manage' | 'activity';

export type ShortcutKey = 'files' | 'terminal' | 'ports' | 'automation' | 'env';

export const SHORTCUT_KEYS: ShortcutKey[] = ['files', 'terminal', 'ports', 'automation', 'env'];

// TerminalAllowInput mirrors the template action's per-action gate so pane
// defaults and action settings speak the same three values.
export type TerminalAllowInput = 'all' | 'allowlist' | 'disabled';

// TerminalInputMode — how operators type into terminal panes. 'direct' =
// type straight into the xterm (linux-terminal-like); 'box' = the xterm is
// output-only with an input + Send row below it (same bytes on the wire,
// friendlier on phones).
export type TerminalInputMode = 'direct' | 'box';

// TerminalPromptStyle — linux-like prompt line shown above each terminal
// pane in direct mode (`host:path$`, green host, blue path). 'none' =
// no prompt line (legacy behaviour); 'host_path' = `instance@node:~$`;
// 'host' = `instance@node$`; 'path' = `~$`. Display-only: it never
// reaches the PTY, so scrollback copy/download stay clean.
export type TerminalPromptStyle = 'none' | 'host_path' | 'host' | 'path';

// TerminalDefaultDef — one pre-opened pane on the instance Terminal page
// (template Controls → Terminal shortcut → "Default terminals"). `name` is
// the tab label, `id` the terminal ID it attaches with (empty = plain
// shell, otherwise matched against action/install/startup terminal IDs
// exactly like a manually added pane).
export interface TerminalDefaultDef {
  name: string;
  id: string;
}

// TerminalShortcutDef — one pre-made command button on the instance
// Terminal page (template Controls → Terminal shortcut → "Shortcuts").
// `label` is the dropdown text, `command` the bytes sent on run. The
// command may carry {{VAR}} / ${VAR} / $(VAR) placeholders: picking the
// shortcut asks the operator for each variable (strict — Send stays
// disabled until every value is filled), exactly like env 'ask' vars.
export interface TerminalShortcutDef {
  label: string;
  command: string;
}

// Cap on configured default terminals (template form + resolver). Bounds
// the initial xterm count so a hostile/bloated template can't force the
// Terminal page to mount hundreds of live consoles at once.
export const MAX_DEFAULT_TERMINALS = 10;

// Cap on configured command shortcuts (template form + resolver). Bounds
// the dropdown, not execution — each run still goes through the normal
// stdin path + server policy.
export const MAX_TERMINAL_SHORTCUTS = 20;

// InstanceShortcutConfig — per-tool config for the floating menu's quick
// shortcuts (Files / Terminal / Ports / Automation / Env) + the page they open. Stored inside
// `instance_controls.shortcuts` so it snapshots per template/instance like
// the rest of the block; missing keys fall back to the defaults below.
export interface InstanceShortcutConfig {
  // Show this shortcut in the floating menu (above Actions).
  show: boolean;
  // URL slug the shortcut navigates to (e.g. "files"). Files / Terminal
  // resolve against the instance's enabled pages; Ports renders its native
  // editor for its configured slug as well as the canonical "ports".
  slug: string;
  // Display name on the menu button.
  label: string;
  // Custom SVG icon markup (inner paths or a full <svg>); empty = default.
  icon_svg: string;
  // Icon tint (CSS color); empty = default tone.
  icon_color: string;
  // Page-context options (only the relevant one applies per tool):
  // Files page shows the SFTP card above the file manager.
  show_sftp: boolean;
  // Files page home folder (e.g. "/mc"). The file manager opens here by
  // default; empty = legacy behaviour (first volume mount's container
  // path, /mc for docker+minecraft, else /).
  files_home: string;
  // Files page jail: when true the operator can't navigate above
  // files_home (or its fallback), but sees everything inside it.
  files_jail: boolean;
  // Terminal page shows the title + Reconnect/Clear header bar.
  show_header: boolean;
  // Ports / Automation page allows Add / Remove (false = read-only table).
  allow_edit: boolean;
  // Automation page: which job kinds operators may create (false hides the
  // kind in the New-job picker and the backend refuses it at write + fire
  // time). All default true (backward compatible with pre-toggle snapshots).
  allow_shell: boolean;
  allow_power: boolean;
  allow_actions: boolean;
  // Automation page: ceiling (seconds) for the per-job timeout operators
  // may set in the New-job form. Effective timeout = min(job timeout,
  // this ceiling). 0/empty = default ceiling (1800s, same as the picker
  // cap); the resolver clamps to 1..1800 so a hostile template can't force
  // a zero/negative budget.
  max_timeout_sec: number;
  // Automation page: how many of this instance's jobs may run at the same
  // time (scheduler run-together gate). 0/empty = no extra cap beyond the
  // panel-wide limit; the resolver clamps to 1..64.
  max_concurrent_runs: number;
  // Automation page: how many jobs of this instance may be enabled at once
  // (an enabled job owns its schedule timer and fires). 0/empty =
  // unlimited; the resolver clamps to 1..1000.
  max_active_jobs: number;
  // Terminal page: allow adding more terminal panes side-by-side ("add more
  // terminal together"). Each pane gets its own ID box; an ID matching a
  // template action's terminal_id streams that action's log + gated input.
  terminal_allow_multi: boolean;
  // Terminal page: cap on simultaneous panes (empty/0 = unlimited).
  terminal_max: string;
  // Terminal page: defaults applied to every newly-added pane (each pane
  // stays fully customizable afterwards without editing the template).
  terminal_default_stop_on_exit: boolean;
  terminal_default_allow_input: TerminalAllowInput;
  terminal_default_timeout_s: string;
  // Terminal page: input method for every pane (template default).
  terminal_input_mode: TerminalInputMode;
  // Terminal page: prompt line style for direct-mode panes (template
  // default). Only applies when terminal_input_mode is 'direct'.
  terminal_prompt: TerminalPromptStyle;
  // Terminal page: command shortcuts master switch + list. Off (or empty)
  // = legacy behaviour (no shortcut UI at all).
  terminal_shortcuts_enabled: boolean;
  terminal_shortcuts: TerminalShortcutDef[];
  // Terminal page: panes opened automatically (first tab preselected).
  // Empty = legacy behaviour (single blank shell pane).
  default_terminals: TerminalDefaultDef[];
}

export interface InstanceShortcuts {
  files: InstanceShortcutConfig;
  terminal: InstanceShortcutConfig;
  ports: InstanceShortcutConfig;
  automation: InstanceShortcutConfig;
  env: InstanceShortcutConfig;
}

export interface InstanceControls {
  // Floating menu — info row.
  show_info_row: boolean;
  show_cpu: boolean;
  show_ram: boolean;
  show_disk: boolean;
  // Floating menu — power + template actions.
  allow_start: boolean;
  allow_stop: boolean;
  allow_restart: boolean;
  allow_kill: boolean;
  allow_template_actions: boolean;
  // More → Overview tabs.
  show_details_tab: boolean;
  show_monitoring_tab: boolean;
  show_manage_tab: boolean;
  show_activity_tab: boolean;
  default_tab: OverviewDefaultTab;
  // Floating menu "More" link target (page slug, e.g. "overview"). Rendered
  // inside the controls block so it snapshots per instance like the rest.
  more_page: string;
  // More → Overview → Manage buttons.
  allow_rename: boolean;
  allow_edit_advanced: boolean;
  allow_reinstall: boolean;
  allow_destroy: boolean;
  // More → Overview → Details shortcuts.
  allow_external_id_copy: boolean;
  allow_node_link: boolean;
  allow_template_link: boolean;
  // Floating menu — quick shortcuts (Files / Terminal / Ports / Automation / Env) above Actions.
  shortcuts: InstanceShortcuts;
}

const DEFAULT_SHORTCUT_BASE = {
  show: true,
  icon_svg: '',
  show_sftp: true,
  files_home: '',
  files_jail: false,
  show_header: true,
  allow_edit: true,
  allow_shell: true,
  allow_power: true,
  allow_actions: true,
  max_timeout_sec: 0,
  max_concurrent_runs: 0,
  max_active_jobs: 0,
  terminal_allow_multi: true,
  terminal_max: '4',
  terminal_default_stop_on_exit: true,
  terminal_default_allow_input: 'all' as TerminalAllowInput,
  terminal_default_timeout_s: '',
  terminal_input_mode: 'direct' as TerminalInputMode,
  terminal_prompt: 'none' as TerminalPromptStyle,
  terminal_shortcuts_enabled: false,
  terminal_shortcuts: [],
  default_terminals: [],
};

export const DEFAULT_SHORTCUTS: InstanceShortcuts = {
  files: { ...DEFAULT_SHORTCUT_BASE, slug: 'files', label: 'Files', icon_color: '#fbbf24' },
  terminal: { ...DEFAULT_SHORTCUT_BASE, slug: 'terminal', label: 'Terminal', icon_color: '#34d399' },
  ports: { ...DEFAULT_SHORTCUT_BASE, slug: 'ports', label: 'Ports', icon_color: '#38bdf8' },
  automation: { ...DEFAULT_SHORTCUT_BASE, slug: 'automation', label: 'Automation', icon_color: '#a78bfa' },
  env: { ...DEFAULT_SHORTCUT_BASE, slug: 'env', label: 'Env', icon_color: '#fb7185' },
};

export const DEFAULT_INSTANCE_CONTROLS: InstanceControls = {
  show_info_row: true,
  show_cpu: true,
  show_ram: true,
  show_disk: true,
  allow_start: true,
  allow_stop: true,
  allow_restart: true,
  allow_kill: true,
  allow_template_actions: true,
  show_details_tab: true,
  show_monitoring_tab: true,
  show_manage_tab: true,
  show_activity_tab: true,
  default_tab: 'details',
  more_page: 'overview',
  allow_rename: true,
  allow_edit_advanced: true,
  allow_reinstall: true,
  allow_destroy: true,
  allow_external_id_copy: true,
  allow_node_link: true,
  allow_template_link: true,
  shortcuts: {
    files: { ...DEFAULT_SHORTCUTS.files },
    terminal: { ...DEFAULT_SHORTCUTS.terminal },
    ports: { ...DEFAULT_SHORTCUTS.ports },
    automation: { ...DEFAULT_SHORTCUTS.automation },
    env: { ...DEFAULT_SHORTCUTS.env },
  },
};

const VALID_DEFAULT_TABS: OverviewDefaultTab[] = ['details', 'monitoring', 'manage', 'activity'];

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v : fallback;
}

function slugOr(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || v.trim() === '') return fallback;
  const s = v.trim().replace(/^\/+|\/+$/g, '').trim();
  return s !== '' ? s : fallback;
}

// normTerminalId matches the template form + terminal page matching on
// every layer: lowercase, spaces → _, only [a-z0-9_-] survive. Empty stays
// empty (a pane with no ID is a plain shell — valid, not garbage).
function normTerminalId(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

// resolveDefaultTerminals normalises the configured pre-opened panes.
// Absent → the fallback array BY REFERENCE so equality checks keep seeing
// "not customised". Fully-empty rows are dropped; the rest keep their
// trimmed name + normalised ID, capped at MAX_DEFAULT_TERMINALS.
function resolveDefaultTerminals(raw: unknown, fallback: TerminalDefaultDef[]): TerminalDefaultDef[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => ({
      name: String((x as Record<string, any>).name ?? '').trim().slice(0, 64),
      id: normTerminalId((x as Record<string, any>).id),
    }))
    .filter((x) => x.name !== '' || x.id !== '')
    .slice(0, MAX_DEFAULT_TERMINALS);
}

// resolveTerminalShortcuts normalises the configured command shortcuts.
// Absent → the fallback array BY REFERENCE (same "not customised" rule as
// default terminals). Fully-empty rows are dropped, the rest capped.
function resolveTerminalShortcuts(raw: unknown, fallback: TerminalShortcutDef[]): TerminalShortcutDef[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => ({
      label: String((x as Record<string, any>).label ?? '').trim().slice(0, 64),
      command: String((x as Record<string, any>).command ?? '').slice(0, 500),
    }))
    .filter((x) => x.label !== '' || x.command.trim() !== '')
    .slice(0, MAX_TERMINAL_SHORTCUTS);
}

// SHORTCUT_VAR_RE matches the three placeholder forms shared with deploy
// env substitution ({{VAR}}, ${VAR}, $(VAR)). Bare $VAR is deliberately
// NOT a placeholder (the backend leaves it literal too), so free typing
// like `echo $HOME` never spawns ask-fields.
const SHORTCUT_VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}|\$\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

// extractShortcutVars lists placeholder names in first-seen order.
export function extractShortcutVars(command: string): string[] {
  const out: string[] = [];
  SHORTCUT_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SHORTCUT_VAR_RE.exec(String(command ?? ''))) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// resolveShortcutCommand fills placeholders from values. Names without a
// value stay literal (visible), matching backend substitution semantics.
export function resolveShortcutCommand(command: string, values: Record<string, string>): string {
  SHORTCUT_VAR_RE.lastIndex = 0;
  return String(command ?? '').replace(SHORTCUT_VAR_RE, (match, a, b, c) => {
    const v = values[a ?? b ?? c];
    return typeof v === 'string' && v !== '' ? v : match;
  });
}

// normalizeFilesPath collapses a container path to absolute form without
// a trailing slash (except "/"). Dot segments resolve lexically; ".."
// segments are dropped so a configured home can never escape the root.
export function normalizeFilesPath(p: unknown): string {
  let s = String(p ?? '').trim().replace(/\\/g, '/');
  if (s === '') return '/';
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/+/g, '/');
  const out: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return `/${out.join('/')}`;
}

// isPathWithinHome reports whether p equals home or lives underneath it
// (same coordinate space: absolute container paths). Used by the Files page
// jail so operators stay at or below the configured home folder.
export function isPathWithinHome(home: string, p: unknown): boolean {
  const h = normalizeFilesPath(home);
  const n = normalizeFilesPath(p);
  if (h === '/') return true;
  return n === h || n.startsWith(`${h}/`);
}

// resolveShortcut normalises one shortcuts.<key> entry; absent/garbled
// entries fall back field-by-field so old snapshots keep working.
function resolveShortcut(raw: unknown, fallback: InstanceShortcutConfig): InstanceShortcutConfig {
  const r: Record<string, any> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const allowInput = typeof r.terminal_default_allow_input === 'string' &&
    ['all', 'allowlist', 'disabled'].includes(r.terminal_default_allow_input)
    ? (r.terminal_default_allow_input as TerminalAllowInput)
    : fallback.terminal_default_allow_input;
  const inputMode = r.terminal_input_mode === 'box' || r.terminal_input_mode === 'direct'
    ? (r.terminal_input_mode as TerminalInputMode)
    : fallback.terminal_input_mode;
  const promptStyle = r.terminal_prompt === 'host_path' || r.terminal_prompt === 'host' || r.terminal_prompt === 'path' || r.terminal_prompt === 'none'
    ? (r.terminal_prompt as TerminalPromptStyle)
    : fallback.terminal_prompt;
  return {
    show: boolOr(r.show, fallback.show),
    slug: slugOr(r.slug, fallback.slug),
    label: strOr(r.label, fallback.label).trim(),
    icon_svg: typeof r.icon_svg === 'string' ? r.icon_svg : fallback.icon_svg,
    icon_color: typeof r.icon_color === 'string' ? r.icon_color.trim() : fallback.icon_color,
    show_sftp: boolOr(r.show_sftp, fallback.show_sftp),
    files_home: (() => {
      const raw = typeof r.files_home === 'string' ? r.files_home.trim() : '';
      if (raw === '') return fallback.files_home;
      return normalizeFilesPath(raw);
    })(),
    files_jail: boolOr(r.files_jail, fallback.files_jail),
    show_header: boolOr(r.show_header, fallback.show_header),
    allow_edit: boolOr(r.allow_edit, fallback.allow_edit),
    allow_shell: boolOr(r.allow_shell, fallback.allow_shell),
    allow_power: boolOr(r.allow_power, fallback.allow_power),
    allow_actions: boolOr(r.allow_actions, fallback.allow_actions),
    max_timeout_sec: (() => {
      const v = r.max_timeout_sec;
      if (v === undefined || v === null || v === '') return fallback.max_timeout_sec;
      const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v), 10);
      if (!Number.isFinite(n) || n <= 0) return fallback.max_timeout_sec;
      return Math.max(1, Math.min(1800, n));
    })(),
    max_concurrent_runs: resolveCappedCount(r.max_concurrent_runs, fallback.max_concurrent_runs, 64),
    max_active_jobs: resolveCappedCount(r.max_active_jobs, fallback.max_active_jobs, 1000),
    terminal_allow_multi: boolOr(r.terminal_allow_multi, fallback.terminal_allow_multi),
    terminal_max: typeof r.terminal_max === 'string' || typeof r.terminal_max === 'number'
      ? String(r.terminal_max)
      : fallback.terminal_max,
    terminal_default_stop_on_exit: boolOr(r.terminal_default_stop_on_exit, fallback.terminal_default_stop_on_exit),
    terminal_default_allow_input: allowInput,
    terminal_default_timeout_s: typeof r.terminal_default_timeout_s === 'string' || typeof r.terminal_default_timeout_s === 'number'
      ? String(r.terminal_default_timeout_s)
      : fallback.terminal_default_timeout_s,
    terminal_input_mode: inputMode,
    terminal_prompt: promptStyle,
    terminal_shortcuts_enabled: boolOr(r.terminal_shortcuts_enabled, fallback.terminal_shortcuts_enabled),
    terminal_shortcuts: resolveTerminalShortcuts(r.terminal_shortcuts, fallback.terminal_shortcuts),
    default_terminals: resolveDefaultTerminals(r.default_terminals, fallback.default_terminals),
  };
}

function resolveShortcuts(raw: unknown): InstanceShortcuts {
  const r: Record<string, any> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  return {
    files: resolveShortcut(r.files, DEFAULT_SHORTCUTS.files),
    terminal: resolveShortcut(r.terminal, DEFAULT_SHORTCUTS.terminal),
    ports: resolveShortcut(r.ports, DEFAULT_SHORTCUTS.ports),
    automation: resolveShortcut(r.automation, DEFAULT_SHORTCUTS.automation),
    env: resolveShortcut(r.env, DEFAULT_SHORTCUTS.env),
  };
}

// resolveInstanceControls normalises a template spec or instance config
// (raw JSON string or parsed object) into a complete InstanceControls.
// Anything absent → allow-all default.
export function resolveInstanceControls(
  raw?: string | Record<string, any> | null,
): InstanceControls {
  let root: Record<string, any> | null = null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s) {
      try {
        const p = JSON.parse(s);
        if (p && typeof p === 'object' && !Array.isArray(p)) root = p;
      } catch {
        root = null;
      }
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    root = raw;
  }
  const c: Record<string, any> =
    root?.instance_controls && typeof root.instance_controls === 'object' && !Array.isArray(root.instance_controls)
      ? root.instance_controls
      : {};
  const d = DEFAULT_INSTANCE_CONTROLS;
  const def = typeof c.default_tab === 'string' && (VALID_DEFAULT_TABS as string[]).includes(c.default_tab)
    ? (c.default_tab as OverviewDefaultTab)
    : d.default_tab;
  const morePage = typeof c.more_page === 'string' && c.more_page.trim() !== ''
    ? c.more_page.trim().replace(/^\/+|\/+$/g, '')
    : d.more_page;
  return {
    show_info_row: boolOr(c.show_info_row, d.show_info_row),
    show_cpu: boolOr(c.show_cpu, d.show_cpu),
    show_ram: boolOr(c.show_ram, d.show_ram),
    show_disk: boolOr(c.show_disk, d.show_disk),
    allow_start: boolOr(c.allow_start, d.allow_start),
    allow_stop: boolOr(c.allow_stop, d.allow_stop),
    allow_restart: boolOr(c.allow_restart, d.allow_restart),
    allow_kill: boolOr(c.allow_kill, d.allow_kill),
    allow_template_actions: boolOr(c.allow_template_actions, d.allow_template_actions),
    show_details_tab: boolOr(c.show_details_tab, d.show_details_tab),
    show_monitoring_tab: boolOr(c.show_monitoring_tab, d.show_monitoring_tab),
    show_manage_tab: boolOr(c.show_manage_tab, d.show_manage_tab),
    show_activity_tab: boolOr(c.show_activity_tab, d.show_activity_tab),
    default_tab: def,
    more_page: morePage || d.more_page,
    allow_rename: boolOr(c.allow_rename, d.allow_rename),
    allow_edit_advanced: boolOr(c.allow_edit_advanced, d.allow_edit_advanced),
    allow_reinstall: boolOr(c.allow_reinstall, d.allow_reinstall),
    allow_destroy: boolOr(c.allow_destroy, d.allow_destroy),
    allow_external_id_copy: boolOr(c.allow_external_id_copy, d.allow_external_id_copy),
    allow_node_link: boolOr(c.allow_node_link, d.allow_node_link),
    allow_template_link: boolOr(c.allow_template_link, d.allow_template_link),
    shortcuts: resolveShortcuts(c.shortcuts),
  };
}

// shortcutSlug returns the normalized URL slug for a menu shortcut.
export function shortcutSlug(controls: InstanceControls, key: ShortcutKey): string {
  const s = controls?.shortcuts?.[key]?.slug;
  if (typeof s === 'string' && s.trim() !== '') {
    const norm = s.trim().replace(/^\/+|\/+$/g, '').trim();
    if (norm !== '') return norm;
  }
  return DEFAULT_SHORTCUTS[key].slug;
}

// shortcutLabel returns the display name for a menu shortcut.
export function shortcutLabel(controls: InstanceControls, key: ShortcutKey): string {
  const s = controls?.shortcuts?.[key]?.label;
  if (typeof s === 'string' && s.trim() !== '') return s.trim();
  return DEFAULT_SHORTCUTS[key].label;
}

const SHORTCUT_FIELDS: (keyof InstanceShortcutConfig)[] = [
  'show',
  'slug',
  'label',
  'icon_svg',
  'icon_color',
  'show_sftp',
  'files_home',
  'files_jail',
  'show_header',
  'allow_edit',
  'allow_shell',
  'allow_power',
  'allow_actions',
  'max_timeout_sec',
  'max_concurrent_runs',
  'max_active_jobs',
  'terminal_allow_multi',
  'terminal_max',
  'terminal_default_stop_on_exit',
  'terminal_default_allow_input',
  'terminal_default_timeout_s',
  'terminal_input_mode',
  'terminal_prompt',
  'terminal_shortcuts_enabled',
  'terminal_shortcuts',
  'default_terminals',
];

export function isShortcutCustom(a: InstanceShortcutConfig, b: InstanceShortcutConfig): boolean {
  // Arrays compare by reference — a configured list with identical content
  // must still read as "not customised", so compare by value instead.
  return SHORTCUT_FIELDS.some((k) => Array.isArray(a[k]) || Array.isArray(b[k])
    ? JSON.stringify(a[k] ?? []) !== JSON.stringify(b[k] ?? [])
    : a[k] !== b[k]);
}

// automationTimeoutCeiling resolves the template ceiling for per-job
// timeouts: the configured max_timeout_sec, or 1800 when unset (0).
// Mirrors the backend automationMaxTimeoutSec default.
export const DEFAULT_AUTOMATION_MAX_TIMEOUT_SEC = 1800;

export function automationTimeoutCeiling(controls: InstanceControls): number {
  const v = controls?.shortcuts?.automation?.max_timeout_sec;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.max(1, Math.min(DEFAULT_AUTOMATION_MAX_TIMEOUT_SEC, Math.floor(v)));
  }
  return DEFAULT_AUTOMATION_MAX_TIMEOUT_SEC;
}

// resolveCappedCount normalises one automation count cap (run-together /
// active-jobs): unset/garbled/<=0 falls back (0 = uncapped), positives
// clamp to 1..cap. Mirrors the backend automationNumberField.
function resolveCappedCount(v: unknown, fallback: number, cap: number): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(cap, n));
}

// automationRunLimits resolves the template's run-together + active-jobs
// caps (0 = uncapped). Mirrors AutomationConcurrentLimit /
// AutomationMaxActiveJobs on the backend.
export function automationRunLimits(controls: InstanceControls): { concurrent: number; active: number } {
  const auto = controls?.shortcuts?.automation;
  return {
    concurrent: typeof auto?.max_concurrent_runs === 'number' && auto.max_concurrent_runs > 0 ? auto.max_concurrent_runs : 0,
    active: typeof auto?.max_active_jobs === 'number' && auto.max_active_jobs > 0 ? auto.max_active_jobs : 0,
  };
}

// isControlsCustom reports whether the block carries any non-default value
// (used to decide if serializeSpec should persist it).
export function isControlsCustom(c: InstanceControls): boolean {
  const d = DEFAULT_INSTANCE_CONTROLS;
  if ((Object.keys(d) as (keyof InstanceControls)[]).some((k) => k !== 'shortcuts' && c[k] !== d[k])) {
    return true;
  }
  return SHORTCUT_KEYS.some((k) => isShortcutCustom(c.shortcuts[k], d.shortcuts[k]));
}
