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
  classifyEntry,
  deletePath,
  downloadFile,
  entryNameError,
  formatBytes,
  joinPath,
  listFiles,
  makeDir,
  renamePath,
  uploadFile,
  uploadFromUrl,
  writeFile,
  type FileEntry,
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
  | { kind: 'rename'; from: string; name: string; busy: boolean };

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
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

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
    if (kind === 'binary' || kind === 'archive' || kind === 'image') {
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
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter files"
          className="ks-input !w-32 !py-1.5 text-xs"
        />
        {selCount > 0 && (
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
            <tbody>
              {loading && filtered.length === 0 ? (
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
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
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
                      <td className="hidden md:table-cell px-2 py-2 text-right text-xs font-mono text-gray-500">
                        {e.mode || ''}
                      </td>
                      <td className="hidden lg:table-cell px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                        {e.mod_time ? new Date(e.mod_time * 1000).toLocaleString() : ''}
                      </td>
                      <td className="pr-2 pl-1 py-2 text-right w-10">
                        <CardMenu
                          ariaLabel={`Actions for ${e.name}`}
                          items={[
                            { key: e.is_dir ? 'open' : 'edit', label: e.is_dir ? 'Open' : 'Edit' },
                            ...(e.is_dir ? [] : [{ key: 'download', label: 'Download' }]),
                            { key: 'rename', label: 'Rename' },
                            { key: 'delete', label: 'Remove', tone: 'danger' },
                          ]}
                          onSelect={(k) => {
                            if (k === 'open' || k === 'edit') onRowOpen(e);
                            else if (k === 'download') void onDownload(e);
                            else if (k === 'rename') setModal({ kind: 'rename', from: e.name, name: e.name, busy: false });
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
        {filtered.length} item{filtered.length === 1 ? '' : 's'} · drag &amp; drop files or folders anywhere to upload
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
    </div>
  );
};

export default InstanceFiles;
