import React from 'react';
import GlassCard from '@/shared/components/ui/Card';

export interface FormTabDef {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface FormTabsProps {
  tabs: FormTabDef[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

// FormTabs implements the Node-form tab pattern shared by every panel form:
//   - desktop: vertical rail on the left, sticky while the form scrolls
//   - phone: fixed bar pinned to the viewport bottom (never rides up when
//     content is short), horizontally scrollable
//   - spacer reserves scroll room so the fixed bar never covers content
//
// NodeForm.tsx is the reference implementation — this component extracts
// that exact markup so Template / ApiKey / Role / Instance-Pages forms stay
// in parity without copy-pasting the nav twice per file.
const FormTabs: React.FC<FormTabsProps> = ({ tabs, value, onChange, ariaLabel }) => {
  return (
    <>
      {/* Desktop tabs — vertical on the left, sticky while scrolling. */}
      <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
        <nav aria-label={ariaLabel} className="flex lg:flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={value === t.id}
              disabled={t.disabled}
              onClick={() => !t.disabled && onChange(t.id)}
              className={`ks-tab w-full flex items-center gap-2 transition text-left ${
                value === t.id ? 'ks-tab-active' : ''
              } ${t.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {t.icon && <span className="inline-flex items-center shrink-0">{t.icon}</span>}
              <span className="flex flex-col min-w-0">
                <span>{t.label}</span>
                {t.hint && (
                  <span
                    className={`text-[10px] hidden lg:block ${value === t.id ? 'opacity-70' : 'text-gray-500'}`}
                    style={value === t.id ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                  >
                    {t.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>
      </GlassCard>

      {/* Phone tabs — fixed to the viewport bottom so the bar never rides
          up when a tab's content is short. inset-x-4 lines it up with the
          page padding; safe-area keeps it above the home indicator. */}
      <nav aria-label={ariaLabel} className="lg:hidden fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30">
        <div className="ks-card rounded-md p-1.5 flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={value === t.id}
              disabled={t.disabled}
              onClick={() => !t.disabled && onChange(t.id)}
              className={`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${value === t.id ? 'ks-tab-active' : ''} ${t.disabled ? 'opacity-50' : ''}`}
            >
              {t.icon && <span className="inline-flex items-center shrink-0">{t.icon}</span>}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {/* Spacer — reserves scroll room so the fixed bottom tab bar never
          covers trailing form content. Rendered here so every consumer gets
          it automatically; hidden on desktop where the bar doesn't exist.
          It must sit OUTSIDE the <form> grid (after FormPage) to actually
          extend the page — callers should render <FormTabs> split via
          desktopOnly/mobileOnly when the grid layout requires it. By default
          this spacer is included; pass nothing to opt out. */}
      <div aria-hidden="true" className="h-24 lg:hidden" />
    </>
  );
};

export default FormTabs;
