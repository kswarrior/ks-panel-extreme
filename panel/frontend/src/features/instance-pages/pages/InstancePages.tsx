import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listInstancePages,
  deleteInstancePage,
  importInstancePageFromFile,
  importInstancePageFromURL,
  getMarketplacePages,
  importInstancePageFromMarketplace,
  resyncMarketplacePages,
} from '@/shared/api/admin';
import type { MarketplaceCatalog, MarketplacePage } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import { pageSourceOf } from '@/features/instance-pages/types/instancePage';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import Modal from '@/shared/components/ui/Modal';
import { useConfirm } from '@/shared/stores/confirmStore';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';

type SortKey = 'name' | 'kind' | 'category' | 'updated' | 'newest';

const KIND_META: Record<string, { label: string; badge: string; dot: string; icon: string }> = {
  builtin: { label: 'Built-in', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', icon: 'builtin' },
  custom: { label: 'Custom', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60', dot: 'bg-emerald-400', icon: 'custom' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', icon: 'unknown' },
};

function kindKey(k: string): string {
  return k in KIND_META ? k : 'unknown';
}

// SOURCE_META drives the top-right provenance badge: market (fresh import),
// edited (market import later modified), studio (own pages). This replaces
// the old kind badge ("Custom") which could not tell market pages apart.
const SOURCE_META: Record<string, { label: string; badge: string; dot: string }> = {
  market: { label: 'Market', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400' },
  edited: { label: 'Edited', badge: 'bg-amber-900/60 text-amber-200 border-amber-700/60', dot: 'bg-amber-400' },
  studio: { label: 'Studio', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60', dot: 'bg-emerald-400' },
};

// getErrorMessage normalises API failures for display: some panel endpoints
// answer with JSON bodies ({error|message}) instead of plain text, which would
// otherwise render as "[object Object]".
function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function KindIcon({ kind, className = '' }: { kind: string; className?: string }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'builtin':
      return (
        <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /> </svg>
      );
    case 'custom':
      return (
        <svg {...common}><path d="M12 2l3 7h7l-5.5 4 2 7-6-5-6 5 2-7-5.5-4z" /> </svg>
      );
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01M9 15h6" /> </svg>
      );
  }
}

const InstancePages: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [pages, setPages] = useState<InstancePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [dense, setDense] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // ---- Add-page modal state (mirrors the Templates "Install" dialog:
  //      one entry point with tabs — Upload file / From URL / Studio / Import) ----
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<'file' | 'url' | 'studio' | 'market'>('file');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [marketCatalog, setMarketCatalog] = useState<MarketplaceCatalog | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketSearch, setMarketSearch] = useState('');
  const [selectedMarketIds, setSelectedMarketIds] = useState<Set<string>>(new Set());
  const [resyncBusy, setResyncBusy] = useState(false);
  const [resyncMsg, setResyncMsg] = useState('');
  const [resyncErr, setResyncErr] = useState('');


  const handleImport = async () => {
    setImportLoading(true);
    setImportError('');
    try {
      if (addTab === 'file') {
        if (!importFile) { setImportError('Please select a .json page file'); setImportLoading(false); return; }
        await importInstancePageFromFile(importFile);
      } else if (addTab === 'url') {
        if (!importUrl.trim()) { setImportError('Please enter a URL'); setImportLoading(false); return; }
        await importInstancePageFromURL(importUrl.trim());
      } else if (addTab === 'market') {
        setImportLoading(false);
        await handleMarketImport();
        return;
      } else {
        setImportLoading(false);
        return;
      }
      closeAdd();
      await load();
    } catch (e: any) {
      setImportError(getErrorMessage(e, 'Import failed'));
    } finally {
      setImportLoading(false);
    }
  };

  const loadMarketplace = useCallback(async () => {
    setMarketLoading(true);
    setMarketError('');
    try {
      const catalog = await getMarketplacePages();
      setMarketCatalog(catalog);
    } catch (e: any) {
      setMarketError(getErrorMessage(e, 'Failed to load marketplace'));
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (addTab === 'market' && !marketCatalog && !marketLoading && !marketError) {
      loadMarketplace();
    }
  }, [addTab, marketCatalog, marketLoading, marketError, loadMarketplace]);

  const toggleMarketSelect = (id: string) => {
    setSelectedMarketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMarketImport = async () => {
    if (selectedMarketIds.size === 0) { setImportError('Select at least one marketplace page to import'); return; }
    setImportLoading(true);
    setImportError('');
    try {
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const pid of selectedMarketIds) {
        try {
          await importInstancePageFromMarketplace(pid);
          imported++;
        } catch (e: any) {
          const msg = getErrorMessage(e, 'Import failed');
          if (msg.toLowerCase().includes('slug already exists') || msg.toLowerCase().includes('already exists')) skipped++;
          else errors.push(`${pid}: ${msg}`);
        }
      }
      if (imported > 0) {
        closeAdd();
        await load();
      }
      if (errors.length > 0) setImportError(errors.join('; '));
      else if (skipped > 0 && imported === 0) setImportError(`All selected pages already exist (skipped ${skipped})`);
      else if (skipped > 0) setImportError(`Imported ${imported}, skipped ${skipped} already existing`);
    } catch (e: any) {
      setImportError(getErrorMessage(e, 'Market import failed'));
    } finally {
      setImportLoading(false);
    }
  };

  const doResync = async () => {
    if (!(await confirm({ title: 'Update market pages', message: 'Re-save all market pages from their marketplace links? Local edits to market pages will be overwritten.', tone: 'warning', confirmLabel: 'Update all' }))) return;
    setResyncBusy(true);
    setResyncMsg('');
    setResyncErr('');
    try {
      const res = await resyncMarketplacePages();
      await load();
      const parts: string[] = [];
      parts.push(`Updated ${res.updated}`);
      if (res.skipped) parts.push(`skipped ${res.skipped}`);
      if (res.errors?.length) parts.push(`${res.errors.length} error(s)`);
      setResyncMsg(parts.join(' • '));
      if (res.errors?.length) setResyncErr(res.errors.join('; '));
    } catch (e: any) {
      setResyncErr(getErrorMessage(e, 'Resync failed'));
    } finally {
      setResyncBusy(false);
    }
  };

  // openAdd resets the dialog exactly like the Templates page's openInstall.
  const openAdd = () => {
    setAddOpen(true);
    setAddTab('file');
    setImportFile(null);
    setImportUrl('');
    setImportError('');
    setSelectedMarketIds(new Set());
    setMarketSearch('');
  };

  const closeAdd = () => {
    setAddOpen(false);
    setImportError('');
    setImportFile(null);
    setImportUrl('');
    setSelectedMarketIds(new Set());
    setMarketSearch('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ps = await listInstancePages();
      setPages(ps);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load instance pages'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const openEdit = (p: InstancePage) => navigate(`/instance-pages/${p.id}/studio`);

  const remove = async (p: InstancePage) => {
    if (!(await confirm({ title: 'Delete instance page', message: `Delete instance page "${p.name}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(p.id);
    try { await deleteInstancePage(p.id); await load(); }
    catch (e: any) { alert(getErrorMessage(e, 'Failed to delete instance page')); }
    finally { setDeletingId(null); }
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    pages.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return [...cats].sort();
  }, [pages]);

  const enriched = useMemo(() => pages.map((p) => ({
    page: p,
    kind: kindKey(p.kind),
    source: pageSourceOf(p),
    category: p.category || '',
    updated: p.updated_at ? new Date(p.updated_at).getTime() : 0,
    created: p.created_at ? new Date(p.created_at).getTime() : 0,
  })), [pages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = enriched;
    if (q) {
      out = out.filter((e) =>
        e.page.name.toLowerCase().includes(q) ||
        e.page.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.page.slug.toLowerCase().includes(q)
      );
    }
    if (kindFilter !== 'all') out = out.filter((e) => e.source === kindFilter);
    if (categoryFilter !== 'all') out = out.filter((e) => e.category === categoryFilter);
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name': return a.page.name.localeCompare(b.page.name);
        case 'kind': return a.source.localeCompare(b.source) || b.updated - a.updated;
        case 'category': return a.category.localeCompare(b.category) || b.updated - a.updated;
        case 'newest': return b.created - a.created;
        case 'updated':
        default: return b.updated - a.updated;
      }
    });
    return sorted;
  }, [enriched, search, kindFilter, categoryFilter, sort]);

  const resetFilters = () => { setSearch(''); setKindFilter('all'); setCategoryFilter('all'); setSort('name'); };

  const filteredMarketPages = useMemo(() => {
    if (!marketCatalog) return [];
    const q = marketSearch.trim().toLowerCase();
    if (!q) return marketCatalog.pages;
    return marketCatalog.pages.filter((mp) =>
      mp.name.toLowerCase().includes(q) ||
      mp.id.toLowerCase().includes(q) ||
      mp.category.toLowerCase().includes(q) ||
      mp.description.toLowerCase().includes(q)
    );
  }, [marketCatalog, marketSearch]);

  const marketExistingSlugs = useMemo(() => new Set(pages.map((pg) => pg.slug)), [pages]);



  return (
    <div>
      {/* Header — identical single-row control group to the Templates page:
          search · filter · stats · add, all aligned on one line. */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Instance Pages</h2>
        <div className="flex items-center gap-2">
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, slug, category…"
            ariaLabel="Search instance pages"
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
              {(kindFilter !== 'all' || categoryFilter !== 'all' || sort !== 'name') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>

            {/* Filter Dropdown Menu */}
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Filter by</label>
                      <select
                        className="w-full glass-field"
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value)}
                        aria-label="Filter pages by kind"
                      >
                        <option value="all">All pages</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setFilterOpen(false)}
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
            to="/instance-pages/stats"
            aria-label="Instance Page Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View instance page statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <button
            onClick={openAdd}
            aria-label="Add Instance Page"
            className="ks-btn-header ks-icon-btn"
            title="Add Instance Page — upload, URL or Studio"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {loading && <SkeletonGrid count={6} />}
        {!loading && filtered.length > 0 && (
          <div className={`ks-card-grid grid gap-4 ${dense ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`} id="ks-instancepages-grid">
            {filtered.map((e) => {
              const p = e.page;
              const meta = KIND_META[e.kind];
              return (
                <article key={p.id} id={`ks-instancepage-${p.id}`} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                  <header className="flex items-start gap-3 min-w-0 relative">
                    <div className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300 overflow-hidden" aria-hidden="true">
                      {p.icon_svg ? (
                        (() => {
                          const sanitized = sanitizeSvgIcon(p.icon_svg);
                          const isFullSvg = sanitized.trim().toLowerCase().startsWith('<svg');
                          if (isFullSvg) {
                            return <span className="w-6 h-6 block [&>svg]:w-6 [&>svg]:h-6 [&>svg]:block" dangerouslySetInnerHTML={{ __html: sanitized }} />;
                          }
                          return (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                              <g dangerouslySetInnerHTML={{ __html: sanitized }} />
                            </svg>
                          );
                        })()
                      ) : (
                        <KindIcon kind={e.kind} className="w-6 h-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-white truncate leading-tight">{p.name}</h3>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">/{p.slug === '.' ? '' : p.slug}</p>
                      {p.category && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            {p.category}
                          </span>
                        </p>
                      )}
                      {p.description && (
                        <p className="text-xs text-gray-400 truncate mt-1">{p.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-white/[0.05] border-white/10 text-gray-300">
                      {meta.label}
                    </div>
                  </header>

                  {p.content_type && (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-gray-300" title="Content type">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /> </svg>
                        {p.content_type}
                      </span>
                      {p.icon_svg && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-gray-300" title="Custom icon">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /> </svg>
                          Custom icon
                        </span>
                      )}
                    </div>
                  )}

                  <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-500 truncate">
                      {p.updated_at ? (
                        <>Updated {new Date(p.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</>
                      ) : (
                        <>id {p.id}</>
                      )}
                    </span>
                    <Link to={`/instance-pages/${p.id}`} className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline">View details →</Link>
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && pages.length > 0 && !error && (
          <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
            No instance pages match your filters.
            <div className="mt-2 flex justify-center">
              <button onClick={resetFilters} aria-label="Clear filters" className="ks-btn-icon ks-icon-btn" title="Clear filters">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!loading && pages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
            <div className="flex flex-col items-center gap-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-20 h-20 text-gray-400" aria-hidden="true">
                <rect x="7" y="4" width="13" height="15" rx="2" />
                <path d="M7 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
                <line x1="11" y1="9" x2="17" y2="9" opacity="0.7" />
                <line x1="11" y1="13" x2="17" y2="13" opacity="0.7" />
                <line x1="11" y1="17" x2="15" y2="17" opacity="0.5" />
              </svg>
              <p className="text-lg font-medium text-gray-300">No instance pages yet</p>
              <p className="text-sm text-gray-400 text-center max-w-md">Click the <strong className="text-sky-300">+</strong> button to upload a page, import from URL or open Studio.</p>
            </div>
          </div>
        )}
      <Modal
        open={addOpen}
        onClose={closeAdd}
        title="Add Instance Page"
        maxWidth={addTab === 'market' ? 'max-w-2xl' : 'max-w-lg'}
        footer={
          addTab === 'file' ? (
            <>
              <button onClick={closeAdd} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={handleImport} disabled={importLoading || !importFile} className="ks-btn-form ks-btn-primary">
                {importLoading ? 'Importing…' : 'Import'}
              </button>
            </>
          ) : addTab === 'url' ? (
            <>
              <button onClick={closeAdd} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={handleImport} disabled={importLoading || !importUrl.trim()} className="ks-btn-form ks-btn-primary">
                Import from URL
              </button>
            </>
          ) : addTab === 'market' ? (
            <>
              <button onClick={closeAdd} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={handleMarketImport} disabled={importLoading || selectedMarketIds.size === 0} className="ks-btn-form ks-btn-primary">
                {importLoading ? 'Importing…' : selectedMarketIds.size === 0 ? 'Select pages to import' : `Import ${selectedMarketIds.size} page${selectedMarketIds.size > 1 ? 's' : ''}`}
              </button>
            </>
          ) : (
            <>
              <button onClick={closeAdd} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={() => { closeAdd(); navigate('/instance-pages/studio'); }} className="ks-btn-form ks-btn-primary">
                Open Studio
              </button>
            </>
          )
        }
      >
        {/* Tab switcher — mirrors the Templates "Install Template" dialog */}
        <div className="flex gap-1 mb-3 bg-black/30 border border-white/10 rounded-md p-1">
          <button
            onClick={() => setAddTab('file')}
            className={`ks-tab flex-1 px-2 py-1.5 rounded text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 ${addTab === 'file' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            <span className="hidden sm:inline">Upload</span><span className="sm:hidden">File</span>
          </button>
          <button
            onClick={() => setAddTab('url')}
            className={`ks-tab flex-1 px-2 py-1.5 rounded text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 ${addTab === 'url' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /> </svg>
            URL
          </button>
          <button
            onClick={() => setAddTab('studio')}
            className={`ks-tab flex-1 px-2 py-1.5 rounded text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 ${addTab === 'studio' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
            Studio
          </button>
          <button
            onClick={() => setAddTab('market')}
            className={`ks-tab flex-1 px-2 py-1.5 rounded text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 ${addTab === 'market' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Market
          </button>

        </div>

        {addTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose an instance page definition file (<code className="text-gray-300">.json</code>). The panel validates it and adds it to the library.
            </p>
            <label className="block mt-2">
              <span className="text-xs text-gray-400">Page file</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => { const f = e.target.files?.[0] || null; setImportFile(f); setImportError(''); }}
                className="block w-full mt-1 text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200"
              />
            </label>
            {importFile && (
              <GlassCard className="text-xs mt-2">
                <p className="text-gray-300 font-medium">{importFile.name}</p>
                <p className="text-gray-500">{Math.round(importFile.size / 1024)} KB</p>
              </GlassCard>
            )}
            {importError && <p className="text-red-400 text-xs">{importError}</p>}
          </>
        )}

        {addTab === 'url' && (
          <>
            <p className="text-xs text-gray-400">
              Paste a page definition URL. The panel fetches it <span className="text-emerald-300">server-side</span>{' '}
              (SSRF-guarded), parses the body, and adds the page to the library.
            </p>
            <label className="block mt-2">
              <span className="text-xs text-gray-400">Page URL</span>
              <input
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setImportError(''); }}
                placeholder="https://example.com/pages/my-page.json"
                className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </label>
            <p className="text-[11px] text-gray-500 mt-1">
              The response must be valid JSON. The fetched URL is recorded for audit trail.
            </p>
            {importError && <p className="text-red-400 text-xs">{importError}</p>}
          </>
        )}

        {addTab === 'studio' && (
          <>
            <p className="text-xs text-gray-400">
              Create a new page from scratch using the visual Instance Page Studio.
            </p>
            <GlassCard className="space-y-3 text-center py-6 mt-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-gray-400">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <h4 className="text-white font-medium">Instance Page Studio</h4>
              <p className="text-gray-400 text-sm">Design pages visually with HTML, Markdown, or Blocks content, attach executable actions, preview live, then save to the library.</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">HTML</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Markdown</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Blocks</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Actions</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Preview</span>
              </div>
            </GlassCard>
          </>
        )}

        {addTab === 'market' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Browse the marketplace catalog at <code className="text-gray-300">instance_pages/marketplace.json</code> (<a href="https://raw.githubusercontent.com/kswarrior/ks-panel-extreme/refs/heads/main/instance_pages/marketplace.json" target="_blank" rel="noreferrer" className="text-sky-300 underline">raw GitHub</a>). Select pages to import into the library.
            </p>
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Search marketplace by name, slug or category…"
              className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
              aria-label="Search marketplace"
            />
            {marketLoading && (
              <div className="px-4 py-6 space-y-3 animate-pulse border border-white/10 rounded-md bg-black/30">
                {[0,1,2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-1/3 rounded bg-white/10" style={{ animationDelay: `${i*120}ms` }} />
                    <div className="h-3 flex-1 rounded bg-white/[0.06]" style={{ animationDelay: `${i*120+60}ms` }} />
                  </div>
                ))}
              </div>
            )}
            {marketError && (
              <div className="text-xs text-red-400 border border-red-700/40 rounded px-3 py-2 bg-red-900/20 flex items-center justify-between">
                <span>{marketError}</span>
                <button onClick={loadMarketplace} className="text-xs underline hover:text-red-300">Retry</button>
              </div>
            )}
            {!marketLoading && !marketError && marketCatalog && marketCatalog.pages.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 text-sm border border-white/10 rounded-md bg-black/20">
                <p>Marketplace is empty.</p>
                <p className="text-xs text-gray-600 mt-1">Add entries to instance_pages/marketplace.json</p>
              </div>
            )}
            {!marketLoading && !marketError && marketCatalog && filteredMarketPages.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-500 text-sm border border-white/10 rounded-md bg-black/20">
                No marketplace pages match your search.
              </div>
            )}
            {!marketLoading && !marketError && marketCatalog && filteredMarketPages.length > 0 && (
              <>
                <div className="border border-white/10 rounded-md bg-black/30 max-h-[42vh] overflow-y-auto divide-y divide-white/5">
                  {filteredMarketPages.map((mp) => {
                    const isSelected = selectedMarketIds.has(mp.id);
                    const slugForCheck = mp.id === 'home' ? '.' : mp.id;
                    const alreadyExists = marketExistingSlugs.has(slugForCheck) || marketExistingSlugs.has(mp.id);
                    return (
                      <button
                        key={mp.id}
                        type="button"
                        disabled={alreadyExists}
                        onClick={() => !alreadyExists && toggleMarketSelect(mp.id)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${alreadyExists ? 'opacity-50 cursor-not-allowed' : isSelected ? 'bg-emerald-900/20 border-l-2 border-emerald-500' : 'hover:bg-white/5'}`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-emerald-900/40 border border-emerald-700/60' : 'bg-sky-900/30 border border-sky-700/40'}`}>
                          {mp.icon_svg ? (
                            <span className="w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:block" dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(mp.icon_svg) }} />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-sky-300"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white truncate">{mp.name}</span>
                            <code className="text-[11px] text-gray-500 font-mono">/{mp.id === 'home' ? '' : mp.id}</code>
                            <span className="text-[10px] uppercase tracking-wide bg-white/5 text-gray-400 border border-white/10 px-1 py-0 rounded">{mp.category}</span>
                            {mp.author && <span className="text-[10px] text-gray-500">by {mp.author}</span>}
                          </div>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{mp.description}</p>
                          {alreadyExists && <p className="text-[11px] text-amber-400 mt-0.5">Already in library — slug exists</p>}
                        </div>
                        <div className="shrink-0">
                          {alreadyExists ? (
                            <span className="text-xs px-2 py-1 rounded border border-white/10 text-gray-500">Exists</span>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded border ${isSelected ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200' : 'border-white/10 text-gray-400'}`}>
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelectedMarketIds(new Set())} disabled={selectedMarketIds.size === 0} className="text-xs text-gray-400 hover:text-white disabled:opacity-40">Clear selection</button>
                  <span className="text-xs text-gray-600">•</span>
                  <button type="button" onClick={() => {
                    const allIds = filteredMarketPages.filter((p) => {
                      const s = p.id === 'home' ? '.' : p.id;
                      return !marketExistingSlugs.has(s) && !marketExistingSlugs.has(p.id);
                    }).map((p) => p.id);
                    setSelectedMarketIds(new Set(allIds));
                  }} className="text-xs text-sky-300 hover:text-sky-200 disabled:opacity-40">Select all visible</button>
                  <span className="text-xs text-gray-600">•</span>
                  <span className="text-[11px] text-gray-500">{marketCatalog.pages.length} in marketplace • {marketCatalog.updated ? `updated ${new Date(marketCatalog.updated).toLocaleDateString()}` : ''}</span>
                </div>
                {selectedMarketIds.size > 0 && (
                  <p className="text-[11px] text-emerald-300">{selectedMarketIds.size} marketplace page{selectedMarketIds.size>1?'s':''} selected — will be imported.</p>
                )}
                {importError && <p className="text-red-400 text-xs border border-red-700/40 rounded px-3 py-2 bg-red-900/20">{importError}</p>}
              </>
            )}
          </div>
        )}

      </Modal>
      </div>
    </div>
  );
};

export default InstancePages;