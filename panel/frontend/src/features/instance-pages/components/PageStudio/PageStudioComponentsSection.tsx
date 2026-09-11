import React, { useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import Modal from '@/shared/components/ui/Modal';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sectionCls } from '@/features/instance-pages/types/pageStudio';
import type { ComponentRow } from '@/features/instance-pages/types/pageStudio';
import { SHARED_PANEL_COMPONENTS, type SharedPanelComponent } from '@/features/instance-pages/sharedPanelComponents';
import { PAGE_UI_COMPONENTS } from '@/features/instance-pages/pageUIComponents';

export interface PageStudioComponentsSectionProps {
  components: ComponentRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ComponentRow>) => void;
  /** Import a panel-shared component by reference (stores name only).
   *  Accepts HTML shared entries and live-React clones alike (both carry
   *  name/label/description); clones store a type:'shared' row whose ref the
   *  React renderer maps to KSUI. */
  onImport?: (shared: Pick<SharedPanelComponent, 'name' | 'label' | 'description'>) => void;
  sectionCls?: string;
}

export const PageStudioComponentsSection: React.FC<PageStudioComponentsSectionProps> = ({
  components,
  onAdd,
  onRemove,
  onUpdate,
  onImport,
  sectionCls: cls = sectionCls,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState('');

  const importedKeys = new Set(
    components
      .filter((c) => c.type === 'shared')
      .map((c) => ((c.shared || c.name) || '').trim())
      .filter(Boolean),
  );
  // Also treat a local row with the same name as imported so the picker
  // never offers a duplicate {{component:name}} token.
  for (const c of components) {
    const n = (c.name || '').trim();
    if (n) importedKeys.add(n);
  }

  const filtered = SHARED_PANEL_COMPONENTS.filter((s) => {
    const q = importQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  });

  // Live-React clones (pageUIComponents.ts): same picker, separate list.
  // Importing one stores a type:'shared'-compatible row; the React renderer
  // maps the page_* ref to KSUI (HTML pages intentionally ignore them).
  const filteredClones = PAGE_UI_COMPONENTS.filter((s) => {
    const q = importQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.ksuiKey.toLowerCase().includes(q)
    );
  });

  const handleImport = (s: Pick<SharedPanelComponent, 'name' | 'label' | 'description'>) => {
    onImport?.(s);
    setImportOpen(false);
  };

  return (
    <div className={cls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Components</h4>
          <p className="text-xs text-gray-500">Reusable page components. Reference them in content with <code className="text-gray-400">{"{{component:name}}"}</code>. Shared imports store only the name — the panel supplies the source at render time.</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setImportOpen(true)} className="ks-btn-header ks-icon-btn" aria-label="Import panel component" title="Import panel component">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button type="button" onClick={onAdd} className="ks-btn-header ks-icon-btn" aria-label="Add component" title="Add component">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {components.map((c, idx) => {
          const isEditing = editingId === c.id;
          const isShared = c.type === 'shared';
          return (
            <GlassCard variant="form" key={c.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-white truncate">Component #{idx + 1}</span>
                  {c.name.trim() && <span className="font-mono text-[11px] text-gray-500 truncate">{c.name}</span>}
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{c.type}</span>
                  {isShared && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-sky-300">panel-shared</span>}
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
                  {isShared ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs text-gray-400">Token name *</span>
                          <input value={c.name} onChange={(e) => onUpdate(c.id, { name: e.target.value })} className={glassFieldClass} placeholder="panel_action_pill" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Panel component</span>
                          <input value={c.shared || c.name} onChange={(e) => onUpdate(c.id, { shared: e.target.value })} className={glassFieldClass} placeholder="panel_action_pill" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-xs text-gray-400">Description</span>
                        <input value={c.description} onChange={(e) => onUpdate(c.id, { description: e.target.value })} className={glassFieldClass} placeholder="Reusable panel UI" />
                      </label>
                      <p className="text-[11px] text-sky-300/80">Shared import — no source is stored. Use <code className="font-mono">{"{{component:"}{c.name.trim() || 'name'}{"}}"}</code> in content; the panel injects the latest source on every visit.</p>
                    </>
                  ) : (
                    <>
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
                            <option value="shared">Shared (panel)</option>
                            <option value="module">Module (React file — edited on the React tab)</option>
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
                    </>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
        {components.length === 0 && (
          <div className="p-4 border border-dashed border-white/10 rounded-lg text-center text-sm text-gray-500">
            No components defined yet. Add a component or import one from the panel.
          </div>
        )}
      </div>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import panel component">
        <input
          value={importQuery}
          onChange={(e) => setImportQuery(e.target.value)}
          className={glassFieldClass}
          placeholder="Search panel components…"
          aria-label="Search panel components"
        />
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {filtered.map((s) => {
            const already = importedKeys.has(s.name);
            return (
              <div key={s.name} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">{s.label} <span className="font-mono text-[11px] text-gray-500">{s.name}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                  <p className="text-[11px] text-gray-600 mt-1 font-mono">{"{{component:"}{s.name}{"}}"}</p>
                </div>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => handleImport(s)}
                  className="ks-btn-header shrink-0 px-3 py-1.5 rounded text-xs disabled:opacity-50"
                >
                  {already ? 'Added' : 'Import'}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No panel components match “{importQuery}”.</p>
          )}
          {filteredClones.length > 0 && (
            <p className="text-[11px] uppercase tracking-wide text-gray-500 pt-1">Live React · instance pages only (KSUI)</p>
          )}
          {filteredClones.map((s) => {
            const already = importedKeys.has(s.name);
            return (
              <div key={s.name} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.03]">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">{s.label} <span className="font-mono text-[11px] text-gray-500">{s.name}</span>{' '}
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">live React</span>{' '}
                    <span className="font-mono text-[11px] text-emerald-300/70">KSUI.{s.ksuiKey}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                  <p className="text-[11px] text-gray-600 mt-1 font-mono">{"{{component:"}{s.name}{"}}"}</p>
                </div>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => handleImport(s)}
                  className="ks-btn-header shrink-0 px-3 py-1.5 rounded text-xs disabled:opacity-50"
                >
                  {already ? 'Added' : 'Import'}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500">Import stores only the name — the panel supplies the source on every visit, so updates apply automatically.</p>
      </Modal>
    </div>
  );
};
