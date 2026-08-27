// PageStudioContentSection — "Content" tab
//
// Mirrors templates/new's pattern: Section wrapper + content-type switch +
// editor (html/markdown textarea or blocks visual/json). The import/export
// helpers ride along here because they act on the draft content buffer.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { PageStudioBlocksEditor } from './PageStudioBlocksEditor';
import { parseBlocks } from '@/features/instance-pages/utils/pageStudioUtils';
import type { BlockRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioContentSectionProps {
  // Content state
  contentType: 'html' | 'markdown' | 'blocks';
  onContentTypeChange: (t: 'html' | 'markdown' | 'blocks') => void;
  currentContent: string;
  onContentChange: (v: string) => void;
  contentBlocks: string;
  onBlocksChange: (v: string) => void;
  // Blocks visual/json toggle
  blocksMode: 'visual' | 'json';
  onBlocksModeChange: (m: 'visual' | 'json') => void;
  actionNames: string[];
  // Actions on the content buffer
  onCopy?: () => void;
  onExport: () => void;
  onImportClick: () => void;
  sectionCls: string;
}

export const PageStudioContentSection: React.FC<PageStudioContentSectionProps> = ({
  contentType,
  onContentTypeChange,
  currentContent,
  onContentChange,
  contentBlocks,
  onBlocksChange,
  blocksMode,
  onBlocksModeChange,
  actionNames,
  onCopy,
  onExport,
  onImportClick,
  sectionCls,
}) => {
  const blocksState = parseBlocks(contentBlocks ?? '');

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Section B · Content</h4>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Content Type</label>
          <select
            value={contentType}
            onChange={(e) => { onContentTypeChange(e.target.value as any); onBlocksModeChange('visual'); }}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white"
          >
            <option value="html">HTML</option>
            <option value="markdown">Markdown</option>
            <option value="blocks">Visual Blocks</option>
          </select>
        </div>
      </div>

      {(contentType === 'html' || contentType === 'markdown') && (
        <div>
          <label className="block text-xs text-gray-400 mb-2">
            Page Content ({contentType}) — runs in a sandboxed frame with KSPageSDK available for live data.
          </label>
          <textarea
            value={currentContent}
            onChange={(e) => onContentChange(e.target.value)}
            className={`${glassFieldClass} font-mono text-sm`}
            style={{ minHeight: '420px', width: '100%' }}
            spellCheck={false}
            placeholder={contentType === 'html'
              ? '<div class="ks-card">\n  <button onclick="KSPageSDK.shell(\'uptime\')">Run uptime</button>\n</div>'
              : '# Welcome\n\nYour custom page content here'}
          />
        </div>
      )}

      {contentType === 'blocks' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Visual Blocks</label>
            <div className="flex gap-1 text-xs">
              {(['visual', 'json'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onBlocksModeChange(m)}
                  className={`px-2 py-1 rounded border ${blocksMode === m ? 'border-emerald-500 text-emerald-300' : 'border-white/10 text-gray-400 hover:text-white'}`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {blocksMode === 'visual' ? (
            <PageStudioBlocksEditor
              rows={blocksState.rows as BlockRow[]}
              jsonError={!blocksState.ok}
              actionNames={actionNames}
              onChange={(rows) => {
                const next = rows.length ? JSON.stringify(rows, null, 2) : '';
                onBlocksChange(next);
              }}
            />
          ) : (
            <textarea
              value={contentBlocks ?? ''}
              onChange={(e) => onContentChange(e.target.value)}
              className={`${glassFieldClass} font-mono text-sm`}
              style={{ minHeight: '360px', width: '100%' }}
              spellCheck={false}
              placeholder={'[\n  { "type": "stat", "label": "CPU", "value": "12", "unit": "%" }\n]'}
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCopy} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
          Copy content
        </button>
        <button type="button" onClick={onExport} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
          Export page JSON
        </button>
        <button type="button" onClick={onImportClick} className="ks-ghost-btn px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5">
          Import JSON…
        </button>
      </div>
    </div>
  );
};
