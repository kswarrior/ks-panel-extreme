import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  listInstancePages,
  createInstancePage,
  updateInstancePage,
  executePageAction,
  listInstances,
  type InstancePageAction,
} from '@/shared/api/admin';
import type { Instance } from '@/features/instances/types/instance';
import type {
  InstancePage,
  CreateInstancePagePayload,
  UpdateInstancePagePayload,
} from '@/shared/types/instancePage';
import { parseSubPages } from '@/shared/types/instancePage';
import { PAGE_STARTERS, type PageStarter } from '../templates/pageStarters';
import { parseConfig } from '@/shared/hooks/useInstance';
import { useConfirm } from '@/shared/stores/confirmStore';
import FormPage from '@/shared/components/forms/FormPage';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';
import type { PageContent } from '@/shared/components/ui/CustomPageView';
import type { PageStudioTabId } from '@/features/instance-pages/types/pageStudio';
import { sectionCls } from '@/features/instance-pages/types/pageStudio';
import type { ActionRow, SubPageRow, ComponentRow } from '@/features/instance-pages/types/pageStudio';
import {
  getErrorMessage,
  blankAction,
  actionsToDefs,
  defsToActions,
  blankSub,
  subRowsFromJSON,
  subsToJSON,
  validateSubRows,
  blankComponent,
  compRowsFromJSON,
  compsToJSON,
  validateCompRows,
} from '@/features/instance-pages/utils/pageStudioUtils';
import {
  PageStudioTabs,
  PageStudioTemplatesSection,
  PageStudioContentSection,
  PageStudioSubPagesSection,
  PageStudioActionsSection,
  PageStudioComponentsSection,
  PageStudioPreviewSection,
  PageStudioSettingsSection,
} from '@/features/instance-pages/components/PageStudio';

// ---------------------------------------------------------------------------
// Main Studio component — mirrors panel/frontend/src/features/templates/pages/TemplateForm.tsx
//
// Layout:
//   FormPage
//     grid [220px tabs | form body]
//       PageStudioTabs (left rail, sticky)
//       per-tab Section components (right, one visible at a time)
//
// Each Section lives under components/PageStudio/* so this file stays thin
// like TemplateForm.tsx — only state + wiring, no inline tab markup.
// Comments use the same "Section X · ..." headings as TemplateForm's
// Template*Section components.
// ---------------------------------------------------------------------------

