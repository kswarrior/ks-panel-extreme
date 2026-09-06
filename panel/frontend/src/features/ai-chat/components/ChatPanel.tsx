import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useAIChatStore } from '../store/aiChatStore';
import { MarkdownBio } from '@/shared/components/ui/MarkdownBio';
import ConfirmCard from './ConfirmCard';
import ChatSettings from './ChatSettings';
import { canOpenAIChat } from './ChatFab';

// Floating chat panel: header shows "{panel_name} Assistant", uses the
// profile-dropdown surface (glass-dropdown) so Theme Studio Dropdowns tab
// tints it identically to the profile menu. Mobile full-width.
// Replies stream token-by-token (SSE) with a JSON fallback; every turn is
// bound to a persisted thread so history survives reloads.
const ChatPanel: React.FC = () => {
  const location = useLocation();
  const permissions = useAuthStore((s) => s.permissions);
  const panelName = useSettingsStore((s) => s.panelName);
  const open = useAIChatStore((s) => s.open);
  const setOpen = useAIChatStore((s) => s.setOpen);
  const messages = useAIChatStore((s) => s.messages);
  const ticket = useAIChatStore((s) => s.ticket);
  const loading = useAIChatStore((s) => s.loading);
  const streaming = useAIChatStore((s) => s.streaming);
  const actionBusy = useAIChatStore((s) => s.actionBusy);
  const error = useAIChatStore((s) => s.error);
  const send = useAIChatStore((s) => s.send);
  const retry = useAIChatStore((s) => s.retry);
  const canRetry = useAIChatStore((s) => s.canRetry);
  const retrying = useAIChatStore((s) => s.retrying);
  const approveTicket = useAIChatStore((s) => s.approveTicket);
  const denyTicket = useAIChatStore((s) => s.denyTicket);
  const clearError = useAIChatStore((s) => s.clearError);
  const threads = useAIChatStore((s) => s.threads);
  const threadsLoading = useAIChatStore((s) => s.threadsLoading);
  const activeThreadId = useAIChatStore((s) => s.activeThreadId);
  const refreshThreads = useAIChatStore((s) => s.refreshThreads);
  const newThread = useAIChatStore((s) => s.newThread);
  const selectThread = useAIChatStore((s) => s.selectThread);
  const renameThread = useAIChatStore((s) => s.renameThread);
  const removeThread = useAIChatStore((s) => s.removeThread);
  const modelOverride = useAIChatStore((s) => s.modelOverride);
  const setModelOverride = useAIChatStore((s) => s.setModelOverride);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  // Right-side thread-menu toggle (header ☰). Open by default so existing
  // threads stay visible; collapsing slides the row away with animation.
  const [menuOpen, setMenuOpen] = useState(true);
  // Smart stick-to-bottom: true while the user sits at the bottom. Scrolling
  // up unpins so streaming tokens never yank the view away; a jump pill
  // appears to get back down. Sending / opening / switching re-pins.
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  stickRef.current = stickToBottom;

  const isAdmin = hasPermissionAny(permissions, PermissionKey.VIEW_SETTINGS, PermissionKey.SETTINGS_EDIT) &&
    permissions.includes(PermissionKey.SETTINGS_EDIT);
  // Granular AI caps for the subtitle + disabled-state hint. Umbrella
  // implies everything; QA-only roles see a narrower subtitle.
  const canUseTools = hasPermissionAny(
    permissions,
    PermissionKey.AI_CHAT_USE,
    PermissionKey.AI_CHAT_TOOLS,
    PermissionKey.AI_CHAT_WRITES,
  );
  const disabledErr = /disabled by the administrator|not configured yet/i.test(error || '');

  // Hydrate threads + active history on open so a reload restores the chat.
  useEffect(() => {
    if (!open) return;
    setView('chat');
    void refreshThreads().then(() => {
      const id = useAIChatStore.getState().activeThreadId;
      if (id) void useAIChatStore.getState().selectThread(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, activeThreadId]);

  // Token-by-token streaming re-renders on every chunk: only follow when
  // the user is pinned to the bottom so they can read history mid-reply.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, streaming, ticket]);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(true);
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(nearBottom);
    setShowJump(!nearBottom && el.scrollHeight > el.clientHeight + 120);
  };

  if (!open) return null;
  if (location.pathname.startsWith('/auth')) return null;
  if (!canOpenAIChat(permissions)) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || loading || ticket) return;
    // Sending re-pins to the bottom so the new turn is visible.
    setStickToBottom(true);
    setShowJump(false);
    send(draft);
    setDraft('');
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  const startRename = () => {
    setRenameDraft(activeThread?.title || '');
    setRenaming(true);
  };

  const commitRename = () => {
    if (activeThreadId && renameDraft.trim()) void renameThread(activeThreadId, renameDraft);
    setRenaming(false);
  };

  return (
    <div
      role="dialog"
      aria-label={`${panelName} Assistant`}
      style={{ position: 'fixed' }}
      className={`fixed z-50 bottom-24 right-5 w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100dvh-8rem)] flex flex-col rounded-xl glass-dropdown overflow-hidden ks-ai-panel-enter`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">
            {view === 'settings' ? 'Provider settings' : `${panelName} Assistant`}
          </h3>
          <p className="text-[11px] text-gray-400 truncate">
            {view === 'settings'
              ? 'Provider · retry'
              : canUseTools
                ? 'Ask about your fleet — writes need approval'
                : 'Q&A mode — ask an admin for AI Chat Tools for fleet lookups'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {view === 'chat' && (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Hide thread menu' : 'Show thread menu'}
              aria-expanded={menuOpen}
              title={menuOpen ? 'Hide thread menu' : 'Show thread menu'}
              className={`ks-ai-menu-toggle rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors ${menuOpen ? 'is-open' : ''}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setView((v) => (v === 'settings' ? 'chat' : 'settings'))}
              aria-label={view === 'settings' ? 'Back to chat' : 'Provider settings'}
              title={view === 'settings' ? 'Back to chat' : 'Provider settings'}
              className="rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {view === 'settings' ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close AI assistant"
            className="rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {view === 'settings' ? (
        <ChatSettings />
      ) : (
      <>
      <div className={`ks-ai-threads-collapsible ${menuOpen ? '' : 'is-collapsed'}`} aria-hidden={!menuOpen}>
        <div>
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
        <select
          value={activeThreadId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') void selectThread(null);
            else void selectThread(Number(v));
          }}
          disabled={loading || !!ticket || threadsLoading}
          aria-label="Chat thread"
          className="flex-1 min-w-0 bg-black/30 text-gray-200 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60 disabled:opacity-60"
        >
          {!activeThreadId && <option value="">New chat</option>}
          {threads.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.msg_count})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void newThread()}
          disabled={loading || !!ticket}
          title="New chat thread"
          aria-label="New chat thread"
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        {activeThreadId != null && (
          <>
            <button
              type="button"
              onClick={startRename}
              disabled={loading || !!ticket}
              title="Rename thread"
              aria-label="Rename thread"
              className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void removeThread(activeThreadId)}
              disabled={loading || !!ticket}
              title="Delete thread"
              aria-label="Delete thread"
              className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-red-300 hover:bg-white/10 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </>
        )}
          </div>
        </div>
      </div>
      {renaming && activeThreadId != null && (
        <form
          className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            aria-label="Thread title"
            maxLength={120}
            autoFocus
            className="flex-1 min-w-0 bg-black/30 text-white border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
          />
          <button type="submit" className="shrink-0 text-xs bg-white text-black px-2 py-1.5 rounded-md hover:bg-gray-200">
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="shrink-0 text-xs px-2 py-1.5 rounded-md border border-white/10 text-gray-300 hover:bg-white/10"
          >
            Cancel
          </button>
        </form>
      )}
      {isAdmin && (
        <div className="px-3 py-1.5 border-b border-white/10">
          <input
            value={modelOverride}
            onChange={(e) => setModelOverride(e.target.value)}
            placeholder="Model override for this chat (admin, blank = default)…"
            aria-label="Model override"
            disabled={loading || !!ticket}
            className="w-full bg-transparent text-gray-500 placeholder-gray-600 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:text-gray-200 disabled:opacity-60"
          />
        </div>
      )}

      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 leading-relaxed">
            Hi! I can look up instances, nodes and templates, explain how the panel works, and —
            with your approval — start/stop instances, create themes, templates, pages and users,
            or deploy new instances.
          </p>
        )}
        {messages.map((m, i) => {
          const isLive = streaming && i === messages.length - 1 && m.role === 'assistant';
          if (m.role !== 'user') {
            return (
              <div key={m.id} className="w-full min-w-0">
                <div className="w-full px-1 py-1 text-sm leading-relaxed text-gray-100 min-w-0 overflow-hidden">
                  {m.content.trim() === '' ? (
                    <span className="text-gray-400 animate-pulse">Thinking…</span>
                  ) : (
                    <MarkdownBio source={m.content} className="text-sm text-gray-100 leading-relaxed break-words" />
                  )}
                  {isLive && m.content.trim() !== '' && <span className="inline-block w-2 animate-pulse text-gray-400">▍</span>}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap bg-white text-black">
                {m.content}
              </div>
            </div>
          );
        })}
        {loading && !streaming && messages.length > 0 && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="w-full px-1 py-1 text-sm text-gray-400 animate-pulse">
            Thinking…
          </div>
        )}
        {ticket && (
          <ConfirmCard ticket={ticket} busy={actionBusy} onApprove={approveTicket} onDeny={denyTicket} />
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex items-start justify-between gap-2">
            <span className="flex-1 min-w-0">
              {error}
              {disabledErr && (
                <span className="block mt-1 text-red-200/80">
                  {isAdmin ? (
                    <>
                      Open the gear menu → Provider settings to set Base URL + Model, then Save all. Access is managed via Roles → AI Chat.
                    </>
                  ) : (
                    <>Ask an administrator to configure a provider and grant AI Chat access.</>
                  )}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {disabledErr && isAdmin && !loading && (
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="rounded-md px-2 py-0.5 border border-red-400/40 text-red-200 hover:bg-red-500/20 hover:text-white transition-colors"
                  aria-label="Open AI settings"
                >
                  Configure
                </button>
              )}
              {canRetry && !loading && !retrying && !disabledErr && (
                <button
                  type="button"
                  onClick={() => void retry()}
                  className="rounded-md px-2 py-0.5 border border-red-400/40 text-red-200 hover:bg-red-500/20 hover:text-white transition-colors"
                  aria-label="Retry last message"
                >
                  Retry
                </button>
              )}
              <button type="button" onClick={clearError} className="shrink-0 text-red-300 hover:text-white px-1" aria-label="Dismiss error">
                ✕
              </button>
            </span>
          </div>
        )}
      </div>
      {showJump && !stickToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest message"
          title="Scroll to latest"
          className="ks-ai-jump-enter absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 backdrop-blur-md px-3 py-1.5 text-xs text-white shadow-lg hover:bg-black/90 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Latest
          {streaming && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </button>
      )}
      </div>

      <form onSubmit={submit} className="border-t border-white/10 p-3 flex items-end gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={ticket ? 'Approve or deny above first…' : 'Ask something…'}
          disabled={loading || !!ticket}
          aria-label="Message the assistant"
          className="flex-1 bg-black/30 text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || loading || !!ticket}
          className="shrink-0 inline-flex items-center gap-1 bg-white text-black px-3 py-2 rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-60"
        >
          Send
        </button>
      </form>
      </>
      )}
    </div>
  );
};

export default ChatPanel;
