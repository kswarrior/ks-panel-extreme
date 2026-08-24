import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import { listInstancePages, createInstancePage, updateInstancePage, listTemplates, linkInstancePage } from '@/shared/api/admin';
import type { InstancePage, CreateInstancePagePayload, UpdateInstancePagePayload } from '@/shared/types/instancePage';

interface TemplateListItem {
  id: number;
  name: string;
}

const InstancePageForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Partial<InstancePage>>({
    name: '',
    description: '',
    slug: '',
    kind: 'custom' as 'builtin' | 'custom',
    category: '',
    content_type: 'html',
    content_html: '',
    content_markdown: '',
    content_blocks: '',
    icon_svg: '',
  });

  // ---- Link to template(s) ----------------------------------------------
  // The Instance Pages list is the central library of reusable custom pages.
  // After the admin designs one here, they pick which templates should expose
  // the page in their instance panel sidebar. POST /instance-pages/:id/link
  // copies the saved page (slug + content payload) into each chosen template's
  // spec.pages as a `kind: 'custom'` row so the Instance router mounts
  // CustomPageView at /instances/:id/<slug>. Re-linking re-seeds the spec.
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [linkTargetIds, setLinkTargetIds] = useState<number[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const linkPageId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((ts) => { if (!cancelled) setTemplates(ts.map((t) => ({ id: t.id, name: t.name }))); })
      .catch(() => { /* non-admins or perms gaps just leave the list empty */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isEdit) { setLoading(false); return; }
    listInstancePages()
      .then((pages) => {
        const found = pages.find((p) => String(p.id) === id);
        if (found) setPage(found);
        else setError('Instance page not found');
      })
      .catch((e: any) => setError(e?.response?.data || 'Failed to load page'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  if (loading) return <GlassCard className="ks-card ks-form-card text-center text-gray-400">Loading…</GlassCard>;

  const isBuiltin = page.kind === 'builtin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBuiltin) {
      setError('Built-in pages cannot be edited. Create a custom page instead.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateInstancePage(Number(id), page as UpdateInstancePagePayload);
        linkPageId.current = Number(id);
      } else {
        const res = await createInstancePage(page as CreateInstancePagePayload);
        linkPageId.current = Number(res.id);
      }
      navigate('/instance-pages');
    } catch (e: any) {
      setError(e?.response?.data || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (linkPageId.current == null) {
      setLinkMsg('Save the page first, then link it to templates.');
      return;
    }
    if (linkTargetIds.length === 0) {
      setLinkMsg('Pick at least one template to link.');
      return;
    }
    setLinking(true);
    setLinkMsg('');
    try {
      const res = await linkInstancePage(linkPageId.current, {
        template_ids: linkTargetIds,
        label: (page.name ?? '').trim(),
        icon_svg: page.icon_svg ?? '',
        enabled: true,
      });
      setLinkMsg(
        `Linked to ${res.linked.length} template${res.linked.length === 1 ? '' : 's'}` +
          (res.skipped.length ? `; skipped ${res.skipped.length} (missing/invalid).` : '.'),
      );
    } catch (e: any) {
      setLinkMsg(e?.response?.data || 'Link failed');
    } finally {
      setLinking(false);
    }
  };

  const onChange = <K extends keyof InstancePage>(key: K, value: InstancePage[K]) => {
    setPage((p) => ({ ...p, [key]: value }));
  };

  return (
    <GlassCard className="ks-card ks-form-card max-w-3xl">
      <h2 className="text-xl font-semibold text-white mb-4">
        {isEdit ? 'Edit Instance Page' : 'Create Instance Page'}
      </h2>
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {isBuiltin && isEdit && (
        <div className="mb-4 p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-200 text-sm">
          <p className="font-semibold">Built-in Page (Read-Only)</p>
          <p className="mt-1">
            Built-in pages are provided by the panel and cannot be edited here. They are automatically available
            in every instance panel. To customize a built-in page for a specific template (rename, change icon,
            enable/disable), use the <strong>Pages</strong> tab in the <strong>Template</strong> editor.
          </p>
        </div>
      )}

      {!isBuiltin && (
        <form onSubmit={handleSubmit} className="ks-form-group space-y-4">
          <div className="ks-form-row">
            <div className="ks-field">
              <span className="ks-label text-xs text-gray-400">Name</span>
              <input
                value={page.name as string}
                onChange={(e) => onChange('name', e.target.value)}
                className="ks-input"
                required
              />
            </div>
            <div className="ks-field">
              <span className="ks-label text-xs text-gray-400">Slug</span>
              <input
                value={page.slug as string}
                onChange={(e) => onChange('slug', e.target.value)}
                className="ks-input ks-input-mono"
                required
              />
            </div>
          </div>
          <div className="ks-field">
            <span className="ks-label text-xs text-gray-400">Description</span>
            <textarea
              value={page.description as string}
              onChange={(e) => onChange('description', e.target.value)}
              rows={2}
              className="ks-input ks-textarea"
            />
          </div>
          <div className="ks-form-row">
            <div className="ks-field">
              <span className="ks-label text-xs text-gray-400">Kind</span>
              {/* Only "custom" exists anymore: the built-in instance pages
                  were converted to custom library pages and migration 046
                  purged the legacy rows, so the API rejects kind='builtin'. */}
              <select
                value="custom"
                disabled
                className="ks-select"
                title="All library pages are custom"
              >
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="ks-field">
              <span className="ks-label text-xs text-gray-400">Category</span>
              <input
                value={page.category as string}
                onChange={(e) => onChange('category', e.target.value)}
                className="ks-input"
              />
            </div>
            <div className="ks-field">
              <span className="ks-label text-xs text-gray-400">Content Type</span>
              <select
                value={page.content_type}
                onChange={(e) => onChange('content_type', e.target.value as 'html' | 'markdown' | 'blocks')}
                className="ks-select"
              >
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
                <option value="blocks">Blocks</option>
              </select>
            </div>
          </div>
          <div className="ks-field">
            <span className="ks-label text-xs text-gray-400">Icon (SVG)</span>
            <textarea
              value={page.icon_svg as string}
              onChange={(e) => onChange('icon_svg', e.target.value)}
              rows={3}
              className="ks-input ks-textarea ks-input-mono"
              placeholder='<svg viewBox="0 0 24 24">...</svg>'
            />
          </div>
          <div className="ks-field">
            <span className="ks-label text-xs text-gray-400">Content</span>
            <textarea
              value={(page.content_html as string) || (page.content_markdown as string) || (page.content_blocks as string)}
              onChange={(e) => {
                if (page.content_type === 'html') onChange('content_html', e.target.value);
                else if (page.content_type === 'markdown') onChange('content_markdown', e.target.value);
                else onChange('content_blocks', e.target.value);
              }}
              rows={10}
              className="ks-input ks-textarea ks-input-mono"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
            <button type="button" onClick={() => navigate('/instance-pages')} className="ks-btn-cancel ks-btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="ks-btn-form ks-btn-primary">
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
            </button>
          </div>
        </form>
      )}

      {!isBuiltin && (
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-white">Link to templates</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Copy this page into templates' <code className="text-gray-400">Pages</code> tab so they appear as world pages in the instance panel.
              Re-linking re-seeds the spec with the latest content.
            </p>
          </div>
          {templates.length === 0 ? (
            <p className="text-xs text-gray-500">No templates available to link.</p>
          ) : (
            <div className="ks-form-group max-h-52 overflow-y-auto ks-card ks-form-card rounded-md space-y-1">
              {templates.map((t) => {
                const checked = linkTargetIds.includes(t.id);
                return (
                  <label key={t.id} className="ks-field-inline ks-field">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setLinkTargetIds((ids) =>
                          e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id),
                        );
                      }}
                      className="ks-checkbox"
                    />
                    <span className="text-sm text-gray-200 flex-1">{t.name}</span>
                    <code className="text-[11px] text-gray-500 font-mono">#{t.id}</code>
                  </label>
                );
              })}
            </div>
          )}
          {linkMsg && <p className="ks-hint text-xs text-gray-400 mt-2">{linkMsg}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleLink}
              disabled={linking || templates.length === 0 || linkPageId.current == null}
              className="ks-btn-form ks-btn-primary"
              title={isEdit ? 'Attach this page to the selected templates' : 'Save the page first, then link it'}
            >
              {linking ? 'Linking…' : 'Link to selected templates'}
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
};

export default InstancePageForm;