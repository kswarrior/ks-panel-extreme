import React, { useEffect, useMemo, useState } from 'react';
import GlassModal from '@/shared/components/ui/Modal';
import {
  runApplication,
  listApplicationRuns,
  type Application,
  type ApplicationRun,
} from '@/features/applications/api/applications';
import type {
  ApplicationConfigField,
  ApplicationRunTarget,
  ApplicationRunExecMode,
} from '@/features/applications/types/application';
import { listNodes } from '@/shared/api/admin';
import { listInstances } from '@/shared/api/admin';
import type { Node } from '@/features/nodes/types/node';
import type { Instance } from '@/features/instances/types/instance';

// ApplicationRunModal — the "where does this run?" dialog.
//
// Target picker: Panel Host or any registered node. Exec-mode picker:
// host filesystem or inside a container/VM (docker/lxd/kvm/multipass)
// running on that target. Env inputs are generated from the application's
// config_schema so operators supply tokens/keys/names without ever
// touching the script code.

const EXEC_MODES: { value: ApplicationRunExecMode; label: string }[] = [
  { value: 'host', label: 'Host (direct shell)' },
  { value: 'docker', label: 'Docker container' },
  { value: 'lxd', label: 'LXD container' },
  { value: 'kvm', label: 'KVM virtual machine' },
  { value: 'multipass', label: 'Multipass VM' },
];

const isLocalAddr = (addr: string): boolean =>
  addr.startsWith('127.0.0.1:') || addr.startsWith('localhost:') ||
  addr.startsWith('127.0.0.1/') || addr.startsWith('localhost/');

const statusChip = (s: ApplicationRun['status']): string => {
  switch (s) {
    case 'succeeded': return 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60';
    case 'failed': return 'bg-amber-900/60 text-amber-200 border-amber-700/60';
    case 'error': return 'bg-red-900/60 text-red-200 border-red-700/60';
    default: return 'bg-sky-900/60 text-sky-200 border-sky-700/60';
  }
};

interface Props {
  app: Application;
  onClose: () => void;
}

