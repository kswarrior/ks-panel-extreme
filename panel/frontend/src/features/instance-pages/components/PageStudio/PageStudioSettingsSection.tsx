// PageStudioSettingsSection — "Settings" tab
//
// Mirrors templates/new's General/Runtime cards: meta fields + icon preset
// gallery + import/export. Kind is fixed to "custom" (migration 046) —
// built-ins are read-only elsewhere. Category/Type reuse the tag-picker UX
// from the template editor.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import { TagPicker } from '@/features/templates/components/TemplateFormComponents';
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from '@/features/instance-pages/types/pageStudio';
import type { InstancePage } from '@/shared/types/instancePage';

export interface PageStudioSettingsSectionProps {
  page: Partial<InstancePage>;
  onChange: <K extends keyof InstancePage>(key: K, value: InstancePage[K]) => void;
  onExport: () => void;
  onImportClick: () => void;
  sectionCls: string;
}

export const PageStudioSettingsSection: React.FC<PageStudioSettingsSectionProps> = ({
  page,
  onChange,
  onExport,
  onImportClick,
  sectionCls,
}) => {
  return (
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section F · General</h4>
      <h3 className="text-sm font-semibold text-white">Page settings</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-gray-400">Name *</span>
          <input value={page.name ?? ''} onChange={(e) => onChange('name', e.target.value)} className={glassFieldClass} required />
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Slug * (URL path segment — "." is the reserved Home/index slug)</span>
          <input value={page.slug ?? ''} onChange={(e) => onChange('slug', e.target.value)} className={`${glassFieldClass} font-mono`} required />
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-gray-400">Description</span>
        <textarea value={page.description ?? ''} onChange={(e) => onChange('description', e.target.value)} rows={2} className={glassFieldClass} />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-gray-400">Kind</span>
          <select value="custom" disabled className={glassFieldClass} title='Only "custom" pages exist — the legacy built-in kind was removed (migration 046)'>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Category</span>
          <TagPicker
            value={page.category ?? ''}
            options={CATEGORY_OPTIONS}
            placeholder="monitoring"
            onChange={(v) => onChange('category', v)}
            onAdd={(v) => onChange('category', v)}
            onDelete={() => onChange('category', '')}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Type</span>
          <TagPicker
            value={page.type ?? ''}
            options={TYPE_OPTIONS}
            placeholder="dashboard"
            onChange={(v) => onChange('type', v)}
            onAdd={(v) => onChange('type', v)}
            onDelete={() => onChange('type', '')}
          />
        </label>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-2">Icon & colour — pick a preset or paste SVG markup (live preview on the left)</label>
        <IconColorPicker
          icon={page.icon_svg ?? ''}
          color={(page as any).icon_color ?? ''}
          onIconChange={(v) => onChange('icon_svg', v)}
          onColorChange={(v) => onChange('icon_color' as any, v as any)}
          previewName={page.name || 'Page'}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onExport} className="text-xs text-gray-400 hover:text-white underline" title="Export page JSON">
          Export JSON
        </button>
        <button type="button" onClick={onImportClick} className="text-xs text-gray-400 hover:text-white underline" title="Import page JSON">
          Import JSON
        </button>
      </div>
    </div>
  );
};
