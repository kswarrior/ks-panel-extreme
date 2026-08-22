import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listInstancePages,
  createInstancePage,
  updateInstancePage,
  deleteInstancePage,
  importInstancePageFromFile,
  importInstancePageFromURL,
  getMarketplacePages,
  importInstancePageFromMarketplace,
  listLocalInstancePages,
  importLocalInstancePage,
  type MarketplacePage,
  type LocalInstancePage,
} from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import Modal from '@/shared/components/ui/Modal';

type SortKey = 'name' | 'kind' | 'category' | 'updated' | 'newest';

const KIND_META: Record<string, { label: string; badge: string; dot: string; icon: string }> = {
  builtin: { label: 'Built-in', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', icon: 'builtin' },
  custom: { label: 'Custom', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60', dot: 'bg-emerald-400', icon: 'custom' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', icon: 'unknown' },
};

function kindKey(k: string): string {
  return k in KIND_META ? k : 'unknown';
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

  // Import modals state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMethod, setImportMethod] = useState<'file' | 'url' | 'studio' | 'marketplace' | 'local'>('file');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // File import state
  const [importFile, setImportFile] = useState<File | null>(null);

  // URL import state
  const [importUrl, setImportUrl] = useState('');

  // Marketplace state
  const [marketplacePages, setMarketplacePages] = useState<MarketplacePage[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [selectedMarketplacePage, setSelectedMarketplacePage] = useState<MarketplacePage | null>(null);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [marketplaceError, setMarketplaceError] = useState('');

  // Local files state
  const [localPages, setLocalPages] = useState<LocalInstancePage[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedLocalPage, setSelectedLocalPage] = useState<LocalInstancePage | null>(null);
  const [localError, setLocalError] = useState('');

  const loadMarketplacePages = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      const catalog = await getMarketplacePages();
      setMarketplacePages(catalog.pages);
    } catch (e: any) {
      setMarketplaceError(e?.response?.data || 'Failed to load marketplace');
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  const loadLocalPages = useCallback(async () => {
    setLocalLoading(true);
    try {
      const pages = await listLocalInstancePages();
      setLocalPages(pages);
    } catch (e: any) {
      setLocalError(e?.response?.data || 'Failed to load local pages');
    } finally {
      setLocalLoading(false);
    }
  }, []);

  const handleImport = async () => {
    setImportLoading(true);
    setImportError('');
    try {
      switch (importMethod) {
        case 'file': {
          if (!importFile) {
            setImportError('Please select a file');
            setImportLoading(false);
            return;
          }
          await importInstancePageFromFile(importFile);
          break;
        }
        case 'url': {
          if (!importUrl.trim()) {
            setImportError('Please enter a URL');
            setImportLoading(false);
            return;
          }
          await importInstancePageFromURL(importUrl.trim());
          break;
        }
        case 'marketplace': {
          if (!selectedMarketplacePage) {
            setImportError('Please select a marketplace page');
            setImportLoading(false);
            return;
          }
          await importInstancePageFromMarketplace(selectedMarketplacePage.id);
          break;
        }
        case 'local': {
          if (!selectedLocalPage) {
            setImportError('Please select a local page');
            setImportLoading(false);
            return;
          }
          await importLocalInstancePage(selectedLocalPage.slug + '.json');
          break;
        }
        case 'studio':
          break;
      }
      setImportModalOpen(false);
      setImportFile(null);
      setImportUrl('');
      setSelectedMarketplacePage(null);
      setSelectedLocalPage(null);
      await load();
    } catch (e: any) {
      setImportError(e?.response?.data || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  const openImportModal = (method: 'file' | 'url' | 'studio' | 'marketplace' | 'local') => {
    setImportMethod(method);
    setImportError('');
    setImportModalOpen(true);
    if (method === 'marketplace' && marketplacePages.length === 0) {
      loadMarketplacePages();
    }
    if (method === 'local' && localPages.length === 0) {
      loadLocalPages();
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ps = await listInstancePages();
      setPages(ps);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load instance pages');
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

  const openCreate = () => navigate('/instance-pages/studio');
  const openEdit = (p: InstancePage) => navigate(`/instance-pages/${p.id}/studio`);

  const remove = async (p: InstancePage) => {
    if (!confirm(`Delete instance page "${p.name}"?`)) return;
    setDeletingId(p.id);
    try { await deleteInstancePage(p.id); await load(); }
    catch (e: any) { alert(e?.response?.data || 'Failed to delete instance page'); }
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
    category: p.category || '',
    updated: p.updated_at ? new Date(p.updated_at).getTime() : 0,
    created: p.created_at ? new Date(p.created_at).getTime() : 0,
  })), [pages]);

  const stats = useMemo(() => {
    const byKind: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    enriched.forEach((e) => {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    });
    return {
      total: enriched.length,
      builtin: byKind.builtin || 0,
      custom: byKind.custom || 0,
      categories: Object.keys(byCategory).length,
      byKind,
      byCategory,
    };
  }, [enriched]);

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
    if (kindFilter !== 'all') out = out.filter((e) => e.kind === kindFilter);
    if (categoryFilter !== 'all') out = out.filter((e) => e.category === categoryFilter);
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name': return a.page.name.localeCompare(b.page.name);
        case 'kind': return a.kind.localeCompare(b.kind) || b.updated - a.updated;
        case 'category': return a.category.localeCompare(b.category) || b.updated - a.updated;
        case 'newest': return b.created - a.created;
        case 'updated':
        default: return b.updated - a.updated;
      }
    });
    return sorted;
  }, [enriched, search, kindFilter, categoryFilter, sort]);

  const resetFilters = () => { setSearch(''); setKindFilter('all'); setCategoryFilter('all'); setSort('name'); };

  const ImportModalContent = () => {
    if (!importModalOpen) return null;
    return (
      <Modal
        open={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setImportError('');
          setImportFile(null);
          setImportUrl('');
          setSelectedMarketplacePage(null);
          setSelectedLocalPage(null);
        }}
        title="Import Instance Page"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-emerald-900/30 border border-emerald-700/50 rounded-lg text-emerald-200">
            <p className="font-semibold">Studio — Create New Page</p>
            <p className="mt-1">
              This will open the Instance Page Studio where you can visually design a new page
              with HTML, Markdown, or Visual Blocks content.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setImportModalOpen(false);
                navigate('/instance-pages/studio');
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500"
            >
              Open Studio
            </button>
            <button
              onClick={() => setImportModalOpen(false)}
              className="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div>
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
                      <select className="w-full glass-field">
                        <option value="all">All pages</option>
                        <option value="builtin">Built-in</option>
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
        </div>
      </div>
      <div className="relative">
        <div className="flex items-center gap-2">
          <Link
            to="/instance-pages/stats"
            aria-label="Instance Page Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View instance page statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <button
            onClick={() => navigate('/instance-pages/studio')}
            aria-label="New Instance Page"
            className="ks-btn-header ks-icon-btn"
            title="New Instance Page (Studio)"
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
                    <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300" aria-hidden="true">
                      <KindIcon kind={e.kind} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-white truncate leading-tight">{p.name}</h3>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">/{p.slug}</p>
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
                    <CardMenu
                      ariaLabel={`Actions for instance page ${p.name}`}
                      items={e.kind === 'builtin' ? [] : [
                        {
                          key: 'edit',
                          label: 'Edit',
                          tone: 'default',
                          icon: (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
                          ),
                        },
                        {
                          key: 'delete',
                          label: deletingId === p.id ? 'Deleting…' : 'Delete',
                          tone: 'danger',
                          disabled: deletingId === p.id,
                          icon: (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /> </svg>
                          ),
                        },
                      ]}
                      onSelect={(key) => {
                        if (key === 'edit') openEdit(p);
                        else if (key === 'delete') remove(p);
                      }}
                    />
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
          <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">No instance pages yet. Click "New Instance Page".</div>
        )}
        <ImportModalContent />
      </div>
    </div>
  );
};

export default InstancePages;