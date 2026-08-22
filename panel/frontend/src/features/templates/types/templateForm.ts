// TemplateForm types - extracted from TemplateForm.tsx

export type DriverKind = 'docker' | 'lxd' | 'kvm' | 'multipass';

export function stripUnit(v: string): string {
  const m = v.match(/^\s*(\d+)\s*([MGmg]?)\s*$/);
  if (!m) return v;
  let n = parseInt(m[1], 10);
  if (m[2].toLowerCase() === 'g') n *= 1024;
  return String(n);
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

export interface TemplateAction {
  id: string;
  name: string;
  description: string;
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
}

export type LogDriver = 'json-file' | 'syslog' | 'journald' | 'none';

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
  ports: PortMapping[];
  mounts: Mount[];
  limits: ResourceLimits;
  caps: FeatureCaps;
  env: EnvVariable[];
  install: InstallStep[];
  actions: TemplateAction[];
  labels: Label[];
  devices: Device[];
  healthcheck: Healthcheck;
  advanced: Advanced;
  pages: PageOverride[];
}

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
  { id: 'spec', label: 'Spec Preview' },
];

export interface TagPickerProps {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  onAdd: (v: string) => void;
  onDelete: (v: string) => void;
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
  ports: [{ host: '', guest: '', protocol: 'tcp' }],
  mounts: [{ source: '', target: '', mode: 'rw' }],
  limits: { ram_mb: '', cpu_pct: '', disk_mb: '', swap_mb: '' },
  caps: { databases: '', backups: '', networks: '' },
  env: [],
  install: [],
  actions: [],
  labels: [],
  devices: [],
  pages: [],
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