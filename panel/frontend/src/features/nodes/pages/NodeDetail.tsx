import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listNodes, nodeHeartbeats } from '@/shared/api/admin';
import type { Node, NodeHeartbeat } from '@/features/nodes/types/node';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useSettingsStore } from '@/shared/stores/settingsStore';
// Helper functions duplicated from Nodes page for formatting.
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 MB';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  const gb = bytes / 1024 ** 3;
  if (gb < 1024) return gb >= 10 ? `${gb.toFixed(1)}GB` : `${gb.toFixed(2)}GB`;
  const tb = gb / 1024;
  return tb >= 10 ? `${tb.toFixed(1)}TB` : `${tb.toFixed(2)}TB`;
}

function formatBytesPair(used: number, total: number): string {
  if (!total || total <= 0 || !Number.isFinite(total)) {
    return used > 0 ? `${formatBytes(used)} / —` : '— / —';
  }
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '0%';
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

// For simplicity we duplicate the small helper components needed for the detail view.

// HeartbeatIcon – same as in Nodes page (simplified).
const HeartbeatIcon: React.FC<{ state: 'up' | 'down' | 'pending' | 'partial' }> = ({ state }) => {
  const alive = state === 'up' || state === 'partial';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-5 h-5 ${alive ? 'animate-pulse' : ''}`}
    >
      <line x1="2" y1="17" x2="22" y2="17" opacity={alive ? '0.35' : '0.2'} />
      {alive ? (
        <path d="M2 17 L6 17 L8 11 L10 21 L12 13 L14 17 L22 17" />
      ) : (
        <path d="M2 17 L7 17 L9 17 L11 17 L13 17 L22 17" />
      )}
      {!alive && (
        <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" opacity="0.95" />
      )}
    </svg>
  );
};

// ResourceBar – minimal version.
const ResourceBar: React.FC<{ label: string; pair: string; pct: number }> = ({ label, pair, pct }) => {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="min-w-0" title={`${label} ${pair} (${clamped.toFixed(0)}%)`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-gray-500">{label}</span>
        <span className="text-[11px] font-mono font-semibold truncate">{pair}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${clamped}%`, background: 'linear-gradient(90deg, #34d399, #10b981)' }} />
      </div>
    </div>
  );
};

// DriverRing – copied from Nodes page.
const DriverRing: React.FC<{ node: Node }> = ({ node }) => {
  const r = 11;
  const stroke = 5;
  const c = 2 * Math.PI * r;
  const seg = c / 4;
  const grey = '#374151';
  const driversOk = node.hw_drivers_ok !== false;
  const DRIVER_ARCS = [
    { key: 'driver_docker', color: '#60a5fa' },
    { key: 'driver_kvm', color: '#34d399' },
    { key: 'driver_multipass', color: '#fbbf24' },
    { key: 'driver_lxd', color: '#f472b6' },
  ];
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="-rotate-90">
      <circle cx="15" cy="15" r={r} fill="none" stroke="#1f2937" strokeWidth={stroke} />
      {DRIVER_ARCS.map((a, i) => {
        const on = (node as any)[a.key] && driversOk;
        return (
          <circle
            key={a.key}
            cx="15"
            cy="15"
            r={r}
            fill="none"
            stroke={on ? a.color : grey}
            strokeWidth={stroke}
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-i * seg}
          />
        );
      })}
    </svg>
  );
};

const MONITOR_BARS = 40;

const NodeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [node, setNode] = useState<Node | null>(null);
  const [heartbeats, setHeartbeats] = useState<NodeHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const safeId = Number(id);
        if (!Number.isFinite(safeId)) {
          setError('Invalid node ID');
          setNode(null);
          return;
        }
        const nodes = await listNodes();
        const n = nodes.find((x) => x.id === safeId) || null;
        setNode(n);
        if (n) {
          const hb = await nodeHeartbeats(n.id, MONITOR_BARS);
          setHeartbeats(hb);
        }
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load node');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const back = () => navigate('/nodes');

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  }
  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  if (!node) {
    return <p className="text-gray-400">Node not found</p>;
  }

  // Compute monitor for uptime similar to list view.
  const buildMonitor = () => {
    const out: ('up' | 'down')[] = [];
    for (let i = 0; i < MONITOR_BARS; i++) {
      const hb = heartbeats[i];
      if (hb) {
        out.push(hb.status === 'up' ? 'up' : 'down');
      } else {
        out.push(node.status === 'up' ? 'up' : 'down');
      }
    }
    return out;
  };
  const monitor = useMemo(buildMonitor, [heartbeats, node]);
  const upPct = monitor.filter((s) => s === 'up').length / monitor.length * 100;

  const ramLabel = formatBytesPair(node.ram_used, node.ram_total);
  const cpuPct = node.cpu_percent != null ? formatPercent(node.cpu_percent) : '0%';
  const diskLabel = formatBytesPair(node.disk_used, node.disk_total);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Nodes list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-xl font-semibold text-white">Node Detail</h2>
      </div>
      <GlassCard className="p-4">
        <header className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300" aria-hidden="true">
            <HeartbeatIcon state={node.state as any} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white truncate" title={node.name}>{node.name}</h3>
            <p className="text-[11px] text-gray-500 truncate font-mono">
              {node.use_tls ? 'https' : 'http'}://{node.address}
            </p>
            <div className="mt-1 text-sm text-gray-400">
              <strong>Host:</strong> {node.use_tls ? 'https' : 'http'}://{node.address}
            </div>
            {node.location_country || node.location_node && (
              <div className="mt-1 text-sm text-gray-400">
                <strong>Location:</strong> {node.location_node ?? ''}{node.location_country ? ` (${node.location_country})` : ''}
              </div>
            )}
          </div>
          {/* Driver ring removed – host info shown above */}
        </header>
        <div className="mt-4 flex flex-col gap-2">
          <ResourceBar label="RAM" pair={ramLabel} pct={node.ram_total ? (node.ram_used / node.ram_total) * 100 : 0} />
          <ResourceBar label="CPU" pair={cpuLabel} pct={node.cpu_percent} />
          <ResourceBar label="DISK" pair={diskLabel} pct={node.disk_total ? (node.disk_used / node.disk_total) * 100 : 0} />
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-1">Uptime (24h)</h4>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="flex-1 h-2 bg-white/10 rounded">
              {monitor.map((s, i) => (
                <div
                  key={i}
                  className={`h-full ${s === 'up' ? 'bg-emerald-500' : 'bg-red-700'}`}
                  style={{ width: `${100 / MONITOR_BARS}%` }}
                />
              ))}
            </div>
            <span className="text-gray-300">{upPct.toFixed(1)}%</span>
          </div>
        </div>
        {node.notes && (
          <p className="mt-2 text-sm text-gray-400">Notes: {node.notes}</p>
        )}
        <footer className="mt-4 border-t pt-2 text-xs text-gray-500">
          Created {new Date(node.created_at).toLocaleDateString()}
        </footer>
      </GlassCard>
    </div>
  );
};

export default NodeDetail;
