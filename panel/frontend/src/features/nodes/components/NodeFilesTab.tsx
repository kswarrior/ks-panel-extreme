import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listNodeFiles,
  nodeFileDownloadUrl,
  mkdirNodeFile,
  writeNodeFile,
  uploadNodeFile,
  uploadNodeFileFromUrl,
  cloneNodeRepo,
  type NodeFileEntry,
} from '@/shared/api/admin';
import GlassModal from '@/shared/components/ui/Modal';

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

// validateEntryName rejects names that could escape the current directory
// or confuse the listing (separators, dot-dots, empties). The edge jail is
// the real boundary; this is just early UX feedback.
function validateEntryName(raw: string): string {
  const name = raw.trim();
  if (!name) return 'Enter a name';
  if (name === '.' || name === '..') return 'That name is reserved';
  if (name.includes('/') || name.includes('\\')) return 'Names cannot contain / or \\';
  if (name.length > 255) return 'Name is too long (max 255 characters)';
  return '';
}

// basenameFromUrl derives a filename for URL uploads: the URL path's last
// segment, falling back to upload.bin (mirrors the panel's own fallback).
function basenameFromUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs.length ? segs[segs.length - 1] : '';
    if (last && last !== '.' && last !== '..' && !last.includes('\\')) return last;
  } catch {
    // fall through to the fallback below
  }
  return 'upload.bin';
}

type UploadKind = 'local' | 'url' | 'git';

