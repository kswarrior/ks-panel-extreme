import React, { useEffect, useMemo, useState } from 'react';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import { useConfirm } from '@/shared/stores/confirmStore';
import { listRoles } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';
import {
  createPanelPage,
  deletePanelPage,
  listPanelPages,
  slugify,
  updatePanelPage,
  type PanelPage,
} from '@/features/settings/api/panelPages';
import { usePanelPagesStore } from '@/features/settings/stores/panelPagesStore';

const fieldClass =
  'w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150';

const segBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
    active
      ? 'bg-white text-black border-white'
      : 'bg-black/30 text-gray-300 border-white/10 hover:bg-white/10'
  }`;

// sanitizeSvgPreview strips executable constructs from an SVG before the
// editor inlines it for preview. The SERVER re-sanitizes on save with the
// same rules as avatars (sanitizeIconSVG), so this is only the live-preview
// shield — never the trust boundary.
function sanitizeSvgPreview(raw: string): string {
  let cur = raw || '';
  for (let i = 0; i < 5; i++) {
    const prev = cur;
    cur = cur
      .replace(/<\s*\/?\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*>?/gis, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|xlink:href|src|from|to|values|style)\s*=\s*("\s*(javascript|vbscript|data:text\/html)[^"]*"|'[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/gi, '');
    if (cur === prev) break;
  }
  return cur;
}

function PageIcon({ svg, className = 'w-4 h-4' }: { svg: string; className?: string }) {
  const clean = sanitizeSvgPreview(svg);
  if (!clean.trim()) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

interface EditorState {
  id: number | null;
  name: string;
  slug: string;
  slugTouched: boolean;
  icon: string;
  contentType: 'html' | 'markdown';
  content: string;
  enabled: boolean;
  rolesMode: 'all' | 'custom';
  roleIds: number[];
  sortOrder: number;
}

const blankEditor = (sortOrder: number): EditorState => ({
  id: null,
  name: '',
  slug: '',
  slugTouched: false,
  icon: '',
  contentType: 'markdown',
  content: '',
  enabled: true,
  rolesMode: 'all',
  roleIds: [],
  sortOrder,
});

function editorFromPage(p: PanelPage): EditorState {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    slugTouched: true,
    icon: p.icon_svg || '',
    contentType: p.content_type === 'html' ? 'html' : 'markdown',
    content: p.content || '',
    enabled: p.enabled,
    // Empty allow-list means "every role" — surface it as the All mode so
    // the editor never shows a confusing zero-checked custom list.
    rolesMode: p.role_ids && p.role_ids.length > 0 ? 'custom' : 'all',
    roleIds: [...(p.role_ids || [])],
    sortOrder: p.sort_order || 0,
  };
}

// PagesTab — Settings > Pages: the custom sidebar pages manager.
// List of pages (About, Docs, …) + a studio-lite editor: name, URL slug,
// SVG icon, enabled toggle, HTML/Markdown content box with live preview,
// role visibility (All roles by default), and sort order.
const PagesTab: React.FC = () => {
  const confirm = useConfirm();
  const refreshNav = usePanelPagesStore((s) => s.refresh);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState<PanelPage[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesUnavailable, setRolesUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<EditorState | null>(null);

  const reload = async () => {
    try {
      const list = await listPanelPages();
      setPages(list);
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to load pages');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [list, roleList] = await Promise.all([
          listPanelPages().catch((e: any) => {
            throw e;
          }),
          listRoles().catch(() => null),
        ]);
        setPages(list);
        if (roleList) {
          setRoles(roleList);
        } else {
          // The settings admin may lack MANAGE_ROLES — pages stay
          // creatable, visibility simply defaults to every role.
          setRolesUnavailable(true);
        }
      } catch (e: any) {
        setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to load pages');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startNew = () => {
    setError('');
    setNotice('');
    const maxSort = pages.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);
    const ed = blankEditor(maxSort + 10);
    // Default: every role selected (surfaced as the "All roles" mode with
    // all boxes checked so the admin sees the default explicitly).
    ed.roleIds = roles.map((r) => r.id);
    setEditing(ed);
  };

  const startEdit = (p: PanelPage) => {
    setError('');
    setNotice('');
    const ed = editorFromPage(p);
    if (ed.rolesMode === 'all') ed.roleIds = roles.map((r) => r.id);
    setEditing(ed);
  };

  const patch = (p: Partial<EditorState>) => setEditing((e) => (e ? { ...e, ...p } : e));

  const onName = (v: string) => {
    setEditing((e) => {
      if (!e) return e;
      const next: EditorState = { ...e, name: v };
      if (!e.slugTouched) next.slug = slugify(v);
      return next;
    });
  };

  const toggleRole = (id: number) => {
    setEditing((e) => {
      if (!e) return e;
      const has = e.roleIds.includes(id);
      return { ...e, roleIds: has ? e.roleIds.filter((x) => x !== id) : [...e.roleIds, id] };
    });
  };

  const previewContent = useMemo(() => {
    if (!editing) return null;
    return {
      type: editing.contentType,
      html: editing.contentType === 'html' ? editing.content : undefined,
      markdown: editing.contentType === 'markdown' ? editing.content : undefined,
    } as const;
  }, [editing]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Page name is required');
      return;
    }
    const slug = slugify(editing.slug);
    if (!slug) {
      setError('URL slug is required (lowercase letters, digits, dashes)');
      return;
    }
    if (editing.rolesMode === 'custom' && editing.roleIds.length === 0) {
      setError('Pick at least one role — or switch back to "All roles"');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        slug,
        name: editing.name.trim(),
        icon_svg: editing.icon.trim(),
        content_type: editing.contentType,
        content: editing.content,
        enabled: editing.enabled,
        // "All roles" stores an empty allow-list (= every role, including
        // roles created later). Custom stores the checked ids.
        role_ids: editing.rolesMode === 'all' ? [] : editing.roleIds,
        sort_order: Number(editing.sortOrder) || 0,
      };
      if (editing.id == null) {
        await createPanelPage(payload);
        setNotice('Page created.');
      } else {
        await updatePanelPage(editing.id, payload);
        setNotice('Page saved.');
      }
      await reload();
      await refreshNav();
      setEditing(null);
    } catch (err: any) {
      const raw = err?.response?.data;
      setError(typeof raw === 'string' && raw.trim() ? raw : 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: PanelPage) => {
    if (
      !(await confirm({
        title: 'Delete page',
        message: `Delete "${p.name}"? It disappears from every sidebar immediately.`,
        tone: 'danger',
        confirmLabel: 'Delete',
      }))
    )
      return;
    setError('');
    setNotice('');
    try {
      await deletePanelPage(p.id);
      await reload();
      await refreshNav();
      setNotice('Page deleted.');
    } catch (e: any) {
      const raw = e?.response?.data;
      setError(typeof raw === 'string' && raw.trim() ? raw : 'Failed to delete page');
    }
  };

  const toggleEnabled = async (p: PanelPage) => {
    setError('');
    try {
      await updatePanelPage(p.id, {
        slug: p.slug,
        name: p.name,
        icon_svg: p.icon_svg,
        content_type: p.content_type,
        content: p.content,
        enabled: !p.enabled,
        role_ids: p.role_ids,
        sort_order: p.sort_order,
      });
      await reload();
      await refreshNav();
    } catch (e: any) {
      const raw = e?.response?.data;
      setError(typeof raw === 'string' && raw.trim() ? raw : 'Failed to update page');
    }
  };

  if (loading) return <SkeletonCard lines={3} />;

  // ── Editor ────────────────────────────────────────────────────────────
  if (editing) {
    const lines = editing.content ? editing.content.split('\n').length : 0;
    return (
      <form onSubmit={submit} className="glass-card ks-form-card rounded-xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">{editing.id == null ? 'New page' : `Edit — ${editing.name || editing.slug}`}</h3>
            <p className="text-xs text-gray-400">Shows in the sidebar as <span className="font-mono">/pages/{slugify(editing.slug) || '…'}</span> when enabled.</p>
          </div>
          <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-white underline underline-offset-2 decoration-white/20 shrink-0">
            Back to list
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="pp-name">Name</label>
            <input
              id="pp-name"
              value={editing.name}
              onChange={(e) => onName(e.target.value)}
              required
              maxLength={128}
              className={fieldClass}
              placeholder="About"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="pp-slug">URL</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-mono shrink-0">/pages/</span>
              <input
                id="pp-slug"
                value={editing.slug}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })}
                required
                maxLength={48}
                className={fieldClass + ' font-mono'}
                placeholder="about"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="pp-sort">Order</label>
            <input
              id="pp-sort"
              type="number"
              value={editing.sortOrder}
              onChange={(e) => patch({ sortOrder: Number(e.target.value) || 0 })}
              className={fieldClass}
            />
            <p className="mt-1 text-[11px] text-gray-500">Lower shows first in the sidebar.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
            <button
              type="button"
              role="switch"
              aria-checked={editing.enabled}
              onClick={() => patch({ enabled: !editing.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editing.enabled ? 'bg-emerald-500' : 'bg-neutral-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editing.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="ml-2 text-xs text-gray-400">{editing.enabled ? 'On — shows in the sidebar' : 'Off — hidden draft'}</span>
          </div>
        </div>

        {/* Icon SVG */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="pp-icon">
            Icon <span className="text-gray-500 font-normal">(SVG — optional)</span>
          </label>
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0 p-1.5 text-gray-200">
              <PageIcon svg={editing.icon} className="w-6 h-6" />
            </div>
            <textarea
              id="pp-icon"
              value={editing.icon}
              onChange={(e) => patch({ icon: e.target.value })}
              rows={3}
              spellCheck={false}
              className={fieldClass + ' font-mono text-xs'}
              placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" …>…</svg>'
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Inline SVG for the sidebar glyph (scripts are stripped on save). Leave empty for the default document icon.</p>
        </div>

        {/* Content type + code box */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">Content</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => patch({ contentType: 'markdown' })} className={segBtn(editing.contentType === 'markdown')}>Markdown</button>
              <button type="button" onClick={() => patch({ contentType: 'html' })} className={segBtn(editing.contentType === 'html')}>HTML</button>
            </div>
          </div>
          <textarea
            value={editing.content}
            onChange={(e) => patch({ content: e.target.value })}
            rows={12}
            spellCheck={false}
            className={fieldClass + ' font-mono text-xs leading-relaxed'}
            placeholder={editing.contentType === 'markdown' ? '# About us\n\nWe run game servers…' : '<h1>About us</h1>\n<p>We run game servers…</p>'}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            {lines} line{lines === 1 ? '' : 's'} · {editing.content.length} chars
            {editing.contentType === 'html' ? ' · HTML renders sandboxed (no panel access), like instance pages.' : ' · headings, bold, code, lists, links.'}
          </p>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-medium text-gray-400 mb-3">Live preview</p>
          {editing.content.trim() ? (
            <CustomPageView
              title={editing.name || 'Untitled'}
              content={{
                type: editing.contentType === 'html' ? 'html' : 'markdown',
                html: editing.contentType === 'html' ? editing.content : undefined,
                markdown: editing.contentType === 'markdown' ? editing.content : undefined,
              }}
            />
          ) : (
            <p className="text-xs text-gray-500 italic">Nothing to preview yet — write something in the box above.</p>
          )}
        </div>

        {/* Roles */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Roles</label>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" onClick={() => patch({ rolesMode: 'all', roleIds: roles.map((r) => r.id) })} className={segBtn(editing.rolesMode === 'all')}>
              All roles (default)
            </button>
            <button type="button" onClick={() => patch({ rolesMode: 'custom' })} className={segBtn(editing.rolesMode === 'custom')} disabled={rolesUnavailable}>
              Specific roles
            </button>
          </div>
          {rolesUnavailable ? (
            <p className="text-[11px] text-gray-500">Role list unavailable (needs Roles permission) — the page stays visible to every role.</p>
          ) : editing.rolesMode === 'custom' ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex gap-3 mb-2 text-[11px]">
                <button type="button" onClick={() => patch({ roleIds: roles.map((r) => r.id) })} className="text-gray-300 hover:text-white underline underline-offset-2">Select all</button>
                <button type="button" onClick={() => patch({ roleIds: [] })} className="text-gray-300 hover:text-white underline underline-offset-2">Clear</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {roles.map((r) => {
                  const checked = editing.roleIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors ${
                        checked ? 'border-emerald-600/60 bg-emerald-800/20 text-emerald-200' : 'border-white/[0.06] bg-black/20 text-gray-300'
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleRole(r.id)} className="accent-emerald-500" />
                      <span className="truncate" title={r.display_name || r.name}>{r.display_name || r.name}</span>
                    </label>
                  );
                })}
              </div>
              {roles.length === 0 && <p className="text-[11px] text-gray-500">No roles found.</p>}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500">Visible to every role — including roles created later.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center text-sm py-2 px-4 rounded text-gray-200 hover:bg-white/10 border border-white/10 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
          >
            {saving ? 'Saving…' : editing.id == null ? 'Create page' : 'Save page'}
          </button>
        </div>
      </form>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────
  return (
    <div className="glass-card ks-form-card rounded-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Custom pages</h3>
          <p className="text-xs text-gray-500 mt-1">About, Docs, rules — extra sidebar pages with Markdown or HTML content. Switch a page on and it appears in every allowed role's sidebar.</p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm shrink-0"
        >
          + New page
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-green-400">{notice}</p>}

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center">
          <p className="text-sm text-gray-300 font-medium">No custom pages yet</p>
          <p className="text-xs text-gray-500 mt-1">Create one — e.g. <span className="font-mono">About</span> or <span className="font-mono">Docs</span> — and it shows up in the sidebar.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
              <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-neutral-900 border border-neutral-700 text-gray-200 shrink-0 p-1">
                <PageIcon svg={p.icon_svg} className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {p.name}
                  {!p.enabled && <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500 border border-white/10 rounded px-1.5 py-0.5">off</span>}
                  {p.enabled && <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300 border border-emerald-600/40 rounded px-1.5 py-0.5">on</span>}
                </p>
                <p className="text-[11px] text-gray-500 font-mono truncate">/pages/{p.slug} · {p.content_type}{p.role_ids.length === 0 ? ' · all roles' : ` · ${p.role_ids.length} role${p.role_ids.length === 1 ? '' : 's'}`}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleEnabled(p)}
                  title={p.enabled ? 'Switch off (hide from sidebar)' : 'Switch on (show in sidebar)'}
                  className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${p.enabled ? 'border-white/10 text-gray-300 hover:bg-white/10' : 'border-emerald-600/50 text-emerald-200 hover:bg-emerald-500/10'}`}
                >
                  {p.enabled ? 'Switch off' : 'Switch on'}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="text-xs px-2.5 py-1.5 rounded border border-white/10 text-gray-200 hover:bg-white/10 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="text-xs px-2.5 py-1.5 rounded border border-white/10 text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PagesTab;
