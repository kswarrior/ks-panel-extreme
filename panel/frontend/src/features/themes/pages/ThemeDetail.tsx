import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteGlobalTheme, downloadTheme, fetchThemeRevisions } from '@/features/themes/api/themes';
import ThemePreview from '@/features/themes/components/ThemePreview';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';

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

const ThemeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const themes = useThemeStore((s) => s.themes);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const assignments = useThemeStore((s) => s.assignments);
  const globalAssignments = useThemeStore((s) => s.globalAssignments);
  const [revCount, setRevCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const theme = useMemo(() => {
    if (!id) return null;
    return globalThemes.find((t) => t.id === id) || themes.find((t) => t.id === id) || null;
  }, [id, globalThemes, themes]);
  const isGlobal = !!id && globalThemes.some((t) => t.id === id);

  useEffect(() => {
    let cancelled = false;
    if (!id || !isGlobal) return;
    fetchThemeRevisions(id).then((revs) => {
      if (!cancelled) setRevCount(revs.length);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, isGlobal]);

  const scopes = useMemo(() => {
    if (!id) return [] as string[];
    const out = new Set<string>();
    for (const [scope, tid] of Object.entries({ ...globalAssignments, ...assignments })) {
      if (tid === id) out.add(scope);
    }
    return [...out];
  }, [id, assignments, globalAssignments]);

  const back = () => navigate('/themes');

  const handleDownload = async () => {
    if (!id || !theme) return;
    try {
      const blob = await downloadTheme(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${theme.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(getErrorMessage(e, 'Download failed'));
    }
  };

  const handleDelete = async () => {
    if (!id || !theme) return;
    if (!(await confirm({ title: 'Delete theme', message: `Delete global theme "${theme.name}"? Scopes pointing at it fall back to default.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteGlobalTheme(id);
      navigate('/themes');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (!id) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Theme Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40"><p className="text-red-400 text-sm">Invalid theme ID</p></GlassCard>
      </div>
    );
  }
  if (!theme) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Theme Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Theme not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for theme ${theme.name}`}
          items={[
            { key: 'studio', label: 'Open in Studio', tone: 'default' },
            { key: 'download', label: 'Download', tone: 'default' },
            ...(isGlobal ? [{ key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' as const }] : []),
          ]}
          onSelect={(k) => {
            if (k === 'studio') navigate('/themes/studio');
            if (k === 'download') handleDownload();
            if (k === 'delete') handleDelete();
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2">
              {theme.name}
              {theme.builtin ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-sky-900/30 border-sky-700/30 text-sky-200">Builtin</span> : null}
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">{isGlobal ? 'Global' : 'Local'}</span>
            </h2>
            <p className="text-xs text-gray-500 truncate">ID {theme.id} · {scopes.length} scope{scopes.length === 1 ? '' : 's'} · updated {relativeTime(theme.updated_at)}</p>
            {theme.description && <p className="text-sm text-gray-300 mt-1">{theme.description}</p>}
          </div>
        </div>
        <div className="mt-3"><ThemePreview theme={theme} /></div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Identity</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">ID</span><span className="text-white font-mono text-xs">{theme.id}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Scope</span><span className="text-white text-xs">{isGlobal ? 'Global library' : 'This browser'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Builtin</span><span className="text-white text-xs">{theme.builtin ? 'Yes' : 'No'}</span></div>
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Assignments · {scopes.length}</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            {scopes.length === 0 && <p className="text-gray-500 text-xs">Not assigned anywhere — it only shows when picked.</p>}
            {scopes.slice(0, 5).map((s) => (
              <div key={s} className="flex justify-between gap-2"><span className="text-white font-mono text-xs truncate">{s}</span></div>
            ))}
            {scopes.length > 5 && <p className="text-[11px] text-gray-500">+{scopes.length - 5} more</p>}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(theme.created_at)}>{relativeTime(theme.created_at) || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Updated</span><span className="text-white text-xs" title={formatDate(theme.updated_at)}>{relativeTime(theme.updated_at) || '—'}</span></div>
            <div className="pt-1 flex gap-2">
              <button onClick={() => navigate('/themes/studio')} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">Open in Studio</button>
              <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Revisions{revCount != null ? ` · ${revCount}` : ''}</h4>
        <p className="text-sm text-gray-400">
          {revCount != null ? `This theme has ${revCount} saved revision${revCount === 1 ? '' : 's'}.` : 'Revision history lives with the global library.'}{' '}
          Open the <Link to="/themes/studio" className="text-sky-300 hover:text-sky-200">Studio</Link> to edit, preview, or roll back this theme.
        </p>
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate('/themes/studio')} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Open in Studio</button>
        {isGlobal && <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to themes</button>
      </div>
    </div>
  );
};
export default ThemeDetail;
