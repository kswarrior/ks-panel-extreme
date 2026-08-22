import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '@/shared/api/client';
import GlassCard from '@/shared/components/ui/Card';
import ThemePreview from '@/features/themes/components/ThemePreview';
import GlassModal from '@/shared/components/ui/Modal';
import RichMenu, { type RichMenuItem } from '@/shared/components/ui/RichMenu';
import { useThemeAssignItems } from '@/features/themes/components/ThemeAssignMenu';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useAuthStore } from '@/shared/stores/authStore';
import { AREAS, STANDALONE_PAGES } from '@/features/instance-pages/types/pageregistry';
import type { Theme } from '@/features/themes/types/theme';
import { downloadTheme, installThemeFromUrl, uploadThemeFile } from '@/features/themes/api/themes';

// ApplyToRichMenu is the "Apply to…" dropdown for a single theme card.
// It wires RichMenu (which owns portal + placement + scrim + submenu
// logic) to the `useThemeAssignItems` builder, so the Themes page no
// longer needs its own floating portal machinery. `placement="top-right"`
// makes the menu float ABOVE the Apply-to button — what the user asked
// for — and RichMenu's smart flip handles the bottom-of-viewport case
// automatically.
const ApplyToRichMenu: React.FC<{ theme: Theme }> = ({ theme }) => {
  const { items, onToggle } = useThemeAssignItems(theme);
  return (
    <RichMenu
      items={items}
      onToggle={onToggle}
      width={288}
      maxHeight="min(70vh, 320px)"
      placement="center"
      offsetDistance={8}
      ariaLabel={`Apply “theme ${theme.name}” to pages`}
      header={
        <div>
          <p className="text-xs text-gray-400 truncate">Apply “{theme.name}” to…</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Toggle areas, individual pages, or use Bulk actions
          </p>
        </div>
      }
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="ks-primary-btn w-full bg-white text-black text-sm py-1.5 rounded hover:bg-gray-200 inline-flex items-center justify-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M4 7h16M4 12h16M4 17h10" /> </svg>
          Apply to…
        </button>
      )}
    />
  );
};

// Pretty-print a single assignment scope for the "Used on" caption on each
// theme card. Area scopes render as the area label; page scopes render the
// page label prefixed with its area so the admin can tell "Users" apart
// from "Instance · Files".
function scopeLabel(scope: string): string {
  if (scope.startsWith('area:')) {
    const id = scope.slice(5);
    return AREAS.find((a) => a.id === id)?.label || scope;
  }
  const id = scope.slice(5);
  const page = [...AREAS.flatMap((a) => a.pages), ...STANDALONE_PAGES].find((p) => p.id === id);
  return page?.label || id;
}

