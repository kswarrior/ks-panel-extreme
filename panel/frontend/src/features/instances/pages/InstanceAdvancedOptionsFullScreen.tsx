import React from 'react';
import { TemplateTabs } from '@/features/templates/components/TemplateFormComponents';
import { TEMPLATE_TABS } from '@/features/templates/types/templateForm';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import PillHistoryControls from '@/shared/components/ui/PillHistoryControls';
import { useFormHistory } from '@/shared/hooks/useFormHistory';
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
  const { tab, setTab, editor, setEditor, envValues, setEnvValues, imageKey, setImageKey } = useDeployForm();

  // Session edit history over the advanced editor slice. Per-view instance:
  // the deploy flow and the edit flow each mount this view separately, and
  // Main <-> Advance navigation remounts with a fresh stack. Refresh
  // reverts to the values this view opened with (loaded instance config in
  // the edit flow, current draft in the deploy flow) — never a reset.
  const snapshot = JSON.stringify({ editor, envValues, imageKey });
  const hist = useFormHistory(snapshot, (snapStr) => {
    const s = JSON.parse(snapStr);
    setEditor(s.editor);
    setEnvValues(s.envValues);
    setImageKey(s.imageKey);
  });

  return (
    <div className="relative min-h-screen">
      <ThemedBackground />
      {/* Bottom-right form actions — undo / redo (+ Save in
          the edit flow); fixed, auto-hide on scroll (node pattern). */}
      <PageFormActionsPill spacer={false}>
          <PillHistoryControls hist={hist} />
          {submitLabel && (
            <button
              type="button"
              onClick={() => { hist.commit(); onSubmit?.({ preventDefault: () => {} } as React.FormEvent); }}
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
