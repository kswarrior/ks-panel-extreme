import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listAdminApiKeys, listUsers, listRoles } from '@/shared/api/admin';
import type { ApiKey } from '@/shared/types/apiKey';
import type { User, Role } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import GlassField from '@/shared/components/ui/Field';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';

const ApiKeyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [key, setKey] = useState<ApiKey | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const [keys, us, rs] = await Promise.all([listAdminApiKeys(), listUsers(), listRoles()]);
        const k = keys.find((x) => x.id === Number(id)) || null;
        setKey(k);
        setUsers(us);
        setRoles(rs);
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load API key');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const back = () => navigate('/api-keys');

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  }
  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  if (!key) {
    return <p className="text-gray-400">API key not found</p>;
  }

  const owner = key.owner_name || (() => {
    const u = users.find((usr) => usr.id === key.user_id);
    return u ? u.username : `#${key.user_id}`;
  })();

  const expireDate = key.expires_at ? new Date(key.expires_at) : null;
  const isExpired = expireDate && !isNaN(expireDate.getTime()) && expireDate.getTime() < Date.now();
  const expiryDefaultMs = 30 * 24 * 60 * 60 * 1000;
  const expiryRemainingMs = expireDate ? Math.max(0, expireDate.getTime() - Date.now()) : expiryDefaultMs;
  const expiryPct = Math.min(100, (expiryRemainingMs / expiryDefaultMs) * 100);

  const rateLimit = key.rate_limit ?? 0;
  const rateWindow = key.rate_window_seconds ?? 60;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-900/20 border border-amber-700/40 text-amber-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-white">API Key Detail</h2>
          <p className="text-sm text-gray-400">Key: {key.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-400">Created</h4>
          <p className="mt-1 text-sm text-white">{new Date(key.created_at).toLocaleDateString()}</p>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-400">Owner</h4>
          <p className="mt-1 text-sm text-white">{owner}</p>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-400">Last used</h4>
          {key.last_used_at ? (
            <p className="mt-1 text-sm text-white">{new Date(key.last_used_at).toLocaleDateString()}</p>
          ) : (
            <p className="mt-1 text-sm text-gray-400">—</p>
          )}
        </GlassCard>
      </div>

      <div className="mb-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Expiry</h4>
        {key.expires_at ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">
              {isExpired ? 'Expired' : `Expires ${expireDate!.toLocaleDateString()}`}
            </span>
            <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full transition-colors duration-700"
                style={{
                  width: `${expiryPct}%`,
                  background: isExpired ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)',
                }}
              />
            </div>
            <span className="text-xs text-gray-400 ml-2">{isExpired ? '0%' : `${expiryPct.toFixed(0)}% remaining`}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">No expiry</span>
        )}
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Request limit</h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">{rateLimit} req / {rateWindow}s</span>
          <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-colors duration-700"
              style={{ width: '100%', background: 'rgba(34,197,94,0.5)' }}
            />
          </div>
          <span className="text-xs text-gray-400">Unlimited visual indicator</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {key.rate_limit && key.rate_limit > 0 ? (
          <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-sky-900/40 border-sky-700/40 text-sky-200`}>
            {key.rate_limit} req / {rateWindow}s
          </span>
        ) : (
          <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/40 border-emerald-700/40 text-emerald-200`}>
            Unlimited
          </span>
        )}
        {key.expires_at ? (
          <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${isExpired ? 'bg-red-900/50 border-red-700/40 text-red-300' : 'bg-amber-900/40 border-amber-700/40 text-amber-200'}`}>
            {isExpired ? 'Expired' : `Expires ${expireDate!.toLocaleDateString()}`}
          </span>
        ) : (
          <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/40 border-emerald-700/40 text-emerald-200`}>
            No expiry
          </span>
        )}
      </div>

      <footer className="mt-4 border-t pt-2 flex items-center gap-2">
        <CardMenu
          ariaLabel={`Actions for API key ${key.name}`}
          items={[
            { key: 'edit', label: 'Edit', tone: 'default' },
            { key: 'delete', label: 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/api-keys/${key.id}/edit`);
            if (k === 'delete') {
              if (confirm(`Delete API key "${key.name}"?`)) {
                // deletion handled elsewhere
              }
            }
          }}
        />
      </footer>
    </div>
  );
};
export default ApiKeyDetail;