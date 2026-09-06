import React, { useCallback } from 'react';
import { TemplateTabs } from '@/features/templates/components/TemplateFormComponents';
import { TEMPLATE_TABS } from '@/features/templates/types/templateForm';
import {
  TemplateEnvironmentSection,
  TemplateEnvVariablesSection,
  TemplateActionsSection,
  TemplateInstallSection,
  TemplateRuntimeSection,
  TemplateLabelsDevicesSection,
  TemplateHealthcheckSection,
  TemplateSpecPreviewSection,
  TemplatePagesSection,
} from '@/features/templates/components/TemplateForm';
import { glassFieldClass } from '@/shared/components/ui/Field';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';
import { useDeployForm } from '../stores/deployFormStore';
import type {
  EditorState,
  EnvVariable,
  PortMapping,
  Mount,
  ResourceLimits,
  FeatureCaps,
  InstallStep,
  TemplateAction,
  ActionStep,
  Label,
  Device,
  Healthcheck,
  Advanced,
  PageOverride,
  InstanceTabId,
  KvRuntime,
  MpRuntime,
  LxdRuntime,
} from '../types/instanceForm';
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

const ADVANCED_TABS = TEMPLATE_TABS.filter((t) => t.id !== 'general' && t.id !== 'controls');

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
  const monoCls = glassFieldClass + ' font-mono ks-input-mono';
  const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';
  const sectionCls = 'border border-white/10 rounded-lg p-4 space-y-4 bg-black/20 ks-form-group';
  const addBtn = 'text-xs text-sky-300 hover:text-sky-200 underline';

  const { editor, setEditor, envValues, setEnvValues, tab, setTab } = useDeployForm();

  const updateEnv = useCallback(
    (i: number, patch: Partial<EnvVariable>) =>
      setEditor((f) => {
        const e = [...f.env];
        e[i] = { ...e[i], ...patch };
        return { ...f, env: e };
      }),
    [setEditor],
  );
  const addEnv = useCallback(
    () =>
      setEditor((f) => ({
        ...f,
        env: [
          ...f.env,
          {
            name: '',
            label: '',
            description: '',
            default: '',
            user_viewable: true,
            user_editable: true,
            required: false,
            rule: '',
            display: 'text',
            options: '',
            prepend: '',
            append: false,
            append_value: '',
          },
        ],
      })),
    [setEditor],
  );
  const delEnv = useCallback(
    (i: number) => setEditor((f) => ({ ...f, env: f.env.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updatePort = useCallback(
    (i: number, patch: Partial<PortMapping>) =>
      setEditor((f) => {
        const p = [...f.ports];
        p[i] = { ...p[i], ...patch };
        return { ...f, ports: p };
      }),
    [setEditor],
  );
  const addPort = useCallback(
    () => setEditor((f) => ({ ...f, ports: [...f.ports, { host: '', guest: '', protocol: 'tcp' }] })),
    [setEditor],
  );
  const delPort = useCallback(
    (i: number) => setEditor((f) => ({ ...f, ports: f.ports.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updateMount = useCallback(
    (i: number, patch: Partial<Mount>) =>
      setEditor((f) => {
        const m = [...f.mounts];
        m[i] = { ...m[i], ...patch };
        return { ...f, mounts: m };
      }),
    [setEditor],
  );
  const addMount = useCallback(
    () => setEditor((f) => ({ ...f, mounts: [...f.mounts, { source: '', target: '', mode: 'rw' }] })),
    [setEditor],
  );
  const delMount = useCallback(
    (i: number) => setEditor((f) => ({ ...f, mounts: f.mounts.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updateLimits = useCallback(
    (patch: Partial<ResourceLimits>) => setEditor((f) => ({ ...f, limits: { ...f.limits, ...patch } })),
    [setEditor],
  );
  const updateCaps = useCallback(
    (patch: Partial<FeatureCaps>) => setEditor((f) => ({ ...f, caps: { ...f.caps, ...patch } })),
    [setEditor],
  );

  const updateInstall = useCallback(
    (i: number, patch: Partial<InstallStep>) =>
      setEditor((f) => {
        const s = [...f.install];
        s[i] = { ...s[i], ...patch };
        return { ...f, install: s };
      }),
    [setEditor],
  );
  const addInstall = useCallback(
    () =>
      setEditor((f) => ({
        ...f,
        install: [
          ...f.install,
          {
            action: 'shell',
            command: '',
            url: '',
            filename: '',
            archive: '',
            dest: '',
            from: '',
            to: '',
            path: '',
            content: '',
            branch: 'main',
            retries: '0',
            ignore_errors: false,
          },
        ],
      })),
    [setEditor],
  );
  const delInstall = useCallback(
    (i: number) => setEditor((f) => ({ ...f, install: f.install.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updateAction = useCallback(
    (i: number, patch: Partial<TemplateAction>) =>
      setEditor((f) => {
        const a = [...f.actions];
        a[i] = { ...a[i], ...patch };
        return { ...f, actions: a };
      }),
    [setEditor],
  );
  const addAction = useCallback(
    () =>
      setEditor((f) => ({
        ...f,
        actions: [
          ...f.actions,
          {
            id: '',
            name: '',
            description: '',
            icon_svg: '',
            icon_color: '',
            allowed_states: '',
            requires_online: false,
            async_run: false,
            run_on_create: false,
            cooldown_s: '0',
            user_invokable: false,
            session: 'long_running',
            auto_start_instance: false,
            auto_stop_on_exit: false,
            restart_on_failure: false,
            allowed_commands: '',
            blocked_commands: '',
            max_runtime_s: '0',
            stop_command: '',
            stop_mode: 'different',
            steps: [],
          },
        ],
      })),
    [setEditor],
  );
  const delAction = useCallback(
    (i: number) => setEditor((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updateActionStep = useCallback(
    (actionIdx: number, stepIdx: number, patch: Partial<ActionStep>) =>
      setEditor((f) => {
        const a = [...f.actions];
        const s = [...a[actionIdx].steps];
        s[stepIdx] = { ...s[stepIdx], ...patch };
        a[actionIdx] = { ...a[actionIdx], steps: s };
        return { ...f, actions: a };
      }),
    [setEditor],
  );
  const addActionStep = useCallback(
    (actionIdx: number) =>
      setEditor((f) => {
        const a = [...f.actions];
        a[actionIdx] = {
          ...a[actionIdx],
          steps: [
            ...a[actionIdx].steps,
            {
              action: 'shell',
              command: '',
              url: '',
              filename: '',
              archive: '',
              dest: '',
              from: '',
              to: '',
              path: '',
              content: '',
              branch: 'main',
              retries: '0',
              ignore_errors: false,
            },
          ],
        };
        return { ...f, actions: a };
      }),
    [setEditor],
  );
  const delActionStep = useCallback(
    (actionIdx: number, stepIdx: number) =>
      setEditor((f) => {
        const a = [...f.actions];
        a[actionIdx] = {
          ...a[actionIdx],
          steps: a[actionIdx].steps.filter((_, j) => j !== stepIdx),
        };
        return { ...f, actions: a };
      }),
    [setEditor],
  );

  const updateLabel = useCallback(
    (i: number, patch: Partial<Label>) =>
      setEditor((f) => {
        const l = [...f.labels];
        l[i] = { ...l[i], ...patch };
        return { ...f, labels: l };
      }),
    [setEditor],
  );
  const addLabel = useCallback(
    () => setEditor((f) => ({ ...f, labels: [...f.labels, { key: '', value: '' }] })),
    [setEditor],
  );
  const delLabel = useCallback(
    (i: number) => setEditor((f) => ({ ...f, labels: f.labels.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updateDevice = useCallback(
    (i: number, patch: Partial<Device>) =>
      setEditor((f) => {
        const d = [...f.devices];
        d[i] = { ...d[i], ...patch };
        return { ...f, devices: d };
      }),
    [setEditor],
  );
  const addDevice = useCallback(
    () => setEditor((f) => ({ ...f, devices: [...f.devices, { host: '', container: '', cgroup: false }] })),
    [setEditor],
  );
  const delDevice = useCallback(
    (i: number) => setEditor((f) => ({ ...f, devices: f.devices.filter((_, j) => j !== i) })),
    [setEditor],
  );

  const updatePage = useCallback(
    (i: number, patch: Partial<PageOverride>) =>
      setEditor((f) => {
        const p = [...f.pages];
        p[i] = { ...p[i], ...patch };
        return { ...f, pages: p };
      }),
    [setEditor],
  );
  const removePage = useCallback(
    (i: number) => setEditor((f) => ({ ...f, pages: f.pages.filter((_, j) => j !== i) })),
    [setEditor],
  );
  const movePage = useCallback(
    (i: number, dir: -1 | 1) =>
      setEditor((f) => {
        const j = i + dir;
        if (j < 0 || j >= f.pages.length) return f;
        const p = [...f.pages];
        [p[i], p[j]] = [p[j], p[i]];
        return { ...f, pages: p };
      }),
    [setEditor],
  );

  const addCustomPage = useCallback(
    () =>
      setEditor((f) => ({
        ...f,
        pages: [
          ...f.pages,
          {
            slug: 'custom-page',
            original_slug: '',
            enabled: true,
            label: 'Custom Page',
            icon_svg: '',
            kind: 'custom',
            content_type: 'markdown',
            content_html: '',
            content_markdown: '# Custom Page\n\nAdd your content here.',
            content_blocks: '',
            components: [],
          },
        ],
      })),
    [setEditor],
  );
  const addCustomPageWithContent = useCallback(
    (np: PageOverride) =>
      setEditor((f) => {
        if (f.pages.some((p) => p.slug === np.slug)) return f;
        return {
          ...f,
          pages: [
            ...f.pages,
            {
              slug: np.slug,
              original_slug: '',
              enabled: np.enabled !== false,
              label: np.label || np.slug,
              icon_svg: np.icon_svg || '',
              kind: 'custom',
              content_type: np.content_type || 'markdown',
              content_html: np.content_html || '',
              content_markdown: np.content_markdown || '',
              content_blocks: np.content_blocks || '',
              ...(np.actions && np.actions.length > 0 ? { actions: np.actions } : {}),
              ...(np.sub_pages && np.sub_pages.length > 0 ? { sub_pages: np.sub_pages } : {}),
              ...(np.components && np.components.length > 0 ? { components: np.components } : {}),
            },
          ],
        };
      }),
    [setEditor],
  );

  const updateHealthcheck = useCallback(
    (patch: Partial<Healthcheck>) => setEditor((f) => ({ ...f, healthcheck: { ...f.healthcheck, ...patch } })),
    [setEditor],
  );
  const updateAdvanced = useCallback(
    (patch: Partial<Advanced>) => setEditor((f) => ({ ...f, advanced: { ...f.advanced, ...patch } })),
    [setEditor],
  );
  const updateKvmRuntime = useCallback(
    (patch: Partial<KvRuntime>) =>
      setEditor((f) => ({ ...f, advanced: { ...f.advanced, kvm: { ...f.advanced.kvm, ...patch } } })),
    [setEditor],
  );
  const updateMpRuntime = useCallback(
    (patch: Partial<MpRuntime>) =>
      setEditor((f) => ({
        ...f,
        advanced: { ...f.advanced, multipass: { ...f.advanced.multipass, ...patch } },
      })),
    [setEditor],
  );
  const updateLxdRuntime = useCallback(
    (patch: Partial<LxdRuntime>) =>
      setEditor((f) => ({ ...f, advanced: { ...f.advanced, lxd: { ...f.advanced.lxd, ...patch } } })),
    [setEditor],
  );

  return (
    <div className="relative min-h-screen">
      <ThemedBackground />
      {/* Top-right actions — fixed, auto-hide on scroll (node pattern).
          Back lives here (was headerActions); Save only when submitLabel set
          (edit flow). Deploy flow has no save — just Back. */}
      <PageActionsPill>
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
      </PageActionsPill>
      <FormPage
        crumbs={crumbs}
        onSubmit={onSubmit}
        maxWidth="max-w-4xl"
        hideHeader
      >
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          <TemplateTabs tab={tab} onChange={setTab} tabs={ADVANCED_TABS} />
          <div className="space-y-4 mt-2">
          {tab === 'environment' && (
              selectedTemplate ? (
                <TemplateEnvironmentSection
                  image={selectedTemplate.image}
                  kind={selectedTemplate.kind}
                  ports={editor.ports}
                  onPortUpdate={updatePort}
                  onPortAdd={addPort}
                  onPortDelete={delPort}
                  mounts={editor.mounts}
                  onMountUpdate={updateMount}
                  onMountAdd={addMount}
                  onMountDelete={delMount}
                  limits={editor.limits}
                  onLimitsUpdate={updateLimits}
                  caps={editor.caps}
                  onCapsUpdate={updateCaps}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its environment options.
                </div>
              )
          )}

          {tab === 'env' && (
              selectedTemplate ? (
                <TemplateEnvVariablesSection
                  env={editor.env}
                  onEnvUpdate={updateEnv}
                  onEnvAdd={addEnv}
                  onEnvDelete={delEnv}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its environment variables.
                </div>
              )
          )}

          {tab === 'actions' && (
              selectedTemplate ? (
                <TemplateActionsSection
                  actions={editor.actions}
                  onActionUpdate={updateAction}
                  onActionAdd={addAction}
                  onActionDelete={delAction}
                  onActionStepUpdate={updateActionStep}
                  onActionStepAdd={addActionStep}
                  onActionStepDelete={delActionStep}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its actions.
                </div>
              )
          )}

          {tab === 'install' && (
              selectedTemplate ? (
                <TemplateInstallSection
                  install={editor.install}
                  onInstallUpdate={updateInstall}
                  onInstallAdd={addInstall}
                  onInstallDelete={delInstall}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its install workflow.
                </div>
              )
          )}

          {tab === 'runtime' && (
              selectedTemplate ? (
                <TemplateRuntimeSection
                  kind={selectedTemplate.kind}
                  advanced={editor.advanced}
                  onAdvancedUpdate={updateAdvanced}
                  onKvmRuntimeUpdate={updateKvmRuntime}
                  onMpRuntimeUpdate={updateMpRuntime}
                  onLxdRuntimeUpdate={updateLxdRuntime}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its runtime configuration.
                </div>
              )
          )}

          {tab === 'labels' && (
              selectedTemplate ? (
                <TemplateLabelsDevicesSection
                  labels={editor.labels}
                  onLabelUpdate={updateLabel}
                  onLabelAdd={addLabel}
                  onLabelDelete={delLabel}
                  devices={editor.devices}
                  onDeviceUpdate={updateDevice}
                  onDeviceAdd={addDevice}
                  onDeviceDelete={delDevice}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its labels and devices.
                </div>
              )
          )}

          {tab === 'healthcheck' && (
              selectedTemplate ? (
                <TemplateHealthcheckSection
                  healthcheck={editor.healthcheck}
                  onHealthcheckUpdate={updateHealthcheck}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its healthcheck.
                </div>
              )
          )}

          {tab === 'pages' && (
              selectedTemplate ? (
                <TemplatePagesSection
                  pages={editor.pages}
                  onPageUpdate={updatePage}
                  onPageDelete={removePage}
                  onPageMove={movePage}
                  onAddPages={(newPages) => {
                    newPages.forEach((np) => {
                      if (np.kind === 'custom') {
                        addCustomPageWithContent(np);
                      } else {
                        addCustomPage();
                      }
                    });
                  }}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to reveal its panel pages.
                </div>
              )
          )}

          {tab === 'spec' && (
              selectedTemplate ? (
                <TemplateSpecPreviewSection
                  specPreview={specPreview}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                />
              ) : (
                <div className="text-center text-gray-400 text-sm py-6">
                  Pick a template on the General section to inspect the generated spec.
                </div>
              )
          )}
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
