import React, { useCallback, useEffect, useState } from 'react';
import { listNodeFiles, nodeFileDownloadUrl, type NodeFileEntry } from '@/shared/api/admin';

interface NodeFilesTabProps {
  nodeId: number;
}

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

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

function formatModTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function childPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

const NodeFilesTab: React.FC<NodeFilesTabProps> = ({ nodeId }) => {
  const [relPath, setRelPath] = useState('/');
  const [entries, setEntries] = useState<NodeFileEntry[]>([]);
  const [root, setRoot] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await listNodeFiles(nodeId, p);
      setEntries(Array.isArray(res.entries) ? res.entries : []);
      setRoot(res.root || '');
      setTruncated(!!res.truncated);
      setRelPath(res.path || p);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to list instance files'));
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listNodeFiles(nodeId, '/')
      .then((res) => {
        if (cancelled) return;
        setEntries(Array.isArray(res.entries) ? res.entries : []);
        setRoot(res.root || '');
        setTruncated(!!res.truncated);
        setRelPath(res.path || '/');
      })
      .catch((e: any) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to list instance files'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [nodeId]);

  const segments = relPath.split('/').filter(Boolean);
  const goTo = (p: string) => {
    if (p !== relPath) load(p);
  };
  const goUp = () => {
    if (segments.length === 0) return;
    goTo('/' + segments.slice(0, -1).join('/'));
  };

  if (loading && entries.length === 0 && !error) {
    return (
      <div className="space-y-2 animate-pulse" aria-hidden="true">
        <div className="h-8 rounded bg-white/5" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-white/5" />
        ))}
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-red-400 text-sm">{error}</p>
        <p className="text-[11px] text-gray-500">
          The edge must run a build with the host-files endpoint
          (`/api/edge/hostfiles`). Older ksedge binaries answer 404 here —
          reinstall the edge, then this tab lights up.
        </p>
        <button
          onClick={() => load(relPath)}
          className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <nav aria-label="Instance files breadcrumb" className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => goTo('/')}
              title={root ? `Instances root: ${root}` : 'Instances root'}
              className={`shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10 ${segments.length === 0 ? 'text-white font-medium' : 'text-sky-300'}`}
            >
              root
            </button>
            {segments.map((seg, i) => {
              const p = '/' + segments.slice(0, i + 1).join('/');
              const last = i === segments.length - 1;
              return (
                <span key={p} className="inline-flex items-center gap-1 min-w-0">
                  <span className="text-gray-600">/</span>
                  <button
                    type="button"
                    onClick={() => goTo(p)}
                    title={p}
                    className={`truncate max-w-[10rem] px-1 py-0.5 rounded hover:bg-white/10 ${last ? 'text-white font-medium' : 'text-sky-300'}`}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </nav>
          {root && (
            <p className="mt-0.5 text-[11px] text-gray-500 font-mono truncate" title={root}>
              {root} is the filesystem root — nothing outside it is visible
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {segments.length > 0 && (
            <button
              type="button"
              onClick={goUp}
              title="Up one level"
              aria-label="Up one level"
              className="ks-icon-btn inline-flex items-center justify-center w-8 h-8 rounded-md border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => load(relPath)}
            disabled={loading}
            title="Refresh listing"
            aria-label="Refresh listing"
            className="ks-icon-btn inline-flex items-center justify-center w-8 h-8 rounded-md border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs px-2 py-1.5 rounded border border-red-900/40 bg-red-900/20 text-red-200">{error}</p>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-gray-400">This directory is empty.</p>
          <p className="text-[11px] text-gray-500 mt-1">Instance data appears here once workloads deploy on this edge.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
          {entries.map((e) => {
            const full = childPath(relPath, e.name);
            return (
              <li key={(e.is_dir ? 'd:' : 'f:') + e.name} className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.06] border border-white/10 text-gray-300" aria-hidden="true">
                  {e.is_dir ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  {e.is_dir ? (
                    <button
                      type="button"
                      onClick={() => goTo(full)}
                      title={`Open ${full}`}
                      className="text-sm text-sky-300 hover:text-sky-200 hover:underline truncate block max-w-full text-left"
                    >
                      {e.name}
                    </button>
                  ) : (
                    <p className="text-sm text-gray-200 truncate" title={e.name}>{e.name}</p>
                  )}
                  <p className="text-[11px] text-gray-500 font-mono">
                    {e.is_dir ? 'folder' : formatSize(e.size)}{' · '}{formatModTime(e.mod_time)}
                  </p>
                </div>
                {!e.is_dir && (
                  <a
                    href={nodeFileDownloadUrl(nodeId, full)}
                    title={`Download ${e.name}`}
                    aria-label={`Download ${e.name}`}
                    className="shrink-0 p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {truncated && (
        <p className="text-[11px] text-amber-300">Showing the first entries only — this folder is very large.</p>
      )}
    </div>
  );
};

export default NodeFilesTab;
