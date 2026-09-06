import React from 'react';
import GlassField from '@/shared/components/ui/Field';

interface Form {
  name: string;
  display_name: string;
  color: string;
  description: string;
  icon: string;
}

interface RoleIdentityProps {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
}

const ICON_PRESETS: Array<{ value: string; label: string; svg: string }> = [
  { value: '', label: 'None', svg: '' },
  { value: 'shield', label: 'Shield', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg>' },
  { value: 'user', label: 'User', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/> </svg>' },
  { value: 'key', label: 'Key', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/><path d="M21 11.5V6.5a3.5 3.5 0 0 0-7 0v5"/> </svg>' },
  { value: 'crown', label: 'Crown', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7h2l-1 4h5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13H2l-1-4h5l3-7Z"/> </svg>' },
  { value: 'star', label: 'Star', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/> </svg>' },
  { value: 'lock', label: 'Lock', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/> </svg>' },
  { value: 'zap', label: 'Zap', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/> </svg>' },
  { value: 'globe', label: 'Globe', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/> </svg>' },
  { value: 'server', label: 'Server', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/> </svg>' },
];

const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: '#a78bfa', label: 'Violet' },
  { value: '#38bdf8', label: 'Sky' },
  { value: '#34d399', label: 'Emerald' },
  { value: '#fbbf24', label: 'Amber' },
  { value: '#f87171', label: 'Red' },
  { value: '#f472b6', label: 'Pink' },
  { value: '#94a3b8', label: 'Slate' },
];

const renderSVG = (svgString: string, size: number = 20) => {
  if (!svgString) return null;
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: svgString.replace(/<svg /, `<svg width="${size}" height="${size}" `),
      }}
    />
  );
};

const RoleIdentity: React.FC<RoleIdentityProps> = ({ form, setForm }) => {
  return (
    <div className="ks-card ks-form-card rounded-md space-y-4">
      <GlassField label="Name" htmlFor="name">
        <input
          id="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </GlassField>
      <GlassField label="Description" htmlFor="description">
        <input
          id="description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </GlassField>
      <GlassField
        label="Display Name"
        htmlFor="display_name"
        hint='Shown in the UI instead of the machine name. Decorated forms like "⚠ Admin ⚠" or "• Admin •" are supported.'
      >
        <input
          id="display_name"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          placeholder={form.name || 'optional'}
        />
      </GlassField>
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-1">
          Accent colour
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Tints the role badge on cards. Pick a preset or use the picker for any CSS colour.
        </p>
        <div className="flex items-center gap-2 overflow-x-auto ks-hscroll pb-2 -mx-0.5 px-0.5">
          {COLOR_SWATCHES.map((s) => {
            const active = (form.color || '') === s.value;
            return (
              <button
                key={s.value || 'none'}
                type="button"
                onClick={() => setForm({ ...form, color: s.value })}
                aria-pressed={active}
                aria-label={`Colour: ${s.label}`}
                className={`group relative w-7 h-7 shrink-0 rounded-full border border-white/15 ring-1 transition-all ${
                  active ? 'ring-white/40 scale-110' : 'ring-transparent hover:ring-white/20'
                } ${s.value ? '' : 'bg-white/[0.04] border-white/25'}`}
                style={s.value ? { backgroundColor: s.value } : undefined}
              >
                {!s.value && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 text-gray-400 absolute inset-0 m-auto">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                   </svg>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <label
            htmlFor="color_picker"
            className="ks-ghost-btn inline-flex items-center gap-1.5 text-xs text-gray-300 border border-white/10 rounded-md px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors"
          >
            <input
              id="color_picker"
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#a78bfa'}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer p-0"
              aria-label="Custom colour picker"
            />
            <span>Custom</span>
          </label>
          <input
            type="text"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            placeholder="#hex / hsl() / rgb()"
            className="flex-1 min-w-[8rem] bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-1">
          Icon
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Displayed on role cards. Pick a preset, paste custom SVG, or leave empty.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto ks-hscroll pb-2 -mx-0.5 px-0.5">
            {ICON_PRESETS.map((s) => {
              const active = (form.icon || '') === s.value;
              return (
                <button
                  key={s.value || 'none'}
                  type="button"
                  onClick={() => setForm({ ...form, icon: s.value })}
                  aria-pressed={active}
                  aria-label={`Icon: ${s.label}`}
                  title={s.label}
                  className={`group relative w-10 h-10 shrink-0 rounded-lg border border-white/15 ring-1 transition-all flex items-center justify-center ${
                    active ? 'ring-white/40 scale-110 bg-white/10' : 'ring-transparent hover:ring-white/20 hover:bg-white/5'
                  } ${s.value ? '' : 'bg-white/[0.04] border-white/25'}`}
                >
                  {s.value ? (
                    renderSVG(s.svg, 18)
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-gray-400">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                     </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="icon_custom"
              className="ks-ghost-btn inline-flex items-center gap-1.5 text-xs text-gray-300 border border-white/10 rounded-md px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
               </svg>
              <span>Custom SVG</span>
            </label>
            <input
              id="icon_custom"
              type="text"
              value={form.icon.startsWith('<svg') ? form.icon : ''}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="Paste full <svg>...</svg> markup"
              className="flex-1 min-w-[12rem] bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
            />
          </div>
          {form.icon.startsWith('<svg') && (
            <div className="pt-2 border-t border-white/10">
              <span className="text-xs text-gray-400">Preview:</span>
              <div className="mt-1 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10">
                {renderSVG(form.icon, 18)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleIdentity;