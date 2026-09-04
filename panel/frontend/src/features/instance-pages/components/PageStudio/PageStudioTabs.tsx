// PageStudioTabs — tab rail for the Instance Page Studio
//
// Mirrors panel/frontend/src/features/templates/components/TemplateFormComponents.tsx
// (TemplateTabs) — GlassCard + ks-tab + hint line, sticky on desktop.
// Kept in parity with TemplateTabs so /instance-pages/studio and /templates/new
// share identical tab chrome, spacing and GlassCard surface.

import React from 'react';
import type { PageStudioTabId } from '@/features/instance-pages/types/pageStudio';
import { PAGE_STUDIO_TABS } from '@/features/instance-pages/types/pageStudio';
import GlassCard from '@/shared/components/ui/Card';

interface PageStudioTabsProps {
  tab: PageStudioTabId;
  onChange: (id: PageStudioTabId) => void;
  isBuiltin?: boolean;
  tabs?: typeof PAGE_STUDIO_TABS;
}

// Icons — same set as the legacy monolithic Studio's TAB_CONFIG so the
// visual identity stays identical after the split.
function EditorIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> </svg>;
}
function TerminalIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/> </svg>;
}
function PreviewIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/> </svg>;
}
function PagesIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/><path d="M9 15h6"/><path d="M9 11h2"/></svg>;
}
function SettingsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/> </svg>;
}
function ComponentsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function ConfigureIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>;
}

export const PageStudioTabs: React.FC<PageStudioTabsProps> = ({ tab, onChange, isBuiltin, tabs }) => {
  const meta: Record<PageStudioTabId, { label: string; hint: string; icon: React.ReactNode }> = {
    editor: { label: 'Main page', hint: 'HTML · Markdown · Blocks', icon: <EditorIcon /> },
    subpages: { label: 'Sub-pages', hint: 'Extra routes (/files/edit…)', icon: <PagesIcon /> },
    actions: { label: 'Actions', hint: 'Saved executable actions', icon: <TerminalIcon /> },
    components: { label: 'Components', hint: 'Reusable page components', icon: <ComponentsIcon /> },
    configure: { label: 'Configure', hint: 'Page variables (like env)', icon: <ConfigureIcon /> },
    preview: { label: 'Preview', hint: 'Live render on an instance', icon: <PreviewIcon /> },
    settings: { label: 'Settings', hint: 'Meta, icon, import/export', icon: <SettingsIcon /> },
  };

  const tabList = tabs ?? PAGE_STUDIO_TABS;
  const items = tabList.map((t) => ({ id: t.id as PageStudioTabId, ...meta[t.id as PageStudioTabId] }));

  return (
    <>
      {/* Desktop tabs — vertical on the left, sticky (node pattern). */}
      <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
        <nav aria-label="Page studio sections" className="flex lg:flex-col gap-1">
          {items.map((t) => {
            const disabled = isBuiltin && t.id !== 'preview';
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => !disabled && onChange(t.id)}
                disabled={disabled}
                className={`ks-tab w-full flex items-center gap-2 transition text-left ${tab === t.id ? 'ks-tab-active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="inline-flex items-center shrink-0">{t.icon}</span>
                <span className="flex flex-col min-w-0">
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] hidden lg:block ${tab === t.id ? 'opacity-70' : 'text-gray-500'}`}
                    style={tab === t.id ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                  >
                    {t.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </GlassCard>
      {/* Phone tabs — fixed to viewport bottom (node pattern). */}
      <nav aria-label="Page studio sections" className="lg:hidden fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30">
        <div className="ks-card rounded-md p-1.5 flex gap-1 overflow-x-auto scrollbar-hide">
          {items.map((t) => {
            const disabled = isBuiltin && t.id !== 'preview';
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => !disabled && onChange(t.id)}
                disabled={disabled}
                className={`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${tab === t.id ? 'ks-tab-active' : ''} ${disabled ? 'opacity-50' : ''}`}
              >
                <span className="inline-flex items-center shrink-0">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
