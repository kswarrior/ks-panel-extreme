import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getInstance, updateInstance } from '@/shared/api/admin';
import { parseConfig } from '@/shared/hooks/useInstance';
import { resolveInstanceControls } from '../utils/instanceControls';
import FormPage from '@/shared/components/forms/FormPage';
import GlassCard from '@/shared/components/ui/Card';
import type { DriverKind } from '../types/instance';
import { DeployFormProvider, useDeployForm } from '../stores/deployFormStore';
import { serializeEditor, specToEditor, structuredCloneSafe } from '../utils/instanceFormUtils';
import InstanceAdvancedOptionsFullScreen from './InstanceAdvancedOptionsFullScreen';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

// envMapToDefinitions converts the resolved {KEY: value} env map stored on
// deployed instances (deploy bakes finalEnv into config.env as a plain map)
// into the template-style definition rows specToEditor expects, so the Env
// tab shows the instance's live values instead of an empty list. Each row
// keeps the current value as its default; the backend converts back to a
// flat map on save (normalizeInstanceConfigForStore).
function envMapToDefinitions(cfg: Record<string, any>): void {
  const env = cfg.env;
  if (Array.isArray(env) || !env || typeof env !== 'object') return;
  cfg.env = Object.entries(env).map(([name, value]) => ({
    name,
    label: '',
    description: '',
    default: String(value ?? ''),
    user_viewable: true,
    user_editable: true,
    required: false,
    rule: '',
    display: 'text',
    options: '',
    prepend: '',
    append: false,
    append_value: '',
  }));
}

const InstanceEditAdvancedInner: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const instanceId = Number(params.id);
  const validId = Number.isInteger(instanceId) && instanceId > 0;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [blockedByTemplate, setBlockedByTemplate] = useState(false);
  const [templateMeta, setTemplateMeta] = useState<{ image: string; kind: DriverKind } | null>(null);

  const { editor, setEditor, setTab } = useDeployForm();

  useEffect(() => {
    if (!validId) {
      setLoadError('Invalid instance id.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const inst = await getInstance(instanceId);
        if (cancelled) return;
        // Template allow-list: the author may hide advanced-config editing
        // for this template (the server enforces it too — this is the UI gate).
        if (!resolveInstanceControls(inst.config).allow_edit_advanced) {
          setBlockedByTemplate(true);
          return;
        }
        const cfg = parseConfig(inst.config);
        envMapToDefinitions(cfg);
        const ed = specToEditor(JSON.stringify(cfg));
        setEditor(structuredCloneSafe(ed));
        setTab('environment');
        setTemplateMeta({
          image: String(cfg.image || ''),
          kind: inst.kind as DriverKind,
        });
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.response?.data || e?.message || 'Failed to load instance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [validId, instanceId, setEditor, setTab]);

  const specPreview = useMemo(() => JSON.stringify(serializeEditor(editor), null, 2), [editor]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const spec = serializeEditor(editor) as Record<string, unknown>;
      // serializeEditor leaves these keys undefined when cleared, and
      // JSON.stringify then drops them entirely — but the backend merge is
      // per-key additive, so a dropped key would silently keep the old
      // value. Re-add explicit empties so "cleared" actually clears.
      if (!('command' in spec)) spec.command = [];
      if (!('healthcheck' in spec)) spec.healthcheck = null;
      if (!('install_timeout_sec' in spec)) spec.install_timeout_sec = null;
      const res = await updateInstance(instanceId, { config: spec });
      if (res.recreated) {
        alert(
          'Saved. The changed settings require a recreate — the workload is being destroyed and ' +
          'redeployed with the new config on its node (this wipes container state and re-runs install).'
        );
      }
      navigate(`/instances/${instanceId}`);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.response?.data || err?.message || 'Failed to save instance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Edit Instance' }]}
        saving={false}
        maxWidth="max-w-4xl"
      >
        <FormSkeleton fields={5} />
      </FormPage>
    );
  }

  if (loadError || !validId) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Edit Instance' }]}
        saving={false}
        maxWidth="max-w-4xl"
      >
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {loadError || 'Instance not found.'}
        </GlassCard>
      </FormPage>
    );
  }

  if (blockedByTemplate) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Edit Instance' }]}
        saving={false}
        maxWidth="max-w-4xl"
      >
        <GlassCard className="text-sm text-gray-300 border border-white/10">
          <p className="font-medium text-white">Advanced config is disabled for this instance.</p>
          <p className="text-xs text-gray-500 mt-1">The template does not allow editing ports, env, volumes or other driver options on instances deployed from it.</p>
          <button
            type="button"
            onClick={() => navigate(`/instances/${instanceId}`)}
            className="ks-btn-form mt-3"
          >
            Back to instance
          </button>
        </GlassCard>
      </FormPage>
    );
  }

  return (
    <>
      {saveError && (
        <GlassCard className="mb-4 text-sm text-red-300 border border-red-700/40">
          {typeof saveError === 'string' ? saveError : JSON.stringify(saveError)}
        </GlassCard>
      )}
      <InstanceAdvancedOptionsFullScreen
        selectedTemplate={templateMeta}
        specPreview={specPreview}
        onClose={() => navigate(`/instances/${instanceId}`)}
        title={`Edit Instance #${instanceId}`}
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: `Edit Instance #${instanceId}` }]}
        cancelTo={`/instances/${instanceId}`}
        submitLabel="Save Changes"
        submittingLabel="Saving…"
        saving={saving}
        onSubmit={save}
      />
    </>
  );
};

// InstanceEditAdvanced mounts its own DeployFormProvider (with an empty
// template list) so the shared Advance-Options editor can consume
// useDeployForm unchanged. templateId stays 0, which disables the provider's
// template-seeding effect — the editor is seeded from the instance's saved
// config instead.
const InstanceEditAdvanced: React.FC = () => (
  <DeployFormProvider templates={[]}>
    <InstanceEditAdvancedInner />
  </DeployFormProvider>
);

export default InstanceEditAdvanced;