const ApplicationRunModal: React.FC<Props> = ({ app, onClose }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [target, setTarget] = useState<ApplicationRunTarget>('panel');
  const [nodeId, setNodeId] = useState<number | ''>('');
  const [execMode, setExecMode] = useState<ApplicationRunExecMode>('host');
  const [workload, setWorkload] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ApplicationRun | null>(null);
  const [runs, setRuns] = useState<ApplicationRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const schema: ApplicationConfigField[] = Array.isArray(app.config_schema) ? app.config_schema : [];

  // Prefill env values: saved env defaults first, then schema defaults for
  // anything still unset.
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const f of schema) {
      if (f.default !== undefined && f.default !== '') initial[f.key] = String(f.default);
    }
    const saved = app.env || {};
    for (const [k, v] of Object.entries(saved)) initial[k] = v;
    setEnvValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, i] = await Promise.all([listNodes(), listInstances()]);
        if (!cancelled) { setNodes(n); setInstances(i); }
      } catch {
        /* non-fatal: target pickers just stay sparse */
      } finally {
        if (!cancelled) setLoadingRuns(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadRuns = async () => {
    try {
      const rs = await listApplicationRuns(app.id, 10);
      setRuns(rs);
    } catch {
      /* history is best-effort */
    } finally {
      setLoadingRuns(false);
    }
  };
  useEffect(() => { loadRuns(); }, [app.id]);

  // Workload candidates: instances on the chosen target matching the mode.
  const workloadOptions = useMemo(() => {
    if (execMode === 'host') return [];
    return instances.filter((i) => {
      if (i.kind !== execMode) return false;
      if (target === 'node') return i.node_id === Number(nodeId);
      const n = nodes.find((x) => x.id === i.node_id);
      return !!n && isLocalAddr(n.address);
    });
  }, [instances, nodes, target, nodeId, execMode]);

  useEffect(() => {
    if (execMode !== 'host') setWorkload('');
  }, [execMode, target, nodeId]);

  const submit = async () => {
    setError('');
    setResult(null);
    if (execMode !== 'host' && !workload) {
      setError(`Pick a ${execMode} workload to run inside.`);
      return;
    }
    // Required-field enforcement happens client-side for UX; the server
    // re-validates everything anyway.
    for (const f of schema) {
      if (f.required && !(envValues[f.key] || '').trim()) {
        setError(`"${f.label || f.key}" is required.`);
        return;
      }
    }
    setRunning(true);
    try {
      const run = await runApplication(app.id, {
        target,
        node_id: target === 'node' ? Number(nodeId) : undefined,
        exec_mode: execMode,
        workload: execMode === 'host' ? undefined : workload,
        timeout_sec: timeoutSec,
        env: envValues,
      });
      setResult(run);
      await loadRuns();
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : e?.message || 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const updateEnvValue = (key: string, v: string) =>
    setEnvValues((prev) => ({ ...prev, [key]: v }));

  return (
    <GlassModal
      open
      onClose={onClose}
      title={`Run — ${app.name}`}
      maxWidth="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} className="ks-btn-cancel ks-btn-ghost">Close</button>
          <button onClick={submit} disabled={running} className="ks-btn-form ks-btn-primary">
            {running ? 'Running…' : 'Run'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-gray-400">Where</span>
            <select
              value={target === 'panel' ? 'panel' : `node:${nodeId}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'panel') { setTarget('panel'); return; }
                setTarget('node');
                setNodeId(Number(v.split(':')[1]) || '');
              }}
              className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
            >
              <option value="panel">
                Panel Host{nodes.some((n) => isLocalAddr(n.address)) ? ' (via local node)' : ' (direct shell)'}
              </option>
              {nodes.map((n) => (
                <option key={n.id} value={`node:${n.id}`}>{n.name} ({n.address})</option>
              ))}
            </select>
          </label>
          {target === 'node' && (
            <label className="block">
              <span className="text-xs text-gray-400">Node</span>
              <select
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              >
                <option value="">Select node…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.address})</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs text-gray-400">Execution context</span>
            <select
              value={execMode}
              onChange={(e) => setExecMode(e.target.value as ApplicationRunExecMode)}
              className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
            >
              {EXEC_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          {execMode !== 'host' && (
            <label className="block">
              <span className="text-xs text-gray-400">{execMode} workload</span>
              <select
                value={workload}
                onChange={(e) => setWorkload(e.target.value)}
                className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
              >
                <option value="">Select workload…</option>
                {workloadOptions.map((i) => (
                  <option key={i.id} value={i.name}>{i.display_name || i.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {target === 'panel' && execMode !== 'host' && (
          <p className="text-[11px] text-amber-300">
            Container/VM runs on the Panel Host go through its local node — set one up first with{' '}
            <code>./kspanel setup:localnode</code>. Host-shell runs work without one.
          </p>
        )}
        {target === 'node' && (
          <p className="text-[11px] text-gray-500">
            The script is staged onto <span className="text-gray-300">{nodes.find((n) => n.id === Number(nodeId))?.name || 'the node'}</span> over
            the panel→edge RPC and executed there.
          </p>
        )}

        <label className="block">
          <span className="text-xs text-gray-400">Timeout (seconds, 5–1800)</span>
          <input
            type="number"
            min={5}
            max={1800}
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(Number(e.target.value))}
            className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
          />
        </label>

        {schema.length > 0 && (
          <div className="border-t border-white/10 pt-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Configuration (environment)</p>
            {schema.map((f) => (
              <label key={f.key} className="block">
                <span className="text-xs text-gray-400">
                  {f.label || f.key}
                  {f.required && <span className="text-red-400"> *</span>}
                </span>
                {f.type === 'select' ? (
                  <select
                    value={envValues[f.key] ?? ''}
                    onChange={(e) => updateEnvValue(f.key, e.target.value)}
                    className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5"
                  >
                    <option value="">(none)</option>
                    {(f.options || []).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    rows={2}
                    value={envValues[f.key] ?? ''}
                    onChange={(e) => updateEnvValue(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono"
                  />
                ) : (
                  <input
                    type={f.type === 'secret' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                    autoComplete={f.type === 'secret' ? 'new-password' : undefined}
                    value={envValues[f.key] ?? ''}
                    onChange={(e) => updateEnvValue(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono"
                  />
                )}
                {f.description && <p className="text-[11px] text-gray-500 mt-0.5">{f.description}</p>}
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-xs px-3 py-2 rounded whitespace-pre-wrap">{error}</div>
        )}

        {result && (
          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${statusChip(result.status)}`}>
                {result.status}
              </span>
              <span className="text-xs text-gray-400">exit code {result.exit_code}</span>
              <span className="text-xs text-gray-500">
                {result.target === 'panel'
                  ? `panel host${result.node_name ? ` · ${result.node_name}` : ''}`
                  : `${result.node_name || `node #${result.node_id}`}${result.workload ? ` · ${result.exec_mode}:${result.workload}` : ''}`}
              </span>
            </div>
            {result.output && (
              <pre className="bg-black/40 border border-white/10 rounded-md p-2 text-xs text-emerald-200 max-h-56 overflow-auto whitespace-pre-wrap font-mono">{result.output}</pre>
            )}
            {result.error_output && (
              <pre className="bg-black/40 border border-white/10 rounded-md p-2 text-xs text-red-300 max-h-56 overflow-auto whitespace-pre-wrap font-mono">{result.error_output}</pre>
            )}
            {result.error && (
              <p className="text-xs text-red-400">{result.error}</p>
            )}
          </div>
        )}

        {!loadingRuns && runs.length > 0 && (
          <div className="border-t border-white/10 pt-3">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Recent runs</p>
            <ul className="space-y-1 max-h-40 overflow-auto">
              {runs.map((rn) => (
                <li key={rn.id}>
                  <button
                    onClick={() => setResult(rn)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-white/5"
                  >
                    <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border ${statusChip(rn.status)}`}>{rn.status}</span>
                    <span className="text-xs text-gray-300 truncate">
                      {rn.target === 'panel' ? 'panel host' : rn.node_name || `node #${rn.node_id}`}
                      {rn.workload ? ` · ${rn.exec_mode}:${rn.workload}` : ''}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-500">{new Date(rn.created_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </GlassModal>
  );
};

export default ApplicationRunModal;
