// NodeForm types - extracted from NodeForm.tsx

export type ConnectionMode = 'direct' | 'reverse_tunnel' | 'both' | 'local_port' | 'local_wss' | 'local_both';

// WssTask is the fixed task taxonomy for a WSS channel row:
//   all      catch-all — handles every WSS payload unless an exact-task row wins.
//   files    file-manager transfers go via this channel.
//   node     node telemetry (resources, uptime, probe/health).
//   instance instance lifecycle (deploy/delete/edit/start/stop, install, exec).
export type WssTask = 'all' | 'files' | 'node' | 'instance';

// WssTransport is the preferred transport for a channel in both/local_both:
//   wss  force WSS tunnel for this task.
//   port force direct HTTP (port) for this task.
//   auto WSS when connected else HTTP, with emergency fallback on
//        overload/disconnect.
export type WssTransport = 'wss' | 'port' | 'auto';

export interface WssChannel {
  /** Client-side key (server id once saved, temp-* before). */
  key: string;
  /** Server id when the row came from the API. */
  id?: number;
  name: string;
  task: WssTask;
  transport: WssTransport;
  fallback: boolean;
}

export const WSS_TASKS: { value: WssTask; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Handles every WSS payload (catch-all).' },
  { value: 'files', label: 'Files', hint: 'File-manager transfers go via this channel.' },
  { value: 'node', label: 'Node', hint: 'Resources, uptime, probe/health data.' },
  { value: 'instance', label: 'Instance', hint: 'Deploy / delete / edit / start / stop, install, exec.' },
];

export const WSS_TRANSPORTS: { value: WssTransport; label: string; hint: string }[] = [
  { value: 'wss', label: 'Use WSS', hint: 'Force the WSS tunnel for this task.' },
  { value: 'port', label: 'Use port', hint: 'Force direct HTTP (port) for this task.' },
  { value: 'auto', label: 'Auto', hint: 'WSS when connected, else port — with emergency fallback.' },
];

export interface Form {
  name: string;
  connection_mode: ConnectionMode;
  port: string;
  address: string;
  use_tls: boolean;
  health_enabled: boolean;
  health_interval: string;
  health_timeout: string;
  health_retries: string;
  skip_tls_verify: boolean;
  notes: string;
  install_dir: string;
  allowed_kinds: string;
  alloc_mem_mib: string;
  mem_overcommit_pct: string;
  alloc_disk_mib: string;
  disk_overcommit_pct: string;
  instances_dir: string;
  category: string;
  location_country: string;
  location_node: string;
  icon: string;
  color: string;
}

export const emptyForm: Form = {
  name: '',
  connection_mode: 'direct',
  port: '4040',
  address: '',
  use_tls: false,
  health_enabled: true,
  health_interval: '60',
  health_timeout: '4',
  health_retries: '3',
  skip_tls_verify: false,
  notes: '',
  install_dir: './localnode/',
  allowed_kinds: '',
  alloc_mem_mib: '0',
  mem_overcommit_pct: '0',
  alloc_disk_mib: '0',
  disk_overcommit_pct: '0',
  instances_dir: '/var/lib/kspanel/instances',
  category: '',
  location_country: '',
  location_node: '',
  icon: '',
  color: '',
};

export const CONNECTION_MODES: { value: ConnectionMode; label: string; hint: string }[] = [
  { value: 'direct', label: 'Direct (Bidirectional)', hint: 'Panel stores edge URL, edge stores panel URL. Both talk HTTP/HTTPS.' },
  { value: 'reverse_tunnel', label: 'Reverse Tunnel (WSS)', hint: 'Only edge stores panel URL. Edge dials panel via WSS tunnel.' },
  { value: 'both', label: 'Both (Port + WSS)', hint: 'Panel keeps BOTH a direct address AND a WSS tunnel; per-task channels pick port vs WSS.' },
  { value: 'local_port', label: 'Local Edge (Port)', hint: 'Edge runs on panel host via 127.0.0.1:<port> over HTTP.' },
  { value: 'local_wss', label: 'Local Edge (WSS)', hint: 'Edge runs on panel host via 127.0.0.1:<port> over WSS tunnel.' },
  { value: 'local_both', label: 'Local Edge (Both)', hint: 'Local edge keeping BOTH 127.0.0.1:<port> AND a WSS tunnel; per-task channels pick port vs WSS.' },
];

// isLocalMode reports whether the mode runs the edge on the panel host itself.
export const isLocalMode = (m: ConnectionMode): boolean => m === 'local_port' || m === 'local_wss' || m === 'local_both';
// isTunnelMode reports whether the mode keeps a WSS tunnel alive (pure or dual).
export const isTunnelMode = (m: ConnectionMode): boolean => m === 'reverse_tunnel' || m === 'local_wss' || m === 'both' || m === 'local_both';
// isDualMode reports whether the mode keeps BOTH transports alive with
// per-task routing (both / local_both).
export const isDualMode = (m: ConnectionMode): boolean => m === 'both' || m === 'local_both';
// usesDirect reports whether the mode keeps a dialable direct HTTP address.
export const usesDirect = (m: ConnectionMode): boolean => m === 'direct' || m === 'local_port' || m === 'both' || m === 'local_both';

export const KSEDGE_URL =
  'https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge';

export const ALL_KINDS: { key: string; label: string; color: string }[] = [
  { key: 'docker', label: 'Docker', color: '#60a5fa' },
  { key: 'kvm', label: 'KVM', color: '#34d399' },
  { key: 'multipass', label: 'Multipass', color: '#fbbf24' },
  { key: 'lxd', label: 'LXD', color: '#f472b6' },
];

export type NodeFormTabId = 'general' | 'health' | 'limits' | 'location';

export const NODEFORM_TABS: { id: NodeFormTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'health', label: 'Health' },
  { id: 'limits', label: 'Limits' },
  { id: 'location', label: 'Location' },
];