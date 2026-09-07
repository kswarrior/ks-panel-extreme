import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
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
  type StackStudioDraft,
} from '@/shared/types/stack';
import {
  createStackFromManifest,
  installStackFromUrl,
  writeStackFile,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import StackFileManager from '@/features/stacks/components/StackFileManager';
import { useConfirm } from '@/shared/stores/confirmStore';

// ---------------------------------------------------------------------------
// StackStudio — visual + code stack builder with a full file manager.
//
// The Studio models a stack as an editable draft. Tabs Meta/Theme/Pages/
// Permissions/Backend/Spec/Raw edit the draft; Files edits the installed
// stack's workdir (manifest install first, then seed + browse files).
// Saving ships the draft through POST /api/stacks/ (X-KS-Source: studio) so
// capabilities stay validated and permissions seed pending — the Studio is a
// GENERATOR, never a runtime bypass. Seeded files (spa bundle, theme.css,
// simple pages, backend entry) are written through the workdir file
// endpoints right after install so downloads keep them.
// ---------------------------------------------------------------------------

type Tab = 'meta' | 'theme' | 'pages' | 'permissions' | 'backend' | 'spec' | 'files' | 'raw';

const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  { key: 'meta', label: 'Meta', hint: 'Name, slug, version, icon' },
  { key: 'theme', label: 'Theme', hint: 'theme_mode + page_style + css' },
  { key: 'pages', label: 'Pages', hint: 'SPA html or simple markdown' },
  { key: 'permissions', label: 'Permissions', hint: 'Capability requests' },
  { key: 'backend', label: 'Backend', hint: 'Sidecar runtime + script' },
  { key: 'spec', label: 'Spec', hint: 'Freeform config blob' },
  { key: 'files', label: 'Files', hint: 'Workdir file manager' },
  { key: 'raw', label: 'Raw JSON', hint: 'Whole manifest' },
];

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}> = ({ label, value, onChange, placeholder, mono, hint }) => (
  <label className="block">
    <span className="text-xs text-gray-400">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40 ${mono ? 'font-mono' : ''}`}
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
      className={`block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-2 focus:outline-none focus:border-white/40 ${mono ? 'font-mono' : ''}`}
    />
    {hint && <span className="text-[11px] text-gray-500 mt-1 block">{hint}</span>}
  </label>
);

const StackStudio: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<StackStudioDraft>(blankStackStudioDraft);
  const [tab, setTab] = useState<Tab>('meta');
  const [raw, setRaw] = useState('');
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [rawError, setRawError] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installOk, setInstallOk] = useState('');
  const [installedId, setInstalledId] = useState<number | null>(null);
  const [installedSlug, setInstalledSlug] = useState('');
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const emittedManifest = useMemo(() => emitStackStudioManifest(draft), [draft]);
  useEffect(() => {
    setRaw(JSON.stringify(emittedManifest, null, 2));
    setRawDraft((prev) => prev);
  }, [emittedManifest]);

  const patch = useCallback((partial: Partial<StackStudioDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  const parseRawToDraft = (rawText: string): StackStudioDraft => {
    const parsed = JSON.parse(rawText) as Record<string, any>;
    const base = blankStackStudioDraft();
    return {
      ...base,
      name: parsed.name ?? '',
      slug: parsed.slug ?? '',
      version: parsed.version ?? '1.0.0',
      description: parsed.description ?? '',
      icon: parsed.icon ?? '',
      color: parsed.color ?? '',
      category: parsed.category ?? 'dashboard',
      runtime: parsed.runtime ?? parsed.backend?.runtime ?? 'static',
      entrypoint: parsed.entrypoint ?? parsed.backend?.entrypoint ?? '',
      themeMode: parsed.themeMode ?? parsed.frontend?.theme?.mode ?? 'panel',
      pageStyle: parsed.pageStyle ?? parsed.frontend?.page_style ?? 'spa',
      permissionsRequested: Array.isArray(parsed.permissionsRequested) ? parsed.permissionsRequested : [],
      backendScript: parsed.backendScriptSource ?? parsed.backendScript ?? '',
      frontendHtml: parsed.frontendHtml ?? '',
      frontendCss: parsed.frontendCss ?? '',
      simplePage: parsed.simplePage ?? base.simplePage,
      spec: (parsed.spec as Record<string, any>) ?? {},
    };
  };

  const commitRaw = useCallback(() => {
    if (rawDraft === null) return;
    setRawError('');
    try {
      setDraft(parseRawToDraft(rawDraft));
      setRawDraft(null);
    } catch (e: any) {
      setRawError('invalid JSON: ' + (e?.message || String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDraft]);

  const validateDraftOf = (d: StackStudioDraft): { ok: boolean; issues: string[] } => {
    const issues: string[] = [];
    if (!d.name.trim()) issues.push('Name is required.');
    if (!d.slug.trim()) issues.push('Slug is required.');
    if (d.slug && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(d.slug)) issues.push('Slug must be lowercase letters, digits and hyphens (max 64).');
    if (!['static', 'nodejs', 'python'].includes(d.runtime)) issues.push(`Unknown runtime ${d.runtime}.`);
    if (!['panel', 'custom', 'none'].includes(d.themeMode)) issues.push(`Unknown theme mode ${d.themeMode}.`);
    if (!['spa', 'simple'].includes(d.pageStyle)) issues.push(`Unknown page style ${d.pageStyle}.`);
    const known = new Set(STACK_CAPABILITIES.map((c) => c.key));
    for (const p of d.permissionsRequested) {
      if (!known.has(p.capability)) issues.push(`Unknown capability: ${p.capability}`);
    }
    return { ok: issues.length === 0, issues };
  };

  const validation = useMemo(() => validateDraftOf(draft), [draft]);

  const seedFiles = async (id: number, d: StackStudioDraft) => {
    // Best-effort: a failed seed never fails the install, the Files tab
    // surfaces the workdir so the admin can finish by hand.
    const jobs: Array<{ path: string; content: string }> = [];
    if (d.pageStyle === 'spa' && d.frontendHtml.trim()) {
      jobs.push({ path: 'frontend/dist/index.html', content: d.frontendHtml });
    }
    if (d.themeMode === 'custom' && d.frontendCss.trim()) {
      jobs.push({ path: 'frontend/theme.css', content: d.frontendCss });
    }
    if (d.pageStyle === 'simple' && d.simplePage.trim()) {
      jobs.push({ path: 'frontend/pages/overview.md', content: d.simplePage });
      jobs.push({
        path: 'frontend/pages/pages.json',
        content: JSON.stringify([{ slug: 'overview', title: 'Overview', file: 'overview.md' }], null, 2),
      });
    }
    if (d.backendScript.trim() && d.runtime !== 'static') {
      const entry = d.entrypoint.trim() || (d.runtime === 'python' ? 'backend/app.py' : 'backend/server.js');
      jobs.push({ path: entry, content: d.backendScript });
    }
    if (d.spec && Object.keys(d.spec).length) {
      jobs.push({ path: 'spec.json', content: JSON.stringify(d.spec, null, 2) });
    }
    for (const j of jobs) {
      try {
        await writeStackFile(id, j.path, j.content);
      } catch {
        /* best-effort */
      }
    }
  };

  const install = useCallback(async () => {
    setInstalling(true);
    setInstallError('');
    setInstallOk('');
    setRawError('');
    let effectiveDraft = draft;
    if (rawDraft !== null) {
      try {
        effectiveDraft = parseRawToDraft(rawDraft);
        setDraft(effectiveDraft);
        setRawDraft(null);
      } catch (e: any) {
        setRawError('invalid JSON: ' + (e?.message || String(e)));
        setInstallError('Cannot install: the Raw JSON buffer has invalid JSON.');
        setTab('raw');
        setInstalling(false);
        return;
      }
    }
    try {
      const manifest = emitStackStudioManifest(effectiveDraft);
      if (!manifest.name || !manifest.slug) {
        setInstallError('Name and slug are required (edit them in the Meta tab).');
        setTab('meta');
        setShowIssues(true);
        return;
      }
      const v = validateDraftOf(effectiveDraft);
      if (!v.ok) {
        setInstallError(`Cannot install: ${v.issues.length} validation issue(s).`);
        setShowIssues(true);
        return;
      }
      const stack = await createStackFromManifest(manifest, 'studio');
      await seedFiles(stack.id, effectiveDraft);
      setInstalledId(stack.id);
      setInstalledSlug(stack.slug);
      setInstallOk(`Stack "${stack.name}" installed (inactive) — approve its capabilities on the Stacks page, or keep editing files below.`);
      setTab('files');
    } catch (e: any) {
      setInstallError(extractStackApiError(e, 'Install failed'));
    } finally {
      setInstalling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, rawDraft]);

  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const onUrlInstall = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlBusy(true);
    setUrlError('');
    try {
      const stack = await installStackFromUrl(urlInput.trim());
      setInstalledId(stack.id);
      setInstalledSlug(stack.slug);
      setInstallOk('Installed stack from URL — approve its capabilities on the Stacks page.');
      setTab('files');
    } catch (e: any) {
      setUrlError(extractStackApiError(e, 'Install failed'));
    } finally {
      setUrlBusy(false);
    }
  }, [urlInput]);

  const reset = useCallback(async () => {
    if (!(await confirm({ title: 'Reset draft', message: 'Discard the current draft and start over?', tone: 'warning', confirmLabel: 'Discard' }))) return;
    setDraft(blankStackStudioDraft());
    setTab('meta');
    setInstallError('');
    setInstallOk('');
    setRawError('');
    setInstalledId(null);
    setInstalledSlug('');
  }, [confirm]);

  const togglePerm = (cap: string) => {
    const has = draft.permissionsRequested.some((p) => p.capability === cap);
    if (has) {
      patch({ permissionsRequested: draft.permissionsRequested.filter((p) => p.capability !== cap) });
    } else {
      patch({ permissionsRequested: [...draft.permissionsRequested, { capability: cap, access_level: '' }] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">Stack Studio</h2>
          <p className="text-sm text-gray-400 -mt-0.5 max-w-2xl">
            Visually author a stack (full-stack isolated app) and install it in one step — meta, theme,
            pages, permissions, backend script and files. The Studio emits a manifest the backend validates
            like an uploaded <code className="text-gray-300">.ksps</code>; capabilities still need approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/stacks')}
            className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10"
          >
            ← Back to Stacks
          </button>
        </div>
      </div>

      <GlassCard variant="form" className="flex items-center gap-2 flex-wrap">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Install an existing stack from a URL (https://…/stack.ksps)"
          className="flex-1 min-w-48 bg-black/30 border border-white/10 rounded-md text-sm text-white placeholder-gray-500 px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
        />
        <button
          type="button"
          disabled={urlBusy || !urlInput.trim()}
          onClick={() => void onUrlInstall()}
          className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50"
        >
          {urlBusy ? 'Installing…' : 'Install from URL'}
        </button>
        {urlError && <p className="text-red-400 text-xs w-full">{urlError}</p>}
      </GlassCard>

      {installOk && (
        <GlassCard className="text-emerald-300 text-sm border border-emerald-700/40 bg-emerald-900/20">
          {installOk}
          {installedId != null && (
            <span className="ml-2">
              <button type="button" onClick={() => navigate(`/stack/${installedId}`)} className="underline underline-offset-2">Open detail →</button>
            </span>
          )}
        </GlassCard>
      )}
      {installError && (
        <GlassCard className="text-red-300 text-sm border border-red-700/40 bg-red-900/20">
          {installError}
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_minmax(0,1fr)] gap-4">
        <GlassCard className="lg:sticky lg:top-4 self-start">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`ks-tab shrink-0 flex items-center gap-2 transition text-left ${tab === t.key ? 'ks-tab-active' : ''}`}
              >
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
                  placeholder="My Dashboard"
                />
                <TextField
                  label="Slug"
                  value={draft.slug}
                  onChange={(v) => patch({ slug: slugify(v) })}
                  placeholder="my-dashboard"
                  mono
                  hint="URL-safe id; lowercases + hyphenates."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Version" value={draft.version} onChange={(v) => patch({ version: v })} placeholder="1.0.0" mono />
                <label className="block">
                  <span className="text-xs text-gray-400">Category</span>
                  <select
                    value={draft.category}
                    onChange={(e) => patch({ category: e.target.value })}
                    className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
                  >
                    {STACK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <TextArea label="Description" value={draft.description} onChange={(v) => patch({ description: v })} rows={3} />
              <div>
                <span className="block text-xs text-gray-400 mb-1">Icon & colour (card theme)</span>
                <IconColorPicker icon={draft.icon} color={draft.color} onIconChange={(v) => patch({ icon: v })} onColorChange={(v) => patch({ color: v })} previewName={draft.name} />
              </div>
            </>
          )}

          {tab === 'theme' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-400">Theme mode</span>
                  <select
                    value={draft.themeMode}
                    onChange={(e) => patch({ themeMode: e.target.value as any })}
                    className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
                  >
                    {STACK_THEME_MODES.map((m) => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400">Page style</span>
                  <select
                    value={draft.pageStyle}
                    onChange={(e) => patch({ pageStyle: e.target.value as any })}
                    className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
                  >
                    {STACK_PAGE_STYLES.map((m) => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
                  </select>
                </label>
              </div>
              <TextArea
                label="Custom theme.css (used when theme mode = custom → frontend/theme.css)"
                value={draft.frontendCss}
                onChange={(v) => patch({ frontendCss: v })}
                rows={10}
                mono
                placeholder=":root {\n  --ks-accent: #38bdf8;\n}"
              />
            </>
          )}

          {tab === 'pages' && (
            <>
              {draft.pageStyle === 'spa' ? (
                <TextArea
                  label="SPA index.html (seeded to frontend/dist/index.html on install)"
                  value={draft.frontendHtml}
                  onChange={(v) => patch({ frontendHtml: v })}
                  rows={18}
                  mono
                  placeholder="<!doctype html><html><body><h1>My stack</h1><script src=&quot;/api/stacks/v1/ks-stack-sdk.js&quot;></script></body></html>"
                />
              ) : (
                <TextArea
                  label="Simple page markdown (seeded to frontend/pages/overview.md on install)"
                  value={draft.simplePage}
                  onChange={(v) => patch({ simplePage: v })}
                  rows={18}
                  mono
                />
              )}
            </>
          )}

          {tab === 'permissions' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                Requested capabilities seed pending grant rows — the admin approves them before activation, exactly like an uploaded .ksps.
              </p>
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
          )}

          {tab === 'backend' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-400">Runtime</span>
                  <select
                    value={draft.runtime}
                    onChange={(e) => patch({ runtime: e.target.value })}
                    className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40"
                  >
                    {STACK_RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <TextField
                  label="Entrypoint"
                  value={draft.entrypoint}
                  onChange={(v) => patch({ entrypoint: v })}
                  placeholder={draft.runtime === 'python' ? 'backend/app.py' : 'backend/server.js'}
                  mono
                  hint="Empty = static stack (no sidecar)."
                />
              </div>
              <TextArea
                label="Backend script (seeded to the entrypoint on install when runtime ≠ static)"
                value={draft.backendScript}
                onChange={(v) => patch({ backendScript: v })}
                rows={14}
                mono
                placeholder={draft.runtime === 'python' ? 'print("hello from stack")' : 'console.log("hello from stack");'}
              />
            </>
          )}

          {tab === 'spec' && (
            <TextArea
              label="Spec (JSON, stored verbatim)"
              value={JSON.stringify(draft.spec ?? {}, null, 2)}
              onChange={(v) => {
                try {
                  const parsed = JSON.parse(v || '{}');
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) patch({ spec: parsed });
                } catch {
                  /* keep editing */
                }
              }}
              rows={16}
              mono
            />
          )}

          {tab === 'files' && (
            <>
              {installedId == null ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Install the stack first — the file manager edits the installed workdir. The Pages,
                    Theme and Backend tabs already hold the seed content that will be written on install
                    (SPA html → frontend/dist/index.html, css → frontend/theme.css, simple markdown →
                    frontend/pages/overview.md, script → entrypoint).
                  </p>
                  <button
                    type="button"
                    onClick={() => void install()}
                    disabled={installing}
                    className="px-3 py-1.5 rounded text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50"
                  >
                    {installing ? 'Installing…' : 'Install now to unlock files'}
                  </button>
                </div>
              ) : (
                <StackFileManager stackId={installedId} slug={installedSlug || draft.slug} />
              )}
            </>
          )}

          {tab === 'raw' && (
            <>
              <p className="text-xs text-gray-400">
                The whole manifest. On blur it parses back into the structured tabs.
              </p>
              <TextArea
                label="Manifest JSON"
                value={rawDraft !== null ? rawDraft : raw}
                onChange={(v) => setRawDraft(v)}
                onBlur={commitRaw}
                rows={24}
                mono
              />
              {rawError && <p className="text-red-400 text-xs">{rawError}</p>}
            </>
          )}
        </GlassCard>

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
            This is exactly what will be POSTed to <code className="text-gray-400">/api/stacks/</code> (X-KS-Source: studio).
          </p>
        </GlassCard>
      </div>

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
            onClick={() => void reset()}
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
          onClick={() => void install()}
          disabled={installing}
          className="ks-primary-btn px-4 py-2 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          {installing ? 'Installing…' : installedId == null ? 'Install stack' : 'Re-install as new stack'}
        </button>
      </GlassCard>
    </div>
  );
};

export default StackStudio;
