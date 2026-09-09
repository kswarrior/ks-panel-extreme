import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import RolePermissions from '@/features/roles/components/RolePermissions';
import { TemplateInstallSection } from '@/features/templates/components/TemplateForm/TemplateInstallSection';
import { listPermissions } from '@/shared/api/admin';
import type { Permission } from '@/shared/types/user';
import {
  STACK_CAPABILITIES,
  STACK_CATEGORIES,
  STACK_INSTALL_TYPES,
  STACK_LOCATION_TYPES,
  STACK_REMOTE_PROTOCOLS,
  STACK_RUNTIMES,
  blankStackInstallStep,
  blankStackLaunchToken,
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
const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';
const monoCls = glassFieldClass + ' font-mono ks-input-mono';
const addBtn = 'text-xs text-sky-300 hover:text-sky-200 underline';

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

  // ---- install helpers (Type + workflow, mirrors template install) ----
  const installStepCount = draft.installSteps.length;
  const moveInstallStep = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.installSteps.length) return d;
      const steps = [...d.installSteps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, installSteps: steps };
    });
  };

  // ---- launch helpers (same step vocabulary as install, run at launch) ----
  const launchStepCount = draft.launchSteps.length;
  const moveLaunchStep = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.launchSteps.length) return d;
      const steps = [...d.launchSteps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, launchSteps: steps };
    });
  };

  // ---- ask-at-launch tokens (prompted at launch, exported as ENV) ----
  const [editingTokenIdx, setEditingTokenIdx] = useState<number | null>(null);
  const moveLaunchToken = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.launchTokens.length) return d;
      const tokens = [...d.launchTokens];
      [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
      return { ...d, launchTokens: tokens };
    });
    setEditingTokenIdx((cur) => (cur === i ? i + dir : cur));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.name.trim()) { setError('Name is required'); setTab('meta'); return; }
    if (!draft.slug.trim()) { setError('Slug is required'); setTab('meta'); return; }
    if (validation.length > 0) { setError(validation[0]); setTab('meta'); return; }
    if (draft.color && !/^#[0-9a-fA-F]{6}$/.test(draft.color.trim())) { setError('Colour must be a #rrggbb hex value (or empty for default)'); setTab('meta'); return; }
    if (draft.locationType === 'host' && draft.installType === 'docker' && !draft.installImage.trim()) { setError('Docker image is required for Docker'); setTab('meta'); return; }
    if (draft.locationType === 'outside') {
      const url = draft.remoteUrl.trim();
      if (!url) { setError('Remote URL is required for Type Outside'); setTab('meta'); return; }
      if (draft.remoteProtocol === 'wss' && !/^wss?:\/\//i.test(url)) { setError('Remote URL must start with ws:// or wss:// for WSS'); setTab('meta'); return; }
      if (draft.remoteProtocol === 'post' && !/^https?:\/\//i.test(url)) { setError('Remote URL must start with http:// or https:// for POST'); setTab('meta'); return; }
    }
    {
      const seen = new Set<string>();
      for (const t of draft.launchTokens) {
        const name = t.name.trim();
        if (!name) { setError('Every launch token needs an ENV name'); setTab('launch'); return; }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { setError(`Invalid token name "${name}": use letters, digits and underscores, starting with a letter or underscore`); setTab('launch'); return; }
        const upper = name.toUpperCase();
        if (seen.has(upper)) { setError(`Duplicate launch token "${name}"`); setTab('launch'); return; }
        seen.add(upper);
      }
    }
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
                  {t.key === 'install' && installStepCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-gray-200">
                      {installStepCount}
                    </span>
                  )}
                  {t.key === 'launch' && launchStepCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-gray-200">
                      {launchStepCount}
                    </span>
                  )}
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
                {/* Location type — Host (stack on this same host) vs Outside
                    (stack elsewhere, reached via WSS or POST). */}
                <div className="space-y-3">
                  <span className="block text-sm font-medium text-gray-300 ks-label">Type · Location</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Location type">
                    {STACK_LOCATION_TYPES.map((t) => {
                      const active = draft.locationType === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => patch({ locationType: t.value })}
                          className={`ks-card flex items-start gap-3 p-3 rounded-lg text-left transition cursor-pointer ${
                            active ? 'border-sky-600/60 bg-sky-950/20' : 'hover:border-white/20'
                          }`}
                        >
                          <span
                            className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              active ? 'border-sky-400' : 'border-white/20'
                            }`}
                            aria-hidden="true"
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">{t.label}</span>
                            <span className="block text-xs text-gray-400 mt-0.5">{t.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {draft.locationType === 'host' ? (
                    <div className="space-y-3">
                      <span className="block text-xs font-medium text-gray-400">Runs as — Docker container or Host process</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Host runtime type">
                        {STACK_INSTALL_TYPES.map((t) => {
                          const active = draft.installType === t.value;
                          return (
                            <button
                              key={t.value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => patch({ installType: t.value })}
                              className={`ks-card flex items-start gap-3 p-3 rounded-lg text-left transition cursor-pointer ${
                                active ? 'border-sky-600/60 bg-sky-950/20' : 'hover:border-white/20'
                              }`}
                            >
                              <span
                                className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                  active ? 'border-sky-400' : 'border-white/20'
                                }`}
                                aria-hidden="true"
                              >
                                {active && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-white">{t.label}</span>
                                <span className="block text-xs text-gray-400 mt-0.5">{t.hint}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {draft.installType === 'docker' ? (
                        <GlassField label="Docker image" htmlFor="stack-image" hint="Container image for the stack (e.g. nginx:latest). Required for Docker.">
                          <input
                            id="stack-image"
                            value={draft.installImage}
                            onChange={(e) => patch({ installImage: e.target.value })}
                            placeholder="e.g. nginx:latest"
                            required
                          />
                        </GlassField>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <GlassField label="Runtime" htmlFor="stack-runtime" hint="Host sidecar runtime.">
                            <select
                              id="stack-runtime"
                              value={draft.runtime}
                              onChange={(e) => patch({ runtime: e.target.value })}
                            >
                              {STACK_RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </GlassField>
                          <GlassField label="Entrypoint" htmlFor="stack-entrypoint" hint="Command or file the host runtime executes.">
                            <input
                              id="stack-entrypoint"
                              value={draft.entrypoint}
                              onChange={(e) => patch({ entrypoint: e.target.value })}
                              placeholder={draft.runtime === 'static' ? 'index.html' : draft.runtime === 'nodejs' ? 'server.js' : 'app.py'}
                            />
                          </GlassField>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Remote protocol">
                        {STACK_REMOTE_PROTOCOLS.map((p) => {
                          const active = draft.remoteProtocol === p.value;
                          return (
                            <button
                              key={p.value}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => patch({ remoteProtocol: p.value })}
                              title={p.hint}
                              className={`ks-card flex items-start gap-3 p-3 rounded-lg text-left transition cursor-pointer ${
                                active ? 'border-emerald-600/60 bg-emerald-950/20' : 'hover:border-white/20'
                              }`}
                            >
                              <span
                                className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                  active ? 'border-emerald-400' : 'border-white/20'
                                }`}
                                aria-hidden="true"
                              >
                                {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-white font-mono">{p.label}</span>
                                <span className="block text-xs text-gray-400 mt-0.5">{p.hint}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <GlassField
                        label="Remote URL"
                        htmlFor="stack-remote-url"
                        hint={draft.remoteProtocol === 'wss' ? 'Where the outside stack listens, e.g. wss://stack.example.com:7443/ws.' : 'Where the outside stack receives calls, e.g. https://stack.example.com:8443/hooks/stack.'}
                      >
                        <input
                          id="stack-remote-url"
                          value={draft.remoteUrl}
                          onChange={(e) => patch({ remoteUrl: e.target.value })}
                          placeholder={draft.remoteProtocol === 'wss' ? 'wss://stack.example.com:7443/ws' : 'https://stack.example.com:8443/hooks/stack'}
                          spellCheck={false}
                          autoComplete="off"
                          required
                        />
                      </GlassField>
                      <GlassField label="Shared secret (optional)" htmlFor="stack-remote-secret" hint="Sent with every WSS/POST call so the outside stack can verify the panel.">
                        <input
                          id="stack-remote-secret"
                          type="password"
                          value={draft.remoteSecret}
                          onChange={(e) => patch({ remoteSecret: e.target.value })}
                          placeholder="leave empty for none"
                          autoComplete="new-password"
                        />
                      </GlassField>
                    </div>
                  )}
                </div>
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
              <div className="space-y-4">
                {/* Installation workflow — the exact template install step
                    editor (shell/download/extract/... + timeout), bound to
                    the stack draft. Runtime choice (Docker vs Host process)
                    lives in General under Type Host. */}
                <TemplateInstallSection
                  heading="Section B · Installation Workflow"
                  install={draft.installSteps as any}
                  installTimeoutS={draft.installTimeoutS}
                  onInstallTimeoutUpdate={(v) => patch({ installTimeoutS: v.replace(/[^0-9]/g, '') })}
                  onInstallUpdate={(i, stepPatch) => setDraft((d) => {
                    const steps = [...d.installSteps];
                    steps[i] = { ...steps[i], ...stepPatch } as typeof steps[number];
                    return { ...d, installSteps: steps };
                  })}
                  onInstallAdd={() => setDraft((d) => ({ ...d, installSteps: [...d.installSteps, blankStackInstallStep()] }))}
                  onInstallDelete={(i) => setDraft((d) => ({ ...d, installSteps: d.installSteps.filter((_, j) => j !== i) }))}
                  onInstallMove={moveInstallStep}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              </div>
            )}

            {tab === 'launch' && (
              <div className="space-y-4">
                <div className={sectionCls}>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section C · Launch</h4>
                  <p className="text-xs text-gray-400">
                    Same step vocabulary as the Install workflow (shell / download / extract / …),
                    but these steps run every time the stack launches — not once at install.
                    Tokens below are asked at launch and exported as environment variables.
                    Leave empty to launch with no pre-steps.
                  </p>
                </div>

                {/* Ask at launch — tokens prompted at launch time, placed
                    into ENV (token NAME is the ENV key, e.g. API_TOKEN is
                    usable as {{API_TOKEN}} / ${API_TOKEN} / $(API_TOKEN)). */}
                <div className={sectionCls}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-sm font-semibold text-white tracking-tight">Ask at launch · Tokens → ENV</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {draft.launchTokens.length === 0
                          ? 'No tokens yet — add one to prompt for a value (e.g. API token) at launch.'
                          : `${draft.launchTokens.length} token${draft.launchTokens.length > 1 ? 's' : ''} asked at launch, each exported as $NAME.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((d) => ({ ...d, launchTokens: [...d.launchTokens, blankStackLaunchToken()] }));
                        setEditingTokenIdx(draft.launchTokens.length);
                      }}
                      className={addBtn}
                      aria-label="Add launch token"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                  </div>
                  {draft.launchTokens.length === 0 ? (
                    <p className="text-xs text-gray-500">Nothing is asked at launch — the workflow below runs with defaults only.</p>
                  ) : (
                    <div className="space-y-3">
                      {draft.launchTokens.map((t, i) => {
                        const isEditing = editingTokenIdx === i;
                        return (
                          <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
                            <div className="p-3 flex items-center gap-3 flex-wrap">
                              <div className="flex flex-col gap-0.5 shrink-0">
                                <button type="button" aria-label="Move token up" onClick={() => moveLaunchToken(i, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                                </button>
                                <button type="button" aria-label="Move token down" onClick={() => moveLaunchToken(i, 1)} disabled={i === draft.launchTokens.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-white truncate">{t.label.trim() || t.name.trim() || `Token ${i + 1}`}</span>
                                  {t.name.trim() && <code className="text-[11px] text-gray-500 font-mono">${t.name.trim()}</code>}
                                  {t.required && (
                                    <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-red-900/30 text-red-300 border-red-700/40">required</span>
                                  )}
                                  {t.secret && (
                                    <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-300 border-amber-700/40">secret</span>
                                  )}
                                </div>
                                {t.description.trim() && <p className="text-[11px] text-gray-500 truncate mt-0.5">{t.description}</p>}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingTokenIdx === i) setEditingTokenIdx(null);
                                    setDraft((d) => ({ ...d, launchTokens: d.launchTokens.filter((_, j) => j !== i) }));
                                  }}
                                  className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300"
                                  aria-label="Remove token"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                                <button type="button" onClick={() => setEditingTokenIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                                </button>
                              </div>
                            </div>
                            {isEditing && (
                              <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    value={t.name}
                                    onChange={(e) => setDraft((d) => {
                                      const tokens = [...d.launchTokens];
                                      tokens[i] = { ...tokens[i], name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') };
                                      return { ...d, launchTokens: tokens };
                                    })}
                                    placeholder="ENV name (e.g. API_TOKEN)"
                                    className={monoCls}
                                  />
                                  <input
                                    value={t.label}
                                    onChange={(e) => setDraft((d) => {
                                      const tokens = [...d.launchTokens];
                                      tokens[i] = { ...tokens[i], label: e.target.value };
                                      return { ...d, launchTokens: tokens };
                                    })}
                                    placeholder="Prompt label (e.g. API token)"
                                    className={glassFieldClass}
                                  />
                                </div>
                                <input
                                  value={t.description}
                                  onChange={(e) => setDraft((d) => {
                                    const tokens = [...d.launchTokens];
                                    tokens[i] = { ...tokens[i], description: e.target.value };
                                    return { ...d, launchTokens: tokens };
                                  })}
                                  placeholder="Help text shown under the launch prompt"
                                  className={glassFieldClass}
                                />
                                <input
                                  value={t.default}
                                  onChange={(e) => setDraft((d) => {
                                    const tokens = [...d.launchTokens];
                                    tokens[i] = { ...tokens[i], default: e.target.value };
                                    return { ...d, launchTokens: tokens };
                                  })}
                                  placeholder="Default value (empty = must type at launch when required)"
                                  className={monoCls}
                                />
                                <div className="flex flex-wrap gap-4 items-center">
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <button
                                      type="button"
                                      onClick={() => setDraft((d) => {
                                        const tokens = [...d.launchTokens];
                                        tokens[i] = { ...tokens[i], required: !tokens[i].required };
                                        return { ...d, launchTokens: tokens };
                                      })}
                                      className={`relative w-9 h-5 rounded-full transition ${t.required ? 'bg-green-600' : 'bg-neutral-700'}`}
                                      aria-pressed={t.required}
                                    >
                                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${t.required ? 'translate-x-4' : ''}`} />
                                    </button>
                                    <span className="text-sm text-gray-300">Required</span>
                                  </label>
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <button
                                      type="button"
                                      onClick={() => setDraft((d) => {
                                        const tokens = [...d.launchTokens];
                                        tokens[i] = { ...tokens[i], secret: !tokens[i].secret };
                                        return { ...d, launchTokens: tokens };
                                      })}
                                      className={`relative w-9 h-5 rounded-full transition ${t.secret ? 'bg-green-600' : 'bg-neutral-700'}`}
                                      aria-pressed={t.secret}
                                    >
                                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${t.secret ? 'translate-x-4' : ''}`} />
                                    </button>
                                    <span className="text-sm text-gray-300">Secret (mask at prompt)</span>
                                  </label>
                                </div>
                                <p className="text-[11px] text-gray-500">
                                  Placed into ENV as <code className="font-mono text-gray-400">{t.name.trim() ? `$${t.name.trim()}` : '$NAME'}</code> — reference it in workflow steps as <code className="font-mono text-gray-400">{t.name.trim() ? `{{${t.name.trim()}}} / $${t.name.trim()} / $(${t.name.trim()})` : '{{NAME}} / ${NAME} / $(NAME)'}</code>.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Launch workflow — reuses the exact template install step
                    editor; only the run moment (launch vs install) and the
                    manifest keys (launch* vs install*) differ. */}
                <TemplateInstallSection
                  heading="Section C · Launch Workflow"
                  install={draft.launchSteps as any}
                  installTimeoutS={draft.launchTimeoutS}
                  onInstallTimeoutUpdate={(v) => patch({ launchTimeoutS: v.replace(/[^0-9]/g, '') })}
                  onInstallUpdate={(i, stepPatch) => setDraft((d) => {
                    const steps = [...d.launchSteps];
                    steps[i] = { ...steps[i], ...stepPatch } as typeof steps[number];
                    return { ...d, launchSteps: steps };
                  })}
                  onInstallAdd={() => setDraft((d) => ({ ...d, launchSteps: [...d.launchSteps, blankStackInstallStep()] }))}
                  onInstallDelete={(i) => setDraft((d) => ({ ...d, launchSteps: d.launchSteps.filter((_, j) => j !== i) }))}
                  onInstallMove={moveLaunchStep}
                  sectionCls={sectionCls}
                  labelCls={labelCls}
                  monoCls={monoCls}
                  addBtn={addBtn}
                />
              </div>
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
