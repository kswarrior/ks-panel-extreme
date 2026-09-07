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

export type ShortcutKey = 'files' | 'terminal' | 'ports';

export const SHORTCUT_KEYS: ShortcutKey[] = ['files', 'terminal', 'ports'];

// TerminalAllowInput mirrors the template action's per-action gate so pane
// defaults and action settings speak the same three values.
export type TerminalAllowInput = 'all' | 'allowlist' | 'disabled';

// InstanceShortcutConfig — per-tool config for the floating menu's quick
// shortcuts (Files / Terminal / Ports) + the page they open. Stored inside
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
  // Terminal page shows the title + Reconnect/Clear header bar.
  show_header: boolean;
  // Ports page allows Add / Remove (false = read-only table).
  allow_edit: boolean;
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
}

export interface InstanceShortcuts {
  files: InstanceShortcutConfig;
  terminal: InstanceShortcutConfig;
  ports: InstanceShortcutConfig;
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
  // Floating menu — quick shortcuts (Files / Terminal / Ports) above Actions.
  shortcuts: InstanceShortcuts;
}

const DEFAULT_SHORTCUT_BASE = {
  show: true,
  icon_svg: '',
  show_sftp: true,
  show_header: true,
  allow_edit: true,
  terminal_allow_multi: true,
  terminal_max: '4',
  terminal_default_stop_on_exit: true,
  terminal_default_allow_input: 'all' as TerminalAllowInput,
  terminal_default_timeout_s: '',
};

export const DEFAULT_SHORTCUTS: InstanceShortcuts = {
  files: { ...DEFAULT_SHORTCUT_BASE, slug: 'files', label: 'Files', icon_color: '#fbbf24' },
  terminal: { ...DEFAULT_SHORTCUT_BASE, slug: 'terminal', label: 'Terminal', icon_color: '#34d399' },
  ports: { ...DEFAULT_SHORTCUT_BASE, slug: 'ports', label: 'Ports', icon_color: '#38bdf8' },
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

// resolveShortcut normalises one shortcuts.<key> entry; absent/garbled
// entries fall back field-by-field so old snapshots keep working.
function resolveShortcut(raw: unknown, fallback: InstanceShortcutConfig): InstanceShortcutConfig {
  const r: Record<string, any> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const allowInput = typeof r.terminal_default_allow_input === 'string' &&
    ['all', 'allowlist', 'disabled'].includes(r.terminal_default_allow_input)
    ? (r.terminal_default_allow_input as TerminalAllowInput)
    : fallback.terminal_default_allow_input;
  return {
    show: boolOr(r.show, fallback.show),
    slug: slugOr(r.slug, fallback.slug),
    label: strOr(r.label, fallback.label).trim(),
    icon_svg: typeof r.icon_svg === 'string' ? r.icon_svg : fallback.icon_svg,
    icon_color: typeof r.icon_color === 'string' ? r.icon_color.trim() : fallback.icon_color,
    show_sftp: boolOr(r.show_sftp, fallback.show_sftp),
    show_header: boolOr(r.show_header, fallback.show_header),
    allow_edit: boolOr(r.allow_edit, fallback.allow_edit),
    terminal_allow_multi: boolOr(r.terminal_allow_multi, fallback.terminal_allow_multi),
    terminal_max: typeof r.terminal_max === 'string' || typeof r.terminal_max === 'number'
      ? String(r.terminal_max)
      : fallback.terminal_max,
    terminal_default_stop_on_exit: boolOr(r.terminal_default_stop_on_exit, fallback.terminal_default_stop_on_exit),
    terminal_default_allow_input: allowInput,
    terminal_default_timeout_s: typeof r.terminal_default_timeout_s === 'string' || typeof r.terminal_default_timeout_s === 'number'
      ? String(r.terminal_default_timeout_s)
      : fallback.terminal_default_timeout_s,
  };
}

function resolveShortcuts(raw: unknown): InstanceShortcuts {
  const r: Record<string, any> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  return {
    files: resolveShortcut(r.files, DEFAULT_SHORTCUTS.files),
    terminal: resolveShortcut(r.terminal, DEFAULT_SHORTCUTS.terminal),
    ports: resolveShortcut(r.ports, DEFAULT_SHORTCUTS.ports),
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
  'show_header',
  'allow_edit',
  'terminal_allow_multi',
  'terminal_max',
  'terminal_default_stop_on_exit',
  'terminal_default_allow_input',
  'terminal_default_timeout_s',
];

export function isShortcutCustom(a: InstanceShortcutConfig, b: InstanceShortcutConfig): boolean {
  return SHORTCUT_FIELDS.some((k) => a[k] !== b[k]);
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
