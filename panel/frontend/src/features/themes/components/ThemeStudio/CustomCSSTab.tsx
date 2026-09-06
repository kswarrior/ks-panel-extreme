import React from 'react';
import { Label, Select, CodeArea } from '@/theme/studioControls';
import { scopeForArea, scopeForPage } from '@/shared/stores/themeStore';
import { AREAS, STANDALONE_PAGES } from '@/features/instance-pages/types/pageregistry';

interface CustomCSSTabProps {
  draft: any;
  patch: (section: 'customCSS', p: Record<string, any>) => void;
}

const SCOPE_OPTIONS: Array<{ scope: string; label: string }> = (() => {
  const out: Array<{ scope: string; label: string }> = [];
  for (const area of AREAS) {
    out.push({ scope: scopeForArea(area.id), label: `Whole ${area.label}` });
    for (const p of area.pages) {
      out.push({ scope: scopeForPage(p.id), label: `${area.label} · ${p.label}` });
    }
  }
  for (const p of STANDALONE_PAGES) {
    out.push({ scope: scopeForPage(p.id), label: `${p.areaLabel} · ${p.label}` });
  }
  return out;
})();

function scopeLabelFor(scope: string): string {
  return SCOPE_OPTIONS.find((o) => o.scope === scope)?.label || scope;
}

