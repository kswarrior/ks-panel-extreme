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
  owner_name?: string;
  source?: StackSource;
  source_url?: string;
  package_size?: number;
  permissions: StackPermission[];
  pending: number;
  created_at: string;
  updated_at: string;
}

export type StackSource = 'file' | 'url' | 'studio' | 'json' | 'sample';

export interface StackSourceMeta {
  key: StackSource;
  label: string;
  dot: string;
  badge: string;
}

export const STACK_SOURCES: StackSourceMeta[] = [
  { key: 'file', label: 'Uploaded file', dot: 'bg-sky-400', badge: 'bg-sky-900/40 text-sky-200 border-sky-700/50' },
  { key: 'url', label: 'Installed from URL', dot: 'bg-violet-400', badge: 'bg-violet-900/40 text-violet-200 border-violet-700/50' },
  { key: 'studio', label: 'Built in Studio', dot: 'bg-emerald-400', badge: 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' },
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

export interface StackFileList {
  path: string;
  entries: StackFileEntry[];
}

export interface StackFileContent {
  path: string;
  content: string;
  size: number;
}

// ---- Stack Studio --------------------------------------------------------
// Visual + code manifest builder (mirrors ModStudio's draft contract): the
// admin edits structured tabs or raw JSON, previews the emitted manifest
// live, and installs through POST /api/stacks/ (X-KS-Source: studio) so the
// backend validates capabilities + seeds pending grants like any upload.

export interface StackStudioDraft {
  name: string;
  slug: string;
  version: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  runtime: string;
  entrypoint: string;
  themeMode: StackThemeMode;
  pageStyle: StackPageStyle;
  permissionsRequested: StackPermissionRequest[];
  backendScript: string;
  frontendHtml: string;
  frontendCss: string;
  simplePage: string;
  spec: Record<string, any>;
}

export const blankStackStudioDraft = (): StackStudioDraft => ({
  name: '',
  slug: '',
  version: '1.0.0',
  description: '',
  icon: '',
  color: '',
  category: 'dashboard',
  runtime: 'static',
  entrypoint: '',
  themeMode: 'panel',
  pageStyle: 'spa',
  permissionsRequested: [],
  backendScript: '',
  frontendHtml: '',
  frontendCss: '',
  simplePage: '# Hello\n\nStarter simple page. Edit it on the Pages tab.',
  spec: {},
});

// emitStackStudioManifest turns a draft into the exact JSON the backend's
// POST /api/stacks/ (ParseStackManifest) expects. Flat keys stay canonical;
// the nested frontend/backend blocks ride along for readability.
export function emitStackStudioManifest(draft: StackStudioDraft): Record<string, any> {
  const out: Record<string, any> = {
    name: draft.name,
    slug: draft.slug,
    version: draft.version || '1.0.0',
    description: draft.description,
    icon: draft.icon,
    color: draft.color,
    category: draft.category || 'dashboard',
    runtime: draft.runtime || 'static',
    entrypoint: draft.entrypoint,
    themeMode: draft.themeMode,
    pageStyle: draft.pageStyle,
    permissionsRequested: draft.permissionsRequested,
    frontend: {
      page_style: draft.pageStyle,
      theme: { mode: draft.themeMode },
    },
    backend: {
      runtime: draft.runtime || 'static',
      entrypoint: draft.entrypoint,
    },
  };
  if (draft.backendScript.trim()) out.backendScriptSource = draft.backendScript;
  if (draft.frontendHtml.trim()) out.frontendHtml = draft.frontendHtml;
  if (draft.frontendCss.trim()) out.frontendCss = draft.frontendCss;
  if (draft.pageStyle === 'simple' && draft.simplePage.trim()) out.simplePage = draft.simplePage;
  if (Object.keys(draft.spec).length) out.spec = draft.spec;
  return out;
}
