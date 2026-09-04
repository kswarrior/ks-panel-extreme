import create from 'zustand';
import {
  approveAITicket,
  createAIThread,
  deleteAIThread,
  getAIThread,
  listAIThreads,
  renameAIThread,
  sendAIChat,
  streamAIChat,
  type AIChatMessage,
  type AIConfirmationTicket,
  type AIExecuted,
  type AIThread,
} from '../api/aiChat';

export interface ChatBubble {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // Snapshot of the ticket proposed in this turn (stays visible as history
  // even after the active ticket is approved/denied).
  ticket?: AIConfirmationTicket | null;
  executed?: AIExecuted | null;
}

interface AIChatState {
  open: boolean;
  messages: ChatBubble[];
  // The ticket currently awaiting an Approve/Deny decision (at most one —
  // the server stops the tool loop at the first write proposal).
  ticket: AIConfirmationTicket | null;
  loading: boolean;
  streaming: boolean;
  actionBusy: boolean;
  error: string;
  nextId: number;
  threads: AIThread[];
  threadsLoading: boolean;
  activeThreadId: number | null;
  // Admin-only per-request model override (the server ignores it for
  // everyone else).
  modelOverride: string;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setModelOverride: (v: string) => void;
  refreshThreads: () => Promise<void>;
  newThread: () => Promise<void>;
  selectThread: (id: number | null) => Promise<void>;
  renameThread: (id: number, title: string) => Promise<void>;
  removeThread: (id: number) => Promise<void>;
  send: (text: string) => Promise<void>;
  approveTicket: () => Promise<void>;
  denyTicket: () => void;
  clearError: () => void;
}

const THREAD_KEY = 'ai-chat-thread';

