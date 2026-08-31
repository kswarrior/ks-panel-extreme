// Frontend types for the Applications (bot / service templates) system.
// Mirrors the Go models in internal/models/models.go.

// One field definition in an application's config_schema. The admin defines
// these; the user fills them in when installing the application.
export interface ApplicationConfigField {
  key: string;                  // internal key, e.g. "bot_token"
  label: string;                // human label shown in the form
  type: 'text' | 'secret' | 'number' | 'select' | 'textarea';
  required?: boolean;
  default?: string | number;
  placeholder?: string;
  // for select type
  options?: { value: string; label: string }[];
  // description shown as helper text
  description?: string;
}

// One capability an application declares it needs (mirrors ModPermission).
export interface ApplicationPermission {
  id: number;
  application_id: number;
  capability: string;
  access_level: string;
  granted: boolean;
}

// One staged script file inside an application (Studio-authored or shipped
// with the manifest). Paths are relative; content is plain text.
export interface ApplicationFile {
  path: string;
  content: string;
}

// A catalog application (admin-owned). Users install this as their own
// running instance via application_installations.
export interface Application {
  id: number;
  name: string;
  slug: string;
  category: string;
  version: string;
  description: string;
  icon: string;
  runtime: string;
  entrypoint: string;
  config_schema: ApplicationConfigField[];
  files?: ApplicationFile[] | null;
  env?: Record<string, string> | null;
  permissions: ApplicationPermissionReq[]; // preview of requested caps
  active: boolean;
  uploaded_by?: number;
  owner_name?: string;
  source: ApplicationSource;
  source_url?: string;
  permission_rows: ApplicationPermission[]; // canonical grant rows
  pending: number;                           // count of un-granted caps
  created_at: string;
  updated_at: string;
}

export type ApplicationSource = 'file' | 'url' | 'studio' | 'json';

// Shape the admin sends when creating/updating an application by hand.
export interface ApplicationPermissionReq {
  capability: string;
  access_level: string;
}

export interface ApplicationUpsertPayload {
  name: string;
  slug: string;
  category: string;
  version: string;
  description: string;
  icon: string;
  runtime: string;
  entrypoint: string;
  config_schema: ApplicationConfigField[];
  files?: ApplicationFile[];
  permissionsRequested: ApplicationPermissionReq[];
}

// ---- Runs -----------------------------------------------------------------

// Where a run executes. "node" = a registered edge; "panel" = the panel
// host itself (via its local node when one exists, otherwise direct shell).
export type ApplicationRunTarget = 'node' | 'panel';

// Where inside the target the script lands. "host" = target filesystem;
// the driver kinds exec inside an existing workload on that target.
export type ApplicationRunExecMode = 'host' | 'docker' | 'lxd' | 'kvm' | 'multipass';

// Body of POST /api/applications/{id}/run.
export interface ApplicationRunRequest {
  target: ApplicationRunTarget;
  node_id?: number;
  exec_mode: ApplicationRunExecMode;
  workload?: string;
  timeout_sec?: number;
  env?: Record<string, string>;
}

// One recorded execution (mirrors models.ApplicationRun).
export interface ApplicationRun {
  id: number;
  application_id: number;
  triggered_by?: number;
  target: ApplicationRunTarget;
  node_id: number;
  node_name?: string;
  exec_mode: ApplicationRunExecMode;
  workload?: string;
  status: 'running' | 'succeeded' | 'failed' | 'error';
  exit_code: number;
  output: string;
  error_output: string;
  error: string;
  timeout_sec: number;
  created_at: string;
  ended_at?: string;
}

// User-facing installation (one bot instance a user deployed).
export interface ApplicationInstallation {
  id: number;
  application_id: number;
  owner_id: number;
  name: string;
  config_values: Record<string, string>; // secrets encrypted at rest
  status: 'running' | 'stopped' | 'error';
  last_error: string;
  node_id: number;
  created_at: string;
  updated_at: string;
}

// The well-known capability codes an application is allowed to request.
// Keep in sync with the backend when it adds a capability whitelist.
export const ApplicationCapability = {
  Network: 'network',
  FileStorage: 'filesystem',
  OutboundHttp: 'outbound_http',
  ProcessControl: 'process_control',
} as const;

export type ApplicationCapabilityKey = (typeof ApplicationCapability)[keyof typeof ApplicationCapability];

// Human-readable catalogue for permission chips + approval checklist.
export interface ApplicationCapabilityMeta {
  key: string;
  label: string;
  description: string;
  dot: string;
  badge: string;
  accessLevels: { value: string; label: string; tone: 'neutral' | 'amber' | 'red' }[];
  color: string;
}

