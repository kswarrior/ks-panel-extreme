// NodeTabs — tab rail for the Node form.
//
// Mirrors panel/frontend/src/features/templates/components/TemplateFormComponents.tsx
// (TemplateTabs) — GlassCard shell, ks-tab pills with icon + label + hint,
// vertical sticky rail on desktop (hidden on mobile — the bottom floating
// nav in NodeForm.tsx is the single mobile tab bar).

import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import type { NodeFormTabId } from '../types/nodeForm';
import { NODEFORM_TABS } from '../types/nodeForm';

const meta: Record<NodeFormTabId, { hint: string; icon: React.ReactNode }> = {
  general: {
    hint: 'Name, connection, identity',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /> </svg>,
  },
  health: {
    hint: 'Probe interval & retries',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /> </svg>,
  },
  limits: {
    hint: 'Kinds & resource caps',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /> </svg>,
  },
  location: {
    hint: 'Category & country',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /> </svg>,
  },
};

export const NodeTabs: React.FC<{ tab: NodeFormTabId; onChange: (id: NodeFormTabId) => void }> = ({ tab, onChange }) => {
  return (
    <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
      <nav className="flex lg:flex-col gap-1 overflow-x-auto" role="tablist" aria-label="Node form sections">
        {NODEFORM_TABS.map((t) => {
          const m = meta[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={`ks-tab shrink-0 flex items-center gap-2 transition text-left ${active ? 'ks-tab-active' : ''}`}
            >
              <span className="inline-flex items-center">{m.icon}</span>
              <span className="flex flex-col">
                <span>{t.label}</span>
                <span
                  className={`text-[10px] hidden lg:block ${active ? 'opacity-70' : 'text-gray-500'}`}
                  style={active ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                >
                  {m.hint}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </GlassCard>
  );
};

export default NodeTabs;