const Themes: React.FC = () => {
  const navigate = useNavigate();
  const themes = useThemeStore((s) => s.themes);
  const assignments = useThemeStore((s) => s.assignments);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const globalAssignments = useThemeStore((s) => s.globalAssignments);
  const loadGlobal = useThemeStore((s) => s.loadGlobal);
  const deleteTheme = useThemeStore((s) => s.deleteTheme);
  const deleteGlobalTheme = useThemeStore((s) => s.deleteGlobalTheme);
  const load = useThemeStore((s) => s.load);
  const beginDraft = useThemeStore((s) => s.beginDraft);
  const editDraft = useThemeStore((s) => s.editDraft);
  const discardDraft = useThemeStore((s) => s.discardDraft);
  // canManageGlobal admits the umbrella (MANAGE_THEMES) OR any of the
  // authoring verbs (CREATE_GLOBAL_THEMES / EDIT_THEMES), so a moderator
  // narrowed to "just publish" or "just edit" still sees the authoring
  // affordances. Mirrors the backend theme route gates.
  const canManageGlobal = useAuthStore((s) =>
    s.permissions.includes('MANAGE_THEMES') ||
    s.permissions.includes('CREATE_GLOBAL_THEMES') ||
    s.permissions.includes('EDIT_THEMES'),
  );

  // The merged grid list — built-in 'default' always first, then every LOCAL
  // theme (this user's browser) and every GLOBAL theme (server, every user).
  // Themes are deduped by id so a globally-installed build of the built-in
  // default doesn't double-render alongside the seeded local copy.
  const allThemes = useMemo(() => {
    const map = new Map<string, { theme: typeof themes[number]; origin: 'builtin' | 'local' | 'global' }>();
    for (const t of globalThemes) map.set(t.id, { theme: t, origin: 'global' });
    for (const t of themes) map.set(t.id, { theme: t, origin: t.builtin ? 'builtin' : 'local' });
    // built-in 'default' isn't in the local list (it's seeded via DEFAULT_THEME)
    // — add it explicitly if no entry exists yet so the grid always shows it.
    if (!map.has('default')) {
      const def = themes.find((t) => t.id === 'default');
      if (def) map.set('default', { theme: def, origin: 'builtin' });
    }
    return Array.from(map.values());
  }, [themes, globalThemes]);

  useEffect(() => {
    load();
    loadGlobal();
    // If a previous studio session left a draft in-memory, drop it so
    // visiting the list page is always a clean slate.
    discardDraft();
  }, [load, loadGlobal, discardDraft]);

  // Filter state
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | 'builtin' | 'global' | 'local'>('all');
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Install modal state — supports three tabs: file upload + URL install + Studio
  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'file' | 'url' | 'studio'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadParsed, setUploadParsed] = useState<Record<string, any> | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  // URL install form state
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');

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

  // Filter themes
  const filteredThemes = useMemo(() => {
    let out = allThemes;
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((x) =>
        x.theme.name.toLowerCase().includes(q) ||
        x.theme.description.toLowerCase().includes(q)
      );
    }
    if (originFilter !== 'all') out = out.filter((x) => x.origin === originFilter);
    if (assignedFilter !== 'all') {
      out = out.filter((x) => {
        const hasAssignment = scopesFor(x.theme.id).length > 0;
        return assignedFilter === 'assigned' ? hasAssignment : !hasAssignment;
      });
    }
    return out;
  }, [allThemes, search, originFilter, assignedFilter]);

  const openStudio = () => {
    beginDraft(useThemeStore.getState().active());
    navigate('/themes/studio');
  };

  // A theme lives in EITHER the local list (this user's localStorage) OR the
  // global list (server, every user). findTheme unifies the two so the page can
  // edit / delete / describe a theme by id without caring where it's stored.
  const findTheme = (id: string): { theme: typeof themes[number]; origin: 'local' | 'global' } | undefined => {
    const local = themes.find((t) => t.id === id);
    if (local) return { theme: local, origin: 'local' };
    const global = globalThemes.find((t) => t.id === id);
    if (global) return { theme: global, origin: 'global' };
    return undefined;
  };

  const editInStudio = (id: string) => {
    const found = findTheme(id);
    if (!found || found.theme.builtin) return; // built-in default is read-only
    // editDraft preserves the theme's id so the studio Save button updates
    // this theme instead of cloning it (beginDraft would blank the id). The
    // studio detects origin (local vs global) so a save re-publishes a global
    // theme to the server rather than cloning it locally.
    editDraft(found.theme);
    navigate('/themes/studio');
  };

  const remove = (id: string) => {
    const found = findTheme(id);
    if (!found || found.theme.builtin) return;
    if (!confirm(`Delete theme "${found.theme.name}"? Any pages using it fall back to the Default theme.`)) return;
    // A global theme is removed server-side; everyone loses it. A local theme
    // is removed from this browser only. Editing a global theme requires
    // MANAGE_THEMES (the page itself is already gated, but we double-check
    // to be safe).
    if (found.origin === 'global') {
      if (!canManageGlobal) return;
      deleteGlobalTheme(id);
    } else {
      deleteTheme(id);
    }
  };

  // ---- download ----
  // Local / built-in themes only exist in THIS browser's localStorage, so the
  // server's /download endpoint 404s for them — and because that request uses
  // responseType:'blob', a 404 surfaces as a Blob error body that alert()
  // rendered as the unreadable "[object Blob]". We therefore build the
  // manifest client-side from the in-memory Theme object for non-global
  // origins, and only hit the server for global themes (whose canonical spec
  // lives there). Any Blob error body from the global path is decoded to
  // text so the surfaced message is human-readable.
  const handleDownload = async (t: Theme, origin: 'builtin' | 'local' | 'global') => {
    try {
      let blob: Blob;
      if (origin === 'global') {
        blob = await downloadTheme(t.id);
      } else {
        const manifest = {
          id: t.id,
          name: t.name,
          description: t.description,
          builtin: t.builtin,
          spec: t,
        };
        blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.name}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e: any) {
      let msg = 'Failed to download theme';
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try { msg = await data.text(); } catch { /* keep default */ }
      } else if (typeof data === 'string' && data) {
        msg = data;
      }
      alert(msg);
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
        setUploadError('File is not valid JSON. A theme manifest must be JSON.');
        return;
      }
      setUploadParsed(parsed);
    }).catch(() => {
      setUploadParsed(null);
      setUploadError('Could not read file.');
    });
  };

  const doUpload = async () => {
    if (!uploadFile) { setUploadError('Choose a theme manifest file first.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      await uploadThemeFile(uploadFile);
      setInstallOpen(false);
      setUploadFile(null);
      setUploadParsed(null);
      // The theme store will auto-refresh via the global listener
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
      await installThemeFromUrl(urlInput.trim());
      setInstallOpen(false);
      setUrlInput('');
      // The theme store will auto-refresh
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

  // Pull the scopes bound to a theme from BOTH maps so a card shows the full
  // "Used on:" caption regardless of whether the binding is local or global.
  const scopesFor = (themeId: string): string[] => {
    const out: string[] = [];
    for (const [scope, tid] of Object.entries(assignments)) if (tid === themeId) out.push(scope);
    for (const [scope, tid] of Object.entries(globalAssignments)) if (tid === themeId) out.push(scope);
    return Array.from(new Set(out));
  };

  const usedCountTotal = Object.keys(assignments).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Themes</h2>
        <div className="flex items-center gap-2">
<SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, description…"
            ariaLabel="Search themes"
          />
          <button
            onClick={openInstall}
            className="ks-icon-btn p-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition"
            title="Install Theme"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /> </svg>
</button>
          <Link
            to="/themes/stats"
            aria-label="Theme Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View theme statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          {/* Filter dropdown toggle */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {(originFilter !== 'all' || assignedFilter !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
             </button>

            {/* Filter Dropdown Menu */}
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Origin</label>
                      <select
                        value={originFilter}
                        onChange={(e) => setOriginFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All origins</option>
                        <option value="builtin">Built-in</option>
                        <option value="global">Global</option>
                        <option value="local">Personal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Assignment</label>
                      <select
                        value={assignedFilter}
                        onChange={(e) => setAssignedFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
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
        </div>
      </div>

<div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-themes-grid">
        {filteredThemes.map(({ theme: t, origin }) => {
          const scopes = scopesFor(t.id);
          const isDefault = t.id === 'default';
          const canMutate = !t.builtin && (origin === 'local' || canManageGlobal);
          const canAssign = origin !== 'global' || canManageGlobal;

          return (
            <article key={t.id} id={`ks-theme-${t.id}`} className="ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <header className="flex items-start gap-3 min-w-0">
                <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-black/30 ${isDefault ? 'border-sky-700/60 text-sky-300' : t.builtin ? 'border-sky-700/60 text-sky-300' : origin === 'global' ? 'border-indigo-700/60 text-indigo-300' : 'border-emerald-700/60 text-emerald-300'}`} aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white truncate leading-tight">{t.name}</h3>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{t.id}{t.builtin ? ' · built-in' : origin === 'global' ? ' · global' : ' · local'}</p>
                </div>
              </header>

              <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-500 truncate">
                  {t.updated_at ? <>Updated {new Date(t.updated_at).toLocaleDateString()}</> : <>id {t.id}</>}
                </span>
                <div className="flex items-center gap-1">
                  {canAssign && (
                    <ApplyToRichMenu theme={t} />
                  )}
                </div>
              </footer>
            </article>
          );
        })}

        {/* "Create new in Studio" placeholder card — mirrors the empty
            slot pattern other admin lists use to keep the grid balanced. */}
        <button
          type="button"
          onClick={openStudio}
          className="glass-card rounded-xl flex flex-col items-center justify-center gap-3 min-h-[180px] border-dashed hover:bg-white/[0.06] transition-colors"
        >
          <span className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <p className="text-sm font-medium text-white">Create a new theme</p>
          <p className="text-xs text-gray-400 text-center max-w-[16rem]">
            Open the Theme Studio to customise background, cards, sidebar, buttons and more, then assign it to any page or area.
          </p>
        </button>
      </div>

      {/* ---- Install Theme modal ---- */}
      <GlassModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="Install Theme"
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
              <button onClick={() => { setInstallOpen(false); navigate('/themes/studio'); }} className="ks-btn-form ks-btn-primary">
                Open Theme Studio
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /> </svg>
            Studio
          </button>
        </div>

        {installTab === 'file' && (
          <>
            <p className="text-xs text-gray-400">
              Choose a theme manifest file (<code className="text-gray-300">.json</code>). The panel parses it, validates the spec,
              and creates the theme.
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
                {uploadParsed.description && <p className="text-gray-500">{uploadParsed.description}</p>}
                {uploadParsed.id && <p className="text-gray-500">id: {uploadParsed.id}</p>}
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
              and creates the theme through the same path as a file upload.
            </p>
            <label className="block">
              <span className="text-xs text-gray-400">Manifest URL</span>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/themes/my-theme.json"
                className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </label>
            <p className="text-[11px] text-gray-500">
              The response must be valid JSON. The fetched URL is recorded for audit trail.
            </p>
            {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
          </>
        )}

        {installTab === 'studio' && (
          <>
            <p className="text-xs text-gray-400">
              Build a theme visually — no JSON required. Define background, cards, sidebar, buttons,
              and more. The Studio emits a standard manifest that installs through the same
              validated pipeline as uploaded files.
            </p>
            <GlassCard className="space-y-3 text-center py-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-gray-400">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
              <h4 className="text-white font-medium">Theme Studio</h4>
              <p className="text-gray-400 text-sm">A visual builder for creating panel themes without writing manifest JSON by hand.</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Features:</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Background</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Cards</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Sidebar</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Buttons</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Typography</span>
                <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded">Global CSS</span>
              </div>
            </GlassCard>
          </>
        )}
      </GlassModal>
    </div>
  );
};

export default Themes;
