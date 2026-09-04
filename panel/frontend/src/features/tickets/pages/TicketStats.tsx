import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketStats } from '../api/tickets';
import type { TicketStats } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { useThemeStore } from '@/shared/stores/themeStore';

const StatTile: React.FC<{ label: string; value: number; sub?: string; color: string }> = ({ label, value, sub, color }) => (
  <div className="glass-card rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden">
    <CardMediaLayer />
    <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-2xl font-semibold text-white" style={{ color: value ? color : undefined }}>{value}</span>
    {sub && <span className="text-xs text-gray-500">{sub}</span>}
  </div>
);

const TicketStatsPage: React.FC = () => {
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  useEffect(() => {
    (async () => {
      try {
        const s = await ticketStats();
        setStats(s);
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tiles = useMemo(() => {
    if (!stats) return [];
    const total = stats.total || 1;
    const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';
    const all: { key: string; label: string; value: number; sub: string; color: string }[] = [
      { key: 'total', label: 'Total', value: stats.total, sub: 'all tickets', color: '#e5e7eb' },
      { key: 'open', label: 'Open', value: stats.open, sub: pct(stats.open), color: '#38bdf8' },
      { key: 'pending', label: 'Pending', value: stats.pending, sub: pct(stats.pending), color: '#fbbf24' },
      { key: 'in_progress', label: 'In Progress', value: stats.in_progress, sub: pct(stats.in_progress), color: '#a78bfa' },
      { key: 'resolved', label: 'Resolved', value: stats.resolved, sub: pct(stats.resolved), color: '#34d399' },
      { key: 'closed', label: 'Closed', value: stats.closed, sub: pct(stats.closed), color: '#9ca3af' },
      { key: 'unassigned', label: 'Unassigned', value: stats.unassigned, sub: 'needs triage', color: '#f97316' },
      { key: 'mine', label: 'Mine', value: stats.mine, sub: 'created / assigned', color: '#f472b6' },
    ];
    const q = search.trim().toLowerCase();
    let out = all;
    if (q) out = out.filter((t) => t.label.toLowerCase().includes(q));
    if (statusFilter !== 'all') out = out.filter((t) => t.key === statusFilter || t.key === 'total');
    return out;
  }, [stats, search, statusFilter]);

  const breakdown = useMemo(() => {
    if (!stats) return [];
    const rows = [
      { key: 'open', label: 'Open', value: stats.open, color: '#38bdf8' },
      { key: 'pending', label: 'Pending', value: stats.pending, color: '#fbbf24' },
      { key: 'in_progress', label: 'In Progress', value: stats.in_progress, color: '#a78bfa' },
      { key: 'resolved', label: 'Resolved', value: stats.resolved, color: '#34d399' },
      { key: 'closed', label: 'Closed', value: stats.closed, color: '#9ca3af' },
    ];
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => r.label.toLowerCase().includes(q));
    if (statusFilter !== 'all') out = out.filter((r) => r.key === statusFilter);
    return out;
  }, [stats, search, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/5 rounded" />)}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }
  if (error) return <div className="p-8 text-red-400">{error}</div>;
  if (!stats) return <div className="p-8 text-gray-400">No stats.</div>;

  const total = stats.total || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';

  return (
    <div className="space-y-5">
      {/* Fixed top-right pill — "Statistics" title lives in the app header. */}
      <PageActionsPill>
        <SearchDropdown
          value={search}
          onChange={setSearch}
          placeholder="Search tickets..."
          ariaLabel="Search ticket stats"
          buttonClassName="ks-tab inline-flex items-center justify-center"
          buttonStyle={PILL_TAB_STYLE}
        />
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="ks-tab"
          style={PILL_TAB_STYLE}
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
            className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
            style={PILL_TAB_STYLE}
            aria-label="Open filters"
            aria-expanded={filterOpen}
            aria-haspopup="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {(statusFilter !== 'all' || search.trim() !== '') && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56">
              <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="w-full glass-field"
                    >
                      <option value="all">All · {stats.total}</option>
                      <option value="open">Open · {stats.open}</option>
                      <option value="pending">Pending · {stats.pending}</option>
                      <option value="in_progress">In Progress · {stats.in_progress}</option>
                      <option value="resolved">Resolved · {stats.resolved}</option>
                      <option value="closed">Closed · {stats.closed}</option>
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
      </PageActionsPill>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} color={t.color} />
        ))}
        <StatTile label="SLA compliance" value={Math.round(stats.sla_pct ?? 100)} sub={`${stats.breached ?? 0} breached`} color="#34d399" />
        <StatTile label="Breached" value={stats.breached ?? 0} sub="past due • open" color="#ef4444" />
      </div>

      <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
        <CardMediaLayer />
        <h3 className="text-sm font-semibold text-white mb-3">Breakdown</h3>
        <div className="space-y-2">
          {breakdown.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-24">{r.label}</span>
              <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: pct(r.value), background: r.color }} />
              </div>
              <span className="text-xs font-mono text-gray-300 w-12 text-right">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/tickets?status=open" className="text-xs px-3 py-1 rounded-full bg-white text-black hover:bg-gray-200">View open</Link>
          <Link to="/tickets?status=pending" className="text-xs px-3 py-1 rounded-full border border-white/10 text-gray-300 hover:bg-white/10">Pending</Link>
          <Link to="/tickets?status=in_progress" className="text-xs px-3 py-1 rounded-full border border-white/10 text-gray-300 hover:bg-white/10">In progress</Link>
          <Link to="/tickets" className="text-xs px-3 py-1 rounded-full border border-white/10 text-gray-300 hover:bg-white/10">All tickets</Link>
        </div>
      </GlassCard>
    </div>
  );
};

export default TicketStatsPage;
