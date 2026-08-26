import React, { useCallback, useState, useMemo } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import Modal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { CustomPageStudio } from '@/features/templates/components/TemplateFormComponents';
import type { PageOverride } from '@/features/templates/types/templateForm';
import { listInstancePages, type InstancePage } from '@/shared/api/admin';
import { parseSubPages } from '@/features/instance-pages/types/instancePage';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';

export interface PageOverrideInput extends PageOverride {}

export interface PagesSectionProps {
  pages: PageOverrideInput[];
  onPageUpdate: (i: number, patch: Partial<PageOverrideInput>) => void;
  onPageDelete: (i: number) => void;
  onPageMove: (i: number, dir: -1 | 1) => void;
  onAddPages: (newPages: PageOverrideInput[]) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplatePagesSection: React.FC<PagesSectionProps> = ({
  pages,
  onPageUpdate,
  onPageDelete,
  onPageMove,
  onAddPages,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const normSlug = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');

  const alreadyAddedSlugs = useMemo(
    () => new Set(pages.map((p) => p.slug)),
    [pages],
  );

  // Index of the page currently being edited in-place. When non-null, the
  // card expands to show a sub-form with the editable fields (Path, Name,
  // Icon SVG, plus the CustomPageStudio for custom pages). Clicking Save
  // collapses it again. Mirrors the editor UX from the rest of the panel.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // ---- Add pages modal ------------------------------------------------------
  // Single entry point. Lists custom pages from the central Instance Pages
  // library (GET /api/instance-pages/, backed by instance_pages/pages/*.json).
  // Picking entries appends a `kind: 'custom'` row to the parent's `pages`
  // array — so they ship in the template spec and, on instance deploy, in
  // instance.Config. The instance sidebar / InstanceTabs then render exactly
  // those pages; the `instancePageSpecEnabled` / `isPageAllowed` guards block
  // everything else.
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [instancePages, setInstancePages] = useState<InstancePage[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSearch, setImportSearch] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  const openImportModal = () => {
    setImportModalOpen(true);
    setSelectedSlugs(new Set());
    setImportSearch('');
    setImportError('');
    if (instancePages.length === 0) {
      loadInstancePages();
    }
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setSelectedSlugs(new Set());
    setImportSearch('');
  };

  const toggleImportSelection = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const loadInstancePages = useCallback(async () => {
    setImportLoading(true);
    setImportError('');
    try {
      const fetched = await listInstancePages();
      setInstancePages(fetched);
    } catch (e: any) {
      setImportError(e?.response?.data || 'Failed to load instance pages');
    } finally {
      setImportLoading(false);
    }
  }, []);

  const handleConfirmImport = () => {
    const additions: PageOverrideInput[] = [];
    // Slugs already on the parent's pages array — skip those to avoid
    // adding the same page twice. Legacy `kind: 'builtin'` rows (pre-
    // conversion stubs with no content) are skipped too — every importable
    // page is a custom row now.
    const skip = new Set<string>(alreadyAddedSlugs);
    for (const p of instancePages) {
      if (!selectedSlugs.has(p.slug) || skip.has(p.slug)) continue;
      if (p.kind === 'builtin') continue;
      additions.push({
        slug: p.slug,
        original_slug: '',
        enabled: true,
        label: p.name,
        icon_svg: p.icon_svg || '',
        kind: 'custom',
        content_type: (['html', 'markdown', 'blocks'].includes(p.content_type) ? p.content_type : 'markdown') as PageOverride['content_type'],
        content_html: p.content_html || '',
        content_markdown: p.content_markdown || '',
        content_blocks: p.content_blocks || '',
        // Multi-page support: sub-pages stay INSIDE the parent row (effective
        // route "<slug>/<path>", e.g. files/edit) so they never show up as
        // separate top-level tabs — the tab bar lists the parent page only.
        ...(parseSubPages(p.sub_pages).length > 0
          ? {
              sub_pages: parseSubPages(p.sub_pages).map((sub) => ({
                path: sub.path,
                name: sub.name,
                content_type: (['html', 'markdown', 'blocks'].includes(sub.content_type) ? sub.content_type : 'html') as 'html' | 'markdown' | 'blocks',
                content_html: sub.content_html || '',
                content_markdown: sub.content_markdown || '',
                content_blocks: sub.content_blocks || '',
              })),
            }
          : {}),
      });
      skip.add(p.slug);
    }
    if (additions.length > 0) {
      onAddPages(additions);
    }
    closeImportModal();
  };

  const q = importSearch.trim().toLowerCase();
  const filteredInstancePages = useMemo(() => {
    const customOnly = instancePages.filter((p) => p.kind !== 'builtin');
    if (!q) return customOnly;
    return customOnly.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q),
    );
  }, [instancePages, q]);

