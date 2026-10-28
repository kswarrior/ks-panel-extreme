import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getInstancePorts,
  updateInstancePorts,
  isIP,
  type InstancePort,
  type LivePort,
  type PortAllocationInput,
} from '@/features/instances/api/instancePorts';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';
import Modal from '@/shared/components/ui/Modal';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

const btnPrimary = 'px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors';
const btnGhost = 'px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition-colors';
const btnDanger = 'px-3 py-1.5 rounded-md text-sm bg-red-800 text-white hover:bg-red-700 disabled:opacity-50 transition-colors';

function validPort(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

function allocationKey(p: { ip?: string; host: number; protocol: string }): string {
  return `${(p.ip ?? '').trim()}:${p.host}/${p.protocol}`;
}

function toInputs(rows: InstancePort[]): PortAllocationInput[] {
  return rows.map((p) => ({
    host: p.host_port,
    container: p.container_port,
    protocol: p.protocol,
    ip: p.ip || '',
  }));
}

const LivePortsTable: React.FC<{ ports: LivePort[] }> = ({ ports }) => {
  if (ports.length === 0) {
    return <p className="text-sm text-gray-500">No listening sockets reported by the node.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-white/10 text-gray-400">
            <th className="px-3 py-2 font-medium">Proto</th>
            <th className="px-3 py-2 font-medium">Local address</th>
            <th className="px-3 py-2 font-medium">Remote address</th>
            <th className="px-3 py-2 font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {ports.map((p, i) => (
            <tr key={`${p.proto ?? ''}-${p.laddr ?? ''}-${i}`} className="border-t border-white/5">
              <td className="px-3 py-2">
                <span className="ks-badge uppercase">{p.proto || '—'}</span>
              </td>
              <td className="px-3 py-2 font-mono text-gray-200 break-all">{p.laddr || '—'}</td>
              <td className="px-3 py-2 font-mono text-gray-400 break-all">{p.raddr || '—'}</td>
              <td className="px-3 py-2 text-gray-400">{p.state || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const InstancePorts: React.FC<{ instanceId: number }> = ({ instanceId }) => {
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();

  const [allocations, setAllocations] = useState<InstancePort[]>([]);
  const [live, setLive] = useState<LivePort[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [host, setHost] = useState('8080');
  const [container, setContainer] = useState('80');
  const [protocol, setProtocol] = useState('tcp');
  const [ip, setIp] = useState('');

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      const snapshot = await getInstancePorts(instanceId);
      setAllocations(snapshot.allocations);
      setLive(snapshot.live);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load ports');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: InstancePort[], message: string) => {
    setSaving(true);
    setError('');
    try {
      await updateInstancePorts(instanceId, toInputs(next));
      toast(message, 'success');
      setModalOpen(false);
      setFormError('');
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data || e?.message || 'Failed to update ports';
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      setError(text);
      setFormError(text);
      toast(text, 'error');
    } finally {
      setSaving(false);
    }
  }, [instanceId, load]);

  const handleAdd = async () => {
    const hostPort = validPort(host);
    const containerPort = validPort(container);
    if (hostPort === null || containerPort === null) {
      setFormError('Ports must be between 1 and 65535.');
      return;
    }
    if (!isIP(ip)) {
      setFormError('IP must be a valid IPv4/IPv6 address or empty.');
      return;
    }
    const nextInput = { host: hostPort, container: containerPort, protocol, ip: ip.trim() };
    if (allocations.some((p) => allocationKey({ ip: p.ip, host: p.host_port, protocol: p.protocol }) === allocationKey(nextInput))) {
      setFormError(`Duplicate host+ip+protocol ${allocationKey(nextInput)}`);
      return;
    }
    const optimistic: InstancePort[] = [
      ...allocations,
      {
        id: -Date.now(),
        instance_id: instanceId,
        host_port: hostPort,
        container_port: containerPort,
        protocol,
        ip: ip.trim(),
        created_at: '',
      },
    ];
    await save(optimistic, 'Port added');
  };

  const handleRemove = async (target: InstancePort) => {
    const ok = await confirm({
      title: 'Remove port allocation?',
      message: `${target.host_port} → ${target.container_port}/${target.protocol}${target.ip ? ` (${target.ip})` : ''}`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    await save(allocations.filter((p) => p.id !== target.id), 'Port removed');
  };

  const sortedLive = useMemo(
    () => [...live].sort((a, b) => String(a.laddr ?? '').localeCompare(String(b.laddr ?? ''))),
    [live],
  );

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--ks-heading)' }}>Ports</h2>
            <p className="text-sm text-gray-400 mt-1">Host → container mappings for this instance. Changes are pushed to the node when it is running.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => void load()} disabled={loading || saving} className={btnGhost}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setFormError(''); setModalOpen(true); }}
                disabled={saving}
                className={btnPrimary}
              >
                Add port
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="ks-card" role="alert" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>
            {error}
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-gray-500">You need INSTANCES_EDIT permission to add or remove ports.</p>
        )}

        {loading && allocations.length === 0 ? (
          <div className="space-y-2 animate-pulse" aria-busy="true">
            <div className="h-4 w-40 rounded bg-neutral-800" />
            <div className="h-4 w-64 rounded bg-neutral-800" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-gray-400">
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">Container</th>
                  <th className="px-3 py-2 font-medium">Protocol</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No ports allocated. {canEdit ? 'Click Add port to create one.' : ''}
                    </td>
                  </tr>
                ) : (
                  allocations.map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-gray-200">{p.host_port}</td>
                      <td className="px-3 py-2 font-mono text-gray-200">{p.container_port}</td>
                      <td className="px-3 py-2"><span className="ks-badge uppercase">{p.protocol}</span></td>
                      <td className="px-3 py-2 font-mono text-gray-300">{p.ip || '0.0.0.0'}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <button type="button" onClick={() => void handleRemove(p)} disabled={saving} className={btnDanger}>
                            Remove
                          </button>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card rounded-xl p-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ks-heading)' }}>Listening sockets</h3>
          <p className="text-xs text-gray-500 mt-1">Live ports reported by the driver{loading ? ' — refreshing…' : ''}.</p>
        </div>
        <LivePortsTable ports={sortedLive} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { if (!saving) { setModalOpen(false); setFormError(''); } }}
        title="Add port allocation"
        footer={(
          <>
            <button type="button" className={btnGhost} onClick={() => { setModalOpen(false); setFormError(''); }} disabled={saving}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={() => void handleAdd()} disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </>
        )}
      >
        {formError && <p className="text-xs" role="alert" style={{ color: 'var(--ks-bad)' }}>{formError}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-400" htmlFor="port-host">
            Host port
            <input
              id="port-host"
              type="number"
              min={1}
              max={65535}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="glass-field w-full mt-1 font-mono"
            />
          </label>
          <label className="block text-xs text-gray-400" htmlFor="port-container">
            Container port
            <input
              id="port-container"
              type="number"
              min={1}
              max={65535}
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              className="glass-field w-full mt-1 font-mono"
            />
          </label>
        </div>
        <label className="block text-xs text-gray-400" htmlFor="port-protocol">
          Protocol
          <select
            id="port-protocol"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="glass-field w-full mt-1"
          >
            <option value="tcp">tcp</option>
            <option value="udp">udp</option>
          </select>
        </label>
        <label className="block text-xs text-gray-400" htmlFor="port-ip">
          IP (optional)
          <input
            id="port-ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="0.0.0.0 or 127.0.0.1"
            className="glass-field w-full mt-1 font-mono"
          />
        </label>
        <p className="text-[11px] text-gray-500">Leave IP empty to bind all interfaces. Duplicate host+IP+protocol combinations are rejected.</p>
      </Modal>
    </div>
  );
};

export default InstancePorts;
