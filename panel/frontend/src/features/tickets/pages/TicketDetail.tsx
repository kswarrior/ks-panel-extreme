import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTicket, updateTicket, assignTicket, deleteTicket, listAssignableUsers } from '../api/tickets';
import type { Ticket } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import Avatar from '@/shared/components/ui/Avatar';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { useAuthStore } from '@/shared/stores/authStore';
import { TicketStatusBadge, TicketPriorityBadge, CategoryIcon, formatTicketDateTime } from '../components/TicketComponents';
import TicketDetailSkeleton from '../components/TicketDetailSkeleton';

const STATUS_ORDER: Ticket['status'][] = ['open', 'pending', 'in_progress', 'resolved', 'closed'];

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignUsers, setAssignUsers] = useState<{ ID: number; Username: string }[]>([]);
  const [assignValue, setAssignValue] = useState<string>('');
  const [statusValue, setStatusValue] = useState<Ticket['status']>('open');
  const [priorityValue, setPriorityValue] = useState<Ticket['priority']>('medium');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const detail = await getTicket(Number(id));
      setTicket(detail.ticket);
      setCommentCount(detail.comments.length);
      setStatusValue(detail.ticket.status);
      setPriorityValue(detail.ticket.priority);
      setAssignValue(detail.ticket.assigned_to ? String(detail.ticket.assigned_to) : '');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listAssignableUsers().then(setAssignUsers).catch(() => {});
  }, []);

  const handleStatusChange = async (newStatus: Ticket['status']) => {
    if (!id || !ticket) return;
    try {
      await updateTicket(Number(id), { status: newStatus });
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to change status');
    }
  };

  const handlePriorityChange = async (newPriority: Ticket['priority']) => {
    if (!id) return;
    try {
      await updateTicket(Number(id), { priority: newPriority });
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to change priority');
    }
  };

  const handleAssign = async () => {
    if (!id) return;
    const val = assignValue === '' ? null : Number(assignValue);
    try {
      await assignTicket(Number(id), val);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to assign');
    }
  };

  const handleDeleteTicket = async () => {
    if (!ticket || !id) return;
    if (!(await confirm({ title: 'Delete ticket', message: `Delete ticket ${ticket.ticket_no}? This will delete all chat history. This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicket(Number(id));
      navigate('/tickets');
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete');
    }
  };

  if (loading) {
    return <TicketDetailSkeleton />;
  }
  if (error) {
    return (
      <div className="max-w-[1280px] mx-auto p-4">
        <div className="glass-card rounded-xl p-6 text-center border" style={{ borderColor: 'color-mix(in srgb, var(--ks-accent-danger) 35%, transparent)', background: 'color-mix(in srgb, var(--ks-accent-danger) 10%, var(--ks-card-bg))' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ks-accent-danger)' }}>{typeof error === 'string' ? error : JSON.stringify(error)}</p>
          <Link to="/tickets" className="ks-btn-ghost inline-flex mt-3 text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--ks-card-border)' }}>Back to tickets</Link>
        </div>
      </div>
    );
  }
  if (!ticket) return <div className="p-8" style={{ color: 'var(--ks-text-body)' }}>Ticket not found.</div>;

  let tags: string[] = [];
  try { const p = JSON.parse(ticket.tags); if (Array.isArray(p)) tags = p; } catch {}

  const isClosed = ticket.status === 'closed';
  const isMine = user?.id === ticket.created_by;
  const isAssignee = user?.id === ticket.assigned_to;

  const dueOverdue = ticket.due_at && !isClosed && new Date(ticket.due_at) < new Date();

  return (
    <div className="max-w-[1280px] mx-auto space-y-4">
      {/* Breadcrumb – theme aware */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          to="/tickets"
          className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded"
          style={{ color: 'var(--ks-text-body)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Tickets
        </Link>
        <span style={{ color: 'color-mix(in srgb, var(--ks-text-body) 40%, transparent)' }}>/</span>
        <span className="font-mono text-sm font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: 'var(--ks-accent-info, #38bdf8)', background: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 22%, transparent)' }}>{ticket.ticket_no}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <span className="ml-auto hidden sm:inline-flex items-center gap-2 text-xs" style={{ color: 'var(--ks-text-body)' }}>
          <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
          {isClosed ? 'Closed' : 'Live chat'} • {commentCount || ticket.comment_count} messages
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.85fr] gap-4">
        {/* Left: Ticket overview + Open Chat button (chat is now individual page) */}
        <div className="space-y-4 min-w-0">
          {/* Ticket overview – fully themed */}
          <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: 'linear-gradient(to right, transparent, color-mix(in srgb, var(--ks-card-border) 70%, transparent), transparent)' }} />
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-heading)' }}>
                <CategoryIcon category={ticket.category} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--ks-text-heading)' }}>{ticket.subject}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'var(--ks-text-body)' }}>
                  <span className="capitalize inline-flex items-center gap-1"><CategoryIcon category={ticket.category} className="w-3 h-3" />{ticket.category}</span>
                  <span style={{ opacity: 0.4 }}>•</span>
                  <span>opened by</span>
                  <span className="font-medium" style={{ color: 'var(--ks-text-heading)' }}>{ticket.creator_name || `#${ticket.created_by}`}</span>
                  {ticket.creator_email && <span className="hidden sm:inline">({ticket.creator_email})</span>}
                  <span style={{ opacity: 0.4 }}>•</span>
                  <span>{formatTicketDateTime(ticket.created_at)}</span>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 hidden sm:flex items-center gap-1.5">
                <Link to={`/tickets/${ticket.id}/chat`} className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full font-medium border shadow-sm" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  Open chat
                </Link>
                <Link to={`/tickets/${ticket.id}/edit`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Edit</Link>
                <button onClick={handleDeleteTicket} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border hover:bg-red-500/10" style={{ borderColor: 'color-mix(in srgb, var(--ks-accent-danger) 25%, transparent)', color: 'var(--ks-text-body)' }}>Delete</button>
              </div>
            </div>

            {ticket.description ? (
              <div className="mt-4 p-3.5 rounded-xl border text-sm whitespace-pre-wrap leading-relaxed" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 55%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-heading)' }}>
                {ticket.description}
              </div>
            ) : (
              <p className="mt-4 text-sm italic" style={{ color: 'var(--ks-text-body)' }}>No description provided.</p>
            )}

            {/* Info strip – all information, theme tinted tiles */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl p-3 border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px] flex items-center gap-1" style={{ color: 'var(--ks-text-body)' }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-3 h-3"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>Due</div>
                <div className="mt-1 font-medium" style={{ color: dueOverdue ? 'var(--ks-accent-danger, #ef4444)' : 'var(--ks-text-heading)' }}>{ticket.due_at ? formatTicketDateTime(ticket.due_at) : '—'}</div>
                {dueOverdue && <div className="text-[10px]" style={{ color: 'var(--ks-accent-danger)' }}>Overdue</div>}
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-text-body)' }}>Assignee</div>
                <div className="mt-1 font-medium truncate" style={{ color: 'var(--ks-accent-primary, #a78bfa)' }}>{ticket.assignee_name || 'Unassigned'}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-text-body)' }}>{ticket.assigned_to ? `#${ticket.assigned_to}` : 'Needs triage'}</div>
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-text-body)' }}>Last update</div>
                <div className="mt-1 font-medium" style={{ color: 'var(--ks-text-heading)' }}>{formatTicketDateTime(ticket.updated_at)}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-text-body)' }}>{ticket.comment_count} messages</div>
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-text-body)' }}>Ticket</div>
                <div className="mt-1 font-mono font-semibold" style={{ color: 'var(--ks-accent-info, #38bdf8)' }}>{ticket.ticket_no}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-text-body)' }}>#{ticket.id} • {ticket.priority} priority</div>
              </div>
            </div>

            {/* Mobile actions – keep single Open chat entry */}
            <div className="sm:hidden mt-4 flex gap-2">
              <Link to={`/tickets/${ticket.id}/edit`} className="flex-1 text-center ks-btn-ghost text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Edit ticket</Link>
              <Link to={`/tickets/${ticket.id}/chat`} className="flex-1 text-center text-xs px-3 py-2 rounded-full font-medium border inline-flex items-center justify-center gap-1.5" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                Open chat
              </Link>
            </div>
          </GlassCard>
        </div>

        {/* Right: Triage + Details + Quick actions – fully themed */}
        <div className="space-y-4">
          <GlassCard className={`p-4 ${glassModifier}`}>
            <CardMediaLayer />
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: 'var(--ks-text-heading)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
              Triage
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal" style={{ color: 'var(--ks-text-body)' }}>{isMine ? 'You are reporter' : isAssignee ? 'Assigned to you' : ''}</span>
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-text-body)' }}>Status</label>
                <select
                  value={statusValue}
                  onChange={(e) => {
                    const ns = e.target.value as Ticket['status'];
                    setStatusValue(ns);
                    handleStatusChange(ns);
                  }}
                  className="w-full glass-field text-sm"
                >
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-text-body)' }}>Priority</label>
                <select
                  value={priorityValue}
                  onChange={(e) => {
                    const np = e.target.value as Ticket['priority'];
                    setPriorityValue(np);
                    handlePriorityChange(np);
                  }}
                  className="w-full glass-field text-sm"
                >
                  {['low','medium','high','urgent','critical'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-text-body)' }}>Assignee</label>
                <div className="flex gap-2">
                  <select value={assignValue} onChange={(e) => setAssignValue(e.target.value)} className="flex-1 glass-field text-sm">
                    <option value="">Unassigned</option>
                    {assignUsers.map((u) => <option key={u.ID} value={String(u.ID)}>{u.Username} (#{u.ID})</option>)}
                  </select>
                  <button onClick={handleAssign} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Assign</button>
                </div>
              </div>
              <div className="pt-2">
                <Link to={`/tickets/${ticket.id}/edit`} className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Edit ticket</Link>
              </div>
            </div>
          </GlassCard>

          <GlassCard className={`p-4 ${glassModifier}`}>
            <CardMediaLayer />
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ks-text-heading)' }}>All information</h4>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-text-body)' }}>Ticket</dt><dd className="font-mono font-semibold" style={{ color: 'var(--ks-accent-info)' }}>{ticket.ticket_no}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-text-body)' }}>Category</dt><dd className="capitalize inline-flex items-center gap-1.5" style={{ color: 'var(--ks-text-heading)' }}><CategoryIcon category={ticket.category} className="w-3.5 h-3.5" />{ticket.category}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-text-body)' }}>Priority</dt><dd><TicketPriorityBadge priority={ticket.priority} /></dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-text-body)' }}>Status</dt><dd><TicketStatusBadge status={ticket.status} /></dd></div>
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'color-mix(in srgb, var(--ks-card-border) 60%, transparent)' }}>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Created</dt><dd style={{ color: 'var(--ks-text-heading)' }}>{formatTicketDateTime(ticket.created_at)}</dd></div>
                {ticket.updated_at !== ticket.created_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Updated</dt><dd style={{ color: 'var(--ks-text-heading)' }}>{formatTicketDateTime(ticket.updated_at)}</dd></div>}
                {ticket.closed_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Closed</dt><dd style={{ color: 'var(--ks-text-heading)' }}>{formatTicketDateTime(ticket.closed_at)}</dd></div>}
                {ticket.due_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Due</dt><dd style={{ color: dueOverdue ? 'var(--ks-accent-danger)' : 'var(--ks-accent-warning)', fontWeight: dueOverdue ? 600 : 400 }}>{formatTicketDateTime(ticket.due_at)}</dd></div>}
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Reporter</dt><dd className="font-medium" style={{ color: 'var(--ks-text-heading)' }}>{ticket.creator_name || `#${ticket.created_by}`}{isMine && <span className="ml-1" style={{ color: 'var(--ks-accent-info)' }}>(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Assignee</dt><dd className="font-medium" style={{ color: 'var(--ks-accent-primary, #a78bfa)' }}>{ticket.assignee_name || '— Unassigned'}{isAssignee && <span className="ml-1" style={{ color: 'var(--ks-accent-primary)' }}>(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-text-body)' }}>Messages</dt><dd style={{ color: 'var(--ks-text-heading)' }}>{commentCount} • {ticket.comment_count} total</dd></div>
              </div>
              {tags.length > 0 && (
                <div className="pt-2 border-t" style={{ borderColor: 'color-mix(in srgb, var(--ks-card-border) 60%, transparent)' }}>
                  <dt className="mb-1.5" style={{ color: 'var(--ks-text-body)' }}>Tags</dt>
                  <dd className="flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>#{t}</span>)}</dd>
                </div>
              )}
            </dl>
          </GlassCard>

          <div className="glass-card rounded-xl p-4 border relative overflow-hidden" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)' }}>
            <CardMediaLayer />
            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--ks-text-heading)' }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>How chat works</h4>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ks-text-body)' }}>Chat is now a <span className="font-medium" style={{ color: 'var(--ks-text-heading)' }}>dedicated page</span> — open chat to see real live bubbles, staff-only internal notes, and inline reply. The ticket stays clean — chat lives separately.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="text-[11px] px-2 py-1 rounded-full font-medium border" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)' }}>Live 2.5s</span>
              <span className="text-[11px] px-2 py-1 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Bubbles</span>
              <span className="text-[11px] px-2 py-1 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Internal notes</span>
              <span className="text-[11px] px-2 py-1 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Read receipts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
