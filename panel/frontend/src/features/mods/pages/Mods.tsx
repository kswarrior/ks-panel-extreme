import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import {
  listMods,
  deleteMod,
  uploadModPackage,
  downloadMod,
  updateMod,
  activateMod,
  deactivateMod,
  setModGrants,
  installModFromUrl,
  createModFromStudio,
  extractApiErrorMessage,
  getEngineStatus,
  setEngineEnabled,
  listSampleMods,
  installSampleMod,
  getModLogs,
  type GrantDecision,
} from '@/features/mods/api/mods';
import {
  Mod,
  ModPermission,
  ModActivateConflict,
  ModEngineDiagnostics,
  ModSample,
  ModLogEntry,
  modCapabilityMeta,
  modSourceMeta,
} from '@/shared/types/mod';
import { useConfirm } from '@/shared/stores/confirmStore';

// resolve the human-facing label for a capability code on a card chip / the
// approval checklist. Falls back to the raw code when the manifest shipped an
// unknown one (which the backend rejects at upload, but be defensive).
const capLabel = (capability: string): string =>
  modCapabilityMeta(capability)?.label || capability;

// small chip dot for the inline icon
const CapDot: React.FC<{ capability: string }> = ({ capability }) => {
  const meta = modCapabilityMeta(capability);
  return <span className={`w-2 h-2 rounded-full ${meta?.dot || 'bg-gray-500'}`} aria-hidden="true" />;
};

