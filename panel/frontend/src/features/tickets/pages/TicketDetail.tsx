import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTicket, updateTicket, assignTicket, deleteTicket, listAssignableUsers } from '../api/tickets';
import type { Ticket } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { useAuthStore } from '@/shared/stores/authStore';
import { TicketStatusBadge, TicketPriorityBadge, CategoryIcon, formatTicketDateTime } from '../components/TicketComponents';

const STATUS_ORDER: Ticket['status'][] = ['open', 'pending', 'in_progress', 'resolved', 'closed'];

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user);
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  const [ticket, setTicket] = useState<Ticket | null>(null);
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
  useEffect(() => { listAssignableUsers().then(setAssignUsers).catch(() => {}); }, []);

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

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--ks-muted)' }}>Loading ticket…</div>;
  if (error) return <div className="p-8 text-center" style={{ color: 'var(--ks-bad)' }}>{typeof error === 'string' ? error : JSON.stringify(error)}</div>;
  if (!ticket) return <div className="p-8 text-center" style={{ color: 'var(--ks-muted)' }}>Ticket not found.</div>;

  let tags: string[] = [];
  try { const p = JSON.parse(ticket.tags); if (Array.isArray(p)) tags = p; } catch {}

  const isClosed = ticket.status === 'closed';
  const isMine = user?.id === ticket.created_by;
  const isAssignee = user?.id === ticket.assigned_to;

  return (
    <div className="max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/tickets" className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Tickets
        </Link>
        <span style={{ color: 'var(--ks-muted)' }}>/</span>
        <span className="font-mono text-sm font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: 'var(--ks-info)', background: 'color-mix(in srgb, var(--ks-info) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-info) 20%, transparent)' }}>{ticket.ticket_no}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.85fr] gap-4">
        <div className="space-y-4 min-w-0">
          <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
                <CategoryIcon category={ticket.category} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--ks-text-body)' }}>{ticket.subject}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'var(--ks-muted)' }}>
                  <span className="capitalize inline-flex items-center gap-1"><CategoryIcon category={ticket.category} className="w-3 h-3" />{ticket.category}</span>
                  <span>•</span>
                  <span>opened by</span>
                  <span className="font-medium" style={{ color: 'var(--ks-text-body)' }}>{ticket.creator_name || `#${ticket.created_by}`}</span>
                  {ticket.creator_email && <span className="hidden sm:inline">({ticket.creator_email})</span>}
                  <span>•</span>
                  <span>{formatTicketDateTime(ticket.created_at)}</span>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>#{t}</span>)}
                  </div>
                )}
              </div>
              <div className="shrink-0 hidden sm:flex items-center gap-1.5">
                <Link to={`/tickets/${ticket.id}/edit`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border">Edit</Link>
                <button onClick={handleDeleteTicket} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ color: 'var(--ks-bad)', borderColor: 'color-mix(in srgb, var(--ks-bad) 30%, transparent)' }}>Delete</button>
              </div>
            </div>

            {ticket.description ? (
              <div className="mt-4 p-3.5 rounded-xl border text-sm whitespace-pre-wrap leading-relaxed" style={{ background: 'color-mix(in srgb, var(--ks-bg-color) 40%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
                {ticket.description}
              </div>
            ) : (
              <p className="mt-4 text-sm italic" style={{ color: 'var(--ks-muted)' }}>No description provided.</p>
            )}

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl p-3 border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-muted)' }}>Due</div>
                <div className="mt-1 font-medium" style={{ color: ticket.due_at && new Date(ticket.due_at) < new Date() && !isClosed ? 'var(--ks-bad)' : 'var(--ks-text-body)' }}>{ticket.due_at ? formatTicketDateTime(ticket.due_at) : '—'}</div>
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-muted)' }}>Assignee</div>
                <div className="mt-1 font-medium truncate" style={{ color: 'var(--ks-purple)' }}>{ticket.assignee_name || 'Unassigned'}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-muted)' }}>{ticket.assigned_to ? `#${ticket.assigned_to}` : 'Needs triage'}</div>
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-muted)' }}>Last update</div>
                <div className="mt-1 font-medium" style={{ color: 'var(--ks-text-body)' }}>{formatTicketDateTime(ticket.updated_at)}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-muted)' }}>{ticket.comment_count} messages</div>
              </div>
              <div className="rounded-xl p-3 border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>
                <div className="uppercase tracking-wide text-[10px]" style={{ color: 'var(--ks-muted)' }}>Ticket</div>
                <div className="mt-1 font-mono font-semibold" style={{ color: 'var(--ks-info)' }}>{ticket.ticket_no}</div>
                <div className="text-[11px]" style={{ color: 'var(--ks-muted)' }}>#{ticket.id} • {ticket.priority}</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className={`${glassModifier} p-6 text-center relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border mb-3" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-muted)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-6 h-6"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ks-text-body)' }}>Chat is now separate</h3>
            <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: 'var(--ks-muted)' }}>All conversation for this ticket lives in its dedicated chat page. Open chat to send messages, see live replies and internal notes — fully theme-aware.</p>
            <Link to={`/tickets/${ticket.id}/chat`} className="inline-flex items-center gap-2 mt-4 px-5 py-2 rounded-full text-sm font-medium" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              Open chat
            </Link>
            <div className="mt-3 text-xs" style={{ color: 'var(--ks-muted)' }}>{ticket.comment_count} messages • {isClosed ? 'read-only' : 'live'}</div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: 'var(--ks-text-body)' }}>
              Triage
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal" style={{ color: 'var(--ks-muted)' }}>{isMine ? 'You are reporter' : isAssignee ? 'Assigned to you' : ''}</span>
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-muted)' }}>Status</label>
                <select value={statusValue} onChange={(e) => { const ns = e.target.value as Ticket['status']; setStatusValue(ns); handleStatusChange(ns); }} className="w-full glass-field text-sm">
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-muted)' }}>Priority</label>
                <select value={priorityValue} onChange={(e) => { const np = e.target.value as Ticket['priority']; setPriorityValue(np); handlePriorityChange(np); }} className="w-full glass-field text-sm">
                  {['low','medium','high','urgent','critical'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--ks-muted)' }}>Assignee</label>
                <div className="flex gap-2">
                  <select value={assignValue} onChange={(e) => setAssignValue(e.target.value)} className="flex-1 glass-field text-sm">
                    <option value="">Unassigned</option>
                    {assignUsers.map((u) => <option key={u.ID} value={String(u.ID)}>{u.Username} (#{u.ID})</option>)}
                  </select>
                  <button onClick={handleAssign} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border">Assign</button>
                </div>
              </div>
              <Link to={`/tickets/${ticket.id}/chat`} className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg mt-2" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                Open chat
              </Link>
            </div>
          </GlassCard>

          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ks-text-body)' }}>All information</h4>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Ticket</dt><dd className="font-mono font-semibold" style={{ color: 'var(--ks-info)' }}>{ticket.ticket_no}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Category</dt><dd className="capitalize inline-flex items-center gap-1.5" style={{ color: 'var(--ks-text-body)' }}><CategoryIcon category={ticket.category} className="w-3.5 h-3.5" />{ticket.category}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Priority</dt><dd><TicketPriorityBadge priority={ticket.priority} /></dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Status</dt><dd><TicketStatusBadge status={ticket.status} /></dd></div>
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--ks-card-border)' }}>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Created</dt><dd style={{ color: 'var(--ks-text-body)' }}>{formatTicketDateTime(ticket.created_at)}</dd></div>
                {ticket.updated_at !== ticket.created_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Updated</dt><dd style={{ color: 'var(--ks-text-body)' }}>{formatTicketDateTime(ticket.updated_at)}</dd></div>}
                {ticket.closed_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Closed</dt><dd style={{ color: 'var(--ks-text-body)' }}>{formatTicketDateTime(ticket.closed_at)}</dd></div>}
                {ticket.due_at && <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Due</dt><dd style={{ color: new Date(ticket.due_at) < new Date() && !isClosed ? 'var(--ks-bad)' : 'var(--ks-warn)' }}>{formatTicketDateTime(ticket.due_at)}</dd></div>}
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Reporter</dt><dd className="font-medium" style={{ color: 'var(--ks-text-body)' }}>{ticket.creator_name || `#${ticket.created_by}`}{isMine && <span className="ml-1" style={{ color: 'var(--ks-info)' }}>(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Assignee</dt><dd className="font-medium" style={{ color: 'var(--ks-purple, #a78bfa)' }}>{ticket.assignee_name || '— Unassigned'}{isAssignee && <span className="ml-1" style={{ color: 'var(--ks-purple)' }}>(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Messages</dt><dd style={{ color: 'var(--ks-text-body)' }}>{ticket.comment_count} total</dd></div>
              </div>
              {tags.length > 0 && (
                <div className="pt-2 border-t" style={{ borderColor: 'var(--ks-card-border)' }}>
                  <dt className="mb-1.5" style={{ color: 'var(--ks-muted)' }}>Tags</dt>
                  <dd className="flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>#{t}</span>)}</dd>
                </div>
              )}
            </dl>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
