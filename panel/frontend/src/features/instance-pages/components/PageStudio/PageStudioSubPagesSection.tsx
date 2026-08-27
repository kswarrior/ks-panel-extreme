// PageStudioSubPagesSection — "Sub-pages" tab
//
// Mirrors TemplateEnvironmentSection's card UX: each sub-page is a
// collapsible GlassCard with Path/Name/content-type and a per-page editor.
// The extra route ships as "<slug>/<path>" so it never leaks into the
// instance tab bar as a separate top-level page.

import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { SubPageRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioSubPagesSectionProps {
  subs: SubPageRow[];
  editingSubId: string | null;
  onEditingChange: (id: string | null) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SubPageRow>) => void;
  onRemove: (id: string) => void;
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
  pageSlug,
  sectionCls,
}) => {
  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section C · Sub-pages</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Extra routes shipped with this page — each becomes{' '}
            <code className="font-mono">/{pageSlug?.trim() || 'slug'}/&lt;path&gt;</code>{' '}
            when the page is linked to a template or imported (e.g. a Files manager with an editor at /files/edit).
          </p>
        </div>
        <button type="button" onClick={onAdd} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-500">
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
          if (sub.content_type === 'html') onUpdate(sub.id, { content_html: value });
          else if (sub.content_type === 'markdown') onUpdate(sub.id, { content_markdown: value });
          else onUpdate(sub.id, { content_blocks: value });
        };
        return (
          <GlassCard key={sub.id} className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <span className="font-mono text-[11px] text-sky-300">/{pageSlug?.trim() || 'slug'}/{sub.path.trim() || '…'}</span>
                {sub.name.trim() && <span className="text-gray-400">· {sub.name}</span>}
              </h4>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onEditingChange(isEditing ? null : sub.id)} className="ks-ghost-btn px-3 py-1.5 text-xs border border-white/10 rounded hover:bg-white/5">
                  {isEditing ? 'Collapse' : 'Edit'}
                </button>
                <button type="button" onClick={() => onRemove(sub.id)} className="text-red-400 hover:text-red-200 text-sm">Remove</button>
              </div>
            </div>

            {isEditing && (
              <>
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

                <div>
                  <label className="block text-xs text-gray-400 mb-2">Content type</label>
                  <div className="flex gap-2">
                    {(['html', 'markdown', 'blocks'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onUpdate(sub.id, { content_type: t })}
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
  );
};