  const toImportCount = useMemo(
    () => instancePages.filter((p) => selectedSlugs.has(p.slug) && !alreadyAddedSlugs.has(p.slug)).length,
    [instancePages, selectedSlugs, alreadyAddedSlugs],
  );

  return (
    <>
      {/* Section I: Instance Panel Pages */}
      <div className={sectionCls}>
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Section I · Instance Panel Pages</h4>
            <p className="text-xs text-gray-500 mt-1">Pick which pages appear in the instance sidebar and configure them.</p>
          </div>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center gap-2 text-sm bg-sky-600/90 text-white px-3 py-1.5 rounded hover:bg-sky-500 shrink-0"
            title="Add built-in pages (Home, Files, Network, …) or import custom pages from the Instance Pages library"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add pages
          </button>
        </div>

        <div className="space-y-3">
          {pages.map((p, i) => {
            const defLabel = p.slug === '.' ? 'Home' : p.slug;
            const isEditing = editingIdx === i;
            const iconSvg = p.icon_svg || '';
            return (
              <div
                key={p.slug + ':' + i}
                className={`ks-card ks-form-card rounded-md overflow-hidden ${p.enabled ? '' : 'opacity-60'}`}
              >
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  {/* Up/Down reorder arrows. Hidden for the first / last
                      row. These are the "two buttons on the left side"
                      the user asked for; the position in the array
                      decides the instance-tab serial number. */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label="Move page up"
                      onClick={() => onPageMove(i, -1)}
                      disabled={i === 0}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Move page down"
                      onClick={() => onPageMove(i, 1)}
                      disabled={i === pages.length - 1}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>

                  {/* Icon. The page's custom icon (from the library import),
                      a generic placeholder when not set. */}
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-white/5 border border-white/10">
                    {iconSvg ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-5 h-5 text-emerald-300"
                        dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(iconSvg) }}
                      />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-gray-500">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v8" />
                        <path d="M8 12h8" />
                      </svg>
                    )}
                  </div>

                  {/* Name + path. The Name is the prominent label; the
                      `/path` shows below it in small gray monospace —
                      exactly the "Icon | Name (below /path gray small)"
                      card the user asked for. The instance-tab serial is
                      the position in the array (1-based, implicit). */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {p.label.trim() || defLabel}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide bg-emerald-900/30 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded">
                        custom
                      </span>
                    </div>
                    <code className="block text-[11px] text-gray-500 font-mono mt-1 truncate">
                      /{p.slug === '.' ? '' : p.slug}
                    </code>
                  </div>

                  {/* 3-dot menu: Edit / Remove. Edit opens an inline
                      sub-form (see below); Remove drops the page. */}
                  <CardMenu
                    ariaLabel={`Actions for page ${p.label || defLabel}`}
                    items={[
                      {
                        key: 'edit',
                        label: isEditing ? 'Close editor' : 'Edit',
                        tone: 'default',
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        ),
                      },
                      {
                        key: 'remove',
                        label: 'Remove',
                        tone: 'danger',
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        ),
                      },
                    ]}
                    onSelect={(key) => {
                      if (key === 'edit') {
                        setEditingIdx(isEditing ? null : i);
                      } else if (key === 'remove') {
                        if (editingIdx !== null && editingIdx >= i) {
                          setEditingIdx(null);
                        }
                        onPageDelete(i);
                      }
                    }}
                  />
                </div>

                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className={labelCls}>Path (/path)</label>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-sm">/</span>
                          <input
                            value={p.slug === '.' ? '' : p.slug}
                            onChange={(e) => {
                              const v = e.target.value;
                              onPageUpdate(i, { slug: v === '' ? '.' : normSlug(v) });
                            }}
                            placeholder="my-page (empty = home)"
                            className={monoCls + ' flex-1'}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Name</label>
                        <input
                          value={p.label}
                          onChange={(e) => onPageUpdate(i, { label: e.target.value })}
                          placeholder={defLabel}
                          className={glassFieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Custom icon SVG (inner markup)</label>
                        <textarea
                          value={p.icon_svg}
                          onChange={(e) => onPageUpdate(i, { icon_svg: e.target.value })}
                          placeholder='<path d="M3 12h18" />'
                          rows={2}
                          className={monoCls + ' text-xs'}
                        />
                      </div>
                    </div>
                    <CustomPageStudio
                      page={{
                        content_type: p.content_type,
                        content_blocks: p.content_blocks,
                        content_html: p.content_html,
                        content_markdown: p.content_markdown,
                      } as { content_type?: string; content_blocks?: string; content_html?: string; content_markdown?: string }}
                      onChange={(patch: Partial<{ content_type: string; content_blocks: string; content_html: string; content_markdown: string }>) =>
                        onPageUpdate(i, {
                          content_type: patch.content_type as PageOverride['content_type'],
                          content_blocks: patch.content_blocks,
                          content_html: patch.content_html,
                          content_markdown: patch.content_markdown,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {pages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No pages configured yet.</p>
            <p className="text-xs mt-1">Click <strong className="text-sky-300">Add pages</strong> to import pages (Home / Files / Terminal / …) from the Instance Pages library.</p>
          </div>
        )}

        {/* Modal — single entry point. Lists custom pages from the
            Instance Pages library. Selected entries get appended to the
            parent's `pages` array as `kind: 'custom'` rows so they ship in
            the template spec and, on instance deploy, in instance.Config. */}
        <Modal
          open={importModalOpen}
          onClose={closeImportModal}
          title="Add pages"
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <input
              type="text"
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
              placeholder="Search by name, slug or category…"
              className={glassFieldClass + ' w-full'}
              aria-label="Search pages"
              autoFocus
            />

            {importError && (
              <div className="text-xs text-red-400 border border-red-700/40 rounded px-3 py-2 bg-red-900/20">
                {importError}
              </div>
            )}

            <div className="ks-card ks-form-card rounded-md max-h-[50vh] overflow-y-auto divide-y divide-white/5">
              {importLoading && (
                <div className="px-4 py-4 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading pages">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 w-1/3 rounded bg-white/10" style={{ animationDelay: `${i * 120}ms` }} />
                      <div className="h-3 flex-1 rounded bg-white/[0.06]" style={{ animationDelay: `${i * 120 + 60}ms` }} />
                    </div>
                  ))}
                </div>
              )}
              {!importLoading && filteredInstancePages.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No pages match your search.
                </div>
              )}

              {!importLoading && filteredInstancePages.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 bg-white/[0.02] sticky top-0">
                    Pages (from Instance Pages library)
                  </div>
                  {filteredInstancePages.map((p) => {
                    const already = alreadyAddedSlugs.has(p.slug);
                    const isSelected = selectedSlugs.has(p.slug);
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        disabled={already}
                        onClick={() => !already && toggleImportSelection(p.slug)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                          already
                            ? 'opacity-50 cursor-not-allowed'
                            : isSelected
                              ? 'bg-emerald-900/20 border-l-2 border-emerald-500'
                              : 'hover:bg-white/5'
                        }`}
                        aria-pressed={isSelected}
                        aria-disabled={already}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-emerald-900/40 border border-emerald-700/60'
                              : 'bg-emerald-900/30 border border-emerald-700/40'
                          }`}
                        >
                          {p.icon_svg ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-5 h-5 text-emerald-300"
                              dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(p.icon_svg) }}
                            />
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-5 h-5 text-emerald-300"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <line x1="3" y1="9" x2="21" y2="9" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-white truncate">{p.name}</span>
                            <code className="text-[11px] text-gray-500 font-mono">/{p.slug}</code>
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">{p.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {already ? (
                            <span className="text-xs px-2 py-1 rounded border border-white/10 text-gray-500">
                              Already added
                            </span>
                          ) : (
                            <span
                              className={`text-xs px-2 py-1 rounded border transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                                  : 'border-white/10 text-gray-400'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          )}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`w-5 h-5 ${isSelected ? 'text-emerald-400' : 'text-gray-500'}`}
                          >
                            {isSelected ? (
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            ) : (
                              <circle cx="12" cy="12" r="10" />
                            )}
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={closeImportModal}
                className="px-4 py-2 text-sm border border-white/10 text-gray-300 rounded hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={selectedSlugs.size === 0}
                className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedSlugs.size === 0
                  ? 'Select pages to add'
                  : `Add ${selectedSlugs.size} page${selectedSlugs.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};