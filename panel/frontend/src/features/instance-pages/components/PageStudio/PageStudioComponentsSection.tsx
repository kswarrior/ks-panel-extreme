import React, { useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sectionCls } from '@/features/instance-pages/types/pageStudio';
import type { ComponentRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioComponentsSectionProps {
  components: ComponentRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ComponentRow>) => void;
  sectionCls?: string;
}

export const PageStudioComponentsSection: React.FC<PageStudioComponentsSectionProps> = ({
  components,
  onAdd,
  onRemove,
  onUpdate,
  sectionCls: cls = sectionCls,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className={cls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Components</h4>
          <p className="text-xs text-gray-500">Reusable page components. Reference them in content with <code className="text-gray-400">{"{{component:name}}"}</code>.</p>
        </div>
        <button type="button" onClick={onAdd} className="ks-btn-header ks-icon-btn" aria-label="Add component" title="Add component">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div className="space-y-4">
        {components.map((c, idx) => {
          const isEditing = editingId === c.id;
          return (
            <GlassCard variant="form" key={c.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-white truncate">Component #{idx + 1}</span>
                  {c.name.trim() && <span className="font-mono text-[11px] text-gray-500 truncate">{c.name}</span>}
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{c.type}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setEditingId(isEditing ? null : c.id)} className="ks-btn-header ks-icon-btn" aria-label="Toggle component editor" title="Toggle editor">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <button type="button" onClick={() => onRemove(c.id)} className="ks-btn-header ks-icon-btn" aria-label="Remove component" title="Remove component">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs text-gray-400">Component name *</span>
                      <input value={c.name} onChange={(e) => onUpdate(c.id, { name: e.target.value })} className={glassFieldClass} placeholder="header_nav" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400">Type</span>
                      <select value={c.type} onChange={(e) => onUpdate(c.id, { type: e.target.value as ComponentRow['type'] })} className={glassFieldClass}>
                        <option value="html">HTML</option>
                        <option value="markdown">Markdown</option>
                        <option value="block">Block JSON</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-400">Description</span>
                    <input value={c.description} onChange={(e) => onUpdate(c.id, { description: e.target.value })} className={glassFieldClass} placeholder="Reusable header for all pages" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Content</span>
                    <textarea value={c.content} onChange={(e) => onUpdate(c.id, { content: e.target.value })} rows={6} className={`${glassFieldClass} font-mono`} placeholder="<div>...</div>" />
                  </label>
                </div>
              )}
            </GlassCard>
          );
        })}
        {components.length === 0 && (
          <div className="p-4 border border-dashed border-white/10 rounded-lg text-center text-sm text-gray-500">
            No components defined yet. Add a component to reuse UI blocks across this page.
          </div>
        )}
      </div>
    </div>
  );
};