const NodeFilesTab: React.FC<NodeFilesTabProps> = ({ nodeId }) => {
  const [relPath, setRelPath] = useState('/');
  const [entries, setEntries] = useState<NodeFileEntry[]>([]);
  const [root, setRoot] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // + menu (Create / Upload dropdown next to refresh).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Create dialog: File | Folder tabs + name input + Cancel/Create.
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'file' | 'folder'>('file');
  const [createName, setCreateName] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Upload dialog: Local | URL | Git.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind>('local');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadErr, setUploadErr] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // The + menu closes on outside-tap / Escape (same manual-dismiss pattern
  // as the panel's phone pills).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (menuRef.current && !path.includes(menuRef.current)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const segments = relPath.split('/').filter(Boolean);
  const goTo = (p: string) => {
    if (p !== relPath) load(p);
  };
  const goUp = () => {
    if (segments.length === 0) return;
    goTo('/' + segments.slice(0, -1).join('/'));
  };

  const openCreate = () => {
    setMenuOpen(false);
    setCreateKind('file');
    setCreateName('');
    setCreateErr('');
    setCreateOpen(true);
  };

  const openUpload = () => {
    setMenuOpen(false);
    setUploadKind('local');
    setUploadUrl('');
    setUploadErr('');
    setUploadMsg('');
    setUploadProgress('');
    setUploadOpen(true);
  };

  const doCreate = async () => {
    const err = validateEntryName(createName);
    if (err) {
      setCreateErr(err);
      return;
    }
    const name = createName.trim();
    const target = childPath(relPath, name);
    // Refuse to silently overwrite an existing entry.
    if (entries.some((e) => e.name === name)) {
      setCreateErr(`"${name}" already exists here`);
      return;
    }
    setCreateBusy(true);
    setCreateErr('');
    try {
      if (createKind === 'folder') {
        await mkdirNodeFile(nodeId, target);
      } else {
        await writeNodeFile(nodeId, target, '');
      }
      setCreateOpen(false);
      await load(relPath);
    } catch (e: any) {
      setCreateErr(getErrorMessage(e, 'Create failed'));
    } finally {
      setCreateBusy(false);
    }
  };

  const doLocalUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    setUploadErr('');
    setUploadMsg('');
    try {
      let done = 0;
      for (const file of Array.from(files)) {
        const nameErr = validateEntryName(file.name);
        if (nameErr) throw new Error(`"${file.name}": ${nameErr}`);
        setUploadProgress(`Uploading ${done + 1} of ${files.length} — ${file.name}`);
        await uploadNodeFile(nodeId, childPath(relPath, file.name), file);
        done++;
      }
      setUploadProgress('');
      setUploadMsg(files.length === 1 ? 'Upload complete.' : `${done} files uploaded.`);
      await load(relPath);
    } catch (e: any) {
      setUploadProgress('');
      setUploadErr(getErrorMessage(e, 'Upload failed'));
    } finally {
      setUploadBusy(false);
    }
  };

  const doUrlUpload = async () => {
    const raw = uploadUrl.trim();
    if (!raw) {
      setUploadErr('Enter a URL');
      return;
    }
    setUploadBusy(true);
    setUploadErr('');
    setUploadMsg('');
    try {
      const name = basenameFromUrl(raw);
      const res = await uploadNodeFileFromUrl(nodeId, childPath(relPath, name), raw);
      setUploadMsg(`Saved to ${res.path || name}.`);
      await load(relPath);
    } catch (e: any) {
      setUploadErr(getErrorMessage(e, 'URL upload failed'));
    } finally {
      setUploadBusy(false);
    }
  };

  const doGitClone = async () => {
    const raw = uploadUrl.trim();
    if (!raw) {
      setUploadErr('Enter a Git repository URL');
      return;
    }
    setUploadBusy(true);
    setUploadErr('');
    setUploadMsg('');
    try {
      const res = await cloneNodeRepo(nodeId, relPath, raw);
      setUploadMsg(`Cloned into ${res.path || 'the current folder'}.`);
      await load(relPath);
    } catch (e: any) {
      setUploadErr(getErrorMessage(e, 'Git clone failed'));
    } finally {
      setUploadBusy(false);
    }
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
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              title="Create or upload"
              aria-label="Create or upload"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="ks-icon-btn inline-flex items-center justify-center w-8 h-8 rounded-md border border-white/10 bg-white text-black hover:bg-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Create or upload"
                className="ks-card absolute right-0 mt-1.5 w-44 rounded-lg p-1 shadow-lg shadow-black/40 z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={openCreate}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white text-left"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                  Create
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openUpload}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  Upload
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs px-2 py-1.5 rounded border border-red-900/40 bg-red-900/20 text-red-200">{error}</p>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-gray-400">This directory is empty.</p>
          <p className="text-[11px] text-gray-500 mt-1">Instance data appears here once workloads deploy on this edge — or add files with the + button.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
          {entries.map((e) => {
            const full = childPath(relPath, e.name);
            return (
              <li key={(e.is_dir ? 'd:' : 'f:') + e.name} className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.06] border border-white/10 text-gray-300" aria-hidden="true">
                  {e.is_dir ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1 2 2H5a2 2 0 0 1-2-2Z" /></svg>
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

      <GlassModal
        open={createOpen}
        onClose={() => { if (!createBusy) setCreateOpen(false); }}
        title={`Create in ${relPath}`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={createBusy}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doCreate}
              disabled={createBusy}
              className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {createBusy ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <div
          role="tablist"
          aria-label="Create type"
          className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/30 p-1 mb-3"
        >
          {(['file', 'folder'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={createKind === k}
              onClick={() => { setCreateKind(k); setCreateErr(''); }}
              className={`px-3 py-1.5 rounded-md text-sm capitalize transition ${createKind === k ? 'ks-tab-active' : 'text-gray-400 hover:text-white'}`}
            >
              {k === 'file' ? 'File' : 'Folder'}
            </button>
          ))}
        </div>
        <label className="block text-xs text-gray-400 mb-1" htmlFor="node-files-create-name">
          {createKind === 'file' ? 'File name' : 'Folder name'}
        </label>
        <input
          id="node-files-create-name"
          value={createName}
          onChange={(e) => { setCreateName(e.target.value); setCreateErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') doCreate(); }}
          maxLength={255}
          placeholder={createKind === 'file' ? 'notes.txt' : 'new-folder'}
          autoFocus
          className="ks-input w-full"
        />
        {createErr && <p className="text-red-400 text-xs mt-2">{createErr}</p>}
      </GlassModal>

      <GlassModal
        open={uploadOpen}
        onClose={() => { if (!uploadBusy) setUploadOpen(false); }}
        title={`Upload to ${relPath}`}
        footer={
          <button
            type="button"
            onClick={() => setUploadOpen(false)}
            disabled={uploadBusy}
            className="ks-ghost-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            Close
          </button>
        }
      >
        <div
          role="tablist"
          aria-label="Upload source"
          className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/30 p-1 mb-3"
        >
          {(['local', 'url', 'git'] as UploadKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={uploadKind === k}
              onClick={() => { setUploadKind(k); setUploadErr(''); setUploadMsg(''); }}
              className={`px-3 py-1.5 rounded-md text-sm capitalize transition ${uploadKind === k ? 'ks-tab-active' : 'text-gray-400 hover:text-white'}`}
            >
              {k === 'local' ? 'Local' : k === 'url' ? 'URL' : 'Git'}
            </button>
          ))}
        </div>

        {uploadKind === 'local' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Pick files from this device — each lands in the current folder.</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={uploadBusy}
              onChange={(e) => { doLocalUpload(e.target.files); e.target.value = ''; }}
              className="block w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-white/10 file:bg-white/5 file:text-white hover:file:bg-white/10 file:text-xs"
            />
            {uploadProgress && <p className="text-xs text-sky-300">{uploadProgress}</p>}
          </div>
        )}

        {uploadKind === 'url' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">The panel fetches the file and stores it in the current folder.</p>
            <label className="block text-xs text-gray-400" htmlFor="node-files-upload-url">File URL</label>
            <div className="flex gap-2">
              <input
                id="node-files-upload-url"
                value={uploadUrl}
                onChange={(e) => { setUploadUrl(e.target.value); setUploadErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') doUrlUpload(); }}
                placeholder="https://example.com/mod.jar"
                inputMode="url"
                className="ks-input flex-1"
              />
              <button
                type="button"
                onClick={doUrlUpload}
                disabled={uploadBusy}
                className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50 shrink-0"
              >
                {uploadBusy ? 'Fetching…' : 'Upload'}
              </button>
            </div>
          </div>
        )}

        {uploadKind === 'git' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">The edge clones the repository into the current folder (shallow, depth 1).</p>
            <label className="block text-xs text-gray-400" htmlFor="node-files-git-url">Git repository URL</label>
            <div className="flex gap-2">
              <input
                id="node-files-git-url"
                value={uploadUrl}
                onChange={(e) => { setUploadUrl(e.target.value); setUploadErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') doGitClone(); }}
                placeholder="https://github.com/owner/repo.git"
                inputMode="url"
                className="ks-input flex-1"
              />
              <button
                type="button"
                onClick={doGitClone}
                disabled={uploadBusy}
                className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50 shrink-0"
              >
                {uploadBusy ? 'Cloning…' : 'Clone'}
              </button>
            </div>
          </div>
        )}

        {uploadErr && <p className="text-red-400 text-xs mt-2">{uploadErr}</p>}
        {uploadMsg && <p className="text-emerald-300 text-xs mt-2">{uploadMsg}</p>}
      </GlassModal>
    </div>
  );
};

export default NodeFilesTab;
