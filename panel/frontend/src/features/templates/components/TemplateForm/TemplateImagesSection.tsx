import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { TemplateImage } from '@/features/templates/types/templateForm';

export interface ImagesSectionProps {
  images: TemplateImage[];
  onImageUpdate: (i: number, patch: Partial<TemplateImage>) => void;
  onImageAdd: () => void;
  onImageDelete: (i: number) => void;
  onImageDefault: (i: number) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateImagesSection: React.FC<ImagesSectionProps> = ({
  images,
  onImageUpdate,
  onImageAdd,
  onImageDelete,
  onImageDefault,
  sectionCls,
  labelCls,
  monoCls,
}) => (
  <div className={sectionCls}>
    <div className="flex items-center justify-between mb-1">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
        Additional runtimes · multi-image ({images.length})
      </h4>
      <button type="button" onClick={onImageAdd} className="text-xs text-sky-300 hover:text-sky-200 underline">
        + Add runtime
      </button>
    </div>
    <p className="text-[11px] text-gray-500">
      Named runtimes the operator picks at deploy time (e.g. Java 21 vs Java 17). The
      top-level Image above stays the implicit default; the ★ row is the default when
      set. Per-image env differences live on the Env Variables tab (per-var image
      selector + auto-set).
    </p>
    {images.length === 0 && (
      <p className="text-xs text-gray-500 border border-dashed border-white/10 rounded-md px-3 py-2">
        Single-image template — every deploy uses the Image field above. Add a runtime to offer a choice.
      </p>
    )}
    <div className="space-y-3">
      {images.map((r, i) => (
        <div key={i} className="border border-white/10 rounded-md p-3 space-y-2 bg-black/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              title={r.is_default ? 'Default runtime' : 'Make default runtime'}
              aria-pressed={r.is_default}
              onClick={() => onImageDefault(i)}
              className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition ${
                r.is_default
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                  : 'border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-300'
              }`}
            >
              ★
            </button>
            <div className="flex-1 min-w-0">
              <label className={labelCls}>Name</label>
              <input
                value={r.name}
                onChange={(e) => onImageUpdate(i, { name: e.target.value })}
                placeholder="e.g. Java 21"
                className={glassFieldClass}
              />
            </div>
            <button
              type="button"
              onClick={() => onImageDelete(i)}
              className="shrink-0 self-end text-xs text-red-300/80 hover:text-red-200 underline px-1"
            >
              Delete
            </button>
          </div>
          <div>
            <label className={labelCls}>Image</label>
            <input
              value={r.image}
              onChange={(e) => onImageUpdate(i, { image: e.target.value })}
              placeholder="e.g. eclipse-temurin:21-jre or {{BASE_IMAGE}}"
              className={monoCls}
            />
          </div>
          <div>
            <label className={labelCls}>Description (optional)</label>
            <input
              value={r.description}
              onChange={(e) => onImageUpdate(i, { description: e.target.value })}
              placeholder="Eclipse Temurin 21 JRE (LTS)"
              className={glassFieldClass}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);
