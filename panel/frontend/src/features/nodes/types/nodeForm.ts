// NodeForm types - extracted from NodeForm.tsx

export type ConnectionMode = 'direct' | 'reverse_tunnel' | 'local_port' | 'local_wss';

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
  { value: 'local_port', label: 'Local Edge (Port)', hint: 'Edge runs on panel host via 127.0.0.1:<port> over HTTP.' },
  { value: 'local_wss', label: 'Local Edge (WSS)', hint: 'Edge runs on panel host via 127.0.0.1:<port> over WSS tunnel.' },
];

// isLocalMode reports whether the mode runs the edge on the panel host itself.
export const isLocalMode = (m: ConnectionMode): boolean => m === 'local_port' || m === 'local_wss';
// isTunnelMode reports whether panel→edge RPCs go over the WSS tunnel.
export const isTunnelMode = (m: ConnectionMode): boolean => m === 'reverse_tunnel' || m === 'local_wss';

export const KSEDGE_URL =
  'https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-panel-edge/ksedge';

// HuggingFace mirror retained as fallback for legacy installs.
export const KSEDGE_HF_URL =
  'https://huggingface.co/buckets/kswarrior/opencode-storage/resolve/ks-panel/release/ksedge?download=true';

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