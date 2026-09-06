import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import {
  MOD_CAPABILITIES,
  modCapabilityMeta,
  ModManifestV2,
  ModStudioDraft,
  blankModStudioDraft,
  emitStudioManifest,
  slugify,
  type CustomPermission,
  type HookDefinition,
  type PermissionRequest,
  type SlotDefinition,
} from '@/shared/types/mod';
import { createModFromStudio, installModFromUrl, extractApiErrorMessage } from '@/features/mods/api/mods';
import { MOD_STUDIO_PRESETS } from './modStudioPresets';
import { useConfirm } from '@/shared/stores/confirmStore';

// ---------------------------------------------------------------------------
// ModStudio — a visual + code manifest builder.
//
// The Studio models a mod as an editable "draft" (ModStudioDraft). The admin
// edits structured builder blocks (no-code) OR types raw manifest JSON
// (pro-code), previewing the produced manifest live. Saving the draft ships
// it through the existing POST /api/mods endpoint (the same one the
// Upload button uses), so the Studio is a GENERATOR, not a new runtime — it
// does NOT bypass the security model. Capabilities are still validated by
// the backend, permissions are still seeded granted=false, and activation
// still requires explicit grant approval afterwards.
//
// Layout:
//   [tab rail] | [active editor] | [live manifest preview]
//
// Tabs: Meta · Permissions · Slots · Hooks · Backend · Custom Perms · Spec ·
//       Raw JSON
//
// The "Spec" tab is a freeform JSON blob editable as a textarea (so a
// no-code admin can still attach page/tool definitions the engine consumes
// verbatim). The Raw JSON tab lets a power-user author the whole manifest as
// JSON; editing there backfills the structured tabs on tab change.
// ---------------------------------------------------------------------------

type Tab =
  | 'meta'
  | 'permissions'
  | 'slots'
  | 'hooks'
  | 'backend'
  | 'customPerms'
  | 'spec'
  | 'raw';

interface TabDef {
  key: Tab;
  label: string;
  icon: React.ReactNode;
  hint: string;
}

