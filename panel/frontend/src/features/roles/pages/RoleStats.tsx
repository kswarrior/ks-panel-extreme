import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRoles, listUsers } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';
import type { User } from '@/shared/types/user';
import {
  DonutStat,
  PieChart,
  DashboardSection,
  DashboardGrid,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

// Seeded roles the backend creates at first boot (no builtin column exists;
// see internal/api/handlers/admin_handler.go).
const BUILTIN_ROLE_NAMES: Set<string> = new Set(['admin', 'moderator', 'user']);

const RoleStats: React.FC = () => {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      const [rs, us] = await Promise.all([listRoles(), listUsers()]);
      setRoles(rs);
      setUsers(us);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = roles.length;
    const withPerms = roles.filter((r) => (r.permissions || []).length > 0).length;
    const withColor = roles.filter((r) => r.color && r.color.trim() !== '').length;
    const withIcon = roles.filter((r) => r.icon && r.icon.trim() !== '').length;
    // The backend Role model carries no builtin flag — the seeded roles are
    // identified by name (mirrors admin_handler.go's "admin/moderator/user"
    // switch), so derive the split here instead of reading a phantom field.
    const builtin = roles.filter((r) => BUILTIN_ROLE_NAMES.has(r.name)).length;
    const custom = total - builtin;
    const totalPerms = roles.reduce((sum, r) => sum + (r.permissions || []).length, 0);
    return { total, withPerms, withColor, withIcon, builtin, custom, totalPerms };
  }, [roles]);

  const permSlices = useMemo(() => [
    { label: 'With Permissions', value: stats.withPerms, color: '#34d399' },
    { label: 'No Permissions', value: stats.total - stats.withPerms, color: '#9ca3af' },
  ].filter((s) => s.value > 0), [stats]);

  const colorSlices = useMemo(() => [
    { label: 'With Color', value: stats.withColor, color: '#38bdf8' },
    { label: 'No Color', value: stats.total - stats.withColor, color: '#9ca3af' },
  ].filter((s) => s.value > 0), [stats]);

  const iconSlices = useMemo(() => [
    { label: 'With Icon', value: stats.withIcon, color: '#a78bfa' },
    { label: 'No Icon', value: stats.total - stats.withIcon, color: '#9ca3af' },
  ].filter((s) => s.value > 0), [stats]);

  const roleUserSlices = useMemo(() =>
    Object.entries(users.reduce((acc, u) => {
      const r = roles.find((role) => role.id === u.role_id)?.name || `#${u.role_id}`;
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
  [users, roles]);

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
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                className={`ks-tab inline-flex items-center justify-center transition-colors ${filterOpen ? 'is-open' : ''}`}
                style={PILL_TAB_STYLE}
                aria-label="Open filters"
                aria-expanded={filterOpen}
                aria-haspopup="true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-56">
                  <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Type</label>
                        <select className="w-full glass-field">
                          <option value="all">All roles</option>
                          <option value="builtin">Built-in</option>
                          <option value="custom">Custom</option>
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

      {/* Key Metrics Strip - removed Role Distribution and Key Metrics per requirements */}
      <DashboardGrid columns={4} className="mb-6">
        <StatCard
          label="Total Roles"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" /></svg>}
          color="text-white"
          dotColor="bg-white"
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

export default RoleStats;