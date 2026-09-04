import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '@/shared/api/client';
import {
  listTemplates,
  deleteTemplate,
  downloadTemplate,
  installTemplateFromURL,
} from '@/shared/api/admin';
import type { Template } from '@/shared/types/instance';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import GlassModal from '@/shared/components/ui/Modal';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useConfirm } from '@/shared/stores/confirmStore';

type KindKey = 'docker' | 'lxd' | 'kvm' | 'multipass' | 'unknown';
type SortKey = 'name' | 'kind' | 'updated' | 'newest';

const KIND_META: Record<KindKey, { label: string; badge: string; dot: string; icon: string }> = {
  docker: { label: 'Docker', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', icon: 'container' },
  lxd: { label: 'LXD', badge: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60', dot: 'bg-indigo-400', icon: 'lxd' },
  kvm: { label: 'KVM', badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60', dot: 'bg-orange-400', icon: 'kvm' },
  multipass: { label: 'Multipass', badge: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60', dot: 'bg-fuchsia-400', icon: 'multipass' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', icon: 'unknown' },
};

function kindKey(k: string): KindKey {
  return (k in KIND_META ? k : 'unknown') as KindKey;
}

function parseSpec(raw: string): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, any>; } catch { return {}; }
}

function KindIcon({ kind, className = '' }: { kind: KindKey; className?: string }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'docker':
      return (
        <svg {...common}><path d="M3 5h7v5H3z" /><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2" /><path d="M3 8v8h7V8" /><path d="M3 12h7" /> </svg>
      );
    case 'lxd':
      return (
        <svg {...common}><path d="M4 7 12 3l8 4v10l-8 4-8-4z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /> </svg>
      );
    case 'kvm':
      return (
        <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 20h10" /><path d="M9 8l4 3-4 3z" /> </svg>
      );
    case 'multipass':
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> </svg>
      );
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01M9 15h6" /> </svg>
      );
  }
}

