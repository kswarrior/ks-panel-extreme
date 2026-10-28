import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  archivePaths,
  chmodPath,
  classifyEntry,
  copyPath,
  deletePath,
  downloadFile,
  entryNameError,
  extractArchive,
  fetchFileBlob,
  formatBytes,
  joinPath,
  listFiles,
  makeDir,
  readFileText,
  renamePath,
  searchFiles,
  uploadFile,
  uploadFromUrl,
  writeFile,
  type FileEntry,
  type FileKind,
  type SearchHit,
} from '@/features/instances/api/instanceFiles';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message, type } }));
}

function errText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

function basename(path: string): string {
  const clean = path.replace(/\/+$/, '');
  const i = clean.lastIndexOf('/');
  return i < 0 ? clean : clean.slice(i + 1);
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ICON_PATHS: Record<FileKind, React.ReactNode> = {
  folder: <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  code: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
  text: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  archive: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="9" /><line x1="10" y1="6" x2="14" y2="6" /><line x1="10" y1="9" x2="14" y2="9" /></>,
  binary: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /><path d="M12 8v8" /></>,
};

const ICON_TONE: Record<FileKind, string> = {
  folder: 'text-amber-300',
  image: 'text-fuchsia-300',
  code: 'text-sky-300',
  text: 'text-gray-300',
  archive: 'text-orange-300',
  binary: 'text-gray-500',
};

const FileGlyph: React.FC<{ kind: FileKind }> = ({ kind }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${ICON_TONE[kind]}`} aria-hidden="true">
    {ICON_PATHS[kind]}
  </svg>
);

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
const iconButton = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-500 transition hover:border-white/10 hover:bg-white/10 hover:text-white';

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">{path}</svg>
);

interface PromptState {
  title: string;
  label: string;
  initial: string;
  placeholder?: string;
  actionLabel: string;
  validate?: (value: string) => string;
  onSubmit: (value: string) => Promise<void> | void;
}

interface EditorState {
  path: string;
  name: string;
  content: string;
  original: string;
  imageUrl?: string;
}

const PromptModal: React.FC<{ state: PromptState; onClose: () => void }> = ({ state, onClose }) => {
  const [value, setValue] = useState(state.initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = state.validate?.(value.trim()) || (!value.trim() ? 'Value is required' : '');
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await state.onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(errText(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-white">{state.title}</h3>
        <label className="mt-4 block text-[11px] uppercase tracking-wide text-gray-500">{state.label}</label>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder={state.placeholder}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/60"
        />
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={button} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="inline-flex items-center rounded-lg border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/30 disabled:opacity-40" disabled={busy}>
            {busy ? 'Working…' : state.actionLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

const EditorModal: React.FC<{ state: EditorState; busy: boolean; onClose: () => void; onSave: (content: string) => Promise<void>; onDownload: () => void }> = ({ state, busy, onClose, onSave, onDownload }) => {
  const [content, setContent] = useState(state.content);
  const [saving, setSaving] = useState(false);
  const dirty = content !== state.original;
  const close = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <FileGlyph kind={classifyEntry({ name: state.name, is_dir: false })} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{state.name}</div>
            <div className="truncate text-[11px] text-gray-500">{state.path}</div>
          </div>
          {dirty && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">Unsaved</span>}
          <button type="button" className={button} onClick={onDownload} disabled={busy || saving}>{icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)} Download</button>
          <button type="button" className={button} onClick={close} disabled={saving}>{icon(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>)} Close</button>
        </div>
        {state.imageUrl ? (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(#1f1f1f_0_25%,#151515_0_50%)] bg-[length:20px_20px] p-6">
            <img src={state.imageUrl} alt={state.name} className="max-h-full max-w-full rounded-lg shadow-xl" />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 resize-none bg-[#090b0f] p-4 font-mono text-[13px] leading-relaxed text-gray-200 outline-none"
          />
        )}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <span className="text-[11px] text-gray-500">{state.imageUrl ? 'Image preview' : `${content.length.toLocaleString()} characters`}</span>
          {!state.imageUrl && (
            <button type="button" onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save file'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const InstanceFiles: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const confirm = useConfirm();
  const [dir, setDir] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ entries: SearchHit[]; truncated: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const imageUrls = useRef<string[]>([]);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError('');
    try {
      const rows = await listFiles(instanceId, target);
      rows.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setEntries(rows);
    } catch (e) {
      setError(errText(e, 'Failed to list files'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(dir); }, [dir, load]);

  useEffect(() => () => { imageUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResult(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchFiles(instanceId, dir, q);
        if (alive) setSearchResult(res);
      } catch (e) {
        if (alive) { setSearchResult(null); toast(errText(e, 'Search failed'), 'error'); }
      } finally {
        if (alive) setSearching(false);
      }
    }, 320);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query, dir, instanceId]);

  const navigate = (target: string) => {
    setQuery('');
    setSearchResult(null);
    setDir(target || '/');
  };

  const openEntry = async (entry: FileEntry, path = joinPath(dir, entry.name)) => {
    if (entry.is_dir) { navigate(path); return; }
    const kind = classifyEntry(entry);
    if (kind === 'image') {
      setEditorBusy(true);
      try {
        const blob = await fetchFileBlob(instanceId, path);
        const url = URL.createObjectURL(blob);
        imageUrls.current.push(url);
        setEditor({ path, name: entry.name, content: '', original: '', imageUrl: url });
      } catch (e) {
        toast(errText(e, 'Failed to open image'), 'error');
      } finally {
        setEditorBusy(false);
      }
      return;
    }
    if (kind === 'text' || kind === 'code') {
      setEditorBusy(true);
      try {
        const content = await readFileText(instanceId, path);
        setEditor({ path, name: entry.name, content, original: content });
      } catch (e) {
        toast(errText(e, 'Failed to read file'), 'error');
      } finally {
        setEditorBusy(false);
      }
      return;
    }
    try {
      await downloadFile(instanceId, path);
    } catch (e) {
      toast(errText(e, 'Download failed'), 'error');
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadFile(instanceId, joinPath(dir, file.name), file);
        ok += 1;
      } catch (e) {
        toast(`${file.name}: ${errText(e, 'upload failed')}`, 'error');
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast(`${ok} file${ok === 1 ? '' : 's'} uploaded`, 'success');
      load(dir);
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const crumbs = useMemo(() => {
    const parts = dir.split('/').filter(Boolean);
    const rows: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }];
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      rows.push({ label: part, path: acc });
    }
    return rows;
  }, [dir]);

  const askCreate = (folder: boolean) => setPrompt({
    title: folder ? 'New folder' : 'New file',
    label: 'Name',
    initial: '',
    placeholder: folder ? 'my-folder' : 'notes.txt',
    actionLabel: 'Create',
    validate: entryNameError,
    onSubmit: async (name) => {
      const path = joinPath(dir, name);
      if (folder) await makeDir(instanceId, path);
      else await writeFile(instanceId, path, '');
      toast(folder ? 'Folder created' : 'File created', 'success');
      await load(dir);
    },
  });

  const askRename = (entry: FileEntry) => setPrompt({
    title: 'Rename',
    label: 'New name',
    initial: entry.name,
    actionLabel: 'Rename',
    validate: entryNameError,
    onSubmit: async (name) => {
      if (name === entry.name) return;
      await renamePath(instanceId, joinPath(dir, entry.name), joinPath(dir, name));
      toast('Renamed', 'success');
      await load(dir);
    },
  });

  const askCopy = (entry: FileEntry) => setPrompt({
    title: 'Copy to',
    label: 'Destination path',
    initial: `${dir === '/' ? '' : dir}/${entry.name.replace(/(\.[^./]+)?$/, ' (copy)$1')}`,
    actionLabel: 'Copy',
    onSubmit: async (to) => {
      await copyPath(instanceId, joinPath(dir, entry.name), to);
      toast('Copied', 'success');
      await load(dir);
    },
  });

  const askChmod = (entry: FileEntry) => setPrompt({
    title: 'Permissions',
    label: 'Mode (octal)',
    initial: entry.mode || '644',
    placeholder: '755',
    actionLabel: 'Apply',
    validate: (v) => (/^[0-7]{3,4}$/.test(v) ? '' : 'Use 3 or 4 octal digits'),
    onSubmit: async (mode) => {
      await chmodPath(instanceId, joinPath(dir, entry.name), mode);
      toast('Permissions updated', 'success');
      await load(dir);
    },
  });

  const remove = async (entry: FileEntry) => {
    const ok = await confirm({
      title: `Delete ${entry.is_dir ? 'folder' : 'file'}?`,
      message: `${entry.name}${entry.is_dir ? ' and everything inside it' : ''} will be permanently deleted.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deletePath(instanceId, joinPath(dir, entry.name));
      toast('Deleted', 'success');
      await load(dir);
    } catch (e) {
      toast(errText(e, 'Delete failed'), 'error');
    }
  };

  const extract = async (entry: FileEntry) => {
    try {
      await extractArchive(instanceId, joinPath(dir, entry.name));
      toast('Archive extracted', 'success');
      await load(dir);
    } catch (e) {
      toast(errText(e, 'Extract failed'), 'error');
    }
  };

  const archiveFolder = () => setPrompt({
    title: 'Archive current folder',
    label: 'Archive name',
    initial: `${basename(dir) === '/' ? 'archive' : basename(dir)}.tar.gz`,
    actionLabel: 'Archive',
    validate: (v) => (/\.(zip|tar\.gz)$/i.test(v) ? '' : 'Name must end with .zip or .tar.gz'),
    onSubmit: async (name) => {
      const res = await archivePaths(instanceId, dir, [], joinPath(dir, name));
      toast(`Archived ${res.count} item${res.count === 1 ? '' : 's'}`, 'success');
      await load(dir);
    },
  });

  const askUploadUrl = () => setPrompt({
    title: 'Upload from URL',
    label: 'Remote URL',
    initial: '',
    placeholder: 'https://example.com/file.zip',
    actionLabel: 'Download',
    validate: (v) => (/^https?:\/\//i.test(v) ? '' : 'Enter an http(s) URL'),
    onSubmit: async (url) => {
      await uploadFromUrl(instanceId, dir, url);
      toast('Downloaded to current folder', 'success');
      await load(dir);
    },
  });

  const saveEditor = async (content: string) => {
    if (!editor || editor.imageUrl) return;
    try {
      await writeFile(instanceId, editor.path, content);
      setEditor({ ...editor, content, original: content });
      toast('File saved', 'success');
      load(dir);
    } catch (e) {
      toast(errText(e, 'Failed to save file'), 'error');
    }
  };

  const downloadEntry = async (entry: FileEntry) => {
    try {
      await downloadFile(instanceId, joinPath(dir, entry.name));
    } catch (e) {
      toast(errText(e, 'Download failed'), 'error');
    }
  };

  const searchActive = query.trim().length >= 2;

  return (
    <div className="ks-card ks-form-card relative rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <button type="button" className={iconButton} onClick={() => navigate(dirname(dir))} disabled={dir === '/'} title="Up one level" aria-label="Up one level">
          {icon(<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>)}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs text-gray-400">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              {i > 0 && <span className="text-gray-700">/</span>}
              <button type="button" onClick={() => navigate(c.path)} className={`shrink-0 rounded px-1.5 py-1 hover:bg-white/10 hover:text-white ${i === crumbs.length - 1 ? 'text-white' : ''}`}>
                {c.label}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button type="button" className={button} onClick={() => load(dir)} disabled={loading}>
          {icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)}
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="relative min-w-[180px] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500">{icon(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this folder…"
            className="w-full rounded-lg border border-white/10 bg-black/20 py-1.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-gray-600 focus:border-sky-400/50"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-white" aria-label="Clear search">
              {icon(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>)}
            </button>
          )}
        </div>
        <button type="button" className={button} onClick={() => askCreate(false)}>{icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></>)} <span className="hidden sm:inline">New file</span></button>
        <button type="button" className={button} onClick={() => askCreate(true)}>{icon(<><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /><line x1="12" y1="10" x2="12" y2="16" /><line x1="9" y1="13" x2="15" y2="13" /></>)} <span className="hidden sm:inline">New folder</span></button>
        <button type="button" className={button} onClick={() => fileInput.current?.click()} disabled={uploading}>{icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>)} {uploading ? 'Uploading…' : <span className="hidden sm:inline">Upload</span>}</button>
        <button type="button" className={button} onClick={askUploadUrl}>{icon(<><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></>)} <span className="hidden md:inline">From URL</span></button>
        {dir !== '/' && <button type="button" className={button} onClick={archiveFolder}>{icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="9" /><line x1="10" y1="6" x2="14" y2="6" /></>)} <span className="hidden md:inline">Archive</span></button>}
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>

      <div className="relative">
        {searchActive && (
          <div className="border-b border-white/10 bg-black/20">
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-500">
              <span>{searching ? 'Searching…' : `${searchResult?.entries.length ?? 0} result${(searchResult?.entries.length ?? 0) === 1 ? '' : 's'}`}</span>
              {searchResult?.truncated && <span className="text-amber-300">limited results</span>}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {(searchResult?.entries ?? []).map((hit) => {
                const kind = classifyEntry({ name: hit.name, is_dir: hit.is_dir });
                const hitPath = joinPath(dir, hit.path);
                return (
                  <button
                    key={hit.path}
                    type="button"
                    onClick={() => {
                      if (hit.is_dir) navigate(hitPath);
                      else openEntry({ name: hit.name, size: hit.size, mode: '', is_dir: false, mod_time: hit.mod_time }, hitPath);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-white/[0.06]"
                  >
                    <FileGlyph kind={kind} />
                    <span className="truncate">{hit.path}</span>
                    {!hit.is_dir && <span className="ml-auto shrink-0 text-[10px] text-gray-500">{formatBytes(hit.size)}</span>}
                  </button>
                );
              })}
              {!searching && searchResult && searchResult.entries.length === 0 && <p className="px-3 py-3 text-xs text-gray-500">No matches.</p>}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-white/[0.05]" />)}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <button type="button" className={`${button} mt-3`} onClick={() => load(dir)}>Retry</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">This folder is empty.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Modified</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Mode</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const kind = classifyEntry(entry);
                  const isArchive = kind === 'archive';
                  return (
                    <tr key={entry.name} className="group border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04]">
                      <td className="max-w-[380px] px-3 py-1.5">
                        <button type="button" onClick={() => openEntry(entry)} className="flex min-w-0 items-center gap-2 text-left text-gray-200 hover:text-white" title={entry.name}>
                          <FileGlyph kind={kind} />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-500">{entry.is_dir ? '—' : formatBytes(entry.size)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-1.5 text-gray-500 md:table-cell">{fmtDate(entry.mod_time)}</td>
                      <td className="hidden px-3 py-1.5 font-mono text-[11px] text-gray-500 lg:table-cell">{entry.mode || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <div className="flex items-center justify-end gap-0.5 opacity-70 transition group-hover:opacity-100">
                          {isArchive && (
                            <button type="button" className={iconButton} onClick={() => extract(entry)} title="Extract archive" aria-label="Extract archive">
                              {icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
                            </button>
                          )}
                          {!entry.is_dir && (
                            <button type="button" className={iconButton} onClick={() => downloadEntry(entry)} title="Download" aria-label="Download">
                              {icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
                            </button>
                          )}
                          <button type="button" className={iconButton} onClick={() => askRename(entry)} title="Rename" aria-label="Rename">
                            {icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>)}
                          </button>
                          <button type="button" className={iconButton} onClick={() => askCopy(entry)} title="Copy" aria-label="Copy">
                            {icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)}
                          </button>
                          <button type="button" className={iconButton} onClick={() => askChmod(entry)} title="Permissions" aria-label="Permissions">
                            {icon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />)}
                          </button>
                          <button type="button" className={`${iconButton} hover:text-red-300`} onClick={() => remove(entry)} title="Delete" aria-label="Delete">
                            {icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>)}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[11px] text-gray-500">
        <span>{entries.length} item{entries.length === 1 ? '' : 's'}{dir !== '/' ? ` in ${dir}` : ''}</span>
        <span>Click a text file to edit it · images open in preview</span>
      </div>

      {editorBusy && <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-sky-400/70" />}
      {prompt && <PromptModal state={prompt} onClose={() => setPrompt(null)} />}
      {editor && (
        <EditorModal
          state={editor}
          busy={editorBusy}
          onClose={() => {
            if (editor.imageUrl) URL.revokeObjectURL(editor.imageUrl);
            setEditor(null);
          }}
          onSave={saveEditor}
          onDownload={() => downloadFile(instanceId, editor.path).catch((e) => toast(errText(e, 'Download failed'), 'error'))}
        />
      )}
    </div>
  );
};

export default InstanceFiles;
