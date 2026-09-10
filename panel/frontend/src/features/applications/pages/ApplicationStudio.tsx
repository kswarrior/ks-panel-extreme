import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import {
  APPLICATION_CAPABILITIES,
  appCapabilityMeta,
  appCategoryMeta,
  appRuntimeMeta,
  blankApplicationStudioDraft,
  emitStudioPayload,
  slugifyApp,
  type ApplicationConfigField,
  type ApplicationFile,
  type ApplicationPermissionReq,
  type ApplicationStudioDraft,
} from '@/features/applications/types/application';
import {
  createApplication,
  updateApplicationEnv,
  installApplicationFromUrl,
} from '@/features/applications/api/applications';
import { extractApiErrorMessage } from '@/features/mods/api/mods';
import { APPLICATION_STUDIO_PRESETS } from './applicationStudioPresets';
import { useConfirm } from '@/shared/stores/confirmStore';

// ---------------------------------------------------------------------------
// ApplicationStudio — a visual + code manifest builder (mirrors ModStudio).
//
// The Studio models an application as an editable "draft"
// (ApplicationStudioDraft). The admin edits structured builder blocks
// (no-code) OR types raw manifest JSON (pro-code), previewing the produced
// payload live. Saving the draft ships it through the existing
// POST /api/applications/ + POST /:id/env endpoints (the same ones the
// Upload button uses), so the Studio is a GENERATOR, not a new runtime — it
// does NOT bypass the security model. Capabilities are still validated by
// the backend, permissions are still seeded granted=false, and activation
// still requires explicit grant approval afterwards.
//
// Layout:
//   [tab rail] | [active editor] | [live manifest preview]
//
// Tabs: General · Permissions · Configure · Scripts · Raw JSON
// ---------------------------------------------------------------------------

type Tab = 'general' | 'permissions' | 'configure' | 'scripts' | 'raw';

interface TabDef {
  key: Tab;
  label: string;
  icon: React.ReactNode;
  hint: string;
}

const TABS: TabDef[] = [
  { key: 'general', label: 'General', hint: 'Name, slug, runtime, entrypoint',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/> </svg> },
  { key: 'permissions', label: 'Permissions', hint: 'Host capabilities + access levels',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg> },
  { key: 'configure', label: 'Configure', hint: 'Config schema + saved env',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 6h16M4 12h16M4 18h10"/> </svg> },
  { key: 'scripts', label: 'Scripts', hint: 'Staged script files',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/> </svg> },
  { key: 'raw', label: 'Raw JSON', hint: 'Author the whole manifest',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 7h5l3 5-3 5H3"/><path d="M21 7h-5l-3 5 3 5h5"/> </svg> },
];

// ---- inputs ---------------------------------------------------------------

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, placeholder, mono, hint, disabled }) => (
  <label className="block">
    <span className="text-xs text-gray-400">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40 disabled:opacity-50 ${
        mono ? 'font-mono' : ''
      }`}
    />
    {hint && <span className="text-[11px] text-gray-500 mt-1 block">{hint}</span>}
  </label>
);

const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}> = ({ label, value, onChange, onBlur, rows = 4, placeholder, mono, hint }) => (
  <label className="block">
    <span className="text-xs text-gray-400">{label}</span>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      rows={rows}
      placeholder={placeholder}
      className={`block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-2 focus:outline-none focus:border-white/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
    {hint && <span className="text-[11px] text-gray-500 mt-1 block">{hint}</span>}
  </label>
);

