// Custom Page SDK — provides a runtime API for custom instance pages.
// Uses the unified action system (shell, read_file, write_file, list_files, docker, kvm, lxd)
// All operations go through executeAction() - no per-endpoint methods.

import { confirmDialog } from '@/shared/stores/confirmStore';

export interface InstanceContext {
  id: number;
  name: string;
  kind: string;
  status: string;
  template_id: number;
  template_name: string | null;
  node_id: number;
  node_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  config: Record<string, any>;
  external_id: string;
  created_at: string;
  updated_at: string;
  // Install-workflow tracking + denormalised card metadata. Populated by
  // InstanceDynamicPage so overview-style pages can surface live progress.
  install_state?: '' | 'running' | 'done' | 'failed' | '';
  install_kind?: '' | 'action';
  install_step?: number;
  install_error?: string;
  install_steps_json?: string;
  install_action_id?: string;
  display_name?: string;
  icon?: string;
  color?: string;
}

export type ActionType = 
  | 'shell' 
  | 'read_file' 
  | 'write_file' 
  | 'list_files' 
  | 'docker' 
  | 'kvm' 
  | 'lxd';

export interface PageAction {
  type: ActionType;
  command?: string;      // for shell, docker, kvm, lxd
  path?: string;         // for read_file, write_file, list_files
  content?: string;      // for write_file
  args?: string[];       // for shell, docker, kvm, lxd
  env?: Record<string, string>;
  timeout?: number;      // seconds
}

export interface ActionResult {
  ok: boolean;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  data?: any;
}

// PageActionDef is one action persisted with a page definition in the
// Studio (JSON-encoded on InstancePage.actions). Declared here (not
// imported from features/) so the SDK stays dependency-free.
export interface PageActionDef {
  name: string;
  type: ActionType;
  command?: string;
  path?: string;
  content?: string;
  args?: string[];
  /** Opt-in runtime arguments (validated server-side; shell commands
   *  substitute them into the stored command's {{args}} placeholder). */
  open_args?: boolean;
  env?: Record<string, string>;
  timeout?: number;
  description?: string;
}

export interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
  mod_time: number;
  mode?: string;
}

export interface CustomPageAPI {
  // Instance context
  instance: InstanceContext;
  
  // ==================== PERSISTED PAGE ACTIONS ====================
  // The action definitions authored with this page in the Studio. `name`
  // is unique per page.
  actions: PageActionDef[];
  // Run a persisted action by name, optionally overriding individual
  // fields (args/env/timeout…). Rejects when no action with that name
  // exists on this page.
  runAction: (name: string, overrides?: Partial<PageAction>) => Promise<ActionResult>;
  // Page-level config values (Studio Configure vars merged defaults + per-template overrides).
  // Available as {{config:NAME}} in content and as sdk.config.NAME at runtime.
  config: Record<string, string>;
  
  // ==================== UNIFIED ACTION EXECUTION ====================
  // Execute any action on the edge (inside the instance container)
  // All instance operations go through this single method
  executeAction: (action: PageAction) => Promise<ActionResult>;

  // ==================== PANEL API (instance-scoped) ====================
  // Fetch a panel API path bound to THIS instance (e.g.
  // "/processes", "/ports", "/metrics", "/audit", "/secrets", "/automation").
  // Paths are prefix-validated against /api/instances/<id>/ so a page can
  // never reach outside its own instance's API surface. Cookies ride along
  // because the request executes in the panel's own origin.
  fetchPanel: <T = any>(path: string, init?: RequestInit) => Promise<T>;
  
  // ==================== CONVENIENCE HELPERS ====================
  // These are thin wrappers around executeAction for common operations
  
  // Shell commands
  shell: (command: string, args?: string[], env?: Record<string, string>, timeout?: number) => Promise<ActionResult>;
  
  // File operations
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<ActionResult>;
  listFiles: (path: string) => Promise<FileEntry[]>;
  deleteFile: (path: string) => Promise<ActionResult>;
  createDirectory: (path: string) => Promise<ActionResult>;
  
  // Driver-specific commands
  docker: (command: string, args?: string[]) => Promise<ActionResult>;
  kvm: (command: string, args?: string[]) => Promise<ActionResult>;
  lxd: (command: string, args?: string[]) => Promise<ActionResult>;
  
