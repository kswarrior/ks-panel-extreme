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
  };
}

// isControlsCustom reports whether the block carries any non-default value
// (used to decide if serializeSpec should persist it).
export function isControlsCustom(c: InstanceControls): boolean {
  const d = DEFAULT_INSTANCE_CONTROLS;
  return (Object.keys(d) as (keyof InstanceControls)[]).some((k) => c[k] !== d[k]);
}