const Select: React.FC<{
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-xs text-gray-400">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

// ---- the page -------------------------------------------------------------

const ApplicationStudio: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<ApplicationStudioDraft>(blankApplicationStudioDraft);
  const [tab, setTab] = useState<Tab>('general');
  const [raw, setRaw] = useState<string>('');
  const [rawError, setRawError] = useState<string>('');
  // null = no buffer (use structured editor truth); '' = user-cleared the
  // field; anything else = user is mid-edit.
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installOk, setInstallOk] = useState('');
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [showPresets, setShowPresets] = useState(true);

  // Re-seed the raw buffer every time the structured draft changes so the
  // Raw JSON tab always reflects the structured editor's truth (until the
  // admin starts typing in the raw textarea, which promotes the buffer).
  const emitted = useMemo(() => emitStudioPayload(draft), [draft]);
  const emittedJson = useMemo(() => {
    const { payload, env } = emitted;
    if (Object.keys(env).length > 0) return JSON.stringify({ ...payload, env }, null, 2);
    return JSON.stringify(payload, null, 2);
  }, [emitted]);
  useEffect(() => {
    setRaw(emittedJson);
    setRawDraft((prev) => prev);
  }, [emittedJson]);

  const patch = useCallback((partial: Partial<ApplicationStudioDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  // ---- raw <-> structured sync --------------------------------------------
  const parseRawToDraft = (rawText: string): ApplicationStudioDraft => {
    const parsed = JSON.parse(rawText) as Record<string, any>;
    const runtime = typeof parsed.runtime === 'string' ? parsed.runtime : 'nodejs';
    const entrypoint = typeof parsed.entrypoint === 'string' ? parsed.entrypoint : '';
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      slug: typeof parsed.slug === 'string' ? parsed.slug : '',
      category: typeof parsed.category === 'string' ? parsed.category : 'custom',
      version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      icon: typeof parsed.icon === 'string' ? parsed.icon : '',
      color: typeof parsed.color === 'string' ? parsed.color : '',
      runtime,
      mainFile: runtime === 'custom' ? '' : entrypoint,
      command: runtime === 'custom' ? entrypoint : '',
      config_schema: Array.isArray(parsed.config_schema) ? parsed.config_schema : [],
      env: parsed.env && typeof parsed.env === 'object' && !Array.isArray(parsed.env)
        ? (parsed.env as Record<string, string>)
        : {},
      files: Array.isArray(parsed.files) ? parsed.files : [],
      permissionsRequested: Array.isArray(parsed.permissionsRequested)
        ? parsed.permissionsRequested
        : [],
    };
  };
  const commitRaw = useCallback(() => {
    if (rawDraft === null) return;
    setRawError('');
    try {
      const next = parseRawToDraft(rawDraft);
      setDraft(next);
      setRawDraft(null);
    } catch (e: any) {
      setRawError('invalid JSON: ' + (e?.message || String(e)));
    }
  }, [rawDraft]);

  const validateDraftOf = (d: ApplicationStudioDraft): { ok: boolean; issues: string[] } => {
    const issues: string[] = [];
    if (!d.name.trim()) issues.push('Name is required.');
    if (!d.slug.trim()) issues.push('Slug is required.');
    if (d.slug && /[^a-z0-9-]/.test(d.slug)) issues.push('Slug must be lowercase letters, digits, and dashes only.');
    if (d.color && !/^#[0-9a-fA-F]{6}$/.test(d.color.trim())) issues.push('Colour must be a #rrggbb hex value (or empty).');
    if (!['nodejs', 'python', 'bash', 'custom'].includes(d.runtime)) issues.push(`Unknown runtime: ${d.runtime}`);
    const entrypoint = d.runtime === 'custom'
      ? d.command.trim()
      : (d.mainFile.trim() || (d.files.length > 0 ? d.files[0].path : ''));
    if (!entrypoint) issues.push('Entrypoint is required (main file, or command for custom runtimes).');
    if (!Array.isArray(d.config_schema)) issues.push('Config schema must be an array.');
    const knownCaps = new Set(APPLICATION_CAPABILITIES.map((c) => c.key));
    for (const p of d.permissionsRequested) {
      if (!knownCaps.has(p.capability)) issues.push(`Unknown capability: ${p.capability}`);
      const meta = appCapabilityMeta(p.capability);
      if (meta && p.access_level && !meta.accessLevels.some((a) => a.value === p.access_level)) {
        issues.push(`Access level "${p.access_level}" not valid for ${p.capability}`);
      }
    }
    const seen = new Set<string>();
    for (const f of d.files) {
      if (!f.path.trim()) issues.push('Script file with an empty path.');
      if (seen.has(f.path)) issues.push(`Duplicate script file path: ${f.path}`);
      seen.add(f.path);
    }
    return { ok: issues.length === 0, issues };
  };
  const validate = useCallback((): { ok: boolean; issues: string[] } => validateDraftOf(draft), [draft]);

  const validation = useMemo(validate, [validate]);
  const [showIssues, setShowIssues] = useState(false);

  // ---- install ------------------------------------------------------------
  const install = useCallback(async () => {
    setInstalling(true);
    setInstallError('');
    setInstallOk('');
    setRawError('');
    // Use the pending raw buffer directly when present: commitRaw() only
    // schedules a setDraft (async), so reading `draft` right after it would
    // send the STALE structured state and drop the power-user's just-typed
    // raw edits. Parsing synchronously here keeps them.
    let effectiveDraft = draft;
    if (rawDraft !== null) {
      try {
        effectiveDraft = parseRawToDraft(rawDraft);
        setDraft(effectiveDraft);
        setRawDraft(null);
      } catch (e: any) {
        setRawError('invalid JSON: ' + (e?.message || String(e)));
        setInstallError('Cannot install: the Raw JSON buffer has invalid JSON — fix it and try again.');
        setTab('raw');
        setInstalling(false);
        return;
      }
    }
    try {
      const v = validateDraftOf(effectiveDraft);
      if (!v.ok) {
        setInstallError(`Cannot install: ${v.issues.length} validation issue(s) — fix them and try again.`);
        setShowIssues(true);
        return;
      }
      const { payload, env } = emitStudioPayload(effectiveDraft);
      if (!payload.name.trim() || !payload.slug.trim()) {
        setInstallError('Name and slug are required (edit them in the General tab).');
        setTab('general');
        setShowIssues(true);
        return;
      }
      const created = await createApplication(payload);
      if (Object.keys(env).length > 0) {
        await updateApplicationEnv(created.id, env);
      }
      setInstallOk('Application installed — now review its requested permissions on the Applications page.');
      setTimeout(() => {
        navigate('/applications');
      }, 700);
    } catch (e: any) {
      setInstallError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setInstalling(false);
    }
  }, [draft, rawDraft, navigate]);

  // ---- install-from-URL quick-pick ---------------------------------------
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const onUrlInstall = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlBusy(true);
    setUrlError('');
    try {
      await installApplicationFromUrl(urlInput.trim());
      setUrlInput('');
      setInstallOk('Installed application from URL — open the Applications page to review its permissions.');
      setTimeout(() => navigate('/applications'), 700);
    } catch (e: any) {
      setUrlError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setUrlBusy(false);
    }
  }, [urlInput, navigate]);

  // ---- preset apply -------------------------------------------------------
  const applyPreset = useCallback((id: string) => {
    const p = APPLICATION_STUDIO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const d = p.build();
    setDraft(d);
    setShowPresets(false);
    setTab('general');
  }, []);

  // ---- reset --------------------------------------------------------------
  const reset = useCallback(async () => {
    if (!(await confirm({ title: 'Reset draft', message: 'Discard the current draft and start over?', tone: 'warning', confirmLabel: 'Discard' }))) return;
    setDraft(blankApplicationStudioDraft());
    setTab('general');
    setShowPresets(true);
    setInstallError('');
    setInstallOk('');
    setRawError('');
  }, [confirm]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">Application Studio</h2>
          <p className="text-sm text-gray-400 -mt-0.5 max-w-2xl">
            Visually author an application (bot / service template) and install it in one step. The Studio emits a
            manifest the engine validates the same way an uploaded <code className="text-gray-300">.ksapp</code> is
            validated — capabilities stay whitelisted, permissions still need explicit approval, so the Studio never
            silently unlocks anything.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/applications')}
            className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
          >
            ← Back to Applications
          </button>
          <button
            type="button"
            onClick={() => setShowPresets((v) => !v)}
            className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
          >
            {showPresets ? 'Hide presets' : 'Show presets'}
          </button>
        </div>
      </div>

      {/* Preset grid */}
      {showPresets && (
        <GlassCard className="">
          <h3 className="text-sm font-semibold text-white mb-1">Start from a preset</h3>
          <p className="text-xs text-gray-400 mb-3">
            Each preset fills the draft with a working starter you can edit. Pick one to open the builder.
          </p>
          <div className="ks-card-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {APPLICATION_STUDIO_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="ks-card text-left p-3 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl" aria-hidden="true">{p.icon}</span>
                  <span className="text-sm font-semibold text-white">{p.label}</span>
                </div>
                <p className="text-xs text-gray-400 leading-snug">{p.description}</p>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Install-from-URL quick bar (mirrors the Applications page button) */}
      <GlassCard variant="form" className="flex items-center gap-2 flex-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 shrink-0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
         </svg>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Install an existing application from a URL (https://…/app.ksapp)"
          className="flex-1 min-w-48 bg-black/30 border border-white/10 rounded-md text-sm text-white placeholder-gray-500 px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
        />
        <button
          type="button"
          disabled={urlBusy || !urlInput.trim()}
          onClick={onUrlInstall}
          className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50"
        >
          {urlBusy ? 'Installing…' : 'Install from URL'}
        </button>
        {urlError && <p className="text-red-400 text-xs w-full">{urlError}</p>}
      </GlassCard>

      {installOk && (
        <GlassCard className="text-emerald-300 text-sm border border-emerald-700/40 bg-emerald-900/20">
          {installOk}
        </GlassCard>
      )}
      {installError && (
        <GlassCard className="text-red-300 text-sm border border-red-700/40 bg-red-900/20">
          {installError}
        </GlassCard>
      )}

      {/* Main grid: rail + editor + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_minmax(0,1fr)] gap-4">
        {/* Rail */}
        <GlassCard className="lg:sticky lg:top-4 self-start">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`ks-tab shrink-0 flex items-center gap-2 transition text-left ${
                  tab === t.key ? 'ks-tab-active' : ''
                }`}
              >
                <span className="inline-flex items-center">{t.icon}</span>
                <span className="flex flex-col">
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] hidden lg:block ${tab === t.key ? 'opacity-70' : 'text-gray-500'}`}
                    style={tab === t.key ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                  >
                    {t.hint}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </GlassCard>

        {/* Editor */}
        <GlassCard variant="form" className="space-y-4 min-w-0">
          {tab === 'general' && (
            <>
              <IconColorPicker
                icon={draft.icon || ''}
                color={draft.color || ''}
                onIconChange={(v) => patch({ icon: v })}
                onColorChange={(v) => patch({ color: v })}
                previewName={draft.name || 'Application'}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Name"
                  value={draft.name}
                  onChange={(v) => {
                    patch({ name: v });
                    if (!draft.slug) patch({ slug: slugifyApp(v) });
                  }}
                  placeholder="My Application"
                />
                <TextField
                  label="Slug"
                  value={draft.slug}
                  onChange={(v) => patch({ slug: slugifyApp(v) })}
                  placeholder="my-application"
                  mono
                  hint="URL-safe id; lowercases + hyphenates your name."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Version"
                  value={draft.version}
                  onChange={(v) => patch({ version: v })}
                  placeholder="1.0.0"
                  mono
                />
                <Select
                  label="Category"
                  value={draft.category}
                  onChange={(v) => patch({ category: v })}
                  options={['discord', 'whatsapp', 'telegram', 'slack', 'custom'].map((c) => ({
                    label: appCategoryMeta(c)?.label || c,
                    value: c,
                  }))}
                />
              </div>
              <TextArea
                label="Description"
                value={draft.description}
                onChange={(v) => patch({ description: v })}
                rows={3}
                placeholder="What this application does and why an admin should approve it."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Runtime"
                  value={draft.runtime}
                  onChange={(v) => patch({ runtime: v })}
                  options={['nodejs', 'python', 'bash', 'custom'].map((r) => ({
                    label: appRuntimeMeta(r)?.label || r,
                    value: r,
                  }))}
                />
                {draft.runtime === 'custom' ? (
                  <TextField
                    label="Command"
                    value={draft.command}
                    onChange={(v) => patch({ command: v })}
                    placeholder="java example.class"
                    mono
                    hint="Custom runtimes run this command instead of a file."
                  />
                ) : (
                  <TextField
                    label="Main file"
                    value={draft.mainFile}
                    onChange={(v) => patch({ mainFile: v })}
                    placeholder="src/bot.js"
                    mono
                    hint="Defaults to the first script file when empty."
                  />
                )}
              </div>
            </>
          )}

          {tab === 'permissions' && (
            <PermissionsEditor
              draft={draft}
              onChange={(permissionsRequested) => patch({ permissionsRequested })}
            />
          )}

          {tab === 'configure' && (
            <ConfigureEditor
              draft={draft}
              onChange={(config_schema, env) => patch({ config_schema, env })}
            />
          )}

          {tab === 'scripts' && (
            <ScriptsEditor
              draft={draft}
              onChange={(files) => patch({ files })}
            />
          )}

          {tab === 'raw' && (
            <>
              <p className="text-xs text-gray-400">
                Author or paste the entire manifest. On blur the editor parses it back into the
                structured tabs (General, Permissions, …) so the no-code side stays in sync.
                The top-level <code className="text-gray-300">env</code> key holds saved env
                defaults (sent to <code className="text-gray-300">/:id/env</code> after create).
              </p>
              <TextArea
                label="Manifest JSON"
                value={rawDraft !== null ? rawDraft : raw}
                onChange={(v) => setRawDraft(v)}
                onBlur={commitRaw}
                rows={24}
                mono
                placeholder="{}"
              />
              {rawError && <p className="text-red-400 text-xs">{rawError}</p>}
            </>
          )}
        </GlassCard>

        {/* Live preview */}
        <GlassCard className="min-w-0 flex flex-col">
          <button
            type="button"
            onClick={() => setPreviewCollapsed((v) => !v)}
            className="flex items-center justify-between w-full mb-2"
          >
            <h3 className="text-sm font-semibold text-white">Live preview</h3>
            <span className="text-gray-400 text-xs">{previewCollapsed ? 'show' : 'hide'}</span>
          </button>
          {!previewCollapsed && (
            <pre className="text-[11px] font-mono text-gray-200 bg-black/40 border border-white/10 rounded-md p-3 overflow-auto max-h-[70dvh] whitespace-pre">
{rawDraft !== null ? rawDraft : emittedJson}
           </pre>
          )}
          <p className="text-[10px] text-gray-500 mt-2">
            This is exactly what will be POSTed to <code className="text-gray-400">/api/applications/</code>
            {Object.keys(emitted.env).length > 0 && (
              <> (plus saved env to <code className="text-gray-400">/:id/env</code>)</>
            )}.
            The backend validates <code className="text-gray-400">permissionsRequested</code> against the capability whitelist.
          </p>
        </GlassCard>
      </div>

      {/* Validation + action bar */}
      <GlassCard variant="form" className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIssues((v) => !v)}
            className={`px-3 py-1.5 rounded text-sm border ${
              validation.ok
                ? 'border-emerald-700/40 text-emerald-200 hover:bg-emerald-900/30'
                : 'border-amber-700/40 text-amber-200 hover:bg-amber-900/30'
            }`}
          >
            {validation.ok ? '✓ Valid' : `${validation.issues.length} issue(s)`}
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
          >
            Reset
          </button>
          {showIssues && !validation.ok && (
            <ul className="text-xs text-amber-300 list-disc list-inside">
              {validation.issues.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="ks-primary-btn px-4 py-2 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          {installing ? 'Installing…' : 'Install application'}
        </button>
      </GlassCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-editors — one per tab. Kept inline so the page stays a single read.
// ---------------------------------------------------------------------------

// ---- Permissions -----------------------------------------------------------
const PermissionsEditor: React.FC<{
  draft: ApplicationStudioDraft;
  onChange: (permissionsRequested: ApplicationPermissionReq[]) => void;
}> = ({ draft, onChange }) => {
  const granted = new Map<string, ApplicationPermissionReq>();
  for (const p of draft.permissionsRequested) granted.set(p.capability, p);

  const toggle = (cap: string, meta: (typeof APPLICATION_CAPABILITIES)[number]) => {
    if (granted.has(cap)) {
      onChange(draft.permissionsRequested.filter((p) => p.capability !== cap));
    } else {
      const firstLevel = meta.accessLevels[0]?.value ?? '';
      onChange([...draft.permissionsRequested, { capability: cap, access_level: firstLevel }]);
    }
  };

  const setLevel = (cap: string, access_level: string) => {
    onChange(
      draft.permissionsRequested.map((p) =>
        p.capability === cap ? { ...p, access_level } : p,
      ),
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        The capabilities below are the only ones the panel knows. Requesting them seeds{' '}
        <code className="text-gray-300">application_permissions</code> rows that the admin must approve
        before the application can be activated — exactly like an uploaded <code className="text-gray-300">.ksapp</code>.
      </p>
      {APPLICATION_CAPABILITIES.map((cap) => {
        const req = granted.get(cap.key);
        const on = !!req;
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
              onChange={() => toggle(cap.key, cap)}
              className="mt-1 w-4 h-4 accent-emerald-500"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cap.dot}`} />
                {cap.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{cap.description}</p>
              {on && cap.accessLevels.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cap.accessLevels.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setLevel(cap.key, lvl.value)}
                      className={`ks-tab text-[11px] px-2 py-1 rounded border ${
                        req?.access_level === lvl.value ? 'ks-tab-active' : ''
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
};

// ---- Configure (config_schema + saved env) ---------------------------------
const ConfigureEditor: React.FC<{
  draft: ApplicationStudioDraft;
  onChange: (config_schema: ApplicationConfigField[], env: Record<string, string>) => void;
}> = ({ draft, onChange }) => {
  const [schemaText, setSchemaText] = useState<string>(JSON.stringify(draft.config_schema ?? [], null, 2));
  const [schemaError, setSchemaError] = useState('');
  const lastSyncedRef = useRef<string>(JSON.stringify(draft.config_schema ?? []));
  useEffect(() => {
    const serialized = JSON.stringify(draft.config_schema ?? []);
    if (serialized !== lastSyncedRef.current) {
      lastSyncedRef.current = serialized;
      setSchemaText(JSON.stringify(draft.config_schema ?? [], null, 2));
    }
  }, [draft.config_schema]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-gray-400">
          Config schema declares the fields users fill in when installing (e.g. bot token).
          Must be a JSON array of field definitions.
        </p>
        <TextArea
          label="Config schema (JSON array)"
          value={schemaText}
          onChange={(v) => {
            setSchemaText(v);
            try {
              const parsed = JSON.parse(v || '[]');
              if (!Array.isArray(parsed)) {
                setSchemaError('Config schema must be a JSON array.');
                return;
              }
              setSchemaError('');
              lastSyncedRef.current = JSON.stringify(parsed);
              onChange(parsed as ApplicationConfigField[], draft.env);
            } catch {
              setSchemaError('Invalid JSON — keep editing, nothing was overwritten.');
            }
          }}
          rows={8}
          mono
          placeholder='[{"key":"bot_token","label":"Bot Token","type":"secret","required":true}]'
        />
        {schemaError && <p className="text-amber-300 text-xs">{schemaError}</p>}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-gray-400">
          Saved environment defaults for this application. Users can override
          them on the Run form — tokens/keys never need to be hard-coded.
        </p>
        <div className="space-y-2">
          {Object.entries(draft.env).map(([key, value]) => (
            <div key={key} className="grid grid-cols-2 gap-2">
              <input
                className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                placeholder="KEY e.g. VERSION"
                value={key}
                onChange={(e) => {
                  if (e.target.value === key) return;
                  const next: Record<string, string> = {};
                  for (const [k, v] of Object.entries(draft.env)) {
                    next[k === key ? e.target.value : k] = v;
                  }
                  onChange(draft.config_schema, next);
                }}
              />
              <div className="flex gap-1">
                <input
                  className="flex-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                  placeholder="Value e.g. 1.0.0"
                  value={value}
                  onChange={(e) => onChange(draft.config_schema, { ...draft.env, [key]: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove ${key}`}
                  onClick={() => {
                    const next = { ...draft.env };
                    delete next[key];
                    onChange(draft.config_schema, next);
                  }}
                  className="px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              placeholder="KEY e.g. BOT_TOKEN"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
            />
            <input
              className="bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              placeholder="Value (optional)"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const k = newEnvKey.trim();
                if (!k || k in draft.env) return;
                onChange(draft.config_schema, { ...draft.env, [k]: newEnvValue });
                setNewEnvKey('');
                setNewEnvValue('');
              }}
              disabled={!newEnvKey.trim()}
              className="px-3 py-1.5 text-sm rounded border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
        <GlassCard className="text-xs text-gray-300">
          These become the application&apos;s saved env — every Run merges them under the operator&apos;s per-run overrides.
        </GlassCard>
      </div>
    </div>
  );
};

