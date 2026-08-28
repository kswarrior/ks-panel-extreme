// PageStudioBlocksEditor — visual block editor for content_type='blocks'
//
// Mirrors the legacy BlocksVisualEditor that lived inside InstancePageStudio.tsx
// and follows the same card layout as templates' CustomPageStudio blocks UX.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { BlockRow } from '@/features/instance-pages/types/pageStudio';
import { BLOCK_TYPES } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioBlocksEditorProps {
  rows: BlockRow[];
  onChange: (rows: BlockRow[]) => void;
  jsonError: boolean;
  actionNames: string[];
  sectionCls?: string;
}

export const PageStudioBlocksEditor: React.FC<PageStudioBlocksEditorProps> = ({ rows, onChange, jsonError, actionNames }) => {
  const update = (i: number, patch: Partial<BlockRow>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {jsonError && (
        <p className="text-xs text-amber-300">
          The stored blocks JSON is invalid — fix it in the JSON tab to restore visual editing.
        </p>
      )}
      {rows.length === 0 && !jsonError && (
        <p className="text-xs text-gray-500">No blocks yet. Add your first block below.</p>
      )}
      {rows.map((b, i) => (
        <div key={i} className="ks-card ks-form-card rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {BLOCK_TYPES.find((t) => t.type === b.type)?.label ?? b.type}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" className="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Remove block" className="px-1.5 py-0.5 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20">✕</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[150px_1fr] gap-2 items-start">
            <select
              value={b.type}
              onChange={(e) => update(i, { type: e.target.value as BlockRow['type'] })}
              className={glassFieldClass}
            >
              {BLOCK_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>

            {(b.type === 'heading' || b.type === 'text' || b.type === 'code' || b.type === 'html') && (
              <textarea
                value={b.value}
                onChange={(e) => update(i, { value: e.target.value })}
                rows={b.type === 'text' ? 2 : b.type === 'heading' ? 1 : 4}
                className={`${glassFieldClass} ${b.type === 'html' || b.type === 'code' ? 'font-mono text-xs' : ''}`}
                placeholder={b.type === 'html' ? '<p>raw html…</p>' : b.type === 'code' ? 'code…' : 'content…'}
              />
            )}

            {(b.type === 'table' || b.type === 'list') && (
              <textarea
                value={b.value}
                onChange={(e) => update(i, { value: e.target.value })}
                rows={4}
                className={`${glassFieldClass} font-mono text-xs`}
                placeholder={b.type === 'table' ? '[["col A","col B"],["a","b"]]' : '["item one","item two"]'}
              />
            )}

            {b.type === 'image' && (
              <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="https://… image URL" />
            )}

            {b.type === 'button' && (
              <div className="space-y-2">
                <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={glassFieldClass} placeholder="Button label" />
                <input value={b.href ?? ''} onChange={(e) => update(i, { href: e.target.value })} className={`${glassFieldClass} font-mono`} placeholder="https://… link URL" />
              </div>
            )}

            {b.type === 'stat' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input value={b.label ?? ''} onChange={(e) => update(i, { label: e.target.value })} className={glassFieldClass} placeholder="Label" />
                <input value={b.value} onChange={(e) => update(i, { value: e.target.value })} className={glassFieldClass} placeholder="Value" />
                <input value={b.unit ?? ''} onChange={(e) => update(i, { unit: e.target.value })} className={glassFieldClass} placeholder="Unit" />
                <select
                  value={b.tone ?? 'default'}
                  onChange={(e) => update(i, { tone: e.target.value as BlockRow['tone'] })}
                  className={glassFieldClass}
                >
                  <option value="default">Tone: default</option>
                  <option value="good">Tone: good</option>
                  <option value="warn">Tone: warn</option>
                  <option value="bad">Tone: bad</option>
                </select>
              </div>
            )}

            {b.type === 'action' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={b.action ?? ''}
                  onChange={(e) => update(i, { action: e.target.value })}
                  className={glassFieldClass}
                >
                  <option value="">— pick a saved action —</option>
                  {actionNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input value={b.label ?? ''} onChange={(e) => update(i, { label: e.target.value })} className={glassFieldClass} placeholder="Button label (optional)" />
                <input value={b.confirmText ?? ''} onChange={(e) => update(i, { confirmText: e.target.value })} className={glassFieldClass} placeholder="Confirm prompt (optional)" />
              </div>
            )}

            {(b.type === 'spacer' || b.type === 'divider') && (
              <div className="text-xs text-gray-500 self-center">No settings for this block.</div>
            )}
          </div>

          {(b.type === 'heading' || b.type === 'text' || b.type === 'image' || b.type === 'button' || b.type === 'stat') && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Align:</span>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update(i, { align: a })}
                  className={`px-2 py-0.5 rounded border ${b.align === a || (!b.align && a === 'left') ? 'border-emerald-500 text-emerald-300' : 'border-white/10 text-gray-400 hover:text-white'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onChange([...rows, { type: t.type, value: '', align: 'left' }])}
            className="px-2 py-1 text-xs rounded border border-white/10 text-gray-300 hover:bg-white/10"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};
