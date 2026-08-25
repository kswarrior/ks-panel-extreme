import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listInstancePages, deleteInstancePage } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';

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
        const pages = await listInstancePages();
        const p = pages.find((x) => x.id === numericId) || null;
        if (cancelled) return;
        if (!p) { setError('Page not found'); setPage(null); }
        else setPage(p);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load page'));
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
    if (!confirm(`Delete instance page "${page.name}"?`)) return;
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
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{page.name}</h3>
            <p className="text-[11px] text-gray-400 font-mono">/{page.slug} · {page.kind}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${page.kind === 'builtin' ? 'bg-sky-900/60 text-sky-200 border-sky-700/60' : 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60'}`}>
            {page.kind}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Category</h4>
            <p className="text-xs text-white mt-1 truncate">{page.category || '—'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Content type</h4>
            <p className="text-xs text-white mt-1 capitalize">{page.content_type || '—'}</p>
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
      </GlassCard>
    </div>
  );
};

export default InstancePageDetail;
