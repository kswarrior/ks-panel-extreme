import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getInstancePage, deleteInstancePage } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import { parseSubPages, parsePageActions, parsePageComponents, parsePageConfigure, pageSourceOf } from '@/features/instance-pages/types/instancePage';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import { useConfirm } from '@/shared/stores/confirmStore';

// SOURCE_META mirrors InstancePages.tsx so the detail header badge reads
// identically to the library cards: market (fresh import), edited (market
// import later modified), studio (own pages).
const SOURCE_META: Record<string, { label: string; badge: string; dot: string }> = {
  market: { label: 'Market', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400' },
  edited: { label: 'Edited', badge: 'bg-amber-900/60 text-amber-200 border-amber-700/60', dot: 'bg-amber-400' },
  studio: { label: 'Studio', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60', dot: 'bg-emerald-400' },
};

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof (data as any).error === 'string') return (data as any).error;
    if (typeof (data as any).message === 'string') return (data as any).message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const s = Math.floor(abs / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

const InstancePageDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [page, setPage] = useState<InstancePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) { setError('Invalid page ID'); setLoading(false); return; }
      setLoading(true);
      setError('');
      try {
        const p = await getInstancePage(numericId);
        if (cancelled) return;
        setPage(p);
      } catch (e: any) {
        if (!cancelled) {
          const msg = getErrorMessage(e, 'Failed to load page');
          // Backend returns 404 with "instance page not found" — surface as not found.
          setError(msg.includes('not found') ? 'Page not found' : msg);
          setPage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, validId, numericId]);

  const back = () => navigate('/instance-pages');

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch {}
  };

  const handleDelete = async () => {
    if (!page) return;
    if (!(await confirm({ title: 'Delete instance page', message: `Delete instance page "${page.name}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteInstancePage(page.id);
      navigate('/instance-pages');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to delete page'));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-40 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Instance Page Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">{error || 'Page not found'}</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const subPages = parseSubPages((page as any).sub_pages);
  const actions = parsePageActions((page as any).actions);
  const components = parsePageComponents((page as any).components);
  const configure = parsePageConfigure((page as any).configure);
  const source = pageSourceOf(page as any);
  const contentLen = ((page as any).content_html?.length || 0) + ((page as any).content_markdown?.length || 0) + ((page as any).content_blocks?.length || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Instance Pages">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white truncate">Instance Page Detail</h2>
          <p className="text-xs text-gray-500 truncate">ID {page.id} · /{page.slug} · {relativeTime(page.updated_at)}</p>
        </div>
        <CardMenu
          ariaLabel={`Actions for instance page ${page.name}`}
          items={[
            { key: 'edit', label: 'Edit page', tone: 'default' },
            { key: 'copyId', label: copied === 'id' ? 'Copied!' : 'Copy ID', tone: 'default' },
            { key: 'copySlug', label: copied === 'slug' ? 'Copied!' : 'Copy slug', tone: 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger', disabled: deleting },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/instance-pages/${page.id}/studio`);
            if (k === 'copyId') copy(String(page.id), 'id');
            if (k === 'copySlug') copy(page.slug, 'slug');
            if (k === 'delete') handleDelete();
          }}
        />
      </div>

      <GlassCard className="ks-stat-card p-4">
        <div className="flex items-start gap-3">
          <CardIconTile
            icon={(page as any).icon_svg || ''}
            color={(page as any).icon_color || ''}
            size="md"
            fallback={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            }
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{page.name}</h3>
            <p className="text-[11px] text-gray-400 font-mono">/{page.slug} · {page.kind}</p>
          </div>
          {(() => {
            const meta = SOURCE_META[source] ?? SOURCE_META.studio;
            return (
              <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${meta.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            );
          })()}
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Category</h4>
            <p className="text-xs text-white mt-1 truncate">{page.category || '—'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Type</h4>
            <p className="text-xs text-white mt-1 truncate">{(page as any).type || '—'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Content type</h4>
            <p className="text-xs text-white mt-1 capitalize">{page.content_type || '—'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Source</h4>
            <p className="text-xs text-white mt-1 capitalize">{source}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Content size</h4>
            <p className="text-xs text-white mt-1">{contentLen > 0 ? `${(contentLen / 1024).toFixed(1)} KB` : '—'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Sub-pages</h4>
            <p className="text-xs text-white mt-1">{subPages.length}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Actions</h4>
            <p className="text-xs text-white mt-1">{actions.length}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Components</h4>
            <p className="text-xs text-white mt-1">{components.length}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Configure vars</h4>
            <p className="text-xs text-white mt-1">{configure.length}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Created</h4>
            <p className="text-xs text-white mt-1">{new Date(page.created_at).toLocaleDateString()}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Updated</h4>
            <p className="text-xs text-white mt-1">{new Date(page.updated_at).toLocaleDateString()}</p>
          </div>
        </div>

        {page.description && (
          <p className="text-sm text-gray-300 mt-4">{page.description}</p>
        )}

        {subPages.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Sub-pages ({subPages.length})</h4>
            <div className="space-y-1.5">
              {subPages.map((s) => (
                <div key={s.path} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                  <code className="font-mono text-sky-300">/{page.slug}/{s.path}</code>
                  <span className="text-gray-300 truncate">{s.name}</span>
                  <span className="ml-auto text-[10px] uppercase text-gray-500">{s.content_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Actions ({actions.length})</h4>
            <div className="space-y-1.5">
              {actions.map((a) => (
                <div key={a.name} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                  <code className="font-mono text-emerald-300">{a.name}</code>
                  <span className="text-[10px] uppercase text-gray-500">{a.type}</span>
                  {a.description && <span className="text-gray-500 truncate">{a.description}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {components.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Components ({components.length})</h4>
            <div className="space-y-1.5">
              {components.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                  <code className="font-mono text-violet-300">{'{{component:'}{c.name}{'}}'}</code>
                  <span className="text-[10px] uppercase text-gray-500">{c.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {configure.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Configure variables ({configure.length})</h4>
            <div className="space-y-1.5">
              {configure.map((v) => (
                <div key={v.name} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                  <code className="font-mono text-amber-300">{v.name}</code>
                  <span className="text-gray-300 truncate">{v.label || v.default || ''}</span>
                  <span className="ml-auto text-[10px] uppercase text-gray-500">{v.display || 'text'}</span>
                  {v.required && <span className="text-[10px] text-red-400">required</span>}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">Values are set per template via the template editor&apos;s Configure button and render as <code className="font-mono">{'{{config:NAME}}'}</code>.</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default InstancePageDetail;
