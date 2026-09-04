import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listAdminApiKeys,
  deleteAdminApiKey,
  updateAdminApiKey,
  listUsers,
  listPermissions,
} from '@/shared/api/admin';
import type { ApiKey } from '@/shared/types/apiKey';
import type { User, Permission } from '@/shared/types/user';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

// Form shape (kept for consistency, not used in this list view)
type Form = {
  name: string;
  user_id: number;
  permissions: string[];
};

const emptyForm: Form = { name: '', user_id: 0, permissions: [] };

const AdminApiKeys: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // The card 3-dot menu's "Permissions…" submenu reads from
  // `localPermState`. We seed it lazily from `k.permissions` so the
  // initial render reflects the server's snapshot, then let the user
  // toggle individual grants live; in a real wiring these flips
  // would PATCH /api/api-keys/:id.
  const [localPermState, setLocalPermState] = useState<
     Record<number, Record<string, boolean>>
   >({});
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  // Toggle a key's active state via the admin API.
  const toggleActive = async (k: ApiKey, nextActive: boolean) => {
    try {
      await updateAdminApiKey(k.id, {
        name: k.name,
        permissions: k.permissions,
        active: nextActive,
        active_set: true,
      });
      // Optimistically update local state so the UI stays snappy.
      setKeys((prev) => prev.map((key) => (key.id === k.id ? { ...key, active: nextActive } : key)));
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to update key';
      alert(typeof msg === 'string' ? msg : 'Failed to update key');
      // Revert on error — the user will see the original state.
    }
  };

  const formatError = (reason: any): string => {
    const data = reason?.response?.data;
    if (typeof data === 'string' && data.length > 0) return data;
    if (data && typeof data === 'object') return JSON.stringify(data);
    return reason?.message || 'unknown error';
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [keysResult, usersResult, permsResult] = await Promise.allSettled([
      listAdminApiKeys(),
      listUsers(),
      listPermissions(),
    ]);

    const errors: string[] = [];
    if (keysResult.status === 'fulfilled') {
      setKeys(keysResult.value);
    } else {
      errors.push(`keys: ${formatError(keysResult.reason)}`);
    }
    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value);
    } else {
      errors.push(`users: ${formatError(usersResult.reason)}`);
    }
    if (permsResult.status === 'fulfilled') {
      setPermissions(permsResult.value);
    } else {
      errors.push(`permissions: ${formatError(permsResult.reason)}`);
    }

    if (errors.length > 0) setError(errors.join(' · '));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const userName = (id: number) =>
    users.find((u) => u.id === id)?.username || `#${id}`;

  // badgeFor returns a small pill describing the key's configured limits, or
  // null when nothing was set (the historical "no expiry / no limit" case).
  const badgeFor = (k: ApiKey) => {
    const badges: { text: string; cls: string }[] = [];
    if (k.expires_at) {
      const exp = new Date(k.expires_at);
      const expired = !isNaN(exp.getTime()) && exp.getTime() < Date.now();
      const label = expired
        ? `Expired ${exp.toLocaleDateString()}`
        : `Expires ${exp.toLocaleDateString()}`;
      badges.push({
        text: label,
        cls: expired
          ? 'bg-red-900/50 border-red-700/40 text-red-300'
          : 'bg-amber-900/40 border-amber-700/40 text-amber-200',
      });
    } else {
      badges.push({ text: 'No expiry', cls: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200' });
    }
    if (k.rate_limit !== undefined && k.rate_limit !== null && k.rate_limit > 0) {
      const win = k.rate_window_seconds && k.rate_window_seconds > 0 ? k.rate_window_seconds : 60;
      badges.push({ text: `${k.rate_limit} req / ${win}s`, cls: 'bg-sky-900/40 border-sky-700/40 text-sky-200' });
    } else {
      badges.push({ text: 'Unlimited', cls: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200' });
    }
    return badges;
  };

  const openCreate = () => {
    navigate('/api-keys/new');
  };

  const openEdit = (k: ApiKey) => {
    navigate(`/api-keys/${k.id}/edit`);
  };

  const remove = async (k: ApiKey) => {
    if (!(await confirm({ title: 'Delete API key', message: `Delete API key "${k.name}"? This revokes it immediately.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(k.id);
    try {
      await deleteAdminApiKey(k.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete API key');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k: ApiKey) =>
      k.name.toLowerCase().includes(q) ||
      (k.display_name || '').toLowerCase().includes(q) ||
      k.prefix.toLowerCase().includes(q) ||
      k.owner_name?.toLowerCase().includes(q)
    );
  }, [keys, search]);

  const keyStats = useMemo(() => {
    const active = keys.filter((k) => k.active).length;
    const expired = keys.filter((k) => k.expires_at && new Date(k.expires_at) < new Date()).length;
    return { total: keys.length, active, inactive: keys.length - active, expired };
  }, [keys]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">API Keys</h2>
        <div className="flex items-center gap-2">
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, prefix, owner…"
            ariaLabel="Search API keys"
          />
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {filterOpen && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>

            {/* Filter Dropdown Menu */}
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Filter by</label>
                      <select className="w-full glass-field">
                        <option value="all">All keys</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
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
            to="/api-keys/stats"
            aria-label="API Key Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View API key statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <Link
            to="/api-keys/schedules"
            aria-label="API Key schedules"
            className="ks-btn-header ks-icon-btn"
            title="API key expiry & rotation schedule"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
          <button
            onClick={() => navigate('/api-keys/new')}
            aria-label="Add API Key"
            className="ks-icon-btn"
            title="Add API Key"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
</div>
      </div>

       {error && <p className="text-red-400 mb-3">{error}</p>}

      {loading && <SkeletonGrid count={6} />}

{/* Card grid of API keys */}
       {!loading && filteredKeys.length > 0 && (
         <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" id="ks-apikeys-grid">
           {filteredKeys.map((k) => {
             const owner = k.owner_name || userName(k.user_id);
             const badges = badgeFor(k);
             // Friendly label falls back to the machine name when no
             // display_name was set, so the card title always reads
             // something meaningful.
             const label = (k.display_name || '').trim() || k.name;
             // When an accent colour is set, tint the icon badge to match
             // so the admin can spot the key's purpose at a glance.
             const iconStyle = k.accent_color
               ? { backgroundColor: k.accent_color, color: '#000', borderColor: k.accent_color }
               : undefined;
             return (
               <article key={k.id} id={`ks-apikey-${k.id}`} className="ks-card ks-list-card glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <header className="flex items-start gap-3 min-w-0">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${
                      k.accent_color ? '' : 'bg-amber-900/50 border-amber-700/40 text-amber-300'
                    }`}
                    style={iconStyle}
                    aria-hidden="true"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                     </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{label}</h3>
                      {k.display_name && k.display_name.trim() && k.display_name.trim() !== k.name && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide font-mono text-gray-500 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                          {k.name}
                      </span>
                      )}
                 </div>
                    <p className="text-[11px] text-gray-500 truncate font-mono">{k.prefix}…</p>
                    <p className="text-xs text-gray-400 truncate">
                      Owner: <span className="text-gray-200">{owner}</span>
                    </p>
                    {k.description && k.description.trim() && (
                      <p className="text-xs text-gray-400/90 truncate italic mt-1" title={k.description}>
                        {k.description}
                    </p>
                    )}
                  </div>
                  <div
                    className="shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-amber-900/50 border-amber-700/40 text-amber-300"
                  >
                    Key
                  </div>
                </header>

                <div className="flex flex-wrap gap-1.5">
                  {badges.map((b, i) => (
                    <span
                      key={i}
                      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${b.cls}`}
                    >
                      {b.text}
                    </span>
                  ))}
                </div>

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 truncate">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && (
                      <> · Last used {new Date(k.last_used_at).toLocaleDateString()}</>
                    )}
                  </span>
                  <Link to={`/api-key/${k.id}`} className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline">View details →</Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && keys.length === 0 && !error && (
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
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            <p className="text-lg font-medium text-gray-300">No API keys yet</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApiKeys;
