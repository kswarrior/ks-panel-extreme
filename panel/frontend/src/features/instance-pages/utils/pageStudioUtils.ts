// PageStudio utilities — extracted from pages/InstancePageStudio.tsx
//
// Mirrors panel/frontend/src/features/templates/utils/templateFormUtils.ts:
// pure helpers with no React imports so they can be unit-tested and shared
// across section components without circular dependencies.

import type { PageActionDef, InstancePageSubPage, PageComponentDef, PageConfigureVar } from '@/features/instance-pages/types/instancePage';
import { parseSubPages, parsePageComponents, parsePageConfigure } from '@/features/instance-pages/types/instancePage';
import { activePageThemeCss } from '@/shared/components/ui/CustomPageView';
import type { ActionRow, SubPageRow, ComponentRow, ConfigureRow } from '@/features/instance-pages/types/pageStudio';

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

// getErrorMessage normalises API failures for display: some panel endpoints
// answer with JSON bodies ({error|message}) instead of plain text, which would
// otherwise render as "[object Object]".
export function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Action rows — local editing shape <-> persisted PageActionDef JSON
// ---------------------------------------------------------------------------

let actionSeq = 0;
export function blankAction(): ActionRow {
  actionSeq += 1;
  return { id: `a${Date.now()}-${actionSeq}`, name: '', type: 'shell', command: '', path: '', content: '', args: '', open_args: false, env: '{}', timeout: '30', description: '' };
}

// actionsToDefs serialises editor rows into the persisted JSON shape.
// Rows without a name are dropped; invalid env JSON is dropped per-row so one
// bad row can't block saving the page.
export function actionsToDefs(rows: ActionRow[]): PageActionDef[] {
  const out: PageActionDef[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    let env: Record<string, string> | undefined;
    if (r.env.trim() && r.env.trim() !== '{}') {
      try {
        const parsed = JSON.parse(r.env);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          env = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
        }
      } catch { /* skip invalid env */ }
    }
    out.push({
      name,
      type: r.type,
      command: r.command || undefined,
      path: r.path || undefined,
      content: r.content || undefined,
      args: r.args.trim() ? r.args.split(/\s+/).filter(Boolean) : undefined,
      ...(r.open_args ? { open_args: true } : {}),
      env,
      timeout: parseInt(r.timeout, 10) || undefined,
      description: r.description || undefined,
    });
  }
  return out;
}

