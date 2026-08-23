import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { EnvVariable } from '@/features/templates/types/templateForm';

export interface EnvVariableInput extends EnvVariable {}

export interface EnvVariablesSectionProps {
  env: EnvVariableInput[];
  onEnvUpdate: (i: number, patch: Partial<EnvVariableInput>) => void;
  onEnvAdd: () => void;
  onEnvDelete: (i: number) => void;
  onEnvMove?: (i: number, dir: -1 | 1) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateEnvVariablesSection: React.FC<EnvVariablesSectionProps> = ({
  env,
  onEnvUpdate,
  onEnvAdd,
  onEnvDelete,
  onEnvMove,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    if (onEnvMove) onEnvMove(i, dir);
  };

  const displayTagColor = (d: string) => {
    switch (d) {
      case 'text': return 'bg-sky-900/30 text-sky-300 border-sky-700/40';
      case 'number': return 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40';
      case 'select': return 'bg-amber-900/30 text-amber-300 border-amber-700/40';
      case 'checkbox': return 'bg-violet-900/30 text-violet-300 border-violet-700/40';
      default: return 'bg-white/10 text-gray-300 border-white/10';
    }
  };

  return (
    <>
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Env Variables</h4>
          <button type="button" onClick={onEnvAdd} className={addBtn} aria-label="Add variable">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {env.length === 0 && <p className="text-xs text-gray-500">No variables defined.</p>}
        <div className="space-y-3">
          {env.map((v, i) => {
            const isEditing = editingIdx === i;
            return (
              <div key={i} className="border border-white/10 rounded-md bg-black/30 overflow-hidden">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === env.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">{v.label || v.name || `Variable ${i + 1}`}</span>
                      <span className={`text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${displayTagColor(v.display)}`}>{v.display}</span>
                      <code className="text-[11px] text-gray-500 font-mono">{v.name || 'KEY'}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => onEnvDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditingIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={v.name} onChange={(e) => onEnvUpdate(i, { name: e.target.value })} placeholder="Variable name (KEY)" className={monoCls} />
                      <input value={v.label} onChange={(e) => onEnvUpdate(i, { label: e.target.value })} placeholder="Display label" className={glassFieldClass} />
                    </div>
                    <input value={v.description} onChange={(e) => onEnvUpdate(i, { description: e.target.value })} placeholder="Description" className={glassFieldClass} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Display type</label>
                        <select value={v.display} onChange={(e) => onEnvUpdate(i, { display: e.target.value as EnvVariableInput['display'] })} className={glassFieldClass}>
                          <option value="text">Text input</option>
                          <option value="number">Number input</option>
                          <option value="select">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Validation rule (regex)</label>
                        <input value={v.rule} onChange={(e) => onEnvUpdate(i, { rule: e.target.value })} placeholder="^[a-zA-Z0-9_]+$" className={monoCls} />
                      </div>
                    </div>
                    <input value={v.default} onChange={(e) => onEnvUpdate(i, { default: e.target.value })} placeholder="Default value" className={monoCls} />
                    {v.display === 'select' && (
                      <input value={v.options} onChange={(e) => onEnvUpdate(i, { options: e.target.value })} placeholder="Options (comma-separated)" className={glassFieldClass} />
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={v.prepend} onChange={(e) => onEnvUpdate(i, { prepend: e.target.value })} placeholder="prepend" className={monoCls} />
                      <input value={v.append_value} onChange={(e) => onEnvUpdate(i, { append_value: e.target.value })} placeholder="append" className={monoCls} />
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onEnvUpdate(i, { user_viewable: !v.user_viewable })} className={`relative w-9 h-5 rounded-full transition ${v.user_viewable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.user_viewable}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.user_viewable ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">User Viewable</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onEnvUpdate(i, { user_editable: !v.user_editable })} className={`relative w-9 h-5 rounded-full transition ${v.user_editable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.user_editable}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.user_editable ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">User Editable</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onEnvUpdate(i, { required: !v.required })} className={`relative w-9 h-5 rounded-full transition ${v.required ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.required}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.required ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Required</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onEnvUpdate(i, { append: !v.append })} className={`relative w-9 h-5 rounded-full transition ${v.append ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={v.append}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${v.append ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Append to command</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};