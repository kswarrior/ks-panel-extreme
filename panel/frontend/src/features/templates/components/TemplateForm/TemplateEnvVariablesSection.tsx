import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { EnvVariable } from '@/features/templates/types/templateForm';

export interface EnvVariableInput extends EnvVariable {}

export interface EnvVariablesSectionProps {
  env: EnvVariableInput[];
  onEnvUpdate: (i: number, patch: Partial<EnvVariableInput>) => void;
  onEnvAdd: () => void;
  onEnvDelete: (i: number) => void;
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
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => (
  <>
    {/* Section C: Env Variables */}
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section C · Env Variables</h4>
        <button type="button" onClick={onEnvAdd} className={addBtn}>+ Variable</button>
      </div>
      {env.length === 0 && <p className="text-xs text-gray-500">No variables defined.</p>}
      <div className="space-y-3">
        {env.map((v, i) => (
          <div key={i} className="border border-white/10 rounded-md p-3 space-y-2 bg-black/30">
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
                  <option value="number">Number input (digits only</option>
                  <option value="select">Dropdown</option>
                  <option value="checkbox">Checkbox (on/off</option>
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
              <input value={v.prepend} onChange={(e) => onEnvUpdate(i, { prepend: e.target.value })} placeholder="prepend (prefix added before value)" className={monoCls} />
              <input value={v.append_value} onChange={(e) => onEnvUpdate(i, { append_value: e.target.value })} placeholder="append (suffix added after value)" className={monoCls} />
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
              <button type="button" onClick={() => onEnvDelete(i)} className="ml-auto text-xs text-red-400 hover:text-red-200">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
);