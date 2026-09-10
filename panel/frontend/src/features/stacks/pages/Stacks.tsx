import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import ErrorState from '@/shared/components/ui/ErrorState';
import GlassModal from '@/shared/components/ui/Modal';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import {
  listStacks,
  uploadStackPackage,
  installStackFromUrl,
  extractStackApiError,
  getStackEngine,
  setStackEngine,
} from '@/features/stacks/api/stacks';
import {
  Stack,
  stackCapabilityMeta,
  stackSourceMeta,
  type StackEngineStatus,
} from '@/shared/types/stack';
import { useConfirm } from '@/shared/stores/confirmStore';
import { formatCardDate } from '@/shared/utils/cardDate';

const capLabel = (capability: string): string =>
  stackCapabilityMeta(capability)?.label || capability;

const CapDot: React.FC<{ capability: string }> = ({ capability }) => {
  const meta = stackCapabilityMeta(capability);
  return <span className={`w-2 h-2 rounded-full ${meta?.dot || 'bg-gray-500'}`} aria-hidden="true" />;
};

const THEME_BADGE: Record<string, string> = {
  panel: 'bg-sky-900/40 text-sky-200 border-sky-700/50',
  custom: 'bg-violet-900/40 text-violet-200 border-violet-700/50',
  none: 'bg-neutral-800 text-gray-300 border-neutral-700',
};

const PAGE_BADGE: Record<string, string> = {
  spa: 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50',
  simple: 'bg-amber-900/40 text-amber-200 border-amber-700/50',
};

