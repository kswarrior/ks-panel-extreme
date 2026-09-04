import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { ICON_PRESETS, COLOR_SWATCHES } from '@/features/instances/types/instanceForm';
import type { TemplateAction, ActionStep, InstallAction } from '@/features/templates/types/templateForm';

export interface TemplateActionInput extends TemplateAction {}
export interface ActionStepInput extends ActionStep {}

export interface ActionsSectionProps {
  actions: TemplateActionInput[];
  onActionUpdate: (i: number, patch: Partial<TemplateActionInput>) => void;
  onActionAdd: () => void;
  onActionDelete: (i: number) => void;
  onActionMove?: (i: number, dir: -1 | 1) => void;
  onActionStepUpdate: (actionIdx: number, stepIdx: number, patch: Partial<ActionStepInput>) => void;
  onActionStepAdd: (actionIdx: number) => void;
  onActionStepDelete: (actionIdx: number, stepIdx: number) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateActionsSection: React.FC<ActionsSectionProps> = ({
  actions,
  onActionUpdate,
  onActionAdd,
  onActionDelete,
  onActionMove,
  onActionStepUpdate,
  onActionStepAdd,
  onActionStepDelete,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => { onActionMove?.(i, dir); };

  // Known instance states for the allowed-states chips. Toggling a chip
  // edits the same CSV string the text input holds — empty means "every
  // state" at runtime.
  const ACTION_STATES = ['running', 'stopped', 'creating', 'installing', 'errored', 'install_failed', 'destroyed'];
  const toggleActionState = (idx: number, st: string) => {
    const cur = (actions[idx]?.allowed_states || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const next = cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st];
    onActionUpdate(idx, { allowed_states: next.join(', ') });
  };

  // Sanitized action icon (full <svg> or inner markup — same handling as
  // the instance tab bar). Falls back to null so callers show a glyph.
  const actionIcon = (svg: string | undefined, color: string | undefined, boxCls: string, svgCls: string) => {
    const s = svg ? sanitizeSvgIcon(svg) : '';
    if (!s) return null;
    const style = color ? { color } : undefined;
    if (s.trim().toLowerCase().startsWith('<svg')) {
      return <span className={boxCls} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: s }} />;
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={svgCls} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: s }} />
    );
  };

  return (
    <>
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section D · Actions (on-demand)</h4>
            <p className="text-xs text-gray-500">Triggered by id after an instance exists. Unlike Install Workflow, Actions don't run on create unless <code className="text-gray-400">run_on_create</code> is set.</p>
          </div>
          <button type="button" onClick={onActionAdd} className={addBtn} aria-label="Add action">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {actions.length === 0 && <p className="text-xs text-gray-500">No actions defined. Example: <code className="text-gray-400">id=start</code>, shell <code className="text-gray-400">/entrypoint.sh</code>.</p>}
        <div className="space-y-4">
          {actions.map((a, i) => {
            const isEditing = editingIdx === i;
            return (
              <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === actions.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {actionIcon(a.icon_svg, a.icon_color, 'w-6 h-6 shrink-0 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block', 'w-4 h-4 shrink-0')}
                      <span className="text-sm font-semibold text-white truncate">{a.name || a.id || `Action ${i + 1}`}</span>
                      <code className="text-[11px] text-gray-500 font-mono">{a.id || 'id'}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => onActionDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditingIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Action ID * (lowercase, snake_case)</label>
                        <input value={a.id} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); onActionUpdate(i, { id: v }); }} placeholder="start_server" className={monoCls + ' border-emerald-700/40 focus:border-emerald-400'} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Display name</label>
                        <input value={a.name} onChange={(e) => onActionUpdate(i, { name: e.target.value })} placeholder="Start Server" className={glassFieldClass} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Description</label>
                      <input value={a.description} onChange={(e) => onActionUpdate(i, { description: e.target.value })} placeholder="Boot the Java process and patch the world seed" className={glassFieldClass} />
                    </div>
                    <div className="pt-1">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Icon & colour (shown on action tiles and menus)</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center border bg-white/[0.05] border-white/10 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:block"
                          style={a.icon_color ? { color: a.icon_color } : undefined}
                          aria-hidden="true"
                        >
                          {actionIcon(a.icon_svg, a.icon_color, 'flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:block', 'w-5 h-5') || (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-500"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                          )}
                        </span>
                        <div className="flex gap-1.5 overflow-x-auto ks-hscroll pb-1 flex-1 min-w-0">
                          {ICON_PRESETS.map((p) => (
                            <button
                              key={p.value || 'none'}
                              type="button"
                              onClick={() => onActionUpdate(i, { icon_svg: p.svg })}
                              className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${a.icon_svg === p.svg ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                              title={p.label || 'No icon'}
                            >
                              {p.svg ? (
                                <span className="[&>svg]:w-4 [&>svg]:h-4 [&>svg]:block" dangerouslySetInnerHTML={{ __html: p.svg }} />
                              ) : (
                                <span className="text-[11px] text-gray-400 px-0.5">∅</span>
                              )}
                              <span className="text-[11px] text-gray-300">{p.label || 'None'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        <input value={a.icon_svg || ''} onChange={(e) => onActionUpdate(i, { icon_svg: e.target.value })} placeholder="…or paste custom SVG markup" className={monoCls} />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c.value || 'none'}
                              type="button"
                              onClick={() => onActionUpdate(i, { icon_color: c.value })}
                              className={`shrink-0 w-6 h-6 rounded-md border transition-transform ${a.icon_color === c.value ? 'border-white scale-105' : 'border-white/10 hover:border-white/30'}`}
                              style={{ backgroundColor: c.value || 'transparent' }}
                              title={c.label || 'No colour'}
                            />
                          ))}
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(a.icon_color || '') ? (a.icon_color as string) : '#a78bfa'}
                            onChange={(e) => onActionUpdate(i, { icon_color: e.target.value })}
                            className="w-6 h-6 rounded-md border border-white/10 cursor-pointer bg-transparent p-0"
                            title="Custom colour"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-1">
                        <label className="block text-[11px] text-gray-500 mb-0.5">Allowed states (csv — empty = every state)</label>
                        <input value={a.allowed_states} onChange={(e) => onActionUpdate(i, { allowed_states: e.target.value })} placeholder="running, stopped" className={monoCls} />
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          {ACTION_STATES.map((st) => {
                            const on = (a.allowed_states || '').split(',').map((x) => x.trim().toLowerCase()).includes(st);
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => toggleActionState(i, st)}
                                aria-pressed={on}
                                title={on ? `Remove ${st}` : `Only in ${st}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-gray-500 hover:border-white/25 hover:text-gray-300'}`}
                              >
                                {st}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Cooldown (s)</label>
                        <input type="number" min="0" value={a.cooldown_s} onChange={(e) => onActionUpdate(i, { cooldown_s: e.target.value })} placeholder="0" className={monoCls} />
                      </div>
                      <div className="flex items-end">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <button type="button" onClick={() => onActionUpdate(i, { user_invokable: !a.user_invokable })} className={`relative w-9 h-5 rounded-full transition ${a.user_invokable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.user_invokable}>
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.user_invokable ? 'translate-x-4' : ''}`} />
                          </button>
                          <span className="text-sm text-gray-300">Users can invoke</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { requires_online: !a.requires_online })} className={`relative w-9 h-5 rounded-full transition ${a.requires_online ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.requires_online}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.requires_online ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Requires online</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { async_run: !a.async_run })} className={`relative w-9 h-5 rounded-full transition ${a.async_run ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.async_run}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.async_run ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Async / stream</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { run_on_create: !a.run_on_create })} className={`relative w-9 h-5 rounded-full transition ${a.run_on_create ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.run_on_create}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.run_on_create ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Run on create</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Session type</label>
                        <select value={a.session} onChange={(e) => onActionUpdate(i, { session: e.target.value as TemplateActionInput['session'] })} className={glassFieldClass}>
                          <option value="long_running">long_running — bot/server keeps the instance alive (auto start+stop)</option>
                          <option value="console_session">console_session — in-game RCON-only (filter commands, no apt/sudo)</option>
                          <option value="vm_full">vm_full — pass straight to VM/shell (full VPS access)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">Max runtime (s, optional)</label>
                        <input type="number" min="0" value={a.max_runtime_s} onChange={(e) => onActionUpdate(i, { max_runtime_s: e.target.value })} placeholder="no limit" className={monoCls} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { auto_start_instance: !a.auto_start_instance })} className={`relative w-9 h-5 rounded-full transition ${a.auto_start_instance ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.auto_start_instance}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.auto_start_instance ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Auto-start instance</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { auto_stop_on_exit: !a.auto_stop_on_exit })} className={`relative w-9 h-5 rounded-full transition ${a.auto_stop_on_exit ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.auto_stop_on_exit}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.auto_stop_on_exit ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Auto-stop on exit</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onActionUpdate(i, { restart_on_failure: !a.restart_on_failure })} className={`relative w-9 h-5 rounded-full transition ${a.restart_on_failure ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={a.restart_on_failure}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${a.restart_on_failure ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Restart on crash</span>
                      </label>
                    </div>
                    <div className="pt-1">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Stop command (optional, runs on Stop-click inside the container)</label>
                      <input value={a.stop_command} onChange={(e) => onActionUpdate(i, { stop_command: e.target.value })} placeholder="e.g. pkill -f java; sleep 1" className={monoCls} />
                    </div>
                    <div className="pt-1">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Stop mode</label>
                      <select value={a.stop_mode} onChange={(e) => onActionUpdate(i, { stop_mode: e.target.value as 'same' | 'different' })} className={glassFieldClass}>
                        <option value="different">Different terminal — exec a new shell (pkill, systemctl stop, etc.)</option>
                        <option value="same">Same terminal — write to running process stdin (Minecraft "stop", etc.)</option>
                      </select>
                      <p className="text-[11px] text-gray-500 mt-1"><code>same</code>: sends the command to the process's console (e.g. Minecraft reads "stop" from stdin). <code>different</code>: runs a separate exec (e.g. pkill -f java).</p>
                    </div>
                    {a.session === 'console_session' && (
                      <div className="space-y-2 pt-1">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Allowed commands (regex, one per line; empty = all verbs)</label>
                          <textarea rows={3} value={a.allowed_commands} onChange={(e) => onActionUpdate(i, { allowed_commands: e.target.value })} placeholder={`^tps$\n^tp\\s+\\w+($|\\s)\n^say\\s.+\n^give\\s+\\w+\\s.*`} className={monoCls + ' text-emerald-200'} />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Blocked commands (comma-separated, defence-in-depth)</label>
                          <input value={a.blocked_commands} onChange={(e) => onActionUpdate(i, { blocked_commands: e.target.value })} placeholder="apt sudo reboot shutdown rm mkfs" className={monoCls + ' text-red-300'} />
                        </div>
                        <p className="text-[11px] text-gray-500">In console_session mode the edge validates the user's input against these regexes before forwarding. RCON verbs like <code>tps</code>/<code>tp</code>/<code>say</code> get through; <code>apt update</code>/<code>reboot</code>/<code>rm -rf</code> never reach the VM.</p>
                      </div>
                    )}
                    {a.session === 'long_running' && (<p className="text-[11px] text-gray-500">long_running: edge boots the instance when this action fires, runs the steps once, then keeps the foreground process alive. When the main process exits, the instance is stopped automatically (or restarted if "Restart on crash" is on).</p>)}
                    {a.session === 'vm_full' && (<p className="text-[11px] text-gray-500">vm_full: edge gives you a raw LXD/KVM/multipass console. Everything the user types is forwarded as-is. Use only when you trust the user (typically admin-only).</p>)}
                    <div className="pl-3 border-l-2 border-emerald-700/40 space-y-3 mt-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Action Steps</h5>
                        <button type="button" onClick={() => onActionStepAdd(i)} className="text-emerald-300 hover:text-emerald-100 p-1" aria-label="Add step">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      </div>
                      {a.steps.map((s, j) => (
                        <div key={j} className="ks-card ks-form-card rounded-md space-y-2">
                          <div className="flex gap-2 items-center">
                            <span className="text-xs text-gray-500 w-12">#{j + 1}</span>
                             <select value={s.action} onChange={(e) => onActionStepUpdate(i, j, { action: e.target.value as InstallAction })} className={glassFieldClass + ' w-44'}>
                               <option value="shell">Shell Command</option>
                               <option value="download">Download File</option>
                               <option value="extract">Extract Archive</option>
                               <option value="move">Move/Copy File</option>
                               <option value="write">Write File</option>
                               <option value="chmod">Set Permissions (chmod)</option>
                               <option value="mkdir">Create Directory</option>
                               <option value="git_clone">Git Clone Repo</option>
                               <option value="pip_install">Pip Install (Python)</option>
                               <option value="npm_install">NPM Install (Node.js)</option>
                               <option value="http_check">HTTP Health Check</option>
                             </select>
                             <button type="button" onClick={() => onActionStepDelete(i, j)} className="ml-auto text-red-400 hover:text-red-200 p-1" aria-label="Remove step">
                               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                             </button>
                          </div>
                          {s.action === 'shell' && (<input value={s.command} onChange={(e) => onActionStepUpdate(i, j, { command: e.target.value })} placeholder="/entrypoint.sh --config {{CONFIG_PATH}}" className={monoCls} />)}
                          {s.action === 'download' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={s.url} onChange={(e) => onActionStepUpdate(i, j, { url: e.target.value })} placeholder="URL" className={monoCls} />
                              <input value={s.filename} onChange={(e) => onActionStepUpdate(i, j, { filename: e.target.value })} placeholder="save as filename" className={glassFieldClass} />
                            </div>
                          )}
                          {s.action === 'extract' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={s.archive} onChange={(e) => onActionStepUpdate(i, j, { archive: e.target.value })} placeholder="archive path" className={monoCls} />
                              <input value={s.dest} onChange={(e) => onActionStepUpdate(i, j, { dest: e.target.value })} placeholder="destination dir" className={glassFieldClass} />
                            </div>
                          )}
                          {s.action === 'move' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={s.from} onChange={(e) => onActionStepUpdate(i, j, { from: e.target.value })} placeholder="from path" className={monoCls} />
                              <input value={s.to} onChange={(e) => onActionStepUpdate(i, j, { to: e.target.value })} placeholder="to path" className={monoCls} />
                            </div>
                          )}
                          {s.action === 'write' && (
                            <div className="space-y-2">
                              <input value={s.path} onChange={(e) => onActionStepUpdate(i, j, { path: e.target.value })} placeholder="file path" className={monoCls} />
                              <textarea value={s.content} onChange={(e) => onActionStepUpdate(i, j, { content: e.target.value })} rows={4} placeholder="file content" className={monoCls} />
                            </div>
                          )}
                          {s.action === 'chmod' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={s.path} onChange={(e) => onActionStepUpdate(i, j, { path: e.target.value })} placeholder="file path" className={monoCls} />
                              <input value={s.command} onChange={(e) => onActionStepUpdate(i, j, { command: e.target.value })} placeholder="mode (e.g. 755)" className={glassFieldClass} />
                            </div>
                          )}
                          {s.action === 'mkdir' && (<input value={s.path} onChange={(e) => onActionStepUpdate(i, j, { path: e.target.value })} placeholder="directory path (with -p)" className={monoCls} />)}
                          {s.action === 'git_clone' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input value={s.url} onChange={(e) => onActionStepUpdate(i, j, { url: e.target.value })} placeholder="repo URL" className={monoCls} />
                              <input value={s.dest} onChange={(e) => onActionStepUpdate(i, j, { dest: e.target.value })} placeholder="destination path" className={monoCls} />
                              <input value={s.branch} onChange={(e) => onActionStepUpdate(i, j, { branch: e.target.value })} placeholder="branch (default main)" className={glassFieldClass} />
                            </div>
                          )}
                          {s.action === 'pip_install' && (<input value={s.command} onChange={(e) => onActionStepUpdate(i, j, { command: e.target.value })} placeholder="requirements / package" className={monoCls} />)}
                          {s.action === 'npm_install' && (<input value={s.command} onChange={(e) => onActionStepUpdate(i, j, { command: e.target.value })} placeholder="package or empty" className={monoCls} />)}
                          {s.action === 'http_check' && (<input value={s.url} onChange={(e) => onActionStepUpdate(i, j, { url: e.target.value })} placeholder="URL to check" className={monoCls} />)}
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="text-xs text-gray-400">Retries:<input type="number" min="0" value={s.retries} onChange={(e) => onActionStepUpdate(i, j, { retries: e.target.value })} className={glassFieldClass + ' w-16 ml-2'} /></label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <button type="button" onClick={() => onActionStepUpdate(i, j, { ignore_errors: !s.ignore_errors })} className={`relative w-9 h-5 rounded-full transition ${s.ignore_errors ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={s.ignore_errors}>
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${s.ignore_errors ? 'translate-x-4' : ''}`} />
                              </button>
                              <span className="text-sm text-gray-300">Ignore errors (continue)</span>
                            </label>
                          </div>
                        </div>
                      ))}
                      {a.steps.length === 0 && <p className="text-xs text-gray-500">No steps. The action will be a no-op until you add one.</p>}
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono">Triggered via <span className="text-emerald-300">POST /api/instances/{'{id}'}/actions/{a.id || '<id>'}/invoke</span></p>
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
