import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(true);

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, []);

  const load = useCallback(async (showLoader = true) => {
    if (!id) return;
    if (showLoader) setLoading(true);
    setError('');
    try {
      const detail = await getTicket(Number(id));
      setTicket(detail.ticket);
      setComments(detail.comments);
      setStatusValue(detail.ticket.status);
      setPriorityValue(detail.ticket.priority);
      setAssignValue(detail.ticket.assigned_to ? String(detail.ticket.assigned_to) : '');
    } catch (e: any) {
      if (showLoader) setError(e?.response?.data || 'Failed to load ticket');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(true); }, [load]);

  // Live polling for real chat – every 2.5s
  useEffect(() => {
    if (!live || !id || ticket?.status === 'closed') return;
    const iv = setInterval(() => load(false), 2500);
    return () => clearInterval(iv);
  }, [live, id, ticket?.status, load]);

  // Auto scroll when comments change
  useEffect(() => {
    // slight delay to let DOM paint
    const t = setTimeout(() => scrollToBottom(false), 80);
    return () => clearTimeout(t);
  }, [comments, scrollToBottom]);

  useEffect(() => {
    listAssignableUsers().then(setAssignUsers).catch(() => {});
  }, []);

  const handleReply = async () => {
    if (!id || !replyBody.trim()) return;
    const body = replyBody.trim();
    setSending(true);
    // optimistic: keep input disabled
    try {
      await addTicketComment(Number(id), body, isInternal);
      setReplyBody('');
      setIsInternal(false);
      await load(false);
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to post reply');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  const handleDeleteComment = async (c: TicketComment) => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete message', message: 'Delete this message from the chat?', tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicketComment(Number(id), c.id);
      await load(false);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete message');
    }
  };

  const handleStatusChange = async (newStatus: Ticket['status']) => {
    if (!id || !ticket) return;
    try {
      await updateTicket(Number(id), { status: newStatus });
      await load(false);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to change status');
    }
  };

  const handlePriorityChange = async (newPriority: Ticket['priority']) => {
    if (!id) return;
    try {
      await updateTicket(Number(id), { priority: newPriority });
      await load(false);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to change priority');
    }
  };

  const handleAssign = async () => {
    if (!id) return;
    const val = assignValue === '' ? null : Number(assignValue);
    try {
      await assignTicket(Number(id), val);
      await load(false);
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

  if (loading) return <div className="p-8 text-gray-400">Loading ticket…</div>;
  if (error) return <div className="p-8 text-red-400">{typeof error === 'string' ? error : JSON.stringify(error)}</div>;
  if (!ticket) return <div className="p-8 text-gray-400">Ticket not found.</div>;

  let tags: string[] = [];
  try { const p = JSON.parse(ticket.tags); if (Array.isArray(p)) tags = p; } catch {}

  const isClosed = ticket.status === 'closed';
  const isMine = user?.id === ticket.created_by;
  const isAssignee = user?.id === ticket.assigned_to;

  return (
    <div className="max-w-[1280px] mx-auto space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/tickets" className="ks-btn-ghost inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white px-2 py-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Tickets
        </Link>
        <span className="text-gray-600">/</span>
        <span className="font-mono text-sm font-semibold tracking-wide text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">{ticket.ticket_no}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <span className="ml-auto hidden sm:inline-flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
          {isClosed ? 'Closed' : 'Live chat'} • {comments.length} messages
          <button onClick={() => setLive((v) => !v)} className={`ml-1 text-[11px] px-2 py-0.5 rounded-full border ${live ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-gray-400'}`}>{live ? 'Live • on' : 'Live • off'}</button>
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.85fr] gap-4">
        {/* Left: Ticket overview + Chat */}
        <div className="space-y-4 min-w-0">
          {/* Ticket overview – all information like today view */}
          <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border bg-white/[0.05] border-white/10 text-gray-200">
                <CategoryIcon category={ticket.category} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] font-semibold text-white leading-tight line-clamp-2">{ticket.subject}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-xs text-gray-400 capitalize inline-flex items-center gap-1"><CategoryIcon category={ticket.category} className="w-3 h-3" />{ticket.category}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-xs text-gray-500">opened by</span>
                  <span className="text-xs font-medium text-white">{ticket.creator_name || `#${ticket.created_by}`}</span>
                  {ticket.creator_email && <span className="text-xs text-gray-500 hidden sm:inline">({ticket.creator_email})</span>}
                  <span className="text-gray-600">•</span>
                  <span className="text-xs text-gray-500">{formatTicketDateTime(ticket.created_at)}</span>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-gray-300">#{t}</span>)}
                  </div>
                )}
              </div>
              <div className="shrink-0 hidden sm:flex items-center gap-1.5">
                <Link to={`/tickets/${ticket.id}/edit`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">Edit</Link>
                <button onClick={handleDeleteTicket} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-gray-400 hover:bg-red-500/10 hover:text-red-300">Delete</button>
              </div>
            </div>

            {ticket.description ? (
              <div className="mt-4 p-3.5 rounded-xl bg-black/20 border border-white/5 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 italic">No description provided.</p>
            )}

            {/* Info strip – all information */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                <div className="text-gray-500 uppercase tracking-wide text-[10px] flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-3 h-3"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>Due</div>
                <div className={`mt-1 font-medium ${ticket.due_at && new Date(ticket.due_at) < new Date() && !isClosed ? 'text-red-300' : 'text-gray-100'}`}>{ticket.due_at ? formatTicketDateTime(ticket.due_at) : '—'}</div>
                {ticket.due_at && !isClosed && new Date(ticket.due_at) < new Date() && <div className="text-[10px] text-red-300">Overdue</div>}
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Assignee</div>
                <div className="mt-1 font-medium text-violet-200 truncate">{ticket.assignee_name || 'Unassigned'}</div>
                <div className="text-[11px] text-gray-500">{ticket.assigned_to ? `#${ticket.assigned_to}` : 'Needs triage'}</div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Last update</div>
                <div className="mt-1 font-medium text-gray-100">{formatTicketDateTime(ticket.updated_at)}</div>
                <div className="text-[11px] text-gray-500">{ticket.comment_count} messages</div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                <div className="text-gray-500 uppercase tracking-wide text-[10px]">Ticket</div>
                <div className="mt-1 font-mono font-semibold text-sky-300">{ticket.ticket_no}</div>
                <div className="text-[11px] text-gray-500">#{ticket.id} • {ticket.priority} priority</div>
              </div>
            </div>

            {/* Mobile actions */}
            <div className="sm:hidden mt-4 flex gap-2">
              <Link to={`/tickets/${ticket.id}/edit`} className="flex-1 text-center ks-btn-ghost text-xs px-3 py-2 rounded-lg border border-white/10 text-gray-300">Edit ticket</Link>
              <a href="#chat" className="flex-1 text-center text-xs px-3 py-2 rounded-full bg-sky-500 text-white font-medium">Open chat</a>
            </div>
          </GlassCard>

          {/* Real chatting place – complete chat */}
          <div id="chat" className={`glass-card ${glassModifier} rounded-xl overflow-hidden flex flex-col border border-white/10 relative`} style={{ minHeight: 520 }}>
            <CardMediaLayer />
            {/* Chat header */}
            <div className="shrink-0 sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                  {(ticket.creator_name || 'T').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate flex items-center gap-2">
                    Chat — {ticket.subject}
                    <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {ticket.creator_name} • {ticket.assignee_name ? `assigned to ${ticket.assignee_name}` : 'unassigned'} • {isClosed ? 'Closed' : 'Live'}
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-xs text-gray-500">{comments.length} msgs</span>
                <button onClick={() => load(false)} className="ks-btn-ghost text-xs px-2.5 py-1 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/10">Refresh</button>
              </div>
            </div>

            {/* Messages scroll area */}
            <div ref={chatScrollRef} className="flex-1 min-h-[380px] max-h-[58vh] overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-black/10 to-black/20">
              {comments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-gray-400 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-7 h-7"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-gray-300">No messages yet</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm">Start the conversation — your crew will reply here in real time. Messages sync live every few seconds.</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Enter to send</span>
                    <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Shift+Enter for new line</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Date separator */}
                  <div className="flex items-center justify-center py-2">
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-gray-400">{formatTicketDateTime(comments[0].created_at).split(',')[0]} — conversation started</span>
                  </div>
                  {comments.map((c) => {
                    const isOwn = user?.id === c.author_id;
                    const isStaff = c.author_id === ticket.assigned_to || c.is_internal;
                    const initial = (c.author_name || `U${c.author_id}`).charAt(0).toUpperCase();
                    return (
                      <div key={c.id} className={`flex gap-2.5 ${isOwn ? 'justify-end' : 'justify-start'} ${c.is_internal ? 'opacity-90' : ''}`}>
                        {!isOwn && (
                          <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${c.is_internal ? 'bg-amber-500/20 border-amber-500/30 text-amber-200' : 'bg-white/10 border-white/10 text-gray-200'}`}>
                            {initial}
                          </div>
                        )}
                        <div className={`group relative max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                          <div className={`flex items-center gap-1.5 mb-1 text-[11px] ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className={`font-medium ${isOwn ? 'text-sky-200' : 'text-white'}`}>{c.author_name || `User #${c.author_id}`}</span>
                            {c.author_id === ticket.created_by && <span className="px-1 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px]">Reporter</span>}
                            {c.author_id === ticket.assigned_to && ticket.assigned_to && <span className="px-1 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px]">Assignee</span>}
                            {c.is_internal && <span className="px-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px]">Internal</span>}
                            <span className="text-gray-500">{formatTicketDateTime(c.created_at).split(',').slice(1).join(',').trim() || formatTicketDateTime(c.created_at)}</span>
                          </div>
                          <div
                            className={`relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-sm
                              ${c.is_internal
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-100 rounded-tr-sm'
                                : isOwn
                                  ? 'bg-gradient-to-br from-sky-500 to-violet-500 border-sky-500/30 text-white rounded-br-sm'
                                  : 'bg-white/[0.08] border-white/10 text-gray-100 rounded-tl-sm backdrop-blur'
                              }`}
                          >
                            {c.body}
                            {/* tail */}
                            <span className={`absolute w-2 h-2 rotate-45 border ${c.is_internal ? 'bg-amber-500/10 border-amber-500/20' : isOwn ? 'bg-violet-500 border-sky-500/30' : 'bg-white/[0.08] border-white/10'} ${isOwn ? '-right-1 bottom-2' : '-left-1 top-2.5'}`} style={{ display: 'none' }} />
                          </div>
                          <div className={`flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isOwn && <span className="inline-flex items-center gap-0.5 text-sky-300"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M20 6L9 17l-5-5" /></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 -ml-1"><path d="M20 6L9 17l-5-5" /></svg></span>}
                            {(user?.id === c.author_id || isStaff) && (
                              <button onClick={() => handleDeleteComment(c)} className="opacity-0 group-hover:opacity-100 ml-1 text-gray-400 hover:text-red-300 transition-opacity">Delete</button>
                            )}
                          </div>
                        </div>
                        {isOwn && (
                          <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                            {(user?.username || 'Y').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Composer – real chatting place */}
            <div className="shrink-0 border-t border-white/10 bg-white/[0.03] backdrop-blur-xl p-3">
              {isClosed ? (
                <div className="text-center py-3 text-sm text-gray-400 bg-gray-500/10 border border-gray-500/20 rounded-xl">This ticket is closed — chat is read-only. Reopen to continue chatting.</div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isInternal ? 'Internal note (staff only, not visible to reporter)…' : `Message as ${user?.username || 'you'} — Enter to send, Shift+Enter for newline`}
                        rows={replyBody.includes('\n') ? 3 : 1}
                        className="w-full glass-field resize-none pr-10 py-2.5 text-sm min-h-[42px] max-h-[120px] placeholder:text-gray-500"
                        maxLength={10000}
                        disabled={sending}
                      />
                      <div className="absolute right-2 bottom-2 flex items-center gap-1">
                        <span className="hidden sm:inline text-[10px] text-gray-500">{replyBody.length}/10000</span>
                      </div>
                    </div>
                    <button
                      onClick={handleReply}
                      disabled={sending || !replyBody.trim()}
                      className="shrink-0 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Send message"
                      title="Send (Enter)"
                    >
                      {sending ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 translate-x-[1px]"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none group">
                      <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border-white/20 bg-black/30 text-amber-500 focus:ring-amber-500/30" />
                      <span className={`px-2 py-1 rounded-full border text-xs transition-colors ${isInternal ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-gray-400 group-hover:text-gray-300'}`}>Internal note (staff only)</span>
                    </label>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Live</span>
                      <span>•</span>
                      <span>Auto-refresh 2.5s</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Triage + Details + Quick actions */}
        <div className="space-y-4">
          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
              Triage
              <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-gray-500">{isMine ? 'You are reporter' : isAssignee ? 'Assigned to you' : ''}</span>
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Status</label>
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
                <label className="block text-xs text-gray-400 mb-1.5">Priority</label>
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
                <label className="block text-xs text-gray-400 mb-1.5">Assignee</label>
                <div className="flex gap-2">
                  <select value={assignValue} onChange={(e) => setAssignValue(e.target.value)} className="flex-1 glass-field text-sm">
                    <option value="">Unassigned</option>
                    {assignUsers.map((u) => <option key={u.ID} value={String(u.ID)}>{u.Username} (#{u.ID})</option>)}
                  </select>
                  <button onClick={handleAssign} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-gray-300">Assign</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  Open chat
                </button>
                <Link to={`/tickets/${ticket.id}/edit`} className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10">Edit ticket</Link>
              </div>
            </div>
          </GlassCard>

          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">All information</h4>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2 items-center"><dt className="text-gray-500">Ticket</dt><dd className="font-mono font-semibold text-sky-300">{ticket.ticket_no}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt className="text-gray-500">Category</dt><dd className="text-gray-100 capitalize inline-flex items-center gap-1.5"><CategoryIcon category={ticket.category} className="w-3.5 h-3.5" />{ticket.category}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt className="text-gray-500">Priority</dt><dd><TicketPriorityBadge priority={ticket.priority} /></dd></div>
              <div className="flex justify-between gap-2 items-center"><dt className="text-gray-500">Status</dt><dd><TicketStatusBadge status={ticket.status} /></dd></div>
              <div className="pt-2 border-t border-white/5 space-y-2">
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Created</dt><dd className="text-gray-300">{formatTicketDateTime(ticket.created_at)}</dd></div>
                {ticket.updated_at !== ticket.created_at && <div className="flex justify-between gap-2"><dt className="text-gray-500">Updated</dt><dd className="text-gray-300">{formatTicketDateTime(ticket.updated_at)}</dd></div>}
                {ticket.closed_at && <div className="flex justify-between gap-2"><dt className="text-gray-500">Closed</dt><dd className="text-gray-300">{formatTicketDateTime(ticket.closed_at)}</dd></div>}
                {ticket.due_at && <div className="flex justify-between gap-2"><dt className="text-gray-500">Due</dt><dd className={`${new Date(ticket.due_at) < new Date() && !isClosed ? 'text-red-300 font-medium' : 'text-amber-300'}`}>{formatTicketDateTime(ticket.due_at)}</dd></div>}
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Reporter</dt><dd className="text-white font-medium">{ticket.creator_name || `#${ticket.created_by}`}{isMine && <span className="ml-1 text-sky-300">(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Assignee</dt><dd className="text-violet-200 font-medium">{ticket.assignee_name || '— Unassigned'}{isAssignee && <span className="ml-1 text-violet-300">(you)</span>}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Messages</dt><dd className="text-gray-200">{comments.length} • {ticket.comment_count} total</dd></div>
              </div>
              {tags.length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <dt className="text-gray-500 mb-1.5">Tags</dt>
                  <dd className="flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">#{t}</span>)}</dd>
                </div>
              )}
            </dl>
          </GlassCard>

          <div className="glass-card rounded-xl p-4 border border-white/5 bg-gradient-to-br from-violet-500/10 via-sky-500/10 to-emerald-500/10">
            <h4 className="text-xs font-semibold text-white mb-1.5 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>How chat works</h4>
            <p className="text-xs text-gray-300 leading-relaxed">This is a <span className="text-white font-medium">complete real chatting</span> place — messages sync live, bubbles show who said what, internal notes stay staff-only, and the input supports Enter to send. The ticket and chat are one — no popups, no reloads.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="text-[11px] px-2 py-1 rounded-full bg-white text-black font-medium">Live 2.5s</span>
              <span className="text-[11px] px-2 py-1 rounded-full bg-black/30 border border-white/10 text-gray-300">Bubbles</span>
              <span className="text-[11px] px-2 py-1 rounded-full bg-black/30 border border-white/10 text-gray-300">Internal notes</span>
              <span className="text-[11px] px-2 py-1 rounded-full bg-black/30 border border-white/10 text-gray-300">Read receipts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
