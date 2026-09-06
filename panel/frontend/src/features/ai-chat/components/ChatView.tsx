import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useAIChatStore } from '../store/aiChatStore';
import { MarkdownBio } from '@/shared/components/ui/MarkdownBio';
import ConfirmCard from './ConfirmCard';
import ChatSettings from './ChatSettings';

// Shared chat chrome for the floating AI panel: header, thread menu,
// markdown AI output (full-width body), smart stick-to-bottom scrolling.
const ChatView: React.FC = () => {
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
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  // Custom thread dropdown: trigger shows the active chat name, list holds
  // a search bar + new-chat button + chat list. The 3-dot button beside the
  // trigger owns Rename / Delete.
  const [listOpen, setListOpen] = useState(false);
  const [dotsOpen, setDotsOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
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

  // Close the thread list / 3-dot menu on outside click or Escape.
  useEffect(() => {
    if (!listOpen && !dotsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setListOpen(false);
        setDotsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setListOpen(false);
        setDotsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [listOpen, dotsOpen]);

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
  const threadBusy = loading || !!ticket;
  const filteredThreads = threadQuery.trim()
    ? threads.filter((t) => t.title.toLowerCase().includes(threadQuery.trim().toLowerCase()))
    : threads;

  const startRename = () => {
    setRenameDraft(activeThread?.title || '');
    setRenaming(true);
  };

  const commitRename = () => {
    if (activeThreadId && renameDraft.trim()) void renameThread(activeThreadId, renameDraft);
    setRenaming(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
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
      <div ref={dropdownRef} className="relative px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setListOpen((v) => !v);
              setDotsOpen(false);
            }}
            disabled={threadBusy}
            aria-haspopup="listbox"
            aria-expanded={listOpen}
            aria-label="Chat thread"
            title={activeThread?.title ?? 'New chat'}
            className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-black/30 text-gray-200 border border-white/10 rounded-md px-2 py-1.5 text-xs hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 transition-colors disabled:opacity-60"
          >
            <span className="truncate">{activeThread?.title ?? 'New chat'}</span>
            <svg className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${listOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {activeThreadId != null && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDotsOpen((v) => !v);
                  setListOpen(false);
                }}
                disabled={threadBusy}
                aria-haspopup="menu"
                aria-expanded={dotsOpen}
                aria-label="Thread options"
                title="Thread options"
                className="rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
              {dotsOpen && (
                <div role="menu" style={{ transformOrigin: 'top right' }} className="ks-ai-menu-enter absolute right-0 top-full mt-1 w-32 rounded-lg glass-dropdown p-1 z-20">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      startRename();
                      setDotsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void removeThread(activeThreadId);
                      setDotsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-200 hover:bg-white/10 hover:text-red-300 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {listOpen && (
          <div role="listbox" aria-label="Chat threads" style={{ transformOrigin: 'top center' }} className="ks-ai-menu-enter absolute left-3 right-3 top-full mt-1 rounded-lg glass-dropdown z-20 overflow-hidden">
            <div className="flex items-center gap-1.5 p-2 border-b border-white/10">
              <input
                value={threadQuery}
                onChange={(e) => setThreadQuery(e.target.value)}
                placeholder="Search chats…"
                aria-label="Search chats"
                className="flex-1 min-w-0 bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
              />
              <button
                type="button"
                onClick={() => {
                  void newThread();
                  setThreadQuery('');
                  setListOpen(false);
                }}
                disabled={threadBusy}
                title="New chat"
                aria-label="New chat"
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {threadsLoading ? (
                <p className="px-2 py-3 text-xs text-gray-500">Loading…</p>
              ) : filteredThreads.length === 0 ? (
                <p className="px-2 py-3 text-xs text-gray-500">{threadQuery.trim() ? 'No chats match' : 'No chats yet'}</p>
              ) : (
                filteredThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={t.id === activeThreadId}
                    onClick={() => {
                      if (t.id !== activeThreadId) void selectThread(t.id);
                      setListOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${t.id === activeThreadId ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-[10px] text-gray-500 font-mono">{t.msg_count}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
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
      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-3 space-y-3">
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

export default ChatView;
