import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { InstallStep, InstallAction } from '@/features/templates/types/templateForm';

export interface InstallStepInput extends InstallStep {}

export interface InstallSectionProps {
  install: InstallStepInput[];
  onInstallUpdate: (i: number, patch: Partial<InstallStepInput>) => void;
  onInstallAdd: () => void;
  onInstallDelete: (i: number) => void;
  onInstallMove?: (i: number, dir: -1 | 1) => void;
  /** Whole-workflow budget in seconds (spec.install_timeout_sec). Empty = edge default (30 min). */
  installTimeoutS?: string;
  onInstallTimeoutUpdate?: (v: string) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateInstallSection: React.FC<InstallSectionProps> = ({
  install,
  onInstallUpdate,
  onInstallAdd,
  onInstallDelete,
  onInstallMove,
  installTimeoutS,
  onInstallTimeoutUpdate,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => { onInstallMove?.(i, dir); };

  return (
    <>
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Installation Workflow</h4>
          <button type="button" onClick={onInstallAdd} className={addBtn} aria-label="Add step">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {install.length === 0 && <p className="text-xs text-gray-500">No install steps. The edge will boot the image directly. Add steps for download/extract/setup logic before startup.</p>}
        {onInstallTimeoutUpdate && (
          <div className="mt-2 mb-3">
            <label className="block text-[11px] text-gray-500 mb-0.5">Workflow timeout (seconds, optional)</label>
            <input
              type="number"
              min="1"
              value={installTimeoutS ?? ''}
              onChange={(e) => onInstallTimeoutUpdate(e.target.value)}
              placeholder="default: 1800 (30 min)"
              className={monoCls + ' w-48'}
            />
            <p className="text-[11px] text-gray-500 mt-1">Hard deadline for the whole install workflow (all steps + retries). A big apt/pip install that outlives the default should raise this.</p>
          </div>
        )}
        <div className="space-y-3">
          {install.map((s, i) => {
            const isEditing = editingIdx === i;
            const typeTag = s.action;
            return (
              <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === install.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">#{i + 1}</span>
                      <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-sky-900/30 text-sky-300 border-sky-700/40">{typeTag}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => onInstallDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditingIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-gray-500 w-8">#{i + 1}</span>
                      <select value={s.action} onChange={(e) => onInstallUpdate(i, { action: e.target.value as InstallAction })} className={glassFieldClass + ' w-44'}>
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
                    </div>
                    {s.action === 'shell' && (
                      <input value={s.command} onChange={(e) => onInstallUpdate(i, { command: e.target.value })} placeholder="command" className={monoCls} />
                    )}
                    {s.action === 'download' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.url} onChange={(e) => onInstallUpdate(i, { url: e.target.value })} placeholder="URL" className={monoCls} />
                        <input value={s.filename} onChange={(e) => onInstallUpdate(i, { filename: e.target.value })} placeholder="save as filename" className={glassFieldClass} />
                      </div>
                    )}
                    {s.action === 'extract' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.archive} onChange={(e) => onInstallUpdate(i, { archive: e.target.value })} placeholder="archive path" className={monoCls} />
                        <input value={s.dest} onChange={(e) => onInstallUpdate(i, { dest: e.target.value })} placeholder="destination dir" className={glassFieldClass} />
                      </div>
                    )}
                    {s.action === 'move' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.from} onChange={(e) => onInstallUpdate(i, { from: e.target.value })} placeholder="from path" className={monoCls} />
                        <input value={s.to} onChange={(e) => onInstallUpdate(i, { to: e.target.value })} placeholder="to path" className={monoCls} />
                      </div>
                    )}
                    {s.action === 'write' && (
                      <div className="space-y-2">
                        <input value={s.path} onChange={(e) => onInstallUpdate(i, { path: e.target.value })} placeholder="file path" className={monoCls} />
                        <textarea value={s.content} onChange={(e) => onInstallUpdate(i, { content: e.target.value })} rows={4} placeholder="file content" className={monoCls} />
                      </div>
                    )}
                    {s.action === 'chmod' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.path} onChange={(e) => onInstallUpdate(i, { path: e.target.value })} placeholder="file path" className={monoCls} />
                        <input value={s.command} onChange={(e) => onInstallUpdate(i, { command: e.target.value })} placeholder="mode (e.g. 755)" className={glassFieldClass} />
                      </div>
                    )}
                    {s.action === 'mkdir' && (
                      <input value={s.path} onChange={(e) => onInstallUpdate(i, { path: e.target.value })} placeholder="directory path (with -p)" className={monoCls} />
                    )}
                    {s.action === 'git_clone' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={s.url} onChange={(e) => onInstallUpdate(i, { url: e.target.value })} placeholder="repo URL" className={monoCls} />
                        <input value={s.dest} onChange={(e) => onInstallUpdate(i, { dest: e.target.value })} placeholder="destination path" className={monoCls} />
                        <input value={s.branch} onChange={(e) => onInstallUpdate(i, { branch: e.target.value })} placeholder="branch (default main)" className={glassFieldClass} />
                      </div>
                    )}
                    {s.action === 'pip_install' && (
                      <input value={s.command} onChange={(e) => onInstallUpdate(i, { command: e.target.value })} placeholder="requirements / package (e.g. -r requirements.txt)" className={monoCls} />
                    )}
                    {s.action === 'npm_install' && (
                      <input value={s.command} onChange={(e) => onInstallUpdate(i, { command: e.target.value })} placeholder="package or empty to install from package.json" className={monoCls} />
                    )}
                    {s.action === 'http_check' && (
                      <input value={s.url} onChange={(e) => onInstallUpdate(i, { url: e.target.value })} placeholder="URL to check (e.g. http://localhost:8080/health)" className={monoCls} />
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs text-gray-400">Retries:
                        <input type="number" min="0" value={s.retries} onChange={(e) => onInstallUpdate(i, { retries: e.target.value })} className={glassFieldClass + ' w-16 ml-2'} />
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onInstallUpdate(i, { ignore_errors: !s.ignore_errors })} className={`relative w-9 h-5 rounded-full transition ${s.ignore_errors ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={s.ignore_errors}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${s.ignore_errors ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-sm text-gray-300">Ignore errors (continue)</span>
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