function storedThreadId(): number | null {
  try {
    const v = window.localStorage.getItem(THREAD_KEY);
    const n = v ? Number(v) : 0;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

function rememberThreadId(id: number | null) {
  try {
    if (id) window.localStorage.setItem(THREAD_KEY, String(id));
    else window.localStorage.removeItem(THREAD_KEY);
  } catch {
    // Storage full/blocked — threads still work for this tab.
  }
}

function errText(e: unknown, fallback: string): string {
  const r = (e as { response?: { data?: unknown; status?: number } })?.response;
  if (typeof r?.data === 'string' && r.data) return r.data;
  if (r?.data && typeof r.data === 'object') {
    const d = r.data as { error?: unknown; reply?: unknown };
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.reply === 'string' && d.reply) return d.reply;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  open: false,
  messages: [],
  ticket: null,
  loading: false,
  streaming: false,
  actionBusy: false,
  error: '',
  nextId: 1,
  threads: [],
  threadsLoading: false,
  activeThreadId: storedThreadId(),
  modelOverride: '',

  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  setModelOverride: (v) => set({ modelOverride: v }),

  refreshThreads: async () => {
    set({ threadsLoading: true });
    try {
      const threads = await listAIThreads();
      const active = get().activeThreadId;
      if (active && !threads.some((t) => t.id === active)) {
        rememberThreadId(null);
        set({ threads, activeThreadId: null, messages: [], ticket: null, threadsLoading: false });
        return;
      }
      set({ threads, threadsLoading: false });
    } catch {
      set({ threadsLoading: false });
    }
  },

  newThread: async () => {
    if (get().loading) return;
    try {
      const th = await createAIThread();
      rememberThreadId(th.id);
      set((s) => ({
        threads: [th, ...s.threads],
        activeThreadId: th.id,
        messages: [],
        ticket: null,
        error: '',
      }));
    } catch (e) {
      set({ error: errText(e, 'Failed to create a chat thread') });
    }
  },

  selectThread: async (id) => {
    if (get().loading || get().ticket) return;
    if (id === get().activeThreadId && get().messages.length > 0) return;
    if (id == null) {
      rememberThreadId(null);
      set({ activeThreadId: null, messages: [], ticket: null, error: '' });
      return;
    }
    set({ threadsLoading: true, error: '' });
    try {
      const { messages } = await getAIThread(id);
      let next = get().nextId;
      const bubbles: ChatBubble[] = messages.map((m) => ({
        id: next++,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
      rememberThreadId(id);
      set((s) => ({
        activeThreadId: id,
        messages: bubbles,
        ticket: null,
        nextId: next,
        threadsLoading: false,
        threads: s.threads.some((t) => t.id === id) ? s.threads : [...s.threads],
      }));
    } catch (e) {
      set({ threadsLoading: false, error: errText(e, 'Failed to load chat thread') });
    }
  },

  renameThread: async (id, title) => {
    const name = title.trim();
    if (!name) return;
    try {
      const th = await renameAIThread(id, name);
      set((s) => ({ threads: s.threads.map((t) => (t.id === id ? th : t)) }));
    } catch (e) {
      set({ error: errText(e, 'Failed to rename chat thread') });
    }
  },

  removeThread: async (id) => {
    if (get().loading) return;
    try {
      await deleteAIThread(id);
      set((s) => {
        const threads = s.threads.filter((t) => t.id !== id);
        if (s.activeThreadId !== id) return { threads };
        rememberThreadId(null);
        return { threads, activeThreadId: null, messages: [], ticket: null };
      });
    } catch (e) {
      set({ error: errText(e, 'Failed to delete chat thread') });
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().loading || get().ticket) return;
    // Bind every turn to a persisted thread so history survives reloads.
    let threadId = get().activeThreadId;
    if (!threadId) {
      try {
        const th = await createAIThread();
        threadId = th.id;
        rememberThreadId(threadId);
        set((s) => ({ threads: [th, ...s.threads], activeThreadId: threadId }));
      } catch (e) {
        set({ error: errText(e, 'Failed to create a chat thread') });
        return;
      }
    }
    const model = get().modelOverride.trim() || undefined;
    const userMsg: ChatBubble = { id: get().nextId, role: 'user', content: trimmed };
    set((s) => ({ messages: [...s.messages, userMsg], nextId: s.nextId + 1, loading: true, streaming: false, error: '' }));
    // Server holds the thread window: send only the new turn when bound.
    const history: AIChatMessage[] = [{ role: 'user', content: trimmed }];

    // Streaming fast path: render tokens incrementally, then fall back to
    // the plain JSON endpoint on any SSE failure.
    const streamId = get().nextId;
    let streamed = false;
    try {
      set((s) => ({
        messages: [...s.messages, { id: streamId, role: 'assistant', content: '' }],
        nextId: s.nextId + 1,
        streaming: true,
      }));
      const res = await streamAIChat(history, {
        threadId,
        model,
        onToken: (tok) =>
          set((s) => ({
            messages: s.messages.map((m) => (m.id === streamId ? { ...m, content: m.content + tok } : m)),
          })),
      });
      streamed = true;
      const reply = res.reply || 'The assistant returned an empty reply.';
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === streamId ? { ...m, content: reply, ticket: res.ticket } : m,
        ),
        ticket: res.ticket,
        loading: false,
        streaming: false,
      }));
      if (res.threadId) {
        rememberThreadId(res.threadId);
        set({ activeThreadId: res.threadId });
      }
      void get().refreshThreads();
    } catch (streamErr) {
      if (!streamed) {
        // Remove the empty streaming bubble before the JSON fallback.
        set((s) => ({ messages: s.messages.filter((m) => m.id !== streamId) }));
      }
      try {
        const res = await sendAIChat(history, { threadId, model });
        const reply = res.reply || 'The assistant returned an empty reply.';
        if (streamed) {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === streamId ? { ...m, content: reply, ticket: res.confirmation_ticket || null } : m,
            ),
            ticket: res.confirmation_ticket || null,
            loading: false,
            streaming: false,
          }));
        } else {
          const assistant: ChatBubble = {
            id: get().nextId,
            role: 'assistant',
            content: reply,
            ticket: res.confirmation_ticket || null,
            executed: res.executed || null,
          };
          set((s) => ({
            messages: [...s.messages, assistant],
            nextId: s.nextId + 1,
            ticket: res.confirmation_ticket || null,
            loading: false,
            streaming: false,
          }));
        }
        if (res.thread_id) {
          rememberThreadId(res.thread_id);
          set({ activeThreadId: res.thread_id });
        }
        void get().refreshThreads();
      } catch (e) {
        set((s) => ({
          loading: false,
          streaming: false,
          messages: streamed ? s.messages : s.messages.filter((m) => m.id !== streamId),
          error: errText(e, errText(streamErr, 'Failed to reach the assistant')),
        }));
      }
    }
  },

  approveTicket: async () => {
    const t = get().ticket;
    if (!t || get().actionBusy) return;
    set({ actionBusy: true, error: '' });
    try {
      const res = await approveAITicket(t.id, get().activeThreadId);
      const assistant: ChatBubble = {
        id: get().nextId,
        role: 'assistant',
        content: res.reply || 'Done.',
        executed: res.executed || null,
      };
      set((s) => ({
        messages: [...s.messages, assistant],
        nextId: s.nextId + 1,
        ticket: res.confirmation_ticket || null,
        actionBusy: false,
      }));
      void get().refreshThreads();
    } catch (e) {
      set({ actionBusy: false, error: errText(e, 'Failed to execute the approved action') });
    }
  },

  denyTicket: () => {
    const t = get().ticket;
    if (!t) return;
    const note: ChatBubble = {
      id: get().nextId,
      role: 'assistant',
      content: `Denied — "${t.summary}" was not executed. Nothing changed.`,
    };
    set((s) => ({ messages: [...s.messages, note], nextId: s.nextId + 1, ticket: null, error: '' }));
  },

  clearError: () => set({ error: '' }),
}));