const InstancePageStudio: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const pageId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<PageStudioTabId>('templates');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  // Test-execute output, keyed to the row that produced it so the result only
  // renders inside that action's card.
  const [actionResult, setActionResult] = useState<{ id: string; stdout: string; stderr: string; exit_code: number } | null>(null);

  // Page metadata + content
  const [page, setPage] = useState<Partial<InstancePage>>({
    name: '',
    description: '',
    slug: '',
    kind: 'custom' as InstancePage['kind'],
    category: '',
    type: '',
    content_type: 'html',
    content_html: '',
    content_markdown: '',
    content_blocks: '',
    icon_svg: '',
    actions: '',
  });

  // Saved-action rows (edited on the Actions tab, persisted with the page).
  const [actions, setActions] = useState<ActionRow[]>([blankAction()]);

  // Component rows (edited on the Components tab)
  const [components, setComponents] = useState<ComponentRow[]>([]);

  // Sub-page rows (edited on the Sub-pages tab) — extra routes that ship
  // with this page (multi-page support, e.g. files/edit).
  const [subs, setSubs] = useState<SubPageRow[]>([]);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  // Preview target: 'main' or a sub-page row id.
  const [previewTarget, setPreviewTarget] = useState<string>('main');

  // Full-screen preview: keeps the panel shell (header + sidebar) visible and
  // hides every other piece of studio chrome. The overlay is measured over
  // the app's <main> region so header and sidebar are never covered.
  const [fullPreview, setFullPreview] = useState(false);
  const [mainRect, setMainRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!fullPreview) return;
    const measure = () => {
      const main = document.querySelector('main');
      if (!main) { setMainRect(null); return; }
      const r = main.getBoundingClientRect();
      setMainRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullPreview]);
  useEffect(() => {
    if (!fullPreview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullPreview(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullPreview]);
  // Leaving the Preview tab always drops out of full screen so chrome returns.
  useEffect(() => {
    if (activeTab !== 'preview' && fullPreview) setFullPreview(false);
  }, [activeTab, fullPreview]);

  // Blocks visual editor state
  const [blocksMode, setBlocksMode] = useState<'visual' | 'json'>('visual');

  // Preview / test target
  const [instances, setInstances] = useState<Instance[]>([]);
  const [previewInstanceId, setPreviewInstanceId] = useState<number | null>(null);

  // Templates tab filter
  const [starterQuery, setStarterQuery] = useState('');

  const isBuiltin = page.kind === 'builtin';

  // Load page (edit mode) + instances for preview/test.
  useEffect(() => {
    let cancelled = false;
    listInstances().then((list) => { if (!cancelled) setInstances(list); }).catch(() => { /* preview picker just stays empty */ });
    if (!isEdit || pageId == null) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    listInstancePages()
      .then((pages) => {
        if (cancelled) return;
        const found = pages.find((p) => p.id === pageId);
        if (found) {
          setPage({ ...found });
          setActions(defsToActions(found.actions));
          setSubs(subRowsFromJSON(found.sub_pages));
          setComponents(compRowsFromJSON(found.components));
        } else {
          setError('Instance page not found');
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load page'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageId, isEdit]);

  useEffect(() => {
    if (!isEdit) setLoading(false);
  }, [isEdit]);

  const currentContent = useMemo(() => {
    if (page.content_type === 'html') return page.content_html ?? '';
    if (page.content_type === 'markdown') return page.content_markdown ?? '';
    return page.content_blocks ?? '';
  }, [page.content_type, page.content_html, page.content_markdown, page.content_blocks]);

  const actionDefs = useMemo(() => actionsToDefs(actions), [actions]);

  const onChange = <K extends keyof InstancePage>(key: K, value: InstancePage[K]) => {
    setPage((p) => ({ ...p, [key]: value }));
    if (key === 'name' || key === 'slug') setError('');
  };

  useEffect(() => {
    if (error && page.name?.trim() && page.slug?.trim()) {
      setError('');
    }
  }, [page.name, page.slug]);

  const handleContentChange = (value: string) => {
    if (page.content_type === 'html') onChange('content_html', value);
    else if (page.content_type === 'markdown') onChange('content_markdown', value);
    else onChange('content_blocks', value);
  };

  const applyStarter = async (s: PageStarter) => {
    setError('');
    const hasContent = Boolean((page.content_html ?? '') || (page.content_markdown ?? '') || (page.content_blocks ?? ''));
    if (hasContent && !(await confirm({ title: 'Apply template', message: `Replace the current draft with the "${s.name}" template?`, tone: 'warning', confirmLabel: 'Replace' }))) return;
    const type = s.contentType ?? 'html';
    setPage((p) => ({
      ...p,
      name: p.name || s.name,
      slug: p.slug || s.slug,
      category: p.category || s.category,
      description: s.description,
      icon_svg: s.iconSvg,
      content_type: type,
      content_html: type === 'html' ? s.html : '',
      content_markdown: type === 'markdown' ? (s.markdown ?? '') : '',
      content_blocks: type === 'blocks' ? (s.blocks ?? '') : '',
      actions: JSON.stringify(s.actions ?? []),
    }));
    // Load the template's saved actions into the Actions tab (blank row when
    // the template ships none).
    setActions(defsToActions(JSON.stringify(s.actions ?? [])));
    // Replace any previously loaded sub-pages so switching templates can't
    // leave stale routes from another template behind.
    setSubs(s.subPages ? subRowsFromJSON(JSON.stringify(s.subPages)) : []);
    setEditingSubId(null);
    setPreviewTarget('main');
    setNotice(
      s.actions?.length
        ? `Template "${s.name}" applied — full code loaded in Content and ${s.actions.length} saved action(s) in Actions.`
        : `Template "${s.name}" applied — full code loaded in Content.`,
    );
    setActiveTab('editor');
  };

  const addAction = () => setActions((a) => [...a, blankAction()]);
  const removeAction = (actionId: string) => {
    if (actions.length <= 1) return;
    setActions((a) => a.filter((x) => x.id !== actionId));
  };
  const updateAction = (actionId: string, patch: Partial<ActionRow>) => {
    setActions((a) => a.map((x) => (x.id === actionId ? { ...x, ...patch } : x)));
  };

  // ---- Component row handlers ---------------------------------------------
  const blankComponent = (): ComponentRow => ({ id: Math.random().toString(36).slice(2), name: '', type: 'html', description: '', content: '' });
  const addComponent = () => setComponents((c) => [...c, blankComponent()]);
  const removeComponent = (id: string) => setComponents((c) => c.filter((x) => x.id !== id));
  const updateComponent = (id: string, patch: Partial<ComponentRow>) => setComponents((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // ---- Sub-page row handlers ----------------------------------------------
  const addSub = () => {
    const row = blankSub();
    setSubs((s) => [...s, row]);
    setEditingSubId(row.id);
  };
  const updateSub = (subId: string, patch: Partial<SubPageRow>) => {
    setSubs((s) => s.map((x) => (x.id === subId ? { ...x, ...patch } : x)));
  };
  const removeSub = (subId: string) => {
    setSubs((s) => s.filter((x) => x.id !== subId));
    if (editingSubId === subId) setEditingSubId(null);
    if (previewTarget === subId) setPreviewTarget('main');
  };
  const moveSub = (idx: number, dir: -1 | 1) => {
    setSubs((s) => {
      const j = idx + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const previewInstance = useMemo(
    () => instances.find((i) => i.id === previewInstanceId) ?? null,
    [instances, previewInstanceId],
  );

  const previewContext = useMemo(() => {
    if (!previewInstance) return null;
    return {
      id: previewInstance.id,
      name: previewInstance.name,
      kind: previewInstance.kind,
      status: previewInstance.status,
      template_id: previewInstance.template_id,
      template_name: previewInstance.template_name ?? null,
      node_id: previewInstance.node_id,
      node_name: previewInstance.node_name ?? null,
      owner_id: previewInstance.owner_id ?? null,
      owner_name: previewInstance.owner_name ?? null,
      config: previewInstance.config ? parseConfig(previewInstance.config) : {},
      external_id: previewInstance.external_id ?? '',
      created_at: previewInstance.created_at ?? '',
      updated_at: previewInstance.updated_at ?? '',
    };
  }, [previewInstance]);

  // Preview renders the main page or the selected sub-page (multi-page).
  const editingSub = useMemo(() => subs.find((s) => s.id === previewTarget) ?? null, [subs, previewTarget]);

  const previewContent = useMemo<PageContent>(() => {
    const src = editingSub;
    if (src) {
      return {
        type: src.content_type as PageContent['type'],
        html: src.content_html,
        markdown: src.content_markdown,
        blocks: src.content_blocks,
      };
    }
    return {
      type: (page.content_type || 'html') as PageContent['type'],
      html: page.content_html,
      markdown: page.content_markdown,
      blocks: page.content_blocks,
      actions: actionDefs.length ? actionDefs : undefined,
    };
  }, [editingSub, page.content_type, page.content_html, page.content_markdown, page.content_blocks, actionDefs]);

  // Test-execute a saved action against the selected instance. The backend
  // only runs it when this page's slug is enabled in that instance's spec.
  const testExecute = async (row: ActionRow) => {
    if (!pageId) { setError('Save the page first to test its actions.'); return; }
    if (!previewInstanceId) { setError('Pick an instance on the Preview tab to test against.'); return; }
    const def = actionDefs.find((d) => d.name === row.name.trim());
    if (!def) { setError('The action needs a name before it can be tested.'); return; }
    setExecutingAction(row.id);
    setActionResult(null);
    setError('');
    try {
      const res = await executePageAction(pageId, previewInstanceId, def as InstancePageAction);
      setActionResult({ id: row.id, stdout: res.stdout ?? '', stderr: res.stderr ?? '', exit_code: res.exit_code ?? -1 });
    } catch (e: any) {
      setActionResult({ id: row.id, stdout: '', stderr: getErrorMessage(e, 'Action failed'), exit_code: -1 });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    if (isBuiltin) { setError('Built-in pages cannot be edited. Create a custom page instead.'); return; }
    if (!page.name?.trim() || !page.slug?.trim()) { setError('Name and slug are required before saving.'); return; }
    if (page.slug.trim() !== '.' && !/^[a-z0-9][a-z0-9-._]*$/i.test(page.slug.trim())) { setError('Slug may contain letters, numbers, dots, dashes and underscores only ("." is the reserved Home slug).'); return; }
    const subErr = validateSubRows(subs);
    if (subErr) { setError(subErr); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: page.name!.trim(),
        description: page.description ?? '',
        slug: page.slug!.trim(),
        kind: page.kind ?? 'custom',
        category: page.category ?? '',
        type: page.type ?? '',
        content_type: page.content_type || 'html',
        content_html: page.content_html ?? '',
        content_markdown: page.content_markdown ?? '',
        content_blocks: page.content_blocks ?? '',
        icon_svg: page.icon_svg ?? '',
        actions: JSON.stringify(actionDefs),
        sub_pages: subsToJSON(subs),
      } as unknown as UpdateInstancePagePayload;
      if (isEdit && pageId != null) {
        await updateInstancePage(pageId, payload as UpdateInstancePagePayload);
      } else {
        await createInstancePage(payload as unknown as CreateInstancePagePayload);
      }
      navigate('/instance-pages');
    } catch (e: any) {
      setError(getErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Import / export ----------------------------------------------------
  const exportJson = () => {
    const data: Record<string, unknown> = {
      name: page.name ?? '',
      slug: page.slug ?? '',
      kind: page.kind ?? 'custom',
      category: page.category ?? '',
      type: page.type ?? '',
      description: page.description ?? '',
      content_type: page.content_type || 'html',
      content_html: page.content_html ?? '',
      content_markdown: page.content_markdown ?? '',
      content_blocks: page.content_blocks ?? '',
      icon_svg: page.icon_svg ?? '',
      actions: actionDefs,
    };
    const subDefs = parseSubPages(subsToJSON(subs));
    if (subDefs.length > 0) data.pages = subDefs;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.slug || 'instance-page'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('not an object');
      setPage((p) => ({
        ...p,
        name: typeof data.name === 'string' ? data.name : p.name,
        slug: typeof data.slug === 'string' ? data.slug : p.slug,
        // The legacy "builtin" kind is rejected by the API (migration 046);
        // imports coerce to custom so a stale JSON file can't brick the save.
        kind: 'custom' as InstancePage['kind'],
        category: typeof data.category === 'string' ? data.category : p.category,
        type: typeof data.type === 'string' ? data.type : p.type,
        description: typeof data.description === 'string' ? data.description : p.description,
        content_type: ['html', 'markdown', 'blocks'].includes(data.content_type) ? data.content_type : p.content_type,
        content_html: typeof data.content_html === 'string' ? data.content_html : p.content_html,
        content_markdown: typeof data.content_markdown === 'string' ? data.content_markdown : p.content_markdown,
        content_blocks: typeof data.content_blocks === 'string' ? data.content_blocks : p.content_blocks,
        icon_svg: typeof data.icon_svg === 'string' ? data.icon_svg : p.icon_svg,
        actions: Array.isArray(data.actions) ? JSON.stringify(data.actions) : p.actions,
      }));
      if (Array.isArray(data.actions)) setActions(defsToActions(JSON.stringify(data.actions)));
      if (Array.isArray(data.pages)) {
        const rows = subRowsFromJSON(JSON.stringify(data.pages));
        setSubs(rows);
        setEditingSubId(null);
      }
      setNotice('Page JSON imported into the form. Review and save.');
    } catch (e: any) {
      setError(`Import failed: ${e?.message || e}`);
    }
  };

  const filteredStarters = useMemo(() => {
    const q = starterQuery.trim().toLowerCase();
    if (!q) return PAGE_STARTERS;
    return PAGE_STARTERS.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
    );
  }, [starterQuery]);

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Instance Pages', to: '/instance-pages' }, { label: isEdit ? 'Edit Page' : 'New Page' }]}
        saving={false}
        submitLabel="Save"
        maxWidth="max-w-4xl"
      >
        <FormSkeleton fields={6} />
      </FormPage>
    );
  }

  const contentType = (page.content_type || 'html') as 'html' | 'markdown' | 'blocks';

  // Preview panel shared by the normal Preview tab and full-screen mode.
  // Delegated to PageStudioPreviewSection for consistency with template split.
  const previewSectionProps = {
    instances,
    previewInstanceId,
    onPreviewInstanceChange: setPreviewInstanceId,
    previewTarget,
    onPreviewTargetChange: setPreviewTarget,
    subs,
    pageName: page.name ?? '',
    pageSlug: page.slug ?? '',
    isBuiltin,
    isEdit,
    previewInstance,
    previewContext,
    previewContent,
    editingSub,
    contentType,
    currentContent,
    fullPreview,
    onToggleFullPreview: () => setFullPreview((v) => !v),
    sectionCls,
  };

  // Full-screen preview: only header + sidebar (the app shell around this
  // overlay) stay visible — every other studio element is not rendered.
  if (fullPreview && activeTab === 'preview') {
    return (
      <div
        className="fixed z-40 overflow-hidden"
        style={mainRect ?? undefined}
      >
        <PageStudioPreviewSection {...previewSectionProps} />
      </div>
    );
  }

  return (
    <FormPage
      crumbs={[{ label: 'Instance Pages', to: '/instance-pages' }, { label: isEdit ? 'Edit Page' : 'New Page' }]}
      saving={saving}
      submitLabel={isEdit ? 'Save' : 'Create'}
      onSubmit={handleSave}
      maxWidth="max-w-4xl"
      disabled={isBuiltin}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <div className="border border-white/10 rounded-lg p-2 bg-black/20">
          <PageStudioTabs tab={activeTab} onChange={setActiveTab} isBuiltin={isBuiltin} />
        </div>

        <div className="space-y-4">
          {error && (
            <p className="text-red-400 flex items-start justify-between gap-2 border border-red-700/40 rounded px-3 py-2 bg-red-900/20">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs text-gray-400 hover:text-white">dismiss</button>
            </p>
          )}
          {notice && !error && (
            <p className="text-emerald-300 flex items-start justify-between gap-2 border border-emerald-700/40 rounded px-3 py-2 bg-emerald-900/20">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-xs text-gray-400 hover:text-white">dismiss</button>
            </p>
          )}

          {isBuiltin && isEdit && (
            <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
              <p className="font-semibold">Built-in Page (Read-Only)</p>
              <p className="mt-1">
                Built-in pages are provided by the panel and cannot be edited here. To customize one for a
                specific template, use the <strong>Pages</strong> tab in the <strong>Template</strong> editor.
              </p>
            </div>
          )}

          {/* ============================== TEMPLATES ============================== */}
          {activeTab === 'templates' && !isBuiltin && (
            <PageStudioTemplatesSection
              search={starterQuery}
              onSearchChange={setStarterQuery}
              starters={filteredStarters}
              query={starterQuery}
              onApply={applyStarter}
              sectionCls={sectionCls}
            />
          )}

          {/* ============================== CONTENT ============================== */}
          {activeTab === 'editor' && !isBuiltin && (
            <PageStudioContentSection
              contentType={contentType}
              onContentTypeChange={(t) => { onChange('content_type', t); setBlocksMode('visual'); }}
              currentContent={currentContent}
              onContentChange={handleContentChange}
              contentBlocks={page.content_blocks ?? ''}
              onBlocksChange={(v) => {
                setPage((p) => ({ ...p, content_blocks: v }));
                if (page.content_type !== 'blocks') onChange('content_type', 'blocks');
              }}
              blocksMode={blocksMode}
              onBlocksModeChange={setBlocksMode}
              actionNames={actionDefs.map((d) => d.name)}
              onCopy={() => navigator.clipboard.writeText(currentContent)}
              onExport={exportJson}
              onImportClick={() => importFileRef.current?.click()}
              sectionCls={sectionCls}
            />
          )}

          {/* ============================== SUB-PAGES ============================== */}
          {activeTab === 'subpages' && !isBuiltin && (
            <PageStudioSubPagesSection
              subs={subs}
              editingSubId={editingSubId}
              onEditingChange={setEditingSubId}
              onAdd={addSub}
              onUpdate={updateSub}
              onRemove={removeSub}
              onMove={moveSub}
              pageSlug={page.slug}
              sectionCls={sectionCls}
            />
          )}

          {/* ============================== ACTIONS ============================== */}
          {activeTab === 'actions' && !isBuiltin && (
            <PageStudioActionsSection
              actions={actions}
              onAdd={addAction}
              onRemove={removeAction}
              onUpdate={updateAction}
              onTest={testExecute}
              pageId={pageId}
              previewInstanceId={previewInstanceId}
              executingAction={executingAction}
              actionResult={actionResult}
              sectionCls={sectionCls}
            />
          )}

          {/* ============================== COMPONENTS ============================== */}
          {activeTab === 'components' && !isBuiltin && (
            <PageStudioComponentsSection
              components={components}
              onAdd={addComponent}
              onRemove={removeComponent}
              onUpdate={updateComponent}
              sectionCls={sectionCls}
            />
          )}

          {/* ============================== PREVIEW ============================== */}
          {activeTab === 'preview' && (
            <PageStudioPreviewSection {...previewSectionProps} />
          )}

          {/* ============================== SETTINGS ============================== */}
          {activeTab === 'settings' && !isBuiltin && (
            <PageStudioSettingsSection
              page={page}
              onChange={onChange}
              onExport={exportJson}
              onImportClick={() => importFileRef.current?.click()}
              sectionCls={sectionCls}
            />
          )}

          {/* Builtin read-only preview */}
          {activeTab === 'preview' && isBuiltin && (
            <div className={sectionCls}>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Preview (read-only)</h4>
              <p className="text-xs text-gray-500">Built-in pages render through their compiled components inside the instance panel; there is nothing to preview here.</p>
            </div>
          )}
          {activeTab !== 'preview' && isBuiltin && (
            <div className={sectionCls}>
              <p className="text-sm text-gray-400">This built-in page is read-only. Switch to Preview or manage it per-template in the Template editor&apos;s Pages tab.</p>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input for JSON import — triggered from Content + Settings */}
      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = '';
        }}
      />
    </FormPage>
  );
};

export default InstancePageStudio;
