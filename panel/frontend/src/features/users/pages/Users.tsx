import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { listUsers, listRoles, deleteUser, suspendUser, unsuspendUser } from '@/shared/api/admin';
import type { User, Role } from '@/shared/types/user';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import Avatar from '@/shared/components/ui/Avatar';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import LimitSelect from '@/shared/components/ui/LimitSelect';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import GlassCard from '@/shared/components/ui/Card';
import { useConfirm } from '@/shared/stores/confirmStore';

const MAX_IMAGE_KEY = 'ks.users.maxImageBytes';
const MAX_IMAGE_OPTIONS: { label: string; value: number }[] = [
   { label: 'No limit', value: 0 },
   { label: '128 KB', value: 128 * 1024 },
   { label: '256 KB', value: 256 * 1024 },
   { label: '512 KB', value: 512 * 1024 },
   { label: '1 MB', value: 1024 * 1024 },
   { label: '2 MB', value: 2 * 1024 * 1024 },
   { label: 'Off', value: -1 },
   { label: 'Custom size', value: -2 },
  ];

function readMaxImagePref(): number {
   if (typeof window === 'undefined') return 0;
   const raw = window.localStorage.getItem(MAX_IMAGE_KEY);
   if (!raw) return 0;
   const n = Number(raw);
   return Number.isFinite(n) ? n : 0;
}

function userAvatarURL(id: number, max: number) {
   if (max < 0) return undefined;
   let url = `/api/users/${id}/avatar`;
   if (max > 0) url += `?max=${max}`;
   return url;
}
function userBannerURL(id: number, max: number) {
   if (max < 0) return undefined;
   let url = `/api/users/${id}/banner`;
   if (max > 0) url += `?max=${max}`;
   return url;
}