const Stacks: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [themeFilter, setThemeFilter] = useState<'all' | 'panel' | 'custom' | 'none'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'file' | 'url' | 'create'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState('');

  const [engine, setEngineState] = useState<StackEngineStatus | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, eng] = await Promise.all([
        listStacks(),
        getStackEngine().catch(() => null),
      ]);
      setStacks(list);
      setEngineState(eng);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stacks.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = stacks;
    if (q) {
      out = out.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q),
      );
    }
    if (activeFilter !== 'all') out = out.filter((s) => (activeFilter === 'active' ? s.active : !s.active));
    if (themeFilter !== 'all') out = out.filter((s) => s.theme_mode === themeFilter);
    if (categoryFilter !== 'all') out = out.filter((s) => s.category === categoryFilter);
    return out;
  }, [stacks, search, activeFilter, themeFilter, categoryFilter]);

  const stats = useMemo(() => {
    const active = stacks.filter((s) => s.active).length;
    const pending = stacks.filter((s) => s.pending > 0).length;
    return { total: stacks.length, active, inactive: stacks.length - active, pending };
  }, [stacks]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of stacks) if (s.category) set.add(s.category);
    return [...set].sort();
  }, [stacks]);

  const openInstall = () => {
    setInstallOpen(true);
    setInstallTab('file');
    setUploadFile(null);
    setUrlInput('');
    setInstallError('');
  };

  const doInstall = async () => {
    setInstallBusy(true);
    setInstallError('');
    try {
      if (installTab === 'file') {
        if (!uploadFile) throw new Error('Pick a .ksps file first.');
        await uploadStackPackage(uploadFile);
      } else if (installTab === 'url') {
        if (!urlInput.trim()) throw new Error('Enter a URL first.');
        await installStackFromUrl(urlInput.trim());
      } else if (installTab === 'create') {
        setInstallOpen(false);
        navigate('/stacks/new');
        return;
      }
      setInstallOpen(false);
      setUploadFile(null);
      setUrlInput('');
      await load();
    } catch (e: any) {
      setInstallError(extractStackApiError(e, 'Install failed.'));
    } finally {
      setInstallBusy(false);
    }
  };

  const toggleEngine = async () => {
    if (!engine) return;
    const next = !engine.enabled;
    if (!next && !(await confirm({ title: 'Disable stacks engine', message: 'Disable stacks? Every active stack stops rendering immediately. Stacks stay installed and re-activate explicitly once re-enabled.', tone: 'warning', confirmLabel: 'Disable' }))) return;
    setEngineBusy(true);
    try {
      await setStackEngine(next);
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Engine toggle failed.'));
    } finally {
      setEngineBusy(false);
    }
  };

  return (
    <div>
      {/* Fixed top-right pill — mirrors Mods/Templates: search + filter + stats + schedules + engine + install. */}
      <PageActionsPill>
        <SearchDropdown
          value={search}
          onChange={setSearch}
          placeholder="Search name, slug, description…"
          ariaLabel="Search stacks"
          buttonClassName="ks-tab inline-flex items-center justify-center"
          buttonStyle={PILL_TAB_STYLE}
        />
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
            style={PILL_TAB_STYLE}
            aria-label="Open filters"
            aria-expanded={filterOpen}
            aria-haspopup="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilter !== 'all' && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-64">
              <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">State</label>
                    <select
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value as any)}
                      className="w-full glass-field"
                    >
                      <option value="all">All states</option>
                      <option value="active">Active only</option>
                      <option value="inactive">Inactive only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Theme</label>
                    <select
                      value={themeFilter}
                      onChange={(e) => setThemeFilter(e.target.value as any)}
                      className="w-full glass-field"
                    >
                      <option value="all">All themes</option>
                      <option value="panel">Panel theme</option>
                      <option value="custom">Custom theme.css</option>
                      <option value="none">Unthemed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full glass-field"
                    >
                      <option value="all">All categories</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setFilterOpen(false); }}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <Link
          to="/stacks/stats"
          aria-label="Stack Statistics"
          className="ks-tab inline-flex items-center justify-center"
          style={PILL_TAB_STYLE}
          title="View stack statistics dashboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        </Link>
        <Link
          to="/stacks/schedules"
          aria-label="Stack schedules"
          className="ks-tab inline-flex items-center justify-center"
          style={PILL_TAB_STYLE}
          title="Stack schedules"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </Link>
        {engine && (
          <button
            onClick={() => void toggleEngine()}
            disabled={engineBusy}
            aria-label={engine.enabled ? 'Disable stacks engine' : 'Enable stacks engine'}
            aria-pressed={!engine.enabled}
            className="ks-tab inline-flex items-center justify-center gap-1"
            style={PILL_TAB_STYLE}
            title={engine.enabled ? 'Stacks engine running — click to disable (kill switch)' : 'Stacks engine DISABLED — click to re-enable'}
          >
            {engine.enabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            )}
            {!engine.enabled && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
          </button>
        )}
        <button
          onClick={openInstall}
          aria-label="Install Stack"
          className="ks-tab ks-tab-active inline-flex items-center justify-center"
          style={PILL_TAB_STYLE}
          title="Install Stack"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </PageActionsPill>

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{filtered.length} of {stacks.length} shown · {stats.active} active · {stats.pending} pending grants</p>
      </div>

      {error && stacks.length > 0 && <p className="text-xs text-red-300 mb-2">{error}</p>}
      {!loading && error && stacks.length === 0 && (
        <ErrorState
          variant="error"
          title="Failed to load stacks"
          description={error}
          retryLabel="Retry"
          onRetry={() => void load()}
        />
      )}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 && stacks.length > 0 ? (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">No stacks match your filters.</div>
      ) : stacks.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-20 h-20 text-gray-400"
              aria-hidden="true"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No stacks yet</p>
            <p className="text-sm text-gray-500">Install a <code className="font-mono">.ksps</code> package, paste a manifest, or create one from scratch.</p>
          </div>
        </div>
      ) : (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-stacks-grid">
          {filtered.map((s) => {
            const src = stackSourceMeta(s.source);
            const approved = s.permissions.filter((p) => p.granted).length;
            const allSet = s.pending === 0;
            return (
              <article key={s.id} id={`ks-stack-${s.id}`} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <header className="flex items-start gap-3 min-w-0">
                  <CardIconTile
                    icon={s.icon || ''}
                    color={s.color || ''}
                    fallback={<span aria-hidden="true" className="text-lg">📦</span>}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate leading-tight">
                      <Link to={`/stack/${s.id}`} className="hover:text-sky-300">{s.name}</Link>
                    </h3>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{s.slug}{s.version ? ` · v${s.version}` : ''}{s.category ? ` · ${s.category}` : ''}</p>
                    {s.description && <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{s.description}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${THEME_BADGE[s.theme_mode] || THEME_BADGE.panel}`} title="panel = inherits panel theme, custom = own theme.css, none = unthemed">
                        theme: {s.theme_mode}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${PAGE_BADGE[s.page_style] || PAGE_BADGE.spa}`} title="spa = full bundle in iframe, simple = panel-rendered pages">
                        {s.page_style}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border border-white/10 bg-white/5 text-gray-300 font-mono" title={s.entrypoint || s.runtime}>
                        {s.runtime}
                      </span>
                      {src && src.key !== 'file' && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${src.badge}`} title={s.source_url || src.label}>
                          {src.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${s.active ? 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60' : 'bg-neutral-800 text-gray-300 border-neutral-700'}`}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </header>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  {s.permissions.length === 0 ? (
                    <span className="text-[11px] text-gray-500 italic">No permissions requested — safe to activate.</span>
                  ) : (
                    s.permissions.map((p) => {
                      const meta = stackCapabilityMeta(p.capability);
                      return (
                        <span
                          key={p.id}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${p.granted ? 'border-emerald-700/30 bg-emerald-900/20 text-emerald-300' : 'border-amber-700/40 bg-amber-900/20 text-amber-300'}`}
                          title={meta ? `${meta.label} (${p.access_level})` : `${p.capability} (${p.access_level})`}
                        >
                          <CapDot capability={p.capability} />
                          {capLabel(p.capability)}{p.access_level ? ` · ${p.access_level}` : ''}
                        </span>
                      );
                    })
                  )}
                </div>

                {s.permissions.length > 0 && (
                  <p className={`text-[11px] ${allSet ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {approved}/{s.permissions.length} permissions approved{allSet ? ' — ready to activate' : ` · ${s.pending} pending`}.
                  </p>
                )}

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-gray-500 truncate">
                    {(() => {
                      const label = formatCardDate(s.created_at);
                      return label ? <>Uploaded {label}</> : <>id {s.id}</>;
                    })()}
                  </span>
                  <button
                    onClick={() => navigate(`/stack/${s.id}`)}
                    className="text-[11px] text-gray-400 hover:text-white transition-colors shrink-0"
                  >
                    View details →
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ---- Install stack modal ---- */}
      <GlassModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install Stack"
        maxWidth="max-w-lg"
        footer={
          installTab === 'create' ? (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={() => { setInstallOpen(false); navigate('/stacks/new'); }} className="ks-btn-form ks-btn-primary">
                Create Stack
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={() => void doInstall()} disabled={installBusy} className="ks-btn-form ks-btn-primary">
                {installBusy ? 'Installing…' : 'Install (inactive)'}
              </button>
            </>
          )
        }
      >
        <div className="flex gap-1 mb-3 bg-black/30 border border-white/10 rounded-md p-1">
          {(['file', 'url', 'create'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setInstallTab(t)}
              className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === t ? 'ks-tab-active' : ''}`}
            >
              {t === 'file' ? '.ksps file' : t === 'url' ? 'From URL' : 'Create'}
            </button>
          ))}
        </div>

        {installTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose a stack package (<code className="text-gray-300">.ksps</code> — a zip bundling the
              manifest with its frontend pages/bundle, theme.css and backend entry). The panel installs it{' '}
              <span className="text-amber-300">inactive</span> — you approve capabilities before activating.
            </p>
            <input type="file" accept=".ksps,.zip" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="block w-full mt-2 text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200" />
          </>
        )}

        {installTab === 'url' && (
          <>
            <p className="text-xs text-gray-400">
              Paste a <code className="text-gray-300">.ksps</code> or manifest URL. The panel fetches it{' '}
              <span className="text-emerald-300">server-side</span> and installs it{' '}
              <span className="text-amber-300">inactive</span>.
            </p>
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com/my-stack.ksps" className="block w-full mt-2 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40" />
          </>
        )}

        {installTab === 'create' && (
          <>
            <p className="text-xs text-gray-400">
              Create a new stack from scratch using the visual form.
            </p>
            <GlassCard className="space-y-3 text-center py-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-gray-400">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <h4 className="text-white font-medium">Create Stack</h4>
              <p className="text-gray-400 text-sm">Build a stack visually — define meta, theme, frontend, backend script and spec. The app itself declares what it needs when it announces; you allow it in the detail page.</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Features:</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Meta</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Theme</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Frontend</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Backend</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Spec</span>
              </div>
            </GlassCard>
          </>
        )}

        {installError && <p className="text-xs text-red-300 mt-2">{installError}</p>}
      </GlassModal>

    </div>
  );
};

export default Stacks;
