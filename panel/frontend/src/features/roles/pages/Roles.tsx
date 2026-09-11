import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { listRoles } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import ErrorState from '@/shared/components/ui/ErrorState';
import LimitSelect from '@/shared/components/ui/LimitSelect';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';

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
  // Glass-style modifier + video media layer mirror Nodes/Tickets so the
  // Theme Studio Card tab (glass style, video background, list-card
  // variant tokens) restyles role cards like every other list card.
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'perms' | 'color' | 'icon'>('all');
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

  const roleStats = useMemo(() => {
    const total = roles.length;
    const withPerms = roles.filter((r) => (r.permissions || []).length > 0).length;
    const withColor = roles.filter((r) => r.color && r.color.trim() !== '').length;
    const withIcon = roles.filter((r) => r.icon && r.icon.trim() !== '').length;
    return { total, withPerms, withColor, withIcon };
  }, [roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roles.filter((r) => {
      if (typeFilter === 'perms' && (r.permissions || []).length === 0) return false;
      if (typeFilter === 'color' && !(r.color || '').trim()) return false;
      if (typeFilter === 'icon' && !(r.icon || '').trim()) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.display_name || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    });
  }, [roles, search, typeFilter]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const resetFilters = () => { setSearch(''); setTypeFilter('all'); };
  const hasActiveFilter = search.trim() !== '' || typeFilter !== 'all';

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
              {typeFilter !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ks-accent-info, #38bdf8)' }} />}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Filter by</label>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                        className="w-full glass-field"
                      >
                        <option value="all">All roles</option>
                        <option value="perms">With permissions</option>
                        <option value="color">With color</option>
                        <option value="icon">With icon</option>
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
          {hasActiveFilter ? (
            <span style={{ color: 'var(--ks-text-body)', opacity: 0.7 }} className="text-xs">{visible.length} of {filtered.length} shown</span>
          ) : (
            <span style={{ color: 'var(--ks-text-body)', opacity: 0.7 }} className="text-xs">
              {roleStats.total} role{roleStats.total === 1 ? '' : 's'}
              {roleStats.withPerms > 0 && <> · {roleStats.withPerms} with permissions</>}
            </span>
          )}
        </div>
        {hasActiveFilter && (
          <button type="button" onClick={resetFilters} aria-label="Reset filters" className="p-1.5 rounded-md ks-ghost-btn" title="Reset filters">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
        )}
      </div>

      {error && roles.length > 0 && <p className="mb-3 text-sm" style={{ color: 'var(--ks-accent-danger, #f87171)' }}>{error}</p>}
      {!loading && error && roles.length === 0 && (
        <ErrorState
          variant="error"
          title="Failed to load roles"
          description={error}
          retryLabel="Retry"
          onRetry={() => void load()}
        />
      )}

      {loading && <SkeletonGrid count={4} />}

      {!loading && visible.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-roles-grid">
          {visible.map((r) => {
            const perms = r.permissions || [];
            const label = r.display_name?.trim() || r.name;
            return (
              <article key={r.id} id={`ks-role-${r.id}`} className={`ks-card ks-list-card group relative glass-card ${glassModifier} rounded-xl flex flex-col gap-3 transition-colors`}>
                <CardMediaLayer />
                {/* Top hairline follows the heading token so it stays visible
                    on light and dark themes (a fixed white/30 wash disappears
                    on light fills). */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{ background: 'linear-gradient(to right, transparent, color-mix(in srgb, var(--ks-text-heading, #ffffff) 30%, transparent), transparent)' }}
                />
                <header className="flex items-start gap-3 min-w-0">
                  <CardIconTile
                    icon={getRoleIconSvg(r.icon) || ''}
                    color={r.color || ''}
                    fallback={(
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
                      </svg>
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold truncate leading-tight" style={{ color: 'var(--ks-text-heading)' }}>{label}</h3>
                    <p className="text-[11px] truncate mt-0.5 font-mono" style={{ color: 'var(--ks-text-body)', opacity: 0.65 }}>{label !== r.name ? r.name : `id ${r.id}`}</p>
                  </div>
                  {r.color && r.color.trim() !== '' && (
                    <span
                      className="shrink-0 mt-1 w-3 h-3 rounded-full border"
                      style={{ backgroundColor: r.color, borderColor: 'var(--ks-card-border)' }}
                      title={r.color}
                    />
                  )}
                </header>

                {/* Inset description well — border + wash derive from the card
                    tokens (not a fixed black/20) so it recesses on any fill,
                    including light themes where black/20 looks inverted. */}
                <div
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor: 'var(--ks-card-border)',
                    background: 'color-mix(in srgb, var(--ks-text-heading, #ffffff) 5%, transparent)',
                  }}
                >
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--ks-text-body)' }}>
                    {r.description || <span className="italic" style={{ opacity: 0.55 }}>No description</span>}
                  </p>
                </div>

                <footer
                  className="mt-auto pt-2 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--ks-listcard-border, var(--ks-card-border))' }}
                >
                  <span className="text-[11px] truncate" style={{ color: 'var(--ks-text-body)', opacity: 0.7 }}>
                    {perms.length} permission{perms.length === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Link to={`/role/${r.id}`} className="text-[11px] hover:underline hover:opacity-80" style={{ color: 'var(--ks-link)' }}>View details →</Link>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && roles.length > 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center" style={{ color: 'var(--ks-text-body)' }}>
          No roles match your filters.
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
      {!loading && roles.length === 0 && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center" style={{ color: 'var(--ks-text-body)' }}>
          No roles yet.
          <div className="mt-3 flex justify-center">
            <button onClick={() => navigate('/roles/new')} className="ks-primary-btn px-4 py-2 rounded text-sm">
              New Role
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPage;