import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listRoles, listUsers } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';
import type { User } from '@/shared/types/user';
import {
  PieChart,
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';

// Seeded roles the backend creates at first boot (no builtin column exists;
// see internal/api/handlers/admin_handler.go).
const BUILTIN_ROLE_NAMES: Set<string> = new Set(['admin', 'moderator', 'user']);

const RoleStats: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      <HeaderWithAction
        title="Role Statistics"
        backHref="/roles"
        backLabel="Roles"
      />

      <DashboardGrid columns={4} className="mb-6">
        <StatCard
          label="Total Roles"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Built-in"
          value={stats.builtin}
          subLabel={`${stats.custom} custom`}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="With Permissions"
          value={stats.withPerms}
          subLabel={`${stats.total - stats.withPerms} without`}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
        />
        <StatCard
          label="Avg Permissions"
          value={stats.total ? (stats.totalPerms / stats.total).toFixed(1) : '0'}
          subLabel={`${stats.totalPerms} total`}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
          color="text-violet-300"
          dotColor="bg-violet-400"
        />
      </DashboardGrid>

      <DashboardSection title="Distribution">
        <DashboardGrid columns={3}>
          {permSlices.length > 0 && <PieChart slices={permSlices} title="Permissions" centerLabel={`${stats.withPerms}/${stats.total}`} />}
          {colorSlices.length > 0 && <PieChart slices={colorSlices} title="Accent Color" centerLabel={`${stats.withColor}/${stats.total}`} />}
          {iconSlices.length > 0 && <PieChart slices={iconSlices} title="Icon" centerLabel={`${stats.withIcon}/${stats.total}`} />}
        </DashboardGrid>
      </DashboardSection>

      {roleUserSlices.length > 0 && (
        <DashboardSection title="Users per Role">
          <PieChart slices={roleUserSlices} title="Role Membership" centerLabel={`${users.length} users`} />
        </DashboardSection>
      )}

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default RoleStats;