import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import {
  getStack,
  mkdirStackPath,
  writeStackFile,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import type { Stack } from '@/shared/types/stack';
import StackFileManager, { templateFor } from '@/features/stacks/components/StackFileManager';

type FilesRoot = 'frontend' | 'backend';

const ROOT_META: Record<FilesRoot, { label: string; hint: string }> = {
  frontend: { label: 'Frontend', hint: 'HTML, Markdown, React TS under frontend/' },
  backend: { label: 'Backend', hint: 'Real Go sources under backend/' },
};

// StackFiles — full-page file manager for one stack (/stack/:id/files).
// Top-right Create opens the create sub-view (Folder|File tabs + filename
// input); the main area lists all files of the active root. Frontend root
// edits html/markdown/react-ts, backend root edits real Go — the editor is
// language-aware (badge + live preview for markdown/html, seeded starters
// for new files).
const StackFiles: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stack, setStack] = useState<Stack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [root, setRoot] = useState<FilesRoot>('frontend');
  const [creating, setCreating] = useState(false);
  const [createTab, setCreateTab] = useState<'file' | 'folder'>('file');
  const [createName, setCreateName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  // Bump to remount the manager (fresh listing) after a create.
  const [listSeq, setListSeq] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStack(await getStack(Number(id)));
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stack.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const doCreate = async () => {
    if (!stack) return;
    const name = createName.trim();
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      setCreateError('Name must be a plain file/folder name (no slashes) — pick the folder by browsing first.');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      const rel = `${root}/${name}`;
      if (createTab === 'file') {
        // Seed new code files by extension so they open ready to edit
        // (same starters the manager uses for in-list creation).
        await writeStackFile(stack.id, rel, templateFor(name));
      } else {
        await mkdirStackPath(stack.id, rel);
      }
      setCreating(false);
      setCreateName('');
      setListSeq((n) => n + 1);
    } catch (e) {
      setCreateError(extractStackApiError(e, 'Create failed.'));
    } finally {
      setCreateBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    );
  }
  if (error || !stack) {
    return (
      <div className="space-y-4">
        <Link to="/stacks" className="text-xs text-sky-300 hover:text-sky-200">← Stacks</Link>
        <GlassCard><p className="text-sm text-red-300">{error || 'Not found.'}</p></GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <div className="flex gap-1 rounded-md border border-white/10 bg-black/30 p-0.5" role="tablist" aria-label="Files root">
          {(['frontend', 'backend'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={root === r}
              onClick={() => { setRoot(r); setCreating(false); }}
              className="ks-tab px-3 py-1.5 rounded text-xs transition"
              style={PILL_TAB_STYLE}
              title={ROOT_META[r].hint}
            >
              {ROOT_META[r].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setCreating((v) => !v); setCreateError(''); }}
          aria-label="Create file or folder"
          className="ks-tab inline-flex items-center justify-center"
          style={PILL_TAB_STYLE}
          title="Create file or folder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </PageActionsPill>

      <div>
        <Link to={`/stack/${stack.id}`} className="text-xs text-sky-300 hover:text-sky-200">← {stack.name}</Link>
        <h1 className="text-xl font-semibold text-gray-100 mt-1">
          {ROOT_META[root].label} files
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {ROOT_META[root].hint} — workdir of <code className="font-mono">{stack.slug}</code>.
        </p>
      </div>

      {creating && (
        <GlassCard variant="form" className="space-y-3">
          <h2 className="text-sm font-medium text-gray-200">Create new in <code className="font-mono">{root}/</code></h2>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1 max-w-xs" role="tablist" aria-label="Create type">
            {(['file', 'folder'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={createTab === t}
                onClick={() => setCreateTab(t)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition ${createTab === t ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {t === 'file' ? 'File' : 'Folder'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="stack-files-page-name">
              {createTab === 'file' ? 'File name (e.g. app.go, overview.md, view.tsx, index.html)' : 'Folder name'}
            </label>
            <input
              id="stack-files-page-name"
              value={createName}
              autoFocus
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doCreate(); }}
              placeholder={createTab === 'file' ? (root === 'backend' ? 'e.g. server.go' : 'e.g. overview.md') : 'e.g. pages'}
              spellCheck={false}
              autoComplete="off"
              className="ks-input w-full ks-mono max-w-md"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Created inside <code className="ks-mono">{root}/</code> — browse into a subfolder first to place it deeper.
              {createTab === 'file' && ' New code files open pre-seeded by extension.'}
            </p>
          </div>
          {createError && <p className="text-xs text-red-300">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void doCreate()}
              disabled={createBusy || !createName.trim()}
              className="ks-btn-primary ks-btn disabled:opacity-40"
            >
              {createBusy ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="ks-btn">Cancel</button>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <StackFileManager key={`${root}-${listSeq}`} stackId={stack.id} slug={stack.slug} initialDir={root} bare />
      </GlassCard>

      <button
        type="button"
        onClick={() => navigate(`/stack/${stack.id}`)}
        className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300"
      >
        Back to stack
      </button>
    </div>
  );
};

export default StackFiles;
