import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import type { PageOverride } from '@/features/templates/types/templateForm';

export interface TemplatePageConfigureViewProps {
  page: PageOverride;
  sectionCls: string;
  onBack: () => void;
  onConfigChange: (next: Record<string, string>) => void;
}

// TemplatePageConfigureView — full-page Configure editor for ONE top-level
// template page (spec.pages[] row).
//
// Replaces the old `max-w-xl` Configure modal: when the operator clicks
// Configure on a page that is NOT a sub-page, the Pages tab drills into
// this view so it fills the same content column as General / Install /
// Actions — a real full page with back navigation, page header, all
// configure vars and the nested sub-page routes for context.
//
// Sub-pages themselves never open here — they are listed read-only at the
// bottom so the operator sees they belong to this parent route.
export const TemplatePageConfigureView: React.FC<TemplatePageConfigureViewProps> = ({
  page,
  sectionCls,
  onBack,
  onConfigChange,
}) => {
  const vars = page.configure ?? [];
  const config = page.config ?? {};
  const defLabel = page.slug === '.' ? 'Home' : page.slug;
  const iconSvg = page.icon_svg || '';
  const subPages = page.sub_pages ?? [];

  // Stored values whose var definition is gone (e.g. removed in the Studio).
  // Shown separately so the operator can inspect/clear orphans.
  const orphanKeys = Object.keys(config).filter(
    (k) => !vars.some((v) => v.name === k),
  );

  return (
    <div className="space-y-4">
      {/* Header — same card chrome as Section A (General) etc. */}
      <div className={sectionCls}>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          aria-label="Back to pages list"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Back to pages
        </button>

        <div className="flex items-center gap-3 flex-wrap mt-2">
          <div
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-md bg-white/5 border border-white/10"
            style={(page as any).icon_color ? { color: (page as any).icon_color } : undefined}
          >
            {iconSvg ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
                dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(iconSvg) }}
              />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-gray-500">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-white truncate">
                {(page.label || '').trim() || defLabel}
              </h3>
              <span className="text-[10px] uppercase tracking-wide bg-emerald-900/30 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded">
                custom
              </span>
            </div>
            <code className="block text-[11px] text-gray-500 font-mono mt-0.5 truncate">
              /{page.slug === '.' ? '' : page.slug}
            </code>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Values entered here are stored in{' '}
          <code className="font-mono">spec.pages[].config</code> and available in the page as{' '}
          <code className="font-mono">{'{{config:NAME}}'}</code> or via{' '}
          <code className="font-mono">KSPageSDK.config</code>.
        </p>
      </div>

      {/* Configure variables — full-width form rows like Env Variables. */}
      <div className={sectionCls}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Configure variables
        </h4>
        {vars.length === 0 && (
          <p className="text-sm text-gray-500">This page has no configure variables.</p>
        )}
        <div className="space-y-4">
          {vars.map((v) => {
            const cur = config[v.name] ?? v.default ?? '';
            const opts = v.options ? v.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
            return (
              <div key={v.name} className="space-y-1.5 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <label className="block text-sm font-medium text-gray-200">
                  {v.label || v.name}{' '}
                  <code className="text-xs text-gray-500 font-mono ml-1">{v.name}</code>
                  {v.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {v.description && <p className="text-xs text-gray-500">{v.description}</p>}
                {v.display === 'select' ? (
                  <select
                    value={cur}
                    onChange={(e) => onConfigChange({ ...config, [v.name]: e.target.value })}
                    className={glassFieldClass + ' w-full'}
                  >
                    <option value="">— {v.required ? 'required' : 'optional'} —</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    {/* keep current value even if not in options */}
                    {cur && !opts.includes(cur) && <option value={cur}>{cur}</option>}
                  </select>
                ) : (v.display === 'checkbox' || v.display === 'toggle') ? (
                  (() => {
                    const isOn = cur === 'true' || cur === '1' || cur === 'on';
                    return (
                      <label className="inline-flex items-center gap-3 cursor-pointer">
                        <button
                          type="button"
                          onClick={() => onConfigChange({ ...config, [v.name]: isOn ? 'false' : 'true' })}
                          className={`relative w-11 h-6 rounded-full transition ${isOn ? 'bg-green-600' : 'bg-neutral-700'}`}
                          aria-pressed={isOn}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${isOn ? 'translate-x-5' : ''}`} />
                        </button>
                        <span className={`text-sm font-medium ${isOn ? 'text-green-400' : 'text-gray-400'}`}>{isOn ? 'On' : 'Off'}</span>
                        <span className="text-sm text-gray-500">{v.label || v.name}</span>
                      </label>
                    );
                  })()
                ) : v.display === 'number' ? (
                  <input
                    type="number"
                    value={cur}
                    onChange={(e) => onConfigChange({ ...config, [v.name]: e.target.value })}
                    placeholder={v.default || v.rule || ''}
                    className={glassFieldClass + ' w-full font-mono'}
                  />
                ) : (
                  <input
                    type="text"
                    value={cur}
                    onChange={(e) => onConfigChange({ ...config, [v.name]: e.target.value })}
                    placeholder={v.default || ''}
                    className={glassFieldClass + ' w-full font-mono'}
                  />
                )}
                {v.rule && <p className="text-[11px] text-gray-500">Rule: <code className="font-mono">{v.rule}</code></p>}
              </div>
            );
          })}
        </div>

        {/* Orphaned stored values (var removed in the Studio). */}
        {orphanKeys.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-700/40 bg-amber-900/10 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Stored values without a variable
            </p>
            <p className="text-[11px] text-gray-500">
              These keys are saved in <code className="font-mono">config</code> but the page no longer
              defines them. Clear them if they are no longer needed.
            </p>
            {orphanKeys.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <code className="text-xs text-gray-400 font-mono shrink-0 w-32 truncate">{k}</code>
                <input
                  type="text"
                  value={config[k] ?? ''}
                  onChange={(e) => onConfigChange({ ...config, [k]: e.target.value })}
                  className={glassFieldClass + ' flex-1 font-mono'}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...config };
                    delete next[k];
                    onConfigChange(next);
                  }}
                  className="px-2 py-1 text-xs text-red-400 border border-red-700/40 rounded hover:bg-red-900/20 shrink-0"
                  title={`Clear stored value for ${k}`}
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-pages context — read-only. Only top-level pages open this full
          view; their nested routes are shown here so the operator knows
          these paths ship with the parent and are not separate tabs. */}
      {subPages.length > 0 && (
        <div className={sectionCls}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Sub-pages of this page ({subPages.length})
          </h4>
          <p className="text-xs text-gray-500">
            Extra routes shipped with this page. They open under this page&apos;s path and are
            not configured separately here.
          </p>
          <div className="divide-y divide-white/5 rounded-md border border-white/10 overflow-hidden">
            {subPages.map((s, idx) => (
              <div key={s.path + ':' + idx} className="px-3 py-2 flex items-center gap-2 flex-wrap bg-black/20">
                <span className="text-sm text-white truncate">{s.name || s.path || `Sub-page ${idx + 1}`}</span>
                <code className="text-[11px] text-gray-500 font-mono">
                  /{page.slug === '.' ? '' : page.slug}/{s.path}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-500"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default TemplatePageConfigureView;