  // ==================== REAL-TIME / SUBSCRIPTIONS ====================
  // Polling-based subscriptions (since edge doesn't push)
  subscribe: (action: PageAction, callback: (result: ActionResult) => void, intervalMs?: number) => () => void;
  
  // ==================== NAVIGATION ====================
  // Navigate the panel SPA to another route WITHIN this same instance
  // (e.g. "/instances/12/files/edit?path=/etc/app.conf"). Anything outside
  // /instances/<this-id>/** is rejected by pageNavigateTarget.
  navigate: (to: string) => void;
  
  // ==================== UTILITIES ====================
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  modal: (options: { title: string; content: string; buttons?: Array<{ label: string; action: () => void; variant?: 'primary' | 'secondary' | 'danger' }> }) => void;
  
  // ==================== EVENT SYSTEM ====================
  on: (event: string, callback: (data: any) => void) => () => void;
  emit: (event: string, data: any) => void;
  once: (event: string, callback: (data: any) => void) => () => void;
  
  // ==================== PERSISTENT STORAGE ====================
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
    keys: () => Promise<string[]>;
  };
  
  // ==================== WEBSOCKET ====================
  // Raw WebSocket for terminal/streaming
  connectWS: (protocols?: string[]) => WebSocket;
}

// Global SDK instance (set by CustomPageView)
declare global {
  interface Window {
    KSPageSDK: CustomPageAPI | null;
  }
}

window.KSPageSDK = null;

