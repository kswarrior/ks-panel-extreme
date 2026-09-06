import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listNodes, nodeHeartbeats, probeNode, listInstances, rotateNodeToken, deleteNode, purgeLocalNode, getNodeUpdateInfo } from '@/shared/api/admin';
import type { Node, NodeHeartbeat } from '@/features/nodes/types/node';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { NodeIcon, nodeIconByKey, isCustomNodeIconSvg } from '../utils/nodeIcons';
import { HeartbeatIcon, DriverRing, ResourceBar } from '../components/NodesComponents';
import { formatBytesPair, formatPercent } from '../utils/nodesUtils';
import { countryByCode } from '@/shared/components/forms/LocationField/countries';
import { STATE_STYLES, MONITOR_BARS, DRIVER_ARCS } from '../types/nodes';
import { Gauge } from '@/features/system/components/SystemCharts';
import { fmtGB } from '@/features/system/components/SystemCharts';
import { useConfirm } from '@/shared/stores/confirmStore';
import NodeUpdateTab from '../components/NodeUpdateTab';

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof (data as any).error === 'string') return (data as any).error;
    if (typeof (data as any).message === 'string') return (data as any).message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '—';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.floor(secs / 60)}m`;
}

const NodeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [node, setNode] = useState<Node | null>(null);
  const [heartbeats, setHeartbeats] = useState<NodeHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState('');
  const [copied, setCopied] = useState('');
  const [instanceStats, setInstanceStats] = useState<{ total: number; running: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [edgeVersion, setEdgeVersion] = useState('');



  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid node ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const nodes = await listNodes();
        if (cancelled) return;
        const n = nodes.find((x) => x.id === numericId) || null;
        setNode(n);
        if (n) {
          try {
            const hb = await nodeHeartbeats(n.id, MONITOR_BARS);
            if (!cancelled) setHeartbeats(hb);
          } catch {
            if (!cancelled) setHeartbeats([]);
          }
          // best-effort instance count hosted on this node
          listInstances().then((all) => {
            if (cancelled) return;
            const mine = all.filter((ins) => ins.node_id === n.id);
            setInstanceStats({ total: mine.length, running: mine.filter((i) => i.status === 'running').length });
          }).catch(() => {});
        } else {
          if (!cancelled) setHeartbeats([]);
          if (!cancelled) setInstanceStats(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load node'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  useEffect(() => {
    let cancelled = false;
    // Best-effort live edge version for the V badge in the header.
    // Old/offline edges 404 or time out — the badge simply stays hidden.
    if (!validId) return;
    setEdgeVersion('');
    getNodeUpdateInfo(numericId)
      .then((info) => {
        if (cancelled) return;
        const v = info?.local?.version?.trim();
        if (v) setEdgeVersion(v);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [numericId, validId]);

  const back = () => navigate('/nodes');

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const handleProbe = async () => {
    if (!node) return;
    setProbing(true);
    setProbeMsg('');
    try {
      const res = await probeNode(node.id);
      setProbeMsg(res.reachable === 'yes' ? `✓ reachable${res.name ? ` as ${res.name}` : ''}` : `✗ ${res.note || 'unreachable'}`);
      // refresh node list to get fresh state
      const nodes = await listNodes();
      const n = nodes.find((x) => x.id === node.id) || null;
      if (n) setNode(n);
      const hb = await nodeHeartbeats(node.id, MONITOR_BARS).catch(() => [] as NodeHeartbeat[]);
      setHeartbeats(hb);
    } catch (e: any) {
      setProbeMsg(getErrorMessage(e, 'Probe failed'));
    } finally {
      setProbing(false);
    }
  };

  const handleRotateToken = async () => {
    if (!node) return;
    setRotating(true);
    try {
      await rotateNodeToken(node.id);
      const nodes = await listNodes();
      const n = nodes.find((x) => x.id === node.id) || null;
      if (n) setNode(n);
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to rotate token'));
    } finally {
      setRotating(false);
    }
  };

  const handleDelete = async () => {
    if (!node) return;
    if (!(await confirm({ title: 'Delete node', message: `Delete node "${node.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteNode(node.id);
      navigate('/nodes');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to delete node'));
      setDeleting(false);
    }
  };

  const handlePurge = async () => {
    if (!node) return;
    if (!(await confirm({ title: 'Remove local edge', message: `Delete edge completely? This removes local files for node "${node.name}" and cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setPurging(true);
    try {
      await purgeLocalNode(node.id);
      navigate('/nodes');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to purge node'));
      setPurging(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-48 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Nodes list">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Node Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40">
          <p className="text-red-400 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Retry</button>
            <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
          </div>
        </GlassCard>
      </div>
    );
  }
  if (!node) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Node Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Node not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back to nodes</button></GlassCard>
      </div>
    );
  }

  const state = (node.state || (node.status === 'up' ? 'up' : 'down')) as keyof typeof STATE_STYLES;
  const st = STATE_STYLES[state] || STATE_STYLES.down;

  // Plain computation, NOT a hook: this runs after the conditional early
  // returns above, so a hook here would break React's rules-of-hooks order.
  const monitor: ('up' | 'down')[] = [];
  for (let i = 0; i < MONITOR_BARS; i++) {
    const hb = heartbeats[i];
    if (hb) monitor.push(hb.status === 'up' ? 'up' : 'down');
    else monitor.push(node.status === 'up' ? 'up' : 'down');
  }
  const upPct = monitor.length ? (monitor.filter((s) => s === 'up').length / monitor.length * 100) : 0;

  const ramLabel = formatBytesPair(node.ram_used, node.ram_total);
  const cpuPct = node.cpu_percent != null ? formatPercent(node.cpu_percent) : '0%';
  const diskLabel = formatBytesPair(node.disk_used, node.disk_total);
  const modeLabel = (() => {
    const m = (node as any).connection_mode || (node.address === 'tunnel' ? 'reverse_tunnel' : (node.address.startsWith('127.0.0.1:') || node.address.startsWith('localhost:') ? 'local_port' : 'direct'));
    const map: Record<string,string> = { direct: 'Direct', reverse_tunnel: 'Reverse Tunnel (WSS)', both: 'Both (Port + WSS)', local_port: 'Local (Port)', local_wss: 'Local (WSS)', local_both: 'Local (Both)' };
    return map[m] || m;
  })();
  const isLocal = (() => {
    const m = (node as any).connection_mode;
    if (m === 'local_port' || m === 'local_wss' || m === 'local_both') return true;
    if (m === 'reverse_tunnel' || m === 'direct' || m === 'both') return false;
    return node.address.startsWith('127.0.0.1:') || node.address.startsWith('localhost:');
  })();
  const hostUrl = (() => {
    const m = (node as any).connection_mode;
    if (m === 'reverse_tunnel' || node.address === 'tunnel') return 'WSS tunnel (edge dials panel)';
    if (m === 'both') return `${node.use_tls ? 'https' : 'http'}://${node.address} + WSS tunnel`;
    if (m === 'local_both') return `127.0.0.1 port + WSS tunnel`;
    return `${node.use_tls ? 'https' : 'http'}://${node.address}`;
  })();
  const country = node.location_country ? countryByCode(node.location_country) : undefined;
  const hasLocation = !!(node.location_country || node.location_node);

  return (
    <div className="space-y-4">
      {/* Fixed top-right actions pill — back + title live in the app header
          ("Nodes / Detail"). The menu portals its dropdown, so it is safe
          inside the fixed container. */}
      <PageActionsPill>
          <CardMenu
            ariaLabel={`Actions for node ${node.name}`}
            items={[
              { key: 'edit', label: 'Edit node', tone: 'default' },
              { key: 'probe', label: probing ? 'Probing…' : 'Recheck now', tone: 'default' },
              { key: 'copyAddr', label: copied === 'addr' ? 'Copied!' : 'Copy address', tone: 'default' },
              { key: 'copyHost', label: copied === 'host' ? 'Copied!' : 'Copy host URL', tone: 'default' },
              { key: 'rotate', label: rotating ? 'Rotating…' : 'Rotate token', tone: 'default' },
              ...(isLocal ? [{
                key: 'purge',
                label: purging ? 'Purging…' : 'Delete edge completely',
                tone: 'danger' as const,
                disabled: purging,
              }] : []),
              { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger', disabled: deleting },
            ]}
            onSelect={(k) => {
              if (k === 'edit') navigate(`/nodes/${node.id}/edit`);
              if (k === 'probe') handleProbe();
              if (k === 'copyAddr') copy(node.address, 'addr');
              if (k === 'copyHost') copy(hostUrl, 'host');
              if (k === 'rotate') handleRotateToken();
              if (k === 'purge') handlePurge();
              if (k === 'delete') handleDelete();
            }}
          />
      </PageActionsPill>
      <p className="text-xs text-gray-500 truncate">ID {node.id} · {hostUrl} · {relativeTime(node.created_at)}</p>

      <GlassCard className="ks-stat-card p-4">
        <header className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300" aria-hidden="true">
            {node.icon ? (
              <span style={node.color ? { color: node.color } : undefined}>
                <NodeIcon icon={node.icon} className="w-5 h-5" />
              </span>
            ) : (
              <HeartbeatIcon state={state as any} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate flex items-center gap-2" title={node.name}>{node.name}
              {edgeVersion && (
                <span
                  className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-white/10 bg-white/5 text-gray-300 font-mono"
                  title={`Edge version: ${edgeVersion}`}
                >
                  V {edgeVersion}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${st.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
              </span>
            </h3>
            <p className="text-[11px] text-gray-500 truncate font-mono flex items-center gap-1">
              {hostUrl}
              <button onClick={() => copy(hostUrl, 'host2')} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white" aria-label="Copy host">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
              </button>
              {copied === 'host2' && <span className="text-[10px] text-emerald-300">copied</span>}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300 font-mono">{node.use_tls ? 'TLS' : 'plain'} · {node.address}</span>
              {node.category && <span className="text-[11px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300">{node.category}</span>}
              {hasLocation && (
                <span className="text-[11px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300 flex items-center gap-1">
                  {country ? <span>{country.flag} {country.name}</span> : null}
                  {node.location_node ? <span className="font-mono">{country ? `· ${node.location_node}` : node.location_node}</span> : null}
                  {!country && node.location_country ? <span>{node.location_country}</span> : null}
                </span>
              )}
            </div>
            {node.notes && <p className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-words">{node.notes}</p>}
          </div>
          <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
            <DriverRing node={node} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">drivers</span>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ResourceBar label="RAM" pair={ramLabel} pct={node.ram_total ? (node.ram_used / node.ram_total) * 100 : 0} from="#34d399" to="#10b981" ok={node.hw_ram_ok} />
          <ResourceBar label="CPU" pair={cpuPct} pct={node.cpu_percent ?? 0} from="#60a5fa" to="#3b82f6" ok={node.hw_cpu_ok} />
          <ResourceBar label="DISK" pair={diskLabel} pct={node.disk_total ? (node.disk_used / node.disk_total) * 100 : 0} from="#a78bfa" to="#8b5cf6" ok={node.hw_disk_ok} />
          <ResourceBar
            label="Instances"
            pair={instanceStats === null ? '—' : `${instanceStats.total} · ${instanceStats.running} running`}
            pct={instanceStats && instanceStats.total > 0 ? (instanceStats.running / instanceStats.total) * 100 : 0}
            from="#38bdf8"
            to="#6366f1"
          />
        </div>

        <div className="mt-6">
          <h4 className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">Resource Usage</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">RAM</span>
                <span className="text-xs font-mono text-gray-300">{fmtGB(node.ram_used / 1024 ** 3)} / {fmtGB(node.ram_total / 1024 ** 3)}</span>
              </div>
              <Gauge value={node.ram_used} total={node.ram_total} label="RAM" />
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">CPU</span>
                <span className="text-xs font-mono text-gray-300">{node.cpu_percent?.toFixed(1) ?? '0'}%</span>
              </div>
              <Gauge value={node.cpu_percent ?? 0} total={100} label="CPU" />
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">DISK</span>
                <span className="text-xs font-mono text-gray-300">{fmtGB(node.disk_used / 1024 ** 3)} / {fmtGB(node.disk_total / 1024 ** 3)}</span>
              </div>
              <Gauge value={node.disk_used} total={node.disk_total} label="DISK" />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[11px] uppercase tracking-wide text-gray-500">Uptime · 24h · {MONITOR_BARS} checks</h4>
            <span className="text-xs font-mono text-gray-300">{upPct.toFixed(1)}% · {formatUptime(node.uptime_secs)}</span>
          </div>
          <div className="flex h-2 bg-white/10 rounded overflow-hidden">
            {monitor.map((s, i) => (
              <div
                key={i}
                className={`h-full shrink-0 ${s === 'up' ? 'bg-emerald-500' : 'bg-red-700'}`}
                style={{ width: `${100 / MONITOR_BARS}%` }}
                title={s === 'up' ? 'up' : 'down'}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>{node.uptime_pct != null ? `${Number(node.uptime_pct).toFixed(1)}% trailing` : ''}</span>
            <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.hw_ram_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">RAM: no data</span>}
          {node.hw_cpu_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">CPU: no data</span>}
          {node.hw_disk_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">Disk: no data</span>}
          {node.hw_drivers_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">Drivers: detection failed</span>}
          {node.hw_uptime_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">Uptime: no data</span>}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Connectivity & Health</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Mode</span><span className="text-white text-xs px-1.5 py-0.5 rounded border border-white/10 bg-white/5">{modeLabel}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Edge version</span>{edgeVersion ? <span className="text-white font-mono text-xs" title={`Edge version: ${edgeVersion}`}>V {edgeVersion}</span> : <span className="text-gray-500 text-xs">—</span>}</div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Address</span><span className="font-mono text-xs text-white truncate max-w-[160px]" title={node.address}>{node.address} <button onClick={() => copy(node.address, 'addr2')} className="ml-1 p-1 rounded hover:bg-white/10 inline-flex align-middle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg></button></span></div>
            <div className="flex justify-between"><span className="text-gray-400">TLS</span><span className={node.use_tls ? 'text-emerald-300' : 'text-gray-400'}>{node.use_tls ? 'https' : 'http'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Skip TLS verify</span><span className={node.skip_tls_verify ? 'text-amber-300' : 'text-gray-400'}>{node.skip_tls_verify ? 'yes' : 'no'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Health checks</span><span className={node.health_enabled ? 'text-emerald-300' : 'text-gray-500'}>{node.health_enabled ? 'enabled' : 'disabled'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Interval</span><span className="text-white font-mono text-xs">{node.health_interval}s · timeout {node.health_timeout}s · retries {node.health_retries}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Probe reachable</span><span className={node.probe_reachable ? 'text-emerald-300' : node.probe_reachable === false ? 'text-red-300' : 'text-gray-500'}>{node.probe_reachable == null ? 'unknown' : node.probe_reachable ? 'yes' : 'no'}</span></div>
            {node.probe_checked_at && <div className="flex justify-between"><span className="text-gray-400">Last probe</span><span className="text-white text-xs" title={formatDate(node.probe_checked_at)}>{formatDate(node.probe_checked_at)} · {relativeTime(node.probe_checked_at)}</span></div>}
            {node.probe_seen_name && <div className="flex justify-between"><span className="text-gray-400">Seen as</span><span className="text-white font-mono text-xs">{node.probe_seen_name}</span></div>}
            {node.last_seen_at && <div className="flex justify-between"><span className="text-gray-400">Last seen</span><span className="text-white text-xs" title={formatDate(node.last_seen_at)}>{formatDate(node.last_seen_at)} · {relativeTime(node.last_seen_at)}</span></div>}
            {node.next_probe_at && <div className="flex justify-between"><span className="text-gray-400">Next probe</span><span className="text-white text-xs">{formatDate(node.next_probe_at)}</span></div>}
            {node.probe_fail_count != null && node.probe_fail_count > 0 && <div className="flex justify-between"><span className="text-gray-400">Fail count</span><span className="text-amber-300">{node.probe_fail_count}</span></div>}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleProbe} disabled={probing} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50">{probing ? 'Probing…' : 'Recheck now'}</button>
            <button onClick={() => copy(hostUrl, 'host3')} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">{copied === 'host3' ? 'Copied!' : 'Copy host'}</button>
          </div>
          {probeMsg && <p className="mt-2 text-xs px-2 py-1.5 rounded border border-white/10 bg-white/5 text-gray-300">{probeMsg}</p>}
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Allocation & Placement</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Category</span><span className="text-white">{node.category || <span className="text-gray-500">—</span>}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Country</span><span className="text-white">{country ? `${country.flag} ${country.name} (${node.location_country})` : (node.location_country || '—')}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Site label</span><span className="text-white font-mono text-xs">{node.location_node || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Icon</span><span className="text-white flex items-center gap-1">{node.icon ? <><NodeIcon icon={node.icon} className="w-3.5 h-3.5" />{nodeIconByKey(node.icon) ? node.icon : isCustomNodeIconSvg(node.icon) ? 'Custom SVG' : node.icon}</> : '—'} {node.color ? <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: node.color }} /> : null}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Allowed kinds</span><span className="text-white font-mono text-xs">{node.allowed_kinds || 'any'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">RAM alloc</span><span className="text-white font-mono text-xs">{node.alloc_mem_mib ? `${node.alloc_mem_mib} MiB · ${node.mem_overcommit_pct}%` : 'inherit'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Disk alloc</span><span className="text-white font-mono text-xs">{node.alloc_disk_mib ? `${node.alloc_disk_mib} MiB · ${node.disk_overcommit_pct}%` : 'inherit'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Install dir</span><span className="text-white font-mono text-xs truncate max-w-[150px]" title={node.install_dir}>{node.install_dir || 'default'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Instances dir</span><span className="text-white font-mono text-xs truncate max-w-[150px]" title={node.instances_dir || '/var/lib/kspanel/instances'}>{node.instances_dir || '/var/lib/kspanel/instances (default)'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Token prefix</span><span className="text-white font-mono text-xs">{node.token_prefix || '—'} <button onClick={() => copy(node.token_prefix, 'tok')} className="ml-1 p-1 rounded hover:bg-white/10 inline-flex"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg></button>{copied === 'tok' && <span className="text-[10px] text-emerald-300 ml-1">copied</span>}</span></div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Drivers available on this edge</p>
            <div className="flex flex-wrap gap-1.5">
              {DRIVER_ARCS.map((d) => (
                <span
                  key={d.key}
                  title={node[d.key] ? `${d.label}: available` : `${d.label}: not detected`}
                  className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border ${node[d.key] ? 'border-white/10 bg-white/5 text-gray-200' : 'border-white/5 bg-transparent text-gray-500'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: node[d.key] ? d.color : '#374151' }} />
                  {d.label}
                </span>
              ))}
              {node.hw_drivers_ok === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">detection failed</span>}
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-3">Edge Update & Reinstall</h4>
        <NodeUpdateTab nodeId={node.id} nodeName={node.name} />
      </GlassCard>

      <GlassCard className="p-3">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Timeline</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Created</p>
            <p className="text-xs text-white mt-1" title={formatDate(node.created_at)}>{formatDate(node.created_at)}</p>
            <p className="text-[11px] text-gray-500">{relativeTime(node.created_at)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Last seen</p>
            <p className="text-xs text-white mt-1">{formatDate(node.last_seen_at)}</p>
            <p className="text-[11px] text-gray-500">{node.last_seen_at ? relativeTime(node.last_seen_at) : 'never'}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Uptime</p>
            <p className="text-xs text-white mt-1">{formatUptime(node.uptime_secs)} · {node.uptime_pct != null ? `${Number(node.uptime_pct).toFixed(1)}%` : '—'}</p>
            <p className="text-[11px] text-gray-500">{node.status}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => navigate(`/nodes/${node.id}/edit`)} className="px-4 py-2 text-xs rounded-lg bg-white text-black hover:bg-gray-200">Edit node</button>
          <button onClick={back} className="px-4 py-2 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to nodes</button>
        </div>
      </GlassCard>
    </div>
  );
};

export default NodeDetail;
