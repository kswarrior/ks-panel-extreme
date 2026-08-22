import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listAdminApiKeys,
  listUsers,
} from '@/shared/api/admin';
import type { ApiKey } from '@/shared/types/apiKey';
import type { User } from '@/shared/types/user';
import {
  DonutStat,
  PieChart,
  DashboardSection,
  DashboardGrid,
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';

const ApiKeyStats: React.FC = () => {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
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
      const [ks, us] = await Promise.all([listAdminApiKeys(), listUsers()]);
      setKeys(ks);
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

  const userName = (id: number) => users.find((u) => u.id === id)?.username || `#${id}`;

  const stats = useMemo(() => {
    const active = keys.filter((k) => k.active).length;
    const expired = keys.filter((k) => k.expires_at && new Date(k.expires_at) < new Date()).length;
    const withRateLimit = keys.filter((k) => k.rate_limit && k.rate_limit > 0).length;
    const withExpiry = keys.filter((k) => k.expires_at).length;
    return { total: keys.length, active, inactive: keys.length - active, expired, withRateLimit, withExpiry };
  }, [keys]);

  const keySlices = useMemo(() => [
    { label: 'Active', value: stats.active, color: '#34d399' },
    { label: 'Inactive', value: stats.inactive, color: '#9ca3af' },
    { label: 'Expired', value: stats.expired, color: '#f87171' },
  ].filter((s) => s.value > 0), [stats]);

  const rateLimitSlices = useMemo(() => [
    { label: 'With Rate Limit', value: stats.withRateLimit, color: '#38bdf8' },
    { label: 'Unlimited', value: stats.total - stats.withRateLimit, color: '#9ca3af' },
  ].filter((s) => s.value > 0), [stats]);

  const expirySlices = useMemo(() => [
    { label: 'With Expiry', value: stats.withExpiry, color: '#fbbf24' },
    { label: 'No Expiry', value: stats.total - stats.withExpiry, color: '#34d399' },
  ].filter((s) => s.value > 0), [stats]);

  const topKeysByUsage = useMemo(() =>
    [...keys]
      .filter((k) => k.last_used_at)
      .sort((a, b) => new Date(b.last_used_at!).getTime() - new Date(a.last_used_at!).getTime())
      .slice(0, 10),
  [keys]);

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
        title="API Key Statistics"
        backHref="/api-keys"
        backLabel="API Keys"
        action={
          <div className="flex items-center gap-2">
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
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-56">
                  <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                        <select className="w-full glass-field">
                          <option value="all">All keys</option>
                          <option value="active">Active · {stats.active}</option>
                          <option value="inactive">Inactive · {stats.inactive}</option>
                          <option value="expired">Expired · {stats.expired}</option>
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

      {/* Key Metrics Strip - removed Key Distribution and Key Metrics per requirements */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Keys"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Active Keys"
          value={stats.active}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Expired Keys"
          value={stats.expired}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /><path d="M12 6v6l-4-4" /></svg>}
          color="text-red-300"
          dotColor="bg-red-400"
        />
        <StatCard
          label="With Rate Limit"
          value={stats.withRateLimit}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /><path d="M12 18a6 6 0 0 0 0-12v12" /></svg>}
          color="text-amber-300"
          dotColor="bg-amber-400"
        />
      </div>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default ApiKeyStats;