import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getTicket, addTicketComment, deleteTicketComment } from '../api/tickets';
import type { Ticket, TicketComment } from '../types/ticket';
import TicketChat from '../components/TicketChat';
import TicketChatSkeleton from '../components/TicketChatSkeleton';
import { useAuthStore } from '@/shared/stores/authStore';
import { useConfirm } from '@/shared/stores/confirmStore';
import { TicketStatusBadge, TicketPriorityBadge, formatTicketDateTime } from '../components/TicketComponents';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';

// TicketChatPage — individual TSX for chat (separate from details).
// Addresses: "In ticket details i want open chat button not chat i want a individual tsx for chat"
// The details page now shows an Open Chat button that routes here; this page owns
// the live chat lifecycle and shows its own loading skeleton.
const TicketChatPage: React.FC = () => {
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
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);

  const load = useCallback(
    async (showLoader = true) => {
      if (!id) return;
      if (showLoader) setLoading(true);
      setError('');
      try {
        const detail = await getTicket(Number(id));
        setTicket(detail.ticket);
        setComments(detail.comments);
      } catch (e: any) {
        if (showLoader) setError(e?.response?.data || 'Failed to load chat');
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

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
      <div className="max-w-[1280px] mx-auto space-y-4">
        <div className="flex items-center gap-2">
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
      <div className="max-w-[1280px] mx-auto p-4">
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
    <div className="max-w-[1280px] mx-auto space-y-4">
      {/* Breadcrumb & ticket header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/tickets" className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded" style={{ color: 'var(--ks-text-body)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Tickets
        </Link>
        <span style={{ color: 'color-mix(in srgb, var(--ks-text-body) 40%, transparent)' }}>/</span>
        <Link to={`/tickets/${ticket.id}`} className="inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: 'var(--ks-text-body)' }}>
          <span className="font-mono font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: 'var(--ks-accent-info, #38bdf8)', background: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-accent-info, #38bdf8) 22%, transparent)' }}>
            {ticket.ticket_no}
          </span>
          <span className="hidden sm:inline truncate max-w-[28ch]" style={{ color: 'var(--ks-text-heading)' }}>
            {ticket.subject}
          </span>
        </Link>
        <span style={{ color: 'color-mix(in srgb, var(--ks-text-body) 40%, transparent)' }}>/</span>
        <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--ks-text-heading)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          Chat
        </span>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <span className="ml-auto hidden sm:inline-flex items-center gap-2 text-xs" style={{ color: 'var(--ks-text-body)' }}>
          <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
          {isClosed ? 'Closed' : 'Live chat'} • {comments.length} messages
          <button
            onClick={() => setLive((v) => !v)}
            className="ml-1 text-[11px] px-2 py-0.5 rounded-full border font-medium"
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

      {/* Compact ticket summary */}
      <GlassCard className={`p-4 ${glassModifier} relative overflow-hidden`}>
        <CardMediaLayer />
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-heading)' }}>
            <span className="text-sm font-bold">{(ticket.subject || 'T').charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--ks-text-heading)' }}>
              {ticket.subject}
            </h1>
            <p className="text-xs truncate" style={{ color: 'var(--ks-text-body)' }}>
              {ticket.creator_name || `#${ticket.created_by}`} • {formatTicketDateTime(ticket.created_at)} • {ticket.category} • {ticket.priority}
            </p>
          </div>
          <div className="shrink-0 hidden sm:flex items-center gap-1.5">
            <Link to={`/tickets/${ticket.id}`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
              View details
            </Link>
            <Link to={`/tickets/${ticket.id}/edit`} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
              Edit
            </Link>
          </div>
        </div>
      </GlassCard>

      {/* Individual chat TSX — now the sole place for real chat */}
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
  );
};

export default TicketChatPage;
