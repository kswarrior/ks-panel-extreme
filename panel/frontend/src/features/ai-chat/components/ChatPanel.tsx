import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useAIChatStore } from '../store/aiChatStore';
import ConfirmCard from './ConfirmCard';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = hasPermissionAny(permissions, PermissionKey.VIEW_SETTINGS, PermissionKey.SETTINGS_EDIT) &&
    permissions.includes(PermissionKey.SETTINGS_EDIT);

  // Hydrate threads + active history on open so a reload restores the chat.
  useEffect(() => {
    if (!open) return;
    void refreshThreads().then(() => {
      const id = useAIChatStore.getState().activeThreadId;
      if (id) void useAIChatStore.getState().selectThread(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, streaming, open, ticket]);

  if (!open) return null;
  if (location.pathname.startsWith('/auth')) return null;
  if (!permissions.includes(PermissionKey.AI_CHAT_USE)) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || loading || ticket) return;
    send(draft);
    setDraft('');
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
      className={`fixed z-50 bottom-24 right-5 w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100dvh-8rem)] flex flex-col rounded-xl glass-dropdown overflow-hidden`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{panelName} Assistant</h3>
          <p className="text-[11px] text-gray-400 truncate">Ask about your fleet — writes need approval</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close AI assistant"
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 leading-relaxed">
            Hi! I can look up instances, nodes and templates, explain how the panel works, and —
            with your approval — start/stop instances, create themes, templates, pages and users,
            or deploy new instances.
          </p>
        )}
        {messages.map((m, i) => {
          const isLive = streaming && i === messages.length - 1 && m.role === 'assistant';
          return (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-white text-black' : 'bg-white/[0.06] text-gray-100 border border-white/10'
                }`}
              >
                {m.content}
                {isLive && <span className="inline-block w-2 animate-pulse">▍</span>}
              </div>
            </div>
          );
        })}
        {loading && !streaming && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-sm text-gray-400 bg-white/[0.06] border border-white/10 animate-pulse">
              Thinking…
            </div>
          </div>
        )}
        {ticket && (
          <ConfirmCard ticket={ticket} busy={actionBusy} onApprove={approveTicket} onDeny={denyTicket} />
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 text-red-300 hover:text-white" aria-label="Dismiss error">
              ✕
            </button>
          </div>
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
    </div>
  );
};

export default ChatPanel;
