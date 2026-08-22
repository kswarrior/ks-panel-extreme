// Canonical instance/template types shared by the admin pages. Mirror the Go
// models in internal/models/instance.go and the wire format in
// internal/edge/client.go's LifecycleRequest.

export type DriverKind = 'docker' | 'lxd' | 'kvm' | 'multipass';

export interface Template {
  id: number;
  name: string;
  description: string;
  /** Which ksedge driver executes instances from this template. */
  kind: DriverKind;
  /** Driver-specific base image, forwarded verbatim to ksedge. */
  image: string;
  /** JSON blob of driver-specic config (env, ports, limits…). Opaque to UI. */
  spec: string;
  created_at: string;
  updated_at: string;
}

export interface Instance {
  id: number;
  node_id: number;
  /** Joined node name for display. */
  node_name?: string;
  template_id: number;
  /** Joined template name — may be absent if the template was deleted. */
  template_name?: string;
  /** Owning user ID — NULL rows are legacy/unattributed. */
  owner_id?: number | null;
  /** Joined owner username for display. */
  owner_name?: string;
  name: string;
  /** Human-readable label shown in the UI. Falls back to name when empty. */
  display_name?: string;
  /** Optional SVG string for custom icon displayed on the instance card. */
  icon?: string;
  /** Optional hex colour for the icon/accent on the card. */
  color?: string;
  kind: DriverKind;
  /**
   * 'creating' | 'installing' | 'running' | 'stopped' | 'errored' |
   * 'install_failed' | 'destroyed'.
   *
   * 'installing' is the transient state set right after the docker/lxd
   * container comes up when the template defines an install workflow;
   * installSweepLoop flips it to 'running' once the edge's install
   * workflow reports done, or 'install_failed' if a step fails. Flow 1
   * (create-only) skips it and lands straight on the driver's status.
   */
  status: string;
  /** Real driver-side ID ksedge returned (container name, lxc name…). */
  external_id?: string;
  config?: string;
  error?: string;
  /**
   * Install-workflow tracking — populated by the deploy goroutine and the
   * panel's installSweepLoop while Flow 2 (post-create install) runs.
   * Mirrors internal/models/Instance.Install*.
   */
  /** '' | 'running' | 'done' | 'failed'. Empty when the template has no install steps. */
  install_state?: '' | 'running' | 'done' | 'failed';
  /** Edge install key ("<kind>:<name>") used for status polling. */
  install_id?: string;
  /** Current step index (-1 = not started). */
  install_step?: number;
  /** Short failure message surfaced from the failing step's first stderr line. */
  install_error?: string;
  /** Full per-step transcript JSON (decoded lazily by the detail page). */
  install_steps_json?: string;
  /** '' = the template's own install workflow; 'action' = a template.spec.actions[] entry the operator invoked from the Actions card. installSweepLoop reads this on workflow completion to decide whether to stop the container. */
  install_kind?: '' | 'action';
  /** When install_kind=='action', 1 means the action declared auto_stop_on_exit (stop the container once the action's foreground process exits); 0 means leave running. */
  install_auto_stop?: number;
  /** When install_kind=='action', the spec.actions[].id of the action currently in flight; lets the home-page Actions card morph only the matching button to a Stop button. Empty for the template install workflow and once the workflow resolves. */
  install_action_id?: string;
  created_at: string;
  updated_at: string;
  // Suspension fields (migration 038)
  suspended?: number;
  suspended_until?: string | null;
  suspension_count?: number;
}

export interface DeployRequest {
  template_id: number;
  node_id: number;
  /** Owning user — admins deploy on behalf of a selected owner. */
  owner_id?: number;
  name: string;
  /** Human-readable label shown in the UI. Falls back to name when empty. */
  display_name?: string;
  /** Optional SVG string for custom icon displayed on the instance card. */
  icon?: string;
  /** Optional hex colour for the icon/accent on the card. */
  color?: string;
  /** Shallow-merged onto the template.spec before POSTing to ksedge. */
  overrides?: Record<string, unknown>;
  /**
   * Per-deploy values for template-defined env variables. The panel
   * validates each against the template's env[] rules (required, regex,
   * append/prepend) server-side and builds the final KEY=VALUE map that
   * flows to `docker -e` AND to the edge install workflow's {{KEY}}
   * substitution. Omitted on deploys from templates that don't define any
   * env vars.
   */
  env_vars?: Record<string, string>;
}