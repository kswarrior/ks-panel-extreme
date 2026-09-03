// PageStudioPreviewSection — "Preview" tab
//
// Mirrors the Studio's previewPanel variable that was previously inlined in
// InstancePageStudio.tsx. When an instance is bound the live SDK bridge
// (CustomPageView) is used; otherwise a sandboxed static iframe with
// STATIC_SDK_STUB renders the draft. Full-screen mode hides chrome via the
// parent's fixed overlay while keeping header/sidebar visible.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import CustomPageView, { type PageContent } from '@/shared/components/ui/CustomPageView';
import { renderPreview } from '@/features/instance-pages/utils/pageStudioUtils';
import type { Instance } from '@/features/instances/types/instance';
import type { SubPageRow } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioPreviewSectionProps {
  // Preview plumbing
  instances: Instance[];
  previewInstanceId: number | null;
  onPreviewInstanceChange: (id: number | null) => void;
  previewTarget: string;
  onPreviewTargetChange: (v: string) => void;
  subs: SubPageRow[];
  pageName: string;
  pageSlug: string;
  isBuiltin: boolean;
  isEdit: boolean;
  // Resolved context for live SDK
  previewInstance: Instance | null;
  previewContext: any | null;
  previewContent: PageContent;
  editingSub: SubPageRow | null;
  // Static fallback
  contentType: string;
  currentContent: string;
  // Fullscreen
  fullPreview: boolean;
  onToggleFullPreview: () => void;
  sectionCls: string;
}

export const PageStudioPreviewSection: React.FC<PageStudioPreviewSectionProps> = ({
  instances,
  previewInstanceId,
  onPreviewInstanceChange,
  previewTarget,
  onPreviewTargetChange,
  subs,
  pageName,
  pageSlug,
  isBuiltin,
  isEdit,
  previewInstance,
  previewContext,
  previewContent,
  editingSub,
  contentType,
  currentContent,
  fullPreview,
  onToggleFullPreview,
  sectionCls,
}) => {
  // Static preview should mirror live preview's component token resolution so
  // authors see React-like composition ({{component:name}} works on main and
  // sub-pages) even before binding an instance.
  const staticSrcDoc = (() => {
    const type = (previewContent.type as string) || contentType;
    const raw = previewContent.type === 'html' ? (previewContent.html ?? '')
      : previewContent.type === 'markdown' ? (previewContent.markdown ?? '')
      : previewContent.type === 'blocks' ? (previewContent.blocks ?? '')
      : currentContent;
    // Fallback to legacy contentType/currentContent when previewContent is empty (e.g. initial load)
    const fallbackType = type || contentType;
    const fallbackContent = raw !== undefined && raw !== null && raw !== '' ? raw : currentContent;
    return renderPreview(fallbackType, fallbackContent, previewContent.components as any, previewContent.configure as any, previewContent.config as any);
  })();
  const inner = (
    <div className={fullPreview ? 'flex h-full flex-col gap-3 overflow-auto p-4' : 'space-y-4'}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {fullPreview ? (
          <h3 className="text-sm font-semibold text-white mr-auto">Live preview</h3>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-white">Live preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Bind a real instance to exercise the page SDK (shell, files, panel APIs) exactly as operators will see it.
            </p>
          </div>
        )}
        {!isBuiltin && (
          <>
            <label className="block">
              <span className="text-xs text-gray-400">Test instance</span>
              <select
                value={previewInstanceId ?? ''}
                onChange={(e) => onPreviewInstanceChange(e.target.value ? Number(e.target.value) : null)}
                className={`${glassFieldClass} min-w-[220px]`}
              >
                <option value="">— none (static render) —</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    #{i.id} {i.display_name || i.name} ({i.kind}, {i.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Page</span>
              <select
                value={previewTarget}
                onChange={(e) => onPreviewTargetChange(e.target.value)}
                className={`${glassFieldClass} min-w-[220px]`}
                disabled={subs.length === 0}
              >
                <option value="main">Main page{subs.length === 0 ? '' : ` (/${pageSlug?.trim() || 'slug'})`}</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.trim() || s.path.trim()} (/{pageSlug?.trim() || 'slug'}/{s.path.trim() || '…'})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          onClick={onToggleFullPreview}
          title={fullPreview ? 'Exit full screen (Esc)' : 'Full screen — hides everything except the panel header and sidebar'}
          aria-pressed={fullPreview}
          className={`px-3 py-1.5 text-sm rounded border transition ${fullPreview ? 'bg-white text-black border-white' : 'border-white/10 text-gray-300 hover:bg-white/10'}`}
        >
          {fullPreview ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      {previewInstance && previewContext ? (
        <>
          {!isEdit && (
            <p className="text-xs text-amber-300">Tip: unsaved pages preview with the SDK, but actions that hit the panel require the page to be saved &amp; linked.</p>
          )}
          <CustomPageView content={previewContent} title={editingSub ? (editingSub.name.trim() || editingSub.path || 'Preview') : (pageName || 'Preview')} instanceContext={previewContext} pageSlug={pageSlug ? (editingSub ? `${pageSlug}/${editingSub.path}` : pageSlug) : undefined} />
        </>
      ) : (
        <div className={`border border-white/10 rounded-lg overflow-hidden bg-black/30 ${fullPreview ? 'flex-1 min-h-0 flex flex-col' : ''}`} style={fullPreview ? undefined : { minHeight: '500px' }}>
          <iframe
            srcDoc={staticSrcDoc}
            className={fullPreview ? 'w-full flex-1 min-h-0 border-0' : 'w-full h-[600px] border-0'}
            title="Static Page Preview"
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );

  // The normal in-tab rendering wraps the preview panel in Section styling.
  // Full-screen callers bypass the wrapper and mount the inner panel in a
  // fixed overlay (handled by the parent) so chrome stays visible.
  if (fullPreview) return inner;

  return (
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Preview</h4>
      {inner}
    </div>
  );
};
