// PageStudioTemplatesSection — "Templates" tab (starter gallery)
//
// Mirrors templates/new's TemplatePagesSection pattern: a bordered card with
// Section heading, a searchable grid of starters and a "Use template" action.
// The actual starter data lives in pageStarters.ts (ported library pages +
// VM/container operator extras).

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { PageStarter } from '@/features/instance-pages/templates/pageStarters';

export interface PageStudioTemplatesSectionProps {
  search: string;
  onSearchChange: (v: string) => void;
  starters: PageStarter[];
  query: string;
  onApply: (s: PageStarter) => void;
  sectionCls: string;
}

export const PageStudioTemplatesSection: React.FC<PageStudioTemplatesSectionProps> = ({
  search,
  onSearchChange,
  starters,
  query,
  onApply,
  sectionCls,
}) => {
  return (
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section A · Templates</h4>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white">Start from a functional template</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every template is a complete working page built only on the page SDK — the same building blocks you can edit by hand.
            Includes conversions of all built-in panel pages plus VM &amp; container operator essentials.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search templates…"
          className={`${glassFieldClass} max-w-[220px]`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {starters.map((s) => (
          <article key={s.id} className="ks-card rounded-xl p-4 flex flex-col gap-2 hover:border-white/25 transition-colors">
            <header className="flex items-start gap-2.5">
              <span className="shrink-0 inline-flex w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300 items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: s.iconSvg }} /></svg>
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-white truncate">{s.name}</h4>
                <p className="text-[11px] text-gray-500 truncate font-mono">/{s.slug}</p>
              </div>
            </header>
            <p className="text-xs text-gray-400 leading-relaxed flex-1">{s.description}</p>
            <footer className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-gray-400">{s.category}</span>
                {!!s.actions?.length && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-700/50 bg-sky-900/30 text-sky-300" title={`${s.actions.length} saved action(s) included`}>
                    ⚡ {s.actions.length} action{s.actions.length === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onApply(s)}
                className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Use template
              </button>
            </footer>
          </article>
        ))}
      </div>
      {starters.length === 0 && (
        <p className="text-sm text-gray-500">No templates match “{query}”.</p>
      )}
    </div>
  );
};