const Mods: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Filter dropdown state
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // upload modal — supports four tabs: file upload + URL install + Studio + samples
  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'file' | 'url' | 'studio' | 'samples'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  // URL install form state
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  // Built-in samples tab state
  const [samples, setSamples] = useState<ModSample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samplesError, setSamplesError] = useState('');
  const [installingKey, setInstallingKey] = useState<string | null>(null);

  // Engine kill-switch state (null = unknown / failed to load)
  const [engine, setEngine] = useState<ModEngineDiagnostics | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);

  // edit modal
  const [editName, setEditName] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // activate / grant modal
  const [grantMod, setGrantMod] = useState<Mod | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [grantError, setGrantError] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMods(await listMods());
    } catch (e: any) {
      setError(extractApiErrorMessage(e, 'Failed to load mods'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Engine diagnostics (kill switch + runtime mode). Non-fatal on failure:
  // the page stays usable, the toggle just hides while state is unknown.
  useEffect(() => {
    let cancelled = false;
    getEngineStatus()
      .then((d) => { if (!cancelled) setEngine(d); })
      .catch(() => { if (!cancelled) setEngine(null); });
    return () => { cancelled = true; };
  }, []);

  const toggleEngine = async () => {
    if (!engine) return;
    const next = !engine.enabled;
    if (!next && !(await confirm({ title: 'Disable mod engine', message: 'Disable the mod engine? Every running mod runtime stops immediately. Mods stay installed and re-activate explicitly once the engine is re-enabled.', tone: 'warning', confirmLabel: 'Disable' }))) return;
    setEngineBusy(true);
    try {
      await setEngineEnabled(next);
      setEngine({ ...engine, enabled: next });
      await load();
    } catch (e: any) {
      alert(extractApiErrorMessage(e, 'Failed to update engine state'));
    } finally {
      setEngineBusy(false);
    }
  };

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
  // Packages are .kspm zip archives (manifest.json + bundled frontend/backend/
  // page assets). We can't parse the manifest client-side without a zip lib,
  // so the selected file is just stored; the server parses + validates the
  // manifest inside the zip and returns the resulting mod for the card list.
  const onPickUpload = (file: File) => {
    setUploadFile(file);
    setUploadError('');
    // Light sanity check: the user picked a file with a zip-ish extension /
    // type. The server does the real zip-header + manifest validation.
    const nameOk = /\.(kspm|ksmp|zip)$/i.test(file.name);
    const typeOk = file.type === '' || /zip/i.test(file.type);
    if (!nameOk && !typeOk) {
      setUploadError('That does not look like a .kspm package (zip). The panel will still try to read it.');
    }
  };

  const doUpload = async () => {
    if (!uploadFile) { setUploadError('Choose a .kspm package file first.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      await uploadModPackage(uploadFile);
      setInstallOpen(false);
      setUploadFile(null);
      await load();
    } catch (e: any) {
      setUploadError(extractApiErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const doUrlInstall = async () => {
    if (!urlInput.trim()) { setUrlError('Enter a manifest URL.'); return; }
    setUrlBusy(true);
    setUrlError('');
    try {
      await installModFromUrl(urlInput.trim());
      setInstallOpen(false);
      setUrlInput('');
      await load();
    } catch (e: any) {
      setUrlError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setUrlBusy(false);
    }
  };

  const openInstall = () => {
    setInstallOpen(true);
    setInstallTab('file');
    setUploadFile(null);
    setUploadError('');
    setUrlInput('');
    setUrlError('');
  };

  // ---- built-in samples flow ----------------------------------------------
  const loadSamples = useCallback(async () => {
    setSamplesLoading(true);
    setSamplesError('');
    try {
      setSamples(await listSampleMods());
    } catch (e: any) {
      setSamplesError(extractApiErrorMessage(e, 'Failed to load samples'));
    } finally {
      setSamplesLoading(false);
    }
  }, []);

  const openSamplesTab = () => {
    setInstallTab('samples');
    if (samples.length === 0 && !samplesLoading) loadSamples();
  };

  const doInstallSample = async (key: string) => {
    setInstallingKey(key);
    setSamplesError('');
    try {
      await installSampleMod(key);
      setInstallOpen(false);
      await load();
    } catch (e: any) {
      setSamplesError(extractApiErrorMessage(e, 'Install failed'));
    } finally {
      setInstallingKey(null);
    }
  };

  // ---- per-mod log viewer --------------------------------------------------
  const [logsMod, setLogsMod] = useState<Mod | null>(null);
  const [logLines, setLogLines] = useState<ModLogEntry[] | null>(null);
  const [logsError, setLogsError] = useState('');

  const openLogs = async (m: Mod) => {
    setLogsMod(m);
    setLogLines(null);
    setLogsError('');
    try {
      const res = await getModLogs(m.id);
      setLogLines(res.logs || []);
    } catch (e: any) {
      setLogsError(extractApiErrorMessage(e, 'Failed to load logs'));
    }
  };

  // ---- edit flow -----------------------------------------------------------
  const openEdit = (m: Mod) => {
    setEditId(m.id);
    setEditName(m.name);
    setEditVersion(m.version);
    setEditDesc(m.description);
  };
  const saveEdit = async () => {
    if (editId == null) return;
    setEditSaving(true);
    try {
      await updateMod(editId, { name: editName, version: editVersion, description: editDesc });
      setEditId(null);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  // ---- activate / grant flow ----------------------------------------------
  const openGrant = (m: Mod) => {
    setGrantMod(m);
    const init: Record<string, boolean> = {};
    for (const p of m.permissions) init[p.capability] = p.granted;
    setGrants(init);
    setGrantError('');
  };

  // Save the per-capability decisions to the backend (without activating yet).
  const saveGrants = async (): Promise<boolean> => {
    if (!grantMod) return false;
    setGrantBusy(true);
    setGrantError('');
    try {
      const decisions: GrantDecision[] = grantMod.permissions.map((p) => ({
        capability: p.capability,
        granted: !!grants[p.capability],
      }));
      await setModGrants(grantMod.id, decisions);
      const fresh = await listMods();
      setMods(fresh);
      const updated = fresh.find((m) => m.id === grantMod.id);
      if (updated) setGrantMod(updated);
      return true;
    } catch (e: any) {
      setGrantError(extractApiErrorMessage(e, 'Failed to save permissions'));
      return false;
    } finally {
      setGrantBusy(false);
    }
  };

  const approveAll = () => {
    if (!grantMod) return;
    const next: Record<string, boolean> = {};
    for (const p of grantMod.permissions) next[p.capability] = true;
    setGrants(next);
  };

  // Save grants then attempt activation. activateMod resolves void on success
  // or the 409 refusal body while still-pending; drive the modal off that.
  const saveAndActivate = async () => {
    const ok = await saveGrants();
    if (!ok || !grantMod) return;
    setGrantBusy(true);
    try {
      const result: ModActivateConflict | void = await activateMod(grantMod.id);
      if (result && (result as ModActivateConflict).pending) {
        const refusal = result as ModActivateConflict;
        // One fetch: refresh the list and re-read the updated row from it.
        const fresh = await listMods();
        setMods(fresh);
        const upd = fresh.find((m) => m.id === grantMod.id);
        if (upd) {
          setGrantMod(upd);
          const init: Record<string, boolean> = {};
          for (const p of upd.permissions) init[p.capability] = p.granted;
          setGrants(init);
        }
        setGrantError(refusal.message || 'This mod still needs all requested permissions approved before it can be activated.');
      } else {
        setGrantMod(null);
        await load();
      }
    } catch (e: any) {
      setGrantError(extractApiErrorMessage(e, 'Failed to activate'));
    } finally {
      setGrantBusy(false);
    }
  };

  const stop = async (m: Mod) => {
    if (!(await confirm({ title: 'Deactivate mod', message: `Deactivate mod "${m.name}"? It stops running but stays installed.`, tone: 'warning', confirmLabel: 'Deactivate' }))) return;
    try { await deactivateMod(m.id); await load(); }
    catch (e: any) { alert(extractApiErrorMessage(e, 'Failed to deactivate')); }
  };

  const start = (m: Mod) => {
    // If there are pending permissions OR the mod isn't fully granted, jump
    // straight to the grant modal so the admin reviews before activating.
    if (m.pending > 0) { openGrant(m); return; }
    (async () => {
      try {
        const result: ModActivateConflict | void = await activateMod(m.id);
        await load();
        if (result && (result as ModActivateConflict).pending) openGrant(m);
      } catch {
        openGrant(m);
      }
    })();
  };

  const remove = async (m: Mod) => {
    if (!(await confirm({ title: 'Delete mod', message: `Delete mod "${m.name}"? This removes it permanently.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(m.id);
    try { await deleteMod(m.id); await load(); }
    catch (e: any) { alert(extractApiErrorMessage(e, 'Failed to delete')); }
    finally { setDeletingId(null); }
  };

  // Download the mod's .kspm package zip. The server streams the on-disk bundle
  // (or synthesises one from manifest+spec for Studio/URL/JSON mods); we hand the
  // blob to a transient <a download> so the browser saves it as <slug>.kspm.
  const downloadPkg = async (m: Mod) => {
    try {
      const blob = await downloadMod(m.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${m.slug}.kspm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(extractApiErrorMessage(e, 'Failed to download package'));
    }
  };

  // ---- derived view -------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = mods;
    if (q) {
      out = out.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      );
    }
    if (activeFilter !== 'all') out = out.filter((m) => (activeFilter === 'active' ? m.active : !m.active));
    return out;
  }, [mods, search, activeFilter]);

  const stats = useMemo(() => {
    const active = mods.filter((m) => m.active).length;
    const pending = mods.filter((m) => m.pending > 0).length;
    return { total: mods.length, active, inactive: mods.length - active, pending };
  }, [mods]);

return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Mods</h2>
        <div className="flex items-center gap-2">
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, slug, description…"
            ariaLabel="Search mods"
          />
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
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

            {/* Filter Dropdown Menu */}
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
            to="/mods/stats"
            aria-label="Mod Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View mod statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          {engine && (
            <button
              onClick={toggleEngine}
              disabled={engineBusy}
              aria-label={engine.enabled ? 'Disable mod engine' : 'Enable mod engine'}
              aria-pressed={!engine.enabled}
              className={`ks-btn-header ks-icon-btn ${!engine.enabled ? 'text-red-300' : ''}`}
              title={engine.enabled ? 'Mod engine running — click to disable (kill switch)' : 'Mod engine DISABLED — click to re-enable'}
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
            aria-label="Install Mod"
            className="ks-btn-header ks-icon-btn"
            title="Install Mod"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
</div>
      </div>

      {!loading && filtered.length > 0 && (
         <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-mods-grid">
           {filtered.map((m) => {
             const approved = m.permissions.filter((p) => p.granted).length;
             const allSet = m.pending === 0;
             return (
               <article key={m.id} id={`ks-mod-${m.id}`} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <header className="flex items-start gap-3 min-w-0">
                  <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-black/30 ${m.active ? 'border-emerald-700/60 text-emerald-300' : 'border-white/10 text-gray-300'}`} aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 2h6l2 4-3 2 3 2-2 4H9l-2-4 3-2-3-2z" /><path d="M12 14v8" /> </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate leading-tight">{m.name}</h3>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{m.slug}{m.version ? ` · v${m.version}` : ''}</p>
                    {m.description && <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{m.description}</p>}
                    {(() => {
                      const src = modSourceMeta(m.source || 'file');
                      if (!src || src.key === 'file') return null;
                      return (
                        <span
                          className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${src.badge}`}
                          title={m.source_url || src.label}
                        >
                          {src.label}
                          {m.source_url && (
                            <a
                              href={m.source_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] underline underline-offset-2 opacity-70 hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              source ↗
                            </a>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${m.active ? 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60' : 'bg-neutral-800 text-gray-300 border-neutral-700'}`}>
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </header>

                {/* Requested permissions summary */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {m.permissions.length === 0 ? (
                    <span className="text-[11px] text-gray-500 italic">No permissions requested — safe to activate.</span>
                  ) : (
                    m.permissions.map((p: ModPermission) => {
                      const meta = modCapabilityMeta(p.capability);
                      return (
                        <span
                          key={p.id}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${p.granted ? 'border-emerald-700/30 bg-emerald-900/20 text-emerald-300' : 'border-amber-700/40 bg-amber-900/20 text-amber-300'}`}
                          title={meta ? `${meta.label}${p.access_level ? ` (${p.access_level})` : ''}` : p.capability}
                        >
                          <CapDot capability={p.capability} />
                          {capLabel(p.capability)}{p.access_level ? ` · ${p.access_level}` : ''}
                        </span>
                      );
                    })
                  )}
                </div>

                {/* approval progress */}
                {m.permissions.length > 0 && (
                  <p className={`text-[11px] ${allSet ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {approved}/{m.permissions.length} permissions approved{allSet ? ' — ready to activate' : ` · ${m.pending} pending`}.
                  </p>
                )}

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 truncate">
                    {m.created_at ? <>Uploaded {new Date(m.created_at).toLocaleDateString()}</> : <>id {m.id}</>}
                  </span>
                  <div className="flex items-center gap-1">
                    {m.active ? (
                      <button onClick={() => stop(m)} className="ks-ghost-btn px-2 py-1 rounded text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10">Deactivate</button>
                    ) : (
                      <>
                        <button
                          onClick={() => start(m)}
                          className={`px-2 py-1 rounded text-xs border ${allSet ? 'border-emerald-700/40 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50' : 'border-amber-700/40 bg-amber-900/30 text-amber-200 hover:bg-amber-900/50'}`}
                        >
                          {allSet ? 'Activate' : `Activate (${m.pending} to approve)`}
                        </button>
                        <button onClick={() => openGrant(m)} className="ks-ghost-btn px-2 py-1 rounded text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10">Permissions</button>
                      </>
                    )}
                    <CardMenu
                      ariaLabel={`Actions for mod ${m.name}`}
                      items={[
                        { key: 'logs', label: 'View logs', tone: 'default', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /> </svg>) },
                        { key: 'edit', label: 'Edit', tone: 'default', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>) },
                        { key: 'download', label: 'Download .kspm', tone: 'default', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /> </svg>) },
                        { key: 'delete', label: deletingId === m.id ? 'Deleting…' : 'Delete', tone: 'danger', disabled: deletingId === m.id, icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /> </svg>) },
                      ]}
                      onSelect={(key) => {
                        if (key === 'edit') openEdit(m);
                        else if (key === 'delete') remove(m);
                        else if (key === 'download') downloadPkg(m);
                        else if (key === 'logs') openLogs(m);
                      }}
                    />
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && mods.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">No mods match your filters.</div>
      )}
      {!loading && mods.length === 0 && !error && (
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
              <path d="M9 2h6l2 4-3 2 3 2-2 4H9l-2-4 3-2-3-2z" />
              <path d="M12 14v8" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No mods yet</p>
          </div>
        </div>
      )}

      {/* ---- Install Mod modal ---- */}
      <GlassModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install Mod"
        maxWidth="max-w-lg"
        footer={
          installTab === 'file' ? (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={doUpload} disabled={uploading || !uploadFile} className="ks-btn-form ks-btn-primary">
                {uploading ? 'Installing…' : 'Install'}
              </button>
            </>
          ) : installTab === 'url' ? (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={doUrlInstall} disabled={urlBusy || !urlInput.trim()} className="ks-btn-form ks-btn-primary">
                {urlBusy ? 'Installing…' : 'Install from URL'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={() => { setInstallOpen(false); navigate('/mods/studio'); }} className="ks-btn-form ks-btn-primary">
                Open Mod Studio
              </button>
            </>
          )
        }
      >
        {/* Tab switcher */}
        <div className="flex gap-1 mb-3 bg-black/30 border border-white/10 rounded-md p-1">
          <button
            onClick={() => setInstallTab('file')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === 'file' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            Upload file
          </button>
          <button
            onClick={() => setInstallTab('url')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === 'url' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /> </svg>
            From URL
          </button>
          <button
            onClick={() => setInstallTab('studio')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === 'studio' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
            Studio
          </button>
          <button
            onClick={openSamplesTab}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === 'samples' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 2h6l2 4-3 2 3 2-2 4H9l-2-4 3-2-3-2z" /><path d="M12 14v8" /> </svg>
            Samples
          </button>
        </div>

        {installTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose a mod package (<code className="text-gray-300">.kspm</code> — a zip archive bundling the
              manifest with its pages, frontend, and backend code). The panel opens the zip, reads its
              <code className="text-gray-300"> manifest.json</code>, validates the requested permissions, stores the
              package on disk, and installs the mod <span className="text-amber-300">inactive</span> — you approve
              permissions before activating.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Package file</span>
              <input
                type="file"
                accept=".kspm,.ksmp,.zip,application/zip,application/x-zip-compressed"
                onChange={(e) => { const f = e.target.files?.[0] || null; if (f) onPickUpload(f); }}
                className="block w-full mt-1 text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200"
              />
            </label>

            {uploadFile && (
              <GlassCard className="text-xs">
                <p className="text-gray-300 font-medium">{uploadFile.name}</p>
                <p className="text-gray-500">
                  {uploadFile.type || 'application/zip'} · {(uploadFile.size / 1024).toFixed(1)} KiB
                </p>
                <p className="text-gray-400 mt-1">
                  The panel validates the package server-side. Manifest, capabilities, and bundled
                  frontend/backend/page assets are read from the zip on install.
                </p>
              </GlassCard>
            )}
            {uploadError && <p className="text-red-400 text-xs">{uploadError}</p>}
          </>
        )}

        {installTab === 'url' && (
          <>
            <p className="text-xs text-gray-400">
              Paste a manifest URL. The panel fetches it <span className="text-emerald-300">server-side</span>{' '}
              (SSRF-guarded — only public hosts, DNS-pinned, size + time capped), parses the body,
              and installs the mod <span className="text-amber-300">inactive</span> through the same path as a file upload.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest URL</span>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/mods/my-mod.ksmod"
                className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </label>
            <p className="text-[11px] text-gray-500">
              The response must be valid JSON. The fetched URL is recorded on the mod row so the audit timeline shows
              the install provenance.
            </p>
            {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
          </>
        )}

        {installTab === 'studio' && (
          <>
            <p className="text-xs text-gray-400">
              Build a mod visually — no code required. Define metadata, permissions, UI slots, event hooks,
              and a backend script. The Studio emits a standard manifest that installs through the same
              validated pipeline as uploaded files.
            </p>
            <GlassCard className="space-y-3 text-center py-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-gray-400">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <h4 className="text-white font-medium">Mod Studio</h4>
              <p className="text-gray-400 text-sm">A visual builder for creating panel mods without writing manifest JSON by hand.</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Features:</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Meta</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Permissions</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Slots</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Hooks</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Backend JS</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Custom Perms</span>
              </div>
            </GlassCard>
          </>
        )}

        {installTab === 'samples' && (
          <>
            <p className="text-xs text-gray-400">
              One-click install a built-in test mod. Samples go through the same validated pipeline as uploads — they install
              <span className="text-amber-300"> inactive</span>, and only run after you approve their requested permissions.
            </p>
            {samplesError && <p className="text-red-400 text-xs">{samplesError}</p>}
            {samplesLoading && <span className="inline-block h-3 w-24 rounded bg-white/10 animate-pulse align-middle" aria-busy="true" aria-label="Loading samples" />}
            {!samplesLoading && samples.length === 0 && !samplesError && (
              <p className="text-gray-500 text-xs">No built-in samples available.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {samples.map((s) => (
                <div key={s.key} className="ks-card ks-form-card flex items-start gap-3 p-3 rounded-lg">
                  <span className="text-xl leading-none mt-0.5" aria-hidden="true">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium flex items-center gap-2 flex-wrap">
                      {s.name}
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">
                        {s.engine_version >= 2 ? 'engine v2' : 'engine v1'}
                      </span>
                      {s.has_script && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">script</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
                    {s.permissions.length > 0 ? (
                      <p className="text-[11px] text-amber-300 mt-1">
                        Requests {s.permissions.length} permission{s.permissions.length === 1 ? '' : 's'} — approval required before activation.
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-400 mt-1">No permissions requested — safe to activate.</p>
                    )}
                  </div>
                  <button
                    onClick={() => doInstallSample(s.key)}
                    disabled={installingKey != null}
                    className="shrink-0 px-2.5 py-1 rounded text-xs border border-emerald-700/40 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
                  >
                    {installingKey === s.key ? 'Installing…' : 'Install'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </GlassModal>

      {/* ---- Edit modal ---- */}
      <GlassModal
        open={editId != null}
        onClose={() => setEditId(null)}
        title="Edit Mod"
        maxWidth="max-w-lg"
        footer={
          <>
            <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10">Cancel</button>
            <button onClick={saveEdit} disabled={editSaving} className="ks-primary-btn px-3 py-1.5 rounded text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50">
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <label className="block">
          <span className="text-xs text-gray-400">Name</span>
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Version</span>
          <input value={editVersion} onChange={(e) => setEditVersion(e.target.value)} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Description</span>
          <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
        </label>
        <p className="text-[11px] text-gray-500">Requested permissions are fixed at upload — re-upload the mod to change what it asks for.</p>
      </GlassModal>

      {/* ---- Grant / Activate modal ---- */}
      <GlassModal
        open={!!grantMod}
        onClose={() => setGrantMod(null)}
        title={grantMod ? `Permissions — ${grantMod.name}` : 'Permissions'}
        maxWidth="max-w-xl"
        footer={
          <>
            <button onClick={() => setGrantMod(null)} className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10">Close</button>
            {grantMod && grantMod.permissions.length > 0 && (
              <button onClick={approveAll} disabled={grantBusy} className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-200 hover:bg-white/10">Approve all</button>
            )}
            <button onClick={saveGrants} disabled={grantBusy} className="px-3 py-1.5 rounded text-sm border border-white/10 text-white hover:bg-white/10 disabled:opacity-50">
              {grantBusy ? 'Saving…' : 'Save permissions'}
            </button>
            <button onClick={saveAndActivate} disabled={grantBusy} className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
              Save & Activate
            </button>
          </>
        }
      >
        {grantMod && grantMod.permissions.length === 0 && (
          <p className="text-sm text-gray-300">This mod requested no permissions. You can activate it safely.</p>
        )}
        {grantMod && grantMod.permissions.length > 0 && (
          <>
            <p className="text-xs text-amber-300">
              This mod needs {grantMod.permissions.length} permission(s) to fully work. Review each one below before approving — the mod only activates once every requested permission is approved.
            </p>
            <div className="space-y-2">
              {grantMod.permissions.map((p) => {
                const meta = modCapabilityMeta(p.capability);
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
                      <p className="text-xs text-gray-400 mt-0.5">{meta ? meta.description : 'This mod requested this capability.'}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}
        {grantError && <p className="text-red-400 text-xs">{grantError}</p>}
      </GlassModal>

      {/* ---- Logs viewer modal ---- */}
      <GlassModal
        open={!!logsMod}
        onClose={() => setLogsMod(null)}
        title={logsMod ? `Logs — ${logsMod.name}` : 'Logs'}
        maxWidth="max-w-2xl"
        footer={
          <button onClick={() => setLogsMod(null)} className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10">Close</button>
        }
      >
        <p className="text-xs text-gray-500 mb-2">
          Runtime log ring for <code className="text-gray-300 font-mono">{logsMod?.slug}</code> (latest 200 lines, oldest first). Captures
          ks.log output plus engine lifecycle events.
        </p>
        {logsError && <p className="text-red-400 text-xs">{logsError}</p>}
        {logLines === null && !logsError && (
          <div className="space-y-1.5 mb-2 animate-pulse" aria-busy="true" aria-label="Loading logs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 rounded bg-white/[0.07] font-mono" style={{ width: `${92 - i * 14}%`, animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        {logLines !== null && logLines.length === 0 && (
          <div className="ks-card ks-form-card rounded-lg text-center">
            <p className="text-gray-400 text-sm">No log entries yet.</p>
            <p className="text-gray-500 text-xs mt-1">Entries appear when the mod runs (activate it and trigger its events) or when the engine records lifecycle events.</p>
          </div>
        )}
        {logLines !== null && logLines.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed space-y-0.5">
            {logLines.map((l, i) => (
              <p key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-300' : 'text-gray-300'}>
                <span className="text-gray-500">[{new Date(l.ts).toLocaleTimeString()}]</span>{' '}
                <span className="uppercase text-gray-500">{l.level}</span> {l.message}
              </p>
            ))}
          </div>
        )}
      </GlassModal>
    </div>
  );
};

export default Mods;
