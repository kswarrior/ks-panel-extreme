import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listNodes,
  nodeHeartbeats,
} from '@/shared/api/admin';
import type { Node, NodeHeartbeat } from '@/shared/types/node';
import {
  DonutStat,
  PieChart,
  AreaChartWidget,
  TimeSeriesChart,
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  GaugeWidget,
  StatCard,
  MetricSample,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';

const MONITOR_BARS = 40;

interface StateStyle {
  dot: string;
  label: string;
  color: string;
}

const STATE_STYLES: Record<string, StateStyle> = {
  up: { dot: 'bg-emerald-400', label: 'UP', color: '#34d399' },
  partial: { dot: 'bg-amber-400', label: 'PARTIAL', color: '#fbbf24' },
  pending: { dot: 'bg-sky-400', label: 'PENDING', color: '#38bdf8' },
  down: { dot: 'bg-red-400', label: 'DOWN', color: '#f87171' },
};

function resolveState(n: Node): string {
  if (n.state) return n.state;
  return n.status === 'up' ? 'up' : 'down';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 MB';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  const gb = bytes / 1024 ** 3;
  if (gb < 1024) return gb >= 10 ? `${gb.toFixed(1)}GB` : `${gb.toFixed(2)}GB`;
  const tb = gb / 1024;
  return tb >= 10 ? `${tb.toFixed(1)}TB` : `${tb.toFixed(2)}TB`;
}

function buildMonitor(n: Node, hbs: NodeHeartbeat[]): ('up' | 'down')[] {
  const out: ('up' | 'down')[] = [];
  for (let i = 0; i < MONITOR_BARS; i++) {
    if (i < hbs.length) {
      out.push(hbs[i].status === 'up' ? 'up' : 'down');
    } else {
      out.push(n.status === 'up' ? 'up' : 'down');
    }
  }
  return out;
}

function formatCpu(cpu: number): string {
  return `${cpu.toFixed(0)}%`;
}

interface BarData {
  label: string;
  value: number;
}

const BarChart: React.FC<{ data: BarData[]; title: string; color: string; height?: number }> = ({ data, title, color, height = 250 }) => {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
  const barWidth = useMemo(() => Math.max(30, Math.min(80, 400 / Math.max(data.length, 1))), [data.length]);

  return (
    <GlassCard className="p-4">
      <h4 className="text-sm font-semibold text-white mb-3">{title}</h4>
      <div className="flex items-end justify-center gap-2 h-[250px] px-4">
        {data.map((item, i) => (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className="w-full transition-all duration-300 bg-gradient-to-t"
              style={{
                background: `linear-gradient(to top, ${color}, ${color}dd)`,
                height: `${(item.value / maxValue) * 100}%`,
                minHeight: item.value > 0 ? '4px' : '0',
                borderRadius: '4px 4px 0 0',
                width: barWidth,
              }}
              title={`${item.label}: ${item.value}`}
            />
            <span className="text-[10px] text-gray-400 mt-2 text-center truncate w-[calc(100%+16px)]" style={{ maxWidth: barWidth + 16 }}>{item.label}</span>
            <span className="text-[10px] font-mono font-semibold text-white mt-1">{item.value}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

const NodeStats: React.FC = () => {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hbMap, setHbMap] = useState<Record<number, NodeHeartbeat[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [graphTab, setGraphTab] = useState<'location' | 'category'>('location');
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as HTMLElement)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ns = await listNodes();
      setNodes(ns);
      const results = await Promise.allSettled(
        ns.map((n) => nodeHeartbeats(n.id, MONITOR_BARS)),
      );
      const next: Record<number, NodeHeartbeat[]> = {};
      ns.forEach((n, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') next[n.id] = r.value;
      });
      setHbMap(next);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = nodes;
    if (q) {
      out = out.filter((n) =>
        n.name.toLowerCase().includes(q) ||
        n.address.toLowerCase().includes(q) ||
        (n.category || '').toLowerCase().includes(q) ||
        (n.location_country || '').toLowerCase().includes(q) ||
        (n.location_node || '').toLowerCase().includes(q)
      );
    }
    if (stateFilter !== 'all') {
      out = out.filter((n) => resolveState(n) === stateFilter);
    }
    return out;
  }, [nodes, search, stateFilter]);

  const nodeStats = useMemo(() => {
    const byState: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    let totalCpu = 0;
    let totalMem = 0;
    let totalDisk = 0;
    let nodesWithCpu = 0;
    let nodesWithMem = 0;
    let nodesWithDisk = 0;

    filteredNodes.forEach((n) => {
      const s = resolveState(n);
      byState[s] = (byState[s] || 0) + 1;

      if (n.category) byCategory[n.category] = (byCategory[n.category] || 0) + 1;
      
      const location = n.location_node || n.location_country || 'Unknown';
      if (location) byLocation[location] = (byLocation[location] || 0) + 1;

      if (n.cpu_percent != null && Number.isFinite(n.cpu_percent)) {
        totalCpu += n.cpu_percent;
        nodesWithCpu++;
      }
      if (n.ram_total > 0 && n.ram_used >= 0) {
        totalMem += (n.ram_used / n.ram_total) * 100;
        nodesWithMem++;
      }
      if (n.disk_total > 0 && n.disk_used >= 0) {
        totalDisk += (n.disk_used / n.disk_total) * 100;
        nodesWithDisk++;
      }
    });

    return {
      total: filteredNodes.length,
      up: byState.up || 0,
      down: byState.down || 0,
      pending: byState.pending || 0,
      partial: byState.partial || 0,
      byCategory,
      byLocation,
      avgCpu: nodesWithCpu > 0 ? totalCpu / nodesWithCpu : 0,
      avgMem: nodesWithMem > 0 ? totalMem / nodesWithMem : 0,
      avgDisk: nodesWithDisk > 0 ? totalDisk / nodesWithDisk : 0,
      totalRam: filteredNodes.reduce((sum, n) => sum + (n.ram_total || 0), 0),
      totalDisk: filteredNodes.reduce((sum, n) => sum + (n.disk_total || 0), 0),
      usedRam: filteredNodes.reduce((sum, n) => sum + (n.ram_used || 0), 0),
      usedDisk: filteredNodes.reduce((sum, n) => sum + (n.disk_used || 0), 0),
    };
  }, [filteredNodes]);

  const stateSlices = useMemo(() => [
    { label: 'Up', value: nodeStats.up, color: '#34d399' },
    { label: 'Partial', value: nodeStats.partial, color: '#fbbf24' },
    { label: 'Pending', value: nodeStats.pending, color: '#38bdf8' },
    { label: 'Down', value: nodeStats.down, color: '#f87171' },
  ].filter(s => s.value > 0), [nodeStats]);

  const categorySlices = useMemo(() =>
    Object.entries(nodeStats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label,
        value,
        color: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      })),
  [nodeStats.byCategory]);

  const locationSlices = useMemo(() =>
    Object.entries(nodeStats.byLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value], i) => ({
        label,
        value,
        color: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc', '#60a5fa', '#f472b6'][i % 10],
      })),
  [nodeStats.byLocation]);

  const driverSlices = useMemo(() => {
    const drivers = { docker: 0, kvm: 0, multipass: 0, lxd: 0 };
    filteredNodes.forEach((n) => {
      if (n.driver_docker) drivers.docker++;
      if (n.driver_kvm) drivers.kvm++;
      if (n.driver_multipass) drivers.multipass++;
      if (n.driver_lxd) drivers.lxd++;
    });
    return [
      { label: 'Docker', value: drivers.docker, color: '#60a5fa' },
      { label: 'KVM', value: drivers.kvm, color: '#34d399' },
      { label: 'Multipass', value: drivers.multipass, color: '#fbbf24' },
      { label: 'LXD', value: drivers.lxd, color: '#f472b6' },
    ].filter(s => s.value > 0);
  }, [filteredNodes]);

  const locationBarData = useMemo(() => {
    if (graphTab === 'location') {
      return Object.entries(nodeStats.byLocation)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([label, value]) => ({ label, value }));
    } else {
      return Object.entries(nodeStats.byCategory)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([label, value]) => ({ label, value }));
    }
  }, [nodeStats.byLocation, nodeStats.byCategory, graphTab]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-white/5 rounded" />)}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderWithAction
        title="Node Statistics"
        backHref="/nodes"
        backLabel="Nodes"
        action={
          <div className="flex items-center gap-2">
            <SearchDropdown
              value={search}
              onChange={setSearch}
              placeholder="Search nodes..."
              ariaLabel="Search nodes"
              className="w-64"
            />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="glass-field text-sm px-3 py-1.5 bg-white/[0.03] border-white/10"
              aria-label="Time range"
            >
              <option value="1h">Last hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
                aria-label="Open filters"
                aria-expanded={filterOpen}
                aria-haspopup="true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {(stateFilter !== 'all') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                )}
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-64">
                  <div className="ks-dropdown min-w-[220px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">State</label>
                        <select
                          value={stateFilter}
                          onChange={(e) => setStateFilter(e.target.value as any)}
                          className="w-full glass-field"
                        >
                          <option value="all">All states</option>
                          <option value="up">Up</option>
                          <option value="down">Down</option>
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                        </select>
                      </div>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setFilterOpen(false)}
                          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />
      {/* Key Metrics Strip */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Nodes"
          value={nodeStats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="2" y="3" width="20" height="6" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="17" x2="6.01" y2="17" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Healthy"
          value={nodeStats.up}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Partial"
          value={nodeStats.partial}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="text-amber-300"
          dotColor="bg-amber-400"
        />
        <StatCard
          label="Pending"
          value={nodeStats.pending}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
        />
      </div>

      {/* Cluster Resources - Total RAM, CPU, Disk of all nodes */}
      <DashboardSection title="Cluster Resources" className="space-y-4">
        <DashboardGrid columns={4}>
          <StatCard
            label="Total RAM"
            value={formatBytes(nodeStats.totalRam)}
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="2" y="8" width="20" height="9" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /></svg>}
            color="text-emerald-300"
            dotColor="bg-emerald-400"
            subLabel={`Used: ${formatBytes(nodeStats.usedRam)}`}
          />
          <StatCard
            label="CPU Usage"
            value={`${nodeStats.avgCpu.toFixed(1)}%`}
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v4M12 16v4M4 12h4M16 12h4" /></svg>}
            color="text-sky-300"
            dotColor="bg-sky-400"
            subLabel={`${filteredNodes.length} node(s) reporting`}
          />
          <StatCard
            label="Total Disk"
            value={formatBytes(nodeStats.totalDisk)}
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12a8 3 0 0 0 16 0V6" /></svg>}
            color="text-amber-300"
            dotColor="bg-amber-400"
            subLabel={`Used: ${formatBytes(nodeStats.usedDisk)}`}
          />
          <StatCard
            label="Avg Memory"
            value={`${nodeStats.avgMem.toFixed(1)}%`}
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M6 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2" /><rect x="6" y="4" width="12" height="4" rx="1" /></svg>}
            color="text-violet-300"
            dotColor="bg-violet-400"
            subLabel={`${nodeStats.total} nodes`}
          />
        </DashboardGrid>
      </DashboardSection>

      {/* Location / Category Bar Graph with Tabs */}
      <DashboardSection title="Node Distribution" className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-white">{graphTab === 'location' ? 'Nodes by Location' : 'Nodes by Category'}</h4>
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setGraphTab('location')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                graphTab === 'location' 
                  ? 'bg-sky-500/20 text-sky-300' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Location
            </button>
            <button
              onClick={() => setGraphTab('category')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                graphTab === 'category' 
                  ? 'bg-sky-500/20 text-sky-300' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Category
            </button>
          </div>
        </div>
        <BarChart 
          data={locationBarData} 
          title={graphTab === 'location' ? 'Nodes by Location' : 'Nodes by Category'} 
          color={graphTab === 'location' ? '#38bdf8' : '#a78bfa'} 
        />
      </DashboardSection>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default NodeStats;