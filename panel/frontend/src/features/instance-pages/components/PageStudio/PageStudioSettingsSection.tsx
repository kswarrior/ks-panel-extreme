// PageStudioSettingsSection — "Settings" tab
//
// Mirrors templates/new's General/Runtime cards: meta fields + icon preset
// gallery + import/export. Kind is fixed to "custom" (migration 046) —
// built-ins are read-only elsewhere. Category/Type reuse the tag-picker UX
// from the template editor.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { TagPicker } from '@/features/templates/components/TemplateFormComponents';
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from '@/features/instance-pages/types/pageStudio';
import type { InstancePage } from '@/shared/types/instancePage';
import { PAGE_STARTERS } from '@/features/instance-pages/templates/pageStarters';

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
        <label className="block text-xs text-gray-400 mb-2">Icon — pick a preset or paste inner SVG markup</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PAGE_STARTERS.slice(0, 12).map((s) => (
            <button
              key={s.id}
              type="button"
              title={`Use ${s.name} icon`}
              onClick={() => onChange('icon_svg', s.iconSvg)}
              className={`w-9 h-9 rounded-lg border bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center ${page.icon_svg === s.iconSvg ? 'border-emerald-500' : 'border-white/10'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: s.iconSvg }} /></svg>
            </button>
          ))}
        </div>
        <textarea value={page.icon_svg ?? ''} onChange={(e) => onChange('icon_svg', e.target.value)} rows={3} className={`${glassFieldClass} font-mono text-xs`} placeholder='<path d="M12 2L2 7l10 5 10-5-10-5z" />' />
      </div>
    </div>
  );
};
