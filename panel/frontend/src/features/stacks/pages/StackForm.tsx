import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import GlassField from '@/shared/components/ui/Field';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import RolePermissions from '@/features/roles/components/RolePermissions';
import { listPermissions } from '@/shared/api/admin';
import type { Permission } from '@/shared/types/user';
import {
  STACK_CAPABILITIES,
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

// Default access_level per stack capability. The backend treats access_level
// as an opaque string (only the capability code is validated), so these are
// sensible display defaults that match the capability name.
function defaultAccessLevel(capability: string): string {
  if (capability.endsWith('.read')) return 'read';
  if (capability.includes('read_write')) return 'read_write';
  return 'allow';
}

// StackForm — routed create form at /stacks/new, mirroring TemplateForm's
// chrome (FormPage + bottom-right PageFormActionsPill with Cancel/Create).
// The Permission tab mirrors the API key form's permission section: a stack
// capability checklist (all 6 known caps) plus the shared RolePermissions
// picker backed by GET /api/permissions so every panel permission group is
// available. Submit installs through POST /api/stacks/ (X-KS-Source: studio)
// so the backend validates the manifest like any upload.
const StackForm: React.FC = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(blankStackStudioDraft);
  const [tab, setTab] = useState<Tab>('meta');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);

  // Load the full permission catalogue once so the Permission tab can render
  // the same RolePermissions section the API key form uses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perms = await listPermissions();
        if (!cancelled) setAllPerms(Array.isArray(perms) ? perms : []);
      } catch {
        if (!cancelled) setAllPerms([]);
      } finally {
        if (!cancelled) setPermsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // ---- stack capability helpers (permissionsRequested[]) ----
  const hasCapability = (cap: string) =>
    draft.permissionsRequested.some((p) => p.capability === cap);

  const toggleCapability = (cap: string) => {
    setDraft((d) => {
      const exists = d.permissionsRequested.some((p) => p.capability === cap);
      if (exists) {
        return { ...d, permissionsRequested: d.permissionsRequested.filter((p) => p.capability !== cap) };
      }
      return {
        ...d,
        permissionsRequested: [...d.permissionsRequested, { capability: cap, access_level: defaultAccessLevel(cap) }],
      };
    });
  };

  const selectAllCapabilities = () => {
    setDraft((d) => ({
      ...d,
      permissionsRequested: STACK_CAPABILITIES.map((c) => ({
        capability: c.key,
        access_level: d.permissionsRequested.find((p) => p.capability === c.key)?.access_level || defaultAccessLevel(c.key),
      })),
    }));
  };

  const clearCapabilities = () => patch({ permissionsRequested: [] });

  // ---- panel permission helpers (same vocabulary as API key form) ----
  const panelPermissions = draft.panelPermissions || [];
  const selectAllPanelPermissions = () => {
    const keys = allPerms.map((p) => p.key);
    patch({ panelPermissions: Array.from(new Set(keys)) });
  };
  const clearPanelPermissions = () => patch({ panelPermissions: [] });

  const permissionCount = draft.permissionsRequested.length + panelPermissions.length;

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
                  className={`ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-left transition flex items-center justify-between gap-2 ${tab === t.key ? 'ks-tab-active' : ''}`}
                >
                  <span>{t.label}</span>
                  {t.key === 'permission' && permissionCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-gray-200">
                      {permissionCount}
                    </span>
                  )}
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
              <div className="space-y-4">
                {/* Capabilities — every stack capability the backend knows.
                    Requesting one seeds a stack_permissions row that the admin
                    must approve before activation (same gate as mods). */}
                <div className={sectionCls}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-sm font-semibold text-white tracking-tight">Stack capabilities</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        All {STACK_CAPABILITIES.length} capabilities the panel knows — requesting one seeds a pending approval for activation.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-gray-500 font-mono">
                        {draft.permissionsRequested.length}/{STACK_CAPABILITIES.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={selectAllCapabilities}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={clearCapabilities}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {STACK_CAPABILITIES.map((cap) => {
                      const on = hasCapability(cap.key);
                      const req = draft.permissionsRequested.find((p) => p.capability === cap.key);
                      return (
                        <label
                          key={cap.key}
                          className={`ks-card flex items-start gap-3 p-3 rounded-lg cursor-pointer transition ${
                            on ? 'border-emerald-700/40' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleCapability(cap.key)}
                            className="mt-1 w-4 h-4 accent-emerald-500 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white flex items-center gap-1.5 flex-wrap">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${cap.dot}`} />
                              {cap.label}
                              <code className="text-[10px] font-mono text-gray-500">{cap.key}</code>
                              {on && req?.access_level && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">
                                  {req.access_level}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{cap.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Panel permissions — identical section to the API key form:
                    the shared RolePermissions picker (Import groups, then
                    configure verbs + Own/All scope). */}
                <div className="flex items-center justify-between gap-3 flex-wrap px-1">
                  <p className="text-xs text-gray-500">
                    Panel permissions below use the same picker as the API key form
                    {permsLoading ? ' — loading catalogue…' : ` — ${allPerms.length} keys available`}.
                  </p>
                  {!permsLoading && allPerms.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllPanelPermissions}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Select all {allPerms.length} keys
                      </button>
                      <button
                        type="button"
                        onClick={clearPanelPermissions}
                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                {permsLoading ? (
                  <div className="ks-card ks-form-card rounded-md p-6 text-center text-sm text-gray-500">
                    Loading permissions…
                  </div>
                ) : (
                  <RolePermissions
                    formPermissions={panelPermissions}
                    setFormPermissions={(updater) =>
                      setDraft((prev) => {
                        const cur = prev.panelPermissions || [];
                        const next =
                          typeof updater === 'function'
                            ? (updater as (v: string[]) => string[])(cur)
                            : updater;
                        return { ...prev, panelPermissions: next };
                      })
                    }
                    permissions={allPerms}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </FormPage>
    </>
  );
};

export default StackForm;
