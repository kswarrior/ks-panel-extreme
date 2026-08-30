import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTicket, addTicketComment, deleteTicketComment } from '../api/tickets';
import type { Ticket, TicketComment } from '../types/ticket';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { useAuthStore } from '@/shared/stores/authStore';
import { TicketStatusBadge, TicketPriorityBadge, formatTicketDateTime } from '../components/TicketComponents';

const TicketChat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
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
  const [live, setLive] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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
    try {
      const detail = await getTicket(Number(id));
      setTicket(detail.ticket);
      setComments(detail.comments);
    } catch (e: any) {
      if (showLoader) setError(e?.response?.data || 'Failed to load chat');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(true); }, [load]);

  useEffect(() => {
    if (!live || !id || ticket?.status === 'closed') return;
    const iv = setInterval(() => load(false), 2500);
    return () => clearInterval(iv);
  }, [live, id, ticket?.status, load]);

  useEffect(() => {
    const t = setTimeout(() => scrollToBottom(false), 80);
    return () => clearTimeout(t);
  }, [comments, scrollToBottom]);

  const handleReply = async () => {
    if (!id || !replyBody.trim()) return;
    const body = replyBody.trim();
    setSending(true);
    try {
      await addTicketComment(Number(id), body, isInternal);
      setReplyBody('');
      setIsInternal(false);
      await load(false);
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to send message');
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

  const handleDelete = async (c: TicketComment) => {
    if (!id) return;
    if (!(await confirm({ title: 'Delete message', message: 'Delete this message?', tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicketComment(Number(id), c.id);
      await load(false);
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete');
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--ks-text-body)' }}>Loading chat…</div>;
  if (error) return <div className="p-8 text-center" style={{ color: 'var(--ks-bad)' }}>{typeof error === 'string' ? error : JSON.stringify(error)}</div>;
  if (!ticket) return <div className="p-8 text-center" style={{ color: 'var(--ks-muted)' }}>Ticket not found.</div>;

  const isClosed = ticket.status === 'closed';

  return (
    <div className="max-w-[980px] mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to={`/tickets/${ticket.id}`} className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Back to ticket
        </Link>
        <span style={{ color: 'var(--ks-muted)' }}>/</span>
        <span className="font-mono text-sm font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: 'var(--ks-info)', background: 'color-mix(in srgb, var(--ks-info) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-info) 20%, transparent)' }}>{ticket.ticket_no}</span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <span className="ml-auto hidden sm:inline-flex items-center gap-2 text-xs" style={{ color: 'var(--ks-muted)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: isClosed ? 'var(--ks-muted)' : 'var(--ks-ok)' }} />
          {isClosed ? 'Closed' : 'Live chat'} • {comments.length} messages
          <button onClick={() => setLive((v) => !v)} className="ml-1 text-[11px] px-2 py-0.5 rounded-full border" style={{ background: live ? 'color-mix(in srgb, var(--ks-ok) 15%, transparent)' : 'var(--ks-card-bg)', borderColor: live ? 'color-mix(in srgb, var(--ks-ok) 30%, transparent)' : 'var(--ks-card-border)', color: live ? 'var(--ks-ok)' : 'var(--ks-muted)' }}>{live ? 'Live • on' : 'Live • off'}</button>
        </span>
      </div>

      <GlassCard className={`${glassModifier} rounded-xl overflow-hidden flex flex-col border relative`} style={{ minHeight: 560 }}>
        <CardMediaLayer />
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
              {(ticket.creator_name || 'T').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--ks-text-body)' }}>{ticket.subject}</div>
              <div className="text-xs truncate" style={{ color: 'var(--ks-muted)' }}>{ticket.creator_name} • {ticket.assignee_name ? `assigned to ${ticket.assignee_name}` : 'unassigned'} • {isClosed ? 'Closed' : 'Live'}</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--ks-muted)' }}>{comments.length} msgs</span>
            <button onClick={() => load(false)} className="ks-btn-ghost text-xs px-2.5 py-1 rounded-full">Refresh</button>
          </div>
        </div>

        <div ref={chatScrollRef} className="flex-1 min-h-[420px] max-h-[62vh] overflow-y-auto p-4 space-y-3" style={{ background: 'color-mix(in srgb, var(--ks-bg-color) 40%, transparent)' }}>
          {comments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center border mb-3" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-muted)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-7 h-7"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--ks-text-body)' }}>No messages yet</p>
              <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--ks-muted)' }}>Start the conversation — your crew will reply here in real time.</p>
              <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--ks-muted)' }}>
                <span className="px-2 py-1 rounded-full border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>Enter to send</span>
                <span className="px-2 py-1 rounded-full border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>Shift+Enter for newline</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center py-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-muted)' }}>{formatTicketDateTime(comments[0].created_at).split(',')[0]} — conversation started</span>
              </div>
              {comments.map((c) => {
                const isOwn = user?.id === c.author_id;
                const isStaff = c.author_id === ticket.assigned_to || c.is_internal;
                const initial = (c.author_name || `U${c.author_id}`).charAt(0).toUpperCase();
                return (
                  <div key={c.id} className={`flex gap-2.5 ${isOwn ? 'justify-end' : 'justify-start'} ${c.is_internal ? 'opacity-90' : ''}`}>
                    {!isOwn && (
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border" style={{ background: c.is_internal ? 'color-mix(in srgb, var(--ks-warn) 20%, transparent)' : 'var(--ks-card-bg)', borderColor: c.is_internal ? 'color-mix(in srgb, var(--ks-warn) 30%, transparent)' : 'var(--ks-card-border)', color: c.is_internal ? 'var(--ks-warn)' : 'var(--ks-text-body)' }}>
                        {initial}
                      </div>
                    )}
                    <div className={`group relative max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 mb-1 text-[11px] ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <span className="font-medium" style={{ color: isOwn ? 'var(--ks-info)' : 'var(--ks-text-body)' }}>{c.author_name || `User #${c.author_id}`}</span>
                        {c.author_id === ticket.created_by && <span className="px-1 py-0.5 rounded border text-[10px]" style={{ background: 'color-mix(in srgb, var(--ks-info) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-info) 30%, transparent)', color: 'var(--ks-info)' }}>Reporter</span>}
                        {c.author_id === ticket.assigned_to && ticket.assigned_to && <span className="px-1 py-0.5 rounded border text-[10px]" style={{ background: 'color-mix(in srgb, var(--ks-purple) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-purple) 30%, transparent)', color: 'var(--ks-purple)' }}>Assignee</span>}
                        {c.is_internal && <span className="px-1 py-0.5 rounded border text-[10px]" style={{ background: 'color-mix(in srgb, var(--ks-warn) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-warn) 30%, transparent)', color: 'var(--ks-warn)' }}>Internal</span>}
                        <span style={{ color: 'var(--ks-muted)' }}>{formatTicketDateTime(c.created_at).split(',').slice(1).join(',').trim() || formatTicketDateTime(c.created_at)}</span>
                      </div>
                      <div
                        className="relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-sm"
                        style={
                          c.is_internal
                            ? { background: 'color-mix(in srgb, var(--ks-warn) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-warn) 20%, transparent)', color: 'var(--ks-text-body)' }
                            : isOwn
                              ? { background: 'var(--ks-btn-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-btn-text)' }
                              : { background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }
                        }
                      >
                        {c.body}
                      </div>
                      <div className={`flex items-center gap-1.5 mt-1 text-[10px] ${isOwn ? 'flex-row-reverse' : ''}`} style={{ color: 'var(--ks-muted)' }}>
                        <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isOwn && <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--ks-info)' }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M20 6L9 17l-5-5" /></svg></span>}
                        {(user?.id === c.author_id || isStaff) && (
                          <button onClick={() => handleDelete(c)} className="opacity-0 group-hover:opacity-100 ml-1 hover:text-[var(--ks-bad)] transition-opacity" style={{ color: 'var(--ks-muted)' }}>Delete</button>
                        )}
                      </div>
                    </div>
                    {isOwn && (
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border" style={{ background: 'var(--ks-btn-bg)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-btn-text)' }}>
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

        <div className="shrink-0 border-t p-3" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)' }}>
          {isClosed ? (
            <div className="text-center py-3 text-sm rounded-xl border" style={{ color: 'var(--ks-muted)', background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>This ticket is closed — chat is read-only. Reopen to continue.</div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isInternal ? 'Internal note (staff only)…' : `Message as ${user?.username || 'you'} — Enter to send, Shift+Enter for newline`}
                    rows={replyBody.includes('\n') ? 3 : 1}
                    className="w-full glass-field resize-none pr-10 py-2.5 text-sm min-h-[42px] max-h-[120px]"
                    maxLength={10000}
                    disabled={sending}
                  />
                  <div className="absolute right-2 bottom-2 hidden sm:block text-[10px]" style={{ color: 'var(--ks-muted)' }}>{replyBody.length}/10000</div>
                </div>
                <button
                  onClick={handleReply}
                  disabled={sending || !replyBody.trim()}
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)' }}
                  aria-label="Send message"
                >
                  {sending ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 translate-x-[1px]"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }} />
                  <span className="px-2 py-1 rounded-full border text-xs" style={{ background: isInternal ? 'color-mix(in srgb, var(--ks-warn) 15%, transparent)' : 'var(--ks-card-bg)', borderColor: isInternal ? 'color-mix(in srgb, var(--ks-warn) 30%, transparent)' : 'var(--ks-card-border)', color: isInternal ? 'var(--ks-warn)' : 'var(--ks-muted)' }}>Internal note (staff only)</span>
                </label>
                <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: 'var(--ks-muted)' }}>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--ks-ok)' }} />Live</span>
                  <span>•</span>
                  <span>Auto-refresh 2.5s</span>
                </div>
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
};

export default TicketChat;
