// Nodes page - main component

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listNodes,
  createNode,
  updateNode,
  deleteNode,
  rotateNodeToken,
  purgeLocalNode,
  nodeHeartbeats,
  probeNode,
  probeAllNodes,
  getNodeUpdateInfo,
} from '@/shared/api/admin';
import type { Node, CreateNodeResult, NodeHeartbeat } from '@/shared/types/node';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import GlassCard from '@/shared/components/ui/Card';
import GlassModal from '@/shared/components/ui/Modal';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { useThemeStore } from '@/shared/stores/themeStore';
import { countryByCode } from '@/shared/components/forms/LocationField/countries';
import { HeartbeatIcon, DriverRing, ResourceBar } from '../components/NodesComponents';
import RollingUpdateModal from '../components/RollingUpdateModal';
import { NodeIcon } from '../utils/nodeIcons';
import { resolveState, isLocalAddress, formatBytes, formatBytesPair, formatPercent, withAlpha, buildMonitor, buildEdgeConfig } from '../utils/nodesUtils';
import type { StateStyle } from '../types/nodes';
import { STATE_STYLES, MONITOR_BARS } from '../types/nodes';
import { useConfirm } from '@/shared/stores/confirmStore';

const AdminNodes: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });
  const accent = useThemeStore((s) => s.active().accent);
  const tileTint = (key: 'success' | 'danger' | 'warning' | 'primary'): string => {
    const fallback: Record<string, string> = {
      success: '#34d399', danger: '#f87171', warning: '#fbbf24', primary: '#38bdf8',
    };
    const c = (accent as any)?.[key];
    return c || fallback[key];
  };
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hbMap, setHbMap] = useState<Record<number, NodeHeartbeat[]>>({});
  const [versionMap, setVersionMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Monotonic id so a slow/stale load() never overwrites a newer one, and
  // so the background version fetch doesn't touch an unmounted page.
  const loadSeq = useRef(0);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [purgingId, setPurgingId] = useState<number | null>(null);
  const [probingId, setProbingId] = useState<number | null>(null);
  const [probeNotes, setProbeNotes] = useState<Record<number, string>>({});
  const [tokenInfo, setTokenInfo] = useState<{
    token: string;
    title: string;
    configJson?: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | Node['state']>('all');
  const [tlsFilter, setTlsFilter] = useState<'all' | 'tls' | 'plain'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [rollingOpen, setRollingOpen] = useState(false);
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
    const seq = ++loadSeq.current;
    // Skeleton only on the very first paint (no cards yet). Every later
    // refresh (delete/purge/recheck/poll) keeps the cards visible and uses
    // the lightweight `refreshing` flag instead, so the grid never flashes.
    const firstPaint = seq === 1;
    if (firstPaint) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');
    let list: Node[] = [];
    try {
      // Single fast call (local DB read) — cards paint from this alone.
      // buildMonitor() falls back to n.status until per-node heartbeats
      // land, so there is no reason to hold the skeleton for the fan-out.
      list = await listNodes();
      if (loadSeq.current !== seq) return;
      setNodes(list);
    } catch (e: any) {
      if (loadSeq.current !== seq) return;
      setError(e?.response?.data || 'Failed to load nodes');
      list = [];
    } finally {
      if (loadSeq.current === seq) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    if (list.length === 0) return;
    // Background pass 1: per-node heartbeat strips. One HTTP request per
    // node, each doing a full GetNode + history scan behind SQLite
    // MaxOpenConns(1) — the slowest card used to gate the whole grid.
    // Now each strip pops in as its own request resolves.
    {
      const activeSeq = seq;
      void Promise.allSettled(
        list.map(async (n) => {
          try {
            const hbs = await nodeHeartbeats(n.id, MONITOR_BARS);
            if (loadSeq.current !== activeSeq) return;
            setHbMap((prev) => ({ ...prev, [n.id]: hbs }));
          } catch {
            // History is best-effort — the card keeps the n.status fallback.
          }
        }),
      );
    }
    // Background pass: live edge versions for the V badge (bottom-left of
    // each card). Never blocks the grid — each badge pops in as its probe
    // resolves. Old/offline edges 404 or time out — those cards simply show
    // no badge. Stale responses from an older load() are dropped via seq.
    if (list.length > 0) {
      const activeSeq = seq;
      void Promise.allSettled(
        list.map(async (n) => {
          try {
            const info = await getNodeUpdateInfo(n.id);
            if (loadSeq.current !== activeSeq) return;
            const v = info?.local?.version?.trim();
            if (v) setVersionMap((prev) => (prev[n.id] === v ? prev : { ...prev, [n.id]: v }));
          } catch {
            // Offline/old edge — leave the badge hidden for this card.
          }
        }),
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    navigate('/nodes/new');
  };

  const openEdit = (n: Node) => {
    navigate(`/nodes/${n.id}/edit`);
  };

  const remove = async (n: Node) => {
    if (!(await confirm({ title: 'Delete node', message: `Delete node "${n.name}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(n.id);
    try {
      await deleteNode(n.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete node');
    } finally {
      setDeletingId(null);
    }
  };

  const purge = async (n: Node) => {
    if (!(await confirm({ title: 'Remove local edge', message: `Completely remove local edge "${n.name}"?\n\nThis stops the running ksedge daemon, deletes its binary + config + logs, and removes the node from the panel. This cannot be undone.`, tone: 'danger', confirmLabel: 'Remove' }))) {
      return;
    }
    setPurgingId(n.id);
    try {
      const res = await purgeLocalNode(n.id);
      await load();
      if (!res.ok) {
        alert(res.message || 'Purge completed with warnings');
      } else if (res.log && res.log.length) {
        alert('Edge fully removed:\n\n' + res.log.join('\n'));
      }
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to purge local edge');
    } finally {
      setPurgingId(null);
    }
  };

  const rotate = async (n: Node) => {
    try {
      const res = await rotateNodeToken(n.id);
      setTokenInfo({
        token: res.token,
        title: 'Rotated node token (copy now)',
        configJson: buildEdgeConfig(n.name, n.address, n.use_tls, res.token, {
          connectionMode: n.connection_mode || 'direct',
          skipVerify: Boolean(n.skip_tls_verify),
          instancesDir: n.instances_dir || undefined,
        }),
      });
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to rotate token');
    }
  };

  const recheck = async (n: Node) => {
    setProbingId(n.id);
    try {
      const res = await probeNode(n.id);
      if (res.note) {
        setProbeNotes((p) => ({ ...p, [n.id]: res.note! }));
      } else if (res.reachable === 'yes') {
        setProbeNotes((p) => ({ ...p, [n.id]: '' }));
      } else {
        setProbeNotes((p) => ({ ...p, [n.id]: res.note || 'unreachable' }));
      }
      await load();
    } catch (e: any) {
      setProbeNotes((p) => ({ ...p, [n.id]: e?.response?.data || 'probe failed' }));
    } finally {
      setProbingId(null);
    }
  };

  const recheckAll = async () => {
    setProbingId(nodes[0]?.id || -1);
    try {
      await probeAllNodes();
      await load();
    } catch {
      // swallow
    } finally {
      setProbingId(null);
    }
  };

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = nodes;
    if (q) {
      out = out.filter((n) =>
        n.name.toLowerCase().includes(q) ||
        n.address.toLowerCase().includes(q) ||
        (n.category || '').toLowerCase().includes(q) ||
        (n.location_country || '').toLowerCase().includes(q) ||
        (n.location_node || '').toLowerCase().includes(q) ||
        (n.notes || '').toLowerCase().includes(q)
      );
    }
    if (stateFilter !== 'all') {
      out = out.filter((n) => resolveState(n) === stateFilter);
    }
    if (tlsFilter === 'tls') {
      out = out.filter((n) => n.use_tls);
    } else if (tlsFilter === 'plain') {
      out = out.filter((n) => !n.use_tls);
    }
    return out;
  }, [nodes, search, stateFilter, tlsFilter]);

  const resetFilters = () => { setSearch(''); setStateFilter('all'); setTlsFilter('all'); };



  const nodeStats = useMemo(() => {
    const byState: Record<string, number> = {};
    nodes.forEach((n) => {
      const s = resolveState(n);
      byState[s] = (byState[s] || 0) + 1;
    });
    return {
      total: nodes.length,
      up: byState.up || 0,
      down: byState.down || 0,
      pending: byState.pending || 0,
      partial: byState.partial || 0,
    };
  }, [nodes]);

  return (
    <div>
      {/* Fixed top-right pill — auto-hides with a right-to-left slide. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, address, category, country…"
            ariaLabel="Search nodes"
            buttonClassName="ks-tab inline-flex items-center justify-center"
            buttonStyle={PILL_TAB_STYLE}
          />
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
              style={PILL_TAB_STYLE}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {(stateFilter !== 'all' || tlsFilter !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
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
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">TLS</label>
                      <select
                        value={tlsFilter}
                        onChange={(e) => setTlsFilter(e.target.value as any)}
                        className="w-full glass-field"
                      >
                        <option value="all">All</option>
                        <option value="tls">TLS (HTTPS</option>
                        <option value="plain">Plain (HTTP</option>
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
          <Link
            to="/nodes/stats"
            aria-label="Node Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View node statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <button
            onClick={() => setRollingOpen(true)}
            aria-label="Fleet rolling update"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Fleet rolling update (check → apply → health-poll per node)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          </button>
          <Link
            to="/nodes/schedules"
            aria-label="Fleet update schedules"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Fleet update schedules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
          <button
            onClick={() => navigate('/nodes/new')}
            aria-label="Add Node"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Add Node"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
      </PageActionsPill>

      {error && <p className="text-red-400 mb-3">{error}</p>}

      {loading && <SkeletonGrid count={6} />}

      {!loading && refreshing && (
        <p className="text-[11px] text-gray-500 mb-2" aria-live="polite">Refreshing…</p>
      )}

      {!loading && filteredNodes.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" id="ks-nodes-grid" style={refreshing ? { opacity: 0.75 } : undefined}>
          {filteredNodes.map((n) => {
            const resolved = resolveState(n);
            const st = STATE_STYLES[resolved] || STATE_STYLES.down;
            const isProbing = probingId === n.id;
            const probeNote = probeNotes[n.id];
            const probeReachable = n.probe_reachable === true;
            const probeUnreachable = n.probe_reachable === false;
            const nameMismatch = !!n.probe_seen_name && n.probe_seen_name !== n.name;
            const upPct = n.uptime_pct || 0;
            const country = n.location_country ? countryByCode(n.location_country) : undefined;
            const isLts = (n as any).is_lts as boolean | undefined;
            const ramLabel = formatBytesPair(n.ram_used, n.ram_total);
            const diskLabel = formatBytesPair(n.disk_used, n.disk_total);
            const ramPct = n.ram_total > 0 ? (n.ram_used / n.ram_total) * 100 : 0;
            const cpuPct = Number.isFinite(n.cpu_percent) ? n.cpu_percent : 0;
            const diskPct = n.disk_total > 0 ? (n.disk_used / n.disk_total) * 100 : 0;
            const upColor = tileTint('success');
            const downColor = tileTint('danger');
            const warnColor = tileTint('warning');
            const isUp = resolved === 'up';
            const isDown = resolved === 'down';
            const monitor = buildMonitor(n, hbMap);
            const upCount = monitor.filter((s) => s === 'up').length;
            const upPctDisplay = (upCount / monitor.length) * 100;
            return (
            <article
              id={`ks-node-${n.id}`}
              key={n.id}
              className={`ks-card ks-list-card glass-card ${glassModifier} group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors`}
            >
              <CardMediaLayer />
              <div className="p-3 flex flex-col gap-3">
                <header className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300" aria-hidden="true">
                    {n.icon ? (
                      <span style={n.color ? { color: n.color } : undefined}>
                        <NodeIcon icon={n.icon} className="w-5 h-5" />
                      </span>
                    ) : (
                      <HeartbeatIcon state={resolved} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate leading-tight flex items-center gap-1.5" title={n.name}>
                      <span className="truncate">{n.name}</span>
                      {n.location_node && (
                        <span
                          className="text-[10px] text-gray-400 font-normal truncate max-w-[8rem]"
                          title={`Site label: ${n.location_node}`}
                        >
                          {`{${n.location_node}}`}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-gray-500 truncate font-mono mt-0.5">
                      <span className={n.use_tls ? 'text-emerald-400' : 'text-gray-500'}>{n.use_tls ? 'https' : 'http'}</span>
                      {'://'}{n.address}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {country && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.05] text-gray-200"
                          title={`${country.name} (${country.code})`}
                        >
                          <span className="leading-none">{country.flag}</span>
                          <span className="font-mono">{country.code}</span>
                        </span>
                      )}
                      {n.category && (
                        <span
                          className="inline-flex items-center text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-gray-300"
                          title={`Category: ${n.category}`}
                        >
                          {n.category}
                        </span>
                      )}
                      {isLts !== undefined && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-md border ${
                            isLts
                              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                              : 'bg-red-500/15 border-red-400/40 text-red-300'
                          }`}
                          title={isLts ? 'Long-term support release' : 'Non-LTS / rolling release'}
                        >
                          LTS
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0" title="Drivers: docker / kvm / multipass / lxd">
                    <DriverRing node={n} />
                  </div>
                </header>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-gray-300" title={`RAM: ${ramLabel}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><rect x="2" y="8" width="20" height="9" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /> </svg>
                    {formatPercent(ramPct)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-gray-300" title={`CPU: ${formatPercent(cpuPct)}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" rx="0.5" /><path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3" /> </svg>
                    {formatPercent(cpuPct)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-gray-300" title={`DISK: ${diskLabel}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" /><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /> </svg>
                    {formatPercent(diskPct)}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">Uptime 24h</span>
                  <div className="flex items-end gap-[2px] h-3 flex-1 min-w-0" aria-label="uptime monitor">
                    {monitor.map((s, i) => (
                      <div
                        key={i}
                        title={s === 'up' ? 'up' : 'down'}
                        className={`flex-1 rounded-[2px] transition-colors ${s === 'up' ? '' : 'bg-red-700/70'}`}
                        style={s === 'up' ? { height: '100%', background: `linear-gradient(to top, ${withAlpha(upColor, 0.7)}, ${upColor})` } : { height: '55%' }}
                      />
                    ))}
                  </div>
                  <span className={`font-semibold shrink-0 ${isUp ? '' : isDown ? 'text-red-300' : resolved === 'pending' ? 'text-sky-300' : 'text-amber-300'}`} style={isUp ? { color: upColor } : undefined}>
                    {upPctDisplay.toFixed(1)}%
                  </span>
                </div>

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {versionMap[n.id] && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300 font-mono shrink-0"
                        title={`Edge version: ${versionMap[n.id]}`}
                      >
                        V {versionMap[n.id]}
                      </span>
                    )}
                    {n.notes && (
                      <span className="text-[11px] text-gray-500 truncate flex-1 min-w-0" title={n.notes}>
                        {n.notes}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/node/${n.id}`)}
                    className="text-[11px] text-gray-400 hover:text-white transition-colors shrink-0"
                  >
                    View details →
                  </button>
                </footer>
              </div>
            </article>
            );
          })}
        </div>
      )}

      {!loading && filteredNodes.length === 0 && nodes.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No nodes match your filters.
          <div className="mt-2 flex justify-center">
            <button onClick={resetFilters} aria-label="Clear filters" className="ks-btn-icon ks-icon-btn" title="Clear filters">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
               </svg>
            </button>
          </div>
        </div>
      )}
      {!loading && nodes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-20 h-20 text-gray-400"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15" />
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="5" r="1.8" />
              <circle cx="20" cy="5" r="1.8" />
              <circle cx="4" cy="19" r="1.8" />
              <circle cx="20" cy="19" r="1.8" />
              <line x1="10.2" y1="10.2" x2="5.4" y2="6.4" opacity="0.6" />
              <line x1="13.8" y1="10.2" x2="18.6" y2="6.4" opacity="0.6" />
              <line x1="10.2" y1="13.8" x2="5.4" y2="17.6" opacity="0.6" />
              <line x1="13.8" y1="13.8" x2="18.6" y2="17.6" opacity="0.6" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No nodes yet</p>
          </div>
        </div>
      )}

      <GlassModal
        open={!!tokenInfo}
        onClose={() => setTokenInfo(null)}
        title={tokenInfo?.title || ''}
        maxWidth="max-w-xl"
      >
        <p className="text-sm text-gray-300">Copy this token now – it will not be shown again.</p>
        <div className="flex items-center gap-2 mt-2">
          <code className="flex-1 bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white break-all">
            {tokenInfo?.token}
          </code>
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(tokenInfo?.token || ''); } catch {}
            }}
            className="ks-primary-btn shrink-0 inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-2 rounded hover:bg-gray-200"
          >
            Copy
          </button>
        </div>
        {tokenInfo?.configJson && (
          <div className="mt-4">
            <p className="text-sm text-gray-300 mb-2">
              Place this <code className="text-white">config.json</code> next to the ksedge binary on the edge host and run{' '}
              <code className="text-white">./ksedge launch</code>. The token above is already wired in.
            </p>
            <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-64 overflow-y-auto">
{tokenInfo.configJson}
            </pre>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(tokenInfo.configJson || ''); } catch {}
                }}
                className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-1.5 rounded hover:bg-gray-200"
              >
                Copy config.json
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([tokenInfo.configJson || ''], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'config.json';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 border border-white/10 text-gray-300 text-sm px-3 py-1.5 rounded hover:bg-white/10 hover:text-white"
              >
                Download
              </button>
            </div>
          </div>
        )}
      </GlassModal>

      <RollingUpdateModal
        open={rollingOpen}
        onClose={() => { setRollingOpen(false); load(); }}
        nodes={nodes}
      />

    </div>
  );
};

export default AdminNodes;