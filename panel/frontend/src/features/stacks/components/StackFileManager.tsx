import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { markdownToHtml } from '@/shared/components/ui/CustomPageView';
import { useConfirm } from '@/shared/stores/confirmStore';
import {
  listStackFiles,
  readStackFile,
  writeStackFile,
  mkdirStackPath,
  renameStackPath,
  deleteStackPath,
  uploadStackFiles,
  downloadStackFile,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import type { StackFileEntry } from '@/shared/types/stack';

function joinRel(dir: string, name: string): string {
  const d = (dir || '').replace(/^\/+|\/+$/g, '');
  const n = name.replace(/^\/+/, '');
  return d ? `${d}/${n}` : n;
}

function parentRel(rel: string): string {
  const clean = (rel || '').replace(/^\/+|\/+$/g, '');
  const i = clean.lastIndexOf('/');
  return i < 0 ? '' : clean.slice(0, i);
}

const KIND_TONE: Record<string, string> = {
  folder: 'var(--ks-warn)',
  code: 'var(--ks-info)',
  text: 'var(--ks-secondary)',
  binary: 'var(--ks-muted)',
};

function classify(name: string, isDir: boolean): string {
  if (isDir) return 'folder';
  const lower = name.toLowerCase();
  if (/\.(ts|tsx|js|jsx|json|css|html|md|yml|yaml|toml|py|go|sh)$/.test(lower)) return 'code';
  if (/\.(txt|log|env|ini|cfg)$/.test(lower)) return 'text';
  return 'binary';
}

// fileLang maps a filename to its editor language + preview capability:
// markdown and html get a live Preview tab; TypeScript/TSX/Go/JS/CSS/JSON
// edit as code with a language badge so the admin always knows the mode.
function fileLang(name: string): { label: string; preview: 'none' | 'markdown' | 'html' } {
  const lower = name.toLowerCase();
  if (/\.md$|\.markdown$/.test(lower)) return { label: 'Markdown', preview: 'markdown' };
  if (/\.html?$/.test(lower)) return { label: 'HTML', preview: 'html' };
  if (/\.tsx$/.test(lower)) return { label: 'React TS', preview: 'none' };
  if (/\.ts$/.test(lower)) return { label: 'TypeScript', preview: 'none' };
  if (/\.jsx?$/.test(lower)) return { label: 'JavaScript', preview: 'none' };
  if (/\.go$/.test(lower)) return { label: 'Go', preview: 'none' };
  if (/\.css$/.test(lower)) return { label: 'CSS', preview: 'none' };
  if (/\.json$/.test(lower)) return { label: 'JSON', preview: 'none' };
  return { label: 'Text', preview: 'none' };
}

// templateFor seeds a newly created file with a minimal starter by
// extension so html/markdown/react-ts/go files open ready to edit.
// Exported for the /stack/:id/files page's create view (same starters).
export function templateFor(name: string): string {
  const lower = name.toLowerCase();
  const base = name.split('/').pop() || 'app';
  const title = base.replace(/\.[^.]+$/, '') || 'app';
  if (/\.go$/.test(lower)) {
    // Starter is a runnable loopback app: package main is mandatory for
    // func main (a per-file package name would not compile).
    return `package main\n\nimport "net/http"\n\n// ${base} — served by the panel at /<root> when this stack's\n// proxy port + root URL are configured (Detail > App proxy).\nfunc main() {\n\thttp.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {\n\t\tw.Header().Set("Content-Type", "text/html; charset=utf-8")\n\t\t_, _ = w.Write([]byte("<h1>${title}</h1>"))\n\t})\n\t_ = http.ListenAndServe("127.0.0.1:6600", nil)\n}\n`;
  }
  if (/\.md$|\.markdown$/.test(lower)) return `# ${title}\n\nWrite it in Markdown — the Preview tab renders it.\n`;
  if (/\.html?$/.test(lower)) {
    return `<!doctype html>\n<html>\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n<h1>${title}</h1>\n<script src="/api/stacks/v1/ks-stack-sdk.js"></script>\n</body>\n</html>\n`;
  }
  if (/\.tsx$/.test(lower)) {
    let comp = title.replace(/[^a-zA-Z0-9]/g, '') || 'StackView';
    if (/^[0-9]/.test(comp)) comp = `View${comp}`;
    comp = comp.charAt(0).toUpperCase() + comp.slice(1);
    return `import React from 'react';\n\nexport default function ${comp}() {\n  return <h1>${title}</h1>;\n}\n`;
  }
  return '';
}

const FileGlyph: React.FC<{ kind: string }> = ({ kind }) => {
  const inner =
    kind === 'folder' ? (
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    ) : kind === 'code' ? (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ) : (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }} aria-hidden="true">
      {inner}
    </svg>
  );
};

