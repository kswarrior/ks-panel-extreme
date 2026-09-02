import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listInstancePorts, updateInstancePorts, isIP, InstancePort, PortAllocationInput } from '@/features/instances/api/instancePorts';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';
import Modal from '@/shared/components/ui/Modal';
import NumberInput from '@/shared/components/ui/NumberInput';
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect';
import TextInput from '@/shared/components/ui/TextInput';
import LimitSelect from '@/shared/components/ui/LimitSelect';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

const protocolOptions = [
  { value: 'tcp' as const, label: 'tcp' },
  { value: 'udp' as const, label: 'udp' },
];

const InstancePortsEditor: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();

  const [ports, setPorts] = useState<InstancePort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);

  // Add modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [host, setHost] = useState(8080);
  const [container, setContainer] = useState(80);
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp');
  const [ip, setIp] = useState('');

  const load = async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      const data = await listInstancePorts(instanceId);
      setPorts(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load ports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [instanceId]);

  const handleAdd = async () => {
    if (host < 1 || host > 65535 || container < 1 || container > 65535) {
      toast('Ports must be 1-65535', 'error');
      return;
    }
    if (!isIP(ip)) {
      toast('IP is not valid', 'error');
      return;
    }
    const next: PortAllocationInput[] = [
      ...ports.map((p) => ({ host: p.host_port, container: p.container_port, protocol: p.protocol, ip: p.ip })),
      { host, container, protocol, ip: ip.trim() },
    ];
    // duplicate check client-side
    const seen = new Set<string>();
    for (const p of next) {
      const key = `${(p.ip || '').trim()}:${p.host}/${p.protocol}`;
      if (seen.has(key)) {
        toast(`Duplicate host+ip+protocol ${key}`, 'error');
        return;
      }
      seen.add(key);
    }
    const prev = ports;
    // optimistic
    const optimistic: InstancePort[] = [
      ...ports,
      { id: Date.now(), instance_id: instanceId, host_port: host, container_port: container, protocol, ip: ip.trim(), created_at: new Date().toISOString() },
    ];
    setPorts(optimistic);
    setModalOpen(false);
    setSaving(true);
    try {
      const saved = await updateInstancePorts(instanceId, next);
      setPorts(saved);
      toast('Ports updated', 'success');
    } catch (e: any) {
      setPorts(prev);
      const msg = e?.response?.data || e?.response?.data?.error || e?.message || 'Failed to update ports';
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      setError(text);
      toast(text, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idx: number) => {
    const target = ports[idx];
    const ok = await confirm({
      title: 'Remove port?',
      message: `Remove ${target.host_port} → ${target.container_port}/${target.protocol}${target.ip ? ` (${target.ip})` : ''}?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    const prev = ports;
    const nextInputs = ports.filter((_, i) => i !== idx).map((p) => ({ host: p.host_port, container: p.container_port, protocol: p.protocol, ip: p.ip }));
    const optimistic = ports.filter((_, i) => i !== idx);
    setPorts(optimistic);
    setSaving(true);
    try {
      const saved = await updateInstancePorts(instanceId, nextInputs);
      setPorts(saved);
      toast('Port removed', 'success');
    } catch (e: any) {
      setPorts(prev);
      const msg = e?.response?.data || e?.response?.data?.error || e?.message || 'Failed to update ports';
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      setError(text);
      toast(text, 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(ports.length / limit));
  const displayPorts = ports.slice((page - 1) * limit, page * limit);

  if (loading) {
    return <div className="glass-card rounded-xl p-6 animate-pulse"><div className="h-5 w-1/3 bg-neutral-800 rounded" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--ks-heading)' }}>Ports</h2>
        <div className="flex items-center gap-2">
          <LimitSelect value={limit} onChange={(n) => { setLimit(n); setPage(1); }} />
          {canEdit && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50"
            >
              Add port
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>{typeof error === 'string' ? error : JSON.stringify(error)}</div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="px-4 py-2 font-medium">Host</th>
                <th className="px-4 py-2 font-medium">Container</th>
                <th className="px-4 py-2 font-medium">Protocol</th>
                <th className="px-4 py-2 font-medium">IP</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayPorts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No ports allocated. Click Add port to create one.</td>
                </tr>
              ) : (
                displayPorts.map((p, idx) => {
                  const realIdx = (page - 1) * limit + idx;
                  return (
                    <tr key={p.id || realIdx} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2 font-mono text-white">{p.host_port}</td>
                      <td className="px-4 py-2 font-mono text-white">{p.container_port}</td>
                      <td className="px-4 py-2"><span className="ks-badge" style={{ textTransform: 'uppercase' }}>{p.protocol}</span></td>
                      <td className="px-4 py-2 font-mono text-gray-300">{p.ip || '0.0.0.0'}</td>
                      <td className="px-4 py-2 text-right">
                        {canEdit ? (
                          <CardMenu
                            items={[{ key: 'delete', label: 'Remove', tone: 'danger' }]}
                            onSelect={(k) => { if (k === 'delete') handleDelete(realIdx); }}
                            ariaLabel="Port actions"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 text-xs text-gray-400">
            <span>Page {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded bg-white/10 disabled:opacity-30">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded bg-white/10 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add port allocation">
        <div className="space-y-4">
          <NumberInput id="host-port" label="Host port" value={host} onChange={setHost} min={1} max={65535} />
          <NumberInput id="container-port" label="Container port" value={container} onChange={setContainer} min={1} max={65535} />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Protocol</label>
            <SearchableSelect
              options={protocolOptions}
              value={protocol as any}
              onChange={(v) => setProtocol(v as any)}
              placeholder="Select protocol"
            />
          </div>
          <TextInput id="ip" label="IP (optional)" value={ip} onChange={setIp} placeholder="0.0.0.0 or 127.0.0.1" />
          {!isIP(ip) && <p className="text-xs" style={{ color: 'var(--ks-bad)' }}>IP is not valid</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Cancel</button>
            <button type="button" onClick={handleAdd} disabled={saving || !isIP(ip)} className="px-3 py-1.5 rounded-md text-sm bg-white text-black disabled:opacity-50">Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default InstancePortsEditor;
