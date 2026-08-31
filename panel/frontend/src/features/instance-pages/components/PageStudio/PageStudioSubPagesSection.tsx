// PageStudioSubPagesSection — "Sub-pages" tab
//
// Mirrors TemplateActionsSection's card UX: each sub-page is a collapsible
// ks-card with header + dropdown body (click chevron to expand), same as
// /templates/new → Actions tab.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { SubPageRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioSubPagesSectionProps {
  subs: SubPageRow[];
  editingSubId: string | null;
  onEditingChange: (id: string | null) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SubPageRow>) => void;
  onRemove: (id: string) => void;
  onMove?: (idx: number, dir: -1 | 1) => void;
  pageSlug?: string;
  sectionCls: string;
}

export const PageStudioSubPagesSection: React.FC<PageStudioSubPagesSectionProps> = ({
  subs,
  editingSubId,
  onEditingChange,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  pageSlug,
  sectionCls,
}) => {
  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section C · Sub-pages</h4>
          <p className="text-xs text-gray-500">
            Extra routes shipped with this page — each becomes{' '}
            <code className="font-mono">/{pageSlug?.trim() || 'slug'}/&lt;path&gt;</code>{' '}
            when the page is linked to a template or imported (e.g. a Files manager with an editor at /files/edit).
          </p>
        </div>
        <button type="button" onClick={onAdd} className="ks-btn-header ks-icon-btn" aria-label="Add sub-page" title="Add sub-page">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {subs.length === 0 && (
        <p className="text-xs text-gray-500">No sub-pages yet. Add one to give this page extra routes.</p>
      )}

      <div className="space-y-4">
        {subs.map((sub, idx) => {
          const isEditing = editingSubId === sub.id;
          const subContent = sub.content_type === 'html' ? sub.content_html : sub.content_type === 'markdown' ? sub.content_markdown : sub.content_blocks;
          const updateSubContent = (value: string) => {
            if (sub.content_type === 'html') onUpdate(sub.id, { content_html: value });
            else if (sub.content_type === 'markdown') onUpdate(sub.id, { content_markdown: value });
            else onUpdate(sub.id, { content_blocks: value });
          };
          return (
            <div key={sub.id} className="ks-card ks-form-card rounded-md overflow-hidden">
              <div className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" aria-label="Move up" onClick={() => onMove?.(idx, -1)} disabled={idx === 0} className="ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => onMove?.(idx, 1)} disabled={idx === subs.length - 1} className="ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{sub.name.trim() || sub.path.trim() || `Sub-page ${idx + 1}`}</span>
                    <code className="text-[11px] text-gray-500 font-mono">/{pageSlug?.trim() || 'slug'}/{sub.path.trim() || '…'}</code>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => onRemove(sub.id)} className="ks-btn-header ks-icon-btn" aria-label="Remove sub-page" title="Remove sub-page">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                  <button type="button" onClick={() => onEditingChange(isEditing ? null : sub.id)} className="ks-btn-header ks-icon-btn" aria-label="Toggle sub-page editor" title="Toggle editor">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs text-gray-400">Path * (becomes /{'{slug}'}/path)</span>
                      <input
                        value={sub.path}
                        onChange={(e) => onUpdate(sub.id, { path: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                        className={`${glassFieldClass} font-mono`}
                        placeholder="edit"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400">Display name *</span>
                      <input value={sub.name} onChange={(e) => onUpdate(sub.id, { name: e.target.value })} className={glassFieldClass} placeholder="Editor" />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Content type</label>
                    <select
                      value={sub.content_type}
                      onChange={(e) => onUpdate(sub.id, { content_type: e.target.value as any })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white"
                    >
                      <option value="html">HTML</option>
                      <option value="markdown">Markdown</option>
                      <option value="blocks">Visual Blocks</option>
                    </select>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
