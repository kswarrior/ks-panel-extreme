import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';

export interface SpecPreviewSectionProps {
  specPreview: string;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
}

export const TemplateSpecPreviewSection: React.FC<SpecPreviewSectionProps> = ({
  specPreview,
  sectionCls,
  labelCls,
  monoCls,
}) => {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {/* Section J: Live spec preview */}
      <div className={sectionCls}>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center justify-between w-full"
        >
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section J · Generated Spec (preview)</h4>
          <span className="text-xs text-gray-400 underline">
            {showPreview ? 'Hide' : 'Show'} JSON
          </span>
        </button>
        {showPreview && (
          <pre className="text-xs font-mono text-gray-300 bg-black/40 border border-white/10 rounded-md p-3 overflow-auto max-h-80">{specPreview}</pre>
        )}
      </div>
    </>
  );
};