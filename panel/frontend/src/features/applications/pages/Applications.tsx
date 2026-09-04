import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import {
  listApplications,
  deleteApplication,
  uploadApplicationFile,
  installApplicationFromUrl,
  setApplicationGrants,
  activateApplication,
  deactivateApplication,
  createApplication,
  updateApplicationEnv,
  type GrantDecision,
  type ApplicationActivateConflict,
} from '@/features/applications/api/applications';
import { extractApiErrorMessage } from '@/features/mods/api/mods';
import {
  Application,
  ApplicationPermission,
  ApplicationPermissionReq,
  appCapabilityMeta,
  appCategoryMeta,
  appRuntimeMeta,
  ApplicationConfigField,
} from '@/features/applications/types/application';
import { useConfirm } from '@/shared/stores/confirmStore';
import ApplicationStudioTab from '@/features/applications/components/ApplicationStudioTab';
import ApplicationRunModal from '@/features/applications/components/ApplicationRunModal';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';

// Resolve the human-facing label for a capability code on a card chip / the
// approval checklist. Falls back to the raw code when unknown.
const capLabel = (capability: string): string =>
  appCapabilityMeta(capability)?.label || capability;

// Small chip dot for the inline icon.
const CapDot: React.FC<{ capability: string }> = ({ capability }) => {
  const meta = appCapabilityMeta(capability);
  return <span className={`w-2 h-2 rounded-full ${meta?.dot || 'bg-gray-500'}`} aria-hidden="true" />;
};

