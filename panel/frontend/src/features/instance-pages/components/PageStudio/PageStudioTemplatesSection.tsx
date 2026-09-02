// PageStudioTemplatesSection — "Templates" tab (starter gallery)
//
// Mirrors templates/new's TemplatePagesSection pattern: a bordered card with
// Section heading, a searchable grid of starters and a "Use template" action.
// The actual starter data lives in pageStarters.ts (ported library pages +
// VM/container operator extras).

import React, { useMemo, useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { PageStarter } from '@/features/instance-pages/templates/pageStarters';
import { PAGE_STARTERS } from '@/features/instance-pages/templates/pageStarters';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import ThemePreview from '@/features/themes/components/ThemePreview';
import { useThemeStore } from '@/shared/stores/themeStore';

export interface PageStudioTemplatesSectionProps {
  search: string;
  onSearchChange: (v: string) => void;
  starters: PageStarter[];
  query: string;
  onApply: (s: PageStarter) => void;
  sectionCls: string;
}

export const PageStudioTemplatesSection: React.FC<PageStudioTemplatesSectionProps> = ({
  search,
  onSearchChange,
  starters,
  query,
  onApply,
  sectionCls,
}) => {
  const [category, setCategory] = useState<string>('all');
  const [preview, setPreview] = useState<PageStarter | null>(null);
  const theme = useThemeStore((s) => s.active());

  const categories = useMemo(() => {
    const set = new Set<string>(['all']);
    for (const s of PAGE_STARTERS) if (s.category) set.add(s.category);
    set.add('minecraft');
    return Array.from(set).sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      if (a === 'minecraft') return -1;
      if (b === 'minecraft') return 1;
      return a.localeCompare(b);
    });
  }, []);

  const filtered = useMemo(() => {
    if (category === 'all') return starters;
    return starters.filter((s) => s.category === category);
  }, [starters, category]);

  const previewContent = useMemo(() => {
    if (!preview) return null;
    const type = (preview.contentType as any) || (preview.blocks ? 'blocks' : preview.markdown ? 'markdown' : 'html');
    if (type === 'blocks') return { type: 'blocks' as const, blocks: preview.blocks, actions: preview.actions as any };
    if (type === 'markdown') return { type: 'markdown' as const, markdown: preview.markdown, actions: preview.actions as any };
    return { type: 'html' as const, html: preview.html, actions: preview.actions as any };
  }, [preview]);

  const dummyContext = useMemo(() => ({
    id: 0,
    name: 'preview',
    kind: 'docker',
    status: 'running',
    template_id: 0,
    template_name: 'preview',
    node_id: 0,
    node_name: 'preview',
    owner_id: null,
    owner_name: null,
    config: {},
    external_id: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }), []);

  return (
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section A · Templates</h4>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white">Start from a functional template</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every template is a complete working page built only on the page SDK — the same building blocks you can edit by hand.
            Includes conversions of all built-in panel pages plus VM &amp; container operator essentials and Minecraft tooling.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search templates…"
          className={`${glassFieldClass} max-w-[220px]`}
        />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {categories.map((c) => {
          const isActive = c === category;
          const count = c === 'all' ? PAGE_STARTERS.length : PAGE_STARTERS.filter((s) => s.category === c).length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-xs border transition ${isActive ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
              title={`${count} template(s)`}
            >
              {c === 'all' ? 'All' : c} <span className="opacity-60">· {count}</span>
            </button>
          );
        })}
        <span className="text-[11px] text-gray-500 ml-1">Filter by category — minecraft shows 4 starters (mc-properties / mc-players / mc-world / mc-plugins).</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => (
          <article key={s.id} className="ks-card rounded-xl p-4 flex flex-col gap-2 hover:border-white/25 transition-colors">
            <header className="flex items-start gap-2.5">
              <span className="shrink-0 inline-flex w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300 items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: s.iconSvg }} /></svg>
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-white truncate">{s.name}</h4>
                <p className="text-[11px] text-gray-500 truncate font-mono">/{s.slug}</p>
              </div>
            </header>
            <p className="text-xs text-gray-400 leading-relaxed flex-1">{s.description}</p>
            <footer className="flex items-center justify-between pt-1 gap-1">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{s.category}</span>
                {!!s.actions?.length && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-700/50 bg-sky-900/30 text-sky-300" title={`${s.actions.length} saved action(s) included`}>
                    ⚡ {s.actions.length} action{s.actions.length === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPreview(preview?.id === s.id ? null : s)}
                  className={`px-2.5 py-1.5 text-xs rounded border ${preview?.id === s.id ? 'bg-sky-600 text-white border-sky-500' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}`}
                  title="Preview via CustomPageView blocks + ThemePreview"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  Use template
                </button>
              </span>
            </footer>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-gray-500">No templates match “{query}”{category !== 'all' ? ` in ${category}` : ''}.</p>
      )}

      {preview && previewContent && (
        <div className="ks-card p-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-semibold text-white">Preview: {preview.name} <span className="font-mono text-xs text-gray-500">/{preview.slug} · {preview.category}</span></h4>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-white">Close preview</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
            <div className="min-w-0 border border-white/10 rounded-lg overflow-hidden bg-black/20 p-2">
              <CustomPageView content={previewContent as any} title={preview.name} instanceContext={dummyContext as any} pageSlug={preview.slug} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500">ThemePreview for active theme — instance pages bake --ks-* tokens so this preview matches live InstancePanel rendering (CustomPageView.tsx:11).</p>
              <ThemePreview theme={theme as any} />
              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-mono text-[11px]">content_type: {(preview.contentType as string) || (preview.blocks ? 'blocks' : 'html')}</p>
                <p>Actions: {preview.actions?.map((a) => `${a.name}(${a.type}${a.open_args ? ', open_args' : ''})`).join(', ') || 'none'}</p>
                <p>Icon inner svg plain (sanitizeSvgIcon 10-pass) — validated name≤200 slug≤64 content≤1MiB icon≤16KiB actions≤64KiB.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
