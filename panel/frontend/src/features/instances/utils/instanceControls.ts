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
}

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
};

const VALID_DEFAULT_TABS: OverviewDefaultTab[] = ['details', 'monitoring', 'manage', 'activity'];

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
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