export function defsToActions(json: string | undefined): ActionRow[] {
  let defs: any[] = [];
  if (json && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) defs = parsed.filter((d) => d && typeof d === 'object');
    } catch { /* legacy/corrupt rows start fresh */ }
  }
  if (defs.length === 0) return [];
  return defs.map((d) => ({
    id: `d${actionSeq++}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof d.name === 'string' ? d.name : '',
    type: (['shell', 'read_file', 'write_file', 'list_files', 'docker', 'kvm', 'lxd'].includes(d.type) ? d.type : 'shell') as ActionRow['type'],
    command: typeof d.command === 'string' ? d.command : '',
    path: typeof d.path === 'string' ? d.path : '',
    content: typeof d.content === 'string' ? d.content : '',
    args: Array.isArray(d.args) ? d.args.join(' ') : '',
    open_args: d.open_args === true,
    env: d.env && typeof d.env === 'object' ? JSON.stringify(d.env, null, 2) : '{}',
    timeout: d.timeout != null ? String(d.timeout) : '30',
    description: typeof d.description === 'string' ? d.description : '',
  }));
}

// ---------------------------------------------------------------------------
// Sub-page rows — extra routes that ship with this page
// ---------------------------------------------------------------------------

let subSeq = 0;
export function blankSub(): SubPageRow {
  subSeq += 1;
  return { id: `s${Date.now()}-${subSeq}`, path: '', name: '', content_type: 'html', content_html: '', content_markdown: '', content_blocks: '' };
}

export function subRowsFromJSON(json: string | undefined | null): SubPageRow[] {
  const defs: InstancePageSubPage[] = parseSubPages(json);
  if (defs.length === 0) return [];
  return defs.map((d) => ({
    id: `p${subSeq++}-${Math.random().toString(36).slice(2, 8)}`,
    path: d.path,
    name: d.name,
    content_type: (['html', 'markdown', 'blocks'].includes(d.content_type) ? d.content_type : 'html') as SubPageRow['content_type'],
    content_html: typeof d.content_html === 'string' ? d.content_html : '',
    content_markdown: typeof d.content_markdown === 'string' ? d.content_markdown : '',
    content_blocks: typeof d.content_blocks === 'string' ? d.content_blocks : '',
  }));
}

// subsToJSON serialises editor rows into the persisted sub_pages shape.
// Fully blank rows are dropped; returns '' when nothing remains so the API
// stores "no sub-pages".
export function subsToJSON(rows: SubPageRow[]): string {
  const defs: InstancePageSubPage[] = rows
    .filter((r) => r.path.trim() !== '' || r.name.trim() !== '')
    .map((r) => ({
      path: r.path.trim(),
      name: r.name.trim(),
      content_type: r.content_type,
      content_html: r.content_html,
      content_markdown: r.content_markdown,
      content_blocks: r.content_blocks,
    }));
  if (defs.length === 0) return '';
  return JSON.stringify(defs);
}

// validateSubRows mirrors the backend's sub_pages rules client-side so the
// operator gets a precise message before a round-trip.
export function validateSubRows(rows: SubPageRow[]): string {
  const seen = new Set<string>();
  for (const r of rows) {
    const path = r.path.trim();
    const name = r.name.trim();
    if (path === '' && name === '') continue; // untouched row
    if (!/^[a-z0-9_-]+$/.test(path)) return `Sub-page path "${path || '(empty)'}" must be lowercase letters, numbers, dashes or underscores.`;
    if (name === '') return `Sub-page "/${path}" needs a display name.`;
    if (seen.has(path)) return `Duplicate sub-page path "/${path}".`;
    seen.add(path);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Component rows — reusable UI blocks ({name,type,description,content})
// ---------------------------------------------------------------------------

let compSeq = 0;
export function blankComponent(): ComponentRow {
  compSeq += 1;
  return { id: `c${Date.now()}-${compSeq}`, name: '', type: 'html', description: '', content: '' };
}

export function compRowsFromJSON(json: string | undefined | null): ComponentRow[] {
  const defs: PageComponentDef[] = parsePageComponents(json);
  if (defs.length === 0) return [];
  return defs.map((d) => ({
    id: `c${compSeq++}-${Math.random().toString(36).slice(2, 8)}`,
    name: d.name,
    type: (['html', 'markdown', 'block'].includes(d.type) ? d.type : 'html') as ComponentRow['type'],
    description: d.description || '',
    content: d.content || '',
  }));
}

export function compsToJSON(rows: ComponentRow[]): string {
  const defs: PageComponentDef[] = rows
    .filter((r) => r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      type: r.type,
      description: r.description,
      content: r.content,
    }));
  if (defs.length === 0) return '';
  return JSON.stringify(defs);
}

export function validateCompRows(rows: ComponentRow[]): string {
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (name === '') continue; // untouched row
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(name)) return `Component name "${name}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`;
    if (seen.has(name)) return `Duplicate component name "${name}".`;
    seen.add(name);
    if (r.type && !['html', 'markdown', 'block'].includes(r.type)) return `Component "${name}" type must be one of: html, markdown, block.`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Configure rows — page-level env vars (like template env vars)
// ---------------------------------------------------------------------------

let configureSeq = 0;
export function blankConfigure(): ConfigureRow {
  configureSeq += 1;
  return {
    id: `k${Date.now()}-${configureSeq}`,
    name: '',
    label: '',
    description: '',
    default: '',
    user_viewable: true,
    user_editable: true,
    required: false,
    rule: '',
    display: 'text',
    options: '',
    append: false,
    prepend: '',
    append_value: '',
  };
}

export function configureRowsFromJSON(json: string | undefined | null): ConfigureRow[] {
  const defs: PageConfigureVar[] = parsePageConfigure(json);
  if (defs.length === 0) return [];
  return defs.map((d) => ({
    id: `k${configureSeq++}-${Math.random().toString(36).slice(2, 8)}`,
    name: d.name,
    label: d.label || '',
    description: d.description || '',
    default: d.default || '',
    user_viewable: d.user_viewable !== false,
    user_editable: d.user_editable !== false,
    required: !!d.required,
    rule: d.rule || '',
    display: (['text', 'number', 'select', 'checkbox', 'toggle'].includes(d.display) ? d.display : 'text') as ConfigureRow['display'],
    options: d.options || '',
    append: !!d.append,
    prepend: d.prepend || '',
    append_value: d.append_value || '',
  }));
}

export function configureToJSON(rows: ConfigureRow[]): string {
  const defs: PageConfigureVar[] = rows
    .filter((r) => r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      label: r.label.trim(),
      description: r.description.trim(),
      default: r.default,
      user_viewable: !!r.user_viewable,
      user_editable: !!r.user_editable,
      required: !!r.required,
      rule: r.rule.trim(),
      display: r.display,
      options: r.options.trim(),
      append: !!r.append,
      prepend: r.prepend.trim(),
      append_value: r.append_value.trim(),
    }));
  if (defs.length === 0) return '';
  return JSON.stringify(defs);
}

export function validateConfigureRows(rows: ConfigureRow[]): string {
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (name === '') continue; // untouched row
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `Configure variable name "${name}" must start with a letter or underscore and contain only letters, numbers or underscores.`;
    if (seen.has(name)) return `Duplicate configure variable name "${name}".`;
    seen.add(name);
    if (r.display && !['text', 'number', 'select', 'checkbox', 'toggle'].includes(r.display)) return `Configure variable "${name}" display must be one of: text, number, select, checkbox, toggle.`;
    if (r.label && r.label.length > 200) return `Configure variable "${name}" label too long (max 200).`;
    if (r.description && r.description.length > 500) return `Configure variable "${name}" description too long (max 500).`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Static preview helpers — used when no instance is bound (no SDK)
// ---------------------------------------------------------------------------

// Static preview used when no instance is bound (no SDK available).
// A stub KSPageSDK rejects every live call immediately with a clear message
// so starter templates render their shell instead of crashing on a
// ReferenceError.
export const STATIC_SDK_STUB = `<script>
window.KSPageSDK = {
  instance: { id: 0, name: '(static preview)', kind: '-', status: '-', config: {} },
  actions: [],
  toast: function() {},
  executeAction: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  runAction: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  fetchPanel: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  shell: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  readFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  writeFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  listFiles: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  deleteFile: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  createDirectory: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  docker: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  kvm: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); },
  lxd: function() { return Promise.reject(new Error('Static preview — bind an instance on this tab for live data')); }
};
</script>`;

// PREVIEW_BASE_STYLE is the neutral base for the static preview iframe; the
// ACTIVE panel theme's tokens are appended after it (activePageThemeCss) so
// the preview renders with the same --ks-* palette the live page gets.
// Every element references theme tokens (heading/body/link/card/border) so
// the preview is a live, theme-complete miniature of the real instance page.
export const PREVIEW_BASE_STYLE = `
* { box-sizing: border-box; }
body { font-family: var(--ks-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); padding: 1rem; color: var(--ks-body, var(--ks-text-body, #e5e7eb)); background: transparent; line-height: 1.6; }
h1,h2,h3 { color: var(--ks-heading, var(--ks-text-heading, #fff)); margin: 1rem 0 0.5rem; }
h1,h2,h3 strong { color: inherit; }
a { color: var(--ks-link, #7dd3fc); }
a:hover { color: var(--ks-info, #38bdf8); }
code { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 0.1rem 0.3rem; border-radius: 3px; color: var(--ks-body, #e5e7eb); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); }
pre { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 1rem; border-radius: 6px; overflow-x: auto; border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); color: var(--ks-body, #e5e7eb); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); font-size: 0.8125rem; }
th { color: var(--ks-muted, #9ca3af); text-transform: uppercase; font-size: 0.6875rem; letter-spacing: 0.05em; }
img { max-width: 100%; border-radius: 6px; }
.ks-card { background: var(--ks-card-bg, rgba(255,255,255,0.04)); border: 1px solid var(--ks-card-border, rgba(255,255,255,0.10)); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; }
.ks-btn { display: inline-block; background: var(--ks-btn-bg, #fff); color: var(--ks-btn-text, #000); border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; font-size: 0.875rem; }
.ks-muted { color: var(--ks-muted, #9ca3af); }
.ks-ok { color: var(--ks-ok, #34d399); }
.ks-bad { color: var(--ks-bad, #fca5a5); }
.ks-warn { color: var(--ks-warn, #fcd34d); }
`;

export function renderPreview(contentType: string, content: string, components?: PageComponentDef[]): string {
  let safeContent = content || '';
  // React-like component substitution for static preview: resolve {{component:name}}
  // tokens so authors see the same composition they'd get on a live instance
  // (main or sub-page). Supports nested components via up to 5 passes.
  if (components && components.length > 0) {
    const COMPONENT_TOKEN_RE = /\{\{\s*component:([A-Za-z0-9_][A-Za-z0-9_-]*)\s*\}\}/g;
    const compMap = new Map(components.map((c) => [c.name, c]));
    const compToPreviewHtml = (comp: PageComponentDef): string => {
      switch (comp.type) {
        case 'html': return comp.content;
        case 'markdown': {
          // Lightweight markdown → html for preview (mirrors CustomPageView)
          if (!comp.content.trim()) return '';
          return comp.content
            .split('\n')
            .map((line) => {
              const t = line.trim();
              if (/^###\s/.test(t)) return `<h3>${t.replace(/^###\s/, '')}</h3>`;
              if (/^##\s/.test(t)) return `<h2>${t.replace(/^##\s/, '')}</h2>`;
              if (/^#\s/.test(t)) return `<h1>${t.replace(/^#\s/, '')}</h1>`;
              if (/^[-*]\s/.test(t)) return `<li>${t.replace(/^[-*]\s/, '')}</li>`;
              if (t === '') return '';
              return `<p>${t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/` + "`([^`]+)`" + `/g, '<code>$1</code>')}</p>`;
            })
            .join('\n');
        }
        case 'block': {
          try {
            const rows = JSON.parse(comp.content);
            if (Array.isArray(rows)) {
              return rows.map((b: any) => {
                if (b.type === 'heading') return `<h${b.level ?? 2}>${b.value ?? ''}</h${b.level ?? 2}>`;
                if (b.type === 'text') return `<p>${b.value ?? ''}</p>`;
                if (b.type === 'html') return b.value ?? '';
                return `<div>${b.value ?? ''}</div>`;
              }).join('\n');
            }
          } catch { return ''; }
          return '';
        }
        default: return comp.content;
      }
    };
    let prev = '';
    let cur = safeContent;
    for (let iter = 0; iter < 5 && cur !== prev; iter++) {
      prev = cur;
      cur = cur.replace(COMPONENT_TOKEN_RE, (_m: string, name: string) => {
        const comp = compMap.get(name);
        if (!comp) return _m;
        return compToPreviewHtml(comp);
      });
    }
    safeContent = cur;
  }
  const head = (extraStyle = '') => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${STATIC_SDK_STUB}
<style>${PREVIEW_BASE_STYLE}${extraStyle}${activePageThemeCss()}</style></head><body>`;
  if (contentType === 'html') {
    return `${head()}${safeContent}</body></html>`;
  }
  if (contentType === 'markdown') {
    let html = safeContent
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return `${head('body { line-height: 1.6; }')}${html}</body></html>`;
  }
  let blocksJson = '[]';
  try {
    blocksJson = JSON.stringify(JSON.parse(safeContent || '[]'), null, 2);
  } catch {
    blocksJson = safeContent || '(invalid JSON)';
  }
  return `${head('body { font-family: monospace; }')}<pre>${blocksJson}</pre></body></html>`;
}

// ---------------------------------------------------------------------------
// Blocks helpers
// ---------------------------------------------------------------------------

export function parseBlocks(json: string): { rows: import('@/features/instance-pages/types/pageStudio').BlockRow[]; ok: boolean } {
  if (!json.trim()) return { rows: [], ok: true };
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return { rows: arr.filter((r: any) => r && typeof r === 'object'), ok: true };
  } catch { /* fallthrough */ }
  return { rows: [], ok: false };
}