type ModalState =
  | { kind: 'create'; tab: 'file' | 'folder'; name: string; busy: boolean }
  | { kind: 'rename'; from: string; name: string; busy: boolean }
  | { kind: 'upload'; busy: boolean }
  | { kind: 'edit'; path: string; content: string; busy: boolean; dirty: boolean; view: 'code' | 'preview' };

// StackFileManager — full workdir file manager for one stack (the Detail
// page's Files section + the /stack/:id/files page). Browses
// stack-work/<slug>/ through the MANAGE_STACKS-gated file endpoints: list,
// read/write, mkdir, rename, delete, multipart upload, download.
//
// initialDir scopes the browser to a subtree ("frontend" | "backend" on the
// Files page; "" = workdir root on Detail). bare hides only the toolbar's
// Create button when the owning page provides its own top-right Create
// (upload stays so the Files page keeps uploads). The editor is
// language-aware: markdown + html get a live Preview tab, ts/tsx/go/js/css/json
// edit as labelled code, and new files are seeded with a starter template
// by extension.
const StackFileManager: React.FC<{ stackId: number; slug: string; initialDir?: string; bare?: boolean }> = ({ stackId, slug, initialDir = '', bare = false }) => {
  const confirm = useConfirm();
  const [dir, setDir] = useState(initialDir);
  const [entries, setEntries] = useState<StackFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editError, setEditError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // initialDir is mount-time only (the Files page remounts via key when the
  // Frontend/Backend root switches); dir state owns navigation afterwards.

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const rows = await listStackFiles(stackId, d);
      rows.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
      });
      setEntries(rows);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to list files'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [stackId]);

  useEffect(() => { void load(dir); }, [dir, load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

  const crumbs = useMemo(() => (dir || '').split('/').filter(Boolean), [dir]);

  // home is the scope root ("frontend" | "backend" on the Files page, "" on
  // Detail). Navigation never escapes above it: the root button and the Up
  // link clamp to home, and browsing only descends.
  const home = useMemo(() => (initialDir || '').replace(/^\/+|\/+$/g, ''), [initialDir]);
  const relCrumbs = useMemo(() => {
    if (!home) return crumbs;
    const idx = crumbs.findIndex((_, i) => crumbs.slice(0, i + 1).join('/') === home);
    return idx < 0 ? crumbs : crumbs.slice(idx + 1);
  }, [crumbs, home]);
  const upTarget = useMemo(() => {
    if (dir === home) return null;
    if (home && !dir.startsWith(home + '/') && dir !== home) return home;
    const p = parentRel(dir);
    if (home && (p === '' || (!p.startsWith(home + '/') && p !== home))) return home;
    return p;
  }, [dir, home]);

  const openEntry = async (e: StackFileEntry) => {
    if (e.is_dir) {
      setDir(joinRel(dir, e.name));
      return;
    }
    const full = joinRel(dir, e.name);
    setEditError('');
    setModal({ kind: 'edit', path: full, content: '', busy: true, dirty: false, view: 'code' });
    try {
      const file = await readStackFile(stackId, full);
      setModal({ kind: 'edit', path: full, content: file.content, busy: false, dirty: false, view: 'code' });
    } catch (err) {
      setModal(null);
      setError(extractStackApiError(err, 'Failed to read file'));
    }
  };

  const onDownload = async (e: StackFileEntry) => {
    try {
      const blob = await downloadStackFile(stackId, joinRel(dir, e.name));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = e.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractStackApiError(err, 'Download failed'));
    }
  };

  const onDelete = async (e: StackFileEntry) => {
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
      await deleteStackPath(stackId, joinRel(dir, e.name));
      await load(dir);
    } catch (err) {
      setError(extractStackApiError(err, 'Delete failed'));
    }
  };

  const onCreateConfirm = async () => {
    if (modal?.kind !== 'create') return;
    const name = modal.name.trim();
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      setError('Name must be a plain file/folder name (no slashes).');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      const rel = joinRel(dir, name);
      if (modal.tab === 'file') {
        // New files open seeded: .go/.md/.html/.tsx starters by extension.
        await writeStackFile(stackId, rel, templateFor(name));
      } else {
        await mkdirStackPath(stackId, rel);
      }
      setModal(null);
      await load(dir);
    } catch (err) {
      setError(extractStackApiError(err, 'Create failed'));
      setModal((m) => (m?.kind === 'create' ? { ...m, busy: false } : m));
    }
  };

  const onRenameConfirm = async () => {
    if (modal?.kind !== 'rename') return;
    const nn = modal.name.trim();
    if (!nn || nn.includes('/') || nn.includes('\\')) {
      setError('New name must be a plain name (no slashes).');
      return;
    }
    setModal({ ...modal, busy: true });
    try {
      const target = joinRel(parentRel(modal.from), nn);
      await renameStackPath(stackId, modal.from, target);
      setModal(null);
      await load(dir);
    } catch (err) {
      setError(extractStackApiError(err, 'Rename failed'));
      setModal((m) => (m?.kind === 'rename' ? { ...m, busy: false } : m));
    }
  };

  const onSaveEdit = async () => {
    if (modal?.kind !== 'edit') return;
    setModal({ ...modal, busy: true });
    setEditError('');
    try {
      await writeStackFile(stackId, modal.path, modal.content);
      setModal(null);
      await load(dir);
    } catch (err) {
      setEditError(extractStackApiError(err, 'Save failed'));
      setModal((m) => (m?.kind === 'edit' ? { ...m, busy: false } : m));
    }
  };

  const onPickUpload = async (files: FileList | File[] | null) => {
    const list = files ? Array.prototype.slice.call(files) as File[] : [];
    if (!list.length) return;
    setModal({ kind: 'upload', busy: true });
    try {
      await uploadStackFiles(stackId, dir, list.slice(0, 50));
      setModal(null);
      await load(dir);
    } catch (err) {
      setError(extractStackApiError(err, 'Upload failed'));
      setModal(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="ks-mono flex items-center gap-1 min-h-6 overflow-x-auto max-w-full text-[13px]" aria-label="Current directory">
          <button type="button" onClick={() => setDir(home)} title={home ? `${slug} ${home} root` : `${slug} workdir root`} className="shrink-0 text-gray-400 hover:text-white transition-colors">
            /{slug}{home ? `/${home}` : ''}
          </button>
          {relCrumbs.map((seg, i) => {
            const tgt = home ? `${home}/${relCrumbs.slice(0, i + 1).join('/')}` : relCrumbs.slice(0, i + 1).join('/');
            const last = i === relCrumbs.length - 1;
            return (
              <span key={tgt} className="inline-flex items-center gap-1 shrink-0">
                <span className="text-gray-600">/</span>
                <button
                  type="button"
                  onClick={() => setDir(tgt)}
                  title={`Open ${tgt}`}
                  className={`truncate max-w-40 ${last ? 'text-white font-medium' : 'text-gray-400 hover:text-white transition-colors'}`}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter files"
            className="ks-input !w-32 !py-1.5 text-xs"
          />
          <button type="button" onClick={() => void load(dir)} title="Refresh" aria-label="Refresh" className="ks-btn-header ks-icon-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          {/* Upload stays visible even in bare mode (the /stack/:id/files
              page hides only Create behind its own top-right button, so the
              page would otherwise lose uploads entirely). Create is hidden
              when the owning page provides it. */}
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Upload" aria-label="Upload" className="ks-btn-header ks-icon-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </button>
          {!bare && (
            <button type="button" onClick={() => setModal({ kind: 'create', tab: 'file', name: '', busy: false })} title="Create" aria-label="Create" className="ks-btn-header ks-icon-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          )}
        </div>
      </div>

      {upTarget !== null && (
        <button type="button" onClick={() => setDir(upTarget)} className="text-xs text-sky-300 hover:text-sky-200">
          ↑ Up to {upTarget || `/${slug}`}
        </button>
      )}

      {error && (
        <div className="ks-card text-[13px]" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)' }}>
          {error}
        </div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-white/5 animate-pulse" aria-hidden="true">
                    <td className="px-3 py-2.5"><div className="h-4 w-4 rounded bg-neutral-800" /></td>
                    <td className="px-2 py-2.5"><div className="h-3 rounded bg-neutral-800" style={{ width: 120 + ((i * 37) % 100) }} /></td>
                    <td className="px-2 py-2.5"><div className="h-3 w-12 rounded bg-neutral-800 ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                    This directory is empty. Create a file or upload one.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const kind = classify(e.name, e.is_dir);
                  return (
                    <tr key={e.name} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2 w-8" style={{ color: KIND_TONE[kind] }}>
                        <FileGlyph kind={kind} />
                      </td>
                      <td className="px-2 py-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => void openEntry(e)}
                          title={e.is_dir ? `Open folder ${e.name}` : `Edit ${e.name}`}
                          className={`block max-w-72 truncate text-left text-[13px] hover:underline ${e.is_dir ? 'text-white font-medium' : 'text-gray-200'}`}
                        >
                          {e.name}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-400 whitespace-nowrap">
                        {e.is_dir ? '—' : `${(e.size / 1024).toFixed(1)} KiB`}
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
                            if (k === 'open' || k === 'edit') void openEntry(e);
                            else if (k === 'download') void onDownload(e);
                            else if (k === 'rename') setModal({ kind: 'rename', from: joinRel(dir, e.name), name: e.name, busy: false });
                            else if (k === 'delete') void onDelete(e);
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
        {filtered.length} item{filtered.length === 1 ? '' : 's'} · workdir of <code className="ks-mono">{slug}</code> · edits repackage the .ksps
      </p>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(ev) => { void onPickUpload(ev.target.files); ev.target.value = ''; }}
      />

      <Modal
        open={modal?.kind === 'create'}
        onClose={() => setModal(null)}
        title="Create new"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">Cancel</button>
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
              <label className="block text-xs text-gray-400 mb-1" htmlFor="stack-files-create-name">
                {modal.tab === 'file' ? 'File name' : 'Folder name'}
              </label>
              <input
                id="stack-files-create-name"
                value={modal.name}
                autoFocus
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void onCreateConfirm(); }}
                placeholder={modal.tab === 'file' ? 'e.g. frontend/pages/overview.md' : 'e.g. frontend/dist'}
                className="ks-input w-full ks-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Use a plain name (no slashes) — it lands inside <code className="ks-mono">{dir || '/'}</code>
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modal?.kind === 'rename'}
        onClose={() => setModal(null)}
        title="Rename"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">Cancel</button>
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
            <label className="block text-xs text-gray-400 mb-1" htmlFor="stack-files-rename-name">New name</label>
            <input
              id="stack-files-rename-name"
              value={modal.name}
              autoFocus
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void onRenameConfirm(); }}
              className="ks-input w-full ks-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1.5 break-all">
              Renaming <code className="ks-mono">{modal.from}</code>
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={modal?.kind === 'upload'}
        onClose={() => setModal(null)}
        title="Uploading…"
        footer={<button type="button" onClick={() => setModal(null)} className="ks-btn">Close</button>}
      >
        <p className="text-sm text-gray-300">Uploading into <code className="ks-mono">{dir || '/'}</code>…</p>
      </Modal>

      <Modal
        open={modal?.kind === 'edit'}
        onClose={() => setModal(null)}
        title={modal?.kind === 'edit' ? `Edit — ${modal.path}` : 'Edit'}
        maxWidth="max-w-3xl"
        footer={
          <>
            <button type="button" onClick={() => setModal(null)} className="ks-btn">Close</button>
            <button
              type="button"
              onClick={() => void onSaveEdit()}
              disabled={modal?.kind !== 'edit' || modal.busy}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {modal?.kind === 'edit' && modal.busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {modal?.kind === 'edit' && (
          <div className="space-y-2">
            {modal.busy && !modal.content ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <>
                {(() => {
                  const lang = fileLang(modal.path);
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] border border-white/10 bg-white/5 text-gray-300 font-mono">
                        {lang.label}
                      </span>
                      {lang.preview !== 'none' && (
                        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5" role="tablist" aria-label="Editor view">
                          {(['code', 'preview'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              role="tab"
                              aria-selected={modal.view === v}
                              onClick={() => setModal({ ...modal, view: v })}
                              className={`rounded px-2.5 py-1 text-xs capitalize transition ${modal.view === v ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {modal.view === 'preview' ? (
                  fileLang(modal.path).preview === 'markdown' ? (
                    <div
                      className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-gray-200 max-h-[60vh] overflow-y-auto ks-markdown"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(modal.content) }}
                    />
                  ) : (
                    <iframe
                      title={`Preview of ${modal.path}`}
                      sandbox=""
                      srcDoc={modal.content}
                      className="w-full rounded-lg border border-white/10 bg-white min-h-[50vh]"
                    />
                  )
                ) : (
                  <textarea
                    value={modal.content}
                    onChange={(e) => setModal({ ...modal, content: e.target.value, dirty: true })}
                    rows={22}
                    spellCheck={false}
                    className="w-full font-mono text-xs px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-700/60 text-gray-200"
                  />
                )}
              </>
            )}
            {editError && <p className="text-xs text-red-300">{editError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StackFileManager;