const Templates: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindKey | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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

  // ---- download ----
  const handleDownload = async (t: Template) => {
    try {
      const blob = await downloadTemplate(t.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.name}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to download template');
    }
  };

  // ---- upload flow ---------------------------------------------------------
  const onPickUpload = (file: File) => {
    setUploadFile(file);
    setUploadError('');
    file.text().then((txt) => {
      let parsed: Record<string, any> | null = null;
      try { parsed = JSON.parse(txt) as Record<string, any>; } catch { /* */ }
      if (!parsed) {
        setUploadParsed(null);
        setUploadError('File is not valid JSON. A template manifest must be JSON.');
        return;
      }
      setUploadParsed(parsed);
    }).catch(() => {
      setUploadParsed(null);
      setUploadError('Could not read file.');
    });
  };

  const doUpload = async () => {
    if (!uploadFile) { setUploadError('Choose a template manifest file first.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('manifest', uploadFile);
      await client.post('/api/templates/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setInstallOpen(false);
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
      await installTemplateFromURL(urlInput.trim());
      setInstallOpen(false);
      setUrlInput('');
      await load();
    } catch (e: any) {
      setUrlError(e?.response?.data || 'Install failed');
    } finally {
      setUrlBusy(false);
    }
  };

  const openInstall = () => {
    setInstallOpen(true);
    setInstallTab('file');
    setUploadFile(null);
    setUploadParsed(null);
    setUploadError('');
    setUrlInput('');
    setUrlError('');
  };

  const remove = async (t: Template) => {
    if (!(await confirm({ title: 'Delete template', message: `Delete template "${t.name}"? Existing instances keep running.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(t.id);
    try { await deleteTemplate(t.id); await load(); }
    catch (e: any) { alert(e?.response?.data || 'Failed to delete template'); }
    finally { setDeletingId(null); }
  };

  // Aggregate categories from specs
  const categories = useMemo(() => {
    const cats = new Set<string>();
    templates.forEach((t) => {
      const s = parseSpec(t.spec);
      if (s.category) cats.add(String(s.category));
    });
    return [...cats].sort();
  }, [templates]);

  // Derived/enriched view models. Includes spec metadata parsed once so each
  // render can show limits/ports/env counts without re-parsing.
  const enriched = useMemo(() => templates.map((t) => {
    const s = parseSpec(t.spec);
    const limits = (s.limits || {}) as Record<string, string>;
    const ports = Array.isArray(s.ports) ? s.ports.length : 0;
    const env = Array.isArray(s.env) ? s.env.length : 0;
    const installs = Array.isArray(s.install) ? s.install.length : 0;
    const mounts = Array.isArray(s.mounts) ? s.mounts.length : 0;
    return {
      template: t,
      kind: kindKey(t.kind),
      category: s.category ? String(s.category) : '',
      type: s.type ? String(s.type) : '',
      memLimit: limits.memory || '',
      cpuLimit: limits.cpus || limits.cpu || '',
      diskLimit: limits.disk || '',
      ports,
      env,
      installs,
      mounts,
      updated: t.updated_at ? new Date(t.updated_at).getTime() : 0,
      created: t.created_at ? new Date(t.created_at).getTime() : 0,
    };
  }), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = enriched;
    if (q) {
      out = out.filter((e) =>
        e.template.name.toLowerCase().includes(q) ||
        e.template.description.toLowerCase().includes(q) ||
        e.template.image.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    }
    if (kindFilter !== 'all') out = out.filter((e) => e.kind === kindFilter);
    if (categoryFilter !== 'all') out = out.filter((e) => e.category === categoryFilter);
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name': return a.template.name.localeCompare(b.template.name);
        case 'kind': return a.kind.localeCompare(b.kind) || b.updated - a.updated;
        case 'newest': return b.created - a.created;
        case 'updated':
        default: return b.updated - a.updated;
      }
    });
    return sorted;
  }, [enriched, search, kindFilter, categoryFilter, sort]);

  // Install modal state — supports three tabs: file upload + URL install + Studio
  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'file' | 'url' | 'create'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadParsed, setUploadParsed] = useState<Record<string, any> | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  // URL install form state
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ts = await listTemplates();
      setTemplates(ts);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetFilters = () => { setSearch(''); setKindFilter('all'); setCategoryFilter('all'); setSort('updated'); };

  return (
    <div>
      {/* Fixed top-right pill — auto-hides with a right-to-left slide. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, image, category, type…"
            ariaLabel="Search templates"
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
              {(kindFilter !== 'all' || categoryFilter !== 'all' || sort !== 'updated') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Driver</label>
                      <select
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All drivers</option>
                        <option value="docker">Docker</option>
                        <option value="lxd">LXD</option>
                        <option value="kvm">KVM</option>
                        <option value="multipass">Multipass</option>
                     </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        disabled={categories.length === 0}
                        className="w-full glass-field disabled:opacity-50"
                      >
                        <option value="all">All categories</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Sort by</label>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="w-full glass-field"
                      >
                        <option value="updated">Recently updated</option>
                        <option value="newest">Newest first</option>
                        <option value="name">Name (A→Z)</option>
                        <option value="kind">Driver</option>
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
            to="/templates/stats"
            aria-label="Template Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View template statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <Link
            to="/templates/schedules"
            aria-label="Template schedules"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Template schedules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
          <button
            onClick={openInstall}
            aria-label="Install Template"
            className="ks-tab ks-tab-active inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Install Template"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
      </PageActionsPill>

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{filtered.length} of {templates.length} shown</p>
      </div>

      {error && <p className="text-red-400 mb-3">{error}</p>}
      {loading && <SkeletonGrid count={6} />}

      {!loading && filtered.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-templates-grid">
          {filtered.map((e) => {
            const t = e.template;
            const meta = KIND_META[e.kind];
            return (
              <article id={`ks-template-${t.id}`} key={t.id} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <header className="flex items-start gap-3 min-w-0">
                  <CardIconTile
                    icon={(t as any).icon || ''}
                    color={(t as any).color || ''}
                    fallback={<KindIcon kind={e.kind} className="w-5 h-5" />}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate leading-tight">{t.name}</h3>
                    {(e.category || e.type) && (
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {[e.category, e.type].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {t.description && (
                      <p className="text-xs text-gray-400 truncate">{t.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-white/[0.05] border-white/10 text-gray-300">
                    {meta.label}
                  </div>
                </header>

                {/* Image row — gives a single monospace line for the container/template image so a long registry path doesn't wrap. */}
                {t.image && (
                  <p className="text-[11px] text-gray-500 font-mono truncate bg-black/20 border border-white/5 rounded px-2 py-1" title={t.image}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3 inline mr-1 -mt-0.5"><rect x="3" y="8" width="18" height="8" rx="1" /><path d="M3 12h18" /> </svg>
                    {t.image}
                  </p>
                )}

                {/* Resource limits — SVG + Text + Value */}
                {(e.memLimit || e.cpuLimit || e.diskLimit) && (
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-300">
                    {e.memLimit && (
                      <span className="inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 text-emerald-300"><rect x="2" y="8" width="20" height="9" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /> </svg>
                        <span className="text-gray-400">RAM</span>
                        <span className="text-emerald-300">{e.memLimit}</span>
                      </span>
                    )}
                    {e.cpuLimit && (
                      <span className="inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 text-sky-300"><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" rx="0.5" /><path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3" /> </svg>
                        <span className="text-gray-400">CPU</span>
                        <span className="text-sky-300">{e.cpuLimit}</span>
                      </span>
                    )}
                    {e.diskLimit && (
                      <span className="inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 text-amber-300"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" /><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /> </svg>
                        <span className="text-gray-400">Disk</span>
                        <span className="text-amber-300">{e.diskLimit}</span>
                      </span>
                    )}
                  </div>
                )}

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 truncate">
                    {t.updated_at ? (
                      <>Updated {new Date(t.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</>
                    ) : (
                      <>id {t.id}</>
                    )}
                  </span>
                  <Link to={`/template/${t.id}`} className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline">View details →</Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && templates.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No templates match your filters.
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

      {!loading && templates.length === 0 && !error && (
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
              <rect x="7" y="4" width="13" height="15" rx="2" />
              <path d="M7 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
              <line x1="11" y1="9" x2="17" y2="9" opacity="0.7" />
              <line x1="11" y1="13" x2="17" y2="13" opacity="0.7" />
              <line x1="11" y1="17" x2="15" y2="17" opacity="0.5" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No templates yet</p>
          </div>
        </div>
      )}

      {/* ---- Install Template modal ---- */}
      <GlassModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install Template"
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
                Install from URL
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setInstallOpen(false)} className="ks-btn-cancel ks-btn-ghost">Cancel</button>
              <button onClick={() => { setInstallOpen(false); navigate('/templates/new'); }} className="ks-btn-form ks-btn-primary">
                Create Template
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
            onClick={() => setInstallTab('create')}
            className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${installTab === 'create' ? 'ks-tab-active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
            Create
          </button>
        </div>

        {installTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose a template manifest file (<code className="text-gray-300">.json</code>). The panel parses it, validates the spec,
              and creates the template.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest file</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => { const f = e.target.files?.[0] || null; if (f) onPickUpload(f); }}
                className="block w-full mt-1 text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white file:text-black file:text-sm hover:file:bg-gray-200"
              />
            </label>

            {uploadParsed && (
              <GlassCard className="text-xs">
                <p className="text-gray-300 font-medium">{uploadParsed.name || '(no name)'}</p>
                {uploadParsed.kind && <p className="text-gray-500">kind: {uploadParsed.kind}</p>}
                {uploadParsed.image && <p className="text-gray-500">image: {uploadParsed.image}</p>}
                {uploadParsed.description && <p className="text-gray-400 mt-1">{String(uploadParsed.description)}</p>}
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
              and creates the template through the same path as a file upload.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest URL</span>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/templates/my-template.json"
                className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </label>
            <p className="text-[11px] text-gray-500">
              The response must be valid JSON. The fetched URL is recorded for audit trail.
            </p>
            {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
          </>
        )}

        {installTab === 'create' && (
          <>
            <p className="text-xs text-gray-400">
              Create a new template from scratch using the visual builder.
            </p>
            <GlassCard className="space-y-3 text-center py-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-gray-400">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <h4 className="text-white font-medium">Create Template</h4>
              <p className="text-gray-400 text-sm">Build a template visually — define metadata, driver kind, image, env, ports, limits, install steps, and custom actions.</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Features:</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Meta</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Driver</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Env/Ports</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Limits</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Install</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Actions</span>
              </div>
            </GlassCard>
          </>
        )}
      </GlassModal>
    </div>
  );
};

export default Templates;