export const CustomCSSTab: React.FC<CustomCSSTabProps> = ({ draft, patch }) => {
  return (
    <div className="space-y-4">
        <div className="ks-form-card rounded-lg space-y-2">
          <Label
            label="Custom CSS — add completely arbitrary CSS anywhere"
            hint="The structured tabs above cover the common tokens. This tab is the escape hatch: write raw CSS for anything else."
          />
          <p className="text-xs text-gray-400 leading-relaxed">
            The <span className="text-gray-200">Global CSS</span> block is injected panel-wide on every
            page — use any selector, at-rule, or nested rule. The <span className="text-gray-200">scoped</span> blocks
            apply ONLY when the route matches their area/page (the live preview emits all scopes so you can
            see what you wrote while editing). Everything is stored inside the theme, so saving +
            assigning the theme to an area/page carries your CSS with it.
          </p>
        </div>

        <div className="ks-form-card rounded-lg space-y-4">
          <CodeArea
            label="Global CSS (applies everywhere)"
            hint="Injected into the panel's theme stylesheet on every page. Write any CSS — it lands after every token rule, so it naturally wins by source order."
            value={draft.customCSS?.global ?? ''}
            onChange={(v) => patch('customCSS', { global: v })}
            placeholder={`/* Example: restyle every card title to uppercase */\n.glass-card > header h2, .glass-card h3 {\n  text-transform: uppercase;\n  letter-spacing: 0.06em;\n}`}
            rows={10}
          />
        </div>

        <div className="ks-form-card rounded-lg space-y-4">
          <Label
            label="Scoped CSS (applies only on a chosen area or page)"
            hint="A scoped block is emitted ONLY when the current route matches its area/page, on top of the global block above."
          />

          {Object.keys(draft.customCSS?.scopes ?? {}).length === 0 && (
            <p className="text-xs text-gray-500">
              No scoped blocks yet. Pick an area or page below to add CSS that only applies there.
            </p>
          )}

          {Object.entries(draft.customCSS?.scopes ?? {}).map(([scope, css]) => (
            <div key={scope} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/8 border border-white/15 text-gray-100"
                  title={scope}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {scopeLabelFor(scope)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...(draft.customCSS?.scopes ?? {}) };
                    delete next[scope];
                    patch('customCSS', { scopes: next });
                  }}
                  className="text-xs text-gray-400 hover:text-red-300 transition-colors"
                  title="Remove this scoped block"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={css as string}
                spellCheck={false}
                onChange={(e) => patch('customCSS', { scopes: { ...(draft.customCSS?.scopes ?? {}), [scope]: e.target.value } })}
                placeholder={`/* CSS that only applies on ${scopeLabelFor(scope)} */`}
                rows={6}
                className="w-full bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150 resize-y min-h-[5rem]"
              />
            </div>
          ))}

          {(() => {
            const inUse = draft.customCSS?.scopes ?? {};
            const available = SCOPE_OPTIONS.filter((o) => !(o.scope in inUse));
            if (available.length === 0) {
              return <p className="text-xs text-gray-500">Every area and page already has a scoped block. Remove one to add another.</p>;
            }
            return (
              <Select
                label="Add a scope"
                value=""
                options={[
                  { label: '+ Add a scope…', value: '' },
                  ...available.map((o) => ({ label: o.label, value: o.scope })),
                ]}
                onChange={(v) => {
                  if (!v) return;
                  patch('customCSS', { scopes: { ...(draft.customCSS?.scopes ?? {}), [v]: '' } });
                }}
              />
            );
          })()}
        </div>

        <div className="ks-form-card rounded-lg space-y-2">
          <Label label="Quick reference — common class hooks" hint="Class names the panel already exposes for theming." />
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Cards</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">.ks-card</span> — base card class (extends .glass-card)</li>
                <li><span className="text-gray-200">.ks-list-card</span> — list items (instances, nodes, templates, users, roles, etc.)</li>
                <li><span className="text-gray-200">.ks-stat-card</span> — stat cards in header strips</li>
                <li><span className="text-gray-200">.ks-form-card</span> — form sections, settings panels</li>
                <li><span className="text-gray-200">.ks-modal-card</span> — modals, dropdowns, overlays</li>
                <li><span className="text-gray-200">.glass-card</span>, <span className="text-gray-200">.glass-strong</span>, <span className="text-gray-200">.glass-chrome</span> — base glassmorphism surfaces</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Buttons</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">.ks-btn</span> — base button</li>
                <li><span className="text-gray-200">.ks-btn-primary</span> — primary (solid)</li>
                <li><span className="text-gray-200">.ks-btn-secondary</span> — secondary</li>
                <li><span className="text-gray-200">.ks-btn-ghost</span> — ghost/transparent</li>
                <li><span className="text-gray-200">.ks-btn-danger</span> — danger/destructive</li>
                <li><span className="text-gray-200">.ks-btn-icon</span> — icon buttons</li>
                <li><span className="text-gray-200">.ks-btn-cancel</span> — cancel/secondary actions</li>
                <li><span className="text-gray-200">.ks-btn-header</span> — header action buttons (filter, search, create)</li>
                <li><span className="text-gray-200">.ks-btn-form</span> — form submit buttons (save, create)</li>
                <li><span className="text-gray-200">.ks-btn-sm</span>, <span className="text-gray-200">.ks-btn-lg</span>, <span className="text-gray-200">.ks-btn-outline</span> — size/style variants</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Form Controls</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">.ks-input</span>, <span className="text-gray-200">.ks-input-sm</span>, <span className="text-gray-200">.ks-input-lg</span> — text inputs</li>
                <li><span className="text-gray-200">.ks-select</span>, <span className="text-gray-200">.ks-select-sm</span>, <span className="text-gray-200">.ks-select-lg</span> — select dropdowns</li>
                <li><span className="text-gray-200">.ks-textarea</span>, <span className="text-gray-200">.ks-textarea-sm</span>, <span className="text-gray-200">.ks-textarea-lg</span> — textareas</li>
                <li><span className="text-gray-200">.ks-checkbox</span>, <span className="text-gray-200">.ks-checkbox-sm</span>, <span className="text-gray-200">.ks-checkbox-lg</span> — checkboxes</li>
                <li><span className="text-gray-200">.ks-radio</span>, <span className="text-gray-200">.ks-radio-sm</span>, <span className="text-gray-200">.ks-radio-lg</span> — radio buttons</li>
                <li><span className="text-gray-200">.ks-toggle</span>, <span className="text-gray-200">.ks-toggle-sm</span>, <span className="text-gray-200">.ks-toggle-lg</span> — toggle switches</li>
                <li><span className="text-gray-200">.ks-label</span>, <span className="text-gray-200">.ks-hint</span> — labels & help text</li>
                <li><span className="text-gray-200">.ks-field</span>, <span className="text-gray-200">.ks-field-inline</span>, <span className="text-gray-200">.ks-form-group</span>, <span className="text-xs text-gray-200">.ks-form-row</span> — field wrappers</li>
                <li><span className="text-gray-200">.ks-file-input</span>, <span className="text-gray-200">.ks-color-input</span>, <span className="text-gray-200">.ks-range</span>, <span className="text-gray-200">.ks-search-input</span> — specialized inputs</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Layout & Components</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">.glass-card</span>, <span className="text-gray-200">.glass-strong</span>, <span className="text-gray-200">.glass-chrome</span> — glass surfaces</li>
                <li><span className="text-gray-200">.ks-sidebar-bg</span>, <span className="text-gray-200">.ks-nav-item</span>, <span className="text-gray-200">.ks-nav-active</span> — sidebar</li>
                <li><span className="text-gray-200">.ks-header-bg</span> — header bar</li>
                <li><span className="text-gray-200">.ks-tab</span>, <span className="text-gray-200">.ks-tab-active</span> — tab pills</li>
                <li><span className="text-gray-200">.glass-dropdown</span>, <span className="text-gray-200">.ks-dropdown</span>, <span className="text-gray-200">.ks-dropdown-item</span> — dropdown menus</li>
                <li><span className="text-gray-200">.kspanel-bg-overlay</span> — page background fill</li>
                <li><span className="text-gray-200">.rich-menu</span>, <span className="text-gray-200">.rich-submenu</span> — rich menus</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Utilities</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">--ks-*</span> CSS variables (see other tabs) — themeable tokens</li>
                <li><span className="text-gray-200">--ks-ui-primary/secondary/success/warning/danger/muted</span> — semantic colours (Utilities tab)</li>
                <li><span className="text-gray-200">--ks-space-base, --ks-radius-*-u, --ks-elev-1..4, --ks-t-fast/normal/slow/vslow, --ks-z-*</span> — design tokens (Utilities tab)</li>
                <li><span className="text-gray-200">--ks-chart-grid / --ks-chart-dot / --ks-chart-track</span> — chart hairlines, dots and gauge tracks</li>
                <li><span className="text-gray-200">.ks-input-mono</span> — monospace input</li>
                <li><span className="text-gray-200">.ks-card-grid</span> — responsive card grid</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-1">Unique IDs (examples)</h4>
              <ul className="text-xs text-gray-400 space-y-1 font-mono leading-relaxed">
                <li><span className="text-gray-200">#ks-total</span>, <span className="text-gray-200">#ks-running</span>, <span className="text-gray-200">#ks-stopped</span> — instance stats</li>
                <li><span className="text-gray-200">#ks-up</span>, <span className="text-gray-200">#ks-down</span>, <span className="text-gray-200">#ks-pending</span> — node stats</li>
                <li><span className="text-gray-200">#ks-instance-{'{id}'}</span> — instance cards</li>
                <li><span className="text-gray-200">#ks-node-{'{id}'}</span> — node cards</li>
                <li><span className="text-gray-200">#ks-template-{'{id}'}</span> — template cards</li>
                <li><span className="text-gray-200">#ks-user-{'{id}'}</span> — user cards</li>
                <li><span className="text-gray-200">#ks-role-{'{id}'}</span> — role cards</li>
                <li><span className="text-gray-200">#ks-stats-instances</span>, <span className="text-gray-200">#ks-nodes-grid</span>, <span className="text-gray-200">#ks-users-grid</span> — grid containers</li>
              </ul>
            </div>
          </div>
        </div>
    </div>
  );
};