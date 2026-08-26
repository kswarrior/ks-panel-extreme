import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listInstancePages,
  createInstancePage,
  updateInstancePage,
  executePageAction,
  listInstances,
  type InstancePageAction,
} from '@/shared/api/admin';
import type { Instance } from '@/features/instances/types/instance';
import type {
  InstancePage,
  PageActionDef,
  InstancePageSubPage,
  CreateInstancePagePayload,
  UpdateInstancePagePayload,
} from '@/shared/types/instancePage';
import { parseSubPages } from '@/shared/types/instancePage';
import { PAGE_STARTERS, type PageStarter } from '../templates/pageStarters';
import CustomPageView, { activePageThemeCss, type PageContent } from '@/shared/components/ui/CustomPageView';
import GlassCard from '@/shared/components/ui/Card';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { parseConfig } from '@/shared/hooks/useInstance';
import { useConfirm } from '@/shared/stores/confirmStore';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

type TabId = 'templates' | 'editor' | 'subpages' | 'actions' | 'preview' | 'settings';

const TAB_CONFIG: { id: TabId; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'templates', label: 'Templates', hint: 'Ready-made functional pages', icon: <TemplatesIcon /> },
  { id: 'editor', label: 'Content', hint: 'HTML · Markdown · Blocks', icon: <EditorIcon /> },
  { id: 'subpages', label: 'Sub-pages', hint: 'Extra routes (/files/edit…)', icon: <PagesIcon /> },
  { id: 'actions', label: 'Actions', hint: 'Saved executable actions', icon: <TerminalIcon /> },
  { id: 'preview', label: 'Preview', hint: 'Live render on an instance', icon: <PreviewIcon /> },
  { id: 'settings', label: 'Settings', hint: 'Meta, icon, import/export', icon: <SettingsIcon /> },
];

function TemplatesIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M12 3l1.9 5.8L20 10l-5 3.6L16.5 20 12 16.4 7.5 20 9 13.6 4 10l6.1-1.2z"/></svg>;
}
function EditorIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> </svg>;
}
function TerminalIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/> </svg>;
}
function PreviewIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/> </svg>;
}
function PagesIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/><path d="M9 15h6"/><path d="M9 11h2"/></svg>;
}
function SettingsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/> </svg>;
}

// ---------------------------------------------------------------------------
// Local editing shapes
// ---------------------------------------------------------------------------

interface ActionRow {
  id: string;
  name: string;
  type: InstancePageAction['type'];
  command: string;
  path: string;
  content: string;
  args: string;
  open_args: boolean;
  env: string;
  timeout: string;
  description: string;
}

let actionSeq = 0;
function blankAction(): ActionRow {
  actionSeq += 1;
  return { id: `a${Date.now()}-${actionSeq}`, name: '', type: 'shell', command: '', path: '', content: '', args: '', open_args: false, env: '{}', timeout: '30', description: '' };
}

// actionsToDefs serialises editor rows into the persisted JSON shape.
// Rows without a name are dropped; invalid env JSON is dropped per-row so one
// bad row can't block saving the page.
function actionsToDefs(rows: ActionRow[]): PageActionDef[] {
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

function defsToActions(json: string | undefined): ActionRow[] {
  let defs: any[] = [];
  if (json && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) defs = parsed.filter((d) => d && typeof d === 'object');
    } catch { /* legacy/corrupt rows start fresh */ }
  }
  if (defs.length === 0) return [blankAction()];
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
// Sub-page (multi-page) editing shapes
// ---------------------------------------------------------------------------

interface SubPageRow {
  id: string;
  path: string;
  name: string;
  content_type: 'html' | 'markdown' | 'blocks';
  content_html: string;
  content_markdown: string;
  content_blocks: string;
}

let subSeq = 0;
function blankSub(): SubPageRow {
  subSeq += 1;
  return { id: `s${Date.now()}-${subSeq}`, path: '', name: '', content_type: 'html', content_html: '', content_markdown: '', content_blocks: '' };
}

