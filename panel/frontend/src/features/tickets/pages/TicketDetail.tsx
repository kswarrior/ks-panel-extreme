import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTicket, addTicketComment, deleteTicketComment, updateTicket, assignTicket, deleteTicket, listAssignableUsers } from '../api/tickets';
import type { Ticket, TicketComment } from '../types/ticket';
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
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
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
      setComments(detail.comments);
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
    // load assignable users for staff
    listAssignableUsers().then(setAssignUsers).catch(() => {});
  }, []);

  const handleReply = async () => {
    if (!id || !replyBody.trim()) return;
    setSending(true);
    try {
      await addTicketComment(Number(id), replyBody.trim(), isInternal);
      setReplyBody('');
      setIsInternal(false);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to post reply');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (c: TicketComment) => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete comment', message: 'Delete this reply?', tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicketComment(Number(id), c.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete comment');
    }
  };

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
    if (!(await confirm({ title: 'Delete ticket', message: `Delete ticket ${ticket.ticket_no}? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicket(Number(id));
      navigate('/tickets');
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete');
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading ticket…</div>;
  if (error) return <div className="p-8 text-red-400">{typeof error === 'string' ? error : JSON.stringify(error)}</div>;
  if (!ticket) return <div className="p-8 text-gray-400">Ticket not found.</div>;

  let tags: string[] = [];
  try { const p = JSON.parse(ticket.tags); if (Array.isArray(p)) tags = p; } catch {}

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/tickets" className="ks-btn-ghost inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white px-2 py-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <span className="text-gray-600">/</span>
        <span className="font-mono text-sm text-sky-300">{ticket.ticket_no}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-300">
                <CategoryIcon category={ticket.category} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-white leading-tight">{ticket.subject}</h1>
                <p className="text-xs text-gray-400 mt-1">
                  <span className="capitalize">{ticket.category}</span>
                  {' • '}opened by <span className="text-white">{ticket.creator_name || `#${ticket.created_by}`}</span>
                  {ticket.creator_email && <span className="text-gray-500"> ({ticket.creator_email})</span>}
                  {' • '}{formatTicketDateTime(ticket.created_at)}
                </p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((t) => <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-gray-300">#{t}</span>)}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Link to={`/tickets/${ticket.id}/edit`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">Edit</Link>
                <button onClick={handleDeleteTicket} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-gray-400 hover:bg-red-500/10 hover:text-red-300">Delete</button>
              </div>
            </div>

            {ticket.description ? (
              <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/5 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 italic">No description provided.</p>
            )}

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/[0.04] border border-white/10 rounded-lg p-2">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Due</div>
                <div className={ticket.due_at && new Date(ticket.due_at) < new Date() && ticket.status !== 'closed' && ticket.status !== 'resolved' ? 'text-red-300 font-medium' : 'text-gray-200'}>{ticket.due_at ? formatTicketDateTime(ticket.due_at) : '—'}</div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-lg p-2">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Assignee</div>
                <div className="text-gray-200 truncate">{ticket.assignee_name || 'Unassigned'}</div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-lg p-2">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Updated</div>
                <div className="text-gray-200">{formatTicketDateTime(ticket.updated_at)}</div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-lg p-2">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Replies</div>
                <div className="text-gray-200">{ticket.comment_count}</div>
              </div>
            </div>
          </GlassCard>

          {/* Comments */}
          <GlassCard className={`p-5 ${glassModifier}`}>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              Conversation — {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
            </h3>

            {comments.length === 0 && (
              <div className="text-sm text-gray-500 bg-black/20 border border-white/5 rounded-lg p-6 text-center">No replies yet — be the first to respond.</div>
            )}

            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className={`rounded-lg border p-3 ${c.is_internal ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.04] border-white/10'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-white">{c.author_name || `User #${c.author_id}`}</span>
                      {c.author_id === ticket.created_by && <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">Reporter</span>}
                      {c.author_id === ticket.assigned_to && ticket.assigned_to && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300">Assignee</span>}
                      {c.is_internal && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">Internal</span>}
                      <span className="text-gray-500">{formatTicketDateTime(c.created_at)}</span>
                    </div>
                    {(user?.id === c.author_id || user?.id === ticket.assigned_to) && (
                      <button onClick={() => handleDeleteComment(c)} className="text-[11px] text-gray-500 hover:text-red-300">Delete</button>
                    )}
                  </div>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>

            {ticket.status !== 'closed' ? (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={isInternal ? 'Internal note (visible only to staff)…' : 'Write a reply — be helpful, include steps or logs if needed…'}
                  rows={4}
                  className="w-full glass-field resize-y"
                  maxLength={10000}
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                    <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border-white/20 bg-black/30" />
                    Internal note (staff only)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">{replyBody.length}/10000</span>
                    <button onClick={handleReply} disabled={sending || !replyBody.trim()} className="ks-primary-btn bg-white text-black px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                      {sending ? 'Sending…' : isInternal ? 'Add Note' : 'Reply'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-lg bg-gray-500/10 border border-gray-500/20 text-sm text-gray-400 text-center">This ticket is closed — no further replies allowed.</div>
            )}
          </GlassCard>
        </div>

        {/* Sidebar controls */}
        <div className="space-y-4">
          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">Triage</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
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
                <label className="block text-xs text-gray-400 mb-1">Priority</label>
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
                <label className="block text-xs text-gray-400 mb-1">Assignee</label>
                <div className="flex gap-2">
                  <select value={assignValue} onChange={(e) => setAssignValue(e.target.value)} className="flex-1 glass-field text-sm">
                    <option value="">Unassigned</option>
                    {assignUsers.map((u) => <option key={u.ID} value={String(u.ID)}>{u.Username} (#{u.ID})</option>)}
                  </select>
                  <button onClick={handleAssign} className="ks-btn-ghost text-xs px-3 py-1.5 rounded border border-white/10 hover:bg-white/10 text-gray-300">Assign</button>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Details</h4>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Ticket</dt><dd className="font-mono text-sky-300">{ticket.ticket_no}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Category</dt><dd className="text-gray-200 capitalize flex items-center gap-1"><CategoryIcon category={ticket.category} className="w-3 h-3" />{ticket.category}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Created</dt><dd className="text-gray-300">{formatTicketDateTime(ticket.created_at)}</dd></div>
              {ticket.closed_at && <div className="flex justify-between gap-2"><dt className="text-gray-500">Closed</dt><dd className="text-gray-300">{formatTicketDateTime(ticket.closed_at)}</dd></div>}
              {ticket.due_at && <div className="flex justify-between gap-2"><dt className="text-gray-500">Due</dt><dd className="text-amber-300">{formatTicketDateTime(ticket.due_at)}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Reporter</dt><dd className="text-white">{ticket.creator_name || `#${ticket.created_by}`}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Assignee</dt><dd className="text-violet-300">{ticket.assignee_name || '—'}</dd></div>
            </dl>
          </GlassCard>

          <div className="glass-card rounded-xl p-3 border border-white/5 bg-white/[0.02] text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1">Workflow</p>
            <p>Open → Pending → In Progress → Resolved → Closed. Staff can move any transition; reporters are notified on status changes.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
