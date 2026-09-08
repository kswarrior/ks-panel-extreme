import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import GlassField from '@/shared/components/ui/Field';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import {
  STACK_CATEGORIES,
  blankStackStudioDraft,
  emitStackStudioManifest,
  slugify,
} from '@/shared/types/stack';
import {
  createStackFromManifest,
  extractStackApiError,
} from '@/features/stacks/api/stacks';

type Tab = 'meta' | 'install' | 'launch' | 'permission';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'meta', label: 'General' },
  { key: 'install', label: 'Install' },
  { key: 'launch', label: 'Launch' },
  { key: 'permission', label: 'Permission' },
];

const sectionCls = 'ks-card ks-form-card rounded-lg space-y-4';

// ComingSoon — placeholder body for form sections that are not built yet.
// Keeps the tab chrome identical to real sections so wiring real content in
// later is a straight swap of the section body.
const ComingSoon: React.FC<{ heading: string }> = ({ heading }) => (
  <div className={sectionCls}>
    <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">{heading}</h4>
    <div className="text-center py-10">
      <p className="text-sm text-gray-300">Coming soon</p>
      <p className="text-xs text-gray-500 mt-1">This section is not available yet.</p>
    </div>
  </div>
);

// StackForm — routed create form at /stacks/new, mirroring TemplateForm's
// chrome (FormPage + bottom-right PageFormActionsPill with Cancel/Create).
// Only the General section edits fields today; Install / Launch /
// Permission are coming-soon placeholders. Submit installs through
// POST /api/stacks/ (X-KS-Source: studio) so the backend validates the
// manifest like any upload.
const StackForm: React.FC = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(blankStackStudioDraft);
  const [tab, setTab] = useState<Tab>('meta');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = (partial: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  };

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!draft.name.trim()) issues.push('Name is required.');
    if (!draft.slug.trim()) issues.push('Slug is required.');
    if (draft.slug && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(draft.slug)) issues.push('Slug must be lowercase letters, digits and hyphens (max 64).');
    return issues;
  }, [draft]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.name.trim()) { setError('Name is required'); setTab('meta'); return; }
    if (!draft.slug.trim()) { setError('Slug is required'); setTab('meta'); return; }
    if (validation.length > 0) { setError(validation[0]); setTab('meta'); return; }
    if (draft.color && !/^#[0-9a-fA-F]{6}$/.test(draft.color.trim())) { setError('Colour must be a #rrggbb hex value (or empty for default)'); setTab('meta'); return; }
    setSaving(true);
    setError('');
    try {
      const manifest = emitStackStudioManifest(draft);
      await createStackFromManifest(manifest, 'studio');
      navigate('/stacks');
    } catch (err: any) {
      setError(extractStackApiError(err, 'Failed to create stack'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageFormActionsPill spacer={false}>
        <button
          type="button"
          onClick={() => navigate('/stacks')}
          title="Cancel and back to Stacks"
          aria-label="Cancel and back to Stacks"
          className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
          style={PILL_TAB_STYLE}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          title="Create stack"
          className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
          style={PILL_TAB_STYLE}
        >
          {saving ? 'Saving…' : 'Create'}
        </button>
      </PageFormActionsPill>
      <FormPage
        crumbs={[{ label: 'Stacks', to: '/stacks' }, { label: 'New Stack' }]}
        onSubmit={(e) => void submit(e)}
        maxWidth="max-w-4xl"
        hideHeader
      >
        {error && (
          <div className="text-xs text-red-400 border border-red-700/40 rounded px-3 py-2 bg-red-900/20">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <div className="ks-card rounded-lg p-2 lg:sticky lg:top-4 self-start">
            <nav className="flex lg:flex-col gap-1 overflow-x-auto" aria-label="Stack form sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-left transition ${tab === t.key ? 'ks-tab-active' : ''}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="space-y-4 min-w-0 max-w-full">
            {tab === 'meta' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section A · General Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="Name" htmlFor="stack-name">
                    <input
                      id="stack-name"
                      value={draft.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({ ...d, name: v, slug: d.slug ? d.slug : slugify(v) }));
                      }}
                      placeholder="My Dashboard"
                      required
                    />
                  </GlassField>
                  <GlassField label="Slug" htmlFor="stack-slug" hint="URL-safe id; lowercases + hyphenates.">
                    <input
                      id="stack-slug"
                      value={draft.slug}
                      onChange={(e) => patch({ slug: slugify(e.target.value) })}
                      placeholder="my-dashboard"
                      required
                    />
                  </GlassField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="Version" htmlFor="stack-version">
                    <input
                      id="stack-version"
                      value={draft.version}
                      onChange={(e) => patch({ version: e.target.value })}
                      placeholder="1.0.0"
                    />
                  </GlassField>
                  <GlassField label="Category" htmlFor="stack-category">
                    <select
                      id="stack-category"
                      value={draft.category}
                      onChange={(e) => patch({ category: e.target.value })}
                    >
                      {STACK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </GlassField>
                </div>
                <GlassField label="Description" htmlFor="stack-description">
                  <textarea
                    id="stack-description"
                    rows={3}
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Brief description of this stack"
                  />
                </GlassField>
                <div>
                  <span className="block text-sm font-medium text-gray-300 mb-1 ks-label">Icon & colour</span>
                  <IconColorPicker
                    icon={draft.icon}
                    color={draft.color}
                    onIconChange={(v) => patch({ icon: v })}
                    onColorChange={(v) => patch({ color: v })}
                    previewName={draft.name || 'Stack'}
                  />
                </div>
              </div>
            )}

            {tab === 'install' && (
              <ComingSoon heading="Section B · Install" />
            )}

            {tab === 'launch' && (
              <ComingSoon heading="Section C · Launch" />
            )}

            {tab === 'permission' && (
              <ComingSoon heading="Section D · Permission" />
            )}
          </div>
        </div>
      </FormPage>
    </>
  );
};

export default StackForm;
