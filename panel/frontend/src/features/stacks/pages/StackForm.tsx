import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import GlassField from '@/shared/components/ui/Field';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import {
  STACK_CAPABILITIES,
  STACK_CATEGORIES,
  STACK_PAGE_STYLES,
  STACK_RUNTIMES,
  STACK_THEME_MODES,
  blankStackStudioDraft,
  emitStackStudioManifest,
  slugify,
} from '@/shared/types/stack';
import {
  createStackFromManifest,
  writeStackFile,
  extractStackApiError,
} from '@/features/stacks/api/stacks';

type Tab = 'meta' | 'theme' | 'frontend' | 'permissions' | 'backend' | 'spec';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'meta', label: 'General' },
  { key: 'theme', label: 'Theme' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'backend', label: 'Backend' },
  { key: 'spec', label: 'Spec' },
];

const sectionCls = 'ks-card ks-form-card rounded-lg space-y-4';

// StackForm — routed create form at /stacks/new, mirroring TemplateForm's
// chrome (FormPage + bottom-right PageFormActionsPill with Cancel/Create).
// It edits a StackStudioDraft and installs through POST /api/stacks/
// (X-KS-Source: studio) so capabilities stay validated and permissions seed
// pending — the same pipeline the Studio and .ksps uploads use. Seed content
// (spa bundle, theme.css, simple pages, backend entry, spec.json) is written
// through the workdir file endpoints right after install.
const StackForm: React.FC = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(blankStackStudioDraft);
  const [tab, setTab] = useState<Tab>('meta');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [specText, setSpecText] = useState('{}');
  const [specError, setSpecError] = useState('');

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

  const togglePerm = (cap: string) => {
    const has = draft.permissionsRequested.some((p) => p.capability === cap);
    if (has) {
      patch({ permissionsRequested: draft.permissionsRequested.filter((p) => p.capability !== cap) });
    } else {
      patch({ permissionsRequested: [...draft.permissionsRequested, { capability: cap, access_level: '' }] });
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.name.trim()) { setError('Name is required'); setTab('meta'); return; }
    if (!draft.slug.trim()) { setError('Slug is required'); setTab('meta'); return; }
    if (validation.length > 0) { setError(validation[0]); setTab('meta'); return; }
    if (draft.color && !/^#[0-9a-fA-F]{6}$/.test(draft.color.trim())) { setError('Colour must be a #rrggbb hex value (or empty for default)'); setTab('meta'); return; }
    let spec: Record<string, any> = {};
    try {
      const parsed = JSON.parse(specText || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        spec = parsed;
      } else {
        setSpecError('Spec must be a JSON object.');
        setTab('spec');
        return;
      }
    } catch (err: any) {
      setSpecError('Spec is not valid JSON: ' + (err?.message || String(err)));
      setTab('spec');
      return;
    }
    setSaving(true);
    setError('');
    setSpecError('');
    try {
      const manifest = emitStackStudioManifest({ ...draft, spec: (draft.spec ?? {}) });
      const stack = await createStackFromManifest(manifest, 'studio');
      const jobs: Array<{ path: string; content: string }> = [];
      if (draft.pageStyle === 'spa' && draft.frontendHtml.trim()) {
        jobs.push({ path: 'frontend/dist/index.html', content: draft.frontendHtml });
      }
      if (draft.themeMode === 'custom' && draft.frontendCss.trim()) {
        jobs.push({ path: 'frontend/theme.css', content: draft.frontendCss });
      }
      if (draft.pageStyle === 'simple' && draft.simplePage.trim()) {
        jobs.push({ path: 'frontend/pages/overview.md', content: draft.simplePage });
        jobs.push({
          path: 'frontend/pages/pages.json',
          content: JSON.stringify([{ slug: 'overview', title: 'Overview', file: 'overview.md' }], null, 2),
        });
      }
      if (draft.backendScript.trim() && draft.runtime !== 'static') {
        const entry = draft.entrypoint.trim() || (draft.runtime === 'python' ? 'backend/app.py' : 'backend/server.js');
        jobs.push({ path: entry, content: draft.backendScript });
      }
      if (draft.spec && Object.keys(draft.spec).length) {
        jobs.push({ path: 'spec.json', content: JSON.stringify(draft.spec, null, 2) });
      }
      for (const j of jobs) {
        try {
          await writeStackFile(stack.id, j.path, j.content);
        } catch {
          /* best-effort: seed never fails the install */
        }
      }
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
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
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
          <div className="space-y-4">
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

            {tab === 'theme' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section B · Theme</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="Theme mode" htmlFor="stack-theme">
                    <select
                      id="stack-theme"
                      value={draft.themeMode}
                      onChange={(e) => patch({ themeMode: e.target.value as typeof draft.themeMode })}
                    >
                      {STACK_THEME_MODES.map((m) => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
                    </select>
                  </GlassField>
                  <GlassField label="Page style" htmlFor="stack-pagestyle">
                    <select
                      id="stack-pagestyle"
                      value={draft.pageStyle}
                      onChange={(e) => patch({ pageStyle: e.target.value as typeof draft.pageStyle })}
                    >
                      {STACK_PAGE_STYLES.map((m) => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
                    </select>
                  </GlassField>
                </div>
                <GlassField label="Custom theme.css (used when theme mode = custom → frontend/theme.css)" htmlFor="stack-css">
                  <textarea
                    id="stack-css"
                    rows={10}
                    value={draft.frontendCss}
                    onChange={(e) => patch({ frontendCss: e.target.value })}
                    placeholder={':root {\n  --ks-accent: #38bdf8;\n}'}
                  />
                </GlassField>
              </div>
            )}

            {tab === 'frontend' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section C · Frontend</h4>
                {draft.pageStyle === 'spa' ? (
                  <GlassField label="SPA index.html (seeded to frontend/dist/index.html on install)" htmlFor="stack-html">
                    <textarea
                      id="stack-html"
                      rows={18}
                      value={draft.frontendHtml}
                      onChange={(e) => patch({ frontendHtml: e.target.value })}
                      placeholder={'<!doctype html><html><body><h1>My stack</h1></body></html>'}
                    />
                  </GlassField>
                ) : (
                  <GlassField label="Simple page markdown (seeded to frontend/pages/overview.md on install)" htmlFor="stack-md">
                    <textarea
                      id="stack-md"
                      rows={18}
                      value={draft.simplePage}
                      onChange={(e) => patch({ simplePage: e.target.value })}
                    />
                  </GlassField>
                )}
              </div>
            )}

            {tab === 'permissions' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section D · Permissions</h4>
                <p className="text-xs text-gray-400">
                  Requested capabilities seed pending grant rows — the admin approves them before activation, exactly like an uploaded .ksps.
                </p>
                <div className="space-y-2">
                  {STACK_CAPABILITIES.map((cap) => {
                    const on = draft.permissionsRequested.some((p) => p.capability === cap.key);
                    return (
                      <label key={cap.key} className={`ks-card flex items-start gap-3 p-3 rounded-lg cursor-pointer transition ${on ? 'border-emerald-700/40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePerm(cap.key)}
                          className="mt-1 w-4 h-4 accent-emerald-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${cap.dot}`} />
                            {cap.label}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{cap.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'backend' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Backend</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="Runtime" htmlFor="stack-runtime">
                    <select
                      id="stack-runtime"
                      value={draft.runtime}
                      onChange={(e) => patch({ runtime: e.target.value })}
                    >
                      {STACK_RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </GlassField>
                  <GlassField label="Entrypoint" htmlFor="stack-entrypoint" hint="Empty = static stack (no sidecar).">
                    <input
                      id="stack-entrypoint"
                      value={draft.entrypoint}
                      onChange={(e) => patch({ entrypoint: e.target.value })}
                      placeholder={draft.runtime === 'python' ? 'backend/app.py' : 'backend/server.js'}
                    />
                  </GlassField>
                </div>
                <GlassField label="Backend script (seeded to the entrypoint on install when runtime ≠ static)" htmlFor="stack-backend">
                  <textarea
                    id="stack-backend"
                    rows={14}
                    value={draft.backendScript}
                    onChange={(e) => patch({ backendScript: e.target.value })}
                    placeholder={draft.runtime === 'python' ? 'print("hello from stack")' : 'console.log("hello from stack");'}
                  />
                </GlassField>
              </div>
            )}

            {tab === 'spec' && (
              <div className={sectionCls}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section F · Spec</h4>
                <GlassField label="Spec (JSON, stored verbatim)" htmlFor="stack-spec">
                  <textarea
                    id="stack-spec"
                    rows={16}
                    value={specText}
                    onChange={(e) => {
                      setSpecText(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value || '{}');
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                          setDraft((d) => ({ ...d, spec: parsed }));
                          setSpecError('');
                        } else {
                          setSpecError('Spec must be a JSON object.');
                        }
                      } catch {
                        /* keep editing */
                      }
                    }}
                  />
                </GlassField>
                {specError && <p className="text-red-400 text-xs">{specError}</p>}
                <p className="text-[11px] text-gray-500">
                  Freeform config blob stored with the stack. Seeded to <code className="font-mono">spec.json</code> on install when non-empty.
                </p>
              </div>
            )}
          </div>
        </div>
      </FormPage>
    </>
  );
};

export default StackForm;
