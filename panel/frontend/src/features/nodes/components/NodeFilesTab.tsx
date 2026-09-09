import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listNodeFiles,
  nodeFileDownloadUrl,
  mkdirNodeFile,
  writeNodeFile,
  uploadNodeFile,
  uploadNodeFileFromUrl,
  cloneNodeRepo,
  renameNodeFile,
  deleteNodeFile,
  type NodeFileEntry,
} from '@/shared/api/admin';
import GlassModal from '@/shared/components/ui/Modal';
import ErrorState from '@/shared/components/ui/ErrorState';

interface NodeFilesTabProps {
  nodeId: number;
}

function friendlyGatewayMessage(data: any): string | null {
  // Proxies/gateways (Cloudflare, nginx, tunnels) answer with raw HTML or
  // RFC7807 problem+json when the origin is slow or drops the connection —
  // e.g. a big recursive delete outliving the proxy's response window. The
  // operation may still have completed server-side, so never dump the blob:
  // say what happened and point at the refreshed list.
  const hint = 'The operation may still have completed — the list is refreshed below, check whether the item is gone and retry if not.';
  if (typeof data === 'string') {
    if (/<html|<!doctype/i.test(data)) {
      return `Gateway error: the panel did not answer in time. ${hint}`;
    }
    return null;
  }
  if (data && typeof data === 'object') {
    const d = data as any;
    if (d.cloudflare_error === true || d.error_name === 'origin_bad_gateway' || typeof d.ray_id === 'string') {
      return `Gateway error (502): the panel did not answer in time. ${hint}`;
    }
    if (typeof d.title === 'string' && typeof d.status === 'number' && d.status >= 500 && typeof d.detail === 'string') {
      return `Gateway error (${d.status}): ${d.title}. ${hint}`;
    }
  }
  return null;
}

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  // Network-level failure (no response at all): same may-have-completed
  // story as a gateway timeout.
  if (!e?.response && (e?.code === 'ECONNABORTED' || e?.message === 'Network Error')) {
    return `Request failed before the panel answered (${e?.code === 'ECONNABORTED' ? 'timed out' : 'network error'}). The operation may still have completed — the list is refreshed below, check and retry if needed.`;
  }
  const friendly = friendlyGatewayMessage(data);
  if (friendly) return friendly;
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

// fileKind classifies a file by extension (plus a few well-known
// extension-less names) so every type gets its own icon + accent. Folders
// intentionally share one icon — only files vary.
type FileKind = 'image' | 'archive' | 'code' | 'doc' | 'audio' | 'video' | 'data' | 'binary' | 'file';

const EXT_KIND: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  ico: 'image', bmp: 'image', avif: 'image', tif: 'image', tiff: 'image',
  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive',
  xz: 'archive', rar: 'archive', '7z': 'archive',
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code',
  py: 'code', java: 'code', go: 'code', rs: 'code', c: 'code', h: 'code',
  cpp: 'code', hpp: 'code', cc: 'code', cs: 'code', php: 'code', rb: 'code',
  swift: 'code', kt: 'code', kts: 'code', sh: 'code', bash: 'code', zsh: 'code',
  ps1: 'code', bat: 'code', cmd: 'code', sql: 'code', lua: 'code', pl: 'code',
  css: 'code', scss: 'code', less: 'code', html: 'code', htm: 'code',
  vue: 'code', svelte: 'code', astro: 'code', json: 'code', json5: 'code',
  yml: 'code', yaml: 'code', toml: 'code', xml: 'code', nix: 'code', tf: 'code',
  md: 'doc', markdown: 'doc', txt: 'doc', log: 'doc', ini: 'doc', cfg: 'doc',
  conf: 'doc', config: 'doc', env: 'doc', properties: 'doc', pdf: 'doc',
  rtf: 'doc', tex: 'doc', csv: 'doc', tsv: 'doc',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio',
  m4a: 'audio', aac: 'audio', opus: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video', m4v: 'video',
  db: 'data', sqlite: 'data', sqlite3: 'data', 'db-shm': 'data', 'db-wal': 'data',
  dat: 'data', mca: 'data', mcr: 'data', region: 'data', nbt: 'data',
  schematic: 'data', schem: 'data', litematic: 'data',
  exe: 'binary', jar: 'binary', bin: 'binary', so: 'binary', dll: 'binary',
  msi: 'binary', dmg: 'binary', apk: 'binary', appimage: 'binary', run: 'binary',
  class: 'binary', pyc: 'binary',
};

const NAME_KIND: Record<string, FileKind> = {
  dockerfile: 'code', makefile: 'code', gemfile: 'code', rakefile: 'code',
  vagrantfile: 'code', jenkinsfile: 'code', cmakelists: 'code',
  license: 'doc', readme: 'doc',
};

