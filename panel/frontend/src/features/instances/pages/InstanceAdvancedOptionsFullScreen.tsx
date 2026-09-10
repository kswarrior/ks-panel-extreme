import React from 'react';
import { TemplateTabs } from '@/features/templates/components/TemplateFormComponents';
import { TEMPLATE_TABS } from '@/features/templates/types/templateForm';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';
import { useDeployForm } from '../stores/deployFormStore';
import InstanceAdvancedTabContent from '../components/InstanceAdvancedTabContent';
import type { DriverKind } from '../types/instance';

interface InstanceAdvancedOptionsFullScreenProps {
  selectedTemplate: { image: string; kind: DriverKind } | null;
  specPreview: string;
  onClose: () => void;
  // Optional chrome/save overrides so the instance EDIT page can reuse this
  // exact tabbed editor with its own title, breadcrumbs and Save action.
  // Unset values fall back to the deploy-flow defaults below.
  title?: string;
  crumbs?: Array<{ label: string; to?: string }>;
  cancelTo?: string;
  submitLabel?: string;
  submittingLabel?: string;
  saving?: boolean;
  onSubmit?: (e: React.FormEvent) => void;
}

const ADVANCED_TABS = TEMPLATE_TABS.filter((t) => t.id !== 'general');

const InstanceAdvancedOptionsFullScreen: React.FC<InstanceAdvancedOptionsFullScreenProps> = ({
  selectedTemplate,
  specPreview,
  onClose,
  title = 'Advance Option',
  crumbs = [{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }, { label: 'Advance Option' }],
  cancelTo = '/instances/new',
  submitLabel,
  submittingLabel,
  saving = false,
  onSubmit,
}) => {
  const { tab, setTab } = useDeployForm();

  return (
    <div className="relative min-h-screen">
      <ThemedBackground />
      {/* Bottom-right form actions — fixed, auto-hide on scroll (node pattern).
          Back lives here (was headerActions); Save only when submitLabel set
          (edit flow). Deploy flow has no save — just Back. */}
      <PageFormActionsPill spacer={false}>
          <button
            type="button"
            onClick={onClose}
            title="Back"
            aria-label="Back"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Back
          </button>
          {submitLabel && (
            <button
              type="button"
              onClick={() => onSubmit?.({ preventDefault: () => {} } as React.FormEvent)}
              disabled={saving}
              title={submitLabel}
              className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
              style={PILL_TAB_STYLE}
            >
              {saving ? (submittingLabel || 'Saving…') : submitLabel}
            </button>
          )}
      </PageFormActionsPill>
      <FormPage
        crumbs={crumbs}
        onSubmit={onSubmit}
        maxWidth="max-w-4xl"
        hideHeader
      >
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <TemplateTabs tab={tab} onChange={setTab} tabs={ADVANCED_TABS} />
          <div className="mt-2 min-w-0 max-w-full">
            <InstanceAdvancedTabContent selectedTemplate={selectedTemplate} specPreview={specPreview} />
          </div>
        </div>
      </FormPage>
      {/* Spacer — reserves scroll room so the fixed bottom tab bar never
          covers trailing form content (node pattern). */}
      <div aria-hidden="true" className="h-24 lg:hidden" />
    </div>
  );
};

export default InstanceAdvancedOptionsFullScreen;