export const APPLICATION_CAPABILITIES: ApplicationCapabilityMeta[] = [
  {
    key: ApplicationCapability.Network,
    label: 'Network access',
    description: 'Open listening ports / accept inbound connections on the edge.',
    dot: 'bg-sky-400',
    badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60',
    accessLevels: [
      { value: 'listen', label: 'Listen (inbound)', tone: 'red' },
      { value: 'connect', label: 'Connect (outbound only)', tone: 'amber' },
    ],
    color: '#0ea5e9',
  },
  {
    key: ApplicationCapability.FileStorage,
    label: 'File storage',
    description: 'Read / write files on the edge node (persistent volume for the bot).',
    dot: 'bg-fuchsia-400',
    badge: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60',
    accessLevels: [
      { value: 'read_only', label: 'Read-only', tone: 'amber' },
      { value: 'read_write', label: 'Read & write', tone: 'red' },
    ],
    color: '#d946ef',
  },
  {
    key: ApplicationCapability.OutboundHttp,
    label: 'Outbound HTTP',
    description: 'Make HTTP(S) requests to external APIs (Discord gateway, WhatsApp webhook, …).',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60',
    accessLevels: [
      { value: 'standard', label: 'Standard (HTTPS only)', tone: 'amber' },
      { value: 'unrestricted', label: 'Unrestricted (any host/port)', tone: 'red' },
    ],
    color: '#10b981',
  },
  {
    key: ApplicationCapability.ProcessControl,
    label: 'Process control',
    description: 'Spawn / manage child processes on the edge (e.g. ffmpeg, node subprocesses).',
    dot: 'bg-orange-400',
    badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60',
    accessLevels: [
      { value: 'spawn', label: 'Spawn subprocesses', tone: 'amber' },
      { value: 'full', label: 'Full control (kill, signal, ptrace)', tone: 'red' },
    ],
    color: '#f97316',
  },
];

export const appCapabilityMeta = (key: string): ApplicationCapabilityMeta | undefined =>
  APPLICATION_CAPABILITIES.find((c) => c.key === key);

// Category metadata for the catalog card chips.
export interface ApplicationCategoryMeta {
  key: string;
  label: string;
  dot: string;
  badge: string;
  defaultIcon: string; // emoji
  color: string;
}

export const APPLICATION_CATEGORIES: ApplicationCategoryMeta[] = [
  { key: 'discord',    label: 'Discord',    dot: 'bg-indigo-400',   badge: 'bg-indigo-900/40 text-indigo-200 border-indigo-700/50', defaultIcon: '🤖', color: '#6366f1' },
  { key: 'whatsapp',   label: 'WhatsApp',   dot: 'bg-green-400',    badge: 'bg-green-900/40 text-green-200 border-green-700/50',   defaultIcon: '💬', color: '#22c55e' },
  { key: 'telegram',   label: 'Telegram',   dot: 'bg-blue-400',     badge: 'bg-blue-900/40 text-blue-200 border-blue-700/50',     defaultIcon: '📨', color: '#3b82f6' },
  { key: 'slack',      label: 'Slack',      dot: 'bg-amber-400',    badge: 'bg-amber-900/40 text-amber-200 border-amber-700/50',  defaultIcon: '💭', color: '#f59e0b' },
  { key: 'custom',     label: 'Custom',     dot: 'bg-gray-400',     badge: 'bg-gray-700/40 text-gray-200 border-gray-600/50',    defaultIcon: '⚙️', color: '#6b7280' },
];

export const appCategoryMeta = (key: string): ApplicationCategoryMeta | undefined =>
  APPLICATION_CATEGORIES.find((c) => c.key === key);

// Runtime metadata for the catalog card.
export interface ApplicationRuntimeMeta {
  key: string;
  label: string;
  dot: string;
  badge: string;
  color: string;
}

export const APPLICATION_RUNTIMES: ApplicationRuntimeMeta[] = [
  { key: 'nodejs',  label: 'Node.js',  dot: 'bg-green-400',  badge: 'bg-green-900/40 text-green-200 border-green-700/50', color: '#22c55e' },
  { key: 'python',  label: 'Python',   dot: 'bg-blue-400',   badge: 'bg-blue-900/40 text-blue-200 border-blue-700/50', color: '#3b82f6' },
  { key: 'bash',    label: 'Bash',     dot: 'bg-gray-400',   badge: 'bg-gray-700/40 text-gray-200 border-gray-600/50', color: '#6b7280' },
  { key: 'custom',  label: 'Custom',   dot: 'bg-purple-400', badge: 'bg-purple-900/40 text-purple-200 border-purple-700/50', color: '#a855f7' },
];

export const appRuntimeMeta = (key: string): ApplicationRuntimeMeta | undefined =>
  APPLICATION_RUNTIMES.find((r) => r.key === key);

// Shape of the 409 activate response when there are still pending grants.
export interface ApplicationActivateConflict {
  error: string;
  message: string;
  pending: number;
  permissions: ApplicationPermission[];
}