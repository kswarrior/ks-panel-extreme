import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import {
  getStack,
  setStackGrants,
  activateStack,
  deactivateStack,
  deleteStack,
  updateStack,
  stackAppUrl,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import { Stack, stackCapabilityMeta, stackSourceMeta } from '@/shared/types/stack';
import StackFileManager from '@/features/stacks/components/StackFileManager';
import { useConfirm } from '@/shared/stores/confirmStore';

// StackDetail — one stack: themed header (icon tile + theme/page badges),
// capability checklist, workdir file manager, danger zone.
const StackDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [stack, setStack] = useState<Stack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  // App proxy (externally-run Go app floated at /<root>).
  const [proxyPort, setProxyPort] = useState('');
  const [proxyRoot, setProxyRoot] = useState('');
  const [proxySaving, setProxySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getStack(Number(id));
      setStack(s);
      const init: Record<string, boolean> = {};
      for (const p of s.permissions) init[p.capability] = p.granted;
      setGrants(init);
      setProxyPort(s.proxy_port ? String(s.proxy_port) : '');
      setProxyRoot(s.proxy_root_url || '');
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stack.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const toggle = async () => {
    setToggling(true);
    try {
      if (stack.active) {
        await deactivateStack(stack.id);
      } else {
        const res = await activateStack(stack.id) as any;
        if (res?.pending) {
          setError(res.message || `${res.pending} grants still pending`);
          return;
        }
      }
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Toggle failed.'));
    } finally {
      setToggling(false);
    }
  };

  const saveProxy = async () => {
    if (!stack) return;
    const port = proxyPort.trim() === '' ? 0 : Number(proxyPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      setError('Proxy port must be empty (off) or 1-65535.');
      return;
    }
    const root = proxyRoot.trim().toLowerCase();
    if (root && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(root)) {
      setError('Proxy root URL must be lowercase letters, digits and hyphens (max 32).');
      return;
    }
    if ((root && port === 0) || (!root && port !== 0)) {
      setError('Proxy port and root URL must be set together (or both empty to disable).');
      return;
    }
    setProxySaving(true);
    try {
      const s = await updateStack(stack.id, {
        name: stack.name,
        category: stack.category,
        version: stack.version,
        description: stack.description || '',
        icon: stack.icon || '',
        color: stack.color || '',
        spec: stack.spec || {},
        proxyPort: port,
        proxyRootUrl: root,
      });
      setStack(s);
      setProxyPort(s.proxy_port ? String(s.proxy_port) : '');
      setProxyRoot(s.proxy_root_url || '');
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to save proxy.'));
    } finally {
      setProxySaving(false);
    }
  };

  const remove = async (wipe: boolean) => {    const ok = await confirm({
      title: wipe ? `Delete ${stack.name} + wipe data?` : `Delete ${stack.name}?`,
      message: wipe ? 'Package, workdir AND data dir are removed.' : 'Package and workdir are removed. Data dir is kept.',
      confirmLabel: 'Delete',
      tone: 'danger',
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
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for stack ${stack.name}`}
          items={[
            { key: 'open', label: 'Open', tone: 'default' },
            { key: 'studio', label: 'Open in Studio', tone: 'default' },
            { key: 'toggle', label: toggling ? '…' : stack.active ? 'Deactivate' : 'Activate', tone: stack.active ? 'danger' : 'default' },
            { key: 'delete', label: 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'open') navigate(`/stacks/${stack.slug}/`);
            if (k === 'studio') navigate('/stacks/studio');
            if (k === 'toggle') void toggle();
            if (k === 'delete') void remove(false);
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex items-start gap-3 min-w-0">
          <CardIconTile
            icon={stack.icon || ''}
            color={stack.color || ''}
            size="lg"
            fallback={<span aria-hidden="true" className="text-2xl">📦</span>}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2 flex-wrap">
              {stack.name}
              <span className="font-mono text-xs text-gray-400">v{stack.version}</span>
              {stack.active
                ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
                : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">Inactive</span>}
              {src && src.key !== 'file' ? <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${src.badge}`}>{src.label}</span> : null}
            </h2>
            <p className="text-[11px] text-gray-500 font-mono mt-1">
              {stack.slug} · {stack.category} · {stack.runtime}{stack.entrypoint ? ` · ${stack.entrypoint}` : ''}
            </p>
            {stack.description && <p className="text-sm text-gray-300 mt-1">{stack.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="spa = full bundle in iframe, simple = panel-rendered markdown/html/blocks">
                pages: {stack.page_style}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="panel = inherits panel theme, custom = own theme.css, none = unthemed">
                theme: {stack.theme_mode}
              </span>
              {stack.color && (
                <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-gray-300">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: stack.color }} />
                  {stack.color}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {stack.active ? (
            <>
              <Link to={`/stacks/${stack.slug}/`} className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500">Open</Link>
              <button type="button" onClick={() => void toggle()} disabled={toggling} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">Stop</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={toggling}
              className="px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50"
            >
              {toggling ? '…' : 'Activate'}
            </button>
          )}
          <button type="button" onClick={() => navigate('/stacks/studio')} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Studio</button>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-gray-200 mb-2">Capability grants</h2>
        {stack.permissions.length === 0 ? (
          <p className="text-xs text-gray-500">No capabilities requested.</p>
        ) : (
          <div className="space-y-1.5">
            {stack.permissions.map((p) => (
              <label key={p.capability} className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={!!grants[p.capability]} onChange={(e) => setGrants((g) => ({ ...g, [p.capability]: e.target.checked }))} className="w-4 h-4 accent-emerald-500" />
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
        <h2 className="text-sm font-medium text-gray-200 mb-1">App proxy</h2>
        <p className="text-xs text-gray-500 mb-3">
          Float an externally-run Go app (a complete program you run yourself, e.g. a dashboard on{' '}
          <code className="font-mono">127.0.0.1:6600</code>) at <code className="font-mono">/&lt;root&gt;/</code> behind
          the panel session — no API key needed, the app sees you via <code className="font-mono">X-Panel-User-*</code> headers.
          Works while the stack is active.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <label className="block">
            <span className="text-xs text-gray-400">Loopback port (empty = off)</span>
            <input
              value={proxyPort}
              onChange={(e) => setProxyPort(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              placeholder="6600"
              inputMode="numeric"
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Root URL segment</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm text-gray-500 font-mono">/</span>
              <input
                value={proxyRoot}
                onChange={(e) => setProxyRoot(e.target.value.toLowerCase())}
                placeholder="dash"
                spellCheck={false}
                autoComplete="off"
                className="block w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </div>
          </label>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button type="button" onClick={() => void saveProxy()} disabled={proxySaving} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
            {proxySaving ? 'Saving…' : 'Save proxy'}
          </button>
          {(() => {
            const url = stackAppUrl(stack);
            return url ? (
              <a href={url} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
                Open app at {url}
              </a>
            ) : null;
          })()}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-gray-200 mb-1">Files</h2>
        <p className="text-xs text-gray-500 mb-3">Workdir of <code className="font-mono">{stack.slug}</code> — pages, theme.css, backend entry. Edits repackage the .ksps.</p>
        <StackFileManager stackId={stack.id} slug={stack.slug} />
        <button
          type="button"
          onClick={() => navigate(`/stack/${stack.id}/files`)}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200"
        >
          Open full-page file manager →
        </button>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-red-200 mb-2">Danger zone</h2>
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => void remove(false)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200">Delete (keep data)</button>
          <button type="button" onClick={() => void remove(true)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800/60 text-red-100">Delete + wipe data</button>
          <button type="button" onClick={() => navigate('/stacks')} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to stacks</button>
        </div>
      </GlassCard>
    </div>
  );
};

export default StackDetail;
