// NodeForm types - extracted from NodeForm.tsx

export interface Form {
  name: string;
  is_localhost: boolean;
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
  is_localhost: false,
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
  instances_dir: './instances',
  category: '',
  location_country: '',
  location_node: '',
  icon: '',
  color: '',
};

export const KSEDGE_URL =
  'https://github.com/kswarrior/ks-panel-extreme/releases/latest/download/ksedge';

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