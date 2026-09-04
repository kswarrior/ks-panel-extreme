import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listUsers, listRoles } from '@/shared/api/admin';
import type { User, Role } from '@/shared/types/user';
import {
  DonutStat,
  PieChart,
  DashboardSection,
  DashboardGrid,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

const UserStats: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [us, rs] = await Promise.all([listUsers(), listRoles()]);
      setUsers(us);
      setRoles(rs);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const roleName = (id: number) => roles.find((r) => r.id === id)?.name || `#${id}`;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = users;
    if (q) {
      out = out.filter((u) =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.display_name || '').toLowerCase().includes(q) ||
        roleName(u.role_id).toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'active') out = out.filter((u) => !u.suspended);
    if (statusFilter === 'suspended') out = out.filter((u) => !!u.suspended);
    return out;
  }, [users, search, statusFilter, roles]);

  const stats = useMemo(() => {
    const total = filteredUsers.length;
    const suspended = filteredUsers.filter((u) => u.suspended).length;
    const active = total - suspended;
    const withHistory = filteredUsers.filter((u) => (u.suspension_count || 0) > 0).length;
    const withAvatar = filteredUsers.filter((u) => u.has_avatar).length;
    const withBanner = filteredUsers.filter((u) => u.has_banner).length;
    return { total, active, suspended, withHistory, withAvatar, withBanner };
  }, [filteredUsers]);

  const statusSlices = useMemo(() => [
    { label: 'Active', value: stats.active, color: '#34d399' },
    { label: 'Suspended', value: stats.suspended, color: '#f87171' },
  ].filter((s) => s.value > 0), [stats]);

  const roleSlices = useMemo(() =>
    Object.entries(filteredUsers.reduce((acc, u) => {
      const r = roleName(u.role_id);
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {} as Record<string, number>))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        label,
        value,
        color: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#22d3ee', '#c084fc'][i % 8],
      })),
  [filteredUsers]);

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

  return (
    <div className="space-y-6">
      {/* Fixed top-right pill — "Statistics" title lives in the app header. */}
      <PageActionsPill>
            <SearchDropdown
              value={search}
              onChange={setSearch}
              placeholder="Search users..."
              ariaLabel="Search users"
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
                          <option value="all">All · {users.length}</option>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
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

      {/* Key Metrics Strip - User Status Distribution and Key Metrics removed per requirements */}
      <DashboardGrid columns={4} className="mb-6">
        <StatCard
          label="Total Users"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Active Users"
          value={stats.active}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Suspended Users"
          value={stats.suspended}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
          color="text-red-300"
          dotColor="bg-red-400"
        />
      </DashboardGrid>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default UserStats;