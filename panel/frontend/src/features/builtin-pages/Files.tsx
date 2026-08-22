// Files instance sub-page — built-in page implementation (self-contained).
//
// Renders the per-instance file manager (browsing, upload, mkdir, rename,
// delete, drag-drop) plus the in-panel code/text/image editor
// (InstanceFileEditor) used by the /files/edit route. The whole "Files"
// surface — the editor helpers (FileEntry, FileIcon, the syntax-highlight
// tokenizer + CodeEditor, RowMenu, PromptModal, ProgressCircle) and the two
// components — was moved verbatim out of pages/panel/InstanceDetail.tsx so
// fixes to file handling land here rather than in the legacy monolith.
// Cross-page UI vocabulary is imported from ./_shared.
//
// Default export is the BuiltinPageManifestEntry consumed by
// lib/builtin/index.ts; InstanceFileEditor is also exported so the
// InstanceDetail facade can wrap it as <InstanceFileEditorPage/>.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstance, parseConfig, extractConfig } from '@/shared/hooks/useInstance';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import { isPageAllowed } from '@/shared/utils/instancePages';
import axiosClient from '@/shared/api/client';
import axios from 'axios';
import { formatBytes } from '@/features/instances/components/InstanceCard';
import GlassModal from '@/shared/components/ui/Modal';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

// Module-level constant for file operation timeout (2 minutes)
const FILE_OP_TIMEOUT = 120000;

// Import extracted components
import { CodeEditor, RowMenu, PromptModal, ProgressCircle } from './components/FileManagerComponents';
import { FileIcon } from './components/FileIcons';
import type { FileEntry, FileType, HLMode, RowAction } from './types/files';
import { extOf, fileTypeOf, iconColorFor, editorLangFrom } from './utils/syntaxHighlighter';

