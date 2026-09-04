import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketStats } from '../api/tickets';
import type { TicketStats } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
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
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

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

  if (loading) return <div className="p-8 text-gray-400">Loading stats…</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;
  if (!stats) return <div className="p-8 text-gray-400">No stats.</div>;

  const total = stats.total || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%';

  return (
    <div className="space-y-5">
      {/* "Statistics" title lives in the app header ("Tickets / Statistics",
          parent crumb covers back-nav) — no in-page title row. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Total" value={stats.total} sub="all tickets" color="#e5e7eb" />
        <StatTile label="Open" value={stats.open} sub={pct(stats.open)} color="#38bdf8" />
        <StatTile label="Pending" value={stats.pending} sub={pct(stats.pending)} color="#fbbf24" />
        <StatTile label="In Progress" value={stats.in_progress} sub={pct(stats.in_progress)} color="#a78bfa" />
        <StatTile label="Resolved" value={stats.resolved} sub={pct(stats.resolved)} color="#34d399" />
        <StatTile label="Closed" value={stats.closed} sub={pct(stats.closed)} color="#9ca3af" />
        <StatTile label="Unassigned" value={stats.unassigned} sub="needs triage" color="#f97316" />
        <StatTile label="Mine" value={stats.mine} sub="created / assigned" color="#f472b6" />
        <StatTile label="SLA compliance" value={Math.round(stats.sla_pct ?? 100)} sub={`${stats.breached ?? 0} breached`} color="#34d399" />
        <StatTile label="Breached" value={stats.breached ?? 0} sub="past due • open" color="#ef4444" />
      </div>

      <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
        <CardMediaLayer />
        <h3 className="text-sm font-semibold text-white mb-3">Breakdown</h3>
        <div className="space-y-2">
          {[
            { label: 'Open', value: stats.open, color: '#38bdf8' },
            { label: 'Pending', value: stats.pending, color: '#fbbf24' },
            { label: 'In Progress', value: stats.in_progress, color: '#a78bfa' },
            { label: 'Resolved', value: stats.resolved, color: '#34d399' },
            { label: 'Closed', value: stats.closed, color: '#9ca3af' },
          ].map((r) => (
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
