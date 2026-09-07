import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import {
  getStack,
  setStackGrants,
  activateStack,
  deactivateStack,
  deleteStack,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import { Stack, stackCapabilityMeta, stackSourceMeta } from '@/shared/types/stack';
import { useConfirm } from '@/shared/stores/confirmStore';

// StackDetail — one stack: overview (theme/page-style/runtime badges),
// capability checklist, open link, danger zone. Files/Data/Env/Logs tabs
// land with Phase-1/2 (endpoints not yet served).
const StackDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [stack, setStack] = useState<Stack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getStack(Number(id));
      setStack(s);
      const init: Record<string, boolean> = {};
      for (const p of s.permissions) init[p.capability] = p.granted;
      setGrants(init);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stack.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error || !stack) return <p className="text-sm text-red-300">{error || 'Not found.'}</p>;

  const src = stackSourceMeta(stack.source);
  const save = async () => {
    setSaving(true);
    try {
      await setStackGrants(
        stack.id,
        Object.entries(grants).map(([capability, granted]) => ({ capability, granted })),
      );
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to save grants.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (wipe: boolean) => {
    const ok = await confirm({
      title: wipe ? `Delete ${stack.name} + wipe data?` : `Delete ${stack.name}?`,
      message: wipe ? 'Package, workdir AND data dir are removed.' : 'Package and workdir are removed. Data dir is kept.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteStack(stack.id, wipe);
      navigate('/stacks');
    } catch (e) {
      setError(extractStackApiError(e, 'Delete failed.'));
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/stacks" className="text-xs text-sky-300 hover:text-sky-200">← Stacks</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">{stack.icon || '📦'} {stack.name}</h1>
          <p className="text-[11px] text-gray-500 font-mono mt-0.5">
            {stack.slug} · v{stack.version} · {stack.category} · {stack.runtime} · {stack.entrypoint || 'no backend'}
          </p>
          {stack.description && <p className="text-sm text-gray-400 mt-1">{stack.description}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {src && <span className={`text-[10px] px-2 py-0.5 rounded-md border ${src.badge}`}>{src.label}</span>}
            <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="spa = full bundle in iframe, simple = panel-rendered markdown/html/blocks">
              pages: {stack.page_style}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="panel = inherits panel theme, custom = own theme.css, none = unthemed">
              theme: {stack.theme_mode}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-md border ${stack.active ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' : 'bg-gray-700/40 text-gray-300 border-gray-600/50'}`}>
              {stack.active ? 'active' : 'inactive'}
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {stack.active ? (
            <>
              <Link to={`/stacks/${stack.slug}/`} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/60 text-white">Open</Link>
              <button type="button" onClick={() => void deactivateStack(stack.id).then(() => load())} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-200">Stop</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void activateStack(stack.id).then(() => load()).catch((e) => setError(extractStackApiError(e, 'Activation failed.')))}
              className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white"
            >
              Activate
            </button>
          )}
        </div>
      </div>

      <GlassCard>
        <h2 className="text-sm font-medium text-gray-200 mb-2">Capability grants</h2>
        {stack.permissions.length === 0 ? (
          <p className="text-xs text-gray-500">No capabilities requested.</p>
        ) : (
          <div className="space-y-1.5">
            {stack.permissions.map((p) => (
              <label key={p.capability} className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={!!grants[p.capability]} onChange={(e) => setGrants((g) => ({ ...g, [p.capability]: e.target.checked }))} />
                <span>{stackCapabilityMeta(p.capability)?.label || p.capability}</span>
                <span className="text-[11px] text-gray-500 font-mono">{p.capability} · {p.access_level}</span>
              </label>
            ))}
          </div>
        )}
        <button type="button" onClick={() => void save()} disabled={saving} className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save grants'}
        </button>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-red-200 mb-2">Danger zone</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => void remove(false)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200">Delete (keep data)</button>
          <button type="button" onClick={() => void remove(true)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800/60 text-red-100">Delete + wipe data</button>
        </div>
      </GlassCard>
    </div>
  );
};

export default StackDetail;
