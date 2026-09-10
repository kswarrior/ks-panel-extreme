import React, { useCallback, useState, useMemo } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import Modal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import type { PageOverride } from '@/features/templates/types/templateForm';
import { pageOverrideFromInstancePage } from '@/features/templates/utils/templateFormUtils';
import { listInstancePages, type InstancePage } from '@/shared/api/admin';
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
}) => {
  const alreadyAddedSlugs = useMemo(
    () => new Set(pages.map((p) => p.slug)),
    [pages],
  );

  const [configureIdx, setConfigureIdx] = useState<number | null>(null);

  // ---- Add pages modal ------------------------------------------------------
  // Single entry point. Lists custom pages from the Instance Pages library
  // (GET /api/instance-pages/, the DB rows authored in the Studio or imported).
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
    // page is a custom row now. The shared copier ships bundles only for
    // green builds so a failed/stale build links source-only.
    const skip = new Set<string>(alreadyAddedSlugs);
    for (const p of instancePages) {
      if (!selectedSlugs.has(p.slug) || skip.has(p.slug)) continue;
      if (p.kind === 'builtin') continue;
      additions.push(pageOverrideFromInstancePage(p));
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
            className="ks-btn-header ks-icon-btn"
            title="Add pages from the Instance Pages library (Home, Files, Docker manager, …)"
            aria-label="Add pages"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          {pages.map((p, i) => {
            const defLabel = p.slug === '.' ? 'Home' : p.slug;
            const iconSvg = p.icon_svg || '';
            // Show Configure when the page defines vars OR still carries
            // stored values (e.g. a var was removed in the Studio — the
            // operator needs the modal to inspect/clear orphans).
            const hasConfigure = (p.configure?.length ?? 0) > 0 || Object.keys(p.config ?? {}).length > 0;
            return (
              <div
                key={p.slug + ':' + i}
                className={`ks-card ks-form-card ks-page-card rounded-md overflow-hidden ${p.enabled ? '' : 'opacity-60'}`}
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
                      className="ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Move page down"
                      onClick={() => onPageMove(i, 1)}
                      disabled={i === pages.length - 1}
                      className="ks-btn-header ks-icon-btn disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>

                  {/* Icon. The page's custom icon (from the library import),
                      a generic placeholder when not set. */}
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-white/5 border border-white/10" style={(p as any).icon_color ? { color: (p as any).icon_color } : undefined}>
                    {iconSvg ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-5 h-5"
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

                  {/* 3-dot menu: Configure (when the page defines configure
                      vars in the Studio Configure tab) / Remove. */}
                  <CardMenu
                    ariaLabel={`Actions for page ${p.label || defLabel}`}
                    items={[
                      ...(hasConfigure
                        ? [
                            {
                              key: 'configure',
                              label: 'Configure',
                              tone: 'default' as const,
                              icon: (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
                              ),
                            },
                          ]
                        : []),
                      {
                        key: 'remove',
                        label: 'Remove',
                        tone: 'danger' as const,
                        icon: (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        ),
                      },
                    ]}
                    onSelect={(key) => {
                      if (key === 'configure') {
                        setConfigureIdx(i);
                      } else if (key === 'remove') {
                        if (configureIdx !== null && configureIdx >= i) {
                          setConfigureIdx(null);
                        }
                        onPageDelete(i);
                      }
                    }}
                  />
                </div>
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
                          style={(p as any).icon_color ? { color: (p as any).icon_color } : undefined}
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
                              className="w-5 h-5"
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

        {/* Configure modal — per-page values for the Studio Configure vars */}
        <Modal
          open={configureIdx !== null}
          onClose={() => setConfigureIdx(null)}
          title={configureIdx !== null ? `Configure ${pages[configureIdx]?.label || pages[configureIdx]?.slug || 'page'}` : 'Configure'}
          maxWidth="max-w-xl"
        >
          {configureIdx !== null && (() => {
            const p = pages[configureIdx];
            const vars = p.configure ?? [];
            if (vars.length === 0) return <p className="text-sm text-gray-500">This page has no configure variables.</p>;
            return (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Values entered here are stored in <code className="font-mono">spec.pages[].config</code> and available in the page as <code className="font-mono">{"{{config:NAME}}"}</code> or via <code className="font-mono">KSPageSDK.config</code>.</p>
                {vars.map((v) => {
                  const cur = (p.config?.[v.name] ?? v.default ?? '');
                  const opts = v.options ? v.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
                  return (
                    <div key={v.name} className="space-y-1">
                      <label className="block text-sm font-medium text-gray-300">
                        {v.label || v.name} <code className="text-xs text-gray-500 font-mono ml-1">{v.name}</code>
                        {v.required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {v.description && <p className="text-xs text-gray-500">{v.description}</p>}
                      {v.display === 'select' ? (
                        <select
                          value={cur}
                          onChange={(e) => {
                            const next: Record<string, string> = { ...(p.config ?? {}) };
                            next[v.name] = e.target.value;
                            onPageUpdate(configureIdx!, { config: next });
                          }}
                          className={glassFieldClass + ' w-full'}
                        >
                          <option value="">— {v.required ? 'required' : 'optional'} —</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          {/* keep current value even if not in options */}
                          {cur && !opts.includes(cur) && <option value={cur}>{cur}</option>}
                        </select>
                      ) : (v.display === 'checkbox' || v.display === 'toggle') ? (
                        (() => {
                          const isOn = cur === 'true' || cur === '1' || cur === 'on';
                          return (
                            <label className="inline-flex items-center gap-3 cursor-pointer">
                              <button
                                type="button"
                                onClick={() => {
                                  const next: Record<string, string> = { ...(p.config ?? {}) };
                                  next[v.name] = isOn ? 'false' : 'true';
                                  onPageUpdate(configureIdx!, { config: next });
                                }}
                                className={`relative w-11 h-6 rounded-full transition ${isOn ? 'bg-green-600' : 'bg-neutral-700'}`}
                                aria-pressed={isOn}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${isOn ? 'translate-x-5' : ''}`} />
                              </button>
                              <span className={`text-sm font-medium ${isOn ? 'text-green-400' : 'text-gray-400'}`}>{isOn ? 'On' : 'Off'}</span>
                              <span className="text-sm text-gray-500">{v.label || v.name}</span>
                            </label>
                          );
                        })()
                      ) : v.display === 'number' ? (
                        <input
                          type="number"
                          value={cur}
                          onChange={(e) => {
                            const next: Record<string, string> = { ...(p.config ?? {}) };
                            next[v.name] = e.target.value;
                            onPageUpdate(configureIdx!, { config: next });
                          }}
                          placeholder={v.default || v.rule || ''}
                          className={glassFieldClass + ' w-full font-mono'}
                        />
                      ) : (
                        <input
                          type="text"
                          value={cur}
                          onChange={(e) => {
                            const next: Record<string, string> = { ...(p.config ?? {}) };
                            next[v.name] = e.target.value;
                            onPageUpdate(configureIdx!, { config: next });
                          }}
                          placeholder={v.default || ''}
                          className={glassFieldClass + ' w-full font-mono'}
                        />
                      )}
                      {v.rule && <p className="text-[11px] text-gray-500">Rule: <code className="font-mono">{v.rule}</code></p>}
                    </div>
                  );
                })}
                <div className="flex justify-end pt-2">
                  <button type="button" onClick={() => setConfigureIdx(null)} className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-500">Done</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      </div>
    </>
  );
};