import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import type { EnvVariable } from '@/features/templates/types/templateForm';
import { ENV_VAR_SCOPES, envScopesEffective, normalizeEnvImages, normalizeEnvBehavior } from '@/features/templates/types/templateForm';

export interface EnvVariableInput extends EnvVariable {}

export interface EnvVariablesSectionProps {
  env: EnvVariableInput[];
  onEnvUpdate: (i: number, patch: Partial<EnvVariableInput>) => void;
  onEnvAdd: () => void;
  onEnvDelete: (i: number) => void;
  onEnvMove?: (i: number, dir: -1 | 1) => void;
  // Names of the template's named runtimes (spec.images[]). Used by the
  // per-var image selector; empty = single-image template (selector hidden).
  imageNames?: string[];
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
  imageNames,
  sectionCls,
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
            const isAuto = normalizeEnvBehavior((v as any).behavior) === 'auto';
            const curImgs = normalizeEnvImages((v as any).images);
            const knownImgs = imageNames ?? [];
            // Dropdown value: '__all' (default) | single runtime name |
            // '__custom' (legacy multi-select, preserved until changed).
            const imgSel = curImgs.length === 0 ? '__all' : curImgs.length === 1 ? curImgs[0] : '__custom';
            const extraImgs = curImgs.filter((c) => !knownImgs.some((k) => k.toLowerCase() === c.toLowerCase()));
            return (
              <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
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
                      {normalizeEnvBehavior((v as any).behavior) === 'auto' && (
                        <span className="text-[10px] uppercase tracking-wide border border-sky-700/40 bg-sky-950/30 text-sky-300 px-1.5 py-0.5 rounded" title="Hidden auto-set — applied with the default value, never asked">auto</span>
                      )}
                      {normalizeEnvImages((v as any).images).length > 0 && (
                        <span className="text-[10px] border border-white/10 text-gray-400 px-1.5 py-0.5 rounded" title={`Only for: ${normalizeEnvImages((v as any).images).join(', ')}`}>
                          {normalizeEnvImages((v as any).images).length === 1
                            ? normalizeEnvImages((v as any).images)[0]
                            : `${normalizeEnvImages((v as any).images).length} images`}
                        </span>
                      )}
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
                    {!isAuto && (
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
                    )}
                    <input value={v.default} onChange={(e) => onEnvUpdate(i, { default: e.target.value })} placeholder="Default value" className={monoCls} />
                    {!isAuto && v.display === 'select' && (
                      <div className="space-y-2">
                        <label className="block text-[11px] text-gray-500">Options — icon + label + value per row</label>
                        {(v.options_list ?? []).map((o, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <span
                              className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={o.svg.trim() !== '' ? { __html: sanitizeSvgIcon(o.svg) } : undefined}
                            >
                              {o.svg.trim() === '' && (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-600"><circle cx="12" cy="12" r="9" /></svg>
                              )}
                            </span>
                            <input
                              value={o.svg}
                              onChange={(e) => {
                                const rows = [...(v.options_list ?? [])];
                                rows[j] = { ...rows[j], svg: e.target.value };
                                onEnvUpdate(i, { options_list: rows });
                              }}
                              placeholder="SVG"
                              title="Option icon (SVG markup)"
                              className={monoCls + ' w-20 shrink-0'}
                            />
                            <input
                              value={o.label}
                              onChange={(e) => {
                                const rows = [...(v.options_list ?? [])];
                                rows[j] = { ...rows[j], label: e.target.value };
                                onEnvUpdate(i, { options_list: rows });
                              }}
                              placeholder="Display name"
                              title="Display name"
                              className={glassFieldClass + ' flex-1 min-w-0'}
                            />
                            <input
                              value={o.value}
                              onChange={(e) => {
                                const rows = [...(v.options_list ?? [])];
                                rows[j] = { ...rows[j], value: e.target.value };
                                onEnvUpdate(i, { options_list: rows });
                              }}
                              placeholder="value"
                              title="Stored value"
                              className={monoCls + ' flex-1 min-w-0'}
                            />
                            <button
                              type="button"
                              onClick={() => onEnvUpdate(i, { options_list: (v.options_list ?? []).filter((_, k) => k !== j) })}
                              className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-white/5 shrink-0"
                              aria-label={`Remove option ${j + 1}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => onEnvUpdate(i, { options_list: [...(v.options_list ?? []), { svg: '', label: '', value: '' }] })}
                            className="inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200 underline"
                            title="Add another value row"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 22v-5" /><path d="M9 2v6" /><path d="M15 2v6" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>
                            + Add option
                          </button>
                          {(!v.options_list || v.options_list.length === 0) && v.options.trim() !== '' && (
                            <button
                              type="button"
                              onClick={() => onEnvUpdate(i, {
                                options_list: v.options.split(',').map((s) => s.trim()).filter(Boolean).map((value) => ({ svg: '', label: '', value })),
                              })}
                              className="text-xs text-gray-400 hover:text-white underline"
                              title="Convert the legacy comma list below into rows"
                            >
                              Convert comma list ↓ to rows
                            </button>
                          )}
                        </div>
                        <input value={v.options} onChange={(e) => onEnvUpdate(i, { options: e.target.value })} placeholder="Legacy comma list (auto-synced from rows on save)" className={glassFieldClass} title="Legacy comma-separated values — kept for old readers; rows win when present" />
                      </div>
                    )}
                    {!isAuto && v.display === 'checkbox' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Value when checked</label>
                          <input value={v.checked_value ?? ''} onChange={(e) => onEnvUpdate(i, { checked_value: e.target.value })} placeholder="true" className={monoCls} />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Value when unchecked</label>
                          <input value={v.unchecked_value ?? ''} onChange={(e) => onEnvUpdate(i, { unchecked_value: e.target.value })} placeholder="false" className={monoCls} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Behaviour</label>
                        <select
                          value={normalizeEnvBehavior((v as any).behavior)}
                          onChange={(e) => onEnvUpdate(i, { behavior: e.target.value as EnvVariableInput['behavior'] })}
                          className={glassFieldClass}
                          title="ask prompts the operator at deploy; auto hides it and just applies the default (replaces the old .env / per-runtime overrides)"
                        >
                          <option value="ask">ask — prompt at deploy</option>
                          <option value="auto">auto — set silently</option>
                        </select>
                      </div>
                      {knownImgs.length > 0 && (
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Images</label>
                          <select
                            value={imgSel}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === '__custom') return;
                              onEnvUpdate(i, { images: next === '__all' ? [] : [next] } as Partial<EnvVariableInput>);
                            }}
                            className={glassFieldClass}
                            title="Which named runtimes this var applies to. All (default) = every runtime."
                          >
                            <option value="__all">All images</option>
                            {knownImgs.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                            {extraImgs.map((n) => (
                              <option key={'x:' + n} value={n}>{n}</option>
                            ))}
                            {imgSel === '__custom' && (
                              <option value="__custom">Custom ({curImgs.length} selected)</option>
                            )}
                          </select>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="block text-[11px] text-gray-500 mb-1">
                        Use in — where <code className="font-mono text-gray-400">{v.name ? `{{${v.name}}}` : '{{NAME}}'} / {v.name ? `\${${v.name}}` : '${NAME}'} / {v.name ? '$(' + v.name + ')' : '$(NAME)'}</code> gets substituted. All on = everywhere (image, install, actions, controls, pages, runtime).
                      </span>
                      <div className="flex gap-1.5 flex-wrap">
                        {ENV_VAR_SCOPES.map((s) => {
                          const on = envScopesEffective(v).includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                const cur = new Set(envScopesEffective(v));
                                if (on && cur.size === 1) return; // keep at least one
                                if (on) cur.delete(s);
                                else cur.add(s);
                                const next = [...cur];
                                onEnvUpdate(i, { scopes: next.length === ENV_VAR_SCOPES.length ? [] : next } as Partial<EnvVariableInput>);
                              }}
                              aria-pressed={on}
                              title={on ? `Remove ${s}` : `Allow in ${s}`}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-gray-500 hover:border-white/25 hover:text-gray-300'}`}
                            >
                              {s}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => onEnvUpdate(i, { scopes: [] } as Partial<EnvVariableInput>)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/25"
                          title="Allow everywhere"
                        >
                          all
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Multi-image: put <code className="font-mono text-gray-400">{'{{IMAGE}}'}</code> in the image field and make a <code className="font-mono text-gray-400">select</code> var named <code className="font-mono text-gray-400">IMAGE</code> with the images as options.
                      </p>
                    </div>
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