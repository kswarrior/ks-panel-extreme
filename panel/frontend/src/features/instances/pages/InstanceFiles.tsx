import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstance, parseConfig } from '@/shared/hooks/useInstance';
import { resolveInstanceControls, normalizeFilesPath, isPathWithinHome } from '@/features/instances/utils/instanceControls';
import Modal from '@/shared/components/ui/Modal';
import ErrorState from '@/shared/components/ui/ErrorState';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';
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
  renamePath,
  searchFiles,
  uploadFile,
  uploadFromUrl,
  writeFile,
  type FileEntry,
  type SearchHit,
} from '../api/instanceFiles';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

// computeRoot mirrors the old file-manager rule: first volume mount's
// container path wins, docker+minecraft falls back to /mc, else /.
function computeRoot(instance: any): string {
  try {
    let cfg: any = instance?.config;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch {
        cfg = {};
      }
    }
    if (!cfg || typeof cfg !== 'object') cfg = {};
    const mounts = Array.isArray(cfg.mounts) ? cfg.mounts : [];
    for (const m of mounts) {
      if (m && typeof m === 'object') {
        const first = m.container || m.target || m.destination || '';
        if (first) return String(first);
      }
    }
    if (instance?.kind === 'docker' && (cfg as any).type === 'minecraft') return '/mc';
  } catch {
    /* ignore */
  }
  return '/';
}

const KIND_TONE: Record<string, string> = {
  folder: 'var(--ks-warn)',
  image: 'var(--ks-pink)',
  code: 'var(--ks-info)',
  archive: 'var(--ks-warn)',
  text: 'var(--ks-secondary)',
  binary: 'var(--ks-muted)',
};

const FileGlyph: React.FC<{ kind: string }> = ({ kind }) => {
  const inner =
    kind === 'folder' ? (
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    ) : kind === 'image' ? (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ) : kind === 'code' ? (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ) : kind === 'archive' ? (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 7v3" />
        <path d="M12 13v3" />
      </>
    ) : (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 16, height: 16 }}
      aria-hidden="true"
    >
      {inner}
    </svg>
  );
};

interface DropItem {
  file: File;
  rel: string;
}

// walkEntry flattens a dropped filesystem tree into {file, rel} pairs
// (depth + count capped) so dropped folders recreate under the current dir.
function walkEntry(entry: FileSystemEntry, prefix: string, out: DropItem[], depth: number): Promise<void> {
  return new Promise((resolve) => {
    if (!entry || depth > 8 || out.length >= 500) {
      resolve();
      return;
    }
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (f) => {
          out.push({ file: f, rel: prefix + entry.name });
          resolve();
        },
        () => resolve(),
      );
      return;
    }
    if (!entry.isDirectory) {
      resolve();
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const sub = `${prefix}${entry.name}/`;
    const next = (): void => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve();
            return;
          }
          Promise.all(batch.map((ent) => walkEntry(ent, sub, out, depth + 1))).then(next);
        },
        () => resolve(),
      );
    };
    next();
  });
}

function collectDrop(dt: DataTransfer | null): Promise<DropItem[]> {
  return new Promise((resolve) => {
    const plain: DropItem[] = Array.prototype.slice
      .call((dt && dt.files) || [])
      .map((f: File) => ({ file: f, rel: (f as any).webkitRelativePath || f.name }));
    const items = dt && dt.items;
    if (!items || !items.length || typeof items[0].webkitGetAsEntry !== 'function') {
      resolve(plain);
      return;
    }
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const en = items[i].webkitGetAsEntry();
        if (en) entries.push(en);
      } catch {
        /* ignore */
      }
    }
    if (!entries.length) {
      resolve(plain);
      return;
    }
    const out: DropItem[] = [];
    Promise.all(entries.map((en) => walkEntry(en, '', out, 0))).then(() => {
      resolve(out.length ? out : plain);
    });
  });
}

type ModalState =
  | { kind: 'create'; tab: 'file' | 'folder'; name: string; busy: boolean }
  | { kind: 'upload'; tab: 'local' | 'url'; busy: boolean; queueLen: number; pct: number; label: string; url: string }
  | { kind: 'rename'; from: string; name: string; busy: boolean }
  | { kind: 'chmod'; targets: string[]; isDir: boolean; mode: string; recursive: boolean; busy: boolean }
  | { kind: 'copy'; names: string[]; dest: string; busy: boolean }
  | { kind: 'move'; names: string[]; dest: string; busy: boolean }
  | { kind: 'archive'; names: string[]; file: string; format: 'zip' | 'targz'; busy: boolean }
  | { kind: 'extract'; archive: string; dest: string; busy: boolean }
  | { kind: 'preview'; entry: FileEntry; fullPath: string };

type SortKey = 'name' | 'size' | 'mode' | 'mod_time';

function isArchiveName(name: string): boolean {
  const l = name.toLowerCase();
  return l.endsWith('.zip') || l.endsWith('.tar.gz') || l.endsWith('.tgz');
}

