// PageStudioConfigureSection — Configure tab for Instance Page Studio
//
// Mirrors panel/frontend/src/features/templates/components/TemplateForm/TemplateEnvVariablesSection.tsx
// but for page-level configure vars (page's own env-style variables, like template env).
// Each var: name, label, description, default, user_viewable/user_editable/required,
// rule, display (text/number/select/checkbox), options, append/prepend.
// Persisted as instance_pages.configure JSON array -> spec.pages[].configure.

import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { ConfigureRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioConfigureSectionProps {
  configure: ConfigureRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ConfigureRow>) => void;
  onMove?: (id: string, dir: -1 | 1) => void;
  sectionCls: string;
}

export const PageStudioConfigureSection: React.FC<PageStudioConfigureSectionProps> = ({
  configure,
  onAdd,
  onRemove,
  onUpdate,
  onMove,
  sectionCls,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  const displayTagColor = (d: string) => {
    switch (d) {
      case 'text': return 'bg-sky-900/30 text-sky-300 border-sky-700/40';
      case 'number': return 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40';
      case 'select': return 'bg-amber-900/30 text-amber-300 border-amber-700/40';
      case 'checkbox': return 'bg-violet-900/30 text-violet-300 border-violet-700/40';
      case 'toggle': return 'bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/40';
      default: return 'bg-white/10 text-gray-300 border-white/10';
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    if (onMove) onMove(id, dir);
  };

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Configure</h4>
          <p className="text-xs text-gray-500 mt-0.5">Page-level variables — like template Env Variables. Authors define them here; operators fill values per template (Configure button).</p>
        </div>
        <button type="button" onClick={onAdd} className="text-xs text-sky-300 hover:text-sky-200 underline">
          + Add variable
        </button>
      </div>
      {configure.length === 0 && <p className="text-xs text-gray-500">No variables defined. Add one to let templates configure this page.</p>}
      <div className="space-y-3">
        {configure.map((v, i) => {
          const isEditing = editingId === v.id;
          return (
            <div key={v.id} className="ks-card ks-form-card rounded-md overflow-hidden">
              <div className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" aria-label="Move up" onClick={() => move(v.id, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => move(v.id, 1)} disabled={i === configure.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{v.label || v.name || `Variable ${i + 1}`}</span>
                    <span className={`text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${displayTagColor(v.display)}`}>{v.display}</span>
                    <code className="text-[11px] text-gray-500 font-mono">{v.name || 'KEY'}</code>
                  </div>
                  {v.description && <p className="text-[11px] text-gray-500 truncate mt-0.5">{v.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => onRemove(v.id)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                  <button type="button" onClick={() => setEditingId(isEditing ? null : v.id)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={v.name} onChange={(e) => onUpdate(v.id, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="Variable name (KEY)" className={`${glassFieldClass} font-mono`} />
                    <input value={v.label} onChange={(e) => onUpdate(v.id, { label: e.target.value })} placeholder="Display label" className={glassFieldClass} />
                  </div>
                  <input value={v.description} onChange={(e) => onUpdate(v.id, { description: e.target.value })} placeholder="Description" className={glassFieldClass} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Display type</label>
                      <select value={v.display} onChange={(e) => onUpdate(v.id, { display: e.target.value as ConfigureRow['display'] })} className={glassFieldClass}>
                        <option value="text">Text input</option>
                        <option value="number">Number input</option>
                        <option value="select">Dropdown</option>
                        <option value="checkbox">Checkbox</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Validation rule (regex)</label>
                      <input value={v.rule} onChange={(e) => onUpdate(v.id, { rule: e.target.value })} placeholder="^[a-zA-Z0-9_]+$" className={`${glassFieldClass} font-mono`} />
                    </div>
                  </div>
                  <input value={v.default} onChange={(e) => onUpdate(v.id, { default: e.target.value })} placeholder="Default value" className={`${glassFieldClass} font-mono`} />
                  {v.display === 'select' && (
                    <input value={v.options} onChange={(e) => onUpdate(v.id, { options: e.target.value })} placeholder="Options (comma-separated)" className={glassFieldClass} />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={v.prepend} onChange={(e) => onUpdate(v.id, { prepend: e.target.value })} placeholder="prepend" className={`${glassFieldClass} font-mono`} />
                    <input value={v.append_value} onChange={(e) => onUpdate(v.id, { append_value: e.target.value })} placeholder="append" className={`${glassFieldClass} font-mono`} />
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => onUpdate(v.id, { user_viewable: !v.user_viewable })} className={`relative w-9 h-5 rounded-full transition ${v.user_viewable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.user_viewable}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.user_viewable ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="text-sm text-gray-300">User Viewable</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => onUpdate(v.id, { user_editable: !v.user_editable })} className={`relative w-9 h-5 rounded-full transition ${v.user_editable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.user_editable}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.user_editable ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="text-sm text-gray-300">User Editable</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => onUpdate(v.id, { required: !v.required })} className={`relative w-9 h-5 rounded-full transition ${v.required ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.required}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.required ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="text-sm text-gray-300">Required</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => onUpdate(v.id, { append: !v.append })} className={`relative w-9 h-5 rounded-full transition ${v.append ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.append}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.append ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="text-sm text-gray-300">Append to command</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-500">Use <code className="font-mono">{"{{config:NAME}}"}</code> in page content to render the value entered per template. The template&apos;s Configure button collects values for these vars.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
