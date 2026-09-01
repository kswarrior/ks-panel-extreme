import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ticket, TicketComment } from '../types/ticket';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import Avatar from '@/shared/components/ui/Avatar';
import { useAuthStore } from '@/shared/stores/authStore';
import { useThemeStore } from '@/shared/stores/themeStore';
import { formatTicketDateTime } from './TicketComponents';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function fmtDateGroup(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (same(d, now)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtFull(iso: string): string {
  return formatTicketDateTime(iso);
}

function linkify(text: string): React.ReactNode[] {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRe);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return (
        <a key={i} href={p} target="_blank" rel="noreferrer" className="underline decoration-white/30 hover:decoration-white underline-offset-2 break-all" style={{ color: 'inherit' }}>
          {p}
        </a>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

// Deterministic fallback accent for users without a custom accent_color – hex values so Avatar's ring (`${accent}33`) stays valid CSS.
// Keeps the chat readable while still matching the top-right header's Avatar logic (image > symbol > initials).
function fallbackAccent(authorId: number): string {
  const hues = ['#38bdf8', '#0ea5e9', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6'];
  return hues[Math.abs(authorId ?? 0) % hues.length];
}

export interface TicketChatProps {
  ticket: Ticket;
  comments: TicketComment[];
  currentUserId?: number | null;
  currentUsername?: string | null;
  isStaff?: boolean;
  live: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
  onSend: (body: string, isInternal: boolean) => Promise<void>;
  onDelete: (c: TicketComment) => void;
  isClosed?: boolean;
  // Optional loading flag — when true and no comments yet, shows skeleton bubbles
  loading?: boolean;
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const TicketChat: React.FC<TicketChatProps> = ({
  ticket,
  comments,
  currentUserId,
  currentUsername,
  isStaff,
  live,
  onToggleLive,
  onRefresh,
  onSend,
  onDelete,
  isClosed = false,
  loading = false,
}) => {
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [showInternalOnly, setShowInternalOnly] = useState(false);
  const [filter, setFilter] = useState('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);
  const prevCountRef = useRef(comments.length);

  // Auth user for header's profile logo – mirrors the top-right header's Avatar so chat feels personal
  const authUser = useAuthStore((s) => s.user);

  // theme-aware vars: composer stays card-tinted, but HEADER is intentionally NOT white –
  // it uses the panel header tokens ( --ks-header-bg / border / text ) which are dark by default
  // and stay dark even when a light theme makes --ks-card-bg white. This satisfies
  // "top of chat not white and text" – header text stays --ks-header-text (readable) on a dark header.
  const composerBg: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--ks-card-bg) 92%, transparent)',
    borderColor: 'var(--ks-card-border)',
  };
  const headerBg: React.CSSProperties = {
    background: 'var(--ks-header-bg, rgba(18,18,22,0.96))',
    borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))',
    backdropFilter: 'blur(var(--ks-header-blur, 18px))',
    // ensure header text inherits header tokens, not card tokens
    color: 'var(--ks-header-text, #fff)',
  } as any;

  const filteredComments = useMemo(() => {
    let cs = comments;
    if (showInternalOnly) cs = cs.filter((c) => c.is_internal);
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      cs = cs.filter((c) => c.body.toLowerCase().includes(q) || (c.author_name || '').toLowerCase().includes(q));
    }
    return cs;
  }, [comments, showInternalOnly, filter]);

  // Track scroll position to decide auto-scroll vs unread badge
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(nearBottom);
    if (nearBottom) setUnread(0);
  }, []);

  // Detect new messages while scrolled up -> bump unread
  useEffect(() => {
    const prev = prevCountRef.current;
    const cur = filteredComments.length;
    if (cur > prev && !atBottom) {
      setUnread((u) => u + (cur - prev));
    }
    if (cur > prev && atBottom) {
      // auto scroll
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    }
    prevCountRef.current = cur;
  }, [filteredComments.length, atBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }), 80);
    return () => clearTimeout(t);
  }, [filteredComments.length === 0 ? 0 : 1]); // only on mount; real updates handled above
  // Also scroll when ticket changes
  useEffect(() => {
    setUnread(0);
    setAtBottom(true);
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }), 100);
    return () => clearTimeout(t);
  }, [ticket.id]);

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    setUnread(0);
    setAtBottom(true);
  }, []);

  const handleSend = async () => {
    const body = replyBody.trim();
    if (!body || sending || isClosed) return;
    setSending(true);
    try {
      await onSend(body, isInternal);
      setReplyBody('');
      setIsInternal(false);
      // optimistic scroll
      setTimeout(() => scrollToBottom(true), 80);
      // refocus
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea up to 120px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [replyBody]);

  // Close 3-dot menu on outside click / escape
  useEffect(() => {
    if (openMenuId === null) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-chat-menu]')) setOpenMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuId]);

  const participantLabel = useMemo(() => {
    const parts: string[] = [];
    if (ticket.creator_name) parts.push(ticket.creator_name);
    if (ticket.assignee_name) parts.push(`→ ${ticket.assignee_name}`);
    else parts.push('unassigned');
    return parts.join(' ');
  }, [ticket.creator_name, ticket.assignee_name]);

  // Group by date then by consecutive author (for tighter chat grouping)
  const dateGroups = useMemo(() => {
    const map = new Map<string, TicketComment[]>();
    const order: string[] = [];
    for (const c of filteredComments) {
      const k = fmtDateGroup(c.created_at);
      if (!map.has(k)) {
        map.set(k, []);
        order.push(k);
      }
      map.get(k)!.push(c);
    }
    return order.map((k) => ({ date: k, items: map.get(k)! }));
  }, [filteredComments]);

  return (
    <div
      id="chat"
      className={`glass-card ${glassModifier} rounded-xl overflow-hidden flex flex-col border relative w-full flex-1 min-h-0 h-full`}
      style={{
        borderColor: 'var(--ks-card-border)',
        backgroundColor: 'var(--ks-card-bg)',
        // @ts-ignore
        backdropFilter: 'blur(var(--ks-card-blur))',
      }}
    >
      <CardMediaLayer />

      {/* Header – uses panel header tokens so it is NEVER white, even when card theme is light. Text uses header text color for contrast. */}
      <div className="shrink-0 sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl" style={headerBg}>
        {/* Creator's profile logo – same Avatar component that drives the top-right header's profile logo */}
        <Avatar
          name={ticket.creator_display_name || ticket.creator_name || ticket.subject || 'T'}
          size={32}
          accentColor={(ticket.creator_accent_color && ticket.creator_accent_color.trim()) ? ticket.creator_accent_color : fallbackAccent(ticket.created_by)}
          symbol={ticket.creator_avatar_symbol}
          imageUrl={ticket.creator_has_avatar ? `/api/users/${ticket.created_by}/avatar` : undefined}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: 'var(--ks-header-text, #fff)' }}>
            <span className="truncate">Chat — {ticket.subject}</span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${isClosed ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'}`} />
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full border" style={{ background: isClosed ? 'rgba(107,114,128,0.14)' : 'rgba(16,185,129,0.14)', borderColor: isClosed ? 'rgba(107,114,128,0.22)' : 'rgba(16,185,129,0.25)', color: isClosed ? 'var(--ks-header-text, #9ca3af)' : '#6ee7b7' }}>
              {isClosed ? 'Closed' : 'Live'}
            </span>
          </div>
          <div className="text-xs truncate flex items-center gap-1.5" style={{ color: 'color-mix(in srgb, var(--ks-header-text, #fff) 70%, transparent)' }}>
            <span className="truncate">{participantLabel}</span>
            <span className="opacity-40">•</span>
            <span>{filteredComments.length} of {comments.length} messages</span>
          </div>
        </div>

        <div className="shrink-0 hidden lg:flex items-center gap-1.5">
          <div className="relative hidden xl:flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none" style={{ color: 'color-mix(in srgb, var(--ks-header-text, #fff) 60%, transparent)' }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search chat…"
              className="glass-field !py-1.5 !pl-8 !pr-3 text-xs w-[150px] placeholder:text-[var(--ks-text-body)]/60"
              style={{ fontSize: 12, borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))', color: 'var(--ks-header-text, #fff)' } as any}
            />
          </div>
          {isStaff && (
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded-full border" style={{ background: showInternalOnly ? 'color-mix(in srgb, var(--ks-accent-warning) 14%, transparent)' : 'transparent', borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))', color: showInternalOnly ? 'var(--ks-accent-warning)' : 'color-mix(in srgb, var(--ks-header-text, #fff) 70%, transparent)' }}>
              <input type="checkbox" checked={showInternalOnly} onChange={(e) => setShowInternalOnly(e.target.checked)} className="rounded border-white/20 bg-black/30 text-amber-500 focus:ring-amber-500/30 w-3 h-3" />
              Internal
            </label>
          )}
          <button
            onClick={() => onToggleLive()}
            className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${live ? 'text-emerald-300' : ''}`}
            style={{
              background: live ? 'rgba(16,185,129,0.14)' : 'transparent',
              borderColor: live ? 'rgba(16,185,129,0.25)' : 'var(--ks-header-border, rgba(255,255,255,0.08))',
              color: live ? '#6ee7b7' : 'color-mix(in srgb, var(--ks-header-text, #fff) 70%, transparent)',
            }}
            title={live ? 'Live polling is on (2.5s)' : 'Live polling is paused'}
          >
            Live {live ? '• on' : '• off'}
          </button>
          <button onClick={onRefresh} className="ks-btn-ghost text-xs px-2.5 py-1 rounded-full border hover:bg-white/10" style={{ borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))', color: 'color-mix(in srgb, var(--ks-header-text, #fff) 70%, transparent)' }}>
            Refresh
          </button>
          {/* Current user's profile logo – mirrors the top-right header's Avatar so user sees their own identity in chat header */}
          {authUser && (
            <div className="ml-1 pl-2 border-l flex items-center gap-2" style={{ borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))' }}>
              <Avatar
                name={authUser.display_name || authUser.username || 'You'}
                size={28}
                accentColor={authUser.accent_color || undefined}
                symbol={authUser.avatar_symbol}
                imageUrl={authUser.has_avatar ? `/api/users/${authUser.id}/avatar` : undefined}
                className="shrink-0"
              />
              <span className="hidden xl:inline text-xs font-medium max-w-[10ch] truncate" style={{ color: 'var(--ks-header-text, #fff)' }}>{authUser.display_name || authUser.username}</span>
            </div>
          )}
        </div>

        {/* Mobile live toggle + tiny avatar */}
        <div className="lg:hidden shrink-0 flex items-center gap-2">
          {authUser && (
            <Avatar
              name={authUser.display_name || authUser.username || 'You'}
              size={28}
              accentColor={authUser.accent_color || undefined}
              symbol={authUser.avatar_symbol}
              imageUrl={authUser.has_avatar ? `/api/users/${authUser.id}/avatar` : undefined}
              className="shrink-0"
            />
          )}
          <button onClick={onToggleLive} className="shrink-0 w-8 h-8 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--ks-header-border, rgba(255,255,255,0.08))', background: live ? 'rgba(16,185,129,0.18)' : 'transparent', color: live ? '#6ee7b7' : 'color-mix(in srgb, var(--ks-header-text, #fff) 70%, transparent)' }}>
            <span className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
          </button>
        </div>
      </div>

      {/* Messages viewport — fills available height, scrolls, input stays pinned in footer */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4 scroll-smooth min-w-0 overscroll-contain"
        style={{
          background: 'color-mix(in srgb, var(--ks-card-bg) 40%, transparent)',
        }}
      >
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="flex justify-center">
              <div className="h-5 w-24 rounded-full" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
            </div>
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
              <div className="flex-1 max-w-[78%] space-y-2">
                <div className="h-2.5 w-24 rounded" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
                <div className="rounded-2xl rounded-tl-sm border p-3 space-y-2" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 88%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                  <div className="h-3 w-3/4 rounded" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
                  <div className="h-3 w-1/2 rounded" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <div className="flex-1 max-w-[78%] flex flex-col items-end gap-1.5">
                <div className="rounded-2xl rounded-br-sm border p-3 space-y-2" style={{ background: 'var(--ks-btn-bg, #fff)', borderColor: 'var(--ks-card-border)' }}>
                  <div className="h-3 w-52 rounded" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))', opacity: 0.6 }} />
                  <div className="h-3 w-40 rounded" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))', opacity: 0.6 }} />
                </div>
              </div>
              <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
            </div>
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
              <div className="rounded-2xl rounded-tl-sm border p-3" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 88%, transparent)', borderColor: 'var(--ks-card-border)' }}>
                <div className="h-3 w-48 rounded" style={{ background: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))' }} />
              </div>
            </div>
            <div className="flex justify-center">
              <div className="h-5 w-20 rounded-full" style={{ background: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))' }} />
            </div>
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-7 h-7"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--ks-text-heading)' }}>{filter || showInternalOnly ? 'No messages match' : 'No messages yet'}</p>
            <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--ks-text-body)' }}>
              {filter ? 'Try a different search or clear the filter.' : 'Start the conversation — your crew will reply here in real time. Messages sync live every few seconds.'}
            </p>
            {!filter && !showInternalOnly && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs" style={{ color: 'var(--ks-text-body)' }}>
                <span className="px-2 py-1 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>Enter to send</span>
                <span className="px-2 py-1 rounded-full border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>Shift+Enter for new line</span>
              </div>
            )}
            {(filter || showInternalOnly) && (
              <button onClick={() => { setFilter(''); setShowInternalOnly(false); }} className="mt-3 ks-btn-ghost text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>Clear filters</button>
            )}
          </div>
        ) : (
          <>
            {dateGroups.map((group) => (
              <div key={group.date} className="space-y-3">
                <div className="flex items-center justify-center py-1 sticky top-0 z-[1]">
                  <span className="text-[11px] px-3 py-1 rounded-full border backdrop-blur" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 85%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
                    {group.date}
                  </span>
                </div>
                {group.items.map((c) => {
                  const isOwn = currentUserId != null && c.author_id === currentUserId;
                  const canDelete = currentUserId === c.author_id || !!isStaff;

                  // Bubble styling: own vs other – own uses btn bg for contrast, others use card tint
                  const bubbleStyle: React.CSSProperties = isOwn
                    ? {
                        background: 'var(--ks-btn-bg, #fff)',
                        color: 'var(--ks-btn-text, #000)',
                        borderColor: 'color-mix(in srgb, var(--ks-btn-bg) 60%, transparent)',
                      }
                    : c.is_internal
                      ? {
                          background: 'color-mix(in srgb, var(--ks-accent-warning, #fbbf24) 10%, var(--ks-card-bg) 88%)',
                          borderColor: 'color-mix(in srgb, var(--ks-accent-warning) 20%, var(--ks-card-border))',
                          color: 'var(--ks-text-heading, #e5e7eb)',
                          backdropFilter: 'blur(var(--ks-card-blur))',
                        } as any
                      : {
                          background: 'color-mix(in srgb, var(--ks-card-bg) 88%, transparent)',
                          borderColor: 'var(--ks-card-border)',
                          color: 'var(--ks-text-heading, #e5e7eb)',
                          backdropFilter: 'blur(var(--ks-card-blur))',
                        } as any;

                  // Author identity for Avatar – mirrors top-right header's Avatar logic: image > symbol > initials
                  const authorName = c.author_display_name?.trim() || c.author_name || `User #${c.author_id}`;
                  const rawAccent = (c.author_accent_color || '').trim();
                  const avatarAccent = rawAccent ? rawAccent : fallbackAccent(c.author_id);
                  const avatarSymbol = c.author_avatar_symbol || undefined;
                  const avatarImageUrl = c.author_has_avatar ? `/api/users/${c.author_id}/avatar` : undefined;

                  return (
                    <div key={c.id} className="flex gap-2.5 items-start">
                      {/* Profile logo – same Avatar component as top-right header's profile logo */}
                      <div className="shrink-0 mt-0.5 relative">
                        <Avatar
                          name={authorName}
                          size={32}
                          accentColor={avatarAccent}
                          symbol={avatarSymbol}
                          imageUrl={avatarImageUrl}
                          className="shrink-0"
                        />
                        {/* Tiny "You" badge on own messages so user spots their own bubble */}
                        {isOwn && (
                          <span className="absolute -bottom-1 -right-1 text-[7px] font-bold px-1 py-[1px] rounded-full border leading-none" style={{ background: 'var(--ks-accent-success, #22c55e)', color: '#fff', borderColor: 'var(--ks-card-bg)' }}>you</span>
                        )}
                        {c.is_internal && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border flex items-center justify-center" style={{ background: 'var(--ks-accent-warning, #f59e0b)', borderColor: 'var(--ks-card-bg)', color: '#000', fontSize: 7, lineHeight: 1 }} title="Internal note">!</span>
                        )}
                      </div>

                      {/* [message] + below: name, bubble, time + 3-dot */}
                      <div className="flex flex-col max-w-[78%] min-w-0">
                        {/* Author name line – so the profile logo context is clear, matches header's identity block */}
                        <div className="flex items-center gap-1.5 mb-1 px-1 min-w-0">
                          <span className="text-[11px] font-semibold truncate" style={{ color: isOwn ? 'var(--ks-accent-primary, #38bdf8)' : 'var(--ks-text-body)' }} title={authorName}>
                            {isOwn ? 'You' : authorName}
                          </span>
                          {!isOwn && c.author_name && c.author_display_name && c.author_display_name.trim() && c.author_display_name.trim() !== c.author_name && (
                            <span className="text-[10px] truncate opacity-60" style={{ color: 'var(--ks-text-body)' }}>@{c.author_name}</span>
                          )}
                          {c.is_internal && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium leading-none" style={{ background: 'color-mix(in srgb, var(--ks-accent-warning) 16%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-accent-warning) 30%, transparent)', color: 'var(--ks-accent-warning)' }}>internal</span>
                          )}
                        </div>
                        <div
                          className="relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-sm rounded-tl-sm"
                          style={{ ...bubbleStyle, borderWidth: 1 }}
                        >
                          {linkify(c.body)}
                        </div>

                        {/* below chat: time + 3 dot */}
                        <div className="flex items-center gap-1.5 mt-1.5 px-1 text-[11px]" style={{ color: 'var(--ks-text-body)' }}>
                          <span title={fmtFull(c.created_at)} className="shrink-0">{fmtTime(c.created_at)}</span>
                          <div className="relative shrink-0" data-chat-menu>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                              style={{ color: 'var(--ks-text-body)' }}
                              aria-label="More actions"
                              title="More"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                <circle cx="5" cy="12" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="19" cy="12" r="2" />
                              </svg>
                            </button>
                            {openMenuId === c.id && (
                              <div
                                className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-xl border shadow-xl overflow-hidden py-1 backdrop-blur-xl"
                                style={{
                                  background: 'color-mix(in srgb, var(--ks-card-bg) 96%, var(--ks-card-bg))',
                                  borderColor: 'var(--ks-card-border)',
                                }}
                              >
                                <button
                                  onClick={() => {
                                    const v = `> ${c.author_name || `User #${c.author_id}`}: ${c.body.split('\n')[0].slice(0, 80)}\n`;
                                    setReplyBody((prev) => (prev ? prev + '\n' + v : v));
                                    textareaRef.current?.focus();
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2"
                                  style={{ color: 'var(--ks-text-heading)' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5A2.5 2.5 0 0 1 17 11.5v7.5" /></svg>
                                  Reply
                                </button>
                                <button
                                  onClick={async () => {
                                    try { await navigator.clipboard.writeText(c.body); } catch {}
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2"
                                  style={{ color: 'var(--ks-text-heading)' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
                                  Copy
                                </button>
                                {canDelete && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      onDelete(c);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2"
                                    style={{ color: 'var(--ks-accent-danger, #f87171)' }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={endRef} />

            {/* Typing indicator – local echo when user is composing */}
            {replyBody.length > 0 && !sending && (
              <div className="flex items-center gap-2 text-xs px-1" style={{ color: 'var(--ks-text-body)' }}>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--ks-text-body)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--ks-text-body)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--ks-text-body)', animationDelay: '300ms' }} />
                </span>
                You are typing…
              </div>
            )}
            {sending && (
              <div className="flex items-center gap-2 text-xs px-1" style={{ color: 'var(--ks-text-body)' }}>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} opacity={0.25} /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /></svg>
                Sending…
              </div>
            )}
          </>
        )}
      </div>

      {/* Scroll-to-bottom FAB when scrolled up */}
      {!atBottom && filteredComments.length > 5 && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border shadow-lg backdrop-blur"
          style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path d="M19 14l-7 7-7-7" /><path d="M12 21V3" /></svg>
          {unread > 0 ? `${unread} new ${unread === 1 ? 'message' : 'messages'} • Go to bottom` : 'Go to bottom'}
        </button>
      )}

      {/* Composer – pinned footer, input + send */}
      <div className="shrink-0 mt-auto border-t backdrop-blur-xl p-3 sticky bottom-0 z-10" style={composerBg}>
        {isClosed ? (
          <div className="text-center py-3 text-sm rounded-xl border" style={{ color: 'var(--ks-text-body)', background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)', borderColor: 'var(--ks-card-border)' }}>
            This ticket is closed — chat is read-only. Reopen to continue chatting.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Input — full width */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type Message"
                rows={1}
                className="w-full glass-field resize-none py-2.5 text-sm min-h-[42px] max-h-[120px] placeholder:text-[var(--ks-text-body)]/60"
                maxLength={10000}
                disabled={sending}
                style={{ lineHeight: 1.5 } as any}
              />
              <span className="hidden sm:inline absolute right-2 bottom-2 text-[10px] pointer-events-none" style={{ color: 'var(--ks-text-body)', opacity: 0.7 }}>{replyBody.length}/10000</span>
            </div>
            {/* Controls — internal note left, send button right (aligned, button below input) */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none group">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border-white/20 bg-black/30 text-amber-500 focus:ring-amber-500/30 w-3.5 h-3.5" />
                <span
                  className="px-2 py-1 rounded-full border text-xs transition-colors"
                  style={{
                    background: isInternal ? 'color-mix(in srgb, var(--ks-accent-warning) 18%, transparent)' : 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)',
                    borderColor: isInternal ? 'color-mix(in srgb, var(--ks-accent-warning) 30%, transparent)' : 'var(--ks-card-border)',
                    color: isInternal ? 'var(--ks-accent-warning)' : 'var(--ks-text-body)',
                  }}
                >
                  Internal note (staff only)
                </span>
              </label>
              <button
                onClick={handleSend}
                disabled={sending || !replyBody.trim()}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border shrink-0 leading-none"
                style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)', borderRadius: 'var(--ks-dropdown-radius, 8px)' }}
                aria-label="Send message"
                title="Send (Enter)"
              >
                {sending ? (
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} opacity={0.25} /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /></svg>
                ) : (
                  <>⌯⌲</>
                )}
              </button>
            </div>
            {showInternalOnly && <div className="text-[11px] px-2 py-0.5 rounded-full border w-fit" style={{ background: 'color-mix(in srgb, var(--ks-accent-warning) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-accent-warning) 30%, transparent)', color: 'var(--ks-accent-warning)' }}>Filtering: internal only</div>}
            <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: 'var(--ks-text-body)' }}>
              <span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />{live ? 'Live' : 'Paused'}</span>
              <span>•</span>
              <span>Auto-refresh {live ? '2.5s' : 'off'}</span>
              <span className="hidden xl:inline">•</span>
              <span className="hidden xl:inline">{filteredComments.length} visible</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketChat;
