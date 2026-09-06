import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listTemplates, createTemplate, updateTemplate, listInstancePages, type InstancePage } from '@/shared/api/admin';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { parseSubPages, parsePageActions, parsePageComponents, parsePageConfigure } from '@/features/instance-pages/types/instancePage';
import type { Template } from '@/shared/types/instance';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import Modal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import {
  TemplateEnvironmentSection,
  TemplateEnvVariablesSection,
  TemplateActionsSection,
  TemplateInstallSection,
  TemplateRuntimeSection,
  TemplateLabelsDevicesSection,
  TemplateHealthcheckSection,
  TemplateControlsSection,
  TemplateSpecPreviewSection,
} from '@/features/templates/components/TemplateForm';
import { DEFAULT_INSTANCE_CONTROLS } from '@/features/instances/utils/instanceControls';
import { TagPicker, Toggle, TemplateTabs, CustomPageStudio } from '../components/TemplateFormComponents';
import IconColorPicker, { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';
import type {
  TemplateFormState,
  DriverKind,
  PortMapping,
  Mount,
  ResourceLimits,
  FeatureCaps,
  EnvVariable,
  InstallStep,
  TemplateAction,
  ActionStep,
  Label,
  Device,
  Healthcheck,
  Advanced,
  KvRuntime,
  MpRuntime,
  LxdRuntime,
  PageOverride,
  TemplateTabId,
  BlockRow,
} from '../types/templateForm';
import {
  emptyForm,
  TEMPLATE_TABS,
  BLOCK_LABELS,
} from '../types/templateForm';
import {
  serializeSpec,
  parseSpec,
  stripUnit,
} from '../utils/templateFormUtils';

const monoCls = glassFieldClass + ' font-mono ks-input-mono';
const labelCls = 'block text-sm font-medium text-gray-300 mb-1 ks-label';
const sectionCls = 'border border-white/10 rounded-lg p-4 space-y-4 bg-black/20 ks-form-group';
const addBtn = 'text-xs text-sky-300 hover:text-sky-200 underline';

// TemplatePagesImportModal is the single entry point for adding pages to a
// template. It lists custom pages from the Instance Pages library
// (/api/instance-pages/, the DB rows authored in the Studio or imported). The picked
// entries are passed back via onAddPages as `kind: 'custom'` rows so the
// parent can append them to the template's spec.pages.
interface TemplatePagesImportModalProps {
  open: boolean;
  onClose: () => void;
  existingSlugs: Set<string>;
  onAddPages: (pages: PageOverride[]) => void;
  loading: boolean;
  error: string;
  instancePages: InstancePage[];
  search: string;
  onSearchChange: (v: string) => void;
  selected: Set<string>;
  onToggle: (slug: string) => void;
}

const TemplatePagesImportModal: React.FC<TemplatePagesImportModalProps> = ({
  open,
  onClose,
  existingSlugs,
  onAddPages,
  loading,
  error,
  instancePages,
  search,
  onSearchChange,
  selected,
  onToggle,
}) => {
  const q = search.trim().toLowerCase();
  const filteredInstance = useMemo(() => {
    // Legacy `kind: 'builtin'` rows (pre-conversion stubs with no content)
    // are excluded from the picker — every importable page is a custom row.
    const customOnly = instancePages.filter((p) => p.kind !== 'builtin');
    if (!q) return customOnly;
    return customOnly.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q),
    );
  }, [instancePages, q]);

  const handleAdd = () => {
    const additions: PageOverride[] = [];
    // Slugs already on the parent's pages array — skip those to avoid
    // adding the same page twice.
    const skip = new Set<string>(existingSlugs);
    for (const p of instancePages) {
      if (!selected.has(p.slug) || skip.has(p.slug)) continue;
      if (p.kind === 'builtin') continue;
      additions.push({
        slug: p.slug,
        original_slug: '',
        enabled: true,
        label: p.name,
        icon_svg: p.icon_svg || '',
        icon_color: (p as any).icon_color || '',
        kind: 'custom',
        content_type: (['html', 'markdown', 'blocks'].includes(p.content_type) ? p.content_type : 'markdown') as PageOverride['content_type'],
        content_html: p.content_html || '',
        content_markdown: p.content_markdown || '',
        content_blocks: p.content_blocks || '',
        // Saved actions MUST ride along: the runtime allow-list matches
        // against the spec row's actions, so dropping them here made every
        // action on the page fail with 403 once deployed.
        ...(parsePageActions(p.actions).length > 0
          ? { actions: parsePageActions(p.actions) }
          : {}),
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
        ...(parsePageComponents(p.components).length > 0
          ? { components: parsePageComponents(p.components) }
          : {}),
        ...(parsePageConfigure((p as any).configure).length > 0
          ? { configure: parsePageConfigure((p as any).configure) }
          : {}),
      });
      skip.add(p.slug);
    }
    if (additions.length > 0) {
      onAddPages(additions);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add pages"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name, slug or category…"
          className={glassFieldClass + ' w-full'}
          aria-label="Search pages"
          autoFocus
        />

        {error && (
          <div className="text-xs text-red-400 border border-red-700/40 rounded px-3 py-2 bg-red-900/20">
            {error}
          </div>
        )}

        <div className="border border-white/10 rounded-md bg-black/30 max-h-[50vh] overflow-y-auto divide-y divide-white/5">
          {loading && (
            <div className="px-4 py-4 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading pages">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-1/3 rounded bg-white/10" style={{ animationDelay: `${i * 120}ms` }} />
                  <div className="h-3 flex-1 rounded bg-white/[0.06]" style={{ animationDelay: `${i * 120 + 60}ms` }} />
                </div>
              ))}
            </div>
          )}
          {!loading && filteredInstance.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No pages match your search.
            </div>
          )}
          {!loading && filteredInstance.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 bg-white/[0.02] sticky top-0">
                Pages (from Instance Pages library)
              </div>
              {filteredInstance.map((p) => {
                const already = existingSlugs.has(p.slug);
                const isSelected = selected.has(p.slug);
                return (
                  <button
                    key={p.slug}
                  type="button"
                  disabled={already}
                  onClick={() => !already && onToggle(p.slug)}
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
                        : 'bg-sky-900/30 border border-sky-700/40'
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
                        style={(p as any).icon_color ? undefined : { color: undefined }}
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
                        className="w-5 h-5 text-sky-300"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white truncate">{p.name}</span>
                      {p.kind === 'custom' ? (
                        <span className="text-[10px] uppercase tracking-wide bg-emerald-900/30 text-emerald-300 border border-emerald-700/40 px-1 py-0 rounded">
                          custom
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide bg-sky-900/40 text-sky-300 border border-sky-700/40 px-1 py-0 rounded">
                          builtin
                        </span>
                      )}
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
            onClick={onClose}
            className="px-4 py-2 text-sm border border-white/10 text-gray-300 rounded hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={handleAdd}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selected.size === 0
              ? 'Select pages to add'
              : `Add ${selected.size} page${selected.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const TemplateForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TemplateTabId>('general');

  // Load template for edit if necessary.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (editing) {
          const templates = await listTemplates();
          const t = templates.find((x) => x.id === Number(id));
          if (t) {
            const parsed = parseSpec(t.spec);
            setForm({
              ...emptyForm,
              ...parsed,
              id: String(t.id),
              name: t.name,
              description: t.description || '',
              kind: t.kind as DriverKind,
              image: t.image,
              // Top-level icon/color columns (migration 059) — never in spec.
              icon: (t as any).icon || '',
              color: (t as any).color || '',
            });
          } else {
            setError('Template not found');
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.image.trim()) { setError('Image is required'); return; }
    if (form.color && !/^#[0-9a-fA-F]{6}$/.test(form.color.trim())) { setError('Colour must be a #rrggbb hex value (or empty for default)'); return; }
    setSaving(true);
    setError('');
    try {
      const spec = serializeSpec(form);
      const icon = (form as any).icon?.trim?.() || '';
      const color = (form as any).color?.trim?.().toUpperCase() || '';
      if (editing) {
        await updateTemplate(Number(id), { name: form.name, spec, image: form.image, kind: form.kind, description: form.description, icon, color });
      } else {
        await createTemplate({ name: form.name, spec, image: form.image, kind: form.kind, description: form.description, icon, color });
      }
      navigate('/templates');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // ---- Import from Instance Pages -------------------------------------------
  // The Pages tab only exposes ONE add-button: "Import from Instance Pages".
  // Clicking it opens a modal that lists every page stored in the central
  // Instance Pages library (GET /api/instance-pages/). Picking one or more
  // entries copies them into the template's spec.pages as kind='custom' rows
  // with the full content payload — the same shape the instance router
  // mounts on /instances/:id/<slug> via CustomPageView. On template save
  // the spec is persisted; on instance deploy it is snapshotted into
  // instance.Config so the instance sidebar (and the InstanceTabs header
  // bar) renders exactly those pages and nothing else. Other pages are
  // blocked by the same guard (`instancePageSpecEnabled` /
  // `isPageAllowed` / `resolveInstanceNav`) so the instance panel only ever
  // shows pages that were explicitly imported here.
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [instancePages, setInstancePages] = useState<InstancePage[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSearch, setImportSearch] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  const existingSlugs = useMemo(
    () => new Set(form.pages.map((p) => p.slug)),
    [form.pages],
  );

  const loadInstancePages = useCallback(async () => {
    setImportLoading(true);
    setImportError('');
    try {
      const pages = await listInstancePages();
      setInstancePages(pages);
    } catch (e: any) {
      setImportError(e?.response?.data || 'Failed to load instance pages');
    } finally {
      setImportLoading(false);
    }
  }, []);

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

  // Convert each selected InstancePage into a PageOverride row and append
  // them to form.pages. The content payload is copied verbatim so the
  // Append a list of PageOverride rows (custom pages) to form.pages.
  // The picker modal (TemplatePagesImportModal) emits the right kind/label/
  // icon/content payload so this single helper covers both add paths.
  const addPages = (pagesToAdd: PageOverride[]) => {
    if (pagesToAdd.length === 0) return;
    setForm((f) => {
      const additions = pagesToAdd.filter((p) => !f.pages.some((existing) => existing.slug === p.slug));
      if (additions.length === 0) return f;
      return { ...f, pages: [...f.pages, ...additions] };
    });
    closeImportModal();
  };

  // ---- Add pages ---------------------------------------------------------
  // Single entry point. Lists custom pages from the central Instance Pages
  // library. Picking entries appends `kind: 'custom'` rows to form.pages —
  // so they ship in the template spec and, on instance deploy, in
  // instance.Config. The instance sidebar / InstanceTabs then render exactly
  // those pages; the `instancePageSpecEnabled` / `isPageAllowed` guards block
  // everything else.

  // Which page card is expanded into the edit sub-form. Single-index state
  // so opening one card collapses another — mirrors the spec-preview
  // toggle UX. The sub-form shows Path / Name / Icon SVG, plus the
  // CustomPageStudio for custom pages.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [configureIdx, setConfigureIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Templates', to: '/templates' }, { label: editing ? 'Edit Template' : 'New Template' }]}
        hideHeader
      >
        <FormSkeleton fields={6} />
      </FormPage>
    );
  }

  return (
    <>
      {/* Top-right actions — fixed like the phone tab bar (same ks-tab
          style), always visible no matter how far the form is scrolled.
          Footer Cancel/Create removed; everything lives here. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/templates')}
            title="Cancel and back to Templates"
            aria-label="Cancel and back to Templates"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving}
            title={editing ? 'Save template' : 'Create template'}
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
      </PageActionsPill>
    <FormPage
      crumbs={[{ label: 'Templates', to: '/templates' }, { label: editing ? 'Edit Template' : 'New Template' }]}
      onSubmit={submit}
      maxWidth="max-w-4xl"
      hideHeader
    >
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <TemplateTabs tab={tab} onChange={setTab} />
        <div className="space-y-4">

        {tab === 'general' && (
          <div className={sectionCls}>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section A · General Information</h4>
            <GlassField label="Name" htmlFor="name">
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-template" required />
            </GlassField>
            <GlassField label="Description" htmlFor="description">
              <textarea id="description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of this template" />
            </GlassField>
            <div>
              <span className="block text-sm font-medium text-gray-300 mb-1 ks-label">Icon & colour</span>
              <IconColorPicker
                icon={(form as any).icon || ''}
                color={(form as any).color || ''}
                onIconChange={(v) => setForm({ ...form, icon: v } as any)}
                onColorChange={(v) => setForm({ ...form, color: v } as any)}
                previewName={form.name || 'Template'}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GlassField label="Kind" htmlFor="kind">
                <select id="kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DriverKind })} className="glass-field">
                  <option value="docker">Docker</option>
                  <option value="lxd">LXD</option>
                  <option value="kvm">KVM</option>
                  <option value="multipass">Multipass</option>
                </select>
              </GlassField>
              <GlassField label="Image" htmlFor="image">
                <input id="image" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="e.g. itzg/minecraft-server:latest" required />
              </GlassField>
              <GlassField label="Category" htmlFor="category">
                <TagPicker value={form.category} options={['game', 'web', 'database', 'proxy', 'bot', 'other']} placeholder="game" onChange={(v) => setForm({ ...form, category: v })} onAdd={(v) => setForm({ ...form, category: v })} onDelete={() => setForm({ ...form, category: '' })} />
              </GlassField>
              <GlassField label="Type" htmlFor="type">
                <TagPicker value={form.type} options={['minecraft', 'nginx', 'postgres', 'redis', 'generic']} placeholder="minecraft" onChange={(v) => setForm({ ...form, type: v })} onAdd={(v) => setForm({ ...form, type: v })} onDelete={() => setForm({ ...form, type: '' })} />
              </GlassField>
            </div>
          </div>
        )}

        {tab === 'environment' && (
          <>
          <TemplateEnvironmentSection
            image={form.image}
            kind={form.kind}
            ports={form.ports}
            onPortUpdate={(i, patch) => setForm((f) => { const p = [...f.ports]; p[i] = { ...p[i], ...patch }; return { ...f, ports: p }; })}
            onPortAdd={() => setForm((f) => ({ ...f, ports: [...f.ports, { host: '', guest: '', protocol: 'tcp' }] }))}
            onPortDelete={(i) => setForm((f) => ({ ...f, ports: f.ports.filter((_, j) => j !== i) }))}
            mounts={form.mounts}
            onMountUpdate={(i, patch) => setForm((f) => { const m = [...f.mounts]; m[i] = { ...m[i], ...patch }; return { ...f, mounts: m }; })}
            onMountAdd={() => setForm((f) => ({ ...f, mounts: [...f.mounts, { source: '', target: '', mode: 'rw' }] }))}
            onMountDelete={(i) => setForm((f) => ({ ...f, mounts: f.mounts.filter((_, j) => j !== i) }))}
            limits={form.limits}
            onLimitsUpdate={(patch) => setForm((f) => ({ ...f, limits: { ...f.limits, ...patch } }))}
            caps={form.caps}
            onCapsUpdate={(patch) => setForm((f) => ({ ...f, caps: { ...f.caps, ...patch } }))}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'env' && (
          <>
          <TemplateEnvVariablesSection
            env={form.env}
            onEnvUpdate={(i, patch) => setForm((f) => { const e = [...f.env]; e[i] = { ...e[i], ...patch }; return { ...f, env: e }; })}
            onEnvAdd={() => setForm((f) => ({ ...f, env: [...f.env, { name: '', label: '', description: '', default: '', user_viewable: true, user_editable: true, required: false, rule: '', display: 'text', options: '', append: false, prepend: '', append_value: '' }] }))}
            onEnvDelete={(i) => setForm((f) => ({ ...f, env: f.env.filter((_, j) => j !== i) }))}
            onEnvMove={(i, dir) => setForm((f) => { const e = [...f.env]; const j = i + dir; if (j < 0 || j >= e.length) return f; [e[i], e[j]] = [e[j], e[i]]; return { ...f, env: e }; })}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'actions' && (
          <>
          <TemplateActionsSection
            actions={form.actions}
            onActionUpdate={(i, patch) => setForm((f) => { const a = [...f.actions]; a[i] = { ...a[i], ...patch }; return { ...f, actions: a }; })}
            onActionAdd={() => setForm((f) => ({ ...f, actions: [...f.actions, { id: '', name: '', description: '', icon_svg: '', icon_color: '', allowed_states: '', requires_online: false, async_run: false, run_on_create: false, cooldown_s: '0', user_invokable: false, session: 'long_running', auto_start_instance: false, auto_stop_on_exit: false, restart_on_failure: false, allowed_commands: '', blocked_commands: '', max_runtime_s: '0', stop_command: '', stop_mode: 'different', steps: [] }] }))}
            onActionDelete={(i) => setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}
            onActionMove={(i, dir) => setForm((f) => { const a = [...f.actions]; const j = i + dir; if (j < 0 || j >= a.length) return f; [a[i], a[j]] = [a[j], a[i]]; return { ...f, actions: a }; })}
            onActionStepUpdate={(actionIdx, stepIdx, patch) => setForm((f) => { const a = [...f.actions]; const s = [...a[actionIdx].steps]; s[stepIdx] = { ...s[stepIdx], ...patch }; a[actionIdx] = { ...a[actionIdx], steps: s }; return { ...f, actions: a }; })}
            onActionStepAdd={(actionIdx) => setForm((f) => { const a = [...f.actions]; a[actionIdx] = { ...a[actionIdx], steps: [...a[actionIdx].steps, { action: 'shell', command: '', url: '', filename: '', archive: '', dest: '', from: '', to: '', path: '', content: '', branch: 'main', retries: '0', ignore_errors: false }] }; return { ...f, actions: a }; })}
            onActionStepDelete={(actionIdx, stepIdx) => setForm((f) => { const a = [...f.actions]; a[actionIdx] = { ...a[actionIdx], steps: a[actionIdx].steps.filter((_, j) => j !== stepIdx) }; return { ...f, actions: a }; })}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'install' && (
          <>
          <TemplateInstallSection
            install={form.install}
            installTimeoutS={form.install_timeout_s}
            onInstallTimeoutUpdate={(v) => setForm((f) => ({ ...f, install_timeout_s: v.replace(/[^0-9]/g, '') }))}
            onInstallUpdate={(i, patch) => setForm((f) => { const s = [...f.install]; s[i] = { ...s[i], ...patch }; return { ...f, install: s }; })}
            onInstallAdd={() => setForm((f) => ({ ...f, install: [...f.install, { action: 'shell', command: '', url: '', filename: '', archive: '', dest: '', from: '', to: '', path: '', content: '', branch: 'main', retries: '0', ignore_errors: false }] }))}
            onInstallDelete={(i) => setForm((f) => ({ ...f, install: f.install.filter((_, j) => j !== i) }))}
            onInstallMove={(i, dir) => setForm((f) => { const s = [...f.install]; const j = i + dir; if (j < 0 || j >= s.length) return f; [s[i], s[j]] = [s[j], s[i]]; return { ...f, install: s }; })}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'runtime' && (
          <>
          <TemplateRuntimeSection
            kind={form.kind}
            advanced={form.advanced}
            onAdvancedUpdate={(patch) => setForm((f) => ({ ...f, advanced: { ...f.advanced, ...patch } }))}
            onKvmRuntimeUpdate={(patch) => setForm((f) => ({ ...f, advanced: { ...f.advanced, kvm: { ...f.advanced.kvm, ...patch } } }))}
            onMpRuntimeUpdate={(patch) => setForm((f) => ({ ...f, advanced: { ...f.advanced, multipass: { ...f.advanced.multipass, ...patch } } }))}
            onLxdRuntimeUpdate={(patch) => setForm((f) => ({ ...f, advanced: { ...f.advanced, lxd: { ...f.advanced.lxd, ...patch } } }))}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'labels' && (
          <>
          <TemplateLabelsDevicesSection
            labels={form.labels}
            onLabelUpdate={(i, patch) => setForm((f) => { const l = [...f.labels]; l[i] = { ...l[i], ...patch }; return { ...f, labels: l }; })}
            onLabelAdd={() => setForm((f) => ({ ...f, labels: [...f.labels, { key: '', value: '' }] }))}
            onLabelDelete={(i) => setForm((f) => ({ ...f, labels: f.labels.filter((_, j) => j !== i) }))}
            devices={form.devices}
            onDeviceUpdate={(i, patch) => setForm((f) => { const d = [...f.devices]; d[i] = { ...d[i], ...patch }; return { ...f, devices: d }; })}
            onDeviceAdd={() => setForm((f) => ({ ...f, devices: [...f.devices, { host: '', container: '', cgroup: false }] }))}
            onDeviceDelete={(i) => setForm((f) => ({ ...f, devices: f.devices.filter((_, j) => j !== i) }))}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'healthcheck' && (
          <>
          <TemplateHealthcheckSection
            healthcheck={form.healthcheck}
            onHealthcheckUpdate={(patch) => setForm((f) => ({ ...f, healthcheck: { ...f.healthcheck, ...patch } }))}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
            addBtn={addBtn}
          />
          </>
        )}

        {tab === 'controls' && (
          <TemplateControlsSection
            controls={form.instance_controls}
            onUpdate={(patch) => setForm((f) => ({ ...f, instance_controls: { ...f.instance_controls, ...patch } }))}
            onReset={() => setForm((f) => ({ ...f, instance_controls: { ...DEFAULT_INSTANCE_CONTROLS } }))}
            sectionCls={sectionCls}
            labelCls={labelCls}
          />
        )}

        {tab === 'pages' && (
          <div className="space-y-4">
            <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-1">Pages</h3>
                  <p className="text-xs text-gray-500">Pick which pages appear in the instance sidebar and configure them. Pages ship as Instance data on every deploy.</p>
                </div>
                <button
                  type="button"
                  onClick={openImportModal}
                  className="inline-flex items-center gap-2 text-sm bg-sky-600/90 text-white px-3 py-1.5 rounded hover:bg-sky-500"
                  title="Import pages (Home, Files, Terminal, …) from the Instance Pages library"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add pages
                </button>
              </div>
              <div className="space-y-3">
                {form.pages.map((p, i) => {
                  const defLabel = p.slug === '.' ? 'Home' : p.slug;
                  const isEditing = editingIdx === i;
                  const iconSvg = p.icon_svg || '';
                  const movePage = (dir: -1 | 1) => setForm((f) => {
                    const j = i + dir;
                    if (j < 0 || j >= f.pages.length) return f;
                    const p2 = [...f.pages];
                    [p2[i], p2[j]] = [p2[j], p2[i]];
                    return { ...f, pages: p2 };
                  });
                  return (
                    <div key={p.slug + ':' + i} className={`border border-white/10 rounded-md bg-black/30 overflow-hidden ${p.enabled ? '' : 'opacity-60'}`}>
                      <div className="p-3 flex items-center gap-3 flex-wrap">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button type="button" aria-label="Move page up" onClick={() => movePage(-1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 15l-6-6-6 6" /></svg>
                          </button>
                          <button type="button" aria-label="Move page down" onClick={() => movePage(1)} disabled={i === form.pages.length - 1} className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                        </div>
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-white/5 border border-white/10" style={(p as any).icon_color ? { color: (p as any).icon_color } : undefined}>
                          {iconSvg ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(iconSvg) }} />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-gray-500"><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{p.label.trim() || defLabel}</span>
                            <span className="text-[10px] uppercase tracking-wide bg-emerald-900/30 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded">custom</span>
                          </div>
                          <code className="block text-[11px] text-gray-500 font-mono mt-1 truncate">
                            /{p.slug === '.' ? '' : p.slug}
                          </code>
                        </div>
                        {(p.configure?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfigureIdx(i)}
                            className="px-2.5 py-1 text-xs font-medium border border-sky-700/40 bg-sky-900/20 text-sky-300 rounded hover:bg-sky-800/30 shrink-0"
                            title="Configure page variables"
                          >
                            Configure
                          </button>
                        )}
                        <CardMenu
                          ariaLabel={`Actions for page ${p.label || defLabel}`}
                          items={[
                            { key: 'edit', label: isEditing ? 'Close editor' : 'Edit', tone: 'default', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>) },
                            { key: 'remove', label: 'Remove', tone: 'danger', icon: (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>) },
                          ]}
                          onSelect={(key) => {
                            if (key === 'edit') {
                              setEditingIdx(isEditing ? null : i);
                            } else if (key === 'remove') {
                              if (editingIdx !== null && editingIdx >= i) setEditingIdx(null);
                              if (configureIdx !== null && configureIdx >= i) setConfigureIdx(null);
                              setForm((f) => ({ ...f, pages: f.pages.filter((_, j) => j !== i) }));
                            }
                          }}
                        />
                      </div>
                      {isEditing && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                          <IconColorPicker
                            icon={p.icon_svg || ''}
                            color={(p as any).icon_color || ''}
                            onIconChange={(v) => setForm((f) => { const p2 = [...f.pages]; p2[i] = { ...p2[i], icon_svg: v }; return { ...f, pages: p2 }; })}
                            onColorChange={(v) => setForm((f) => { const p2 = [...f.pages]; p2[i] = { ...p2[i], icon_color: v } as any; return { ...f, pages: p2 }; })}
                            previewName={p.label || p.slug}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className={labelCls}>Path (/path)</label>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-500 text-sm">/</span>
                                <input
                                  value={p.slug === '.' ? '' : p.slug}
                                  onChange={(e) => setForm((f) => { const p2 = [...f.pages]; p2[i] = { ...p2[i], slug: e.target.value }; return { ...f, pages: p2 }; })}
                                  placeholder="my-page"
                                  className={monoCls + ' flex-1'}
                                />
                              </div>
                            </div>
                            <div>
                              <label className={labelCls}>Name</label>
                              <input
                                value={p.label}
                                onChange={(e) => setForm((f) => { const p2 = [...f.pages]; p2[i] = { ...p2[i], label: e.target.value }; return { ...f, pages: p2 }; })}
                                placeholder={defLabel}
                                className="glass-field"
                              />
                            </div>
                          </div>
                          {p.kind === 'custom' && (
                            <CustomPageStudio
                              page={{
                                content_type: p.content_type,
                                content_blocks: p.content_blocks,
                                content_html: p.content_html,
                                content_markdown: p.content_markdown,
                              } as { content_type?: string; content_blocks?: string; content_html?: string; content_markdown?: string }}
                              onChange={(patch: Partial<{ content_type: string; content_blocks: string; content_html: string; content_markdown: string }>) => setForm((f): TemplateFormState => { const p2 = [...f.pages] as PageOverride[]; const updatedPage = { ...p2[i], content_type: patch.content_type, content_blocks: patch.content_blocks, content_html: patch.content_html, content_markdown: patch.content_markdown } as PageOverride; p2[i] = updatedPage; return { ...f, pages: p2 }; })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {form.pages.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No pages yet — click <strong className="text-sky-300">Add pages</strong> to import pages (Home / Files / Terminal / …) from the Instance Pages library.</p>
                )}
              </div>
            </div>
            <TemplatePagesImportModal
              open={importModalOpen}
              onClose={closeImportModal}
              existingSlugs={existingSlugs}
              onAddPages={addPages}
              loading={importLoading}
              error={importError}
              instancePages={instancePages}
              search={importSearch}
              onSearchChange={setImportSearch}
              selected={selectedSlugs}
              onToggle={toggleImportSelection}
            />
            {/* Configure modal — per-page values for Studio Configure vars */}
            <Modal
              open={configureIdx !== null}
              onClose={() => setConfigureIdx(null)}
              title={configureIdx !== null ? `Configure ${form.pages[configureIdx]?.label || form.pages[configureIdx]?.slug || 'page'}` : 'Configure'}
              maxWidth="max-w-xl"
            >
              {configureIdx !== null && (() => {
                const p = form.pages[configureIdx];
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
                                setForm((f) => { const p2 = [...f.pages]; p2[configureIdx!] = { ...p2[configureIdx!], config: next }; return { ...f, pages: p2 }; });
                              }}
                              className={glassFieldClass + ' w-full'}
                            >
                              <option value="">— {v.required ? 'required' : 'optional'} —</option>
                              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
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
                                      setForm((f) => { const p2 = [...f.pages]; p2[configureIdx!] = { ...p2[configureIdx!], config: next }; return { ...f, pages: p2 }; });
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
                                setForm((f) => { const p2 = [...f.pages]; p2[configureIdx!] = { ...p2[configureIdx!], config: next }; return { ...f, pages: p2 }; });
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
                                setForm((f) => { const p2 = [...f.pages]; p2[configureIdx!] = { ...p2[configureIdx!], config: next }; return { ...f, pages: p2 }; });
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
        )}

        {tab === 'spec' && (
          <>
          <TemplateSpecPreviewSection
            specPreview={serializeSpec(form)}
            sectionCls={sectionCls}
            labelCls={labelCls}
            monoCls={monoCls}
          />
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
    </FormPage>
      {/* Spacer — reserves scroll room so the fixed bottom tab bar never
          covers trailing form content (node pattern). */}
      <div aria-hidden="true" className="h-24 lg:hidden" />
    </>
  );
};

export default TemplateForm;