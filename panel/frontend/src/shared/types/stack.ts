// Frontend types for the Stacks (full-stack isolated apps) system.
// One `stack` is one item like one `mod` is one item in Mods: own frontend
// (spa dist | simple pages) + optional backend sidecar + own nav + own data.
// Keep capability codes in sync with internal/models/stack.go.

export interface StackPermission {
  id: number;
  stack_id: number;
  capability: string;
  access_level: string;
  granted: boolean;
}

export interface Stack {
  id: number;
  name: string;
  slug: string;
  category: string;
  version: string;
  description: string;
  icon: string;
  color?: string;
  runtime: string;
  entrypoint?: string;
  manifest: Record<string, any> | null;
  spec: Record<string, any> | null;
  theme_mode: 'panel' | 'custom' | 'none';
  page_style: 'spa' | 'simple';
  active: boolean;
  // App proxy (migration 072): loopback port + mount segment of the
  // externally-run stack Go app (0/"" = proxy off). Mirrors models.Stack.
  proxy_port: number;
  proxy_root_url?: string;
  owner_name?: string;
  source?: StackSource;
  source_url?: string;
  package_size?: number;
  permissions: StackPermission[];
  pending: number;
  created_at: string;
  updated_at: string;
}

export type StackSource = 'file' | 'url' | 'json' | 'sample';

export interface StackSourceMeta {
  key: StackSource;
  label: string;
  dot: string;
  badge: string;
}

export const STACK_SOURCES: StackSourceMeta[] = [
  { key: 'file', label: 'Uploaded file', dot: 'bg-sky-400', badge: 'bg-sky-900/40 text-sky-200 border-sky-700/50' },
  { key: 'url', label: 'Installed from URL', dot: 'bg-violet-400', badge: 'bg-violet-900/40 text-violet-200 border-violet-700/50' },
  { key: 'json', label: 'Posted as JSON', dot: 'bg-amber-400', badge: 'bg-amber-900/40 text-amber-200 border-amber-700/50' },
  { key: 'sample', label: 'Built-in sample', dot: 'bg-teal-400', badge: 'bg-teal-900/40 text-teal-200 border-teal-700/50' },
];

export const stackSourceMeta = (key: string | undefined): StackSourceMeta | undefined =>
  STACK_SOURCES.find((s) => s.key === key);

// Stack capability codes — mirrors models.AllowedStackCapabilities().
export const StackCapability = {
  MetricsRead: 'metrics.read',
  InstancesRead: 'instances.read',
  KVReadWrite: 'kv.read_write',
  DBReadWrite: 'db.read_write',
  OutboundHTTP: 'outbound_http',
  Notify: 'notify',
} as const;

export interface StackCapabilityMeta {
  key: string;
  label: string;
  description: string;
  dot: string;
  badge: string;
}

export const STACK_CAPABILITIES: StackCapabilityMeta[] = [
  { key: StackCapability.MetricsRead, label: 'Metrics (read)', description: 'Read panel/instance metrics for dashboards.', dot: 'bg-emerald-400', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60' },
  { key: StackCapability.InstancesRead, label: 'Instances (read)', description: 'Read instance inventory/status.', dot: 'bg-sky-400', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60' },
  { key: StackCapability.KVReadWrite, label: 'Key-value storage', description: 'Read/write the stack namespaced KV store.', dot: 'bg-amber-400', badge: 'bg-amber-900/60 text-amber-200 border-amber-700/60' },
  { key: StackCapability.DBReadWrite, label: 'Database', description: 'Read/write the stack SQL tables (shared prefix).', dot: 'bg-red-400', badge: 'bg-red-900/60 text-red-200 border-red-700/60' },
  { key: StackCapability.OutboundHTTP, label: 'Outbound HTTP', description: 'Fetch external HTTP(S) APIs.', dot: 'bg-violet-400', badge: 'bg-violet-900/60 text-violet-200 border-violet-700/60' },
  { key: StackCapability.Notify, label: 'Notifications', description: 'Post panel notifications/toasts.', dot: 'bg-orange-400', badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60' },
];

export const stackCapabilityMeta = (key: string): StackCapabilityMeta | undefined =>
  STACK_CAPABILITIES.find((c) => c.key === key);

export interface StackPermissionRequest {
  capability: string;
  access_level: string;
}

export interface StackActivateConflict {
  error: string;
  message: string;
  pending: number;
  permissions: StackPermission[];
}

export interface StackNavEntry {
  slug: string;
  label: string;
  icon: string;
}

export interface StackEngineStatus {
  enabled: boolean;
  stacks: { slug: string; active: boolean }[];
}

export interface StackPageEntry {
  slug: string;
  title: string;
  icon?: string;
  file: string;
}

export interface StackPageContent {
  slug: string;
  title: string;
  type: 'html' | 'markdown' | 'blocks';
  content: string;
}

export type StackThemeMode = 'panel' | 'custom' | 'none';
export type StackPageStyle = 'spa' | 'simple';

export const STACK_THEME_MODES: Array<{ value: StackThemeMode; label: string; hint: string }> = [
  { value: 'panel', label: 'Panel theme', hint: 'Inherits the panel route theme via --ks-* tokens' },
  { value: 'custom', label: 'Custom theme.css', hint: 'Ships frontend/theme.css (or frontend/dist/theme.css)' },
  { value: 'none', label: 'Unthemed', hint: 'No theme tokens, raw bundle styles only' },
];

export const STACK_PAGE_STYLES: Array<{ value: StackPageStyle; label: string; hint: string }> = [
  { value: 'spa', label: 'SPA bundle', hint: 'Full frontend/dist bundle in a sandboxed iframe' },
  { value: 'simple', label: 'Simple pages', hint: 'Panel-rendered markdown/html/blocks from frontend/pages/' },
];

export const STACK_CATEGORIES = ['dashboard', 'tool', 'tracker', 'status', 'crud', 'custom'] as const;

export const STACK_RUNTIMES = ['static', 'nodejs', 'python'] as const;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ---- Workdir file manager ----------------------------------------------

export interface StackFileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  mode?: string;
  mod_time?: number;
}

export interface StackFileContent {
  path: string;
  content: string;
  size: number;
}

// ---- Workdir file manager ----------------------------------------------

export interface StackFileEntry {