const KIND_ACCENT: Record<FileKind, string> = {
  image: '#c4b5fd',
  archive: '#fbbf24',
  code: '#38bdf8',
  doc: '#9ca3af',
  audio: '#f472b6',
  video: '#f87171',
  data: '#34d399',
  binary: '#fb923c',
  file: '#9ca3af',
};

function fileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (NAME_KIND[lower]) return NAME_KIND[lower];
  const dot = lower.lastIndexOf('.');
  if (dot > 0 && dot < lower.length - 1) {
    const ext = lower.slice(dot + 1);
    if (EXT_KIND[ext]) return EXT_KIND[ext];
  }
  return 'file';
}

const FileKindIcon: React.FC<{ kind: FileKind; className?: string }> = ({ kind, className = 'w-4 h-4' }) => {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (kind) {
    case 'image':
      return (<svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
    case 'archive':
      return (<svg {...common}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>);
    case 'code':
      return (<svg {...common}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>);
    case 'doc':
      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>);
    case 'audio':
      return (<svg {...common}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>);
    case 'video':
      return (<svg {...common}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
    case 'data':
      return (<svg {...common}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>);
    case 'binary':
      return (<svg {...common}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
    case 'file':
    default:
      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>);
  }
};

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

  // Per-row ⋮ menu (download / rename / copy path / delete). One open at
  // a time, keyed by d:/f: + name like the list keys.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  // Rename dialog: prefilled name input + Save/Cancel.
  const [renameTarget, setRenameTarget] = useState<NodeFileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameErr, setRenameErr] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  // Delete confirm dialog (recursive warning for folders).
  const [deleteTarget, setDeleteTarget] = useState<NodeFileEntry | null>(null);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk selection: left-side checkboxes for multi download / delete.
  // Selection is per-folder — navigating or reloading clears it.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState('');
  const [bulkProgress, setBulkProgress] = useState('');

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    setSelected(new Set());
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
    setSelected(new Set());
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

  // Row menus close on outside-tap / Escape (same manual-dismiss
  // pattern as the + menu above).
  useEffect(() => {
    if (!menuFor) return;
    const onPointerDown = (e: PointerEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (listRef.current && !path.includes(listRef.current)) setMenuFor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuFor]);

  // The select-all checkbox shows the indeterminate dash for partial
  // selections (native property, set imperatively).
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < entries.length;
    }
  }, [selected, entries]);

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
      // A gateway timeout may still have completed server-side — refresh
      // so a retry reports the true state ("already exists") instead of
      // a phantom success path.
      await load(relPath);
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
      await load(relPath);
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
      await load(relPath);
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
      await load(relPath);
    } finally {
      setUploadBusy(false);
    }
  };

  const copyRowPath = async (key: string, full: string) => {
    try {
      await navigator.clipboard.writeText(full);
      setCopiedRow(key);
      setTimeout(() => setCopiedRow(null), 1500);
    } catch {
      // clipboard denied — menu just closes
    }
    setMenuFor(null);
  };

  const openRename = (entry: NodeFileEntry) => {
    setMenuFor(null);
    setRenameTarget(entry);
    setRenameName(entry.name);
    setRenameErr('');
  };

  const doRename = async () => {
    if (!renameTarget) return;
    const err = validateEntryName(renameName);
    if (err) {
      setRenameErr(err);
      return;
    }
    const name = renameName.trim();
    if (name === renameTarget.name) {
      setRenameErr('Enter a different name');
      return;
    }
    if (entries.some((e) => e.name === name)) {
      setRenameErr(`"${name}" already exists here`);
      return;
    }
    setRenameBusy(true);
    setRenameErr('');
    try {
      await renameNodeFile(nodeId, childPath(relPath, renameTarget.name), childPath(relPath, name));
      setRenameTarget(null);
      await load(relPath);
    } catch (e: any) {
      setRenameErr(getErrorMessage(e, 'Rename failed'));
      await load(relPath);
    } finally {
      setRenameBusy(false);
    }
  };

  const openDelete = (entry: NodeFileEntry) => {
    setMenuFor(null);
    setDeleteTarget(entry);
    setDeleteErr('');
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteErr('');
    try {
      await deleteNodeFile(nodeId, childPath(relPath, deleteTarget.name));
      setDeleteTarget(null);
      await load(relPath);
    } catch (e: any) {
      setDeleteErr(getErrorMessage(e, 'Delete failed'));
      await load(relPath);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Bulk selection helpers. Keys are entry names (selection is cleared on
  // every navigation/reload, so names are unambiguous within one folder).
  const toggleOne = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === entries.length && entries.length > 0) return new Set();
      return new Set(entries.map((e) => e.name));
    });
  };

  const selectedEntries = entries.filter((e) => selected.has(e.name));
  const selectedFiles = selectedEntries.filter((e) => !e.is_dir);
  const selectedFolders = selectedEntries.filter((e) => e.is_dir);

  // Bulk download: folders cannot be downloaded, so only the selected
  // files are fetched — one anchor click each, staggered so the browser
  // treats them as one user gesture chain instead of popup spam.
  const downloadSelected = () => {
    selectedFiles.forEach((e, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = nodeFileDownloadUrl(nodeId, childPath(relPath, e.name));
        a.download = e.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 500);
    });
  };

  const openBulkDelete = () => {
    setBulkErr('');
    setBulkProgress('');
    setBulkDeleteOpen(true);
  };

  const doBulkDelete = async () => {
    const targets = entries.filter((e) => selected.has(e.name));
    if (targets.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkBusy(true);
    setBulkErr('');
    let firstErr = '';
    let done = 0;
    for (const e of targets) {
      setBulkProgress(`Deleting ${done + 1} of ${targets.length} — ${e.name}`);
      try {
        await deleteNodeFile(nodeId, childPath(relPath, e.name));
        done++;
      } catch (err: any) {
        if (!firstErr) firstErr = `${e.name}: ${getErrorMessage(err, 'Delete failed')}`;
      }
    }
    setBulkProgress('');
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    await load(relPath);
    // load() resets the banner first, so a partial failure is re-surfaced
    // after the refresh.
    if (firstErr) {
      setError(targets.length === done ? firstErr : `${done} of ${targets.length} deleted. First error — ${firstErr}`);
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
      <ErrorState
        compact
        variant="error"
        title="Could not read this directory"
        description={`${error} — the edge must run a build with the host-files endpoint (/api/edge/hostfiles). Older ksedge binaries answer 404 here; reinstall the edge, then this tab lights up.`}
        retryLabel="Retry"
        onRetry={() => load(relPath)}
      />
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

      {entries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={entries.length > 0 && selected.size === entries.length}
            onChange={toggleAll}
            aria-label={selected.size === entries.length && entries.length > 0 ? 'Deselect all' : 'Select all'}
            className="shrink-0 h-4 w-4 accent-emerald-600 cursor-pointer"
          />
          {selected.size > 0 ? (
            <>
              <span className="text-xs text-gray-300 font-medium">{selected.size} selected</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={downloadSelected}
                disabled={selectedFiles.length === 0}
                title={selectedFiles.length === 0 ? 'Select at least one file to download (folders cannot be downloaded)' : `Download ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'}`}
                className="px-2.5 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download{selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}
              </button>
              <button
                type="button"
                onClick={openBulkDelete}
                title={`Delete ${selected.size} selected item${selected.size === 1 ? '' : 's'}`}
                className="px-2.5 py-1 text-xs rounded-md border border-red-900/40 bg-red-900/20 hover:bg-red-900/40 text-red-200 inline-flex items-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                Delete ({selected.size})
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                title="Clear selection"
                className="px-2 py-1 text-xs rounded-md text-gray-400 hover:text-white hover:bg-white/10"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-[11px] text-gray-500">Tick boxes to download or delete several items at once</span>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-gray-400">This directory is empty.</p>
          <p className="text-[11px] text-gray-500 mt-1">Instance data appears here once workloads deploy on this edge — or add files with the + button.</p>
        </div>
      ) : (
        <div ref={listRef}>
        <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
          {entries.map((e) => {
            const full = childPath(relPath, e.name);
            const key = (e.is_dir ? 'd:' : 'f:') + e.name;
            const kind = e.is_dir ? null : fileKind(e.name);
            const accent = e.is_dir ? undefined : KIND_ACCENT[kind as FileKind];
            const menuId = `node-files-menu-${key}`;
            return (
              <li key={key} className="relative flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={selected.has(e.name)}
                  onChange={() => toggleOne(e.name)}
                  aria-label={`Select ${e.name}`}
                  title={`Select ${e.name}`}
                  className="shrink-0 h-4 w-4 accent-emerald-600 cursor-pointer"
                />
                <span
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.06] border border-white/10 text-gray-300"
                  style={accent ? { color: accent } : undefined}
                  aria-hidden="true"
                >
                  {e.is_dir ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1 2 2H5a2 2 0 0 1-2-2Z" /></svg>
                  ) : (
                    <FileKindIcon kind={kind as FileKind} />
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
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuFor((m) => (m === key ? null : key))}
                    title={`Actions for ${e.name}`}
                    aria-label={`Actions for ${e.name}`}
                    aria-expanded={menuFor === key}
                    aria-haspopup="menu"
                    aria-controls={menuId}
                    className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                  </button>
                  {menuFor === key && (
                    <div
                      id={menuId}
                      role="menu"
                      aria-label={`Actions for ${e.name}`}
                      className="ks-card absolute right-0 top-full mt-1 w-44 rounded-lg p-1 shadow-lg shadow-black/40 z-30"
                    >
                      {!e.is_dir && (
                        <a
                          role="menuitem"
                          href={nodeFileDownloadUrl(nodeId, full)}
                          title={`Download ${e.name}`}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download
                        </a>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openRename(e)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white text-left"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => copyRowPath(key, full)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white text-left"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
                        {copiedRow === key ? 'Copied!' : 'Copy path'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openDelete(e)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-red-300 hover:bg-red-900/30 hover:text-red-200 text-left"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        </div>
      )}
      {truncated && (
        <p className="text-[11px] text-amber-300">Showing the first entries only — this folder is very large.</p>
      )}

      <GlassModal
        open={bulkDeleteOpen}
        onClose={() => { if (!bulkBusy) setBulkDeleteOpen(false); }}
        title={`Delete ${selectedEntries.length} selected item${selectedEntries.length === 1 ? '' : 's'}?`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkBusy}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doBulkDelete}
              disabled={bulkBusy || selectedEntries.length === 0}
              className="px-3 py-1.5 rounded text-sm bg-red-900/40 border border-red-700/40 text-red-200 hover:bg-red-900/60 disabled:opacity-50"
            >
              {bulkBusy ? 'Deleting…' : `Delete (${selectedEntries.length})`}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-200">
          {selectedFolders.length > 0
            ? 'Folders are deleted with everything inside them. This cannot be undone.'
            : 'These files will be deleted. This cannot be undone.'}
        </p>
        <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/30 divide-y divide-white/5">
          {selectedEntries.slice(0, 8).map((e) => (
            <li key={(e.is_dir ? 'd:' : 'f:') + e.name} className="px-2.5 py-1.5 text-xs text-gray-300 font-mono truncate" title={e.name}>
              {e.is_dir ? 'folder / ' : ''}{e.name}
            </li>
          ))}
          {selectedEntries.length > 8 && (
            <li className="px-2.5 py-1.5 text-xs text-gray-500">…and {selectedEntries.length - 8} more</li>
          )}
        </ul>
        {bulkProgress && <p className="text-xs text-sky-300 mt-2">{bulkProgress}</p>}
        {bulkErr && <p className="text-red-400 text-xs mt-2">{bulkErr}</p>}
      </GlassModal>

      <GlassModal
        open={renameTarget !== null}
        onClose={() => { if (!renameBusy) setRenameTarget(null); }}
        title={renameTarget ? `Rename ${renameTarget.is_dir ? 'folder' : 'file'}` : 'Rename'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              disabled={renameBusy}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doRename}
              disabled={renameBusy}
              className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {renameBusy ? 'Renaming…' : 'Save'}
            </button>
          </>
        }
      >
        {renameTarget && (
          <>
            <p className="text-xs text-gray-500 font-mono truncate mb-2" title={childPath(relPath, renameTarget.name)}>
              {childPath(relPath, renameTarget.name)}
            </p>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="node-files-rename-name">New name</label>
            <input
              id="node-files-rename-name"
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); setRenameErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); }}
              maxLength={255}
              autoFocus
              className="ks-input w-full"
            />
            {renameErr && <p className="text-red-400 text-xs mt-2">{renameErr}</p>}
          </>
        )}
      </GlassModal>

      <GlassModal
        open={deleteTarget !== null}
        onClose={() => { if (!deleteBusy) setDeleteTarget(null); }}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : 'Delete'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleteBusy}
              className="px-3 py-1.5 rounded text-sm bg-red-900/40 border border-red-700/40 text-red-200 hover:bg-red-900/60 disabled:opacity-50"
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-gray-200">
              {deleteTarget.is_dir
                ? 'This deletes the folder and everything inside it. This cannot be undone.'
                : 'This deletes the file. This cannot be undone.'}
            </p>
            <p className="text-xs text-gray-500 font-mono truncate mt-2" title={childPath(relPath, deleteTarget.name)}>
              {childPath(relPath, deleteTarget.name)}
            </p>
            {deleteErr && <p className="text-red-400 text-xs mt-2">{deleteErr}</p>}
          </>
        )}
      </GlassModal>

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