export const InstanceFiles: React.FC = () => {
  const { instance, loading, error, instanceId } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [search, setSearch] = useState('');

  // Modal/flavor state
  const [showCreate, setShowCreate] = useState(false);
  const [createTab, setCreateTab] = useState<'file' | 'folder'>('file');
  const [createName, setCreateName] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTab, setUploadTab] = useState<'local' | 'url'>('local');
  const [showRename, setShowRename] = useState<FileEntry | null>(null);
  const navigate = useNavigate();

  // Upload progress + URL upload state.
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlPct, setUrlPct] = useState(0);
  const urlTimerRef = useRef<number | null>(null);

  // Drag-over dropzone state
  const [dragOver, setDragOver] = useState(false);

  // The root path the File Manager opens by default
  const root = useMemo(() => {
    if (!instance) return '/';
    const cfg = extractConfig(parseConfig(instance.config));
    const firstMount = cfg.mounts[0];
    if (firstMount && firstMount.container) return firstMount.container;
    if (instance.kind === 'docker' && cfg.type === 'minecraft') return '/mc';
    return '/';
  }, [instance]);

  useEffect(() => { setPath(root); }, [root]);

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const aborter = useRef<AbortController | null>(null);
  const load = useCallback(async (dir: string) => {
    aborter.current?.abort();
    const ac = new AbortController();
    aborter.current = ac;
    setBusy(true);
    setFilesError('');
    setSelected(new Set());
    try {
      const res = await axiosClient.get(`/api/instances/${instanceId}/files`, {
        params: { op: 'list', path: dir },
        signal: ac.signal,
      });
      const data = res.data || {};
      if (data.error) {
        setEntries([]);
        const hint = data.hint ? ` — ${data.hint}` : '';
        const edge = data.edge ? ` (node ${data.edge})` : '';
        setFilesError(`${data.error}${edge}${hint}`);
        return;
      }
      const raw: FileEntry[] = Array.isArray(data.entries) ? data.entries : [];
      raw.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      setEntries(raw);
    } catch (e: any) {
      if (axios.isCancel?.(e)) return;
      setFilesError(e?.response?.data?.error || e?.message || 'Failed to list files');
      setEntries([]);
    } finally {
      setBusy(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!instance) return;
    load(path);
  }, [path, instance, load]);

  // ----- mutating helpers -----

  const doWrite = useCallback(async (p: string, body: string | Blob, contentType?: string): Promise<void> => {
    const fd = new FormData();
    fd.append('file', body instanceof Blob ? body : new Blob([body], { type: contentType || 'application/octet-stream' }), p.split('/').pop() || 'upload');
    await axiosClient.post(`/api/instances/${instanceId}/files?op=upload&path=${encodeURIComponent(p)}`, fd, {
      timeout: FILE_OP_TIMEOUT,
      onUploadProgress: (ev) => {
        if (ev.total) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
      },
    });
  }, [instanceId]);

  const doMkdir = useCallback(async (p: string): Promise<void> => {
    await axiosClient.post(`/api/instances/${instanceId}/files?op=mkdir&path=${encodeURIComponent(p)}`, undefined, { timeout: FILE_OP_TIMEOUT });
  }, [instanceId]);

  const doDelete = useCallback(async (p: string): Promise<void> => {
    await axiosClient.delete(`/api/instances/${instanceId}/files?op=delete&path=${encodeURIComponent(p)}`, { timeout: FILE_OP_TIMEOUT });
  }, [instanceId]);

  const doRename = useCallback(async (from: string, to: string): Promise<void> => {
    await axiosClient.post(`/api/instances/${instanceId}/files?op=rename&path=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, { timeout: FILE_OP_TIMEOUT });
  }, [instanceId]);

  const doURLUpload = useCallback(async (url: string, targetDir: string): Promise<void> => {
    await axiosClient.post(`/api/instances/${instanceId}/files/url`, { url, path: targetDir.endsWith('/') ? targetDir : targetDir + '/' }, { timeout: FILE_OP_TIMEOUT });
  }, [instanceId]);

  // ---- filtered view ----
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, search]);

  // ---- early returns ----
  if (loading || error || !instance) return <LoadingOrError loading={loading} error={error} kind="files" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="files" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('files', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const crumbs = path.split('/').filter(Boolean);
  const downloadURL = (p: string) => `/api/instances/${instanceId}/files/read?path=${encodeURIComponent(p)}`;

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      flash('ok', okMsg);
      await load(path);
    } catch (e: any) {
      flash('err', e?.response?.data?.error || e?.message || 'Operation failed');
    }
  };

  // ---- row helpers ----

  const entryPath = (e: FileEntry) => joinPath(path, e.name);

  const openEditor = (e: FileEntry) => {
    if (e.is_dir) { setPath(entryPath(e)); return; }
    const kind = fileTypeOf(e);
    if (kind === 'binary') { flash('err', 'Binary file — download to view'); return; }
    navigate(`/instances/${instanceId}/files/edit?path=${encodeURIComponent(entryPath(e))}`);
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ---- top-right action bar actions ----

  const onPickUploadFile = async (file: File) => {
    const target = joinPath(path, file.name);
    await run(() => doWrite(target, file), `Uploaded ${file.name}`);
  };

  const onURLUploadSubmit = async () => {
    const u = urlValue.trim();
    if (!u) { flash('err', 'URL is required'); return; }
    setUrlBusy(true);
    setUrlPct(0);
    if (urlTimerRef.current) clearInterval(urlTimerRef.current);
    urlTimerRef.current = window.setInterval(() => {
      setUrlPct((p) => (p < 90 ? p + 2 : p));
    }, 1200) as unknown as number;
    try {
      await doURLUpload(u, path);
      if (urlTimerRef.current) { clearInterval(urlTimerRef.current); urlTimerRef.current = null; }
      setUrlPct(100);
      flash('ok', 'Uploaded from URL');
      setShowUpload(false);
      setUrlValue('');
      await load(path);
      setTimeout(() => setUrlPct(0), 600);
    } catch (e: any) {
      if (urlTimerRef.current) { clearInterval(urlTimerRef.current); urlTimerRef.current = null; }
      setUrlPct(0);
      flash('err', e?.response?.data?.error || e?.message || 'Upload from URL failed');
    } finally {
      setUrlBusy(false);
    }
  };

  // ---- batch delete ----

  const onDeleteSelection = async () => {
    const names = Array.from(selected);
    if (names.length === 0) return;
    if (!confirm(`Delete ${names.length} item${names.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    await run(async () => {
      await Promise.all(names.map((n) => doDelete(joinPath(path, n))));
    }, `Deleted ${names.length} item${names.length === 1 ? '' : 's'}`);
  };

  // ---- drag-and-drop upload ----

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await run(async () => {
      await Promise.all(files.map((f) => doWrite(joinPath(path, f.name), f)));
    }, `Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`);
  };

  // ---- row actions (the 3-dot menu) ----

  const rowActions = (e: FileEntry): RowAction[] => {
    const acts: RowAction[] = [];
    if (e.is_dir) {
      acts.push({ label: 'Open', onClick: () => setPath(entryPath(e)), icon: <FileIcon kind="folder" className="w-3.5 h-3.5" /> });
    } else {
      acts.push({ label: 'Edit', onClick: () => openEditor(e), icon: <FileIcon kind={fileTypeOf(e)} className="w-3.5 h-3.5" /> });
      acts.push({ label: 'Download', onClick: () => { window.location.href = downloadURL(entryPath(e)); }, icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /> </svg> });
    }
    acts.push({
      label: 'Rename',
      onClick: () => setShowRename(e),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>,
    });
    acts.push({
      label: 'Delete',
      danger: true,
      onClick: () => { if (confirm(`Delete "${e.name}"?`)) run(() => doDelete(entryPath(e)), `Deleted ${e.name}`); },
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /> </svg>,
    });
    return acts;
  };

  // ---- render ----

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Files</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setCreateTab('file'); setCreateName(''); setShowCreate(true); }}
            className="inline-flex items-center gap-1.5 text-xs bg-emerald-600/80 text-white px-3 py-1.5 rounded hover:bg-emerald-500 transition-colors"
            title="Create a new file or folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /> </svg>
            Create
          </button>
          <button
            type="button"
            onClick={() => { setUploadTab('local'); setUploadPct(0); setUrlPct(0); setShowUpload(true); }}
            className="inline-flex items-center gap-1.5 text-xs bg-sky-600/80 text-white px-3 py-1.5 rounded hover:bg-sky-500 transition-colors"
            title="Upload a file (local or from URL)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
            Upload
          </button>
        </div>
      </div>

      <div>
        {/* Breadcrumb + refresh + search + batch-delete */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-gray-300 font-mono overflow-x-auto max-w-full">
            <button type="button" onClick={() => setPath('/')} className="hover:text-white px-1">/</button>
            {crumbs.map((seg, i) => {
              const tgt = '/' + crumbs.slice(0, i + 1).join('/');
              const isLast = i === crumbs.length - 1;
              return (
                <span key={tgt} className="flex items-center gap-1">
                  <button type="button" disabled={isLast} onClick={() => setPath(tgt)} className={isLast ? 'text-white' : 'hover:text-white text-gray-400'}>
                    {seg}
                  </button>
                  <span className="text-gray-600">/</span>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /> </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter…"
                className="bg-black/40 border border-white/10 rounded pl-7 pr-2 py-1 text-xs text-white outline-none focus:border-sky-500 w-32"
              />
            </div>
            {selected.size > 0 && (
              <button type="button" onClick={onDeleteSelection} className="text-xs bg-red-600/80 text-white px-2 py-1 rounded hover:bg-red-500 inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /> </svg>
                Delete ({selected.size})
              </button>
            )}
            <button type="button" onClick={() => load(path)} disabled={busy} className="text-xs border border-white/10 text-gray-200 px-3 py-1 rounded hover:bg-white/10 disabled:opacity-50">
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {filesError && <p className="text-xs text-red-300 mt-2">{filesError}</p>}

        {/* File listing table (drag-and-drop target) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(next)) setDragOver(false);
          }}
          onDrop={onDrop}
          className={`mt-2 rounded-md border bg-black/30 overflow-visible transition-colors ${dragOver ? 'border-sky-400 bg-sky-900/20' : 'border-white/10'}`}
        >
          {filtered.length === 0 && !busy && (
            <p className="text-xs text-gray-500 px-3 py-6 text-center">
              {dragOver ? 'Drop files to upload…' : 'This directory is empty or could not be read'}
            </p>
          )}
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map((e) => {
                const kind = fileTypeOf(e);
                const isSel = selected.has(e.name);
                return (
                  <tr key={e.name} className={`hover:bg-white/[0.04] ${isSel ? 'bg-sky-900/20' : ''}`}>
                    <td className="px-3 py-2 align-middle w-8">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(e.name)}
                        className="accent-sky-500 w-3.5 h-3.5"
                        aria-label={`Select ${e.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle w-8">
                      <span className={iconColorFor(kind)}><FileIcon kind={kind} className="w-4 h-4" /></span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {e.is_dir ? (
                        <button type="button" onClick={() => setPath(entryPath(e))} onDoubleClick={() => setPath(entryPath(e))} className="text-left text-white font-medium hover:underline" title="Open folder">
                          {e.name}
                        </button>
                      ) : (
                        <button type="button" onClick={() => openEditor(e)} className="text-left text-gray-200 hover:text-white hover:underline" title="Open in editor">
                          {e.name}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-right text-xs text-gray-400 font-mono hidden sm:table-cell">{e.is_dir ? '—' : formatBytes(e.size)}</td>
                    <td className="px-3 py-2 align-middle text-right text-xs text-gray-500 hidden md:table-cell">{e.mode ? <span className="font-mono">{e.mode}</span> : ''}</td>
                    <td className="px-3 py-2 align-middle text-right text-xs text-gray-500 hidden md:table-cell">{e.mod_time ? new Date(e.mod_time * 1000).toLocaleString() : ''}</td>
                    <td className="px-2 py-2 align-middle text-right w-10"><RowMenu actions={rowActions(e)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {uploadPct > 0 && uploadPct < 100 && (
          <div className="mt-2 h-1 bg-white/10 rounded overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-xl text-sm ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Create modal — tabs for File / Folder, name input, Create button */}
      <GlassModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateName(''); }}
        title="Create new"
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => { setShowCreate(false); setCreateName(''); }} className="text-xs border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10">Cancel</button>
            <button
              type="button"
              data-create-confirm
              disabled={!createName.trim() || uploadBusy}
              onClick={async () => {
                const name = createName.trim();
                if (!name) return;
                setUploadBusy(true);
                try {
                  if (createTab === 'file') {
                    const p = joinPath(path, name);
                    await axiosClient.post(`/api/instances/${instanceId}/files?op=write&path=${encodeURIComponent(p)}`, '', { headers: { 'Content-Type': 'text/plain' } });
                    flash('ok', `Created ${name}`);
                    setShowCreate(false);
                    setCreateName('');
                    await load(path);
                    navigate(`/instances/${instanceId}/files/edit?path=${encodeURIComponent(p)}`);
                  } else {
                    await doMkdir(joinPath(path, name));
                    flash('ok', `Created ${name}/`);
                    setShowCreate(false);
                    setCreateName('');
                    await load(path);
                  }
                } catch (e: any) {
                  flash('err', e?.response?.data?.error || e?.message || 'Create failed');
                } finally {
                  setUploadBusy(false);
                }
              }}
              className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-500 disabled:opacity-50"
            >
              {uploadBusy ? 'Creating…' : 'Create'}
          </button>
          </>
        }
      >
        {/* Tabs: File / Folder */}
        <div className="flex gap-1 mb-4 border-b border-white/10">
          <button
            type="button"
            onClick={() => setCreateTab('file')}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors ${createTab === 'file' ? 'bg-sky-600/30 text-white border-b-2 border-sky-500' : 'text-gray-400 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /> </svg>
              File
          </span>
        </button>
          <button
            type="button"
            onClick={() => setCreateTab('folder')}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors ${createTab === 'folder' ? 'bg-sky-600/30 text-white border-b-2 border-sky-500' : 'text-gray-400 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000.svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /> </svg>
              Folder
          </span>
        </button>
      </div>

      <label className="block text-xs text-gray-400 mb-1">{createTab === 'file' ? 'File name' : 'Folder name'}</label>
      <input
        autoFocus
        type="text"
        value={createName}
        onChange={(e) => setCreateName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && createName.trim() && !uploadBusy) (document.querySelector('[data-create-confirm]') as HTMLButtonElement | null)?.click(); if (e.key === 'Escape') setShowCreate(false); }}
        placeholder={createTab === 'file' ? 'e.g. server.properties' : 'e.g. plugins'}
        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono outline-none focus:border-sky-500"
      />
      <p className="text-xs text-gray-500 mt-2">Will be created inside <code className="font-mono text-gray-300">{path}</code></p>
    </GlassModal>

      {/* Upload modal — tabs for Local / URL, progress circle for both */}
      <GlassModal
        open={showUpload}
        onClose={() => { setShowUpload(false); setUploadPct(0); setUrlPct(0); setUrlValue(''); setUploadBusy(false); setUrlBusy(false); if (urlTimerRef.current) { clearInterval(urlTimerRef.current); urlTimerRef.current = null; } }}
        title="Upload"
        maxWidth="max-w-md"
        footer={
          uploadTab === 'url' ? (
            <>
              <button type="button" onClick={() => { setShowUpload(false); setUrlPct(0); setUrlValue(''); }} className="text-xs border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10">Cancel</button>
              <button type="button" onClick={onURLUploadSubmit} disabled={urlBusy || !urlValue.trim()} className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-500 disabled:opacity-50">{urlBusy ? 'Uploading…' : 'Upload'}</button>
            </>
          ) : (
            <button type="button" onClick={() => { setShowUpload(false); setUploadPct(0); }} className="text-xs border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10">Close</button>
          )
        }
      >
        {/* Tabs: Local / URL */}
        <div className="flex gap-1 mb-4 border-b border-white/10">
          <button
            type="button"
            onClick={() => setUploadTab('local')}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors ${uploadTab === 'local' ? 'bg-sky-600/30 text-white border-b-2 border-sky-500' : 'text-gray-400 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
              Local
          </span>
        </button>
          <button
            type="button"
            onClick={() => setUploadTab('url')}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors ${uploadTab === 'url' ? 'bg-sky-600/30 text-white border-b-2 border-sky-500' : 'text-gray-400 hover:text-white'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /> </svg>
              URL
          </span>
        </button>
      </div>

      {uploadTab === 'local' ? (
        <div className="space-y-3">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setUploadBusy(true);
                setUploadPct(0);
                try { await onPickUploadFile(f); } finally { setUploadBusy(false); setTimeout(() => setUploadPct(0), 800); }
              }
            }}
            className="block border-2 border-dashed border-white/15 rounded-lg p-6 text-center cursor-pointer hover:border-sky-500 transition-colors"
          >
            <input
              type="file"
              className="hidden"
              onChange={async (e2) => {
                const f = e2.target.files?.[0];
                if (f) {
                  setUploadBusy(true);
                  setUploadPct(0);
                  try { await onPickUploadFile(f); } finally { setUploadBusy(false); setTimeout(() => setUploadPct(0), 800); }
                }
              }}
            />
            <p className="text-sm text-gray-300">Choose a file or drag & drop here</p>
            <p className="text-xs text-gray-500 mt-1">It will be uploaded to <code className="font-mono text-gray-300">{path}</code></p>
          </label>
          {uploadBusy && uploadPct > 0 && (
            <div className="flex items-center justify-center py-2">
              <ProgressCircle pct={uploadPct} />
          </div>
          )}
      </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-gray-400 mb-1">URL (http/https only</label>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && urlValue.trim() && !urlBusy) onURLUploadSubmit(); }}
            placeholder="https://example.com/server.jar"
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono outline-none focus:border-sky-500"
            disabled={urlBusy}
          />
          <p className="text-xs text-gray-500">The file is fetched by the panel (SSRF-guarded) and saved into <code className="font-mono text-gray-300">{path}</code>. Its basename is derived from the URL</p>
          {urlBusy && (
            <div className="flex items-center justify-center py-2">
              <ProgressCircle pct={urlPct} />
          </div>
          )}
      </div>
      )}
    </GlassModal>

    {/* Rename prompt */}
    <PromptModal
      open={!!showRename}
      title="Rename"
      label="New name"
      initial={showRename?.name || ''}
      confirmLabel="Rename"
      onClose={() => setShowRename(null)}
      onConfirm={async (name) => {
        if (!showRename) return;
        await run(() => doRename(entryPath(showRename), joinPath(path, name)), `Renamed to ${name}`);
        setShowRename(null);
      }}
    />
    </div>
  );
};

