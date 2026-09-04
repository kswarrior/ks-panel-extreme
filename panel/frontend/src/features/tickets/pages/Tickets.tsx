import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { listTickets, deleteTicket, ticketStats } from '../api/tickets';
import type { Ticket, TicketStats } from '../types/ticket';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { TicketStatusBadge, TicketPriorityBadge, CategoryIcon, formatTicketDateTime } from '../components/TicketComponents';

const STATUS_OPTIONS = ['all', 'open', 'pending', 'in_progress', 'resolved', 'closed'] as const;
const PRIORITY_OPTIONS = ['all', 'low', 'medium', 'high', 'urgent', 'critical'] as const;
const CATEGORY_OPTIONS = ['all', 'general', 'billing', 'technical', 'feature', 'bug', 'abuse', 'other'] as const;

const Tickets: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<TicketStats | null>(null);

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const v = searchParams.get('status') || 'all';
    return (STATUS_OPTIONS as readonly string[]).includes(v) ? v : 'all';
  });
  const [priorityFilter, setPriorityFilter] = useState<string>(() => {
    const v = searchParams.get('priority') || 'all';
    return (PRIORITY_OPTIONS as readonly string[]).includes(v) ? v : 'all';
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    const v = searchParams.get('category') || 'all';
    return (CATEGORY_OPTIONS as readonly string[]).includes(v) ? v : 'all';
  });
  const [mineOnly, setMineOnly] = useState(() => searchParams.get('mine') === '1');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Debounced search so typing does not spam the API on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Honor deep-links such as /tickets?status=open (TicketStats shortcuts).
  // When the URL changes externally, adopt it into the filter state.
  useEffect(() => {
    const s = searchParams.get('status');
    if (s && (STATUS_OPTIONS as readonly string[]).includes(s) && s !== statusFilter) setStatusFilter(s);
    const p = searchParams.get('priority');
    if (p && (PRIORITY_OPTIONS as readonly string[]).includes(p) && p !== priorityFilter) setPriorityFilter(p);
    const c = searchParams.get('category');
    if (c && (CATEGORY_OPTIONS as readonly string[]).includes(c) && c !== categoryFilter) setCategoryFilter(c);
    const m = searchParams.get('mine') === '1';
    if (m !== mineOnly) setMineOnly(m);
    const q = searchParams.get('search') || '';
    if (q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as HTMLElement)) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { tickets: ts, total: t } = await listTickets({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        mine: mineOnly || undefined,
        limit: 100,
      });
      setTickets(ts);
      setTotal(t);
      // stats
      try {
        const s = await ticketStats();
        setStats(s);
      } catch { /* ignore */ }
    } catch (e: any) {
      setError(e?.response?.data || e?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, categoryFilter, debouncedSearch, mineOnly]);

  useEffect(() => { load(); }, [load]);

  // Server already filters; `tickets` is the visible set. Keep the alias for
  // readability but fix the empty-state branching below (filtered === tickets).
  const filtered = tickets;

  const remove = async (t: Ticket) => {
    if (!(await confirm({ title: 'Delete ticket', message: `Delete ticket "${t.ticket_no} – ${t.subject}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeletingId(t.id);
    try {
      await deleteTicket(t.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete ticket');
    } finally {
      setDeletingId(null);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setMineOnly(false);
    setSearchParams({});
  };

  const hasActiveFilter = statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || mineOnly || debouncedSearch.trim() !== '';

  // Keep the URL in sync when filters change via UI so deep-links, refresh
  // and the TicketStats shortcuts all resolve to the same visible set.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (statusFilter !== 'all') next.status = statusFilter;
    if (priorityFilter !== 'all') next.priority = priorityFilter;
    if (categoryFilter !== 'all') next.category = categoryFilter;
    if (mineOnly) next.mine = '1';
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    const cur = Object.fromEntries(searchParams.entries());
    if (JSON.stringify(cur) !== JSON.stringify(next)) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter, categoryFilter, mineOnly, debouncedSearch]);

  return (
    <div>
      {/* Fixed top-right pill — "Tickets" title lives in the app header. */}
      <PageActionsPill>
          <SearchDropdown
            value={search}
            onChange={setSearch}
            placeholder="Search ticket no, subject, description…"
            ariaLabel="Search tickets"
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-72">
                <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full glass-field">
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Priority</label>
                      <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-full glass-field">
                        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p === 'all' ? 'All priorities' : p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                      <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full glass-field">
                        {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded border-white/20 bg-black/30" />
                      Only my tickets
                    </label>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <button type="button" onClick={resetFilters} className="text-xs text-gray-400 hover:text-white">Clear all</button>
                      <button type="button" onClick={() => setFilterOpen(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">Close</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Link
            to="/tickets/stats"
            aria-label="Ticket Statistics"
            className="ks-tab inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="View ticket statistics"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          </Link>
          <button
            onClick={() => navigate('/tickets/new')}
            aria-label="New Ticket"
            className="ks-tab ks-tab-active inline-flex items-center justify-center"
            style={PILL_TAB_STYLE}
            title="New Ticket"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
      </PageActionsPill>

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{filtered.length} of {total} shown</p>
        {stats && <p className="text-xs text-gray-500">{stats.total} total • {stats.unassigned} unassigned • {stats.mine} mine</p>}
      </div>

      {error && <p className="text-red-400 mb-3">{typeof error === 'string' ? error : JSON.stringify(error)}</p>}
      {loading && <SkeletonGrid count={6} />}

      {!loading && filtered.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-tickets-grid">
          {filtered.map((t) => {
            let tags: string[] = [];
            try { const p = JSON.parse(t.tags); if (Array.isArray(p)) tags = p; } catch {}
            const isUrgent = t.priority === 'urgent' || t.priority === 'critical';
            return (
              <article
                id={`ks-ticket-${t.id}`}
                key={t.id}
                className={`ks-card ks-list-card group relative glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors ${glassModifier} ${isUrgent ? 'ring-1 ring-red-500/20' : ''}`}
              >
                <CardMediaLayer />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <header className="flex items-start gap-3 min-w-0 p-3 pb-0">
                  <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border ${isUrgent ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/[0.05] border-white/10 text-gray-300'}`} aria-hidden="true">
                    <CategoryIcon category={t.category} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-semibold tracking-wide text-sky-300 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">{t.ticket_no}</span>
                      <TicketStatusBadge status={t.status} />
                      <TicketPriorityBadge priority={t.priority} />
                    </div>
                    <h3 className="text-sm font-semibold text-white truncate leading-tight mt-1.5" title={t.subject}>{t.subject}</h3>
                    <p className="text-[11px] text-gray-500 truncate">
                      <span className="text-gray-400">{t.category}</span>
                      {t.creator_name && <> • by <span className="text-gray-300">{t.creator_name}</span></>}
                      {t.assignee_name ? <> • → <span className="text-violet-300">{t.assignee_name}</span></> : <span className="text-amber-300/70"> • unassigned</span>}
                    </p>
                  </div>
                </header>

                {t.description && (
                  <p className="px-3 text-xs text-gray-400 line-clamp-2 leading-relaxed" title={t.description}>{t.description}</p>
                )}

                {tags.length > 0 && (
                  <div className="px-3 flex flex-wrap gap-1">
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-gray-300">#{tag}</span>
                    ))}
                    {tags.length > 4 && <span className="text-[10px] text-gray-500">+{tags.length - 4}</span>}
                  </div>
                )}

                <div className="px-3 flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-3 h-3"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                    {t.comment_count} repl{t.comment_count === 1 ? 'y' : 'ies'}
                  </span>
                  <span>•</span>
                  <span title={t.updated_at}>{formatTicketDateTime(t.updated_at)}</span>
                  {t.due_at && (
                    <>
                      <span>•</span>
                      <span className={new Date(t.due_at) < new Date() && t.status !== 'closed' && t.status !== 'resolved' ? 'text-red-300' : 'text-amber-300'}>due {formatTicketDateTime(t.due_at)}</span>
                    </>
                  )}
                </div>

                <footer className="mt-auto pt-2.5 mx-3 border-t border-white/[0.06] flex items-center justify-between gap-2 pb-3">
                  <Link to={`/tickets/${t.id}`} className="text-[11px] text-gray-400 hover:text-white transition-colors">View details →</Link>
                  <div className="flex items-center gap-1">
                    <Link to={`/tickets/${t.id}/chat`} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-300 hover:bg-sky-500/15 hover:text-sky-200">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                      Chat
                    </Link>
                    <Link to={`/tickets/${t.id}/edit`} className="ks-btn-ghost text-[11px] px-2 py-1 rounded hover:bg-white/10 text-gray-400 hover:text-white">Edit</Link>
                    <button
                      onClick={() => remove(t)}
                      disabled={deletingId === t.id}
                      className="ks-btn-ghost text-[11px] px-2 py-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === t.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && hasActiveFilter && !error && (
        <div className="ks-card ks-form-card rounded-xl text-center text-gray-400">
          No tickets match your filters.
          <div className="mt-2 flex justify-center">
            <button onClick={resetFilters} aria-label="Clear filters" className="ks-btn-icon ks-icon-btn" title="Clear filters">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </button>
          </div>
        </div>
      )}

      {!loading && tickets.length === 0 && !hasActiveFilter && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-20 h-20 text-gray-500" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M10 13H8M16 17H8M13 17h.01" /><path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" opacity={0.3} />
            </svg>
            <p className="text-lg font-medium text-gray-300">No tickets yet</p>
            <p className="text-sm text-gray-500 text-center max-w-sm">Create your first support ticket — our crew will pick it up fast.</p>
            <button onClick={() => navigate('/tickets/new')} className="ks-primary-btn mt-2 inline-flex items-center gap-2 bg-white text-black text-sm px-4 py-2 rounded-full hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tickets;
