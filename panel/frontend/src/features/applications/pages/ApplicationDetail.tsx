import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteApplication, getApplication, listApplicationRuns } from '@/features/applications/api/applications';
import type { Application, ApplicationRun } from '@/features/applications/types/application';
import { appCapabilityMeta } from '@/features/applications/types/application';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function runTone(status: ApplicationRun['status']): string {
  if (status === 'succeeded') return 'bg-emerald-900/30 border-emerald-700/30 text-emerald-200';
  if (status === 'running') return 'bg-amber-900/30 border-amber-700/30 text-amber-200';
  return 'bg-red-900/30 border-red-700/30 text-red-200';
}

const ApplicationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [app, setApp] = useState<Application | null>(null);
  const [runs, setRuns] = useState<ApplicationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid application ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [a, r] = await Promise.all([
          getApplication(numericId),
          listApplicationRuns(numericId, 10).catch(() => [] as ApplicationRun[]),
        ]);
        if (cancelled) return;
        setApp(a);
        setRuns(r);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load application'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/applications');

  const handleDelete = async () => {
    if (!app) return;
    if (!(await confirm({ title: 'Delete application', message: `Delete application "${app.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteApplication(app.id);
      navigate('/applications');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Application Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40">
          <p className="text-red-400 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Retry</button>
            <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
          </div>
        </GlassCard>
      </div>
    );
  }
  if (!app) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Application Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Application not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const grants = app.permission_rows || [];
  const pending = app.pending ?? grants.filter((g) => !g.granted).length;

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for application ${app.name}`}
          items={[
            { key: 'configure', label: 'Configure', tone: 'default' },
            { key: 'edit', label: 'Edit', tone: 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'configure') navigate(`/applications/${app.id}/configure`);
            if (k === 'edit') navigate(`/applications/${app.id}/edit`);
            if (k === 'delete') handleDelete();
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center text-xl shrink-0" style={{ background: `${app.color || '#6366f1'}22` }}>
            {app.icon || '⚙️'}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2">
              {app.name}
              <span className="font-mono text-xs text-gray-400">v{app.version}</span>
              {app.active
                ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
                : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">Inactive</span>}
              {pending > 0 ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-amber-900/30 border-amber-700/30 text-amber-200">{pending} pending</span> : null}
            </h2>
            <p className="text-xs text-gray-500 truncate">ID {app.id} · {app.slug} · {relativeTime(app.created_at)}</p>
            {app.description && <p className="text-sm text-gray-300 mt-1">{app.description}</p>}
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Details</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Slug</span><span className="text-white font-mono text-xs">{app.slug}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Category</span><span className="text-white">{app.category}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Runtime</span><span className="text-white font-mono text-xs">{app.runtime}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Entrypoint</span><span className="text-white font-mono text-xs truncate max-w-[160px]" title={app.entrypoint}>{app.entrypoint}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Source</span><span className="text-white font-mono text-xs">{app.source}{app.source_url ? ` · ${app.source_url.slice(0, 24)}…` : ''}</span></div>
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Capabilities · {grants.length}</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            {grants.length === 0 && <p className="text-gray-500 text-xs">No capabilities requested.</p>}
            {grants.slice(0, 5).map((g) => (
              <div key={g.id} className="flex justify-between gap-2">
                <span className="text-gray-300 text-xs truncate">{appCapabilityMeta(g.capability)?.label || g.capability}</span>
                <span className={g.granted ? 'text-emerald-300 text-xs' : 'text-amber-300 text-xs'}>{g.granted ? 'granted' : 'pending'}</span>
              </div>
            ))}
            {grants.length > 5 && <p className="text-[11px] text-gray-500">+{grants.length - 5} more — see Configure</p>}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(app.created_at)}>{relativeTime(app.created_at)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Updated</span><span className="text-white text-xs" title={formatDate(app.updated_at)}>{relativeTime(app.updated_at)}</span></div>
            {app.owner_name && <div className="flex justify-between gap-2"><span className="text-gray-400">Owner</span><span className="text-white text-xs">{app.owner_name}</span></div>}
            <div className="pt-1 flex gap-2">
              <button onClick={() => navigate(`/applications/${app.id}/configure`)} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">Configure</button>
              <button onClick={() => navigate(`/applications/${app.id}/edit`)} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Edit</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Recent runs · {runs.length}</h4>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No runs recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {runs.map((r) => (
              <div key={r.id} className="py-2 flex items-center gap-3 text-sm">
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border shrink-0 ${runTone(r.status)}`}>{r.status}</span>
                <span className="text-gray-300 font-mono text-xs shrink-0">{r.target}/{r.exec_mode}</span>
                <span className="text-gray-500 font-mono text-xs shrink-0">exit {r.exit_code}</span>
                {r.node_name && <span className="text-gray-400 text-xs truncate">{r.node_name}</span>}
                <span className="ml-auto text-gray-500 text-xs shrink-0" title={formatDate(r.created_at)}>{relativeTime(r.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate(`/applications/${app.id}/configure`)} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Configure</button>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to applications</button>
      </div>
    </div>
  );
};
export default ApplicationDetail;