export const InstanceFileEditor: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filePath = searchParams.get('path') || '';
  const [body, setBody] = useState('');
  const [orig, setOrig] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const fileName = filePath.split('/').pop() || filePath;
  const entry: FileEntry = { name: fileName, size: 0, is_dir: false, mod_time: 0 };
  const mode: HLMode = filePath ? editorLangFrom(entry) : 'plain';
  const downloadURL = (p: string) => `/api/instances/${instanceId}/files/read?path=${encodeURIComponent(p)}`;

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    setBusy(true); setErr(''); setSaved(false); setBody(''); setOrig('');
    (async () => {
      try {
        const res = await axiosClient.get(`/api/instances/${instanceId}/files/read`, { params: { path: filePath }, responseType: 'text', transformResponse: [(d) => d] });
        const text = typeof res.data === 'string' ? res.data : '';
        if (!cancelled) { setBody(text); setOrig(text); }
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.error || e?.message || 'Failed to load file');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, instanceId]);

  const doSave = async () => {
    setBusy(true); setErr('');
    try {
      await axiosClient.post(`/api/instances/${instanceId}/files?op=write&path=${encodeURIComponent(filePath)}`, body, { headers: { 'Content-Type': 'text/plain' }, timeout: FILE_OP_TIMEOUT });
      setOrig(body);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.hint || e?.message || 'Save failed';
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const dirty = body !== orig;

  const ToolBtn: React.FC<{
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    title: string;
    variant: 'ghost' | 'primary' | 'download';
    children: React.ReactNode;
  }> = ({ onClick, href, disabled, title, variant, children }) => {
    const base = 'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const tones = {
      ghost: 'border-white/10 text-gray-200 hover:bg-white/10',
      primary: 'bg-sky-600 border-sky-600 text-white hover:bg-sky-500 hover:border-sky-500',
      download: 'border-white/10 text-gray-200 hover:bg-white/10',
    } as const;
    const cls = `${base} ${tones[variant]}`;
    if (href) {
      return (
        <a href={href} download className={cls} title={title}>
          {children}
        </a>
      );
    }
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
        {children}
      </button>
    );
  };

  const backIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0"><path d="M19 12H5M12 5l-7 7 7 7" /> </svg>
  );
  const saveIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /> </svg>
  );
  const downloadIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /> </svg>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileIcon kind={fileTypeOf(entry)} className="w-4 h-4 shrink-0" />
          <div className="min-w-0 font-mono text-base sm:text-lg leading-tight">
            {filePath && filePath !== '/' && filePath.includes('/') && filePath.lastIndexOf('/') > 0 ? (
              <span className="break-all">
                <span className="text-gray-500">{filePath.slice(0, filePath.lastIndexOf('/'))}</span>
                <span className="text-gray-300">/</span>
                <span className="text-white font-semibold">{fileName}</span>
              </span>
            ) : (
              <span className="text-white font-semibold break-all">{fileName}</span>
            )}
            {!filePath && <span className="text-gray-500">No file selected</span>}
          </div>
          {dirty && <span className="text-xs text-amber-300 shrink-0">● unsaved</span>}
          {saved && <span className="text-xs text-emerald-300 shrink-0">saved</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToolBtn
            variant="ghost"
            onClick={() => navigate(`/instances/${instanceId}/files`)}
            title="Back to file list"
          >
            {backIcon}
            <span className="hidden md:inline">Back</span>
          </ToolBtn>
          <ToolBtn
            variant="primary"
            onClick={doSave}
            disabled={busy || !dirty}
            title="Save (Ctrl/Cmd+S)"
          >
            {saveIcon}
            <span className="hidden md:inline">{busy ? 'Saving…' : 'Save'}</span>
          </ToolBtn>
          <ToolBtn
            variant="download"
            href={downloadURL(filePath)}
            title="Download"
          >
            {downloadIcon}
            <span className="hidden md:inline">Download</span>
          </ToolBtn>
        </div>
      </div>
      {busy && <p className="text-xs text-gray-400">Loading…</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
      {!busy && !err && (
        <div className="glass-card rounded-xl overflow-hidden w-full">
          <CodeEditor value={body} onChange={setBody} mode={mode} onSave={doSave} />
        </div>
      )}
    </div>
  );
};

const Files: BuiltinPageManifestEntry = {
  slug: 'files',
  name: 'Files',
  iconName: 'Files',
  iconSvg: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
  component: InstanceFiles,
};

export default Files;