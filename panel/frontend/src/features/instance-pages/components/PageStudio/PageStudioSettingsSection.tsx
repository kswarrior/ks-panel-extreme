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
          {[
            '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
            '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
            '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/><path d="m19 5 1.5 1.5"/>',
            '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
            '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
            '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
            '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
            '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>',
            '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
          ].map((iconSvg, idx) => (
            <button
              key={idx}
              type="button"
              title="Use icon"
              onClick={() => onChange('icon_svg', iconSvg)}
              className={`w-9 h-9 rounded-lg border bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center ${page.icon_svg === iconSvg ? 'border-emerald-500' : 'border-white/10'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: iconSvg }} /></svg>
            </button>
          ))}
        </div>
        <textarea value={page.icon_svg ?? ''} onChange={(e) => onChange('icon_svg', e.target.value)} rows={3} className={`${glassFieldClass} font-mono text-xs`} placeholder='<path d="M12 2L2 7l10 5 10-5-10-5z" />' />
      </div>
    </div>
  );
};