function subRowsFromJSON(json: string | undefined | null): SubPageRow[] {
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
function subsToJSON(rows: SubPageRow[]): string {
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
function validateSubRows(rows: SubPageRow[]): string {
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

// Static preview used when no instance is bound (no SDK available).
// A stub KSPageSDK rejects every live call immediately with a clear message
// so starter templates render their shell instead of crashing on a
// ReferenceError.
const STATIC_SDK_STUB = `<script>
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
const PREVIEW_BASE_STYLE = `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 1rem; color: var(--ks-body, #e5e7eb); background: transparent; }
* { box-sizing: border-box; }
h1,h2,h3 { color: var(--ks-heading, #fff); margin: 1rem 0 0.5rem; }
code { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 0.1rem 0.3rem; border-radius: 3px; }
pre { background: var(--ks-input-bg, rgba(0,0,0,0.35)); padding: 1rem; border-radius: 6px; overflow-x: auto; }
`;

function renderPreview(contentType: string, content: string): string {
  const safeContent = content || '';
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
// Visual blocks editor
// ---------------------------------------------------------------------------

interface BlockRow {
  type: 'heading' | 'text' | 'image' | 'button' | 'spacer' | 'code' | 'divider'
    | 'stat' | 'table' | 'list' | 'html' | 'action';
  value: string;
  href?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
  label?: string;
  unit?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  action?: string;
  confirmText?: string;
}

const BLOCK_TYPES: { type: BlockRow['type']; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Link button' },
  { type: 'stat', label: 'Stat card' },
  { type: 'table', label: 'Table (JSON rows)' },
  { type: 'list', label: 'List (JSON or lines)' },
  { type: 'code', label: 'Code block' },
  { type: 'html', label: 'Raw HTML' },
  { type: 'action', label: 'Action button' },
  { type: 'spacer', label: 'Spacer' },
  { type: 'divider', label: 'Divider' },
];

function parseBlocks(json: string): { rows: BlockRow[]; ok: boolean } {
  if (!json.trim()) return { rows: [], ok: true };
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return { rows: arr.filter((r) => r && typeof r === 'object'), ok: true };
  } catch { /* fallthrough */ }
  return { rows: [], ok: false };
}

const BlocksVisualEditor: React.FC<{
  rows: BlockRow[];
  onChange: (rows: BlockRow[]) => void;
  jsonError: boolean;
  actionNames: string[];
}> = ({ rows, onChange, jsonError, actionNames }) => {
  const update = (i: number, patch: Partial<BlockRow>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {jsonError && (
        <p className="text-xs text-amber-300">
          The stored blocks JSON is invalid — fix it in the JSON tab to restore visual editing.
        </p>
      )}
      {rows.length === 0 && !jsonError && (
        <p className="text-xs text-gray-500">No blocks yet. Add your first block below.</p>
      )}
      {rows.map((b, i) => (
        <div key={i} className="ks-card ks-form-card rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {BLOCK_TYPES.find((t) => t.type === b.type)?.label ?? b.type}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" className="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Remove block" className="px-1.5 py-0.5 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20">✕</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[150px_1fr] gap-2 items-start">
            <select
              value={b.type}
              onChange={(e) => update(i, { type: e.target.value as BlockRow['type'] })}
              className={glassFieldClass}
            >
              {BLOCK_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>

            {(b.type === 'heading' || b.type === 'text' || b.type === 'code' || b.type === 'html') && (
              <textarea
                value={b.value}
                onChange={(e) => update(i, { value: e.target.value })}
                rows={b.type === 'text' ? 2 : b.type === 'heading' ? 1 : 4}
                className={`${glassFieldClass} ${b.type === 'html' || b.type === 'code' ? 'font-mono text-xs' : ''}`}
                placeholder={b.type === 'html' ? '<p>raw html…</p>' : b.type === 'code' ? 'code…' : 'content…'}
              />
            )}

            {(b.type === 'table' || b.type === 'list') && (
              <textarea
                value={b.value}
                onChange={(e) => update(i, { value: e.target.value })}
                rows={4}
                className={`${glassFieldClass} font-mono text-xs`}
                placeholder={b.type === 'table' ? '[["col A","col B"],["a","b"]]' : '["item one","item two"]'}
              />
            )}

            {b.type === 'image' && (
              <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="https://… image URL" />
            )}

            {b.type === 'button' && (
              <div className="space-y-2">
                <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={glassFieldClass} placeholder="Button label" />
                <input value={b.href ?? ''} onChange={(e) => update(i, { href: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="https://… link URL" />
              </div>
            )}

            {b.type === 'stat' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input value={b.label ?? ''} onChange={(e) => update(i, { label: e.target.value })} className={glassFieldClass} placeholder="Label" />
                <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={glassFieldClass} placeholder="Value" />
                <input value={b.unit ?? ''} onChange={(e) => update(i, { unit: e.target.value })} className={glassFieldClass} placeholder="Unit" />
                <select
                  value={b.tone ?? 'default'}
                  onChange={(e) => update(i, { tone: e.target.value as BlockRow['tone'] })}
                  className={glassFieldClass}
                >
                  <option value="default">Tone: default</option>
                  <option value="good">Tone: good</option>
                  <option value="warn">Tone: warn</option>
                  <option value="bad">Tone: bad</option>
                </select>
              </div>
            )}

            {b.type === 'action' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={b.action ?? ''}
                  onChange={(e) => update(i, { action: e.target.value })}
                  className={glassFieldClass}
                >
                  <option value="">— pick a saved action —</option>
                  {actionNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input value={b.label ?? ''} onChange={(e) => update(i, { label: e.target.value })} className={glassFieldClass} placeholder="Button label (optional)" />
                <input value={b.confirmText ?? ''} onChange={(e) => update(i, { confirmText: e.target.value })} className={glassFieldClass} placeholder="Confirm prompt (optional)" />
              </div>
            )}

            {(b.type === 'spacer' || b.type === 'divider') && (
              <div className="text-xs text-gray-500 self-center">No settings for this block.</div>
            )}
          </div>

          {(b.type === 'heading' || b.type === 'text' || b.type === 'image' || b.type === 'button' || b.type === 'stat') && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Align:</span>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update(i, { align: a })}
                  className={`px-2 py-0.5 rounded border ${b.align === a || (!b.align && a === 'left') ? 'border-emerald-500 text-emerald-300' : 'border-white/10 text-gray-400 hover:text-white'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onChange([...rows, { type: t.type, value: '', align: 'left' }])}
            className="px-2 py-1 text-xs rounded border border-white/10 text-gray-300 hover:bg-white/10"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Main Studio component
// ---------------------------------------------------------------------------

const InstancePageStudio: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const pageId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<TabId>('templates');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ stdout: string; stderr: string; exit_code: number } | null>(null);

  // Page metadata + content
  const [page, setPage] = useState<Partial<InstancePage>>({
    name: '',
    description: '',
    slug: '',
    kind: 'custom' as InstancePage['kind'],
    category: '',
    content_type: 'html',
    content_html: '',
    content_markdown: '',
    content_blocks: '',
    icon_svg: '',
    actions: '',
  });

  // Saved-action rows (edited on the Actions tab, persisted with the page).
  const [actions, setActions] = useState<ActionRow[]>([blankAction()]);

  // Sub-page rows (edited on the Sub-pages tab) — extra routes that ship
  // with this page (multi-page support, e.g. files/edit).
  const [subs, setSubs] = useState<SubPageRow[]>([]);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  // Preview target: 'main' or a sub-page row id.
  const [previewTarget, setPreviewTarget] = useState<string>('main');

  // Full-screen preview: keeps the panel shell (header + sidebar) visible and
  // hides every other piece of studio chrome. The overlay is measured over
  // the app's <main> region so header and sidebar are never covered.
  const [fullPreview, setFullPreview] = useState(false);
  const [mainRect, setMainRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!fullPreview) return;
    const measure = () => {
      const main = document.querySelector('main');
      if (!main) { setMainRect(null); return; }
      const r = main.getBoundingClientRect();
      setMainRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullPreview]);
  useEffect(() => {
    if (!fullPreview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullPreview(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullPreview]);
  // Leaving the Preview tab always drops out of full screen so chrome returns.
  useEffect(() => {
    if (activeTab !== 'preview' && fullPreview) setFullPreview(false);
  }, [activeTab, fullPreview]);

  // Blocks visual editor state
  const [blocksMode, setBlocksMode] = useState<'visual' | 'json'>('visual');

  // Preview / test target
  const [instances, setInstances] = useState<Instance[]>([]);
  const [previewInstanceId, setPreviewInstanceId] = useState<number | null>(null);

  // Templates tab filter
  const [starterQuery, setStarterQuery] = useState('');

  const isBuiltin = page.kind === 'builtin';

  // Load page (edit mode) + instances for preview/test.
  useEffect(() => {
    let cancelled = false;
    listInstances().then((list) => { if (!cancelled) setInstances(list); }).catch(() => { /* preview picker just stays empty */ });
    if (!isEdit || pageId == null) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    listInstancePages()
      .then((pages) => {
        if (cancelled) return;
        const found = pages.find((p) => p.id === pageId);
        if (found) {
          setPage({ ...found });
          setActions(defsToActions(found.actions));
          setSubs(subRowsFromJSON(found.sub_pages));
        } else {
          setError('Instance page not found');
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.response?.data || 'Failed to load page');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageId, isEdit]);

  useEffect(() => {
    if (!isEdit) setLoading(false);
  }, [isEdit]);

  const currentContent = useMemo(() => {
    if (page.content_type === 'html') return page.content_html ?? '';
    if (page.content_type === 'markdown') return page.content_markdown ?? '';
    return page.content_blocks ?? '';
  }, [page.content_type, page.content_html, page.content_markdown, page.content_blocks]);

  const actionDefs = useMemo(() => actionsToDefs(actions), [actions]);

  const onChange = <K extends keyof InstancePage>(key: K, value: InstancePage[K]) => {
    setPage((p) => ({ ...p, [key]: value }));
  };

  const handleContentChange = (value: string) => {
    if (page.content_type === 'html') onChange('content_html', value);
    else if (page.content_type === 'markdown') onChange('content_markdown', value);
    else onChange('content_blocks', value);
  };

  const applyStarter = async (s: PageStarter) => {
    const hasContent = Boolean((page.content_html ?? '') || (page.content_markdown ?? '') || (page.content_blocks ?? ''));
    if (hasContent && !(await confirm({ title: 'Apply template', message: `Replace the current draft with the "${s.name}" template?`, tone: 'warning', confirmLabel: 'Replace' }))) return;
    const type = s.contentType ?? 'html';
    setPage((p) => ({
      ...p,
      name: p.name || s.name,
      slug: p.slug || s.slug,
      category: p.category || s.category,
      description: s.description,
      icon_svg: s.iconSvg,
      content_type: type,
      content_html: type === 'html' ? s.html : '',
      content_markdown: type === 'markdown' ? (s.markdown ?? '') : '',
      content_blocks: type === 'blocks' ? (s.blocks ?? '') : '',
      actions: JSON.stringify(s.actions ?? []),
    }));
    // Load the template's saved actions into the Actions tab (blank row when
    // the template ships none).
    setActions(defsToActions(JSON.stringify(s.actions ?? [])));
    if (s.subPages) {
      setSubs(subRowsFromJSON(JSON.stringify(s.subPages)));
      setEditingSubId(null);
      setPreviewTarget('main');
    }
    setNotice(
      s.actions?.length
        ? `Template "${s.name}" applied — full code loaded in Content and ${s.actions.length} saved action(s) in Actions.`
        : `Template "${s.name}" applied — full code loaded in Content.`,
    );
    setActiveTab('editor');
  };

  const addAction = () => setActions((a) => [...a, blankAction()]);
  const removeAction = (actionId: string) => {
    if (actions.length <= 1) return;
    setActions((a) => a.filter((x) => x.id !== actionId));
  };
  const updateAction = (actionId: string, patch: Partial<ActionRow>) => {
    setActions((a) => a.map((x) => (x.id === actionId ? { ...x, ...patch } : x)));
  };

  // ---- Sub-page row handlers ----------------------------------------------
  const addSub = () => {
    const row = blankSub();
    setSubs((s) => [...s, row]);
    setEditingSubId(row.id);
  };
  const updateSub = (subId: string, patch: Partial<SubPageRow>) => {
    setSubs((s) => s.map((x) => (x.id === subId ? { ...x, ...patch } : x)));
  };
  const removeSub = (subId: string) => {
    setSubs((s) => s.filter((x) => x.id !== subId));
    if (editingSubId === subId) setEditingSubId(null);
    if (previewTarget === subId) setPreviewTarget('main');
  };

  const previewInstance = useMemo(
    () => instances.find((i) => i.id === previewInstanceId) ?? null,
    [instances, previewInstanceId],
  );

  const previewContext = useMemo(() => {
    if (!previewInstance) return null;
    return {
      id: previewInstance.id,
      name: previewInstance.name,
      kind: previewInstance.kind,
      status: previewInstance.status,
      template_id: previewInstance.template_id,
      template_name: previewInstance.template_name ?? null,
      node_id: previewInstance.node_id,
      node_name: previewInstance.node_name ?? null,
      owner_id: previewInstance.owner_id ?? null,
      owner_name: previewInstance.owner_name ?? null,
      config: previewInstance.config ? parseConfig(previewInstance.config) : {},
      external_id: previewInstance.external_id ?? '',
      created_at: previewInstance.created_at ?? '',
      updated_at: previewInstance.updated_at ?? '',
    };
  }, [previewInstance]);

  // Preview renders the main page or the selected sub-page (multi-page).
  const editingSub = useMemo(() => subs.find((s) => s.id === previewTarget) ?? null, [subs, previewTarget]);

  const previewContent = useMemo<PageContent>(() => {
    const src = editingSub;
    if (src) {
      return {
        type: src.content_type as PageContent['type'],
        html: src.content_html,
        markdown: src.content_markdown,
        blocks: src.content_blocks,
      };
    }
    return {
      type: (page.content_type || 'html') as PageContent['type'],
      html: page.content_html,
      markdown: page.content_markdown,
      blocks: page.content_blocks,
      actions: actionDefs.length ? actionDefs : undefined,
    };
  }, [editingSub, page.content_type, page.content_html, page.content_markdown, page.content_blocks, actionDefs]);

  // Test-execute a saved action against the selected instance. The backend
  // only runs it when this page's slug is enabled in that instance's spec.
  const testExecute = async (row: ActionRow) => {
    if (!pageId) { setError('Save the page first to test its actions.'); return; }
    if (!previewInstanceId) { setError('Pick an instance on the Preview tab to test against.'); return; }
    const def = actionDefs.find((d) => d.name === row.name.trim());
    if (!def) { setError('The action needs a name before it can be tested.'); return; }
    setExecutingAction(row.id);
    setActionResult(null);
    setError('');
    try {
      const res = await executePageAction(pageId, previewInstanceId, def as InstancePageAction);
      setActionResult({ stdout: res.stdout ?? '', stderr: res.stderr ?? '', exit_code: res.exit_code ?? -1 });
    } catch (e: any) {
      setActionResult({ stdout: '', stderr: e?.response?.data || e.message, exit_code: -1 });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleSave = async () => {
    if (isBuiltin) { setError('Built-in pages cannot be edited. Create a custom page instead.'); return; }
    if (!page.name?.trim() || !page.slug?.trim()) { setError('Name and slug are required'); return; }
    if (page.slug.trim() !== '.' && !/^[a-z0-9][a-z0-9-._]*$/i.test(page.slug.trim())) { setError('Slug may contain letters, numbers, dots, dashes and underscores only ("." is the reserved Home slug).'); return; }
    const subErr = validateSubRows(subs);
    if (subErr) { setError(subErr); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: page.name!.trim(),
        description: page.description ?? '',
        slug: page.slug!.trim(),
        kind: page.kind ?? 'custom',
        category: page.category ?? '',
        content_type: page.content_type || 'html',
        content_html: page.content_html ?? '',
        content_markdown: page.content_markdown ?? '',
        content_blocks: page.content_blocks ?? '',
        icon_svg: page.icon_svg ?? '',
        actions: JSON.stringify(actionDefs),
        sub_pages: subsToJSON(subs),
      } as unknown as UpdateInstancePagePayload;
      if (isEdit && pageId != null) {
        await updateInstancePage(pageId, payload as UpdateInstancePagePayload);
      } else {
        await createInstancePage(payload as unknown as CreateInstancePagePayload);
      }
      navigate('/instance-pages');
    } catch (e: any) {
      setError(e?.response?.data || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ---- Import / export ----------------------------------------------------
  const exportJson = () => {
    const data: Record<string, unknown> = {
      name: page.name ?? '',
      slug: page.slug ?? '',
      kind: page.kind ?? 'custom',
      category: page.category ?? '',
      description: page.description ?? '',
      content_type: page.content_type || 'html',
      content_html: page.content_html ?? '',
      content_markdown: page.content_markdown ?? '',
      content_blocks: page.content_blocks ?? '',
      icon_svg: page.icon_svg ?? '',
      actions: actionDefs,
    };
    const subDefs = parseSubPages(subsToJSON(subs));
    if (subDefs.length > 0) data.pages = subDefs;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.slug || 'instance-page'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('not an object');
      setPage((p) => ({
        ...p,
        name: typeof data.name === 'string' ? data.name : p.name,
        slug: typeof data.slug === 'string' ? data.slug : p.slug,
        // The legacy "builtin" kind is rejected by the API (migration 046);
        // imports coerce to custom so a stale JSON file can't brick the save.
        kind: 'custom' as InstancePage['kind'],
        category: typeof data.category === 'string' ? data.category : p.category,
        description: typeof data.description === 'string' ? data.description : p.description,
        content_type: ['html', 'markdown', 'blocks'].includes(data.content_type) ? data.content_type : p.content_type,
        content_html: typeof data.content_html === 'string' ? data.content_html : p.content_html,
        content_markdown: typeof data.content_markdown === 'string' ? data.content_markdown : p.content_markdown,
        content_blocks: typeof data.content_blocks === 'string' ? data.content_blocks : p.content_blocks,
        icon_svg: typeof data.icon_svg === 'string' ? data.icon_svg : p.icon_svg,
        actions: Array.isArray(data.actions) ? JSON.stringify(data.actions) : p.actions,
      }));
      if (Array.isArray(data.actions)) setActions(defsToActions(JSON.stringify(data.actions)));
      if (Array.isArray(data.pages)) {
        const rows = subRowsFromJSON(JSON.stringify(data.pages));
        setSubs(rows);
        setEditingSubId(null);
      }
      setNotice('Page JSON imported into the form. Review and save.');
    } catch (e: any) {
      setError(`Import failed: ${e?.message || e}`);
    }
  };

  const filteredStarters = useMemo(() => {
    const q = starterQuery.trim().toLowerCase();
    if (!q) return PAGE_STARTERS;
    return PAGE_STARTERS.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
    );
  }, [starterQuery]);

  if (loading) return <FormSkeleton className="ks-form-card" fields={5} />;

  const contentType = (page.content_type || 'html') as 'html' | 'markdown' | 'blocks';

  // Preview panel shared by the normal Preview tab and full-screen mode.
  const previewPanel = (
    <div className={fullPreview ? 'flex h-full flex-col gap-3 overflow-auto p-4' : 'space-y-4'}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {fullPreview ? (
          <h3 className="text-sm font-semibold text-white mr-auto">Live preview</h3>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-white">Live preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Bind a real instance to exercise the page SDK (shell, files, panel APIs) exactly as operators will see it.
            </p>
          </div>
        )}
        {!isBuiltin && (
          <>
            <label className="block">
              <span className="text-xs text-gray-400">Test instance</span>
              <select
                value={previewInstanceId ?? ''}
                onChange={(e) => setPreviewInstanceId(e.target.value ? Number(e.target.value) : null)}
                className={`${glassFieldClass} min-w-[220px]`}
              >
                <option value="">— none (static render) —</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    #{i.id} {i.display_name || i.name} ({i.kind}, {i.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Page</span>
              <select
                value={previewTarget}
                onChange={(e) => setPreviewTarget(e.target.value)}
                className={`${glassFieldClass} min-w-[220px]`}
                disabled={subs.length === 0}
              >
                <option value="main">Main page{subs.length === 0 ? '' : ` (/${page.slug?.trim() || 'slug'})`}</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.trim() || s.path.trim()} (/{page.slug?.trim() || 'slug'}/{s.path.trim() || '…'})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          onClick={() => setFullPreview((v) => !v)}
          title={fullPreview ? 'Exit full screen (Esc)' : 'Full screen — hides everything except the panel header and sidebar'}
          aria-pressed={fullPreview}
          className={`px-3 py-1.5 text-sm rounded border transition ${fullPreview ? 'bg-white text-black border-white' : 'border-white/10 text-gray-300 hover:bg-white/10'}`}
        >
          {fullPreview ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      {previewInstance && previewContext ? (
        <>
          {!isEdit && (
            <p className="text-xs text-amber-300">Tip: unsaved pages preview with the SDK, but actions that hit the panel require the page to be saved &amp; linked.</p>
          )}
          <CustomPageView content={previewContent} title={editingSub ? (editingSub.name.trim() || editingSub.path || 'Preview') : (page.name || 'Preview')} instanceContext={previewContext} pageSlug={page.slug ? (editingSub ? `${page.slug}/${editingSub.path}` : page.slug) : undefined} />
        </>
      ) : (
        <div className={`border border-white/10 rounded-lg overflow-hidden bg-black/30 ${fullPreview ? 'flex-1 min-h-0 flex flex-col' : ''}`} style={fullPreview ? undefined : { minHeight: '500px' }}>
          <iframe
            srcDoc={renderPreview(contentType, currentContent)}
            className={fullPreview ? 'w-full flex-1 min-h-0 border-0' : 'w-full h-[600px] border-0'}
            title="Static Page Preview"
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );

  // Full-screen preview: only header + sidebar (the app shell around this
  // overlay) stay visible — every other studio element is not rendered.
  if (fullPreview && activeTab === 'preview') {
    return (
      <div
        className="fixed z-40 overflow-hidden"
        style={mainRect ?? undefined}
      >
        {previewPanel}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Page' : 'Create Page'}
          <span className="ml-2 text-sm text-gray-500 font-mono">{page.slug ? `/${page.slug}` : ''}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || isBuiltin} className="ks-primary-btn px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50">
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
          <button onClick={() => navigate('/instance-pages')} className="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10">
            Cancel
          </button>
        </div>
      </div>

      <GlassCard className="max-w-6xl">
      {error && (
        <p className="text-red-400 mb-4 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs text-gray-400 hover:text-white">dismiss</button>
        </p>
      )}
      {notice && !error && (
        <p className="text-emerald-300 mb-4 flex items-start justify-between gap-2">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-xs text-gray-400 hover:text-white">dismiss</button>
        </p>
      )}

      {isBuiltin && isEdit && (
        <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
          <p className="font-semibold">Built-in Page (Read-Only)</p>
          <p className="mt-1">
            Built-in pages are provided by the panel and cannot be edited here. To customize one for a
            specific template, use the <strong>Pages</strong> tab in the <strong>Template</strong> editor.
          </p>
        </div>
      )}

      {!isEdit && (!page.name || !page.slug) && !isBuiltin && (
        <p className="text-amber-300 mb-4 text-sm">Name and slug are required before saving — pick them up automatically from a template on the Templates tab.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <GlassCard className="lg:sticky lg:top-4 self-start">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={isBuiltin && tab.id !== 'preview'}
                className={`ks-tab shrink-0 flex items-center gap-2 transition text-left ${activeTab === tab.id ? 'ks-tab-active' : ''} ${isBuiltin && tab.id !== 'preview' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="inline-flex items-center">{tab.icon}</span>
                <span className="flex flex-col">
                  <span className="text-sm">{tab.label}</span>
                  <span className={`text-[10px] hidden lg:block ${activeTab === tab.id ? 'text-black/60 opacity-70' : 'text-gray-500'}`}>{tab.hint}</span>
                </span>
              </button>
            ))}
          </nav>
        </GlassCard>

        <div className="space-y-6">

        {/* ============================== TEMPLATES ============================== */}
        {activeTab === 'templates' && !isBuiltin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-white">Start from a functional template</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Every template is a complete working page built only on the page SDK — the same building blocks you can edit by hand.
                  Includes conversions of all built-in panel pages plus VM &amp; container operator essentials.
                </p>
              </div>
              <input
                value={starterQuery}
                onChange={(e) => setStarterQuery(e.target.value)}
                placeholder="Search templates…"
                className={`${glassFieldClass} max-w-[220px]`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredStarters.map((s) => (
                <article key={s.id} className="ks-card rounded-xl p-4 flex flex-col gap-2 hover:border-white/25 transition-colors">
                  <header className="flex items-start gap-2.5">
                    <span className="shrink-0 inline-flex w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300 items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4.5 h-4.5"><g dangerouslySetInnerHTML={{ __html: s.iconSvg }} /></svg>
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">{s.name}</h4>
                      <p className="text-[11px] text-gray-500 truncate font-mono">/{s.slug}</p>
                    </div>
                  </header>
                  <p className="text-xs text-gray-400 leading-relaxed flex-1">{s.description}</p>
                  <footer className="flex items-center justify-between pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{s.category}</span>
                      {!!s.actions?.length && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-700/50 bg-sky-900/30 text-sky-300" title={`${s.actions.length} saved action(s) included`}>
                          ⚡ {s.actions.length} action{s.actions.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyStarter(s)}
                      className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Use template
                    </button>
                  </footer>
                </article>
              ))}
            </div>
            {filteredStarters.length === 0 && (
              <p className="text-sm text-gray-500">No templates match “{starterQuery}”.</p>
            )}
          </div>
        )}

        {/* ============================== CONTENT ============================== */}
        {activeTab === 'editor' && !isBuiltin && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Content Type</label>
              <div className="flex gap-2">
                {(['html', 'markdown', 'blocks'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { onChange('content_type', t); setBlocksMode('visual'); }}
                    className={`px-3 py-1.5 rounded text-sm border transition ${
                      contentType === t
                        ? 'bg-emerald-600/40 border-emerald-500 text-white'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {t === 'blocks' ? 'Visual Blocks' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {(contentType === 'html' || contentType === 'markdown') && (
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Page Content ({contentType}) — runs in a sandboxed frame with KSPageSDK available for live data.
                </label>
                <textarea
                  value={currentContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className={`${glassFieldClass} font-mono text-sm`}
                  style={{ minHeight: '420px', width: '100%' }}
                  spellCheck={false}
                  placeholder={contentType === 'html'
                    ? '<div class="ks-card">\n  <button onclick="KSPageSDK.shell(\'uptime\')">Run uptime</button>\n</div>'
                    : '# Welcome\n\nYour custom page content here'}
                />
              </div>
            )}

            {contentType === 'blocks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Visual Blocks</label>
                  <div className="flex gap-1 text-xs">
                    {(['visual', 'json'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBlocksMode(m)}
                        className={`px-2 py-1 rounded border ${blocksMode === m ? 'border-emerald-500 text-emerald-300' : 'border-white/10 text-gray-400 hover:text-white'}`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {blocksMode === 'visual' ? (
                  <BlocksVisualEditor
                    rows={parseBlocks(page.content_blocks ?? '').rows}
                    jsonError={!parseBlocks(page.content_blocks ?? '').ok}
                    actionNames={actionDefs.map((d) => d.name)}
                    onChange={(rows) => {
                      const next = rows.length ? JSON.stringify(rows, null, 2) : '';
                      setPage((p) => ({ ...p, content_blocks: next }));
                      if (page.content_type !== 'blocks') onChange('content_type', 'blocks');
                    }}
                  />
                ) : (
                  <textarea
                    value={page.content_blocks ?? ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className={`${glassFieldClass} font-mono text-sm`}
                    style={{ minHeight: '360px', width: '100%' }}
                    spellCheck={false}
                    placeholder={'[\n  { "type": "stat", "label": "CPU", "value": "12", "unit": "%" }\n]'}
                  />
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => navigator.clipboard.writeText(currentContent)} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
                Copy content
              </button>
              <button type="button" onClick={exportJson} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
                Export page JSON
              </button>
              <button type="button" onClick={() => importFileRef.current?.click()} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
                Import JSON…
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJson(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        )}

        {/* ============================== SUB-PAGES ============================== */}
        {activeTab === 'subpages' && !isBuiltin && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Sub-pages</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Extra routes shipped with this page — each becomes{' '}
                  <code className="font-mono">/{page.slug?.trim() || 'slug'}/&lt;path&gt;</code>{' '}
                  when the page is linked to a template or imported (e.g. a Files manager with an editor at /files/edit).
                </p>
              </div>
              <button type="button" onClick={addSub} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-500">
                + Add sub-page
              </button>
            </div>

            {subs.length === 0 && (
              <p className="text-sm text-gray-500">No sub-pages yet. Add one to give this page extra routes.</p>
            )}

            {subs.map((sub) => {
              const isEditing = editingSubId === sub.id;
              const subContent = sub.content_type === 'html' ? sub.content_html : sub.content_type === 'markdown' ? sub.content_markdown : sub.content_blocks;
              const updateSubContent = (value: string) => {
                if (sub.content_type === 'html') updateSub(sub.id, { content_html: value });
                else if (sub.content_type === 'markdown') updateSub(sub.id, { content_markdown: value });
                else updateSub(sub.id, { content_blocks: value });
              };
              return (
                <GlassCard key={sub.id} className="p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                      <span className="font-mono text-[11px] text-sky-300">/{page.slug?.trim() || 'slug'}/{sub.path.trim() || '…'}</span>
                      {sub.name.trim() && <span className="text-gray-400">· {sub.name}</span>}
                    </h4>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setEditingSubId(isEditing ? null : sub.id)} className="ks-ghost-btn px-3 py-1.5 text-xs border border-white/10 rounded hover:bg-white/5">
                        {isEditing ? 'Collapse' : 'Edit'}
                      </button>
                      <button type="button" onClick={() => removeSub(sub.id)} className="text-red-400 hover:text-red-200 text-sm">Remove</button>
                    </div>
                  </div>

                  {isEditing && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs text-gray-400">Path * (becomes /{'{slug}'}/path)</span>
                          <input
                            value={sub.path}
                            onChange={(e) => updateSub(sub.id, { path: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                            className={`${glassFieldClass} font-mono`}
                            placeholder="edit"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Display name *</span>
                          <input value={sub.name} onChange={(e) => updateSub(sub.id, { name: e.target.value })} className={glassFieldClass} placeholder="Editor" />
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-2">Content type</label>
                        <div className="flex gap-2">
                          {(['html', 'markdown', 'blocks'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateSub(sub.id, { content_type: t })}
                              className={`px-3 py-1.5 rounded text-sm border transition ${
                                sub.content_type === t
                                  ? 'bg-emerald-600/40 border-emerald-500 text-white'
                                  : 'border-white/10 text-gray-400 hover:text-white'
                              }`}
                            >
                              {t === 'blocks' ? 'Visual Blocks' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {sub.content_type !== 'blocks' ? (
                        <textarea
                          value={subContent}
                          onChange={(e) => updateSubContent(e.target.value)}
                          className={`${glassFieldClass} font-mono text-sm`}
                          style={{ minHeight: '320px', width: '100%' }}
                          spellCheck={false}
                          placeholder={sub.content_type === 'html' ? '<div class="ks-card">\n  <h3>Editor</h3>\n</div>' : '# Editor'}
                        />
                      ) : (
                        <textarea
                          value={sub.content_blocks}
                          onChange={(e) => updateSubContent(e.target.value)}
                          className={`${glassFieldClass} font-mono text-sm`}
                          style={{ minHeight: '280px', width: '100%' }}
                          spellCheck={false}
                          placeholder={'[\n  { "type": "heading", "value": "Editor", "level": 2 }\n]'}
                        />
                      )}
                    </>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* ============================== ACTIONS ============================== */}
        {activeTab === 'actions' && !isBuiltin && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Saved page actions</h3>
                <p className="text-xs text-gray-500 mt-0.5">Actions are persisted with this page. Pages can run them via <code>KSPageSDK.runAction(name)</code>; Action-button blocks reference them by name.</p>
              </div>
              <button type="button" onClick={addAction} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-500">
                + Add action
              </button>
            </div>

            {!pageId && (
              <p className="text-xs text-amber-300">Save the page to enable test-execution; editing and saving work right away.</p>
            )}

            {actions.map((action, idx) => (
              <GlassCard key={action.id} className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">
                    Action #{idx + 1}
                    {action.name.trim() && <span className="ml-2 font-mono text-[11px] text-gray-500">{action.name}</span>}
                  </h4>
                  <button type="button" onClick={() => removeAction(action.id)} disabled={actions.length <= 1} className="text-red-400 hover:text-red-200 text-sm disabled:opacity-40">Remove</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-400">Action name *</span>
                    <input value={action.name} onChange={(e) => updateAction(action.id, { name: e.target.value })} className={glassFieldClass} placeholder="restart_service" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Type</span>
                    <select value={action.type} onChange={(e) => updateAction(action.id, { type: e.target.value as InstancePageAction['type'] })} className={glassFieldClass}>
                      <option value="shell">Shell command</option>
                      <option value="read_file">Read file</option>
                      <option value="write_file">Write file</option>
                      <option value="list_files">List directory</option>
                      <option value="docker">Docker command</option>
                      <option value="kvm">KVM/virsh command</option>
                      <option value="lxd">LXD/LXC command</option>
                    </select>
                  </label>
                </div>

                {(action.type === 'shell' || action.type === 'docker' || action.type === 'kvm' || action.type === 'lxd') && (
                  <>
                    <label className="block">
                      <span className="text-xs text-gray-400">{action.type === 'shell' ? 'Command' : 'Sub-command'}{action.open_args ? ' — {{args}} inserts the runtime arguments' : ''}</span>
                      <input
                        value={action.command}
                        onChange={(e) => updateAction(action.id, { command: e.target.value })}
                        className={`${glassFieldClass} font-mono`}
                        placeholder={action.type === 'shell'
                          ? (action.open_args ? 'docker stop {{args}}' : 'systemctl restart myservice')
                          : 'ps / inspect / logs'}
                      />
                    </label>
                    <label className="flex items-center gap-2 mt-1 select-none">
                      <input
                        type="checkbox"
                        checked={action.open_args}
                        onChange={(e) => updateAction(action.id, { open_args: e.target.checked })}
                        className="accent-emerald-500"
                      />
                      <span className="text-xs text-gray-400">
                        Allow runtime arguments — pages pass up to 4 values via{' '}
                        <code className="font-mono">runAction(name, {'{ args }'})</code>; every value is validated server-side.
                      </span>
                    </label>
                  </>
                )}

                {(action.type === 'read_file' || action.type === 'write_file' || action.type === 'list_files') && (
                  <label className="block">
                    <span className="text-xs text-gray-400">Path</span>
                    <input value={action.path} onChange={(e) => updateAction(action.id, { path: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="/etc/myapp/config.yaml" />
                  </label>
                )}

                {action.type === 'write_file' && (
                  <label className="block">
                    <span className="text-xs text-gray-400">File content</span>
                    <textarea value={action.content} onChange={(e) => updateAction(action.id, { content: e.target.value })} rows={5} className={`${glassFieldClass} font-mono w-full`} placeholder="Content to write…" />
                  </label>
                )}

                {(action.type === 'shell' || action.type === 'docker' || action.type === 'kvm' || action.type === 'lxd') && (
                  <label className="block">
                    <span className="text-xs text-gray-400">Arguments (space-separated)</span>
                    <input value={action.args} onChange={(e) => updateAction(action.id, { args: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="--all --filter name=web" />
                  </label>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-400">Environment variables (JSON)</span>
                    <textarea value={action.env} onChange={(e) => updateAction(action.id, { env: e.target.value })} rows={2} className={`${glassFieldClass} font-mono text-xs`} placeholder='{"KEY": "value"}' />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Description</span>
                    <input value={action.description} onChange={(e) => updateAction(action.id, { description: e.target.value })} className={glassFieldClass} placeholder="What this action does…" />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-400">Timeout (seconds)</span>
                    <input type="number" min="1" max="300" value={action.timeout} onChange={(e) => updateAction(action.id, { timeout: e.target.value })} className={glassFieldClass} />
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => testExecute(action)}
                    disabled={!pageId || !previewInstanceId || executingAction === action.id}
                    title={!pageId ? 'Save the page first' : !previewInstanceId ? 'Pick a test instance on the Preview tab' : 'Run against the selected instance'}
                    className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50"
                  >
                    {executingAction === action.id ? 'Executing…' : 'Test execute'}
                  </button>
                  {actionResult && executingAction === null && (
                    <span className={`text-xs font-mono ${actionResult.exit_code === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      Exit: {actionResult.exit_code}
                    </span>
                  )}
                </div>

                {actionResult && (
                  <details>
                    <summary className="text-xs text-gray-400 cursor-pointer select-none">Show output</summary>
                    <pre className="mt-2 p-3 bg-black/50 border border-white/10 rounded text-xs text-gray-300 overflow-auto max-h-64 font-mono">
                      {actionResult.stdout || '(no stdout)'}
                      {actionResult.stderr && `\n--- STDERR ---\n${actionResult.stderr}`}
                    </pre>
                  </details>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* ============================== PREVIEW ============================== */}
        {activeTab === 'preview' && previewPanel}

        {/* ============================== SETTINGS ============================== */}
        {activeTab === 'settings' && !isBuiltin && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-white">Page settings</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-400">Name *</span>
                <input value={page.name ?? ''} onChange={(e) => onChange('name', e.target.value)} className={glassFieldClass} required />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Slug * (URL path segment — "." is the reserved Home/index slug)</span>
                <input value={page.slug ?? ''} onChange={(e) => onChange('slug', e.target.value)} className={`${glassFieldClass} font-mono`} required />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-gray-400">Description</span>
              <textarea value={page.description ?? ''} onChange={(e) => onChange('description', e.target.value)} rows={2} className={glassFieldClass} />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-400">Kind</span>
                <select value="custom" disabled className={glassFieldClass} title='Only "custom" pages exist — the legacy built-in kind was removed (migration 046)'>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Category</span>
                <input value={page.category ?? ''} onChange={(e) => onChange('category', e.target.value)} className={glassFieldClass} placeholder="monitoring, docs, tools…" />
              </label>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Icon — pick a preset or paste inner SVG markup</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PAGE_STARTERS.slice(0, 12).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={`Use ${s.name} icon`}
                    onClick={() => onChange('icon_svg', s.iconSvg)}
                    className={`w-9 h-9 rounded-lg border bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center ${page.icon_svg === s.iconSvg ? 'border-emerald-500' : 'border-white/10'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: s.iconSvg }} /></svg>
                  </button>
                ))}
              </div>
              <textarea value={page.icon_svg ?? ''} onChange={(e) => onChange('icon_svg', e.target.value)} rows={3} className={`${glassFieldClass} font-mono text-xs`} placeholder='<path d="M12 2L2 7l10 5 10-5-10-5z" />' />
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button type="button" onClick={exportJson} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">Export page JSON</button>
              <button type="button" onClick={() => importFileRef.current?.click()} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">Import JSON…</button>
            </div>
          </div>
        )}

        {/* Builtin read-only preview */}
        {activeTab === 'preview' && isBuiltin && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Preview</h3>
            <p className="text-xs text-gray-500">Built-in pages render through their compiled components inside the instance panel; there is nothing to preview here.</p>
          </div>
        )}
        {activeTab !== 'preview' && isBuiltin && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">This built-in page is read-only. Switch to Preview or manage it per-template in the Template editor's Pages tab.</p>
          </div>
        )}

        </div>
      </div>
    </GlassCard>
    </>
  );
};

export default InstancePageStudio;