const TABS: TabDef[] = [
  { key: 'meta', label: 'Meta', hint: 'Name, slug, version, description',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/> </svg> },
  { key: 'permissions', label: 'Permissions', hint: 'Host capabilities + access levels',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg> },
  { key: 'slots', label: 'Slots', hint: 'Frontend injection points',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/> </svg> },
  { key: 'hooks', label: 'Hooks', hint: 'Event listeners (pre/post)',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/> </svg> },
  { key: 'backend', label: 'Backend script', hint: 'Entry JS the engine evaluates',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/> </svg> },
  { key: 'customPerms', label: 'Custom perms', hint: 'Mod-scoped RBAC keys',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="7.5" cy="15.5" r="3.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/> </svg> },
  { key: 'spec', label: 'Spec', hint: 'Freeform config blob',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 6h16M4 12h16M4 18h10"/> </svg> },
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

const ModStudio: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<ModStudioDraft>(blankModStudioDraft);
  const [tab, setTab] = useState<Tab>('meta');
  const [raw, setRaw] = useState<string>('');
  const [rawError, setRawError] = useState<string>('');
  // null = no buffer (use structured editor truth); '' = user-cleared the
  // field; anything else = user is mid-edit. The null sentinel matters so
  // we don't accidentally interpret a legit empty buffer as "no edits".
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installOk, setInstallOk] = useState('');
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [showPresets, setShowPresets] = useState(true);

  // Re-seed the raw buffer every time the structured draft changes so the
  // Raw JSON tab always reflects the structured editor's truth (until the
  // admin starts typing in the raw textarea, which promotes the buffer).
  const emittedManifest = useMemo(() => emitStudioManifest(draft), [draft]);
  useEffect(() => {
    setRaw(JSON.stringify(emittedManifest, null, 2));
    // Only reset the buffer when it isn't a user edit in flight. The
    // presence of any text in rawDraft means the user is typing; preserve
    // it so a structured-tab change doesn't wipe their WIP.
    setRawDraft((prev) => prev);
  }, [emittedManifest]);

  const patch = useCallback((partial: Partial<ModStudioDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  // auto-promote to v2 the moment any v2-only block is used. Otherwise we
  // silently ship a v1 manifest that ignores the slots/hooks/script.
  const touch = useCallback((partial: Partial<ModStudioDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...partial };
      const usesV2 =
        next.slots.length > 0 ||
        next.hooks.length > 0 ||
        next.backendScript.trim().length > 0 ||
        next.permissionsDeclared.length > 0;
      if (usesV2 && next.engineVersion !== 2) next.engineVersion = 2;
      return next;
    });
  }, []);

  // ---- raw <-> structured sync --------------------------------------------
  // When the admin focuses the Raw JSON tab we let them edit a separate
  // buffer; on blur the buffer is parsed back into the structured draft.
  // parseRawToDraft is the synchronous core shared by commitRaw (blur path)
  // and install (which must use the just-typed buffer, not the stale draft
  // state that setDraft hasn't flushed yet).
  const parseRawToDraft = (rawText: string): ModStudioDraft => {
    const parsed = JSON.parse(rawText) as ModManifestV2;
    return {
      name: parsed.name ?? '',
      slug: parsed.slug ?? '',
      version: parsed.version ?? '',
      description: parsed.description ?? '',
      engineVersion: (parsed.engineVersion === 2 ? 2 : 1) as 1 | 2,
      permissionsRequested: Array.isArray(parsed.permissionsRequested)
        ? parsed.permissionsRequested
        : [],
      slots: Array.isArray(parsed.slots) ? parsed.slots : [],
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
      permissionsDeclared: Array.isArray(parsed.permissionsDeclared)
        ? parsed.permissionsDeclared
        : [],
      backendScript: parsed.backendScriptSource ?? '',
      spec: (parsed.spec as Record<string, any>) ?? {},
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

  // validate() and the showIssues state must be declared BEFORE install()
  // (which references them) — otherwise the `validate` reference in install's
  // useCallback deps array throws a temporal-dead-zone ReferenceError on the
  // first render and the whole page crashes to a blank/black screen.
  // validateDraftOf runs the same checks against an explicit draft so install()
  // can validate the just-parsed raw buffer (effectiveDraft) instead of the
  // stale `draft` state.
  const validateDraftOf = (d: ModStudioDraft): { ok: boolean; issues: string[] } => {
    const issues: string[] = [];
    if (!d.name.trim()) issues.push('Name is required.');
    if (!d.slug.trim()) issues.push('Slug is required.');
    if (/[^a-z0-9-]/.test(d.slug)) issues.push('Slug must be lowercase letters, digits, and dashes only.');
    for (const s of d.slots) {
      if (!s.name || !s.component) issues.push(`Slot missing name or component.`);
    }
    for (const h of d.hooks) {
      if (!h.event || !h.handler) issues.push(`Hook missing event or handler.`);
      if (h.phase !== 'pre' && h.phase !== 'post') issues.push(`Hook phase must be 'pre' or 'post'.`);
    }
    const knownCaps = new Set(MOD_CAPABILITIES.map((c) => c.key));
    for (const p of d.permissionsRequested) {
      if (!knownCaps.has(p.capability as any)) issues.push(`Unknown capability: ${p.capability}`);
      const meta = modCapabilityMeta(p.capability);
      if (meta && p.access_level && !meta.accessLevels.some((a) => a.value === p.access_level)) {
        issues.push(`Access level "${p.access_level}" not valid for ${p.capability}`);
      }
    }
    return { ok: issues.length === 0, issues };
  };
  const validate = useCallback((): { ok: boolean; issues: string[] } => validateDraftOf(draft), [draft]);

  const validation = useMemo(validate, [validate]);
  const [showIssues, setShowIssues] = useState(false);

  // ---- list / install -----------------------------------------------------
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
      const manifest = emitStudioManifest(effectiveDraft);
      if (!manifest.name || !manifest.slug) {
        setInstallError('Name and slug are required (edit them in the Meta tab).');
        setTab('meta');
        setShowIssues(true);
        return;
      }
      // Refuse to send a manifest the validation pass already flagged so the
      // admin sees the issue list *before* the server rejects it. The "X
      // issue(s)" button still toggles the list — we only block the send.
      // Validate effectiveDraft (the just-parsed raw buffer when present),
      // not the stale `draft` state.
      const v = validateDraftOf(effectiveDraft);
      if (!v.ok) {
        setInstallError(`Cannot install: ${v.issues.length} validation issue(s) — fix them and try again.`);
        setShowIssues(true);
        return;
      }
      await createModFromStudio(manifest, 'studio');
      setInstallOk('Mod installed — now review its requested permissions on the Mods page.');
      setTimeout(() => {
        navigate('/mods');
      }, 700);
    } catch (e: any) {
      setInstallError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setInstalling(false);
    }
  }, [draft, rawDraft, navigate]);

  // validate(), validation and the showIssues state moved above install() —
  // see the comment there (referencing them before their const declaration
  // crashed the first render with a TDZ ReferenceError, showing a blank page).

  // ---- install-from-URL quick-pick ---------------------------------------
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const onUrlInstall = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlBusy(true);
    setUrlError('');
    try {
      await installModFromUrl(urlInput.trim());
      setUrlInput('');
      setInstallOk('Installed mod from URL — open the Mods page to review its permissions.');
      setTimeout(() => navigate('/mods'), 700);
    } catch (e: any) {
      setUrlError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setUrlBusy(false);
    }
  }, [urlInput, navigate]);

  // ---- preset apply -------------------------------------------------------
  const applyPreset = useCallback((id: string) => {
    const p = MOD_STUDIO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const d = p.build();
    setDraft(d);
    setShowPresets(false);
    setTab('meta');
  }, []);

  // ---- reset --------------------------------------------------------------
  const reset = useCallback(async () => {
    if (!(await confirm({ title: 'Reset draft', message: 'Discard the current draft and start over?', tone: 'warning', confirmLabel: 'Discard' }))) return;
    setDraft(blankModStudioDraft());
    setTab('meta');
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
          <h2 className="text-xl font-semibold text-white">Mod Studio</h2>
          <p className="text-sm text-gray-400 -mt-0.5 max-w-2xl">
            Visually author a mod (panel add-on) and install it in one step. The Studio emits a
            manifest the engine validates the same way an uploaded <code className="text-gray-300">.ksmod</code> is
            validated — capabilities stay whitelisted, permissions still need explicit approval, so the Studio never
            silently unlocks anything.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/mods')}
            className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
          >
            ← Back to Mods
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
            {MOD_STUDIO_PRESETS.map((p) => (
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

      {/* Install-from-URL quick bar (mirrors the Mods page button) */}
      <GlassCard variant="form" className="flex items-center gap-2 flex-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 shrink-0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
         </svg>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Install an existing mod from a URL (https://…/mod.ksmod)"
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
          {tab === 'meta' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Name"
                  value={draft.name}
                  onChange={(v) => {
                    patch({ name: v });
                    if (!draft.slug) patch({ slug: slugify(v) });
                  }}
                  placeholder="My Awesome Mod"
                />
                <TextField
                  label="Slug"
                  value={draft.slug}
                  onChange={(v) => patch({ slug: slugify(v) })}
                  placeholder="my-awesome-mod"
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
                  label="Engine version"
                  value={String(draft.engineVersion)}
                  onChange={(v) => patch({ engineVersion: v === '2' ? 2 : 1 })}
                  options={[
                    { label: 'v1 — static manifest (no JS runtime)', value: '1' },
                    { label: 'v2 — event-driven engine (slots + hooks)', value: '2' },
                  ]}
                />
              </div>
              <TextArea
                label="Description"
                value={draft.description}
                onChange={(v) => patch({ description: v })}
                rows={3}
                placeholder="What this mod does and why an admin should approve it."
              />
              <p className="text-[11px] text-gray-500">
                The Studio auto-promotes to v2 as soon as you add a slot, hook, backend script, or
                custom permission — so you can't accidentally ship a v2 manifest that silently drops
                everything interesting.
              </p>
            </>
          )}

          {tab === 'permissions' && (
            <PermissionsEditor
              draft={draft}
              onChange={(permissionsRequested) => touch({ permissionsRequested })}
            />
          )}

          {tab === 'slots' && (
            <SlotsEditor
              draft={draft}
              onChange={(slots) => touch({ slots })}
            />
          )}

          {tab === 'hooks' && (
            <HooksEditor
              draft={draft}
              onChange={(hooks) => touch({ hooks })}
            />
          )}

          {tab === 'backend' && (
            <>
              <p className="text-xs text-gray-400">
                Inline entry script the panel's Goja VM evaluates on activation. Stored as{' '}
                <code className="text-gray-300">backendScriptSource</code> in the manifest (the engine
                prefers inline source over a file path), so a Studio-built mod is self-contained.
              </p>
              <TextArea
                label="Backend script (JavaScript)"
                value={draft.backendScript}
                onChange={(v) => touch({ backendScript: v })}
                rows={18}
                mono
                placeholder={`ks.events.on('post:instance.start', function (payload) {\n  ks.log('info', 'started: ' + (payload && payload.id));\n});`}
              />
            </>
          )}

          {tab === 'customPerms' && (
            <CustomPermsEditor
              draft={draft}
              slug={draft.slug}
              onChange={(permissionsDeclared) => touch({ permissionsDeclared })}
            />
          )}

          {tab === 'spec' && (
            <SpecEditor
              draft={draft}
              onChange={(spec) => touch({ spec })}
            />
          )}

          {tab === 'raw' && (
            <>
              <p className="text-xs text-gray-400">
                Author or paste the entire manifest. On blur the editor parses it back into the
                structured tabs (Meta, Permissions, …) so the no-code side stays in sync. Parsing
                preserves unknown fields so a custom manifest isn't lost.
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
{rawDraft !== null ? rawDraft : JSON.stringify(emittedManifest, null, 2)}
           </pre>
          )}
          <p className="text-[10px] text-gray-500 mt-2">
            This is exactly what will be POSTed to <code className="text-gray-400">/api/mods</code>.
            Unknown fields survive; the backend validates <code className="text-gray-400">permissionsRequested</code> against the capability whitelist.
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
          {installing ? 'Installing…' : 'Install mod'}
        </button>
      </GlassCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-editors — one per tab. Kept inline so the page stays a single read.
// Each editor owns its own row state so adding/removing rows is cheap and
// the parent draft only updates on commit (avoids re-render storms).
// ---------------------------------------------------------------------------

// ---- Permissions -----------------------------------------------------------
const PermissionsEditor: React.FC<{
  draft: ModStudioDraft;
  onChange: (permissionsRequested: PermissionRequest[]) => void;
}> = ({ draft, onChange }) => {
  // Map each capability to its current request row (or undefined).
  const granted = new Map<string, PermissionRequest>();
  for (const p of draft.permissionsRequested) granted.set(p.capability, p);

  const toggle = (cap: string, meta: typeof MOD_CAPABILITIES[number]) => {
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
        <code className="text-gray-300">mod_permissions</code> rows that the admin must approve
        before the mod can be activated — exactly like an uploaded <code className="text-gray-300">.ksmod</code>.
      </p>
      {MOD_CAPABILITIES.map((cap) => {
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

// ---- Slots ----------------------------------------------------------------
const EMPTY_SLOT: SlotDefinition = { name: '', component: '', props: {} };

const SlotsEditor: React.FC<{
  draft: ModStudioDraft;
  onChange: (slots: SlotDefinition[]) => void;
}> = ({ draft, onChange }) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Slots are frontend injection points the panel renders at well-known layout locations.
        <code className="text-gray-300">name</code> picks the location (e.g.{' '}
        <code className="text-gray-300">instance.detail.tabs</code>);{' '}
        <code className="text-gray-300">component</code> is the export name in the mod's bundle;
        <code className="text-gray-300">props</code> is forwarded to the rendered component verbatim.
      </p>
      {(draft.slots.length === 0 ? [EMPTY_SLOT] : draft.slots).map((s, idx) => {
        // When the admin types into the empty-state placeholder row, we
        // promote it to a real row in-place: draft.slots is empty so the
        // naive `draft.slots.map(...)` would drop the keystroke (map over
        // [] returns []). We detect the placeholder (idx === draft.slots.length)
        // and swap the map for an append that seeds the row with the edit.
        const isPlaceholder = idx >= draft.slots.length;
        const editSlot = (patch: Partial<SlotDefinition>) => {
          if (isPlaceholder) {
            onChange([...draft.slots, { ...EMPTY_SLOT, ...patch }]);
          } else {
            onChange(draft.slots.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
          }
        };
        return (
        <div key={idx} className="ks-card ks-form-card p-3 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField
              label="Slot name (layout location)"
              value={s.name}
              onChange={(v) => editSlot({ name: v })}
              placeholder="instance.detail.tabs"
              mono
            />
            <TextField
              label="Component export name"
              value={s.component}
              onChange={(v) => editSlot({ component: v })}
              placeholder="MyTab"
              mono
            />
          </div>
          <TextArea
            label="Props (JSON, forwarded verbatim)"
            value={JSON.stringify(s.props ?? {}, null, 2)}
            onChange={(v) => {
              try {
                const parsed = JSON.parse(v || '{}');
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  editSlot({ props: parsed });
                }
                // If JSON parses but isn't an object, leave the existing
                // props alone — the admin is probably mid-edit.
              } catch {
                /* partial / invalid JSON: keep the existing props so the
                   admin doesn't silently lose them on the next keystroke. */
              }
            }}
            rows={3}
            mono
          />
          <div className="flex justify-end">
            {!isPlaceholder && (
              <button
                type="button"
                onClick={() => onChange(draft.slots.filter((_, i) => i !== idx))}
                className="px-2 py-1 rounded text-xs border border-red-700/40 text-red-300 hover:bg-red-900/30"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...draft.slots, { ...EMPTY_SLOT }])}
        className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
      >
        + {draft.slots.length === 0 ? 'Add first slot' : 'Add another slot'}
      </button>
    </div>
  );
};

// ---- Hooks ----------------------------------------------------------------
const EMPTY_HOOK: HookDefinition = { event: '', phase: 'post', handler: '' };

const HooksEditor: React.FC<{
  draft: ModStudioDraft;
  onChange: (hooks: HookDefinition[]) => void;
}> = ({ draft, onChange }) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Hooks let the mod's backend script react to host lifecycle events
        (<code className="text-gray-300">post:instance.start</code>,{' '}
        <code className="text-gray-300">post:instance.stop</code>,{' '}
        <code className="text-gray-300">pre:instance.destroy</code> …).{' '}
        <code className="text-gray-300">pre:</code> hooks are cancellable and run before the action;
        everything else runs async after.
      </p>
      {(draft.hooks.length === 0 ? [EMPTY_HOOK] : draft.hooks).map((h, idx) => {
        const isPlaceholder = idx >= draft.hooks.length;
        const editHook = (patch: Partial<HookDefinition>) => {
          if (isPlaceholder) {
            onChange([...draft.hooks, { ...EMPTY_HOOK, ...patch }]);
          } else {
            onChange(draft.hooks.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
          }
        };
        return (
        <div key={idx} className="ks-card ks-form-card p-3 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <TextField
              label="Event name"
              value={h.event}
              onChange={(v) => editHook({ event: v })}
              placeholder="post:instance.start"
              mono
            />
            <Select
              label="Phase"
              value={h.phase}
              onChange={(v) => editHook({ phase: v as 'pre' | 'post' })}
              options={[
                { label: 'pre (cancellable)', value: 'pre' },
                { label: 'post (async)', value: 'post' },
              ]}
            />
            <TextField
              label="Handler (exported JS fn name)"
              value={h.handler}
              onChange={(v) => editHook({ handler: v })}
              placeholder="onInstanceStart"
              mono
            />
          </div>
          <div className="flex justify-end">
            {!isPlaceholder && (
              <button
                type="button"
                onClick={() => onChange(draft.hooks.filter((_, i) => i !== idx))}
                className="px-2 py-1 rounded text-xs border border-red-700/40 text-red-300 hover:bg-red-900/30"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...draft.hooks, { ...EMPTY_HOOK }])}
        className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
      >
        + {draft.hooks.length === 0 ? 'Add first hook' : 'Add another hook'}
      </button>
    </div>
  );
};

// ---- Custom perms ---------------------------------------------------------
const EMPTY_PERM: CustomPermission = { key: '', description: '' };

const CustomPermsEditor: React.FC<{
  draft: ModStudioDraft;
  slug: string;
  onChange: (permissionsDeclared: CustomPermission[]) => void;
}> = ({ draft, slug, onChange }) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Mod-scoped RBAC keys the manifest declares. The backend namespaces them under{' '}
        <code className="text-gray-300">{'<slug>'}:{'<key>'}</code> so two mods can't collide
        on <code className="text-gray-300">admin</code> or <code className="text-gray-300">configure</code>.
        These are surfaced next to host capabilities in the grant checklist; the panel does not enforce them today beyond surfacing.
      </p>
      {(draft.permissionsDeclared.length === 0 ? [EMPTY_PERM] : draft.permissionsDeclared).map((p, idx) => {
        const isPlaceholder = idx >= draft.permissionsDeclared.length;
        const editPerm = (patch: Partial<CustomPermission>) => {
          if (isPlaceholder) {
            onChange([...draft.permissionsDeclared, { ...EMPTY_PERM, ...patch }]);
          } else {
            onChange(draft.permissionsDeclared.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
          }
        };
        return (
        <div key={idx} className="ks-card ks-form-card p-3 rounded-lg space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField
              label="Key (namespaced under the mod slug)"
              value={p.key}
              onChange={(v) => editPerm({ key: v })}
              placeholder="audit"
              mono
              hint={slug ? `stored as ${slug}:${p.key || 'audit'}` : 'enter a slug first'}
            />
            <TextField
              label="Description"
              value={p.description || ''}
              onChange={(v) => editPerm({ description: v })}
              placeholder="Read the mod audit log"
            />
          </div>
          <div className="flex justify-end">
            {!isPlaceholder && (
              <button
                type="button"
                onClick={() => onChange(draft.permissionsDeclared.filter((_, i) => i !== idx))}
                className="px-2 py-1 rounded text-xs border border-red-700/40 text-red-300 hover:bg-red-900/30"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...draft.permissionsDeclared, { ...EMPTY_PERM }])}
        className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
      >
        + {draft.permissionsDeclared.length === 0 ? 'Add first custom permission' : 'Add another custom permission'}
      </button>
    </div>
  );
};

// ---- Spec -----------------------------------------------------------------
const SpecEditor: React.FC<{
  draft: ModStudioDraft;
  onChange: (spec: Record<string, any>) => void;
}> = ({ draft, onChange }) => {
  // Track the last spec we forwarded so we can re-seed the textarea when the
  // parent updates draft.spec from outside (preset apply, raw-tab commit,
  // …). The previous version used useRef which only initialises on mount,
  // so external updates were lost.
  const [text, setText] = useState<string>(JSON.stringify(draft.spec ?? {}, null, 2));
  const lastSyncedRef = useRef<string>(JSON.stringify(draft.spec ?? {}));
  useEffect(() => {
    const serialized = JSON.stringify(draft.spec ?? {});
    if (serialized !== lastSyncedRef.current) {
      lastSyncedRef.current = serialized;
      setText(JSON.stringify(draft.spec ?? {}, null, 2));
    }
  }, [draft.spec]);
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        The <code className="text-gray-300">spec</code> blob is opaque to the backend — it's stored
        verbatim so the frontend (or your mod's UI) can read page/tool definitions without a schema
        change. Edited here, surfaced on the mod card's Edit modal after install.
     </p>
      <TextArea
        label="Spec (JSON)"
        value={text}
        onChange={(v) => {
          setText(v);
          try {
            const parsed = JSON.parse(v || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              lastSyncedRef.current = JSON.stringify(parsed);
              onChange(parsed);
            }
          } catch {
            /* keep editing, don't blow away the buffer */
          }
        }}
        rows={16}
        mono
        placeholder="{}"
      />
    </div>
  );
};

export default ModStudio;