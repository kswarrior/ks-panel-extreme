// InstanceForm types - extracted from InstanceForm.tsx

import type { Template } from '@/shared/types/instance';
import type { InstancePageSubPage } from '@/features/instance-pages/types/instancePage';
import type { InstanceControls } from '@/features/instances/utils/instanceControls';
import { DEFAULT_INSTANCE_CONTROLS } from '@/features/instances/utils/instanceControls';

export type KindKey = 'docker' | 'lxd' | 'kvm' | 'multipass' | 'unknown';

export const KIND_META: Record<KindKey, { label: string; badge: string; dot: string; icon: string }> = {
  docker: { label: 'Docker', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', icon: 'container' },
  lxd: { label: 'LXD', badge: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60', dot: 'bg-indigo-400', icon: 'lxd' },
  kvm: { label: 'KVM', badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60', dot: 'bg-orange-400', icon: 'kvm' },
  multipass: { label: 'Multipass', badge: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60', dot: 'bg-fuchsia-400', icon: 'multipass' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', icon: 'unknown' },
};

export function kindKey(k: string): KindKey {
  return (k in KIND_META ? k : 'unknown') as KindKey;
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
  append: boolean;
  prepend: string;
  append_value: string;
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

export interface ActionStep extends InstallStep {}

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

export type NetworkMode = 'host' | 'bridge' | 'none' | 'container' | 'macvlan' | 'ipvlan';
export type RestartPolicy = 'no' | 'always' | 'unless-stopped' | 'on-failure';
export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

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

export interface Advanced {
  startup_command: string;
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
  log_driver: 'json-file' | 'syslog' | 'journald' | 'none';
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

export interface PageOverride {
  slug: string;
  enabled: boolean;
  label: string;
  icon_svg: string;
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
   *  Referenced in content with {{component:name}}. */
  components?: import('@/features/instance-pages/types/instancePage').PageComponentDef[];
  /** Multi-page support: extra pages nested INSIDE this row. Effective route
   *  of each is "<slug>/<path>" (e.g. files/edit); they never render as
   *  separate top-level tabs. */
  sub_pages?: InstancePageSubPage[];
  /** Page-level configure vars copied from the library row. */
  configure?: import('@/features/instance-pages/types/instancePage').PageConfigureVar[];
  /** Per-template values for this page's configure vars, keyed by var name. */
  config?: Record<string, string>;
}

export interface EditorState {
  ports: PortMapping[];
  mounts: Mount[];
  limits: ResourceLimits;
  caps: FeatureCaps;
  env: EnvVariable[];
  install: InstallStep[];
  // Whole-workflow budget in seconds for the install workflow
  // (spec.install_timeout_sec). Empty = the edge's default (30 min).
  install_timeout_s: string;
  actions: TemplateAction[];
  labels: Label[];
  devices: Device[];
  healthcheck: Healthcheck;
  advanced: Advanced;
  pages: PageOverride[];
  category: string;
  type: string;
  // Built-in Instance controls allow-list (spec.instance_controls).
  // Inherited from the template on deploy; per-instance override here.
  // Missing = allow all.
  instance_controls: InstanceControls;
  // Landing page slug for the instance index route (/instances/:id).
  // Empty = default Home. Inherited from the template on deploy.
  home_page: string;
}

export type InstanceTabId =
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

export interface IconPreset {
  value: string;
  label: string;
  svg: string;
}

export const ICON_PRESETS: IconPreset[] = [
  { value: '', label: 'None', svg: '' },
  { value: 'server', label: 'Server', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/> </svg>' },
  { value: 'container', label: 'Container', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h7v5H3z"/><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2"/><path d="M3 8v8h7V8"/><path d="M3 12h7"/> </svg>' },
  { value: 'database', label: 'Database', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M3 12v14c0 1.66 3.58 3 8 3s8-1.34 8-3v-14"/> </svg>' },
  { value: 'terminal', label: 'Terminal', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/> </svg>' },
  { value: 'monitor', label: 'Monitor', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/> </svg>' },
  { value: 'cpu', label: 'CPU', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/> </svg>' },
  { value: 'memory', label: 'Memory', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="9" rx="2"/><path d="M6 8v3M10 8v3M14 8v3M18 8v3"/><path d="M4 17v3M8 17v3M12 17v3M16 17v3M20 17v3"/> </svg>' },
  { value: 'network', label: 'Network', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/> </svg>' },
  { value: 'shield', label: 'Shield', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg>' },
  { value: 'star', label: 'Star', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/> </svg>' },
  { value: 'zap', label: 'Zap', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/> </svg>' },
  { value: 'globe', label: 'Globe', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/> </svg>' },
];

export interface ColorSwatch {
  value: string;
  label: string;
}

export const COLOR_SWATCHES: ColorSwatch[] = [
  { value: '', label: 'None' },
  { value: '#a78bfa', label: 'Violet' },
  { value: '#38bdf8', label: 'Sky' },
  { value: '#34d399', label: 'Emerald' },
  { value: '#fbbf24', label: 'Amber' },
  { value: '#f87171', label: 'Red' },
  { value: '#f472b6', label: 'Pink' },
  { value: '#94a3b8', label: 'Slate' },
];

export function driverEnabled(n: { driver_docker?: boolean; driver_lxd?: boolean; driver_kvm?: boolean; driver_multipass?: boolean }, kind: KindKey): boolean {
  switch (kind) {
    case 'docker': return n.driver_docker ?? false;
    case 'lxd': return n.driver_lxd ?? false;
    case 'kvm': return n.driver_kvm ?? false;
    case 'multipass': return n.driver_multipass ?? false;
    default: return true;
  }
}

export function emptyKvm(): KvRuntime {
  return {
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
  };
}

export function emptyMp(): MpRuntime {
  return {
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
  };
}

export function emptyLxd(): LxdRuntime {
  return {
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
  };
}

export function emptyEditor(): EditorState {
  return {
    ports: [],
    mounts: [],
    limits: { ram_mb: '', cpu_pct: '', disk_mb: '', swap_mb: '' },
    caps: { databases: '', backups: '', networks: '' },
    env: [],
    install: [],
    install_timeout_s: '',
    actions: [],
    labels: [],
    devices: [],
    category: '',
    type: '',
    pages: [],
    instance_controls: { ...DEFAULT_INSTANCE_CONTROLS },
    home_page: '',
    healthcheck: { enabled: false, test_command: '', interval_s: '30', timeout_s: '5', retries: '3', start_period_s: '10' },
    advanced: {
      startup_command: '',
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
      kvm: emptyKvm(),
      multipass: emptyMp(),
      lxd: emptyLxd(),
    },
  };
}