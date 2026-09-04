import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { listRoles, deleteRole } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import LimitSelect from '@/shared/components/ui/LimitSelect';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (!c) return c;
  const hexMatch = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h.split('').map((x) => x + x).join('');
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  const hslMatch = c.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    return `hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, ${alpha})`;
  }
  return c;
}

const ICON_PRESETS: Array<{ value: string; label: string; svg: string }> = [
  { value: 'shield', label: 'Shield', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> </svg>' },
  { value: 'user', label: 'User', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/> </svg>' },
  { value: 'key', label: 'Key', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/><path d="M21 11.5V6.5a3.5 3.5 0 0 0-7 0v5"/> </svg>' },
  { value: 'crown', label: 'Crown', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7h2l-1 4h5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13H2l-1-4h5l3-7Z"/> </svg>' },
  { value: 'star', label: 'Star', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/> </svg>' },
  { value: 'lock', label: 'Lock', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/> </svg>' },
  { value: 'zap', label: 'Zap', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/> </svg>' },
  { value: 'globe', label: 'Globe', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/> </svg>' },
  { value: 'server', label: 'Server', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/> </svg>' },
];

const getRoleIconSvg = (icon?: string) => {
  if (!icon) return null;
  if (icon.startsWith('<svg')) return icon;
  const preset = ICON_PRESETS.find(p => p.value === icon);
  return preset ? preset.svg : null;
};

const RolesPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [defaultRoleId, setDefaultRoleId] = useState<number | null>(null);
  const [allowSelfAssign, setAllowSelfAssign] = useState<Record<string, boolean>>({});
  const [perms] = useState<string[]>([
    'instances.view',
    'instances.create',
    'instances.reboot',
    'users.view',
    'users.manage',
    'themes.manage',
  ]);
  const [permState, setPermState] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  const [search, setSearch] = useState('');
  const PAGE_SIZE_KEY = 'ks.roles.pageSize';
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

const filterRef = useRef<HTMLDivElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

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
      const rs = await listRoles();
      setRoles(rs);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (r: Role) => {
    if (!(await confirm({ title: 'Delete role', message: `Delete role "${r.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingName(r.name);
    try {
      await deleteRole(r.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete role');
    } finally {
      setDeletingName(null);
    }
  };

  const roleStats = useMemo(() => {
    const total = roles.length;
    const withPerms = roles.filter((r) => (r.permissions || []).length > 0).length;
    const withColor = roles.filter((r) => r.color && r.color.trim() !== '').length;
    const withIcon = roles.filter((r) => r.icon && r.icon.trim() !== '').length;
    return { total, withPerms, withColor, withIcon };
  }, [roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.display_name || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q),
    );
  }, [roles, search]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const resetFilters = () => { setSearch(''); };

return (
    <div>
      {/* Fixed top-right pill — "Roles" title lives in the app header. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search name, display name, description…"
            ariaLabel="Search roles"
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
              {filterOpen && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Filter by</label>
                      <select className="w-full glass-field">
                        <option value="all">All roles</option>
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

          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`ks-tab inline-flex items-center justify-center transition-colors ${settingsOpen ? 'is-open' : ''}`}
              style={PILL_TAB_STYLE}
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
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Cards per page</label>
                      <LimitSelect value={pageSize} onChange={setPageSize} ariaLabel="Roles page size" />
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setSettingsOpen(false); }}
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
            to="/roles/stats"
            aria-label="Role Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View role statistics dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <Link
            to="/roles/schedules"
            aria-label="Role schedules"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Role schedules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </Link>
          <button
            onClick={() => navigate('/roles/new')}
            aria-label="Add Role"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="Add Role"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /> </svg>
          </button>
      </PageActionsPill>

      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {search && (
            <span className="text-xs text-gray-500">{visible.length} of {filtered.length} shown</span>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 mb-3">{error}</p>}

      {loading && <SkeletonGrid count={4} />}

      {!loading && visible.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-roles-grid">
          {visible.map((r) => {
            const perms = r.permissions || [];
            const color = r.color || '';
            const label = r.display_name?.trim() || r.name;
            const tintStyle = color
              ? { backgroundColor: withAlpha(color, 0.18), borderColor: withAlpha(color, 0.5), color }
              : undefined;
            const tintClass = color
              ? ''
              : 'bg-violet-900/50 border-violet-700/40 text-violet-300';
            return (
              <article key={r.id} id={`ks-role-${r.id}`} className="ks-card ks-list-card glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <header className="flex items-start gap-3 min-w-0">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white border border-white/10 ${tintClass}`}
                    style={tintStyle || undefined}
                    aria-hidden="true"
                  >
                    {(() => {
                      const iconSvg = getRoleIconSvg(r.icon);
                      if (!iconSvg) {
                        return (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
                          </svg>
                        );
                      }
                      return (
                        <span
                          className="w-4 h-4"
                          dangerouslySetInnerHTML={{
                            __html: iconSvg.replace(/<svg /, '<svg width="16" height="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" '),
                          }}
                        />
                      );
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate">{label}</h3>
                    {label !== r.name && (
                      <p className="text-[11px] text-gray-500 truncate font-mono">{r.name}</p>
                    )}
                    <p className="text-xs text-gray-400 truncate">
                      {r.description || '—'}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${tintClass}`}
                    style={tintStyle || undefined}
                  >
                    Role
                  </div>
                </header>

                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500">
{perms.length} permission{perms.length === 1 ? '' : 's'}
                   </span>

                  <CardMenu
                     ariaLabel={`Actions for role ${r.name}`}
                     items={[
                       {
                         kind: 'checkbox',
                         key: 'default',
                         label: 'Default for new users',
                         checked: defaultRoleId === r.id,
                         hint:
                           defaultRoleId === r.id
                             ? 'New users get this role'
                             : 'Click to make this role the default',
                       },
                       {
                         kind: 'toggle',
                         key: 'self-assign',
                         label: 'Allow self-assign',
                         checked: !!allowSelfAssign[r.id],
                       },
                       {
                         kind: 'submenu',
                         key: 'perms',
                         label: 'Permissions…',
                         children: perms.map((p) => ({
                           kind: 'checkbox' as const,
                           key: `perm-${p}`,
                           label: p,
                           checked: !!permState[r.id]?.[p],
                         })),
                       },
                       { kind: 'separator', key: 'sep1' },
                       {
                         key: 'edit',
                         label: 'Edit',
                         tone: 'default',
                         icon: (
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /> </svg>
                         ),
                       },
{
                          key: 'delete',
                          label: deletingName === r.name ? 'Deleting…' : 'Delete',
                           tone: 'danger',
                           disabled: deletingName === r.name,
                           icon: (
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /> </svg>
                           ),
                          },
                       ]}
                       onSelect={(key) => {
                         if (key === 'edit') navigate(`/roles/${r.id}/edit`);
                         else if (key === 'delete') remove(r);
                       }}
                    />
                  </footer>
</article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RolesPage;