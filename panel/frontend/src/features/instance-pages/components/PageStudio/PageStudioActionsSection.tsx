// PageStudioActionsSection — "Actions" tab
//
// Mirrors TemplateActionsSection's card UX: one GlassCard per action with a
// collapse affordance, type switch (shell/file/docker/…) and a "Test execute"
// path that hits ExecutePageAction against the bound preview instance.
// Actions are persisted with the page so pages can run them via
// KSPageSDK.runAction(name); action-button blocks reference them by name.

import React, { useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { ActionRow } from '@/features/instance-pages/types/pageStudio';
import type { InstancePageAction } from '@/shared/api/admin';

export interface PageStudioActionsSectionProps {
  actions: ActionRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ActionRow>) => void;
  onTest: (row: ActionRow) => void;
  // Execution / preview plumbing
  pageId: number | null;
  previewInstanceId: number | null;
  onPreviewInstanceChange?: (id: number | null) => void;
  instances?: Array<{ id: number; name: string; display_name?: string; kind: string; status: string }>;
  executingAction: string | null;
  actionResult: { id: string; stdout: string; stderr: string; exit_code: number } | null;
  sectionCls: string;
}

export const PageStudioActionsSection: React.FC<PageStudioActionsSectionProps> = ({
  actions,
  onAdd,
  onRemove,
  onUpdate,
  onTest,
  pageId,
  previewInstanceId,
  onPreviewInstanceChange,
  instances,
  executingAction,
  actionResult,
  sectionCls,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section D · Actions (on-demand)</h4>
          <p className="text-xs text-gray-500">Actions are persisted with this page. Pages can run them via <code>KSPageSDK.runAction(name)</code>; Action-button blocks reference them by name.</p>
        </div>
        <button type="button" onClick={onAdd} className="ks-btn-header ks-icon-btn" aria-label="Add action" title="Add action">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {!pageId && (
        <p className="text-xs text-amber-300">Save the page to enable test-execution; editing and saving work right away.</p>
      )}
      {onPreviewInstanceChange && instances && (
        <label className="block">
          <span className="text-xs text-gray-400">Test instance (same target as the Preview tab)</span>
          <select
            value={previewInstanceId ?? ''}
            onChange={(e) => onPreviewInstanceChange(e.target.value ? Number(e.target.value) : null)}
            className={`${glassFieldClass} min-w-[220px] mt-1`}
          >
            <option value="">— none (pick one to test) —</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                #{i.id} {i.display_name || i.name} ({i.kind}, {i.status})
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-4">
        {actions.length === 0 && (
          <p className="text-sm text-gray-500 border border-dashed border-white/10 rounded-lg p-4 text-center">
            No actions yet — click <span className="text-gray-300">+</span> to add one.
          </p>
        )}
        {actions.map((action, idx) => {
          const isEditing = editingId === action.id;
          return (
            <GlassCard variant="form" key={action.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-white truncate">Action #{idx + 1}</span>
                  {action.name.trim() && (
                    <span className="font-mono text-[11px] text-gray-500 truncate">{action.name}</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{action.type}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onTest(action)}
                    disabled={!pageId || !previewInstanceId || executingAction === action.id}
                    title={!pageId ? 'Save the page first' : !previewInstanceId ? 'Pick a test instance on Preview' : 'Run against selected instance'}
                    className="ks-btn-header ks-icon-btn disabled:opacity-50"
                    aria-label="Test action"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : action.id)}
                    className="ks-btn-header ks-icon-btn"
                    aria-label="Toggle edit"
                    title="Toggle edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(action.id)}
                    className="ks-btn-header ks-icon-btn"
                    aria-label="Remove action"
                    title="Remove action"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs text-gray-400">Action name *</span>
                      <input value={action.name} onChange={(e) => onUpdate(action.id, { name: e.target.value })} className={glassFieldClass} placeholder="restart_service" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400">Type</span>
                      <select value={action.type} onChange={(e) => onUpdate(action.id, { type: e.target.value as InstancePageAction['type'] })} className={glassFieldClass}>
                        <option value="shell">Shell command</option>
                        <option value="read_file">Read file</option>
                        <option value="write_file">Write file</option>
                        <option value="list_files">List directory</option>
                        <option value="docker">Docker command</option>
                        <option value="kvm">KVM/virsh command</option>
                        <option value="lxd">LXD/LXC command</option>
                      </select>
                    </label>
                  </div>

                  {(action.type === 'shell' || action.type === 'docker' || action.type === 'kvm' || action.type === 'lxd') && (
                    <>
                      <label className="block">
                        <span className="text-xs text-gray-400">{action.type === 'shell' ? 'Command' : 'Sub-command'}{action.open_args ? ' — {{args}} inserts the runtime arguments' : ''}</span>
                        <input
                          value={action.command}
                          onChange={(e) => onUpdate(action.id, { command: e.target.value })}
                          className={`${glassFieldClass} font-mono`}
                          placeholder={action.type === 'shell' ? (action.open_args ? 'docker stop {{args}}' : 'systemctl restart myservice') : 'ps / inspect / logs'}
                        />
                      </label>
                      <label className="flex items-center gap-2 mt-1 select-none">
                        <input
                          type="checkbox"
                          checked={action.open_args}
                          onChange={(e) => onUpdate(action.id, { open_args: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        <span className="text-xs text-gray-400">
                          Allow runtime arguments — pages pass up to 4 values via <code className="font-mono">runAction(name, {'{ args }'})</code>; every value is validated server-side.
                        </span>
                      </label>
                    </>
                  )}

                  {(action.type === 'read_file' || action.type === 'write_file' || action.type === 'list_files') && (
                    <label className="block">
                      <span className="text-xs text-gray-400">Path</span>
                      <input value={action.path} onChange={(e) => onUpdate(action.id, { path: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="/etc/myapp/config.yaml" />
                    </label>
                  )}

                  {action.type === 'write_file' && (
                    <label className="block">
                      <span className="text-xs text-gray-400">File content</span>
                      <textarea value={action.content} onChange={(e) => onUpdate(action.id, { content: e.target.value })} rows={5} className={`${glassFieldClass} font-mono w-full`} placeholder="Content to write…" />
                    </label>
                  )}

                  {(action.type === 'shell' || action.type === 'docker' || action.type === 'kvm' || action.type === 'lxd') && (
                    <label className="block">
                      <span className="text-xs text-gray-400">Arguments (space-separated)</span>
                      <input value={action.args} onChange={(e) => onUpdate(action.id, { args: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="--all --filter name=web" />
                    </label>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs text-gray-400">Environment variables (JSON)</span>
                      <textarea value={action.env} onChange={(e) => onUpdate(action.id, { env: e.target.value })} rows={2} className={`${glassFieldClass} font-mono text-xs`} placeholder='{"KEY": "value"}' />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400">Description</span>
                      <input value={action.description} onChange={(e) => onUpdate(action.id, { description: e.target.value })} className={glassFieldClass} placeholder="What this action does…" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="block">
                      <span className="text-xs text-gray-400">Timeout (seconds)</span>
                      <input type="number" min="1" max="300" value={action.timeout} onChange={(e) => onUpdate(action.id, { timeout: e.target.value })} className={glassFieldClass} />
                    </label>
                  </div>

                  {actionResult && actionResult.id === action.id && executingAction === null && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                      <span className={`text-xs font-mono ${actionResult.exit_code === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        Exit: {actionResult.exit_code}
                      </span>
                    </div>
                  )}

                  {actionResult?.id === action.id && (
                    <details>
                      <summary className="text-xs text-gray-400 cursor-pointer select-none">Show output</summary>
                      <pre className="mt-2 p-3 bg-black/50 border border-white/10 rounded text-xs text-gray-300 overflow-auto max-h-64 font-mono">
                        {actionResult.stdout || '(no stdout)'}
                        {actionResult.stderr && `\n--- STDERR ---\n${actionResult.stderr}`}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