// duplicateName("server.jar") → "server-copy.jar"; ("world") → "world-copy".
function duplicateName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)}-copy${name.slice(dot)}`;
  return `${name}-copy`;
}

// modeToTriples("755") → [7,5,5]; unparseable → [0,0,0] (fail-closed,
// the confirm step re-validates octal anyway).
function modeToTriples(mode: string): [number, number, number] {
  const m = String(mode || '').trim().replace(/^0+/, '') || '0';
  const digits = m.slice(-3).split('').map((c) => {
    const n = parseInt(c, 8);
    return Number.isFinite(n) ? n : 0;
  });
  while (digits.length < 3) digits.unshift(0);
  return [digits[0] & 7, digits[1] & 7, digits[2] & 7];
}

function triplesToMode(t: [number, number, number]): string {
  return `${t[0] & 7}${t[1] & 7}${t[2] & 7}`;
}

function rwx(n: number): string {
  return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
}

const InstanceFiles: React.FC<{ instanceId: number; filesSlug: string }> = ({ instanceId, filesSlug }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { instance } = useInstance(instanceId);

  const root = useMemo(() => computeRoot(instance), [instance?.config, instance?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Files home + jail from Instance Controls (template shortcut config,
  // snapshotted per instance). Empty home = legacy mount-root behaviour.
  const filesCfg = useMemo(() => resolveInstanceControls(instance?.config).shortcuts.files, [instance?.config]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = useMemo(
    () => (filesCfg.files_home ? normalizeFilesPath(filesCfg.files_home) : root),
    [filesCfg.files_home, root],
  );
  const jail = filesCfg.files_jail && home !== '/';
  // goPath is the only way to change directory: under jail anything above
  // home clamps back to home, while everything inside stays reachable.
  const goPath = useCallback(
    (next: string) => {
      const target = normalizeFilesPath(next);
      setPath(jail && !isPathWithinHome(home, target) ? home : target);
    },
    [jail, home],
  );
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showHidden, setShowHidden] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const seqRef = useRef(0);
  const pathRef = useRef<string | null>(null);
  pathRef.current = path;
  const idleRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Seed the path at the home folder once it is known; re-clamp into home
  // if the controls snapshot arrives/changes underneath an open directory.
  useEffect(() => {
    if (path === null && instance) setPath(home);
    else if (path !== null && jail && !isPathWithinHome(home, path)) setPath(home);
  }, [instance, home, path, jail]);

  const load = useCallback(
    async (dir: string, silent = false) => {
      const seq = ++seqRef.current;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const rows = await listFiles(instanceId, dir);
        if (seqRef.current !== seq) return;
        rows.sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
        });
        setEntries(rows);
        setError('');
        // Retain checkbox selection across refreshes for names still present.
        setSelected((prev) => {
          const keep: Record<string, boolean> = {};
          for (const k of Object.keys(prev)) {
            if (prev[k] && rows.some((r) => r.name === k)) keep[k] = true;
          }
          return keep;
        });
      } catch (e: any) {
        if (seqRef.current !== seq) return;
        setError(e?.message || 'Failed to list files');
        setEntries([]);
      } finally {
        if (seqRef.current === seq) setLoading(false);
      }
    },
    [instanceId],
  );

  useEffect(() => {
    if (path !== null) void load(path);
  }, [path, load]);

  // Idle auto-refresh every 15s — paused while a modal/menu is open, while
  // rows are selected, or while the tab is hidden.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!idleRef.current || document.hidden) return;
      const dir = pathRef.current;
      if (dir !== null) void load(dir, true);
    }, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    idleRef.current = modal === null && Object.keys(selected).length === 0;
  }, [modal, selected]);

  const selCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const selNames = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const toggleSort = useCallback((key: SortKey) => {
    // NOTE: no setState-inside-updater here — updaters must stay pure or
    // StrictMode double-invocation toggles twice and nets no change.
    if (key === sortKey) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(key !== 'size');
    }
  }, [sortKey]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let rows = entries;
    if (!showHidden) rows = rows.filter((e) => !e.name.startsWith('.'));
    if (q) rows = rows.filter((e) => e.name.toLowerCase().includes(q));
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let c = 0;
      if (sortKey === 'name') c = String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
      else if (sortKey === 'size') c = (a.size || 0) - (b.size || 0) || String(a.name).localeCompare(String(b.name));
      else if (sortKey === 'mode') c = String(a.mode || '').localeCompare(String(b.mode || '')) || String(a.name).localeCompare(String(b.name));
      else c = (a.mod_time || 0) - (b.mod_time || 0) || String(a.name).localeCompare(String(b.name));
      return c * dir;
    });
  }, [entries, filter, showHidden, sortKey, sortAsc]);
  const allVisibleChecked = filtered.length > 0 && filtered.every((e) => selected[e.name]);

  // Under jail the crumbs show only the home-relative tail; the leading
  // button jumps to home instead of the filesystem root.
  const homeSegs = useMemo(() => home.split('/').filter(Boolean), [home]);
  const crumbs = useMemo(() => {
    const segs = (path ?? '').split('/').filter(Boolean);
    if (!jail) return segs;
    return segs.slice(homeSegs.length);
  }, [path, jail, homeSegs]);
  const openEditor = useCallback(
    (fullPath: string) => {
      navigate(`/instances/${instanceId}/${filesSlug}/edit?path=${encodeURIComponent(fullPath)}`);
    },
    [navigate, instanceId, filesSlug],
  );

  const onRowOpen = (e: FileEntry) => {
    if (!path) return;
    if (e.is_dir) {
      goPath(joinPath(path, e.name));
      return;
    }
    const kind = classifyEntry(e);
    if (kind === 'image') {
      void openPreview(e);
      return;
    }
    if (kind === 'binary' || kind === 'archive') {
      toast('Binary file — download to view', 'error');
      return;
    }
    openEditor(joinPath(path, e.name));
  };

  const onDownload = async (e: FileEntry) => {
    if (!path) return;
    try {
      await downloadFile(instanceId, joinPath(path, e.name));
      toast(`Downloading ${e.name}`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Download failed', 'error');
    }
  };

  const onDeleteOne = async (e: FileEntry) => {
    if (!path) return;
    const ok = await confirm({
      title: e.is_dir ? 'Delete folder' : 'Delete file',
      message: e.is_dir
        ? `Delete folder "${e.name}" and ALL its contents? This cannot be undone.`
        : `Delete file "${e.name}"? This cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deletePath(instanceId, joinPath(path, e.name));
      toast(`Deleted ${e.name}`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Delete failed', 'error');
    }
  };

  const onDeleteSelected = async () => {
    if (!path) return;
    const names = Object.keys(selected).filter((k) => selected[k]);
    if (!names.length) return;
    const ok = await confirm({
      title: 'Delete selected',
      message: `Delete ${names.length} item${names.length === 1 ? '' : 's'}? This cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    let failed = 0;
    await Promise.all(
      names.map((n) =>
        deletePath(instanceId, joinPath(path as string, n)).catch((err: any) => {
          failed++;
          toast(`${n}: ${err?.message || 'failed'}`, 'error');
        }),
      ),
    );
    if (failed === 0) toast(`Deleted ${names.length} item${names.length === 1 ? '' : 's'}`, 'success');
    void load(path);
  };

  const onCreateConfirm = async () => {
    if (modal?.kind !== 'create' || !path) return;
    const name = modal.name.trim();
    const bad = entryNameError(name);
    if (bad) {
      toast(bad, 'error');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      const p = joinPath(path, name);
      if (modal.tab === 'file') {
        await writeFile(instanceId, p, '');
        setModal(null);
        toast(`Created ${name}`, 'success');
        void load(path);
        window.setTimeout(() => openEditor(p), 350);
      } else {
        await makeDir(instanceId, p);
        setModal(null);
        toast(`Created ${name}/`, 'success');
        void load(path);
      }
    } catch (err: any) {
      toast(err?.message || 'Create failed', 'error');
      setModal((m) => (m?.kind === 'create' ? { ...m, busy: false } : m));
    }
  };

  const onRenameConfirm = async () => {
    if (modal?.kind !== 'rename' || !path) return;
    const nn = modal.name.trim();
    const bad = entryNameError(nn);
    if (bad) {
      toast(bad, 'error');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      await renamePath(instanceId, joinPath(path, modal.from), joinPath(path, nn));
      setModal(null);
      toast(`Renamed to ${nn}`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Rename failed', 'error');
      setModal((m) => (m?.kind === 'rename' ? { ...m, busy: false } : m));
    }
  };

  const onDuplicate = async (e: FileEntry) => {
    if (!path) return;
    const dest = duplicateName(e.name);
    try {
      await copyPath(instanceId, joinPath(path, e.name), joinPath(path, dest));
      toast(`Duplicated as ${dest}`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Duplicate failed', 'error');
    }
  };

  const onCopyMoveConfirm = async () => {
    if ((modal?.kind !== 'copy' && modal?.kind !== 'move') || !path) return;
    const isMove = modal.kind === 'move';
    const destDir = modal.dest.trim() || path;
    setModal({ ...modal, busy: true });
    let ok = 0;
    let failed = 0;
    for (const n of modal.names) {
      try {
        const from = joinPath(path, n);
        const to = destDir.endsWith('/') ? `${destDir}${n}` : `${destDir}/${n}`;
        if (isMove) await renamePath(instanceId, from, to);
        else await copyPath(instanceId, from, to);
        ok++;
      } catch (err: any) {
        failed++;
        toast(`${n}: ${err?.message || 'failed'}`, 'error');
      }
    }
    setModal(null);
    if (failed === 0) toast(`${isMove ? 'Moved' : 'Copied'} ${ok} item${ok === 1 ? '' : 's'} → ${destDir}`, 'success');
    void load(path);
  };

  const onChmodConfirm = async () => {
    if (modal?.kind !== 'chmod' || !path) return;
    const m = modal.mode.trim().replace(/^0+/, '') || '0';
    if (!/^[0-7]{1,3}$/.test(m)) {
      toast('Mode must be octal 000–777 (e.g. 644)', 'error');
      return;
    }
    const norm = m.padStart(3, '0');
    setModal({ ...modal, busy: true });
    try {
      for (const t of modal.targets) {
        const target = joinPath(path, t);
        await chmodPath(instanceId, target, norm);
        if (modal.recursive) {
          const rows = await listFiles(instanceId, target).catch(() => []);
          await Promise.all(
            rows.map((r) => chmodPath(instanceId, `${target}/${r.name}`, norm).catch(() => {})),
          );
        }
      }
      setModal(null);
      setSelected({});
      toast(`Permissions → ${norm} (${modal.targets.length} item${modal.targets.length === 1 ? '' : 's'})`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'chmod failed', 'error');
      setModal((mm) => (mm?.kind === 'chmod' ? { ...mm, busy: false } : mm));
    }
  };

  const onArchiveConfirm = async () => {
    if (modal?.kind !== 'archive' || !path) return;
    let file = modal.file.trim();
    if (!file) {
      toast('Archive name is required', 'error');
      return;
    }
    if (!/\.zip$/i.test(file) && !/\.tar\.gz$/i.test(file) && !/\.tgz$/i.test(file)) {
      file += modal.format === 'zip' ? '.zip' : '.tar.gz';
    }
    const bad = entryNameError(file);
    if (bad) {
      toast(bad, 'error');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      await archivePaths(instanceId, path, modal.names, joinPath(path, file));
      setModal(null);
      toast(`Archived → ${file}`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Archive failed', 'error');
      setModal((mm) => (mm?.kind === 'archive' ? { ...mm, busy: false } : mm));
    }
  };

  const onExtractConfirm = async () => {
    if (modal?.kind !== 'extract' || !path) return;
    setModal({ ...modal, busy: true });
    try {
      await extractArchive(instanceId, joinPath(path, modal.archive), modal.dest.trim() || undefined);
      setModal(null);
      toast(`Extracted ${modal.archive}`, 'success');
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Extract failed', 'error');
      setModal((mm) => (mm?.kind === 'extract' ? { ...mm, busy: false } : mm));
    }
  };

  const runSearch = useCallback(
    async (q: string) => {
      const dir = pathRef.current;
      if (!dir || !q.trim()) {
        setSearchHits(null);
        return;
      }
      setSearching(true);
      try {
        const r = await searchFiles(instanceId, dir, q.trim());
        setSearchHits(r.entries);
        setSearchTruncated(r.truncated);
      } catch (err: any) {
        toast(err?.message || 'Search failed', 'error');
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    },
    [instanceId],
  );

  const clearSearch = useCallback(() => {
    setSearchHits(null);
    setSearchTruncated(false);
    setFilter('');
  }, []);

  // openPreview loads a light preview: images as object URLs, text/code up
  // to ~256 KiB as truncated text. Anything else falls back to download.
  const openPreview = useCallback(
    async (e: FileEntry) => {
      if (!path) return;
      const fullPath = joinPath(path, e.name);
      // Revoke the previous object URL before replacing it: opening preview
      // B straight from preview A never flips modal.kind, so the cleanup
      // effect below wouldn't run and the old blob would leak.
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewText(null);
      setModal({ kind: 'preview', entry: e, fullPath });
      try {
        if (e.size > 8 * 1024 * 1024) {
          setPreviewText(null);
          return; // too big — modal offers download instead
        }
        const blob = await fetchFileBlob(instanceId, fullPath);
        if (classifyEntry(e) === 'image') {
          setPreviewUrl(URL.createObjectURL(blob));
        } else {
          const t = await blob.text();
          setPreviewText(t.length > 256 * 1024 ? `${t.slice(0, 256 * 1024)}\n… [truncated]` : t);
        }
      } catch (err: any) {
        toast(err?.message || 'Preview failed', 'error');
      }
    },
    [instanceId, path],
  );

  useEffect(() => {
    if (modal?.kind !== 'preview') {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewText(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.kind]);

  const downloadAsZip = useCallback(
    async (names: string[], label: string) => {
      const dir = pathRef.current;
      if (!dir || !names.length) return;
      const stamp = new Date().toISOString().slice(0, 10);
      const tmp = `_ks-dl-${stamp}-${Date.now().toString(36)}.zip`;
      try {
        toast(`Compressing ${label}…`, 'info');
        await archivePaths(instanceId, dir, names, joinPath(dir, tmp));
        await downloadFile(instanceId, joinPath(dir, tmp));
        toast(`Downloading ${label}`, 'success');
      } catch (err: any) {
        toast(err?.message || 'Download failed', 'error');
      } finally {
        try {
          await deletePath(instanceId, joinPath(dir, tmp));
        } catch {
          /* temp cleanup is best-effort */
        }
        void load(dir);
      }
    },
    [instanceId, load],
  );

  const onBulkChmod = () => {
    if (!selNames.length) return;
    const first = entries.find((e) => e.name === selNames[0]);
    setModal({ kind: 'chmod', targets: selNames, isDir: selNames.some((n) => entries.find((e) => e.name === n)?.is_dir), mode: String(first?.mode || '644'), recursive: false, busy: false });
  };

  const runUploadQueue = useCallback(
    async (items: DropItem[]) => {
      const dir = pathRef.current;
      if (!dir || !items.length) return;
      setModal((m) => (m?.kind === 'upload' ? { ...m, busy: true, queueLen: items.length, pct: 1, label: '' } : m));
      let ok = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setModal((m) =>
          m?.kind === 'upload'
            ? { ...m, pct: Math.round((i / items.length) * 100) || 1, label: `${i + 1}/${items.length} · ${it.rel}` }
            : m,
        );
        try {
          const slash = it.rel.lastIndexOf('/');
          if (slash > 0) await makeDir(instanceId, joinPath(dir, it.rel.slice(0, slash)));
          await uploadFile(instanceId, joinPath(dir, it.rel), it.file);
          ok++;
        } catch (err: any) {
          failed++;
          toast(`${it.rel}: ${err?.message || 'upload failed'}`, 'error');
        }
      }
      setModal((m) => (m?.kind === 'upload' ? { ...m, pct: 100, label: '' } : m));
      toast(
        failed === 0 ? `Uploaded ${ok} item${ok === 1 ? '' : 's'}` : `Uploaded ${ok}, ${failed} failed`,
        failed === 0 ? 'success' : 'error',
      );
      // The operator may have closed the modal mid-upload — only clear it
      // when it is still the upload modal.
      setModal((m) => (m?.kind === 'upload' ? null : m));
      void load(dir);
    },
    [instanceId, load],
  );

  const queueUploads = useCallback(
    (items: DropItem[]) => {
      const list = (items || []).filter((it) => it && it.file).slice(0, 500);
      if (!list.length) return;
      setModal((m) => (m?.kind === 'upload' ? { ...m, queueLen: list.length } : m));
      void runUploadQueue(list);
    },
    [runUploadQueue],
  );

  const onUrlUpload = async () => {
    if (modal?.kind !== 'upload' || !path) return;
    const u = modal.url.trim();
    if (!u) {
      toast('URL is required', 'error');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      await uploadFromUrl(instanceId, path, u);
      toast('Uploaded from URL', 'success');
      setModal(null);
      void load(path);
    } catch (err: any) {
      toast(err?.message || 'Upload from URL failed', 'error');
      setModal((m) => (m?.kind === 'upload' ? { ...m, busy: false } : m));
    }
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    if (modal?.kind === 'upload' && modal.busy) return;
    void collectDrop(ev.dataTransfer).then((items) => {
      if (!items.length) return;
      if (!modal || modal.kind !== 'upload') {
        setModal({ kind: 'upload', tab: 'local', busy: false, queueLen: items.length, pct: 0, label: '', url: '' });
      }
      queueUploads(items);
    });
  };

  if (path === null) {
    return (
      <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
        <div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" />
        <div className="h-5 w-1/3 bg-neutral-800 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {/* Breadcrumbs */}
      <div
        className="ks-mono flex items-center gap-1 min-h-6 overflow-x-auto max-w-full text-[13px]"
        aria-label="Current directory"
      >
        <button
          type="button"
          onClick={() => goPath(jail ? home : '/')}
          title={jail ? `Home (${home})` : 'Root'}
          className="shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          {jail ? home : '/'}
        </button>
        {crumbs.map((seg, i) => {
          const tgt = jail ? `${home}/${crumbs.slice(0, i + 1).join('/')}` : `/${crumbs.slice(0, i + 1).join('/')}`;
          const last = i === crumbs.length - 1;
          return (
            <span key={tgt} className="inline-flex items-center gap-1 shrink-0">
              <span className="text-gray-600">/</span>
              <button
                type="button"
                onClick={() => goPath(tgt)}
                title={`Open ${tgt}`}
                className={`truncate max-w-40 ${last ? 'text-white font-medium' : 'text-gray-400 hover:text-white transition-colors'}`}
              >
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {/* Actions — fixed top-right pill (panel pattern, like Instances) */}
      <PageActionsPill>
        <input
          value={filter}
          onChange={(e) => { setFilter(e.target.value); if (searchHits) setSearchHits(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch(filter);
            else if (e.key === 'Escape') {
              if (searchHits) clearSearch();
              else setFilter('');
            }
          }}
          placeholder="Filter or search…"
          aria-label="Filter files"
          title="Type to filter this folder · Enter for recursive search · Esc clears"
          className="ks-input !w-36 !py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => void runSearch(filter)}
          disabled={searching || !filter.trim()}
          title="Recursive search from this folder"
          aria-label="Search recursively"
          style={PILL_TAB_STYLE}
          className="ks-tab inline-flex items-center justify-center disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </button>
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
          aria-label={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
          aria-pressed={showHidden}
          style={PILL_TAB_STYLE}
          className={`ks-tab inline-flex items-center justify-center ${showHidden ? '' : 'opacity-50'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        {selCount > 0 && (
          <>
            <button
              type="button"
              onClick={() => void downloadAsZip(selNames, `${selCount} selected`)}
              title={`Download ${selCount} selected as .zip`}
              aria-label={`Download ${selCount} selected as zip`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              <span className="text-xs ml-1">{selCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setModal({ kind: 'archive', names: selNames, file: `backup-${new Date().toISOString().slice(0, 10)}.zip`, format: 'zip', busy: false })}
              title={`Archive ${selCount} selected`}
              aria-label={`Archive ${selCount} selected`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 7v3" /><path d="M12 13v3" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setModal({ kind: 'move', names: selNames, dest: path, busy: false })}
              title={`Move ${selCount} selected`}
              aria-label={`Move ${selCount} selected`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setModal({ kind: 'copy', names: selNames, dest: path, busy: false })}
              title={`Copy ${selCount} selected`}
              aria-label={`Copy ${selCount} selected`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
            <button
              type="button"
              onClick={onBulkChmod}
              title={`Permissions for ${selCount} selected`}
              aria-label={`Permissions for ${selCount} selected`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m10.9 12.7 8.6-8.6" /><path d="m18 5 2 2" /><path d="m15 8 2 2" /></svg>
            </button>
            <button
              type="button"
              onClick={() => void onDeleteSelected()}
              title={`Delete ${selCount} selected`}
              aria-label={`Delete ${selCount} selected`}
              style={PILL_TAB_STYLE}
              className="ks-tab inline-flex items-center justify-center !text-red-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              <span className="text-xs ml-1">{selCount}</span>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void load(path)}
          title="Refresh"
          aria-label="Refresh"
          style={PILL_TAB_STYLE}
          className="ks-tab inline-flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
        <button
          type="button"
          onClick={() => setModal({ kind: 'upload', tab: 'local', busy: false, queueLen: 0, pct: 0, label: '', url: '' })}
          title="Upload"
          aria-label="Upload"
          style={PILL_TAB_STYLE}
          className="ks-tab inline-flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
        </button>
        <button
          type="button"
          onClick={() => setModal({ kind: 'create', tab: 'file', name: '', busy: false })}
          title="Create"
          aria-label="Create"
          style={PILL_TAB_STYLE}
          className="ks-tab inline-flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </PageActionsPill>

      {searchHits !== null && (
        <div className="ks-card flex items-center justify-between gap-3 text-[13px]">
          <span className="truncate">
            Search <code className="ks-mono">“{filter}”</code> · {searchHits.length} hit{searchHits.length === 1 ? '' : 's'}
            {searchTruncated ? ' (capped at 100)' : ''}{searching ? ' — searching…' : ''}
          </span>
          <button type="button" onClick={clearSearch} className="ks-btn !py-1 !px-2 text-xs shrink-0">
            Back to folder
          </button>
        </div>
      )}

      {error && entries.length > 0 && (
        <div className="ks-card text-[13px]" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)' }}>
          {error}
        </div>
      )}
      {!loading && error && entries.length === 0 && (
        <ErrorState
          variant="error"
          title="Failed to list files"
          description={error}
          retryLabel="Retry"
          onRetry={() => { if (path !== null) void load(path); }}
        />
      )}

      {/* Listing */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="pl-3 pr-1 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={() =>
                      setSelected((prev) => {
                        if (allVisibleChecked) {
                          const next = { ...prev };
                          for (const e of filtered) delete next[e.name];
                          return next;
                        }
                        const next = { ...prev };
                        for (const e of filtered) next[e.name] = true;
                        return next;
                      })
                    }
                    aria-label="Select all in this folder"
                    title="Select all in this folder"
                    className="h-3.5 w-3.5 accent-emerald-500 align-middle"
                  />
                </th>
                <th className="px-1 py-2 w-8" aria-label="Type" />
                <th className="px-2 py-2 min-w-0">
                  <button type="button" onClick={() => toggleSort('name')} title="Sort by name" className="uppercase tracking-wide text-[11px] text-gray-500 hover:text-white">
                    Name {sortKey === 'name' ? (sortAsc ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('size')} title="Sort by size" className="uppercase tracking-wide text-[11px] text-gray-500 hover:text-white">
                    Size {sortKey === 'size' ? (sortAsc ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th className="hidden md:table-cell px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('mode')} title="Sort by permissions" className="uppercase tracking-wide text-[11px] text-gray-500 hover:text-white">
                    Perms {sortKey === 'mode' ? (sortAsc ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th className="hidden lg:table-cell px-2 py-2 text-right">
                  <button type="button" onClick={() => toggleSort('mod_time')} title="Sort by modified" className="uppercase tracking-wide text-[11px] text-gray-500 hover:text-white">
                    Modified {sortKey === 'mod_time' ? (sortAsc ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th className="pr-2 pl-1 py-2 text-right w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {searchHits !== null ? (
                searchHits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                      {searching ? 'Searching…' : `No matches for “${filter}” under ${path}.`}
                    </td>
                  </tr>
                ) : (
                  searchHits.map((h) => (
                    <tr key={h.path} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="pl-3 pr-1 py-2 w-8" />
                      <td className="px-1 py-2 w-8" style={{ color: KIND_TONE[h.is_dir ? 'folder' : classifyEntry({ name: h.name, is_dir: false })] }}>
                        <FileGlyph kind={h.is_dir ? 'folder' : classifyEntry({ name: h.name, is_dir: false })} />
                      </td>
                      <td className="px-2 py-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (h.is_dir) {
                              goPath(joinPath(path, h.path));
                              clearSearch();
                            } else {
                              const slash = h.path.lastIndexOf('/');
                              if (slash > 0) {
                                goPath(joinPath(path, h.path.slice(0, slash)));
                                clearSearch();
                              } else {
                                const row = entries.find((e) => e.name === h.name);
                                if (row) void openPreview(row);
                              }
                            }
                          }}
                          title={h.path}
                          className="block max-w-72 truncate text-left text-[13px] text-gray-200 hover:underline"
                        >
                          <span className="ks-mono text-gray-500">{h.path.includes('/') ? `${h.path.slice(0, h.path.lastIndexOf('/') + 1)}` : ''}</span>
                          <span className={h.is_dir ? 'text-white font-medium' : ''}>{h.name}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-400 whitespace-nowrap">
                        {h.is_dir ? '—' : formatBytes(h.size)}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2 text-right text-xs font-mono text-gray-500">—</td>
                      <td className="hidden lg:table-cell px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                        {h.mod_time ? new Date(h.mod_time * 1000).toLocaleString() : ''}
                      </td>
                      <td className="pr-2 pl-1 py-2 text-right w-10" />
                    </tr>
                  ))
                )
              ) : loading && filtered.length === 0 ? (
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-white/5 animate-pulse" aria-hidden="true">
                    <td className="px-3 py-2.5"><div className="h-3.5 w-3.5 rounded bg-neutral-800" /></td>
                    <td className="px-1 py-2.5"><div className="h-4 w-4 rounded bg-neutral-800" /></td>
                    <td className="px-2 py-2.5"><div className="h-3 rounded bg-neutral-800" style={{ width: 120 + ((i * 37) % 120) }} /></td>
                    <td className="px-2 py-2.5"><div className="h-3 w-12 rounded bg-neutral-800 ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                    {error ? 'Could not read this directory.' : 'This directory is empty.'}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const kind = classifyEntry(e);
                  const checked = !!selected[e.name];
                  return (
                    <tr key={e.name} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="pl-3 pr-1 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = { ...prev };
                              if (checked) delete next[e.name];
                              else next[e.name] = true;
                              return next;
                            })
                          }
                          aria-label={`Select ${e.name}`}
                          className="h-3.5 w-3.5 accent-emerald-500 align-middle"
                        />
                      </td>
                      <td className="px-1 py-2 w-8" style={{ color: KIND_TONE[kind] }}>
                        <FileGlyph kind={kind} />
                      </td>
                      <td className="px-2 py-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => onRowOpen(e)}
                          title={e.is_dir ? `Open folder ${e.name}` : `Open ${e.name} in editor`}
                          className={`block max-w-72 truncate text-left text-[13px] hover:underline ${e.is_dir ? 'text-white font-medium' : 'text-gray-200'}`}
                        >
                          {e.name}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-400 whitespace-nowrap">
                        {e.is_dir ? '—' : formatBytes(e.size)}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setModal({ kind: 'chmod', targets: [e.name], isDir: e.is_dir, mode: String(e.mode || (e.is_dir ? '755' : '644')), recursive: false, busy: false })}
                          title={`Permissions ${e.mode || ''} — click to change`}
                          className="text-xs font-mono text-gray-500 hover:text-white hover:underline"
                        >
                          {e.mode || '—'}
                        </button>
                      </td>
                      <td className="hidden lg:table-cell px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                        {e.mod_time ? new Date(e.mod_time * 1000).toLocaleString() : ''}
                      </td>
                      <td className="pr-2 pl-1 py-2 text-right w-10">
                        <CardMenu
                          ariaLabel={`Actions for ${e.name}`}
                          items={[
                            { key: e.is_dir ? 'open' : 'edit', label: e.is_dir ? 'Open' : 'Edit' },
                            ...(!e.is_dir && classifyEntry(e) !== 'binary' ? [{ key: 'preview', label: 'Preview' }] : []),
                            ...(e.is_dir ? [] : [{ key: 'download', label: 'Download' }]),
                            ...(e.is_dir ? [{ key: 'dlzip', label: 'Download as .zip' }] : []),
                            ...(isArchiveName(e.name) && !e.is_dir ? [{ key: 'extract', label: 'Extract…' }] : []),
                            ...(!e.is_dir && !isArchiveName(e.name) ? [{ key: 'archive1', label: 'Compress…' }] : []),
                            { key: 'duplicate', label: 'Duplicate' },
                            { key: 'copy', label: 'Copy to…' },
                            { key: 'move', label: 'Move to…' },
                            { key: 'rename', label: 'Rename' },
                            { key: 'chmod', label: 'Permissions…' },
                            { key: 'delete', label: 'Remove', tone: 'danger' },
                          ]}
                          onSelect={(k) => {
                            if (k === 'open' || k === 'edit') onRowOpen(e);
                            else if (k === 'preview') void openPreview(e);
                            else if (k === 'download') void onDownload(e);
                            else if (k === 'dlzip') void downloadAsZip([e.name], e.name);
                            else if (k === 'extract') setModal({ kind: 'extract', archive: e.name, dest: path, busy: false });
                            else if (k === 'archive1') setModal({ kind: 'archive', names: [e.name], file: `${e.name}.zip`, format: 'zip', busy: false });
                            else if (k === 'duplicate') void onDuplicate(e);
                            else if (k === 'copy') setModal({ kind: 'copy', names: [e.name], dest: path, busy: false });
                            else if (k === 'move') setModal({ kind: 'move', names: [e.name], dest: path, busy: false });
                            else if (k === 'rename') setModal({ kind: 'rename', from: e.name, name: e.name, busy: false });
                            else if (k === 'chmod') setModal({ kind: 'chmod', targets: [e.name], isDir: e.is_dir, mode: String(e.mode || (e.is_dir ? '755' : '644')), recursive: false, busy: false });
                            else if (k === 'delete') void onDeleteOne(e);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-600">
        {searchHits !== null
          ? `${searchHits.length} search result${searchHits.length === 1 ? '' : 's'}${searchTruncated ? ' (capped)' : ''} · Enter in the box to re-search · Esc clears`
          : `${filtered.length} item${filtered.length === 1 ? '' : 's'}${selCount ? ` · ${selCount} selected` : ''} · drag & drop files or folders anywhere to upload`}
      </p>

      {/* Hidden pickers */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(ev) => {
          const fs = Array.prototype.slice.call(ev.target.files || []);
          ev.target.value = '';
          queueUploads(fs.map((f: File) => ({ file: f, rel: f.name })));
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        // @ts-expect-error webkitdirectory is a non-standard input attribute
        webkitdirectory=""
        onChange={(ev) => {
          const fs = Array.prototype.slice.call(ev.target.files || []);
          ev.target.value = '';
          queueUploads(
            fs.map((f: File) => ({ file: f, rel: (f as any).webkitRelativePath || f.name })),
          );
        }}
      />

      {/* Create modal */}
      <Modal
        open={modal?.kind === 'create'}
        onClose={() => setModal(null)}
        title="Create new"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onCreateConfirm()}
              disabled={modal?.kind !== 'create' || !modal.name.trim() || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'create' && modal.busy ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        {modal?.kind === 'create' && (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1" role="tablist" aria-label="Create type">
              {(['file', 'folder'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={modal.tab === t}
                  onClick={() => setModal({ ...modal, tab: t })}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition ${modal.tab === t ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {t === 'file' ? 'File' : 'Folder'}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="files-create-name">
                {modal.tab === 'file' ? 'File name' : 'Folder name'}
              </label>
              <input
                id="files-create-name"
                value={modal.name}
                autoFocus
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onCreateConfirm();
                }}
                placeholder={modal.tab === 'file' ? 'e.g. server.properties' : 'e.g. plugins'}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Will be created inside <code className="ks-mono">{path}</code>
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload modal */}
      <Modal
        open={modal?.kind === 'upload'}
        onClose={() => setModal(null)}
        title="Upload"
        footer={
          modal?.kind === 'upload' && modal.tab === 'url' ? (
            <>
              <button type="button" onClick={() => setModal(null)} className="ks-btn">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onUrlUpload()}
                disabled={!modal.url.trim() || modal.busy}
                className="ks-btn-primary ks-btn disabled:opacity-40"
              >
                {modal.busy ? 'Uploading…' : 'Upload'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Close
            </button>
          )
        }
      >
        {modal?.kind === 'upload' && (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1" role="tablist" aria-label="Upload source">
              {(['local', 'url'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={modal.tab === t}
                  onClick={() => setModal({ ...modal, tab: t })}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition ${modal.tab === t ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {t === 'local' ? 'Local' : 'URL'}
                </button>
              ))}
            </div>
            {modal.tab === 'local' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="ks-btn flex-1">
                    Choose files…
                  </button>
                  <button type="button" onClick={() => folderInputRef.current?.click()} className="ks-btn flex-1">
                    Choose folder…
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Files land inside <code className="ks-mono">{path}</code> (or drop them anywhere on this page).
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-400 mb-1" htmlFor="files-url">
                  URL (http/https only)
                </label>
                <input
                  id="files-url"
                  type="url"
                  value={modal.url}
                  onChange={(e) => setModal({ ...modal, url: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onUrlUpload();
                  }}
                  placeholder="https://example.com/server.jar"
                  className="ks-input w-full ks-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Fetched by the panel and saved into <code className="ks-mono">{path}</code>.
                </p>
              </div>
            )}
            {modal.queueLen > 0 && (
              <p className="text-xs text-gray-400">
                Queued: <code className="ks-mono">{modal.queueLen}</code> item{modal.queueLen === 1 ? '' : 's'}
              </p>
            )}
            {modal.pct > 0 && (
              <div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={modal.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${modal.pct}%` }} />
                </div>
                {modal.label && <p className="ks-mono text-[11px] text-gray-500 mt-1 text-center truncate">{modal.label}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Rename modal */}
      <Modal
        open={modal?.kind === 'rename'}
        onClose={() => setModal(null)}
        title="Rename"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onRenameConfirm()}
              disabled={modal?.kind !== 'rename' || !modal.name.trim() || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'rename' && modal.busy ? 'Renaming…' : 'Rename'}
            </button>
          </>
        }
      >
        {modal?.kind === 'rename' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="files-rename-name">
              New name
            </label>
            <input
              id="files-rename-name"
              value={modal.name}
              autoFocus
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onRenameConfirm();
              }}
              className="ks-input w-full ks-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1.5 break-all">
              Renaming <code className="ks-mono">{modal.from}</code> in <code className="ks-mono">{path}</code>
            </p>
          </div>
        )}
      </Modal>

      {/* Chmod modal */}
      <Modal
        open={modal?.kind === 'chmod'}
        onClose={() => setModal(null)}
        title={`Permissions${modal?.kind === 'chmod' && modal.targets.length > 1 ? ` (${modal.targets.length} items)` : ''}`}
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onChmodConfirm()}
              disabled={modal?.kind !== 'chmod' || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'chmod' && modal.busy ? 'Applying…' : 'Apply'}
            </button>
          </>
        }
      >
        {modal?.kind === 'chmod' && (
          <ChmodBody
            mode={modal.mode}
            targets={modal.targets}
            isDir={modal.isDir}
            recursive={modal.recursive}
            onChange={(patch) => setModal({ ...modal, ...patch })}
          />
        )}
      </Modal>

      {/* Copy / Move modal */}
      <Modal
        open={modal?.kind === 'copy' || modal?.kind === 'move'}
        onClose={() => setModal(null)}
        title={modal?.kind === 'move' ? `Move ${modal.names.length} item${modal.names.length === 1 ? '' : 's'}` : `Copy ${modal?.kind === 'copy' ? modal.names.length : 0} item${modal?.kind === 'copy' && modal.names.length === 1 ? '' : 's'}`}
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onCopyMoveConfirm()}
              disabled={(modal?.kind !== 'copy' && modal?.kind !== 'move') || modal.busy || !modal.dest.trim()}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'move' ? (modal.busy ? 'Moving…' : 'Move') : modal?.kind === 'copy' && modal.busy ? 'Copying…' : 'Copy'}
            </button>
          </>
        }
      >
        {(modal?.kind === 'copy' || modal?.kind === 'move') && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="files-dest">
                Destination folder (absolute path)
              </label>
              <input
                id="files-dest"
                value={modal.dest}
                autoFocus
                onChange={(e) => setModal({ ...modal, dest: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onCopyMoveConfirm();
                }}
                placeholder={path}
                className="ks-input w-full ks-mono"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button type="button" onClick={() => setModal({ ...modal, dest: path })} className="ks-btn !py-1 !px-2 text-xs">This folder</button>
                <button
                  type="button"
                  onClick={() => setModal({ ...modal, dest: path.split('/').slice(0, -1).join('/') || '/' })}
                  className="ks-btn !py-1 !px-2 text-xs"
                >
                  Parent
                </button>
                <button type="button" onClick={() => setModal({ ...modal, dest: jail ? home : '/' })} className="ks-btn !py-1 !px-2 text-xs">
                  {jail ? 'Home' : 'Root'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 break-all">
              {modal.names.length <= 5 ? modal.names.join(', ') : `${modal.names.length} items`} → <code className="ks-mono">{modal.dest.trim() || path}/</code>
            </p>
          </div>
        )}
      </Modal>

      {/* Archive modal */}
      <Modal
        open={modal?.kind === 'archive'}
        onClose={() => setModal(null)}
        title={`Compress ${modal?.kind === 'archive' ? modal.names.length : 0} item${modal?.kind === 'archive' && modal.names.length === 1 ? '' : 's'}`}
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onArchiveConfirm()}
              disabled={modal?.kind !== 'archive' || !modal.file.trim() || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'archive' && modal.busy ? 'Compressing…' : 'Compress'}
            </button>
          </>
        }
      >
        {modal?.kind === 'archive' && (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1" role="tablist" aria-label="Archive format">
              {(['zip', 'targz'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={modal.format === t}
                  onClick={() => {
                    const base = modal.file.replace(/\.(zip|tar\.gz|tgz)$/i, '');
                    setModal({ ...modal, format: t, file: `${base}${t === 'zip' ? '.zip' : '.tar.gz'}` });
                  }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${modal.format === t ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {t === 'zip' ? '.zip' : '.tar.gz'}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="files-archive-name">
                Archive name
              </label>
              <input
                id="files-archive-name"
                value={modal.file}
                autoFocus
                onChange={(e) => setModal({ ...modal, file: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onArchiveConfirm();
                }}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Created inside <code className="ks-mono">{path}</code> from {modal.names.length} item{modal.names.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Extract modal */}
      <Modal
        open={modal?.kind === 'extract'}
        onClose={() => setModal(null)}
        title={`Extract ${modal?.kind === 'extract' ? modal.archive : ''}`}
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onExtractConfirm()}
              disabled={modal?.kind !== 'extract' || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'extract' && modal.busy ? 'Extracting…' : 'Extract'}
            </button>
          </>
        }
      >
        {modal?.kind === 'extract' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="files-extract-dest">
              Destination folder (empty = same folder)
            </label>
            <input
              id="files-extract-dest"
              value={modal.dest}
              autoFocus
              onChange={(e) => setModal({ ...modal, dest: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onExtractConfirm();
              }}
              placeholder={path}
              className="ks-input w-full ks-mono"
            />
          </div>
        )}
      </Modal>

      {/* Preview modal */}
      <Modal
        open={modal?.kind === 'preview'}
        onClose={() => setModal(null)}
        title={modal?.kind === 'preview' ? modal.entry.name : 'Preview'}
        footer={
          <>
            {modal?.kind === 'preview' && (
              <button
                type="button"
                onClick={() => {
                  openEditor(modal.fullPath);
                  setModal(null);
                }}
                className="ks-btn"
              >
                Open in editor
              </button>
            )}
            <button type="button" onClick={() => setModal(null)} className="ks-btn">
              Close
            </button>
            {modal?.kind === 'preview' && !modal.entry.is_dir && (
              <button
                type="button"
                onClick={() => void onDownload(modal.entry)}
                className="ks-btn-primary ks-btn"
              >
                Download
              </button>
            )}
          </>
        }
      >
        {modal?.kind === 'preview' && (
          <div className="space-y-2">
            <p className="ks-mono text-[11px] text-gray-500 break-all">
              {modal.fullPath} · {modal.entry.is_dir ? 'folder' : formatBytes(modal.entry.size)}
              {modal.entry.mode ? ` · perms ${modal.entry.mode}` : ''}
            </p>
            {classifyEntry(modal.entry) === 'image' ? (
              previewUrl ? (
                <img src={previewUrl} alt={modal.entry.name} className="max-h-[60vh] w-auto mx-auto rounded-lg border border-white/10" />
              ) : modal.entry.size > 8 * 1024 * 1024 ? (
                <p className="text-sm text-gray-400">Image too large to preview — download to view.</p>
              ) : (
                <p className="text-sm text-gray-400 animate-pulse">Loading preview…</p>
              )
            ) : previewText !== null ? (
              <pre className="ks-mono text-xs text-gray-200 bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{previewText || '(empty file)'}</pre>
            ) : modal.entry.size > 8 * 1024 * 1024 ? (
              <p className="text-sm text-gray-400">File too large to preview — download to view.</p>
            ) : (
              <p className="text-sm text-gray-400 animate-pulse">Loading preview…</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const ChmodBody: React.FC<{
  mode: string;
  targets: string[];
  isDir: boolean;
  recursive: boolean;
  onChange: (patch: { mode?: string; recursive?: boolean }) => void;
}> = ({ mode, targets, isDir, recursive, onChange }) => {
  const t = modeToTriples(mode);
  const setBit = (who: 0 | 1 | 2, bit: number) => {
    const next: [number, number, number] = [t[0], t[1], t[2]];
    next[who] = next[who] & bit ? next[who] & ~bit : next[who] | bit;
    onChange({ mode: triplesToMode(next) });
  };
  const rows: { who: 0 | 1 | 2; label: string }[] = [
    { who: 0, label: 'Owner' },
    { who: 1, label: 'Group' },
    { who: 2, label: 'Other' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="block text-xs text-gray-400" htmlFor="files-chmod-mode">
          Octal mode
        </label>
        <input
          id="files-chmod-mode"
          value={mode}
          onChange={(e) => onChange({ mode: e.target.value.replace(/[^0-7]/g, '').slice(0, 3) })}
          placeholder="644"
          inputMode="numeric"
          className="ks-input ks-mono !w-20"
        />
        <code className="ks-mono text-xs text-gray-400">
          {rwx(t[0])} {rwx(t[1])} {rwx(t[2])}
        </code>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-white/10 bg-black/30 p-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{r.label}</p>
            {(['r', 'w', 'x'] as const).map((b) => {
              const bit = b === 'r' ? 4 : b === 'w' ? 2 : 1;
              return (
                <label key={b} className="flex items-center gap-1.5 text-xs text-gray-300 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!(t[r.who] & bit)}
                    onChange={() => setBit(r.who, bit)}
                    className="h-3.5 w-3.5 accent-emerald-500"
                  />
                  {b === 'r' ? 'Read' : b === 'w' ? 'Write' : 'Execute'}
                </label>
              );
            })}
          </div>
        ))}
      </div>
      {isDir && (
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => onChange({ recursive: e.target.checked })}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Apply to direct contents too
        </label>
      )}
      <p className="text-[11px] text-gray-500 break-all">
        {targets.length <= 3 ? targets.join(', ') : `${targets.length} items`} · e.g. 755 = folders/executables, 644 = files, 600 = secrets
      </p>
    </div>
  );
};

export default InstanceFiles;
