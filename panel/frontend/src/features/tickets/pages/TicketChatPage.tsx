import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTicket, addTicketComment, deleteTicketComment } from '../api/tickets';
import type { Ticket, TicketComment, TicketAttachment } from '../types/ticket';
import TicketChat from '../components/TicketChat';
import TicketChatSkeleton from '../components/TicketChatSkeleton';
import TicketAttachments from '../components/TicketAttachments';
import { useAuthStore } from '@/shared/stores/authStore';
import { useConfirm } from '@/shared/stores/confirmStore';

// TicketChatPage — individual TSX for chat (separate from details).
// Addresses: "In ticket details i want open chat button not chat i want a individual tsx for chat"
// The details page now shows an Open Chat button that routes here; this page owns
// the live chat lifecycle and shows its own loading skeleton.
const TicketChatPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  // Sequence + in-flight guards for the 2.5s poll: a slow fetch must not
  // be overwritten by a stale response, and a tick must not stack another
  // request while one is still in flight.
  const loadSeq = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (showLoader = true) => {
      if (!id) return;
      if (!showLoader && inFlight.current) return;
      const my = ++loadSeq.current;
      inFlight.current = true;
      if (showLoader) setLoading(true);
      setError('');
      try {
        const detail = await getTicket(Number(id));
        if (my !== loadSeq.current) return;
        setTicket(detail.ticket);
        setComments(detail.comments);
        setAttachments(detail.attachments ?? []);
      } catch (e: any) {
        if (my !== loadSeq.current) return;
        if (showLoader) setError(e?.response?.data || 'Failed to load chat');
      } finally {
        if (my === loadSeq.current) inFlight.current = false;
        if (showLoader && my === loadSeq.current) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Invalidate any in-flight fetch on unmount/ticket-switch so a late
  // response never writes state for a dead page.
  useEffect(() => {
    return () => {
      loadSeq.current++;
      inFlight.current = false;
    };
  }, []);

  // Live polling every 2.5s when live and ticket not closed
  useEffect(() => {
    if (!live || !id || ticket?.status === 'closed') return;
    const iv = setInterval(() => load(false), 2500);
    return () => clearInterval(iv);
  }, [live, id, ticket?.status, load]);

  const handleSend = async (body: string, isInternal: boolean) => {
    if (!id) return;
    await addTicketComment(Number(id), body, isInternal);
    await load(false);
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

  if (loading) {
    return (
      <div className="w-full max-w-none mx-0 flex flex-col gap-4 min-h-0 h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-5.5rem)]">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-24 rounded" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
          <div className="h-4 w-px" style={{ background: 'var(--ks-card-border)' }} />
          <div className="h-6 w-32 rounded" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
        </div>
        <TicketChatSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-none mx-0 p-4">
        <div
          className="glass-card rounded-xl p-6 text-center border"
          style={{
            borderColor: 'color-mix(in srgb, var(--ks-accent-danger) 35%, transparent)',
            background: 'color-mix(in srgb, var(--ks-accent-danger) 10%, var(--ks-card-bg))',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--ks-accent-danger)' }}>
            {typeof error === 'string' ? error : JSON.stringify(error)}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Link to={`/tickets/${id}`} className="ks-btn-ghost inline-flex text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--ks-card-border)' }}>
              Back to details
            </Link>
            <button onClick={() => load(true)} className="ks-btn-ghost inline-flex text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--ks-card-border)' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) return <div className="p-8" style={{ color: 'var(--ks-text-body)' }}>Ticket not found.</div>;

  const isClosed = ticket.status === 'closed';
  const canSeeInternal = permissions.includes('MANAGE_TICKETS') || permissions.includes('TICKETS_EDIT');

  return (
    <div className="w-full max-w-none mx-0 flex flex-col gap-4 min-h-0 h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-5.5rem)] -m-1 sm:-m-0 p-1">
      {/* Breadcrumb & ticket header — force single-line aligned, long text truncated with ellipsis */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-nowrap shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden flex-nowrap">
          <Link to="/tickets" className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded shrink-0" style={{ color: 'var(--ks-text-body)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Tickets
          </Link>
          <span className="shrink-0" style={{ color: 'color-mix(in srgb, var(--ks-text-body) 40%, transparent)' }}>/</span>
          <Link to={`/tickets/${ticket.id}`} className="inline-flex items-center gap-1.5 text-sm hover:underline min-w-0 overflow-hidden shrink" style={{ color: 'var(--ks-text-body)' }}>
            <span className="shrink-0 font-mono font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: 'var(--ks-accent-info, #38bdf8)', background: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 22%, transparent)' }}>
              {ticket.ticket_no ? ticket.ticket_no.replace(/^TKT-/, '') : String(ticket.id)}
            </span>
            <span className="hidden sm:inline truncate min-w-0 max-w-[18ch] md:max-w-[28ch] lg:max-w-[40ch]" style={{ color: 'var(--ks-text-heading)' }} title={ticket.subject}>
              {ticket.subject}
            </span>
          </Link>
          <span className="shrink-0" style={{ color: 'color-mix(in srgb, var(--ks-text-body) 40%, transparent)' }}>/</span>
          <span className="shrink-0 text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap" style={{ color: 'var(--ks-text-heading)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 shrink-0">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Chat
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <span className="hidden sm:inline-flex items-center gap-2 text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--ks-text-body)' }}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
            <span className="hidden lg:inline">{isClosed ? 'Closed' : 'Live chat'} • {comments.length} messages</span>
            <span className="lg:hidden">{isClosed ? 'Closed' : 'Live'}</span>
            <button
              onClick={() => setLive((v) => !v)}
              className="ml-1 text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0"
              style={{
                background: live ? 'rgba(16,185,129,0.14)' : 'transparent',
                borderColor: live ? 'rgba(16,185,129,0.25)' : 'var(--ks-card-border)',
                color: live ? '#6ee7b7' : 'var(--ks-text-body)',
              }}
            >
              {live ? 'Live • on' : 'Live • off'}
            </button>
          </span>
        </div>
      </div>

      {/* Individual chat TSX — fills remaining viewport, input pinned to footer */}
      <div className="flex-1 min-h-0 flex flex-col w-full gap-3">
        {ticket && (
          <TicketAttachments ticketId={ticket.id} attachments={attachments} isClosed={isClosed} onChanged={() => load(false)} />
        )}
        <TicketChat
          ticket={ticket}
          comments={comments}
          currentUserId={user?.id ?? null}
          currentUsername={user?.username ?? null}
          isStaff={canSeeInternal}
          live={live}
          onToggleLive={() => setLive((v) => !v)}
          onRefresh={() => load(false)}
          onSend={handleSend}
          onDelete={handleDeleteComment}
          isClosed={isClosed}
        />
      </div>
    </div>
  );
};

export default TicketChatPage;