// pageNavigateTarget validates a custom-page navigation request and returns
// the absolute SPA path to navigate to, or null when the target is outside
// this instance's own route tree. Fail closed: scheme/protocol-relative URLs,
// oversized values and any path not under /instances/<id> are rejected, so a
// page can never steer the operator into another instance or an admin surface.
export function pageNavigateTarget(instanceId: number, to: unknown): string | null {
  if (typeof to !== 'string') return null;
  const t = to.trim();
  if (!t || t.length > 2048) return null;
  // Absolute (http:, javascript:, …) and protocol-relative URLs: rejected.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) return null;
  // Dot segments could escape the instance prefix after client-side
  // normalisation (/instances/5/../users) — reject outright.
  const qIdx = t.indexOf('?');
  const pathOnly = qIdx >= 0 ? t.slice(0, qIdx) : t;
  if (pathOnly.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  const base = `/instances/${instanceId}`;
  if (t === base || t.startsWith(base + '/') || t.startsWith(base + '?')) return t;
  return null;
}

// ============================================================================
// SDK IMPLEMENTATION
// ============================================================================

// sanitizeHttpError converts a failed response body into a message fit for
// the page's error banner. Proxy/CDN layers (Cloudflare tunnels especially)
// answer origin outages with full HTML error pages; pasting those into the
// banner rendered kilobytes of markup ("<!DOCTYPE html>…502 Bad gateway…")
// instead of one readable line. HTML bodies and oversized text collapse to
// "HTTP <status>", everything else is truncated to 300 chars.
export function sanitizeHttpError(text: string, status: number): string {
  const body = (text || '').trim();
  if (!body) return `HTTP ${status}`;
  if (body.startsWith('<')) return `Panel unreachable (HTTP ${status})`;
  if (body.length > 300) return body.slice(0, 300) + '…';
  return body;
}

function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

export function createCustomPageSDK(
  instanceContext: InstanceContext,
  savedActions: PageActionDef[] = [],
  pageSlug: string = '',
  pageConfig: Record<string, string> = {},
): CustomPageAPI {
  const apiBase = `/api/instances/${instanceContext.id}`;
  const eventListeners: Map<string, Set<(data: any) => void>> = new Map();
  
  // --- Fetch helper ---
  // Content-Type is only defaulted for JSON bodies: multipart uploads
  // (FormData) must let the browser set the boundary parameter, and raw
  // endpoints (e.g. /files/read) answer text — parsed below by content AND
  // shape so a mislabelled raw-file response never throws.
  // Every SDK fetch is bounded by a 30s AbortController timeout (unless the
  // caller passes its own signal) so a hung edge never leaves the page on a
  // perpetual skeleton. AbortErrors surface as "request timed out" instead
  // of a raw DOMException.
  const SDK_FETCH_TIMEOUT_MS = 30000;
  function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    if (options?.signal) {
      return fetch(url, { ...options, credentials: 'include' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SDK_FETCH_TIMEOUT_MS);
    return fetch(url, { ...options, signal: ctrl.signal, credentials: 'include' }).finally(() => {
      clearTimeout(timer);
    });
  }
  function timeoutErr(e: unknown): Error {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return new Error('request timed out after 30s');
    }
    return e as Error;
  }
  async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
    const body = options?.body;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const defaultHeaders: Record<string, string> = {};
    if (body != null && !isFormData) defaultHeaders['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options?.headers || {}),
        },
      });
    } catch (e) {
      throw timeoutErr(e);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(sanitizeHttpError(text, res.status));
    }
    // Parse by CONTENT, not just label: some proxies/endpoints mislabel raw
    // file bytes (eula.txt, server.properties…) as application/json, and a
    // blind res.json() there blew up with SyntaxError "Unexpected token 'e',
    // \"eula=true …\" is not valid JSON" inside page editors. Read the body
    // once; when labelled JSON and it actually parses, return the object,
    // otherwise fall back to the raw text.
    const ctype = res.headers.get('content-type') || '';
    const text = await res.text();
    if (ctype.includes('json')) {
      try {
        return JSON.parse(text) as T;
      } catch { /* mislabelled body — hand back the raw text below */ }
    }
    return text as unknown as T;
  }
  
  async function fetchText(url: string, options?: RequestInit): Promise<string> {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { ...options });
    } catch (e) {
      throw timeoutErr(e);
    }
    if (!res.ok) throw new Error(sanitizeHttpError(await res.text(), res.status));
    return res.text();
  }
  
  // --- Core action executor ---
  // page_slug stamps the call with the page family rendering right now; the
  // server verifies that slug is enabled on THIS instance AND that the
  // payload exactly matches one of the page's SAVED actions before running
  // anything. A page without a slug (Studio static preview) fails closed
  // server-side.
  async function executeAction(action: PageAction): Promise<ActionResult> {
    return fetchJSON<ActionResult>(`/api/instance-pages/execute-action`, {
      method: 'POST',
      body: JSON.stringify({
        instance_id: instanceContext.id,
        page_slug: pageSlug,
        ...action,
      }),
    });
  }

  // --- Persisted action runner ---
  async function runAction(name: string, overrides?: Partial<PageAction>): Promise<ActionResult> {
    const def = savedActions.find((a) => a.name === name);
    if (!def) {
      return { ok: false, error: `No saved action named "${name}" on this page` };
    }
    return executeAction({
      type: def.type,
      command: def.command,
      path: def.path,
      content: def.content,
      args: def.args ? [...def.args] : undefined,
      env: def.env ? { ...def.env } : undefined,
      timeout: def.timeout,
      ...overrides,
    });
  }

  // --- Instance-scoped panel API ---
  async function fetchPanel<T = any>(path: string, init?: RequestInit): Promise<T> {
    // Fail closed: only paths under THIS instance's API surface are allowed.
    // A page can never use the SDK to reach another instance's data or any
    // admin surface (users, nodes, settings, …).
    const prefix = `/api/instances/${instanceContext.id}`;
    if (typeof path !== 'string' || path.length > 2048 || !path.startsWith('/')) {
      throw new Error('fetchPanel: invalid path');
    }
    // Relative paths ("/processes", "/metrics?…") are auto-bound to this
    // instance's API base so pages don't have to hardcode the instance id.
    let full = path;
    if (!path.startsWith(prefix)) {
      if (path.startsWith('//')) throw new Error('fetchPanel: invalid path');
      full = prefix + path;
    }
    if (full.length > prefix.length && full[prefix.length] !== '/' && full[prefix.length] !== '?') {
      throw new Error(`fetchPanel: only ${prefix}/… paths are allowed`);
    }
    return fetchJSON<T>(full, init);
  }
  
  // --- Event system ---
  function on(event: string, callback: (data: any) => void) {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    eventListeners.get(event)!.add(callback);
    return () => eventListeners.get(event)?.delete(callback);
  }
  
  function emit(event: string, data: any) {
    eventListeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error('Event callback error:', e); }
    });
  }
  
  function once(event: string, callback: (data: any) => void) {
    const unsub = on(event, (data) => { unsub(); callback(data); });
    return unsub;
  }
  
  // --- Storage (localStorage per instance/page) ---
  const storagePrefix = `ks_page_${instanceContext.id}_`;
  const storage = {
    get: (key: string) => Promise.resolve(localStorage.getItem(storagePrefix + key)),
    set: (key: string, value: string) => Promise.resolve(localStorage.setItem(storagePrefix + key, value)),
    delete: (key: string) => Promise.resolve(localStorage.removeItem(storagePrefix + key)),
    clear: () => Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(storagePrefix)).forEach(k => localStorage.removeItem(k))),
    keys: () => Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(storagePrefix)).map(k => k.slice(storagePrefix.length))),
  };
  
  // --- WebSocket ---
  // Markdown/blocks pages run in the panel's own origin, so they can open
  // the authenticated terminal socket directly. HTML pages (sandboxed
  // iframes) use the bridged connectWS installed by CustomPageView instead.
  function connectWS(protocols?: string[]) {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/instances/${instanceContext.id}/terminal`;
    return new WebSocket(wsUrl, protocols);
  }
  
  // --- Toast/Modal ---
  function toast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message, type } }));
  }
  
  function modal(options: { title: string; content: string; buttons?: Array<{ label: string; action: () => void; variant?: 'primary' | 'secondary' | 'danger' }> }) {
    window.dispatchEvent(new CustomEvent('ks-modal', { detail: options }));
  }
  
  // --- Subscription helper ---
  function subscribe(action: PageAction, callback: (result: ActionResult) => void, intervalMs = 5000) {
    let cancelled = false;
    async function poll() {
      if (cancelled) return;
      try {
        const result = await executeAction(action);
        if (!cancelled) callback(result);
      } catch (e) {
        if (!cancelled) callback({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      if (!cancelled) setTimeout(poll, intervalMs);
    }
    poll();
    return () => { cancelled = true; };
  }
  
  // --- SDK API ---
  const sdk: CustomPageAPI = {
    instance: instanceContext,
    
    // Persisted page actions
    actions: savedActions,
    runAction,
    config: pageConfig,
    
    // Core action
    executeAction,
    
    // Instance-scoped panel API
    fetchPanel,
    
    // Convenience helpers (all delegate to executeAction)
    shell: (command, args, env, timeout) => executeAction({ type: 'shell', command, args, env, timeout }),
    
    readFile: (path) => executeAction({ type: 'read_file', path }).then(r => r.ok ? r.data ?? r.stdout ?? '' : Promise.reject(new Error(r.error ?? r.stderr ?? 'Read failed'))),
    
    writeFile: (path, content) => executeAction({ type: 'write_file', path, content }),
    
    listFiles: (path) => executeAction({ type: 'list_files', path }).then(r => r.ok ? r.data ?? [] : Promise.reject(new Error(r.error ?? r.stderr ?? 'List failed'))),
    
    deleteFile: (path) => executeAction({ type: 'shell', command: `rm -rf -- ${shellQuote(path)}` }),
    
    createDirectory: (path) => executeAction({ type: 'shell', command: `mkdir -p -- ${shellQuote(path)}` }),
    
    docker: (command, args) => executeAction({ type: 'docker', command, args }),
    
    kvm: (command, args) => executeAction({ type: 'kvm', command, args }),
    
    lxd: (command, args) => executeAction({ type: 'lxd', command, args }),
    
    subscribe,
    
    // Utilities
    // Navigation (host-origin pages): announce through a window event —
    // the router-owning shell listens and performs the SPA navigation after
    // re-validating the target. Iframe pages go through the bridge instead.
    navigate: (to: string) => {
      window.dispatchEvent(new CustomEvent('ks-navigate', { detail: { to } }));
    },
    toast,
    confirm: (msg) => confirmDialog({ title: 'Please confirm', message: msg }),
    prompt: (msg, def = '') => Promise.resolve(window.prompt(msg, def)),
    modal,
    
    // Events
    on,
    emit,
    once,
    
    // Storage
    storage,
    
    // WebSocket
    connectWS,
  };
  
  return sdk;
}

// Helper to inject SDK into a page's iframe or directly into window
export function injectSDK(instanceContext: InstanceContext, savedActions: PageActionDef[] = [], pageSlug: string = '', pageConfig: Record<string, string> = {}): CustomPageAPI {
  const sdk = createCustomPageSDK(instanceContext, savedActions, pageSlug, pageConfig);
  window.KSPageSDK = sdk;
  return sdk;
}

// Type export for TypeScript support in custom page code
export type { CustomPageAPI as KSPageSDK };