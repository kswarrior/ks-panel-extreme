// TemplateForm UI components - extracted from TemplateForm.tsx

import React, { useRef, useState, useEffect } from 'react';
import type { TagPickerProps, ToggleProps, BlockRow, TemplateTabId } from '../types/templateForm';
import { TEMPLATE_TABS, BLOCK_LABELS, emptyForm } from '../types/templateForm';
import GlassCard from '@/shared/components/ui/Card';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';

export const TagPicker: React.FC<TagPickerProps> = ({ value, options, placeholder, onChange, onAdd, onDelete }) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const isNew = query.trim() !== '' && !options.includes(query.trim());

  return (
    <div className="relative" ref={ref}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="glass-field"
      />
      {open && (
        <div className="absolute z-10 w-full glass-strong rounded-md shadow-lg max-h-48 overflow-y-auto">
          {isNew && (
            <button
              type="button"
              onClick={() => { onAdd(query.trim()); onChange(query.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-green-300 hover:bg-white/10"
            >
              + Add "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && !isNew && (
            <p className="px-3 py-2 text-xs text-gray-500">No matches</p>
          )}
          {filtered.map((opt) => (
            <div key={opt} className="flex items-center justify-between group px-3 py-2 text-sm text-gray-200 hover:bg-white/10">
              <button type="button" onClick={() => { onChange(opt); setQuery(opt); setOpen(false); }} className="flex-1 text-left">
                {opt}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(opt); if (value === opt) onChange(''); }}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-2"
                aria-label="delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /> </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition ${checked ? 'bg-green-600' : 'bg-neutral-700'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${checked ? 'translate-x-4' : ''}`} />
    </button>
    <span className="text-sm text-gray-300">{label}</span>
  </label>
);

export const TemplateTabs = <T extends string>({ tab, onChange, tabs }: { tab: T; onChange: (id: T) => void; tabs?: Array<{ id: string; label: string }> }) => {
  const meta = {
    general: { label: 'General', hint: 'Name, image, kind, category', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/> </svg> },
    environment: { label: 'Environment', hint: 'Ports, mounts, limits, caps', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/> </svg> },
    env: { label: 'Env Variables', hint: 'Variables exposed to users', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg> },
    actions: { label: 'Actions', hint: 'Custom run actions', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/> </svg> },
    install: { label: 'Install', hint: 'Install steps', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> },
    runtime: { label: 'Runtime', hint: 'Advanced runtime config', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M16 18 6 6 6 18"/><path d="M16 6v12"/> </svg> },
    labels: { label: 'Labels & Devices', hint: 'Labels and device mounts', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="7.5" cy="15.5" r="3.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/> </svg> },
    healthcheck: { label: 'Healthcheck', hint: 'Health check config', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 21s-6-4-8-8a6 6 0 1 1 12 0c-2 4-4 8-4 8z"/> </svg> },
    pages: { label: 'Pages', hint: 'Instance pages selection', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 6h16M4 12h16M4 18h10"/> </svg> },
    controls: { label: 'Instance Controls', hint: 'Menu + More allow-list', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v5.5"/><path d="M12 14.5V20"/><path d="M4 12h5.5"/><path d="M14.5 12H20"/> </svg> },
    spec: { label: 'Spec Preview', hint: 'Serialized template spec', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 7h5l3 5-3 5H3"/><path d="M21 7h-5l-3 5 3 5h5"/></svg> },
  } as Record<string, { label: string; hint: string; icon: React.ReactNode }>;
  const tabList = tabs ?? TEMPLATE_TABS;
  const items = tabList.map(t => ({ id: t.id, ...(meta[t.id] ?? { label: t.label, hint: '', icon: null }) }));
  return (
    <>
      {/* Desktop tabs — vertical on the left, sticky while scrolling (node pattern). */}
      <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
        <nav aria-label="Template form sections" className="flex lg:flex-col gap-1">
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onChange(t.id as T)}
              className={`ks-tab w-full flex items-center gap-2 transition text-left ${tab === t.id ? 'ks-tab-active' : ''}`}
            >
              <span className="inline-flex items-center shrink-0">{t.icon}</span>
              <span className="flex flex-col min-w-0">
                <span>{t.label}</span>
                <span
                  className={`text-[10px] hidden lg:block ${tab === t.id ? 'opacity-70' : 'text-gray-500'}`}
                  style={tab === t.id ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                >
                  {t.hint}
                </span>
              </span>
            </button>
          ))}
        </nav>
      </GlassCard>
      {/* Phone tabs — bottom pill with the same `>` / `<` toggle + auto-off
          system as the actions pill (PageTabsPill). Labels stay on a
          single line (whitespace-nowrap) so "Env Variables" / "Spec Preview"
          never wrap to two lines and stretch the bar height — the row scrolls
          horizontally instead. No spacer here: callers render their own. */}
      <PageTabsPill ariaLabel="Template form sections" spacer={false} activeLabel={items.find((t) => t.id === tab)?.label}>
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onChange(t.id as T)}
            className={`ks-tab shrink-0 flex-none whitespace-nowrap px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${tab === t.id ? 'ks-tab-active' : ''}`}
          >
            <span className="inline-flex items-center shrink-0">{t.icon}</span>
            <span className="whitespace-nowrap leading-none">{t.label}</span>
          </button>
        ))}
      </PageTabsPill>
    </>
  );
};

export const CustomPageStudio: React.FC<{ page: { content_type?: string; content_blocks?: string; content_html?: string; content_markdown?: string }; onChange: (patch: Partial<{ content_type: string; content_blocks: string; content_html: string; content_markdown: string }>) => void }> = ({ page, onChange }) => {
  const type = page.content_type ?? 'markdown';
  const blocks: BlockRow[] = (() => {
    if (!page.content_blocks) return [];
    try {
      const arr = JSON.parse(page.content_blocks);
      if (Array.isArray(arr)) return arr as BlockRow[];
    } catch { /* ignore */ }
    return [];
  })();

  const setBlocks = (next: BlockRow[]) => onChange({ content_blocks: JSON.stringify(next, null, 2) });
  const addBlock = (blockType: BlockRow['type']) => {
    const blank: BlockRow = blockType === 'heading' ? { type: blockType, value: 'New heading', level: 2, align: 'left' }
      : blockType === 'text' ? { type: blockType, value: 'New text paragraph.', align: 'left' }
      : blockType === 'image' ? { type: blockType, value: '', align: 'left' }
      : blockType === 'button' ? { type: blockType, value: 'Click me', href: '#', align: 'left' }
      : blockType === 'code' ? { type: blockType, value: 'console.log("hello")', align: 'left' }
      : { type: blockType, value: '' };
    setBlocks([...blocks, blank]);
  };
  const updateBlock = (i: number, patch: Partial<BlockRow>) => {
    const next = [...blocks];
    next[i] = { ...next[i], ...patch };
    setBlocks(next);
  };
  const delBlock = (i: number) => setBlocks(blocks.filter((_, j) => j !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };

  return (
    <div className="rounded-md border border-emerald-700/30 bg-emerald-900/10 p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Page Studio</span>
        <div className="flex items-center gap-1">
          {(['blocks', 'markdown', 'html'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ content_type: t })}
              className={`px-2 py-1 rounded text-xs border transition ${
                type === t ? 'bg-emerald-700/40 border-emerald-500 text-white' : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {t === 'blocks' ? 'No-code builder' : t === 'markdown' ? 'Markdown' : 'HTML'}
            </button>
          ))}
        </div>
      </div>

      {type === 'blocks' && (
        <div className="space-y-2">
          {blocks.length === 0 && (
            <p className="text-xs text-gray-500">No blocks yet. Add one below.</p>
          )}
          {blocks.map((block, i) => (
            <div key={i} className="border border-white/10 rounded-md p-3 space-y-2 bg-black/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-emerald-300 capitalize">{BLOCK_LABELS[block.type]}</span>
                <div className="flex items-center gap-1">
                  {i > 0 && <button type="button" onClick={() => moveBlock(i, -1)} className="text-xs text-gray-400 hover:text-white" title="Move up"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg></button>}
                  {i < blocks.length - 1 && <button type="button" onClick={() => moveBlock(i, 1)} className="text-xs text-gray-400 hover:text-white" title="Move down"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg></button>}
                  <button type="button" onClick={() => delBlock(i)} className="text-xs text-red-400 hover:text-red-200" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /> </svg></button>
                </div>
              </div>
              {block.type === 'heading' && (
                <div className="space-y-2">
                  <select value={block.level || 2} onChange={(e) => updateBlock(i, { level: Number(e.target.value) as 1 | 2 | 3 })} className="glass-field w-full text-sm">
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                  </select>
                  <input value={block.value} onChange={(e) => updateBlock(i, { value: e.target.value })} placeholder="Heading text" className="glass-field w-full text-sm" />
                  <select value={block.align || 'left'} onChange={(e) => updateBlock(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="glass-field w-full text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              {block.type === 'text' && (
                <div className="space-y-2">
                  <textarea value={block.value} onChange={(e) => updateBlock(i, { value: e.target.value })} placeholder="Text content" rows={3} className="glass-field w-full text-sm font-mono" />
                  <select value={block.align || 'left'} onChange={(e) => updateBlock(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="glass-field w-full text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              {block.type === 'image' && (
                <div className="space-y-2">
                  <input value={block.value} onChange={(e) => updateBlock(i, { value: e.target.value })} placeholder="Image URL" className="glass-field w-full text-sm font-mono" />
                  <select value={block.align || 'left'} onChange={(e) => updateBlock(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="glass-field w-full text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              {block.type === 'button' && (
                <div className="space-y-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={block.value} onChange={(e) => updateBlock(i, { value: e.target.value })} placeholder="Button label" className="glass-field text-sm" />
                  <input value={block.href || '#'} onChange={(e) => updateBlock(i, { href: e.target.value })} placeholder="Link (href)" className="glass-field text-sm font-mono" />
                  <select value={block.align || 'left'} onChange={(e) => updateBlock(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="glass-field text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              {block.type === 'code' && (
                <div className="space-y-2">
                  <textarea value={block.value} onChange={(e) => updateBlock(i, { value: e.target.value })} placeholder="Code snippet" rows={4} className="glass-field w-full text-sm font-mono" />
                  <select value={block.align || 'left'} onChange={(e) => updateBlock(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="glass-field w-full text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}
              {['spacer', 'divider'].includes(block.type) && (
                <p className="text-xs text-gray-500">No settings for this block type.</p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
            {(['heading', 'text', 'image', 'button', 'spacer', 'code', 'divider'] as const).map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => addBlock(bt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5 hover:text-white rounded transition"
              >
                <span>{BLOCK_LABELS[bt]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {type === 'markdown' && (
        <div className="space-y-2">
          <textarea
            value={page.content_markdown ?? ''}
            onChange={(e) => onChange({ content_markdown: e.target.value })}
            placeholder="Markdown content..."
            rows={12}
            className="glass-field w-full font-mono text-sm"
          />
        </div>
      )}
      {type === 'html' && (
        <div className="space-y-2">
          <textarea
            value={page.content_html ?? ''}
            onChange={(e) => onChange({ content_html: e.target.value })}
            placeholder="HTML content..."
            rows={12}
            className="glass-field w-full font-mono text-sm"
          />
        </div>
      )}
    </div>
  );
};

export const parseBlocks = (json: string): BlockRow[] => {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr as BlockRow[];
  } catch { /* ignore */ }
  return [];
};

export const serializeBlocks = (rows: BlockRow[]): string => {
  return JSON.stringify(rows, null, 2);
};