// ---- Scripts ---------------------------------------------------------------
const ScriptsEditor: React.FC<{
  draft: ApplicationStudioDraft;
  onChange: (files: ApplicationFile[]) => void;
}> = ({ draft, onChange }) => {
  const [selectedPath, setSelectedPath] = useState('');
  const selectedFile = useMemo(
    () => draft.files.find((f) => f.path === selectedPath),
    [draft.files, selectedPath],
  );

  const addScriptFile = () => {
    const input = window.prompt('New file path (relative, e.g. src/bot.js):');
    if (!input) return;
    const path = input.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path) return;
    if (draft.files.some((f) => f.path === path)) {
      window.alert('A file with this path already exists.');
      return;
    }
    onChange([...draft.files, { path, content: '' }]);
    setSelectedPath(path);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="ks-card ks-form-card md:col-span-1 rounded-md overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400 uppercase">Files</p>
          <div className="flex gap-1">
            <label className="ks-btn-ghost text-[10px] px-2 py-0.5 cursor-pointer">
              Upload
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  if (!picked.length) return;
                  e.target.value = '';
                  void Promise.all(
                    picked.map(async (f) => ({
                      path: f.name.replace(/\\/g, '/'),
                      content: await f.text().catch(() => ''),
                    })),
                  ).then((loaded) => {
                    const seen = new Set(draft.files.map((x) => x.path));
                    const fresh = loaded.filter((x) => x.path && !seen.has(x.path));
                    if (fresh.length > 0) {
                      onChange([...draft.files, ...fresh]);
                      setSelectedPath(fresh[0].path);
                    }
                  });
                }}
              />
            </label>
            <button type="button" className="ks-btn-ghost text-[10px] px-2 py-0.5" onClick={addScriptFile}>New</button>
          </div>
        </div>
        <ul className="text-sm space-y-1">
          {draft.files.map((file, idx) => (
            <li key={idx} className={`flex items-center justify-between px-2 py-1 rounded ${selectedPath === file.path ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <button
                type="button"
                className="truncate text-left flex-1"
                onClick={() => setSelectedPath(file.path)}
                title={file.path}
              >
                {file.path}
              </button>
              <button
                type="button"
                aria-label={`Remove ${file.path}`}
                onClick={() => onChange(draft.files.filter((f) => f.path !== file.path))}
                className="ml-2 shrink-0 text-red-400 hover:text-red-300 px-1 rounded hover:bg-red-900/30"
              >
                ×
              </button>
            </li>
          ))}
          {draft.files.length === 0 && (
            <li className="text-xs text-gray-500 px-2">No files yet.</li>
          )}
        </ul>
      </div>
      <div className="ks-card ks-form-card md:col-span-2 rounded-md flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400 uppercase">Editor{selectedPath ? ` — ${selectedPath}` : ''}</p>
        </div>
        <textarea
          className="w-full flex-1 min-h-[50vh] bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-2 font-mono"
          placeholder="# Select a file to edit…"
          value={selectedFile?.content ?? ''}
          readOnly={!selectedFile}
          onChange={(e) => {
            if (!selectedPath) return;
            const content = e.target.value;
            onChange(draft.files.map((f) => (f.path === selectedPath ? { ...f, content } : f)));
          }}
        />
      </div>
    </div>
  );
};

export default ApplicationStudio;
