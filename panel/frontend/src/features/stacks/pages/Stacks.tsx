import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import {
  listStacks,
  deleteStack,
  uploadStackPackage,
  downloadStack,
  installStackFromUrl,
  createStackFromManifest,
  activateStack,
  deactivateStack,
  setStackGrants,
  extractStackApiError,
  getStackEngine,
  setStackEngine,
} from '@/features/stacks/api/stacks';
import {
  Stack,
  stackCapabilityMeta,
  stackSourceMeta,
  type StackEngineStatus,
} from '@/shared/types/stack';
import { useConfirm } from '@/shared/stores/confirmStore';

const capLabel = (capability: string): string =>
  stackCapabilityMeta(capability)?.label || capability;

const Stacks: React.FC = () => {
  const confirm = useConfirm();
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'file' | 'url' | 'json'>('file');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [jsonInput, setJsonInput] = useState('{\n  "name": "",\n  "slug": "",\n  "category": "dashboard"\n}');
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState('');

  const [grantStack, setGrantStack] = useState<Stack | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState('');

  const [engine, setEngineState] = useState<StackEngineStatus | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, eng] = await Promise.all([
        listStacks(),
        getStackEngine().catch(() => null),
      ]);
      setStacks(list);
      setEngineState(eng);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stacks.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = stacks.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  });

  const doInstall = async () => {
    setInstallBusy(true);
    setInstallError('');
    try {
      if (installTab === 'file') {
        if (!uploadFile) throw new Error('Pick a .ksps file first.');
        await uploadStackPackage(uploadFile);
      } else if (installTab === 'url') {
        if (!urlInput.trim()) throw new Error('Enter a URL first.');
        await installStackFromUrl(urlInput.trim());
      } else {
        const manifest = JSON.parse(jsonInput);
        await createStackFromManifest(manifest, 'json');
      }
      setInstallOpen(false);
      setUploadFile(null);
      setUrlInput('');
      await load();
    } catch (e: any) {
      setInstallError(e?.message && installTab === 'json' && e instanceof SyntaxError
        ? `Invalid JSON: ${e.message}`
        : extractStackApiError(e, 'Install failed.'));
    } finally {
      setInstallBusy(false);
    }
  };

  const openGrants = (s: Stack) => {
    const init: Record<string, boolean> = {};
    for (const p of s.permissions) init[p.capability] = p.granted;
    setGrants(init);
    setGrantError('');
    setGrantStack(s);
  };

  const saveGrants = async () => {
    if (!grantStack) return;
    setGrantBusy(true);
    setGrantError('');
    try {
      await setStackGrants(
        grantStack.id,
        Object.entries(grants).map(([capability, granted]) => ({ capability, granted })),
      );
      setGrantStack(null);
      await load();
    } catch (e) {
      setGrantError(extractStackApiError(e, 'Failed to save grants.'));
    } finally {
      setGrantBusy(false);
    }
  };

  const doActivate = async (s: Stack) => {
    try {
      const conflict = await activateStack(s.id);
      if (conflict && typeof conflict === 'object' && 'pending' in conflict) {
        const fresh: Stack = { ...s, permissions: conflict.permissions, pending: conflict.pending };
        openGrants(fresh);
        return;
      }
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Activation failed.'));
    }
  };

  const doDelete = async (s: Stack, wipe: boolean) => {
    const ok = await confirm({
      title: wipe ? `Delete ${s.name} + wipe data?` : `Delete ${s.name}?`,
      message: wipe
        ? 'The package, workdir AND the stack data dir (KV/sqlite/snapshots) are removed. This cannot be undone.'
        : 'The package and workdir are removed. Data dir is kept.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteStack(s.id, wipe);
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Delete failed.'));
    }
  };

  const doDownload = async (s: Stack) => {
    try {
      const blob = await downloadStack(s.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${s.slug}.ksps`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(extractStackApiError(e, 'Download failed.'));
    }
  };

  const toggleEngine = async () => {
    if (!engine) return;
    setEngineBusy(true);
    try {
      await setStackEngine(!engine.enabled);
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Engine toggle failed.'));
    } finally {
      setEngineBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Stacks</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Full-stack isolated apps — one stack is one dashboard or tool. Installs inactive until every capability is approved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {engine && (
            <button
              type="button"
              onClick={() => void toggleEngine()}
              disabled={engineBusy}
              className={`text-xs px-3 py-1.5 rounded-lg border ${engine.enabled ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' : 'bg-red-900/40 text-red-200 border-red-700/50'}`}
              title="Panel-wide stacks kill switch"
            >
              {engine.enabled ? 'Stacks on' : 'Stacks off'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setInstallOpen(true); setInstallError(''); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white"
          >
            Install stack
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stacks…"
          className="w-full max-w-sm text-sm px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-700/60 text-gray-200 placeholder:text-gray-500"
        />
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-gray-400">No stacks yet. Install a <code className="font-mono">.ksps</code> package or paste a manifest.</p>
        </GlassCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const src = stackSourceMeta(s.source);
            return (
              <GlassCard key={s.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true">{s.icon || '📦'}</span>
                      <Link to={`/stack/${s.id}`} className="font-medium text-gray-100 hover:text-sky-300 truncate">
                        {s.name}
                      </Link>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.active ? 'bg-emerald-400' : 'bg-gray-500'}`} title={s.active ? 'active' : 'inactive'} />
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5">{s.slug} · v{s.version} · {s.category} · {s.runtime} · {s.page_style}/{s.theme_mode}</p>
                    {s.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{s.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {src && <span className={`text-[10px] px-2 py-0.5 rounded-md border ${src.badge}`}>{src.label}</span>}
                  {s.pending > 0 && (
                    <button type="button" onClick={() => openGrants(s)} className="text-[10px] px-2 py-0.5 rounded-md border bg-amber-900/40 text-amber-200 border-amber-700/50">
                      {s.pending} grant{s.pending === 1 ? '' : 's'} pending
                    </button>
                  )}
                  {s.permissions.map((p) => (
                    <span key={p.id} title={`${p.capability} (${p.access_level}) — ${p.granted ? 'granted' : 'pending'}`} className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300">
                      {capLabel(p.capability)}{p.granted ? '' : ' •'}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {s.active ? (
                    <>
                      <Link to={`/stacks/${s.slug}/`} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/60 text-white">Open</Link>
                      <button type="button" onClick={() => void deactivateStack(s.id).then(() => load()).catch((e) => setError(extractStackApiError(e, 'Deactivate failed.')))} className="text-xs px-2.5 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-200">Stop</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => void doActivate(s)} className="text-xs px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white">Activate</button>
                  )}
                  <button type="button" onClick={() => openGrants(s)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-200">Grants</button>
                  <button type="button" onClick={() => void doDownload(s)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-200">.ksps</button>
                  <button type="button" onClick={() => void doDelete(s, false)} className="text-xs px-2.5 py-1 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200">Delete</button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {installOpen && (
        <GlassModal onClose={() => setInstallOpen(false)} title="Install stack">
          <div className="flex gap-1.5 mb-3">
            {(['file', 'url', 'json'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setInstallTab(t)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${installTab === t ? 'bg-sky-900/50 text-sky-200 border-sky-700/60' : 'bg-gray-800/50 text-gray-400 border-gray-700/50'}`}
              >
                {t === 'file' ? '.ksps file' : t === 'url' ? 'From URL' : 'JSON'}
              </button>
            ))}
          </div>
          {installTab === 'file' && (
            <input type="file" accept=".ksps,.zip" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="block text-sm text-gray-300" />
          )}
          {installTab === 'url' && (
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com/my-stack.ksps" className="w-full text-sm px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-700/60 text-gray-200" />
          )}
          {installTab === 'json' && (
            <textarea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} rows={10} spellCheck={false} className="w-full font-mono text-xs px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-700/60 text-gray-200" />
          )}
          {installError && <p className="text-xs text-red-300 mt-2">{installError}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setInstallOpen(false)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-200">Cancel</button>
            <button type="button" onClick={() => void doInstall()} disabled={installBusy} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {installBusy ? 'Installing…' : 'Install (inactive)'}
            </button>
          </div>
        </GlassModal>
      )}

      {grantStack && (
        <GlassModal onClose={() => setGrantStack(null)} title={`Grants — ${grantStack.name}`}>
          <p className="text-xs text-gray-400 mb-2">Approve each capability. Activation refuses until all are granted.</p>
          <div className="space-y-1.5">
            {grantStack.permissions.length === 0 && <p className="text-xs text-gray-500">No capabilities requested — safe to activate.</p>}
            {grantStack.permissions.map((p) => (
              <label key={p.capability} className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={!!grants[p.capability]} onChange={(e) => setGrants((g) => ({ ...g, [p.capability]: e.target.checked }))} />
                <span>{capLabel(p.capability)}</span>
                <span className="text-[11px] text-gray-500 font-mono">{p.capability} · {p.access_level}</span>
              </label>
            ))}
          </div>
          {grantError && <p className="text-xs text-red-300 mt-2">{grantError}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setGrantStack(null)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-200">Close</button>
            <button type="button" onClick={() => void saveGrants()} disabled={grantBusy} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {grantBusy ? 'Saving…' : 'Save grants'}
            </button>
          </div>
        </GlassModal>
      )}
    </div>
  );
};

export default Stacks;