const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [suspendingId, setSuspendingId] = useState<number | null>(null);
  const [notifyLogin, setNotifyLogin] = useState<Record<number, boolean>>({});
  const [requireMfa, setRequireMfa] = useState<Record<number, boolean>>({});
  const [maxImage, setMaxImage] = useState<number>(() => readMaxImagePref());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MAX_IMAGE_KEY, String(maxImage));
  }, [maxImage]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | string>('all');

  const PAGE_SIZE_KEY = 'ks.users.pageSize';
  const readPageSize = (): number => {
    if (typeof window === 'undefined') return 25;
    const raw = window.localStorage.getItem(PAGE_SIZE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 25;
  };
  const [pageSize, setPageSize] = useState<number>(readPageSize);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

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
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [us, rs] = await Promise.all([listUsers(), listRoles()]);
      setUsers(us);
      setRoles(rs);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && String(u.role_id) !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.display_name || '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const resetFilters = () => { setSearch(''); setRoleFilter('all'); };

  function avatarColor(name: string): string {
    if (!name) return '#4b5563';
    let h = 0;
    for (let i = 0; i < name.length; i++) {
      h = (h * 31 + name.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 60% 45%)`;
  }

  const remove = async (u: User) => {
    if (!(await confirm({ title: 'Delete user', message: `Delete user "${u.username}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(u.id);
    try {
      await deleteUser(u.id);
      await load();
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const suspend = async (u: User, durationHours?: number) => {
    // Panel-owned themed dialog instead of a blocking browser prompt().
    if (!(await confirm({ title: 'Suspend user', message: `Suspend "${u.username}"? They will not be able to log in until unsuspended.`, tone: 'warning', confirmLabel: 'Suspend' }))) return;
    setSuspendingId(u.id);
    try {
      await suspendUser(u.id, { reason: 'Suspended via users panel', duration_hours: durationHours });
      await load();
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to suspend user');
    } finally {
      setSuspendingId(null);
    }
  };

  const unsuspend = async (u: User) => {
    if (!(await confirm({ title: 'Unsuspend user', message: `Unsuspend "${u.username}"? They will be able to log in again.`, tone: 'default', confirmLabel: 'Unsuspend' }))) return;
    setSuspendingId(u.id);
    try {
      await unsuspendUser(u.id);
      await load();
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to unsuspend user');
    } finally {
      setSuspendingId(null);
    }
  };

  const userStats = useMemo(() => {
    const total = users.length;
    const suspended = users.filter((u) => u.suspended).length;
    const active = total - suspended;
    const withHistory = users.filter((u) => (u.suspension_count || 0) > 0).length;
    return { total, active, suspended, withHistory };
  }, [users]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold text-white">Users</h2>
        <div className="flex items-center gap-2">
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search username, email, display name…"
            ariaLabel="Search users"
          />
          
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((prev) => !prev)}
              className={`ks-btn-header ks-icon-btn transition-colors ${filterOpen ? 'is-open' : ''}`}
              aria-label="Open filters"
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {roleFilter !== 'all' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Role</label>
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="w-full glass-field"
                      >
                        <option value="all">All roles</option>
                        {roles.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.display_name?.trim() || r.name}
                          </option>
                        ))}
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
          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className={`ks-btn-header ks-icon-btn transition-colors ${settingsOpen ? 'is-open' : ''}`}
              aria-label="Display settings"
              aria-expanded={settingsOpen}
              aria-haspopup="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[260px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Max image size</label>
                      <select
                        value={maxImage}
                        onChange={(e) => setMaxImage(Number(e.target.value))}
                        className="w-full glass-field"
                        aria-label="Maximum avatar and banner size to load in the grid"
                      >
                        {MAX_IMAGE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} className="bg-neutral-900 text-white">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Cards per page</label>
                      <LimitSelect value={pageSize} onChange={setPageSize} ariaLabel="Users page size" />
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(false)}
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
            to="/users/stats"
            aria-label="User Statistics"
            className="ks-btn-header ks-icon-btn"
            title="View user statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <button
            onClick={() => navigate('/users/new')}
            aria-label="Add User"
            className="ks-btn-header ks-icon-btn"
            title="Add User"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /> </svg>
          </button>
        </div>
      </div>

      {(search || roleFilter !== 'all' || pageSize !== 25) && (
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {(search || roleFilter !== 'all') && (
              <p className="text-xs text-gray-500">{visible.length} of {filtered.length} shown</p>
            )}
            {filtered.length > pageSize && (
              <span className="text-[11px] text-gray-500">
                (showing first {pageSize}; refine search to see more)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(search || roleFilter !== 'all') && (
              <button type="button" onClick={resetFilters} aria-label="Reset filters" className="p-1.5 rounded-md ks-ghost-btn" title="Reset filters">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                 </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 mb-3">{error}</p>}

      {loading && <SkeletonGrid count={6} />}

      {!loading && visible.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-users-grid">
          {visible.map((u) => {
            const role = roles.find((r) => r.id === u.role_id)?.name || `#${u.role_id}`;
            const displayName = (u.display_name && u.display_name.trim()) || u.username;
            const isSuspended = u.suspended === 1;
            const suspensionCount = u.suspension_count || 0;
            return (
              <article key={u.id} id={`ks-user-${u.id}`} className={`ks-card ks-list-card glass-card rounded-xl overflow-hidden flex flex-col hover:border-white/20 transition-colors ${isSuspended ? 'border-red-500/30' : ''}`}>
                <div className="relative h-16 bg-black/30">
                  {u.has_banner && (
                    <img
                      src={userBannerURL(u.id, maxImage)}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="absolute -bottom-5 left-4">
                    <div className="rounded-full ring-2 ring-black/40 bg-black/40">
                      <Avatar
                        name={u.username}
                        size={40}
                        accentColor={u.accent_color || avatarColor(u.username)}
                        symbol={u.avatar_symbol}
                        imageUrl={u.has_avatar ? userAvatarURL(u.id, maxImage) : undefined}
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 pt-7 flex flex-col gap-3 flex-1 min-w-0">
                  <header className="min-w-0 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-white truncate" title={u.username}>
                        {displayName}
                      </h3>
                      {u.display_name && u.display_name.trim() && u.display_name !== u.username && (
                        <p className="text-[11px] text-gray-500 truncate">@{u.username}</p>
                      )}
                      <p className="text-xs text-gray-400 truncate font-mono mt-0.5">{u.email}</p>
                    </div>
                    <span className="shrink-0 mt-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md border bg-sky-900/50 border-sky-700/40 text-sky-300">
                      {role}
                    </span>
                  </header>

                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 leading-snug">
                      Created {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">
                        id {u.id}
                      </span>
                      {suspensionCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-amber-900/40 border-amber-700/40 text-amber-200 text-[10px] uppercase tracking-wide">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          {suspensionCount} suspension{suspensionCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {isSuspended && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-red-900/40 border-red-700/40 text-red-200 text-[10px] uppercase tracking-wide">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                          Suspended
                        </span>
                      )}
                    </div>
                    <Link to={`/user/${u.id}`} className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline">View details →</Link>
                  </footer>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && visible.length === 0 && users.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No users match your filters.
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
      {!loading && users.length === 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No users yet.
        </div>
      )}
    </div>
  );
};

export default UsersPage;