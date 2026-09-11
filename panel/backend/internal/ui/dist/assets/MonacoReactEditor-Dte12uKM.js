import{r as f,j as S}from"./react-0h_Dc6Wy.js";import{U as A,e as b,W as E,a as R,l as m}from"./monaco-BGNI_53U.js";const C=`// Custom Page SDK — provides a runtime API for custom instance pages.
// Uses the unified action system (shell, read_file, write_file, list_files, docker, kvm, lxd)
// All operations go through executeAction() - no per-endpoint methods.

import { useCallback, useEffect, useRef, useState } from 'react';
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

export type ChartSeriesPoint = { label: string; value: number };
export type ChartSeries = number[] | ChartSeriesPoint[];
export interface ChartOptions {
  kind?: 'bars' | 'line';
  color?: string;
}

export interface CustomPageAPI {
  // Instance context
  instance: InstanceContext;
  
  // ==================== PERSISTED PAGE ACTIONS ====================
  // The action definitions authored with this page in the Studio. \`name\`
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

  // ==================== PAGE IDENTITY ====================
  // URL slug of the page family rendering right now (e.g. "files" on
  // /instances/12/files, "files/edit" on the editor sub-page). Pages that
  // build sibling URLs (explorer <-> editor) must derive them from here
  // instead of hardcoding slugs — the slug is customizable per instance.
  pageSlug: string;

  // ==================== IN-PAGE ROUTER (tabs without reload) =============
  /**
   * React hook keeping the active tab in sync with \`location.hash\`
   * (\`#tab=<name>\`), validated against \`tabs\` (unknown hash → \`fallback\`,
   * never throws). Plain hooks only — no router import, so it works inside
   * \`ReactModuleView\`-rendered pages where only \`(sdk, React)\` are in scope.
   *
   * Rules: tab ids match \`[a-z0-9_-]\` (≤64 chars); the setter updates the
   * hash without a page reload and ignores ids outside \`tabs\` (no-op, no
   * throw). Read-only on first render: no hash → \`fallback\` without
   * rewriting the URL; the URL only changes when the user switches.
   * @example
   * \`\`\`tsx
   * type TabId = 'overview' | 'system';
   *
   * function Page() {
   *   const [tab, setTab] = sdk.useHashRoute<TabId>(['overview', 'system'], 'overview');
   *   return (
   *     <div className="ks-page">
   *       <div className="ks-row">
   *         {(['overview', 'system'] as TabId[]).map((t) => (
   *           <button key={t} className={'ks-tab' + (tab === t ? ' ks-tab-active' : '')} onClick={() => setTab(t)}>
   *             {t}
   *           </button>
   *         ))}
   *       </div>
   *       {tab === 'overview' ? <div className="ks-card">Overview</div> : <div className="ks-card">System</div>}
   *     </div>
   *   );
   * }
   * return Page;
   * \`\`\`
   *
   * Deep-link from another page (same instance) straight at one tab:
   * \`\`\`js
   * sdk.navigate(\`/instances/\${sdk.instance.id}/\${sdk.pageSlug}#tab=system\`);
   * \`\`\`
   */
  useHashRoute: <T extends string>(tabs: readonly T[], fallback: T) => [T, (t: T) => void];
  
  // ==================== UTILITIES ====================
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  modal: (options: { title: string; content: string; buttons?: Array<{ label: string; action: () => void; variant?: 'primary' | 'secondary' | 'danger' }> }) => void;

  // ==================== NEAR-REAL HELPERS (pure, additive) ============
  // Small real-app affordances pages otherwise hand-roll (and get wrong):
  // file download, clipboard, byte/time formatting, debounce. Pure
  // functions — no instance scope, no permissions, no network.
  downloadText: (filename: string, text: string, mime?: string) => void;
  copyText: (text: string) => Promise<void>;
  formatBytes: (n: number) => string;
  timeAgo: (ts: number | string) => string;
  debounce: <T extends (...args: any[]) => void>(fn: T, ms?: number) => (...args: Parameters<T>) => void;

  // ==================== ALLOWLISTED LIBS (pure, additive) ===============
  // Dependency-free chart + markdown so pages stop hand-rolling canvas
  // charts/parsers. No \`import\` needed, no permissions, no network.
  /**
   * Draw a theme-aware canvas bars/line chart inside \`el\` (a canvas child
   * is appended; labels paint via fillText only, never innerHTML).
   * Resolves \`--ks-*\` tokens via getComputedStyle with the same fallbacks
   * the shipped pages use. Returns a cleanup fn (removes the resize
   * listener + canvas).
   * @example
   * const el = document.getElementById('load-chart');
   * if (el) {
   *   const cleanup = sdk.chart(el, [0.4, 0.7, 0.5], { kind: 'bars' });
   *   // call cleanup() on unmount to remove listeners + canvas
   * }
   */
  chart: (el: HTMLElement, series: ChartSeries, opts?: ChartOptions) => () => void;
  /**
   * Render the safe markdown subset (headings, bold/italic/code/links,
   * lists, \`---\`) to an HTML string. Same escaping + safeUrl rules as
   * \`renderMarkdown\` in CustomPageView.tsx (see renderSdkMarkdown mirror
   * note there); hostile markup (\`<script>\`, \`javascript:\` URLs) is inert.
   * @example
   * const html = sdk.markdown('# Title\\n\\nHello **world**');
   * const box = document.getElementById('notes');
   * if (box) {
   *   box.innerHTML = html; // safe: escaped + allow-listed URLs only
   * }
   */
  markdown: (md: string) => string;
  
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
  // Panel terminal bridges for THIS instance (same JSON wire protocol on
  // all three): 'terminal' (side shell, default), 'workflow' (live
  // transcript of the running action/install bound to \`terminal\`), or
  // 'startup' (instance main-process stdio). \`opts.terminal\` is the pane
  // identity (same [a-z0-9_-] normalisation the panel uses everywhere);
  // \`opts.timeout\` is the attach budget in seconds (empty = no limit).
  connectWS: (protocols?: string[], endpoint?: PageWSEndpoint, opts?: PageWSOptions) => WebSocket;

  // ==================== BUILT-IN PARITY (thin fetchPanel wrappers) =====
  // Every method below calls an /api/instances/<own-id>/… endpoint, so the
  // same instance scoping + permission gates apply as fetchPanel. They exist
  // so custom pages can clone the built-in control pages (Files, Ports,
  // Terminal, Automation, Env, SFTP, Overview) without hand-rolling URLs.

  // ---- Files (full explorer parity) ----
  statPath: (path: string) => Promise<{ name: string; size: number; mode: string; is_dir: boolean; mod_time: number }>;
  renamePath: (from: string, to: string) => Promise<void>;
  copyPath: (from: string, to: string) => Promise<void>;
  chmodPath: (path: string, mode: string) => Promise<void>;
  archivePaths: (dir: string, names: string[], destArchive: string) => Promise<{ ok: boolean; path: string; count: number }>;
  extractArchive: (archivePath: string, destDir?: string) => Promise<void>;
  searchFiles: (dir: string, query: string, limit?: number) => Promise<{ entries: Array<{ path: string; name: string; is_dir: boolean; size: number; mod_time: number }>; truncated: boolean }>;
  uploadFromUrl: (dir: string, url: string) => Promise<void>;
  // Binary-safe transfer (fetchPanel speaks text/JSON only): bytes ride as
  // base64. uploadFile posts octet-stream; downloadFile resolves
  // { name, base64, contentType } for the caller to decode or anchor-download.
  uploadFile: (path: string, base64: string, contentType?: string) => Promise<void>;
  downloadFile: (path: string) => Promise<{ name: string; base64: string; contentType: string }>;

  // ---- Ports ----
  listPorts: () => Promise<Array<{ id: number; host_port: number; container_port: number; protocol: string; ip: string }>>;
  savePorts: (ports: Array<{ host: number; container: number; protocol: string; ip?: string }>) => Promise<void>;

  // ---- Automation ----
  listAutomation: () => Promise<any[]>;
  listAutomationRuns: (limit?: number) => Promise<any[]>;
  runAutomationJob: (jobId: number) => Promise<any>;
  deleteAutomationJob: (jobId: number) => Promise<void>;
  createAutomationJob: (payload: Record<string, unknown>) => Promise<{ id: number }>;
  updateAutomationJob: (jobId: number, payload: Record<string, unknown>) => Promise<void>;
  downloadAutomation: (jobId: number) => Promise<{ base64: string }>;
  importAutomationURL: (url: string) => Promise<{ id: number }>;

  // ---- Secrets / Env ----
  listSecrets: () => Promise<Array<{ key: string }>>;
  setSecret: (key: string, value: string) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;
  revealSecret: (key: string) => Promise<{ key: string; value: string }>;
  // Env editor parity: replaces the instance env (recreates the workload,
  // same as the built-in Env page — confirm first).
  saveEnv: (env: Record<string, string>) => Promise<{ id: number; status: string; recreated: boolean }>;

  // ---- Power / identity (Overview parity) ----
  power: (action: 'start' | 'stop' | 'restart' | 'kill') => Promise<void>;
  reinstall: () => Promise<{ id: number; status: string }>;
  updateIdentity: (payload: { display_name: string; icon?: string; color?: string }) => Promise<void>;

  // ---- Monitoring (Overview parity) ----
  getMetrics: () => Promise<any>;
  listProcesses: () => Promise<any[]>;
  killProcess: (pid: number, signal?: string) => Promise<any>;
  listAudit: (limit?: number) => Promise<any[]>;

  // ---- SFTP ----
  getSftp: () => Promise<any>;
  enableSftp: () => Promise<any>;
  rotateSftp: () => Promise<any>;
  disableSftp: () => Promise<any>;
  revealSftp: () => Promise<any>;

  // ---- Workflow stdin (Terminal parity for bound panes) ----
  sendActionStdin: (actionId: string, line: string) => Promise<any>;
  sendInstallStdin: (line: string) => Promise<any>;
}

// Which panel bridge connectWS dials. Mirrors the Terminal component's
// endpoint prop ('terminal' | 'startup' | 'workflow').
export type PageWSEndpoint = 'terminal' | 'workflow' | 'startup';

export interface PageWSOptions {
  terminal?: string;
  timeout?: number | string;
}

// buildPageWsUrl assembles the instance-scoped WS URL for one of the three
// panel bridges. Pure (no window dependency beyond host/protocol) so the
// iframe bridge in CustomPageView and unit checks share it. Unknown
// endpoints fall back to 'terminal' (fail closed); terminal ids use the
// panel-wide [a-z0-9_-] normalisation; timeout is digits-only.
export function buildPageWsUrl(
  host: string,
  protocol: string,
  instanceId: number,
  endpoint?: unknown,
  opts?: PageWSOptions,
): string {
  const route = endpoint === 'startup' ? 'startup' : endpoint === 'workflow' ? 'workflow' : 'terminal';
  const base = \`\${protocol === 'https:' ? 'wss:' : 'ws:'}//\${host}/api/instances/\${instanceId}/\${route}\`;
  const q: string[] = [];
  const tid = String(opts?.terminal ?? '').trim().toLowerCase().replace(/\\s+/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, 64);
  if (tid) q.push(\`terminal=\${encodeURIComponent(tid)}\`);
  const t = String(opts?.timeout ?? '').trim().replace(/[^0-9]/g, '').slice(0, 6);
  if (t && t !== '0') q.push(\`timeout=\${encodeURIComponent(t)}\`);
  return q.length > 0 ? \`\${base}?\${q.join('&')}\` : base;
}

// base64ToBytes decodes a base64 payload (no data: prefix) to bytes for
// uploadFile. Rejects on invalid input instead of sending garbage.
export function base64ToBytes(b64: string): Uint8Array {
  const clean = String(b64 ?? '').replace(/\\s+/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean) || clean.length % 4 !== 0) {
    throw new Error('uploadFile: invalid base64 payload');
  }
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// bytesToBase64 encodes bytes (chunked — a single String.fromCharCode
// spread over megabytes blows the call stack).
export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(s);
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
  const base = \`/instances/\${instanceId}\`;
  if (t === base || t.startsWith(base + '/') || t.startsWith(base + '?')) return t;
  return null;
}

// ============================================================================
// IN-PAGE ROUTER (plan item 3) — tabs without reload, hash-synced.
// Host-router stays panel-owned: pages never import react-router, they only
// read/write their own \`#tab=<name>\` fragment through sdk.useHashRoute.
// Pure helpers are exported separately so node harnesses can exercise the
// read/write rules without mounting React.
// ============================================================================

// HASH_TAB_ID_RE is the tab-id jail: same \`[a-z0-9_-]\` + ≤64 shape as
// validSubPagePath server-side (instance_page_handler.go:318). Anything else
// (uppercase, dots, slashes, query metachars) is rejected, never thrown.
export const HASH_TAB_ID_RE = /^[a-z0-9_-]{1,64}$/;

// isHashTabId reports whether s is a legal tab id (fail-closed shape check).
export function isHashTabId(s: unknown): s is string {
  return typeof s === 'string' && HASH_TAB_ID_RE.test(s);
}

// parseHashRoute reads \`#tab=<name>\` out of a location.hash value and returns
// the matching entry of \`tabs\`, else \`fallback\`. Never throws: unknown,
// missing, malformed or illegal ids all fall back (deep-links from other
// pages can carry anything).
export function parseHashRoute<T extends string>(hash: unknown, tabs: readonly T[], fallback: T): T {
  try {
    const raw = String(hash ?? '');
    const frag = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!frag) return fallback;
    const params = new URLSearchParams(frag);
    const cand = params.get('tab');
    if (cand !== null && isHashTabId(cand) && (tabs as readonly string[]).includes(cand)) {
      return cand as T;
    }
  } catch { /* malformed hash — fall back below */ }
  return fallback;
}

// hashForTab formats the fragment for a (caller-validated) tab id.
export function hashForTab<T extends string>(t: T): string {
  return \`#tab=\${t}\`;
}

// writeHashTab replaces the current fragment with \`#tab=<id>\` without a page
// reload (history.replaceState: no scroll jump, no extra history entry;
// location.hash fallback where replaceState is unavailable). Returns false
// (no write, no throw) for illegal ids or when there is no window.
export function writeHashTab<T extends string>(t: T): boolean {
  if (!isHashTabId(t)) return false;
  try {
    if (typeof window === 'undefined') return false;
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', hashForTab(t));
    } else if (window.location) {
      window.location.hash = \`tab=\${t}\`;
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// useHashRoute is the hook behind sdk.useHashRoute (same function reference
// is shared on every SDK instance — it holds no instance state). Initial
// state reads the hash once and never rewrites it; a \`hashchange\` listener
// keeps back/forward + cross-page deep-links in sync; the setter validates
// against \`tabs\` (+ id jail) before writing. Refs pin the latest tabs/
// fallback so the listener + setter stay stable without resubscribing.
export function useHashRoute<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [active, setActive] = useState<T>(() => {
    if (typeof window === 'undefined' || typeof window.location === 'undefined') return fallback;
    return parseHashRoute(window.location.hash, tabs, fallback);
  });
  const tabsRef = useRef<readonly T[]>(tabs);
  tabsRef.current = tabs;
  const fallbackRef = useRef<T>(fallback);
  fallbackRef.current = fallback;
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener === 'undefined') return;
    const onHash = (): void => {
      try {
        setActive(parseHashRoute(window.location.hash, tabsRef.current, fallbackRef.current));
      } catch { /* a hash event must never throw into React */ }
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      try {
        window.removeEventListener('hashchange', onHash);
      } catch { /* host already gone */ }
    };
  }, []);
  const setTab = useCallback((t: T): void => {
    if (!(tabsRef.current as readonly string[]).includes(t as string) || !isHashTabId(t)) return;
    setActive(t);
    writeHashTab(t);
  }, []);
  return [active, setTab];
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
  if (!body) return \`HTTP \${status}\`;
  if (body.startsWith('<')) return \`Panel unreachable (HTTP \${status})\`;
  if (body.length > 300) return body.slice(0, 300) + '…';
  return body;
}

function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\\\''") + "'";
}

// --- Allowlisted libs (plan item 1): theme-aware canvas chart ---------------
// Pure + dependency-free: no permissions, no network, no endpoints.

function sdkCssVar(el: HTMLElement, name: string, fallback: string): string {
  try {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function normalizeChartPoints(series: ChartSeries): ChartSeriesPoint[] {
  const arr = Array.isArray(series) ? series : [];
  // Bound the work: a page polling every few seconds must never grow the
  // redraw cost without bound.
  return arr.slice(-120).map((p) => {
    if (typeof p === 'number') return { label: '', value: Number.isFinite(p) ? p : 0 };
    const v = Number((p as ChartSeriesPoint)?.value);
    return { label: String((p as ChartSeriesPoint)?.label ?? ''), value: Number.isFinite(v) ? v : 0 };
  });
}

// renderSdkChart draws bars/line on a canvas child of \`el\` and returns a
// cleanup fn. Theme-aware: series color resolves \`--ks-info\` (same fallback
// \`#38bdf8\` the shipped pages hardcode), grid \`--ks-card-border\`, labels
// \`--ks-muted\` — identical fallbacks to CustomPageView's stock :root block.
// HiDPI: backing store scales by devicePixelRatio (capped at 3). Attacker
// labels only ever reach fillText (never innerHTML), so markup is inert.
export function renderSdkChart(el: HTMLElement, series: ChartSeries, opts?: ChartOptions): () => void {
  if (!el || typeof (el as HTMLElement).appendChild !== 'function') {
    throw new Error('sdk.chart: el must be an HTMLElement');
  }
  const host = el;
  const kind = opts?.kind === 'line' ? 'line' : 'bars';
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  host.appendChild(canvas);

  function draw(): void {
    const pts = normalizeChartPoints(series);
    const dpr = Math.min(3, Math.max(1, Math.floor(window.devicePixelRatio || 1)));
    const W = Math.max(80, Math.floor(host.clientWidth || 300));
    const H = 120;
    canvas.style.height = \`\${H}px\`;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const base = String(opts?.color || '').trim() || sdkCssVar(host, '--ks-info', '#38bdf8');
    const grid = sdkCssVar(host, '--ks-card-border', 'rgba(255,255,255,0.10)');
    const muted = sdkCssVar(host, '--ks-muted', '#9ca3af');
    if (pts.length === 0) {
      ctx.fillStyle = muted;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data yet', W / 2, H / 2);
      return;
    }
    // Baseline grid line.
    ctx.fillStyle = grid;
    ctx.fillRect(0, H - 17, W, 1);
    const max = Math.max(1e-9, ...pts.map((p) => Math.max(0, p.value)));
    const top = 8;
    const bottom = 20;
    const span = H - top - bottom;
    const xAt = (i: number): number =>
      pts.length === 1 ? W / 2 : 4 + (i * (W - 8)) / (pts.length - 1);
    const yAt = (v: number): number => H - bottom - (Math.max(0, v) / max) * span;
    if (kind === 'line') {
      ctx.strokeStyle = base;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xAt(i), yAt(p.value));
        else ctx.lineTo(xAt(i), yAt(p.value));
      });
      ctx.stroke();
    } else {
      const bw = W / pts.length;
      pts.forEach((p, i) => {
        const h = Math.max(2, (Math.max(0, p.value) / max) * span);
        ctx.fillStyle = base;
        ctx.globalAlpha = i === pts.length - 1 ? 1 : 0.45;
        ctx.fillRect(i * bw + 1, H - bottom - h, Math.max(1, bw - 2), h);
      });
      ctx.globalAlpha = 1;
    }
    // X labels (attacker data → fillText only, capped count + length).
    ctx.fillStyle = muted;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const stride = Math.max(1, Math.ceil(pts.length / 6));
    for (let i = 0; i < pts.length; i += stride) {
      const label = pts[i].label;
      if (label) ctx.fillText(label.slice(0, 12), xAt(i), H - 4);
    }
  }

  draw();
  window.addEventListener('resize', draw);
  return () => {
    window.removeEventListener('resize', draw);
    try {
      canvas.remove();
    } catch { /* host already gone */ }
  };
}

// --- Allowlisted libs (plan item 1): safe markdown subset -------------------
// MIRROR of \`safeUrl\` + the \`renderMarkdown\` inline/block rules in
// CustomPageView.tsx (\`panel/frontend/src/shared/components/ui/
// CustomPageView.tsx\`). That file is React-node rendering in the host origin
// and imports this SDK module — importing it back here would be a dependency
// cycle — so the rules are mirrored, not imported. Keep the two in sync:
// headings (#/##/###), **bold**, *italic*, \`code\`, [text](url), -/*/1. lists,
// \`---\` divider (superset: renderMarkdown has no \`---\` rule yet), paragraphs.
// Everything is HTML-escaped first; links go through the same safeUrl
// allow-list (http/https/mailto/relative, else '#').
function sdkMdEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirror of safeUrl (CustomPageView.tsx) — keep in sync.
function sdkMdSafeUrl(raw?: string): string {
  const u = (raw ?? '').trim();
  if (!u) return '#';
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
  return u;
}

// Mirror of renderMarkdown (CustomPageView.tsx) emitting an HTML string.
export function renderSdkMarkdown(md: string): string {
  const lines = String(md ?? '').split('\\n');
  const out: string[] = [];
  let list: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const flushList = (): void => {
    if (list.length === 0) {
      listType = null;
      return;
    }
    const tag = listType === 'ol' ? 'ol' : 'ul';
    out.push(\`<\${tag}>\${list.join('')}</\${tag}>\`);
    list = [];
    listType = null;
  };
  const inline = (text: string): string => {
    // Tokenizer mirrors renderMarkdown's inline() alternation exactly
    // (**bold** | *italic* | \`code\` | [text](url)); each captured span is
    // escaped INDIVIDUALLY so link URLs are safeUrl-checked + escaped once
    // (escaping the whole line first would double-escape \`&\` in query
    // strings). Only the tags below are ever emitted raw.
    const parts: string[] = [];
    const re = /(\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*|\`([^\`]+)\`|\\[([^\\]]+)\\]\\(([^)]+)\\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      parts.push(sdkMdEscape(text.slice(last, m.index)));
      if (m[2] !== undefined) parts.push(\`<strong>\${sdkMdEscape(m[2])}</strong>\`);
      else if (m[3] !== undefined) parts.push(\`<em>\${sdkMdEscape(m[3])}</em>\`);
      else if (m[4] !== undefined) parts.push(\`<code>\${sdkMdEscape(m[4])}</code>\`);
      else parts.push(\`<a href="\${sdkMdEscape(sdkMdSafeUrl(m[6]))}" target="_blank" rel="noreferrer">\${sdkMdEscape(m[5])}</a>\`);
      last = m.index + m[0].length;
    }
    parts.push(sdkMdEscape(text.slice(last)));
    return parts.join('');
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\\s/.test(trimmed)) {
      flushList();
      const lvl = trimmed.match(/^#+/)![0].length;
      const body = inline(trimmed.replace(/^#+\\s/, ''));
      out.push(lvl === 1 ? \`<h1>\${body}</h1>\` : lvl === 2 ? \`<h2>\${body}</h2>\` : \`<h3>\${body}</h3>\`);
    } else if (/^---\\s*$/.test(trimmed)) {
      flushList();
      out.push('<hr />');
    } else if (/^[-*]\\s/.test(trimmed)) {
      if (listType === 'ol') flushList();
      listType = 'ul';
      list.push(\`<li>\${inline(trimmed.replace(/^[-*]\\s/, ''))}</li>\`);
    } else if (/^\\d+\\.\\s/.test(trimmed)) {
      if (listType === 'ul') flushList();
      listType = 'ol';
      list.push(\`<li>\${inline(trimmed.replace(/^\\d+\\.\\s/, ''))}</li>\`);
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      out.push(\`<p>\${inline(trimmed)}</p>\`);
    }
  }
  flushList();
  return out.join('\\n');
}

// --- CSRF token cache (mirrors shared/api/client.ts) ---
// Tokens are minted by public GET /api/csrf-token (reusable ~1h) and sent
// back as X-CSRF-Token on mutating requests. Module-level on purpose: the
// token is panel-wide, so every page SDK instance shares one mint.
let csrfToken: string | null = null;
let csrfInflight: Promise<string | null> | null = null;

function isCsrfExemptUrl(url: string): boolean {
  return (
    url.includes('/api/csrf-token') ||
    url.includes('/api/auth/') ||
    url.includes('/api/nodes/heartbeat') ||
    url.includes('/api/edge/tunnel')
  );
}

async function fetchCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfInflight) {
    csrfInflight = fetch('/api/csrf-token', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        csrfToken = d && typeof d.csrf_token === 'string' ? d.csrf_token : null;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfInflight = null;
      });
  }
  return csrfInflight;
}

function clearCsrfToken(): void {
  csrfToken = null;
}

export function createCustomPageSDK(
  instanceContext: InstanceContext,
  savedActions: PageActionDef[] = [],
  pageSlug: string = '',
  pageConfig: Record<string, string> = {},
): CustomPageAPI {
  const apiBase = \`/api/instances/\${instanceContext.id}\`;
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
  // --- CSRF (mirrors shared/api/client.ts without the axios dependency) ---
  // The backend enforces X-CSRF-Token on cookie-only mutating requests.
  // Without this every SDK POST (executeAction, fetchPanel writes) 403s with
  // "invalid CSRF token" while built-in pages (axios client) keep working.
  function mutatingNeedsCsrf(url: string, options?: RequestInit): boolean {
    const method = String(options?.method || 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return false;
    return !isCsrfExemptUrl(url);
  }
  async function withCsrf(url: string, options?: RequestInit): Promise<RequestInit | undefined> {
    if (!mutatingNeedsCsrf(url, options)) return options;
    const t = await fetchCsrfToken();
    if (!t) return options;
    return { ...options, headers: { ...(options?.headers || {}), 'X-CSRF-Token': t } };
  }
  async function fetchWithTimeoutCsrf(url: string, options?: RequestInit, retried = false): Promise<Response> {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, await withCsrf(url, options));
    } catch (e) {
      throw timeoutErr(e);
    }
    // Transparent CSRF retry: a 403 mentioning csrf means our cached token
    // expired (1h TTL). Clear it, mint fresh, retry once — same contract as
    // the axios client so long-idle pages don't spuriously fail.
    if (!retried && res.status === 403 && !isCsrfExemptUrl(url)) {
      const text = await res.text();
      if (text.toLowerCase().includes('csrf')) {
        clearCsrfToken();
        const fresh = await fetchCsrfToken();
        if (fresh) {
          return fetchWithTimeoutCsrf(url, {
            ...options,
            headers: { ...(options?.headers || {}), 'X-CSRF-Token': fresh },
          }, true);
        }
      }
      throw new Error(sanitizeHttpError(text, res.status));
    }
    return res;
  }
  async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
    const body = options?.body;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const defaultHeaders: Record<string, string> = {};
    if (body != null && !isFormData) defaultHeaders['Content-Type'] = 'application/json';
    const res = await fetchWithTimeoutCsrf(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(sanitizeHttpError(text, res.status));
    }
    // Parse by CONTENT, not just label: some proxies/endpoints mislabel raw
    // file bytes (eula.txt, server.properties…) as application/json, and a
    // blind res.json() there blew up with SyntaxError "Unexpected token 'e',
    // \\"eula=true …\\" is not valid JSON" inside page editors. Read the body
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
    const res = await fetchWithTimeoutCsrf(url, options);
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
    return fetchJSON<ActionResult>(\`/api/instance-pages/execute-action\`, {
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
      return { ok: false, error: \`No saved action named "\${name}" on this page\` };
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
    // admin surface (users, nodes, settings, …). '' targets the instance
    // root itself (needed by saveEnv, which PUTs the instance config).
    const prefix = \`/api/instances/\${instanceContext.id}\`;
    if (typeof path !== 'string' || path.length > 2048) {
      throw new Error('fetchPanel: invalid path');
    }
    if (path === '') return fetchJSON<T>(prefix, init);
    if (!path.startsWith('/')) {
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
      throw new Error(\`fetchPanel: only \${prefix}/… paths are allowed\`);
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
  const storagePrefix = \`ks_page_\${instanceContext.id}_\`;
  const storage = {
    get: (key: string) => Promise.resolve(localStorage.getItem(storagePrefix + key)),
    set: (key: string, value: string) => Promise.resolve(localStorage.setItem(storagePrefix + key, value)),
    delete: (key: string) => Promise.resolve(localStorage.removeItem(storagePrefix + key)),
    clear: () => Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(storagePrefix)).forEach(k => localStorage.removeItem(k))),
    keys: () => Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(storagePrefix)).map(k => k.slice(storagePrefix.length))),
  };
  
  // --- WebSocket ---
  // Markdown/blocks pages run in the panel's own origin, so they can open
  // the authenticated bridges directly. HTML pages (sandboxed iframes) use
  // the bridged connectWS installed by CustomPageView instead (same
  // endpoint/params contract, validated parent-side).
  function connectWS(protocols?: string[], endpoint?: PageWSEndpoint, opts?: PageWSOptions) {
    return new WebSocket(
      buildPageWsUrl(window.location.host, window.location.protocol, instanceContext.id, endpoint, opts),
      protocols,
    );
  }

  // --- Built-in parity wrappers (all instance-scoped via fetchPanel) ---
  const enc = encodeURIComponent;
  // fetchBase64 reads raw bytes (binary-safe download). fetchJSON would
  // reinterpret them as text and corrupt non-UTF8 payloads.
  async function fetchBase64(url: string, options?: RequestInit): Promise<{ base64: string; contentType: string }> {
    const res = await fetchWithTimeoutCsrf(url, options);
    if (!res.ok) throw new Error(sanitizeHttpError(await res.text(), res.status));
    return { base64: bytesToBase64(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/octet-stream' };
  }

  async function uploadFile(path: string, base64: string, contentType?: string): Promise<void> {
    const bytes = base64ToBytes(base64);
    await fetchJSON<void>(\`\${apiBase}/files?op=upload&path=\${enc(path)}\`, {
      method: 'POST',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    });
  }

  async function downloadFile(path: string): Promise<{ name: string; base64: string; contentType: string }> {
    const r = await fetchBase64(\`\${apiBase}/files/read?path=\${enc(path)}\`);
    return { name: String(path).split('/').pop() || 'download', ...r };
  }
  
  // --- Toast/Modal ---
  function toast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message, type } }));
  }
  
  function modal(options: { title: string; content: string; buttons?: Array<{ label: string; action: () => void; variant?: 'primary' | 'secondary' | 'danger' }> }) {
    window.dispatchEvent(new CustomEvent('ks-modal', { detail: options }));
  }

  // --- Near-real pure helpers (no scope, no network) ---
  function downloadText(filename: string, text: string, mime?: string) {
    const name = String(filename || 'download.txt').split('/').pop() || 'download.txt';
    const blob = new Blob([String(text ?? '')], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch { /* already removed */ }
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function copyText(text: string): Promise<void> {
    const v = String(text ?? '');
    try {
      await navigator.clipboard.writeText(v);
      return;
    } catch { /* clipboard API unavailable — fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = v;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      try {
        document.body.removeChild(ta);
      } catch { /* already removed */ }
    }
  }

  function formatBytes(n: number): string {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '—';
    if (v < 1024) return \`\${Math.floor(v)} B\`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let f = v / 1024;
    let u = 0;
    while (f >= 1024 && u < units.length - 1) {
      f /= 1024;
      u++;
    }
    return \`\${f >= 100 ? Math.round(f) : Math.round(f * 10) / 10} \${units[u]}\`;
  }

  function timeAgo(ts: number | string): string {
    const t = typeof ts === 'string' ? Date.parse(ts) : Number(ts);
    if (!Number.isFinite(t)) return '—';
    const ms = t > 1e12 ? t : t * 1000;
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return \`\${s}s ago\`;
    const m = Math.floor(s / 60);
    if (m < 60) return \`\${m}m ago\`;
    const h = Math.floor(m / 60);
    if (h < 24) return \`\${h}h ago\`;
    const d = Math.floor(h / 24);
    if (d < 30) return \`\${d}d ago\`;
    return new Date(ms).toLocaleDateString();
  }

  function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, Math.max(0, ms));
    };
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

    // Page identity (see interface docs).
    pageSlug,
    
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
    
    deleteFile: (path) => executeAction({ type: 'shell', command: \`rm -rf -- \${shellQuote(path)}\` }),
    
    createDirectory: (path) => executeAction({ type: 'shell', command: \`mkdir -p -- \${shellQuote(path)}\` }),
    
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
    // In-page router hook (shared reference — no instance state inside).
    useHashRoute,
    toast,
    confirm: (msg) => confirmDialog({ title: 'Please confirm', message: msg }),
    prompt: (msg, def = '') => Promise.resolve(window.prompt(msg, def)),
    modal,
    downloadText,
    copyText,
    formatBytes,
    timeAgo,
    debounce,
    // Allowlisted libs (pure canvas/markdown — same origin guarantees as
    // the helpers above: no scope, no permissions, no network).
    chart: (el, series, opts) => renderSdkChart(el, series, opts),
    markdown: (md) => renderSdkMarkdown(md),
    
    // Events
    on,
    emit,
    once,
    
    // Storage
    storage,
    
    // WebSocket (terminal / workflow / startup bridges)
    connectWS,

    // Files parity
    statPath: (path) => fetchPanel(\`/files?op=stat&path=\${enc(path)}\`),
    renamePath: (from, to) => fetchPanel(\`/files?op=rename&path=\${enc(from)}&to=\${enc(to)}\`, { method: 'POST' }).then(() => undefined),
    copyPath: (from, to) => fetchPanel(\`/files?op=copy&path=\${enc(from)}&to=\${enc(to)}\`, { method: 'POST' }).then(() => undefined),
    chmodPath: (path, mode) => fetchPanel(\`/files?op=chmod&path=\${enc(path)}&mode=\${enc(mode)}\`, { method: 'POST' }).then(() => undefined),
    archivePaths: (dir, names, destArchive) => fetchPanel(\`/files?op=archive&path=\${enc(dir)}&to=\${enc(destArchive)}\`, { method: 'POST', body: JSON.stringify({ names }) }),
    extractArchive: (archivePath, destDir) => fetchPanel(\`/files?op=extract&path=\${enc(archivePath)}\${destDir ? \`&to=\${enc(destDir)}\` : ''}\`, { method: 'POST' }).then(() => undefined),
    searchFiles: (dir, query, limit = 100) => fetchPanel(\`/files?op=search&path=\${enc(dir)}&q=\${enc(query)}&limit=\${limit}\`),
    uploadFromUrl: (dir, url) => fetchPanel('/files/url', { method: 'POST', body: JSON.stringify({ url, path: dir.endsWith('/') ? dir : \`\${dir}/\` }) }).then(() => undefined),
    uploadFile,
    downloadFile,

    // Ports parity
    listPorts: async () => {
      const d: any = await fetchPanel('/ports');
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.allocations)) return d.allocations;
      return [];
    },
    savePorts: (ports) => fetchPanel('/ports', { method: 'PUT', body: JSON.stringify({ ports }) }).then(() => undefined),

    // Automation parity
    listAutomation: () => fetchPanel('/automation/'),
    listAutomationRuns: (limit = 50) => fetchPanel(\`/automation/runs?limit=\${limit}\`),
    runAutomationJob: (jobId) => fetchPanel(\`/automation/\${jobId}/run\`, { method: 'POST' }),
    deleteAutomationJob: (jobId) => fetchPanel(\`/automation/\${jobId}\`, { method: 'DELETE' }).then(() => undefined),
    createAutomationJob: (payload) => fetchPanel('/automation/', { method: 'POST', body: JSON.stringify(payload) }),
    updateAutomationJob: (jobId, payload) => fetchPanel(\`/automation/\${jobId}\`, { method: 'PUT', body: JSON.stringify(payload) }).then(() => undefined),
    downloadAutomation: (jobId) => fetchBase64(\`\${apiBase}/automation/\${jobId}/download\`).then((r) => ({ base64: r.base64 })),
    importAutomationURL: (url) => fetchPanel('/automation/import/url', { method: 'POST', body: JSON.stringify({ url }) }),

    // Secrets / Env parity
    listSecrets: () => fetchPanel('/secrets/'),
    setSecret: (key, value) => fetchPanel('/secrets/', { method: 'POST', body: JSON.stringify({ key, value }) }).then(() => undefined),
    deleteSecret: (key) => fetchPanel(\`/secrets/\${enc(key)}\`, { method: 'DELETE' }).then(() => undefined),
    revealSecret: (key) => fetchPanel(\`/secrets/\${enc(key)}\`),
    saveEnv: (env) => fetchPanel('', { method: 'PUT', body: JSON.stringify({ config: { env } }) }),

    // Power / identity parity
    power: (action) => {
      if (!['start', 'stop', 'restart', 'kill'].includes(action)) return Promise.reject(new Error(\`power: unknown action "\${action}"\`));
      return fetchPanel(\`/\${action}\`, { method: 'POST' }).then(() => undefined);
    },
    reinstall: () => fetchPanel('/reinstall', { method: 'POST' }),
    updateIdentity: (payload) => fetchPanel('/identity', { method: 'PUT', body: JSON.stringify(payload) }).then(() => undefined),

    // Monitoring parity
    getMetrics: () => fetchPanel('/metrics'),
    listProcesses: async () => {
      const d: any = await fetchPanel('/processes');
      return Array.isArray(d) ? d : [];
    },
    killProcess: (pid, signal) => {
      const qs = \`pid=\${enc(String(pid))}\${signal ? \`&signal=\${enc(signal)}\` : ''}\`;
      return fetchPanel(\`/processes/kill?\${qs}\`, { method: 'POST' });
    },
    listAudit: async (limit = 100) => {
      const d: any = await fetchPanel(\`/audit?limit=\${limit}\`);
      return Array.isArray(d) ? d : (Array.isArray(d?.rows) ? d.rows : []);
    },

    // SFTP parity
    getSftp: () => fetchPanel('/sftp'),
    enableSftp: () => fetchPanel('/sftp/enable', { method: 'POST' }),
    rotateSftp: () => fetchPanel('/sftp/rotate', { method: 'POST' }),
    disableSftp: () => fetchPanel('/sftp/disable', { method: 'POST' }),
    revealSftp: () => fetchPanel('/sftp?reveal=1'),

    // Workflow stdin parity (bound terminal panes)
    sendActionStdin: (actionId, line) => fetchPanel(\`/actions/\${enc(actionId)}/stdin\`, { method: 'POST', body: JSON.stringify({ data: line }) }),
    sendInstallStdin: (line) => fetchPanel('/install/stdin', { method: 'POST', body: JSON.stringify({ data: line }) }),
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
export type { CustomPageAPI as KSPageSDK };`,I=["InstanceContext","ActionType","PageAction","ActionResult","PageActionDef","FileEntry","ChartSeriesPoint","ChartSeries","ChartOptions","PageWSEndpoint","PageWSOptions","CustomPageAPI"];function O(n,r){const i=new RegExp(`export\\s+(interface\\s+${r}\\b|type\\s+${r}\\b)`).exec(n);if(!i||i.index===void 0)return null;const s=M(n);if(i[1].startsWith("interface")){const e=s.indexOf("{",i.index);if(e<0)return null;let t=0;for(let d=e;d<s.length;d++)if(s[d]==="{")t++;else if(s[d]==="}"&&(t--,t===0))return w(n.slice(i.index,d+1));return null}const a=s.indexOf("=",i.index);if(a<0)return null;let o=0;for(let e=a+1;e<s.length;e++){const t=s[e];if(t==="{"||t==="("||t==="[")o++;else if(t==="}"||t===")"||t==="]")o--;else if(t===";"&&o===0)return w(n.slice(i.index,e+1))}return null}function M(n){const r=n.split(""),i=(a,o)=>{for(let e=a;e<o;e++)r[e]!==`
`&&(r[e]=" ")};let s=0;const l=n.length;for(;s<l;){const a=n[s],o=n[s+1];if(a==="/"&&o==="/"){let e=s;for(;e<l&&n[e]!==`
`;)e++;i(s,e),s=e}else if(a==="/"&&o==="*"){const e=n.indexOf("*/",s+2),t=e<0?l:e+2;i(s,t),s=t}else if(a==="'"||a==='"'||a==="`"){const e=a;let t=s+1;const d=[];for(;t<l;){if(n[t]==="\\"){t+=2;continue}if(e==="`"&&n[t]==="$"&&n[t+1]==="{"){let c=t+2,u=1;for(;c<l&&u>0;)n[c]==="{"?u++:n[c]==="}"&&u--,c++;d.push([t,c]),t=c;continue}if(n[t]===e||e!=="`"&&n[t]===`
`)break;t++}const h=Math.min(t+1,l);i(s,h);for(const[c,u]of d)for(let p=c;p<Math.min(u,l);p++)r[p]=n[p];s=h}else s++}return r.join("")}function w(n){return n.replace(/^export\s+/,"")}const v=`
declare namespace React {
  function useState<T>(initial: T | (() => T)): [T, (update: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>): T;
  function useMemo<T>(fn: () => T, deps: ReadonlyArray<unknown>): T;
  interface RefObject<T> { current: T; }
  function useRef<T>(initial: T): RefObject<T>;
  function createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  type ReactNode = unknown;
}
declare const React: typeof React;
declare namespace JSX {
  interface IntrinsicElements { [element: string]: unknown; }
}
declare module 'react' {
  export function useState<T>(initial: T | (() => T)): [T, (update: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>): T;
  export function useMemo<T>(fn: () => T, deps: ReadonlyArray<unknown>): T;
  export interface RefObject<T> { current: T; }
  export function useRef<T>(initial: T): RefObject<T>;
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  export type ReactNode = unknown;
  const _default: unknown;
  export default _default;
}
declare const sdk: CustomPageAPI;
`;let g=null;function $(){if(g!==null)return g;try{const n=[];for(const r of I){const i=O(String(C??""),r);i&&n.push(i)}if(!n.some(r=>/(^|\n)interface\s+CustomPageAPI\b/.test(r)))throw new Error("CustomPageAPI block not found in customPageSdk.ts");g=`${n.join(`

`)}
${v}`}catch{g=`declare const sdk: any;
${v}`}return g}let k=!1;function N(){k||(k=!0,self.MonacoEnvironment={getWorker(n,r){return r==="typescript"||r==="javascript"?new E:new R}})}let P=!1;function H(){P||(P=!0,m.typescript.typescriptDefaults.setCompilerOptions({target:m.typescript.ScriptTarget.ES2020,allowNonTsExtensions:!0,moduleResolution:m.typescript.ModuleResolutionKind.NodeJs,jsx:m.typescript.JsxEmit.React,allowJs:!0,checkJs:!1,strict:!1,noEmit:!0}),m.typescript.typescriptDefaults.setDiagnosticsOptions({noSemanticValidation:!1,noSyntaxValidation:!1}),m.typescript.typescriptDefaults.addExtraLib($(),"file:///ks-studio/sdk.d.ts"))}let T=!1;function _(){T||(T=!0,b.defineTheme("ks-dark",{base:"vs-dark",inherit:!0,rules:[],colors:{"editor.background":"#0a0a0f","editor.lineHighlightBackground":"#ffffff0d"}}))}const W=({value:n,onChange:r,fileKey:i,ariaLabel:s})=>{const l=f.useRef(null),a=f.useRef(null),o=f.useRef(null),e=f.useRef(!1),t=f.useRef(r);t.current=r,f.useEffect(()=>{N(),H(),_();const h=l.current;if(!h)return;const c=A.parse(`file:///ks-studio/${i==="index"?"index":i}.tsx`),u=b.getModel(c),p=u??b.createModel(n,"typescript",c);if(u&&u.getValue()!==n){e.current=!0;try{u.setValue(n)}finally{e.current=!1}}o.current=p;const y=b.create(h,{model:p,language:"typescript",theme:"ks-dark",automaticLayout:!0,fontSize:13,fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",minimap:{enabled:!1},scrollBeyondLastLine:!1,padding:{top:8},lineNumbers:"on",renderLineHighlight:"all",tabSize:2,insertSpaces:!0,wordWrap:"on",stickyScroll:{enabled:!1},fixedOverflowWidgets:!0,ariaLabel:s});a.current=y;const x=p.onDidChangeContent(()=>{e.current||t.current(p.getValue())});return()=>{x.dispose(),y.dispose();try{p.dispose()}catch{}a.current=null,o.current=null}},[]);const d=f.useRef(n);return f.useEffect(()=>{d.current=n;const h=o.current;if(!(!h||h.getValue()===n)){e.current=!0;try{h.setValue(n)}finally{e.current=!1}}},[n]),S.jsx("div",{ref:l,style:{height:"420px",width:"100%"},className:"rounded-md overflow-hidden border border-white/10"})};export{W as default};
