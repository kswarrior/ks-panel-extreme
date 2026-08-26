import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listInstancePages,
  deleteInstancePage,
  importInstancePageFromFile,
  importInstancePageFromURL,
} from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import Modal from '@/shared/components/ui/Modal';
import { useConfirm } from '@/shared/stores/confirmStore';

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
  //      one entry point with three tabs — Upload file / From URL / Studio) ----
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<'file' | 'url' | 'studio'>('file');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUrl, setImportUrl] = useState('');

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
      } else {
        setImportLoading(false);
        return;
      }
      closeAdd();
      await load();
    } catch (e: any) {
      setImportError(e?.response?.data || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  // openAdd resets the dialog exactly like the Templates page's openInstall.
  const openAdd = () => {
    setAddOpen(true);
    setAddTab('file');
    setImportFile(null);
    setImportUrl('');
    setImportError('');
  };

  const closeAdd = () => {
    setAddOpen(false);
    setImportError('');
    setImportFile(null);
    setImportUrl('');
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

  const openEdit = (p: InstancePage) => navigate(`/instance-pages/${p.id}/studio`);

  const remove = async (p: InstancePage) => {
    if (!(await confirm({ title: 'Delete instance page', message: `Delete instance page "${p.name}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
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
    if (!addOpen) return null;
    return (
      <Modal
        open={addOpen}
        onClose={closeAdd}
        title="Add Instance Page"
        maxWidth="max-w-lg"
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
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${addTab === 'file' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            Upload file
          </button>
          <button
            onClick={() => setAddTab('url')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${addTab === 'url' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /> </svg>
            From URL
          </button>
          <button
            onClick={() => setAddTab('studio')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${addTab === 'studio' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
            Studio
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
      </Modal>
    );
  };

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
            title="Add Instance Page — upload a file, import from URL, or open Studio"
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
                    <div className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300" aria-hidden="true">
                      <KindIcon kind={e.kind} className="w-6 h-6" />
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
              <p className="text-sm text-gray-400 text-center max-w-md">Click the <strong className="text-sky-300">+</strong> button to upload a page, import from a URL, or open Studio.</p>
            </div>
          </div>
        )}
        <ImportModalContent />
      </div>
    </div>
  );
};

export default InstancePages;