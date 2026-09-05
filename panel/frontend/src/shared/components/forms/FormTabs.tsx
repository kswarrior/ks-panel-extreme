import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';

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

// FormTabsDesktop renders only the desktop left rail (hidden on phones).
// Use inside the form grid: grid-cols-1 lg:grid-cols-[220px_1fr].
export const FormTabsDesktop: React.FC<FormTabsProps> = ({ tabs, value, onChange, ariaLabel }) => {
  return (
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
  );
};

// FormTabsMobile renders the phone bottom bar as a PageTabsPill (fixed +
// `>` / `<` toggle + auto-off, same system as the actions pill) + the spacer
// that reserves scroll room so the bar never covers trailing content. Render
// inside <FormPage> (bar) — the spacer may live inside or just after the
// form; fixed positioning makes the bar location irrelevant.
export const FormTabsMobile: React.FC<FormTabsProps & { spacer?: boolean }> = ({
  tabs,
  value,
  onChange,
  ariaLabel,
  spacer = true,
}) => {
  return (
    <PageTabsPill ariaLabel={ariaLabel} spacer={spacer} activeLabel={tabs.find((t) => t.id === value)?.label}>
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
    </PageTabsPill>
  );
};

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
      <FormTabsDesktop tabs={tabs} value={value} onChange={onChange} ariaLabel={ariaLabel} />
      <FormTabsMobile tabs={tabs} value={value} onChange={onChange} ariaLabel={ariaLabel} />
    </>
  );
};

export default FormTabs;