// Category chip.
const CatChip: React.FC<{ category: string }> = ({ category }) => {
  const meta = appCategoryMeta(category);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${meta.badge}`}
      title={meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

// Runtime chip.
const RuntimeChip: React.FC<{ runtime: string }> = ({ runtime }) => {
  const meta = appRuntimeMeta(runtime);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${meta.badge}`}
      title={meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

const Applications: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Filter dropdown state
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // upload modal — supports three tabs: file upload + URL install + Studio
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'file' | 'url' | 'studio'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadParsed, setUploadParsed] = useState<Record<string, any> | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  // URL install form state
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');

  // activate / grant modal
  const [grantApp, setGrantApp] = useState<Application | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [grantError, setGrantError] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // run modal — one-shot execution with target + env selection
  const [runApp, setRunApp] = useState<Application | null>(null);

  // studio form state (used by Studio tab in upload modal)
  const [studioTab, setStudioTab] = useState<'general' | 'permission' | 'configure' | 'script'>('general');
  const [studioForm, setStudioForm] = useState({
    general: {
      name: '',
      note: '',
      version: '1.0.0',
      runtime: 'nodejs',
      mainFile: '',
      command: '',
      icon: '',
      color: '',
    },
    permission: [] as {capability: string; access_level: string; granted: boolean}[],
    configure: {} as Record<string, string>,
    script: {
      files: [] as {path: string; content: string}[],
    },
  });

  const handleStudioSave = async () => {
    const { general, permission, configure, script } = studioForm;
    // Report through uploadError (rendered inside the modal) — the page-level
    // error banner is hidden behind the open modal and would never be seen.
    if (!general.name.trim()) { setUploadError('Name is required.'); return; }
    if (general.color && !/^#[0-9a-fA-F]{6}$/.test(general.color.trim())) { setUploadError('Colour must be a #rrggbb hex value (or empty).'); return; }
    const mainFile = general.mainFile.trim() ||
      (general.runtime !== 'custom' && script.files.length > 0 ? script.files[0].path : '');
    const entrypoint = general.runtime === 'custom' ? general.command.trim() : mainFile;
    try {
      const newApp = await createApplication({
        name: general.name,
        slug: general.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        category: 'custom',
        version: general.version,
        description: general.note,
        icon: general.icon.trim(),
        color: general.color.trim().toUpperCase(),
        runtime: general.runtime,
        entrypoint,
        config_schema: [],
        files: script.files.filter((f) => f.path.trim() && f.content !== undefined),
        permissionsRequested: permission.map(p => ({ capability: p.capability, access_level: p.access_level })),
      });
      // 2. Update env if any
      if (Object.keys(configure).length > 0) {
        await updateApplicationEnv(newApp.id, configure);
      }
      // 3. Refresh list
      await load();
      setUploadOpen(false);
      setStudioTab('general');
      // Reset form
      setStudioForm({
        general: { name: '', note: '', version: '1.0.0', runtime: 'nodejs', mainFile: '', command: '', icon: '', color: '' },
        permission: [],
        configure: {},
        script: { files: [] },
      });
    } catch (e: any) {
      setUploadError(e?.response?.data || 'Failed to save application');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setApps(await listApplications());
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close filter dropdown when clicking outside
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

  // ---- upload flow ---------------------------------------------------------
  const onPickUpload = (file: File) => {
    setUploadFile(file);
    setUploadError('');
    file.text().then((txt) => {
      let parsed: Record<string, any> | null = null;
      try { parsed = JSON.parse(txt) as Record<string, any>; } catch { /* */ }
      if (!parsed) {
        setUploadParsed(null);
        setUploadError('File is not valid JSON. An application manifest must be JSON.');
        return;
      }
      setUploadParsed(parsed);
    }).catch(() => {
      setUploadParsed(null);
      setUploadError('Could not read file.');
    });
  };

  const doUpload = async () => {
    if (!uploadFile) { setUploadError('Choose an application manifest file first.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      await uploadApplicationFile(uploadFile);
      setUploadOpen(false);
      setUploadFile(null);
      setUploadParsed(null);
      await load();
    } catch (e: any) {
      setUploadError(e?.response?.data || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const doUrlInstall = async () => {
    if (!urlInput.trim()) { setUrlError('Enter a manifest URL.'); return; }
    setUrlBusy(true);
    setUrlError('');
    try {
      await installApplicationFromUrl(urlInput.trim());
      setUploadOpen(false);
      setUrlInput('');
      await load();
    } catch (e: any) {
      setUrlError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setUrlBusy(false);
    }
  };

  const openUpload = () => {
    setUploadOpen(true);
    setUploadTab('file');
    setUploadFile(null);
    setUploadParsed(null);
    setUploadError('');
    setUrlInput('');
    setUrlError('');
  };

  // ---- edit flow -----------------------------------------------------------
  const openEdit = (a: Application) => {
    navigate(`/applications/${a.id}/edit`);
  };

  // ---- configure flow -----------------------------------------------------
  const openConfigure = (a: Application) => {
    navigate(`/applications/${a.id}/configure`);
  };

  // ---- activate / grant flow ----------------------------------------------
  const openGrant = (a: Application) => {
    setGrantApp(a);
    const init: Record<string, boolean> = {};
    for (const p of a.permission_rows) init[p.capability] = p.granted;
    setGrants(init);
    setGrantError('');
  };

  const saveGrants = async (): Promise<boolean> => {
    if (!grantApp) return false;
    setGrantBusy(true);
    setGrantError('');
    try {
      const decisions: GrantDecision[] = grantApp.permission_rows.map((p) => ({
        capability: p.capability,
        granted: !!grants[p.capability],
      }));
      await setApplicationGrants(grantApp.id, decisions);
      const fresh = await listApplications();
      setApps(fresh);
      const updated = fresh.find((a) => a.id === grantApp.id);
      if (updated) setGrantApp(updated);
      return true;
    } catch (e: any) {
      setGrantError(e?.response?.data || 'Failed to save permissions');
      return false;
    } finally {
      setGrantBusy(false);
    }
  };

  const approveAll = () => {
    if (!grantApp) return;
    const next: Record<string, boolean> = {};
    for (const p of grantApp.permission_rows) next[p.capability] = true;
    setGrants(next);
  };

  const saveAndActivate = async () => {
    const ok = await saveGrants();
    if (!ok || !grantApp) return;
    setGrantBusy(true);
    try {
      const result: ApplicationActivateConflict | void = await activateApplication(grantApp.id);
      if (result && (result as ApplicationActivateConflict).pending) {
        const refusal = result as ApplicationActivateConflict;
        await load();
        const upd = (await listApplications()).find((a) => a.id === grantApp.id);
        if (upd) {
          setGrantApp(upd);
          const init: Record<string, boolean> = {};
          for (const p of upd.permission_rows) init[p.capability] = p.granted;
          setGrants(init);
        }
        setGrantError(refusal.message || 'This application still needs all requested permissions approved before it can be activated.');
      } else {
        setGrantApp(null);
        await load();
      }
    } catch (e: any) {
      setGrantError(e?.response?.data || 'Failed to activate');
    } finally {
      setGrantBusy(false);
    }
  };

  const stop = async (a: Application) => {
    if (!(await confirm({ title: 'Deactivate application', message: `Deactivate application "${a.name}"? It stops being available for new installs but existing installations keep running.`, tone: 'warning', confirmLabel: 'Deactivate' }))) return;
    try { await deactivateApplication(a.id); await load(); }
    catch (e: any) { alert(e?.response?.data || 'Failed to deactivate'); }
  };

  const start = (a: Application) => {
    if (a.pending > 0) { openGrant(a); return; }
    (async () => {
      try {
        const result: ApplicationActivateConflict | void = await activateApplication(a.id);
        await load();
        if (result && (result as ApplicationActivateConflict).pending) openGrant(a);
      } catch {
        openGrant(a);
      }
    })();
  };

  const remove = async (a: Application) => {
    if (!(await confirm({ title: 'Delete application', message: `Delete application "${a.name}"? This removes it permanently and all its permission rows.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(a.id);
    try { await deleteApplication(a.id); await load(); }
    catch (e: any) { alert(e?.response?.data || 'Failed to delete'); }
    finally { setDeletingId(null); }
  };

  // ---- derived view -------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = apps;
    if (q) {
      out = out.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }
    if (activeFilter !== 'all') out = out.filter((a) => (activeFilter === 'active' ? a.active : !a.active));
    if (categoryFilter !== 'all') out = out.filter((a) => a.category === categoryFilter);
    return out;
  }, [apps, search, activeFilter, categoryFilter]);

  const stats = useMemo(() => {
    const active = apps.filter((a) => a.active).length;
    const pending = apps.filter((a) => a.pending > 0).length;
    return { total: apps.length, active, inactive: apps.length - active, pending };
  }, [apps]);

  const categories = useMemo(() => {
    const cats = new Set(apps.map((a) => a.category));
    return Array.from(cats).sort();
  }, [apps]);

return (
    <div>
      {/* Fixed top-right pill — auto-hides with a right-to-left slide. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, slug, description…"
            ariaLabel="Search applications"
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
              {(activeFilter !== 'all' || categoryFilter !== 'all') && (
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
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full glass-field"
                      >
                        <option value="all">All categories</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{appCategoryMeta(c)?.label || c}</option>
                        ))}
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
            to="/applications/stats"
            aria-label="Application Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View application statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <Link
            to="/applications/schedules"
            aria-label="Application schedules"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Application run schedules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
          <button
            onClick={openUpload}
            aria-label="Install Application"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Upload Application"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
          </button>
      </PageActionsPill>

      {!loading && error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40 mb-4">{error}</GlassCard>
      )}

      {loading && <SkeletonGrid count={6} />}

      {!loading && filtered.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-applications-grid">
          {filtered.map((a) => {
            return (
              <article key={a.id} id={`ks-application-${a.id}`} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <header className="flex items-start gap-3 min-w-0">
                  {a.icon ? (
                    <CardIconTile
                      icon={a.icon}
                      color={(a as any).color || ''}
                      fallback={<span className="text-xl">{appCategoryMeta(a.category)?.defaultIcon || '⚙️'}</span>}
                    />
                  ) : (
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-black/30 ${a.active ? 'border-emerald-700/60' : 'border-white/10'}`} style={(a as any).color ? { color: (a as any).color } : undefined} aria-hidden="true">
                      <span className="text-xl">{appCategoryMeta(a.category)?.defaultIcon || '⚙️'}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate leading-tight">{a.name}</h3>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{a.slug}{a.version ? ` · v${a.version}` : ''}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${a.active ? 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60' : 'bg-neutral-800 text-gray-300 border-neutral-700'}`}>
                    {a.active ? 'Active' : 'Inactive'}
                  </span>
                </header>

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-end gap-2">
                  <CardMenu
                    ariaLabel={`Actions for application ${a.name}`}
                    items={[
                      {
                        key: 'run', label: 'Run…', tone: 'default',
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        ),
                      },
                      {
                        key: 'edit', label: 'Edit info', tone: 'default',
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        ),
                      },
                      {
                        key: 'configure', label: 'Configure fields', tone: 'default',
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
                        ),
                      },
                      { key: 'toggle', label: a.active ? 'Deactivate' : 'Activate', tone: 'default', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>) },
                      {
                        key: 'delete', label: deletingId === a.id ? 'Deleting…' : 'Delete', tone: 'danger',
                        disabled: deletingId !== null,
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        ),
                      },
                    ]}
                    onSelect={(key) => {
                      if (key === 'run') setRunApp(a);
                      else if (key === 'edit') openEdit(a);
                      else if (key === 'configure') openConfigure(a);
                      else if (key === 'toggle') {
                        if (a.active) stop(a);
                        else start(a);
                      }
                      else if (key === 'delete') remove(a);
                    }}
                  />
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && apps.length > 0 && !error && (
        <GlassCard className="text-center text-gray-400">No applications match your filters.</GlassCard>
      )}
      {!loading && apps.length === 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">No applications in the catalog yet. Click “Upload Application” to add one.</div>
      )}

      {/* ---- Upload modal ---- */}
      <GlassModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Install Application"
        maxWidth="max-w-4xl"
        footer={
          uploadTab === 'file' ? (
            <>
              <button onClick={() => setUploadOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={doUpload} disabled={uploading || !uploadFile} className="ks-btn-form ks-btn-primary">
                {uploading ? 'Installing…' : 'Install'}
              </button>
            </>
          ) : uploadTab === 'url' ? (
            <>
              <button onClick={() => setUploadOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={doUrlInstall} disabled={urlBusy || !urlInput.trim()} className="ks-btn-form ks-btn-primary">
                {urlBusy ? 'Installing…' : 'Install from URL'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setUploadOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button className="ks-btn-form ks-btn-primary" onClick={handleStudioSave}>Save</button>
            </>
          )
        }
      >
        {/* Tab switcher */}
        <div className="flex gap-1 mb-3 bg-black/30 border border-white/10 rounded-md p-1">
          <button
            onClick={() => { setUploadTab('file'); setUploadError(''); }}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${uploadTab === 'file' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            Upload file
          </button>
          <button
            onClick={() => { setUploadTab('url'); setUploadError(''); }}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${uploadTab === 'url' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /> </svg>
            From URL
          </button>
          <button
            onClick={() => { setUploadTab('studio'); setUploadError(''); }}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${uploadTab === 'studio' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
            Studio
          </button>
        </div>

        {uploadTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose an application manifest file (<code className="text-gray-300">.ksapp</code> or{' '}
              <code className="text-gray-300">.json</code>). The panel parses it, validates the requested permissions,
              and installs the application <span className="text-amber-300">inactive</span> — you approve permissions before activating.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest file</span>
              <input
                type="file"
                accept=".json,.ksapp,application/json"
                onChange={(e) => { const f = e.target.files?.[0] || null; if (f) onPickUpload(f); }}
                className="block w-full mt-1 text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200"
              />
            </label>

            {uploadParsed && (
              <GlassCard className="text-xs">
                <p className="text-gray-300 font-medium">{uploadParsed.name || '(no name)'}</p>
                {uploadParsed.version && <p className="text-gray-500">version {uploadParsed.version}</p>}
                {uploadParsed.description && <p className="text-gray-400 mt-1">{String(uploadParsed.description)}</p>}
                {Array.isArray(uploadParsed.permissionsRequested) && (
                  <div className="mt-2">
                    <p className="text-gray-300 mb-1">This application requests <span className="text-amber-300">{uploadParsed.permissionsRequested.length}</span> permission(s):</p>
                    <ul className="space-y-1">
                      {uploadParsed.permissionsRequested.map((p: any, i: number) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <CapDot capability={p.capability} />
                          <span className="text-gray-200">{capLabel(p.capability)}{p.access_level ? ` · ${p.access_level}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!Array.isArray(uploadParsed.permissionsRequested) && (
                  <p className="text-emerald-300 mt-1">No permissions requested — safe to activate immediately.</p>
                )}
              </GlassCard>
            )}
            {uploadError && <p className="text-red-400 text-xs">{uploadError}</p>}
          </>
        )}

        {uploadTab === 'url' && (
          <>
            <p className="text-xs text-gray-400">
              Paste a manifest URL. The panel fetches it <span className="text-emerald-300">server-side</span>{' '}
              (SSRF-guarded — only public hosts, DNS-pinned, size + time capped), parses the body,
              and installs the application <span className="text-amber-300">inactive</span> through the same path as a file upload.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest URL</span>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/apps/my-bot.ksapp"
                className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </label>
            <p className="text-[11px] text-gray-500">
              The response must be valid JSON. The fetched URL is recorded on the application row so the audit timeline shows
              the install provenance.
            </p>
            {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
          </>
        )}

        {uploadTab === 'studio' && (
          <>
            <ApplicationStudioTab
              studioTab={studioTab}
              setStudioTab={setStudioTab}
              studioForm={studioForm}
              setStudioForm={setStudioForm}
            />
            {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}
          </>
        )}
      </GlassModal>

      {/* ---- Grant / Activate modal ---- */}
      <GlassModal
        open={!!grantApp}
        onClose={() => setGrantApp(null)}
        title={grantApp ? `Permissions — ${grantApp.name}` : 'Permissions'}
        maxWidth="max-w-xl"
        footer={
          <>
            <button onClick={() => setGrantApp(null)} className="ks-btn-cancel ks-btn-ghost">Close</button>
            {grantApp && grantApp.permission_rows.length > 0 && (
              <button onClick={approveAll} disabled={grantBusy} className="ks-btn-ghost ks-btn-sm">Approve all</button>
            )}
            <button onClick={saveGrants} disabled={grantBusy} className="ks-btn-form ks-btn-secondary">
              {grantBusy ? 'Saving…' : 'Save permissions'}
            </button>
            <button onClick={saveAndActivate} disabled={grantBusy} className="ks-btn-form ks-btn-primary">
              Save & Activate
            </button>
          </>
        }
      >
        {grantApp && grantApp.permission_rows.length === 0 && (
          <p className="text-sm text-gray-300">This application requested no permissions. You can activate it safely.</p>
        )}
        {grantApp && grantApp.permission_rows.length > 0 && (
          <>
            <p className="text-xs text-amber-300">
              This application needs {grantApp.permission_rows.length} permission(s) to fully work. Review each one below before approving — the application only activates once every requested permission is approved.
            </p>
            <div className="space-y-2">
              {grantApp.permission_rows.map((p) => {
                const meta = appCapabilityMeta(p.capability);
                const checked = !!grants[p.capability];
                return (
                  <label key={p.id} className="ks-card ks-form-card flex items-start gap-3 p-3 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setGrants((g) => ({ ...g, [p.capability]: e.target.checked }))}
                      className="mt-1 w-4 h-4 accent-emerald-500"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-white flex items-center gap-1.5">
                        <CapDot capability={p.capability} />
                        {meta ? meta.label : p.capability}
                        {p.access_level && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">{p.access_level}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{meta ? meta.description : 'This application requested this capability.'}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}
        {grantError && <p className="text-red-400 text-xs">{grantError}</p>}
      </GlassModal>

      {/* ---- Run modal (target + env + one-shot execution) ---- */}
      {runApp && (
        <ApplicationRunModal app={runApp} onClose={() => setRunApp(null)} />
      )}
    </div>
  );
};

export default Applications;