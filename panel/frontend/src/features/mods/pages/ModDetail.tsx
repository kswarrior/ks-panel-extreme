import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activateMod, deactivateMod, deleteMod, getMod, getModLogs } from '@/features/mods/api/mods';
import type { Mod, ModLogEntry } from '@/shared/types/mod';
import { modCapabilityMeta, modSourceMeta } from '@/shared/types/mod';
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

function levelColor(level: string): string {
  const l = (level || '').toLowerCase();
  if (l === 'error') return 'text-red-300';
  if (l === 'warn') return 'text-amber-300';
  if (l === 'debug') return 'text-gray-500';
  return 'text-gray-300';
}

const ModDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [mod, setMod] = useState<Mod | null>(null);
  const [logs, setLogs] = useState<ModLogEntry[]>([]);
  const [runState, setRunState] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid mod ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const m = await getMod(numericId);
        if (cancelled) return;
        setMod(m);
        getModLogs(numericId).then((r) => {
          if (!cancelled) {
            setLogs(r.logs || []);
            setRunState(r.state || '');
          }
        }).catch(() => {});
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load mod'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/mods');

  const handleToggle = async () => {
    if (!mod) return;
    setToggling(true);
    try {
      if (mod.active) {
        await deactivateMod(mod.id);
        setMod((p) => (p ? { ...p, active: false } : p));
      } else {
        const res = await activateMod(mod.id);
        if (res && typeof res === 'object' && 'pending' in res) {
          alert((res as any).message || `${(res as any).pending} grants still pending`);
          return;
        }
        setMod((p) => (p ? { ...p, active: true } : p));
      }
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to toggle mod'));
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!mod) return;
    if (!(await confirm({ title: 'Delete mod', message: `Delete mod "${mod.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteMod(mod.id);
      navigate('/mods');
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
          <h2 className="text-xl font-semibold text-white">Mod Detail</h2>
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
  if (!mod) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Mod Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Mod not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const caps = mod.permissions || [];
  const pending = mod.pending ?? caps.filter((c) => !c.granted).length;
  const src = modSourceMeta(mod.source);
  const recent = logs.slice(-20).reverse();

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for mod ${mod.name}`}
          items={[
            { key: 'studio', label: 'Edit in Studio', tone: 'default' },
            { key: 'toggle', label: toggling ? '…' : mod.active ? 'Deactivate' : 'Activate', tone: mod.active ? 'danger' : 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'studio') navigate('/mods/studio');
            if (k === 'toggle') handleToggle();
            if (k === 'delete') handleDelete();
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2 flex-wrap">
            {mod.name}
            <span className="font-mono text-xs text-gray-400">v{mod.version}</span>
            {mod.active
              ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
              : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">Inactive</span>}
            {src ? <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${src.badge}`}>{src.label}</span> : mod.source ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">{mod.source}</span> : null}
            {pending > 0 ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-amber-900/30 border-amber-700/30 text-amber-200">{pending} pending</span> : null}
          </h2>
          <p className="text-xs text-gray-500 truncate mt-1">ID {mod.id} · {mod.slug}{runState ? ` · engine ${runState}` : ''} · {relativeTime(mod.created_at)}</p>
          {mod.description && <p className="text-sm text-gray-300 mt-1">{mod.description}</p>}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Details</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Slug</span><span className="text-white font-mono text-xs">{mod.slug}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Engine</span><span className="text-white font-mono text-xs">v{mod.engine_version ?? 1}</span></div>
            {mod.owner_name && <div className="flex justify-between gap-2"><span className="text-gray-400">Owner</span><span className="text-white text-xs">{mod.owner_name}</span></div>}
            {mod.source_url && <div className="flex justify-between gap-2"><span className="text-gray-400">URL</span><span className="text-white font-mono text-xs truncate max-w-[160px]" title={mod.source_url}>{mod.source_url}</span></div>}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Capabilities · {caps.length}</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            {caps.length === 0 && <p className="text-gray-500 text-xs">No capabilities requested.</p>}
            {caps.slice(0, 5).map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="text-gray-300 text-xs truncate">{modCapabilityMeta(c.capability)?.label || c.capability}</span>
                <span className={c.granted ? 'text-emerald-300 text-xs' : 'text-amber-300 text-xs'}>{c.granted ? 'granted' : 'pending'}</span>
              </div>
            ))}
            {caps.length > 5 && <p className="text-[11px] text-gray-500">+{caps.length - 5} more</p>}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(mod.created_at)}>{relativeTime(mod.created_at)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Updated</span><span className="text-white text-xs" title={formatDate(mod.updated_at)}>{relativeTime(mod.updated_at)}</span></div>
            <div className="pt-1 flex gap-2">
              <button onClick={handleToggle} disabled={toggling} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50">{mod.active ? 'Deactivate' : 'Activate'}</button>
              <button onClick={() => navigate('/mods/studio')} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Studio</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Recent logs · {logs.length}</h4>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No log lines recorded for this mod.</p>
        ) : (
          <pre className="text-[11px] leading-relaxed font-mono bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
            {recent.map((l, i) => (
              <div key={i}><span className="text-gray-500">{l.ts}</span> <span className={levelColor(l.level)}>[{l.level}]</span> <span className="text-gray-200">{l.message}</span></div>
            ))}
          </pre>
        )}
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate('/mods/studio')} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Edit in Studio</button>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to mods</button>
      </div>
    </div>
  );
};
export default ModDetail;
